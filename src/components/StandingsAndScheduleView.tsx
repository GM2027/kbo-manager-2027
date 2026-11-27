import React, { useEffect, useState } from 'react';
import { Award, Calendar, Crown, Flame, Play, Trophy } from 'lucide-react';
import { KBO_TEAMS, normalizeChampionHistory, TEAM_IDS } from '../data/kboTeams';
import {
  ensureRivalryState,
  getRivalryEffectProfile,
  getRivalryOpponent,
  getRivalryRecordForTeam,
  getRivalryTier,
  getRivalryTierLabel,
  getTeamRivalries,
  toggleUserFocusRivalry,
} from '../engine/rivalryEngine';
import { computeStandings } from '../engine/stats';
import { CareerSave, PostseasonRound, TeamId } from '../types/kbo';
import { LeaderboardsView } from './LeaderboardsView';
import { AnnualKboCalendarView } from './AnnualKboCalendarView';
import { TeamLogo } from './TeamLogo';

interface StandingsAndScheduleViewProps {
  career: CareerSave;
  onSimulateNextSeries: () => void;
  onSimulatePostseasonGame: () => void;
  onUpdateCareer?: (next: CareerSave, backup?: CareerSave) => void;
  onNotify?: (msg: string, tone?: 'info' | 'success' | 'error') => void;
  onSelectPlayer?: (playerId: string) => void;
  initialSubTab?: 'standings' | 'leaders' | 'calendar';
}

const PS_ROUNDS: { round: PostseasonRound; title: string; rule: string }[] = [
  { round: 'WILDCARD', title: '와일드카드 결정전', rule: '4위 1승(무승부 포함) / 5위 2승' },
  { round: 'SEMI_PO', title: '준플레이오프', rule: '5전 3선승제 (3위 vs WC승)' },
  { round: 'PO', title: '플레이오프', rule: '5전 3선승제 (2위 vs 준PO승)' },
  { round: 'KOREAN_SERIES', title: '한국시리즈', rule: '7전 4선승제 (1위 vs PO승)' },
];

