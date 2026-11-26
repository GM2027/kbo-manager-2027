import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Crosshair, Flame, Shield, Target } from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { buildAnalyticsReport, computeSalaryCapSummary, getTradeWindowStatus } from '../engine/deepFranchise';
import { formatCompactPlayerPosition } from '../engine/positionEngine';
import { CareerSave, Player } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface AnalyticsCenterViewProps {
  career: CareerSave;
  onSelectPlayer?: (player: Player) => void;
  onNavigateTab?: (tab: 'roster' | 'contracts' | 'finances') => void;
}

export const AnalyticsCenterView: React.FC<AnalyticsCenterViewProps> = ({
  career,
  onSelectPlayer,
  onNavigateTab,
}) => {
  const [subTab, setSubTab] = useState<'batters' | 'pitchers' | 'positions' | 'targets'>('batters');
  const [targetRouteFilter, setTargetRouteFilter] = useState<'ALL' | 'DIRECT' | 'LIKELY_TRADE' | 'OTHER_TRADE'>('ALL');

  const report = useMemo(() => buildAnalyticsReport(career, career.playerTeamId), [career]);
  const cap = useMemo(() => computeSalaryCapSummary(career, career.playerTeamId), [career]);
  const tradeWindow = useMemo(() => getTradeWindowStatus(career), [career]);
  const team = KBO_TEAMS[career.playerTeamId];

  const env = career.leagueEnv;
  const overuseDangerCount = report.overuseAlerts.filter((p) => p.overuse?.riskLevel === '위험').length;
  const weakPosCount = report.positionStrength.filter((p) => p.status === '보강필요').length;

  return (
    <div className="space-y-5">
      {/* Header & Summary Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TeamLogo teamId={career.playerTeamId} size="md" />
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{team.name} 전력분석실</span>
                <span>·</span>
                <span>{career.season} 시즌 리그 환경: {env?.regime ?? '균형'} (반발계수 {env?.ballCOR?.toFixed(3) ?? '0.415'})</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                구단 데이터 분석센터 (세이버메트릭스 · 구종 · 혹사 리포트)
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="text-right">
              <div className="text-slate-500 dark:text-slate-400">전력분석 보정</div>
              <div className="font-mono-stats font-bold text-indigo-600 dark:text-indigo-400">
                +{career.analyticsStaffBonus ?? 3}pt
              </div>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <div className="text-slate-500 dark:text-slate-400">보강 필요 포지션</div>
              <div className="font-mono-stats font-bold text-amber-600 dark:text-amber-400">{weakPosCount}곳</div>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <div className="text-slate-500 dark:text-slate-400">혹사 위험 선수</div>
              <div
                className={`font-mono-stats font-bold ${
                  overuseDangerCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {overuseDangerCount}명
              </div>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <div className="text-slate-500 dark:text-slate-400">상위 40인 연봉 / 캡</div>
              <div className="font-mono-stats font-bold text-slate-900 dark:text-white">
                {cap.teamTop40PayrollBillion.toFixed(1)}억 / {cap.capBillion.toFixed(1)}억
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300">
          <div className="flex items-start gap-2">
            <Crosshair className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <span>{report.lineupInsight}</span>
          </div>
          {onNavigateTab && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab('roster')}
                className="px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                라인업 조정
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('contracts')}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                영입·트레이드 이동
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Overuse Alert Strip if any */}
      {report.overuseAlerts.length > 0 && (
        <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span>혹사·피로 누적 주의 대상 ({report.overuseAlerts.length}명) — 휴식 미부여 시 기량 저하 및 부상 확률 급증</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {report.overuseAlerts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPlayer?.(p)}
                className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 text-slate-800 dark:text-slate-200 hover:border-amber-500 transition-colors"
              >
                <span className="font-bold">{p.name}</span>
                <span className="text-slate-500 ml-1">({p.position})</span>
                <span
                  className={`ml-1.5 font-mono-stats font-bold ${
                    p.overuse?.riskLevel === '위험' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {p.overuse?.riskLevel} · 피로 {p.fatigue}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sub-tab Switcher */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'batters', label: `타자 타구·스플릿 (${report.batters.length})` },
          { id: 'pitchers', label: `투수 구종·구속 분석 (${report.pitchers.length})` },
          { id: 'positions', label: '포지션 전력 진단' },
          { id: 'targets', label: `추천 영입 타깃 (${report.recommendedTargets.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              subTab === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Batters */}
      {subTab === 'batters' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="text-left py-2.5 px-3 font-semibold">선수 · 포지션</th>
                  <th className="text-center py-2.5 px-2 font-semibold">OVR/잠재</th>
                  <th className="text-left py-2.5 px-3 font-semibold">타구 방향 경향</th>
                  <th className="text-left py-2.5 px-3 font-semibold">좌/우 투수 스플릿</th>
                  <th className="text-center py-2.5 px-2 font-semibold">득점권 OPS</th>
                  <th className="text-left py-2.5 px-3 font-semibold">변화구 · 특성</th>
                  <th className="text-right py-2.5 px-3 font-semibold">시장지수</th>
                  <th className="text-center py-2.5 px-2 font-semibold">부하</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {report.batters.map((row) => (
                  <tr
                    key={row.player.id}
                    onClick={() => onSelectPlayer?.(row.player)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {row.player.name}
                        <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                          {row.player.position} · {row.player.rosterTier} · 만 {row.player.age}세
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono-stats font-bold text-slate-800 dark:text-slate-200">
                      {row.player.ability}/{row.player.potential}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.sprayLabel}</td>
                    <td className="py-2.5 px-3 font-mono-stats text-slate-700 dark:text-slate-300">{row.splitText}</td>
                    <td className="py-2.5 px-2 text-center font-mono-stats font-bold text-indigo-600 dark:text-indigo-400">
                      {row.rispOpsEst}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      <span>{row.pitchSummary}</span>
                      <span className="ml-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">· {row.traitLabel}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-stats">
                      <span className="font-bold text-slate-900 dark:text-white">{row.tradeValue}</span>
                      <span className="block text-[10px] text-slate-500">{row.tradeTier}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-semibold">
                      <span
                        className={
                          row.overuseRisk === '위험'
                            ? 'text-rose-600 dark:text-rose-400'
                            : row.overuseRisk === '주의'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {row.overuseRisk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Pitchers */}
      {subTab === 'pitchers' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="text-left py-2.5 px-3 font-semibold">투수 · 보직</th>
                  <th className="text-center py-2.5 px-2 font-semibold">OVR/잠재</th>
                  <th className="text-left py-2.5 px-3 font-semibold">투구폼 · 구속</th>
                  <th className="text-left py-2.5 px-3 font-semibold">제구 · 변화구 · 체력</th>
                  <th className="text-left py-2.5 px-3 font-semibold">보유 구종 (완성도)</th>
                  <th className="text-center py-2.5 px-2 font-semibold">특성</th>
                  <th className="text-right py-2.5 px-3 font-semibold">시장지수</th>
                  <th className="text-center py-2.5 px-2 font-semibold">연투/부하</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {report.pitchers.map((row) => (
                  <tr
                    key={row.player.id}
                    onClick={() => onSelectPlayer?.(row.player)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {row.player.name}
                        <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                          {row.player.pitchRole ?? row.player.position} · {row.player.rosterTier} · 만 {row.player.age}세
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono-stats font-bold text-slate-800 dark:text-slate-200">
                      {row.player.ability}/{row.player.potential}
                    </td>
                    <td className="py-2.5 px-3 font-mono-stats text-slate-700 dark:text-slate-300">{row.sprayLabel}</td>
                    <td className="py-2.5 px-3 font-mono-stats text-slate-700 dark:text-slate-300">{row.splitText}</td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.pitchSummary}</td>
                    <td className="py-2.5 px-2 text-center font-semibold text-indigo-600 dark:text-indigo-400">
                      {row.traitLabel}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-stats">
                      <span className="font-bold text-slate-900 dark:text-white">{row.tradeValue}</span>
                      <span className="block text-[10px] text-slate-500">{row.tradeTier}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono-stats">
                      <span
                        className={`font-semibold ${
                          row.overuseRisk === '위험'
                            ? 'text-rose-600 dark:text-rose-400'
                            : row.overuseRisk === '주의'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {row.overuseRisk}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        {row.player.overuse?.consecutivePitchDays ?? 0}연투 · 7일 {row.player.overuse?.recent7dPitches ?? 0}구
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Position Depth Matrix (League-Relative 10-Club Diagnosis) */}
      {subTab === 'positions' && (() => {
        const sum = report.positionSummary;
        const fieldItems = report.positionStrength.filter((p) => p.group === '야수');
        const pitchItems = report.positionStrength.filter((p) => p.group === '투수');

        const renderPositionCard = (ps: (typeof report.positionStrength)[number]) => {
          const starterPlayer = ps.starterPlayerId ? career.players[ps.starterPlayerId] : undefined;
          const backupPlayer = ps.backupPlayerId ? career.players[ps.backupPlayerId] : undefined;
          const barPct = Math.min(100, Math.max(12, ((ps.avgOvr - 45) / 48) * 100));
          const leagueMarkerPct = Math.min(96, Math.max(12, ((ps.leagueAvgOvr - 45) / 48) * 100));
          const diffStr =
            ps.diffFromLeagueAvg > 0
              ? `+${ps.diffFromLeagueAvg.toFixed(1)}`
              : ps.diffFromLeagueAvg.toFixed(1);

          return (
            <div
              key={ps.position}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-2.5"
            >
              <div className="space-y-2">
                {/* Header: Position + League Rank + Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      {ps.position}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {ps.positionLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                    <span className="font-mono-stats text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      KBO {ps.leagueRank}위
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        ps.status === '강점'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ps.status === '양호'
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      · {ps.status}
                    </span>
                  </div>
                </div>

                {/* Score & League Average Comparison Bar */}
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between text-[11px] font-mono-stats">
                    <span className="text-base font-extrabold text-slate-900 dark:text-white">
                      {ps.avgOvr}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      리그 평균 {ps.leagueAvgOvr.toFixed(1)}{' '}
                      <span
                        className={`font-bold ${
                          ps.diffFromLeagueAvg >= 2
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ps.diffFromLeagueAvg <= -2
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        ({diffStr})
                      </span>
                    </span>
                  </div>
                  <div className="relative h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-visible">
                    <div
                      className={`h-full rounded-full transition-all ${
                        ps.status === '강점'
                          ? 'bg-emerald-500'
                          : ps.status === '양호'
                          ? 'bg-sky-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                    <div
                      title={`KBO 10구단 평균 (${ps.leagueAvgOvr.toFixed(1)})`}
                      className="absolute -top-0.5 bottom-0 w-0.5 h-3 bg-slate-900/70 dark:bg-white/80 rounded-full"
                      style={{ left: `${leagueMarkerPct}%` }}
                    />
                  </div>
                </div>

                {/* Starter & Backup / Depth */}
                <div className="space-y-1 text-xs pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400 shrink-0">주전</span>
                    {starterPlayer && onSelectPlayer ? (
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(starterPlayer)}
                        className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate text-right"
                      >
                        {ps.starterName}
                      </button>
                    ) : (
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate text-right">
                        {ps.starterName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400 shrink-0">
                      뎁스 ({ps.depthGrade} · {ps.depthCount}명)
                    </span>
                    {backupPlayer && onSelectPlayer ? (
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(backupPlayer)}
                        className="text-slate-600 dark:text-slate-300 hover:underline truncate text-right"
                      >
                        {ps.backupSummary}
                      </button>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 truncate text-right">
                        {ps.backupSummary}
                      </span>
                    )}
                  </div>
                  {ps.prospectSummary && (
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-400 shrink-0">유망주</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium truncate text-right">
                        {ps.prospectSummary}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: Diagnosis + Concise Risk Note */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
                <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                  {ps.diagnosis}
                </div>
                {ps.riskFlags.length > 0 && (
                  <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    주의: {ps.riskFlags.join(' · ')}
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-4">
            {/* Overall 4-KPI Team Power Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: '구단 종합 전력', avg: sum.overallAvg, rank: sum.overallRank, sub: '야수 48% · 선발 32% · 불펜 20%' },
                { label: '선발 타선 (9인)', avg: sum.offenseAvg, rank: sum.offenseRank, sub: '포수·내야·외야·지명타자' },
                { label: '선발 로테이션 (5인)', avg: sum.rotationAvg, rank: sum.rotationRank, sub: '1~3선발 65% · 4~5선발 35%' },
                { label: '불펜 · 마무리', avg: sum.bullpenAvg, rank: sum.bullpenRank, sub: '필승조·추격조·마무리' },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{kpi.label}</span>
                    <span
                      className={`font-mono-stats font-bold ${
                        kpi.rank <= 3
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : kpi.rank >= 8
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      리그 {kpi.rank}위
                    </span>
                  </div>
                  <div className="mt-1 font-mono-stats text-xl font-black text-slate-900 dark:text-white">
                    {kpi.avg.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</div>
                </div>
              ))}
            </div>

            {/* Strengths & Priorities Summary Strip */}
            <div className="bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  <span className="text-slate-500">핵심 강점: </span>
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {sum.strongestPositions.length > 0 ? sum.strongestPositions.join(', ') : '균형형'}
                  </strong>
                </span>
                <span>
                  <span className="text-slate-500">우선 보강: </span>
                  <strong className="text-rose-600 dark:text-rose-400">
                    {sum.priorityPositions.length > 0 ? sum.priorityPositions.join(', ') : '없음 (전 포지션 양호)'}
                  </strong>
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                * 막대 위 세로선은 KBO 10개 구단 평균 기준선 · 선수명 클릭 시 상세 확인
              </span>
            </div>

            {/* Pitching Section (3 Units) */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 px-0.5">
                투수진 전력 진단 (선발 5인 · 불펜 · 마무리)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {pitchItems.map(renderPositionCard)}
              </div>
            </div>

            {/* Fielders Section (9 Positions incl. DH) */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 px-0.5">
                야수진 전력 진단 (포수 · 내야 · 외야 · 지명타자)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {fieldItems.map(renderPositionCard)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tab 4: Realistic Target Recommendations */}
      {subTab === 'targets' && (() => {
        const directRoutes = new Set(['FA 영입', '자유계약(방출)', '웨이버 클레임']);
        const filteredTargets = report.recommendedTargets.filter((item) => {
          if (targetRouteFilter === 'ALL') return true;
          if (targetRouteFilter === 'DIRECT') return directRoutes.has(item.route);
          if (targetRouteFilter === 'LIKELY_TRADE') return item.route === '트레이드 (유력)';
          return item.route === '트레이드 (협상 가능)' || item.route === '트레이드 (대가 높음)';
        });

        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Target className="w-4 h-4 text-indigo-500" />
                  <span>현실적 추천 영입 타깃 (성사 가능성 · 구단 잉여 · FA/방출 반영)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  프랜차이즈 스타·트레이드 불가 핵심 유망주를 제외하고, 실제 영입 가능한 FA·방출·포지션 중복·예비 FA 매물만 선별합니다.
                </p>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-md border shrink-0 self-start ${
                  tradeWindow.isOpen
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300'
                }`}
              >
                {tradeWindow.isOpen ? '트레이드 시장 개방' : '트레이드 마감 (FA·오프시즌 추진)'}
              </span>
            </div>

            {/* Route Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {[
                { id: 'ALL', label: `전체 (${report.recommendedTargets.length})` },
                {
                  id: 'DIRECT',
                  label: `FA·자유계약 (${report.recommendedTargets.filter((x) => directRoutes.has(x.route)).length})`,
                },
                {
                  id: 'LIKELY_TRADE',
                  label: `트레이드 유력 (${report.recommendedTargets.filter((x) => x.route === '트레이드 (유력)').length})`,
                },
                {
                  id: 'OTHER_TRADE',
                  label: `트레이드 협상 (${report.recommendedTargets.filter((x) => x.route === '트레이드 (협상 가능)' || x.route === '트레이드 (대가 높음)').length})`,
                },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTargetRouteFilter(f.id as typeof targetRouteFilter)}
                  className={`px-2.5 py-1 rounded-md font-semibold border transition-colors ${
                    targetRouteFilter === f.id
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredTargets.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                선택한 조건에 맞는 현실적 영입 타깃이 없습니다.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTargets.map((item) => {
                  const routeBadgeClass =
                    item.route === 'FA 영입' || item.route === '자유계약(방출)' || item.route === '웨이버 클레임'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                      : item.route === '트레이드 (유력)'
                        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40'
                        : item.route === '트레이드 (협상 가능)'
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40';
                  const feasBadgeClass =
                    item.feasibility === '높음'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : item.feasibility === '보통'
                        ? 'text-sky-600 dark:text-sky-400'
                        : 'text-amber-600 dark:text-amber-400';

                  return (
                    <div
                      key={item.player.id}
                      onClick={() => onSelectPlayer?.(item.player)}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2.5 rounded-lg cursor-pointer"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <TeamLogo teamId={item.player.teamId} size="sm" />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {item.player.name}
                            </span>
                            <span className="text-slate-500 font-normal">
                              {item.player.rosterTier === 'FA'
                                ? `FA (전 ${KBO_TEAMS[item.player.formerTeamId ?? item.player.teamId].shortName})`
                                : `${KBO_TEAMS[item.player.teamId].shortName} · ${item.player.rosterTier}`}
                              {' · '}
                              {formatCompactPlayerPosition(item.player)}
                              {' · '}만 {item.player.age}세
                            </span>
                            <span className="font-mono-stats font-bold text-orange-600 dark:text-orange-400">
                              OVR {item.player.ability}/{item.player.potential}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${routeBadgeClass}`}>
                              {item.route}
                            </span>
                            <span className={`text-[10px] font-bold font-mono-stats ${feasBadgeClass}`}>
                              성사 {item.feasibility} ({item.feasibilityScore}%)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-700 dark:text-slate-300">
                            {item.reason}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono-stats">
                            {item.estimatedCostLabel}
                            {item.isSecondaryFit ? ` · 보강 포지션 ${item.targetPosition} 멀티 투입` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <span className="font-mono-stats text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          시장지수 {item.tradeValue}
                        </span>
                        {onNavigateTab && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateTab('contracts');
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            {directRoutes.has(item.route) ? 'FA·영입 이동' : '트레이드 이동'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 px-1">
        <span className="inline-flex items-center gap-1">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          구종·구속·좌우 스플릿은 경기 시뮬레이션 타석 승부에 직접 반영됩니다.
        </span>
        <span className="inline-flex items-center gap-1">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          시장가치 지수는 타 구단 단장의 트레이드 공정성 심사와 동일 기준입니다.
        </span>
        <span className="inline-flex items-center gap-1">
          <Activity className="w-3.5 h-3.5 text-indigo-500" />
          선수를 클릭하면 상세 스카우팅 리포트를 확인할 수 있습니다.
        </span>
      </div>
    </div>
  );
};
