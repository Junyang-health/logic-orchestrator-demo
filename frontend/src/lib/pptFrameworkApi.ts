import { postJson } from "./postJson";
import type {
  PptFrameworkRequestBody,
  PptSlideJson,
  PptSlideRequestPayload
} from "./pptFrameworkShared";

export type PptFrameworkGenerateResponse = { slides: PptSlideJson[] };

export type PptReconcileResponse = { reply: string; slides: PptSlideJson[] };

export type PptChatResponse = { reply: string; slides: PptSlideJson[] };

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}

export function postPptSkeleton(
  backendBase: string,
  body: PptFrameworkRequestBody,
  init?: RequestInit
) {
  return postJson<PptFrameworkGenerateResponse>(
    joinUrl(backendBase, "/assistant/ppt-framework/skeleton"),
    body,
    init
  );
}

export function postPptEnrichBatch(
  backendBase: string,
  body: PptFrameworkRequestBody & { slides: PptSlideRequestPayload[]; indices: number[] },
  init?: RequestInit
) {
  return postJson<PptFrameworkGenerateResponse>(
    joinUrl(backendBase, "/assistant/ppt-framework/enrich-batch"),
    body,
    init
  );
}

export function postPptReconcile(
  backendBase: string,
  body: PptFrameworkRequestBody & { slides: PptSlideRequestPayload[] },
  init?: RequestInit
) {
  return postJson<PptReconcileResponse>(joinUrl(backendBase, "/assistant/ppt-framework/reconcile"), body, init);
}

export type PptChatRequestBody = PptFrameworkRequestBody & {
  messages: { role: "user" | "assistant"; content: string }[];
  slides: PptSlideRequestPayload[];
  target_slide_index: number | null;
};

export function postPptChat(backendBase: string, body: PptChatRequestBody, init?: RequestInit) {
  return postJson<PptChatResponse>(joinUrl(backendBase, "/assistant/ppt-framework/chat"), body, init);
}
