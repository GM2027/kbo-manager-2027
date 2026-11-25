import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Compass,
  Globe,
  History,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  buildCoachSubRatings,
  COACH_ROLE_METADATA,
  COACH_ROLES,
} from '../data/coachesData';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { getNationalityDisplay } from '../data/playerMetadata';
import {
  appointBenchCoachAsActingManagerForUser,
  getBenchCoachAtmosphereEffect,
  getBenchCoachPromotionRecommendation,
  promoteBenchCoachToManagerForUser,
} from '../engine/benchCoachEngine';
import {
  fireAndReplaceClubManager,
  getManagerRecommendedCoaches,
  scoutVirtualCoaches,
} from '../engine/franchiseSystems';
import { computeStandings } from '../engine/stats';
import {
  getAvailableFaCoaches,
  hireFaCoach,
  terminateCoachContract,
} from '../engine/transactions';
import { CareerSave, Coach, CoachRole } from '../types/kbo';
import { CountryFlag, NationalityBadge } from './CountryFlag';
import { TeamLogo } from './TeamLogo';

interface CoachesManagementPanelProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
}

const SUB_RATING_LABELS: Record<string, string> = {
  tactics: '경기 전술',
  lineupMgmt: '라인업 운용',
  pitchingChange: '투수 교체',
  leadership: '리더십',
  playerManagement: '선수 관리',
  tacticalUnderstanding: '전술 이해도',
  stuffCoaching: '구위·구종 지도',
  controlCoaching: '제구 지도',
  development: '투수 성장',
  conditionMgmt: '컨디션 관리',
  contactCoaching: '컨택 지도',
  powerCoaching: '장타 지도',
  eyeCoaching: '선구안 지도',
  slumpCare: '슬럼프 관리',
  framing: '프레이밍·블로킹',
  pitchCalling: '볼배합 지도',
  catcherDefense: '도루 저지',
  chemistry: '투포수 호흡',
  infieldDefense: '내야 수비',
  outfieldDefense: '외야 수비',
  errorReduction: '실책 억제',
  baseRunning: '주루·중계',
};

function getCoachSubRatingEntries(coach: Coach): { key: string; label: string; value: number }[] {
  const sr = coach.subRatings ?? buildCoachSubRatings(coach.role, coach.ability, coach.name);
  const defs = COACH_ROLE_METADATA[coach.role]?.subRatingDefs ?? [];
  return defs.map((d) => ({
    key: d.key,
    label: coach.role === '수석코치' ? d.label : (SUB_RATING_LABELS[d.key] ?? d.label),
    value: sr[d.key] ?? coach.ability,
  }));
}

