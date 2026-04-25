import { useCallback, useEffect } from "react";
import { useI18n } from "../i18n/useI18n";
import useUiStore from "../store/useUiStore";
import AssistantPanel from "./AssistantPanel";

/**
 * Centered pop-up over the main canvas column (not the right Source/Review dock).
 * Dismisses on backdrop click or Escape.
 */
export default function AssistantOverlay() {
  const { t } = useI18n();
  const dismiss = useCallback(() => {
    useUiStore.getState().closeAssistantSession();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    <div className="absolute inset-0 z-50 flex min-h-0 min-w-0">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px] dark:bg-slate-950/70"
        onClick={dismiss}
        aria-label={t("assistant_close_session")}
        title={t("assistant_close_session")}
      />
      <div
        className="pointer-events-none relative z-10 m-auto flex h-[min(92dvh,900px)] w-[min(96%,100%)] min-h-[50%] min-w-[50%] max-w-[min(100%,64rem)] flex-col px-2 py-2 sm:px-4 sm:py-4"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-auto h-full min-h-0 w-full min-w-0 drop-shadow-2xl">
          <AssistantPanel />
        </div>
      </div>
    </div>
  );
}
