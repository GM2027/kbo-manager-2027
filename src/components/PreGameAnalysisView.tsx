import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Flame,
  HeartPulse,
  MapPin,
  Play,
  Shield,
  SkipForward,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  buildPreGameAnalysis,
  BullpenAvailability,
  PreGameBatterRow,
  PreGameStarterComparison,
  SplitRecord,
} from '../engine/preGameAnalysisEngine';
import { formatRate2, formatRate3 } from '../engine/stats';
import { CareerSave, LockedGameLineupPlan } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface PreGameAnalysisViewProps {
  career: CareerSave;
  pendingMode: 'game' | 'series' | 'postseason';
  onStartSingleGame: (lockedPlan: LockedGameLineupPlan) => void;
  onStartSeries: (lockedPlan: LockedGameLineupPlan) => void;
  onSkipAnalysis: (lockedPlan: LockedGameLineupPlan) => void;
  onEditMyLineup: () => void;
  onSelectPlayer: (playerId: string) => void;
  onBackToHome: () => void;
}

function formatSplit(r: SplitRecord): string {
  return `${r.wins}승 ${r.losses}패${r.draws > 0 ? ` ${r.draws}무` : ''}`;
}

function getStaminaBarColor(pct: number): string {
  if (pct >= 75) return 'bg-emerald-500';
  if (pct >= 45) return 'bg-amber-500';
  return 'bg-rose-500';
}

function getBullpenBadgeClass(avail: BullpenAvailability): string {
  switch (avail) {
    case '가용':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35';
    case '주의(연투)':
    case '주의(피로)':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35';
    case '휴식권장':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35';
  }
}

