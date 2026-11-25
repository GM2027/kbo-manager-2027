import React, { useMemo, useState } from 'react';
import { Award, Crown, Lock, ShieldCheck, Trophy, Users } from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  getReal2026HeadToHead,
  REAL_2026_BATTING_TITLES,
  REAL_2026_CONFIRMED_OFFSEASON_MOVES,
  REAL_2026_DATA_METADATA,
  REAL_2026_MAJOR_AWARDS,
  REAL_2026_PITCHING_TITLES,
  REAL_2026_POSTSEASON,
  REAL_2026_STANDINGS,
  REAL_2027_FA_APPROVED_22,
} from '../data/real2026SeasonArchive';
import { CareerSave, TeamId } from '../types/kbo';
import { KoreanSeriesTrophyLogo } from './KoreanSeriesTrophyLogo';
import { TeamLogo } from './TeamLogo';

interface Real2026ArchiveViewProps {
  career: CareerSave;
  onSelectPlayer?: (playerId: string) => void;
}

const ORDERED_2026_TEAMS: TeamId[] = REAL_2026_STANDINGS.map((r) => r.teamId);

export const Real2026ArchiveView: React.FC<Real2026ArchiveViewProps> = ({
  career,
  onSelectPlayer,
}) => {
  const [sectionTab, setSectionTab] = useState<'standings' | 'h2h' | 'awards' | 'offseason'>(
    'standings'
  );

  // 실제 선수 ID 매칭 (이름 + 구단 기준)
  const findPlayerId = (name: string, teamId?: TeamId): string | undefined => {
    const list = Object.values(career.players);
    const exact = list.find(
      (p) =>
        p.name === name &&
        (!teamId || p.teamId === teamId || p.formerTeamId === teamId)
    );
    return exact?.id ?? list.find((p) => p.name === name)?.id;
  };

  const drafted2027Players = useMemo(() => {
    return Object.values(career.players)
      .filter((p) => p.acquisitionInfo?.draftYear === 2027)
      .sort(
        (a, b) =>
          (a.acquisitionInfo?.draftRound ?? 99) - (b.acquisitionInfo?.draftRound ?? 99) ||
          (a.acquisitionInfo?.draftPick ?? 999) - (b.acquisitionInfo?.draftPick ?? 999)
      );
  }, [career.players]);

  const linkedKboIdCount = useMemo(
    () => Object.values(career.players).filter((p) => Boolean(p.kboOfficialId)).length,
    [career.players]
  );

  const verifiedFuturesCount = useMemo(
    () => Object.values(career.players).filter((p) => Boolean(p.verifiedFutures2026)).length,
    [career.players]
  );

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="rounded-lg border border-blue-500/35 bg-gradient-to-r from-blue-950/10 via-slate-50 to-amber-500/10 dark:from-blue-950/40 dark:via-slate-900 dark:to-amber-950/25 p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-extrabold">
              <Lock className="w-3 h-3" />
              <span>2026 KBO 공식 역사 데이터 (고정 · 재시뮬레이션 불가)</span>
            </div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <TeamLogo teamId="삼성" size="sm" />
              <span>2026 KBO 리그 최종 기록 · 삼성 라이온즈 한국시리즈 우승 (통산 9회)</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {REAL_2026_DATA_METADATA.sourceNote}
            </p>
          </div>
          <div className="shrink-0">
            <KoreanSeriesTrophyLogo teamId="삼성" season={2026} titleCount={9} size="sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70">
            <div className="text-[10px] text-slate-500">정규시즌 1위</div>
            <div className="font-extrabold flex items-center gap-1.5 mt-0.5">
              <TeamLogo teamId="KT" size="xs" />
              <span>KT 위즈 (90승 49패 5무)</span>
            </div>
          </div>
          <div className="p-2.5 rounded border border-amber-500/40 bg-amber-500/5">
            <div className="text-[10px] text-amber-700 dark:text-amber-300 font-bold">한국시리즈 우승</div>
            <div className="font-extrabold flex items-center gap-1.5 mt-0.5">
              <TeamLogo teamId="삼성" size="xs" />
              <span>삼성 라이온즈 (KS 4-1)</span>
            </div>
          </div>
          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70">
            <div className="text-[10px] text-slate-500">KBO 공식 선수 ID 연동</div>
            <div className="font-mono-stats font-extrabold mt-0.5 text-slate-900 dark:text-white">
              {linkedKboIdCount}명 · 퓨처스 확인 {verifiedFuturesCount}명
            </div>
          </div>
          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70">
            <div className="text-[10px] text-slate-500">2027 새 시즌 반영</div>
            <div className="font-mono-stats font-extrabold mt-0.5 text-slate-900 dark:text-white">
              FA {REAL_2027_FA_APPROVED_22.length}명 · 신인 {drafted2027Players.length}명
            </div>
          </div>
        </div>

        {/* Sub-navigation */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            { id: 'standings' as const, label: '정규순위 · 포스트시즌', icon: Trophy },
            { id: 'h2h' as const, label: '팀간 상대전적표', icon: ShieldCheck },
            { id: 'awards' as const, label: '개인 타이틀 · 시상 현황', icon: Award },
            { id: 'offseason' as const, label: '2027 FA 22명 · 신인 드래프트', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = sectionTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSectionTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'team-accent-bg border-transparent shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Standings + Postseason */}
      {sectionTab === 'standings' && (
        <div className="space-y-4">
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>2026 KBO 정규시즌 최종 순위표 (144경기 완주 · 총 720경기)</span>
              </div>
              <span className="text-[11px] font-mono-stats text-slate-500">
                리그 합계 703승 703패 34무 · 2027시즌 새 게임은 0승 0패부터 시작
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2 px-2">최종</th>
                    <th className="py-2 px-2">정규</th>
                    <th className="py-2 px-2">구단</th>
                    <th className="py-2 px-2 text-right">경기</th>
                    <th className="py-2 px-2 text-right">승</th>
                    <th className="py-2 px-2 text-right">패</th>
                    <th className="py-2 px-2 text-right">무</th>
                    <th className="py-2 px-2 text-right">승률</th>
                    <th className="py-2 px-2 text-right">게임차</th>
                    <th className="py-2 px-2">2026 시즌 결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono-stats">
                  {REAL_2026_STANDINGS.map((row, idx) => {
                    const isMine = row.teamId === career.playerTeamId;
                    return (
                      <tr
                        key={row.teamId}
                        className={`${
                          isMine
                            ? 'team-accent-row font-bold'
                            : row.finalRank === 1
                              ? 'bg-blue-50/50 dark:bg-blue-950/25 font-semibold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        } ${idx === 4 ? 'border-b-2 border-b-emerald-500/50' : ''}`}
                      >
                        <td className="py-2 px-2 font-extrabold">
                          {row.finalRank === 1 ? '우승' : `${row.finalRank}위`}
                        </td>
                        <td className="py-2 px-2 text-slate-500">{row.regularRank}위</td>
                        <td className="py-2 px-2 font-sans whitespace-nowrap">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <TeamLogo teamId={row.teamId} size="xs" />
                            <span>{KBO_TEAMS[row.teamId].name}</span>
                            {row.finalRank === 1 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold whitespace-nowrap shrink-0">
                                KS 우승
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right">{row.games}</td>
                        <td className="py-2 px-2 text-right font-bold">{row.wins}</td>
                        <td className="py-2 px-2 text-right">{row.losses}</td>
                        <td className="py-2 px-2 text-right">{row.draws}</td>
                        <td className="py-2 px-2 text-right font-bold">{row.winPct.toFixed(3)}</td>
                        <td className="py-2 px-2 text-right">
                          {row.gamesBehind === 0 ? '—' : row.gamesBehind.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 font-sans text-[11px] text-slate-600 dark:text-slate-300">
                          {row.postseasonNote}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Postseason Bracket */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Crown className="w-4 h-4 text-amber-500" />
              <span>2026 KBO 포스트시즌 공식 결과 (스텝래더)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {REAL_2026_POSTSEASON.map((s) => {
                const mvpPid = findPlayerId(s.mvpName, s.mvpTeamId);
                return (
                  <div
                    key={s.round}
                    className={`p-3 rounded-lg border space-y-2 ${
                      s.round === 'KOREAN_SERIES'
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="font-extrabold text-slate-900 dark:text-white">{s.title}</div>
                    <div className="flex items-center justify-between gap-2 py-1.5 border-y border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 font-bold">
                        <TeamLogo teamId={s.higherSeedTeam} size="xs" />
                        <span>
                          {s.higherSeedRank}위 {s.higherSeedTeam}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">vs</span>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>
                          {s.lowerSeedRank}위 {s.lowerSeedTeam}
                        </span>
                        <TeamLogo teamId={s.lowerSeedTeam} size="xs" />
                      </div>
                    </div>
                    <div className="font-mono-stats font-bold text-emerald-700 dark:text-emerald-400">
                      승자: {KBO_TEAMS[s.winnerTeam].shortName} · {s.seriesScore}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      시리즈 MVP:{' '}
                      {mvpPid && onSelectPlayer ? (
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(mvpPid)}
                          className="font-bold text-orange-600 dark:text-orange-400 hover:underline"
                        >
                          {s.mvpName} ({s.mvpTeamId})
                        </button>
                      ) : (
                        <strong>
                          {s.mvpName} ({s.mvpTeamId})
                        </strong>
                      )}
                      <div className="text-[10px] text-slate-500 mt-0.5">{s.mvpSummary}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. Head-to-Head Matrix */}
      {sectionTab === 'h2h' && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold">
              2026 KBO 정규시즌 팀간 상대전적표 (행 기준 승-무-패)
            </div>
            <span className="text-[11px] text-slate-500">
              공식 확인된 대진만 수록 · 미확인 대진은 임의 생성 없이 &apos;미확인&apos; 표기
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-center font-mono-stats border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2 px-2 text-left border border-slate-200 dark:border-slate-800 font-sans">
                    구단
                  </th>
                  {ORDERED_2026_TEAMS.map((col) => (
                    <th
                      key={col}
                      className="py-2 px-1.5 border border-slate-200 dark:border-slate-800 font-sans"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ORDERED_2026_TEAMS.map((rowTeam) => (
                  <tr key={rowTeam}>
                    <td className="py-1.5 px-2 text-left font-sans font-bold border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <TeamLogo teamId={rowTeam} size="xs" />
                        <span>{rowTeam}</span>
                      </div>
                    </td>
                    {ORDERED_2026_TEAMS.map((colTeam) => {
                      if (rowTeam === colTeam) {
                        return (
                          <td
                            key={colTeam}
                            className="py-1.5 px-1.5 border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 text-slate-400"
                          >
                            —
                          </td>
                        );
                      }
                      const rec = getReal2026HeadToHead(rowTeam, colTeam);
                      if (!rec) {
                        return (
                          <td
                            key={colTeam}
                            className="py-1.5 px-1.5 border border-slate-200 dark:border-slate-800 text-slate-400 font-sans text-[10px]"
                          >
                            미확인
                          </td>
                        );
                      }
                      const tone =
                        rec.wins > rec.losses
                          ? 'text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-500/5'
                          : rec.wins < rec.losses
                            ? 'text-rose-600 dark:text-rose-400 bg-rose-500/5'
                            : 'text-slate-700 dark:text-slate-300';
                      return (
                        <td
                          key={colTeam}
                          className={`py-1.5 px-1.5 border border-slate-200 dark:border-slate-800 whitespace-nowrap ${tone}`}
                        >
                          {rec.wins}-{rec.draws}-{rec.losses}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Awards & Individual Titles */}
      {sectionTab === 'awards' && (
        <div className="space-y-4">
          <div className="border border-amber-500/35 bg-amber-500/5 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>2026 KBO 주요 시상 현황 (공식 발표 기준)</span>
              </div>
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                미발표 시상은 임의 생성하지 않고 미확정 상태로 관리
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {REAL_2026_MAJOR_AWARDS.map((aw) => {
                const pid = aw.playerName ? findPlayerId(aw.playerName, aw.teamId) : undefined;
                return (
                  <div
                    key={aw.category}
                    className={`p-3 rounded border space-y-1.5 ${
                      aw.status === '확정'
                        ? 'border-emerald-500/40 bg-white dark:bg-slate-900'
                        : 'border-dashed border-amber-500/50 bg-white/70 dark:bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-slate-900 dark:text-white">{aw.category}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          aw.status === '확정'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {aw.status}
                      </span>
                    </div>
                    {aw.status === '확정' && aw.playerName ? (
                      <>
                        <div className="font-extrabold text-sm flex items-center gap-1.5">
                          {aw.teamId && <TeamLogo teamId={aw.teamId} size="xs" />}
                          {pid && onSelectPlayer ? (
                            <button
                              type="button"
                              onClick={() => onSelectPlayer(pid)}
                              className="hover:text-orange-600 hover:underline"
                            >
                              {aw.playerName}
                            </button>
                          ) : (
                            <span>{aw.playerName}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">
                          {aw.statSummary}
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                        {aw.pendingNote ?? '공식 발표 전 미확정'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { title: '2026 정규시즌 공식 타격 부문 타이틀 (확정)', items: REAL_2026_BATTING_TITLES },
              { title: '2026 정규시즌 공식 투수 부문 타이틀 (확정)', items: REAL_2026_PITCHING_TITLES },
            ].map((group) => (
              <div
                key={group.title}
                className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-2.5"
              >
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{group.title}</h4>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {group.items.map((item) => {
                    const pid = item.playerName
                      ? findPlayerId(item.playerName, item.teamId)
                      : undefined;
                    return (
                      <div
                        key={item.category}
                        className="py-2 flex items-center justify-between gap-2"
                      >
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          {item.category}
                        </span>
                        <div className="flex items-center gap-2 text-right">
                          {item.coWinners ? (
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {item.coWinners.map((cw) => {
                                const cpid = findPlayerId(cw.playerName, cw.teamId);
                                return (
                                  <span
                                    key={cw.playerName}
                                    className="inline-flex items-center gap-1 font-bold"
                                  >
                                    <TeamLogo teamId={cw.teamId} size="xs" />
                                    {cpid && onSelectPlayer ? (
                                      <button
                                        type="button"
                                        onClick={() => onSelectPlayer(cpid)}
                                        className="hover:text-orange-600 hover:underline"
                                      >
                                        {cw.playerName}
                                      </button>
                                    ) : (
                                      <span>{cw.playerName}</span>
                                    )}
                                  </span>
                                );
                              })}
                              <span className="font-mono-stats text-orange-600 dark:text-orange-400 font-bold">
                                15승
                              </span>
                            </div>
                          ) : (
                            <>
                              {item.teamId && <TeamLogo teamId={item.teamId} size="xs" />}
                              {pid && onSelectPlayer ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectPlayer(pid)}
                                  className="font-bold text-slate-900 dark:text-white hover:text-orange-600 hover:underline"
                                >
                                  {item.playerName}
                                </button>
                              ) : (
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {item.playerName}
                                </span>
                              )}
                              <span className="font-mono-stats text-orange-600 dark:text-orange-400 font-bold">
                                {item.statSummary}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. 2027 FA 22 & 2027 Draft 110 & Confirmed Moves */}
      {sectionTab === 'offseason' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  2027 KBO FA 공식 승인 22명 (미발표 계약은 미확정 · FA 협상 대기)
                </h4>
                <span className="text-[11px] font-mono-stats text-slate-500">
                  A등급 6 · B등급 10 · C등급 6
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {REAL_2027_FA_APPROVED_22.map((fa) => {
                  const pid = findPlayerId(fa.playerName, fa.teamId);
                  const livePlayer = pid ? career.players[pid] : undefined;
                  const liveStatus =
                    livePlayer && livePlayer.rosterTier !== 'FA'
                      ? `${KBO_TEAMS[livePlayer.teamId].shortName} 계약 완료`
                      : fa.contractStatus;
                  return (
                    <div
                      key={`${fa.teamId}-${fa.playerName}`}
                      className="px-2.5 py-2 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold font-mono-stats ${
                            fa.grade === 'A'
                              ? 'bg-rose-600 text-white'
                              : fa.grade === 'B'
                                ? 'bg-amber-500 text-white'
                                : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {fa.grade}
                        </span>
                        <TeamLogo teamId={fa.teamId} size="xs" />
                        {pid && onSelectPlayer ? (
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(pid)}
                            className="font-bold hover:text-orange-600 hover:underline truncate"
                          >
                            {fa.playerName}
                          </button>
                        ) : (
                          <span className="font-bold truncate">{fa.playerName}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">{liveStatus}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                공식 확정 은퇴 · 보직전환 · FA 미신청
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {REAL_2026_CONFIRMED_OFFSEASON_MOVES.map((m) => (
                  <div key={`${m.teamId}-${m.playerName}`} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <TeamLogo teamId={m.teamId} size="xs" />
                        <span>{m.playerName}</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
                        {m.moveType}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2027 Rookie Draft 110 */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                2027 KBO 신인 드래프트 실제 지명 결과 ({drafted2027Players.length}명 전원 반영 완료)
              </h4>
              <span className="text-[11px] text-slate-500">
                1라운드~11라운드 실제 지명 선수 클릭 시 상세 능력치·포텐셜 확인 가능
              </span>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-500">
                  <tr>
                    <th className="py-2 px-2.5">지명 순번</th>
                    <th className="py-2 px-2">지명 구단</th>
                    <th className="py-2 px-2">선수명</th>
                    <th className="py-2 px-2">포지션</th>
                    <th className="py-2 px-2 text-right">OVR / POT</th>
                    <th className="py-2 px-2 text-right">2027 연봉</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono-stats">
                  {drafted2027Players.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-1.5 px-2.5 font-semibold">
                        {p.rookieInfo?.pickNotation ?? p.acquisitionInfo?.label ?? '-'}
                      </td>
                      <td className="py-1.5 px-2 font-sans">
                        <div className="inline-flex items-center gap-1.5">
                          <TeamLogo teamId={p.teamId} size="xs" />
                          <span>{KBO_TEAMS[p.teamId].shortName}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 font-sans font-bold">
                        {onSelectPlayer ? (
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(p.id)}
                            className="hover:text-orange-600 hover:underline"
                          >
                            {p.name}
                          </button>
                        ) : (
                          p.name
                        )}
                      </td>
                      <td className="py-1.5 px-2 font-sans">{p.position}</td>
                      <td className="py-1.5 px-2 text-right">
                        {p.ability} / <strong className="text-sky-600 dark:text-sky-400">{p.potential}</strong>
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {(p.contract.annualSalary * 10000).toLocaleString()}만
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
