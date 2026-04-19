import type { Graph } from "@antv/x6";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import X6Canvas from "./components/X6Canvas";
import AssistantAndCanvasRow from "./components/rightDock/AssistantAndCanvasRow";
import AppRightDock from "./components/rightDock/AppRightDock";
import ClosedDockRevealTabs from "./components/rightDock/ClosedDockRevealTabs";
import ThemeDocumentSync from "./components/rightDock/ThemeDocumentSync";
import { getBackendBase } from "./lib/backendBase";
import useUiStore from "./store/useUiStore";

export default function App() {
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

  const backendBase = getBackendBase();

  return (
    <div className="relative h-screen w-screen overflow-hidden text-slate-900 dark:text-slate-100">
      <ThemeDocumentSync />
      <ClosedDockRevealTabs />

      <div className="flex h-full w-full">
        <section className="relative min-w-0 flex-1 border-r ios-divider">
          <AssistantAndCanvasRow>
            <X6Canvas {...canvasProps} onGraphReady={setGraph} />
          </AssistantAndCanvasRow>
        </section>

        {rightDockOpen ? <AppRightDock graph={graph} backendBase={backendBase} /> : null}
      </div>
    </div>
  );
}
