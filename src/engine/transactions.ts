import { resolveAgeAtDate, syncAllAgesToDateInPlace } from './ageEngine';
import { getRookieDraftScheduleInfo } from './calendarEngine';
import { isMilitaryServing } from './militaryEngine';
import {
  buildCoachSubRatings,
  COACH_ROLE_METADATA,
  ensureBenchCoachesInPlace,
  REAL_FA_COACH_SEEDS,
  toCoach,
} from '../data/coachesData';
import { createFreshDraftState } from '../data/draftPool';
import {
  CORPORATE_SPONSORS,
  DEFAULT_ACTIVE_SPEND_IDS,
  DEFAULT_INVESTMENTS,
  FACILITY_UPGRADES,
  getTeamSponsorChoices,
  ONE_TIME_SPEND_OPTIONS,
  OneTimeSpendDef,
  TEAM_STARTING_CASH_BILLION,
} from '../data/financesData';
import {
  FOREIGN_SCOUT_POOL,
  ForeignScoutCandidate,
  FUTURES_TEAM_IDS,
  FUTURES_TEAMS_META,
  generateVirtualForeignMarket,
  HISTORICAL_BASELINE_CHAMPIONS,
  KBO_TEAMS,
  MLB_CLUBS,
  TEAM_IDS,
} from '../data/kboTeams';
import {
  allocateTeamUniformNumber,
  commitSeasonStatsToCareer,
  ensurePlayerRichMetadata,
} from '../data/playerMetadata';
import { getKboMinSalaryBillion, sanitizeCareerOvrPotInPlace } from '../data/v18Importer';
import {
  getTeamExternalFaSigningCount,
  markFaNegotiationSignedInPlace,
  MAX_EXTERNAL_FA_PER_CLUB,
  resolveRemainingAiFaCompetitionInPlace,
  syncFaCompetitionMarketInPlace,
} from './faCompetitionEngine';
import {
  ensureLeagueAcquisitionsInPlace,
  recordLeagueAcquisitionInPlace,
} from './leagueAcquisitionsEngine';
import { assignTeamBullpenRolesInPlace } from './pitchingUsageEngine';
import { unlockUnclaimedFreeAgentsForNewSeasonInPlace } from './waiverEngine';
import { resetRivalriesForNewSeason } from './rivalryEngine';
import {
  AwardEntry,
  BatterStats,
  CareerSave,
  ClubInvestments,
  Coach,
  GamePhase,
  ManagerOfYearAward,
  PitcherStats,
  Player,
  Position,
  PostingOffer,
  PostingRecord,
  RosterTier,
  SeasonAwards,
  TeamId,
  TicketPricePolicy,
  TradePlayerValuationBreakdown,
  TrainingFocus,
  VirtualForeignPoolItem,
} from '../types/kbo';
import {
  archiveCompletedSeasonRecords,
  buildInitialOwnerEval,
  computeReverseDraftOrder,
  emptyFuturesStats,
  ensureFranchiseState,
  ensureSeasonDevelopmentalMarket,
  evolveAnnualKboRules,
  fireAndReplaceClubManager,
  generateEndOfSeasonPostingRequests,
  getActiveKboRuleModifiers,
  getTeamRetiredNumbers,
  inductRetiredLegendsToHof,
  processMandatorySangmuEnlistments,
  processOffseasonOtherClubMlbPostings,
  processOverseasTrainingReturns,
  processSangmuDischarges,
  prunePreviousSeasonNewsInPlace,
  pushNews,
  recordMlbExportPlayer,
  unlockTrophy,
} from './franchiseSystems';
import { buildInitialPlayerTeamHistory } from './leagueLifeEngine';
import {
  buildLeagueEnvironment,
  buildRetirementCeremony,
  computeFaQualification,
  computePlayerTradeValue,
  computeSalaryCapSummary,
  DIFFICULTY_CONFIG,
  ensureDeepFranchiseState,
  evaluatePlayerContractAcceptance,
  reassignNonConflictingUniformNumber,
  validateTradeCompliance,
} from './deepFranchise';
import {
  injectUndraftedUlsanPlayersIntoDraft,
  markUlsanPlayerDrafted,
  resetUlsanWhalesForNewSeason,
} from './specialFuturesEngine';
import {
  appendPlayerTeamHistoryInPlace,
  assignRetiredPlayerCareerInPlace,
  ensureDraftPickProvenanceInPlace,
  getOffseason8StepReadiness,
  markReleasedPlayerSignedInPlace,
  processOffseasonReleasedPlayersInPlace,
  processOffseasonRetiredCareersInPlace,
  recordDraftPickTradeInPlace,
  recordRookieSigningBonusTop10InPlace,
  selectAnnualTopAmateurProspectsInPlace,
  syncActingCaptainInPlace,
  unveilAnnualClubUniformsInPlace,
} from './leagueLifeEngine';
import {
  applyCompetitiveBalanceDraftPenalties,
  ensureCompetitiveBalanceState,
  executeAtomicCareerMutation,
  getCurrentCareerDate,
  getDraftPickingTeamForSlot,
  getPlayerClubTenureSeasons,
  settleSeasonCompetitiveBalance,
} from './salaryCapEngine';
import {
  applyDevelopmentalConversionInPlace,
  checkDevelopmentalConversionEligibility,
} from './developmentalEngine';
import {
  applyFranchiseStarTransferConsequencesInPlace,
  evaluateLegendTradeAvailability,
  evaluatePlayerTradeValuationDetailed,
  inductPlayerToClubLegendsHofInPlace,
  reevaluateLeagueFranchiseProtectionInPlace,
} from './franchiseStarEngine';
import {
  confirmAwardsCeremonyAndEnterOffseason,
  runOfficialSeasonAwardsCeremonyInPlace,
} from './kboAwardsEngine';
import {
  canHoldPlayerMeeting,
  conductGmPlayerMeeting,
  getDissatisfactionLevel,
  getPlayerDissatisfaction,
  recordPlayerDemotionDissatisfactionInPlace,
  syncPlayerMoraleFromDissatisfaction,
} from './dissatisfactionEngine';
export {
  canHoldPlayerMeeting,
  conductGmPlayerMeeting,
  confirmAwardsCeremonyAndEnterOffseason,
  getDissatisfactionLevel,
  getPlayerDissatisfaction,
};
import {
  advanceAmateurAndOverseasSeasonInPlace,
  integrateAmateurAndOverseasIntoDraftCandidates,
  markAmateurOrOverseasDraftedInPlace,
} from './amateurOverseasEngine';
import {
  ALL_FIELD_POSITIONS,
  ALL_HITTER_LINEUP_POSITIONS,
  ensurePlayerPositionProficiencyInPlace,
  getPositionProficiency,
} from './positionEngine';
import { getKboFaCompensationRuleForSeason } from './faCompensationEngine';
import { allocatePermanentPlayerId } from './playerRegistry';
import { SeededRng } from './rng';
import { generateRegularSeasonSchedule } from './schedule';
import {
  calcAVG,
  calcERA,
  calcOPS,
  computeLeaderboards,
  computeStandings,
  emptyBatterStats,
  emptyPitcherStats,
  formatIP,
  formatRate2,
  formatRate3,
} from './stats';

function cloneCareer(c: CareerSave): CareerSave {
  return JSON.parse(JSON.stringify(c)) as CareerSave;
}

function bumpVersion(v: string): string {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return `${v}.1`;
  return `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export function setCareerPhase(career: CareerSave, nextPhase: GamePhase): CareerSave {
  const next = cloneCareer(career);
  next.phase = nextPhase;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function getAvailableFaCoaches(career: CareerSave): Coach[] {
  if (Array.isArray(career.faCoaches)) {
    return career.faCoaches;
  }
  const activeNames = new Set<string>();
  for (const tid of TEAM_IDS) {
    for (const c of career.coaches[tid] ?? []) {
      activeNames.add(c.name);
    }
  }
  return REAL_FA_COACH_SEEDS.filter((s) => !activeNames.has(s.name)).map((s, idx) =>
    toCoach(s, 'FA', `fa-${s.role}-${idx}-${s.name}`, false, false)
  );
}

export function applyStaffSelection(
  career: CareerSave,
  selectedCoaches: Coach[]
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const teamId = next.playerTeamId;

  const prevTeamCoaches = next.coaches[teamId] ?? [];
  const selectedIds = new Set(selectedCoaches.map((c) => c.id));
  const selectedNames = new Set(selectedCoaches.map((c) => c.name));

  let faPool = [...getAvailableFaCoaches(next)].filter(
    (fc) => !selectedIds.has(fc.id) && !selectedNames.has(fc.name)
  );

  // Move any replaced incumbent coach into the FA pool
  for (const oldC of prevTeamCoaches) {
    if (!selectedNames.has(oldC.name)) {
      faPool.push({
        ...oldC,
        teamId: 'FA',
        confirmed: false,
        isIncumbent: false,
        careerNote: oldC.careerNote ?? `FA · 전 ${teamId} ${oldC.role}`,
      });
    }
  }

  next.faCoaches = faPool;
  next.coaches[teamId] = selectedCoaches.map((c) => ({
    ...c,
    teamId,
    confirmed: true,
  }));

  const totalCost = selectedCoaches.reduce((s, c) => s + c.totalBillion, 0);
  const existingCoachOb = next.finances.obligations.find((o) => o.id === `ob-staff-${next.season}`);
  if (!existingCoachOb && totalCost > 0) {
    next.finances.obligations.push({
      id: `ob-staff-${next.season}`,
      label: `${next.season} 지도자 3인 선임 (${selectedCoaches.map((c) => c.name).join('·')})`,
      currency: 'KRW',
      amount: Number(totalCost.toFixed(2)),
      paidAmount: 0,
    });
    next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + totalCost).toFixed(2));
  }

  next.transactionLogs.unshift({
    id: `tx-staff-${Date.now()}`,
    date: '2026-03-02',
    type: '계약',
    teamId,
    summary: `코칭스태프 선임 확정: ${selectedCoaches.map((c) => `${c.role} ${c.name}`).join(', ')}`,
    detail: `총 약정 ${totalCost.toFixed(1)}억 원 (미지급 의무 기장, 현금 지급 0원)`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function terminateCoachContract(
  career: CareerSave,
  coachId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const teamId = career.playerTeamId;
  const currentList = career.coaches[teamId] ?? [];
  const target = currentList.find((c) => c.id === coachId);
  if (!target) {
    throw new Error('해지할 코칭스태프를 찾을 수 없습니다.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);

  next.coaches[teamId] = (next.coaches[teamId] ?? []).filter((c) => c.id !== coachId);

  const faPool = getAvailableFaCoaches(next).filter((c) => c.name !== target.name);
  faPool.unshift({
    ...target,
    teamId: 'FA',
    confirmed: false,
    isIncumbent: false,
    careerNote: `FA · 전 ${KBO_TEAMS[teamId].shortName} ${target.role}`,
  });
  next.faCoaches = faPool;

  next.transactionLogs.unshift({
    id: `tx-coach-fire-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '계약',
    teamId,
    summary: `코칭스태프 계약 해지: ${target.role} ${target.name} → FA 시장 전환`,
    detail: `기존 미지급 장부는 자동 상계되지 않으며 해당 보직은 FA 영입 전까지 공석입니다.`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function hireFaCoach(
  career: CareerSave,
  faCoachId: string,
  params: {
    years: number;
    annualSalaryBillion: number;
    signingBonusBillion: number;
    replaceExisting?: boolean;
  }
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const faList = getAvailableFaCoaches(career);
  const target = faList.find((c) => c.id === faCoachId);
  if (!target) {
    throw new Error('영입할 FA 지도자를 찾을 수 없습니다.');
  }

  const teamId = career.playerTeamId;
  const currentRoleCoach = (career.coaches[teamId] ?? []).find((c) => c.role === target.role);
  if (currentRoleCoach && !params.replaceExisting) {
    throw new Error(
      `현재 ${target.role} 보직에 ${currentRoleCoach.name} 코치가 계약 중입니다. 먼저 계약 해지하거나 교체 영입을 선택하세요.`
    );
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);

  let nextFa = getAvailableFaCoaches(next).filter((c) => c.id !== faCoachId);
  let nextTeamCoaches = [...(next.coaches[teamId] ?? [])];

  if (currentRoleCoach) {
    nextTeamCoaches = nextTeamCoaches.filter((c) => c.id !== currentRoleCoach.id);
    nextFa.unshift({
      ...currentRoleCoach,
      teamId: 'FA',
      confirmed: false,
      isIncumbent: false,
      careerNote: `FA · 전 ${KBO_TEAMS[teamId].shortName} ${currentRoleCoach.role}`,
    });
  }

  const years = Math.max(1, Math.min(5, Math.round(params.years)));
  const annual = Math.max(0.5, Number(params.annualSalaryBillion));
  const bonus = Math.max(0, Number(params.signingBonusBillion));
  const totalBillion = Number((years * annual + bonus).toFixed(2));

  const signedCoach: Coach = {
    ...target,
    teamId,
    contractYears: years,
    annualSalaryBillion: annual,
    signingBonusBillion: bonus,
    totalBillion,
    confirmed: true,
    isIncumbent: false,
    careerNote: `${KBO_TEAMS[teamId].shortName} ${target.role} 계약`,
  };

  const roleOrder: Record<Coach['role'], number> = {
    감독: 0,
    수석코치: 1,
    투수코치: 2,
    타격코치: 3,
    배터리코치: 4,
    수비코치: 5,
  };
  nextTeamCoaches.push(signedCoach);
  nextTeamCoaches.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  next.coaches[teamId] = nextTeamCoaches;
  next.faCoaches = nextFa;

  next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + totalBillion).toFixed(2));
  next.finances.obligations.push({
    id: `ob-coach-hire-${signedCoach.id}-${Date.now()}`,
    label: `FA ${signedCoach.role} ${signedCoach.name} ${years}년 계약 (연 ${annual}억 + 계약금 ${bonus}억)`,
    currency: 'KRW',
    amount: totalBillion,
    paidAmount: 0,
  });

  next.transactionLogs.unshift({
    id: `tx-coach-hire-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '계약',
    teamId,
    summary: `FA ${signedCoach.role} ${signedCoach.name} 영입 확정 (${years}년 총액 ${totalBillion.toFixed(1)}억 원)`,
    detail: currentRoleCoach
      ? `기존 ${currentRoleCoach.name} 해지(FA 전환) 후 교체 선임 · 미지급 의무 기장(현금 지급 0원)`
      : `공석 보직 선임 · 미지급 의무 기장(현금 지급 0원)`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export const USD_TO_KRW_BILLION_RATE = 1350 / 100_000_000;

export function usdToKrwBillion(usd: number): number {
  return Number((usd * USD_TO_KRW_BILLION_RATE).toFixed(2));
}

export interface ContractDraftItem {
  playerId: string;
  years: number;
  annualSalaryBillion: number;
  signingBonusBillion: number;
  optionType?: '없음' | '구단옵션' | '선수옵션';
  optionYearSalary?: number;
  incentiveTarget?: string;
  incentiveBonusBillion?: number;
}

export interface AiDomesticContractQuote extends ContractDraftItem {
  totalBillion: number;
  rationale: string;
}

/**
 * AI 단장·에이전트 현실적 연봉 산정 (#6, #14, #28):
 * 나이, 능력치, 최근 3년 성적(recent3YrScore), 부상 이력(injuryHistoryCount), 포지션 시장 수요를 반영해
 * 현실적인 KBO 연봉·다년계약·옵션·인센티브 조건을 산출합니다.
 */
export function generateAiDomesticContract(p: Player): AiDomesticContractQuote {
  const recent3 = p.recent3YrScore ?? p.ability;
  const injCount = p.injuryHistoryCount ?? 0;
  const premiumPos = p.position === 'C' || p.position === 'SS' || p.position === 'SP' || p.position === 'CF';
  const posDemandMult = premiumPos ? 1.09 : 1.0;
  const injPenalty = Math.max(0.76, 1 - injCount * 0.06);
  const effectiveScore = p.ability * 0.72 + recent3 * 0.28;

  let years = 1;
  let annual = 0.5;
  let bonus = 0;
  let optionType: '없음' | '구단옵션' | '선수옵션' = '없음';
  let optionYearSalary: number | undefined;
  let incentiveTarget: string | undefined;
  let incentiveBonusBillion = 0;
  let rationale = '2군 육성·최저연봉 기준 산정';

  if (effectiveScore >= 85) {
    years = p.age >= 35 ? 2 : 4;
    annual = Number(((10.5 + (effectiveScore - 85) * 1.45) * posDemandMult * injPenalty).toFixed(1));
    bonus = Number((years >= 3 ? annual * 0.85 : annual * 0.4).toFixed(1));
    optionType = p.age <= 31 ? '선수옵션' : '구단옵션';
    optionYearSalary = Number((annual * 0.92).toFixed(1));
    incentiveTarget = p.role === '타자' ? '시즌 20홈런 또는 80타점' : '시즌 12승 또는 150이닝';
    incentiveBonusBillion = 1.5;
    rationale = `리그 S티어 주축 (${premiumPos ? '핵심 포지션 프리미엄' : '간판 스타'}${injCount > 0 ? ` · 부상이력 ${injCount}회 반영` : ''})`;
  } else if (effectiveScore >= 80) {
    years = p.age >= 35 ? 1 : 3;
    annual = Number(((5.0 + (effectiveScore - 80) * 0.92) * posDemandMult * injPenalty).toFixed(1));
    bonus = Number((years >= 2 ? annual * 0.42 : 0.4).toFixed(1));
    optionType = '구단옵션';
    optionYearSalary = Number((annual * 0.9).toFixed(1));
    incentiveTarget = p.role === '타자' ? '시즌 12홈런 또는 120안타' : '시즌 10승 또는 15홀드/세이브';
    incentiveBonusBillion = 0.8;
    rationale = `구단 핵심 주전 A티어 · 최근 3년 지표(${Math.round(recent3)}) 반영`;
  } else if (effectiveScore >= 74) {
    years = p.age >= 34 ? 1 : 2;
    annual = Number(((2.0 + (effectiveScore - 74) * 0.44) * posDemandMult * injPenalty).toFixed(1));
    bonus = Number((years >= 2 ? 0.4 : 0).toFixed(1));
    incentiveTarget = p.role === '타자' ? '시즌 100안타 이상' : '시즌 8승 또는 45경기 등판';
    incentiveBonusBillion = 0.4;
    rationale = `1군 레귤러 주전급 · 포지션 시장가 반영`;
  } else if (effectiveScore >= 68) {
    years = 1;
    annual = Number(((0.85 + (effectiveScore - 68) * 0.18) * injPenalty).toFixed(1));
    bonus = 0;
    rationale = '1군 백업·불펜 전력 · 단년 계약 산정';
  } else {
    years = 1;
    annual = Number(Math.max(0.32, 0.32 + Math.max(0, effectiveScore - 58) * 0.05).toFixed(2));
    bonus = 0;
    rationale = '유망주·2군 육성 자원 · KBO 최저연봉 기준 산정';
  }

  // Young pre-FA players cost less than veterans with same OVR
  if (p.serviceYears <= 3 && effectiveScore < 84) {
    years = 1;
    annual = Number(Math.max(0.35, annual * 0.56).toFixed(2));
    bonus = 0;
    optionType = '없음';
    optionYearSalary = undefined;
    rationale = `저연차(${p.serviceYears}년차) 보류선수 연봉 산정`;
  }

  const totalBillion = Number((years * annual + bonus).toFixed(2));
  return {
    playerId: p.id,
    years,
    annualSalaryBillion: annual,
    signingBonusBillion: bonus,
    optionType,
    optionYearSalary,
    incentiveTarget,
    incentiveBonusBillion: incentiveBonusBillion > 0 ? incentiveBonusBillion : undefined,
    totalBillion,
    rationale,
  };
}

export function approveBatchContracts(
  career: CareerSave,
  items: ContractDraftItem[]
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  if (items.length === 0) {
    throw new Error('체결할 선수가 선택되지 않았습니다.');
  }

  const validItems = items.filter((item) => {
    const p = career.players[item.playerId];
    return Boolean(p && p.teamId === career.playerTeamId);
  });
  if (validItems.length === 0) {
    throw new Error('체결할 유효한 소속 선수가 없습니다.');
  }

  const totalRequiredKrw = Number(
    validItems
      .reduce((sum, item) => sum + item.years * item.annualSalaryBillion + item.signingBonusBillion, 0)
      .toFixed(2)
  );

  // 보유자금이 편성된 상태에서는 보유자금을 초과하는 계약 체결을 별도 재정 조건으로 차단 (#5)
  // 단, 샐러리캡 상한 초과만을 이유로는 자동 취소하지 않음 (단장 승인 후 체결 허용)
  if (career.finances.cashBalanceBillion !== null && totalRequiredKrw > career.finances.cashBalanceBillion) {
    throw new Error(
      `보유 자금(${career.finances.cashBalanceBillion.toFixed(2)}억 원)이 부족하여 계약을 체결할 수 없습니다. (필요 계약 총액: ${totalRequiredKrw.toFixed(2)}억 원)`
    );
  }

  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (next) => {
    ensureFranchiseState(next);
    ensureCompetitiveBalanceState(next);

    let addedKrw = 0;
    const names: string[] = [];
    const payFromCash = next.finances.cashBalanceBillion !== null;

    for (const item of validItems) {
      const p = next.players[item.playerId];
      if (!p || p.teamId !== next.playerTeamId) continue;
      if (!Number.isFinite(item.annualSalaryBillion) || item.annualSalaryBillion < 0.3) {
        throw new Error(`${p.name} 계약 연봉은 KBO 최저 연봉(0.3억 원) 이상이어야 합니다.`);
      }

      const total = Number((item.years * item.annualSalaryBillion + item.signingBonusBillion).toFixed(2));
      const startSeason = next.season;
      const endSeason = next.season + item.years - 1;
      const spanLabel = startSeason === endSeason ? `${startSeason}` : `${startSeason}~${endSeason}`;
      p.contract = {
        status: '확정',
        currency: 'KRW',
        years: item.years,
        yearsRemaining: item.years,
        startSeason,
        endSeason,
        annualSalary: item.annualSalaryBillion,
        signingBonus: item.signingBonusBillion,
        totalValue: total,
        optionType: item.optionType ?? '없음',
        optionYearSalary: item.optionYearSalary,
        incentiveTarget: item.incentiveTarget,
        incentiveBonusBillion: item.incentiveBonusBillion,
        incentivePaid: false,
        optionBonusPaidBillion: 0,
        note: `${spanLabel} (${item.years}년 총액 ${total.toFixed(2)}억${item.optionType && item.optionType !== '없음' ? ` · ${item.optionType}` : ''})`,
      };
      p.morale = '만족';

      // 이중지급 방지: 체결 시점 현금 지출은 계약금(signingBonus)만 즉시 집행, 연봉은 시즌 월별 분할 급여로 1회 지급
      const signingBonusNow = Number(Math.max(0, item.signingBonusBillion || 0).toFixed(2));
      addedKrw += signingBonusNow;
      names.push(`${p.name}(${spanLabel} · 총 ${total.toFixed(2)}억 / 계약금 ${signingBonusNow.toFixed(2)}억)`);

      next.finances.obligations.push({
        id: `ob-contract-${p.id}-${Date.now()}`,
        label: `${p.name} ${spanLabel} (${item.years}년 · 연 ${item.annualSalaryBillion}억${item.signingBonusBillion > 0 ? ` + 계약금 ${item.signingBonusBillion}억` : ''})`,
        currency: 'KRW',
        amount: total,
        paidAmount: payFromCash ? signingBonusNow : 0,
      });
    }

    addedKrw = Number(addedKrw.toFixed(2));

    // 적자 상태 대형 지출 제한
    if (next.finances.spendingFrozenReason && addedKrw > 3.0) {
      throw new Error(`${next.finances.spendingFrozenReason} (계약금 3억 초과 체결 불가)`);
    }

    if (payFromCash && next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - addedKrw).toFixed(2));
      next.finances.krwCashPaidBillion = Number((next.finances.krwCashPaidBillion + addedKrw).toFixed(2));
      next.finances.signingBonusPaidBillion = Number(((next.finances.signingBonusPaidBillion ?? 0) + addedKrw).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + addedKrw).toFixed(2));
    } else {
      next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + addedKrw).toFixed(2));
    }

    const today = getCurrentCareerDate(next).isoDate;
    next.transactionLogs.unshift({
      id: `tx-contracts-${Date.now()}`,
      date: today,
      type: '계약',
      teamId: next.playerTeamId,
      summary: `국내 선수 ${validItems.length}명 계약 체결: ${names.join(', ')}`,
      detail: payFromCash
        ? `계약금 ${addedKrw.toFixed(2)}억 원 즉시 집행 (연봉은 시즌 월별 분할 지급 · 이중지급 방지 · 잔액 ${next.finances.cashBalanceBillion?.toFixed(2)}억 원)`
        : `계약금 미지급 의무 +${addedKrw.toFixed(2)}억 원 추가`,
    });

    if (addedKrw >= 5) {
      pushNews(next, {
        date: today,
        category: '이적·계약',
        headline: `[계약] ${KBO_TEAMS[next.playerTeamId].shortName}, ${names.slice(0, 2).join('·')} 등 ${validItems.length}명 총 ${addedKrw.toFixed(1)}억 체결`,
        body: `구단이 핵심 전력 유지를 위해 국내 선수 계약을 확정했습니다.`,
        teamId: next.playerTeamId,
      });
    }

    next.version = bumpVersion(next.version);
    next.updatedAt = new Date().toISOString();
  });

  return { nextCareer, backupSnapshot };
}

/**
 * AI가 산정한 계약 조건으로 국내 선수 1명을 원클릭 계약 체결합니다.
 */
export function signDomesticContractOneClick(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const p = career.players[playerId];
  if (!p || p.teamId !== career.playerTeamId) {
    throw new Error('계약할 소속 선수를 찾을 수 없습니다.');
  }
  if (p.category !== '국내') {
    throw new Error('외국인·아시아쿼터 선수는 외국인 계약 탭에서 진행하세요.');
  }
  const quote = generateAiDomesticContract(p);
  return approveBatchContracts(career, [quote]);
}

/**
 * 보유 자금 한도 내에서 미확정/만료 국내 선수를 AI 우선순위(능력치 순)로 일괄 체결합니다.
 */
export function autoSignAiPendingDomesticContracts(
  career: CareerSave
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const pending = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === career.playerTeamId &&
        p.category === '국내' &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        (p.contract.status === '미확인' || p.contract.status === '만료')
    )
    .sort((a, b) => b.ability - a.ability);

  if (pending.length === 0) {
    throw new Error('계약이 필요한 미확정·만료 국내 선수가 없습니다.');
  }

  let budgetLeft = career.finances.cashBalanceBillion;
  const chosen: ContractDraftItem[] = [];

  for (const p of pending) {
    const q = generateAiDomesticContract(p);
    if (budgetLeft !== null) {
      if (q.totalBillion <= budgetLeft) {
        chosen.push(q);
        budgetLeft = Number((budgetLeft - q.totalBillion).toFixed(2));
      }
    } else {
      chosen.push(q);
    }
  }

  if (chosen.length === 0) {
    throw new Error('현재 보유 자금으로 체결 가능한 미계약 국내 선수가 없습니다. 자금을 확보하세요.');
  }
  return approveBatchContracts(career, chosen);
}

export function getForeignSlotCounts(career: CareerSave, teamId: TeamId): {
  regularCount: number;
  asianCount: number;
  regularPlayers: Player[];
  asianPlayers: Player[];
} {
  const activeForeign = Object.values(career.players).filter(
    (p) =>
      p.teamId === teamId &&
      p.rosterTier !== '제외후보' &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적' &&
      (p.category === '외국인' || p.category === '아시아쿼터')
  );
  const regularPlayers = activeForeign.filter((p) => p.category === '외국인');
  const asianPlayers = activeForeign.filter((p) => p.category === '아시아쿼터');
  return {
    regularCount: regularPlayers.length,
    asianCount: asianPlayers.length,
    regularPlayers,
    asianPlayers,
  };
}

export function getForeignScoutMarket(career: CareerSave): VirtualForeignPoolItem[] {
  // 전 구단(10개 구단) 현역 등록 외국인·아시아쿼터·국내 선수 모두 제외 (한화 소속 왕옌청 등 타 구단 중복 영입 방지)
  const leagueActiveNames = new Set(
    Object.values(career.players)
      .filter(
        (p) =>
          p.rosterTier !== '제외후보' &&
          p.rosterTier !== '은퇴' &&
          p.rosterTier !== '해외이적'
      )
      .map((p) => p.name.replace(/\s+/g, ''))
  );

  const virtualList: VirtualForeignPoolItem[] =
    career.virtualForeignMarket && career.virtualForeignMarket.length > 0
      ? career.virtualForeignMarket
      : generateVirtualForeignMarket(career.season, career.seed);

  const realList: VirtualForeignPoolItem[] = FOREIGN_SCOUT_POOL.map((f) => ({
    ...f,
    nationality: f.nationality ?? (f.category === '아시아쿼터' ? '아시아' : '해외'),
    isVirtual: false,
  }));

  const seen = new Set<string>();
  const merged: VirtualForeignPoolItem[] = [];
  for (const item of [...virtualList, ...realList]) {
    const norm = item.name.replace(/\s+/g, '');
    if (leagueActiveNames.has(norm) || seen.has(norm)) continue;
    seen.add(norm);
    merged.push(item);
  }
  return merged;
}

export function refreshVirtualForeignMarket(
  career: CareerSave
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const nextSeed = (next.rngState + Date.now()) % 1_000_000;
  next.virtualForeignMarket = generateVirtualForeignMarket(next.season, nextSeed);
  next.rngState = nextSeed;
  next.transactionLogs.unshift({
    id: `tx-for-refresh-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '엔트리',
    teamId: next.playerTeamId,
    summary: `해외 스카우트 마켓 갱신 완료 (가상 외국인·아시아쿼터 ${next.virtualForeignMarket.length}명 리포트 접수)`,
  });
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function releaseForeignPlayer(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const target = career.players[playerId];
  if (!target || target.teamId !== career.playerTeamId) {
    throw new Error('계약 해지할 소속 외국인 선수를 찾을 수 없습니다.');
  }
  if (target.category === '국내') {
    throw new Error('외국인·아시아쿼터 선수만 외국인 계약 해지(웨이버 공시)가 가능합니다.');
  }
  if (target.rosterTier === '제외후보' || target.rosterTier === '은퇴' || target.rosterTier === '해외이적') {
    throw new Error('이미 방출/제외 처리된 선수입니다.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const teamId = next.playerTeamId;
  const p = next.players[playerId];
  const t = next.teams[teamId];

  const wasInLineup = t.lineupOrder.includes(playerId);
  const releaseDateIso = getCurrentCareerDate(next).isoDate;
  const remainingKrw =
    p.contract.currency === 'USD'
      ? usdToKrwBillion(p.contract.annualSalary || 0)
      : p.contract.annualSalary || 0;
  if (remainingKrw > 0) {
    next.finances.deadMoneyEntries = next.finances.deadMoneyEntries ?? [];
    next.finances.deadMoneyEntries.push({
      id: `dm-for-${Date.now()}-${p.id}`,
      playerId: p.id,
      playerName: p.name,
      teamId,
      releasedDate: releaseDateIso,
      releasedSeason: next.season,
      currency: p.contract.currency,
      annualObligationBillion: Number(remainingKrw.toFixed(2)),
      remainingSeasons: 1,
      totalRemainingBillion: Number(remainingKrw.toFixed(2)),
      reason: `${p.category} 중도 계약 해지 잔여 보장 연봉`,
    });
  }

  p.rosterTier = '제외후보';
  p.gameDayActive = false;
  p.contract = {
    ...p.contract,
    status: '만료',
    yearsRemaining: 0,
    note: `${next.season} 시즌 계약 해지 (웨이버 공시 · 잔여 보장 데드머니 ${remainingKrw.toFixed(2)}억 유지)`,
  };
  t.rotationOrder = t.rotationOrder.filter((id) => id !== playerId);
  t.bullpenOrder = t.bullpenOrder.filter((id) => id !== playerId);
  t.lineupOrder = t.lineupOrder.filter((id) => id !== playerId);
  t.benchOrder = t.benchOrder.filter((id) => id !== playerId);

  if (wasInLineup && t.lineupOrder.length < 9) {
    const replacement = t.benchOrder
      .map((id) => next.players[id])
      .find((cand) => cand && cand.role === '타자' && cand.rosterTier === '1군' && !cand.injury);
    if (replacement) {
      t.lineupOrder.push(replacement.id);
      t.benchOrder = t.benchOrder.filter((id) => id !== replacement.id);
      t.lineupPositions[replacement.id] = replacement.position;
    }
  }

  next.transactionLogs.unshift({
    id: `tx-for-release-${Date.now()}`,
    date: releaseDateIso,
    type: '계약',
    teamId,
    summary: `외국인 계약 해지(웨이버 공시): ${p.name} [${p.category}]`,
    detail: `${p.category} 보유 슬롯 1자리 확보 · 방출 잔여 보장액 ${remainingKrw.toFixed(2)}억 원은 데드머니 장부에 유지됩니다.`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function signForeignCandidate(
  career: CareerSave,
  candidate: ForeignScoutCandidate | VirtualForeignPoolItem,
  replacePlayerId?: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (next) => {
    const teamId = next.playerTeamId;

    // 타 KBO 구단 소속 현역 선수(예: 한화 소속 왕옌청) 중복 영입 차단
    const normCandName = candidate.name.replace(/\s+/g, '');
    const activeHolder = Object.values(next.players).find(
      (p) =>
        p.name.replace(/\s+/g, '') === normCandName &&
        p.rosterTier !== '제외후보' &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적'
    );
    if (activeHolder) {
      throw new Error(
        `${candidate.name} 선수는 현재 ${KBO_TEAMS[activeHolder.teamId].name} 소속 현역 선수이므로 해외 스카우트 시장에서 영입할 수 없습니다.`
      );
    }

    if (candidate.category === '아시아쿼터' && candidate.suggestedTotalUsd > 200000) {
      throw new Error('[공식 KBO 규정] 아시아쿼터 신규 계약 상한은 $200,000 이하입니다.');
    }
    if (candidate.category === '외국인' && candidate.suggestedTotalUsd > 1000000) {
      throw new Error('[공식 KBO 규정] 신규 외국인 선수 계약 상한은 $1,000,000 이하입니다.');
    }

    const foreignDateIso = getCurrentCareerDate(next).isoDate;
    const bonusKrwBillion = usdToKrwBillion(candidate.suggestedSigningBonusUsd);
    const totalKrwBillion = usdToKrwBillion(candidate.suggestedTotalUsd);
    const payFromCash = next.finances.cashBalanceBillion !== null;
    if (next.finances.spendingFrozenReason && totalKrwBillion > 3.0) {
      throw new Error(`${next.finances.spendingFrozenReason} (신규 고액 외국인 영입 제한)`);
    }
    if (payFromCash && next.finances.cashBalanceBillion !== null && bonusKrwBillion > next.finances.cashBalanceBillion) {
      throw new Error(
        `보유 자금(${next.finances.cashBalanceBillion.toFixed(2)}억 원)이 부족하여 외국인 계약금(${bonusKrwBillion.toFixed(2)}억 원)을 집행할 수 없습니다.`
      );
    }

    // KBO 공식 외국인 교체 횟수 규정 검사 (시즌당 일반 교체 최대 2회 · 6주 장기부상 대체는 별도 허용)
    const repKey = `${next.season}-${teamId}`;
    next.foreignReplacementsUsedByTeam = next.foreignReplacementsUsedByTeam ?? {};
    const repCounter = next.foreignReplacementsUsedByTeam[repKey] ?? { regular: 0, injury: 0 };

    if (replacePlayerId) {
      const oldP = next.players[replacePlayerId];
      if (oldP && oldP.teamId === teamId) {
        const isSixWeekInjuryReplacement = Boolean(oldP.injury && oldP.injury.daysRemaining >= 42);
        if (oldP.category === '외국인' && !isSixWeekInjuryReplacement && repCounter.regular >= 2) {
          throw new Error('[공식 KBO 규정] 정규시즌 일반 외국인 선수 교체는 구단당 최대 2회까지 허용됩니다. (6주 이상 부상 대체 제외)');
        }
        if (oldP.category === '외국인') {
          if (isSixWeekInjuryReplacement) repCounter.injury += 1;
          else repCounter.regular += 1;
          next.foreignReplacementsUsedByTeam[repKey] = repCounter;
        }
        const deadKrw = usdToKrwBillion(oldP.contract.annualSalary || 0);
        if (deadKrw > 0) {
          next.finances.deadMoneyEntries = next.finances.deadMoneyEntries ?? [];
          next.finances.deadMoneyEntries.push({
            id: `dm-rep-${Date.now()}-${oldP.id}`,
            playerId: oldP.id,
            playerName: oldP.name,
            teamId,
            releasedDate: foreignDateIso,
            releasedSeason: next.season,
            currency: 'USD',
            annualObligationBillion: Number(deadKrw.toFixed(2)),
            remainingSeasons: 1,
            totalRemainingBillion: Number(deadKrw.toFixed(2)),
            reason: `외국인 교체 방출 잔여 보장 연봉`,
          });
        }
        oldP.rosterTier = '제외후보';
        oldP.gameDayActive = false;
        oldP.contract.yearsRemaining = 0;
        next.teams[teamId].rotationOrder = next.teams[teamId].rotationOrder.filter((id) => id !== oldP.id);
        next.teams[teamId].bullpenOrder = next.teams[teamId].bullpenOrder.filter((id) => id !== oldP.id);
        next.teams[teamId].lineupOrder = next.teams[teamId].lineupOrder.filter((id) => id !== oldP.id);
        next.teams[teamId].benchOrder = next.teams[teamId].benchOrder.filter((id) => id !== oldP.id);
      }
    }

    const slots = getForeignSlotCounts(next, teamId);
    const ruleMods = getActiveKboRuleModifiers(next);
    if (candidate.category === '외국인' && slots.regularCount >= 3) {
      throw new Error('[공식 KBO 규정] 일반 외국인 슬롯(최대 3명)이 모두 찼습니다. 기존 외국인 선수를 계약 해지하거나 교체 지정하세요.');
    }
    if (candidate.category === '아시아쿼터' && slots.asianCount >= ruleMods.asiaQuotaLimit) {
      throw new Error(
        `[공식 KBO 규정] 아시아쿼터 슬롯(최대 ${ruleMods.asiaQuotaLimit}명)이 이미 찼습니다. 기존 선수를 계약 해지하거나 교체 지정하세요.`
      );
    }

    // KBO 공식 일반 외국인 투타 구성 규정 (투수 3명 또는 타자 3명 편성 금지 — 최대 투수 2명 / 타자 2명)
    if (candidate.category === '외국인') {
      const activeRegulars = Object.values(next.players).filter(
        (p) =>
          p.teamId === teamId &&
          p.category === '외국인' &&
          p.rosterTier !== '제외후보' &&
          p.rosterTier !== '은퇴' &&
          p.rosterTier !== '해외이적' &&
          p.rosterTier !== 'FA'
      );
      const sameRoleCount = activeRegulars.filter((p) => p.role === candidate.role).length;
      if (sameRoleCount >= 2) {
        throw new Error(
          `[공식 KBO 규정] 일반 외국인 3명은 모두 동일 포지션(투수 3명 또는 타자 3명)으로 구성할 수 없습니다. (현재 ${candidate.role} ${sameRoleCount}명 보유)`
        );
      }
      // 구단 외국인 3명 합계 총액 $4,000,000 상한 검사 (재계약 연차당 +$100,000 가산)
      const reSignBonusCap = activeRegulars.reduce(
        (s, p) => s + Math.max(0, (p.clubTenureSeasons ?? 1) - 1) * 100000,
        0
      );
      const clubForeignCapUsd = 4_000_000 + reSignBonusCap;
      const existingUsd = activeRegulars.reduce((s, p) => s + (p.contract.totalValue || 0), 0);
      if (existingUsd + candidate.suggestedTotalUsd > clubForeignCapUsd) {
        throw new Error(
          `[공식 KBO 규정] 구단 일반 외국인 총액 상한($${clubForeignCapUsd.toLocaleString()})을 초과합니다. (기존 $${existingUsd.toLocaleString()} + 신규 $${candidate.suggestedTotalUsd.toLocaleString()})`
        );
      }
    }

    const newId = `${teamId}-F-${candidate.id}-${Date.now()}`;
    const isP = candidate.role === '투수';
    const nationality = candidate.nationality || (candidate.category === '아시아쿼터' ? '일본' : '미국');
    next.players[newId] = {
      id: newId,
      name: candidate.name,
      teamId,
      category: candidate.category,
      nationality,
      previousLeagueClub:
        'previousLeagueClub' in candidate && candidate.previousLeagueClub
          ? candidate.previousLeagueClub
          : candidate.category === '아시아쿼터'
          ? 'NPB / ABL 해외 리그'
          : 'MLB / AAA 마이너리그',
      role: candidate.role,
      position: candidate.position,
      pitchRole: isP ? '선발' : undefined,
      age: candidate.age,
      ability: candidate.ability,
      potential: candidate.potential,
      abilityStatus: '확정',
      form: 0,
      fatigue: 0,
      lastPitchedRound: 0,
      consecutiveAppearances: 0,
      rosterTier: '1군',
      gameDayActive: true,
      uniformNumber: allocateTeamUniformNumber(
        next.players,
        teamId,
        false,
        undefined,
        getTeamRetiredNumbers(next, teamId)
      ),
      acquisitionInfo: {
        type: candidate.category === '아시아쿼터' ? '아시아쿼터' : '외국인',
        draftYear: next.season,
        label: `${next.season}년 ${candidate.category === '아시아쿼터' ? '아시아쿼터' : '외국인'} 영입 (${nationality})`,
      },
      contract: {
        status: '확정',
        currency: 'USD',
        years: 1,
        yearsRemaining: 1,
        startSeason: next.season,
        endSeason: next.season,
        annualSalary: candidate.suggestedSalaryUsd,
        signingBonus: candidate.suggestedSigningBonusUsd,
        totalValue: candidate.suggestedTotalUsd,
        note: `${next.season} ${candidate.category} 신규 계약 ($${candidate.suggestedTotalUsd.toLocaleString()})`,
      },
      injury: null,
      morale: '만족',
      trainingFocus: null,
      serviceYears: 0,
      clubTenureSeasons: 1,
      seasonRatingDelta: 0,
      lastEvaluatedAtTeamGames: 0,
      postseasonIneligibleSeason:
        foreignDateIso > `${next.season}-08-15` && next.phase === 'REGULAR_SEASON'
          ? next.season
          : undefined,
      kboAdaptation:
        'initialAdaptation' in candidate && candidate.initialAdaptation
          ? candidate.initialAdaptation
          : candidate.category === '아시아쿼터'
          ? 78
          : 66,
      foreignAdaptationProfile:
        'adaptationRisk' in candidate && candidate.adaptationRisk === '고위험'
          ? '적응난항'
          : 'adaptationRisk' in candidate && candidate.adaptationRisk === '안정'
          ? '빠른적응'
          : '표준',
      stats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
      postseasonStats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
    };
    ensurePlayerRichMetadata(next.players[newId]);
    const builtHist = buildInitialPlayerTeamHistory(next.players[newId], next.season);
    next.players[newId].careerTeamHistory = builtHist.history;
    next.players[newId].isOneClubMan = builtHist.isOneClubMan;

    const t = next.teams[teamId];
    if (isP) {
      if (t.rotationOrder.length < 5) t.rotationOrder.push(newId);
      else t.bullpenOrder.push(newId);
    } else {
      if (t.lineupOrder.length < 9) {
        t.lineupOrder.push(newId);
        t.lineupPositions[newId] = candidate.position;
      } else {
        t.benchOrder.push(newId);
      }
    }

    // Remove signed player from virtual foreign market pool
    if (next.virtualForeignMarket) {
      next.virtualForeignMarket = next.virtualForeignMarket.filter(
        (item) => item.id !== candidate.id && item.name !== candidate.name
      );
    }

    // 이중지급 방지: 외국인 계약금(signingBonus)만 체결 시 즉시 현금 집행, 연봉은 시즌 월별 분할 급여로 1회 지급
    if (payFromCash && next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - bonusKrwBillion).toFixed(2));
      next.finances.usdCashPaid += candidate.suggestedSigningBonusUsd;
      next.finances.signingBonusPaidBillion = Number(
        ((next.finances.signingBonusPaidBillion ?? 0) + bonusKrwBillion).toFixed(2)
      );
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + bonusKrwBillion).toFixed(2));
    } else {
      next.finances.usdUnpaid += candidate.suggestedSigningBonusUsd;
    }

    next.finances.obligations.push({
      id: `ob-foreign-${newId}`,
      label: `${candidate.name} [${candidate.category}] 1년 계약 ($${candidate.suggestedTotalUsd.toLocaleString()} · 계약금 $${candidate.suggestedSigningBonusUsd.toLocaleString()})`,
      currency: 'USD',
      amount: candidate.suggestedTotalUsd,
      paidAmount: payFromCash ? candidate.suggestedSigningBonusUsd : 0,
    });

    const foreignDate = foreignDateIso;
    next.transactionLogs.unshift({
      id: `tx-foreign-${Date.now()}`,
      date: foreignDate,
      type: '계약',
      teamId,
      summary: `${candidate.name} [${candidate.category}] 영입 확정 ($${candidate.suggestedTotalUsd.toLocaleString()} · 환산 ${totalKrwBillion.toFixed(2)}억)`,
      detail: payFromCash
        ? `${replacePlayerId ? '기존 후보 교체 · ' : ''}계약금 ${bonusKrwBillion.toFixed(2)}억 즉시 집행 (연봉은 월 분할 지급 · 이중지급 방지 · 잔액 ${next.finances.cashBalanceBillion?.toFixed(2)}억)${foreignDateIso > `${next.season}-08-15` && next.phase === 'REGULAR_SEASON' ? ' · 8/15 이후 영입으로 PS 출전 제한' : ''}`
        : replacePlayerId
        ? `기존 후보 교체 후 슬롯 배정`
        : `신규 슬롯 배정`,
    });

    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `foreign-${next.season}-${teamId}-${candidate.id}-${newId}`,
        season: next.season,
        date: foreignDate,
        category: '외국인·아시아쿼터',
        playerId: newId,
        playerName: candidate.name,
        position: candidate.position,
        previousTeamLabel:
          'previousLeagueClub' in candidate && candidate.previousLeagueClub
            ? candidate.previousLeagueClub
            : `${nationality} 해외리그`,
        acquiringTeamId: teamId,
        contractAmountLabel: `$${candidate.suggestedTotalUsd.toLocaleString()}`,
        note: `${candidate.category} 신규 영입`,
      },
      { pushNewsAlert: false }
    );

    next.version = bumpVersion(next.version);
    next.updatedAt = new Date().toISOString();
  });
  return { nextCareer, backupSnapshot };
}

