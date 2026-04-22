import type { Node } from "@antv/x6";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useI18n } from "../i18n/useI18n";
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

function borderClass(type?: string, isRoot?: boolean) {
  if (isEvidenceType(type)) return "border-sky-300/90 dark:border-sky-500/50";
  if (isRoot && isInferredType(type)) return "border-violet-300/90 dark:border-violet-500/50";
  if (isInferredType(type)) return "border-rose-300/80 border-dashed dark:border-rose-500/40";
  return "border-stone-200/80 dark:border-stone-600/60";
}

function surfaceClass(type?: string, isRoot?: boolean) {
  if (isEvidenceType(type)) return "bg-sky-50/90 dark:bg-sky-950/25";
  if (isRoot && isInferredType(type)) return "bg-violet-50/80 dark:bg-violet-950/25";
  if (isInferredType(type)) return "bg-rose-50/70 dark:bg-fuchsia-950/20";
  return "bg-stone-50/90 dark:bg-stone-900/50";
}

function chipClass(type?: string, isRoot?: boolean) {
  if (isEvidenceType(type)) return "border-sky-200/80 bg-sky-100/50 text-sky-800/90";
  if (isRoot && isInferredType(type)) return "border-violet-200/80 bg-violet-100/50 text-violet-800/90";
  if (isInferredType(type)) return "border-rose-200/70 bg-rose-100/40 text-rose-800/85";
  return "border-stone-200/70 bg-stone-100/50 text-stone-600";
}

