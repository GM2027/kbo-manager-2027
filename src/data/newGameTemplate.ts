import { ensureAmateurAndOverseasStateInPlace } from '../engine/amateurOverseasEngine';
import { ensureDeepFranchiseState } from '../engine/deepFranchise';
import { ensureLeagueLifeStateInPlace } from '../engine/leagueLifeEngine';
import { ensureGlobalPlayerRegistryInPlace } from '../engine/playerRegistry';
import { generateRegularSeasonSchedule } from '../engine/schedule';
import {
  ensureSpecialFuturesRosters,
  injectUndraftedUlsanPlayersIntoDraft,
} from '../engine/specialFuturesEngine';
import { CareerSave, GameDifficulty, TeamId } from '../types/kbo';
import { createFreshDraftState } from './draftPool';
import { DEFAULT_INVESTMENTS, TEAM_STARTING_CASH_BILLION } from './financesData';
import {
  generateVirtualForeignMarket,
  HISTORICAL_BASELINE_CHAMPIONS,
  INITIAL_VIRTUAL_DRAFT_ORDER_2028,
  KBO_TEAMS,
} from './kboTeams';
import { buildReal2026SeasonHistorySummary } from './real2026SeasonArchive';
import { buildAll10TeamsFromV18Dataset, sanitizeCareerOvrPotInPlace } from './v18Importer';

export function createNewCareer(params: {
  teamId: TeamId;
  gmName?: string;
  seed?: number;
  difficulty?: GameDifficulty;
}): CareerSave {
  const { teamId, gmName, seed = Date.now() % 1000000, difficulty = '어려움' } = params;
  const { players, teams, coaches, faCoaches, v18Summary } = buildAll10TeamsFromV18Dataset();

  // For a fresh new career, coaches start unconfirmed until STAFF step (or user confirms/changes them)
  coaches[teamId] = coaches[teamId].map((c) => ({ ...c, confirmed: false }));

  // 2027시즌 예상 정규시즌 일정 생성 (2027년 3월 27일 토요일 개막 기준, 공식 일정 가져오기 시 덮어쓰기 가능)
  const schedule = generateRegularSeasonSchedule(seed, '2027-03-27');
  const nowIso = new Date().toISOString();
  const teamInfo = KBO_TEAMS[teamId];
  const startingCash = TEAM_STARTING_CASH_BILLION[teamId];

  const created: CareerSave = {
    careerId: `career_${teamId}_${Date.now()}`,
    label: `${teamInfo.name} 2027 · 새 커리어`,
    version: 'v21.2027',
    databaseVersion: 'v24_recalibrated_prospect_potentials',
    lockedHistoricalSeasons: [2026],
    isPreservedMaster: false,
    isArchived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    gmName: gmName?.trim() || '단장',
    playerTeamId: teamId,
    season: 2027,
    currentDate: '2027-01-01',
    scheduleSource: 'PROJECTED',
    draftCompletedSeasons: [2027],
    draftClassYear: 2028,
    foreignReplacementsUsedByTeam: {},
    franchiseReevalLog: [],
    postponedRainoutGames: [],
    phase: 'INTRO',
    difficulty,
    seed,
    rngState: seed,
    gamesPlayed: 0,
    totalRegularGames: 144,
    currentSeriesIndex: 0,
    schedule,
    teams,
    players,
    coaches,
    faCoaches,
    gamesLedger: [],
    finances: {
      krwUnpaidBillion: 0,
      usdUnpaid: 0,
      krwCashPaidBillion: 0,
      usdCashPaid: 0,
      cashBalanceBillion: startingCash,
      startingCashBillion: startingCash,
      perazaContractNote: '미확정',
      seasonRevenueBillion: 0,
      seasonExpenseBillion: 0,
      signingBonusPaidBillion: 0,
      optionBonusPaidBillion: 0,
      compensationPaidBillion: 0,
      compensationReceivedBillion: 0,
      deadMoneyPaidBillion: 0,
      deadMoneyEntries: [],
      cumulativeDeficitBillion: 0,
      consecutiveDeficitSeasons: 0,
      spendingFrozenReason: null,
      ticketRevenueBillion: 0,
      uniformRevenueBillion: 0,
      sponsorRevenueBillion: 0,
      sponsor: null,
      investments: { ...DEFAULT_INVESTMENTS },
      obligations: [],
    },
    injuryLogs: [],
    growthLogs: [],
    transactionLogs: [
      {
        id: `tx-init-${Date.now()}`,
        date: '2027-01-01',
        type: '엔트리',
        teamId,
        summary: `${teamInfo.name} 2027시즌 신임 단장 취임 (v18 DB ${v18Summary.totalPlayers}명 · 2027-01-01 개시 · 난이도: ${difficulty})`,
      },
    ],
    // 2027 신인(110명)은 v18 DB에 이미 반영되어 있으므로 2027년 9월 실시 최초 가상 드래프트(2028)는 2026 최종 순위 역순으로 편성
    draftState: createFreshDraftState(2028, seed, INITIAL_VIRTUAL_DRAFT_ORDER_2028),
    postingRecords: [],
    postseason: {
      active: false,
      currentRound: 'NONE',
      standingsSeed: [],
      seriesHistory: [],
      currentSeries: null,
      champion: null,
    },
    awardsHistory: [],
    seasonHistory: [buildReal2026SeasonHistorySummary(teamId)],
    championHistory: HISTORICAL_BASELINE_CHAMPIONS.map((c) => ({ ...c })),
    virtualForeignMarket: generateVirtualForeignMarket(2027, seed),
    lastSeriesReport: null,
    warnings: [],
  };
  ensureDeepFranchiseState(created);
  ensureSpecialFuturesRosters(created);
  ensureGlobalPlayerRegistryInPlace(created);
  ensureAmateurAndOverseasStateInPlace(created);
  injectUndraftedUlsanPlayersIntoDraft(created, created.draftState);
  ensureLeagueLifeStateInPlace(created);
  sanitizeCareerOvrPotInPlace(created);
  return created;
}
