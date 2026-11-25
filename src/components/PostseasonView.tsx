import React, { useMemo, useState } from 'react';
import { Award, Calendar, ChevronRight, Crown, Flame, Play, Shield, Sparkles, Trophy } from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { buildPitchRepertoire } from '../engine/deepFranchise';
import { calcOPS } from '../engine/stats';
import {
  BatterStats,
  CareerSave,
  PitcherStats,
  Player,
  PostseasonRound,
  PostseasonSeriesState,
  TeamId,
} from '../types/kbo';
import { getClubTitleCount } from '../engine/leagueLifeEngine';
import { KboOfficialTrophySvg, KoreanSeriesTrophyLogo } from './KoreanSeriesTrophyLogo';
import { TeamLogo } from './TeamLogo';

interface PostseasonViewProps {
  career: CareerSave;
  onPlayNextPostseasonGame: () => void;
  onSelectPlayer?: (playerId: string) => void;
  onOpenAwardsCeremony?: () => void;
}

const STAGE_META: {
  key: PostseasonRound;
  shortTitle: string;
  title: string;
  subtitle: string;
  formatLabel: string;
  waitingHigherRank: number;
  waitingLowerLabel: string;
}[] = [
  {
    key: 'WILDCARD',
    shortTitle: '와일드카드',
    title: '와일드카드 결정전',
    subtitle: '4위 vs 5위',
    formatLabel: '4위 1승 어드밴티지 · 최대 2경기',
    waitingHigherRank: 4,
    waitingLowerLabel: '5위 팀',
  },
  {
    key: 'SEMI_PO',
    shortTitle: '준플레이오프',
    title: '준플레이오프',
    subtitle: '3위 vs WC 승자',
    formatLabel: '5전 3선승제',
    waitingHigherRank: 3,
    waitingLowerLabel: 'WC 승자 대기',
  },
  {
    key: 'PO',
    shortTitle: '플레이오프',
    title: '플레이오프',
    subtitle: '2위 vs 준PO 승자',
    formatLabel: '5전 3선승제',
    waitingHigherRank: 2,
    waitingLowerLabel: '준PO 승자 대기',
  },
  {
    key: 'KOREAN_SERIES',
    shortTitle: '한국시리즈',
    title: '한국시리즈',
    subtitle: '1위 vs PO 승자',
    formatLabel: '7전 4선승제',
    waitingHigherRank: 1,
    waitingLowerLabel: 'PO 승자 대기',
  },
];

