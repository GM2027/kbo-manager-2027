import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  Plane,
  Save,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserMinus,
  Users,
} from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { isMilitaryServing } from '../engine/militaryEngine';
import {
  acceptGmJobOffer,
  acknowledgeRetirementCeremony,
  buildAnalyticsReport,
  computePlayerSalaryDemand,
  computeSalaryCapSummary,
  getOverseasReturneeContractTerms,
  negotiateDomesticSalary,
  playExhibitionGames,
  runSpringCamp,
  signOverseasReturnee,
  SPRING_CAMP_LOCATIONS,
} from '../engine/deepFranchise';
import {
  completeAndAdvanceOffseason8Step,
  executeMarkedOffseasonReleases,
  getContractExpiryAlerts,
  getOffseason8StepReadiness,
  getRetirementCandidateAlerts,
  OFFSEASON_8_STEPS,
} from '../engine/leagueLifeEngine';
import {
  ContractCapPreviewResult,
  formatManwonKorean,
  getAnnualKboCapManwon,
  getAnnualKboFloorManwon,
  previewContractSalaryCapImpact,
} from '../engine/salaryCapEngine';
import { calcAVG, calcERA, computeStandings, formatIP } from '../engine/stats';
import {
  approveAndStartNextSeasonFromOffseason,
  quoteForeignPlayerRenewal,
  releaseForeignPlayer,
  renewForeignPlayerContract,
  usdToKrwBillion,
} from '../engine/transactions';
import { BatterStats, CareerSave, OffseasonStep8, PitcherStats, SpringCampState } from '../types/kbo';
import { ContractApprovalModal } from './ContractApprovalModal';
import { CountryFlag, NationalityBadge } from './CountryFlag';
import { TeamLogo } from './TeamLogo';

interface OffseasonFlowPanelProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onNavigateTab: (tab: 'roster' | 'contracts' | 'draft' | 'finances' | 'analytics') => void;
  onSelectPlayer?: (playerId: string) => void;
}

