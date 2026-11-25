import React, { useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Crown,
  Flag,
  Globe,
  Layers,
  Shield,
  Shirt,
  Trophy,
  Users,
} from 'lucide-react';
import {
  FUTURES_NORTH_TEAMS,
  FUTURES_SOUTH_TEAMS,
  FUTURES_TEAMS_META,
  KBO_TEAMS,
  normalizeChampionHistory,
  TEAM_IDS,
} from '../data/kboTeams';
import {
  buildRealisticRetirementAchievement,
  enlistPlayerToSangmu,
  getScheduledNationalTournamentsForSeason,
  INITIAL_2026_KBO_RULES,
  isPlayerOnNationalTeamDuty,
  retirePlayerUniformNumber,
  runNationalTeamTournament,
} from '../engine/franchiseSystems';
import { getClubTitleCount } from '../engine/leagueLifeEngine';
import { getNationalityDisplay } from '../data/playerMetadata';
import { formatIP } from '../engine/stats';
import {
  evaluateUlsanTransferEligibility,
  getUlsanTransferWindowStatus,
  transferPlayerFromUlsanWhales,
} from '../engine/specialFuturesEngine';
import { canPlayerEnlistMilitary, isMilitaryServing } from '../engine/militaryEngine';
import { CareerSave, FuturesTeamId, Position, TeamId } from '../types/kbo';
import { ClubUniformCard } from './ClubUniformCard';
import { NationalityBadge } from './CountryFlag';
import { KoreanSeriesTrophyLogo } from './KoreanSeriesTrophyLogo';
import {
  FranchiseStarIcon,
  isFranchiseStarPlayer,
  PlayerCompactTag,
  PlayerForeignFlag,
} from './PlayerStatusCompact';
import { Real2026ArchiveView } from './Real2026ArchiveView';
import { FuturesTeamLogo, TeamLogo } from './TeamLogo';

interface LeagueHubViewProps {
  career: CareerSave;
  section?: 'operations' | 'history';
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
  onSelectPlayer?: (playerId: string) => void;
}

type HubTab = 'futures' | 'sangmu' | 'ulsan' | 'national' | 'history';

