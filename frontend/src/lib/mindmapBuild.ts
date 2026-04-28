import type { MindmapJson } from "../types/mindmap";
import type { SourceFileEntry } from "../types/sourceMaterial";

/** Minimum characters in intent / goal for a starter mindmap with no source files (matches backend). */
export const MIN_INTENT_BOOTSTRAP = 12;

export type SurveyClarificationOption = { id: string; label: string };

export type SurveyClarificationQuestion = {
  id: string;
  prompt: string;
  allow_multiple: boolean;
  options: SurveyClarificationOption[];
};

/** LLM-tailored follow-up (mostly multi-select MCQ) for level-2 branch alignment. */
export type SurveyClarificationPayload = {
  intro: string;
  clarification_note: string;
  questions: SurveyClarificationQuestion[];
  open_followup: { prompt: string; placeholder: string };
};

/** Offline / error fallback — same shape as POST /mindmap/survey-clarifications. */
export function getOfflineFallbackClarificationPayload(): SurveyClarificationPayload {
  return {
    intro: "Fine-tune how the main themes under the hub should be shaped.",
    clarification_note:
      "Using built-in questions (server unavailable). Your selections still guide level-2 branches.",
    questions: [
      {
        id: "q_level2_focus",
        prompt: "Which dimensions should dominate the main branches under the hub?",
        allow_multiple: true,
        options: [
          { id: "q1_strategy", label: "Strategy & recommendations" },
          { id: "q1_risks", label: "Risks, constraints & mitigations" },
          { id: "q1_evidence", label: "Evidence / fact base & citations" },
          { id: "q1_stakeholders", label: "Stakeholders & decisions" },
          { id: "q1_process", label: "Process, timeline & execution" },
          { id: "q1_metrics", label: "Metrics, targets & value case" }
        ]
      },
      {
        id: "q_branch_breadth",
        prompt: "How many main themes (level-2 branches) feel right under the hub?",
        allow_multiple: true,
        options: [
          { id: "q2_auto", label: "Let the model decide from the material" },
          { id: "q2_three", label: "About three focused themes" },
          { id: "q2_four_five", label: "About four to five themes" },
          { id: "q2_six", label: "Up to six if the material supports it" },
          { id: "q2_minimal", label: "As few as possible — depth over breadth" }
        ]
      },
      {
        id: "q_audience_tone",
        prompt: "Who is the primary audience for this map?",
        allow_multiple: true,
        options: [
          { id: "q3_exec", label: "Executives / board" },
          { id: "q3_legal", label: "Legal / compliance" },
          { id: "q3_technical", label: "Technical / product" },
          { id: "q3_ops", label: "Operations" },
          { id: "q3_investor", label: "Investors / finance" },
          { id: "q3_general", label: "General business reader" }
        ]
      },
      {
        id: "q_emphasis",
        prompt: "What should we emphasize vs de-emphasize in the branch labels?",
        allow_multiple: true,
        options: [
          { id: "q4_actions", label: "Concrete actions & next steps" },
          { id: "q4_diagnosis", label: "Root-cause / diagnosis" },
          { id: "q4_synopsis", label: "High-level synopsis only" },
          { id: "q4_debate", label: "Trade-offs & opposing views" },
          { id: "q4_compliance", label: "Regulatory / policy alignment" }
        ]
      }
    ],
    open_followup: {
      prompt: "Anything else we should respect when naming level-2 branches?",
      placeholder: "Optional — constraints, jargon to use or avoid…"
    }
  };
}

