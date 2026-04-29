import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { combineGraphs } from "../../lib/graphBranch";
import {
  counselApply,
  counselCollisions,
  counselDebateStep,
  counselFactQuestion,
  counselFinalize,
  counselNgtOpinion,
  counselProblemTurn,
  counselRankVotes,
  counselVoteOptions,
  storeCounselMinutes,
  type CounselPersona
} from "../../lib/counselApi";
import { useI18n } from "../../i18n/useI18n";
import type { MindmapJson } from "../../types/mindmap";
import { REVIEW_PERSONAS } from "../../types/review";
import { presetRoundtableInstruction } from "./assistantTypes";

type Phase = "setup" | "problem" | "fact" | "collisions" | "debate" | "vote" | "finalize";

type FactThread = { messages: { role: "user" | "persona"; content: string }[] };

type Props = {
  backendBase: string;
  projectId: string;
  selectedNodeId: string | undefined;
  mainGraph: MindmapJson;
  sandboxGraph: MindmapJson;
  sourceFileIds: string[];
  payloadSkills: { name: string; instruction: string; enabled: boolean }[];
  builtinSkills: { webSearch: boolean; financialAnalyst: boolean };
  sandboxMode: boolean;
  loadMainGraph: (mm: MindmapJson) => void;
  rtLib: { name: string; instruction: string }[];
  /** When provided, new custom personas are appended to the shared roundtable library (local storage). */
  onPersistPersonaToLib?: (name: string, instruction: string) => void;
};

const HOST = "Host";
const DEBATE_AUTO_PAUSE_MS = 2000;

