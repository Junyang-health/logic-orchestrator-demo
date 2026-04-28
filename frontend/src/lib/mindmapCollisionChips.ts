/**
 * Read optional collision fields from node data for canvas chips (logic vs cross-source facts).
 * Metadata: collision_logic, collision_facts (or legacy keys logic_collision, facts_collision).
 */
import type { MindmapJson } from "../types/mindmap";

export type CollisionChipKind = "logic" | "facts";

function trimStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export type CollisionNodeInput = {
  status?: string;
  violation_summary?: string;
  inferred_consequences?: string;
  upstream_conflict_summary?: string;
  metadata?: Record<string, unknown>;
};

export function getCollisionChips(d: CollisionNodeInput): { kind: CollisionChipKind; summary: string }[] {
  const m = d.metadata ?? {};
  const out: { kind: CollisionChipKind; summary: string }[] = [];

  const metaLogic = trimStr(m.collision_logic ?? m.logic_collision);
  const metaFacts = trimStr(m.collision_facts ?? m.facts_collision);

  let logic = metaLogic;
  if (!logic) {
    const st = (d.status ?? "").toLowerCase();
    if (st === "conflict" || st === "unstable") {
      const vs = trimStr(d.violation_summary);
      if (vs) logic = vs;
    }
  }
  if (logic) out.push({ kind: "logic", summary: logic });
  if (metaFacts) out.push({ kind: "facts", summary: metaFacts });
  return out;
}

export function hasExplicitCollisionMetadata(metadata: Record<string, unknown> | undefined): boolean {
  const m = metadata ?? {};
  return Boolean(
    trimStr(m.collision_logic) ||
      trimStr(m.collision_facts) ||
      trimStr(m.logic_collision) ||
      trimStr(m.facts_collision)
  );
}

/**
 * At least two sources in the upload queue and/or project file selection.
 */
export function isMultiFileSourceContext(
  uploadFileCount: number,
  projectSelectedFileIdCount: number
): boolean {
  if (uploadFileCount >= 2) return true;
  if (projectSelectedFileIdCount >= 2) return true;
  if (uploadFileCount >= 1 && projectSelectedFileIdCount >= 1) return true;
  return false;
}

export type MindmapCollisionListItem = {
  id: string;
  nodeId: string;
  nodeLabel: string;
  kind: CollisionChipKind;
  /** One-line text for the list row and accessibility */
  summary: string;
};

/** All logic/facts collision rows that would be produced for nodes in the given graph. */
export function collectMindmapCollisions(mm: MindmapJson | null | undefined): MindmapCollisionListItem[] {
  if (!mm?.nodes?.length) return [];
  const out: MindmapCollisionListItem[] = [];
  for (const n of mm.nodes) {
    const chips = getCollisionChips({
      status: n.status,
      violation_summary: n.violation_summary,
      inferred_consequences: n.inferred_consequences,
      metadata: n.metadata ?? {}
    });
    const nodeLabel = (n.label || "").trim() || n.id;
    for (const c of chips) {
      out.push({
        id: `${n.id}::${c.kind}`,
        nodeId: n.id,
        nodeLabel,
        kind: c.kind,
        summary: c.summary
      });
    }
  }
  return out;
}
