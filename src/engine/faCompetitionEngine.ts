import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, MLB_CLUBS, TEAM_IDS } from '../data/kboTeams';
import {
  BatterStats,
  CareerSave,
  FaClubBid,
  FaCompetitionState,
  FaMarketNegotiation,
  MlbOverseasFaOffer,
  PitcherStats,
  Player,
  TeamId,
} from '../types/kbo';
import { recordMlbExportPlayer } from './franchiseSystems';
import {
  getKboFaCompensationRuleForSeason,
  resolveFaProtectionAndCompensationSelection,
} from './faCompensationEngine';
import { evaluateFranchiseStar } from './franchiseStarEngine';
import { recordLeagueAcquisitionInPlace } from './leagueAcquisitionsEngine';
import { appendPlayerTeamHistoryInPlace } from './leagueLifeEngine';
import { resolveRecordOps } from './ratingEvaluationEngine';
import { SeededRng } from './rng';
import { getAnnualKboCapBillion, getCurrentCareerDate } from './salaryCapEngine';
import { calcAVG, calcERA, calcOPS, computeStandings } from './stats';

/**
 * 현실적 FA 최대 계약 기간 산출 (고령 일반 선수는 장기계약 제한, 초특급 프랜차이즈 스타는 6~10년 장기계약 허용)
 */
export function getMaxRealisticFaYears(
  age: number,
  ability = 75,
  options?: { isMegaFranchise?: boolean; franchiseScore?: number; potential?: number }
): number {
  const isMega =
    Boolean(options?.isMegaFranchise) ||
    ((options?.franchiseScore ?? 0) >= 75 &&
      (ability >= 86 || (ability >= 80 && (options?.potential ?? ability) >= 86 && age <= 28)));

  if (isMega && age <= 34) {
    if (age <= 27) return 10;
    if (age <= 29) return 9;
    if (age <= 31) return 8;
    if (age <= 33) return 7;
    return 5;
  }

  if (age >= 38) return ability >= 84 ? 2 : 1;
  if (age >= 36) return ability >= 76 ? 2 : 1;
  if (age >= 34) return ability >= 82 ? 3 : 2;
  if (age >= 32) return ability >= 80 ? 4 : 3;
  if (age >= 30) return ability >= 82 ? 5 : 4;
  return ability >= 83 ? 6 : 5;
}

export interface FaContractBreakdown {
  years: number;
  totalBillion: number;
  signingBonusBillion: number;
  annualSalaryBillion: number;
  optionTotalBillion: number;
  guaranteedTotalBillion: number;
  totalManwon: number;
  totalKrwWon: number;
}

/**
 * 억원 · 만원 · 원 단위 변환 오차 0을 보장하는 FA 계약금·연봉·옵션·총액 정밀 계산기
 * - 내부 산술을 1만원 정수 단위로 처리하여 (계약금 + 연봉×기간 + 옵션 === 총액) 항등식 보장
 * - 1억 원 = 10,000만 원 = 100,000,000원
 */
export function calculateExactFaContractBreakdown(
  totalBillionInput: number,
  yearsInput: number,
  options?: { age?: number; injuryHistoryCount?: number; season?: number }
): FaContractBreakdown {
  const years = Math.max(1, Math.min(10, Math.round(yearsInput || 1)));
  const minAnnualManwon = (options?.season ?? 2027) >= 2027 ? 3300 : 3000; // 최저연봉 3,300만 원
  const rawTotalManwon = Math.round((Number.isFinite(totalBillionInput) ? totalBillionInput : 0) * 10000);
  const totalManwon = Math.max(minAnnualManwon * years, rawTotalManwon);

  const age = options?.age ?? 30;
  const injCount = options?.injuryHistoryCount ?? 0;

  // 고령 또는 부상 이력이 많은 선수는 인센티브(옵션) 비중 확대
  const optionRatio = clamp(
    (years === 1 ? 0.08 : 0.10) + (age >= 35 ? 0.05 : 0) + (injCount >= 2 ? 0.04 : 0),
    0.05,
    0.22
  );
  const signingBonusRatio =
    years === 1 ? 0.0 : years === 2 ? 0.28 : 0.34;

  // 만원 단위를 100만 원(0.01억) 단위로 깔끔하게 정렬하되 총합 항등식을 100% 보존
  const roundTo100Man = (v: number) => Math.round(v / 100) * 100;
  let optionTotalManwon = totalManwon >= minAnnualManwon * years + 1000 ? roundTo100Man(totalManwon * optionRatio) : 0;
  let signingBonusManwon =
    years > 1 && totalManwon >= minAnnualManwon * years + 2000
      ? roundTo100Man(totalManwon * signingBonusRatio)
      : 0;

  // 연봉이 최저연봉 미만으로 떨어지지 않도록 상한 보정
  const maxNonSalary = Math.max(0, totalManwon - minAnnualManwon * years);
  if (signingBonusManwon + optionTotalManwon > maxNonSalary) {
    const scale = maxNonSalary / Math.max(1, signingBonusManwon + optionTotalManwon);
    signingBonusManwon = roundTo100Man(signingBonusManwon * scale);
    optionTotalManwon = Math.max(0, maxNonSalary - signingBonusManwon);
  }

  const salaryPoolManwon = totalManwon - signingBonusManwon - optionTotalManwon;
  const annualSalaryManwon = Math.max(minAnnualManwon, Math.floor(salaryPoolManwon / years));
  const salaryTotalManwon = annualSalaryManwon * years;
  const remainderManwon = totalManwon - (signingBonusManwon + salaryTotalManwon + optionTotalManwon);

  // 잔여 1~years 만원은 계약금(다년) 또는 옵션(단년)에 흡수해 합계 100% 일치
  if (remainderManwon !== 0) {
    if (years > 1) {
      signingBonusManwon = Math.max(0, signingBonusManwon + remainderManwon);
    } else {
      optionTotalManwon = Math.max(0, optionTotalManwon + remainderManwon);
    }
  }

  const guaranteedTotalManwon = signingBonusManwon + salaryTotalManwon;
  const finalTotalManwon = guaranteedTotalManwon + optionTotalManwon;

  return {
    years,
    totalBillion: Number((finalTotalManwon / 10000).toFixed(4)),
    signingBonusBillion: Number((signingBonusManwon / 10000).toFixed(4)),
    annualSalaryBillion: Number((annualSalaryManwon / 10000).toFixed(4)),
    optionTotalBillion: Number((optionTotalManwon / 10000).toFixed(4)),
    guaranteedTotalBillion: Number((guaranteedTotalManwon / 10000).toFixed(4)),
    totalManwon: finalTotalManwon,
    totalKrwWon: finalTotalManwon * 10000,
  };
}

