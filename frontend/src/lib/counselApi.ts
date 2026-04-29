import type { MindmapJson } from "../types/mindmap";

type Json = Record<string, unknown>;

function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

export type CounselPersona = { id: string; name: string; instruction: string };

export async function counselProblemTurn(
  backendBase: string,
  body: Json
): Promise<{ kind: string; message: string }> {
  const res = await fetch(`${backendBase}/assistant/counsel/problem-turn`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `problem-turn ${res.status}`);
  return raw as { kind: string; message: string };
}

export async function counselFactQuestion(
  backendBase: string,
  body: Json
): Promise<{ question: string | null }> {
  const res = await fetch(`${backendBase}/assistant/counsel/fact-question`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `fact ${res.status}`);
  return raw as { question: string | null };
}

export async function counselNgtOpinion(backendBase: string, body: Json): Promise<{ opinion: string }> {
  const res = await fetch(`${backendBase}/assistant/counsel/ngt-opinion`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `ngt ${res.status}`);
  return raw as { opinion: string };
}

export async function counselCollisions(
  backendBase: string,
  body: Json
): Promise<{ areas: Json[] }> {
  const res = await fetch(`${backendBase}/assistant/counsel/collisions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `collisions ${res.status}`);
  return raw as { areas: Json[] };
}

export async function counselDebateStep(backendBase: string, body: Json): Promise<{
  next_speaker: string;
  utterance: string;
  passed: boolean;
  off_track: boolean;
}> {
  const res = await fetch(`${backendBase}/assistant/counsel/debate-step`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `debate ${res.status}`);
  return raw as {
    next_speaker: string;
    utterance: string;
    passed: boolean;
    off_track: boolean;
  };
}

export async function counselVoteOptions(backendBase: string, body: Json): Promise<{ areas: Json[] }> {
  const res = await fetch(`${backendBase}/assistant/counsel/vote-options`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `vote-options ${res.status}`);
  return raw as { areas: Json[] };
}

export async function counselRankVotes(backendBase: string, body: Json): Promise<{ votes: Json[] }> {
  const res = await fetch(`${backendBase}/assistant/counsel/rank-votes`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `votes ${res.status}`);
  return raw as { votes: Json[] };
}

export async function counselFinalize(
  backendBase: string,
  body: Json
): Promise<{
  recommendation: string;
  discussion_summary: string;
  recommended_mindmap_changes: string;
  patch: Json;
}> {
  const res = await fetch(`${backendBase}/assistant/counsel/finalize`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `finalize ${res.status}`);
  return raw as {
    recommendation: string;
    discussion_summary: string;
    recommended_mindmap_changes: string;
    patch: Json;
  };
}

export async function counselApply(backendBase: string, body: Json): Promise<MindmapJson> {
  const res = await fetch(`${backendBase}/assistant/counsel/apply`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body)
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `apply ${res.status}`);
  return (raw as { mindmap: MindmapJson }).mindmap;
}

export async function storeCounselMinutes(
  backendBase: string,
  projectId: string,
  slugKeywords: string,
  markdown: string
): Promise<{ id: string; filename: string }> {
  const res = await fetch(`${backendBase}/projects/${encodeURIComponent(projectId)}/counsel-minutes`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ slug_keywords: slugKeywords, markdown })
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof raw.detail === "string" ? raw.detail : `minutes ${res.status}`);
  return { id: String(raw.id), filename: String(raw.filename) };
}