function buildFactDigest(
  personas: CounselPersona[],
  threads: Record<string, FactThread>
): string {
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

function buildDebateDigest(
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

function summarizeCounselVotes(
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
    const voter =
      nameById.get(pid) || String(e.persona_name ?? "").trim() || pid || "?";
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

export default function AssistantCounselFlow(props: Props) {
  const { t } = useI18n();
  const {
    backendBase,
    projectId,
    selectedNodeId,
    mainGraph,
    sandboxGraph,
    sourceFileIds,
    payloadSkills,
    builtinSkills,
    sandboxMode,
    loadMainGraph,
    rtLib,
    onPersistPersonaToLib
  } = props;

  const combined = useMemo(() => combineGraphs(mainGraph, sandboxGraph), [mainGraph, sandboxGraph]);

  const [phase, setPhase] = useState<Phase>("setup");
  const [personas, setPersonas] = useState<CounselPersona[]>([]);
  const [problemDraft, setProblemDraft] = useState("");
  const [problemTranscript, setProblemTranscript] = useState<{ role: string; content: string }[]>([]);
  const [problemSummary, setProblemSummary] = useState("");
  const [slugKeywords, setSlugKeywords] = useState("");
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newPersonaInstruction, setNewPersonaInstruction] = useState("");
  const [factThreads, setFactThreads] = useState<Record<string, FactThread>>({});
  const [questionsAsked, setQuestionsAsked] = useState<Record<string, number>>({});
  const [opinions, setOpinions] = useState<Record<string, string>>({});
  const [collisionAreas, setCollisionAreas] = useState<
    { id: string; title: string; positions?: unknown[] }[]
  >([]);
  const [selectedCollisionIds, setSelectedCollisionIds] = useState<Set<string>>(new Set());
  const [debateTranscripts, setDebateTranscripts] = useState<
    Record<string, { speaker: string; content: string }[]>
  >({});
  const [debateAreaIdx, setDebateAreaIdx] = useState(0);
  const [debateMsgCount, setDebateMsgCount] = useState(0);
  const [debateMsgLimit, setDebateMsgLimit] = useState(30);
  const [debatePaused, setDebatePaused] = useState(false);
  const [debateUserLine, setDebateUserLine] = useState("");
  const [voteOptionAreas, setVoteOptionAreas] = useState<
    { area_id: string; options: { id: string; label: string }[] }[]
  >([]);
  const [rawVotes, setRawVotes] = useState<unknown[] | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<{
    recommendation: string;
    patch: Record<string, unknown>;
    discussion_summary: string;
    recommended_mindmap_changes: string;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [factSkippedIds, setFactSkippedIds] = useState<Record<string, boolean>>({});
  const [factLoading, setFactLoading] = useState<Record<string, boolean>>({});
  const factInFlightRef = useRef<Set<string>>(new Set());
  const fetchFactQuestionRef = useRef<(p: CounselPersona) => Promise<void>>(async () => {});

  const graphPayload = useMemo(
    () => ({
      full_nodes: combined.nodes,
      full_edges: combined.edges,
      selected_node_id: selectedNodeId || "",
      branch_root_id: selectedNodeId || ""
    }),
    [combined.nodes, combined.edges, selectedNodeId]
  );

  const sourcePayload = useMemo(
    () => ({
      project_id: projectId || undefined,
      source_file_ids: sourceFileIds.length > 0 ? sourceFileIds : undefined,
      source_max_chars: 32000
    }),
    [projectId, sourceFileIds]
  );

  const addPersonaFromLib = useCallback((name: string, instruction: string) => {
    const n = name.trim();
    const ins = instruction.trim();
    if (!n || !ins) return;
    if (personas.length >= 8) return;
    if (personas.some((p) => p.name.toLowerCase() === n.toLowerCase())) return;
    const id = `cns_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    setPersonas((prev) => [...prev, { id, name: n, instruction: ins.slice(0, 8000) }]);
  }, [personas]);

  const removePersona = useCallback((id: string) => {
    setPersonas((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const resetSession = useCallback(() => {
    setPhase("setup");
    setProblemTranscript([]);
    setProblemSummary("");
    setSlugKeywords("");
    setFactThreads({});
    setQuestionsAsked({});
    setOpinions({});
    setCollisionAreas([]);
    setSelectedCollisionIds(new Set());
    setDebateTranscripts({});
    setDebateAreaIdx(0);
    setDebateMsgCount(0);
    setDebateMsgLimit(30);
    setDebatePaused(false);
    setVoteOptionAreas([]);
    setRawVotes(null);
    setFinalizeResult(null);
    setNewPersonaName("");
    setNewPersonaInstruction("");
    setFactSkippedIds({});
    setFactLoading({});
    factInFlightRef.current = new Set();
    setError("");
  }, []);

  const addPresetPersona = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n || personas.length >= 8) return;
      if (personas.some((p) => p.name.toLowerCase() === n.toLowerCase())) return;
      const id = `cns_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      setPersonas((prev) => [...prev, { id, name: n, instruction: presetRoundtableInstruction(n).slice(0, 8000) }]);
    },
    [personas]
  );

  const addCustomPersona = useCallback(() => {
    const name = newPersonaName.trim().slice(0, 120);
    const instruction = newPersonaInstruction.trim().slice(0, 8000);
    if (!name || !instruction || personas.length >= 8) return;
    if (personas.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    const id = `cns_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    setPersonas((prev) => [...prev, { id, name, instruction }]);
    onPersistPersonaToLib?.(name, instruction.slice(0, 4000));
    setNewPersonaName("");
    setNewPersonaInstruction("");
  }, [newPersonaName, newPersonaInstruction, personas, onPersistPersonaToLib]);

  const runProblemTurn = useCallback(async () => {
    if (!selectedNodeId?.trim()) {
      setError(t("counsel_err_node"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const out = await counselProblemTurn(backendBase, {
        ...graphPayload,
        ...sourcePayload,
        user_problem_draft: problemDraft,
        transcript: problemTranscript.map((x) => ({ role: x.role, content: x.content }))
      });
      setProblemTranscript((prev) => [...prev, { role: "host", content: out.message }]);
      if (out.kind === "summary_ready" && !problemSummary) {
        setProblemSummary(out.message);
        const firstLine = out.message.split("\n")[0]?.slice(0, 60) || "session";
        setSlugKeywords(firstLine.replace(/[^\w\s-]/g, "").trim().slice(0, 80) || "session");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [
    backendBase,
    graphPayload,
    sourcePayload,
    problemDraft,
    problemTranscript,
    selectedNodeId,
    problemSummary,
    t
  ]);

  const submitProblemUser = useCallback(async () => {
    const line = problemDraft.trim();
    if (!line) return;
    const nextTranscript = [...problemTranscript, { role: "user", content: line }];
    setProblemTranscript(nextTranscript);
    setProblemDraft("");
    setBusy(true);
    setError("");
    try {
      const out = await counselProblemTurn(backendBase, {
        ...graphPayload,
        ...sourcePayload,
        user_problem_draft: "",
        transcript: nextTranscript.map((x) => ({ role: x.role, content: x.content }))
      });
      setProblemTranscript((prev) => [...prev, { role: "host", content: out.message }]);
      if (out.kind === "summary_ready") {
        setProblemSummary(out.message);
        const firstLine = out.message.split("\n")[0]?.slice(0, 60) || "session";
        setSlugKeywords(firstLine.replace(/[^\w\s-]/g, "").trim().slice(0, 80) || "session");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [backendBase, graphPayload, sourcePayload, problemDraft, problemTranscript]);

  const acceptProblem = useCallback(() => {
    const s = problemSummary.trim();
    const slug = slugKeywords.trim();
    if (!s || !slug) return;
    const init: Record<string, FactThread> = {};
    const qa: Record<string, number> = {};
    for (const p of personas) {
      init[p.id] = { messages: [] };
      qa[p.id] = 0;
    }
    setFactThreads(init);
    setQuestionsAsked(qa);
    setFactSkippedIds({});
    setFactLoading({});
    factInFlightRef.current = new Set();
    setPhase("fact");
  }, [problemSummary, slugKeywords, personas]);

  const fetchFactQuestion = useCallback(
    async (persona: CounselPersona) => {
      if (!problemSummary.trim()) return;
      if (factSkippedIds[persona.id]) return;
      if (factInFlightRef.current.has(persona.id)) return;
      const qn = questionsAsked[persona.id] ?? 0;
      if (qn >= 3) return;
      factInFlightRef.current.add(persona.id);
      setFactLoading((prev) => ({ ...prev, [persona.id]: true }));
      setError("");
      const th = factThreads[persona.id] || { messages: [] };
      try {
        const out = await counselFactQuestion(backendBase, {
          ...graphPayload,
          ...sourcePayload,
          persona_id: persona.id,
          persona_name: persona.name,
          persona_instruction: persona.instruction,
          problem_summary: problemSummary,
          questions_asked_so_far: qn,
          thread: th.messages.map((m) => ({ role: m.role, content: m.content }))
        });
        const qtext = out.question?.trim();
        if (qtext) {
          setFactThreads((prev) => ({
            ...prev,
            [persona.id]: {
              messages: [...(prev[persona.id]?.messages || []), { role: "persona", content: qtext }]
            }
          }));
          setQuestionsAsked((prev) => ({ ...prev, [persona.id]: (prev[persona.id] ?? 0) + 1 }));
        } else {
          setFactSkippedIds((prev) => ({ ...prev, [persona.id]: true }));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "error");
        setFactSkippedIds((prev) => ({ ...prev, [persona.id]: true }));
      } finally {
        factInFlightRef.current.delete(persona.id);
        setFactLoading((prev) => {
          const next = { ...prev };
          delete next[persona.id];
          return next;
        });
      }
    },
    [backendBase, graphPayload, sourcePayload, problemSummary, factThreads, questionsAsked, factSkippedIds]
  );

  fetchFactQuestionRef.current = fetchFactQuestion;

  useEffect(() => {
    if (phase !== "fact") return;
    const fn = fetchFactQuestionRef.current;
    for (const p of personas) {
      if (factSkippedIds[p.id]) continue;
      const th = factThreads[p.id]?.messages ?? [];
      const na = questionsAsked[p.id] ?? 0;
      if (na >= 3) continue;
      const last = th[th.length - 1];
      const needs = th.length === 0 || last?.role === "user";
      if (!needs) continue;
      if (factInFlightRef.current.has(p.id)) continue;
      void fn(p);
    }
  }, [phase, personas, factThreads, questionsAsked, factSkippedIds]);

  const submitFactAnswer = useCallback((personaId: string, text: string) => {
    const line = text.trim();
    if (!line) return;
    setFactThreads((prev) => ({
      ...prev,
      [personaId]: {
        messages: [...(prev[personaId]?.messages || []), { role: "user", content: line }]
      }
    }));
  }, []);

  const factFindingComplete = useMemo(() => {
    if (personas.length === 0) return false;
    return personas.every((p) => {
      if (factSkippedIds[p.id]) return true;
      const th = factThreads[p.id]?.messages ?? [];
      const na = questionsAsked[p.id] ?? 0;
      if (na < 3) return false;
      return th[th.length - 1]?.role === "user";
    });
  }, [personas, factThreads, questionsAsked, factSkippedIds]);

  const factBusyAny = Object.keys(factLoading).length > 0;

  const runNgt = useCallback(async () => {
    const digest = buildFactDigest(personas, factThreads);
    setBusy(true);
    setError("");
    const next: Record<string, string> = {};
    try {
      for (const p of personas) {
        const out = await counselNgtOpinion(backendBase, {
          ...graphPayload,
          ...sourcePayload,
          persona_name: p.name,
          persona_instruction: p.instruction,
          problem_summary: problemSummary,
          fact_digest: digest
        });
        next[p.id] = out.opinion;
      }
      const collOut = await counselCollisions(backendBase, {
        problem_summary: problemSummary,
        personas,
        opinions: next
      });
      const areas = (collOut.areas as { id?: string; title?: string; positions?: unknown[] }[]).map(
        (a, i) => ({
          id: String(a.id || `area_${i}`),
          title: String(a.title || a.id || `Area ${i + 1}`),
          positions: a.positions
        })
      );
      setCollisionAreas(areas);
      setOpinions(next);
      setPhase("collisions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [backendBase, graphPayload, sourcePayload, personas, factThreads, problemSummary]);

  const runCollisions = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const out = await counselCollisions(backendBase, {
        problem_summary: problemSummary,
        personas,
        opinions
      });
      setCollisionAreas(
        (out.areas as { id?: string; title?: string; positions?: unknown[] }[]).map((a, i) => ({
          id: String(a.id || `area_${i}`),
          title: String(a.title || a.id || `Area ${i + 1}`),
          positions: a.positions
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [backendBase, problemSummary, personas, opinions]);

  const toggleCollision = useCallback((id: string) => {
    setSelectedCollisionIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else if (n.size < 3) n.add(id);
      return n;
    });
  }, []);

  const startDebate = useCallback(() => {
    if (selectedCollisionIds.size < 1) return;
    const dict: Record<string, { speaker: string; content: string }[]> = {};
    for (const id of selectedCollisionIds) {
      dict[id] = [];
    }
    setDebateTranscripts(dict);
    setDebateAreaIdx(0);
    setDebateMsgCount(0);
    setDebateMsgLimit(30);
    setDebatePaused(false);
    setPhase("debate");
  }, [selectedCollisionIds]);

  const selectedAreaList = useMemo(() => {
    return collisionAreas.filter((a) => selectedCollisionIds.has(a.id));
  }, [collisionAreas, selectedCollisionIds]);

  const currentDebateArea = selectedAreaList[debateAreaIdx];

  const advanceDebate = useCallback(async () => {
    if (!currentDebateArea || debatePaused) return;
    if (debateMsgCount >= debateMsgLimit) {
      setError(t("counsel_debate_limit"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const tid = currentDebateArea.id;
      const transcript = debateTranscripts[tid] || [];
      const out = await counselDebateStep(backendBase, {
        ...graphPayload,
        problem_summary: problemSummary,
        area: currentDebateArea,
        personas,
        transcript
      });
      const utter = (out.utterance || "").trim();
      if (!out.passed && utter) {
        setDebateTranscripts((prev) => ({
          ...prev,
          [tid]: [...(prev[tid] || []), { speaker: out.next_speaker, content: utter }]
        }));
        setDebateMsgCount((c) => c + 1);
      } else if (out.passed) {
        setDebateTranscripts((prev) => ({
          ...prev,
          [tid]: [...(prev[tid] || []), { speaker: out.next_speaker, content: "(pass)" }]
        }));
        setDebateMsgCount((c) => c + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [
    backendBase,
    graphPayload,
    problemSummary,
    currentDebateArea,
    personas,
    debateTranscripts,
    debateMsgCount,
    debateMsgLimit,
    debatePaused,
    t
  ]);

  const advanceDebateRef = useRef(advanceDebate);
  advanceDebateRef.current = advanceDebate;

  useEffect(() => {
    if (phase !== "debate") return;
    if (debatePaused) return;
    if (!currentDebateArea) return;
    if (debateMsgCount >= debateMsgLimit) return;
    if (busy) return;

    const timer = window.setTimeout(() => {
      void advanceDebateRef.current();
    }, DEBATE_AUTO_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, debatePaused, currentDebateArea?.id, debateMsgCount, debateMsgLimit, busy, debateAreaIdx]);

  const endCurrentAreaOrNext = useCallback(() => {
    if (debateAreaIdx + 1 < selectedAreaList.length) {
      setDebateAreaIdx((i) => i + 1);
      setDebateMsgCount(0);
      setDebateMsgLimit(30);
      setError("");
    } else {
      setPhase("vote");
    }
  }, [debateAreaIdx, selectedAreaList.length]);

  const submitDebateUser = useCallback(() => {
    const line = debateUserLine.trim();
    const tid = currentDebateArea?.id;
    if (!tid || !line) return;
    setDebateTranscripts((prev) => ({
      ...prev,
      [tid]: [...(prev[tid] || []), { speaker: "User", content: line }]
    }));
    setDebateUserLine("");
    setDebatePaused(false);
    setDebateMsgCount((c) => c + 1);
  }, [debateUserLine, currentDebateArea]);

  const runVoteOptions = useCallback(async () => {
    const digest = buildDebateDigest(selectedAreaList, debateTranscripts);
    setBusy(true);
    setError("");
    try {
      const out = await counselVoteOptions(backendBase, {
        problem_summary: problemSummary,
        selected_areas: selectedAreaList.map((a) => ({ id: a.id, title: a.title })),
        debate_digest: digest
      });
      const areas = (out.areas || []) as { area_id?: string; options?: { id: string; label: string }[] }[];
      const norm = areas
        .map((a) => ({
          area_id: String(a.area_id || ""),
          options: (a.options || []).slice(0, 2).map((o) => ({
            id: String(o.id),
            label: String(o.label)
          }))
        }))
        .filter((a) => a.area_id && a.options.length > 0);
      setVoteOptionAreas(norm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [backendBase, problemSummary, selectedAreaList, debateTranscripts]);

  const runRankVotes = useCallback(async () => {
    if (!voteOptionAreas.length) return;
    setBusy(true);
    setError("");
    try {
      const out = await counselRankVotes(backendBase, {
        problem_summary: problemSummary,
        personas,
        options_payload: voteOptionAreas
      });
      setRawVotes(out.votes || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [backendBase, problemSummary, personas, voteOptionAreas]);

  const runFinalize = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const voteText = JSON.stringify(
        { options: voteOptionAreas, votes: rawVotes },
        null,
        2
      ).slice(0, 45000);
      const out = await counselFinalize(backendBase, {
        ...graphPayload,
        problem_summary: problemSummary,
        vote_summary_text: voteText,
        custom_skills: payloadSkills.filter((s) => s.enabled),
        builtin_skills: builtinSkills,
        sandbox_mode: sandboxMode
      });
      setFinalizeResult({
        recommendation: out.recommendation,
        patch: out.patch as Record<string, unknown>,
        discussion_summary: out.discussion_summary,
        recommended_mindmap_changes: out.recommended_mindmap_changes
      });
      setPhase("finalize");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [
    backendBase,
    graphPayload,
    problemSummary,
    voteOptionAreas,
    rawVotes,
    payloadSkills,
    builtinSkills,
    sandboxMode
  ]);

  const applyAll = useCallback(async () => {
    if (!finalizeResult || !selectedNodeId?.trim() || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const minutes = [
        `# Counsel minutes (${slugKeywords || "session"})`,
        "",
        "## Problem",
        problemSummary,
        "",
        "## Host discussion summary",
        finalizeResult.discussion_summary,
        "",
        "## Recommended changes",
        finalizeResult.recommended_mindmap_changes,
        "",
        "## Recommendation",
        finalizeResult.recommendation
      ].join("\n");
      await storeCounselMinutes(backendBase, projectId, slugKeywords || "session", minutes);
      const mm = await counselApply(backendBase, {
        ...graphPayload,
        patch: finalizeResult.patch
      });
      loadMainGraph(mm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }, [finalizeResult, selectedNodeId, projectId, backendBase, graphPayload, slugKeywords, problemSummary, loadMainGraph]);

  const voteSummary = useMemo(
    () => summarizeCounselVotes(rawVotes, voteOptionAreas, personas, collisionAreas),
    [rawVotes, voteOptionAreas, personas, collisionAreas]
  );

  const stageEntries = useMemo(
    () =>
      (
        [
          ["setup", "counsel_stage_setup"],
          ["problem", "counsel_stage_problem"],
          ["fact", "counsel_stage_fact"],
          ["collisions", "counsel_stage_collisions"],
          ["debate", "counsel_stage_debate"],
          ["vote", "counsel_stage_vote"],
          ["finalize", "counsel_stage_finalize"]
        ] as const
      ).map(([key, labelKey]) => ({ key: key as Phase, label: t(labelKey) })),
    [t]
  );

  if (!selectedNodeId) {
    return <p className="text-[11px] text-amber-800 dark:text-amber-200">{t("counsel_err_node")}</p>;
  }

  return (
    <div className="space-y-3 text-[11px] text-slate-800 dark:text-slate-100">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ios-button py-1 text-[10px]" onClick={() => resetSession()}>
            {t("counsel_reset")}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/80">
          {stageEntries.map(({ key, label }) => {
            const idxCurrent = stageEntries.findIndex((s) => s.key === phase);
            const idx = stageEntries.findIndex((s) => s.key === key);
            const done = idx < idxCurrent;
            const current = key === phase;
            return (
              <span
                key={key}
                className={[
                  "rounded-full px-2 py-0.5 text-[9px] font-medium ring-1 transition-colors",
                  current
                    ? "bg-sky-600 text-white ring-sky-500"
                    : done
                      ? "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600"
                      : "bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-950 dark:text-slate-500 dark:ring-slate-700"
                ].join(" ")}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
      {error ? <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p> : null}

      {phase === "setup" && (
        <div className="ios-card space-y-2 p-2">
          <p className="text-[10px] text-slate-600 dark:text-slate-400">{t("counsel_setup_help")}</p>
          <div className="text-[10px] text-slate-500">{t("counsel_personas_count", { n: personas.length })}</div>
          <ul className="max-h-32 space-y-1 overflow-auto">
            {personas.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1 dark:border-slate-600">
                <span className="font-medium">{p.name}</span>
                <button type="button" className="text-[10px] text-red-600" onClick={() => removePersona(p.id)}>
                  {t("counsel_remove")}
                </button>
              </li>
            ))}
          </ul>
          <div>
            <div className="text-[10px] font-medium">{t("counsel_add_lib")}</div>
            <div className="mt-1 flex max-h-24 flex-col gap-1 overflow-auto">
              {rtLib.map((x) => (
                <button
                  key={x.name}
                  type="button"
                  className="text-left text-[10px] text-sky-600 underline"
                  disabled={personas.length >= 8}
                  onClick={() => addPersonaFromLib(x.name, x.instruction)}
                >
                  + {x.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("rt_recommended")}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {REVIEW_PERSONAS.map((pn) => (
                <button
                  key={pn}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={personas.length >= 8}
                  onClick={() => addPresetPersona(pn)}
                >
                  + {pn}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-600">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("counsel_define_persona")}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block text-[10px] text-slate-700 dark:text-slate-200">
                {t("rt_custom_name")}
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                  value={newPersonaName}
                  onChange={(e) => setNewPersonaName(e.target.value)}
                  placeholder={t("rt_name_ph")}
                />
              </label>
              <label className="block text-[10px] text-slate-700 dark:text-slate-200 sm:col-span-2">
                {t("rt_custom_instr")}
                <textarea
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] dark:border-slate-600 dark:bg-slate-900"
                  rows={3}
                  value={newPersonaInstruction}
                  onChange={(e) => setNewPersonaInstruction(e.target.value)}
                  placeholder={t("rt_instr_ph")}
                />
              </label>
            </div>
            <button
              type="button"
              className="ios-button mt-2 w-full py-1.5 text-[11px]"
              disabled={personas.length >= 8 || !newPersonaName.trim() || !newPersonaInstruction.trim()}
              onClick={() => addCustomPersona()}
            >
              {t("rt_add_panel")}
            </button>
            {onPersistPersonaToLib ? (
              <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">{t("rt_saved_local")}</p>
            ) : null}
          </div>
          <label className="block">
            <span className="text-[10px] font-medium">{t("counsel_problem_draft")}</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] dark:border-slate-600 dark:bg-slate-900"
              rows={3}
              value={problemDraft}
              onChange={(e) => setProblemDraft(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="ios-button-primary w-full py-2 text-[11px] disabled:opacity-50"
            disabled={personas.length < 4 || personas.length > 8 || busy}
            onClick={() => {
              setPhase("problem");
              void runProblemTurn();
            }}
          >
            {t("counsel_start_problem")}
          </button>
        </div>
      )}

      {phase === "problem" && (
        <div className="ios-card space-y-2 p-2">
          <div className="max-h-40 space-y-1 overflow-auto text-[10px]">
            {problemTranscript.map((row, i) => (
              <div key={i} className={row.role === "host" ? "text-sky-800 dark:text-sky-200" : ""}>
                <strong>{row.role === "host" ? HOST : "You"}:</strong> {row.content}
              </div>
            ))}
          </div>
          <textarea
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] dark:border-slate-600 dark:bg-slate-900"
            rows={2}
            placeholder={t("counsel_reply_host")}
            value={problemDraft}
            onChange={(e) => setProblemDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" className="ios-button-primary flex-1 py-1.5 text-[11px]" disabled={busy} onClick={() => void submitProblemUser()}>
              {t("counsel_send")}
            </button>
            <button type="button" className="ios-button flex-1 py-1.5 text-[11px]" disabled={busy} onClick={() => void runProblemTurn()}>
              {t("counsel_host_turn")}
            </button>
          </div>
          <label className="block">
            <span className="text-[10px] font-medium">{t("counsel_accept_summary")}</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] dark:border-slate-600 dark:bg-slate-900"
              rows={5}
              value={problemSummary}
              onChange={(e) => setProblemSummary(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium">{t("counsel_slug")}</span>
            <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">{t("counsel_slug_help")}</p>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] dark:border-slate-600 dark:bg-slate-900"
              value={slugKeywords}
              onChange={(e) => setSlugKeywords(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="ios-button-primary w-full py-2 text-[11px]"
            disabled={!problemSummary.trim() || !slugKeywords.trim() || busy}
            onClick={() => acceptProblem()}
          >
            {t("counsel_accept_problem")}
          </button>
        </div>
      )}

      {phase === "fact" && (
        <div className="ios-card space-y-2 p-2">
          <p className="text-[10px] text-slate-600 dark:text-slate-400">{t("counsel_fact_help")}</p>
          {personas.map((p) => {
            const msgs = factThreads[p.id]?.messages || [];
            const last = msgs[msgs.length - 1];
            const waitingAnswer =
              (questionsAsked[p.id] ?? 0) < 3 &&
              !factSkippedIds[p.id] &&
              msgs.length > 0 &&
              last?.role === "persona";
            return (
              <div key={p.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-600">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-[9px] text-slate-500 dark:text-slate-400">
                    {t("counsel_fact_quota", { n: questionsAsked[p.id] ?? 0 })}
                  </div>
                </div>
                {factLoading[p.id] ? (
                  <p className="mt-1 text-[9px] text-sky-700 dark:text-sky-300">{t("counsel_fact_thinking")}</p>
                ) : null}
                {waitingAnswer ? (
                  <p className="mt-1 text-[9px] text-amber-800 dark:text-amber-200">{t("counsel_fact_reply_hint")}</p>
                ) : null}
                <div className="mt-1 max-h-24 space-y-0.5 overflow-auto text-[10px]">
                  {msgs.map((m, i) => (
                    <div key={i}>
                      {m.role === "persona" ? p.name : "You"}: {m.content}
                    </div>
                  ))}
                </div>
                <FactAnswerInline onSubmit={(txt) => submitFactAnswer(p.id, txt)} disabled={factLoading[p.id]} />
              </div>
            );
          })}
          <button
            type="button"
            className="ios-button-primary w-full py-2 text-[11px]"
            disabled={!factFindingComplete || busy || factBusyAny}
            onClick={() => void runNgt()}
          >
            {t("counsel_fact_continue_ngt")}
          </button>
        </div>
      )}

      {phase === "collisions" && (
        <div className="ios-card space-y-2 p-2">
          {collisionAreas.length === 0 ? (
            <button type="button" className="ios-button-primary w-full py-2" disabled={busy} onClick={() => void runCollisions()}>
              {t("counsel_run_collisions")}
            </button>
          ) : (
            <>
              {collisionAreas.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 p-2 dark:border-slate-600">
                  <input
                    type="checkbox"
                    checked={selectedCollisionIds.has(a.id)}
                    onChange={() => toggleCollision(a.id)}
                    disabled={!selectedCollisionIds.has(a.id) && selectedCollisionIds.size >= 3}
                  />
                  <div>
                    <div className="font-medium">{a.title}</div>
                  </div>
                </label>
              ))}
              <button type="button" className="ios-button-primary w-full py-2" disabled={selectedCollisionIds.size < 1 || busy} onClick={() => startDebate()}>
                {t("counsel_start_debate")}
              </button>
            </>
          )}
        </div>
      )}

      {phase === "debate" && currentDebateArea && (
        <div className="ios-card space-y-2 p-2">
          <div className="text-[10px]">
            {t("counsel_debate_area", { title: currentDebateArea.title })}{" "}
            ({debateMsgCount}/{debateMsgLimit} {t("counsel_messages")})
          </div>
          {debateMsgCount < debateMsgLimit && !debatePaused ? (
            <p className="text-[9px] leading-snug text-slate-500 dark:text-slate-400">{t("counsel_debate_auto")}</p>
          ) : null}
          <div className="max-h-36 space-y-1 overflow-auto text-[10px]">
            {(debateTranscripts[currentDebateArea.id] || []).map((row, i) => (
              <div key={i}>
                <strong>{row.speaker}:</strong> {row.content}
              </div>
            ))}
          </div>
          {debateMsgCount >= debateMsgLimit ? (
            <div className="flex gap-2">
              <button type="button" className="ios-button flex-1 text-[10px]" onClick={() => endCurrentAreaOrNext()}>
                {t("counsel_end_area")}
              </button>
              <button
                type="button"
                className="ios-button flex-1 text-[10px]"
                onClick={() => {
                  setDebateMsgLimit((n) => n + 10);
                  setError("");
                }}
              >
                {t("counsel_extend_10")}
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="ios-button-primary w-full py-2 text-[11px]" disabled={busy || debatePaused} onClick={() => void advanceDebate()}>
                {t("counsel_debate_advance")}
              </button>
              <button type="button" className="ios-button w-full py-1 text-[10px]" onClick={() => setDebatePaused((p) => !p)}>
                {debatePaused ? t("counsel_join_resume") : t("counsel_join_pause")}
              </button>
              {debatePaused ? (
                <div>
                  <textarea
                    className="w-full rounded-lg border p-2 text-[11px]"
                    rows={2}
                    value={debateUserLine}
                    onChange={(e) => setDebateUserLine(e.target.value)}
                  />
                  <button type="button" className="ios-button-primary mt-1 w-full py-1 text-[10px]" onClick={() => submitDebateUser()}>
                    {t("counsel_user_say")}
                  </button>
                </div>
              ) : null}
              <button type="button" className="ios-button mt-2 w-full py-1 text-[10px]" onClick={() => endCurrentAreaOrNext()}>
                {t("counsel_skip_area")}
              </button>
            </>
          )}
        </div>
      )}

      {phase === "vote" && (
        <div className="ios-card space-y-2 p-2">
          {voteOptionAreas.length === 0 ? (
            <button type="button" className="ios-button-primary w-full py-2" disabled={busy} onClick={() => void runVoteOptions()}>
              {t("counsel_gen_options")}
            </button>
          ) : (
            <>
              {voteOptionAreas.map((a) => {
                const areaHead =
                  collisionAreas.find((c) => c.id === a.area_id)?.title || a.area_id;
                return (
                <div key={a.area_id} className="rounded border border-slate-200 p-2 dark:border-slate-600">
                  <div className="text-[10px] font-medium">{areaHead}</div>
                  <ul className="mt-1 list-inside list-disc text-[10px]">
                    {a.options.map((o) => (
                      <li key={o.id}>{o.label}</li>
                    ))}
                  </ul>
                </div>
              );
              })}
              {!rawVotes?.length ? (
                <button type="button" className="ios-button-primary w-full py-2" disabled={busy} onClick={() => void runRankVotes()}>
                  {t("counsel_simulate_votes")}
                </button>
              ) : (
                <>
                  <div className="rounded-lg border border-slate-200 bg-white/80 p-2 dark:border-slate-600 dark:bg-slate-900/40">
                    <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                      {t("counsel_vote_results")}
                    </div>
                    <div className="mt-2 max-h-64 space-y-3 overflow-y-auto text-[10px]">
                      {voteSummary.length === 0 ? (
                        <p className="text-slate-500">{t("counsel_vote_results_empty")}</p>
                      ) : (
                        voteSummary.map((block, i) => (
                          <div key={`${block.voter}-${i}`} className="rounded border border-slate-100 px-2 py-1.5 dark:border-slate-700">
                            <div className="font-medium text-sky-900 dark:text-sky-100">{block.voter}</div>
                            <ul className="mt-1 list-inside space-y-1 text-slate-700 dark:text-slate-300">
                              {block.rows.map((row, j) => (
                                <li key={j}>
                                  <span className="font-medium">{row.areaTitle}</span>
                                  {": "}
                                  {row.order.map((label, k) => (
                                    <span key={k}>
                                      {k > 0 ? " → " : ""}
                                      <span className="text-slate-500 dark:text-slate-400">{k + 1}.</span> {label}
                                    </span>
                                  ))}
                                  {row.rationale ? (
                                    <div className="mt-0.5 pl-0.5 text-[9px] leading-snug text-slate-600 dark:text-slate-400">
                                      {row.rationale}
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <button type="button" className="ios-button-primary w-full py-2" disabled={busy} onClick={() => void runFinalize()}>
                    {t("counsel_finalize")}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {phase === "finalize" && finalizeResult && (
        <div className="ios-card space-y-2 p-2">
          <div className="text-[10px] font-medium">{t("counsel_recommendation")}</div>
          <p className="whitespace-pre-wrap text-[10px]">{finalizeResult.recommendation}</p>
          <button
            type="button"
            className="ios-button-primary w-full py-2"
            disabled={busy || !projectId}
            onClick={() => void applyAll()}
          >
            {t("counsel_apply_and_minutes")}
          </button>
        </div>
      )}
    </div>
  );
}

function FactAnswerInline({ onSubmit, disabled }: { onSubmit: (s: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="mt-1 flex gap-1">
      <input
        className="flex-1 rounded border border-slate-200 px-2 py-1 text-[10px] dark:border-slate-600 dark:bg-slate-900"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Answer"
      />
      <button
        type="button"
        className="ios-button shrink-0 py-1 text-[10px]"
        disabled={disabled}
        onClick={() => {
          onSubmit(draft);
          setDraft("");
        }}
      >
        OK
      </button>
    </div>
  );
}
