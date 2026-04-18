export type MindmapNode = {
  id: string;
  type: string;
  label: string;
  metadata?: Record<string, unknown>;
  status?: "firm" | "draft" | "conflict" | "unstable";
  clusterId?: string;
  /** Set by client-side validation; optional on persisted graphs. */
  violation_summary?: string;
  inferred_consequences?: string;
  upstream_conflict_summary?: string;
};

export type MindmapEdge = {
  source: string;
  target: string;
  label?: string;
  status?: "firm" | "draft";
};

export type MindmapJson = {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
};