function parseHistoricalIp(ipVal: unknown): number {
  if (typeof ipVal === 'number') return Number.isFinite(ipVal) ? ipVal : 0;
  if (typeof ipVal !== 'string') return 0;
  const s = ipVal.trim();
  const frac = s.match(/^(\d+)\s+(\d)\/3$/);
  if (frac) return Number(frac[1]) + Number(frac[2]) / 3;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 최근 3년간 실제 성적(historicalSeasons + 당해 p.stats) 기반 WAR 및 퍼포먼스 지수 산출
 */
function estimateRecent3YrPerformanceAndWar(p: Player): {
  estimatedWar: number;
  recent3YrScore: number;
  sampleSeasons: number;
} {
  const posWarAdj: Record<string, number> = {
    C: 0.55,
    SS: 0.45,
    CF: 0.25,
    '2B': 0.15,
    '3B': 0.1,
    RF: -0.1,
    LF: -0.2,
    '1B': -0.35,
    DH: -0.65,
  };

  const weights = [0.5, 0.32, 0.18]; // 최근 시즌 가중치 높게
  const seasonWars: number[] = [];
  const seasonScores: number[] = [];

  // 1) 진행 중/방금 끝난 현재 시즌 live stats 반영 (충분한 표본 시 최우선 가중)
  if (p.role === '타자') {
    const bs = p.stats as BatterStats;
    if ((bs?.PA ?? 0) >= 80) {
      const rawOps = calcOPS(bs);
      const ops = typeof rawOps === 'number' && Number.isFinite(rawOps) ? rawOps : 0.72;
      const paFactor = clamp((bs.PA ?? 0) / 500, 0.25, 1.15);
      const war = clamp(((ops - 0.67) * 14.5 + (posWarAdj[p.position] ?? 0)) * paFactor, -0.8, 8.2);
      const sc = clamp(52 + (ops - 0.62) * 98 + (bs.HR ?? 0) * 0.22, 46, 95);
      if (Number.isFinite(war) && Number.isFinite(sc)) {
        seasonWars.push(war);
        seasonScores.push(sc);
      }
    }
  } else {
    const ps = p.stats as PitcherStats;
    const ip = (ps?.outs ?? 0) / 3;
    if (ip >= 25) {
      const rawEra = calcERA(ps.ER, ps.outs);
      const era = typeof rawEra === 'number' && Number.isFinite(rawEra) ? rawEra : 4.3;
      const isSp = p.position === 'SP' || p.pitchRole === '선발';
      const workload = isSp ? clamp(ip / 155, 0.3, 1.25) : clamp(ip / 60, 0.35, 1.15);
      const war = isSp
        ? clamp((4.75 - era) * 1.95 * workload + 1.2 * workload, -0.6, 7.8)
        : clamp((4.45 - era) * 1.15 * workload + ((ps.SV ?? 0) * 0.045 + (ps.HLD ?? 0) * 0.03), -0.5, 4.6);
      const sc = clamp(76 + (3.8 - era) * 7.8 + (isSp ? (ip - 110) * 0.05 : ((ps.SV ?? 0) + (ps.HLD ?? 0)) * 0.18), 46, 95);
      if (Number.isFinite(war) && Number.isFinite(sc)) {
        seasonWars.push(war);
        seasonScores.push(sc);
      }
    }
  }

  // 2) 최근 3개년 historicalSeasons 성적 반영
  const hist = [...(p.historicalSeasons ?? [])].sort((a, b) => (b.season ?? 0) - (a.season ?? 0)).slice(0, 3);
  for (const h of hist) {
    if (seasonWars.length >= 3) break;
    if (p.role === '타자') {
      const pa = Number(h.PA ?? h.AB ?? 0);
      if (!Number.isFinite(pa) || pa < 50) continue;
      const rawAvg = Number(h.AVG ?? (Number(h.AB ?? 0) > 0 ? Number(h.H ?? 0) / Number(h.AB) : 0.24));
      const avg = Number.isFinite(rawAvg) ? rawAvg : 0.24;
      const rawOps = resolveRecordOps(h) ?? Number(h.OPS ?? (avg * 2.55 + 0.08));
      const ops = Number.isFinite(rawOps) ? rawOps : 0.72;
      const hr = Number.isFinite(Number(h.HR ?? 0)) ? Number(h.HR ?? 0) : 0;
      const paFactor = clamp(pa / 500, 0.25, 1.15);
      const war = clamp(((ops - 0.67) * 14.2 + (posWarAdj[p.position] ?? 0)) * paFactor, -0.8, 8.2);
      const sc = clamp(52 + (ops - 0.62) * 95 + hr * 0.2, 46, 95);
      if (Number.isFinite(war) && Number.isFinite(sc)) {
        seasonWars.push(war);
        seasonScores.push(sc);
      }
    } else {
      const ip = parseHistoricalIp(h.IP);
      if (!Number.isFinite(ip) || ip < 18) continue;
      const rawEra = Number(h.ERA ?? 4.4);
      const era = Number.isFinite(rawEra) ? rawEra : 4.4;
      const sv = Number.isFinite(Number(h.SV ?? 0)) ? Number(h.SV ?? 0) : 0;
      const hld = Number.isFinite(Number(h.HLD ?? 0)) ? Number(h.HLD ?? 0) : 0;
      const isSp = p.position === 'SP' || p.pitchRole === '선발' || ip >= 85;
      const workload = isSp ? clamp(ip / 155, 0.3, 1.25) : clamp(ip / 60, 0.35, 1.15);
      const war = isSp
        ? clamp((4.75 - era) * 1.9 * workload + 1.15 * workload, -0.6, 7.8)
        : clamp((4.45 - era) * 1.12 * workload + sv * 0.045 + hld * 0.03, -0.5, 4.6);
      const sc = clamp(76 + (3.8 - era) * 7.6 + (isSp ? (ip - 110) * 0.05 : (sv + hld) * 0.16), 46, 95);
      if (Number.isFinite(war) && Number.isFinite(sc)) {
        seasonWars.push(war);
        seasonScores.push(sc);
      }
    }
  }

  if (seasonWars.length === 0) {
    const fallbackScore =
      typeof p.recent3YrScore === 'number' && Number.isFinite(p.recent3YrScore)
        ? p.recent3YrScore
        : p.ability;
    const fallbackWar = clamp((fallbackScore - 64) * 0.22, -0.2, 6.2);
    return {
      estimatedWar: Number(fallbackWar.toFixed(2)),
      recent3YrScore: Number(fallbackScore.toFixed(1)),
      sampleSeasons: 0,
    };
  }

  let wSum = 0;
  let warSum = 0;
  let scSum = 0;
  for (let i = 0; i < seasonWars.length; i++) {
    const w = weights[i] ?? 0.15;
    wSum += w;
    warSum += seasonWars[i] * w;
    scSum += seasonScores[i] * w;
  }

  return {
    estimatedWar: Number((warSum / wSum).toFixed(2)),
    recent3YrScore: Number((scSum / wSum).toFixed(1)),
    sampleSeasons: seasonWars.length,
  };
}

function getPositionScarcityMultiplier(p: Player): number {
  if (p.role === '투수') {
    if (p.position === 'SP' || p.pitchRole === '선발') return 1.10;
    if (p.position === 'CL' || p.pitchRole === '마무리') return 1.04;
    if (p.pitchRole === '필승조') return 0.98;
    return 0.91;
  }
  switch (p.position) {
    case 'C':
      return 1.14;
    case 'SS':
      return 1.11;
    case 'CF':
      return 1.06;
    case '2B':
    case '3B':
      return 1.0;
    case 'RF':
    case 'LF':
      return 0.97;
    case '1B':
      return 0.91;
    case 'DH':
      return 0.85;
    default:
      return 0.96;
  }
}

export interface RealisticFaValuation {
  grade: 'A' | 'B' | 'C';
  protectionLimit: number;
  cashCompBillion: number;
  fairYears: number;
  maxRealisticYears: number;
  fairTotalBillion: number;
  baseTotalBillion: number;
  tierLabel: '초특급 프랜차이즈' | '정상급 특급' | '핵심 주전' | '일반 주전' | '베테랑' | '백업·유틸';
  isMegaFranchise: boolean;
  franchiseScore: number;
  estimatedWar: number;
  recent3YrScore: number;
  positionScarcityMult: number;
  injuryMod: number;
  marketDemandMult: number;
  competingClubCount: number;
  unclaimedRounds: number;
  breakdown: FaContractBreakdown;
  valuationSummary: string;
}

/** KBO 공식 구단당 단일 시즌 외부 FA 영입 상한 (원소속팀 재계약은 미포함) */
export const MAX_EXTERNAL_FA_PER_CLUB = 2;

function cloneCareer(career: CareerSave): CareerSave {
  return JSON.parse(JSON.stringify(career)) as CareerSave;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * FA 등급(보상 규정용) + 현실적 FA 시장가치 정밀 산출
 * - 등급만으로 계약액을 결정하지 않고 최근 3년 성적, WAR, OVR, 나이, 포지션 희소성, 부상 이력, 경쟁 구단 수, 미계약 경과를 종합 반영
 */
export function evaluateFaGradeAndComp(
  career: CareerSave,
  p: Player
): RealisticFaValuation {
  const grade: 'A' | 'B' | 'C' =
    p.contract.faGrade ??
    (p.age >= 35
      ? 'C'
      : p.ability >= 82 || p.contract.annualSalary >= 5.0
      ? 'A'
      : p.ability >= 76 || p.contract.annualSalary >= 2.5
      ? 'B'
      : 'C');
  const minSal = career.season >= 2027 ? 0.33 : 0.3;
  const prevSal = Math.max(minSal, p.previousAnnualSalary ?? p.contract.annualSalary ?? 1.0);
  const protectionLimit = grade === 'A' ? 20 : grade === 'B' ? 25 : 0;
  const cashCompBillion = Number(
    (grade === 'A' ? prevSal * 2.0 : grade === 'B' ? prevSal * 1.0 : prevSal * 1.5).toFixed(2)
  );

  // 1) 최근 3년 성적, WAR, 구단 프랜차이즈 기여도 평가 (특정 선수 하드코딩 없이 범용 공식 적용)
  const perf = estimateRecent3YrPerformanceAndWar(p);
  const franchiseAssessment = evaluateFranchiseStar(career, p);
  const franchiseScore = franchiseAssessment.score;
  const warIndex = clamp(50 + perf.estimatedWar * 8.4, 42, 96);
  const compositeScore = p.ability * 0.48 + perf.recent3YrScore * 0.30 + warIndex * 0.22;

  // 2) 포지션 희소성 · 부상 이력 · 연령 곡선
  const positionScarcityMult = getPositionScarcityMultiplier(p);
  const injCount = p.injuryHistoryCount ?? 0;
  const injuryMod = clamp(
    1 -
      Math.min(0.18, injCount * 0.04) -
      (p.injury ? 0.08 : 0) -
      (p.hiddenTrait === '유리몸' ? 0.1 : 0) +
      (p.hiddenTrait === '철강왕' ? 0.05 : 0),
    0.72,
    1.05
  );
  const ageMult =
    p.age >= 39
      ? 0.30
      : p.age >= 38
      ? 0.36
      : p.age >= 36
      ? 0.50
      : p.age >= 34
      ? 0.69
      : p.age >= 32
      ? 0.87
      : p.age >= 30
      ? 1.0
      : 1.06;

  // 3) 선수 티어 분류 (초특급 프랜차이즈 / 정상급 특급 / 핵심 주전 / 일반 주전 / 베테랑 / 백업·유틸)
  // - 초특급 프랜차이즈: 리그 최정상급 기량 + 프랜차이즈 상징성/기여도 또는 전성기(28세 이하) 토종 에이스/간판 스타
  const isPrimeAceStarter =
    p.role === '투수' &&
    (p.position === 'SP' || p.pitchRole === '선발') &&
    p.age <= 28 &&
    p.ability >= 80 &&
    p.potential >= 86;
  const isMegaFranchise =
    p.age <= 34 &&
    ((p.ability >= 86 && franchiseScore >= 68 && p.age <= 33) ||
      (p.ability >= 88 && p.age <= 31) ||
      (isPrimeAceStarter && franchiseScore >= 72) ||
      (compositeScore >= 84 && franchiseScore >= 82 && p.age <= 33) ||
      (p.age <= 27 && p.ability >= 80 && p.potential >= 87 && franchiseScore >= 85));

  let tierLabel: RealisticFaValuation['tierLabel'];
  if (isMegaFranchise) {
    tierLabel = '초특급 프랜차이즈';
  } else if ((compositeScore >= 83.0 && perf.estimatedWar >= 3.2 && p.age <= 34) || (p.ability >= 85 && p.age <= 33)) {
    tierLabel = '정상급 특급';
  } else if (compositeScore >= 76.5 && p.age <= 35) {
    tierLabel = '핵심 주전';
  } else if (p.age >= 35 && compositeScore >= 69.5) {
    tierLabel = '베테랑';
  } else if (compositeScore >= 70.5) {
    tierLabel = '일반 주전';
  } else {
    tierLabel = '백업·유틸';
  }

  // 4) 현실적 계약 기간 (초특급 프랜차이즈 6~10년 장기계약 가능 · 고령 일반 선수는 장기 제한 유지)
  const maxRealisticYears = getMaxRealisticFaYears(p.age, p.ability, {
    isMegaFranchise,
    franchiseScore,
    potential: p.potential,
  });
  const rawFairYears =
    tierLabel === '초특급 프랜차이즈'
      ? p.age <= 25
        ? 9
        : p.age <= 27
        ? 8
        : p.age <= 29
        ? 7
        : p.age <= 33
        ? 6
        : 5
      : tierLabel === '정상급 특급'
      ? p.age <= 28
        ? 6
        : p.age <= 31
        ? 5
        : p.age <= 33
        ? 4
        : 3
      : tierLabel === '핵심 주전'
      ? p.age <= 31
        ? 4
        : 3
      : tierLabel === '일반 주전'
      ? p.age <= 32
        ? 3
        : 2
      : tierLabel === '베테랑'
      ? p.age >= 37
        ? 1
        : 2
      : p.age >= 34
      ? 1
      : 2;
  const fairYears = clamp(rawFairYears, 1, maxRealisticYears);

  // 5) 연속형 연평균 적정가(AAV, 억원) — 일반 FA 몸값은 유지하고 초특급 프랜차이즈만 KBO 현실 초대형 곡선 반영
  let adjustedAnnual: number;
  if (isMegaFranchise) {
    // 초특급 프랜차이즈 전용 연속 가치 모델 (기량 + 잠재력 + 성적/WAR + 프랜차이즈 기여도 + 에이스/포지션 희소성 + 나이 + 초장기 분산 효과)
    const skillSignal = p.ability * 0.56 + p.potential * 0.22 + compositeScore * 0.22;
    const baseMegaAav = 16.5 + Math.max(0, skillSignal - 80) * 0.90;
    const franchiseContributionMult = 1 + clamp((franchiseScore - 60) / 180, 0.0, 0.22);
    const megaAgeMult =
      p.age <= 25
        ? 1.07
        : p.age <= 27
        ? 1.04
        : p.age <= 29
        ? 1.01
        : p.age <= 31
        ? 0.96
        : p.age <= 33
        ? 0.90
        : 0.82;
    // 8~10년 초장기 보장 계약은 총액이 커지는 대신 연평균(AAV)이 완만히 분산되는 현실 계약 곡선 반영
    const termAavSmooth =
      fairYears >= 9 ? 0.81 : fairYears === 8 ? 0.86 : fairYears === 7 ? 0.93 : 1.0;
    const aceStarterScarcityBonus = isPrimeAceStarter ? 1.12 : 1.0;
    const warMegaAdj = clamp((perf.estimatedWar - 2.5) * 0.65, -0.8, 2.8);
    adjustedAnnual = Math.max(
      16.5,
      (baseMegaAav + warMegaAdj) *
        franchiseContributionMult *
        megaAgeMult *
        positionScarcityMult *
        aceStarterScarcityBonus *
        termAavSmooth *
        injuryMod
    );
  } else {
    let baseAnnual: number;
    if (compositeScore >= 86) {
      baseAnnual = 18.5 + (compositeScore - 86) * 1.45;
    } else if (compositeScore >= 82) {
      baseAnnual = 12.2 + (compositeScore - 82) * 1.55;
    } else if (compositeScore >= 77) {
      baseAnnual = 6.8 + (compositeScore - 77) * 1.08;
    } else if (compositeScore >= 72) {
      baseAnnual = 3.2 + (compositeScore - 72) * 0.72;
    } else if (compositeScore >= 66) {
      baseAnnual = 1.4 + (compositeScore - 66) * 0.30;
    } else {
      baseAnnual = Math.max(minSal + 0.25, 0.75 + Math.max(0, compositeScore - 58) * 0.08);
    }
    const warBonusAnnual = clamp((perf.estimatedWar - 1.5) * 0.75, -1.5, 4.2);
    adjustedAnnual = Math.max(
      minSal + 0.15,
      (baseAnnual + warBonusAnnual) * ageMult * positionScarcityMult * injuryMod
    );
  }

  // 획일적 총액 상한선 제거: 고령 일반 선수·백업만 비현실적 폭등 방지, 초특급/정상급은 선수 가치·시장 경쟁에 따라 200억+ 역대 최고액 자연 허용
  const elderlyOrBackupCap: number | null =
    !isMegaFranchise && p.age >= 38
      ? p.ability >= 84
        ? 26
        : 10
      : !isMegaFranchise && p.age >= 36
      ? p.ability >= 82
        ? 34
        : 16
      : !isMegaFranchise && p.age >= 34
      ? p.ability >= 83
        ? 60
        : 30
      : tierLabel === '백업·유틸'
      ? 12
      : null;

  const rawBaseTotal = Math.max(Math.max(0.6, minSal * fairYears), adjustedAnnual * fairYears);
  const baseTotalBillion = Number(
    (elderlyOrBackupCap !== null ? Math.min(rawBaseTotal, elderlyOrBackupCap) : rawBaseTotal).toFixed(1)
  );

  // 6) 실시간 시장 수요(경쟁 구단 수 상승) 및 장기 미계약(라운드 경과 시 점진적 하락) 반영
  const neg =
    career.faCompetition?.season === career.season
      ? career.faCompetition.negotiations[p.id]
      : undefined;
  const competingClubCount = neg
    ? neg.bids.length + (neg.mlbStatus === 'MLB제안접수' && neg.mlbOffer ? 1 : 0)
    : 0;
  const unclaimedRounds = neg && neg.status === '입찰중' ? Math.max(0, neg.roundCount) : 0;

  const competitionBoost =
    competingClubCount >= 6
      ? isMegaFranchise
        ? 0.14
        : 0.17
      : competingClubCount >= 4
      ? isMegaFranchise
        ? 0.10
        : 0.14
      : competingClubCount === 3
      ? isMegaFranchise
        ? 0.06
        : 0.09
      : competingClubCount === 2
      ? isMegaFranchise
        ? 0.03
        : 0.04
      : 0;
  const unclaimedDecay =
    unclaimedRounds >= 5
      ? competingClubCount <= 1
        ? 0.24
        : 0.14
      : unclaimedRounds === 4
      ? competingClubCount <= 1
        ? 0.18
        : 0.10
      : unclaimedRounds === 3
      ? competingClubCount <= 1
        ? 0.12
        : 0.06
      : unclaimedRounds === 2
      ? competingClubCount <= 1
        ? 0.06
        : 0.03
      : 0;
  const marketDemandMult = Number(clamp(1 + competitionBoost - unclaimedDecay, 0.74, 1.26).toFixed(3));

  const rawFairTotal = Math.max(Math.max(0.5, minSal * fairYears), baseTotalBillion * marketDemandMult);
  const fairTotalBillion = Number(
    (elderlyOrBackupCap !== null ? Math.min(rawFairTotal, elderlyOrBackupCap * 1.1) : rawFairTotal).toFixed(1)
  );

  const breakdown = calculateExactFaContractBreakdown(fairTotalBillion, fairYears, {
    age: p.age,
    injuryHistoryCount: injCount,
    season: career.season,
  });

  const marketNote =
    competitionBoost > unclaimedDecay
      ? `경쟁 ${competingClubCount}구단(+${Math.round((marketDemandMult - 1) * 100)}%)`
      : unclaimedDecay > competitionBoost
      ? `미계약 ${unclaimedRounds}R(${Math.round((marketDemandMult - 1) * 100)}%)`
      : '시장 표준가';
  const franTag = isMegaFranchise ? ` · 프랜차이즈지수 ${franchiseScore}` : '';
  const valuationSummary = `${tierLabel}${franTag} · 3년WAR ${perf.estimatedWar.toFixed(1)} · 포지션×${positionScarcityMult.toFixed(2)} · 부상×${injuryMod.toFixed(2)} · ${marketNote}`;

  return {
    grade,
    protectionLimit,
    cashCompBillion,
    fairYears,
    maxRealisticYears,
    fairTotalBillion: Number(breakdown.totalBillion.toFixed(1)),
    baseTotalBillion,
    tierLabel,
    isMegaFranchise,
    franchiseScore,
    estimatedWar: perf.estimatedWar,
    recent3YrScore: perf.recent3YrScore,
    positionScarcityMult,
    injuryMod,
    marketDemandMult,
    competingClubCount,
    unclaimedRounds,
    breakdown,
    valuationSummary,
  };
}

/**
 * 구단별 포지션 전력 보강 필요도 (0..100) 및 예상 출전 기회 점수 산출
 */
function computeClubPositionalNeed(career: CareerSave, teamId: TeamId, target: Player): number {
  const roster = Object.values(career.players).filter(
    (p) =>
      p.teamId === teamId &&
      p.id !== target.id &&
      (p.rosterTier === '1군' || p.rosterTier === '2군') &&
      !isMilitaryServing(p.militaryStatus)
  );

  if (target.role === '투수') {
    const sameRole = roster
      .filter((p) => p.role === '투수' && (target.pitchRole === '선발' ? p.pitchRole === '선발' : p.pitchRole !== '선발'))
      .sort((a, b) => b.ability - a.ability);
    const benchmark = target.pitchRole === '선발' ? sameRole[3]?.ability ?? 68 : sameRole[4]?.ability ?? 68;
    return clamp(55 + (target.ability - benchmark) * 3.8, 15, 98);
  }

  const samePos = roster
    .filter((p) => p.role === '타자' && (p.position === target.position || (target.position === 'DH' && p.position === '1B')))
    .sort((a, b) => b.ability - a.ability);
  const incumbent = samePos[0]?.ability ?? 66;
  return clamp(56 + (target.ability - incumbent) * 4.2, 15, 98);
}

/**
 * 구단별 우승 경쟁력 점수 (0..100) 및 재정 여력 계수 (0.68..1.25)
 * - 인위적 균등 분배 없이 구단별 실제 성적·예산·성향에 따라 자연스럽게 분산
 */
function getClubMarketProfile(
  career: CareerSave,
  teamId: TeamId,
  rankByTeam: Map<TeamId, number>
): {
  contentionScore: number;
  budgetCapacityBillion: number;
  maxAnnualBillion: number;
  aggressiveness: number;
  payrollBillion: number;
  capHeadroomBillion: number;
  consecutiveExceedYears: number;
} {
  const rank = rankByTeam.get(teamId) ?? 5;
  const teamMeta = KBO_TEAMS[teamId];
  // KBO 경쟁균형세 기준 상위 40인 보수 총액(억 원) 산출
  const top40Salaries = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === teamId &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        p.rosterTier !== 'FA' &&
        !isMilitaryServing(p.militaryStatus)
    )
    .map((p) =>
      p.contract.currency === 'USD'
        ? ((p.contract.annualSalary + (p.contract.signingBonus ?? 0)) * 1350) / 100_000_000
        : (p.contract.annualSalary || 0) +
          ((p.contract.years ?? 1) > 1
            ? (p.contract.signingBonus ?? 0) / Math.max(1, p.contract.years)
            : p.contract.signingBonus ?? 0)
    )
    .sort((a, b) => b - a)
    .slice(0, 40);
  const payrollBillion = top40Salaries.reduce((s, v) => s + v, 0);

  const softCap = getAnnualKboCapBillion(career.season);
  const capHeadroomBillion = Number((softCap - payrollBillion).toFixed(2));
  const consecutiveExceedYears =
    career.competitiveBalance?.clubs?.[teamId]?.exceedStreak ?? 0;
  const marketMult = teamMeta.ticketDemandMultiplier ?? 1.0;

  // 구단별 재정 여력 + 샐러리캡 여유 + 3년 연속 초과(1R -9단계 제재) 회피 보정
  const seedJitter = ((hashStr(`${career.season}-${teamId}`) % 17) - 8) / 100; // -0.08..+0.08
  const contentionScore = clamp(96 - (rank - 1) * 7.5 + (marketMult - 1) * 10, 30, 96);

  // 캡 여유에 비례한 연간 투입 가능액(억) 산정 — 캡 초과 구단은 외부 초대형 계약을 강력히 자제
  let maxAnnualBillion: number;
  if (consecutiveExceedYears >= 2 && capHeadroomBillion <= 5) {
    // 2년 연속 초과 상태면 3년차 제재(100% + 1R -9단계) 회피 위해 극도로 보수적
    maxAnnualBillion = Math.max(2.0, capHeadroomBillion * 0.85);
  } else if (capHeadroomBillion <= 0) {
    // 이미 캡 초과: 소규모 보강·원소속 잔류 위주 (대형 시장 우승권만 소폭 추가 허용)
    maxAnnualBillion = rank <= 3 && marketMult >= 1.05 ? 9.5 : 5.5;
  } else {
    // 캡 여유가 있는 구단: 남은 캡 여유 + 시장 규모에 비례한 현실적 연간 지출 한도
    maxAnnualBillion = capHeadroomBillion * 0.92 + (marketMult >= 1.08 ? 5.0 : marketMult >= 0.98 ? 2.5 : 0.8);
  }
  maxAnnualBillion = Number(clamp(maxAnnualBillion, 2.0, 42.0).toFixed(1));

  // 초대형 프랜차이즈 장기계약(6~10년, 200억+)도 재정·캡 여유 구단이 자연스럽게 입찰할 수 있도록 획일적 125억 상한 제거
  const budgetCapacityBillion = Number(
    clamp(maxAnnualBillion * (rank <= 5 ? 7.2 : 5.8), 6.0, 340.0).toFixed(1)
  );

  // 중상위권(3~6위)이 승부수를 던지고, 캡 초과·리빌딩 구단은 보수적
  const capAggroFactor =
    consecutiveExceedYears >= 2
      ? 0.72
      : capHeadroomBillion <= 0
      ? 0.78
      : capHeadroomBillion >= 25
      ? 1.06
      : 0.98;
  const rankAggro = rank <= 2 ? 1.01 : rank <= 6 ? 1.06 : 0.88;
  const aggressiveness = clamp(
    rankAggro * capAggroFactor * (0.94 + (marketMult - 0.95) * 0.3) + seedJitter,
    0.68,
    1.18
  );

  return {
    contentionScore,
    budgetCapacityBillion,
    maxAnnualBillion,
    aggressiveness,
    payrollBillion: Number(payrollBillion.toFixed(1)),
    capHeadroomBillion,
    consecutiveExceedYears,
  };
}

/**
 * 선수의 입찰 구단 선택 평가점수 계산
 * 고려 요소: 계약 총액, 연평균(AAV), 계약 기간, 출전 기회(포지션 필요도), 우승 가능성, 원소속 구단 친숙도
 */
export function scoreBidForPlayer(
  career: CareerSave,
  p: Player,
  bid: Omit<FaClubBid, 'score' | 'note'>,
  rankByTeam: Map<TeamId, number>
): { score: number; note: string } {
  const { fairTotalBillion, fairYears, isMegaFranchise, franchiseScore } =
    evaluateFaGradeAndComp(career, p);
  const need = computeClubPositionalNeed(career, bid.teamId, p);
  const clubProfile = getClubMarketProfile(career, bid.teamId, rankByTeam);

  const moneyRatio = bid.totalBillion / Math.max(1, fairTotalBillion);
  const aavRatio = bid.annualBillion / Math.max(0.5, fairTotalBillion / Math.max(1, fairYears));
  const moneyScore = clamp(moneyRatio * 54 + aavRatio * 15, 12, 114);
  const yearsFit = isMegaFranchise
    ? bid.years >= 7
      ? 13
      : bid.years >= 6
      ? 11
      : bid.years >= 5
      ? 8
      : bid.years >= 4
      ? 3
      : -5
    : p.age >= 34
    ? bid.years >= 2
      ? 8
      : 3
    : bid.years >= 4
    ? 10
    : bid.years === 3
    ? 7
    : 4;
  const playTimeScore = (need / 100) * 14;
  const contentionBonus =
    (p.age >= 32 ? 0.14 : 0.09) * clubProfile.contentionScore;
  // 핵심 프랜차이즈 스타는 원소속 구단 친숙도·상징성 가산이 높아, 타 구단은 더 좋은 조건을 제시해야 영입 가능
  const originalBonus = bid.isOriginalClub
    ? isMegaFranchise
      ? franchiseScore >= 85
        ? 9.0
        : 7.5
      : 5.5
    : 0;

  const totalScore = Number(
    (moneyScore + yearsFit + playTimeScore + contentionBonus + originalBonus).toFixed(2)
  );

  const reasons: string[] = [];
  if (moneyRatio >= 1.05) reasons.push(isMegaFranchise ? '역대급 최고 대우' : '최고 대우');
  if (isMegaFranchise && bid.years >= 6) reasons.push('초장기 보장');
  if (need >= 75) reasons.push('확실한 주전 기회');
  if (clubProfile.contentionScore >= 75) reasons.push('우승 전력');
  if (bid.isOriginalClub) reasons.push(isMegaFranchise ? '원소속 프랜차이즈 예우' : '원소속 친숙도');

  return {
    score: totalScore,
    note: reasons.length > 0 ? reasons.join(' · ') : '조건 검토',
  };
}

export function getTeamExternalFaSigningCount(career: CareerSave, teamId: TeamId): number {
  const state = career.faCompetition;
  if (!state || state.season !== career.season) return 0;
  return state.externalSigningsByTeam[teamId] ?? 0;
}

/**
 * 전체 10개 구단 대상 FA 시장 대상 선수 목록 조회
 */
export function getAllMarketFaPlayers(career: CareerSave): Player[] {
  return Object.values(career.players)
    .filter((p) => {
      if (p.category !== '국내') return false;
      if (isMilitaryServing(p.militaryStatus)) return false;
      if (p.signedAsFaSeason === career.season) return false;
      // 실제 FA 신분(rosterTier === 'FA' 또는 contract.status === 'FA')만 시장 대상 — 계약 유지 중인 현역 1·2군 선수 오인 방지
      if (p.rosterTier === 'FA' || p.contract.status === 'FA') return true;
      return (
        career.phase === 'OFFSEASON' &&
        (p.rosterTier === '1군' || p.rosterTier === '2군') &&
        p.contract.yearsRemaining <= 0 &&
        Boolean(p.contract.isFAEligible)
      );
    })
    .sort((a, b) => (b.rosterTier === 'FA' ? 1 : 0) - (a.rosterTier === 'FA' ? 1 : 0) || b.ability - a.ability);
}

/**
 * 해외 FA 자격 여부 판정 (구단 승인 없이 MLB 구단과 직접 계약 협상 가능)
 * - 포스팅(7시즌 이상 · 구단 승인 필수)과 구분되는 해외 FA 경로
 */
export function isOverseasFaEligible(p: Player): boolean {
  if (p.category !== '국내') return false;
  if (isMilitaryServing(p.militaryStatus)) return false;
  if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') return false;
  return p.serviceYears >= 8 && (p.rosterTier === 'FA' || Boolean(p.contract.isFAEligible));
}

/**
 * MLB 구단 스카우트용 최근 성적 평가 보정 (능력치 + 나이 + 최근 성적 3요소 반영)
 */
export function evaluatePlayerRecentMlbStats(p: Player): { delta: number; summary: string } {
  if (p.role === '타자') {
    const bs = p.stats as BatterStats;
    const pa = bs.PA ?? 0;
    if (pa < 120) return { delta: 0, summary: '능력치·경력 중심 평가' };
    const ops = calcOPS(bs) ?? 0.76;
    const avg = calcAVG(bs.H, bs.AB) ?? 0.27;
    const hr = bs.HR ?? 0;
    if (ops >= 0.93 || (ops >= 0.87 && hr >= 25)) {
      return { delta: 4, summary: `최근 성적 최상위(OPS ${ops.toFixed(3)}, ${hr}HR)` };
    }
    if (ops >= 0.84 || avg >= 0.31) {
      return { delta: 2, summary: `최근 성적 우수(OPS ${ops.toFixed(3)})` };
    }
    if (ops < 0.74) {
      return { delta: -5, summary: `최근 성적 부진(OPS ${ops.toFixed(3)})` };
    }
    return { delta: 0, summary: `최근 성적 보통(OPS ${ops.toFixed(3)})` };
  }
  const ps = p.stats as PitcherStats;
  const outs = ps.outs ?? 0;
  if (outs < 120) return { delta: 0, summary: '능력치·경력 중심 평가' };
  const era = calcERA(ps.ER, outs) ?? 3.85;
  const w = ps.W ?? 0;
  const sv = ps.SV ?? 0;
  if (era <= 2.7 || (era <= 3.1 && (w >= 13 || sv >= 30))) {
    return { delta: 4, summary: `최근 성적 최상위(ERA ${era.toFixed(2)})` };
  }
  if (era <= 3.35) {
    return { delta: 2, summary: `최근 성적 우수(ERA ${era.toFixed(2)})` };
  }
  if (era >= 4.45) {
    return { delta: -5, summary: `최근 성적 부진(ERA ${era.toFixed(2)})` };
  }
  return { delta: 0, summary: `최근 성적 보통(ERA ${era.toFixed(2)})` };
}

/**
 * 해외 FA 선수에 대한 MLB 구단 오퍼 평가 (최상위권 선수 위주로 엄격하게 발생)
 */
export function evaluateOverseasFaMlbOffer(
  career: CareerSave,
  p: Player,
  dateStr: string,
  rng: SeededRng
): MlbOverseasFaOffer | null {
  if (!isOverseasFaEligible(p)) return null;
  // 나이 상한: 만 34세 이상은 MLB 해외 FA 다년/메이저 보장 계약 극도로 어려움
  if (p.age >= 34) return null;

  const recent = evaluatePlayerRecentMlbStats(p);
  const agePenalty = p.age <= 29 ? 2 : p.age <= 31 ? 0 : p.age === 32 ? -3 : -6;
  const effectiveScore = p.ability + recent.delta + agePenalty;

  // MLB 진출 장벽 높게 유지: 최소 능력치 82 이상 & 종합 평가 85 이상 최상위권 위주
  if (p.ability < 82 || effectiveScore < 85) return null;

  const offerProb =
    effectiveScore >= 90
      ? 0.92
      : effectiveScore >= 88
      ? 0.78
      : effectiveScore >= 86
      ? 0.56
      : 0.34;
  if (rng.next() > offerProb) return null;

  const mlbTeam = MLB_CLUBS[rng.int(0, MLB_CLUBS.length - 1)];
  const ageMult = p.age <= 28 ? 1.15 : p.age <= 30 ? 1.0 : p.age <= 31 ? 0.82 : 0.62;
  const rawUsd =
    effectiveScore >= 90
      ? 48 + (effectiveScore - 90) * 10 + rng.int(4, 22)
      : effectiveScore >= 87
      ? 24 + (effectiveScore - 87) * 7 + rng.int(2, 12)
      : 10 + (effectiveScore - 85) * 4 + rng.int(1, 6);
  const guaranteedUsdMillions = Math.max(6, Math.min(105, Math.round(rawUsd * ageMult)));
  const years =
    p.age >= 32
      ? rng.int(1, 2)
      : guaranteedUsdMillions >= 52
      ? rng.int(4, 5)
      : guaranteedUsdMillions >= 22
      ? rng.int(3, 4)
      : rng.int(2, 3);
  // $1M ≈ 13.5억 원
  const krwEquivalentBillion = Number((guaranteedUsdMillions * 13.5).toFixed(1));

  const { fairTotalBillion } = evaluateFaGradeAndComp(career, p);
  // KBO FA 점수와 직접 비교 가능한 선수 관점 MLB 평가 점수 산출
  // (단기·소규모 MLB 보장액은 초대형 KBO FA 제안에 밀릴 수 있고, 빅리그 대형 계약은 MLB가 우세)
  const moneyRatio = Math.min(2.0, krwEquivalentBillion / Math.max(15, fairTotalBillion * 1.55));
  const desireBonus =
    p.overseasInterest === '적극희망' ? 11 : p.overseasInterest === '관심' ? 5 : -6;
  const mlbPrestige = guaranteedUsdMillions >= 30 ? 12 : guaranteedUsdMillions >= 16 ? 7 : 3;
  const yearsFit = years >= 4 ? 10 : years === 3 ? 7 : 4;
  const score = Number(
    clamp(moneyRatio * 56 + yearsFit + mlbPrestige + desireBonus, 40, 122).toFixed(2)
  );

  return {
    mlbTeam,
    years,
    guaranteedUsdMillions,
    krwEquivalentBillion,
    score,
    evaluationNote: `능력치 ${p.ability} · 만 ${p.age}세 · ${recent.summary}`,
    submittedDate: dateStr,
  };
}

/**
 * 해외 FA 선수의 MLB 직접 계약 최종 확정 (구단 승인 불필요 · 기존 해외 추적 시스템 즉시 반영)
 */
function finalizeOverseasFaMlbSigningInPlace(
  career: CareerSave,
  neg: FaMarketNegotiation,
  p: Player,
  offer: MlbOverseasFaOffer,
  dateStr: string
): void {
  if (p.signedAsFaSeason === career.season || neg.status === '계약완료') return;

  const fromTeamId = neg.formerTeamId ?? p.formerTeamId ?? p.teamId;
  if (career.teams[fromTeamId]) {
    career.teams[fromTeamId].lineupOrder = career.teams[fromTeamId].lineupOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].benchOrder = career.teams[fromTeamId].benchOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].rotationOrder = career.teams[fromTeamId].rotationOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].bullpenOrder = career.teams[fromTeamId].bullpenOrder.filter((id) => id !== p.id);
  }

  p.formerTeamId = fromTeamId;
  p.rosterTier = '해외이적';
  p.gameDayActive = false;
  p.signedAsFaSeason = career.season;
  p.contract = {
    ...p.contract,
    status: '확정',
    currency: 'USD',
    years: offer.years,
    yearsRemaining: offer.years,
    annualSalary: Number((offer.guaranteedUsdMillions / Math.max(1, offer.years)).toFixed(2)),
    totalValue: offer.guaranteedUsdMillions,
    startSeason: career.season,
    endSeason: career.season + offer.years - 1,
    isFAEligible: false,
    note: `${career.season} 해외 FA MLB 진출 (${offer.mlbTeam} ${offer.years}년 $${offer.guaranteedUsdMillions}M)`,
  };

  neg.status = '계약완료';
  neg.mlbStatus = 'MLB진출확정';
  neg.signedMlbTeam = offer.mlbTeam;
  neg.signedMlbUsdMillions = offer.guaranteedUsdMillions;
  neg.signedYears = offer.years;
  neg.closedDate = dateStr;
  neg.pendingWinnerTeamId = undefined;

  // 기존 MLB/해외파 추적 시스템(mlbExports + player.teamHistory + amateurAndOverseas.overseasPlayers)에 반영
  recordMlbExportPlayer(
    career,
    p,
    offer.mlbTeam,
    offer.years,
    offer.guaranteedUsdMillions,
    dateStr,
    '해외FA'
  );

  const fromShort = KBO_TEAMS[fromTeamId].shortName;
  if (!career.newsFeed) career.newsFeed = [];
  career.newsFeed.unshift({
    id: `news-mlb-ofa-${career.season}-${p.id}`,
    season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
    date: dateStr,
    category: 'MLB소식',
    headline: `[해외 FA MLB 진출 확정] 전 ${fromShort} ${p.name}, ${offer.mlbTeam}과 ${offer.years}년 $${offer.guaranteedUsdMillions}M 계약!`,
    body: `해외 FA 자격을 얻은 ${p.name}(${p.position}, ${p.age}세) 선수가 구단 승인 없이 KBO와 MLB 제안을 직접 비교한 끝에 ${offer.mlbTeam} 입단을 확정 지었습니다. (${offer.evaluationNote})`,
    teamId: fromTeamId,
    isHighlight: true,
  });

  if (fromTeamId === career.playerTeamId) {
    career.transactionLogs.unshift({
      id: `tx-mlb-ofa-${career.season}-${p.id}`,
      date: dateStr,
      type: '포스팅',
      teamId: fromTeamId,
      summary: `[해외 FA MLB 이적] ${p.name} → ${offer.mlbTeam} (${offer.years}년 $${offer.guaranteedUsdMillions}M)`,
      detail: '해외 FA 자격으로 구단 승인 없이 MLB 구단과 직접 계약 체결 (이적료 없음)',
    });
  }
}