export async function fetchSurveyClarifications(
  backendBase: string,
  body: {
    intent: string;
    has_queued_files: boolean;
    queued_filenames: string[];
    has_stored_selection: boolean;
    stored_filenames: string[];
  }
): Promise<SurveyClarificationPayload> {
  const res = await fetch(`${backendBase}/mindmap/survey-clarifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const d = (err as { detail?: unknown }).detail;
    throw new Error(typeof d === "string" ? d : `HTTP ${res.status}`);
  }
  return (await res.json()) as SurveyClarificationPayload;
}

/** Format MCQ selections + optional open follow-up for the mindmap `intent` field. */
export function formatClarificationSurveyForIntent(
  payload: SurveyClarificationPayload,
  selections: Record<string, string[]>,
  openExtra: string
): string {
  const lines: string[] = [];
  lines.push("Follow-up structure clarifications (confirmed for level-2 branches under the hub):");
  const note = (payload.clarification_note || "").trim();
  if (note) lines.push(`Assistant clarification: ${note}`);
  for (const q of payload.questions) {
    const picked = selections[q.id] ?? [];
    const labels = picked
      .map((oid) => q.options.find((o) => o.id === oid)?.label)
      .filter((x): x is string => Boolean(x && x.trim()));
    if (labels.length === 0) {
      lines.push(`${q.prompt} — (no option selected; infer reasonably from the goal and sources)`);
    } else {
      lines.push(`${q.prompt} — selected: ${labels.join("; ")}`);
    }
  }
  const extra = openExtra.trim();
  if (extra) {
    const op = (payload.open_followup?.prompt || "Additional notes").trim();
    lines.push(`${op} — ${extra}`);
  }
  return lines.join("\n");
}

/** Combine base goal text with optional survey block for API `intent`. */
export function composeIntentForBuild(baseIntent: string, surveyBlock: string | null | undefined): string {
  const b = baseIntent.trim();
  const s = (surveyBlock || "").trim();
  if (!s) return b;
  return b ? `${b}\n\n${s}` : s;
}

export type MindmapBuildMessages = {
  netError: string;
  pickFiles: string;
  addFilesOrIntent: string;
};

export async function runMindmapBuild(opts: {
  backendBase: string;
  projectId: string;
  intent: string;
  sourceFiles: SourceFileEntry[];
  selectedStoredIds: string[];
  storedFilesCount: number;
  loadMainGraph: (g: MindmapJson) => void;
  clearSourceFiles: () => void;
  refreshStoredFiles?: () => Promise<void>;
  messages: MindmapBuildMessages;
}): Promise<{ ok: boolean; error: string }> {
  const {
    backendBase,
    projectId,
    intent,
    sourceFiles,
    selectedStoredIds,
    storedFilesCount,
    loadMainGraph,
    clearSourceFiles,
    refreshStoredFiles,
    messages
  } = opts;

  const trimmedIntent = intent.trim();
  const canGenerateFromStoredSelection =
    Boolean(projectId) && storedFilesCount > 0 && selectedStoredIds.length > 0;
  const canBootstrapFromIntent =
    trimmedIntent.length >= MIN_INTENT_BOOTSTRAP && sourceFiles.length === 0;

  if (sourceFiles.length === 0) {
    if (canGenerateFromStoredSelection) {
      try {
        const url = `${backendBase}/projects/${encodeURIComponent(projectId)}/mindmap`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: trimmedIntent || null,
            file_ids: selectedStoredIds
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const d = (err as { detail?: unknown }).detail;
          return {
            ok: false,
            error:
              typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Generate failed (${res.status})`
          };
        }
        const payload = (await res.json()) as { mindmap?: MindmapJson };
        const json = (payload?.mindmap ?? payload) as MindmapJson;
        loadMainGraph(json);
        return { ok: true, error: "" };
      } catch {
        return { ok: false, error: messages.netError };
      }
    }

    if (canBootstrapFromIntent) {
      try {
        if (projectId) {
          const url = `${backendBase}/projects/${encodeURIComponent(projectId)}/mindmap`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: trimmedIntent,
              bootstrap_without_sources: true
            })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const d = (err as { detail?: unknown }).detail;
            return {
              ok: false,
              error:
                typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Generate failed (${res.status})`
            };
          }
          const payload = (await res.json()) as { mindmap?: MindmapJson };
          const json = (payload?.mindmap ?? payload) as MindmapJson;
          loadMainGraph(json);
          return { ok: true, error: "" };
        }
        const res = await fetch(`${backendBase}/mindmap/from-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: trimmedIntent })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const d = (err as { detail?: unknown }).detail;
          return {
            ok: false,
            error:
              typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Generate failed (${res.status})`
          };
        }
        const payload = (await res.json()) as { mindmapJson?: MindmapJson; mindmap?: MindmapJson };
        const json = (payload?.mindmap ?? payload) as MindmapJson;
        loadMainGraph(json);
        return { ok: true, error: "" };
      } catch {
        return { ok: false, error: messages.netError };
      }
    }

    if (projectId && storedFilesCount > 0 && selectedStoredIds.length === 0) {
      return { ok: false, error: messages.pickFiles };
    }

    return {
      ok: false,
      error: messages.addFilesOrIntent
    };
  }

  try {
    const fd = new FormData();
    if (projectId) fd.append("project_id", projectId);
    if (trimmedIntent) fd.append("intent", trimmedIntent);
    for (const e of sourceFiles) {
      fd.append("files", e.file, e.file.name);
    }
    const res = await fetch(`${backendBase}/upload`, {
      method: "POST",
      body: fd
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const d = (err as { detail?: unknown }).detail;
      return {
        ok: false,
        error:
          typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Upload failed (${res.status})`
      };
    }
    const payload = (await res.json()) as { mindmap?: MindmapJson };
    const json = (payload?.mindmap ?? payload) as MindmapJson;
    loadMainGraph(json);
    clearSourceFiles();
    await refreshStoredFiles?.();
    return { ok: true, error: "" };
  } catch {
    return { ok: false, error: messages.netError };
  }
}