export interface TradeCounterOffer {
  description: string;
  extraCashBillion?: number;
  requestedPickRound?: 1 | 2 | 3;
  requestedPlayerId?: string;
  requestedPlayerName?: string;
  /** 재협상 라운드 안내 (AI 역제안을 반영해 추가 협상 가능) */
  negotiationTip?: string;
}

export interface TradeEvaluationResult {
  decision: '수락' | '조건부' | '거절';
  giveScore: number;
  receiveScore: number;
  /** 순수 실력·나이·연봉 기준 시장 가치 합산 */
  giveMarketScore?: number;
  receiveMarketScore?: number;
  /** 프랜차이즈 상징성에 따른 상대 구단 추가 프리미엄 */
  franchiseSymbolicGap?: number;
  /** 선수별 상세 가치 평가 내역(낮은 지수 사유 · 상징성 프리미엄 포함) */
  giveBreakdowns?: TradePlayerValuationBreakdown[];
  receiveBreakdowns?: TradePlayerValuationBreakdown[];
  aiStance: '우승도전 (즉시전력 선호)' | '중위권 균형' | '리빌딩 (유망주·지명권 선호)';
  reason: string;
  counterOffer?: TradeCounterOffer;
}

function scorePlayerTradeValue(p: Player, preferYouth: boolean): number {
  const ageFactor = preferYouth
    ? p.age <= 24
      ? 18
      : p.age <= 28
      ? 8
      : p.age <= 32
      ? -2
      : -14
    : p.age <= 24
    ? 10
    : p.age <= 30
    ? 10
    : p.age <= 33
    ? 3
    : -8;
  const potBonus = (p.potential - p.ability) * (preferYouth ? 1.1 : 0.65);
  const categoryPenalty = p.category !== '국내' ? -15 : 0;
  return Math.round(p.ability * (preferYouth ? 1.25 : 1.48) + potBonus + ageFactor + categoryPenalty);
}

const DRAFT_PICK_TRADE_VALUE: Record<1 | 2 | 3, number> = {
  1: 38,
  2: 24,
  3: 14,
};

export interface PositionalNeedAssessment {
  needScore: number; // -10 (심각한 포지션 중복) ~ +14 (핵심 취약 포지션 보강)
  isSurplus: boolean;
  label: string;
}

/**
 * 구단의 현재 1군 전력 대비 해당 선수 포지션의 보강 필요도를 산출한다.
 * - 부족 포지션일수록 높은 양수 점수, 이미 상위 자원이 포화 상태면 음수(잉여) 처리
 */
export function computeTradePositionalNeed(
  career: CareerSave,
  teamId: TeamId,
  candidate: Player
): PositionalNeedAssessment {
  const clubActive = Object.values(career.players).filter(
    (p) =>
      p.teamId === teamId &&
      p.rosterTier === '1군' &&
      !p.injury &&
      !isMilitaryServing(p.militaryStatus)
  );

  if (candidate.role === '투수') {
    const isStarter = candidate.position === 'SP' || candidate.pitchRole === '선발';
    const sameRole = clubActive
      .filter((p) =>
        p.role === '투수' &&
        (isStarter
          ? p.position === 'SP' || p.pitchRole === '선발'
          : p.position !== 'SP' && p.pitchRole !== '선발')
      )
      .sort((a, b) => b.ability - a.ability);

    const targetDepth = isStarter ? 5 : 6;
    const benchmark = sameRole[Math.min(sameRole.length - 1, targetDepth - 1)]?.ability ?? 66;
    const upgradeGap = candidate.ability - benchmark;

    if (sameRole.length < targetDepth - 1) {
      return { needScore: 12, isSurplus: false, label: isStarter ? '선발진 인원 부족' : '불펜 뎁스 부족' };
    }
    if (upgradeGap >= 6) {
      return { needScore: 10, isSurplus: false, label: isStarter ? '선발 로테이션 즉시 강화' : '필승조 즉시 강화' };
    }
    if (upgradeGap >= 2) {
      return { needScore: 5, isSurplus: false, label: isStarter ? '선발 뎁스 보강' : '불펜 보강' };
    }
    if (upgradeGap <= -4 && sameRole.length >= targetDepth) {
      return { needScore: -7, isSurplus: true, label: isStarter ? '선발 자원 포화' : '불펜 자원 포화' };
    }
    return { needScore: 0, isSurplus: false, label: '투수진 균형' };
  }

  // 타자 포지션별 필요도 (동일 포지션 1군 주전 대비 업그레이드 여부)
  const posGroup = (pos: string): string =>
    pos === 'LF' || pos === 'CF' || pos === 'RF' ? 'OF' : pos;
  const candGroup = posGroup(candidate.position);
  const samePos = clubActive
    .filter((p) => p.role === '타자' && (p.position === candidate.position || (candGroup === 'OF' && posGroup(p.position) === 'OF')))
    .sort((a, b) => b.ability - a.ability);

  const starterSlots = candGroup === 'OF' ? 3 : 1;
  const currentStarter = samePos[starterSlots - 1];
  const starterAbil = currentStarter?.ability ?? 65;
  const upgradeGap = candidate.ability - starterAbil;

  if (!currentStarter || starterAbil <= 70) {
    return { needScore: 13, isSurplus: false, label: `${candidate.position} 주전 공백 보강` };
  }
  if (upgradeGap >= 5) {
    return { needScore: 10, isSurplus: false, label: `${candidate.position} 주전 업그레이드` };
  }
  if (upgradeGap >= 1) {
    return { needScore: 4, isSurplus: false, label: `${candidate.position} 전력 보강` };
  }
  if (upgradeGap <= -4 && samePos.length >= starterSlots + 1) {
    return { needScore: -8, isSurplus: true, label: `${candidate.position} 포지션 포화` };
  }
  return { needScore: -1, isSurplus: samePos.length >= starterSlots + 2 && candidate.ability < starterAbil, label: `${candidate.position} 기존 주전 보유` };
}

function isTeamCoreStarter(career: CareerSave, teamId: TeamId, p: Player): boolean {
  if (p.rosterTier !== '1군') return false;
  if (p.ability >= 81) return true;
  const team = career.teams[teamId];
  if (!team) return false;
  const inMainLineup = team.lineupOrder.slice(0, 6).includes(p.id);
  const inTopRotation = team.rotationOrder.slice(0, 3).includes(p.id);
  return (inMainLineup || inTopRotation) && p.ability >= 78;
}

function deterministicTradeReluctance(seed: number, key: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 1000) / 1000;
}

