import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, Search, Shield, Users, X } from 'lucide-react';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  GlobalPlayerSearchEntry,
  GlobalPlayerSearchFilter,
  searchAllLeaguePlayers,
} from '../engine/playerRegistry';
import { CareerSave, PlayerRole, Position, TeamId } from '../types/kbo';
import { CountryFlag } from './CountryFlag';
import { FuturesTeamLogo, TeamLogo } from './TeamLogo';

interface GlobalPlayerSearchModalProps {
  career: CareerSave;
  open: boolean;
  onClose: () => void;
  onSelectKboPlayer: (playerId: string) => void;
  onJumpToOverseas?: (permanentId: string) => void;
}

const POSITIONS: ('전체' | Position)[] = [
  '전체',
  'SP',
  'RP',
  'CL',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
];

export const GlobalPlayerSearchModal: React.FC<GlobalPlayerSearchModalProps> = ({
  career,
  open,
  onClose,
  onSelectKboPlayer,
  onJumpToOverseas,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<GlobalPlayerSearchFilter['teamFilter']>('전체');
  const [roleFilter, setRoleFilter] = useState<'전체' | PlayerRole>('전체');
  const [positionFilter, setPositionFilter] = useState<'전체' | Position>('전체');
  const [tierFilter, setTierFilter] = useState<GlobalPlayerSearchFilter['tierFilter']>('전체');
  const [sortBy, setSortBy] = useState<GlobalPlayerSearchFilter['sortBy']>('ability');

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const results = useMemo<GlobalPlayerSearchEntry[]>(() => {
    if (!open) return [];
    return searchAllLeaguePlayers(career, {
      query,
      teamFilter,
      roleFilter,
      positionFilter,
      tierFilter,
      sortBy,
    });
  }, [open, career, query, teamFilter, roleFilter, positionFilter, tierFilter, sortBy]);

  const counts = useMemo(() => {
    let kbo = 0;
    let sangmu = 0;
    let ulsan = 0;
    let overseas = 0;
    for (const r of results) {
      if (r.source === 'KBO') kbo += 1;
      else if (r.source === '상무') sangmu += 1;
      else if (r.source === '울산') ulsan += 1;
      else overseas += 1;
    }
    return { kbo, sangmu, ulsan, overseas };
  }, [results]);

  if (!open) return null;

  const handleRowClick = (entry: GlobalPlayerSearchEntry) => {
    if (entry.kboPlayerId) {
      onClose();
      onSelectKboPlayer(entry.kboPlayerId);
    } else if (entry.overseasRef && onJumpToOverseas) {
      onClose();
      onJumpToOverseas(entry.overseasRef.permanentId);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
              <span>전체 구단 · 리그 통합 선수 검색</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              KBO 10개 구단 · 상무 피닉스 · 울산 웨일즈 · 해외파 선수를 이름, 고유 ID, 포지션, 출신교, 등번호로 즉시 조회합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800"
            aria-label="검색 창 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
          <div className="flex flex-col md:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="선수명, 고유 ID(KBO-PL-...), 구단명, 포지션, 등번호, 출신교 검색..."
                className="w-full pl-9 pr-9 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="검색어 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value as GlobalPlayerSearchFilter['teamFilter'])}
                className="px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="전체">전체 구단</option>
                {TEAM_IDS.map((tid) => (
                  <option key={tid} value={tid}>
                    {KBO_TEAMS[tid].name}
                  </option>
                ))}
                <option value="상무">상무 피닉스</option>
                <option value="울산">울산 웨일즈</option>
                <option value="해외파">해외파 선수</option>
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as '전체' | PlayerRole)}
                className="px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="전체">투·타 전체</option>
                <option value="투수">투수</option>
                <option value="타자">타자</option>
              </select>

              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value as '전체' | Position)}
                className="px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos === '전체' ? '포지션 전체' : pos}
                  </option>
                ))}
              </select>

              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as GlobalPlayerSearchFilter['tierFilter'])}
                className="px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="전체">소속/상태 전체</option>
                <option value="1군">1군 엔트리</option>
                <option value="2군">2군 퓨처스</option>
                <option value="육성">육성선수</option>
                <option value="상무복무">상무 복무중</option>
                <option value="해외파">해외파</option>
                <option value="은퇴">은퇴 선수</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as GlobalPlayerSearchFilter['sortBy'])}
                className="px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="ability">능력치 순</option>
                <option value="potential">잠재력 순</option>
                <option value="salary">연봉 순</option>
                <option value="age">어린 나이 순</option>
                <option value="name">이름 가나다 순</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-3 font-mono-stats">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                검색 결과 {results.length.toLocaleString()}명
              </span>
              <span>KBO {counts.kbo}</span>
              <span>상무 {counts.sangmu}</span>
              <span>울산 {counts.ulsan}</span>
              <span>해외파 {counts.overseas}</span>
            </div>
            <div>
              최대 150명 표시 · KBO 선수 클릭 시 상세 기록 카드, 해외파 클릭 시 해외파 현황으로 이동
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="flex-1 overflow-auto">
          {results.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
              조건에 일치하는 선수가 없습니다. 검색어나 필터를 조정해 보세요.
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-bold">선수 / 고유 ID</th>
                  <th className="py-2.5 px-3 font-bold">구단 · 상태</th>
                  <th className="py-2.5 px-2 font-bold">포지션</th>
                  <th className="py-2.5 px-2 font-bold text-right">나이(출생)</th>
                  <th className="py-2.5 px-2 font-bold text-right">능력 / 잠재</th>
                  <th className="py-2.5 px-2 font-bold text-right">연봉</th>
                  <th className="py-2.5 px-3 font-bold">시즌 기록 / 스카우트 요약</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {results.slice(0, 150).map((entry) => {
                  const clickable = Boolean(entry.kboPlayerId || (entry.overseasRef && onJumpToOverseas));
                  return (
                    <tr
                      key={entry.key}
                      onClick={() => clickable && handleRowClick(entry)}
                      className={`${
                        clickable
                          ? 'cursor-pointer hover:bg-orange-500/5 dark:hover:bg-slate-800/60'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      } transition-colors`}
                    >
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CountryFlag
                            nationality={
                              entry.kboPlayerId
                                ? career.players[entry.kboPlayerId]?.nationality ?? '한국'
                                : '한국'
                            }
                            size="xs"
                          />
                          {entry.uniformNumber !== undefined && (
                            <span className="font-mono-stats text-[11px] text-slate-400">
                              #{entry.uniformNumber}
                            </span>
                          )}
                          <span className="font-bold text-slate-900 dark:text-white">
                            {entry.name}
                          </span>
                          {entry.isNamesake && (
                            <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                              동명이인 · {entry.birthYear}년생
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono-stats text-slate-500 dark:text-slate-400 mt-0.5">
                          {entry.permanentId} · {entry.schoolOrOrigin}
                        </div>
                      </td>

                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          {entry.source === '상무' ? (
                            <FuturesTeamLogo teamId="상무" size="xs" />
                          ) : entry.source === '울산' ? (
                            <FuturesTeamLogo teamId="울산" size="xs" />
                          ) : entry.source === '해외파' ? (
                            <Globe2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                          ) : (
                            <TeamLogo teamId={entry.teamId as TeamId} size="xs" />
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {entry.teamLabel}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              {entry.rosterStatus}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2 px-2 font-mono-stats font-bold text-slate-700 dark:text-slate-300">
                        {entry.position}
                      </td>

                      <td className="py-2 px-2 text-right font-mono-stats text-slate-700 dark:text-slate-300">
                        {entry.age}세
                        <span className="text-[10px] text-slate-400 ml-1">({entry.birthYear})</span>
                      </td>

                      <td className="py-2 px-2 text-right font-mono-stats font-bold">
                        <span className="text-orange-600 dark:text-orange-400">{entry.ability}</span>
                        <span className="text-slate-400 mx-0.5">/</span>
                        <span className="text-slate-700 dark:text-slate-300">{entry.potential}</span>
                      </td>

                      <td className="py-2 px-2 text-right font-mono-stats text-slate-700 dark:text-slate-300">
                        {entry.salaryLabel}
                      </td>

                      <td className="py-2 px-3 font-mono-stats text-[11px] text-slate-600 dark:text-slate-400 max-w-[260px] truncate">
                        {entry.statSummary}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Legend */}
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span>
              모든 선수에게 영구 고유 ID(<span className="font-mono-stats">KBO-PL / KBO-AMA / KBO-OVR</span>)가 부여되어 동명이인을 정확히 구분하고 중복 생성을 방지합니다.
            </span>
          </div>
          <span className="font-mono-stats">ESC 닫기</span>
        </div>
      </div>
    </div>
  );
};
