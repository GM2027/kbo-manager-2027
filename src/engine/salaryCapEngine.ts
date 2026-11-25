import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  CareerSave,
  ClubSalaryCapSeasonRecord,
  CompetitiveBalanceClubState,
  CompetitiveBalanceState,
  DraftState,
  Player,
  SalaryCapContributor,
  SalaryCapSummary,
  TeamId,
} from '../types/kbo';

export const COMPETITIVE_BALANCE_SCHEMA_VERSION = 2;
const USD_TO_KRW_RATE = 1350;

// =============================================================================
// 1. IN-GAME KBO CALENDAR DATE HELPER (맨위 왼쪽 상단 날짜 표시용)
// =============================================================================

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function parseWeekdayKo(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return '';
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return WEEKDAY_KO[dt.getUTCDay()] ?? '';
}

function addDaysIsoDate(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return isoDate;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return dt.toISOString().slice(0, 10);
}

export interface CareerCalendarDateInfo {
  isoDate: string;
  displayDate: string; // e.g. '2026.04.07 (화)'
  koreanFullDate: string; // e.g. '2026년 4월 7일 (화)'
  weekdayKo: string;
  phaseLabel: string;
}

export function getCurrentCareerDate(career: CareerSave): CareerCalendarDateInfo {
  const season = career.season;
  let isoDate = `${season}-03-28`;
  let phaseLabel = '정규시즌';

  const isOnboarding = [
    'INTRO',
    'STAFF',
    'ROSTER_ANALYSIS',
    'REINFORCEMENT',
    'SPECIAL_DRAFT',
    'OPENING_ROSTER',
  ].includes(career.phase);

  const hasExplicitDate =
    typeof career.currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(career.currentDate);

  if (isOnboarding) {
    phaseLabel = hasExplicitDate && career.currentDate!.slice(5, 7) <= '02' ? '스토브리그 · 개막 준비' : '개막 준비';
    if (hasExplicitDate) {
      isoDate = career.currentDate!;
    } else {
      const opening = career.schedule[0]?.dates?.[0] ?? `${season}-03-28`;
      const offsetByPhase: Record<string, number> = {
        INTRO: -8,
        STAFF: -7,
        ROSTER_ANALYSIS: -6,
        REINFORCEMENT: -5,
        SPECIAL_DRAFT: -3,
        OPENING_ROSTER: -1,
      };
      isoDate = addDaysIsoDate(opening, offsetByPhase[career.phase] ?? -5);
    }
  } else if (career.phase === 'REGULAR_SEASON') {
    phaseLabel = '정규시즌';
    const curSeries = career.schedule[career.currentSeriesIndex];
    if (curSeries && curSeries.dates && curSeries.dates.length > 0) {
      const idx = Math.min(curSeries.dates.length - 1, Math.max(0, curSeries.completedRounds ?? 0));
      isoDate = curSeries.dates[idx];
    } else if (career.gamesLedger.length > 0) {
      const regGames = career.gamesLedger.filter((g) => !g.isPostseason);
      const last = regGames[regGames.length - 1] ?? career.gamesLedger[career.gamesLedger.length - 1];
      isoDate = last?.date ?? `${season}-10-02`;
    } else {
      isoDate = career.schedule[0]?.dates?.[0] ?? `${season}-03-28`;
    }
    if (hasExplicitDate && career.currentDate! > isoDate) {
      isoDate = career.currentDate!;
    }
  } else if (career.phase === 'POSTSEASON') {
    phaseLabel = '포스트시즌';
    const psGames = career.gamesLedger.filter((g) => g.isPostseason);
    if (psGames.length > 0) {
      const lastPs = psGames[psGames.length - 1];
      isoDate = lastPs.date;
    } else {
      const regGames = career.gamesLedger.filter((g) => !g.isPostseason);
      const lastReg = regGames[regGames.length - 1];
      isoDate = lastReg ? addDaysIsoDate(lastReg.date, 4) : `${season}-10-06`;
    }
    if (hasExplicitDate && career.currentDate! > isoDate) {
      isoDate = career.currentDate!;
    }
  } else if (career.phase === 'OFFSEASON') {
    phaseLabel = '오프시즌';
    if (hasExplicitDate) {
      isoDate = career.currentDate!;
    } else {
      const step8 = career.offseasonStep8;
      const step12 = career.offseasonStep12;
      const step4 = career.offseasonStep;
      const step8Dates: Record<string, string> = {
        SETTLEMENT: `${season}-11-12`,
        OWNER_EVAL: `${season}-11-15`,
        COACH_STAFF: `${season}-11-19`,
        ROSTER_CLEANUP: `${season}-11-23`,
        PLAYER_CONTRACTS: `${season}-12-08`,
        ROSTER_UPGRADE: `${season}-12-22`,
        OPENING_PREP: `${season + 1}-02-15`,
        NEXT_SEASON_START: `${season + 1}-03-18`,
      };
      const step12Dates: Record<string, string> = {
        FINAL_SETTLEMENT: `${season}-11-12`,
        OWNER_EVAL: `${season}-11-14`,
        COACH_EVAL: `${season}-11-16`,
        POWER_ANALYSIS: `${season}-11-18`,
        RESERVE_AND_RELEASE: `${season}-11-22`,
        FA_MARKET: `${season}-11-26`,
        FOREIGN_ROSTER: `${season}-12-08`,
        TRADE_MARKET: `${season}-12-18`,
        SALARY_NEGOTIATION: `${season + 1}-01-15`,
        ROOKIE_DEVELOPMENT: `${season + 1}-01-25`,
        SPRING_CAMP: `${season + 1}-02-12`,
        OPENING_PREP: `${season + 1}-03-18`,
      };
      const step4Dates: Record<string, string> = {
        AWARDS_AND_EVAL: `${season}-11-15`,
        DOMESTIC_CONTRACTS: `${season}-11-26`,
        FOREIGN_MARKET: `${season}-12-10`,
        ROOKIE_DRAFT: `${season + 1}-01-20`,
      };
      isoDate =
        (step8 && step8Dates[step8]) ||
        (step12 && step12Dates[step12]) ||
        (step4 && step4Dates[step4]) ||
        `${season}-11-15`;
    }
  }

  const [y, m, d] = isoDate.split('-').map(Number);
  const weekdayKo = parseWeekdayKo(isoDate);
  const displayDate = `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}${weekdayKo ? ` (${weekdayKo})` : ''}`;
  const koreanFullDate = `${y}년 ${m}월 ${d}일${weekdayKo ? ` (${weekdayKo})` : ''}`;

  return {
    isoDate,
    displayDate,
    koreanFullDate,
    weekdayKo,
    phaseLabel,
  };
}

// =============================================================================
// 2. OFFICIAL KBO COMPETITIVE BALANCE CAP & FLOOR SCHEDULES (2026~2028+)
// =============================================================================

/**
 * 공식 KBO 경쟁균형세 상한액 (단위: 만 원)
 * - 2026년: 143억 9,723만 원
 * - 2027년: 151억 1,709만 원 (+5%)
 * - 2028년: 158억 7,294만 원 (+5%)
 * - 2029년 이후: 직전 연도 대비 매년 5% 상향
 */
