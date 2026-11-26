import React, { useState } from 'react';
import { ArrowDown, ArrowUp, MessageSquare, Plane, ShieldAlert, Sparkles, TrendingUp, UserMinus, Users, X } from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { getLiveCareerStats, getNationalityDisplay } from '../data/playerMetadata';
import {
  applyAllCoachFormRecommendations,
  applyCoachFormRecommendation,
  applyManagerPreGameRecommendation,
  formatKrwBillionKorean,
  formatKrwContractSummary,
  getCoachDevelopmentalRecommendations,
  getCoachFormLineupRecommendations,
  getManagerPreGameRecommendation,
  isPlayerOnNationalTeamDuty,
  OVERSEAS_TRAINING_PROGRAMS,
  recruitDevelopmentalCandidate,
  releaseDomesticPlayerToWaiver,
  sendPlayerToOverseasTraining,
} from '../engine/franchiseSystems';
import {
  changePlayerUniformNumber,
  decideMedicalReturn,
  setTeamCaptain,
} from '../engine/deepFranchise';
import {
  applyOptimizedBattingLineup,
  optimizeBattingLineup,
} from '../engine/lineupOptimizer';
import {
  fixMyTeamLineupPositions,
  REQUIRED_STARTING_POSITIONS,
  validateStartingLineup,
} from '../engine/lineupValidationEngine';
import {
  getRecommendedReleaseCandidates,
  getRecommendedRosterMoves,
} from '../engine/recommendations';
import {
  calcAVG,
  calcERA,
  calcOPS,
  formatIP,
  formatRate2,
  formatRate3,
} from '../engine/stats';
import {
  checkDevelopmentalConversionEligibility,
  getClubRosterQuotaSummary,
} from '../engine/developmentalEngine';
import { evaluateFranchiseStar } from '../engine/franchiseStarEngine';
import {
  computeYoYSalaryChange,
  executeMarkedOffseasonReleases,
  getPlayerContractExpiryAlert,
  getPlayerRetirementAlert,
  togglePlayerOffseasonReleaseMark,
} from '../engine/leagueLifeEngine';
import { CountryFlag, NationalityBadge } from './CountryFlag';
import {
  applyRecommendedTrainingBatch,
  callUpPlayer,
  computeRecommendedTrainingFocus,
  demotePlayer,
  releaseForeignPlayer,
  reorderBullpen,
  reorderStartingRotation,
  setLineupSlot,
  swapLineupOrder,
  swapRotationWithBullpen,
  togglePitcherRotationSpot,
  updateRosterPlacement,
} from '../engine/transactions';
import {
  canHoldPlayerMeeting,
  conductGmPlayerMeeting,
  getDissatisfactionLevel,
  getPlayerDissatisfaction,
  getReSignResistanceAssessment,
  GM_MEETING_ACTIONS,
} from '../engine/dissatisfactionEngine';
import {
  ALL_BULLPEN_ROLES,
  BullpenRoleType,
  getPitcherRestDays,
  normalizeBullpenRole,
  setTeamBullpenPitcherRole,
} from '../engine/pitchingUsageEngine';
import { getCurrentCareerDate } from '../engine/salaryCapEngine';
import {
  formatMilitaryStatusLabel,
  formatThrowsBatsKorean,
  isMilitaryServing,
  resolveDisplayMilitaryStatus,
} from '../engine/militaryEngine';
import {
  ALL_FIELD_POSITIONS,
  ALL_HITTER_LINEUP_POSITIONS,
  computeEffectiveFieldingAtPosition,
  formatCompactPlayerPosition,
  getPositionProficiency,
} from '../engine/positionEngine';
import {
  BatterStats,
  CareerSave,
  GmMeetingAction,
  OverseasTrainingRecord,
  PitcherStats,
  Player,
  Position,
  RosterTier,
  TrainingFocus,
} from '../types/kbo';
import { PlayerCategoryTag } from './PlayerCategoryTag';
import {
  FranchiseStarIcon,
  isFranchiseStarPlayer,
  PlayerCompactTag,
  PlayerForeignFlag,
} from './PlayerStatusCompact';
import { TeamLogo } from './TeamLogo';

interface RosterLineupViewProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onSelectPlayer?: (playerId: string) => void;
}

const TRAINING_OPTIONS: TrainingFocus[] = [null, '타격', '수비', '주루', '구위', '제구', '체력'];