function statusClass(status?: string) {
  if (status === "conflict") return "border-rose-300 ring-2 ring-rose-100/80 dark:ring-rose-900/30";
  if (status === "unstable") return "border-amber-300 ring-2 ring-amber-100/70 dark:ring-amber-900/25";
  if (status === "draft") return "border-stone-300/80 border-dashed dark:border-stone-500/50";
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

export default function MindmapReactNode(props: { node?: Node }) {
  const { t, locale } = useI18n();
  const node = props.node;
  const data = (node?.getData() ?? {}) as Record<string, unknown>;
  const id = (data.id ?? node?.id ?? "") as string;

  const setSelectedNode = useUiStore((s) => s.setSelectedNode);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const setReviewFocusNodeId = useUiStore((s) => s.setReviewFocusNodeId);
  const isNewHighlighted = useUiStore((s) => Boolean(id && s.newMarkedNodeIds[id]));

  const scrollRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
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
  const reviewCommentCount =
    typeof data[REVIEW_COMMENT_COUNT_DATA_KEY] === "number"
      ? (data[REVIEW_COMMENT_COUNT_DATA_KEY] as number)
      : 0;
  const criticalKey = JSON.stringify(metadata.critical_values ?? null);
  const criticalPairs = useMemo(
    () => parseCriticalValues(metadata, t("node_value_fallback")),
    [criticalKey, t, locale]
  );

  const showRiskPanel =
    status === "conflict" ||
    (status === "unstable" && (violationSummary.length > 0 || inferredConsequences.length > 0));

  useLayoutEffect(() => {
    const n = props.node;
    if (!n?.isNode?.()) return;

    const riskH = riskRef.current?.offsetHeight ?? 0;
    const valuesH = valuesRef.current?.offsetHeight ?? 0;
    const chipsH = chipsRef.current?.offsetHeight ?? 28;
    const rawLabelH = scrollRef.current?.scrollHeight ?? 0;
    const labelViewport = Math.min(LABEL_VIEWPORT_MAX, Math.max(36, rawLabelH));
    const verticalPad = 18;
    const nextH = Math.min(520, Math.max(96, riskH + valuesH + labelViewport + chipsH + verticalPad));
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
    isNewHighlighted
  ]);

  return (
    <div className="relative h-full w-full">
      {reviewCommentCount > 0 ? (
        <button
          type="button"
          className="absolute -right-1 -top-1 z-10 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border border-amber-200/70 bg-amber-50/90 px-1 text-[11px] shadow-pastel hover:bg-amber-100/80 dark:border-amber-500/35 dark:bg-amber-950/30 dark:hover:bg-amber-950/45"
          title={t("node_reviewer_comments")}
          onClick={(e) => {
            e.stopPropagation();
            setReviewFocusNodeId(id);
            setActivePanel("review");
          }}
        >
          <span aria-hidden>💬</span>
          <span className="ml-0.5 font-medium text-amber-800/90 dark:text-amber-100/90">{reviewCommentCount}</span>
        </button>
      ) : null}
      <div
        className={[
          "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-md border px-3 py-2 shadow-sm",
          borderClass(type, rootHub),
          surfaceClass(type, rootHub),
          statusClass(status)
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
              "mb-2 shrink-0 rounded-md border px-2 py-1.5 text-[10px] leading-snug",
              status === "conflict"
                ? "border-rose-300/80 bg-rose-50/90 text-rose-900/95 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-100/95"
                : "border-amber-300/70 bg-amber-50/85 text-amber-900/95 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100/90"
            ].join(" ")}
          >
            <div
              className={
                status === "conflict"
                  ? "font-semibold uppercase tracking-wide text-rose-700/90"
                  : "font-semibold uppercase tracking-wide text-amber-800/90"
              }
            >
              {status === "conflict" ? t("node_logic_conflict") : t("node_downstream_risk")}
            </div>
            {violationSummary ? (
              <div className="mt-1 whitespace-pre-wrap break-words text-stone-800 dark:text-stone-100">
                {violationSummary}
              </div>
            ) : null}
            {upstreamConflict && status === "unstable" ? (
              <div className="mt-1 text-[9px] text-amber-800/85">
                <span className="font-semibold">{t("node_upstream")} </span>
                {upstreamConflict}
              </div>
            ) : null}
            {inferredConsequences ? (
              <>
                <div
                  className={
                    status === "conflict" ? "mt-2 font-semibold text-rose-800/90" : "mt-2 font-semibold text-amber-900/90"
                  }
                >
                  {t("node_inferred_consequences")}
                </div>
                <div
                  className={
                    status === "conflict"
                      ? "mt-0.5 whitespace-pre-wrap break-words text-rose-900/90"
                      : "mt-0.5 whitespace-pre-wrap break-words text-amber-900/90"
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
            className="mb-2 shrink-0 rounded-md border border-emerald-200/70 bg-emerald-50/80 px-2 py-1.5 dark:border-emerald-500/35 dark:bg-emerald-950/25"
          >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-800/85 dark:text-emerald-100/90">
              {t("node_critical_data")}
            </div>
            <ul className="mt-1 list-none space-y-1.5 p-0">
              {criticalPairs.map((row, i) => (
                <li key={i} className="text-[10px] leading-snug text-emerald-900/90 dark:text-emerald-50/95">
                  <span className="font-semibold text-emerald-800/90 dark:text-emerald-100/90">{row.label}:</span>{" "}
                  <span className="break-words font-medium text-emerald-900/90 dark:text-emerald-50/95">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="min-h-0 max-h-[300px] min-w-0 flex-1 overflow-y-auto overflow-x-hidden text-xs font-semibold leading-snug text-stone-800 dark:text-stone-100"
        >
          <span className="block whitespace-pre-wrap break-words">{label || t("node_untitled")}</span>
        </div>

        <div
          ref={chipsRef}
          className="mt-1 flex shrink-0 flex-wrap items-center gap-2 border-t border-stone-200/50 pt-1 dark:border-white/10"
        >
          <span
            className={[
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              chipClass(type, rootHub)
            ].join(" ")}
          >
            {rootHub && isInferredType(type) ? t("node_root_inferred") : type || t("node_type_none")}
          </span>
          {status === "conflict" ? (
            <span className="rounded-full border border-rose-200/80 bg-rose-100/60 px-2 py-0.5 text-[10px] font-semibold text-rose-800/90">
              {t("node_status_conflict")}
            </span>
          ) : status === "unstable" ? (
            <span className="rounded-full border border-amber-200/80 bg-amber-100/60 px-2 py-0.5 text-[10px] font-semibold text-amber-800/90">
              {t("node_status_affected")}
            </span>
          ) : (
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              {status === "firm" ? t("type_firm") : status === "draft" ? t("type_draft") : status}
            </span>
          )}
          {isNewHighlighted ? (
            <span className="rounded-full border border-lime-300/80 bg-lime-100/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-800/90 dark:border-lime-500/40 dark:bg-lime-950/35 dark:text-lime-100/90">
              {t("node_badge_new")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
