/** Summarize assistant apply–shaped patches for counsel finalize UI. */

export type PatchImpactAdd = { id: string; label?: string; type?: string };
export type PatchImpactUpdate = { id: string; label?: string; type?: string };
export type PatchImpactEdge = { source: string; target: string; label?: string };

export type PatchImpactSummary = {
  adds: PatchImpactAdd[];
  updates: PatchImpactUpdate[];
  removes: string[];
  edges: PatchImpactEdge[];
};

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function nodeIdLabel(o: Record<string, unknown>): { id: string; label?: string; type?: string } {
  const id = String(o.id ?? "").trim() || "?";
  const lab = o.label != null ? String(o.label).trim() : "";
  const typ = o.type != null ? String(o.type).trim() : "";
  return {
    id,
    label: lab || undefined,
    type: typ || undefined
  };
}

export function summarizePatchImpact(patch: Record<string, unknown> | null | undefined): PatchImpactSummary {
  const p = patch && typeof patch === "object" ? patch : {};
  const addsRaw = Array.isArray(p.add_nodes) ? p.add_nodes : [];
  const updatesRaw = Array.isArray(p.update_nodes) ? p.update_nodes : [];
  const removesRaw = Array.isArray(p.remove_node_ids) ? p.remove_node_ids : [];
  const edgesRaw = Array.isArray(p.add_edges) ? p.add_edges : [];

  const adds: PatchImpactAdd[] = [];
  for (const item of addsRaw) {
    const o = asObj(item);
    if (!o) continue;
    const { id, label, type } = nodeIdLabel(o);
    adds.push({ id, label, type });
  }

  const updates: PatchImpactUpdate[] = [];
  for (const item of updatesRaw) {
    const o = asObj(item);
    if (!o) continue;
    const { id, label, type } = nodeIdLabel(o);
    updates.push({ id, label, type });
  }

  const removes: string[] = removesRaw.map((id) => String(id ?? "").trim()).filter(Boolean);

  const edges: PatchImpactEdge[] = [];
  for (const item of edgesRaw) {
    const o = asObj(item);
    if (!o) continue;
    const source = String(o.source ?? "").trim();
    const target = String(o.target ?? "").trim();
    if (!source || !target) continue;
    const el = o.label != null ? String(o.label).trim() : "";
    edges.push({ source, target, label: el || undefined });
  }

  return { adds, updates, removes, edges };
}

export function patchImpactTotalCount(s: PatchImpactSummary): number {
  return s.adds.length + s.updates.length + s.removes.length + s.edges.length;
}
