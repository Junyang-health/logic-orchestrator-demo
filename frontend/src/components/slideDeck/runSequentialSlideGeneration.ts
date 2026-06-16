import type { SlideBuildJobOut, SlideBuildSessionOut } from "../../lib/slideBuildApi";
import { enqueueSlideJob, getSlideBuildSession } from "../../lib/slideBuildApi";

function latestSlideGenJob(session: SlideBuildSessionOut, slideId: string): SlideBuildJobOut | null {
  const list = session.jobs
    .filter((j) => j.kind === "slide_generate" && j.slide_id === slideId)
    .sort((a, b) => b.created_at_ms - a.created_at_ms);
  return list[0] ?? null;
}

async function delay(ms: number) {
  await new Promise<void>((res) => setTimeout(res, ms));
}

async function waitForLatestSlideGeneration(
  backendBase: string,
  sessionId: string,
  slideId: string,
  signal?: AbortSignal
): Promise<SlideBuildJobOut> {
  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const sn = await getSlideBuildSession(backendBase, sessionId);
    const j = latestSlideGenJob(sn, slideId);
    if (!j) {
      await delay(400);
      continue;
    }
    if (j.status === "completed" || j.status === "failed") return j;
    await delay(500);
  }
}

export async function runSequentialSlideGeneration(opts: {
  backendBase: string;
  sessionId: string;
  slideIdsOrdered: readonly string[];
  styleNotes: string;
  onProgress: (index: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { backendBase, sessionId, slideIdsOrdered, styleNotes, onProgress, signal } = opts;
  const payload =
    typeof styleNotes === "string" && styleNotes.trim().length > 0 ? { style_notes: styleNotes.trim() } : {};

  for (let i = 0; i < slideIdsOrdered.length; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const sid = slideIdsOrdered[i]!;
    onProgress(i, slideIdsOrdered.length);

    const snap = await getSlideBuildSession(backendBase, sessionId);
    const j = latestSlideGenJob(snap, sid);
    if (j?.status === "completed") continue;
    if (j?.status === "running" || j?.status === "pending") {
      const done = await waitForLatestSlideGeneration(backendBase, sessionId, sid, signal);
      if (done.status === "failed") {
        throw new Error(done.error || "Slide generation failed");
      }
      continue;
    }
    if (j?.status === "failed") {
      throw new Error(j.error || "Slide generation failed");
    }

    await enqueueSlideJob(backendBase, sessionId, {
      kind: "slide_generate",
      slide_id: sid,
      payload
    });

    const done = await waitForLatestSlideGeneration(backendBase, sessionId, sid, signal);
    if (done.status === "failed") {
      throw new Error(done.error || "Slide generation failed");
    }
  }

  onProgress(slideIdsOrdered.length, slideIdsOrdered.length);
}
