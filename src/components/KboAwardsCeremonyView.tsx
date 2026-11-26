import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Crown,
  Medal,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
} from 'lucide-react';
import { KBO_TEAMS, normalizeChampionHistory, TEAM_IDS } from '../data/kboTeams';
import {
  checkGoldenGloveEligibility,
  computeNormalizedRegularAwardScore,
  computeOfficialRegularTitles,
  confirmAwardsCeremonyAndEnterOffseason,
  runRookieOfYearPressVote,
} from '../engine/kboAwardsEngine';
import { computeLiveAwardRaces, getClubTitleCount } from '../engine/leagueLifeEngine';
import { computeSeasonAwards } from '../engine/transactions';
import { AwardEntry, CareerSave, Position, SeasonAwards, TeamId } from '../types/kbo';
import { KoreanSeriesTrophyLogo } from './KoreanSeriesTrophyLogo';
import { GoldenGloveIcon } from './GoldenGloveIcon';
import { TeamLogo } from './TeamLogo';

interface KboAwardsCeremonyViewProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onSelectPlayer?: (playerId: string) => void;
  onEnterOffseason: () => void;
}

const GG_SLOT_ORDER = [
  { key: '투수', label: '투수 (P)', group: '배터리' },
  { key: '포수', label: '포수 (C)', group: '배터리' },
  { key: '1루수', label: '1루수 (1B)', group: '내야수' },
  { key: '2루수', label: '2루수 (2B)', group: '내야수' },
  { key: '3루수', label: '3루수 (3B)', group: '내야수' },
  { key: '유격수', label: '유격수 (SS)', group: '내야수' },
  { key: '외야수 1', label: '외야수 (OF)', group: '외야수' },
  { key: '외야수 2', label: '외야수 (OF)', group: '외야수' },
  { key: '외야수 3', label: '외야수 (OF)', group: '외야수' },
  { key: '지명타자', label: '지명타자 (DH)', group: '지명타자' },
];