/**
 * FA 경쟁 상태 초기화 및 전체 10개 구단 + 해외 FA MLB 자동 평가·입찰 동기화 (기존 세이브 호환)
 */
export function syncFaCompetitionMarketInPlace(
  career: CareerSave,
  dateStr = getCurrentCareerDate(career).isoDate
): FaCompetitionState {
  if (!career.faCompetition || career.faCompetition.season !== career.season) {
    career.faCompetition = {
      season: career.season,
      round: 1,
      externalSigningsByTeam: {},
      negotiations: {},
      autoBidForUserClub: career.faCompetition?.autoBidForUserClub ?? true,
    };
  }
  const state = career.faCompetition;
  if (state.autoBidForUserClub === undefined) {
    state.autoBidForUserClub = true;
  }
  const standings = computeStandings(career.gamesLedger);
  const rankByTeam = new Map<TeamId, number>();
  standings.forEach((row, idx) => rankByTeam.set(row.teamId, idx + 1));

  const faPlayers = getAllMarketFaPlayers(career);
  const rng = new SeededRng((career.season * 9973 + state.round * 131 + 77) >>> 0);

  for (const p of faPlayers) {
    const formerTeamId = p.formerTeamId ?? p.teamId;
    const comp = evaluateFaGradeAndComp(career, p);
    const overseasEligible = isOverseasFaEligible(p);

    let neg = state.negotiations[p.id];
    if (!neg) {
      neg = {
        playerId: p.id,
        playerName: p.name,
        formerTeamId,
        faGrade: comp.grade,
        status: '입찰중',
        bids: [],
        roundCount: 0,
        mlbOverseasFaEligible: overseasEligible,
        mlbStatus: '미제안',
      };
      state.negotiations[p.id] = neg;
    } else if (neg.mlbOverseasFaEligible === undefined) {
      neg.mlbOverseasFaEligible = overseasEligible;
    }

    if (neg.status === '계약완료' || p.signedAsFaSeason === career.season) {
      neg.status = '계약완료';
      continue;
    }

    // 전체 10개 구단(AI 9개 구단 상시 + 사용자 구단 자동입찰 ON 시)이 모든 FA 선수를 평가하고 예산·필요도·능력치 기반 자동 입찰
    evaluateAiClubBidsForPlayerInPlace(career, state, neg, p, rankByTeam, dateStr, rng);

    // 해외 FA 자격 선수(사용자·AI 구단 동일 적용): 최상위권 위주 MLB 직접 제안 평가
    if (
      overseasEligible &&
      neg.mlbStatus !== 'MLB협상결렬' &&
      neg.mlbStatus !== 'MLB진출확정' &&
      !neg.mlbOffer
    ) {
      const mlbRng = new SeededRng((career.season * 44111 + hashStr(p.id) + state.round * 19) >>> 0);
      const mlbOffer = evaluateOverseasFaMlbOffer(career, p, dateStr, mlbRng);
      if (mlbOffer) {
        neg.mlbOffer = mlbOffer;
        neg.mlbStatus = 'MLB제안접수';
      }
    }
  }

  // 2차 보정 패스: 입찰 참여가 0건인 구단이나 미입찰 FA가 남지 않도록 전 구단 현실적 수요 기반 자동 입찰 보강
  ensureBroadClubFaParticipationInPlace(career, state, faPlayers, rankByTeam, dateStr, rng);

  return state;
}

