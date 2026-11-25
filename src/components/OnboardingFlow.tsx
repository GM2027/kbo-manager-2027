import React, { useState } from 'react';
import { ArrowRight, Building2, Check, CheckCircle2, ChevronRight, Sparkles, UserMinus, Users } from 'lucide-react';
import { getTeamSponsorChoices } from '../data/financesData';
import { KBO_TEAMS } from '../data/kboTeams';
import { releaseDomesticPlayerToWaiver } from '../engine/franchiseSystems';
import { getRecommendedReleaseCandidates } from '../engine/recommendations';
import {
  applyStaffSelection,
  getAvailableFaCoaches,
  releaseForeignPlayer,
  selectCorporateSponsor,
  setCareerPhase,
} from '../engine/transactions';
import { CareerSave, Coach, GamePhase } from '../types/kbo';
import { DraftBoardPanel } from './DraftBoardPanel';
import { PlayerCategoryTag } from './PlayerCategoryTag';
import { SponsorLogo } from './SponsorLogo';
import { TeamLogo } from './TeamLogo';

interface OnboardingFlowProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onOpenSectionTab: (tab: 'contracts' | 'roster') => void;
}

const FLOW_STEPS: { phase: GamePhase; label: string }[] = [
  { phase: 'INTRO', label: '취임식' },
  { phase: 'STAFF', label: '감독·코치' },
  { phase: 'ROSTER_ANALYSIS', label: '전력 분석' },
  { phase: 'REINFORCEMENT', label: '전력 보강' },
  { phase: 'SPECIAL_DRAFT', label: '신인 드래프트' },
  { phase: 'OPENING_ROSTER', label: '개막 엔트리' },
];

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  career,
  onUpdateCareer,
  onOpenSectionTab,
}) => {
  const teamInfo = KBO_TEAMS[career.playerTeamId];
  const currentCoaches = career.coaches[career.playerTeamId] ?? [];
  const [coachEdits, setCoachEdits] = useState<Coach[]>(currentCoaches);
  const [notice, setNotice] = useState<string | null>(null);

  const teamPlayers = Object.values(career.players).filter((p) => p.teamId === career.playerTeamId);
  const hitters = teamPlayers.filter((p) => p.role === '타자').sort((a, b) => b.ability - a.ability);
  const pitchers = teamPlayers.filter((p) => p.role === '투수').sort((a, b) => b.ability - a.ability);
  const avgAbility = Math.round(
    teamPlayers.reduce((s, p) => s + p.ability, 0) / Math.max(1, teamPlayers.length)
  );

  const goPhase = (p: GamePhase) => {
    setNotice(null);
    onUpdateCareer(setCareerPhase(career, p));
  };

  const handleConfirmStaff = () => {
    const { nextCareer, backupSnapshot } = applyStaffSelection(career, coachEdits);
    nextCareer.phase = 'ROSTER_ANALYSIS';
    onUpdateCareer(nextCareer, backupSnapshot);
  };

  const preSeasonReleaseRecs = getRecommendedReleaseCandidates(career, 4);

  const handleQuickRelease = (playerId: string) => {
    try {
      setNotice(null);
      const pl = career.players[playerId];
      if (!pl) return;
      const res =
        pl.category === '외국인' || pl.category === '아시아쿼터'
          ? releaseForeignPlayer(career, playerId)
          : releaseDomesticPlayerToWaiver(career, playerId);
      onUpdateCareer(res.nextCareer, res.backupSnapshot);
      setNotice(`${pl.name} 선수를 시즌 개막 전 방출(웨이버 공시) 처리했습니다.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '방출 처리 오류');
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Onboarding Stepper */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {FLOW_STEPS.map((st, i) => {
            const active = career.phase === st.phase;
            return (
              <React.Fragment key={st.phase}>
                <button
                  type="button"
                  onClick={() => goPhase(st.phase)}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                    active
                      ? 'team-accent-bg shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {i + 1}. {st.label}
                </button>
                {i < FLOW_STEPS.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-700 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* 1. INTRO (구단 팀컬러 적용 단장 취임식) */}
      {career.phase === 'INTRO' && (
        <div className="border team-accent-border bg-white dark:bg-slate-900 rounded-md overflow-hidden">
          <div className="team-banner-grad px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-white/15 border border-white/25 shrink-0">
                <TeamLogo teamId={career.playerTeamId} size="lg" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/15 border border-white/25 text-[11px] font-bold text-white">
                  {career.season} KBO 단장 취임식
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1.5 tracking-tight">
                  {teamInfo.name} · {career.gmName} 단장 취임
                </h2>
                <p className="text-xs text-white/85 mt-1">
                  홈 구장: {teamInfo.stadium} ({teamInfo.capacity.toLocaleString()}석) · {career.season} 시즌 0승 0패(0/144경기)
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs border-t border-b border-slate-200 dark:border-slate-800 py-4">
            <div>
              <div className="text-slate-500 dark:text-slate-400">현재 성적</div>
              <div className="text-base font-bold font-mono-stats mt-0.5">0승 0패 (0/144)</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">구단 보유 자금 (초기 + 스폰서)</div>
              <div className="text-base font-bold font-mono-stats text-emerald-700 dark:text-emerald-400 mt-0.5">
                {career.finances.cashBalanceBillion === null
                  ? '미편성'
                  : `${career.finances.cashBalanceBillion.toFixed(1)}억 원`}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">메인 스폰서</div>
              <div className="text-base font-bold mt-0.5">
                {career.finances.sponsor ? career.finances.sponsor.name : '미계약 (아래에서 선택)'}
              </div>
            </div>
          </div>

          {/* Tailored 3 Differentiated Club Sponsor Choices */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="text-sm font-bold flex items-center gap-1.5">
                <Building2 className="w-4 h-4 team-accent-text" />
                <span>{teamInfo.name} 맞춤 스폰서십 3대 선택지 (즉시 계약금 입금)</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                구단 특성에 맞춘 3가지 전략 파트너 중 1곳을 선택하세요 · 시즌 중 재정 메뉴에서 조건 협상 가능
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {getTeamSponsorChoices(career.playerTeamId).map((sp) => {
                const isSigned = career.finances.sponsor?.id === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    disabled={isSigned}
                    onClick={() => {
                      try {
                        setNotice(null);
                        const { nextCareer, backupSnapshot } = selectCorporateSponsor(career, sp.id);
                        onUpdateCareer(nextCareer, backupSnapshot);
                      } catch (err) {
                        setNotice(err instanceof Error ? err.message : '스폰서 계약 오류');
                      }
                    }}
                    className={`p-3.5 rounded border text-left transition-colors flex flex-col justify-between gap-2.5 ${
                      isSigned
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
                        : sp.recommended
                        ? 'team-accent-border bg-slate-50/80 dark:bg-slate-950/70 hover:brightness-95'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 bg-slate-50/60 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900">
                          {sp.strategyLabel}
                        </span>
                        {sp.recommended && !isSigned && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded team-accent-bg">
                            <Sparkles className="w-2.5 h-2.5" /> 추천
                          </span>
                        )}
                        {isSigned && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            <Check className="w-3 h-3" /> 계약 체결됨
                          </span>
                        )}
                      </div>

                      <div className="flex items-start gap-2.5">
                        <SponsorLogo sponsor={sp} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-extrabold truncate">{sp.name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {sp.industry} · {sp.tier} · {sp.contractYears ?? 2}년
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                        {sp.fitReason}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="text-[11px] font-mono-stats font-bold text-emerald-700 dark:text-emerald-400">
                        계약금 +{sp.signingBonusBillion}억 원
                      </div>
                      <div className="text-[11px] font-mono-stats text-slate-700 dark:text-slate-200">
                        시리즈 +{sp.perSeriesBonusBillion}억 · 1승 +{sp.winBonusBillion}억 · 관중 +{sp.attendanceBonusBillion ?? 0.2}억
                      </div>
                      <div className="text-[11px] font-mono-stats font-bold team-accent-text">
                        유니폼 MD 매출 +{sp.merchBoostPct}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => goPhase('STAFF')}
              className="px-5 py-2.5 rounded team-accent-btn text-sm font-bold flex items-center gap-2 shadow-sm"
            >
              <span>감독·코치 선임 단계로</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          </div>
        </div>
      )}

      {/* 2. STAFF (구단 팀컬러 적용 감독·코치 선임) */}
      {career.phase === 'STAFF' && (
        <div className="border team-accent-border bg-white dark:bg-slate-900 rounded-md overflow-hidden">
          <div className="team-banner-grad px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <TeamLogo teamId={career.playerTeamId} size="sm" />
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  {teamInfo.shortName} 감독 · 코치 일괄 선임
                </h2>
                <p className="text-xs text-white/85 mt-0.5">
                  기존 코칭스태프 유임 또는 FA 후보 선임 조건을 확인한 뒤 최종 승인하세요. 승인 전까지 재정 채무는 발생하지 않습니다.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {coachEdits.map((c, idx) => {
              const incumbentCoach = currentCoaches.find((ic) => ic.role === c.role);
              const faOptions = getAvailableFaCoaches(career).filter((fc) => fc.role === c.role);
              const choices: Coach[] = [
                ...(incumbentCoach ? [incumbentCoach] : []),
                ...faOptions.filter((fc) => fc.name !== incumbentCoach?.name),
              ];
              const isHeadManager = c.role === '감독';
              return (
                <div
                  key={`${c.role}-${idx}`}
                  className="p-4 rounded border team-accent-border bg-slate-50/70 dark:bg-slate-950/60 space-y-3"
                  style={{ borderTopWidth: '3px', borderTopColor: 'var(--team-primary)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-extrabold px-2 py-0.5 rounded ${
                        isHeadManager ? 'team-accent-bg' : 'team-accent-badge'
                      }`}
                    >
                      {c.role}
                    </span>
                    <span className="text-xs font-mono-stats font-bold team-accent-text">
                      능력 {c.ability}/100
                    </span>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">
                      유임 또는 FA 지도자 선택
                    </label>
                    <select
                      value={c.name}
                      onChange={(e) => {
                        const chosen = choices.find((ch) => ch.name === e.target.value);
                        if (!chosen) return;
                        const next = [...coachEdits];
                        next[idx] = { ...chosen };
                        setCoachEdits(next);
                      }}
                      className="w-full px-2.5 py-1.5 text-sm font-bold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      {choices.map((ch) => (
                        <option key={ch.id} value={ch.name}>
                          {ch.name} ({ch.teamId === 'FA' ? 'FA' : '현직 유임'} · 능력 {ch.ability})
                        </option>
                      ))}
                    </select>
                    {c.careerNote && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {c.careerNote}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-0.5">계약 기간(년)</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={c.contractYears}
                        onChange={(e) => {
                          const yrs = Math.max(1, Math.min(5, Number(e.target.value) || 1));
                          const next = [...coachEdits];
                          next[idx] = {
                            ...c,
                            contractYears: yrs,
                            totalBillion: Number(
                              (yrs * c.annualSalaryBillion + c.signingBonusBillion).toFixed(2)
                            ),
                          };
                          setCoachEdits(next);
                        }}
                        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-stats"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-0.5">연봉(억)</label>
                      <input
                        type="number"
                        step="0.5"
                        min={0.5}
                        value={c.annualSalaryBillion}
                        onChange={(e) => {
                          const sal = Math.max(0.5, Number(e.target.value) || 1);
                          const next = [...coachEdits];
                          next[idx] = {
                            ...c,
                            annualSalaryBillion: sal,
                            totalBillion: Number(
                              (c.contractYears * sal + c.signingBonusBillion).toFixed(2)
                            ),
                          };
                          setCoachEdits(next);
                        }}
                        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-stats"
                      />
                    </div>
                  </div>
                  <div className="text-xs font-mono-stats text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200 dark:border-slate-800">
                    계약 총액: {c.totalBillion.toFixed(1)}억 원 (계약금 {c.signingBonusBillion}억 포함)
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs font-mono-stats text-slate-600 dark:text-slate-300">
              일괄 선임 합계: {coachEdits.reduce((s, c) => s + c.totalBillion, 0).toFixed(1)}억 원 (현금 지급 0원)
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goPhase('ROSTER_ANALYSIS')}
                className="px-4 py-2 text-xs font-medium rounded border border-slate-300 dark:border-slate-700"
              >
                선임 보류 후 다음 단계
              </button>
              <button
                type="button"
                onClick={handleConfirmStaff}
                className="px-4 py-2 text-xs font-bold rounded team-accent-btn"
              >
                코칭스태프 일괄 최종 승인
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* 3. ROSTER_ANALYSIS */}
      {career.phase === 'ROSTER_ANALYSIS' && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">선수단 전력 분석</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {career.season} 개막 로스터 기준 (등록 {teamPlayers.length}명 · 평균 게임 능력치 {avgAbility}점)
              </p>
            </div>
            <button
              type="button"
              onClick={() => goPhase('REINFORCEMENT')}
              className="px-4 py-2 text-xs font-bold rounded team-accent-btn flex items-center gap-1.5"
            >
              <span>전력 보강 단계로</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 dark:border-slate-800 rounded p-3">
              <div className="text-xs font-bold mb-2">핵심 투수진 (능력치 순)</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {pitchers.slice(0, 8).map((p) => (
                  <div key={p.id} className="py-1.5 flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1.5">
                      <span>{p.name}</span>
                      <PlayerCategoryTag category={p.category} compact />
                      <span className="text-slate-400">· {p.position} · {p.rosterTier}</span>
                    </span>
                    <span className="font-mono-stats font-semibold">
                      {p.ability}/{p.potential}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded p-3">
              <div className="text-xs font-bold mb-2">핵심 야수진 (능력치 순)</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {hitters.slice(0, 9).map((p) => (
                  <div key={p.id} className="py-1.5 flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1.5">
                      <span>{p.name}</span>
                      <PlayerCategoryTag category={p.category} compact />
                      <span className="text-slate-400">· {p.position} · {p.rosterTier}</span>
                    </span>
                    <span className="font-mono-stats font-semibold">
                      {p.ability}/{p.potential}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. REINFORCEMENT */}
      {career.phase === 'REINFORCEMENT' && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-5 space-y-4">
          <h2 className="text-lg font-bold">전력 보강 · 개막 전 선수단 정리</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            필요한 선수 계약, 외국인(3+1) 영입, 트레이드를 상단/좌측의 [계약·트레이드] 메뉴에서 진행하거나, 아래 개막 전 방출 추천 선수를 정리한 뒤 특별 신인 드래프트로 넘어갈 수 있습니다.
          </p>

          {preSeasonReleaseRecs.length > 0 && (
            <div className="p-3.5 rounded border border-rose-500/35 bg-rose-500/5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <UserMinus className="w-3.5 h-3.5" />
                  시즌 시작 전 방출 추천 선수 ({preSeasonReleaseRecs.length}명)
                </span>
                <span className="text-[11px] text-slate-500">노쇠화·성장 한계·연봉 효율 기준</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {preSeasonReleaseRecs.map((rec) => (
                  <div
                    key={rec.player.id}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-1.5">
                        <span>{rec.player.name}</span>
                        <span className="text-[10px] font-mono-stats text-slate-500">
                          {rec.player.position} · {rec.player.age}세 · OVR {rec.player.ability}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {rec.reason} · {rec.salaryReliefText}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickRelease(rec.player.id)}
                      className="px-2.5 py-1 rounded border border-rose-500/50 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-bold shrink-0"
                    >
                      방출
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onOpenSectionTab('contracts')}
              className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              계약 · 외국인 스카우트 · 트레이드 열기
            </button>
            <button
              type="button"
              onClick={() =>
                goPhase(
                  career.draftCompletedSeasons?.includes(career.season)
                    ? 'OPENING_ROSTER'
                    : 'SPECIAL_DRAFT'
                )
              }
              className="px-4 py-2 text-xs font-bold rounded team-accent-btn flex items-center gap-1.5"
            >
              <span>
                {career.draftCompletedSeasons?.includes(career.season)
                  ? '개막 엔트리 확정 단계로 (2027 신인 기반영)'
                  : '특별 신인 드래프트로 이동'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 5. SPECIAL_DRAFT */}
      {career.phase === 'SPECIAL_DRAFT' && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-5 space-y-4">
          {career.draftCompletedSeasons?.includes(career.season) ? (
            <div className="space-y-3">
              <h2 className="text-lg font-bold">
                {career.season} 신인 드래프트 기완료 (v18 DB 110명 반영)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                2027 개정 규정 및 중복 드래프트 방지 원칙에 따라, 2027 신인 선수 110명은 이미 각 구단 2군 로스터에 반영되어 있습니다.
                2027년 9월에 실시되는 신인 드래프트는 <strong>{career.draftClassYear ?? career.season + 1} KBO 신인 드래프트</strong>로 정상 진행됩니다.
              </p>
              <button
                type="button"
                onClick={() => goPhase('OPENING_ROSTER')}
                className="px-4 py-2 text-xs font-bold rounded team-accent-btn flex items-center gap-1.5"
              >
                <span>개막 엔트리 확정 단계로 이동</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold">{career.season} 특별 신인 드래프트 (11R · 110픽 · 후보 150명)</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  1~11라운드 구단 순서대로 지명 시뮬레이션이 진행되며 내 구단 차례에 자동 정지합니다.
                </p>
              </div>
              <DraftBoardPanel
                career={career}
                onUpdateCareer={onUpdateCareer}
                onCompletedAction={
                  <button
                    type="button"
                    onClick={() => goPhase('OPENING_ROSTER')}
                    className="px-4 py-2 text-xs font-bold rounded team-accent-btn flex items-center gap-1.5"
                  >
                    <span>개막 엔트리 확정 단계로</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                }
              />
            </>
          )}
        </div>
      )}

      {/* 6. OPENING_ROSTER */}
      {career.phase === 'OPENING_ROSTER' && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 team-accent-text" />
            <h2 className="text-lg font-bold">개막 엔트리 및 선발 로테이션 최종 점검</h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            타순(1~9번)과 투수 로테이션을 확인한 뒤 개막을 승인하면 정규시즌(144경기, 3연전 단위 진행)이 열립니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onOpenSectionTab('roster')}
              className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              선수단 · 타순 편집 화면 열기
            </button>
            <button
              type="button"
              onClick={() => goPhase('REGULAR_SEASON')}
              className="px-5 py-2 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>개막 엔트리 최종 승인 및 정규시즌 개막</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
