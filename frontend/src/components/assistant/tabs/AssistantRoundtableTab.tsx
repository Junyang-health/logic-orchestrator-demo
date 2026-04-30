import { memo, useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Bookmark, ChevronDown, ChevronRight, Flame, HeartHandshake, Info, Plus, Search, Shield, X } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import { REVIEW_PERSONAS } from "../../../types/review";
import { presetRoundtableInstruction, type RoundtablePersona } from "../assistantTypes";

export type AssistantRoundtableTabProps = {
  /** When true, hide setup (title, intro, roster strip) and the persona library; roster remains in transcript header. */
  discussionStarted?: boolean;
  rtPersonas: RoundtablePersona[];
  rtLib: { name: string; instruction: string }[];
  rtNewName: string;
  setRtNewName: (v: string) => void;
  rtNewInstruction: string;
  setRtNewInstruction: (v: string) => void;
  onAddPreset: (name: string) => void;
  onAddFromLib: (name: string, instruction: string) => void;
  onRemovePersona: (id: string) => void;
  onAddCustom: () => void;
};

const MAX_ROSTER_SLOTS = 6;
const COLLAPSE_LIB_AT = 6;

const APPLE_BLUE_TINT = "rgba(0, 122, 255, 0.1)";

const PRESET_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "Skeptical Investor": Search,
  "Risk Analyst": Shield,
  "Friendly Coach": HeartHandshake,
  "Devil's Advocate": Flame
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const w = name.trim();
  return w.slice(0, 2).toUpperCase();
}