export const CoachesManagementPanel: React.FC<CoachesManagementPanelProps> = ({
  career,
  onUpdateCareer,
}) => {
  const [roleFilter, setRoleFilter] = useState<'전체' | CoachRole>('전체');
  const [originFilter, setOriginFilter] = useState<'전체' | '한국' | '해외' | '가상'>('전체');
  const [confirmFireId, setConfirmFireId] = useState<string | null>(null);
  const [hiringTarget, setHiringTarget] = useState<Coach | null>(null);
  const [hireYears, setHireYears] = useState(2);
  const [hireSalary, setHireSalary] = useState(2);
  const [hireBonus, setHireBonus] = useState(0.5);
  const [notice, setNotice] = useState<string | null>(null);

  const myTeam = career.playerTeamId;
  const myCoaches = career.coaches[myTeam] ?? [];
  const currentManager = myCoaches.find((c) => c.role === '감독');
  const currentBenchCoach = myCoaches.find((c) => c.role === '수석코치');
  const benchEffect = getBenchCoachAtmosphereEffect(career, myTeam);
  const benchPromotionRec = getBenchCoachPromotionRecommendation(career, myTeam);
  const myBenchReports = (career.benchCoachReports ?? [])
    .filter((r) => r.teamId === myTeam)
    .slice(0, 4);
  const standings = computeStandings(career.gamesLedger);
  const myRow = standings.find((r) => r.teamId === myTeam);
  const isManagerHotSeat = Boolean(currentManager && myRow && myRow.games >= 24 && myRow.pct < 0.42);
  const managerFirings = career.managerFirings ?? [];

  const managerRecommendations = useMemo(
    () => getManagerRecommendedCoaches(career).recommendations,
    [career]
  );

  const faCoaches = useMemo(() => {
    return getAvailableFaCoaches(career)
      .filter((c) => (roleFilter === '전체' ? true : c.role === roleFilter))
      .filter((c) => {
        const nat = c.nationality ?? '한국';
        if (originFilter === '전체') return true;
        if (originFilter === '한국') return nat === '한국';
        if (originFilter === '해외') return nat !== '한국';
        return Boolean(c.isVirtual);
      })
      .sort((a, b) => b.ability - a.ability);
  }, [career, roleFilter, originFilter]);

  const handleImmediateFireManager = () => {
    if (!currentManager) return;
    const backupSnapshot = JSON.parse(JSON.stringify(career)) as CareerSave;
    const next = JSON.parse(JSON.stringify(career)) as CareerSave;
    const rec = fireAndReplaceClubManager(
      next,
      myTeam,
      `성적 부진(${myRow?.rank ?? 9}위 · 승률 ${(myRow?.pct ?? 0.38).toFixed(3)}) 문책 단장 전격 경질`,
      new Date().toISOString().slice(0, 10),
      myRow?.rank ?? 9,
      myRow?.pct ?? 0.38,
      false
    );
    if (rec) {
      next.updatedAt = new Date().toISOString();
      onUpdateCareer(next, backupSnapshot);
      const promoted = (next.coaches[myTeam] ?? []).find((c) => c.role === '감독');
      setNotice(
        promoted?.isActingManager
          ? `${rec.firedManagerName} 감독 경질 후 기존 코치 ${rec.newManagerName}을(를) 감독대행으로 선임했습니다.`
          : `${rec.firedManagerName} 감독을 전격 경질하고 ${rec.newManagerName} 신임 감독을 선임했습니다.`
      );
    }
  };

  const handleScoutVirtualCoaches = () => {
    try {
      const { nextCareer, backupSnapshot, addedCoaches } = scoutVirtualCoaches(career);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice(
        `글로벌 지도자 스카우트 완료: 한국·일본·미국·도미니카 신임 지도자 ${addedCoaches.length}명 (${addedCoaches
          .slice(0, 3)
          .map((c) => `${c.name}(${c.role})`)
          .join(', ')} 등)이 FA 시장에 합류했습니다.`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '글로벌 코치 스카우트 오류');
    }
  };

  const openHireModal = (c: Coach) => {
    setHiringTarget(c);
    setHireYears(c.contractYears);
    setHireSalary(c.annualSalaryBillion);
    setHireBonus(c.signingBonusBillion);
    setNotice(null);
  };

  const handleConfirmTerminate = (coachId: string) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = terminateCoachContract(career, coachId);
      onUpdateCareer(nextCareer, backupSnapshot);
      setConfirmFireId(null);
      setNotice('선택한 지도자의 계약이 해지되어 FA 시장으로 이동했습니다.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '계약 해지 오류');
    }
  };

  const handleConfirmHire = () => {
    if (!hiringTarget) return;
    try {
      setNotice(null);
      const occupied = myCoaches.some((c) => c.role === hiringTarget.role);
      const { nextCareer, backupSnapshot } = hireFaCoach(career, hiringTarget.id, {
        years: hireYears,
        annualSalaryBillion: hireSalary,
        signingBonusBillion: hireBonus,
        replaceExisting: occupied,
      });
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice(
        `${hiringTarget.role} ${hiringTarget.name} 영입 확정 (총액 ${(hireYears * hireSalary + hireBonus).toFixed(1)}억 원 미지급 기장)`
      );
      setHiringTarget(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'FA 지도자 영입 오류');
    }
  };

  const occupiedTarget = hiringTarget
    ? myCoaches.find((c) => c.role === hiringTarget.role)
    : undefined;

  return (
    <div className="space-y-4">
      {notice && (
        <div className="p-3 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {/* Manager Firing Alert Banner when club underperforms */}
      {isManagerHotSeat && currentManager && myRow && (
        <div className="p-4 rounded-md border border-red-500/50 bg-red-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-extrabold text-red-700 dark:text-red-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>
                감독 경질 위기 경보 · {currentManager.name} 감독 (현재 리그 {myRow.rank}위 · 승률{' '}
                {myRow.pct.toFixed(3)})
              </span>
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              장기 부진으로 구단주와 팬덤의 사령탑 교체 요구가 거세지고 있습니다. 즉시 경질 후 FA 상위 감독을 선임하거나 아래 시장에서 직접 새 감독을 영입할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleImmediateFireManager}
            className="px-3.5 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-bold shrink-0"
          >
            감독 즉시 경질 · 신임 선임
          </button>
        </div>
      )}

      {/* 감독 공석 / 경질 시 수석코치 감독 대행 지정 & 차기 감독 후보 추천 배너 */}
      {benchPromotionRec.recommended && benchPromotionRec.candidate && (
        <div className="p-4 rounded-md border border-indigo-500/50 bg-indigo-500/10 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-extrabold text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              <span>
                수석코치 차기 감독 후보 추천 · {benchPromotionRec.candidate.name}
                {benchPromotionRec.isCurrentlyActingManager ? ' (현 감독 대행)' : ' (수석코치)'}
              </span>
            </div>
            <p className="text-slate-700 dark:text-slate-300">{benchPromotionRec.reason}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              감독·수석코치는 현장 운영과 선수단 관리를 담당하며, 선수 계약과 트레이드는 단장 승인 권한으로 유지됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!currentManager && currentBenchCoach && (
              <button
                type="button"
                onClick={() => {
                  try {
                    const res = appointBenchCoachAsActingManagerForUser(career);
                    onUpdateCareer(res.nextCareer, res.backupSnapshot);
                    setNotice(
                      `${res.actingManager.name} 수석코치를 감독 대행으로 지정했습니다.`
                    );
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : '감독 대행 지정 오류');
                  }
                }}
                className="px-3 py-2 rounded border border-indigo-500/60 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-700 dark:text-indigo-200 font-bold"
              >
                수석코치 감독 대행 지정
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                try {
                  const res = promoteBenchCoachToManagerForUser(career);
                  onUpdateCareer(res.nextCareer, res.backupSnapshot);
                  setNotice(
                    `${res.promotedManager.name} 코치를 정식 감독으로 승격 선임했습니다.`
                  );
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : '정식 감독 승격 오류');
                }
              }}
              className="px-3.5 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              정식 감독 승격
            </button>
          </div>
        </div>
      )}

      {/* 1. Current Team Staff (6 Coaching Roles incl. 수석코치 + Detailed Sub-Ratings) */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">
              {KBO_TEAMS[myTeam].name} 현재 코칭스태프 ({myCoaches.length}/{COACH_ROLES.length}명)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              감독·수석코치·투수·타격·배터리·수비 6개 보직이 각 역할을 분담합니다. 수석코치는 감독 보좌·선수단 관리·코칭스태프 조율을 맡으며, 계약·트레이드는 단장만 승인합니다.
            </p>
          </div>
          {benchEffect.hasBenchCoach && (
            <div className="text-[11px] font-mono-stats px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
              수석코치 보정: 불만 억제 ×{benchEffect.dissatisfactionGainMult.toFixed(2)} · 회복{' '}
              {benchEffect.dissatisfactionDecayBonus >= 0 ? `+${benchEffect.dissatisfactionDecayBonus}` : benchEffect.dissatisfactionDecayBonus}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {COACH_ROLES.map((role) => {
            const coach = myCoaches.find((c) => c.role === role);
            const meta = COACH_ROLE_METADATA[role];
            if (!coach) {
              return (
                <div
                  key={role}
                  className="p-4 rounded border border-dashed border-amber-500/50 bg-amber-500/5 space-y-2 text-xs"
                >
                  <div className="font-bold text-amber-600 dark:text-amber-400">{role} (공석)</div>
                  <div className="text-[11px] text-slate-500">{meta.duties}</div>
                  <p className="text-slate-500 dark:text-slate-400">
                    현재 {role} 보직이 비어 있습니다.
                    {role === '감독' && currentBenchCoach
                      ? ` 위 배너에서 ${currentBenchCoach.name} 수석코치를 감독 대행으로 지정하거나 아래 FA 시장에서 영입하세요.`
                      : ` 아래 감독 추천 또는 FA 시장에서 ${role}을 영입해 주세요.`}
                  </p>
                </div>
              );
            }

            const isConfirming = confirmFireId === coach.id;
            const subEntries = getCoachSubRatingEntries(coach);
            const natDisp = getNationalityDisplay(coach.nationality ?? '한국');
            const isHeadManager = coach.role === '감독';
            return (
              <div
                key={coach.id}
                className="p-4 rounded border team-accent-border bg-slate-50/70 dark:bg-slate-950/60 flex flex-col justify-between space-y-3 text-xs"
                style={{ borderTopWidth: '3px', borderTopColor: 'var(--team-primary)' }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`font-extrabold px-2 py-0.5 rounded ${
                          isHeadManager ? 'team-accent-bg' : 'team-accent-badge'
                        }`}
                      >
                        {coach.role}
                      </span>
                      {coach.isActingManager && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                          감독대행
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <NationalityBadge
                        nationality={natDisp.label}
                        size="xs"
                        className="text-[11px] text-slate-500"
                      />
                      {coach.coachTrainingOrigin && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-bold">
                          코치 연수
                        </span>
                      )}
                      {coach.isVirtual && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                          스카우트
                        </span>
                      )}
                      <span className="font-mono-stats font-bold text-slate-900 dark:text-white">
                        OVR {coach.ability}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-base font-extrabold text-slate-900 dark:text-white">
                      {coach.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {coach.careerNote ?? `${KBO_TEAMS[myTeam].shortName} ${coach.role}`}
                    </div>
                  </div>

                  {/* Role Duty Summary */}
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">담당 역할:</span>{' '}
                    {coach.roleSummary ?? meta.duties}
                  </div>

                  {/* 4 Detailed Sub-Ratings */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-0.5">
                    {subEntries.map((sr) => (
                      <div key={sr.key} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400 truncate">{sr.label}</span>
                          <span className="font-mono-stats font-bold text-slate-800 dark:text-slate-200">
                            {sr.value}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              sr.value >= 86
                                ? 'team-accent-bg'
                                : sr.value >= 78
                                ? 'bg-emerald-500'
                                : 'bg-slate-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(25, sr.value))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                    전술: <strong>{coach.tacticalStyle ?? '밸런스'}</strong> · 육성:{' '}
                    <strong>{coach.devSpecialty ?? '팀케미·관리'}</strong>
                  </div>
                  <div className="font-mono-stats text-[11px] text-slate-500 dark:text-slate-400">
                    계약 {coach.contractYears}년 · 총액 {coach.totalBillion.toFixed(1)}억 (연{' '}
                    {coach.annualSalaryBillion}억)
                  </div>
                </div>

                {!isConfirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirmFireId(coach.id)}
                    className="w-full py-1.5 rounded border border-red-400/60 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-semibold flex items-center justify-center gap-1"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>계약 해지</span>
                  </button>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmFireId(null)}
                      className="flex-1 py-1.5 rounded border border-slate-300 dark:border-slate-700 font-semibold"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmTerminate(coach.id)}
                      className="flex-1 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold"
                    >
                      해지 확정
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 수석코치 1차 선수 불만 면담 보고서 */}
        {myBenchReports.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              수석코치 1차 선수 면담 보고 ({myBenchReports.length}건)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
              {myBenchReports.map((rep) => (
                <div
                  key={rep.id}
                  className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {rep.playerName} · {rep.benchCoachName} 수석코치
                    </span>
                    <span className="font-mono-stats text-emerald-700 dark:text-emerald-400 font-bold">
                      불만 {rep.beforeDissatisfaction}→{rep.afterDissatisfaction}
                    </span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">{rep.recommendation}</div>
                  <div className="text-[10px] font-mono-stats text-slate-400">{rep.date}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 1.5 Manager's Recommended Coach Candidates */}
      {currentManager && managerRecommendations.length > 0 && (
        <div className="border team-accent-border team-accent-soft rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Sparkles className="w-4 h-4 team-accent-text" />
              <span>
                {currentManager.name} 감독 추천 코칭스태프 보강 ({managerRecommendations.length}명)
              </span>
            </div>
            <span className="text-[11px] text-slate-600 dark:text-slate-300">
              감독의 전술 성향({currentManager.tacticalStyle ?? '밸런스'})과 현재 구단 공석·취약 보직을 분석한 직속 추천 명단
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {managerRecommendations.map((rec) => {
              const natDisp = getNationalityDisplay(rec.coach.nationality ?? '한국');
              return (
                <div
                  key={rec.coach.id}
                  className="p-3 rounded border team-accent-border bg-white dark:bg-slate-900 flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-extrabold px-2 py-0.5 rounded team-accent-badge">
                        추천 {rec.targetRole}
                      </span>
                      <span className="font-mono-stats text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        능력 +{rec.abilityGain} · OVR {rec.coach.ability}
                      </span>
                    </div>
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{rec.coach.name}</span>
                      <NationalityBadge
                        nationality={natDisp.label}
                        size="xs"
                        className="text-[11px] font-normal text-slate-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      {rec.reason}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openHireModal(rec.coach)}
                    className="w-full py-1.5 rounded team-accent-btn font-bold flex items-center justify-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>감독 추천 코치 영입</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. FA Coaches Market (Real + Virtual Global KR/JP/US/DR Coaches) */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Award className="w-4 h-4 team-accent-text" />
            <span>FA 감독 · 코치 영입 시장 ({faCoaches.length}명)</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={handleScoutVirtualCoaches}
              className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 mr-1"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>한국·일본·미국 신임 지도자 스카우트</span>
            </button>

            {(['전체', ...COACH_ROLES] as const).map((rf) => (
              <button
                key={rf}
                type="button"
                onClick={() => setRoleFilter(rf)}
                className={`px-2.5 py-1 rounded border font-semibold ${
                  roleFilter === rf
                    ? 'team-accent-bg border-transparent'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {rf}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 mr-1">국적·출신 필터:</span>
          {(['전체', '한국', '해외', '가상'] as const).map((of) => (
            <button
              key={of}
              type="button"
              onClick={() => setOriginFilter(of)}
              className={`px-2 py-0.5 rounded border font-semibold ${
                originFilter === of
                  ? 'team-accent-bg border-transparent'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {of === '가상' ? '스카우트 신임(가상)' : of === '해외' ? '일본·미국 등 해외' : of}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {faCoaches.map((fc) => {
            const natDisp = getNationalityDisplay(fc.nationality ?? '한국');
            const subEntries = getCoachSubRatingEntries(fc);
            return (
              <div
                key={fc.id}
                className="p-3.5 rounded border team-accent-border bg-slate-50/70 dark:bg-slate-950/60 flex flex-col justify-between space-y-2.5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-extrabold px-2 py-0.5 rounded team-accent-badge">
                      FA · {fc.role}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <NationalityBadge
                        nationality={natDisp.label}
                        size="xs"
                        className="text-[11px] text-slate-500"
                      />
                      {fc.coachTrainingOrigin && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-bold">
                          코치 연수 수료
                        </span>
                      )}
                      {fc.isVirtual && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                          스카우트
                        </span>
                      )}
                      <span className="font-mono-stats font-bold">OVR {fc.ability}</span>
                    </div>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {fc.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {fc.careerNote ?? `FA 신분 ${fc.role}`}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono-stats text-slate-600 dark:text-slate-300 pt-0.5">
                    {subEntries.map((sr) => (
                      <div key={sr.key} className="flex items-center justify-between bg-white/80 dark:bg-slate-900/80 px-1.5 py-0.5 rounded">
                        <span className="text-slate-500 truncate">{sr.label}</span>
                        <span className="font-bold">{sr.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="font-mono-stats text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
                    희망 조건: {fc.contractYears}년 총 {fc.totalBillion.toFixed(1)}억 (연{' '}
                    {fc.annualSalaryBillion}억 + 계약금 {fc.signingBonusBillion}억)
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openHireModal(fc)}
                  className="w-full py-1.5 rounded team-accent-btn font-bold flex items-center justify-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>영입 및 계약</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. All 10 KBO Teams Coaching Staff Directory (5 Roles) */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Users className="w-4 h-4 team-accent-text" />
          <span>KBO 10개 구단 코칭스태프 현황 (5개 보직)</span>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
              <tr>
                <th className="py-2 px-3">구단</th>
                {COACH_ROLES.map((r) => (
                  <th key={r} className="py-2 px-2.5 team-accent-text font-extrabold">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {TEAM_IDS.map((tid) => {
                const staff = career.coaches[tid] ?? [];
                const isMine = tid === myTeam;
                return (
                  <tr
                    key={tid}
                    className={
                      isMine
                        ? 'team-accent-soft font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }
                  >
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <TeamLogo teamId={tid} size="xs" />
                        <span className="font-bold">{KBO_TEAMS[tid].shortName}</span>
                      </div>
                    </td>
                    {COACH_ROLES.map((r) => {
                      const c = staff.find((x) => x.role === r);
                      return (
                        <td key={r} className="py-2 px-2.5 whitespace-nowrap">
                          {c ? (
                            <span className="inline-flex items-center gap-1">
                              {c.nationality && c.nationality !== '한국' && (
                                <CountryFlag nationality={c.nationality} size="xs" />
                              )}
                              <span>{c.name}</span>
                              <span className="font-mono-stats text-slate-400">({c.ability})</span>
                            </span>
                          ) : (
                            <span className="text-amber-600">공석</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. League-wide Manager Firing & Replacement Log */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <History className="w-4 h-4 team-accent-text" />
            <span>KBO 리그 감독 경질 · 교체 기록 ({managerFirings.length}건)</span>
          </div>
          <span className="text-[11px] text-slate-500">
            전 구단 성적 부진 시 시즌 중·종료 후 경질 및 교체 자동 반영
          </span>
        </div>
        {managerFirings.length === 0 ? (
          <div className="p-3 rounded border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            아직 기록된 리그 감독 경질 내역이 없습니다. 시즌 중 성적 부진 구단에서 사령탑 교체가 발생하면 이곳에 기록됩니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {managerFirings.slice(0, 12).map((mf) => (
              <div
                key={mf.id}
                className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
              >
                <div className="flex items-center gap-2">
                  <TeamLogo teamId={mf.teamId} size="xs" />
                  <span className="font-bold">{KBO_TEAMS[mf.teamId].shortName}</span>
                  <span className="text-red-600 dark:text-red-400 font-semibold">
                    {mf.firedManagerName} 경질
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                    {mf.newManagerName} 선임
                  </span>
                </div>
                <div className="text-[11px] font-mono-stats text-slate-500">
                  {mf.season} · {mf.date} · 당시 {mf.rankAtFiring}위 ({mf.winPctAtFiring.toFixed(3)}) · {mf.reason}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hire FA Coach Contract Modal */}
      {hiringTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border team-accent-border rounded-md overflow-hidden">
            <div className="team-banner-grad px-5 py-3.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white/90 flex items-center gap-1.5">
                  <span>FA {hiringTarget.role} 영입 계약</span>
                  <NationalityBadge
                    nationality={getNationalityDisplay(hiringTarget.nationality ?? '한국').label}
                    size="xs"
                  />
                </div>
                <h3 className="text-base font-extrabold text-white">{hiringTarget.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setHiringTarget(null)}
                className="p-1 text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-semibold">
                  능력치 {hiringTarget.ability}/100 · {hiringTarget.role} · 전술 {hiringTarget.tacticalStyle ?? '밸런스'} · 육성 {hiringTarget.devSpecialty ?? '팀케미·관리'}
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {hiringTarget.roleSummary ?? COACH_ROLE_METADATA[hiringTarget.role].duties}
                </div>
                <div className="grid grid-cols-2 gap-1.5 pt-1 font-mono-stats text-[11px]">
                  {getCoachSubRatingEntries(hiringTarget).map((sr) => (
                    <div key={sr.key} className="flex justify-between">
                      <span className="text-slate-500">{sr.label}</span>
                      <span className="font-bold">{sr.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {occupiedTarget && (
                <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                  현재 {hiringTarget.role} 보직의 <strong>{occupiedTarget.name}</strong> 코치는 계약 해지(FA 시장 전환) 후 교체 선임됩니다.
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">기간(년)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={hireYears}
                    onChange={(e) =>
                      setHireYears(Math.max(1, Math.min(5, Number(e.target.value) || 1)))
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">연봉(억)</label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={hireSalary}
                    onChange={(e) =>
                      setHireSalary(Math.max(0.5, Number(e.target.value) || 0.5))
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">계약금(억)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={hireBonus}
                    onChange={(e) => setHireBonus(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                  />
                </div>
              </div>

              <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono-stats">
                계약 총액:{' '}
                <strong>{(hireYears * hireSalary + hireBonus).toFixed(1)}억 원</strong> (미지급 의무 기장 · 현금 지급 0원)
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHiringTarget(null)}
                  className="px-4 py-2 rounded border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmHire}
                  className="px-4 py-2 rounded team-accent-btn font-bold flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{occupiedTarget ? '교체 영입 확정' : '영입 계약 확정'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
