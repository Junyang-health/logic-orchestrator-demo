import { useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../i18n/useI18n";
import useUiStore from "../../store/useUiStore";
import AssistantPanel from "../AssistantPanel";

export default function AssistantAndCanvasRow({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { assistantDockOpen, assistantDockWidthPx, setAssistantDockWidthPx } = useUiStore(
    useShallow((s) => ({
      assistantDockOpen: s.assistantDockOpen,
      assistantDockWidthPx: s.assistantDockWidthPx,
      setAssistantDockWidthPx: s.setAssistantDockWidthPx
    }))
  );

  const resizeDrag = useRef<{ startX: number; startW: number } | null>(null);

  const startAssistantResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeDrag.current = { startX: e.clientX, startW: assistantDockWidthPx };
      const onMove = (ev: MouseEvent) => {
        const r = resizeDrag.current;
        if (!r) return;
        const dx = ev.clientX - r.startX;
        setAssistantDockWidthPx(r.startW + dx);
      };
      const onUp = () => {
        resizeDrag.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [assistantDockWidthPx, setAssistantDockWidthPx]
  );

  return (
    <div className="flex h-full w-full min-w-0">
      {assistantDockOpen ? (
        <>
          <div
            className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden"
            style={{ width: assistantDockWidthPx }}
          >
            <AssistantPanel />
          </div>
          <button
            type="button"
            aria-label={t("resize_aria")}
            title={t("resize_title")}
            onMouseDown={startAssistantResize}
            className="group relative z-20 w-2 shrink-0 cursor-col-resize border-l border-r border-transparent bg-transparent hover:border-sky-300/60 hover:bg-sky-400/15 active:bg-sky-400/25"
          />
        </>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