export function getAnnualKboCapManwon(season: number): number {
  if (season <= 2026) return 1_439_723;
  if (season === 2027) return 1_511_709;
  if (season === 2028) return 1_587_294;
  let val = 1_587_294;
  for (let y = 2029; y <= season; y++) {
    val = Math.round(val * 1.05);
  }
  return val;
}

export function getAnnualKboCapBillion(season: number): number {
  return Number((getAnnualKboCapManwon(season) / 10000).toFixed(4));
}

/**
 * 공식 KBO 경쟁균형세 하한액 (2027년 도입, 단위: 만 원)
 * - 2026년: 미도입 (null)
 * - 2027년: 60억 6,538만 원 (KBO 하한액 기준)
 * - 2028년 이후: 매년 5% 상향
 */
export function getAnnualKboFloorManwon(season: number): number | null {
  if (season < 2027) return null;
  if (season === 2027) return 606_538;
  let val = 606_538;
  for (let y = 2028; y <= season; y++) {
    val = Math.round(val * 1.05);
  }
  return val;
}

export function getAnnualKboFloorBillion(season: number): number | null {
  const manwon = getAnnualKboFloorManwon(season);
  return manwon === null ? null : Number((manwon / 10000).toFixed(4));
}

export function formatManwonKorean(manwon: number): string {
  const rounded = Math.round(manwon);
  if (rounded === 0) return '0원';
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const eok = Math.floor(abs / 10000);
  const remMan = abs % 10000;
  if (eok > 0 && remMan > 0) {
    return `${sign}${eok.toLocaleString()}억 ${remMan.toLocaleString()}만 원`;
  }
  if (eok > 0) {
    return `${sign}${eok.toLocaleString()}억 원`;
  }
  return `${sign}${remMan.toLocaleString()}만 원`;
}

export function formatBillionExactKorean(billion: number): string {
  return formatManwonKorean(Math.round(billion * 10000));
}

export function getProgressivePenaltyRatePct(consecutiveCount: number): number {
  if (consecutiveCount <= 0) return 0;
  if (consecutiveCount === 1) return 30;
  if (consecutiveCount === 2) return 50;
  return 100;
}

// =============================================================================
// 3. OFFICIAL MULTI-YEAR CONTRACT CALCULATION & FRANCHISE EXCEPTION TENURE
// =============================================================================

/**
 * KBO 경쟁균형세 공식 산정 대상 보수 계산 (억 원)
 * - 신규 다년계약(years > 1): (연봉 총액 + 계약금) / 계약 연수 + 옵션 지급액
 * - 단년계약(years <= 1): 연봉 + 계약금 + 옵션 지급액
 * (외국인/아시아쿼터 USD 계약은 1,350원/달러 환산)
 */
export function computeOfficialContractCountedBillion(player: Player): {
  baseAnnualizedBillion: number;
  optionPaidBillion: number;
  countedBillion: number;
  rawAnnualBillion: number;
  signingBonusBillion: number;
  years: number;
  formulaLabel: string;
} {
  const c = player.contract;
  const years = Math.max(1, Math.round(c.years || 1));
  const rawAnnualBillion =
    c.currency === 'USD'
      ? Number(((c.annualSalary * USD_TO_KRW_RATE) / 100_000_000).toFixed(4))
      : Number((c.annualSalary || 0).toFixed(4));
  const signingBonusBillion =
    c.currency === 'USD'
      ? Number((((c.signingBonus || 0) * USD_TO_KRW_RATE) / 100_000_000).toFixed(4))
      : Number((c.signingBonus || 0).toFixed(4));
  const optionPaidBillion = Number(
    (
      c.optionBonusPaidBillion ??
      (c.incentivePaid ? c.incentiveBonusBillion ?? 0 : 0)
    ).toFixed(4)
  );

  // Multi-year official formula: (annual * years + signingBonus) / years + optionPaid
  const baseAnnualizedBillion =
    years > 1
      ? Number(((rawAnnualBillion * years + signingBonusBillion) / years).toFixed(4))
      : Number((rawAnnualBillion + signingBonusBillion).toFixed(4));

  const countedBillion = Number(Math.max(0, baseAnnualizedBillion + optionPaidBillion).toFixed(4));

  const formulaLabel =
    years > 1
      ? `(${(rawAnnualBillion * years).toFixed(2)}억 + 계약금 ${signingBonusBillion.toFixed(2)}억) ÷ ${years}년${
          optionPaidBillion > 0 ? ` + 옵션 ${optionPaidBillion.toFixed(2)}억` : ''
        }`
      : `단년 ${rawAnnualBillion.toFixed(2)}억${signingBonusBillion > 0 ? ` + 계약금 ${signingBonusBillion.toFixed(2)}억` : ''}${
          optionPaidBillion > 0 ? ` + 옵션 ${optionPaidBillion.toFixed(2)}억` : ''
        }`;

  return {
    baseAnnualizedBillion,
    optionPaidBillion,
    countedBillion,
    rawAnnualBillion,
    signingBonusBillion,
    years,
    formulaLabel,
  };
}

/**
 * 선수의 현 소속 구단 등록 시즌 수 (7시즌 이상 시 프랜차이즈 예외 선수 지정 자격 부여)
 */
export function getPlayerClubTenureSeasons(player: Player): number {
  if (typeof player.clubTenureSeasons === 'number' && Number.isFinite(player.clubTenureSeasons)) {
    return Math.max(0, Math.floor(player.clubTenureSeasons));
  }
  const byRegDays =
    typeof player.registrationDays === 'number' ? Math.floor(player.registrationDays / 145) : 0;
  const base = Math.max(player.serviceYears ?? 0, byRegDays);
  // 최근 타 구단 FA 이적 계약이 명시된 선수는 초기 원클럽 재직 연수를 보수적으로 판정
  const note = player.contract?.note ?? '';
  if (note.includes('외부 FA') || note.includes('FA 이적') || note.includes('트레이드 영입')) {
    return Math.min(base, 2);
  }
  return Math.max(0, base);
}

/**
 * KBO 경쟁균형세 연봉 상위 40인 산정 대상 선수 여부
 * - 국내 소속 선수 (외국인·아시아쿼터는 별도 외국인 샐러리캡 적용)
 * - 1군·2군·대기 등록 선수 (은퇴·해외이적·육성·FA·제외후보·상무복무 제외)
 * - 당해 연도 신인(입단 1년차) 제외
 */
export function isEligibleForTop40CompetitiveBalance(player: Player, teamId: TeamId): boolean {
  if (player.teamId !== teamId) return false;
  if (player.category !== '국내') return false;
  if (
    player.rosterTier === '은퇴' ||
    player.rosterTier === '해외이적' ||
    player.rosterTier === '육성' ||
    player.rosterTier === 'FA' ||
    player.rosterTier === '제외후보'
  ) {
    return false;
  }
  if (isMilitaryServing(player.militaryStatus)) return false;
  if (player.rookieInfo && (player.serviceYears ?? 0) === 0) return false;
  return true;
}

