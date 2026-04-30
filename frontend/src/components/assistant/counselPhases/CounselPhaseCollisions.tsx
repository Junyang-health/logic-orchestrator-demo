import { useI18n } from "../../../i18n/useI18n";

export type CounselPhaseCollisionsProps = {
  collisionAreas: { id: string; title: string }[];
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
          {collisionAreas.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 p-2 dark:border-slate-600">
              <input
                type="checkbox"
                checked={selectedCollisionIds.has(a.id)}
                onChange={() => onToggleCollision(a.id)}
                disabled={!selectedCollisionIds.has(a.id) && selectedCollisionIds.size >= 3}
              />
              <div>
                <div className="font-medium">{a.title}</div>
              </div>
            </label>
          ))}
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
