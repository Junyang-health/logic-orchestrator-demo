import type { MindmapJson } from "../types/mindmap";
import { mergeBranchSubgraphs } from "./graphBranch";

/**
 * Markdown outline for a mindmap subgraph (parent → child edges), rooted at `rootIds`.
 */
export function mindmapBranchSelectionToMarkdown(full: MindmapJson, rootIds: string[]): string {
  const sub = mergeBranchSubgraphs(rootIds, full);
  if (sub.nodes.length === 0) {
    return "# Mindmap export\n\n_No nodes in the selected branches._\n";
  }

  const nodeById = new Map(sub.nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const e of sub.edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    const list = children.get(e.source);
    if (list) list.push(e.target);
    else children.set(e.source, [e.target]);
  }

  const visited = new Set<string>();
  const lines: string[] = ["# Mindmap export", ""];

  const rootsListed = rootIds
    .map((id) => nodeById.get(id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n));
  if (rootsListed.length) {
    lines.push("## Selected branch roots");
    for (const n of rootsListed) {
      lines.push(`- **${n.label}** (\`${n.id}\`, _${n.type || "node"}_)`);
    }
    lines.push("");
  }

  lines.push("## Outline");
  lines.push("");

  const fmtNode = (n: (typeof sub.nodes)[number]) => {
    const bits = [`**${n.type || "node"}**`, n.label.replace(/\n/g, " ")];
    if (n.status && n.status !== "firm") bits.push(`_${n.status}_`);
    return bits.join(" · ");
  };

  const dfs = (nodeId: string, depth: number) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const n = nodeById.get(nodeId);
    if (!n) return;
    const pad = "  ".repeat(depth);
    lines.push(`${pad}- ${fmtNode(n)}`);
    for (const c of children.get(nodeId) ?? []) dfs(c, depth + 1);
  };

  for (const id of rootIds) {
    if (nodeById.has(id) && !visited.has(id)) dfs(id, 0);
  }

  const orphans = sub.nodes.filter((n) => !visited.has(n.id));
  if (orphans.length) {
    lines.push("");
    lines.push("## Other nodes in merged selection");
    lines.push("");
    for (const n of orphans) dfs(n.id, 0);
  }

  lines.push("");
  lines.push(`_Exported nodes: ${sub.nodes.length}, edges: ${sub.edges.length}_`);
  lines.push("");
  return lines.join("\n");
}