export function getEligibleFranchiseExceptionPlayers(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): (Player & { countedBillion: number; tenureSeasons: number })[] {
  return Object.values(career.players)
    .filter((p) => isEligibleForTop40CompetitiveBalance(p, teamId))
    .map((p) => {
      const calc = computeOfficialContractCountedBillion(p);
      const tenureSeasons = getPlayerClubTenureSeasons(p);
      return Object.assign({}, p, { countedBillion: calc.countedBillion, tenureSeasons });
    })
    .filter((p) => p.tenureSeasons >= 7)
    .sort((a, b) => b.countedBillion - a.countedBillion);
}

// =============================================================================
// 4. COMPETITIVE BALANCE STATE INITIALIZATION & LEGACY MIGRATION
// =============================================================================

function createDefaultClubCbState(teamId: TeamId, season: number): CompetitiveBalanceClubState {
  return {
    teamId,
    exceedStreak: 0,
    underFloorStreak: 0,
    exceptionPlayerId: null,
    exceptionSeason: season,
    pendingDraftPenaltyForSeason: null,
    appliedDraftPenaltySeasons: [],
    totalTaxPaidBillion: 0,
    totalFloorPenaltyPaidBillion: 0,
  };
}

export function ensureCompetitiveBalanceState(career: CareerSave): CompetitiveBalanceState {
  if (!career.competitiveBalance) {
    const clubs = {} as Record<TeamId, CompetitiveBalanceClubState>;
    for (const tid of TEAM_IDS) {
      clubs[tid] = createDefaultClubCbState(tid, career.season);
    }
    // Migrate legacy player team exceed streak if present
    if ((career.finances?.salaryCapExceedStreak ?? 0) > 0) {
      clubs[career.playerTeamId].exceedStreak = career.finances.salaryCapExceedStreak!;
    }
    if ((career.finances?.luxuryTaxPaidBillion ?? 0) > 0) {
      clubs[career.playerTeamId].totalTaxPaidBillion = career.finances.luxuryTaxPaidBillion!;
    }
    career.competitiveBalance = {
      schemaVersion: COMPETITIVE_BALANCE_SCHEMA_VERSION,
      clubs,
      settledSeasons: [],
      seasonHistory: [],
    };
  }

  const cb = career.competitiveBalance;
  cb.schemaVersion = COMPETITIVE_BALANCE_SCHEMA_VERSION;
  if (!Array.isArray(cb.settledSeasons)) cb.settledSeasons = [];
  if (!Array.isArray(cb.seasonHistory)) cb.seasonHistory = [];
  if (!cb.clubs) cb.clubs = {} as Record<TeamId, CompetitiveBalanceClubState>;

  for (const tid of TEAM_IDS) {
    if (!cb.clubs[tid]) {
      cb.clubs[tid] = createDefaultClubCbState(tid, career.season);
    }
    const club = cb.clubs[tid];
    club.exceedStreak = Math.max(0, Math.floor(club.exceedStreak ?? 0));
    club.underFloorStreak = Math.max(0, Math.floor(club.underFloorStreak ?? 0));
    if (!Array.isArray(club.appliedDraftPenaltySeasons)) {
      club.appliedDraftPenaltySeasons = [];
    } else {
      club.appliedDraftPenaltySeasons = Array.from(new Set(club.appliedDraftPenaltySeasons));
    }

    // Validate designated exception player still belongs to club and qualifies (>= 7 seasons)
    if (club.exceptionPlayerId) {
      const exPlayer = career.players[club.exceptionPlayerId];
      if (
        !exPlayer ||
        !isEligibleForTop40CompetitiveBalance(exPlayer, tid) ||
        getPlayerClubTenureSeasons(exPlayer) < 7
      ) {
        club.exceptionPlayerId = null;
      }
    }

    // Auto-select optimal franchise exception for AI clubs (or if season rotated)
    if (tid !== career.playerTeamId && (!club.exceptionPlayerId || club.exceptionSeason !== career.season)) {
      const eligible = getEligibleFranchiseExceptionPlayers(career, tid);
      club.exceptionPlayerId = eligible[0]?.id ?? null;
      club.exceptionSeason = career.season;
    }
  }

  // Deduplicate settledSeasons
  cb.settledSeasons = Array.from(new Set(cb.settledSeasons)).sort((a, b) => a - b);

  // Sync legacy player finances.salaryCapExceedStreak with canonical CB state
  if (career.finances) {
    const legacyStreak = career.finances.salaryCapExceedStreak ?? 0;
    const playerClub = cb.clubs[career.playerTeamId];
    if (legacyStreak > playerClub.exceedStreak && cb.settledSeasons.length === 0) {
      playerClub.exceedStreak = legacyStreak;
    }
    career.finances.salaryCapExceedStreak = playerClub.exceedStreak;
  }

  return cb;
}

/**
 * 기존 세이브와의 충돌 방지용 데이터 이전 및 무결성 검증
 * - 보존 마스터 세이브의 핵심 불변조건(현금 null, 미지급 43.3억/$1.8M, 9경기/45경기)은 절대 훼손하지 않습니다.
 */
export function migrateAndValidateCareerSave(
  career: CareerSave,
  options?: { mutateInPlace?: boolean }
): { career: CareerSave; migrated: boolean; warnings: string[] } {
  const target = options?.mutateInPlace ? career : structuredClone(career);
  const warnings: string[] = [];
  let migrated = false;

  if (!target.competitiveBalance || (target.competitiveBalance.schemaVersion ?? 0) < COMPETITIVE_BALANCE_SCHEMA_VERSION) {
    migrated = true;
  }

  // Ensure all players have valid clubTenureSeasons and numeric contracts
  for (const p of Object.values(target.players)) {
    if (p.clubTenureSeasons === undefined) {
      p.clubTenureSeasons = getPlayerClubTenureSeasons(p);
      migrated = true;
    }
    if (!Number.isFinite(p.contract.annualSalary) || p.contract.annualSalary < 0) {
      p.contract.annualSalary = 0.3;
      warnings.push(`${p.name} 계약 연봉 수치를 정상 보정했습니다.`);
      migrated = true;
    }
    if (!Number.isFinite(p.contract.signingBonus) || p.contract.signingBonus < 0) {
      p.contract.signingBonus = 0;
      migrated = true;
    }
    if (!Number.isFinite(p.contract.years) || p.contract.years < 1) {
      p.contract.years = 1;
      migrated = true;
    }
    // Enforce invariant: Sangmu military players cannot sit on 1군 active roster
    if (isMilitaryServing(p.militaryStatus) && p.rosterTier === '1군') {
      p.rosterTier = '2군';
      p.gameDayActive = false;
      const t = target.teams[p.teamId];
      if (t) {
        t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
        t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
        t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
        t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);
      }
      warnings.push(`상무 복무 중이던 ${p.name} 선수의 1군 등록 상태를 2군(상무)으로 정리했습니다.`);
      migrated = true;
    }
  }

  // Hydrate CompetitiveBalanceState safely
  ensureCompetitiveBalanceState(target);

  // Verify finances numbers (preserve cashBalanceBillion === null for preserved master save!)
  if (target.finances) {
    if (
      target.finances.cashBalanceBillion !== null &&
      !Number.isFinite(target.finances.cashBalanceBillion)
    ) {
      target.finances.cashBalanceBillion = 0;
      warnings.push('비정상 구단 현금 잔액을 0억 원으로 복구했습니다.');
      migrated = true;
    }
    if (!Number.isFinite(target.finances.krwUnpaidBillion)) {
      target.finances.krwUnpaidBillion = 0;
      migrated = true;
    }
    if (!Number.isFinite(target.finances.usdUnpaid)) {
      target.finances.usdUnpaid = 0;
      migrated = true;
    }
  }

  return { career: target, migrated, warnings };
}

