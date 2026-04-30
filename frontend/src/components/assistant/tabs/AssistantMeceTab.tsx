import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { MeceEvidenceRow, MeceScanBundle } from "../assistantTypes";

export type AssistantMeceTabProps = {
  selectedNodeId: string | undefined;
  simBusy: boolean;
  meceScanBundle: MeceScanBundle | null;
  meceSelectedMods: Set<string>;
  onToggleModification: (modificationId: string) => void;
  meceEvidenceBundle: { results: MeceEvidenceRow[]; corpus_stats?: Record<string, unknown> } | null;
  meceWebHints: Record<string, string>;
  meceWebBusyId: string | null;
  onScan: () => void;
  onEvidence: () => void;
  onWebSearchForMod: (modificationId: string, query: string) => void;
  onApply: () => void;
  /** Canvas node id → current label (for diff “old” line). */
  nodeLabelById: Record<string, string>;
  onFocusCanvasNode: (nodeId: string) => void;
};

type MeceTier = "good" | "partial" | "bad";

function meceStatusTier(raw: string | undefined): MeceTier {
  const s = (raw || "").toLowerCase();
  if (!s.trim()) return "partial";
  if (/\b(yes|strong|full|high|good|complete|pass|met|excellent|clear)\b/.test(s)) return "good";
  if (/\b(no|weak|low|poor|fail|missing|none|critical|sever)\b/.test(s)) return "bad";
  if (/\b(partial|medium|moderate|mixed|limited|some|fair)\b/.test(s)) return "partial";
  return "partial";
}

/** Exhaustiveness-style gaps vs observation-style (overlap / generic). */
function gapStripeKind(g: { description: string; severity?: string }): "exhaust" | "exclus" | "neutral" {
  const d = g.description.toLowerCase();
  if (/overlap|duplicate|mutual|exclusive|double|redundan|logic|intersect|shared scope/.test(d)) return "exclus";
  if (/exhaust|missing|gap|dimension|coverage|complete|silent|orphan|under-spec|hole/.test(d)) return "exhaust";
  const sev = (g.severity || "").toLowerCase();
  if (sev === "high") return "exhaust";
  return "neutral";
}

function extractKnownNodeIds(text: string, known: Set<string>): string[] {
  const out: string[] = [];
  for (const id of known) {
    if (id && text.includes(id)) out.push(id);
  }
  return Array.from(new Set(out)).sort();
}

function formatConfidencePill(c: string | undefined): string {
  if (!c) return "—";
  const s = c.trim();
  if (/^\d+(\.\d+)?\s*%?$/.test(s)) {
    const num = s.replace(/\s*%$/, "");
    return s.includes("%") ? `${num} match` : `${num}% match`;
  }
  return s;
}

