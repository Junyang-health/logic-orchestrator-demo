import { useCallback, useRef, useState } from "react";
import { HttpError, isAbortError } from "../../../lib/postJson";
import { postPptEnrichBatch, postPptReconcile, postPptSkeleton } from "../../../lib/pptFrameworkApi";
import {
  buildPptFrameworkRequestBody,
  slideFromServer,
  slidesToPptRequestPayload
} from "../../../lib/pptFrameworkShared";
import type { PptDeckStyleId, PptSlide } from "../../../lib/pptFrameworkExport";
import type { MindmapJson } from "../../../types/mindmap";
import { buildEnrichBatches } from "../../../lib/pptFrameworkBatches";
import { PPT_ENRICH_HTTP_RETRIES, PPT_ENRICH_RETRY_STATUS } from "./constants";
import type { PptChatRow, PptCustomSkillRow, PptGenPhase } from "./types";

type Translate = (key: import("../../../i18n/messages").MessageKey, vars?: Record<string, string | number>) => string;

export type PptFrameworkGenerationParams = {
  backendBase: string;
  combined: MindmapJson;
  selectedList: string[];
  intent: string;
  audience: string;
  pageCount: number;
  deckStyle: PptDeckStyleId;
  style: string;
  customSkills: PptCustomSkillRow[];
  skills: { webSearch: boolean; financialAnalyst: boolean };
  webQuery: string;
  sourceFiles: { id: string; file: File }[];
  t: Translate;
  setPptSlides: React.Dispatch<React.SetStateAction<PptSlide[]>>;
  setChatMessages: React.Dispatch<React.SetStateAction<PptChatRow[]>>;
  setReconcileNote: (s: string) => void;
  setError: (s: string) => void;
  /** Slides per enrich-batch call (1–8, server cap). */
  enrichBatchSize: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function usePptFrameworkGeneration(params: PptFrameworkGenerationParams) {
  const pRef = useRef(params);
  pRef.current = params;

  const [generateBusy, setGenerateBusy] = useState(false);
  const [genPhase, setGenPhase] = useState<PptGenPhase>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runGeneration = useCallback(async () => {
    const p = pRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const { signal } = ac;

    p.setReconcileNote("");
    setGenPhase({ kind: "skeleton" });
    setGenerateBusy(true);

    const baseBody = await buildPptFrameworkRequestBody({
      combined: p.combined,
      selectedList: p.selectedList,
      intent: p.intent,
      audience: p.audience,
      pageCount: p.pageCount,
      deckStyle: p.deckStyle,
      style: p.style,
      customSkills: p.customSkills,
      skills: p.skills,
      webQuery: p.webQuery,
      sourceFiles: p.sourceFiles,
      backendBase: p.backendBase
    });

    try {
      const skelData = await postPptSkeleton(p.backendBase, baseBody, { signal });
      let current: PptSlide[] = (skelData.slides || []).map(slideFromServer);
      p.setPptSlides(current);
      p.setChatMessages([]);

      if (current.length === 0) {
        throw new Error(p.t("ppt_err_empty_slides"));
      }

      const batches = buildEnrichBatches(current.length, p.enrichBatchSize);

      for (let b = 0; b < batches.length; b++) {
        if (signal.aborted) break;
        const indices = batches[b]!;
        setGenPhase({ kind: "enrich", batch: b + 1, batches: batches.length });
        const body = {
          ...baseBody,
          slides: slidesToPptRequestPayload(current),
          indices
        };
        const enrData = await postEnrichBatchWithHttpRetry(p.backendBase, body, signal);
        const batch = (enrData.slides || []).map(slideFromServer);
        const next = [...current];
        for (let k = 0; k < Math.min(batch.length, indices.length); k++) {
          const j = indices[k]!;
          const inc = batch[k]!;
          next[j] = {
            ...next[j]!,
            ...inc,
            id: next[j]!.id
          };
        }
        current = next;
        p.setPptSlides([...current]);
      }

      if (signal.aborted) {
        p.setError("");
        return;
      }

      setGenPhase({ kind: "reconcile" });
      const recData = await postPptReconcile(
        p.backendBase,
        {
          ...baseBody,
          slides: slidesToPptRequestPayload(current)
        },
        { signal }
      );
      p.setPptSlides((recData.slides || []).map(slideFromServer));
      p.setReconcileNote((recData.reply || "").trim());
    } catch (e) {
      if (isAbortError(e)) {
        p.setError("");
        return;
      }
      p.setError(e instanceof Error ? e.message : p.t("ppt_err_generate"));
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
      }
      setGenPhase(null);
      setGenerateBusy(false);
    }
  }, []);

  return {
    runGeneration,
    cancelGeneration,
    generateBusy,
    genPhase
  };
}

async function postEnrichBatchWithHttpRetry(
  backend: string,
  body: Parameters<typeof postPptEnrichBatch>[1],
  signal: AbortSignal
) {
  const maxAttempts = 1 + PPT_ENRICH_HTTP_RETRIES;
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await postPptEnrichBatch(backend, body, { signal });
    } catch (e) {
      last = e;
      if (isAbortError(e)) throw e;
      const isTransientHttp =
        e instanceof HttpError && (PPT_ENRICH_RETRY_STATUS as readonly number[]).includes(e.status);
      const shouldRetry = isTransientHttp && attempt < maxAttempts - 1;
      if (shouldRetry) {
        await sleep(450 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw last;
}