// =============================================================================
// 5. ATOMIC CONTRACT & FINANCE TRANSACTION GUARD (실패 시 기존 상태 복원)
// =============================================================================

export function validateContractAndFinanceInvariants(career: CareerSave): string[] {
  const errors: string[] = [];
  if (!career.finances) {
    errors.push('구단 재정 원장이 누락되었습니다.');
    return errors;
  }
  const cash = career.finances.cashBalanceBillion;
  // 정상 운영 적자(마이너스 현금)는 적자 한도 관리로 추적하며, NaN/비정상 극단값만 무결성 위반 처리
  if (cash !== null && (!Number.isFinite(cash) || cash < -250)) {
    errors.push(`구단 보유 현금 무결성 위반 (${String(cash)}억 원)`);
  }
  if (!Number.isFinite(career.finances.krwUnpaidBillion) || career.finances.krwUnpaidBillion < -0.01) {
    errors.push('원화 미지급 의무액 무결성 위반');
  }
  if (!Number.isFinite(career.finances.usdUnpaid) || career.finances.usdUnpaid < -1) {
    errors.push('외화 미지급 의무액 무결성 위반');
  }
  if (!Number.isFinite(career.finances.seasonExpenseBillion)) {
    errors.push('시즌 지출 합계 무결성 위반');
  }
  for (const p of Object.values(career.players)) {
    if (!Number.isFinite(p.contract.annualSalary) || p.contract.annualSalary < 0) {
      errors.push(`${p.name} 연봉 데이터 오류`);
      break;
    }
    if (!Number.isFinite(p.contract.totalValue) || p.contract.totalValue < 0) {
      errors.push(`${p.name} 계약 총액 데이터 오류`);
      break;
    }
  }
  return errors;
}

/**
 * 계약 및 재정 업데이트를 원자적(Atomic)으로 실행합니다.
 * 실행 도중 예외가 발생하거나 사후 재정/계약 무결성 검증에 실패하면
 * 원본 career 상태를 전혀 변경하지 않고 예외를 발생시켜 안전하게 복원합니다.
 */
export function executeAtomicCareerMutation<T>(
  career: CareerSave,
  mutator: (draft: CareerSave) => T
): { nextCareer: CareerSave; backupSnapshot: CareerSave; result: T } {
  const backupSnapshot = structuredClone(career);
  const working = structuredClone(career);
  const result = mutator(working);

  const invariantErrors = validateContractAndFinanceInvariants(working);
  if (invariantErrors.length > 0) {
    throw new Error(
      `계약·재정 원자적 검증 실패로 기존 상태로 복원되었습니다: ${invariantErrors.join(', ')}`
    );
  }
  return { nextCareer: working, backupSnapshot, result };
}

// =============================================================================
// 6. CORE SALARY CAP & FLOOR COMPUTATION (ALL 10 CLUBS)
// =============================================================================

export function computeSalaryCapSummary(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): SalaryCapSummary {
  const season = career.season;
  const capManwon = getAnnualKboCapManwon(season);
  const capBillion = Number((capManwon / 10000).toFixed(4));
  const floorManwon = getAnnualKboFloorManwon(season);
  const floorBillion = floorManwon === null ? null : Number((floorManwon / 10000).toFixed(4));
  const floorEnabled = floorBillion !== null;

  // Read club state non-destructively (safe for pure selectors/renders)
  const existingClub = career.competitiveBalance?.clubs?.[teamId];
  const currentStreak =
    existingClub?.exceedStreak ??
    (teamId === career.playerTeamId ? career.finances?.salaryCapExceedStreak ?? 0 : 0);
  const underFloorCurrentStreak = existingClub?.underFloorStreak ?? 0;

  // Resolve designated franchise exception player (7+ club tenure seasons)
  let exceptionPlayerId = existingClub?.exceptionPlayerId ?? null;
  if (exceptionPlayerId) {
    const exP = career.players[exceptionPlayerId];
    if (
      !exP ||
      !isEligibleForTop40CompetitiveBalance(exP, teamId) ||
      getPlayerClubTenureSeasons(exP) < 7
    ) {
      exceptionPlayerId = null;
    }
  }
  // AI clubs automatically pick their highest-paid eligible 7+ year player
  if (!exceptionPlayerId && teamId !== career.playerTeamId) {
    const autoBest = getEligibleFranchiseExceptionPlayers(career, teamId)[0];
    exceptionPlayerId = autoBest?.id ?? null;
  }

  const eligibleRaw = Object.values(career.players)
    .filter((p) => isEligibleForTop40CompetitiveBalance(p, teamId))
    .map((p) => {
      const calc = computeOfficialContractCountedBillion(p);
      const tenure = getPlayerClubTenureSeasons(p);
      const isException = exceptionPlayerId === p.id && tenure >= 7;
      const discounted = isException
        ? Number((calc.countedBillion * 0.5).toFixed(4))
        : calc.countedBillion;
      const contrib: SalaryCapContributor = {
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        years: calc.years,
        rawAnnualBillion: calc.rawAnnualBillion,
        signingBonusBillion: calc.signingBonusBillion,
        optionPaidBillion: calc.optionPaidBillion,
        baseCountedBillion: calc.countedBillion,
        countedBillion: discounted,
        isException,
        clubTenureSeasons: tenure,
        formulaLabel: calc.formulaLabel,
      };
      return contrib;
    })
    // Top-40 highest counted domestic players
    .sort((a, b) => b.baseCountedBillion - a.baseCountedBillion)
    .slice(0, 40);

  const grossTop40PayrollBillion = Number(
    eligibleRaw.reduce((sum, item) => sum + item.baseCountedBillion, 0).toFixed(4)
  );
  const teamTop40PayrollBillion = Number(
    eligibleRaw.reduce((sum, item) => sum + item.countedBillion, 0).toFixed(4)
  );
  const exceptionContrib = eligibleRaw.find((x) => x.isException) ?? null;
  const franchiseExceptionSavedBillion = exceptionContrib
    ? Number((exceptionContrib.baseCountedBillion - exceptionContrib.countedBillion).toFixed(4))
    : 0;

  const overCapBillion = Number(Math.max(0, teamTop40PayrollBillion - capBillion).toFixed(4));
  const exceedCount = overCapBillion > 0 ? currentStreak + 1 : 0;
  const luxuryTaxRatePct = getProgressivePenaltyRatePct(exceedCount);
  const luxuryTaxBillion = Number(((overCapBillion * luxuryTaxRatePct) / 100).toFixed(4));
  const draftPenaltyWarning = exceedCount >= 3;

  const underFloorBillion =
    floorBillion !== null
      ? Number(Math.max(0, floorBillion - teamTop40PayrollBillion).toFixed(4))
      : 0;
  const underFloorProjectedStreak = underFloorBillion > 0 ? underFloorCurrentStreak + 1 : 0;
  const floorPenaltyRatePct =
    floorEnabled && underFloorBillion > 0
      ? getProgressivePenaltyRatePct(underFloorProjectedStreak)
      : 0;
  const floorPenaltyBillion = Number(
    ((underFloorBillion * floorPenaltyRatePct) / 100).toFixed(4)
  );
  const totalProjectedPenaltyBillion = Number((luxuryTaxBillion + floorPenaltyBillion).toFixed(4));

  return {
    season,
    capBillion,
    capManwon,
    floorEnabled,
    floorBillion,
    floorManwon,
    grossTop40PayrollBillion,
    teamTop40PayrollBillion,
    franchiseExceptionPlayerId: exceptionContrib?.playerId ?? null,
    franchiseExceptionPlayerName: exceptionContrib?.playerName ?? null,
    franchiseExceptionSavedBillion,
    overCapBillion,
    currentStreak,
    exceedCount,
    luxuryTaxRatePct,
    luxuryTaxBillion,
    draftPenaltyWarning,
    pendingDraftPenaltyForSeason: existingClub?.pendingDraftPenaltyForSeason ?? null,
    underFloorBillion,
    underFloorCurrentStreak,
    underFloorProjectedStreak,
    floorPenaltyRatePct,
    floorPenaltyBillion,
    totalProjectedPenaltyBillion,
    topContributors: eligibleRaw.slice(0, 15),
  };
}

