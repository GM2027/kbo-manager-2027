import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Award, Crown, FastForward, Play, Search, Sparkles, StepForward, X } from 'lucide-react';
import { audioManager } from '../audio/audioManager';
import { getRecommendedDraftCandidates } from '../data/draftPool';
import { KBO_TEAMS } from '../data/kboTeams';
import { TEAM_UI_THEMES } from '../data/realKboHistories';
import {
  advanceDraftUntilUserTurn,
  autoCompleteRemainingDraft,
  pickDraftCandidateForUser,
  scoutDraftCandidate,
  stepNextDraftPick,
} from '../engine/transactions';
import { getDraftPickingTeamForSlot } from '../engine/salaryCapEngine';
import { CareerSave, DraftCandidate, DraftState } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

type DraftPickItem = DraftState['picks'][number];

interface DraftBoardPanelProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onCompletedAction?: React.ReactNode;
}

const GRADE_STYLE: Record<NonNullable<DraftCandidate['scoutGrade']>, string> = {
  S: 'border-orange-500/60 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  'A+': 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  A: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'B+': 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  B: 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  C: 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400',
};

export const DraftBoardPanel: React.FC<DraftBoardPanelProps> = ({
  career,
  onUpdateCareer,
  onCompletedAction,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [roleFilter, setRoleFilter] = useState<'전체' | '투수' | '타자'>('전체');
  const [originFilter, setOriginFilter] = useState<'전체' | '고졸' | '대학' | '독립리그'>('전체');
  const [notice, setNotice] = useState<string | null>(null);
  const [round1Spotlight, setRound1Spotlight] = useState<{
    pick: DraftPickItem;
    school: string;
    grade: string;
    scoutTag?: string;
    isMyTeam: boolean;
  } | null>(null);

  const ds = career.draftState;
  // Expanded manual picking to ALL 1~11 rounds (110 picks total)
  const isManualRounds = !ds.completed && ds.currentRound <= 11;
  const activeRoundOrder =
    ds.currentRound === 1 && ds.round1DraftOrder && ds.round1DraftOrder.length === ds.draftOrder.length
      ? ds.round1DraftOrder
      : ds.draftOrder;
  const currentPickingTeam =
    !ds.completed && ds.currentRound <= 11
      ? getDraftPickingTeamForSlot(ds, ds.currentRound, ds.currentPickInRound)
      : null;
  const isUserTurn = Boolean(isManualRounds && currentPickingTeam === career.playerTeamId);
  const overallPickNo = (ds.currentRound - 1) * 10 + ds.currentPickInRound;

  useEffect(() => {
    if (!round1Spotlight) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        setRound1Spotlight(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [round1Spotlight]);

  const triggerRound1EffectIfApplicable = (prevPickCount: number, nextCareer: CareerSave) => {
    const newPicks = nextCareer.draftState.picks.slice(prevPickCount);
    // Prefer user's Round 1 pick if multiple picks occurred in one step, else latest Round 1 pick
    const myR1 = newPicks.find((p) => p.round === 1 && p.teamId === nextCareer.playerTeamId);
    const anyR1 = [...newPicks].reverse().find((p) => p.round === 1);
    const target = myR1 ?? anyR1;
    if (!target) return;
    const cand = nextCareer.draftState.candidates.find((c) => c.id === target.candidateId);
    setRound1Spotlight({
      pick: target,
      school: cand?.school ?? '국내 아마추어',
      grade: cand?.scoutGrade ?? 'S',
      scoutTag: cand?.scoutTag,
      isMyTeam: target.teamId === nextCareer.playerTeamId,
    });
  };

  const myTeamPlayers = Object.values(career.players).filter(
    (p) => p.teamId === career.playerTeamId
  );
  const aiRecommended =
    !ds.completed && ds.currentRound <= 11
      ? getRecommendedDraftCandidates(ds, myTeamPlayers, 3)
      : [];
  const recommendedIds = new Set(aiRecommended.map((r) => r.candidate.id));

  const availableDraft = ds.candidates
    .filter(
      (c) =>
        !c.draftedBy &&
        (roleFilter === '전체' || c.role === roleFilter) &&
        (originFilter === '전체' || c.originType === originFilter)
    )
    .sort((a, b) => b.potential * 0.65 + b.ability - (a.potential * 0.65 + a.ability));

  const myDraftPicks = ds.picks.filter((p) => p.teamId === career.playerTeamId);
  const recentPicks = [...ds.picks].slice(-12).reverse();
  const latestPick = ds.picks.length > 0 ? ds.picks[ds.picks.length - 1] : null;

  const handleStepOne = () => {
    try {
      setNotice(null);
      const prevCount = ds.picks.length;
      const { nextCareer, backupSnapshot } = stepNextDraftPick(career);
      onUpdateCareer(nextCareer, backupSnapshot);
      audioManager.play('rookie_draft');
      triggerRound1EffectIfApplicable(prevCount, nextCareer);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '픽 진행 오류');
    }
  };

  const handleAdvanceToUser = () => {
    try {
      setNotice(null);
      const prevCount = ds.picks.length;
      audioManager.setSimulationMode(true);
      const { nextCareer, backupSnapshot } = advanceDraftUntilUserTurn(career);
      audioManager.setSimulationMode(false);
      onUpdateCareer(nextCareer, backupSnapshot);
      audioManager.play('rookie_draft');
      triggerRound1EffectIfApplicable(prevCount, nextCareer);
    } catch (err) {
      audioManager.setSimulationMode(false);
      setNotice(err instanceof Error ? err.message : '차례 이동 오류');
    }
  };

  const handlePickCandidate = (candId: number) => {
    try {
      setNotice(null);
      const prevCount = ds.picks.length;
      const { nextCareer, backupSnapshot } = pickDraftCandidateForUser(career, candId);
      onUpdateCareer(nextCareer, backupSnapshot);
      audioManager.play('rookie_draft');
      triggerRound1EffectIfApplicable(prevCount, nextCareer);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '드래프트 지명 오류');
    }
  };

  const handleAutoRemaining = () => {
    try {
      setNotice(null);
      const prevCount = ds.picks.length;
      // 자동 지명 중에는 반복적인 효과음을 생략
      audioManager.setSimulationMode(true);
      const { nextCareer, backupSnapshot } = autoCompleteRemainingDraft(career);
      audioManager.setSimulationMode(false);
      onUpdateCareer(nextCareer, backupSnapshot);
      triggerRound1EffectIfApplicable(prevCount, nextCareer);
      setNotice('신인 드래프트 1~11라운드 전체 자동 지명이 완료되었습니다.');
    } catch (err) {
      audioManager.setSimulationMode(false);
      setNotice(err instanceof Error ? err.message : '자동 지명 오류');
    }
  };

  const handleScoutCandidate = (candId: number) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = scoutDraftCandidate(career, candId);
      onUpdateCareer(nextCareer, backupSnapshot);
      const target = nextCareer.draftState.candidates.find((c) => c.id === candId);
      setNotice(
        `${target?.name ?? '유망주'} 정밀 스카우팅 완료 — 실제 능력 ${target?.ability}/잠재 ${target?.potential}${
          target?.hiddenTrait ? ` · 숨겨진 특성 [${target.hiddenTrait}]` : ''
        } 확인`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '정밀 스카우팅 오류');
    }
  };

  return (
    <div className="space-y-4">
      {/* Cinematic Round 1 Selection Celebration Overlay (#7 & #22 Club Team Colors) */}
      <AnimatePresence>
        {round1Spotlight && (() => {
          const pickTeamId = round1Spotlight.pick.teamId;
          const clubTheme = TEAM_UI_THEMES[pickTeamId];
          const clubInfo = KBO_TEAMS[pickTeamId];
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.05 : 0.22 }}
              onClick={() => setRound1Spotlight(null)}
              className="fixed inset-0 z-50 bg-slate-950/82 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  borderColor: clubTheme.primaryDark,
                  backgroundImage: `linear-gradient(145deg, #070b14 0%, ${clubTheme.bannerFrom} 52%, ${clubTheme.bannerTo} 100%)`,
                  boxShadow: `0 24px 64px -12px rgba(${clubTheme.rgbDark}, 0.58), 0 0 0 1px rgba(${clubTheme.rgbDark}, 0.42)`,
                }}
                className="relative w-full max-w-lg rounded-2xl overflow-hidden border-2 text-white"
              >
                {/* Dark readability scrim so white typography passes WCAG AA on all 10 club palettes */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-slate-950/48"
                />

                {/* Top Club Color Signature Bar */}
                <div
                  aria-hidden="true"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${clubTheme.primaryDark}, ${clubTheme.secondary}, ${clubTheme.primaryDark})`,
                  }}
                  className="relative h-1.5 w-full"
                />

                {/* Club-Colored Radial Stage Glow */}
                <div
                  aria-hidden="true"
                  style={{
                    backgroundImage: `radial-gradient(circle at 18% 28%, rgba(${clubTheme.rgbDark}, 0.42), transparent 62%)`,
                  }}
                  className="pointer-events-none absolute inset-0"
                />

                {/* Animated Club-Colored Spotlight Sweep */}
                {!prefersReducedMotion && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ x: '-120%', opacity: 0.72 }}
                    animate={{ x: '220%', opacity: 0 }}
                    transition={{ duration: 1.15, ease: 'easeOut' }}
                    style={{
                      backgroundImage: `linear-gradient(90deg, transparent, rgba(${clubTheme.rgbDark}, 0.52), rgba(255,255,255,0.28), transparent)`,
                    }}
                    className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12"
                  />
                )}

                <div className="p-6 relative space-y-5">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      style={{ color: clubTheme.primaryDark }}
                      className="flex items-center gap-2 text-xs font-extrabold tracking-widest uppercase"
                    >
                      <Crown className="w-4 h-4 shrink-0" />
                      <span>
                        {ds.season} KBO DRAFT · 1ST ROUND OVERALL #{round1Spotlight.pick.pickInRound}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRound1Spotlight(null)}
                      className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10"
                      aria-label="닫기"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    <div
                      style={{
                        borderColor: clubTheme.primaryDark,
                        backgroundColor: `rgba(${clubTheme.rgbDark}, 0.18)`,
                        boxShadow: `0 0 24px -4px rgba(${clubTheme.rgbDark}, 0.55)`,
                      }}
                      className="p-2 rounded-xl border-2 shrink-0"
                    >
                      <TeamLogo teamId={pickTeamId} size="lg" />
                    </div>
                    <div className="min-w-0">
                      <div
                        style={{ color: clubTheme.primaryDark }}
                        className="text-xs font-extrabold"
                      >
                        {clubInfo.name} 1라운드 {round1Spotlight.pick.pickInRound}순위 지명
                        {round1Spotlight.isMyTeam ? ' · 우리 구단 특급 신인!' : ''}
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-0.5 truncate">
                        {round1Spotlight.pick.playerName}
                      </h2>
                      <div className="text-xs text-slate-200 mt-1 flex flex-wrap items-center gap-2">
                        <span
                          style={{ color: clubTheme.primaryDark }}
                          className="font-mono-stats font-extrabold"
                        >
                          {round1Spotlight.pick.position}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span>{round1Spotlight.school}</span>
                        {round1Spotlight.scoutTag && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-100 font-semibold">{round1Spotlight.scoutTag}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-white/15 font-mono-stats text-center">
                    <div
                      style={{ borderColor: `rgba(${clubTheme.rgbDark}, 0.38)` }}
                      className="p-2.5 rounded-lg bg-slate-950/55 border"
                    >
                      <div className="text-[10px] text-slate-300 font-sans">스카우트 등급</div>
                      <div
                        style={{ color: clubTheme.primaryDark }}
                        className="text-xl font-black mt-0.5"
                      >
                        {round1Spotlight.grade}급
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950/55 border border-white/15">
                      <div className="text-[10px] text-slate-300 font-sans">현재 능력 / 잠재력</div>
                      <div className="text-xl font-black text-white mt-0.5">
                        {round1Spotlight.pick.ability}
                        <span className="text-sm text-slate-400">/{round1Spotlight.pick.potential}</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950/55 border border-white/15">
                      <div className="text-[10px] text-slate-300 font-sans">계약금</div>
                      <div className="text-xl font-black text-emerald-300 mt-0.5">
                        {round1Spotlight.pick.signingBonusBillion.toFixed(1)}억
                      </div>
                    </div>
                  </div>

                  {round1Spotlight.isMyTeam && (
                    <div
                      style={{
                        borderColor: `rgba(${clubTheme.rgbDark}, 0.55)`,
                        backgroundColor: `rgba(${clubTheme.rgbDark}, 0.2)`,
                      }}
                      className="text-xs text-white border rounded-lg px-3 py-2 text-center font-semibold"
                    >
                      {clubInfo.shortName} 1라운더 특급 지명 효과 발동 — 팬 기대감 및 선수 초기 인기 보너스 즉시 반영!
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                      <span
                        style={{ backgroundColor: clubTheme.primaryDark }}
                        className="inline-block w-2.5 h-2.5 rounded-full border border-white/40"
                      />
                      <span>{clubInfo.name} 공식 팀 컬러 지명 연출</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRound1Spotlight(null)}
                      style={{
                        backgroundColor: clubTheme.bannerFrom,
                        borderColor: clubTheme.primaryDark,
                      }}
                      className="px-4 py-2 rounded-lg border text-white hover:brightness-110 font-black text-xs cursor-pointer transition"
                    >
                      드래프트 보드로 계속하기
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {notice && (
        <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-800 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* Top Status & Step-by-Step Controls */}
      <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 rounded-md p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {currentPickingTeam ? (
              <TeamLogo teamId={currentPickingTeam} size="md" />
            ) : (
              <div className="w-9 h-9 rounded border border-slate-300 dark:border-slate-700 flex items-center justify-center bg-white dark:bg-slate-900">
                <Sparkles className="w-4 h-4 text-orange-600" />
              </div>
            )}
            <div>
              <div className="text-xs font-bold text-orange-600 dark:text-orange-400">
                {ds.season} KBO 신인 드래프트 (1~11R 전 라운드 직접 지명 · 전체 자동 지명 지원 · {ds.currentRound}R 순서 {activeRoundOrder.join('→')})
              </div>
              <div className="text-sm font-extrabold mt-0.5 flex flex-wrap items-center gap-2">
                {ds.completed ? (
                  <span>드래프트 11라운드 전체 완료 (총 {ds.picks.length}명 지명)</span>
                ) : currentPickingTeam ? (
                  <>
                    <span className="font-mono-stats">
                      {ds.currentRound}R {ds.currentPickInRound}순위 (전체 #{overallPickNo} / 110)
                    </span>
                    <span>·</span>
                    <span className={isUserTurn ? 'text-emerald-700 dark:text-emerald-400' : ''}>
                      {KBO_TEAMS[currentPickingTeam].name} {isUserTurn ? '지명 차례 (직접 선택)' : '지명 대기'}
                    </span>
                    {(() => {
                      const origTid = activeRoundOrder[ds.currentPickInRound - 1];
                      const prov = ds.pickProvenance?.find(
                        (pr) => pr.round === ds.currentRound && pr.originalTeamId === origTid
                      );
                      if (!prov) return null;
                      const isTraded = prov.ownerTeamId !== prov.originalTeamId;
                      return isTraded ? (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                          트레이드 획득 ({prov.originalTeamId}→{prov.ownerTeamId})
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-semibold">
                          원래 구단 지명권
                        </span>
                      );
                    })()}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isManualRounds && !isUserTurn && (
              <>
                <button
                  type="button"
                  onClick={handleStepOne}
                  className="px-3 py-2 text-xs font-bold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <StepForward className="w-3.5 h-3.5" />
                  <span>다음 1픽 진행</span>
                </button>
                <button
                  type="button"
                  onClick={handleAdvanceToUser}
                  className="px-3.5 py-2 text-xs font-bold rounded bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>내 구단 차례까지 진행</span>
                </button>
              </>
            )}
            {!ds.completed && (
              <button
                type="button"
                onClick={handleAutoRemaining}
                className="px-3 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>{ds.picks.length === 0 ? '전체 자동 지명 (1~11R)' : '잔여 전체 자동 지명 (~11R)'}</span>
              </button>
            )}
            {ds.completed && onCompletedAction}
          </div>
        </div>

        {/* Competitive Balance Tax 3-Year Exceed Round 1 Penalty Notice */}
        {ds.round1PenaltyNotes && ds.round1PenaltyNotes.length > 0 && (
          <div className="p-2.5 rounded border border-rose-500/40 bg-rose-500/10 text-[11px] text-rose-700 dark:text-rose-300 font-semibold">
            경쟁균형세 3년 연속 초과 제재 적용(1라운드 한정):{' '}
            {ds.round1PenaltyNotes
              .map(
                (n) =>
                  `${KBO_TEAMS[n.teamId].shortName} (${n.fromPick}순위 → ${n.toPick}순위 · 9단계 하락)`
              )
              .join(' · ')}
          </div>
        )}

        {/* Visual 10-team round order indicator with Pick Provenance (#13) */}
        {isManualRounds && (
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
            {activeRoundOrder.map((origTid, idx) => {
              const slotNum = idx + 1;
              const prov = ds.pickProvenance?.find(
                (pr) => pr.round === ds.currentRound && pr.originalTeamId === origTid
              );
              const ownerTid = prov?.ownerTeamId ?? origTid;
              const isTraded = Boolean(prov && prov.ownerTeamId !== prov.originalTeamId);
              const isCurrent = slotNum === ds.currentPickInRound;
              const isDone = slotNum < ds.currentPickInRound;
              const isMine = ownerTid === career.playerTeamId;
              const hasR1Penalty =
                ds.currentRound === 1 &&
                Boolean(ds.round1PenaltyNotes?.some((n) => n.teamId === origTid));
              return (
                <motion.div
                  key={`${ownerTid}-${slotNum}`}
                  title={
                    isTraded && prov
                      ? `${prov.originalTeamId} 원래 지명권 → 트레이드로 ${prov.ownerTeamId} 획득`
                      : `${ownerTid} 원래 구단 지명권`
                  }
                  animate={isCurrent && !prefersReducedMotion ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`px-1.5 py-1 rounded border text-center font-mono-stats ${
                    isCurrent
                      ? 'border-orange-600 bg-orange-600/15 font-extrabold text-orange-700 dark:text-orange-300 shadow-sm'
                      : isDone
                      ? 'border-slate-200 dark:border-slate-800 opacity-45'
                      : hasR1Penalty
                      ? 'border-rose-500/60 bg-rose-500/10 font-bold text-rose-700 dark:text-rose-300'
                      : isTraded
                      ? 'border-indigo-500/60 bg-indigo-500/10 font-bold text-indigo-700 dark:text-indigo-300'
                      : isMine
                      ? 'border-emerald-500/50 bg-emerald-500/5 font-bold'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>#{slotNum}</div>
                  <div className="font-sans truncate">
                    {ownerTid}
                    {hasR1Penalty ? '↓' : ''}
                  </div>
                  {isTraded && prov && (
                    <div className="text-[9px] font-sans text-indigo-600 dark:text-indigo-300 truncate">
                      ←{prov.originalTeamId}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Animated Draft Pick Announcement Banner (PICK IS IN — Club Colored for 1R) */}
      <AnimatePresence mode="wait">
        {latestPick && (() => {
          const latestTheme = TEAM_UI_THEMES[latestPick.teamId];
          const isR1Banner = latestPick.round === 1;
          return (
            <motion.div
              key={`pick-banner-${latestPick.round}-${latestPick.pickInRound}-${latestPick.candidateId}`}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              style={
                isR1Banner
                  ? {
                      borderColor: latestTheme.primaryLight,
                      backgroundImage: `linear-gradient(90deg, rgba(${latestTheme.rgbLight}, 0.16), rgba(${latestTheme.rgbLight}, 0.05), transparent)`,
                    }
                  : undefined
              }
              className={`p-3.5 rounded-md border flex flex-wrap items-center justify-between gap-3 ${
                isR1Banner
                  ? 'border-2'
                  : latestPick.teamId === career.playerTeamId
                  ? 'border-orange-500 bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-transparent'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <TeamLogo teamId={latestPick.teamId} size="sm" />
                <div className="min-w-0">
                  <div
                    style={isR1Banner ? { color: latestTheme.primaryLight } : undefined}
                    className={`text-[10px] font-extrabold tracking-wider uppercase flex items-center gap-1.5 ${
                      isR1Banner ? '' : 'text-orange-600 dark:text-orange-400'
                    }`}
                  >
                    {isR1Banner && <Crown className="w-3 h-3" />}
                    <span>
                      {isR1Banner ? '1ST ROUND PICK IS IN' : 'PICK IS IN'} · {latestPick.round}라운드{' '}
                      {latestPick.pickInRound}순위 (전체 #{(latestPick.round - 1) * 10 + latestPick.pickInRound})
                    </span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                    {KBO_TEAMS[latestPick.teamId].shortName} 지명 — {latestPick.playerName} ({latestPick.position})
                  </div>
                </div>
              </div>
              <div className="text-xs font-mono-stats font-bold text-slate-600 dark:text-slate-300 shrink-0">
                능력 {latestPick.ability} / 잠재 {latestPick.potential} · 계약금 {latestPick.signingBonusBillion.toFixed(1)}억
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* AI Scout Recommended Picks TOP 3 */}
      {aiRecommended.length > 0 && (
        <div className="border border-orange-500/40 bg-orange-500/5 rounded-md p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-orange-700 dark:text-orange-300">
              <Award className="w-4 h-4" />
              <span>
                스카우트 팀 니즈 맞춤 추천 선수 TOP 3 ({ds.currentRound}R · {KBO_TEAMS[career.playerTeamId].shortName})
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {isUserTurn ? '현재 우리 구단 지명 차례 — 즉시 지명 가능' : '내 구단 차례 도달 시 즉시 지명 가능'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {aiRecommended.map((rec, idx) => {
              const c = rec.candidate;
              const grade = c.scoutGrade ?? 'A';
              return (
                <div
                  key={c.id}
                  className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-orange-600 text-white font-mono-stats">
                          추천 #{idx + 1}
                        </span>
                        <span className="text-xs font-extrabold truncate">{c.name}</span>
                        <span className="text-[11px] font-mono-stats text-slate-500">{c.position}</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-extrabold font-mono-stats ${GRADE_STYLE[grade]}`}
                      >
                        {grade}급
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {c.age}세 · {c.originType} · {c.school}
                      {c.isOverseasReturnee ? ' · 해외파 복귀' : ''}
                      {c.scoutTag ? ` · ${c.scoutTag}` : ''}
                    </div>
                    <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      {rec.reason}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="font-mono-stats font-bold">
                      능력 {c.ability} / 잠재 {c.potential} · 계약금 {c.signingBonusBillion.toFixed(1)}억
                    </span>
                    <button
                      type="button"
                      disabled={!isUserTurn}
                      onClick={() => handlePickCandidate(c.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                        isUserTurn
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'border border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {isUserTurn ? '즉시 지명' : '대기'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Draft Pool + Live Pick Ticker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Candidate Pool */}
        <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 rounded-md p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold">
              지명 가능 신인 풀 ({availableDraft.length}명)
              {isUserTurn && (
                <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                  — {career.playerTeamId} {ds.currentRound}라운드 차례: 아래에서 선수를 지명하세요
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <div className="flex items-center gap-1">
                {(['전체', '투수', '타자'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRoleFilter(f)}
                    className={`px-2 py-1 rounded border font-semibold ${
                      roleFilter === f
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {(['전체', '고졸', '대학', '독립리그'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOriginFilter(o)}
                    className={`px-2 py-1 rounded border font-semibold ${
                      originFilter === o
                        ? 'bg-orange-600 text-white border-transparent'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {ds.completed ? (
            <div className="p-4 text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded">
              1~11라운드 전체 드래프트 지명이 완료되었습니다 (총 {ds.picks.length}명 지명).
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-500">
                  <tr>
                    <th className="py-2 px-3">선수 / 스카우트 태그</th>
                    <th className="py-2 px-2">등급</th>
                    <th className="py-2 px-2">나이 · 출신</th>
                    <th className="py-2 px-2">포지션</th>
                    <th className="py-2 px-2 text-right">추정 능력/잠재</th>
                    <th className="py-2 px-2 text-right">계약금</th>
                    <th className="py-2 px-3 text-right">스카우팅 · 지명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {availableDraft.slice(0, 60).map((c) => {
                    const grade = c.scoutGrade ?? 'B';
                    const isRec = recommendedIds.has(c.id);
                    const acc = c.scoutAccuracy ?? '보통';
                    const isExact = acc === '정밀';
                    const dispAb = isExact ? c.ability : (c.scoutedAbility ?? c.ability);
                    const dispPot = isExact ? c.potential : (c.scoutedPotential ?? c.potential);
                    return (
                      <tr
                        key={c.id}
                        title={c.amateurSummary}
                        className={
                          isRec
                            ? 'bg-orange-500/5 hover:bg-orange-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }
                      >
                        <td className="py-1.5 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold">{c.name}</span>
                            {c.topProspectBadge && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                                {c.topProspectBadge}
                              </span>
                            )}
                            {c.invitedToDraftCeremony && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                현장 초청
                              </span>
                            )}
                            {isRec && (
                              <span className="px-1 py-0.5 rounded bg-orange-600 text-white text-[10px] font-bold">
                                추천
                              </span>
                            )}
                            {c.isOverseasReturnee && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[10px] font-bold">
                                해외파 복귀
                              </span>
                            )}
                            {c.scoutTag && (
                              <span className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300">
                                {c.scoutTag}
                              </span>
                            )}
                            {isExact && c.hiddenTrait && (
                              <span className="px-1.5 py-0.5 rounded border border-emerald-500/50 bg-emerald-500/10 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                특성: {c.hiddenTrait}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[260px]">
                            {c.permanentId ? `${c.permanentId} · ` : ''}
                            {c.amateurSummary}
                          </div>
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-extrabold font-mono-stats ${GRADE_STYLE[grade]}`}
                          >
                            {grade}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-500">
                          <span className="font-mono-stats font-semibold text-slate-700 dark:text-slate-300">
                            {c.age}세
                          </span>{' '}
                          · {c.originType} · {c.school}
                        </td>
                        <td className="py-1.5 px-2 font-mono-stats">{c.position}</td>
                        <td className="py-1.5 px-2 text-right font-mono-stats font-semibold">
                          <div>
                            {dispAb}/{dispPot}
                            {!isExact && <span className="text-[10px] text-slate-400 ml-0.5">±</span>}
                          </div>
                          <div
                            className={`text-[10px] font-sans ${
                              isExact
                                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                : 'text-slate-400'
                            }`}
                          >
                            {isExact ? '정밀확인' : acc === '미확인' ? '미확인(오차큼)' : '보통평가'}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono-stats">
                          {c.signingBonusBillion.toFixed(1)}억
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            {!isExact && (
                              <button
                                type="button"
                                onClick={() => handleScoutCandidate(c.id)}
                                title="0.4억 투입해 실제 능력/잠재 및 숨겨진 특성 정밀 스카우팅"
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <Search className="w-3 h-3" />
                                <span>스카우트</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!isUserTurn}
                              onClick={() => handlePickCandidate(c.id)}
                              className={`px-2.5 py-1 rounded font-semibold ${
                                isUserTurn
                                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                                  : 'border border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              {isUserTurn ? '지명' : '대기'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Live Pick Feed & My Team Picks */}
        <div className="space-y-3">
          <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 space-y-2">
            <div className="text-xs font-bold">실시간 전체 구단 지명 현황 (최근 12픽)</div>
            {recentPicks.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                아직 지명이 시작되지 않았습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto text-xs">
                {recentPicks.map((pk) => (
                  <div
                    key={`${pk.round}-${pk.pickInRound}-${pk.candidateId}`}
                    className={`py-1.5 flex items-center justify-between gap-2 ${
                      pk.teamId === career.playerTeamId ? 'font-bold text-orange-700 dark:text-orange-300' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`font-mono-stats w-9 shrink-0 ${
                          pk.round === 1 ? 'text-amber-600 dark:text-amber-400 font-extrabold' : 'text-slate-400'
                        }`}
                      >
                        {pk.round}R-{pk.pickInRound}
                      </span>
                      <TeamLogo teamId={pk.teamId} size="xs" />
                      <span className="truncate">{pk.playerName}</span>
                      {pk.originalTeamId && pk.originalTeamId !== pk.teamId && (
                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-300 shrink-0">
                          (트레이드←{pk.originalTeamId})
                        </span>
                      )}
                    </div>
                    <span className="font-mono-stats text-slate-500 shrink-0">
                      {pk.position} {pk.ability}/{pk.potential}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 space-y-2">
            <div className="text-xs font-bold">
              {KBO_TEAMS[career.playerTeamId].name} 지명 신인 ({myDraftPicks.length}명)
            </div>
            {myDraftPicks.length === 0 ? (
              <div className="text-xs text-slate-500">아직 지명한 신인이 없습니다.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto text-xs font-mono-stats">
                {myDraftPicks.map((pk) => (
                  <div key={pk.candidateId} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="truncate">
                      <strong className="text-orange-600 dark:text-orange-400">{pk.pickNotation}</strong>{' '}
                      <span className="font-sans font-semibold">{pk.playerName}</span> ({pk.position})
                      {pk.originalTeamId && pk.originalTeamId !== pk.teamId ? (
                        <span className="ml-1 font-sans text-[10px] text-indigo-600 dark:text-indigo-300 font-bold">
                          [{pk.originalTeamId} 지명권 트레이드]
                        </span>
                      ) : (
                        <span className="ml-1 font-sans text-[10px] text-slate-400">[원소속]</span>
                      )}
                    </span>
                    <span className="shrink-0">
                      {pk.ability}/{pk.potential} · {pk.signingBonusBillion.toFixed(1)}억
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
