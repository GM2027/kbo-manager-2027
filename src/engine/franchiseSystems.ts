import {
  buildCoachSubRatings,
  COACH_ROLE_METADATA,
  COACH_ROLES,
  generateFreshVirtualCoaches,
  REAL_2026_TEAM_COACHES,
  REAL_FA_COACH_SEEDS,
  toCoach,
} from '../data/coachesData';
import { createFreshDraftState } from '../data/draftPool';
import {
  DEFAULT_ACTIVE_SPEND_IDS,
  DEFAULT_INVESTMENTS,
  FACILITY_UPGRADES,
  getActiveOneTimeSpendOptions,
  getTeamSponsorChoices,
  OneTimeSpendDef,
  TICKET_PRICE_CONFIG,
} from '../data/financesData';
import { getRivalryEffectProfile, getTeamRivalries } from './rivalryEngine';
import {
  applyCompetitiveBalanceDraftPenalties,
  computeSalaryCapSummary,
  ensureCompetitiveBalanceState,
  getCurrentCareerDate,
} from './salaryCapEngine';
import { assignTeamBullpenRolesInPlace } from './pitchingUsageEngine';
import {
  awardWaiverPlayerToTeamInPlace,
  ensureWaiverStateInPlace,
  KBO_WAIVER_FEE_BILLION,
  processWaiverLifecycleInPlace,
  signUnclaimedFreeAgentForUser,
  submitUserWaiverClaim,
  waiveDomesticPlayerInPlace,
} from './waiverEngine';

export {
  submitUserWaiverClaim as submitWaiverClaimApplication,
  signUnclaimedFreeAgentForUser as signUnclaimedFreeAgent,
};
import {
  assertNotBlockedByArticle107,
  ensureAmateurAndOverseasStateInPlace,
  integrateAmateurAndOverseasIntoDraftCandidates,
} from './amateurOverseasEngine';
import {
  determineInitialOverseasLeague,
  ensureOverseasProgressionFieldsInPlace,
} from './overseasProgressionEngine';
import {
  allocatePermanentPlayerId,
  ensureGlobalPlayerRegistryInPlace,
} from './playerRegistry';
import {
  checkHighSchoolDevelopmentalLimit,
  processAiClubsDevelopmentalRules,
  recordHighSchoolDevSigning,
} from './developmentalEngine';
import {
  FINAL_STANDINGS_2026_ORDER,
  FUTURES_NORTH_TEAMS,
  FUTURES_SOUTH_TEAMS,
  FUTURES_TEAM_IDS,
  FUTURES_TEAMS_META,
  generateVirtualForeignMarket,
  KBO_TEAMS,
  MLB_CLUBS,
  TEAM_IDS,
} from '../data/kboTeams';
import {
  allocateTeamUniformNumber,
  applyRealPlayerMetadataAndNumbers,
  enforceNoRetiredUniformNumbers,
  ensurePlayerRichMetadata,
  getLiveCareerStats,
  REAL_KBO_HISTORICAL_LEGENDS,
  REAL_KBO_RETIRED_NUMBERS,
  REAL_MILITARY_EXEMPT_PLAYERS,
} from '../data/playerMetadata';
import { optimizeBattingLineup } from './lineupOptimizer';
import {
  canPlayerEnlistMilitary,
  isEligibleForMandatoryEnlistment,
  isMilitaryResolved,
  isMilitaryServing,
} from './militaryEngine';
import {
  appendPlayerMlbHistoryInPlace,
  ensureDraftPickProvenanceInPlace,
} from './leagueLifeEngine';
import {
  ensureSpecialFuturesRosters,
  injectUndraftedUlsanPlayersIntoDraft,
  simulateUlsanWhalesFuturesStats,
} from './specialFuturesEngine';
import {
  BatterStats,
  CareerBatterStats,
  CareerPitcherStats,
  CareerSave,
  ClubEventRecord,
  ClubInvestments,
  Coach,
  CoachRole,
  CoachSwapReport,
  DevelopmentalCandidate,
  FuturesPlayerStats,
  FuturesStandingRow,
  FuturesTeamId,
  GameRecord,
  KboRuleChangeLog,
  KboRuleItem,
  LeagueHistoryState,
  ManagerFiringRecord,
  MlbExportPlayerRecord,
  NationalTeamEvent,
  NewsArticle,
  OffseasonStep,
  OverseasTrainingRecord,
  OwnerEvaluationBreakdown,
  OwnerEvaluationState,
  PitcherStats,
  Player,
  PlayerComplaint,
  Position,
  ScoutDispatchMission,
  SeasonAwards,
  SeasonHistorySummary,
  SeriesFeedback,
  TeamId,
  TrophyRecord,
  VirtualForeignPoolItem,
  WaiverPlayerItem,
} from '../types/kbo';
import {
  ensureDeepFranchiseState,
  generateGmJobOffers,
  getTradeWindowStatus,
  resolveDeepClubEvent,
  validateTradeCompliance,
} from './deepFranchise';
import {
  evaluateFranchiseStar,
  evaluateLegendTradeAvailability,
  evaluatePlayerTradeValuationDetailed,
} from './franchiseStarEngine';
import { recordLeagueAcquisitionInPlace } from './leagueAcquisitionsEngine';
import {
  appendPlayerTeamHistoryInPlace,
  appointActingManagerInPlace,
  ensureLeagueLifeStateInPlace,
  markReleasedPlayerSignedInPlace,
  recordDraftPickTradeInPlace,
  recordReleasedPlayerInPlace,
  syncActingCaptainInPlace,
} from './leagueLifeEngine';
import { SeededRng } from './rng';
import {
  calcAVG,
  calcERA,
  calcOPS,
  computeLeaderboards,
  computeStandings,
  emptyBatterStats,
  emptyPitcherStats,
  formatIP,
} from './stats';

function cloneCareer(c: CareerSave): CareerSave {
  return JSON.parse(JSON.stringify(c)) as CareerSave;
}

function bumpVersion(v: string): string {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return `${v}.1`;
  return `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export function emptyFuturesStats(): FuturesPlayerStats {
  return { G: 0, AB: 0, H: 0, HR: 0, RBI: 0, outs: 0, ER: 0, SO: 0, W: 0, L: 0 };
}

export const REQUIRED_FIELDING_POSITIONS: Position[] = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
];

export function getTeamRetiredNumbers(career: CareerSave, teamId: TeamId): number[] {
  const set = new Set<number>(REAL_KBO_RETIRED_NUMBERS[teamId] ?? []);
  for (const r of career.leagueHistory?.retiredNumbers ?? []) {
    if (r.teamId === teamId) set.add(r.number);
  }
  return Array.from(set);
}

export function getRetiredNumbersMap(career: CareerSave): Partial<Record<TeamId, number[]>> {
  const map: Partial<Record<TeamId, number[]>> = {};
  for (const tid of TEAM_IDS) {
    map[tid] = getTeamRetiredNumbers(career, tid);
  }
  return map;
}

export function validateUniqueLineup(
  players: Record<string, Player>,
  lineupOrder: string[],
  lineupPositions: Record<string, Position>
): { valid: boolean; error?: string } {
  const seen = new Map<Position, string>();
  for (const pid of lineupOrder) {
    const p = players[pid];
    if (!p) continue;
    const pos = lineupPositions[pid] ?? p.position;
    if (pos !== 'DH' && pos !== p.position) {
      return {
        valid: false,
        error: `${p.name} 선수는 자연 포지션(${p.position}) 또는 지명타자(DH)로만 선발 출전할 수 있습니다.`,
      };
    }
    const prevName = seen.get(pos);
    if (prevName) {
      return {
        valid: false,
        error: `선발 라인업에 ${pos} 포지션이 중복됩니다 (${prevName}, ${p.name}). 한 자리에 한 포지션만 배치할 수 있습니다.`,
      };
    }
    seen.set(pos, p.name);
  }
  return { valid: true };
}

export function buildInitialOwnerEval(teamId: TeamId, season: number): OwnerEvaluationState {
  const prevRank = KBO_TEAMS[teamId].prevRank2025;
  let targetRank = 5;
  let targetRankLabel = '가을야구 진출 (5위 이내)';
  let targetProfitNote = '적자 -25억 이내 재정 건전성 유지';

  if (prevRank <= 2) {
    targetRank = 2;
    targetRankLabel = '한국시리즈 우승 도전 (정규시즌 2위 이내)';
    targetProfitNote = '우승 경쟁 전력 유지 및 스폰서 수익 극대화';
  } else if (prevRank <= 5) {
    targetRank = 4;
    targetRankLabel = '포스트시즌 안정 진출 (정규시즌 4위 이내)';
    targetProfitNote = '티켓·유니폼 수익 흑자 기조 유지';
  } else if (prevRank <= 8) {
    targetRank = 6;
    targetRankLabel = '중위권 도약 및 가을야구 경쟁 (6위 이내)';
    targetProfitNote = '유망주 육성과 균형 재정 달성';
  } else {
    targetRank = 7;
    targetRankLabel = '최하위 탈출 및 리빌딩 성과 (7위 이내)';
    targetProfitNote = '미래 자원 확보 및 적자 최소화';
  }

  return {
    season,
    targetRank,
    targetRankLabel,
    targetProfitNote,
    ownerTrust: 68,
    isFired: false,
  };
}

export function ensureFranchiseState(career: CareerSave): void {
  ensureDeepFranchiseState(career);
  ensureSpecialFuturesRosters(career);
  ensureGlobalPlayerRegistryInPlace(career);
  ensureAmateurAndOverseasStateInPlace(career);
  ensureLeagueLifeStateInPlace(career);
  if (!career.newsFeed) {
    career.newsFeed = [
      {
        id: `news-init-${career.season}`,
        date: `${career.season}-03-25`,
        season: career.season,
        category: '경기·시리즈',
        headline: `${career.season} KBO 리그 개막 앞두고 ${KBO_TEAMS[career.playerTeamId].name} 프런트 본격 가동`,
        body: `${KBO_TEAMS[career.playerTeamId].name}이(가) 144경기 대장정을 앞두고 선수단 전력 점검과 스폰서·재정 전략을 정비했습니다.`,
        teamId: career.playerTeamId,
        isHighlight: true,
      },
    ];
  }
  if (!career.clubEvents) career.clubEvents = [];
  if (!career.complaints) career.complaints = [];
  if (!career.coachSwapReports) career.coachSwapReports = [];
  if (!career.nationalTeamEvents) career.nationalTeamEvents = [];
  if (!career.waiverPool) career.waiverPool = [];
  if (!career.scoutMissions) career.scoutMissions = [];
  if (career.rainoutCount === undefined) career.rainoutCount = 0;

  if (!career.overseasTrainings) career.overseasTrainings = [];
  if (!career.managerFirings) career.managerFirings = [];
  if (!career.firedManagerTeamsThisSeason) career.firedManagerTeamsThisSeason = [];
  if (!career.seasonHistory) career.seasonHistory = [];
  if (career.newsAttendanceBoostPct === undefined) career.newsAttendanceBoostPct = 0;
  if (career.doubleheaderCount === undefined) career.doubleheaderCount = 0;

  if (!career.otherClubSponsors) {
    const sponsorsMap: Partial<Record<TeamId, string>> = {};
    for (const tid of TEAM_IDS) {
      const choices = getTeamSponsorChoices(tid);
      sponsorsMap[tid] = choices[0]?.name ?? `${KBO_TEAMS[tid].shortName} 공식 스폰서`;
    }
    career.otherClubSponsors = sponsorsMap;
  }

  // Ensure all 10 clubs have all 5 coaching roles (감독/투수/타격/배터리/수비) + detailed subRatings
  const ensureCoachMetadata = (c: Coach) => {
    if (!c.nationality) c.nationality = '한국';
    if (!c.roleSummary) c.roleSummary = COACH_ROLE_METADATA[c.role]?.duties ?? '';
    if (!c.subRatings) {
      c.subRatings = buildCoachSubRatings(c.role, c.ability, c.name);
    }
  };
  for (const tid of TEAM_IDS) {
    if (!career.coaches[tid]) career.coaches[tid] = [];
    for (const c of career.coaches[tid]) ensureCoachMetadata(c);
    const seedList = REAL_2026_TEAM_COACHES[tid] ?? [];
    for (const role of COACH_ROLES) {
      if (!career.coaches[tid].some((c) => c.role === role)) {
        const seed = seedList.find((s) => s.role === role);
        if (seed) {
          career.coaches[tid].push(toCoach(seed, tid, `${tid}-${role}-auto`, true, true));
        }
      }
    }
  }
  if (Array.isArray(career.faCoaches)) {
    for (const c of career.faCoaches) ensureCoachMetadata(c);
  }

  // Ensure all players have nationality, draft/developmental acquisitionInfo & careerStats
  for (const p of Object.values(career.players)) {
    ensurePlayerRichMetadata(p);
  }

  // Ensure dynamic KBO rules & rule change history
  if (!career.activeKboRules || career.activeKboRules.length === 0) {
    career.activeKboRules = INITIAL_2026_KBO_RULES.map((r) => ({ ...r }));
  }
  if (!career.ruleChangeHistory) {
    career.ruleChangeHistory = [];
  }

  // Ensure MLB exports tracker (real KBO->MLB alumni baseline)
  if (!career.mlbExports) {
    career.mlbExports = INITIAL_MLB_EXPORTS.map((m) => ({ ...m }));
  }

  // Ensure season-start developmental player recruitment market (#9)
  ensureSeasonDevelopmentalMarket(career);

  // Ensure all 12 real Futures League teams (North 6 + South 6 incl. 상무 피닉스, 울산 웨일스) exist
  if (!career.futuresStandings) {
    career.futuresStandings = {};
  }
  for (const fid of FUTURES_TEAM_IDS) {
    const meta = FUTURES_TEAMS_META[fid];
    const existing = career.futuresStandings[fid];
    if (!existing) {
      career.futuresStandings[fid] = {
        teamId: fid,
        division: meta.division,
        officialName: meta.officialName,
        homeCity: meta.homeCity,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
      };
    } else {
      existing.division = meta.division;
      existing.officialName = meta.officialName;
      existing.homeCity = meta.homeCity;
    }
  }

  if (!career.ownerEval || career.ownerEval.season !== career.season) {
    const prevTrust = career.ownerEval?.ownerTrust ?? 68;
    const fresh = buildInitialOwnerEval(career.playerTeamId, career.season);
    fresh.ownerTrust = Math.max(45, Math.min(90, prevTrust));
    career.ownerEval = fresh;
  }

  if (!career.leagueHistory) {
    const baseHistory: LeagueHistoryState = {
      retiredNumbers: REAL_KBO_HISTORICAL_LEGENDS.filter(
        (l) => l.uniformNumber !== undefined && l.playerName !== '오승환'
      ).map((l) => ({
        teamId: l.teamId,
        number: l.uniformNumber!,
        playerName: l.playerName,
        position: (l.role === '투수' ? 'SP' : l.playerName === '이승엽' || l.playerName === '이대호' || l.playerName === '장종훈' || l.playerName === '김태균' ? '1B' : l.playerName === '박경완' || l.playerName === '이만수' ? 'C' : l.playerName === '이종범' ? 'SS' : 'LF') as Position,
        retiredSeason: l.retiredYear ?? 2020,
        careerSummary: `${l.notableStats} · ${l.careerSummary}`,
      })),
      hallOfFame: REAL_KBO_HISTORICAL_LEGENDS.map((l) => ({
        playerId: `hof-${l.playerName}`,
        playerName: l.playerName,
        teamId: l.teamId,
        position: (l.role === '투수' ? (l.playerName === '오승환' ? 'CL' : 'SP') : l.playerName === '이승엽' || l.playerName === '이대호' || l.playerName === '장종훈' || l.playerName === '김태균' ? '1B' : l.playerName === '박경완' || l.playerName === '이만수' ? 'C' : l.playerName === '이종범' ? 'SS' : 'LF') as Position,
        inductedSeason: l.retiredYear ?? 2022,
        careerSummary: `${l.notableStats} | ${l.careerSummary}`,
      })),
      trophies: [],
      clubRecords: [
        { label: 'KBO 통산 최다 홈런', value: '495 HR', holder: '최정 (SSG · 현역)', season: 2025 },
        { label: 'KBO 통산 최다 안타', value: '2,511 H', holder: '손아섭 (한화 · 현역)', season: 2025 },
        { label: 'KBO 통산 최다승', value: '210 승', holder: '송진우 (한화 · 영구결번)', season: 2009 },
        { label: 'KBO 통산 최다 탈삼진', value: '2,076 K', holder: '양현종 (KIA · 현역)', season: 2025 },
        { label: 'KBO 통산 최다 세이브', value: '427 SV', holder: '오승환 (삼성 · 은퇴)', season: 2025 },
        { label: 'KBO 통산 최저 ERA (1000IP+)', value: '1.20 ERA', holder: '선동열 (KIA · 영구결번)', season: 1995 },
        { label: '한 시즌 최다 홈런', value: '56 HR', holder: '이승엽 (삼성)', season: 2003 },
        { label: '한 시즌 최다 안타', value: '202 H', holder: '빅터 레이예스 (롯데)', season: 2024 },
        { label: '한 시즌 최다 탈삼진', value: '225 K', holder: '아리엘 미란다 (두산)', season: 2021 },
      ],
    };
    career.leagueHistory = baseHistory;
  } else {
    // Backfill complete verified KBO retired legends & Hall of Fame entries for older saves
    for (const l of REAL_KBO_HISTORICAL_LEGENDS) {
      if (!career.leagueHistory.hallOfFame.some((h) => h.playerName === l.playerName)) {
        career.leagueHistory.hallOfFame.push({
          playerId: `hof-${l.playerName}`,
          playerName: l.playerName,
          teamId: l.teamId,
          position: (l.role === '투수' ? (l.playerName === '오승환' ? 'CL' : 'SP') : '1B') as Position,
          inductedSeason: l.retiredYear ?? 2022,
          careerSummary: `${l.notableStats} | ${l.careerSummary}`,
        });
      }
      if (
        l.uniformNumber !== undefined &&
        l.playerName !== '오승환' &&
        !career.leagueHistory.retiredNumbers.some(
          (r) => r.teamId === l.teamId && r.number === l.uniformNumber
        )
      ) {
        career.leagueHistory.retiredNumbers.push({
          teamId: l.teamId,
          number: l.uniformNumber,
          playerName: l.playerName,
          position: (l.role === '투수' ? 'SP' : '1B') as Position,
          retiredSeason: l.retiredYear ?? 2020,
          careerSummary: `${l.notableStats} · ${l.careerSummary}`,
        });
      }
    }
  }

  if (!career.finances.activeSpendOfferIds || career.finances.activeSpendOfferIds.length !== 3) {
    career.finances.activeSpendOfferIds = [...DEFAULT_ACTIVE_SPEND_IDS];
  }
  if (!career.finances.usedSpendOfferIds) {
    career.finances.usedSpendOfferIds = [];
  }
  if (!career.finances.ticketPricePolicy) {
    career.finances.ticketPricePolicy = '표준';
  }

  for (const tid of TEAM_IDS) {
    const t = career.teams[tid];
    if (t && t.fanSentiment === undefined) {
      t.fanSentiment = Math.max(45, Math.min(82, Math.round(t.popularity * 0.8 + 10)));
      t.fanSentimentReason = '시즌 개막 기대감 유지';
    }
  }

  for (const p of Object.values(career.players)) {
    if (p.category !== '국내') {
      p.militaryStatus = '해당 없음';
    } else if (!p.militaryStatus) {
      // 확인되지 않은 국내 선수를 임의로 '미필'로 단정하지 않고 '미확인'으로 유지
      p.militaryStatus = '미확인';
    }
    if ((p.category === '외국인' || p.category === '아시아쿼터') && p.kboAdaptation === undefined) {
      p.kboAdaptation = 86;
    }
    if (p.injuryHistoryCount === undefined) p.injuryHistoryCount = 0;
    if (p.recent3YrScore === undefined) {
      p.recent3YrScore = Math.max(40, Math.min(96, p.ability + (p.serviceYears >= 5 ? 2 : -1)));
    }
    if (p.contract && p.contract.startSeason === undefined) {
      const span = Math.max(1, p.contract.years || p.contract.yearsRemaining || 1);
      const rem = Math.max(1, p.contract.yearsRemaining || span);
      const start = Math.max(2020, career.season - Math.max(0, span - rem));
      p.contract.startSeason = start;
      p.contract.endSeason = start + span - 1;
    }
  }

  // Backfill uniform numbers and developmental players ONLY for legacy saves (real v20 players keep unverified jersey as undefined)
  const needsNumberBackfill = Object.values(career.players).some(
    (p) =>
      p.originType !== 'real' &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적' &&
      p.uniformNumber === undefined
  );
  const needsDevBackfill =
    career.databaseVersion !== 'v23_go_woosuk_kbo_return' &&
    career.databaseVersion !== 'v22_verified_birthdates' &&
    career.databaseVersion !== 'v21_verified_career_histories' &&
    career.databaseVersion !== 'v20_verified_player_db' &&
    career.databaseVersion !== 'v19_unified_rebalance' &&
    TEAM_IDS.some(
      (tid) => !Object.values(career.players).some((p) => p.teamId === tid && p.rosterTier === '육성')
    );
  if (needsNumberBackfill || needsDevBackfill) {
    applyRealPlayerMetadataAndNumbers(career.players, {
      preserveHanwhaMasterContracts: career.isPreservedMaster,
    });
  }
  void REAL_MILITARY_EXEMPT_PLAYERS;

  // Strictly guarantee NO active player wears any retired uniform number (real or custom)
  enforceNoRetiredUniformNumbers(career.players, getRetiredNumbersMap(career));

  // Ensure realistic waiver state & 6-role bullpen hierarchy for legacy saves
  ensureWaiverStateInPlace(career);
  for (const tid of TEAM_IDS) {
    const team = career.teams[tid];
    if (!team) continue;
    const needsRoles = team.bullpenOrder.some((id) => {
      const bp = career.players[id];
      return bp && bp.rosterTier === '1군' && (!bp.pitchRole || bp.pitchRole === '중간');
    });
    if (needsRoles) {
      assignTeamBullpenRolesInPlace(career, tid);
    }
  }
}

/**
 * 시즌 뉴스 분류 시즌 계산:
 * - 정규시즌/포스트시즌 뉴스는 현재 시즌(career.season)
 * - 오프시즌 스토브리그 뉴스는 다음 시즌(career.season + 1)으로 분류
 */
export function getNewsArticleSeason(career: Pick<CareerSave, 'season' | 'phase'>): number {
  return career.phase === 'OFFSEASON' ? career.season + 1 : career.season;
}

/**
 * 다음 시즌 시작 시 한 번만 이전 시즌(season < newSeason) 뉴스를 일괄 정리한다.
 * - FA·트레이드·부상·수상·타구단·MLB 등 모든 카테고리에 동일 적용
 * - 오프시즌 스토브리그(season === newSeason) 및 새 시즌 뉴스는 유지
 * - 뉴스 피드만 정리하며 선수 기록·계약·이적 이력·수상 내역은 일절 변경하지 않는다.
 */
export function prunePreviousSeasonNewsInPlace(career: CareerSave, newSeason: number): number {
  if (career.lastNewsPrunedForSeason === newSeason) return 0;
  const before = career.newsFeed?.length ?? 0;
  career.newsFeed = (career.newsFeed ?? []).filter((n) => n.season >= newSeason);
  career.lastNewsPrunedForSeason = newSeason;
  return Math.max(0, before - career.newsFeed.length);
}

export function pushNews(career: CareerSave, article: Omit<NewsArticle, 'id' | 'season'>): void {
  ensureFranchiseState(career);
  const full: NewsArticle = {
    id: `news-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    season: getNewsArticleSeason(career),
    ...article,
  };
  career.newsFeed!.unshift(full);
  if (career.newsFeed!.length > 60) {
    career.newsFeed = career.newsFeed!.slice(0, 60);
  }

  // #11: News -> Fan sentiment, Attendance boost, Owner trust linkage
  if (full.teamId === career.playerTeamId) {
    const tState = career.teams[career.playerTeamId];
    if (tState && typeof full.fanSentimentImpact === 'number' && full.fanSentimentImpact !== 0) {
      tState.fanSentiment = Math.max(15, Math.min(100, (tState.fanSentiment ?? 65) + full.fanSentimentImpact));
    }
    if (typeof full.attendanceImpactPct === 'number' && full.attendanceImpactPct !== 0) {
      career.newsAttendanceBoostPct = Math.max(
        -15,
        Math.min(20, Number(((career.newsAttendanceBoostPct ?? 0) + full.attendanceImpactPct).toFixed(1)))
      );
    }
    if (career.ownerEval && typeof full.ownerTrustImpact === 'number' && full.ownerTrustImpact !== 0) {
      career.ownerEval.ownerTrust = Math.max(
        5,
        Math.min(100, career.ownerEval.ownerTrust + full.ownerTrustImpact)
      );
    }
  }
}

export function unlockTrophy(
  career: CareerSave,
  trophy: Omit<TrophyRecord, 'id' | 'season' | 'teamId'>
): void {
  ensureFranchiseState(career);
  const existing = career.leagueHistory!.trophies.find(
    (t) => t.season === career.season && t.title === trophy.title && t.teamId === career.playerTeamId
  );
  if (existing) return;
  career.leagueHistory!.trophies.unshift({
    id: `trophy-${career.season}-${career.leagueHistory!.trophies.length + 1}`,
    season: career.season,
    teamId: career.playerTeamId,
    ...trophy,
  });
}

/**
 * 시즌 최종 순위(1위~10위) 계산
 * - 포스트시즌 완료 시: 1위 한국시리즈 우승팀 → 2위 KS 준우승 → 3위 PO 패자 → 4위 준PO 패자 → 5위 WC 패자 → 6~10위 정규시즌 순위
 * - 정규시즌 경기 미진행 시: 2026시즌 최종 순위 기준(삼성 → KT → KIA → LG → 두산 → SSG → 롯데 → NC → 한화 → 키움)
 */
export function computeFinalSeasonStandingsOrder(career: CareerSave): TeamId[] {
  const standings = computeStandings(career.gamesLedger);
  if (standings.length !== 10 || !standings.some((r) => r.games > 0)) {
    return [...FINAL_STANDINGS_2026_ORDER];
  }

  const regOrder = standings.map((r) => r.teamId);
  const ps = career.postseason;
  if (!ps || (!ps.champion && (!ps.seriesHistory || ps.seriesHistory.length === 0))) {
    return regOrder;
  }

  const finalOrder: TeamId[] = [];
  const pushUnique = (tid?: TeamId | null) => {
    if (tid && !finalOrder.includes(tid)) finalOrder.push(tid);
  };

  const history = ps.seriesHistory ?? [];
  const ksSeries = history.find((s) => s.round === 'KOREAN_SERIES');
  const poSeries = history.find((s) => s.round === 'PO');
  const semiPoSeries = history.find((s) => s.round === 'SEMI_PO');
  const wcSeries = history.find((s) => s.round === 'WILDCARD');

  const loserOf = (s?: (typeof history)[number]): TeamId | null => {
    if (!s || !s.winnerTeam) return null;
    return s.winnerTeam === s.higherSeedTeam ? s.lowerSeedTeam : s.higherSeedTeam;
  };

  // 1위: 한국시리즈 우승팀 (반드시 드래프트 마지막 기본 지명 순번 배정)
  pushUnique(ps.champion ?? ksSeries?.winnerTeam ?? null);
  // 2위: 한국시리즈 준우승팀
  pushUnique(loserOf(ksSeries));
  // 3위: 플레이오프 패자
  pushUnique(loserOf(poSeries));
  // 4위: 준플레이오프 패자
  pushUnique(loserOf(semiPoSeries));
  // 5위: 와일드카드 패자
  pushUnique(loserOf(wcSeries));
  // 6~10위 (및 포스트시즌 미완료 구단): 정규시즌 성적순
  for (const tid of regOrder) {
    pushUnique(tid);
  }

  return finalOrder;
}

/**
 * 신인 드래프트 기본 지명 순서 계산 (직전 시즌 최종 순위의 역순)
 * - 1~11라운드 모두 동일한 기본 순서를 적용 (한국시리즈 우승팀 = 10순위 마지막 기본 지명 순번)
 * - 지명권 트레이드는 tradedDraftPicks로 별도 반영
 */
export function computeReverseDraftOrder(career: CareerSave): TeamId[] {
  return [...computeFinalSeasonStandingsOrder(career)].reverse();
}

/**
 * 2군 퓨처스리그 (북부 6팀 · 남부 6팀, 상무 피닉스·울산 웨일스 포함) 3경기 시뮬레이션 + 재활 출전 + 유망주 성장
 */