export function computeLeagueSalaryCapTable(career: CareerSave): {
  teamId: TeamId;
  summary: SalaryCapSummary;
}[] {
  return TEAM_IDS.map((teamId) => ({
    teamId,
    summary: computeSalaryCapSummary(career, teamId),
  })).sort((a, b) => b.summary.teamTop40PayrollBillion - a.summary.teamTop40PayrollBillion);
}

/**
 * 구단의 프랜차이즈 예외 선수(7시즌 이상 소속 등록 이력 1명 · 보수 50% 제외)를 지정하거나 해제합니다.
 */
export function designateFranchiseExceptionPlayer(
  career: CareerSave,
  playerId: string | null,
  teamId: TeamId = career.playerTeamId
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (draft) => {
    const cb = ensureCompetitiveBalanceState(draft);
    const club = cb.clubs[teamId];

    if (playerId === null) {
      club.exceptionPlayerId = null;
      club.exceptionSeason = draft.season;
      draft.transactionLogs.unshift({
        id: `tx-cap-ex-clear-${Date.now()}`,
        date: getCurrentCareerDate(draft).isoDate,
        type: '재정',
        teamId,
        summary: '경쟁균형세 프랜차이즈 예외 선수 지정을 해제했습니다.',
      });
      draft.updatedAt = new Date().toISOString();
      return;
    }

    const p = draft.players[playerId];
    if (!p || !isEligibleForTop40CompetitiveBalance(p, teamId)) {
      throw new Error('현 소속 구단의 경쟁균형세 산정 대상 국내 선수만 예외 선수로 지정할 수 있습니다.');
    }
    const tenure = getPlayerClubTenureSeasons(p);
    if (tenure < 7) {
      throw new Error(
        `${p.name} 선수는 현 구단 등록 이력이 ${tenure}시즌으로, 프랜차이즈 예외 선수 자격(7시즌 이상)을 충족하지 못했습니다.`
      );
    }

    club.exceptionPlayerId = p.id;
    club.exceptionSeason = draft.season;
    const calc = computeOfficialContractCountedBillion(p);
    const saved = Number((calc.countedBillion * 0.5).toFixed(2));
    draft.transactionLogs.unshift({
      id: `tx-cap-ex-set-${Date.now()}`,
      date: getCurrentCareerDate(draft).isoDate,
      type: '재정',
      teamId,
      summary: `프랜차이즈 예외 선수 지정: ${p.name} (소속 ${tenure}시즌 · 보수 50% 제외 → ${formatBillionExactKorean(saved)} 절감)`,
      detail: `공식 산정 보수 ${formatBillionExactKorean(calc.countedBillion)} 중 50%를 ${draft.season}시즌 경쟁균형세 산정에서 제외`,
    });
    draft.updatedAt = new Date().toISOString();
  });

  return { nextCareer, backupSnapshot };
}

// =============================================================================
// 7. PRE-CONTRACT SALARY CAP PREVIEW & SEPARATE MANDATORY COMPLIANCE AUDIT
// =============================================================================

export interface ContractCapPreviewItem {
  existingPlayerId?: string;
  playerName: string;
  category: '국내' | '외국인' | '아시아쿼터';
  years: number;
  annualSalaryBillion: number;
  signingBonusBillion: number;
  optionBonusExpectedBillion?: number;
  cashRequiredNowBillion: number;
  extraCompensationBillion?: number;
  isNewIncomingPlayer?: boolean;
}

export interface ContractCapPreviewResult {
  title: string;
  itemsSummary: {
    playerName: string;
    category: '국내' | '외국인' | '아시아쿼터';
    years: number;
    totalBillion: number;
    countedAavBillion: number;
    includedInDomesticCap: boolean;
    formulaNote: string;
  }[];
  before: SalaryCapSummary;
  after: SalaryCapSummary;
  deltaPayrollBillion: number;
  deltaOverCapBillion: number;
  deltaLuxuryTaxBillion: number;
  deltaFloorPenaltyBillion: number;
  willExceedCap: boolean;
  willTriggerDraftPenalty: boolean;
  financialCheck: {
    cashRequiredBillion: number;
    currentCashBillion: number | null;
    cashAfterBillion: number | null;
    cashSufficient: boolean;
    blockingErrors: string[];
    advisoryWarnings: string[];
  };
}

/**
 * 선수 계약 확정 전 예상 샐러리캡 변동·제재금 및 별도 재정/필수 조건을 사전 검사합니다.
 * - 핵심 원칙: 상한 초과만으로는 절대 blockingErrors에 포함하거나 계약을 자동 취소하지 않습니다.
 * - 구단 현금 부족·필수 로스터 규정 위반 등 별도 필수 조건만 blockingErrors로 분리 검사합니다.
 */