export const PostseasonView: React.FC<PostseasonViewProps> = ({
  career,
  onPlayNextPostseasonGame,
  onSelectPlayer,
  onOpenAwardsCeremony,
}) => {
  const ps = career.postseason;
  const [inspectedRound, setInspectedRound] = useState<PostseasonRound | null>(null);

  const seriesMap = useMemo(() => {
    const map: Partial<Record<PostseasonRound, PostseasonSeriesState>> = {};
    if (!ps) return map;
    for (const s of ps.seriesHistory ?? []) {
      map[s.round] = s;
    }
    if (ps.currentSeries) {
      map[ps.currentSeries.round] = ps.currentSeries;
    }
    return map;
  }, [ps]);

  const liveSeries =
    ps?.currentSeries ??
    seriesMap.KOREAN_SERIES ??
    seriesMap.PO ??
    seriesMap.SEMI_PO ??
    seriesMap.WILDCARD ??
    null;

  const activeSeries =
    (inspectedRound && seriesMap[inspectedRound]) || liveSeries;

  // Postseason MVP race leaders across active postseason players
  const mvpCandidates = useMemo(() => {
    const all = Object.values(career.players).filter((p) => {
      if (!p.postseasonStats) return false;
      if (p.role === '타자') return ((p.postseasonStats as BatterStats).AB ?? 0) >= 4;
      return ((p.postseasonStats as PitcherStats).outs ?? 0) >= 6;
    });
    return all
      .map((p) => {
        if (p.role === '타자') {
          const b = p.postseasonStats as BatterStats;
          const ab = b.AB ?? 0;
          const h = b.H ?? 0;
          const hr = b.HR ?? 0;
          const rbi = b.RBI ?? 0;
          const ops = calcOPS(b) ?? 0;
          const score = h * 2 + hr * 6 + rbi * 2.5 + ops * 12;
          return {
            player: p,
            score,
            line: `${ab}타수 ${h}안타 ${hr}홈런 ${rbi}타점 · OPS ${ops.toFixed(3)}`,
          };
        }
        const pt = p.postseasonStats as PitcherStats;
        const outs = pt.outs ?? 0;
        const er = pt.ER ?? 0;
        const w = pt.W ?? 0;
        const sv = pt.SV ?? 0;
        const so = pt.SO ?? 0;
        const ip = (outs / 3).toFixed(1);
        const era = outs > 0 ? ((er * 27) / outs).toFixed(2) : '0.00';
        const score = w * 12 + sv * 8 + so * 1.4 - er * 2.5 + outs * 0.4;
        return {
          player: p,
          score,
          line: `${w}승 ${sv}세이브 · ${ip}이닝 · ERA ${era} · ${so}K`,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [career.players]);

  const getTeamAceStarter = (teamId: TeamId): Player | null => {
    const rot = career.teams[teamId]?.rotationOrder ?? [];
    for (const id of rot) {
      const pl = career.players[id];
      if (pl && !pl.injury) return pl;
    }
    return null;
  };

  if (!ps || (!ps.active && !ps.champion && (ps.seriesHistory?.length ?? 0) === 0)) {
    return (
      <div className="bg-slate-950 text-slate-100 rounded-xl border border-slate-800 p-10 text-center">
        <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <h2 className="text-xl font-black tracking-tight">{career.season} KBO 포스트시즌 대기 중</h2>
        <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
          정규시즌 144경기가 모두 종료되면 상위 5개 구단이 참가하는 가을야구 전용 토너먼트 대진표와 방송 중계실이 개방됩니다.
        </p>
      </div>
    );
  }

  const highStarter = activeSeries ? getTeamAceStarter(activeSeries.higherSeedTeam) : null;
  const lowStarter = activeSeries ? getTeamAceStarter(activeSeries.lowerSeedTeam) : null;
  const isFinished = ps.currentRound === 'FINISHED' || Boolean(ps.champion);
  const seeds = ps.standingsSeed ?? [];

  return (
    <div className="space-y-5">
      {/* Broadcast Theater Hero Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-950 via-[#0d1b35] to-slate-900 border border-amber-500/35 text-white p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-amber-400">
              <Trophy className="w-4 h-4" />
              <span>{career.season} KBO POSTSEASON · STEPLADDER TOURNAMENT</span>
              {career.leagueEnv && (
                <>
                  <span>·</span>
                  <span className="text-slate-300 font-medium normal-case">
                    리그 환경 {career.leagueEnv.regime}
                  </span>
                </>
              )}
            </div>

            {isFinished && ps.champion ? (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <KoreanSeriesTrophyLogo
                  teamId={ps.champion}
                  season={career.season}
                  titleCount={getClubTitleCount(career, ps.champion)}
                  size="md"
                  showCaption={false}
                />
                <div>
                  <div className="text-xs text-amber-300 font-semibold">
                    KOREAN SERIES CHAMPION · V{getClubTitleCount(career, ps.champion)}
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    {KBO_TEAMS[ps.champion].name} 한국시리즈 우승!
                  </h1>
                  <p className="text-xs text-slate-300 mt-1">
                    {ps.champion === career.playerTeamId
                      ? '축하합니다! 우리 구단이 KBO 최정상에 올랐습니다. 이제 KBO 공식 시상식으로 이동하세요.'
                      : '한국시리즈가 종료되었습니다. KBO 공식 시상식을 확인한 뒤 오프시즌 단장실로 이동하세요.'}
                  </p>
                </div>
              </div>
            ) : liveSeries ? (
              <div className="mt-3">
                <div className="text-xs text-slate-300">
                  현재 진행 라운드 · {STAGE_META.find((m) => m.key === liveSeries.round)?.formatLabel}
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-0.5">{liveSeries.label}</h1>
              </div>
            ) : null}
          </div>

          {isFinished && ps.champion && onOpenAwardsCeremony && (
            <div className="flex flex-col items-stretch sm:items-end gap-2">
              <button
                type="button"
                onClick={onOpenAwardsCeremony}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm transition-all shadow-lg cursor-pointer"
              >
                <Trophy className="w-4 h-4" />
                <span>{career.season} KBO 공식 시상식 입장</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-amber-200/85">
                MVP · 신인왕 · 골든글러브 10인 시상식 확인 후 오프시즌으로 이동합니다
              </span>
            </div>
          )}

          {!isFinished && liveSeries && career.phase === 'POSTSEASON' && (
            <div className="flex flex-col items-stretch sm:items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setInspectedRound(null);
                  onPlayNextPostseasonGame();
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {liveSeries.label} {liveSeries.games.length + 1}차전 진행
                </span>
              </button>
              <span className="text-[11px] text-slate-400">
                상위 시드 {liveSeries.winsRequiredHigher}승 / 도전자 {liveSeries.winsRequiredLower}승 선점 시 통과
              </span>
            </div>
          )}
        </div>

        {/* Visual KBO Stepladder Tournament Bracket Tree */}
        <div className="mt-6 pt-5 border-t border-white/10">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-xs font-extrabold tracking-wider uppercase text-amber-300 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5" />
              <span>KBO 가을야구 스텝래더 토너먼트 대진표</span>
            </div>
            <span className="text-[11px] text-slate-400">
              각 라운드 박스를 클릭하면 해당 시리즈 스코어보드와 경기 결과를 상세 조회할 수 있습니다
            </span>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="min-w-[940px] flex items-stretch gap-0">
              {STAGE_META.map((stage, idx) => {
                const s = seriesMap[stage.key];
                const isCurrent = ps.currentRound === stage.key && !isFinished;
                const isSelected = activeSeries?.round === stage.key;
                const waitingHigherTeam = seeds[stage.waitingHigherRank - 1];
                const waitingFifthTeam = stage.key === 'WILDCARD' ? seeds[4] : undefined;

                // Stepladder vertical elevation (WC sits lowest, KS sits highest)
                const stepMarginTop = [52, 34, 16, 0][idx] ?? 0;

                return (
                  <React.Fragment key={stage.key}>
                    <div
                      className="w-[205px] shrink-0 flex flex-col"
                      style={{ paddingTop: `${stepMarginTop}px` }}
                    >
                      <button
                        type="button"
                        disabled={!s}
                        onClick={() => s && setInspectedRound(stage.key)}
                        className={`text-left w-full rounded-lg border transition-all overflow-hidden ${
                          isSelected
                            ? 'border-amber-400 bg-slate-900/95 ring-2 ring-amber-400/35'
                            : isCurrent
                            ? 'border-amber-500/70 bg-slate-900/90 hover:border-amber-400'
                            : s
                            ? 'border-white/15 bg-white/[0.04] hover:border-white/35 cursor-pointer'
                            : 'border-white/10 bg-white/[0.02] opacity-80 cursor-default'
                        }`}
                      >
                        {/* Stage Header */}
                        <div
                          className={`px-2.5 py-1.5 border-b border-white/10 flex items-center justify-between text-[10px] font-bold ${
                            isCurrent
                              ? 'bg-amber-500/20 text-amber-300'
                              : s?.winnerTeam
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-white/[0.03] text-slate-400'
                          }`}
                        >
                          <span>
                            {idx + 1}R · {stage.shortTitle}
                          </span>
                          <span>
                            {isCurrent ? '진행중' : s?.winnerTeam ? '종료' : stage.subtitle}
                          </span>
                        </div>

                        {/* Top Seed Slot */}
                        <div
                          className={`px-2.5 py-2 flex items-center justify-between gap-2 text-xs border-b border-white/10 ${
                            s && s.winnerTeam === s.higherSeedTeam
                              ? 'bg-amber-500/15 text-white font-extrabold'
                              : 'text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono-stats text-[10px] text-amber-300/90 w-4 shrink-0">
                              {stage.waitingHigherRank}위
                            </span>
                            {s ? (
                              <>
                                <TeamLogo teamId={s.higherSeedTeam} size="xs" />
                                <span className="truncate font-bold">
                                  {KBO_TEAMS[s.higherSeedTeam].shortName}
                                </span>
                              </>
                            ) : waitingHigherTeam ? (
                              <>
                                <TeamLogo teamId={waitingHigherTeam} size="xs" />
                                <span className="truncate font-semibold text-slate-300">
                                  {KBO_TEAMS[waitingHigherTeam].shortName}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-500">시드 대기</span>
                            )}
                          </div>
                          <span className="font-mono-stats font-black text-sm">
                            {s ? s.higherWins : '-'}
                          </span>
                        </div>

                        {/* Challenger Slot */}
                        <div
                          className={`px-2.5 py-2 flex items-center justify-between gap-2 text-xs ${
                            s && s.winnerTeam === s.lowerSeedTeam
                              ? 'bg-amber-500/15 text-white font-extrabold'
                              : 'text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono-stats text-[10px] text-slate-400 w-4 shrink-0">
                              {s ? `${s.lowerSeedRank}위` : stage.key === 'WILDCARD' ? '5위' : '승'}
                            </span>
                            {s ? (
                              <>
                                <TeamLogo teamId={s.lowerSeedTeam} size="xs" />
                                <span className="truncate font-bold">
                                  {KBO_TEAMS[s.lowerSeedTeam].shortName}
                                </span>
                              </>
                            ) : waitingFifthTeam ? (
                              <>
                                <TeamLogo teamId={waitingFifthTeam} size="xs" />
                                <span className="truncate text-slate-300">
                                  {KBO_TEAMS[waitingFifthTeam].shortName}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-500 text-[11px] truncate">
                                {stage.waitingLowerLabel}
                              </span>
                            )}
                          </div>
                          <span className="font-mono-stats font-black text-sm">
                            {s ? s.lowerWins : '-'}
                          </span>
                        </div>
                      </button>

                      <div className="text-[10px] text-slate-400 mt-1 px-1 flex items-center justify-between">
                        <span>{stage.formatLabel}</span>
                        {s?.winnerTeam && (
                          <span className="text-amber-300 font-bold">
                            {KBO_TEAMS[s.winnerTeam].shortName} 진출
                          </span>
                        )}
                      </div>
                    </div>

                    {/* SVG Connector Arrow to Next Round / Champion */}
                    <div
                      className="w-8 shrink-0 flex items-center justify-center"
                      style={{ paddingTop: `${Math.max(0, stepMarginTop - 8)}px` }}
                    >
                      <svg
                        width="32"
                        height="64"
                        viewBox="0 0 32 64"
                        className="overflow-visible"
                        aria-hidden="true"
                      >
                        <path
                          d={idx < 3 ? 'M 0 38 H 14 V 20 H 30' : 'M 0 30 H 30'}
                          fill="none"
                          stroke={s?.winnerTeam ? '#f59e0b' : 'rgba(148,163,184,0.35)'}
                          strokeWidth={s?.winnerTeam ? '2.2' : '1.5'}
                          strokeLinecap="round"
                        />
                        <polygon
                          points={idx < 3 ? '26,16 32,20 26,24' : '26,26 32,30 26,34'}
                          fill={s?.winnerTeam ? '#f59e0b' : 'rgba(148,163,184,0.4)'}
                        />
                      </svg>
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Champion Trophy Node */}
              <div className="w-[162px] shrink-0 flex flex-col pt-0">
                <div
                  className={`rounded-lg border px-3 py-2.5 text-center h-[126px] flex flex-col items-center justify-center ${
                    ps.champion
                      ? 'border-amber-400 bg-gradient-to-b from-amber-500/25 to-amber-500/5'
                      : 'border-white/15 bg-white/[0.03]'
                  }`}
                >
                  {ps.champion ? (
                    <div className="flex items-center gap-2.5">
                      <div className="w-11 h-15 shrink-0">
                        <KboOfficialTrophySvg
                          season={career.season}
                          accentColor={KBO_TEAMS[ps.champion].primaryColor}
                          ariaLabel={`${career.season} KBO 한국시리즈 우승 트로피`}
                        />
                      </div>
                      <div className="text-left min-w-0">
                        <TeamLogo teamId={ps.champion} size="xs" />
                        <div className="text-[9px] font-extrabold tracking-wider text-amber-300 mt-1">
                          KBO CHAMPION
                        </div>
                        <div className="text-[11px] font-black text-white leading-tight truncate">
                          {KBO_TEAMS[ps.champion].shortName}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-14 mb-1 opacity-90">
                        <KboOfficialTrophySvg
                          season={career.season}
                          ariaLabel="KBO 한국시리즈 공식 우승 트로피"
                        />
                      </div>
                      <div className="text-[10px] font-bold tracking-wider text-amber-300/90">
                        KOREAN SERIES
                      </div>
                      <div className="text-[11px] text-slate-300">한국시리즈 우승 트로피</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected / Live Matchup Scoreboard */}
        {activeSeries && (
          <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="flex items-center justify-between md:justify-end gap-4">
              <div className="text-left md:text-right">
                <div className="text-[11px] text-amber-300 font-semibold">
                  정규시즌 {activeSeries.higherSeedRank}위
                </div>
                <div className="text-lg font-black">{KBO_TEAMS[activeSeries.higherSeedTeam].name}</div>
                {activeSeries.higherSeedTeam === career.playerTeamId && (
                  <div className="text-[11px] text-sky-300 font-bold">우리 구단</div>
                )}
              </div>
              <TeamLogo teamId={activeSeries.higherSeedTeam} size="lg" />
            </div>

            <div className="text-center py-2.5 px-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-[10px] tracking-widest uppercase text-slate-400 flex items-center justify-center gap-1">
                <span>{activeSeries.label}</span>
                {inspectedRound && liveSeries && inspectedRound !== liveSeries.round && (
                  <button
                    type="button"
                    onClick={() => setInspectedRound(null)}
                    className="ml-1 text-amber-300 underline"
                  >
                    현재 라운드로
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center justify-center gap-5 font-mono-stats">
                <span className="text-4xl font-black text-amber-400">{activeSeries.higherWins}</span>
                <span className="text-lg text-slate-500">:</span>
                <span className="text-4xl font-black text-white">{activeSeries.lowerWins}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-300">
                {activeSeries.winnerTeam
                  ? `${KBO_TEAMS[activeSeries.winnerTeam].shortName} 시리즈 승리 확정`
                  : `시리즈 ${activeSeries.games.length}경기 소화 완료`}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <TeamLogo teamId={activeSeries.lowerSeedTeam} size="lg" />
              <div>
                <div className="text-[11px] text-slate-400 font-semibold">
                  정규시즌 {activeSeries.lowerSeedRank}위
                </div>
                <div className="text-lg font-black">{KBO_TEAMS[activeSeries.lowerSeedTeam].name}</div>
                {activeSeries.lowerSeedTeam === career.playerTeamId && (
                  <div className="text-[11px] text-sky-300 font-bold">우리 구단</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pitching Matchup & Series Games + MVP Race */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-4">
          {activeSeries && highStarter && lowStarter && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">
                <Flame className="w-4 h-4 text-amber-500" />
                <span>{activeSeries.label} 에이스 선발 매치업 · 구종 및 구속 비교</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { teamId: activeSeries.higherSeedTeam, pitcher: highStarter },
                  { teamId: activeSeries.lowerSeedTeam, pitcher: lowStarter },
                ].map(({ teamId, pitcher }) => {
                  const rep = pitcher.pitchRepertoire ?? buildPitchRepertoire(pitcher);
                  return (
                    <div
                      key={pitcher.id}
                      onClick={() => onSelectPlayer?.(pitcher.id)}
                      className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-amber-400 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <TeamLogo teamId={teamId} size="sm" />
                        <div>
                          <div className="text-xs font-black text-slate-900 dark:text-white">
                            {pitcher.name}{' '}
                            <span className="font-mono-stats text-indigo-600 dark:text-indigo-400">
                              OVR {pitcher.ability}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {rep.throws} · 평균 {rep.avgVelocityKmh}km/h (최고 {rep.maxVelocityKmh}) ·{' '}
                            {pitcher.hiddenTrait ?? '꾸준함'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 text-[11px] text-slate-600 dark:text-slate-300 font-mono-stats">
                        {rep.pitches.map((pt) => `${pt.name} ${pt.grade}`).join(' · ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span>{activeSeries?.label ?? '포스트시즌'} 경기별 스코어보드</span>
              </div>
              {activeSeries && (
                <span className="text-[11px] font-mono-stats text-slate-400 flex items-center gap-1">
                  <ChevronRight className="w-3.5 h-3.5" />
                  총 {activeSeries.games.length}경기
                </span>
              )}
            </div>
            {!activeSeries || activeSeries.games.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                아직 진행된 포스트시즌 경기가 없습니다. 상단 버튼으로 1차전을 시작하세요.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeSeries.games.map((g, i) => (
                  <div
                    key={g.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono-stats font-bold text-amber-600 dark:text-amber-400 w-10">
                        {i + 1}차전
                      </span>
                      <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                        <TeamLogo teamId={g.awayTeam} size="xs" />
                        <span>{KBO_TEAMS[g.awayTeam].shortName}</span>
                        <span className="font-mono-stats text-sm px-1.5">
                          {g.awayRuns} : {g.homeRuns}
                        </span>
                        <span>{KBO_TEAMS[g.homeTeam].shortName}</span>
                        <TeamLogo teamId={g.homeTeam} size="xs" />
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 text-right">
                      <div>
                        {g.isDraw ? '무승부' : `${KBO_TEAMS[g.winner as TeamId].shortName} 승`}
                        {g.keyPerformers[0]
                          ? ` · ${g.keyPerformers[0].playerName} (${g.keyPerformers[0].summary})`
                          : ''}
                      </div>
                      {g.weather && <div className="text-[10px] text-slate-400">{g.weather.summary}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">
            <Award className="w-4 h-4 text-amber-500" />
            <span>가을야구 MVP 레이스 (포스트시즌 누적)</span>
          </div>
          {mvpCandidates.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">
              <Sparkles className="w-5 h-5 mx-auto mb-2 text-slate-400" />
              포스트시즌 경기가 진행되면 시리즈 MVP 후보가 실시간 집계됩니다.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {mvpCandidates.map((item, idx) => (
                <div
                  key={item.player.id}
                  onClick={() => onSelectPlayer?.(item.player.id)}
                  className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`font-mono-stats text-xs font-black w-5 ${
                        idx === 0 ? 'text-amber-500' : 'text-slate-400'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <TeamLogo teamId={item.player.teamId} size="xs" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {item.player.name}{' '}
                        <span className="font-normal text-slate-500">({item.player.position})</span>
                      </div>
                      <div className="text-[11px] font-mono-stats text-slate-500 dark:text-slate-400 truncate">
                        {item.line}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                    {item.player.hiddenTrait}
                  </span>
                </div>
              ))}
            </div>
          )}

          {seeds.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[11px] text-slate-500">
              <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                5강 시드: {seeds.map((t, i) => `${i + 1}위 ${KBO_TEAMS[t].shortName}`).join(' · ')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
