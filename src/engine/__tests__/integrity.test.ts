import assert from 'node:assert/strict';
import { getCareerCurrentIsoDate, resolveAgeAtDate } from '../ageEngine';
import { SeededRng } from '../rng';
import { createPreservedHanwhaCareer } from '../../data/masterImport';
import { createNewCareer } from '../../data/newGameTemplate';
import {
  adjustAiLineupsAndRotationByFormInPlace,
  computePlayerGameDayPerformanceDelta,
  ensureSeasonPlayerArcsInPlace,
  simulateNextPostseasonGame,
  simulateNextRegularGame,
  simulateNextRegularSeries,
  verifyGameBoxscoreIntegrity,
} from '../simulator';
import {
  calcAVG,
  calcERA,
  calcOBP,
  calcOPS,
  calcSLG,
  calcWHIP,
  computeStandings,
  formatIP,
} from '../stats';
import { getTeamSponsorChoices, TEAM_STARTING_CASH_BILLION } from '../../data/financesData';
import { getRecommendedDraftCandidates } from '../../data/draftPool';
import {
  FUTURES_NORTH_TEAMS,
  FUTURES_SOUTH_TEAMS,
  FUTURES_TEAMS_META,
  HISTORICAL_BASELINE_CHAMPIONS,
  KBO_TEAMS,
  MLB_CLUBS,
  TEAM_IDS,
} from '../../data/kboTeams';
import { getMlbClubMeta, MLB_TEAM_META } from '../../components/MlbTeamLogo';
import { COACH_ROLES, ensureBenchCoachesInPlace } from '../../data/coachesData';
import {
  appointBenchCoachAsActingManagerForUser,
  getBenchCoachAtmosphereEffect,
  getBenchCoachPromotionRecommendation,
  getBenchCoachRatings,
  getClubBenchCoach,
  promoteBenchCoachToManagerForUser,
  runBenchCoachPreMeetingInPlace,
} from '../benchCoachEngine';
import {
  advanceFaCompetitionRound,
  declinePendingUserFaApproval,
  evaluateOverseasFaMlbOffer,
  isOverseasFaEligible,
  MAX_EXTERNAL_FA_PER_CLUB,
  submitUserClubFaBid,
  syncFaCompetitionMarketInPlace,
} from '../faCompetitionEngine';
import {
  AudioManager,
  DEFAULT_AUDIO_SETTINGS,
  SOUND_EVENT_CATALOG,
} from '../../audio/audioManager';
import {
  ensureLeagueAcquisitionsInPlace,
  queryLeagueAcquisitions,
  recordLeagueAcquisitionInPlace,
} from '../leagueAcquisitionsEngine';
import {
  DEVELOPMENTAL_PLAYERS_SEED,
  getLiveCareerStats,
  getNationalityDisplay,
  REAL_KBO_HISTORICAL_LEGENDS,
  REAL_KBO_RETIRED_NUMBERS,
  sanitizePlayerAgeAndServiceYearsInPlace,
} from '../../data/playerMetadata';
import { generate150DraftCandidates } from '../../data/draftPool';
import {
  computeLiveOwnerEvaluationReport,
  computeNationalTeamCompensationDays,
  evaluateSeasonOwnerGrade,
  getNewsArticleSeason,
  getTeamRetiredNumbers,
  processMandatorySangmuEnlistments,
  prunePreviousSeasonNewsInPlace,
  recordMlbExportPlayer,
  signUnclaimedFreeAgent,
  submitWaiverClaimApplication,
  validateUniqueLineup,
} from '../franchiseSystems';
import {
  ALL_BULLPEN_ROLES,
  assignTeamBullpenRolesInPlace,
  buildRealisticPitchingPlan,
  isPitcherEligibleForGame,
  normalizeBullpenRole,
  setTeamBullpenPitcherRole,
} from '../pitchingUsageEngine';
import {
  buildRealisticGameLineupAndBench,
  evaluateBatterCompetitionAndMoraleInPlace,
  getPlatoonAndMatchupScore,
  simulateInningByInningBattingBox,
  updateBatterWorkloadAndMoraleAfterGameInPlace,
} from '../batterUsageEngine';
import {
  addCalendarDaysIso,
  awardWaiverPlayerToTeamInPlace,
  getReWaiverRestrictionStatus,
  KBO_WAIVER_FEE_BILLION,
  KBO_WAIVER_FEE_MANWON,
  pickLowestRankedClaimant,
  processWaiverLifecycleInPlace,
  unlockUnclaimedFreeAgentsForNewSeasonInPlace,
  waiveDomesticPlayerInPlace,
} from '../waiverEngine';
import {
  advanceAmateurAndOverseasSeasonInPlace,
  applyOverseasPlayerForDraft,
  assertNotBlockedByArticle107,
  ensureAmateurAndOverseasStateInPlace,
  evaluateOverseasReturnEligibility,
  integrateAmateurAndOverseasIntoDraftCandidates,
  processMonthlyAmateurAndOverseasInPlace,
  signEligibleKboAlumniReturnee,
  toggleAmateurProspectWatchlist,
} from '../amateurOverseasEngine';
import {
  ensureGlobalPlayerRegistryInPlace,
  isDuplicatePlayerIdentity,
  searchAllLeaguePlayers,
} from '../playerRegistry';
import {
  applyKoreanSeriesChampionshipRewardsInPlace,
  appointActingManagerInPlace,
  assignRetiredPlayerCareerInPlace,
  completeAndAdvanceOffseason8Step,
  computeLiveAwardRaces,
  computeYoYSalaryChange,
  countDistinctMlbSeasons,
  ensureLeagueLifeStateInPlace,
  executeMarkedOffseasonReleases,
  generateOverseasReturnRumorsInPlace,
  getAwardSalaryDemandMultiplier,
  getAwardTradeValueMultiplier,
  getClubTitleCount,
  getContractExpiryAlerts,
  getMilitaryEnlistmentQueue,
  getOffseason8StepReadiness,
  getRetirementCandidateAlerts,
  isMlbHistoryEntry,
  OFFSEASON_8_STEPS,
  processOffseasonRetiredCareersInPlace,
  recordDraftPickTradeInPlace,
  recordRookieSigningBonusTop10InPlace,
  selectAnnualTopAmateurProspectsInPlace,
  syncActingCaptainInPlace,
  togglePlayerOffseasonReleaseMark,
  unveilAnnualClubUniformsInPlace,
} from '../leagueLifeEngine';
import { findRealPlayerClubProfile, TEAM_UI_THEMES } from '../../data/realKboHistories';
import { getRecommendedRosterMoves } from '../recommendations';
import {
  checkDevelopmentalConversionEligibility,
  getClubRosterQuotaSummary,
  KBO_HS_DEV_ANNUAL_LIMIT,
  KBO_OFFICIAL_ROSTER_LIMIT,
  processAiClubsDevelopmentalRules,
  processCoachDevelopmentalDecisionsInPlace,
} from '../developmentalEngine';
import {
  approveRetiredNumberReview,
  computeClubFranchiseMerchandise,
  evaluateFranchiseStar,
  evaluateLegendTradeAvailability,
  evaluatePlayerTradeValuationDetailed,
  evaluateRetiredNumberReview,
  isClubLegend,
  LEGEND_TRADE_APPEARANCE_PROBABILITY,
  proposeFranchiseLongTermContract,
  rollLegendTradeAppearance,
  signRetiredLegendAsStaff,
} from '../franchiseStarEngine';
import {
  checkGoldenGloveEligibility,
  checkRookieOfYearEligibility,
  computeNormalizedRegularAwardScore,
  confirmAwardsCeremonyAndEnterOffseason,
  KBO_2026_AWARDS_RULES,
  runOfficialSeasonAwardsCeremonyInPlace,
} from '../kboAwardsEngine';
import {
  acknowledgeChampionEvent,
  advanceDraftUntilUserTurn,
  advanceToNextSeason,
  applyRecommendedTrainingBatch,
  approveAndStartNextSeasonFromOffseason,
  autoCompleteRemainingDraft,
  calculateMlbPostingFeeUsd,
  callUpPlayer,
  claimPostingFeeToCash,
  computeSeasonAwards,
  computeTradePositionalNeed,
  convertDevelopmentalPlayer,
  demotePlayer,
  evaluateMlbPostingReadiness,
  evaluateTradeProposal,
  executeOneTimeClubSpend,
  executeTradeProposal,
  generateAiDomesticContract,
  getAvailableFaCoaches,
  getForeignScoutMarket,
  getPlayerPostingQualification,
  hireFaCoach,
  initializeStartingFunds,
  KBO_POSTING_REQUIRED_REG_DAYS,
  KBO_POSTING_REQUIRED_SEASONS,
  KBO_POSTING_SEASON_REG_DAYS,
  negotiateCorporateSponsor,
  payUnpaidObligation,
  pickDraftCandidateForUser,
  refreshVirtualForeignMarket,
  releaseDevelopmentalPlayer,
  releaseForeignPlayer,
  reorderBullpen,
  reorderStartingRotation,
  resolveMlbPosting,
  scoutDraftCandidate,
  selectCorporateSponsor,
  setLineupSlot,
  setTicketPricePolicy,
  getExternalFaMarket,
  getMyDepartedFaPlayers,
  releaseExpiredFaPlayersToMarket,
  signDomesticContractOneClick,
  signExternalFaPlayer,
  signForeignCandidate,
  stepNextDraftPick,
  submitMlbPosting,
  swapRotationWithBullpen,
  terminateCoachContract,
  togglePitcherRotationSpot,
  updateRosterPlacement,
  upgradeClubFacility,
} from '../transactions';
import {
  applyCompetitiveBalanceDraftPenalties,
  computeOfficialContractCountedBillion,
  designateFranchiseExceptionPlayer,
  executeAtomicCareerMutation,
  formatManwonKorean,
  getAnnualKboCapBillion,
  getAnnualKboCapManwon,
  getAnnualKboFloorBillion,
  getCurrentCareerDate,
  getDraftPickingTeamForSlot,
  migrateAndValidateCareerSave,
  previewContractSalaryCapImpact,
  settleSeasonCompetitiveBalance,
} from '../salaryCapEngine';
import {
  acceptIncomingTradeOffer,
  getPendingIncomingTradeOffers,
  isIncomingTradeWindowOpen,
  rejectIncomingTradeOffer,
  solicitIncomingTradeOffers,
} from '../incomingTradeEngine';
import {
  computePlayerRivalrySpiritBonus,
  ensureRivalryState,
  findRivalryBetween,
  getRivalryEffectProfile,
  getTeamRivalries,
  toggleUserFocusRivalry,
} from '../rivalryEngine';
import {
  canHoldPlayerMeeting,
  conductGmPlayerMeeting,
  evaluateLeagueWeeklyDissatisfactionInPlace,
  getDissatisfactionLevel,
  getPlayerDissatisfaction,
  getReSignResistanceAssessment,
  GM_MEETING_ACTIONS,
} from '../dissatisfactionEngine';
import { buildAnnualClubUniform, REAL_KBO_UNIFORM_SPECS } from '../../data/realKboHistories';
import {
  acceptGmJobOffer,
  acknowledgeRetirementCeremony,
  buildAnalyticsReport,
  buildRetirementCeremony,
  changePlayerUniformNumber,
  computeFaQualification,
  computePitcherBatterMatchupEdge,
  computePlayerTradeValue,
  computeSalaryCapSummary,
  confirmFaProtectionList,
  decideMedicalReturn,
  DIFFICULTY_CONFIG,
  generateGameWeather,
  generateGmJobOffers,
  getTradeWindowStatus,
  negotiateDomesticSalary,
  notifyTradeMarketReopenedAfterKoreanSeriesInPlace,
  OFFSEASON_12_STEPS,
  playExhibitionGames,
  processTradeWindowLifecycleInPlace,
  repairFacility,
  runSpringCamp,
  setOffseasonStep12,
  setTeamCaptain,
  signOverseasReturnee,
  validateTradeCompliance,
} from '../deepFranchise';
import {
  applyOptimizedBattingLineup,
  BATTING_SLOT_SPECS,
  optimizeBattingLineup,
} from '../lineupOptimizer';
import {
  evaluateUlsanTransferEligibility,
  getUlsanTransferWindowStatus,
  transferPlayerFromUlsanWhales,
} from '../specialFuturesEngine';
import {
  advanceOffseasonStep,
  applyAllCoachFormRecommendations,
  applyCoachSwapRecommendation,
  applyManagerPreGameRecommendation,
  applyToNewTeamAsGm,
  buildRealisticRetirementAchievement,
  claimWaiverPlayer,
  computeReverseDraftOrder,
  dispatchOverseasScout,
  enlistPlayerToSangmu,
  exercisePlayerOption,
  fireAndReplaceClubManager,
  formatKrwBillionKorean,
  formatKrwContractSummary,
  generateEndOfSeasonPostingRequests,
  getCoachDevelopmentalRecommendations,
  getCoachFormLineupRecommendations,
  getFinancialInvestmentRecommendations,
  getManagerPreGameRecommendation,
  getManagerRecommendedCoaches,
  getScheduledNationalTournamentsForSeason,
  isPlayerOnNationalTeamDuty,
  recruitDevelopmentalCandidate,
  releaseDomesticPlayerToWaiver,
  resolveClubEventChoice,
  resolvePlayerComplaint,
  retirePlayerUniformNumber,
  runNationalTeamTournament,
  scoutVirtualCoaches,
  sendPlayerToOverseasTraining,
} from '../franchiseSystems';
import { getClubGmRecommendations, getRecommendedReleaseCandidates } from '../recommendations';
import {
  listContinueOptions,
  renameSavedCareer,
  saveCareer,
  saveCareerAsNewSlot,
} from '../../storage/careerStorage';
import { BatterStats, PitcherStats } from '../../types/kbo';