function buildClubAutoBidOffer(
  career: CareerSave,
  p: Player,
  tid: TeamId,
  isOriginalClub: boolean,
  need: number,
  clubProfile: ReturnType<typeof getClubMarketProfile>,
  comp: ReturnType<typeof evaluateFaGradeAndComp>,
  rankByTeam: Map<TeamId, number>,
  dateStr: string,
  rng: SeededRng,
  valueDiscount = 1.0
): FaClubBid | null {
  const isUserClub = tid === career.playerTeamId;
  const isMega = comp.isMegaFranchise;
  const needMult = isMega
    ? 0.96 + (need / 100) * 0.14 // 초특급 프랜차이즈는 포지션 여유와 무관하게 리그 구단들이 적극 평가
    : 0.88 + (need / 100) * 0.22; // 0.91 ~ 1.10
  // 초특급 프랜차이즈: 원소속 구단은 적극적 잔류 투자(1.03), 타 구단은 이적 유인을 위한 프리미엄(1.09) 제시
  const origMult = isMega
    ? isOriginalClub
      ? 1.03
      : 1.09
    : isOriginalClub
    ? 0.97
    : 1.03;
  const maxYears = getMaxRealisticFaYears(p.age, p.ability, {
    isMegaFranchise: comp.isMegaFranchise,
    franchiseScore: comp.franchiseScore,
    potential: p.potential,
  });
  const offerYears = clamp(
    isMega
      ? comp.fairYears + (!isOriginalClub && need >= 62 && p.age <= 31 ? 1 : isOriginalClub && p.age <= 29 && rng.next() < 0.45 ? 1 : 0)
      : valueDiscount < 0.92
      ? Math.min(2, comp.fairYears)
      : comp.fairYears + (need >= 80 && p.age <= 31 ? 1 : 0) - (p.age >= 35 ? 1 : 0),
    1,
    maxYears
  );

  // 초특급 프랜차이즈 잔류/영입 시 구단의 프랜차이즈 특별 투자 한도 반영 (일반 FA는 기존 캡·예산 엄격 유지)
  const capCeilingTotal = isMega
    ? Number(
        Math.max(
          isOriginalClub ? comp.fairTotalBillion * 1.16 : comp.fairTotalBillion * 1.06,
          Math.min(
            clubProfile.budgetCapacityBillion * (isOriginalClub ? 1.45 : 1.28),
            clubProfile.maxAnnualBillion * offerYears * (isOriginalClub ? 1.48 : 1.24)
          )
        ).toFixed(1)
      )
    : Number(
        Math.min(
          clubProfile.budgetCapacityBillion,
          clubProfile.maxAnnualBillion * offerYears * (isOriginalClub ? 1.18 : 1.02)
        ).toFixed(1)
      );

  const maxWilling = Number(
    Math.min(
      capCeilingTotal,
      comp.fairTotalBillion *
        (isMega ? Math.max(0.96, valueDiscount) : valueDiscount) *
        needMult *
        origMult *
        (isMega ? Math.max(0.95, clubProfile.aggressiveness) : clubProfile.aggressiveness) *
        (isMega ? 0.98 + rng.next() * 0.14 : 0.94 + rng.next() * 0.14)
    ).toFixed(1)
  );
  const minFloor = Number((Math.max(0.33, career.season >= 2027 ? 0.33 : 0.3) * offerYears).toFixed(1));
  const targetStart = isMega
    ? comp.fairTotalBillion * (isOriginalClub ? 0.97 + rng.next() * 0.11 : 1.01 + rng.next() * 0.14)
    : comp.fairTotalBillion * valueDiscount * (0.9 + rng.next() * 0.14);
  let offerTotal = Number(Math.max(minFloor, Math.min(maxWilling, targetStart)).toFixed(1));

  // 정상급·초특급 선수에게 구단이 비현실적 저가 오퍼를 던지지 않도록 최소 입찰선 강제
  if (isMega && offerTotal < comp.fairTotalBillion * (isOriginalClub ? 0.9 : 0.95)) {
    return null;
  }

  // 사용자 구단 자동 입찰은 실제 보유 현금(계약금+C등급 보상금) 한도를 엄격히 준수
  if (isUserClub && career.finances.cashBalanceBillion !== null) {
    const preview = calculateExactFaContractBreakdown(offerTotal, offerYears, {
      age: p.age,
      injuryHistoryCount: p.injuryHistoryCount,
      season: career.season,
    });
    const cComp = !isOriginalClub && comp.grade === 'C' ? comp.cashCompBillion : 0;
    const reqCash = preview.signingBonusBillion + cComp;
    if (reqCash > career.finances.cashBalanceBillion * 0.85) {
      const scaled = Number(
        Math.max(minFloor, (career.finances.cashBalanceBillion * 0.8 - cComp) * 2.1).toFixed(1)
      );
      if (scaled < comp.fairTotalBillion * (isMega ? 0.9 : 0.72)) return null;
      offerTotal = Math.min(offerTotal, scaled);
    }
  }

  const annualBillion = Number((offerTotal / offerYears).toFixed(2));
  const scored = scoreBidForPlayer(
    career,
    p,
    { teamId: tid, years: offerYears, totalBillion: offerTotal, annualBillion, isOriginalClub, submittedDate: dateStr },
    rankByTeam
  );
  return {
    teamId: tid,
    years: offerYears,
    totalBillion: offerTotal,
    annualBillion,
    isOriginalClub,
    submittedDate: dateStr,
    score: scored.score,
    note: scored.note,
    isAutoBid: true,
  };
}