export const StandingsAndScheduleView: React.FC<StandingsAndScheduleViewProps> = ({
  career,
  onSimulateNextSeries,
  onSimulatePostseasonGame,
  onUpdateCareer,
  onNotify,
  onSelectPlayer,
  initialSubTab = 'standings',
}) => {
  const [viewMode, setViewMode] = useState<'standings' | 'leaders' | 'calendar'>(initialSubTab);
  useEffect(() => {
    setViewMode(initialSubTab);
  }, [initialSubTab]);
  const [filterTeam, setFilterTeam] = useState<TeamId | 'ALL'>(career.playerTeamId);
  const [rivalryScope, setRivalryScope] = useState<'MY' | 'ALL'>('MY');
  const [customRivalTarget, setCustomRivalTarget] = useState<TeamId>(
    TEAM_IDS.find((t) => t !== career.playerTeamId) ?? 'LG'
  );
  const standings = computeStandings(career.gamesLedger);
  const standingsMap = Object.fromEntries(standings.map((r) => [r.teamId, r]));
  const allRivalries = [...ensureRivalryState(career)].sort(
    (a, b) => (b.userFocused ? 1 : 0) - (a.userFocused ? 1 : 0) || b.intensity - a.intensity
  );
  const myRivalries = getTeamRivalries(career, career.playerTeamId);
  const displayedRivalries = rivalryScope === 'MY' ? myRivalries : allRivalries;

  const handleToggleFocusRival = (targetTeamId: TeamId) => {
    if (!onUpdateCareer) return;
    try {
      const { nextCareer, message } = toggleUserFocusRivalry(career, targetTeamId);
      onUpdateCareer(nextCareer);
      onNotify?.(message, 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : '라이벌 지정 오류', 'error');
    }
  };

  const nextSeries = career.schedule[career.currentSeriesIndex];
  const ps = career.postseason;
  const championHistory = normalizeChampionHistory(career.championHistory);

  const myNextMatchup = nextSeries?.matchups.find(
    (m) => m.away === career.playerTeamId || m.home === career.playerTeamId
  );

  const getProjectedStarter = (tid: TeamId) => {
    const ts = career.teams[tid];
    if (!ts || ts.rotationOrder.length === 0) return null;
    const pid = ts.rotationOrder[ts.nextStarterIdx % ts.rotationOrder.length];
    return career.players[pid] ?? null;
  };

  const filteredGames = [...career.gamesLedger]
    .filter((g) => (filterTeam === 'ALL' ? true : g.awayTeam === filterTeam || g.homeTeam === filterTeam))
    .sort((a, b) => b.round - a.round || b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      {/* 통합 세그먼트: 순위 · 일정 | 리그 타이틀 TOP 10 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setViewMode('standings')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            viewMode === 'standings'
              ? 'team-accent-bg shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>순위 · 일정 · 라이벌전</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('leaders')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            viewMode === 'leaders'
              ? 'team-accent-bg shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>리그 타이틀 TOP 10</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('calendar')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            viewMode === 'calendar'
              ? 'team-accent-bg shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>연간 캘린더 · 공식 일정</span>
        </button>
      </div>

      {viewMode === 'leaders' ? (
        <LeaderboardsView career={career} onSelectPlayer={onSelectPlayer} />
      ) : viewMode === 'calendar' ? (
        <AnnualKboCalendarView
          career={career}
          onUpdateCareer={onUpdateCareer}
          onNotify={onNotify}
        />
      ) : (
      <div className="space-y-4">
      {/* Postseason Stepladder Bracket Banner if active or finished */}
      {(career.phase === 'POSTSEASON' || ps.seriesHistory.length > 0 || ps.champion) && (
        <div className="border team-accent-surface rounded-md p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold team-accent-text">
                {career.season} KBO 포스트시즌 · 4단계 스텝래더 (1경기 단위 진행)
              </div>
              <h3 className="text-base font-extrabold mt-0.5 flex items-center gap-2">
                {ps.champion ? (
                  <>
                    <TeamLogo teamId={ps.champion} size="sm" />
                    <span>
                      {career.season} 한국시리즈 우승: {KBO_TEAMS[ps.champion].name}
                    </span>
                  </>
                ) : ps.currentSeries ? (
                  <span>{ps.currentSeries.label}</span>
                ) : (
                  <span>포스트시즌 종료</span>
                )}
              </h3>
            </div>
            {career.phase === 'POSTSEASON' && ps.currentSeries && (
              <button
                type="button"
                onClick={onSimulatePostseasonGame}
                className="px-4 py-2 text-xs font-bold rounded team-accent-btn flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Play className="w-3.5 h-3.5" />
                <span>포스트시즌 다음 1경기 진행</span>
              </button>
            )}
          </div>

          {ps.currentSeries && (
            <div className="p-3 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm font-mono-stats">
              <div className="flex items-center gap-2">
                <TeamLogo teamId={ps.currentSeries.higherSeedTeam} size="sm" />
                <span className="font-sans font-bold">
                  {ps.currentSeries.higherSeedRank}위 {KBO_TEAMS[ps.currentSeries.higherSeedTeam].shortName}
                </span>
              </div>
              <div className="text-center">
                <div className="text-lg font-extrabold">
                  {ps.currentSeries.higherWins} : {ps.currentSeries.lowerWins}
                </div>
                <div className="text-[10px] font-sans text-slate-500">
                  {ps.currentSeries.games.length + 1}차전 대기
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-sans font-bold">
                  {ps.currentSeries.lowerSeedRank}위 {KBO_TEAMS[ps.currentSeries.lowerSeedTeam].shortName}
                </span>
                <TeamLogo teamId={ps.currentSeries.lowerSeedTeam} size="sm" />
              </div>
            </div>
          )}

          {ps.champion && ps.ksMvp && (
            <div className="p-3 rounded bg-white dark:bg-slate-900 border border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-bold">
                <Crown className="w-4 h-4 text-amber-500" />
                <span>
                  한국시리즈 MVP: {ps.ksMvp.playerName} ({ps.ksMvp.teamId})
                </span>
              </div>
              <span className="font-mono-stats text-slate-600 dark:text-slate-300">
                {ps.ksMvp.statSummary}
              </span>
            </div>
          )}

          {/* 4-Stage KBO Postseason Stepladder */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            {PS_ROUNDS.map((stage) => {
              const completed = ps.seriesHistory.find((s) => s.round === stage.round);
              const active = ps.currentSeries?.round === stage.round ? ps.currentSeries : null;
              const target = completed ?? active;
              return (
                <div
                  key={stage.round}
                  className={`p-2.5 rounded border bg-white dark:bg-slate-900 space-y-1 ${
                    active
                      ? 'team-accent-border'
                      : completed
                      ? 'border-emerald-500/40'
                      : 'border-slate-200 dark:border-slate-800 opacity-65'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{stage.title}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        active
                          ? 'team-accent-bg'
                          : completed
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {active ? '진행중' : completed ? '완료' : '예정'}
                    </span>
                  </div>
                  {target ? (
                    <div className="space-y-0.5 font-mono-stats">
                      <div className="flex items-center justify-between">
                        <span className="font-sans font-semibold flex items-center gap-1">
                          <TeamLogo teamId={target.higherSeedTeam} size="xs" />
                          {target.higherSeedRank}위 {target.higherSeedTeam}
                        </span>
                        <span className="font-extrabold">{target.higherWins}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-sans font-semibold flex items-center gap-1">
                          <TeamLogo teamId={target.lowerSeedTeam} size="xs" />
                          {target.lowerSeedRank}위 {target.lowerSeedTeam}
                        </span>
                        <span className="font-extrabold">{target.lowerWins}</span>
                      </div>
                      {completed?.winnerTeam && (
                        <div className="text-[11px] font-sans font-bold text-emerald-700 dark:text-emerald-400 pt-0.5">
                          승자: {KBO_TEAMS[completed.winnerTeam].shortName}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500">{stage.rule}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Next Regular Series Matchup Preview Card */}
      {career.phase === 'REGULAR_SEASON' && nextSeries && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold team-accent-text">
                <span>
                  다음 예정 {nextSeries.dates.length}연전 프리뷰 · 제{nextSeries.seriesIndex}시리즈 ({nextSeries.startRound}~{nextSeries.endRound}G · {nextSeries.dates[0]}~{nextSeries.dates[nextSeries.dates.length - 1]})
                </span>
                {nextSeries.hasMondayRestBefore && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    월요일 휴식일 후 개시
                  </span>
                )}
                {nextSeries.isAllStarBreakBefore && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                    올스타 브레이크 종료
                  </span>
                )}
                {nextSeries.isMakeupWindow && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                    9월 잔여경기 편성 기간
                  </span>
                )}
              </div>
              {myNextMatchup && (() => {
                const awayInfo = KBO_TEAMS[myNextMatchup.away];
                const homeInfo = KBO_TEAMS[myNextMatchup.home];
                const awaySp = getProjectedStarter(myNextMatchup.away);
                const homeSp = getProjectedStarter(myNextMatchup.home);
                const awayRow = standingsMap[myNextMatchup.away];
                const homeRow = standingsMap[myNextMatchup.home];
                const parkLabel =
                  homeInfo.parkFactor >= 1.04
                    ? '타자 친화'
                    : homeInfo.parkFactor <= 0.96
                    ? '투수 친화'
                    : '중립 구장';
                const nextRiv = getRivalryEffectProfile(career, myNextMatchup.away, myNextMatchup.home);
                const nextRivRec = nextRiv
                  ? getRivalryRecordForTeam(nextRiv.rivalry, career.playerTeamId)
                  : null;
                return (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-sm font-extrabold">
                        <TeamLogo teamId={myNextMatchup.away} size="sm" />
                        <span>
                          {awayInfo.shortName}
                          <span className="text-xs font-mono-stats font-normal text-slate-500 ml-1">
                            ({awayRow ? `${awayRow.rank}위 · ${awayRow.streak}` : '개막'})
                          </span>
                        </span>
                        <span className="text-slate-400 text-xs">@</span>
                        <TeamLogo teamId={myNextMatchup.home} size="sm" />
                        <span>
                          {homeInfo.shortName}
                          <span className="text-xs font-mono-stats font-normal text-slate-500 ml-1">
                            ({homeRow ? `${homeRow.rank}위 · ${homeRow.streak}` : '개막'})
                          </span>
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-stats">
                        1차전 예고 선발: {awaySp ? `${awaySp.name}(${awaySp.ability})` : '미정'} vs{' '}
                        {homeSp ? `${homeSp.name}(${homeSp.ability})` : '미정'} · {homeInfo.stadium} ({parkLabel}{' '}
                        PF {homeInfo.parkFactor.toFixed(2)})
                        {nextSeries.travelDistanceKm
                          ? ` · 평균 원정 이동 ${nextSeries.travelDistanceKm}km`
                          : ''}
                      </div>
                    </div>
                    {nextRiv && nextRivRec && (
                      <div className="px-3 py-2 rounded border border-rose-500/35 bg-rose-500/5 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                          <Flame className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            라이벌 매치 예고 · {nextRiv.rivalry.name} ({nextRiv.tierLabel} · 열기{' '}
                            <span className="font-mono-stats">{nextRiv.rivalry.intensity}</span>)
                          </span>
                        </div>
                        <div className="text-[11px] font-mono-stats text-slate-600 dark:text-slate-300">
                          시즌 전적 {nextRivRec.seasonWins}승 {nextRivRec.seasonLosses}패
                          {nextRivRec.seasonDraws > 0 ? ` ${nextRivRec.seasonDraws}무` : ''} · {nextRiv.summaryText}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <button
              type="button"
              onClick={onSimulateNextSeries}
              className="px-4 py-2 text-xs font-bold rounded team-accent-btn flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              <Play className="w-3.5 h-3.5" />
              <span>정규시즌 3경기(1시리즈) 진행</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-stats pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap gap-3">
              <span className="font-sans text-slate-400">전 구단 매치업:</span>
              {nextSeries.matchups.map((m, i) => {
                const isMine = m.away === career.playerTeamId || m.home === career.playerTeamId;
                return (
                  <span
                    key={i}
                    className={
                      isMine
                        ? 'font-bold team-accent-text underline underline-offset-4'
                        : 'text-slate-500 dark:text-slate-400'
                    }
                  >
                    {m.away}@{m.home}
                  </span>
                );
              })}
            </div>
            <span className="text-[11px] text-slate-500">
              시즌 누적 우천순연 {career.rainoutCount ?? 0}회 · 더블헤더 {career.doubleheaderCount ?? 0}회
            </span>
          </div>
        </div>
      )}

      {/* 10-Team Standings */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Trophy className="w-4 h-4 team-accent-text" />
            <span>{career.season} KBO 정규시즌 10개 구단 순위표</span>
          </div>
          <span className="text-xs text-slate-500 font-mono-stats">
            총 {career.gamesLedger.filter((g) => !g.isPostseason).length} 팀경기(원장 기록 기준) · 상위 5팀 포스트시즌 진출
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2 px-2">순위</th>
                <th className="py-2 px-2">구단</th>
                <th className="py-2 px-2 text-right">경기</th>
                <th className="py-2 px-2 text-right">승</th>
                <th className="py-2 px-2 text-right">패</th>
                <th className="py-2 px-2 text-right">무</th>
                <th className="py-2 px-2 text-right">승률</th>
                <th className="py-2 px-2 text-right">게임차</th>
                <th className="py-2 px-2 text-right">득점</th>
                <th className="py-2 px-2 text-right">실점</th>
                <th className="py-2 px-2 text-right">득실차</th>
                <th className="py-2 px-2 text-right">연속</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono-stats">
              {standings.map((r, idx) => {
                const isMine = r.teamId === career.playerTeamId;
                const isPsCutoff = idx === 4;
                const prevRank = career.previousStandingsRanks?.[r.teamId];
                const rankDelta =
                  typeof prevRank === 'number' && r.games > 0 ? prevRank - r.rank : 0;
                return (
                  <tr
                    key={r.teamId}
                    className={`${
                      isMine
                        ? 'team-accent-row font-bold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    } ${isPsCutoff ? 'border-b-2 border-b-emerald-500/50' : ''}`}
                  >
                    <td className="py-2 px-2 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span>{r.isTied ? `공동 ${r.rank}` : r.rank}</span>
                        {typeof prevRank === 'number' && r.games > 0 && (
                          <span
                            className={`text-[10px] font-bold ${
                              rankDelta > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : rankDelta < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-400'
                            }`}
                            title={`직전 순위 ${prevRank}위 → 현재 ${r.rank}위`}
                          >
                            {rankDelta > 0 ? `▲${rankDelta}` : rankDelta < 0 ? `▼${Math.abs(rankDelta)}` : '—'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 font-sans">
                      <div className="flex items-center gap-2">
                        <TeamLogo teamId={r.teamId} size="xs" />
                        <span>{KBO_TEAMS[r.teamId].name}</span>
                        {r.rank <= 5 && r.games > 0 && (
                          <span className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                            PS권
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right">{r.games}</td>
                    <td className="py-2 px-2 text-right">{r.wins}</td>
                    <td className="py-2 px-2 text-right">{r.losses}</td>
                    <td className="py-2 px-2 text-right">{r.draws}</td>
                    <td className="py-2 px-2 text-right">{r.pct.toFixed(3)}</td>
                    <td className="py-2 px-2 text-right">{r.gb === 0 ? '—' : r.gb.toFixed(1)}</td>
                    <td className="py-2 px-2 text-right">{r.runsScored}</td>
                    <td className="py-2 px-2 text-right">{r.runsAllowed}</td>
                    <td className="py-2 px-2 text-right">
                      {r.runDiff > 0 ? `+${r.runDiff}` : r.runDiff}
                    </td>
                    <td className="py-2 px-2 text-right font-sans">{r.streak}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KBO Club Rivalry System Center */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <Flame className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>KBO 구단 라이벌 관계 현황 · 경기 내·외 효과</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              라이벌전에서는 양 팀 선수 투지 상승·승부처 집중력·추가 피로(내적)와 관중 동원·MD 매출·팬 여론 증폭(외적)이 동시 적용되며, 접전·스윕·가을야구 격돌로 열기가 실시간 상승합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setRivalryScope('MY')}
                className={`px-3 py-1.5 font-semibold whitespace-nowrap ${
                  rivalryScope === 'MY'
                    ? 'team-accent-bg'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                우리 구단 ({myRivalries.length})
              </button>
              <button
                type="button"
                onClick={() => setRivalryScope('ALL')}
                className={`px-3 py-1.5 font-semibold whitespace-nowrap ${
                  rivalryScope === 'ALL'
                    ? 'team-accent-bg'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                리그 전체 ({allRivalries.length})
              </button>
            </div>
            {onUpdateCareer && (
              <div className="flex items-center gap-1.5">
                <select
                  value={customRivalTarget}
                  onChange={(e) => setCustomRivalTarget(e.target.value as TeamId)}
                  className="px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {TEAM_IDS.filter((t) => t !== career.playerTeamId).map((t) => (
                    <option key={t} value={t}>
                      {KBO_TEAMS[t].shortName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleToggleFocusRival(customRivalTarget)}
                  className="px-3 py-1.5 text-xs font-bold rounded border border-rose-500/60 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition-colors whitespace-nowrap"
                >
                  중점 라이벌 지정
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {displayedRivalries.map((riv) => {
            const involvesMe = riv.teamA === career.playerTeamId || riv.teamB === career.playerTeamId;
            const oppId = involvesMe ? getRivalryOpponent(riv, career.playerTeamId) : riv.teamB;
            const effInt = Math.min(100, riv.intensity + (riv.userFocused ? 6 : 0));
            const tier = getRivalryTier(effInt);
            const prof = getRivalryEffectProfile(career, riv.teamA, riv.teamB);
            const recText = involvesMe
              ? (() => {
                  const r = getRivalryRecordForTeam(riv, career.playerTeamId);
                  return `시즌 ${r.seasonWins}승 ${r.seasonLosses}패${r.seasonDraws > 0 ? ` ${r.seasonDraws}무` : ''} · 통산 ${r.allTimeWins}승 ${r.allTimeLosses}패`;
                })()
              : `시즌 ${riv.teamA} ${riv.seasonWinsA}:${riv.seasonWinsB} ${riv.teamB} · 통산 ${riv.allTimeWinsA}:${riv.allTimeWinsB}`;
            return (
              <div
                key={riv.id}
                className={`p-3.5 rounded border space-y-2 ${
                  riv.userFocused
                    ? 'border-rose-500/60 bg-rose-500/5'
                    : involvesMe
                    ? 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-extrabold text-sm truncate">
                      {riv.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {getRivalryTierLabel(tier)}
                      {riv.userFocused ? ' · 중점 숙적' : ''}
                      {riv.isDynamic ? ' · 신흥 라이벌' : ''}
                    </div>
                  </div>
                  <div className="text-right font-mono-stats shrink-0">
                    <div className="text-sm font-extrabold text-rose-600 dark:text-rose-400">
                      {riv.intensity}
                    </div>
                    <div className="text-[10px] text-slate-400">열기</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 py-1 border-y border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 font-bold">
                    <TeamLogo teamId={riv.teamA} size="xs" />
                    <span>{KBO_TEAMS[riv.teamA].shortName}</span>
                  </div>
                  <span className="text-[11px] font-mono-stats text-slate-400">vs</span>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>{KBO_TEAMS[riv.teamB].shortName}</span>
                    <TeamLogo teamId={riv.teamB} size="xs" />
                  </div>
                </div>

                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      tier === '숙적'
                        ? 'bg-rose-600'
                        : tier === '격돌'
                        ? 'bg-orange-500'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, riv.intensity)}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {riv.subtitle}
                </p>

                <div className="text-[11px] font-mono-stats text-slate-600 dark:text-slate-300 space-y-0.5">
                  <div>{recText}</div>
                  {prof && (
                    <div className="text-rose-700 dark:text-rose-300 font-semibold">
                      투지 +{prof.spiritPowerBonus.toFixed(1)} · 관중 +{Math.round((prof.attendanceMult - 1) * 100)}% · MD +{Math.round((prof.merchMult - 1) * 100)}% · 여론 {prof.sentimentMult.toFixed(1)}x
                    </div>
                  )}
                  {riv.lastMeetingNote && (
                    <div className="text-slate-400 truncate">
                      최근 맞대결 ({riv.lastMeetingDate}): {riv.lastMeetingNote}
                    </div>
                  )}
                </div>

                {involvesMe && onUpdateCareer && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleToggleFocusRival(oppId)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded border transition-colors whitespace-nowrap ${
                        riv.userFocused
                          ? 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          : 'border-rose-500/50 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white'
                      }`}
                    >
                      {riv.userFocused ? '중점 지정 해제' : '중점 라이벌 지정'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical & Simulated KBO Champions Archive */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Crown className="w-4 h-4 text-amber-500" />
            <span>역대 KBO 한국시리즈 우승팀 기록</span>
          </div>
          <span className="text-xs text-slate-500">
            최신 시즌순 · 역대 디펜딩 챔피언 및 시뮬레이션 우승 기록
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          {championHistory.map((rec) => (
            <div
              key={`${rec.season}-${rec.championTeamId}`}
              className={`p-3 rounded border space-y-1.5 ${
                rec.isHistoricalBaseline
                  ? 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                  : 'border-amber-500/40 bg-amber-500/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-stats font-extrabold team-accent-text">
                  {rec.season} 시즌
                </span>
                <span className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-500">
                  {rec.isHistoricalBaseline ? '직전 디펜딩 챔피언' : '시뮬레이션 우승'}
                </span>
              </div>
              <div className="flex items-center gap-2 font-extrabold text-sm">
                <TeamLogo teamId={rec.championTeamId} size="sm" />
                <span>{KBO_TEAMS[rec.championTeamId].name}</span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {rec.runnerUpTeamId ? `준우승 ${KBO_TEAMS[rec.runnerUpTeamId].shortName} 상대 ` : ''}
                <span className="font-mono-stats font-bold">{rec.seriesScore}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                한국시리즈 MVP: <strong className="text-slate-700 dark:text-slate-200">{rec.ksMvpName}</strong> ·{' '}
                {rec.ksMvpSummary}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Game Ledger */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Calendar className="w-4 h-4 team-accent-text" />
            <span>경기 원장 (완료 경기 내역)</span>
          </div>
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value as TeamId | 'ALL')}
            className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value={career.playerTeamId}>우리 구단 ({career.playerTeamId})</option>
            <option value="ALL">전체 구단 경기</option>
            {TEAM_IDS.filter((t) => t !== career.playerTeamId).map((t) => (
              <option key={t} value={t}>
                {KBO_TEAMS[t].name}
              </option>
            ))}
          </select>
        </div>

        {filteredGames.length === 0 ? (
          <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
            아직 기록된 완료 경기가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-500">
                <tr>
                  <th className="py-2 px-3">라운드</th>
                  <th className="py-2 px-2">일자</th>
                  <th className="py-2 px-2">원정</th>
                  <th className="py-2 px-2 text-center">점수</th>
                  <th className="py-2 px-2">홈</th>
                  <th className="py-2 px-2">승패</th>
                  <th className="py-2 px-3">출처/구분</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono-stats">
                {filteredGames.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-1.5 px-3">
                      {g.isPostseason ? `PS ${g.postseasonRound}` : `${g.round}G`}
                    </td>
                    <td className="py-1.5 px-2">{g.date}</td>
                    <td className="py-1.5 px-2 font-sans font-medium">{g.awayTeam}</td>
                    <td className="py-1.5 px-2 text-center font-bold">
                      {g.awayRuns} : {g.homeRuns}
                    </td>
                    <td className="py-1.5 px-2 font-sans font-medium">{g.homeTeam}</td>
                    <td className="py-1.5 px-2 font-sans">
                      {g.isDraw ? '무승부' : `${g.winner} 승`}
                    </td>
                    <td className="py-1.5 px-3 font-sans text-[11px] text-slate-500">
                      <span>{g.isSynthetic ? '게임 내 가상 기록' : g.source}</span>
                      {g.isRivalryGame && (
                        <span className="ml-1.5 text-rose-600 dark:text-rose-400 font-bold">
                          · {g.rivalryName ?? '라이벌전'}
                          {g.rivalryIntensity ? ` (열기 ${g.rivalryIntensity})` : ''}
                        </span>
                      )}
                      {g.isDoubleheader && (
                        <span className="ml-1.5 px-1 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                          DH {g.doubleheaderGameNo ?? 1}차전
                        </span>
                      )}
                      {((g.extraInnings ?? g.innings?.away?.length ?? 9) > 9) && (
                        <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                          연장 {g.extraInnings ?? g.innings?.away?.length ?? 10}회
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
};
