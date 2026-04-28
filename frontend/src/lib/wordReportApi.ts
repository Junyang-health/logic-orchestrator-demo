import { postJson } from "./postJson";
import type { MindmapJson, MindmapNode } from "../types/mindmap";

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}

export type WordReportNodePayload = {
  id: string;
  label: string;
  type: string;
  metadata: Record<string, unknown>;
  status?: string;
  violation_summary?: string;
  inferred_consequences?: string;
};

export type WordChapter = {
  id: string;
  title: string;
  analysis_objective: string;
  analysis_logic: string;
  core_hypothesis: string;
  data_requirements: string;
  visualization_plan: string;
};

export type WordChatMessage = { role: "user" | "assistant"; content: string };

export type WordGapItem = {
  area: string;
  issue: string;
  needed_data_or_action: string;
  target_node_ids?: string[];
};

export type WordNodePromptItem = {
  node_id: string;
  node_label: string;
  prompt: string;
};

export function postWordGenerateFramework(
  backendBase: string,
  body: {
    intent: string;
    target_audience: string;
    output_locale: string;
    source_corpus: string;
    nodes: WordReportNodePayload[];
    edges: MindmapJson["edges"];
  },
  init?: RequestInit
) {
  return postJson<{ framework_selection: string; chapters: WordChapter[] }>(
    joinUrl(backendBase, "/export/word/generate-framework"),
    body,
    init
  );
}

export function postWordChatFramework(
  backendBase: string,
  body: {
    intent: string;
    target_audience: string;
    source_corpus: string;
    framework_selection: string;
    nodes: WordReportNodePayload[];
    edges: MindmapJson["edges"];
    chapters: WordChapter[];
    messages: WordChatMessage[];
    target_chapter_id: string | null;
  },
  init?: RequestInit
) {
  return postJson<{ reply: string; chapters: WordChapter[]; framework_selection: string }>(
    joinUrl(backendBase, "/export/word/chat-framework"),
    body,
    init
  );
}

export function postWordGapReview(
  backendBase: string,
  body: {
    intent: string;
    target_audience: string;
    source_corpus: string;
    nodes: WordReportNodePayload[];
    edges: MindmapJson["edges"];
    framework_selection: string;
    chapters: WordChapter[];
  },
  init?: RequestInit
) {
  return postJson<{
    sufficient: boolean;
    summary: string;
    gaps: WordGapItem[];
    assistant_completion_prompt: string;
    node_assistant_prompts: WordNodePromptItem[];
  }>(joinUrl(backendBase, "/export/word/gap-review"), body, init);
}

export function postWordFinalMarkdown(
  backendBase: string,
  body: {
    intent: string;
    target_audience: string;
    source_corpus: string;
    nodes: WordReportNodePayload[];
    edges: MindmapJson["edges"];
    framework_selection: string;
    chapters: WordChapter[];
    include_chapter_writing_prompts: boolean;
    include_visual_ideas: boolean;
  },
  init?: RequestInit
) {
  return postJson<{ markdown: string; filename: string }>(
    joinUrl(backendBase, "/export/word/final-markdown"),
    body,
    init
  );
}

export function mapNodesForWord(n: MindmapNode) {
  return {
    id: n.id,
    label: n.label,
    type: n.type,
    metadata: n.metadata ?? {},
    status: n.status,
    violation_summary: n.violation_summary,
    inferred_consequences: n.inferred_consequences
  };
}
