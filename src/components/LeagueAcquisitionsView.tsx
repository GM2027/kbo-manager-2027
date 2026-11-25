import React, { useMemo, useState } from 'react';
import { ArrowRight, Filter, Search, Users } from 'lucide-react';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  LEAGUE_ACQUISITION_CATEGORIES,
  queryLeagueAcquisitions,
} from '../engine/leagueAcquisitionsEngine';
import {
  CareerSave,
  LeagueAcquisitionCategory,
  TeamId,
} from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface LeagueAcquisitionsViewProps {
  career: CareerSave;
  onSelectPlayer?: (playerId: string) => void;
}

const CATEGORY_BADGE_STYLES: Record<LeagueAcquisitionCategory, string> = {
  FA: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  트레이드: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  '외국인·아시아쿼터': 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  신인: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  '방출선수 영입': 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
};

export const LeagueAcquisitionsView: React.FC<LeagueAcquisitionsViewProps> = ({
  career,
  onSelectPlayer,
}) => {
  const [teamFilter, setTeamFilter] = useState<TeamId | 'ALL'>('ALL');
  const [seasonFilter, setSeasonFilter] = useState<number | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<LeagueAcquisitionCategory | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const allRecords = career.leagueAcquisitions ?? [];

  const availableSeasons = useMemo(() => {
    const set = new Set<number>([career.season]);
    for (const rec of allRecords) {
      set.add(rec.season);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [allRecords, career.season]);

  const filtered = useMemo(
    () =>
      queryLeagueAcquisitions(career, {
        teamId: teamFilter,
        season: seasonFilter,
        category: categoryFilter,
        search,
      }),
    [career, teamFilter, seasonFilter, categoryFilter, search]
  );

  const countsByCategory = useMemo(() => {
    const map: Record<LeagueAcquisitionCategory, number> = {
      FA: 0,
      트레이드: 0,
      '외국인·아시아쿼터': 0,
      신인: 0,
      '방출선수 영입': 0,
    };
    for (const r of filtered) {
      map[r.category] = (map[r.category] ?? 0) + 1;
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-600" />
              <span>전체 구단 영입 현황</span>
              <span className="text-xs font-mono-stats text-slate-500 font-semibold">
                ({filtered.length}건)
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              KBO 전체 10개 구단(AI 구단 포함)의 확정된 FA·트레이드·외국인/아시아쿼터·신인·방출선수 영입 내역을 한눈에 확인합니다.
            </p>
          </div>
        </div>

        {/* Category Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          {LEAGUE_ACQUISITION_CATEGORIES.map((cat) => {
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(active ? 'ALL' : cat)}
                className={`p-2.5 rounded border text-left transition-colors ${
                  active
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                  {cat}
                </div>
                <div className="text-base font-black font-mono-stats mt-0.5">
                  {countsByCategory[cat]}건
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
            <Filter className="w-3.5 h-3.5" />
            <span>필터</span>
          </div>

          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value as TeamId | 'ALL')}
            className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold"
          >
            <option value="ALL">전체 10개 구단</option>
            {TEAM_IDS.map((tid) => (
              <option key={tid} value={tid}>
                {KBO_TEAMS[tid].name}
                {tid === career.playerTeamId ? ' (우리 구단)' : ''}
              </option>
            ))}
          </select>

          <select
            value={seasonFilter}
            onChange={(e) =>
              setSeasonFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
            }
            className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats font-semibold"
          >
            <option value="ALL">전체 시즌</option>
            {availableSeasons.map((s) => (
              <option key={s} value={s}>
                {s}시즌
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as LeagueAcquisitionCategory | 'ALL')
            }
            className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold"
          >
            <option value="ALL">전체 영입 유형</option>
            {LEAGUE_ACQUISITION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="선수 이름 · 이전 구단 · 메모 검색"
              className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div className="font-bold text-slate-700 dark:text-slate-300">
              표시할 확정 영입 기록이 없습니다.
            </div>
            <p>
              FA 계약, 트레이드, 외국인·아시아쿼터 영입, 신인 드래프트, 방출선수(웨이버) 영입이 확정되면 전 구단 기록이 자동으로 집계됩니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">영입 날짜</th>
                  <th className="py-2.5 px-3">유형</th>
                  <th className="py-2.5 px-3">선수 이름</th>
                  <th className="py-2.5 px-3">이전 구단</th>
                  <th className="py-2.5 px-3">영입 구단</th>
                  <th className="py-2.5 px-3 text-right">계약 금액</th>
                  <th className="py-2.5 px-3">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((rec) => {
                  const isMine = rec.acquiringTeamId === career.playerTeamId;
                  const canOpenPlayer = Boolean(
                    onSelectPlayer && rec.playerId && career.players[rec.playerId]
                  );
                  return (
                    <tr
                      key={rec.id}
                      className={
                        isMine
                          ? 'bg-orange-500/5 hover:bg-orange-500/10'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-2.5 px-3 font-mono-stats text-slate-500 whitespace-nowrap">
                        <div>{rec.date}</div>
                        <div className="text-[10px] text-slate-400">{rec.season}시즌</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${CATEGORY_BADGE_STYLES[rec.category]}`}
                        >
                          {rec.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {canOpenPlayer ? (
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(rec.playerId!)}
                            className="font-extrabold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-amber-400 hover:underline"
                          >
                            {rec.playerName}
                          </button>
                        ) : (
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {rec.playerName}
                          </span>
                        )}
                        {rec.position && (
                          <span className="ml-1.5 text-[11px] font-mono-stats text-slate-500">
                            {rec.position}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {rec.previousTeamLabel}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold">
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <TeamLogo teamId={rec.acquiringTeamId} size="xs" />
                          <span className={isMine ? 'text-orange-600 dark:text-amber-400' : ''}>
                            {KBO_TEAMS[rec.acquiringTeamId]?.shortName ?? rec.acquiringTeamId}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-stats font-bold whitespace-nowrap text-slate-900 dark:text-white">
                        {rec.contractAmountLabel}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {rec.note ?? '—'}
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