export function evaluateTradeProposal(
  career: CareerSave,
  targetTeamId: TeamId,
  givePlayerIds: string[],
  receivePlayerIds: string[],
  cashIncludeBillion = 0,
  draftPickRound?: 1 | 2 | 3 | null
): TradeEvaluationResult {
  const standings = computeStandings(career.gamesLedger);
  const aiRank = standings.find((r) => r.teamId === targetTeamId)?.rank ?? KBO_TEAMS[targetTeamId].prevRank2025;
  const isContender = aiRank <= 4;
  const preferYouth = aiRank >= 7;
  const aiStance: TradeEvaluationResult['aiStance'] =
    aiRank <= 3 ? '우승도전 (즉시전력 선호)' : aiRank >= 7 ? '리빌딩 (유망주·지명권 선호)' : '중위권 균형';

  if (givePlayerIds.length === 0 || receivePlayerIds.length === 0) {
    return {
      decision: '거절',
      giveScore: 0,
      receiveScore: 0,
      aiStance,
      reason: '보낼 선수와 받을 선수를 각각 최소 1명 이상 선택하세요.',
    };
  }

  const givePlayers = givePlayerIds.map((id) => career.players[id]).filter(Boolean);
  const receivePlayers = receivePlayerIds.map((id) => career.players[id]).filter(Boolean);

  // #29, #30, #33: Official KBO trade deadline, eligibility audit & duplicate contract guard
  const compliance = validateTradeCompliance(career, {
    targetTeamId,
    myPlayerIds: givePlayerIds,
    theirPlayerIds: receivePlayerIds,
  });
  if (!compliance.valid) {
    return {
      decision: '거절',
      giveScore: 0,
      receiveScore: 0,
      aiStance,
      reason: compliance.reason ?? 'KBO 트레이드 승인 규정에 위배되어 거래가 차단되었습니다.',
    };
  }

  // #6 & #7 + 현실적 트레이드 개선:
  // - 선수 능력치·나이·최근 성적·잠재력·연봉 기반 시장 지수
  // - AI 구단 부족 포지션 가중치 및 잉여 포지션 감점
  // - 우승 경쟁 팀(즉시전력 선호) vs 리빌딩 팀(유망주·지명권 선호)
  // - 프랜차이즈 스타 및 핵심 주전 보호 프리미엄
  // - 낮은 가치 선수 다수 묶음으로 스타 1명 영입 차단 (체감 가중치 + 핵심 대가 검증)
  const giveBreakdowns = givePlayers.map((p) => evaluatePlayerTradeValuationDetailed(career, p));
  const receiveBreakdowns = receivePlayers.map((p) => evaluatePlayerTradeValuationDetailed(career, p));
  const givePosNeeds = givePlayers.map((p) => computeTradePositionalNeed(career, targetTeamId, p));

  const pickVal = draftPickRound
    ? Math.round(
        DRAFT_PICK_TRADE_VALUE[draftPickRound] *
          (preferYouth ? 1.3 : isContender ? 0.82 : 0.95)
      )
    : 0;
  const cashVal = Math.round(cashIncludeBillion * (aiRank >= 6 ? 7.0 : 4.8));

  const giveMarketScore = giveBreakdowns.reduce((s, b) => s + b.skillMarketIndex, 0);
  const receiveMarketScore = receiveBreakdowns.reduce((s, b) => s + b.skillMarketIndex, 0);
  const franchiseSymbolicGap = receiveBreakdowns.reduce((s, b) => s + b.homeClubSymbolicPremium, 0);

  // 개별 제시 카드 평가 점수 (포지션 필요도 + 우승/리빌딩 성향 반영)
  const givePieceScores = givePlayers.map((p, idx) => {
    const bd = giveBreakdowns[idx];
    const need = givePosNeeds[idx];
    let stanceAdj = 0;
    if (preferYouth) {
      if (p.age <= 24 && p.potential >= 77) stanceAdj += 13;
      else if (p.age <= 24) stanceAdj += 6;
      else if (p.age >= 32) stanceAdj -= 10;
    } else if (isContender) {
      if (p.rosterTier === '1군' && p.ability >= 79) stanceAdj += 11;
      else if (p.ability >= 75) stanceAdj += 5;
      else if (p.ability < 69 && p.age <= 23) stanceAdj -= 7;
    }
    const legacyBlend = Math.round(scorePlayerTradeValue(p, preferYouth) * 0.2 + computePlayerTradeValue(p).index * 0.08);
    // AI 구단은 부족 포지션 선수만 적극 평가, 잉여 포지션은 가치 절하
    const needAdj = need.needScore;
    return Math.max(4, Math.round(bd.marketClubValue * 0.85 + legacyBlend * 0.52 + stanceAdj + needAdj));
  });

  // 다수 선수 묶음 체감 가중치 (낮은 가치 여러 명으로 스타 1명 교환 악용 방지)
  const sortedGivePieces = [...givePieceScores].sort((a, b) => b - a);
  const bundleWeights = [1.0, 0.78, 0.52, 0.35, 0.25];
  const extraPieceCount = Math.max(0, givePlayers.length - receivePlayers.length);
  const weightedGivePlayerScore = sortedGivePieces.reduce((sum, val, idx) => {
    const w = extraPieceCount > 0 ? (bundleWeights[idx] ?? 0.25) : 1.0;
    return sum + Math.round(val * w);
  }, 0);
  const giveScore = weightedGivePlayerScore + cashVal + pickVal;

  const receiveScore = receivePlayers.reduce((s, p, idx) => {
    const bd = receiveBreakdowns[idx];
    let stanceAdj = 0;
    if (preferYouth) {
      if (p.age <= 24 && p.potential >= 78) stanceAdj += 14;
      else if (p.age >= 32) stanceAdj -= 4;
    } else if (isContender) {
      if (p.rosterTier === '1군' && p.ability >= 78) stanceAdj += 12;
    }
    // 핵심 주전 보호 프리미엄 (트레이드 요청 시 완화)
    const isCore = isTeamCoreStarter(career, targetTeamId, p);
    const coreProtection = isCore && !p.tradeRequested ? (p.ability >= 83 ? 16 : 10) : 0;
    const legacyBlend = Math.round(scorePlayerTradeValue(p, preferYouth) * 0.2 + computePlayerTradeValue(p).index * 0.08);
    return s + Math.round(bd.homeClubValue * 0.85 + legacyBlend * 0.52 + stanceAdj + coreProtection);
  }, 0);

  // 과도한 인원 묶음(한쪽 4명 초과) 거래 방지
  if (givePlayers.length > 4 || receivePlayers.length > 4) {
    return {
      decision: '거절',
      giveScore,
      receiveScore,
      giveMarketScore,
      receiveMarketScore,
      franchiseSymbolicGap,
      giveBreakdowns,
      receiveBreakdowns,
      aiStance,
      reason: '단일 트레이드에서 구단당 4명을 초과하는 과도한 대량 거래는 현실성 규정에 따라 제한됩니다.',
    };
  }

  // 모든 10개 구단 프랜차이즈 스타(지수 95+ / 레전드) 트레이드 보호 (상대 구단 + 내 구단 모두 검사)
  for (const p of [...receivePlayers, ...givePlayers]) {
    const legendGate = evaluateLegendTradeAvailability(career, p);
    if (legendGate.isLegend && !legendGate.available) {
      return {
        decision: '거절',
        giveScore,
        receiveScore,
        giveMarketScore,
        receiveMarketScore,
        franchiseSymbolicGap,
        giveBreakdowns,
        receiveBreakdowns,
        aiStance,
        reason: legendGate.reason,
      };
    }
  }

  // 상대 구단 대체 선수 확보 여부 검사 (핵심 포지션 주전을 내보낼 때 대체 선수 부재 시 거래 거절)
  const receiveIdSet = new Set(receivePlayers.map((rp) => rp.id));
  for (const p of receivePlayers) {
    if (p.tradeRequested || p.rosterTier !== '1군' || p.ability < 75) continue;
    const samePosBackups = Object.values(career.players)
      .filter(
        (cand) =>
          cand.teamId === targetTeamId &&
          !receiveIdSet.has(cand.id) &&
          (cand.rosterTier === '1군' || cand.rosterTier === '2군') &&
          !isMilitaryServing(cand.militaryStatus) &&
          (p.role === '투수'
            ? cand.role === '투수' && cand.position === p.position
            : cand.role === '타자' && cand.position === p.position)
      )
      .sort((a, b) => b.ability - a.ability);
    const bestBackup = samePosBackups[0];
    const incomingSamePos = givePlayers.some(
      (gp) => gp.position === p.position && gp.ability >= p.ability - 6
    );
    if (!incomingSamePos && (!bestBackup || bestBackup.ability < p.ability - 10) && ['C', 'SS', 'SP', 'CL'].includes(p.position)) {
      if (giveScore < receiveScore * 1.18) {
        return {
          decision: '거절',
          giveScore,
          receiveScore,
          giveMarketScore,
          receiveMarketScore,
          franchiseSymbolicGap,
          giveBreakdowns,
          receiveBreakdowns,
          aiStance,
          reason: `${KBO_TEAMS[targetTeamId].shortName} 프런트[${aiStance}]는 ${p.position} 주전 ${p.name}(OVR ${p.ability}) 이적 시 마땅한 대체 선수(최고 백업 OVR ${bestBackup?.ability ?? 0})가 없어 동일 포지션 대체자원 또는 대폭 상향된 패키지를 요구합니다.`,
        };
      }
    }
  }

  const starNamesReceiving = receiveBreakdowns
    .filter((b) => b.homeClubSymbolicPremium > 0)
    .map((b) => `${b.playerName}(${b.franchiseTier} +${b.homeClubSymbolicPremium})`);
  const coreNamesReceiving = receivePlayers
    .filter((p) => isTeamCoreStarter(career, targetTeamId, p) && !p.tradeRequested)
    .map((p) => p.name);
  const requestedReliefNotes = receiveBreakdowns
    .filter((b) => b.tradeRequestRelief > 0)
    .map((b) => `${b.playerName} 트레이드 요청으로 매각 저항 완화(-${b.tradeRequestRelief})`);

  // 구조적 거래 불가 조건 검사 (트레이드 지수가 높아도 무조건 수락하지 않음)
  const maxReceiveMarket = Math.max(...receiveBreakdowns.map((b) => b.skillMarketIndex));
  const maxGiveMarket = Math.max(...giveBreakdowns.map((b) => b.skillMarketIndex));
  const targetHasStar = receivePlayers.some(
    (p, idx) =>
      (p.ability >= 81 || receiveBreakdowns[idx].skillMarketIndex >= 74 || receiveBreakdowns[idx].homeClubSymbolicPremium >= 20) &&
      !p.tradeRequested
  );
  const isLowValueQuantityBundle =
    targetHasStar &&
    givePlayers.length > receivePlayers.length &&
    maxGiveMarket < maxReceiveMarket * 0.68 &&
    draftPickRound !== 1;

  if (isLowValueQuantityBundle) {
    return {
      decision: '거절',
      giveScore,
      receiveScore,
      giveMarketScore,
      receiveMarketScore,
      franchiseSymbolicGap,
      giveBreakdowns,
      receiveBreakdowns,
      aiStance,
      reason: `${KBO_TEAMS[targetTeamId].shortName} 프런트[${aiStance}]는 핵심 스타 선수 1명을 낮은 가치 선수 여러 명(${givePlayers.length}명 묶음)으로 교환하는 제안을 거절했습니다. 핵심 즉시전력 또는 최상위 유망주·1라운드 지명권을 중심으로 재구성하세요.`,
    };
  }

  const targetLosesStarter = receivePlayers.some(
    (p) => p.rosterTier === '1군' && p.ability >= 76 && !p.tradeRequested
  );
  const allGiveAreSurplusNonStars =
    givePosNeeds.every((n) => n.isSurplus) &&
    givePlayers.every((p) => p.ability < 83) &&
    draftPickRound !== 1;

  if (targetLosesStarter && allGiveAreSurplusNonStars) {
    return {
      decision: '거절',
      giveScore,
      receiveScore,
      giveMarketScore,
      receiveMarketScore,
      franchiseSymbolicGap,
      giveBreakdowns,
      receiveBreakdowns,
      aiStance,
      reason: `${KBO_TEAMS[targetTeamId].shortName} 프런트[${aiStance}]는 이미 포화 상태인 포지션(${givePosNeeds[0]?.label ?? '포지션 중복'})의 선수만 받는 조건으로 1군 주전 선수를 내줄 수 없다며 거절했습니다.`,
    };
  }

  const diffTol = DIFFICULTY_CONFIG[career.difficulty ?? '어려움'].tradeFairnessTolerance;
  const acceptThreshold = Number((1.06 / diffTol).toFixed(2));
  const ratio = giveScore / Math.max(1, receiveScore);

  // 트레이드 지수가 수락 기준선을 근소하게 넘더라도, 핵심 주전/프랜차이즈 매각 시 구단 내부 신중 검토(역제안 전환)
  const reluctanceKey = `${career.season}:${career.gamesPlayed}:${targetTeamId}:${givePlayerIds.join(',')}:${receivePlayerIds.join(',')}:${cashIncludeBillion}:${draftPickRound ?? 0}`;
  const reluctanceRoll = deterministicTradeReluctance(career.seed, reluctanceKey);
  const hasProtectedCore = coreNamesReceiving.length > 0 || starNamesReceiving.length > 0;
  const borderlineCoreHoldback =
    hasProtectedCore &&
    ratio >= Math.max(1.0, acceptThreshold) &&
    ratio < acceptThreshold + 0.14 &&
    reluctanceRoll < 0.42;

  if (ratio >= Math.max(1.0, acceptThreshold) && !borderlineCoreHoldback) {
    const needHit = givePosNeeds.find((n) => n.needScore >= 4);
    return {
      decision: '수락',
      giveScore,
      receiveScore,
      giveMarketScore,
      receiveMarketScore,
      franchiseSymbolicGap,
      giveBreakdowns,
      receiveBreakdowns,
      aiStance,
      reason: `${KBO_TEAMS[targetTeamId].name} 프런트[${aiStance}]가 전력·최근 성적·연봉·포지션 적합성${
        needHit ? `(${needHit.label})` : ''
      }을 종합 검토해 제안을 수락했습니다.${
        requestedReliefNotes.length > 0 ? ` (${requestedReliefNotes.join(', ')})` : ''
      }`,
    };
  }

  // 재협상 역제안 구간 (0.70 이상이거나 핵심 주전 보류 전환 시 구체적 AI 역제안 제공)
  if (ratio >= 0.7 || borderlineCoreHoldback) {
    const gap = Math.max(8, Math.round(receiveScore * (borderlineCoreHoldback ? 1.12 : 1.04) - giveScore));
    const extraCash = Number(Math.min(18, Math.max(1.5, Math.ceil(gap / 5.5))).toFixed(1));
    const suggestedPick: 1 | 2 | 3 = gap >= 28 ? 1 : gap >= 16 ? 2 : 3;

    const extraProspect = Object.values(career.players)
      .filter(
        (p) =>
          p.teamId === career.playerTeamId &&
          p.category === '국내' &&
          !givePlayerIds.includes(p.id) &&
          p.age <= 24 &&
          (p.rosterTier === '2군' || p.rosterTier === '1군')
      )
      .sort((a, b) => b.potential - a.potential)[0];

    const symbolicPrefix =
      starNamesReceiving.length > 0
        ? `프랜차이즈 상징성(${starNamesReceiving.join(', ')})을 고려해 `
        : coreNamesReceiving.length > 0
        ? `핵심 주전(${coreNamesReceiving.join(', ')}) 이탈 부담을 고려해 `
        : '';

    const counterOffer: TradeCounterOffer =
      preferYouth && !draftPickRound
        ? {
            description: `${symbolicPrefix}신인 드래프트 ${suggestedPick}라운드 지명권을 추가 포함하면 즉시 트레이드를 수락하겠습니다.`,
            requestedPickRound: suggestedPick,
            extraCashBillion: gap >= 36 ? Math.min(8, Math.ceil((gap - 26) / 5)) : undefined,
            negotiationTip: '역제안 조건을 자동 반영한 뒤 현금·선수를 조정해 재협상하거나 바로 승인할 수 있습니다.',
          }
        : extraProspect && gap >= 18
        ? {
            description: `${symbolicPrefix}유망주 ${extraProspect.name}(${extraProspect.position}·잠재 ${extraProspect.potential}) 추가 또는 현금 +${extraCash}억 보강을 역제안합니다.`,
            extraCashBillion: extraCash,
            requestedPlayerId: extraProspect.id,
            requestedPlayerName: extraProspect.name,
            requestedPickRound: !draftPickRound && gap >= 34 ? suggestedPick : undefined,
            negotiationTip: '역제안 유망주·현금 조건을 트레이드 구성에 자동 반영해 재협상할 수 있습니다.',
          }
        : {
            description: `${symbolicPrefix}현금 +${extraCash}억 원을 추가 포함하면 트레이드를 최종 승인하겠습니다.`,
            extraCashBillion: extraCash,
            negotiationTip: '역제안 현금을 반영하거나 다른 유망주/지명권으로 대체해 재협상할 수 있습니다.',
          };

    return {
      decision: '조건부',
      giveScore,
      receiveScore,
      giveMarketScore,
      receiveMarketScore,
      franchiseSymbolicGap,
      giveBreakdowns,
      receiveBreakdowns,
      aiStance,
      reason: borderlineCoreHoldback
        ? `${KBO_TEAMS[targetTeamId].shortName}[${aiStance}]는 트레이드 지수는 근접했으나 핵심 주전/상징 자원 보호 방침에 따라 추가 조건을 역제안했습니다.`
        : `${KBO_TEAMS[targetTeamId].shortName}[${aiStance}]가 역제안을 보냈습니다 (제시 ${giveScore} vs 요구 ${receiveScore}${
            franchiseSymbolicGap > 0 ? ` · 프랜차이즈 상징성 +${franchiseSymbolicGap} 반영` : ''
          }).`,
      counterOffer,
    };
  }

  return {
    decision: '거절',
    giveScore,
    receiveScore,
    giveMarketScore,
    receiveMarketScore,
    franchiseSymbolicGap,
    giveBreakdowns,
    receiveBreakdowns,
    aiStance,
    reason: `${KBO_TEAMS[targetTeamId].name}[${aiStance}]가 전력·포지션 필요도 및 핵심 자원 가치 대비 대가 부족(제시 ${giveScore} vs 요구 ${receiveScore}${
      starNamesReceiving.length > 0 ? ` · ${starNamesReceiving.join(', ')}` : ''
    })으로 협상을 거절했습니다.`,
  };
}

export function executeTradeProposal(
  career: CareerSave,
  targetTeamId: TeamId,
  givePlayerIds: string[],
  receivePlayerIds: string[],
  cashIncludeBillion = 0,
  draftPickRound?: 1 | 2 | 3 | null,
  forceAcceptCounter = false
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const evalRes = evaluateTradeProposal(
    career,
    targetTeamId,
    givePlayerIds,
    receivePlayerIds,
    cashIncludeBillion,
    draftPickRound
  );
  if (evalRes.decision !== '수락' && !forceAcceptCounter) {
    throw new Error(evalRes.reason);
  }

  if (
    cashIncludeBillion > 0 &&
    career.finances.cashBalanceBillion !== null &&
    cashIncludeBillion > career.finances.cashBalanceBillion
  ) {
    throw new Error(`트레이드 현금 조건(${cashIncludeBillion}억) 대비 보유 자금이 부족합니다.`);
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);
  const myTeam = next.playerTeamId;

  const uniformChangeLogs: string[] = [];
  const movePlayer = (pid: string, fromTeam: TeamId, toTeam: TeamId) => {
    const p = next.players[pid];
    if (!p) return;

    // 프랜차이즈 스타 이적 시 팬 만족도 · 구단 평판 · 라이벌 이적 특보 이벤트 적용 (소속 변경 전 평가!)
    applyFranchiseStarTransferConsequencesInPlace(next, p, fromTeam, toTeam, '트레이드');

    // 기존 계약(contract) 및 누적/시즌 기록(stats, careerStats)은 단장 승인 트레이드 시 100% 그대로 유지!
    const tradeDateIso = getCurrentCareerDate(next).isoDate;
    p.teamId = toTeam;
    p.clubTenureSeasons = 1;
    p.tradeRequested = false;
    appendPlayerTeamHistoryInPlace(p, toTeam, next.season, `${fromTeam}→${toTeam} 트레이드`, {
      transferDate: tradeDateIso,
      moveType: '트레이드',
      fromTeamId: fromTeam,
    });

    // 기존 구단에서 샐러리캡 프랜차이즈 예외 선수로 지정되어 있었다면 자동 해제 (별도 관리 정합성 유지)
    if (next.competitiveBalance?.clubs?.[fromTeam]?.exceptionPlayerId === pid) {
      next.competitiveBalance.clubs[fromTeam].exceptionPlayerId = null;
    }

    const oldNum = p.uniformNumber;
    const assignedNum = reassignNonConflictingUniformNumber(next, p, toTeam);
    if (oldNum !== undefined && assignedNum !== oldNum) {
      uniformChangeLogs.push(`${p.name} #${oldNum}→#${assignedNum}`);
    }
    next.teams[fromTeam].lineupOrder = next.teams[fromTeam].lineupOrder.filter((id) => id !== pid);
    next.teams[fromTeam].benchOrder = next.teams[fromTeam].benchOrder.filter((id) => id !== pid);
    next.teams[fromTeam].rotationOrder = next.teams[fromTeam].rotationOrder.filter((id) => id !== pid);
    next.teams[fromTeam].bullpenOrder = next.teams[fromTeam].bullpenOrder.filter((id) => id !== pid);

    if (p.rosterTier === '1군') {
      if (p.role === '투수') {
        if (p.pitchRole === '선발' && next.teams[toTeam].rotationOrder.length < 5) {
          next.teams[toTeam].rotationOrder.push(pid);
        } else {
          next.teams[toTeam].bullpenOrder.push(pid);
        }
      } else {
        next.teams[toTeam].benchOrder.push(pid);
      }
    }
  };

  givePlayerIds.forEach((pid) => movePlayer(pid, myTeam, targetTeamId));
  receivePlayerIds.forEach((pid) => movePlayer(pid, targetTeamId, myTeam));

  if (cashIncludeBillion > 0) {
    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - cashIncludeBillion).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cashIncludeBillion).toFixed(2));
    } else {
      next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + cashIncludeBillion).toFixed(2));
      next.finances.obligations.push({
        id: `ob-trade-cash-${Date.now()}`,
        label: `${KBO_TEAMS[targetTeamId].shortName} 트레이드 현금 조건`,
        currency: 'KRW',
        amount: cashIncludeBillion,
        paidAmount: 0,
      });
    }
  }

  const today = getCurrentCareerDate(next).isoDate;
  // 전체 구단 영입 현황 기록 (트레이드 양 구단 확정 영입 모두 기록 · 중복 방지)
  const tradeBatchTag = `${next.season}-${next.gamesPlayed}-${myTeam}-${targetTeamId}`;
  for (const pid of givePlayerIds) {
    const p = next.players[pid];
    if (!p) continue;
    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `trade-${tradeBatchTag}-${pid}-${targetTeamId}`,
        season: next.season,
        date: today,
        category: '트레이드',
        playerId: pid,
        playerName: p.name,
        position: p.position,
        previousTeamLabel: KBO_TEAMS[myTeam].shortName,
        acquiringTeamId: targetTeamId,
        contractAmountLabel: `기존 계약 승계 (연 ${p.contract.annualSalary}억)`,
        note: `${KBO_TEAMS[myTeam].shortName}↔${KBO_TEAMS[targetTeamId].shortName} 트레이드`,
      },
      { pushNewsAlert: false }
    );
  }
  for (const pid of receivePlayerIds) {
    const p = next.players[pid];
    if (!p) continue;
    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `trade-${tradeBatchTag}-${pid}-${myTeam}`,
        season: next.season,
        date: today,
        category: '트레이드',
        playerId: pid,
        playerName: p.name,
        position: p.position,
        previousTeamLabel: KBO_TEAMS[targetTeamId].shortName,
        acquiringTeamId: myTeam,
        contractAmountLabel: `기존 계약 승계 (연 ${p.contract.annualSalary}억)`,
        note: `${KBO_TEAMS[myTeam].shortName}↔${KBO_TEAMS[targetTeamId].shortName} 트레이드`,
      },
      { pushNewsAlert: false }
    );
  }
  // 지명권 포함 트레이드 시 지명권 출처 기록 (#13)
  if (draftPickRound) {
    recordDraftPickTradeInPlace(next, draftPickRound, myTeam, targetTeamId, today);
  }
  syncActingCaptainInPlace(next, myTeam, true);
  syncActingCaptainInPlace(next, targetTeamId, false);

  const giveNames = givePlayerIds.map((id) => career.players[id]?.name).join('·');
  const recNames = receivePlayerIds.map((id) => career.players[id]?.name).join('·');
  const extras = [
    cashIncludeBillion > 0 ? `현금 ${cashIncludeBillion}억` : '',
    draftPickRound ? `차기 ${draftPickRound}R 지명권` : '',
    uniformChangeLogs.length > 0 ? `등번호 자동 변경: ${uniformChangeLogs.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' + ');

  const recTop = Math.max(...receivePlayerIds.map((id) => career.players[id]?.ability ?? 70));
  if (recTop >= 80) {
    next.teams[myTeam].fanSentiment = Math.min(100, (next.teams[myTeam].fanSentiment ?? 65) + 4);
  }
  next.transactionLogs.unshift({
    id: `tx-trade-${Date.now()}`,
    date: today,
    type: '트레이드',
    teamId: myTeam,
    summary: `${myTeam} ↔ ${targetTeamId} 트레이드 성사: ${recNames} 영입 / ${giveNames} 이적`,
    detail: `${extras || '현금·지명권 이동 없음'} · 기존 계약·기록 100% 승계`,
  });

  pushNews(next, {
    date: today,
    category: '이적·계약',
    headline: `[트레이드 성사] ${KBO_TEAMS[myTeam].shortName} ${recNames} 영입 ↔ ${KBO_TEAMS[targetTeamId].shortName} ${giveNames}`,
    body: `양 구단 단장 협상 끝에 빅딜이 타결되었습니다. 이적 선수들의 기존 계약 조건과 통산·시즌 기록은 그대로 승계됩니다.${extras ? ` (추가 조건: ${extras})` : ''}`,
    teamId: myTeam,
    isHighlight: true,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

function addDraftedCandidateToCareer(
  next: CareerSave,
  teamId: TeamId,
  candId: number,
  round: number,
  pickInRound: number
): void {
  const ds = next.draftState;
  const cand = ds.candidates.find((c) => c.id === candId && !c.draftedBy);
  if (!cand) return;

  // 영구 고유 ID 기반 중복 지명 방지
  const permId = cand.permanentId ?? allocatePermanentPlayerId(next, 'KBO-AMA');
  cand.permanentId = permId;
  const alreadyDraftedPerm = Object.values(next.players).some(
    (p) => p.permanentId === permId && p.rosterTier !== '해외이적'
  );
  if (alreadyDraftedPerm) {
    cand.draftedBy = teamId;
    return;
  }

  const notation = `${round}R ${pickInRound}순위`;
  cand.draftedBy = teamId;
  cand.pickNotation = notation;

  const baseSlotOrder = round === 1 && ds.round1DraftOrder ? ds.round1DraftOrder : ds.draftOrder;
  const origTeam = baseSlotOrder[pickInRound - 1] ?? teamId;
  const provSlot = (ds.pickProvenance ?? []).find(
    (p) => p.round === round && p.originalTeamId === origTeam
  );

  ds.picks.push({
    round,
    pickInRound,
    pickNotation: notation,
    teamId,
    originalTeamId: provSlot?.originalTeamId ?? origTeam,
    acquiredViaTradeNote: provSlot?.acquiredViaTradeNote,
    candidateId: cand.id,
    playerName: cand.name,
    position: cand.position,
    ability: cand.ability,
    potential: cand.potential,
    signingBonusBillion: cand.signingBonusBillion,
  });

  const pid = `${teamId}-신인-${ds.season}-${cand.id}`;
  const overallPick = (round - 1) * 10 + pickInRound;
  const isFirstRounder = round === 1;
  const candBirthYear = cand.birthYear ?? ds.season - cand.age;
  const candBirthDate = cand.birthDate ?? null;
  const candResolvedAge = resolveAgeAtDate(
    { birthDate: candBirthDate, birthYear: candBirthYear, age: cand.age },
    next.currentDate ?? `${ds.season}-01-01`
  );
  next.players[pid] = {
    id: pid,
    originType: cand.isOverseasReturnee ? 'real' : 'virtual',
    permanentId: permId,
    birthYear: candBirthYear,
    birthDate: candBirthDate,
    firstRoundSpotlight: isFirstRounder,
    isOneClubMan: true,
    previousAnnualSalary: 0,
    careerTeamHistory: [
      {
        teamLabel: KBO_TEAMS[teamId].name,
        teamId,
        fromSeason: ds.season,
        note: `${ds.season} ${notation} 지명`,
      },
    ],
    name: cand.name,
    teamId,
    category: '국내',
    nationality: '한국',
    acquisitionInfo: {
      type: '드래프트',
      draftYear: ds.season,
      draftRound: round,
      draftPick: overallPick,
      label: `${ds.season} ${round}R 전체 ${overallPick}번 (${notation})${cand.isOverseasReturnee ? ' · 해외파복귀' : ''}`,
    },
    role: cand.role,
    position: cand.position,
    pitchRole: cand.role === '투수' ? (cand.position === 'SP' ? '선발' : '중간') : undefined,
    age: candResolvedAge,
    ability: cand.ability,
    potential: cand.potential,
    abilityStatus: '확정',
    form: isFirstRounder ? 1 : 0,
    fatigue: 0,
    lastPitchedRound: 0,
    consecutiveAppearances: 0,
    rosterTier: '2군',
    gameDayActive: false,
    uniformNumber: allocateTeamUniformNumber(
      next.players,
      teamId,
      false,
      undefined,
      getTeamRetiredNumbers(next, teamId)
    ),
    contract: {
      status: '확정',
      currency: 'KRW',
      years: 1,
      yearsRemaining: 1,
      startSeason: ds.season,
      endSeason: ds.season,
      annualSalary: 0.3,
      signingBonus: cand.signingBonusBillion,
      totalValue: cand.signingBonusBillion,
      note: `${ds.season} ${notation} · ${cand.school} (계약금 ${cand.signingBonusBillion}억)`,
    },
    injury: null,
    morale: isFirstRounder ? '만족' : '평가 대기',
    trainingFocus: null,
    serviceYears: 0,
    seasonRatingDelta: 0,
    lastEvaluatedAtTeamGames: 0,
    rookieInfo: {
      draftId: cand.id,
      pickNotation: notation,
      round,
      pickInRound,
      originType: cand.originType,
      school: cand.school,
      signingBonusBillion: cand.signingBonusBillion,
      amateurSummary: cand.amateurSummary,
    },
    stats: cand.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
    postseasonStats: cand.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
  };
  ensurePlayerRichMetadata(next.players[pid]);
  markUlsanPlayerDrafted(next, cand.name, teamId, `${ds.season}-09-15`);
  markAmateurOrOverseasDraftedInPlace(next, permId, teamId, ds.season);

  // 전체 구단 영입 현황 기록 (신인 드래프트 · 10개 구단 자동 기록)
  recordLeagueAcquisitionInPlace(
    next,
    {
      dedupeKey: `draft-${ds.season}-${overallPick}-${cand.id}`,
      season: ds.season,
      date: `${ds.season}-09-15`,
      category: '신인',
      playerId: pid,
      playerName: cand.name,
      position: cand.position,
      previousTeamLabel: `${cand.school} (${cand.originType})`,
      acquiringTeamId: teamId,
      contractAmountLabel: `계약금 ${cand.signingBonusBillion.toFixed(1)}억`,
      note: `${notation} 지명`,
    },
    { pushNewsAlert: false }
  );

  // 1라운더 특별 구단 효과 (팬 기대감 · 구단 인기도 상승 · 특보 발행)
  if (isFirstRounder) {
    const tState = next.teams[teamId];
    if (tState) {
      tState.fanSentiment = Math.min(100, (tState.fanSentiment ?? 65) + 2);
      tState.popularity = Math.min(100, tState.popularity + 1);
      if (teamId === next.playerTeamId) {
        tState.fanSentimentReason = `1라운더 특급 신인 ${cand.name}(${cand.school}) 지명으로 팬 기대감 고조`;
      }
    }
    if (teamId === next.playerTeamId || pickInRound === 1) {
      pushNews(next, {
        date: `${ds.season}-09-15`,
        category: '이적·계약',
        headline: `[1라운더 탄생] ${KBO_TEAMS[teamId].shortName}, ${notation} ${cand.school} ${cand.name}(${cand.position}) 지명!`,
        body: `${KBO_TEAMS[teamId].name}이 ${ds.season} KBO 신인 드래프트 1라운드 전체 ${overallPick}순위로 ${cand.school} 출신 ${cand.name}(능력 ${cand.ability} / 잠재 ${cand.potential} · 계약금 ${cand.signingBonusBillion}억 원)을 호명했습니다.`,
        teamId,
        isHighlight: true,
      });
    }
  }

  if (teamId === next.playerTeamId) {
    next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + cand.signingBonusBillion).toFixed(2));
    next.finances.obligations.push({
      id: `ob-draft-${pid}`,
      label: `신인 ${cand.name} (${notation}) 계약금`,
      currency: 'KRW',
      amount: cand.signingBonusBillion,
      paidAmount: 0,
    });
  }
}

function finalizeDraftIfDoneInPlace(next: CareerSave): void {
  const ds = next.draftState;
  if (ds.currentRound > 11 || ds.picks.length >= 110) {
    if (!ds.completed) {
      ds.completed = true;
      recordRookieSigningBonusTop10InPlace(next);
      const myPicks = ds.picks.filter((p) => p.teamId === next.playerTeamId);
      const bonusSum = myPicks.reduce((s, p) => s + p.signingBonusBillion, 0);
      next.transactionLogs.unshift({
        id: `tx-draft-done-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        type: '드래프트',
        teamId: next.playerTeamId,
        summary: `${ds.season} 신인 드래프트 11라운드(${ds.picks.length}픽) 완료 · ${next.playerTeamId} ${myPicks.length}명 지명`,
        detail: `지명 신인 계약금 합계 ${bonusSum.toFixed(1)}억 원 미지급 기장`,
      });
    }
  }
}