export const LeagueHubView: React.FC<LeagueHubViewProps> = ({
  career,
  section = 'operations',
  onUpdateCareer,
  onNotify,
  onSelectPlayer,
}) => {
  const [hubTab, setHubTab] = useState<HubTab>(section === 'history' ? 'history' : 'futures');
  const effectiveTab: HubTab = section === 'history' ? 'history' : hubTab === 'history' ? 'futures' : hubTab;
  const [selectedRetirePlayerId, setSelectedRetirePlayerId] = useState<string>('');
  const [retireName, setRetireName] = useState('');
  const [retireNum, setRetireNum] = useState('99');
  const [retirePos, setRetirePos] = useState<Position>('1B');
  const [retireNote, setRetireNote] = useState('');
  const [ulsanFilter, setUlsanFilter] = useState<'ALL' | 'FOREIGN' | 'DRAFTED' | 'UNDRAFTED'>('ALL');
  const [sangmuScope, setSangmuScope] = useState<'ALL' | 'MINE'>('ALL');
  const [historySubTab, setHistorySubTab] = useState<'overview' | 'archive2026' | 'uniforms' | 'rookies'>('overview');
  const rookieSeasons = useMemo(() => {
    const keys = Object.keys(career.rookieBonusRankingsBySeason ?? {})
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => b - a);
    return keys.length > 0 ? keys : [career.season];
  }, [career.rookieBonusRankingsBySeason, career.season]);
  const [selectedRookieSeason, setSelectedRookieSeason] = useState<number>(rookieSeasons[0]);
  const activeRookieList =
    career.rookieBonusRankingsBySeason?.[selectedRookieSeason] ??
    career.rookieBonusRankingsBySeason?.[rookieSeasons[0]] ??
    [];
  const rewardsLog = career.championshipRewardsLog ?? [];

  const myTeam = career.playerTeamId;
  const myPlayers = useMemo(
    () => Object.values(career.players).filter((p) => p.teamId === myTeam),
    [career.players, myTeam]
  );

  const buildFuturesDivisionRows = (ids: FuturesTeamId[]) => {
    const map = career.futuresStandings;
    return ids
      .map((tid) => {
        const meta = FUTURES_TEAMS_META[tid];
        const row = map?.[tid] ?? {
          teamId: tid,
          division: meta.division,
          officialName: meta.officialName,
          homeCity: meta.homeCity,
          games: 0,
          wins: 0,
          losses: 0,
          draws: 0,
        };
        const denom = row.wins + row.losses;
        return {
          ...row,
          officialName: meta.officialName,
          homeCity: meta.homeCity,
          division: meta.division,
          badgeColor: meta.badgeColor,
          pct: denom > 0 ? row.wins / denom : 0,
        };
      })
      .sort((a, b) => b.pct - a.pct || b.wins - a.wins);
  };

  const futuresNorthSorted = useMemo(
    () => buildFuturesDivisionRows(FUTURES_NORTH_TEAMS),
    [career.futuresStandings]
  );
  const futuresSouthSorted = useMemo(
    () => buildFuturesDivisionRows(FUTURES_SOUTH_TEAMS),
    [career.futuresStandings]
  );

  const upcomingNationalSchedule = useMemo(
    () => [
      ...getScheduledNationalTournamentsForSeason(career.season),
      ...getScheduledNationalTournamentsForSeason(career.season + 1),
      ...getScheduledNationalTournamentsForSeason(career.season + 2),
    ],
    [career.season]
  );

  const championHistoryAll = useMemo(
    () => normalizeChampionHistory(career.championHistory),
    [career.championHistory]
  );

  const championshipTally = useMemo(() => {
    const counts = new Map<TeamId, { teamId: TeamId; titles: number; seasons: number[] }>();
    for (const c of championHistoryAll) {
      const cur = counts.get(c.championTeamId) ?? {
        teamId: c.championTeamId,
        titles: 0,
        seasons: [],
      };
      cur.titles += 1;
      cur.seasons.push(c.season);
      counts.set(c.championTeamId, cur);
    }
    return [...counts.values()].sort((a, b) => b.titles - a.titles);
  }, [championHistoryAll]);

  const myFuturesPlayers = useMemo(
    () =>
      myPlayers
        .filter((p) => p.rosterTier === '2군' || p.rosterTier === '육성')
        .sort((a, b) => b.potential - a.potential),
    [myPlayers]
  );

  const sangmuEligible = useMemo(
    () =>
      myPlayers
        .filter((p) => canPlayerEnlistMilitary(p, { allowPlanned: true, maxAge: 27 }))
        .sort((a, b) => b.potential - a.potential),
    [myPlayers]
  );

  const sangmuServing = useMemo(
    () => myPlayers.filter((p) => isMilitaryServing(p.militaryStatus)),
    [myPlayers]
  );

  const allSangmuServing = useMemo(
    () =>
      Object.values(career.players)
        .filter((p) => isMilitaryServing(p.militaryStatus))
        .sort(
          (a, b) =>
            (a.teamId === myTeam ? -1 : b.teamId === myTeam ? 1 : 0) ||
            (a.militaryReturnSeason ?? 9999) - (b.militaryReturnSeason ?? 9999) ||
            (a.militaryReturnRound ?? 0) - (b.militaryReturnRound ?? 0) ||
            b.ability - a.ability
        ),
    [career.players, myTeam]
  );

  const ulsanWindowStatus = useMemo(() => getUlsanTransferWindowStatus(career), [career]);
  const ulsanActiveRoster = useMemo(
    () => (career.ulsanWhales?.roster ?? []).filter((p) => !p.transferredToTeamId),
    [career.ulsanWhales]
  );
  const ulsanForeignCount = useMemo(
    () => ulsanActiveRoster.filter((p) => p.isForeign).length,
    [ulsanActiveRoster]
  );
  const ulsanFilteredRoster = useMemo(() => {
    return ulsanActiveRoster
      .filter((p) => {
        if (ulsanFilter === 'FOREIGN') return p.isForeign;
        if (ulsanFilter === 'DRAFTED') return !p.isForeign && p.hasKboDraftHistory;
        if (ulsanFilter === 'UNDRAFTED') return !p.isForeign && !p.hasKboDraftHistory;
        return true;
      })
      .sort((a, b) => b.ability - a.ability || b.potential - a.potential);
  }, [ulsanActiveRoster, ulsanFilter]);

  const currentSeasonTournamentDone = (career.nationalTeamEvents ?? []).some(
    (e) => e.season === career.season
  );

  const handleEnlist = (playerId: string) => {
    try {
      const { nextCareer, backupSnapshot } = enlistPlayerToSangmu(career, playerId);
      onUpdateCareer(nextCareer, backupSnapshot);
      onNotify('상무 야구단 입대가 확정되었습니다.', 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '상무 입대 실패', 'error');
    }
  };

  const handleUlsanTransfer = (ulsanPlayerId: string) => {
    try {
      const { nextCareer, backupSnapshot, player, transferFeeBillion } =
        transferPlayerFromUlsanWhales(career, ulsanPlayerId);
      onUpdateCareer(nextCareer, backupSnapshot);
      onNotify(
        `울산 웨일즈 ${player.name}(${player.position}) 양도 영입 완료! (이적료 ${transferFeeBillion.toFixed(2)}억 · 2군 합류)`,
        'success'
      );
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '울산 웨일즈 이적 영입 실패', 'error');
    }
  };

  const handleNationalTeam = () => {
    try {
      const { nextCareer, backupSnapshot } = runNationalTeamTournament(career);
      onUpdateCareer(nextCareer, backupSnapshot);
      onNotify(`${career.season} 국가대표 국제대회가 완료되었습니다!`, 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '국제대회 진행 실패', 'error');
    }
  };

  const retireCandidates = useMemo(
    () =>
      myPlayers
        .filter((p) => p.uniformNumber !== undefined)
        .sort((a, b) => (b.rosterTier === '은퇴' ? 1 : 0) - (a.rosterTier === '은퇴' ? 1 : 0) || b.serviceYears - a.serviceYears || b.ability - a.ability),
    [myPlayers]
  );

  const handleSelectRetireCandidate = (playerId: string) => {
    setSelectedRetirePlayerId(playerId);
    const p = career.players[playerId];
    if (!p) return;
    setRetireName(p.name);
    setRetireNum(String(p.uniformNumber ?? 99));
    setRetirePos(p.position);
    setRetireNote(buildRealisticRetirementAchievement(p, career));
  };

  const handleRetireNumber = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { nextCareer, backupSnapshot } = retirePlayerUniformNumber(
        career,
        retireName,
        retirePos,
        Number(retireNum),
        retireNote,
        selectedRetirePlayerId || undefined
      );
      onUpdateCareer(nextCareer, backupSnapshot);
      setSelectedRetirePlayerId('');
      setRetireName('');
      setRetireNote('');
      onNotify(`No.${retireNum} ${retireName} 영구결번 지정 완료!`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '영구결번 지정 실패', 'error');
    }
  };

  const trophies = career.leagueHistory?.trophies ?? [];
  const hof = career.leagueHistory?.hallOfFame ?? [];
  const retiredNumbers = career.leagueHistory?.retiredNumbers ?? [];
  const clubRecords = career.leagueHistory?.clubRecords ?? [];
  const activeRules =
    career.activeKboRules && career.activeKboRules.length > 0
      ? career.activeKboRules
      : INITIAL_2026_KBO_RULES;
  const ruleHistory = career.ruleChangeHistory ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {section === 'history' ? (
              <BookOpen className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            ) : (
              <Layers className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            )}
            {section === 'history'
              ? '트로피 · KBO 역대 통산 기록 · 영구결번 · 규정'
              : '퓨처스리그 · 상무 병역 · 국가대표'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {section === 'history'
              ? '역대 한국시리즈 우승 기록, 구단 트로피 진열장, KBO 레전드 통산 기록, 영구결번 지정 및 시즌별 KBO 규정을 확인합니다.'
              : '2군 퓨처스 북부·남부 순위, 상무 피닉스(1년 6개월) 병역 관리 및 국제대회 국가대표 차출(병역 특례)을 운영합니다.'}
          </p>
        </div>

        {section === 'operations' && (
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'futures' as const, label: '2군 퓨처스리그' },
              { id: 'sangmu' as const, label: `상무 피닉스 (${allSangmuServing.length})` },
              { id: 'ulsan' as const, label: `울산 웨일즈 (${ulsanActiveRoster.length})` },
              { id: 'national' as const, label: '국가대표 차출' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setHubTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                  effectiveTab === t.id
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 1. FUTURES LEAGUE (North 6 + South 6 = 12 Teams) */}
      {effectiveTab === 'futures' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 space-y-4">
            {(
              [
                { title: '북부리그 (6개 구단 · 상무 피닉스 포함)', rows: futuresNorthSorted, accent: 'text-blue-600 dark:text-blue-400' },
                { title: '남부리그 (6개 구단 · 울산 웨일즈 포함)', rows: futuresSouthSorted, accent: 'text-emerald-600 dark:text-emerald-400' },
              ] as const
            ).map((div) => (
              <div
                key={div.title}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className={`text-xs font-extrabold ${div.accent}`}>
                    {career.season} 퓨처스 {div.title}
                  </h3>
                  <span className="text-[11px] text-slate-500">정규 3연전 동시 진행</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2.5 text-left">순위</th>
                        <th className="py-1.5 px-2 text-left">구단 (연고지)</th>
                        <th className="py-1.5 px-1.5 text-right">G</th>
                        <th className="py-1.5 px-1.5 text-right">승</th>
                        <th className="py-1.5 px-1.5 text-right">패</th>
                        <th className="py-1.5 px-1.5 text-right">무</th>
                        <th className="py-1.5 px-2.5 text-right">승률</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {div.rows.map((row, idx) => (
                        <tr
                          key={row.teamId}
                          className={row.teamId === myTeam ? 'bg-orange-50/70 dark:bg-orange-950/25 font-bold' : ''}
                        >
                          <td className="py-1.5 px-2.5 font-mono-stats font-bold">{idx + 1}</td>
                          <td className="py-1.5 px-2 font-semibold">
                            <div className="flex items-center gap-2">
                              <FuturesTeamLogo teamId={row.teamId} size="xs" />
                              <span className="truncate">
                                {row.officialName}
                                <span className="text-[10px] font-normal text-slate-400 ml-1">
                                  ({row.homeCity})
                                </span>
                              </span>
                            </div>
                          </td>
                            <td className="py-1.5 px-1.5 text-right font-mono-stats">{row.games}</td>
                            <td className="py-1.5 px-1.5 text-right font-mono-stats">{row.wins}</td>
                            <td className="py-1.5 px-1.5 text-right font-mono-stats">{row.losses}</td>
                            <td className="py-1.5 px-1.5 text-right font-mono-stats">{row.draws}</td>
                            <td className="py-1.5 px-2.5 text-right font-mono-stats font-semibold">
                              {row.pct.toFixed(3).replace(/^0/, '')}
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {KBO_TEAMS[myTeam].shortName} 2군 육성·재활 선수 퓨처스 성적 ({myFuturesPlayers.length}명)
              </h3>
              <span className="text-[11px] text-slate-500">유망주 실전 성장 · 부진 선수 재조정</span>
            </div>
            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                  <tr>
                    <th className="py-2 px-3 text-left">선수</th>
                    <th className="py-2 px-2 text-left">포지션</th>
                    <th className="py-2 px-2 text-right">나이</th>
                    <th className="py-2 px-2 text-right">능력/잠재</th>
                    <th className="py-2 px-2 text-right">폼</th>
                    <th className="py-2 px-3 text-left">퓨처스 누적 성적 · 상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {myFuturesPlayers.map((p) => {
                    const fs = p.futuresStats;
                    const statText =
                      !fs || fs.G === 0
                        ? '출전 대기'
                        : p.role === '타자'
                        ? `${fs.G}G 타율 ${(fs.AB > 0 ? fs.H / fs.AB : 0).toFixed(3).replace(/^0/, '')} (${fs.H}/${fs.AB}) ${fs.HR}HR ${fs.RBI}RBI`
                        : `${fs.G}G ${fs.W}승${fs.L}패 ${formatIP(fs.outs)}이닝 ERA ${
                            fs.outs > 0 ? ((fs.ER * 27) / fs.outs).toFixed(2) : '0.00'
                          } ${fs.SO}K`;
                    return (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            {p.uniformNumber !== undefined && (
                              <span className="font-mono-stats text-[11px] text-slate-400">
                                #{p.uniformNumber}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectPlayer?.(p.id)}
                              className="hover:text-orange-600 dark:hover:text-orange-400 hover:underline text-left"
                            >
                              {p.name}
                            </button>
                            <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                            <PlayerForeignFlag player={p} />
                            <PlayerCompactTag career={career} player={p} />
                          </div>
                        </td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400">{p.position}</td>
                        <td className="py-2 px-2 text-right font-mono-stats">{p.age}</td>
                        <td className="py-2 px-2 text-right font-mono-stats font-semibold">
                          {p.ability}/{p.potential}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-stats">
                          {p.form > 0 ? `+${p.form}` : p.form}
                        </td>
                        <td className="py-2 px-3 font-mono-stats text-slate-700 dark:text-slate-300">
                          {statText}
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

      {/* 2. SANGMU MILITARY SERVICE (1년 6개월 · 216G · 현실 전체 선수단 + 원소속팀 복귀) */}
      {effectiveTab === 'sangmu' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FuturesTeamLogo teamId="상무" size="md" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-500" />
                    상무 피닉스 야구단 (국군체육부대 · 북부리그)
                  </div>
                  <div className="text-[11px] font-normal text-slate-500">
                    전체 복무 {allSangmuServing.length}명 · 우리 구단 {sangmuServing.length}명 · 복무 종료 시 원소속팀 자동 복귀
                  </div>
                </div>
              </h3>
              <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setSangmuScope('ALL')}
                  className={`px-2.5 py-1 font-bold ${
                    sangmuScope === 'ALL'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  전체 상무 ({allSangmuServing.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSangmuScope('MINE')}
                  className={`px-2.5 py-1 font-bold ${
                    sangmuScope === 'MINE'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  우리 구단 ({sangmuServing.length})
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              현실 상무 피닉스 소속 선수들과 새로 입대한 미필 국내 선수들은 <strong>1년 6개월(216경기)</strong> 동안 북부리그 상무 소속으로 퓨처스리그 실전을 소화한 뒤 전역 시점에 <strong>원소속팀</strong>으로 자동 복귀(군필 전환·능력치 +2~+4 성장)합니다.
            </p>

            {(sangmuScope === 'ALL' ? allSangmuServing : sangmuServing).length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded">
                해당 조건으로 상무에서 복무 중인 선수가 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[460px] overflow-y-auto pr-1">
                {(sangmuScope === 'ALL' ? allSangmuServing : sangmuServing).map((p) => {
                  const fs = p.futuresStats;
                  const sangmuStatText =
                    fs && fs.G > 0
                      ? p.role === '타자'
                        ? `상무 퓨처스 ${fs.G}G 타율 ${(fs.AB > 0 ? fs.H / fs.AB : 0).toFixed(3).replace(/^0/, '')} ${fs.HR}HR ${fs.RBI}RBI`
                        : `상무 퓨처스 ${fs.G}G ${fs.W}승${fs.L}패 ${formatIP(fs.outs)}IP ERA ${
                            fs.outs > 0 ? ((fs.ER * 27) / fs.outs).toFixed(2) : '0.00'
                          }`
                      : '상무 퓨처스 출전 대기';
                  const isMine = p.teamId === myTeam;
                  return (
                    <div
                      key={p.id}
                      className={`py-2.5 flex items-center justify-between gap-2 text-xs ${
                        isMine ? 'bg-orange-50/40 dark:bg-orange-950/15 -mx-2 px-2 rounded' : ''
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <TeamLogo teamId={p.teamId} size="xs" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 whitespace-nowrap min-w-0">
                            <button
                              type="button"
                              onClick={() => onSelectPlayer?.(p.id)}
                              className="font-bold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 hover:underline truncate"
                            >
                              {p.name}
                            </button>
                            <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                            <span className="text-[11px] text-slate-500 shrink-0">
                              {p.position} · {p.age}세 · OVR {p.ability}/{p.potential} · {KBO_TEAMS[p.teamId].shortName}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono-stats text-blue-700 dark:text-blue-300 mt-0.5">
                            {sangmuStatText}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono-stats font-semibold text-emerald-600 dark:text-emerald-400 shrink-0 text-right">
                        {p.militaryDischargeDate
                          ? `${p.militaryDischargeDate} 전역`
                          : `${p.militaryReturnSeason}시즌 R${p.militaryReturnRound ?? 62} 복귀`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {KBO_TEAMS[myTeam].shortName} 상무 지원 가능 미필 국내 선수 (만 27세 이하 · {sangmuEligible.length}명)
            </h3>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[460px] overflow-y-auto">
              {sangmuEligible.map((p) => (
                <div key={p.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectPlayer?.(p.id)}
                      className="font-bold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 hover:underline truncate"
                    >
                      {p.name}
                    </button>
                    <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                    <span className="text-slate-500 shrink-0">
                      {p.position} · {p.age}세 · {p.rosterTier} · {p.ability}/{p.potential}
                    </span>
                    <PlayerCompactTag career={career} player={p} />
                  </div>
                  <button
                    onClick={() => handleEnlist(p.id)}
                    className="px-2.5 py-1 rounded text-xs font-semibold border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors shrink-0"
                  >
                    상무 입대
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2B. ULSAN WHALES (울산 웨일즈 현실 선수단 및 특별 규정) */}
      {effectiveTab === 'ulsan' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FuturesTeamLogo teamId="울산" size="lg" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    울산 웨일즈 (Ulsan Whales · 퓨처스 남부리그 시민프로야구단)
                  </h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {career.ulsanWhales?.coachesSummary ?? '장원진 감독 · 박명환 투수코치 · 황선일 타격코치'} · 홈구장: 울산 문수야구장
                  </div>
                </div>
              </div>
              <div className="text-right text-xs font-mono-stats">
                <div
                  className={`font-bold ${
                    ulsanWindowStatus.isOpen
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {ulsanWindowStatus.isOpen ? '이적 가능 기간 진행 중' : '이적 제한 기간'} ({ulsanWindowStatus.currentDate})
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  시즌 이적 인원: <strong>{ulsanWindowStatus.usedTransfers}/{ulsanWindowStatus.maxTransfers}명</strong> · 외국인 등록: <strong>{ulsanForeignCount}/6명</strong>
                </div>
              </div>
            </div>

            {/* 울산 웨일즈 특별 규정 요약 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">자율 선발 · 외국인 · 연봉 특별 규정</div>
                <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  • 자율 선발 구성 (해외 진출 후 KBO 미입단 선수 포함)<br />
                  • 외국인 최대 <strong>6명</strong> 등록 · 1인당 총액 <strong>$100,000</strong> 이내<br />
                  • 국내 선수 최저 연봉 <strong>3,000만 원</strong> (KBO 규약 동일)
                </div>
              </div>
              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">이적 가능 기간 · 인원 · 이적료 규정</div>
                <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  • 이적 개시: <strong>{career.season}년 5월 20일부터</strong><br />
                  • 이적 기간: 포스트시즌 종료 익일 ~ <strong>7월 31일</strong><br />
                  • 시즌 최대 <strong>5명</strong> (10개 구단 대상) · 이적료 <strong>≤ 해당 선수 연봉</strong>
                </div>
              </div>
              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">드래프트 경력별 이적 자격</div>
                <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  • <strong>KBO 드래프트 참가 이력 국내 선수·외국인</strong>: 기간 중 즉시 이적 가능<br />
                  • <strong>드래프트 미참가 국내 선수</strong>: 차기 <strong>KBO 신인 드래프트</strong> 참가 후 지명 이적만 가능
                </div>
              </div>
            </div>

            <div
              className={`text-xs px-3 py-2 rounded border ${
                ulsanWindowStatus.isOpen
                  ? 'border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
                  : 'border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200'
              }`}
            >
              {ulsanWindowStatus.reason}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                울산 웨일즈 등록 선수단 ({ulsanFilteredRoster.length}명)
              </div>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {[
                  { id: 'ALL' as const, label: `전체 (${ulsanActiveRoster.length})` },
                  { id: 'FOREIGN' as const, label: `외국인 (${ulsanForeignCount}/6)` },
                  {
                    id: 'DRAFTED' as const,
                    label: `국내·드래프트 경력 (${ulsanActiveRoster.filter((p) => !p.isForeign && p.hasKboDraftHistory).length})`,
                  },
                  {
                    id: 'UNDRAFTED' as const,
                    label: `국내·드래프트 미참가 (${ulsanActiveRoster.filter((p) => !p.isForeign && !p.hasKboDraftHistory).length})`,
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setUlsanFilter(f.id)}
                    className={`px-2.5 py-1 rounded border font-semibold ${
                      ulsanFilter === f.id
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3 text-left">선수 · 구분</th>
                    <th className="py-2 px-2 text-left">포지션</th>
                    <th className="py-2 px-2 text-right">나이</th>
                    <th className="py-2 px-2 text-right">능력/잠재</th>
                    <th className="py-2 px-2 text-left">경력 · 퓨처스 성적</th>
                    <th className="py-2 px-2 text-right">연봉 / 최대 이적료</th>
                    <th className="py-2 px-3 text-right">이적(양도)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {ulsanFilteredRoster.map((up) => {
                    const check = evaluateUlsanTransferEligibility(career, up.id, myTeam);
                    const fs = up.futuresStats;
                    const statStr =
                      fs && fs.G > 0
                        ? up.role === '타자'
                          ? `${fs.G}G 타율 ${(fs.AB > 0 ? fs.H / fs.AB : 0).toFixed(3).replace(/^0/, '')} ${fs.HR}HR ${fs.RBI}RBI`
                          : `${fs.G}G ${fs.W}승${fs.L}패 ${formatIP(fs.outs)}IP ERA ${
                              fs.outs > 0 ? ((fs.ER * 27) / fs.outs).toFixed(2) : '0.00'
                            } ${fs.SO}K`
                        : '퓨처스 출전 대기';
                    return (
                      <tr key={up.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono-stats text-[11px] text-slate-400">#{up.uniformNumber}</span>
                            <span>{up.name}</span>
                            {up.isForeign ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                                <span>외국인 ·</span>
                                <NationalityBadge nationality={up.nationality} size="xs" />
                              </span>
                            ) : up.hasKboDraftHistory ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                드래프트 경력
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                                {up.isOverseasUnentered ? '해외 미입단 · 드래프트 필요' : '드래프트 미참가'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{up.scoutingNote}</div>
                        </td>
                        <td className="py-2.5 px-2 font-semibold">{up.position}</td>
                        <td className="py-2.5 px-2 text-right font-mono-stats">{up.age}</td>
                        <td className="py-2.5 px-2 text-right font-mono-stats font-bold">
                          {up.ability}/{up.potential}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="text-[11px] text-slate-700 dark:text-slate-300">{up.previousClub}</div>
                          <div className="text-[11px] font-mono-stats text-blue-700 dark:text-blue-300 mt-0.5">
                            {statStr}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono-stats">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {up.isForeign
                              ? `$${((up.totalCapUsd ?? 90_000) / 1000).toFixed(0)}K`
                              : `${(up.salaryKrwBillion * 10000).toLocaleString()}만`}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            상한 {check.maxTransferFeeBillion.toFixed(2)}억
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {check.requiresDraft ? (
                            <span
                              title={check.reason}
                              className="inline-block text-[10px] font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            >
                              신인 드래프트 대상
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!check.eligible}
                              title={check.reason}
                              onClick={() => handleUlsanTransfer(up.id)}
                              className="px-2.5 py-1 rounded text-[11px] font-bold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              양도 영입 ({check.maxTransferFeeBillion.toFixed(2)}억)
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {(career.ulsanWhales?.transferHistory?.length ?? 0) > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                울산 웨일즈 → KBO 구단 이적 기록 ({career.ulsanWhales!.transferHistory.length}건)
              </h4>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {career.ulsanWhales!.transferHistory.map((tx) => (
                  <div key={tx.id} className="py-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamId={tx.toTeamId} size="xs" />
                      <span className="font-bold">{tx.playerName}</span>
                      <span className="text-slate-500">
                        ({tx.position} · {tx.method}) → {KBO_TEAMS[tx.toTeamId].shortName}
                      </span>
                    </div>
                    <span className="font-mono-stats text-slate-600 dark:text-slate-400">
                      {tx.date} · {tx.method === '신인드래프트' ? '드래프트 지명' : `이적료 ${tx.transferFeeBillion.toFixed(2)}억`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. NATIONAL TEAM TOURNAMENTS (Real Schedule & Auto Call-up) */}
      {effectiveTab === 'national' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-blue-600" />
                  현실 국가대표 국제대회 일정 · 자동 차출 (WBC · 아시안게임 · 프리미어12 · 올림픽 · APBC)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  실제 4년 주기 국제대회 일정에 도달하면 해당 시점에 국가대표가 자동 차출·진행됩니다. <strong>아시안게임 금메달</strong> 및 <strong>올림픽 동메달 이상(금·은·동)</strong> 획득 시 미필 선수 병역 면제가 자동 부여되어 상무에 입대하지 않아도 됩니다.
                </p>
              </div>
              <button
                disabled={currentSeasonTournamentDone}
                onClick={handleNationalTeam}
                className="px-4 py-2 rounded-md text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {currentSeasonTournamentDone
                  ? `${career.season}시즌 대표팀 일정 진행됨`
                  : `${career.season} 대표팀 즉시 조기 소집`}
              </button>
            </div>

            {career.activeNationalTeamDuty &&
              career.gamesPlayed < career.activeNationalTeamDuty.endRound && (
                <div className="p-3 rounded border border-blue-500/50 bg-blue-500/10 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-extrabold text-blue-800 dark:text-blue-200">
                      🇰🇷 국가대표 소집 진행 중 — {career.activeNationalTeamDuty.tournamentName}
                    </span>
                    <span className="font-mono-stats font-bold text-blue-700 dark:text-blue-300">
                      정규시즌 출장 제외 · 잔여 {career.activeNationalTeamDuty.endRound - career.gamesPlayed}경기 (R{career.activeNationalTeamDuty.endRound} 종료 후 자동 복귀)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {career.activeNationalTeamDuty.playerIds
                      .map((pid) => career.players[pid])
                      .filter((p) => p && isPlayerOnNationalTeamDuty(p, career.gamesPlayed))
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectPlayer?.(p.id)}
                          className={`px-2 py-0.5 rounded text-[11px] border hover:border-orange-500 ${
                            p.teamId === myTeam
                              ? 'border-orange-500 bg-orange-500/15 text-orange-800 dark:text-orange-200 font-bold'
                              : 'border-blue-300 dark:border-blue-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          🇰🇷 {p.name} ({p.teamId}·{p.position})
                        </button>
                      ))}
                  </div>
                </div>
              )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {upcomingNationalSchedule.map((item) => {
                const done = (career.nationalTeamEvents ?? []).some(
                  (ev) => ev.season === item.season && ev.tournamentName === item.tournamentName
                );
                const isThisSeason = item.season === career.season;
                return (
                  <div
                    key={item.key}
                    className={`p-3 rounded border space-y-1 ${
                      done
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : isThisSeason
                        ? 'border-blue-500/40 bg-blue-500/5'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono-stats font-bold text-blue-600 dark:text-blue-400">
                        {item.monthLabel}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          done
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        }`}
                      >
                        {done ? '완료' : `${item.triggerRound}G 자동 차출`}
                      </span>
                    </div>
                    <div className="font-extrabold text-slate-900 dark:text-white leading-snug">
                      {item.tournamentName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {item.description}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Official KBO International Tournament FA Registration Compensation Days Table (#8) */}
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200">
                KBO 규약 국가대표 국제대회별 FA 등록일수 보상 기준 (145일 = 1시즌)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 font-mono-stats text-[11px]">
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="font-sans font-bold text-slate-900 dark:text-white">WBC</div>
                  <div className="text-slate-600 dark:text-slate-400">기본 10일 · 8강 20 · 4강 30 · 준우승 40 · 우승 60일</div>
                </div>
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="font-sans font-bold text-slate-900 dark:text-white">올림픽</div>
                  <div className="text-slate-600 dark:text-slate-400">기본 10일 · 동 30 · 은 40 · 금 60일 (+병역특례)</div>
                </div>
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="font-sans font-bold text-slate-900 dark:text-white">프리미어12</div>
                  <div className="text-slate-600 dark:text-slate-400">기본 10일 · 4강 20 · 준우승 30 · 우승 40일</div>
                </div>
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="font-sans font-bold text-slate-900 dark:text-white">아시안게임</div>
                  <div className="text-slate-600 dark:text-slate-400">기본 10일 · 은 15 · 금 25일 (+병역특례)</div>
                </div>
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="font-sans font-bold text-slate-900 dark:text-white">APBC</div>
                  <div className="text-slate-600 dark:text-slate-400">기본 5일 · 준우승 10 · 우승 15일</div>
                </div>
              </div>
            </div>
          </div>

          {(career.nationalTeamEvents ?? []).length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center text-xs text-slate-500">
              아직 진행된 국제대회 기록이 없습니다. 정규시즌을 진행하면 예정된 시점에 국가대표가 자동 차출됩니다.
            </div>
          ) : (
            <div className="space-y-3">
              {(career.nationalTeamEvents ?? []).map((ev) => (
                <div
                  key={ev.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                      <Flag className="w-4 h-4 text-blue-600" />
                      <span>{ev.tournamentName}</span>
                      <span className="text-orange-600 dark:text-orange-400">— {ev.resultTitle}</span>
                      {ev.compensationDaysAwarded !== undefined && ev.compensationDaysAwarded > 0 && (
                        <span className="text-[10px] font-mono-stats px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
                          FA 등록일수 +{ev.compensationDaysAwarded}일 지급
                        </span>
                      )}
                      {ev.isAutoCalledUp && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold">
                          자동 차출
                        </span>
                      )}
                      {ev.militaryExemptionGranted && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">
                          병역 특례 부여
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono-stats text-slate-500">
                      대회 MVP: {ev.mvpName} · {ev.date}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{ev.summary}</p>
                  {ev.compensationRuleLabel && (
                    <div className="text-[11px] font-mono-stats text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 rounded px-2.5 py-1.5">
                      보상일수 적용 내역: {ev.compensationRuleLabel} (대표팀 엔트리 {ev.selectedPlayers.length}명 전원 가산)
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ev.selectedPlayers.map((sp) => (
                      <button
                        key={sp.playerId}
                        type="button"
                        onClick={() => onSelectPlayer?.(sp.playerId)}
                        className={`px-2 py-0.5 rounded text-[11px] border hover:border-orange-500 ${
                          sp.teamId === myTeam
                            ? 'border-orange-500 text-orange-700 dark:text-orange-300 font-bold'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {sp.playerName} ({sp.teamId}·{sp.position})
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. TROPHIES, HOF, UNIFORMS, ROOKIE BONUS TOP 10, PERMANENT SEASON ARCHIVE, RETIRED NUMBERS & KBO RULES */}
      {effectiveTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
            {[
              { id: 'overview' as const, label: '트로피 · 역사 · 영구결번 · 규정', icon: BookOpen },
              { id: 'archive2026' as const, label: '2026 공식 시즌 아카이브', icon: Trophy },
              { id: 'uniforms' as const, label: '신규 유니폼 · 우승 보상', icon: Shirt },
              { id: 'rookies' as const, label: '신인 계약금 TOP 10', icon: Crown },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = historySubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistorySubTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'team-accent-bg shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {historySubTab === 'archive2026' && (
            <Real2026ArchiveView career={career} onSelectPlayer={onSelectPlayer} />
          )}

          {historySubTab === 'uniforms' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white mb-3">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  한국시리즈 우승 트로피 · 모기업 특별 보상 아카이브
                </div>
                <div className="flex flex-wrap items-center gap-6 mb-4">
                  {championHistoryAll.slice(0, 4).map((ch) => (
                    <KoreanSeriesTrophyLogo
                      key={`${ch.season}-${ch.championTeamId}`}
                      teamId={ch.championTeamId}
                      season={ch.season}
                      titleCount={getClubTitleCount(career, ch.championTeamId)}
                      size="sm"
                    />
                  ))}
                </div>
                {rewardsLog.length > 0 ? (
                  <div className="space-y-2">
                    {rewardsLog.map((rw) => (
                      <div
                        key={rw.season}
                        className="rounded-lg border border-amber-200/70 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs space-y-1.5"
                      >
                        <div className="font-bold text-slate-900 dark:text-white">
                          {rw.ringCeremonyHeadline}
                        </div>
                        {rw.specialAchievements.length > 0 && (
                          <div className="text-amber-700 dark:text-amber-300 font-semibold">
                            특수 업적: {rw.specialAchievements.join(' · ')}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                          {rw.postseasonRewards.map((pr) => (
                            <span
                              key={pr.teamId}
                              className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 font-mono-stats"
                            >
                              {pr.teamId} ({pr.finishLabel}): +{pr.parentCompanyBonusBillion.toFixed(1)}억
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    포스트시즌 성적 차등 보너스(우승 +25억 · 준우승 +12억 · PO +6억 · 준PO +3억 · WC +1.5억) 및 우승 구단 차기 예산 +10% 혜택은 한국시리즈 종료 시 자동 정산됩니다.
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                    <Users className="w-4 h-4 team-accent-text" />
                    {career.season} 시즌 KBO 10개 구단 공식 신규 유니폼
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    매년 새 시즌 개막 전 전 구단 신규 유니폼 자동 공개
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {TEAM_IDS.map((tid) => {
                    const ed = career.teams[tid]?.currentUniform;
                    if (!ed) return null;
                    return <ClubUniformCard key={tid} edition={ed} />;
                  })}
                </div>
              </div>
            </div>
          )}

          {historySubTab === 'rookies' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    연도별 KBO 신인 계약금 순위 TOP 10
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    매년 신인 드래프트 완료 시 최고 계약금 신인 10명이 공식 발표·보존됩니다.
                  </p>
                </div>
                <select
                  value={selectedRookieSeason}
                  onChange={(e) => setSelectedRookieSeason(Number(e.target.value))}
                  className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-mono-stats"
                >
                  {rookieSeasons.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr} 신인 드래프트
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 text-center w-12">순위</th>
                      <th className="py-2.5 px-3 text-left">선수명</th>
                      <th className="py-2.5 px-3 text-left">지명 구단</th>
                      <th className="py-2.5 px-2 text-center">지명 순위</th>
                      <th className="py-2.5 px-3 text-left">출신교</th>
                      <th className="py-2.5 px-2 text-center">능력 / 잠재</th>
                      <th className="py-2.5 px-3 text-right">계약금</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {activeRookieList.map((entry) => (
                      <tr key={`${entry.season}-${entry.rank}-${entry.playerName}`}>
                        <td className="py-2.5 px-3 text-center font-mono-stats font-extrabold text-amber-600 dark:text-amber-400">
                          {entry.rank}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                          {entry.playerName}{' '}
                          <span className="font-normal text-slate-400">({entry.position})</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="inline-flex items-center gap-1.5">
                            <TeamLogo teamId={entry.teamId} size="xs" />
                            <span className="font-semibold">{KBO_TEAMS[entry.teamId].shortName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono-stats">{entry.pickNotation}</td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{entry.school}</td>
                        <td className="py-2.5 px-2 text-center font-mono-stats">
                          {entry.ability} / <span className="text-sky-600 dark:text-sky-400 font-bold">{entry.potential}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-stats font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          <div>{entry.signingBonusBillion.toFixed(1)}억 원</div>
                          {entry.note && (
                            <div className="text-[10px] font-sans font-medium text-slate-400">
                              {entry.note}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedRookieSeason === 2027 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ※ 2026년 10월 각 구단 공식 발표 기준 (키움 하현승 16.0억 원은 KBO 역대 신인 최고액 신기록 · LG 1R 10순위 윤예성(인창고)은 구단 계약금 비공개로 집계 제외).
                </p>
              )}
            </div>
          )}

          {historySubTab === 'overview' && (
          <div className="space-y-4">
          {/* Permanent Multi-Season Championship Tally & Season Archive (#12) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-500" />
                역대 한국시리즈 우승 횟수 · 시즌별 영구 기록 아카이브
              </h3>
              <span className="text-[11px] text-slate-500">
                차기 시즌으로 넘어가도 우승·MVP·타이틀 기록이 영구 보존됩니다
              </span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {championshipTally.map((row) => (
                <div
                  key={row.teamId}
                  className="px-3 py-1.5 rounded border border-amber-500/30 bg-amber-500/5 flex items-center gap-2"
                >
                  <TeamLogo teamId={row.teamId} size="xs" />
                  <span className="font-bold">{KBO_TEAMS[row.teamId].shortName}</span>
                  <span className="font-mono-stats font-extrabold text-amber-700 dark:text-amber-300">
                    {row.titles}회
                  </span>
                  <span className="text-[11px] font-mono-stats text-slate-500">
                    ({row.seasons.join(', ')})
                  </span>
                </div>
              ))}
            </div>

            {(career.seasonHistory ?? []).length > 0 && (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500">
                    <tr>
                      <th className="py-2 px-2.5">시즌</th>
                      <th className="py-2 px-2">정규 1위</th>
                      <th className="py-2 px-2">한국시리즈 우승</th>
                      <th className="py-2 px-2">내 구단 성적</th>
                      <th className="py-2 px-2">MVP / KS MVP</th>
                      <th className="py-2 px-2">홈런왕 · 다승왕</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[...(career.seasonHistory ?? [])]
                      .sort((a, b) => b.season - a.season)
                      .map((sh) => (
                      <tr key={sh.season}>
                        <td className="py-2 px-2.5 font-mono-stats font-extrabold text-orange-600 dark:text-orange-400">
                          {sh.season}
                        </td>
                        <td className="py-2 px-2 font-semibold">
                          {KBO_TEAMS[sh.regularChampionTeamId].shortName}
                        </td>
                        <td className="py-2 px-2 font-bold">
                          {sh.koreanSeriesChampionTeamId
                            ? KBO_TEAMS[sh.koreanSeriesChampionTeamId].shortName
                            : '미확정'}
                        </td>
                        <td className="py-2 px-2 font-mono-stats">
                          {KBO_TEAMS[sh.playerTeamId].shortName} {sh.playerTeamRank}위 ({sh.playerTeamRecord})
                        </td>
                        <td className="py-2 px-2">
                          {sh.seasonMvpName} / {sh.ksMvpName}
                        </td>
                        <td className="py-2 px-2 text-[11px] font-mono-stats text-slate-600 dark:text-slate-300">
                          {sh.hrLeader} · {sh.winsLeader}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Trophy Room */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-500" />
                구단 트로피 진열장 ({trophies.length}개 획득)
              </h3>
              {trophies.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  3연전 스윕, 연승, 흑자 +80억, 정규시즌 1위, 한국시리즈 우승, MVP 배출, 국가대표 우승 등 업적을 달성하면 트로피가 자동 진열됩니다.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {trophies.map((tr) => (
                    <div key={tr.id} className="py-2.5 flex items-start justify-between gap-2 text-xs">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          [{tr.season}] {tr.title}
                        </div>
                        <div className="text-slate-500 mt-0.5">{tr.description}</div>
                      </div>
                      <span className="font-mono-stats text-[11px] text-amber-600 dark:text-amber-400 shrink-0">
                        {tr.category}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hall of Fame & Club Records */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Award className="w-4 h-4 text-orange-500" />
                KBO 명예의 전당 · 역대 기록
              </h3>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {hof.slice(0, 6).map((h) => (
                  <div key={`${h.playerId}-${h.inductedSeason}`} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">{h.playerName}</span>{' '}
                      <span className="text-slate-500">({h.teamId} · {h.position})</span>
                      <div className="text-[11px] text-slate-500">{h.careerSummary}</div>
                    </div>
                    <span className="font-mono-stats text-[11px] text-slate-500">{h.inductedSeason} 헌액</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                {clubRecords.map((rec, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">{rec.label}</span>
                    <span className="font-mono-stats font-semibold text-slate-900 dark:text-white">
                      {rec.value} · {rec.holder} ({rec.season})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Retired Numbers */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                KBO 구단 영구결번 아카이브
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {retiredNumbers.map((rn, idx) => (
                  <div
                    key={`${rn.teamId}-${rn.number}-${idx}`}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded bg-slate-900 dark:bg-slate-800 text-white font-mono-stats font-extrabold flex items-center justify-center text-sm shrink-0">
                      #{rn.number}
                    </div>
                    <div className="min-w-0 text-xs">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {rn.playerName} ({rn.teamId} · {rn.position})
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{rn.careerSummary}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleRetireNumber}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5"
            >
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {KBO_TEAMS[myTeam].shortName} 신규 영구결번 지정 (단장 직권)
              </h3>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  구단 소속·은퇴 선수 선택 (업적 자동 작성)
                </label>
                <select
                  value={selectedRetirePlayerId}
                  onChange={(e) => handleSelectRetireCandidate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">-- 선수를 선택하면 등번호·현실 업적이 자동 작성됩니다 --</option>
                  {retireCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.uniformNumber} {p.name} ({p.position} · {p.age}세 · {p.rosterTier} · OVR {p.ability})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={retireName}
                  onChange={(e) => setRetireName(e.target.value)}
                  placeholder="선수명"
                  className="col-span-2 px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={retireNum}
                  onChange={(e) => setRetireNum(e.target.value)}
                  placeholder="등번호"
                  className="px-2.5 py-1.5 text-xs font-mono-stats rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={retirePos}
                  onChange={(e) => setRetirePos(e.target.value as Position)}
                  className="px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {(['SP', 'RP', 'CL', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as Position[]).map(
                    (pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    )
                  )}
                </select>
                <input
                  value={retireNote}
                  onChange={(e) => setRetireNote(e.target.value)}
                  placeholder="비워두면 통산 기록·수상 기반 현실 업적 자동 생성"
                  className="col-span-2 px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                className="w-full py-1.5 rounded text-xs font-bold bg-orange-600 text-white hover:bg-orange-700"
              >
                영구결번 헌정 확정
              </button>
            </form>
          </div>

          {/* Dynamic Annual KBO Regulations & Rule Change History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                {career.season}시즌 적용 중인 KBO 공식 규정 ({activeRules.length}개)
              </h3>
              <span className="text-[11px] text-slate-500">
                매년 시즌 종료 후 KBO 실행위원회가 리그 규정을 자동으로 신설·수정·폐지합니다
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {activeRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[10px] font-bold">
                      {rule.category}
                    </span>
                    <span className="font-mono-stats text-[10px] text-slate-400">
                      {rule.introducedSeason}년 도입
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white">{rule.name}</div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{rule.description}</p>
                  {rule.effectSummary && (
                    <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      경기 영향: {rule.effectSummary}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                연도별 KBO 규정 개정·신설·폐지 이력 ({ruleHistory.length}건)
              </div>
              {ruleHistory.length === 0 ? (
                <div className="text-xs text-slate-500 py-2">
                  2026시즌 기본 규정이 적용 중입니다. 차기 시즌(2027~)으로 진입하면 KBO 실행위원회 규정 개정 내역이 매년 자동 누적됩니다.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {ruleHistory.slice(0, 12).map((log) => (
                    <div key={log.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono-stats font-extrabold text-slate-700 dark:text-slate-200">
                          {log.season}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.action === '추가'
                              ? 'bg-emerald-600 text-white'
                              : log.action === '수정'
                              ? 'bg-blue-600 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {log.action}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">{log.ruleName}</span>
                      </div>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400">{log.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
};
