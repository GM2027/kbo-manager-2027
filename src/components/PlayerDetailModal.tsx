import React, { useEffect } from 'react';
import {
  Activity,
  Award,
  Briefcase,
  CalendarDays,
  Globe2,
  Shield,
  TrendingUp,
  X,
} from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { getLiveCareerStats, getNationalityDisplay } from '../data/playerMetadata';
import {
  formatKrwContractSummary,
  isPlayerOnNationalTeamDuty,
} from '../engine/franchiseSystems';
import {
  buildBattingProfile,
  buildPitchRepertoire,
  buildPlayerAgent,
  computeFaQualification,
  computePlayerTradeValue,
} from '../engine/deepFranchise';
import {
  evaluateFranchiseStar,
  evaluatePlayerTradeValuationDetailed,
} from '../engine/franchiseStarEngine';
import {
  computeYoYSalaryChange,
  countDistinctMlbSeasons,
  getPlayerContractExpiryAlert,
  getPlayerRetirementAlert,
  isMlbHistoryEntry,
} from '../engine/leagueLifeEngine';
import {
  canHoldPlayerMeeting,
  getDissatisfactionLevel,
  getPlayerDissatisfaction,
  getReSignResistanceAssessment,
} from '../engine/dissatisfactionEngine';
import {
  calcAVG,
  calcERA,
  calcOBP,
  calcOPS,
  calcSLG,
  calcWHIP,
  formatIP,
  formatRate2,
  formatRate3,
} from '../engine/stats';
import {
  formatBirthDateDisplay,
  getCareerCurrentIsoDate,
  resolveAgeAtDate,
} from '../engine/ageEngine';
import {
  formatMilitaryStatusLabel,
  formatThrowsBatsKorean,
  getMilitaryBadgeToneClass,
  isMilitaryServing,
  resolveDisplayMilitaryStatus,
} from '../engine/militaryEngine';
import {
  formatCompactPlayerPosition,
} from '../engine/positionEngine';
import { BatterStats, CareerSave, PitcherStats, Player } from '../types/kbo';
import { CountryFlag, NationalityBadge } from './CountryFlag';
import { MlbTeamLogo } from './MlbTeamLogo';
import { OotpRatingsPanel } from './OotpRatingsPanel';
import { PlayerCategoryTag } from './PlayerCategoryTag';
import { FuturesTeamLogo, TeamLogo } from './TeamLogo';