function advanceDraftPointer(ds: CareerSave['draftState']): void {
  if (ds.currentPickInRound < 10) {
    ds.currentPickInRound += 1;
  } else if (ds.currentRound < 11) {
    ds.currentRound += 1;
    ds.currentPickInRound = 1;
  } else {
    ds.currentRound = 12;
    ds.currentPickInRound = 1;
    ds.completed = true;
  }
}

function selectAiDraftCandidate(ds: CareerSave['draftState'], rng: SeededRng) {
  const available = ds.candidates
    .filter((c) => !c.draftedBy)
    .sort((a, b) => b.potential * 0.65 + b.ability - (a.potential * 0.65 + a.ability));
  if (available.length === 0) return null;
  const pickIdx = Math.min(available.length - 1, rng.int(0, Math.min(3, available.length - 1)));
  return available[pickIdx];
}

function assertRookieDraftDateOpen(career: CareerSave): void {
  // 기존 단위테스트(INTRO 초기 상태) 호환은 유지하되, 실제 게임 진행(정규시즌 및 온보딩 진행 단계)에서는
  // 공식 신인 드래프트 날짜(9월 15일) 이전 픽 진행을 엔진 레벨에서 원천 차단한다.
  if (career.phase === 'INTRO') return;
  const info = getRookieDraftScheduleInfo(career);
  if (info.isLockedBeforeDate) {
    throw new Error(
      `${info.draftClassYear} KBO 신인 드래프트는 공식 개최일(${info.formattedDate} · D-${info.daysRemaining}일)부터 진행할 수 있습니다.`
    );
  }
}

/**
 * Advances exactly ONE AI draft pick across ALL rounds (1R~11R).
 * Stops and throws if it is currently the user's pick.
 */