export function simulateFuturesSeriesAndRehab(
  next: CareerSave,
  rng: SeededRng,
  dateStr: string
): void {
  ensureFranchiseState(next);
  const standings = next.futuresStandings!;
  const isInterleague = next.currentSeriesIndex % 4 === 0;

  const matchups: [FuturesTeamId, FuturesTeamId][] = [];
  if (isInterleague) {
    const northShuf = rng.shuffle([...FUTURES_NORTH_TEAMS]);
    const southShuf = rng.shuffle([...FUTURES_SOUTH_TEAMS]);
    for (let i = 0; i < 6; i++) {
      matchups.push([northShuf[i], southShuf[i]]);
    }
  } else {
    const northShuf = rng.shuffle([...FUTURES_NORTH_TEAMS]);
    const southShuf = rng.shuffle([...FUTURES_SOUTH_TEAMS]);
    for (let i = 0; i < 6; i += 2) {
      matchups.push([northShuf[i], northShuf[i + 1]]);
      matchups.push([southShuf[i], southShuf[i + 1]]);
    }
  }

  const getFuturesRoster = (fid: FuturesTeamId): Player[] => {
    if (fid === '상무') {
      return Object.values(next.players).filter((p) => isMilitaryServing(p.militaryStatus));
    }
    if (fid === '울산') {
      return [];
    }
    return Object.values(next.players).filter(
      (p) => p.teamId === fid && (p.rosterTier === '2군' || p.rosterTier === '육성')
    );
  };

  const getFuturesStrength = (fid: FuturesTeamId, roster: Player[]): number => {
    if (fid === '상무') {
      if (roster.length > 0) {
        const avg = roster.reduce((s, p) => s + p.ability, 0) / roster.length;
        return Math.max(69, avg * 0.5 + 36);
      }
      return 70.5; // 국군체육부대 상무는 전통적 남부 강호
    }
    if (fid === '울산') {
      const uwActive = (next.ulsanWhales?.roster ?? []).filter((p) => !p.transferredToTeamId);
      if (uwActive.length > 0) {
        const avg = uwActive.reduce((s, p) => s + p.ability, 0) / uwActive.length;
        return Math.max(64.5, avg);
      }
      return 66.0; // 울산 웨일즈
    }
    return roster.length > 0 ? roster.reduce((s, p) => s + p.ability, 0) / roster.length : 63;
  };

  for (const [teamA, teamB] of matchups) {
    const rosterA = getFuturesRoster(teamA);
    const rosterB = getFuturesRoster(teamB);
    const avgA = getFuturesStrength(teamA, rosterA);
    const avgB = getFuturesStrength(teamB, rosterB);

    let winsA = 0;
    let winsB = 0;

    for (let g = 0; g < 3; g++) {
      const aWinProb = Math.max(0.28, Math.min(0.72, 0.5 + (avgA - avgB) * 0.025));
      const roll = rng.next();
      standings[teamA].games += 1;
      standings[teamB].games += 1;
      if (roll < 0.04) {
        standings[teamA].draws += 1;
        standings[teamB].draws += 1;
      } else if (roll < aWinProb) {
        standings[teamA].wins += 1;
        standings[teamB].losses += 1;
        winsA += 1;
      } else {
        standings[teamB].wins += 1;
        standings[teamA].losses += 1;
        winsB += 1;
      }
    }

    const updateFuturesTeam = (roster: Player[], wins: number) => {
      for (const p of roster) {
        if (p.injury && p.injury.daysRemaining > 4) continue;
        if (!p.futuresStats) p.futuresStats = emptyFuturesStats();
        const fs = p.futuresStats;

        // Rehab game countdown
        if (p.rehabGamesLeft && p.rehabGamesLeft > 0) {
          p.rehabGamesLeft = Math.max(0, p.rehabGamesLeft - 2);
          p.form = Math.min(2, p.form + 1);
          if (p.rehabGamesLeft === 0 && p.teamId === next.playerTeamId) {
            pushNews(next, {
              date: dateStr,
              category: '구단사건',
              headline: `[재활 완료] ${p.name}, 2군 퓨처스 실전 점검 마치고 1군 콜업 준비`,
              body: `${p.name} 선수가 퓨처스리그 재활 등판을 정상 소화하며 컨디션을 회복했습니다.`,
              teamId: p.teamId,
            });
          }
        }

        if (p.role === '타자') {
          const gamesPlayedNow = rng.int(2, 3);
          const ab = gamesPlayedNow * rng.int(3, 4);
          const hitRate = Math.max(0.18, Math.min(0.42, 0.255 + (p.ability - 63) * 0.008));
          const hits = Math.min(ab, Math.round(ab * hitRate + (rng.next() - 0.45) * 1.4));
          const hr = hits > 0 && rng.next() < 0.14 + Math.max(0, (p.ability - 65) * 0.01) ? 1 : 0;
          const rbi = hr + (hits >= 2 && rng.next() < 0.55 ? rng.int(1, 2) : 0);
          fs.G += gamesPlayedNow;
          fs.AB += ab;
          fs.H += Math.max(0, hits);
          fs.HR += hr;
          fs.RBI += rbi;
        } else {
          const isStarter = p.pitchRole === '선발' || p.position === 'SP';
          const outs = isStarter ? rng.int(12, 18) : rng.int(3, 7);
          const erRate = Math.max(0.15, 0.48 - (p.ability - 63) * 0.015);
          const er = Math.max(0, Math.round((outs / 3) * erRate + (rng.next() - 0.5) * 1.2));
          const so = Math.min(outs, Math.max(1, Math.round((outs / 3) * (0.85 + rng.next() * 0.4))));
          fs.G += isStarter ? 1 : 2;
          fs.outs += outs;
          fs.ER += er;
          fs.SO += so;
          if (wins >= 2 && er <= 2 && rng.next() < 0.4) fs.W += 1;
          else if (wins === 0 && er >= 3 && rng.next() < 0.35) fs.L += 1;
        }

        // Slump recovery in 2군
        if (p.form < 0 && rng.next() < 0.65) {
          p.form = Math.min(2, p.form + 1);
        }
        // Youth experience gain in Futures
        if (p.age <= 23 && p.potential - p.ability >= 5 && rng.next() < 0.06) {
          p.ability = Math.min(p.potential, p.ability + 1);
        }
      }
    };

    updateFuturesTeam(rosterA, winsA);
    updateFuturesTeam(rosterB, winsB);
    if (teamA === '울산') simulateUlsanWhalesFuturesStats(next, rng, dateStr, winsA);
    if (teamB === '울산') simulateUlsanWhalesFuturesStats(next, rng, dateStr, winsB);
  }

  // Check 1.5-year (216G) Sangmu military discharges during the regular season
  processSangmuDischarges(next, rng, dateStr);
}

/**
 * 감독·코치 3연전 피드백 및 실시간 컨디션 저하 선수 교체 추천 리포트 생성
 */
export function generatePostSeriesCoachFeedbackAndReports(
  next: CareerSave,
  playerTeamGames: GameRecord[],
  rainoutCountInSeries: number
): { feedback: SeriesFeedback; reports: CoachSwapReport[] } {
  ensureFranchiseState(next);
  const myTeam = next.playerTeamId;
  const staff = next.coaches[myTeam] ?? [];
  const manager = staff.find((c) => c.role === '감독');
  const hitCoach = staff.find((c) => c.role === '타격코치');
  const pitchCoach = staff.find((c) => c.role === '투수코치');

  const wins = playerTeamGames.filter((g) => g.winner === myTeam).length;
  const losses = playerTeamGames.filter((g) => g.loser === myTeam).length;
  const runsFor = playerTeamGames.reduce(
    (s, g) => s + (g.homeTeam === myTeam ? g.homeRuns : g.awayRuns),
    0
  );
  const runsAgainst = playerTeamGames.reduce(
    (s, g) => s + (g.homeTeam === myTeam ? g.awayRuns : g.homeRuns),
    0
  );

  const styleTag = manager?.tacticalStyle ? `[${manager.tacticalStyle}]` : '';
  const summary =
    wins === 3
      ? `${manager?.name ?? '감독'} ${styleTag}: 완벽한 스윕입니다. 선수단 집중력과 경기 운영이 이상적으로 맞아떨어졌습니다.`
      : wins === 2
      ? `${manager?.name ?? '감독'} ${styleTag}: 위닝 시리즈를 확보했습니다. 핵심 승부처에서 집중력이 돋보였습니다.`
      : wins === 1
      ? `${manager?.name ?? '감독'} ${styleTag}: 루징 시리즈로 아쉽습니다. 컨디션이 떨어진 자원의 조정이 필요합니다.`
      : `${manager?.name ?? '감독'} ${styleTag}: 스윕패는 무겁게 받아들여야 합니다. 타순과 불펜 운용을 재정비하겠습니다.`;

  const offenseNote =
    runsFor >= 16
      ? `${hitCoach?.name ?? '타격코치'}: 3경기 ${runsFor}득점으로 타선 응집력이 매우 높았습니다.`
      : runsFor <= 8
      ? `${hitCoach?.name ?? '타격코치'}: 3경기 ${runsFor}득점 빈타에 그쳤습니다. 폼 저하 주전의 휴식 또는 2군 콜업을 권고합니다.`
      : `${hitCoach?.name ?? '타격코치'}: 3경기 ${runsFor}득점으로 무난한 흐름이며 득점권 집중력을 더 끌어올릴 필요가 있습니다.`;

  const pitchingNote =
    runsAgainst <= 9
      ? `${pitchCoach?.name ?? '투수코치'}: 3경기 ${runsAgainst}실점으로 선발·불펜 밸런스가 탄탄했습니다.`
      : runsAgainst >= 18
      ? `${pitchCoach?.name ?? '투수코치'}: 3경기 ${runsAgainst}실점으로 마운드 피로도가 누적됐습니다. 필승조 휴식이 시급합니다.`
      : `${pitchCoach?.name ?? '투수코치'}: 3경기 ${runsAgainst}실점을 기록했습니다. 투구 수 관리와 불펜 분업을 점검하겠습니다.`;

  const nextSeriesFocus =
    runsAgainst >= 16
      ? '불펜 피로 회복 및 2군 컨디션 우수 투수 콜업 검토'
      : runsFor <= 9
      ? '상위 타순 재배치 및 폼 양호 벤치 자원 선발 기용'
      : '상승세 유지 · 주전 체력 안배와 스윕 흐름 이어가기';

  const feedback: SeriesFeedback = {
    managerName: manager?.name ?? '구단 감독',
    summary,
    offenseNote,
    pitchingNote,
    nextSeriesFocus,
    rainoutNote:
      rainoutCountInSeries > 0
        ? `이번 시리즈 우천 취소(${rainoutCountInSeries}회)로 투수진 체력이 추가 회복되었으며 잔여 일정으로 재편성되었습니다.`
        : undefined,
  };

  // Detect slumping 1군 starters/pitchers (form <= -2 or fatigue >= 70) and suggest hot replacements
  const reports: CoachSwapReport[] = [];
  const tState = next.teams[myTeam];
  const teamPlayers = Object.values(next.players).filter(
    (p) => p.teamId === myTeam && !p.injury && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적' && p.rosterTier !== '제외후보' && !isMilitaryServing(p.militaryStatus)
  );

  // Check slumping hitters in lineup
  const slumpingLineup = tState.lineupOrder
    .map((id) => next.players[id])
    .filter((p): p is Player => Boolean(p && !p.injury && (p.form <= -2 || p.fatigue >= 68)))
    .sort((a, b) => a.form - b.form);

  const hotHitterPool = teamPlayers
    .filter((p) => p.role === '타자' && !tState.lineupOrder.includes(p.id) && p.form >= 0)
    .sort((a, b) => b.form * 4 + b.ability - (a.form * 4 + a.ability));

  if (slumpingLineup[0] && hotHitterPool[0]) {
    const slump = slumpingLineup[0];
    const rec = hotHitterPool[0];
    reports.push({
      id: `cr-hit-${next.gamesPlayed}-${slump.id}`,
      coachName: hitCoach?.name ?? manager?.name ?? '타격코치',
      coachRole: hitCoach ? '타격코치' : '감독',
      slumpingPlayerId: slump.id,
      slumpingPlayerName: slump.name,
      slumpingForm: slump.form,
      recommendedPlayerId: rec.id,
      recommendedPlayerName: rec.name,
      recommendedForm: rec.form,
      reason: `${slump.name}(컨디션 ${slump.form}, 피로 ${slump.fatigue}%)의 타격감이 저하되어 ${rec.rosterTier} ${rec.name}(컨디션 ${rec.form >= 0 ? `+${rec.form}` : rec.form}, OVR ${rec.ability}) 선발 투입을 추천합니다.`,
      applied: false,
    });
  }

  // Check slumping/fatigued pitchers in 1군
  const slumpingPitcher = [...tState.rotationOrder, ...tState.bullpenOrder]
    .map((id) => next.players[id])
    .filter((p): p is Player => Boolean(p && !p.injury && (p.form <= -2 || p.fatigue >= 72)))
    .sort((a, b) => a.form - b.form)[0];

  const hotPitcher = teamPlayers
    .filter((p) => p.role === '투수' && p.rosterTier === '2군' && p.form >= 0 && p.fatigue <= 25)
    .sort((a, b) => b.form * 4 + b.ability - (a.form * 4 + a.ability))[0];

  if (slumpingPitcher && hotPitcher) {
    reports.push({
      id: `cr-pit-${next.gamesPlayed}-${slumpingPitcher.id}`,
      coachName: pitchCoach?.name ?? manager?.name ?? '투수코치',
      coachRole: pitchCoach ? '투수코치' : '감독',
      slumpingPlayerId: slumpingPitcher.id,
      slumpingPlayerName: slumpingPitcher.name,
      slumpingForm: slumpingPitcher.form,
      recommendedPlayerId: hotPitcher.id,
      recommendedPlayerName: hotPitcher.name,
      recommendedForm: hotPitcher.form,
      reason: `${slumpingPitcher.name}(컨디션 ${slumpingPitcher.form}, 피로 ${slumpingPitcher.fatigue}%)의 구위 저하가 뚜렷합니다. 2군 ${hotPitcher.name}(컨디션 ${hotPitcher.form >= 0 ? `+${hotPitcher.form}` : hotPitcher.form}, OVR ${hotPitcher.ability})와 엔트리 교체를 건의합니다.`,
      applied: false,
    });
  }

  next.coachSwapReports = reports;
  return { feedback, reports };
}

/**
 * 감독·코치 교체 추천을 1클릭으로 실제 로스터/라인업에 반영
 */
