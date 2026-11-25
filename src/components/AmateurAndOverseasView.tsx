import React, { useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Globe2,
  GraduationCap,
  History,
  Plane,
  Scale,
  ShieldAlert,
  Star,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  applyOverseasPlayerForDraft,
  evaluateOverseasReturnEligibility,
  signEligibleKboAlumniReturnee,
  toggleAmateurProspectWatchlist,
} from '../engine/amateurOverseasEngine';
import { getCurrentCareerDate } from '../engine/salaryCapEngine';
import {
  AmateurProspect,
  CareerSave,
  OverseasPlayerRecord,
} from '../types/kbo';
import { MlbTeamLogo } from './MlbTeamLogo';

interface AmateurAndOverseasViewProps {
  career: CareerSave;
  initialSubTab?: AmateurSubTab;
  initialSelectedOverseasId?: string | null;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

export type AmateurSubTab =
  | 'prospects'
  | 'tournaments'
  | 'mlb_scouting'
  | 'overseas'
  | 'return_107';

const OVERSEAS_SIGN_STATUS_TONE: Record<AmateurProspect['overseasStatus'], string> = {
  없음: 'text-slate-500 dark:text-slate-400',
  관심: 'text-sky-700 dark:text-sky-300 font-semibold',
  협상: 'text-amber-700 dark:text-amber-300 font-bold',
  계약임박: 'text-orange-700 dark:text-orange-300 font-extrabold',
  계약확정: 'text-emerald-700 dark:text-emerald-300 font-extrabold',
};

const MLB_LEAGUE_TONE: Record<string, string> = {
  MLB: 'bg-indigo-600 text-white',
  AAA: 'bg-sky-600 text-white',
  AA: 'bg-teal-600 text-white',
  'A+': 'bg-slate-600 text-white',
  A: 'bg-slate-500 text-white',
  Rookie: 'bg-amber-600 text-white',
  NPB: 'bg-rose-600 text-white',
  NPB2군: 'bg-rose-500/80 text-white',
  'FA/방출': 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
};

export const AmateurAndOverseasView: React.FC<AmateurAndOverseasViewProps> = ({
  career,
  initialSubTab = 'prospects',
  initialSelectedOverseasId = null,
  onUpdateCareer,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<AmateurSubTab>(initialSubTab);
  const [schoolFilter, setSchoolFilter] = useState<'전체' | '고교' | '대학' | '관심' | '드래프트예상'>('전체');
  const [roleFilter, setRoleFilter] = useState<'전체' | '투수' | '타자'>('전체');
  const [overseasLevelFilter, setOverseasLevelFilter] = useState<'전체' | 'MLB' | '마이너' | 'NPB' | '방출·복귀'>('전체');
  const [selectedOverseasId, setSelectedOverseasId] = useState<string | null>(initialSelectedOverseasId);

  const state = career.amateurAndOverseas;
  const currentIsoDate = getCurrentCareerDate(career).isoDate;

  const prospects = state?.prospects ?? [];
  const tournaments = state?.tournamentResults ?? [];
  const mlbBudgets = state?.mlbClubBudgets ?? [];
  const overseasPlayers = state?.overseasPlayers ?? [];
  const signedThisSeasonCount = state?.overseasAmateurSigningsBySeason?.[career.season] ?? 0;

  const prospectById = useMemo(() => {
    const map = new Map<string, AmateurProspect>();
    for (const p of prospects) map.set(p.permanentId, p);
    return map;
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    return prospects
      .filter((p) => {
        if (schoolFilter === '고교' && p.schoolType !== '고교') return false;
        if (schoolFilter === '대학' && p.schoolType !== '대학') return false;
        if (schoolFilter === '관심' && !p.watchlisted) return false;
        if (schoolFilter === '드래프트예상' && p.draftEligibleSeason > career.season) return false;
        if (roleFilter !== '전체' && p.role !== roleFilter) return false;
        return p.careerPath !== '은퇴';
      })
      .sort((a, b) => (a.projectedDraftRank ?? 999) - (b.projectedDraftRank ?? 999));
  }, [prospects, schoolFilter, roleFilter, career.season]);

  const mlbInterestedProspects = useMemo(
    () =>
      prospects
        .filter((p) => p.overseasStatus !== '없음')
        .sort((a, b) => {
          const order = { 계약확정: 0, 계약임박: 1, 협상: 2, 관심: 3, 없음: 4 };
          return (
            order[a.overseasStatus] - order[b.overseasStatus] ||
            b.overseasInterestLevel - a.overseasInterestLevel
          );
        }),
    [prospects]
  );

  const filteredOverseas = useMemo(() => {
    return overseasPlayers
      .filter((ov) => {
        if (overseasLevelFilter === 'MLB') return ov.league === 'MLB';
        if (overseasLevelFilter === '마이너') {
          return ['AAA', 'AA', 'A+', 'A', 'Rookie'].includes(ov.league);
        }
        if (overseasLevelFilter === 'NPB') return ov.league === 'NPB' || ov.league === 'NPB2군';
        if (overseasLevelFilter === '방출·복귀') {
          return ov.league === 'FA/방출' || ov.status === '방출대기' || ov.status === '국내복귀신청';
        }
        return true;
      })
      .sort((a, b) => {
        const lvlOrder: Record<string, number> = {
          MLB: 0,
          NPB: 1,
          AAA: 2,
          AA: 3,
          'A+': 4,
          A: 5,
          Rookie: 6,
          NPB2군: 7,
          'FA/방출': 8,
        };
        return (lvlOrder[a.league] ?? 9) - (lvlOrder[b.league] ?? 9) || b.ability - a.ability;
      });
  }, [overseasPlayers, overseasLevelFilter]);

  const selectedOverseas: OverseasPlayerRecord | null = useMemo(() => {
    if (selectedOverseasId) {
      const found = overseasPlayers.find((o) => o.permanentId === selectedOverseasId);
      if (found) return found;
    }
    return filteredOverseas[0] ?? overseasPlayers[0] ?? null;
  }, [selectedOverseasId, overseasPlayers, filteredOverseas]);

  const returnAudits = useMemo(() => {
    return overseasPlayers
      .filter((ov) => ov.status !== 'KBO복귀완료' && ov.status !== '은퇴')
      .map((ov) => ({
        player: ov,
        audit: evaluateOverseasReturnEligibility(ov, currentIsoDate),
      }))
      .sort((a, b) => {
        const prio = (x: typeof a) => {
          if (x.player.draftApplication?.approved) return 0;
          if (x.audit.canApplyRookieDraft || x.audit.canSignOriginalClub) return 1;
          if (x.audit.blockedByArticle107 && x.audit.domesticEligibleDate) return 2;
          return 3;
        };
        return prio(a) - prio(b) || a.audit.daysRemaining - b.audit.daysRemaining;
      });
  }, [overseasPlayers, currentIsoDate]);

  const handleToggleWatchlist = (permanentId: string) => {
    const next = toggleAmateurProspectWatchlist(career, permanentId);
    onUpdateCareer(next);
  };

  const handleApplyDraft = (permanentId: string) => {
    try {
      const { nextCareer, approved, message } = applyOverseasPlayerForDraft(career, permanentId);
      onUpdateCareer(nextCareer, career);
      onNotify(message, approved ? 'success' : 'error');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '드래프트 참가 신청 처리 오류', 'error');
    }
  };

  const handleSignAlumniReturnee = (permanentId: string) => {
    try {
      const { nextCareer, message } = signEligibleKboAlumniReturnee(career, permanentId);
      onUpdateCareer(nextCareer, career);
      onNotify(message, 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '원소속 복귀 계약 오류', 'error');
    }
  };

  if (!state) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center text-sm text-slate-500">
        아마추어 · 해외파 시스템 데이터를 초기화하는 중입니다.
      </div>
    );
  }

  const watchlistCount = prospects.filter((p) => p.watchlisted).length;
  const overseasDraftApplicants = overseasPlayers.filter((o) => o.draftApplication?.approved);
  const article107RestrictedCount = returnAudits.filter((r) => r.audit.blockedByArticle107).length;

  return (
    <div className="space-y-5">
      {/* Header & KPI Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              <span>아마추어 야구 · MLB 스카우팅 · 해외파 · KBO 규약 제107조</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              고교·대학 유망주와 전국 대회 결과, MLB 30개 구단 국제 아마추어 계약, 해외파 월별 성적 및 KBO 국내 복귀 2년 유예 규정을 통합 관리합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'prospects', label: `고교·대학 유망주 (${prospects.length})` },
                { id: 'tournaments', label: `아마추어 대회 (${tournaments.length})` },
                { id: 'mlb_scouting', label: `해외 스카우팅 (${mlbInterestedProspects.length})` },
                { id: 'overseas', label: `해외파 현황 (${overseasPlayers.length})` },
                { id: 'return_107', label: `국내 복귀 · 제107조` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-colors ${
                  subTab === t.id
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">고교 / 대학 유망주</div>
            <div className="font-mono-stats text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
              {prospects.filter((p) => p.schoolType === '고교').length}명 /{' '}
              {prospects.filter((p) => p.schoolType === '대학').length}명
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">관심 유망주 명단</div>
            <div className="font-mono-stats text-base font-extrabold text-orange-600 dark:text-orange-400 mt-0.5">
              {watchlistCount}명
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">연간 해외 계약 확정</div>
            <div className="font-mono-stats text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
              {signedThisSeasonCount} / 3명
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">해외파 관리 선수</div>
            <div className="font-mono-stats text-base font-extrabold text-sky-700 dark:text-sky-400 mt-0.5">
              {overseasPlayers.filter((o) => o.status !== 'KBO복귀완료' && o.status !== '은퇴').length}명
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">제107조 제한 / 드래프트 신청</div>
            <div className="font-mono-stats text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
              {article107RestrictedCount}명 /{' '}
              <span className="text-emerald-600 dark:text-emerald-400">{overseasDraftApplicants.length}명</span>
            </div>
          </div>
        </div>
      </div>

      {/* SUBTAB 1: 고교·대학 유망주 & 드래프트 예상 순위 & 관심 명단 */}
      {subTab === 'prospects' && (
        <div className="space-y-4">
          {/* #21 고교 최대어 · 대학 최대어 · 신인 드래프트 현장 초청 명단 */}
          {(() => {
            const topRec =
              state.annualTopProspects?.find((r) => r.season === career.season) ??
              state.annualTopProspects?.[0];
            if (!topRec) return null;
            const hsTop = topRec.topHighSchool;
            const colTop = topRec.topCollege;
            const hsFull = hsTop ? prospectById.get(hsTop.permanentId) : undefined;
            const colFull = colTop ? prospectById.get(colTop.permanentId) : undefined;
            const invitees = topRec.draftInvitees ?? [];
            return (
              <div className="bg-white dark:bg-slate-900 border border-amber-500/40 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                    <Award className="w-4 h-4" />
                    <span>{topRec.season} 고교·대학 최대어 선정 및 신인 드래프트 현장 초청 명단</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    현장 초청 {invitees.length}명 · 전국 대회 활약 및 스카우트 평가 반영
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {hsTop && (
                    <div className="p-3 rounded border border-amber-500/35 bg-amber-500/5">
                      <div className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
                        {topRec.season} 고교 최대어
                      </div>
                      <div className="text-sm font-black mt-0.5 flex items-center gap-2">
                        <span>{hsTop.name}</span>
                        <span className="text-xs font-mono-stats text-slate-500">
                          {hsTop.position} · {hsTop.schoolName}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-stats text-slate-600 dark:text-slate-300 mt-1">
                        예상 #{hsFull?.projectedDraftRank ?? 1} · 능력 {hsTop.ability}/잠재 {hsTop.potential}
                        {hsFull?.fastballKmh ? ` · 최고 ${hsFull.fastballKmh.toFixed(1)}km/h` : ''}
                      </div>
                    </div>
                  )}
                  {colTop && (
                    <div className="p-3 rounded border border-indigo-500/35 bg-indigo-500/5">
                      <div className="text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">
                        {topRec.season} 대학 최대어
                      </div>
                      <div className="text-sm font-black mt-0.5 flex items-center gap-2">
                        <span>{colTop.name}</span>
                        <span className="text-xs font-mono-stats text-slate-500">
                          {colTop.position} · {colTop.schoolName}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-stats text-slate-600 dark:text-slate-300 mt-1">
                        예상 #{colFull?.projectedDraftRank ?? '-'} · 능력 {colTop.ability}/잠재 {colTop.potential}
                        {colFull?.fastballKmh ? ` · 최고 ${colFull.fastballKmh.toFixed(1)}km/h` : ''}
                      </div>
                    </div>
                  )}
                </div>
                {invitees.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300 mr-2">
                      신인 드래프트 현장 초청 ({invitees.length}명):
                    </span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {invitees.map((inv) => `${inv.name}(${inv.schoolName}·${inv.position})`).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['전체', '고교', '대학', '드래프트예상', '관심'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSchoolFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-bold border ${
                    schoolFilter === f
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {f === '드래프트예상'
                    ? `${career.season} 드래프트 대상`
                    : f === '관심'
                    ? `관심 명단 (${watchlistCount})`
                    : f}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {(['전체', '투수', '타자'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                    roleFilter === r
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[540px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-2 text-center">관심</th>
                  <th className="py-2.5 px-2">예상순위</th>
                  <th className="py-2.5 px-3">선수 / 고유 ID</th>
                  <th className="py-2.5 px-2">소속 · 학년</th>
                  <th className="py-2.5 px-2">포지션</th>
                  <th className="py-2.5 px-2 text-right">능력/잠재</th>
                  <th className="py-2.5 px-2 text-right">구속/툴</th>
                  <th className="py-2.5 px-3">시즌 아마추어 성적</th>
                  <th className="py-2.5 px-3">해외 관심 · 진로</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProspects.map((p) => {
                  const topMlbClub = p.signedMlbClub ?? p.interestedMlbClubs[0]?.clubName;
                  const topOfferUsd = p.signedBonusUsd ?? p.interestedMlbClubs[0]?.offeredBonusUsd ?? 0;
                  const statText =
                    p.seasonG > 0
                      ? p.seasonStatSummary
                      : p.role === '투수' && p.pitchingLine
                      ? `${p.seasonG}G ${p.pitchingLine.w}승 ${p.pitchingLine.l}패 ERA ${p.pitchingLine.era.toFixed(2)} ${p.pitchingLine.so}K`
                      : p.battingLine
                      ? `${p.seasonG}G AVG ${p.battingLine.avg.toFixed(3)} ${p.battingLine.hr}HR OPS ${p.battingLine.ops.toFixed(3)}`
                      : p.seasonStatSummary;
                  return (
                    <tr
                      key={p.permanentId}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleWatchlist(p.permanentId)}
                          className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700"
                          title={p.watchlisted ? '관심 명단 해제' : '관심 유망주 등록'}
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              p.watchlisted
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-slate-300 dark:text-slate-600'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="py-2 px-2 font-mono-stats font-bold text-slate-700 dark:text-slate-300">
                        #{p.projectedDraftRank ?? '-'}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                          <span>{p.name}</span>
                          {(() => {
                            const activeTop =
                              state.annualTopProspects?.find((r) => r.season === career.season) ??
                              state.annualTopProspects?.[0];
                            const badge =
                              activeTop?.topHighSchool?.permanentId === p.permanentId
                                ? '고교 최대어'
                                : activeTop?.topCollege?.permanentId === p.permanentId
                                ? '대학 최대어'
                                : null;
                            const isInvited = Boolean(
                              activeTop?.draftInviteePermanentIds?.includes(p.permanentId)
                            );
                            return (
                              <>
                                {badge && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                                    {badge}
                                  </span>
                                )}
                                {isInvited && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                    현장초청
                                  </span>
                                )}
                              </>
                            );
                          })()}
                          {p.isEarlyDraftEligible && (
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                              얼리대상
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono-stats text-slate-400">
                          {p.permanentId} · {p.birthYear}년생 (만 {p.age}세)
                        </div>
                      </td>
                      <td className="py-2 px-2 text-slate-700 dark:text-slate-300">
                        <div className="font-semibold">{p.schoolName}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.schoolType} {p.grade}학년 · {p.draftEligibleSeason}드래프트
                        </div>
                      </td>
                      <td className="py-2 px-2 font-mono-stats font-bold">{p.position}</td>
                      <td className="py-2 px-2 text-right font-mono-stats font-bold">
                        <span className="text-orange-600 dark:text-orange-400">{p.ability}</span>
                        <span className="text-slate-400">/</span>
                        <span>{p.potential}</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono-stats text-slate-600 dark:text-slate-300">
                        {p.role === '투수'
                          ? `${(p.fastballKmh ?? 144).toFixed(1)}km`
                          : `파워 ${p.batPowerGrade ?? 65} / 컨택 ${p.batContactGrade ?? 65}`}
                      </td>
                      <td className="py-2 px-3 font-mono-stats text-[11px] text-slate-600 dark:text-slate-400">
                        {statText}
                      </td>
                      <td className="py-2 px-3">
                        <div className={`text-[11px] ${OVERSEAS_SIGN_STATUS_TONE[p.overseasStatus]}`}>
                          {p.overseasStatus === '없음'
                            ? `진로: ${p.careerPath}`
                            : `MLB ${p.overseasStatus}${topMlbClub ? ` · ${topMlbClub}` : ''}`}
                        </div>
                        {p.overseasStatus !== '없음' && (
                          <div className="text-[10px] font-mono-stats text-slate-500">
                            관심도 {p.overseasInterestLevel} · 제안 ${Math.round(topOfferUsd / 1000).toLocaleString()}K
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
        </div>
      )}

      {/* SUBTAB 2: 아마추어 대회 결과 */}
      {subTab === 'tournaments' && (
        <div className="space-y-3">
          {tournaments.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center text-sm text-slate-500">
              <Trophy className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
              정규시즌이 진행되면 신세계 이마트배(4월) · 황금사자기(5월) · 청룡기(7월) · 대통령배(8월) · 봉황대기(9월) · 대학 U리그(6월) · 전국대학야구선수권(8월) 결과가 자동 집계됩니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-mono-stats text-slate-500 dark:text-slate-400">
                        {t.season}년 {t.month}월 · {t.category} 전국대회
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        <span>{t.tournamentName}</span>
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                      우승 {t.championSchool}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    준우승: <strong className="text-slate-800 dark:text-slate-200">{t.runnerUpSchool}</strong> · {t.summary}
                  </div>

                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        <Award className="w-3.5 h-3.5" />
                        대회 MVP: {t.mvpName} ({t.mvpSchool} · {t.mvpPosition})
                      </span>
                      <span className="font-mono-stats text-[10px] text-slate-400">{t.mvpPermanentId}</span>
                    </div>
                    <div className="font-mono-stats text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                      {t.mvpStatLine}
                    </div>
                  </div>

                  {t.standoutProspectIds.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        스카우트 주목 유망주
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                        {t.standoutProspectIds.map((pid) => {
                          const sp = prospectById.get(pid);
                          if (!sp) return null;
                          return (
                            <div key={pid} className="py-1 flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {sp.name}{' '}
                                <span className="text-slate-500 font-normal">
                                  ({sp.schoolName} · {sp.position})
                                </span>
                              </span>
                              <span className="font-mono-stats text-slate-500 dark:text-slate-400">
                                OVR {sp.ability}/{sp.potential}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: 해외 진출 스카우팅 & MLB 30개 구단 예산 */}
      {subTab === 'mlb_scouting' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Plane className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>MLB 구단 관심 · 협상 · 계약 확정 아마추어 유망주</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  계약 확정 전까지 KBO 드래프트 대상 자격을 유지하며, 확정 시에만 드래프트 풀에서 제외되고 동일 고유 ID로 해외파로 이관됩니다.
                </p>
              </div>
              <span className="font-mono-stats text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                연간 계약 {signedThisSeasonCount}/3명
              </span>
            </div>

            {mlbInterestedProspects.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                현재 MLB 스카우트의 집중 관찰 대상 유망주가 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {mlbInterestedProspects.map((p) => {
                  const topClub = p.signedMlbClub ?? p.interestedMlbClubs[0]?.clubName;
                  const offerUsd = p.signedBonusUsd ?? p.interestedMlbClubs[0]?.offeredBonusUsd ?? 0;
                  return (
                    <div
                      key={p.permanentId}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 dark:text-white">{p.name}</span>
                          <span className="font-mono-stats text-[11px] text-slate-500">
                            {p.position} · 만 {p.age}세 · {p.schoolName} {p.grade}학년
                          </span>
                          <span className={`text-[11px] ${OVERSEAS_SIGN_STATUS_TONE[p.overseasStatus]}`}>
                            [{p.overseasStatus}]
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono-stats">
                          ID {p.permanentId} · 능력 {p.ability}/잠재 {p.potential}
                          {p.fastballKmh ? ` · 최고 ${p.fastballKmh}km/h` : ''} · 해외 관심도 {p.overseasInterestLevel}/100
                          {p.age < 18 ? (p.guardianConsentReady ? ' · 보호자 동의 완료' : ' · 보호자 동의 심사중') : ''}
                        </div>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center sm:justify-end gap-1.5">
                          {topClub && <MlbTeamLogo teamName={topClub} size="xs" />}
                          <span>{topClub ?? '복수 MLB 구단 관찰'}</span>
                        </div>
                        <div className="font-mono-stats text-[11px] text-emerald-700 dark:text-emerald-400">
                          예상 계약금 ${Math.round(offerUsd / 1000).toLocaleString()}K
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* MLB 30-Club Bonus Pool */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>MLB 30개 구단 국제 아마추어 보너스 풀 ({career.season})</span>
            </h3>
            <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {mlbBudgets.map((club) => {
                const usedPct = Math.min(
                  100,
                  Math.round(
                    ((club.maxBonusPoolUsd - club.remainingBonusPoolUsd) /
                      Math.max(1, club.maxBonusPoolUsd)) *
                      100
                  )
                );
                return (
                  <div key={club.shortName} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MlbTeamLogo teamName={club.clubName} size="xs" />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {club.clubName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {club.division} · 선호 포지션: {club.focusRole}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono-stats">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        잔여 ${Math.round(club.remainingBonusPoolUsd / 1000).toLocaleString()}K
                      </div>
                      <div className="text-[10px] text-slate-400">
                        총 ${Math.round(club.maxBonusPoolUsd / 1000).toLocaleString()}K ({usedPct}% 집행)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: 해외파 선수 현황 (마이너리그 성적 + 선수별 연도별 성적 & 이적 이력 상세 뷰) */}
      {subTab === 'overseas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                해외파 한국인 선수 현황 ({filteredOverseas.length}명)
              </h3>
              <div className="flex flex-wrap items-center gap-1">
                {(['전체', 'MLB', '마이너', 'NPB', '방출·복귀'] as const).map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setOverseasLevelFilter(lv)}
                    className={`px-2 py-1 rounded text-[11px] font-bold border ${
                      overseasLevelFilter === lv
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[540px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">선수 / 구분</th>
                    <th className="py-2 px-2">소속 · 레벨</th>
                    <th className="py-2 px-2 text-right">OVR/POT</th>
                    <th className="py-2 px-3">{career.season} 시즌 성적</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOverseas.map((ov) => {
                    const isSelected = selectedOverseas?.permanentId === ov.permanentId;
                    const st = ov.currentSeasonStats;
                    const statLine =
                      ov.role === '타자'
                        ? `${st.g}G AVG ${(st.avg ?? 0).toFixed(3)} ${st.hr ?? 0}HR ${st.rbi ?? 0}RBI OPS ${(st.ops ?? 0).toFixed(3)}`
                        : `${st.g}G ${st.w ?? 0}승 ${st.l ?? 0}패 ERA ${(st.era ?? 0).toFixed(2)} ${(st.ip ?? 0).toFixed(1)}IP ${st.so ?? 0}K`;
                    return (
                      <tr
                        key={ov.permanentId}
                        onClick={() => setSelectedOverseasId(ov.permanentId)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-orange-500/10 dark:bg-orange-500/15'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2 px-3">
                          <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span>{ov.name}</span>
                            <span className="font-mono-stats text-[11px] font-semibold text-slate-500">
                              {ov.position}
                            </span>
                            {ov.militaryStatus && (
                              <span
                                className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                                  ov.militaryStatus === '면제'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : ov.militaryStatus === '군필'
                                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                    : ov.militaryStatus === '복무중'
                                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {ov.militaryStatus}
                              </span>
                            )}
                            {(ov.injuryDaysRemaining ?? 0) > 0 && (
                              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                IL({ov.injuryDaysRemaining}일)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono-stats">
                            {ov.permanentId} · 만 {ov.age}세 · {ov.originCategory}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold font-mono-stats ${
                                MLB_LEAGUE_TONE[ov.league] ?? 'bg-slate-600 text-white'
                              }`}
                            >
                              {ov.league}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                              {ov.clubName}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {ov.status} · 잔여 {ov.contractYearsRemaining}년
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono-stats font-bold">
                          <span className="text-orange-600 dark:text-orange-400">{ov.ability}</span>
                          <span className="text-slate-400">/</span>
                          <span>{ov.potential}</span>
                        </td>
                        <td className="py-2 px-3 font-mono-stats text-[11px] text-slate-700 dark:text-slate-300">
                          {statLine}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Panel: 연도별 성적 & 이적 이력 상세 뷰 */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
            {!selectedOverseas ? (
              <div className="py-12 text-center text-xs text-slate-500">
                좌측 목록에서 해외파 선수를 선택하면 연도별 성적과 이적·승격 이력이 표시됩니다.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <MlbTeamLogo teamName={selectedOverseas.clubName} size="sm" />
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          {selectedOverseas.name}{' '}
                          <span className="text-xs font-mono-stats text-slate-500">
                            ({selectedOverseas.position} · 만 {selectedOverseas.age}세)
                          </span>
                        </h3>
                        <div className="text-[11px] font-mono-stats text-slate-500">
                          고유 ID: {selectedOverseas.permanentId} · {selectedOverseas.birthYear}년생
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                      <div>
                        소속: <strong>{selectedOverseas.clubName}</strong> ({selectedOverseas.league} · {selectedOverseas.status})
                      </div>
                      <div>
                        진출 경로: <strong>{selectedOverseas.originCategory}</strong>
                        {selectedOverseas.originalKboTeamId
                          ? ` · KBO 원소속 ${KBO_TEAMS[selectedOverseas.originalKboTeamId].name}`
                          : ' · 원소속 없음 (제107조 대상)'}
                      </div>
                      <div className="font-mono-stats">
                        계약: 잔여 {selectedOverseas.contractYearsRemaining}년 · 연봉 $
                        {selectedOverseas.annualSalaryUsdThousands.toLocaleString()}K
                        {selectedOverseas.signingBonusUsd
                          ? ` · 계약금 $${Math.round(selectedOverseas.signingBonusUsd / 1000).toLocaleString()}K`
                          : ''}
                      </div>
                      <div>
                        병역 상태:{' '}
                        <strong
                          className={
                            selectedOverseas.militaryStatus === '면제'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : selectedOverseas.militaryStatus === '미필'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }
                        >
                          {selectedOverseas.militaryStatus ?? '미필'}
                        </strong>
                        {selectedOverseas.militaryNote ? ` · ${selectedOverseas.militaryNote}` : ''}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Year-by-year Season History */}
                <div className="space-y-2">
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                    <span>연도별 해외 리그 성적 (당해 시즌 포함)</span>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                    <table className="w-full text-[11px] text-left font-mono-stats">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-1.5 px-2">연도</th>
                          <th className="py-1.5 px-2">레벨/팀</th>
                          <th className="py-1.5 px-2 text-right">G</th>
                          {selectedOverseas.role === '타자' ? (
                            <>
                              <th className="py-1.5 px-2 text-right">AVG</th>
                              <th className="py-1.5 px-2 text-right">HR</th>
                              <th className="py-1.5 px-2 text-right">RBI</th>
                              <th className="py-1.5 px-2 text-right">OPS</th>
                            </>
                          ) : (
                            <>
                              <th className="py-1.5 px-2 text-right">W-L</th>
                              <th className="py-1.5 px-2 text-right">IP</th>
                              <th className="py-1.5 px-2 text-right">ERA</th>
                              <th className="py-1.5 px-2 text-right">SO</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {[selectedOverseas.currentSeasonStats, ...selectedOverseas.seasonHistory].map((row, idx) => (
                          <tr key={`${row.season}-${idx}`}>
                            <td className="py-1.5 px-2 font-bold">{row.season}</td>
                            <td className="py-1.5 px-2 font-sans truncate max-w-[120px]">
                              {row.league} · {row.clubName}
                            </td>
                            <td className="py-1.5 px-2 text-right">{row.g}</td>
                            {selectedOverseas.role === '타자' ? (
                              <>
                                <td className="py-1.5 px-2 text-right">{(row.avg ?? 0).toFixed(3)}</td>
                                <td className="py-1.5 px-2 text-right">{row.hr ?? 0}</td>
                                <td className="py-1.5 px-2 text-right">{row.rbi ?? 0}</td>
                                <td className="py-1.5 px-2 text-right font-bold">{(row.ops ?? 0).toFixed(3)}</td>
                              </>
                            ) : (
                              <>
                                <td className="py-1.5 px-2 text-right">
                                  {row.w ?? 0}-{row.l ?? 0}
                                </td>
                                <td className="py-1.5 px-2 text-right">{(row.ip ?? 0).toFixed(1)}</td>
                                <td className="py-1.5 px-2 text-right font-bold">{(row.era ?? 0).toFixed(2)}</td>
                                <td className="py-1.5 px-2 text-right">{row.so ?? 0}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Transfer / Promotion History */}
                <div className="space-y-2">
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                    <span>승격 · 강등 · 트레이드 · 계약 이력 ({selectedOverseas.transferHistory.length}건)</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded px-3 text-xs">
                    {selectedOverseas.transferHistory.map((ev, idx) => (
                      <div key={`${ev.date}-${idx}`} className="py-2 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{ev.eventType}</span>
                          <span className="font-mono-stats text-[10px] text-slate-400">{ev.date}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">{ev.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 5: 국내 복귀 예정 · KBO 규약 제107조 제한 기간 · 드래프트 참가 신청자 */}
      {subTab === 'return_107' && (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
            <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span>KBO 규약 제107조 (해외 진출 선수 국내 복귀 규정) 적용 기준 · 현재 기준일 {currentIsoDate}</span>
            </div>
            <p>
              • <strong>아마추어 해외 직행 선수</strong>: 해외 구단 계약 종료(방출·임의탈퇴)일로부터 <strong>2년간 국내 구단 계약 금지</strong>(정식선수 및 육성선수 우회 영입 모두 원천 차단). 유예 만료 후 신인 드래프트 참가 신청 및 자격 심사를 거쳐 드래프트 지명으로만 입단 가능합니다.
            </p>
            <p>
              • <strong>기존 KBO 소속 해외 진출 선수 (포스팅·FA)</strong>: 해외 계약 종료 또는 방출 시 신인 드래프트 대상이 아니며 <strong>원소속 KBO 구단 복귀 계약</strong> 절차로 처리됩니다.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                해외파 국내 복귀 자격 심사 · 제한 기간 현황 ({returnAudits.length}명)
              </h3>
              <span className="text-[11px] font-mono-stats text-slate-500">
                드래프트 참가 승인: {overseasDraftApplicants.length}명
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {returnAudits.map(({ player: ov, audit }) => {
                const isApprovedApplicant = Boolean(ov.draftApplication?.approved);
                const isMyAlumni =
                  audit.canSignOriginalClub &&
                  (!ov.originalKboTeamId || ov.originalKboTeamId === career.playerTeamId);

                return (
                  <div
                    key={ov.permanentId}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                          {ov.name}
                        </span>
                        <span className="font-mono-stats text-slate-500">
                          {ov.position} · 만 {ov.age}세 · OVR {ov.ability}/{ov.potential}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          {ov.originCategory}
                        </span>
                        {ov.originalKboTeamId && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                            원소속 {KBO_TEAMS[ov.originalKboTeamId].shortName}
                          </span>
                        )}
                        {isApprovedApplicant && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                            {ov.draftApplication?.targetSeason} 드래프트 참가 승인
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        {audit.blockedByArticle107 ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        ) : audit.canApplyRookieDraft || audit.canSignOriginalClub ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span>{audit.reason}</span>
                      </div>

                      <div className="text-[10px] font-mono-stats text-slate-500 flex flex-wrap items-center gap-3">
                        <span>ID {ov.permanentId}</span>
                        <span>소속 {ov.clubName} ({ov.league})</span>
                        {ov.overseasContractEndDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            해외계약종료 {ov.overseasContractEndDate}
                          </span>
                        )}
                        {audit.domesticEligibleDate && (
                          <span className="font-bold text-orange-600 dark:text-orange-400">
                            국내 가능일 {audit.domesticEligibleDate}
                            {audit.daysRemaining > 0 ? ` (잔여 ${audit.daysRemaining}일)` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {ov.originCategory === '아마추어직행' && !isApprovedApplicant && (
                        <button
                          type="button"
                          disabled={!audit.canApplyRookieDraft}
                          onClick={() => handleApplyDraft(ov.permanentId)}
                          className={`px-3 py-1.5 rounded text-xs font-bold ${
                            audit.canApplyRookieDraft
                              ? 'bg-orange-600 hover:bg-orange-700 text-white'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {audit.canApplyRookieDraft ? '신인 드래프트 참가 신청' : '제107조 제한중'}
                        </button>
                      )}

                      {ov.originCategory !== '아마추어직행' && audit.canSignOriginalClub && (
                        <button
                          type="button"
                          disabled={!isMyAlumni}
                          onClick={() => handleSignAlumniReturnee(ov.permanentId)}
                          className={`px-3 py-1.5 rounded text-xs font-bold inline-flex items-center gap-1.5 ${
                            isMyAlumni
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>
                            {isMyAlumni
                              ? '원소속 구단 복귀 계약'
                              : `${ov.originalKboTeamId ? KBO_TEAMS[ov.originalKboTeamId].shortName : '타구단'} 보유권`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
