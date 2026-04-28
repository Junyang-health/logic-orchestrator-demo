import type { Graph, Node } from "@antv/x6";
import { AlertTriangle, ChevronDown, ChevronRight, FileWarning, MessageCircle, MoveRight, Plus, Trash2 } from "lucide-react";
import { useLayoutEffect, useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { combineGraphs } from "../lib/graphBranch";
import { addChildToParent, removeNodeFromGraph } from "../lib/mindmapCanvasOps";
import {
  getCollisionChips,
  hasExplicitCollisionMetadata,
  isMultiFileSourceContext
} from "../lib/mindmapCollisionChips";
import { countDescendantNodes } from "../lib/mindmapCollapse";
import { REVIEW_COMMENT_COUNT_DATA_KEY } from "../lib/syncReviewCommentBadges";
import useUiStore from "../store/useUiStore";

const NODE_W = 280;
const LABEL_VIEWPORT_MAX = 300;

/** Graph uses lowercase `evidence` | `inferred` (legacy graphs may still carry older type strings). */
function isEvidenceType(type?: string) {
  return (type || "").toLowerCase() === "evidence";
}

function isInferredType(type?: string) {
  const tl = (type || "").toLowerCase();
  if (tl === "evidence") return false;
  return (
    tl === "inferred" ||
    tl === "inference" ||
    tl === "insight" ||
    tl === "topic" ||
    tl === "action" ||
    tl === "root"
  );
}

function isRootHub(metadata: Record<string, unknown>) {
  const v = metadata?.is_root;
  return v === true || v === "true" || v === 1;
}

function nodeSurfaceClass(type?: string) {
  return isEvidenceType(type) ? "mm-node-surface-evidence" : "mm-node-surface-inferred";
}

/** Status rings on top of evidence vs inferred fill. */
function nodeStatusRing(status?: string, opts?: { hasFactsCollision?: boolean }) {
  if (status === "conflict")
    return "ring-2 ring-rose-200/90 dark:ring-rose-400/60";
  if (opts?.hasFactsCollision) return "ring-2 ring-violet-200/80 dark:ring-violet-400/55";
  if (status === "unstable") return "ring-2 ring-amber-200/80 dark:ring-amber-400/55";
  if (status === "draft") return "ring-1 ring-dashed ring-white/50";
  return "";
}

type CriticalPair = { label: string; value: string };

/** LLM / backend: metadata.critical_values as { label, value }[] */
function parseCriticalValues(metadata: Record<string, unknown>, valueFallback: string): CriticalPair[] {
  const raw = metadata.critical_values;
  if (!Array.isArray(raw)) return [];
  const out: CriticalPair[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const label = String(o.label ?? "").trim();
      const value = String(o.value ?? "").trim();
      if (label || value) out.push({ label: label || valueFallback, value });
    }
  }
  return out.slice(0, 8);
}

/**
 * x6-react-shape's `Wrap` injects `graph` and `node` via cloneElement.
 * Node views are rendered through a React portal, so React context from the app root does not reach here — use `props.graph`.
 */
