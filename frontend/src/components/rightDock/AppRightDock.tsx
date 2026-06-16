import type { Graph } from "@antv/x6";
import { useEffect, useState } from "react";
import useUiStore from "../../store/useUiStore";
import RightDockNav from "./RightDockNav";
import ExportSidebarPanel from "./ExportSidebarPanel";
import ReviewSidebarPanel from "./ReviewSidebarPanel";
import SourceSidebarPanel from "./SourceSidebarPanel";

export default function AppRightDock(props: { graph: Graph | null; backendBase: string }) {
  const activePanel = useUiStore((s) => s.activePanel);
  const reviewComments = useUiStore((s) => s.reviewComments);

  /** Kept in the dock shell so switching Source ↔ Review does not reset selection / apply errors. */
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [applyReviewBusy, setApplyReviewBusy] = useState(false);
  const [applyReviewError, setApplyReviewError] = useState("");

  useEffect(() => {
    setSelectedCommentIds((ids) => ids.filter((id) => reviewComments.some((c) => c.id === id)));
  }, [reviewComments]);

  return (
    <aside
      className="min-h-0 min-w-0 shrink-0 overflow-hidden border-l border-[var(--mm-border-subtle)] bg-[var(--mm-sidebar-bg)] shadow-[-12px_0_32px_-24px_rgba(15,23,42,0.45)]"
      style={{ flex: "0 0 clamp(300px, 31vw, 430px)" }}
    >
      <div className="flex h-full min-w-0 flex-col">
        <RightDockNav />
        <div className="flex-1 overflow-auto px-4 py-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%)]">
          {activePanel === "source" ? (
            <SourceSidebarPanel graph={props.graph} backendBase={props.backendBase} />
          ) : activePanel === "review" ? (
            <ReviewSidebarPanel
              backendBase={props.backendBase}
              selectedCommentIds={selectedCommentIds}
              setSelectedCommentIds={setSelectedCommentIds}
              applyReviewBusy={applyReviewBusy}
              setApplyReviewBusy={setApplyReviewBusy}
              applyReviewError={applyReviewError}
              setApplyReviewError={setApplyReviewError}
            />
          ) : (
            <ExportSidebarPanel graph={props.graph} backendBase={props.backendBase} />
          )}
        </div>
      </div>
    </aside>
  );
}