function fileKindLabel(filename: string): "PDF" | "FILE" {
  return /\.pdf$/i.test(filename || "") ? "PDF" : "FILE";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWithHighlightedIds(text: string, ids: string[]): ReactNode {
  const sorted = [...new Set(ids.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!sorted.length || !text) return text;
  try {
    const re = new RegExp(`(${sorted.map(escapeRegex).join("|")})`, "g");
    const parts = text.split(re);
    return parts.map((part, i) =>
      sorted.includes(part) ? (
        <strong key={i} className="font-semibold text-slate-900 dark:text-slate-50">
          {part}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  } catch {
    return text;
  }
}

function gapIdsForModification(
  m: { addresses_gaps?: string[]; summary: string; detail?: string },
  gaps: { id: string }[]
): string[] {
  const allowed = new Set(gaps.map((g) => g.id));
  const fromApi = (m.addresses_gaps ?? []).filter((id) => allowed.has(id));
  if (fromApi.length) return [...new Set(fromApi)];
  const blob = `${m.summary}\n${m.detail ?? ""}`;
  const found: string[] = [];
  for (const g of gaps) {
    if (blob.includes(g.id)) found.push(g.id);
  }
  return [...new Set(found)];
}

const glassSnip =
  "rounded-xl border border-white/40 bg-white/35 px-2.5 py-2 text-[10px] leading-snug shadow-sm backdrop-blur-[12px] dark:border-white/10 dark:bg-slate-950/45";

const auditPill =
  "rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] tabular-nums";

function AssistantMeceTabInner(props: AssistantMeceTabProps) {
  const {
    selectedNodeId,
    simBusy: _simBusy,
    meceScanBundle,
    meceSelectedMods,
    onToggleModification,
    meceEvidenceBundle,
    meceWebHints,
    meceWebBusyId,
    onWebSearchForMod,
    nodeLabelById,
    onFocusCanvasNode
  } = props;

  const { t } = useI18n();
  const [openModDetails, setOpenModDetails] = useState<Record<string, boolean>>({});

  const assessment = meceScanBundle?.mece_assessment as
    | { mutually_exclusive?: string; collectively_exhaustive?: string; rationale?: string }
    | undefined;

  const exclusivityTier = meceStatusTier(assessment?.mutually_exclusive);
  const exhaustTier = meceStatusTier(assessment?.collectively_exhaustive);

  const barPct = (tier: MeceTier) => (tier === "good" ? 88 : tier === "bad" ? 26 : 52);
  const meceScorePercent = Math.round((barPct(exclusivityTier) + barPct(exhaustTier)) / 2);

  const knownNodeIds = useMemo(() => {
    if (!meceScanBundle) return new Set<string>();
    return new Set([...(meceScanBundle.level1_node_ids || []), ...(meceScanBundle.level2_node_ids || [])]);
  }, [meceScanBundle]);

  const boldIdList = useMemo(() => [...knownNodeIds], [knownNodeIds]);

  const tierLabel = useCallback(
    (tier: MeceTier) =>
      tier === "good" ? t("mece_health_good") : tier === "bad" ? t("mece_health_bad") : t("mece_health_partial"),
    [t]
  );

  const tierEmoji = (tier: MeceTier) => (tier === "good" ? "🟢" : tier === "bad" ? "🔴" : "🟡");

  const gapsList = meceScanBundle?.gaps ?? [];

  return (
    <div className="mb-2 space-y-4">
      <header>
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t("mece_title")}</div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{t("mece_intro_short")}</p>
      </header>

      {!selectedNodeId ? (
        <p className="text-[10px] text-amber-700 dark:text-amber-300">{t("mece_select_anchor")}</p>
      ) : null}

      {meceScanBundle ? (
        <>
          <section className="rounded-2xl border border-slate-200/80 bg-white/50 px-3 py-3 dark:border-slate-600/50 dark:bg-slate-900/45">
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {t("mece_health_header")}
            </div>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-stretch">
              <div className="flex shrink-0 flex-row items-center justify-center gap-3 sm:flex-col sm:justify-center">
                <div
                  className="flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-full border-2 border-slate-200/90 bg-gradient-to-b from-white/90 to-slate-50/80 text-center shadow-sm dark:border-slate-600 dark:from-slate-900/90 dark:to-slate-950/80"
                  title={t("mece_score_label")}
                >
                  <span className="text-xl font-bold tabular-nums leading-none text-slate-900 dark:text-white">
                    {meceScorePercent}%
                  </span>
                  <span className="mt-1 max-w-[4rem] text-center text-[7px] font-semibold uppercase leading-tight tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    {t("mece_score_label")}
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1 grid grid-cols-1 gap-3 min-[340px]:grid-cols-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[10px] font-medium text-slate-800 dark:text-slate-100">
                    <span>{t("mece_exclusivity_bar")}</span>
                    <span className="tabular-nums">
                      {tierEmoji(exclusivityTier)} {tierLabel(exclusivityTier)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-700/80">
                    <div
                      className={[
                        "h-full rounded-full transition-[width] duration-500",
                        exclusivityTier === "good"
                          ? "bg-emerald-500"
                          : exclusivityTier === "bad"
                            ? "bg-rose-500"
                            : "bg-amber-400"
                      ].join(" ")}
                      style={{ width: `${barPct(exclusivityTier)}%` }}
                    />
                  </div>
                  {assessment?.mutually_exclusive ? (
                    <p className="mt-1 text-[9px] leading-snug text-slate-600 dark:text-slate-400">
                      {renderWithHighlightedIds(assessment.mutually_exclusive, boldIdList)}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[10px] font-medium text-slate-800 dark:text-slate-100">
                    <span>{t("mece_exhaust_bar")}</span>
                    <span className="tabular-nums">
                      {tierEmoji(exhaustTier)} {tierLabel(exhaustTier)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-700/80">
                    <div
                      className={[
                        "h-full rounded-full transition-[width] duration-500",
                        exhaustTier === "good"
                          ? "bg-emerald-500"
                          : exhaustTier === "bad"
                            ? "bg-rose-500"
                            : "bg-amber-400"
                      ].join(" ")}
                      style={{ width: `${barPct(exhaustTier)}%` }}
                    />
                  </div>
                  {assessment?.collectively_exhaustive ? (
                    <p className="mt-1 text-[9px] leading-snug text-slate-600 dark:text-slate-400">
                      {renderWithHighlightedIds(assessment.collectively_exhaustive, boldIdList)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            {assessment?.rationale ? (
              <p className="mt-3 line-clamp-4 border-t border-slate-200/70 pt-2 text-[10px] leading-relaxed text-slate-600 dark:border-slate-600/50 dark:text-slate-300">
                {renderWithHighlightedIds(assessment.rationale, boldIdList)}
              </p>
            ) : null}
            <p className="mt-2 text-[9px] text-slate-500 dark:text-slate-500">
              {t("mece_ids", {
                n1: meceScanBundle.level1_node_ids?.length ?? 0,
                n2: meceScanBundle.level2_node_ids?.length ?? 0
              })}
            </p>
          </section>

          <section>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {t("mece_critical_findings")}
            </div>
            <div className="mt-2 space-y-2">
              {gapsList.length === 0 ? (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("mece_no_gaps")}</p>
              ) : (
                gapsList.map((g) => {
                  const kind = gapStripeKind(g);
                  const isMajorExhaust = kind === "exhaust";
                  const stripe = isMajorExhaust
                    ? "border-l-[3px] border-l-rose-800 bg-rose-950/[0.04] dark:border-l-rose-600 dark:bg-rose-950/10"
                    : "border-l-[3px] border-l-slate-400 bg-slate-500/5 dark:border-l-slate-500 dark:bg-slate-950/20";
                  const kindLabel =
                    kind === "exhaust"
                      ? t("mece_finding_exhaust")
                      : kind === "exclus"
                        ? t("mece_finding_exclus")
                        : t("mece_finding_other");
                  const idsInGap = extractKnownNodeIds(g.description, knownNodeIds);
                  const gapHighlightIds = [...boldIdList, g.id];
                  return (
                    <div
                      key={g.id}
                      className={[
                        "rounded-r-xl border border-slate-200/80 py-2.5 pl-3 pr-2.5 dark:border-slate-600/50",
                        stripe
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {kindLabel}
                        </span>
                        <code className="rounded-md bg-slate-200/95 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100">
                          {g.id}
                        </code>
                      </div>
                      {idsInGap.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {idsInGap.map((nid) => (
                            <button
                              key={nid}
                              type="button"
                              className="rounded-md bg-slate-200/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-700 underline decoration-sky-500/45 underline-offset-2 hover:bg-slate-300/90 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-slate-700"
                              onClick={() => onFocusCanvasNode(nid)}
                            >
                              {nid}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-1 text-[10px] leading-snug text-slate-700 dark:text-slate-200">
                        {renderWithHighlightedIds(g.description, gapHighlightIds)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {t("mece_proposed_patch")}
            </div>
            <ul className="mt-2 space-y-2">
              {meceScanBundle.proposed_modifications.map((m) => {
                const open = Boolean(openModDetails[m.id]);
                const originalLabel = nodeLabelById[m.target_node_id] || m.target_node_id;
                const fixGaps = gapIdsForModification(m, gapsList);
                const selected = meceSelectedMods.has(m.id);
                return (
                  <li
                    key={m.id}
                    className={[
                      "overflow-hidden rounded-xl border border-slate-200/80 bg-white/50 transition-[box-shadow,border-color,background-color] duration-200 dark:border-slate-600/50 dark:bg-slate-900/50",
                      selected
                        ? "shadow-[0_0_0_1px_rgba(6,182,212,0.35),0_0_22px_rgba(6,182,212,0.14)] dark:shadow-[0_0_0_1px_rgba(34,211,238,0.28),0_0_26px_rgba(34,211,238,0.12)]"
                        : "hover:border-cyan-400/35 hover:shadow-[0_0_20px_rgba(6,182,212,0.12)] dark:hover:border-cyan-500/25 dark:hover:shadow-[0_0_24px_rgba(34,211,238,0.1)]"
                    ].join(" ")}
                  >
                    <div className="flex gap-2.5 px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-500"
                        checked={selected}
                        onChange={() => onToggleModification(m.id)}
                        aria-labelledby={`mece-mod-label-${m.id}`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
                          <div id={`mece-mod-label-${m.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                            {fixGaps.length > 0 ? (
                              fixGaps.map((gid) => (
                                <span
                                  key={gid}
                                  className="inline-flex items-center rounded border border-violet-400/40 bg-violet-500/[0.12] px-1.5 py-px font-mono text-[9px] font-medium text-violet-950 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-100"
                                  title={gid}
                                >
                                  {t("mece_patch_fixes_gap", { id: gid })}
                                </span>
                              ))
                            ) : (
                              <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </div>
                          <div className="shrink-0 text-right font-mono text-[9px] leading-tight text-slate-500 dark:text-slate-400">
                            L{m.target_level} ·{" "}
                            <button
                              type="button"
                              className="text-sky-600 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-500 dark:text-sky-400"
                              onClick={(e) => {
                                e.preventDefault();
                                onFocusCanvasNode(m.target_node_id);
                              }}
                            >
                              {m.target_node_id}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="rounded-md bg-rose-500/[0.07] px-2 py-1.5 dark:bg-rose-950/25">
                            <span className="mb-0.5 block text-[8px] font-semibold uppercase tracking-wide text-rose-800/90 dark:text-rose-200/90">
                              {t("mece_diff_old_label")}
                            </span>
                            <span className="font-mono text-[11px] leading-snug text-rose-950/80 line-through decoration-rose-400/70 dark:text-rose-100/85">
                              {originalLabel}
                            </span>
                          </div>
                          {m.suggested_label ? (
                            <div className="rounded-md border border-emerald-400/35 bg-emerald-500/[0.1] px-2 py-1.5 dark:border-emerald-500/25 dark:bg-emerald-950/30">
                              <span className="mb-0.5 block text-[8px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
                                {t("mece_diff_new_label")}
                              </span>
                              <span className="font-mono text-[11px] font-semibold leading-snug text-emerald-900 dark:text-emerald-100">
                                {m.suggested_label}
                              </span>
                            </div>
                          ) : (
                            <div className="rounded-md border border-emerald-400/35 bg-emerald-500/[0.1] px-2 py-1.5 dark:border-emerald-500/25 dark:bg-emerald-950/30">
                              <span className="mb-0.5 block text-[8px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
                                {t("mece_diff_action")}
                              </span>
                              <span className="font-mono text-[11px] font-semibold leading-snug text-emerald-900 dark:text-emerald-100">
                                {m.summary}
                              </span>
                            </div>
                          )}
                        </div>

                        {m.detail ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-[9px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenModDetails((prev) => ({ ...prev, [m.id]: !prev[m.id] }));
                            }}
                          >
                            {open ? (
                              <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
                            ) : (
                              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
                            )}
                            {t("mece_details_toggle")}
                          </button>
                        ) : null}
                        {open && m.detail ? (
                          <p className="border-l-2 border-slate-200 pl-2 text-[10px] leading-relaxed text-slate-600 dark:border-slate-600 dark:text-slate-300">
                            {renderWithHighlightedIds(m.detail, boldIdList)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : null}

      {meceEvidenceBundle?.results?.length ? (
        <section className="space-y-2 border-t border-slate-200/80 pt-3 dark:border-slate-600/50">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {t("mece_evidence_lane")}
          </div>
          <ul className="space-y-3">
            {meceEvidenceBundle.results.map((r) => {
              const row = r as MeceEvidenceRow;
              const conf = formatConfidencePill(row.confidence);
              return (
                <li
                  key={row.modification_id}
                  className="rounded-2xl border border-slate-200/70 bg-white/40 p-3 dark:border-slate-600/50 dark:bg-slate-900/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-700 underline decoration-sky-500/45 underline-offset-2 hover:bg-slate-300/90 dark:bg-slate-800 dark:text-sky-300"
                      onClick={() => {
                        const mod = meceScanBundle?.proposed_modifications.find((x) => x.id === row.modification_id);
                        if (mod) onFocusCanvasNode(mod.target_node_id);
                      }}
                    >
                      {row.modification_id}
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={[
                          auditPill,
                          row.supported
                            ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                            : "bg-rose-500/12 text-rose-900 dark:text-rose-200"
                        ].join(" ")}
                      >
                        {row.supported ? t("mece_yes") : t("mece_no")}
                      </span>
                      <span
                        className={[
                          auditPill,
                          "border border-cyan-400/40 bg-cyan-500/10 text-cyan-950 dark:border-cyan-500/35 dark:bg-cyan-500/10 dark:text-cyan-100"
                        ].join(" ")}
                      >
                        {t("mece_confidence_pill", { c: conf }).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {row.supporting_evidence && row.supporting_evidence.length > 0 ? (
                      row.supporting_evidence.map((ev, i) => {
                        const kind = fileKindLabel(ev.source_filename);
                        return (
                          <div key={i} className={glassSnip}>
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md border border-slate-300/80 bg-white/60 px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-wide text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                                [{kind}: {ev.source_filename}]
                              </span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-slate-800 dark:text-slate-100">{ev.text_snippet}</p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[9px] text-slate-500 dark:text-slate-400">{t("mece_no_snippets")}</p>
                    )}
                  </div>
                  {row.web_search_recommended || !row.supported ? (
                    <div className="mt-2 rounded-xl border border-indigo-300/30 bg-indigo-500/[0.09] px-2.5 py-2 dark:border-indigo-400/20 dark:bg-indigo-950/35">
                      <div className="flex items-center gap-1.5 text-[9px] font-semibold text-indigo-950 dark:text-indigo-100">
                        <Sparkles className="h-3 w-3 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
                        {t("mece_web_powerup")}
                      </div>
                      <p className="mt-1 text-[9px] leading-snug text-indigo-900 dark:text-indigo-100/95">
                        {row.suggested_search_query || t("mece_no_query")}
                      </p>
                      <button
                        type="button"
                        className="mt-2 rounded-lg border border-indigo-500/45 bg-transparent px-2.5 py-1 text-[9px] font-medium text-indigo-900 transition hover:bg-indigo-500/10 disabled:opacity-45 dark:border-indigo-400/50 dark:text-indigo-100 dark:hover:bg-indigo-500/15"
                        disabled={!!meceWebBusyId || !(row.suggested_search_query || "").trim()}
                        onClick={() => void onWebSearchForMod(row.modification_id, row.suggested_search_query || "")}
                      >
                        {meceWebBusyId === row.modification_id ? t("mece_searching") : t("mece_tavily")}
                      </button>
                    </div>
                  ) : null}
                  {meceWebHints[row.modification_id] ? (
                    <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                      {t("mece_web_notes", { n: meceWebHints[row.modification_id].length })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default memo(AssistantMeceTabInner);
