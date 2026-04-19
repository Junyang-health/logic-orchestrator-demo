import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import useUiStore from "../../store/useUiStore";
import { combineGraphs, collectBranchSubgraph } from "../../lib/graphBranch";
import type { MindmapJson } from "../../types/mindmap";
import { REVIEW_PERSONAS } from "../../types/review";

export default function ReviewSidebarPanel(props: {
  backendBase: string;
  selectedCommentIds: string[];
  setSelectedCommentIds: React.Dispatch<React.SetStateAction<string[]>>;
  applyReviewBusy: boolean;
  setApplyReviewBusy: (v: boolean) => void;
  applyReviewError: string;
  setApplyReviewError: (v: string) => void;
}) {
  const {
    backendBase,
    selectedCommentIds,
    setSelectedCommentIds,
    applyReviewBusy,
    setApplyReviewBusy,
    applyReviewError,
    setApplyReviewError
  } = props;

  const {
    selectedNode,
    mainGraph,
    sandboxGraph,
    reviewPersona,
    setReviewPersona,
    reviewComments,
    reviewBranchRootId,
    setReviewComments,
    reviewFocusNodeId,
    setReviewFocusNodeId,
    reviewLoading,
    setReviewLoading,
    clearReviewComments,
    loadMainGraph,
    clearSandbox
  } = useUiStore(
    useShallow((s) => ({
      selectedNode: s.selectedNode,
      mainGraph: s.mainGraph,
      sandboxGraph: s.sandboxGraph,
      reviewPersona: s.reviewPersona,
      setReviewPersona: s.setReviewPersona,
      reviewComments: s.reviewComments,
      reviewBranchRootId: s.reviewBranchRootId,
      setReviewComments: s.setReviewComments,
      reviewFocusNodeId: s.reviewFocusNodeId,
      setReviewFocusNodeId: s.setReviewFocusNodeId,
      reviewLoading: s.reviewLoading,
      setReviewLoading: s.setReviewLoading,
      clearReviewComments: s.clearReviewComments,
      loadMainGraph: s.loadMainGraph,
      clearSandbox: s.clearSandbox
    }))
  );

  const [evidenceSource, setEvidenceSource] = useState<null | { filename: string; href: string }>(null);

  const toggleCommentSelection = useCallback((commentId: string) => {
    setSelectedCommentIds((prev) =>
      prev.includes(commentId) ? prev.filter((id) => id !== commentId) : [...prev, commentId]
    );
  }, []);

  useEffect(() => {
    const t = selectedNode?.type?.toString().toLowerCase();
    const md = (selectedNode?.metadata ?? {}) as Record<string, unknown>;
    const sourceFilename = (md?.source_filename ?? md?.sourceFilename ?? "").toString().trim();
    if (t !== "evidence" || !sourceFilename) {
      setEvidenceSource(null);
      return;
    }
    const projectId = localStorage.getItem("mindmap_project_id") || "";
    if (!projectId) {
      setEvidenceSource({ filename: sourceFilename, href: "" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${backendBase}/projects/${encodeURIComponent(projectId)}/files`);
        if (!res.ok) return;
        const files = (await res.json()) as Array<{ id: string; filename: string }>;
        const match = [...files]
          .reverse()
          .find((f) => (f.filename || "").toLowerCase() === sourceFilename.toLowerCase());
        if (!match) {
          if (!cancelled) setEvidenceSource({ filename: sourceFilename, href: "" });
          return;
        }
        const href = `${backendBase}/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(match.id)}`;
        if (!cancelled) setEvidenceSource({ filename: sourceFilename, href });
      } catch {
        if (!cancelled) setEvidenceSource({ filename: sourceFilename, href: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendBase, selectedNode?.id, selectedNode?.type, selectedNode?.metadata]);

  const runReviewBranch = useCallback(async () => {
    const sel = useUiStore.getState().selectedNode;
    if (!sel?.id) return;
    const combined = combineGraphs(mainGraph, sandboxGraph);
    const branch = collectBranchSubgraph(sel.id, combined);
    if (branch.nodes.length === 0) return;

    setReviewLoading(true);
    try {
      const res = await fetch(`${backendBase}/review/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: reviewPersona,
          nodes: branch.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            type: n.type,
            metadata: (n.metadata ?? {}) as Record<string, unknown>
          })),
          edges: branch.edges.map((e) => ({
            source: e.source,
            target: e.target,
            label: e.label
          }))
        })
      });
      if (!res.ok) throw new Error(`Review failed: ${res.status}`);
      const json = (await res.json()) as {
        comments: Array<{ node_id: string; text: string }>;
      };
      setReviewComments(
        json.comments.map((c) => ({ nodeId: c.node_id, text: c.text })),
        reviewPersona,
        sel.id
      );
      setSelectedCommentIds([]);
    } catch {
      // keep UI resilient if backend / LLM unavailable
    } finally {
      setReviewLoading(false);
    }
  }, [backendBase, mainGraph, sandboxGraph, reviewPersona, setReviewComments, setReviewLoading]);

  const runApplyReview = useCallback(async () => {
    const root = useUiStore.getState().reviewBranchRootId;
    const allComments = useUiStore.getState().reviewComments;
    const selected = allComments.filter((c) => selectedCommentIds.includes(c.id));
    if (!root) {
      setApplyReviewError("Run “Review branch” first so comments are tied to a branch root.");
      return;
    }
    if (selected.length === 0) {
      setApplyReviewError("Select at least one comment to apply (use the checkboxes).");
      return;
    }
    const combined = combineGraphs(mainGraph, sandboxGraph);
    if (combined.nodes.length === 0) {
      setApplyReviewError("No mindmap loaded.");
      return;
    }
    setApplyReviewBusy(true);
    setApplyReviewError("");
    try {
      const res = await fetch(`${backendBase}/review/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: reviewPersona,
          branch_root_id: root,
          full_nodes: combined.nodes,
          full_edges: combined.edges,
          comments: selected.map((c) => ({ node_id: c.nodeId, text: c.text }))
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const d = (err as { detail?: unknown }).detail;
        setApplyReviewError(
          typeof d === "string" ? d : d != null ? JSON.stringify(d) : `Apply failed (${res.status})`
        );
        return;
      }
      const data = (await res.json()) as { mindmap: MindmapJson };
      loadMainGraph(data.mindmap, { newMarks: "diff" });
      clearSandbox();
      clearReviewComments();
      setSelectedCommentIds([]);
      useUiStore.getState().setSelectedNode(null);
      setReviewFocusNodeId(null);
    } catch {
      setApplyReviewError("Network error — is the backend running?");
    } finally {
      setApplyReviewBusy(false);
    }
  }, [
    backendBase,
    mainGraph,
    sandboxGraph,
    reviewPersona,
    selectedCommentIds,
    loadMainGraph,
    clearSandbox,
    clearReviewComments,
    setReviewFocusNodeId
  ]);

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Review branch</div>
      {selectedNode?.type?.toString().toLowerCase() === "evidence" && (
        <div className="ios-card p-3 text-xs text-slate-800 dark:text-slate-100">
          <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100">Evidence source</div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300">
            Filename: <span className="font-mono">{evidenceSource?.filename || "(unknown)"}</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
            Page:{" "}
            <span className="font-mono">
              {(() => {
                const md = (selectedNode?.metadata ?? {}) as Record<string, unknown>;
                const p = md?.page_number ?? md?.pageNumber;
                return typeof p === "number" && p > 0 ? p : "—";
              })()}
            </span>
          </div>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white/70 p-2 text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Quote
            </div>
            <p className="whitespace-pre-wrap">
              {(() => {
                const md = (selectedNode?.metadata ?? {}) as Record<string, unknown>;
                return (md?.text_snippet ?? md?.textSnippet ?? "").toString() || "(no quote available)";
              })()}
            </p>
          </div>
          {evidenceSource?.href ? (
            <a
              className="mt-2 inline-flex text-[11px] font-medium text-sky-700 underline dark:text-sky-400"
              href={evidenceSource.href}
              target="_blank"
              rel="noreferrer"
            >
              Open source file
            </a>
          ) : (
            <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
              Source file not found in current project storage.
            </div>
          )}
          <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
            Tip: Make sure you selected the right Project in the Source panel.
          </div>
        </div>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-300">
        Select a node on the canvas (branch root), choose a reviewer persona, then run the scan. Comments appear as 💬
        badges on nodes; click a badge to read the critique here. Tick the comments you want merged, then use{" "}
        <span className="font-medium">Apply selected comments</span> so the model updates the branch from that subset
        only (sandbox is cleared afterward so the graph stays in sync).
      </p>
      <label className="block text-xs text-slate-700 dark:text-slate-200">
        Persona
        <select
          className="mt-1 ios-select"
          value={reviewPersona}
          onChange={(e) => setReviewPersona(e.target.value)}
        >
          {REVIEW_PERSONAS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!selectedNode?.id || reviewLoading}
          className="ios-button"
          onClick={() => runReviewBranch()}
        >
          {reviewLoading ? "Scanning…" : "Review Branch"}
        </button>
        <button
          type="button"
          className="ios-button"
          onClick={() => {
            clearReviewComments();
            setSelectedCommentIds([]);
            setApplyReviewError("");
          }}
        >
          Clear comments
        </button>
      </div>
      {reviewComments.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Comments to apply</span>
            <button
              type="button"
              className="underline"
              onClick={() => setSelectedCommentIds(reviewComments.map((c) => c.id))}
            >
              Select all
            </button>
            <button type="button" className="underline" onClick={() => setSelectedCommentIds([])}>
              Clear selection
            </button>
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white/60 p-2 dark:border-slate-700 dark:bg-slate-900/40">
            {reviewComments.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer gap-2 rounded-lg border border-transparent p-1 hover:border-slate-200 hover:bg-white/80 dark:hover:border-slate-600 dark:hover:bg-slate-800/80"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={selectedCommentIds.includes(c.id)}
                  onChange={() => toggleCommentSelection(c.id)}
                />
                <div className="min-w-0 text-[11px] text-slate-800 dark:text-slate-100">
                  <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{c.nodeId}</div>
                  <p className="mt-0.5 whitespace-pre-wrap">{c.text}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={applyReviewBusy || selectedCommentIds.length === 0 || !reviewBranchRootId}
          className="ios-button-primary"
          onClick={() => runApplyReview()}
        >
          {applyReviewBusy ? "Applying…" : "Apply selected comments"}
        </button>
      </div>
      {applyReviewError ? <p className="text-[11px] text-red-700">{applyReviewError}</p> : null}
      {!selectedNode?.id && (
        <div className="text-xs text-amber-800 dark:text-amber-200">Click a node first to set the branch root.</div>
      )}
      {reviewFocusNodeId && (
        <div className="ios-card p-3 text-xs text-slate-800 dark:text-slate-100">
          <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
            Critique — node <code className="rounded bg-white/70 px-1 py-0.5 dark:bg-slate-950/40">{reviewFocusNodeId}</code>
          </div>
          {reviewComments
            .filter((c) => c.nodeId === reviewFocusNodeId)
            .map((c) => (
              <label
                key={c.id}
                className="mb-3 flex cursor-pointer gap-2 border-b ios-divider pb-3 last:mb-0 last:border-0 last:pb-0"
              >
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={selectedCommentIds.includes(c.id)}
                  onChange={() => toggleCommentSelection(c.id)}
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{c.persona}</div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{c.text}</p>
                </div>
              </label>
            ))}
          {reviewComments.filter((c) => c.nodeId === reviewFocusNodeId).length === 0 && (
            <div className="text-slate-600 dark:text-slate-300">No comments for this node.</div>
          )}
          <button
            type="button"
            className="mt-2 text-[11px] text-slate-600 underline dark:text-slate-400"
            onClick={() => setReviewFocusNodeId(null)}
          >
            Close focus
          </button>
        </div>
      )}
      {!reviewFocusNodeId && reviewComments.length > 0 && (
        <div className="text-xs text-slate-600 dark:text-slate-300">
          {reviewComments.length} comment(s) on the map — click a 💬 badge on a node.
        </div>
      )}
    </div>
  );
}
