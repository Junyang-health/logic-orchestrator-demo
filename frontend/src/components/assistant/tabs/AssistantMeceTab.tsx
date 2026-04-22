import { memo } from "react";
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
};

function AssistantMeceTabInner(props: AssistantMeceTabProps) {
  const {
    selectedNodeId,
    simBusy,
    meceScanBundle,
    meceSelectedMods,
    onToggleModification,
    meceEvidenceBundle,
    meceWebHints,
    meceWebBusyId,
    onScan,
    onEvidence,
    onWebSearchForMod,
    onApply
  } = props;

  const { t } = useI18n();

  return (
    <div className="mb-3 ios-card p-3">
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t("mece_title")}</div>
      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{t("mece_intro")}</p>
      {!selectedNodeId ? (
        <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">{t("mece_select_anchor")}</p>
      ) : null}

      <button
        type="button"
        className="mt-3 w-full ios-button-primary"
        disabled={simBusy || !selectedNodeId}
        onClick={() => void onScan()}
      >
        {simBusy && !meceScanBundle ? t("mece_scanning") : t("mece_scan")}
      </button>

      {meceScanBundle ? (
        <div className="mt-3 space-y-2 text-[10px] text-slate-700 dark:text-slate-200">
          <div className="rounded-md border border-slate-200 bg-slate-50/90 p-2 dark:border-slate-600 dark:bg-slate-900/70">
            <div className="font-semibold text-slate-800 dark:text-slate-100">{t("mece_assessment")}</div>
            <p className="mt-1">
              {t("mece_exclusivity")}{" "}
              <span className="font-mono">
                {String((meceScanBundle.mece_assessment as { mutually_exclusive?: string })?.mutually_exclusive ?? "—")}
              </span>{" "}
              · {t("mece_exhaust")}{" "}
              <span className="font-mono">
                {String((meceScanBundle.mece_assessment as { collectively_exhaustive?: string })?.collectively_exhaustive ?? "—")}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
              {String((meceScanBundle.mece_assessment as { rationale?: string })?.rationale ?? "").slice(0, 1500)}
            </p>
            <p className="mt-1 text-[9px] text-slate-500">
              {t("mece_ids", {
                n1: meceScanBundle.level1_node_ids?.length ?? 0,
                n2: meceScanBundle.level2_node_ids?.length ?? 0
              })}
            </p>
          </div>
          {meceScanBundle.gaps?.length ? (
            <div>
              <div className="text-[9px] font-semibold uppercase text-slate-500">{t("mece_gaps")}</div>
              <ul className="mt-1 list-inside list-disc text-slate-600 dark:text-slate-300">
                {meceScanBundle.gaps.map((g) => (
                  <li key={g.id}>
                    <span className="font-mono text-slate-400">{g.id}</span> ({g.severity || "medium"}) {g.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="text-[9px] font-semibold uppercase text-slate-500">{t("mece_proposed")}</div>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {meceScanBundle.proposed_modifications.map((m) => (
              <li key={m.id} className="rounded-lg border border-slate-200 bg-white/90 p-2 dark:border-slate-600 dark:bg-slate-900/80">
                <label className="flex cursor-pointer gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={meceSelectedMods.has(m.id)}
                    onChange={() => onToggleModification(m.id)}
                  />
                  <span>
                    <span className="font-mono text-[9px] text-slate-500">
                      L{m.target_level} · {m.target_node_id}
                    </span>
                    <span className="mt-0.5 block font-medium text-slate-800 dark:text-slate-100">{m.summary}</span>
                    <span className="mt-0.5 block text-slate-600 dark:text-slate-300">{m.detail || ""}</span>
                    {m.suggested_label ? (
                      <span className="mt-0.5 block text-[9px] text-sky-700 dark:text-sky-300">
                        {t("mece_suggested_label", { label: m.suggested_label })}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="w-full rounded-lg border border-sky-300 bg-sky-50 py-2 text-[11px] font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/80"
            disabled={simBusy || meceSelectedMods.size < 1}
            onClick={() => void onEvidence()}
          >
            {simBusy && meceScanBundle ? t("mece_checking") : t("mece_check_ev")}
          </button>
        </div>
      ) : null}

      {meceEvidenceBundle?.results?.length ? (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-600">
          <div className="text-[9px] font-semibold uppercase text-slate-500">{t("mece_results")}</div>
          <ul className="max-h-56 space-y-2 overflow-y-auto text-[10px]">
            {meceEvidenceBundle.results.map((r) => {
              const row = r as MeceEvidenceRow;
              return (
                <li key={row.modification_id} className="rounded-lg border border-slate-200 bg-white/90 p-2 dark:border-slate-600 dark:bg-slate-900/80">
                  <div className="font-mono text-[9px] text-slate-500">{row.modification_id}</div>
                  <div className="mt-0.5">
                    {t("mece_supported")}{" "}
                    <span className={row.supported ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"}>
                      {row.supported ? t("mece_yes") : t("mece_no")}
                    </span>{" "}
                    {t("mece_confidence")} {row.confidence || "—"}
                  </div>
                  {row.supporting_evidence && row.supporting_evidence.length > 0 ? (
                    <ul className="mt-1 list-inside list-disc text-slate-600 dark:text-slate-300">
                      {row.supporting_evidence.map((ev, i) => (
                        <li key={i}>
                          <span className="font-mono text-[9px]">{ev.source_filename}</span> — {ev.text_snippet}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[9px] text-slate-500">{t("mece_no_snippets")}</p>
                  )}
                  {row.web_search_recommended || !row.supported ? (
                    <div className="mt-2 rounded border border-amber-200 bg-amber-50/80 p-2 dark:border-amber-900/40 dark:bg-amber-950/30">
                      <div className="text-[9px] font-semibold text-amber-900 dark:text-amber-100">{t("mece_web_suggested")}</div>
                      <p className="mt-0.5 text-[9px] text-amber-900 dark:text-amber-100">
                        {row.suggested_search_query || t("mece_no_query")}
                      </p>
                      <button
                        type="button"
                        className="mt-1 rounded bg-amber-100 px-2 py-0.5 text-[9px] font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900/60 dark:text-amber-50 dark:hover:bg-amber-900"
                        disabled={!!meceWebBusyId || !(row.suggested_search_query || "").trim()}
                        onClick={() => void onWebSearchForMod(row.modification_id, row.suggested_search_query || "")}
                      >
                        {meceWebBusyId === row.modification_id ? t("mece_searching") : t("mece_tavily")}
                      </button>
                    </div>
                  ) : null}
                  {meceWebHints[row.modification_id] ? (
                    <p className="mt-1 text-[9px] text-slate-500">
                      {t("mece_web_notes", { n: meceWebHints[row.modification_id].length })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <button type="button" className="w-full ios-button-primary" disabled={simBusy || meceSelectedMods.size < 1} onClick={() => void onApply()}>
            {simBusy ? t("footer_applying") : t("mece_apply")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default memo(AssistantMeceTabInner);
