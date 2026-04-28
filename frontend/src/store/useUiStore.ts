import { create } from "zustand";
import { combineGraphs } from "../lib/graphBranch";
import {
  computeHiddenNodeIds,
  getTopLevelCollapseRootIds,
  pruneCollapsedRoots
} from "../lib/mindmapCollapse";
import { normalizeMindmapJsonNodeTypes, normalizeMindmapNodeType } from "../lib/normalizeMindmapNodeType";
import type { MindmapEdge, MindmapJson, MindmapNode } from "../types/mindmap";
import type { ReviewComment } from "../types/review";
import type { SourceFileEntry } from "../types/sourceMaterial";

type PanelKey = "source" | "review" | "export";

export type AppLocale = "en" | "zh";

const LOCALE_KEY = "mindmap_locale";
const PROJECT_ID_KEY = "mindmap_project_id";
const INTENT_KEY = "mindmap_intent";
const LANDING_DONE_KEY = "mindmap_landing_done";

function readProjectId(): string {
  try {
    return localStorage.getItem(PROJECT_ID_KEY) || "";
  } catch {
    return "";
  }
}

function readIntent(): string {
  try {
    return localStorage.getItem(INTENT_KEY) || "";
  } catch {
    return "";
  }
}

function readLocale(): AppLocale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

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

function nodeFingerprint(n: MindmapNode): string {
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

type GraphState = {
  mainGraph: MindmapJson | null;
  sandboxGraph: MindmapJson;
  sandboxMode: boolean;
  setSandboxMode: (on: boolean) => void;
  clearSandbox: () => void;
  mergeSandboxIntoMain: () => void;
  /** `newMarks: 'diff'` marks nodes that changed (e.g. after assistant apply). Omit or `'none'` clears UI "new" badges (e.g. project reload). */
  loadMainGraph: (graph: MindmapJson, opts?: LoadMainGraphOptions) => void;
  /** Client-only: node ids showing the temporary "new" chip until the next graph modification or a non-diff load. */
  newMarkedNodeIds: Record<string, boolean>;
  addNode: (node: MindmapNode) => void;
  addEdge: (edge: MindmapEdge) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (source: string, target: string, label?: string) => void;

  // Sub-agent / clustering
  agentId: string;
  setAgentId: (agentId: string) => void;
  clusterByNodeId: Record<string, string>;
  clusterAssignments: Record<string, string>; // clusterId -> agentId
  numAgents: number;
  setNumAgents: (n: number) => void;
};

export type SkillKey = "webSearch" | "financialAnalyst";

type SkillsState = {
  skills: Record<SkillKey, boolean>;
  toggleSkill: (key: SkillKey) => void;
};

type ReviewState = {
  reviewPersona: string;
  setReviewPersona: (persona: string) => void;
  reviewComments: ReviewComment[];
  /** Branch root used for the last "Review branch" scan (needed to apply comments safely). */
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
};

type SourceMaterialState = {
  sourceFiles: SourceFileEntry[];
  addSourceFiles: (files: File[]) => void;
  removeSourceFile: (id: string) => void;
  clearSourceFiles: () => void;
  /** Project library file ids currently selected in Source (used for mindmap + collision context). */
  projectSelectedFileIds: string[];
  setProjectSelectedFileIds: (ids: string[]) => void;
};

function readDockOpen(key: string, defaultOpen: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

type ProjectRow = { id: string; name: string };

type ProjectWorkspaceState = {
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
  /** Persist onboarding flag and close the landing overlay. */
  dismissProjectLandingOnboarding: () => void;
};

type UiState = {
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
  /** Whether the canvas assistant (chat / simulators) is shown as a pop-up over the map. */
  assistantOverlayOpen: boolean;
  setAssistantOverlayOpen: (open: boolean) => void;
  /** Closes the assistant overlay and ends the assistant/sandbox session (idempotent). */
  closeAssistantSession: () => void;
  /**
   * When set, the user is moving a node to a new parent: click another node to attach.
   * `reparentingRelation` is the edge label to use (e.g. "supports"), aligned with the Source panel field when started from there.
   */
  reparentingNodeId: string | null;
  reparentingRelation: string;
  startReparent: (nodeId: string, relationship: string) => void;
  clearReparent: () => void;
  /** Right Source/Review column visible. */
  rightDockOpen: boolean;
  setRightDockOpen: (open: boolean) => void;
  /** X6 canvas dot grid visibility. */
  canvasGridVisible: boolean;
  setCanvasGridVisible: (v: boolean) => void;
  /**
   * Node ids whose **subtrees** are folded (descendants hidden on canvas; full graph unchanged in store).
   * Persisted in localStorage (`mindmap_collapsed_subtree_roots`).
   */
  collapsedSubtreeRootIds: string[];
  toggleCollapsedSubtree: (nodeId: string) => void;
  expandAllCollapsedSubtrees: () => void;
  /** Set collapsed roots to all graph entry nodes with children (show only top-level). */
  collapseAllSubtreesToTopLevel: () => void;
  /**
   * Canvas should center on this node (e.g. Review panel). `token` bumps on each request so
   * the same node can be focused again.
   */
  canvasCenterOnNodeRequest: { nodeId: string; token: number } | null;
  requestCanvasCenterOnNode: (nodeId: string) => void;
} & SkillsState &
  ReviewState &
  SourceMaterialState &
  ProjectWorkspaceState;

function computeClusters(graph: MindmapJson): Record<string, string> {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) adj.set(id, new Set());
  for (const e of graph.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const visited = new Set<string>();
  const clusterByNodeId: Record<string, string> = {};
  let clusterIdx = 0;

  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const cid = `cluster-${clusterIdx++}`;
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      clusterByNodeId[cur] = cid;
      for (const nb of adj.get(cur) ?? []) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        stack.push(nb);
      }
    }
  }
  return clusterByNodeId;
}