export function previewContractSalaryCapImpact(
  career: CareerSave,
  params: {
    title: string;
    items: ContractCapPreviewItem[];
    extraBlockingChecks?: string[];
  }
): ContractCapPreviewResult {
  const teamId = career.playerTeamId;
  const before = computeSalaryCapSummary(career, teamId);

  const sim = structuredClone(career);
  ensureCompetitiveBalanceState(sim);

  const itemsSummary: ContractCapPreviewResult['itemsSummary'] = [];
  let totalCashRequired = 0;

  for (let i = 0; i < params.items.length; i++) {
    const it = params.items[i];
    const years = Math.max(1, Math.round(it.years));
    const totalBillion = Number((it.annualSalaryBillion * years + it.signingBonusBillion).toFixed(4));
    const optionExpected = Number((it.optionBonusExpectedBillion ?? 0).toFixed(4));
    const countedAav =
      years > 1
        ? Number(((it.annualSalaryBillion * years + it.signingBonusBillion) / years + optionExpected).toFixed(4))
        : Number((it.annualSalaryBillion + it.signingBonusBillion + optionExpected).toFixed(4));

    const includedInDomesticCap = it.category === '국내';
    totalCashRequired += it.cashRequiredNowBillion + (it.extraCompensationBillion ?? 0);

    itemsSummary.push({
      playerName: it.playerName,
      category: it.category,
      years,
      totalBillion,
      countedAavBillion: countedAav,
      includedInDomesticCap,
      formulaNote: includedInDomesticCap
        ? years > 1
          ? `다년 공식 산정: (${(it.annualSalaryBillion * years).toFixed(2)}억 + 계약금 ${it.signingBonusBillion.toFixed(2)}억) ÷ ${years}년${
              optionExpected > 0 ? ` + 옵션 ${optionExpected.toFixed(2)}억` : ''
            }`
          : `단년 산정: 연봉 ${it.annualSalaryBillion.toFixed(2)}억${
              it.signingBonusBillion > 0 ? ` + 계약금 ${it.signingBonusBillion.toFixed(2)}억` : ''
            }`
        : '외국인·아시아쿼터 별도 한도 적용 (국내 상위 40인 경쟁균형세 제외)',
    });

    if (!includedInDomesticCap) continue;

    if (it.existingPlayerId && sim.players[it.existingPlayerId]) {
      const p = sim.players[it.existingPlayerId];
      p.teamId = teamId;
      if (p.rosterTier === 'FA' || p.rosterTier === '제외후보') {
        p.rosterTier = '1군';
      }
      p.contract = {
        ...p.contract,
        status: '확정',
        currency: 'KRW',
        years,
        yearsRemaining: years,
        annualSalary: it.annualSalaryBillion,
        signingBonus: it.signingBonusBillion,
        totalValue: totalBillion,
        optionBonusPaidBillion: optionExpected,
      };
    } else {
      const tempId = `__preview_${i}_${it.playerName}`;
      sim.players[tempId] = {
        id: tempId,
        name: it.playerName,
        teamId,
        category: '국내',
        role: '타자',
        position: 'DH',
        age: 28,
        ability: 80,
        potential: 80,
        abilityStatus: '확정',
        form: 0,
        fatigue: 0,
        lastPitchedRound: 0,
        consecutiveAppearances: 0,
        rosterTier: '1군',
        gameDayActive: true,
        clubTenureSeasons: 1,
        serviceYears: 5,
        seasonRatingDelta: 0,
        lastEvaluatedAtTeamGames: 0,
        morale: '만족',
        trainingFocus: null,
        injury: null,
        contract: {
          status: '확정',
          currency: 'KRW',
          years,
          yearsRemaining: years,
          annualSalary: it.annualSalaryBillion,
          signingBonus: it.signingBonusBillion,
          totalValue: totalBillion,
          optionBonusPaidBillion: optionExpected,
        },
        stats: {
          G: 0, PA: 0, AB: 0, H: 0, B2: 0, B3: 0, HR: 0,
          BB: 0, HBP: 0, SF: 0, SO: 0, R: 0, RBI: 0, SB: 0, TB: 0,
        },
        postseasonStats: {
          G: 0, PA: 0, AB: 0, H: 0, B2: 0, B3: 0, HR: 0,
          BB: 0, HBP: 0, SF: 0, SO: 0, R: 0, RBI: 0, SB: 0, TB: 0,
        },
      };
    }
  }

  const after = computeSalaryCapSummary(sim, teamId);
  const deltaPayrollBillion = Number((after.teamTop40PayrollBillion - before.teamTop40PayrollBillion).toFixed(4));
  const deltaOverCapBillion = Number((after.overCapBillion - before.overCapBillion).toFixed(4));
  const deltaLuxuryTaxBillion = Number((after.luxuryTaxBillion - before.luxuryTaxBillion).toFixed(4));
  const deltaFloorPenaltyBillion = Number((after.floorPenaltyBillion - before.floorPenaltyBillion).toFixed(4));

  const currentCashBillion = career.finances.cashBalanceBillion;
  const cashRequiredBillion = Number(totalCashRequired.toFixed(2));
  const cashSufficient =
    currentCashBillion === null ? true : currentCashBillion + 1e-6 >= cashRequiredBillion;
  const cashAfterBillion =
    currentCashBillion === null
      ? null
      : Number((currentCashBillion - cashRequiredBillion).toFixed(2));

  const blockingErrors: string[] = [...(params.extraBlockingChecks ?? [])];
  if (!cashSufficient && currentCashBillion !== null) {
    blockingErrors.push(
      `보유 현금(${currentCashBillion.toFixed(2)}억 원)이 필요 즉시 집행액(${cashRequiredBillion.toFixed(2)}억 원)보다 부족합니다.`
    );
  }

  const advisoryWarnings: string[] = [];
  if (after.overCapBillion > 0) {
    advisoryWarnings.push(
      `계약 후 상위 40인 연봉이 ${career.season}년 상한액(${formatManwonKorean(after.capManwon)})을 ${formatBillionExactKorean(after.overCapBillion)} 초과합니다. 시즌 종료 기준 ${after.exceedCount}회 연속 초과(${after.luxuryTaxRatePct}%) 적용 시 예상 제재금은 ${formatBillionExactKorean(after.luxuryTaxBillion)}입니다. (상한 초과만으로 계약이 취소되지 않으며 단장 승인 시 체결됩니다.)`
    );
  }
  if (after.draftPenaltyWarning) {
    advisoryWarnings.push(
      `3년 연속 상한 초과 경고: 시즌 종료 시 초과 확정되면 ${career.season + 1}년 신인 드래프트 1라운드 지명순위가 9단계 하락합니다.`
    );
  }
  if (after.floorEnabled && after.underFloorBillion > 0 && after.floorManwon !== null) {
    advisoryWarnings.push(
      `2027+ 하한액(${formatManwonKorean(after.floorManwon)}) 대비 ${formatBillionExactKorean(after.underFloorBillion)} 미달 상태입니다 (예상 미달 제재금 ${formatBillionExactKorean(after.floorPenaltyBillion)}).`
    );
  }

  return {
    title: params.title,
    itemsSummary,
    before,
    after,
    deltaPayrollBillion,
    deltaOverCapBillion,
    deltaLuxuryTaxBillion,
    deltaFloorPenaltyBillion,
    willExceedCap: after.overCapBillion > 0,
    willTriggerDraftPenalty: after.draftPenaltyWarning,
    financialCheck: {
      cashRequiredBillion,
      currentCashBillion,
      cashAfterBillion,
      cashSufficient,
      blockingErrors,
      advisoryWarnings,
    },
  };
}