export function applyCoachSwapRecommendation(
  career: CareerSave,
  reportId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const report =
    next.coachSwapReports?.find((r) => r.id === reportId) ??
    next.lastSeriesReport?.coachReports?.find((r) => r.id === reportId);
  if (!report || report.applied) {
    throw new Error('이미 적용되었거나 유효하지 않은 코치 교체 리포트입니다.');
  }

  const slump = next.players[report.slumpingPlayerId];
  const rec = next.players[report.recommendedPlayerId];
  if (!slump || !rec || slump.teamId !== next.playerTeamId || rec.teamId !== next.playerTeamId) {
    throw new Error('교체 대상 선수가 현재 구단 로스터에 존재하지 않습니다.');
  }

  const t = next.teams[next.playerTeamId];

  if (slump.role === '타자' && rec.role === '타자') {
    const idx = t.lineupOrder.indexOf(slump.id);
    if (rec.rosterTier === '2군') {
      slump.rosterTier = '2군';
      slump.gameDayActive = false;
      rec.rosterTier = '1군';
      rec.gameDayActive = true;
      if (idx >= 0) {
        t.lineupOrder[idx] = rec.id;
        t.lineupPositions[rec.id] = rec.position;
      } else {
        t.benchOrder.push(rec.id);
      }
      t.benchOrder = t.benchOrder.filter((id) => id !== slump.id && id !== rec.id);
    } else {
      if (idx >= 0) {
        t.lineupOrder[idx] = rec.id;
        t.lineupPositions[rec.id] = rec.position;
        t.benchOrder = t.benchOrder.filter((id) => id !== rec.id);
        t.benchOrder.push(slump.id);
      }
    }
  } else if (slump.role === '투수' && rec.role === '투수') {
    const rotIdx = t.rotationOrder.indexOf(slump.id);
    const bpIdx = t.bullpenOrder.indexOf(slump.id);
    slump.rosterTier = '2군';
    slump.gameDayActive = false;
    rec.rosterTier = '1군';
    rec.gameDayActive = true;
    if (rotIdx >= 0) {
      t.rotationOrder[rotIdx] = rec.id;
      rec.pitchRole = '선발';
    } else if (bpIdx >= 0) {
      t.bullpenOrder[bpIdx] = rec.id;
    } else {
      t.bullpenOrder.push(rec.id);
    }
  }

  // Mark applied in both places
  for (const r of next.coachSwapReports ?? []) {
    if (r.id === reportId) r.applied = true;
  }
  for (const r of next.lastSeriesReport?.coachReports ?? []) {
    if (r.id === reportId) r.applied = true;
  }

  next.transactionLogs.unshift({
    id: `tx-coach-swap-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '엔트리',
    teamId: next.playerTeamId,
    summary: `코칭스태프 건의 수용: ${slump.name} ↔ ${rec.name} 교체`,
    detail: `${report.coachRole} ${report.coachName}의 실시간 컨디션 리포트 반영 완료`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 3연전 종료 후: 팬 여론, 이달의 선수, 구단 사건, 선수 불만/이적요청, 외국인 적응도,
 * 해외 스카우트 완료, AI 웨이버 공시, 트로피 해금, 뉴스 생성
 */
export function processSeriesEventsAndComplaints(
  next: CareerSave,
  rng: SeededRng,
  dateStr: string,
  playerTeamGames: GameRecord[]
): void {
  ensureFranchiseState(next);
  const myTeam = next.playerTeamId;
  const tState = next.teams[myTeam];
  const standings = computeStandings(next.gamesLedger);
  const myRow = standings.find((r) => r.teamId === myTeam);
  const wins = playerTeamGames.filter((g) => g.winner === myTeam).length;
  const losses = playerTeamGames.filter((g) => g.loser === myTeam).length;

  // 1. Fan Sentiment update
  const policy = next.finances.ticketPricePolicy ?? '표준';
  const policyDelta = TICKET_PRICE_CONFIG[policy].sentimentDelta;
  const opp =
    playerTeamGames[0]?.awayTeam === myTeam
      ? playerTeamGames[0]?.homeTeam
      : playerTeamGames[0]?.awayTeam;
  const rivalryProfile = opp ? getRivalryEffectProfile(next, myTeam, opp) : null;
  const rivalryName = rivalryProfile?.rivalry.name ?? null;
  let sentimentDelta = (wins - losses) * 2 + (policyDelta > 0 ? 1 : policyDelta < 0 ? -1 : 0);
  if (rivalryProfile) {
    if (wins >= 2) {
      sentimentDelta += Math.round(3 * rivalryProfile.sentimentMult);
      tState.popularity = Math.min(100, (tState.popularity ?? 70) + (rivalryProfile.tier === '숙적' ? 3 : 2));
    } else if (losses >= 2) {
      sentimentDelta -= Math.round(2.5 * rivalryProfile.sentimentMult);
      tState.popularity = Math.max(30, (tState.popularity ?? 70) - (rivalryProfile.tier === '숙적' ? 2 : 1));
    }
  }
  if (wins === 3) sentimentDelta += 2;

  tState.fanSentiment = Math.max(15, Math.min(100, (tState.fanSentiment ?? 65) + sentimentDelta));
  tState.fanSentimentReason =
    rivalryName && wins >= 2
      ? `[${rivalryName}] 위닝시리즈로 팬 열기·인기도 급상승`
      : rivalryName && losses >= 2
      ? `[${rivalryName}] 루징시리즈로 라이벌전 자존심 타격`
      : wins === 3
      ? `${opp} 3연전 스윕 달성에 팬덤 환호`
      : losses === 3
      ? `${opp} 3연전 스윕패로 팬 여론 악화`
      : `최근 시리즈 ${wins}승 ${losses}패 (${policy} 티켓 정책)`;

  // Owner trust live update (rivalry wins/losses carry extra weight with ownership)
  if (next.ownerEval && myRow) {
    const rankGap = next.ownerEval.targetRank - myRow.rank;
    let trustDelta = rankGap >= 0 ? (wins >= 2 ? 2 : 0) : wins === 0 ? -3 : -1;
    if (rivalryProfile && wins >= 2) trustDelta += 2;
    if (rivalryProfile && losses === 3) trustDelta -= 2;
    next.ownerEval.ownerTrust = Math.max(10, Math.min(100, next.ownerEval.ownerTrust + trustDelta));
  }

  // Headline news for sweep or rivalry clash
  if (wins === 3 && opp) {
    pushNews(next, {
      date: dateStr,
      category: '경기·시리즈',
      headline: rivalryName
        ? `[${rivalryName} 스윕] ${KBO_TEAMS[myTeam].shortName}, 숙적 ${KBO_TEAMS[opp].shortName} 3연전 완파`
        : `[스윕] ${KBO_TEAMS[myTeam].shortName}, ${KBO_TEAMS[opp].shortName} 3연전 싹쓸이… 리그 ${myRow?.rank ?? '-'}위 질주`,
      body: `${KBO_TEAMS[myTeam].name}이(가) ${rivalryName ? `[${rivalryName}] ` : ''}${opp}와의 3연전을 모두 쓸어 담으며 팬덤 열기와 구단 인기도를 크게 끌어올렸습니다.`,
      teamId: myTeam,
      isHighlight: true,
    });
    unlockTrophy(next, {
      title: rivalryName ? `${rivalryName} 스윕` : '3연전 스윕 달성',
      category: '시즌기록',
      description: `${KBO_TEAMS[opp].shortName} 상대 3연전 전승 스윕`,
      earnedDate: dateStr,
    });
  } else if (rivalryProfile && wins >= 2 && opp) {
    pushNews(next, {
      date: dateStr,
      category: '경기·시리즈',
      headline: `[${rivalryProfile.rivalry.name}] ${KBO_TEAMS[myTeam].shortName}, ${KBO_TEAMS[opp].shortName}전 위닝시리즈 확보 (열기 ${rivalryProfile.rivalry.intensity})`,
      body: `관중 열기와 선수단 투지가 폭발한 라이벌 시리즈에서 ${KBO_TEAMS[myTeam].shortName}이(가) ${wins}승 ${losses}패로 우세를 점하며 팬 여론이 크게 상승했습니다.`,
      teamId: myTeam,
      isHighlight: true,
    });
  } else if (losses === 3 && opp) {
    pushNews(next, {
      date: dateStr,
      category: '경기·시리즈',
      headline: rivalryName
        ? `[${rivalryName} 충격패] ${KBO_TEAMS[myTeam].shortName}, ${KBO_TEAMS[opp].shortName}전 3연패`
        : `[위기] ${KBO_TEAMS[myTeam].shortName}, ${KBO_TEAMS[opp].shortName}전 3연패… 팬 여론 냉각`,
      body: `타선 침묵과 마운드 난조 속에 스윕패를 당하며 단장실의 결단이 요구되고 있습니다.`,
      teamId: myTeam,
    });
  }

  // Check winning streak & cash milestones for Trophies
  if (myRow && myRow.streak.endsWith('연승')) {
    const stNum = Number.parseInt(myRow.streak, 10);
    if (stNum >= 7) {
      unlockTrophy(next, {
        title: `${stNum}연승 파죽지세`,
        category: '시즌기록',
        description: `정규시즌 파죽의 ${stNum}연승 행진 달성`,
        earnedDate: dateStr,
      });
    }
  }
  if (
    next.finances.cashBalanceBillion !== null &&
    next.finances.seasonRevenueBillion - next.finances.seasonExpenseBillion >= 80
  ) {
    unlockTrophy(next, {
      title: '흑자 경영 명문 구단',
      category: '경영',
      description: '단일 시즌 순수익 +80억 원 이상 달성',
      earnedDate: dateStr,
    });
  }

  // 2. Foreign & Asia-quota KBO adaptation evolution across ALL 10 clubs (성공/부진/적응난항 분기 + 교체 검토 경고)
  for (const p of Object.values(next.players)) {
    if ((p.category === '외국인' || p.category === '아시아쿼터') && p.rosterTier === '1군') {
      const cur = p.kboAdaptation ?? (p.category === '아시아쿼터' ? 76 : 68);
      const profile = p.foreignAdaptationProfile ?? '표준';
      let delta = rng.int(1, 4);
      if (profile === '빠른적응') delta += 2;
      else if (profile === '기복') delta = rng.int(-3, 5);
      else if (profile === '적응난항') delta = rng.int(-4, 2);

      // 실제 성적 부진 시 KBO 적응도 하락 및 교체 검토 플래그 설정
      let isSlumping = false;
      if (p.role === '투수') {
        const ps = p.stats as PitcherStats;
        const era = calcERA(ps.ER, ps.outs);
        if ((ps.outs ?? 0) >= 60 && era !== null && era >= 5.1) isSlumping = true;
      } else {
        const bs = p.stats as BatterStats;
        const ops = calcOPS(bs);
        if ((bs.PA ?? 0) >= 75 && ops !== null && ops <= 0.67) isSlumping = true;
      }
      if (isSlumping) delta -= 3;

      p.kboAdaptation = Math.max(30, Math.min(100, cur + delta));
      const longInjury = Boolean(p.injury && p.injury.daysRemaining >= 42);
      if (p.teamId === myTeam && (isSlumping || longInjury || p.kboAdaptation <= 48) && !p.foreignReplacementReviewFlagged) {
        p.foreignReplacementReviewFlagged = true;
        pushNews(next, {
          date: dateStr,
          category: '구단사건',
          headline: `[외국인 교체 검토] ${p.name}(${p.category}) ${longInjury ? '장기 부상(6주+)' : 'KBO 적응 난항·성적 부진'}`,
          body: `${p.name} 선수의 KBO 적응도(${p.kboAdaptation}) 및 경기력이 기준치를 밑돌고 있습니다. 스카우트팀은 ${longInjury ? '6주 부상 대체 외국인 규정' : '시즌 교체 쿼터(최대 2회)'} 활용을 검토할 것을 권고합니다.`,
          teamId: myTeam,
          isHighlight: true,
        });
      }
    }
  }

  // 3. Complete overseas scout dispatch missions
  for (const m of next.scoutMissions ?? []) {
    if (m.status === '진행중' && next.gamesPlayed >= m.completedRound) {
      m.status = '완료';
      if (m.discoveredCandidate) {
        if (!next.virtualForeignMarket) next.virtualForeignMarket = [];
        next.virtualForeignMarket.unshift(m.discoveredCandidate);
        pushNews(next, {
          date: dateStr,
          category: '이적·계약',
          headline: `[해외 스카우트 보고] ${m.region} 파견단, ${m.discoveredCandidate.name}(${m.discoveredCandidate.position}) 발굴`,
          body: `스카우트 파견 결과 능력치 ${m.discoveredCandidate.ability}/잠재 ${m.discoveredCandidate.potential} (${m.discoveredCandidate.scoutConfidence ?? '정밀'}) 평가 선수가 외국인 영입 시장에 등록되었습니다.`,
          teamId: myTeam,
          isHighlight: true,
        });
      }
    }
  }

  // 4. Monthly MVP Award (every 24 games: 24, 48, 72, 96, 120, 144)
  if (next.gamesPlayed > 0 && next.gamesPlayed % 24 === 0) {
    const monthNum = Math.min(9, 3 + Math.round(next.gamesPlayed / 24));
    const batters = Object.values(next.players).filter((p) => p.role === '타자' && p.rosterTier === '1군');
    const pitchers = Object.values(next.players).filter((p) => p.role === '투수' && p.rosterTier === '1군');

    const topBat = [...batters].sort((a, b) => {
      const sb = b.stats as BatterStats;
      const sa = a.stats as BatterStats;
      return ((sb.HR ?? 0) * 3 + (sb.RBI ?? 0) + (calcOPS(sb) ?? 0.6) * 25) - ((sa.HR ?? 0) * 3 + (sa.RBI ?? 0) + (calcOPS(sa) ?? 0.6) * 25);
    })[0];
    const topPit = [...pitchers].sort((a, b) => {
      const pb = b.stats as PitcherStats;
      const pa = a.stats as PitcherStats;
      const eraB = calcERA(pb.ER, pb.outs) ?? 5;
      const eraA = calcERA(pa.ER, pa.outs) ?? 5;
      return ((pb.W ?? 0) * 6 + (pb.SO ?? 0) * 0.25 + Math.max(0, 5 - eraB) * 6) - ((pa.W ?? 0) * 6 + (pa.SO ?? 0) * 0.25 + Math.max(0, 5 - eraA) * 6);
    })[0];

    if (topBat && topPit) {
      const isMyAward = topBat.teamId === myTeam || topPit.teamId === myTeam;
      if (topBat.teamId === myTeam) {
        topBat.morale = '만족';
        topBat.form = Math.min(5, topBat.form + 2);
      }
      if (topPit.teamId === myTeam) {
        topPit.morale = '만족';
        topPit.form = Math.min(5, topPit.form + 2);
      }
      pushNews(next, {
        date: dateStr,
        category: '수상·이달의선수',
        headline: `[${monthNum}월 MVP] 타자 ${topBat.name}(${topBat.teamId}) · 투수 ${topPit.name}(${topPit.teamId}) 선정`,
        body: `KBO ${monthNum}월 월간 MVP에 ${topBat.teamId} ${topBat.name}과 ${topPit.teamId} ${topPit.name}이 나란히 이름을 올렸습니다.`,
        teamId: isMyAward ? myTeam : topBat.teamId,
        isHighlight: isMyAward,
      });
      if (isMyAward) {
        next.clubEvents!.unshift({
          id: `ev-potm-${next.gamesPlayed}`,
          date: dateStr,
          type: '이달의선수',
          title: `${monthNum}월 KBO 이달의 선수 배출!`,
          description: `우리 구단 소속 ${topBat.teamId === myTeam ? topBat.name : topPit.name} 선수가 월간 MVP에 선정되며 팬 여론(+5)과 선수단 사기가 크게 올랐습니다.`,
          resolved: true,
          resolutionSummary: '팬 여론 +5 · 구단 인기도 +3 · 수상 선수 컨디션 +2',
        });
        tState.fanSentiment = Math.min(100, (tState.fanSentiment ?? 65) + 5);
        tState.popularity = Math.min(100, tState.popularity + 3);
      }
    }
  }

  // 5. Random Interactive Club Event (~30% per series if < 2 unresolved)
  const unresolvedEvents = (next.clubEvents ?? []).filter((e) => !e.resolved);
  if (unresolvedEvents.length < 2 && rng.next() < 0.32) {
    const my1st = Object.values(next.players).filter((p) => p.teamId === myTeam && p.rosterTier === '1군' && !p.injury);
    const myYouth = Object.values(next.players).filter((p) => p.teamId === myTeam && p.age <= 24 && p.rosterTier !== '은퇴');
    const roll = rng.next();

    if (roll < 0.25 && myYouth.length > 0) {
      const target = rng.pick(myYouth);
      const ev: ClubEventRecord = {
        id: `ev-breakout-${next.gamesPlayed}-${target.id}`,
        date: dateStr,
        type: '깜짝성장',
        title: `깜짝 성장 조짐: ${target.name}(${target.age}세) 잠재력 폭발`,
        description: `코칭스태프 보고에 따르면 ${target.name} 선수가 최근 훈련에서 폭발적인 성장세를 보이고 있습니다. 집중 육성 프로그램을 배정할까요?`,
        targetPlayerId: target.id,
        choices: [
          { id: 'INVEST_GROWTH', label: '전담 코칭 투입 (-2.0억)', effectPreview: '능력치 +2 · 잠재력 +1 · 컨디션 +2' },
          { id: 'STANDARD_GROWTH', label: '기존 훈련 유지 (무료)', effectPreview: '능력치 +1 · 컨디션 +1' },
        ],
        resolved: false,
      };
      next.clubEvents!.unshift(ev);
      pushNews(next, {
        date: dateStr,
        category: '구단사건',
        headline: `[유망주 스포트라이트] ${KBO_TEAMS[myTeam].shortName} ${target.name}, 급성장세에 프런트 주목`,
        body: ev.description,
        teamId: myTeam,
      });
    } else if (roll < 0.5 && my1st.length > 0) {
      const target = rng.pick(my1st);
      const ev: ClubEventRecord = {
        id: `ev-slump-${next.gamesPlayed}-${target.id}`,
        date: dateStr,
        type: '선수부진',
        title: `주전 부진 위기: ${target.name} 타격/투구 밸런스 난조`,
        description: `${target.name} 선수가 최근 심리적 압박과 밸런스 흔들림으로 자신감이 크게 떨어졌습니다. 단장의 대응을 선택하세요.`,
        targetPlayerId: target.id,
        choices: [
          { id: 'MENTAL_CARE', label: '심리 상담·휴식 부여 (-1.0억)', effectPreview: '컨디션 +2 · 피로 -15 · 사기 만족' },
          { id: 'DEMOTE_RESET', label: '2군 재조정 지시', effectPreview: '2군 이동 · 재활/재조정 후 폼 회복' },
          { id: 'PUSH_THROUGH', label: '1군 출전 강행', effectPreview: '현재 라인업 유지 · 컨디션 -1 위험' },
        ],
        resolved: false,
      };
      next.clubEvents!.unshift(ev);
    } else if (roll < 0.75 && my1st.length > 0) {
      const target = rng.pick(my1st);
      const ev: ClubEventRecord = {
        id: `ev-conflict-${next.gamesPlayed}-${target.id}`,
        date: dateStr,
        type: '코치갈등',
        title: `코칭스태프-선수 갈등: ${target.name} 훈련 방식 이견`,
        description: `${target.name} 선수와 담당 코치 사이에 기용 및 훈련 방식에 대한 의견 충돌이 발생했습니다.`,
        targetPlayerId: target.id,
        choices: [
          { id: 'MEDIATE', label: '단장 직접 중재 회식 (-1.5억)', effectPreview: '팀 분위기 [좋음] · 선수 사기 [만족]' },
          { id: 'BACK_COACH', label: '코치진 권위 지지', effectPreview: '팀 규율 유지 · 해당 선수 사기 [불만]' },
          { id: 'BACK_PLAYER', label: '선수 자율 훈련 허용', effectPreview: '선수 컨디션 +1 · 구단주 신뢰도 -2' },
        ],
        resolved: false,
      };
      next.clubEvents!.unshift(ev);
    } else {
      const ev: ClubEventRecord = {
        id: `ev-owner-invest-${next.gamesPlayed}`,
        date: dateStr,
        type: '구단주투자',
        title: '구단주 특별 운영자금 지원 제안',
        description: `${KBO_TEAMS[myTeam].name} 구단주가 시즌 흥행과 성적 반등을 위해 특별 자금 지원을 검토 중입니다.`,
        choices: [
          { id: 'ACCEPT_FUNDS', label: '특별 자금 +12억 수령 (성적 압박 ↑)', effectPreview: '보유 자금 +12억 · 구단주 기대치 상승' },
          { id: 'YOUTH_GRANT', label: '아카데미 육성 지원금 +6억 요청', effectPreview: '보유 자금 +6억 · 유망주 전원 컨디션 +1' },
        ],
        resolved: false,
      };
      next.clubEvents!.unshift(ev);
      pushNews(next, {
        date: dateStr,
        category: '구단사건',
        headline: `[프런트] ${KBO_TEAMS[myTeam].name} 구단주, 특별 투자 지원 의사 타진`,
        body: ev.description,
        teamId: myTeam,
      });
    }
  }

  // 6. Player Complaints & Trade/Posting Demands (#9)
  const existingOpen = (next.complaints ?? []).filter((c) => !c.resolved);
  for (const c of existingOpen) {
    c.unresolvedSeries += 1;
    if (c.unresolvedSeries >= 3 && c.reason !== '트레이드요구') {
      c.reason = '트레이드요구';
      c.severity = '심각';
      c.message = `${c.playerName} 선수가 면담 방치에 불만을 품고 공식적으로 타 구단 트레이드를 요구했습니다!`;
      const pl = next.players[c.playerId];
      if (pl) {
        pl.morale = '불만';
        pl.tradeRequested = true;
      }
      pushNews(next, {
        date: dateStr,
        category: '이적·계약',
        headline: `[이적 요청] ${KBO_TEAMS[myTeam].shortName} ${c.playerName}, 구단에 공식 트레이드 요청`,
        body: c.message,
        teamId: myTeam,
        isHighlight: true,
      });
    }
  }

  if (existingOpen.length < 2 && rng.next() < 0.24) {
    const alreadyIds = new Set(existingOpen.map((c) => c.playerId));
    // Check benched/2군 good player (playing time), underpaid star, or 7yr star wanting posting
    const benchStar = Object.values(next.players).find(
      (p) =>
        p.teamId === myTeam &&
        !alreadyIds.has(p.id) &&
        p.ability >= 74 &&
        !p.injury &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        !isMilitaryServing(p.militaryStatus) &&
        (p.rosterTier === '2군' || tState.benchOrder.includes(p.id))
    );
    const postingStar = Object.values(next.players).find(
      (p) =>
        p.teamId === myTeam &&
        !alreadyIds.has(p.id) &&
        p.category === '국내' &&
        p.serviceYears >= 7 &&
        p.ability >= 82 &&
        p.age <= 30 &&
        !p.postingRequested
    );
    const underpaidStar = Object.values(next.players).find(
      (p) =>
        p.teamId === myTeam &&
        !alreadyIds.has(p.id) &&
        p.category === '국내' &&
        p.rosterTier === '1군' &&
        p.ability >= 80 &&
        p.contract.annualSalary <= 2.5
    );

    if (postingStar && rng.next() < 0.4) {
      postingStar.postingRequested = true;
      next.complaints!.unshift({
        id: `cmp-post-${next.gamesPlayed}-${postingStar.id}`,
        playerId: postingStar.id,
        playerName: postingStar.name,
        position: postingStar.position,
        reason: '포스팅희망',
        severity: '경고',
        message: `${postingStar.name}(${postingStar.age}세, ${postingStar.serviceYears}년차) 선수가 시즌 종료 후 MLB 포스팅 도전에 구단의 적극적인 지원을 요청했습니다.`,
        createdDate: dateStr,
        unresolvedSeries: 0,
      });
    } else if (benchStar) {
      benchStar.morale = '불만';
      next.complaints!.unshift({
        id: `cmp-pt-${next.gamesPlayed}-${benchStar.id}`,
        playerId: benchStar.id,
        playerName: benchStar.name,
        position: benchStar.position,
        reason: '출장기회',
        severity: '경고',
        message: `${benchStar.name}(능력치 ${benchStar.ability}) 선수가 현재 ${benchStar.rosterTier === '2군' ? '2군 체류' : '벤치 대기'}에 불만을 표하며 1군 출장 기회 보장을 요청했습니다.`,
        createdDate: dateStr,
        unresolvedSeries: 0,
      });
    } else if (underpaidStar) {
      underpaidStar.morale = '불만';
      next.complaints!.unshift({
        id: `cmp-sal-${next.gamesPlayed}-${underpaidStar.id}`,
        playerId: underpaidStar.id,
        playerName: underpaidStar.name,
        position: underpaidStar.position,
        reason: '연봉불만',
        severity: '경고',
        message: `${underpaidStar.name}(능력치 ${underpaidStar.ability}, 현 연봉 ${underpaidStar.contract.annualSalary}억) 선수가 팀 내 기여도에 걸맞은 연봉 인상 면담을 요청했습니다.`,
        createdDate: dateStr,
        unresolvedSeries: 0,
      });
    }
  }

  // 7. KBO 웨이버 7일 공시·성적 역순 클레임·미영입 자유계약·독립리그/은퇴 라이프사이클은
  //    simulator.ts의 processWaiverLifecycleInPlace에서 사용자·AI 10구단 공통 규칙으로 통합 처리합니다.
}

export function resolveClubEventChoice(
  career: CareerSave,
  eventId: string,
  choiceId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const deepRes = resolveDeepClubEvent(career, eventId, choiceId);
  if (deepRes) {
    return { nextCareer: deepRes.nextCareer, backupSnapshot: deepRes.backupSnapshot };
  }
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const ev = next.clubEvents!.find((e) => e.id === eventId);
  if (!ev || ev.resolved) {
    throw new Error('이미 처리되었거나 찾을 수 없는 구단 사건입니다.');
  }

  const myTeam = next.playerTeamId;
  const tState = next.teams[myTeam];
  const target = ev.targetPlayerId ? next.players[ev.targetPlayerId] : undefined;

  const spendCash = (amt: number) => {
    if (next.finances.cashBalanceBillion !== null) {
      if (next.finances.cashBalanceBillion < amt) {
        throw new Error(`보유 자금(${next.finances.cashBalanceBillion.toFixed(2)}억)이 부족합니다 (필요 ${amt}억).`);
      }
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - amt).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + amt).toFixed(2));
    }
  };

  let summary = '사건 처리 완료';

  if (choiceId === 'INVEST_GROWTH' && target) {
    spendCash(2.0);
    target.potential = Math.min(97, target.potential + 1);
    target.ability = Math.min(target.potential, target.ability + 2);
    target.form = Math.min(5, target.form + 2);
    summary = `${target.name} 전담 육성 투입 (-2.0억) → 능력치 ${target.ability}, 잠재력 ${target.potential}`;
  } else if (choiceId === 'STANDARD_GROWTH' && target) {
    target.ability = Math.min(target.potential, target.ability + 1);
    target.form = Math.min(5, target.form + 1);
    summary = `${target.name} 자연 성장 반영 → 능력치 ${target.ability}`;
  } else if (choiceId === 'MENTAL_CARE' && target) {
    spendCash(1.0);
    target.form = Math.min(5, target.form + 2);
    target.fatigue = Math.max(0, target.fatigue - 15);
    target.morale = '만족';
    summary = `${target.name} 심리·컨디셔닝 지원 (-1.0억) → 폼 회복`;
  } else if (choiceId === 'DEMOTE_RESET' && target) {
    target.rosterTier = '2군';
    target.gameDayActive = false;
    tState.lineupOrder = tState.lineupOrder.filter((id) => id !== target.id);
    tState.benchOrder = tState.benchOrder.filter((id) => id !== target.id);
    tState.rotationOrder = tState.rotationOrder.filter((id) => id !== target.id);
    tState.bullpenOrder = tState.bullpenOrder.filter((id) => id !== target.id);
    target.form = Math.min(2, target.form + 1);
    summary = `${target.name} 2군 퓨처스 재조정 이동`;
  } else if (choiceId === 'PUSH_THROUGH' && target) {
    target.form = Math.max(-5, target.form - 1);
    summary = `${target.name} 1군 출전 유지 (컨디션 부담 -1)`;
  } else if (choiceId === 'MEDIATE') {
    spendCash(1.5);
    tState.atmosphere = '좋음';
    if (target) target.morale = '만족';
    summary = '단장 직접 중재 성공 (-1.5억) · 팀 분위기 [좋음]';
  } else if (choiceId === 'BACK_COACH') {
    if (target) target.morale = '불만';
    if (next.ownerEval) next.ownerEval.ownerTrust = Math.min(100, next.ownerEval.ownerTrust + 2);
    summary = '코칭스태프 권위 지지 · 선수단 규율 확립';
  } else if (choiceId === 'BACK_PLAYER') {
    if (target) {
      target.morale = '만족';
      target.form = Math.min(5, target.form + 1);
    }
    if (next.ownerEval) next.ownerEval.ownerTrust = Math.max(10, next.ownerEval.ownerTrust - 2);
    summary = '선수 자율 훈련 허용 · 선수 컨디션 상승';
  } else if (choiceId === 'ACCEPT_FUNDS') {
    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion + 12).toFixed(2));
    }
    next.finances.seasonRevenueBillion = Number((next.finances.seasonRevenueBillion + 12).toFixed(2));
    if (next.ownerEval && next.ownerEval.targetRank > 1) {
      next.ownerEval.targetRank = Math.max(1, next.ownerEval.targetRank - 1);
      next.ownerEval.targetRankLabel = `구단주 추가 투자 조건: 정규시즌 ${next.ownerEval.targetRank}위 이내`;
    }
    summary = '구단주 특별 지원금 +12.0억 원 수령 (시즌 목표 순위 상향)';
  } else if (choiceId === 'YOUTH_GRANT') {
    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion + 6).toFixed(2));
    }
    next.finances.seasonRevenueBillion = Number((next.finances.seasonRevenueBillion + 6).toFixed(2));
    for (const pl of Object.values(next.players)) {
      if (pl.teamId === myTeam && pl.age <= 24) pl.form = Math.min(5, pl.form + 1);
    }
    summary = '유망주 아카데미 지원금 +6.0억 원 수령 · 유망주 컨디션 +1';
  } else if (choiceId === 'FIRE_MANAGER_NOW') {
    const standingsNow = computeStandings(next.gamesLedger);
    const myRow = standingsNow.find((r) => r.teamId === myTeam);
    const firingRec = fireAndReplaceClubManager(
      next,
      myTeam,
      '성적 부진에 따른 단장 결단 감독 경질',
      new Date().toISOString().slice(0, 10),
      myRow?.rank ?? 9,
      myRow?.pct ?? 0.38,
      false
    );
    if (next.ownerEval) next.ownerEval.ownerTrust = Math.min(100, next.ownerEval.ownerTrust + 5);
    tState.fanSentiment = Math.min(100, (tState.fanSentiment ?? 65) + 4);
    summary = firingRec
      ? `${firingRec.firedManagerName} 감독 경질 → ${firingRec.newManagerName} 신임 감독 선임 (분위기 쇄신)`
      : '감독 교체 완료';
  } else if (choiceId === 'BACK_MANAGER') {
    if (next.ownerEval) next.ownerEval.ownerTrust = Math.max(10, next.ownerEval.ownerTrust - 3);
    tState.atmosphere = '보통';
    summary = '현 감독 재신임 결정 · 선수단 안정화 및 반등 촉구';
  }

  ev.resolved = true;
  ev.resolutionSummary = summary;
  next.transactionLogs.unshift({
    id: `tx-ev-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '면담',
    teamId: myTeam,
    summary: `[구단 사건 처리] ${ev.title}`,
    detail: summary,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 선수 불만·이적 요청·포스팅 지원 해결 (#9)
 */
export function resolvePlayerComplaint(
  career: CareerSave,
  complaintId: string,
  action: '출전보장' | '연봉조정' | '포스팅지원' | '역할설명' | '트레이드수용'
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const cmp = next.complaints!.find((c) => c.id === complaintId);
  if (!cmp || cmp.resolved) {
    throw new Error('이미 해결되었거나 유효하지 않은 면담 요청입니다.');
  }

  const p = next.players[cmp.playerId];
  const myTeam = next.playerTeamId;
  const tState = next.teams[myTeam];
  let note = '';

  if (p) {
    if (action === '출전보장') {
      if (p.rosterTier === '2군') {
        p.rosterTier = '1군';
        p.gameDayActive = !p.injury;
      }
      if (p.role === '타자' && !tState.lineupOrder.includes(p.id)) {
        if (tState.lineupOrder.length >= 9) {
          const moved = tState.lineupOrder.pop();
          if (moved) tState.benchOrder.push(moved);
        }
        tState.lineupOrder.push(p.id);
        tState.lineupPositions[p.id] = p.position;
        tState.benchOrder = tState.benchOrder.filter((id) => id !== p.id);
      }
      p.morale = '만족';
      p.form = Math.min(5, p.form + 1);
      p.tradeRequested = false;
      note = `${p.name} 1군 선발/출전 기회 보장 약속 → 사기 [만족]`;
    } else if (action === '연봉조정') {
      const raise = Number(Math.max(0.8, p.ability >= 82 ? 2.0 : 1.2).toFixed(1));
      if (next.finances.cashBalanceBillion !== null) {
        if (next.finances.cashBalanceBillion < raise) {
          throw new Error(`연봉 보전 지급에 필요한 자금(${raise}억)이 부족합니다.`);
        }
        next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - raise).toFixed(2));
        next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + raise).toFixed(2));
      }
      p.contract.annualSalary = Number((p.contract.annualSalary + raise).toFixed(2));
      p.contract.totalValue = Number((p.contract.totalValue + raise).toFixed(2));
      p.morale = '만족';
      p.form = Math.min(5, p.form + 1);
      p.tradeRequested = false;
      note = `${p.name} 연봉 인상 보전 (+${raise}억 원) 합의 → 사기 [만족]`;
    } else if (action === '포스팅지원') {
      p.postingRequested = true;
      p.morale = '만족';
      p.form = Math.min(5, p.form + 2);
      p.tradeRequested = false;
      tState.fanSentiment = Math.min(100, (tState.fanSentiment ?? 65) + 3);
      note = `${p.name} 시즌 후 MLB 포스팅 전폭 지원 약속 → 선수 컨디션 +2 · 팬 여론 호평`;
    } else if (action === '트레이드수용') {
      p.tradeRequested = true;
      p.morale = '보통';
      note = `${p.name} 이적 요청 수용 — 트레이드 탭에서 타 구단 협상을 진행하세요.`;
    } else {
      p.morale = '보통';
      p.tradeRequested = false;
      note = `${p.name}에게 팀 내 역할을 성실히 설명해 불만을 진정시켰습니다.`;
    }
  }

  cmp.resolved = true;
  cmp.resolutionNote = note;
  next.transactionLogs.unshift({
    id: `tx-cmp-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '면담',
    teamId: myTeam,
    summary: `[선수 면담] ${cmp.playerName} (${action})`,
    detail: note,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 상무 야구단 입대 처리 내부 헬퍼 (복무기간 정확히 1년 6개월 = 216 정규경기)
 */
export function enlistPlayerToSangmuInternal(
  next: CareerSave,
  playerId: string,
  isAutoMandatory: boolean,
  dateStr?: string
): Player | null {
  const p = next.players[playerId];
  if (!p || !canPlayerEnlistMilitary(p, { allowPlanned: true, maxAge: 28 })) {
    return null;
  }

  const t = next.teams[p.teamId];
  const serviceGames = 216; // 1년 6개월 (1.5시즌 × 144경기)
  const totalReturnGames = next.season * 144 + next.gamesPlayed + serviceGames;
  const returnSeason = Math.floor(totalReturnGames / 144);
  const returnRound = totalReturnGames % 144;
  const nowDate = dateStr ?? `${next.season}-12-07`;

  p.militaryStatus = '복무 중';
  p.militaryChangedInGame = true;
  p.militaryEnlistDate = nowDate;
  p.militaryDischargeDate = `${returnSeason}-06-15`;
  p.militaryNote = `상무 피닉스 복무 중 (${nowDate} 입대 · ${returnSeason}년 6월 전역 예정)`;
  p.militaryEnlistedSeason = next.season;
  p.militaryEnlistedRound = next.gamesPlayed;
  p.militaryReturnSeason = returnSeason;
  p.militaryReturnRound = returnRound;
  p.rosterTier = '대기';
  p.gameDayActive = false;

  if (t) {
    t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
    t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
    t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
    t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);
  }

  const returnLabel =
    returnRound === 0 ? `${returnSeason}시즌 개막` : `${returnSeason}시즌 ${returnRound}경기 시점`;

  if (p.teamId === next.playerTeamId || isAutoMandatory) {
    pushNews(next, {
      date: nowDate,
      category: '국제·병역',
      headline: isAutoMandatory
        ? `[병역 의무 입대] ${KBO_TEAMS[p.teamId].shortName} ${p.name}(${p.age}세), 상무 피닉스 1년 6개월 입대`
        : `[상무 입대] ${KBO_TEAMS[p.teamId].shortName} ${p.name}(${p.age}세), 국군체육부대(상무 피닉스) 최종 합격`,
      body: `${p.name} 선수가 병역 의무 이행을 위해 북부리그 상무 피닉스에 입대했습니다. 1년 6개월(216경기) 동안 퓨처스리그 상무 소속으로 활약한 뒤 ${returnLabel}에 원소속팀(${KBO_TEAMS[p.teamId].shortName})으로 복귀합니다.`,
      teamId: p.teamId,
      isHighlight: p.teamId === next.playerTeamId,
    });
  }

  if (p.teamId === next.playerTeamId) {
    next.transactionLogs.unshift({
      id: `tx-sangmu-${Date.now()}-${p.id}`,
      date: nowDate,
      type: '엔트리',
      teamId: p.teamId,
      summary: `${isAutoMandatory ? '병역 연령 도래 상무 입대' : '상무 입대 확정'}: ${p.name} (${p.position}·${p.age}세) → 1년 6개월 복무 후 ${returnLabel} 복귀`,
    });
  }

  return p;
}

/**
 * 상무 야구단 입대 (#12, #23) — 1년 6개월 복무 후 원소속팀 복귀
 */
export function enlistPlayerToSangmu(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const p = next.players[playerId];
  if (!p || p.teamId !== next.playerTeamId) throw new Error('입대할 소속 선수를 찾을 수 없습니다.');
  if (p.category !== '국내') throw new Error('국내 선수만 상무 야구단에 입대할 수 있습니다 (외국인 해당 없음).');
  if (isMilitaryResolved(p.militaryStatus)) {
    throw new Error(`${p.name} 선수는 이미 병역 의무(${p.militaryStatus})가 해결되어 입대할 수 없습니다.`);
  }
  if (isMilitaryServing(p.militaryStatus)) {
    throw new Error(`${p.name} 선수는 현재 상무 피닉스에서 복무 중입니다.`);
  }
  if (!p.militaryStatus || p.militaryStatus === '미확인') {
    throw new Error(`${p.name} 선수는 병역 이행 여부가 '미확인' 상태이므로 임의로 입대 처리할 수 없습니다.`);
  }
  if (p.age > 27) throw new Error(`상무 야구단 지원 연령 제한(만 27세 이하)을 초과했습니다 (${p.age}세).`);

  enlistPlayerToSangmuInternal(next, playerId, false);

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 일정 나이(만 27세 도달) 확인된 미필 국내 선수 자동 상무 피닉스 입대 처리 (#12)
 * 군필 / 예술·체육요원 / 면제 / 해당 없음 / 복무 중 / 미확인 선수는 절대 입대 이벤트가 발생하지 않음
 */
export function processMandatorySangmuEnlistments(
  next: CareerSave,
  rng: SeededRng,
  dateStr?: string
): string[] {
  ensureFranchiseState(next);
  const enlisted: string[] = [];
  const dStr = dateStr ?? `${next.season}-03-05`;

  for (const p of Object.values(next.players)) {
    if (isEligibleForMandatoryEnlistment(p)) {
      const mustEnlist =
        p.militaryStatus === '입대 예정' || p.age >= 27 || (p.age === 26 && rng.next() < 0.3);
      if (mustEnlist) {
        const res = enlistPlayerToSangmuInternal(next, p.id, true, dStr);
        if (res && res.teamId === next.playerTeamId) {
          enlisted.push(`${res.name}(${res.age}세)`);
        }
      }
    }
  }
  return enlisted;
}

export function processSangmuDischarges(
  next: CareerSave,
  rng: SeededRng,
  dateStr?: string
): string[] {
  ensureFranchiseState(next);
  const discharged: string[] = [];
  const dStr = dateStr ?? `${next.season}-03-02`;

  for (const p of Object.values(next.players)) {
    if (!isMilitaryServing(p.militaryStatus)) continue;
    const retSeason = p.militaryReturnSeason ?? 9999;
    const retRound = p.militaryReturnRound ?? 0;
    const isDue =
      next.season > retSeason || (next.season === retSeason && next.gamesPlayed >= retRound);

    if (isDue) {
      const gain = rng.int(2, 4);
      p.militaryStatus = '군필';
      p.militaryChangedInGame = true;
      p.militaryNote = `${next.season}시즌 상무 전역 복귀 (군필)`;
      p.militaryEnlistDate = undefined;
      p.militaryDischargeDate = undefined;
      p.militaryEnlistedSeason = undefined;
      p.militaryEnlistedRound = undefined;
      p.militaryReturnSeason = undefined;
      p.militaryReturnRound = undefined;
      p.rosterTier = '2군';
      p.ability = Math.min(96, Math.min(p.potential + 1, p.ability + gain));
      p.potential = Math.max(p.potential, p.ability);
      p.morale = '만족';
      if (p.teamId === next.playerTeamId) {
        discharged.push(`${p.name}(+${gain})`);
        pushNews(next, {
          date: dStr,
          category: '국제·병역',
          headline: `[상무 전역 복귀] ${p.name}, 병역 마치고 원소속팀 ${KBO_TEAMS[p.teamId].shortName} 복귀 (능력치 +${gain})`,
          body: `북부리그 상무 피닉스에서 실전 경험을 쌓은 ${p.name} 선수가 군필 신분으로 원소속팀 ${KBO_TEAMS[p.teamId].name}에 복귀했습니다 (현재 능력치 ${p.ability}).`,
          teamId: p.teamId,
          isHighlight: true,
        });
      } else if (p.ability >= 68) {
        pushNews(next, {
          date: dStr,
          category: '국제·병역',
          headline: `[상무 전역 복귀] ${KBO_TEAMS[p.teamId].shortName} ${p.name}(${p.position}), 상무 복무 마치고 원소속팀 복귀`,
          body: `상무 피닉스에서 활약한 ${p.name} 선수가 병역을 마치고 원소속 구단 ${KBO_TEAMS[p.teamId].name}으로 복귀했습니다 (능력치 ${p.ability}).`,
          teamId: p.teamId,
        });
      }
    }
  }
  return discharged;
}

/**
 * 국가대표 현실 국제대회 일정 및 자동 차출 시스템 (#5)
 * - 2026: 3월 WBC + 9월 아시안게임(U-25, 우승 시 병역특례)
 * - 2027: 11월 WBSC 프리미어12
 * - 2028: 7월 LA 하계 올림픽 (메달 시 병역특례)
 * - 2029: 11월 APBC 아시아 프로야구 챔피언십 (U-25)
 * 이후 4년 주기로 현실 일정 순환
 */
export interface NationalTournamentScheduleItem {
  key: string;
  season: number;
  monthLabel: string;
  tournamentName: string;
  triggerRound: number;
  dateStr: string;
  ageLimit?: number;
  grantsMilitaryExemptionOnGold: boolean;
  grantsMilitaryExemptionOnMedal: boolean;
  description: string;
}

export function getScheduledNationalTournamentsForSeason(season: number): NationalTournamentScheduleItem[] {
  const mod = (((season - 2026) % 4) + 4) % 4;
  if (mod === 0) {
    return [
      {
        key: `${season}-WBC`,
        season,
        monthLabel: `${season}년 3월`,
        tournamentName: `${season} WBC (월드 베이스볼 클래식)`,
        triggerRound: 12,
        dateStr: `${season}-03-20`,
        grantsMilitaryExemptionOnGold: false,
        grantsMilitaryExemptionOnMedal: false,
        description: '최정예 프로 선수 자동 차출 · 세계 최강 국가 대항전',
      },
      {
        key: `${season}-AG`,
        season,
        monthLabel: `${season}년 9월`,
        tournamentName: `${season} 아시안게임 야구 대표팀 (U-25)`,
        triggerRound: 120,
        dateStr: `${season}-09-22`,
        ageLimit: 25,
        grantsMilitaryExemptionOnGold: true,
        grantsMilitaryExemptionOnMedal: false,
        description: '만 25세 이하 젊은 주축 자동 차출 · 금메달(우승) 시 병역 특례 부여',
      },
    ];
  }
  if (mod === 1) {
    return [
      {
        key: `${season}-P12`,
        season,
        monthLabel: `${season}년 11월`,
        tournamentName: `${season} WBSC 프리미어12`,
        triggerRound: 144,
        dateStr: `${season}-11-12`,
        grantsMilitaryExemptionOnGold: false,
        grantsMilitaryExemptionOnMedal: false,
        description: '세계랭킹 상위 12개국 최강전 · 정규시즌 종료 시점 자동 차출',
      },
    ];
  }
  if (mod === 2) {
    return [
      {
        key: `${season}-OLY`,
        season,
        monthLabel: `${season}년 7월`,
        tournamentName: `${season} 하계 올림픽 야구 대표팀`,
        triggerRound: 84,
        dateStr: `${season}-07-24`,
        grantsMilitaryExemptionOnGold: true,
        grantsMilitaryExemptionOnMedal: true,
        description: '최정예 자동 차출 · 올스타 브레이크 연계 · 동메달 이상 입상(금·은·동메달) 시 병역 면제 특례',
      },
    ];
  }
  return [
    {
      key: `${season}-APBC`,
      season,
      monthLabel: `${season}년 11월`,
      tournamentName: `${season} APBC (아시아 프로야구 챔피언십 U-25)`,
      triggerRound: 144,
      dateStr: `${season}-11-14`,
      ageLimit: 25,
      grantsMilitaryExemptionOnGold: false,
      grantsMilitaryExemptionOnMedal: false,
      description: '한·일·대만·호주 유망주 국가대표 자동 차출',
    },
  ];
}

function executeNationalTeamTournament(
  next: CareerSave,
  rng: SeededRng,
  spec: NationalTournamentScheduleItem,
  isAutoCalledUp: boolean
): NationalTeamEvent {
  ensureFranchiseState(next);
  const domesticPool = Object.values(next.players).filter(
    (p) =>
      p.category === '국내' &&
      p.rosterTier === '1군' &&
      !p.injury &&
      !isMilitaryServing(p.militaryStatus) &&
      (!spec.ageLimit || p.age <= spec.ageLimit)
  );
  const fallbackPool =
    domesticPool.length >= 12
      ? domesticPool
      : Object.values(next.players).filter(
          (p) => p.category === '국내' && p.rosterTier === '1군' && !p.injury && !isMilitaryServing(p.militaryStatus)
        );

  const topBatters = fallbackPool
    .filter((p) => p.role === '타자')
    .sort((a, b) => b.ability + b.form - (a.ability + a.form))
    .slice(0, 9);
  const topPitchers = fallbackPool
    .filter((p) => p.role === '투수')
    .sort((a, b) => b.ability + b.form - (a.ability + a.form))
    .slice(0, 7);
  const squad = [...topBatters, ...topPitchers];

  const avgOvr = squad.length > 0 ? squad.reduce((s, p) => s + p.ability, 0) / squad.length : 80;
  const scoreRoll = rng.next() + (avgOvr - 80) * 0.04;
  let resultTitle: NationalTeamEvent['resultTitle'] = '4강 진출';
  if (spec.grantsMilitaryExemptionOnMedal) {
    // 올림픽: 금메달(우승) / 은메달(준우승) / 동메달 / 4강(4위) / 조별리그 탈락
    if (scoreRoll >= 0.76) resultTitle = '우승';
    else if (scoreRoll >= 0.56) resultTitle = '준우승';
    else if (scoreRoll >= 0.34) resultTitle = '동메달';
    else if (scoreRoll >= 0.2) resultTitle = '4강 진출';
    else resultTitle = '조별리그 탈락';
  } else {
    if (scoreRoll >= 0.72) resultTitle = '우승';
    else if (scoreRoll >= 0.5) resultTitle = '준우승';
    else if (scoreRoll >= 0.28) resultTitle = '4강 진출';
    else resultTitle = '조별리그 탈락';
  }

  const mvp = squad[0];
  // 아시안게임: 금메달(우승) 시 병역 면제 / 올림픽: 동메달 이상(우승·준우승·동메달) 시 병역 면제
  const militaryExemptionGranted =
    (spec.grantsMilitaryExemptionOnGold && resultTitle === '우승') ||
    (spec.grantsMilitaryExemptionOnMedal &&
      (resultTitle === '우승' || resultTitle === '준우승' || resultTitle === '동메달'));
  const mySelected = squad.filter((p) => p.teamId === next.playerTeamId);

  // KBO 공식 국가대표 국제대회별 FA 등록 보상일수 계산 (#8)
  const compInfo = computeNationalTeamCompensationDays(spec.key, resultTitle);

  // #5: 국가대표 차출 기간 동안 정규시즌 출장 불가 처리 (대회 진행 6경기 동안 소집 -> 종료 후 자동 복귀)
  const dutyStartRound = next.gamesPlayed;
  const dutyDurationGames = next.gamesPlayed < next.totalRegularGames ? 6 : 0;
  const dutyEndRound = Math.min(next.totalRegularGames, dutyStartRound + dutyDurationGames);
  const returnDateLabel = `${next.season} R${dutyEndRound} 종료 후`;

  for (const pl of squad) {
    const ref = next.players[pl.id];
    if (!ref) continue;
    ref.fatigue = Math.min(82, ref.fatigue + 10);
    // KBO 국제대회 보상일수 실제 FA 등록일수에 가산
    ref.registrationDays = (ref.registrationDays ?? ref.serviceYears * 145) + compInfo.days;
    ref.nationalTeamBonusDays = (ref.nationalTeamBonusDays ?? 0) + compInfo.days;
    if (!ref.nationalTeamBonusLog) ref.nationalTeamBonusLog = [];
    ref.nationalTeamBonusLog.unshift({
      season: next.season,
      tournamentName: spec.tournamentName,
      resultTitle,
      daysAwarded: compInfo.days,
    });

    if (dutyDurationGames > 0 && dutyEndRound > dutyStartRound) {
      ref.nationalTeamDuty = {
        tournamentName: spec.tournamentName,
        startRound: dutyStartRound,
        endRound: dutyEndRound,
        returnDate: returnDateLabel,
      };
    }
    if (resultTitle === '우승' || resultTitle === '준우승' || resultTitle === '동메달') {
      ref.form = Math.min(5, ref.form + (resultTitle === '동메달' ? 1 : 2));
      ref.morale = '만족';
      if (ref.age <= 27 && ref.ability < ref.potential) {
        ref.ability = Math.min(ref.potential, ref.ability + 1);
      }
    }
    if (
      militaryExemptionGranted &&
      (ref.militaryStatus === '미필' || ref.militaryStatus === '입대 예정')
    ) {
      ref.militaryStatus = '예술·체육요원';
      ref.militaryChangedInGame = true;
      ref.militaryNote = `${spec.tournamentName} ${resultTitle} (예술·체육요원)`;
    }
  }

  // 해외파 한국인 선수 국가대표 합류 및 병역특례 연동 (#16)
  const overseasCallups: string[] = [];
  const overseasExempted: string[] = [];
  const overseasPool = (next.amateurAndOverseas?.overseasPlayers ?? []).filter(
    (op) =>
      op.status === '현역' &&
      op.ability >= 74 &&
      (!spec.ageLimit || op.age <= spec.ageLimit)
  );
  const pickedOverseas = [...overseasPool]
    .sort((a, b) => b.ability - a.ability)
    .slice(0, 3);
  for (const op of pickedOverseas) {
    overseasCallups.push(`${op.name}(${op.clubName})`);
    if (militaryExemptionGranted && (op.militaryStatus ?? '미필') === '미필') {
      op.militaryStatus = '면제';
      op.militaryNote = `${next.season} ${spec.tournamentName} ${resultTitle} 병역특례`;
      overseasExempted.push(op.name);
    }
  }

  // 공식 주장이 대표팀 차출된 경우 임시 주장 자동 선임 (#15)
  for (const tid of TEAM_IDS) {
    syncActingCaptainInPlace(next, tid, true);
  }

  if (dutyDurationGames > 0 && dutyEndRound > dutyStartRound) {
    next.activeNationalTeamDuty = {
      tournamentName: spec.tournamentName,
      startRound: dutyStartRound,
      endRound: dutyEndRound,
      playerIds: squad.map((p) => p.id),
    };
  }

  if (mySelected.length > 0) {
    next.teams[next.playerTeamId].popularity = Math.min(
      100,
      next.teams[next.playerTeamId].popularity + (resultTitle === '우승' ? 6 : 3)
    );
  }

  const overseasText =
    overseasCallups.length > 0
      ? ` · 해외파 합류: ${overseasCallups.join(', ')}${overseasExempted.length > 0 ? ` (해외파 병역특례: ${overseasExempted.join(', ')})` : ''}`
      : '';

  const ev: NationalTeamEvent = {
    id: `nt-${spec.key}`,
    season: next.season,
    tournamentName: spec.tournamentName,
    date: spec.dateStr,
    isAutoCalledUp,
    selectedPlayers: squad.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      teamId: p.teamId,
      position: p.position,
    })),
    resultTitle,
    mvpName: mvp ? `${mvp.name} (${mvp.teamId})` : '대표팀 주장',
    summary: `[${spec.monthLabel} ${isAutoCalledUp ? '자동 차출' : '차출 완료'}] 대한민국 대표팀이 ${spec.tournamentName}에서 [${resultTitle}] 성적을 거뒀습니다. 우리 구단 ${mySelected.length}명 차출 · 대표 전원 FA 보상일수 +${compInfo.days}일(${compInfo.ruleLabel})${overseasText}${dutyDurationGames > 0 ? ` · 소집 기간(${dutyDurationGames}경기, R${dutyEndRound}까지) 정규시즌 출장 제외 후 자동 복귀` : ''}${militaryExemptionGranted ? ' · 미필 대표 선수 병역 특례(면제) 획득!' : ''}`,
    militaryExemptionGranted,
    compensationDaysAwarded: compInfo.days,
    compensationRuleLabel: compInfo.ruleLabel,
  };

  next.nationalTeamEvents!.unshift(ev);
  pushNews(next, {
    date: spec.dateStr,
    category: '국제·병역',
    headline: `[국가대표 소집] ${spec.tournamentName} 대표팀 ${mySelected.length}명 차출 (${resultTitle} · ${dutyDurationGames > 0 ? `${dutyDurationGames}경기 결장 후 복귀` : '완료'})`,
    body: ev.summary,
    teamId: next.playerTeamId,
    isHighlight: true,
    verifiedStats: true,
    fanSentimentImpact: mySelected.length > 0 ? (resultTitle === '우승' ? 6 : 2) : 0,
    attendanceImpactPct: mySelected.length > 0 && resultTitle === '우승' ? 4 : 0,
  });

  if (resultTitle === '우승' && mySelected.length > 0) {
    unlockTrophy(next, {
      title: `${spec.tournamentName} 대표팀 우승 기여`,
      category: '국제대회',
      description: `소속 선수 ${mySelected.map((p) => p.name).join('·')} 국가대표 우승${militaryExemptionGranted ? ' 및 병역 특례' : ''}`,
      earnedDate: spec.dateStr,
    });
  }

  return ev;
}

export function checkAndAutoRunNationalTeamEvents(next: CareerSave, rng: SeededRng): NationalTeamEvent[] {
  ensureFranchiseState(next);
  const scheduled = getScheduledNationalTournamentsForSeason(next.season);
  const ran: NationalTeamEvent[] = [];
  for (const spec of scheduled) {
    const alreadyDone = (next.nationalTeamEvents ?? []).some((e) => e.id === `nt-${spec.key}`);
    if (!alreadyDone && next.gamesPlayed >= spec.triggerRound) {
      ran.push(executeNationalTeamTournament(next, rng, spec, true));
    }
  }
  return ran;
}

export function runNationalTeamTournament(
  career: CareerSave
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  ensureFranchiseState(career);
  const scheduled = getScheduledNationalTournamentsForSeason(career.season);
  const nextSpec = scheduled.find(
    (s) => !(career.nationalTeamEvents ?? []).some((e) => e.id === `nt-${s.key}`)
  );
  if (!nextSpec) {
    throw new Error(`${career.season}시즌 예정된 모든 국가대표 국제대회가 이미 완료되었습니다.`);
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);
  const rng = new SeededRng(next.rngState + next.season * 97 + nextSpec.triggerRound);

  executeNationalTeamTournament(next, rng, nextSpec, false);

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 국내 선수 방출 (웨이버 공시) & 웨이버 클레임 (#27)
 */
export function releaseDomesticPlayerToWaiver(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const pCur = career.players[playerId];
  if (!pCur || pCur.teamId !== career.playerTeamId) throw new Error('방출할 선수를 찾을 수 없습니다.');
  if (pCur.category !== '국내') throw new Error('외국인 선수는 외국인 계약 탭에서 해지하세요.');

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const dateIso = getCurrentCareerDate(next).isoDate;
  waiveDomesticPlayerInPlace(next, next.playerTeamId, playerId, {
    dateIso,
    reason: `${KBO_TEAMS[next.playerTeamId].shortName} 단장실 웨이버 공시 (7일 영입 접수)`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function claimWaiverPlayer(
  career: CareerSave,
  waiverId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  ensureFranchiseState(career);
  const target = (career.waiverPool ?? []).find((w) => w.id === waiverId);
  if (!target) throw new Error('클레임할 웨이버 선수를 찾을 수 없습니다.');
  if (target.fromTeamId === career.playerTeamId) {
    throw new Error('원소속 구단이 방출한 선수는 동일 웨이버 기간에 재클레임할 수 없습니다.');
  }
  if (
    career.finances.cashBalanceBillion !== null &&
    KBO_WAIVER_FEE_BILLION > career.finances.cashBalanceBillion
  ) {
    throw new Error(
      `보유 자금(${career.finances.cashBalanceBillion.toFixed(2)}억)이 부족합니다 (웨이버 이적료 300만 원).`
    );
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const liveTarget = (next.waiverPool ?? []).find((w) => w.id === waiverId);
  if (!liveTarget) throw new Error('클레임할 웨이버 선수를 찾을 수 없습니다.');

  const dateIso = getCurrentCareerDate(next).isoDate;
  if (!liveTarget.claimTeamIds) liveTarget.claimTeamIds = [];
  if (!liveTarget.claimTeamIds.includes(next.playerTeamId)) {
    liveTarget.claimTeamIds.push(next.playerTeamId);
  }
  awardWaiverPlayerToTeamInPlace(
    next,
    liveTarget,
    next.playerTeamId,
    dateIso,
    getTeamRetiredNumbers(next, next.playerTeamId)
  );

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 해외 스카우트 파견 (#29)
 */
const OVERSEAS_POOL_NAMES: Record<
  ScoutDispatchMission['region'],
  { names: string[]; nat: string; category: '외국인' | '아시아쿼터'; cost: number; maxUsd: number }
> = {
  '미국 AAA': {
    names: ['트레버 캘러한', '브랜든 맥코이', '콜튼 해리스', '데릭 셸비', '카일 몬토야'],
    nat: '미국',
    category: '외국인',
    cost: 4.0,
    maxUsd: 950000,
  },
  '일본 NPB 2군': {
    names: ['다카하시 렌', '야마모토 쇼타', '사토 유키', '이토 다이키', '와타나베 겐'],
    nat: '일본',
    category: '아시아쿼터',
    cost: 3.0,
    maxUsd: 190000,
  },
  '중남미 윈터리그': {
    names: ['카를로스 알바라도', '라파엘 멘도사', '호세 델가도', '루이스 카스티요 Jr.', '미겔 바르가스'],
    nat: '도미니카',
    category: '외국인',
    cost: 3.5,
    maxUsd: 880000,
  },
  '대만 CPBL': {
    names: ['린즈하오', '천관위', '왕보룽 Jr.', '황웨이청', '장위청'],
    nat: '대만',
    category: '아시아쿼터',
    cost: 2.5,
    maxUsd: 175000,
  },
};

export function dispatchOverseasScout(
  career: CareerSave,
  region: ScoutDispatchMission['region']
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const cfg = OVERSEAS_POOL_NAMES[region];
  if (career.finances.cashBalanceBillion !== null && career.finances.cashBalanceBillion < cfg.cost) {
    throw new Error(`해외 스카우트 파견 비용(${cfg.cost}억) 대비 보유 자금이 부족합니다.`);
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);
  const rng = new SeededRng(next.rngState + Date.now() % 10000);

  if (next.finances.cashBalanceBillion !== null) {
    next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - cfg.cost).toFixed(2));
    next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cfg.cost).toFixed(2));
  }

  const isPitcher = rng.next() < 0.58;
  const pos: VirtualForeignPoolItem['position'] = isPitcher
    ? rng.pick(['SP', 'SP', 'RP', 'CL'])
    : rng.pick(['RF', 'LF', '1B', '3B', 'DH']);
  const ability = cfg.category === '외국인' ? rng.int(80, 88) : rng.int(74, 82);
  const potential = Math.min(93, ability + rng.int(2, 6));
  const totalUsd =
    cfg.category === '아시아쿼터'
      ? Math.min(200000, rng.int(120000, cfg.maxUsd))
      : rng.int(650000, cfg.maxUsd);
  const bonusUsd = Math.round(totalUsd * 0.25);
  const salaryUsd = totalUsd - bonusUsd;
  const initialAdaptation = cfg.category === '아시아쿼터' ? rng.int(72, 86) : rng.int(58, 76);

  const cand: VirtualForeignPoolItem = {
    id: `scout-${region}-${Date.now()}`,
    name: rng.pick(cfg.names),
    nationality: cfg.nat,
    category: cfg.category,
    role: isPitcher ? '투수' : '타자',
    position: pos,
    age: rng.int(25, 31),
    ability,
    potential,
    scoutConfidence: rng.next() < 0.65 ? '정밀' : '보통',
    initialAdaptation,
    suggestedTotalUsd: totalUsd,
    suggestedSigningBonusUsd: bonusUsd,
    suggestedSalaryUsd: salaryUsd,
    scoutingNote: `${region} 현지 스카우트 단독 발굴 · 초기 KBO 적응도 ${initialAdaptation}% 예상`,
    isVirtual: true,
  };

  // In offseason or paused, complete immediately; during regular season complete in 2 series (6 games)
  const immediate = next.phase !== 'REGULAR_SEASON';
  const mission: ScoutDispatchMission = {
    id: `sm-${Date.now()}`,
    region,
    costBillion: cfg.cost,
    dispatchedDate: new Date().toISOString().slice(0, 10),
    completedRound: immediate ? next.gamesPlayed : next.gamesPlayed + 6,
    status: immediate ? '완료' : '진행중',
    discoveredCandidate: cand,
  };

  next.scoutMissions!.unshift(mission);
  if (immediate) {
    if (!next.virtualForeignMarket) next.virtualForeignMarket = [];
    next.virtualForeignMarket.unshift(cand);
  }

  next.transactionLogs.unshift({
    id: `tx-scout-disp-${Date.now()}`,
    date: mission.dispatchedDate,
    type: '재정',
    teamId: next.playerTeamId,
    summary: `해외 스카우트 파견: ${region} (-${cfg.cost}억 원)${immediate ? ` → ${cand.name} 즉시 발굴` : ' (2시리즈 후 리포트 도착)'}`,
  });

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * KBO 공식 국가대표 국제대회별 FA 보상일수 산정 (#8)
 * - WBC: 기본 10일 / 4강 30일 / 준우승 40일 / 우승 60일
 * - 올림픽: 기본 10일 / 4강 20일 / 동메달 35일 / 은메달 45일 / 금메달 60일
 * - 프리미어12: 기본 10일 / 4강 20일 / 준우승 30일 / 우승 40일
 * - 아시안게임: 기본 10일 / 은메달 15일 / 금메달 25일
 * - APBC: 기본 5일 / 준우승 10일 / 우승 15일
 */
export function computeNationalTeamCompensationDays(
  tournamentKey: string,
  resultTitle: string
): { days: number; ruleLabel: string } {
  const key = tournamentKey.toUpperCase();
  const isGold = resultTitle.includes('우승') || resultTitle.includes('금메달');
  const isSilver = resultTitle.includes('준우승') || resultTitle.includes('은메달');
  const isBronze = resultTitle.includes('동메달');
  const isSemi = resultTitle.includes('4강');
  const isQuarter = resultTitle.includes('8강');

  if (key.includes('WBC')) {
    if (isGold) return { days: 60, ruleLabel: 'WBC 우승 (기본 10 + 성적 50 = 60일)' };
    if (isSilver) return { days: 40, ruleLabel: 'WBC 준우승 (기본 10 + 성적 30 = 40일)' };
    if (isSemi) return { days: 30, ruleLabel: 'WBC 4강 (기본 10 + 성적 20 = 30일)' };
    if (isQuarter) return { days: 20, ruleLabel: 'WBC 8강 (기본 10 + 성적 10 = 20일)' };
    return { days: 10, ruleLabel: 'WBC 참가 기본 보상 10일' };
  }
  if (key.includes('OLY') || tournamentKey.includes('올림픽')) {
    if (isGold) return { days: 60, ruleLabel: '올림픽 금메달 (최대 60일)' };
    if (isSilver) return { days: 40, ruleLabel: '올림픽 은메달 (40일)' };
    if (isBronze) return { days: 30, ruleLabel: '올림픽 동메달 (30일)' };
    if (isSemi) return { days: 20, ruleLabel: '올림픽 4강 (20일)' };
    return { days: 10, ruleLabel: '올림픽 참가 기본 10일' };
  }
  if (key.includes('P12') || tournamentKey.includes('프리미어12')) {
    if (isGold) return { days: 40, ruleLabel: '프리미어12 우승 (40일)' };
    if (isSilver) return { days: 30, ruleLabel: '프리미어12 준우승 (30일)' };
    if (isSemi) return { days: 20, ruleLabel: '프리미어12 4강 (20일)' };
    return { days: 10, ruleLabel: '프리미어12 참가 기본 10일' };
  }
  if (key.includes('-AG') || tournamentKey.includes('아시안게임')) {
    if (isGold) return { days: 25, ruleLabel: '아시안게임 금메달 (25일)' };
    if (isSilver) return { days: 15, ruleLabel: '아시안게임 은메달 (15일)' };
    return { days: 10, ruleLabel: '아시안게임 참가 기본 10일' };
  }
  // APBC
  if (isGold) return { days: 15, ruleLabel: 'APBC 우승 (15일)' };
  if (isSilver) return { days: 10, ruleLabel: 'APBC 준우승 (10일)' };
  return { days: 5, ruleLabel: 'APBC 참가 기본 5일' };
}

/**
 * 5대 지표 기반 구단주 다면 단장 평가 리포트 (실시간 예상 & 시즌 종료 확정 공통) (#2)
 * 1) 성적 목표 달성 (40점)
 * 2) 재정 건전성 · 경쟁균형세 준수 (20점)
 * 3) 유망주 육성 · 미래 가치 (15점)
 * 4) 팬 만족도 · 관중 · 라이벌전 (15점)
 * 5) 선수단 기강 · 리더십 · 프랜차이즈 예우 (10점)
 */
export function computeLiveOwnerEvaluationReport(career: CareerSave): OwnerEvaluationBreakdown {
  const teamId = career.playerTeamId;
  const evalState = career.ownerEval ?? buildInitialOwnerEval(teamId, career.season);
  const team = career.teams[teamId];
  const standings = computeStandings(career.gamesLedger);
  const myRow = standings.find((r) => r.teamId === teamId);
  const finalRank = myRow?.rank ?? Math.min(10, Math.max(1, KBO_TEAMS[teamId].prevRank2025));
  const isChamp = career.postseason?.champion === teamId;
  const madePs = finalRank <= 5;

  const highlights: string[] = [];
  const concerns: string[] = [];

  // 1. 성적 목표 달성 (0..40)
  let performanceScore = 24;
  if (isChamp) {
    performanceScore = 40;
    highlights.push('한국시리즈 우승 달성 — 구단 최고 영예 (성적 만점)');
  } else {
    const gap = evalState.targetRank - finalRank; // positive = better than target
    performanceScore = Math.max(4, Math.min(38, 26 + gap * 4 + (madePs ? 3 : -2)));
    if (gap >= 1) {
      highlights.push(`구단주 목표(${evalState.targetRank}위 이내) 초과 달성 — 현재 ${finalRank}위`);
    } else if (gap === 0) {
      highlights.push(`구단주 순위 목표(${evalState.targetRank}위) 정확히 부합`);
    } else if (gap <= -2) {
      concerns.push(`목표(${evalState.targetRank}위 이내) 대비 ${Math.abs(gap)}계단 부진 (${finalRank}위)`);
    }
  }

  // 2. 재정 건전성 및 경쟁균형세 준수 (0..20)
  const netProfit = career.finances.seasonRevenueBillion - career.finances.seasonExpenseBillion;
  const capSummary = computeSalaryCapSummary(career, teamId);
  let financeScore = 13;
  if (netProfit >= 15) {
    financeScore += 5;
    highlights.push(`탄탄한 흑자 경영 (시즌 순수익 +${netProfit.toFixed(1)}억 원)`);
  } else if (netProfit >= 0) {
    financeScore += 2;
  } else if (netProfit < -25) {
    financeScore -= 5;
    concerns.push(`대규모 재정 적자 (${netProfit.toFixed(1)}억 원) — 비용 구조 개선 요구`);
  } else if (netProfit < -10) {
    financeScore -= 2;
  }
  if (capSummary.overCapBillion > 0) {
    financeScore -= capSummary.exceedCount >= 3 ? 7 : capSummary.exceedCount === 2 ? 4 : 2;
    concerns.push(
      `경쟁균형세 상한 ${capSummary.overCapBillion.toFixed(1)}억 초과 (예상 제재금 ${capSummary.luxuryTaxBillion.toFixed(1)}억)`
    );
  } else if (capSummary.underFloorBillion > 0) {
    financeScore -= 4;
    concerns.push(`경쟁균형세 하한액 ${capSummary.underFloorBillion.toFixed(1)}억 미달 (투자 부족 경고)`);
  } else {
    financeScore += 2;
  }
  financeScore = Math.max(2, Math.min(20, financeScore));

  // 3. 유망주 육성 및 선수단 미래 가치 (0..15)
  const myActive = Object.values(career.players).filter(
    (p) => p.teamId === teamId && (p.rosterTier === '1군' || p.rosterTier === '2군') && !isMilitaryServing(p.militaryStatus)
  );
  const youngCore = myActive.filter((p) => p.age <= 25 && p.ability >= 68);
  const grownCount = (career.growthLogs ?? []).filter((g) => g.teamId === teamId && g.delta > 0).length;
  let developmentScore = Math.min(15, Math.max(4, 6 + Math.min(5, youngCore.length) + Math.min(4, Math.floor(grownCount / 3))));
  if (youngCore.length >= 5) {
    highlights.push(`만 25세 이하 즉시전력 유망주 ${youngCore.length}명 확보 — 미래 전력 우수`);
  } else if (youngCore.length <= 1) {
    concerns.push('만 25세 이하 1군급 차세대 핵심 자원 부족');
  }

  // 4. 팬 만족도 · 관중 · 라이벌전 (0..15)
  const fanSent = team?.fanSentiment ?? 65;
  const pop = team?.popularity ?? 68;
  const rivalries = getTeamRivalries(career, teamId);
  let rivalNetWins = 0;
  for (const rv of rivalries) {
    const myW = rv.teamA === teamId ? rv.seasonWinsA : rv.seasonWinsB;
    const oppW = rv.teamA === teamId ? rv.seasonWinsB : rv.seasonWinsA;
    rivalNetWins += myW - oppW;
  }
  let fanScore = Math.round(((fanSent + pop) / 200) * 12) + (rivalNetWins > 0 ? 3 : rivalNetWins < -2 ? -2 : 1);
  fanScore = Math.max(2, Math.min(15, fanScore));
  if (fanSent >= 78) {
    highlights.push(`뜨거운 팬심(지지율 ${fanSent}) 및 구단 흥행 호조`);
  } else if (fanSent <= 45) {
    concerns.push(`팬 만족도 급락(${fanSent}/100) — 구단 이미지 회복 필요`);
  }
  if (rivalNetWins >= 3) {
    highlights.push(`주요 라이벌 상대전적 우세 (+${rivalNetWins}승)`);
  }

  // 5. 선수단 기강 · 리더십 · 프랜차이즈 예우 (0..10)
  const unresolvedComplaints = (career.complaints ?? []).filter((c) => !c.resolved).length;
  const atmBonus =
    team?.atmosphere === '좋음'
      ? 3
      : team?.atmosphere === '보통' || team?.atmosphere === '평가 대기'
      ? 1
      : -2;
  const repBonus = (team?.clubReputation ?? 70) >= 75 ? 2 : (team?.clubReputation ?? 70) < 55 ? -2 : 0;
  let leadershipScore = Math.max(1, Math.min(10, 6 + atmBonus + repBonus - unresolvedComplaints * 2));
  if (unresolvedComplaints >= 2) {
    concerns.push(`미해결 선수단 불만 ${unresolvedComplaints}건 누적 — 클럽하우스 관리 필요`);
  }

  const totalScore = Math.max(
    0,
    Math.min(100, performanceScore + financeScore + developmentScore + fanScore + leadershipScore)
  );

  let projectedGrade: OwnerEvaluationBreakdown['projectedGrade'] = 'B';
  let budgetDirective = '현행 구단 예산 기조 유지 및 효율적 전력 보강';
  let nextSeasonBudgetDeltaPct = 0;

  if (isChamp || totalScore >= 86) {
    projectedGrade = 'S';
    budgetDirective = '전폭적 우승 지원 — 차기 시즌 선수단·FA 투자 예산 +15% 확대 승인';
    nextSeasonBudgetDeltaPct = 15;
  } else if (totalScore >= 74) {
    projectedGrade = 'A';
    budgetDirective = '우수한 구단 운영 — 차기 시즌 전력 보강 예산 +8% 증액';
    nextSeasonBudgetDeltaPct = 8;
  } else if (totalScore >= 58) {
    projectedGrade = 'B';
    budgetDirective = '안정적 목표 이행 — 차기 시즌 기준 예산 유지';
    nextSeasonBudgetDeltaPct = 0;
  } else if (totalScore >= 42) {
    projectedGrade = 'C';
    budgetDirective = '성적·운영 경고 — 차기 시즌 예산 -8% 긴축 및 확실한 반등 요구';
    nextSeasonBudgetDeltaPct = -8;
  } else {
    projectedGrade = 'F';
    budgetDirective = '신임 상실 — 단장 해임 및 경영진 쇄신 검토';
    nextSeasonBudgetDeltaPct = -15;
  }

  return {
    performanceScore,
    financeScore,
    developmentScore,
    fanScore,
    leadershipScore,
    totalScore,
    projectedGrade,
    highlights: highlights.slice(0, 4),
    concerns: concerns.slice(0, 4),
    budgetDirective,
    nextSeasonBudgetDeltaPct,
  };
}

/**
 * 구단주 시즌 종료 평가 & 해임 시 타 구단 이직 (#26 + #2 다면 평가 개선)
 */
export function evaluateSeasonOwnerGrade(next: CareerSave): void {
  ensureFranchiseState(next);
  const evalState = next.ownerEval!;
  const standings = computeStandings(next.gamesLedger);
  const myRow = standings.find((r) => r.teamId === next.playerTeamId);
  const finalRank = myRow?.rank ?? 5;
  const isChamp = next.postseason.champion === next.playerTeamId;
  const netProfit = next.finances.seasonRevenueBillion - next.finances.seasonExpenseBillion;

  const breakdown = computeLiveOwnerEvaluationReport(next);
  evalState.breakdown = breakdown;

  let grade: OwnerEvaluationState['lastSeasonGrade'] = breakdown.projectedGrade;
  let verdict: OwnerEvaluationState['lastSeasonVerdict'] = '재계약';
  let comment = '';
  let trustDelta = 0;

  if (isChamp || grade === 'S') {
    grade = 'S';
    verdict = '장기 재계약';
    trustDelta = 24;
    comment = `종합 ${breakdown.totalScore}점(S등급)! ${isChamp ? '한국시리즈 우승과 함께 ' : ''}성적·재정·육성 전반에서 완벽한 성과를 거뒀습니다. ${breakdown.budgetDirective}.`;
  } else if (grade === 'A') {
    verdict = '장기 재계약';
    trustDelta = 14;
    comment = `종합 ${breakdown.totalScore}점(A등급) — 정규시즌 ${finalRank}위 및 구단 운영 전반이 구단주 기대를 상회했습니다. ${breakdown.budgetDirective}.`;
  } else if (grade === 'B') {
    verdict = '재계약';
    trustDelta = 6;
    comment = `종합 ${breakdown.totalScore}점(B등급) — 정규시즌 ${finalRank}위 · 시즌 순수익 ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(1)}억 원으로 안정적인 시즌을 보냈습니다.`;
  } else if (grade === 'C' || (finalRank <= evalState.targetRank + 2 && evalState.ownerTrust >= 38)) {
    grade = 'C';
    verdict = '유임 (경고)';
    trustDelta = -12;
    comment = `종합 ${breakdown.totalScore}점(C등급) — 정규시즌 ${finalRank}위(${breakdown.concerns[0] ?? '목표 미달'})로 경고를 받았습니다. 차기 시즌 반등이 필수입니다.`;
  } else {
    grade = 'F';
    verdict = '해임 통보';
    trustDelta = -30;
    comment = `종합 ${breakdown.totalScore}점(F등급) — 정규시즌 ${finalRank}위 부진과 다면 평가 미달로 구단주가 단장 교체를 결정했습니다. 타 KBO 구단에 지원해 새 도전을 시작할 수 있습니다.`;
  }

  evalState.lastSeasonGrade = grade;
  evalState.lastSeasonVerdict = verdict;
  evalState.evaluationComment = comment;
  evalState.ownerTrust = Math.max(5, Math.min(100, evalState.ownerTrust + trustDelta));
  evalState.isFired = grade === 'F';
  if (evalState.isFired) {
    next.gmJobOffers = generateGmJobOffers(next);
  }

  // 차기 시즌 구단주 성과급/지원금 반영 (현금 운용 모드일 때)
  if (next.finances.cashBalanceBillion !== null && (grade === 'S' || grade === 'A')) {
    const bonusGrant = grade === 'S' ? 20 : 10;
    next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion + bonusGrant).toFixed(2));
  }

  pushNews(next, {
    date: `${next.season}-11-02`,
    category: '구단사건',
    headline: `[구단주 평가] ${KBO_TEAMS[next.playerTeamId].name} 단장 시즌 성적표 [${grade}등급 · ${breakdown.totalScore}점] — ${verdict}`,
    body: `${comment} (성적 ${breakdown.performanceScore}/40 · 재정 ${breakdown.financeScore}/20 · 육성 ${breakdown.developmentScore}/15 · 팬심 ${breakdown.fanScore}/15 · 기강 ${breakdown.leadershipScore}/10)`,
    teamId: next.playerTeamId,
    isHighlight: true,
  });
}

export function applyToNewTeamAsGm(
  career: CareerSave,
  newTeamId: TeamId
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  if (newTeamId === career.playerTeamId) {
    throw new Error('이미 지휘 중인 구단입니다. 다른 KBO 구단을 선택하세요.');
  }
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const oldTeam = next.playerTeamId;
  next.playerTeamId = newTeamId;
  next.label = `${KBO_TEAMS[newTeamId].name} ${next.season} GM`;
  next.ownerEval = buildInitialOwnerEval(newTeamId, next.season);
  next.complaints = [];
  next.coachSwapReports = [];

  pushNews(next, {
    date: new Date().toISOString().slice(0, 10),
    category: '이적·계약',
    headline: `[단장 부임] ${next.gmName} 단장, ${KBO_TEAMS[oldTeam].shortName} 떠나 ${KBO_TEAMS[newTeamId].name} 신임 단장 취임`,
    body: `${KBO_TEAMS[newTeamId].name}이(가) 새 시즌 도약을 위해 ${next.gmName} 단장을 영입했습니다. 새 목표: ${next.ownerEval.targetRankLabel}`,
    teamId: newTeamId,
    isHighlight: true,
  });

  next.transactionLogs.unshift({
    id: `tx-gm-move-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '계약',
    teamId: newTeamId,
    summary: `단장 구단 이적: ${KBO_TEAMS[oldTeam].name} → ${KBO_TEAMS[newTeamId].name}`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 선수 실제 통산 기록 및 수상 이력을 기반으로 현실적인 영구결번 업적 문구 자동 생성 (#7)
 */
export function buildRealisticRetirementAchievement(player: Player, career: CareerSave): string {
  ensurePlayerRichMetadata(player);
  const live = getLiveCareerStats(player);
  const awardsCount = career.awardsHistory.reduce((acc, a) => {
    let cnt = 0;
    if (a.mvp?.playerId === player.id) cnt++;
    if (a.koreanSeriesMvp?.playerId === player.id) cnt++;
    if (a.choiDongWon?.playerId === player.id) cnt++;
    if (a.goldenGloves.some((g) => g.playerId === player.id)) cnt++;
    return acc + cnt;
  }, 0);
  const champCount = (career.championHistory ?? []).filter(
    (c) => !c.isHistoricalBaseline && c.championTeamId === player.teamId
  ).length;

  const honorTags: string[] = [];
  if (awardsCount > 0) honorTags.push(`주요 수상 ${awardsCount}회`);
  if (champCount > 0) honorTags.push(`한국시리즈 우승 ${champCount}회`);
  const honorSuffix = honorTags.length > 0 ? ` · ${honorTags.join(', ')}` : '';

  if (player.role === '타자') {
    const b = live as CareerBatterStats;
    const avg = calcAVG(b.H, b.AB);
    const avgStr = avg !== null ? avg.toFixed(3).replace(/^0/, '') : '.000';
    return `${KBO_TEAMS[player.teamId].shortName} 통산 ${b.seasons}시즌 ${b.G.toLocaleString()}경기 타율 ${avgStr} ${b.H.toLocaleString()}안타 ${b.HR}홈런 ${b.RBI.toLocaleString()}타점${honorSuffix}`;
  }

  const p = live as CareerPitcherStats;
  const era = calcERA(p.ER, p.outs);
  const eraStr = era !== null ? era.toFixed(2) : '-';
  const svPart = p.SV >= 20 ? ` ${p.SV}세이브` : '';
  return `${KBO_TEAMS[player.teamId].shortName} 통산 ${p.seasons}시즌 ${p.G.toLocaleString()}경기 ${p.W}승${svPart} ${p.SO.toLocaleString()}탈삼진 평균자책점 ${eraStr}${honorSuffix}`;
}

/**
 * 영구결번 지정 & 은퇴 레전드 명예의 전당 헌액 (#7, #31)
 */
export function retirePlayerUniformNumber(
  career: CareerSave,
  playerName: string,
  position: Position,
  uniformNumber: number,
  careerSummary?: string,
  playerId?: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  if (!playerName.trim()) throw new Error('영구결번 지정 선수 이름을 입력하세요.');
  if (uniformNumber < 0 || uniformNumber > 99) throw new Error('등번호는 0~99 사이여야 합니다.');

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const exists = next.leagueHistory!.retiredNumbers.some(
    (r) => r.teamId === next.playerTeamId && r.number === uniformNumber
  );
  if (exists) {
    throw new Error(`등번호 ${uniformNumber}번은 이미 우리 구단 영구결번으로 지정되어 있습니다.`);
  }

  const matchedPlayer =
    (playerId ? next.players[playerId] : undefined) ??
    Object.values(next.players).find(
      (p) => p.teamId === next.playerTeamId && p.name === playerName.trim()
    );

  const autoSummary = matchedPlayer
    ? buildRealisticRetirementAchievement(matchedPlayer, next)
    : `${KBO_TEAMS[next.playerTeamId].name} 프랜차이즈 레전드 (${position} · No.${uniformNumber})`;
  const finalSummary = careerSummary?.trim() ? careerSummary.trim() : autoSummary;

  next.leagueHistory!.retiredNumbers.unshift({
    teamId: next.playerTeamId,
    number: uniformNumber,
    playerName: playerName.trim(),
    position,
    retiredSeason: next.season,
    careerSummary: finalSummary,
  });

  // Strictly reassign EVERY active player on this team wearing this newly retired number (including any other retired numbers)
  enforceNoRetiredUniformNumbers(next.players, getRetiredNumbersMap(next));

  next.teams[next.playerTeamId].fanSentiment = Math.min(
    100,
    (next.teams[next.playerTeamId].fanSentiment ?? 65) + 4
  );

  pushNews(next, {
    date: new Date().toISOString().slice(0, 10),
    category: '수상·이달의선수',
    headline: `[영구결번] ${KBO_TEAMS[next.playerTeamId].name}, No.${uniformNumber} ${playerName} 영구결번 헌정`,
    body: `${finalSummary}. 구단 역사에 큰 발자취를 남긴 ${playerName} 선수의 등번호 ${uniformNumber}번이 단장 결재로 영구결번으로 지정되었습니다.`,
    teamId: next.playerTeamId,
    isHighlight: true,
    fanSentimentImpact: 4,
    attendanceImpactPct: 3,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function inductRetiredLegendsToHof(next: CareerSave, retiredPlayers: Player[]): void {
  ensureFranchiseState(next);
  for (const p of retiredPlayers) {
    if (p.ability >= 78 || (p.serviceYears >= 12 && p.ability >= 72)) {
      const already = next.leagueHistory!.hallOfFame.some((h) => h.playerId === p.id);
      if (already) continue;
      next.leagueHistory!.hallOfFame.unshift({
        playerId: p.id,
        playerName: p.name,
        teamId: p.teamId,
        position: p.position,
        inductedSeason: next.season,
        careerSummary: `${p.serviceYears}시즌 활약 · 은퇴 시 능력치 ${p.ability} · ${p.position}`,
      });
    }
  }
}

/**
 * 오프시즌 4단계 진행 (#35, #36)
 * 1. AWARDS_AND_EVAL (시상식·구단주/감독 평가)
 * 2. DOMESTIC_CONTRACTS (국내 선수 재계약·옵션 행사)
 * 3. FOREIGN_MARKET (외국인 재계약·신규 영입·해외 스카우트)
 * 4. ROOKIE_DRAFT (전년도 성적 역순 신인 드래프트)
 */
export function advanceOffseasonStep(
  career: CareerSave,
  targetStep: OffseasonStep
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  next.offseasonStep = targetStep;
  if (
    next.postseason?.champion ||
    !next.nextSeasonDraftOrder ||
    next.nextSeasonDraftOrder.length !== 10
  ) {
    next.nextSeasonDraftOrder = computeReverseDraftOrder(next);
  }

  // When entering Step 4 (ROOKIE_DRAFT), initialize next season's draft strictly in reverse order of finished season
  if (targetStep === 'ROOKIE_DRAFT') {
    const nextDraftSeason = next.season + 1;
    if (next.draftState.season !== nextDraftSeason) {
      ensureCompetitiveBalanceState(next);
      const penaltyRes = applyCompetitiveBalanceDraftPenalties(
        next,
        nextDraftSeason,
        next.nextSeasonDraftOrder
      );
      next.draftState = createFreshDraftState(
        nextDraftSeason,
        next.seed + nextDraftSeason * 13,
        penaltyRes.baseOrder
      );
      if (penaltyRes.penaltyNotes.length > 0) {
        next.draftState.round1DraftOrder = penaltyRes.round1Order;
        next.draftState.round1PenaltyNotes = penaltyRes.penaltyNotes;
      }
      next.draftState.candidates = integrateAmateurAndOverseasIntoDraftCandidates(
        next,
        next.draftState.candidates,
        nextDraftSeason
      );
      injectUndraftedUlsanPlayersIntoDraft(next, next.draftState);
      ensureDraftPickProvenanceInPlace(next);
      const r1Order = next.draftState.round1DraftOrder ?? next.draftState.draftOrder;
      pushNews(next, {
        date: `${next.season}-11-20`,
        category: '이적·계약',
        headline: `[${nextDraftSeason} 신인 드래프트 개막] ${next.season}시즌 성적 역순 지명 시작 (1R 1순위 ${r1Order[0]})`,
        body: `1R 지명 순서: ${r1Order.map((tid, idx) => `${idx + 1}순위 ${tid}`).join(' → ')}${
          penaltyRes.penaltyNotes.length > 0
            ? ` / 경쟁균형세 제재 반영: ${penaltyRes.penaltyNotes.map((n) => `${n.teamId}(${n.fromPick}→${n.toPick}순위)`).join(', ')}`
            : ''
        }`,
        teamId: next.playerTeamId,
        isHighlight: true,
      });
    }
  }

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function exercisePlayerOption(
  career: CareerSave,
  playerId: string,
  exercise: boolean
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const pCur = career.players[playerId];
  if (!pCur || pCur.teamId !== career.playerTeamId) throw new Error('선수를 찾을 수 없습니다.');
  if (!pCur.contract.optionType || pCur.contract.optionType === '없음') {
    throw new Error(`${pCur.name} 선수 계약에는 실행 가능한 옵션 조항이 없습니다.`);
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const p = next.players[playerId];
  const optSal = p.contract.optionYearSalary ?? p.contract.annualSalary;

  if (exercise) {
    if (next.finances.cashBalanceBillion !== null && next.finances.cashBalanceBillion < optSal) {
      throw new Error(`옵션 연봉(${optSal}억) 실행에 필요한 보유 자금이 부족합니다.`);
    }
    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - optSal).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + optSal).toFixed(2));
    }
    p.contract.yearsRemaining += 1;
    p.contract.annualSalary = optSal;
    p.contract.optionType = '없음';
    p.contract.status = '확정';
    p.morale = '만족';
  } else {
    p.contract.optionType = '없음';
    p.contract.status = '만료';
    p.contract.yearsRemaining = 0;
    const isFa = p.serviceYears >= 8 || (p.registrationDays ?? 0) >= 145 * 8;
    if (isFa) {
      p.formerTeamId = p.teamId;
      p.rosterTier = 'FA';
      p.gameDayActive = false;
      p.contract.isFAEligible = true;
      const ts = next.teams[p.teamId];
      if (ts) {
        ts.lineupOrder = ts.lineupOrder.filter((id) => id !== p.id);
        ts.benchOrder = ts.benchOrder.filter((id) => id !== p.id);
        ts.rotationOrder = ts.rotationOrder.filter((id) => id !== p.id);
        ts.bullpenOrder = ts.bullpenOrder.filter((id) => id !== p.id);
      }
    }
  }

  next.transactionLogs.unshift({
    id: `tx-opt-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '계약',
    teamId: next.playerTeamId,
    summary: `${p.name} 계약 옵션 ${
      exercise ? `실행 (+1년 · ${optSal}억)` : p.rosterTier === 'FA' ? '미실행 (FA 전환 · 구단 자동 이탈)' : '미실행 (만료 처리)'
    }`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * Helper to create empty career stats safely when needed
 */
export function resetStatsForNewSeason(p: Player): void {
  p.stats = p.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false);
  p.postseasonStats = p.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false);
  p.futuresStats = emptyFuturesStats();
  if (p.role === '투수') {
    p.lastPitchedRound = -5;
    p.lastPitchedDate = undefined;
    p.consecutivePitchDays = 0;
    p.recent3DayPitches = 0;
    p.recentPitchLog = [];
    p.starterUsageType = undefined;
  } else {
    p.lastPlayedRound = undefined;
    p.lastPlayedDate = undefined;
    p.benchIdleGames = 0;
  }
}

/**
 * #7: 부진·유망주 해외연수 (미국 드라이브라인 / 일본 미야자키 / 호주·대만 윈터리그)
 */
export interface OverseasTrainingProgramDef {
  id: OverseasTrainingRecord['programId'];
  name: string;
  location: string;
  costBillion: number;
  durationRounds: number;
  minAbilityGain: number;
  maxAbilityGain: number;
  effectSummary: string;
}

export const OVERSEAS_TRAINING_PROGRAMS: OverseasTrainingProgramDef[] = [
  {
    id: 'US_DRIVELINE',
    name: '미국 드라이브라인·애리조나 특훈',
    location: '미국 애리조나',
    costBillion: 3.5,
    durationRounds: 12,
    minAbilityGain: 2,
    maxAbilityGain: 3,
    effectSummary: '구속·타구속도 바이오메카닉 교정 · 능력치 +2~3 · 잠재력 +1 가능 · 슬럼프 완전 해소',
  },
  {
    id: 'JP_MIYAZAKI',
    name: '일본 미야자키 교육리그 연수',
    location: '일본 미야자키',
    costBillion: 2.2,
    durationRounds: 9,
    minAbilityGain: 1,
    maxAbilityGain: 2,
    effectSummary: '제구·컨택 정밀 클리닉 · 능력치 +1~2 · 컨디션 대폭 상승 · 피로 완전 회복',
  },
  {
    id: 'AUS_WINTER',
    name: '호주 ABL·대만 윈터리그 파견',
    location: '호주·대만',
    costBillion: 1.5,
    durationRounds: 6,
    minAbilityGain: 1,
    maxAbilityGain: 2,
    effectSummary: '실전 감각 집중 회복 · 능력치 +1~2 · 슬럼프 탈출 · 빠른 6경기 복귀',
  },
];

export function sendPlayerToOverseasTraining(
  career: CareerSave,
  playerId: string,
  programId: OverseasTrainingRecord['programId']
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const prog = OVERSEAS_TRAINING_PROGRAMS.find((x) => x.id === programId);
  if (!prog) throw new Error('유효하지 않은 해외연수 프로그램입니다.');
  const pCur = career.players[playerId];
  if (!pCur || pCur.teamId !== career.playerTeamId) throw new Error('해외연수를 보낼 소속 선수를 찾을 수 없습니다.');
  if (
    pCur.rosterTier === '은퇴' ||
    pCur.rosterTier === '해외이적' ||
    pCur.rosterTier === '제외후보' ||
    isMilitaryServing(pCur.militaryStatus)
  ) {
    throw new Error('현재 상태에서는 해외연수를 파견할 수 없습니다.');
  }
  if (pCur.overseasTrainingLocation) {
    throw new Error(`${pCur.name} 선수는 이미 ${pCur.overseasTrainingLocation} 연수 중입니다.`);
  }
  if (career.finances.cashBalanceBillion !== null && career.finances.cashBalanceBillion < prog.costBillion) {
    throw new Error(
      `보유 자금(${career.finances.cashBalanceBillion.toFixed(2)}억)이 부족합니다 (필요: ${prog.costBillion}억 원).`
    );
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);
  const rng = new SeededRng(next.rngState + Date.now() % 10000);
  const p = next.players[playerId];
  const t = next.teams[next.playerTeamId];

  if (next.finances.cashBalanceBillion !== null) {
    next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - prog.costBillion).toFixed(2));
    next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + prog.costBillion).toFixed(2));
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const isImmediate = next.phase !== 'REGULAR_SEASON';
  const rec: OverseasTrainingRecord = {
    id: `ost-${Date.now()}-${p.id}`,
    playerId: p.id,
    playerName: p.name,
    teamId: next.playerTeamId,
    programId: prog.id,
    location: prog.location,
    costBillion: prog.costBillion,
    startRound: next.gamesPlayed,
    returnRound: isImmediate ? next.gamesPlayed : next.gamesPlayed + prog.durationRounds,
    status: '연수중',
  };

  if (!isImmediate) {
    p.rosterTier = '대기';
    p.gameDayActive = false;
    p.overseasTrainingLocation = prog.location;
    p.overseasTrainingReturnRound = rec.returnRound;
    t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
    t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
    t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
    t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);
  }

  next.overseasTrainings!.unshift(rec);

  if (isImmediate) {
    processOverseasTrainingReturns(next, rng, dateStr, true);
  } else {
    pushNews(next, {
      date: dateStr,
      category: '구단사건',
      headline: `[해외연수 파견] ${KBO_TEAMS[next.playerTeamId].shortName} ${p.name}, ${prog.name} 출국`,
      body: `${p.name} 선수가 ${prog.location}에서 ${prog.durationRounds}경기 일정으로 집중 교정 연수를 진행합니다. 복귀 시 슬럼프 해소와 기량 향상이 기대됩니다.`,
      teamId: next.playerTeamId,
      fanSentimentImpact: 1,
    });
  }

  next.transactionLogs.unshift({
    id: `tx-ost-${Date.now()}`,
    date: dateStr,
    type: '재정',
    teamId: next.playerTeamId,
    summary: `해외연수 파견: ${p.name} → ${prog.name} (-${prog.costBillion}억 원)`,
    detail: isImmediate ? rec.resultSummary ?? '비시즌 즉시 수료 완료' : `${rec.returnRound}경기 시점 2군 복귀 예정`,
  });

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function processOverseasTrainingReturns(
  next: CareerSave,
  rng: SeededRng,
  dateStr: string,
  forceCompleteAll = false
): OverseasTrainingRecord[] {
  ensureFranchiseState(next);
  const completed: OverseasTrainingRecord[] = [];
  for (const rec of next.overseasTrainings ?? []) {
    if (rec.status !== '연수중') continue;
    if (!forceCompleteAll && next.gamesPlayed < rec.returnRound) continue;
    const p = next.players[rec.playerId];
    const prog = OVERSEAS_TRAINING_PROGRAMS.find((x) => x.id === rec.programId) ?? OVERSEAS_TRAINING_PROGRAMS[1];
    rec.status = '복귀완료';

    if (p && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적') {
      const gain = rng.int(prog.minAbilityGain, prog.maxAbilityGain);
      const potGain = p.age <= 27 && rng.next() < (prog.id === 'US_DRIVELINE' ? 0.55 : 0.35) ? 1 : 0;
      if (potGain > 0) p.potential = Math.min(97, p.potential + potGain);
      const prevOvr = p.ability;
      p.ability = Math.min(96, Math.min(p.potential, p.ability + gain));
      const actualGain = p.ability - prevOvr;
      p.fatigue = 0;
      p.form = Math.min(5, Math.max(2, p.form + 3));
      p.morale = '만족';
      p.overseasTrainingLocation = undefined;
      p.overseasTrainingReturnRound = undefined;
      if (p.rosterTier === '대기') p.rosterTier = '2군';

      rec.resultSummary = `능력치 ${actualGain > 0 ? `+${actualGain}` : '유지'}(OVR ${p.ability})${potGain > 0 ? ` · 잠재력 +${potGain}` : ''} · 슬럼프 완전 해소(컨디션 +${p.form})`;

      pushNews(next, {
        date: dateStr,
        category: '구단사건',
        headline: `[해외연수 복귀] ${p.name}, ${rec.location} 특훈 마치고 환골탈태 귀국!`,
        body: `${p.name} 선수가 ${prog.name}을 성공적으로 수료했습니다 (${rec.resultSummary}). 2군 엔트리에 합류해 1군 콜업을 대기합니다.`,
        teamId: p.teamId,
        isHighlight: true,
        fanSentimentImpact: 2,
      });
    }
    completed.push(rec);
  }
  return completed;
}

/**
 * #3: 전체 구단 감독 부진 경질 & 신임 감독 선임
 */
export function fireAndReplaceClubManager(
  next: CareerSave,
  teamId: TeamId,
  reason: string,
  dateStr: string,
  rankAtFiring: number,
  winPctAtFiring: number,
  isAutonomous: boolean
): ManagerFiringRecord | null {
  ensureFranchiseState(next);
  const staff = next.coaches[teamId] ?? [];
  const mgrIdx = staff.findIndex((c) => c.role === '감독');
  if (mgrIdx < 0) return null;
  const oldMgr = staff[mgrIdx];

  if (!Array.isArray(next.faCoaches)) {
    const activeNames = new Set(TEAM_IDS.flatMap((tid) => (next.coaches[tid] ?? []).map((c) => c.name)));
    next.faCoaches = REAL_FA_COACH_SEEDS.filter((s) => !activeNames.has(s.name)).map((s, idx) => ({
      id: `coach-fa-${s.role}-${idx}-${s.name}`,
      teamId: 'FA',
      role: s.role,
      name: s.name,
      ability: s.ability,
      contractYears: s.contractYears,
      annualSalaryBillion: s.annualSalaryBillion,
      signingBonusBillion: s.signingBonusBillion,
      totalBillion: Number((s.contractYears * s.annualSalaryBillion + s.signingBonusBillion).toFixed(2)),
      confirmed: false,
      isIncumbent: false,
      careerNote: s.careerNote,
    }));
  }

  let newMgr: Coach;
  // 시즌 중 감독 경질 시 기존 코치가 감독대행을 맡도록 처리 (#15)
  if (next.phase === 'REGULAR_SEASON' && next.gamesPlayed < next.totalRegularGames) {
    newMgr = appointActingManagerInPlace(next, teamId, oldMgr.name, reason);
    next.faCoaches.push({
      ...oldMgr,
      teamId: 'FA',
      confirmed: false,
      isIncumbent: false,
      isActingManager: false,
      careerNote: `FA · ${next.season}시즌 ${KBO_TEAMS[teamId].shortName} 감독 경질`,
    });
  } else {
    // Pick best FA Manager; fallback to promoting best FA coach or internal coach
    const faMgrs = next.faCoaches
      .filter((c) => c.role === '감독' && c.name !== oldMgr.name)
      .sort((a, b) => b.ability - a.ability);

    if (faMgrs[0]) {
      const picked = faMgrs[0];
      next.faCoaches = next.faCoaches.filter((c) => c.id !== picked.id);
      newMgr = {
        ...picked,
        teamId,
        confirmed: true,
        isIncumbent: false,
        isActingManager: false,
        careerNote: `${next.season}시즌 부임 (${KBO_TEAMS[teamId].shortName} 신임 감독)`,
      };
    } else {
      const promoCoach = next.faCoaches.filter((c) => c.name !== oldMgr.name).sort((a, b) => b.ability - a.ability)[0];
      if (promoCoach) {
        next.faCoaches = next.faCoaches.filter((c) => c.id !== promoCoach.id);
        newMgr = {
          ...promoCoach,
          teamId,
          role: '감독',
          ability: Math.min(86, promoCoach.ability + 1),
          confirmed: true,
          isIncumbent: false,
          isActingManager: false,
          careerNote: `${next.season}시즌 감독 승격 부임 (${KBO_TEAMS[teamId].shortName})`,
        };
      } else {
        newMgr = appointActingManagerInPlace(next, teamId, oldMgr.name, reason);
      }
    }

    // Push fired manager into FA pool
    next.faCoaches.push({
      ...oldMgr,
      teamId: 'FA',
      confirmed: false,
      isIncumbent: false,
      isActingManager: false,
      careerNote: `FA · ${next.season}시즌 ${KBO_TEAMS[teamId].shortName} 감독 경질`,
    });
    staff[mgrIdx] = newMgr;
    next.coaches[teamId] = staff;
  }

  if (!next.firedManagerTeamsThisSeason!.includes(teamId)) {
    next.firedManagerTeamsThisSeason!.push(teamId);
  }

  const record: ManagerFiringRecord = {
    id: `mfire-${next.season}-${teamId}-${Date.now()}`,
    season: next.season,
    date: dateStr,
    teamId,
    firedManagerName: oldMgr.name,
    newManagerName: newMgr.name,
    reason,
    rankAtFiring,
    winPctAtFiring: Number(winPctAtFiring.toFixed(3)),
  };
  next.managerFirings!.unshift(record);

  pushNews(next, {
    date: dateStr,
    category: '이적·계약',
    headline: `[감독 경질] ${KBO_TEAMS[teamId].name}, ${oldMgr.name} 감독 전격 경질 → ${newMgr.name} 신임 사령탑 선임`,
    body: `리그 ${rankAtFiring}위(승률 ${winPctAtFiring.toFixed(3)}) 성적 부진 끝에 구단이 사령탑 교체를 단행했습니다. (${reason})`,
    teamId,
    isHighlight: true,
    verifiedStats: true,
    fanSentimentImpact: teamId === next.playerTeamId ? 4 : 0,
  });

  next.transactionLogs.unshift({
    id: `tx-mfire-${Date.now()}-${teamId}`,
    date: dateStr,
    type: '계약',
    teamId,
    summary: `[감독 경질·교체] ${KBO_TEAMS[teamId].shortName}: ${oldMgr.name} 경질 → ${newMgr.name} 선임`,
    detail: `${isAutonomous ? '구단 프런트 자체 결단' : '단장 결단'} · 당시 순위 ${rankAtFiring}위 (승률 ${winPctAtFiring.toFixed(3)})`,
  });

  return record;
}

/**
 * #3 감독 경질 + #10 다른 9개 구단 단장 자율 운영 강화 (영입·방출·트레이드·스폰서·감독 교체)
 */
export function processLeagueManagerFiringsAndOtherClubGms(
  next: CareerSave,
  rng: SeededRng,
  dateStr: string
): void {
  ensureFranchiseState(next);
  // 전체 10개 구단 동일 육성선수 규정 적용 (5월 1일 이후 전환 · 68명 정원 · 1군 출전 차단)
  processAiClubsDevelopmentalRules(next, getTeamRetiredNumbers);
  if (next.gamesPlayed < 18 || next.gamesPlayed % 18 !== 0) return;

  const standings = computeStandings(next.gamesLedger);
  if (standings.length < 10) return;
  const myTeam = next.playerTeamId;

  // 1. Mid-season Manager Firing Checks (#3) after 36+ games
  if (next.gamesPlayed >= 36) {
    for (const row of standings) {
      if (next.firedManagerTeamsThisSeason!.includes(row.teamId)) continue;
      const expectedRank = KBO_TEAMS[row.teamId].prevRank2025;
      const underperforming = row.pct < 0.375 || (row.rank >= expectedRank + 4 && row.pct < 0.44);

      if (row.teamId === myTeam) {
        const hasPendingMgrEvent = (next.clubEvents ?? []).some(
          (e) => !e.resolved && e.id.startsWith('ev-mgr-fire-')
        );
        if ((row.pct < 0.405 || underperforming) && !hasPendingMgrEvent) {
          const curMgr = (next.coaches[myTeam] ?? []).find((c) => c.role === '감독');
          if (curMgr) {
            next.clubEvents!.unshift({
              id: `ev-mgr-fire-${next.season}-${next.gamesPlayed}`,
              date: dateStr,
              type: '감독경질',
              title: `[구단주 긴급 회의] ${curMgr.name} 감독 성적 부진 경질 권고 (${row.rank}위 · 승률 ${row.pct.toFixed(3)})`,
              description: `${KBO_TEAMS[myTeam].name}이(가) ${next.gamesPlayed}경기 기준 ${row.wins}승 ${row.losses}패(${row.rank}위)로 부진하자 구단주와 팬덤에서 ${curMgr.name} 감독 경질을 요구하고 있습니다.`,
              choices: [
                {
                  id: 'FIRE_MANAGER_NOW',
                  label: `${curMgr.name} 감독 즉시 경질 및 신임 감독 선임`,
                  effectPreview: 'FA 상위 감독 선임 · 팬 여론 +4 · 구단주 신뢰 +5',
                },
                {
                  id: 'BACK_MANAGER',
                  label: `${curMgr.name} 감독 재신임 (시즌 완주 지원)`,
                  effectPreview: '선수단 안정 유지 · 구단주 신뢰 -3',
                },
              ],
              resolved: false,
            });
            pushNews(next, {
              date: dateStr,
              category: '구단사건',
              headline: `[경질 압박] ${KBO_TEAMS[myTeam].shortName} ${curMgr.name} 감독 거취 도마 위… 구단주 긴급 논의`,
              body: `최근 부진(${row.rank}위, 승률 ${row.pct.toFixed(3)}) 속에 단장실의 사령탑 교체 여부에 이목이 쏠리고 있습니다.`,
              teamId: myTeam,
              isHighlight: true,
              verifiedStats: true,
              fanSentimentImpact: -2,
            });
          }
        }
      } else if (underperforming && rng.next() < 0.65) {
        fireAndReplaceClubManager(
          next,
          row.teamId,
          `시즌 중반 ${row.rank}위(${row.wins}승 ${row.losses}패) 부진 문책`,
          dateStr,
          row.rank,
          row.pct,
          true
        );
      }
    }
  }

  // 2. Other 9 Clubs Autonomous Waiver Evaluation (7일 영입 접수 & 성적 역순 확정 공통 규칙 적용)
  processWaiverLifecycleInPlace(next, dateStr, rng, {
    extraRetiredByTeam: (tid) => getTeamRetiredNumbers(next, tid),
    allowAiNewReleases: false,
  });

  // 3. Other 9 Clubs Mid-Season Foreign & Asia-Quota Replacement (부진 + 6주 장기부상 대체 포함)
  if (next.gamesPlayed >= 36 && next.gamesPlayed <= 115 && rng.next() < 0.45) {
    const strugglingClubs = standings.slice(4).filter((r) => r.teamId !== myTeam);
    const chosenRow = strugglingClubs.length > 0 ? rng.pick(strugglingClubs) : null;
    if (chosenRow) {
      const tid = chosenRow.teamId;
      const badForeign = Object.values(next.players).find((p) => {
        if (p.teamId !== tid || (p.category !== '외국인' && p.category !== '아시아쿼터') || p.rosterTier !== '1군') return false;
        if (p.injury && p.injury.daysRemaining >= 42) return true; // 6주 장기 부상 대체
        if (p.form <= -2 && (p.kboAdaptation ?? 80) < 62) return true;
        if (p.role === '투수') {
          const ps = p.stats as PitcherStats;
          const era = calcERA(ps.ER, ps.outs);
          return (ps.outs ?? 0) >= 60 && era !== null && era >= 4.85;
        }
        const bs = p.stats as BatterStats;
        const ops = calcOPS(bs);
        return (bs.PA ?? 0) >= 80 && ops !== null && ops <= 0.69;
      });
      if (badForeign) {
        const pool = generateVirtualForeignMarket(next.season, next.rngState + next.gamesPlayed * 13);
        const replacement = pool.find((c) => c.category === badForeign.category && c.role === badForeign.role);
        if (replacement) {
          const t = next.teams[tid];
          badForeign.rosterTier = '제외후보';
          badForeign.gameDayActive = false;
          t.rotationOrder = t.rotationOrder.filter((id) => id !== badForeign.id);
          t.bullpenOrder = t.bullpenOrder.filter((id) => id !== badForeign.id);
          t.lineupOrder = t.lineupOrder.filter((id) => id !== badForeign.id);
          t.benchOrder = t.benchOrder.filter((id) => id !== badForeign.id);

          const newId = `${tid}-F-AUTO-${next.gamesPlayed}-${replacement.id}`;
          const isP = replacement.role === '투수';
          next.players[newId] = {
            id: newId,
            name: replacement.name,
            teamId: tid,
            category: '외국인',
            role: replacement.role,
            position: replacement.position,
            pitchRole: isP ? '선발' : undefined,
            age: replacement.age,
            ability: replacement.ability,
            potential: replacement.potential,
            abilityStatus: '확정',
            form: 1,
            fatigue: 0,
            lastPitchedRound: 0,
            consecutiveAppearances: 0,
            rosterTier: '1군',
            gameDayActive: true,
            nationality: replacement.nationality,
            previousLeagueClub: replacement.previousLeagueClub,
            uniformNumber: allocateTeamUniformNumber(
              next.players,
              tid,
              false,
              undefined,
              getTeamRetiredNumbers(next, tid)
            ),
            contract: {
              status: '확정',
              currency: 'USD',
              years: 1,
              yearsRemaining: 1,
              startSeason: next.season,
              endSeason: next.season,
              annualSalary: replacement.suggestedSalaryUsd,
              signingBonus: replacement.suggestedSigningBonusUsd,
              totalValue: replacement.suggestedTotalUsd,
              note: `${next.season} 시즌 중 교체 영입`,
            },
            injury: null,
            morale: '만족',
            trainingFocus: null,
            serviceYears: 0,
            seasonRatingDelta: 0,
            lastEvaluatedAtTeamGames: 0,
            kboAdaptation: 72,
            stats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
            postseasonStats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
          };
          if (isP) {
            if (t.rotationOrder.length < 5) t.rotationOrder.push(newId);
            else t.bullpenOrder.push(newId);
          } else if (t.lineupOrder.length < 9) {
            t.lineupOrder.push(newId);
            t.lineupPositions[newId] = replacement.position;
          } else {
            t.benchOrder.push(newId);
          }

          pushNews(next, {
            date: dateStr,
            category: '이적·계약',
            headline: `[외국인 교체] ${KBO_TEAMS[tid].shortName}, ${badForeign.name} 방출 → 새 외인 ${replacement.name}(${replacement.position}) 영입`,
            body: `${KBO_TEAMS[tid].name} 프런트가 부진한 ${badForeign.name}을(를) 웨이버 공시하고 OVR ${replacement.ability}급 대체 외국인 ${replacement.name}과 계약했습니다.`,
            teamId: tid,
            isHighlight: true,
          });
          recordLeagueAcquisitionInPlace(
            next,
            {
              dedupeKey: `foreign-ai-${next.season}-${tid}-${replacement.id}-${next.gamesPlayed}`,
              season: next.season,
              date: dateStr,
              category: '외국인·아시아쿼터',
              playerId: newId,
              playerName: replacement.name,
              position: replacement.position,
              previousTeamLabel: replacement.previousLeagueClub || `${replacement.nationality} 해외리그`,
              acquiringTeamId: tid,
              contractAmountLabel: `$${replacement.suggestedTotalUsd.toLocaleString()}`,
              note: `${badForeign.name} 대체 외국인 영입`,
            },
            { pushNewsAlert: false }
          );
        }
      }
    }
  }

  // 4. Other 9 Clubs Inter-Club Autonomous Trade (Contender vs Rebuilder — 현실 KBO 트레이드 기간·마감일 임박 활발화·드래프트 지명권 포함) (#10)
  const aiTradeWindow = getTradeWindowStatus(next, dateStr);
  const aiDaysLeft = aiTradeWindow.daysUntilDeadline ?? 99;
  const aiTradeChance = !aiTradeWindow.isOpen
    ? 0
    : aiDaysLeft <= 3
    ? 0.88
    : aiDaysLeft <= 7
    ? 0.72
    : aiDaysLeft <= 14
    ? 0.54
    : 0.34;
  const aiMaxDeals = aiDaysLeft <= 3 ? 2 : 1;

  if (aiTradeWindow.isOpen && next.gamesPlayed >= 36 && rng.next() < aiTradeChance) {
    const usedBuyers = new Set<TeamId>();
    const usedSellers = new Set<TeamId>();

    for (let dealIdx = 0; dealIdx < aiMaxDeals; dealIdx++) {
      if (dealIdx > 0 && rng.next() >= 0.58) break;
      const contenders = standings
        .slice(0, 4)
        .filter((r) => r.teamId !== myTeam && !usedBuyers.has(r.teamId));
      const rebuilders = standings
        .slice(6)
        .filter((r) => r.teamId !== myTeam && !usedSellers.has(r.teamId));
      if (contenders.length === 0 || rebuilders.length === 0) break;

      const buyer = rng.pick(contenders).teamId;
      const seller = rng.pick(rebuilders).teamId;

      const buyerFirstTeam = Object.values(next.players).filter(
        (p) => p.teamId === buyer && p.rosterTier === '1군' && !p.injury
      );
      const buyerNeedsPlayer = (cand: Player): boolean => {
        if (cand.role === '투수') {
          const isSp = cand.position === 'SP' || cand.pitchRole === '선발';
          const same = buyerFirstTeam
            .filter(
              (p) =>
                p.role === '투수' &&
                (isSp
                  ? p.position === 'SP' || p.pitchRole === '선발'
                  : p.position !== 'SP' && p.pitchRole !== '선발')
            )
            .sort((a, b) => b.ability - a.ability);
          const benchMark = same[Math.min(same.length - 1, isSp ? 4 : 5)]?.ability ?? 67;
          return same.length < (isSp ? 4 : 5) || cand.ability >= benchMark + 2;
        }
        const isOf = cand.position === 'LF' || cand.position === 'CF' || cand.position === 'RF';
        const same = buyerFirstTeam
          .filter(
            (p) =>
              p.role === '타자' &&
              (p.position === cand.position ||
                (isOf && (p.position === 'LF' || p.position === 'CF' || p.position === 'RF')))
          )
          .sort((a, b) => b.ability - a.ability);
        const benchMark = same[(isOf ? 3 : 1) - 1]?.ability ?? 66;
        return same.length < (isOf ? 3 : 1) || cand.ability >= benchMark + 2;
      };

      // 레전드·핵심 프랜차이즈 스타 보호 (트레이드 요청 외 함부로 트레이드 불가) + 구매 구단 부족 포지션만 타겟팅
      const vetCandidates = Object.values(next.players)
        .filter((p) => {
          if (
            p.teamId !== seller ||
            p.category !== '국내' ||
            p.rosterTier !== '1군' ||
            p.age < 28 ||
            p.ability < 74 ||
            p.ability > 82 ||
            p.injury ||
            isMilitaryServing(p.militaryStatus)
          ) {
            return false;
          }
          const legGate = evaluateLegendTradeAvailability(next, p);
          if (legGate.isLegend && !legGate.available) return false;
          const fran = evaluateFranchiseStar(next, p);
          if ((fran.tier === '레전드' || fran.tier === '핵심 프랜차이즈') && !p.tradeRequested) {
            return false;
          }
          return buyerNeedsPlayer(p);
        })
        .sort((a, b) => b.ability - a.ability);

      const vetTarget = vetCandidates[0];
      const vetVal = vetTarget ? evaluatePlayerTradeValuationDetailed(next, vetTarget).homeClubValue : 0;

      // 하위권 구단은 유망주 + 차기 신인 드래프트 지명권(2R/3R) 패키지 선호
      const includePickRound: 2 | 3 | null =
        vetTarget && (aiDaysLeft <= 7 || vetTarget.ability >= 78)
          ? vetTarget.ability >= 79
            ? 2
            : 3
          : null;
      const pickBonusVal = includePickRound === 2 ? 26 : includePickRound === 3 ? 15 : 0;

      const youthChip = vetTarget
        ? Object.values(next.players)
            .filter((p) => {
              if (
                p.teamId !== buyer ||
                p.category !== '국내' ||
                p.rosterTier !== '2군' ||
                p.age > 24 ||
                p.potential < 75 ||
                p.injury ||
                isMilitaryServing(p.militaryStatus)
              ) {
                return false;
              }
              const val = evaluatePlayerTradeValuationDetailed(next, p).marketClubValue + 12 + pickBonusVal;
              return val >= vetVal * 0.72 && val <= vetVal * 1.42;
            })
            .sort((a, b) => b.potential - a.potential)[0]
        : undefined;

      const aiWindowOpen = getTradeWindowStatus(next).isOpen;
      const aiTradeValid =
        aiWindowOpen &&
        Boolean(vetTarget && youthChip) &&
        vetTarget!.teamId === seller &&
        youthChip!.teamId === buyer &&
        vetTarget!.signedAsFaSeason !== next.season &&
        youthChip!.signedAsFaSeason !== next.season &&
        evaluateLegendTradeAvailability(next, vetTarget!).available &&
        evaluateLegendTradeAvailability(next, youthChip!).available;

      if (vetTarget && youthChip && aiTradeValid) {
        usedBuyers.add(buyer);
        usedSellers.add(seller);

        const swapTeam = (p: Player, fromTid: TeamId, toTid: TeamId, promoteToFirst: boolean) => {
          const fromT = next.teams[fromTid];
          const toT = next.teams[toTid];
          fromT.lineupOrder = fromT.lineupOrder.filter((id) => id !== p.id);
          fromT.benchOrder = fromT.benchOrder.filter((id) => id !== p.id);
          fromT.rotationOrder = fromT.rotationOrder.filter((id) => id !== p.id);
          fromT.bullpenOrder = fromT.bullpenOrder.filter((id) => id !== p.id);

          p.teamId = toTid;
          p.rosterTier = promoteToFirst ? '1군' : '2군';
          p.gameDayActive = promoteToFirst;
          p.uniformNumber = allocateTeamUniformNumber(
            next.players,
            toTid,
            false,
            undefined,
            getTeamRetiredNumbers(next, toTid)
          );
          if (promoteToFirst) {
            if (p.role === '투수') {
              if (toT.rotationOrder.length < 5) toT.rotationOrder.push(p.id);
              else toT.bullpenOrder.push(p.id);
            } else {
              toT.benchOrder.push(p.id);
            }
          }
        };

        swapTeam(vetTarget, seller, buyer, true);
        swapTeam(youthChip, buyer, seller, false);

        if (includePickRound) {
          recordDraftPickTradeInPlace(next, includePickRound, buyer, seller, dateStr);
        }

        const pickLabel = includePickRound ? ` + 차기 ${includePickRound}R 지명권` : '';
        const deadlineTag = aiDaysLeft <= 7 ? `[마감 D-${aiDaysLeft === 0 ? 'Day' : aiDaysLeft} 트레이드]` : '[리그 트레이드]';

        recordLeagueAcquisitionInPlace(
          next,
          {
            dedupeKey: `trade-ai-${next.season}-${next.gamesPlayed}-${vetTarget.id}-${buyer}`,
            season: next.season,
            date: dateStr,
            category: '트레이드',
            playerId: vetTarget.id,
            playerName: vetTarget.name,
            position: vetTarget.position,
            previousTeamLabel: KBO_TEAMS[seller].shortName,
            acquiringTeamId: buyer,
            contractAmountLabel: `기존 계약 승계 (연 ${vetTarget.contract.annualSalary}억)`,
            note: `${KBO_TEAMS[buyer].shortName}↔${KBO_TEAMS[seller].shortName} 트레이드${pickLabel}`,
          },
          { pushNewsAlert: false }
        );
        recordLeagueAcquisitionInPlace(
          next,
          {
            dedupeKey: `trade-ai-${next.season}-${next.gamesPlayed}-${youthChip.id}-${seller}`,
            season: next.season,
            date: dateStr,
            category: '트레이드',
            playerId: youthChip.id,
            playerName: youthChip.name,
            position: youthChip.position,
            previousTeamLabel: KBO_TEAMS[buyer].shortName,
            acquiringTeamId: seller,
            contractAmountLabel: `기존 계약 승계 (연 ${youthChip.contract.annualSalary}억)`,
            note: `${KBO_TEAMS[buyer].shortName}↔${KBO_TEAMS[seller].shortName} 트레이드${pickLabel}`,
          },
          { pushNewsAlert: false }
        );

        pushNews(next, {
          date: dateStr,
          category: '이적·계약',
          headline: `${deadlineTag} ${KBO_TEAMS[buyer].shortName} ${vetTarget.name} 영입 ↔ ${KBO_TEAMS[seller].shortName} ${youthChip.name}${pickLabel} 확보`,
          body: `상위권 우승 경쟁 중인 ${KBO_TEAMS[buyer].shortName}이 즉시전력 ${vetTarget.name}(OVR ${vetTarget.ability})을 보강하고, 하위권 리빌딩 중인 ${KBO_TEAMS[seller].shortName}은 유망주 ${youthChip.name}(${youthChip.age}세·잠재 ${youthChip.potential})${pickLabel}을 확보하는 트레이드를 단행했습니다.`,
          teamId: buyer,
          isHighlight: true,
        });
        next.transactionLogs.unshift({
          id: `tx-league-trade-${next.gamesPlayed}-${dealIdx}-${Date.now()}`,
          date: dateStr,
          type: '트레이드',
          teamId: buyer,
          summary: `[타 구단 트레이드] ${buyer} ${vetTarget.name} ↔ ${seller} ${youthChip.name}${pickLabel}`,
        });
      }
    }
  }

  // 5. Other 9 Clubs Sponsor Upgrade for Surging Clubs (#10)
  const leaderTid = standings[0]?.teamId;
  if (leaderTid && leaderTid !== myTeam && next.otherClubSponsors) {
    const choices = getTeamSponsorChoices(leaderTid);
    const premium = choices[choices.length - 1];
    if (premium && next.otherClubSponsors[leaderTid] !== premium.name) {
      next.otherClubSponsors[leaderTid] = premium.name;
      pushNews(next, {
        date: dateStr,
        category: '이적·계약',
        headline: `[스폰서 동향] 선두 질주 ${KBO_TEAMS[leaderTid].shortName}, ${premium.name}과 대형 후원 파트너십 체결`,
        body: `리그 선두권 흥행에 힘입어 ${KBO_TEAMS[leaderTid].name} 구단이 ${premium.name}과 신규 스폰서십 계약을 발표했습니다.`,
        teamId: leaderTid,
      });
    }
  }
}

/**
 * #11: 경기 결과·박스스코어 자동 대조 검증 시리즈 속보 + 팬 반응·관중 연동
 */
export function generateVerifiedSeriesRecapNews(
  next: CareerSave,
  playerTeamGames: GameRecord[],
  dateStr: string
): void {
  ensureFranchiseState(next);
  if (playerTeamGames.length === 0) return;

  const myTeam = next.playerTeamId;
  const opp =
    playerTeamGames[0].awayTeam === myTeam
      ? playerTeamGames[0].homeTeam
      : playerTeamGames[0].awayTeam;

  const wins = playerTeamGames.filter((g) => g.winner === myTeam).length;
  const losses = playerTeamGames.filter((g) => g.loser === myTeam).length;
  const draws = playerTeamGames.filter((g) => g.isDraw).length;

  // Verify every cited stat directly from boxscore ledger
  const batterAgg = new Map<string, { name: string; AB: number; H: number; HR: number; RBI: number }>();
  const pitcherAgg = new Map<string, { name: string; outs: number; ER: number; SO: number; W: number; SV: number }>();

  let allVerified = true;
  const scoreStrings: string[] = [];

  for (const g of playerTeamGames) {
    if (g.verified === false) allVerified = false;
    const myScore = g.homeTeam === myTeam ? g.homeRuns : g.awayRuns;
    const oppScore = g.homeTeam === myTeam ? g.awayRuns : g.homeRuns;
    scoreStrings.push(`${myScore}:${oppScore}`);
    if (!g.boxscore) continue;

    const myBats = g.homeTeam === myTeam ? g.boxscore.homeBatters : g.boxscore.awayBatters;
    const myPits = g.homeTeam === myTeam ? g.boxscore.homePitchers : g.boxscore.awayPitchers;

    for (const b of myBats) {
      const cur = batterAgg.get(b.playerId) ?? { name: b.name, AB: 0, H: 0, HR: 0, RBI: 0 };
      cur.AB += b.AB;
      cur.H += b.H;
      cur.HR += b.HR;
      cur.RBI += b.RBI;
      batterAgg.set(b.playerId, cur);
    }
    for (const pt of myPits) {
      const cur = pitcherAgg.get(pt.playerId) ?? { name: pt.name, outs: 0, ER: 0, SO: 0, W: 0, SV: 0 };
      cur.outs += pt.outs;
      cur.ER += pt.ER;
      cur.SO += pt.SO;
      cur.W += pt.W;
      cur.SV += pt.SV;
      pitcherAgg.set(pt.playerId, cur);
    }
  }

  const bestBat = [...batterAgg.values()].sort(
    (a, b) => b.HR * 4 + b.RBI * 2 + b.H - (a.HR * 4 + a.RBI * 2 + a.H)
  )[0];
  const bestPit = [...pitcherAgg.values()].sort(
    (a, b) => b.W * 6 + b.SV * 4 + b.outs * 0.4 - b.ER * 2 - (a.W * 6 + a.SV * 4 + a.outs * 0.4 - a.ER * 2)
  )[0];

  const batLine = bestBat
    ? `${bestBat.name}(${bestBat.AB}타수 ${bestBat.H}안타${bestBat.HR > 0 ? ` ${bestBat.HR}홈런` : ''} ${bestBat.RBI}타점)`
    : '';
  const pitLine = bestPit
    ? `${bestPit.name}(${formatIP(bestPit.outs)}이닝 ${bestPit.ER}자책 ${bestPit.SO}K${bestPit.W > 0 ? ` ${bestPit.W}승` : ''}${bestPit.SV > 0 ? ` ${bestPit.SV}세이브` : ''})`
    : '';

  const recLabel = `${wins}승 ${losses}패${draws > 0 ? ` ${draws}무` : ''}`;
  const fanSentimentImpact = wins === 3 ? 4 : wins === 2 ? 2 : losses === 3 ? -4 : -1;
  const attendanceImpactPct = wins === 3 ? 5 : wins === 2 ? 2 : losses === 3 ? -5 : -2;
  const ownerTrustImpact = wins === 3 ? 3 : wins === 2 ? 1 : losses === 3 ? -3 : -1;

  pushNews(next, {
    date: dateStr,
    category: '경기·시리즈',
    headline: `[시리즈 결산] ${KBO_TEAMS[myTeam].shortName}, ${KBO_TEAMS[opp].shortName} 3연전 ${recLabel} (${scoreStrings.join(' · ')})`,
    body: `공식 기록 검증 완료 — ${[batLine ? `타선 핵심 ${batLine}` : '', pitLine ? `마운드 핵심 ${pitLine}` : ''].filter(Boolean).join(' / ')}. 팬 여론(${fanSentimentImpact >= 0 ? `+${fanSentimentImpact}` : fanSentimentImpact}) 및 홈 관중 수요(${attendanceImpactPct >= 0 ? `+${attendanceImpactPct}%` : `${attendanceImpactPct}%`})에 즉시 반영되었습니다.`,
    teamId: myTeam,
    isHighlight: wins === 3 || losses === 3,
    verifiedStats: allVerified,
    fanSentimentImpact,
    attendanceImpactPct,
    ownerTrustImpact,
  });
}

/**
 * #12: 시즌 종료 시 역대 기록 아카이브(seasonHistory) 및 구단/리그 신기록 영구 보존
 */
export function archiveCompletedSeasonRecords(
  next: CareerSave,
  awards: SeasonAwards | null
): void {
  ensureFranchiseState(next);
  const standings = computeStandings(next.gamesLedger);
  if (standings.length === 0) return;

  const myRow = standings.find((r) => r.teamId === next.playerTeamId);
  const regularChampion = standings[0].teamId;
  const ksChamp = next.postseason.champion ?? (next.championHistory ?? []).find((c) => c.season === next.season)?.championTeamId ?? null;
  const ksRunnerUp =
    (next.championHistory ?? []).find((c) => c.season === next.season)?.runnerUpTeamId ?? null;
  const ksMvpName = next.postseason.ksMvp?.playerName ?? awards?.koreanSeriesMvp?.playerName ?? '-';

  const hrTop = computeLeaderboards(next, 'HR')[0];
  const avgTop = computeLeaderboards(next, 'AVG')[0];
  const winTop = computeLeaderboards(next, 'W')[0];
  const eraTop = computeLeaderboards(next, 'ERA')[0];

  const summary: SeasonHistorySummary = {
    season: next.season,
    regularChampionTeamId: regularChampion,
    koreanSeriesChampionTeamId: ksChamp,
    runnerUpTeamId: ksRunnerUp,
    playerTeamId: next.playerTeamId,
    playerTeamRank: myRow?.rank ?? 5,
    playerTeamRecord: myRow
      ? `${myRow.wins}승 ${myRow.losses}패${myRow.draws > 0 ? ` ${myRow.draws}무` : ''}`
      : '-',
    seasonMvpName: awards?.mvp ? `${awards.mvp.playerName}(${awards.mvp.teamId})` : next.seasonHistory?.find((s) => s.season === next.season)?.seasonMvpName ?? '시상식 대기',
    ksMvpName,
    managerOfTheYearName: awards?.managerOfTheYear
      ? `${awards.managerOfTheYear.managerName}(${awards.managerOfTheYear.teamId})`
      : next.seasonHistory?.find((s) => s.season === next.season)?.managerOfTheYearName,
    hrLeader: hrTop ? `${hrTop.playerName}(${hrTop.teamId}) ${hrTop.displayValue}` : '-',
    avgLeader: avgTop ? `${avgTop.playerName}(${avgTop.teamId}) ${avgTop.displayValue}` : '-',
    winsLeader: winTop ? `${winTop.playerName}(${winTop.teamId}) ${winTop.displayValue}` : '-',
    eraLeader: eraTop ? `${eraTop.playerName}(${eraTop.teamId}) ${eraTop.displayValue}` : '-',
  };

  next.seasonHistory = [
    summary,
    ...(next.seasonHistory ?? []).filter((s) => s.season !== next.season),
  ].sort((a, b) => b.season - a.season);

  // Update KBO single-season records if broken
  const records = next.leagueHistory!.clubRecords;
  if (hrTop && hrTop.value > 56) {
    const idx = records.findIndex((r) => r.label === '한 시즌 최다 홈런');
    const rec = {
      label: '한 시즌 최다 홈런',
      value: `${Math.round(hrTop.value)} HR`,
      holder: `${hrTop.playerName} (${hrTop.teamId})`,
      season: next.season,
    };
    if (idx >= 0) records[idx] = rec;
    else records.unshift(rec);
  }
  const hTop = computeLeaderboards(next, 'H')[0];
  if (hTop && hTop.value > 202) {
    const idx = records.findIndex((r) => r.label === '한 시즌 최다 안타');
    const rec = {
      label: '한 시즌 최다 안타',
      value: `${Math.round(hTop.value)} H`,
      holder: `${hTop.playerName} (${hTop.teamId})`,
      season: next.season,
    };
    if (idx >= 0) records[idx] = rec;
    else records.unshift(rec);
  }
  const soTop = computeLeaderboards(next, 'SO')[0];
  if (soTop && soTop.value > 225) {
    const idx = records.findIndex((r) => r.label === '한 시즌 최다 탈삼진');
    const rec = {
      label: '한 시즌 최다 탈삼진',
      value: `${Math.round(soTop.value)} K`,
      holder: `${soTop.playerName} (${soTop.teamId})`,
      season: next.season,
    };
    if (idx >= 0) records[idx] = rec;
    else records.unshift(rec);
  }
}

// ============================================================================
// #1: 감독의 코치 추천 시스템 & 해외·국내 가상 코치 스카우팅
// ============================================================================

export interface ManagerCoachRecommendation {
  coach: Coach;
  targetRole: CoachRole;
  currentCoachName: string | null;
  currentCoachAbility: number;
  abilityGain: number;
  reason: string;
}

export function getManagerRecommendedCoaches(career: CareerSave): {
  managerName: string;
  recommendations: ManagerCoachRecommendation[];
} {
  const myStaff = career.coaches[career.playerTeamId] ?? [];
  const manager = myStaff.find((c) => c.role === '감독');
  const managerName = manager?.name ?? `${KBO_TEAMS[career.playerTeamId].shortName} 감독`;
  const faPool = career.faCoaches ?? [];

  const nonManagerRoles: CoachRole[] = ['투수코치', '타격코치', '배터리코치', '수비코치'];
  const recs: ManagerCoachRecommendation[] = [];

  for (const role of nonManagerRoles) {
    const current = myStaff.find((c) => c.role === role);
    const curAbility = current?.ability ?? 0;
    const candidates = faPool
      .filter((c) => c.role === role && c.ability > curAbility)
      .sort((a, b) => b.ability - a.ability);
    const top = candidates[0];
    if (!top) continue;

    const gain = top.ability - curAbility;
    const natTag = top.nationality && top.nationality !== '한국' ? ` (${top.nationality} 출신)` : '';
    const reason =
      role === '투수코치'
        ? `투수진 구위·제구 지도 및 컨디션 관리를 +${gain} 끌어올릴 적임자${natTag}입니다.`
        : role === '타격코치'
        ? `팀 컨택·장타·선구안 지도와 슬럼프 관리를 보강(+${gain})할 수 있습니다${natTag}.`
        : role === '배터리코치'
        ? `포수 프레이밍·볼배합 및 투포수 호흡을 한 단계(+${gain}) 강화할 수 있습니다${natTag}.`
        : `내·외야 수비 범위 확대와 실책 억제(+${gain})에 큰 도움이 됩니다${natTag}.`;

    recs.push({
      coach: top,
      targetRole: role,
      currentCoachName: current?.name ?? null,
      currentCoachAbility: curAbility,
      abilityGain: gain,
      reason,
    });
  }

  recs.sort((a, b) => b.abilityGain - a.abilityGain);
  return { managerName, recommendations: recs.slice(0, 3) };
}

export function scoutVirtualCoaches(
  career: CareerSave
): { nextCareer: CareerSave; backupSnapshot: CareerSave; addedCoaches: Coach[] } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const existingNames = new Set<string>([
    ...TEAM_IDS.flatMap((tid) => (next.coaches[tid] ?? []).map((c) => c.name)),
    ...(next.faCoaches ?? []).map((c) => c.name),
  ]);
  const added = generateFreshVirtualCoaches(next.rngState + (next.faCoaches?.length ?? 0) * 31, existingNames, 5);
  next.faCoaches = [...added, ...(next.faCoaches ?? [])];
  next.rngState = (next.rngState + 7919) % 2147483647;
  next.transactionLogs.unshift({
    id: `tx-scout-coach-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '계약',
    teamId: next.playerTeamId,
    summary: `한국·일본·미국 가상 코칭스태프 ${added.length}명 스카우팅 완료`,
    detail: added.map((c) => `${c.role} ${c.name}(${c.nationality ?? '한국'}, 능력 ${c.ability})`).join(', '),
  });
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, addedCoaches: added };
}

// ============================================================================
// #5: KBO 공식 규정 & 매 시즌 자동 규칙 추가·수정·폐지 시스템
// ============================================================================

export const INITIAL_2026_KBO_RULES: KboRuleItem[] = [
  {
    id: 'rule-abs-2026',
    name: 'ABS 자동 투구 판정 시스템',
    category: '판정·장비',
    description: '전 구장 자동 볼·스트라이크 판정 시스템(ABS) 전면 시행 (선수 신장 비례 존 적용)',
    introducedSeason: 2024,
    effectSummary: '제구력 우수 투수 및 선구안 우수 타자 변별력 강화',
    runEnvDelta: 0,
  },
  {
    id: 'rule-pitch-clock-2026',
    name: 'KBO 피치클락 공식 시행',
    category: '경기운영',
    description: '주자 없을 때 18초, 주자 있을 때 23초 내 투구 의무화 및 타자 8초 준비 규정',
    introducedSeason: 2025,
    effectSummary: '경기 템포 가속 및 투수 피로 관리 중요도 상승',
    runEnvDelta: 0.01,
  },
  {
    id: 'rule-extra-innings-2026',
    name: '정규시즌 연장 11회 제한',
    category: '경기운영',
    description: '정규시즌 연장전은 최대 11회까지 진행하며 동점 시 무승부 처리 (승부치기 미적용)',
    introducedSeason: 2025,
    effectSummary: '연장 최대 11회 · 불펜 과부하 방지',
    extraInningCap: 11,
    extraInningTiebreaker: false,
  },
  {
    id: 'rule-foreign-asia-2026',
    name: '외국인 3명 + 아시아쿼터 1명 보유제',
    category: '로스터·외국인',
    description: '구단당 일반 외국인 최대 3명(투수 최대 2명) + 아시아쿼터 1명 별도 보유 허용',
    introducedSeason: 2026,
    effectSummary: '외국인 샐러리캡 $400만 · 아시아쿼터 1명',
    asiaQuotaLimit: 1,
    foreignSalaryCapUsd: 4000000,
  },
  {
    id: 'rule-shift-limit-2026',
    name: '내야 수비 시프트 제한 규정',
    category: '경기운영',
    description: '투구 시 내야수 4명 전원 내야 흙 경계 안쪽 배치 및 2루 베이스 좌우 각 2명 배치 의무화',
    introducedSeason: 2024,
    effectSummary: '인플레이 타구 안타율 소폭 상승 (+1%)',
    runEnvDelta: 0.01,
  },
  {
    id: 'rule-draft-reverse-2026',
    name: '신인 드래프트 직전시즌 성적 역순 전면 지명',
    category: 'FA·드래프트',
    description: '전면 드래프트 방식으로 직전 정규시즌 10위→1위 역순 지명 진행',
    introducedSeason: 2023,
    effectSummary: '하위 구단 전력 평준화 지원',
  },
];

const DYNAMIC_KBO_RULE_POOL: Omit<KboRuleItem, 'introducedSeason'>[] = [
  {
    id: 'rule-tiebreaker-extra',
    name: '정규시즌 연장전 승부치기 도입',
    category: '경기운영',
    description: '정규시즌 연장 10회부터 무사 주자 2루 승부치기를 도입해 무승부 비율을 축소합니다.',
    effectSummary: '연장 득점 확률 상승 · 무승부 감소',
    extraInningTiebreaker: true,
    extraInningCap: 11,
    runEnvDelta: 0.02,
  },
  {
    id: 'rule-abs-zone-narrow',
    name: 'ABS 스트라이크 존 하향·축소 조정',
    category: '판정·장비',
    description: 'ABS 상하단 존을 1cm 축소해 볼넷과 장타가 늘어나는 타고투저 환경으로 미세 조정합니다.',
    effectSummary: '리그 득점력 소폭 상승 (+3%)',
    runEnvDelta: 0.03,
  },
  {
    id: 'rule-abs-zone-wide',
    name: 'ABS 스트라이크 존 모서리 확대',
    category: '판정·장비',
    description: 'ABS 좌우 보더라인 판정을 완화해 투수들의 유인구·보더라인 제구 효율을 높입니다.',
    effectSummary: '리그 투수력 강화 (득점 -3%)',
    runEnvDelta: -0.03,
  },
  {
    id: 'rule-check-swing-review',
    name: '체크스윙 비디오 판독 공식 도입',
    category: '판정·장비',
    description: '배트 헤드가 홈플레이트 앞면을 통과했는지 전용 카메라로 판독하는 체크스윙 챌린지를 시행합니다.',
    effectSummary: '삼진·볼넷 판정 정확도 향상',
    runEnvDelta: -0.01,
  },
  {
    id: 'rule-three-batter-min',
    name: '구원투수 최소 3타자 상대 규정',
    category: '경기운영',
    description: '이닝 종료가 아닌 한 등판한 구원투수는 최소 3명의 타자를 상대해야 교체할 수 있습니다.',
    effectSummary: '원포인트 릴리프 축소 · 경기 시간 단축 (+1.5% 득점)',
    runEnvDelta: 0.015,
  },
  {
    id: 'rule-asia-quota-expand',
    name: '아시아쿼터 최대 2명 확대안',
    category: '로스터·외국인',
    description: '리그 국제 경쟁력 강화를 위해 구단별 아시아쿼터 보유 한도를 최대 2명으로 확대합니다.',
    effectSummary: '아시아쿼터 2명 보유 허용 · 외국인 샐러리캡 $450만',
    asiaQuotaLimit: 2,
    foreignSalaryCapUsd: 4500000,
  },
  {
    id: 'rule-larger-bases',
    name: '1·2·3루 대형 베이스 확대 규격 적용',
    category: '판정·장비',
    description: '주자 부상 방지와 기동력 야구 활성화를 위해 베이스 크기를 18인치로 확대합니다.',
    effectSummary: '도루 성공률 및 내야 안타 소폭 증가 (+1.5%)',
    runEnvDelta: 0.015,
  },
  {
    id: 'rule-extra-12-restore',
    name: '정규시즌 연장 12회 복원',
    category: '경기운영',
    description: '끝장 승부 강화를 위해 정규시즌 연장전 최대 이닝을 11회에서 12회로 연장합니다.',
    effectSummary: '연장 최대 12회 진행',
    extraInningCap: 12,
  },
];

export function getActiveKboRuleModifiers(career: CareerSave): {
  runEnvMultiplier: number;
  extraInningCap: number;
  hasTiebreaker: boolean;
  asiaQuotaLimit: number;
} {
  const rules = career.activeKboRules ?? INITIAL_2026_KBO_RULES;
  let delta = 0;
  let extraInningCap = 11;
  let hasTiebreaker = false;
  let asiaQuotaLimit = 1;

  for (const r of rules) {
    if (r.runEnvDelta) delta += r.runEnvDelta;
    if (r.extraInningCap) extraInningCap = r.extraInningCap;
    if (r.extraInningTiebreaker) hasTiebreaker = true;
    if (r.asiaQuotaLimit && r.asiaQuotaLimit > asiaQuotaLimit) asiaQuotaLimit = r.asiaQuotaLimit;
  }

  return {
    runEnvMultiplier: Math.max(0.92, Math.min(1.08, 1 + delta)),
    extraInningCap,
    hasTiebreaker,
    asiaQuotaLimit,
  };
}

export function evolveAnnualKboRules(next: CareerSave, rng: SeededRng): KboRuleChangeLog[] {
  ensureFranchiseState(next);
  const changes: KboRuleChangeLog[] = [];
  const rules = next.activeKboRules!;
  const dateStr = `${next.season}-02-15`;

  // 1) Add a new rule not currently active (or modify an existing rule)
  const inactivePool = DYNAMIC_KBO_RULE_POOL.filter((cand) => !rules.some((r) => r.id === cand.id));
  if (inactivePool.length > 0) {
    const picked = inactivePool[rng.int(0, inactivePool.length - 1)];
    const newRule: KboRuleItem = { ...picked, introducedSeason: next.season };
    rules.push(newRule);
    const log: KboRuleChangeLog = {
      id: `rulelog-add-${next.season}-${newRule.id}`,
      season: next.season,
      action: '추가',
      ruleName: newRule.name,
      detail: `${newRule.description} (${newRule.effectSummary})`,
    };
    changes.push(log);
    next.ruleChangeHistory!.unshift(log);
  } else if (rules.length > 0) {
    // Modify an existing rule's balance
    const target = rules[rng.int(0, rules.length - 1)];
    const shift = rng.next() < 0.5 ? 0.01 : -0.01;
    target.runEnvDelta = Number(((target.runEnvDelta ?? 0) + shift).toFixed(3));
    target.effectSummary = `${next.season}시즌 세부 지침 개정 (${shift > 0 ? '타격 소폭 유리' : '투구 소폭 유리'})`;
    const log: KboRuleChangeLog = {
      id: `rulelog-mod-${next.season}-${target.id}`,
      season: next.season,
      action: '수정',
      ruleName: target.name,
      detail: `${next.season}시즌 KBO 실행위원회 세부 지침 개정: ${target.effectSummary}`,
    };
    changes.push(log);
    next.ruleChangeHistory!.unshift(log);
  }

  // 2) Occasionally abolish/replace an older non-core rule so the rulebook truly evolves (add + modify + remove)
  const removable = rules.filter(
    (r) =>
      r.id !== 'rule-abs-2026' &&
      r.id !== 'rule-foreign-asia-2026' &&
      r.id !== 'rule-draft-reverse-2026' &&
      r.introducedSeason < next.season
  );
  if (removable.length > 0 && rng.next() < 0.45) {
    const target = removable[rng.int(0, removable.length - 1)];
    const idx = rules.findIndex((r) => r.id === target.id);
    if (idx >= 0) {
      rules.splice(idx, 1);
      const log: KboRuleChangeLog = {
        id: `rulelog-del-${next.season}-${target.id}`,
        season: next.season,
        action: '폐지',
        ruleName: target.name,
        detail: `${next.season}시즌 실행위원회 평가 결과 기존 '${target.name}' 규정이 폐지·정비되었습니다.`,
      };
      changes.push(log);
      next.ruleChangeHistory!.unshift(log);
    }
  } else if (rules.length > 0 && rng.next() < 0.55) {
    const pitchClock = rules.find((r) => r.id === 'rule-pitch-clock-2026');
    if (pitchClock) {
      const tighter = next.season % 2 === 1;
      pitchClock.description = tighter
        ? '주자 없을 때 16초, 주자 있을 때 21초로 피치클락을 단축 운영합니다.'
        : '주자 없을 때 18초, 주자 있을 때 23초 표준 피치클락으로 운영합니다.';
      pitchClock.effectSummary = tighter ? '초고속 템포 · 투수 체력 소모 증가' : '표준 피치클락 운영';
      const log: KboRuleChangeLog = {
        id: `rulelog-mod-pc-${next.season}`,
        season: next.season,
        action: '수정',
        ruleName: pitchClock.name,
        detail: pitchClock.description,
      };
      changes.push(log);
      next.ruleChangeHistory!.unshift(log);
    }
  }

  if (changes.length > 0) {
    pushNews(next, {
      date: dateStr,
      category: '규정·웨이버',
      headline: `[${next.season} KBO 규칙 개정] ${changes.map((c) => `${c.ruleName}(${c.action})`).join(', ')}`,
      body: changes.map((c) => `• [${c.action}] ${c.ruleName}: ${c.detail}`).join(' '),
      isHighlight: true,
    });
  }

  return changes;
}

// ============================================================================
// #2: MLB 진출 선수 현황 & 타 구단 주요 소식 뉴스 시스템
// ============================================================================

export const INITIAL_MLB_EXPORTS: MlbExportPlayerRecord[] = [
  {
    id: 'mlb-lee-junghoo',
    playerName: '이정후',
    fromKboTeamId: '키움',
    position: 'CF',
    role: '타자',
    mlbTeam: 'San Francisco Giants',
    seasonExported: 2024,
    contractYears: 6,
    guaranteedUsdMillions: 113,
    status: '메이저리그 주전',
    latestStatLine: '타율 .284 · 11홈런 · 54타점 · OPS .782',
    lastUpdatedDate: '2026-03-25',
    mlbGames: 0,
    mlbAVG: 0.284,
    mlbHR: 0,
  },
  {
    id: 'mlb-kim-haseong',
    playerName: '김하성',
    fromKboTeamId: '키움',
    position: 'SS',
    role: '타자',
    mlbTeam: 'Tampa Bay Rays',
    seasonExported: 2021,
    contractYears: 2,
    guaranteedUsdMillions: 29,
    status: '메이저리그 주전',
    latestStatLine: '타율 .252 · 14홈런 · 22도루 · 골드글러브급 수비',
    lastUpdatedDate: '2026-03-25',
    mlbGames: 0,
    mlbAVG: 0.252,
    mlbHR: 0,
  },
  {
    id: 'mlb-kim-hyeseong',
    playerName: '김혜성',
    fromKboTeamId: '키움',
    position: '2B',
    role: '타자',
    mlbTeam: 'Los Angeles Dodgers',
    seasonExported: 2025,
    contractYears: 3,
    guaranteedUsdMillions: 12.5,
    status: '메이저리그 로스터',
    latestStatLine: '타율 .268 · 6홈런 · 19도루 · 유틸리티 출전',
    lastUpdatedDate: '2026-03-25',
    mlbGames: 0,
    mlbAVG: 0.268,
    mlbHR: 0,
  },
];

export function recordMlbExportPlayer(
  next: CareerSave,
  player: Player,
  mlbTeam: string,
  years: number,
  guaranteedUsdMillions: number,
  dateStr: string,
  exportRoute: '포스팅' | '해외FA' | '외국인역수출' = '포스팅'
): void {
  ensureFranchiseState(next);
  const fromTeamId = player.formerTeamId ?? player.teamId;
  const routeLabel =
    exportRoute === '해외FA'
      ? '해외 FA'
      : exportRoute === '외국인역수출'
      ? '외국인 MLB 역수출'
      : '포스팅';
  const rec: MlbExportPlayerRecord = {
    id: `mlb-${next.season}-${player.id}`,
    playerName: player.name,
    fromKboTeamId: fromTeamId,
    position: player.position,
    role: player.role,
    mlbTeam,
    seasonExported: next.season,
    contractYears: years,
    guaranteedUsdMillions,
    status: guaranteedUsdMillions >= 45 ? '메이저리그 주전' : '메이저리그 로스터',
    latestStatLine: `${next.season}시즌 ${mlbTeam} ${routeLabel} 입단 확정 (${years}년 $${guaranteedUsdMillions}M)`,
    lastUpdatedDate: dateStr,
    mlbGames: 0,
    exportRoute,
  };
  next.mlbExports = [rec, ...(next.mlbExports ?? []).filter((m) => m.playerName !== player.name)];
  const endSeason = next.season + Math.max(0, years - 1);
  appendPlayerMlbHistoryInPlace(
    player,
    mlbTeam,
    next.season,
    endSeason,
    `${next.season} MLB ${routeLabel} 진출 (${years}년 $${guaranteedUsdMillions}M)`
  );

  // 기존 해외파 추적 시스템(amateurAndOverseas.overseasPlayers)에도 즉시 소속팀·계약 반영
  if (player.category === '국내' && next.amateurAndOverseas?.overseasPlayers) {
    const permId = player.permanentId ?? player.id;
    const existing = next.amateurAndOverseas.overseasPlayers.find(
      (o) => o.permanentId === permId || o.sourceKboPlayerId === player.id || o.name === player.name
    );
    const annualSalaryUsdThousands = Math.round((guaranteedUsdMillions / Math.max(1, years)) * 1000);
    const startCfg = determineInitialOverseasLeague({
      originCategory: 'KBO출신(포스팅·FA)',
      age: player.age,
      ability: player.ability,
      potential: player.potential,
      annualSalaryUsdThousands,
      guaranteedUsdMillions,
      clubName: mlbTeam,
    });
    if (existing) {
      existing.league = startCfg.league;
      existing.clubName = mlbTeam;
      existing.contractYearsRemaining = years;
      existing.annualSalaryUsdThousands = annualSalaryUsdThousands;
      existing.contractType = startCfg.contractType;
      existing.minorOptionsRemaining = startCfg.minorOptionsRemaining;
      existing.rosterCompetition = startCfg.rosterCompetition;
      existing.status = '현역';
      existing.transferHistory = [
        {
          date: dateStr,
          season: next.season,
          eventType: '계약',
          fromClub: KBO_TEAMS[fromTeamId].name,
          toClub: `${mlbTeam} (${startCfg.league})`,
          toLeague: startCfg.league,
          note: `MLB ${routeLabel} ${years}년 $${guaranteedUsdMillions}M 계약 (${startCfg.league} 시작)`,
        },
        ...(existing.transferHistory ?? []),
      ];
      ensureOverseasProgressionFieldsInPlace(existing, next.season);
    } else {
      const createdOv = {
        permanentId: permId,
        sourceKboPlayerId: player.id,
        name: player.name,
        birthYear: player.birthYear ?? next.season - player.age,
        birthDate: player.birthDate ?? null,
        age: player.age,
        role: player.role,
        position: player.position,
        ability: player.ability,
        potential: player.potential,
        originCategory: 'KBO출신(포스팅·FA)' as const,
        originalKboTeamId: fromTeamId,
        league: startCfg.league,
        clubName: mlbTeam,
        contractYearsRemaining: years,
        annualSalaryUsdThousands,
        contractType: startCfg.contractType,
        minorOptionsRemaining: startCfg.minorOptionsRemaining,
        rosterCompetition: startCfg.rosterCompetition,
        status: '현역' as const,
        returnRestrictionActive: false,
        returnRestrictionNote:
          exportRoute === '해외FA'
            ? `KBO 해외 FA MLB 진출 (${KBO_TEAMS[fromTeamId].shortName} 출신) — 국내 복귀 시 KBO FA 규약 적용`
            : `KBO 포스팅 MLB 진출 (${KBO_TEAMS[fromTeamId].shortName} 원소속) — 국내 복귀 시 원소속 구단 복귀 규정 적용`,
        currentSeasonStats: {
          season: next.season,
          league: startCfg.league,
          clubName: mlbTeam,
          g: 0,
          ...(player.role === '타자'
            ? { pa: 0, ab: 0, avg: 0, obp: 0, h: 0, hr: 0, rbi: 0, sb: 0, ops: 0 }
            : { w: 0, l: 0, era: 0, whip: 0, ip: 0, so: 0, hld: 0, sv: 0 }),
        },
        seasonHistory: [],
        transferHistory: [
          {
            date: dateStr,
            season: next.season,
            eventType: '계약' as const,
            fromClub: KBO_TEAMS[fromTeamId].name,
            toClub: `${mlbTeam} (${startCfg.league})`,
            toLeague: startCfg.league,
            note: `MLB ${routeLabel} ${years}년 $${guaranteedUsdMillions}M 계약 (${startCfg.league} 시작)`,
          },
        ],
        mlbDebutSeason: startCfg.league === 'MLB' ? next.season : undefined,
      };
      ensureOverseasProgressionFieldsInPlace(createdOv, next.season);
      next.amateurAndOverseas.overseasPlayers.unshift(createdOv);
    }
  }
}

export function simulateMlbExportsAndOtherClubNews(
  next: CareerSave,
  rng: SeededRng,
  dateStr: string,
  seriesGames: GameRecord[]
): void {
  ensureFranchiseState(next);
  const myTeam = next.playerTeamId;
  const seriesNo = next.currentSeriesIndex;

  // 1) Other 9 clubs headline news every 2 series (sweep, hot streak, rival star performance, standings shakeup)
  if (seriesNo % 2 === 0 && seriesGames.length > 0) {
    const standings = computeStandings(next.gamesLedger);
    const otherClubs = standings.filter((s) => s.teamId !== myTeam);
    // Check if any other club swept this 3-game series
    const seriesWins = new Map<TeamId, number>();
    for (const g of seriesGames) {
      if (g.winner && g.winner !== '무승부' && g.winner !== myTeam) {
        seriesWins.set(g.winner, (seriesWins.get(g.winner) ?? 0) + 1);
      }
    }
    const sweeper = Array.from(seriesWins.entries()).find(([, w]) => w >= 3);
    if (sweeper) {
      const [sweepTid] = sweeper;
      const st = standings.find((r) => r.teamId === sweepTid);
      const star = Object.values(next.players)
        .filter((p) => p.teamId === sweepTid && p.rosterTier === '1군')
        .sort((a, b) => b.ability - a.ability)[0];
      pushNews(next, {
        date: dateStr,
        category: '타구단소식',
        headline: `[타구단 소식] ${KBO_TEAMS[sweepTid].name}, 3연전 스윕 질주… 시즌 ${st?.rank ?? '-'}위 도약`,
        body: `${KBO_TEAMS[sweepTid].name}이(가) 이번 3연전을 전승으로 쓸어 담으며 시즌 ${st?.wins ?? 0}승 ${st?.losses ?? 0}패를 기록했습니다. ${star ? `주축 ${star.name}(${star.position})의 활약이 빛났습니다.` : ''}`,
        teamId: sweepTid,
      });
    } else if (otherClubs.length > 0) {
      const leader = otherClubs[0];
      const hotStreak = otherClubs.find((c) => c.streak.startsWith('W') && Number(c.streak.slice(1)) >= 4);
      const coldStreak = otherClubs.find((c) => c.streak.startsWith('L') && Number(c.streak.slice(1)) >= 4);
      const picked = hotStreak ?? coldStreak ?? leader;
      const isHot = picked.streak.startsWith('W');
      pushNews(next, {
        date: dateStr,
        category: '타구단소식',
        headline: isHot
          ? `[타구단 소식] ${KBO_TEAMS[picked.teamId].shortName} ${picked.streak.slice(1)}연승 상승세, 리그 ${picked.rank}위 순항`
          : `[타구단 소식] ${KBO_TEAMS[picked.teamId].shortName}, 연패 탈출 총력전 (${picked.wins}승 ${picked.losses}패)`,
        body: `${KBO_TEAMS[picked.teamId].name}이(가) 시즌 ${picked.games}경기 기준 ${picked.wins}승 ${picked.losses}패(승률 ${picked.pct.toFixed(3)}, ${picked.rank}위)로 치열한 순위 경쟁을 이어가고 있습니다.`,
        teamId: picked.teamId,
      });
    }
  }

  // 2) Update MLB-exported Korean players every 4 series & publish MLB report
  if (seriesNo > 0 && seriesNo % 4 === 0 && (next.mlbExports?.length ?? 0) > 0) {
    for (const exp of next.mlbExports!) {
      exp.mlbGames = Math.min(162, exp.mlbGames + rng.int(8, 12));
      if (exp.role === '타자') {
        const avg = Number((0.235 + rng.next() * 0.085).toFixed(3));
        const addHr = rng.int(0, 3);
        exp.mlbAVG = avg;
        exp.mlbHR = (exp.mlbHR ?? 0) + addHr;
        exp.status = avg >= 0.295 ? '올스타급 활약' : avg >= 0.255 ? '메이저리그 주전' : '메이저리그 로스터';
        exp.latestStatLine = `${exp.mlbGames}G 타율 ${avg.toFixed(3).replace(/^0/, '')} · ${exp.mlbHR}홈런 (${exp.mlbTeam})`;
      } else {
        const era = Number((2.65 + rng.next() * 2.1).toFixed(2));
        exp.mlbERA = era;
        exp.mlbWins = (exp.mlbWins ?? 0) + (rng.next() < 0.45 ? 1 : 0);
        exp.mlbSO = (exp.mlbSO ?? 0) + rng.int(6, 15);
        exp.status = era <= 3.15 ? '올스타급 활약' : era <= 4.15 ? '메이저리그 주전' : '메이저리그 로스터';
        exp.latestStatLine = `${exp.mlbGames}G ${exp.mlbWins}승 · ${exp.mlbSO}K · ERA ${era.toFixed(2)} (${exp.mlbTeam})`;
      }
      exp.lastUpdatedDate = dateStr;
    }

    const spotlight = next.mlbExports![(seriesNo / 4) % next.mlbExports!.length];
    if (spotlight) {
      pushNews(next, {
        date: dateStr,
        category: 'MLB소식',
        headline: `[MLB 진출 소식] ${spotlight.playerName}(${spotlight.mlbTeam}), ${spotlight.status} — ${spotlight.latestStatLine}`,
        body: `전 ${KBO_TEAMS[spotlight.fromKboTeamId].name} 소속 ${spotlight.playerName} 선수가 미국 메이저리그 ${spotlight.mlbTeam}에서 ${spotlight.latestStatLine} 성적을 기록하며 존재감을 입증하고 있습니다.`,
        teamId: spotlight.fromKboTeamId,
        isHighlight: spotlight.status === '올스타급 활약',
      });
    }
  }
}

function getRecentMlbStatScoreForAiPosting(p: Player): number {
  if (p.role === '타자') {
    const s = p.stats as BatterStats;
    const pa = s.PA ?? 0;
    if (pa < 120) return 0;
    const ab = Math.max(1, s.AB ?? 0);
    const avg = (s.H ?? 0) / ab;
    const obp = ((s.H ?? 0) + (s.BB ?? 0) + (s.HBP ?? 0)) / Math.max(1, pa);
    const tb =
      s.TB ?? (s.H ?? 0) + (s.B2 ?? 0) + (s.B3 ?? 0) * 2 + (s.HR ?? 0) * 3;
    const ops = obp + tb / ab;
    let delta = 0;
    if (ops >= 0.92) delta += 4;
    else if (ops >= 0.85) delta += 2;
    else if (ops < 0.74) delta -= 4;
    if (avg >= 0.31 || (s.HR ?? 0) >= 24) delta += 1;
    return delta;
  }
  const s = p.stats as PitcherStats;
  const outs = s.outs ?? 0;
  if (outs < 120) return 0;
  const ip = outs / 3;
  const era = ((s.ER ?? 0) * 9) / Math.max(1, ip);
  let delta = 0;
  if (era <= 2.75) delta += 4;
  else if (era <= 3.35) delta += 2;
  else if (era >= 4.4) delta -= 4;
  if ((s.W ?? 0) >= 13 || (s.SV ?? 0) >= 28) delta += 1;
  return delta;
}

export function processOffseasonOtherClubMlbPostings(next: CareerSave, rng: SeededRng): void {
  ensureFranchiseState(next);
  // AI 구단 포스팅도 능력치 + 나이 + 최근 성적 기준을 엄격하게 적용해 최상위권 선수 위주로만 발생
  const candidates = Object.values(next.players)
    .filter((p) => {
      if (
        p.teamId === next.playerTeamId ||
        p.category !== '국내' ||
        p.rosterTier !== '1군' ||
        p.serviceYears < 7 ||
        p.age < 24 ||
        p.age > 31 ||
        p.ability < 85
      ) {
        return false;
      }
      const statDelta = getRecentMlbStatScoreForAiPosting(p);
      const agePenalty = p.age >= 30 ? -2 : 0;
      return p.ability + statDelta + agePenalty >= 86;
    })
    .sort(
      (a, b) =>
        b.ability + getRecentMlbStatScoreForAiPosting(b) - (a.ability + getRecentMlbStatScoreForAiPosting(a))
    );

  // 최상위권이라도 포스팅 진입 장벽 유지 (~32% 확률)
  if (candidates.length === 0 || rng.next() > 0.32) return;
  const target = candidates[0];
  const mlbTeam = MLB_CLUBS[rng.int(0, MLB_CLUBS.length - 1)];
  const years = target.age >= 30 ? rng.int(3, 4) : rng.int(4, 6);
  const usdM = Math.round(35 + (target.ability - 85) * 10 + rng.int(0, 18));
  const dateStr = `${next.season}-12-10`;

  target.rosterTier = '해외이적';
  target.gameDayActive = false;
  const t = next.teams[target.teamId];
  t.lineupOrder = t.lineupOrder.filter((id) => id !== target.id);
  t.benchOrder = t.benchOrder.filter((id) => id !== target.id);
  t.rotationOrder = t.rotationOrder.filter((id) => id !== target.id);
  t.bullpenOrder = t.bullpenOrder.filter((id) => id !== target.id);

  recordMlbExportPlayer(next, target, mlbTeam, years, usdM, dateStr, '포스팅');
  pushNews(next, {
    date: dateStr,
    category: 'MLB소식',
    headline: `[MLB 포스팅 진출 확정] ${KBO_TEAMS[target.teamId].shortName} ${target.name}, ${mlbTeam}과 ${years}년 $${usdM}M 계약!`,
    body: `${KBO_TEAMS[target.teamId].name} 간판 스타 ${target.name}(${target.position}, ${target.age}세)가 구단 승인을 거쳐 포스팅 시스템을 통해 ${mlbTeam} 유니폼을 입으며 빅리그 진출에 성공했습니다.`,
    teamId: target.teamId,
    isHighlight: true,
  });
}

// ============================================================================
// #6: KBO 통산 기록 이정표 및 통산 신기록 실시간 감지/갱신
// ============================================================================

export function checkCareerMilestonesAndRecords(next: CareerSave, dateStr: string): void {
  ensureFranchiseState(next);
  const records = next.leagueHistory!.clubRecords;

  const updateAllTimeRecord = (label: string, valueNum: number, formattedValue: string, holder: string) => {
    const idx = records.findIndex((r) => r.label === label);
    const existingVal = idx >= 0 ? Number(records[idx].value.replace(/[^\d.]/g, '')) : 0;
    if (valueNum > existingVal) {
      const rec = { label, value: formattedValue, holder, season: next.season };
      if (idx >= 0) records[idx] = rec;
      else records.push(rec);
    }
  };

  let bestCareerHR = { val: 495, name: '최정', teamId: 'SSG' as TeamId };
  let bestCareerH = { val: 2511, name: '손아섭', teamId: '한화' as TeamId };
  let bestCareerW = { val: 210, name: '송진우', teamId: '한화' as TeamId };
  let bestCareerSO = { val: 2076, name: '양현종', teamId: 'KIA' as TeamId };

  for (const p of Object.values(next.players)) {
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') continue;
    const live = getLiveCareerStats(p);
    if (p.role === '타자') {
      const b = live as CareerBatterStats;
      if (b.HR > bestCareerHR.val) bestCareerHR = { val: b.HR, name: p.name, teamId: p.teamId };
      if (b.H > bestCareerH.val) bestCareerH = { val: b.H, name: p.name, teamId: p.teamId };
    } else {
      const pi = live as CareerPitcherStats;
      if (pi.W > bestCareerW.val) bestCareerW = { val: pi.W, name: p.name, teamId: p.teamId };
      if (pi.SO > bestCareerSO.val) bestCareerSO = { val: pi.SO, name: p.name, teamId: p.teamId };
    }
  }

  const prevHrRec = records.find((r) => r.label === 'KBO 통산 최다 홈런');
  const prevHrNum = prevHrRec ? Number(prevHrRec.value.replace(/[^\d]/g, '')) : 495;
  if (bestCareerHR.val > prevHrNum) {
    updateAllTimeRecord('KBO 통산 최다 홈런', bestCareerHR.val, `${bestCareerHR.val} HR`, `${bestCareerHR.name} (${bestCareerHR.teamId})`);
    if (bestCareerHR.val >= 500 && prevHrNum < 500) {
      pushNews(next, {
        date: dateStr,
        category: '수상·이달의선수',
        headline: `[KBO 대기록] ${bestCareerHR.name}(${bestCareerHR.teamId}), 전인미답 통산 ${bestCareerHR.val}홈런 신기록!`,
        body: `${KBO_TEAMS[bestCareerHR.teamId].name} ${bestCareerHR.name} 선수가 KBO 리그 통산 ${bestCareerHR.val}홈런 금자탑을 세우며 역대 기록을 새롭게 썼습니다.`,
        teamId: bestCareerHR.teamId,
        isHighlight: true,
      });
    }
  }
  updateAllTimeRecord('KBO 통산 최다 안타', bestCareerH.val, `${bestCareerH.val.toLocaleString()} H`, `${bestCareerH.name} (${bestCareerH.teamId})`);
  updateAllTimeRecord('KBO 통산 최다 탈삼진', bestCareerSO.val, `${bestCareerSO.val.toLocaleString()} K`, `${bestCareerSO.name} (${bestCareerSO.teamId})`);
  if (bestCareerW.val > 210) {
    updateAllTimeRecord('KBO 통산 최다승', bestCareerW.val, `${bestCareerW.val} 승`, `${bestCareerW.name} (${bestCareerW.teamId})`);
  }
}

// ============================================================================
// #5: 국가대표 소집 여부 판정 & 대회 종료 후 자동 복귀
// ============================================================================

export function isPlayerOnNationalTeamDuty(player: Player, currentGamesPlayed: number): boolean {
  return Boolean(player.nationalTeamDuty && currentGamesPlayed < player.nationalTeamDuty.endRound);
}

export function releaseReturnedNationalTeamPlayers(
  next: CareerSave,
  currentGamesPlayed: number,
  dateStr: string
): string[] {
  const returnedNames: string[] = [];
  const returnedMyNames: string[] = [];
  let tournamentTitle = next.activeNationalTeamDuty?.tournamentName ?? '국가대표 대회';

  for (const p of Object.values(next.players)) {
    if (p.nationalTeamDuty && currentGamesPlayed >= p.nationalTeamDuty.endRound) {
      tournamentTitle = p.nationalTeamDuty.tournamentName;
      p.nationalTeamDuty = null;
      returnedNames.push(p.name);
      if (p.teamId === next.playerTeamId) {
        returnedMyNames.push(p.name);
      }
    }
  }

  if (next.activeNationalTeamDuty && currentGamesPlayed >= next.activeNationalTeamDuty.endRound) {
    next.activeNationalTeamDuty = null;
  }

  if (returnedMyNames.length > 0) {
    pushNews(next, {
      date: dateStr,
      category: '국제·병역',
      headline: `[국가대표 복귀] ${KBO_TEAMS[next.playerTeamId].shortName} ${returnedMyNames.join('·')}, ${tournamentTitle} 마치고 정규시즌 합류`,
      body: `${tournamentTitle} 대표팀 소집을 마친 ${returnedMyNames.join(', ')} 선수가 구단에 복귀해 다음 경기부터 즉시 출장이 가능합니다.`,
      teamId: next.playerTeamId,
      isHighlight: true,
    });
  }

  return returnedNames;
}

// ============================================================================
// #4: 한국식 계약 기간 · 총액 표기 헬퍼 (예: "4년 총액 48억 원")
// ============================================================================

export function formatKrwBillionKorean(amountBillion: number): string {
  const rounded = Number(amountBillion.toFixed(2));
  if (Math.abs(rounded - Math.round(rounded)) < 0.005) {
    return `${Math.round(rounded)}억 원`;
  }
  if (Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.05) {
    return `${rounded.toFixed(1)}억 원`;
  }
  return `${rounded.toFixed(2)}억 원`;
}

export function formatKrwContractSummary(params: {
  years: number;
  totalBillion: number;
  annualSalaryBillion?: number;
  signingBonusBillion?: number;
  startSeason?: number;
}): string {
  const { years, totalBillion, annualSalaryBillion, signingBonusBillion, startSeason } = params;
  const totalStr = formatKrwBillionKorean(totalBillion);
  const seasonRange = startSeason
    ? ` (${startSeason}~${startSeason + Math.max(1, years) - 1})`
    : '';
  const detailParts: string[] = [];
  if (annualSalaryBillion !== undefined) {
    detailParts.push(`연 ${formatKrwBillionKorean(annualSalaryBillion).replace(' 원', '')}`);
  }
  if (signingBonusBillion && signingBonusBillion > 0) {
    detailParts.push(`계약금 ${formatKrwBillionKorean(signingBonusBillion).replace(' 원', '')}`);
  }
  const detailStr = detailParts.length > 0 ? ` · ${detailParts.join(' + ')}` : '';
  return `${years}년 총액 ${totalStr}${seasonRange}${detailStr}`;
}

// ============================================================================
// #2: 시즌 종료 시 소속 스타 선수 MLB 포스팅 직접 신청 요구
// ============================================================================

export function generateEndOfSeasonPostingRequests(next: CareerSave): Player[] {
  ensureFranchiseState(next);
  const myTeam = next.playerTeamId;
  const dateStr = `${next.season}-11-12`;
  const existingReqIds = new Set(
    (next.complaints ?? [])
      .filter((c) => !c.resolved && c.reason === '포스팅희망')
      .map((c) => c.playerId)
  );

  const eligible = Object.values(next.players)
    .filter(
      (p) =>
        p.teamId === myTeam &&
        p.category === '국내' &&
        p.rosterTier === '1군' &&
        !p.postedThisYear &&
        !p.postingBlockedUntilNextNov &&
        !existingReqIds.has(p.id) &&
        p.serviceYears >= 7 &&
        p.age >= 24 &&
        p.age <= 31 &&
        p.ability >= 82
    )
    .sort((a, b) => b.ability - a.ability)
    .slice(0, 2);

  for (const p of eligible) {
    p.postingRequested = true;
    const comp: PlayerComplaint = {
      id: `comp-offseason-post-${next.season}-${p.id}`,
      playerId: p.id,
      playerName: p.name,
      position: p.position,
      reason: '포스팅희망',
      severity: '심각',
      message: `${next.season}시즌을 마친 ${p.name}(${p.age}세 · 능력 ${p.ability} · ${p.serviceYears}년차) 선수가 구단에 MLB 포스팅 시스템 공식 신청을 요청했습니다. [포스팅] 탭에서 즉시 공시하거나 잔류 면담을 진행하세요.`,
      createdDate: dateStr,
      unresolvedSeries: 0,
      resolved: false,
    };
    next.complaints!.unshift(comp);
    pushNews(next, {
      date: dateStr,
      category: 'MLB소식',
      headline: `[MLB 포스팅 요청] ${KBO_TEAMS[myTeam].shortName} ${p.name}, 시즌 종료 후 빅리그 도전 공식 요청`,
      body: `7시즌 이상 자격을 갖춘 ${p.name}(${p.position}, ${p.age}세) 선수가 ${next.season}시즌을 마치고 단장실에 MLB 포스팅 신청 허가를 요청했습니다. 구단이 승인하면 MLB 30개 구단 공개 입찰과 이적료 수익을 얻을 수 있습니다.`,
      teamId: myTeam,
      isHighlight: true,
    });
  }

  return eligible;
}

// ============================================================================
// #3: 구단 자금 투자 추천 시스템
// ============================================================================

export interface FinancialInvestmentRecommendation {
  id: string;
  kind: 'facility' | 'spend';
  targetKey: keyof ClubInvestments | OneTimeSpendDef['id'];
  title: string;
  costBillion: number;
  priority: '최우선' | '추천' | '고려';
  reason: string;
  expectedEffect: string;
  canAfford: boolean;
}

export function getFinancialInvestmentRecommendations(
  career: CareerSave
): FinancialInvestmentRecommendation[] {
  const cash = career.finances.cashBalanceBillion;
  const inv = career.finances.investments ?? DEFAULT_INVESTMENTS;
  const myTeam = career.playerTeamId;
  const myPlayers = Object.values(career.players).filter(
    (p) => p.teamId === myTeam && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
  );
  const injuredCount = myPlayers.filter((p) => Boolean(p.injury)).length;
  const highFatigueCount = myPlayers.filter((p) => p.rosterTier === '1군' && p.fatigue >= 55).length;
  const youngProspects = myPlayers.filter((p) => p.age <= 24 && p.potential >= 80).length;
  const fanSentiment = career.teams[myTeam]?.fanSentiment ?? 65;
  const pop = career.teams[myTeam]?.popularity ?? 70;

  const scored: (FinancialInvestmentRecommendation & { score: number })[] = [];

  for (const fac of FACILITY_UPGRADES) {
    const level = inv[fac.key] ?? 1;
    if (level >= 5) continue;
    const cost = fac.costsByNextLevel[level + 1] ?? 15;
    const canAfford = cash !== null && cash >= cost;
    let score = 60 - level * 8;
    let reason = '';

    if (fac.key === 'stadiumLevel') {
      score += pop >= 75 ? 24 : 16;
      reason = `홈 구장 관중 수요(인기도 ${pop})를 수익으로 직결시켜 매 3연전 티켓 매출을 극대화합니다.`;
    } else if (fac.key === 'marketingLevel') {
      score += fanSentiment < 70 ? 22 : 15;
      reason = `유니폼·MD 판매 단가와 팬 여론(${fanSentiment}/100)을 동시에 끌어올려 장기 흑자 기반을 만듭니다.`;
    } else if (fac.key === 'academyLevel') {
      score += youngProspects * 2.5 + 10;
      reason = `만 24세 이하 유망주(${youngProspects}명)의 10경기 성장 평가와 잠재력 발현 효율을 크게 높입니다.`;
    } else if (fac.key === 'medicalLevel') {
      score += injuredCount * 14 + highFatigueCount * 4 + 8;
      reason =
        injuredCount > 0 || highFatigueCount >= 3
          ? `현재 부상자 ${injuredCount}명·고피로 선수 ${highFatigueCount}명 발생 중 — 부상 재발 억제와 빠른 회복이 시급합니다.`
          : `장기 레이스 투수·주전 야수 피로 누적과 시즌 중반 부상 이탈 리스크를 선제적으로 낮춥니다.`;
    }
    if (canAfford) score += 15;

    scored.push({
      id: `rec-fac-${fac.key}`,
      kind: 'facility',
      targetKey: fac.key,
      title: `${fac.name} (Lv.${level} → Lv.${level + 1})`,
      costBillion: cost,
      priority: score >= 82 ? '최우선' : score >= 68 ? '추천' : '고려',
      reason,
      expectedEffect: fac.effectPerLevel,
      canAfford,
      score,
    });
  }

  const activeSpends = getActiveOneTimeSpendOptions(career.finances.activeSpendOfferIds);
  for (const sp of activeSpends) {
    const canAfford = cash !== null && cash >= sp.costBillion;
    let score = 58 + (canAfford ? 16 : -10);
    if ((sp.id === 'FAN_FEST' || sp.id === 'BRAND_CAMPAIGN') && fanSentiment < 68) score += 16;
    if ((sp.id === 'CAMP' || sp.id === 'ANALYTICS' || sp.id === 'SCOUT') && career.gamesPlayed <= 36) score += 14;
    if (sp.id === 'REHAB_LAB' && (injuredCount > 0 || highFatigueCount >= 4)) score += 20;
    scored.push({
      id: `rec-spend-${sp.id}`,
      kind: 'spend',
      targetKey: sp.id,
      title: `[특훈·투자] ${sp.name}`,
      costBillion: sp.costBillion,
      priority: score >= 80 ? '최우선' : score >= 66 ? '추천' : '고려',
      reason: `즉시 효과가 반영되는 단기 집중 자금 집행입니다 (사용 후 신규 프로그램으로 자동 교체).`,
      expectedEffect: sp.effectSummary,
      canAfford,
      score,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _score, ...rest }) => rest);
}

// ============================================================================
// #8: 폼 좋은 선수 선발 기용 · 폼 안 좋은 선수 선발 제외 (코치 추천)
// ============================================================================

export interface CoachFormRecommendation {
  id: string;
  coachRole: '타격코치' | '투수코치';
  coachName: string;
  type: 'batter' | 'pitcher';
  outPlayerId: string;
  outPlayerName: string;
  outPlayerForm: number;
  outPlayerAbility: number;
  outReason: string;
  inPlayerId: string;
  inPlayerName: string;
  inPlayerForm: number;
  inPlayerAbility: number;
  inReason: string;
  slotIndex: number;
}

export function getCoachFormLineupRecommendations(career: CareerSave): CoachFormRecommendation[] {
  const myTeam = career.playerTeamId;
  const tState = career.teams[myTeam];
  const staff = career.coaches[myTeam] ?? [];
  const hitCoach = staff.find((c) => c.role === '타격코치');
  const pitCoach = staff.find((c) => c.role === '투수코치');
  const recs: CoachFormRecommendation[] = [];

  const canPlay = (p: Player) =>
    !p.injury &&
    !isPlayerOnNationalTeamDuty(p, career.gamesPlayed) &&
    p.rosterTier === '1군' &&
    !isMilitaryServing(p.militaryStatus) &&
    !p.overseasTrainingLocation;

  // 1) Batters: cold/unavailable starter vs hot bench hitter
  const hotBenchHitters = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === myTeam &&
        p.role === '타자' &&
        canPlay(p) &&
        !tState.lineupOrder.includes(p.id) &&
        p.form >= 1
    )
    .sort((a, b) => b.form * 4 + b.ability - (a.form * 4 + a.ability));

  const usedBenchIds = new Set<string>();
  tState.lineupOrder.forEach((pid, idx) => {
    const starter = career.players[pid];
    if (!starter) return;
    const assignedSlotPos = tState.lineupPositions[pid] ?? starter.position;
    const unavailable = Boolean(starter.injury) || isPlayerOnNationalTeamDuty(starter, career.gamesPlayed);
    const isCold = starter.form <= -1;
    if (!unavailable && !isCold) return;

    const cand = hotBenchHitters.find(
      (bh) =>
        !usedBenchIds.has(bh.id) &&
        (assignedSlotPos === 'DH' || bh.position === assignedSlotPos) &&
        (unavailable || bh.form - starter.form >= 2) &&
        (unavailable || bh.ability + bh.form * 2.5 >= starter.ability + starter.form * 2.5 - 3)
    );
    if (!cand) return;
    usedBenchIds.add(cand.id);
    recs.push({
      id: `form-bat-${starter.id}-${cand.id}`,
      coachRole: '타격코치',
      coachName: hitCoach?.name ?? '타격코치',
      type: 'batter',
      outPlayerId: starter.id,
      outPlayerName: starter.name,
      outPlayerForm: starter.form,
      outPlayerAbility: starter.ability,
      outReason: starter.injury
        ? '부상 이탈 — 선발 제외 필수'
        : isPlayerOnNationalTeamDuty(starter, career.gamesPlayed)
        ? '국가대표 소집 결장 — 선발 제외'
        : `최근 타격 폼 저하 (${starter.form}) — 선발 제외 추천`,
      inPlayerId: cand.id,
      inPlayerName: cand.name,
      inPlayerForm: cand.form,
      inPlayerAbility: cand.ability,
      inReason: `타격감 상승 (폼 +${cand.form} · 능력 ${cand.ability}) — ${idx + 1}번 타순(${assignedSlotPos}) 선발 기용 추천`,
      slotIndex: idx,
    });
  });

  // 2) Pitchers: cold/fatigued/unavailable starter vs hot bullpen pitcher
  const hotBullpen = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === myTeam &&
        p.role === '투수' &&
        canPlay(p) &&
        !tState.rotationOrder.includes(p.id) &&
        p.form >= 1 &&
        p.fatigue <= 40 &&
        p.pitchRole !== '마무리' &&
        p.position !== 'CL'
    )
    .sort((a, b) => b.form * 4 + b.ability - b.fatigue * 0.2 - (a.form * 4 + a.ability - a.fatigue * 0.2));

  const usedPitIds = new Set<string>();
  tState.rotationOrder.forEach((pid, idx) => {
    const sp = career.players[pid];
    if (!sp) return;
    const unavailable = Boolean(sp.injury) || isPlayerOnNationalTeamDuty(sp, career.gamesPlayed);
    const isColdOrTired = sp.form <= -1 || sp.fatigue >= 65;
    if (!unavailable && !isColdOrTired) return;

    const cand = hotBullpen.find(
      (bp) =>
        !usedPitIds.has(bp.id) &&
        (unavailable || bp.form - sp.form >= 2 || sp.fatigue >= 68)
    );
    if (!cand) return;
    usedPitIds.add(cand.id);
    recs.push({
      id: `form-pit-${sp.id}-${cand.id}`,
      coachRole: '투수코치',
      coachName: pitCoach?.name ?? '투수코치',
      type: 'pitcher',
      outPlayerId: sp.id,
      outPlayerName: sp.name,
      outPlayerForm: sp.form,
      outPlayerAbility: sp.ability,
      outReason: sp.injury
        ? '부상 이탈 — 선발 제외 필수'
        : isPlayerOnNationalTeamDuty(sp, career.gamesPlayed)
        ? '국가대표 소집 결장 — 선발 제외'
        : sp.fatigue >= 65
        ? `누적 피로 과다 (${sp.fatigue}%) — 선발 휴식 추천`
        : `투구 컨디션 난조 (폼 ${sp.form}) — 선발 제외 추천`,
      inPlayerId: cand.id,
      inPlayerName: cand.name,
      inPlayerForm: cand.form,
      inPlayerAbility: cand.ability,
      inReason: `구위·컨디션 호조 (폼 +${cand.form} · 피로 ${cand.fatigue}%) — ${idx + 1}선발 대체 기용 추천`,
      slotIndex: idx,
    });
  });

  return recs;
}

export function applyCoachFormRecommendation(
  career: CareerSave,
  rec: CoachFormRecommendation
): CareerSave {
  const next = cloneCareer(career);
  const tState = next.teams[next.playerTeamId];

  if (rec.type === 'batter') {
    const idx = tState.lineupOrder.indexOf(rec.outPlayerId);
    if (idx < 0) return next;
    const prevPos = tState.lineupPositions[rec.outPlayerId] ?? next.players[rec.inPlayerId]?.position ?? 'DH';
    tState.lineupOrder[idx] = rec.inPlayerId;
    tState.lineupPositions[rec.inPlayerId] = prevPos;
    tState.benchOrder = tState.benchOrder.filter((id) => id !== rec.inPlayerId);
    if (!tState.benchOrder.includes(rec.outPlayerId)) {
      tState.benchOrder.unshift(rec.outPlayerId);
    }
    if (next.players[rec.inPlayerId]) next.players[rec.inPlayerId].gameDayActive = true;
  } else {
    const idx = tState.rotationOrder.indexOf(rec.outPlayerId);
    if (idx < 0) return next;
    tState.rotationOrder[idx] = rec.inPlayerId;
    tState.bullpenOrder = tState.bullpenOrder.filter((id) => id !== rec.inPlayerId);
    if (!tState.bullpenOrder.includes(rec.outPlayerId)) {
      tState.bullpenOrder.push(rec.outPlayerId);
    }
    if (next.players[rec.inPlayerId]) {
      next.players[rec.inPlayerId].pitchRole = '선발';
      next.players[rec.inPlayerId].gameDayActive = true;
    }
    if (next.players[rec.outPlayerId]) {
      next.players[rec.outPlayerId].pitchRole = '중간';
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

export function applyAllCoachFormRecommendations(career: CareerSave): {
  nextCareer: CareerSave;
  appliedCount: number;
} {
  let cur = career;
  const recs = getCoachFormLineupRecommendations(cur);
  for (const r of recs) {
    cur = applyCoachFormRecommendation(cur, r);
  }
  return { nextCareer: cur, appliedCount: recs.length };
}

// ============================================================================
// #9: 시즌 시작 시 육성선수 영입 · 정식선수 전환 코치 추천 시스템
// ============================================================================

const DEV_SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '유', '홍'];
const DEV_GIVEN = ['민재', '준호', '도현', '서진', '태양', '지훈', '현우', '승현', '재원', '동하', '성민', '우빈', '진우', '건우', '시우', '하준', '예준', '윤호', '찬영', '주원'];
const DEV_ORIGINS = [
  '독립리그 연천 미라클',
  '독립리그 성남 맥파이스',
  '대학야구 성균관대',
  '대학야구 연세대',
  '대학야구 동국대',
  '고졸 미지명 특급',
  '대학야구 한양대',
  '독립리그 파주 챌린저스',
];

export function ensureSeasonDevelopmentalMarket(career: CareerSave, forceRefresh = false): void {
  const curList = career.developmentalMarket ?? [];
  if (!forceRefresh && curList.length > 0 && curList[0].season === career.season) {
    return;
  }

  const rng = new SeededRng(career.seed + career.season * 31337 + 911);
  const existingNames = new Set(Object.values(career.players).map((p) => p.name));
  const specs: { role: '투수' | '타자'; pos: Position; note: string }[] = [
    { role: '투수', pos: 'SP', note: '148km/h 직구와 높은 잠재력을 지닌 선발 원석 — 투수코치 강력 추천' },
    { role: '투수', pos: 'RP', note: '독립리그 탈삼진 1위 출신 강속구 불펜 — 즉시 2군 전력감' },
    { role: '타자', pos: 'SS', note: '넓은 내야 수비 범위와 빠른 발이 강점인 유틸리티 내야 유망주' },
    { role: '타자', pos: 'CF', note: '정교한 컨택과 주루 센스가 뛰어난 외야 육성 기대주' },
    { role: '타자', pos: 'C', note: '우수한 프레이밍과 강한 송구 능력을 갖춘 포수 육성 자원' },
    { role: '타자', pos: '1B', note: '대학리그 장타율 상위권 거포형 코너 내야수 — 타격코치 주목' },
  ];

  const pool: DevelopmentalCandidate[] = [];
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    let name = '';
    for (let attempt = 0; attempt < 30; attempt++) {
      const sn = DEV_SURNAMES[rng.int(0, DEV_SURNAMES.length - 1)];
      const gv = DEV_GIVEN[rng.int(0, DEV_GIVEN.length - 1)];
      const cand = `${sn}${gv}`;
      if (sn !== gv[0] && sn !== gv[1] && gv[0] !== gv[1] && !existingNames.has(cand)) {
        name = cand;
        existingNames.add(cand);
        break;
      }
    }
    if (!name) name = `신예${career.season}${i + 1}`;
    const age = sp.pos === 'SP' && i === 0 ? 19 : rng.int(19, 24);
    // Realistic KBO developmental player ratings: OVR 49~57, POT 65~78 (rare gem up to 81)
    const ability = rng.int(49, 57);
    const potential = i === 0 ? rng.int(75, 81) : rng.int(65, 78);
    const signingCostBillion = Number((0.15 + rng.int(0, 2) * 0.05).toFixed(2));
    pool.push({
      id: `dev-cand-${career.season}-${i + 1}`,
      name,
      role: sp.role,
      position: sp.pos,
      age,
      ability,
      potential,
      originNote: DEV_ORIGINS[rng.int(0, DEV_ORIGINS.length - 1)],
      signingCostBillion,
      coachNote: sp.note,
      season: career.season,
      signed: false,
    });
  }

  career.developmentalMarket = pool;
}

export interface CoachDevelopmentalAdvice {
  coachName: string;
  recruitRecommendations: {
    candidate: DevelopmentalCandidate;
    reason: string;
  }[];
  conversionRecommendations: {
    player: Player;
    reason: string;
  }[];
}

export function getCoachDevelopmentalRecommendations(
  career: CareerSave
): CoachDevelopmentalAdvice {
  const myTeam = career.playerTeamId;
  const staff = career.coaches[myTeam] ?? [];
  const pitCoach = staff.find((c) => c.role === '투수코치');
  const hitCoach = staff.find((c) => c.role === '타격코치');
  const manager = staff.find((c) => c.role === '감독');

  const market = (career.developmentalMarket ?? []).filter((c) => !c.signed);
  const myPlayers = Object.values(career.players).filter(
    (p) => p.teamId === myTeam && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
  );
  const pitcherCount = myPlayers.filter((p) => p.role === '투수').length;
  const hitterCount = myPlayers.filter((p) => p.role === '타자').length;
  const preferRole = pitcherCount <= hitterCount ? '투수' : '타자';

  const recruitRecommendations = [...market]
    .sort((a, b) => {
      const scoreA = a.potential * 1.4 + a.ability + (a.role === preferRole ? 6 : 0);
      const scoreB = b.potential * 1.4 + b.ability + (b.role === preferRole ? 6 : 0);
      return scoreB - scoreA;
    })
    .slice(0, 3)
    .map((candidate) => ({
      candidate,
      reason:
        candidate.role === '투수'
          ? `${pitCoach?.name ?? '투수코치'} 추천: 잠재력 ${candidate.potential}의 ${candidate.originNote} 출신 투수 자원 (${formatKrwBillionKorean(candidate.signingCostBillion)} 저비용 육성 영입)`
          : `${hitCoach?.name ?? '타격코치'} 추천: 잠재력 ${candidate.potential}의 ${candidate.position} 유망주 (${candidate.coachNote})`,
    }));

  const myDevPlayers = myPlayers
    .filter((p) => p.rosterTier === '육성' && !p.injury)
    .sort((a, b) => b.ability * 1.5 + b.potential + b.form * 2 - (a.ability * 1.5 + a.potential + a.form * 2));

  const conversionRecommendations = myDevPlayers.slice(0, 3).map((player) => {
    const readyTag =
      player.ability >= 66
        ? '즉시 2군 실전 및 1군 백업 콜업 가능 수준'
        : player.potential >= 80
        ? `잠재력 ${player.potential} 특급 유망주 — 조기 정식등록으로 1군 기회 부여 추천`
        : '성실한 훈련 성과와 팀 뎁스 보강을 위해 정식선수 전환 권장';
    return {
      player,
      reason: `${player.role === '투수' ? pitCoach?.name ?? '투수코치' : hitCoach?.name ?? '타격코치'} 추천: ${readyTag}`,
    };
  });

  return {
    coachName: `${manager?.name ?? '감독'} · ${pitCoach?.name ?? '투수코치'} · ${hitCoach?.name ?? '타격코치'}`,
    recruitRecommendations,
    conversionRecommendations,
  };
}

export function recruitDevelopmentalCandidate(
  career: CareerSave,
  candidateId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave; player: Player } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);

  const cand = (next.developmentalMarket ?? []).find((c) => c.id === candidateId && !c.signed);
  if (!cand) {
    throw new Error('이미 영입되었거나 유효하지 않은 육성선수 후보입니다.');
  }

  // KBO 규약 제107조 해외파 복귀 제한 기간 중 육성선수 우회 영입 차단
  assertNotBlockedByArticle107(next, cand.name);

  const teamId = next.playerTeamId;
  // 고졸 육성선수 선발 제한 별도 검사 (전 구단 연간 3명 한도)
  const devOrigin: '고졸' | '대졸' | '독립리그' | '방출선수' =
    cand.originNote.includes('고졸') || cand.age <= 19
      ? '고졸'
      : cand.originNote.includes('대졸') || cand.originNote.includes('대학')
      ? '대졸'
      : cand.originNote.includes('독립')
      ? '독립리그'
      : '방출선수';
  const hsLimitCheck = checkHighSchoolDevelopmentalLimit(next, teamId, devOrigin);
  if (!hsLimitCheck.allowed) {
    throw new Error(hsLimitCheck.reason ?? '고졸 육성선수 연간 선발 제한을 초과했습니다.');
  }

  if (next.finances.cashBalanceBillion !== null && next.finances.cashBalanceBillion < cand.signingCostBillion) {
    throw new Error(
      `보유 현금(${next.finances.cashBalanceBillion.toFixed(2)}억 원)이 육성 영입 비용(${cand.signingCostBillion}억 원)보다 부족합니다.`
    );
  }

  const devNum = allocateTeamUniformNumber(next.players, teamId, true);
  const pid = `dev-sign-${next.season}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const isP = cand.role === '투수';
  const newPlayer: Player = {
    id: pid,
    permanentId: allocatePermanentPlayerId(next, 'KBO-PL'),
    birthYear: next.season - cand.age,
    name: cand.name,
    teamId,
    category: '국내',
    nationality: '한국',
    role: cand.role,
    position: cand.position,
    pitchRole: isP ? (cand.position === 'SP' ? '선발' : '중간') : undefined,
    age: cand.age,
    ability: cand.ability,
    potential: cand.potential,
    abilityStatus: '확정',
    form: 1,
    fatigue: 0,
    lastPitchedRound: 0,
    consecutiveAppearances: 0,
    rosterTier: '육성',
    gameDayActive: false,
    uniformNumber: devNum,
    developmentalOrigin: devOrigin,
    acquisitionInfo: {
      type: '육성선수',
      draftYear: next.season,
      wasDevelopmental: true,
      label: `${next.season} ${devOrigin} 육성선수 영입 (${cand.originNote})`,
    },
    contract: {
      status: '확정',
      currency: 'KRW',
      years: 1,
      yearsRemaining: 1,
      startSeason: next.season,
      endSeason: next.season,
      annualSalary: 0.3,
      signingBonus: cand.signingCostBillion,
      totalValue: Number((0.3 + cand.signingCostBillion).toFixed(2)),
      note: `${next.season} 육성선수 입단 (${formatKrwContractSummary({ years: 1, totalBillion: Number((0.3 + cand.signingCostBillion).toFixed(2)), annualSalaryBillion: 0.3, signingBonusBillion: cand.signingCostBillion, startSeason: next.season })})`,
    },
    injury: null,
    morale: '만족',
    trainingFocus: isP ? '구위' : '타격',
    serviceYears: 0,
    clubTenureSeasons: 1,
    seasonRatingDelta: 0,
    lastEvaluatedAtTeamGames: next.gamesPlayed,
    stats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
    postseasonStats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
    militaryStatus: cand.age >= 22 ? '군필' : '미필',
  };
  ensurePlayerRichMetadata(newPlayer);
  next.players[pid] = newPlayer;
  cand.signed = true;
  if (devOrigin === '고졸') {
    recordHighSchoolDevSigning(next, teamId, next.season);
  }

  if (next.finances.cashBalanceBillion !== null) {
    next.finances.cashBalanceBillion = Number(
      (next.finances.cashBalanceBillion - cand.signingCostBillion).toFixed(2)
    );
    next.finances.seasonExpenseBillion = Number(
      (next.finances.seasonExpenseBillion + cand.signingCostBillion).toFixed(2)
    );
  } else {
    next.finances.krwUnpaidBillion = Number(
      (next.finances.krwUnpaidBillion + cand.signingCostBillion).toFixed(2)
    );
  }

  next.transactionLogs.unshift({
    id: `tx-dev-recruit-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '육성',
    teamId,
    summary: `육성선수 신규 영입: ${newPlayer.name} (${newPlayer.position} · #${devNum} · ${cand.originNote})`,
    detail: `능력 ${newPlayer.ability} / 잠재 ${newPlayer.potential} · 영입비 ${formatKrwBillionKorean(cand.signingCostBillion)}`,
  });

  pushNews(next, {
    date: new Date().toISOString().slice(0, 10),
    category: '이적·계약',
    headline: `[육성선수 영입] ${KBO_TEAMS[teamId].shortName}, ${cand.originNote} 출신 ${newPlayer.name}(${newPlayer.position}) 영입`,
    body: `코칭스태프 추천으로 육성선수 ${newPlayer.name}(${newPlayer.age}세, 잠재력 ${newPlayer.potential}, 등번호 #${devNum}) 선수가 입단했습니다.`,
    teamId,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, player: newPlayer };
}

