import React, { useMemo, useState } from 'react';
import { Award, History } from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { getLiveCareerStats, getNationalityDisplay } from '../data/playerMetadata';
import {
  BatterTitleKey,
  computeLeaderboards,
  computeStandings,
  formatIP,
  formatRate2,
  formatRate3,
  PitcherTitleKey,
} from '../engine/stats';
import { CareerSave, TeamId } from '../types/kbo';
import {
  FranchiseStarIcon,
  isFranchiseStarPlayer,
  PlayerCompactTag,
  PlayerForeignFlag,
} from './PlayerStatusCompact';
import { TeamLogo } from './TeamLogo';

interface LeaderboardsViewProps {
  career: CareerSave;
  onSelectPlayer?: (playerId: string) => void;
}

const BATTER_CATEGORIES: { key: BatterTitleKey; label: string }[] = [
  { key: 'HR', label: '홈런' },
  { key: 'AVG', label: '타율' },
  { key: 'RBI', label: '타점' },
  { key: 'H', label: '안타' },
  { key: 'R', label: '득점' },
  { key: 'SB', label: '도루' },
  { key: 'OBP', label: '출루율' },
  { key: 'SLG', label: '장타율' },
  { key: 'OPS', label: 'OPS' },
];

const PITCHER_CATEGORIES: { key: PitcherTitleKey; label: string }[] = [
  { key: 'W', label: '다승' },
  { key: 'ERA', label: '평균자책' },
  { key: 'SO', label: '탈삼진' },
  { key: 'SV', label: '세이브' },
  { key: 'HLD', label: '홀드' },
  { key: 'WHIP', label: 'WHIP' },
  { key: 'IP', label: '이닝' },
  { key: 'WPCT', label: '승률' },
];

type CareerStatKey = 'HR' | 'H' | 'RBI' | 'SB' | 'AVG' | 'W' | 'SO' | 'SV' | 'HLD' | 'IP';

const CAREER_BATTER_KEYS: { key: CareerStatKey; label: string }[] = [
  { key: 'HR', label: '통산 홈런' },
  { key: 'H', label: '통산 안타' },
  { key: 'RBI', label: '통산 타점' },
  { key: 'SB', label: '통산 도루' },
  { key: 'AVG', label: '통산 타율 (500타수+)' },
];

const CAREER_PITCHER_KEYS: { key: CareerStatKey; label: string }[] = [
  { key: 'W', label: '통산 다승' },
  { key: 'SO', label: '통산 탈삼진' },
  { key: 'SV', label: '통산 세이브' },
  { key: 'HLD', label: '통산 홀드' },
  { key: 'IP', label: '통산 이닝' },
];

interface CareerLeaderRow {
  rank: number;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  displayValue: string;
  subLine: string;
  numericValue: number;
}