// =============================================================================
// 8. SEASON-END OFFICIAL SETTLEMENT (ALL 10 CLUBS · ONCE-ONLY DEDUCTION)
// =============================================================================

export interface SeasonSettlementResult {
  alreadySettled: boolean;
  season: number;
  records: ClubSalaryCapSeasonRecord[];
  userRecord: ClubSalaryCapSeasonRecord;
}

/**
 * 시즌 종료 후 전체 10개 구단의 공식 산정 대상 보수로 경쟁균형세(상한 초과 & 2027+ 하한 미달)를 최종 확정합니다.
 * - settledSeasons에 기록되어 동일 시즌 중복 정산 및 제재금 중복 차감을 원천 차단합니다.
 * - 상한 이내 구단은 연속 초과 횟수를 0으로 초기화합니다.
 * - 3년 연속 초과 구단은 차기 연도 신인 드래프트 1라운드 9단계 하락 예약을 기록합니다.
 */
export function settleSeasonCompetitiveBalance(
  career: CareerSave,
  targetSeason: number = career.season,
  settledAtDate: string = getCurrentCareerDate(career).isoDate
): SeasonSettlementResult {
  const cb = ensureCompetitiveBalanceState(career);

  if (cb.settledSeasons.includes(targetSeason)) {
    const existingRecords = cb.seasonHistory.filter((r) => r.season === targetSeason);
    const userRec =
      existingRecords.find((r) => r.teamId === career.playerTeamId) ?? existingRecords[0];
    return {
      alreadySettled: true,
      season: targetSeason,
      records: existingRecords,
      userRecord: userRec,
    };
  }

  const savedSeason = career.season;
  // Temporarily align season for exact cap/floor table lookup if called right before season increment
  career.season = targetSeason;

  const records: ClubSalaryCapSeasonRecord[] = [];
  const overCapHeadlines: string[] = [];
  const underFloorHeadlines: string[] = [];

  for (const tid of TEAM_IDS) {
    const club = cb.clubs[tid];
    // For AI clubs, auto-pick best 7+ year exception player before final audit
    if (tid !== career.playerTeamId) {
      const bestEx = getEligibleFranchiseExceptionPlayers(career, tid)[0];
      club.exceptionPlayerId = bestEx?.id ?? null;
      club.exceptionSeason = targetSeason;
    }

    const summary = computeSalaryCapSummary(career, tid);
    let nextExceedStreak = 0;
    let luxuryTaxRatePct = 0;
    let luxuryTaxBillion = 0;
    let draftPenaltyTriggered = false;
    let draftPenaltyTargetSeason: number | null = null;

    if (summary.overCapBillion > 0) {
      nextExceedStreak = club.exceedStreak + 1;
      luxuryTaxRatePct = getProgressivePenaltyRatePct(nextExceedStreak);
      luxuryTaxBillion = Number(((summary.overCapBillion * luxuryTaxRatePct) / 100).toFixed(4));
      club.exceedStreak = nextExceedStreak;
      club.totalTaxPaidBillion = Number((club.totalTaxPaidBillion + luxuryTaxBillion).toFixed(4));

      if (nextExceedStreak >= 3) {
        draftPenaltyTriggered = true;
        const nextDraftSeason = targetSeason + 1;
        draftPenaltyTargetSeason = nextDraftSeason;
        if (!club.appliedDraftPenaltySeasons.includes(nextDraftSeason)) {
          club.pendingDraftPenaltyForSeason = nextDraftSeason;
        }
      }
      overCapHeadlines.push(
        `${KBO_TEAMS[tid].shortName}(+${formatBillionExactKorean(summary.overCapBillion)} · ${nextExceedStreak}년차 ${luxuryTaxRatePct}% → ${formatBillionExactKorean(luxuryTaxBillion)}${draftPenaltyTriggered ? ' + 1R 9단계 하락' : ''})`
      );
    } else {
      // 초과하지 않은 시즌: 연속 초과 횟수 초기화
      club.exceedStreak = 0;
    }

    // 2027+ 하한액 미달 제재
    let nextUnderFloorStreak = 0;
    let floorPenaltyRatePct = 0;
    let floorPenaltyBillion = 0;

    if (summary.floorEnabled && summary.underFloorBillion > 0) {
      nextUnderFloorStreak = club.underFloorStreak + 1;
      floorPenaltyRatePct = getProgressivePenaltyRatePct(nextUnderFloorStreak);
      floorPenaltyBillion = Number(((summary.underFloorBillion * floorPenaltyRatePct) / 100).toFixed(4));
      club.underFloorStreak = nextUnderFloorStreak;
      club.totalFloorPenaltyPaidBillion = Number(
        (club.totalFloorPenaltyPaidBillion + floorPenaltyBillion).toFixed(4)
      );
      underFloorHeadlines.push(
        `${KBO_TEAMS[tid].shortName}(하한 미달 -${formatBillionExactKorean(summary.underFloorBillion)} · ${nextUnderFloorStreak}년차 ${floorPenaltyRatePct}% → ${formatBillionExactKorean(floorPenaltyBillion)})`
      );
    } else {
      club.underFloorStreak = 0;
    }

    const totalPenaltyBillion = Number((luxuryTaxBillion + floorPenaltyBillion).toFixed(4));
    let deductedFromCash = false;

    if (tid === career.playerTeamId) {
      career.finances.salaryCapExceedStreak = club.exceedStreak;
      if (totalPenaltyBillion > 0) {
        const roundedPenalty = Number(totalPenaltyBillion.toFixed(2));
        if (career.finances.cashBalanceBillion !== null) {
          career.finances.cashBalanceBillion = Number(
            (career.finances.cashBalanceBillion - roundedPenalty).toFixed(2)
          );
          deductedFromCash = true;
        }
        career.finances.luxuryTaxPaidBillion = Number(
          ((career.finances.luxuryTaxPaidBillion ?? 0) + roundedPenalty).toFixed(2)
        );
        career.finances.seasonExpenseBillion = Number(
          ((career.finances.seasonExpenseBillion ?? 0) + roundedPenalty).toFixed(2)
        );
        career.transactionLogs.unshift({
          id: `tx-cb-settle-${targetSeason}-${tid}`,
          date: settledAtDate,
          type: '재정',
          teamId: tid,
          summary: `[${targetSeason} 경쟁균형세 확정] 제재금 ${formatBillionExactKorean(totalPenaltyBillion)} 1회 정산`,
          detail:
            luxuryTaxBillion > 0
              ? `상한(${formatManwonKorean(summary.capManwon)}) 초과 ${formatBillionExactKorean(summary.overCapBillion)} · ${nextExceedStreak}년 연속(${luxuryTaxRatePct}%)${
                  draftPenaltyTriggered ? ` · ${targetSeason + 1} 신인 드래프트 1R 9단계 하락` : ''
                }`
              : `하한(${formatManwonKorean(summary.floorManwon ?? 0)}) 미달 ${formatBillionExactKorean(summary.underFloorBillion)} · ${nextUnderFloorStreak}년 연속(${floorPenaltyRatePct}%)`,
        });
      }
    }

    const record: ClubSalaryCapSeasonRecord = {
      season: targetSeason,
      teamId: tid,
      capBillion: summary.capBillion,
      capManwon: summary.capManwon,
      floorBillion: summary.floorBillion,
      floorManwon: summary.floorManwon,
      grossTop40PayrollBillion: summary.grossTop40PayrollBillion,
      top40PayrollBillion: summary.teamTop40PayrollBillion,
      franchiseExceptionPlayerId: summary.franchiseExceptionPlayerId,
      franchiseExceptionPlayerName: summary.franchiseExceptionPlayerName,
      franchiseExceptionSavedBillion: summary.franchiseExceptionSavedBillion,
      overCapBillion: summary.overCapBillion,
      exceedStreakAfter: club.exceedStreak,
      luxuryTaxRatePct,
      luxuryTaxBillion,
      draftPenaltyTriggered,
      draftPenaltyTargetSeason,
      draftPenaltyApplied: false,
      underFloorBillion: summary.underFloorBillion,
      underFloorStreakAfter: club.underFloorStreak,
      floorPenaltyRatePct,
      floorPenaltyBillion,
      totalPenaltyBillion,
      deductedFromCash,
      settledAtDate,
    };

    records.push(record);
    cb.seasonHistory.push(record);
  }

  cb.settledSeasons.push(targetSeason);
  career.season = savedSeason;

  // League-wide Competitive Balance official announcement news
  if (!career.newsFeed) career.newsFeed = [];
  const capLabel = formatManwonKorean(getAnnualKboCapManwon(targetSeason));
  const floorManwon = getAnnualKboFloorManwon(targetSeason);
  const floorLabel = floorManwon !== null ? ` · 하한액 ${formatManwonKorean(floorManwon)}` : '';
  const bodyParts: string[] = [];
  if (overCapHeadlines.length > 0) {
    bodyParts.push(`상한 초과 구단: ${overCapHeadlines.join(', ')}`);
  } else {
    bodyParts.push('전 구단이 상한액 이내로 시즌을 마쳐 초과 제재 대상 구단이 없습니다.');
  }
  if (underFloorHeadlines.length > 0) {
    bodyParts.push(`하한 미달 제재 구단: ${underFloorHeadlines.join(', ')}`);
  }

  career.newsFeed.unshift({
    id: `news-cb-settle-${targetSeason}`,
    date: settledAtDate,
    season: targetSeason,
    category: '규정·웨이버',
    headline: `[${targetSeason} KBO 경쟁균형세 최종 확정] 상한 ${capLabel}${floorLabel} · 제재 구단 ${overCapHeadlines.length + underFloorHeadlines.length}곳`,
    body: bodyParts.join(' / '),
    teamId: career.playerTeamId,
    isHighlight: overCapHeadlines.length > 0 || underFloorHeadlines.length > 0,
  });

  const userRecord = records.find((r) => r.teamId === career.playerTeamId) ?? records[0];
  return {
    alreadySettled: false,
    season: targetSeason,
    records,
    userRecord,
  };
}

