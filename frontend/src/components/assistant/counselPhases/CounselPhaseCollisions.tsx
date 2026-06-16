import { useI18n } from "../../../i18n/useI18n";

export type CounselPhaseCollisionsProps = {
  collisionAreas: { id: string; title: string; positions?: unknown[] }[];
  selectedCollisionIds: Set<string>;
  busy: boolean;
  onRunCollisions: () => void;
  onToggleCollision: (id: string) => void;
  onStartDebate: () => void;
};

export default function CounselPhaseCollisions(props: CounselPhaseCollisionsProps) {
  const { t } = useI18n();
  const { collisionAreas, selectedCollisionIds, busy, onRunCollisions, onToggleCollision, onStartDebate } = props;

  return (
    <div className="ios-card space-y-2 p-2">
      {collisionAreas.length === 0 ? (
        <button type="button" className="ios-button-primary w-full py-2" disabled={busy} onClick={() => void onRunCollisions()}>
          {t("counsel_run_collisions")}
        </button>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200/55 bg-white/45 p-3 text-[11px] text-slate-600 dark:border-slate-600/45 dark:bg-slate-900/30 dark:text-slate-300">
            Select up to 3 tension areas worth debating. Each card shows the opposing stances that will enter debate.
          </div>
          {collisionAreas.map((a) => {
            const chosen = selectedCollisionIds.has(a.id);
            const positions = Array.isArray(a.positions) ? a.positions : [];
            const severity = positions.length >= 3 ? "High tension" : positions.length === 2 ? "Clear split" : "Open question";
            return (
              <button
                key={a.id}
                type="button"
                className={[
                  "w-full rounded-xl border p-3 text-left transition",
                  chosen
                    ? "border-cyan-500/45 bg-cyan-50/40 dark:border-cyan-400/35 dark:bg-cyan-950/15"
                    : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900/30",
                  !chosen && selectedCollisionIds.size >= 3 ? "opacity-50" : ""
                ].join(" ")}
                disabled={!chosen && selectedCollisionIds.size >= 3}
                onClick={() => onToggleCollision(a.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{severity}</div>
                  </div>
                  <div className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[9px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {chosen ? "Selected" : "Pick"}
                  </div>
                </div>
                {positions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {positions.slice(0, 4).map((pos, idx) => {
                      const label = typeof pos === "object" && pos && "persona_label" in pos ? String((pos as { persona_label?: unknown }).persona_label || "") : "";
                      const stance = typeof pos === "object" && pos && "stance" in pos ? String((pos as { stance?: unknown }).stance || "") : "";
                      return (
                        <div key={idx} className="rounded-lg bg-slate-100/90 px-2 py-1 text-[10px] dark:bg-slate-800/85">
                          <span className="font-medium">{label || `Position ${idx + 1}`}</span>
                          {stance ? <span className="opacity-75">: {stance}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </button>
            );
          })}
          <button
            type="button"
            className="ios-button-primary w-full py-2"
            disabled={selectedCollisionIds.size < 1 || busy}
            onClick={onStartDebate}
          >
            {t("counsel_start_debate")}
          </button>
        </>
      )}
    </div>
  );
}
