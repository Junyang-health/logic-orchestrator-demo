import { mindmapBranchSelectionToMarkdown } from "./mindmapMarkdown";
import { type PptDeckStyleId, type PptSlide, readSourceFileSnippets } from "./pptFrameworkExport";
import { postSourceExtractText } from "./sourceExtractApi";
import type { MindmapJson } from "../types/mindmap";

export type PptSlideJson = {
  id: string;
  title: string;
  subtitle: string;
  main: string;
  visual?: string;
  beat?: string;
};

/** Body shared by skeleton, enrich-batch, reconcile, and (with extra fields) chat. */
export type PptFrameworkRequestBody = {
  mindmap_markdown: string;
  source_snippets: { name: string; text: string }[];
  intent: string;
  audience: string;
  page_count: number;
  deck_style: PptDeckStyleId;
  style: string;
  custom_skills: { name: string; instruction: string; enabled: boolean }[];
  builtin_skills: { webSearch: boolean; financialAnalyst: boolean };
  web_search_query: string | null;
};

export function newPptSlideId(): string {
  return `ppt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function slideFromServer(s: PptSlideJson): PptSlide {
  return {
    id: s.id || newPptSlideId(),
    title: s.title,
    subtitle: s.subtitle,
    beat: typeof s.beat === "string" ? s.beat : "",
    main: s.main,
    visual: typeof s.visual === "string" ? s.visual : ""
  };
}

export type PptSlideRequestPayload = {
  id: string;
  title: string;
  subtitle: string;
  beat: string;
  main: string;
  visual: string;
};

export function slidesToPptRequestPayload(slides: PptSlide[]): PptSlideRequestPayload[] {
  return slides.map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    beat: s.beat,
    main: s.main,
    visual: s.visual
  }));
}

const PPT_SOURCE_SNIPPET_MAX = 80_000;

async function buildSourceSnippetsForPpt(
  backendBase: string,
  sourceFiles: { id: string; file: File }[]
): Promise<{ name: string; text: string }[]> {
  if (sourceFiles.length === 0) return [];
  const clientFallback = await readSourceFileSnippets(sourceFiles);
  try {
    const files = sourceFiles.map((e) => e.file);
    const server = await postSourceExtractText(backendBase, files);
    return sourceFiles.map((e, i) => {
      const s = server[i];
      if (s?.markdown && !s.error) {
        const raw = s.markdown;
        const text =
          raw.length > PPT_SOURCE_SNIPPET_MAX
            ? raw.slice(0, PPT_SOURCE_SNIPPET_MAX) + "\n…(truncated)"
            : raw;
        return { name: e.file.name, text };
      }
      return clientFallback[i] ?? { name: e.file.name, text: "" };
    });
  } catch {
    return clientFallback;
  }
}

export async function buildPptFrameworkRequestBody(args: {
  combined: MindmapJson;
  selectedList: string[];
  intent: string;
  audience: string;
  pageCount: number;
  deckStyle: PptDeckStyleId;
  style: string;
  customSkills: { name: string; instruction: string; enabled: boolean }[];
  skills: { webSearch: boolean; financialAnalyst: boolean };
  webQuery: string;
  sourceFiles: { id: string; file: File }[];
  /** Used for MarkItDown (`POST /source/extract-text`); must match PPT API origin. */
  backendBase: string;
}): Promise<PptFrameworkRequestBody> {
  const mindmap_markdown = mindmapBranchSelectionToMarkdown(args.combined, args.selectedList);
  let source_snippets: { name: string; text: string }[] = [];
  try {
    source_snippets = await buildSourceSnippetsForPpt(args.backendBase, args.sourceFiles);
  } catch {
    try {
      source_snippets = await readSourceFileSnippets(args.sourceFiles);
    } catch {
      source_snippets = [];
    }
  }
  return {
    mindmap_markdown,
    source_snippets,
    intent: args.intent.trim(),
    audience: args.audience.trim(),
    page_count: args.pageCount,
    deck_style: args.deckStyle,
    style: args.style.trim(),
    custom_skills: args.customSkills
      .filter((s) => s.enabled && s.instruction.trim().length > 0)
      .map((s) => ({ name: s.name, instruction: s.instruction, enabled: true })),
    builtin_skills: {
      webSearch: args.skills.webSearch,
      financialAnalyst: args.skills.financialAnalyst
    },
    web_search_query: args.skills.webSearch ? args.webQuery.trim() || null : null
  };
}