function evaluateAiClubBidsForPlayerInPlace(
  career: CareerSave,
  state: FaCompetitionState,
  neg: FaMarketNegotiation,
  p: Player,
  rankByTeam: Map<TeamId, number>,
  dateStr: string,
  rng: SeededRng
): void {
  const comp = evaluateFaGradeAndComp(career, p);
  const isMega = comp.isMegaFranchise;
  const existingTopTotal = neg.bids.reduce((m, b) => Math.max(m, b.totalBillion), 0);
  const userAutoEnabled = state.autoBidForUserClub !== false;

  for (const tid of TEAM_IDS) {
    const isUserClub = tid === career.playerTeamId;
    if (isUserClub && !userAutoEnabled) continue;
    // 사용자 구단에 미제출 보호명단이 남아있으면 외부 FA 추가 자동 입찰 보류 (원소속 재계약은 허용)
    const isOriginalClub = tid === neg.formerTeamId;
    if (isUserClub && !isOriginalClub && career.pendingFaProtection) continue;

    const extCount = state.externalSigningsByTeam[tid] ?? 0;
    // KBO 외부 FA 영입 상한 준수 (원소속 재계약은 예외)
    if (!isOriginalClub && extCount >= MAX_EXTERNAL_FA_PER_CLUB) continue;

    const need = computeClubPositionalNeed(career, tid, p);
    const clubProfile = getClubMarketProfile(career, tid, rankByTeam);

    // 구단별 관심도 계산: 능력치 + 포지션 필요도 + 원소속 우선권 + 재정·샐러리캡 여력
    const fairAav = comp.fairTotalBillion / Math.max(1, comp.fairYears);
    const budgetOk = isMega
      ? isOriginalClub ||
        (clubProfile.consecutiveExceedYears < 2 &&
          (clubProfile.capHeadroomBillion >= 8 || clubProfile.maxAnnualBillion >= fairAav * 0.7))
      : clubProfile.budgetCapacityBillion >= comp.fairTotalBillion * 0.72 &&
        clubProfile.maxAnnualBillion >= fairAav * (isOriginalClub ? 0.68 : 0.8);
    if (!budgetOk && !isOriginalClub) continue;
    // 2년 연속 샐러리캡 초과 구단은 외부 초대형 FA(연평균 8억+) 입찰 자제
    if (!isOriginalClub && clubProfile.consecutiveExceedYears >= 2 && fairAav >= 8.0) continue;

    // 동시 다중 입찰 상한 완화: AI 구단은 최대 12건(과열 시 점진적 감점), 사용자 자동입찰은 최대 5건(핵심 보강 중심)
    const activeBidsByClub = Object.values(state.negotiations).filter(
      (n) => (n.status === '입찰중' || n.status === '단장승인대기') && n.bids.some((b) => b.teamId === tid)
    ).length;
    const maxActiveBids = isUserClub ? 5 : 12;
    const prevBidIdx = neg.bids.findIndex((b) => b.teamId === tid);
    if (prevBidIdx < 0 && !isOriginalClub && !isMega && activeBidsByClub >= maxActiveBids) continue;

    // 외부 A/B등급 FA는 보상선수 + 보상금 부담 반영
    const compBurdenPenalty =
      !isOriginalClub && comp.grade === 'A'
        ? isMega
          ? 4.0
          : 7.0
        : !isOriginalClub && comp.grade === 'B'
        ? 3.2
        : 0;
    const crowdPenalty = Math.max(0, activeBidsByClub - 4) * (isMega ? 0.9 : 1.8);
    const interestScore =
      p.ability * 0.46 +
      need * 0.42 +
      (isOriginalClub ? (isMega ? 34 : 18) : isMega ? 10 : 0) +
      (clubProfile.aggressiveness - 1) * 28 -
      compBurdenPenalty -
      crowdPenalty +
      (rng.next() * 14 - 7);

    // 전 등급 FA가 현실적으로 다수 구단의 입찰을 받도록 티어별 기준선 정교화
    const baseThreshold = isMega
      ? 56
      : p.ability >= 80
      ? 60
      : p.ability >= 74
      ? 63
      : p.ability >= 66
      ? 66
      : 68;
    const threshold = isUserClub ? baseThreshold + 3 : baseThreshold;

    if (prevBidIdx < 0 && interestScore < threshold) continue;

    // 이미 입찰 중인 구단의 경쟁 상향 재입찰 처리 (사용자 단장이 직접 입력한 수동 입찰은 자동 덮어쓰기 금지)
    if (prevBidIdx >= 0) {
      const prevBid = neg.bids[prevBidIdx];
      if (isUserClub && !prevBid.isAutoBid) continue;

      const needMult = isMega ? 0.98 + (need / 100) * 0.14 : 0.88 + (need / 100) * 0.22;
      const origMult = isMega
        ? isOriginalClub
          ? 1.06
          : 1.12
        : isOriginalClub
        ? 0.97
        : 1.03;
      const capCeilingTotal = isMega
        ? Number(
            Math.max(
              isOriginalClub ? comp.fairTotalBillion * 1.2 : comp.fairTotalBillion * 1.24,
              Math.min(
                clubProfile.budgetCapacityBillion * (isOriginalClub ? 1.5 : 1.35),
                clubProfile.maxAnnualBillion * prevBid.years * (isOriginalClub ? 1.52 : 1.3)
              )
            ).toFixed(1)
          )
        : Number(
            Math.min(
              clubProfile.budgetCapacityBillion,
              clubProfile.maxAnnualBillion * prevBid.years * (isOriginalClub ? 1.18 : 1.02)
            ).toFixed(1)
          );
      const maxWilling = Number(
        Math.min(
          capCeilingTotal,
          comp.fairTotalBillion *
            needMult *
            origMult *
            (isMega ? Math.max(0.96, clubProfile.aggressiveness) : clubProfile.aggressiveness) *
            (isMega ? 1.0 + rng.next() * 0.16 : 0.96 + rng.next() * 0.14)
        ).toFixed(1)
      );

      // 경쟁 입찰이 더 높고 구단 캡·재정 상한 여유가 있으면 상향 재입찰 (초특급 프랜차이즈는 원소속·경쟁 구단 모두 적극 대응)
      if (existingTopTotal > prevBid.totalBillion && maxWilling > prevBid.totalBillion * 1.02) {
        let raisedTotal = Number(
          Math.min(maxWilling, existingTopTotal * (isMega ? 1.03 + rng.next() * 0.06 : 1.02 + rng.next() * 0.05)).toFixed(1)
        );
        if (isUserClub && career.finances.cashBalanceBillion !== null) {
          const preview = calculateExactFaContractBreakdown(raisedTotal, prevBid.years, {
            age: p.age,
            injuryHistoryCount: p.injuryHistoryCount,
            season: career.season,
          });
          const cComp = !isOriginalClub && comp.grade === 'C' ? comp.cashCompBillion : 0;
          if (preview.signingBonusBillion + cComp > career.finances.cashBalanceBillion * 0.85) {
            continue;
          }
        }
        const years = prevBid.years;
        const annualBillion = Number((raisedTotal / years).toFixed(2));
        const scored = scoreBidForPlayer(
          career,
          p,
          { teamId: tid, years, totalBillion: raisedTotal, annualBillion, isOriginalClub, submittedDate: dateStr },
          rankByTeam
        );
        neg.bids[prevBidIdx] = {
          teamId: tid,
          years,
          totalBillion: raisedTotal,
          annualBillion,
          isOriginalClub,
          submittedDate: dateStr,
          score: scored.score,
          note: scored.note,
          isAutoBid: true,
        };
      }
      continue;
    }

    const builtBid = buildClubAutoBidOffer(
      career,
      p,
      tid,
      isOriginalClub,
      need,
      clubProfile,
      comp,
      rankByTeam,
      dateStr,
      rng
    );
    if (builtBid) {
      neg.bids.push(builtBid);
    }
  }

  neg.bids.sort((a, b) => b.score - a.score || b.totalBillion - a.totalBillion);
}