const StarterCard: React.FC<{
  title: string;
  teamId: CareerSave['playerTeamId'];
  starter: PreGameStarterComparison;
  isMyTeam: boolean;
  onSelectPlayer: (id: string) => void;
}> = ({ title, teamId, starter, isMyTeam, onSelectPlayer }) => {
  const formCls =
    starter.form >= 2
      ? 'text-emerald-600 dark:text-emerald-400'
      : starter.form <= -2
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-500 dark:text-slate-400';

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        isMyTeam
          ? 'team-accent-border bg-white dark:bg-slate-900'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <TeamLogo teamId={teamId} size="sm" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>{title}</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
                {starter.usageType}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectPlayer(starter.player.id)}
              className="text-base font-black tracking-tight text-slate-900 dark:text-white hover:underline text-left truncate block"
            >
              {starter.player.name}{' '}
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                ({starter.throwsLabel} · {starter.velocityKmh}km/h)
              </span>
            </button>
          </div>
        </div>
        <div className="text-right shrink-0 font-mono-stats">
          <div className="px-2 py-0.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-black">
            OVR {starter.ability}
          </div>
          <div className={`text-[11px] font-bold mt-0.5 ${formCls}`}>
            컨디션 {starter.form >= 0 ? `+${starter.form}` : starter.form}
          </div>
        </div>
      </div>

      {/* Season Pitching Stat Grid */}
      <div className="grid grid-cols-5 gap-1.5 text-center font-mono-stats">
        <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800">
          <div className="text-[10px] font-sans text-slate-500">ERA</div>
          <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5">
            {formatRate2(starter.era)}
          </div>
        </div>
        <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800">
          <div className="text-[10px] font-sans text-slate-500">승-패</div>
          <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5">
            {starter.wins}-{starter.losses}
          </div>
        </div>
        <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800">
          <div className="text-[10px] font-sans text-slate-500">탈삼진</div>
          <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5">
            {starter.so}
          </div>
        </div>
        <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800">
          <div className="text-[10px] font-sans text-slate-500">WHIP</div>
          <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5">
            {formatRate2(starter.whip)}
          </div>
        </div>
        <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800">
          <div className="text-[10px] font-sans text-slate-500">이닝</div>
          <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5">
            {starter.ip}
          </div>
        </div>
      </div>

      {/* Ratings & Stamina Bar */}
      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono-stats">
        <div>
          <div className="flex justify-between text-slate-500 mb-0.5">
            <span className="font-sans">구위</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{starter.stuff}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${starter.stuff}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-slate-500 mb-0.5">
            <span className="font-sans">제구</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{starter.control}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full" style={{ width: `${starter.control}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-slate-500 mb-0.5">
            <span className="font-sans">지구력</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{starter.staminaRating}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full" style={{ width: `${starter.staminaRating}%` }} />
          </div>
        </div>
      </div>

      <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            등판 체력 · 휴식 {starter.restDays >= 7 ? '충분(7일+)' : `${starter.restDays}일`}
          </span>
          <span className="font-mono-stats font-black text-slate-900 dark:text-white">
            {starter.staminaRemainingPct}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${getStaminaBarColor(starter.staminaRemainingPct)}`}
            style={{ width: `${starter.staminaRemainingPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const LineupTable: React.FC<{
  title: string;
  teamId: CareerSave['playerTeamId'];
  rows: PreGameBatterRow[];
  notes: string[];
  isMyTeam: boolean;
  onSelectPlayer: (id: string) => void;
  onEditMyLineup?: () => void;
}> = ({ title, teamId, rows, notes, isMyTeam, onSelectPlayer, onEditMyLineup }) => (
  <div className="gm-card overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/80">
      <div className="flex items-center gap-2 min-w-0">
        <TeamLogo teamId={teamId} size="xs" />
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          실제 출전 일치
        </span>
        {isMyTeam && onEditMyLineup && (
          <button
            type="button"
            onClick={onEditMyLineup}
            className="px-2 py-1 rounded border team-accent-border team-accent-text text-[11px] font-bold hover:opacity-85 inline-flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span>라인업 수정</span>
          </button>
        )}
      </div>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left font-mono-stats">
        <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-2 px-2.5 font-sans font-semibold w-9 text-center">타순</th>
            <th className="py-2 px-2 font-sans font-semibold">선수</th>
            <th className="py-2 px-1.5 font-sans font-semibold text-center">포지션</th>
            <th className="py-2 px-1.5 font-sans font-semibold text-right">OVR</th>
            <th className="py-2 px-1.5 font-sans font-semibold text-right">타율</th>
            <th className="py-2 px-1.5 font-sans font-semibold text-right">홈런</th>
            <th className="py-2 px-1.5 font-sans font-semibold text-right">타점</th>
            <th className="py-2 px-1.5 font-sans font-semibold text-right">출루율</th>
            <th className="py-2 px-2.5 font-sans font-semibold text-right">OPS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {rows.map((row) => (
            <tr
              key={row.player.id}
              data-testid={isMyTeam ? `pregame-my-lineup-${row.battingOrder}` : `pregame-opp-lineup-${row.battingOrder}`}
              data-player-id={row.player.id}
              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
            >
              <td className="py-2 px-2.5 text-center font-black text-slate-500 dark:text-slate-400">
                {row.battingOrder}
              </td>
              <td className="py-2 px-2 font-sans">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(row.player.id)}
                    className="font-bold text-slate-900 dark:text-slate-100 hover:underline truncate text-left"
                  >
                    {row.player.name}
                  </button>
                  <span className="text-[10px] text-slate-400 shrink-0">{row.batsLabel.slice(0, 1)}</span>
                  {row.isHot && (
                    <span
                      className="text-[10px] px-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold shrink-0"
                      title={`최근 상승세 (컨디션 ${row.form >= 0 ? `+${row.form}` : row.form})`}
                    >
                      상승
                    </span>
                  )}
                  {row.isCold && (
                    <span
                      className="text-[10px] px-1 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold shrink-0"
                      title={`최근 하락세 (컨디션 ${row.form})`}
                    >
                      하락
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2 px-1.5 text-center">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    row.position === 'DH'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {row.position}
                </span>
              </td>
              <td className="py-2 px-1.5 text-right font-bold text-slate-900 dark:text-white">
                {row.ability}
              </td>
              <td className="py-2 px-1.5 text-right text-slate-700 dark:text-slate-300">
                {formatRate3(row.avg)}
              </td>
              <td className="py-2 px-1.5 text-right text-slate-700 dark:text-slate-300">{row.hr}</td>
              <td className="py-2 px-1.5 text-right text-slate-700 dark:text-slate-300">{row.rbi}</td>
              <td className="py-2 px-1.5 text-right text-slate-700 dark:text-slate-300">
                {formatRate3(row.obp)}
              </td>
              <td
                className={`py-2 px-2.5 text-right font-bold ${
                  row.ops !== null && row.ops >= 0.85
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : row.ops !== null && row.ops <= 0.63
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {formatRate3(row.ops)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {notes.length > 0 && (
      <div className="px-4 py-2 bg-slate-50/80 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
        {notes.slice(0, 3).map((n, i) => (
          <div key={i}>• {n}</div>
        ))}
      </div>
    )}
  </div>
);

export const PreGameAnalysisView: React.FC<PreGameAnalysisViewProps> = ({
  career,
  pendingMode,
  onStartSingleGame,
  onStartSeries,
  onSkipAnalysis,
  onEditMyLineup,
  onSelectPlayer,
  onBackToHome,
}) => {
  const analysis = useMemo(() => buildPreGameAnalysis(career), [career]);

  if (!analysis) {
    return (
      <div className="gm-card p-8 text-center space-y-3">
        <Trophy className="w-8 h-8 mx-auto team-accent-text" />
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
          현재 예정된 경기 전 전력 분석 대상이 없습니다
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          정규시즌 144경기가 종료되었거나 오프시즌/타 구단 포스트시즌 단계입니다.
        </p>
        <button
          type="button"
          onClick={onBackToHome}
          className="px-4 py-2 rounded-lg team-accent-btn text-xs font-bold"
        >
          구단 홈으로 돌아가기
        </button>
      </div>
    );
  }

  const myTeamInfo = KBO_TEAMS[analysis.myTeamId];
  const oppTeamInfo = KBO_TEAMS[analysis.oppTeamId];

  const renderLast5Pills = (last5: ('W' | 'L' | 'D')[]) => {
    if (last5.length === 0) {
      return <span className="text-[11px] text-slate-400">개막 전</span>;
    }
    return (
      <div className="flex items-center gap-1">
        {last5.map((r, i) => (
          <span
            key={i}
            className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
              r === 'W'
                ? 'bg-emerald-500 text-white'
                : r === 'L'
                ? 'bg-rose-500 text-white'
                : 'bg-slate-500 text-white'
            }`}
          >
            {r === 'W' ? '승' : r === 'L' ? '패' : '무'}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="pregame-analysis-screen">
      {/* Top Action & Approval Control Bar */}
      <div className="gm-card p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-l-4 team-accent-border">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold team-accent-text">
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span>경기 전 상대 구단 전력 분석 · 단장 출격 승인 대기</span>
            {analysis.rivalryName && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30 inline-flex items-center gap-1 text-[10px]">
                <Flame className="w-3 h-3" />
                {analysis.rivalryName} (열기 {analysis.rivalryIntensity})
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            전력 분석을 확인하고 필요 시 우리 구단 라인업을 수정하세요. 아래 실행 버튼을 누르기 전까지 경기는 자동 진행되지 않습니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="pregame-edit-lineup-btn"
            onClick={onEditMyLineup}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
            <span>우리 구단 라인업 수정</span>
          </button>

          <button
            type="button"
            data-testid="pregame-start-game-btn"
            onClick={() => onStartSingleGame(analysis.lockedPlan)}
            className="px-4 py-2 rounded-lg team-accent-btn text-xs font-black inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>경기 시작</span>
          </button>

          {!analysis.isPostseason && (
            <button
              type="button"
              data-testid="pregame-start-series-btn"
              onClick={() => onStartSeries(analysis.lockedPlan)}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>시리즈 진행 ({analysis.remainingSeriesGames}경기)</span>
            </button>
          )}

          <button
            type="button"
            data-testid="pregame-skip-analysis-btn"
            onClick={() => onSkipAnalysis(analysis.lockedPlan)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            title={
              pendingMode === 'series' && !analysis.isPostseason
                ? '분석을 건너뛰고 즉시 시리즈 진행'
                : '분석을 건너뛰고 즉시 1경기 시작'
            }
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>분석 건너뛰기</span>
          </button>
        </div>
      </div>

      {/* Matchup Header Banner + Win Probability */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-900 via-[#101c33] to-slate-950 text-white overflow-hidden shadow-md">
        <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-bold text-slate-200">
            <span className="px-2 py-0.5 rounded bg-white/15 text-amber-300 font-mono-stats">
              {analysis.isPostseason
                ? analysis.postseasonLabel
                : `${analysis.season} 정규시즌 · ${analysis.seriesGameNumber + analysis.remainingSeriesGames - 1}연전 ${analysis.seriesGameNumber}차전`}
            </span>
            <span className="inline-flex items-center gap-1 font-mono-stats">
              <CalendarDays className="w-3.5 h-3.5 text-sky-300" />
              {analysis.displayDate}
            </span>
            <span className="opacity-40">|</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-300" />
              {analysis.stadium}
              <span className="text-[11px] text-slate-300 font-mono-stats">
                ({analysis.parkLabel} {analysis.parkFactor.toFixed(2)})
              </span>
            </span>
          </div>
          <div className="text-[11px] font-mono-stats text-slate-300">
            올 시즌 상대 전적:{' '}
            <strong className="text-white">
              {myTeamInfo.shortName} {formatSplit(analysis.myForm.h2hRecord)}
            </strong>
            {analysis.myForm.h2hRecord.wins + analysis.myForm.h2hRecord.losses + analysis.myForm.h2hRecord.draws > 0 && (
              <span className="text-slate-400 ml-1">
                (득점 {analysis.myForm.h2hRecord.runsFor} : 실점 {analysis.myForm.h2hRecord.runsAgainst})
              </span>
            )}
          </div>
        </div>

        {/* Team vs Team Grid */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
          {/* My Team */}
          <div className="md:col-span-4 flex flex-col items-center md:items-start text-center md:text-left gap-2">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-xl bg-white shadow">
                <TeamLogo teamId={analysis.myTeamId} size="md" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-sky-500/25 text-sky-200 border border-sky-400/30">
                    우리 구단 · {analysis.isMyTeamHome ? '홈' : '원정'}
                  </span>
                  <span className="text-[11px] font-mono-stats text-amber-300 font-bold">
                    {analysis.myStanding.games > 0
                      ? `${analysis.myStanding.isTied ? '공동 ' : ''}${analysis.myStanding.rank}위`
                      : '개막 대기'}
                  </span>
                </div>
                <div className="text-lg font-black tracking-tight mt-0.5">{myTeamInfo.name}</div>
                <div className="text-xs font-mono-stats text-slate-300">
                  {analysis.myStanding.wins}승 {analysis.myStanding.losses}패
                  {analysis.myStanding.draws > 0 ? ` ${analysis.myStanding.draws}무` : ''}{' '}
                  <span className="text-slate-400 whitespace-nowrap">
                    ({analysis.myStanding.games > 0 ? analysis.myStanding.pct.toFixed(3) : '.000'}) ·{' '}
                    {analysis.myForm.streak}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
              <span className="text-slate-400">최근 5G</span>
              {renderLast5Pills(analysis.myForm.last5)}
            </div>
            <div className="text-[11px] font-mono-stats text-slate-400">
              홈 {formatSplit(analysis.myForm.homeRecord)} · 원정 {formatSplit(analysis.myForm.awayRecord)}
            </div>
          </div>

          {/* Center Predicted Win Probability */}
          <div className="md:col-span-3 flex flex-col items-center justify-center space-y-2.5 py-2 px-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-[11px] font-extrabold tracking-wider uppercase text-amber-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              <span>예상 승리 확률</span>
            </div>
            <div className="w-full flex items-baseline justify-between font-mono-stats">
              <div className="text-left">
                <div className="text-2xl font-black text-sky-300">{analysis.winProbability.myWinPct}%</div>
                <div className="text-[10px] text-slate-300">{myTeamInfo.shortName}</div>
              </div>
              <div className="text-xs font-black text-slate-400">VS</div>
              <div className="text-right">
                <div className="text-2xl font-black text-rose-300">{analysis.winProbability.oppWinPct}%</div>
                <div className="text-[10px] text-slate-300">{oppTeamInfo.shortName}</div>
              </div>
            </div>
            <div className="w-full h-2.5 rounded-full bg-rose-500/80 overflow-hidden flex">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{ width: `${analysis.winProbability.myWinPct}%` }}
              />
            </div>
            <div className="flex flex-wrap justify-center gap-1 pt-0.5">
              {analysis.winProbability.factors
                .filter((f) => Math.abs(f.delta) >= 0.4)
                .slice(0, 4)
                .map((f) => (
                  <span
                    key={f.label}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono-stats ${
                      f.delta > 0
                        ? 'bg-sky-500/20 text-sky-200'
                        : 'bg-rose-500/20 text-rose-200'
                    }`}
                  >
                    {f.label} {f.delta > 0 ? `+${f.delta}%` : `${f.delta}%`}
                  </span>
                ))}
            </div>
          </div>

          {/* Opponent Team */}
          <div className="md:col-span-4 flex flex-col items-center md:items-end text-center md:text-right gap-2">
            <div className="flex items-center gap-3 flex-row-reverse md:flex-row">
              <div>
                <div className="flex items-center justify-center md:justify-end gap-1.5">
                  <span className="text-[11px] font-mono-stats text-amber-300 font-bold">
                    {analysis.oppStanding.games > 0
                      ? `${analysis.oppStanding.isTied ? '공동 ' : ''}${analysis.oppStanding.rank}위`
                      : '개막 대기'}
                  </span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 border border-rose-400/30">
                    상대 구단 · {analysis.isMyTeamHome ? '원정' : '홈'}
                  </span>
                </div>
                <div className="text-lg font-black tracking-tight mt-0.5">{oppTeamInfo.name}</div>
                <div className="text-xs font-mono-stats text-slate-300">
                  {analysis.oppStanding.wins}승 {analysis.oppStanding.losses}패
                  {analysis.oppStanding.draws > 0 ? ` ${analysis.oppStanding.draws}무` : ''}{' '}
                  <span className="text-slate-400 whitespace-nowrap">
                    ({analysis.oppStanding.games > 0 ? analysis.oppStanding.pct.toFixed(3) : '.000'}) ·{' '}
                    {analysis.oppForm.streak}
                  </span>
                </div>
              </div>
              <div className="p-1.5 rounded-xl bg-white shadow">
                <TeamLogo teamId={analysis.oppTeamId} size="md" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
              <span className="text-slate-400">최근 5G</span>
              {renderLast5Pills(analysis.oppForm.last5)}
            </div>
            <div className="text-[11px] font-mono-stats text-slate-400">
              홈 {formatSplit(analysis.oppForm.homeRecord)} · 원정 {formatSplit(analysis.oppForm.awayRecord)}
            </div>
          </div>
        </div>
      </div>

      {/* Starting Pitcher Comparison + 5-Axis Power Comparison */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Activity className="w-4 h-4 team-accent-text" />
              <span>선발투수 매치업 비교</span>
            </h2>
            <span className="text-[11px] text-slate-500">선수명 클릭 시 상세 프로필·사진 확인</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <StarterCard
              title={`${myTeamInfo.shortName} 선발`}
              teamId={analysis.myTeamId}
              starter={analysis.myStarter}
              isMyTeam
              onSelectPlayer={onSelectPlayer}
            />
            <StarterCard
              title={`${oppTeamInfo.shortName} 선발`}
              teamId={analysis.oppTeamId}
              starter={analysis.oppStarter}
              isMyTeam={false}
              onSelectPlayer={onSelectPlayer}
            />
          </div>
        </div>

        {/* 5-Axis Team Power Comparison */}
        <div className="xl:col-span-5 gm-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Shield className="w-4 h-4 team-accent-text" />
              <span>5대 전력 부문 비교</span>
            </h2>
            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className="text-sky-600 dark:text-sky-400">{myTeamInfo.shortName}</span>
              <span className="text-slate-400">vs</span>
              <span className="text-rose-600 dark:text-rose-400">{oppTeamInfo.shortName}</span>
            </div>
          </div>

          <div className="space-y-3">
            {analysis.powerComparison.map((cat) => {
              const total = Math.max(1, cat.myScore + cat.oppScore);
              const myBarPct = Math.round((cat.myScore / total) * 100);
              return (
                <div key={cat.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-slate-800 dark:text-slate-100">{cat.label}</span>
                      <span className="text-[10px] text-slate-400 hidden sm:inline">{cat.detailNote}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono-stats">
                      <span className="font-black text-sky-600 dark:text-sky-400">{cat.myScore}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          cat.advantage === 'MY'
                            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            : cat.advantage === 'OPP'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {cat.diff > 0 ? `+${cat.diff}` : cat.diff === 0 ? '동률' : cat.diff}
                      </span>
                      <span className="font-black text-rose-600 dark:text-rose-400">{cat.oppScore}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-rose-500/75 overflow-hidden flex">
                    <div
                      className="h-full bg-sky-500 transition-all duration-300"
                      style={{ width: `${myBarPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Both Teams' 1~9 Starting Lineups */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <LineupTable
          title={`${myTeamInfo.shortName} 선발 라인업 (1~9번)`}
          teamId={analysis.myTeamId}
          rows={analysis.myLineup}
          notes={analysis.myLineupNotes}
          isMyTeam
          onSelectPlayer={onSelectPlayer}
          onEditMyLineup={onEditMyLineup}
        />
        <LineupTable
          title={`${oppTeamInfo.shortName} AI 예상 선발 라인업 (1~9번)`}
          teamId={analysis.oppTeamId}
          rows={analysis.oppLineup}
          notes={analysis.oppLineupNotes}
          isMyTeam={false}
          onSelectPlayer={onSelectPlayer}
        />
      </div>

      {/* Opponent Bullpen Availability + Injuries + Key/Hot/Cold Players */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Opponent Bullpen Status */}
        <div className="xl:col-span-7 gm-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {oppTeamInfo.shortName} 불펜투수 체력 및 가용 현황
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono-stats">
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                가용 {analysis.oppBullpenSummary.available}
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold">
                주의 {analysis.oppBullpenSummary.caution}
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold">
                휴식권장 {analysis.oppBullpenSummary.restRecommended}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left font-mono-stats">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                <tr>
                  <th className="py-2 px-3 font-sans font-semibold">보직</th>
                  <th className="py-2 px-2 font-sans font-semibold">투수</th>
                  <th className="py-2 px-2 font-sans font-semibold text-right">OVR</th>
                  <th className="py-2 px-2 font-sans font-semibold text-right">ERA</th>
                  <th className="py-2 px-2 font-sans font-semibold text-right">WHIP</th>
                  <th className="py-2 px-2 font-sans font-semibold w-28">체력</th>
                  <th className="py-2 px-2 font-sans font-semibold text-center">연투/3일</th>
                  <th className="py-2 px-3 font-sans font-semibold text-right">가용 여부</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {analysis.oppBullpen.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400 font-sans">
                      등록된 1군 불펜 투수가 없습니다.
                    </td>
                  </tr>
                ) : (
                  analysis.oppBullpen.map((bp) => (
                    <tr key={bp.player.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-sans">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          {bp.role}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-sans">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(bp.player.id)}
                          className="font-bold text-slate-900 dark:text-slate-100 hover:underline text-left"
                        >
                          {bp.player.name}
                        </button>
                      </td>
                      <td className="py-2 px-2 text-right font-bold">{bp.ability}</td>
                      <td className="py-2 px-2 text-right">{formatRate2(bp.era)}</td>
                      <td className="py-2 px-2 text-right">{formatRate2(bp.whip)}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getStaminaBarColor(bp.staminaPct)}`}
                              style={{ width: `${bp.staminaPct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold w-8 text-right">{bp.staminaPct}%</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center text-[11px] text-slate-600 dark:text-slate-300">
                        {bp.consecutiveDays}일 / {bp.recent3DayPitches}구
                      </td>
                      <td className="py-2 px-3 text-right font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${getBullpenBadgeClass(
                            bp.availability
                          )}`}
                          title={bp.availabilityReason}
                        >
                          {bp.availability}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Opponent Injured List + Key & Hot/Cold Players */}
        <div className="xl:col-span-5 space-y-4">
          {/* Opponent Injuries */}
          <div className="gm-card p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>{oppTeamInfo.shortName} 부상자 현황</span>
              </h3>
              <span className="text-[11px] font-mono-stats font-bold text-slate-500">
                {analysis.oppInjuries.length}명
              </span>
            </div>

            {analysis.oppInjuries.length === 0 ? (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                현재 {oppTeamInfo.shortName} 구단에 등록된 부상자가 없습니다. 풀전력으로 맞붙습니다.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {analysis.oppInjuries.map((inj) => (
                  <div
                    key={inj.player.id}
                    className="p-2.5 rounded-lg border border-rose-500/25 bg-rose-50/40 dark:bg-rose-950/20 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(inj.player.id)}
                          className="font-bold text-slate-900 dark:text-white hover:underline truncate"
                        >
                          {inj.player.name}
                        </button>
                        <span className="px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-800 text-[10px] font-bold">
                          {inj.position} · {inj.ability}
                        </span>
                        {inj.isCore && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[10px] font-bold">
                            주축
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                        {inj.description}
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono-stats">
                      <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                        {inj.severity}
                      </div>
                      <div className="text-[10px] text-slate-500">잔여 {inj.daysRemaining}일</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Opponent Key / Hot / Cold Players */}
          <div className="gm-card p-4 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{oppTeamInfo.shortName} 주요 선수 · 상승세 · 하락세</span>
            </h3>

            {/* Key Players */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500">핵심 경계 선수</div>
              {analysis.oppKeyPlayers.map((kp) => (
                <div
                  key={`key-${kp.player.id}`}
                  className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold shrink-0">
                        {kp.tag}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(kp.player.id)}
                        className="font-bold text-slate-900 dark:text-white hover:underline truncate"
                      >
                        {kp.player.name}
                      </button>
                      <span className="text-[10px] font-mono-stats text-slate-500">
                        OVR {kp.player.ability}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-stats text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                      {kp.statLine}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Hot & Cold Split */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>최근 상승세</span>
                </div>
                {analysis.oppHotPlayers.length === 0 ? (
                  <div className="text-[11px] text-slate-400 p-2 rounded bg-slate-50 dark:bg-slate-950/60">
                    뚜렷한 상승세 선수 없음
                  </div>
                ) : (
                  analysis.oppHotPlayers.map((hp) => (
                    <div
                      key={`hot-${hp.player.id}`}
                      className="p-2 rounded border border-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-950/20 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(hp.player.id)}
                          className="font-bold text-slate-900 dark:text-white hover:underline truncate"
                        >
                          {hp.player.name} ({hp.player.position})
                        </button>
                        <span className="font-mono-stats font-bold text-emerald-600 dark:text-emerald-400">
                          {hp.form >= 0 ? `+${hp.form}` : hp.form}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono-stats text-slate-600 dark:text-slate-400 truncate mt-0.5">
                        {hp.statLine}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>최근 하락세</span>
                </div>
                {analysis.oppColdPlayers.length === 0 ? (
                  <div className="text-[11px] text-slate-400 p-2 rounded bg-slate-50 dark:bg-slate-950/60">
                    뚜렷한 슬럼프 선수 없음
                  </div>
                ) : (
                  analysis.oppColdPlayers.map((cp) => (
                    <div
                      key={`cold-${cp.player.id}`}
                      className="p-2 rounded border border-rose-500/25 bg-rose-50/40 dark:bg-rose-950/20 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(cp.player.id)}
                          className="font-bold text-slate-900 dark:text-white hover:underline truncate"
                        >
                          {cp.player.name} ({cp.player.position})
                        </button>
                        <span className="font-mono-stats font-bold text-rose-600 dark:text-rose-400">
                          {cp.form}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono-stats text-slate-600 dark:text-slate-400 truncate mt-0.5">
                        {cp.statLine}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auto Strengths & Weaknesses + Coaching Staff Pre-Game Report */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Opponent Strengths & Weaknesses */}
        <div className="xl:col-span-5 gm-card p-4 space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            {oppTeamInfo.shortName} 강점 · 약점 자동 분석
          </h3>

          <div className="space-y-2">
            <div className="p-3 rounded-lg border border-rose-500/25 bg-rose-50/40 dark:bg-rose-950/20 space-y-1.5">
              <div className="text-xs font-extrabold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>경계해야 할 상대 강점</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                {analysis.oppStrengths.map((s, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-lg border border-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
              <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>공략 가능한 상대 약점</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                {analysis.oppWeaknesses.map((w, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Manager & Coaching Staff Pre-Game Report */}
        <div className="xl:col-span-7 gm-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 team-accent-text" />
              <span>감독 및 코칭스태프 경기 전 분석 리포트</span>
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {analysis.coachingReport.managerName} 감독 · {analysis.coachingReport.managerStyle}
            </span>
          </div>

          <div className="p-3 rounded-lg border team-accent-border team-accent-soft text-xs text-slate-800 dark:text-slate-100 leading-relaxed">
            <div className="font-extrabold team-accent-text mb-1">
              {analysis.coachingReport.managerName} 감독 총평
            </div>
            {analysis.coachingReport.overallSummary}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
              <div className="font-extrabold text-indigo-700 dark:text-indigo-300">
                {analysis.coachingReport.pitchCoachName} (투수 파트)
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {analysis.coachingReport.pitchingPlan}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
              <div className="font-extrabold text-amber-700 dark:text-amber-300">
                {analysis.coachingReport.hitCoachName} (타격 파트)
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {analysis.coachingReport.battingPlan}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
              <div className="font-extrabold text-emerald-700 dark:text-emerald-300">
                {analysis.coachingReport.defenseCoachName} · {analysis.coachingReport.batteryCoachName}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {analysis.coachingReport.defenseAndBaserunningNote}
              </p>
            </div>
          </div>

          <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-xs flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-slate-700 dark:text-slate-200">핵심 승부처:</span>
            <span className="text-slate-800 dark:text-slate-100 font-semibold">
              {analysis.coachingReport.keyMatchup}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Action Confirmation Bar */}
      <div className="gm-card p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          라인업과 선발투수 구성을 확인했습니다. 원하시는 진행 방식을 선택하세요.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEditMyLineup}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
            <span>우리 구단 라인업 수정</span>
          </button>
          <button
            type="button"
            onClick={() => onStartSingleGame(analysis.lockedPlan)}
            className="px-4 py-2 rounded-lg team-accent-btn text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>경기 시작</span>
          </button>
          {!analysis.isPostseason && (
            <button
              type="button"
              onClick={() => onStartSeries(analysis.lockedPlan)}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>시리즈 진행 ({analysis.remainingSeriesGames}경기)</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onSkipAnalysis(analysis.lockedPlan)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>분석 건너뛰기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
