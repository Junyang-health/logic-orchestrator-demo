import type { Graph } from "@antv/x6";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import ProjectLandingOverlay from "./components/ProjectLandingOverlay";
import SessionSetupGate from "./components/SessionSetupGate";
import AppLeftRail from "./components/AppLeftRail";
import CanvasWorkspaceToggle from "./components/CanvasWorkspaceToggle";
import SlideDeckCenterWorkspace from "./components/SlideDeckCenterWorkspace";
import X6Canvas from "./components/X6Canvas";
import AssistantOverlay from "./components/AssistantOverlay";
import AssistantAndCanvasRow from "./components/rightDock/AssistantAndCanvasRow";
import AppRightDock from "./components/rightDock/AppRightDock";
import ClosedDockRevealTabs from "./components/rightDock/ClosedDockRevealTabs";
import ThemeDocumentSync from "./components/rightDock/ThemeDocumentSync";
import { useI18n } from "./i18n/useI18n";
import { getBackendBase } from "./lib/backendBase";
import { reparentNodeOnGraph } from "./lib/mindmapCanvasOps";
import useUiStore from "./store/useUiStore";

export default function App() {
  const { t } = useI18n();
  const [graph, setGraph] = useState<Graph | null>(null);

  const canvasProps = useUiStore(
    useShallow((s) => ({
      mainGraph: s.mainGraph,
      sandboxGraph: s.sandboxGraph,
      agentId: s.agentId,
      clusterByNodeId: s.clusterByNodeId,
      clusterAssignments: s.clusterAssignments
    }))
  );

  const rightDockOpen = useUiStore((s) => s.rightDockOpen);
  const centerWorkspace = useUiStore((s) => s.centerWorkspace);
  const assistantOverlayOpen = useUiStore((s) => s.assistantOverlayOpen);
  const reparentingNodeId = useUiStore((s) => s.reparentingNodeId);
  const reparentingRelation = useUiStore((s) => s.reparentingRelation);
  const selectedNodeId = useUiStore((s) => s.selectedNode?.id ?? null);
  const clearReparent = useUiStore((s) => s.clearReparent);

  const backendBase = getBackendBase();

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem("mindmap_landing_done") !== "1") {
        useUiStore.getState().openProjectLanding("first_visit");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!graph || !reparentingNodeId) return;
    if (!selectedNodeId || selectedNodeId === reparentingNodeId) return;
    reparentNodeOnGraph(graph, reparentingNodeId, selectedNodeId, reparentingRelation);
    clearReparent();
  }, [graph, reparentingNodeId, reparentingRelation, selectedNodeId, clearReparent]);

  useEffect(() => {
    if (!reparentingNodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearReparent();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reparentingNodeId, clearReparent]);

  return (
    <SessionSetupGate backendBase={backendBase}>
      <div className="unbox-app-shell relative h-screen w-screen overflow-hidden bg-[var(--mm-bg-app)] text-[var(--mm-text-title)]">
      <ThemeDocumentSync />
      <ProjectLandingOverlay backendBase={backendBase} />
      <ClosedDockRevealTabs />

      {reparentingNodeId ? (
        <div
          className="pointer-events-auto fixed bottom-4 left-1/2 z-50 flex max-w-[min(96vw,28rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-200/90 bg-amber-50/95 px-4 py-2.5 text-[11px] text-amber-950 shadow-lg backdrop-blur-sm dark:border-amber-500/40 dark:bg-amber-950/90 dark:text-amber-50"
          role="status"
        >
          <span className="leading-snug">{t("reparenting_banner")}</span>
          <button type="button" className="ios-button shrink-0 text-[10px]" onClick={() => clearReparent()}>
            {t("reparenting_cancel")}
          </button>
        </div>
      ) : null}

      <div className="flex h-full w-full">
        <AppLeftRail backendBase={backendBase} />
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col border-r border-[var(--mm-border-subtle)] bg-transparent">
          <AssistantAndCanvasRow>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <CanvasWorkspaceToggle />
              {/*
                Do not use `hidden` (display:none) on the canvas branch: it collapses the X6
                container to 0×0, so the graph can initialize at 1×1 and never refit. Keep both
                layers in the layout with `absolute inset-0` and toggle visibility instead.
              */}
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <div
                  className={[
                    "absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col",
                    centerWorkspace !== "canvas" ? "invisible pointer-events-none" : ""
                  ].join(" ")}
                  aria-hidden={centerWorkspace !== "canvas"}
                >
                  <X6Canvas {...canvasProps} onGraphReady={setGraph} />
                </div>
                <div
                  className={[
                    "absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col",
                    centerWorkspace !== "slide_deck" ? "invisible pointer-events-none" : ""
                  ].join(" ")}
                  aria-hidden={centerWorkspace !== "slide_deck"}
                >
                  <SlideDeckCenterWorkspace backendBase={backendBase} />
                </div>
              </div>
            </div>
            {assistantOverlayOpen ? <AssistantOverlay /> : null}
          </AssistantAndCanvasRow>
        </section>

        {rightDockOpen ? <AppRightDock graph={graph} backendBase={backendBase} /> : null}
      </div>
    </div>
    </SessionSetupGate>
  );
}