export function stepNextDraftPick(
  career: CareerSave
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  assertRookieDraftDateOpen(career);
  const dsCur = career.draftState;
  if (dsCur.completed || dsCur.currentRound > 11) {
    throw new Error('1~11라운드 신인 드래프트가 모두 종료되었습니다.');
  }
  const currentTeam = getDraftPickingTeamForSlot(dsCur, dsCur.currentRound, dsCur.currentPickInRound);
  if (currentTeam === career.playerTeamId) {
    throw new Error('현재 내 구단 지명 차례입니다. 아래 드래프트 풀에서 선수를 직접 지명하세요.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const ds = next.draftState;
  const rng = new SeededRng(next.rngState);

  const chosen = selectAiDraftCandidate(ds, rng);
  if (!chosen) {
    throw new Error('지명 가능한 드래프트 후보가 없습니다.');
  }
  addDraftedCandidateToCareer(next, currentTeam, chosen.id, ds.currentRound, ds.currentPickInRound);
  advanceDraftPointer(ds);
  finalizeDraftIfDoneInPlace(next);

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * Advances AI picks one by one until the user's club is on the clock (across full 1R~11R).
 */
export function advanceDraftUntilUserTurn(
  career: CareerSave
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  assertRookieDraftDateOpen(career);
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const ds = next.draftState;
  if (ds.completed || ds.currentRound > 11) {
    return { nextCareer: next, backupSnapshot };
  }

  const rng = new SeededRng(next.rngState);
  while (!ds.completed && ds.currentRound <= 11) {
    const pickingTeam = getDraftPickingTeamForSlot(ds, ds.currentRound, ds.currentPickInRound);
    if (pickingTeam === next.playerTeamId) break;
    const chosen = selectAiDraftCandidate(ds, rng);
    if (!chosen) break;
    addDraftedCandidateToCareer(next, pickingTeam, chosen.id, ds.currentRound, ds.currentPickInRound);
    advanceDraftPointer(ds);
  }
  finalizeDraftIfDoneInPlace(next);

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * Picks a candidate for the user's team across ANY round (1R~11R), advancing by exactly 1 pick.
 */
export function pickDraftCandidateForUser(
  career: CareerSave,
  candidateId: number
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  assertRookieDraftDateOpen(career);
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const ds = next.draftState;
  if (ds.completed || ds.currentRound > 11) {
    throw new Error('이미 1~11라운드 드래프트가 완료되었습니다.');
  }

  const rng = new SeededRng(next.rngState);

  // If AI picks precede the user's current pick, step up to the user's clock first
  while (!ds.completed && ds.currentRound <= 11) {
    const pickingTeam = getDraftPickingTeamForSlot(ds, ds.currentRound, ds.currentPickInRound);
    if (pickingTeam === next.playerTeamId) break;
    const chosen = selectAiDraftCandidate(ds, rng);
    if (!chosen) break;
    addDraftedCandidateToCareer(next, pickingTeam, chosen.id, ds.currentRound, ds.currentPickInRound);
    advanceDraftPointer(ds);
  }

  if (ds.completed || ds.currentRound > 11) {
    finalizeDraftIfDoneInPlace(next);
    next.rngState = rng.getState();
    next.version = bumpVersion(next.version);
    next.updatedAt = new Date().toISOString();
    return { nextCareer: next, backupSnapshot };
  }

  const pickingTeam = getDraftPickingTeamForSlot(ds, ds.currentRound, ds.currentPickInRound);
  if (pickingTeam !== next.playerTeamId) {
    throw new Error('현재 내 구단 지명 차례가 아닙니다.');
  }

  const target = ds.candidates.find((c) => c.id === candidateId && !c.draftedBy);
  if (!target) throw new Error('선택할 수 없는 드래프트 후보입니다.');
  addDraftedCandidateToCareer(next, pickingTeam, target.id, ds.currentRound, ds.currentPickInRound);
  advanceDraftPointer(ds);
  finalizeDraftIfDoneInPlace(next);

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * Full or remaining auto-draft completion (1R~11R 전체 자동 지명 및 잔여 자동 완료)
 */
export function autoCompleteRemainingDraft(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  assertRookieDraftDateOpen(career);
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const ds = next.draftState;
  const rng = new SeededRng(next.rngState);

  while (!ds.completed && ds.currentRound <= 11) {
    const teamId = getDraftPickingTeamForSlot(ds, ds.currentRound, ds.currentPickInRound);
    const available = ds.candidates
      .filter((c) => !c.draftedBy)
      .sort((a, b) => b.potential * 0.6 + b.ability - (a.potential * 0.6 + a.ability));

    if (available.length === 0) break;
    const pickIdx = Math.min(available.length - 1, rng.int(0, Math.min(5, available.length - 1)));
    addDraftedCandidateToCareer(next, teamId, available[pickIdx].id, ds.currentRound, ds.currentPickInRound);

    if (ds.currentPickInRound < 10) {
      ds.currentPickInRound += 1;
    } else if (ds.currentRound < 11) {
      ds.currentRound += 1;
      ds.currentPickInRound = 1;
    } else {
      ds.completed = true;
      break;
    }
  }

  ds.completed = true;
  recordRookieSigningBonusTop10InPlace(next);
  const myPicks = ds.picks.filter((p) => p.teamId === next.playerTeamId);
  const bonusSum = myPicks.reduce((s, p) => s + p.signingBonusBillion, 0);

  next.transactionLogs.unshift({
    id: `tx-draft-done-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '드래프트',
    teamId: next.playerTeamId,
    summary: `특별 신인 드래프트 11라운드(110픽) 완료 · ${next.playerTeamId} ${myPicks.length}명 지명`,
    detail: `지명 신인 계약금 합계 ${bonusSum.toFixed(1)}억 원 미지급 기장`,
  });

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function updateRosterPlacement(
  career: CareerSave,
  playerId: string,
  action: {
    rosterTier?: RosterTier;
    gameDayActive?: boolean;
    trainingFocus?: TrainingFocus;
    positionTrainingTarget?: Position | null;
  }
): CareerSave {
  const next = cloneCareer(career);
  const p = next.players[playerId];
  if (!p || p.teamId !== next.playerTeamId) return career;

  if (action.rosterTier !== undefined) {
    if (action.rosterTier === '1군') {
      if (isMilitaryServing(p.militaryStatus)) {
        throw new Error(
          `${p.name} 선수는 현재 상무 피닉스 군 복무 중${p.militaryReturnSeason ? `(${p.militaryReturnSeason}시즌 전역 예정)` : ''}이므로 1군에 콜업할 수 없습니다.`
        );
      }
      if (p.rosterTier === '육성') {
        throw new Error(`${p.name} 선수는 육성선수입니다. 먼저 정식선수 전환(2군 등록)을 완료한 뒤 1군에 콜업하세요.`);
      }
      const current1st = Object.values(next.players).filter(
        (x) => x.teamId === next.playerTeamId && x.rosterTier === '1군'
      );
      if (current1st.length >= 30 && p.rosterTier !== '1군') {
        throw new Error('1군 등록 엔트리는 최대 30명입니다. 먼저 다른 선수를 2군으로 내리세요.');
      }
    }
    p.rosterTier = action.rosterTier;
    if (action.rosterTier !== '1군') {
      p.gameDayActive = false;
      const t = next.teams[next.playerTeamId];
      t.lineupOrder = t.lineupOrder.filter((id) => id !== playerId);
      t.benchOrder = t.benchOrder.filter((id) => id !== playerId);
      t.rotationOrder = t.rotationOrder.filter((id) => id !== playerId);
      t.bullpenOrder = t.bullpenOrder.filter((id) => id !== playerId);
    } else if (p.role === '타자') {
      next.teams[next.playerTeamId].benchOrder.push(playerId);
    } else {
      next.teams[next.playerTeamId].bullpenOrder.push(playerId);
    }
  }

  if (action.gameDayActive !== undefined) {
    if (action.gameDayActive && isMilitaryServing(p.militaryStatus)) {
      throw new Error(`${p.name} 선수는 상무 피닉스 군 복무 중이므로 1군 출장 명단에 등록할 수 없습니다.`);
    }
    if (action.gameDayActive && p.rosterTier !== '1군') {
      throw new Error('1군 등록 선수만 당일 출장 명단에 넣을 수 있습니다.');
    }
    if (action.gameDayActive && p.injury) {
      throw new Error(`${p.name} 선수는 부상 회복 중(${p.injury.daysRemaining}일 남음)입니다.`);
    }
    if (action.gameDayActive) {
      const activeCount = Object.values(next.players).filter(
        (x) => x.teamId === next.playerTeamId && x.rosterTier === '1군' && x.gameDayActive
      ).length;
      if (activeCount >= 28 && !p.gameDayActive) {
        throw new Error('당일 출장 엔트리는 최대 28명입니다.');
      }
    }
    p.gameDayActive = action.gameDayActive;
  }

  if (action.trainingFocus !== undefined) {
    p.trainingFocus = action.trainingFocus;
  }

  if (action.positionTrainingTarget !== undefined) {
    if (p.role === '타자') {
      const target = action.positionTrainingTarget;
      if (target && target !== p.position && ALL_FIELD_POSITIONS.includes(target)) {
        ensurePlayerPositionProficiencyInPlace(p);
        p.positionTrainingTarget = target;
      } else {
        p.positionTrainingTarget = null;
      }
    } else {
      p.positionTrainingTarget = null;
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * 2군/대기 선수를 1군 엔트리로 콜업합니다. (최대 30인, 당일 출장 28인 자동 배정 + 로그 기록)
 * 상무 피닉스 군 복무 중인 선수는 전역 복귀 전까지 1군 콜업을 엄격히 차단합니다.
 */
export function callUpPlayer(career: CareerSave, playerId: string): CareerSave {
  const pCur = career.players[playerId];
  if (!pCur || pCur.teamId !== career.playerTeamId) {
    throw new Error('콜업할 소속 선수를 찾을 수 없습니다.');
  }
  if (isMilitaryServing(pCur.militaryStatus)) {
    throw new Error(
      `${pCur.name} 선수는 현재 상무 피닉스 군 복무 중${pCur.militaryReturnSeason ? `(${pCur.militaryReturnSeason}시즌 전역 예정)` : ''}이므로 1군에 콜업할 수 없습니다.`
    );
  }
  if (pCur.rosterTier === '1군') {
    throw new Error(`${pCur.name} 선수는 이미 1군 엔트리에 등록되어 있습니다.`);
  }
  if (pCur.rosterTier === '육성') {
    throw new Error(`${pCur.name} 선수는 육성선수(등번호 #${pCur.uniformNumber ?? '100+'})입니다. 먼저 '정식선수 전환'을 완료해야 1군 콜업이 가능합니다.`);
  }
  if (pCur.rosterTier === '은퇴' || pCur.rosterTier === '해외이적' || pCur.rosterTier === '제외후보') {
    throw new Error(`${pCur.name} 선수는 현재 1군 콜업 대상이 아닙니다.`);
  }

  const next = cloneCareer(career);
  const teamId = next.playerTeamId;
  const p = next.players[playerId];
  const current1st = Object.values(next.players).filter(
    (x) => x.teamId === teamId && x.rosterTier === '1군'
  );
  if (current1st.length >= 30) {
    throw new Error('1군 등록 엔트리(최대 30명)가 가득 찼습니다. 먼저 다른 선수를 2군으로 강등하세요.');
  }

  const activeCount = current1st.filter((x) => x.gameDayActive).length;
  p.rosterTier = '1군';
  p.gameDayActive = !p.injury && activeCount < 28;
  p.morale = '만족';

  const t = next.teams[teamId];
  t.lineupOrder = t.lineupOrder.filter((id) => id !== playerId);
  t.benchOrder = t.benchOrder.filter((id) => id !== playerId);
  t.rotationOrder = t.rotationOrder.filter((id) => id !== playerId);
  t.bullpenOrder = t.bullpenOrder.filter((id) => id !== playerId);

  if (p.role === '투수') {
    if (p.pitchRole === '선발' && t.rotationOrder.length < 5) {
      t.rotationOrder.push(playerId);
    } else {
      t.bullpenOrder.push(playerId);
    }
  } else {
    if (t.lineupOrder.length < 9 && !p.injury) {
      t.lineupOrder.push(playerId);
      t.lineupPositions[playerId] = p.position;
    } else {
      t.benchOrder.push(playerId);
    }
  }

  next.transactionLogs.unshift({
    id: `tx-callup-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '엔트리',
    teamId,
    summary: `1군 콜업: ${p.name} (${p.position} · 능력치 ${p.ability}/${p.potential})`,
    detail: p.gameDayActive ? '1군 등록 및 당일 출장 명단 포함' : '1군 등록 완료 (출장 명단 대기)',
  });

  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * 1군 선수를 2군(퓨처스)으로 강등(엔트리 말소)합니다. 주전 타순 공석 시 1군 벤치에서 자동 보충합니다.
 */
export function demotePlayer(career: CareerSave, playerId: string): CareerSave {
  const pCur = career.players[playerId];
  if (!pCur || pCur.teamId !== career.playerTeamId) {
    throw new Error('강등할 소속 선수를 찾을 수 없습니다.');
  }
  if (pCur.rosterTier !== '1군') {
    throw new Error(`${pCur.name} 선수는 현재 1군 엔트리 소속이 아닙니다.`);
  }

  const next = cloneCareer(career);
  const teamId = next.playerTeamId;
  const p = next.players[playerId];
  const t = next.teams[teamId];

  const wasInLineup = t.lineupOrder.includes(playerId);
  p.rosterTier = '2군';
  p.gameDayActive = false;
  recordPlayerDemotionDissatisfactionInPlace(next, p);

  t.lineupOrder = t.lineupOrder.filter((id) => id !== playerId);
  t.benchOrder = t.benchOrder.filter((id) => id !== playerId);
  t.rotationOrder = t.rotationOrder.filter((id) => id !== playerId);
  t.bullpenOrder = t.bullpenOrder.filter((id) => id !== playerId);

  // Auto-fill vacated lineup slot from healthy 1군 bench hitter
  if (wasInLineup && t.lineupOrder.length < 9) {
    const benchCandidate = t.benchOrder
      .map((id) => next.players[id])
      .filter((x): x is Player => Boolean(x && x.role === '타자' && x.rosterTier === '1군' && !x.injury))
      .sort((a, b) => b.ability - a.ability)[0];
    if (benchCandidate) {
      t.lineupOrder.push(benchCandidate.id);
      t.benchOrder = t.benchOrder.filter((id) => id !== benchCandidate.id);
      t.lineupPositions[benchCandidate.id] = benchCandidate.position;
    }
  }

  next.transactionLogs.unshift({
    id: `tx-demote-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '엔트리',
    teamId,
    summary: `2군 강등(엔트리 말소): ${p.name} (${p.position} · 능력치 ${p.ability})`,
    detail: '2군 퓨처스리그 합류 · 컨디션 회복 및 육성 훈련 전환',
  });

  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * KBO 공식 육성선수 규칙에 따라 육성선수를 정식선수(2군)로 등록 전환합니다.
 * - 정식선수 68명 정원 검사 (육성선수는 별도 관리)
 * - 매년 5월 1일 이후 전환 허용
 * - 드래프트 이력 및 등록 자격 필수 검사
 * - 정식 전환 후에도 1군 엔트리 등록은 별도 처리 (2군 등록)
 * - 기존 계약, 능력치, 경기 기록은 그대로 유지
 */
export function convertDevelopmentalPlayer(
  career: CareerSave,
  playerId: string
): CareerSave {
  const audit = checkDevelopmentalConversionEligibility(career, playerId, career.playerTeamId);
  if (!audit.eligible) {
    throw new Error(audit.reasons[0] ?? '육성선수 정식 전환 조건을 충족하지 못했습니다.');
  }

  const next = cloneCareer(career);
  ensureFranchiseState(next);
  const teamId = next.playerTeamId;
  const p = next.players[playerId];
  const { oldNumber, newNumber, draftAuditNote } = applyDevelopmentalConversionInPlace(
    next,
    playerId,
    teamId,
    getTeamRetiredNumbers(next, teamId)
  );
  const isoDate = getCurrentCareerDate(next).isoDate;

  next.transactionLogs.unshift({
    id: `tx-dev-conv-${Date.now()}`,
    date: isoDate,
    type: '육성',
    teamId,
    summary: `육성선수 정식선수 전환(2군 등록): ${p.name} (#${oldNumber ?? '-'} → #${newNumber})`,
    detail: `${draftAuditNote} · 정식 정원 ${audit.officialRosterCount + 1}/68명 · 기존 계약·능력치·기록 유지 (1군 콜업은 별도 진행)`,
  });

  pushNews(next, {
    date: isoDate,
    category: '이적·계약',
    headline: `[정식선수 전환] ${KBO_TEAMS[teamId].shortName}, 육성선수 ${p.name} 2군 정식 등록 (#${newNumber})`,
    body: `${p.name}(${p.age}세 · ${p.position}) 선수가 5월 1일 이후 정식선수 등록 자격 심사를 통과해 등번호 ${newNumber}번의 정식선수(2군)로 전환됐습니다. 기존 계약과 기록은 유지되며 1군 엔트리 등록은 단장 판단으로 별도 진행됩니다.`,
    teamId,
  });

  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * 육성선수를 위약금 없이 자유롭게 방출합니다. (KBO 육성선수 자유 방출 규정)
 */
export function releaseDevelopmentalPlayer(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const pCur = career.players[playerId];
  if (!pCur || pCur.teamId !== career.playerTeamId) {
    throw new Error('방출할 소속 육성선수를 찾을 수 없습니다.');
  }
  if (pCur.rosterTier !== '육성') {
    throw new Error(`${pCur.name} 선수는 육성선수가 아닙니다. 정식선수는 웨이버 방출 절차를 이용하세요.`);
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const p = next.players[playerId];
  const teamId = next.playerTeamId;
  const isoDate = getCurrentCareerDate(next).isoDate;

  p.rosterTier = 'FA';
  p.formerTeamId = teamId;
  p.gameDayActive = false;
  p.contract = {
    ...p.contract,
    status: '만료',
    yearsRemaining: 0,
    note: `${isoDate} 육성선수 자유 방출`,
  };
  const t = next.teams[teamId];
  t.lineupOrder = t.lineupOrder.filter((id) => id !== playerId);
  t.benchOrder = t.benchOrder.filter((id) => id !== playerId);
  t.rotationOrder = t.rotationOrder.filter((id) => id !== playerId);
  t.bullpenOrder = t.bullpenOrder.filter((id) => id !== playerId);

  next.transactionLogs.unshift({
    id: `tx-dev-rel-${Date.now()}`,
    date: isoDate,
    type: '육성',
    teamId,
    summary: `육성선수 자유 방출: ${p.name} (${p.position} · 위약금 없음)`,
    detail: '육성선수 규정상 정식 68인 정원 및 구단 자금 부담 없이 자유 방출 완료',
  });

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * #3: 투수 선발진 로테이션 순번 변경 (1선발~5선발 순서 재배치)
 */
export function reorderStartingRotation(
  career: CareerSave,
  fromIndex: number,
  toIndex: number
): CareerSave {
  const next = cloneCareer(career);
  const team = next.teams[next.playerTeamId];
  const rot = [...team.rotationOrder];
  if (
    fromIndex < 0 ||
    fromIndex >= rot.length ||
    toIndex < 0 ||
    toIndex >= rot.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const [moved] = rot.splice(fromIndex, 1);
  rot.splice(toIndex, 0, moved);
  team.rotationOrder = rot;
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * #3: 1군 투수를 선발 로테이션 ↔ 불펜으로 보직 전환
 */
export function togglePitcherRotationSpot(
  career: CareerSave,
  pitcherId: string
): CareerSave {
  const pCur = career.players[pitcherId];
  if (!pCur || pCur.teamId !== career.playerTeamId || pCur.role !== '투수') {
    throw new Error('보직을 변경할 투수를 찾을 수 없습니다.');
  }
  const next = cloneCareer(career);
  const team = next.teams[next.playerTeamId];
  const p = next.players[pitcherId];
  const inRot = team.rotationOrder.includes(pitcherId);

  if (inRot) {
    if (team.rotationOrder.length <= 3) {
      throw new Error('선발 로테이션은 최소 3명 이상 유지해야 합니다.');
    }
    team.rotationOrder = team.rotationOrder.filter((id) => id !== pitcherId);
    if (!team.bullpenOrder.includes(pitcherId)) {
      team.bullpenOrder = [pitcherId, ...team.bullpenOrder];
    }
    p.pitchRole = '롱릴리프';
    p.dissatisfaction = Math.min(100, (p.dissatisfaction ?? 20) + 6);
  } else {
    if (team.rotationOrder.length >= 6) {
      throw new Error('선발 로테이션은 최대 6명까지 편성할 수 있습니다. 기존 선발을 먼저 불펜으로 전환하세요.');
    }
    team.bullpenOrder = team.bullpenOrder.filter((id) => id !== pitcherId);
    team.rotationOrder = [...team.rotationOrder, pitcherId];
    p.pitchRole = '선발';
    p.dissatisfaction = Math.max(0, (p.dissatisfaction ?? 20) - 5);
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * 개별 선수 최적 집중 훈련 추천 로직 (역할·포지션·연령·잠재력·피로도 기반)
 */
export function computeRecommendedTrainingFocus(player: Player): {
  focus: Exclude<TrainingFocus, null>;
  reason: string;
} {
  if (player.fatigue >= 55 || player.age >= 36) {
    return {
      focus: '체력',
      reason:
        player.fatigue >= 55
          ? `누적 피로(${player.fatigue}%) 관리 및 부상 예방`
          : `베테랑(${player.age}세) 내구성·컨디션 유지`,
    };
  }
  if (player.role === '투수') {
    const gap = player.potential - player.ability;
    if (player.pitchRole === '마무리' || player.pitchRole === '필승조') {
      return { focus: '구위', reason: '불펜 핵심 탈삼진·압도적 구위 강화' };
    }
    if (player.age <= 25 && gap >= 5) {
      return { focus: '구위', reason: `유망주(${player.age}세 · 잠재 ${player.potential}) 구속·구위 잠재력 개방` };
    }
    return { focus: '제구', reason: '이닝 소화력·볼넷 억제(WHIP 안정화)' };
  }
  if ((player.position === 'C' || player.position === 'SS' || player.position === '2B') && player.ability < 80) {
    return { focus: '수비', reason: `센터라인(${player.position}) 수비 안정성 및 실책 억제` };
  }
  if (player.position === 'CF' && player.age <= 27) {
    return { focus: '주루', reason: '외야 기동력·도루 및 수비 범위 극대화' };
  }
  return {
    focus: '타격',
    reason:
      player.potential - player.ability >= 5
        ? `타격 잠재력(${player.potential}) 조기 개화`
        : '타율·장타력(OPS) 생산성 극대화',
  };
}

/**
 * 구단 전체 활동 선수(1군·2군·육성·대기)에 추천 집중 훈련을 한 번에 일괄 적용합니다.
 */
export function applyRecommendedTrainingBatch(
  career: CareerSave
): { nextCareer: CareerSave; changedCount: number; summary: string } {
  const next = cloneCareer(career);
  const teamId = next.playerTeamId;
  let changedCount = 0;
  const focusCounts: Record<string, number> = {};

  for (const p of Object.values(next.players)) {
    if (
      p.teamId !== teamId ||
      p.rosterTier === '은퇴' ||
      p.rosterTier === '해외이적' ||
      p.rosterTier === '제외후보'
    ) {
      continue;
    }
    const rec = computeRecommendedTrainingFocus(p);
    if (p.trainingFocus !== rec.focus) {
      p.trainingFocus = rec.focus;
      changedCount++;
    }
    focusCounts[rec.focus] = (focusCounts[rec.focus] ?? 0) + 1;
  }

  const breakdown = Object.entries(focusCounts)
    .map(([k, v]) => `${k} ${v}명`)
    .join(' · ');

  const summary =
    changedCount > 0
      ? `선수단 추천 훈련 일괄 배정 완료 (${changedCount}명 변경 · ${breakdown})`
      : `선수단 전원 이미 최적 추천 훈련 배정 상태입니다 (${breakdown})`;

  if (changedCount > 0) {
    next.transactionLogs.unshift({
      id: `tx-train-batch-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      type: '육성',
      teamId,
      summary: `추천 훈련 일괄 적용 (${changedCount}명 배정)`,
      detail: breakdown,
    });
  }

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, changedCount, summary };
}

export function acknowledgeChampionEvent(career: CareerSave): CareerSave {
  if (!career.postseason.championEvent) return career;
  const next = cloneCareer(career);
  if (next.postseason.championEvent) {
    next.postseason.championEvent.acknowledged = true;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function swapLineupOrder(
  career: CareerSave,
  indexA: number,
  indexB: number
): CareerSave {
  const next = cloneCareer(career);
  const lineup = next.teams[next.playerTeamId].lineupOrder;
  if (indexA < 0 || indexB < 0 || indexA >= lineup.length || indexB >= lineup.length) return career;
  [lineup[indexA], lineup[indexB]] = [lineup[indexB], lineup[indexA]];
  next.updatedAt = new Date().toISOString();
  return next;
}

export function setLineupSlot(
  career: CareerSave,
  slotIndex: number,
  playerId: string,
  position?: Position
): CareerSave {
  const next = cloneCareer(career);
  const team = next.teams[next.playerTeamId];
  const incoming = next.players[playerId];
  if (!incoming || incoming.teamId !== next.playerTeamId || incoming.role !== '타자') {
    throw new Error('라인업에 배치할 소속 타자를 찾을 수 없습니다.');
  }
  if (incoming.rosterTier === '육성') {
    throw new Error(`${incoming.name} 선수는 육성선수이므로 정식 등록 전까지 1군 라인업에 출전할 수 없습니다.`);
  }
  if (isMilitaryServing(incoming.militaryStatus)) {
    throw new Error(`${incoming.name} 선수는 상무 복무 중이므로 1군 라인업에 출전할 수 없습니다.`);
  }
  if (incoming.rosterTier !== '1군') {
    throw new Error(`${incoming.name} 선수는 1군 엔트리에 등록된 선수만 선발 라인업에 배치할 수 있습니다.`);
  }

  const oldId = team.lineupOrder[slotIndex];
  const oldSlotPos = oldId ? team.lineupPositions[oldId] ?? next.players[oldId]?.position : undefined;
  const existingIdx = team.lineupOrder.indexOf(playerId);

  if (existingIdx >= 0) {
    [team.lineupOrder[slotIndex], team.lineupOrder[existingIdx]] = [
      team.lineupOrder[existingIdx],
      team.lineupOrder[slotIndex],
    ];
  } else {
    team.lineupOrder[slotIndex] = playerId;
    team.benchOrder = team.benchOrder.filter((id) => id !== playerId);
    if (oldId && !team.benchOrder.includes(oldId)) team.benchOrder.push(oldId);
    incoming.gameDayActive = true;
  }

  // Determine target fielding position: explicit position, or slot's previous position / natural position / DH
  const targetPos: Position =
    position ??
    (existingIdx >= 0
      ? team.lineupPositions[playerId] ?? incoming.position
      : oldSlotPos ?? incoming.position);

  if (!ALL_HITTER_LINEUP_POSITIONS.includes(targetPos)) {
    throw new Error(`유효하지 않은 야수 포지션(${targetPos})입니다.`);
  }
  ensurePlayerPositionProficiencyInPlace(incoming);

  // Enforce: NO duplicate positions in the starting 9 (one player per C,1B,2B,3B,SS,LF,CF,RF,DH)
  // 주 포지션과 보조 포지션(및 비상 수비 포지션) 모두 선발 배치 가능하며, 기존 동일 포지션 선수가 있으면 자연스럽게 스왑 시도
  const conflictingId = team.lineupOrder.find((lid) => {
    if (lid === playerId) return false;
    const pos = team.lineupPositions[lid] ?? next.players[lid]?.position;
    return pos === targetPos;
  });

  if (conflictingId) {
    const conflictPlayer = next.players[conflictingId];
    const incomingPrevPos =
      existingIdx >= 0 ? team.lineupPositions[playerId] ?? incoming.position : oldSlotPos;

    // 1) 같은 선발 9명 내부에서 포지션 맞바꾸기 (예: 3B ↔ 1B, SS ↔ 2B, 수비 ↔ DH)
    if (
      conflictPlayer &&
      incomingPrevPos &&
      incomingPrevPos !== targetPos &&
      ALL_HITTER_LINEUP_POSITIONS.includes(incomingPrevPos)
    ) {
      const prevPosOccupied = team.lineupOrder.some((lid) => {
        if (lid === conflictingId || lid === playerId) return false;
        const pos = team.lineupPositions[lid] ?? next.players[lid]?.position;
        return pos === incomingPrevPos;
      });
      if (!prevPosOccupied) {
        team.lineupPositions[conflictingId] = incomingPrevPos;
      } else {
        throw new Error(
          `선발 라인업에 ${targetPos} 포지션(${conflictPlayer.name})이 이미 있습니다. 한 자리에 한 포지션만 배치할 수 있습니다.`
        );
      }
    } else if (conflictPlayer) {
      // 2) 기존 선수의 주 포지션 또는 숙련 보조 포지션 중 비어 있는 자리로 자동 이동 시도
      const candidateAltPositions: Position[] = (
        [
          conflictPlayer.position,
          ...(conflictPlayer.secondaryPositions ?? []),
          'DH',
        ] as Position[]
      ).filter((cand, idx, arr) => cand !== targetPos && arr.indexOf(cand) === idx);

      const freeAltPos = candidateAltPositions.find((cand) => {
        const occupied = team.lineupOrder.some((lid) => {
          if (lid === conflictingId || lid === playerId) return false;
          const pos = team.lineupPositions[lid] ?? next.players[lid]?.position;
          return pos === cand;
        });
        return !occupied && (cand === 'DH' || getPositionProficiency(conflictPlayer, cand) >= 55);
      });

      if (freeAltPos) {
        team.lineupPositions[conflictingId] = freeAltPos;
      } else {
        throw new Error(
          `선발 라인업에 ${targetPos} 포지션(${conflictPlayer.name})이 이미 배치되어 있습니다. 먼저 기존 선수의 포지션을 비워주세요.`
        );
      }
    }
  }

  team.lineupPositions[playerId] = targetPos;
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * #6: 선발 로테이션 특정 순번 투수와 1군 불펜 투수를 직접 1:1 교체
 */
export function swapRotationWithBullpen(
  career: CareerSave,
  rotationIndex: number,
  bullpenPlayerId: string
): CareerSave {
  const next = cloneCareer(career);
  const team = next.teams[next.playerTeamId];
  if (rotationIndex < 0 || rotationIndex >= team.rotationOrder.length) {
    throw new Error('유효하지 않은 선발 순번입니다.');
  }
  const outgoingId = team.rotationOrder[rotationIndex];
  const incoming = next.players[bullpenPlayerId];
  if (!incoming || incoming.teamId !== next.playerTeamId || incoming.role !== '투수') {
    throw new Error('교체할 투수를 찾을 수 없습니다.');
  }
  if (outgoingId === bullpenPlayerId) return next;

  const existingRotIdx = team.rotationOrder.indexOf(bullpenPlayerId);
  if (existingRotIdx >= 0) {
    [team.rotationOrder[rotationIndex], team.rotationOrder[existingRotIdx]] = [
      team.rotationOrder[existingRotIdx],
      team.rotationOrder[rotationIndex],
    ];
  } else {
    team.rotationOrder[rotationIndex] = bullpenPlayerId;
    team.bullpenOrder = team.bullpenOrder.filter((id) => id !== bullpenPlayerId);
    if (outgoingId && !team.bullpenOrder.includes(outgoingId)) {
      team.bullpenOrder.unshift(outgoingId);
    }
    incoming.pitchRole = '선발';
    incoming.gameDayActive = true;
    incoming.dissatisfaction = Math.max(0, (incoming.dissatisfaction ?? 20) - 5);
    if (outgoingId && next.players[outgoingId]) {
      next.players[outgoingId].pitchRole = '롱릴리프';
      next.players[outgoingId].dissatisfaction = Math.min(
        100,
        (next.players[outgoingId].dissatisfaction ?? 20) + 6
      );
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * #6: 1군 불펜 투수 등판 우선순위 변경
 */
export function reorderBullpen(
  career: CareerSave,
  fromIndex: number,
  toIndex: number
): CareerSave {
  const next = cloneCareer(career);
  const teamId = next.playerTeamId;
  const team = next.teams[teamId];
  const validIds = Object.values(next.players)
    .filter(
      (p) =>
        p.teamId === teamId &&
        p.role === '투수' &&
        p.rosterTier === '1군' &&
        !team.rotationOrder.includes(p.id)
    )
    .map((p) => p.id);
  const bp = [
    ...team.bullpenOrder.filter((id) => validIds.includes(id)),
    ...validIds.filter((id) => !team.bullpenOrder.includes(id)),
  ];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= bp.length || toIndex >= bp.length || fromIndex === toIndex) {
    team.bullpenOrder = bp;
    return next;
  }
  const [moved] = bp.splice(fromIndex, 1);
  bp.splice(toIndex, 0, moved);
  team.bullpenOrder = bp;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function holdPlayerMeeting(
  career: CareerSave,
  playerId: string,
  approach: '출전보장' | '역할설명' | '격려'
): CareerSave {
  const next = cloneCareer(career);
  const p = next.players[playerId];
  if (!p) return career;

  const curScore = getPlayerDissatisfaction(p);
  if (approach === '출전보장' || approach === '격려') {
    p.dissatisfaction = Math.max(0, curScore - 10);
    p.form = Math.min(5, p.form + 1);
  } else {
    p.dissatisfaction = Math.max(0, curScore - 6);
  }
  syncPlayerMoraleFromDissatisfaction(p);
  next.transactionLogs.unshift({
    id: `tx-talk-${Date.now()}`,
    date: getCurrentCareerDate(next).isoDate,
    type: '면담',
    teamId: next.playerTeamId,
    summary: `${p.name} 선수 면담 (${approach}) → 불만도 ${p.dissatisfaction} (${getDissatisfactionLevel(p.dissatisfaction ?? 0)})`,
  });
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * Exact MLB-KBO Posting Transfer Fee Formula (v4.59):
 * 20% of first $25M + 17.5% of next $25M + 15% of amount over $50M.
 */
export function calculateMlbPostingFeeUsd(guaranteedUsdMillions: number): number {
  const first25 = Math.min(25, guaranteedUsdMillions) * 0.2;
  const next25 = Math.max(0, Math.min(25, guaranteedUsdMillions - 25)) * 0.175;
  const over50 = Math.max(0, guaranteedUsdMillions - 50) * 0.15;
  return Math.round((first25 + next25 + over50) * 1_000_000);
}

export interface MlbPostingReadiness {
  eligible: boolean;
  tier: '유력' | '적합' | '도전적' | '부적합';
  ageSuitability: '최적' | '양호' | '주의' | '부적합';
  recentStatNote?: string;
  acceptanceChancePct: number;
  estimatedGuaranteeRange: string;
  reason: string;
}

function computeRecentPerformanceAdjustmentForMlb(player: Player): { delta: number; label: string } {
  if (player.role === '타자') {
    const bs = player.stats as BatterStats;
    const pa = bs.PA ?? 0;
    if (pa < 120) return { delta: 0, label: '최근 표본 적음(능력치 중심 평가)' };
    const ops = calcOPS(bs) ?? 0.76;
    const avg = calcAVG(bs.H, bs.AB) ?? 0.27;
    const hr = bs.HR ?? 0;
    if (ops >= 0.94 || (ops >= 0.88 && hr >= 26)) {
      return { delta: 4, label: `최근 성적 최상위 (OPS ${ops.toFixed(3)} · ${hr}HR)` };
    }
    if (ops >= 0.85 || avg >= 0.315) {
      return { delta: 2, label: `최근 성적 우수 (OPS ${ops.toFixed(3)})` };
    }
    if (ops < 0.74) {
      return { delta: -5, label: `최근 성적 부진 (OPS ${ops.toFixed(3)})` };
    }
    return { delta: 0, label: `최근 성적 보통 (OPS ${ops.toFixed(3)})` };
  }
  const ps = player.stats as PitcherStats;
  const outs = ps.outs ?? 0;
  if (outs < 120) return { delta: 0, label: '최근 표본 적음(능력치 중심 평가)' };
  const era = calcERA(ps.ER, outs) ?? 3.8;
  const wins = ps.W ?? 0;
  const saves = ps.SV ?? 0;
  if (era <= 2.65 || (era <= 3.05 && (wins >= 14 || saves >= 32))) {
    return { delta: 4, label: `최근 성적 최상위 (ERA ${era.toFixed(2)})` };
  }
  if (era <= 3.35) {
    return { delta: 2, label: `최근 성적 우수 (ERA ${era.toFixed(2)})` };
  }
  if (era >= 4.45) {
    return { delta: -5, label: `최근 성적 부진 (ERA ${era.toFixed(2)})` };
  }
  return { delta: 0, label: `최근 성적 보통 (ERA ${era.toFixed(2)})` };
}

export const KBO_POSTING_SEASON_REG_DAYS = 145;
export const KBO_POSTING_REQUIRED_SEASONS = 7;
export const KBO_POSTING_REQUIRED_REG_DAYS = KBO_POSTING_SEASON_REG_DAYS * KBO_POSTING_REQUIRED_SEASONS; // 1,015일

export function getPlayerPostingQualification(player: Player): {
  qualifiedSeasons: number;
  registrationDays: number;
  meetsSevenSeasonRule: boolean;
} {
  const byRegDays =
    typeof player.registrationDays === 'number'
      ? Math.floor(player.registrationDays / KBO_POSTING_SEASON_REG_DAYS)
      : 0;
  const qualifiedSeasons = Math.max(player.serviceYears ?? 0, byRegDays);
  const registrationDays =
    typeof player.registrationDays === 'number'
      ? Math.max(player.registrationDays, (player.serviceYears ?? 0) * KBO_POSTING_SEASON_REG_DAYS)
      : (player.serviceYears ?? 0) * KBO_POSTING_SEASON_REG_DAYS;
  return {
    qualifiedSeasons,
    registrationDays,
    meetsSevenSeasonRule: qualifiedSeasons >= KBO_POSTING_REQUIRED_SEASONS,
  };
}

export function evaluateMlbPostingReadiness(player: Player): MlbPostingReadiness {
  const qual = getPlayerPostingQualification(player);
  if (player.category !== '국내' || !qual.meetsSevenSeasonRule || player.postingBlockedUntilNextNov) {
    return {
      eligible: false,
      tier: '부적합',
      ageSuitability: player.age >= 33 ? '부적합' : '양호',
      acceptanceChancePct: 0,
      estimatedGuaranteeRange: '자격 요건 미충족',
      reason:
        !qual.meetsSevenSeasonRule
          ? `KBO 규약상 1군 등록일수 7시즌(1,015일) 충족 필요 — 현재 ${qual.qualifiedSeasons}시즌(${qual.registrationDays}일)`
          : player.postingBlockedUntilNextNov
          ? '이전 협상 결렬로 차기 11월까지 제한'
          : '국내 선수만 가능',
    };
  }

  // #7: MLB 포스팅 나이 적합성 + 최근 성적 복합 평가 (만 24~29세 최적, 30~31세 양호, 32~33세 주의, 34세+ 부적합)
  const ageSuitability: MlbPostingReadiness['ageSuitability'] =
    player.age <= 29 ? '최적' : player.age <= 31 ? '양호' : player.age <= 33 ? '주의' : '부적합';
  const recentPerf = computeRecentPerformanceAdjustmentForMlb(player);

  if (player.age >= 34) {
    return {
      eligible: true,
      tier: '부적합',
      ageSuitability: '부적합',
      recentStatNote: recentPerf.label,
      acceptanceChancePct: 0,
      estimatedGuaranteeRange: '입찰 불가 ($0 · 연령 초과)',
      reason: `나이(${player.age}세)가 MLB 다년 포스팅 투자 상한(만 33세 이하)을 초과해 빅리그 구단 입찰 불가`,
    };
  }

  // 능력치 + 최근 성적 보정으로 MLB 최상위권 진출 장벽을 현실적으로 높게 유지
  const effectiveAbility = player.ability + recentPerf.delta;
  const ageBonus = player.age <= 27 ? 10 : player.age <= 29 ? 4 : player.age <= 31 ? -8 : -28;

  if (effectiveAbility >= 86) {
    return {
      eligible: true,
      tier: player.age >= 32 ? '적합' : '유력',
      ageSuitability,
      recentStatNote: recentPerf.label,
      acceptanceChancePct: Math.max(52, Math.min(98, 89 + ageBonus)),
      estimatedGuaranteeRange: player.age <= 29 ? '$56M ~ $113M (4~6년)' : '$26M ~ $52M (2~3년)',
      reason:
        player.age <= 29
          ? `전성기 나이(${player.age}세) + 최정상급 기량(${player.ability}) · ${recentPerf.label}`
          : `최정상급 기량(${player.ability})이나 나이(${player.age}세) 영향으로 단기·중형 오퍼 예상 (${recentPerf.label})`,
    };
  }
  if (effectiveAbility >= 83) {
    return {
      eligible: true,
      tier: player.age >= 32 ? '도전적' : '적합',
      ageSuitability,
      recentStatNote: recentPerf.label,
      acceptanceChancePct: Math.max(20, Math.min(72, 58 + ageBonus)),
      estimatedGuaranteeRange: player.age <= 29 ? '$22M ~ $48M (3~4년)' : '$12M ~ $24M (2~3년)',
      reason: `리그 최상위권 빅리그 스카우트 평가 (${player.age}세 · ${recentPerf.label})`,
    };
  }
  if (effectiveAbility >= 80 && player.ability >= 78) {
    const chance = Math.max(0, Math.min(34, 24 + ageBonus));
    return {
      eligible: true,
      tier: chance === 0 ? '부적합' : '도전적',
      ageSuitability,
      recentStatNote: recentPerf.label,
      acceptanceChancePct: chance,
      estimatedGuaranteeRange: chance === 0 ? '입찰 불가 ($0)' : '$8M ~ $16M (2~3년)',
      reason:
        chance === 0
          ? `경계선 평가(능력치 ${player.ability})와 연령(${player.age}세) 부담으로 MLB 입찰 구단 없음`
          : `경계선 평가(능력치 ${player.ability} · ${player.age}세 · ${recentPerf.label}) — 무응찰 위험 높음`,
    };
  }
  return {
    eligible: true,
    tier: '부적합',
    ageSuitability,
    recentStatNote: recentPerf.label,
    acceptanceChancePct: 0,
    estimatedGuaranteeRange: '입찰 불가 ($0)',
    reason: `MLB 빅리그 스카우트 최상위 기준 미달 (능력치 ${player.ability} · ${recentPerf.label}) — 공시 시 무응찰 결렬`,
  };
}

export function submitMlbPosting(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const p = career.players[playerId];
  if (!p || p.teamId !== career.playerTeamId) throw new Error('선수를 찾을 수 없습니다.');
  if (p.category !== '국내') throw new Error('국내 선수만 MLB 포스팅 신청이 가능합니다.');
  const qual = getPlayerPostingQualification(p);
  if (!qual.meetsSevenSeasonRule) {
    throw new Error(
      `${p.name} 선수는 1군 등록일수 ${qual.qualifiedSeasons}시즌(${qual.registrationDays}일/1,015일)으로 KBO 포스팅 자격(7시즌) 미달입니다.`
    );
  }
  if (p.postingBlockedUntilNextNov) {
    throw new Error(`${p.name} 선수는 이전 포스팅 협상 결렬로 다음 해 11월 1일까지 재신청이 제한됩니다.`);
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const rng = new SeededRng(next.rngState);
  const readiness = evaluateMlbPostingReadiness(p);
  const acceptedByMlb = readiness.acceptanceChancePct > 0 && rng.next() * 100 < readiness.acceptanceChancePct;

  if (!acceptedByMlb) {
    const rejectionReason =
      p.age >= 34
        ? `MLB 30개 구단 연령 기준 초과(${p.age}세) — 장기 투자 메리트 부족으로 무응찰 거절`
        : p.ability < 78
        ? `MLB 30개 구단 스카우트 기준(능력치 78 이상) 미달 — 현재 능력치 ${p.ability}로는 빅리그 로스터 경쟁력 부족으로 입찰 구단 없음`
        : `MLB 구단 시장 수요 부족 및 연령(${p.age}세)·계약 규모 이견으로 30일 협상 창 내 정식 오퍼 미접수`;

    const failedRec: PostingRecord = {
      id: `post-${p.id}-${Date.now()}`,
      playerId: p.id,
      playerName: p.name,
      teamId: p.teamId,
      requestedDate: `${next.season}-11-05`,
      announcedDate: `${next.season}-11-06 08:00 EST`,
      deadlineDate: `${next.season}-12-06 17:00 EST`,
      offers: [],
      status: '협상결렬',
      feePaidUsd: 0,
      rejectionReason,
    };
    next.postingRecords.unshift(failedRec);
    next.players[playerId].postedThisYear = true;
    next.players[playerId].postingBlockedUntilNextNov = true;
    next.transactionLogs.unshift({
      id: `tx-post-reject-${Date.now()}`,
      date: `${next.season}-11-06`,
      type: '포스팅',
      teamId: next.playerTeamId,
      summary: `${p.name}(${p.age}세) MLB 포스팅 거절(협상 결렬) · 능력치 ${p.ability}`,
      detail: rejectionReason,
    });
    next.rngState = rng.getState();
    next.version = bumpVersion(next.version);
    next.updatedAt = new Date().toISOString();
    return { nextCareer: next, backupSnapshot };
  }

  // #8: 현실적인 KBO→MLB 포스팅 계약 규모 ($12M ~ $115M)
  const maxOffers = p.ability >= 85 && p.age <= 29 ? 3 : p.ability >= 81 ? 2 : 1;
  const numOffers = rng.int(1, maxOffers);
  const shuffledClubs = rng.shuffle(MLB_CLUBS).slice(0, numOffers);
  const ageMultiplier = p.age <= 26 ? 1.24 : p.age <= 29 ? 1.08 : p.age <= 31 ? 0.84 : 0.62;

  const offers: PostingOffer[] = shuffledClubs.map((club) => {
    let rawM = 12;
    if (p.ability >= 86) {
      rawM = 58 + (p.ability - 86) * 8.5 + rng.int(4, 22);
    } else if (p.ability >= 83) {
      rawM = 34 + (p.ability - 83) * 6.5 + rng.int(3, 14);
    } else if (p.ability >= 80) {
      rawM = 18 + (p.ability - 80) * 4.2 + rng.int(2, 9);
    } else {
      rawM = 10 + (p.ability - 78) * 2.5 + rng.int(1, 5);
    }
    const baseM = Math.max(8, Math.min(115, Math.round(rawM * ageMultiplier)));
    const years =
      p.age >= 32
        ? rng.int(2, 3)
        : baseM >= 60
        ? rng.int(5, 6)
        : baseM >= 28
        ? rng.int(3, 4)
        : rng.int(2, 3);
    return {
      mlbTeam: club,
      years,
      guaranteedUsdMillions: baseM,
      postingFeeUsd: calculateMlbPostingFeeUsd(baseM),
    };
  });

  const rec: PostingRecord = {
    id: `post-${p.id}-${Date.now()}`,
    playerId: p.id,
    playerName: p.name,
    teamId: p.teamId,
    requestedDate: `${next.season}-11-05`,
    announcedDate: `${next.season}-11-06 08:00 EST`,
    deadlineDate: `${next.season}-12-06 17:00 EST`,
    offers,
    status: '협상중',
    feePaidUsd: 0,
  };

  next.postingRecords.unshift(rec);
  next.players[playerId].postedThisYear = true;
  next.transactionLogs.unshift({
    id: `tx-post-${Date.now()}`,
    date: `${next.season}-11-06`,
    type: '포스팅',
    teamId: next.playerTeamId,
    summary: `${p.name} MLB 포스팅 공시 완료 (${readiness.tier} 평가 · 오퍼 ${offers.length}건 접수)`,
  });

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function resolveMlbPosting(
  career: CareerSave,
  postingId: string,
  acceptedOfferIndex: number | null // null => reject / expire
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const rec = next.postingRecords.find((r) => r.id === postingId);
  if (!rec || rec.status !== '협상중') throw new Error('협상 중인 포스팅 건을 찾을 수 없습니다.');

  const p = next.players[rec.playerId];
  if (acceptedOfferIndex === null) {
    rec.status = '협상결렬';
    rec.rejectionReason = '구단/선수 협상 조건 미합의로 30일 마감 시한 만료';
    if (p) p.postingBlockedUntilNextNov = true;
    next.transactionLogs.unshift({
      id: `tx-post-fail-${Date.now()}`,
      date: `${next.season}-12-06`,
      type: '포스팅',
      teamId: next.playerTeamId,
      summary: `${rec.playerName} MLB 포스팅 협상 만료/결렬 → 원소속 잔류 (차기 11월 1일까지 재포스팅 불가)`,
    });
  } else {
    const offer = rec.offers[acceptedOfferIndex];
    if (!offer) throw new Error('유효하지 않은 MLB 제안입니다.');
    rec.status = '계약성사';
    rec.acceptedOffer = offer;
    rec.feePaidUsd = offer.postingFeeUsd;
    rec.fundsClaimedToCash = false;

    if (p) {
      p.rosterTier = '해외이적';
      p.gameDayActive = false;
      const t = next.teams[p.teamId];
      t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
      t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
      t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
      t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);

      // #2: Record exported KBO star in MLB tracker & publish MLB news
      recordMlbExportPlayer(next, p, offer.mlbTeam, offer.years, offer.guaranteedUsdMillions, `${next.season}-12-01`);
      pushNews(next, {
        date: `${next.season}-12-01`,
        category: 'MLB소식',
        headline: `[MLB 진출 확정] ${KBO_TEAMS[p.teamId].shortName} ${p.name}, ${offer.mlbTeam} ${offer.years}년 $${offer.guaranteedUsdMillions}M 계약!`,
        body: `${p.name}(${p.position}) 선수가 포스팅 시스템을 통해 ${offer.mlbTeam} 입단을 확정 지었습니다. 구단은 이적료 $${offer.postingFeeUsd.toLocaleString()}를 수령하게 됩니다.`,
        teamId: p.teamId,
        isHighlight: true,
        fanSentimentImpact: 3,
      });
    }

    next.transactionLogs.unshift({
      id: `tx-post-ok-${Date.now()}`,
      date: `${next.season}-12-01`,
      type: '포스팅',
      teamId: next.playerTeamId,
      summary: `${rec.playerName} → ${offer.mlbTeam} 계약 승인 (${offer.years}년 $${offer.guaranteedUsdMillions}M · 이적료 $${offer.postingFeeUsd.toLocaleString()})`,
      detail: '외화 이적료 정산 버튼을 누르면 환산 원화가 구단 운영 자금에 즉시 편입됩니다.',
    });
  }

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * Converts settled MLB posting transfer fee USD into KRW (1,350 KRW/USD) and adds it to usable club cash balance.
 */
export function claimPostingFeeToCash(
  career: CareerSave,
  postingId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFinanceSubfields(next);

  const rec = next.postingRecords.find((r) => r.id === postingId);
  if (!rec || rec.status !== '계약성사' || rec.feePaidUsd <= 0) {
    throw new Error('정산 가능한 MLB 포스팅 이적료 건이 없습니다.');
  }
  if (rec.fundsClaimedToCash) {
    throw new Error('이미 구단 운영 자금으로 정산 완료된 이적료입니다.');
  }

  if (next.finances.cashBalanceBillion === null) {
    const baseCash = TEAM_STARTING_CASH_BILLION[next.playerTeamId] ?? 150;
    next.finances.cashBalanceBillion = baseCash;
    next.finances.startingCashBillion = baseCash;
  }

  const convertedBillion = Number(((rec.feePaidUsd * 1350) / 100_000_000).toFixed(2));
  next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion + convertedBillion).toFixed(2));
  next.finances.postingRevenueBillion = Number(((next.finances.postingRevenueBillion ?? 0) + convertedBillion).toFixed(2));
  next.finances.seasonRevenueBillion = Number((next.finances.seasonRevenueBillion + convertedBillion).toFixed(2));

  rec.fundsClaimedToCash = true;
  rec.convertedCashBillion = convertedBillion;

  next.transactionLogs.unshift({
    id: `tx-post-cash-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '재정',
    teamId: next.playerTeamId,
    summary: `MLB 포스팅 이적료 자금 편입: ${rec.playerName} (+${convertedBillion.toFixed(2)}억 원)`,
    detail: `$${rec.feePaidUsd.toLocaleString()} × 1,350원 환산 정산 · 시설 투자/FA 영입/미지급금 상환 사용 가능`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

function ensureFinanceSubfields(career: CareerSave): void {
  if (career.finances.ticketRevenueBillion === undefined) career.finances.ticketRevenueBillion = 0;
  if (career.finances.uniformRevenueBillion === undefined) career.finances.uniformRevenueBillion = 0;
  if (career.finances.sponsorRevenueBillion === undefined) career.finances.sponsorRevenueBillion = 0;
  if (career.finances.operatingExpenseBillion === undefined) career.finances.operatingExpenseBillion = 0;
  if (career.finances.postingRevenueBillion === undefined) career.finances.postingRevenueBillion = 0;
  if (career.finances.sponsor === undefined) career.finances.sponsor = null;
  if (!career.finances.investments) career.finances.investments = { ...DEFAULT_INVESTMENTS };
}

export function initializeStartingFunds(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  if (career.finances.cashBalanceBillion !== null) {
    return { nextCareer: career, backupSnapshot: career };
  }
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFinanceSubfields(next);
  const baseCash = TEAM_STARTING_CASH_BILLION[next.playerTeamId] ?? 150;
  next.finances.cashBalanceBillion = baseCash;
  next.finances.startingCashBillion = baseCash;

  next.transactionLogs.unshift({
    id: `tx-fund-init-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '재정',
    teamId: next.playerTeamId,
    summary: `구단 기본 운영자금 편성 완료 (+${baseCash.toFixed(1)}억 원)`,
    detail: '스폰서 체결, 티켓/유니폼 판매 수익 적립 및 구단 시설 투자가 활성화되었습니다.',
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export interface SponsorNegotiationOptions {
  contractYears?: 1 | 2 | 3;
  focus?: '균형' | '계약금' | '승리보너스' | '관중보너스';
}

export function previewNegotiatedSponsorTerms(
  base: (typeof CORPORATE_SPONSORS)[number],
  options?: SponsorNegotiationOptions
) {
  const years = options?.contractYears ?? base.contractYears ?? 2;
  const focus = options?.focus ?? '균형';
  const baseYears = base.contractYears ?? 2;

  // Term multiplier relative to sponsor's default term
  const yearSignMult = years === baseYears ? 1 : years === 1 ? 0.65 : years === 2 ? 1.0 : 1.38;
  let signMult = yearSignMult;
  let seriesMult = 1;
  let winMult = 1;
  let attMult = 1;
  let merchDelta = 0;

  if (focus === '계약금') {
    signMult *= 1.22;
    seriesMult *= 0.88;
    winMult *= 0.9;
  } else if (focus === '승리보너스') {
    signMult *= 0.82;
    winMult *= 1.35;
    seriesMult *= 0.95;
  } else if (focus === '관중보너스') {
    signMult *= 0.85;
    attMult *= 1.45;
    merchDelta += 4;
  }

  return {
    ...base,
    signingBonusBillion: Number((base.signingBonusBillion * signMult).toFixed(2)),
    perSeriesBonusBillion: Number((base.perSeriesBonusBillion * seriesMult).toFixed(2)),
    winBonusBillion: Number((base.winBonusBillion * winMult).toFixed(2)),
    attendanceBonusBillion: Number(((base.attendanceBonusBillion ?? 0.2) * attMult).toFixed(2)),
    merchBoostPct: base.merchBoostPct + merchDelta,
    contractYears: years,
    yearsRemaining: years,
    status: '계약중' as const,
    negotiationFocus: focus,
  };
}

export function negotiateCorporateSponsor(
  career: CareerSave,
  sponsorId: string,
  options?: SponsorNegotiationOptions
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const target = CORPORATE_SPONSORS.find((s) => s.id === sponsorId);
  if (!target) {
    throw new Error('선택한 스폰서 기업 정보를 찾을 수 없습니다.');
  }
  const prev = career.finances.sponsor;
  if (prev && prev.id === sponsorId && prev.status !== '만료') {
    throw new Error(`이미 ${target.name} 스폰서와 계약 중입니다.`);
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFinanceSubfields(next);

  const prevSponsor = next.finances.sponsor;
  if (next.finances.cashBalanceBillion === null) {
    const baseCash = TEAM_STARTING_CASH_BILLION[next.playerTeamId] ?? 150;
    next.finances.cashBalanceBillion = baseCash;
    next.finances.startingCashBillion = baseCash;
  }

  const negotiated = previewNegotiatedSponsorTerms(target, options);
  const isRenewalOrFresh = !prevSponsor || prevSponsor.status === '만료';
  const bonusDelta = isRenewalOrFresh
    ? negotiated.signingBonusBillion
    : Number((negotiated.signingBonusBillion - prevSponsor.signingBonusBillion).toFixed(2));

  if (next.finances.cashBalanceBillion + bonusDelta < 0) {
    throw new Error(
      `스폰서 변경 차액(${Math.abs(bonusDelta).toFixed(1)}억) 정산을 위한 보유 현금이 부족합니다.`
    );
  }

  next.finances.cashBalanceBillion = Number(
    (next.finances.cashBalanceBillion + bonusDelta).toFixed(2)
  );
  next.finances.sponsorRevenueBillion = Math.max(
    0,
    Number(((next.finances.sponsorRevenueBillion ?? 0) + bonusDelta).toFixed(2))
  );
  next.finances.seasonRevenueBillion = Math.max(
    0,
    Number((next.finances.seasonRevenueBillion + bonusDelta).toFixed(2))
  );

  const today = new Date().toISOString().slice(0, 10);
  next.finances.sponsor = {
    ...negotiated,
    signedDate: today,
  };

  next.transactionLogs.unshift({
    id: `tx-sponsor-${Date.now()}`,
    date: today,
    type: '재정',
    teamId: next.playerTeamId,
    summary: `메인 스폰서 ${prevSponsor?.status === '만료' ? '재계약' : '체결'}: ${target.name} ${negotiated.contractYears}년 (${bonusDelta >= 0 ? `+${bonusDelta.toFixed(1)}` : bonusDelta.toFixed(1)}억 원)`,
    detail: `[${negotiated.negotiationFocus} 협상] 시리즈 ${negotiated.perSeriesBonusBillion}억 + 승리 ${negotiated.winBonusBillion}억 + 관중 ${negotiated.attendanceBonusBillion}억 · 유니폼 +${negotiated.merchBoostPct}%`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function selectCorporateSponsor(
  career: CareerSave,
  sponsorId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  return negotiateCorporateSponsor(career, sponsorId, { focus: '균형' });
}

export function upgradeClubFacility(
  career: CareerSave,
  facilityKey: keyof ClubInvestments
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  if (career.finances.cashBalanceBillion === null) {
    throw new Error('먼저 구단 기본 운영자금을 편성하세요.');
  }
  const def = FACILITY_UPGRADES.find((f) => f.key === facilityKey);
  if (!def) {
    throw new Error('유효하지 않은 시설 투자 항목입니다.');
  }

  const currentInvestments = career.finances.investments ?? DEFAULT_INVESTMENTS;
  const currentLevel = currentInvestments[facilityKey] ?? 1;
  if (currentLevel >= 5) {
    throw new Error(`${def.name}은(는) 이미 최고 레벨(Lv.5)입니다.`);
  }

  const nextLevel = currentLevel + 1;
  const cost = def.costsByNextLevel[nextLevel];
  if (career.finances.cashBalanceBillion < cost) {
    throw new Error(
      `보유 현금(${career.finances.cashBalanceBillion.toFixed(2)}억)이 부족합니다 (필요: ${cost}억 원).`
    );
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFinanceSubfields(next);

  next.finances.cashBalanceBillion = Number(
    ((next.finances.cashBalanceBillion ?? 0) - cost).toFixed(2)
  );
  next.finances.seasonExpenseBillion = Number(
    (next.finances.seasonExpenseBillion + cost).toFixed(2)
  );
  next.finances.investments![facilityKey] = nextLevel;

  if (facilityKey === 'stadiumLevel' || facilityKey === 'marketingLevel') {
    const t = next.teams[next.playerTeamId];
    t.popularity = Math.min(100, t.popularity + (facilityKey === 'marketingLevel' ? 4 : 3));
  }

  next.transactionLogs.unshift({
    id: `tx-invest-${facilityKey}-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '재정',
    teamId: next.playerTeamId,
    summary: `시설 투자 실행: ${def.name} Lv.${currentLevel} → Lv.${nextLevel} (-${cost}억 원)`,
    detail: def.effectPerLevel,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function setTicketPricePolicy(
  career: CareerSave,
  policy: TicketPricePolicy
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);
  next.finances.ticketPricePolicy = policy;
  next.transactionLogs.unshift({
    id: `tx-ticket-pol-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '재정',
    teamId: next.playerTeamId,
    summary: `홈 구장 티켓 가격 정책 변경: [${policy}]`,
    detail: '다음 3연전 홈 경기부터 티켓 객단가, 관중 점유율, 팬 여론에 즉시 반영됩니다.',
  });
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function scoutDraftCandidate(
  career: CareerSave,
  candidateId: number
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const target = career.draftState.candidates.find((c) => c.id === candidateId);
  if (!target) throw new Error('스카우팅할 드래프트 후보를 찾을 수 없습니다.');
  if (target.scoutAccuracy === '정밀') {
    throw new Error(`${target.name} 선수는 이미 정밀 스카우팅이 완료되었습니다.`);
  }
  const cost = 0.4;
  if (career.finances.cashBalanceBillion !== null && career.finances.cashBalanceBillion < cost) {
    throw new Error(`정밀 스카우팅 비용(${cost}억) 대비 보유 자금이 부족합니다.`);
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const c = next.draftState.candidates.find((x) => x.id === candidateId);
  if (c) {
    c.scoutAccuracy = '정밀';
    c.scoutedAbility = c.ability;
    c.scoutedPotential = c.potential;
  }
  if (next.finances.cashBalanceBillion !== null) {
    next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - cost).toFixed(2));
    next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cost).toFixed(2));
  }
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function executeOneTimeClubSpend(
  career: CareerSave,
  spendId: OneTimeSpendDef['id']
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  if (career.finances.cashBalanceBillion === null) {
    throw new Error('먼저 구단 기본 운영자금을 편성하세요.');
  }
  const def = ONE_TIME_SPEND_OPTIONS.find((o) => o.id === spendId);
  if (!def) {
    throw new Error('유효하지 않은 자금 지출 항목입니다.');
  }
  if (career.finances.cashBalanceBillion < def.costBillion) {
    throw new Error(
      `보유 현금(${career.finances.cashBalanceBillion.toFixed(2)}억)이 부족합니다 (필요: ${def.costBillion}억 원).`
    );
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFinanceSubfields(next);
  ensureFranchiseState(next);

  next.finances.cashBalanceBillion = Number(
    ((next.finances.cashBalanceBillion ?? 0) - def.costBillion).toFixed(2)
  );
  next.finances.seasonExpenseBillion = Number(
    (next.finances.seasonExpenseBillion + def.costBillion).toFixed(2)
  );

  const myTeam = next.playerTeamId;
  const activeRoster = Object.values(next.players).filter(
    (p) => p.teamId === myTeam && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
  );

  if (spendId === 'CAMP') {
    for (const p of activeRoster) {
      p.fatigue = Math.max(0, p.fatigue - 15);
      if (p.age <= 25) {
        p.form = Math.min(5, p.form + 2);
      }
    }
  } else if (spendId === 'BONUS') {
    next.teams[myTeam].atmosphere = '좋음';
    next.teams[myTeam].popularity = Math.min(100, next.teams[myTeam].popularity + 3);
    for (const p of activeRoster) {
      if (p.rosterTier === '1군') {
        p.morale = '만족';
        p.form = Math.min(5, p.form + 1);
      }
    }
  } else if (spendId === 'SCOUT') {
    next.teams[myTeam].popularity = Math.min(100, next.teams[myTeam].popularity + 4);
    const unscouted = next.draftState.candidates
      .filter((c) => !c.draftedBy && c.scoutAccuracy !== '정밀')
      .slice(0, 10);
    for (const c of unscouted) {
      c.scoutAccuracy = '정밀';
      c.scoutedAbility = c.ability;
      c.scoutedPotential = c.potential;
    }
  } else if (spendId === 'ANALYTICS') {
    const top5 = activeRoster
      .filter((p) => p.rosterTier === '1군')
      .sort((a, b) => b.ability - a.ability)
      .slice(0, 5);
    for (const p of top5) p.form = Math.min(5, p.form + 2);
    for (const p of activeRoster) {
      if (p.category !== '국내') {
        p.kboAdaptation = Math.min(100, (p.kboAdaptation ?? 75) + 12);
      }
    }
  } else if (spendId === 'FAN_FEST') {
    next.teams[myTeam].fanSentiment = Math.min(100, (next.teams[myTeam].fanSentiment ?? 65) + 12);
    next.teams[myTeam].popularity = Math.min(100, next.teams[myTeam].popularity + 6);
  } else if (spendId === 'REHAB_LAB') {
    for (const p of activeRoster) {
      p.fatigue = Math.max(0, p.fatigue - 20);
      if (p.injury) {
        p.injury.daysRemaining = Math.max(1, p.injury.daysRemaining - 4);
      }
    }
  } else if (spendId === 'BATTING_CLINIC') {
    for (const p of activeRoster) {
      if (p.role === '타자' && p.rosterTier === '1군') {
        p.form = Math.min(5, p.form + 1);
      }
      if (p.role === '타자' && p.age <= 24 && p.trainingFocus === '타격' && p.ability < p.potential) {
        p.ability = Math.min(p.potential, p.ability + 1);
      }
    }
  } else if (spendId === 'PITCH_LAB') {
    for (const p of activeRoster) {
      if (p.role === '투수' && p.rosterTier === '1군') {
        p.fatigue = Math.max(0, p.fatigue - 12);
        p.form = Math.min(5, p.form + 1);
      }
      if (p.role === '투수' && p.age <= 24 && p.ability < p.potential) {
        p.ability = Math.min(p.potential, p.ability + 1);
      }
    }
  } else if (spendId === 'BRAND_CAMPAIGN') {
    next.teams[myTeam].popularity = Math.min(100, next.teams[myTeam].popularity + 5);
    next.teams[myTeam].fanSentiment = Math.min(100, (next.teams[myTeam].fanSentiment ?? 65) + 8);
    if (next.ownerEval) {
      next.ownerEval.ownerTrust = Math.min(100, next.ownerEval.ownerTrust + 4);
    }
  }

  // #1: 사용한 일회성 프로그램을 즉시 다른 프로그램으로 교체!
  const currentActive =
    next.finances.activeSpendOfferIds && next.finances.activeSpendOfferIds.length === 3
      ? [...next.finances.activeSpendOfferIds]
      : [...DEFAULT_ACTIVE_SPEND_IDS];
  const used = new Set(next.finances.usedSpendOfferIds ?? []);
  used.add(spendId);

  const allIds = ONE_TIME_SPEND_OPTIONS.map((o) => o.id);
  let replacement = allIds.find((id) => !currentActive.includes(id) && !used.has(id));
  if (!replacement) {
    // Cycle pool cleanly if all 9 have been used
    used.clear();
    used.add(spendId);
    replacement = allIds.find((id) => !currentActive.includes(id)) ?? allIds[0];
  }
  const slotIdx = currentActive.indexOf(spendId);
  if (slotIdx >= 0 && replacement) {
    currentActive[slotIdx] = replacement;
  }
  next.finances.activeSpendOfferIds = currentActive;
  next.finances.usedSpendOfferIds = [...used];

  const repDef = ONE_TIME_SPEND_OPTIONS.find((o) => o.id === replacement);
  next.transactionLogs.unshift({
    id: `tx-spend-${spendId}-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '재정',
    teamId: myTeam,
    summary: `구단 자금 집행: ${def.name} (-${def.costBillion}억 원)`,
    detail: `${def.effectSummary}${repDef ? ` · 신규 프로그램 [${repDef.name}] 교체 편성` : ''}`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function payUnpaidObligation(
  career: CareerSave,
  obligationId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const ob = next.finances.obligations.find((o) => o.id === obligationId);
  if (!ob) throw new Error('지급할 의무 항목을 찾을 수 없습니다.');
  const remaining = Math.max(0, ob.amount - ob.paidAmount);
  if (remaining <= 0) throw new Error('이미 완납된 항목입니다.');

  const krwCostBillion =
    ob.currency === 'KRW'
      ? remaining
      : Number(((remaining * 1350) / 100_000_000).toFixed(2));

  if (next.finances.cashBalanceBillion !== null) {
    if (next.finances.cashBalanceBillion < krwCostBillion) {
      throw new Error(
        `보유 현금(${next.finances.cashBalanceBillion.toFixed(2)}억)이 부족합니다 (필요: ${krwCostBillion.toFixed(2)}억 원).`
      );
    }
    next.finances.cashBalanceBillion = Number(
      (next.finances.cashBalanceBillion - krwCostBillion).toFixed(2)
    );
  }

  ob.paidAmount = ob.amount;
  if (ob.currency === 'KRW') {
    next.finances.krwUnpaidBillion = Math.max(0, Number((next.finances.krwUnpaidBillion - remaining).toFixed(2)));
    next.finances.krwCashPaidBillion = Number((next.finances.krwCashPaidBillion + remaining).toFixed(2));
    next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + remaining).toFixed(2));
  } else {
    next.finances.usdUnpaid = Math.max(0, next.finances.usdUnpaid - remaining);
    next.finances.usdCashPaid += remaining;
    next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + krwCostBillion).toFixed(2));
  }

  next.transactionLogs.unshift({
    id: `tx-pay-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: '재정',
    teamId: next.playerTeamId,
    summary: `현금 지급 실행: ${ob.label} (${ob.currency === 'KRW' ? `${remaining.toFixed(2)}억 원` : `$${remaining.toLocaleString()} / 환산 ${krwCostBillion.toFixed(2)}억`})`,
  });

  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function computeSeasonAwards(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  if (career.gamesPlayed < career.totalRegularGames) {
    throw new Error('정규시즌 144경기 종료 후에만 공식 시상식을 진행할 수 있습니다.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const { awards: awardSeason, alreadyComputed } = runOfficialSeasonAwardsCeremonyInPlace(next, {
    setPendingCeremony: false,
  });

  ensureFranchiseState(next);
  if (!alreadyComputed) {
    archiveCompletedSeasonRecords(next, awardSeason);
    if (awardSeason.mvp && awardSeason.mvp.teamId === next.playerTeamId) {
      unlockTrophy(next, {
        title: `${next.season} 정규시즌 MVP 배출`,
        category: '개인배출',
        description: `${awardSeason.mvp.playerName} (${awardSeason.mvp.statSummary})`,
        earnedDate: `${next.season}-11-15`,
      });
    }
    if (
      awardSeason.managerOfTheYear &&
      awardSeason.managerOfTheYear.teamId === next.playerTeamId
    ) {
      unlockTrophy(next, {
        title: `${next.season} 올해의 감독상 수상`,
        category: '개인배출',
        description: `${awardSeason.managerOfTheYear.managerName} 감독 (${awardSeason.managerOfTheYear.wins}승 ${awardSeason.managerOfTheYear.losses}패 · ${awardSeason.managerOfTheYear.rank}위)`,
        earnedDate: `${next.season}-11-15`,
      });
    }
  }
  // #2: 시즌 종료 후 자격 갖춘 소속 스타 선수들의 MLB 포스팅 직접 신청 요구 생성
  generateEndOfSeasonPostingRequests(next);
  // #3: 시즌 종료 후 전체 10개 구단 공식 경쟁균형세(샐러리캡·2027+하한액) 최종 정산 (1회 차감 보장)
  settleSeasonCompetitiveBalance(next, next.season, `${next.season}-11-16`);
  // #4: 시즌 종료·FA 공시 시점에 FA 자격을 취득한 만료 선수는 소속 구단에서 자동 이탈
  releaseExpiredFaPlayersToMarket(next, `${next.season}-11-16`);
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 단장 최종 승인 기반 오프시즌 완료 → 차기 시즌 개막 실행
 * - KBO 시상식 미확인 또는 오프시즌 필수 업무(1·2·3·5·7단계) 미완료 시 차기 시즌 개막 엄격 차단
 */
export function approveAndStartNextSeasonFromOffseason(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  if (career.phase !== 'OFFSEASON') {
    throw new Error('오프시즌 단계에서만 차기 시즌 개막을 승인할 수 있습니다.');
  }
  const readiness = getOffseason8StepReadiness(career);
  if (!readiness.canApproveNextSeason) {
    throw new Error(
      `오프시즌 필수 업무를 모두 완료해야 다음 시즌을 개막할 수 있습니다: ${readiness.blockingReasons[0] ?? '미완료 필수 항목 존재'}`
    );
  }
  return advanceToNextSeason(career);
}

/**
 * Advances career to next season: increments Korean age +1 for every player (v4.60.8/v4.58),
 * applies realistic offseason aging/retirements, Sangmu discharges, HOF inductions,
 * sets next-season draft order strictly in REVERSE of previous season standings (#36),
 * and prepares the new 144-game regular season while preserving championHistory & awardsHistory.
 */
export function advanceToNextSeason(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureFranchiseState(next);
  const rng = new SeededRng(next.rngState + next.season * 31);

  // #36: Compute reverse draft order from finished season final standings (incl. Korean Series) BEFORE clearing gamesLedger
  const reverseOrder =
    next.postseason?.champion
      ? computeReverseDraftOrder(next)
      : next.nextSeasonDraftOrder && next.nextSeasonDraftOrder.length === 10
        ? [...next.nextSeasonDraftOrder]
        : computeReverseDraftOrder(next);

  // #12: Archive completed season summary BEFORE wiping gamesLedger if not yet archived
  if (next.gamesLedger.length > 0 && !(next.seasonHistory ?? []).some((s) => s.season === next.season)) {
    const curAwards = next.awardsHistory.find((a) => a.season === next.season) ?? null;
    archiveCompletedSeasonRecords(next, curAwards);
  }

  // #3: End-of-season automatic firing for bottom-2 underperforming other clubs if not already replaced
  const finishedStandings = computeStandings(next.gamesLedger);
  if (finishedStandings.length === 10) {
    for (const row of finishedStandings.slice(8)) {
      if (
        row.teamId !== next.playerTeamId &&
        !(next.firedManagerTeamsThisSeason ?? []).includes(row.teamId) &&
        row.pct < 0.44
      ) {
        fireAndReplaceClubManager(
          next,
          row.teamId,
          `${next.season}시즌 최종 ${row.rank}위 부진 책임 경질`,
          `${next.season}-11-05`,
          row.rank,
          row.pct,
          true
        );
      }
    }
  }

  // 시즌 종료 경쟁균형세 최종 정산 (이미 시상식/오프시즌 진입 시 정산되었다면 1회 차감 보장 로직으로 자동 건너뜀)
  const finishedSeasonNum = next.season;
  settleSeasonCompetitiveBalance(next, finishedSeasonNum, `${finishedSeasonNum}-11-16`);
  // 미계약 잔여 FA들에 대한 AI 구단 오프시즌 최종 정리 (사용자 구단 자동 체결 없음)
  resolveRemainingAiFaCompetitionInPlace(next, `${finishedSeasonNum}-12-10`);

  // 시즌 종료 프랜차이즈 지수(0~100) 및 5단계 보호 등급 재평가
  reevaluateLeagueFranchiseProtectionInPlace(next);

  const nextSeasonNum = next.season + 1;
  next.season = nextSeasonNum;
  next.currentDate = `${nextSeasonNum}-01-01`;
  // 게임 내 현재 날짜(YYYY-01-01)와 생년월일 기준으로 전원 만 나이 재동기화 (시즌 전환 중복 증가 원천 차단)
  syncAllAgesToDateInPlace(next, next.currentDate);
  next.draftClassYear = nextSeasonNum + 1;
  next.scheduleSource = 'PROJECTED';
  next.officialScheduleMeta = undefined;
  next.foreignReplacementsUsedByTeam = {};
  next.postponedRainoutGames = [];
  next.lastAutoFaDate = undefined;
  // 다음 시즌 시작 시 1회 한정 이전 시즌 뉴스 자동 삭제 (오프시즌 스토브리그 뉴스 season === nextSeasonNum 및 모든 선수·계약·수상 데이터 보존)
  prunePreviousSeasonNewsInPlace(next, nextSeasonNum);
  next.seasonArcInitializedSeason = undefined;
  if (typeof next.label === 'string' && next.label.includes(String(finishedSeasonNum))) {
    next.label = next.label.replace(String(finishedSeasonNum), String(nextSeasonNum));
  }
  next.gamesPlayed = 0;
  next.currentSeriesIndex = 0;
  next.phase = 'REGULAR_SEASON';
  next.previousStandingsRanks = undefined;
  next.faCompetition = undefined;
  next.offseasonStep = undefined;
  next.offseasonStep8 = undefined;
  next.completedOffseasonSteps8 = [];
  next.pendingAwardsCeremonySeason = null;
  next.legendTradeBlockSeason = undefined;
  next.legendTradeBlockPlayerIds = undefined;
  next.faReleasedSeason = undefined;
  next.incomingTradeOffers = [];
  next.nextSeasonDraftOrder = undefined;
  next.rainoutCount = 0;
  next.doubleheaderCount = 0;
  next.newsAttendanceBoostPct = 0;
  next.firedManagerTeamsThisSeason = [];
  next.gamesLedger = [];
  next.lastSeriesReport = null;
  next.coachSwapReports = [];
  ensureBenchCoachesInPlace(next);
  ensureLeagueAcquisitionsInPlace(next);
  next.schedule = generateRegularSeasonSchedule(next.seed + next.season, `${next.season}-03-28`);

  // Complete any in-progress overseas trainings & national team duties before opening day
  processOverseasTrainingReturns(next, rng, `${next.season}-02-20`, true);
  next.activeNationalTeamDuty = null;
  for (const pl of Object.values(next.players)) {
    pl.nationalTeamDuty = null;
  }

  // #9: 새 시즌 개막 육성선수 영입 후보 풀 갱신 (코치 추천용)
  ensureSeasonDevelopmentalMarket(next, true);

  // #5: KBO 실행위원회 매년 규칙 자동 추가·수정·폐지 + #20 리그 투고타저/타고투저 환경 갱신
  evolveAnnualKboRules(next, rng);
  next.leagueEnv = buildLeagueEnvironment(nextSeasonNum, next.seed + nextSeasonNum * 13);
  next.offseasonStep12 = 'FINAL_SETTLEMENT';
  next.completedOffseasonSteps12 = [];
  next.offseasonStep8 = 'SETTLEMENT';
  next.completedOffseasonSteps8 = [];
  next.aiOffseasonProcessedSeason = undefined;
  next.aiOffseasonLogSummary = [];
  next.springCamp = {
    season: nextSeasonNum,
    location: null,
    intensity: '균형',
    costBillion: 0,
    invitedProspectIds: [],
    campCompleted: false,
    exhibitionGames: [],
  };

  // #2: 타 구단 KBO 특급 스타 오프시즌 MLB 진출 처리
  processOffseasonOtherClubMlbPostings(next, rng);

  // 웨이버 미영입 자유계약선수 계약 제한 자동 해제 + 장기 미계약 독립리그/은퇴 정리 + 8/1 이후 PS 제한 해제
  unlockUnclaimedFreeAgentsForNewSeasonInPlace(next, nextSeasonNum, `${nextSeasonNum}-03-01`, rng);

  // 아마추어 고교·대학 진급/진로 및 해외파 선수 연차·성적·계약·방출 처리
  advanceAmateurAndOverseasSeasonInPlace(next, rng);

  // Keep already-completed next-season offseason draft; otherwise create fresh draft with exact reverse order + non-duplicate 1R CB penalties
  resetUlsanWhalesForNewSeason(next, nextSeasonNum);
  if (!(next.draftState.season === nextSeasonNum && next.draftState.completed)) {
    const penaltyRes = applyCompetitiveBalanceDraftPenalties(next, nextSeasonNum, reverseOrder);
    next.draftState = createFreshDraftState(nextSeasonNum, next.seed + nextSeasonNum, penaltyRes.baseOrder);
    if (penaltyRes.penaltyNotes.length > 0) {
      next.draftState.round1DraftOrder = penaltyRes.round1Order;
      next.draftState.round1PenaltyNotes = penaltyRes.penaltyNotes;
    }
    next.draftState.candidates = integrateAmateurAndOverseasIntoDraftCandidates(
      next,
      next.draftState.candidates,
      nextSeasonNum
    );
    injectUndraftedUlsanPlayersIntoDraft(next, next.draftState);
    ensureDraftPickProvenanceInPlace(next);
  }
  // 매년 신규 구단 유니폼 발표(#17) 및 고교/대학 최대어·드래프트 초청자 선정(#21)
  unveilAnnualClubUniformsInPlace(next);
  selectAnnualTopAmateurProspectsInPlace(next, true);
  // 직전 시즌 우승 구단 차기 시즌 운영 예산 +10% 반영 후 초기화 (#18)
  const myBoostPct = next.teams[next.playerTeamId]?.championshipBudgetBoostPct ?? 0;
  if (myBoostPct > 0 && next.finances.ownerBudgetCapBillion) {
    next.finances.ownerBudgetCapBillion = Number(
      (next.finances.ownerBudgetCapBillion * (1 + myBoostPct / 100)).toFixed(1)
    );
  }
  for (const tid of TEAM_IDS) {
    if (next.teams[tid]) next.teams[tid].championshipBudgetBoostPct = 0;
  }
  next.virtualForeignMarket = generateVirtualForeignMarket(next.season, next.seed + next.season * 17);
  if (!next.championHistory || next.championHistory.length === 0) {
    next.championHistory = HISTORICAL_BASELINE_CHAMPIONS.map((c) => ({ ...c }));
  }

  // Reset all 12 Futures League standings (North 6 + South 6 incl. 상무·울산) for new season
  for (const fid of FUTURES_TEAM_IDS) {
    const meta = FUTURES_TEAMS_META[fid];
    next.futuresStandings![fid] = {
      teamId: fid,
      division: meta.division,
      officialName: meta.officialName,
      homeCity: meta.homeCity,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }

  // Refresh other 9 clubs' sponsors autonomously for the new season (#10)
  if (!next.otherClubSponsors) next.otherClubSponsors = {};
  for (const tid of TEAM_IDS) {
    if (tid === next.playerTeamId) continue;
    const choices = getTeamSponsorChoices(tid);
    const chosen = rng.pick(choices);
    if (chosen) next.otherClubSponsors[tid] = chosen.name;
  }

  // Fresh Owner Evaluation goal for the new season
  const prevTrust = next.ownerEval?.ownerTrust ?? 68;
  next.ownerEval = buildInitialOwnerEval(next.playerTeamId, next.season);
  next.ownerEval.ownerTrust = Math.max(40, Math.min(95, prevTrust));

  next.postseason = {
    active: false,
    currentRound: 'NONE',
    standingsSeed: [],
    seriesHistory: [],
    currentSeries: null,
    champion: null,
    ksMvp: null,
    championEvent: null,
  };

  const retiredNames: string[] = [];
  const retiredPlayers: Player[] = [];
  let offseasonGrownCount = 0;
  let offseasonDeclinedCount = 0;

  // =========================================================================
  // #0. KBO 외국인·아시아쿼터 정상급 활약 선수 무조건 MLB 역수출 진출
  //     (시즌 스탯 초기화 직전에 전 10개 구단 대상으로 판정)
  // =========================================================================
  const exportedForeignNames: string[] = [];
  const pendingForeignMlbNews: Array<{
    date: string;
    category: 'MLB소식';
    headline: string;
    body: string;
    teamId: TeamId;
    isHighlight: boolean;
  }> = [];
  for (const p of Object.values(next.players)) {
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') continue;
    if (p.category !== '외국인' && p.category !== '아시아쿼터') continue;

    let qualifiedForMlb = false;
    let statSummary = '';
    if (p.role === '투수') {
      const ps = p.stats as PitcherStats;
      const ip = (ps.outs ?? 0) / 3;
      const era = calcERA(ps.ER, ps.outs);
      const wins = ps.W ?? 0;
      const losses = ps.L ?? 0;
      const saves = ps.SV ?? 0;
      const so = ps.SO ?? 0;
      if (
        (ip >= 110 && ((era !== null && era <= 3.15) || wins >= 14 || so >= 160)) ||
        (ip >= 45 && saves >= 28 && era !== null && era <= 2.65)
      ) {
        qualifiedForMlb = true;
        statSummary = `${wins}승 ${losses}패 ${saves > 0 ? `${saves}세이브 ` : ''}ERA ${era?.toFixed(2) ?? '-'} ${so}탈삼진`;
      }
    } else {
      const bs = p.stats as BatterStats;
      const ops = calcOPS(bs);
      const avg = calcAVG(bs.H, bs.AB);
      const hr = bs.HR ?? 0;
      const rbi = bs.RBI ?? 0;
      if (
        (bs.PA ?? 0) >= 350 &&
        ((ops !== null && ops >= 0.895) || hr >= 26 || (avg !== null && avg >= 0.32))
      ) {
        qualifiedForMlb = true;
        statSummary = `타율 ${avg?.toFixed(3) ?? '-'} ${hr}홈런 ${rbi}타점 OPS ${ops?.toFixed(3) ?? '-'}`;
      }
    }

    if (qualifiedForMlb) {
      ensurePlayerRichMetadata(p);
      commitSeasonStatsToCareer(p);
      const originTeamId = p.teamId;
      const mlbClub = rng.pick(MLB_CLUBS);
      const mlbYears = p.age <= 30 ? rng.int(2, 3) : 2;
      const mlbUsdMillions = Number(
        Math.max(8, Math.min(36, Math.round((p.ability - 72) * 1.45 * mlbYears + rng.int(2, 6)))).toFixed(1)
      );

      p.rosterTier = '해외이적';
      p.gameDayActive = false;
      p.contract = {
        ...p.contract,
        status: '만료',
        yearsRemaining: 0,
        note: `${nextSeasonNum - 1} KBO 맹활약 후 ${mlbClub} MLB 역수출 (${mlbYears}년 $${mlbUsdMillions}M)`,
      };
      const t = next.teams[originTeamId];
      if (t) {
        t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
        t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
        t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
        t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);
      }

      recordMlbExportPlayer(next, p, mlbClub, mlbYears, mlbUsdMillions, `${nextSeasonNum - 1}-12-08`, '외국인역수출');
      exportedForeignNames.push(`${p.name}(${KBO_TEAMS[originTeamId].shortName}→${mlbClub})`);

      pendingForeignMlbNews.push({
        date: `${nextSeasonNum - 1}-12-08`,
        category: 'MLB소식',
        headline: `[외국인 MLB 역수출 확정] ${KBO_TEAMS[originTeamId].shortName} ${p.name}, ${mlbClub}와 ${mlbYears}년 $${mlbUsdMillions}M 계약!`,
        body: `지난 시즌 KBO에서 압도적 성적(${statSummary})을 남긴 외국인 선수 ${p.name}(${p.position})이 메이저리그 스카우트들의 만장일치 러브콜 끝에 ${mlbClub}와 ${mlbYears}년 총액 $${mlbUsdMillions}M 계약을 맺고 빅리그로 복귀·진출했습니다.`,
        teamId: originTeamId,
        isHighlight: true,
      });

      if (originTeamId === next.playerTeamId) {
        next.transactionLogs.unshift({
          id: `tx-for-mlb-${nextSeasonNum}-${p.id}`,
          date: `${nextSeasonNum - 1}-12-08`,
          type: '포스팅',
          teamId: originTeamId,
          summary: `[외국인 MLB 진출] ${p.name} → ${mlbClub} (${mlbYears}년 $${mlbUsdMillions}M)`,
          detail: `시즌 압도적 활약(${statSummary})으로 MLB 역수출 확정 — 새 외국인 선수 영입 필요`,
        });
      } else {
        // AI 구단은 이탈한 외국인 에이스/거포 자리를 차기 시즌 개막 전 신규 외국인 선수로 자동 보강
        const repId = `ai-for-rep-${nextSeasonNum}-${originTeamId}-${p.id.slice(-4)}`;
        const isP = p.role === '투수';
        const firstPool = ['에릭', '카일', '브랜든', '루카스', '드류', '타일러', '로건', '마커스', '호세', '라울'];
        const lastPool = ['페디', '켈리', '산체스', '모건', '해밀턴', '카스트로', '밀러', '베넷', '바르가스', '스콧'];
        const repName = `${rng.pick(firstPool)} ${rng.pick(lastPool)}`;
        const repAbil = rng.int(75, 81);
        const repPlayer: Player = {
          id: repId,
          name: repName,
          teamId: originTeamId,
          category: p.category,
          nationality: p.category === '아시아쿼터' ? '일본' : '미국',
          previousLeagueClub: p.category === '아시아쿼터' ? 'NPB 퍼시픽리그 1군' : 'MLB 40인 · AAA 트리플A',
          role: p.role,
          position: p.position,
          pitchRole: isP ? (p.position === 'SP' ? '선발' : '중간') : undefined,
          age: rng.int(26, 31),
          ability: repAbil,
          potential: Math.min(86, repAbil + rng.int(2, 5)),
          abilityStatus: '확정',
          form: 0,
          fatigue: 0,
          lastPitchedRound: 0,
          consecutiveAppearances: 0,
          rosterTier: '1군',
          gameDayActive: true,
          uniformNumber: allocateTeamUniformNumber(
            next.players,
            originTeamId,
            false,
            undefined,
            getTeamRetiredNumbers(next, originTeamId)
          ),
          contract: {
            status: '확정',
            currency: 'USD',
            years: 1,
            yearsRemaining: 1,
            startSeason: nextSeasonNum,
            endSeason: nextSeasonNum,
            annualSalary: 850000,
            signingBonus: 150000,
            totalValue: 1000000,
            note: `${nextSeasonNum} 외국인 MLB 이탈 대체 영입 ($1.0M)`,
          },
          injury: null,
          morale: '만족',
          trainingFocus: isP ? '구위' : '타격',
          serviceYears: 0,
          clubTenureSeasons: 1,
          seasonRatingDelta: 0,
          lastEvaluatedAtTeamGames: 0,
          stats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
          postseasonStats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
          futuresStats: emptyFuturesStats(),
          kboAdaptation: rng.int(65, 82),
        };
        ensurePlayerRichMetadata(repPlayer);
        next.players[repId] = repPlayer;
        if (isP) {
          if (repPlayer.pitchRole === '선발' && t.rotationOrder.length < 5) t.rotationOrder.push(repId);
          else t.bullpenOrder.push(repId);
        } else {
          t.benchOrder.push(repId);
        }
      }
    }
  }

  for (const p of Object.values(next.players)) {
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') continue;

    // #6: Permanently commit finished season stats into careerStats & update recent3YrScore BEFORE wiping stats
    ensurePlayerRichMetadata(p);
    commitSeasonStatsToCareer(p);
    if (p.role === '타자') {
      const b = p.stats as BatterStats;
      const ops = calcOPS(b);
      if (ops !== null && (b.PA ?? 0) >= 80) {
        const sScore = Math.max(45, Math.min(98, Math.round(60 + (ops - 0.65) * 85)));
        p.recent3YrScore = Math.round(((p.recent3YrScore ?? p.ability) * 2 + sScore) / 3);
      }
    } else {
      const ps = p.stats as PitcherStats;
      const era = calcERA(ps.ER, ps.outs);
      if (era !== null && (ps.outs ?? 0) >= 60) {
        const sScore = Math.max(45, Math.min(98, Math.round(92 - (era - 2.2) * 11)));
        p.recent3YrScore = Math.round(((p.recent3YrScore ?? p.ability) * 2 + sScore) / 3);
      }
    }

    // 나이는 syncAllAgesToDateInPlace(next, `${nextSeasonNum}-01-01`)에서 생년월일 기준으로 이미 정확 동기화됨 (중복 +1 방지)
    p.serviceYears += p.rosterTier === '1군' ? 1 : 0;
    if (p.rosterTier === '1군' || p.rosterTier === '2군') {
      p.clubTenureSeasons = getPlayerClubTenureSeasons(p) + 1;
    }
    p.seasonRatingDelta = 0;
    p.lastEvaluatedAtTeamGames = 0;
    p.fatigue = 0;
    p.form = 0;
    p.injury = null;
    p.rehabGamesLeft = 0;
    p.postedThisYear = false;
    p.postingBlockedUntilNextNov = false;
    p.tradeRequested = false;
    p.contract.incentivePaid = false;
    p.contract.optionBonusPaidBillion = 0;
    p.ktSeriesBatting = undefined;
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

    // #1 & #8 + 선수별 성장 속도·노쇠화 커브 차별화
    const injHist = p.injuryHistoryCount ?? 0;
    const curve = p.growthCurveProfile ?? '표준';
    const growthMaxAge = curve === '대기만성' ? 27 : curve === '조기개화' ? 22 : 24;
    const growthProb =
      curve === '조기개화'
        ? 0.62
        : curve === '대기만성'
        ? p.age >= 23
          ? 0.56
          : 0.36
        : 0.48;
    const agingOffset = curve === '철강왕' ? 2 : curve === '대기만성' ? 1 : curve === '조기개화' ? -1 : 0;

    if (p.age <= growthMaxAge && p.potential - p.ability >= 3 && rng.next() < growthProb) {
      const gain = curve === '조기개화' && p.potential - p.ability >= 7 && rng.next() < 0.32 ? 2 : 1;
      p.ability = Math.min(p.potential, p.ability + gain);
      offseasonGrownCount++;
    } else if (p.age <= 24 && injHist >= 2 && rng.next() < 0.35) {
      p.potential = Math.max(p.ability, p.potential - 2);
      p.potentialTrend = '정체';
    } else if (p.age >= 37 + agingOffset || (p.age >= 35 + agingOffset && injHist >= 2)) {
      const drop = curve === '철강왕' ? 1 : rng.next() < 0.62 ? 2 : 1;
      p.ability = Math.max(48, p.ability - drop);
      p.potential = Math.max(p.ability, p.potential - drop);
      p.potentialTrend = '하락';
      offseasonDeclinedCount++;
    } else if (p.age >= 33 + agingOffset && rng.next() < (curve === '철강왕' ? 0.4 : 0.58) + injHist * 0.08) {
      p.ability = Math.max(52, p.ability - 1);
      p.potential = Math.max(p.ability, p.potential - 1);
      p.potentialTrend = '하락';
      offseasonDeclinedCount++;
    }
    p.seasonArc = undefined;
    p.overuse = { consecutiveStarts: 0, consecutivePitchDays: 0, highPitchCountGames: 0, recent7dPitches: 0, riskLevel: '정상' };
    p.salaryNegotiationStatus = undefined;
    p.demandedSalaryBillion = undefined;
    p.postseasonIneligibleSeason = undefined;

    // Realistic league-wide veteran retirement check (all 10 teams)
    const shouldRetire =
      p.age >= 42 ||
      (p.age >= 41 && rng.next() < 0.85) ||
      (p.age >= 39 && (p.ability <= 76 || rng.next() < 0.5)) ||
      (p.age >= 37 && p.ability <= 70 && rng.next() < 0.55) ||
      (p.age >= 35 && p.ability <= 62 && rng.next() < 0.45);

    if (shouldRetire) {
      p.rosterTier = '은퇴';
      p.gameDayActive = false;
      const t = next.teams[p.teamId];
      t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
      t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
      t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
      t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);
      retiredPlayers.push(p);
      // 은퇴선수 진로 자동 관리 배정 (#14 & #15 코치 연수)
      assignRetiredPlayerCareerInPlace(next, p, rng);
      // 프랜차이즈 스타는 은퇴 시 구단 레전드 명예의 전당에 자동 영구 등재
      inductPlayerToClubLegendsHofInPlace(next, p, false);
      if (p.teamId === next.playerTeamId) {
        retiredNames.push(`${p.name}(${p.age}세)`);
        // #38: Franchise star retirement ceremony record
        if (p.serviceYears >= 7 || p.ability >= 74 || getPlayerClubTenureSeasons(p) >= 6) {
          next.retirementCeremonies = [
            buildRetirementCeremony(p, nextSeasonNum - 1),
            ...(next.retirementCeremonies ?? []),
          ];
        }
      }
      continue;
    }

    // 오프시즌 미계약 FA 선수(소속팀 이탈 상태)는 타 구단 또는 원소속 구단과 개막 전 최종 계약 체결
    // 타 구단도 동일한 경쟁균형세 상한·하한 및 연속 초과 리스크를 반영해 영입 판단
    if (p.rosterTier === 'FA') {
      const originTeam = p.formerTeamId ?? p.teamId;
      const aiCandidates = TEAM_IDS.filter((t) => t !== next.playerTeamId);
      const scoredClubs = aiCandidates
        .map((tid) => {
          const cap = computeSalaryCapSummary(next, tid);
          const room = cap.capBillion - cap.teamTop40PayrollBillion;
          // 2027+ 하한 미달 구단은 적극 영입, 2년 연속 초과 상태 구단은 1R 9단계 하락 회피 성향 반영
          let score = room * 1.4 + (tid === originTeam ? 16 : 0) + rng.int(-6, 6);
          if (cap.floorEnabled && cap.underFloorBillion > 0) score += 30;
          if (cap.currentStreak >= 2 && cap.overCapBillion >= -4) score -= 35;
          return { tid, score };
        })
        .sort((a, b) => b.score - a.score);
      const destTeam = scoredClubs[0]?.tid ?? TEAM_IDS.find((t) => t !== next.playerTeamId) ?? originTeam;
      const stayedOriginal = destTeam === originTeam;
      p.previousAnnualSalary = p.contract.annualSalary;
      p.teamId = destTeam;
      p.formerTeamId = undefined;
      p.clubTenureSeasons = stayedOriginal ? getPlayerClubTenureSeasons(p) + 1 : 1;
      appendPlayerTeamHistoryInPlace(
        p,
        destTeam,
        nextSeasonNum,
        stayedOriginal ? 'FA 잔류' : 'FA 이적',
        {
          transferDate: `${nextSeasonNum}-01-15`,
          moveType: stayedOriginal ? 'FA 잔류' : 'FA 이적',
          fromTeamId: originTeam,
        }
      );
      markReleasedPlayerSignedInPlace(next, p.id, destTeam, `${KBO_TEAMS[destTeam].name} FA 계약`);
      p.rosterTier = p.ability >= 70 ? '1군' : '2군';
      p.gameDayActive = p.rosterTier === '1군';
      p.signedAsFaSeason = nextSeasonNum;
      const years = p.age >= 35 ? 2 : 3;
      const annual = Number(Math.max(1.5, (p.ability - 66) * 0.65).toFixed(1));
      p.contract = {
        status: '확정',
        currency: 'KRW',
        years,
        yearsRemaining: years,
        annualSalary: annual,
        signingBonus: Number((annual * 0.8).toFixed(1)),
        totalValue: Number((annual * years + annual * 0.8).toFixed(1)),
        startSeason: nextSeasonNum,
        endSeason: nextSeasonNum + years - 1,
        isFAEligible: false,
        faGrade: null,
        optionBonusPaidBillion: 0,
        note: `${nextSeasonNum} FA 계약 (${KBO_TEAMS[destTeam].shortName})`,
      };
      reassignNonConflictingUniformNumber(next, p, destTeam);
      if (p.rosterTier === '1군') {
        if (p.role === '투수') next.teams[destTeam].bullpenOrder.push(p.id);
        else next.teams[destTeam].benchOrder.push(p.id);
      }
      if (originTeam === next.playerTeamId) {
        pushNews(next, {
          date: `${nextSeasonNum}-01-25`,
          category: '이적·계약',
          headline: `[FA 이적 확정] ${p.name}, ${KBO_TEAMS[destTeam].shortName}와 ${years}년 ${p.contract.totalValue}억 계약`,
          body: `FA 자격으로 팀을 떠났던 ${p.name} 선수가 ${KBO_TEAMS[destTeam].name}와 최종 계약하며 이적을 확정했습니다.`,
          teamId: next.playerTeamId,
          isHighlight: true,
        });
      }
      continue;
    }

    if (p.contract.yearsRemaining > 1) {
      p.contract.yearsRemaining -= 1;
    } else if (p.contract.status === '확정') {
      if (p.teamId !== next.playerTeamId) {
        p.previousAnnualSalary = p.contract.annualSalary;
        p.contract.yearsRemaining = 1;
        p.contract.startSeason = nextSeasonNum;
        p.contract.endSeason = nextSeasonNum;
      } else {
        p.previousAnnualSalary = p.contract.annualSalary;
        p.contract.yearsRemaining = 0;
        p.contract.status = '만료';
      }
    }
    // #25 & #26: Refresh FA eligibility & A/B/C grade automatically
    const faQual = computeFaQualification(next, p);
    p.contract.isFAEligible = faQual.isFaEligible;
    p.contract.faGrade = faQual.grade;
  }

  // 오프시즌 은퇴선수 진로 자동 관리(코치연수 수료·AI 코치 영입/승격/은퇴) 및 방출선수 근황 정리 (#5, #14, #15)
  processOffseasonRetiredCareersInPlace(next, rng);
  processOffseasonReleasedPlayersInPlace(next, rng);

  // #12, #23 Sangmu discharges (1.5yr) & mandatory military enlistments for age 26-27 unexempted domestic players + #31 HOF inductions
  const dischargedList = processSangmuDischarges(next, rng, `${nextSeasonNum}-03-02`);
  processMandatorySangmuEnlistments(next, rng, `${nextSeasonNum}-03-05`);
  inductRetiredLegendsToHof(next, retiredPlayers);
  ensureDeepFranchiseState(next);

  // League-wide Retirement -> New Coach Debuts & Existing Coach -> Manager Promotions
  if (!Array.isArray(next.faCoaches)) {
    next.faCoaches = getAvailableFaCoaches(next).map((c) => ({ ...c }));
  }
  const existingCoachNames = new Set<string>([
    ...next.faCoaches.map((c) => c.name),
    ...TEAM_IDS.flatMap((tid) => (next.coaches[tid] ?? []).map((c) => c.name)),
  ]);

  // (A) Notable retired real players become FA Pitching/Hitting Coaches
  const newCoachDebuts: string[] = [];
  const coachEligibleRetirees = [...retiredPlayers]
    .filter((p) => p.category === '국내' && !existingCoachNames.has(p.name))
    .sort((a, b) => b.ability + b.serviceYears - (a.ability + a.serviceYears));

  for (const rp of coachEligibleRetirees) {
    const isNotable = rp.ability >= 66 || rp.serviceYears >= 9;
    const mustPickFirst = newCoachDebuts.length === 0 && isNotable;
    if (!mustPickFirst && (!isNotable || newCoachDebuts.length >= 3 || rng.next() > 0.55)) {
      continue;
    }
    const coachRole: Coach['role'] =
      rp.role === '투수' ? '투수코치' : rp.position === 'C' ? '배터리코치' : rng.next() < 0.35 ? '수비코치' : '타격코치';
    const coachAbility = Math.max(73, Math.min(84, Math.round(70 + (rp.ability - 60) * 0.45 + (rp.serviceYears >= 12 ? 3 : 0))));
    const newCoach: Coach = {
      id: `coach-ret-${nextSeasonNum}-${rp.id}`,
      teamId: 'FA',
      role: coachRole,
      name: rp.name,
      nationality: rp.nationality ?? '한국',
      isVirtual: false,
      ability: coachAbility,
      contractYears: 2,
      annualSalaryBillion: 1.4,
      signingBonusBillion: 0.3,
      totalBillion: 3.1,
      confirmed: false,
      isIncumbent: false,
      careerNote: `전 ${KBO_TEAMS[rp.teamId].shortName} ${rp.position} 은퇴 → ${nextSeasonNum}시즌 ${coachRole} 데뷔`,
      roleSummary: COACH_ROLE_METADATA[coachRole].duties,
      tacticalStyle: rp.role === '투수' ? '투수전·불펜운용' : '빅볼·공격야구',
      devSpecialty: rp.role === '투수' ? '제구·변화구' : '컨택·선구안',
      tacticalRating: Math.min(90, coachAbility + 1),
      developmentRating: Math.min(92, coachAbility + 3),
      subRatings: buildCoachSubRatings(coachRole, coachAbility, rp.name),
    };
    next.faCoaches.unshift(newCoach);
    existingCoachNames.add(rp.name);
    newCoachDebuts.push(`${rp.name}(${coachRole})`);
  }

  if (retiredPlayers.length > 0) {
    const retiredListPreview = retiredPlayers
      .slice(0, 6)
      .map((p) => `${p.name}(${KBO_TEAMS[p.teamId].shortName})`)
      .join(', ');
    pushNews(next, {
      date: `${next.season}-02-20`,
      category: '이적·계약',
      headline: `[은퇴 · 지도자 새 출발] KBO 베테랑 ${retiredPlayers.length}명 현역 은퇴${newCoachDebuts.length > 0 ? ` · ${newCoachDebuts[0]} 등 코치 데뷔` : ''}`,
      body: `${retiredListPreview}${retiredPlayers.length > 6 ? ` 외 ${retiredPlayers.length - 6}명` : ''}이 현역 유니폼을 벗었습니다.${newCoachDebuts.length > 0 ? ` 이 중 ${newCoachDebuts.join(', ')}이(가) FA 지도자 시장에 새 코치로 합류했습니다.` : ''}`,
      teamId: next.playerTeamId,
      isHighlight: true,
    });
  }

  // (B) High-ability Pitching/Hitting Coaches promoted to Manager ('감독')
  const promotedManagers: string[] = [];
  const promotableFaCoaches = next.faCoaches
    .filter((c) => c.role !== '감독' && c.ability >= 78)
    .sort((a, b) => b.ability - a.ability);

  const promotableClubCoaches: { teamId: TeamId; coach: Coach }[] = [];
  for (const tid of TEAM_IDS) {
    if (tid === next.playerTeamId) continue; // never strip player's active staff involuntarily
    for (const c of next.coaches[tid] ?? []) {
      if (c.role !== '감독' && c.ability >= 79) {
        promotableClubCoaches.push({ teamId: tid, coach: c });
      }
    }
  }
  promotableClubCoaches.sort((a, b) => b.coach.ability - a.coach.ability);

  // Promote 1 top FA coach to FA Manager so user can hire newly promoted managers
  const topFaCandidate = promotableFaCoaches[0];
  if (topFaCandidate) {
    const prevRole = topFaCandidate.role;
    topFaCandidate.role = '감독';
    topFaCandidate.ability = Math.min(89, topFaCandidate.ability + 2);
    topFaCandidate.contractYears = 3;
    topFaCandidate.annualSalaryBillion = 3.5;
    topFaCandidate.signingBonusBillion = 1.0;
    topFaCandidate.totalBillion = 11.5;
    topFaCandidate.tacticalRating = Math.min(93, (topFaCandidate.tacticalRating ?? topFaCandidate.ability) + 2);
    topFaCandidate.roleSummary = COACH_ROLE_METADATA['감독'].duties;
    topFaCandidate.subRatings = buildCoachSubRatings('감독', topFaCandidate.ability, topFaCandidate.name);
    topFaCandidate.careerNote = `전 ${prevRole} → ${nextSeasonNum}시즌 감독 승격 (FA 감독 후보)`;
    promotedManagers.push(`${topFaCandidate.name}(FA 감독 승격)`);
  }

  // Optionally promote 1 top AI club coach to lead a struggling AI club (bottom 3 in reverse order)
  const targetClubId = reverseOrder.find((tid) => tid !== next.playerTeamId);
  const topClubCand = promotableClubCoaches.find((x) => x.teamId !== targetClubId);
  if (targetClubId && topClubCand) {
    const targetStaff = next.coaches[targetClubId] ?? [];
    const oldMgrIdx = targetStaff.findIndex((c) => c.role === '감독');
    const oldMgr = oldMgrIdx >= 0 ? targetStaff[oldMgrIdx] : null;
    if (oldMgr && oldMgr.ability <= 81) {
      const originStaff = next.coaches[topClubCand.teamId] ?? [];
      const prevRole = topClubCand.coach.role;
      // Remove from origin club & replace origin slot from FA pool if available
      next.coaches[topClubCand.teamId] = originStaff.filter((c) => c.id !== topClubCand.coach.id);
      const replacementCoach = next.faCoaches.find((c) => c.role === prevRole);
      if (replacementCoach) {
        next.faCoaches = next.faCoaches.filter((c) => c.id !== replacementCoach.id);
        next.coaches[topClubCand.teamId].push({
          ...replacementCoach,
          teamId: topClubCand.teamId,
          confirmed: true,
        });
      } else {
        next.coaches[topClubCand.teamId].push({
          ...topClubCand.coach,
          id: `coach-fill-${nextSeasonNum}-${topClubCand.teamId}`,
          ability: Math.max(74, topClubCand.coach.ability - 3),
          name: `${topClubCand.coach.name} 후임`,
          careerNote: `${KBO_TEAMS[topClubCand.teamId].shortName} ${prevRole} 승격 보직`,
        });
      }

      // Move outgoing manager to FA market
      next.faCoaches.push({
        ...oldMgr,
        teamId: 'FA',
        confirmed: false,
        isIncumbent: false,
        careerNote: `FA · 전 ${KBO_TEAMS[targetClubId].shortName} 감독`,
      });

      // Install promoted coach as new manager of targetClubId
      const promotedMgr: Coach = {
        ...topClubCand.coach,
        teamId: targetClubId,
        role: '감독',
        ability: Math.min(89, topClubCand.coach.ability + 2),
        contractYears: 3,
        annualSalaryBillion: 3.5,
        signingBonusBillion: 1.0,
        totalBillion: 11.5,
        confirmed: true,
        isIncumbent: false,
        careerNote: `전 ${KBO_TEAMS[topClubCand.teamId].shortName} ${prevRole} → ${nextSeasonNum}시즌 ${KBO_TEAMS[targetClubId].shortName} 감독 승격`,
      };
      targetStaff[oldMgrIdx] = promotedMgr;
      promotedManagers.push(`${promotedMgr.name}(${KBO_TEAMS[targetClubId].shortName} 감독 취임)`);
    }
  }

  if (promotedManagers.length > 0) {
    pushNews(next, {
      date: `${next.season}-02-24`,
      category: '이적·계약',
      headline: `[감독 승격] ${promotedManagers.join(', ')} — 새 사령탑 세대교체`,
      body: `우수 코치진이 ${nextSeasonNum}시즌을 맞아 감독으로 승격했습니다. 감독·코치 관리 탭의 FA 지도자 시장에서 새로 승격된 감독과 은퇴 출신 신임 코치를 영입할 수 있습니다.`,
      teamId: next.playerTeamId,
      isHighlight: true,
    });
    next.transactionLogs.unshift({
      id: `tx-coach-promo-${nextSeasonNum}`,
      date: `${next.season}-02-24`,
      type: '계약',
      teamId: next.playerTeamId,
      summary: `오프시즌 지도자 이동: ${[...newCoachDebuts, ...promotedManagers].join(' · ')}`,
    });
  }

  // Ensure every team starts the new season with a complete 9-man lineup and 5-man rotation
  for (const tid of TEAM_IDS) {
    const t = next.teams[tid];
    t.nextStarterIdx = 0;

    while (t.lineupOrder.length < 9) {
      const regularCand = Object.values(next.players)
        .filter(
          (p) =>
            p.teamId === tid &&
            p.role === '타자' &&
            p.rosterTier !== '은퇴' &&
            p.rosterTier !== '해외이적' &&
            p.rosterTier !== 'FA' &&
            p.rosterTier !== '제외후보' &&
            p.rosterTier !== '육성' &&
            !isMilitaryServing(p.militaryStatus) &&
            !t.lineupOrder.includes(p.id)
        )
        .sort((a, b) => b.ability - a.ability)[0];

      const devFallback =
        regularCand ??
        Object.values(next.players)
          .filter(
            (p) =>
              p.teamId === tid &&
              p.role === '타자' &&
              p.rosterTier === '육성' &&
              !isMilitaryServing(p.militaryStatus) &&
              !t.lineupOrder.includes(p.id)
          )
          .sort((a, b) => b.ability - a.ability)[0];

      const faFallback =
        devFallback ??
        Object.values(next.players)
          .filter(
            (p) =>
              p.role === '타자' &&
              p.rosterTier === 'FA' &&
              p.category === '국내' &&
              !t.lineupOrder.includes(p.id)
          )
          .sort((a, b) => b.ability - a.ability)[0];

      const candidate = faFallback;
      if (!candidate) break;
      candidate.teamId = tid;
      candidate.rosterTier = '1군';
      candidate.gameDayActive = true;
      if (candidate.contract.yearsRemaining <= 0) {
        candidate.contract.yearsRemaining = 1;
        candidate.contract.endSeason = nextSeasonNum;
        candidate.contract.status = '확정';
      }
      t.lineupOrder.push(candidate.id);
      t.benchOrder = t.benchOrder.filter((id) => id !== candidate.id);
      t.lineupPositions[candidate.id] = candidate.position;
    }

    while (t.rotationOrder.length < 5) {
      const regularCand = Object.values(next.players)
        .filter(
          (p) =>
            p.teamId === tid &&
            p.role === '투수' &&
            p.rosterTier !== '은퇴' &&
            p.rosterTier !== '해외이적' &&
            p.rosterTier !== 'FA' &&
            p.rosterTier !== '제외후보' &&
            p.rosterTier !== '육성' &&
            !isMilitaryServing(p.militaryStatus) &&
            !t.rotationOrder.includes(p.id)
        )
        .sort((a, b) => b.ability - a.ability)[0];

      const devFallback =
        regularCand ??
        Object.values(next.players)
          .filter(
            (p) =>
              p.teamId === tid &&
              p.role === '투수' &&
              p.rosterTier === '육성' &&
              !isMilitaryServing(p.militaryStatus) &&
              !t.rotationOrder.includes(p.id)
          )
          .sort((a, b) => b.ability - a.ability)[0];

      const faFallback =
        devFallback ??
        Object.values(next.players)
          .filter(
            (p) =>
              p.role === '투수' &&
              p.rosterTier === 'FA' &&
              p.category === '국내' &&
              !t.rotationOrder.includes(p.id)
          )
          .sort((a, b) => b.ability - a.ability)[0];

      const candidate = faFallback;
      if (!candidate) break;
      candidate.teamId = tid;
      candidate.rosterTier = '1군';
      candidate.gameDayActive = true;
      candidate.pitchRole = '선발';
      if (candidate.contract.yearsRemaining <= 0) {
        candidate.contract.yearsRemaining = 1;
        candidate.contract.endSeason = nextSeasonNum;
        candidate.contract.status = '확정';
      }
      t.rotationOrder.push(candidate.id);
      t.bullpenOrder = t.bullpenOrder.filter((id) => id !== candidate.id);
    }
  }

  // Preserve all-time rivalry H2H & heat while resetting seasonal H2H counters
  resetRivalriesForNewSeason(next);

  // Sponsor multi-year countdown & complete seasonal revenue/expense reset (이월 누수 방지)
  const endedInDeficit =
    next.finances.cashBalanceBillion !== null && next.finances.cashBalanceBillion < 0;
  next.finances.consecutiveDeficitSeasons = endedInDeficit
    ? (next.finances.consecutiveDeficitSeasons ?? 0) + 1
    : 0;
  next.finances.deadMoneyEntries = (next.finances.deadMoneyEntries ?? [])
    .map((d) => ({
      ...d,
      remainingSeasons: d.remainingSeasons - 1,
      totalRemainingBillion: Number(Math.max(0, (d.remainingSeasons - 1) * d.annualObligationBillion).toFixed(2)),
    }))
    .filter((d) => d.remainingSeasons > 0);

  next.finances.ticketRevenueBillion = 0;
  next.finances.uniformRevenueBillion = 0;
  next.finances.franchiseMerchRevenueBillion = 0;
  next.finances.sponsorRevenueBillion = 0;
  next.finances.operatingExpenseBillion = 0;
  next.finances.maintenanceExpenseBillion = 0;
  next.finances.travelExpenseBillion = 0;
  next.finances.merchCogsBillion = 0;
  next.finances.payrollPaidBillion = 0;
  next.finances.incentivePaidBillion = 0;
  next.finances.signingBonusPaidBillion = 0;
  next.finances.optionBonusPaidBillion = 0;
  next.finances.compensationPaidBillion = 0;
  next.finances.compensationReceivedBillion = 0;
  next.finances.deadMoneyPaidBillion = 0;
  next.finances.postingRevenueBillion = 0;
  next.finances.seasonRevenueBillion = 0;
  next.finances.seasonExpenseBillion = 0;

  // 2027+ 개정 최저연봉 3,300만 원(0.33억) 바닥 보정 및 전역 OVR <= POT 불변식 보장
  const nextMinSal = getKboMinSalaryBillion(nextSeasonNum);
  for (const p of Object.values(next.players)) {
    if (
      p.category === '국내' &&
      p.contract.currency === 'KRW' &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적' &&
      p.contract.annualSalary > 0 &&
      p.contract.annualSalary < nextMinSal
    ) {
      p.contract.annualSalary = nextMinSal;
    }
    p.foreignReplacementReviewFlagged = false;
    p.roleChangeDissatisfactionNote = undefined;
  }
  sanitizeCareerOvrPotInPlace(next);

  if (next.finances.sponsor) {
    const sp = next.finances.sponsor;
    const rem = (sp.yearsRemaining ?? sp.contractYears ?? 1) - 1;
    if (rem <= 0) {
      sp.yearsRemaining = 0;
      sp.status = '만료';
      next.transactionLogs.unshift({
        id: `tx-sponsor-exp-${next.season}`,
        date: `${next.season}-03-01`,
        type: '재정',
        teamId: next.playerTeamId,
        summary: `메인 스폰서 계약 만료: ${sp.name} (재협상/신규 체결 필요)`,
        detail: '구단 재정 & 저장 메뉴에서 새 조건으로 재계약하거나 다른 스폰서를 선택하세요.',
      });
    } else {
      sp.yearsRemaining = rem;
      sp.status = '계약중';
    }
  }

  for (const mlbNews of pendingForeignMlbNews) {
    pushNews(next, mlbNews);
  }

  pushNews(next, {
    date: `${next.season}-03-01`,
    category: '경기·시리즈',
    headline: `[${next.season} KBO 개막] 전 구단 새 시즌 출격 · 드래프트 1순위 ${reverseOrder[0]}`,
    body: `${next.season}시즌 정규리그가 개막합니다. ${KBO_TEAMS[next.playerTeamId].name} 목표: ${next.ownerEval.targetRankLabel}${dischargedList.length > 0 ? ` · 상무 전역 복귀: ${dischargedList.join(', ')}` : ''}`,
    teamId: next.playerTeamId,
    isHighlight: true,
  });

  next.transactionLogs.unshift({
    id: `tx-newseason-${next.season}`,
    date: `${next.season}-03-01`,
    type: '엔트리',
    teamId: next.playerTeamId,
    summary: `${next.season}시즌 개막 준비 완료 (전원 +1세 · 비시즌 성장 ${offseasonGrownCount}명 / 노쇠화 ${offseasonDeclinedCount}명)`,
    detail:
      retiredNames.length > 0
        ? `우리 구단 은퇴: ${retiredNames.join(', ')} · 드래프트 역순(${reverseOrder[0]} 1순위) 반영`
        : `전년도 성적 역순(${reverseOrder[0]} 1순위) 드래프트 및 신규 해외 마켓 갱신 완료`,
  });

  for (const tid of TEAM_IDS) {
    assignTeamBullpenRolesInPlace(next, tid);
  }

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export interface ExternalFaListing {
  player: Player;
  grade: 'A' | 'B' | 'C';
  compensationRule: string;
  fairYears: number;
  fairTotalBillion: number;
  cashCompBillion: number;
  protectionLimit: 20 | 25 | null;
}

function buildFaListing(career: CareerSave, p: Player): ExternalFaListing | null {
  const q = computeFaQualification(career, p);
  const grade = q.grade ?? p.contract.faGrade;
  if (!grade) return null;
  const fairYears = p.age >= 35 ? 2 : p.age >= 32 ? 3 : 4;
  const baseAnnual =
    p.ability >= 86
      ? 18
      : p.ability >= 82
      ? 12.5
      : p.ability >= 78
      ? 7.5
      : 4.0;
  const fairTotalBillion = Number(
    Math.max(6, baseAnnual * fairYears * (p.age >= 35 ? 0.78 : 1.0)).toFixed(1)
  );
  const prevAnnual = Math.max(1, p.contract.annualSalary);
  const cashCompBillion = Number(
    (grade === 'A' ? prevAnnual * 2.0 : grade === 'B' ? prevAnnual * 1.0 : prevAnnual * 1.5).toFixed(2)
  );
  const protectionLimit: 20 | 25 | null = grade === 'A' ? 20 : grade === 'B' ? 25 : null;
  return {
    player: p,
    grade,
    compensationRule: q.compensationRule,
    fairYears,
    fairTotalBillion,
    cashCompBillion,
    protectionLimit,
  };
}

/**
 * 시즌 종료·FA 공시 시점에 계약이 만료되고 FA 자격을 취득한 선수를 소속 구단 로스터에서 자동 이탈(rosterTier='FA')시킵니다.
 * 원소속 구단은 formerTeamId에 보존되어 재계약(무보상) 또는 타 구단 이적(A/B/C등급 보상)에 반영됩니다.
 */
export function releaseExpiredFaPlayersToMarket(
  career: CareerSave,
  dateStr = `${career.season}-11-16`
): Player[] {
  if (career.faReleasedSeason === career.season) return [];

  const departedAll: Player[] = [];
  const departedMyClub: Player[] = [];

  for (const p of Object.values(career.players)) {
    if (p.category !== '국내') continue;
    if (
      p.rosterTier === 'FA' ||
      p.rosterTier === '은퇴' ||
      p.rosterTier === '해외이적' ||
      p.rosterTier === '육성'
    ) {
      continue;
    }
    if (isMilitaryServing(p.militaryStatus)) continue;
    if (p.signedAsFaSeason === career.season) continue;

    // 시즌 종료 시점에 잔여 계약이 1년 이하(해당 시즌 만료)이며 FA 자격을 충족한 경우
    if (p.contract.yearsRemaining > 1) continue;
    const faQual = computeFaQualification(career, p);
    if (!faQual.isFaEligible || !faQual.grade) continue;

    const prevTeam = p.teamId;
    p.formerTeamId = prevTeam;
    p.rosterTier = 'FA';
    p.gameDayActive = false;
    p.contract.status = '만료';
    p.contract.yearsRemaining = 0;
    p.contract.isFAEligible = true;
    p.contract.faGrade = faQual.grade;

    const ts = career.teams[prevTeam];
    if (ts) {
      ts.lineupOrder = ts.lineupOrder.filter((id) => id !== p.id);
      ts.benchOrder = ts.benchOrder.filter((id) => id !== p.id);
      ts.rotationOrder = ts.rotationOrder.filter((id) => id !== p.id);
      ts.bullpenOrder = ts.bullpenOrder.filter((id) => id !== p.id);
    }

    departedAll.push(p);
    if (prevTeam === career.playerTeamId) {
      departedMyClub.push(p);
    }
  }

  // Ensure each team's lineup & rotation backfill cleanly from remaining 1군/2군 depth
  for (const tid of TEAM_IDS) {
    const ts = career.teams[tid];
    if (!ts) continue;
    if (ts.lineupOrder.length < 9) {
      const fillers = Object.values(career.players)
        .filter(
          (pl) =>
            pl.teamId === tid &&
            pl.role === '타자' &&
            (pl.rosterTier === '1군' || pl.rosterTier === '2군') &&
            !ts.lineupOrder.includes(pl.id)
        )
        .sort((a, b) => (a.rosterTier === '1군' ? 0 : 1) - (b.rosterTier === '1군' ? 0 : 1) || b.ability - a.ability);
      for (const f of fillers) {
        if (ts.lineupOrder.length >= 9) break;
        f.rosterTier = '1군';
        f.gameDayActive = true;
        ts.lineupOrder.push(f.id);
        ts.benchOrder = ts.benchOrder.filter((id) => id !== f.id);
      }
    }
  }

  career.faReleasedSeason = career.season;

  if (departedMyClub.length > 0) {
    const names = departedMyClub.map((p) => `${p.name}(${p.contract.faGrade}등급)`).join(', ');
    career.transactionLogs.unshift({
      id: `tx-fa-depart-${career.season}`,
      date: dateStr,
      type: '계약',
      teamId: career.playerTeamId,
      summary: `FA 자격 취득으로 구단 자동 이탈 (${departedMyClub.length}명): ${names} → FA 시장 등록`,
      detail: 'FA 탭에서 원소속팀 재계약 협상(보상 없음)을 진행하지 않으면 차기 시즌 타 구단으로 이적할 수 있습니다.',
    });
    pushNews(career, {
      date: dateStr,
      category: '이적·계약',
      headline: `[FA 공시] ${KBO_TEAMS[career.playerTeamId].shortName} ${departedMyClub[0].name}${
        departedMyClub.length > 1 ? ` 외 ${departedMyClub.length - 1}명` : ''
      }, FA 자격 취득으로 팀 자동 이탈`,
      body: `${names} 선수가 FA 자격을 취득해 소속 구단 로스터에서 자동 이탈하여 KBO FA 시장에 등록되었습니다. 재계약을 원할 경우 [계약·FA·트레이드 > FA] 탭에서 협상하세요.`,
      teamId: career.playerTeamId,
      isHighlight: true,
    });
  }

  // FA 공시 직후 10개 구단 FA 경쟁 입찰 시장 자동 동기화
  syncFaCompetitionMarketInPlace(career, dateStr);

  return departedAll;
}

/**
 * 우리 구단 소속이었다가 FA 자격 취득으로 자동 이탈해 FA 시장에 나와 있는 선수 목록 (원소속 재계약 대상 · 보상 없음)
 */
export function getMyDepartedFaPlayers(career: CareerSave): ExternalFaListing[] {
  return Object.values(career.players)
    .filter(
      (p) =>
        p.rosterTier === 'FA' &&
        (p.formerTeamId ?? p.teamId) === career.playerTeamId &&
        p.signedAsFaSeason !== career.season
    )
    .map((p) => buildFaListing(career, p))
    .filter((x): x is ExternalFaListing => x !== null)
    .sort((a, b) => b.player.ability - a.player.ability);
}

export function getExternalFaMarket(career: CareerSave): ExternalFaListing[] {
  const allExternal = Object.values(career.players).filter((p) => {
    if (p.category !== '국내') return false;
    if (isMilitaryServing(p.militaryStatus)) return false;
    if (p.signedAsFaSeason === career.season) return false;
    const originTeam = p.formerTeamId ?? p.teamId;
    if (originTeam === career.playerTeamId) return false;
    return true;
  });

  // 실제 FA 시장에 공시·등록된 선수가 있으면 전원 누락 없이 반환 (임의 slice 절단 금지)
  const registeredFas = allExternal.filter((p) => p.rosterTier === 'FA');
  const pool =
    registeredFas.length > 0
      ? registeredFas
      : allExternal.filter(
          (p) =>
            (p.rosterTier === '1군' || p.rosterTier === '2군') &&
            p.contract.yearsRemaining <= 1
        );

  return pool
    .map((p) => buildFaListing(career, p))
    .filter((x): x is ExternalFaListing => x !== null)
    .sort(
      (a, b) =>
        (b.player.rosterTier === 'FA' ? 1 : 0) - (a.player.rosterTier === 'FA' ? 1 : 0) ||
        b.player.ability - a.player.ability
    );
}

export function signExternalFaPlayer(
  career: CareerSave,
  playerId: string,
  offerYears: number,
  offerTotalBillion: number
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  accepted: boolean;
  message: string;
  needsProtectionList: boolean;
} {
  if (!Number.isFinite(offerYears) || offerYears < 1 || !Number.isFinite(offerTotalBillion) || offerTotalBillion <= 0) {
    throw new Error('유효한 FA 계약 연수와 총액을 입력해 주세요.');
  }

  const { nextCareer, backupSnapshot, result } = executeAtomicCareerMutation(career, (next) => {
    ensureFranchiseState(next);
    ensureDeepFranchiseState(next);
    ensureCompetitiveBalanceState(next);

    if (next.pendingFaProtection) {
      throw new Error('먼저 진행 중인 FA 보상선수 보호명단 제출을 완료해야 다음 FA 계약을 체결할 수 있습니다.');
    }

    const p = next.players[playerId];
    if (!p) throw new Error('대상 FA 선수를 찾을 수 없습니다.');
    const originTeam = p.formerTeamId ?? p.teamId;
    const isOwnFormerFa = p.rosterTier === 'FA' && originTeam === next.playerTeamId;

    if (!isOwnFormerFa && p.teamId === next.playerTeamId && p.rosterTier !== 'FA') {
      throw new Error('이미 우리 구단과 계약되어 있는 선수입니다 (중복 계약 방지).');
    }
    if (p.signedAsFaSeason === next.season) {
      throw new Error('이미 올 시즌 FA 계약을 체결한 선수입니다 (중복 계약 방지).');
    }
    if (!isOwnFormerFa && getTeamExternalFaSigningCount(next, next.playerTeamId) >= MAX_EXTERNAL_FA_PER_CLUB) {
      throw new Error(
        `KBO 규정상 단일 시즌 외부 FA 영입은 최대 ${MAX_EXTERNAL_FA_PER_CLUB}명까지 가능합니다. (원소속팀 FA 재계약은 제한 없음)`
      );
    }

    const listing = isOwnFormerFa
      ? getMyDepartedFaPlayers(next).find((x) => x.player.id === playerId)
      : getExternalFaMarket(next).find((x) => x.player.id === playerId);
    if (!listing) {
      throw new Error('현재 FA 자격을 충족하지 않은 선수입니다.');
    }

    const signingBonus = Number((offerTotalBillion * 0.4).toFixed(2));
    const cComp = !isOwnFormerFa && listing.grade === 'C' ? listing.cashCompBillion : 0;
    const upFrontCash = Number((signingBonus + cComp).toFixed(2));
    if (next.finances.cashBalanceBillion !== null && next.finances.cashBalanceBillion < upFrontCash) {
      throw new Error(`계약금${cComp > 0 ? '+C등급 보상금' : ''}(${upFrontCash}억 원)이 보유 자금을 초과합니다.`);
    }

    // Evaluate agent preference + difficulty rival bidding (#6, #23)
    // 단, 샐러리캡 상한 초과만을 이유로 계약을 자동 취소하지 않습니다.
    const evalRes = evaluatePlayerContractAcceptance(
      next,
      p,
      offerTotalBillion,
      offerYears,
      isOwnFormerFa ? Number((listing.fairTotalBillion * 0.94).toFixed(1)) : listing.fairTotalBillion
    );
    if (!evalRes.accepted) {
      return {
        accepted: false,
        message: evalRes.reason,
        needsProtectionList: false,
      };
    }

    const fromTeam = originTeam;
    if (next.teams[fromTeam]) {
      next.teams[fromTeam].lineupOrder = next.teams[fromTeam].lineupOrder.filter((id) => id !== p.id);
      next.teams[fromTeam].benchOrder = next.teams[fromTeam].benchOrder.filter((id) => id !== p.id);
      next.teams[fromTeam].rotationOrder = next.teams[fromTeam].rotationOrder.filter((id) => id !== p.id);
      next.teams[fromTeam].bullpenOrder = next.teams[fromTeam].bullpenOrder.filter((id) => id !== p.id);
    }

    const prevAnnualSalBeforeSign = Math.max(0.33, p.previousAnnualSalary ?? p.contract.annualSalary ?? 1.0);
    p.previousAnnualSalary = prevAnnualSalBeforeSign;
    p.teamId = next.playerTeamId;
    p.formerTeamId = undefined;
    if (!isOwnFormerFa) {
      p.clubTenureSeasons = 1;
    }
    p.rosterTier = '1군';
    p.gameDayActive = true;
    p.signedAsFaSeason = next.season;
    p.morale = '만족';
    p.contract = {
      status: '확정',
      currency: 'KRW',
      years: offerYears,
      yearsRemaining: offerYears,
      annualSalary: Number(((offerTotalBillion - signingBonus) / Math.max(1, offerYears)).toFixed(2)),
      signingBonus,
      totalValue: Number(offerTotalBillion.toFixed(2)),
      startSeason: next.season,
      endSeason: next.season + offerYears - 1,
      isFAEligible: false,
      faGrade: listing.grade,
      optionBonusPaidBillion: 0,
      note: isOwnFormerFa
        ? `${next.season} 원소속팀 FA 잔류 재계약 (${offerYears}년 총액 ${offerTotalBillion.toFixed(1)}억)`
        : `${next.season} 외부 FA ${listing.grade}등급 영입 (${offerYears}년 총액 ${offerTotalBillion.toFixed(1)}억)`,
    };
    reassignNonConflictingUniformNumber(next, p, next.playerTeamId);

    if (p.role === '투수') {
      if (p.pitchRole === '선발' && next.teams[next.playerTeamId].rotationOrder.length < 5) {
        next.teams[next.playerTeamId].rotationOrder.push(p.id);
      } else {
        next.teams[next.playerTeamId].bullpenOrder.push(p.id);
      }
    } else {
      next.teams[next.playerTeamId].benchOrder.push(p.id);
    }

    // Deduct signing bonus (+ C-grade cash compensation for external FA only)
    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - upFrontCash).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + upFrontCash).toFixed(2));
    } else {
      next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + upFrontCash).toFixed(2));
    }

    const faSeasonRule = getKboFaCompensationRuleForSeason(next.season, listing.grade);
    let needsProtectionList = false;
    if (!isOwnFormerFa && faSeasonRule.playerCompensationAllowed && (listing.grade === 'A' || listing.grade === 'B')) {
      next.pendingFaProtection = {
        signedPlayerId: p.id,
        signedPlayerName: p.name,
        fromTeamId: fromTeam,
        faGrade: listing.grade,
        protectionLimit: listing.grade === 'A' ? 20 : 25,
        protectedIds: [],
        cashCompBillion: Number((prevAnnualSalBeforeSign * faSeasonRule.cashWithPlayerRatio).toFixed(2)),
      };
      needsProtectionList = true;
    }

    const today = `${next.season}-11-24`;
    next.transactionLogs.unshift({
      id: `tx-extfa-${Date.now()}`,
      date: today,
      type: '계약',
      teamId: next.playerTeamId,
      summary: isOwnFormerFa
        ? `원소속 FA 재계약: ${p.name} (${offerYears}년 총액 ${offerTotalBillion.toFixed(1)}억 · 보상 없음)`
        : `외부 FA 영입(${listing.grade}등급): ${p.name} (${offerYears}년 총액 ${offerTotalBillion.toFixed(1)}억 · 원소속 ${fromTeam})`,
      detail: isOwnFormerFa
        ? 'FA 이탈 선수 원소속 구단 잔류 계약 완료'
        : needsProtectionList
        ? `보호선수 ${listing.protectionLimit}인 명단 제출 및 보상금 ${listing.cashCompBillion}억 원 정산 필요`
        : `C등급 보상금 ${listing.cashCompBillion}억 원 정산 완료 (보상선수 없음)`,
    });
    pushNews(next, {
      date: today,
      category: '이적·계약',
      headline: isOwnFormerFa
        ? `[FA 재계약] ${KBO_TEAMS[next.playerTeamId].shortName}, ${p.name}과 ${offerYears}년 ${offerTotalBillion.toFixed(1)}억 잔류 합의`
        : `[외부 FA 계약] ${KBO_TEAMS[next.playerTeamId].shortName}, ${listing.grade}등급 ${p.name} ${offerYears}년 ${offerTotalBillion.toFixed(1)}억 영입`,
      body: isOwnFormerFa
        ? `FA 시장에 나왔던 ${p.name} 선수가 원소속팀 ${KBO_TEAMS[next.playerTeamId].name}와 잔류 계약을 체결했습니다.`
        : `${evalRes.reason} ${listing.compensationRule}`,
      teamId: next.playerTeamId,
      isHighlight: true,
    });

    // FA 경쟁 입찰 즉시 마감 + 중복 계약 방지 + 전체 구단 영입 현황 기록
    markFaNegotiationSignedInPlace(
      next,
      p.id,
      next.playerTeamId,
      offerYears,
      offerTotalBillion,
      isOwnFormerFa,
      today
    );
    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `fa-${next.season}-${p.id}-${next.playerTeamId}`,
        season: next.season,
        date: today,
        category: 'FA',
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        previousTeamLabel: isOwnFormerFa
          ? `${KBO_TEAMS[fromTeam].shortName} (원소속 재계약)`
          : KBO_TEAMS[fromTeam].shortName,
        acquiringTeamId: next.playerTeamId,
        contractAmountLabel: `${offerYears}년 ${offerTotalBillion.toFixed(1)}억`,
        note: isOwnFormerFa
          ? '원소속 FA 잔류 계약'
          : `${listing.grade}등급 외부 FA 영입`,
      },
      { pushNewsAlert: false }
    );

    next.version = bumpVersion(next.version);
    next.updatedAt = new Date().toISOString();
    return {
      accepted: true,
      message: isOwnFormerFa
        ? `${p.name} 원소속팀 FA 잔류 재계약 완료 (${offerYears}년 ${offerTotalBillion.toFixed(1)}억 · 보상 없음)!`
        : needsProtectionList
        ? `${p.name} FA 영입 확정! ${fromTeam} 구단에 제출할 보호선수 ${listing.protectionLimit}인 명단을 선택해 주세요.`
        : `${p.name} (C등급) FA 영입 완료 · 금전 보상 ${listing.cashCompBillion}억 원 정산됨.`,
      needsProtectionList,
    };
  });

  return {
    nextCareer,
    backupSnapshot,
    accepted: result.accepted,
    message: result.message,
    needsProtectionList: result.needsProtectionList,
  };
}