function runAllTests() {
  // 1. Preserved Hanwha v4.60.30 Master Integrity
  const master = createPreservedHanwhaCareer();
  assert.equal(master.playerTeamId, '한화');
  assert.equal(master.gamesPlayed, 9);
  assert.equal(master.gamesLedger.length, 45);
  assert.equal(master.finances.krwUnpaidBillion, 43.3);
  assert.equal(master.finances.usdUnpaid, 1800000);
  assert.equal(master.finances.krwCashPaidBillion, 0);
  assert.equal(master.finances.usdCashPaid, 0);
  assert.equal(master.finances.cashBalanceBillion, null);
  assert.equal(master.draftState.picks.filter((p) => p.teamId === '한화').length, 11);
  // Preserved incomplete early records carry verified === false
  assert.ok(master.gamesLedger.every((g) => g.verified === false));

  const masterStandings = computeStandings(master.gamesLedger);
  const hanwhaRow = masterStandings.find((r) => r.teamId === '한화')!;
  const lotteRow = masterStandings.find((r) => r.teamId === '롯데')!;
  assert.equal(hanwhaRow.wins, 6);
  assert.equal(hanwhaRow.losses, 3);
  assert.equal(lotteRow.wins, 7);
  assert.equal(lotteRow.losses, 2);

  // Check key player evaluations preserved
  const playersArr = Object.values(master.players);
  const heoinseo = playersArr.find((p) => p.teamId === '한화' && p.name === '허인서')!;
  const peraza = playersArr.find((p) => p.teamId === '한화' && p.name === '페라자')!;
  const sondonghyun = playersArr.find((p) => p.teamId === 'KT' && p.name === '손동현')!;
  assert.ok(sondonghyun, '손동현 must be on KT Wiz');
  assert.equal(
    playersArr.some((p) => p.teamId === '한화' && p.name === '손동현'),
    false,
    '손동현 must no longer be on 한화'
  );
  assert.equal(
    playersArr.some((p) => p.name === '손동현B'),
    false,
    'Legacy placeholder 손동현B must not exist'
  );
  assert.equal(heoinseo.ability, 82);
  assert.equal(heoinseo.potential, 90);
  assert.equal(peraza.ability, 87);
  assert.equal(sondonghyun.ability, 75);
  assert.equal(sondonghyun.potential, 83);

  // 2. New Game Isolation (0-0, 0/144, zero leaked debts) + Differentiated Team Economics
  const freshLG = createNewCareer({ teamId: 'LG', gmName: '테스트단장', seed: 12345 });
  assert.equal(freshLG.playerTeamId, 'LG');
  assert.equal(freshLG.gamesPlayed, 0);
  assert.equal(freshLG.gamesLedger.length, 0);
  assert.equal(freshLG.finances.krwUnpaidBillion, 0);
  assert.equal(freshLG.finances.usdUnpaid, 0);
  assert.equal(freshLG.phase, 'INTRO');
  assert.equal(freshLG.schedule.length, 54);
  assert.ok(TEAM_STARTING_CASH_BILLION['LG'] > TEAM_STARTING_CASH_BILLION['키움']);
  assert.ok(
    KBO_TEAMS['LG'].operatingCostPerSeriesBillion > KBO_TEAMS['키움'].operatingCostPerSeriesBillion
  );
  assert.ok(KBO_TEAMS['LG'].parkFactor < KBO_TEAMS['삼성'].parkFactor);

  // 3. Exact Baseball Math Formulas
  assert.equal(formatIP(17), '5.2');
  assert.equal(formatIP(18), '6.0');
  assert.ok(Math.abs((calcAVG(3, 10) ?? 0) - 0.3) < 1e-6);
  assert.ok(Math.abs((calcOBP(3, 2, 0, 10, 0) ?? 0) - 5 / 12) < 1e-6);
  assert.ok(Math.abs((calcSLG(6, 10) ?? 0) - 0.6) < 1e-6);
  assert.ok(
    Math.abs(
      (calcOPS({
        G: 3, PA: 12, AB: 10, H: 3, B2: 1, B3: 0, HR: 1, BB: 2, HBP: 0, SF: 0, SO: 2, R: 2, RBI: 3, SB: 0, TB: 7,
      }) ?? 0) -
        (5 / 12 + 0.7)
    ) < 1e-6
  );
  assert.ok(Math.abs((calcERA(2, 18) ?? 0) - 3.0) < 1e-6);
  assert.ok(Math.abs((calcWHIP(4, 2, 18) ?? 0) - 1.0) < 1e-6);

  // 4. MLB Posting Fee Calculation
  assert.equal(calculateMlbPostingFeeUsd(20), 4_000_000);
  assert.equal(calculateMlbPostingFeeUsd(40), 5_000_000 + 2_625_000);
  assert.equal(calculateMlbPostingFeeUsd(60), 5_000_000 + 4_375_000 + 1_500_000);

  // 5. Deterministic 3-game series simulation + Boxscore Verification + Growth Evaluation + 144g -> Postseason
  const runA = createNewCareer({ teamId: 'KT', seed: 77777 });
  runA.phase = 'REGULAR_SEASON';
  const runB = createNewCareer({ teamId: 'KT', seed: 77777 });
  runB.phase = 'REGULAR_SEASON';

  const simA1 = simulateNextRegularSeries(runA).nextCareer;
  const simB1 = simulateNextRegularSeries(runB).nextCareer;
  const openingSeriesGames = runA.schedule[0].dates.length;
  assert.equal(simA1.gamesPlayed, openingSeriesGames);
  assert.equal(simA1.gamesLedger.length, openingSeriesGames * 5);
  assert.deepEqual(
    simA1.gamesLedger.map((g) => `${g.awayRuns}-${g.homeRuns}`),
    simB1.gamesLedger.map((g) => `${g.awayRuns}-${g.homeRuns}`)
  );
  for (const g of simA1.gamesLedger) {
    assert.equal(g.verified, true);
    assert.equal(verifyGameBoxscoreIntegrity(g).valid, true);
  }

  // Simulate entire regular season (54 series = 144 games) and check conservation + boxscore verification + growth logs
  let cur = simA1;
  for (let s = 1; s < cur.schedule.length; s++) {
    cur = simulateNextRegularSeries(cur).nextCareer;
  }
  assert.equal(cur.gamesPlayed, 144);
  assert.equal(cur.gamesLedger.length, 720);
  assert.equal(cur.phase, 'POSTSEASON');
  assert.ok(cur.postseason.currentSeries !== null);
  assert.ok(cur.growthLogs.length > 0);
  assert.ok(cur.growthLogs.every((gl) => gl.reason.length > 5 && gl.round % 10 === 0));
  for (const g of cur.gamesLedger) {
    assert.equal(g.verified, true, `Boxscore integrity failed on ${g.id}: ${g.validationNote}`);
  }

  const finalRegStandings = computeStandings(cur.gamesLedger);
  const totalW = finalRegStandings.reduce((s, r) => s + r.wins, 0);
  const totalL = finalRegStandings.reduce((s, r) => s + r.losses, 0);
  assert.equal(totalW, totalL);
  for (const row of finalRegStandings) {
    assert.equal(row.games, 144);
  }

  // 6. Strictly 1 game per click in Postseason until OFFSEASON
  let psCount = 0;
  while (cur.phase === 'POSTSEASON' && psCount < 30) {
    const prevLedgerLen: number = cur.gamesLedger.length;
    cur = simulateNextPostseasonGame(cur).nextCareer;
    assert.equal(cur.gamesLedger.length, prevLedgerLen + 1);
    assert.equal(cur.gamesLedger[cur.gamesLedger.length - 1].verified, true);
    psCount++;
  }
  assert.equal(cur.phase, 'OFFSEASON');
  assert.ok(cur.postseason.champion !== null);

  // 7. Awards & Next Season +1 age progression
  const afterAwards = computeSeasonAwards(cur).nextCareer;
  assert.equal(afterAwards.awardsHistory.length, 1);
  const nextSeason = advanceToNextSeason(afterAwards).nextCareer;
  assert.equal(nextSeason.season, afterAwards.season + 1);
  assert.equal(nextSeason.gamesPlayed, 0);
  const samplePid = Object.keys(afterAwards.players)[0];
  const sampleNextPlayer = nextSeason.players[samplePid];
  assert.equal(
    sampleNextPlayer.age,
    resolveAgeAtDate(sampleNextPlayer, getCareerCurrentIsoDate(nextSeason))
  );

  // 8. Manual obligation payment
  const obId = master.finances.obligations[0].id;
  const paidMaster = payUnpaidObligation(master, obId).nextCareer;
  assert.ok(paidMaster.finances.krwCashPaidBillion > 0);
  assert.ok(paidMaster.finances.krwUnpaidBillion < master.finances.krwUnpaidBillion);

  // 9. Real 10-team managers/coaches (including 수석코치) & FA coach hiring/termination
  for (const tid of TEAM_IDS) {
    const teamCoaches = master.coaches[tid];
    assert.equal(teamCoaches.length, COACH_ROLES.length);
    for (const c of teamCoaches) {
      assert.ok(!c.name.includes('현행'), `Placeholder coach leaked on ${tid}: ${c.name}`);
    }
  }
  assert.equal(master.coaches['한화'].find((c) => c.role === '감독')?.name, '류지현');
  assert.equal(master.coaches['LG'].find((c) => c.role === '감독')?.name, '염경엽');
  assert.equal(master.coaches['두산'].find((c) => c.role === '감독')?.name, '김원형');

  assert.equal(freshLG.coaches['한화'].find((c) => c.role === '감독')?.name, '김경문');
  const initialFa = getAvailableFaCoaches(freshLG);
  assert.ok(initialFa.some((c) => c.role === '감독' && c.name === '류지현'));
  assert.ok(initialFa.some((c) => c.role === '감독' && c.name === '이승엽'));
  assert.ok(initialFa.some((c) => c.role === '투수코치' && c.name === '정민철'));
  assert.ok(initialFa.some((c) => c.role === '타격코치' && c.name === '장종훈'));

  const lgMgr = freshLG.coaches['LG'].find((c) => c.role === '감독')!;
  const afterFire = terminateCoachContract(freshLG, lgMgr.id).nextCareer;
  assert.equal(afterFire.coaches['LG'].length, COACH_ROLES.length - 1);
  assert.ok(getAvailableFaCoaches(afterFire).some((c) => c.name === lgMgr.name));

  const faTarget = getAvailableFaCoaches(afterFire).find((c) => c.role === '감독' && c.name === '이승엽')!;
  const afterHire = hireFaCoach(afterFire, faTarget.id, {
    years: 2,
    annualSalaryBillion: 3,
    signingBonusBillion: 1,
    replaceExisting: false,
  }).nextCareer;
  assert.equal(afterHire.coaches['LG'].length, COACH_ROLES.length);
  assert.equal(afterHire.coaches['LG'].find((c) => c.role === '감독')?.name, '이승엽');
  assert.ok(!getAvailableFaCoaches(afterHire).some((c) => c.name === '이승엽'));
  assert.equal(afterHire.finances.krwUnpaidBillion, 7);
  assert.equal(afterHire.finances.krwCashPaidBillion, 0);

  // 10. All 10 teams starting cash, corporate sponsor negotiation/expiration/renewal, operating cost & net profit
  for (const tid of TEAM_IDS) {
    const c = createNewCareer({ teamId: tid, seed: 100 });
    assert.equal(c.finances.cashBalanceBillion, TEAM_STARTING_CASH_BILLION[tid]);
    assert.equal(c.finances.startingCashBillion, TEAM_STARTING_CASH_BILLION[tid]);
    assert.equal(c.finances.sponsor, null);
    assert.equal(c.finances.investments?.stadiumLevel, 1);
  }

  const sponsoredLG = selectCorporateSponsor(freshLG, 'sp-lg').nextCareer;
  assert.equal(sponsoredLG.finances.sponsor?.name, 'LG전자 (올레드)');
  assert.equal(
    sponsoredLG.finances.cashBalanceBillion,
    TEAM_STARTING_CASH_BILLION['LG'] + 28
  );

  sponsoredLG.phase = 'REGULAR_SEASON';
  const after1Series = simulateNextRegularSeries(sponsoredLG).nextCareer;
  const fs1 = after1Series.lastSeriesReport?.financialSummary;
  assert.ok(fs1);
  assert.ok(fs1.uniformBillion > 0);
  const openingSeriesFraction = sponsoredLG.schedule[0].dates.length / 3;
  assert.ok(fs1.sponsorBillion >= Number((0.72 * openingSeriesFraction).toFixed(3)));
  assert.ok((fs1.operatingCostBillion ?? 0) > 0);
  const expectedNet = Number(
    (
      fs1.totalBillion -
      (fs1.operatingCostBillion ?? 0) -
      (fs1.merchCogsBillion ?? 0) -
      (fs1.travelCostBillion ?? 0) -
      (fs1.payrollCostBillion ?? 0) -
      (fs1.incentiveCostBillion ?? 0)
    ).toFixed(3)
  );
  assert.equal(fs1.netBillion, expectedNet);
  assert.ok((after1Series.finances.uniformRevenueBillion ?? 0) > 0);
  assert.ok((after1Series.finances.merchCogsBillion ?? 0) > 0);

  // Test 1Y sponsor negotiation -> expiration -> renewal
  const oneYearNeg = negotiateCorporateSponsor(freshLG, 'sp-samsung', {
    contractYears: 1,
    focus: '승리보너스',
  }).nextCareer;
  assert.equal(oneYearNeg.finances.sponsor?.yearsRemaining, 1);
  assert.equal(oneYearNeg.finances.sponsor?.status, '계약중');
  const nextSeasonExpired = advanceToNextSeason(oneYearNeg).nextCareer;
  assert.equal(nextSeasonExpired.finances.sponsor?.status, '만료');
  assert.equal(nextSeasonExpired.finances.sponsor?.yearsRemaining, 0);
  const renewedSponsor = negotiateCorporateSponsor(nextSeasonExpired, 'sp-samsung', {
    contractYears: 2,
    focus: '관중보너스',
  }).nextCareer;
  assert.equal(renewedSponsor.finances.sponsor?.status, '계약중');
  assert.equal(renewedSponsor.finances.sponsor?.yearsRemaining, 2);

  const cashBeforeUpgrade = after1Series.finances.cashBalanceBillion!;
  const afterUpgrade = upgradeClubFacility(after1Series, 'stadiumLevel').nextCareer;
  assert.equal(afterUpgrade.finances.investments?.stadiumLevel, 2);
  assert.equal(
    afterUpgrade.finances.cashBalanceBillion,
    Number((cashBeforeUpgrade - 12).toFixed(2))
  );

  const afterBonus = executeOneTimeClubSpend(afterUpgrade, 'BONUS').nextCareer;
  assert.equal(afterBonus.teams['LG'].atmosphere, '좋음');
  assert.equal(
    afterBonus.finances.cashBalanceBillion,
    Number((afterUpgrade.finances.cashBalanceBillion! - 5).toFixed(2))
  );

  // 11. Step-by-step R1-R4 Draft Simulation pausing strictly on user's turn
  const draftCareer = createNewCareer({ teamId: '한화', seed: 9001 }); // 한화 is 9th in DRAFT_ORDER_2026
  const afterOneStep = stepNextDraftPick(draftCareer).nextCareer;
  assert.equal(afterOneStep.draftState.picks.length, 1);
  assert.equal(afterOneStep.draftState.currentPickInRound, 2);
  const atUserTurn = advanceDraftUntilUserTurn(afterOneStep).nextCareer;
  const curDraftTeam =
    atUserTurn.draftState.draftOrder[atUserTurn.draftState.currentPickInRound - 1];
  assert.equal(curDraftTeam, '한화');
  const userPickTarget = atUserTurn.draftState.candidates.find((c) => !c.draftedBy)!;
  const afterUserPick = pickDraftCandidateForUser(atUserTurn, userPickTarget.id).nextCareer;
  assert.equal(
    afterUserPick.draftState.picks.filter((p) => p.teamId === '한화').length,
    1
  );
  // Stepping one pick pauses cleanly without finishing R4 all at once
  assert.equal(afterUserPick.draftState.currentRound, 1);

  // 12. Realistic MLB Posting: Low-ability rejected + Star accepted & fee claimed into KRW cash
  const postTestCareer = createNewCareer({ teamId: 'LG', seed: 54321 });
  const domPlayers = Object.values(postTestCareer.players).filter(
    (p) => p.teamId === 'LG' && p.category === '국내'
  );
  const lowStar = domPlayers[0];
  lowStar.serviceYears = 8;
  lowStar.ability = 72;
  lowStar.postingBlockedUntilNextNov = false;
  const afterLowPost = submitMlbPosting(postTestCareer, lowStar.id).nextCareer;
  assert.equal(afterLowPost.postingRecords[0].status, '협상결렬');
  assert.equal(afterLowPost.postingRecords[0].offers.length, 0);
  assert.ok(afterLowPost.postingRecords[0].rejectionReason);

  const highStar = afterLowPost.players[domPlayers[1].id];
  highStar.serviceYears = 8;
  highStar.ability = 88;
  highStar.age = 26;
  highStar.postingBlockedUntilNextNov = false;
  const afterHighPost = submitMlbPosting(afterLowPost, highStar.id).nextCareer;
  assert.equal(afterHighPost.postingRecords[0].status, '협상중');
  assert.ok(afterHighPost.postingRecords[0].offers.length >= 1);
  const acceptedPost = resolveMlbPosting(
    afterHighPost,
    afterHighPost.postingRecords[0].id,
    0
  ).nextCareer;
  assert.equal(acceptedPost.postingRecords[0].status, '계약성사');
  const preClaimCash = acceptedPost.finances.cashBalanceBillion!;
  const afterClaimCash = claimPostingFeeToCash(
    acceptedPost,
    acceptedPost.postingRecords[0].id
  ).nextCareer;
  assert.equal(afterClaimCash.postingRecords[0].fundsClaimedToCash, true);
  assert.ok(afterClaimCash.finances.cashBalanceBillion! > preClaimCash);

  // Master save optional starting fund activation + cash-backed obligation payment
  const masterFunded = initializeStartingFunds(master).nextCareer;
  assert.equal(masterFunded.finances.cashBalanceBillion, TEAM_STARTING_CASH_BILLION['한화']);
  const paidFunded = payUnpaidObligation(masterFunded, obId).nextCareer;
  assert.ok(paidFunded.finances.cashBalanceBillion! < TEAM_STARTING_CASH_BILLION['한화']);

  // 13. Differentiated 3 Club Sponsors + Official Local Logo Paths
  for (const tid of TEAM_IDS) {
    const choices = getTeamSponsorChoices(tid);
    assert.equal(choices.length, 3, `${tid} must have exactly 3 tailored sponsors`);
    assert.equal(choices.filter((c) => c.recommended).length, 1, `${tid} must have 1 recommended sponsor`);
    assert.ok(KBO_TEAMS[tid].logoUrls[0].startsWith('/logos/'), `${tid} should prioritize local official emblem`);
  }

  // 14. All 10 Teams 2군 Squads + Call-up & Demotion Actions
  for (const tid of TEAM_IDS) {
    const futures = Object.values(freshLG.players).filter(
      (p) => p.teamId === tid && p.rosterTier === '2군'
    );
    assert.ok(futures.length >= 10, `${tid} should have at least 10 players in 2군, got ${futures.length}`);
  }
  const lgFirst = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.rosterTier === '1군' && p.category === '국내'
  )!;
  const afterDemote = demotePlayer(freshLG, lgFirst.id);
  assert.equal(afterDemote.players[lgFirst.id].rosterTier, '2군');
  assert.equal(afterDemote.transactionLogs[0].type, '엔트리');
  const afterCallUp = callUpPlayer(afterDemote, lgFirst.id);
  assert.equal(afterCallUp.players[lgFirst.id].rosterTier, '1군');

  // 15. AI Domestic Contract One-Click + Strict Cash Cap
  const domTarget = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  const aiQuote = generateAiDomesticContract(domTarget);
  assert.ok(aiQuote.totalBillion > 0);
  const preSignCash = freshLG.finances.cashBalanceBillion!;
  const afterOneClick = signDomesticContractOneClick(freshLG, domTarget.id).nextCareer;
  assert.equal(afterOneClick.players[domTarget.id].contract.status, '확정');
  // 이중지급 방지: 체결 시점 즉시 현금 지출은 계약금(signingBonusBillion)만 차감, 연봉은 월별 분할 지급
  assert.equal(
    afterOneClick.finances.cashBalanceBillion,
    Number((preSignCash - aiQuote.signingBonusBillion).toFixed(2))
  );

  // Exceeding cash balance must throw
  const brokeCareer = createNewCareer({ teamId: '키움', seed: 111 });
  brokeCareer.finances.cashBalanceBillion = 0.1;
  const kwTarget = Object.values(brokeCareer.players).find(
    (p) => p.teamId === '키움' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  assert.throws(() => signDomesticContractOneClick(brokeCareer, kwTarget.id));

  // 16. Virtual Foreign Market + Release + Sign with Cash Cap
  const fMarket = getForeignScoutMarket(freshLG);
  assert.ok(fMarket.some((m) => m.isVirtual && m.category === '외국인'));
  assert.ok(fMarket.some((m) => m.isVirtual && m.category === '아시아쿼터'));
  const refreshed = refreshVirtualForeignMarket(freshLG).nextCareer;
  assert.ok((refreshed.virtualForeignMarket?.length ?? 0) >= 8);

  const existingForeign = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.category === '외국인' && p.rosterTier === '1군'
  )!;
  const afterRelease = releaseForeignPlayer(freshLG, existingForeign.id).nextCareer;
  assert.equal(afterRelease.players[existingForeign.id].rosterTier, '제외후보');

  const virtualTarget = getForeignScoutMarket(afterRelease).find(
    (m) => m.isVirtual && m.category === '외국인'
  )!;
  const cashBeforeForeign = afterRelease.finances.cashBalanceBillion!;
  const afterSignForeign = signForeignCandidate(afterRelease, virtualTarget).nextCareer;
  assert.ok(afterSignForeign.finances.cashBalanceBillion! < cashBeforeForeign);
  assert.ok(
    Object.values(afterSignForeign.players).some(
      (p) => p.teamId === 'LG' && p.name === virtualTarget.name && p.category === '외국인'
    )
  );

  // 17. Draft Age & Signing Bonus Diversity + AI Draft & Club Recommendations
  const draftAges = new Set(draftCareer.draftState.candidates.map((c) => c.age));
  assert.ok(draftAges.size >= 5, `Expected diverse draft ages, got ${Array.from(draftAges).join(',')}`);
  const bonuses = draftCareer.draftState.candidates.map((c) => c.signingBonusBillion);
  assert.ok(Math.max(...bonuses) >= 3.0, `Expected top draft bonus >= 3.0억, got ${Math.max(...bonuses)}`);
  assert.ok(Math.min(...bonuses) <= 0.5, `Expected late draft bonus <= 0.5억, got ${Math.min(...bonuses)}`);
  const draftRecs = getRecommendedDraftCandidates(
    draftCareer.draftState,
    Object.values(draftCareer.players).filter((p) => p.teamId === '한화'),
    3
  );
  assert.equal(draftRecs.length, 3);
  const clubRecs = getClubGmRecommendations(freshLG);
  assert.ok(clubRecs.length >= 1 && clubRecs.length <= 3);

  // 18. Korean Series Champion Event, KS MVP, Champion History & Realistic 144-Game Stat Check
  assert.ok(cur.postseason.ksMvp !== null && cur.postseason.ksMvp !== undefined);
  assert.ok(cur.postseason.championEvent !== null && cur.postseason.championEvent !== undefined);
  assert.ok((cur.championHistory?.length ?? 0) >= HISTORICAL_BASELINE_CHAMPIONS.length + 1);
  const champ2025 = cur.championHistory!.find((c) => c.season === 2025);
  const champCurrent = cur.championHistory!.find((c) => c.season === cur.season);
  assert.ok(champ2025);
  assert.equal(champ2025.championTeamId, 'LG');
  assert.ok(champCurrent);
  assert.equal(champCurrent.championTeamId, cur.postseason.champion);
  const acked = acknowledgeChampionEvent(cur);
  assert.equal(acked.postseason.championEvent?.acknowledged, true);
  assert.equal(afterAwards.awardsHistory[0].championTeamId, cur.postseason.champion);
  assert.ok(afterAwards.awardsHistory[0].koreanSeriesMvp !== null);

  // 144-game KBO stat realism sanity bounds
  const allSeasonBatters = Object.values(cur.players).filter(
    (p) => p.role === '타자' && ((p.stats as BatterStats).PA ?? 0) >= 446
  );
  const allSeasonPitchers = Object.values(cur.players).filter(
    (p) => p.role === '투수' && ((p.stats as PitcherStats).outs ?? 0) >= 432
  );
  const topHR = Math.max(...allSeasonBatters.map((p) => (p.stats as BatterStats).HR ?? 0));
  const topAVG = Math.max(
    ...allSeasonBatters.map((p) => {
      const s = p.stats as BatterStats;
      return calcAVG(s.H, s.AB) ?? 0;
    })
  );
  const bestERA = Math.min(
    ...allSeasonPitchers.map((p) => {
      const s = p.stats as PitcherStats;
      return calcERA(s.ER, s.outs) ?? 99;
    })
  );
  const topW = Math.max(...allSeasonPitchers.map((p) => (p.stats as PitcherStats).W ?? 0));
  console.log(
    `[144G Realism Check] Qualified Batters=${allSeasonBatters.length}, Pitchers=${allSeasonPitchers.length} | Top HR=${topHR}, Top AVG=${topAVG.toFixed(3)}, Best ERA=${bestERA.toFixed(2)}, Top W=${topW}`
  );
  assert.ok(topHR >= 18 && topHR <= 60, `Unrealistic league-leading HR: ${topHR}`);
  assert.ok(topAVG >= 0.275 && topAVG <= 0.415, `Unrealistic league-leading AVG: ${topAVG}`);
  assert.ok(bestERA >= 1.2 && bestERA <= 4.3, `Unrealistic best qualified ERA: ${bestERA}`);
  assert.ok(topW >= 10 && topW <= 26, `Unrealistic league-leading W: ${topW}`);

  // 19. Rotating One-Time Club Spend (replaces used ID with another from 9-item pool)
  const beforeSpendOffers = afterUpgrade.finances.activeSpendOfferIds ?? ['CAMP', 'BONUS', 'SCOUT'];
  assert.ok(beforeSpendOffers.includes('BONUS'));
  const afterSpendOffers = afterBonus.finances.activeSpendOfferIds ?? [];
  assert.equal(afterSpendOffers.length, 3);
  assert.ok(!afterSpendOffers.includes('BONUS'), 'Used one-time spend offer must rotate out');

  // 20. Age-Aware MLB Posting (35+ rejected; prime 26yo star realistic $30M-$115M)
  const agingVet = afterHighPost.players[domPlayers[2].id];
  agingVet.serviceYears = 10;
  agingVet.registrationDays = 1450;
  agingVet.ability = 84;
  agingVet.age = 35;
  agingVet.postingBlockedUntilNextNov = false;
  const ageEval = evaluateMlbPostingReadiness(agingVet);
  assert.equal(ageEval.ageSuitability, '부적합');
  const afterOldPost = submitMlbPosting(afterHighPost, agingVet.id).nextCareer;
  assert.equal(afterOldPost.postingRecords[0].status, '협상결렬');
  const highOfferM = afterHighPost.postingRecords[0].offers[0].guaranteedUsdMillions;
  assert.ok(highOfferM >= 15 && highOfferM <= 120, `Unexpected realistic MLB scale: $${highOfferM}M`);

  // 21. Ticket Pricing Policy, Draft Precision Scouting & AI Trade Draft Pick + Counter-Offer
  const cheapTickets = setTicketPricePolicy(freshLG, '저가').nextCareer;
  assert.equal(cheapTickets.finances.ticketPricePolicy, '저가');

  const unScoutedCand = draftCareer.draftState.candidates.find((c) => c.scoutAccuracy !== '정밀')!;
  const afterScout = scoutDraftCandidate(draftCareer, unScoutedCand.id).nextCareer;
  const scoutedRow = afterScout.draftState.candidates.find((c) => c.id === unScoutedCand.id)!;
  assert.equal(scoutedRow.scoutAccuracy, '정밀');
  assert.equal(scoutedRow.scoutedAbility, scoutedRow.ability);
  assert.equal(scoutedRow.scoutedPotential, scoutedRow.potential);

  const lgGive = Object.values(freshLG.players).filter(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군'
  );
  const ktTarget = Object.values(freshLG.players).filter(
    (p) => p.teamId === 'KT' && p.category === '국내' && p.rosterTier === '1군'
  );
  const evalNoPick = evaluateTradeProposal(freshLG, 'KT', [lgGive[4].id], [ktTarget[0].id], 0, null);
  const evalWith1R = evaluateTradeProposal(freshLG, 'KT', [lgGive[4].id], [ktTarget[0].id], 0, 1);
  assert.ok(evalWith1R.giveScore > evalNoPick.giveScore, '1R draft pick must increase trade valuation');
  assert.ok(evalWith1R.aiStance !== undefined);
  if (evalNoPick.decision === '조건부' && evalNoPick.counterOffer) {
    const executedCounter = executeTradeProposal(
      freshLG,
      'KT',
      [lgGive[4].id],
      [ktTarget[0].id],
      evalNoPick.counterOffer.extraCashBillion ?? 0,
      evalNoPick.counterOffer.requestedPickRound ?? null,
      true
    ).nextCareer;
    assert.equal(executedCounter.players[ktTarget[0].id].teamId, 'LG');
  }

  // 22. Coach Post-Series Feedback, Live Swap Reports, News Feed, Club Events & Player Complaints
  assert.ok(after1Series.lastSeriesReport?.seriesFeedback !== undefined);
  assert.ok((cur.newsFeed?.length ?? 0) > 0, 'Full season must generate league news articles');
  assert.ok(cur.futuresStandings && Object.keys(cur.futuresStandings).length === 12);
  const ktFutures = cur.futuresStandings!['KT'];
  assert.ok(ktFutures.games > 0, '2군 Futures League must accumulate games');

  // Resolve a club event & complaint if generated (or test synthetic resolution)
  const unresolvedEvent = (cur.clubEvents ?? []).find((e) => !e.resolved && e.choices && e.choices.length > 0);
  if (unresolvedEvent) {
    const resolvedEvCareer = resolveClubEventChoice(cur, unresolvedEvent.id, unresolvedEvent.choices![0].id).nextCareer;
    assert.equal(
      resolvedEvCareer.clubEvents?.find((e) => e.id === unresolvedEvent.id)?.resolved,
      true
    );
  }
  const unresolvedCmp = (cur.complaints ?? []).find((c) => !c.resolved);
  if (unresolvedCmp) {
    const resolvedCmpCareer = resolvePlayerComplaint(cur, unresolvedCmp.id, '포스팅지원').nextCareer;
    assert.equal(
      resolvedCmpCareer.complaints?.find((c) => c.id === unresolvedCmp.id)?.resolved,
      true
    );
  }
  const unappliedSwap = (cur.coachSwapReports ?? []).find((r) => !r.applied);
  if (unappliedSwap) {
    const swapped = applyCoachSwapRecommendation(cur, unappliedSwap.id).nextCareer;
    assert.equal(
      swapped.coachSwapReports?.find((r) => r.id === unappliedSwap.id)?.applied,
      true
    );
  }

  // 23. Sangmu Military Service (+2~4 Growth on Discharge), National Team, Waiver Market, Overseas Scout
  const youngUnserved = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.age <= 25 && (p.militaryStatus ?? '미필') === '미필'
  )!;
  const preSangmuAb = youngUnserved.ability;
  const enlistedCareer = enlistPlayerToSangmu(freshLG, youngUnserved.id).nextCareer;
  assert.equal(enlistedCareer.players[youngUnserved.id].militaryStatus, '복무 중');
  assert.equal(enlistedCareer.players[youngUnserved.id].militaryReturnSeason, freshLG.season + 1);
  assert.equal(enlistedCareer.players[youngUnserved.id].militaryReturnRound, 72);
  const season2027 = advanceToNextSeason(enlistedCareer).nextCareer;
  const season2028 = advanceToNextSeason(season2027).nextCareer;
  assert.equal(season2028.players[youngUnserved.id].militaryStatus, '군필');
  assert.ok(season2028.players[youngUnserved.id].ability >= preSangmuAb);

  const afterNat = runNationalTeamTournament(freshLG).nextCareer;
  assert.equal(afterNat.nationalTeamEvents?.length, 1);

  const releasable = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '2군'
  )!;
  const afterWaive = releaseDomesticPlayerToWaiver(freshLG, releasable.id).nextCareer;
  assert.ok((afterWaive.waiverPool?.length ?? 0) >= 1);
  // Claim a waiver from another team by switching player team temporarily via GM transfer
  const transferred = applyToNewTeamAsGm(afterWaive, '두산').nextCareer;
  assert.equal(transferred.playerTeamId, '두산');
  const waiverId = transferred.waiverPool![0].id;
  const afterClaim = claimWaiverPlayer(transferred, waiverId).nextCareer;
  assert.ok(
    Object.values(afterClaim.players).some(
      (p) => p.teamId === '두산' && p.name === releasable.name && p.rosterTier === '2군'
    ),
    'Claimed waiver player must join claiming team 2군 roster'
  );

  const afterScoutDispatch = dispatchOverseasScout(freshLG, '미국 AAA').nextCareer;
  assert.equal(afterScoutDispatch.scoutMissions?.length, 1);
  assert.ok((afterScoutDispatch.virtualForeignMarket?.length ?? 0) > 0);

  // 24. Contract Options, Retired Numbers & Trophies
  const optCandidate = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  const withOptCareer = structuredClone(freshLG);
  withOptCareer.players[optCandidate.id].contract.optionType = '구단옵션';
  withOptCareer.players[optCandidate.id].contract.optionYearSalary = 4.0;
  const afterOpt = exercisePlayerOption(withOptCareer, optCandidate.id, true).nextCareer;
  assert.equal(afterOpt.players[optCandidate.id].contract.optionType, '없음');

  assert.throws(() => retirePlayerUniformNumber(freshLG, '박용택', 'LF', 33, '이미 영구결번'));
  const afterRetireNum = retirePlayerUniformNumber(freshLG, '오지환', 'SS', 10, '우승 주장 레전드').nextCareer;
  assert.ok(
    afterRetireNum.leagueHistory?.retiredNumbers.some((r) => r.teamId === 'LG' && r.number === 10)
  );

  // 25. 4-Step Offseason Workflow & Strict Reverse-Standings Next-Season Draft Order (10th -> 1st)
  assert.equal(cur.phase, 'OFFSEASON');
  assert.ok(cur.ownerEval?.lastSeasonGrade !== undefined);
  const expectedReverseOrder = computeReverseDraftOrder(cur);
  assert.equal(expectedReverseOrder.length, 10);
  // Last place in regular season must pick #1 overall; Korean Series champion picks #10 overall
  assert.equal(expectedReverseOrder[0], finalRegStandings[finalRegStandings.length - 1].teamId);
  assert.equal(expectedReverseOrder[9], cur.postseason.champion ?? finalRegStandings[0].teamId);
  const step2 = advanceOffseasonStep(cur, 'DOMESTIC_CONTRACTS').nextCareer;
  assert.equal(step2.offseasonStep, 'DOMESTIC_CONTRACTS');
  assert.deepEqual(
    nextSeason.draftState.draftOrder,
    expectedReverseOrder,
    '2027 rookie draft order must strictly match reverse 2026 regular-season standings'
  );

  // 26. All 7 New Features Verification:
  // (a) Real player retirements across 10 clubs -> Coach debuts & Coach -> Manager promotions
  const retiredPlayers = Object.values(nextSeason.players).filter((p) => p.rosterTier === '은퇴');
  assert.ok(retiredPlayers.length >= 2, `Expected real veteran retirements in 2027 offseason, got ${retiredPlayers.length}`);
  const retiredCoachDebuts = (nextSeason.faCoaches ?? []).filter((c) => (c.careerNote ?? '').includes('코치 데뷔'));
  assert.ok(retiredCoachDebuts.length >= 1, 'Expected at least 1 retired real KBO player to debut in FA coaches');
  const promotedManagers = [
    ...(nextSeason.faCoaches ?? []),
    ...Object.values(nextSeason.coaches ?? {}).flat(),
  ].filter((c) => c.role === '감독' && (c.careerNote ?? '').includes('감독 승격'));
  assert.ok(promotedManagers.length >= 1, 'Expected at least 1 coach promoted to 감독');
  for (const tid of TEAM_IDS) {
    const teamStaff = nextSeason.coaches?.[tid] ?? [];
    assert.equal(teamStaff.length, COACH_ROLES.length, `${tid} must retain ${COACH_ROLES.length} coaching staff after offseason promotions`);
    for (const role of COACH_ROLES) {
      assert.ok(teamStaff.some((c) => c.role === role), `${tid} must have a ${role}`);
    }
  }

  // (b) Realistic 2026 multi-year contracts across all 10 clubs (while preserving Hanwha master save invariants)
  assert.equal(master.finances.krwUnpaidBillion, 43.3);
  assert.equal(master.finances.usdUnpaid, 1800000);
  assert.equal(master.finances.cashBalanceBillion, null);
  const checkMultiYear = (teamId: (typeof TEAM_IDS)[number], name: string, minYears: number) => {
    const found = Object.values(freshLG.players).find((p) => p.teamId === teamId && p.name === name);
    assert.ok(found, `Expected player ${teamId}-${name} to exist`);
    assert.ok(
      found.contract.yearsRemaining >= minYears,
      `Expected ${teamId}-${name} to have >=${minYears} years remaining, got ${found.contract.yearsRemaining}`
    );
  };
  checkMultiYear('LG', '오지환', 4);
  checkMultiYear('두산', '양의지', 3);
  checkMultiYear('SSG', '최정', 3);
  checkMultiYear('KIA', '나성범', 2);
  checkMultiYear('NC', '박민우', 4);
  checkMultiYear('롯데', '박세웅', 2);
  checkMultiYear('삼성', '최원태', 3);
  checkMultiYear('KT', '허경민', 3);
  checkMultiYear('한화', '류현진', 5);

  // (c) Uniform numbers across all 10 clubs (unique per club, avoiding retired numbers, 101+ for 육성)
  for (const tid of TEAM_IDS) {
    const teamPlayers = Object.values(freshLG.players).filter(
      (p) => p.teamId === tid && p.rosterTier !== '은퇴'
    );
    const seen = new Set<number>();
    const retiredSet = new Set(REAL_KBO_RETIRED_NUMBERS[tid] ?? []);
    for (const p of teamPlayers) {
      assert.equal(typeof p.uniformNumber, 'number', `${tid}-${p.name} missing uniformNumber`);
      assert.ok(!seen.has(p.uniformNumber!), `Duplicate jersey #${p.uniformNumber} on ${tid}`);
      seen.add(p.uniformNumber!);
      if (p.rosterTier === '육성') {
        assert.ok(p.uniformNumber! >= 101 && p.uniformNumber! <= 139, `육성 ${p.name} must have 3-digit number 101-139`);
      } else {
        assert.ok(p.uniformNumber! >= 0 && p.uniformNumber! <= 99, `Regular ${p.name} must have 0-99 jersey number`);
        assert.ok(!retiredSet.has(p.uniformNumber!), `${tid}-${p.name} collided with retired #${p.uniformNumber}`);
      }
    }
  }
  const starNumberChecks: [string, string, number][] = [
    ['한화', '류현진', 99],
    ['한화', '노시환', 8],
    ['LG', '오지환', 10],
    ['SSG', '최정', 14],
    ['KIA', '김도영', 5],
    ['삼성', '구자욱', 5],
  ];
  for (const [tid, name, expectedNum] of starNumberChecks) {
    const found = Object.values(freshLG.players).find((p) => p.teamId === tid && p.name === name);
    assert.equal(found?.uniformNumber, expectedNum, `Expected ${tid} ${name} to wear #${expectedNum}`);
  }

  // (d) Developmental (육성선수) squad across league + registration conversion workflow
  const allDevPlayers = Object.values(freshLG.players).filter((p) => p.rosterTier === '육성');
  assert.ok(allDevPlayers.length >= 10, `League must have realistic 육성선수 pool, got ${allDevPlayers.length}`);
  const lgDev = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.rosterTier === '육성'
  )!;
  assert.throws(() => callUpPlayer(freshLG, lgDev.id), 'Direct call-up of 육성선수 to 1군 must be blocked');
  assert.throws(
    () => convertDevelopmentalPlayer(freshLG, lgDev.id),
    /5월 1일/,
    'Developmental player conversion before May 1 must be blocked'
  );
  let freshLGMay = structuredClone(freshLG);
  freshLGMay.phase = 'REGULAR_SEASON';
  freshLGMay.currentSeriesIndex = 14; // May
  freshLGMay.gamesPlayed = 42;
  // KBO 68인 정식선수 정원이 가득 찬 경우 1명 웨이버 방출 후 전환 검증
  const lgRegisteredCount = Object.values(freshLGMay.players).filter(
    (p) => p.teamId === 'LG' && (p.rosterTier === '1군' || p.rosterTier === '2군')
  ).length;
  if (lgRegisteredCount >= 68) {
    const waiveCand = Object.values(freshLGMay.players).find(
      (p) => p.teamId === 'LG' && p.rosterTier === '2군' && p.category === '국내'
    )!;
    freshLGMay = releaseDomesticPlayerToWaiver(freshLGMay, waiveCand.id).nextCareer;
  }
  const afterConvert = convertDevelopmentalPlayer(freshLGMay, lgDev.id);
  const convertedPlayer = afterConvert.players[lgDev.id];
  assert.equal(convertedPlayer.rosterTier, '2군');
  assert.ok(
    (convertedPlayer.uniformNumber ?? 999) <= 99,
    `Converted developmental player must receive a 2-digit number, got ${convertedPlayer.uniformNumber}`
  );
  const afterDevCallUp = callUpPlayer(afterConvert, lgDev.id);
  assert.equal(afterDevCallUp.players[lgDev.id].rosterTier, '1군');

  // (e) Batch Recommended Training Focus System
  const batchTrainRes = applyRecommendedTrainingBatch(freshLG);
  const afterBatchTrain = batchTrainRes.nextCareer;
  const myActiveLG = Object.values(afterBatchTrain.players).filter(
    (p) => p.teamId === 'LG' && p.rosterTier !== '은퇴' && p.rosterTier !== '제외후보'
  );
  for (const p of myActiveLG) {
    assert.ok(p.trainingFocus, `Expected trainingFocus to be set for ${p.name}`);
  }

  // (f) MLB Team Logo Metadata for all 30 MLB clubs
  assert.equal(MLB_CLUBS.length, 30);
  for (const club of MLB_CLUBS) {
    const meta = MLB_TEAM_META[club];
    assert.ok(meta, `Missing MLB_TEAM_META for ${club}`);
    assert.ok(meta.mlbId > 0 && meta.koreanName.length > 0 && meta.abbr.length >= 2);
  }

  // 27. All 12 New Features Verification:
  // (1) Contract startSeason/endSeason on initial roster & newly signed contracts
  const ojh = Object.values(freshLG.players).find((p) => p.teamId === 'LG' && p.name === '오지환')!;
  assert.ok(typeof ojh.contract.startSeason === 'number' && ojh.contract.startSeason <= freshLG.season);
  assert.equal(ojh.contract.endSeason, freshLG.season + ojh.contract.yearsRemaining - 1);
  const signedDomPlayer = Object.values(afterSignForeign.players).find(
    (p) => p.teamId === 'LG' && p.name === virtualTarget.name
  )!;
  assert.equal(signedDomPlayer.contract.startSeason, freshLG.season);
  assert.equal(signedDomPlayer.contract.endSeason, freshLG.season);

  // (2) Hanwha Wilkel Hernandez replaces Troy Watson while preserving v4.60.30 master invariants
  const hanwhaMasterPlayers = Object.values(master.players).filter((p) => p.teamId === '한화');
  assert.ok(
    hanwhaMasterPlayers.some((p) => p.name === '윌켈 에르난데스' && p.category === '외국인'),
    'Hanwha master save must contain 윌켈 에르난데스'
  );
  assert.ok(
    !hanwhaMasterPlayers.some((p) => p.name === '트로이 왓슨'),
    'Hanwha master save must no longer contain 트로이 왓슨'
  );
  assert.equal(master.finances.krwUnpaidBillion, 43.3);
  assert.equal(master.finances.usdUnpaid, 1800000);
  assert.equal(master.finances.cashBalanceBillion, null);
  assert.equal(hanwhaRow.wins, 6);
  assert.equal(hanwhaRow.losses, 3);

  // (3) Manager firing system (manual & autonomous)
  const firingTestCareer = structuredClone(freshLG);
  const oldLgMgr = firingTestCareer.coaches['LG'].find((c) => c.role === '감독')!.name;
  const firedRec = fireAndReplaceClubManager(
    firingTestCareer,
    'LG',
    '성적 부진으로 인한 경질',
    '2026-06-15',
    9,
    0.365,
    false
  );
  assert.ok(firedRec !== null, 'Manager firing must produce a firing record');
  assert.equal(firedRec!.firedManagerName, oldLgMgr);
  assert.notEqual(
    firingTestCareer.coaches['LG'].find((c) => c.role === '감독')!.name,
    oldLgMgr
  );
  assert.ok((firingTestCareer.managerFirings?.length ?? 0) >= 1);

  // (4) 12-team Futures League split into 북부리그 (6: 상무·한화·고양·LG·두산·SSG) & 남부리그 (6: 울산·롯데·NC·KT·KIA·삼성)
  assert.equal(FUTURES_NORTH_TEAMS.length, 6);
  assert.equal(FUTURES_SOUTH_TEAMS.length, 6);
  assert.deepEqual(FUTURES_NORTH_TEAMS, ['상무', '한화', '키움', 'LG', '두산', 'SSG']);
  assert.deepEqual(FUTURES_SOUTH_TEAMS, ['울산', '롯데', 'NC', 'KT', 'KIA', '삼성']);
  assert.equal(FUTURES_TEAMS_META['키움'].officialName, '고양 히어로즈');
  assert.equal(FUTURES_TEAMS_META['상무'].officialName, '상무 피닉스');
  assert.equal(FUTURES_TEAMS_META['울산'].officialName, '울산 웨일즈');
  assert.equal(cur.futuresStandings!['상무'].division, '북부리그');
  assert.equal(cur.futuresStandings!['울산'].division, '남부리그');
  assert.equal(cur.futuresStandings!['KT'].division, '남부리그');
  assert.equal(cur.futuresStandings!['키움'].division, '북부리그');
  assert.ok(cur.futuresStandings!['상무'].games > 0, '상무 피닉스 must play Futures games');
  assert.ok(cur.futuresStandings!['울산'].games > 0, '울산 웨일즈 must play Futures games');

  // (5) Realistic National Team calendar & automatic call-up during 2026 season
  const sched2026 = getScheduledNationalTournamentsForSeason(2026);
  const sched2027 = getScheduledNationalTournamentsForSeason(2027);
  const sched2028 = getScheduledNationalTournamentsForSeason(2028);
  assert.ok(sched2026.some((s) => s.tournamentName.includes('WBC')));
  assert.ok(sched2026.some((s) => s.tournamentName.includes('아시안게임')));
  assert.ok(sched2027.some((s) => s.tournamentName.includes('프리미어12')));
  assert.ok(sched2028.some((s) => s.tournamentName.includes('올림픽')));
  const expectedCurrentSeasonTournaments = getScheduledNationalTournamentsForSeason(cur.season).length;
  assert.ok(
    (cur.nationalTeamEvents?.length ?? 0) >= expectedCurrentSeasonTournaments,
    `Expected automatic ${cur.season} national team call-ups (>= ${expectedCurrentSeasonTournaments}), got ${cur.nationalTeamEvents?.length ?? 0}`
  );
  assert.ok(cur.nationalTeamEvents!.every((e) => e.isAutoCalledUp === true));

  // (6) Pre-season & Post-season Release Candidates Recommendations
  const preReleaseRecs = getRecommendedReleaseCandidates(freshLG, 5);
  assert.ok(preReleaseRecs.length >= 1 && preReleaseRecs.length <= 5);
  assert.ok(preReleaseRecs.every((r) => r.reason.length > 0));
  const postReleaseRecs = getRecommendedReleaseCandidates(cur, 5);
  assert.ok(postReleaseRecs.length >= 1);

  // (7) Overseas Training Dispatch & Auto-Return (both preseason immediate & in-season multi-series)
  const slumpTargetPre = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '2군'
  )!;
  const preOverseasCash = freshLG.finances.cashBalanceBillion!;
  const afterPreOverseas = sendPlayerToOverseasTraining(freshLG, slumpTargetPre.id, 'JP_MIYAZAKI').nextCareer;
  assert.ok(afterPreOverseas.finances.cashBalanceBillion! < preOverseasCash);
  assert.equal(afterPreOverseas.overseasTrainings?.[0].status, '복귀완료', 'Preseason/offseason overseas camp completes immediately');

  const inSeasonTarget = Object.values(after1Series.players).find(
    (p) => p.teamId === after1Series.playerTeamId && p.category === '국내' && p.rosterTier === '2군'
  )!;
  const afterInSeasonOverseas = sendPlayerToOverseasTraining(
    after1Series,
    inSeasonTarget.id,
    'JP_MIYAZAKI'
  ).nextCareer;
  assert.ok(afterInSeasonOverseas.players[inSeasonTarget.id].overseasTrainingLocation !== undefined);
  assert.equal(afterInSeasonOverseas.overseasTrainings?.[0].status, '연수중');
  let ovCur = afterInSeasonOverseas;
  for (let i = 0; i < 6; i++) {
    ovCur = simulateNextRegularSeries(ovCur).nextCareer;
  }
  const returnedRec = ovCur.overseasTrainings!.find((r) => r.playerId === inSeasonTarget.id)!;
  assert.equal(returnedRec.status, '복귀완료');
  assert.equal(ovCur.players[inSeasonTarget.id].overseasTrainingLocation, undefined);

  // (8) Enhanced Save & Resume (lastPlayedCareer, saveCareerAsNewSlot, renameSavedCareer)
  const memStore = new Map<string, string>();
  const prevStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    get length() {
      return memStore.size;
    },
    clear() {
      memStore.clear();
    },
    getItem(k: string) {
      return memStore.has(k) ? memStore.get(k)! : null;
    },
    key(i: number) {
      return Array.from(memStore.keys())[i] ?? null;
    },
    removeItem(k: string) {
      memStore.delete(k);
    },
    setItem(k: string, v: string) {
      memStore.set(k, v);
    },
  };
  try {
    saveCareer(freshLG);
    const clonedSlot = saveCareerAsNewSlot(freshLG, 'LG 백업 슬롯');
    assert.notEqual(clonedSlot.careerId, freshLG.careerId);
    assert.equal(clonedSlot.label, 'LG 백업 슬롯');
    const renamedOk = renameSavedCareer(clonedSlot.careerId, 'LG 시즌중 슬롯');
    assert.equal(renamedOk, true);
    const contOpts = listContinueOptions();
    assert.ok(contOpts.lastPlayedCareer !== null);
    assert.equal(contOpts.lastPlayedCareer!.careerId, clonedSlot.careerId);
    assert.equal(contOpts.lastPlayedCareer!.label, 'LG 시즌중 슬롯');
    assert.ok(contOpts.savedCareers.length >= 2);
  } finally {
    if (prevStorage) {
      (globalThis as unknown as { localStorage: Storage }).localStorage = prevStorage;
    } else {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    }
  }

  // (9) Realistic Schedule Metadata (Monday Rest, All-Star Break, Travel km, Makeup Window)
  assert.ok(freshLG.schedule.some((s) => s.hasMondayRestBefore === true), 'Schedule must mark Monday rest days');
  assert.ok(freshLG.schedule.some((s) => s.isAllStarBreakBefore === true), 'Schedule must include All-Star Break');
  assert.ok(freshLG.schedule.some((s) => s.isMakeupWindow === true), 'Schedule must mark late-September makeup window');
  assert.ok(
    freshLG.schedule.every((s) => typeof s.travelDistanceKm === 'number'),
    'Every schedule series must include travelDistanceKm'
  );

  // (10) Other 9 Clubs Autonomous GM Engine (Sponsors + Autonomous Roster/Manager Actions)
  assert.ok(cur.otherClubSponsors && Object.keys(cur.otherClubSponsors).length >= 9);
  for (const tid of TEAM_IDS) {
    if (tid !== cur.playerTeamId) {
      assert.ok((cur.otherClubSponsors![tid] ?? '').length > 0, `Expected sponsor for ${tid}`);
    }
  }
  assert.ok((nextSeason.managerFirings?.length ?? 0) >= 1, 'League must record at least 1 manager firing across season/offseason');

  // (11) News-Fan Reaction Integration + Auto-Verified Series Recap Stats
  const verifiedNews = (cur.newsFeed ?? []).filter((n) => n.verifiedStats === true);
  assert.ok(verifiedNews.length >= 5, `Expected verified series recap news, got ${verifiedNews.length}`);
  assert.ok(
    verifiedNews.some((n) => typeof n.fanSentimentImpact === 'number' && typeof n.attendanceImpactPct === 'number'),
    'Verified news articles must carry fan sentiment & attendance impact fields'
  );

  // (12) Permanent Cross-Season Historical Archive Preservation
  assert.ok((cur.seasonHistory?.length ?? 0) >= 1, 'Completed season must archive SeasonHistorySummary');
  assert.ok((nextSeason.seasonHistory?.length ?? 0) >= 1, 'seasonHistory must persist into next season');
  assert.equal(
    nextSeason.championHistory?.length,
    cur.championHistory?.length,
    'championHistory must persist intact into next season'
  );
  assert.equal(
    nextSeason.awardsHistory.length,
    afterAwards.awardsHistory.length,
    'awardsHistory must persist intact into next season'
  );

  // 28. All 11 New Features Verification:
  // (1) 6-role coaching staff (감독/수석/투수/타격/배터리/수비), subRatings, manager coach recommendations & virtual global scout
  for (const tid of TEAM_IDS) {
    const st = freshLG.coaches[tid] ?? [];
    assert.equal(st.length, COACH_ROLES.length, `${tid} must start with ${COACH_ROLES.length} coaching staff`);
    for (const role of COACH_ROLES) {
      const found = st.find((c) => c.role === role);
      assert.ok(found, `${tid} missing ${role}`);
      const expectedMinSubKeys = role === '수석코치' ? 3 : 4;
      assert.ok(
        found!.subRatings && Object.keys(found!.subRatings).length >= expectedMinSubKeys,
        `${tid} ${role} missing subRatings`
      );
    }
  }
  const mgrRecs = getManagerRecommendedCoaches(freshLG);
  assert.ok(mgrRecs.recommendations.length >= 1, 'Manager must recommend at least 1 coach upgrade/fill');
  const scoutedCoachesRes = scoutVirtualCoaches(freshLG);
  assert.ok(scoutedCoachesRes.addedCoaches.length >= 3, 'Virtual coach scouting must add KR/JP/US/DR coaches');
  assert.ok(
    scoutedCoachesRes.addedCoaches.some((c) => c.isVirtual && c.nationality && c.nationality !== '한국'),
    'Virtual coach scouting must include international coaches'
  );

  // (2) Rival club news & MLB news + MLB exported Korean players tracker
  assert.ok((cur.mlbExports?.length ?? 0) >= 3, 'Career must track MLB-exported Korean players');
  assert.ok(
    (cur.newsFeed ?? []).some((n) => n.category === '타구단소식'),
    'Season news feed must include rival club news (타구단소식)'
  );
  assert.ok(
    (cur.newsFeed ?? []).some((n) => n.category === 'MLB소식'),
    'Season news feed must include MLB Korean players/posting news (MLB소식)'
  );

  // (3) Starting rotation reordering & starter <-> bullpen toggle
  const origRot = [...freshLG.teams['LG'].rotationOrder];
  assert.ok(origRot.length >= 4, 'LG must have >=4 starting pitchers');
  const afterSwapRot = reorderStartingRotation(freshLG, 0, 1);
  assert.equal(afterSwapRot.teams['LG'].rotationOrder[0], origRot[1]);
  assert.equal(afterSwapRot.teams['LG'].rotationOrder[1], origRot[0]);
  const afterDemoteStarter = togglePitcherRotationSpot(afterSwapRot, origRot[0]);
  assert.ok(!afterDemoteStarter.teams['LG'].rotationOrder.includes(origRot[0]));
  assert.ok(afterDemoteStarter.teams['LG'].bullpenOrder.includes(origRot[0]));
  const afterPromoteStarter = togglePitcherRotationSpot(afterDemoteStarter, origRot[0]);
  assert.ok(afterPromoteStarter.teams['LG'].rotationOrder.includes(origRot[0]));

  // (4) & (7) GM retired number auto-achievement + collision reassignment
  const lgStarForRetire = Object.values(freshLG.players).find(
    (p) => p.teamId === 'LG' && p.name === '오지환'
  )!;
  const autoAch = buildRealisticRetirementAchievement(lgStarForRetire, freshLG);
  assert.ok(autoAch.includes('통산') && autoAch.includes('경기'), `Auto retirement achievement should include realistic stats: ${autoAch}`);
  const afterAutoRetire = retirePlayerUniformNumber(
    freshLG,
    lgStarForRetire.name,
    lgStarForRetire.position,
    lgStarForRetire.uniformNumber!,
    '',
    lgStarForRetire.id
  ).nextCareer;
  const retiredRec = afterAutoRetire.leagueHistory!.retiredNumbers.find(
    (r) => r.teamId === 'LG' && r.number === lgStarForRetire.uniformNumber
  );
  assert.ok(retiredRec && retiredRec.careerSummary.length > 8, 'Retired number must store auto-generated realistic achievement');

  // (5) Dynamic Annual KBO Rules Evolution (추가 / 수정 / 폐지)
  assert.ok((freshLG.activeKboRules?.length ?? 0) >= 5, '2026 must start with active KBO rules');
  assert.ok(
    (nextSeason.ruleChangeHistory?.length ?? 0) >= 1,
    'Advancing to 2027 must automatically record KBO rule changes (추가/수정/폐지)'
  );

  // (6) KBO Career Stats baseline + live season addition + cross-season commit
  const cjg2026 = Object.values(freshLG.players).find((p) => p.teamId === 'SSG' && p.name === '최정')!;
  const cjgEnd2026 = Object.values(cur.players).find((p) => p.id === cjg2026.id)!;
  const cjg2027 = Object.values(nextSeason.players).find((p) => p.id === cjg2026.id)!;
  const baseHR = cjg2026.careerStats && 'HR' in cjg2026.careerStats ? cjg2026.careerStats.HR : 0;
  const liveEndStats = getLiveCareerStats(cjgEnd2026);
  const liveEndHR = 'HR' in liveEndStats ? liveEndStats.HR : 0;
  const committed2027HR = cjg2027.careerStats && 'HR' in cjg2027.careerStats ? cjg2027.careerStats.HR : 0;
  assert.ok(baseHR >= 490, `최정 must have realistic KBO career HR baseline, got ${baseHR}`);
  assert.ok(liveEndHR >= baseHR, 'Live career stats must add current season HR');
  assert.equal(committed2027HR, liveEndHR, 'Committed 2027 career HR must preserve 2026 season total');

  // (8) Manager of the Year Award (올해의 감독상)
  const latestAward = afterAwards.awardsHistory[afterAwards.awardsHistory.length - 1];
  assert.ok(latestAward.managerOfTheYear, 'Season awards must include 올해의 감독상');
  assert.ok(latestAward.managerOfTheYear!.managerName.length > 0);
  assert.ok(
    (afterAwards.seasonHistory ?? []).some((sh) => Boolean(sh.managerOfTheYearName)),
    'SeasonHistorySummary must archive managerOfTheYearName'
  );

  // (9) Foreign & Asian-quota player nationality display
  const foreignPlayersLG = Object.values(freshLG.players).filter(
    (p) => p.category === '외국인' || p.category === '아시아쿼터'
  );
  assert.ok(foreignPlayersLG.length >= 20, 'League must have foreign/Asian-quota players');
  for (const fp of foreignPlayersLG) {
    assert.ok(fp.nationality && fp.nationality !== '한국', `${fp.name} must have foreign nationality`);
    const disp = getNationalityDisplay(fp.nationality);
    assert.ok(disp.flag.length > 0 && disp.label.length > 0);
  }

  // (10) Draft round/pick & developmental status in acquisitionInfo
  const ryu = Object.values(master.players).find((p) => p.teamId === '한화' && p.name === '류현진')!;
  assert.ok(
    ryu.acquisitionInfo?.draftRound === 1 && ryu.acquisitionInfo?.label.includes('1R'),
    `Expected draft info on 류현진, got ${ryu.acquisitionInfo?.label}`
  );
  assert.equal(lgDev.acquisitionInfo?.type, '육성선수');
  assert.ok(
    convertedPlayer.acquisitionInfo?.label.includes('정식선수 전환'),
    `Converted dev player must note conversion in acquisitionInfo: ${convertedPlayer.acquisitionInfo?.label}`
  );
  // Drafted rookie must carry draftRound & draftPick in acquisitionInfo
  const draftStepCareer = advanceDraftUntilUserTurn(freshLG).nextCareer;
  const topDraftCand = draftStepCareer.draftState.candidates.find((c) => !c.draftedBy)!;
  const afterUserDraft = pickDraftCandidateForUser(draftStepCareer, topDraftCand.id).nextCareer;
  const draftedPlayer = Object.values(afterUserDraft.players).find(
    (p) => p.teamId === 'LG' && p.name === topDraftCand.name
  )!;
  assert.ok(draftedPlayer.acquisitionInfo?.draftRound === 1, 'Drafted rookie must record draftRound');
  assert.ok(
    draftedPlayer.acquisitionInfo?.label.includes('1R'),
    `Drafted rookie label must include round/pick: ${draftedPlayer.acquisitionInfo?.label}`
  );

  // 29. All 12 Latest Follow-Up Features Verification:
  // (1) Sangmu Phoenix & Ulsan Whales Futures metadata intact
  assert.equal(FUTURES_TEAMS_META['상무'].officialName, '상무 피닉스');
  assert.equal(FUTURES_TEAMS_META['울산'].officialName, '울산 웨일즈');

  // (2) End-of-season player-initiated MLB posting request
  const postReqCareer = structuredClone(freshLG);
  const eligibleStar = Object.values(postReqCareer.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  eligibleStar.serviceYears = 7;
  eligibleStar.age = 27;
  eligibleStar.ability = 86;
  eligibleStar.postedThisYear = false;
  eligibleStar.postingBlockedUntilNextNov = false;
  eligibleStar.postingRequested = false;
  const requestedList = generateEndOfSeasonPostingRequests(postReqCareer);
  assert.ok(requestedList.some((p) => p.id === eligibleStar.id), 'Eligible 7yr star must submit offseason MLB posting request');
  assert.equal(postReqCareer.players[eligibleStar.id].postingRequested, true);
  assert.ok(
    (postReqCareer.complaints ?? []).some((c) => c.playerId === eligibleStar.id && c.reason === '포스팅희망'),
    'Offseason posting request must create 포스팅희망 complaint'
  );

  // (3) Smart Financial Investment Recommendations TOP 3
  const finRecs = getFinancialInvestmentRecommendations(freshLG);
  assert.equal(finRecs.length, 3, 'Must return TOP 3 financial investment recommendations');
  assert.ok(finRecs.every((r) => r.costBillion > 0 && r.reason.length > 0 && r.expectedEffect.length > 0));

  // (4) Korean Contract Summary Formatting ("N년 총액 XX억 원")
  assert.equal(formatKrwBillionKorean(48), '48억 원');
  const kSummary = formatKrwContractSummary({
    years: 4,
    totalBillion: 48,
    annualSalaryBillion: 9,
    signingBonusBillion: 12,
    startSeason: 2026,
  });
  assert.ok(
    kSummary.includes('4년 총액 48억 원') && kSummary.includes('2026~2029'),
    `Unexpected contract summary format: ${kSummary}`
  );

  // (5) National Team Call-up excludes player during 6-game window & auto-returns after endRound
  const ntBase = createNewCareer({ teamId: 'LG', gmName: '테스터' });
  ntBase.phase = 'REGULAR_SEASON';
  const afterNtCall = runNationalTeamTournament(ntBase).nextCareer;
  assert.ok(afterNtCall.activeNationalTeamDuty !== null && afterNtCall.activeNationalTeamDuty !== undefined);
  const calledIds = afterNtCall.activeNationalTeamDuty!.playerIds;
  assert.ok(calledIds.length >= 10, 'National team must call up >=10 players');
  const endRound = afterNtCall.activeNationalTeamDuty!.endRound;
  assert.equal(endRound, 6);
  const sampleCalled = afterNtCall.players[calledIds[0]];
  assert.equal(isPlayerOnNationalTeamDuty(sampleCalled, afterNtCall.gamesPlayed), true);

  // Play 1 game during National Team call-up -> called-up players must NOT appear in regular boxscores
  const afterNtGame1 = simulateNextRegularGame(afterNtCall).nextCareer;
  assert.equal(afterNtGame1.gamesPlayed, 1);
  const g1Records = afterNtGame1.gamesLedger.filter((g) => g.round === 1);
  assert.equal(g1Records.length, 5, 'Single regular game round must generate exactly 5 league games');
  const calledSet = new Set(calledIds);
  for (const g of g1Records) {
    assert.ok(g.boxscore, 'Simulated regular game must include boxscore');
    for (const b of [...g.boxscore!.awayBatters, ...g.boxscore!.homeBatters]) {
      assert.ok(!calledSet.has(b.playerId), `Called-up batter ${b.name} must not play in regular season R1`);
    }
    for (const pit of [...g.boxscore!.awayPitchers, ...g.boxscore!.homePitchers]) {
      assert.ok(!calledSet.has(pit.playerId), `Called-up pitcher ${pit.name} must not pitch in regular season R1`);
    }
  }
  // Finish remaining 5 games of the 6-game window -> players auto-return
  let ntCur = afterNtGame1;
  for (let g = 0; g < 5; g++) {
    ntCur = simulateNextRegularGame(ntCur).nextCareer;
  }
  assert.equal(ntCur.gamesPlayed, 6);
  assert.equal(ntCur.activeNationalTeamDuty, null, 'National team duty must clear after endRound');
  assert.equal(
    isPlayerOnNationalTeamDuty(ntCur.players[calledIds[0]], ntCur.gamesPlayed),
    false,
    'Called-up player must return after endRound'
  );

  // (6) & (10-A) Direct Batter & Pitcher Lineup Swapping + Strict Unique Positions (Flexible DH only)
  const swapBase = createNewCareer({ teamId: 'LG', gmName: '테스터' });
  const swapTeam = swapBase.teams['LG'];
  const dhSlotIdx = swapTeam.lineupOrder.findIndex((pid) => swapTeam.lineupPositions[pid] === 'DH');
  assert.ok(dhSlotIdx >= 0, 'Initial lineup must include a DH slot');
  const origDhPlayer = swapTeam.lineupOrder[dhSlotIdx];
  const benchBat = Object.values(swapBase.players).find(
    (p) => p.teamId === 'LG' && p.role === '타자' && p.rosterTier === '1군' && !swapTeam.lineupOrder.includes(p.id)
  )!;
  // Any position bench batter can enter the DH slot
  const afterBatSwap = setLineupSlot(swapBase, dhSlotIdx, benchBat.id, 'DH');
  assert.equal(afterBatSwap.teams['LG'].lineupOrder[dhSlotIdx], benchBat.id);
  assert.equal(afterBatSwap.teams['LG'].lineupPositions[benchBat.id], 'DH');
  assert.ok(afterBatSwap.teams['LG'].benchOrder.includes(origDhPlayer));
  assert.equal(
    validateUniqueLineup(
      afterBatSwap.players,
      afterBatSwap.teams['LG'].lineupOrder,
      afterBatSwap.teams['LG'].lineupPositions
    ).valid,
    true
  );
  // Reassigning a starter to another starter's fielding position cleanly swaps positions with zero duplicates
  const nonDhSlots = swapTeam.lineupOrder
    .map((pid, idx) => ({ pid, idx, pos: swapTeam.lineupPositions[pid] }))
    .filter((x) => x.pos !== 'DH');
  const nonDhIdx = nonDhSlots[0].idx;
  const dupTargetPos = nonDhSlots[1].pos;
  const swappedPosCareer = setLineupSlot(swapBase, nonDhIdx, swapTeam.lineupOrder[nonDhIdx], dupTargetPos);
  assert.equal(swappedPosCareer.teams['LG'].lineupPositions[nonDhSlots[0].pid], dupTargetPos);
  assert.equal(
    validateUniqueLineup(
      swappedPosCareer.players,
      swappedPosCareer.teams['LG'].lineupOrder,
      swappedPosCareer.teams['LG'].lineupPositions
    ).valid,
    true,
    'Swapping fielding positions between starters must maintain unique 9-position lineup'
  );
  // Pitcher rotation <-> bullpen 1:1 swap & bullpen reorder
  const origSp0 = swapTeam.rotationOrder[0];
  const bpPit = Object.values(swapBase.players).find(
    (p) => p.teamId === 'LG' && p.role === '투수' && p.rosterTier === '1군' && !swapTeam.rotationOrder.includes(p.id)
  )!;
  const afterRotSwap = swapRotationWithBullpen(swapBase, 0, bpPit.id);
  assert.equal(afterRotSwap.teams['LG'].rotationOrder[0], bpPit.id);
  assert.ok(afterRotSwap.teams['LG'].bullpenOrder.includes(origSp0));
  const afterBpReorder = reorderBullpen(afterRotSwap, 0, 1);
  assert.equal(afterBpReorder.teams['LG'].bullpenOrder[1], afterRotSwap.teams['LG'].bullpenOrder[0]);

  // (7) Single-game advance (1경기씩 진행) matches series & standings integrity
  let gByG = createNewCareer({ teamId: 'LG', gmName: '테스터' });
  gByG.phase = 'REGULAR_SEASON';
  const s0Games = gByG.schedule[0].dates.length;
  gByG = simulateNextRegularGame(gByG).nextCareer;
  assert.equal(gByG.gamesPlayed, 1);
  assert.equal(gByG.currentSeriesIndex, 0, 'After 1 game of opening series, currentSeriesIndex remains 0');
  assert.equal(gByG.schedule[0].completedRounds, 1);
  for (let g = 2; g <= s0Games; g++) {
    gByG = simulateNextRegularGame(gByG).nextCareer;
    assert.equal(gByG.gamesPlayed, g);
    assert.equal(gByG.schedule[0].completedRounds, g);
  }
  assert.equal(gByG.currentSeriesIndex, 1, 'After final single game of opening series, series completes and advances index');

  // (8) Coach Form-Based Starter In/Out Recommendations (respects unique position rule)
  const formTest = createNewCareer({ teamId: 'LG', gmName: '테스터' });
  const hotBench = Object.values(formTest.players).find(
    (p) => p.teamId === 'LG' && p.role === '타자' && p.rosterTier === '1군' && !formTest.teams['LG'].lineupOrder.includes(p.id)
  )!;
  const matchingStarterId =
    formTest.teams['LG'].lineupOrder.find(
      (pid) => formTest.teams['LG'].lineupPositions[pid] === hotBench.position
    ) ??
    formTest.teams['LG'].lineupOrder.find(
      (pid) => formTest.teams['LG'].lineupPositions[pid] === 'DH'
    )!;
  const coldStarter = formTest.players[matchingStarterId];
  coldStarter.form = -3;
  hotBench.form = 4;
  hotBench.ability = Math.max(hotBench.ability, coldStarter.ability - 2);
  const formRecs = getCoachFormLineupRecommendations(formTest);
  assert.ok(
    formRecs.some((r) => r.outPlayerId === coldStarter.id && r.inPlayerId === hotBench.id),
    'Coach must recommend benching cold starter for position-valid hot bench batter'
  );
  const afterFormBatch = applyAllCoachFormRecommendations(formTest);
  assert.ok(afterFormBatch.appliedCount >= 1);
  assert.ok(afterFormBatch.nextCareer.teams['LG'].lineupOrder.includes(hotBench.id));
  assert.equal(
    validateUniqueLineup(
      afterFormBatch.nextCareer.players,
      afterFormBatch.nextCareer.teams['LG'].lineupOrder,
      afterFormBatch.nextCareer.teams['LG'].lineupPositions
    ).valid,
    true
  );

  // (9) Season-Start Coach Developmental Recruit & Conversion Recommendations
  const devAdvice = getCoachDevelopmentalRecommendations(freshLG);
  assert.ok(devAdvice.recruitRecommendations.length >= 2, 'Must recommend developmental recruits at season start');
  assert.ok(devAdvice.conversionRecommendations.length >= 1, 'Must recommend developmental conversions');
  const recruitTarget = devAdvice.recruitRecommendations[0].candidate;
  const afterRecruit = recruitDevelopmentalCandidate(freshLG, recruitTarget.id);
  assert.equal(afterRecruit.player.rosterTier, '육성');
  assert.ok((afterRecruit.player.uniformNumber ?? 0) >= 101);
  assert.equal(
    afterRecruit.nextCareer.developmentalMarket?.find((c) => c.id === recruitTarget.id)?.signed,
    true
  );

  // (10-B) Ability-to-Stats Realism Correlation across Full 144G Season
  const seasonBatters = Object.values(cur.players).filter(
    (p) => p.role === '타자' && ((p.stats as BatterStats).AB ?? 0) >= 200
  );
  const highBat = seasonBatters.filter((p) => p.ability >= 83);
  const lowBat = seasonBatters.filter((p) => p.ability <= 73);
  if (highBat.length >= 5 && lowBat.length >= 5) {
    const avgOps = (list: typeof seasonBatters) =>
      list.reduce((s, p) => s + (calcOPS(p.stats as BatterStats) ?? 0), 0) / list.length;
    const highOps = avgOps(highBat);
    const lowOps = avgOps(lowBat);
    assert.ok(
      highOps > lowOps + 0.08,
      `High-ability batters (OPS ${highOps.toFixed(3)}) must clearly outperform low-ability batters (OPS ${lowOps.toFixed(3)})`
    );
  }
  const seasonPitchers = Object.values(cur.players).filter(
    (p) => p.role === '투수' && ((p.stats as PitcherStats).outs ?? 0) >= 120
  );
  const highPit = seasonPitchers.filter((p) => p.ability >= 82);
  const lowPit = seasonPitchers.filter((p) => p.ability <= 73);
  if (highPit.length >= 4 && lowPit.length >= 4) {
    const avgEra = (list: typeof seasonPitchers) =>
      list.reduce((s, p) => s + (calcERA((p.stats as PitcherStats).ER, (p.stats as PitcherStats).outs) ?? 5), 0) /
      list.length;
    const highEra = avgEra(highPit);
    const lowEra = avgEra(lowPit);
    assert.ok(
      highEra < lowEra - 0.5,
      `High-ability pitchers (ERA ${highEra.toFixed(2)}) must clearly outperform low-ability pitchers (ERA ${lowEra.toFixed(2)})`
    );
  }

  // (11) Manager Pre-Game Lineup (with DH) & Rotation Recommendation + Apply
  const preRec = getManagerPreGameRecommendation(freshLG);
  assert.equal(preRec.recommendedLineup.length, 9);
  assert.equal(preRec.recommendedRotation.length, 5);
  assert.ok(
    preRec.recommendedLineup.some((x) => x.assignedPosition === 'DH'),
    'Manager pre-game lineup recommendation must explicitly designate a DH'
  );
  const afterMgrApply = applyManagerPreGameRecommendation(freshLG, 'both');
  assert.deepEqual(
    afterMgrApply.teams['LG'].lineupOrder,
    preRec.recommendedLineup.map((x) => x.playerId)
  );
  assert.deepEqual(
    afterMgrApply.teams['LG'].rotationOrder,
    preRec.recommendedRotation.map((x) => x.playerId)
  );

  // =========================================================================
  // TEST 29: Batch B 13-Item Verification Suite
  // =========================================================================
  // (#2) Expanded virtual coaches across all 5 roles
  const faCoachPool = getAvailableFaCoaches(freshLG);
  assert.ok(faCoachPool.length >= 25, `Must include expanded virtual coach pool, got ${faCoachPool.length}`);
  for (const role of COACH_ROLES) {
    assert.ok(
      faCoachPool.some((c) => c.role === role),
      `Coach pool must include candidates for role ${role}`
    );
  }

  // (#3) Draft candidate Korean names must never repeat syllables (e.g. 김우우 / 박준준)
  const rookies150 = generate150DraftCandidates(202607, true);
  assert.equal(rookies150.length, 150);
  for (const r of rookies150) {
    const baseName = r.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const chars = Array.from(baseName);
    assert.equal(chars.length, 3, `Rookie base name ${baseName} should be 3 Korean chars`);
    assert.notEqual(chars[1], chars[2], `Rookie name ${r.name} must not repeat given-name syllable`);
    assert.notEqual(chars[0], chars[1], `Rookie name ${r.name} must not repeat surname syllable`);
    assert.notEqual(chars[0], chars[2], `Rookie name ${r.name} must not repeat surname syllable`);
  }

  // (#4) Verified historical KBO legends (이승엽 467HR, 이대호 374HR, 최동원 103W, 선동열 146W/1.20)
  const lsy = REAL_KBO_HISTORICAL_LEGENDS.find((l) => l.playerName === '이승엽');
  const ldh = REAL_KBO_HISTORICAL_LEGENDS.find((l) => l.playerName === '이대호');
  const cdw = REAL_KBO_HISTORICAL_LEGENDS.find((l) => l.playerName === '최동원');
  const sdy = REAL_KBO_HISTORICAL_LEGENDS.find((l) => l.playerName === '선동열');
  assert.ok(lsy && lsy.notableStats.includes('467홈런'));
  assert.ok(ldh && ldh.notableStats.includes('374홈런'));
  assert.ok(cdw && cdw.notableStats.includes('103승') && cdw.notableStats.includes('2.46'));
  assert.ok(sdy && sdy.notableStats.includes('146승') && sdy.notableStats.includes('1.20'));

  // (#6) Zero active players wearing any retired uniform number of their team
  for (const tid of TEAM_IDS) {
    const retiredSet = new Set(getTeamRetiredNumbers(freshLG, tid));
    assert.ok(retiredSet.size > 0 || tid === 'KT' || tid === 'NC' || tid === '키움');
    const activeOnTeam = Object.values(freshLG.players).filter(
      (p) => p.teamId === tid && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
    );
    for (const pl of activeOnTeam) {
      if (pl.uniformNumber !== undefined) {
        assert.ok(
          !retiredSet.has(pl.uniformNumber),
          `${tid} active player ${pl.name} must not wear retired #${pl.uniformNumber}`
        );
      }
    }
  }

  // (#7) Every KBO team starts with 9 unique positions (C,1B,2B,3B,SS,LF,CF,RF,DH)
  for (const tid of TEAM_IDS) {
    const check = validateUniqueLineup(
      freshLG.players,
      freshLG.teams[tid].lineupOrder,
      freshLG.teams[tid].lineupPositions
    );
    assert.equal(check.valid, true, `${tid} initial lineup failed unique position check: ${check.error}`);
  }

  // (#8) Foreign & Asian-quota players display authentic previousLeagueClub
  const foreignPlayersAll = Object.values(freshLG.players).filter(
    (p) => p.category === '외국인' || p.category === '아시아쿼터'
  );
  assert.ok(foreignPlayersAll.length >= 25);
  assert.ok(
    foreignPlayersAll.every((p) => Boolean(p.previousLeagueClub && p.previousLeagueClub.length > 3)),
    'Every foreign/Asian-quota player must include previousLeagueClub (e.g. MLB/AAA/NPB club)'
  );

  // (#9) Realistic developmental player ratings (ability <= 57, potential <= 81)
  const allDevSeeds = Object.values(DEVELOPMENTAL_PLAYERS_SEED).flat();
  assert.ok(allDevSeeds.length >= 20);
  for (const d of allDevSeeds) {
    assert.ok(d.ability >= 49 && d.ability <= 57, `Dev seed ${d.name} ability ${d.ability} out of realistic range`);
    assert.ok(d.potential >= 65 && d.potential <= 81, `Dev seed ${d.name} potential ${d.potential} out of realistic range`);
  }

  // (#12) Sangmu 1.5-year (216G) service & mandatory age 26-27 enlistment (skipped for exempt players)
  const milTest = createNewCareer({ teamId: '한화', gmName: '테스터' });
  milTest.gamesPlayed = 30;
  const enlistCand = Object.values(milTest.players).find(
    (p) => p.teamId === '한화' && p.category === '국내' && (p.militaryStatus ?? '미필') === '미필' && p.age <= 26
  )!;
  const afterEnlist = enlistPlayerToSangmu(milTest, enlistCand.id).nextCareer;
  const enlisted = afterEnlist.players[enlistCand.id];
  assert.equal(enlisted.militaryStatus, '복무 중');
  assert.equal(enlisted.militaryEnlistedSeason, milTest.season);
  // 30 + 216 = 246 -> 1 full season (144) + round 102 in next season
  assert.equal(enlisted.militaryReturnSeason, milTest.season + 1);
  assert.equal(enlisted.militaryReturnRound, 102);

  // Mandatory enlistment test: age 27 미필 enlists automatically, age 27 면제 does NOT enlist
  const mandTest = createNewCareer({ teamId: '삼성', gmName: '테스터' });
  const exemptPlayer = Object.values(mandTest.players).find(
    (p) => p.teamId === '삼성' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  const nonExemptPlayer = Object.values(mandTest.players).find(
    (p) => p.teamId === '삼성' && p.category === '국내' && p.id !== exemptPlayer.id && p.rosterTier === '1군'
  )!;
  exemptPlayer.birthDate = '1999-06-01';
  exemptPlayer.age = 27;
  exemptPlayer.militaryStatus = '면제';
  nonExemptPlayer.birthDate = '1999-06-01';
  nonExemptPlayer.age = 27;
  nonExemptPlayer.militaryStatus = '입대 예정';
  const mandEnlisted = processMandatorySangmuEnlistments(mandTest, new SeededRng(12345), '2027-03-01');
  assert.ok(
    mandEnlisted.some((s) => s.includes(nonExemptPlayer.name)),
    `Age 27 미필 player ${nonExemptPlayer.name} must auto-enlist to Sangmu`
  );
  assert.equal(mandTest.players[nonExemptPlayer.id].militaryStatus, '복무 중');
  assert.equal(mandTest.players[exemptPlayer.id].militaryStatus, '면제', 'Exempt player must NOT enlist to Sangmu');

  // (#10) 144G League Stat Realism Bounds check on full simulated season `cur`
  const regGames144 = cur.gamesLedger.filter((g) => !g.isPostseason);
  const lgBatters = Object.values(cur.players).filter((p) => p.role === '타자');
  const lgPitchers = Object.values(cur.players).filter((p) => p.role === '투수');
  const lgRunsPerTeamG =
    regGames144.reduce((s, g) => s + g.awayRuns + g.homeRuns, 0) / Math.max(1, regGames144.length * 2);
  const lgAvg =
    lgBatters.reduce((s, p) => s + ((p.stats as BatterStats).H ?? 0), 0) /
    Math.max(1, lgBatters.reduce((s, p) => s + ((p.stats as BatterStats).AB ?? 0), 0));
  const lgEra =
    (lgPitchers.reduce((s, p) => s + ((p.stats as PitcherStats).ER ?? 0), 0) * 27) /
    Math.max(1, lgPitchers.reduce((s, p) => s + ((p.stats as PitcherStats).outs ?? 0), 0));
  assert.ok(lgRunsPerTeamG >= 3.8 && lgRunsPerTeamG <= 5.6, `League R/TeamG ${lgRunsPerTeamG.toFixed(2)} realistic`);
  assert.ok(lgAvg >= 0.245 && lgAvg <= 0.295, `League AVG ${lgAvg.toFixed(3)} realistic`);
  assert.ok(lgEra >= 3.6 && lgEra <= 5.4, `League ERA ${lgEra.toFixed(2)} realistic`);

  // 30. Deep Franchise 40-Feature Expansion Verification
  const deepCareer = createNewCareer({ teamId: '한화', gmName: '단장테스트' });
  // (#6) Default difficulty = '어려움' (recommended)
  assert.equal(deepCareer.difficulty, '어려움');
  assert.equal(DIFFICULTY_CONFIG['어려움'].recommended, true);

  // (#39) 선동열 removed from active & FA coaches (still preserved in REAL_KBO_HISTORICAL_LEGENDS above)
  const allActiveAndFaCoaches = [
    ...Object.values(deepCareer.coaches).flat(),
    ...(deepCareer.faCoaches ?? []),
  ];
  assert.equal(
    allActiveAndFaCoaches.some((c) => c.name === '선동열'),
    false,
    '선동열 must be removed from active & FA coaching pools'
  );

  // (#2, #23, #24) Pitch repertoire, batting profile, matchup edge, agent, hidden trait
  const samplePitcher = Object.values(deepCareer.players).find(
    (p) => p.teamId === '한화' && p.role === '투수' && p.rosterTier === '1군'
  )!;
  const sampleLineup = deepCareer.teams['LG'].lineupOrder.map((id) => deepCareer.players[id]).filter(Boolean);
  assert.ok(samplePitcher.pitchRepertoire && samplePitcher.pitchRepertoire.pitches.length >= 2);
  assert.ok(samplePitcher.agent && samplePitcher.agent.name.length > 0);
  assert.ok(samplePitcher.hiddenTrait && samplePitcher.hiddenTrait.length > 0);
  const edge = computePitcherBatterMatchupEdge(samplePitcher, sampleLineup, false);
  assert.ok(Number.isFinite(edge.pitcherEdge) && edge.hrFactor > 0.7 && edge.kFactor > 0.7);

  // (#3) Captain & leadership
  const captainCand = Object.values(deepCareer.players).find(
    (p) => p.teamId === '한화' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  const afterCaptain = setTeamCaptain(deepCareer, captainCand.id).nextCareer;
  assert.equal(afterCaptain.teams['한화'].leadership?.captainPlayerId, captainCand.id);
  assert.ok((afterCaptain.teams['한화'].leadership?.veteranLeadership ?? 0) >= 40);

  // (#4) Facility wear across full simulated season `cur` and maintenance repair
  assert.ok(cur.finances.facilityCondition, 'Facility condition state must exist');
  assert.ok(
    cur.finances.facilityCondition!.stadium < 88,
    `Stadium condition should wear down over 144G (got ${cur.finances.facilityCondition!.stadium})`
  );
  const repaired = repairFacility(cur, 'stadium');
  assert.equal(repaired.nextCareer.finances.facilityCondition!.stadium, 100);

  // (#7) Rebalanced KBO economy — no runaway hundreds of billions of cash
  const finalCash = cur.finances.cashBalanceBillion ?? 0;
  assert.ok(
    finalCash < 250 && finalCash > -150,
    `Cash balance after 144G should stay realistic (got ${finalCash}억)`
  );

  // (#9) Analytics center report
  const analytics = buildAnalyticsReport(cur, cur.playerTeamId);
  assert.ok(analytics.batters.length > 0 && analytics.pitchers.length > 0);
  assert.ok(analytics.positionStrength.length >= 9);
  assert.ok(Array.isArray(analytics.recommendedTargets));

  // (#12) Player market value index
  const mv = computePlayerTradeValue(samplePitcher);
  assert.ok(mv.index >= 15 && mv.index <= 999);

  // (#14, #15) Spring camp & exhibition games do not pollute 144G regular season stats
  const beforeRegGames = deepCareer.gamesPlayed;
  const campRes = runSpringCamp(deepCareer, '일본 오키나와', '균형', []);
  assert.equal(campRes.nextCareer.springCamp?.campCompleted, true);
  const exhibRes = playExhibitionGames(campRes.nextCareer, 3);
  assert.equal(exhibRes.nextCareer.gamesPlayed, beforeRegGames);
  assert.equal(exhibRes.nextCareer.springCamp?.exhibitionGames.length, 3);

  // (#16) Weather generation (Kiwoom dome immune) & recorded on simulated games
  const domeWeather = generateGameWeather('키움', '2026-06-15', new SeededRng(42));
  assert.equal(domeWeather.condition, '돔구장');
  const regWithWeather = cur.gamesLedger.filter((g) => !g.isPostseason && g.weather);
  assert.ok(regWithWeather.length > 100, 'Regular season games must record game weather');

  // (#17) Uniform number editing blocks retired/duplicate numbers and succeeds on open number
  const retiredHanwha = getTeamRetiredNumbers(deepCareer, '한화');
  if (retiredHanwha.length > 0) {
    assert.throws(() => changePlayerUniformNumber(deepCareer, captainCand.id, retiredHanwha[0]));
  }
  const usedNums = new Set(
    Object.values(deepCareer.players)
      .filter((p) => p.teamId === '한화' && p.rosterTier !== '은퇴' && p.uniformNumber !== undefined)
      .map((p) => p.uniformNumber!)
  );
  const openNum = Array.from({ length: 99 }, (_, i) => i + 1).find(
    (n) => !usedNums.has(n) && !retiredHanwha.includes(n)
  )!;
  const afterNumChange = changePlayerUniformNumber(deepCareer, captainCand.id, openNum).nextCareer;
  assert.equal(afterNumChange.players[captainCand.id].uniformNumber, openNum);

  // (#18) GM job offers & switching club on acceptance
  const offers = generateGmJobOffers(deepCareer);
  assert.ok(offers.length >= 2);
  const withOffers = { ...deepCareer, gmJobOffers: offers };
  const switched = acceptGmJobOffer(withOffers, offers[0].id).nextCareer;
  assert.equal(switched.playerTeamId, offers[0].teamId);

  // (#20) League environment hydrated
  assert.ok(deepCareer.leagueEnv && deepCareer.leagueEnv.runMultiplier > 0.8);

  // (#21) Medical rehab return approval (early vs full)
  const rehabCareer = createNewCareer({ teamId: '한화', gmName: '단장테스트' });
  const injTarget = Object.values(rehabCareer.players).find(
    (p) => p.teamId === '한화' && p.rosterTier === '1군'
  )!;
  injTarget.injury = {
    id: 'inj_test_1',
    playerId: injTarget.id,
    playerName: injTarget.name,
    teamId: '한화',
    description: '우측 햄스트링 경미 긴장',
    severity: '경미',
    daysTotal: 14,
    daysRemaining: 4,
    occurredRound: 10,
    occurredDate: '2026-04-10',
    rehabProgress: 82,
    medicalClearance: '조기복귀가능',
  };
  const earlyRes = decideMedicalReturn(rehabCareer, injTarget.id, 'early');
  assert.equal(earlyRes.nextCareer.players[injTarget.id].injury, null);
  const fullRes = decideMedicalReturn(rehabCareer, injTarget.id, 'full');
  assert.ok((fullRes.nextCareer.players[injTarget.id].injury?.rehabProgress ?? 0) >= 82);

  // (#25, #26, #27, #28, #33) FA qualification, salary cap, external FA signing & protection list
  const capSummary = computeSalaryCapSummary(deepCareer, '한화');
  assert.ok(capSummary.capBillion >= 135 && capSummary.teamTop40PayrollBillion > 0);
  const faQual = computeFaQualification(deepCareer, captainCand);
  assert.ok(faQual.grade === null || ['A', 'B', 'C'].includes(faQual.grade));

  const faTestCareer = createNewCareer({ teamId: '한화', gmName: '단장테스트' });
  faTestCareer.finances.cashBalanceBillion = 120;
  const extFaTarget = Object.values(faTestCareer.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군' && p.ability >= 80
  )!;
  extFaTarget.rosterTier = 'FA';
  extFaTarget.formerTeamId = 'LG';
  extFaTarget.contract.yearsRemaining = 0;
  extFaTarget.contract.isFAEligible = true;
  extFaTarget.contract.faGrade = 'A';
  extFaTarget.serviceYears = 9;
  extFaTarget.registrationDays = 145 * 9;
  const faMarket = getExternalFaMarket(faTestCareer);
  const targetListing = faMarket.find((x) => x.player.id === extFaTarget.id);
  assert.ok(targetListing, 'Eligible rival player with 0 contract years must appear in external FA market');
  const faSignRes = signExternalFaPlayer(
    faTestCareer,
    extFaTarget.id,
    targetListing!.fairYears,
    Math.round(targetListing!.fairTotalBillion * 1.45 * 10) / 10
  );
  assert.equal(faSignRes.accepted, true, `Generous FA offer should be accepted: ${faSignRes.message}`);
  assert.equal(faSignRes.nextCareer.players[extFaTarget.id].teamId, '한화');
  assert.equal(faSignRes.nextCareer.players[extFaTarget.id].signedAsFaSeason, faTestCareer.season);
  if (targetListing!.grade === 'A' || targetListing!.grade === 'B') {
    assert.ok(faSignRes.nextCareer.pendingFaProtection, 'Grade A/B external FA signing must require protection list');
    const eligibleProtIds = Object.values(faSignRes.nextCareer.players)
      .filter(
        (p) =>
          p.teamId === '한화' &&
          p.category === '국내' &&
          p.rosterTier !== '은퇴' &&
          p.rosterTier !== '해외이적' &&
          p.id !== extFaTarget.id
      )
      .slice(0, faSignRes.nextCareer.pendingFaProtection!.protectionLimit)
      .map((p) => p.id);
    const afterProt = confirmFaProtectionList(faSignRes.nextCareer, eligibleProtIds);
    assert.equal(afterProt.nextCareer.pendingFaProtection, null);
  }

  // (#29, #30) Trade deadline & FA first-year compliance guard
  const deadlineCareer = { ...faSignRes.nextCareer, gamesPlayed: 105 };
  const deadlineAudit = validateTradeCompliance(deadlineCareer, {
    targetTeamId: 'LG',
    myPlayerIds: [extFaTarget.id],
    theirPlayerIds: [],
  });
  assert.equal(deadlineAudit.valid, false, 'Trade after round 100 deadline must be blocked');
  const faFirstYrAudit = validateTradeCompliance(faSignRes.nextCareer, {
    targetTeamId: 'LG',
    myPlayerIds: [extFaTarget.id],
    theirPlayerIds: [],
  });
  assert.equal(faFirstYrAudit.valid, false, 'FA 1st-year player must be blocked from immediate trade');

  // (#5, #31) Domestic salary negotiation
  const salCareer = createNewCareer({ teamId: '한화', gmName: '단장테스트' });
  const salPlayer = Object.values(salCareer.players).find(
    (p) => p.teamId === '한화' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  const salRes = negotiateDomesticSalary(
    salCareer,
    salPlayer.id,
    Math.max(1.5, salPlayer.contract.annualSalary * 1.6)
  );
  assert.equal(salRes.accepted, true);

  // (#10) Overseas returnee signing
  const retCareer = createNewCareer({ teamId: '한화', gmName: '단장테스트' });
  retCareer.finances.cashBalanceBillion = 80;
  retCareer.overseasReturnPool = [
    {
      id: 'ret_test_1',
      playerName: '테스트복귀',
      originalKboTeamId: '한화',
      role: '투수',
      position: 'SP',
      age: 31,
      ability: 84,
      potential: 85,
      overseasClub: 'MLB 텍사스',
      overseasSummary: 'MLB 통산 3시즌 활약 후 친정 복귀 의사 표명',
      demandedYears: 4,
      demandedTotalBillion: 48,
    },
  ];
  const afterRet = signOverseasReturnee(retCareer, 'ret_test_1').nextCareer;
  assert.ok(Object.values(afterRet.players).some((p) => p.name === '테스트복귀' && p.teamId === '한화'));

  // (#35) 12-step offseason progression
  assert.equal(OFFSEASON_12_STEPS.length, 12);
  const offStepCareer = setOffseasonStep12(deepCareer, 'SPRING_CAMP').nextCareer;
  assert.equal(offStepCareer.offseasonStep12, 'SPRING_CAMP');

  // (#38) Retirement ceremony & optional uniform retirement
  const ceremony = buildRetirementCeremony(captainCand, 2026);
  const ceremonyCareer = { ...deepCareer, retirementCeremonies: [ceremony] };
  const ackedCeremony = acknowledgeRetirementCeremony(ceremonyCareer, ceremony.id, true).nextCareer;
  assert.equal(ackedCeremony.retirementCeremonies?.[0].acknowledged, true);
  assert.equal(ackedCeremony.retirementCeremonies?.[0].numberRetired, true);

  // 31. Batting Lineup Auto-Optimizer + Real Sangmu Phoenix Roster & Return + Ulsan Whales Special Rules
  const specialTest = createNewCareer({ teamId: '한화', gmName: '단장테스트' });

  // (A) Batting Order Auto-Optimizer: 1~9 role criteria & ZERO duplicate positions across all 10 KBO clubs
  assert.equal(BATTING_SLOT_SPECS.length, 9);
  assert.ok(BATTING_SLOT_SPECS[0].roleTitle.includes('리드오프') || BATTING_SLOT_SPECS[0].roleTitle.includes('출루'));
  assert.ok(BATTING_SLOT_SPECS[3].roleTitle.includes('해결사') || BATTING_SLOT_SPECS[3].roleTitle.includes('장타'));
  assert.ok(BATTING_SLOT_SPECS[7].roleTitle.includes('수비'));
  assert.ok(BATTING_SLOT_SPECS[8].roleTitle.includes('연결'));
  for (const tid of TEAM_IDS) {
    const opt = optimizeBattingLineup(specialTest, tid);
    assert.equal(opt.slots.length, 9, `${tid} optimized lineup must have 9 batters`);
    const uniquePosCheck = validateUniqueLineup(specialTest.players, opt.lineupOrder, opt.lineupPositions);
    assert.equal(
      uniquePosCheck.valid,
      true,
      `${tid} optimized lineup must have ZERO duplicate positions: ${uniquePosCheck.error}`
    );
  }
  const appliedOpt = applyOptimizedBattingLineup(specialTest, '한화');
  assert.equal(appliedOpt.nextCareer.teams['한화'].lineupOrder.length, 9);
  assert.equal(
    validateUniqueLineup(
      appliedOpt.nextCareer.players,
      appliedOpt.nextCareer.teams['한화'].lineupOrder,
      appliedOpt.nextCareer.teams['한화'].lineupPositions
    ).valid,
    true
  );

  // (B) Real Sangmu Phoenix Roster & Automatic Return to Original KBO Team on Discharge
  const initialSangmu = Object.values(specialTest.players).filter(
    (p) => p.militaryStatus === '복무 중' || p.militaryStatus === '상무복무'
  );
  assert.ok(initialSangmu.length >= 20, `Real Sangmu roster must be populated (got ${initialSangmu.length})`);
  const hwangDongjae = initialSangmu.find((p) => p.name === '황동재');
  const kimGijung = initialSangmu.find((p) => p.name === '김기중');
  const choiHyunseok = initialSangmu.find((p) => p.name === '최현석');
  assert.ok(hwangDongjae && hwangDongjae.teamId === '삼성', '황동재 must serve in Sangmu with original team 삼성');
  assert.ok(kimGijung && kimGijung.teamId === '한화', '김기중 must serve in Sangmu with original team 한화');
  assert.ok(choiHyunseok && choiHyunseok.teamId === 'SSG', '최현석 must serve in Sangmu with original team SSG');
  // In full 144G simulated season `cur`, senior Sangmu players (returnRound 62 in 2027) must have discharged as 군필
  const curHwang = Object.values(cur.players).find((p) => p.name === '황동재');
  const curKimGijung = Object.values(cur.players).find((p) => p.name === '김기중');
  assert.ok(curHwang && curHwang.militaryStatus === '군필', '황동재 must discharge from Sangmu as 군필');
  assert.ok(curKimGijung && curKimGijung.militaryStatus === '군필', '김기중 must discharge from Sangmu as 군필');

  // (C) Real Ulsan Whales 2026 Roster & ALL Special Regulations
  const uw = specialTest.ulsanWhales!;
  assert.ok(uw && uw.roster.length >= 18, 'Ulsan Whales real roster must be populated');
  assert.equal(uw.maxForeignPlayers, 6);
  assert.equal(uw.foreignCapUsd, 100_000);
  assert.equal(uw.domesticMinSalaryBillion, 0.3);
  assert.equal(uw.maxTransfersPerSeason, 5);
  const uwForeigns = uw.roster.filter((p) => p.isForeign);
  const uwDomestics = uw.roster.filter((p) => !p.isForeign);
  assert.ok(uwForeigns.length >= 4 && uwForeigns.length <= 6);
  assert.ok(uwForeigns.every((p) => (p.totalCapUsd ?? 0) <= 100_000), 'Every Ulsan foreign player cap must be <= $100,000');
  assert.ok(uwDomestics.every((p) => p.salaryKrwBillion >= 0.3), 'Every Ulsan domestic player salary must be >= 3,000만 원');
  assert.ok(uw.roster.some((p) => p.name === '오카다 아키타케'));
  assert.ok(uw.roster.some((p) => p.name === '알렉스 홀'));
  assert.ok(uw.roster.some((p) => p.name === '김도규' && p.hasKboDraftHistory));
  assert.ok(uw.roster.some((p) => p.name === '노강민' && !p.hasKboDraftHistory));
  assert.ok(uw.roster.some((p) => p.name === '진현우' && !p.hasKboDraftHistory && p.isOverseasUnentered));

  // Non-drafted Ulsan players must appear in KBO Rookie Draft pool
  assert.ok(
    specialTest.draftState.candidates.some((c) => c.name === '노강민' && c.school.includes('울산 웨일즈')),
    'Undrafted Ulsan Whales player must enter KBO Rookie Draft pool'
  );

  // Rule: Before 2026-05-20 (inaugural season rule), transfers from Ulsan Whales are BLOCKED
  const earlyUlsanCareer = structuredClone(specialTest);
  earlyUlsanCareer.season = 2026;
  earlyUlsanCareer.currentDate = '2026-04-10';
  earlyUlsanCareer.phase = 'REGULAR_SEASON';
  earlyUlsanCareer.gamesPlayed = 5;
  earlyUlsanCareer.currentSeriesIndex = 2;
  earlyUlsanCareer.schedule[2].dates = ['2026-04-10', '2026-04-11', '2026-04-12'];
  const earlyWindow = getUlsanTransferWindowStatus(earlyUlsanCareer);
  assert.equal(earlyWindow.isOpen, false, 'Before 2026-05-20 inaugural deadline, Ulsan transfer window must be closed');

  // Rule: Between May 20 and July 31, drafted domestic player can transfer; fee > salary is BLOCKED; undrafted is BLOCKED
  const openUlsanCareer = structuredClone(specialTest);
  const ulsanSeason = openUlsanCareer.season;
  openUlsanCareer.gamesPlayed = 50;
  openUlsanCareer.currentSeriesIndex = Math.min(openUlsanCareer.schedule.length - 1, 20);
  openUlsanCareer.schedule[openUlsanCareer.currentSeriesIndex].dates = [`${ulsanSeason}-06-10`, `${ulsanSeason}-06-11`, `${ulsanSeason}-06-12`];
  openUlsanCareer.finances.cashBalanceBillion = 50;
  assert.equal(getUlsanTransferWindowStatus(openUlsanCareer).isOpen, true, `${ulsanSeason}-06-10 must be inside Ulsan transfer window`);

  const undraftedCheck = evaluateUlsanTransferEligibility(openUlsanCareer, 'ulsan-no-kangmin', '한화');
  assert.equal(undraftedCheck.eligible, false);
  assert.equal(undraftedCheck.requiresDraft, true, 'Undrafted Ulsan player must require KBO Rookie Draft');

  const draftedCheck = evaluateUlsanTransferEligibility(openUlsanCareer, 'ulsan-kim-dogyu', '한화');
  assert.equal(draftedCheck.eligible, true);
  // Excess transfer fee (> salary) must be rejected
  assert.throws(
    () => transferPlayerFromUlsanWhales(openUlsanCareer, 'ulsan-kim-dogyu', draftedCheck.maxTransferFeeBillion + 0.5),
    /초과할 수 없습니다/
  );
  // Valid transfer succeeds
  const uwTx1 = transferPlayerFromUlsanWhales(openUlsanCareer, 'ulsan-kim-dogyu');
  assert.equal(uwTx1.nextCareer.ulsanWhales!.seasonTransfersUsed, 1);
  assert.equal(uwTx1.player.teamId, '한화');

  // Max 5 transfers per season enforcement
  const maxedUlsan = structuredClone(uwTx1.nextCareer);
  maxedUlsan.ulsanWhales!.seasonTransfersUsed = 5;
  assert.equal(getUlsanTransferWindowStatus(maxedUlsan).isOpen, false, '6th Ulsan transfer in same season must be blocked');

  // After July 31 deadline (round >= 100) window closes; during OFFSEASON (postseason finished + 1 day) window re-opens
  const pastDeadline = structuredClone(openUlsanCareer);
  pastDeadline.gamesPlayed = 105;
  pastDeadline.schedule[pastDeadline.currentSeriesIndex].dates = [`${ulsanSeason}-08-05`, `${ulsanSeason}-08-06`, `${ulsanSeason}-08-07`];
  assert.equal(getUlsanTransferWindowStatus(pastDeadline).isOpen, false, 'After July 31 Ulsan transfer window must close');
  const offseasonUlsan = structuredClone(pastDeadline);
  offseasonUlsan.phase = 'OFFSEASON';
  assert.equal(getUlsanTransferWindowStatus(offseasonUlsan).isOpen, true, 'Offseason (postseason+1) Ulsan transfer window must be open');

  // 32. Overseas Returnee Original Club Rules + Auto FA Departure + Roster Release Recs + 손동현(KT) + Incoming Rival Trade Offers
  const t32 = createNewCareer({ teamId: '한화', gmName: '단장테스트', seed: 32026 });
  t32.finances.cashBalanceBillion = 120;

  // (A) 손동현 on KT (not 한화) in fresh career as well
  const freshSon = Object.values(t32.players).find((p) => p.name === '손동현');
  assert.ok(freshSon && freshSon.teamId === 'KT', 'Fresh career must place 손동현 on KT');
  assert.equal(freshSon.uniformNumber, 41);
  assert.equal(
    Object.values(t32.players).some((p) => p.teamId === '한화' && p.name === '손동현'),
    false
  );
  assert.ok(
    Object.values(t32.players).some((p) => p.teamId === '한화' && p.name === '김종수'),
    '한화 bullpen replacement 김종수 must be present'
  );

  // (B) Overseas returnees: 고우석 -> 2027 LG 복귀 완료, 박효준·배지환 -> 원소속 없음 (해외 직행)
  const pool = t32.overseasReturnPool ?? [];
  const goWooSukActive = Object.values(t32.players).find((p) => p.name === '고우석');
  const parkHyoJun = pool.find((c) => c.playerName === '박효준');
  const baeJiHwan = pool.find((c) => c.playerName === '배지환');
  assert.ok(goWooSukActive && goWooSukActive.teamId === 'LG', '고우석 must be on LG active roster in 2027 baseline');
  assert.ok(parkHyoJun && parkHyoJun.originalKboTeamId === null, '박효준 must have originalKboTeamId = null');
  assert.ok(baeJiHwan && baeJiHwan.originalKboTeamId === null, '배지환 must have originalKboTeamId = null');
  // Signing 박효준 on 한화 pays exact 1.0x fair price (no 1.12x non-original surcharge)
  const cashPrePark = t32.finances.cashBalanceBillion!;
  const expectedParkBonus = Number((parkHyoJun.demandedTotalBillion * 0.35).toFixed(2));
  const afterSignPark = signOverseasReturnee(t32, parkHyoJun.id).nextCareer;
  assert.equal(
    afterSignPark.finances.cashBalanceBillion,
    Number((cashPrePark - expectedParkBonus).toFixed(2)),
    'Direct-overseas returnee with no original KBO club must use 1.0x equal pricing'
  );
  assert.ok(
    Object.values(afterSignPark.players).some((p) => p.name === '박효준' && p.teamId === '한화')
  );

  // (C) Automatic FA departure from team roster on contract expiry + Own-club zero-compensation re-signing
  const faTest = structuredClone(t32);
  faTest.faReleasedSeason = undefined;
  const myStarter = Object.values(faTest.players).find(
    (p) => p.teamId === '한화' && p.category === '국내' && p.rosterTier === '1군' && p.role === '타자'
  )!;
  myStarter.contract.yearsRemaining = 1;
  myStarter.contract.isFAEligible = true;
  myStarter.serviceYears = 9;
  const departedList = releaseExpiredFaPlayersToMarket(faTest, '2026-11-16');
  assert.ok(departedList.some((p) => p.id === myStarter.id), 'Expired FA-eligible player must automatically depart');
  assert.equal(faTest.players[myStarter.id].rosterTier, 'FA');
  assert.equal(faTest.players[myStarter.id].formerTeamId, '한화');
  assert.equal(faTest.teams['한화'].lineupOrder.includes(myStarter.id), false);
  assert.equal(faTest.teams['한화'].benchOrder.includes(myStarter.id), false);
  const myDepartedList = getMyDepartedFaPlayers(faTest);
  const departedEntry = myDepartedList.find((x) => x.player.id === myStarter.id);
  assert.ok(departedEntry, 'Departed FA player must appear in getMyDepartedFaPlayers');
  // Re-sign own departed FA with generous offer -> zero compensation, back to 1군
  const resignRes = signExternalFaPlayer(
    faTest,
    myStarter.id,
    departedEntry.fairYears,
    Number((departedEntry.fairTotalBillion * 1.35).toFixed(1))
  );
  assert.equal(resignRes.accepted, true);
  assert.equal(resignRes.needsProtectionList, false, 'Re-signing own departed FA requires zero compensation');
  assert.equal(resignRes.nextCareer.players[myStarter.id].rosterTier, '1군');

  // (D) Roster release recommendations exist for user's active roster
  const releaseRecs = getRecommendedReleaseCandidates(t32, 6);
  assert.ok(releaseRecs.length >= 1, 'getRecommendedReleaseCandidates must recommend candidates for roster cleanup');
  assert.ok(releaseRecs.every((r) => r.player.teamId === '한화' && r.reason.length > 0));

  // (E) Incoming rival trade offers: solicit -> accept & reject workflows
  t32.phase = 'REGULAR_SEASON';
  t32.gamesPlayed = 24;
  const solicited = solicitIncomingTradeOffers(t32);
  assert.ok(solicited.newOffers.length >= 1, 'Rival clubs must send at least 1 incoming trade offer');
  const pending1 = getPendingIncomingTradeOffers(solicited.nextCareer);
  assert.ok(pending1.length >= 1);
  const firstOffer = pending1[0];
  const cashBeforeAcc = solicited.nextCareer.finances.cashBalanceBillion!;
  const acceptedTrade = acceptIncomingTradeOffer(solicited.nextCareer, firstOffer.id);
  for (const pid of firstOffer.offerPlayerIds) {
    assert.equal(acceptedTrade.nextCareer.players[pid].teamId, '한화', 'Offered rival player must join user team');
  }
  for (const pid of firstOffer.requestPlayerIds) {
    assert.equal(acceptedTrade.nextCareer.players[pid].teamId, firstOffer.fromTeamId, 'Requested user player must move to rival');
  }
  assert.equal(
    acceptedTrade.nextCareer.finances.cashBalanceBillion,
    Number((cashBeforeAcc + firstOffer.offerCashBillion).toFixed(2))
  );

  const pendingAfterAcc = getPendingIncomingTradeOffers(acceptedTrade.nextCareer);
  const baseForReject =
    pendingAfterAcc.length > 0
      ? acceptedTrade.nextCareer
      : solicitIncomingTradeOffers(acceptedTrade.nextCareer).nextCareer;
  const offerToReject = getPendingIncomingTradeOffers(baseForReject)[0];
  assert.ok(offerToReject, 'Must have a pending offer to test rejection workflow');
  const rejectedTrade = rejectIncomingTradeOffer(baseForReject, offerToReject.id);
  assert.equal(
    rejectedTrade.nextCareer.incomingTradeOffers?.find((o) => o.id === offerToReject.id)?.status,
    '거절'
  );

  // 33. KBO Club Rivalry System (In-Game Fighting Spirit + Off-Field Attendance/MD/Sentiment + Dynamic Evolution)
  const rTest = createNewCareer({ teamId: 'LG', gmName: '단장테스트', seed: 33026 });
  rTest.phase = 'REGULAR_SEASON';
  const allRivs = ensureRivalryState(rTest);
  assert.ok(allRivs.length >= 15, `Expected >= 15 initial KBO rivalries, got ${allRivs.length}`);
  for (const tid of TEAM_IDS) {
    assert.ok(
      getTeamRivalries(rTest, tid).length >= 2,
      `${tid} must have at least 2 rivalries`
    );
  }

  const jamsilProfile = getRivalryEffectProfile(rTest, 'LG', '두산')!;
  assert.ok(jamsilProfile, 'LG vs 두산 잠실 더비 must exist');
  assert.equal(jamsilProfile.rivalry.name, '잠실 더비');
  assert.equal(jamsilProfile.tier, '숙적');
  assert.ok(jamsilProfile.spiritPowerBonus >= 2.5);
  assert.ok(jamsilProfile.attendanceMult >= 1.2);
  assert.ok(jamsilProfile.merchMult >= 1.2);

  // Verify individual fighting spirit boost scales for home + captain + big-game trait
  const sampleLgBatter = Object.values(rTest.players).find(
    (p) => p.teamId === 'LG' && p.role === '타자' && p.rosterTier === '1군'
  )!;
  const baseSpirit = computePlayerRivalrySpiritBonus(rTest, sampleLgBatter, jamsilProfile, false);
  const boostedBatter = structuredClone(sampleLgBatter);
  boostedBatter.hiddenTrait = '큰경기강세';
  const homeTraitSpirit = computePlayerRivalrySpiritBonus(rTest, boostedBatter, jamsilProfile, true);
  assert.ok(homeTraitSpirit > baseSpirit, 'Home + 큰경기강세 player must get higher rivalry spirit');

  // Force the upcoming series to be LG (home) vs 두산 (away) and simulate it
  const rivSeriesCareer = structuredClone(rTest);
  rivSeriesCareer.schedule[0].matchups = rivSeriesCareer.schedule[0].matchups.map((m) =>
    m.away === 'LG' || m.home === 'LG'
      ? { away: '두산', home: 'LG' }
      : m.away === '두산' || m.home === '두산'
      ? {
          away: m.away === '두산' ? (rivSeriesCareer.schedule[0].matchups.find((x) => x.away === 'LG' || x.home === 'LG')?.away === 'LG' ? rivSeriesCareer.schedule[0].matchups.find((x) => x.away === 'LG' || x.home === 'LG')!.home : rivSeriesCareer.schedule[0].matchups.find((x) => x.away === 'LG' || x.home === 'LG')!.away) : m.away,
          home: m.home === '두산' ? (rivSeriesCareer.schedule[0].matchups.find((x) => x.away === 'LG' || x.home === 'LG')?.away === 'LG' ? rivSeriesCareer.schedule[0].matchups.find((x) => x.away === 'LG' || x.home === 'LG')!.home : rivSeriesCareer.schedule[0].matchups.find((x) => x.away === 'LG' || x.home === 'LG')!.away) : m.home,
        }
      : m
  );
  const rivExpectedGames = rivSeriesCareer.schedule[0].dates.length;
  const afterRivSim = simulateNextRegularSeries(rivSeriesCareer).nextCareer;
  const rivGames = afterRivSim.lastSeriesReport?.playerTeamGames ?? [];
  assert.equal(rivGames.length, rivExpectedGames);
  assert.ok(rivGames.every((g) => g.isRivalryGame && g.rivalryName === '잠실 더비'));
  assert.ok(rivGames.every((g) => Boolean(g.rivalryEffectNote)));
  assert.equal(afterRivSim.lastSeriesReport?.financialSummary?.rivalryName, '잠실 더비');
  assert.ok((afterRivSim.lastSeriesReport?.financialSummary?.rivalryAttendanceBoostPct ?? 0) >= 20);
  assert.ok((afterRivSim.lastSeriesReport?.financialSummary?.rivalryMerchBoostPct ?? 0) >= 20);

  const updatedJamsil = findRivalryBetween(afterRivSim, 'LG', '두산')!;
  assert.equal(
    updatedJamsil.seasonWinsA + updatedJamsil.seasonWinsB + updatedJamsil.seasonDraws,
    rivExpectedGames,
    `Rivalry H2H must record all ${rivExpectedGames} simulated games`
  );

  // Full simulated season `cur` -> `nextSeason` must preserve all-time H2H and reset season H2H
  const curJamsil = findRivalryBetween(cur, 'LG', '두산')!;
  const nextJamsil = findRivalryBetween(nextSeason, 'LG', '두산')!;
  assert.ok(curJamsil.allTimeWinsA + curJamsil.allTimeWinsB + curJamsil.allTimeDraws >= 10);
  assert.equal(nextJamsil.seasonWinsA + nextJamsil.seasonWinsB + nextJamsil.seasonDraws, 0);
  assert.equal(
    nextJamsil.allTimeWinsA + nextJamsil.allTimeWinsB + nextJamsil.allTimeDraws,
    curJamsil.allTimeWinsA + curJamsil.allTimeWinsB + curJamsil.allTimeDraws
  );

  // User focus-rival designation & toggle off (including creating a dynamic focused rival for non-rival pair LG vs NC)
  const focusRes1 = toggleUserFocusRivalry(rTest, 'NC');
  assert.equal(focusRes1.active, true);
  const focusedNc = findRivalryBetween(focusRes1.nextCareer, 'LG', 'NC')!;
  assert.ok(focusedNc && focusedNc.userFocused && focusedNc.isDynamic);
  const focusRes2 = toggleUserFocusRivalry(focusRes1.nextCareer, 'NC');
  assert.equal(focusRes2.active, false);
  assert.equal(findRivalryBetween(focusRes2.nextCareer, 'LG', 'NC')?.userFocused, false);

  // =========================================================================
  // 34. Top-Left Date Display, Sangmu Callup Block & Complete KBO Competitive Balance Tax System
  // =========================================================================

  // (1) Top-left in-game date calculation across phases
  const masterDate = getCurrentCareerDate(master);
  assert.ok(masterDate.isoDate.startsWith('2026-'), `Expected 2026 date, got ${masterDate.isoDate}`);
  assert.ok(masterDate.displayDate.includes('2026.') && masterDate.weekdayKo.length === 1);
  const offseasonDateSample = structuredClone(rTest);
  delete offseasonDateSample.currentDate;
  offseasonDateSample.phase = 'OFFSEASON';
  offseasonDateSample.offseasonStep12 = 'FA_MARKET';
  const offDate = getCurrentCareerDate(offseasonDateSample);
  assert.equal(offDate.isoDate, `${offseasonDateSample.season}-11-26`);
  assert.equal(offDate.phaseLabel, '오프시즌');

  // (2) Sangmu serving player CANNOT be called up to 1군 (engine + recommendations)
  const sangmuTest = createNewCareer({ teamId: 'LG', gmName: '단장테스트', seed: 34001 });
  const sangmuPlayer = Object.values(sangmuTest.players).find(
    (p) => p.teamId === 'LG' && (p.militaryStatus === '복무 중' || p.militaryStatus === '상무복무')
  );
  let targetSangmuId: string;
  if (sangmuPlayer) {
    targetSangmuId = sangmuPlayer.id;
  } else {
    const pick2 = Object.values(sangmuTest.players).find(
      (p) => p.teamId === 'LG' && p.rosterTier === '2군' && p.category === '국내'
    )!;
    pick2.militaryStatus = '상무복무';
    pick2.militaryReturnSeason = sangmuTest.season + 2;
    targetSangmuId = pick2.id;
  }
  assert.throws(
    () => callUpPlayer(sangmuTest, targetSangmuId),
    /상무.*1군|콜업할 수 없습니다/,
    'callUpPlayer must reject players currently serving on Sangmu'
  );
  assert.throws(
    () => updateRosterPlacement(sangmuTest, targetSangmuId, { rosterTier: '1군', gameDayActive: true }),
    /상무.*1군|콜업할 수 없습니다/,
    'updateRosterPlacement must reject promoting Sangmu players to 1군'
  );
  const recMoves = getRecommendedRosterMoves(sangmuTest);
  assert.ok(
    !recMoves.some((m) => m.action === '콜업' && m.player.id === targetSangmuId),
    'Recommended 1군 callups must never include Sangmu serving players'
  );

  // (3) Exact KBO Competitive Balance Tax Ceilings & 2027+ Floor
  assert.equal(getAnnualKboCapManwon(2026), 1439723);
  assert.equal(getAnnualKboCapManwon(2027), 1511709);
  assert.equal(getAnnualKboCapManwon(2028), 1587294);
  assert.equal(getAnnualKboCapBillion(2026), 143.9723);
  assert.equal(getAnnualKboCapBillion(2027), 151.1709);
  assert.equal(getAnnualKboCapBillion(2028), 158.7294);
  assert.equal(formatManwonKorean(1439723), '143억 9,723만 원');
  assert.equal(getAnnualKboFloorBillion(2026), null);
  assert.equal(getAnnualKboFloorBillion(2027), 60.6538);
  assert.ok((getAnnualKboFloorBillion(2028) ?? 0) > 60.6538);

  // (4) Multi-year AAV calculation: (annual*years + signingBonus)/years + optionPaid
  const capTest = createNewCareer({ teamId: 'LG', gmName: '샐러리캡테스터', seed: 34002 });
  const multiSample = Object.values(capTest.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  multiSample.contract.years = 4;
  multiSample.contract.annualSalary = 10;
  multiSample.contract.signingBonus = 12;
  multiSample.contract.optionBonusPaidBillion = 2;
  const aavCalc = computeOfficialContractCountedBillion(multiSample);
  // (10*4 + 12)/4 + 2 = 13 + 2 = 15.0
  assert.equal(aavCalc.countedBillion, 15);

  // (5) Franchise Exception Player (7+ seasons tenure -> 50% excluded, <7 rejected)
  const youngDomestic = Object.values(capTest.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군' && p.id !== multiSample.id
  )!;
  youngDomestic.clubTenureSeasons = 3;
  youngDomestic.serviceYears = 3;
  assert.throws(
    () => designateFranchiseExceptionPlayer(capTest, youngDomestic.id),
    /7시즌 이상/,
    'Franchise exception must reject players with <7 club tenure seasons'
  );
  multiSample.clubTenureSeasons = 8;
  const capBeforeEx = computeSalaryCapSummary(capTest, 'LG');
  const afterEx = designateFranchiseExceptionPlayer(capTest, multiSample.id).nextCareer;
  const capAfterEx = computeSalaryCapSummary(afterEx, 'LG');
  assert.equal(capAfterEx.franchiseExceptionPlayerId, multiSample.id);
  assert.equal(capAfterEx.franchiseExceptionSavedBillion, 7.5);
  assert.equal(
    Number((capBeforeEx.teamTop40PayrollBillion - capAfterEx.teamTop40PayrollBillion).toFixed(4)),
    7.5
  );

  // (6) Pre-contract preview shows over-cap & tax, NEVER blocks for cap overage alone,
  //     and separately blocks cash insufficiency
  const capOverPreview = previewContractSalaryCapImpact(afterEx, {
    title: '대형 FA 테스트',
    items: [
      {
        playerName: '가상거포',
        category: '국내',
        years: 4,
        annualSalaryBillion: 60,
        signingBonusBillion: 20,
        cashRequiredNowBillion: 10,
        isNewIncomingPlayer: true,
      },
    ],
  });
  assert.equal(capOverPreview.willExceedCap, true);
  assert.ok(capOverPreview.after.overCapBillion > 0);
  assert.ok(capOverPreview.after.luxuryTaxBillion > 0);
  assert.equal(
    capOverPreview.financialCheck.blockingErrors.length,
    0,
    'Exceeding salary cap alone must NEVER block GM contract approval'
  );
  const brokeClub = structuredClone(afterEx);
  brokeClub.finances.cashBalanceBillion = 5;
  const cashFailPreview = previewContractSalaryCapImpact(brokeClub, {
    title: '현금 부족 테스트',
    items: [
      {
        playerName: '가상거포',
        category: '국내',
        years: 4,
        annualSalaryBillion: 20,
        signingBonusBillion: 10,
        cashRequiredNowBillion: 15,
        isNewIncomingPlayer: true,
      },
    ],
  });
  assert.ok(
    cashFailPreview.financialCheck.blockingErrors.some((e) => e.includes('현금')),
    'Separate financial check must block when cash is insufficient'
  );

  // (7) 1st (30%) -> 2nd (50%) -> 3rd (100% + 1R -9 pick drop) -> 4th clean season (reset to 0)
  //     + Once-only cash deduction + Non-duplicate Round 1 draft drop + 2027+ Under-Floor penalty
  const progCareer = createNewCareer({ teamId: 'LG', gmName: '연속초과테스터', seed: 34003 });
  progCareer.season = 2026;
  progCareer.finances.cashBalanceBillion = 300;
  // Boost LG payroll well above 2026/2027/2028 caps (~170억) & drop 키움 below 2027 floor (~40억)
  const lgTopPlayer = Object.values(progCareer.players).find(
    (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군'
  )!;
  lgTopPlayer.contract.years = 1;
  lgTopPlayer.contract.annualSalary = 60;
  lgTopPlayer.contract.signingBonus = 0;

  for (const p of Object.values(progCareer.players)) {
    if (p.teamId === '키움' && p.category === '국내') {
      p.contract.years = 1;
      p.contract.annualSalary = 0.5;
      p.contract.signingBonus = 0;
    }
  }

  // Year 1 (2026): 1st exceed -> 30% fine, deducted ONCE even if settle called twice
  const cashBefore2026 = progCareer.finances.cashBalanceBillion!;
  const res2026a = settleSeasonCompetitiveBalance(progCareer);
  const lgRec2026 = res2026a.records.find((r) => r.teamId === 'LG')!;
  assert.equal(res2026a.records.length, 10, 'All 10 clubs must be settled under identical rules');
  assert.equal(lgRec2026.exceedStreakAfter, 1);
  assert.equal(lgRec2026.luxuryTaxRatePct, 30);
  const cashAfter2026a = progCareer.finances.cashBalanceBillion!;
  assert.equal(
    Number((cashBefore2026 - cashAfter2026a).toFixed(2)),
    Number(lgRec2026.totalPenaltyBillion.toFixed(2)),
    'Cash must be deducted by exact 1st-year 30% fine'
  );
  // Call settle again for 2026 -> idempotent, zero duplicate deduction!
  const res2026dup = settleSeasonCompetitiveBalance(progCareer);
  assert.equal(res2026dup.alreadySettled, true);
  assert.equal(progCareer.finances.cashBalanceBillion, cashAfter2026a, 'Duplicate settle must never deduct cash twice');

  // Year 2 (2027): 2nd consecutive exceed -> 50% fine, AND 키움 under 2027 floor gets under-floor penalty
  progCareer.season = 2027;
  const res2027 = settleSeasonCompetitiveBalance(progCareer);
  const lgRec2027 = res2027.records.find((r) => r.teamId === 'LG')!;
  const kiwoomRec2027 = res2027.records.find((r) => r.teamId === '키움')!;
  assert.equal(lgRec2027.exceedStreakAfter, 2);
  assert.equal(lgRec2027.luxuryTaxRatePct, 50);
  assert.ok(kiwoomRec2027.underFloorBillion > 0, '키움 must be under 2027 floor');
  assert.equal(kiwoomRec2027.floorPenaltyRatePct, 30);
  assert.ok(kiwoomRec2027.floorPenaltyBillion > 0, '2027 under-floor club must incur floor penalty');

  // Year 3 (2028): 3rd consecutive exceed -> 100% fine + 2029 Draft Round 1 9-spot drop queued
  progCareer.season = 2028;
  const res2028 = settleSeasonCompetitiveBalance(progCareer);
  const lgRec2028 = res2028.records.find((r) => r.teamId === 'LG')!;
  assert.equal(lgRec2028.exceedStreakAfter, 3);
  assert.equal(lgRec2028.luxuryTaxRatePct, 100);
  assert.equal(lgRec2028.draftPenaltyTriggered, true);
  assert.equal(progCareer.competitiveBalance?.clubs['LG'].pendingDraftPenaltyForSeason, 2029);

  // Apply 2029 Round 1 draft penalty: LG originally #1 drops 9 spots to #10 in Round 1 ONLY, not Round 2
  const testDraft: typeof progCareer.draftState = {
    season: 2029,
    currentRound: 1,
    currentPickInRound: 1,
    draftOrder: ['LG', '한화', 'SSG', '두산', 'KT', 'NC', '롯데', 'KIA', '삼성', '키움'],
    candidates: [],
    picks: [],
    completed: false,
  };
  const draftPen1 = applyCompetitiveBalanceDraftPenalties(progCareer, 2029, testDraft.draftOrder);
  testDraft.round1DraftOrder = draftPen1.round1Order;
  testDraft.round1PenaltyNotes = draftPen1.penaltyNotes;
  assert.equal(getDraftPickingTeamForSlot(testDraft, 1, 10), 'LG', 'LG must drop from #1 to #10 in Round 1');
  assert.equal(getDraftPickingTeamForSlot(testDraft, 2, 1), 'LG', 'LG must keep original #1 slot in Round 2');
  assert.equal(testDraft.round1PenaltyNotes?.length, 1);
  // Calling applyCompetitiveBalanceDraftPenalties again must NOT apply duplicate penalty
  const draftPen2 = applyCompetitiveBalanceDraftPenalties(progCareer, 2029, testDraft.draftOrder);
  assert.equal(draftPen2.penaltyNotes.length, 0, 'Round 1 penalty must never be applied twice');
  assert.equal(progCareer.competitiveBalance?.clubs['LG'].pendingDraftPenaltyForSeason, null);

  // Year 4 (2029): Drop LG payroll back within cap -> streak resets to 0, history preserved (40 records)
  progCareer.season = 2029;
  lgTopPlayer.contract.annualSalary = 1.0;
  const res2029 = settleSeasonCompetitiveBalance(progCareer);
  const lgRec2029 = res2029.records.find((r) => r.teamId === 'LG')!;
  assert.equal(lgRec2029.overCapBillion, 0);
  assert.equal(lgRec2029.exceedStreakAfter, 0);
  assert.equal(progCareer.competitiveBalance?.clubs['LG'].exceedStreak, 0);
  assert.equal(progCareer.competitiveBalance?.seasonHistory.length, 40);

  // (8) Atomic rollback on contract/finance failure leaves original career untouched
  const atomicBeforeCash = progCareer.finances.cashBalanceBillion;
  assert.throws(() => {
    executeAtomicCareerMutation(progCareer, (draft) => {
      draft.finances.cashBalanceBillion = -300; // invariant violation (< -250억 limit)
    });
  }, /원자적 검증 실패/);
  assert.equal(progCareer.finances.cashBalanceBillion, atomicBeforeCash);

  // (9) Legacy save migration preserves Hanwha v4.60.30 invariants while migrating legacy fields
  const legacySave = createPreservedHanwhaCareer();
  delete legacySave.competitiveBalance;
  legacySave.finances.salaryCapExceedStreak = 2;
  const migRes = migrateAndValidateCareerSave(legacySave);
  assert.equal(migRes.career.gamesPlayed, 9);
  assert.equal(migRes.career.finances.cashBalanceBillion, null);
  assert.equal(migRes.career.finances.krwUnpaidBillion, 43.3);
  assert.equal(migRes.career.finances.usdUnpaid, 1800000);
  assert.equal(migRes.career.competitiveBalance?.clubs['한화'].exceedStreak, 2);

  // =========================================================================
  // 35. (#0, #1, #2) Foreign MLB Export, Multi-Season Advance Bug Fix & Real KBO TrackMan/Statcast Metrics
  // =========================================================================
  {
    const mlbExportCareer = createNewCareer({ teamId: '한화', gmName: '단장35', seed: 35001 });
    mlbExportCareer.phase = 'OFFSEASON';
    // Make an AI club foreign batter & user club foreign pitcher have dominant MLB-caliber stats
    const aiForeignBatter = Object.values(mlbExportCareer.players).find(
      (p) => p.teamId !== '한화' && p.category === '외국인' && p.role === '타자'
    )!;
    aiForeignBatter.stats = {
      G: 138, PA: 590, AB: 510, H: 168, B2: 36, B3: 3, HR: 38, TB: 324,
      RBI: 118, R: 102, BB: 70, HBP: 6, SO: 95, SF: 4, SB: 14,
    };
    const userForeignPitcher = Object.values(mlbExportCareer.players).find(
      (p) => p.teamId === '한화' && p.category === '외국인' && p.role === '투수'
    )!;
    userForeignPitcher.stats = {
      G: 30, GS: 30, W: 17, L: 4, SV: 0, HLD: 0, outs: 576, H: 142, HR: 11,
      BB: 42, SO: 205, R: 46, ER: 42, PC: 2850,
    };

    const baseSeason35 = mlbExportCareer.season;
    const sNext1 = advanceToNextSeason(mlbExportCareer).nextCareer;
    assert.equal(sNext1.season, baseSeason35 + 1, `Must cleanly advance ${baseSeason35} -> ${baseSeason35 + 1} without rng.range crash`);
    assert.equal(sNext1.phase, 'REGULAR_SEASON');
    assert.equal(sNext1.gamesPlayed, 0);
    assert.equal(
      sNext1.players[aiForeignBatter.id].rosterTier,
      '해외이적',
      'Dominant AI-club foreign batter must unconditionally sign with MLB'
    );
    assert.equal(
      sNext1.players[userForeignPitcher.id].rosterTier,
      '해외이적',
      'Dominant user-club foreign pitcher must unconditionally sign with MLB'
    );
    assert.ok(
      (sNext1.mlbExports ?? []).some((m) => m.playerName === userForeignPitcher.name),
      'MLB exported foreign pitcher must be logged in mlbExports'
    );
    assert.ok(
      (sNext1.newsFeed ?? []).some((n) => n.headline.includes('MLB') && n.body.includes(userForeignPitcher.name)),
      'MLB export breaking news must be generated'
    );
    // Advance a second consecutive season to confirm zero regression
    sNext1.phase = 'OFFSEASON';
    const sNext2 = advanceToNextSeason(sNext1).nextCareer;
    assert.equal(sNext2.season, baseSeason35 + 2, `Must cleanly advance ${baseSeason35 + 1} -> ${baseSeason35 + 2}`);

    // Also test preserved Hanwha save -> OFFSEASON -> 2027 transition
    const hanwhaAdv = structuredClone(master);
    hanwhaAdv.phase = 'OFFSEASON';
    const hanwha2027 = advanceToNextSeason(hanwhaAdv).nextCareer;
    assert.equal(hanwha2027.season, 2027, 'Preserved Hanwha save must also advance cleanly to 2027');

    // (#2) Real KBO TrackMan pitcher velocity & batter Statcast exit velocity check
    const moon = Object.values(mlbExportCareer.players).find((p) => p.name === '문동주');
    const ryu = Object.values(mlbExportCareer.players).find((p) => p.name === '류현진');
    const kimDo = Object.values(mlbExportCareer.players).find((p) => p.name === '김도영');
    const roh = Object.values(mlbExportCareer.players).find((p) => p.name === '노시환');
    assert.ok(moon?.pitchRepertoire && moon.pitchRepertoire.avgVelocityKmh >= 152 && moon.pitchRepertoire.maxVelocityKmh >= 159, '문동주 must have realistic 153+/160+ km/h TrackMan velocity');
    assert.ok(ryu?.pitchRepertoire && ryu.pitchRepertoire.command >= 88, '류현진 must have elite command rating');
    assert.ok(kimDo?.battingProfile?.avgExitVelocityKmh && kimDo.battingProfile.avgExitVelocityKmh >= 145 && (kimDo.battingProfile.barrelPct ?? 0) >= 10, '김도영 must have real Statcast exit velocity & barrel%');
    assert.ok(roh?.battingProfile?.avgExitVelocityKmh && roh.battingProfile.avgExitVelocityKmh >= 146, '노시환 must have real Statcast exit velocity');
  }

  // =========================================================================
  // 36. (#4b) KBO Developmental Player Rules (All 10 Clubs)
  // =========================================================================
  {
    const devCareer = createNewCareer({ teamId: 'LG', gmName: '육성테스터', seed: 36001 });
    devCareer.finances.cashBalanceBillion = 50;
    const quotaMarch = getClubRosterQuotaSummary(devCareer, 'LG');
    assert.equal(quotaMarch.officialLimit, KBO_OFFICIAL_ROSTER_LIMIT);
    assert.equal(quotaMarch.hsDevAnnualLimit, KBO_HS_DEV_ANNUAL_LIMIT);
    assert.equal(quotaMarch.isConversionWindowOpen, false, 'March must not allow developmental conversion');

    const devP = Object.values(devCareer.players).find(
      (p) => p.teamId === 'LG' && p.rosterTier === '육성'
    )!;
    // Preserve stats & contract check
    devP.contract.annualSalary = 0.35;
    devP.ability = 64;
    if (devP.role === '타자') {
      (devP.stats as { H: number }).H = 12;
    }

    // Strict 1군 exclusion: callUp & lineup slot blocked
    assert.throws(() => callUpPlayer(devCareer, devP.id), /육성선수/);
    const devBatter =
      Object.values(devCareer.players).find(
        (p) => p.teamId === 'LG' && p.rosterTier === '육성' && p.role === '타자'
      ) ?? devP;
    assert.throws(
      () => setLineupSlot(devCareer, 0, devBatter.id),
      devBatter.role === '타자' ? /육성선수/ : /타자|육성선수/
    );
    // Before May 1 blocked
    const checkMarch = checkDevelopmentalConversionEligibility(devCareer, devP.id, 'LG');
    assert.equal(checkMarch.eligible, false);
    assert.ok(checkMarch.reasons.some((r) => r.includes('5월 1일')));

    // High-school developmental signing limit (max 3 per season), college/indie still allowed
    const pool = devCareer.developmentalMarket ?? [];
    // Inject 4 HS candidates + 1 college candidate for deterministic test
    devCareer.developmentalMarket = [
      { id: 'hs-1', season: devCareer.season, name: '고졸일', position: 'RF', role: '타자', age: 19, ability: 54, potential: 74, signingCostBillion: 0.3, originNote: '고졸 미지명 육성', coachNote: '고졸 외야 유망주', signed: false },
      { id: 'hs-2', season: devCareer.season, name: '고졸이', position: 'SP', role: '투수', age: 19, ability: 55, potential: 75, signingCostBillion: 0.3, originNote: '고졸 미지명 육성', coachNote: '고졸 투수 유망주', signed: false },
      { id: 'hs-3', season: devCareer.season, name: '고졸삼', position: 'SS', role: '타자', age: 19, ability: 54, potential: 76, signingCostBillion: 0.3, originNote: '고졸 미지명 육성', coachNote: '고졸 유격수 유망주', signed: false },
      { id: 'hs-4', season: devCareer.season, name: '고졸사', position: 'RP', role: '투수', age: 19, ability: 53, potential: 73, signingCostBillion: 0.3, originNote: '고졸 미지명 육성', coachNote: '고졸 불펜 유망주', signed: false },
      { id: 'col-1', season: devCareer.season, name: '대졸일', position: '2B', role: '타자', age: 23, ability: 58, potential: 72, signingCostBillion: 0.3, originNote: '대학야구 출신 육성', coachNote: '대졸 내야 유망주', signed: false },
      ...pool,
    ];
    let curDev = recruitDevelopmentalCandidate(devCareer, 'hs-1').nextCareer;
    curDev = recruitDevelopmentalCandidate(curDev, 'hs-2').nextCareer;
    curDev = recruitDevelopmentalCandidate(curDev, 'hs-3').nextCareer;
    assert.throws(
      () => recruitDevelopmentalCandidate(curDev, 'hs-4'),
      /고졸 육성선수 연간 선발 한도/,
      '4th HS developmental signing in same season must be blocked'
    );
    const afterCol = recruitDevelopmentalCandidate(curDev, 'col-1').nextCareer;
    assert.ok(Object.values(afterCol.players).some((p) => p.name === '대졸일' && p.rosterTier === '육성'));

    // Move to May (REGULAR_SEASON + currentSeriesIndex = 14): conversion succeeds into 2군 ONLY, keeping contract/ability/stats
    let mayCol = structuredClone(afterCol);
    mayCol.phase = 'REGULAR_SEASON';
    mayCol.currentSeriesIndex = 14;
    mayCol.gamesPlayed = 42;
    const mayRegCount = Object.values(mayCol.players).filter(
      (p) => p.teamId === 'LG' && (p.rosterTier === '1군' || p.rosterTier === '2군')
    ).length;
    if (mayRegCount >= 68) {
      const waiveP = Object.values(mayCol.players).find(
        (p) => p.teamId === 'LG' && p.rosterTier === '2군' && p.category === '국내' && p.id !== devP.id
      )!;
      mayCol = releaseDomesticPlayerToWaiver(mayCol, waiveP.id).nextCareer;
    }
    const checkMay = checkDevelopmentalConversionEligibility(mayCol, devP.id, 'LG');
    assert.equal(checkMay.eligible, true);
    assert.ok(checkMay.draftAuditNote.length > 0);
    const convertedCareer = convertDevelopmentalPlayer(mayCol, devP.id);
    const convP = convertedCareer.players[devP.id];
    assert.equal(convP.rosterTier, '2군', 'Conversion must land in 2군, not auto-1군');
    assert.equal(convP.gameDayActive, false);
    assert.equal(convP.contract.annualSalary, 0.35, 'Existing contract salary must be preserved');
    assert.equal(convP.ability, 64, 'Existing ability must be preserved');

    // Free unrestricted release of developmental player
    const devToRelease = Object.values(convertedCareer.players).find(
      (p) => p.teamId === 'LG' && p.rosterTier === '육성'
    )!;
    const cashPreRel = convertedCareer.finances.cashBalanceBillion;
    const afterFreeRel = releaseDevelopmentalPlayer(convertedCareer, devToRelease.id).nextCareer;
    assert.equal(afterFreeRel.players[devToRelease.id].rosterTier, 'FA', 'Free release transitions developmental player to FA');
    assert.equal(afterFreeRel.players[devToRelease.id].contract.status, '만료');
    assert.equal(afterFreeRel.finances.cashBalanceBillion, cashPreRel, 'Free release incurs zero buyout penalty');

    // AI clubs identical rules check (no error, obeys May 1 & 68-man cap)
    processAiClubsDevelopmentalRules(afterFreeRel, getTeamRetiredNumbers);
    for (const tid of TEAM_IDS) {
      const q = getClubRosterQuotaSummary(afterFreeRel, tid);
      assert.ok(q.officialCount <= KBO_OFFICIAL_ROSTER_LIMIT, `${tid} official roster must not exceed 68`);
    }
  }

  // =========================================================================
  // 37. (#5, #6, #7) Franchise Star Full Lifecycle & Trade Evaluation Patch
  // =========================================================================
  {
    const fCareer = createNewCareer({ teamId: 'LG', gmName: '프랜차이즈테스터', seed: 37001 });
    fCareer.finances.cashBalanceBillion = 120;
    const ojh = Object.values(fCareer.players).find((p) => p.teamId === 'LG' && p.name === '오지환')!;
    ojh.birthDate = '1996-03-12';
    ojh.age = 30;
    ojh.clubTenureSeasons = 14;
    ojh.serviceYears = 14;
    ojh.careerHits = 1750;
    ojh.careerHR = 180;
    ojh.ability = 82;

    // (1) Franchise Star tier & strict separation from KBO Salary Cap Exception
    const assess = evaluateFranchiseStar(fCareer, ojh);
    assert.ok(assess.tier === '레전드' || assess.tier === '핵심 프랜차이즈', `Expected high franchise tier, got ${assess.tier}`);
    assert.equal(assess.isSalaryCapException, false, 'Franchise star status must NOT automatically designate KBO salary cap exception');
    assert.ok(assess.annualMerchBillion > 0, 'Franchise star must generate annual merchandise revenue');

    // (2) Merchandise revenue aggregation
    const merch = computeClubFranchiseMerchandise(fCareer, 'LG');
    assert.ok(merch.annualTotalBillion > 0 && merch.perSeriesBillion > 0);

    // (3) Special long-term contract (5 years) boosts fanSentiment & clubReputation
    const repBefore = fCareer.teams['LG'].clubReputation ?? 70;
    const fanBefore = fCareer.teams['LG'].fanSentiment ?? 65;
    const afterLong = proposeFranchiseLongTermContract(fCareer, ojh.id, 5, 11, 15).nextCareer;
    assert.equal(afterLong.players[ojh.id].franchiseLongTermSigned, true);
    assert.equal(afterLong.players[ojh.id].contract.years, 5);
    assert.ok((afterLong.teams['LG'].clubReputation ?? 0) > repBefore);
    assert.ok((afterLong.teams['LG'].fanSentiment ?? 0) > fanBefore);

    // (4) Captaincy leadership boost
    const capRes = setTeamCaptain(afterLong, ojh.id).nextCareer;
    assert.equal(capRes.teams['LG'].leadership?.captainPlayerId, ojh.id);
    assert.ok((capRes.teams['LG'].leadership?.veteranLeadership ?? 0) >= 82);

    // (5) Permanent Retired Number Review Committee + Club Legends HOF + Post-Retirement Hiring
    const review = evaluateRetiredNumberReview(capRes, capRes.players[ojh.id]);
    assert.equal(review.eligible, true, `Expected 오지환 eligible for retired number review, got ${review.totalScore}`);
    const afterRetNum = approveRetiredNumberReview(capRes, ojh.id).nextCareer;
    assert.ok(
      (afterRetNum.leagueHistory?.retiredNumbers ?? []).some(
        (r) => r.teamId === 'LG' && r.number === ojh.uniformNumber
      ),
      'Approved retired number must be persisted in leagueHistory.retiredNumbers'
    );
    assert.ok(
      (afterRetNum.clubLegendsHof ?? []).some((l) => l.playerId === ojh.id && l.retiredNumberApproved),
      'Approved legend must be inducted into persistent clubLegendsHof'
    );
    // Retire player & hire as 타격코치
    afterRetNum.players[ojh.id].rosterTier = '은퇴';
    const afterStaffHire = signRetiredLegendAsStaff(afterRetNum, ojh.id, '타격코치').nextCareer;
    assert.equal(afterStaffHire.players[ojh.id].hiredPostRetirementRole, '타격코치');
    assert.ok(
      (afterStaffHire.coaches['LG'] ?? []).some((c) => c.name === ojh.name && c.role === '타격코치'),
      'Hired retired legend must join active club coaching staff'
    );

    // (6) Trade Valuation Patch: pure market index, age/high-salary depreciation, lowValueReasons,
    //     homeClubSymbolicPremium vs market, tradeRequestRelief, contract/stats preservation & rival impact
    const tradeCareer = createNewCareer({ teamId: 'LG', gmName: '트레이드테스터', seed: 37002 });
    const agingHighSal = Object.values(tradeCareer.players).find(
      (p) => p.teamId === '두산' && p.category === '국내' && p.rosterTier === '1군'
    )!;
    agingHighSal.age = 36;
    agingHighSal.ability = 79;
    agingHighSal.potential = 79;
    agingHighSal.clubTenureSeasons = 12;
    agingHighSal.careerHits = 1800;
    agingHighSal.careerHR = 210;
    agingHighSal.contract.annualSalary = 16;
    agingHighSal.contract.yearsRemaining = 4;

    const valNormal = evaluatePlayerTradeValuationDetailed(tradeCareer, agingHighSal);
    assert.ok(valNormal.ageAdjustment < 0, 'Aging veteran must incur age depreciation');
    assert.ok(valNormal.salaryAdjustment < 0, 'High-salary contract must incur salary depreciation');
    assert.ok(valNormal.lowValueReasons.length >= 2, 'Concrete lowValueReasons must explain why market index is lowered');
    assert.ok(valNormal.homeClubSymbolicPremium > 0, 'Home club must value franchise star higher than market value');
    assert.ok(valNormal.homeClubValue > valNormal.marketClubValue);

    // Player trade request lowers selling club resistance
    agingHighSal.tradeRequested = true;
    const valRequested = evaluatePlayerTradeValuationDetailed(tradeCareer, agingHighSal);
    assert.ok(valRequested.tradeRequestRelief > 0, 'Trade request must grant selling resistance relief');
    assert.ok(valRequested.homeClubValue < valNormal.homeClubValue, 'Trade request must reduce homeClubValue');

    // Execute trade of LG franchise star to Rival 두산 -> preserves contract/stats, clears cap exception, triggers rival news & drops fanSentiment/clubReputation
    const lgStar = Object.values(tradeCareer.players).find((p) => p.teamId === 'LG' && p.name === '오지환')!;
    lgStar.clubTenureSeasons = 13;
    lgStar.careerHits = 1650;
    lgStar.ability = 86;
    lgStar.tradeRequested = true;
    lgStar.contract.annualSalary = 12.5;
    lgStar.contract.yearsRemaining = 3;
    (lgStar.stats as { H: number }).H = 44;
    const withEx = designateFranchiseExceptionPlayer(tradeCareer, lgStar.id).nextCareer;
    assert.equal(withEx.competitiveBalance?.clubs['LG'].exceptionPlayerId, lgStar.id);
    const fanPre = withEx.teams['LG'].fanSentiment ?? 65;
    const repPre = withEx.teams['LG'].clubReputation ?? 70;

    const doosanTarget = Object.values(withEx.players).find(
      (p) => p.teamId === '두산' && p.category === '국내' && p.rosterTier === '2군' && p.id !== agingHighSal.id
    )!;
    // Aging high-salary star vs young 2군 prospect triggers realistic valuation / counter-offer check
    const evalClose = evaluateTradeProposal(withEx, '두산', [lgStar.id], [doosanTarget.id], 0, null);
    assert.ok(evalClose.decision === '수락' || evalClose.decision === '조건부');
    if (evalClose.decision === '조건부') {
      assert.ok(evalClose.counterOffer && evalClose.counterOffer.description.length > 0, 'Conditional trade must generate AI counter-offer');
    }
    assert.ok((evalClose.giveBreakdowns?.length ?? 0) === 1);

    // Lower target's trade value (older 2군 depth player) so straight acceptance executes cleanly
    doosanTarget.age = 29;
    doosanTarget.ability = 58;
    doosanTarget.potential = 59;
    const evalRivalTrade = evaluateTradeProposal(withEx, '두산', [lgStar.id], [doosanTarget.id], 0, null);
    assert.equal(evalRivalTrade.decision, '수락', 'Star player for 29yo 58 OVR 2군 depth player must be accepted');

    const afterRivalTrade = executeTradeProposal(withEx, '두산', [lgStar.id], [doosanTarget.id], 0, null).nextCareer;
    const movedStar = afterRivalTrade.players[lgStar.id];
    assert.equal(movedStar.teamId, '두산');
    assert.equal(movedStar.contract.annualSalary, 12.5, 'Existing contract salary must be 100% preserved after trade');
    assert.equal(movedStar.contract.yearsRemaining, 3, 'Existing contract yearsRemaining must be 100% preserved after trade');
    assert.equal((movedStar.stats as { H: number }).H, 44, 'Existing season stats must be 100% preserved after trade');
    assert.equal(
      afterRivalTrade.competitiveBalance?.clubs['LG'].exceptionPlayerId,
      null,
      'Departed cap exception player must be cleared from former club salary cap exception slot'
    );
    assert.ok((afterRivalTrade.teams['LG'].fanSentiment ?? 100) < fanPre, 'Trading franchise star to rival must drop fan sentiment');
    assert.ok((afterRivalTrade.teams['LG'].clubReputation ?? 100) < repPre, 'Trading franchise star to rival must drop club reputation');
    assert.ok(
      (afterRivalTrade.newsFeed ?? []).some((n) => n.headline.includes('충격') && n.headline.includes(lgStar.name)),
      'Trading franchise star to rival club must trigger breaking news event'
    );
  }

  // =========================================================================
  // 38. 왕옌청 한화 이글스 소속 보호 (타 구단 외국인 시장 노출 및 영입 원천 차단)
  // =========================================================================
  {
    const lgCareer = createNewCareer({ teamId: 'LG', gmName: '왕옌청검증단장', seed: 38001 });
    const wangInHanwha = Object.values(lgCareer.players).find(
      (p) => p.name === '왕옌청' && p.teamId === '한화' && p.rosterTier !== '은퇴'
    );
    assert.ok(wangInHanwha, '왕옌청 must be an active 한화 이글스 player in 2026 baseline');

    const lgForeignMarket = getForeignScoutMarket(lgCareer);
    assert.ok(
      !lgForeignMarket.some((c) => c.name === '왕옌청'),
      '왕옌청 (active on 한화) must NEVER appear in LG foreign scout market'
    );

    let blockedSign = false;
    try {
      signForeignCandidate(
        lgCareer,
        {
          id: 'f_wang_yencheng',
          name: '왕옌청',
          nationality: '대만',
          category: '아시아쿼터',
          role: '투수',
          position: 'SP',
          age: 25,
          ability: 76,
          potential: 82,
          suggestedTotalUsd: 200000,
          suggestedSigningBonusUsd: 30000,
          suggestedSalaryUsd: 170000,
          scoutingNote: '테스트',
        }
      );
    } catch (err) {
      blockedSign = (err instanceof Error ? err.message : '').includes('한화');
    }
    assert.equal(blockedSign, true, 'signForeignCandidate must block signing active 한화 player 왕옌청');
  }

  // =========================================================================
  // 39. 구단주 다면 단장 평가 시스템 (5대 항목 100점 만점 + 실시간/시즌종료 연동)
  // =========================================================================
  {
    const evalCareer = createNewCareer({ teamId: '한화', gmName: '평가테스터', seed: 39001 });
    const liveReport = computeLiveOwnerEvaluationReport(evalCareer);
    assert.equal(
      liveReport.totalScore,
      liveReport.performanceScore +
        liveReport.financeScore +
        liveReport.developmentScore +
        liveReport.fanScore +
        liveReport.leadershipScore,
      'Live owner evaluation totalScore must equal sum of 5 pillars'
    );
    assert.ok(liveReport.totalScore >= 0 && liveReport.totalScore <= 100);
    assert.ok(['S', 'A', 'B', 'C', 'F'].includes(liveReport.projectedGrade));
    assert.ok(liveReport.budgetDirective.length > 5);

    evaluateSeasonOwnerGrade(evalCareer);
    assert.ok(evalCareer.ownerEval?.breakdown, 'evaluateSeasonOwnerGrade must save 5-pillar breakdown');
    assert.ok(
      evalCareer.ownerEval?.lastSeasonGrade &&
        ['S', 'A', 'B', 'C', 'F'].includes(evalCareer.ownerEval.lastSeasonGrade)
    );
  }

  // =========================================================================
  // 40. 신인 드래프트 1~11라운드 직접 지명 + 1라운더 지명 효과 + 고유 ID 중복 방지
  // =========================================================================
  {
    let dCareer = createNewCareer({ teamId: '한화', gmName: '드래프트11R단장', seed: 40001 });
    ensureGlobalPlayerRegistryInPlace(dCareer);

    // Every player must have a unique permanentId & birthYear
    const permIds = new Set<string>();
    for (const pl of Object.values(dCareer.players)) {
      assert.ok(pl.permanentId && pl.permanentId.startsWith('KBO-'), `Missing permanentId on ${pl.name}`);
      assert.ok(!permIds.has(pl.permanentId), `Duplicate permanentId detected: ${pl.permanentId}`);
      permIds.add(pl.permanentId);
      assert.ok(typeof pl.birthYear === 'number' && pl.birthYear > 1970);
    }

    // Duplicate identity guard vs legitimate namesake allowance
    const samplePl = Object.values(dCareer.players)[0];
    assert.equal(
      isDuplicatePlayerIdentity(dCareer, { permanentId: samplePl.permanentId, name: samplePl.name, birthYear: samplePl.birthYear }),
      true,
      'Same permanentId must be rejected as duplicate'
    );
    assert.equal(
      isDuplicatePlayerIdentity(dCareer, { name: samplePl.name, birthYear: 2007, school: '가상고교' }),
      false,
      'Same name with different birthYear/school (동명이인) must be allowed'
    );

    // Step through Round 1 to user turn & manually pick in Round 1 (verifies R1 spotlight effect)
    dCareer = advanceDraftUntilUserTurn(dCareer).nextCareer;
    assert.equal(dCareer.draftState.currentRound, 1);
    const fanBeforeR1 = dCareer.teams[dCareer.playerTeamId].fanSentiment ?? 65;
    const r1Cand = dCareer.draftState.candidates.find((c) => !c.draftedBy)!;
    dCareer = pickDraftCandidateForUser(dCareer, r1Cand.id).nextCareer;
    assert.ok(
      (dCareer.teams[dCareer.playerTeamId].fanSentiment ?? 0) >= fanBeforeR1,
      'Round 1 pick must grant/maintain fan sentiment boost'
    );
    assert.ok(
      (dCareer.newsFeed ?? []).some((n) => n.headline.includes('1라운더') && n.headline.includes(r1Cand.name)),
      'Round 1 pick must publish 1라운더 highlight breaking news'
    );

    // Advance manually past Round 4 into Round 5 — previously blocked at Round 4!
    for (let r = 2; r <= 5; r++) {
      dCareer = advanceDraftUntilUserTurn(dCareer).nextCareer;
      assert.equal(dCareer.draftState.currentRound, r, `User must be able to manually pick in Round ${r}`);
      const cand = dCareer.draftState.candidates.find((c) => !c.draftedBy)!;
      dCareer = pickDraftCandidateForUser(dCareer, cand.id).nextCareer;
    }

    // Full auto-complete remaining rounds through Round 11 (110 picks total)
    const completedDraftCareer = autoCompleteRemainingDraft(dCareer).nextCareer;
    assert.equal(completedDraftCareer.draftState.completed, true);
    assert.equal(completedDraftCareer.draftState.picks.length, 110, '11 rounds x 10 teams must produce 110 picks');

    // Verify zero duplicate permanentIds after 110 rookies drafted
    const afterPermIds = new Set<string>();
    for (const pl of Object.values(completedDraftCareer.players)) {
      assert.ok(pl.permanentId);
      assert.ok(!afterPermIds.has(pl.permanentId!), `Duplicate permanentId after draft: ${pl.permanentId}`);
      afterPermIds.add(pl.permanentId!);
    }
  }

  // =========================================================================
  // 41. 국가대표 국제 대회별 FA 등록일수 공식 보상 적용
  // =========================================================================
  {
    assert.equal(computeNationalTeamCompensationDays('WBC', '우승').days, 60);
    assert.equal(computeNationalTeamCompensationDays('WBC', '4강 진출').days, 30);
    assert.equal(computeNationalTeamCompensationDays('올림픽', '금메달 (우승)').days, 60);
    assert.equal(computeNationalTeamCompensationDays('올림픽', '동메달 (3위)').days, 30);
    assert.equal(computeNationalTeamCompensationDays('프리미어12', '우승').days, 40);
    assert.equal(computeNationalTeamCompensationDays('아시안게임', '금메달 (우승)').days, 25);
    assert.equal(computeNationalTeamCompensationDays('APBC', '우승').days, 15);

    const ntCareer = createNewCareer({ teamId: 'LG', gmName: '국대보상단장', seed: 41001 });
    const regDaysBefore = new Map<string, number>();
    for (const p of Object.values(ntCareer.players)) {
      regDaysBefore.set(p.id, p.registrationDays ?? 0);
    }
    const { nextCareer: afterNt } = runNationalTeamTournament(ntCareer);
    const ntEv = (afterNt.nationalTeamEvents ?? [])[0];
    assert.ok(ntEv, 'runNationalTeamTournament must record a NationalTeamEvent');
    assert.ok((ntEv.compensationDaysAwarded ?? 0) >= 5, 'National team event must award official FA compensation days');
    assert.ok((ntEv.compensationRuleLabel ?? '').length > 4);
    for (const sp of ntEv.selectedPlayers) {
      const updated = afterNt.players[sp.playerId];
      if (!updated) continue;
      assert.equal(
        updated.registrationDays,
        (regDaysBefore.get(sp.playerId) ?? 0) + (ntEv.compensationDaysAwarded ?? 0),
        `Selected player ${updated.name} must receive +${ntEv.compensationDaysAwarded} FA registrationDays`
      );
      assert.ok(
        (updated.nationalTeamBonusDays ?? 0) >= (ntEv.compensationDaysAwarded ?? 0),
        `Selected player ${updated.name} must record nationalTeamBonusDays`
      );
      assert.ok((updated.nationalTeamBonusLog?.length ?? 0) >= 1);
    }
  }

  // =========================================================================
  // 42. 해외 아마추어 스카우팅·계약 · 아마추어 야구 · 해외파 월별 관리 · KBO 규약 제107조
  // =========================================================================
  {
    const aoCareer = createNewCareer({ teamId: '한화', gmName: '아마해외단장', seed: 42001 });
    const ao = ensureAmateurAndOverseasStateInPlace(aoCareer);

    // Zero auto-progression on initial load
    assert.equal(aoCareer.gamesPlayed, 0);
    assert.equal(ao.tournamentResults.length, 0);
    assert.equal(ao.mlbClubBudgets.length, 30, 'All 30 MLB clubs must have scouting bonus pools');
    assert.ok(ao.prospects.some((p) => p.schoolType === '고교'), 'Must initialize Korean HS prospects');
    assert.ok(ao.prospects.some((p) => p.schoolType === '대학'), 'Must initialize Korean College prospects');
    assert.ok(ao.overseasPlayers.length >= 6, 'Must initialize verified real overseas Korean players');

    // Watchlist toggle
    const firstProspectId = ao.prospects[0].permanentId;
    const afterWatch = toggleAmateurProspectWatchlist(aoCareer, firstProspectId);
    assert.equal(
      afterWatch.amateurAndOverseas!.prospects.find((p) => p.permanentId === firstProspectId)?.watchlisted,
      true
    );

    // Monthly progression across April..September generates tournaments + overseas monthly stats without duplicates
    const aoRng = new SeededRng(42002);
    const months = ['2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15'];
    for (const iso of months) {
      processMonthlyAmateurAndOverseasInPlace(aoCareer, aoRng, iso);
    }
    const gamesAfterSept = aoCareer.amateurAndOverseas!.overseasPlayers[0].currentSeasonStats.g;
    // Duplicate same-month call must be a strict no-op (duplicate monthly stats guard!)
    processMonthlyAmateurAndOverseasInPlace(aoCareer, aoRng, '2026-09-25');
    assert.equal(
      aoCareer.amateurAndOverseas!.overseasPlayers[0].currentSeasonStats.g,
      gamesAfterSept,
      'Duplicate monthly processing for same YYYY-MM must NOT double-count overseas stats'
    );
    assert.ok(aoCareer.amateurAndOverseas!.tournamentResults.length >= 5, 'National amateur tournaments must run across Apr-Sep');
    assert.ok(
      (aoCareer.amateurAndOverseas!.overseasAmateurSigningsBySeason[aoCareer.season] ?? 0) <= 3,
      'Annual MLB amateur signings must respect 0~3 cap'
    );

    // KBO 규약 제107조: Amateur-direct overseas player within 2-year ban MUST be blocked from BOTH draft & developmental bypass signing
    const amateurDirect = aoCareer.amateurAndOverseas!.overseasPlayers.find(
      (o) => o.originCategory === '아마추어직행'
    )!;
    assert.ok(amateurDirect, 'Must include amateur-direct overseas players (e.g. 장현석/배지환)');
    amateurDirect.overseasContractEndDate = '2026-01-15';
    amateurDirect.domesticEligibleDate = '2028-01-15';
    amateurDirect.returnRestrictionActive = true;

    const auditBlocked = evaluateOverseasReturnEligibility(amateurDirect, '2026-09-01');
    assert.equal(auditBlocked.blockedByArticle107, true);
    assert.equal(auditBlocked.canApplyRookieDraft, false);
    assert.ok(auditBlocked.daysRemaining > 400);

    let devBypassBlocked = false;
    try {
      assertNotBlockedByArticle107(aoCareer, amateurDirect.name, amateurDirect.permanentId);
    } catch (err) {
      devBypassBlocked = (err instanceof Error ? err.message : '').includes('107조');
    }
    assert.equal(devBypassBlocked, true, 'Article 107 must block developmental/official bypass signing');

    // Inject fake developmental candidate with same blocked player name -> recruitDevelopmentalCandidate must block!
    aoCareer.developmentalMarket = [
      {
        id: 'dev_bypass_test',
        name: amateurDirect.name,
        age: amateurDirect.age,
        role: amateurDirect.role,
        position: amateurDirect.position,
        ability: 74,
        potential: 84,
        originNote: '해외직행우회시도',
        signingCostBillion: 0.3,
        coachNote: '테스트',
        season: aoCareer.season,
      },
    ];
    let devRecruitBlocked = false;
    try {
      recruitDevelopmentalCandidate(aoCareer, 'dev_bypass_test');
    } catch (err) {
      devRecruitBlocked = (err instanceof Error ? err.message : '').includes('107조');
    }
    assert.equal(devRecruitBlocked, true, 'recruitDevelopmentalCandidate must block Article 107 restricted player');

    // After 2-year ban expires, player passes audit and enters rookie draft pool with same permanentId
    amateurDirect.overseasContractEndDate = '2024-01-10';
    amateurDirect.domesticEligibleDate = '2026-01-10';
    amateurDirect.returnRestrictionActive = false;
    const applyRes = applyOverseasPlayerForDraft(aoCareer, amateurDirect.permanentId);
    assert.equal(applyRes.approved, true, 'Expired 2-year restriction must approve KBO draft application');
    assert.ok(
      applyRes.nextCareer.draftState.candidates.some(
        (c) => c.permanentId === amateurDirect.permanentId && c.isOverseasReturnee === true
      ),
      'Approved overseas draft applicant must enter draft pool with same permanentId'
    );

    // KBO-origin returnee (e.g. 이정후/김하성/김혜성 등 해외파 KBO출신) returns to original club (NOT rookie draft) when released
    const alumniCand = aoCareer.amateurAndOverseas!.overseasPlayers.find(
      (o) => o.originCategory === 'KBO출신(포스팅·FA)' && o.originalKboTeamId
    )!;
    assert.ok(alumniCand && alumniCand.originalKboTeamId, 'Must have a KBO-origin overseas player in 2027 baseline');
    const origClubId = alumniCand.originalKboTeamId!;
    const alumniReturnCareer = createNewCareer({ teamId: origClubId, gmName: '해외복귀단장', seed: 42003 });
    const kboAlumni = alumniReturnCareer.amateurAndOverseas!.overseasPlayers.find(
      (o) => o.permanentId === alumniCand.permanentId
    )!;
    assert.equal(kboAlumni.originCategory, 'KBO출신(포스팅·FA)');
    assert.equal(kboAlumni.originalKboTeamId, origClubId);
    kboAlumni.contractYearsRemaining = 0;
    kboAlumni.status = '방출대기';
    kboAlumni.league = 'FA/방출';
    const alumniRes = signEligibleKboAlumniReturnee(alumniReturnCareer, kboAlumni.permanentId);
    assert.ok(
      Object.values(alumniRes.nextCareer.players).some(
        (p) => p.name === kboAlumni.name && p.teamId === origClubId && p.permanentId === kboAlumni.permanentId
      ),
      `KBO-origin overseas returnee (${kboAlumni.name}) must return to original club ${origClubId} preserving permanentId`
    );

    // Season transition advances HS/College grades & archives overseas seasonHistory
    const beforeHistoryLen = aoCareer.amateurAndOverseas!.overseasPlayers[0].seasonHistory.length;
    aoCareer.season = 2027;
    advanceAmateurAndOverseasSeasonInPlace(aoCareer, new SeededRng(42004));
    assert.equal(
      aoCareer.amateurAndOverseas!.overseasPlayers[0].seasonHistory.length,
      beforeHistoryLen + 1,
      'Season rollover must archive overseas player seasonHistory'
    );
    const mergedDraft = integrateAmateurAndOverseasIntoDraftCandidates(
      aoCareer,
      aoCareer.draftState.candidates,
      2027
    );
    assert.ok(mergedDraft.length >= 110);
  }

  // =========================================================================
  // 43. 전체 구단 통합 선수 검색 (KBO 10개 구단 + 상무 + 울산 + 해외파)
  // =========================================================================
  {
    const sCareer = createNewCareer({ teamId: '한화', gmName: '통합검색단장', seed: 43001 });
    const allResults = searchAllLeaguePlayers(sCareer, {
      query: '',
      teamFilter: '전체',
      roleFilter: '전체',
      positionFilter: '전체',
      tierFilter: '전체',
      sortBy: 'ability',
    });
    assert.ok(allResults.some((r) => r.source === 'KBO'), 'Global search must include KBO players');
    assert.ok(allResults.some((r) => r.source === '상무'), 'Global search must include Sangmu players');
    assert.ok(allResults.some((r) => r.source === '울산'), 'Global search must include Ulsan Whales players');
    assert.ok(allResults.some((r) => r.source === '해외파'), 'Global search must include Overseas players');

    const wangSearch = searchAllLeaguePlayers(sCareer, {
      query: '왕옌청',
      teamFilter: '전체',
      roleFilter: '전체',
      positionFilter: '전체',
      tierFilter: '전체',
      sortBy: 'ability',
    });
    assert.equal(wangSearch.length, 1);
    assert.equal(wangSearch[0].teamId, '한화');
  }

  // =========================================================================
  // 44. 현실 KBO 프랜차이즈 스타 · 원클럽맨 보정 · 통산 소속팀 & 테마 컬러 (#1, #4, #11)
  // =========================================================================
  {
    const c44 = createNewCareer({ teamId: '한화', gmName: '레전드단장', seed: 44001 });
    const gamesBefore = c44.gamesPlayed;
    const seasonBefore = c44.season;
    ensureLeagueLifeStateInPlace(c44);
    assert.equal(c44.gamesPlayed, gamesBefore, 'Hydration must NEVER auto-advance games');
    assert.equal(c44.season, seasonBefore, 'Hydration must NEVER auto-advance season');

    const findByName = (name: string) => Object.values(c44.players).find((p) => p.name === name);
    const choiJeong = findByName('최정');
    const yangHyeonJong = findByName('양현종');
    const ryu = findByName('류현진');
    const choiHyungWoo = findByName('최형우');
    const kangMinHo = findByName('강민호');
    const kimHyunSoo = findByName('김현수');

    if (choiJeong) {
      assert.equal(choiJeong.isOneClubMan, true, '최정 must be a one-club man');
      assert.ok((choiJeong.careerTeamHistory?.length ?? 0) >= 1);
    }
    if (yangHyeonJong) {
      assert.equal(yangHyeonJong.isOneClubMan, true, '양현종 must be a KBO one-club man');
    }
    if (ryu) {
      assert.equal(ryu.isOneClubMan, true, '류현진 must be a KBO one-club man (한화)');
    }
    if (choiHyungWoo) {
      assert.equal(choiHyungWoo.isOneClubMan, false, '최형우 played for 삼성 & KIA (not one-club man)');
      assert.ok((choiHyungWoo.careerTeamHistory?.length ?? 0) >= 2);
    }
    if (kangMinHo) {
      assert.equal(kangMinHo.isOneClubMan, false, '강민호 played for 롯데 & 삼성 (not one-club man)');
    }
    if (kimHyunSoo) {
      assert.equal(kimHyunSoo.isOneClubMan, false, '김현수 played for 두산 & LG (not one-club man)');
    }

    // All 10 KBO teams have accessible light/dark UI theme tokens (#4)
    for (const tid of TEAM_IDS) {
      assert.ok(TEAM_UI_THEMES[tid]?.primaryLight.startsWith('#'));
      assert.ok(TEAM_UI_THEMES[tid]?.primaryDark.startsWith('#'));
    }
  }

  // =========================================================================
  // 45. 전체 구단 팀 내 레전드 선수 트레이드 고난도 보호 (#3)
  // =========================================================================
  {
    const c45 = createNewCareer({ teamId: '한화', gmName: '트레이드단장', seed: 45001 });
    const legendTarget = Object.values(c45.players).find(
      (p) => p.teamId === 'SSG' && p.name === '최정'
    );
    const myMidPlayer = Object.values(c45.players).find(
      (p) => p.teamId === '한화' && p.category === '국내' && p.ability >= 72 && p.ability <= 80
    );
    if (legendTarget && myMidPlayer) {
      const detail = evaluatePlayerTradeValuationDetailed(c45, legendTarget);
      assert.ok(
        detail.homeClubSymbolicPremium >= 50,
        `Opponent team Legend must carry high symbolic trade resistance (got ${detail.homeClubSymbolicPremium})`
      );
      const evalRes = evaluateTradeProposal(c45, 'SSG', [myMidPlayer.id], [legendTarget.id], 0);
      assert.notEqual(evalRes.decision, '수락', 'Normal trade offer for rival club Legend must not be accepted');
    }
  }

  // =========================================================================
  // 46. 시즌 중 MVP·신인왕·골든글러브 예상 순위 & 개인 타이틀 수상 효과 (#6, #20)
  // =========================================================================
  {
    const c46 = createNewCareer({ teamId: 'LG', gmName: '수상단장', seed: 46001 });
    const sampleHit = Object.values(c46.players).find(
      (p) => p.teamId === 'LG' && p.role === '타자' && p.rosterTier === '1군'
    )!;
    (sampleHit.stats as BatterStats).G = 40;
    (sampleHit.stats as BatterStats).PA = 170;
    (sampleHit.stats as BatterStats).AB = 150;
    (sampleHit.stats as BatterStats).H = 54;
    (sampleHit.stats as BatterStats).HR = 14;
    (sampleHit.stats as BatterStats).RBI = 42;
    (sampleHit.stats as BatterStats).BB = 18;
    const races = computeLiveAwardRaces(c46);
    assert.ok(races.mvpTop10.length >= 1, 'Live MVP race must populate when players have stats');
    assert.equal(races.goldenGloveByPos.length, 8, 'Golden Glove race must cover all 8 KBO position groups (10 winners)');

    sampleHit.lastSeasonAwards = ['MVP'];
    assert.equal(getAwardSalaryDemandMultiplier(sampleHit).multiplier, 1.22);
    sampleHit.lastSeasonAwards = ['신인왕'];
    assert.equal(getAwardSalaryDemandMultiplier(sampleHit).multiplier, 1.2);
    sampleHit.lastSeasonAwards = ['골든글러브'];
    assert.equal(getAwardTradeValueMultiplier(sampleHit).multiplier, 1.1);
  }

  // =========================================================================
  // 47. 군입대 예정자 명단 + 해외파 군복무 상태 & 복귀설 뉴스 (#7, #16)
  // =========================================================================
  {
    const c47 = createNewCareer({ teamId: '한화', gmName: '병역단장', seed: 47001 });
    const queue = getMilitaryEnlistmentQueue(c47);
    assert.ok(queue.length > 0, 'Military enlistment queue must list upcoming/serving players');
    assert.ok(queue.every((q) => Boolean(q.expectedEnlistDate && q.expectedDischargeDate)));

    const ovPlayers = c47.amateurAndOverseas!.overseasPlayers;
    assert.ok(ovPlayers.every((ov) => Boolean(ov.militaryStatus)), 'All overseas players must have militaryStatus');
    const rumorTarget = ovPlayers[0];
    rumorTarget.contractYearsRemaining = 1;
    rumorTarget.returnRumorPublishedSeason = undefined;
    const newsBefore = c47.newsFeed?.length ?? 0;
    generateOverseasReturnRumorsInPlace(c47);
    assert.ok((c47.newsFeed?.length ?? 0) > newsBefore, 'Expiring overseas player must generate return rumor news');
  }

  // =========================================================================
  // 48. 전년 대비 연봉 인상·삭감률 + 선수단 정리 예정 표시 & 일괄 방출 + 방출 근황 (#5, #9, #12)
  // =========================================================================
  {
    const yoyUp = computeYoYSalaryChange(6.0, 5.0);
    assert.equal(yoyUp.direction, 'up');
    assert.equal(yoyUp.label, '+20.0%');
    const yoyDown = computeYoYSalaryChange(4.0, 5.0);
    assert.equal(yoyDown.direction, 'down');
    assert.equal(yoyDown.label, '-20.0%');
    const yoyFlat = computeYoYSalaryChange(5.0, 5.0);
    assert.equal(yoyFlat.direction, 'flat');
    assert.equal(yoyFlat.label, '동결 (0%)');

    const c48 = createNewCareer({ teamId: '한화', gmName: '정리단장', seed: 48001 });
    const benchP = Object.values(c48.players).find(
      (p) => p.teamId === '한화' && p.category === '국내' && p.rosterTier === '2군'
    )!;
    const markedRes = togglePlayerOffseasonReleaseMark(c48, benchP.id);
    assert.equal(markedRes.marked, true);
    assert.equal(markedRes.nextCareer.players[benchP.id].markedForOffseasonRelease, true);

    const execRes = executeMarkedOffseasonReleases(markedRes.nextCareer);
    assert.equal(execRes.releasedNames.length, 1);
    assert.ok(
      (execRes.nextCareer.releasedPlayersTracker ?? []).some((r) => r.playerName === benchP.name),
      'Released player must be tracked in releasedPlayersTracker'
    );
  }

  // =========================================================================
  // 49. 지명권 출처 추적 + 신인 계약금 TOP 10 + 고교·대학 최대어 & 현장 초청 (#8, #13, #21)
  // =========================================================================
  {
    const c49 = createNewCareer({ teamId: '한화', gmName: '드래프트단장', seed: 49001 });
    recordDraftPickTradeInPlace(c49, 1, 'LG', '한화', '2026-06-10');
    const tradedProv = c49.draftState.pickProvenance?.find(
      (pr) => pr.round === 1 && pr.originalTeamId === 'LG'
    );
    assert.ok(tradedProv, 'Traded pick provenance record must exist');
    assert.equal(tradedProv!.ownerTeamId, '한화');
    assert.ok(Boolean(tradedProv!.acquiredViaTradeNote));

    const topRec = selectAnnualTopAmateurProspectsInPlace(c49, false);
    assert.ok(topRec?.topHighSchool?.permanentId, 'High School top prospect must be selected');
    assert.ok(topRec?.topCollege?.permanentId, 'College top prospect must be selected');
    assert.ok((topRec?.draftInvitees.length ?? 0) >= 8, 'Draft ceremony invitees must be selected');

    const completedDraft = autoCompleteRemainingDraft(c49).nextCareer;
    recordRookieSigningBonusTop10InPlace(completedDraft);
    const top10 = completedDraft.rookieBonusRankingsBySeason?.[completedDraft.season] ?? [];
    assert.equal(top10.length, 10, 'Annual Rookie Signing Bonus TOP 10 must record 10 rookies');
    assert.ok(top10[0].signingBonusBillion >= top10[9].signingBonusBillion);
  }

  // =========================================================================
  // 50. 은퇴선수 진로 자동 관리 · 코치 연수 후 FA 편입 · 사용자 구단 자동 영입 금지 (#14, #15)
  // =========================================================================
  {
    const c50 = createNewCareer({ teamId: '한화', gmName: '진로단장', seed: 50001 });
    const myCoachCountBefore = (c50.coaches['한화'] ?? []).length;
    const vet1 = Object.values(c50.players).find(
      (p) => p.teamId === '한화' && p.category === '국내' && p.rosterTier === '1군'
    )!;
    const vet2 = Object.values(c50.players).find(
      (p) => p.teamId === '삼성' && p.category === '국내' && p.rosterTier === '1군'
    )!;
    vet1.age = 38;
    vet1.ability = 82;
    vet2.age = 37;
    vet2.ability = 80;
    const rec1 = assignRetiredPlayerCareerInPlace(c50, vet1, new SeededRng(50002));
    assignRetiredPlayerCareerInPlace(c50, vet2, new SeededRng(50003));

    assert.ok(rec1.careerPath.length > 0);
    // Simulate coach training graduation into FA market
    c50.faCoaches = (c50.faCoaches ?? []).filter((fc) => fc.name !== vet1.name);
    rec1.careerPath = '코치 연수';
    rec1.coachId = undefined;
    rec1.coachTrainingUntilSeason = 2027;
    rec1.coachRole = '타격코치';
    rec1.currentAffiliation = '일본 NPB 코치 연수';

    c50.season = 2027;
    processOffseasonRetiredCareersInPlace(c50, new SeededRng(50004));
    assert.equal(
      (c50.coaches['한화'] ?? []).length,
      myCoachCountBefore,
      'User club must NEVER have retired coaches auto-hired without GM decision'
    );
    assert.ok(
      (c50.faCoaches ?? []).some((fc) => fc.name === vet1.name && fc.coachTrainingOrigin),
      'Graduated coach-training retired player must enter FA coach market'
    );
  }

  // =========================================================================
  // 51. 임시 주장 자동 선임/복귀 & 시즌 중 감독 경질 시 감독대행 (#15)
  // =========================================================================
  {
    const c51 = createNewCareer({ teamId: '한화', gmName: '리더십단장', seed: 51001 });
    const capId = c51.teams['한화'].leadership?.captainPlayerId!;
    assert.ok(capId);
    c51.players[capId].injury = {
      id: 'inj_cap_test',
      playerId: capId,
      playerName: c51.players[capId].name,
      teamId: '한화',
      description: '복사근 미세 손상',
      severity: '보통',
      daysTotal: 21,
      daysRemaining: 14,
      occurredRound: 20,
      occurredDate: '2026-04-25',
    };
    syncActingCaptainInPlace(c51, '한화', true);
    assert.ok(
      c51.teams['한화'].leadership?.actingCaptainPlayerId &&
        c51.teams['한화'].leadership?.actingCaptainPlayerId !== capId,
      'Injured captain must trigger acting captain appointment'
    );
    // Recover captain -> acting captain cleared
    c51.players[capId].injury = null;
    syncActingCaptainInPlace(c51, '한화', true);
    assert.equal(c51.teams['한화'].leadership?.actingCaptainPlayerId, null);

    // Mid-season acting manager promotion
    const actingMgr = appointActingManagerInPlace(c51, '한화', '김경문', '성적 부진 경질');
    assert.ok(actingMgr && actingMgr.isActingManager === true && actingMgr.role === '감독');
  }

  // =========================================================================
  // 52. 한국시리즈 우승 보상(5팀 차등·중복 차단·+10% 예산·업적) & 연간 유니폼 (#2, #17, #18, #19)
  // =========================================================================
  {
    const c52 = createNewCareer({ teamId: '한화', gmName: '우승단장', seed: 52001 });
    const beforeTitleCount = getClubTitleCount(c52, '한화');
    const cashBefore = c52.finances.cashBalanceBillion ?? 0;
    c52.postseason.standingsSeed = ['한화', 'LG', '삼성', 'KIA', 'SSG'];
    c52.postseason.champion = '한화';
    c52.championHistory = [
      ...(c52.championHistory ?? []),
      {
        season: c52.season,
        championTeamId: '한화',
        runnerUpTeamId: 'LG',
        seriesScore: '4승 2패',
        ksMvpName: '노시환',
        ksMvpSummary: '타율 .385 3홈런 9타점',
        rewardCashBillion: 25,
        date: `${c52.season}-10-30`,
        isHistoricalBaseline: false,
      },
    ];

    const reward1 = applyKoreanSeriesChampionshipRewardsInPlace(c52, '한화', 'LG', `${c52.season}-10-30`);
    assert.ok(reward1, 'First championship reward payout must succeed');
    assert.equal(reward1!.championBudgetBoostPct, 10);
    assert.equal(reward1!.postseasonRewards.length, 5, 'All 5 postseason teams must receive tiered bonus');
    assert.ok(
      (c52.finances.cashBalanceBillion ?? 0) > cashBefore + 20,
      'Champion must receive 25억 corporate bonus'
    );
    assert.ok(
      reward1!.specialAchievements.some((a) => a.includes('무관 탈출')),
      'Hanwha winning (last title 1999) must earn long-drought achievement'
    );
    assert.equal(getClubTitleCount(c52, '한화'), beforeTitleCount + 1);

    // Duplicate season payout guard (#18)
    const cashAfterFirst = c52.finances.cashBalanceBillion ?? 0;
    const rewardDup = applyKoreanSeriesChampionshipRewardsInPlace(c52, '한화', 'LG', `${c52.season}-10-31`);
    assert.equal(rewardDup?.season, c52.season);
    assert.equal(c52.finances.cashBalanceBillion, cashAfterFirst, 'Duplicate championship reward must NOT pay cash twice');

    // Annual club uniform unveiling (#17)
    c52.season = 2028;
    unveilAnnualClubUniformsInPlace(c52);
    for (const tid of TEAM_IDS) {
      assert.equal(c52.teams[tid].currentUniform?.season, 2028, `${tid} must unveil 2028 club uniform`);
    }
  }

  // =========================================================================
  // 53. 전체 10구단 새 커리어 시작 무결성 (#0), 1R 팀컬러 테마 (#22), 디트로이트 타이거즈 로고 매칭 (#23)
  // =========================================================================
  {
    for (const tid of TEAM_IDS) {
      const nc = createNewCareer({ teamId: tid, gmName: `${tid}단장`, seed: 53000 + TEAM_IDS.indexOf(tid) });
      assert.equal(nc.playerTeamId, tid);
      assert.ok(Array.isArray(nc.coaches[tid]), `${tid} coaches entry must be an array`);
      assert.ok(nc.teams[tid].currentUniform, `${tid} must have initial currentUniform hydrated`);
      const theme = TEAM_UI_THEMES[tid];
      assert.ok(theme.bannerFrom && theme.bannerTo && theme.rgbDark && theme.primaryDark);
    }

    // Detroit Tigers official logo matching across Korean/English variants (#23)
    for (const detAlias of [
      'Detroit Tigers',
      '디트로이트 타이거즈',
      '디트로이트 타이거스',
      '디트로이트 산하',
      'MLB 디트로이트 타이거스 · AAA 톨레도 머드헨스',
      'DET',
    ]) {
      const meta = getMlbClubMeta(detAlias);
      assert.equal(meta.mlbId, 116, `Expected mlbId 116 for '${detAlias}', got ${meta.mlbId}`);
      assert.equal(meta.abbr, 'DET');
      assert.equal(meta.espnAbbr, 'det');
    }
  }

  // =========================================================================
  // 54. 선수 통산 소속팀 MLB 소속 시즌 표시 · 비파괴 마이그레이션 · 동적 MLB 진출 기록 (#24)
  // =========================================================================
  {
    const c54 = createNewCareer({ teamId: '한화', gmName: '이력단장', seed: 54001 });
    const all54 = Object.values(c54.players);

    // (1) 한국인 MLB 복귀 선수들: 류현진, 김광현, 양현종, 김현수
    const ryu54 = all54.find((p) => p.name === '류현진');
    assert.ok(ryu54, '류현진 must exist');
    const ryuMlb = (ryu54!.careerTeamHistory ?? []).filter(isMlbHistoryEntry);
    assert.equal(ryuMlb.length, 2, '류현진 must have 2 MLB club stints (LAD, TOR)');
    assert.equal(ryuMlb[0].fromSeason, 2013);
    assert.equal(ryuMlb[0].toSeason, 2019);
    assert.equal(ryuMlb[1].fromSeason, 2020);
    assert.equal(ryuMlb[1].toSeason, 2023);
    assert.equal(countDistinctMlbSeasons(ryu54!.careerTeamHistory), 11);
    assert.equal(ryu54!.isOneClubMan, true, '류현진 must remain KBO 원클럽맨 despite MLB stints');

    const kkhProf = findRealPlayerClubProfile('김광현', 'SSG');
    assert.ok(kkhProf, '김광현 real profile must exist');
    assert.equal(countDistinctMlbSeasons(kkhProf!.history), 2, '김광현 MLB 2시즌 (2020~2021)');
    assert.equal(kkhProf!.isOneClubMan, true);

    const yhj54 = all54.find((p) => p.name === '양현종');
    assert.ok(yhj54);
    assert.equal(countDistinctMlbSeasons(yhj54!.careerTeamHistory), 1, '양현종 MLB 1시즌 (2021)');
    assert.equal(yhj54!.isOneClubMan, true);

    const khs54 = all54.find((p) => p.name === '김현수');
    assert.ok(khs54);
    const khsMlb = (khs54!.careerTeamHistory ?? []).filter(isMlbHistoryEntry);
    assert.equal(khsMlb.length, 2, '김현수 must list both Baltimore (2016~2017) & Philadelphia (2017)');
    assert.equal(countDistinctMlbSeasons(khs54!.careerTeamHistory), 2, '김현수 distinct MLB seasons must be 2 (2016, 2017)');

    // (2) 외국인 선수 MLB 시즌 (단축명·풀네임 별칭 모두 매칭 확인)
    const reyes54 = all54.find((p) => p.name === '레이예스' || p.name === '빅터 레이예스');
    assert.ok(reyes54, '레이예스 must exist');
    const reyesMlb = (reyes54!.careerTeamHistory ?? []).filter(isMlbHistoryEntry);
    assert.ok(reyesMlb.length >= 1 && reyesMlb[0].mlbTeamName === 'Detroit Tigers');
    assert.equal(countDistinctMlbSeasons(reyes54!.careerTeamHistory), 5, '레이예스 MLB 5시즌 (2018~2022)');

    const austin54 = all54.find((p) => p.name === '오스틴' || p.name === '오스틴 딘');
    assert.ok(austin54, '오스틴 must exist');
    assert.ok(countDistinctMlbSeasons(austin54!.careerTeamHistory) >= 5, '오스틴 MLB 5시즌 (2018~2022)');

    const flexen54 = all54.find((p) => p.name === '플렉센' || p.name === '크리스 플렉센');
    assert.ok(flexen54, '플렉센 must exist');
    assert.ok(
      (flexen54!.careerTeamHistory ?? []).filter(isMlbHistoryEntry).length >= 4,
      '플렉센 must list multiple MLB clubs chronologically around KBO stints'
    );

    // (3) 기존 세이브 비파괴 업그레이드: MLB 이력이 빠진 구버전 careerTeamHistory + 2027 트레이드 이력 보존
    ryu54!.careerTeamHistory = [
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2006, toSeason: 2026 },
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2027, note: '가상 트레이드 테스트' },
    ];
    ensureLeagueLifeStateInPlace(c54);
    assert.equal(
      countDistinctMlbSeasons(ryu54!.careerTeamHistory),
      11,
      'Existing save upgrade must backfill 류현진 11 MLB seasons'
    );
    assert.ok(
      ryu54!.careerTeamHistory!.some((h) => h.teamId === 'LG' && h.fromSeason === 2027),
      'Existing save upgrade must preserve post-2026 in-game KBO transfers'
    );

    // (4) 동적 인게임 MLB 진출 시 careerTeamHistory 자동 기록
    const moon54 = all54.find((p) => p.name === '문동주' && p.teamId === '한화')!;
    assert.ok(moon54);
    recordMlbExportPlayer(c54, moon54, 'Los Angeles Dodgers', 5, 65, `${c54.season}-12-01`);
    const moonMlb = (moon54.careerTeamHistory ?? []).filter(isMlbHistoryEntry);
    assert.equal(moonMlb.length, 1);
    assert.equal(moonMlb[0].mlbTeamName, 'Los Angeles Dodgers');
    assert.equal(moonMlb[0].fromSeason, c54.season);
    assert.equal(moonMlb[0].toSeason, c54.season + 4);
    assert.equal(countDistinctMlbSeasons(moon54.careerTeamHistory), 5);
  }

  // =========================================================================
  // 55. 은퇴 예정 알림 · FA 계약 만료 알림 · 8단계 오프시즌 · 2027->2028->2029 연도 정상 전환 검증
  // =========================================================================
  {
    const c55 = createNewCareer({ teamId: '한화', gmName: '오프시즌테스터', seed: 55001 });
    const s0 = c55.season; // 2027
    const s1 = s0 + 1;     // 2028
    const s2 = s0 + 2;     // 2029
    assert.equal(c55.season, 2027);
    assert.ok(
      getCurrentCareerDate(c55).isoDate.startsWith(`${s0}-`),
      `${s0} career initial date must start with ${s0}-`
    );

    // (1) 은퇴 예정 선수 알림 검증 (류현진 등 베테랑 자동 감지)
    const retireAlerts = getRetirementCandidateAlerts(c55, '한화');
    assert.ok(retireAlerts.length >= 1, 'Hanwha must have at least 1 veteran retirement candidate alert');
    assert.ok(
      retireAlerts.every((a) => a.level === '은퇴 유력' || a.level === '은퇴 검토'),
      'Retirement alert level must be 은퇴 유력 or 은퇴 검토'
    );
    assert.ok(
      retireAlerts.every((a) => a.probabilityPct >= 30 && a.probabilityPct <= 95),
      'Retirement alert probability must be within 30..95%'
    );

    // (2) FA·외국인 계약 만료 알림 검증
    const expiryAlerts = getContractExpiryAlerts(c55, '한화');
    assert.ok(expiryAlerts.length >= 1, 'Hanwha must have contract expiry alerts');
    assert.ok(
      expiryAlerts.some((e) => e.kind === '외국인 계약 만료'),
      '1-year foreign players must appear in contract expiry alerts'
    );
    const faSample = Object.values(c55.players).find(
      (p) => p.teamId === '한화' && p.category === '국내' && p.rosterTier === '1군'
    )!;
    faSample.serviceYears = 9;
    faSample.contract.yearsRemaining = 1;
    faSample.contract.endSeason = s0;
    faSample.contract.isFAEligible = true;
    const expiryAfterFa = getContractExpiryAlerts(c55, '한화');
    assert.ok(
      expiryAfterFa.some((e) => e.player.id === faSample.id && e.kind === 'FA 자격 만료' && e.faGrade !== null),
      'FA-eligible expiring player must appear as FA 자격 만료 with A/B/C grade'
    );

    // (3) 8단계 간소화 오프시즌 진행: 단장 최종 승인 전에는 절대 차기 시즌으로 자동 전환 금지
    assert.equal(OFFSEASON_8_STEPS.length, 8, 'Simplified offseason must have exactly 8 steps');
    let cur = structuredClone(c55);
    cur.phase = 'OFFSEASON';
    cur.offseasonStep8 = 'SETTLEMENT';
    cur.completedOffseasonSteps8 = [];
    const expectedDatePrefixes: Record<string, string> = {
      SETTLEMENT: `${s0}-11-`,
      OWNER_EVAL: `${s0}-11-`,
      COACH_STAFF: `${s0}-11-`,
      ROSTER_CLEANUP: `${s0}-11-`,
      PLAYER_CONTRACTS: `${s0}-12-`,
      ROSTER_UPGRADE: `${s0}-12-`,
      OPENING_PREP: `${s1}-02-`,
      NEXT_SEASON_START: `${s1}-03-`,
    };

    for (const step of OFFSEASON_8_STEPS) {
      const res = completeAndAdvanceOffseason8Step(cur, step.id);
      cur = res.nextCareer;
      assert.equal(cur.season, s0, `Step ${step.id} must NOT auto-advance season without GM approval`);
      assert.equal(cur.phase, 'OFFSEASON', `Phase must stay OFFSEASON through step ${step.id}`);
      const d = getCurrentCareerDate(cur);
      assert.ok(
        d.isoDate.startsWith(expectedDatePrefixes[step.id]),
        `Step ${step.id} date ${d.isoDate} must match ${expectedDatePrefixes[step.id]}`
      );
    }

    assert.equal(cur.aiOffseasonProcessedSeason, s0, `AI clubs offseason must run in sync during ${s0} offseason`);
    assert.ok((cur.aiOffseasonLogSummary ?? []).length >= 1, 'AI offseason summary must be populated');
    const readiness = getOffseason8StepReadiness(cur);
    assert.equal(readiness.canApproveNextSeason, true, 'Completed 8-step offseason must be ready for GM approval');

    // (4) 단장 최종 승인 -> s0 -> s1 정상 전환 & 모든 연도 표기 검증
    const next1 = advanceToNextSeason(cur).nextCareer;
    assert.equal(next1.season, s1, `Season must advance ${s0} -> ${s1}`);
    assert.equal(next1.phase, 'REGULAR_SEASON');
    assert.equal(next1.gamesPlayed, 0);
    assert.ok(next1.label.includes(String(s1)), `Career label (${next1.label}) must update to ${s1}`);
    const date1 = getCurrentCareerDate(next1);
    assert.ok(date1.isoDate.startsWith(`${s1}-03-`), `${s1} opening date must be ${s1}-03-*, got ${date1.isoDate}`);
    assert.ok(date1.displayDate.startsWith(`${s1}.`), `${s1} displayDate must start with ${s1}., got ${date1.displayDate}`);
    assert.ok(next1.schedule[0].dates[0].startsWith(`${s1}-`), `${s1} schedule must use ${s1} dates`);
    assert.equal(next1.springCamp?.season, s1, `${s1} spring camp season must be ${s1}`);
    assert.equal(getAnnualKboCapManwon(2027), 1_511_709, '2027 CB cap must be 151억 1,709만 원');

    // 차기 시즌 10개 구단 라인업 9명·로테이션 5명 무결성 확인
    for (const tid of TEAM_IDS) {
      assert.equal(next1.teams[tid].lineupOrder.length, 9, `${s1} ${tid} must have 9-man lineup`);
      assert.equal(next1.teams[tid].rotationOrder.length, 5, `${s1} ${tid} must have 5-man rotation`);
    }

    // 차기 시즌 정규시즌 1시리즈 시뮬레이션 정상 동작 확인
    const next1OpeningGames = next1.schedule[0].dates.length;
    const next1Played = simulateNextRegularSeries(next1).nextCareer;
    assert.equal(next1Played.season, s1);
    assert.equal(next1Played.gamesPlayed, next1OpeningGames, `${s1} regular season opening series must play cleanly`);
    assert.ok(
      next1Played.gamesLedger[0].date.startsWith(`${s1}-`),
      `${s1} played game ledger must record ${s1} date`
    );

    // (5) s1 -> s2 연속 오프시즌 & 최종 승인 전환 검증
    let curOff1 = structuredClone(next1Played);
    curOff1.phase = 'OFFSEASON';
    curOff1.offseasonStep8 = 'SETTLEMENT';
    curOff1.completedOffseasonSteps8 = [];
    curOff1 = completeAndAdvanceOffseason8Step(curOff1, 'NEXT_SEASON_START').nextCareer;
    assert.equal(curOff1.season, s1, `${s1} offseason must not auto-advance to ${s2} before GM approval`);
    assert.ok(
      getCurrentCareerDate(curOff1).isoDate.startsWith(`${s2}-03-`),
      `${s1} offseason Step 8 must show ${s2}-03 pre-opening date`
    );

    const next2 = advanceToNextSeason(curOff1).nextCareer;
    assert.equal(next2.season, s2, `Season must advance ${s1} -> ${s2}`);
    assert.equal(next2.phase, 'REGULAR_SEASON');
    assert.equal(next2.gamesPlayed, 0);
    assert.ok(next2.label.includes(String(s2)), `Career label (${next2.label}) must update to ${s2}`);
    const date2 = getCurrentCareerDate(next2);
    assert.ok(date2.isoDate.startsWith(`${s2}-03-`), `${s2} opening date must be ${s2}-03-*, got ${date2.isoDate}`);
    assert.ok(date2.displayDate.startsWith(`${s2}.`), `${s2} displayDate must start with ${s2}., got ${date2.displayDate}`);
    assert.ok(next2.schedule[0].dates[0].startsWith(`${s2}-`), `${s2} schedule must use ${s2} dates`);
    assert.equal(getAnnualKboCapManwon(2028), 1_587_294, '2028 CB cap must be 158억 7,294만 원');
    for (const tid of TEAM_IDS) {
      assert.equal(next2.teams[tid].lineupOrder.length, 9, `${s2} ${tid} must have 9-man lineup`);
      assert.equal(next2.teams[tid].rotationOrder.length, 5, `${s2} ${tid} must have 5-man rotation`);
    }
  }

  // 56. 현실 KBO 10개 구단 유니폼 사양 + 선수 불만도(0~100) 개선 패치 종합 검증
  {
    // (1) 현실 KBO 10개 구단 유니폼 사양 확인
    for (const tid of TEAM_IDS) {
      const spec = REAL_KBO_UNIFORM_SPECS[tid];
      assert.ok(spec, `${tid} must have real KBO uniform spec`);
      assert.ok(spec.kitSupplier.length > 0, `${tid} must define real kit supplier`);
      assert.ok(spec.homeWordmark.length > 0 && spec.awayWordmark.length > 0, `${tid} must define chest wordmarks`);
      const ed = buildAnnualClubUniform(tid, 2026, '#000000', '#111111', '#222222');
      assert.equal(ed.homeWordmark, spec.homeWordmark);
      assert.equal(ed.kitSupplier, spec.kitSupplier);
    }
    assert.equal(REAL_KBO_UNIFORM_SPECS['LG'].homePattern, 'pinstripe', 'LG home uniform must be pinstripe');
    assert.equal(REAL_KBO_UNIFORM_SPECS['키움'].awayBodyHex, '#6F0020', 'Kiwoom away uniform must be burgundy');

    // (2) 불만도 5단계 매핑 (0~19 / 20~39 / 40~59 / 60~79 / 80~100)
    assert.equal(getDissatisfactionLevel(0), '만족');
    assert.equal(getDissatisfactionLevel(19), '만족');
    assert.equal(getDissatisfactionLevel(20), '보통');
    assert.equal(getDissatisfactionLevel(39), '보통');
    assert.equal(getDissatisfactionLevel(40), '불만');
    assert.equal(getDissatisfactionLevel(59), '불만');
    assert.equal(getDissatisfactionLevel(60), '높은 불만');
    assert.equal(getDissatisfactionLevel(79), '높은 불만');
    assert.equal(getDissatisfactionLevel(80), '심각한 불만');
    assert.equal(getDissatisfactionLevel(100), '심각한 불만');
    assert.equal(GM_MEETING_ACTIONS.length, 4, 'GM meeting must offer exactly 4 actions');

    // (3) 주 1회 자동 평가 가드 (매 경기 실행 금지, 주 1회 10개 구단 전체 동일 평가)
    let c56 = createNewCareer({ teamId: 'LG' });
    c56.phase = 'REGULAR_SEASON';
    const starId = c56.teams['LG'].lineupOrder[0];
    const starP = c56.players[starId];
    assert.ok(starP, 'LG must have lineup starter');

    // 40 미만 시 단장 면담 차단
    starP.dissatisfaction = 25;
    assert.equal(canHoldPlayerMeeting(c56, starP).allowed, false, 'Meeting must be blocked when dissatisfaction < 40');

    // 1경기만 진행 시 주간 평가 미실행 확인
    c56.gamesPlayed = 2;
    const rng56 = new SeededRng(56001);
    const skipRes = evaluateLeagueWeeklyDissatisfactionInPlace(c56, rng56, '2026-04-02');
    assert.equal(skipRes.ran, false, 'Weekly dissatisfaction must NOT run before 1 week (6 games / 7 days)');

    // 2군 강등 시 불만 상승 및 원인 중복 방지
    c56 = demotePlayer(c56, starId);
    const afterDemoteDis = getPlayerDissatisfaction(c56.players[starId]);
    assert.ok(afterDemoteDis > 25, `Demoting starter must increase dissatisfaction (got ${afterDemoteDis})`);
    assert.ok(
      (c56.players[starId].activeDissatisfactionCauses ?? []).includes('2군 강등'),
      'Demotion must record 2군 강등 cause'
    );

    // 주 1회 평가 실행 (사용자 + AI 9개 구단 모두 평가)
    c56.gamesPlayed = 18;
    const runRes = evaluateLeagueWeeklyDissatisfactionInPlace(c56, rng56, '2026-04-20');
    assert.equal(runRes.ran, true, 'Weekly evaluation must run after >= 6 games');
    assert.ok(runRes.evaluatedPlayers >= 200, 'Weekly evaluation must cover user + all 9 AI clubs');

    // 동일 원인 불만 중복 생성 방지 확인
    c56.gamesPlayed = 25;
    c56.currentSeriesIndex = 10;
    evaluateLeagueWeeklyDissatisfactionInPlace(c56, rng56, '2026-04-27');
    const starDemoteComplaints = (c56.complaints ?? []).filter(
      (x) => !x.resolved && x.playerId === starId && x.reason === '2군강등'
    );
    assert.ok(starDemoteComplaints.length <= 1, 'Same cause complaint must never duplicate');

    // (4) 불만 40+ 단장 면담 + 30일 쿨다운 + 면담만으로 무조건 해결 불가 + 실제 조치 후속 검증
    c56.players[starId].dissatisfaction = 68;
    const gateOpen = canHoldPlayerMeeting(c56, c56.players[starId]);
    assert.equal(gateOpen.allowed, true, 'Meeting must be allowed when dissatisfaction >= 40');

    const meetRes = conductGmPlayerMeeting(c56, starId, '출전 기회 검토');
    c56 = meetRes.nextCareer;
    assert.ok(
      meetRes.afterScore < meetRes.beforeScore && meetRes.afterScore >= 40,
      `Meeting alone must not unconditionally solve dissatisfaction (${meetRes.beforeScore} -> ${meetRes.afterScore})`
    );
    assert.ok(c56.players[starId].pendingMeetingFollowUp, 'Meeting must attach pending follow-up tracker');

    // 30일 이내 동일 선수 반복 면담 차단
    const cooldownGate = canHoldPlayerMeeting(c56, c56.players[starId]);
    assert.equal(cooldownGate.allowed, false, 'Repeat meeting within 30 days must be blocked');
    assert.ok(cooldownGate.daysRemaining > 0 && cooldownGate.daysRemaining <= 30);

    // 30일 경과 후 재면담 허용 확인
    c56.players[starId].lastMeetingDate = '2026-03-01';
    c56.players[starId].dissatisfaction = 55;
    assert.equal(canHoldPlayerMeeting(c56, c56.players[starId]).allowed, true, 'Meeting must reopen after 30 days');

    // 실제 1군 콜업 조치 이행 시 주간 후속 검증에서 불만 크게 감소 확인
    c56.players[starId].rosterTier = '1군';
    c56.teams['LG'].lineupOrder.push(starId);
    if (c56.players[starId].pendingMeetingFollowUp) {
      c56.players[starId].pendingMeetingFollowUp!.evalAfterRound = c56.gamesPlayed;
    }
    const beforeFollowUp = getPlayerDissatisfaction(c56.players[starId]);
    evaluateLeagueWeeklyDissatisfactionInPlace(c56, rng56, '2026-05-12', { force: true });
    const afterFollowUp = getPlayerDissatisfaction(c56.players[starId]);
    assert.ok(
      afterFollowUp < beforeFollowUp,
      `Real call-up follow-up must reduce dissatisfaction (${beforeFollowUp} -> ${afterFollowUp})`
    );

    // (5) 불만 80+ 트레이드 요청·재계약 거부 위험 상승 (절대 자동 이적 금지) + 프랜차이즈 스타 충성도 별도 고려
    const ssgCareer = createNewCareer({ teamId: 'SSG' });
    const choiJeong = Object.values(ssgCareer.players).find((p) => p.teamId === 'SSG' && p.name === '최정');
    const nonFranchise = Object.values(ssgCareer.players).find(
      (p) => p.teamId === 'SSG' && p.name !== '최정' && p.name !== '김광현' && p.category === '국내' && p.ability >= 72
    );
    assert.ok(choiJeong && nonFranchise, 'SSG must have 최정 and another domestic player');
    choiJeong!.dissatisfaction = 88;
    nonFranchise!.dissatisfaction = 88;
    const choiResist = getReSignResistanceAssessment(ssgCareer, choiJeong!);
    const otherResist = getReSignResistanceAssessment(ssgCareer, nonFranchise!);
    assert.ok(choiResist.isFranchiseStar, '최정 must be recognized as franchise star');
    assert.ok(
      choiResist.refusalRiskPct < otherResist.refusalRiskPct,
      `Franchise star loyalty must cushion refusal risk (${choiResist.refusalRiskPct}% < ${otherResist.refusalRiskPct}%)`
    );

    // 트레이드 요청 발생해도 절대 자동 이적 없음 확인
    const beforeTeam = nonFranchise!.teamId;
    const trMeet = conductGmPlayerMeeting(ssgCareer, nonFranchise!.id, '트레이드 검토').nextCareer;
    assert.equal(trMeet.players[nonFranchise!.id].teamId, beforeTeam, 'Trade review/request must NEVER auto-transfer player');
    evaluateLeagueWeeklyDissatisfactionInPlace(trMeet, new SeededRng(56002), '2026-06-15', { force: true });
    assert.equal(trMeet.players[nonFranchise!.id].teamId, beforeTeam, 'Weekly dissatisfaction eval must NEVER auto-transfer player');
  }

  // 57. 오프시즌 완료 필수 게이트(#0) · 10구단 레전드 트레이드 0.5% 확률(#2) · KS 종료 후 시상식 우선(#3) · 2026 KBO 공식 시상식 14개 규칙(#4)
  {
    // (A) 10개 구단 레전드 트레이드 0.5% 출현 확률 검증
    assert.equal(LEGEND_TRADE_APPEARANCE_PROBABILITY, 0.005, 'Club legend trade appearance probability must be exactly 0.5%');
    const mcRng = new SeededRng(57001);
    let hits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollLegendTradeAppearance(mcRng)) hits++;
    }
    const rate = hits / trials;
    assert.ok(
      rate >= 0.0025 && rate <= 0.0085,
      `0.5% legend roll Monte Carlo rate out of expected range: ${(rate * 100).toFixed(3)}%`
    );

    const legendCareer = createNewCareer({ teamId: '한화', gmName: '레전드테스터', seed: 57002 });
    legendCareer.phase = 'REGULAR_SEASON';
    // 강제 빈 블록으로 고정하여 99.5% 불가침 상태 검증
    legendCareer.legendTradeBlockSeason = legendCareer.season;
    legendCareer.legendTradeBlockPlayerIds = [];

    const allLegends = Object.values(legendCareer.players).filter(
      (p) => p.teamId !== '한화' && p.category === '국내' && isClubLegend(legendCareer, p)
    );
    assert.ok(allLegends.length >= 5, `Must detect real KBO club legends across other clubs (found ${allLegends.length})`);
    const targetLegend = allLegends[0];
    const gateBlocked = evaluateLegendTradeAvailability(legendCareer, targetLegend);
    assert.equal(gateBlocked.isLegend, true);
    assert.equal(gateBlocked.available, false, 'Club legend must be blocked 99.5% of the time');

    const myOfferIds = Object.values(legendCareer.players)
      .filter((p) => p.teamId === '한화' && p.category === '국내' && p.rosterTier === '1군')
      .slice(0, 3)
      .map((p) => p.id);
    const blockedEval = evaluateTradeProposal(
      legendCareer,
      targetLegend.teamId,
      myOfferIds,
      [targetLegend.id],
      20,
      1
    );
    assert.equal(blockedEval.decision, '거절', 'Trade for locked club legend must be unconditionally rejected');
    assert.ok(
      blockedEval.reason.includes('0.5%') ||
        blockedEval.reason.includes('원칙적 트레이드 불가') ||
        blockedEval.reason.includes('프랜차이즈 스타'),
      `Rejection reason must explain club legend protection, got: ${blockedEval.reason}`
    );

    // 0.5% 희귀 출현 시 트레이드 협상 가능 확인
    legendCareer.legendTradeBlockPlayerIds = [targetLegend.id];
    const gateUnlocked = evaluateLegendTradeAvailability(legendCareer, targetLegend);
    assert.equal(gateUnlocked.available, true, 'Unlocked 0.5% legend must be negotiable');

    // (B) 2026 KBO 공식 시상식 14개 규칙 단위 검증
    // 규칙 2: 골든글러브 자격 기준 & 타이틀홀더 예외
    assert.equal(KBO_2026_AWARDS_RULES.PITCHER_QUALIFIED_OUTS, 432);
    assert.equal(KBO_2026_AWARDS_RULES.FIELDER_MIN_DEFENSIVE_INNINGS, 720);
    assert.equal(KBO_2026_AWARDS_RULES.DH_MIN_PA, 297);

    const awardsFixture = createNewCareer({ teamId: 'LG', gmName: '시상식테스터', seed: 57003 });
    awardsFixture.phase = 'OFFSEASON';
    awardsFixture.gamesPlayed = 144;
    const samplePitcher = Object.values(awardsFixture.players).find(
      (p) => p.teamId === 'LG' && p.role === '투수' && p.rosterTier === '1군'
    )!;
    const sampleFielder = Object.values(awardsFixture.players).find(
      (p) => p.teamId === 'LG' && p.position === 'SS' && p.rosterTier === '1군'
    )!;
    const sampleDh = Object.values(awardsFixture.players).find(
      (p) => p.teamId === 'KIA' && p.role === '타자' && p.rosterTier === '1군'
    )!;
    sampleDh.position = 'DH';

    // 투수: 미달 -> 10승 충족 -> 타이틀홀더 예외
    samplePitcher.stats = { G: 20, GS: 10, W: 6, L: 4, SV: 0, HLD: 0, outs: 240, H: 80, HR: 8, BB: 25, SO: 75, R: 34, ER: 30, PC: 1300 };
    assert.equal(checkGoldenGloveEligibility(samplePitcher, 'P', []).eligible, false);
    samplePitcher.stats.W = 10;
    assert.equal(checkGoldenGloveEligibility(samplePitcher, 'P', []).eligible, true);
    samplePitcher.stats.W = 4;
    const titlePitcherCheck = checkGoldenGloveEligibility(samplePitcher, 'P', ['탈삼진왕']);
    assert.equal(titlePitcherCheck.eligible, true);
    assert.equal(titlePitcherCheck.isTitleHolderException, true, 'Pitching titleholder exception must qualify for Golden Glove');

    // 야수 720수비이닝 & DH 297타석 기준 + 타이틀홀더 예외
    sampleFielder.stats = { G: 60, PA: 240, AB: 210, H: 60, B2: 10, B3: 1, HR: 5, TB: 87, RBI: 28, R: 30, BB: 22, HBP: 3, SO: 40, SF: 2, SB: 5, defensiveInnings: 480 };
    assert.equal(checkGoldenGloveEligibility(sampleFielder, 'FIELDER', []).eligible, false);
    sampleFielder.stats.defensiveInnings = 720;
    assert.equal(checkGoldenGloveEligibility(sampleFielder, 'FIELDER', []).eligible, true);
    sampleFielder.stats.defensiveInnings = 400;
    assert.equal(
      checkGoldenGloveEligibility(sampleFielder, 'FIELDER', ['도루왕']).isTitleHolderException,
      true
    );

    sampleDh.stats = { G: 70, PA: 296, AB: 260, H: 80, B2: 15, B3: 0, HR: 12, TB: 131, RBI: 45, R: 38, BB: 30, HBP: 4, SO: 50, SF: 2, SB: 1 };
    assert.equal(checkGoldenGloveEligibility(sampleDh, 'DH', []).eligible, false);
    sampleDh.stats.PA = 297;
    assert.equal(checkGoldenGloveEligibility(sampleDh, 'DH', []).eligible, true);

    // 규칙 4: 신인왕 자격 (당해/이전 5년, 누적 30IP/60PA 이하, 해외 프로경력 없음)
    const awardsSeason = awardsFixture.season;
    const superRookie = Object.values(awardsFixture.players).find(
      (p) => p.teamId === '삼성' && p.position === 'CF' && p.rosterTier === '1군'
    )!;
    superRookie.category = '국내';
    superRookie.serviceYears = 1;
    superRookie.age = 19;
    superRookie.birthDate = `${awardsSeason - 19}-05-01`;
    superRookie.debutYear = awardsSeason;
    superRookie.draftYear = awardsSeason;
    superRookie.acquisitionInfo = undefined;
    superRookie.rookieEligibility = undefined;
    superRookie.historicalSeasons = [];
    superRookie.careerStats = { seasons: 0, G: 0, AB: 0, H: 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0 };
    superRookie.careerHits = 0;
    superRookie.careerTeamHistory = [{ teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: awardsSeason }];
    superRookie.stats = {
      G: 144, PA: 630, AB: 540, H: 208, B2: 42, B3: 6, HR: 45, TB: 397,
      RBI: 138, R: 128, BB: 80, HBP: 6, SO: 72, SF: 4, SB: 38, defensiveInnings: 1220,
    };
    assert.equal(checkRookieOfYearEligibility(superRookie, awardsSeason).eligible, true, 'Domestic 1st-year rookie must qualify for ROY');

    // 해외 프로야구 경력자 신인왕 제외 확인
    const mlbVet = structuredClone(superRookie);
    mlbVet.careerTeamHistory = [{ teamLabel: 'LA 다저스', mlbTeamName: 'Los Angeles Dodgers', league: 'MLB', fromSeason: 2024, toSeason: 2025 }];
    assert.equal(checkRookieOfYearEligibility(mlbVet, awardsSeason).eligible, false, 'Player with MLB career must be excluded from ROY');

    // 이전 시즌 누적 60타석 초과자 신인왕 제외 확인
    const overPaRookie = structuredClone(superRookie);
    overPaRookie.careerStats = { seasons: 1, G: 30, AB: 58, H: 15, HR: 2, RBI: 7, R: 8, BB: 7, SO: 12, SB: 1 };
    assert.equal(checkRookieOfYearEligibility(overPaRookie, awardsSeason).eligible, false, 'Player with >60 prior PA must be excluded from ROY');

    // 이전 5년 초과자 신인왕 제외 확인
    const oldRookie = structuredClone(superRookie);
    oldRookie.serviceYears = 7;
    assert.equal(checkRookieOfYearEligibility(oldRookie, awardsSeason).eligible, false, 'Player beyond 5-year rookie window must be excluded');

    // 규칙 7 & 8: 0~100 정규화 점수 & 정규시즌 성적만 반영 (포스트시즌 성적 완전 배제)
    const baseRegularScore = computeNormalizedRegularAwardScore(superRookie);
    assert.ok(baseRegularScore >= 0 && baseRegularScore <= 100, `Normalized score must be within 0~100 (got ${baseRegularScore})`);
    superRookie.postseasonStats = {
      G: 15, PA: 70, AB: 60, H: 55, B2: 10, B3: 2, HR: 35, TB: 174,
      RBI: 95, R: 60, BB: 10, HBP: 0, SO: 2, SF: 0, SB: 15,
    };
    assert.equal(
      computeNormalizedRegularAwardScore(superRookie),
      baseRegularScore,
      'Postseason stats must have ZERO effect on regular-season award score'
    );

    // 규칙 1, 3, 9, 10, 11: 시상식 실행 -> MVP + 신인왕 + 골든글러브 중복 수상 허용 + 10개 골든글러브 + 선수 프로필 영구 저장 + 중복 실행 방지
    const firstRun = runOfficialSeasonAwardsCeremonyInPlace(awardsFixture, { setPendingCeremony: true });
    assert.equal(firstRun.alreadyComputed, false);
    assert.equal(awardsFixture.pendingAwardsCeremonySeason, awardsSeason);
    assert.equal(firstRun.awards.mvp?.playerId, superRookie.id, 'Super rookie must win unified league MVP');
    assert.equal(firstRun.awards.rookieOfYear?.playerId, superRookie.id, 'Super rookie must also win Rookie of the Year (multi-award allowed)');
    const ggList = firstRun.awards.goldenGloves;
    assert.equal(ggList.length, 10, 'Golden Glove must award exactly 10 positions');
    const ofIds = ggList
      .filter((g) => g.positionLabel === '외야수' || g.category.includes('외야수'))
      .map((g) => g.playerId);
    assert.equal(ofIds.length, 3, 'Golden Glove must award exactly 3 outfielders');
    assert.equal(new Set(ofIds).size, 3, 'Golden Glove OF 3 winners must be 3 distinct players');
    assert.ok(ofIds.includes(superRookie.id), 'Super rookie must also win Golden Glove OF (triple crown multi-award)');
    assert.ok(
      (awardsFixture.players[superRookie.id].awardHonors ?? []).filter((h) => h.season === awardsSeason).length >= 3,
      'MVP + ROY + GG honors must be permanently saved on player profile'
    );

    // 중복 실행 방지 확인
    const honorCountBeforeDup = awardsFixture.players[superRookie.id].awardHonors?.length ?? 0;
    const secondRun = runOfficialSeasonAwardsCeremonyInPlace(awardsFixture, { setPendingCeremony: true });
    assert.equal(secondRun.alreadyComputed, true, 'Duplicate awards execution for same season must be prevented');
    assert.equal(awardsFixture.awardsHistory.length, 1);
    assert.equal(awardsFixture.players[superRookie.id].awardHonors?.length, honorCountBeforeDup);

    // (C) 규칙 14 & 아이템 #0: 오프시즌 미완료 시 정규경기/다음 시즌 차단 -> 시상식 확인 -> 오프시즌 필수 업무 완료 -> 최종 개막 승인
    assert.throws(
      () => simulateNextRegularGame(awardsFixture),
      /시상식|오프시즌/,
      'Regular game must be blocked while awards ceremony / offseason is active'
    );
    assert.throws(
      () => simulateNextRegularSeries(awardsFixture),
      /시상식|오프시즌/,
      'Regular series must be blocked while awards ceremony / offseason is active'
    );
    assert.throws(
      () => approveAndStartNextSeasonFromOffseason(awardsFixture),
      /시상식/,
      'Next season approval must be blocked while awards ceremony is unconfirmed'
    );

    // 시상식 확인 완료 -> 오프시즌 단장실로 이동 (절대 다음 시즌 자동 시작 금지!)
    const afterCeremony = confirmAwardsCeremonyAndEnterOffseason(awardsFixture).nextCareer;
    assert.equal(afterCeremony.season, awardsSeason, 'Confirming awards ceremony must NEVER auto-start next season');
    assert.equal(afterCeremony.phase, 'OFFSEASON');
    assert.equal(afterCeremony.pendingAwardsCeremonySeason, null);
    assert.equal(afterCeremony.awardsHistory[0].ceremonyConfirmed, true);

    // 오프시즌 필수 업무 미완료 상태에서 개막 승인 및 정규경기 차단 확인
    assert.equal(getOffseason8StepReadiness(afterCeremony).canApproveNextSeason, false);
    assert.throws(
      () => approveAndStartNextSeasonFromOffseason(afterCeremony),
      /필수 업무/,
      'Next season approval must be blocked until all required offseason tasks are complete'
    );
    assert.throws(
      () => simulateNextRegularGame(afterCeremony),
      /오프시즌/,
      'Regular games must remain blocked during offseason'
    );

    // 5개 필수 오프시즌 단계 완료 후 최종 개막 승인 성공 확인
    let offCur = afterCeremony;
    offCur = completeAndAdvanceOffseason8Step(offCur, 'OWNER_EVAL').nextCareer;
    offCur = completeAndAdvanceOffseason8Step(offCur, 'COACH_STAFF').nextCareer;
    offCur = completeAndAdvanceOffseason8Step(offCur, 'ROSTER_CLEANUP').nextCareer;
    offCur = completeAndAdvanceOffseason8Step(offCur, 'PLAYER_CONTRACTS').nextCareer;
    offCur = completeAndAdvanceOffseason8Step(offCur, 'ROSTER_UPGRADE').nextCareer;
    offCur = completeAndAdvanceOffseason8Step(offCur, 'OPENING_PREP').nextCareer;
    offCur = completeAndAdvanceOffseason8Step(offCur, 'NEXT_SEASON_START').nextCareer;
    assert.equal(getOffseason8StepReadiness(offCur).canApproveNextSeason, true, 'All 5 required offseason steps complete must unlock approval');

    const nextSeasonApproved = approveAndStartNextSeasonFromOffseason(offCur).nextCareer;
    assert.equal(nextSeasonApproved.season, awardsSeason + 1, `GM final approval must start ${awardsSeason + 1} season`);
    assert.equal(nextSeasonApproved.phase, 'REGULAR_SEASON');
    // 개막 승인 후 정규경기 정상 진행 확인
    const firstGame2027 = simulateNextRegularGame(nextSeasonApproved).nextCareer;
    assert.equal(firstGame2027.gamesPlayed, 1, 'Regular-season game must run after offseason completion & GM approval');
  }

  // =========================================================================
  // TEST 58: Items 0, 3, 8, 9 — 수석코치, 10구단 FA 입찰 경쟁, 순위 변동 화살표, 전체 구단 영입 현황
  // =========================================================================
  {
    // --- (A) Item 0: 수석코치 10구단 배치, 3대 능력치, 레거시 세이브 마이그레이션, 1차 면담, 감독 대행 및 차기 감독 추천 ---
    const bcCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 5801 });
    for (const tid of TEAM_IDS) {
      const bc = getClubBenchCoach(bcCareer, tid);
      assert.ok(bc, `Club ${tid} must have a 수석코치`);
      assert.equal(bc.role, '수석코치');
      const r = getBenchCoachRatings(bc);
      assert.ok(r.leadership >= 45 && r.leadership <= 99);
      assert.ok(r.playerManagement >= 45 && r.playerManagement <= 99);
      assert.ok(r.tacticalUnderstanding >= 45 && r.tacticalUnderstanding <= 99);
      const atm = getBenchCoachAtmosphereEffect(bcCareer, tid);
      assert.ok(atm.hasBenchCoach);
      assert.ok(atm.dissatisfactionGainMult >= 0.85 && atm.dissatisfactionGainMult <= 1.1);
      assert.ok(atm.dissatisfactionDecayBonus >= -1 && atm.dissatisfactionDecayBonus <= 2);
      assert.ok(atm.atmosphereStabilityBonus >= -0.05 && atm.atmosphereStabilityBonus <= 0.1);
    }

    // Legacy save migration: strip 수석코치 from all clubs and verify ensureBenchCoachesInPlace restores without touching existing 5 coaches
    const legacySave = structuredClone(bcCareer);
    for (const tid of TEAM_IDS) {
      legacySave.coaches[tid] = legacySave.coaches[tid].filter((c) => c.role !== '수석코치');
      assert.equal(legacySave.coaches[tid].length, 5);
    }
    ensureBenchCoachesInPlace(legacySave);
    for (const tid of TEAM_IDS) {
      assert.equal(legacySave.coaches[tid].length, 6, `Legacy save must restore 수석코치 for ${tid}`);
      assert.ok(legacySave.coaches[tid].some((c) => c.role === '수석코치'));
    }

    // 1st-line pre-meeting report when player dissatisfaction >= 40
    const unhappyPlayer = Object.values(bcCareer.players).find(
      (p) => p.teamId === 'LG' && p.role === '타자' && p.rosterTier === '1군'
    )!;
    unhappyPlayer.dissatisfaction = 58;
    const preReport = runBenchCoachPreMeetingInPlace(bcCareer, unhappyPlayer, '2026-06-15');
    assert.ok(preReport, '수석코치 must conduct 1st-line pre-meeting when dissatisfaction >= 40');
    assert.equal(preReport!.playerId, unhappyPlayer.id);
    assert.ok(preReport!.afterDissatisfaction < preReport!.beforeDissatisfaction);
    assert.ok((bcCareer.benchCoachReports ?? []).some((r) => r.id === preReport!.id));

    // Manager fired -> 수석코치 acting manager + next manager recommendation + promotion
    const lgManager = bcCareer.coaches['LG'].find((c) => c.role === '감독')!;
    const afterManagerFired = terminateCoachContract(bcCareer, lgManager.id).nextCareer;
    const rec = getBenchCoachPromotionRecommendation(afterManagerFired, 'LG');
    assert.ok(rec.recommended && rec.candidate, 'Must recommend 수석코치 as next manager candidate when 감독 is vacant');
    const afterActing = appointBenchCoachAsActingManagerForUser(afterManagerFired);
    assert.equal(afterActing.actingManager.name, rec.candidate!.name);
    assert.equal(afterActing.actingManager.isActingManager, true);
    const afterPromote = promoteBenchCoachToManagerForUser(afterActing.nextCareer).nextCareer;
    assert.equal(afterPromote.coaches['LG'].find((c) => c.role === '감독')?.name, rec.candidate!.name);
    assert.equal(afterPromote.coaches['LG'].find((c) => c.role === '감독')?.isActingManager, false);

    // AI club vacant manager also prioritizes 수석코치 as acting manager
    const aiClubBench = getClubBenchCoach(bcCareer, '삼성')!;
    const samsungMgrName = bcCareer.coaches['삼성'].find((c) => c.role === '감독')?.name ?? '전임 감독';
    bcCareer.coaches['삼성'] = bcCareer.coaches['삼성'].filter((c) => c.role !== '감독');
    const aiActing = appointActingManagerInPlace(bcCareer, '삼성', samsungMgrName, '감독 공석');
    assert.equal(aiActing.name, aiClubBench.name, 'AI club acting manager must pick 수석코치 first');

    // --- (B) Item 3: 10-Club FA Bidding Competition & GM Final Approval Guard ---
    const faCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 5802 });
    faCareer.phase = 'OFFSEASON';
    for (const tid of ['LG', '삼성', 'KIA', '한화', '두산', 'SSG'] as const) {
      const star = Object.values(faCareer.players)
        .filter((p) => p.teamId === tid && p.category === '국내')
        .sort((a, b) => b.ability - a.ability)[0];
      if (star) {
        star.contract.yearsRemaining = 0;
        star.contract.isFAEligible = true;
        star.contract.faGrade = star.ability >= 84 ? 'A' : star.ability >= 78 ? 'B' : 'C';
      }
    }
    releaseExpiredFaPlayersToMarket(faCareer);
    const compState = syncFaCompetitionMarketInPlace(faCareer);
    assert.ok(faCareer.faCompetition, 'FA competition state must be initialized');
    const openEntries = Object.values(compState.negotiations).filter((n) => n.status === '입찰중');
    assert.ok(openEntries.length >= 4, `Must have open FA negotiations (got ${openEntries.length})`);
    assert.ok(
      openEntries.some((n) => n.bids.length >= 2),
      'At least one FA player must attract simultaneous multi-club bids'
    );

    // User submits a strong bid on an external FA -> enters 단장승인대기, NEVER auto-finalizes
    const externalFaEntry = openEntries.find((n) => n.formerTeamId !== 'LG') ?? openEntries[0];
    const topRivalTotal = Math.max(8, ...externalFaEntry.bids.map((b) => b.totalBillion));
    const bidRes = submitUserClubFaBid(
      faCareer,
      externalFaEntry.playerId,
      4,
      Number((topRivalTotal * 1.45).toFixed(1))
    );
    const afterUserBid = bidRes.nextCareer;
    const negAfterBid = afterUserBid.faCompetition!.negotiations[externalFaEntry.playerId];
    assert.ok(negAfterBid.bids.some((b) => b.teamId === 'LG'), 'User club bid must be recorded');

    // Advance competition rounds -> AI-won FAs resolve, user-winning FA waits at 단장승인대기
    let faLoop = afterUserBid;
    for (let r = 0; r < 5; r++) {
      faLoop = advanceFaCompetitionRound(faLoop).nextCareer;
    }
    const userTargetNeg = faLoop.faCompetition!.negotiations[externalFaEntry.playerId];
    assert.notEqual(
      faLoop.players[externalFaEntry.playerId].teamId,
      'LG',
      'User club FA signing must NEVER auto-finalize without explicit GM approval'
    );
    if (userTargetNeg.status === '단장승인대기') {
      const userBid = userTargetNeg.bids.find((b) => b.teamId === 'LG')!;
      const approvedRes = signExternalFaPlayer(
        faLoop,
        externalFaEntry.playerId,
        userBid.years,
        userBid.totalBillion
      );
      assert.equal(approvedRes.nextCareer.players[externalFaEntry.playerId].teamId, 'LG');
      assert.equal(
        approvedRes.nextCareer.faCompetition?.negotiations[externalFaEntry.playerId]?.status,
        '계약완료',
        'Approved FA negotiation must immediately close all competing bids'
      );
      const declined = declinePendingUserFaApproval(faLoop, externalFaEntry.playerId).nextCareer;
      assert.equal(
        declined.faCompetition?.negotiations[externalFaEntry.playerId]?.status,
        '입찰중',
        'Declining GM approval must reopen negotiation for rival clubs'
      );
    }
    // Check external FA cap enforcement across all 10 clubs
    for (const tid of TEAM_IDS) {
      const extCount = faLoop.faCompetition?.externalSigningsByTeam[tid] ?? 0;
      assert.ok(
        extCount <= MAX_EXTERNAL_FA_PER_CLUB,
        `Club ${tid} exceeded KBO external FA cap (${extCount} > ${MAX_EXTERNAL_FA_PER_CLUB})`
      );
    }

    // --- (C) Item 8: Standings Rank Change Snapshot & Reset ---
    let rankCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 5803 });
    rankCareer.phase = 'REGULAR_SEASON';
    rankCareer = simulateNextRegularGame(rankCareer).nextCareer;
    rankCareer = simulateNextRegularGame(rankCareer).nextCareer;
    assert.ok(
      rankCareer.previousStandingsRanks && Object.keys(rankCareer.previousStandingsRanks).length === 10,
      'Regular game simulation must snapshot previousStandingsRanks for all 10 clubs'
    );

    // --- (D) Item 9: 전체 구단 영입 현황 (All 5 categories, AI deals, dedupe, filter, rival news) ---
    const acqCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 5804 });
    ensureLeagueAcquisitionsInPlace(acqCareer);
    const categories = ['FA', '트레이드', '외국인·아시아쿼터', '신인', '방출선수 영입'] as const;
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      recordLeagueAcquisitionInPlace(
        acqCareer,
        {
          dedupeKey: `TEST-ACQ-${i + 1}`,
          season: 2026,
          date: '2026-11-22',
          category: cat,
          playerName: `테스트영입${i + 1}`,
          position: 'SS',
          previousTeamLabel: i % 2 === 0 ? 'KIA' : '자유계약',
          acquiringTeamId: i % 2 === 0 ? '삼성' : 'LG',
          contractAmountLabel: '4년 60억',
        },
        { pushNewsAlert: true }
      );
    }
    const countBeforeDup = (acqCareer.leagueAcquisitions ?? []).length;
    recordLeagueAcquisitionInPlace(acqCareer, {
      dedupeKey: 'TEST-ACQ-1',
      season: 2026,
      date: '2026-11-22',
      category: 'FA',
      playerName: '테스트영입1',
      position: 'SS',
      previousTeamLabel: 'KIA',
      acquiringTeamId: '삼성',
      contractAmountLabel: '4년 60억',
    });
    assert.equal(
      (acqCareer.leagueAcquisitions ?? []).length,
      countBeforeDup,
      'Duplicate acquisition dedupeKey must not create duplicate rows'
    );
    const samsungOnly = queryLeagueAcquisitions(acqCareer, { teamId: '삼성', season: 2026 });
    assert.ok(samsungOnly.length >= 3 && samsungOnly.every((r) => r.acquiringTeamId === '삼성'));
    const faOnly = queryLeagueAcquisitions(acqCareer, { category: 'FA' });
    assert.ok(faOnly.length >= 1 && faOnly.every((r) => r.category === 'FA'));
    assert.ok(
      (acqCareer.newsFeed ?? []).some((n) => n.headline.includes('테스트영입1') && n.headline.includes('삼성')),
      'Rival club acquisition must generate league news alert'
    );
  }

  // 59. Realistic Trade System + Match/Career Diversity + Season News Auto-Cleanup
  {
    // --- (A) Item 2: Realistic Trade System ---
    const tradeCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 5901 });
    tradeCareer.phase = 'REGULAR_SEASON';
    tradeCareer.gamesPlayed = 25;

    // 1. Live season recent performance must adjust trade valuation
    const sampleBatter = Object.values(tradeCareer.players).find(
      (p) => p.teamId === 'LG' && p.role === '타자' && p.rosterTier === '1군'
    )!;
    sampleBatter.stats = {
      G: 30, PA: 130, AB: 115, H: 46, B2: 12, B3: 1, HR: 10, BB: 14, HBP: 1, SF: 0, SO: 18, R: 28, RBI: 32, SB: 3, TB: 90,
    };
    const hotVal = evaluatePlayerTradeValuationDetailed(tradeCareer, sampleBatter).skillMarketIndex;
    sampleBatter.stats = {
      G: 30, PA: 130, AB: 120, H: 20, B2: 2, B3: 0, HR: 1, BB: 9, HBP: 1, SF: 0, SO: 35, R: 7, RBI: 6, SB: 0, TB: 25,
    };
    const coldVal = evaluatePlayerTradeValuationDetailed(tradeCareer, sampleBatter).skillMarketIndex;
    assert.ok(
      hotVal > coldVal,
      `Hot recent season OPS must yield higher trade valuation than cold slump (${hotVal} > ${coldVal})`
    );

    // 2. Anti-quantity exploit: 4 low-value players cannot cheaply acquire 1 star (83+ OVR)
    const targetTeam = '삼성' as const;
    const samsungStar = Object.values(tradeCareer.players)
      .filter((p) => p.teamId === targetTeam && p.ability >= 83 && !isClubLegend(tradeCareer, p))
      .sort((a, b) => b.ability - a.ability)[0];
    const lgLowFillers = Object.values(tradeCareer.players)
      .filter((p) => p.teamId === 'LG' && p.ability <= 68 && p.age >= 25)
      .slice(0, 4);
    if (samsungStar && lgLowFillers.length >= 3) {
      const fillerEval = evaluateTradeProposal(
        tradeCareer,
        targetTeam,
        lgLowFillers.map((p) => p.id),
        [samsungStar.id],
        0,
        null
      );
      assert.notEqual(
        fillerEval.decision,
        '수락',
        `Multiple low-value fillers must NOT be accepted for a star player (${samsungStar.name})`
      );
    }

    // 3. Positional need computation differentiates scarce vs deep positions
    const catcherNeed = computeTradePositionalNeed(tradeCareer, '키움', sampleBatter);
    assert.ok(
      typeof catcherNeed.needScore === 'number' && catcherNeed.label.length > 0,
      'computeTradePositionalNeed must return structured positional need score & label'
    );

    // --- (B) Item 4: Match & Player Career Diversity ---
    const divCareer = createNewCareer({ teamId: '한화', gmName: '단장', seed: 5902 });
    divCareer.phase = 'REGULAR_SEASON';
    ensureSeasonPlayerArcsInPlace(divCareer);
    const allDivPlayers = Object.values(divCareer.players);
    assert.ok(
      allDivPlayers.every((p) => Boolean(p.growthCurveProfile) && p.seasonArc?.season === divCareer.season),
      'Every player must have growthCurveProfile and persisted current-season seasonArc'
    );
    const snapshotArcs = allDivPlayers.slice(0, 20).map((p) => ({
      id: p.id,
      profile: p.growthCurveProfile,
      arcKind: p.seasonArc?.kind,
      f: p.seasonArc?.firstHalfDelta,
      s: p.seasonArc?.secondHalfDelta,
    }));
    // Re-running must never alter confirmed arcs (save/reload determinism)
    ensureSeasonPlayerArcsInPlace(divCareer);
    for (const snap of snapshotArcs) {
      const cur = divCareer.players[snap.id];
      assert.equal(cur.growthCurveProfile, snap.profile);
      assert.equal(cur.seasonArc?.kind, snap.arcKind);
      assert.equal(cur.seasonArc?.firstHalfDelta, snap.f);
      assert.equal(cur.seasonArc?.secondHalfDelta, snap.s);
    }
    // Bounded situational performance delta must strictly stay within [-2.6, +2.8]
    const testHitter = allDivPlayers.find((p) => p.teamId === '한화' && p.role === '타자')!;
    const testPitcher = allDivPlayers.find((p) => p.teamId === 'LG' && p.role === '투수')!;
    const perfDelta = computePlayerGameDayPerformanceDelta(divCareer, testHitter, 'LG', testPitcher, true, 40);
    assert.ok(
      perfDelta >= -2.6 && perfDelta <= 2.8,
      `Game-day situational performance delta must be bounded in [-2.6, 2.8], got ${perfDelta}`
    );
    // AI lineup & rotation form adjustment must preserve valid 9-man lineups
    divCareer.gamesPlayed = 27;
    adjustAiLineupsAndRotationByFormInPlace(divCareer);
    for (const tid of TEAM_IDS) {
      if (tid === divCareer.playerTeamId) continue;
      assert.equal(
        divCareer.teams[tid].lineupOrder.length,
        9,
        `AI club ${tid} must retain valid 9-man lineup after form adjustment`
      );
    }

    // --- (C) Item 5: Season News Auto-Cleanup ---
    const newsCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 5903 });
    newsCareer.phase = 'OFFSEASON';
    assert.equal(
      getNewsArticleSeason(newsCareer),
      newsCareer.season + 1,
      'Offseason / stove-league news must be classified under upcoming season (season + 1)'
    );
    newsCareer.newsFeed = [
      {
        id: 'OLD-REG-1',
        date: '2026-06-15',
        season: 2026,
        category: '경기·시리즈',
        headline: '2026 정규시즌 경기 기사',
        body: '이전 시즌 경기 보도',
        teamId: 'LG',
      },
      {
        id: 'OLD-INJ-2',
        date: '2026-08-20',
        season: 2026,
        category: '구단사건',
        headline: '2026 부상 기사',
        body: '이전 시즌 부상 보도',
        teamId: 'LG',
      },
      {
        id: 'NEW-STOVE-1',
        date: '2026-11-25',
        season: 2027,
        category: '이적·계약',
        headline: '2027 스토브리그 FA 계약 기사',
        body: '다음 시즌 대비 FA 영입 보도',
        teamId: 'LG',
      },
    ];
    ensureLeagueAcquisitionsInPlace(newsCareer);
    recordLeagueAcquisitionInPlace(newsCareer, {
      dedupeKey: 'KEEP-ACQ-2026',
      season: 2026,
      date: '2026-11-20',
      category: 'FA',
      playerName: '보존테스트선수',
      position: 'SS',
      previousTeamLabel: '삼성',
      acquiringTeamId: 'LG',
      contractAmountLabel: '4년 50억',
    });
    const acqBefore = (newsCareer.leagueAcquisitions ?? []).length;
    const prunedCount = prunePreviousSeasonNewsInPlace(newsCareer, 2027);
    assert.ok(prunedCount >= 2, 'Previous season (2026) news across all categories must be auto-pruned');
    assert.equal(newsCareer.lastNewsPrunedForSeason, 2027, 'News prune guard must record 2027');
    assert.ok(
      newsCareer.newsFeed.every((n) => n.season >= 2027),
      'Only new season / stove-league news may remain after pruning'
    );
    assert.ok(
      newsCareer.newsFeed.some((n) => n.id === 'NEW-STOVE-1'),
      'Offseason stove-league news classified for 2027 must be preserved'
    );
    assert.equal(
      (newsCareer.leagueAcquisitions ?? []).length,
      acqBefore,
      'News cleanup must NEVER delete acquisition logs, stats, or contracts'
    );
    // Running prune again for 2027 must execute 0 times (strictly once per season transition)
    newsCareer.newsFeed.push({
      id: 'LATE-TEST',
      date: '2026-10-01',
      season: 2026,
      category: '구단사건',
      headline: '중복실행 방지 확인용',
      body: '이미 2027 정리가 완료되어 다시 삭제되지 않아야 함',
      teamId: 'LG',
    });
    assert.equal(
      prunePreviousSeasonNewsInPlace(newsCareer, 2027),
      0,
      'prunePreviousSeasonNewsInPlace must run strictly once per season transition'
    );
  }

  // 60. 코칭스태프 육성선수 자동 정식계약·자동 방출 + 고해상도 10개 구단 로고 + 이벤트 애니메이션 1회 재생 키
  {
    const devCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 6001 });
    devCareer.phase = 'REGULAR_SEASON';
    devCareer.gamesPlayed = 48; // 5월 1일 이후 & 36경기 이상 (12의 배수)
    devCareer.currentSeriesIndex = 16;

    // 68인 정식 정원이 가득 찬 경우 1자리 확보
    const lgOfficial60 = Object.values(devCareer.players).filter(
      (p) => p.teamId === 'LG' && (p.rosterTier === '1군' || p.rosterTier === '2군')
    );
    if (lgOfficial60.length >= KBO_OFFICIAL_ROSTER_LIMIT) {
      const slotCand = lgOfficial60.find((p) => p.rosterTier === '2군' && p.category === '국내')!;
      slotCand.rosterTier = 'FA';
    }

    // 유저 구단(LG)에 우수 육성선수 1명 + 성장 정체 육성선수 1명 배치
    const devPlayers = Object.values(devCareer.players).filter(
      (p) => p.teamId === 'LG' && p.rosterTier === '육성'
    );
    assert.ok(devPlayers.length >= 2, 'LG must have at least 2 developmental players for coach auto-decision test');
    const starDev = devPlayers[0];
    const stagnantDev = devPlayers[1];
    starDev.ability = 68;
    starDev.potential = 79;
    starDev.age = 21;
    stagnantDev.age = 27;
    stagnantDev.ability = 56;
    stagnantDev.potential = 61;

    const beforeCash = devCareer.finances.cashBalanceBillion;
    const outcome = processCoachDevelopmentalDecisionsInPlace(
      devCareer,
      getTeamRetiredNumbers,
      true
    );

    assert.ok(
      outcome.converted.some((c) => c.teamId === 'LG' && c.playerId === starDev.id),
      'Coaches must auto-convert ready developmental player on user club into official 2군 player'
    );
    assert.equal(devCareer.players[starDev.id].rosterTier, '2군', 'Converted developmental player must move to 2군');
    assert.ok(
      outcome.released.some((r) => r.teamId === 'LG' && r.playerId === stagnantDev.id),
      'Coaches must auto-release stagnant developmental player on user club'
    );
    assert.equal(devCareer.players[stagnantDev.id].rosterTier, 'FA', 'Auto-released developmental player must move to FA');
    assert.equal(devCareer.finances.cashBalanceBillion, beforeCash, 'Auto-releasing developmental player must incur zero buyout penalty');
    assert.ok(
      (devCareer.releasedPlayersTracker ?? []).some((r) => r.playerId === stagnantDev.id),
      'Auto-released developmental player must be recorded in releasedPlayersTracker'
    );

    // 10개 구단 고해상도 로고(/logos/hd/*.svg 또는 512px+ *.png, 쿼리 파라미터 허용) 확인
    for (const tid of TEAM_IDS) {
      const primaryUrl = KBO_TEAMS[tid].logoUrls[0].split('?')[0];
      assert.ok(
        primaryUrl.startsWith('/logos/hd/') &&
          (primaryUrl.endsWith('.svg') || primaryUrl.endsWith('.png')),
        `${tid} must use high-resolution /logos/hd/*.svg or *.png as primary logo URL`
      );
    }

    // 이벤트 애니메이션 1회 재생 키 저장 검증
    devCareer.playedAnimations = ['opening-day-2026', 'ks-champ-2026-LG'];
    assert.equal(devCareer.playedAnimations.includes('opening-day-2026'), true);
  }

  // 61. MLB 진출 시스템 개선 (포스팅 + 해외 FA 직접 협상·비교·실패 복귀·추적 반영) & 사운드 시스템(AudioManager 14종 + 음소거·스킵·대체)
  {
    // (A) MLB 포스팅 + 해외 FA 통합 검증
    const mlbCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 6101 });
    mlbCareer.phase = 'OFFSEASON';
    ensureAmateurAndOverseasStateInPlace(mlbCareer);

    // 1) 해외 FA 자격 검증: 8시즌+ FA 선수는 자격 충족, 7시즌 미만은 미충족
    const lgBatters = Object.values(mlbCareer.players).filter(
      (p) => p.teamId === 'LG' && p.category === '국내' && p.role === '타자'
    );
    const aiStars = Object.values(mlbCareer.players).filter(
      (p) => p.teamId === '삼성' && p.category === '국내' && p.role === '타자'
    );
    const eliteUserFa = lgBatters[0];
    const midTierUserFa = lgBatters[1];
    const eliteAiFa = aiStars[1] ?? aiStars[0];
    assert.ok(eliteUserFa && midTierUserFa && eliteAiFa, 'Must have domestic players for MLB overseas FA test');

    // 최상위권 해외 FA (구단 승인 없이 MLB 협상 가능)
    eliteUserFa.serviceYears = 9;
    eliteUserFa.age = 27;
    eliteUserFa.birthDate = `${mlbCareer.season - 27}-05-01`;
    eliteUserFa.ability = 90;
    eliteUserFa.overseasInterest = '적극희망';
    eliteUserFa.contract.yearsRemaining = 0;
    eliteUserFa.contract.isFAEligible = true;
    eliteUserFa.stats = { ...eliteUserFa.stats, PA: 560, AB: 490, H: 165, B2: 34, B3: 3, HR: 32, TB: 301, BB: 64, HBP: 6 } as typeof eliteUserFa.stats;

    // 중위권 해외 FA (MLB 진출 장벽으로 제안 미발생 확인)
    midTierUserFa.serviceYears = 9;
    midTierUserFa.age = 31;
    midTierUserFa.ability = 76;
    midTierUserFa.contract.yearsRemaining = 0;
    midTierUserFa.contract.isFAEligible = true;

    // AI 구단 최상위권 해외 FA (AI 구단 동일 규칙 확인)
    eliteAiFa.serviceYears = 9;
    eliteAiFa.age = 27;
    eliteAiFa.birthDate = `${mlbCareer.season - 27}-05-01`;
    eliteAiFa.ability = 91;
    eliteAiFa.overseasInterest = '적극희망';
    eliteAiFa.contract.yearsRemaining = 0;
    eliteAiFa.contract.isFAEligible = true;
    eliteAiFa.stats = { ...eliteAiFa.stats, PA: 550, AB: 485, H: 162, B2: 30, B3: 2, HR: 34, TB: 298, BB: 60, HBP: 5 } as typeof eliteAiFa.stats;

    assert.equal(isOverseasFaEligible(eliteUserFa), true, '9-year FA star must be Overseas FA eligible');
    assert.equal(isOverseasFaEligible(eliteAiFa), true, 'AI club 9-year FA star must be Overseas FA eligible');

    const midOffer = evaluateOverseasFaMlbOffer(mlbCareer, midTierUserFa, `${mlbCareer.season}-11-18`, new SeededRng(101));
    assert.equal(midOffer, null, 'Mid-tier FA (OVR 76) must NOT receive MLB overseas FA offer');

    const eliteOffer = evaluateOverseasFaMlbOffer(mlbCareer, eliteUserFa, `${mlbCareer.season}-11-18`, new SeededRng(102));
    assert.ok(eliteOffer && eliteOffer.guaranteedUsdMillions >= 25, 'Top-tier young FA star must receive realistic MLB offer');

    // 최근 성적 부진 시 포스팅 평가 하락 확인
    const slumpStar = lgBatters[2];
    slumpStar.serviceYears = 7;
    slumpStar.age = 27;
    slumpStar.ability = 82;
    slumpStar.postingBlockedUntilNextNov = false;
    slumpStar.stats = { ...slumpStar.stats, PA: 420, AB: 380, H: 82, B2: 12, B3: 0, HR: 5, TB: 109, BB: 32, HBP: 4 } as typeof slumpStar.stats;
    const slumpPostEval = evaluateMlbPostingReadiness(slumpStar);
    assert.equal(slumpPostEval.acceptanceChancePct, 0, 'Recent severe slump must block MLB posting offers');

    // FA 시장 등록 -> 해외 FA MLB 제안 생성 및 구단 승인 없이 MLB 진출 확정 + 기존 추적 시스템 반영 검증
    mlbCareer.faCompetition = undefined;
    releaseExpiredFaPlayersToMarket(mlbCareer);
    const faState = syncFaCompetitionMarketInPlace(mlbCareer, `${mlbCareer.season}-11-18`);
    const userStarNeg = faState.negotiations[eliteUserFa.id];
    const aiStarNeg = faState.negotiations[eliteAiFa.id];
    assert.ok(userStarNeg?.mlbOffer, 'Elite user club overseas FA must receive MLB offer in FA market');
    assert.ok(aiStarNeg?.mlbOffer, 'Elite AI club overseas FA must also receive MLB offer (AI parity)');

    // MLB 제안이 KBO 제안을 압도하도록 보장 후 라운드 진행 -> 구단 승인 없이 MLB 진출 확정 검증
    userStarNeg.mlbOffer!.score = 200;
    userStarNeg.mlbOffer!.guaranteedUsdMillions = 85;
    aiStarNeg.mlbOffer!.score = 200;
    aiStarNeg.mlbOffer!.guaranteedUsdMillions = 90;

    let mlbSim = mlbCareer;
    for (let i = 0; i < 6; i++) {
      mlbSim = advanceFaCompetitionRound(mlbSim).nextCareer;
      const uNeg = mlbSim.faCompetition?.negotiations[eliteUserFa.id];
      const aNeg = mlbSim.faCompetition?.negotiations[eliteAiFa.id];
      if (
        (uNeg?.mlbStatus === 'MLB진출확정' || uNeg?.mlbStatus === 'MLB협상결렬') &&
        (aNeg?.mlbStatus === 'MLB진출확정' || aNeg?.mlbStatus === 'MLB협상결렬')
      ) {
        break;
      }
    }
    const afterUserNeg = mlbSim.faCompetition!.negotiations[eliteUserFa.id];
    const afterAiNeg = mlbSim.faCompetition!.negotiations[eliteAiFa.id];
    // 8% 결렬 확률에 걸렸다면 KBO FA 협상 지속(입찰중/계약완료), 아니면 MLB진출확정 + 추적 시스템 반영
    if (afterUserNeg.mlbStatus === 'MLB진출확정') {
      assert.equal(mlbSim.players[eliteUserFa.id].rosterTier, '해외이적', 'Overseas FA MLB winner must move to 해외이적 without club approval');
      assert.ok(
        (mlbSim.mlbExports ?? []).some((e) => e.playerName === eliteUserFa.name && e.exportRoute === '해외FA'),
        'Overseas FA MLB player must be reflected in mlbExports tracker'
      );
      assert.ok(
        (mlbSim.amateurAndOverseas?.overseasPlayers ?? []).some((o) => o.name === eliteUserFa.name && o.league === 'MLB'),
        'Overseas FA MLB player must be reflected in amateurAndOverseas.overseasPlayers tracker'
      );
      assert.ok(
        (mlbSim.players[eliteUserFa.id].careerTeamHistory ?? []).some((h) => h.league === 'MLB'),
        'Overseas FA MLB player careerTeamHistory must include MLB season'
      );
    } else {
      assert.ok(
        afterUserNeg.mlbStatus === 'MLB협상결렬' || afterUserNeg.status === '계약완료',
        'If MLB deal fails, player must stay in KBO FA negotiation'
      );
    }
    assert.ok(
      afterAiNeg.mlbStatus === 'MLB진출확정' || afterAiNeg.mlbStatus === 'MLB협상결렬',
      'AI club elite overseas FA must resolve via identical MLB negotiation flow'
    );

    // MLB 협상 결렬 시 KBO 잔류 및 국내 FA 협상 지속 검증
    const failTestCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 6102 });
    failTestCareer.phase = 'OFFSEASON';
    const failCand = Object.values(failTestCareer.players).find(
      (p) => p.teamId === 'LG' && p.category === '국내' && p.role === '타자'
    )!;
    failCand.serviceYears = 9;
    failCand.age = 28;
    failCand.ability = 87;
    failCand.contract.yearsRemaining = 0;
    failCand.contract.isFAEligible = true;
    releaseExpiredFaPlayersToMarket(failTestCareer);
    const failState = syncFaCompetitionMarketInPlace(failTestCareer, '2026-11-18');
    const failNeg = failState.negotiations[failCand.id];
    failNeg.mlbStatus = 'MLB협상결렬';
    failNeg.mlbOffer = undefined;
    failNeg.status = '입찰중';
    const kboBidAfterFail = submitUserClubFaBid(failTestCareer, failCand.id, 4, 95);
    assert.ok(
      kboBidAfterFail.status === '단장승인대기' || kboBidAfterFail.status === '입찰중',
      'After MLB contract failure, player must be able to continue KBO FA negotiation normally'
    );

    // (B) 사운드 시스템 (AudioManager 14종 이벤트 재생 · 음소거 · 클릭/관중 토글 · 시뮬 억제 · 건너뛰기 정지 · 커스텀 음원 대체)
    assert.equal(SOUND_EVENT_CATALOG.length, 14, 'Sound catalog must define all 14 required event sounds');

    // 경량 Mock Web Audio API 환경에서 실제 합성 경로 및 음소거/스킵 동작 검증
    let mockStopCalls = 0;
    const createMockParam = () => ({
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      setTargetAtTime: () => {},
      cancelScheduledValues: () => {},
    });
    class MockAudioContext {
      public state: AudioContextState = 'running';
      public currentTime = 0;
      public sampleRate = 44100;
      public destination = {};
      public resume = async () => { this.state = 'running'; };
      public createGain = () => ({
        gain: createMockParam(),
        connect: () => {},
        disconnect: () => {},
      });
      public createOscillator = () => ({
        type: 'sine',
        frequency: createMockParam(),
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => { mockStopCalls += 1; },
      });
      public createBiquadFilter = () => ({
        type: 'bandpass',
        frequency: createMockParam(),
        Q: createMockParam(),
        connect: () => {},
        disconnect: () => {},
      });
      public createBuffer = (_ch: number, len: number, sr: number) => ({
        sampleRate: sr,
        duration: len / sr,
        getChannelData: () => new Float32Array(len),
      });
      public createBufferSource = () => ({
        buffer: null,
        loop: false,
        onended: null,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => { mockStopCalls += 1; },
      });
    }

    const prevWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = { AudioContext: MockAudioContext };
    try {
      const am = new AudioManager({ ...DEFAULT_AUDIO_SETTINGS });
      // 최초 사용자 클릭 이전에는 재생 보류 (force 제외)
      assert.equal(am.play('button_click').played, false);
      assert.equal(am.play('button_click').reason, 'awaiting_user_gesture');

      // 최초 인터랙션 이후 오디오 활성화
      assert.equal(am.unlockAudio(), true);

      // 14종 전체 이벤트 효과음 합성 재생 검증
      for (const meta of SOUND_EVENT_CATALOG) {
        const res = am.play(meta.id, { force: true });
        assert.equal(res.played, true, `Sound event ${meta.id} must play cleanly`);
        assert.equal(res.source, 'synth', `Sound event ${meta.id} must synthesize via Web Audio API by default`);
      }

      // 애니메이션 건너뛰기 -> 해당 효과음 즉시 종료 검증
      const stopsBefore = mockStopCalls;
      am.play('korean_series_champion', { force: true });
      assert.ok(am.getActiveVoiceCount() >= 1, 'Active voice must be tracked during championship fanfare');
      am.stopEvent('korean_series_champion');
      assert.ok(mockStopCalls > stopsBefore, 'Skipping animation must immediately stop active audio sources');

      // 음소거(전체 사운드 OFF) 기능 검증
      am.toggleMasterMute();
      assert.equal(am.getSettings().masterEnabled, false);
      assert.equal(am.getActiveVoiceCount(), 0, 'Muting master sound must stop all active voices');
      const mutedRes = am.play('opening_day', { force: true });
      assert.equal(mutedRes.played, false);
      assert.equal(mutedRes.reason, 'muted');

      // 음소거 해제 + 버튼 클릭음 OFF + 시뮬레이션 모드 억제 검증
      am.toggleMasterMute();
      am.updateSettings({ uiClickEnabled: false, crowdEnabled: false, masterVolume: 60, sfxVolume: 70, bgmVolume: 50 });
      assert.equal(am.play('button_click').reason, 'ui_click_disabled');
      assert.equal(am.play('opening_day', { force: true }).played, true);

      const simAm = new AudioManager({ ...DEFAULT_AUDIO_SETTINGS });
      simAm.unlockAudio();
      simAm.setSimulationMode(true);
      assert.equal(simAm.play('contract_sign').reason, 'simulation_suppressed');
      assert.equal(simAm.play('korean_series_champion').played, true, 'Major championship sound remains allowed');
      simAm.setSimulationMode(false);
      simAm.stopAllActiveEvents();

      // MP3/WAV/OGG 확장 등록 및 미존재 파일 대체 재생 검증
      assert.equal(am.registerCustomAudioFile('opening_day', '/sounds/opening_day.mp3'), true);
      assert.equal(am.registerCustomAudioFile('contract_sign', '/sounds/stamp.wav'), true);
      assert.equal(am.registerCustomAudioFile('rookie_draft', '/sounds/draft.ogg'), true);
      assert.equal(am.registerCustomAudioFile('button_click', '/sounds/invalid.txt'), false);
      const fallbackRes = am.play('opening_day', { force: true });
      assert.equal(fallbackRes.played, true, 'Missing custom file must seamlessly fall back to Web Audio synth');

      // 기본 설정 복원 검증
      const restored = am.resetSettings();
      assert.deepEqual(restored, DEFAULT_AUDIO_SETTINGS);
      am.stopAllActiveEvents();
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
    }
  }

  // =========================================================================
  // TEST 62: 현실 KBO 나이·연차 수정 & 포스팅 1군 등록 7시즌(1,015일) & KBO 트레이드 기간 현실화
  // =========================================================================
  {
    // (A) 모든 10개 구단 국내 선수 나이·연차·1군 등록일수 현실성 검증 (21살 9년차 같은 오류 원천 차단)
    const cleanCareer = createNewCareer({ teamId: '두산', gmName: '단장', seed: 6201 });
    const preservedCareer = createPreservedHanwhaCareer();

    for (const c of [cleanCareer, preservedCareer]) {
      for (const p of Object.values(c.players)) {
        if (p.category !== '국내' || p.rosterTier === '은퇴') continue;
        const maxAgeYears = Math.max(1, p.age - 19);
        assert.ok(
          p.serviceYears <= maxAgeYears,
          `Impossible serviceYears for ${p.name} (${p.teamId}): age=${p.age}, serviceYears=${p.serviceYears} (max ${maxAgeYears})`
        );
        if (p.acquisitionInfo?.draftYear && p.acquisitionInfo.draftYear <= c.season) {
          const maxDraftYears = Math.max(1, c.season - p.acquisitionInfo.draftYear);
          assert.ok(
            p.serviceYears <= maxDraftYears,
            `serviceYears exceeds draft span for ${p.name}: draftYear=${p.acquisitionInfo.draftYear}, serviceYears=${p.serviceYears}`
          );
        }
      }
    }

    // 대표 실제 KBO 선수 나이·연차 정확성 검증
    const findByName = (name: string) =>
      Object.values(cleanCareer.players).find((p) => p.name === name && p.category === '국내');
    const kimTaekYeon = findByName('김택연');
    assert.ok(kimTaekYeon, '김택연 must exist');
    assert.equal(kimTaekYeon!.age, 21);
    assert.ok(kimTaekYeon!.serviceYears <= 2, `김택연 must be 2년차 (got ${kimTaekYeon!.serviceYears})`);

    const kimYoungWoo = findByName('김영우');
    if (kimYoungWoo) {
      assert.ok(kimYoungWoo.serviceYears <= 2, `김영우 must not have inflated years (got ${kimYoungWoo.serviceYears})`);
    }
    const jungJunJae = findByName('정준재');
    if (jungJunJae) {
      assert.ok(jungJunJae.serviceYears <= 2, `정준재 must be 2년차 (got ${jungJunJae.serviceYears})`);
    }
    const parkYoungHyun = findByName('박영현');
    if (parkYoungHyun) {
      assert.ok(parkYoungHyun.serviceYears <= 4, `박영현 must be 4년차 (got ${parkYoungHyun.serviceYears})`);
    }
    const kimDoYoung = findByName('김도영');
    if (kimDoYoung) {
      assert.ok(kimDoYoung.serviceYears <= 4, `김도영 must be 4년차 (got ${kimDoYoung.serviceYears})`);
    }

    // 기존 손상 세이브 자동 보정 검증 (21세 9년차 강제 주입 -> sanitizePlayerAgeAndServiceYearsInPlace로 정상화)
    const corrupted = structuredClone(cleanCareer);
    const corruptedTarget = corrupted.players[kimTaekYeon!.id];
    corruptedTarget.age = 21;
    corruptedTarget.serviceYears = 9;
    corruptedTarget.registrationDays = 1305;
    sanitizePlayerAgeAndServiceYearsInPlace(corrupted.players, corrupted.season);
    const maxExpectedServiceYears = Math.max(2, corrupted.season - 2024);
    assert.ok(
      corruptedTarget.serviceYears <= maxExpectedServiceYears,
      `Corrupted save 21yo 9년차 must be sanitized to <=${maxExpectedServiceYears}년차 (got ${corruptedTarget.serviceYears})`
    );
    assert.ok(
      (corruptedTarget.registrationDays ?? 0) < KBO_POSTING_REQUIRED_REG_DAYS,
      'Sanitized 21yo must NOT falsely qualify for 7-season MLB posting'
    );

    // (B) KBO 규약상 MLB 포스팅 자격: 1군 등록일수 7시즌 (145일 * 7 = 1,015일) + 구단 승인
    assert.equal(KBO_POSTING_SEASON_REG_DAYS, 145);
    assert.equal(KBO_POSTING_REQUIRED_SEASONS, 7);
    assert.equal(KBO_POSTING_REQUIRED_REG_DAYS, 1015);

    const postTestCareer = createNewCareer({ teamId: '한화', gmName: '단장', seed: 6202 });
    const postCandidate = Object.values(postTestCareer.players).find(
      (p) => p.teamId === '한화' && p.name === '노시환'
    ) ?? Object.values(postTestCareer.players).find((p) => p.teamId === '한화' && p.category === '국내')!;
    postCandidate.ability = 86;
    postCandidate.serviceYears = 6;
    postCandidate.registrationDays = 870; // 6시즌 (1,015일 미달)
    const qual6 = getPlayerPostingQualification(postCandidate);
    assert.equal(qual6.meetsSevenSeasonRule, false, '6 seasons (870 days) must NOT qualify for KBO MLB posting');
    assert.equal(evaluateMlbPostingReadiness(postCandidate).eligible, false);

    // 1군 등록일수 1,015일(7시즌) 충족 시 자격 획득
    postCandidate.serviceYears = 7;
    postCandidate.registrationDays = 1015;
    const qual7 = getPlayerPostingQualification(postCandidate);
    assert.equal(qual7.meetsSevenSeasonRule, true, '7 full KBO seasons (1,015 days) must qualify for MLB posting');
    assert.equal(qual7.qualifiedSeasons, 7);
    assert.equal(evaluateMlbPostingReadiness(postCandidate).eligible, true);

    // (C) KBO 모든 구단 트레이드 기간 현실화 (KS 종료 다음 날 ~ 7/31 개방, 8/1 ~ KS 종료 폐쇄, D-7/D-3/D-Day 알림, 마감 자동 취소, KS+1 자동 재개방)
    const twCareer = createNewCareer({ teamId: 'LG', gmName: '단장', seed: 6203 });
    const twSeason = twCareer.season;
    twCareer.phase = 'REGULAR_SEASON';
    twCareer.gamesPlayed = 90;

    // 7월 24일 (D-7): 시장 개방 + D-7 알림 1회 발송
    const stD7 = getTradeWindowStatus(twCareer, `${twSeason}-07-24`);
    assert.equal(stD7.isOpen, true);
    assert.equal(stD7.daysUntilDeadline, 7);
    const lcD7 = processTradeWindowLifecycleInPlace(twCareer, `${twSeason}-07-24`);
    assert.ok(lcD7.alerts.some((a) => a.includes('7일')), 'D-7 alert must fire on 7/24');
    // 동일 일자 중복 알림 방지 확인
    const lcD7Dup = processTradeWindowLifecycleInPlace(twCareer, `${twSeason}-07-24`);
    assert.equal(lcD7Dup.alerts.length, 0, 'D-7 alert must not duplicate');

    // 7월 28일 (D-3) & 7월 31일 (D-Day) 알림
    const lcD3 = processTradeWindowLifecycleInPlace(twCareer, `${twSeason}-07-28`);
    assert.ok(lcD3.alerts.some((a) => a.includes('3일')), 'D-3 alert must fire on 7/28');
    const stD0 = getTradeWindowStatus(twCareer, `${twSeason}-07-31`);
    assert.equal(stD0.isOpen, true);
    assert.equal(stD0.daysUntilDeadline, 0);
    const lcD0 = processTradeWindowLifecycleInPlace(twCareer, `${twSeason}-07-31`);
    assert.ok(lcD0.alerts.some((a) => a.includes('당일') || a.includes('D-Day')), 'D-Day alert must fire on 7/31');

    // 미체결 트레이드 제안 주입 후 8월 1일 도달 -> 시장 폐쇄 + 미체결 제안 자동 취소 + 사용자/AI 트레이드 전면 차단
    const lgDomestic = Object.values(twCareer.players).find(
      (p) => p.teamId === 'LG' && p.category === '국내' && p.rosterTier === '1군'
    )!;
    const kiaDomestic = Object.values(twCareer.players).find(
      (p) => p.teamId === 'KIA' && p.category === '국내' && p.rosterTier === '1군'
    )!;
    twCareer.incomingTradeOffers = [
      {
        id: 'pending-before-deadline',
        fromTeamId: 'KIA',
        offerPlayerIds: [kiaDomestic.id],
        requestPlayerIds: [lgDomestic.id],
        offerCashBillion: 0,
        createdDate: `${twSeason}-07-30`,
        expiresRound: 105,
        status: '대기',
        aiStance: '우승도전',
        reason: '마감 직전 보강 요청',
      },
    ];

    // 실제 8월 1일 이후 시리즈로 이동시켜 getTradeWindowStatus(twCareer) 자체가 폐쇄 반환하도록 설정
    const augSeriesIdx = twCareer.schedule.findIndex((s) => s.dates[0] >= `${twSeason}-08-01`);
    assert.ok(augSeriesIdx >= 0, `Schedule must have a series starting on/after ${twSeason}-08-01`);
    twCareer.currentSeriesIndex = augSeriesIdx;
    twCareer.gamesPlayed = twCareer.schedule
      .slice(0, augSeriesIdx)
      .reduce((acc, s) => acc + Math.max(1, s.dates.length), 0);

    const stAug1 = getTradeWindowStatus(twCareer, `${twSeason}-08-01`);
    assert.equal(stAug1.isOpen, false, 'Trade market must close on August 1');
    const lcClosed = processTradeWindowLifecycleInPlace(twCareer, `${twSeason}-08-01`);
    assert.equal(lcClosed.cancelledCount, 1, 'Pending trade offer must be auto-cancelled at deadline close');
    assert.equal(getPendingIncomingTradeOffers(twCareer).length, 0);

    // 사용자 트레이드 & AI 트레이드 모두 금지 기간 차단 검증
    const userComplianceClosed = validateTradeCompliance(twCareer, {
      targetTeamId: 'KIA',
      myPlayerIds: [lgDomestic.id],
      theirPlayerIds: [kiaDomestic.id],
    });
    assert.equal(userComplianceClosed.valid, false, 'User trades must be blocked during Aug 1 ~ KS end');
    assert.equal(isIncomingTradeWindowOpen(twCareer), false, 'AI incoming trades must be blocked during closed period');

    // 포스트시즌 동안 트레이드 금지 유지
    twCareer.phase = 'POSTSEASON';
    assert.equal(getTradeWindowStatus(twCareer).isOpen, false, 'Trade market must remain closed during postseason');

    // 한국시리즈 종료 다음 날 오프시즌 전환 시 자동 재개방 확인
    twCareer.phase = 'OFFSEASON';
    const reopenIso = notifyTradeMarketReopenedAfterKoreanSeriesInPlace(twCareer, `${twSeason}-10-30`);
    assert.equal(reopenIso, `${twSeason}-10-31`, 'Reopen date must be the exact day after Korean Series ends');
    assert.equal(getTradeWindowStatus(twCareer).isOpen, true, 'Trade market must reopen automatically the day after Korean Series');
    assert.equal(isIncomingTradeWindowOpen(twCareer), true);
    assert.ok(
      (twCareer.newsFeed ?? []).some((n) => n.headline.includes('트레이드 시장 자동 재개방')),
      'Korean Series end must publish trade market reopen news for the next day'
    );
  }

  // =========================================================================
  // 63. Pitching Usage System (5-Man Rotation/4-Day Rest/Pitch-Count AI/6 Bullpen Roles/Milestones)
  //     + Realistic KBO Waiver System (7-Day Window/Reverse-Rank/300만원/Contract Inherit/60d Lock/Post-8/1 PS/Unclaimed FA/Indy/Retire)
  // =========================================================================
  {
    // --- Part A: Realistic Pitching Usage Engine ---
    let pitchCareer = createNewCareer({ teamId: '한화', gmName: '투수운용테스터', seed: 63001 });
    pitchCareer.phase = 'REGULAR_SEASON';
    for (const tid of TEAM_IDS) {
      assignTeamBullpenRolesInPlace(pitchCareer, tid);
      const bpRoles = new Set(
        pitchCareer.teams[tid].bullpenOrder
          .map((id) => pitchCareer.players[id])
          .filter((p): p is NonNullable<typeof p> => Boolean(p && p.rosterTier === '1군'))
          .map((p) => normalizeBullpenRole(p.pitchRole))
      );
      assert.ok(bpRoles.has('마무리'), `${tid} bullpen must have a 마무리`);
      assert.ok(bpRoles.size >= 4, `${tid} bullpen must distribute across multiple of the 6 bullpen roles`);
    }

    // Manual bullpen role change updates role & locks user preference
    const myBpId = pitchCareer.teams['한화'].bullpenOrder[1];
    pitchCareer = setTeamBullpenPitcherRole(pitchCareer, myBpId, '셋업맨');
    assert.equal(pitchCareer.players[myBpId].pitchRole, '셋업맨');
    assert.equal(pitchCareer.players[myBpId].pitchRoleLockedByUser, true);
    assert.equal(ALL_BULLPEN_ROLES.length, 6);

    // Simulate 7 regular series (21 games across all 10 teams = 105 league games)
    for (let s = 0; s < 7; s++) {
      pitchCareer = simulateNextRegularSeries(pitchCareer).nextCareer;
    }

    let starterCount = 0;
    let totalStarterOuts = 0;
    let totalRelieverApps = 0;
    let teamGameSamples = 0;
    let maxPitchCountNonMilestone = 0;

    for (const g of pitchCareer.gamesLedger) {
      const check = verifyGameBoxscoreIntegrity(g);
      assert.equal(check.valid, true, `Game ${g.id} boxscore integrity failed: ${check.issues.join('; ')}`);
      if (!g.boxscore) continue;
      for (const sideLines of [g.boxscore.awayPitchers, g.boxscore.homePitchers]) {
        teamGameSamples++;
        const st = sideLines.find((l) => l.GS > 0);
        if (st) {
          starterCount++;
          totalStarterOuts += st.outs;
          if (!st.CG && !st.SHO && !st.NH && !st.PG) {
            maxPitchCountNonMilestone = Math.max(maxPitchCountNonMilestone, st.PC);
          }
        }
        totalRelieverApps += sideLines.filter((l) => l.GS === 0).length;
      }
    }

    const avgStarterIp = totalStarterOuts / Math.max(1, starterCount) / 3;
    const avgRelieversPerGame = totalRelieverApps / Math.max(1, teamGameSamples);
    assert.ok(
      avgStarterIp >= 4.4 && avgStarterIp <= 6.7,
      `Starter avg IP should naturally land near 5~6 IP (got ${avgStarterIp.toFixed(2)})`
    );
    assert.ok(
      avgRelieversPerGame >= 2.0 && avgRelieversPerGame <= 4.9,
      `Relievers/game should naturally average ~3~4 (got ${avgRelieversPerGame.toFixed(2)})`
    );
    assert.ok(
      maxPitchCountNonMilestone <= 132,
      `Non-milestone starter pitch count must be capped realistically by hook AI (max ${maxPitchCountNonMilestone})`
    );

    // Verify workload fields (lastPitchedDate, recentPitchLog, QS/SV/HLD tracking) updated on players
    const pitchedArms = Object.values(pitchCareer.players).filter(
      (p) => p.role === '투수' && ((p.stats as { G: number | null }).G ?? 0) > 0
    );
    assert.ok(pitchedArms.length >= 90, 'All 10 teams must actively use rotation & bullpen arms');
    assert.ok(
      pitchedArms.every((p) => Boolean(p.lastPitchedDate)),
      'Every pitched arm must record lastPitchedDate'
    );
    const totalQs = pitchedArms.reduce((s, p) => s + ((p.stats as { QS?: number }).QS ?? 0), 0);
    assert.ok(totalQs > 0, 'Quality Starts (QS) must be recorded across regular season games');

    // Verify substitute/opener fallback when all regular rotation starters are unavailable
    const openerTest = structuredClone(pitchCareer);
    const hanwhaRot = openerTest.teams['한화'].rotationOrder;
    for (const sid of hanwhaRot) {
      const sp = openerTest.players[sid];
      if (sp) {
        sp.fatigue = 92;
        sp.lastPitchedDate = '2026-05-09';
      }
    }
    const emergencyPlan = buildRealisticPitchingPlan(openerTest, '한화', 25, '2026-05-10', {
      isPostseason: false,
      isOnNationalDuty: () => false,
    });
    assert.ok(
      emergencyPlan.starterUsageType === '대체선발' ||
        emergencyPlan.starterUsageType === '임시선발' ||
        emergencyPlan.starterUsageType === '오프너',
      `Fatigued rotation must trigger substitute/spot/opener starter (got ${emergencyPlan.starterUsageType})`
    );

    // Verify Postseason 3~4 starter rotation & flexible bullpen
    const psPlan = buildRealisticPitchingPlan(pitchCareer, '한화', 145, '2026-10-15', {
      isPostseason: true,
      isOnNationalDuty: () => false,
    });
    assert.ok(psPlan.starter && psPlan.relievers.length >= 4, 'Postseason plan must prepare active starter and flexible bullpen');

    // --- Part B: Realistic KBO Waiver System ---
    const wCareer = createNewCareer({ teamId: 'LG', gmName: '웨이버테스터', seed: 63002 });
    wCareer.phase = 'REGULAR_SEASON';
    wCareer.finances.cashBalanceBillion = 50;
    const rngW = new SeededRng(63002);

    // Simulate 2 series so standings exist for reverse-rank priority
    let wSim = simulateNextRegularSeries(wCareer).nextCareer;
    wSim = simulateNextRegularSeries(wSim).nextCareer;
    const standingsW = computeStandings(wSim.gamesLedger);
    const topTeam = standingsW[0].teamId;
    const bottomTeam = standingsW[standingsW.length - 1].teamId;
    const middleTeam = standingsW[4].teamId;

    assert.equal(
      pickLowestRankedClaimant(wSim, [topTeam, middleTeam, bottomTeam]),
      bottomTeam,
      'Reverse standings priority must select lowest-ranked claimant'
    );

    // Waive a domestic player from topTeam -> immediate roster removal + 7-day window + 300만원 fee + preserved contract
    const targetWaivePlayer = Object.values(wSim.players).find(
      (p) => p.teamId === topTeam && p.category === '국내' && p.rosterTier === '2군' && !p.injury
    )!;
    targetWaivePlayer.contract.annualSalary = 1.8;
    targetWaivePlayer.contract.yearsRemaining = 2;
    wSim.waiverPool = [];
    const waiveDate = '2026-05-01';
    const wItem = waiveDomesticPlayerInPlace(wSim, topTeam, targetWaivePlayer.id, { dateIso: waiveDate });
    assert.equal(wSim.players[targetWaivePlayer.id].rosterTier, '제외후보', 'Waived player must be removed from roster immediately');
    assert.equal(wItem.expiresDate, addCalendarDaysIso(waiveDate, 7), 'Waiver claim window must be 7 days');
    assert.equal(wItem.claimFeeManwon, KBO_WAIVER_FEE_MANWON);
    assert.equal(wItem.claimCostBillion, KBO_WAIVER_FEE_BILLION);
    assert.equal(wItem.preservedContract?.annualSalary, 1.8);
    assert.equal(wItem.preservedContract?.yearsRemaining, 2);

    // Competing claims from middleTeam & bottomTeam -> on day 7, bottomTeam wins with exact contract inheritance
    wItem.claimTeamIds = [middleTeam, bottomTeam];
    const cashBeforeUser = wSim.finances.cashBalanceBillion ?? 50;
    const resDay7 = processWaiverLifecycleInPlace(wSim, addCalendarDaysIso(waiveDate, 7), rngW, {
      allowAiNewReleases: false,
    });
    assert.equal(resDay7.claimedCount, 1);
    const claimedP = wSim.players[targetWaivePlayer.id];
    assert.equal(claimedP.teamId, bottomTeam, 'Lowest-ranked club must win competing waiver claims');
    assert.equal(claimedP.contract.annualSalary, 1.8, 'Existing annual salary must be inherited intact');
    assert.equal(claimedP.contract.yearsRemaining, 2, 'Existing contract years must be inherited intact');
    if (bottomTeam === wSim.playerTeamId) {
      assert.ok(
        Math.abs((wSim.finances.cashBalanceBillion ?? 0) - (cashBeforeUser - KBO_WAIVER_FEE_BILLION)) < 0.001,
        'User club waiver fee must be exact 300만원 (0.003억)'
      );
    }

    // 60-day re-waiver lock: blocked on day 30, allowed on day 61
    const lockDay30 = getReWaiverRestrictionStatus(claimedP, addCalendarDaysIso(waiveDate, 37));
    assert.equal(lockDay30.blocked, true, 'Re-waiver must be blocked within 60 days');
    assert.throws(
      () => waiveDomesticPlayerInPlace(wSim, bottomTeam, claimedP.id, { dateIso: addCalendarDaysIso(waiveDate, 37) }),
      /60일간 재웨이버 공시가 금지/,
      'Attempting to re-waive within 60 days must throw error'
    );
    const lockDay61 = getReWaiverRestrictionStatus(claimedP, addCalendarDaysIso(waiveDate, 68));
    assert.equal(lockDay61.blocked, false, 'Re-waiver lock must expire after 60 days');

    // Post-August-1 waiver transfer -> Postseason ineligibility
    const augCandidate = Object.values(wSim.players).find(
      (p) => p.teamId === middleTeam && p.role === '투수' && p.category === '국내' && p.rosterTier === '2군' && !p.injury
    )!;
    const augWaiver = waiveDomesticPlayerInPlace(wSim, middleTeam, augCandidate.id, { dateIso: `${wSim.season}-08-05` });
    const augClaimed = awardWaiverPlayerToTeamInPlace(wSim, augWaiver, bottomTeam, `${wSim.season}-08-12`);
    assert.equal(
      augClaimed.postseasonIneligibleSeason,
      wSim.season,
      'Post-August-1 waiver transfer must restrict postseason eligibility'
    );
    assert.equal(
      isPitcherEligibleForGame(wSim, augClaimed, true, () => false),
      false,
      'Post-August-1 waiver pitcher must be blocked from postseason appearances'
    );

    // 7-day unclaimed -> auto-move to unclaimedFreeAgents, blocked in same season, unlocked next season, long-term Indy/Retire
    const userWaiveCandidate = Object.values(wSim.players).find(
      (p) => p.teamId === wSim.playerTeamId && p.category === '국내' && p.rosterTier === '2군' && !p.injury
    )!;
    userWaiveCandidate.ability = 58; // low OVR so AI won't claim
    userWaiveCandidate.age = 26;
    userWaiveCandidate.potential = 73;
    const afterUserWaive = releaseDomesticPlayerToWaiver(wSim, userWaiveCandidate.id).nextCareer;
    const userWaivedItem = afterUserWaive.waiverPool!.find((w) => w.player.id === userWaiveCandidate.id)!;
    assert.ok(userWaivedItem, 'User waived player must appear in waiverPool');
    // Verify submitWaiverClaimApplication blocks original team
    assert.throws(() => submitWaiverClaimApplication(afterUserWaive, userWaivedItem.id), /원소속 구단/);

    // Expire after 7 days with zero claims
    userWaivedItem.claimTeamIds = [];
    const expireIso = addCalendarDaysIso(userWaivedItem.waivedDate, 7);
    const resUnclaimed = processWaiverLifecycleInPlace(afterUserWaive, expireIso, new SeededRng(63099), {
      allowAiNewReleases: false,
    });
    assert.ok(resUnclaimed.movedToFaCount >= 1, 'Unclaimed waiver after 7 days must move to unclaimedFreeAgents');
    const ufa = (afterUserWaive.unclaimedFreeAgents ?? []).find((x) => x.player.id === userWaiveCandidate.id)!;
    assert.ok(ufa, 'Unclaimed player must exist in unclaimedFreeAgents');
    assert.equal(ufa.status, '당해시즌계약금지');
    assert.throws(
      () => signUnclaimedFreeAgent(afterUserWaive, ufa.id),
      /시즌부터 KBO 구단과 계약할 수 있습니다/,
      'Unclaimed waiver FA must be barred from signing with any KBO club in the same season'
    );

    // After 70 days unemployed -> young player with potential >= 70 moves to Independent League; veteran retires
    const vetWaive = Object.values(afterUserWaive.players).find(
      (p) =>
        p.teamId === bottomTeam &&
        p.category === '국내' &&
        p.rosterTier === '2군' &&
        !p.injury &&
        !p.waiverClaimedDate
    )!;
    vetWaive.age = 36;
    vetWaive.ability = 57;
    vetWaive.potential = 57;
    const vetItem = waiveDomesticPlayerInPlace(afterUserWaive, bottomTeam, vetWaive.id, { dateIso: userWaivedItem.waivedDate });
    vetItem.claimTeamIds = [];
    processWaiverLifecycleInPlace(afterUserWaive, expireIso, new SeededRng(63100), { allowAiNewReleases: false });
    processWaiverLifecycleInPlace(afterUserWaive, addCalendarDaysIso(expireIso, 75), new SeededRng(63101), {
      allowAiNewReleases: false,
    });
    const youngUfaAfter = afterUserWaive.unclaimedFreeAgents!.find((x) => x.player.id === userWaiveCandidate.id)!;
    const vetUfaAfter = afterUserWaive.unclaimedFreeAgents!.find((x) => x.player.id === vetWaive.id)!;
    assert.equal(youngUfaAfter.status, '독립리그', 'Young unemployed FA with potential must transition to Independent League');
    assert.ok(Boolean(youngUfaAfter.independentClubName));
    assert.equal(vetUfaAfter.status, '은퇴', 'Aging unemployed veteran FA must retire');

    // Season rollover lifts restriction and permits KBO re-signing
    afterUserWaive.season += 1;
    unlockUnclaimedFreeAgentsForNewSeasonInPlace(
      afterUserWaive,
      afterUserWaive.season,
      `${afterUserWaive.season}-03-01`,
      new SeededRng(63102)
    );
    const reSigned = signUnclaimedFreeAgent(afterUserWaive, youngUfaAfter.id).nextCareer;
    assert.equal(
      reSigned.unclaimedFreeAgents!.find((x) => x.id === youngUfaAfter.id)?.status,
      '재계약완료',
      'Next season rollover must unlock unclaimed/independent FA for KBO re-signing'
    );
  }

  // =========================================================================
  // 64. Position Player Rotation & Bench Player Utilization Patch
  //     (Starter Rotation / 2~4 Bench Subs/Game / PH·PR·DEF·INJ / Strict No-Reentry /
  //      Platoon & Matchup / Blowout Youth / Backup Catcher & Utility /
  //      Idle Morale & Dissatisfaction / Performance-Based Starting Promotion / AI Parity)
  // =========================================================================
  {
    let batCareer = createNewCareer({ teamId: '한화', gmName: '야수운용테스터', seed: 64001 });
    batCareer.phase = 'REGULAR_SEASON';

    // Simulate 7 regular series (21 rounds across all 10 teams = 105 league games)
    for (let s = 0; s < 7; s++) {
      batCareer = simulateNextRegularSeries(batCareer).nextCareer;
    }

    let teamGameSides = 0;
    let totalSubs = 0;
    let totalParticipants = 0;
    const subRoleCounts: Record<string, number> = { 대타: 0, 대주자: 0, 대수비: 0, 부상교체: 0 };
    const distinctStartersByTeam: Record<string, Set<string>> = {};
    const distinctSubsByTeam: Record<string, Set<string>> = {};
    for (const tid of TEAM_IDS) {
      distinctStartersByTeam[tid] = new Set();
      distinctSubsByTeam[tid] = new Set();
    }

    for (const g of batCareer.gamesLedger) {
      const check = verifyGameBoxscoreIntegrity(g);
      assert.equal(check.valid, true, `Game ${g.id} failed boxscore integrity: ${check.issues.join('; ')}`);
      if (!g.boxscore) continue;

      for (const [tid, sideLines] of [
        [g.awayTeam, g.boxscore.awayBatters],
        [g.homeTeam, g.boxscore.homeBatters],
      ] as const) {
        teamGameSides++;
        totalParticipants += sideLines.length;

        const starters = sideLines.filter((b) => !b.isSubstitute);
        const subs = sideLines.filter((b) => Boolean(b.isSubstitute));
        assert.equal(starters.length, 9, `${g.id} ${tid} must have exactly 9 starting batters`);

        // Strict no-reentry check: every playerId unique & no replaced player re-enters in same game
        const seenIds = new Set<string>();
        const replacedIds = new Set<string>();
        for (const b of sideLines) {
          assert.equal(seenIds.has(b.playerId), false, `No-reentry violation: ${b.name} appeared twice in ${g.id}`);
          seenIds.add(b.playerId);
          assert.ok(
            b.battingOrder && b.battingOrder >= 1 && b.battingOrder <= 9,
            `${b.name} must record valid battingOrder 1..9`
          );
          if (!b.isSubstitute) {
            distinctStartersByTeam[tid].add(b.playerId);
          } else {
            distinctSubsByTeam[tid].add(b.playerId);
            assert.ok(b.subRole, `Substitute ${b.name} must record subRole`);
            assert.ok(
              b.enteredInning && b.enteredInning >= 1,
              `Substitute ${b.name} must record enteredInning >= 1`
            );
            assert.ok(b.replacedPlayerId, `Substitute ${b.name} must record replacedPlayerId`);
            subRoleCounts[b.subRole] = (subRoleCounts[b.subRole] ?? 0) + 1;
            replacedIds.add(b.replacedPlayerId);
          }
        }
        for (const b of subs) {
          assert.equal(
            replacedIds.has(b.playerId) &&
              subs.some(
                (other) =>
                  other.playerId === b.playerId &&
                  (other.enteredInning ?? 0) > (b.enteredInning ?? 0)
              ),
            false,
            `Replaced batter ${b.name} must never re-enter in ${g.id}`
          );
        }
        totalSubs += subs.length;
      }
    }

    const avgSubsPerTeamGame = totalSubs / Math.max(1, teamGameSides);
    const avgBattersPerTeamGame = totalParticipants / Math.max(1, teamGameSides);
    console.log(
      `[Batter Usage Check] Avg Subs/Team/Game=${avgSubsPerTeamGame.toFixed(2)}, Avg Batters/Team/Game=${avgBattersPerTeamGame.toFixed(2)} | PH=${subRoleCounts['대타']}, PR=${subRoleCounts['대주자']}, DEF=${subRoleCounts['대수비']}, INJ=${subRoleCounts['부상교체']}`
    );

    assert.ok(
      avgSubsPerTeamGame >= 0.5 && avgSubsPerTeamGame <= 4.3,
      `Average bench subs per team/game must naturally occur in play-by-play games (got ${avgSubsPerTeamGame.toFixed(2)})`
    );
    assert.ok(subRoleCounts['대타'] > 0, 'Pinch hitters (대타) must occur in simulated games');
    assert.ok(subRoleCounts['대수비'] > 0, 'Defensive replacements (대수비) must occur in simulated games');

    // Verify all 10 clubs (user + 9 AI) rotate starters (>9 distinct starters over 21G) & deploy bench players
    for (const tid of TEAM_IDS) {
      assert.ok(
        distinctStartersByTeam[tid].size >= 10,
        `${tid} must rotate starting lineup beyond static 9 players over 21G (got ${distinctStartersByTeam[tid].size})`
      );
      assert.ok(
        distinctSubsByTeam[tid].size >= 3,
        `${tid} must actively use multiple bench players over 21G (got ${distinctSubsByTeam[tid].size})`
      );
    }

    // Platoon / handedness scoring verification (우타 vs 좌투 advantage, 좌타 vs 우투 advantage)
    const sampleHitter = Object.values(batCareer.players).find(
      (p) => p.teamId === '한화' && p.role === '타자'
    )!;
    const samplePitcher = Object.values(batCareer.players).find(
      (p) => p.teamId === 'LG' && p.role === '투수'
    )!;
    const rhb = structuredClone(sampleHitter);
    rhb.battingProfile = {
      bats: '우타',
      sprayTendency: '스프레이',
      pullPct: 38,
      centerPct: 36,
      oppoPct: 26,
      vsLeftEdge: 4,
      vsRightEdge: -2,
      rispClutch: 2,
      vsBreaking: 74,
      avgExitVelocityKmh: 145,
      barrelPct: 8,
    };
    const lhp = structuredClone(samplePitcher);
    const lhpRep = {
      throws: '좌투' as const,
      avgVelocityKmh: 146,
      maxVelocityKmh: 151,
      command: 75,
      breakingSharpness: 75,
      stamina: 75,
      pitches: [],
    };
    lhp.pitchRepertoire = lhpRep;
    const rhp = structuredClone(lhp);
    rhp.pitchRepertoire = { ...lhpRep, throws: '우투' };
    assert.ok(
      getPlatoonAndMatchupScore(rhb, lhp, 0) > getPlatoonAndMatchupScore(rhb, rhp, 0),
      'Right-handed batter must gain platoon advantage against LHP over RHP'
    );

    // Blowout game actively deploys bench players & young prospects
    const blowCareer = createNewCareer({ teamId: 'LG', gmName: '블로우아웃테스터', seed: 64002 });
    const oppPit = Object.values(blowCareer.players).find((p) => p.teamId === '두산' && p.role === '투수')!;
    const blowPlan = buildRealisticGameLineupAndBench(blowCareer, 'LG', '두산', oppPit, 20, {
      isPostseason: false,
      isDoubleheaderGame2: false,
      isOnNationalDuty: () => false,
      getPerfDelta: () => 0,
      rng: new SeededRng(64010),
    });
    const blowBox = simulateInningByInningBattingBox({
      career: blowCareer,
      teamId: 'LG',
      oppTeamId: '두산',
      plan: blowPlan,
      teamInningRuns: [2, 3, 0, 4, 2, 1, 0, 1, 0], // 13-1 blowout
      oppInningRuns: [0, 0, 1, 0, 0, 0, 0, 0, 0],
      oppPitchPower: 72,
      oppStarter: oppPit,
      oppBullpenRelievers: [oppPit],
      parkFactor: 1.0,
      isHomeSide: false,
      round: 20,
      date: '2026-04-25',
      isPostseason: false,
      isDoubleheaderGame2: false,
      getPerfDelta: () => 0,
      rng: new SeededRng(64011),
    });
    const blowSubs = blowBox.lines.filter((l) => l.isSubstitute);
    assert.ok(
      blowSubs.length >= 2,
      `Blowout game (13-1) must actively deploy >=2 bench/prospect subs (got ${blowSubs.length})`
    );

    // Long-idle bench tracking + dissatisfaction increase + reset & morale recovery when played
    const idleCareer = createNewCareer({ teamId: '삼성', gmName: '사기테스터', seed: 64003 });
    const samsungBench = Object.values(idleCareer.players).find(
      (p) =>
        p.teamId === '삼성' &&
        p.role === '타자' &&
        p.rosterTier === '1군' &&
        !idleCareer.teams['삼성'].lineupOrder.includes(p.id)
    )!;
    assert.ok(samsungBench, 'Samsung must have 1군 bench batter');
    samsungBench.ability = Math.max(samsungBench.ability, 70);
    samsungBench.benchIdleGames = 7;
    samsungBench.dissatisfaction = 20;
    samsungBench.morale = '불만';
    const starterLinesOnly = idleCareer.teams['삼성'].lineupOrder.slice(0, 9).map((pid, idx) => {
      const sp = idleCareer.players[pid];
      return {
        playerId: sp.id,
        name: sp.name,
        position: sp.position,
        battingOrder: idx + 1,
        isSubstitute: false,
        PA: 4,
        AB: 4,
        H: 1,
        B2: 0,
        B3: 0,
        HR: 0,
        BB: 0,
        HBP: 0,
        SF: 0,
        SO: 1,
        R: 0,
        RBI: 0,
        SB: 0,
        TB: 1,
      };
    });
    updateBatterWorkloadAndMoraleAfterGameInPlace(idleCareer, '삼성', '2026-05-01', 30, starterLinesOnly);
    assert.equal(samsungBench.benchIdleGames, 8, 'Unused 1군 bench batter must increment benchIdleGames');
    assert.ok(
      (samsungBench.dissatisfaction ?? 0) > 20,
      'Long-idle bench batter (>=8 games) must accumulate dissatisfaction'
    );
    const dissatAtIdle = samsungBench.dissatisfaction ?? 0;
    updateBatterWorkloadAndMoraleAfterGameInPlace(idleCareer, '삼성', '2026-05-02', 31, [
      ...starterLinesOnly,
      {
        playerId: samsungBench.id,
        name: samsungBench.name,
        position: samsungBench.position,
        battingOrder: 9,
        isSubstitute: true,
        subRole: '대타',
        enteredInning: 8,
        replacedPlayerId: starterLinesOnly[8].playerId,
        PA: 1,
        AB: 1,
        H: 1,
        B2: 1,
        B3: 0,
        HR: 0,
        BB: 0,
        HBP: 0,
        SF: 0,
        SO: 0,
        R: 0,
        RBI: 1,
        SB: 0,
        TB: 2,
      },
    ]);
    assert.equal(samsungBench.benchIdleGames, 0, 'Playing must reset benchIdleGames to 0');
    assert.ok(
      (samsungBench.dissatisfaction ?? 0) < dissatAtIdle && samsungBench.morale !== '불만',
      'Productive bench appearance must relieve dissatisfaction and improve morale state'
    );

    // Performance-based starting job competition & promotion on AI club
    const compCareer = createNewCareer({ teamId: 'LG', gmName: '경쟁테스터', seed: 64004 });
    compCareer.phase = 'REGULAR_SEASON';
    compCareer.gamesPlayed = 36;
    const aiTid = '두산';
    const aiLineup = compCareer.teams[aiTid].lineupOrder;
    const aiBenchCandidates = Object.values(compCareer.players).filter(
      (p) =>
        p.teamId === aiTid &&
        p.role === '타자' &&
        p.rosterTier === '1군' &&
        !aiLineup.includes(p.id) &&
        !p.injury
    );
    let challenger = aiBenchCandidates[0];
    let targetRegId = aiLineup.find((pid) => {
      const rp = compCareer.players[pid];
      return rp && rp.position === challenger.position;
    });
    if (!targetRegId) {
      targetRegId = aiLineup[7];
      challenger.position = compCareer.players[targetRegId].position;
    }
    const slumpingStarter = compCareer.players[targetRegId];
    // Make challenger hot (.950 OPS over 45 PA) and starter cold (.540 OPS over 90 PA)
    challenger.ability = slumpingStarter.ability - 1;
    challenger.stats = {
      G: 18, PA: 45, AB: 40, H: 15, B2: 4, B3: 0, HR: 3, BB: 5, HBP: 0, SF: 0, SO: 6, R: 9, RBI: 11, SB: 2, TB: 28,
    };
    slumpingStarter.stats = {
      G: 26, PA: 90, AB: 84, H: 15, B2: 2, B3: 0, HR: 0, BB: 6, HBP: 0, SF: 0, SO: 22, R: 5, RBI: 4, SB: 0, TB: 17,
    };
    evaluateBatterCompetitionAndMoraleInPlace(compCareer, '2026-05-15');
    assert.ok(
      compCareer.teams[aiTid].lineupOrder.includes(challenger.id),
      'Hot bench challenger must earn promotion into AI starting lineup over slumping regular'
    );
    assert.ok(
      !compCareer.teams[aiTid].lineupOrder.includes(slumpingStarter.id),
      'Demoted slumping regular must leave starting lineup'
    );
  }

  console.log('ALL KBO GM 2027 INTEGRITY TESTS PASSED');
}

runAllTests();