export const OffseasonFlowPanel: React.FC<OffseasonFlowPanelProps> = ({
  career,
  onUpdateCareer,
  onNavigateTab,
  onSelectPlayer,
}) => {
  const currentStep: OffseasonStep8 = career.offseasonStep8 ?? 'SETTLEMENT';
  const completedSteps = new Set<OffseasonStep8>(career.completedOffseasonSteps8 ?? []);
  const currentMeta = OFFSEASON_8_STEPS.find((s) => s.id === currentStep) ?? OFFSEASON_8_STEPS[0];
  const readiness = useMemo(() => getOffseason8StepReadiness(career), [career]);

  const [campLocation, setCampLocation] = useState<NonNullable<SpringCampState['location']>>('일본 오키나와');
  const [campIntensity, setCampIntensity] = useState<SpringCampState['intensity']>('균형');
  const [selectedProspects, setSelectedProspects] = useState<string[]>([]);
  const [salaryOffers, setSalaryOffers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [autoSavedStamp, setAutoSavedStamp] = useState<string | null>(null);
  const [pendingContract, setPendingContract] = useState<{
    preview: ContractCapPreviewResult;
    confirmLabel?: string;
    execute: () => void;
  } | null>(null);

  const standings = useMemo(() => computeStandings(career.gamesLedger), [career.gamesLedger]);
  const myStanding = standings.find((s) => s.teamId === career.playerTeamId);
  const cap = useMemo(() => computeSalaryCapSummary(career, career.playerTeamId), [career]);
  const analytics = useMemo(() => buildAnalyticsReport(career, career.playerTeamId), [career]);

  const retirementAlerts = useMemo(
    () => getRetirementCandidateAlerts(career, career.playerTeamId),
    [career]
  );
  const expiryAlerts = useMemo(
    () => getContractExpiryAlerts(career, career.playerTeamId),
    [career]
  );
  const faExpiryAlerts = useMemo(
    () => expiryAlerts.filter((e) => e.kind === 'FA 자격 만료'),
    [expiryAlerts]
  );
  const foreignExpiryAlerts = useMemo(
    () => expiryAlerts.filter((e) => e.kind === '외국인 계약 만료'),
    [expiryAlerts]
  );

  const markedForRelease = useMemo(
    () =>
      Object.values(career.players)
        .filter(
          (p) =>
            p.teamId === career.playerTeamId &&
            p.markedForOffseasonRelease &&
            p.rosterTier !== '은퇴' &&
            p.rosterTier !== 'FA'
        )
        .sort((a, b) => a.ability - b.ability),
    [career.players, career.playerTeamId]
  );

  const topBatters = useMemo(
    () =>
      Object.values(career.players)
        .filter((p) => p.teamId === career.playerTeamId && p.role === '타자' && ((p.stats as BatterStats)?.PA ?? 0) > 0)
        .sort((a, b) => {
          const sa = a.stats as BatterStats;
          const sb = b.stats as BatterStats;
          return (sb.HR ?? 0) * 3 + (sb.H ?? 0) - ((sa.HR ?? 0) * 3 + (sa.H ?? 0));
        })
        .slice(0, 3),
    [career.players, career.playerTeamId]
  );

  const topPitchers = useMemo(
    () =>
      Object.values(career.players)
        .filter((p) => p.teamId === career.playerTeamId && p.role === '투수' && ((p.stats as PitcherStats)?.outs ?? 0) > 0)
        .sort((a, b) => {
          const sa = a.stats as PitcherStats;
          const sb = b.stats as PitcherStats;
          return (
            (sb.W ?? 0) * 4 + (sb.SV ?? 0) * 3 + (sb.outs ?? 0) / 30 -
            ((sa.W ?? 0) * 4 + (sa.SV ?? 0) * 3 + (sa.outs ?? 0) / 30)
          );
        })
        .slice(0, 3),
    [career.players, career.playerTeamId]
  );

  const myCoaches = career.coaches[career.playerTeamId] ?? [];

  const myNegotiationTargets = useMemo(
    () =>
      Object.values(career.players)
        .filter(
          (p) =>
            p.teamId === career.playerTeamId &&
            p.category === '국내' &&
            (p.rosterTier === '1군' || p.rosterTier === '2군') &&
            !isMilitaryServing(p.militaryStatus)
        )
        .sort((a, b) => {
          const aExp = a.contract.yearsRemaining <= 1 || a.contract.status === '만료' ? 1 : 0;
          const bExp = b.contract.yearsRemaining <= 1 || b.contract.status === '만료' ? 1 : 0;
          return bExp - aExp || b.ability - a.ability;
        })
        .slice(0, 12),
    [career.players, career.playerTeamId]
  );

  const myProspects = useMemo(
    () =>
      Object.values(career.players)
        .filter(
          (p) =>
            p.teamId === career.playerTeamId &&
            (p.rosterTier === '2군' || p.rosterTier === '육성') &&
            p.age <= 24
        )
        .sort((a, b) => b.potential - a.potential)
        .slice(0, 8),
    [career.players, career.playerTeamId]
  );

  const ceremonies = (career.retirementCeremonies ?? []).filter((c) => c.teamId === career.playerTeamId);
  const returnPool = (career.overseasReturnPool ?? []).filter((r) => !r.signed);

  const markAutoSaved = (msg?: string) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    setAutoSavedStamp(`자동 저장 완료 (${hh}:${mm}:${ss})`);
    if (msg) setFeedback(msg);
  };

  const goStep = (step: OffseasonStep8) => {
    const { nextCareer, backupSnapshot } = completeAndAdvanceOffseason8Step(career, step);
    onUpdateCareer(nextCareer, backupSnapshot);
    const meta = OFFSEASON_8_STEPS.find((s) => s.id === step);
    markAutoSaved(`${meta?.order ?? ''}. ${meta?.title ?? ''} 단계로 이동했습니다. (자동 저장됨)`);
  };

  const goNextStep = () => {
    const idx = OFFSEASON_8_STEPS.findIndex((s) => s.id === currentStep);
    if (idx >= 0 && idx < OFFSEASON_8_STEPS.length - 1) {
      goStep(OFFSEASON_8_STEPS[idx + 1].id);
    }
  };

  const handleBulkReleaseMarked = () => {
    const res = executeMarkedOffseasonReleases(career);
    if (res.error) {
      setFeedback(res.error);
      return;
    }
    onUpdateCareer(res.nextCareer, career);
    markAutoSaved(`정리 예정 선수 ${res.releasedNames.length}명 방출 처리 완료: ${res.releasedNames.join(', ')}`);
  };

  const handleRunCamp = () => {
    try {
      const { nextCareer, backupSnapshot } = runSpringCamp(career, campLocation, campIntensity, selectedProspects);
      onUpdateCareer(nextCareer, backupSnapshot);
      markAutoSaved(nextCareer.springCamp?.summaryNote ?? '스프링캠프를 완료했습니다.');
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : '스프링캠프 실행 오류');
    }
  };

  const handleExhibition = () => {
    const { nextCareer, backupSnapshot } = playExhibitionGames(career, 4);
    onUpdateCareer(nextCareer, backupSnapshot);
    markAutoSaved('시범경기 4경기를 완료했습니다. 공식 144경기 기록에는 합산되지 않습니다.');
  };

  const handleSalaryOffer = (playerId: string, fallbackDemand: number) => {
    const raw = salaryOffers[playerId];
    const amt = raw ? Number(raw) : fallbackDemand;
    if (!Number.isFinite(amt) || amt <= 0) return;
    const target = career.players[playerId];
    if (!target) return;
    const preview = previewContractSalaryCapImpact(career, {
      title: `${target.name} 차기 시즌 연봉 협상 승인 (연봉 ${amt.toFixed(2)}억 원)`,
      items: [
        {
          existingPlayerId: target.id,
          playerName: target.name,
          category: '국내',
          years: 1,
          annualSalaryBillion: amt,
          signingBonusBillion: 0,
          cashRequiredNowBillion: Math.max(0, Number((amt - target.contract.annualSalary).toFixed(2))),
        },
      ],
    });
    setPendingContract({
      preview,
      confirmLabel: '단장 승인 · 연봉 제안 확정',
      execute: () => {
        try {
          const res = negotiateDomesticSalary(career, playerId, amt);
          onUpdateCareer(res.nextCareer, res.backupSnapshot);
          markAutoSaved(res.message);
        } catch (e) {
          setFeedback(e instanceof Error ? e.message : '협상 오류');
        }
      },
    });
  };

  const handleOpenNextSeason = () => {
    if (!readiness.canApproveNextSeason) {
      setFeedback(`필수 점검 항목 미완료: ${readiness.blockingReasons.join(' / ')}`);
      return;
    }
    try {
      const { nextCareer, backupSnapshot } = approveAndStartNextSeasonFromOffseason(career);
      onUpdateCareer(nextCareer, backupSnapshot);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : '차기 시즌 개막 처리 오류');
    }
  };

  const nextSeasonNum = career.season + 1;
  const nextCapManwon = getAnnualKboCapManwon(nextSeasonNum);
  const nextFloorManwon = getAnnualKboFloorManwon(nextSeasonNum);

  return (
    <div className="bg-white dark:bg-slate-900 border team-accent-border rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold team-accent-text">
            <span>
              {career.season} 시즌 종료 후 오프시즌 8단계 ({currentMeta.order}/8)
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                currentMeta.isRequired
                  ? 'team-accent-badge'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {currentMeta.isRequired ? '필수 업무' : '선택 업무'}
            </span>
            <span className="font-mono-stats text-[11px] text-slate-500 dark:text-slate-400">
              필수 완료 {readiness.requiredCompletedCount}/{readiness.requiredTotalCount}
            </span>
            {autoSavedStamp && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Save className="w-3 h-3" />
                {autoSavedStamp}
              </span>
            )}
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
            {currentMeta.order}. {currentMeta.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{currentMeta.description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentStep !== 'NEXT_SEASON_START' ? (
            <button
              type="button"
              onClick={goNextStep}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg team-accent-btn text-xs font-bold cursor-pointer"
            >
              <span>이 단계 완료 · 다음 단계</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenNextSeason}
              disabled={!readiness.canApproveNextSeason}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>{nextSeasonNum}시즌 개막 최종 승인</span>
            </button>
          )}
        </div>
      </div>

      {/* 8-Step Horizontal Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
        {OFFSEASON_8_STEPS.map((st) => {
          const isActive = st.id === currentStep;
          const isDone = completedSteps.has(st.id);
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => goStep(st.id)}
              className={`text-left px-2.5 py-2 rounded-lg border text-[11px] transition-colors cursor-pointer ${
                isActive
                  ? 'team-accent-bg border-transparent font-bold shadow-xs'
                  : isDone
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/25 text-slate-800 dark:text-slate-200'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-stats text-[10px]">
                  {st.order}. {st.isRequired ? '' : '선택'}
                </span>
                {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
              </div>
              <div className="truncate mt-0.5 font-semibold">{st.shortTitle}</div>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="text-xs px-3.5 py-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200">
          {feedback}
        </div>
      )}

      {/* Step Body */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
        {/* 1. 시즌 결산 */}
        {currentStep === 'SETTLEMENT' && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">{career.season} 정규시즌 최종 순위</div>
                <div className="text-lg font-black font-mono-stats text-slate-900 dark:text-white mt-1">
                  {myStanding
                    ? `${myStanding.rank}위 · ${myStanding.wins}승 ${myStanding.losses}패 ${myStanding.draws}무`
                    : '집계 완료'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  한국시리즈 우승:{' '}
                  {career.postseason?.champion ? KBO_TEAMS[career.postseason.champion].name : '미확정'}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">시즌 재정 결산 (수익 · 지출)</div>
                <div className="text-lg font-black font-mono-stats text-slate-900 dark:text-white mt-1">
                  +{career.finances.seasonRevenueBillion.toFixed(1)}억 / -
                  {career.finances.seasonExpenseBillion.toFixed(1)}억
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  보유 현금: {(career.finances.cashBalanceBillion ?? 0).toFixed(1)}억 원
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">{career.season} 경쟁균형세 (샐러리캡)</div>
                <div className="text-lg font-black font-mono-stats text-slate-900 dark:text-white mt-1">
                  {cap.teamTop40PayrollBillion.toFixed(2)}억 / {formatManwonKorean(cap.capManwon)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {cap.overCapBillion > 0
                    ? `초과 +${cap.overCapBillion.toFixed(2)}억 · 제재금 ${cap.luxuryTaxBillion.toFixed(2)}억 (${cap.luxuryTaxRatePct}%)`
                    : cap.floorEnabled && cap.underFloorBillion > 0
                    ? `하한 미달 -${cap.underFloorBillion.toFixed(2)}억 · 제재금 ${cap.floorPenaltyBillion.toFixed(2)}억`
                    : '상·하한 기준 이내 건전 운영'}
                </div>
              </div>
            </div>

            {/* 주요 선수 성적 요약 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-800 dark:text-slate-200 mb-2">우리 구단 주요 타자 성적</div>
                {topBatters.length === 0 ? (
                  <p className="text-slate-500">집계된 타자 시즌 기록이 없습니다.</p>
                ) : (
                  <div className="space-y-1.5">
                    {topBatters.map((b) => {
                      const bs = b.stats as BatterStats;
                      const avg = calcAVG(bs.H, bs.AB);
                      return (
                        <div key={b.id} className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(b.id)}
                            className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white hover:text-indigo-600 cursor-pointer"
                          >
                            <CountryFlag nationality={b.nationality ?? '한국'} size="xs" />
                            <span>{b.name}</span>
                            <span className="text-[11px] font-normal text-slate-500">({b.position})</span>
                          </button>
                          <span className="font-mono-stats text-slate-600 dark:text-slate-300">
                            타율 {avg !== null ? avg.toFixed(3) : '-'} · {bs.HR ?? 0}홈런 ·{' '}
                            {bs.RBI ?? 0}타점
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-800 dark:text-slate-200 mb-2">우리 구단 주요 투수 성적</div>
                {topPitchers.length === 0 ? (
                  <p className="text-slate-500">집계된 투수 시즌 기록이 없습니다.</p>
                ) : (
                  <div className="space-y-1.5">
                    {topPitchers.map((pt) => {
                      const ps = pt.stats as PitcherStats;
                      const era = calcERA(ps.ER, ps.outs);
                      return (
                        <div key={pt.id} className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(pt.id)}
                            className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white hover:text-indigo-600 cursor-pointer"
                          >
                            <CountryFlag nationality={pt.nationality ?? '한국'} size="xs" />
                            <span>{pt.name}</span>
                            <span className="text-[11px] font-normal text-slate-500">({pt.position})</span>
                          </button>
                          <span className="font-mono-stats text-slate-600 dark:text-slate-300">
                            ERA {era !== null ? era.toFixed(2) : '-'} · {ps.W ?? 0}승{' '}
                            {ps.L ?? 0}패 {ps.SV ? `${ps.SV}세` : ''} ·{' '}
                            {formatIP(ps.outs ?? 0)}이닝
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. 구단주 평가 */}
        {currentStep === 'OWNER_EVAL' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">
                  구단주 단장 평가: {career.ownerEval?.lastSeasonGrade ?? 'B'}등급 · 신뢰도{' '}
                  {career.ownerEval?.ownerTrust ?? 68}/100 ·{' '}
                  <span className={career.ownerEval?.isFired ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}>
                    {career.ownerEval?.isFired ? '단장 경질 통보' : '단장 유임 확정'}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  {career.ownerEval?.evaluationComment ??
                    '시즌 최종 성적과 재정·육성 성과를 바탕으로 단장 유임 및 차기 시즌 목표가 확정되었습니다.'}
                </p>
                <div className="text-[11px] text-slate-500 mt-1.5">
                  현재 목표: <strong className="text-slate-800 dark:text-slate-200">{career.ownerEval?.targetRankLabel ?? '포스트시즌 진출'}</strong>
                </div>
              </div>
              <div className="text-right font-mono-stats shrink-0">
                <div className="text-slate-500">{nextSeasonNum}시즌 구단주 예산 한도</div>
                <div className="text-base font-black text-indigo-600 dark:text-indigo-400">
                  {(career.finances.ownerBudgetCapBillion ?? 135).toFixed(0)}억 원
                </div>
              </div>
            </div>

            {career.ownerEval?.isFired && (career.gmJobOffers ?? []).length > 0 && (
              <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-3">
                <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300">
                  <ShieldAlert className="w-4 h-4" />
                  <span>구단주 경질 통보 — 타 구단 신임 단장 이직 제안을 선택하세요</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(career.gmJobOffers ?? []).map((offer) => (
                    <div
                      key={offer.id}
                      className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <TeamLogo teamId={offer.teamId} size="sm" />
                          <span className="font-bold text-slate-900 dark:text-white">
                            {KBO_TEAMS[offer.teamId].name}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">{offer.pitchMessage}</p>
                        <div className="text-[11px] font-mono-stats text-slate-700 dark:text-slate-300 mt-2">
                          계약 {offer.contractYears}년 · 예산 {offer.budgetBillion}억 · 목표 {offer.targetRankLabel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const { nextCareer, backupSnapshot } = acceptGmJobOffer(career, offer.id);
                          onUpdateCareer(nextCareer, backupSnapshot);
                          markAutoSaved(`${KBO_TEAMS[offer.teamId].name} 신임 단장으로 취임했습니다!`);
                        }}
                        className="w-full py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                      >
                        단장직 수락 · 구단 이직
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. 감독·코치 인사 */}
        {currentStep === 'COACH_STAFF' && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div>
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>현재 등록 코칭스태프 {myCoaches.length}명</span>
                  {readiness.hasManager ? (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">감독 선임 완료</span>
                  ) : (
                    <span className="text-[11px] text-rose-600 font-bold">감독 공석 (필수 선임 필요)</span>
                  )}
                </div>
                <p className="text-slate-500 mt-1">
                  감독과 투수·타격·배터리·수비 코치의 유임, 경질, FA 코치 신규 영입을 결정합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('contracts')}
                className="px-3.5 py-2 rounded-lg team-accent-btn font-bold shrink-0 cursor-pointer"
              >
                감독·코치 인사 관리 열기
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {myCoaches.map((c) => {
                const isMgr = c.role === '감독';
                return (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg border team-accent-border bg-slate-50/70 dark:bg-slate-950/50 flex flex-col justify-between gap-1.5"
                    style={{ borderTopWidth: '3px', borderTopColor: 'var(--team-primary)' }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[11px] font-extrabold px-2 py-0.5 rounded ${
                          isMgr ? 'team-accent-bg' : 'team-accent-badge'
                        }`}
                      >
                        {c.role}
                      </span>
                      <span className="font-mono-stats text-[11px] font-bold team-accent-text">
                        역량 {c.ability}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <CountryFlag nationality={c.nationality ?? '한국'} size="xs" />
                      <span>{c.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      잔여 {c.contractYears}년 · 연봉 {c.annualSalaryBillion.toFixed(1)}억
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. 선수단 정리 (은퇴 예정 · 은퇴식 · 정리 예정 방출 · 보류선수) */}
        {currentStep === 'ROSTER_CLEANUP' && (
          <div className="space-y-4 text-xs">
            {/* 은퇴 예정 선수 자동 알림 */}
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>은퇴 예정 · 검토 선수 알림 ({retirementAlerts.length}명)</span>
                </div>
                <span className="text-[11px] text-slate-500">다음 시즌 전환 시 자동 은퇴 심사 대상</span>
              </div>
              {retirementAlerts.length === 0 ? (
                <p className="text-slate-500">현재 은퇴 가능성이 높은 베테랑 선수가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {retirementAlerts.map((item) => (
                    <div
                      key={item.player.id}
                      className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer?.(item.player.id)}
                          className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white hover:text-indigo-600 cursor-pointer"
                        >
                          <CountryFlag nationality={item.player.nationality ?? '한국'} size="xs" />
                          <span>{item.player.name}</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            ({item.player.position} · {item.player.age}세 · OVR {item.player.ability})
                          </span>
                        </button>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">{item.reason}</div>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded font-bold text-[10px] ${
                          item.level === '은퇴 유력'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {item.level} {item.probabilityPct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 정리 예정 방출 대상 */}
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <UserMinus className="w-4 h-4 text-rose-500" />
                  <span>정리 예정 지정 선수 ({markedForRelease.length}명)</span>
                </div>
                <div className="flex items-center gap-2">
                  {markedForRelease.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBulkReleaseMarked}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                    >
                      정리 예정 {markedForRelease.length}명 일괄 방출
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigateTab('roster')}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                  >
                    보류선수·방출 관리 이동
                  </button>
                </div>
              </div>
              {markedForRelease.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {markedForRelease.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px]"
                    >
                      <CountryFlag nationality={p.nationality ?? '한국'} size="xs" />
                      {p.name} ({p.position} · {p.age}세)
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500">미리 지정된 방출 예정 선수가 없습니다. 필요 시 선수단 관리에서 지정할 수 있습니다.</p>
              )}
            </div>

            {/* 프랜차이즈 스타 은퇴식 */}
            {ceremonies.length > 0 && (
              <div className="space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-500" />
                  <span>프랜차이즈 스타 공식 은퇴식 ({ceremonies.length}명)</span>
                </div>
                {ceremonies.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{c.ceremonyHeadline}</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{c.careerSummary}</div>
                    </div>
                    {c.acknowledged ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                        은퇴식 완료 {c.numberRetired ? `(영구결번 #${c.uniformNumber})` : ''}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const { nextCareer, backupSnapshot } = acknowledgeRetirementCeremony(career, c.id, true);
                            onUpdateCareer(nextCareer, backupSnapshot);
                            markAutoSaved(`${c.playerName} 은퇴식 및 #${c.uniformNumber} 영구결번 지정을 완료했습니다.`);
                          }}
                          className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                        >
                          은퇴식 + 영구결번
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const { nextCareer, backupSnapshot } = acknowledgeRetirementCeremony(career, c.id, false);
                            onUpdateCareer(nextCareer, backupSnapshot);
                            markAutoSaved(`${c.playerName} 공식 은퇴식을 거행했습니다.`);
                          }}
                          className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                        >
                          은퇴식만 진행
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. 선수 계약 (FA 만료 · 외국인 계약 · 연봉 협상) */}
        {currentStep === 'PLAYER_CONTRACTS' && (
          <div className="space-y-4 text-xs">
            {/* FA & 외국인 계약 만료 알림 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50/40 dark:bg-rose-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>FA 계약 만료 예정 ({faExpiryAlerts.length}명)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('contracts')}
                    className="text-indigo-600 dark:text-indigo-400 font-bold cursor-pointer"
                  >
                    FA 협상 열기 →
                  </button>
                </div>
                {faExpiryAlerts.length === 0 ? (
                  <p className="text-slate-500">이번 오프시즌 FA 자격 만료 예정 선수가 없습니다.</p>
                ) : (
                  <div className="space-y-1.5">
                    {faExpiryAlerts.slice(0, 5).map((item) => (
                      <div key={item.player.id} className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer?.(item.player.id)}
                          className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white hover:text-indigo-600 cursor-pointer"
                        >
                          <CountryFlag nationality={item.player.nationality ?? '한국'} size="xs" />
                          <span>{item.player.name}</span>
                          <span className="text-[10px] font-semibold text-rose-600">FA {item.faGrade}등급</span>
                        </button>
                        <span className="font-mono-stats text-slate-600 dark:text-slate-300">
                          {item.annualSalaryLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-lg border border-sky-200 dark:border-sky-800/60 bg-sky-50/40 dark:bg-sky-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>외국인·아시아쿼터 재계약 / 계약 해지 ({foreignExpiryAlerts.length}명)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('contracts')}
                    className="text-indigo-600 dark:text-indigo-400 font-bold cursor-pointer"
                  >
                    외국인 시장 열기 →
                  </button>
                </div>
                {(() => {
                  const myMlbExports = (career.mlbExports ?? []).filter(
                    (e) =>
                      e.exportRoute === '외국인역수출' &&
                      e.fromKboTeamId === career.playerTeamId &&
                      e.seasonExported >= career.season
                  );
                  if (myMlbExports.length === 0) return null;
                  return (
                    <div className="p-2 rounded bg-indigo-100/70 dark:bg-indigo-950/50 border border-indigo-300/70 dark:border-indigo-700 text-[11px] text-indigo-800 dark:text-indigo-200 font-semibold">
                      MLB 자동 진출 이탈:{' '}
                      {myMlbExports.map((e) => `${e.playerName} → ${e.mlbTeam} (${e.contractYears}년 $${e.guaranteedUsdMillions}M)`).join(', ')}
                    </div>
                  );
                })()}
                {foreignExpiryAlerts.length === 0 ? (
                  <p className="text-slate-500">만료 예정 외국인·아시아쿼터 선수가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {foreignExpiryAlerts.map((item) => {
                      const fp = item.player;
                      const quote = quoteForeignPlayerRenewal(career, fp);
                      const ev = quote.evaluation;
                      return (
                        <div
                          key={fp.id}
                          className="p-2 rounded bg-white/80 dark:bg-slate-900/70 border border-sky-200/70 dark:border-slate-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectPlayer?.(fp.id)}
                              className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white hover:text-indigo-600 cursor-pointer"
                            >
                              <NationalityBadge nationality={fp.nationality ?? '미국'} size="xs" showLabel={false} />
                              <span>{fp.name}</span>
                              <span className="text-[10px] text-slate-500">
                                ({fp.position} · OVR {fp.ability})
                              </span>
                            </button>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                quote.alreadyRenewedForTarget
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : ev.tier === '부진_교체검토'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                              }`}
                            >
                              {quote.alreadyRenewedForTarget
                                ? `${quote.targetSeason} 재계약 완료`
                                : ev.tier === '부진_교체검토'
                                ? '부진 · 해지/할인유지'
                                : '재계약 추천'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono-stats">
                            {ev.statSummary} · 제안 ${(quote.suggestedTotalUsd / 1_000_000).toFixed(2)}M ({quote.adjustmentLabel})
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={quote.alreadyRenewedForTarget}
                              onClick={() => {
                                const preview = previewContractSalaryCapImpact(career, {
                                  title: `${fp.name} ${quote.targetSeason}시즌 계약 유지(재계약) 승인`,
                                  items: [
                                    {
                                      playerName: fp.name,
                                      category: fp.category === '아시아쿼터' ? '아시아쿼터' : '외국인',
                                      years: 1,
                                      annualSalaryBillion: usdToKrwBillion(quote.suggestedSalaryUsd),
                                      signingBonusBillion: quote.upfrontKrwBillion,
                                      cashRequiredNowBillion: quote.upfrontKrwBillion,
                                      isNewIncomingPlayer: false,
                                    },
                                  ],
                                });
                                setPendingContract({
                                  preview,
                                  confirmLabel: '단장 승인 · 계약 유지(재계약) 확정',
                                  execute: () => {
                                    try {
                                      const { nextCareer, backupSnapshot } = renewForeignPlayerContract(career, fp.id);
                                      onUpdateCareer(nextCareer, backupSnapshot);
                                      markAutoSaved(`${fp.name} ${quote.targetSeason}시즌 계약 유지(재계약)를 확정했습니다.`);
                                    } catch (e) {
                                      setFeedback(e instanceof Error ? e.message : '외국인 재계약 오류');
                                    }
                                  },
                                });
                              }}
                              className={`flex-1 py-1 rounded text-[11px] font-bold ${
                                quote.alreadyRenewedForTarget
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 cursor-default'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                              }`}
                            >
                              {quote.alreadyRenewedForTarget
                                ? '계약 유지 완료'
                                : `계약 유지 ($${(quote.suggestedTotalUsd / 1_000_000).toFixed(2)}M)`}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  const { nextCareer, backupSnapshot } = releaseForeignPlayer(career, fp.id);
                                  onUpdateCareer(nextCareer, backupSnapshot);
                                  markAutoSaved(`${fp.name} 계약을 해지했습니다 (오프시즌 데드머니 0억).`);
                                } catch (e) {
                                  setFeedback(e instanceof Error ? e.message : '외국인 계약 해지 오류');
                                }
                              }}
                              className="px-2.5 py-1 rounded border border-rose-400/60 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-[11px] font-bold cursor-pointer"
                            >
                              계약 해지
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 국내 선수 연봉 협상 테이블 */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-900 dark:text-white">
                  국내 선수 연봉 협상 (샐러리캡 {cap.teamTop40PayrollBillion.toFixed(2)}억 /{' '}
                  {formatManwonKorean(cap.capManwon)})
                </span>
              </div>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="text-left py-2 px-3">선수</th>
                      <th className="text-right py-2 px-2">기존 연봉</th>
                      <th className="text-right py-2 px-2">요구 연봉</th>
                      <th className="text-left py-2 px-3">에이전트</th>
                      <th className="text-right py-2 px-3">제시액(억) · 체결</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {myNegotiationTargets.map((p) => {
                      const demand = p.demandedSalaryBillion ?? computePlayerSalaryDemand(p);
                      const done = p.salaryNegotiationStatus === '협상완료';
                      return (
                        <tr key={p.id}>
                          <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">
                            <span className="inline-flex items-center gap-1.5">
                              <CountryFlag nationality={p.nationality ?? '한국'} size="xs" />
                              <span>{p.name}</span>
                              <span className="font-normal text-slate-500">
                                ({p.position} · OVR {p.ability})
                              </span>
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono-stats">
                            {p.contract.annualSalary.toFixed(2)}억
                          </td>
                          <td className="py-2 px-2 text-right font-mono-stats font-bold text-amber-600 dark:text-amber-400">
                            {demand.toFixed(2)}억
                          </td>
                          <td className="py-2 px-3 text-slate-500">{p.agent?.persona ?? '표준'}</td>
                          <td className="py-2 px-3 text-right">
                            {done ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">타결 완료</span>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0.3"
                                  max="30"
                                  value={salaryOffers[p.id] ?? demand.toFixed(2)}
                                  onChange={(e) =>
                                    setSalaryOffers((prev) => ({ ...prev, [p.id]: e.target.value }))
                                  }
                                  className="w-20 px-2 py-1 text-right font-mono-stats rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSalaryOffer(p.id, demand)}
                                  className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                                >
                                  제안
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI 타 구단 동시 오프시즌 진행 현황 */}
            {(career.aiOffseasonLogSummary ?? []).length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-700 dark:text-slate-300 mb-1">
                  타 9개 AI 구단 스토브리그 동시 진행 내역
                </div>
                <ul className="text-[11px] text-slate-500 space-y-0.5 list-disc pl-4">
                  {(career.aiOffseasonLogSummary ?? []).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 6. 전력 보강 (포지션 진단 · 트레이드 · 해외 복귀 · 드래프트) */}
        {currentStep === 'ROSTER_UPGRADE' && (
          <div className="space-y-4 text-xs">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-slate-700 dark:text-slate-300 font-semibold">{analytics.lineupInsight}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateTab('contracts')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>트레이드 · FA 시장</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('draft')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>신인 드래프트</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {analytics.positionStrength.map((ps) => (
                  <div key={ps.position} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between font-bold">
                      <span>{ps.position}</span>
                      <span
                        className={
                          ps.status === '강점'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ps.status === '보강필요'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-sky-600 dark:text-sky-400'
                        }
                      >
                        {ps.avgOvr} ({ps.leagueRank}위)
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">{ps.starterName}</div>
                  </div>
                ))}
              </div>
            </div>

            {returnPool.length > 0 && (
              <div className="space-y-2">
                <div className="font-bold text-slate-900 dark:text-white">
                  해외 복귀 선수 영입 후보 ({returnPool.length}명)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {returnPool.map((cand) => {
                    const terms = getOverseasReturneeContractTerms(cand, career.playerTeamId);
                    const { hasOriginalClub: hasOrig, years, finalTotal: estTotal, signingBonus: bonus, annualSalary: annual } = terms;
                    return (
                      <div
                        key={cand.id}
                        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-black text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                              <CountryFlag nationality="한국" size="xs" />
                              {cand.playerName} ({cand.position})
                            </span>
                            <span className="font-mono-stats font-bold text-indigo-600 dark:text-indigo-400">
                              OVR {cand.ability}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {cand.overseasClub} ·{' '}
                            {hasOrig
                              ? `원소속 ${KBO_TEAMS[cand.originalKboTeamId!].shortName}`
                              : '원소속팀 없음 (해외 직행)'}
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5">
                            {cand.overseasSummary}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const preview = previewContractSalaryCapImpact(career, {
                              title: `${cand.playerName} 해외 복귀 영입 승인 (${years}년 총액 ${estTotal}억 원)`,
                              items: [
                                {
                                  playerName: cand.playerName,
                                  category: '국내',
                                  years,
                                  annualSalaryBillion: annual,
                                  signingBonusBillion: bonus,
                                  cashRequiredNowBillion: bonus,
                                  isNewIncomingPlayer: true,
                                },
                              ],
                            });
                            setPendingContract({
                              preview,
                              confirmLabel: '단장 승인 · 해외 복귀 영입 확정',
                              execute: () => {
                                try {
                                  const { nextCareer, backupSnapshot } = signOverseasReturnee(career, cand.id);
                                  onUpdateCareer(nextCareer, backupSnapshot);
                                  markAutoSaved(`${cand.playerName} 해외 복귀 영입을 완료했습니다.`);
                                } catch (e) {
                                  setFeedback(e instanceof Error ? e.message : '영입 오류');
                                }
                              },
                            });
                          }}
                          className="w-full py-1.5 rounded bg-slate-900 dark:bg-indigo-600 hover:opacity-90 text-white font-bold cursor-pointer"
                        >
                          {years}년 {estTotal}억 영입
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => onNavigateTab('analytics')}
              className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold cursor-pointer"
            >
              <span>구단 데이터 분석센터 상세 보기</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 7. 개막 준비 (스프링캠프 · 시범경기 · 엔트리 확정) */}
        {currentStep === 'OPENING_PREP' && (
          <div className="space-y-4 text-xs">
            {/* 엔트리 검증 요약 */}
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-indigo-500" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {nextSeasonNum}시즌 개막 1군 엔트리 점검: 선발 타선 {readiness.lineupCount}/9명 · 선발 로테이션{' '}
                    {readiness.rotationCount}/5명
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {readiness.lineupCount >= 9 && readiness.rotationCount >= 5
                      ? '개막 엔트리 필수 요건을 충족했습니다.'
                      : '선발 타선 9명과 선발 로테이션 5명을 채워야 개막 승인할 수 있습니다.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('roster')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
              >
                개막 라인업·엔트리 조정
              </button>
            </div>

            {/* 스프링캠프 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {SPRING_CAMP_LOCATIONS.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setCampLocation(loc.id)}
                  className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    campLocation === loc.id
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                    <span className="flex items-center gap-1">
                      <Plane className="w-3.5 h-3.5 text-indigo-500" />
                      {loc.id}
                    </span>
                    <span className="font-mono-stats text-indigo-600 dark:text-indigo-400">{loc.costBillion}억</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{loc.desc}</p>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-300">훈련 강도:</span>
                {(['고강도', '균형', '컨디션중심'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCampIntensity(mode)}
                    className={`px-3 py-1 rounded-md border font-semibold cursor-pointer ${
                      campIntensity === mode
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={career.springCamp?.campCompleted}
                  onClick={handleRunCamp}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold cursor-pointer"
                >
                  {career.springCamp?.campCompleted ? '스프링캠프 완료됨' : '스프링캠프 출국 실행'}
                </button>
                <button
                  type="button"
                  onClick={handleExhibition}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  시범경기 4경기 ({career.springCamp?.exhibitionGames.length ?? 0}G)
                </button>
              </div>
            </div>

            {myProspects.length > 0 && !career.springCamp?.campCompleted && (
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-1.5">
                  1군 캠프 초청 유망주 선택 ({selectedProspects.length}/4):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {myProspects.map((pr) => {
                    const active = selectedProspects.includes(pr.id);
                    return (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() =>
                          setSelectedProspects((prev) =>
                            active ? prev.filter((id) => id !== pr.id) : prev.length < 4 ? [...prev, pr.id] : prev
                          )
                        }
                        className={`px-2.5 py-1 rounded border text-[11px] cursor-pointer ${
                          active
                            ? 'border-indigo-600 bg-indigo-600 text-white font-bold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {pr.name} ({pr.position} · 잠재 {pr.potential})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(career.springCamp?.exhibitionGames.length ?? 0) > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="font-bold text-slate-800 dark:text-slate-200 mb-2">
                  시범경기 결과 (정규시즌 공식 기록 미반영)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {career.springCamp!.exhibitionGames.slice(-4).map((g) => (
                    <div
                      key={g.id}
                      className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px]"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>
                          {g.gameNo}차전 vs {KBO_TEAMS[g.opponent].shortName}
                        </span>
                        <span
                          className={
                            g.result === '승'
                              ? 'text-emerald-600'
                              : g.result === '패'
                              ? 'text-rose-600'
                              : 'text-slate-500'
                          }
                        >
                          {g.myRuns}:{g.oppRuns} ({g.result})
                        </span>
                      </div>
                      <div className="text-slate-500 mt-1 truncate">{g.standoutNote}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 8. 다음 시즌 시작 (단장 최종 승인 후 개막) */}
        {currentStep === 'NEXT_SEASON_START' && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">개막 대상 시즌</div>
                <div className="text-base font-black font-mono-stats text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {career.season} → {nextSeasonNum}시즌
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{nextSeasonNum}.03.28 개막 예정</div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">{nextSeasonNum} 경쟁균형세 상한</div>
                <div className="text-sm font-black font-mono-stats text-slate-900 dark:text-white mt-0.5">
                  {formatManwonKorean(nextCapManwon)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {nextFloorManwon !== null ? `하한액 ${formatManwonKorean(nextFloorManwon)}` : '하한액 미도입'}
                </div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">개막 엔트리 · 코칭</div>
                <div className="text-sm font-black font-mono-stats text-slate-900 dark:text-white mt-0.5">
                  타선 {readiness.lineupCount}/9 · 선발 {readiness.rotationCount}/5
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  감독 {readiness.hasManager ? '선임됨' : '미선임'} · 코치 {readiness.coachCount}명
                </div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">AI 구단 · 기록 보존</div>
                <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  기존 선수·계약·기록 유지
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  타 9개 구단 오프시즌 동시 반영 완료
                </div>
              </div>
            </div>

            {!readiness.canApproveNextSeason && (
              <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  <span>필수 업무 미완료 — 아래 항목을 완료한 뒤 개막 승인하세요</span>
                </div>
                <ul className="list-disc pl-5 text-[11px]">
                  {readiness.blockingReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-4 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Trophy className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black text-sm text-slate-900 dark:text-white">
                    {nextSeasonNum} KBO 정규시즌 단장 최종 개막 승인
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                    단장 승인 없이는 다음 시즌으로 자동 진행되지 않습니다. 승인 시 기존 선수·계약·통산 기록을 모두 유지한 채{' '}
                    <strong>{nextSeasonNum}년</strong> 일정(144경기)과 연도별 규정이 적용되어 개막합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={!readiness.canApproveNextSeason}
                onClick={handleOpenNextSeason}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs shrink-0 cursor-pointer"
              >
                {nextSeasonNum}시즌 개막 최종 승인
              </button>
            </div>
          </div>
        )}
      </div>

      <ContractApprovalModal
        preview={pendingContract?.preview ?? null}
        confirmLabel={pendingContract?.confirmLabel}
        onCancel={() => setPendingContract(null)}
        onConfirm={() => {
          const action = pendingContract;
          setPendingContract(null);
          action?.execute();
        }}
      />
    </div>
  );
};