// ============================================================================
// #11: 경기 시작 전 감독의 최적 타순 (DH 포함) & 선발 로테이션 추천
// ============================================================================

export interface ManagerPreGameRecommendation {
  managerName: string;
  opponentTeamId: TeamId | null;
  briefing: string;
  recommendedLineup: {
    order: number;
    playerId: string;
    playerName: string;
    naturalPosition: Position;
    assignedPosition: Position;
    ability: number;
    form: number;
  }[];
  recommendedRotation: {
    slot: number;
    playerId: string;
    playerName: string;
    ability: number;
    form: number;
    fatigue: number;
  }[];
  hasLineupDiff: boolean;
  hasRotationDiff: boolean;
}

export function getManagerPreGameRecommendation(
  career: CareerSave
): ManagerPreGameRecommendation {
  const myTeam = career.playerTeamId;
  const tState = career.teams[myTeam];
  const staff = career.coaches[myTeam] ?? [];
  const manager = staff.find((c) => c.role === '감독');
  const managerName = manager?.name ?? `${KBO_TEAMS[myTeam].shortName} 감독`;

  const nextSeries = career.schedule[career.currentSeriesIndex];
  const nextMatch = nextSeries?.matchups.find(
    (m) => m.away === myTeam || m.home === myTeam
  );
  const opponentTeamId: TeamId | null = nextMatch
    ? nextMatch.away === myTeam
      ? nextMatch.home
      : nextMatch.away
    : null;

  const isEligible = (p: Player) =>
    p.teamId === myTeam &&
    p.rosterTier === '1군' &&
    !p.injury &&
    !isPlayerOnNationalTeamDuty(p, career.gamesPlayed) &&
    !isMilitaryServing(p.militaryStatus) &&
    !p.overseasTrainingLocation;

  // 1) Delegate 1~9 batting order optimization to dedicated unique-position DP optimizer
  const optimized = optimizeBattingLineup(career, myTeam);
  const recommendedLineup = optimized.slots.map((s) => ({
    order: s.order,
    playerId: s.playerId,
    playerName: s.playerName,
    naturalPosition: s.naturalPosition,
    assignedPosition: s.assignedPosition,
    ability: s.ability,
    form: s.form,
  }));

  // 2) Pick optimal 5-man starting rotation from available 1군 pitchers (excluding closer)
  const pitchersPool = Object.values(career.players)
    .filter(
      (p) =>
        p.role === '투수' &&
        isEligible(p) &&
        p.pitchRole !== '마무리' &&
        p.position !== 'CL'
    )
    .sort((a, b) => {
      const spBonusA = a.position === 'SP' || a.pitchRole === '선발' ? 6 : 0;
      const spBonusB = b.position === 'SP' || b.pitchRole === '선발' ? 6 : 0;
      const scoreA = a.ability + a.form * 2.2 - a.fatigue * 0.28 + spBonusA;
      const scoreB = b.ability + b.form * 2.2 - b.fatigue * 0.28 + spBonusB;
      return scoreB - scoreA;
    });

  const recommendedRotation = pitchersPool.slice(0, 5).map((p, idx) => ({
    slot: idx + 1,
    playerId: p.id,
    playerName: p.name,
    ability: p.ability,
    form: p.form,
    fatigue: p.fatigue,
  }));

  const hasLineupDiff =
    recommendedLineup.length !== tState.lineupOrder.length ||
    recommendedLineup.some(
      (item, idx) =>
        tState.lineupOrder[idx] !== item.playerId ||
        (tState.lineupPositions[item.playerId] ?? item.naturalPosition) !== item.assignedPosition
    );

  const hasRotationDiff =
    recommendedRotation.length !== tState.rotationOrder.length ||
    recommendedRotation.some((item, idx) => tState.rotationOrder[idx] !== item.playerId);

  const cleanupNames = recommendedLineup
    .slice(2, 5)
    .map((x) => `${x.playerName}${x.assignedPosition === 'DH' ? '(DH)' : ''}`)
    .join('·');
  const ace = recommendedRotation[0];
  const oppLabel = opponentTeamId ? `${KBO_TEAMS[opponentTeamId].shortName}전` : '다음 경기';
  const briefing = `${managerName} 감독 경기 전 추천 (${oppLabel}): 컨디션·능력치 최상위 ${cleanupNames} 중심 타선 편성과 ${ace ? `1선발 ${ace.playerName}(OVR ${ace.ability}, 폼 ${ace.form >= 0 ? `+${ace.form}` : ace.form})` : '선발진'} 중심 로테이션을 권장합니다.`;

  return {
    managerName,
    opponentTeamId,
    briefing,
    recommendedLineup,
    recommendedRotation,
    hasLineupDiff,
    hasRotationDiff,
  };
}