export const KboAwardsCeremonyView: React.FC<KboAwardsCeremonyViewProps> = ({
  career,
  onUpdateCareer,
  onSelectPlayer,
  onEnterOffseason,
}) => {
  const sortedHistory = useMemo(
    () => [...career.awardsHistory].sort((a, b) => b.season - a.season),
    [career.awardsHistory]
  );

  const [selectedSeason, setSelectedSeason] = useState<number>(
    sortedHistory[0]?.season ?? career.season
  );
  const [sectionTab, setSectionTab] = useState<'ceremony' | 'races' | 'trophies'>('ceremony');
  const [notice, setNotice] = useState<string | null>(null);
  const liveRaces = useMemo(() => computeLiveAwardRaces(career), [career]);
  const clubTrophies = career.leagueHistory?.trophies ?? [];

  const activeAwards: SeasonAwards | null = useMemo(() => {
    const exact = sortedHistory.find((a) => a.season === selectedSeason);
    return exact ?? sortedHistory[0] ?? null;
  }, [sortedHistory, selectedSeason]);

  const isCurrentSeasonCeremonyPending =
    career.pendingAwardsCeremonySeason === career.season &&
    Boolean(sortedHistory.find((a) => a.season === career.season));

  const currentSeasonAwardExists = sortedHistory.some((a) => a.season === career.season);
  const canRunManualAwards =
    career.gamesPlayed >= career.totalRegularGames && !currentSeasonAwardExists;

  // 시즌 진행 중(시상식 집계 전) 실시간 정규시즌 예상 판세 계산 (postseasonStats 배제)
  const liveProjection = useMemo(() => {
    const validTeams = new Set<string>(TEAM_IDS);
    const active = Object.values(career.players).filter(
      (p) => validTeams.has(p.teamId) && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
    );
    const scored = active
      .map((p) => ({ player: p, score: computeNormalizedRegularAwardScore(p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const topMvp = scored.slice(0, 5);
    const topRookies = runRookieOfYearPressVote(career, { limit: 5 }).entries;

    const { battingTitleHolderMap, pitchingTitleHolderMap } = computeOfficialRegularTitles(career);
    const ggPreviewSlots: { label: string; posList: Position[]; slotType: 'P' | 'FIELDER' | 'DH' }[] = [
      { label: '투수', posList: ['SP', 'RP', 'CL'], slotType: 'P' },
      { label: '포수', posList: ['C'], slotType: 'FIELDER' },
      { label: '1루수', posList: ['1B'], slotType: 'FIELDER' },
      { label: '2루수', posList: ['2B'], slotType: 'FIELDER' },
      { label: '3루수', posList: ['3B'], slotType: 'FIELDER' },
      { label: '유격수', posList: ['SS'], slotType: 'FIELDER' },
      { label: '외야수', posList: ['LF', 'CF', 'RF'], slotType: 'FIELDER' },
      { label: '지명타자', posList: ['DH'], slotType: 'DH' },
    ];
    const usedOf = new Set<string>();
    const ggLeaders: { label: string; playerId: string; name: string; teamId: TeamId; score: number; eligText: string }[] = [];
    for (const slot of ggPreviewSlots) {
      const count = slot.label === '외야수' ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const cand = scored.find(
          (x) => slot.posList.includes(x.player.position) && !usedOf.has(x.player.id)
        );
        if (!cand) continue;
        if (slot.label === '외야수') usedOf.add(cand.player.id);
        const titles =
          slot.slotType === 'P'
            ? pitchingTitleHolderMap.get(cand.player.id) ?? []
            : battingTitleHolderMap.get(cand.player.id) ?? [];
        const elig = checkGoldenGloveEligibility(cand.player, slot.slotType, titles);
        ggLeaders.push({
          label: slot.label === '외야수' ? `외야수 ${i + 1}` : slot.label,
          playerId: cand.player.id,
          name: cand.player.name,
          teamId: cand.player.teamId,
          score: cand.score,
          eligText: elig.eligible ? elig.reason : '진행 중 집계',
        });
      }
    }

    return { topMvp, topRookies, ggLeaders };
  }, [career]);

  // 중복 수상자(MVP + 신인왕 + 골든글러브 동시 수상) 배지 매핑
  const multiCrownMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!activeAwards) return map;
    const add = (pid: string | undefined, tag: string) => {
      if (!pid) return;
      const arr = map.get(pid) ?? [];
      if (!arr.includes(tag)) arr.push(tag);
      map.set(pid, arr);
    };
    add(activeAwards.mvp?.playerId, 'MVP');
    add(activeAwards.rookieOfYear?.playerId, '신인왕');
    for (const g of activeAwards.goldenGloves) {
      add(g.playerId, '골든글러브');
    }
    return map;
  }, [activeAwards]);

  const championHistory = normalizeChampionHistory(career.championHistory);

  const handleRunAwards = () => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = computeSeasonAwards(career);
      onUpdateCareer(nextCareer, backupSnapshot);
      setSelectedSeason(nextCareer.season);
      setNotice(`${nextCareer.season} KBO 공식 시즌 시상식 집계가 완료되었습니다.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '시상식 집계 오류');
    }
  };

  const handleConfirmCeremonyAndProceed = () => {
    const { nextCareer, backupSnapshot } = confirmAwardsCeremonyAndEnterOffseason(career);
    onUpdateCareer(nextCareer, backupSnapshot);
    onEnterOffseason();
  };

  const renderCrownTags = (playerId: string) => {
    const tags = multiCrownMap.get(playerId) ?? [];
    if (tags.length <= 1) return null;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400/20 border border-amber-300/50 text-amber-200 text-[10px] font-extrabold">
        <Sparkles className="w-2.5 h-2.5" />
        <span>{tags.length}관왕 ({tags.join('·')})</span>
      </span>
    );
  };

  const renderScoreMeter = (score?: number, darkStage = true) => {
    const val = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
    if (val === null) return null;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className={darkStage ? 'text-amber-200/80 font-semibold' : 'text-slate-500 font-semibold'}>
            정규시즌 통합 평가점수
          </span>
          <span className={`font-mono-stats font-extrabold ${darkStage ? 'text-amber-300' : 'text-amber-600 dark:text-amber-400'}`}>
            {val.toFixed(1)} / 100
          </span>
        </div>
        <div className={`h-1.5 rounded-full overflow-hidden ${darkStage ? 'bg-white/10' : 'bg-slate-200 dark:bg-slate-800'}`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-200 animate-award-vote-bar"
            style={{ width: `${val}%` }}
          />
        </div>
      </div>
    );
  };

  const renderGoldenGloveCard = (entry: AwardEntry, idx: number) => {
    const posMeta = GG_SLOT_ORDER[idx];
    const displayPos = entry.positionLabel ?? posMeta?.key ?? entry.category.replace('골든글러브 ', '');
    const isMyClub = entry.teamId === career.playerTeamId;
    return (
      <div
        key={`${entry.category}-${entry.playerId}-${idx}`}
        className={`relative rounded-lg border p-3.5 transition-all animate-award-enter ${
          isMyClub
            ? 'border-amber-400/80 bg-gradient-to-b from-amber-500/18 via-slate-900/95 to-slate-950 shadow-lg shadow-amber-500/10'
            : 'border-amber-400/25 bg-slate-900/90 hover:border-amber-400/55'
        }`}
        style={{ animationDelay: `${idx * 45}ms` }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[11px] font-extrabold">
            <GoldenGloveIcon size="xs" />
            <span>{displayPos}</span>
          </span>
          {typeof entry.normalizedScore === 'number' && (
            <span className="font-mono-stats text-xs font-extrabold text-amber-200">
              {entry.normalizedScore.toFixed(1)}점
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded bg-white/10 border border-white/15 shrink-0">
            <TeamLogo teamId={entry.teamId} size="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onSelectPlayer?.(entry.playerId)}
              className="text-sm font-black text-white hover:text-amber-300 transition-colors truncate block text-left"
            >
              {entry.playerName}
            </button>
            <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
              <span>{KBO_TEAMS[entry.teamId].shortName}</span>
              {isMyClub && (
                <span className="px-1.5 py-px rounded team-accent-bg text-[9px] font-extrabold">
                  우리 구단
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1.5">
          <div className="text-[11px] font-mono-stats text-amber-100/95 leading-snug">
            {entry.statSummary}
          </div>
          {entry.eligibilityNote && (
            <div
              className={`text-[10px] leading-snug flex items-center gap-1 ${
                entry.isTitleHolderException ? 'text-amber-300 font-bold' : 'text-slate-400'
              }`}
            >
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span className="truncate" title={entry.eligibilityNote}>
                {entry.eligibilityNote}
              </span>
            </div>
          )}
          <div className="pt-0.5">{renderCrownTags(entry.playerId)}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* 통합 탭 전환: KBO 공식 시상식 · 실시간 수상 레이스 · 구단 트로피 진열실 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'ceremony' as const, label: 'KBO 공식 시상식', icon: Award },
          { id: 'races' as const, label: '실시간 수상 레이스 (MVP·신인왕·GG)', icon: Star },
          { id: 'trophies' as const, label: `구단 트로피 진열실 (${clubTrophies.length})`, icon: Trophy },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = sectionTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSectionTab(tab.id)}
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

      {sectionTab === 'races' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {liveRaces.season} 시즌 실시간 MVP · 신인왕 · 골든글러브 예상 순위
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                현재 정규시즌 {liveRaces.gamesPlayed}경기 누적 성적 기반 실시간 갱신
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  정규시즌 MVP 후보 TOP 10
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  수상 시 연봉요구 +22% · 인기 상승
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {liveRaces.mvpTop10.map((c) => (
                  <button
                    key={c.playerId}
                    type="button"
                    onClick={() => onSelectPlayer?.(c.playerId)}
                    className="w-full py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1.5 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-6 text-center font-mono-stats text-xs font-extrabold ${
                          c.rank === 1
                            ? 'text-amber-500'
                            : c.rank <= 3
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-400'
                        }`}
                      >
                        {c.rank}
                      </span>
                      <TeamLogo teamId={c.teamId} size="xs" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {c.playerName}{' '}
                          <span className="font-normal text-slate-500">
                            {c.teamId} · {c.position}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono-stats">
                          {c.statSummary}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-mono-stats font-bold text-amber-600 dark:text-amber-400">
                      {c.score.toFixed(1)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                  <Crown className="w-4 h-4 text-sky-500" />
                  신인왕 후보 TOP 10 (기자단 AI 예상)
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  수상 시 연봉요구 +20%
                </span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2.5">
                공식 자격: 입단 6년 차 이내 · 이전 1군 ≤30IP/≤60PA · 당해·퓨처스 제외 · 비해외파 · 기수상 제외 · 나이 무관
              </div>
              {liveRaces.rookieTop10.length === 0 ? (
                <div className="text-xs text-slate-500 py-5 text-center">
                  정규시즌 개막 후 공식 신인왕 자격 보유 선수의 1군 출전 기록이 쌓이면 후보 순위가 자동 갱신됩니다.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {liveRaces.rookieTop10.map((c) => (
                    <button
                      key={c.playerId}
                      type="button"
                      onClick={() => onSelectPlayer?.(c.playerId)}
                      className="w-full py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1.5 rounded transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 text-center font-mono-stats text-xs font-extrabold ${
                            c.rank === 1 ? 'text-sky-500' : 'text-slate-500'
                          }`}
                        >
                          {c.rank}
                        </span>
                        <TeamLogo teamId={c.teamId} size="xs" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {c.playerName}{' '}
                            <span className="font-normal text-slate-500">
                              {c.teamId} · {c.position}
                              {c.entryYearNumber ? ` · 입단 ${c.entryYearNumber}년 차` : ''}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono-stats">
                            {c.statSummary}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono-stats">
                        <div className="text-xs font-bold text-sky-600 dark:text-sky-400">
                          {c.projectedVoteSharePct !== undefined
                            ? `${c.projectedVoteSharePct.toFixed(1)}%`
                            : `${c.score.toFixed(1)}점`}
                        </div>
                        {c.war !== undefined && (
                          <div className="text-[10px] text-slate-400">WAR {c.war.toFixed(1)}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                <GoldenGloveIcon size="sm" />
                골든글러브 포지션별 예상 순위
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                수상 시 시장·트레이드 가치 +10%
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {liveRaces.goldenGloveByPos.map((grp) => (
                <div
                  key={grp.positionLabel}
                  className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                    {grp.positionLabel}
                  </div>
                  <div className="space-y-1.5">
                    {grp.candidates.map((c) => (
                      <button
                        key={c.playerId}
                        type="button"
                        onClick={() => onSelectPlayer?.(c.playerId)}
                        className="w-full flex items-center justify-between gap-1.5 text-left hover:opacity-80"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[11px] font-mono-stats font-bold text-amber-600 dark:text-amber-400 w-3.5">
                            {c.rank}
                          </span>
                          <TeamLogo teamId={c.teamId} size="xs" />
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {c.playerName}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono-stats text-slate-500 shrink-0">
                          {c.score.toFixed(1)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {sectionTab === 'trophies' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-extrabold text-sm text-slate-900 dark:text-white">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>한국시리즈 우승 트로피 전시관</span>
              </div>
              <span className="text-xs text-slate-500">
                역대 한국시리즈 우승 구단 공식 트로피 아카이브
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              {championHistory.slice(0, 6).map((ch) => (
                <KoreanSeriesTrophyLogo
                  key={`${ch.season}-${ch.championTeamId}`}
                  teamId={ch.championTeamId}
                  season={ch.season}
                  titleCount={getClubTitleCount(career, ch.championTeamId)}
                  size="sm"
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Medal className="w-4 h-4 text-amber-500" />
                <span>{KBO_TEAMS[career.playerTeamId].name} 구단 트로피 진열장 ({clubTrophies.length}개 획득)</span>
              </h3>
            </div>
            {clubTrophies.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                3연전 스윕, 연승, 흑자 +80억, 정규시즌 1위, 한국시리즈 우승, MVP 배출, 국가대표 우승 등 업적을 달성하면 트로피가 자동 진열됩니다.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {clubTrophies.map((tr) => (
                  <div
                    key={tr.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-start justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        [{tr.season}] {tr.title}
                      </div>
                      <div className="text-slate-500 mt-0.5">{tr.description}</div>
                    </div>
                    <span className="font-mono-stats text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                      {tr.category}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {sectionTab === 'ceremony' && (
      <div className="space-y-5">
      {/* KBO 공식 시상식 갈라 스테이지 헤더 */}
      <div className="kbo-gala-stage relative overflow-hidden rounded-xl border border-amber-400/35 p-6 text-white shadow-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-amber-200/15 to-transparent animate-award-spotlight"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 animate-award-trophy">
              <KoreanSeriesTrophyLogo size="md" />
            </div>
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-amber-400/20 border border-amber-300/45 text-[11px] font-extrabold tracking-wide text-amber-200">
                <Trophy className="w-3.5 h-3.5" />
                <span>KBO OFFICIAL AWARDS GALA · 2026 공식 시상 규정</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                {activeAwards ? `${activeAwards.season} KBO 리그 공식 시상식` : `${career.season} KBO 공식 시상식`}
              </h1>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                정규시즌 성적만을 기준으로 투수·타자 0~100 정규화 평가점수를 산출해 MVP 1명, 신인왕 1명(5년 이내·이전 ≤30IP/≤60PA·비해외파),
                골든글러브 10명(규정이닝/10승/30SV/30HLD · 720수비이닝 · DH 297타석 · 타이틀홀더 예외)을 선정합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {sortedHistory.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-md px-2.5 py-1.5 text-xs">
                <span className="text-amber-200/80 font-semibold">역대 시즌</span>
                <select
                  value={activeAwards?.season ?? career.season}
                  onChange={(e) => setSelectedSeason(Number(e.target.value))}
                  className="bg-slate-900 text-white font-mono-stats font-bold px-2 py-0.5 rounded border border-amber-400/40"
                >
                  {sortedHistory.map((h) => (
                    <option key={h.season} value={h.season}>
                      {h.season} 시즌
                    </option>
                  ))}
                </select>
              </div>
            )}

            {canRunManualAwards && (
              <button
                type="button"
                onClick={handleRunAwards}
                className="px-4 py-2 rounded-md bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg"
              >
                <Sparkles className="w-4 h-4" />
                <span>{career.season} 공식 시상식 개막</span>
              </button>
            )}
          </div>
        </div>

        {/* 한국시리즈 우승 & KS MVP 축하 리본 */}
        {activeAwards?.championTeamId && (
          <div className="relative z-10 mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Crown className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="text-amber-200 font-bold">{activeAwards.season} 한국시리즈 우승</span>
              <TeamLogo teamId={activeAwards.championTeamId} size="xs" />
              <span className="font-black text-white">
                {KBO_TEAMS[activeAwards.championTeamId].name}
              </span>
              {activeAwards.runnerUpTeamId && (
                <span className="text-slate-400">
                  (준우승: {KBO_TEAMS[activeAwards.runnerUpTeamId].shortName})
                </span>
              )}
            </div>
            {activeAwards.koreanSeriesMvp && (
              <div className="flex items-center gap-2 bg-white/10 border border-amber-300/30 rounded px-2.5 py-1">
                <span className="text-amber-300 font-extrabold">한국시리즈 MVP</span>
                <button
                  type="button"
                  onClick={() =>
                    activeAwards.koreanSeriesMvp?.playerId &&
                    onSelectPlayer?.(activeAwards.koreanSeriesMvp.playerId)
                  }
                  className="font-black text-white hover:text-amber-300"
                >
                  {activeAwards.koreanSeriesMvp.playerName}
                </button>
                <span className="text-slate-300 font-mono-stats">
                  ({activeAwards.koreanSeriesMvp.statSummary})
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 한국시리즈 직후 시상식 확인 완료 → 오프시즌 단장실 이동 전용 배너 (자동 차기시즌 금지) */}
      {isCurrentSeasonCeremonyPending && (
        <div className="rounded-lg border-2 border-amber-400 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 dark:from-amber-950/70 dark:via-slate-900 dark:to-amber-950/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="space-y-1">
            <div className="text-sm font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{career.season} 한국시리즈 종료 · KBO 공식 시상식이 발표되었습니다!</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              MVP, 신인왕, 골든글러브 10명의 수상 결과를 확인한 뒤 아래 버튼을 눌러 <strong>오프시즌 단장실</strong>로 이동하세요.
              오프시즌 필수 업무를 완료하기 전에는 다음 시즌이 자동으로 시작되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleConfirmCeremonyAndProceed}
            className="px-5 py-2.5 rounded-md team-accent-btn font-black text-xs flex items-center gap-2 shrink-0 shadow-md"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>시상식 확인 완료 · 오프시즌 단장실로 이동</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 이미 확인 완료된 오프시즌 상태일 때 빠른 복귀 버튼 */}
      {career.phase === 'OFFSEASON' && !isCurrentSeasonCeremonyPending && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>{career.season} KBO 시상식 확인 완료 — 오프시즌 단장 업무를 진행해 주세요.</span>
          </span>
          <button
            type="button"
            onClick={onEnterOffseason}
            className="px-3.5 py-1.5 rounded team-accent-btn font-bold text-xs flex items-center gap-1"
          >
            <span>오프시즌 단장실 열기</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {notice && (
        <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-800 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* 본 시상식 무대 (완료된 시상식 결과가 있을 때) */}
      {activeAwards ? (
        <div className="space-y-5">
          {/* 1. MVP & 신인왕 메인 스포트라이트 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 정규시즌 MVP */}
            <div className="kbo-gala-stage rounded-xl border-2 border-amber-400/75 p-5 text-white shadow-xl space-y-4 animate-award-enter">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-gradient-to-r from-amber-500 to-yellow-300 text-slate-950 text-xs font-black">
                  <Crown className="w-3.5 h-3.5" />
                  <span>{activeAwards.season} 정규시즌 MVP</span>
                </div>
                <span className="text-[11px] font-semibold text-amber-200/90">
                  투·타 통합 리그 전체 1명
                </span>
              </div>

              {activeAwards.mvp ? (
                <>
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-amber-400/15 border border-amber-300/45 shrink-0">
                      <TeamLogo teamId={activeAwards.mvp.teamId} size="lg" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer?.(activeAwards.mvp!.playerId)}
                          className="text-2xl font-black text-white hover:text-amber-300 transition-colors text-left"
                        >
                          {activeAwards.mvp.playerName}
                        </button>
                        {renderCrownTags(activeAwards.mvp.playerId)}
                      </div>
                      <div className="text-xs font-semibold text-amber-200">
                        {KBO_TEAMS[activeAwards.mvp.teamId].name}
                      </div>
                      <div className="text-xs font-mono-stats text-slate-100 bg-white/10 rounded px-2.5 py-1 inline-block">
                        {activeAwards.mvp.statSummary}
                      </div>
                    </div>
                  </div>
                  {renderScoreMeter(activeAwards.mvp.normalizedScore, true)}
                  {activeAwards.mvp.eligibilityNote && (
                    <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span>{activeAwards.mvp.eligibilityNote}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-slate-400">수상자 데이터 없음</div>
              )}
            </div>

            {/* 신인왕 */}
            <div className="kbo-gala-stage rounded-xl border border-emerald-400/55 p-5 text-white shadow-xl space-y-4 animate-award-enter">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-400 text-slate-950 text-xs font-black">
                  <Star className="w-3.5 h-3.5" />
                  <span>{activeAwards.season} KBO 신인왕</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-200/90">
                  입단 6년 차 이내 · ≤30IP/≤60PA · 기자단 AI {activeAwards.rookiePressVoterCount ?? 100}인 투표
                </span>
              </div>

              {activeAwards.rookieOfYear ? (
                <>
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-emerald-400/15 border border-emerald-300/40 shrink-0">
                      <TeamLogo teamId={activeAwards.rookieOfYear.teamId} size="lg" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer?.(activeAwards.rookieOfYear!.playerId)}
                          className="text-2xl font-black text-white hover:text-emerald-300 transition-colors text-left"
                        >
                          {activeAwards.rookieOfYear.playerName}
                        </button>
                        {renderCrownTags(activeAwards.rookieOfYear.playerId)}
                      </div>
                      <div className="text-xs font-semibold text-emerald-200">
                        {KBO_TEAMS[activeAwards.rookieOfYear.teamId].name}
                        {activeAwards.rookieOfYear.votePoints !== undefined && (
                          <span className="ml-2 font-mono-stats text-emerald-300">
                            · 1위표 {activeAwards.rookieOfYear.firstPlaceVotes ?? 0}표 / 총{' '}
                            {activeAwards.rookieOfYear.votePoints}점 (득표율{' '}
                            {activeAwards.rookieOfYear.voteSharePct?.toFixed(1) ?? activeAwards.rookieOfYear.votes}%)
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono-stats text-slate-100 bg-white/10 rounded px-2.5 py-1 inline-block">
                        {activeAwards.rookieOfYear.statSummary}
                      </div>
                    </div>
                  </div>
                  {renderScoreMeter(activeAwards.rookieOfYear.normalizedScore, true)}
                  {activeAwards.rookieOfYear.eligibilityNote && (
                    <div className="text-[11px] text-emerald-200/90 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                      <span>{activeAwards.rookieOfYear.eligibilityNote}</span>
                    </div>
                  )}
                  {activeAwards.rookiePressVotes && activeAwards.rookiePressVotes.length > 0 && (
                    <div className="rounded-lg bg-slate-950/45 border border-emerald-400/25 p-2.5 space-y-1.5">
                      <div className="text-[10px] font-bold text-emerald-200/90 flex items-center justify-between">
                        <span>기자단 AI 투표 TOP {activeAwards.rookiePressVotes.length} (1위 5점 · 2위 3점 · 3위 1점)</span>
                        <span className="font-mono-stats text-slate-300">WAR · 성적 · 팀기여도 종합</span>
                      </div>
                      <div className="divide-y divide-white/10 text-[11px]">
                        {activeAwards.rookiePressVotes.map((rv) => (
                          <div key={rv.playerId} className="py-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono-stats font-black text-emerald-300 w-4">{rv.rank}</span>
                              <button
                                type="button"
                                onClick={() => onSelectPlayer?.(rv.playerId)}
                                className="font-bold text-white hover:text-emerald-300 truncate"
                              >
                                {rv.playerName}
                              </button>
                              <span className="text-[10px] text-slate-300 shrink-0">
                                {rv.teamId}·{rv.position} ({rv.entryYearNumber}년 차)
                              </span>
                            </div>
                            <div className="font-mono-stats text-[10px] text-emerald-200 shrink-0">
                              WAR {rv.war.toFixed(1)} · 1위 {rv.firstPlaceVotes} · {rv.totalVotePoints}점 ({rv.voteSharePct.toFixed(1)}%)
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-slate-400">
                  KBO 공식 신인왕 자격(입단 6년 차 이내 · 이전 1군 30이닝/60타석 이하 · 해외 프로 경력 없음 · 기수상 제외) 충족 수상자 없음
                </div>
              )}
            </div>
          </div>

          {/* 2. 골든글러브 10인 갈라 쇼케이스 (투수 1, 포수 1, 내야 4, 외야 3, 지명타자 1) */}
          <div className="kbo-gala-stage rounded-xl border border-amber-400/40 p-5 text-white space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <div className="text-base font-black text-amber-300 flex items-center gap-2">
                  <GoldenGloveIcon size="md" />
                  <span>{activeAwards.season} KBO 골든글러브 수상자 ({activeAwards.goldenGloves.length}명)</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  투수 1 · 포수 1 · 1루수·2루수·3루수·유격수 각 1 · 외야수 3 · 지명타자 1 (규정이닝/10승/30SV/30HLD · 720수비이닝 · DH 297타석 · 타이틀홀더 예외 적용)
                </p>
              </div>
              <span className="text-[11px] font-mono-stats text-amber-200/90 bg-amber-400/10 border border-amber-300/30 rounded px-2.5 py-1 self-start">
                정규시즌 성적 전용 집계
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {activeAwards.goldenGloves.map((gg, idx) => renderGoldenGloveCard(gg, idx))}
            </div>
          </div>

          {/* 3. 최동원상 · 올해의 감독상 & 부문별 공식 타이틀 14관왕 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-3">
              <div className="text-sm font-extrabold flex items-center gap-1.5">
                <Medal className="w-4 h-4 text-amber-500" />
                <span>특별상 (최동원상 · 올해의 감독상)</span>
              </div>
              {activeAwards.choiDongWon && (
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 space-y-1 text-xs">
                  <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    최동원상 (최우수 선발투수)
                  </div>
                  <div className="flex items-center gap-2">
                    <TeamLogo teamId={activeAwards.choiDongWon.teamId} size="xs" />
                    <button
                      type="button"
                      onClick={() => onSelectPlayer?.(activeAwards.choiDongWon!.playerId)}
                      className="font-black hover:underline"
                    >
                      {activeAwards.choiDongWon.playerName}
                    </button>
                    <span className="text-slate-500">{KBO_TEAMS[activeAwards.choiDongWon.teamId].shortName}</span>
                  </div>
                  <div className="font-mono-stats text-[11px] text-slate-600 dark:text-slate-300">
                    {activeAwards.choiDongWon.statSummary}
                  </div>
                </div>
              )}
              {activeAwards.managerOfTheYear && (
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 space-y-1 text-xs">
                  <div className="text-[11px] font-bold team-accent-text">올해의 감독상</div>
                  <div className="flex items-center gap-2">
                    <TeamLogo teamId={activeAwards.managerOfTheYear.teamId} size="xs" />
                    <span className="font-black">{activeAwards.managerOfTheYear.managerName} 감독</span>
                    <span className="text-slate-500">
                      {KBO_TEAMS[activeAwards.managerOfTheYear.teamId].shortName}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    {activeAwards.managerOfTheYear.summary}
                  </div>
                </div>
              )}
            </div>

            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-2.5">
              <div className="text-sm font-extrabold">타격 8개 부문 공식 타이틀홀더</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {activeAwards.battingTitles.map((bt) => (
                  <div key={bt.category} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">{bt.category}</span>
                    <div className="flex items-center gap-1.5">
                      <TeamLogo teamId={bt.teamId} size="xs" />
                      <button
                        type="button"
                        onClick={() => onSelectPlayer?.(bt.playerId)}
                        className="font-bold hover:underline"
                      >
                        {bt.playerName}
                      </button>
                      <span className="font-mono-stats font-extrabold team-accent-text">
                        {bt.statSummary}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-2.5">
              <div className="text-sm font-extrabold">투수 6개 부문 공식 타이틀홀더</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {activeAwards.pitchingTitles.map((pt) => (
                  <div key={pt.category} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">{pt.category}</span>
                    <div className="flex items-center gap-1.5">
                      <TeamLogo teamId={pt.teamId} size="xs" />
                      <button
                        type="button"
                        onClick={() => onSelectPlayer?.(pt.playerId)}
                        className="font-bold hover:underline"
                      >
                        {pt.playerName}
                      </button>
                      <span className="font-mono-stats font-extrabold team-accent-text">
                        {pt.statSummary}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 아직 완료된 시상식이 없는 첫 시즌 진행 중: 실시간 2026 공식 규정 예상 판세 */
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-4 text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-extrabold text-amber-800 dark:text-amber-300">
                {career.season} 정규시즌 진행 중 ({career.gamesPlayed}/{career.totalRegularGames}경기) — 공식 시상식 실시간 예상 판세
              </div>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                한국시리즈 우승팀이 확정되면 공식 2026 KBO 시상식이 자동으로 개막되며, 모든 수상 결과는 선수 프로필과 역대 수상 기록에 영구 저장됩니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-2.5">
              <div className="text-sm font-extrabold flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-500" />
                <span>정규시즌 MVP 실시간 선두권 (0~100 정규화)</span>
              </div>
              {liveProjection.topMvp.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  정규시즌 경기가 진행되면 투·타 통합 MVP 실시간 점수가 집계됩니다.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {liveProjection.topMvp.map((item, i) => (
                    <div key={item.player.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono-stats font-black text-amber-600 dark:text-amber-400 w-4">
                          {i + 1}
                        </span>
                        <TeamLogo teamId={item.player.teamId} size="xs" />
                        <button
                          type="button"
                          onClick={() => onSelectPlayer?.(item.player.id)}
                          className="font-bold hover:underline truncate"
                        >
                          {item.player.name}
                        </button>
                        <span className="text-slate-400">{item.player.position}</span>
                      </div>
                      <span className="font-mono-stats font-extrabold team-accent-text">
                        {item.score.toFixed(1)}점
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-2.5">
              <div className="text-sm font-extrabold flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-emerald-500" />
                  <span>신인왕 공식 자격 후보 선두권 (기자단 AI 예상)</span>
                </span>
                <span className="text-[10px] font-normal text-slate-400">입단 6년 차 이내 · 나이 무관</span>
              </div>
              {liveProjection.topRookies.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  정규시즌 1군 출전 기록이 쌓이면 공식 신인왕 자격 후보(입단 6년 차 이내·≤30IP/≤60PA·비해외파·기수상 제외)가 표시됩니다.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {liveProjection.topRookies.map((item, i) => (
                    <div key={item.playerId} className="py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono-stats font-black text-emerald-600 dark:text-emerald-400 w-4">
                          {i + 1}
                        </span>
                        <TeamLogo teamId={item.teamId} size="xs" />
                        <button
                          type="button"
                          onClick={() => onSelectPlayer?.(item.playerId)}
                          className="font-bold hover:underline truncate"
                        >
                          {item.playerName}
                        </button>
                        <span className="text-slate-400 shrink-0">
                          {item.position} · {item.entryYearNumber}년 차
                        </span>
                      </div>
                      <span className="font-mono-stats font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">
                        WAR {item.war.toFixed(1)} · {item.voteSharePct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {liveProjection.ggLeaders.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-3">
              <div className="text-sm font-extrabold flex items-center gap-1.5">
                <GoldenGloveIcon size="sm" />
                <span>골든글러브 10개 포지션 실시간 1위 예상</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                {liveProjection.ggLeaders.map((g) => (
                  <div
                    key={g.label}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-extrabold text-amber-700 dark:text-amber-400">{g.label}</span>
                      <span className="font-mono-stats font-bold">{g.score.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TeamLogo teamId={g.teamId} size="xs" />
                      <button
                        type="button"
                        onClick={() => onSelectPlayer?.(g.playerId)}
                        className="font-bold truncate hover:underline"
                      >
                        {g.name}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 역대 한국시리즈 우승 & 역대 MVP·신인왕 아카이브 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-2.5">
          <div className="text-sm font-extrabold flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>역대 KBO 수상 아카이브 ({sortedHistory.length}시즌)</span>
          </div>
          {sortedHistory.length === 0 ? (
            <div className="text-xs text-slate-500 py-3">
              아직 확정된 시즌 시상식 기록이 없습니다. 한국시리즈 종료 후 첫 공식 시상식이 이곳에 영구 기록됩니다.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {sortedHistory.map((h) => (
                <button
                  key={h.season}
                  type="button"
                  onClick={() => setSelectedSeason(h.season)}
                  className={`w-full text-left py-2 px-2 rounded flex flex-wrap items-center justify-between gap-2 transition-colors ${
                    activeAwards?.season === h.season
                      ? 'team-accent-soft font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="font-mono-stats font-black">{h.season} 시즌</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">
                    MVP: <strong>{h.mvp?.playerName ?? '-'}</strong> · 신인왕:{' '}
                    <strong>{h.rookieOfYear?.playerName ?? '-'}</strong> · GG {h.goldenGloves.length}인
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-2.5">
          <div className="text-sm font-extrabold flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-amber-500" />
            <span>최근 한국시리즈 우승 기록</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-56 overflow-y-auto">
            {championHistory.slice(0, 8).map((c) => (
              <div key={`${c.season}-${c.championTeamId}`} className="py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono-stats font-black text-slate-500">{c.season}</span>
                  <TeamLogo teamId={c.championTeamId} size="xs" />
                  <span className="font-extrabold">{KBO_TEAMS[c.championTeamId].shortName}</span>
                  <span className="text-slate-400">({c.seriesScore})</span>
                </div>
                <span className="text-[11px] text-slate-500 truncate max-w-[180px]">
                  KS MVP {c.ksMvpName}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
      )}
    </div>
  );
};
