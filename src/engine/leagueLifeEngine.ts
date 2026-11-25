import { buildCoachSubRatings } from '../data/coachesData';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  BASELINE_2026_ROOKIE_BONUS_TOP10,
  BASELINE_2027_ROOKIE_BONUS_TOP10,
  buildAnnualClubUniform,
  CLUB_CHAMPIONSHIP_BASELINE_2025,
  findRealPlayerClubProfile,
  REAL_OVERSEAS_MILITARY_STATUS,
} from '../data/realKboHistories';
import {
  AnnualTopAmateurRecord,
  BatterStats,
  CareerSave,
  ChampionshipRewardRecord,
  Coach,
  CoachRole,
  DraftPickProvenance,
  LiveAwardCandidate,
  LiveAwardRaces,
  MilitaryEnlistmentCandidate,
  OffseasonStep,
  OffseasonStep12,
  OffseasonStep8,
  PitcherStats,
  Player,
  PlayerTeamHistoryEntry,
  Position,
  ReleasedPlayerTrackerRecord,
  RetiredCareerPath,
  RetiredPlayerCareerRecord,
  RookieBonusRankEntry,
  TeamId,
} from '../types/kbo';
import { getKboMinSalaryBillion } from '../data/v18Importer';
import { advanceFaCompetitionRound, syncFaCompetitionMarketInPlace } from './faCompetitionEngine';
import { recordLeagueAcquisitionInPlace } from './leagueAcquisitionsEngine';
import { isMilitaryServing } from './militaryEngine';
import { SeededRng } from './rng';
import { getCurrentCareerDate } from './salaryCapEngine';
import { calcAVG, calcERA, calcOPS, formatIP } from './stats';