interface PlayerDetailModalProps {
  career: CareerSave;
  playerId: string | null;
  onClose: () => void;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({
  career,
  playerId,
  onClose,
}) => {
  useEffect(() => {
    if (!playerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playerId, onClose]);

  if (!playerId) return null;
  const player: Player | undefined = career.players[playerId];
  if (!player) return null;

  const teamInfo = KBO_TEAMS[player.teamId];
  const teamState = career.teams[player.teamId];
  const lineupIdx = teamState?.lineupOrder.indexOf(player.id) ?? -1;
  const assignedPos =
    lineupIdx >= 0 ? teamState.lineupPositions[player.id] ?? player.position : player.position;
  const rotIdx = teamState?.rotationOrder.indexOf(player.id) ?? -1;
  const onNationalDuty = isPlayerOnNationalTeamDuty(player, career.gamesPlayed);
  const natDisplay = getNationalityDisplay(player.nationality ?? '한국');
  const retireAlert = getPlayerRetirementAlert(player);
  const expiryAlert = getPlayerContractExpiryAlert(career, player);
  const liveCareer = getLiveCareerStats(player);
  const tradeVal = computePlayerTradeValue(player);
  const faQual = computeFaQualification(career, player);
  const agent = player.agent ?? buildPlayerAgent(player);
  const pitchRep = player.role === '투수' ? (player.pitchRepertoire ?? buildPitchRepertoire(player)) : null;
  const batProf = player.role === '타자' ? (player.battingProfile ?? buildBattingProfile(player)) : null;

  const playerGrowthLogs = (career.growthLogs ?? [])
    .filter((g) => g.playerId === player.id)
    .slice(0, 6);

  const contractSummary =
    player.contract.currency === 'USD'
      ? `${player.contract.years}년 총액 $${player.contract.totalValue.toLocaleString()} (${
          player.contract.startSeason ?? career.season
        }~${player.contract.endSeason ?? career.season}시즌)`
      : formatKrwContractSummary({
          years: player.contract.years,
          totalBillion: player.contract.totalValue,
          annualSalaryBillion: player.contract.annualSalary,
          signingBonusBillion: player.contract.signingBonus,
          startSeason: player.contract.startSeason ?? career.season,
        });

  const militaryStatus = resolveDisplayMilitaryStatus(player);
  const militaryLabel = formatMilitaryStatusLabel(militaryStatus, player.category);
  const militaryBadgeTone = getMilitaryBadgeToneClass(militaryStatus);
  const isServingSangmu = isMilitaryServing(player.militaryStatus);
  const displayAge =
    player.rosterTier === '은퇴'
      ? player.age
      : resolveAgeAtDate(player, getCareerCurrentIsoDate(career));
  const birthDateDisplay = formatBirthDateDisplay(player.birthDate);

  const fs = player.futuresStats;
  const bStats = player.role === '타자' ? (player.stats as BatterStats) : null;
  const pStats = player.role === '투수' ? (player.stats as PitcherStats) : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <TeamLogo teamId={player.teamId} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {player.uniformNumber !== undefined && (
                  <span className="font-mono-stats text-sm font-extrabold text-orange-600 dark:text-orange-400">
                    #{player.uniformNumber}
                  </span>
                )}
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white truncate">
                  {player.name}
                </h2>
                <PlayerCategoryTag category={player.category} />
                <NationalityBadge
                  nationality={natDisplay.label}
                  size="sm"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800"
                />
                {retireAlert && (
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      retireAlert.level === '은퇴 유력'
                        ? 'bg-rose-600 text-white'
                        : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {retireAlert.level} ({retireAlert.probabilityPct}%)
                  </span>
                )}
                {expiryAlert && expiryAlert.kind !== '연봉 재계약 예정' && (
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      expiryAlert.kind === 'FA 자격 만료'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                        : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/40'
                    }`}
                  >
                    {expiryAlert.kind === 'FA 자격 만료'
                      ? `FA ${expiryAlert.faGrade} 만료 예정`
                      : '외국인 계약 만료 예정'}
                  </span>
                )}
                {player.rosterTier === '육성' && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                    육성선수
                  </span>
                )}
                {player.rosterTier === '은퇴' && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-600 text-white">
                    은퇴
                  </span>
                )}
                {player.releasedAfter2026 && player.rosterTier === 'FA' && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/40">
                    방출 (자유계약)
                  </span>
                )}
                {player.isOneClubMan && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                    원클럽맨
                  </span>
                )}
                {(() => {
                  const fTier = evaluateFranchiseStar(career, player).tier;
                  if (fTier === '일반') return null;
                  return (
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${
                        fTier === '레전드'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
                          : fTier === '핵심 프랜차이즈'
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {fTier === '레전드' || fTier === '핵심 프랜차이즈' ? `★ ${fTier}` : fTier}
                    </span>
                  );
                })()}
                {teamState?.leadership?.captainPlayerId === player.id && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-sky-600 text-white">
                    주장
                  </span>
                )}
                {teamState?.leadership?.actingCaptainPlayerId === player.id && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/40">
                    임시주장
                  </span>
                )}
                {player.rehabGamesLeft && player.rehabGamesLeft > 0 ? (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                    재활 진행 중 (잔여 {player.rehabGamesLeft}G)
                  </span>
                ) : null}
                {player.lastSeasonAwards && player.lastSeasonAwards.length > 0 && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                    {player.lastSeasonAwards.join(' · ')} 수상
                  </span>
                )}
                {onNationalDuty && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white">
                    <CountryFlag nationality="한국" size="xs" />
                    국대 소집중 (R{player.nationalTeamDuty?.endRound} 복귀)
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {player.releasedAfter2026 && player.rosterTier === 'FA'
                    ? `무소속 · 전 ${teamInfo?.shortName ?? player.teamId} (방출)`
                    : player.rosterTier === '은퇴'
                      ? `은퇴 · 최종 ${teamInfo?.name ?? player.teamId}`
                      : (teamInfo?.name ?? player.teamId)}
                </span>
                <span>·</span>
                <span>
                  {formatCompactPlayerPosition(player)}
                  {assignedPos !== player.position ? ` (현재 ${assignedPos} 출전)` : ''}
                  {lineupIdx >= 0 ? ` · ${lineupIdx + 1}번 타자` : ''}
                  {rotIdx >= 0 ? ` · ${rotIdx + 1}선발` : ''}
                </span>
                <span>·</span>
                <span className="font-mono-stats">
                  만 {displayAge}세{player.birthYear ? ` (${player.birthYear}년생)` : ''} · {player.rosterTier} ·{' '}
                  {player.serviceYears <= 0 ? '신인' : `연차 ${player.serviceYears}년`}
                </span>
                {player.kboOfficialId && (
                  <>
                    <span>·</span>
                    <span className="font-mono-stats text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                      KBO ID {player.kboOfficialId}
                    </span>
                  </>
                )}
                {player.permanentId && (
                  <>
                    <span>·</span>
                    <span className="font-mono-stats text-[11px] text-slate-500 dark:text-slate-400">
                      고유 ID {player.permanentId}
                    </span>
                  </>
                )}
              </div>

              {player.previousLeagueClub && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  <Globe2 className="w-3 h-3 shrink-0" />
                  <span>직전 소속: {player.previousLeagueClub}</span>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 shrink-0"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Top KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="text-[11px] text-slate-500">능력치 / 잠재력</div>
              <div className="text-base font-extrabold font-mono-stats text-orange-600 dark:text-orange-400 mt-0.5">
                {player.ability}{' '}
                <span className="text-xs font-semibold text-slate-500">/ {player.potential}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                성장잠재 +{Math.max(0, player.potential - player.ability)}
              </div>
            </div>

            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="text-[11px] text-slate-500">컨디션 · 피로 · 사기</div>
              <div className="text-base font-extrabold font-mono-stats mt-0.5">
                <span
                  className={
                    player.form >= 2
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : player.form <= -2
                      ? 'text-rose-600 dark:text-rose-400'
                      : ''
                  }
                >
                  {player.form >= 0 ? `+${player.form}` : player.form}
                </span>
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  피로 {player.fatigue}%
                </span>
              </div>
              {(() => {
                const disScore = getPlayerDissatisfaction(player);
                const disLevel = getDissatisfactionLevel(disScore);
                const disColor =
                  disScore >= 80
                    ? 'text-rose-600 dark:text-rose-400'
                    : disScore >= 60
                    ? 'text-orange-600 dark:text-orange-400'
                    : disScore >= 40
                    ? 'text-amber-600 dark:text-amber-400'
                    : disScore >= 20
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-emerald-600 dark:text-emerald-400';
                return (
                  <div className="text-[10px] mt-0.5 font-mono-stats flex flex-wrap items-center gap-1">
                    <span className={`font-bold ${disColor}`}>
                      불만도 {disScore}/100 ({disLevel})
                    </span>
                    {player.kboAdaptation !== undefined && (
                      <span className="text-slate-400">· 적응 {player.kboAdaptation}%</span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                <span>계약 · 입단 구분</span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
                {player.contract.status} ({player.contract.yearsRemaining}년 잔여)
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={player.acquisitionInfo?.label}>
                {player.acquisitionInfo?.label ?? '정식 지명'}
              </div>
            </div>

            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                <span>병역 · 상태</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${militaryBadgeTone}`}
                  title={player.militaryNote ?? militaryLabel}
                >
                  {militaryLabel}
                </span>
                {player.injury && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                    부상 ({player.injury.daysRemaining}일 남음)
                  </span>
                )}
                {player.rehabGamesLeft && player.rehabGamesLeft > 0 ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                    2군 재활 잔여 {player.rehabGamesLeft}G
                  </span>
                ) : null}
              </div>
              {player.militaryNote && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  {player.militaryNote}
                </div>
              )}
              {isServingSangmu && (player.militaryDischargeDate || player.militaryReturnSeason) && (
                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-mono-stats mt-0.5">
                  {player.militaryDischargeDate
                    ? `${player.militaryDischargeDate} 전역 예정`
                    : `${player.militaryReturnSeason}시즌 R${player.militaryReturnRound ?? 62} 전역`}
                </div>
              )}
            </div>
          </div>

          {/* OOTP 스타일 6탭 세부 능력치 패널 (타격 · 투구 · 수비 · 주루 · 성향 · 성장 기록) */}
          <OotpRatingsPanel
            career={career}
            player={player}
            batProf={batProf}
            pitchRep={pitchRep}
            playerGrowthLogs={playerGrowthLogs}
          />

          {/* 공식 확인 선수 기본 프로필 (생년월일 · 신장/체중 · 투타 · 출신학교 · 입단/드래프트 · 등번호) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 text-[11px]">
            <div>
              <span className="text-slate-400">생년월일: </span>
              <span className="font-mono-stats font-semibold text-slate-800 dark:text-slate-200">
                {birthDateDisplay}
              </span>
            </div>
            <div>
              <span className="text-slate-400">신장/체중: </span>
              <span className="font-mono-stats font-semibold text-slate-800 dark:text-slate-200">
                {player.heightCm && player.weightKg
                  ? `${player.heightCm}cm / ${player.weightKg}kg`
                  : '미확인'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">투타: </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatThrowsBatsKorean(player.throws, player.bats)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">출신학교: </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {player.school ?? '미확인'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">입단·지명: </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {player.acquisitionInfo?.label ?? (player.draftYear ? `${player.draftYear}년 입단` : '미확인')}
              </span>
            </div>
            <div>
              <span className="text-slate-400">등번호 · 구분: </span>
              <span className="font-mono-stats font-semibold text-slate-800 dark:text-slate-200">
                {player.uniformNumber !== undefined ? `#${player.uniformNumber}` : '미확인'}
                {' · '}
                {player.originType === 'virtual' ? '가상 생성' : '실존 선수'}
              </span>
            </div>
          </div>

          {/* 선수 불만도(0~100) · 원인 · 재계약/트레이드 연동 상태 */}
          {(() => {
            const disScore = getPlayerDissatisfaction(player);
            const disLevel = getDissatisfactionLevel(disScore);
            const causes = player.activeDissatisfactionCauses ?? [];
            const resist = getReSignResistanceAssessment(career, player);
            const gate = canHoldPlayerMeeting(career, player);
            const barColor =
              disScore >= 80
                ? 'bg-rose-600'
                : disScore >= 60
                ? 'bg-orange-500'
                : disScore >= 40
                ? 'bg-amber-500'
                : disScore >= 20
                ? 'bg-slate-400'
                : 'bg-emerald-500';
            return (
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    선수 불만도 평가 (주 1회 갱신)
                  </div>
                  <div className="font-mono-stats text-xs font-extrabold text-slate-900 dark:text-white">
                    {disScore} / 100 · {disLevel}
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${disScore}%` }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <span>
                    주요 원인:{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {causes.length > 0 ? causes.join(' · ') : '특이 불만 없음'}
                    </strong>
                  </span>
                  {player.lastMeetingDate && (
                    <span className="font-mono-stats">
                      최근 면담: {player.lastMeetingDate}
                      {!gate.allowed && gate.daysRemaining > 0
                        ? ` (재면담 ${gate.daysRemaining}일 남음)`
                        : ''}
                    </span>
                  )}
                </div>
                {player.pendingMeetingFollowUp && (
                  <div className="text-[11px] text-indigo-700 dark:text-indigo-300">
                    면담 조치 추적 ({player.pendingMeetingFollowUp.action}):{' '}
                    {player.pendingMeetingFollowUp.resolved
                      ? player.pendingMeetingFollowUp.outcomeNote
                      : '실제 출전·계약 조치 결과를 검증 중입니다.'}
                  </div>
                )}
                {(disScore >= 80 || player.tradeRequested) && (
                  <div className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold">
                    {player.tradeRequested ? '트레이드 요청 중(자동 이적 없음 · 단장 최종 승인 필요) · ' : ''}
                    재계약 거부 위험 {resist.refusalRiskPct}% ({resist.loyaltyNote})
                  </div>
                )}
              </div>
            );
          })()}

          {/* Contract, YoY Salary Change, Team History & Sangmu Detail Strip */}
          <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-200">계약 조건 · 연봉 인상률</span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono-stats font-semibold text-slate-900 dark:text-white">
                  {contractSummary}
                </span>
                {player.contract.currency === 'KRW' && (() => {
                  const yoy = computeYoYSalaryChange(
                    player.contract.annualSalary,
                    player.previousAnnualSalary
                  );
                  const yoyClass =
                    yoy.direction === 'up'
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                      : yoy.direction === 'down'
                      ? 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/30'
                      : 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
                  return (
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-mono-stats font-bold ${yoyClass}`}
                      title={
                        player.previousAnnualSalary
                          ? `전년도 연봉 ${player.previousAnnualSalary.toFixed(2)}억 원 대비`
                          : '신규/기준 연봉'
                      }
                    >
                      전년 대비 {yoy.label}
                    </span>
                  );
                })()}
              </div>
            </div>
            {player.careerTeamHistory && player.careerTeamHistory.length > 0 && (() => {
              const mlbSeasons = countDistinctMlbSeasons(player.careerTeamHistory);
              return (
                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      통산 소속팀
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {mlbSeasons > 0 && (
                        <span className="px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300 text-[10px] font-bold font-mono-stats">
                          MLB 통산 {mlbSeasons}시즌
                        </span>
                      )}
                      {player.isOneClubMan && (
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                          원클럽맨 ({player.clubTenureSeasons ?? 1}시즌)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {player.careerTeamHistory.map((h, idx) => {
                      const isMlb = isMlbHistoryEntry(h);
                      const seasonRange =
                        h.toSeason === undefined
                          ? `${h.fromSeason}~현재`
                          : h.toSeason === h.fromSeason
                          ? `${h.fromSeason}`
                          : `${h.fromSeason}~${h.toSeason}`;
                      const cleanLabel = isMlb
                        ? h.teamLabel
                            .replace(/\s*\(MLB\)\s*$/i, '')
                            .replace(/^MLB\s+/i, '')
                        : h.teamLabel || h.teamId || '미상';

                      const transferTag =
                        h.transferDate && h.moveType && h.moveType !== '입단'
                          ? `${h.transferDate} ${h.moveType}`
                          : h.moveType && h.moveType !== '입단'
                            ? h.moveType
                            : undefined;
                      const detailTitle = [
                        `${cleanLabel} (${seasonRange})`,
                        transferTag,
                        h.endDate ? `종료 ${h.endDate}` : undefined,
                        h.note,
                      ]
                        .filter(Boolean)
                        .join(' · ');

                      return (
                        <React.Fragment key={`${h.teamId ?? h.mlbTeamName ?? h.teamLabel}-${h.fromSeason}-${idx}`}>
                          {idx > 0 && <span className="text-slate-400 font-bold">→</span>}
                          {isMlb ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100"
                              title={`MLB · ${detailTitle}`}
                            >
                              <MlbTeamLogo teamName={h.mlbTeamName ?? cleanLabel} size="xs" />
                              <span className="text-[9px] font-black tracking-tight px-1 py-px rounded bg-sky-700 text-white leading-none">
                                MLB
                              </span>
                              <span className="font-bold">{cleanLabel}</span>
                              <span className="font-mono-stats text-sky-700 dark:text-sky-300">
                                ({seasonRange})
                              </span>
                            </span>
                          ) : h.teamId ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200"
                              title={detailTitle}
                            >
                              <TeamLogo teamId={h.teamId} size="xs" />
                              <span className="font-semibold">{cleanLabel}</span>
                              <span className="font-mono-stats text-slate-600 dark:text-slate-400">
                                ({seasonRange})
                              </span>
                              {transferTag && (
                                <span className="text-[9px] font-mono-stats text-indigo-600 dark:text-indigo-300">
                                  · {transferTag}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                              title={detailTitle}
                            >
                              <span className="text-[9px] font-extrabold px-1 py-px rounded bg-emerald-700 text-white leading-none">
                                {h.league ?? '해외'}
                              </span>
                              <span className="font-semibold">{cleanLabel}</span>
                              <span className="font-mono-stats text-emerald-700 dark:text-emerald-300">
                                ({seasonRange})
                              </span>
                            </span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {player.awardHonors && player.awardHonors.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-[11px]">
                <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <span>KBO 공식 수상 경력 ({player.awardHonors.length}회)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {player.awardHonors.map((h, idx) => (
                    <span
                      key={`${h.season}-${h.awardType}-${h.label}-${idx}`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${
                        h.awardType === 'MVP'
                          ? 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                          : h.awardType === '신인왕'
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                          : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300'
                      }`}
                      title={`${h.season} ${h.label} (${KBO_TEAMS[h.teamId].shortName}) · ${h.statSummary}`}
                    >
                      <span className="font-mono-stats">{h.season}</span>
                      <span>{h.label}</span>
                      {typeof h.normalizedScore === 'number' && (
                        <span className="font-mono-stats opacity-80">({h.normalizedScore.toFixed(1)}점)</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {player.uniformChangeNote && (
              <div className="text-[11px] text-sky-700 dark:text-sky-300 font-medium">
                등번호 변경 이력: {player.uniformChangeNote}
              </div>
            )}
            {player.lastSeasonAwards && player.lastSeasonAwards.length > 0 && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                개인 타이틀 수상 효과 ({player.lastSeasonAwards.join(', ')}):{' '}
                {player.lastSeasonAwards.includes('MVP')
                  ? '차기 연봉 요구 +22% · 구단 인기 상승'
                  : player.lastSeasonAwards.includes('신인왕')
                  ? '차기 연봉 요구 +20% · 프랜차이즈 잠재 보너스'
                  : '시장/트레이드 가치 +10% 상승'}
              </div>
            )}
            {player.contract.optionType && player.contract.optionType !== '없음' && (
              <div className="text-[11px] text-indigo-600 dark:text-indigo-400">
                옵션: {player.contract.optionType} (+1년 {player.contract.optionYearSalary ?? 0}억)
              </div>
            )}
            {player.contract.incentiveTarget && (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                인센티브: {player.contract.incentiveTarget} (+{player.contract.incentiveBonusBillion ?? 0}억)
              </div>
            )}
            {player.injury && (
              <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                부상 내역: {player.injury.description} ({player.injury.severity}) — 잔여 {player.injury.daysRemaining}일 · 재활 진행도{' '}
                {player.injury.rehabProgress ?? 0}% ({player.injury.medicalClearance ?? '재활중'})
              </div>
            )}
            {isServingSangmu && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800 text-[11px] text-blue-700 dark:text-blue-300">
                <FuturesTeamLogo teamId="상무" size="xs" />
                <span>
                  상무 피닉스 소속 퓨처스리그 복무 중 ({player.militaryEnlistDate ?? `${player.militaryEnlistedSeason ?? career.season}시즌`} 입대 →{' '}
                  {player.militaryDischargeDate ?? `${player.militaryReturnSeason}시즌 R${player.militaryReturnRound ?? 62}`} 원소속팀 {teamInfo?.shortName} 전역 복귀 예정)
                </span>
              </div>
            )}
            {/* v18/v19 통합 능력치 재평가 근거 · 변경 전/후 비교 · 세부 능력치 · 과거 성적 */}
            {player.v18Evaluation && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">
                    통합 능력치 평가 · 2024~2026 성적 반영
                  </span>
                  <span className="font-mono-stats text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
                    {player.rebalanceMeta ? `${player.rebalanceMeta.tier} · ` : ''}
                    POT 범위: {player.ability}~{player.potential}
                  </span>
                </div>
                {player.rebalanceMeta && (
                  <div className="px-2.5 py-1.5 rounded border border-emerald-500/30 bg-emerald-500/5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      재평가 비교: <strong className="font-mono-stats">OVR {player.rebalanceMeta.prevOvr} → {player.rebalanceMeta.newOvr}</strong>{' '}
                      <span className={player.rebalanceMeta.ovrDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'}>
                        ({player.rebalanceMeta.ovrDelta >= 0 ? `+${player.rebalanceMeta.ovrDelta}` : player.rebalanceMeta.ovrDelta})
                      </span>{' '}
                      · <strong className="font-mono-stats">POT {player.rebalanceMeta.prevPot} → {player.rebalanceMeta.newPot}</strong>{' '}
                      <span className={player.rebalanceMeta.potDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'}>
                        ({player.rebalanceMeta.potDelta >= 0 ? `+${player.rebalanceMeta.potDelta}` : player.rebalanceMeta.potDelta})
                      </span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">{player.rebalanceMeta.reason}</span>
                  </div>
                )}
                {player.v18Ratings && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {player.role === '타자' && player.v18Ratings.batting ? (
                      <>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">컨택 <strong className="font-mono-stats">{player.v18Ratings.batting.contact}</strong></div>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">파워 <strong className="font-mono-stats">{player.v18Ratings.batting.power}</strong></div>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">선구안 <strong className="font-mono-stats">{player.v18Ratings.batting.discipline}</strong></div>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">주력 <strong className="font-mono-stats">{player.v18Ratings.batting.speed}</strong></div>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">수비 <strong className="font-mono-stats">{player.v18Ratings.batting.fielding}</strong></div>
                      </>
                    ) : player.v18Ratings.pitching ? (
                      <>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">구위 <strong className="font-mono-stats">{player.v18Ratings.pitching.stuff}</strong></div>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">제구 <strong className="font-mono-stats">{player.v18Ratings.pitching.control}</strong></div>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">피홈런억제 <strong className="font-mono-stats">{player.v18Ratings.pitching.hr_prevention}</strong></div>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">실점억제 <strong className="font-mono-stats">{player.v18Ratings.pitching.run_prevention}</strong></div>
                        <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/70">체력 <strong className="font-mono-stats">{player.v18Ratings.pitching.stamina_proxy}</strong></div>
                      </>
                    ) : null}
                  </div>
                )}
                {player.historicalSeasons && player.historicalSeasons.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                      <span>
                        KBO 연도별 공식 성적 ({new Set(player.historicalSeasons.map((h) => h.season)).size}시즌 · {player.historicalSeasons.length}건 보존 · 2027 시즌은 0부터 시작)
                      </span>
                      {player.kboOfficialId && (
                        <span className="font-mono-stats text-blue-600 dark:text-blue-400">
                          KBO 공식 ID #{player.kboOfficialId}
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900">
                      <table className="w-full text-[10px] font-mono-stats text-right border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/90 sticky top-0 text-slate-500">
                          {player.role === '타자' ? (
                            <tr>
                              <th className="py-1 px-1.5 text-left">시즌</th>
                              <th className="py-1 px-1.5 text-left font-sans">구단</th>
                              <th className="py-1 px-1.5">G</th>
                              <th className="py-1 px-1.5">AB</th>
                              <th className="py-1 px-1.5">H</th>
                              <th className="py-1 px-1.5">HR</th>
                              <th className="py-1 px-1.5">RBI</th>
                              <th className="py-1 px-1.5">R</th>
                              <th className="py-1 px-1.5">SB</th>
                              <th className="py-1 px-1.5">AVG</th>
                              <th className="py-1 px-1.5">OPS</th>
                            </tr>
                          ) : (
                            <tr>
                              <th className="py-1 px-1.5 text-left">시즌</th>
                              <th className="py-1 px-1.5 text-left font-sans">구단</th>
                              <th className="py-1 px-1.5">G</th>
                              <th className="py-1 px-1.5">W</th>
                              <th className="py-1 px-1.5">L</th>
                              <th className="py-1 px-1.5">SV</th>
                              <th className="py-1 px-1.5">HLD</th>
                              <th className="py-1 px-1.5">IP</th>
                              <th className="py-1 px-1.5">SO</th>
                              <th className="py-1 px-1.5">ERA</th>
                              <th className="py-1 px-1.5">WHIP</th>
                            </tr>
                          )}
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {player.historicalSeasons.map((hs, idx) => (
                            <tr
                              key={`${hs.season}-${idx}`}
                              className={
                                hs.season === 2026
                                  ? 'bg-blue-50/60 dark:bg-blue-950/30 font-semibold'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                              }
                            >
                              <td className="py-1 px-1.5 text-left font-bold text-slate-800 dark:text-slate-200">
                                {hs.season}
                              </td>
                              <td
                                className="py-1 px-1.5 text-left font-sans text-slate-600 dark:text-slate-300 whitespace-nowrap"
                                title={hs.transferNote ?? undefined}
                              >
                                {(() => {
                                  if (hs.team) return hs.team;
                                  const matchedHist = (player.careerTeamHistory ?? []).find(
                                    (h) =>
                                      h.teamId &&
                                      h.fromSeason <= hs.season &&
                                      (h.toSeason === undefined || h.toSeason >= hs.season)
                                  );
                                  return matchedHist?.teamId
                                    ? KBO_TEAMS[matchedHist.teamId].shortName
                                    : '미확인';
                                })()}
                                {hs.transferNote && (
                                  <span
                                    className="ml-1 text-[9px] text-indigo-600 dark:text-indigo-400"
                                    title={hs.transferNote}
                                  >
                                    ⓘ
                                  </span>
                                )}
                              </td>
                              {player.role === '타자' ? (
                                <>
                                  <td className="py-1 px-1.5">{hs.G ?? '-'}</td>
                                  <td className="py-1 px-1.5">{hs.AB ?? '-'}</td>
                                  <td className="py-1 px-1.5">{hs.H ?? '-'}</td>
                                  <td className="py-1 px-1.5 text-orange-600 dark:text-orange-400">
                                    {hs.HR ?? '-'}
                                  </td>
                                  <td className="py-1 px-1.5">{hs.RBI ?? '-'}</td>
                                  <td className="py-1 px-1.5">{hs.R ?? '-'}</td>
                                  <td className="py-1 px-1.5">{hs.SB ?? '-'}</td>
                                  <td className="py-1 px-1.5 font-bold">
                                    {typeof hs.AVG === 'number' ? hs.AVG.toFixed(3) : '-'}
                                  </td>
                                  <td className="py-1 px-1.5">
                                    {typeof hs.OPS === 'number' ? hs.OPS.toFixed(3) : '-'}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-1 px-1.5">{hs.G ?? '-'}</td>
                                  <td className="py-1 px-1.5 text-orange-600 dark:text-orange-400">
                                    {hs.W ?? '-'}
                                  </td>
                                  <td className="py-1 px-1.5">{hs.L ?? '-'}</td>
                                  <td className="py-1 px-1.5">{hs.SV ?? '-'}</td>
                                  <td className="py-1 px-1.5">{hs.HLD ?? '-'}</td>
                                  <td className="py-1 px-1.5">{hs.IP ?? '-'}</td>
                                  <td className="py-1 px-1.5">{hs.SO ?? '-'}</td>
                                  <td className="py-1 px-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                                    {typeof hs.ERA === 'number' ? hs.ERA.toFixed(2) : '-'}
                                  </td>
                                  <td className="py-1 px-1.5">
                                    {typeof hs.WHIP === 'number' ? hs.WHIP.toFixed(2) : '-'}
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {player.verifiedFutures2026 && (
                  <div className="p-2 rounded border border-blue-500/30 bg-blue-500/5 text-[10px] space-y-0.5">
                    <div className="font-bold text-blue-700 dark:text-blue-300">
                      2026 퓨처스리그 공식 확인 성적 ({player.verifiedFutures2026.team ?? teamInfo?.shortName})
                    </div>
                    <div className="font-mono-stats text-slate-700 dark:text-slate-200">
                      {player.verifiedFutures2026.kind === 'pitching'
                        ? `${player.verifiedFutures2026.values.G ?? 0}G · ${player.verifiedFutures2026.values.W ?? 0}승 ${player.verifiedFutures2026.values.L ?? 0}패 · ERA ${(player.verifiedFutures2026.values.ERA ?? 0).toFixed(2)} · WHIP ${(player.verifiedFutures2026.values.WHIP ?? 0).toFixed(2)} · ${player.verifiedFutures2026.values.SO ?? 0}K`
                        : `${player.verifiedFutures2026.values.G ?? 0}G · AVG ${(player.verifiedFutures2026.values.AVG ?? 0).toFixed(3)} · ${player.verifiedFutures2026.values.H ?? 0}안타 · ${player.verifiedFutures2026.values.HR ?? 0}HR · OPS ${(player.verifiedFutures2026.values.OPS ?? 0).toFixed(3)}`}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Deep Scouting Profile: Pitch Repertoire / Batting Splits / Trait / Agent / Market Value / FA / Overuse */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-1.5">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>{pitchRep ? '구종 · 투구 패턴' : '타구 성향 · 좌우 스플릿'}</span>
                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                  특성: {player.hiddenTrait ?? '꾸준함'}
                </span>
              </div>
              {pitchRep ? (
                <>
                  <div className="font-mono-stats text-[11px] text-slate-700 dark:text-slate-300">
                    {pitchRep.throws} · 평균 {pitchRep.avgVelocityKmh}km/h (최고 {pitchRep.maxVelocityKmh}) · 제구 {pitchRep.command} · 변화구{' '}
                    {pitchRep.breakingSharpness}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono-stats">
                    {pitchRep.pitches.map((pt) => `${pt.name} ${pt.grade}(${pt.usagePct}%)`).join(' · ')}
                  </div>
                </>
              ) : batProf ? (
                <>
                  <div className="font-mono-stats text-[11px] text-slate-700 dark:text-slate-300">
                    {batProf.bats} · {batProf.sprayTendency} (당 {batProf.pullPct}% / 중 {batProf.centerPct}% / 밀 {batProf.oppoPct}%)
                  </div>
                  {batProf.avgExitVelocityKmh !== undefined && (
                    <div className="font-mono-stats text-[11px] text-orange-700 dark:text-orange-300 font-semibold">
                      타구속도 평균 {batProf.avgExitVelocityKmh}km/h (최고 {batProf.maxExitVelocityKmh}km/h) · 발사각 {batProf.launchAngleDeg}° · 배럴 {batProf.barrelPct}% · 강타 {batProf.hardHitPct}% · 주력 {batProf.sprintSpeedMs}m/s
                    </div>
                  )}
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono-stats">
                    좌투 {batProf.vsLeftEdge >= 0 ? `+${batProf.vsLeftEdge}` : batProf.vsLeftEdge} · 우투{' '}
                    {batProf.vsRightEdge >= 0 ? `+${batProf.vsRightEdge}` : batProf.vsRightEdge} · 득점권{' '}
                    {batProf.rispClutch >= 0 ? `+${batProf.rispClutch}` : batProf.rispClutch} · 변화구 {batProf.vsBreaking}
                  </div>
                </>
              ) : null}
              <div className="text-[11px] text-slate-500">
                혹사 관리:{' '}
                <strong
                  className={
                    player.overuse?.riskLevel === '위험'
                      ? 'text-rose-600'
                      : player.overuse?.riskLevel === '주의'
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }
                >
                  {player.overuse?.riskLevel ?? '정상'}
                </strong>
                {player.role === '투수'
                  ? ` (${player.overuse?.consecutivePitchDays ?? 0}연투 · 7일 ${player.overuse?.recent7dPitches ?? 0}구)`
                  : ` (연속선발 ${player.overuse?.consecutiveStarts ?? 0}G)`}
                {player.potentialTrend && player.potentialTrend !== '안정' ? ` · 잠재력 ${player.potentialTrend}` : ''}
              </div>
            </div>

            {(() => {
              const fran = evaluateFranchiseStar(career, player);
              const detailVal = evaluatePlayerTradeValuationDetailed(career, player);
              return (
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-1.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2">
                    <span>시장 가치 · 프랜차이즈 · FA</span>
                    <span className="font-mono-stats text-indigo-600 dark:text-indigo-400">
                      시장지수 {detailVal.skillMarketIndex} ({tradeVal.tierLabel})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-x-2">
                    <span>
                      프랜차이즈 등급:{' '}
                      <strong
                        className={
                          fran.tier === '레전드'
                            ? 'text-amber-600 dark:text-amber-400'
                            : fran.tier === '핵심 프랜차이즈'
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-700 dark:text-slate-200'
                        }
                      >
                        {fran.tier}
                      </strong>{' '}
                      <span className="font-mono-stats text-slate-500">
                        ({fran.score}점 · 소속 {fran.tenureSeasons}시즌
                        {fran.annualMerchBillion > 0 ? ` · 기념상품 연 ${fran.annualMerchBillion}억` : ''})
                      </span>
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    경쟁균형세 예외 선수: {fran.isSalaryCapException ? '지정됨 (50% 제외)' : '미지정'} · 프랜차이즈 등급과 별도 관리
                  </div>
                  {detailVal.homeClubSymbolicPremium > 0 && (
                    <div className="text-[11px] font-mono-stats text-amber-700 dark:text-amber-300">
                      원소속 상징성 프리미엄 +{detailVal.homeClubSymbolicPremium}pt
                      {detailVal.tradeRequestRelief > 0
                        ? ` (이적요청 완화 -${detailVal.tradeRequestRelief}pt)`
                        : ''}
                    </div>
                  )}
                  {detailVal.lowValueReasons.length > 0 && (
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 space-y-0.5">
                      {detailVal.lowValueReasons.slice(0, 3).map((r, idx) => (
                        <div key={idx}>· {r}</div>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-700 dark:text-slate-300">
                    에이전트: <strong>{agent.name}</strong> ({agent.agency} · {agent.persona})
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    FA 등록일수: <span className="font-mono-stats font-semibold">{faQual.registrationDays}일</span> ({faQual.creditedSeasons}/
                    {faQual.requiredSeasons}시즌)
                    {faQual.grade ? ` · FA ${faQual.grade}등급` : ''}
                    {(player.nationalTeamBonusDays ?? 0) > 0 && (
                      <span className="ml-1.5 font-mono-stats font-bold text-indigo-600 dark:text-indigo-400">
                        (국대 보상 +{player.nationalTeamBonusDays}일 포함)
                      </span>
                    )}
                  </div>
                  {player.nationalTeamBonusLog && player.nationalTeamBonusLog.length > 0 && (
                    <div className="text-[10px] font-mono-stats text-indigo-700 dark:text-indigo-300">
                      국대 보상 이력:{' '}
                      {player.nationalTeamBonusLog
                        .slice(-3)
                        .map((b) => `${b.tournamentName}(${b.resultTitle}) +${b.daysAwarded}일`)
                        .join(' · ')}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 truncate" title={faQual.compensationRule}>
                    {faQual.compensationRule}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Current Season Stats */}
          <div className="space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-orange-600" />
              <span>{career.season} 시즌 1군 성적</span>
            </div>
            {bStats ? (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                <table className="w-full text-center font-mono-stats text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500">
                    <tr>
                      <th className="py-1.5 px-2">G</th>
                      <th className="py-1.5 px-2">PA</th>
                      <th className="py-1.5 px-2">AB</th>
                      <th className="py-1.5 px-2">H</th>
                      <th className="py-1.5 px-2">HR</th>
                      <th className="py-1.5 px-2">RBI</th>
                      <th className="py-1.5 px-2">R</th>
                      <th className="py-1.5 px-2">BB</th>
                      <th className="py-1.5 px-2">SO</th>
                      <th className="py-1.5 px-2">SB</th>
                      <th className="py-1.5 px-2">AVG</th>
                      <th className="py-1.5 px-2">OBP</th>
                      <th className="py-1.5 px-2">SLG</th>
                      <th className="py-1.5 px-2">OPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-bold text-slate-900 dark:text-white">
                      <td className="py-2 px-2">{bStats.G}</td>
                      <td className="py-2 px-2">{bStats.PA}</td>
                      <td className="py-2 px-2">{bStats.AB}</td>
                      <td className="py-2 px-2">{bStats.H}</td>
                      <td className="py-2 px-2 text-orange-600 dark:text-orange-400">{bStats.HR}</td>
                      <td className="py-2 px-2">{bStats.RBI}</td>
                      <td className="py-2 px-2">{bStats.R}</td>
                      <td className="py-2 px-2">{bStats.BB}</td>
                      <td className="py-2 px-2">{bStats.SO}</td>
                      <td className="py-2 px-2">{bStats.SB}</td>
                      <td className="py-2 px-2">{formatRate3(calcAVG(bStats.H, bStats.AB))}</td>
                      <td className="py-2 px-2">
                        {formatRate3(calcOBP(bStats.H, bStats.BB, bStats.HBP, bStats.AB, bStats.SF))}
                      </td>
                      <td className="py-2 px-2">{formatRate3(calcSLG(bStats.TB, bStats.AB))}</td>
                      <td className="py-2 px-2 text-emerald-700 dark:text-emerald-400">
                        {formatRate3(calcOPS(bStats))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : pStats ? (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                <table className="w-full text-center font-mono-stats text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500">
                    <tr>
                      <th className="py-1.5 px-2">G</th>
                      <th className="py-1.5 px-2">GS</th>
                      <th className="py-1.5 px-2">W</th>
                      <th className="py-1.5 px-2">L</th>
                      <th className="py-1.5 px-2">SV</th>
                      <th className="py-1.5 px-2">HLD</th>
                      <th className="py-1.5 px-2">IP</th>
                      <th className="py-1.5 px-2">H</th>
                      <th className="py-1.5 px-2">BB</th>
                      <th className="py-1.5 px-2">SO</th>
                      <th className="py-1.5 px-2">ER</th>
                      <th className="py-1.5 px-2">ERA</th>
                      <th className="py-1.5 px-2">WHIP</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-bold text-slate-900 dark:text-white">
                      <td className="py-2 px-2">{pStats.G}</td>
                      <td className="py-2 px-2">{pStats.GS ?? 0}</td>
                      <td className="py-2 px-2 text-orange-600 dark:text-orange-400">{pStats.W}</td>
                      <td className="py-2 px-2">{pStats.L}</td>
                      <td className="py-2 px-2">{pStats.SV}</td>
                      <td className="py-2 px-2">{pStats.HLD}</td>
                      <td className="py-2 px-2">{formatIP(pStats.outs)}</td>
                      <td className="py-2 px-2">{pStats.H}</td>
                      <td className="py-2 px-2">{pStats.BB}</td>
                      <td className="py-2 px-2">{pStats.SO}</td>
                      <td className="py-2 px-2">{pStats.ER}</td>
                      <td className="py-2 px-2 text-emerald-700 dark:text-emerald-400">
                        {formatRate2(calcERA(pStats.ER, pStats.outs))}
                      </td>
                      <td className="py-2 px-2">
                        {formatRate2(calcWHIP(pStats.H, pStats.BB, pStats.outs))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {/* Live KBO Career Cumulative Stats */}
          <div className="space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>KBO 통산 누적 기록 (실시간 합산)</span>
            </div>
            {'AB' in liveCareer ? (
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 font-mono-stats flex flex-wrap gap-x-4 gap-y-1">
                <span>통산 {liveCareer.G.toLocaleString()}경기</span>
                <span>
                  타율{' '}
                  <strong className="text-orange-600 dark:text-orange-400">
                    {formatRate3(liveCareer.AB > 0 ? liveCareer.H / liveCareer.AB : 0)}
                  </strong>
                </span>
                <span>{liveCareer.H.toLocaleString()}안타</span>
                <span>
                  <strong className="text-slate-900 dark:text-white">{liveCareer.HR}홈런</strong>
                </span>
                <span>{liveCareer.RBI.toLocaleString()}타점</span>
                <span>{liveCareer.R.toLocaleString()}득점</span>
                <span>{liveCareer.SB}도루</span>
                <span>{liveCareer.BB.toLocaleString()}볼넷</span>
              </div>
            ) : (
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 font-mono-stats flex flex-wrap gap-x-4 gap-y-1">
                <span>통산 {liveCareer.G.toLocaleString()}경기</span>
                <span>
                  <strong className="text-orange-600 dark:text-orange-400">
                    {liveCareer.W}승 {liveCareer.L}패
                  </strong>
                </span>
                <span>{liveCareer.SV}세이브</span>
                <span>{liveCareer.HLD}홀드</span>
                <span>{formatIP(liveCareer.outs)}이닝</span>
                <span>
                  ERA{' '}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {formatRate2(liveCareer.outs > 0 ? (liveCareer.ER * 27) / liveCareer.outs : 0)}
                  </strong>
                </span>
                <span>{liveCareer.SO.toLocaleString()}탈삼진</span>
              </div>
            )}
          </div>

          {/* Futures / Sangmu Stats */}
          {fs && fs.G > 0 && (
            <div className="space-y-1.5">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {isServingSangmu
                    ? '상무 피닉스 퓨처스리그 성적'
                    : '2군 퓨처스리그 성적'}
                </span>
              </div>
              <div className="p-3 rounded border border-blue-500/30 bg-blue-500/5 font-mono-stats text-slate-800 dark:text-slate-200">
                {player.role === '타자'
                  ? `${fs.G}경기 · 타율 ${formatRate3(fs.AB > 0 ? fs.H / fs.AB : 0)} (${fs.H}안타/${fs.AB}타수) · ${fs.HR}홈런 · ${fs.RBI}타점`
                  : `${fs.G}경기 · ${fs.W}승 ${fs.L}패 · ${formatIP(fs.outs)}이닝 · ERA ${formatRate2(
                      fs.outs > 0 ? (fs.ER * 27) / fs.outs : 0
                    )} · ${fs.SO}탈삼진`}
              </div>
            </div>
          )}

          {/* Recent Growth Logs */}
          {playerGrowthLogs.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span>최근 성장 · 훈련 · 변화 로그</span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                {playerGrowthLogs.map((log) => (
                  <div key={log.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono-stats text-[10px] text-slate-400 mr-1.5">
                        {log.date}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">{log.reason}</span>
                    </div>
                    <span
                      className={`font-mono-stats font-bold shrink-0 ${
                        log.delta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      OVR {log.delta >= 0 ? `+${log.delta}` : log.delta} ({log.nextAbility})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
