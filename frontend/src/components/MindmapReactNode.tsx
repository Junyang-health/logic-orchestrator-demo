import type { Graph, Node } from "@antv/x6";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  FileWarning,
  MoveRight,
  Plus,
  Trash2
} from "lucide-react";
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
const NODE_MIN_H = 40;
/** Extra px so X6 `foreignObject` height clears content (rounding) and hover action row stays inside the rounded card. */
const NODE_MEASURE_SLACK = 28;

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

function nodeStatusRing(status?: string, opts?: { hasFactsCollision?: boolean }) {
  if (status === "conflict")
    return "ring-2 ring-rose-200/90 dark:ring-rose-400/60";
  if (opts?.hasFactsCollision) return "ring-2 ring-violet-200/80 dark:ring-violet-400/55";
  if (status === "unstable") return "ring-2 ring-amber-200/80 dark:ring-amber-400/55";
  if (status === "draft") return "ring-1 ring-dashed ring-slate-300 dark:ring-white/50";
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
  const selectedNodeId = useUiStore((s) => s.selectedNode?.id ?? null);
  const [collisionOpen, setCollisionOpen] = useState<null | "logic" | "facts">(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const collisionRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
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

  const idDisplay =
    id.length > 13 ? `${id.slice(0, 11)}…` : id;
  const isCanvasSelected = Boolean(id && selectedNodeId === id);

  useLayoutEffect(() => {
    const n = props.node;
    if (!n?.isNode?.()) return;
    const el = surfaceRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const actionsEl = actionsRef.current;
    let h = Math.ceil(rect.height);
    if (actionsEl) {
      const ab = actionsEl.getBoundingClientRect().bottom;
      h = Math.max(h, Math.ceil(ab - rect.top));
    }
    const nextH = Math.min(520, Math.max(NODE_MIN_H, h + NODE_MEASURE_SLACK));
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
    hasFactsCollision,
    isCanvasSelected
  ]);

  return (
    <div className="group/mmnode flex h-full min-h-0 w-full flex-col justify-start">
      <div
        ref={surfaceRef}
        className={[
          `mm-node-surface relative flex w-full min-w-0 flex-col self-start overflow-hidden px-4 pb-6 pt-5`,
          isEvidenceType(type) ? "mm-node-kind-evidence" : "",
          rootHub ? "mm-node-root-hub" : "",
          isCanvasSelected ? "ring-2 ring-[color-mix(in_srgb,var(--mm-accent)_58%,transparent)]" : "",
          nodeStatusRing(status, { hasFactsCollision }),
          reparentingNodeId === id ? "ring-2 ring-amber-200/90 dark:ring-amber-300/70" : ""
        ]
          .filter(Boolean)
          .join(" ")}
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
        <button
          type="button"
          className={[
            "absolute left-1 top-3 z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 opacity-65 transition-[opacity,background-color] hover:bg-black/[0.06] hover:opacity-100 dark:hover:bg-white/[0.08] group-hover/mmnode:opacity-95",
            isEvidenceType(type)
              ? "text-[var(--mm-node-rail-evidence)]"
              : "text-[var(--mm-node-rail-inferred)]"
          ].join(" ")}
          title={t("node_assistant_open")}
          aria-label={t("node_assistant_open")}
          onClick={(e) => {
            e.stopPropagation();
            openAssistantForBranch(e);
          }}
        >
          <Bot className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </button>
        {reviewCommentCount > 0 ? (
          <button
            type="button"
            className="absolute right-3.5 top-4 z-10 flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-amber-200/40 bg-amber-200/25 px-0.5 text-[9px] font-medium tabular-nums text-amber-900 opacity-90 hover:opacity-100 dark:border-amber-400/25 dark:bg-amber-400/12 dark:text-amber-100"
            title={t("node_reviewer_comments")}
            onClick={(e) => {
              e.stopPropagation();
              setReviewFocusNodeId(id);
              setActivePanel("review");
            }}
          >
            <span aria-hidden>💬</span>
            <span className="ml-0.5">{reviewCommentCount}</span>
          </button>
        ) : null}

        {showRiskPanel ? (
          <div
            ref={riskRef}
            data-conflict-alert
            className={[
              "mb-1.5 shrink-0 rounded-xl border px-2.5 py-1.5 text-[11px] leading-snug",
              status === "conflict"
                ? "border-rose-200 bg-rose-50/95 text-rose-900 dark:border-rose-300/60 dark:bg-black/30 dark:text-rose-50"
                : "border-amber-200 bg-amber-50/95 text-amber-900 dark:border-amber-300/50 dark:bg-black/25 dark:text-amber-50"
            ].join(" ")}
          >
            <div
              className={
                status === "conflict"
                  ? "font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-100"
                  : "font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-100"
              }
            >
              {status === "conflict" ? t("node_logic_conflict") : t("node_downstream_risk")}
            </div>
            {violationSummary ? (
              <div className="mt-1 whitespace-pre-wrap break-words normal-case text-rose-900/95 dark:text-rose-50/95">
                {violationSummary}
              </div>
            ) : null}
            {upstreamConflict && status === "unstable" ? (
              <div className="mt-1 text-[8px] normal-case text-amber-800/90 dark:text-amber-100/90">
                <span className="font-semibold">{t("node_upstream")} </span>
                {upstreamConflict}
              </div>
            ) : null}
            {inferredConsequences ? (
              <>
                <div
                  className={
                    status === "conflict"
                      ? "mt-1.5 font-semibold text-rose-800 dark:text-rose-100"
                      : "mt-1.5 font-semibold text-amber-800 dark:text-amber-100"
                  }
                >
                  {t("node_inferred_consequences")}
                </div>
                <div
                  className={
                    status === "conflict"
                      ? "mt-0.5 whitespace-pre-wrap break-words normal-case text-rose-900 dark:text-rose-50"
                      : "mt-0.5 whitespace-pre-wrap break-words normal-case text-amber-900 dark:text-amber-50"
                  }
                >
                  {inferredConsequences}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div
          className={["flex shrink-0 items-start gap-1.5 pl-9", reviewCommentCount > 0 ? "pr-10" : "pr-2"].join(" ")}
        >
          <div
            ref={scrollRef}
            className="min-w-0 flex-1 overflow-hidden py-1.5 text-[15px] font-medium leading-[1.55] tracking-tight text-[var(--mm-node-text)] [overflow-wrap:anywhere]"
          >
            <span className="block whitespace-pre-wrap break-words">{label || t("node_untitled")}</span>
          </div>
          {hasOutgoingChildren && id ? (
            <button
              type="button"
              className="mt-0.5 shrink-0 rounded-md p-0.5 text-[var(--mm-node-text-muted)] opacity-50 transition hover:bg-black/[0.04] hover:opacity-100 dark:hover:bg-white/[0.06]"
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
                <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              )}
            </button>
          ) : null}
        </div>

        <div ref={chipsRef} className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 pl-9 pr-2 text-left">
          <span className="mm-node-meta-muted max-w-[7.5rem] shrink-0 truncate tabular-nums" title={id}>
            {idDisplay}
          </span>
          <span className="mm-node-meta-muted select-none opacity-50" aria-hidden>
            ·
          </span>
          {isEvidenceType(type) ? (
            <span className="shrink-0 rounded-full bg-emerald-500/[0.14] px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
              {type || t("node_type_none")}
            </span>
          ) : (
            <span className="mm-node-meta-muted shrink-0">
              {rootHub && isInferredType(type) ? t("node_root_inferred") : type || t("node_type_none")}
            </span>
          )}
          {status === "conflict" ? (
            <span className="shrink-0 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              {t("node_status_conflict")}
            </span>
          ) : status === "unstable" ? (
            <span className="shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              {t("node_status_affected")}
            </span>
          ) : (
            <span className="mm-node-meta-muted shrink-0 tabular-nums">
              {status === "firm" ? t("type_firm") : status === "draft" ? t("type_draft") : status}
            </span>
          )}
          {isNewHighlighted ? (
            <>
              <span className="mm-node-meta-muted select-none opacity-50" aria-hidden>
                ·
              </span>
              <span
                role="status"
                title={t("node_badge_new_tooltip")}
                className="mm-node-badge-new shrink-0"
              >
                {t("node_badge_new")}
              </span>
            </>
          ) : null}
        </div>

        {criticalPairs.length > 0 ? (
          <div
            ref={valuesRef}
            className="mt-2 shrink-0 border-t border-[var(--mm-node-divider)] pt-1.5 text-left"
          >
            <div className="mm-node-meta-muted text-[10px] font-semibold uppercase tracking-wide">
              {t("node_critical_data")}
            </div>
            <ul className="mt-1 list-none space-y-1 p-0">
              {criticalPairs.map((row, i) => (
                <li key={i} className="text-xs leading-relaxed text-[var(--mm-node-text)]">
                  <span className="mm-node-meta-muted font-medium">{row.label}:</span>{" "}
                  <span className="break-words font-normal text-[var(--mm-node-text)]">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

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
                      "mm-hud-mono inline-flex max-w-full items-center gap-0.5 rounded border px-1 py-px text-[8px] font-bold uppercase tracking-wide",
                      c.kind === "logic"
                        ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-200/50 dark:bg-rose-500/45 dark:text-rose-50"
                        : "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-200/50 dark:bg-violet-600/50 dark:text-violet-50"
                    ].join(" ")}
                    aria-expanded={open}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollisionOpen((cur) => (cur === c.kind ? null : c.kind));
                    }}
                  >
                    {c.kind === "logic" ? (
                      <AlertTriangle className="h-2.5 w-2.5 shrink-0 opacity-90" aria-hidden />
                    ) : (
                      <FileWarning className="h-2.5 w-2.5 shrink-0 opacity-90" aria-hidden />
                    )}
                    {c.kind === "logic" ? t("node_collision_chip_logic") : t("node_collision_chip_facts")}
                  </button>
                );
              })}
            </div>
            {collisionOpen === "logic" && hasLogicCollisionChip ? (
              <div className="mm-hud-mono mt-1 rounded border border-rose-200 bg-rose-50/95 px-2 py-1 text-[8px] leading-snug text-rose-900 dark:border-rose-200/40 dark:bg-black/40 dark:text-rose-50">
                {collisionChips
                  .filter((x) => x.kind === "logic")
                  .map((c, i) => (
                    <p key={i} className="whitespace-pre-wrap break-words normal-case">
                      {c.summary}
                    </p>
                  ))}
                {upstreamConflict && status === "unstable" ? (
                  <p className="mt-1 text-[8px] normal-case text-rose-800/90 dark:text-rose-100/90">
                    <span className="font-semibold">{t("node_upstream")} </span>
                    {upstreamConflict}
                  </p>
                ) : null}
                {inferredConsequences ? (
                  <>
                    <p className="mt-1 font-semibold normal-case text-rose-800 dark:text-rose-100">
                      {t("node_inferred_consequences")}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words normal-case text-rose-900/90 dark:text-rose-100/90">
                      {inferredConsequences}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
            {collisionOpen === "facts" ? (
              <div className="mm-hud-mono mt-1 rounded border border-violet-200 bg-violet-50/95 px-2 py-1 text-[8px] leading-snug text-violet-900 dark:border-violet-200/40 dark:bg-black/40 dark:text-violet-50">
                {collisionChips
                  .filter((x) => x.kind === "facts")
                  .map((c, i) => (
                    <p key={i} className="whitespace-pre-wrap break-words normal-case">
                      {c.summary}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          ref={actionsRef}
          className="mt-1.5 flex min-h-[1.75rem] shrink-0 items-center justify-end gap-0.5 pr-1 opacity-0 transition-opacity duration-150 pointer-events-none group-hover/mmnode:pointer-events-auto group-hover/mmnode:opacity-100 group-focus-within/mmnode:pointer-events-auto group-focus-within/mmnode:opacity-100"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={!graph}
            className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--mm-node-border-outer)] bg-white/25 text-[var(--mm-node-text)] shadow-sm hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
            title={t("node_add_child")}
            aria-label={t("node_add_child")}
            onClick={onAddChild}
          >
            <Plus className="h-3 w-3" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            disabled={!graph}
            className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--mm-node-border-outer)] bg-white/25 text-[var(--mm-node-text)] shadow-sm hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
            title={t("node_move_reparent")}
            aria-label={t("node_move_reparent")}
            onClick={onMoveReparent}
          >
            <MoveRight className="h-3 w-3" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            disabled={!graph}
            className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-rose-300/35 bg-rose-500/[0.12] text-rose-700 shadow-sm hover:bg-rose-500/[0.2] disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-400/25 dark:bg-rose-500/20 dark:text-rose-200 dark:hover:bg-rose-500/30"
            title={t("node_delete")}
            aria-label={t("node_delete")}
            onClick={onDeleteNode}
          >
            <Trash2 className="h-3 w-3" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}
