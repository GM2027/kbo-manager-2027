import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Trophy,
  Wallet,
  X,
} from 'lucide-react';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { applyCoachSwapRecommendation } from '../engine/franchiseSystems';
import {
  calcAVG,
  calcERA,
  calcOBP,
  calcOPS,
  calcSLG,
  calcWHIP,
  computeStandings,
  formatIP,
  formatRate2,
  formatRate3,
} from '../engine/stats';
import { BatterStats, CareerSave, GameRecord, PitcherStats, Player, TeamId } from '../types/kbo';
import { PlayerCategoryTag } from './PlayerCategoryTag';
import { TeamLogo } from './TeamLogo';

interface SeriesReportViewProps {
  career: CareerSave;
  showDetailedByDefault: boolean;
  onUpdateCareer?: (next: CareerSave, backup?: CareerSave) => void;
  onSimulateNextSeries?: () => void;
  onSimulatePostseasonGame?: () => void;
  onSelectPlayer?: (playerId: string) => void;
}

export const SeriesReportView: React.FC<SeriesReportViewProps> = ({
  career,
  showDetailedByDefault,
  onUpdateCareer,
  onSimulateNextSeries,
  onSimulatePostseasonGame,
  onSelectPlayer,
}) => {
  const report = career.lastSeriesReport;
  const [swapNotice, setSwapNotice] = useState<string | null>(null);
  const [statTab, setStatTab] = useState<'batters' | 'pitchers'>('batters');
  const [teamFilter, setTeamFilter] = useState<TeamId | 'ALL'>(career.playerTeamId);
  const [showDetailed, setShowDetailed] = useState(showDetailedByDefault);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);

  const standings = computeStandings(career.gamesLedger);

  // If no lastSeriesReport (e.g. brand new game at 0-0), show a crisp pre-season / opening notice
  if (!report) {
    return (
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">시리즈 경기 결과 리포트</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              아직 진행된 시리즈 경기가 없습니다. 정규시즌 3연전을 실행하면 3경기 스코어, 전체 순위, 주요 활약 선수, 시즌 누적 기록이 표시됩니다.
            </p>
          </div>
          {career.phase === 'REGULAR_SEASON' && onSimulateNextSeries && (
            <button
              type="button"
              onClick={onSimulateNextSeries}
              className="px-4 py-2 text-xs font-bold rounded team-accent-btn"
            >
              개막 3연전 진행
            </button>
          )}
        </div>
      </div>
    );
  }

  const playersList = Object.values(career.players).filter(
    (p) =>
      p.rosterTier !== '은퇴' &&
      (teamFilter === 'ALL' ? true : p.teamId === teamFilter)
  );

  const batters = playersList
    .filter((p) => p.role === '타자')
    .filter((p) => {
      const s = p.stats as BatterStats;
      return (s.G ?? 0) > 0 || (s.PA ?? 0) > 0 || (s.confirmedMinHR ?? 0) > 0 || Boolean(p.ktSeriesBatting);
    })
    .sort((a, b) => {
      const sa = a.stats as BatterStats;
      const sb = b.stats as BatterStats;
      return (sb.G ?? 0) - (sa.G ?? 0) || b.ability - a.ability;
    });

  const pitchers = playersList
    .filter((p) => p.role === '투수')
    .filter((p) => {
      const s = p.stats as PitcherStats;
      return (s.G ?? 0) > 0 || (s.outs ?? 0) > 0;
    })
    .sort((a, b) => {
      const sa = a.stats as PitcherStats;
      const sb = b.stats as PitcherStats;
      return (sb.outs ?? 0) - (sa.outs ?? 0) || (sb.G ?? 0) - (sa.G ?? 0);
    });

  // Key performers gathered from playerTeamGames (or allGamesInWindow)
  const keyPerformerRows = report.playerTeamGames.flatMap((g) =>
    g.keyPerformers.map((kp) => ({ ...kp, date: g.date, round: g.round }))
  );

  return (
    <div className="space-y-4">
      {/* Header Summary Banner */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold team-accent-text">
            {report.isPostseason ? '포스트시즌 1경기 리포트' : '정규시즌 3연전 종료 리포트 (v4.60.27)'}
          </div>
          <h2 className="text-lg font-extrabold mt-0.5">{report.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {career.phase === 'REGULAR_SEASON' && onSimulateNextSeries && career.gamesPlayed < career.totalRegularGames && (
            <button
              type="button"
              onClick={onSimulateNextSeries}
              className="px-4 py-2 text-xs font-bold rounded team-accent-btn"
            >
              다음 3연전 진행
            </button>
          )}
          {career.phase === 'POSTSEASON' && onSimulatePostseasonGame && career.postseason.currentSeries && (
            <button
              type="button"
              onClick={onSimulatePostseasonGame}
              className="px-4 py-2 text-xs font-bold rounded team-accent-btn"
            >
              다음 포스트시즌 1경기 진행
            </button>
          )}
        </div>
      </div>

      {/* Series Financial Revenue & Net Strip */}
      {report.financialSummary && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-bold">
            <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>이번 일정 수지 정산</span>
            <span
              className={`font-mono-stats ${
                (report.financialSummary.netBillion ?? report.financialSummary.totalBillion) >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {(report.financialSummary.netBillion ?? report.financialSummary.totalBillion) >= 0 ? '+' : ''}
              {(report.financialSummary.netBillion ?? report.financialSummary.totalBillion).toFixed(2)}억 순수익
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3.5 font-mono-stats text-slate-600 dark:text-slate-300">
            <span>
              티켓 {report.financialSummary.ticketBillion.toFixed(2)}억 (관중{' '}
              {report.financialSummary.totalSpectators.toLocaleString()}명
              {report.financialSummary.rivalryName && report.financialSummary.rivalryAttendanceBoostPct
                ? ` · ${report.financialSummary.rivalryName} +${report.financialSummary.rivalryAttendanceBoostPct}%`
                : ''}
              )
            </span>
            <span>
              유니폼·MD {report.financialSummary.uniformBillion.toFixed(2)}억 (
              {report.financialSummary.uniformUnitsSold.toLocaleString()}벌
              {report.financialSummary.rivalryMerchBoostPct
                ? ` · 라이벌 +${report.financialSummary.rivalryMerchBoostPct}%`
                : ''}
              )
            </span>
            <span>
              스폰서 {report.financialSummary.sponsorBillion.toFixed(2)}억
              {(report.financialSummary.attendanceBonusBillion ?? 0) > 0
                ? ` (관중+${report.financialSummary.attendanceBonusBillion!.toFixed(2)}억)`
                : ''}
            </span>
            {(report.financialSummary.operatingCostBillion ?? 0) > 0 && (
              <span className="text-red-600 dark:text-red-400">
                운영비 -{report.financialSummary.operatingCostBillion!.toFixed(2)}억
              </span>
            )}
            {(report.financialSummary.merchCogsBillion ?? 0) > 0 && (
              <span className="text-red-600 dark:text-red-400">
                상품원가 -{report.financialSummary.merchCogsBillion!.toFixed(2)}억
              </span>
            )}
            {(report.financialSummary.travelCostBillion ?? 0) > 0 && (
              <span className="text-red-600 dark:text-red-400">
                원정비 -{report.financialSummary.travelCostBillion!.toFixed(2)}억
              </span>
            )}
            {(report.financialSummary.payrollCostBillion ?? 0) > 0 && (
              <span className="text-red-600 dark:text-red-400">
                정기연봉 -{report.financialSummary.payrollCostBillion!.toFixed(2)}억
              </span>
            )}
            {(report.financialSummary.incentiveCostBillion ?? 0) > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                인센티브 -{report.financialSummary.incentiveCostBillion!.toFixed(2)}억
              </span>
            )}
          </div>
        </div>
      )}

      {/* Post-Series Manager Feedback & Real-Time Coach Swap Recommendations */}
      {(report.seriesFeedback || (report.coachReports && report.coachReports.length > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {report.seriesFeedback && (
            <div
              className={`${
                report.coachReports && report.coachReports.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'
              } border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-2 text-xs`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-sm flex items-center gap-1.5">
                  <ClipboardCheck className="w-4 h-4 team-accent-text" />
                  <span>{report.seriesFeedback.managerName} 감독 3연전 브리핑</span>
                </div>
                <span className="font-mono-stats font-bold team-accent-text">
                  {report.seriesFeedback.summary}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                  <div className="font-bold text-slate-700 dark:text-slate-200 mb-0.5">타격 피드백</div>
                  <div className="text-slate-600 dark:text-slate-400">{report.seriesFeedback.offenseNote}</div>
                </div>
                <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                  <div className="font-bold text-slate-700 dark:text-slate-200 mb-0.5">투수·마운드 피드백</div>
                  <div className="text-slate-600 dark:text-slate-400">{report.seriesFeedback.pitchingNote}</div>
                </div>
              </div>
              <div className="text-slate-600 dark:text-slate-300 font-medium pt-0.5">
                다음 시리즈 과제: {report.seriesFeedback.nextSeriesFocus}
              </div>
              {report.seriesFeedback.rainoutNote && (
                <div className="text-sky-700 dark:text-sky-400 font-medium">
                  우천·휴식 노트: {report.seriesFeedback.rainoutNote}
                </div>
              )}
            </div>
          )}

          {report.coachReports && report.coachReports.length > 0 && (
            <div className="lg:col-span-5 border border-amber-500/40 bg-amber-500/5 rounded-md p-4 space-y-2 text-xs">
              <div className="font-bold text-sm text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4" />
                <span>실시간 컨디션 교체 건의</span>
              </div>
              {swapNotice && (
                <div className="p-2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                  {swapNotice}
                </div>
              )}
              <div className="space-y-2">
                {report.coachReports.map((cr) => {
                  const liveRec = (career.coachSwapReports ?? []).find((x) => x.id === cr.id) ?? cr;
                  return (
                    <div
                      key={cr.id}
                      className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5"
                    >
                      <div className="font-bold flex items-center justify-between gap-2">
                        <span>
                          [{cr.coachRole} {cr.coachName}] {cr.slumpingPlayerName}(폼 {cr.slumpingForm}) →{' '}
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {cr.recommendedPlayerName}(폼 {cr.recommendedForm >= 0 ? `+${cr.recommendedForm}` : cr.recommendedForm})
                          </span>
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">{cr.reason}</div>
                      {onUpdateCareer && (
                        <div className="flex justify-end">
                          {liveRec.applied ? (
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              교체 반영 완료
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  const { nextCareer, backupSnapshot } = applyCoachSwapRecommendation(
                                    career,
                                    cr.id
                                  );
                                  onUpdateCareer(nextCareer, backupSnapshot);
                                  setSwapNotice(
                                    `${cr.slumpingPlayerName} → ${cr.recommendedPlayerName} 교체가 반영되었습니다.`
                                  );
                                } catch (e) {
                                  setSwapNotice(e instanceof Error ? e.message : '교체 적용 실패');
                                }
                              }}
                              className="px-2.5 py-1 rounded team-accent-btn font-bold text-[11px]"
                            >
                              추천 교체 적용
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 1: 3-Game Scores (or 1 PS Game) */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <CalendarDays className="w-4 h-4 team-accent-text" />
            <span>1. {report.isPostseason ? '포스트시즌 경기 결과' : '이번 3연전 경기 결과'}</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            경기를 클릭하면 이닝별 스코어 및 검증된 박스스코어를 확인할 수 있습니다
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {report.playerTeamGames.map((g, idx) => {
            const awayWin = !g.isDraw && g.winner === g.awayTeam;
            const homeWin = !g.isDraw && g.winner === g.homeTeam;
            const isVerified = g.verified === true;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGame(g)}
                className="text-left p-3.5 rounded border border-slate-200 dark:border-slate-800 team-accent-hover-border bg-slate-50/70 dark:bg-slate-950/50 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono-stats">
                  <span>
                    {report.isPostseason ? g.date : `${idx + 1}차전 · ${g.round}G (${g.date})`}
                  </span>
                  <span
                    className={
                      isVerified
                        ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {isVerified ? '검증 완료' : '부분집계 보존'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo teamId={g.awayTeam} size="xs" />
                    <span className={`text-sm font-bold truncate ${awayWin ? 'team-accent-text' : ''}`}>
                      {KBO_TEAMS[g.awayTeam].shortName}
                    </span>
                  </div>
                  <div className="text-base font-extrabold font-mono-stats shrink-0">
                    {g.awayRuns} : {g.homeRuns}
                  </div>
                  <div className="flex items-center gap-2 min-w-0 justify-end">
                    <span className={`text-sm font-bold truncate ${homeWin ? 'team-accent-text' : ''}`}>
                      {KBO_TEAMS[g.homeTeam].shortName}
                    </span>
                    <TeamLogo teamId={g.homeTeam} size="xs" />
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {g.isDraw
                    ? '무승부'
                    : `${KBO_TEAMS[g.winner as TeamId].shortName} 승`}
                  {g.extraInnings ? ` · 연장 ${g.extraInnings}회` : ''}
                  {g.isRivalryGame
                    ? ` · ${g.rivalryName ?? '라이벌전'}${g.rivalryIntensity ? ` (열기 ${g.rivalryIntensity})` : ''}`
                    : ''}
                  {g.isRainoutRescheduled ? ' · 우천순연' : ''}
                  {g.keyPerformers[0] ? ` · ${g.keyPerformers[0].playerName} ${g.keyPerformers[0].summary}` : ''}
                </div>
                {g.isRivalryGame && g.rivalryEffectNote && (
                  <div className="text-[10px] text-rose-600 dark:text-rose-400 truncate font-mono-stats font-semibold">
                    라이벌 효과: {g.rivalryEffectNote}
                  </div>
                )}
                {g.weather && (
                  <div className="text-[10px] text-sky-700 dark:text-sky-400 truncate font-mono-stats">
                    구장 기상: {g.weather.summary}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* All 10 teams' games in the same window compact summary */}
        {report.allGamesInWindow.length > report.playerTeamGames.length && (
          <details className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <summary className="text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              타 구단 동시 진행 경기 전체 ({report.allGamesInWindow.length}경기) 펼치기
            </summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
              {report.allGamesInWindow.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGame(g)}
                  className="p-2 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between font-mono-stats"
                >
                  <span className="text-slate-500">{g.round}G</span>
                  <span>
                    {g.awayTeam} {g.awayRuns}:{g.homeRuns} {g.homeTeam}
                  </span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Section 2 & 3 Grid: 10-Team Standings + Key Performers & Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 2. League Standings */}
        <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Trophy className="w-4 h-4 team-accent-text" />
              <span>2. 전체 10개 구단 순위</span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-stats">
              {career.gamesPlayed}/{career.totalRegularGames}경기 완료
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
                  <th className="py-2 px-2 text-right">연속</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono-stats">
                {standings.map((r) => {
                  const isMine = r.teamId === career.playerTeamId;
                  return (
                    <tr
                      key={r.teamId}
                      className={
                        isMine
                          ? 'team-accent-row font-bold text-slate-900 dark:text-white'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-1.5 px-2">
                        {r.isTied ? `공동 ${r.rank}` : r.rank}
                      </td>
                      <td className="py-1.5 px-2 font-sans">
                        <div className="flex items-center gap-2">
                          <TeamLogo teamId={r.teamId} size="xs" />
                          <span>{KBO_TEAMS[r.teamId].shortName}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-right">{r.games}</td>
                      <td className="py-1.5 px-2 text-right">{r.wins}</td>
                      <td className="py-1.5 px-2 text-right">{r.losses}</td>
                      <td className="py-1.5 px-2 text-right">{r.draws}</td>
                      <td className="py-1.5 px-2 text-right">{r.pct.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-right">{r.gb === 0 ? '—' : r.gb.toFixed(1)}</td>
                      <td className="py-1.5 px-2 text-right font-sans">{r.streak}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Key Performers + Injuries / Growth */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold mb-2.5">
              <Activity className="w-4 h-4 team-accent-text" />
              <span>3. 경기별 주요 활약 선수</span>
            </div>
            {keyPerformerRows.length === 0 ? (
              <div className="text-xs text-slate-500">기록된 주요 활약 요약이 없습니다.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {keyPerformerRows.slice(0, 6).map((kp, idx) => (
                  <div key={`${kp.playerName}-${idx}`} className="py-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        {kp.playerName}{' '}
                        <span className="text-slate-500 dark:text-slate-400 font-normal">
                          · {kp.teamId} · {kp.role}
                        </span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 font-mono-stats mt-0.5">
                        {kp.summary}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono-stats shrink-0">
                      {kp.round}G
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>부상 및 10경기 성장 변동</span>
            </div>
            {report.newInjuries.length === 0 && report.newGrowths.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                이번 시리즈 신규 부상 및 10경기 성장 변동 없음
              </div>
            ) : (
              <div className="space-y-1.5 text-xs">
                {report.newInjuries.map((inj) => (
                  <div key={inj.id} className="p-2 rounded bg-red-500/10 text-red-600 dark:text-red-400">
                    부상: {inj.teamId} {inj.playerName} ({inj.severity} · {inj.description} · {inj.days}일)
                  </div>
                ))}
                {report.newGrowths.slice(0, 6).map((gr) => (
                  <div
                    key={gr.id}
                    className={`p-2 rounded space-y-0.5 ${
                      gr.delta > 0
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <div className="font-semibold">
                      평가({gr.teamId}): {gr.playerName} {gr.prevAbility}→{gr.nextAbility} (
                      {gr.delta > 0 ? `+${gr.delta}` : gr.delta}) · {gr.sampleText}
                    </div>
                    <div className="text-[11px] opacity-90">{gr.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 4: Cumulative Season Stats (Batters / Pitchers) */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <BarChart3 className="w-4 h-4 team-accent-text" />
            <span>4. 전체 선수 시즌 누적 기록</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setStatTab('batters')}
                className={`px-3 py-1.5 font-semibold ${
                  statTab === 'batters'
                    ? 'team-accent-bg'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                타자 누적
              </button>
              <button
                type="button"
                onClick={() => setStatTab('pitchers')}
                className={`px-3 py-1.5 font-semibold ${
                  statTab === 'pitchers'
                    ? 'team-accent-bg'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                투수 누적
              </button>
            </div>

            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value as TeamId | 'ALL')}
              className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value={career.playerTeamId}>우리 구단 ({career.playerTeamId})</option>
              <option value="ALL">리그 전체 10개 구단</option>
              {TEAM_IDS.filter((t) => t !== career.playerTeamId).map((t) => (
                <option key={t} value={t}>
                  {KBO_TEAMS[t].name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowDetailed((v) => !v)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded border ${
                showDetailed
                  ? 'team-accent-border team-accent-text'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {showDetailed ? '상세 열 숨기기' : '상세 열 보기'}
            </button>
          </div>
        </div>

        {/* Notice for Hanwha master early partial batting */}
        {teamFilter === '한화' && career.isPreservedMaster && statTab === 'batters' && (
          <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
            한화 타자 초반 1~3·7~9경기 원자료 미제공으로 시즌 전체 타석(PA)/타율(AVG)은 ‘미집계(확인 최소 홈런/타점+)’로 보존되며, KT 3연전 및 10G 이후 완전집계 기록을 별도 열에 함께 표시합니다.
          </div>
        )}

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
          {statTab === 'batters' ? (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-500 dark:text-slate-300">
                <tr>
                  <th className="py-2 px-2.5">선수</th>
                  <th className="py-2 px-2">구단</th>
                  <th className="py-2 px-2">포지션</th>
                  <th className="py-2 px-2 text-right">경기</th>
                  <th className="py-2 px-2 text-right">타율</th>
                  <th className="py-2 px-2 text-right">안타</th>
                  <th className="py-2 px-2 text-right">홈런</th>
                  <th className="py-2 px-2 text-right">타점</th>
                  <th className="py-2 px-2 text-right">OPS</th>
                  {showDetailed && (
                    <>
                      <th className="py-2 px-2 text-right">타석</th>
                      <th className="py-2 px-2 text-right">타수</th>
                      <th className="py-2 px-2 text-right">출루율</th>
                      <th className="py-2 px-2 text-right">장타율</th>
                      <th className="py-2 px-2 text-right">볼넷</th>
                      <th className="py-2 px-2 text-right">도루</th>
                    </>
                  )}
                  <th className="py-2 px-2.5">완전집계 / 비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono-stats">
                {batters.map((p: Player) => {
                  const b = p.stats as BatterStats;
                  const kt = p.ktSeriesBatting;
                  const isPartial = Boolean(b.isPartial && b.PA === null);
                  const avg = isPartial ? null : calcAVG(b.H, b.AB);
                  const ops = isPartial ? null : calcOPS(b);
                  const obp = isPartial ? null : calcOBP(b.H, b.BB, b.HBP, b.AB, b.SF);
                  const slg = isPartial ? null : calcSLG(b.TB, b.AB);
                  const ktAvg = kt ? calcAVG(kt.H, kt.AB) : null;
                  const ktOps = kt ? calcOPS(kt) : null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-1.5 px-2.5 font-sans font-semibold">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(p.id)}
                            className="team-accent-hover-text hover:underline text-left"
                          >
                            {p.name}
                          </button>
                          <PlayerCategoryTag category={p.category} compact />
                        </div>
                      </td>
                      <td className="py-1.5 px-2 font-sans">{p.teamId}</td>
                      <td className="py-1.5 px-2 font-sans">{p.position}</td>
                      <td className="py-1.5 px-2 text-right">{b.G ?? '미집계'}</td>
                      <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : formatRate3(avg)}</td>
                      <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : (b.H ?? 0)}</td>
                      <td className="py-1.5 px-2 text-right font-semibold">
                        {isPartial ? `${b.confirmedMinHR ?? 0}+` : (b.HR ?? 0)}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {isPartial ? `${b.confirmedMinRBI ?? 0}+` : (b.RBI ?? 0)}
                      </td>
                      <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : formatRate3(ops)}</td>
                      {showDetailed && (
                        <>
                          <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : (b.PA ?? 0)}</td>
                          <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : (b.AB ?? 0)}</td>
                          <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : formatRate3(obp)}</td>
                          <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : formatRate3(slg)}</td>
                          <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : (b.BB ?? 0)}</td>
                          <td className="py-1.5 px-2 text-right">{isPartial ? '미집계' : (b.SB ?? 0)}</td>
                        </>
                      )}
                      <td className="py-1.5 px-2.5 font-sans text-[11px] text-slate-500 dark:text-slate-400">
                        {kt
                          ? `KT~누적 ${kt.AB}타수 ${kt.H}안타 (${formatRate3(ktAvg)} · OPS ${formatRate3(ktOps)})`
                          : b.isSynthetic
                          ? '가상 누적'
                          : '완전집계'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-500 dark:text-slate-300">
                <tr>
                  <th className="py-2 px-2.5">선수</th>
                  <th className="py-2 px-2">구단</th>
                  <th className="py-2 px-2 text-right">경기</th>
                  <th className="py-2 px-2 text-right">이닝</th>
                  <th className="py-2 px-2 text-right">승</th>
                  <th className="py-2 px-2 text-right">패</th>
                  <th className="py-2 px-2 text-right">세이브</th>
                  <th className="py-2 px-2 text-right">홀드</th>
                  <th className="py-2 px-2 text-right">ERA</th>
                  <th className="py-2 px-2 text-right">탈삼진</th>
                  {showDetailed && (
                    <>
                      <th className="py-2 px-2 text-right">WHIP</th>
                      <th className="py-2 px-2 text-right">피안타</th>
                      <th className="py-2 px-2 text-right">볼넷</th>
                      <th className="py-2 px-2 text-right">자책</th>
                    </>
                  )}
                  <th className="py-2 px-2.5">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono-stats">
                {pitchers.map((p: Player) => {
                  const ps = p.stats as PitcherStats;
                  const era = calcERA(ps.ER, ps.outs);
                  const whip = calcWHIP(ps.H, ps.BB, ps.outs);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-1.5 px-2.5 font-sans font-semibold">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(p.id)}
                            className="team-accent-hover-text hover:underline text-left"
                          >
                            {p.name}
                          </button>
                          <PlayerCategoryTag category={p.category} compact />
                        </div>
                      </td>
                      <td className="py-1.5 px-2 font-sans">{p.teamId}</td>
                      <td className="py-1.5 px-2 text-right">{ps.G ?? 0}</td>
                      <td className="py-1.5 px-2 text-right">{formatIP(ps.outs)}</td>
                      <td className="py-1.5 px-2 text-right">{ps.W ?? 0}</td>
                      <td className="py-1.5 px-2 text-right">{ps.L ?? 0}</td>
                      <td className="py-1.5 px-2 text-right">{ps.SV ?? 0}</td>
                      <td className="py-1.5 px-2 text-right">{ps.HLD ?? 0}</td>
                      <td className="py-1.5 px-2 text-right font-semibold">{formatRate2(era)}</td>
                      <td className="py-1.5 px-2 text-right">{ps.SO ?? 0}</td>
                      {showDetailed && (
                        <>
                          <td className="py-1.5 px-2 text-right">{formatRate2(whip)}</td>
                          <td className="py-1.5 px-2 text-right">{ps.H ?? '미집계'}</td>
                          <td className="py-1.5 px-2 text-right">{ps.BB ?? '미집계'}</td>
                          <td className="py-1.5 px-2 text-right">{ps.ER ?? '미집계'}</td>
                        </>
                      )}
                      <td className="py-1.5 px-2.5 font-sans text-[11px] text-slate-500 dark:text-slate-400">
                        {ps.isPartial
                          ? '최소 확인분(일부 미집계)'
                          : ps.isSynthetic
                          ? '가상 누적'
                          : '완전집계'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Boxscore Drilldown Modal */}
      {selectedGame && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden max-h-[88vh] flex flex-col">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5 flex-wrap">
                <TeamLogo teamId={selectedGame.awayTeam} size="xs" />
                <span className="font-bold text-sm">
                  {selectedGame.awayTeam} {selectedGame.awayRuns} : {selectedGame.homeRuns} {selectedGame.homeTeam}
                </span>
                <TeamLogo teamId={selectedGame.homeTeam} size="xs" />
                <span className="text-xs text-slate-500 font-mono-stats">
                  ({selectedGame.date} · {selectedGame.round}G)
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                    selectedGame.verified
                      ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                      : 'border-amber-500/40 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {selectedGame.verified
                    ? '박스스코어 자동 검증 통과'
                    : selectedGame.validationNote ?? '초반 원자료 부분집계 보존'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGame(null)}
                className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {selectedGame.isRivalryGame && (
                <div className="px-3.5 py-2.5 rounded border border-rose-500/40 bg-rose-500/5 text-rose-800 dark:text-rose-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    라이벌 매치: {selectedGame.rivalryName ?? '구단 라이벌전'}
                    {selectedGame.rivalryIntensity ? ` (열기 ${selectedGame.rivalryIntensity})` : ''}
                  </span>
                  {selectedGame.rivalryEffectNote && (
                    <span className="font-mono-stats text-[11px]">{selectedGame.rivalryEffectNote}</span>
                  )}
                </div>
              )}
              {selectedGame.innings && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                  <table className="w-full text-center font-mono-stats">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
                      <tr>
                        <th className="py-1.5 px-3 text-left font-sans">팀</th>
                        {selectedGame.innings.away.map((_, i) => (
                          <th key={i} className="py-1.5 px-2">
                            {i + 1}
                          </th>
                        ))}
                        <th className="py-1.5 px-2 font-bold">R</th>
                        <th className="py-1.5 px-2">H</th>
                        <th className="py-1.5 px-2">E</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="py-1.5 px-3 text-left font-sans font-bold">{selectedGame.awayTeam}</td>
                        {selectedGame.innings.away.map((r, i) => (
                          <td key={i} className="py-1.5 px-2">
                            {r}
                          </td>
                        ))}
                        <td className="py-1.5 px-2 font-bold team-accent-text">
                          {selectedGame.awayRuns}
                        </td>
                        <td className="py-1.5 px-2">{selectedGame.awayHits ?? '—'}</td>
                        <td className="py-1.5 px-2">{selectedGame.awayErrors ?? '—'}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3 text-left font-sans font-bold">{selectedGame.homeTeam}</td>
                        {selectedGame.innings.home.map((r, i) => (
                          <td key={i} className="py-1.5 px-2">
                            {r === null ? 'X' : r}
                          </td>
                        ))}
                        <td className="py-1.5 px-2 font-bold team-accent-text">
                          {selectedGame.homeRuns}
                        </td>
                        <td className="py-1.5 px-2">{selectedGame.homeHits ?? '—'}</td>
                        <td className="py-1.5 px-2">{selectedGame.homeErrors ?? '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {selectedGame.substitutionNotes && selectedGame.substitutionNotes.length > 0 && (
                <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] space-y-1">
                  <div className="font-bold text-slate-700 dark:text-slate-200">
                    경기 후반 작전 · 교체 노트
                    {selectedGame.extraInnings ? ` (연장 ${selectedGame.extraInnings}회)` : ''}
                    {selectedGame.isRainoutRescheduled ? ' · 우천 순연 후 더블헤더/재편성' : ''}
                  </div>
                  {selectedGame.substitutionNotes.map((note, idx) => (
                    <div key={idx} className="text-slate-600 dark:text-slate-400">
                      · {note}
                    </div>
                  ))}
                </div>
              )}

              {selectedGame.boxscore ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      title: `${selectedGame.awayTeam} 타자`,
                      batters: selectedGame.boxscore.awayBatters,
                      pitchers: selectedGame.boxscore.awayPitchers,
                      teamLabel: selectedGame.awayTeam,
                    },
                    {
                      title: `${selectedGame.homeTeam} 타자`,
                      batters: selectedGame.boxscore.homeBatters,
                      pitchers: selectedGame.boxscore.homePitchers,
                      teamLabel: selectedGame.homeTeam,
                    },
                  ].map((side) => (
                    <div key={side.teamLabel} className="space-y-3">
                      <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                        <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 font-bold flex items-center justify-between">
                          <span>{side.title}</span>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            출전 {side.batters.length}명
                            {side.batters.some((b) => b.isSubstitute)
                              ? ` (교체 ${side.batters.filter((b) => b.isSubstitute).length}명)`
                              : ''}
                          </span>
                        </div>
                        <table className="w-full font-mono-stats">
                          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                            <tr>
                              <th className="py-1 px-2 text-left font-sans">타순·선수</th>
                              <th className="py-1 px-1.5 text-right">AB</th>
                              <th className="py-1 px-1.5 text-right">H</th>
                              <th className="py-1 px-1.5 text-right">HR</th>
                              <th className="py-1 px-1.5 text-right">RBI</th>
                              <th className="py-1 px-1.5 text-right">BB</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {side.batters.map((b, idx) => (
                              <tr
                                key={b.playerId}
                                className={
                                  b.isSubstitute
                                    ? 'bg-slate-50/70 dark:bg-slate-900/40'
                                    : undefined
                                }
                              >
                                <td className="py-1 px-2 font-sans">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {b.isSubstitute ? (
                                      <span className="text-[10px] font-mono-stats text-slate-400 pl-2">
                                        ↳
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-mono-stats text-slate-400 w-3.5 text-right">
                                        {b.battingOrder ?? idx + 1}
                                      </span>
                                    )}
                                    <span>{b.name}</span>
                                    <PlayerCategoryTag
                                      category={career.players[b.playerId]?.category ?? '국내'}
                                      compact
                                    />
                                    <span className="text-slate-400">{b.position}</span>
                                    {b.isSubstitute && b.subRole && (
                                      <span className="text-[10px] px-1 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 font-medium">
                                        {b.subRole}
                                        {b.enteredInning ? ` ${b.enteredInning}회` : ''}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-1 px-1.5 text-right">{b.AB}</td>
                                <td className="py-1 px-1.5 text-right font-semibold">{b.H}</td>
                                <td className="py-1 px-1.5 text-right">{b.HR}</td>
                                <td className="py-1 px-1.5 text-right">{b.RBI}</td>
                                <td className="py-1 px-1.5 text-right">{b.BB}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                        <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 font-bold">
                          {side.teamLabel} 투수
                        </div>
                        <table className="w-full font-mono-stats">
                          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                            <tr>
                              <th className="py-1 px-2 text-left font-sans">투수</th>
                              <th className="py-1 px-1.5 text-right">IP</th>
                              <th className="py-1 px-1.5 text-right">H</th>
                              <th className="py-1 px-1.5 text-right">BB</th>
                              <th className="py-1 px-1.5 text-right">SO</th>
                              <th className="py-1 px-1.5 text-right">ER</th>
                              <th className="py-1 px-1.5 text-right">결정</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {side.pitchers.map((pt) => (
                              <tr key={pt.playerId}>
                                <td className="py-1 px-2 font-sans font-medium">
                                  <div className="flex items-center gap-1">
                                    <span>{pt.name}</span>
                                    <PlayerCategoryTag
                                      category={career.players[pt.playerId]?.category ?? '국내'}
                                      compact
                                    />
                                  </div>
                                </td>
                                <td className="py-1 px-1.5 text-right">{formatIP(pt.outs)}</td>
                                <td className="py-1 px-1.5 text-right">{pt.H}</td>
                                <td className="py-1 px-1.5 text-right">{pt.BB}</td>
                                <td className="py-1 px-1.5 text-right">{pt.SO}</td>
                                <td className="py-1 px-1.5 text-right">{pt.ER}</td>
                                <td className="py-1 px-1.5 text-right font-sans">
                                  {pt.W ? '승' : pt.L ? '패' : pt.SV ? '세' : pt.HLD ? '홀' : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded border border-slate-200 dark:border-slate-800 text-slate-500">
                  초반 원장 스코어 경기입니다 ({selectedGame.source}). 주요 활약:{' '}
                  {selectedGame.keyPerformers.map((k) => `${k.playerName} ${k.summary}`).join(', ') || '기록 없음'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