/**
 * 2차 자동 입찰 보강 패스:
 * 1) 모든 참가 가능 구단(AI 9구단 + 자동입찰 ON 시 사용자 구단)이 최소 2건 이상의 현실적 수요 FA에 입찰하도록 보장
 * 2) 1차 패스에서 아직 입찰이 0건인 FA 선수도 원소속팀 및 포지션 적합도가 가장 높은 구단이 실속형(단기/적정가) 자동 입찰 검토
 */
function ensureBroadClubFaParticipationInPlace(
  career: CareerSave,
  state: FaCompetitionState,
  faPlayers: Player[],
  rankByTeam: Map<TeamId, number>,
  dateStr: string,
  rng: SeededRng
): void {
  const openPlayers = faPlayers.filter((p) => {
    const neg = state.negotiations[p.id];
    return neg && neg.status === '입찰중' && p.signedAsFaSeason !== career.season;
  });
  if (openPlayers.length === 0) return;

  const userAutoEnabled = state.autoBidForUserClub !== false;

  // (A) 구단별 최소 입찰 참여 보장 (예산·외부FA 한도 허용 범위 내 가장 필요한 FA 타깃에 자동 입찰)
  for (const tid of TEAM_IDS) {
    const isUserClub = tid === career.playerTeamId;
    if (isUserClub && !userAutoEnabled) continue;

    const extCount = state.externalSigningsByTeam[tid] ?? 0;
    const currentBids = Object.values(state.negotiations).filter(
      (n) => (n.status === '입찰중' || n.status === '단장승인대기') && n.bids.some((b) => b.teamId === tid)
    ).length;
    const targetMinBids = isUserClub ? 2 : 3;
    if (currentBids >= targetMinBids) continue;

    const clubProfile = getClubMarketProfile(career, tid, rankByTeam);
    const rankedCandidates = openPlayers
      .filter((p) => {
        const neg = state.negotiations[p.id];
        if (!neg || neg.bids.some((b) => b.teamId === tid)) return false;
        const isOrig = neg.formerTeamId === tid;
        if (!isOrig && extCount >= MAX_EXTERNAL_FA_PER_CLUB) return false;
        if (isUserClub && !isOrig && career.pendingFaProtection) return false;
        return true;
      })
      .map((p) => {
        const neg = state.negotiations[p.id];
        const isOrig = neg.formerTeamId === tid;
        const need = computeClubPositionalNeed(career, tid, p);
        const comp = evaluateFaGradeAndComp(career, p);
        const fitScore =
          need * 0.55 +
          p.ability * 0.45 +
          (isOrig ? 22 : 0) -
          (!isOrig && comp.grade === 'A' ? 8 : !isOrig && comp.grade === 'B' ? 3 : 0);
        return { p, neg, isOrig, need, comp, fitScore };
      })
      .sort((a, b) => b.fitScore - a.fitScore);

    let added = 0;
    for (const c of rankedCandidates) {
      if (currentBids + added >= targetMinBids) break;
      const fairAav = c.comp.fairTotalBillion / Math.max(1, c.comp.fairYears);
      if (!c.isOrig && clubProfile.maxAnnualBillion < fairAav * 0.72) continue;
      const bid = buildClubAutoBidOffer(
        career,
        c.p,
        tid,
        c.isOrig,
        c.need,
        clubProfile,
        c.comp,
        rankByTeam,
        dateStr,
        rng,
        0.95
      );
      if (bid) {
        c.neg.bids.push(bid);
        c.neg.bids.sort((a, b) => b.score - a.score || b.totalBillion - a.totalBillion);
        added += 1;
      }
    }
  }

  // (B) 입찰이 0건인 미관심/중견·베테랑 FA에게 원소속팀 및 포지션 적합 구단의 실속형 오퍼 자동 생성
  for (const p of openPlayers) {
    const neg = state.negotiations[p.id];
    if (!neg || neg.bids.length > 0) continue;

    const comp = evaluateFaGradeAndComp(career, p);
    const suitors = TEAM_IDS.filter((tid) => {
      const isUserClub = tid === career.playerTeamId;
      if (isUserClub && !userAutoEnabled) return false;
      const isOrig = tid === neg.formerTeamId;
      if (isUserClub && !isOrig && career.pendingFaProtection) return false;
      const extCount = state.externalSigningsByTeam[tid] ?? 0;
      if (!isOrig && extCount >= MAX_EXTERNAL_FA_PER_CLUB) return false;
      return true;
    })
      .map((tid) => {
        const isOrig = tid === neg.formerTeamId;
        const need = computeClubPositionalNeed(career, tid, p);
        const clubProfile = getClubMarketProfile(career, tid, rankByTeam);
        const score = need + (isOrig ? 24 : 0) + (clubProfile.capHeadroomBillion > 0 ? 8 : -4);
        return { tid, isOrig, need, clubProfile, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, p.ability >= 72 ? 3 : 2);

    for (const s of suitors) {
      const bid = buildClubAutoBidOffer(
        career,
        p,
        s.tid,
        s.isOrig,
        s.need,
        s.clubProfile,
        comp,
        rankByTeam,
        dateStr,
        rng,
        p.ability >= 72 ? 0.94 : 0.88
      );
      if (bid) {
        neg.bids.push(bid);
      }
    }
    neg.bids.sort((a, b) => b.score - a.score || b.totalBillion - a.totalBillion);
  }
}

/**
 * AI 구단 FA 계약 최종 확정 (KBO A/B/C 보상 규정 + 모든 경쟁 입찰 즉시 마감 + 중복 방지 + 영입 현황 기록 + 뉴스)
 */
function finalizeAiClubFaSigningInPlace(
  career: CareerSave,
  state: FaCompetitionState,
  neg: FaMarketNegotiation,
  p: Player,
  winningBid: FaClubBid,
  dateStr: string
): void {
  if (p.signedAsFaSeason === career.season || neg.status === '계약완료') return;

  const newTeamId = winningBid.teamId;
  const fromTeamId = neg.formerTeamId;
  const isOriginalClub = newTeamId === fromTeamId;
  const comp = evaluateFaGradeAndComp(career, p);

  // 이전 소속팀 라인업/로테이션 정리
  if (career.teams[fromTeamId]) {
    career.teams[fromTeamId].lineupOrder = career.teams[fromTeamId].lineupOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].benchOrder = career.teams[fromTeamId].benchOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].rotationOrder = career.teams[fromTeamId].rotationOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].bullpenOrder = career.teams[fromTeamId].bullpenOrder.filter((id) => id !== p.id);
  }

  const exactBreakdown = calculateExactFaContractBreakdown(winningBid.totalBillion, winningBid.years, {
    age: p.age,
    injuryHistoryCount: p.injuryHistoryCount,
    season: career.season,
  });
  const signingBonus = exactBreakdown.signingBonusBillion;
  const annualSalary = exactBreakdown.annualSalaryBillion;
  const optionTotal = exactBreakdown.optionTotalBillion;

  const prevAnnualSalBeforeAiSign = Math.max(0.33, p.previousAnnualSalary ?? p.contract.annualSalary ?? 1.0);
  p.previousAnnualSalary = prevAnnualSalBeforeAiSign;
  p.teamId = newTeamId;
  p.formerTeamId = undefined;
  p.rosterTier = '1군';
  p.gameDayActive = true;
  p.signedAsFaSeason = career.season;
  p.morale = '만족';
  p.dissatisfaction = Math.min(p.dissatisfaction ?? 15, 18);
  const signDateIso = getCurrentCareerDate(career).isoDate;
  if (!isOriginalClub) {
    p.clubTenureSeasons = 1;
    appendPlayerTeamHistoryInPlace(p, newTeamId, career.season, `${career.season} FA 이적`, {
      transferDate: signDateIso,
      moveType: 'FA 이적',
      fromTeamId,
    });
    state.externalSigningsByTeam[newTeamId] = (state.externalSigningsByTeam[newTeamId] ?? 0) + 1;
  } else {
    p.releasedAfter2026 = undefined;
    p.releaseDate = undefined;
    p.releaseNote = undefined;
  }

  p.contract = {
    status: '확정',
    currency: 'KRW',
    years: winningBid.years,
    yearsRemaining: winningBid.years,
    annualSalary,
    signingBonus,
    totalValue: exactBreakdown.totalBillion,
    startSeason: career.season,
    endSeason: career.season + winningBid.years - 1,
    isFAEligible: false,
    faGrade: comp.grade,
    optionBonusPaidBillion: 0,
    note: isOriginalClub
      ? `${career.season} 원소속팀 FA 잔류 (${winningBid.years}년 총액 ${exactBreakdown.totalBillion.toFixed(1)}억 · 계약금 ${signingBonus.toFixed(2)}억/연봉 ${annualSalary.toFixed(2)}억/옵션 ${optionTotal.toFixed(2)}억)`
      : `${career.season} 외부 FA ${comp.grade}등급 계약 (${winningBid.years}년 총액 ${exactBreakdown.totalBillion.toFixed(1)}억 · 계약금 ${signingBonus.toFixed(2)}억/연봉 ${annualSalary.toFixed(2)}억/옵션 ${optionTotal.toFixed(2)}억)`,
  };

  if (career.teams[newTeamId]) {
    if (p.role === '투수') {
      if (p.pitchRole === '선발' && career.teams[newTeamId].rotationOrder.length < 5) {
        career.teams[newTeamId].rotationOrder.push(p.id);
      } else {
        career.teams[newTeamId].bullpenOrder.push(p.id);
      }
    } else {
      career.teams[newTeamId].benchOrder.push(p.id);
    }
  }

  // KBO A/B/C FA 보상 규정 적용 (외부 영입 시 · 사용자/AI 100% 동일 규정 적용)
  // - A등급: 20인 보호 외 1명 + 연봉 200% (또는 연봉 300%)
  // - B등급: 25인 보호 외 1명 + 연봉 100% (또는 연봉 200%)
  // - C등급: 보상선수 없음 · 연봉 150% 금전 보상만 처리
  // - 자동 제외 대상(당해 FA 선수·신인·외국인/아시아쿼터·군보류·FA 보상 이적자)은 보호 인원 외 자동 보호
  let compSummary = '원소속팀 잔류 (보상 없음)';
  if (!isOriginalClub) {
    const prevAnnualSal = prevAnnualSalBeforeAiSign;
    const compRes = resolveFaProtectionAndCompensationSelection(career, newTeamId, fromTeamId, {
      faSeason: career.season,
      signedPlayerId: p.id,
      grade: comp.grade,
      previousAnnualSalaryBillion: prevAnnualSal,
    });

    if (comp.grade === 'A' || comp.grade === 'B') {
      const compPlayer = compRes.chosenPlayer;
      if (compPlayer) {
        if (career.teams[newTeamId]) {
          career.teams[newTeamId].lineupOrder = career.teams[newTeamId].lineupOrder.filter((id) => id !== compPlayer.id);
          career.teams[newTeamId].benchOrder = career.teams[newTeamId].benchOrder.filter((id) => id !== compPlayer.id);
          career.teams[newTeamId].rotationOrder = career.teams[newTeamId].rotationOrder.filter((id) => id !== compPlayer.id);
          career.teams[newTeamId].bullpenOrder = career.teams[newTeamId].bullpenOrder.filter((id) => id !== compPlayer.id);
        }
        compPlayer.teamId = fromTeamId;
        compPlayer.rosterTier = '2군';
        compPlayer.gameDayActive = false;
        compPlayer.clubTenureSeasons = 1;
        compPlayer.faCompensationTransferredSeason = career.season;
        appendPlayerTeamHistoryInPlace(compPlayer, fromTeamId, career.season, `${p.name} FA 보상선수`, {
          transferDate: signDateIso,
          moveType: 'FA 보상선수',
          fromTeamId: newTeamId,
        });
      }
      compSummary = compRes.summary;
      // 만약 원소속 구단이 사용자 구단이라면 현금 보상 입금
      if (fromTeamId === career.playerTeamId && career.finances.cashBalanceBillion !== null) {
        career.finances.cashBalanceBillion = Number(
          (career.finances.cashBalanceBillion + compRes.finalCashCompBillion).toFixed(2)
        );
        career.finances.compensationReceivedBillion = Number(
          ((career.finances.compensationReceivedBillion ?? 0) + compRes.finalCashCompBillion).toFixed(2)
        );
      }
    } else {
      const cRule = getKboFaCompensationRuleForSeason(career.season, 'C');
      const cCash = Number((prevAnnualSal * cRule.cashOnlyRatio).toFixed(2));
      compSummary = `C등급 보상금 ${cCash.toFixed(1)}억 정산 (보상선수 없음)`;
      if (fromTeamId === career.playerTeamId && career.finances.cashBalanceBillion !== null) {
        career.finances.cashBalanceBillion = Number(
          (career.finances.cashBalanceBillion + cCash).toFixed(2)
        );
        career.finances.compensationReceivedBillion = Number(
          ((career.finances.compensationReceivedBillion ?? 0) + cCash).toFixed(2)
        );
      }
    }
  }

  // 계약 확정 즉시 해당 선수의 모든 타 구단 입찰 마감
  neg.status = '계약완료';
  neg.signedTeamId = newTeamId;
  neg.signedTotalBillion = winningBid.totalBillion;
  neg.signedYears = winningBid.years;
  neg.closedDate = dateStr;
  neg.bids = [winningBid];

  const newClubShort = KBO_TEAMS[newTeamId].shortName;
  const fromClubShort = KBO_TEAMS[fromTeamId].shortName;

  // 리그 전체 뉴스 발행 (오프시즌 스토브리그 뉴스는 다음 시즌으로 분류)
  if (!career.newsFeed) career.newsFeed = [];
  career.newsFeed.unshift({
    id: `news-fa-comp-${career.season}-${p.id}-${newTeamId}`,
    season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
    date: dateStr,
    category: '이적·계약',
    headline: isOriginalClub
      ? `[FA 잔류] ${newClubShort}, ${p.name}(${comp.grade}등급)과 ${winningBid.years}년 ${winningBid.totalBillion.toFixed(1)}억 재계약`
      : `[FA 이적] ${newClubShort}, ${comp.grade}등급 ${p.name} ${winningBid.years}년 ${winningBid.totalBillion.toFixed(1)}억 영입 확정`,
    body: `${p.name} 선수가 치열한 구단 경합 끝에 ${KBO_TEAMS[newTeamId].name}와 계약했습니다. (${compSummary})`,
    teamId: newTeamId,
    isHighlight: p.ability >= 80 || fromTeamId === career.playerTeamId,
  });

  // 전체 구단 영입 현황 기록 (중복 방지)
  recordLeagueAcquisitionInPlace(
    career,
    {
      dedupeKey: `fa-${career.season}-${p.id}-${newTeamId}`,
      season: career.season,
      date: dateStr,
      category: 'FA',
      playerId: p.id,
      playerName: p.name,
      position: p.position,
      previousTeamLabel: isOriginalClub ? `${fromClubShort} (원소속 재계약)` : fromClubShort,
      acquiringTeamId: newTeamId,
      contractAmountLabel: `${winningBid.years}년 ${winningBid.totalBillion.toFixed(1)}억`,
      note: compSummary,
    },
    { pushNewsAlert: false }
  );
}

