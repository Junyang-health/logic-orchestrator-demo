import type { CounselPersona } from "../../lib/counselApi";
import type { FactThread } from "./counselSessionState";

export function buildFactDigest(personas: CounselPersona[], threads: Record<string, FactThread>): string {
  const lines: string[] = [];
  for (const p of personas) {
    const th = threads[p.id];
    if (!th?.messages.length) continue;
    lines.push(`## ${p.name}`);
    for (const m of th.messages) {
      lines.push(`${m.role === "persona" ? p.name : "User"}: ${m.content}`);
    }
    lines.push("");
  }
  return lines.join("\n").slice(0, 31000) || "(no fact threads)";
}

export function buildDebateDigest(
  areas: { id: string; title?: string }[],
  transcripts: Record<string, { speaker: string; content: string }[]>
): string {
  const lines: string[] = [];
  for (const a of areas) {
    lines.push(`### ${a.title || a.id}`);
    const t = transcripts[a.id] || [];
    for (const row of t) {
      lines.push(`${row.speaker}: ${row.content}`);
    }
    lines.push("");
  }
  return lines.join("\n").slice(0, 47000);
}

export function summarizeCounselVotes(
  rawVotes: unknown[] | null,
  voteOptionAreas: { area_id: string; options: { id: string; label: string }[] }[],
  personas: CounselPersona[],
  collisionAreas: { id: string; title: string }[]
): { voter: string; rows: { areaTitle: string; order: string[]; rationale: string }[] }[] {
  const areaTitle = new Map(collisionAreas.map((a) => [a.id, a.title]));
  const labelByArea = new Map<string, Map<string, string>>();
  for (const a of voteOptionAreas) {
    labelByArea.set(a.area_id, new Map(a.options.map((o) => [o.id, o.label])));
  }
  const nameById = new Map(personas.map((p) => [p.id, p.name]));
  if (!rawVotes?.length) return [];
  const out: { voter: string; rows: { areaTitle: string; order: string[]; rationale: string }[] }[] = [];
  for (const entry of rawVotes) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const pid = String(e.persona_id ?? "");
    const voter = nameById.get(pid) || String(e.persona_name ?? "").trim() || pid || "?";
    const rankings = e.rankings;
    if (!Array.isArray(rankings)) continue;
    const rows: { areaTitle: string; order: string[]; rationale: string }[] = [];
    for (const r of rankings) {
      if (!r || typeof r !== "object") continue;
      const rr = r as Record<string, unknown>;
      const aid = String(rr.area_id ?? "");
      const ids = rr.ranked_option_ids;
      if (!Array.isArray(ids)) continue;
      const idLabels = labelByArea.get(aid);
      const order = ids.map((id) => idLabels?.get(String(id)) || String(id));
      const rationale = String(rr.rationale ?? rr.reason ?? "").trim();
      rows.push({ areaTitle: areaTitle.get(aid) || aid, order, rationale });
    }
    out.push({ voter, rows });
  }
  return out;
}
