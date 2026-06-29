import type { PptSlide } from "../lib/pptFrameworkExport";
import type { ReviewComment } from "../types/review";
import type { SourceFileEntry } from "../types/sourceMaterial";

export type PanelKey = "source" | "review" | "export";

export type AppLocale = "en" | "zh";

export type MindmapNodePayload = {
  id: string;
  type?: string;
  label?: string;
  metadata?: Record<string, unknown>;
  status?: MindmapNode["status"];
  clusterId?: string;
  violation_summary?: string;
  inferred_consequences?: string;
};

export type LoadMainGraphOptions = {
  /** When `'diff'`, replace previous "new" highlights with nodes that changed vs prior main graph. */
  newMarks?: "none" | "diff";
};

export type SkillKey = "webSearch" | "financialAnalyst";

export type ProjectRow = {
  id: string;
  name: string;
  created_at_ms?: number;
  archived?: boolean;
  last_active_ms?: number;
};

/** Full client UI + graph store shape (single Zustand store). */
export type UiStore = {
  activePanel: PanelKey;
  setActivePanel: (panel: PanelKey) => void;
  selectedNode: MindmapNodePayload | null;
  setSelectedNode: (node: MindmapNodePayload | null) => void;
  locale: AppLocale;
  setLocale: (loc: AppLocale) => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;
  assistantActive: boolean;
  setAssistantActive: (on: boolean) => void;
  assistantOverlayOpen: boolean;
  setAssistantOverlayOpen: (open: boolean) => void;
  closeAssistantSession: () => void;
  reparentingNodeId: string | null;
  reparentingRelation: string;
  startReparent: (nodeId: string, relationship: string) => void;
  clearReparent: () => void;
  rightDockOpen: boolean;
  setRightDockOpen: (open: boolean) => void;
  canvasGridVisible: boolean;
  setCanvasGridVisible: (v: boolean) => void;
  collapsedSubtreeRootIds: string[];
  toggleCollapsedSubtree: (nodeId: string) => void;
  expandAllCollapsedSubtrees: () => void;
  collapseAllSubtreesToTopLevel: () => void;
  canvasCenterOnNodeRequest: { nodeId: string; token: number } | null;
  requestCanvasCenterOnNode: (nodeId: string) => void;

  /** Main area: mindmap canvas vs PPT slide deck viewer */
  centerWorkspace: "canvas" | "slide_deck";
  setCenterWorkspace: (w: "canvas" | "slide_deck") => void;
  /** Export sidebar sub-tab (mindmap / ppt / word) */
  exportPanelTab: "mindmap" | "ppt" | "word";
  setExportPanelTab: (tab: "mindmap" | "ppt" | "word") => void;
  /** Shared PPT framework slides (Export → PPT panel + center deck viewer) */
  pptSlides: PptSlide[];
  setPptSlides: (v: PptSlide[] | ((prev: PptSlide[]) => PptSlide[])) => void;
  slideBuildSessionId: string | null;
  setSlideBuildSessionId: (id: string | null) => void;
  deckViewerIndex: number;
  setDeckViewerIndex: (i: number) => void;

  skills: Record<SkillKey, boolean>;
  toggleSkill: (key: SkillKey) => void;

  reviewPersona: string;
  setReviewPersona: (persona: string) => void;
  reviewComments: ReviewComment[];
  reviewBranchRootId: string | null;
  setReviewComments: (
    comments: Omit<ReviewComment, "id" | "persona">[],
    persona: string,
    branchRootId?: string | null
  ) => void;
  clearReviewComments: () => void;
  reviewFocusNodeId: string | null;
  setReviewFocusNodeId: (id: string | null) => void;
  reviewLoading: boolean;
  setReviewLoading: (v: boolean) => void;

  sourceFiles: SourceFileEntry[];
  addSourceFiles: (files: File[]) => void;
  removeSourceFile: (id: string) => void;
  clearSourceFiles: () => void;
  projectSelectedFileIds: string[];
  setProjectSelectedFileIds: (ids: string[]) => void;

  projectId: string;
  setProjectId: (id: string) => void;
  projects: ProjectRow[];
  setProjects: (projects: ProjectRow[]) => void;
  intent: string;
  setIntent: (intent: string) => void;
  projectLandingOpen: boolean;
  projectLandingReason: "first_visit" | "new_project" | null;
  openProjectLanding: (reason?: "first_visit" | "new_project") => void;
  closeProjectLanding: () => void;
  dismissProjectLandingOnboarding: () => void;

  mainGraph: MindmapJson | null;
  sandboxGraph: MindmapJson;
  sandboxMode: boolean;
  setSandboxMode: (on: boolean) => void;
  clearSandbox: () => void;
  mergeSandboxIntoMain: () => void;
  loadMainGraph: (graph: MindmapJson, opts?: LoadMainGraphOptions) => void;
  newMarkedNodeIds: Record<string, boolean>;
  addNode: (node: MindmapNode) => void;
  addEdge: (edge: MindmapEdge) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (source: string, target: string, label?: string) => void;

  agentId: string;
  setAgentId: (agentId: string) => void;
  clusterByNodeId: Record<string, string>;
  clusterAssignments: Record<string, string>;
  numAgents: number;
  setNumAgents: (n: number) => void;
};

export type UiStoreSet = (
  partial: Partial<UiStore> | ((state: UiStore) => Partial<UiStore>)
) => void;
export type UiStoreGet = () => UiStore;

export function nodeFingerprint(n: MindmapNode): string {
  return JSON.stringify({
    label: n.label,
    type: n.type,
    status: n.status,
    metadata: n.metadata ?? {},
    violation_summary: n.violation_summary,
    inferred_consequences: n.inferred_consequences,
    upstream_conflict_summary: n.upstream_conflict_summary
  });
}
