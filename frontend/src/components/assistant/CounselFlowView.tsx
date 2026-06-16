import { Check } from "lucide-react";
import {
  CounselPhaseCollisions,
  CounselPhaseDebate,
  CounselPhaseFact,
  CounselPhaseFinalize,
  CounselPhaseProblem,
  CounselPhaseSetup,
  CounselPhaseVote
} from "./counselPhases";
import CounselGalleryDock from "./CounselGalleryDock";
import CounselModeratorBar from "./CounselModeratorBar";
import type { CounselFlowRuntime } from "./useCounselFlowRuntime";

export default function CounselFlowView({ runtime }: { runtime: CounselFlowRuntime }) {
  const {
    t,
    hostLabel,
    phase,
    personas,
    busy,
    error,
    voteSummary,
    factCouncilPulseName,
    problemHudSpeaking,
    debateHudSpeaking,
    debateAddressee,
    debateModeratorFloorOpen,
    debateAutoProgress,
    debateTimerUnderKey,
    voteSentimentByKey,
    stageEntries,
    resetSession,
    problemDraft,
    setProblemDraft,
    rtLib,
    presetOnPanel,
    togglePresetPersona,
    presetPreview,
    nuwaOnPanel,
    toggleNuwaPersona,
    libRowOnPanel,
    toggleLibPersona,
    libEditName,
    setLibEditName,
    libEditDraft,
    setLibEditDraft,
    onUpdatePersonaInLib,
    onRemovePersonaFromLib,
    newPersonaName,
    setNewPersonaName,
    newPersonaInstruction,
    setNewPersonaInstruction,
    publicFigBusy,
    generatePublicFigureInstruction,
    addCustomPersona,
    removePersona,
    setPhase,
    runProblemTurn,
    onPersistPersonaToLib,
    problemTranscript,
    problemSummary,
    setProblemSummary,
    slugKeywords,
    setSlugKeywords,
    problemReplyRef,
    problemSummaryRef,
    problemPrimaryCtaClass,
    submitProblemUser,
    factThreads,
    questionsAsked,
    factSkippedIds,
    factLoading,
    factFocusPersonaId,
    setFactFocusPersonaId,
    onFactPersonaCardBlur,
    submitFactAnswer,
    factBusyAny,
    runNgt,
    skipFactPersona,
    collisionAreas,
    selectedCollisionIds,
    runCollisions,
    toggleCollision,
    startDebate,
    currentDebateArea,
    debateTranscripts,
    debateAreaIdx,
    debateMsgCount,
    debateMsgLimit,
    debatePaused,
    onExtendDebateMessageLimit,
    endCurrentAreaOrNext,
    advanceDebate,
    voteOptionAreas,
    rawVotes,
    loadVoteOptions,
    runRankVotes,
    runFinalize,
    finalizeResult,
    voteLeaderboards,
    strategicPatchTouches,
    projectId,
    applyAll,
    acceptProblem,
    hudTargetLeft,
    setDebatePaused,
    setDebateModeratorFloorOpen,
    setDebateMsgCount,
    setDebateMsgLimit,
    setDebateAutoProgress,
    debateSpeedMult,
    setDebateSpeedMult,
    debateUserLine,
    setDebateUserLine,
    submitDebateUser
  } = runtime;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden text-sm text-slate-800 dark:text-slate-100">
      <div className="mx-auto w-full max-w-[920px] shrink-0 space-y-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start gap-3">
            {phase !== "setup" ? (
              <div className="min-w-0 flex-1 space-y-1.5">
                <CounselGalleryDock
                  personas={personas}
                  showHost={phase === "problem" || phase === "debate"}
                  hostLabel={hostLabel}
                  showJudge={phase === "problem" || phase === "fact" || phase === "debate"}
                  judgeLabel={t("counsel_hud_judge")}
                  speakingName={
                    phase === "problem"
                      ? busy
                        ? hostLabel
                        : problemHudSpeaking
                      : phase === "fact"
                        ? factCouncilPulseName
                        : phase === "debate"
                          ? debateHudSpeaking
                          : null
                  }
                  addresseeName={phase === "debate" ? debateAddressee : null}
                  judgeActive={phase === "debate" && debateModeratorFloorOpen}
                  timerProgress={phase === "debate" ? debateAutoProgress : 0}
                  timerUnderKey={phase === "debate" ? debateTimerUnderKey : null}
                  sentimentByPersonaKey={
                    phase === "vote" || phase === "finalize" ? voteSentimentByKey : undefined
                  }
                />
                {(phase === "vote" || phase === "finalize") && voteSummary.length > 0 ? (
                  <p className="text-center font-mono text-[9px] uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    {t("counsel_hud_sentiment_caption")}
                  </p>
                ) : null}
                {phase === "fact" && problemSummary.trim().length > 0 ? (
                  <details className="rounded-xl border border-slate-200/60 bg-white/40 px-2 py-1.5 dark:border-slate-600/50 dark:bg-slate-900/30">
                    <summary className="cursor-pointer select-none font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t("counsel_fact_read_full_brief")}
                    </summary>
                    <p className="mm-assistant-thin-scrollbar mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {problemSummary.trim()}
                    </p>
                  </details>
                ) : null}
              </div>
            ) : null}
            {phase !== "problem" ? (
              <button type="button" className="ios-button shrink-0 self-center py-1 text-xs" onClick={() => resetSession()}>
                {t("counsel_reset")}
              </button>
            ) : null}
          </div>
          <div className="min-w-0 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
          <div
            className="inline-flex min-w-full rounded-full border border-slate-200/25 bg-slate-100/60 p-0.5 shadow-inner dark:border-white/10 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:min-w-0"
            role="tablist"
            aria-label={t("counsel_stage_tracker_aria")}
          >
            {stageEntries.map(({ key, label }) => {
              const idxCurrent = stageEntries.findIndex((s) => s.key === phase);
              const idx = stageEntries.findIndex((s) => s.key === key);
              const done = idx < idxCurrent;
              const current = key === phase;
                  return (
                    <div
                      key={key}
                      className={[
                        "flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-full px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide transition-all sm:px-2 sm:text-[11px]",
                        current
                          ? "bg-white text-slate-900 shadow-sm dark:bg-cyan-100/95 dark:text-slate-900"
                          : done
                            ? "text-emerald-800/95 dark:text-emerald-300/95"
                            : "text-slate-400/80 dark:text-slate-500/90"
                      ].join(" ")}
                    >
                      {done ? (
                        <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden />
                      ) : null}
                      <span className="truncate">{label}</span>
                    </div>
                  );
            })}
          </div>
        </div>
        </div>
      </div>
      {error ? (
        <p className="mx-auto w-full max-w-[800px] text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {phase === "setup" ? (
        <CounselPhaseSetup
          personas={personas}
          problemDraft={problemDraft}
          onProblemDraftChange={setProblemDraft}
          busy={busy}
          rtLib={rtLib}
          presetOnPanel={presetOnPanel}
          togglePresetPersona={togglePresetPersona}
          presetPreview={presetPreview}
          nuwaOnPanel={nuwaOnPanel}
          toggleNuwaPersona={toggleNuwaPersona}
          libRowOnPanel={libRowOnPanel}
          toggleLibPersona={toggleLibPersona}
          libEditName={libEditName}
          onLibEditNameChange={setLibEditName}
          libEditDraft={libEditDraft}
          onLibEditDraftChange={setLibEditDraft}
          onUpdatePersonaInLib={onUpdatePersonaInLib}
          onRemovePersonaFromLib={onRemovePersonaFromLib}
          newPersonaName={newPersonaName}
          onNewPersonaNameChange={setNewPersonaName}
          newPersonaInstruction={newPersonaInstruction}
          onNewPersonaInstructionChange={setNewPersonaInstruction}
          publicFigBusy={publicFigBusy}
          onGeneratePublicFigure={() => void generatePublicFigureInstruction()}
          onAddCustomPersona={addCustomPersona}
          onRemovePersona={removePersona}
          onStartProblem={() => {
            setPhase("problem");
            void runProblemTurn();
          }}
          persistLibHint={!!onPersistPersonaToLib}
        />

      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mm-assistant-thin-scrollbar mx-auto min-h-0 w-full max-w-[920px] flex-1 overflow-y-auto overflow-x-hidden pb-2 pr-1">
      {phase === "problem" && (
        <CounselPhaseProblem
          hostLabel={hostLabel}
          problemTranscript={problemTranscript}
          problemDraft={problemDraft}
          onProblemDraftChange={setProblemDraft}
          problemSummary={problemSummary}
          onProblemSummaryChange={setProblemSummary}
          slugKeywords={slugKeywords}
          onSlugKeywordsChange={setSlugKeywords}
          busy={busy}
          problemReplyRef={problemReplyRef}
          problemSummaryRef={problemSummaryRef}
          problemPrimaryCtaClass={problemPrimaryCtaClass}
          onSubmitProblemUser={() => void submitProblemUser()}
          onRunProblemTurn={() => void runProblemTurn()}
        />
      )}

      {phase === "fact" && (
        <CounselPhaseFact
          personas={personas}
          factThreads={factThreads}
          questionsAsked={questionsAsked}
          factSkippedIds={factSkippedIds}
          factLoading={factLoading}
          factFocusPersonaId={factFocusPersonaId}
          onFocusCapturePersona={setFactFocusPersonaId}
          onPersonaCardBlur={onFactPersonaCardBlur}
          submitFactAnswer={submitFactAnswer}
          onSkipPersona={skipFactPersona}
          factBusyAny={factBusyAny}
          busy={busy}
          onContinueNgt={() => void runNgt()}
        />
      )}

      {phase === "collisions" && (
        <CounselPhaseCollisions
          collisionAreas={collisionAreas}
          selectedCollisionIds={selectedCollisionIds}
          busy={busy}
          onRunCollisions={() => void runCollisions()}
          onToggleCollision={toggleCollision}
          onStartDebate={() => startDebate()}
        />
      )}

      {phase === "debate" && currentDebateArea && (
        <CounselPhaseDebate
          currentDebateArea={currentDebateArea}
          debateTranscripts={debateTranscripts}
          debateMsgCount={debateMsgCount}
          debateMsgLimit={debateMsgLimit}
          busy={busy}
          debatePaused={debatePaused}
          selectedAreaCount={selectedCollisionIds.size}
          currentAreaIndex={debateAreaIdx}
          onExtendMessageLimit={onExtendDebateMessageLimit}
          onEndCurrentAreaOrNext={() => endCurrentAreaOrNext()}
          onAdvanceDebate={() => void advanceDebate()}
        />
      )}

      {phase === "vote" && (
        <CounselPhaseVote
          voteOptionAreas={voteOptionAreas}
          collisionAreas={collisionAreas}
          rawVotes={rawVotes}
          busy={busy}
          voteLeaderboards={voteLeaderboards}
          onLoadVoteOptions={() => void loadVoteOptions()}
          onRunRankVotes={() => void runRankVotes()}
          onFinalize={() => void runFinalize()}
        />
      )}

      {phase === "finalize" && finalizeResult && (
        <CounselPhaseFinalize
          finalizeResult={finalizeResult}
          voteLeaderboards={voteLeaderboards}
          strategicPatchTouches={strategicPatchTouches}
          projectId={projectId}
          busy={busy}
          onApplyAll={() => void applyAll()}
        />
      )}
          </div>
          {phase === "problem" ? (
            <div className="shrink-0 border-t border-slate-200/50 bg-white/72 py-3 backdrop-blur-[10px] dark:border-slate-700/55 dark:bg-slate-950/78">
              <div className="mx-auto flex w-full max-w-[920px] items-center justify-between gap-4 px-1 sm:px-0">
                <button
                  type="button"
                  className="shrink-0 text-left text-[10px] text-slate-600 underline decoration-slate-400/70 underline-offset-[3px] hover:text-slate-900 dark:text-slate-400 dark:decoration-slate-500 dark:hover:text-slate-100"
                  onClick={() => resetSession()}
                >
                  {t("counsel_reset")}
                </button>
                <button
                  type="button"
                  className={problemPrimaryCtaClass}
                  disabled={!problemSummary.trim() || !slugKeywords.trim() || busy}
                  onClick={() => acceptProblem()}
                >
                  {t("counsel_accept_problem_cta")}
                </button>
              </div>
            </div>
          ) : phase === "debate" && currentDebateArea ? (
            <CounselModeratorBar
              targetLeft={hudTargetLeft}
              paused={debatePaused}
              onTogglePause={() => {
                setDebatePaused((p) => {
                  const next = !p;
                  if (!next) setDebateModeratorFloorOpen(false);
                  return next;
                });
              }}
              onSkipToEnd={() => {
                setDebateMsgCount(debateMsgLimit);
                setDebatePaused(true);
                setDebateModeratorFloorOpen(false);
                setDebateAutoProgress(0);
              }}
              speedLabel={debateSpeedMult === 1.5 ? "1.5×" : "1×"}
              onToggleSpeed={() => setDebateSpeedMult((m) => (m === 1 ? 1.5 : 1))}
              takeFloorLabel={t("counsel_take_floor")}
              onTakeFloor={() => {
                setDebatePaused(true);
                setDebateModeratorFloorOpen(true);
              }}
              floorOpen={debateModeratorFloorOpen}
              floorDraft={debateUserLine}
              floorPlaceholder={t("counsel_debate_floor_ph")}
              onFloorDraftChange={setDebateUserLine}
              onSubmitFloor={() => submitDebateUser()}
              onDismissFloor={() => setDebateModeratorFloorOpen(false)}
              sendFloorAria={t("counsel_user_say")}
              cancelLabel={t("counsel_moderator_cancel")}
              busy={busy}
              atLimit={debateMsgCount >= debateMsgLimit}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