/**
 * 사용자 구단 단장이 FA 선수에게 공식 입찰 제안 제출
 * - 사용자 구단 FA 계약은 절대 자동 확정되지 않으며, 선수 선택 시 '단장승인대기'로 전환 후 단장 최종 승인 시에만 체결
 */
export function submitUserClubFaBid(
  career: CareerSave,
  playerId: string,
  offerYears: number,
  offerTotalBillion: number
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  status: '입찰중' | '단장승인대기';
  message: string;
} {
  if (!Number.isFinite(offerYears) || offerYears < 1 || !Number.isFinite(offerTotalBillion) || offerTotalBillion <= 0) {
    throw new Error('유효한 계약 연수와 총액을 입력해 주세요.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const dateStr = getCurrentCareerDate(next).isoDate;
  const state = syncFaCompetitionMarketInPlace(next, dateStr);
  const p = next.players[playerId];
  if (!p) throw new Error('대상 FA 선수를 찾을 수 없습니다.');
  if (p.signedAsFaSeason === next.season) {
    throw new Error('이미 올 시즌 FA 계약을 완료한 선수입니다 (중복 계약 방지).');
  }

  const neg = state.negotiations[playerId];
  if (!neg || neg.status === '계약완료') {
    throw new Error('이미 계약이 마감된 FA 선수입니다.');
  }

  const isOriginalClub = neg.formerTeamId === next.playerTeamId;
  const extCount = state.externalSigningsByTeam[next.playerTeamId] ?? 0;
  if (!isOriginalClub && extCount >= MAX_EXTERNAL_FA_PER_CLUB) {
    throw new Error(
      `KBO 규정상 단일 시즌 외부 FA 영입은 최대 ${MAX_EXTERNAL_FA_PER_CLUB}명까지 가능합니다. (현재 ${extCount}명 영입 완료 · 원소속 재계약은 제한 없음)`
    );
  }

  const comp = evaluateFaGradeAndComp(next, p);
  const previewBreakdown = calculateExactFaContractBreakdown(offerTotalBillion, offerYears, {
    age: p.age,
    injuryHistoryCount: p.injuryHistoryCount,
    season: next.season,
  });
  const signingBonus = previewBreakdown.signingBonusBillion;
  const cComp = !isOriginalClub && comp.grade === 'C' ? comp.cashCompBillion : 0;
  const requiredCash = Number((signingBonus + cComp).toFixed(2));
  if (next.finances.cashBalanceBillion !== null && next.finances.cashBalanceBillion < requiredCash) {
    throw new Error(`예상 계약금${cComp > 0 ? '+C등급 보상금' : ''}(${requiredCash}억)이 현재 보유 자금을 초과합니다.`);
  }

  const standings = computeStandings(next.gamesLedger);
  const rankByTeam = new Map<TeamId, number>();
  standings.forEach((row, idx) => rankByTeam.set(row.teamId, idx + 1));

  const maxRealisticYears = getMaxRealisticFaYears(p.age, p.ability, {
    isMegaFranchise: comp.isMegaFranchise,
    franchiseScore: comp.franchiseScore,
    potential: p.potential,
  });
  if (Math.round(offerYears) > maxRealisticYears) {
    throw new Error(
      `계약 기간 현실성 제한: 만 ${p.age}세 ${p.name} 선수의 최대 현실적 계약 기간은 ${maxRealisticYears}년입니다.`
    );
  }
  const years = clamp(Math.round(offerYears), 1, maxRealisticYears);
  const totalBillion = Number(offerTotalBillion.toFixed(1));
  const annualBillion = Number((totalBillion / years).toFixed(2));
  const scored = scoreBidForPlayer(
    next,
    p,
    {
      teamId: next.playerTeamId,
      years,
      totalBillion,
      annualBillion,
      isOriginalClub,
      submittedDate: dateStr,
    },
    rankByTeam
  );

  const userBid: FaClubBid = {
    teamId: next.playerTeamId,
    years,
    totalBillion,
    annualBillion,
    isOriginalClub,
    submittedDate: dateStr,
    score: scored.score,
    note: scored.note,
  };

  neg.bids = [...neg.bids.filter((b) => b.teamId !== next.playerTeamId), userBid];
  // AI 경쟁 구단 즉각 반응 평가
  const rng = new SeededRng((next.season * 31337 + state.round * 53 + hashStr(playerId)) >>> 0);
  evaluateAiClubBidsForPlayerInPlace(next, state, neg, p, rankByTeam, dateStr, rng);
  neg.roundCount += 1;

  const topBid = neg.bids[0];
  const minAcceptRatio = comp.isMegaFranchise
    ? isOriginalClub
      ? 0.92
      : 0.98
    : comp.tierLabel === '정상급 특급'
    ? isOriginalClub
      ? 0.9
      : 0.96
    : isOriginalClub
    ? 0.88
    : 0.94;
  const minAcceptYears = comp.isMegaFranchise ? Math.min(5, Math.max(4, comp.fairYears - 2)) : 1;
  const meetsThreshold =
    totalBillion >= comp.fairTotalBillion * minAcceptRatio && years >= minAcceptYears;
  const mlbBeatsUser = Boolean(
    neg.mlbOffer &&
      neg.mlbStatus === 'MLB제안접수' &&
      neg.mlbOffer.score > (topBid?.score ?? 0)
  );

  if (topBid && topBid.teamId === next.playerTeamId && meetsThreshold && !mlbBeatsUser) {
    neg.status = '단장승인대기';
    neg.pendingWinnerTeamId = next.playerTeamId;
    next.updatedAt = new Date().toISOString();
    return {
      nextCareer: next,
      backupSnapshot,
      status: '단장승인대기',
      message: neg.mlbOffer
        ? `${p.name} 선수가 MLB(${neg.mlbOffer.mlbTeam}) 제안보다 우리 구단 조건(${years}년 ${totalBillion.toFixed(1)}억)을 높게 평가해 수락했습니다! [최종 계약 승인] 버튼을 눌러야 계약이 확정됩니다.`
        : `${p.name} 선수가 우리 구단 조건(${years}년 ${totalBillion.toFixed(1)}억)을 최우선으로 수락했습니다! [최종 계약 승인] 버튼을 눌러야 계약이 확정됩니다.`,
    };
  }

  const leaderLabel = mlbBeatsUser && neg.mlbOffer
    ? `MLB ${neg.mlbOffer.mlbTeam}(${neg.mlbOffer.years}년 $${neg.mlbOffer.guaranteedUsdMillions}M)`
    : topBid
    ? `${KBO_TEAMS[topBid.teamId].shortName}(${topBid.years}년 ${topBid.totalBillion.toFixed(1)}억)`
    : '시장 적정가 미달';

  next.updatedAt = new Date().toISOString();
  return {
    nextCareer: next,
    backupSnapshot,
    status: '입찰중',
    message: `${p.name}에게 ${years}년 ${totalBillion.toFixed(1)}억 입찰을 제출했습니다. 현재 선두: ${leaderLabel} (KBO ${neg.bids.length}개팀${neg.mlbOffer ? ' + MLB 1개팀' : ''})`,
  };
}

/**
 * 10개 구단 FA 경쟁 1라운드 진행
 * - AI 구단들이 추가 입찰 및 최종 계약 결정을 진행
 * - AI 승리 건은 즉시 계약 확정 + 타 입찰 마감 + 뉴스 + 영입 현황 기록
 * - 사용자 구단이 1순위인 건은 절대 자동 체결하지 않고 '단장승인대기' 상태로 보고
 */
export function advanceFaCompetitionRound(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  signedSummaries: string[];
  pendingUserApprovals: string[];
} {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const dateStr = getCurrentCareerDate(next).isoDate;
  const state = syncFaCompetitionMarketInPlace(next, dateStr);
  state.round += 1;

  const standings = computeStandings(next.gamesLedger);
  const rankByTeam = new Map<TeamId, number>();
  standings.forEach((row, idx) => rankByTeam.set(row.teamId, idx + 1));
  const rng = new SeededRng((next.season * 19997 + state.round * 419) >>> 0);

  const signedSummaries: string[] = [];
  const pendingUserApprovals: string[] = [];

  for (const neg of Object.values(state.negotiations)) {
    if (neg.status !== '입찰중') continue;
    const p = next.players[neg.playerId];
    if (!p || p.signedAsFaSeason === next.season) {
      neg.status = '계약완료';
      continue;
    }

    evaluateAiClubBidsForPlayerInPlace(next, state, neg, p, rankByTeam, dateStr, rng);
    neg.roundCount += 1;

    const topBid = neg.bids[0];
    const activeMlbOffer = neg.mlbStatus === 'MLB제안접수' ? neg.mlbOffer : undefined;

    // 해외 FA 선수는 KBO와 MLB의 계약 제안을 직접 비교해 선택 (구단 승인 불필요)
    if (activeMlbOffer) {
      const kboTopScore = topBid?.score ?? 0;
      if (activeMlbOffer.score > kboTopScore) {
        // 1라운드에서는 더 좋은 MLB 제안을 검토하며 KBO 구단의 추가 대응 입찰을 1라운드 대기
        if (neg.roundCount < 2) {
          continue;
        }
        // 경계선 규모 MLB 계약은 메디컬·세부 조건 이견으로 결렬될 수 있음 -> 실패 시 KBO 잔류/국내 FA 협상 지속
        const failChance = activeMlbOffer.guaranteedUsdMillions < 18 ? 0.24 : 0.08;
        if (rng.next() < failChance) {
          neg.mlbStatus = 'MLB협상결렬';
          neg.mlbFailureReason = `${activeMlbOffer.mlbTeam}와 보장 조건·마이너 옵션 이견으로 MLB 협상 결렬 → KBO 잔류 및 국내 FA 협상 지속`;
          neg.mlbOffer = undefined;
          if (!next.newsFeed) next.newsFeed = [];
          next.newsFeed.unshift({
            id: `news-mlb-ofa-fail-${next.season}-${p.id}`,
            season: next.phase === 'OFFSEASON' ? next.season + 1 : next.season,
            date: dateStr,
            category: 'MLB소식',
            headline: `[해외 FA MLB 협상 결렬] ${p.name}, ${activeMlbOffer.mlbTeam} 계약 불발… KBO FA 협상 복귀`,
            body: `해외 FA로 빅리그 진출을 타진하던 ${p.name} 선수가 ${activeMlbOffer.mlbTeam}과의 세부 조건 합의에 실패해 KBO 국내 FA 협상으로 복귀했습니다.`,
            teamId: neg.formerTeamId,
          });
          continue;
        }
        finalizeOverseasFaMlbSigningInPlace(next, neg, p, activeMlbOffer, dateStr);
        signedSummaries.push(
          `MLB ${activeMlbOffer.mlbTeam} ← ${p.name} (해외 FA ${activeMlbOffer.years}년 $${activeMlbOffer.guaranteedUsdMillions}M)`
        );
        continue;
      }
    }

    if (!topBid) continue;
    const comp = evaluateFaGradeAndComp(next, p);

    // 라운드가 진행될수록 선수가 최종 행선지 결정 (초특급/정상급 선수는 후기 라운드에도 비현실적 저가 수락 방지)
    const decideThreshold = comp.isMegaFranchise
      ? neg.roundCount >= 3
        ? comp.fairTotalBillion * 0.92
        : neg.roundCount >= 2
        ? comp.fairTotalBillion * 0.97
        : comp.fairTotalBillion * 1.04
      : comp.tierLabel === '정상급 특급'
      ? neg.roundCount >= 3
        ? comp.fairTotalBillion * 0.88
        : neg.roundCount >= 2
        ? comp.fairTotalBillion * 0.94
        : comp.fairTotalBillion * 1.03
      : neg.roundCount >= 3
      ? comp.fairTotalBillion * 0.82
      : neg.roundCount >= 2
      ? comp.fairTotalBillion * 0.92
      : comp.fairTotalBillion * 1.02;

    if (topBid.totalBillion < decideThreshold) continue;

    if (topBid.teamId === next.playerTeamId) {
      // 사용자 구단은 단장 최종 승인 없이 자동 체결 금지!
      neg.status = '단장승인대기';
      neg.pendingWinnerTeamId = next.playerTeamId;
      pendingUserApprovals.push(`${p.name} (${topBid.years}년 ${topBid.totalBillion.toFixed(1)}억)`);
    } else {
      // AI 구단 외부 FA 상한 재확인
      const isOrig = topBid.teamId === neg.formerTeamId;
      const extCnt = state.externalSigningsByTeam[topBid.teamId] ?? 0;
      if (!isOrig && extCnt >= MAX_EXTERNAL_FA_PER_CLUB) {
        neg.bids = neg.bids.filter((b) => b.teamId !== topBid.teamId);
        continue;
      }
      finalizeAiClubFaSigningInPlace(next, state, neg, p, topBid, dateStr);
      signedSummaries.push(
        `${KBO_TEAMS[topBid.teamId].shortName} ← ${p.name} (${topBid.years}년 ${topBid.totalBillion.toFixed(1)}억)`
      );
    }
  }

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, signedSummaries, pendingUserApprovals };
}

/**
 * 단장승인대기 상태의 사용자 구단 FA 입찰 취소(철회)
 */
export function declinePendingUserFaApproval(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const neg = next.faCompetition?.negotiations[playerId];
  if (neg && neg.status === '단장승인대기') {
    neg.status = '입찰중';
    neg.pendingWinnerTeamId = undefined;
    neg.bids = neg.bids.filter((b) => b.teamId !== next.playerTeamId);
  }
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 계약 확정된 선수의 FA 경쟁 입찰 상태를 즉시 마감 처리 (외부 signExternalFaPlayer 연동용)
 */
export function markFaNegotiationSignedInPlace(
  career: CareerSave,
  playerId: string,
  signedTeamId: TeamId,
  years: number,
  totalBillion: number,
  isOriginalClub: boolean,
  dateStr: string
): void {
  if (!career.faCompetition || career.faCompetition.season !== career.season) {
    career.faCompetition = {
      season: career.season,
      round: 1,
      externalSigningsByTeam: {},
      negotiations: {},
    };
  }
  const state = career.faCompetition;
  if (!isOriginalClub) {
    state.externalSigningsByTeam[signedTeamId] = (state.externalSigningsByTeam[signedTeamId] ?? 0) + 1;
  }
  const p = career.players[playerId];
  const existing = state.negotiations[playerId];
  state.negotiations[playerId] = {
    playerId,
    playerName: p?.name ?? existing?.playerName ?? playerId,
    formerTeamId: existing?.formerTeamId ?? p?.formerTeamId ?? signedTeamId,
    faGrade: existing?.faGrade ?? p?.contract.faGrade ?? 'B',
    status: '계약완료',
    bids: [
      {
        teamId: signedTeamId,
        years,
        totalBillion,
        annualBillion: Number((totalBillion / Math.max(1, years)).toFixed(2)),
        isOriginalClub,
        submittedDate: dateStr,
        score: 100,
        note: '단장 최종 승인 확정',
      },
    ],
    signedTeamId,
    signedTotalBillion: totalBillion,
    signedYears: years,
    closedDate: dateStr,
    roundCount: (existing?.roundCount ?? 0) + 1,
  };
}

/**
 * 오프시즌 종료/차기 시즌 개막 전 남은 미계약 FA들에 대한 AI 구단 최종 정리 (사용자 구단 자동 체결 절대 없음)
 */
export function resolveRemainingAiFaCompetitionInPlace(
  career: CareerSave,
  dateStr = `${career.season}-12-10`
): string[] {
  const state = syncFaCompetitionMarketInPlace(career, dateStr);
  const standings = computeStandings(career.gamesLedger);
  const rankByTeam = new Map<TeamId, number>();
  standings.forEach((row, idx) => rankByTeam.set(row.teamId, idx + 1));
  const rng = new SeededRng((career.season * 61333 + 19) >>> 0);
  const summaries: string[] = [];

  for (const neg of Object.values(state.negotiations)) {
    if (neg.status === '계약완료') continue;
    const p = career.players[neg.playerId];
    if (!p || p.rosterTier !== 'FA' || p.signedAsFaSeason === career.season) continue;

    evaluateAiClubBidsForPlayerInPlace(career, state, neg, p, rankByTeam, dateStr, rng);
    const activeMlbOffer = neg.mlbStatus === 'MLB제안접수' ? neg.mlbOffer : undefined;
    const aiWinner = neg.bids.find((b) => {
      if (b.teamId === career.playerTeamId) return false;
      const isOrig = b.teamId === neg.formerTeamId;
      return isOrig || (state.externalSigningsByTeam[b.teamId] ?? 0) < MAX_EXTERNAL_FA_PER_CLUB;
    });

    if (activeMlbOffer && activeMlbOffer.score > (aiWinner?.score ?? 0)) {
      const failChance = activeMlbOffer.guaranteedUsdMillions < 18 ? 0.24 : 0.08;
      if (rng.next() >= failChance) {
        finalizeOverseasFaMlbSigningInPlace(career, neg, p, activeMlbOffer, dateStr);
        summaries.push(`MLB ${activeMlbOffer.mlbTeam} ← ${p.name} (해외 FA)`);
        continue;
      } else {
        neg.mlbStatus = 'MLB협상결렬';
        neg.mlbFailureReason = `${activeMlbOffer.mlbTeam} 계약 합의 불발 → KBO 잔류`;
        neg.mlbOffer = undefined;
      }
    }

    if (aiWinner) {
      finalizeAiClubFaSigningInPlace(career, state, neg, p, aiWinner, dateStr);
      summaries.push(`${KBO_TEAMS[aiWinner.teamId].shortName} ← ${p.name}`);
    }
  }
  return summaries;
}

/**
 * 전체 10개 구단 자동 입찰 즉시 동기화 (기존 세이브 진입·새로고침 공용)
 */
export function syncAllClubsAutoFaBids(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  totalBids: number;
  activeClubCount: number;
} {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const dateStr = getCurrentCareerDate(next).isoDate;
  const state = syncFaCompetitionMarketInPlace(next, dateStr);

  const clubsWithBids = new Set<TeamId>();
  let totalBids = 0;
  for (const neg of Object.values(state.negotiations)) {
    if (neg.status === '계약완료') continue;
    for (const b of neg.bids) {
      clubsWithBids.add(b.teamId);
      totalBids += 1;
    }
  }

  next.updatedAt = new Date().toISOString();
  return {
    nextCareer: next,
    backupSnapshot,
    totalBids,
    activeClubCount: clubsWithBids.size,
  };
}

/**
 * 사용자 구단의 FA 자동 입찰 참여 여부 토글
 * - ON: 사용자 구단도 AI 9개 구단과 함께 자동 입찰 참여 (선수가 수락해도 단장 최종 승인 후 체결)
 * - OFF: 자동 제출된 사용자 구단 입찰만 정리하고 수동 입찰은 보존
 */
export function setUserClubAutoFaBidEnabled(
  career: CareerSave,
  enabled: boolean
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const dateStr = getCurrentCareerDate(next).isoDate;
  if (!next.faCompetition || next.faCompetition.season !== next.season) {
    next.faCompetition = {
      season: next.season,
      round: 1,
      externalSigningsByTeam: {},
      negotiations: {},
      autoBidForUserClub: enabled,
    };
  } else {
    next.faCompetition.autoBidForUserClub = enabled;
  }

  if (!enabled) {
    for (const neg of Object.values(next.faCompetition.negotiations)) {
      if (neg.status === '계약완료') continue;
      const hadAutoUserBid = neg.bids.some(
        (b) => b.teamId === next.playerTeamId && b.isAutoBid
      );
      if (hadAutoUserBid) {
        neg.bids = neg.bids.filter(
          (b) => !(b.teamId === next.playerTeamId && b.isAutoBid)
        );
        if (neg.status === '단장승인대기' && neg.pendingWinnerTeamId === next.playerTeamId) {
          const stillHasManual = neg.bids.some((b) => b.teamId === next.playerTeamId);
          if (!stillHasManual) {
            neg.status = '입찰중';
            neg.pendingWinnerTeamId = undefined;
          }
        }
      }
    }
  }

  syncFaCompetitionMarketInPlace(next, dateStr);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export interface ClubFaBidSummaryItem {
  teamId: TeamId;
  activeBidCount: number;
  externalSignings: number;
  isUserClub: boolean;
  autoBidActive: boolean;
}

/**
 * KBO 10개 구단별 FA 자동 입찰 참여 현황 요약
 */
export function getClubFaBidSummary(career: CareerSave): ClubFaBidSummaryItem[] {
  const state = career.faCompetition?.season === career.season ? career.faCompetition : undefined;
  const userAuto = state?.autoBidForUserClub !== false;

  return TEAM_IDS.map((tid) => {
    let activeBidCount = 0;
    if (state) {
      for (const neg of Object.values(state.negotiations)) {
        if (neg.status === '계약완료') continue;
        if (neg.bids.some((b) => b.teamId === tid)) {
          activeBidCount += 1;
        }
      }
    }
    const isUserClub = tid === career.playerTeamId;
    return {
      teamId: tid,
      activeBidCount,
      externalSignings: state?.externalSigningsByTeam?.[tid] ?? 0,
      isUserClub,
      autoBidActive: isUserClub ? userAuto : true,
    };
  });
}