export const LeaderboardsView: React.FC<LeaderboardsViewProps> = ({ career, onSelectPlayer }) => {
  const [scope, setScope] = useState<'season' | 'career'>('season');
  const [group, setGroup] = useState<'batter' | 'pitcher'>('batter');
  const [batterCat, setBatterCat] = useState<BatterTitleKey>('HR');
  const [pitcherCat, setPitcherCat] = useState<PitcherTitleKey>('W');
  const [careerBatCat, setCareerBatCat] = useState<CareerStatKey>('HR');
  const [careerPitCat, setCareerPitCat] = useState<CareerStatKey>('W');

  const activeCategory = group === 'batter' ? batterCat : pitcherCat;
  const activeCareerCat = group === 'batter' ? careerBatCat : careerPitCat;
  const entries = computeLeaderboards(career, activeCategory);
  const standings = computeStandings(career.gamesLedger);
  const myTeamGames = standings.find((r) => r.teamId === career.playerTeamId)?.games ?? career.gamesPlayed;

  const careerLeaders = useMemo<CareerLeaderRow[]>(() => {
    const players = Object.values(career.players).filter((p) => p.rosterTier !== '제외후보');
    const rows: Omit<CareerLeaderRow, 'rank'>[] = [];
    for (const p of players) {
      const live = getLiveCareerStats(p);
      if (group === 'batter' && p.role === '타자' && 'AB' in live) {
        const b = live;
        if (activeCareerCat === 'AVG' && b.AB < 500) continue;
        const val =
          activeCareerCat === 'HR'
            ? b.HR
            : activeCareerCat === 'H'
            ? b.H
            : activeCareerCat === 'RBI'
            ? b.RBI
            : activeCareerCat === 'SB'
            ? b.SB
            : b.AB > 0
            ? b.H / b.AB
            : 0;
        if (val <= 0) continue;
        rows.push({
          playerId: p.id,
          playerName: p.name,
          teamId: p.teamId,
          numericValue: val,
          displayValue:
            activeCareerCat === 'AVG'
              ? formatRate3(val)
              : `${val.toLocaleString()}${activeCareerCat === 'HR' ? '홈런' : activeCareerCat === 'H' ? '안타' : activeCareerCat === 'RBI' ? '타점' : '도루'}`,
          subLine: `통산 ${b.G}G · 타율 ${formatRate3(b.AB > 0 ? b.H / b.AB : 0)} · ${b.H}안타 · ${b.HR}홈런 · ${b.RBI}타점${p.rosterTier === '은퇴' ? ' [은퇴]' : ''}`,
        });
      } else if (group === 'pitcher' && p.role === '투수' && 'outs' in live) {
        const ps = live;
        const val =
          activeCareerCat === 'W'
            ? ps.W
            : activeCareerCat === 'SO'
            ? ps.SO
            : activeCareerCat === 'SV'
            ? ps.SV
            : activeCareerCat === 'HLD'
            ? ps.HLD
            : ps.outs;
        if (val <= 0) continue;
        const era = ps.outs > 0 ? (ps.ER * 27) / ps.outs : 0;
        rows.push({
          playerId: p.id,
          playerName: p.name,
          teamId: p.teamId,
          numericValue: val,
          displayValue:
            activeCareerCat === 'IP'
              ? `${formatIP(ps.outs)}이닝`
              : `${val.toLocaleString()}${activeCareerCat === 'W' ? '승' : activeCareerCat === 'SO' ? 'K' : activeCareerCat === 'SV' ? 'SV' : 'HLD'}`,
          subLine: `통산 ${ps.G}G · ${formatIP(ps.outs)}IP · ${ps.W}승 ${ps.L}패 ${ps.SV}SV · ERA ${formatRate2(era)} · ${ps.SO}K${p.rosterTier === '은퇴' ? ' [은퇴]' : ''}`,
        });
      }
    }
    return rows
      .sort((a, b) => b.numericValue - a.numericValue)
      .slice(0, 15)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [career.players, group, activeCareerCat]);

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-base font-extrabold">
              {scope === 'season' ? (
                <Award className="w-5 h-5 text-orange-600" />
              ) : (
                <History className="w-5 h-5 text-orange-600" />
              )}
              <span>
                {scope === 'season'
                  ? `${career.season} 시즌 개인 타이틀 TOP 10`
                  : 'KBO 현역·은퇴 선수 통산 기록 TOP 15 (실시간 갱신)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {scope === 'season'
                ? `규정타석(${Math.ceil(Math.max(1, myTeamGames) * 3.1)}PA) 및 규정이닝(${Math.max(1, myTeamGames)}.0IP) 기준 적용 · 우리 구단(${career.playerTeamId}) 강조`
                : '실제 KBO 통산 베이스라인에 현재 시즌 경기 기록이 실시간 합산되어 기록 갱신 즉시 순위가 변동됩니다.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setScope('season')}
                className={`px-3 py-1.5 font-semibold ${
                  scope === 'season'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                시즌 기록
              </button>
              <button
                type="button"
                onClick={() => setScope('career')}
                className={`px-3 py-1.5 font-semibold ${
                  scope === 'career'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                KBO 통산 기록
              </button>
            </div>

            <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setGroup('batter')}
                className={`px-3.5 py-1.5 font-semibold ${
                  group === 'batter'
                    ? 'team-accent-bg'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                타격 {scope === 'season' ? '(9개)' : '(5개)'}
              </button>
              <button
                type="button"
                onClick={() => setGroup('pitcher')}
                className={`px-3.5 py-1.5 font-semibold ${
                  group === 'pitcher'
                    ? 'team-accent-bg'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                투수 {scope === 'season' ? '(8개)' : '(5개)'}
              </button>
            </div>
          </div>
        </div>

        {/* Category Buttons */}
        {scope === 'season' ? (
          <div className="flex flex-wrap gap-1.5">
            {(group === 'batter' ? BATTER_CATEGORIES : PITCHER_CATEGORIES).map((c) => {
              const active = activeCategory === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() =>
                    group === 'batter'
                      ? setBatterCat(c.key as BatterTitleKey)
                      : setPitcherCat(c.key as PitcherTitleKey)
                  }
                  className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
                    active
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(group === 'batter' ? CAREER_BATTER_KEYS : CAREER_PITCHER_KEYS).map((c) => {
              const active = activeCareerCat === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() =>
                    group === 'batter' ? setCareerBatCat(c.key) : setCareerPitCat(c.key)
                  }
                  className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
                    active
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Provisional / Non-fabrication notice */}
        {scope === 'season' && career.isPreservedMaster && career.gamesPlayed <= 9 && (
          <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
            참고: 타 구단 초반 9경기 기록은 실제 KBO 선수명 기반 게임 내 가상 누적이며, 한화 타자 초반 일부 경기 원자료 미제공분은 최소 확인치(+)로 반영됩니다.
          </div>
        )}

        {/* SEASON TABLE */}
        {scope === 'season' ? (
          entries.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded">
              현재 해당 부문 순위에 오를 경기 기록이 아직 쌓이지 않았습니다. 경기를 진행해 주세요.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3">순위</th>
                    <th className="py-2.5 px-3">선수</th>
                    <th className="py-2.5 px-3">구단</th>
                    <th className="py-2.5 px-3 text-right">기록</th>
                    <th className="py-2.5 px-3">구분 / 비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {entries.map((row) => {
                    const isMine = row.teamId === career.playerTeamId;
                    const pl = career.players[row.playerId];
                    return (
                      <tr
                        key={`${row.playerId}-${row.rank}`}
                        className={
                          isMine
                            ? 'bg-orange-500/10 font-bold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }
                      >
                        <td className="py-2 px-3 font-mono-stats">{row.rank}</td>
                        <td className="py-2 px-3 font-semibold whitespace-nowrap">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onSelectPlayer?.(row.playerId)}
                              className="hover:text-orange-600 dark:hover:text-orange-400 hover:underline text-left"
                            >
                              {row.playerName}
                            </button>
                            {pl && <FranchiseStarIcon active={isFranchiseStarPlayer(career, pl)} />}
                            {pl && <PlayerForeignFlag player={pl} />}
                            {pl && <PlayerCompactTag career={career} player={pl} />}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <TeamLogo teamId={row.teamId} size="xs" />
                            <span>{KBO_TEAMS[row.teamId].shortName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono-stats text-sm font-extrabold">
                          {row.displayValue}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-500 dark:text-slate-400">
                          {row.note
                            ? row.note
                            : row.isSynthetic
                            ? '게임 내 가상 기록'
                            : '완전집계'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* CAREER STATS LEADERBOARD TABLE */
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">순위</th>
                  <th className="py-2.5 px-3">선수</th>
                  <th className="py-2.5 px-3">구단</th>
                  <th className="py-2.5 px-3 text-right">통산 기록</th>
                  <th className="py-2.5 px-3">통산 누적 요약</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {careerLeaders.map((row) => {
                  const isMine = row.teamId === career.playerTeamId;
                  const pl = career.players[row.playerId];
                  return (
                    <tr
                      key={`career-${row.playerId}`}
                      className={
                        isMine
                          ? 'bg-orange-500/10 font-bold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-2 px-3 font-mono-stats font-bold">{row.rank}</td>
                      <td className="py-2 px-3 font-semibold whitespace-nowrap">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(row.playerId)}
                            className="hover:text-orange-600 dark:hover:text-orange-400 hover:underline text-left"
                          >
                            {row.playerName}
                          </button>
                          {pl && <FranchiseStarIcon active={isFranchiseStarPlayer(career, pl)} />}
                          {pl && <PlayerForeignFlag player={pl} />}
                          {pl && <PlayerCompactTag career={career} player={pl} />}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <TeamLogo teamId={row.teamId} size="xs" />
                          <span>{KBO_TEAMS[row.teamId].shortName}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono-stats text-sm font-extrabold text-orange-600 dark:text-orange-400">
                        {row.displayValue}
                      </td>
                      <td className="py-2 px-3 text-[11px] font-mono-stats text-slate-500 dark:text-slate-400">
                        {row.subLine}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
