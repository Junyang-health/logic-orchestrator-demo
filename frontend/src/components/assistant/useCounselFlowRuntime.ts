import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { FocusEvent } from "react";
import { combineGraphs } from "../../lib/graphBranch";
import { inferDebateAddressee } from "./counselHudUtils";
import {
  buildAreaLeaderboards,
  computePersonaVoteSentiment,
  countStrategicPatchTouches
} from "./counselVoteConsensus";
import {
  counselApply,
  counselCollisions,
  counselDebateStep,
  counselFactQuestion,
  counselFinalize,
  counselNgtOpinion,
  counselProblemTurn,
  counselPublicFigureInstruction,
  counselRankVotes,
  counselVoteOptions,
  storeCounselMinutes,
  type CounselPersona
} from "../../lib/counselApi";
import { useI18n } from "../../i18n/useI18n";
import { COUNSEL_ROSTER_KEY, loadCounselRoster, presetRoundtableInstruction } from "./assistantTypes";
import { getDefaultNuwaCounselRoster, getNuwaPersonaInstruction } from "./nuwaPersonaCatalog";
import { counselErrorToMessage, counselRunAsync } from "./counselRunAsync";
import type { FactThread, Phase } from "./counselSessionState";
import { useCounselSession } from "./useCounselSession";
import { COUNSEL_DEBATE_AUTO_PAUSE_MS, COUNSEL_HOST_LABEL } from "./counselFlowConstants";
import { buildFactDigest, buildDebateDigest, summarizeCounselVotes } from "./counselFlowDigests";
import type { CounselFlowProps } from "./counselFlowTypes";