export default function MindmapReactNode(props: { node?: Node; graph?: Graph | null }) {
  const { t, locale } = useI18n();
  const node = props.node;
  /** Live X6 graph instance (injected by @antv/x6-react-shape). */
  const graph = props.graph ?? null;
  const data = (node?.getData() ?? {}) as Record<string, unknown>;
  const id = (data.id ?? node?.id ?? "") as string;
  const setSelectedNode = useUiStore((s) => s.setSelectedNode);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const setReviewFocusNodeId = useUiStore((s) => s.setReviewFocusNodeId);
  const mainGraph = useUiStore((s) => s.mainGraph);
  const sandboxGraph = useUiStore((s) => s.sandboxGraph);
  const collapsedSubtreeRootIds = useUiStore((s) => s.collapsedSubtreeRootIds);
  const toggleCollapsedSubtree = useUiStore((s) => s.toggleCollapsedSubtree);
  const isNewHighlighted = useUiStore((s) => Boolean(id && s.newMarkedNodeIds[id]));
  const reparentingNodeId = useUiStore((s) => s.reparentingNodeId);
  const startReparent = useUiStore((s) => s.startReparent);
  const sourceFileCount = useUiStore((s) => s.sourceFiles.length);
  const projectSelectedFileIdCount = useUiStore((s) => s.projectSelectedFileIds.length);
  const [collisionOpen, setCollisionOpen] = useState<null | "logic" | "facts">(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const collisionRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const subtreeRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const riskRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<HTMLDivElement>(null);

  const label = (data.label ?? node?.attr("label/text") ?? "") as string;
  const type = (data.type ?? "") as string;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const status = (data.status ?? "firm") as string;
  const rootHub = isRootHub(metadata);
  const violationSummary = (data.violation_summary ?? "").toString().trim();
  const inferredConsequences = (data.inferred_consequences ?? "").toString().trim();
  const upstreamConflict = (data.upstream_conflict_summary ?? "").toString().trim();

  const openAssistantForBranch = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedNode({
        id,
        type,
        label,
        metadata,
        violation_summary: violationSummary || undefined,
        inferred_consequences: inferredConsequences || undefined
      });
      const st = useUiStore.getState();
      st.setAssistantActive(true);
      st.setSandboxMode(true);
      st.setAssistantOverlayOpen(true);
    },
    [id, type, label, metadata, violationSummary, inferredConsequences, setSelectedNode]
  );

  const selectPayload = useCallback(
    () => ({
      id,
      type,
      label,
      metadata,
      violation_summary: violationSummary || undefined,
      inferred_consequences: inferredConsequences || undefined
    }),
    [id, type, label, metadata, violationSummary, inferredConsequences]
  );

  const onAddChild = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!graph) return;
      addChildToParent(graph, id, {
        typeRaw: "inferred",
        label: t("new_node_default"),
        edgeLabel: "supports"
      });
    },
    [graph, id, t]
  );

  const onMoveReparent = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedNode(selectPayload());
      startReparent(id, "supports");
    },
    [id, selectPayload, setSelectedNode, startReparent]
  );

  const onDeleteNode = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!graph) return;
      if (!window.confirm(t("node_delete_confirm"))) return;
      removeNodeFromGraph(graph, id);
    },
    [graph, id, t]
  );

  const reviewCommentCount =
    typeof data[REVIEW_COMMENT_COUNT_DATA_KEY] === "number"
      ? (data[REVIEW_COMMENT_COUNT_DATA_KEY] as number)
      : 0;
  const criticalKey = JSON.stringify(metadata.critical_values ?? null);
  const criticalPairs = useMemo(
    () => parseCriticalValues(metadata, t("node_value_fallback")),
    [criticalKey, t, locale]
  );

  const combinedEdges = useMemo(
    () => combineGraphs(mainGraph, sandboxGraph).edges,
    [mainGraph, sandboxGraph]
  );
  const hasOutgoingChildren = useMemo(
    () => (id ? combinedEdges.some((e) => e.source === id) : false),
    [combinedEdges, id]
  );
  const isSubtreeCollapsed = Boolean(id && collapsedSubtreeRootIds.includes(id));
  const hiddenDescendantCount = useMemo(
    () => (isSubtreeCollapsed && id ? countDescendantNodes(id, combinedEdges) : 0),
    [isSubtreeCollapsed, id, combinedEdges]
  );

  const multiFile = useMemo(
    () => isMultiFileSourceContext(sourceFileCount, projectSelectedFileIdCount),
    [sourceFileCount, projectSelectedFileIdCount]
  );
  const collisionChips = useMemo(
    () =>
      getCollisionChips({
        status,
        violation_summary: violationSummary,
        inferred_consequences: inferredConsequences,
        upstream_conflict_summary: upstreamConflict,
        metadata
      }),
    [status, violationSummary, inferredConsequences, upstreamConflict, metadata]
  );
  const hasLogicCollisionChip = collisionChips.some((c) => c.kind === "logic");
  const hasFactsCollision = collisionChips.some((c) => c.kind === "facts");
  const showCollisionRow =
    collisionChips.length > 0 &&
    (multiFile ||
      hasExplicitCollisionMetadata(metadata) ||
      status === "conflict" ||
      status === "unstable");
  const showRiskPanel =
    (status === "conflict" ||
      (status === "unstable" && (violationSummary.length > 0 || inferredConsequences.length > 0))) &&
    !hasLogicCollisionChip;

  useLayoutEffect(() => {
    const n = props.node;
    if (!n?.isNode?.()) return;

    const riskH = riskRef.current?.offsetHeight ?? 0;
    const valuesH = valuesRef.current?.offsetHeight ?? 0;
    const collisionH = collisionRef.current?.offsetHeight ?? 0;
    const chipsH = chipsRef.current?.offsetHeight ?? 28;
    const subtreeH = subtreeRef.current?.offsetHeight ?? 0;
    const actionsH = actionsRef.current?.offsetHeight ?? 0;
    const rawLabelH = scrollRef.current?.scrollHeight ?? 0;
    const labelViewport = Math.min(LABEL_VIEWPORT_MAX, Math.max(36, rawLabelH));
    const verticalPad = 18;
    const nextH = Math.min(
      520,
      Math.max(96, riskH + valuesH + collisionH + labelViewport + chipsH + subtreeH + actionsH + verticalPad)
    );
    const cur = n.getSize();
    if (Math.abs(cur.height - nextH) > 2 || Math.abs(cur.width - NODE_W) > 2) {
      n.resize(NODE_W, nextH);
    }
  }, [
    props.node,
    label,
    status,
    violationSummary,
    inferredConsequences,
    upstreamConflict,
    rootHub,
    type,
    showRiskPanel,
    criticalPairs.length,
    reviewCommentCount,
    isNewHighlighted,
    reparentingNodeId,
    hasOutgoingChildren,
    isSubtreeCollapsed,
    hiddenDescendantCount,
    showCollisionRow,
    collisionOpen,
    hasFactsCollision
  ]);

  return (
    <div className="relative h-full w-full">
      <button
        type="button"
        className="absolute -left-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/35 bg-white/20 text-white shadow-pastel hover:bg-white/30"
        title={t("node_assistant_open")}
        onClick={openAssistantForBranch}
        aria-label={t("node_assistant_open")}
      >
        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      {reviewCommentCount > 0 ? (
        <button
          type="button"
          className="absolute -right-1 -top-1 z-10 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border border-amber-200/50 bg-amber-300/95 px-1 text-[11px] text-amber-950 shadow-pastel hover:bg-amber-200"
          title={t("node_reviewer_comments")}
          onClick={(e) => {
            e.stopPropagation();
            setReviewFocusNodeId(id);
            setActivePanel("review");
          }}
        >
          <span aria-hidden>💬</span>
          <span className="ml-0.5 font-semibold tabular-nums">{reviewCommentCount}</span>
        </button>
      ) : null}
      <div
        className={[
          `${nodeSurfaceClass(type)} flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden px-3 py-2.5`,
          nodeStatusRing(status, { hasFactsCollision }),
          reparentingNodeId === id ? "ring-2 ring-amber-200/90 dark:ring-amber-300/70" : ""
        ].join(" ")}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedNode({
            id,
            type,
            label,
            metadata,
            violation_summary: violationSummary || undefined,
            inferred_consequences: inferredConsequences || undefined
          });
          setActivePanel(isEvidenceType(type) ? "review" : "source");
        }}
      >
        {showRiskPanel ? (
          <div
            ref={riskRef}
            data-conflict-alert
            className={[
              "mb-2 shrink-0 rounded-2xl border px-2 py-1.5 text-[10px] leading-snug",
              status === "conflict"
                ? "border-rose-300/60 bg-black/30 text-rose-50"
                : "border-amber-300/50 bg-black/25 text-amber-50"
            ].join(" ")}
          >
            <div
              className={
                status === "conflict"
                  ? "font-semibold uppercase tracking-wide text-rose-100"
                  : "font-semibold uppercase tracking-wide text-amber-100"
              }
            >
              {status === "conflict" ? t("node_logic_conflict") : t("node_downstream_risk")}
            </div>
            {violationSummary ? (
              <div className="mt-1 whitespace-pre-wrap break-words text-white/95">
                {violationSummary}
              </div>
            ) : null}
            {upstreamConflict && status === "unstable" ? (
              <div className="mt-1 text-[9px] text-amber-100/90">
                <span className="font-semibold">{t("node_upstream")} </span>
                {upstreamConflict}
              </div>
            ) : null}
            {inferredConsequences ? (
              <>
                <div
                  className={
                    status === "conflict" ? "mt-2 font-semibold text-rose-100" : "mt-2 font-semibold text-amber-100"
                  }
                >
                  {t("node_inferred_consequences")}
                </div>
                <div
                  className={
                    status === "conflict"
                      ? "mt-0.5 whitespace-pre-wrap break-words text-rose-50"
                      : "mt-0.5 whitespace-pre-wrap break-words text-amber-50"
                  }
                >
                  {inferredConsequences}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {criticalPairs.length > 0 ? (
          <div
            ref={valuesRef}
            className="mb-2 shrink-0 rounded-2xl border border-white/20 bg-white/10 px-2 py-1.5 backdrop-blur-sm"
          >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-white/90">
              {t("node_critical_data")}
            </div>
            <ul className="mt-1 list-none space-y-1.5 p-0">
              {criticalPairs.map((row, i) => (
                <li key={i} className="text-[10px] leading-snug text-white/95">
                  <span className="font-semibold text-white">{row.label}:</span>{" "}
                  <span className="break-words font-medium text-white/90">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="min-h-0 max-h-[300px] min-w-0 flex-1 overflow-y-auto overflow-x-hidden text-xs font-semibold leading-snug text-white"
        >
          <span className="block whitespace-pre-wrap break-words">{label || t("node_untitled")}</span>
        </div>

        {showCollisionRow ? (
          <div
            ref={collisionRef}
            className="mt-1.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="flex flex-wrap items-center gap-1"
              title={multiFile ? t("node_collision_multisource_title") : undefined}
            >
              {collisionChips.map((c) => {
                const open = collisionOpen === c.kind;
                return (
                  <button
                    key={c.kind}
                    type="button"
                    className={[
                      "inline-flex max-w-full items-center gap-0.5 rounded-lg border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      c.kind === "logic"
                        ? "border-rose-200/50 bg-rose-500/45 text-rose-50"
                        : "border-violet-200/50 bg-violet-600/50 text-violet-50"
                    ].join(" ")}
                    aria-expanded={open}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollisionOpen((cur) => (cur === c.kind ? null : c.kind));
                    }}
                  >
                    {c.kind === "logic" ? (
                      <AlertTriangle className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                    ) : (
                      <FileWarning className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                    )}
                    {c.kind === "logic" ? t("node_collision_chip_logic") : t("node_collision_chip_facts")}
                  </button>
                );
              })}
            </div>
            {collisionOpen === "logic" && hasLogicCollisionChip ? (
              <div className="mt-1 rounded-lg border border-rose-200/40 bg-black/40 px-2 py-1.5 text-[9px] leading-snug text-rose-50">
                {collisionChips
                  .filter((x) => x.kind === "logic")
                  .map((c, i) => (
                    <p key={i} className="whitespace-pre-wrap break-words">
                      {c.summary}
                    </p>
                  ))}
                {upstreamConflict && status === "unstable" ? (
                  <p className="mt-1.5 text-[8.5px] text-rose-100/90">
                    <span className="font-semibold">{t("node_upstream")} </span>
                    {upstreamConflict}
                  </p>
                ) : null}
                {inferredConsequences ? (
                  <>
                    <p className="mt-1.5 font-semibold text-rose-100">{t("node_inferred_consequences")}</p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-rose-100/90">{inferredConsequences}</p>
                  </>
                ) : null}
              </div>
            ) : null}
            {collisionOpen === "facts" ? (
              <div className="mt-1 rounded-lg border border-violet-200/40 bg-black/40 px-2 py-1.5 text-[9px] leading-snug text-violet-50">
                {collisionChips
                  .filter((x) => x.kind === "facts")
                  .map((c, i) => (
                    <p key={i} className="whitespace-pre-wrap break-words">
                      {c.summary}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          ref={chipsRef}
          className="mt-1 flex shrink-0 flex-wrap items-center gap-2 border-t border-white/20 pt-1"
        >
          <span className="inline-flex items-center rounded-full border border-white/35 bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white">
            {rootHub && isInferredType(type) ? t("node_root_inferred") : type || t("node_type_none")}
          </span>
          {status === "conflict" ? (
            <span className="rounded-full border border-rose-200/50 bg-rose-500/50 px-2 py-0.5 text-[10px] font-semibold text-white">
              {t("node_status_conflict")}
            </span>
          ) : status === "unstable" ? (
            <span className="rounded-full border border-amber-200/50 bg-amber-400/50 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
              {t("node_status_affected")}
            </span>
          ) : (
            <span className="text-[11px] text-white/75">
              {status === "firm" ? t("type_firm") : status === "draft" ? t("type_draft") : status}
            </span>
          )}
          {isNewHighlighted ? (
            <span className="rounded-full border border-lime-200/50 bg-lime-300/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-50">
              {t("node_badge_new")}
            </span>
          ) : null}
        </div>

        {hasOutgoingChildren && id ? (
          <div
            ref={subtreeRef}
            className="mt-0.5 shrink-0 border-t border-white/20 pt-1"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/35 bg-white/12 px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-white shadow-sm hover:bg-white/22"
              title={isSubtreeCollapsed ? t("node_subtree_expand_n", { n: hiddenDescendantCount }) : t("node_subtree_fold")}
              aria-label={
                isSubtreeCollapsed
                  ? t("node_subtree_expand_n", { n: hiddenDescendantCount })
                  : t("node_subtree_fold")
              }
              aria-pressed={isSubtreeCollapsed}
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapsedSubtree(id);
              }}
            >
              {isSubtreeCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              )}
              <span>
                {isSubtreeCollapsed
                  ? t("node_subtree_expand_n", { n: hiddenDescendantCount })
                  : t("node_subtree_fold")}
              </span>
            </button>
          </div>
        ) : null}

        <div
          ref={actionsRef}
          className="mt-0.5 flex shrink-0 items-center justify-end gap-0.5 border-t border-white/20 pt-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={!graph}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white shadow-sm hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("node_add_child")}
            aria-label={t("node_add_child")}
            onClick={onAddChild}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            disabled={!graph}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white shadow-sm hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("node_move_reparent")}
            aria-label={t("node_move_reparent")}
            onClick={onMoveReparent}
          >
            <MoveRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            disabled={!graph}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200/50 bg-rose-500/30 text-rose-50 shadow-sm hover:bg-rose-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("node_delete")}
            aria-label={t("node_delete")}
            onClick={onDeleteNode}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}
