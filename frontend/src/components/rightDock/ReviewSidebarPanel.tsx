import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";
import { combineGraphs, collectBranchSubgraph } from "../../lib/graphBranch";
import { collectMindmapCollisions } from "../../lib/mindmapCollisionChips";
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

  const { t, locale } = useI18n();

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
      clearSandbox,
      requestCanvasCenterOnNode,
      projectId
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
      clearSandbox: s.clearSandbox,
      requestCanvasCenterOnNode: s.requestCanvasCenterOnNode,
      projectId: s.projectId
    }))
  );

  const combinedForCollisions = useMemo(
    () => combineGraphs(mainGraph, sandboxGraph),
    [mainGraph, sandboxGraph]
  );
  const collisionRows = useMemo(
    () => collectMindmapCollisions(combinedForCollisions),
    [combinedForCollisions]
  );
  const hasGraphNodes = combinedForCollisions.nodes.length > 0;

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
    const pid = (projectId || "").trim();
    if (!pid) {
      setEvidenceSource({ filename: sourceFilename, href: "" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${backendBase}/projects/${encodeURIComponent(pid)}/files`);
        if (!res.ok) return;
        const files = (await res.json()) as Array<{ id: string; filename: string }>;
        const match = [...files]
          .reverse()
          .find((f) => (f.filename || "").toLowerCase() === sourceFilename.toLowerCase());
        if (!match) {
          if (!cancelled) setEvidenceSource({ filename: sourceFilename, href: "" });
          return;
        }
        const href = `${backendBase}/projects/${encodeURIComponent(pid)}/files/${encodeURIComponent(match.id)}`;
        if (!cancelled) setEvidenceSource({ filename: sourceFilename, href });
      } catch {
        if (!cancelled) setEvidenceSource({ filename: sourceFilename, href: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendBase, projectId, selectedNode?.id, selectedNode?.type, selectedNode?.metadata]);

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
      setApplyReviewError(t("review_err_run_first"));
      return;
    }
    if (selected.length === 0) {
      setApplyReviewError(t("review_err_select_comment"));
      return;
    }
    const combined = combineGraphs(mainGraph, sandboxGraph);
    if (combined.nodes.length === 0) {
      setApplyReviewError(t("review_err_no_mindmap"));
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
      setApplyReviewError(t("err_net"));
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
    setReviewFocusNodeId,
    t,
    locale
  ]);

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("review_title")}</div>
      {selectedNode?.type?.toString().toLowerCase() === "evidence" && (
        <div className="ios-card p-3 text-xs text-slate-800 dark:text-slate-100">
          <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100">{t("review_evidence_src")}</div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300">
            {t("review_filename")} <span className="font-mono">{evidenceSource?.filename || t("review_unknown")}</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
            {t("review_page")}{" "}
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
              {t("review_quote")}
            </div>
            <p className="whitespace-pre-wrap">
              {(() => {
                const md = (selectedNode?.metadata ?? {}) as Record<string, unknown>;
                return (md?.text_snippet ?? md?.textSnippet ?? "").toString() || t("review_no_quote");
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
              {t("review_open_file")}
            </a>
          ) : (
            <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
              {t("review_file_missing")}
            </div>
          )}
          <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
            {t("review_tip_project")}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-300">{t("review_howto")}</p>
      {collisionRows.length > 0 ? (
        <div className="ios-card p-3 text-xs text-slate-800 dark:text-slate-100">
          <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
            {t("review_collisions_title")}
          </div>
          <p className="mb-2 text-[11px] text-slate-600 dark:text-slate-400">{t("review_collisions_hint")}</p>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {collisionRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-200/90 bg-white/70 p-2 text-left text-[11px] text-slate-800 hover:border-sky-300/60 hover:bg-white dark:border-slate-600/90 dark:bg-slate-900/50 dark:text-slate-100 dark:hover:border-sky-600/50"
                  onClick={() => requestCanvasCenterOnNode(row.nodeId)}
                  title={t("review_collision_center_title")}
                  aria-label={t("review_collision_center_title")}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={[
                        "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                        row.kind === "logic"
                          ? "bg-rose-200/80 text-rose-950 dark:bg-rose-900/50 dark:text-rose-100"
                          : "bg-violet-200/80 text-violet-950 dark:bg-violet-900/50 dark:text-violet-100"
                      ].join(" ")}
                    >
                      {row.kind === "logic" ? t("review_collision_badge_logic") : t("review_collision_badge_facts")}
                    </span>
                    <span className="line-clamp-1 min-w-0 font-semibold text-slate-900 dark:text-slate-50">
                      {row.nodeLabel}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-slate-600 dark:text-slate-300">
                    {row.summary}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : hasGraphNodes ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-500">{t("review_collisions_empty")}</p>
      ) : null}
      <label className="block text-xs text-slate-700 dark:text-slate-200">
        {t("review_persona")}
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
          {reviewLoading ? t("review_scan") : t("review_branch_btn")}
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
          {t("review_clear")}
        </button>
      </div>
      {reviewComments.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">{t("review_comments_apply")}</span>
            <button
              type="button"
              className="underline"
              onClick={() => setSelectedCommentIds(reviewComments.map((c) => c.id))}
            >
              {t("review_select_all")}
            </button>
            <button type="button" className="underline" onClick={() => setSelectedCommentIds([])}>
              {t("review_clear_selection")}
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
          {applyReviewBusy ? t("footer_applying") : t("review_apply_btn")}
        </button>
      </div>
      {applyReviewError ? <p className="text-[11px] text-red-700">{applyReviewError}</p> : null}
      {!selectedNode?.id && (
        <div className="text-xs text-amber-800 dark:text-amber-200">{t("review_click_node")}</div>
      )}
      {reviewFocusNodeId && (
        <div className="ios-card p-3 text-xs text-slate-800 dark:text-slate-100">
          <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
            {t("review_critique")} <code className="rounded bg-white/70 px-1 py-0.5 dark:bg-slate-950/40">{reviewFocusNodeId}</code>
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
            <div className="text-slate-600 dark:text-slate-300">{t("review_no_comments_node")}</div>
          )}
          <button
            type="button"
            className="mt-2 text-[11px] text-slate-600 underline dark:text-slate-400"
            onClick={() => setReviewFocusNodeId(null)}
          >
            {t("review_close_focus")}
          </button>
        </div>
      )}
      {!reviewFocusNodeId && reviewComments.length > 0 && (
        <div className="text-xs text-slate-600 dark:text-slate-300">
          {reviewComments.length} {t("review_comments_map")}
        </div>
      )}
    </div>
  );
}