function computeAssignments(clusterByNodeId: Record<string, string>, numAgents: number) {
  const clusterIds = Array.from(new Set(Object.values(clusterByNodeId))).sort();
  const assignments: Record<string, string> = {};
  const n = Math.max(1, Math.floor(numAgents || 1));
  for (let i = 0; i < clusterIds.length; i++) {
    assignments[clusterIds[i]] = `agent-${(i % n) + 1}`;
  }
  return assignments;
}

/** Debounce `computeClusters` on rapid main-graph edits (add/remove node/edge). */
const CLUSTER_DEBOUNCE_MS = 120;
let clusterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function flushClusterDebounce() {
  if (clusterDebounceTimer != null) {
    clearTimeout(clusterDebounceTimer);
    clusterDebounceTimer = null;
  }
}

type Store = UiState & GraphState;
type StoreSet = (partial: Partial<Store> | ((state: Store) => Partial<Store>)) => void;
type StoreGet = () => Store;

const COLLAPSED_SUBTREE_KEY = "mindmap_collapsed_subtree_roots";

function readCollapsedSubtreeRoots(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_SUBTREE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}

function applyClustersFromMainGraph(set: StoreSet, get: StoreGet) {
  const st = get();
  const main = st.mainGraph ?? { nodes: [], edges: [] };
  const clusterByNodeId = computeClusters(main);
  set({
    clusterByNodeId,
    clusterAssignments: computeAssignments(clusterByNodeId, st.numAgents)
  });
}

function scheduleDebouncedClustersFromMain(set: StoreSet, get: StoreGet) {
  flushClusterDebounce();
  clusterDebounceTimer = window.setTimeout(() => {
    clusterDebounceTimer = null;
    applyClustersFromMainGraph(set, get);
  }, CLUSTER_DEBOUNCE_MS);
}

