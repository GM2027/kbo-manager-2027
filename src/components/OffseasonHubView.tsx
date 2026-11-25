import React, { useMemo } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Lock,
  Sparkles,
  Trophy,
  Unlock,
} from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { getOffseason8StepReadiness, OFFSEASON_8_STEPS } from '../engine/leagueLifeEngine';
import { getCurrentCareerDate } from '../engine/salaryCapEngine';
import { CareerSave } from '../types/kbo';
import { OffseasonFlowPanel } from './OffseasonFlowPanel';
import { TeamLogo } from './TeamLogo';

interface OffseasonHubViewProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onNavigateTab: (tab: 'roster' | 'contracts' | 'draft' | 'finances' | 'analytics' | 'awards' | 'home') => void;
  onSelectPlayer?: (playerId: string) => void;
}

export const OffseasonHubView: React.FC<OffseasonHubViewProps> = ({
  career,
  onUpdateCareer,
  onNavigateTab,
  onSelectPlayer,
}) => {
  const teamInfo = KBO_TEAMS[career.playerTeamId];
  const readiness = useMemo(() => getOffseason8StepReadiness(career), [career]);
  const currentDate = getCurrentCareerDate(career);
  const progressPct = Math.round(
    (readiness.requiredCompletedCount / Math.max(1, readiness.requiredTotalCount)) * 100
  );

  // 정규시즌/포스트시즌 중 오프시즌 전용 화면을 열었을 때의 안내 뷰
  if (career.phase !== 'OFFSEASON') {
    return (
      <div className="space-y-4">
        <div className="team-banner-grad rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-lg bg-white/15 border border-white/25 shrink-0">
              <TeamLogo teamId={career.playerTeamId} size="md" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-white/85 uppercase tracking-wide">
                STOVE LEAGUE · OFFSEASON FRONT OFFICE
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {teamInfo.name} 오프시즌 단장실
              </h1>
              <p className="text-xs text-white/85 mt-1">
                현재는 {career.season} 시즌 진행 중({currentDate.phaseLabel})입니다. 한국시리즈와 KBO 공식 시상식이 종료되면 오프시즌 8단계 단장 업무가 개방됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('home')}
            className="px-4 py-2 rounded-md bg-white text-slate-900 font-extrabold text-xs flex items-center gap-1.5 self-start sm:self-auto shrink-0"
          >
            <span>구단 홈으로 돌아가기</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-3">
          <div className="text-sm font-extrabold">오프시즌 단장 8단계 로드맵 (전 단계 완료 후 차기 시즌 개막)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {OFFSEASON_8_STEPS.map((st) => (
              <div
                key={st.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black team-accent-text">
                    {st.order}. {st.title}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      st.isRequired
                        ? 'team-accent-badge'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {st.isRequired ? '필수' : '선택'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {st.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 오프시즌 전용 단장실 헤더 배너 (구단 팀컬러 적용) */}
      <div className="team-banner-grad rounded-xl p-5 sm:p-6 shadow-md space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-lg bg-white/15 border border-white/25 shrink-0">
              <TeamLogo teamId={career.playerTeamId} size="md" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/15 border border-white/25 text-[11px] font-bold text-white">
                <CalendarClock className="w-3.5 h-3.5" />
                <span>
                  {career.season}–{career.season + 1} 스토브리그 · {currentDate.displayDate}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1 tracking-tight">
                {teamInfo.name} 오프시즌 단장실
              </h1>
              <p className="text-xs text-white/85 mt-0.5">
                오프시즌 필수 업무를 모두 완료하고 단장 최종 개막 승인을 마쳐야 {career.season + 1} 시즌 정규경기를 시작할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('awards')}
              className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-xs"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>{career.season} KBO 시상식 보기</span>
            </button>
          </div>
        </div>

        {/* 필수 오프시즌 완료 게이지 + 경기 잠금 상태 표시 */}
        <div className="bg-black/25 border border-white/15 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                {readiness.canApproveNextSeason ? (
                  <Unlock className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>
                  {readiness.canApproveNextSeason
                    ? `오프시즌 필수 업무 완료 — 8단계에서 ${career.season + 1}시즌 개막 최종 승인이 가능합니다!`
                    : `정규시즌 경기 잠금 중 — 필수 업무 ${readiness.requiredCompletedCount}/${readiness.requiredTotalCount}단계 완료`}
                </span>
              </span>
              <span className="font-mono-stats font-black text-white">{progressPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-emerald-300 to-emerald-400 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {OFFSEASON_8_STEPS.filter((s) => s.isRequired && s.id !== 'NEXT_SEASON_START').map((st) => {
              const done = readiness.completedSteps.includes(st.id);
              return (
                <span
                  key={st.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                    done
                      ? 'bg-emerald-500/25 border-emerald-300/60 text-emerald-100'
                      : 'bg-white/10 border-white/20 text-white/75'
                  }`}
                >
                  {done && <CheckCircle2 className="w-2.5 h-2.5" />}
                  <span>
                    {st.order}.{st.shortTitle}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* 시상식 미확인 상태면 상단에 강력한 시상식 입장 배너 표시 */}
      {readiness.awardsCeremonyPending && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-amber-900 dark:text-amber-200">
                {career.season} KBO 공식 시상식 확인 대기 중
              </div>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                한국시리즈 우승 확정 후 시상식 결과를 먼저 확인해야 오프시즌 최종 개막 승인이 해금됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('awards')}
            className="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shrink-0 flex items-center gap-1.5"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>KBO 시상식으로 이동</span>
          </button>
        </div>
      )}

      {/* 8단계 오프시즌 단장 업무 패널 */}
      <OffseasonFlowPanel
        career={career}
        onUpdateCareer={onUpdateCareer}
        onNavigateTab={(t) => onNavigateTab(t)}
        onSelectPlayer={onSelectPlayer}
      />
    </div>
  );
};