export const RosterLineupView: React.FC<RosterLineupViewProps> = ({
  career,
  onUpdateCareer,
  onSelectPlayer,
}) => {
  void onSelectPlayer;
  const [subTab, setSubTab] = useState<'lineup' | 'roster' | 'growth' | 'injuries'>('lineup');
  const [tierFilter, setTierFilter] = useState<'ALL' | RosterTier>('1군');
  const [growthScope, setGrowthScope] = useState<'team' | 'league'>('team');
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [uniformDraft, setUniformDraft] = useState<string>('');
  const [showOptimizerPreview, setShowOptimizerPreview] = useState<boolean>(false);

  const teamId = career.playerTeamId;
  const teamState = career.teams[teamId];
  const currentDateIso = getCurrentCareerDate(career).isoDate;
  const myPlayers = Object.values(career.players).filter(
    (p) =>
      p.teamId === teamId &&
      p.rosterTier !== 'FA' &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적'
  );
  const departedFaPlayers = Object.values(career.players).filter(
    (p) => p.rosterTier === 'FA' && (p.formerTeamId ?? p.teamId) === teamId
  );

  const firstTeamCount = myPlayers.filter((p) => p.rosterTier === '1군').length;
  const futuresCount = myPlayers.filter((p) => p.rosterTier === '2군').length;
  const devCount = myPlayers.filter((p) => p.rosterTier === '육성').length;
  const activeCount = myPlayers.filter((p) => p.rosterTier === '1군' && p.gameDayActive).length;
  const injuredPlayers = myPlayers.filter((p) => Boolean(p.injury));
  const recommendedMoves = getRecommendedRosterMoves(career);
  const releaseRecommendations = getRecommendedReleaseCandidates(career, 6);
  const trainingPendingCount = myPlayers.filter((p) => {
    if (p.rosterTier === '제외후보') return false;
    return p.trainingFocus !== computeRecommendedTrainingFocus(p).focus;
  }).length;

  const lineupPlayers = teamState.lineupOrder
    .map((id) => career.players[id])
    .filter((p): p is Player => Boolean(p));

  const benchHitters = myPlayers.filter(
    (p) =>
      p.role === '타자' &&
      p.rosterTier === '1군' &&
      !teamState.lineupOrder.includes(p.id)
  );

  const rotationPitchers = teamState.rotationOrder
    .map((id) => career.players[id])
    .filter((p): p is Player => Boolean(p));

  const rawBullpen = myPlayers.filter(
    (p) =>
      p.role === '투수' &&
      p.rosterTier === '1군' &&
      !teamState.rotationOrder.includes(p.id)
  );
  const bullpenOrderIdx = new Map(teamState.bullpenOrder.map((id, i) => [id, i]));
  const bullpenPitchers = [...rawBullpen].sort(
    (a, b) => (bullpenOrderIdx.get(a.id) ?? 999) - (bullpenOrderIdx.get(b.id) ?? 999)
  );

  const managerPreGameRec = getManagerPreGameRecommendation(career);
  const optimizedLineupPreview = optimizeBattingLineup(career, teamId);
  const coachFormRecs = getCoachFormLineupRecommendations(career);
  const coachDevAdvice = getCoachDevelopmentalRecommendations(career);

  const handleRosterAction = (
    playerId: string,
    action: {
      rosterTier?: RosterTier;
      gameDayActive?: boolean;
      trainingFocus?: TrainingFocus;
      positionTrainingTarget?: Position | null;
    }
  ) => {
    try {
      setNotice(null);
      const next = updateRosterPlacement(career, playerId, action);
      onUpdateCareer(next);
      if (selectedPlayer?.id === playerId) {
        setSelectedPlayer(next.players[playerId]);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '엔트리 조정 중 오류가 발생했습니다.');
    }
  };

  const handleCallUp = (playerId: string) => {
    try {
      setNotice(null);
      const next = callUpPlayer(career, playerId);
      onUpdateCareer(next);
      if (selectedPlayer?.id === playerId) setSelectedPlayer(next.players[playerId]);
      setNotice(`${next.players[playerId].name} 선수를 1군 엔트리로 콜업했습니다.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '콜업 처리 오류');
    }
  };

  const handleDemote = (playerId: string) => {
    try {
      setNotice(null);
      const next = demotePlayer(career, playerId);
      onUpdateCareer(next);
      if (selectedPlayer?.id === playerId) setSelectedPlayer(next.players[playerId]);
      setNotice(`${next.players[playerId].name} 선수를 2군으로 강등(말소)했습니다.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '강등 처리 오류');
    }
  };

  const handleRecruitDevCandidate = (candidateId: string) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot, player } = recruitDevelopmentalCandidate(
        career,
        candidateId
      );
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice(
        `${player.name} (${player.position} · #${player.uniformNumber}) 육성선수 신규 영입이 완료되었습니다.`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '육성선수 영입 오류');
    }
  };

  const handleApplyBatchTraining = () => {
    const { nextCareer, summary } = applyRecommendedTrainingBatch(career);
    onUpdateCareer(nextCareer);
    if (selectedPlayer) {
      setSelectedPlayer(nextCareer.players[selectedPlayer.id] ?? null);
    }
    setNotice(summary);
  };

  const handleMeeting = (playerId: string, action: GmMeetingAction) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot, summary } = conductGmPlayerMeeting(
        career,
        playerId,
        action
      );
      onUpdateCareer(nextCareer, backupSnapshot);
      setSelectedPlayer(nextCareer.players[playerId]);
      setNotice(summary);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '선수 면담을 진행할 수 없습니다.');
    }
  };

  const handleDispatchOverseasTraining = (
    playerId: string,
    programId: OverseasTrainingRecord['programId']
  ) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = sendPlayerToOverseasTraining(career, playerId, programId);
      onUpdateCareer(nextCareer, backupSnapshot);
      const p = nextCareer.players[playerId];
      const prog = OVERSEAS_TRAINING_PROGRAMS.find((x) => x.id === programId);
      setNotice(
        `${p.name} 선수를 [${prog?.name ?? '해외연수'}]에 파견했습니다 (-${prog?.costBillion ?? 0}억 원).`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '해외연수 파견 오류');
    }
  };

  const handleReleaseRecommendedPlayer = (playerId: string) => {
    try {
      setNotice(null);
      const pl = career.players[playerId];
      if (!pl) return;
      const res =
        pl.category === '외국인' || pl.category === '아시아쿼터'
          ? releaseForeignPlayer(career, playerId)
          : releaseDomesticPlayerToWaiver(career, playerId);
      onUpdateCareer(res.nextCareer, res.backupSnapshot);
      if (selectedPlayer?.id === playerId) setSelectedPlayer(null);
      setNotice(`${pl.name} 선수를 방출(웨이버 공시) 처리했습니다.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '방출 처리 오류');
    }
  };

  const handleReleaseAllRecommended = () => {
    if (releaseRecommendations.length === 0) return;
    let cur = career;
    const backup = structuredClone(career);
    const releasedNames: string[] = [];
    for (const rec of releaseRecommendations) {
      const pl = cur.players[rec.player.id];
      if (!pl) continue;
      try {
        const res =
          pl.category === '외국인' || pl.category === '아시아쿼터'
            ? releaseForeignPlayer(cur, pl.id)
            : releaseDomesticPlayerToWaiver(cur, pl.id);
        cur = res.nextCareer;
        releasedNames.push(pl.name);
      } catch {
        // skip if roster guard stops release
      }
    }
    if (releasedNames.length > 0) {
      onUpdateCareer(cur, backup);
      setSelectedPlayer(null);
      setNotice(`방출 추천 선수 ${releasedNames.length}명 일괄 방출 완료: ${releasedNames.join(', ')}`);
    } else {
      setNotice('현재 방출 가능한 선수가 없습니다.');
    }
  };

  const overseasCandidates = myPlayers
    .filter(
      (p) =>
        p.rosterTier !== '제외후보' &&
        !isMilitaryServing(p.militaryStatus) &&
        !p.overseasTrainingLocation &&
        !p.injury
    )
    .sort((a, b) => {
      const scoreA = (a.form <= -1 ? 40 - a.form * 10 : 0) + (a.age <= 25 ? 20 : 0) + (a.potential - a.ability);
      const scoreB = (b.form <= -1 ? 40 - b.form * 10 : 0) + (b.age <= 25 ? 20 : 0) + (b.potential - b.ability);
      return scoreB - scoreA;
    })
    .slice(0, 8);

  const activeOverseas = (career.overseasTrainings ?? []).filter(
    (r) => r.teamId === teamId && r.status === '연수중'
  );
  const completedOverseas = (career.overseasTrainings ?? []).filter(
    (r) => r.teamId === teamId && r.status === '복귀완료'
  );

  const filteredRoster = myPlayers
    .filter((p) => (tierFilter === 'ALL' ? true : p.rosterTier === tierFilter))
    .sort((a, b) => b.ability - a.ability);

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="gm-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 shrink-0">
            <TeamLogo teamId={teamId} size="md" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-base font-extrabold tracking-tight">
              <Users className="w-4 h-4 team-accent-text" />
              <span>{KBO_TEAMS[teamId].name} 선수단 · 타순 · 육성</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono-stats mt-0.5">
              <span>1군 등록 <strong className="text-slate-800 dark:text-slate-200">{firstTeamCount}</strong>/30명</span>
              <span>·</span>
              <span>2군 <strong className="text-slate-800 dark:text-slate-200">{futuresCount}</strong>명</span>
              <span>·</span>
              <span>육성 <strong className="text-slate-800 dark:text-slate-200">{devCount}</strong>명</span>
              <span>·</span>
              <span>당일 출장 <strong className="text-slate-800 dark:text-slate-200">{activeCount}</strong>/28명</span>
              <span>·</span>
              <span className={injuredPlayers.length > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
                부상 {injuredPlayers.length}명
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/70 p-1 text-xs self-start">
          {[
            { id: 'lineup', label: '고정 타순 · 투수진' },
            { id: 'roster', label: `1군·2군·육성 (${futuresCount + devCount})` },
            { id: 'growth', label: `성장·훈련 (${career.growthLogs.filter((g) => g.teamId === teamId).length})` },
            { id: 'injuries', label: `부상자 (${injuredPlayers.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as 'lineup' | 'roster' | 'growth' | 'injuries')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                subTab === t.id
                  ? 'team-accent-bg shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Captain & Team Leadership Bar (#3) */}
      {(() => {
        const lead = teamState.leadership;
        const firstTeamDomestic = myPlayers.filter((p) => p.rosterTier === '1군' && p.category === '국내');
        const currentCaptain = lead?.captainPlayerId ? career.players[lead.captainPlayerId] : null;
        const actingCaptain = lead?.actingCaptainPlayerId
          ? career.players[lead.actingCaptainPlayerId]
          : null;
        const capFran = currentCaptain ? evaluateFranchiseStar(career, currentCaptain) : null;
        return (
          <div className="gm-card px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold text-slate-900 dark:text-white">
                선수단 주장:{' '}
                <span className="text-indigo-600 dark:text-indigo-400">
                  {currentCaptain
                    ? `${currentCaptain.name} (${currentCaptain.position} · 만 ${currentCaptain.age}세${
                        capFran && capFran.tier !== '일반' ? ` · ${capFran.tier}` : ''
                      })`
                    : '미선임'}
                </span>
              </span>
              {actingCaptain && (
                <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/40 text-sky-700 dark:text-sky-300 font-bold text-[11px]">
                  임시 주장: {actingCaptain.name} ({lead?.actingCaptainReason ?? '주장 이탈 대행'})
                </span>
              )}
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="font-mono-stats text-slate-600 dark:text-slate-300">
                베테랑 리더십 <strong className="text-slate-900 dark:text-white">{lead?.veteranLeadership ?? 74}</strong> · 감독 관계{' '}
                <strong className="text-slate-900 dark:text-white">{lead?.managerRelation ?? 76}</strong> · 신인 적응{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  +{(lead?.rookieAdaptationBonus ?? 2)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-semibold text-slate-500">주장 선임:</span>
              <select
                value={lead?.captainPlayerId ?? ''}
                onChange={(e) => {
                  if (!e.target.value) return;
                  try {
                    const { nextCareer, backupSnapshot } = setTeamCaptain(career, e.target.value);
                    onUpdateCareer(nextCareer, backupSnapshot);
                    setNotice(`${nextCareer.players[e.target.value]?.name} 선수를 새 선수단 주장으로 선임했습니다.`);
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : '주장 선임 오류');
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold text-xs shadow-2xs"
              >
                <option value="">주장 선택</option>
                {firstTeamDomestic.map((p) => {
                  const ft = evaluateFranchiseStar(career, p).tier;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.position} · {p.age}세 · OVR {p.ability}{ft !== '일반' ? ` · ${ft}` : ''})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        );
      })()}

      {notice && (
        <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-800 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* TAB 1: Vertical 1-line Lineup + Rotation */}
      {subTab === 'lineup' && (
        <div className="space-y-4">
          {/* #11: Manager Pre-Game Lineup & Rotation Recommendation */}
          <div className="border team-accent-surface rounded-xl p-4 space-y-2.5 text-xs shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold team-accent-text flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>경기 전 {managerPreGameRec.managerName} 감독 타순 · 선발 로테이션 추천</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateCareer(applyManagerPreGameRecommendation(career, 'lineup'));
                    setNotice(`${managerPreGameRec.managerName} 감독 추천 선발 타순(DH 포함)을 적용했습니다.`);
                  }}
                  className="px-2.5 py-1 rounded team-accent-outline font-bold"
                >
                  추천 타순 적용
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateCareer(applyManagerPreGameRecommendation(career, 'rotation'));
                    setNotice(`${managerPreGameRec.managerName} 감독 추천 5선발 로테이션을 적용했습니다.`);
                  }}
                  className="px-2.5 py-1 rounded team-accent-outline font-bold"
                >
                  추천 선발 적용
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateCareer(applyManagerPreGameRecommendation(career, 'both'));
                    setNotice(`${managerPreGameRec.managerName} 감독 추천 타순과 선발 로테이션을 일괄 적용했습니다.`);
                  }}
                  className="px-3 py-1 rounded team-accent-btn font-bold"
                >
                  타순·선발 일괄 적용
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">{managerPreGameRec.briefing}</p>
            <div className="flex flex-wrap gap-1.5">
              {managerPreGameRec.recommendedLineup.map((item) => (
                <span
                  key={item.playerId}
                  className={`px-2 py-0.5 rounded border font-mono-stats text-[11px] ${
                    item.assignedPosition === 'DH'
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-200 font-bold'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  {item.order}. {item.playerName} (
                  {item.assignedPosition === 'DH' && item.naturalPosition !== 'DH'
                    ? `${item.naturalPosition}→DH`
                    : item.assignedPosition}
                  )
                </span>
              ))}
            </div>
          </div>

          {/* #8: Coach Form-Based Starter In/Out Recommendations */}
          {coachFormRecs.length > 0 && (
            <div className="border border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/15 rounded-md p-3.5 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" />
                  <span>코치 컨디션·폼 기반 선발 기용 / 제외 추천 ({coachFormRecs.length}건)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const { nextCareer, appliedCount } = applyAllCoachFormRecommendations(career);
                    onUpdateCareer(nextCareer);
                    setNotice(`코치 폼 추천 ${appliedCount}건을 선발 라인업·로테이션에 일괄 반영했습니다.`);
                  }}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  폼 추천 일괄 적용 ({coachFormRecs.length}건)
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {coachFormRecs.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900">
                          {rec.coachRole} {rec.coachName}
                        </span>
                        <span className="text-rose-600 dark:text-rose-400">
                          제외: {rec.outPlayerName} ({rec.outPlayerForm >= 0 ? `+${rec.outPlayerForm}` : rec.outPlayerForm})
                        </span>
                        <span>→</span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          기용: {rec.inPlayerName} (+{rec.inPlayerForm})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {rec.outReason} · {rec.inReason}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateCareer(applyCoachFormRecommendation(career, rec));
                        setNotice(`${rec.outPlayerName} → ${rec.inPlayerName} 선발 교체를 완료했습니다.`);
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shrink-0"
                    >
                      즉시 교체
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Strict Vertical 1~9 Lineup */}
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">선발 타순 (1~9번 세로 고정형)</h3>
                  <span className="text-[11px] text-slate-500">포지션 중복 불가(1자리 1포지션·DH 허용) · 벤치 교체 · 타순 조정</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowOptimizerPreview((v) => !v)}
                    className="px-2.5 py-1 rounded border border-indigo-500/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-[11px] font-bold"
                  >
                    {showOptimizerPreview ? '기준표 닫기' : '타순 기준표·미리보기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const { nextCareer, backupSnapshot, result } = applyOptimizedBattingLineup(career, teamId);
                        onUpdateCareer(nextCareer, backupSnapshot);
                        setNotice(`타순 자동 최적화 완료 — ${result.summary}`);
                      } catch (err) {
                        setNotice(err instanceof Error ? err.message : '타순 자동 최적화 실패');
                      }
                    }}
                    className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    타순 자동 최적화
                  </button>
                </div>
              </div>

              {showOptimizerPreview && (
                <div className="border border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-md p-3 space-y-2 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-extrabold text-indigo-800 dark:text-indigo-200">
                      1~9번 타순 자동 최적화 분석표 (중복 포지션 불가 · 8수비+DH)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const { nextCareer, backupSnapshot, result } = applyOptimizedBattingLineup(career, teamId);
                          onUpdateCareer(nextCareer, backupSnapshot);
                          setShowOptimizerPreview(false);
                          setNotice(`타순 자동 최적화 완료 — ${result.summary}`);
                        } catch (err) {
                          setNotice(err instanceof Error ? err.message : '타순 자동 최적화 실패');
                        }
                      }}
                      className="px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                    >
                      추천 타순 즉시 적용
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="text-slate-500 border-b border-indigo-200 dark:border-indigo-900">
                        <tr>
                          <th className="py-1 px-1.5 text-left">타순</th>
                          <th className="py-1 px-1.5 text-left">추천 유형 (평가 요소)</th>
                          <th className="py-1 px-1.5 text-left">추천 선수</th>
                          <th className="py-1 px-1.5 text-left">포지션</th>
                          <th className="py-1 px-1.5 text-right">적합도</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-100 dark:divide-indigo-950/60">
                        {optimizedLineupPreview.slots.map((slot) => (
                          <tr key={slot.order}>
                            <td className="py-1 px-1.5 font-mono-stats font-bold text-indigo-700 dark:text-indigo-300">
                              {slot.order}번
                            </td>
                            <td className="py-1 px-1.5">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{slot.roleTitle}</div>
                              <div className="text-[10px] text-slate-500">{slot.keyFactors}</div>
                            </td>
                            <td className="py-1 px-1.5">
                              <div className="font-bold text-slate-900 dark:text-white">{slot.playerName}</div>
                              <div className="text-[10px] text-slate-500">{slot.reason}</div>
                            </td>
                            <td className="py-1 px-1.5 font-mono-stats font-semibold">
                              {slot.assignedPosition === 'DH' && slot.naturalPosition !== 'DH'
                                ? `${slot.naturalPosition}→DH`
                                : slot.assignedPosition}
                            </td>
                            <td className="py-1 px-1.5 text-right font-mono-stats font-bold text-indigo-700 dark:text-indigo-300">
                              {slot.slotScore.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 선발 타자 9포지션 실시간 검증 & 중복 보정 스트립 */}
              {(() => {
                const lineupValidation = validateStartingLineup(career, teamId);
                const posCounts = new Map<Position, number>();
                for (const lp of lineupPlayers) {
                  const ap = (teamState.lineupPositions[lp.id] ?? lp.position) as Position;
                  posCounts.set(ap, (posCounts.get(ap) ?? 0) + 1);
                }
                return (
                  <div
                    className={`rounded-md border px-3 py-2 text-[11px] space-y-1.5 ${
                      lineupValidation.isValid
                        ? 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-rose-500/50 bg-rose-50/70 dark:bg-rose-950/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`font-bold ${
                          lineupValidation.isValid
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {lineupValidation.isValid
                          ? `✓ ${lineupValidation.summary}`
                          : `⚠ 라인업 점검 필요: ${lineupValidation.summary}`}
                      </span>
                      {!lineupValidation.isValid && (
                        <button
                          type="button"
                          onClick={() => {
                            const fixed = fixMyTeamLineupPositions(career);
                            onUpdateCareer(fixed.nextCareer, fixed.backupSnapshot);
                            setNotice(
                              fixed.report.isValid
                                ? '선발 타자 9포지션 중복·누락을 자동 수정했습니다.'
                                : `라인업 보정 완료 (${fixed.report.summary})`
                            );
                          }}
                          className="px-2.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer"
                        >
                          포지션 중복 자동 수정
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {REQUIRED_STARTING_POSITIONS.map((reqPos) => {
                        const cnt = posCounts.get(reqPos) ?? 0;
                        return (
                          <span
                            key={reqPos}
                            className={`px-1.5 py-0.5 rounded font-mono-stats text-[10px] font-bold border ${
                              cnt === 1
                                ? 'border-emerald-400/50 bg-white/80 dark:bg-slate-900/70 text-emerald-700 dark:text-emerald-300'
                                : cnt > 1
                                  ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                  : 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {reqPos}
                            {cnt > 1 ? ` ×${cnt}` : cnt === 0 ? ' 누락' : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                {lineupPlayers.map((p, idx) => {
                  const pos = teamState.lineupPositions[p.id] ?? p.position;
                  const samePosCount = lineupPlayers.filter(
                    (lp) => (teamState.lineupPositions[lp.id] ?? lp.position) === pos
                  ).length;
                  const isDupPosRow = samePosCount > 1;
                  const onNationalDuty = isPlayerOnNationalTeamDuty(p, career.gamesPlayed);
                  const isDhOverride = pos === 'DH' && p.position !== 'DH';
                  const isNonPrimaryField = pos !== 'DH' && pos !== p.position;
                  const slotEff = computeEffectiveFieldingAtPosition(p, pos);
                  const orderedPosOptions: Position[] = [
                    ...Array.from(
                      new Set<Position>([
                        pos,
                        p.position,
                        ...(p.secondaryPositions ?? []),
                        'DH',
                        ...ALL_HITTER_LINEUP_POSITIONS,
                      ])
                    ),
                  ];
                  const sortedBenchForSlot = [...benchHitters].sort((a, b) => {
                    const profA = pos === 'DH' ? 90 : getPositionProficiency(a, pos);
                    const profB = pos === 'DH' ? 90 : getPositionProficiency(b, pos);
                    const qualA = profA >= 60 ? 1 : 0;
                    const qualB = profB >= 60 ? 1 : 0;
                    if (qualB !== qualA) return qualB - qualA;
                    return b.ability + profB * 0.2 - (a.ability + profA * 0.2);
                  });
                  return (
                    <div
                      key={`${p.id}-${idx}`}
                      className={`px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        isDupPosRow
                          ? 'bg-rose-500/10'
                          : onNationalDuty
                            ? 'bg-blue-500/5'
                            : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPlayer(p)}
                        className="text-left font-bold flex items-center gap-1.5 min-w-0 whitespace-nowrap"
                      >
                        <span className="font-mono-stats team-accent-text w-4 shrink-0">
                          {idx + 1}.
                        </span>
                        {p.uniformNumber !== undefined && (
                          <span className="font-mono-stats text-[11px] text-slate-400 w-6 shrink-0">
                            #{p.uniformNumber}
                          </span>
                        )}
                        <span className="truncate">{p.name}</span>
                        <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                        <PlayerForeignFlag player={p} />
                        <span
                          title={
                            isNonPrimaryField
                              ? `${pos} 숙련도 ${slotEff.proficiency}/100 (${slotEff.tierLabel}${slotEff.penalty > 0 ? ` · 수비 -${Math.round(slotEff.penalty)}` : ''})`
                              : undefined
                          }
                          className={`text-[11px] shrink-0 ${
                            pos === 'DH'
                              ? 'font-semibold text-amber-700 dark:text-amber-400'
                              : isNonPrimaryField && slotEff.proficiency < 60
                                ? 'font-semibold text-rose-600 dark:text-rose-400'
                                : isNonPrimaryField
                                  ? 'font-semibold text-sky-600 dark:text-sky-400'
                                  : 'text-slate-500 font-normal'
                          }`}
                        >
                          {isDhOverride
                            ? `${p.position}→DH`
                            : isNonPrimaryField
                              ? `${p.position}→${pos}(${slotEff.proficiency}${slotEff.proficiency < 60 ? '⚠' : ''})`
                              : pos}
                        </span>
                        <PlayerCompactTag career={career} player={p} />
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`font-mono-stats mr-0.5 ${
                            p.form >= 2
                              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                              : p.form <= -2
                              ? 'text-rose-600 dark:text-rose-400 font-bold'
                              : 'text-slate-500'
                          }`}
                        >
                          {p.ability} ({p.form >= 0 ? `+${p.form}` : p.form})
                        </span>
                        <select
                          value={pos}
                          onChange={(e) => {
                            try {
                              setNotice(null);
                              const nextPos = e.target.value as Position;
                              const nextEff = computeEffectiveFieldingAtPosition(p, nextPos);
                              onUpdateCareer(setLineupSlot(career, idx, p.id, nextPos));
                              setNotice(
                                nextPos !== 'DH' && nextEff.proficiency < 60
                                  ? `${p.name} 선수를 ${nextPos}(숙련도 ${nextEff.proficiency})로 배치했습니다. 미숙 포지션 수비 페널티(-${Math.round(nextEff.penalty)})가 적용됩니다.`
                                  : `${p.name} 선수의 출전 포지션을 ${nextPos}(숙련도 ${nextEff.proficiency})로 변경했습니다.`
                              );
                            } catch (err) {
                              setNotice(err instanceof Error ? err.message : '포지션 변경 불가');
                            }
                          }}
                          title="주 포지션·보조 포지션·DH 및 비상 포지션 선택 (미숙 포지션은 수비 페널티 적용)"
                          className="px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
                        >
                          {orderedPosOptions.map((hp) => {
                            const prof = hp === 'DH' ? 90 : getPositionProficiency(p, hp);
                            const tag =
                              hp === p.position
                                ? '주'
                                : hp === 'DH'
                                  ? 'DH'
                                  : prof >= 60
                                    ? `${prof}`
                                    : `${prof}⚠`;
                            return (
                              <option key={hp} value={hp}>
                                {hp === 'DH' ? 'DH' : `${hp} (${tag})`}
                              </option>
                            );
                          })}
                        </select>
                        {benchHitters.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              const newId = e.target.value;
                              if (!newId) return;
                              try {
                                setNotice(null);
                                const rep = career.players[newId];
                                const repEff = rep ? computeEffectiveFieldingAtPosition(rep, pos) : null;
                                onUpdateCareer(setLineupSlot(career, idx, newId, pos));
                                if (rep) {
                                  setNotice(
                                    repEff && pos !== 'DH' && repEff.proficiency < 60
                                      ? `${idx + 1}번 타순(${pos}): ${p.name} ↔ ${rep.name} 교체 완료 (숙련도 ${repEff.proficiency} · 미숙 페널티 -${Math.round(repEff.penalty)})`
                                      : `${idx + 1}번 타순(${pos}): ${p.name} ↔ ${rep.name} 선수를 교체했습니다.`
                                  );
                                }
                              } catch (err) {
                                setNotice(err instanceof Error ? err.message : '선발 교체 불가');
                              }
                            }}
                            title={
                              pos === 'DH'
                                ? 'DH 자리는 모든 포지션 벤치 야수로 교체 가능'
                                : `${pos} 주·보조 포지션 및 벤치 야수 교체 (숙련도 60 미만은 수비 페널티)`
                            }
                            className="px-1 py-0.5 rounded border team-accent-border bg-white dark:bg-slate-950 text-[11px] max-w-[110px]"
                          >
                            <option value="">교체▾</option>
                            {sortedBenchForSlot.map((bh) => {
                              const prof = pos === 'DH' ? 90 : getPositionProficiency(bh, pos);
                              const fitMark = pos === 'DH' ? '' : prof >= 60 ? `·숙${prof}` : `·숙${prof}⚠`;
                              return (
                                <option key={bh.id} value={bh.id}>
                                  {bh.name}({bh.position}{fitMark}·{bh.ability})
                                </option>
                              );
                            })}
                          </select>
                        )}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onUpdateCareer(swapLineupOrder(career, idx, idx - 1))}
                          className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                          title="타순 위로"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === lineupPlayers.length - 1}
                          onClick={() => onUpdateCareer(swapLineupOrder(career, idx, idx + 1))}
                          className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                          title="타순 아래로"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 1군 대기 야수 교체 */}
              {benchHitters.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-500">
                    1군 벤치 야수 ({benchHitters.length}명 · 상단 [교체▾]로 즉시 선발 투입)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {benchHitters.map((bh) => (
                      <button
                        key={bh.id}
                        type="button"
                        onClick={() => setSelectedPlayer(bh)}
                        className="px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        {bh.uniformNumber !== undefined && (
                          <span className="font-mono-stats text-[10px] text-slate-400">#{bh.uniformNumber}</span>
                        )}
                        <span className="font-semibold">{bh.name}</span>
                        <FranchiseStarIcon active={isFranchiseStarPlayer(career, bh)} />
                        <PlayerForeignFlag player={bh} />
                        <span className="text-slate-500">
                          {formatCompactPlayerPosition(bh)} · {bh.ability} ({bh.form >= 0 ? `+${bh.form}` : bh.form})
                        </span>
                        <PlayerCompactTag career={career} player={bh} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pitching Rotation + Bullpen (with Rotation Reordering & Starter/Bullpen Direct Swap) */}
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                  <h3 className="text-sm font-bold">선발 로테이션 ({rotationPitchers.length}인 · 기본 4일 휴식)</h3>
                  <span className="text-[11px] text-slate-500">불펜 1:1 교체 · ▲/▼ 순번 변경 · 등판/이닝/연투/최근등판일</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                  {rotationPitchers.map((p, i) => {
                    const isNext = i === teamState.nextStarterIdx % Math.max(1, rotationPitchers.length);
                    const onNt = isPlayerOnNationalTeamDuty(p, career.gamesPlayed);
                    const ps = p.stats as PitcherStats;
                    const restDays = getPitcherRestDays(p, currentDateIso, career.gamesPlayed);
                    const consecDays = p.consecutivePitchDays ?? 0;
                    const lastDateLabel = p.lastPitchedDate
                      ? `${p.lastPitchedDate.slice(5)} (${restDays}일 휴식)`
                      : '등판 대기';
                    const psIneligible = p.postseasonIneligibleSeason === career.season;
                    return (
                      <div
                        key={p.id}
                        className={`w-full px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                          onNt ? 'bg-blue-500/5' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setSelectedPlayer(p)}
                            className="font-semibold flex items-center gap-1.5 min-w-0 text-left whitespace-nowrap"
                          >
                            <span className="font-mono-stats team-accent-text shrink-0">
                              {i + 1}선발
                            </span>
                            {p.uniformNumber !== undefined && (
                              <span className="font-mono-stats text-[11px] text-slate-400 shrink-0">
                                #{p.uniformNumber}
                              </span>
                            )}
                            <span className="truncate">{p.name}</span>
                            <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                            <PlayerForeignFlag player={p} />
                            <PlayerCompactTag career={career} player={p} />
                            {isNext && !onNt && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">
                                · 다음 등판
                              </span>
                            )}
                          </button>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono-stats text-slate-500 dark:text-slate-400">
                            <span>등판 {ps.G ?? 0}G</span>
                            <span>이닝 {formatIP(ps.outs)}</span>
                            {(ps.QS ?? 0) > 0 && (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                QS {ps.QS}{(ps.QSP ?? 0) > 0 ? `(QS+ ${ps.QSP})` : ''}
                              </span>
                            )}
                            <span
                              className={
                                p.fatigue >= 70
                                  ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                  : p.fatigue >= 45
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : ''
                              }
                            >
                              피로 {p.fatigue}%
                            </span>
                            {consecDays >= 2 && (
                              <span className="text-rose-600 dark:text-rose-400 font-bold">
                                연투 {consecDays}일
                              </span>
                            )}
                            <span>최근등판 {lastDateLabel}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono-stats text-slate-500 mr-0.5">
                            {p.ability}({p.form >= 0 ? `+${p.form}` : p.form})
                          </span>
                          {bullpenPitchers.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                const bpId = e.target.value;
                                if (!bpId) return;
                                try {
                                  const bp = career.players[bpId];
                                  onUpdateCareer(swapRotationWithBullpen(career, i, bpId));
                                  if (bp) {
                                    setNotice(`${i + 1}선발: ${p.name} ↔ 불펜 ${bp.name} 투수를 교체했습니다.`);
                                  }
                                } catch (err) {
                                  setNotice(err instanceof Error ? err.message : '투수 교체 실패');
                                }
                              }}
                              title="1군 불펜 투수와 1:1 교체"
                              className="px-1 py-0.5 rounded border team-accent-border bg-white dark:bg-slate-950 text-[11px] max-w-[92px]"
                            >
                              <option value="">교체▾</option>
                              {bullpenPitchers.map((bp) => (
                                <option key={bp.id} value={bp.id}>
                                  {bp.name}({bp.ability}·{bp.form >= 0 ? `+${bp.form}` : bp.form})
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => {
                              try {
                                onUpdateCareer(reorderStartingRotation(career, i, i - 1));
                              } catch (err) {
                                setNotice(err instanceof Error ? err.message : '로테이션 변경 실패');
                              }
                            }}
                            className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="선발 순번 위로"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={i === rotationPitchers.length - 1}
                            onClick={() => {
                              try {
                                onUpdateCareer(reorderStartingRotation(career, i, i + 1));
                              } catch (err) {
                                setNotice(err instanceof Error ? err.message : '로테이션 변경 실패');
                              }
                            }}
                            className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="선발 순번 아래로"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                onUpdateCareer(togglePitcherRotationSpot(career, p.id));
                                setNotice(`${p.name} 투수를 불펜으로 전환했습니다.`);
                              } catch (err) {
                                setNotice(err instanceof Error ? err.message : '보직 전환 실패');
                              }
                            }}
                            className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[10px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="불펜으로 전환"
                          >
                            불펜↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                  <h3 className="text-sm font-bold">1군 불펜 투수진 ({bullpenPitchers.length}명 · 6보직 운용)</h3>
                  <span className="text-[11px] text-slate-500">보직 지정 · 등판/이닝/연투/피로도/최근등판일</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded max-h-80 overflow-y-auto">
                  {bullpenPitchers.map((p, bIdx) => {
                    const onNt = isPlayerOnNationalTeamDuty(p, career.gamesPlayed);
                    const ps = p.stats as PitcherStats;
                    const normRole = normalizeBullpenRole(p.pitchRole);
                    const restDays = getPitcherRestDays(p, currentDateIso, career.gamesPlayed);
                    const consecDays = p.consecutivePitchDays ?? 0;
                    const lastDateLabel = p.lastPitchedDate
                      ? `${p.lastPitchedDate.slice(5)} (${restDays}일 휴식)`
                      : '등판 대기';
                    const psIneligible = p.postseasonIneligibleSeason === career.season;
                    return (
                      <div
                        key={p.id}
                        className="w-full px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setSelectedPlayer(p)}
                            className="font-medium flex items-center gap-1.5 min-w-0 text-left whitespace-nowrap"
                          >
                            {p.uniformNumber !== undefined && (
                              <span className="font-mono-stats text-[11px] text-slate-400 shrink-0">
                                #{p.uniformNumber}
                              </span>
                            )}
                            <span className="truncate font-semibold">{p.name}</span>
                            <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                            <PlayerForeignFlag player={p} />
                            <PlayerCompactTag career={career} player={p} />
                            {!p.gameDayActive && (
                              <span className="text-[10px] text-slate-400 shrink-0">· 제외</span>
                            )}
                          </button>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono-stats text-slate-500 dark:text-slate-400">
                            <span>등판 {ps.G ?? 0}G</span>
                            <span>이닝 {formatIP(ps.outs)}</span>
                            {((ps.SV ?? 0) > 0 || (ps.HLD ?? 0) > 0 || (ps.BS ?? 0) > 0) && (
                              <span>
                                {(ps.SV ?? 0) > 0 ? `${ps.SV}S ` : ''}
                                {(ps.HLD ?? 0) > 0 ? `${ps.HLD}H ` : ''}
                                {(ps.BS ?? 0) > 0 ? `${ps.BS}BS` : ''}
                              </span>
                            )}
                            <span
                              className={
                                consecDays >= 3
                                  ? 'text-rose-600 dark:text-rose-400 font-bold'
                                  : consecDays === 2
                                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                  : ''
                              }
                            >
                              연투 {consecDays}일
                            </span>
                            <span
                              className={
                                p.fatigue >= 65
                                  ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                  : p.fatigue >= 40
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : ''
                              }
                            >
                              피로 {p.fatigue}%
                            </span>
                            <span>최근등판 {lastDateLabel}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono-stats text-slate-500 mr-0.5">
                            {p.ability}({p.form >= 0 ? `+${p.form}` : p.form})
                          </span>
                          <select
                            value={normRole}
                            onChange={(e) => {
                              try {
                                const nextRole = e.target.value as BullpenRoleType;
                                onUpdateCareer(setTeamBullpenPitcherRole(career, p.id, nextRole));
                                setNotice(`${p.name} 투수의 불펜 보직을 [${nextRole}]로 지정했습니다.`);
                              } catch (err) {
                                setNotice(err instanceof Error ? err.message : '불펜 보직 변경 실패');
                              }
                            }}
                            title="불펜 보직 변경 (마무리/셋업맨/필승조/중간계투/추격조/롱릴리프)"
                            className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[10px] font-semibold"
                          >
                            {ALL_BULLPEN_ROLES.map((roleOpt) => (
                              <option key={roleOpt} value={roleOpt}>
                                {roleOpt}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={bIdx === 0}
                            onClick={() => onUpdateCareer(reorderBullpen(career, bIdx, bIdx - 1))}
                            className="p-0.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                            title="불펜 등판 순위 위로"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={bIdx === bullpenPitchers.length - 1}
                            onClick={() => onUpdateCareer(reorderBullpen(career, bIdx, bIdx + 1))}
                            className="p-0.5 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                            title="불펜 등판 순위 아래로"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                onUpdateCareer(togglePitcherRotationSpot(career, p.id));
                                setNotice(`${p.name} 투수를 선발 로테이션에 합류시켰습니다.`);
                              } catch (err) {
                                setNotice(err instanceof Error ? err.message : '선발 전환 실패');
                              }
                            }}
                            className="px-1.5 py-0.5 rounded team-accent-outline text-[10px] font-semibold"
                            title="선발 로테이션 합류"
                          >
                            선발↑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Full Roster Management + 1군/2군 콜업·강등 */}
      {subTab === 'roster' && (
        <div className="space-y-3">
          {/* KBO Official Roster (68-man) & Developmental Rules Status Bar */}
          {(() => {
            const quota = getClubRosterQuotaSummary(career, teamId);
            return (
              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-stats">
                  <span className="font-bold text-slate-900 dark:text-white">
                    KBO 정식선수 정원{' '}
                    <strong className={quota.officialCount >= quota.officialLimit ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>
                      {quota.officialCount}/{quota.officialLimit}명
                    </strong>{' '}
                    <span className="text-slate-500 font-normal">
                      (1군 {quota.firstTeamCount} · 2군 {quota.secondTeamCount})
                    </span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-indigo-700 dark:text-indigo-300 font-semibold">
                    육성선수 {quota.developmentalCount}명 (코칭스태프 자동 정식계약 · 자동 방출 관리 · 1군 출전 불가)
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    고졸 육성 영입{' '}
                    <strong className={quota.hsDevSignedThisSeason >= quota.hsDevAnnualLimit ? 'text-rose-600' : ''}>
                      {quota.hsDevSignedThisSeason}/{quota.hsDevAnnualLimit}명
                    </strong>
                  </span>
                </div>
                <span
                  className={`text-[11px] font-bold font-mono-stats ${
                    quota.isConversionWindowOpen
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {quota.isConversionWindowOpen
                    ? `코치 자동 정식전환 가동 중 (5/1 이후 · ${quota.currentDateIso})`
                    : `정식 전환 5월 1일 개시 대기 · 코치 자동평가 (현재 ${quota.currentDateIso})`}
                </span>
              </div>
            );
          })()}

          {/* Roster Callup/Demotion Recommendations */}
          {recommendedMoves.length > 0 && (
            <div className="border team-accent-surface rounded-md p-3.5 space-y-2">
              <div className="text-xs font-bold flex items-center gap-1.5 team-accent-text">
                <Sparkles className="w-3.5 h-3.5" />
                <span>1군·2군 콜업 및 강등 추천</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {recommendedMoves.map((mv) => (
                  <div
                    key={`${mv.action}-${mv.player.id}`}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-1.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            mv.action === '콜업'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-700 text-white'
                          }`}
                        >
                          {mv.action} 추천
                        </span>
                        <span className="truncate">{mv.player.name}</span>
                        <FranchiseStarIcon active={isFranchiseStarPlayer(career, mv.player)} />
                        <PlayerForeignFlag player={mv.player} />
                        <span className="font-mono-stats text-slate-500">
                          {mv.player.ability}/{mv.player.potential}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {mv.reason}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        mv.action === '콜업'
                          ? handleCallUp(mv.player.id)
                          : handleDemote(mv.player.id)
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-bold shrink-0 ${
                        mv.action === '콜업'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {mv.action === '콜업' ? '1군 콜업 ↑' : '2군 강등 ↓'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* #9: Season-Start Coach Developmental Player Recruitment & Official Conversion Recommendations */}
          {(coachDevAdvice.recruitRecommendations.length > 0 ||
            coachDevAdvice.conversionRecommendations.length > 0) && (
            <div className="border border-indigo-500/40 bg-indigo-50/40 dark:bg-indigo-950/15 rounded-md p-3.5 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-extrabold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{career.season}시즌 코칭스태프 추천: 육성선수 영입 · 정식선수 전환</span>
                </div>
                <span className="text-[11px] text-slate-500">{coachDevAdvice.coachName}</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="font-bold text-indigo-700 dark:text-indigo-300">
                    신규 육성선수 영입 추천 ({coachDevAdvice.recruitRecommendations.length}명)
                  </div>
                  {coachDevAdvice.recruitRecommendations.length === 0 ? (
                    <div className="p-2.5 rounded border border-dashed border-slate-300 dark:border-slate-700 text-slate-500">
                      이번 시즌 추천 육성선수 영입을 모두 완료했습니다.
                    </div>
                  ) : (
                    coachDevAdvice.recruitRecommendations.map(({ candidate, reason }) => (
                      <div
                        key={candidate.id}
                        className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-bold flex items-center gap-1.5 flex-wrap">
                            <span>{candidate.name}</span>
                            <span className="text-slate-500 font-normal">
                              ({candidate.position} · {candidate.age}세)
                            </span>
                            <span className="font-mono-stats text-indigo-600 dark:text-indigo-400">
                              {candidate.ability}/{candidate.potential}
                            </span>
                            <span className="font-mono-stats text-[10px] text-orange-600 dark:text-orange-400">
                              {formatKrwBillionKorean(candidate.signingCostBillion)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{reason}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRecruitDevCandidate(candidate.id)}
                          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shrink-0"
                        >
                          육성 영입
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <div className="font-bold text-emerald-700 dark:text-emerald-400">
                    코칭스태프 육성 자동 판정 대기 ({coachDevAdvice.conversionRecommendations.length}명)
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    육성선수의 정식선수(2군) 계약 전환과 성장 정체 선수 방출은 코칭스태프가 경기 진행에 맞춰 자동으로 결정합니다.
                  </div>
                  {coachDevAdvice.conversionRecommendations.length === 0 ? (
                    <div className="p-2.5 rounded border border-dashed border-slate-300 dark:border-slate-700 text-slate-500">
                      현재 정식 전환 후보로 평가 중인 육성선수가 없습니다.
                    </div>
                  ) : (
                    coachDevAdvice.conversionRecommendations.map(({ player, reason }) => (
                      <div
                        key={player.id}
                        className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-bold flex items-center gap-1.5 flex-wrap">
                            <span>{player.name}</span>
                            <span className="text-slate-500 font-normal">
                              ({player.position} · {player.age}세)
                            </span>
                            <span className="font-mono-stats text-emerald-700 dark:text-emerald-400">
                              {player.ability}/{player.potential}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{reason}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] shrink-0">
                          코치 자동 전환 예정
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FA 자격 취득 이탈 선수 안내 */}
          {departedFaPlayers.length > 0 && (
            <div className="border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 rounded-md px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="text-amber-900 dark:text-amber-200">
                <strong>FA 자동 이탈 선수 ({departedFaPlayers.length}명):</strong>{' '}
                {departedFaPlayers.map((p) => `${p.name}(${p.position})`).join(', ')} 선수는 FA 자격 취득으로 선수단에서 자동 이탈했습니다.
              </div>
              <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                [계약 · FA · 트레이드 → FA] 탭에서 원소속 재계약 가능
              </span>
            </div>
          )}

          {/* 선수단 방출 추천 패널 */}
          {releaseRecommendations.length > 0 && (
            <div className="border border-rose-500/40 bg-rose-50/40 dark:bg-rose-950/15 rounded-md p-3.5 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>선수단 방출 추천 선수 ({releaseRecommendations.length}명)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    노쇠화·기량 저하·고연봉 대비 저효율·성장 정체 기준으로 프런트가 선별한 방출 검토 대상입니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReleaseAllRecommended}
                  className="px-3 py-1.5 rounded border border-rose-500/60 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white font-bold whitespace-nowrap"
                >
                  추천 선수 일괄 방출
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {releaseRecommendations.map((rec) => (
                  <div
                    key={rec.player.id}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedPlayer(rec.player)}
                          className="hover:text-orange-600 dark:hover:text-orange-400 hover:underline truncate"
                        >
                          {rec.player.name}
                        </button>
                        <span className="text-slate-500 font-normal">
                          ({rec.player.rosterTier} · {rec.player.position} · {rec.player.age}세)
                        </span>
                        <span className="font-mono-stats text-rose-600 dark:text-rose-400">
                          {rec.player.ability}/{rec.player.potential}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {rec.reason} · {rec.salaryReliefText}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReleaseRecommendedPlayer(rec.player.id)}
                      className="px-2.5 py-1 rounded border border-rose-500/50 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-bold text-[11px] shrink-0 whitespace-nowrap"
                    >
                      방출 처리
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 선수단 정리 예정 표시 (#12) 일괄 처리 바 */}
          {(() => {
            const markedPlayers = myPlayers.filter((p) => p.markedForOffseasonRelease);
            if (markedPlayers.length === 0) return null;
            return (
              <div className="border border-amber-500/45 bg-amber-50/50 dark:bg-amber-950/20 rounded-md p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-extrabold text-amber-800 dark:text-amber-300">
                    시즌 종료 후 정리 예정 지정 선수 ({markedPlayers.length}명)
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    {markedPlayers.map((mp) => `${mp.name}(${mp.position}·${mp.rosterTier})`).join(', ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      setNotice(null);
                      const res = executeMarkedOffseasonReleases(career);
                      if (res.releasedNames.length > 0) {
                        onUpdateCareer(res.nextCareer, career);
                        setNotice(
                          `정리 예정 지정 선수 ${res.releasedNames.length}명을 일괄 방출했습니다 (${res.releasedNames.join(', ')}).`
                        );
                      } else {
                        setNotice(res.error ?? '방출할 정리 예정 선수가 없습니다.');
                      }
                    } catch (err) {
                      setNotice(err instanceof Error ? err.message : '정리 예정 일괄 방출 오류');
                    }
                  }}
                  className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold whitespace-nowrap"
                >
                  정리 예정 선수 일괄 방출 ({markedPlayers.length}명)
                </button>
              </div>
            );
          })()}

          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', '1군', '2군', '육성', '대기'] as const).map((tf) => {
                  const count =
                    tf === 'ALL'
                      ? myPlayers.length
                      : myPlayers.filter((p) => p.rosterTier === tf).length;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTierFilter(tf)}
                      className={`px-3 py-1 text-xs font-semibold rounded border ${
                        tierFilter === tf
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {tf === 'ALL' ? `전체 (${count})` : `${tf} (${count})`}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyBatchTraining}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    추천 훈련 일괄 적용
                    {trainingPendingCount > 0 ? ` (${trainingPendingCount}명)` : ' (최적화됨)'}
                  </span>
                </button>
                <span className="text-[11px] text-slate-500 font-mono-stats">
                  1군 최대 30명 · 육성선수는 정식 전환 후 콜업
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 text-slate-500">
                  <tr className="whitespace-nowrap">
                    <th className="py-2 px-2 text-right w-12">등번호</th>
                    <th className="py-2 px-3">선수</th>
                    <th className="py-2 px-2">구분</th>
                    <th className="py-2 px-2">포지션</th>
                    <th className="py-2 px-2 text-right">나이</th>
                    <th className="py-2 px-2 text-right">능력/잠재</th>
                    <th className="py-2 px-2 text-right">컨디션</th>
                    <th className="py-2 px-2">훈련 (추천)</th>
                    <th className="py-2 px-2">소속</th>
                    <th className="py-2 px-3 text-right">엔트리 · 전환</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRoster.map((p) => {
                    const recTrain = computeRecommendedTrainingFocus(p);
                    return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-1.5 px-2 text-right font-mono-stats font-bold text-slate-500">
                        {p.uniformNumber !== undefined ? `#${p.uniformNumber}` : '—'}
                      </td>
                      <td className="py-1.5 px-3 font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedPlayer(p)}
                          className="hover:text-orange-600 dark:hover:text-orange-400 text-left inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span>{p.name}</span>
                          <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                          <PlayerForeignFlag player={p} />
                          <PlayerCompactTag career={career} player={p} />
                        </button>
                      </td>
                      <td className="py-1.5 px-2 text-slate-500">
                        <div className="flex items-center gap-1 flex-wrap">
                          <NationalityBadge
                            nationality={getNationalityDisplay(p.nationality ?? '한국').label}
                            size="xs"
                          />
                          {p.category !== '국내' && p.kboAdaptation !== undefined
                            ? `(${p.kboAdaptation}%)`
                            : `· ${formatMilitaryStatusLabel(resolveDisplayMilitaryStatus(p), p.category)}`}
                        </div>
                        {p.previousLeagueClub && (
                          <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-[165px]" title={p.previousLeagueClub}>
                            직전: {p.previousLeagueClub}
                          </div>
                        )}
                        {p.acquisitionInfo && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px]" title={p.acquisitionInfo.label}>
                            {p.acquisitionInfo.type === '육성선수' || p.rosterTier === '육성'
                              ? `육성선수 · ${p.acquisitionInfo.label}`
                              : p.acquisitionInfo.label}
                          </div>
                        )}
                        {p.contract.currency === 'KRW' && (() => {
                          const yoy = computeYoYSalaryChange(
                            p.contract.annualSalary,
                            p.previousAnnualSalary
                          );
                          return (
                            <div className="text-[10px] font-mono-stats text-slate-500">
                              연봉 {p.contract.annualSalary.toFixed(1)}억{' '}
                              <span
                                className={
                                  yoy.direction === 'up'
                                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                    : yoy.direction === 'down'
                                    ? 'text-rose-600 dark:text-rose-400 font-bold'
                                    : 'text-slate-400'
                                }
                              >
                                ({yoy.label})
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td
                        className="py-1.5 px-2 whitespace-nowrap font-mono-stats"
                        title={
                          p.role === '타자'
                            ? ALL_FIELD_POSITIONS.map((fp) => `${fp}:${getPositionProficiency(p, fp)}`).join(' · ')
                            : p.position
                        }
                      >
                        <span>{formatCompactPlayerPosition(p)}</span>
                        {p.positionTrainingTarget && (
                          <span className="ml-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                            [훈련:{p.positionTrainingTarget}]
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono-stats whitespace-nowrap">{p.age}세</td>
                      <td className="py-1.5 px-2 text-right font-mono-stats font-semibold whitespace-nowrap">
                        {p.ability}/{p.potential}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono-stats whitespace-nowrap">
                        {p.form >= 0 ? `+${p.form}` : p.form}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <select
                            value={p.trainingFocus ?? ''}
                            onChange={(e) =>
                              handleRosterAction(p.id, {
                                trainingFocus: (e.target.value || null) as TrainingFocus,
                              })
                            }
                            className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
                          >
                            {TRAINING_OPTIONS.map((opt) => (
                              <option key={opt ?? 'none'} value={opt ?? ''}>
                                {opt ?? '미배정'}
                              </option>
                            ))}
                          </select>
                          <span
                            title={recTrain.reason}
                            className={`text-[10px] font-semibold whitespace-nowrap ${
                              p.trainingFocus === recTrain.focus
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400'
                            }`}
                          >
                            추천:{recTrain.focus}
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <span
                          className={`text-[11px] font-semibold whitespace-nowrap ${
                            p.rosterTier === '1군'
                              ? 'text-orange-700 dark:text-orange-300'
                              : p.rosterTier === '육성'
                              ? 'text-indigo-700 dark:text-indigo-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {p.rosterTier}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          {p.rosterTier === '1군' ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRosterAction(p.id, { gameDayActive: !p.gameDayActive })
                                }
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${
                                  p.gameDayActive
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'border-slate-300 dark:border-slate-700 text-slate-500'
                                }`}
                              >
                                {p.gameDayActive ? '출장' : '제외'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDemote(p.id)}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                              >
                                2군 강등↓
                              </button>
                            </>
                          ) : p.rosterTier === '육성' ? (
                            (() => {
                              const audit = checkDevelopmentalConversionEligibility(career, p.id, teamId);
                              return (
                                <span
                                  title={
                                    audit.eligible
                                      ? `코칭스태프가 능력치·성장세를 평가해 정식선수 계약 또는 자동 방출을 결정합니다. (${audit.draftAuditNote})`
                                      : audit.reasons.join(' / ')
                                  }
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 border border-indigo-400/40 text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
                                >
                                  코치 자동 관리
                                </span>
                              );
                            })()
                          ) : isMilitaryServing(p.militaryStatus) ? (
                            <button
                              type="button"
                              disabled
                              title={`${p.militaryReturnSeason ? `${p.militaryReturnSeason}시즌 ` : ''}상무 전역 후 복귀 전까지 1군 콜업 불가`}
                              className="px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed whitespace-nowrap"
                            >
                              상무 복무중
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCallUp(p.id)}
                              className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
                            >
                              1군 콜업↑
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const { nextCareer, marked } = togglePlayerOffseasonReleaseMark(career, p.id);
                                onUpdateCareer(nextCareer);
                                setNotice(
                                  marked
                                    ? `${p.name} 선수를 시즌 종료 후 정리 예정 명단에 지정했습니다.`
                                    : `${p.name} 선수의 정리 예정 지정을 해제했습니다.`
                                );
                              } catch (err) {
                                setNotice(err instanceof Error ? err.message : '정리 예정 표시 오류');
                              }
                            }}
                            title="시즌 종료 후 방출 예정 선수로 미리 표시"
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              p.markedForOffseasonRelease
                                ? 'bg-rose-600 border-rose-600 text-white'
                                : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400'
                            }`}
                          >
                            {p.markedForOffseasonRelease ? '정리예정✓' : '정리표시'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Growth, Overseas Training & Training Report */}
      {subTab === 'growth' && (
        <div className="space-y-4">
          {/* Overseas Training Program Panel (#7) */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Plane className="w-4 h-4 team-accent-text" />
                  <span>부진·유망주 해외연수 파견 (미국 · 일본 · 호주/대만)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  슬럼프에 빠진 선수나 젊은 유망주를 해외 전문 캠프에 파견해 슬럼프 해소, 피로 초기화 및 능력치·잠재력 향상을 도모합니다.
                </p>
              </div>
              <span className="text-xs font-mono-stats text-slate-500">
                현재 연수중 {activeOverseas.length}명 · 수료 {completedOverseas.length}명
              </span>
            </div>

            {/* 3 Overseas Programs Legend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              {OVERSEAS_TRAINING_PROGRAMS.map((prog) => (
                <div
                  key={prog.id}
                  className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1"
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{prog.name}</span>
                    <span className="font-mono-stats team-accent-text">
                      {prog.costBillion}억 · {prog.durationRounds}G
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{prog.effectSummary}</div>
                </div>
              ))}
            </div>

            {/* Active / Completed Overseas Training Status */}
            {(activeOverseas.length > 0 || completedOverseas.length > 0) && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded text-xs">
                {activeOverseas.map((rec) => (
                  <div key={rec.id} className="px-3 py-2 flex items-center justify-between gap-2 team-accent-row">
                    <span className="font-bold">
                      {rec.playerName} · {rec.location} 연수 중
                    </span>
                    <span className="font-mono-stats team-accent-text">
                      {rec.returnRound}경기 시점 2군 복귀 예정
                    </span>
                  </div>
                ))}
                {completedOverseas.slice(0, 4).map((rec) => (
                  <div key={rec.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {rec.playerName} · {rec.location} 수료 완료
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono-stats">
                      {rec.resultSummary ?? '복귀 완료'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Recommended Candidates to Dispatch */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
                  <tr>
                    <th className="py-2 px-3">추천 대상 선수</th>
                    <th className="py-2 px-2">소속/포지션</th>
                    <th className="py-2 px-2 text-right">나이</th>
                    <th className="py-2 px-2 text-right">능력/잠재</th>
                    <th className="py-2 px-2 text-right">컨디션</th>
                    <th className="py-2 px-3 text-right">해외연수 파견</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overseasCandidates.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-bold whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedPlayer(p)}
                            className="hover:text-orange-600 dark:hover:text-orange-400 hover:underline text-left"
                          >
                            {p.name}
                          </button>
                          <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                          <PlayerForeignFlag player={p} />
                          {p.form <= -2 ? (
                            <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                              · 부진 교정
                            </span>
                          ) : p.age <= 24 ? (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              · 유망주 육성
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-slate-500">
                        {p.rosterTier} · {p.position}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-stats">{p.age}세</td>
                      <td className="py-2 px-2 text-right font-mono-stats font-semibold">
                        {p.ability}/{p.potential}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-stats">
                        <span className={p.form <= -1 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
                          {p.form >= 0 ? `+${p.form}` : p.form}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          {OVERSEAS_TRAINING_PROGRAMS.map((prog) => {
                            const shortLabel =
                              prog.id === 'US_DRIVELINE'
                                ? '미국(3.5억)'
                                : prog.id === 'JP_MIYAZAKI'
                                ? '일본(2.2억)'
                                : '호주(1.5억)';
                            const cantAfford =
                              career.finances.cashBalanceBillion !== null &&
                              career.finances.cashBalanceBillion < prog.costBillion;
                            return (
                              <button
                                key={prog.id}
                                type="button"
                                disabled={cantAfford}
                                onClick={() => handleDispatchOverseasTraining(p.id, prog.id)}
                                className="px-2 py-1 rounded team-accent-outline disabled:opacity-40 text-[11px] font-semibold"
                              >
                                {shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>10경기 단위 선수 성장 · 훈련 · 시설 반영 리포트</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                잠재력 여유분, 1군/2군 출전 기회, 전담 코치 능력치, 훈련 아카데미 Lv.{career.finances.investments?.academyLevel ?? 1} 및 집중 훈련 설정이 종합 반영됩니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApplyBatchTraining}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  선수단 추천 훈련 일괄 적용
                  {trainingPendingCount > 0 ? ` (${trainingPendingCount}명)` : ''}
                </span>
              </button>
              <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setGrowthScope('team')}
                  className={`px-3 py-1 font-semibold ${
                    growthScope === 'team' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : ''
                  }`}
                >
                  우리 구단
                </button>
                <button
                  type="button"
                  onClick={() => setGrowthScope('league')}
                  className={`px-3 py-1 font-semibold ${
                    growthScope === 'league' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : ''
                  }`}
                >
                  리그 전체
                </button>
              </div>
            </div>
          </div>

          {(() => {
            const logs = [...career.growthLogs]
              .filter((g) => (growthScope === 'team' ? g.teamId === teamId : true))
              .reverse();
            if (logs.length === 0) {
              return (
                <div className="p-4 text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded">
                  아직 10경기 평가 주기에 도달한 성장 변동 기록이 없습니다. 매 10경기마다 자동 평가가 실행됩니다.
                </div>
              );
            }
            return (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded max-h-[460px] overflow-y-auto text-xs">
                {logs.map((gr) => (
                  <div key={gr.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-bold">
                        <TeamLogo teamId={gr.teamId} size="xs" />
                        <span>{gr.playerName}</span>
                        <span
                          className={`font-mono-stats ${
                            gr.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {gr.prevAbility} → {gr.nextAbility} ({gr.delta > 0 ? `+${gr.delta}` : gr.delta})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        근거: {gr.reason}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono-stats text-slate-500 shrink-0 text-right">
                      <div>{gr.round}G 주기</div>
                      <div>{gr.sampleText}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
          </div>
        </div>
      )}

      {/* TAB 4: Injuries & Medical Rehab Clearance (#21) */}
      {subTab === 'injuries' && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span>구단 의료진 재활 현황 · 복귀 승인 센터</span>
            </div>
            <span className="text-[11px] text-slate-500">
              재활 60% 이상 시 조기 복귀 강행 가능 (재발·피로 위험) · 집중 재활로 안전 복귀 기간 단축 가능
            </span>
          </div>
          {injuredPlayers.length === 0 ? (
            <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
              현재 구단 내 부상·재활 중인 선수가 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {injuredPlayers.map((p) => {
                const inj = p.injury!;
                const progress = inj.rehabProgress ?? Math.min(100, Math.round(((inj.daysTotal - inj.daysRemaining) / Math.max(1, inj.daysTotal)) * 100));
                const canEarly = progress >= 60;
                return (
                  <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                        <span className="text-slate-500">({p.position} · 만 {p.age}세)</span>
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">{inj.severity}</span>
                        <span className="text-slate-600 dark:text-slate-300">— {inj.description}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono-stats text-[11px]">
                        <span>잔여 {inj.daysRemaining}일 / 총 {inj.daysTotal}일</span>
                        <span>·</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          재활 {progress}% ({inj.medicalClearance ?? '재활중'})
                        </span>
                      </div>
                      <div className="h-1.5 max-w-xs bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={!canEarly}
                        onClick={() => {
                          try {
                            const res = decideMedicalReturn(career, p.id, 'early');
                            onUpdateCareer(res.nextCareer, res.backupSnapshot);
                            setNotice(res.message);
                          } catch (err) {
                            setNotice(err instanceof Error ? err.message : '조기 복귀 오류');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded border border-amber-500/70 text-amber-700 dark:text-amber-300 hover:bg-amber-600 hover:text-white disabled:opacity-40 font-bold"
                      >
                        조기 복귀 강행
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const res = decideMedicalReturn(career, p.id, 'full');
                            onUpdateCareer(res.nextCareer, res.backupSnapshot);
                            setNotice(res.message);
                          } catch (err) {
                            setNotice(err instanceof Error ? err.message : '의료 승인 오류');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      >
                        {inj.daysRemaining <= 3 ? '완전 회복 승인' : '집중 재활 (-5일 · 1.2억)'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pro Baseball Player Profile Card Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden max-h-[90vh] flex flex-col">
            <div
              className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-white"
              style={{
                background: `linear-gradient(120deg, ${KBO_TEAMS[selectedPlayer.teamId].primaryColor} 0%, ${KBO_TEAMS[selectedPlayer.teamId].secondaryColor} 100%)`,
              }}
            >
              <div className="flex items-center gap-3">
                <TeamLogo teamId={selectedPlayer.teamId} size="md" />
                <div>
                  <div className="text-[11px] font-semibold opacity-90 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {KBO_TEAMS[selectedPlayer.teamId].name} ·{' '}
                      {selectedPlayer.uniformNumber !== undefined ? `No.${selectedPlayer.uniformNumber} · ` : ''}
                      {formatCompactPlayerPosition(selectedPlayer)} · {selectedPlayer.rosterTier}
                    </span>
                    <PlayerCategoryTag category={selectedPlayer.category} />
                    <NationalityBadge
                      nationality={getNationalityDisplay(selectedPlayer.nationality ?? '한국').label}
                      size="xs"
                      className="px-1.5 py-0.5 rounded bg-black/25 text-[10px] font-bold"
                    />
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-1.5 flex-wrap">
                    <span>{selectedPlayer.name}</span>
                    {(() => {
                      const fTier = evaluateFranchiseStar(career, selectedPlayer).tier;
                      if (fTier === '일반') return null;
                      return (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/25 text-amber-200">
                          {fTier === '레전드' || fTier === '핵심 프랜차이즈' ? `★ ${fTier}` : fTier}
                        </span>
                      );
                    })()}
                    {selectedPlayer.isOneClubMan && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/25 text-amber-100">
                        원클럽맨
                      </span>
                    )}
                    {teamState.leadership?.captainPlayerId === selectedPlayer.id && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/25 text-white">
                        주장
                      </span>
                    )}
                    {teamState.leadership?.actingCaptainPlayerId === selectedPlayer.id && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/25 text-sky-200">
                        임시주장
                      </span>
                    )}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="p-1.5 rounded bg-black/20 hover:bg-black/40 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-3 gap-3 p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono-stats">
                <div>
                  <div className="text-slate-500 font-sans">현재 능력 / 잠재력</div>
                  <div className="text-base font-extrabold mt-0.5">
                    {selectedPlayer.ability} / {selectedPlayer.potential}
                  </div>
                  <div className="mt-1.5 h-1.5 bg-slate-200 dark:bg-slate-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-orange-600"
                      style={{ width: `${Math.min(100, selectedPlayer.ability)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-sans">연 나이 · 연차 · 피로</div>
                  <div className="text-base font-extrabold mt-0.5">
                    {selectedPlayer.age}세 · {selectedPlayer.serviceYears}년
                  </div>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                    누적 피로도 {selectedPlayer.fatigue}%
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-sans">불만도 · 컨디션</div>
                  {(() => {
                    const disScore = getPlayerDissatisfaction(selectedPlayer);
                    const disLevel = getDissatisfactionLevel(disScore);
                    return (
                      <>
                        <div className="text-base font-extrabold mt-0.5">
                          <span
                            className={
                              disScore >= 80
                                ? 'text-rose-600 dark:text-rose-400'
                                : disScore >= 60
                                ? 'text-orange-600 dark:text-orange-400'
                                : disScore >= 40
                                ? 'text-amber-600 dark:text-amber-400'
                                : disScore >= 20
                                ? 'text-slate-700 dark:text-slate-200'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            {disScore} ({disLevel})
                          </span>{' '}
                          <span className="text-xs text-slate-500">
                            폼 {selectedPlayer.form >= 0 ? `+${selectedPlayer.form}` : selectedPlayer.form}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                          시즌 변화 {selectedPlayer.seasonRatingDelta >= 0 ? `+${selectedPlayer.seasonRatingDelta}` : selectedPlayer.seasonRatingDelta}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="font-bold">계약 · 병역 · 상태 정보</div>
                  <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 space-y-1">
                    <div>
                      {selectedPlayer.contract.status} ·{' '}
                      <span className="font-mono-stats font-bold text-slate-900 dark:text-white">
                        {selectedPlayer.contract.currency === 'KRW' && selectedPlayer.contract.totalValue > 0
                          ? formatKrwContractSummary({
                              years: selectedPlayer.contract.years,
                              totalBillion: selectedPlayer.contract.totalValue,
                              annualSalaryBillion: selectedPlayer.contract.annualSalary,
                              signingBonusBillion: selectedPlayer.contract.signingBonus,
                              startSeason: selectedPlayer.contract.startSeason ?? career.season,
                            })
                          : `${selectedPlayer.contract.startSeason ?? career.season}~${
                              selectedPlayer.contract.endSeason ??
                              (selectedPlayer.contract.startSeason ?? career.season) +
                                Math.max(0, selectedPlayer.contract.years - 1)
                            }시즌 (총 ${selectedPlayer.contract.years}년 / 잔여 ${selectedPlayer.contract.yearsRemaining}년)`}
                      </span>{' '}
                      · {selectedPlayer.contract.note ?? '세부 계약 정보 확인 중'}
                    </div>
                    {isPlayerOnNationalTeamDuty(selectedPlayer, career.gamesPlayed) && (
                      <div className="p-2 rounded bg-blue-500/15 border border-blue-500/40 text-blue-800 dark:text-blue-200 font-bold text-[11px] flex items-center gap-1.5">
                        <CountryFlag nationality="한국" size="xs" />
                        <span>
                          국가대표 소집 중 ({selectedPlayer.nationalTeamDuty?.tournamentName}) — 정규시즌 출장 불가 · R
                          {selectedPlayer.nationalTeamDuty?.endRound} 종료 후 자동 복귀
                        </span>
                      </div>
                    )}
                    {selectedPlayer.injury && (
                      <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold text-[11px]">
                        부상 중: {selectedPlayer.injury.description} ({selectedPlayer.injury.severity}) · 잔여 {selectedPlayer.injury.daysRemaining}일
                      </div>
                    )}
                    {(() => {
                      const rAlert = getPlayerRetirementAlert(selectedPlayer);
                      const eAlert = getPlayerContractExpiryAlert(career, selectedPlayer);
                      const showExpiry = eAlert && eAlert.kind !== '연봉 재계약 예정';
                      if (!rAlert && !showExpiry && !selectedPlayer.markedForOffseasonRelease) return null;
                      return (
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold pt-0.5">
                          {showExpiry && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                              {eAlert.kind === 'FA 자격 만료'
                                ? `FA ${eAlert.faGrade}등급 만료 예정`
                                : '외국인 계약 만료 예정'}
                            </span>
                          )}
                          {rAlert && (
                            <span
                              title={rAlert.reason}
                              className={`px-1.5 py-0.5 rounded border ${
                                rAlert.level === '은퇴 유력'
                                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {rAlert.level} ({rAlert.probabilityPct}%)
                            </span>
                          )}
                          {selectedPlayer.markedForOffseasonRelease && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              시즌 종료 정리예정
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    <div className="text-[11px] font-mono-stats text-slate-500 space-y-0.5">
                      <div>
                        입단·지명 정보:{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {selectedPlayer.acquisitionInfo?.label ??
                            (selectedPlayer.rosterTier === '육성'
                              ? '육성선수 등록'
                              : selectedPlayer.category !== '국내'
                              ? `${selectedPlayer.category} 영입 (${getNationalityDisplay(selectedPlayer.nationality).label})`
                              : '미확인')}
                        </strong>
                        {selectedPlayer.rosterTier === '육성' ? ' [현재 육성선수 신분]' : ''}
                      </div>
                      <div>
                        프로필:{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          생년월일 {selectedPlayer.birthDate ?? '미확인'} ·{' '}
                          {selectedPlayer.heightCm && selectedPlayer.weightKg
                            ? `${selectedPlayer.heightCm}cm/${selectedPlayer.weightKg}kg`
                            : '신체 미확인'}{' '}
                          · 투타 {formatThrowsBatsKorean(selectedPlayer.throws, selectedPlayer.bats)} · 출신교{' '}
                          {selectedPlayer.school ?? '미확인'}
                        </strong>
                      </div>
                      {selectedPlayer.previousLeagueClub && (
                        <div>
                          직전 소속 리그·구단:{' '}
                          <strong className="text-indigo-700 dark:text-indigo-300">
                            {selectedPlayer.previousLeagueClub}
                          </strong>
                        </div>
                      )}
                      <div className="flex items-center gap-1 flex-wrap">
                        <span>국적:</span>
                        <strong className="text-slate-800 dark:text-slate-200 inline-flex items-center">
                          <NationalityBadge
                            nationality={getNationalityDisplay(selectedPlayer.nationality ?? '한국').label}
                            size="xs"
                          />
                        </strong>{' '}
                        ·{' '}
                        {selectedPlayer.category === '국내'
                          ? `병역: ${formatMilitaryStatusLabel(
                              resolveDisplayMilitaryStatus(selectedPlayer),
                              selectedPlayer.category
                            )}${
                              isMilitaryServing(selectedPlayer.militaryStatus) &&
                              (selectedPlayer.militaryDischargeDate || selectedPlayer.militaryReturnSeason)
                                ? ` (${
                                    selectedPlayer.militaryDischargeDate
                                      ? `${selectedPlayer.militaryDischargeDate} 전역 예정`
                                      : `${selectedPlayer.militaryReturnSeason}시즌 R${selectedPlayer.militaryReturnRound ?? 62} 전역`
                                  })`
                                : selectedPlayer.militaryNote
                                ? ` (${selectedPlayer.militaryNote})`
                                : ''
                            }`
                          : `병역: 해당 없음 · KBO 적응도: ${selectedPlayer.kboAdaptation ?? 80}%`}
                        {selectedPlayer.overseasTrainingLocation
                          ? ` · 해외연수중(${selectedPlayer.overseasTrainingLocation}, ${selectedPlayer.overseasTrainingReturnRound}G 복귀)`
                          : ''}
                        {selectedPlayer.injuryHistoryCount
                          ? ` · 누적 부상 ${selectedPlayer.injuryHistoryCount}회`
                          : ''}
                        {selectedPlayer.rehabGamesLeft && selectedPlayer.rehabGamesLeft > 0
                          ? ` · 2군 재활 잔여 ${selectedPlayer.rehabGamesLeft}G`
                          : ''}
                        {selectedPlayer.tradeRequested ? ' · 이적 요청 중' : ''}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="font-bold">개별 집중 훈련</div>
                    <select
                      value={selectedPlayer.trainingFocus ?? ''}
                      onChange={(e) =>
                        handleRosterAction(selectedPlayer.id, {
                          trainingFocus: (e.target.value || null) as TrainingFocus,
                        })
                      }
                      className="w-full px-2.5 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold"
                    >
                      {TRAINING_OPTIONS.map((opt) => (
                        <option key={opt ?? 'none'} value={opt ?? ''}>
                          {opt ? `${opt} 집중 훈련` : '미배정'}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedPlayer.role === '타자' && (
                    <div className="space-y-1">
                      <div className="font-bold flex items-center justify-between">
                        <span>신규 수비 포지션 훈련</span>
                        <span className="text-[10px] font-normal text-slate-400">숙련도 60+ 시 보조 포지션 획득</span>
                      </div>
                      <select
                        value={selectedPlayer.positionTrainingTarget ?? ''}
                        onChange={(e) => {
                          const target = (e.target.value || null) as Position | null;
                          handleRosterAction(selectedPlayer.id, {
                            positionTrainingTarget: target,
                          });
                          setNotice(
                            target
                              ? `${selectedPlayer.name} 선수에게 [${target}] 신규 포지션 훈련을 배정했습니다.`
                              : `${selectedPlayer.name} 선수의 신규 포지션 훈련을 해제했습니다.`
                          );
                        }}
                        className="w-full px-2.5 py-1.5 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-950 font-semibold"
                      >
                        <option value="">훈련 안 함 (주 포지션 유지)</option>
                        {ALL_FIELD_POSITIONS.filter((fp) => fp !== selectedPlayer.position).map((fp) => {
                          const curProf = getPositionProficiency(selectedPlayer, fp);
                          return (
                            <option key={fp} value={fp}>
                              {fp} 포지션 훈련 (현재 숙련도 {curProf}/100)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="font-bold">등번호 배정 · 변경 (영구결번/중복 차단)</div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={selectedPlayer.rosterTier === '육성' ? 100 : 0}
                        max={selectedPlayer.rosterTier === '육성' ? 149 : 99}
                        placeholder={`현재 #${selectedPlayer.uniformNumber ?? '—'}`}
                        value={uniformDraft}
                        onChange={(e) => setUniformDraft(e.target.value)}
                        className="w-24 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const num = Number(uniformDraft);
                          if (!Number.isInteger(num)) return;
                          try {
                            const { nextCareer, backupSnapshot } = changePlayerUniformNumber(
                              career,
                              selectedPlayer.id,
                              num
                            );
                            onUpdateCareer(nextCareer, backupSnapshot);
                            setSelectedPlayer(nextCareer.players[selectedPlayer.id]);
                            setUniformDraft('');
                            setNotice(`${selectedPlayer.name} 등번호를 #${num}번으로 변경했습니다.`);
                          } catch (err) {
                            setNotice(err instanceof Error ? err.message : '등번호 변경 오류');
                          }
                        }}
                        className="px-3 py-1.5 rounded bg-slate-900 dark:bg-indigo-600 text-white font-bold"
                      >
                        등번호 변경
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {selectedPlayer.role === '타자' && (
                <div className="space-y-1.5">
                  <div className="font-bold flex items-center justify-between">
                    <span>포지션별 수비 숙련도 (0~100)</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      80+ 주전급 · 60~79 보조 적합 · 60 미만 수비 페널티
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 font-mono-stats">
                    {ALL_FIELD_POSITIONS.map((fp) => {
                      const eff = computeEffectiveFieldingAtPosition(selectedPlayer, fp);
                      const isPrim = selectedPlayer.position === fp;
                      const isSec = selectedPlayer.secondaryPositions?.includes(fp);
                      const isTrain = selectedPlayer.positionTrainingTarget === fp;
                      return (
                        <div
                          key={fp}
                          title={`${fp}: 숙련도 ${eff.proficiency}/100 (${eff.tierLabel}${eff.penalty > 0 ? ` · 수비 -${Math.round(eff.penalty)}` : ''})`}
                          className={`p-1.5 rounded border text-center ${
                            isPrim
                              ? 'border-orange-500/70 bg-orange-500/10'
                              : isSec
                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                : isTrain
                                  ? 'border-indigo-500/60 bg-indigo-500/10'
                                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                          }`}
                        >
                          <div className="text-[10px] font-bold">
                            {fp}
                            {isPrim ? '★' : ''}
                          </div>
                          <div
                            className={`text-xs font-extrabold ${
                              eff.proficiency >= 80
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : eff.proficiency >= 60
                                  ? 'text-sky-600 dark:text-sky-400'
                                  : eff.proficiency >= 45
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-400'
                            }`}
                          >
                            {eff.proficiency}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedPlayer.role === '타자' ? (
                <div className="space-y-1">
                  <div className="font-bold">시즌 타격 누적</div>
                  {(() => {
                    const b = selectedPlayer.stats as BatterStats;
                    const kt = selectedPlayer.ktSeriesBatting;
                    return (
                      <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 font-mono-stats space-y-1">
                        <div>
                          경기 {b.G ?? '미집계'} · 타석 {b.PA ?? '미집계'} · 홈런{' '}
                          {b.HR ?? `${b.confirmedMinHR ?? 0}+`} · 타점{' '}
                          {b.RBI ?? `${b.confirmedMinRBI ?? 0}+`}
                        </div>
                        {kt && (
                          <div className="team-accent-text">
                            KT 3연전 이후 완전집계: {kt.AB}타수 {kt.H}안타 · 타율{' '}
                            {formatRate3(calcAVG(kt.H, kt.AB))} · OPS {formatRate3(calcOPS(kt))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-bold">시즌 투구 누적</div>
                  {(() => {
                    const ps = selectedPlayer.stats as PitcherStats;
                    return (
                      <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 font-mono-stats">
                        {ps.G ?? 0}경기 · {formatIP(ps.outs)}이닝 · {ps.W ?? 0}승 {ps.L ?? 0}패{' '}
                        {ps.SV ?? 0}세이브 {ps.HLD ?? 0}홀드 · ERA{' '}
                        {formatRate2(calcERA(ps.ER, ps.outs))} · 탈삼진 {ps.SO ?? 0}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* KBO 통산 기록 (실시간 시즌 누적 자동 합산) */}
              {(() => {
                const liveCareer = getLiveCareerStats(selectedPlayer);
                if (selectedPlayer.role === '타자' && 'AB' in liveCareer) {
                  const cb = liveCareer;
                  const cAvg = cb.AB > 0 ? cb.H / cb.AB : 0;
                  const cObp = cb.AB + cb.BB > 0 ? (cb.H + cb.BB) / (cb.AB + cb.BB) : 0;
                  const cSlg = cb.AB > 0 ? (cb.H + cb.HR * 2.2) / cb.AB : 0;
                  return (
                    <div className="space-y-1">
                      <div className="font-bold flex items-center justify-between">
                        <span>KBO 통산 타격 기록 (실시간 반영)</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          경기 진행 시 자동 갱신
                        </span>
                      </div>
                      <div className="p-2.5 rounded border team-accent-surface font-mono-stats text-slate-800 dark:text-slate-200">
                        통산 {cb.G}경기 · 타율 {formatRate3(cAvg)} · {cb.H}안타 · {cb.HR}홈런 · {cb.RBI}타점 · {cb.R}득점 · {cb.SB}도루 · OPS {formatRate3(cObp + cSlg)}
                      </div>
                    </div>
                  );
                }
                if (selectedPlayer.role === '투수' && 'outs' in liveCareer) {
                  const cp = liveCareer;
                  const cEra = cp.outs > 0 ? (cp.ER * 27) / cp.outs : 0;
                  return (
                    <div className="space-y-1">
                      <div className="font-bold flex items-center justify-between">
                        <span>KBO 통산 투구 기록 (실시간 반영)</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          경기 진행 시 자동 갱신
                        </span>
                      </div>
                      <div className="p-2.5 rounded border team-accent-surface font-mono-stats text-slate-800 dark:text-slate-200">
                        통산 {cp.G}경기 · {formatIP(cp.outs)}이닝 · {cp.W}승 {cp.L}패 {cp.SV}세이브 {cp.HLD}홀드 · ERA {formatRate2(cEra)} · 탈삼진 {cp.SO}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {selectedPlayer.futuresStats && selectedPlayer.futuresStats.G > 0 && (
                <div className="space-y-1">
                  <div className="font-bold">2군 퓨처스리그 누적 기록</div>
                  <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 font-mono-stats text-slate-600 dark:text-slate-300">
                    {selectedPlayer.role === '타자'
                      ? `${selectedPlayer.futuresStats.G}G · 타율 ${formatRate3(
                          selectedPlayer.futuresStats.AB > 0
                            ? selectedPlayer.futuresStats.H / selectedPlayer.futuresStats.AB
                            : 0
                        )} (${selectedPlayer.futuresStats.H}/${selectedPlayer.futuresStats.AB}) · ${selectedPlayer.futuresStats.HR}HR · ${selectedPlayer.futuresStats.RBI}RBI`
                      : `${selectedPlayer.futuresStats.G}G · ${formatIP(selectedPlayer.futuresStats.outs)}이닝 · ${selectedPlayer.futuresStats.W}승 ${selectedPlayer.futuresStats.L}패 · ERA ${formatRate2(
                          calcERA(selectedPlayer.futuresStats.ER, selectedPlayer.futuresStats.outs)
                        )} · 탈삼진 ${selectedPlayer.futuresStats.SO}`}
                  </div>
                </div>
              )}

              {/* Player-specific Growth Logs */}
              {(() => {
                const pLogs = career.growthLogs.filter((g) => g.playerId === selectedPlayer.id);
                if (pLogs.length === 0) return null;
                return (
                  <div className="space-y-1">
                    <div className="font-bold">최근 성장 · 평가 내역</div>
                    <div className="space-y-1">
                      {pLogs.slice(-3).reverse().map((g) => (
                        <div
                          key={g.id}
                          className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                        >
                          <div className="font-mono-stats font-bold">
                            {g.round}G · {g.prevAbility}→{g.nextAbility} ({g.delta > 0 ? `+${g.delta}` : g.delta})
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{g.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Morale Meeting + Quick 1군/2군 Move */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 team-accent-text" />
                    <span>선수 면담 및 엔트리 이동</span>
                  </div>
                  {selectedPlayer.rosterTier === '1군' ? (
                    <button
                      type="button"
                      onClick={() => handleDemote(selectedPlayer.id)}
                      className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                    >
                      2군 강등(말소) ↓
                    </button>
                  ) : selectedPlayer.rosterTier === '육성' ? (
                    <span className="px-3 py-1 rounded bg-indigo-500/10 border border-indigo-400/40 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                      코치 자동 관리 (정식 전환·방출 자동)
                    </span>
                  ) : isMilitaryServing(selectedPlayer.militaryStatus) ? (
                    <button
                      type="button"
                      disabled
                      title={`${selectedPlayer.militaryReturnSeason ? `${selectedPlayer.militaryReturnSeason}시즌 ` : ''}상무 전역 후 원소속팀 복귀 시 1군 등록 가능`}
                      className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 font-semibold cursor-not-allowed"
                    >
                      상무 복무중 (1군 콜업 불가)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCallUp(selectedPlayer.id)}
                      className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      1군 콜업 ↑
                    </button>
                  )}
                </div>
                {(() => {
                  const disScore = getPlayerDissatisfaction(selectedPlayer);
                  const disLevel = getDissatisfactionLevel(disScore);
                  const gate = canHoldPlayerMeeting(career, selectedPlayer);
                  const resist = getReSignResistanceAssessment(career, selectedPlayer);
                  const causes = selectedPlayer.activeDissatisfactionCauses ?? [];
                  return (
                    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          불만도 {disScore}/100 ({disLevel})
                          {causes.length > 0 ? ` · 원인: ${causes.join(', ')}` : ' · 특이 불만 없음'}
                        </span>
                        {disScore >= 80 && (
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            재계약 거부 위험 {resist.refusalRiskPct}%
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={
                            disScore >= 80
                              ? 'h-full bg-rose-600'
                              : disScore >= 60
                              ? 'h-full bg-orange-500'
                              : disScore >= 40
                              ? 'h-full bg-amber-500'
                              : disScore >= 20
                              ? 'h-full bg-slate-400'
                              : 'h-full bg-emerald-500'
                          }
                          style={{ width: `${disScore}%` }}
                        />
                      </div>
                      {selectedPlayer.pendingMeetingFollowUp && (
                        <div className="text-[11px] text-indigo-700 dark:text-indigo-300">
                          면담 후속 검증 ({selectedPlayer.pendingMeetingFollowUp.action}):{' '}
                          {selectedPlayer.pendingMeetingFollowUp.resolved
                            ? selectedPlayer.pendingMeetingFollowUp.outcomeNote
                            : '실제 출전·계약·기용 조치 결과에 따라 불만이 반영됩니다.'}
                        </div>
                      )}
                      {!gate.allowed && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {gate.reason}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {GM_MEETING_ACTIONS.map((action) => (
                          <button
                            key={action}
                            type="button"
                            disabled={!gate.allowed}
                            onClick={() => handleMeeting(selectedPlayer.id, action)}
                            className={`px-3 py-1.5 rounded border text-xs font-semibold transition-colors ${
                              gate.allowed
                                ? 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white cursor-pointer'
                                : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        * 불만 40 이상 시 면담 가능 · 동일 선수 30일 쿨다운 · 트레이드 검토 시에도 자동 이적 없음 (단장 최종 승인 필수)
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