const useUiStore = create<UiState & GraphState>((set, get) => ({
  activePanel: "source",
  setActivePanel: (panel) => set({ activePanel: panel }),
  selectedNode: null,
  setSelectedNode: (node) => set({ selectedNode: node }),
  locale: readLocale(),
  setLocale: (loc) => {
    try {
      localStorage.setItem(LOCALE_KEY, loc);
    } catch {
      /* ignore */
    }
    set({ locale: loc });
  },
  projectId: readProjectId(),
  setProjectId: (id) => {
    try {
      localStorage.setItem(PROJECT_ID_KEY, id);
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new CustomEvent("mindmap:projectId", { detail: { projectId: id } }));
    } catch {
      /* ignore */
    }
    set({ projectId: id });
  },
  projects: [],
  setProjects: (projects) => set({ projects }),
  intent: readIntent(),
  setIntent: (intent) => {
    try {
      localStorage.setItem(INTENT_KEY, intent);
    } catch {
      /* ignore */
    }
    set({ intent });
  },
  projectLandingOpen: false,
  projectLandingReason: null,
  openProjectLanding: (reason = "first_visit") =>
    set({ projectLandingOpen: true, projectLandingReason: reason }),
  closeProjectLanding: () => set({ projectLandingOpen: false, projectLandingReason: null }),
  dismissProjectLandingOnboarding: () => {
    try {
      localStorage.setItem(LANDING_DONE_KEY, "1");
    } catch {
      /* ignore */
    }
    set({ projectLandingOpen: false, projectLandingReason: null });
  },
  theme: "dark",
  setTheme: (t) => set({ theme: t }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  assistantActive: false,
  setAssistantActive: (on) => set({ assistantActive: on }),
  assistantOverlayOpen: false,
  setAssistantOverlayOpen: (open) => set({ assistantOverlayOpen: open }),
  closeAssistantSession: () =>
    set({ assistantOverlayOpen: false, assistantActive: false, sandboxMode: false }),
  reparentingNodeId: null,
  reparentingRelation: "supports",
  startReparent: (nodeId, relationship) =>
    set({
      reparentingNodeId: nodeId,
      reparentingRelation: relationship.trim() || "supports"
    }),
  clearReparent: () => set({ reparentingNodeId: null }),
  rightDockOpen: readDockOpen("mindmap_right_dock_open", true),
  setRightDockOpen: (open) => {
    try {
      localStorage.setItem("mindmap_right_dock_open", open ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ rightDockOpen: open });
  },
  canvasGridVisible: true,
  setCanvasGridVisible: (v) => set({ canvasGridVisible: v }),

  collapsedSubtreeRootIds: readCollapsedSubtreeRoots(),
  toggleCollapsedSubtree: (nodeId) => {
    const id = nodeId.trim();
    if (!id) return;
    const st = get();
    const roots = new Set(st.collapsedSubtreeRootIds);
    if (roots.has(id)) roots.delete(id);
    else roots.add(id);
    let next = Array.from(roots);
    const combined = combineGraphs(st.mainGraph, st.sandboxGraph);
    const allIds = new Set(combined.nodes.map((n) => n.id));
    next = pruneCollapsedRoots(next, allIds);
    const hidden = computeHiddenNodeIds(new Set(next), combined.edges, allIds);
    const selId = st.selectedNode?.id;
    try {
      localStorage.setItem(COLLAPSED_SUBTREE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (selId && hidden.has(selId)) {
      set({ collapsedSubtreeRootIds: next, selectedNode: null });
    } else {
      set({ collapsedSubtreeRootIds: next });
    }
  },
  expandAllCollapsedSubtrees: () => {
    try {
      localStorage.removeItem(COLLAPSED_SUBTREE_KEY);
    } catch {
      /* ignore */
    }
    set({ collapsedSubtreeRootIds: [] });
  },
  canvasCenterOnNodeRequest: null,
  requestCanvasCenterOnNode: (nodeId) => {
    const id = nodeId.trim();
    if (!id) return;
    set({ canvasCenterOnNodeRequest: { nodeId: id, token: Date.now() } });
  },

  collapseAllSubtreesToTopLevel: () => {
    const st = get();
    const combined = combineGraphs(st.mainGraph, st.sandboxGraph);
    const allIds = new Set(combined.nodes.map((n) => n.id));
    let next = getTopLevelCollapseRootIds(allIds, combined.edges);
    next = pruneCollapsedRoots(next, allIds);
    const hidden = computeHiddenNodeIds(new Set(next), combined.edges, allIds);
    const selId = st.selectedNode?.id;
    try {
      localStorage.setItem(COLLAPSED_SUBTREE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (selId && hidden.has(selId)) {
      set({ collapsedSubtreeRootIds: next, selectedNode: null });
    } else {
      set({ collapsedSubtreeRootIds: next });
    }
  },

  skills: { webSearch: false, financialAnalyst: false },
  toggleSkill: (key) =>
    set((s) => ({
      skills: { ...s.skills, [key]: !s.skills[key] }
    })),

  reviewPersona: "Skeptical Investor",
  setReviewPersona: (persona) => set({ reviewPersona: persona }),
  reviewComments: [],
  reviewBranchRootId: null,
  setReviewComments: (items, persona, branchRootId) =>
    set((s) => ({
      reviewComments: items.map((c, i) => ({
        ...c,
        id: `c_${persona}_${c.nodeId}_${i}`,
        persona
      })),
      reviewBranchRootId:
        branchRootId === undefined ? s.reviewBranchRootId : branchRootId === null ? null : branchRootId
    })),
  clearReviewComments: () => set({ reviewComments: [], reviewFocusNodeId: null, reviewBranchRootId: null }),
  reviewFocusNodeId: null,
  setReviewFocusNodeId: (id) => set({ reviewFocusNodeId: id }),
  reviewLoading: false,
  setReviewLoading: (v) => set({ reviewLoading: v }),

  sourceFiles: [],
  addSourceFiles: (files) =>
    set((s) => {
      const next = [...s.sourceFiles];
      const t = Date.now();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        next.push({
          id: `sf_${t}_${i}_${Math.random().toString(16).slice(2, 10)}`,
          file,
          addedAt: t
        });
      }
      return { sourceFiles: next };
    }),
  removeSourceFile: (id) =>
    set((s) => ({ sourceFiles: s.sourceFiles.filter((e) => e.id !== id) })),
  clearSourceFiles: () => set({ sourceFiles: [] }),
  projectSelectedFileIds: [],
  setProjectSelectedFileIds: (ids) => set({ projectSelectedFileIds: Array.from(new Set(ids)) }),

  mainGraph: null,
  sandboxGraph: { nodes: [], edges: [] },
  sandboxMode: false,
  setSandboxMode: (on) => set({ sandboxMode: on }),
  clearSandbox: () => set({ sandboxGraph: { nodes: [], edges: [] } }),
  mergeSandboxIntoMain: () => {
    flushClusterDebounce();
    const st = get();
    if (!st.mainGraph) {
      // If no main graph loaded yet, promote sandbox to main.
      const promoted: MindmapJson = normalizeMindmapJsonNodeTypes({
        nodes: st.sandboxGraph.nodes.map((n) => ({ ...n, status: "firm" })),
        edges: st.sandboxGraph.edges.map((e) => ({ ...e, status: "firm" }))
      });
      const clusterByNodeId = computeClusters(promoted);
      const newMarkedNodeIds = Object.fromEntries(promoted.nodes.map((n) => [n.id, true]));
      set({
        mainGraph: promoted,
        sandboxGraph: { nodes: [], edges: [] },
        clusterByNodeId,
        clusterAssignments: computeAssignments(clusterByNodeId, st.numAgents),
        newMarkedNodeIds
      });
      return;
    }

    const main = st.mainGraph;
    const sandbox = st.sandboxGraph;
    /** Same id-resolution as assistant apply (`combineGraphs`): sandbox overlays main, then firm. */
    const combined = combineGraphs(main, sandbox);
    const merged: MindmapJson = normalizeMindmapJsonNodeTypes({
      nodes: combined.nodes.map((n) => ({ ...n, status: "firm" as const })),
      edges: combined.edges.map((e) => ({ ...e, status: "firm" as const }))
    });
    const clusterByNodeId = computeClusters(merged);
    const sandboxIds = new Set(sandbox.nodes.map((n) => n.id));
    const newMarkedNodeIds: Record<string, boolean> = {};
    for (const n of merged.nodes) {
      if (sandboxIds.has(n.id)) {
        newMarkedNodeIds[n.id] = true;
        continue;
      }
      const prev = main.nodes.find((p) => p.id === n.id);
      if (!prev || nodeFingerprint(prev) !== nodeFingerprint(n)) {
        newMarkedNodeIds[n.id] = true;
      }
    }
    set({
      mainGraph: merged,
      sandboxGraph: { nodes: [], edges: [] },
      clusterByNodeId,
      clusterAssignments: computeAssignments(clusterByNodeId, st.numAgents),
      newMarkedNodeIds
    });
  },
  newMarkedNodeIds: {},
  loadMainGraph: (graph, opts) => {
    flushClusterDebounce();
    const st = get();
    const normalized: MindmapJson = normalizeMindmapJsonNodeTypes({
      nodes: graph.nodes.map((n) => ({ ...n, status: n.status ?? "firm" })),
      edges: graph.edges.map((e) => ({ ...e, status: e.status ?? "firm" }))
    });
    const clusterByNodeId = computeClusters(normalized);
    const mode = opts?.newMarks ?? "none";
    let newMarkedNodeIds: Record<string, boolean> = {};
    if (mode === "diff" && st.mainGraph && st.mainGraph.nodes.length > 0) {
      const prevFp = new Map(st.mainGraph.nodes.map((n) => [n.id, nodeFingerprint(n)]));
      for (const n of normalized.nodes) {
        const fp = nodeFingerprint(n);
        if (!prevFp.has(n.id) || prevFp.get(n.id) !== fp) {
          newMarkedNodeIds[n.id] = true;
        }
      }
    }
    set({
      mainGraph: normalized,
      clusterByNodeId,
      clusterAssignments: computeAssignments(clusterByNodeId, st.numAgents),
      newMarkedNodeIds
    });
  },
  addNode: (node) => {
    const st = get();
    const targetKey = st.sandboxMode ? "sandboxGraph" : "mainGraph";
    const status = st.sandboxMode ? ("draft" as const) : ("firm" as const);
    const normalized: MindmapNode = {
      ...node,
      type: normalizeMindmapNodeType(node.type),
      status: node.status ?? status
    };
    if (targetKey === "mainGraph") {
      const cur = st.mainGraph ?? { nodes: [], edges: [] };
      const idx = cur.nodes.findIndex((n) => n.id === node.id);
      const nodes =
        idx >= 0 ? cur.nodes.map((n, i) => (i === idx ? { ...n, ...normalized } : n)) : [...cur.nodes, normalized];
      const next = { ...cur, nodes };
      set({
        mainGraph: next,
        newMarkedNodeIds: { [normalized.id]: true }
      });
      scheduleDebouncedClustersFromMain(set, get);
    } else {
      const cur = st.sandboxGraph;
      const idx = cur.nodes.findIndex((n) => n.id === node.id);
      const nodes =
        idx >= 0 ? cur.nodes.map((n, i) => (i === idx ? { ...n, ...normalized } : n)) : [...cur.nodes, normalized];
      set({ sandboxGraph: { ...cur, nodes }, newMarkedNodeIds: { [normalized.id]: true } });
    }
  },
  addEdge: (edge) => {
    const st = get();
    const targetKey = st.sandboxMode ? "sandboxGraph" : "mainGraph";
    const status = st.sandboxMode ? ("draft" as const) : ("firm" as const);
    const key = `${edge.source}→${edge.target}::${edge.label ?? ""}`;

    if (targetKey === "mainGraph") {
      const cur = st.mainGraph ?? { nodes: [], edges: [] };
      const edges = cur.edges.some((e) => `${e.source}→${e.target}::${e.label ?? ""}` === key)
        ? cur.edges
        : [...cur.edges, { ...edge, status: edge.status ?? status }];
      const next = { ...cur, edges };
      set({
        mainGraph: next,
        newMarkedNodeIds: { [edge.source]: true, [edge.target]: true }
      });
      scheduleDebouncedClustersFromMain(set, get);
    } else {
      const cur = st.sandboxGraph;
      const edges = cur.edges.some((e) => `${e.source}→${e.target}::${e.label ?? ""}` === key)
        ? cur.edges
        : [...cur.edges, { ...edge, status: edge.status ?? status }];
      set({
        sandboxGraph: { ...cur, edges },
        newMarkedNodeIds: { [edge.source]: true, [edge.target]: true }
      });
    }
  },

  removeNode: (nodeId) => {
    const st = get();
    const targetKey = st.sandboxMode ? "sandboxGraph" : "mainGraph";
    if (targetKey === "mainGraph") {
      const cur = st.mainGraph ?? { nodes: [], edges: [] };
      const nodes = cur.nodes.filter((n) => n.id !== nodeId);
      const edges = cur.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      const next = { ...cur, nodes, edges };
      set({
        mainGraph: next,
        newMarkedNodeIds: {}
      });
      scheduleDebouncedClustersFromMain(set, get);
    } else {
      const cur = st.sandboxGraph;
      set({
        sandboxGraph: {
          nodes: cur.nodes.filter((n) => n.id !== nodeId),
          edges: cur.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
        },
        newMarkedNodeIds: {}
      });
    }
  },

  removeEdge: (source, target, label) => {
    const st = get();
    const targetKey = st.sandboxMode ? "sandboxGraph" : "mainGraph";
    const key = `${source}→${target}::${label ?? ""}`;
    const filterOutEdge = (edges: MindmapEdge[]) => {
      const next = edges.filter((e) => `${e.source}→${e.target}::${e.label ?? ""}` !== key);
      if (next.length < edges.length) return next;
      // Label from the canvas can differ from mindmap JSON (e.g. only on labels attr); still remove the link.
      const idx = edges.findIndex((e) => e.source === source && e.target === target);
      if (idx >= 0) return edges.filter((_, i) => i !== idx);
      return edges;
    };
    if (targetKey === "mainGraph") {
      const cur = st.mainGraph ?? { nodes: [], edges: [] };
      const edges = filterOutEdge(cur.edges);
      if (edges.length === cur.edges.length) return;
      const next = { ...cur, edges };
      set({
        mainGraph: next,
        newMarkedNodeIds: { [source]: true, [target]: true }
      });
      scheduleDebouncedClustersFromMain(set, get);
    } else {
      const cur = st.sandboxGraph;
      const edges = filterOutEdge(cur.edges);
      if (edges.length === cur.edges.length) return;
      set({
        sandboxGraph: {
          ...cur,
          edges
        },
        newMarkedNodeIds: { [source]: true, [target]: true }
      });
    }
  },

  agentId: "agent-1",
  setAgentId: (agentId) => set({ agentId }),
  clusterByNodeId: {},
  clusterAssignments: {},
  numAgents: 3,
  setNumAgents: (n) => {
    flushClusterDebounce();
    const st = get();
    const numAgents = Math.max(1, Math.floor(n || 1));
    const main = st.mainGraph ?? { nodes: [], edges: [] };
    const clusterByNodeId = computeClusters(main);
    set({
      numAgents,
      clusterByNodeId,
      clusterAssignments: computeAssignments(clusterByNodeId, numAgents)
    });
  }
}));

export default useUiStore;