export function useCounselFlowRuntime(props: CounselFlowProps) {
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
    onPersistPersonaToLib,
    onUpdatePersonaInLib,
    onRemovePersonaFromLib
  } = props;

  const combined = useMemo(() => combineGraphs(mainGraph, sandboxGraph), [mainGraph, sandboxGraph]);

  const {
    state,
    reset: resetSessionCore,
    setPhase,
    setPersonas,
    setProblemDraft,
    setProblemTranscript,
    setProblemSummary,
    setSlugKeywords,
    setNewPersonaName,
    setNewPersonaInstruction,
    setLibEditName,
    setLibEditDraft,
    setPublicFigBusy,
    setFactThreads,
    setQuestionsAsked,
    setOpinions,
    setCollisionAreas,
    setSelectedCollisionIds,
    setDebateTranscripts,
    setDebateAreaIdx,
    setDebateMsgCount,
    setDebateMsgLimit,
    setDebatePaused,
    setDebateUserLine,
    setDebateSpeedMult,
    setDebateAutoProgress,
    setDebateModeratorFloorOpen,
    setVoteOptionAreas,
    setRawVotes,
    setFinalizeResult,
    setBusy,
    setError,
    setFactSkippedIds,
    setFactLoading,
    setFactFocusPersonaId
  } = useCounselSession();

  const {
    phase,
    personas,
    problemDraft,
    problemTranscript,
    problemSummary,
    slugKeywords,
    newPersonaName,
    newPersonaInstruction,
    libEditName,
    libEditDraft,
    publicFigBusy,
    factThreads,
    questionsAsked,
    opinions,
    collisionAreas,
    selectedCollisionIds,
    debateTranscripts,
    debateAreaIdx,
    debateMsgCount,
    debateMsgLimit,
    debatePaused,
    debateUserLine,
    debateSpeedMult,
    debateAutoProgress,
    debateModeratorFloorOpen,
    voteOptionAreas,
    rawVotes,
    finalizeResult,
    busy,
    error,
    factSkippedIds,
    factLoading,
    factFocusPersonaId
  } = state;
  const factInFlightRef = useRef<Set<string>>(new Set());
  const fetchFactQuestionRef = useRef<(p: CounselPersona) => Promise<void>>(async () => {});
  const problemReplyRef = useRef<HTMLTextAreaElement>(null);
  const problemSummaryRef = useRef<HTMLTextAreaElement>(null);
  const counselRosterLoadedRef = useRef(false);

  useEffect(() => {
    if (counselRosterLoadedRef.current) return;
    counselRosterLoadedRef.current = true;
    const stored = typeof localStorage === "undefined" ? [] : loadCounselRoster();
    const fallback = getDefaultNuwaCounselRoster().map((p) => ({
      name: p.name,
      instruction: p.instruction
    }));
    const initialRoster = stored.length > 0 ? stored : fallback;
    if (initialRoster.length === 0) return;
    setPersonas((prev) => {
      if (prev.length > 0) return prev;
      return initialRoster.map((p, idx) => ({
        id: `cns_restore_${idx}_${Math.random().toString(16).slice(2, 8)}`,
        name: p.name,
        instruction: p.instruction
      }));
    });
  }, [setPersonas]);

  useEffect(() => {
    if (!counselRosterLoadedRef.current) return;
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        COUNSEL_ROSTER_KEY,
        JSON.stringify(
          personas.map((p) => ({
            name: p.name.trim().slice(0, 120),
            instruction: p.instruction.trim().slice(0, 8000)
          }))
        )
      );
    } catch {
      /* ignore */
    }
  }, [personas]);

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
    resetSessionCore();
    factInFlightRef.current = new Set();
  }, [resetSessionCore]);

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

  const addNuwaPersona = useCallback(
    (id: string, name: string) => {
      const n = name.trim();
      const ins = getNuwaPersonaInstruction(id).slice(0, 8000);
      if (!n || !ins || personas.length >= 8) return;
      if (personas.some((p) => p.name.toLowerCase() === n.toLowerCase())) return;
      const pid = `cns_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      setPersonas((prev) => [...prev, { id: pid, name: n, instruction: ins }]);
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

  const togglePresetPersona = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      const ins = presetRoundtableInstruction(n).slice(0, 8000);
      const existing = personas.find((p) => p.name.toLowerCase() === n.toLowerCase());
      if (existing && existing.instruction === ins) {
        removePersona(existing.id);
        return;
      }
      addPresetPersona(n);
    },
    [personas, removePersona, addPresetPersona]
  );

  const toggleNuwaPersona = useCallback(
    (id: string, name: string) => {
      const n = name.trim();
      const ins = getNuwaPersonaInstruction(id).slice(0, 8000);
      if (!n || !ins) return;
      const existing = personas.find((p) => p.name.toLowerCase() === n.toLowerCase() && p.instruction === ins);
      if (existing) {
        removePersona(existing.id);
        return;
      }
      addNuwaPersona(id, n);
    },
    [personas, removePersona, addNuwaPersona]
  );

  const toggleLibPersona = useCallback(
    (name: string, instruction: string) => {
      const n = name.trim();
      const ins = instruction.trim().slice(0, 8000);
      if (!n || !ins) return;
      const existing = personas.find((p) => p.name.toLowerCase() === n.toLowerCase() && p.instruction === ins);
      if (existing) {
        removePersona(existing.id);
        return;
      }
      addPersonaFromLib(n, ins);
    },
    [personas, removePersona, addPersonaFromLib]
  );

  const presetOnPanel = useCallback(
    (name: string) =>
      personas.some(
        (p) => p.name === name && p.instruction === presetRoundtableInstruction(name).slice(0, 8000)
      ),
    [personas]
  );

  const nuwaOnPanel = useCallback(
    (id: string, name: string) => {
      const ins = getNuwaPersonaInstruction(id).slice(0, 8000);
      return personas.some((p) => p.name === name && p.instruction === ins);
    },
    [personas]
  );

  const libRowOnPanel = useCallback(
    (row: { name: string; instruction: string }) =>
      personas.some((p) => p.name === row.name && p.instruction === row.instruction),
    [personas]
  );

  const presetPreview = useCallback((name: string) => presetRoundtableInstruction(name), []);

  const generatePublicFigureInstruction = useCallback(async () => {
    const name = newPersonaName.trim();
    if (!name) {
      setError(t("counsel_public_figure_need_name"));
      return;
    }
    await counselRunAsync(
      { setBusy: setPublicFigBusy, setError, t, label: "public_figure" },
      async () => {
        const out = await counselPublicFigureInstruction(backendBase, name);
        setNewPersonaInstruction(out.instruction.slice(0, 8000));
      }
    );
  }, [backendBase, newPersonaName, t]);

  const runProblemTurn = useCallback(async () => {
    if (!selectedNodeId?.trim()) {
      setError(t("counsel_err_node"));
      return;
    }
    await counselRunAsync({ setBusy, setError, t, label: "problem_turn" }, async () => {
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
    });
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
    await counselRunAsync({ setBusy, setError, t, label: "problem_turn_user" }, async () => {
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
    });
  }, [backendBase, graphPayload, sourcePayload, problemDraft, problemTranscript, t]);

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
      const allThreads = Object.fromEntries(
        Object.entries(factThreads).map(([id, factThread]) => [
          id,
          factThread.messages.map((m) => ({ role: m.role, content: m.content }))
        ])
      );
      try {
        const out = await counselFactQuestion(backendBase, {
          ...graphPayload,
          ...sourcePayload,
          persona_id: persona.id,
          persona_name: persona.name,
          persona_instruction: persona.instruction,
          counsel_roster: personas.map((p) => ({ id: p.id, name: p.name, instruction: p.instruction })),
          problem_summary: problemSummary,
          questions_asked_so_far: qn,
          thread: th.messages.map((m) => ({ role: m.role, content: m.content })),
          all_threads: allThreads
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
        if (import.meta.env.DEV) console.error("[counsel:fact_question]", e);
        setError(counselErrorToMessage(e, t));
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
    [backendBase, graphPayload, sourcePayload, personas, problemSummary, factThreads, questionsAsked, factSkippedIds, t]
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
      return;
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

  const skipFactPersona = useCallback((personaId: string) => {
    setFactSkippedIds((prev) => ({ ...prev, [personaId]: true }));
    setFactFocusPersonaId((cur) => (cur === personaId ? null : cur));
  }, []);

  const onFactPersonaCardBlur = useCallback((personaId: string, e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFactFocusPersonaId((cur) => (cur === personaId ? null : cur));
    }
  }, []);

  const onExtendDebateMessageLimit = useCallback(() => {
    setDebateMsgLimit((n) => n + 10);
    setError("");
    setDebatePaused(false);
  }, []);

  const factBusyAny = Object.keys(factLoading).length > 0;

  useEffect(() => {
    if (phase !== "fact") setFactFocusPersonaId(null);
  }, [phase]);

  const runNgt = useCallback(async () => {
    const digest = buildFactDigest(personas, factThreads);
    const next: Record<string, string> = {};
    await counselRunAsync({ setBusy, setError, t, label: "ngt" }, async () => {
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
    });
  }, [backendBase, graphPayload, sourcePayload, personas, factThreads, problemSummary, t]);

  const runCollisions = useCallback(async () => {
    await counselRunAsync({ setBusy, setError, t, label: "collisions_refresh" }, async () => {
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
    });
  }, [backendBase, problemSummary, personas, opinions, t]);

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
    setDebateModeratorFloorOpen(false);
    setDebateAutoProgress(0);
    setPhase("debate");
  }, [selectedCollisionIds]);

  const selectedAreaList = useMemo(() => {
    return collisionAreas.filter((a) => selectedCollisionIds.has(a.id));
  }, [collisionAreas, selectedCollisionIds]);

  const selectedAreaListRef = useRef(selectedAreaList);
  selectedAreaListRef.current = selectedAreaList;
  const debateTranscriptsRef = useRef(debateTranscripts);
  debateTranscriptsRef.current = debateTranscripts;
  const problemSummaryLatestRef = useRef(problemSummary);
  problemSummaryLatestRef.current = problemSummary;

  const currentDebateArea = selectedAreaList[debateAreaIdx];

  const debateTranscriptTailSig = useMemo(() => {
    const tid = currentDebateArea?.id;
    if (!tid) return "";
    const L = debateTranscripts[tid] || [];
    if (!L.length) return "0";
    const r = L[L.length - 1];
    return `${L.length}|${r.speaker}|${r.content.slice(0, 48)}`;
  }, [currentDebateArea?.id, debateTranscripts]);

  const debateHudSpeaking = useMemo(() => {
    const tid = currentDebateArea?.id;
    if (!tid) return null;
    const L = debateTranscripts[tid] || [];
    if (!L.length) return null;
    return L[L.length - 1]?.speaker ?? null;
  }, [currentDebateArea?.id, debateTranscripts]);

  const debateAddressee = useMemo(() => {
    const tid = currentDebateArea?.id;
    if (!tid) return null;
    const L = debateTranscripts[tid] || [];
    if (!L.length) return null;
    const last = L[L.length - 1];
    return inferDebateAddressee(last.content, last.speaker, personas);
  }, [currentDebateArea?.id, debateTranscripts, personas]);

  const debateTimerUnderKey = useMemo(() => {
    const tid = currentDebateArea?.id;
    if (!tid) return null;
    const L = debateTranscripts[tid] || [];
    if (!L.length) return null;
    const sp = L[L.length - 1]?.speaker?.trim() ?? "";
    const k = sp.toLowerCase();
    if (k === "host") return "host";
    if (k === "user") return "user";
    return k;
  }, [currentDebateArea?.id, debateTranscripts]);

  const advanceDebate = useCallback(async () => {
    if (!currentDebateArea || debatePaused) return;
    if (debateMsgCount >= debateMsgLimit) {
      setError(t("counsel_debate_limit"));
      return;
    }
    await counselRunAsync({ setBusy, setError, t, label: "debate_step" }, async () => {
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
    });
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

    const pauseMs = Math.max(120, Math.round(COUNSEL_DEBATE_AUTO_PAUSE_MS / debateSpeedMult));
    const timer = window.setTimeout(() => {
      void advanceDebateRef.current();
    }, pauseMs);
    return () => window.clearTimeout(timer);
  }, [phase, debatePaused, currentDebateArea?.id, debateMsgCount, debateMsgLimit, busy, debateAreaIdx, debateSpeedMult, debateTranscriptTailSig]);

  useEffect(() => {
    if (phase !== "debate" || debatePaused || debateMsgCount >= debateMsgLimit || busy || !currentDebateArea) {
      setDebateAutoProgress(0);
      return;
    }
    const duration = Math.max(120, Math.round(COUNSEL_DEBATE_AUTO_PAUSE_MS / debateSpeedMult));
    const t0 = performance.now();
    let raf = 0;
    let cancelled = false;
    const loop = (now: number) => {
      if (cancelled) return;
      const p = Math.min(1, (now - t0) / duration);
      setDebateAutoProgress(p);
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [
    phase,
    debatePaused,
    debateMsgCount,
    debateMsgLimit,
    busy,
    currentDebateArea?.id,
    debateSpeedMult,
    debateTranscriptTailSig
  ]);

  const loadVoteOptions = useCallback(async () => {
    const digest = buildDebateDigest(selectedAreaListRef.current, debateTranscriptsRef.current);
    await counselRunAsync({ setBusy, setError, t, label: "vote_options" }, async () => {
      const out = await counselVoteOptions(backendBase, {
        problem_summary: problemSummaryLatestRef.current,
        selected_areas: selectedAreaListRef.current.map((a) => ({ id: a.id, title: a.title })),
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
    });
  }, [backendBase, t]);

  const endCurrentAreaOrNext = useCallback(() => {
    if (debateAreaIdx + 1 < selectedAreaList.length) {
      setDebateAreaIdx((i) => i + 1);
      setDebateMsgCount(0);
      setDebateMsgLimit(30);
      setError("");
    } else {
      setPhase("vote");
      void loadVoteOptions();
    }
  }, [debateAreaIdx, selectedAreaList.length, loadVoteOptions]);

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
    setDebateModeratorFloorOpen(false);
    setDebateMsgCount((c) => c + 1);
  }, [debateUserLine, currentDebateArea]);

  const runRankVotes = useCallback(async () => {
    if (!voteOptionAreas.length) return;
    await counselRunAsync({ setBusy, setError, t, label: "rank_votes" }, async () => {
      const out = await counselRankVotes(backendBase, {
        problem_summary: problemSummary,
        personas,
        options_payload: voteOptionAreas
      });
      setRawVotes(out.votes || []);
    });
  }, [backendBase, problemSummary, personas, voteOptionAreas, t]);

  const runFinalize = useCallback(async () => {
    await counselRunAsync({ setBusy, setError, t, label: "finalize" }, async () => {
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
    });
  }, [
    backendBase,
    graphPayload,
    problemSummary,
    voteOptionAreas,
    rawVotes,
    payloadSkills,
    builtinSkills,
    sandboxMode,
    t
  ]);

  const applyAll = useCallback(async () => {
    if (!finalizeResult || !selectedNodeId?.trim() || !projectId) return;
    await counselRunAsync({ setBusy, setError, t, label: "apply" }, async () => {
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
    });
  }, [finalizeResult, selectedNodeId, projectId, backendBase, graphPayload, slugKeywords, problemSummary, loadMainGraph, t]);

  const voteSummary = useMemo(
    () => summarizeCounselVotes(rawVotes, voteOptionAreas, personas, collisionAreas),
    [rawVotes, voteOptionAreas, personas, collisionAreas]
  );

  const voteLeaderboards = useMemo(
    () => buildAreaLeaderboards(voteSummary, voteOptionAreas, collisionAreas),
    [voteSummary, voteOptionAreas, collisionAreas]
  );

  const voteSentimentByKey = useMemo(
    () =>
      voteSummary.length > 0 && voteOptionAreas.length > 0
        ? computePersonaVoteSentiment(voteSummary, voteOptionAreas, collisionAreas, personas)
        : {},
    [voteSummary, voteOptionAreas, collisionAreas, personas]
  );

  const strategicPatchTouches = finalizeResult
    ? countStrategicPatchTouches(finalizeResult.patch)
    : 0;

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

  const factCouncilPulseName = useMemo(() => {
    if (phase !== "fact") return null;
    const isWaiting = (p: CounselPersona) => {
      const msgs = factThreads[p.id]?.messages || [];
      const last = msgs[msgs.length - 1];
      // After the 3rd question posts, questionsAsked is 3 — still await the user's reply (do not require qs < 3).
      return !factSkippedIds[p.id] && msgs.length > 0 && last?.role === "persona";
    };
    if (factFocusPersonaId) {
      const fp = personas.find((x) => x.id === factFocusPersonaId);
      if (fp && isWaiting(fp)) return fp.name;
    }
    const first = personas.find((p) => isWaiting(p));
    return first?.name ?? null;
  }, [phase, personas, factThreads, factSkippedIds, factFocusPersonaId]);

  const problemHudSpeaking = useMemo(() => {
    const last = problemTranscript[problemTranscript.length - 1];
    if (!last) return null;
    return last.role === "host" ? COUNSEL_HOST_LABEL : "User";
  }, [problemTranscript]);

  const hudTargetLeft = useMemo(() => {
    const kind =
      sourceFileIds.length > 1
        ? "multi_source"
        : sourceFileIds.length === 1
          ? "single_source"
          : "context_only";
    return t("counsel_hud_target_line", {
      kind,
      slug: slugKeywords.trim() || "session"
    });
  }, [sourceFileIds.length, slugKeywords, t]);

  useLayoutEffect(() => {
    if (phase !== "problem") return;
    for (const ref of [problemReplyRef, problemSummaryRef]) {
      const el = ref.current;
      if (!el) continue;
      el.style.height = "auto";
      const h = Math.min(Math.max(el.scrollHeight, 88), 520);
      el.style.height = `${h}px`;
    }
  }, [phase, problemDraft, problemSummary]);

  const problemPrimaryCtaClass =
    "inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-lg transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40 dark:bg-white dark:text-slate-900";

  return {
    t,
    ...state,
    setPhase,
    setPersonas,
    setProblemDraft,
    setProblemTranscript,
    setProblemSummary,
    setSlugKeywords,
    setNewPersonaName,
    setNewPersonaInstruction,
    setLibEditName,
    setLibEditDraft,
    setPublicFigBusy,
    setFactThreads,
    setQuestionsAsked,
    setOpinions,
    setCollisionAreas,
    setSelectedCollisionIds,
    setDebateTranscripts,
    setDebateAreaIdx,
    setDebateMsgCount,
    setDebateMsgLimit,
    setDebatePaused,
    setDebateUserLine,
    setDebateSpeedMult,
    setDebateAutoProgress,
    setDebateModeratorFloorOpen,
    setVoteOptionAreas,
    setRawVotes,
    setFinalizeResult,
    setBusy,
    setError,
    setFactSkippedIds,
    setFactLoading,
    setFactFocusPersonaId,
    hostLabel: COUNSEL_HOST_LABEL,
    problemReplyRef,
    problemSummaryRef,
    resetSession,
    combined,
    graphPayload,
    sourcePayload,
    voteSummary,
    voteLeaderboards,
    voteSentimentByKey,
    strategicPatchTouches,
    stageEntries,
    factCouncilPulseName,
    problemHudSpeaking,
    hudTargetLeft,
    problemPrimaryCtaClass,
    currentDebateArea,
    debateHudSpeaking,
    debateAddressee,
    debateTimerUnderKey,
    rtLib,
    projectId,
    addPersonaFromLib,
    removePersona,
    addPresetPersona,
    addNuwaPersona,
    addCustomPersona,
    togglePresetPersona,
    toggleNuwaPersona,
    toggleLibPersona,
    presetOnPanel,
    nuwaOnPanel,
    libRowOnPanel,
    presetPreview,
    generatePublicFigureInstruction,
    runProblemTurn,
    submitProblemUser,
    acceptProblem,
    submitFactAnswer,
    skipFactPersona,
    onFactPersonaCardBlur,
    onExtendDebateMessageLimit,
    factBusyAny,
    runNgt,
    runCollisions,
    toggleCollision,
    startDebate,
    advanceDebate,
    loadVoteOptions,
    endCurrentAreaOrNext,
    submitDebateUser,
    runRankVotes,
    runFinalize,
    applyAll,
    onPersistPersonaToLib,
    onUpdatePersonaInLib,
    onRemovePersonaFromLib
  };
}

export type CounselFlowRuntime = ReturnType<typeof useCounselFlowRuntime>;
