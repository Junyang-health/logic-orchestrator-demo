import type { Node } from "@antv/x6";
import { useLayoutEffect, useMemo, useRef } from "react";
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
  if (isEvidenceType(type)) return "border-sky-500 dark:border-sky-400";
  if (isRoot && isInferredType(type)) return "border-violet-600 dark:border-violet-400";
  if (isInferredType(type)) return "border-fuchsia-500 border-dashed dark:border-fuchsia-400";
  return "border-slate-300 dark:border-slate-600";
}

function surfaceClass(type?: string, isRoot?: boolean) {
  if (isEvidenceType(type)) return "bg-sky-50 dark:bg-sky-950/40";
  if (isRoot && isInferredType(type)) return "bg-violet-50 dark:bg-violet-950/35";
  if (isInferredType(type)) return "bg-fuchsia-50 dark:bg-fuchsia-950/30";
  return "bg-white dark:bg-slate-900/70";
}

function chipClass(type?: string, isRoot?: boolean) {
  if (isEvidenceType(type)) return "border-sky-200 bg-sky-100/70 text-sky-900";
  if (isRoot && isInferredType(type)) return "border-violet-200 bg-violet-100/70 text-violet-900";
  if (isInferredType(type)) return "border-fuchsia-200 bg-fuchsia-100/70 text-fuchsia-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusClass(status?: string) {
  if (status === "conflict") return "border-red-600 ring-2 ring-red-200 dark:ring-red-900/40";
  if (status === "unstable") return "border-amber-500 ring-2 ring-amber-100 dark:ring-amber-900/35";
  if (status === "draft") return "border-slate-400 border-dashed dark:border-slate-500";
  return "";
}

type CriticalPair = { label: string; value: string };

/** LLM / backend: metadata.critical_values as { label, value }[] */
function parseCriticalValues(metadata: Record<string, unknown>): CriticalPair[] {
  const raw = metadata.critical_values;
  if (!Array.isArray(raw)) return [];
  const out: CriticalPair[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const label = String(o.label ?? "").trim();
      const value = String(o.value ?? "").trim();
      if (label || value) out.push({ label: label || "Value", value });
    }
  }
  return out.slice(0, 8);
}

export default function MindmapReactNode(props: { node?: Node }) {
  const setSelectedNode = useUiStore((s) => s.setSelectedNode);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const setReviewFocusNodeId = useUiStore((s) => s.setReviewFocusNodeId);
  const reviewComments = useUiStore((s) => s.reviewComments);

  const scrollRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const riskRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<HTMLDivElement>(null);

  const node = props.node;
  const data = (node?.getData() ?? {}) as Record<string, unknown>;
  const label = (data.label ?? node?.attr("label/text") ?? "") as string;
  const type = (data.type ?? "") as string;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const id = (data.id ?? node?.id ?? "") as string;
  const status = (data.status ?? "firm") as string;
  const rootHub = isRootHub(metadata);
  const violationSummary = (data.violation_summary ?? "").toString().trim();
  const inferredConsequences = (data.inferred_consequences ?? "").toString().trim();
  const upstreamConflict = (data.upstream_conflict_summary ?? "").toString().trim();
  const nodeComments = id ? reviewComments.filter((c) => c.nodeId === id) : [];
  const criticalKey = JSON.stringify(metadata.critical_values ?? null);
  const criticalPairs = useMemo(() => parseCriticalValues(metadata), [criticalKey]);

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
    nodeComments.length
  ]);

  return (
    <div className="relative h-full w-full">
      {nodeComments.length > 0 && (
        <button
          type="button"
          className="absolute -right-1 -top-1 z-10 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-1 text-[11px] shadow-sm hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
          title="Reviewer comments"
          onClick={(e) => {
            e.stopPropagation();
            setReviewFocusNodeId(id);
            setActivePanel("review");
          }}
        >
          <span aria-hidden>💬</span>
          <span className="ml-0.5 font-medium text-amber-900 dark:text-amber-100">{nodeComments.length}</span>
        </button>
      )}
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
                ? "border-red-400 bg-red-50 text-red-950 dark:border-red-500/60 dark:bg-red-950/40 dark:text-red-100"
                : "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-100"
            ].join(" ")}
          >
            <div
              className={
                status === "conflict"
                  ? "font-semibold uppercase tracking-wide text-red-800"
                  : "font-semibold uppercase tracking-wide text-amber-900"
              }
            >
              {status === "conflict" ? "Logic conflict" : "Downstream risk"}
            </div>
            {violationSummary ? (
              <div className="mt-1 whitespace-pre-wrap break-words text-slate-900 dark:text-slate-100">
                {violationSummary}
              </div>
            ) : null}
            {upstreamConflict && status === "unstable" ? (
              <div className="mt-1 text-[9px] text-amber-900/90">
                <span className="font-semibold">Upstream: </span>
                {upstreamConflict}
              </div>
            ) : null}
            {inferredConsequences ? (
              <>
                <div
                  className={
                    status === "conflict" ? "mt-2 font-semibold text-red-900" : "mt-2 font-semibold text-amber-950"
                  }
                >
                  Inferred consequences
                </div>
                <div
                  className={
                    status === "conflict"
                      ? "mt-0.5 whitespace-pre-wrap break-words text-red-950/95"
                      : "mt-0.5 whitespace-pre-wrap break-words text-amber-950/95"
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
            className="mb-2 shrink-0 rounded-md border border-emerald-300/80 bg-emerald-50 px-2 py-1.5 dark:border-emerald-500/50 dark:bg-emerald-950/35"
          >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
              Critical data
            </div>
            <ul className="mt-1 list-none space-y-1.5 p-0">
              {criticalPairs.map((row, i) => (
                <li key={i} className="text-[10px] leading-snug text-emerald-950 dark:text-emerald-50">
                  <span className="font-semibold text-emerald-900 dark:text-emerald-100">{row.label}:</span>{" "}
                  <span className="break-words font-medium text-emerald-950 dark:text-emerald-50">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="min-h-0 max-h-[300px] min-w-0 flex-1 overflow-y-auto overflow-x-hidden text-xs font-semibold leading-snug text-slate-900 dark:text-slate-100"
        >
          <span className="block whitespace-pre-wrap break-words">{label || "(untitled)"}</span>
        </div>

        <div
          ref={chipsRef}
          className="mt-1 flex shrink-0 flex-wrap items-center gap-2 border-t border-black/5 pt-1 dark:border-white/10"
        >
          <span
            className={[
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              chipClass(type, rootHub)
            ].join(" ")}
          >
            {rootHub && isInferredType(type) ? "root · inferred" : type || "type: (none)"}
          </span>
          {status === "conflict" ? (
            <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
              conflict
            </span>
          ) : status === "unstable" ? (
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
              affected
            </span>
          ) : (
            <span className="text-[11px] text-slate-600 dark:text-slate-300">{status}</span>
          )}
        </div>
      </div>
    </div>
  );
}
