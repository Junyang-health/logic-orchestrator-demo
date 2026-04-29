import type { AssistantPanelMode } from "./assistantPanelMode";

type Props = {
  mode: AssistantPanelMode;
  onModeChange: (m: AssistantPanelMode) => void;
  labels: {
    chat: string;
    optimism: string;
    blackSwan: string;
    mece: string;
    roundtable: string;
    counsel: string;
  };
};

export default function AssistantPanelModeSegment({ mode, onModeChange, labels }: Props) {
  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950/90">
      <div className="ios-segment flex w-full flex-wrap justify-stretch gap-0.5">
        {(
          [
            ["chat", labels.chat] as const,
            ["optimism", labels.optimism] as const,
            ["blackSwan", labels.blackSwan] as const,
            ["mece", labels.mece] as const,
            ["roundtable", labels.roundtable] as const,
            ["counsel", labels.counsel] as const
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={[
              "ios-segment-item min-w-0 flex-1 px-2 py-1.5 text-[10px] sm:text-sm",
              mode === key ? "ios-segment-item-active" : "ios-segment-item-inactive"
            ].join(" ")}
            onClick={() => onModeChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