// =============================================================================
// 9. NON-DUPLICATE ROUND 1 DRAFT PENALTY APPLICATION (3년 연속 초과 → 1R 9단계 하락)
// =============================================================================

export function getDraftPickingTeamForSlot(
  ds: DraftState,
  round: number,
  pickInRound: number
): TeamId {
  const activeOrder =
    round === 1 && ds.round1DraftOrder && ds.round1DraftOrder.length === 10
      ? ds.round1DraftOrder
      : ds.draftOrder;
  const originalTeam = activeOrder[pickInRound - 1] ?? ds.draftOrder[pickInRound - 1];
  const tradedSlot = (ds.pickProvenance ?? []).find(
    (p) => p.round === round && p.originalTeamId === originalTeam
  );
  return tradedSlot?.ownerTeamId ?? originalTeam;
}

/**
 * 3년 이상 연속 경쟁균형세 초과 구단의 차기 연도 신인 드래프트 1라운드 지명순위를 9단계 하락 처리합니다.
 * - appliedDraftPenaltySeasons로 동일 드래프트 시즌 중복 적용을 원천 차단합니다.
 * - 1라운드 순서(round1DraftOrder)만 조정하며 2~11라운드는 정상 역순(draftOrder)을 유지합니다.
 */
export function applyCompetitiveBalanceDraftPenalties(
  career: CareerSave,
  draftSeason: number,
  baseReverseOrder: TeamId[]
): {
  round1Order: TeamId[];
  baseOrder: TeamId[];
  penaltyNotes: { teamId: TeamId; fromPick: number; toPick: number; reason: string }[];
} {
  const cb = ensureCompetitiveBalanceState(career);
  const baseOrder = [...baseReverseOrder];
  const round1Order = [...baseReverseOrder];
  const penaltyNotes: { teamId: TeamId; fromPick: number; toPick: number; reason: string }[] = [];

  const penalizedTeams = TEAM_IDS.filter((tid) => {
    const club = cb.clubs[tid];
    return (
      club.pendingDraftPenaltyForSeason === draftSeason &&
      !club.appliedDraftPenaltySeasons.includes(draftSeason)
    );
  });

  // Sort by original slot index ascending so multiple penalized teams shift deterministically
  penalizedTeams.sort((a, b) => baseOrder.indexOf(a) - baseOrder.indexOf(b));

  for (const tid of penalizedTeams) {
    const currentIdx = round1Order.indexOf(tid);
    if (currentIdx === -1) continue;
    const fromPick = baseOrder.indexOf(tid) + 1;
    const targetIdx = Math.min(round1Order.length - 1, currentIdx + 9);
    round1Order.splice(currentIdx, 1);
    round1Order.splice(targetIdx, 0, tid);
    const toPick = round1Order.indexOf(tid) + 1;

    const club = cb.clubs[tid];
    club.appliedDraftPenaltySeasons.push(draftSeason);
    club.pendingDraftPenaltyForSeason = null;

    // Mark matching seasonHistory record as applied
    for (const rec of cb.seasonHistory) {
      if (rec.teamId === tid && rec.draftPenaltyTargetSeason === draftSeason) {
        rec.draftPenaltyApplied = true;
      }
    }

    penaltyNotes.push({
      teamId: tid,
      fromPick,
      toPick,
      reason: `경쟁균형세 3년 연속 초과 제재 (${fromPick}순위 → ${toPick}순위 · 9단계 하락)`,
    });
  }

  return { round1Order, baseOrder, penaltyNotes };
}
