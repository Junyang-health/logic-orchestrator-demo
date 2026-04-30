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
  /** Optional per-mode tooltips (e.g. slash-command hints from Chat). */
  modeTooltips?: {
    chat: string;
    optimism: string;
    blackSwan: string;
    mece: string;
    roundtable: string;
    counsel: string;
  };
  /** When true, render only the pill control (for the studio header). */
  embedded?: boolean;
};

export default function AssistantPanelModeSegment({ mode, onModeChange, labels, modeTooltips, embedded }: Props) {
  const segment = (
    <div
      className={[
        "ios-segment flex min-w-0 justify-stretch gap-0.5",
        embedded ? "w-max max-w-full flex-nowrap" : "w-full flex-wrap"
      ].join(" ")}
    >
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
            "ios-segment-item min-w-0 px-2 py-1.5 text-[10px] sm:px-2.5 sm:text-[11px]",
            embedded ? "shrink-0 whitespace-nowrap" : "min-w-0 flex-1 sm:text-sm",
            mode === key ? "ios-segment-item-active" : "ios-segment-item-inactive"
          ].join(" ")}
          title={modeTooltips?.[key]}
          onClick={() => onModeChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (embedded) {
    return segment;
  }

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950/90">
      {segment}
    </div>
  );
}
