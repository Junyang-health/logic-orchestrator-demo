import type { CounselPersona } from "../../lib/counselApi";
import { counselInitials } from "./counselHudUtils";

export type VoteFootprint = { voter: string; initials: string; rationale: string };

export type VoteSummaryBlock = {
  voter: string;
  rows: { areaTitle: string; order: string[]; rationale: string }[];
};

export type AreaLeaderboardRow = {
  areaId: string;
  areaTitle: string;
  winner: { label: string; bubbles: VoteFootprint[] };
  runnerUp: { label: string; bubbles: VoteFootprint[] };
  winnerCount: number;
  runnerUpCount: number;
};

function personaSentimentKey(p: CounselPersona): string {
  return (p.name.trim().toLowerCase() || p.id).trim();
}

/** Short MONOSPACE-style tag from area title, e.g. "Regulatory / EU" → "REGULATORY" */
export function areaTitleToDimTag(title: string): string {
  const t = title.trim();
  if (!t) return "DIMENSION";
  const first = t.split(/[/|,—\-–]/)[0]?.trim() || t;
  const word = first.split(/\s+/)[0] || first;
  const cleaned = word.replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned || "DIMENSION").toUpperCase().slice(0, 22);
}

export function countStrategicPatchTouches(patch: Record<string, unknown>): number {
  const u = Array.isArray(patch.update_nodes) ? patch.update_nodes.length : 0;
  const a = Array.isArray(patch.add_nodes) ? patch.add_nodes.length : 0;
  const r = Array.isArray(patch.remove_node_ids) ? patch.remove_node_ids.length : 0;
  return u + a + r;
}

export function buildAreaLeaderboards(
  voteSummary: VoteSummaryBlock[],
  voteOptionAreas: { area_id: string; options: { id: string; label: string }[] }[],
  collisionAreas: { id: string; title: string }[]
): AreaLeaderboardRow[] {
  const out: AreaLeaderboardRow[] = [];
  for (const va of voteOptionAreas) {
    const title = collisionAreas.find((c) => c.id === va.area_id)?.title || va.area_id;
    const byLabel = new Map<string, VoteFootprint[]>();
    for (const b of voteSummary) {
      const row = b.rows.find((r) => r.areaTitle === title);
      const top = row?.order[0]?.trim();
      if (!top) continue;
      const bubble: VoteFootprint = {
        voter: b.voter,
        initials: counselInitials(b.voter),
        rationale: String(row?.rationale ?? "").trim()
      };
      const arr = byLabel.get(top) || [];
      arr.push(bubble);
      byLabel.set(top, arr);
    }

    const ranked = [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length);
    const optLabels = va.options.map((o) => o.label);
    let winnerLabel = ranked[0]?.[0] || optLabels[0] || "?";
    let winnerBubbles = ranked[0]?.[1] || [];
    let runnerLabel = ranked[1]?.[0] || optLabels.find((l) => l !== winnerLabel) || "";
    let runnerBubbles = ranked[1]?.[1] || [];

    if (ranked.length < 2 && optLabels.length >= 2) {
      const other = optLabels.find((l) => l !== winnerLabel);
      if (other) {
        runnerLabel = other;
        runnerBubbles = byLabel.get(other) || [];
      }
    }

    out.push({
      areaId: va.area_id,
      areaTitle: title,
      winner: { label: winnerLabel, bubbles: winnerBubbles },
      runnerUp: { label: runnerLabel || "—", bubbles: runnerBubbles },
      winnerCount: winnerBubbles.length,
      runnerUpCount: runnerBubbles.length
    });
  }
  return out;
}

export type PersonaVoteSentiment = "aligned" | "dissent" | "neutral";

export function computePersonaVoteSentiment(
  voteSummary: VoteSummaryBlock[],
  voteOptionAreas: { area_id: string; options: { id: string; label: string }[] }[],
  collisionAreas: { id: string; title: string }[],
  personas: CounselPersona[]
): Record<string, PersonaVoteSentiment> {
  const majSets = new Map<string, Set<string>>();
  for (const va of voteOptionAreas) {
    const title = collisionAreas.find((c) => c.id === va.area_id)?.title || va.area_id;
    const counts = new Map<string, number>();
    for (const b of voteSummary) {
      const row = b.rows.find((r) => r.areaTitle === title);
      const top = row?.order[0]?.trim();
      if (!top) continue;
      counts.set(top, (counts.get(top) || 0) + 1);
    }
    let max = 0;
    for (const c of counts.values()) max = Math.max(max, c);
    const set = new Set<string>();
    for (const [l, c] of counts) if (c === max) set.add(l);
    majSets.set(va.area_id, set);
  }

  const out: Record<string, PersonaVoteSentiment> = {};
  for (const p of personas) {
    const key = personaSentimentKey(p);
    const block = voteSummary.find((b) => b.voter.trim().toLowerCase() === p.name.trim().toLowerCase());
    if (!block) {
      out[key] = "neutral";
      continue;
    }
    let agree = 0;
    let disagree = 0;
    let tot = 0;
    for (const va of voteOptionAreas) {
      const title = collisionAreas.find((c) => c.id === va.area_id)?.title || va.area_id;
      const row = block.rows.find((r) => r.areaTitle === title);
      const top = row?.order[0]?.trim();
      const maj = majSets.get(va.area_id);
      if (!top || !maj || maj.size === 0) continue;
      tot++;
      if (maj.has(top)) agree++;
      else disagree++;
    }
    if (tot === 0) out[key] = "neutral";
    else if (agree > disagree) out[key] = "aligned";
    else if (disagree > agree) out[key] = "dissent";
    else out[key] = "neutral";
  }
  return out;
}