function pushLifeNews(
  career: CareerSave,
  item: {
    date: string;
    category:
      | '경기·시리즈'
      | '타구단소식'
      | 'MLB소식'
      | '구단사건'
      | '이적·계약'
      | '수상·이달의선수'
      | '국제·병역'
      | '규정·웨이버';
    headline: string;
    body: string;
    teamId?: TeamId;
    isHighlight?: boolean;
  }
): void {
  career.newsFeed = [
    {
      id: `news-life-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
      ...item,
    },
    ...(career.newsFeed ?? []),
  ].slice(0, 120);
}

/**
 * 구단별 통산 우승 횟수 (2025 기준선 + 2026 이후 확정·시뮬레이션 우승 이력 중복 제거 합산)
 */
export function getClubTitleCount(career: CareerSave, teamId: TeamId): number {
  const base = CLUB_CHAMPIONSHIP_BASELINE_2025[teamId]?.titlesBefore2026 ?? 0;
  const seenSeasons = new Set<number>();
  for (const c of career.championHistory ?? []) {
    if (c.season >= 2026 && c.championTeamId === teamId) {
      seenSeasons.add(c.season);
    }
  }
  return base + seenSeasons.size;
}

/**
 * 직전 시즌 한국시리즈 우승 구단(디펜딩 챔피언) 반환
 */
export function getDefendingChampionTeamId(career: CareerSave): TeamId | null {
  const targetSeason = career.season - 1;
  const found = (career.championHistory ?? []).find((c) => c.season === targetSeason);
  if (found) return found.championTeamId;
  if (targetSeason === 2026) return '삼성';
  if (targetSeason === 2025) return 'LG';
  return null;
}

/**
 * 전년 대비 연봉 인상·삭감률 포맷
 */
export function computeYoYSalaryChange(
  currentSalary: number,
  previousSalary?: number
): { pct: number | null; label: string; direction: 'up' | 'down' | 'flat' | 'new' } {
  if (previousSalary === undefined || previousSalary === null || previousSalary <= 0) {
    return { pct: null, label: '신규', direction: 'new' };
  }
  if (currentSalary <= 0) {
    return { pct: null, label: '미확인', direction: 'flat' };
  }
  const rawPct = ((currentSalary - previousSalary) / previousSalary) * 100;
  const rounded = Math.round(rawPct * 10) / 10;
  if (Math.abs(rounded) < 0.5) {
    return { pct: 0, label: '동결 (0%)', direction: 'flat' };
  }
  if (rounded > 0) {
    return { pct: rounded, label: `+${rounded.toFixed(1)}%`, direction: 'up' };
  }
  return { pct: rounded, label: `${rounded.toFixed(1)}%`, direction: 'down' };
}

/**
 * 개인 타이틀 수상 효과 (#20)
 * - MVP: 차기 시즌 연봉 요구 +22%, 인기 지수 상승
 * - 신인왕: 차기 시즌 연봉 요구 +20%
 * - 골든글러브: 선수 시장/트레이드 가치 상승 (+10%)
 */
export function getAwardSalaryDemandMultiplier(player: Player): {
  multiplier: number;
  reasons: string[];
} {
  const awards = player.lastSeasonAwards ?? [];
  let mult = 1.0;
  const reasons: string[] = [];
  if (awards.includes('MVP')) {
    mult += 0.22;
    reasons.push('MVP 수상 프리미엄 (+22%)');
  }
  if (awards.includes('신인왕')) {
    mult += 0.20;
    reasons.push('신인왕 수상 프리미엄 (+20%)');
  }
  if (awards.includes('골든글러브')) {
    mult += 0.06;
    reasons.push('골든글러브 수상 (+6%)');
  }
  return { multiplier: Number(mult.toFixed(3)), reasons };
}

export function getAwardTradeValueMultiplier(player: Player): {
  multiplier: number;
  popularityBonus: number;
  reasons: string[];
} {
  const awards = player.lastSeasonAwards ?? [];
  let multiplier = 1.0;
  let popularityBonus = 0;
  const reasons: string[] = [];
  if (awards.includes('골든글러브')) {
    multiplier += 0.10;
    popularityBonus += 6;
    reasons.push('골든글러브 수상 시장가치 +10%');
  }
  if (awards.includes('MVP')) {
    multiplier += 0.08;
    popularityBonus += 15;
    reasons.push('MVP 수상 인기·가치 프리미엄');
  }
  if (awards.includes('신인왕')) {
    multiplier += 0.05;
    popularityBonus += 8;
    reasons.push('신인왕 수상 프리미엄');
  }
  return { multiplier: Number(multiplier.toFixed(3)), popularityBonus, reasons };
}

/**
 * 통산 소속팀 이력이 MLB 소속 시즌인지 판별
 */
export function isMlbHistoryEntry(h: PlayerTeamHistoryEntry): boolean {
  if (h.league === 'MLB' || Boolean(h.mlbTeamName)) return true;
  return /\(MLB\)/i.test(h.teamLabel) || /^MLB\s+/i.test(h.teamLabel);
}

/**
 * 통산 소속팀 이력 중 MLB 소속 시즌 수 (같은 연도 복수 구단 이적은 1시즌으로 중복 제거)
 */
export function countDistinctMlbSeasons(history?: PlayerTeamHistoryEntry[]): number {
  if (!history || history.length === 0) return 0;
  const years = new Set<number>();
  for (const h of history) {
    if (!isMlbHistoryEntry(h)) continue;
    const from = h.fromSeason;
    const to = h.toSeason ?? from;
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    for (let y = start; y <= end; y += 1) {
      years.add(y);
    }
  }
  return years.size;
}

/**
 * 외국인/해외파 선수의 previousLeagueClub 문자열(예: 'MLB 시카고 화이트삭스 · AAA 샬럿')에서 MLB 소속 이력 추론
 */
export function inferMlbStintFromPreviousLeagueClub(
  player: Player,
  currentSeason: number
): PlayerTeamHistoryEntry | null {
  const prev = player.previousLeagueClub?.trim();
  if (!prev) return null;
  if (/^MLB\s*\/\s*AAA/i.test(prev)) return null;
  const match = prev.match(/MLB\s+([^·/(]+)/i);
  if (!match) return null;
  const clubName = match[1].replace(/\s*산하\s*$/, '').trim();
  if (!clubName || /^(AAA|AA|마이너리그|산하)$/i.test(clubName)) return null;
  const toSeason = Math.max(2016, currentSeason - 1);
  const spanYears = player.age >= 31 ? 3 : player.age >= 27 ? 2 : 1;
  const fromSeason = Math.max(2015, toSeason - (spanYears - 1));
  return {
    teamLabel: clubName,
    league: 'MLB',
    mlbTeamName: clubName,
    fromSeason,
    toSeason,
    note: 'MLB 경력',
  };
}

/**
 * 선수 MLB 진출/소속 시 통산 소속 구단 이력에 MLB 시즌 추가
 */
export function appendPlayerMlbHistoryInPlace(
  player: Player,
  mlbTeamName: string,
  fromSeason: number,
  toSeason?: number,
  note?: string
): void {
  const cleanClub =
    mlbTeamName
      .replace(/^MLB\s+/i, '')
      .replace(/\s*\(MLB\)\s*$/i, '')
      .trim() || mlbTeamName;

  if (!player.careerTeamHistory || player.careerTeamHistory.length === 0) {
    const startYear = Math.max(2005, fromSeason - Math.max(1, player.serviceYears || 1));
    player.careerTeamHistory = [
      {
        teamLabel: KBO_TEAMS[player.teamId]?.name ?? player.teamId,
        teamId: player.teamId,
        league: 'KBO',
        fromSeason: Math.min(startYear, fromSeason - 1),
        toSeason: Math.max(startYear, fromSeason - 1),
      },
    ];
  }

  const last = player.careerTeamHistory[player.careerTeamHistory.length - 1];
  if (
    last &&
    isMlbHistoryEntry(last) &&
    (last.mlbTeamName === cleanClub || last.teamLabel === cleanClub) &&
    last.fromSeason === fromSeason
  ) {
    if (toSeason !== undefined) last.toSeason = toSeason;
    if (note) last.note = note;
    return;
  }
  if (last && !last.toSeason) {
    last.toSeason = Math.max(last.fromSeason, fromSeason - 1);
  }
  player.careerTeamHistory.push({
    teamLabel: cleanClub,
    league: 'MLB',
    mlbTeamName: cleanClub,
    fromSeason,
    toSeason,
    note,
  });
}

/**
 * 선수 이적 시 통산 소속 구단 이력 업데이트 + 원클럽맨 여부 자동 갱신 (#1, #11)
 */
export function appendPlayerTeamHistoryInPlace(
  player: Player,
  newTeamId: TeamId,
  season: number,
  note?: string
): void {
  if (!player.careerTeamHistory || player.careerTeamHistory.length === 0) {
    const startYear = Math.max(2005, season - Math.max(0, player.serviceYears || 0));
    player.careerTeamHistory = [
      {
        teamLabel: KBO_TEAMS[player.teamId]?.name ?? player.teamId,
        teamId: player.teamId,
        league: 'KBO',
        fromSeason: startYear,
      },
    ];
  }
  const last = player.careerTeamHistory[player.careerTeamHistory.length - 1];
  if (last && last.teamId === newTeamId && !last.toSeason) {
    return;
  }
  if (last && !last.toSeason) {
    last.toSeason = isMlbHistoryEntry(last) ? Math.max(last.fromSeason, season - 1) : season;
  }
  player.careerTeamHistory.push({
    teamLabel: KBO_TEAMS[newTeamId]?.name ?? newTeamId,
    teamId: newTeamId,
    league: 'KBO',
    fromSeason: season,
    note,
  });

  // 타 KBO 구단 소속 이력이 2개 이상이면 원클럽맨 해제 (MLB 진출 후 원소속 복귀는 KBO 원클럽맨 유지)
  const distinctKboTeams = new Set(
    player.careerTeamHistory.map((h) => h.teamId).filter((t): t is TeamId => Boolean(t))
  );
  player.isOneClubMan = player.category === '국내' && distinctKboTeams.size <= 1;
}

/**
 * 선수의 현실 통산 이력(MLB/NPB/KBO) 또는 폴백 이력 생성
 */
export function buildInitialPlayerTeamHistory(
  player: Player,
  season: number
): { history: PlayerTeamHistoryEntry[]; isOneClubMan: boolean; clubTenure2026?: number } {
  const realProfile = findRealPlayerClubProfile(player.name, player.teamId);
  if (realProfile) {
    const cloned: PlayerTeamHistoryEntry[] = realProfile.history.map((h) => ({
      ...h,
      league: h.league ?? (h.teamId ? 'KBO' : undefined),
    }));
    const lastEntry = cloned[cloned.length - 1];
    if (lastEntry && lastEntry.teamId && lastEntry.teamId !== player.teamId) {
      lastEntry.toSeason = Math.min(season, 2025);
      cloned.push({
        teamLabel: KBO_TEAMS[player.teamId]?.name ?? player.teamId,
        teamId: player.teamId,
        league: 'KBO',
        fromSeason: season,
        note: 'FA/트레이드 이적',
      });
      return { history: cloned, isOneClubMan: false, clubTenure2026: 1 };
    }
    if (lastEntry && !lastEntry.teamId && player.teamId && player.rosterTier !== '해외이적') {
      if (!lastEntry.toSeason) {
        lastEntry.toSeason = Math.max(lastEntry.fromSeason, season - 1);
      }
      cloned.push({
        teamLabel: KBO_TEAMS[player.teamId]?.name ?? player.teamId,
        teamId: player.teamId,
        league: 'KBO',
        fromSeason: season,
        note: '해외파 KBO 복귀',
      });
      const distinctKbo = new Set(
        cloned.map((h) => h.teamId).filter((t): t is TeamId => Boolean(t))
      );
      return {
        history: cloned,
        isOneClubMan: player.category === '국내' && distinctKbo.size <= 1,
        clubTenure2026: realProfile.clubTenure2026,
      };
    }
    return {
      history: cloned,
      isOneClubMan: realProfile.isOneClubMan,
      clubTenure2026: realProfile.clubTenure2026,
    };
  }

  const startSeason =
    player.acquisitionInfo?.draftYear ??
    Math.max(2008, season - Math.max(0, player.serviceYears || 0));
  const kboFromSeason = Math.min(season, startSeason);
  const teamLabel = KBO_TEAMS[player.teamId]?.name ?? player.teamId;
  const history: PlayerTeamHistoryEntry[] = [];

  if (player.category !== '국내') {
    const inferredMlb = inferMlbStintFromPreviousLeagueClub(player, kboFromSeason);
    if (inferredMlb) {
      history.push(inferredMlb);
    }
  }

  history.push({
    teamLabel,
    teamId: player.teamId,
    league: 'KBO',
    fromSeason: kboFromSeason,
    note: player.acquisitionInfo?.label,
  });

  const isOneClubMan =
    player.category !== '국내'
      ? false
      : player.acquisitionInfo?.type === 'FA/트레이드'
      ? false
      : true;
  return { history, isOneClubMan };
}

/**
 * 기존 세이브/신규 세이브 공통 초기화 (날짜·경기·계약·드래프트·시즌 자동 진행 절대 없음)
 */
export function ensureLeagueLifeStateInPlace(career: CareerSave): void {
  const season = career.season || 2026;
  const rng = new SeededRng((career.seed || 2026) * 31 + 701);

  if (!career.releasedPlayersTracker) career.releasedPlayersTracker = [];
  if (!career.retiredCareerTracker) career.retiredCareerTracker = [];
  if (!career.championshipRewardsLog) career.championshipRewardsLog = [];
  if (!career.championshipRewardSettledSeasons) career.championshipRewardSettledSeasons = [];
  if (!career.tradedDraftPicks) career.tradedDraftPicks = [];
  if (!career.rookieBonusRankingsBySeason) {
    career.rookieBonusRankingsBySeason = {
      2026: BASELINE_2026_ROOKIE_BONUS_TOP10.map((e) => ({ ...e })),
      2027: BASELINE_2027_ROOKIE_BONUS_TOP10.map((e) => ({ ...e })),
    };
  } else if (!career.rookieBonusRankingsBySeason[2027] && season >= 2027) {
    career.rookieBonusRankingsBySeason[2027] = BASELINE_2027_ROOKIE_BONUS_TOP10.map((e) => ({ ...e }));
  }

  // 1. 선수별 현실 KBO·MLB 통산 소속팀, 원클럽맨, 전년 연봉 보정 (#1, #9, #11)
  for (const player of Object.values(career.players)) {
    const realProfile = findRealPlayerClubProfile(player.name, player.teamId);

    if (!player.careerTeamHistory || player.careerTeamHistory.length === 0) {
      const built = buildInitialPlayerTeamHistory(player, season);
      player.careerTeamHistory = built.history;
      player.isOneClubMan = built.isOneClubMan;
      if (built.clubTenure2026 !== undefined) {
        if (!player.clubTenureSeasons || player.clubTenureSeasons < 1) {
          player.clubTenureSeasons = built.clubTenure2026 + Math.max(0, season - 2026);
        } else if (season === 2026) {
          player.clubTenureSeasons = built.clubTenure2026;
        }
      }
    } else {
      // 기존 세이브의 KBO 이력에 league 필드 보정
      for (const h of player.careerTeamHistory) {
        if (!h.league && h.teamId) {
          h.league = 'KBO';
        }
      }

      // 기존 세이브에 MLB/NPB 이력이 누락되었거나 구버전 '(MLB)' 표기인 경우 비파괴 업그레이드
      if (realProfile) {
        const profileHasOverseas = realProfile.history.some(
          (h) => isMlbHistoryEntry(h) || h.league === 'NPB'
        );
        const currentHasMlb = player.careerTeamHistory.some(isMlbHistoryEntry);
        const hasLegacyMlbLabel = player.careerTeamHistory.some((h) =>
          /\(MLB\)/i.test(h.teamLabel)
        );
        if (profileHasOverseas && (!currentHasMlb || hasLegacyMlbLabel)) {
          const baseHistory: PlayerTeamHistoryEntry[] = realProfile.history.map((h) => ({
            ...h,
            league: h.league ?? (h.teamId ? 'KBO' : undefined),
          }));
          const lastBase = baseHistory[baseHistory.length - 1];
          // 2026년 이후 인게임에서 발생한 추가 이적/MLB 진출 이력은 그대로 보존
          const post2026Transfers = player.careerTeamHistory.filter((h) => {
            if (h.fromSeason < 2026) return false;
            if (lastBase && h.teamId && lastBase.teamId === h.teamId && h.fromSeason === lastBase.fromSeason) {
              return false;
            }
            if (
              lastBase &&
              h.teamId &&
              lastBase.teamId === h.teamId &&
              !lastBase.toSeason
            ) {
              return false;
            }
            return true;
          });
          if (post2026Transfers.length > 0) {
            if (lastBase && !lastBase.toSeason) {
              const firstTransferYear = post2026Transfers[0].fromSeason;
              lastBase.toSeason = Math.max(
                lastBase.fromSeason,
                isMlbHistoryEntry(post2026Transfers[0]) ? firstTransferYear - 1 : firstTransferYear
              );
            }
            baseHistory.push(...post2026Transfers.map((h) => ({ ...h })));
          } else if (
            lastBase &&
            lastBase.teamId &&
            lastBase.teamId !== player.teamId &&
            player.rosterTier !== '해외이적' &&
            player.rosterTier !== '은퇴'
          ) {
            lastBase.toSeason = Math.min(season, 2025);
            baseHistory.push({
              teamLabel: KBO_TEAMS[player.teamId]?.name ?? player.teamId,
              teamId: player.teamId,
              league: 'KBO',
              fromSeason: season,
              note: 'FA/트레이드 이적',
            });
          }
          player.careerTeamHistory = baseHistory;
          const distinctKbo = new Set(
            baseHistory.map((h) => h.teamId).filter((t): t is TeamId => Boolean(t))
          );
          player.isOneClubMan = player.category === '국내' && distinctKbo.size <= 1;
        }
      } else if (player.category !== '국내' && !player.careerTeamHistory.some(isMlbHistoryEntry)) {
        const firstKboSeason = player.careerTeamHistory[0]?.fromSeason ?? season;
        const inferredMlb = inferMlbStintFromPreviousLeagueClub(player, firstKboSeason);
        if (inferredMlb) {
          player.careerTeamHistory = [inferredMlb, ...player.careerTeamHistory];
        }
      }

      if (player.isOneClubMan === undefined) {
        const distinctKbo = new Set(
          player.careerTeamHistory.map((h) => h.teamId).filter((t): t is TeamId => Boolean(t))
        );
        player.isOneClubMan = player.category === '국내' && distinctKbo.size <= 1;
      }
    }

    // 전년도 연봉 초기화 (전년 대비 인상·삭감률 표시용 #9)
    if (
      player.previousAnnualSalary === undefined &&
      player.contract.currency === 'KRW' &&
      player.contract.annualSalary > 0
    ) {
      if ((player.serviceYears ?? 0) <= 0 || player.rookieInfo?.draftId === season) {
        // 신인은 전년도 연봉 없음 ('신규')
        player.previousAnnualSalary = 0;
      } else {
        // 선수별 결정론적 직전 연봉 추정 (기존 연봉의 82%~112% 범위)
        const hash =
          player.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
          player.name.charCodeAt(0);
        const factor = 0.84 + ((hash % 29) * 0.01); // 0.84..1.12
        const prev = Math.max(0.3, Math.round((player.contract.annualSalary / factor) * 100) / 100);
        player.previousAnnualSalary = prev;
      }
    }
  }

  // 2. 구단별 매년 신규 유니폼 에디션 초기화 (#17)
  for (const tid of TEAM_IDS) {
    const team = career.teams[tid];
    if (!team) continue;
    const info = KBO_TEAMS[tid];
    if (!team.currentUniform) {
      const edition = buildAnnualClubUniform(
        tid,
        season,
        info.primaryColor,
        info.secondaryColor,
        info.accentColor
      );
      team.currentUniform = edition;
      team.uniformHistory = [edition];
    } else if (!team.uniformHistory || team.uniformHistory.length === 0) {
      team.uniformHistory = [team.currentUniform];
    }
  }

  // 3. 해외파 병역 상태 보정 (#16)
  if (career.amateurAndOverseas) {
    for (const op of career.amateurAndOverseas.overseasPlayers) {
      if (!op.militaryStatus) {
        const realMil = REAL_OVERSEAS_MILITARY_STATUS[op.name];
        if (realMil) {
          op.militaryStatus = realMil.status;
          op.militaryNote = realMil.note;
        } else {
          op.militaryStatus = op.age >= 29 ? '군필' : '미필';
          op.militaryNote = op.age >= 29 ? '병역 필' : '병역 미필 (국외체류)';
        }
      }
    }

    // 고교 최대어 · 대학 최대어 · 신인 드래프트 초청 명단 초기화 (#21, 자동 진행 없음)
    if (
      !career.amateurAndOverseas.annualTopProspects ||
      !career.amateurAndOverseas.annualTopProspects.some((x) => x.season === season)
    ) {
      selectAnnualTopAmateurProspectsInPlace(career, false);
    }
  }

  // 4. 드래프트 지명권 출처(원소속 vs 트레이드) 초기화 (#13)
  if (career.draftState) {
    ensureDraftPickProvenanceInPlace(career);
  }

  // 5. 임시 주장 동기화 (#15)
  for (const tid of TEAM_IDS) {
    syncActingCaptainInPlace(career, tid, false);
  }

  // Prevent unused rng warning if needed
  void rng;
}

/**
 * 드래프트 지명권 출처 동기화 (#13)
 */
export function ensureDraftPickProvenanceInPlace(career: CareerSave): void {
  const ds = career.draftState;
  if (!ds) return;
  const baseOrder = ds.draftOrder ?? TEAM_IDS;
  if (!ds.pickProvenance || ds.pickProvenance.length === 0) {
    const prov: DraftPickProvenance[] = [];
    for (let round = 1; round <= 11; round += 1) {
      const order = round === 1 && ds.round1DraftOrder ? ds.round1DraftOrder : baseOrder;
      for (const origTeam of order) {
        const traded = (career.tradedDraftPicks ?? []).find(
          (t) => t.round === round && t.originalTeamId === origTeam
        );
        prov.push({
          round,
          originalTeamId: origTeam,
          ownerTeamId: traded ? traded.ownerTeamId : origTeam,
          acquiredViaTradeNote: traded?.acquiredViaTradeNote,
          acquiredDate: traded?.acquiredDate,
        });
      }
    }
    ds.pickProvenance = prov;
  }

  // 드래프트 후보에 고교/대학 최대어 & 현장 초청 배지 반영 (#21)
  const topRec = career.amateurAndOverseas?.annualTopProspects?.find(
    (r) => r.season === ds.season
  );
  if (topRec) {
    const inviteeSet = new Set(topRec.draftInviteePermanentIds);
    for (const cand of ds.candidates) {
      if (cand.permanentId && inviteeSet.has(cand.permanentId)) {
        cand.invitedToDraftCeremony = true;
      }
      if (cand.permanentId && topRec.topHighSchool?.permanentId === cand.permanentId) {
        cand.topProspectBadge = '고교 최대어';
        cand.invitedToDraftCeremony = true;
      } else if (cand.permanentId && topRec.topCollege?.permanentId === cand.permanentId) {
        cand.topProspectBadge = '대학 최대어';
        cand.invitedToDraftCeremony = true;
      }
    }
  }
  // 상위 12명(잠재력·능력 기준)은 드래프트 현장 초청 자동 보장
  const alreadyInvited = ds.candidates.filter((c) => c.invitedToDraftCeremony).length;
  if (alreadyInvited < 12) {
    const sorted = [...ds.candidates].sort(
      (a, b) => b.potential * 0.65 + b.ability * 0.35 - (a.potential * 0.65 + a.ability * 0.35)
    );
    sorted.slice(0, 12).forEach((c) => {
      c.invitedToDraftCeremony = true;
    });
  }
}

/**
 * 지명권 트레이드 기록 (#13)
 */
export function recordDraftPickTradeInPlace(
  career: CareerSave,
  round: number,
  fromTeamId: TeamId,
  toTeamId: TeamId,
  date: string
): void {
  if (!career.tradedDraftPicks) career.tradedDraftPicks = [];
  const existing = career.tradedDraftPicks.find(
    (p) => p.round === round && p.ownerTeamId === fromTeamId
  );
  const originalTeamId = existing ? existing.originalTeamId : fromTeamId;
  const note =
    originalTeamId === toTeamId
      ? undefined
      : `${originalTeamId}→${toTeamId} 트레이드 획득 (${date})`;

  if (existing) {
    existing.ownerTeamId = toTeamId;
    existing.acquiredViaTradeNote = note;
    existing.acquiredDate = date;
  } else {
    career.tradedDraftPicks.push({
      round,
      originalTeamId,
      ownerTeamId: toTeamId,
      acquiredViaTradeNote: note,
      acquiredDate: date,
    });
  }

  // 현재 드래프트 상태가 미완료면 즉시 반영
  if (career.draftState && !career.draftState.completed && career.draftState.pickProvenance) {
    const slot = career.draftState.pickProvenance.find(
      (p) => p.round === round && p.originalTeamId === originalTeamId
    );
    if (slot) {
      slot.ownerTeamId = toTeamId;
      slot.acquiredViaTradeNote = note;
      slot.acquiredDate = date;
    }
  }
}

/**
 * 시즌 중 MVP · 신인왕 · 골든글러브 예상 순위 실시간 산출 (#6)
 */
export function computeLiveAwardRaces(career: CareerSave): LiveAwardRaces {
  const allPlayers = Object.values(career.players).filter(
    (p) => p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적' && p.rosterTier !== 'FA'
  );

  const scoreBatter = (p: Player): { score: number; statSummary: string; qualified: boolean } => {
    const st = p.stats as BatterStats;
    const g = st.G ?? 0;
    const pa = st.PA ?? 0;
    const ab = st.AB ?? 0;
    const h = st.H ?? 0;
    const hr = st.HR ?? 0;
    const rbi = st.RBI ?? 0;
    const r = st.R ?? 0;
    const sb = st.SB ?? 0;
    const avg = calcAVG(h, ab);
    const ops = calcOPS(st);

    if (pa < 8) {
      // 시즌 극초반(0~3경기)에도 능력치·폼 기반 프리뷰 예상 순위 제공
      const preScore = p.ability * 0.85 + p.form * 1.5;
      return {
        score: Number(preScore.toFixed(1)),
        statSummary: `${g}경기 · 타율 ${avg !== null ? avg.toFixed(3) : '-'} · ${hr}홈런 ${rbi}타점`,
        qualified: false,
      };
    }
    const opsVal = ops ?? 0.7;
    const avgVal = avg ?? 0.25;
    const score =
      opsVal * 65 +
      avgVal * 45 +
      hr * 1.55 +
      rbi * 0.42 +
      r * 0.25 +
      sb * 0.35 +
      Math.min(40, h * 0.18) +
      Math.min(12, ab * 0.025);
    return {
      score: Number(score.toFixed(1)),
      statSummary: `타율 ${avgVal.toFixed(3)} · OPS ${opsVal.toFixed(3)} · ${hr}홈런 ${rbi}타점 ${sb}도루`,
      qualified: true,
    };
  };

  const scorePitcher = (p: Player): { score: number; statSummary: string; qualified: boolean } => {
    const st = p.stats as PitcherStats;
    const g = st.G ?? 0;
    const outs = st.outs ?? 0;
    const ip = outs / 3;
    const w = st.W ?? 0;
    const l = st.L ?? 0;
    const sv = st.SV ?? 0;
    const hld = st.HLD ?? 0;
    const so = st.SO ?? 0;
    const era = calcERA(st.ER, outs);

    if (outs < 9) {
      const preScore = p.ability * 0.84 + p.form * 1.5;
      return {
        score: Number(preScore.toFixed(1)),
        statSummary: `${g}경기 · ${formatIP(outs)}이닝 · ${w}승 ${sv}세이브 · ERA ${era !== null ? era.toFixed(2) : '-'}`,
        qualified: false,
      };
    }
    const eraVal = era ?? 4.2;
    const eraBonus = Math.max(-15, (4.3 - eraVal) * 14);
    const score =
      52 +
      eraBonus +
      w * 3.4 -
      l * 0.8 +
      sv * 1.9 +
      hld * 1.15 +
      so * 0.24 +
      ip * 0.22;
    return {
      score: Number(score.toFixed(1)),
      statSummary: `ERA ${eraVal.toFixed(2)} · ${w}승 ${l}패 ${sv > 0 ? `${sv}세이브 ` : ''}${hld > 0 ? `${hld}홀드 ` : ''}· ${formatIP(outs)}이닝 ${so}K`,
      qualified: true,
    };
  };

  const evaluated = allPlayers.map((p) => {
    const res = p.role === '타자' ? scoreBatter(p) : scorePitcher(p);
    return { player: p, ...res };
  });

  // MVP Top 10
  const mvpSorted = [...evaluated]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map<LiveAwardCandidate>((item, idx) => ({
      rank: idx + 1,
      playerId: item.player.id,
      playerName: item.player.name,
      teamId: item.player.teamId,
      position: item.player.position,
      role: item.player.role,
      score: item.score,
      statSummary: item.statSummary,
      tag: idx === 0 ? '유력 후보' : idx < 3 ? '상위 경쟁' : undefined,
    }));

  // 신인왕 Top 10 (국내 선수, 프로 연차 2년 이하 또는 나이 23세 이하 신인급)
  const rookiePool = evaluated.filter((item) => {
    const p = item.player;
    if (p.category !== '국내') return false;
    return (p.serviceYears ?? 0) <= 2 && p.age <= 24;
  });
  const rookieSorted = rookiePool
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map<LiveAwardCandidate>((item, idx) => ({
      rank: idx + 1,
      playerId: item.player.id,
      playerName: item.player.name,
      teamId: item.player.teamId,
      position: item.player.position,
      role: item.player.role,
      score: item.score,
      statSummary: item.statSummary,
      tag: item.player.rookieInfo?.pickNotation ?? `${item.player.age}세 신예`,
    }));

  // 골든글러브 포지션별 후보 (투수, 포수, 1루, 2루, 3루, 유격수, 외야수 TOP 5, 지명타자)
  const ggGroups: { label: string; positions: Position[]; limit: number }[] = [
    { label: '투수', positions: ['SP', 'RP', 'CL'], limit: 3 },
    { label: '포수', positions: ['C'], limit: 3 },
    { label: '1루수', positions: ['1B'], limit: 3 },
    { label: '2루수', positions: ['2B'], limit: 3 },
    { label: '3루수', positions: ['3B'], limit: 3 },
    { label: '유격수', positions: ['SS'], limit: 3 },
    { label: '외야수 (3명 수상)', positions: ['LF', 'CF', 'RF'], limit: 5 },
    { label: '지명타자', positions: ['DH'], limit: 3 },
  ];

  const goldenGloveByPos = ggGroups.map((grp) => {
    const candidates = evaluated
      .filter((item) => grp.positions.includes(item.player.position))
      .sort((a, b) => b.score - a.score)
      .slice(0, grp.limit)
      .map<LiveAwardCandidate>((item, idx) => ({
        rank: idx + 1,
        playerId: item.player.id,
        playerName: item.player.name,
        teamId: item.player.teamId,
        position: item.player.position,
        role: item.player.role,
        score: item.score,
        statSummary: item.statSummary,
        tag: grp.label.startsWith('외야수')
          ? idx < 3
            ? '수상권'
            : '추격권'
          : idx === 0
          ? '1위 유력'
          : undefined,
      }));
    return { positionLabel: grp.label, candidates };
  });

  return {
    season: career.season,
    gamesPlayed: career.gamesPlayed,
    mvpTop10: mvpSorted,
    rookieTop10: rookieSorted,
    goldenGloveByPos,
  };
}

/**
 * 군입대 예정자 명단 및 상무 복무 전역 예정일 산출 (#7)
 */
export function getMilitaryEnlistmentQueue(
  career: CareerSave,
  filterTeamId?: TeamId | 'ALL'
): MilitaryEnlistmentCandidate[] {
  const season = career.season;
  const rows: MilitaryEnlistmentCandidate[] = [];

  for (const p of Object.values(career.players)) {
    if (p.category !== '국내' || p.rosterTier === '은퇴' || p.rosterTier === '해외이적') continue;
    if (filterTeamId && filterTeamId !== 'ALL' && p.teamId !== filterTeamId) continue;

    if (isMilitaryServing(p.militaryStatus)) {
      const enlistSeason = p.militaryEnlistedSeason ?? season;
      const returnSeason = p.militaryReturnSeason ?? enlistSeason + 2;
      const enlistDate = p.militaryEnlistDate ?? `${enlistSeason}-12-07`;
      const dischargeDate = p.militaryDischargeDate ?? `${returnSeason}-06-15`;
      rows.push({
        playerId: p.id,
        playerName: p.name,
        teamId: p.teamId,
        position: p.position,
        age: p.age,
        ability: p.ability,
        potential: p.potential,
        status: '상무 복무중',
        expectedEnlistDate: enlistDate,
        expectedDischargeDate: dischargeDate,
        note: p.militaryNote ?? `상무 피닉스 복무 중 · ${dischargeDate} 전역 예정 (1군 콜업 불가)`,
      });
    } else if (
      (p.militaryStatus === '미필' || p.militaryStatus === '입대 예정') &&
      p.age >= 19 &&
      p.age <= 27
    ) {
      const offsetYears = p.militaryStatus === '입대 예정' || p.age >= 25 ? 0 : p.age >= 22 ? 1 : 2;
      const enlistSeason = season + offsetYears;
      const dischargeSeason = enlistSeason + 2;
      rows.push({
        playerId: p.id,
        playerName: p.name,
        teamId: p.teamId,
        position: p.position,
        age: p.age,
        ability: p.ability,
        potential: p.potential,
        status: '입대 예정',
        expectedEnlistDate: p.militaryEnlistDate ?? `${enlistSeason}-12-07`,
        expectedDischargeDate: p.militaryDischargeDate ?? `${dischargeSeason}-06-06`,
        note:
          p.age >= 26
            ? '입영 임박 (상무 지원 권장 · 확인된 미필)'
            : p.ability >= 78
            ? '핵심 전력 미필 (국제대회 병역특례 또는 상무 시기 조율)'
            : '상무 피닉스 지원 가능 (18개월 복무)',
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === '상무 복무중' ? -1 : 1;
    return a.expectedEnlistDate.localeCompare(b.expectedEnlistDate) || b.age - a.age;
  });
}

/**
 * 방출 선수 근황 기록 (#5)
 */
export function recordReleasedPlayerInPlace(
  career: CareerSave,
  player: Player,
  fromTeamId: TeamId,
  note?: string
): void {
  if (!career.releasedPlayersTracker) career.releasedPlayersTracker = [];
  const today = getCurrentCareerDate(career).isoDate;
  const existing = career.releasedPlayersTracker.find(
    (r) => r.playerId === player.id && r.releasedSeason === career.season
  );
  if (existing) {
    existing.status = '자유계약(무적)';
    existing.currentTeamLabel = '무적 (FA 대기)';
    existing.statusUpdatedDate = today;
    if (note) existing.note = note;
    return;
  }
  career.releasedPlayersTracker.unshift({
    id: `rel-${career.season}-${player.id}-${Date.now()}`,
    playerId: player.id,
    permanentId: player.permanentId,
    playerName: player.name,
    age: player.age,
    position: player.position,
    ability: player.ability,
    releasedFromTeamId: fromTeamId,
    releasedDate: today,
    releasedSeason: career.season,
    status: '자유계약(무적)',
    currentTeamLabel: '무적 (FA/테스트 대기)',
    statusUpdatedDate: today,
    note: note ?? `${KBO_TEAMS[fromTeamId].name} 방출`,
  });
  career.releasedPlayersTracker = career.releasedPlayersTracker.slice(0, 120);
}

/**
 * 방출 선수가 타 구단에 영입되었을 때 근황 갱신 (#5)
 */
export function markReleasedPlayerSignedInPlace(
  career: CareerSave,
  playerId: string,
  newTeamId: TeamId,
  note?: string
): void {
  const list = career.releasedPlayersTracker ?? [];
  const rec = list.find((r) => r.playerId === playerId);
  if (!rec) return;
  rec.status = '타구단 이적';
  rec.currentTeamLabel = KBO_TEAMS[newTeamId]?.name ?? newTeamId;
  rec.statusUpdatedDate = getCurrentCareerDate(career).isoDate;
  rec.note = note ?? `${KBO_TEAMS[newTeamId].name} 입단 계약`;
}

/**
 * 오프시즌 미계약 방출 선수의 이적 · 독립리그/울산 · 은퇴 근황 자동 정리 (#5)
 */
export function processOffseasonReleasedPlayersInPlace(career: CareerSave, rng: SeededRng): void {
  const list = career.releasedPlayersTracker ?? [];
  const today = `${career.season}-01-25`;
  for (const rec of list) {
    if (rec.status !== '자유계약(무적)') continue;
    const p = career.players[rec.playerId];
    if (p && p.rosterTier !== 'FA' && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적') {
      rec.status = '타구단 이적';
      rec.currentTeamLabel = KBO_TEAMS[p.teamId]?.name ?? p.teamId;
      rec.statusUpdatedDate = today;
      rec.note = `${KBO_TEAMS[p.teamId].name} 재취업 성공`;
      continue;
    }
    if (rec.age >= 35 || rec.ability <= 55) {
      rec.status = '은퇴';
      rec.currentTeamLabel = '현역 은퇴';
      rec.statusUpdatedDate = today;
      rec.note = '소속팀을 찾지 못하고 현역 은퇴 결정';
      if (p && p.rosterTier !== '은퇴') {
        p.rosterTier = '은퇴';
        assignRetiredPlayerCareerInPlace(career, p, rng);
      }
    } else if (rng.next() < 0.42) {
      rec.status = '독립리그/울산';
      rec.currentTeamLabel = rng.next() < 0.5 ? '울산 웨일즈 / 독립리그' : '경기도 독립야구단';
      rec.statusUpdatedDate = today;
      rec.note = '독립야구단에서 KBO 재진입 도전 중';
    }
  }
}

/**
 * 선수단 정리 예정 지정 토글 (#12)
 */
export function togglePlayerOffseasonReleaseMark(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; marked: boolean; error?: string } {
  const next = JSON.parse(JSON.stringify(career)) as CareerSave;
  const p = next.players[playerId];
  if (!p) return { nextCareer: career, marked: false, error: '선수를 찾을 수 없습니다.' };
  if (p.teamId !== next.playerTeamId) {
    return { nextCareer: career, marked: false, error: '우리 구단 소속 선수만 정리 예정 표시할 수 있습니다.' };
  }
  p.markedForOffseasonRelease = !p.markedForOffseasonRelease;
  return { nextCareer: next, marked: p.markedForOffseasonRelease };
}

/**
 * 정리 예정 선수 일괄 방출 (#12)
 */
export function executeMarkedOffseasonReleases(
  career: CareerSave
): { nextCareer: CareerSave; releasedNames: string[]; error?: string } {
  const next = JSON.parse(JSON.stringify(career)) as CareerSave;
  const markedPlayers = Object.values(next.players).filter(
    (p) =>
      p.teamId === next.playerTeamId &&
      p.markedForOffseasonRelease &&
      p.rosterTier !== 'FA' &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적'
  );
  if (markedPlayers.length === 0) {
    return { nextCareer: career, releasedNames: [], error: '정리 예정으로 지정된 선수가 없습니다.' };
  }
  const today = getCurrentCareerDate(next).isoDate;
  const releasedNames: string[] = [];
  const team = next.teams[next.playerTeamId];

  for (const p of markedPlayers) {
    p.formerTeamId = p.teamId;
    p.rosterTier = 'FA';
    p.gameDayActive = false;
    p.markedForOffseasonRelease = false;
    p.contract.status = 'FA';
    p.contract.yearsRemaining = 0;
    if (team) {
      team.lineupOrder = team.lineupOrder.filter((id) => id !== p.id);
      team.rotationOrder = team.rotationOrder.filter((id) => id !== p.id);
      team.bullpenOrder = team.bullpenOrder.filter((id) => id !== p.id);
      team.benchOrder = team.benchOrder.filter((id) => id !== p.id);
    }
    recordReleasedPlayerInPlace(next, p, next.playerTeamId, '시즌 종료 정리 예정 명단 일괄 방출');
    releasedNames.push(p.name);
  }

  next.transactionLogs.unshift({
    id: `tx-batch-rel-${Date.now()}`,
    date: today,
    type: '엔트리',
    teamId: next.playerTeamId,
    summary: `선수단 정리 예정 ${releasedNames.length}명 일괄 방출 (${releasedNames.slice(0, 5).join(', ')}${releasedNames.length > 5 ? ' 외' : ''})`,
  });

  return { nextCareer: next, releasedNames };
}

/**
 * 은퇴선수 진로 자동 배정 (#14) & 코치 연수 (#15)
 * - 선수 은퇴 시 포지션·통산 성적·리더십 기반 AI 자동 결정
 * - 프로야구 코치 전환 선수는 기존 faCoaches 시장에 편입 (유저 구단 자동 영입 절대 금지)
 * - 코치 연수 선수는 1~2시즌 연수 후 자동으로 faCoaches 시장에 합류
 */
export function assignRetiredPlayerCareerInPlace(
  career: CareerSave,
  player: Player,
  rng: SeededRng
): RetiredPlayerCareerRecord {
  if (!career.retiredCareerTracker) career.retiredCareerTracker = [];
  const existing = career.retiredCareerTracker.find(
    (r) =>
      r.playerId === player.id ||
      (player.permanentId && r.permanentId && r.permanentId === player.permanentId)
  );
  if (existing) return existing;

  const isMajorPlayer =
    player.ability >= 78 ||
    (player.careerHits ?? 0) >= 1200 ||
    (player.careerWins ?? 0) >= 80 ||
    (player.serviceYears ?? 0) >= 12;

  const isHighLeadership =
    player.hiddenTrait === '분위기메이커' ||
    player.hiddenTrait === '멘탈에이스' ||
    player.position === 'C' ||
    (player.clubTenureSeasons ?? 0) >= 10;

  const roll = rng.next();
  let careerPath: RetiredCareerPath = '일반 은퇴';
  if (isMajorPlayer) {
    if (roll < 0.30) careerPath = '프로야구 코치';
    else if (roll < 0.50) careerPath = '코치 연수';
    else if (roll < 0.68) careerPath = '해설위원';
    else if (roll < 0.80) careerPath = '고교·대학 지도자';
    else if (roll < 0.88) careerPath = '스카우트';
    else if (roll < 0.94) careerPath = '야구 아카데미';
    else careerPath = '프런트 직원';
  } else if (isHighLeadership || player.ability >= 68) {
    if (roll < 0.18) careerPath = '프로야구 코치';
    else if (roll < 0.32) careerPath = '코치 연수';
    else if (roll < 0.50) careerPath = '고교·대학 지도자';
    else if (roll < 0.64) careerPath = '스카우트';
    else if (roll < 0.76) careerPath = '프런트 직원';
    else if (roll < 0.88) careerPath = '야구 아카데미';
    else if (roll < 0.94) careerPath = '개인 사업';
    else careerPath = '일반 은퇴';
  } else {
    if (roll < 0.16) careerPath = '고교·대학 지도자';
    else if (roll < 0.30) careerPath = '야구 아카데미';
    else if (roll < 0.44) careerPath = '스카우트';
    else if (roll < 0.56) careerPath = '프런트 직원';
    else if (roll < 0.76) careerPath = '개인 사업';
    else careerPath = '일반 은퇴';
  }

  const coachRole: CoachRole =
    player.role === '투수'
      ? '투수코치'
      : player.position === 'C'
      ? '배터리코치'
      : rng.next() < 0.65
      ? '타격코치'
      : '수비코치';

  const careerSummary =
    player.role === '타자'
      ? `통산 ${player.careerHits ?? 0}안타 ${player.careerHR ?? 0}홈런 (${KBO_TEAMS[player.teamId]?.name ?? player.teamId})`
      : `통산 ${player.careerWins ?? 0}승 ${player.careerSO ?? 0}탈삼진 (${KBO_TEAMS[player.teamId]?.name ?? player.teamId})`;

  let currentAffiliation = '무소속';
  let currentRoleLabel: string = careerPath;
  let coachId: string | undefined;
  let coachTrainingUntilSeason: number | undefined;
  const historyNotes: string[] = [`${career.season}년 현역 은퇴 → ${careerPath} 전향`];

  if (careerPath === '프로야구 코치') {
    const created = createFaCoachFromRetiredPlayerInPlace(career, player, coachRole, rng);
    coachId = created.id;
    currentAffiliation = 'FA 코치 시장 (영입 가능)';
    currentRoleLabel = `프로야구 ${coachRole} (FA)`;
    if (isMajorPlayer) {
      pushLifeNews(career, {
        date: getCurrentCareerDate(career).isoDate,
        category: '이적·계약',
        headline: `[은퇴선수 진로] ${player.name}, 프로야구 ${coachRole} 전향 선언`,
        body: `${KBO_TEAMS[player.teamId].name}에서 현역을 마감한 ${player.name}(${player.age}세)이(가) 지도자 제2막을 선언하고 프로야구 ${coachRole} FA 시장에 합류했습니다.`,
        teamId: player.teamId,
        isHighlight: true,
      });
    }
  } else if (careerPath === '코치 연수') {
    const trainYears = rng.next() < 0.6 ? 1 : 2;
    coachTrainingUntilSeason = career.season + trainYears;
    const dest = rng.pick([
      '미국 MLB 애리조나 코치 연수',
      '일본 NPB 소프트뱅크 2군 코치 연수',
      '미국 드라이브라인 지도자 연수',
      '일본 NPB 오릭스 코치 연수',
    ]);
    currentAffiliation = dest;
    currentRoleLabel = `코치 연수중 (${coachTrainingUntilSeason}년 수료 예정)`;
    historyNotes.push(`${dest} 파견 (${trainYears}년 과정)`);
    if (isMajorPlayer) {
      pushLifeNews(career, {
        date: getCurrentCareerDate(career).isoDate,
        category: '구단사건',
        headline: `[코치 연수] ${player.name}, ${dest} 출국`,
        body: `은퇴한 ${player.name} 선수가 선진 야구 지도자 수업을 위해 ${dest}에 합류했습니다. ${coachTrainingUntilSeason}년 수료 후 KBO 코치 시장에 나설 예정입니다.`,
        teamId: player.teamId,
        isHighlight: false,
      });
    }
  } else if (careerPath === '고교·대학 지도자') {
    const school = rng.pick(['서울고', '덕수고', '광주일고', '경북고', '부산고', '북일고', '연세대', '고려대', '동국대']);
    currentAffiliation = `${school} 야구부`;
    currentRoleLabel = player.role === '투수' ? '투수 인스트럭터/코치' : '타격·수비 코치';
  } else if (careerPath === '스카우트') {
    currentAffiliation = `${KBO_TEAMS[player.teamId]?.name ?? 'KBO'} 스카우트팀`;
    currentRoleLabel = '아마추어 담당 스카우트';
  } else if (careerPath === '프런트 직원') {
    currentAffiliation = `${KBO_TEAMS[player.teamId]?.name ?? 'KBO'} 운영팀`;
    currentRoleLabel = '전력분석·운영 프런트';
  } else if (careerPath === '해설위원') {
    currentAffiliation = rng.pick(['MBC SPORTS+', 'KBS N SPORTS', 'SBS SPORTS', 'SPOTV', 'TVING 야구']);
    currentRoleLabel = 'KBO 프로야구 해설위원';
    if (isMajorPlayer) {
      pushLifeNews(career, {
        date: getCurrentCareerDate(career).isoDate,
        category: '구단사건',
        headline: `[은퇴 근황] ${player.name}, ${currentAffiliation} 야구 해설위원 발탁`,
        body: `현역 시절 ${careerSummary}을(를) 남긴 ${player.name}이(가) ${currentAffiliation} 중계석에서 야구팬들을 만납니다.`,
        teamId: player.teamId,
      });
    }
  } else if (careerPath === '야구 아카데미') {
    currentAffiliation = `${player.name} 베이스볼 아카데미`;
    currentRoleLabel = '유소년·엘리트 야구 아카데미 원장';
  } else if (careerPath === '개인 사업') {
    currentAffiliation = '개인 사업 · 외식/스포츠 브랜드';
    currentRoleLabel = '사업가';
  } else {
    currentAffiliation = '개인 휴식';
    currentRoleLabel = '일반 은퇴';
  }

  const record: RetiredPlayerCareerRecord = {
    id: `ret-career-${player.id}-${career.season}`,
    playerId: player.id,
    permanentId: player.permanentId,
    playerName: player.name,
    age: player.age,
    position: player.position,
    retiredSeason: career.season,
    lastTeamId: player.teamId,
    careerPath,
    currentAffiliation,
    currentRoleLabel,
    coachId,
    coachRole: careerPath === '프로야구 코치' || careerPath === '코치 연수' ? coachRole : undefined,
    coachTrainingUntilSeason,
    isMajorPlayer,
    careerSummary,
    lastUpdatedSeason: career.season,
    historyNotes,
  };

  career.retiredCareerTracker.unshift(record);
  career.retiredCareerTracker = career.retiredCareerTracker.slice(0, 160);
  return record;
}

function createFaCoachFromRetiredPlayerInPlace(
  career: CareerSave,
  player: Player,
  role: CoachRole,
  rng: SeededRng,
  trainingOrigin?: string
): Coach {
  if (!career.faCoaches) career.faCoaches = [];
  // 중복 생성·중복 영입 방지 (이름 + formerPlayerPermanentId 검사)
  const existingCoach = [
    ...career.faCoaches,
    ...Object.values(career.coaches).flat(),
  ].find(
    (c) =>
      (player.permanentId && c.formerPlayerPermanentId === player.permanentId) ||
      (c.name === player.name && c.role === role)
  );
  if (existingCoach) {
    if (trainingOrigin && !existingCoach.coachTrainingOrigin) {
      existingCoach.coachTrainingOrigin = trainingOrigin;
    }
    return existingCoach;
  }

  const baseAbility = Math.max(
    71,
    Math.min(
      89,
      Math.round(68 + (player.ability - 65) * 0.45 + (trainingOrigin ? 4 : 0) + rng.int(0, 5))
    )
  );
  const annual = Number((1.1 + Math.max(0, baseAbility - 72) * 0.09).toFixed(2));
  const coach: Coach = {
    id: `coach-ret-${player.id}-${career.season}`,
    teamId: 'FA',
    role,
    name: player.name,
    ability: baseAbility,
    contractYears: 2,
    annualSalaryBillion: annual,
    signingBonusBillion: 0,
    totalBillion: Number((annual * 2).toFixed(2)),
    confirmed: true,
    isVirtual: false,
    nationality: '한국',
    careerNote: trainingOrigin
      ? `${KBO_TEAMS[player.teamId]?.name ?? player.teamId} 출신 · ${trainingOrigin} 수료`
      : `${KBO_TEAMS[player.teamId]?.name ?? player.teamId} 은퇴 선수 출신 지도자`,
    roleSummary: `현역 경험을 바탕으로 선수단 성장과 실전 대응력을 높이는 ${role}`,
    tacticalStyle: player.role === '투수' ? '투수전·불펜운용' : '밸런스',
    devSpecialty:
      role === '투수코치'
        ? '제구·변화구'
        : role === '타격코치'
        ? '컨택·선구안'
        : role === '배터리코치'
        ? '배터리·프레이밍'
        : '수비·주루',
    tacticalRating: Math.min(92, baseAbility + rng.int(-2, 3)),
    developmentRating: Math.min(93, baseAbility + rng.int(0, 5)),
    subRatings: buildCoachSubRatings(role, baseAbility, `${player.name}-${career.season}`),
    formerPlayerPermanentId: player.permanentId ?? player.id,
    coachTrainingOrigin: trainingOrigin,
  };
  career.faCoaches.unshift(coach);
  return coach;
}

/**
 * 오프시즌 은퇴선수 진로 자동 관리 (#14 & #15 코치 연수 수료)
 * - 코치 연수 수료자 → 자동으로 faCoaches 시장 편입 (+능력 소폭 상승)
 * - AI 구단만 코치 재계약·이적·감독 승격·은퇴 처리 (사용자 구단은 절대 자동 영입하지 않음)
 */
export function processOffseasonRetiredCareersInPlace(career: CareerSave, rng: SeededRng): void {
  const tracker = career.retiredCareerTracker ?? [];
  if (tracker.length === 0) return;

  const today = `${career.season}-01-18`;
  for (const rec of tracker) {
    rec.age += 1;
    rec.lastUpdatedSeason = career.season;

    // 1. 코치 연수 수료 처리 (#15)
    if (
      rec.careerPath === '코치 연수' &&
      rec.coachTrainingUntilSeason &&
      career.season >= rec.coachTrainingUntilSeason
    ) {
      const originPlayer = career.players[rec.playerId];
      const coachRole: CoachRole = rec.coachRole ?? (rec.position === 'C' ? '배터리코치' : '타격코치');
      const syntheticPlayer: Player =
        originPlayer ??
        ({
          id: rec.playerId,
          permanentId: rec.permanentId,
          name: rec.playerName,
          teamId: rec.lastTeamId,
          role: ['SP', 'RP', 'CL'].includes(rec.position) ? '투수' : '타자',
          position: rec.position,
          ability: rec.isMajorPlayer ? 82 : 73,
        } as Player);

      const created = createFaCoachFromRetiredPlayerInPlace(
        career,
        syntheticPlayer,
        coachRole,
        rng,
        rec.currentAffiliation
      );
      rec.careerPath = '프로야구 코치';
      rec.coachId = created.id;
      rec.coachRole = coachRole;
      rec.currentAffiliation = 'FA 코치 시장 (연수 수료)';
      rec.currentRoleLabel = `프로야구 ${coachRole} (FA)`;
      rec.historyNotes.push(`${career.season}년 코치 연수 수료 → 프로야구 ${coachRole} FA 시장 합류`);

      pushLifeNews(career, {
        date: today,
        category: '이적·계약',
        headline: `[코치 연수 수료] ${rec.playerName}, 연수 마치고 KBO ${coachRole} 시장 합류`,
        body: `해외 코치 연수를 성공적으로 마친 ${rec.playerName}이(가) KBO 프로야구 코치 영입 시장에 정식 등록되었습니다.`,
        teamId: rec.lastTeamId,
        isHighlight: Boolean(rec.isMajorPlayer),
      });
      continue;
    }

    // 2. 프로야구 코치 소속 AI 구단 영입 · 감독 승격 · 은퇴 (사용자 구단 제외)
    if (rec.careerPath === '프로야구 코치' && rec.coachId) {
      // 이미 AI 구단에 소속된 경우: 감독 승격 / 고령 은퇴 체크
      let employedTeam: TeamId | null = null;
      let employedCoach: Coach | null = null;
      for (const tid of TEAM_IDS) {
        const found = (career.coaches[tid] ?? []).find((c) => c.id === rec.coachId);
        if (found) {
          employedTeam = tid;
          employedCoach = found;
          break;
        }
      }

      if (employedTeam && employedCoach) {
        rec.currentAffiliation = KBO_TEAMS[employedTeam].name;
        rec.currentRoleLabel = `${employedCoach.role}${employedCoach.isActingManager ? ' (감독대행)' : ''}`;

        // 고령 은퇴 (66세 이상)
        if (rec.age >= 66 && employedTeam !== career.playerTeamId) {
          career.coaches[employedTeam] = career.coaches[employedTeam].filter(
            (c) => c.id !== employedCoach!.id
          );
          rec.careerPath = '일반 은퇴';
          rec.currentAffiliation = '지도자 은퇴';
          rec.currentRoleLabel = '원로 야구인';
          rec.historyNotes.push(`${career.season}년 프로야구 지도자 은퇴`);
          continue;
        }

        // AI 구단 한정: 유명 출신 코치 → 감독 승격 이벤트 (낮은 확률, 사용자 구단 제외)
        if (
          employedTeam !== career.playerTeamId &&
          employedCoach.role !== '감독' &&
          rec.isMajorPlayer &&
          rec.age >= 40 &&
          rng.next() < 0.08
        ) {
          const targetAiTeam = rng.pick(TEAM_IDS.filter((t) => t !== career.playerTeamId));
          const oldMgr = (career.coaches[targetAiTeam] ?? []).find((c) => c.role === '감독');
          if (!oldMgr || oldMgr.ability < employedCoach.ability + 2) {
            // 기존 소속에서 제거 후 타 AI 구단 감독 부임
            career.coaches[employedTeam] = career.coaches[employedTeam].filter(
              (c) => c.id !== employedCoach!.id
            );
            career.coaches[targetAiTeam] = (career.coaches[targetAiTeam] ?? []).filter(
              (c) => c.role !== '감독'
            );
            employedCoach.teamId = targetAiTeam;
            employedCoach.role = '감독';
            employedCoach.isActingManager = false;
            employedCoach.ability = Math.min(92, employedCoach.ability + 3);
            employedCoach.subRatings = buildCoachSubRatings('감독', employedCoach.ability, `${employedCoach.name}-${career.season}`);
            career.coaches[targetAiTeam].unshift(employedCoach);

            rec.coachRole = '감독';
            rec.currentAffiliation = KBO_TEAMS[targetAiTeam].name;
            rec.currentRoleLabel = '1군 감독';
            rec.historyNotes.push(`${career.season}년 ${KBO_TEAMS[targetAiTeam].name} 제1군 감독 선임`);

            pushLifeNews(career, {
              date: today,
              category: '타구단소식',
              headline: `[감독 선임] ${KBO_TEAMS[targetAiTeam].name}, 은퇴 스타 출신 ${rec.playerName} 신임 감독 선임`,
              body: `${KBO_TEAMS[targetAiTeam].name}이(가) 코치 경력을 쌓아온 ${rec.playerName}을(를) 새 사령탑으로 전격 선임했습니다.`,
              teamId: targetAiTeam,
              isHighlight: true,
            });
          }
        }
      } else {
        // FA 시장 대기중인 은퇴 코치 → AI 구단 결원 또는 업그레이드 시 자동 영입 (사용자 구단 제외)
        const faCoach = (career.faCoaches ?? []).find((c) => c.id === rec.coachId);
        if (faCoach && rng.next() < 0.35) {
          const aiTeams = TEAM_IDS.filter((t) => t !== career.playerTeamId);
          const candidateTeam = aiTeams.find((tid) => {
            const existingRole = (career.coaches[tid] ?? []).find((c) => c.role === faCoach.role);
            return !existingRole || existingRole.ability + 2 < faCoach.ability;
          });
          if (candidateTeam) {
            career.faCoaches = (career.faCoaches ?? []).filter((c) => c.id !== faCoach.id);
            const replaced = (career.coaches[candidateTeam] ?? []).find(
              (c) => c.role === faCoach.role
            );
            career.coaches[candidateTeam] = (career.coaches[candidateTeam] ?? []).filter(
              (c) => c.role !== faCoach.role
            );
            if (replaced) {
              replaced.teamId = 'FA';
              career.faCoaches.push(replaced);
            }
            faCoach.teamId = candidateTeam;
            career.coaches[candidateTeam].push(faCoach);
            rec.currentAffiliation = KBO_TEAMS[candidateTeam].name;
            rec.currentRoleLabel = `프로야구 ${faCoach.role}`;
            rec.historyNotes.push(`${career.season}년 ${KBO_TEAMS[candidateTeam].name} ${faCoach.role} 부임`);
            if (rec.isMajorPlayer) {
              pushLifeNews(career, {
                date: today,
                category: '타구단소식',
                headline: `[코치 영입] ${KBO_TEAMS[candidateTeam].name}, ${rec.playerName} ${faCoach.role} 영입`,
                body: `${KBO_TEAMS[candidateTeam].name}이(가) 현역 은퇴 후 지도자로 변신한 ${rec.playerName}을(를) ${faCoach.role}로 선임했습니다.`,
                teamId: candidateTeam,
              });
            }
          }
        }
      }
    }
  }
}

/**
 * 임시 주장 자동 선임 및 복귀 시 자동 해제 (#15)
 */
export function syncActingCaptainInPlace(
  career: CareerSave,
  teamId: TeamId,
  emitNews = true
): void {
  const team = career.teams[teamId];
  if (!team?.leadership) return;
  const lead = team.leadership;
  const captain = lead.captainPlayerId ? career.players[lead.captainPlayerId] : null;

  const isUnavailable = (p: Player | null | undefined): string | null => {
    if (!p || p.teamId !== teamId) return '소속 변경/이탈';
    if (p.injury && p.injury.daysRemaining > 0) return `부상 이탈 (${p.injury.description})`;
    if (isMilitaryServing(p.militaryStatus)) return '상무 군복무';
    if (p.nationalTeamDuty) return `국가대표 차출 (${p.nationalTeamDuty.tournamentName})`;
    if (p.rosterTier !== '1군') return `1군 엔트리 말소 (${p.rosterTier})`;
    return null;
  };

  const unavailReason = captain ? isUnavailable(captain) : null;
  if (!captain || !unavailReason) {
    // 공식 주장 복귀 완료 -> 임시 주장 해제
    if (lead.actingCaptainPlayerId) {
      const prevActing = career.players[lead.actingCaptainPlayerId];
      lead.actingCaptainPlayerId = null;
      lead.actingCaptainReason = undefined;
      if (emitNews && teamId === career.playerTeamId && captain && prevActing) {
        pushLifeNews(career, {
          date: getCurrentCareerDate(career).isoDate,
          category: '구단사건',
          headline: `[주장 복귀] ${KBO_TEAMS[teamId].name} 주장 ${captain.name} 복귀 · ${prevActing.name} 임시 주장 임무 종료`,
          body: `공식 주장 ${captain.name}이(가) 1군에 정상 복귀하면서 ${prevActing.name}의 임시 주장 체제가 마무리되었습니다.`,
          teamId,
        });
      }
    }
    return;
  }

  // 이미 유효한 임시 주장이 있으면 유지
  const currentActing = lead.actingCaptainPlayerId ? career.players[lead.actingCaptainPlayerId] : null;
  if (currentActing && !isUnavailable(currentActing) && currentActing.id !== captain.id) {
    lead.actingCaptainReason = unavailReason;
    return;
  }

  // 1군 베테랑·핵심 선수 중 임시 주장 선임
  const candidates = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === teamId &&
        p.id !== captain.id &&
        p.rosterTier === '1군' &&
        p.category === '국내' &&
        !p.injury &&
        !p.nationalTeamDuty &&
        !isMilitaryServing(p.militaryStatus)
    )
    .sort(
      (a, b) =>
        (b.age * 1.4 + b.ability * 0.7 + (b.clubTenureSeasons ?? 0) * 1.8) -
        (a.age * 1.4 + a.ability * 0.7 + (a.clubTenureSeasons ?? 0) * 1.8)
    );

  const chosen = candidates[0];
  if (chosen) {
    lead.actingCaptainPlayerId = chosen.id;
    lead.actingCaptainReason = unavailReason;
    if (emitNews && teamId === career.playerTeamId) {
      pushLifeNews(career, {
        date: getCurrentCareerDate(career).isoDate,
        category: '구단사건',
        headline: `[임시 주장 선임] ${KBO_TEAMS[teamId].name}, ${captain.name} 이탈로 ${chosen.name} 임시 주장 선임`,
        body: `공식 주장 ${captain.name}이(가) ${unavailReason}으로 자리를 비우게 되어 베테랑 ${chosen.name}이(가) 임시 주장을 맡아 선수단을 이끕니다.`,
        teamId,
      });
    }
  }
}

/**
 * 시즌 중 감독 경질 시 기존 코치를 감독대행으로 승격 (#15)
 */
export function appointActingManagerInPlace(
  career: CareerSave,
  teamId: TeamId,
  firedManagerName: string,
  reason: string
): Coach {
  const teamCoaches = career.coaches[teamId] ?? [];
  // 수석코치가 있으면 최우선으로 감독 대행 승격 (10개 구단 동일 규칙)
  const benchCoach = teamCoaches.find((c) => c.role === '수석코치');
  const seniorCoach =
    benchCoach ??
    [...teamCoaches]
      .filter((c) => c.role !== '감독')
      .sort((a, b) => b.ability - a.ability)[0];

  const remaining = teamCoaches.filter((c) => c.role !== '감독' && c.id !== seniorCoach?.id);

  const actingAbility = seniorCoach ? Math.max(70, seniorCoach.ability - 1) : 73;
  const actingMgr: Coach = seniorCoach
    ? {
        ...seniorCoach,
        role: '감독',
        isActingManager: true,
        ability: actingAbility,
        careerNote: `${seniorCoach.role}에서 감독대행 승격 (${reason})`,
        roleSummary: `${firedManagerName} 감독 경질 후 팀을 수습하는 감독대행`,
        subRatings: buildCoachSubRatings('감독', actingAbility, `${seniorCoach.name}-${career.season}`),
      }
    : {
        id: `acting-mgr-${teamId}-${career.season}`,
        teamId,
        role: '감독',
        name: `${KBO_TEAMS[teamId].shortName} 수석코치`,
        ability: 73,
        contractYears: 1,
        annualSalaryBillion: 2.0,
        signingBonusBillion: 0,
        totalBillion: 2.0,
        confirmed: true,
        isActingManager: true,
        careerNote: '시즌 중 감독대행 체제',
        subRatings: buildCoachSubRatings('감독', 73, `${teamId}-acting-${career.season}`),
      };

  career.coaches[teamId] = [actingMgr, ...remaining];
  return actingMgr;
}

/**
 * 한국시리즈 우승 보상 및 포스트시즌 모기업 특별 보너스 정산 (#18)
 * - 전 구단 동일 규칙 적용
 * - 동일 시즌 중복 지급 엄격 차단 (championshipRewardSettledSeasons)
 * - 샐러리캡 및 로스터 정원 규정 준수
 */
export function applyKoreanSeriesChampionshipRewardsInPlace(
  career: CareerSave,
  championTeamId: TeamId,
  runnerUpTeamId: TeamId,
  date: string
): ChampionshipRewardRecord | null {
  if (!career.championshipRewardSettledSeasons) career.championshipRewardSettledSeasons = [];
  if (!career.championshipRewardsLog) career.championshipRewardsLog = [];

  // 동일 시즌 중복 지급 방지
  if (career.championshipRewardSettledSeasons.includes(career.season)) {
    return (
      career.championshipRewardsLog.find((r) => r.season === career.season) ?? null
    );
  }
  career.championshipRewardSettledSeasons.push(career.season);

  const seeds = career.postseason.standingsSeed ?? [];
  const bonusTable: {
    teamId: TeamId;
    finishLabel: ChampionshipRewardRecord['postseasonRewards'][number]['finishLabel'];
    parentCompanyBonusBillion: number;
  }[] = [];

  const assigned = new Set<TeamId>();
  bonusTable.push({
    teamId: championTeamId,
    finishLabel: '한국시리즈 우승',
    parentCompanyBonusBillion: 25.0,
  });
  assigned.add(championTeamId);

  if (runnerUpTeamId && !assigned.has(runnerUpTeamId)) {
    bonusTable.push({
      teamId: runnerUpTeamId,
      finishLabel: '한국시리즈 준우승',
      parentCompanyBonusBillion: 12.0,
    });
    assigned.add(runnerUpTeamId);
  }

  // 나머지 가을야구 진출팀 차등 보너스 (PO 6억, 준PO 3억, WC 1.5억)
  const remainingSeeds = seeds.filter((tid) => !assigned.has(tid));
  const tierDefs: {
    label: ChampionshipRewardRecord['postseasonRewards'][number]['finishLabel'];
    bonus: number;
  }[] = [
    { label: '플레이오프 진출', bonus: 6.0 },
    { label: '준플레이오프 진출', bonus: 3.0 },
    { label: '와일드카드 진출', bonus: 1.5 },
  ];
  remainingSeeds.forEach((tid, idx) => {
    const def = tierDefs[Math.min(idx, tierDefs.length - 1)];
    bonusTable.push({
      teamId: tid,
      finishLabel: def.label,
      parentCompanyBonusBillion: def.bonus,
    });
  });

  // 특수 우승 업적 판정 (연속 우승, 창단 첫 우승, 장기간 무관 탈출)
  const specialAchievements: string[] = [];
  const baseInfo = CLUB_CHAMPIONSHIP_BASELINE_2025[championTeamId];
  const prevChampion = getDefendingChampionTeamId(career);
  const totalTitlesNow = getClubTitleCount(career, championTeamId);

  if (prevChampion === championTeamId) {
    specialAchievements.push(`한국시리즈 연속 우승 (V${totalTitlesNow} 왕조 구축)`);
  }
  if (totalTitlesNow === 1 && baseInfo.titlesBefore2026 === 0) {
    specialAchievements.push(`${KBO_TEAMS[championTeamId].name} 창단 첫 한국시리즈 우승 달성!`);
  } else {
    // 직전 우승 연도 계산
    const prevTitles = (career.championHistory ?? [])
      .filter((c) => c.championTeamId === championTeamId && c.season < career.season)
      .map((c) => c.season);
    const lastYear = prevTitles.length > 0 ? Math.max(...prevTitles) : baseInfo.lastTitleYear;
    if (lastYear !== null && career.season - lastYear >= 10) {
      specialAchievements.push(
        `${career.season - lastYear}년 만의 장기 무관 탈출 (${lastYear}년 이후 감격의 V${totalTitlesNow})`
      );
    }
  }

  // 우승 구단 차기 시즌 운영 예산 +10% 보너스
  const championTeam = career.teams[championTeamId];
  if (championTeam) {
    championTeam.championshipBudgetBoostPct = 10;
    championTeam.popularity = Math.min(100, (championTeam.popularity ?? 80) + 8);
    championTeam.fanSentiment = Math.min(100, (championTeam.fanSentiment ?? 75) + 14);
    championTeam.clubReputation = Math.min(100, (championTeam.clubReputation ?? 75) + 10);
    championTeam.atmosphere = '좋음';
  }

  // 우승 구단 핵심 선수단 사기 상승 + 차기 시즌 연봉 요구 소폭 상승 (+6~10%)
  const champPlayers = Object.values(career.players).filter(
    (p) => p.teamId === championTeamId && p.rosterTier === '1군'
  );
  for (const p of champPlayers) {
    p.morale = '만족';
    if (p.category === '국내' && p.ability >= 76 && p.contract.currency === 'KRW') {
      const baseSal = p.demandedSalaryBillion ?? p.contract.annualSalary;
      if (baseSal > 0) {
        p.demandedSalaryBillion = Number((baseSal * 1.07).toFixed(2));
      }
    }
  }

  // 사용자 구단이 포스트시즌 보너스 수혜 시 현금/구단주 신뢰도/예산 즉시 반영
  const playerReward = bonusTable.find((b) => b.teamId === career.playerTeamId);
  if (playerReward) {
    if (career.finances.cashBalanceBillion !== null) {
      career.finances.cashBalanceBillion = Number(
        (career.finances.cashBalanceBillion + playerReward.parentCompanyBonusBillion).toFixed(2)
      );
    }
    career.finances.seasonRevenueBillion = Number(
      (career.finances.seasonRevenueBillion + playerReward.parentCompanyBonusBillion).toFixed(2)
    );
    if (playerReward.teamId === championTeamId) {
      if (career.finances.ownerBudgetCapBillion) {
        career.finances.ownerBudgetCapBillion = Number(
          (career.finances.ownerBudgetCapBillion * 1.1).toFixed(1)
        );
      }
      if (career.ownerEval) {
        career.ownerEval.ownerTrust = Math.min(100, (career.ownerEval.ownerTrust ?? 70) + 18);
      }
      // 타 구단의 우승 구단 코칭스태프 영입 시도 이벤트 추가 (#18)
      const userCoaches = (career.coaches[championTeamId] ?? []).filter((c) => c.role !== '감독');
      const topCoach = [...userCoaches].sort((a, b) => b.ability - a.ability)[0];
      if (topCoach) {
        if (!career.staffPoachingOffers) career.staffPoachingOffers = [];
        const rivalTeam = TEAM_IDS.find((t) => t !== championTeamId) ?? 'LG';
        career.staffPoachingOffers.unshift({
          id: `poach-champ-${career.season}-${topCoach.id}`,
          date,
          staffType: '코치',
          staffId: topCoach.id,
          staffName: topCoach.name,
          currentRole: topCoach.role,
          poachingTeamId: rivalTeam,
          offeredPosition: '수석코치 / 차기 감독 후보',
          retainCostBillion: Number(Math.max(1.2, topCoach.annualSalaryBillion * 0.55).toFixed(2)),
        });
      }
    }
    career.transactionLogs.unshift({
      id: `tx-ps-bonus-${career.season}-${career.playerTeamId}`,
      date,
      type: '재정',
      teamId: career.playerTeamId,
      summary: `${playerReward.finishLabel} 모기업 특별 보너스 +${playerReward.parentCompanyBonusBillion.toFixed(1)}억 원 지급`,
      detail:
        playerReward.teamId === championTeamId
          ? '우승 보너스 · 우승 반지 수여식 · 차기 시즌 운영 예산 +10% 확정 (샐러리캡·로스터 규정 정상 적용)'
          : '포스트시즌 성적 차등 특별 포상금',
    });
  }

  const ringCeremonyHeadline = `${career.season} ${KBO_TEAMS[championTeamId].name} 한국시리즈 V${totalTitlesNow} 우승 반지 수여식 & 모기업 특별 포상`;

  const record: ChampionshipRewardRecord = {
    season: career.season,
    championTeamId,
    runnerUpTeamId,
    postseasonRewards: bonusTable,
    championBudgetBoostPct: 10,
    specialAchievements,
    ringCeremonyHeadline,
    settledDate: date,
  };

  career.championshipRewardsLog.unshift(record);

  pushLifeNews(career, {
    date,
    category: '수상·이달의선수',
    headline: `[우승 혜택] ${KBO_TEAMS[championTeamId].name}, 모기업 특별 보너스 25억·차기 예산 10% 증액 확정`,
    body: `${ringCeremonyHeadline}. ${
      specialAchievements.length > 0 ? specialAchievements.join(' · ') + ' ' : ''
    }우승 효과로 구단 평판·팬 충성도·FA 선호도가 상승했으며, 타 구단의 코칭스태프 영입 관심도 높아지고 있습니다.`,
    teamId: championTeamId,
    isHighlight: true,
  });

  return record;
}

/**
 * 매년 새 시즌 개막 전 10개 구단 신규 유니폼 발표 (#17)
 */
export function unveilAnnualClubUniformsInPlace(career: CareerSave): void {
  const season = career.season;
  for (const tid of TEAM_IDS) {
    const team = career.teams[tid];
    if (!team) continue;
    if (team.currentUniform?.season === season) continue;
    const info = KBO_TEAMS[tid];
    const edition = buildAnnualClubUniform(
      tid,
      season,
      info.primaryColor,
      info.secondaryColor,
      info.accentColor
    );
    team.currentUniform = edition;
    team.uniformHistory = [edition, ...(team.uniformHistory ?? [])].slice(0, 10);
  }

  const myUniform = career.teams[career.playerTeamId]?.currentUniform;
  if (myUniform) {
    pushLifeNews(career, {
      date: `${season}-02-15`,
      category: '구단사건',
      headline: `[신규 유니폼] ${KBO_TEAMS[career.playerTeamId].name}, '${myUniform.editionName}' 공개`,
      body: `KBO 10개 구단이 ${season} 시즌 신규 유니폼을 일제히 발표했습니다. ${KBO_TEAMS[career.playerTeamId].name}의 새 에디션(홈: ${myUniform.homeTheme} / 원정: ${myUniform.awayTheme})은 팬들의 호응 속에 시즌 상품 매출 +${myUniform.merchBoostPct}% 효과가 기대됩니다.`,
      teamId: career.playerTeamId,
    });
  }
}

/**
 * 매년 고교 최대어 · 대학 최대어 선정 및 신인 드래프트 현장 초청 명단 발표 (#21)
 */
export function selectAnnualTopAmateurProspectsInPlace(
  career: CareerSave,
  emitNews = true
): AnnualTopAmateurRecord | null {
  const ao = career.amateurAndOverseas;
  if (!ao) return null;
  const season = career.season;
  if (!ao.annualTopProspects) ao.annualTopProspects = [];

  const eligible = ao.prospects.filter(
    (p) =>
      p.careerPath !== '해외프로계약' &&
      p.careerPath !== '은퇴' &&
      !p.draftedToTeamId &&
      (p.draftEligibleSeason <= season || p.isEarlyDraftEligible)
  );

  const rankScore = (p: (typeof eligible)[number]) =>
    p.potential * 0.62 +
    p.ability * 0.38 +
    (p.fastballKmh ? Math.max(0, p.fastballKmh - 144) * 0.45 : 0);

  const hsSorted = eligible.filter((p) => p.schoolType === '고교').sort((a, b) => rankScore(b) - rankScore(a));
  const uniSorted = eligible.filter((p) => p.schoolType === '대학').sort((a, b) => rankScore(b) - rankScore(a));
  const allSorted = [...eligible].sort((a, b) => rankScore(b) - rankScore(a));

  const topHs = hsSorted[0] ?? null;
  const topUni = uniSorted[0] ?? null;
  const invitees = allSorted.slice(0, 14);

  const record: AnnualTopAmateurRecord = {
    season,
    topHighSchool: topHs
      ? {
          permanentId: topHs.permanentId,
          name: topHs.name,
          schoolName: topHs.schoolName,
          position: topHs.position,
          ability: topHs.ability,
          potential: topHs.potential,
          summary:
            topHs.role === '투수'
              ? `최고 ${topHs.fastballKmh ?? 151}km/h · 잠재력 ${topHs.potential}`
              : `장타 ${topHs.batPowerGrade ?? 80} · 컨택 ${topHs.batContactGrade ?? 80}`,
        }
      : null,
    topCollege: topUni
      ? {
          permanentId: topUni.permanentId,
          name: topUni.name,
          schoolName: topUni.schoolName,
          position: topUni.position,
          ability: topUni.ability,
          potential: topUni.potential,
          summary:
            topUni.role === '투수'
              ? `최고 ${topUni.fastballKmh ?? 149}km/h · 즉시전력감 ${topUni.ability}`
              : `타격 완성도 ${topUni.ability} · 잠재력 ${topUni.potential}`,
        }
      : null,
    draftInviteePermanentIds: invitees.map((p) => p.permanentId),
    draftInvitees: invitees.map((p, idx) => ({
      permanentId: p.permanentId,
      name: p.name,
      schoolName: p.schoolName,
      schoolType: p.schoolType,
      position: p.position,
      projectedRank: idx + 1,
    })),
  };

  ao.annualTopProspects = [
    record,
    ...ao.annualTopProspects.filter((r) => r.season !== season),
  ].slice(0, 15);

  if (emitNews && (topHs || topUni)) {
    pushLifeNews(career, {
      date: getCurrentCareerDate(career).isoDate,
      category: '수상·이달의선수',
      headline: `[드래프트 특집] ${season} 고교 최대어 ${topHs?.name ?? '-'}(${topHs?.schoolName ?? ''}) · 대학 최대어 ${topUni?.name ?? '-'}(${topUni?.schoolName ?? ''}) 선정`,
      body: `KBO 스카우트 리포트 선정 ${season} 드래프트 최대어와 함께 상위 유망주 ${invitees.length}명이 신인 드래프트 행사장 공식 초청 명단에 이름을 올렸습니다.`,
      isHighlight: true,
    });
  }

  return record;
}

/**
 * 드래프트 완료 시 매년 신인 계약금 TOP 10 순위 발표 (#8)
 */
export function recordRookieSigningBonusTop10InPlace(career: CareerSave): RookieBonusRankEntry[] {
  const ds = career.draftState;
  if (!ds || ds.picks.length === 0) return [];
  if (!career.rookieBonusRankingsBySeason) career.rookieBonusRankingsBySeason = {};

  const top10: RookieBonusRankEntry[] = [...ds.picks]
    .sort((a, b) => b.signingBonusBillion - a.signingBonusBillion || a.round - b.round || a.pickInRound - b.pickInRound)
    .slice(0, 10)
    .map((pk, idx) => {
      const cand = ds.candidates.find((c) => c.id === pk.candidateId);
      return {
        rank: idx + 1,
        season: ds.season,
        playerName: pk.playerName,
        teamId: pk.teamId,
        pickNotation: pk.pickNotation,
        position: pk.position,
        school: cand?.school ?? '아마추어',
        signingBonusBillion: pk.signingBonusBillion,
        ability: pk.ability,
        potential: pk.potential,
      };
    });

  career.rookieBonusRankingsBySeason[ds.season] = top10;

  if (top10[0]) {
    pushLifeNews(career, {
      date: getCurrentCareerDate(career).isoDate,
      category: '이적·계약',
      headline: `[신인 계약금 TOP 10] ${ds.season} 신인 계약금 1위 ${top10[0].playerName}(${top10[0].teamId}) ${top10[0].signingBonusBillion.toFixed(1)}억 원`,
      body: `${ds.season} KBO 신인 드래프트 계약금 순위 TOP 10이 발표되었습니다. 1위 ${top10[0].playerName}(${top10[0].school} → ${top10[0].teamId}, ${top10[0].signingBonusBillion.toFixed(1)}억 원)을 비롯해 1라운드 유망주들이 대형 계약을 맺었습니다.`,
      teamId: top10[0].teamId,
      isHighlight: true,
    });
  }
  return top10;
}

/**
 * 해외파 국내 복귀설 뉴스 자동 생성 (#16)
 * - 계약 만료 임박(잔여 1년 이하) 또는 방출대기 해외파 선수 대상
 */
export function generateOverseasReturnRumorsInPlace(career: CareerSave): void {
  const ao = career.amateurAndOverseas;
  if (!ao) return;
  const season = career.season;
  const date = getCurrentCareerDate(career).isoDate;

  for (const op of ao.overseasPlayers) {
    if (op.status === '은퇴' || op.status === 'KBO복귀완료') continue;
    if (op.returnRumorPublishedSeason === season) continue;

    const isContractExpiring = op.contractYearsRemaining <= 1 || op.status === '방출대기';
    if (!isContractExpiring) continue;

    op.returnRumorPublishedSeason = season;
    const origNote = op.originalKboTeamId
      ? `KBO 복귀 시 원소속팀 ${KBO_TEAMS[op.originalKboTeamId].name}이(가) 우선 협상권을 보유합니다.`
      : '고교 졸업 후 해외 직행 케이스로 KBO 신인 드래프트를 통해 국내 무대에 합류할 수 있습니다.';

    pushLifeNews(career, {
      date,
      category: 'MLB소식',
      headline: `[해외파 복귀설] ${op.clubName} ${op.name}, 계약 만료 임박 속 KBO 국내 복귀 가능성 대두`,
      body: `${op.league} ${op.clubName} 소속 ${op.name}(${op.age}세 · ${op.position})이(가) ${
        op.status === '방출대기' ? '방출·FA 신분 전환' : '계약 마지막 시즌'
      }을 맞아 국내 복귀설이 제기되고 있습니다. ${origNote}`,
      teamId: op.originalKboTeamId ?? undefined,
      isHighlight: op.ability >= 80,
    });
    break; // 한 시점에 과도한 스팸 방지 (월/이벤트당 최대 1건)
  }
}

// =============================================================================
// 17. 은퇴 예정 선수 알림 · FA/계약 만료 알림 · 8단계 간소화 오프시즌 워크플로우
// =============================================================================

export interface RetirementRiskAlert {
  player: Player;
  level: '은퇴 유력' | '은퇴 검토';
  probabilityPct: number;
  reason: string;
}

/**
 * 개별 선수의 시즌 종료 후 은퇴 가능성 평가 (advanceToNextSeason 은퇴 로직과 일관성 유지)
 */
export function getPlayerRetirementAlert(p: Player): RetirementRiskAlert | null {
  if (
    p.rosterTier === '은퇴' ||
    p.rosterTier === '해외이적' ||
    p.rosterTier === 'FA' ||
    isMilitaryServing(p.militaryStatus)
  ) {
    return null;
  }

  // 외국인·아시아쿼터는 계약 만료/재계약 여부로 관리하므로 은퇴 예정은 국내 베테랑 및 40세 이상 기준
  const isForeign = p.category !== '국내';
  if (isForeign && p.age < 39) return null;

  if (p.age >= 41) {
    return {
      player: p,
      level: '은퇴 유력',
      probabilityPct: 88,
      reason: `만 ${p.age}세 최고참 베테랑 · 시즌 후 현역 은퇴 가능성 매우 높음`,
    };
  }
  if (p.age >= 40) {
    return {
      player: p,
      level: '은퇴 유력',
      probabilityPct: p.ability <= 76 ? 82 : 68,
      reason: `만 ${p.age}세 · 고령 진입으로 은퇴식 및 후계자 준비 권장`,
    };
  }
  if (p.age >= 38 && p.ability <= 77) {
    return {
      player: p,
      level: '은퇴 유력',
      probabilityPct: p.ability <= 72 ? 72 : 55,
      reason: `만 ${p.age}세 · OVR ${p.ability} 노쇠화 구간 진입`,
    };
  }
  if (p.age >= 38) {
    return {
      player: p,
      level: '은퇴 검토',
      probabilityPct: 38,
      reason: `만 ${p.age}세 베테랑 · 시즌 종료 후 현역 연장 여부 검토 대상`,
    };
  }
  if (p.age >= 36 && p.ability <= 74) {
    return {
      player: p,
      level: '은퇴 검토',
      probabilityPct: p.ability <= 68 ? 48 : 34,
      reason: `만 ${p.age}세 · OVR ${p.ability} 기량 저하로 은퇴 고민 가능`,
    };
  }
  if (p.age >= 35 && p.ability <= 65) {
    return {
      player: p,
      level: '은퇴 검토',
      probabilityPct: 30,
      reason: `만 ${p.age}세 · 1군 경쟁력 저하로 은퇴 또는 방출 검토 구간`,
    };
  }
  return null;
}

/**
 * 구단(또는 전체 리그) 내 은퇴 가능성이 높은 선수 알림 목록
 */
export function getRetirementCandidateAlerts(
  career: CareerSave,
  teamId?: TeamId
): RetirementRiskAlert[] {
  const targetTeam = teamId ?? career.playerTeamId;
  const alerts: RetirementRiskAlert[] = [];
  for (const p of Object.values(career.players)) {
    if (p.teamId !== targetTeam) continue;
    const alert = getPlayerRetirementAlert(p);
    if (alert) alerts.push(alert);
  }
  return alerts.sort((a, b) => b.probabilityPct - a.probabilityPct || b.player.age - a.player.age);
}

export type ContractExpiryKind = 'FA 자격 만료' | '외국인 계약 만료' | '연봉 재계약 예정';

export interface ContractExpiryAlert {
  player: Player;
  kind: ContractExpiryKind;
  faGrade: 'A' | 'B' | 'C' | null;
  endSeason: number;
  yearsRemaining: number;
  annualSalaryLabel: string;
  note: string;
}

function estimateSimpleFaGrade(p: Player): 'A' | 'B' | 'C' {
  if (p.contract.faGrade) return p.contract.faGrade;
  if (p.age >= 35) return 'C';
  if (p.ability >= 82 || p.contract.annualSalary >= 7.0) return 'A';
  if (p.ability >= 75 || p.contract.annualSalary >= 3.0) return 'B';
  return 'C';
}

/**
 * 개별 선수의 계약 만료 및 FA 취득 임박 여부 판별
 */
export function getPlayerContractExpiryAlert(
  career: CareerSave,
  p: Player
): ContractExpiryAlert | null {
  if (
    p.rosterTier === '은퇴' ||
    p.rosterTier === '해외이적' ||
    p.rosterTier === 'FA' ||
    p.rosterTier === '육성' ||
    isMilitaryServing(p.militaryStatus)
  ) {
    return null;
  }

  const endSeason = p.contract.endSeason ?? career.season + Math.max(0, (p.contract.yearsRemaining ?? 1) - 1);
  const yearsRem = p.contract.yearsRemaining ?? Math.max(0, endSeason - career.season + 1);
  const isExpiring =
    p.contract.status === '만료' ||
    yearsRem <= 1 ||
    endSeason <= career.season;

  if (!isExpiring) return null;

  const isForeign = p.category !== '국내';
  const annualSalaryLabel =
    p.contract.currency === 'USD'
      ? `$${Math.round(p.contract.annualSalary).toLocaleString()}`
      : `${p.contract.annualSalary.toFixed(2)}억 원`;

  if (isForeign) {
    return {
      player: p,
      kind: '외국인 계약 만료',
      faGrade: null,
      endSeason,
      yearsRemaining: yearsRem,
      annualSalaryLabel,
      note:
        p.contract.status === '만료'
          ? `${p.category} 계약 만료 · 재계약 또는 신규 교체 결정 필요`
          : `${career.season}시즌 종료 후 ${p.category} 계약 만료 예정`,
    };
  }

  const isFaQualified =
    p.contract.isFAEligible === true ||
    (p.serviceYears ?? 0) >= 8 ||
    (p.contract.faGrade !== undefined && p.contract.faGrade !== null);

  if (isFaQualified) {
    const faGrade = estimateSimpleFaGrade(p);
    return {
      player: p,
      kind: 'FA 자격 만료',
      faGrade,
      endSeason,
      yearsRemaining: yearsRem,
      annualSalaryLabel,
      note:
        p.contract.status === '만료'
          ? `FA ${faGrade}등급 계약 만료 · 잔류 협상 미체결 시 타 구단 이적 가능`
          : `${career.season}시즌 종료 후 FA ${faGrade}등급 자격 취득 · 다년 연장 협상 권장`,
    };
  }

  // 일반 연봉 재계약 대상은 주전/1군 핵심(OVR 72 이상 또는 연봉 1억 이상) 위주로 알림 노이즈 제어
  if (p.rosterTier === '1군' || p.ability >= 72 || p.contract.annualSalary >= 1.0) {
    return {
      player: p,
      kind: '연봉 재계약 예정',
      faGrade: null,
      endSeason,
      yearsRemaining: yearsRem,
      annualSalaryLabel,
      note: `${career.season}시즌 후 연봉 협상 대상 (${p.rosterTier})`,
    };
  }

  return null;
}

/**
 * 구단 내 계약 만료(FA · 외국인 · 연봉 협상) 자동 알림 목록
 */
export function getContractExpiryAlerts(
  career: CareerSave,
  teamId?: TeamId
): ContractExpiryAlert[] {
  const targetTeam = teamId ?? career.playerTeamId;
  const alerts: ContractExpiryAlert[] = [];
  for (const p of Object.values(career.players)) {
    if (p.teamId !== targetTeam) continue;
    const alert = getPlayerContractExpiryAlert(career, p);
    if (alert) alerts.push(alert);
  }
  const priority: Record<ContractExpiryKind, number> = {
    'FA 자격 만료': 0,
    '외국인 계약 만료': 1,
    '연봉 재계약 예정': 2,
  };
  return alerts.sort(
    (a, b) =>
      priority[a.kind] - priority[b.kind] ||
      b.player.ability - a.player.ability ||
      b.player.contract.annualSalary - a.player.contract.annualSalary
  );
}

// -----------------------------------------------------------------------------
// 8단계 간소화 오프시즌 워크플로우 (기존 세이브·12단계 호환 유지)
// -----------------------------------------------------------------------------

export interface Offseason8StepMeta {
  id: OffseasonStep8;
  order: number;
  title: string;
  shortTitle: string;
  description: string;
  isRequired: boolean;
  requiredSummary: string;
  mappedStep12: OffseasonStep12;
  mappedStep4: OffseasonStep;
}

export const OFFSEASON_8_STEPS: Offseason8StepMeta[] = [
  {
    id: 'SETTLEMENT',
    order: 1,
    title: '시즌 결산',
    shortTitle: '시즌 결산',
    description: '팀 순위, 주요 선수 성적, 수익·지출 및 경쟁균형세(샐러리캡)를 최종 확인합니다.',
    isRequired: true,
    requiredSummary: '최종 성적·재정 결산 확인',
    mappedStep12: 'FINAL_SETTLEMENT',
    mappedStep4: 'AWARDS_AND_EVAL',
  },
  {
    id: 'OWNER_EVAL',
    order: 2,
    title: '구단주 평가',
    shortTitle: '구단주 평가',
    description: '구단주 단장 평가 등급과 신뢰도를 확인하고, 단장 유임 및 차기 시즌 목표·예산을 확정합니다.',
    isRequired: true,
    requiredSummary: '단장 유임·차기 목표 확인',
    mappedStep12: 'OWNER_EVAL',
    mappedStep4: 'AWARDS_AND_EVAL',
  },
  {
    id: 'COACH_STAFF',
    order: 3,
    title: '감독·코치 인사',
    shortTitle: '감독·코치',
    description: '감독과 투수·타격·배터리·수비 코치의 유임 또는 교체를 결정합니다.',
    isRequired: true,
    requiredSummary: '감독 포함 코칭스태프 확인',
    mappedStep12: 'COACH_EVAL',
    mappedStep4: 'AWARDS_AND_EVAL',
  },
  {
    id: 'ROSTER_CLEANUP',
    order: 4,
    title: '선수단 정리',
    shortTitle: '선수단 정리',
    description: '은퇴 예정 선수·은퇴식, 정리 예정 방출 선수, 보류선수 명단을 점검합니다.',
    isRequired: false,
    requiredSummary: '은퇴·방출·보류 점검 (선택)',
    mappedStep12: 'RESERVE_AND_RELEASE',
    mappedStep4: 'DOMESTIC_CONTRACTS',
  },
  {
    id: 'PLAYER_CONTRACTS',
    order: 5,
    title: '선수 계약',
    shortTitle: '선수 계약',
    description: 'FA 자격 만료 선수, 외국인·아시아쿼터 재계약, 국내 선수 연봉 협상을 진행합니다.',
    isRequired: true,
    requiredSummary: 'FA·외국인·연봉 협상 점검',
    mappedStep12: 'SALARY_NEGOTIATION',
    mappedStep4: 'FOREIGN_MARKET',
  },
  {
    id: 'ROSTER_UPGRADE',
    order: 6,
    title: '전력 보강',
    shortTitle: '전력 보강',
    description: '포지션 취약점을 진단하고 트레이드, 외부 FA, 해외 복귀 선수, 신인 드래프트로 보강합니다.',
    isRequired: false,
    requiredSummary: '트레이드·드래프트 보강 (선택)',
    mappedStep12: 'TRADE_MARKET',
    mappedStep4: 'ROOKIE_DRAFT',
  },
  {
    id: 'OPENING_PREP',
    order: 7,
    title: '개막 준비',
    shortTitle: '개막 준비',
    description: '스프링캠프, 시범경기, 차기 시즌 개막 1군 엔트리(9타자·5선발)를 최종 확정합니다.',
    isRequired: true,
    requiredSummary: '개막 엔트리(9타자·5선발) 확인',
    mappedStep12: 'SPRING_CAMP',
    mappedStep4: 'ROOKIE_DRAFT',
  },
  {
    id: 'NEXT_SEASON_START',
    order: 8,
    title: '다음 시즌 시작',
    shortTitle: '시즌 개막',
    description: '모든 오프시즌 결과를 최종 확인한 뒤 단장 승인으로 다음 시즌을 개막합니다.',
    isRequired: true,
    requiredSummary: '단장 최종 개막 승인 필수',
    mappedStep12: 'OPENING_PREP',
    mappedStep4: 'ROOKIE_DRAFT',
  },
];

export interface Offseason8ReadinessReport {
  currentStep: OffseasonStep8;
  completedSteps: OffseasonStep8[];
  missingRequiredSteps: OffseasonStep8[];
  requiredCompletedCount: number;
  requiredTotalCount: number;
  awardsCeremonyPending: boolean;
  hasManager: boolean;
  coachCount: number;
  lineupCount: number;
  rotationCount: number;
  retirementAlertCount: number;
  faExpiryCount: number;
  foreignExpiryCount: number;
  markedReleaseCount: number;
  campCompleted: boolean;
  exhibitionCount: number;
  isFiredUnresolved: boolean;
  canApproveNextSeason: boolean;
  blockingReasons: string[];
}

export function getOffseason8StepReadiness(career: CareerSave): Offseason8ReadinessReport {
  const currentStep: OffseasonStep8 = career.offseasonStep8 ?? 'SETTLEMENT';
  const completedSteps = career.completedOffseasonSteps8 ?? [];
  const teamCoaches = career.coaches[career.playerTeamId] ?? [];
  const hasManager = teamCoaches.some((c) => c.role === '감독');
  const myTeam = career.teams[career.playerTeamId];
  const lineupCount = myTeam?.lineupOrder.filter((id) => Boolean(career.players[id])).length ?? 0;
  const rotationCount = myTeam?.rotationOrder.filter((id) => Boolean(career.players[id])).length ?? 0;

  const retirementAlerts = getRetirementCandidateAlerts(career, career.playerTeamId);
  const expiryAlerts = getContractExpiryAlerts(career, career.playerTeamId);
  const faExpiryCount = expiryAlerts.filter((e) => e.kind === 'FA 자격 만료').length;
  const foreignExpiryCount = expiryAlerts.filter((e) => e.kind === '외국인 계약 만료').length;
  const markedReleaseCount = Object.values(career.players).filter(
    (p) =>
      p.teamId === career.playerTeamId &&
      p.markedForOffseasonRelease &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== 'FA'
  ).length;

  const requiredPreSteps = OFFSEASON_8_STEPS.filter(
    (s) => s.isRequired && s.id !== 'NEXT_SEASON_START'
  );
  const completedSet = new Set<OffseasonStep8>(completedSteps);
  const missingRequiredSteps = requiredPreSteps
    .filter((s) => !completedSet.has(s.id))
    .map((s) => s.id);
  const requiredCompletedCount = requiredPreSteps.length - missingRequiredSteps.length;
  const awardsCeremonyPending = career.pendingAwardsCeremonySeason === career.season;

  const isFiredUnresolved = Boolean(career.ownerEval?.isFired);
  const blockingReasons: string[] = [];
  if (awardsCeremonyPending) {
    blockingReasons.push(`${career.season} KBO 시즌 시상식 확인을 먼저 완료해야 합니다.`);
  }
  for (const stepId of missingRequiredSteps) {
    const meta = OFFSEASON_8_STEPS.find((s) => s.id === stepId);
    if (meta) {
      blockingReasons.push(`${meta.order}단계 [${meta.title}] 필수 업무 완료가 필요합니다.`);
    }
  }
  if (isFiredUnresolved) {
    blockingReasons.push('2단계 구단주 평가에서 타 구단 신임 단장 제안을 수락해야 합니다.');
  }
  if (!hasManager) {
    blockingReasons.push('3단계 감독·코치 인사에서 감독을 선임해야 합니다.');
  }
  if (lineupCount < 9) {
    blockingReasons.push(`7단계 개막 준비에서 선발 타선 9명을 채워야 합니다 (현재 ${lineupCount}/9명).`);
  }
  if (rotationCount < 5) {
    blockingReasons.push(`7단계 개막 준비에서 선발 로테이션 5명을 채워야 합니다 (현재 ${rotationCount}/5명).`);
  }

  return {
    currentStep,
    completedSteps,
    missingRequiredSteps,
    requiredCompletedCount,
    requiredTotalCount: requiredPreSteps.length,
    awardsCeremonyPending,
    hasManager,
    coachCount: teamCoaches.length,
    lineupCount,
    rotationCount,
    retirementAlertCount: retirementAlerts.length,
    faExpiryCount,
    foreignExpiryCount,
    markedReleaseCount,
    campCompleted: Boolean(career.springCamp?.campCompleted),
    exhibitionCount: career.springCamp?.exhibitionGames.length ?? 0,
    isFiredUnresolved,
    canApproveNextSeason: blockingReasons.length === 0,
    blockingReasons,
  };
}

/**
 * AI 타 구단 오프시즌 동시 진행 (코치 공석 충원, 만료 선수 재계약/보류 정리, FA 영입)
 * - 시즌당 1회 실행 보장 (aiOffseasonProcessedSeason)
 * - 기존 선수·계약·누적 기록은 절대 파괴하지 않음
 */
export function processAiClubsOffseasonInPlace(career: CareerSave, rng: SeededRng): string[] {
  if (career.aiOffseasonProcessedSeason === career.season) {
    return career.aiOffseasonLogSummary ?? [];
  }

  const logs: string[] = [];
  const today = getCurrentCareerDate(career).isoDate;
  let aiCoachHires = 0;
  let aiRenewals = 0;
  let aiFaSignings = 0;

  // 1. AI 구단 감독/코치 공석 보강
  for (const tid of TEAM_IDS) {
    if (tid === career.playerTeamId) continue;
    const staff = career.coaches[tid] ?? [];
    const hasMgr = staff.some((c) => c.role === '감독');
    if (!hasMgr) {
      if (!career.faCoaches) career.faCoaches = [];
      const faMgrIdx = career.faCoaches.findIndex((c) => c.role === '감독');
      if (faMgrIdx >= 0) {
        const hired = career.faCoaches.splice(faMgrIdx, 1)[0];
        hired.teamId = tid;
        hired.contractYears = 2;
        hired.confirmed = true;
        career.coaches[tid] = [...staff, hired];
        aiCoachHires++;
        logs.push(`${KBO_TEAMS[tid].shortName}: ${hired.name} 신임 감독 선임`);
      }
    }
  }

  // 2. AI 구단 계약 만료 핵심 선수 재계약 (1군 핵심 국내·외국인)
  for (const p of Object.values(career.players)) {
    if (p.teamId === career.playerTeamId) continue;
    if (p.rosterTier === '은퇴' || p.rosterTier === 'FA' || p.rosterTier === '해외이적') continue;
    if (p.contract.yearsRemaining <= 1 || p.contract.status === '만료') {
      if (p.category === '국내' && p.ability >= 74 && p.age <= 36) {
        p.contract.yearsRemaining = p.ability >= 82 ? 3 : 2;
        p.contract.endSeason = career.season + p.contract.yearsRemaining;
        p.contract.status = '확정';
        aiRenewals++;
      } else if (p.category !== '국내' && p.ability >= 78 && p.age <= 35) {
        p.contract.yearsRemaining = 1;
        p.contract.endSeason = career.season + 1;
        p.contract.status = '확정';
        aiRenewals++;
      }
    }
  }

  // 3. AI 9개 구단 FA 경쟁·재계약·보상 자동 진행 (공식 faCompetitionEngine 통합 연동 · 중복/무규정 계약 제거)
  syncFaCompetitionMarketInPlace(career, today);
  const autoRounds = 2;
  for (let r = 0; r < autoRounds; r++) {
    const activeCount = Object.values(career.faCompetition?.negotiations ?? {}).filter(
      (n) => n.status === '입찰중'
    ).length;
    if (activeCount === 0) break;
    const roundRes = advanceFaCompetitionRound(career);
    // in-place 동기화
    career.players = roundRes.nextCareer.players;
    career.teams = roundRes.nextCareer.teams;
    career.finances = roundRes.nextCareer.finances;
    career.faCompetition = roundRes.nextCareer.faCompetition;
    career.newsFeed = roundRes.nextCareer.newsFeed;
    career.leagueAcquisitions = roundRes.nextCareer.leagueAcquisitions;
    for (const sSummary of roundRes.signedSummaries) {
      aiFaSignings++;
      logs.push(`FA 시장 자동 계약 체결: ${sSummary}`);
    }
  }

  const summary =
    logs.length > 0
      ? logs.slice(0, 6)
      : [`타 9개 KBO 구단 오프시즌 코칭스태프·보류선수·연봉 재계약(${aiRenewals}건) 정상 진행 완료`];

  if (aiCoachHires > 0 || aiRenewals > 0 || aiFaSignings > 0) {
    pushLifeNews(career, {
      date: today,
      category: '타구단소식',
      headline: `[스토브리그 동향] 타 9개 구단 오프시즌 진행 (재계약 ${aiRenewals}건 · FA ${aiFaSignings}건 · 감독선임 ${aiCoachHires}건)`,
      body: summary.join(' / '),
      isHighlight: aiFaSignings > 0 || aiCoachHires > 0,
    });
  }

  career.aiOffseasonProcessedSeason = career.season;
  career.aiOffseasonLogSummary = summary;
  return summary;
}

function estimateFallbackSalaryDemand(p: Player, season = 2027): number {
  const minSal = getKboMinSalaryBillion(season);
  const cur = Math.max(minSal, p.contract.annualSalary || 0.5);
  const ovrFactor = p.ability >= 86 ? 1.25 : p.ability >= 80 ? 1.15 : p.ability >= 74 ? 1.06 : 0.96;
  const ageFactor = p.age >= 36 ? 0.9 : p.age <= 26 ? 1.08 : 1.0;
  return Number(Math.max(minSal, Math.min(25, cur * ovrFactor * ageFactor)).toFixed(2));
}

/**
 * 8단계 오프시즌 단계 완료 및 다음 단계 이동 (업무 완료 시 즉시 저장 가능한 새 상태 반환)
 * - 단장 승인 없이 다음 시즌(career.season + 1)으로 자동 진행하지 않음!
 */
export function completeAndAdvanceOffseason8Step(
  career: CareerSave,
  targetStep: OffseasonStep8
): { nextCareer: CareerSave; backupSnapshot: CareerSave; aiSummary: string[] } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);

  const prevStep: OffseasonStep8 = next.offseasonStep8 ?? 'SETTLEMENT';
  const doneSet = new Set<OffseasonStep8>(next.completedOffseasonSteps8 ?? []);
  doneSet.add(prevStep);

  next.offseasonStep8 = targetStep;
  next.completedOffseasonSteps8 = Array.from(doneSet);

  const meta = OFFSEASON_8_STEPS.find((s) => s.id === targetStep) ?? OFFSEASON_8_STEPS[0];
  next.offseasonStep12 = meta.mappedStep12;
  next.offseasonStep = meta.mappedStep4;
  const done12 = new Set<OffseasonStep12>(next.completedOffseasonSteps12 ?? []);
  const prevMeta = OFFSEASON_8_STEPS.find((s) => s.id === prevStep);
  if (prevMeta) done12.add(prevMeta.mappedStep12);
  next.completedOffseasonSteps12 = Array.from(done12);

  // 오프시즌 단계 전환 시 내부 게임 날짜 동기화 + FA 시장 자동 진행 연동
  const stepDateMap: Record<OffseasonStep8, string> = {
    SETTLEMENT: `${next.season}-11-12`,
    OWNER_EVAL: `${next.season}-11-15`,
    COACH_STAFF: `${next.season}-11-19`,
    ROSTER_CLEANUP: `${next.season}-11-23`,
    PLAYER_CONTRACTS: `${next.season}-12-08`,
    ROSTER_UPGRADE: `${next.season}-12-22`,
    OPENING_PREP: `${next.season + 1}-02-15`,
    NEXT_SEASON_START: `${next.season + 1}-03-18`,
  };
  const stepIso = stepDateMap[targetStep];
  if (stepIso && (!next.currentDate || stepIso > next.currentDate)) {
    next.currentDate = stepIso;
  }

  // 5단계(선수 계약) 진입 시 국내 선수 연봉 요구액 자동 준비
  if (targetStep === 'PLAYER_CONTRACTS') {
    for (const p of Object.values(next.players)) {
      if (
        p.teamId === next.playerTeamId &&
        p.category === '국내' &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        p.rosterTier !== 'FA'
      ) {
        if (p.demandedSalaryBillion === undefined) {
          p.demandedSalaryBillion = estimateFallbackSalaryDemand(p, next.season + 1);
        }
        if (!p.salaryNegotiationStatus) {
          p.salaryNegotiationStatus = p.contract.yearsRemaining > 1 ? '협상완료' : '미협상';
        }
      }
    }
  }

  // 오프시즌 단계가 진행될 때마다 별도 FA 버튼 없이도 FA 시장 1라운드 자동 진행 (사용자 승인 전 사용자 구단 계약은 대기 유지)
  if (
    targetStep === 'ROSTER_CLEANUP' ||
    targetStep === 'PLAYER_CONTRACTS' ||
    targetStep === 'ROSTER_UPGRADE'
  ) {
    syncFaCompetitionMarketInPlace(next, next.currentDate);
    const hasOpenFa = Object.values(next.faCompetition?.negotiations ?? {}).some(
      (n) => n.status === '입찰중'
    );
    if (hasOpenFa) {
      const autoFa = advanceFaCompetitionRound(next);
      next.players = autoFa.nextCareer.players;
      next.teams = autoFa.nextCareer.teams;
      next.finances = autoFa.nextCareer.finances;
      next.faCompetition = autoFa.nextCareer.faCompetition;
      next.newsFeed = autoFa.nextCareer.newsFeed;
      next.leagueAcquisitions = autoFa.nextCareer.leagueAcquisitions;
    }
  }

  // 5단계 이후 진입 시 AI 타 구단 오프시즌 동시 진행 동기화 (시즌당 1회)
  let aiSummary: string[] = next.aiOffseasonLogSummary ?? [];
  if (
    targetStep === 'PLAYER_CONTRACTS' ||
    targetStep === 'ROSTER_UPGRADE' ||
    targetStep === 'OPENING_PREP' ||
    targetStep === 'NEXT_SEASON_START'
  ) {
    const rng = new SeededRng(next.rngState);
    aiSummary = processAiClubsOffseasonInPlace(next, rng);
    next.rngState = rng.getState();
  }

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, aiSummary };
}