function SectionLabel({
  children,
  collapsible,
  open,
  onToggle
}: {
  children: ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const track = (
    <>
      <div className="h-px w-4 shrink-0 bg-slate-200/90 dark:bg-slate-600/70" aria-hidden />
      <span className="shrink-0 text-[8px] font-medium uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
        {children}
      </span>
      <div className="h-px min-w-[1rem] flex-1 bg-slate-200/90 dark:bg-slate-600/70" aria-hidden />
    </>
  );

  if (collapsible && onToggle) {
    return (
      <button
        type="button"
        className="mb-1.5 flex w-full min-w-0 items-center gap-1.5 py-0.5 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-slate-400">
          {open ? <ChevronDown className="h-3 w-3" strokeWidth={2} /> : <ChevronRight className="h-3 w-3" strokeWidth={2} />}
        </span>
        {track}
      </button>
    );
  }

  return (
    <div className="mb-1.5 flex min-w-0 items-center gap-1.5 py-0.5">
      <span className="w-3.5 shrink-0" aria-hidden />
      {track}
    </div>
  );
}

function AssistantRoundtableTabInner(props: AssistantRoundtableTabProps) {
  const {
    discussionStarted = false,
    rtPersonas,
    rtLib,
    rtNewName,
    setRtNewName,
    rtNewInstruction,
    setRtNewInstruction,
    onAddPreset,
    onAddFromLib,
    onRemovePersona,
    onAddCustom
  } = props;

  const { t } = useI18n();
  const [createOpen, setCreateOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(true);
  const [recommendedOpen, setRecommendedOpen] = useState(true);

  const libraryTotal = REVIEW_PERSONAS.length + rtLib.length;
  const savedCollapsible = rtLib.length >= COLLAPSE_LIB_AT;
  const recommendedCollapsible = REVIEW_PERSONAS.length >= COLLAPSE_LIB_AT;

  const presetOnPanel = useCallback(
    (name: string) =>
      rtPersonas.some(
        (p) => p.name === name && p.instruction === presetRoundtableInstruction(name)
      ),
    [rtPersonas]
  );

  const libRowOnPanel = useCallback(
    (row: { name: string; instruction: string }) =>
      rtPersonas.some((p) => p.name === row.name && p.instruction === row.instruction),
    [rtPersonas]
  );

  const presetPreview = useCallback((name: string) => presetRoundtableInstruction(name), []);

  const closeModal = useCallback(() => {
    setCreateOpen(false);
    setRtNewName("");
    setRtNewInstruction("");
  }, [setRtNewInstruction, setRtNewName]);

  const submitCreate = useCallback(() => {
    if (!rtNewName.trim() || !rtNewInstruction.trim()) return;
    onAddCustom();
    setCreateOpen(false);
  }, [onAddCustom, rtNewName, rtNewInstruction]);

  const rosterSlots = useMemo(() => {
    const slots: ({ kind: "empty" } | { kind: "persona"; p: RoundtablePersona })[] = [];
    for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
      const p = rtPersonas[i];
      if (p) slots.push({ kind: "persona", p });
      else slots.push({ kind: "empty" });
    }
    return slots;
  }, [rtPersonas]);

  const libGridClass = "grid grid-cols-2 gap-2 sm:grid-cols-4";

  return (
    <div className={discussionStarted && !createOpen ? "" : "mb-3 space-y-3"}>
      {!discussionStarted ? (
        <>
          <div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t("rt_title")}</div>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">{t("rt_intro")}</p>
          </div>

          <section className="rounded-2xl border border-slate-200/80 bg-white/60 px-2.5 py-2 dark:border-slate-600/50 dark:bg-slate-900/40">
            <div className="flex items-center gap-2">
              <div className="h-px w-4 shrink-0 bg-slate-200/90 dark:bg-slate-600/70" aria-hidden />
              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                {t("rt_roster_title")}
              </span>
              <div className="h-px min-w-[1rem] flex-1 bg-slate-200/90 dark:bg-slate-600/70" aria-hidden />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
              {rosterSlots.map((slot, idx) => {
                if (slot.kind === "empty") {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/40 dark:border-slate-600 dark:bg-slate-950/30"
                      title={t("rt_slot_empty")}
                      aria-label={t("rt_slot_empty")}
                    />
                  );
                }
                const { p } = slot;
                const ini = initialsFromName(p.name);
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={`${p.name} — ${t("rt_remove", { name: p.name })}`}
                    className="mm-rt-roster-enter group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-gradient-to-br from-sky-100/90 to-cyan-100/70 text-[10px] font-bold tracking-tight text-slate-900 shadow-sm transition hover:brightness-105 dark:border-slate-600 dark:from-sky-950/50 dark:to-cyan-950/40 dark:text-slate-50"
                    onClick={() => onRemovePersona(p.id)}
                  >
                    <span className="leading-none">{ini}</span>
                    <span className="pointer-events-none absolute -bottom-3.5 left-1/2 max-w-[4.5rem] -translate-x-1/2 truncate text-[7px] font-medium text-slate-500 opacity-0 transition group-hover:opacity-100 dark:text-slate-400">
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {rtPersonas.length === 0 ? (
              <p className="mt-1.5 text-center text-[10px] text-amber-700 dark:text-amber-300">{t("rt_add_one")}</p>
            ) : null}
          </section>
        </>
      ) : null}

      {!discussionStarted ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white/50 px-2.5 py-2 dark:border-slate-600/50 dark:bg-slate-900/35">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[8px] font-medium uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              {t("rt_library_title")}
            </span>
            <span className="text-[8px] tabular-nums tracking-wide text-slate-400 dark:text-slate-500">
              {t("rt_library_count", { n: libraryTotal })}
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <SectionLabel
                collapsible={recommendedCollapsible}
                open={recommendedOpen}
                onToggle={recommendedCollapsible ? () => setRecommendedOpen((v) => !v) : undefined}
              >
                {t("rt_recommended")}
              </SectionLabel>
              {recommendedOpen ? (
                <div className={libGridClass}>
                  {REVIEW_PERSONAS.map((pn) => {
                    const Icon = PRESET_ICONS[pn] ?? Search;
                    const on = presetOnPanel(pn);
                    const preview = presetPreview(pn);
                    return (
                      <button
                        key={pn}
                        type="button"
                        title={preview}
                        className={[
                          "group relative flex h-10 max-h-10 min-h-10 min-w-0 items-center gap-1 rounded-full border px-1.5 text-left transition",
                          on
                            ? "border-[rgba(0,122,255,0.35)] opacity-[0.52] shadow-[inset_0_0_0_1px_rgba(0,122,255,0.12)]"
                            : "border-slate-200/75 bg-white/65 hover:bg-white/90 dark:border-slate-600/70 dark:bg-slate-900/40 dark:hover:bg-slate-900/65"
                        ].join(" ")}
                        style={
                          on
                            ? {
                                backgroundColor: APPLE_BLUE_TINT
                              }
                            : undefined
                        }
                        onClick={() => onAddPreset(pn)}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-sky-700 dark:text-sky-300">
                          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-center text-[9px] font-medium leading-none text-slate-800 dark:text-slate-100">
                          {pn}
                        </span>
                        <span className="flex w-6 shrink-0 items-center justify-end gap-0.5">
                          <Info
                            className="h-3 w-3 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100 dark:text-slate-500"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span
                            className={[
                              "h-1.5 w-1.5 shrink-0 rounded-full transition",
                              on ? "bg-[#007AFF]" : "bg-transparent"
                            ].join(" ")}
                            aria-hidden
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {rtLib.length > 0 ? (
              <div>
                <SectionLabel
                  collapsible={savedCollapsible}
                  open={savedOpen}
                  onToggle={savedCollapsible ? () => setSavedOpen((v) => !v) : undefined}
                >
                  {t("rt_saved")}
                </SectionLabel>
                {savedOpen ? (
                  <div className={libGridClass}>
                    {rtLib.map((row) => {
                      const on = libRowOnPanel(row);
                      return (
                        <button
                          key={`${row.name}::${row.instruction.slice(0, 32)}`}
                          type="button"
                          title={row.instruction}
                          className={[
                            "group relative flex h-10 max-h-10 min-h-10 min-w-0 items-center gap-1 rounded-full border px-1.5 text-left transition",
                            on
                              ? "border-[rgba(0,122,255,0.35)] opacity-[0.52] shadow-[inset_0_0_0_1px_rgba(0,122,255,0.12)]"
                              : "border-slate-200/75 bg-slate-100/55 hover:bg-slate-100/85 dark:border-slate-600/70 dark:bg-slate-800/45 dark:hover:bg-slate-800/75"
                          ].join(" ")}
                          style={
                            on
                              ? {
                                  backgroundColor: APPLE_BLUE_TINT
                                }
                              : undefined
                          }
                          onClick={() => onAddFromLib(row.name, row.instruction)}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-600 dark:text-slate-300">
                            <Bookmark className="h-3.5 w-3.5" strokeWidth={2} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-center text-[9px] font-medium leading-none text-slate-800 dark:text-slate-100">
                            {row.name}
                          </span>
                          <span className="flex w-6 shrink-0 items-center justify-end gap-0.5">
                            <Info
                              className="h-3 w-3 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100 dark:text-slate-500"
                              strokeWidth={2}
                              aria-hidden
                            />
                            <span
                              className={[
                                "h-1.5 w-1.5 shrink-0 rounded-full transition",
                                on ? "bg-[#007AFF]" : "bg-transparent"
                              ].join(" ")}
                              aria-hidden
                            />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="pt-0.5 text-[8px] leading-snug text-slate-400 dark:text-slate-500">{t("rt_saved_hint")}</p>
          </div>

          <button
            type="button"
            className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-slate-300/90 bg-slate-50/50 text-[10px] font-semibold text-slate-600 transition hover:border-[rgba(0,122,255,0.45)] hover:bg-[rgba(0,122,255,0.06)] hover:text-slate-800 dark:border-slate-600 dark:bg-slate-950/25 dark:text-slate-300 dark:hover:bg-[rgba(0,122,255,0.08)] dark:hover:text-slate-100"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t("rt_create_persona")}
          </button>
        </section>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xl dark:border-slate-600 dark:bg-slate-900"
            role="dialog"
            aria-modal
            aria-labelledby="rt-create-title"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="rt-create-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("rt_create_modal_title")}
              </h2>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label={t("rt_create_cancel")}
                onClick={closeModal}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-3 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
              {t("rt_custom_name")}
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12px] text-slate-900 outline-none focus:border-cyan-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                value={rtNewName}
                onChange={(e) => setRtNewName(e.target.value)}
                placeholder={t("rt_name_ph")}
                autoFocus
              />
            </label>
            <label className="mt-3 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
              {t("rt_custom_instr")}
              <textarea
                className="mt-1 min-h-[5rem] w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-800 outline-none focus:border-cyan-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                rows={4}
                value={rtNewInstruction}
                onChange={(e) => setRtNewInstruction(e.target.value)}
                placeholder={t("rt_instr_ph")}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ios-button rounded-xl px-3 py-2 text-[11px]" onClick={closeModal}>
                {t("rt_create_cancel")}
              </button>
              <button
                type="button"
                className="ios-button-primary rounded-xl px-3 py-2 text-[11px]"
                disabled={!rtNewName.trim() || !rtNewInstruction.trim()}
                onClick={submitCreate}
              >
                {t("rt_create_submit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(AssistantRoundtableTabInner);