export function applyManagerPreGameRecommendation(
  career: CareerSave,
  mode: 'lineup' | 'rotation' | 'both'
): CareerSave {
  const rec = getManagerPreGameRecommendation(career);
  const next = cloneCareer(career);
  const myTeam = next.playerTeamId;
  const tState = next.teams[myTeam];

  if (mode === 'lineup' || mode === 'both') {
    const newOrder = rec.recommendedLineup.map((x) => x.playerId);
    if (newOrder.length > 0) {
      tState.lineupOrder = newOrder;
      for (const item of rec.recommendedLineup) {
        tState.lineupPositions[item.playerId] = item.assignedPosition;
        if (next.players[item.playerId]) next.players[item.playerId].gameDayActive = true;
      }
      const allFirstHitters = Object.values(next.players)
        .filter((p) => p.teamId === myTeam && p.role === '타자' && p.rosterTier === '1군')
        .map((p) => p.id);
      tState.benchOrder = allFirstHitters.filter((id) => !newOrder.includes(id));
    }
  }

  if (mode === 'rotation' || mode === 'both') {
    const newRot = rec.recommendedRotation.map((x) => x.playerId);
    if (newRot.length >= 3) {
      tState.rotationOrder = newRot;
      tState.nextStarterIdx = 0;
      for (const pid of newRot) {
        if (next.players[pid]) {
          next.players[pid].pitchRole = '선발';
          next.players[pid].gameDayActive = true;
        }
      }
      const allFirstPitchers = Object.values(next.players)
        .filter((p) => p.teamId === myTeam && p.role === '투수' && p.rosterTier === '1군')
        .map((p) => p.id);
      tState.bullpenOrder = allFirstPitchers.filter((id) => !newRot.includes(id));
      for (const bid of tState.bullpenOrder) {
        const bp = next.players[bid];
        if (bp && bp.pitchRole === '선발') bp.pitchRole = '중간';
      }
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

