import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { REAL_KBO_BATTER_PROFILES, REAL_KBO_PITCHER_PROFILES } from '../data/kboRealMetrics';
import { getLiveCareerStats, REAL_KBO_RETIRED_NUMBERS } from '../data/playerMetadata';
import { findRealPlayerClubProfile } from '../data/realKboHistories';
import {
  appendPlayerTeamHistoryInPlace,
  getAwardSalaryDemandMultiplier,
  getDefendingChampionTeamId,
} from './leagueLifeEngine';
import {
  buildTeamFaProtectionPool,
  evaluateAiCompensationDecision,
  resolveFaProtectionAndCompensationSelection,
  resolveKboFaGradeWithExceptions,
} from './faCompensationEngine';
import { reconcileTeamLineupPositionsInPlace } from './lineupValidationEngine';
import {
  AgentPersona,
  BatterStats,
  BattingProfile,
  CareerSave,
  ClubEventRecord,
  ExhibitionGameRecord,
  FacilityConditionState,
  GameDifficulty,
  GameWeather,
  GmJobOffer,
  HiddenTrait,
  LeagueEnvironmentState,
  OffseasonStep12,
  OveruseMetrics,
  OverseasReturnCandidate,
  PitchGrade,
  PitchRepertoire,
  PitchTypeName,
  PitcherStats,
  Player,
  PlayerAgent,
  Position,
  RetirementCeremonyRecord,
  SalaryCapSummary,
  SpringCampState,
  StaffPoachingOffer,
  TeamId,
  TeamLeadershipState,
} from '../types/kbo';
import {
  ensureClubLegendsHallOfFameInPlace,
  evaluateFranchiseStar,
} from './franchiseStarEngine';
import {
  getPlayerDissatisfaction,
  getReSignResistanceAssessment,
  syncPlayerMoraleFromDissatisfaction,
} from './dissatisfactionEngine';
import { SeededRng } from './rng';
import {
  computeSalaryCapSummary as computeOfficialSalaryCapSummary,
  ensureCompetitiveBalanceState,
  executeAtomicCareerMutation,
  getAnnualKboCapBillion as getOfficialAnnualKboCapBillion,
  getCurrentCareerDate,
  getPlayerClubTenureSeasons,
} from './salaryCapEngine';
import {
  assertNotBlockedByArticle107,
  completeOverseasReturnToKboInPlace,
  evaluateOverseasReturnEligibility,
} from './amateurOverseasEngine';
import { recordLeagueAcquisitionInPlace } from './leagueAcquisitionsEngine';
import { ensurePlayerOotpRatingsInPlace } from './ootpRatingsEngine';
import { allocatePermanentPlayerId } from './playerRegistry';
import { getPositionProficiency } from './positionEngine';
import { syncSeasonRookieEligibilityInPlace } from './kboAwardsEngine';
import { calcAVG, calcERA, calcOPS, computeStandings, emptyBatterStats, emptyPitcherStats, formatIP } from './stats';

export {
  computeOfficialSalaryCapSummary as computeSalaryCapSummary,
  ensureCompetitiveBalanceState,
  getOfficialAnnualKboCapBillion as getAnnualKboCapBillion,
};

// =============================================================================
// 1. DIFFICULTY CONFIGURATION (#6 - 기본 추천: '어려움', 경기 결과 조작 금지)
// =============================================================================
export const DIFFICULTY_CONFIG: Record<
  GameDifficulty,
  {
    label: string;
    recommended: boolean;
    description: string;
    rivalAggressiveness: number; // 0.8..1.35 (FA/외국인/트레이드 적극성)
    agentSelectivity: number; // 0.9..1.22 (계약 거절·선호도 엄격도)
    tradeFairnessTolerance: number; // 허용 가치 격차 (낮을수록 엄격)
    revenueTightness: number; // 재정 여유 계수
    ownerExpectationStrictness: number;
  }
> = {
  보통: {
    label: '보통',
    recommended: false,
    description: '표준 KBO 구단 운영 난이도. 타 구단 경쟁과 연봉 협상이 완만하게 진행됩니다.',
    rivalAggressiveness: 0.88,
    agentSelectivity: 0.92,
    tradeFairnessTolerance: 1.18,
    revenueTightness: 1.05,
    ownerExpectationStrictness: 0.9,
  },
  어려움: {
    label: '어려움 (추천)',
    recommended: true,
    description:
      '실제 KBO 프런트에 가까운 기본 추천 난이도. 상대 9개 구단의 FA·외국인·트레이드 경쟁이 치열하고, 선수 선호도와 예산 압박이 강하게 작동합니다.',
    rivalAggressiveness: 1.18,
    agentSelectivity: 1.12,
    tradeFairnessTolerance: 1.04,
    revenueTightness: 0.96,
    ownerExpectationStrictness: 1.1,
  },
  극한: {
    label: '극한',
    recommended: false,
    description:
      '치열한 샐러리캡·입찰 경쟁과 냉정한 구단주 평가. 모든 결정이 로스터와 재정에 직접적 부담을 줍니다.',
    rivalAggressiveness: 1.32,
    agentSelectivity: 1.24,
    tradeFairnessTolerance: 0.98,
    revenueTightness: 0.88,
    ownerExpectationStrictness: 1.25,
  },
};

export const OFFSEASON_12_STEPS: {
  id: OffseasonStep12;
  order: number;
  title: string;
  shortTitle: string;
  description: string;
}[] = [
  {
    id: 'FINAL_SETTLEMENT',
    order: 1,
    title: '최종 결산',
    shortTitle: '결산',
    description: '정규시즌 순위, 포스트시즌 결과, 개인 성적 및 시즌 총 수익·지출을 결산합니다.',
  },
  {
    id: 'OWNER_EVAL',
    order: 2,
    title: '구단주 시즌 평가',
    shortTitle: '구단주평가',
    description: '구단주가 단장의 성과를 평가해 유임·경고·경질 여부와 차기 시즌 예산 한도를 확정합니다.',
  },
  {
    id: 'COACH_EVAL',
    order: 3,
    title: '감독·코칭스태프 평가',
    shortTitle: '코칭평가',
    description: '감독과 4개 파트 코치의 계약 만료, 재계약 또는 교체를 결정합니다.',
  },
  {
    id: 'POWER_ANALYSIS',
    order: 4,
    title: '선수단 전력 분석',
    shortTitle: '전력분석',
    description: '포지션별 주전 전력과 취약 포지션, 차기 시즌 핵심 유망주를 진단합니다.',
  },
  {
    id: 'RESERVE_AND_RELEASE',
    order: 5,
    title: '보류선수·방출·은퇴식',
    shortTitle: '보류·은퇴',
    description: '보류선수 명단 유지, 방출 대상 정리, 프랜차이즈 스타 은퇴식을 진행합니다.',
  },
  {
    id: 'FA_MARKET',
    order: 6,
    title: 'FA 자격 및 계약 관리',
    shortTitle: 'FA시장',
    description: '내부 FA 잔류 협상, 외부 FA 경쟁 입찰, A·B·C등급 보상 및 보호명단을 처리합니다.',
  },
  {
    id: 'FOREIGN_ROSTER',
    order: 7,
    title: '외국인·아시아쿼터 구성',
    shortTitle: '외국인',
    description: '외국인 3명·아시아쿼터 1명(또는 규정 변경 한도)의 재계약과 신규 영입을 완료합니다.',
  },
  {
    id: 'TRADE_MARKET',
    order: 8,
    title: '트레이드 및 전력 보강',
    shortTitle: '트레이드',
    description: '부족한 포지션을 중심으로 시장가치 지수를 참고해 타 구단과 트레이드를 협상합니다.',
  },
  {
    id: 'SALARY_NEGOTIATION',
    order: 9,
    title: '선수 연봉 협상',
    shortTitle: '연봉협상',
    description: '재계약 대상 국내 선수들의 인상 요구와 구단 예산·샐러리캡 사이에서 연봉을 타결합니다.',
  },
  {
    id: 'ROOKIE_DEVELOPMENT',
    order: 10,
    title: '신인 계약 및 육성 계획',
    shortTitle: '신인·육성',
    description: '지명 완료된 신인 등록 상태와 육성 계획을 점검합니다. 공식 드래프트는 별도 일정에 진행됩니다.',
  },
  {
    id: 'SPRING_CAMP',
    order: 11,
    title: '스프링캠프 및 시범경기',
    shortTitle: '캠프·시범',
    description: '해외 전지훈련지와 훈련 강도를 선택하고 시범경기로 신인·후보 선수를 점검합니다.',
  },
  {
    id: 'OPENING_PREP',
    order: 12,
    title: '최종 개막 준비',
    shortTitle: '개막승인',
    description: '감독의 개막전 최종 엔트리·선발진 추천을 검토하고 단장 승인 후 차기 정규시즌을 개막합니다.',
  },
];

// =============================================================================
// 2. DETERMINISTIC HASH & PLAYER DEEP PROFILES (#2, #9, #19, #23, #24, #26)
// =============================================================================
function stableHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const KNOWN_LEFTY_PITCHERS = new Set([
  '류현진', '양현종', '김광현', '손주영', '구창모', '차우찬', '이의리', '황준서',
  '김범수', '백정현', '이승현', '김진욱', '최승용', '윤영철', '최성영', '오원석',
  '임기영', '엔스', '헤이수스', '반즈', '네일', '크로우', '에르난데스', '알칸타라',
]);

const KNOWN_SUBMARINE_PITCHERS = new Set([
  '고영표', '박종훈', '엄상백', '임기영', '정우영', '최원준', '서진용', '이태양',
]);

const KNOWN_LEFTY_BATTERS = new Set([
  '김혜성', '홍창기', '박해민', '문보경', '구자욱', '김지찬', '손아섭', '나성범',
  '최형우', '박건우', '정수빈', '강백호', '이정후', '김현수', '문현빈', '최지훈',
  '김도영', '송성문', '박민우', '서건창', '황성빈', '윤동희', '전준우', '오지환',
  '박찬호', '로하스', '페라자', '오스틴', '디아즈', '레이예스',
]);

const AGENT_DIRECTORY: { name: string; agency: string; persona: AgentPersona }[] = [
  { name: '김태훈 대표', agency: '리코스포츠에이전시', persona: '시장가치 극대화' },
  { name: '이정민 대표', agency: '브리온컴퍼니', persona: '강경 협상가' },
  { name: '박성준 이사', agency: 'MVP스포츠매니지먼트', persona: '장기보장 선호' },
  { name: '최현우 대표', agency: '그로윈스포츠', persona: '우승지향 에이전트' },
  { name: '정수현 실장', agency: '코리안베이스볼파트너스', persona: '원클럽 충성형' },
  { name: '마이클 린', agency: '보라스·퍼시픽 코리아', persona: '해외진출 전문' },
];

const ALL_HIDDEN_TRAITS: HiddenTrait[] = [
  '큰경기강세',
  '유리몸',
  '철강왕',
  '꾸준함',
  '슬로우스타터',
  '클러치히터',
  '멘탈에이스',
  '분위기메이커',
  '좌투킬러',
  '우투킬러',
];

export function buildPitchRepertoire(p: Player): PitchRepertoire {
  const h = stableHash(`${p.id}-${p.name}-pitch`);
  const realProfile = REAL_KBO_PITCHER_PROFILES[p.name];
  if (realProfile) {
    const agePenalty = p.age >= 39 ? -2.0 : p.age >= 36 ? -1.0 : 0;
    const avgVelocityKmh = Number(Math.max(130, realProfile.avgVelocityKmh + agePenalty).toFixed(1));
    const maxVelocityKmh = Number(Math.max(avgVelocityKmh + 3.0, realProfile.maxVelocityKmh + agePenalty).toFixed(1));
    const stamina =
      p.position === 'SP'
        ? Math.max(66, Math.min(96, Math.round(p.ability + 5 + ((h >> 7) % 7) - 3)))
        : Math.max(48, Math.min(82, Math.round(p.ability - 9 + ((h >> 7) % 9) - 4)));
    return {
      throws: realProfile.throws,
      avgVelocityKmh,
      maxVelocityKmh,
      command: realProfile.command,
      breakingSharpness: realProfile.breakingSharpness,
      stamina,
      pitches: realProfile.pitches.map((pt) => ({ ...pt })),
    };
  }

  const throws: PitchRepertoire['throws'] = KNOWN_SUBMARINE_PITCHERS.has(p.name)
    ? h % 2 === 0
      ? '우언'
      : '우사'
    : KNOWN_LEFTY_PITCHERS.has(p.name)
    ? '좌투'
    : h % 10 < 2
    ? '좌투'
    : '우투';

  const isHardThrower = p.position === 'CL' || p.position === 'RP' || p.ability >= 84 || p.category !== '국내';
  const baseVelo =
    throws === '우언'
      ? 135 + (h % 6)
      : throws === '우사'
      ? 141 + (h % 6)
      : (isHardThrower ? 146 : 142.5) + (p.ability - 74) * 0.24 + ((h % 50) - 25) * 0.08;
  const avgVelocityKmh = Number(Math.max(132, Math.min(155.5, baseVelo)).toFixed(1));
  const maxVelocityKmh = Number(Math.min(161.0, avgVelocityKmh + 3.5 + (h % 35) * 0.1).toFixed(1));

  const command = Math.max(48, Math.min(97, Math.round(p.ability + ((h >> 3) % 13) - 6)));
  const breakingSharpness = Math.max(48, Math.min(97, Math.round(p.ability + ((h >> 5) % 13) - 6)));
  const stamina =
    p.position === 'SP'
      ? Math.max(62, Math.min(96, Math.round(p.ability + 4 + ((h >> 7) % 9) - 4)))
      : Math.max(46, Math.min(82, Math.round(p.ability - 10 + ((h >> 7) % 11) - 5)));

  const secondaryPool: PitchTypeName[] =
    throws === '우언' || throws === '우사'
      ? ['체인지업', '커브', '슬라이더', '투심']
      : ['슬라이더', '스위퍼', '커브', '체인지업', '포크볼', '스플리터', '커터', '투심'];

  const pitchCount = p.position === 'SP' ? 4 : 3;
  const primaryType: PitchTypeName = h % 7 === 0 ? '투심' : '포심';
  const picked: PitchTypeName[] = [primaryType];
  for (let i = 0; picked.length < pitchCount && i < secondaryPool.length; i++) {
    const candidate = secondaryPool[(h + i * 3) % secondaryPool.length];
    if (!picked.includes(candidate)) picked.push(candidate);
  }

  const usages = pitchCount === 4 ? [44, 24, 18, 14] : [52, 30, 18];
  const pitches: PitchGrade[] = picked.map((name, idx) => ({
    name,
    grade: Math.max(
      48,
      Math.min(
        98,
        Math.round(
          (idx === 0 ? (avgVelocityKmh - 135) * 2.2 + 52 : breakingSharpness) +
            (((h >> (idx + 2)) % 9) - 4)
        )
      )
    ),
    usagePct: usages[idx] ?? 15,
  }));

  return {
    throws,
    avgVelocityKmh,
    maxVelocityKmh,
    command,
    breakingSharpness,
    stamina,
    pitches,
  };
}

export function buildBattingProfile(p: Player): BattingProfile {
  const h = stableHash(`${p.id}-${p.name}-bat`);
  const realBat = REAL_KBO_BATTER_PROFILES[p.name];

  const bats: BattingProfile['bats'] = realBat
    ? realBat.bats
    : p.name.includes('로하스') || p.name.includes('스위치') || h % 17 === 0
    ? '양타'
    : KNOWN_LEFTY_BATTERS.has(p.name) || h % 10 < 4
    ? '좌타'
    : '우타';

  const sprayRoll = h % 3;
  const sprayTendency: BattingProfile['sprayTendency'] = realBat
    ? realBat.sprayTendency
    : sprayRoll === 0
    ? '당겨치기'
    : sprayRoll === 1
    ? '스프레이'
    : '밀어치기';
  const pullPct = sprayTendency === '당겨치기' ? 46 + (h % 8) : sprayTendency === '스프레이' ? 36 + (h % 6) : 28 + (h % 6);
  const oppoPct = sprayTendency === '밀어치기' ? 35 + (h % 7) : sprayTendency === '스프레이' ? 28 + (h % 5) : 20 + (h % 5);
  const centerPct = Math.max(18, 100 - pullPct - oppoPct);

  const vsLeftEdge = bats === '우타' ? 2 + (h % 5) : bats === '양타' ? 2 + (h % 4) : -4 + (h % 7);
  const vsRightEdge = bats === '좌타' ? 2 + ((h >> 2) % 5) : bats === '양타' ? 2 + ((h >> 2) % 4) : -2 + ((h >> 2) % 6);
  const rispClutch = Math.max(-5, Math.min(10, Math.round((p.ability - 75) * 0.25 + ((h >> 4) % 9) - 4)));
  const vsBreaking = Math.max(52, Math.min(95, Math.round(p.ability + ((h >> 6) % 11) - 5)));

  if (realBat) {
    return {
      bats,
      sprayTendency,
      pullPct,
      centerPct,
      oppoPct,
      vsLeftEdge,
      vsRightEdge,
      rispClutch,
      vsBreaking,
      avgExitVelocityKmh: realBat.avgExitVelocityKmh,
      maxExitVelocityKmh: realBat.maxExitVelocityKmh,
      launchAngleDeg: realBat.launchAngleDeg,
      barrelPct: realBat.barrelPct,
      hardHitPct: realBat.hardHitPct,
      sprintSpeedMs: realBat.sprintSpeedMs,
    };
  }

  // 포지션·능력치·외국인 타자 특성 기반 현실적 KBO 트랙맨 타구 지표 산출
  const powerPos =
    p.position === '1B' || p.position === '3B' || p.position === 'DH' || p.position === 'RF' || p.position === 'LF';
  const fastPos = p.position === 'CF' || p.position === 'SS' || p.position === '2B';
  const foreignPowerBonus = p.category !== '국내' ? 2.4 : 0;
  const rawAvgEv =
    139.2 +
    (p.ability - 70) * 0.42 +
    (powerPos ? 2.1 : fastPos ? -1.4 : 0) +
    foreignPowerBonus +
    ((h % 40) - 20) * 0.12;
  const avgExitVelocityKmh = Number(Math.max(133.5, Math.min(153.5, rawAvgEv)).toFixed(1));
  const maxExitVelocityKmh = Number(
    Math.max(avgExitVelocityKmh + 22, Math.min(183.5, avgExitVelocityKmh + 26.5 + (h % 50) * 0.1)).toFixed(1)
  );
  const launchAngleDeg = Number(
    Math.max(
      7.5,
      Math.min(20.5, (powerPos ? 14.5 : fastPos ? 10.6 : 12.6) + ((h % 36) - 18) * 0.18)
    ).toFixed(1)
  );
  const barrelPct = Number(
    Math.max(2.2, Math.min(18.5, 4.5 + (avgExitVelocityKmh - 139) * 0.85 + (powerPos ? 1.6 : 0))).toFixed(1)
  );
  const hardHitPct = Number(
    Math.max(25.0, Math.min(55.0, 32.0 + (avgExitVelocityKmh - 138) * 1.45)).toFixed(1)
  );
  const sprintSpeedMs = Number(
    Math.max(
      7.3,
      Math.min(
        9.2,
        (fastPos ? 8.55 : p.position === 'C' || p.position === '1B' || p.position === 'DH' ? 7.75 : 8.15) -
          Math.max(0, p.age - 30) * 0.05 +
          ((h % 16) - 8) * 0.04
      )
    ).toFixed(1)
  );

  return {
    bats,
    sprayTendency,
    pullPct,
    centerPct,
    oppoPct,
    vsLeftEdge,
    vsRightEdge,
    rispClutch,
    vsBreaking,
    avgExitVelocityKmh,
    maxExitVelocityKmh,
    launchAngleDeg,
    barrelPct,
    hardHitPct,
    sprintSpeedMs,
  };
}

export function buildHiddenTrait(p: Player): HiddenTrait {
  const h = stableHash(`${p.id}-${p.name}-trait`);
  if ((p.injuryHistoryCount ?? 0) >= 2) return '유리몸';
  if (p.role === '투수') {
    const pitcherTraits: HiddenTrait[] = [
      '큰경기강세',
      '철강왕',
      '꾸준함',
      '슬로우스타터',
      '멘탈에이스',
      '분위기메이커',
      '유리몸',
    ];
    return pitcherTraits[h % pitcherTraits.length];
  }
  return ALL_HIDDEN_TRAITS[h % ALL_HIDDEN_TRAITS.length];
}

export function buildPlayerAgent(p: Player): PlayerAgent {
  const h = stableHash(`${p.id}-${p.name}-agent`);
  let chosen = AGENT_DIRECTORY[h % AGENT_DIRECTORY.length];
  if (p.ability >= 86 && p.age <= 27 && p.category === '국내' && h % 3 === 0) {
    chosen = AGENT_DIRECTORY[5]; // 해외진출 전문
  }
  const greedFactor =
    chosen.persona === '강경 협상가' || chosen.persona === '시장가치 극대화'
      ? Number((1.08 + (h % 14) * 0.01).toFixed(2))
      : chosen.persona === '원클럽 충성형'
      ? Number((0.93 + (h % 8) * 0.01).toFixed(2))
      : Number((0.98 + (h % 12) * 0.01).toFixed(2));

  return {
    name: chosen.name,
    agency: chosen.agency,
    persona: chosen.persona,
    greedFactor,
    prefersContender: chosen.persona === '우승지향 에이전트' || (p.age >= 30 && h % 2 === 0),
    prefersBigMarket: chosen.persona === '시장가치 극대화' || h % 4 === 0,
    prefersPlayingTime: p.age <= 26 || h % 3 === 0,
    loyaltyScore:
      chosen.persona === '원클럽 충성형'
        ? 82 + (h % 16)
        : chosen.persona === '강경 협상가'
        ? 35 + (h % 25)
        : 52 + (h % 32),
  };
}

export function buildLeagueEnvironment(season: number, seed: number): LeagueEnvironmentState {
  const h = stableHash(`kbo-env-${season}-${seed}`);
  const hMicro = stableHash(`kbo-env-micro-${season}-${seed}`);
  // 2026 starts balanced; subsequent seasons shift naturally among 투고타저 / 균형 / 타고투저
  // with subtle deterministic per-season hitting/pitching micro-variation
  if (season === 2026) {
    return {
      season,
      regime: '균형',
      ballCOR: 0.415,
      runMultiplier: 1.0,
      hrMultiplier: 1.0,
      note: '표준 KBO 공인구 반발계수(0.415)와 중립 스트라이크존이 유지되는 균형 시즌입니다.',
    };
  }
  const microRun = ((hMicro % 5) - 2) * 0.006; // -0.012 ~ +0.012
  const microHr = (((hMicro >>> 4) % 5) - 2) * 0.01; // -0.02 ~ +0.02
  const microCor = ((hMicro % 3) - 1) * 0.001; // -0.001 ~ +0.001
  const roll = h % 3;
  if (roll === 0) {
    const runMult = Number(Math.max(0.93, Math.min(0.97, 0.945 + microRun)).toFixed(3));
    const hrMult = Number(Math.max(0.87, Math.min(0.93, 0.895 + microHr)).toFixed(3));
    const cor = Number((0.411 + microCor).toFixed(3));
    return {
      season,
      regime: '투고타저',
      ballCOR: cor,
      runMultiplier: runMult,
      hrMultiplier: hrMult,
      note: `공인구 반발계수(${cor.toFixed(3)}) 소폭 하락 및 ABS 스트라이크존 안정화로 투수 친화 환경이 형성되었습니다.`,
    };
  }
  if (roll === 2) {
    const runMult = Number(Math.max(1.03, Math.min(1.07, 1.055 + microRun)).toFixed(3));
    const hrMult = Number(Math.max(1.09, Math.min(1.14, 1.12 + microHr)).toFixed(3));
    const cor = Number((0.42 + microCor).toFixed(3));
    return {
      season,
      regime: '타고투저',
      ballCOR: cor,
      runMultiplier: runMult,
      hrMultiplier: hrMult,
      note: `공인구 반발력(${cor.toFixed(3)}) 상승 및 타자 친화 존 적용으로 장타와 득점이 증가하는 시즌입니다.`,
    };
  }
  const runMult = Number(Math.max(0.985, Math.min(1.015, 1.0 + microRun)).toFixed(3));
  const hrMult = Number(Math.max(0.97, Math.min(1.03, 1.0 + microHr)).toFixed(3));
  const cor = Number((0.415 + microCor).toFixed(3));
  return {
    season,
    regime: '균형',
    ballCOR: cor,
    runMultiplier: runMult,
    hrMultiplier: hrMult,
    note: `표준 KBO 공인구 반발계수(${cor.toFixed(3)})와 중립 스트라이크존이 유지되는 균형 시즌입니다.`,
  };
}

// Official KBO Competitive Balance Cap schedule is re-exported from ./salaryCapEngine
// (2026: 143억 9,723만 원, 2027: 151억 1,709만 원, 2028: 158억 7,294만 원)

export function getTeamOwnerBudgetCapBillion(teamId: TeamId): number {
  const map: Record<TeamId, number> = {
    LG: 155,
    삼성: 148,
    SSG: 146,
    KIA: 145,
    한화: 144,
    롯데: 142,
    두산: 136,
    KT: 132,
    NC: 124,
    키움: 105,
  };
  return map[teamId] ?? 135;
}

// =============================================================================
// 3. ENSURE HYDRATION ON ANY SAVE (#1-#40)
// =============================================================================
export function ensureDeepFranchiseState(career: CareerSave): void {
  // #39: Remove 선동열 manager from active coaches & FA coaches
  if (career.faCoaches) {
    career.faCoaches = career.faCoaches.filter((c) => c.name !== '선동열');
  }
  for (const tid of TEAM_IDS) {
    if (career.coaches[tid]) {
      career.coaches[tid] = career.coaches[tid].filter((c) => c.name !== '선동열');
    }
  }

  // #6: Default difficulty = '어려움'
  if (!career.difficulty) {
    career.difficulty = '어려움';
  }

  // #20: Season League Environment
  if (!career.leagueEnv || career.leagueEnv.season !== career.season) {
    career.leagueEnv = buildLeagueEnvironment(career.season, career.seed);
  }

  // #29: Trade Deadline (7월 31일 = 100G)
  if (!career.tradeDeadlineRound) {
    career.tradeDeadlineRound = 100;
  }

  // #4: Facility Condition
  if (!career.finances.facilityCondition) {
    career.finances.facilityCondition = {
      stadium: 88,
      academy: 86,
      medical: 86,
      marketing: 88,
      lastMaintSeason: career.season,
    };
  }
  if (career.finances.ownerBudgetCapBillion === undefined) {
    career.finances.ownerBudgetCapBillion = getTeamOwnerBudgetCapBillion(career.playerTeamId);
  }
  if (career.finances.salaryCapExceedStreak === undefined) {
    career.finances.salaryCapExceedStreak = 0;
  }
  ensureCompetitiveBalanceState(career);
  ensureClubLegendsHallOfFameInPlace(career);
  if (career.analyticsStaffBonus === undefined) {
    career.analyticsStaffBonus = 3;
  }

  // Hydrate players (#2, #10, #19, #23, #24, #26 + Real KBO TrackMan/Statcast)
  for (const p of Object.values(career.players)) {
    if (p.role === '투수' && (!p.pitchRepertoire || REAL_KBO_PITCHER_PROFILES[p.name])) {
      if (!p.pitchRepertoire) {
        p.pitchRepertoire = buildPitchRepertoire(p);
      }
    }
    if (p.role === '타자' && (!p.battingProfile || p.battingProfile.avgExitVelocityKmh === undefined)) {
      p.battingProfile = buildBattingProfile(p);
    }
    if (!p.hiddenTrait) {
      p.hiddenTrait = buildHiddenTrait(p);
    }
    if (!p.agent) {
      p.agent = buildPlayerAgent(p);
    }
    if (p.registrationDays === undefined) {
      p.registrationDays = Math.max(0, p.serviceYears * 145 + (p.rosterTier === '1군' ? 20 : 0));
    }
    if (p.clubTenureSeasons === undefined) {
      p.clubTenureSeasons = getPlayerClubTenureSeasons(p);
    }
    if (!p.overuse) {
      p.overuse = {
        consecutiveStarts: 0,
        consecutivePitchDays: 0,
        highPitchCountGames: 0,
        recent7dPitches: 0,
        riskLevel: '정상',
      };
    }
    if (!p.overseasInterest) {
      if (p.category === '국내' && p.ability >= 85 && p.age <= 28 && p.serviceYears >= 5) {
        p.overseasInterest = '적극희망';
      } else if (p.category === '국내' && p.ability >= 81 && p.age <= 27) {
        p.overseasInterest = '관심';
      } else {
        p.overseasInterest = '없음';
      }
    }
    if (!p.potentialTrend) {
      p.potentialTrend = '안정';
    }
    if (p.isReserveListed === undefined) {
      p.isReserveListed = p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적';
    }
  }

  // #3: Hydrate team leadership, captains & club reputation
  for (const tid of TEAM_IDS) {
    const ts = career.teams[tid];
    if (!ts) continue;
    if (ts.clubReputation === undefined) {
      ts.clubReputation = Math.max(55, Math.min(90, Math.round(58 + (ts.popularity - 55) * 0.6)));
    }
    if (!ts.leadership || !ts.leadership.captainPlayerId || !career.players[ts.leadership.captainPlayerId]) {
      const candidates = Object.values(career.players)
        .filter((p) => p.teamId === tid && p.rosterTier === '1군' && p.category === '국내')
        .sort((a, b) => b.age * 1.4 + b.ability - (a.age * 1.4 + a.ability));
      const captain = candidates[0] ?? null;
      ts.leadership = {
        captainPlayerId: captain?.id ?? null,
        veteranLeadership: 74,
        managerRelation: 76,
        rookieAdaptationBonus: 2,
      };
    }
    recalculateTeamLeadership(career, tid);
  }

  // #14/#15: Hydrate Spring Camp
  if (!career.springCamp || career.springCamp.season !== career.season) {
    career.springCamp = {
      season: career.season,
      location: null,
      intensity: '균형',
      costBillion: 0,
      invitedProspectIds: [],
      campCompleted: false,
      exhibitionGames: [],
    };
  }

  // #10: Hydrate overseas return candidates & remove any players already active in KBO (prevent KBO/overseas duplicates)
  const activeKboPlayerNames = new Set(
    Object.values(career.players)
      .filter((p) => p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적')
      .map((p) => p.name)
  );
  if (!career.overseasReturnPool) {
    career.overseasReturnPool = buildInitialOverseasReturnPool(career.season).filter(
      (c) => !activeKboPlayerNames.has(c.playerName)
    );
  } else {
    career.overseasReturnPool = career.overseasReturnPool.filter(
      (cand) => cand.signed || !activeKboPlayerNames.has(cand.playerName)
    );
    for (const cand of career.overseasReturnPool) {
      if (cand.signed) continue;
      if (cand.playerName === '박효준' || cand.playerName === '배지환') {
        cand.originalKboTeamId = null;
        cand.returnPath = '해외직행(원소속없음)';
      }
    }
  }
  syncEligibleAlumniToOverseasReturnPoolInPlace(career);
  if (!career.incomingTradeOffers) career.incomingTradeOffers = [];
  if (!career.staffPoachingOffers) career.staffPoachingOffers = [];
  if (!career.gmJobOffers) career.gmJobOffers = [];
  if (!career.retirementCeremonies) career.retirementCeremonies = [];
  if (!career.completedOffseasonSteps12) career.completedOffseasonSteps12 = [];
  if (!career.offseasonStep12) career.offseasonStep12 = 'FINAL_SETTLEMENT';
}

function buildInitialOverseasReturnPool(season: number): OverseasReturnCandidate[] {
  return [
    {
      id: `ovr-ret-2-${season}`,
      playerName: '박효준',
      originalKboTeamId: null,
      returnPath: '해외직행(원소속없음)',
      role: '타자',
      position: '2B',
      age: 30 + Math.max(0, season - 2026),
      ability: 76,
      potential: 78,
      overseasClub: '미국 독립리그 · 마이너 FA',
      overseasSummary: '고교 졸업 후 MLB 직행 · KBO 원소속 구단 없음 (전 구단 동등 조건 영입 가능)',
      demandedYears: 3,
      demandedTotalBillion: 20,
    },
    {
      id: `ovr-ret-3-${season}`,
      playerName: '배지환',
      originalKboTeamId: null,
      returnPath: '해외직행(원소속없음)',
      role: '타자',
      position: 'CF',
      age: 27 + Math.max(0, season - 2026),
      ability: 76,
      potential: 80,
      overseasClub: 'MLB 밀워키 브루어스 · AAA',
      overseasSummary: '고교 졸업 후 MLB 직행 · KBO 원소속 구단 없음 (최상위 주루·컨택 리드오프)',
      demandedYears: 4,
      demandedTotalBillion: 38,
    },
  ];
}

// =============================================================================
// 4. CAPTAIN & LEADERSHIP (#3)
// =============================================================================
export function recalculateTeamLeadership(career: CareerSave, teamId: TeamId): TeamLeadershipState {
  const ts = career.teams[teamId];
  const teamPlayers = Object.values(career.players).filter(
    (p) => p.teamId === teamId && p.rosterTier === '1군'
  );
  const captain = ts.leadership?.captainPlayerId ? career.players[ts.leadership.captainPlayerId] : null;
  const veterans = teamPlayers.filter((p) => p.age >= 31);
  const moodMakers = teamPlayers.filter((p) => p.hiddenTrait === '분위기메이커').length;
  const manager = (career.coaches[teamId] ?? []).find((c) => c.role === '감독');

  const capFranchise = captain ? evaluateFranchiseStar(career, captain) : null;
  const franchiseCaptainBonus =
    capFranchise?.tier === '레전드'
      ? 10
      : capFranchise?.tier === '핵심 프랜차이즈'
      ? 6
      : capFranchise?.tier === '준프랜차이즈'
      ? 3
      : 0;

  const capScore = captain
    ? Math.min(
        40,
        Math.round(
          captain.age * 0.55 +
            captain.ability * 0.16 +
            (captain.morale === '만족' ? 4 : captain.morale === '불만' ? -6 : 0) +
            franchiseCaptainBonus
        )
      )
    : 12;
  const vetScore = Math.min(35, veterans.length * 5 + moodMakers * 4);
  const mgrScore = manager ? Math.round(((manager.subRatings?.leadership ?? manager.ability) - 65) * 0.9) : 8;

  const veteranLeadership = Math.max(40, Math.min(99, 32 + capScore + Math.round(vetScore * 0.8)));
  const managerRelation = Math.max(
    40,
    Math.min(
      99,
      62 + mgrScore + (ts.atmosphere === '좋음' ? 8 : ts.atmosphere === '나쁨' ? -10 : 0) + moodMakers * 2
    )
  );
  const rookieAdaptationBonus = Math.max(
    -2,
    Math.min(
      5,
      Math.round((veteranLeadership + managerRelation - 135) / 14) +
        (capFranchise?.tier === '레전드' ? 1 : 0)
    )
  );

  ts.leadership = {
    captainPlayerId: captain && captain.teamId === teamId && captain.rosterTier !== '은퇴' ? captain.id : null,
    veteranLeadership,
    managerRelation,
    rookieAdaptationBonus,
  };
  return ts.leadership;
}

export function setTeamCaptain(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const p = next.players[playerId];
  if (!p || p.teamId !== next.playerTeamId) {
    throw new Error('우리 구단 소속 선수만 주장으로 선임할 수 있습니다.');
  }
  if (p.rosterTier !== '1군') {
    throw new Error('1군 엔트리 등록 선수만 주장으로 선임할 수 있습니다.');
  }
  const ts = next.teams[next.playerTeamId];
  const franchiseAssess = evaluateFranchiseStar(next, p);
  ts.leadership = {
    ...(ts.leadership ?? { captainPlayerId: null, veteranLeadership: 70, managerRelation: 70, rookieAdaptationBonus: 1 }),
    captainPlayerId: p.id,
  };
  p.morale = '만족';
  recalculateTeamLeadership(next, next.playerTeamId);
  if (
    (ts.leadership.veteranLeadership >= 80 ||
      franchiseAssess.tier === '레전드' ||
      franchiseAssess.tier === '핵심 프랜차이즈') &&
    ts.atmosphere !== '좋음'
  ) {
    ts.atmosphere = ts.atmosphere === '나쁨' ? '보통' : '좋음';
  }
  if (franchiseAssess.tier !== '일반') {
    ts.fanSentiment = Math.min(100, (ts.fanSentiment ?? 65) + (franchiseAssess.tier === '레전드' ? 4 : 2));
  }
  next.transactionLogs.unshift({
    id: `tx-cap-${Date.now()}`,
    date: `${next.season}-04-01`,
    type: '엔트리',
    teamId: next.playerTeamId,
    summary: `선수단 주장 선임: ${p.name} (${p.position} · ${franchiseAssess.tier !== '일반' ? `${franchiseAssess.tier} · ` : ''}만 ${p.age}세)`,
    detail: `리더십 지수 ${ts.leadership.veteranLeadership} · 분위기 ${ts.atmosphere} · 감독 관계 ${ts.leadership.managerRelation} · 신인 적응 +${ts.leadership.rookieAdaptationBonus}`,
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

// =============================================================================
// 5. FACILITY DEGRADATION & MAINTENANCE (#4)
// =============================================================================
export function degradeFacilitiesPerSeries(career: CareerSave, seriesFraction: number): void {
  ensureDeepFranchiseState(career);
  const fc = career.finances.facilityCondition!;
  const rate = seriesFraction * 0.42; // ~20% wear per full 48-series season
  fc.stadium = Math.max(25, Number((fc.stadium - rate * 1.15).toFixed(1)));
  fc.academy = Math.max(25, Number((fc.academy - rate * 0.95).toFixed(1)));
  fc.medical = Math.max(25, Number((fc.medical - rate * 1.0).toFixed(1)));
  fc.marketing = Math.max(25, Number((fc.marketing - rate * 0.85).toFixed(1)));
}

export function getFacilityEffectivenessMult(condition: number | undefined): number {
  const c = condition ?? 85;
  if (c >= 80) return 1.0;
  if (c >= 60) return 0.85;
  if (c >= 40) return 0.65;
  return 0.45;
}

export function repairFacility(
  career: CareerSave,
  target: keyof Omit<FacilityConditionState, 'lastMaintSeason'>
): { nextCareer: CareerSave; backupSnapshot: CareerSave; costBillion: number } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const fc = next.finances.facilityCondition!;
  const cur = fc[target];
  if (cur >= 96) {
    throw new Error('이미 최상 컨디션 상태여서 유지보수가 필요하지 않습니다.');
  }
  const missing = 100 - cur;
  const baseRate = target === 'stadium' ? 0.14 : target === 'academy' ? 0.1 : target === 'medical' ? 0.1 : 0.08;
  const costBillion = Number(Math.max(1.5, missing * baseRate).toFixed(2));
  if ((next.finances.cashBalanceBillion ?? 0) < costBillion) {
    throw new Error(`유지보수 비용(${costBillion}억 원)이 부족합니다.`);
  }

  next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - costBillion).toFixed(2));
  next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + costBillion).toFixed(2));
  next.finances.maintenanceExpenseBillion = Number(((next.finances.maintenanceExpenseBillion ?? 0) + costBillion).toFixed(2));
  fc[target] = 100;
  fc.lastMaintSeason = next.season;

  const labelMap = {
    stadium: '홈 경기장 시설',
    academy: '훈련장·아카데미',
    medical: '구단 의료·재활센터',
    marketing: 'MD·팬 편의시설',
  };
  next.transactionLogs.unshift({
    id: `tx-maint-${Date.now()}`,
    date: `${next.season}-05-01`,
    type: '재정',
    teamId: next.playerTeamId,
    summary: `${labelMap[target]} 대보수 완료 (컨디션 100% 회복 · ${costBillion}억 원)`,
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, costBillion };
}

// =============================================================================
// 6. PITCH REPERTOIRE & WEATHER & OVERUSE IN-GAME ENGINE (#2, #16, #19, #24)
// =============================================================================
export function generateGameWeather(homeTeam: TeamId, dateStr: string, rng: SeededRng): GameWeather {
  if (homeTeam === '키움') {
    return {
      condition: '돔구장',
      tempC: 22,
      windDir: '무풍',
      windKmh: 0,
      hrMult: 1.0,
      xbhMult: 1.0,
      pitchControlDelta: 0.4,
      summary: '고척 스카이돔 · 22°C · 실내 무풍 (기상 변수 없음)',
    };
  }
  const month = Number(dateStr.split('-')[1] ?? 5);
  const baseTemp =
    month <= 4 ? 15 : month === 5 ? 21 : month === 6 ? 25 : month <= 8 ? 30 : month === 9 ? 23 : 16;
  const tempC = Math.round(baseTemp + (rng.next() - 0.5) * 7);

  const condRoll = rng.next();
  let condition: GameWeather['condition'] = '맑음';
  if (condRoll < 0.52) condition = '맑음';
  else if (condRoll < 0.78) condition = '흐림';
  else if (condRoll < 0.89) condition = '강풍';
  else if (condRoll < 0.95) condition = '안개';
  else condition = '소나기';

  const windRoll = rng.next();
  const windDir: GameWeather['windDir'] =
    condition === '강풍'
      ? windRoll < 0.45
        ? '외야뒷바람'
        : windRoll < 0.85
        ? '외야맞바람'
        : '횡풍'
      : windRoll < 0.3
      ? '외야뒷바람'
      : windRoll < 0.6
      ? '외야맞바람'
      : windRoll < 0.85
      ? '횡풍'
      : '무풍';
  const windKmh =
    windDir === '무풍'
      ? 2
      : condition === '강풍'
      ? rng.int(22, 36)
      : rng.int(6, 18);

  let hrMult = 1.0;
  let xbhMult = 1.0;
  let pitchControlDelta = 0;

  if (windDir === '외야뒷바람') {
    hrMult += windKmh >= 20 ? 0.14 : 0.06;
    xbhMult += 0.04;
  } else if (windDir === '외야맞바람') {
    hrMult -= windKmh >= 20 ? 0.13 : 0.05;
    xbhMult -= 0.03;
  }
  if (tempC >= 29) hrMult += 0.05;
  else if (tempC <= 13) hrMult -= 0.05;

  if (condition === '소나기' || condition === '안개') {
    pitchControlDelta -= 1.2;
  } else if (condition === '강풍') {
    pitchControlDelta -= 0.7;
  }

  const summary = `${condition} · ${tempC}°C · ${windDir} ${windKmh}km/h`;
  return {
    condition,
    tempC,
    windDir,
    windKmh,
    hrMult: Number(hrMult.toFixed(2)),
    xbhMult: Number(xbhMult.toFixed(2)),
    pitchControlDelta: Number(pitchControlDelta.toFixed(2)),
    summary,
  };
}

export function computePitcherBatterMatchupEdge(
  pitcher: Player,
  lineup: Player[],
  isPostseason: boolean
): { pitcherEdge: number; hrFactor: number; kFactor: number } {
  const rep = pitcher.pitchRepertoire ?? buildPitchRepertoire(pitcher);
  const topPitch = Math.max(...rep.pitches.map((x) => x.grade), 70);
  const isLeftyPit = rep.throws === '좌투';

  let batterAdvantageSum = 0;
  let breakingMismatch = 0;
  for (const b of lineup) {
    const bp = b.battingProfile ?? buildBattingProfile(b);
    const platoon = isLeftyPit ? bp.vsLeftEdge : bp.vsRightEdge;
    batterAdvantageSum += platoon * 0.25;
    breakingMismatch += (rep.breakingSharpness - bp.vsBreaking) * 0.06;
    if (isPostseason && b.hiddenTrait === '큰경기강세') batterAdvantageSum += 2.2;
    if (b.hiddenTrait === '클러치히터') batterAdvantageSum += 0.9;
    if (isLeftyPit && b.hiddenTrait === '좌투킬러') batterAdvantageSum += 2.0;
    if (!isLeftyPit && b.hiddenTrait === '우투킬러') batterAdvantageSum += 2.0;
  }
  const avgBatAdv = batterAdvantageSum / Math.max(1, lineup.length);
  const avgBreakEdge = breakingMismatch / Math.max(1, lineup.length);

  let pitcherEdge =
    (rep.avgVelocityKmh - 144) * 0.14 +
    (rep.command - 75) * 0.08 +
    (topPitch - 76) * 0.07 +
    avgBreakEdge -
    avgBatAdv;

  if (isPostseason && (pitcher.hiddenTrait === '큰경기강세' || pitcher.hiddenTrait === '멘탈에이스')) {
    pitcherEdge += 2.1;
  }

  // Overuse penalty on pitcher
  if (pitcher.overuse?.riskLevel === '위험') pitcherEdge -= 2.4;
  else if (pitcher.overuse?.riskLevel === '주의') pitcherEdge -= 1.0;

  const hrFactor = Math.max(0.84, Math.min(1.18, 1 - (rep.command - 75) * 0.004 - (rep.avgVelocityKmh - 144) * 0.005));
  const kFactor = Math.max(0.82, Math.min(1.25, 1 + (rep.avgVelocityKmh - 144) * 0.014 + (rep.breakingSharpness - 75) * 0.007));

  return {
    pitcherEdge: Number(Math.max(-5, Math.min(5, pitcherEdge)).toFixed(2)),
    hrFactor: Number(hrFactor.toFixed(3)),
    kFactor: Number(kFactor.toFixed(3)),
  };
}

export function updateOveruseAfterGame(
  career: CareerSave,
  teamId: TeamId,
  playedBatterIds: Set<string>,
  pitchedStats: { playerId: string; isStarter: boolean; pitchCount: number }[]
): void {
  const pitchedMap = new Map(pitchedStats.map((x) => [x.playerId, x]));
  for (const p of Object.values(career.players)) {
    if (p.teamId !== teamId || p.rosterTier !== '1군') continue;
    if (!p.overuse) {
      p.overuse = {
        consecutiveStarts: 0,
        consecutivePitchDays: 0,
        highPitchCountGames: 0,
        recent7dPitches: 0,
        riskLevel: '정상',
      };
    }

    // Registration days increment for active 1군 players (#26)
    if (p.gameDayActive && !p.injury) {
      p.registrationDays = (p.registrationDays ?? 0) + 1;
    }

    if (p.role === '타자') {
      if (playedBatterIds.has(p.id)) {
        p.overuse.consecutiveStarts += 1;
      } else {
        p.overuse.consecutiveStarts = 0;
      }
      const isCatcher = p.position === 'C';
      const warnThr = isCatcher ? 7 : 18;
      const dangerThr = isCatcher ? 11 : 28;
      p.overuse.riskLevel =
        p.overuse.consecutiveStarts >= dangerThr || p.fatigue >= 78
          ? '위험'
          : p.overuse.consecutiveStarts >= warnThr || p.fatigue >= 60
          ? '주의'
          : '정상';
    } else {
      const pit = pitchedMap.get(p.id);
      if (pit) {
        p.overuse.consecutivePitchDays += 1;
        p.overuse.recent7dPitches = Math.min(260, Math.round(p.overuse.recent7dPitches * 0.85 + pit.pitchCount));
        if (pit.isStarter && pit.pitchCount >= 105) {
          p.overuse.highPitchCountGames += 1;
        }
      } else {
        p.overuse.consecutivePitchDays = 0;
        p.overuse.recent7dPitches = Math.max(0, Math.round(p.overuse.recent7dPitches * 0.78));
      }
      p.overuse.riskLevel =
        p.overuse.consecutivePitchDays >= 3 || p.overuse.recent7dPitches >= 135 || p.fatigue >= 80
          ? '위험'
          : p.overuse.consecutivePitchDays >= 2 || p.overuse.recent7dPitches >= 95 || p.fatigue >= 62
          ? '주의'
          : '정상';
    }
  }
}

// =============================================================================
// 7. MEDICAL REHAB & CLEARANCE (#21)
// =============================================================================
export function updateMedicalRehabProgress(p: Player): void {
  if (!p.injury) return;
  const total = Math.max(1, p.injury.daysTotal);
  const done = Math.max(0, total - p.injury.daysRemaining);
  const pct = Math.min(100, Math.round((done / total) * 100));
  p.injury.rehabProgress = pct;
  if (p.injury.daysRemaining <= 0 || pct >= 100) {
    p.injury.medicalClearance = '완전회복';
  } else if (pct >= 68) {
    p.injury.medicalClearance = '조기복귀가능';
  } else {
    p.injury.medicalClearance = '재활중';
  }
}

export function decideMedicalReturn(
  career: CareerSave,
  playerId: string,
  mode: 'early' | 'full'
): { nextCareer: CareerSave; backupSnapshot: CareerSave; message: string } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const p = next.players[playerId];
  if (!p || !p.injury) {
    throw new Error('현재 부상 재활 중인 선수가 아닙니다.');
  }
  updateMedicalRehabProgress(p);

  if (mode === 'early') {
    if ((p.injury.rehabProgress ?? 0) < 60) {
      throw new Error('재활 진행도 60% 미만 상태에서는 의료진이 조기 복귀를 승인할 수 없습니다.');
    }
    p.injury = null;
    p.fatigue = Math.min(85, p.fatigue + 28);
    p.form = Math.max(-4, p.form - 1);
    p.injuryHistoryCount = (p.injuryHistoryCount ?? 0) + 1;
    p.rehabGamesLeft = 0;
    const msg = `${p.name} 조기 복귀 강행 승인 — 즉시 출장 가능하지만 재발 위험과 피로도(+28)가 상승했습니다.`;
    next.transactionLogs.unshift({
      id: `tx-med-early-${Date.now()}`,
      date: `${next.season}-06-01`,
      type: '엔트리',
      teamId: next.playerTeamId,
      summary: msg,
    });
    next.updatedAt = new Date().toISOString();
    return { nextCareer: next, backupSnapshot, message: msg };
  }

  // Full clearance (wait until healed or complete rehab clinic)
  if (p.injury.daysRemaining > 3) {
    const rehabCost = 1.2;
    if ((next.finances.cashBalanceBillion ?? 0) < rehabCost) {
      throw new Error(`집중 재활 승인 비용(${rehabCost}억 원)이 부족합니다.`);
    }
    next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - rehabCost).toFixed(2));
    next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + rehabCost).toFixed(2));
    p.injury.daysRemaining = Math.max(1, p.injury.daysRemaining - 5);
    updateMedicalRehabProgress(p);
    const msg = `${p.name} 구단 메디컬 집중 재활 적용 — 잔여 복귀 기간 ${p.injury.daysRemaining}일로 단축 (재발 위험 최소화).`;
    next.updatedAt = new Date().toISOString();
    return { nextCareer: next, backupSnapshot, message: msg };
  }

  p.injury = null;
  p.fatigue = Math.max(0, p.fatigue - 10);
  p.morale = '만족';
  const msg = `${p.name} 의료진 완전 회복 최종 승인 — 안전하게 1군 복귀가 가능합니다.`;
  next.transactionLogs.unshift({
    id: `tx-med-full-${Date.now()}`,
    date: `${next.season}-06-01`,
    type: '엔트리',
    teamId: next.playerTeamId,
    summary: msg,
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, message: msg };
}

// =============================================================================
// 8. PLAYER MARKET VALUATION INDEX (#12, #32)
// =============================================================================
export function computePlayerTradeValue(p: Player): {
  index: number; // 10..1000
  tierLabel: '프랜차이즈 S' | '핵심 주전 A' | '주전급 B' | '유망주/준주전 C' | '백업/육성 D';
  breakdown: string;
} {
  const baseAbility = Math.pow(Math.max(40, p.ability) - 35, 1.48);
  const potentialUpside =
    p.age <= 24
      ? Math.max(0, p.potential - p.ability) * 14
      : p.age <= 27
      ? Math.max(0, p.potential - p.ability) * 7
      : 0;
  const ageMultiplier =
    p.age <= 23
      ? 1.18
      : p.age <= 27
      ? 1.14
      : p.age <= 30
      ? 1.0
      : p.age <= 33
      ? 0.84
      : p.age <= 36
      ? 0.65
      : 0.48;
  const posScarcity =
    p.position === 'C' || p.position === 'SS' || p.position === 'SP'
      ? 1.12
      : p.position === 'CF' || p.position === 'CL'
      ? 1.07
      : 1.0;

  // Performance modifier
  let perfMod = 1.0;
  if (p.role === '타자') {
    const b = p.stats as BatterStats;
    if ((b.AB ?? 0) >= 60) {
      const ops = calcOPS(b) ?? 0.72;
      perfMod = Math.max(0.82, Math.min(1.22, 1 + (ops - 0.74) * 0.7));
    }
  } else {
    const ps = p.stats as PitcherStats;
    if ((ps.outs ?? 0) >= 45) {
      const era = calcERA(ps.ER, ps.outs) ?? 4.2;
      perfMod = Math.max(0.82, Math.min(1.22, 1 + (4.2 - era) * 0.07));
    }
  }

  // Contract burden vs surplus (나이·연봉에 따른 시장가치 하락 정상 반영)
  const annualKrw =
    p.contract.currency === 'USD' ? (p.contract.annualSalary * 1350) / 100_000_000 : p.contract.annualSalary;
  const fairAnnual = Math.max(0.5, (p.ability - 68) * 0.55);
  const overpay = Math.max(0, annualKrw - fairAnnual);
  const contractPenalty =
    annualKrw >= 12 && p.age >= 33
      ? -Math.round(75 + overpay * 4)
      : annualKrw >= 14
      ? -Math.round(45 + overpay * 3)
      : overpay >= 3.5
      ? -Math.round(overpay * 4)
      : 0;
  const traitBonus =
    p.hiddenTrait === '큰경기강세' || p.hiddenTrait === '철강왕' || p.hiddenTrait === '꾸준함'
      ? 24
      : p.hiddenTrait === '유리몸'
      ? -35
      : 0;
  // OOTP 성향(훈련태도·내구성·리더십) 및 투수 보직 적합도 반영
  const ootpPers = p.ootpRatings?.personality;
  const ootpBonus = ootpPers
    ? Math.round(
        (ootpPers.durability - 65) * 0.45 +
          (p.age <= 26 ? (ootpPers.workEthic - 60) * 0.4 : 0) +
          (ootpPers.leadership - 65) * 0.18 +
          (p.role === '투수' && (p.position === 'SP' || p.pitchRole === '선발') && p.ootpRatings?.pitching
            ? (p.ootpRatings.pitching.starterFit - 68) * 0.35
            : 0)
      )
    : 0;
  const injuryPenalty = p.injury ? -45 : 0;

  const raw = (baseAbility + potentialUpside) * ageMultiplier * posScarcity * perfMod + contractPenalty + traitBonus + ootpBonus + injuryPenalty;
  const index = Math.max(15, Math.min(999, Math.round(raw)));

  const tierLabel =
    index >= 580
      ? '프랜차이즈 S'
      : index >= 400
      ? '핵심 주전 A'
      : index >= 260
      ? '주전급 B'
      : index >= 140
      ? '유망주/준주전 C'
      : '백업/육성 D';

  const lowReasons: string[] = [];
  if (p.age >= 34) lowReasons.push(`고령(${p.age}세) 노쇠화 하락`);
  else if (p.age >= 31) lowReasons.push(`30대 진입(${p.age}세)`);
  if (contractPenalty < 0) lowReasons.push(`고액연봉(${annualKrw.toFixed(1)}억) 부담`);
  if ((p.contract.yearsRemaining ?? 1) <= 1 && p.contract.isFAEligible) lowReasons.push('FA 임박 잔여 1년');
  if (p.injury) lowReasons.push('부상 이탈 중');
  if (traitBonus < 0) lowReasons.push('유리몸 리스크');

  const breakdown = `능력 ${p.ability} · 잠재 ${p.potential} · 만 ${p.age}세 · ${p.position}${
    lowReasons.length > 0 ? ` · 감점: ${lowReasons.join(', ')}` : ''
  }${traitBonus > 0 ? ` · ${p.hiddenTrait}` : ''}`;

  return { index, tierLabel, breakdown };
}

// =============================================================================
// 9. FA QUALIFICATION, GRADES (A/B/C), PROTECTION LIST & SALARY CAP (#25-#28)
// =============================================================================
export function computeFaQualification(
  career: CareerSave,
  p: Player
): {
  registrationDays: number;
  creditedSeasons: number;
  requiredSeasons: number;
  isFaEligible: boolean;
  grade: 'A' | 'B' | 'C' | null;
  compensationRule: string;
} {
  const regDays = p.registrationDays ?? p.serviceYears * 145;
  const creditedSeasons = Math.floor(regDays / 145);
  const isCollege = p.rookieInfo?.originType === '대학';
  const requiredSeasons = isCollege ? 7 : 8;
  const isFaEligible =
    p.category === '국내' && (creditedSeasons >= requiredSeasons || p.contract.isFAEligible === true);

  if (!isFaEligible) {
    return {
      registrationDays: regDays,
      creditedSeasons,
      requiredSeasons,
      isFaEligible: false,
      grade: null,
      compensationRule: `FA 취득까지 약 ${Math.max(1, requiredSeasons - creditedSeasons)}시즌 필요 (연 145일 등록 기준)`,
    };
  }

  // Compute A/B/C grade from team & league domestic salary rank (KBO official rule)
  const domesticActive = Object.values(career.players).filter(
    (x) => x.category === '국내' && x.rosterTier !== '은퇴' && x.rosterTier !== '해외이적' && x.contract.currency === 'KRW'
  );
  const teamSorted = domesticActive
    .filter((x) => x.teamId === p.teamId)
    .sort((a, b) => b.contract.annualSalary - a.contract.annualSalary);
  const leagueSorted = [...domesticActive].sort((a, b) => b.contract.annualSalary - a.contract.annualSalary);

  const teamRank = teamSorted.findIndex((x) => x.id === p.id) + 1;
  const leagueRank = leagueSorted.findIndex((x) => x.id === p.id) + 1;

  let rawGrade: 'A' | 'B' | 'C' = 'C';
  if (teamRank > 0 && teamRank <= 3 && leagueRank > 0 && leagueRank <= 30) {
    rawGrade = 'A';
  } else if (teamRank > 0 && teamRank <= 10 && leagueRank > 0 && leagueRank <= 60) {
    rawGrade = 'B';
  } else {
    rawGrade = 'C';
  }
  const { grade, exceptionNote } = resolveKboFaGradeWithExceptions(p, rawGrade, career.season);

  const baseCompRule =
    grade === 'A'
      ? 'A등급: 보호선수 20인 외 보상선수 1명 + 직전 연봉 200% (또는 연봉 300%)'
      : grade === 'B'
      ? 'B등급: 보호선수 25인 외 보상선수 1명 + 직전 연봉 100% (또는 연봉 200%)'
      : 'C등급: 보상선수 없음 · 직전 연봉 150% 금전 보상';
  const compensationRule = exceptionNote ? `${baseCompRule} · [${exceptionNote}]` : baseCompRule;

  return {
    registrationDays: regDays,
    creditedSeasons,
    requiredSeasons,
    isFaEligible: true,
    grade,
    compensationRule,
  };
}

// computeSalaryCapSummary is now provided by ./salaryCapEngine and re-exported at top of file.

function applyConfirmFaProtectionInPlace(
  next: CareerSave,
  protectedIds: string[],
  dateOverride?: string,
  autoDeadlineNote?: string
): {
  takenPlayerName: string | null;
  cashPaidBillion: number;
  cashOnlyChosen: boolean;
  summary: string;
} {
  ensureDeepFranchiseState(next);
  const pending = next.pendingFaProtection;
  if (!pending) {
    throw new Error('제출할 FA 보상선수 보호명단이 없습니다.');
  }

  // KBO 공식 규정: A등급 20인 / B등급 25인 보호 (당해 FA·신인·외국인·군보류·FA 보상 이적자는 자동 제외 · 보호 인원 미포함)
  const signedPlayer = next.players[pending.signedPlayerId];
  const prevAnnualSal = Math.max(
    0.33,
    pending.previousAnnualSalaryBillion ??
      signedPlayer?.previousAnnualSalary ??
      (pending.faGrade === 'A'
        ? pending.cashCompBillion / 2.0
        : pending.faGrade === 'B'
          ? pending.cashCompBillion
          : pending.cashCompBillion / 1.5)
  );
  const compRes = resolveFaProtectionAndCompensationSelection(
    next,
    next.playerTeamId,
    pending.fromTeamId,
    {
      faSeason: next.season,
      signedPlayerId: pending.signedPlayerId,
      grade: pending.faGrade,
      submittedProtectedIds: protectedIds,
      previousAnnualSalaryBillion: prevAnnualSal,
    }
  );

  const chosen = compRes.chosenPlayer;
  let takenPlayerName: string | null = null;
  const transferDateIso = dateOverride ?? getCurrentCareerDate(next).isoDate;
  if (chosen) {
    takenPlayerName = chosen.name;
    const oldTeam = next.teams[next.playerTeamId];
    const wasInLineup = oldTeam.lineupOrder.includes(chosen.id);
    oldTeam.lineupOrder = oldTeam.lineupOrder.filter((id) => id !== chosen.id);
    oldTeam.benchOrder = oldTeam.benchOrder.filter((id) => id !== chosen.id);
    oldTeam.rotationOrder = oldTeam.rotationOrder.filter((id) => id !== chosen.id);
    oldTeam.bullpenOrder = oldTeam.bullpenOrder.filter((id) => id !== chosen.id);
    delete oldTeam.lineupPositions[chosen.id];
    if (wasInLineup && oldTeam.lineupOrder.length < 9) {
      reconcileTeamLineupPositionsInPlace(next, next.playerTeamId);
    }

    chosen.teamId = pending.fromTeamId;
    chosen.rosterTier = chosen.ability >= 71 ? '1군' : '2군';
    chosen.gameDayActive = chosen.rosterTier === '1군';
    chosen.clubTenureSeasons = 1;
    chosen.faCompensationTransferredSeason = next.season;
    reassignNonConflictingUniformNumber(next, chosen, pending.fromTeamId);
    appendPlayerTeamHistoryInPlace(
      chosen,
      pending.fromTeamId,
      next.season,
      `${pending.signedPlayerName} FA 보상선수`,
      {
        transferDate: transferDateIso,
        moveType: 'FA 보상선수',
        fromTeamId: next.playerTeamId,
      }
    );

    const destTeam = next.teams[pending.fromTeamId];
    if (destTeam && chosen.rosterTier === '1군') {
      if (chosen.role === '투수') destTeam.bullpenOrder.push(chosen.id);
      else destTeam.benchOrder.push(chosen.id);
    }

    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `fa-comp-player-${next.season}-${pending.signedPlayerId}-${chosen.id}`,
        season: next.season,
        date: transferDateIso,
        category: 'FA',
        playerId: chosen.id,
        playerName: chosen.name,
        position: chosen.position,
        previousTeamLabel: `${KBO_TEAMS[next.playerTeamId].shortName} (FA 보상선수)`,
        acquiringTeamId: pending.fromTeamId,
        contractAmountLabel: `연봉 ${chosen.contract.annualSalary.toFixed(1)}억`,
        note: `${pending.signedPlayerName}(${pending.faGrade}등급) FA 보상선수 지명`,
      },
      { pushNewsAlert: false }
    );
  }

  // Pay cash compensation (보상선수 미지명 금전만 전환 시 규정상 300%/200% 반영)
  const cashDue = compRes.finalCashCompBillion;
  if (next.finances.cashBalanceBillion !== null) {
    if (next.finances.cashBalanceBillion >= cashDue) {
      next.finances.cashBalanceBillion = Number(
        (next.finances.cashBalanceBillion - cashDue).toFixed(2)
      );
      next.finances.seasonExpenseBillion = Number(
        (next.finances.seasonExpenseBillion + cashDue).toFixed(2)
      );
    } else {
      const paidNow = Math.max(0, next.finances.cashBalanceBillion);
      const unpaid = Number((cashDue - paidNow).toFixed(2));
      next.finances.cashBalanceBillion = 0;
      next.finances.seasonExpenseBillion = Number(
        (next.finances.seasonExpenseBillion + paidNow).toFixed(2)
      );
      next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + unpaid).toFixed(2));
    }
  } else {
    next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + cashDue).toFixed(2));
  }
  next.finances.compensationPaidBillion = Number(
    ((next.finances.compensationPaidBillion ?? 0) + cashDue).toFixed(2)
  );

  const fromShort = KBO_TEAMS[pending.fromTeamId].shortName;
  const myShort = KBO_TEAMS[next.playerTeamId].shortName;
  const summaryText = `FA ${pending.faGrade}등급 보상 완료: ${fromShort} 구단이 ${
    takenPlayerName
      ? `보상선수 ${takenPlayerName} + 보상금 ${cashDue.toFixed(1)}억 원`
      : `보상선수 미지명 · 금전 보상 ${cashDue.toFixed(1)}억 원`
  } 선택`;

  next.transactionLogs.unshift({
    id: `tx-facomp-${Date.now()}`,
    date: transferDateIso,
    type: '계약',
    teamId: next.playerTeamId,
    summary: autoDeadlineNote ? `[기한 자동제출] ${summaryText}` : summaryText,
    detail: `보호선수 ${compRes.protectedIds.length}/${compRes.pool.protectionLimit}명 제출 · 규정상 자동 제외 ${compRes.pool.autoExempt.length}명 · ${compRes.decisionReason}`,
  });

  if (!next.newsFeed) next.newsFeed = [];
  next.newsFeed.unshift({
    id: `news-facomp-${next.season}-${pending.signedPlayerId}-${Date.now()}`,
    season: next.phase === 'OFFSEASON' ? next.season + 1 : next.season,
    date: transferDateIso,
    category: '이적·계약',
    headline: takenPlayerName
      ? `[FA 보상 확정] ${fromShort}, ${pending.signedPlayerName} 보상선수로 ${myShort} ${takenPlayerName} 지명 (+${cashDue.toFixed(1)}억)`
      : `[FA 금전 보상] ${fromShort}, ${pending.signedPlayerName} 보상선수 미지명 · 보상금 ${cashDue.toFixed(1)}억 원 선택`,
    body: `${myShort} 구단의 보호선수 ${compRes.protectedIds.length}인 명단 제출(자동 제외 ${compRes.pool.autoExempt.length}명 별도) 결과, ${KBO_TEAMS[pending.fromTeamId].name}가 ${compRes.decisionReason}으로 보상을 확정했습니다.${autoDeadlineNote ? ` (${autoDeadlineNote})` : ''}`,
    teamId: next.playerTeamId,
    isHighlight: true,
  });

  next.pendingFaProtection = null;
  next.updatedAt = new Date().toISOString();
  return {
    takenPlayerName,
    cashPaidBillion: cashDue,
    cashOnlyChosen: compRes.cashOnlyFallback,
    summary: summaryText,
  };
}

export function confirmFaProtectionList(
  career: CareerSave,
  protectedIds: string[]
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  takenPlayerName: string | null;
  cashPaidBillion: number;
  cashOnlyChosen: boolean;
  summary: string;
} {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  const res = applyConfirmFaProtectionInPlace(next, protectedIds);
  return {
    nextCareer: next,
    backupSnapshot,
    ...res,
  };
}

/**
 * 사용자 구단 FA 이탈 시 상대 구단 보상 명단에서 보상선수 직접 지명 또는 금전 보상 선택 처리
 */
function applyUserFaCompensationPickInPlace(
  next: CareerSave,
  pendingPickId: string,
  decision: { mode: 'PLAYER'; playerId: string } | { mode: 'CASH_ONLY' },
  dateOverride?: string,
  autoDeadlineNote?: string
): {
  pickedPlayerName: string | null;
  cashReceivedBillion: number;
  cashOnlyChosen: boolean;
  summary: string;
} {
  const list = next.pendingFaCompensationPicks ?? [];
  const idx = list.findIndex((item) => item.id === pendingPickId);
  if (idx < 0) {
    throw new Error('처리할 FA 보상 지명 대기 건을 찾을 수 없습니다.');
  }
  const pickCase = list[idx];
  const transferDateIso = dateOverride ?? getCurrentCareerDate(next).isoDate;
  const acqShort = KBO_TEAMS[pickCase.acquiringTeamId].shortName;
  const myShort = KBO_TEAMS[next.playerTeamId].shortName;

  let pickedPlayerName: string | null = null;
  let cashReceivedBillion = pickCase.cashOnlyBillion;
  let cashOnlyChosen = true;

  if (decision.mode === 'PLAYER') {
    if (!pickCase.unprotectedCandidateIds.includes(decision.playerId)) {
      throw new Error('상대 구단의 보호명단 외 보상 대상 선수가 아닙니다.');
    }
    const target = next.players[decision.playerId];
    if (!target || target.teamId !== pickCase.acquiringTeamId) {
      throw new Error('지명 대상 선수가 이미 소속이 변경되었습니다.');
    }

    const oldTeam = next.teams[pickCase.acquiringTeamId];
    if (oldTeam) {
      const wasInLineup = oldTeam.lineupOrder.includes(target.id);
      oldTeam.lineupOrder = oldTeam.lineupOrder.filter((id) => id !== target.id);
      oldTeam.benchOrder = oldTeam.benchOrder.filter((id) => id !== target.id);
      oldTeam.rotationOrder = oldTeam.rotationOrder.filter((id) => id !== target.id);
      oldTeam.bullpenOrder = oldTeam.bullpenOrder.filter((id) => id !== target.id);
      delete oldTeam.lineupPositions[target.id];
      if (wasInLineup && oldTeam.lineupOrder.length < 9) {
        reconcileTeamLineupPositionsInPlace(next, pickCase.acquiringTeamId);
      }
    }

    target.teamId = next.playerTeamId;
    target.rosterTier = target.ability >= 71 ? '1군' : '2군';
    target.gameDayActive = target.rosterTier === '1군';
    target.clubTenureSeasons = 1;
    target.faCompensationTransferredSeason = next.season;
    reassignNonConflictingUniformNumber(next, target, next.playerTeamId);
    appendPlayerTeamHistoryInPlace(
      target,
      next.playerTeamId,
      next.season,
      `${pickCase.signedPlayerName} FA 보상선수`,
      {
        transferDate: transferDateIso,
        moveType: 'FA 보상선수',
        fromTeamId: pickCase.acquiringTeamId,
      }
    );

    const myTeam = next.teams[next.playerTeamId];
    if (myTeam && target.rosterTier === '1군') {
      if (target.role === '투수') myTeam.bullpenOrder.push(target.id);
      else myTeam.benchOrder.push(target.id);
    }

    pickedPlayerName = target.name;
    cashReceivedBillion = pickCase.cashWithPlayerBillion;
    cashOnlyChosen = false;

    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `fa-comp-userpick-${next.season}-${pickCase.signedPlayerId}-${target.id}`,
        season: next.season,
        date: transferDateIso,
        category: 'FA',
        playerId: target.id,
        playerName: target.name,
        position: target.position,
        previousTeamLabel: `${acqShort} (FA 보상선수)`,
        acquiringTeamId: next.playerTeamId,
        contractAmountLabel: `연봉 ${target.contract.annualSalary.toFixed(1)}억`,
        note: `${pickCase.signedPlayerName}(${pickCase.faGrade}등급) FA 보상선수 지명`,
      },
      { pushNewsAlert: false }
    );
  }

  if (next.finances.cashBalanceBillion !== null) {
    next.finances.cashBalanceBillion = Number(
      (next.finances.cashBalanceBillion + cashReceivedBillion).toFixed(2)
    );
  }
  next.finances.seasonRevenueBillion = Number(
    (next.finances.seasonRevenueBillion + cashReceivedBillion).toFixed(2)
  );
  next.finances.compensationReceivedBillion = Number(
    ((next.finances.compensationReceivedBillion ?? 0) + cashReceivedBillion).toFixed(2)
  );

  const summaryText = pickedPlayerName
    ? `FA ${pickCase.faGrade}등급 보상 완료: ${acqShort} ${pickedPlayerName} 보상선수 지명 + 보상금 ${cashReceivedBillion.toFixed(1)}억 원 수령`
    : `FA ${pickCase.faGrade}등급 금전 보상 완료: 보상선수 미지명 · 보상금 ${cashReceivedBillion.toFixed(1)}억 원 수령 (${pickCase.faGrade === 'A' ? '연봉 300%' : '연봉 200%'})`;

  next.transactionLogs.unshift({
    id: `tx-user-facomp-${Date.now()}-${pickCase.id}`,
    date: transferDateIso,
    type: '계약',
    teamId: next.playerTeamId,
    summary: autoDeadlineNote ? `[3일 기한 자동처리] ${summaryText}` : summaryText,
    detail: `${pickCase.signedPlayerName}(${acqShort} 이적) FA 보상 절차 최종 확정`,
  });

  if (!next.newsFeed) next.newsFeed = [];
  next.newsFeed.unshift({
    id: `news-user-facomp-${next.season}-${pickCase.id}`,
    season: next.phase === 'OFFSEASON' ? next.season + 1 : next.season,
    date: transferDateIso,
    category: '이적·계약',
    headline: pickedPlayerName
      ? `[FA 보상 지명 확정] ${myShort}, ${pickCase.signedPlayerName} 보상선수로 ${acqShort} ${pickedPlayerName} 영입 (+${cashReceivedBillion.toFixed(1)}억)`
      : `[FA 금전 보상 확정] ${myShort}, ${pickCase.signedPlayerName} 보상선수 대신 ${cashReceivedBillion.toFixed(1)}억 원 수령`,
    body: `${KBO_TEAMS[next.playerTeamId].name}가 ${acqShort} 구단이 제출한 보호선수 ${pickCase.protectionLimit}인 외 명단을 검토해 ${
      pickedPlayerName
        ? `${pickedPlayerName} 지명 및 보상금 ${cashReceivedBillion.toFixed(1)}억 원 수령`
        : `보상선수 없이 금전 보상 ${cashReceivedBillion.toFixed(1)}억 원 수령`
    }을 확정했습니다.${autoDeadlineNote ? ` (${autoDeadlineNote})` : ''}`,
    teamId: next.playerTeamId,
    isHighlight: true,
  });

  next.pendingFaCompensationPicks = list.filter((item) => item.id !== pendingPickId);
  next.updatedAt = new Date().toISOString();
  return {
    pickedPlayerName,
    cashReceivedBillion,
    cashOnlyChosen,
    summary: summaryText,
  };
}

export function resolveUserFaCompensationPick(
  career: CareerSave,
  pendingPickId: string,
  decision: { mode: 'PLAYER'; playerId: string } | { mode: 'CASH_ONLY' }
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  pickedPlayerName: string | null;
  cashReceivedBillion: number;
  cashOnlyChosen: boolean;
  summary: string;
} {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  const res = applyUserFaCompensationPickInPlace(next, pendingPickId, decision);
  return { nextCareer: next, backupSnapshot, ...res };
}

/**
 * 3일 기한이 만료된 미처리 FA 보호명단 제출 / 보상선수 지명 건 자동 처리 (캘린더 진행·시즌 전환 시 호출)
 */
export function processExpiredFaCompensationDeadlinesInPlace(
  career: CareerSave,
  currentIsoDate: string,
  forceAll = false
): string[] {
  const resolvedNotices: string[] = [];

  if (career.pendingFaProtection) {
    const deadline = career.pendingFaProtection.submissionDeadlineDate;
    if (forceAll || (deadline && currentIsoDate > deadline)) {
      const pool = buildTeamFaProtectionPool(career, career.playerTeamId, {
        faSeason: career.season,
        signedPlayerId: career.pendingFaProtection.signedPlayerId,
        grade: career.pendingFaProtection.faGrade,
      });
      const autoProtected = pool.selectableEligible
        .slice(0, pool.protectionLimit)
        .map((p) => p.id);
      const res = applyConfirmFaProtectionInPlace(
        career,
        autoProtected,
        currentIsoDate,
        '3일 제출 기한 도과로 AI 추천 보호명단 자동 제출'
      );
      resolvedNotices.push(res.summary);
    }
  }

  const pendingPicks = [...(career.pendingFaCompensationPicks ?? [])];
  for (const item of pendingPicks) {
    if (!forceAll && item.pickDeadlineDate && currentIsoDate <= item.pickDeadlineDate) {
      continue;
    }
    const candidates = item.unprotectedCandidateIds
      .map((id) => career.players[id])
      .filter((p): p is Player => Boolean(p && p.teamId === item.acquiringTeamId));
    const aiChoice = evaluateAiCompensationDecision(
      career,
      career.playerTeamId,
      candidates,
      item.previousAnnualSalaryBillion,
      item.faGrade
    );
    const decision =
      aiChoice.mode === 'PLAYER' && aiChoice.chosenPlayer
        ? ({ mode: 'PLAYER', playerId: aiChoice.chosenPlayer.id } as const)
        : ({ mode: 'CASH_ONLY' } as const);
    const res = applyUserFaCompensationPickInPlace(
      career,
      item.id,
      decision,
      currentIsoDate,
      '3일 지명 기한 도과로 AI 최적 평가 기준 자동 선택'
    );
    resolvedNotices.push(res.summary);
  }

  return resolvedNotices;
}

// =============================================================================
// 10. AGENT NEGOTIATION & COMPETITIVE SIGNING (#6, #23, #33)
// =============================================================================
export function evaluatePlayerContractAcceptance(
  career: CareerSave,
  player: Player,
  offerTotalBillion: number,
  offerYears: number,
  fairTotalBillion: number
): { accepted: boolean; reason: string; rivalTeamId?: TeamId; competingBidBillion?: number } {
  ensureDeepFranchiseState(career);
  const diff = DIFFICULTY_CONFIG[career.difficulty ?? '어려움'] ?? DIFFICULTY_CONFIG['어려움'];
  const agent = player.agent ?? buildPlayerAgent(player);
  const standings = computeStandings(career.gamesLedger);
  const myRank = standings.find((r) => r.teamId === career.playerTeamId)?.rank ?? 5;
  const bigMarkets: TeamId[] = ['LG', '두산', '삼성', '롯데', 'KIA', '한화', 'SSG'];
  const isMyBigMarket = bigMarkets.includes(career.playerTeamId);

  const awardDemand = getAwardSalaryDemandMultiplier(player);
  const requiredTotal =
    fairTotalBillion * agent.greedFactor * diff.agentSelectivity * awardDemand.multiplier;
  const moneyRatio = offerTotalBillion / Math.max(1, requiredTotal);

  // 정상급/초특급 프랜차이즈 선수의 비현실적 저가 후려치기 제안 원천 거절 (우승권·충성도 보너스로 저가 수락 불가)
  const isTopStar = player.ability >= 84 || fairTotalBillion >= 110;
  const isCoreStarter = player.ability >= 78 || fairTotalBillion >= 40;
  const hardMoneyFloorRatio = isTopStar ? 0.86 : isCoreStarter ? 0.78 : 0.65;
  if (offerTotalBillion < fairTotalBillion * hardMoneyFloorRatio) {
    return {
      accepted: false,
      reason: `[${agent.agency} ${agent.name} · ${agent.persona}] ${
        isTopStar
          ? `리그 최정상급 프랜차이즈 가치(예상 약 ${fairTotalBillion.toFixed(1)}억 원)에 크게 못 미치는 저평가 제안은 수락할 수 없습니다.`
          : `시장 적정 가치(예상 약 ${fairTotalBillion.toFixed(1)}억 원) 대비 지나치게 낮은 조건이어서 제안을 정중히 거절했습니다.`
      }`,
    };
  }
  // 초특급 FA에게 연평균이 압도적이지 않은 초단기(1~3년) 제안도 거절
  const fairAavEst = fairTotalBillion / Math.max(1, offerYears);
  if (fairTotalBillion >= 140 && offerYears <= 3 && offerTotalBillion < fairTotalBillion * 0.96 && fairAavEst < 42) {
    return {
      accepted: false,
      reason: `[${agent.agency} ${agent.name} · ${agent.persona}] 초특급 프랜차이즈 선수에게 ${offerYears}년 단기 계약은 장기 보장 기준에 미달해 거절했습니다. (최소 5~6년 이상 장기 계약 권장)`,
    };
  }

  let preferenceScore = moneyRatio * 75;
  // 직전 시즌 한국시리즈 우승 구단(디펜딩 챔피언) FA 선호도 소폭 보너스 (#18)
  const defendingChamp = getDefendingChampionTeamId(career);
  if (defendingChamp && defendingChamp === career.playerTeamId) {
    preferenceScore += 5;
  }
  if (agent.prefersContender) {
    preferenceScore += myRank <= 4 ? 10 : myRank >= 8 ? -14 : -3;
  }
  if (agent.prefersBigMarket) {
    preferenceScore += isMyBigMarket ? 7 : -9;
  }
  if (agent.persona === '장기보장 선호' && player.age < 35) {
    preferenceScore += offerYears >= 4 ? 10 : offerYears <= 2 ? -12 : 0;
  }
  if (player.teamId === career.playerTeamId) {
    preferenceScore += (agent.loyaltyScore - 50) * 0.25;
  }
  if (agent.prefersPlayingTime) {
    const samePosBetter = Object.values(career.players).filter(
      (x) =>
        x.teamId === career.playerTeamId &&
        x.id !== player.id &&
        x.rosterTier === '1군' &&
        x.position === player.position &&
        x.ability > player.ability + 2
    ).length;
    if (samePosBetter > 0) preferenceScore -= 12;
  }

  // Deterministic rival bidding competition for star players (#6)
  const h = stableHash(`${career.season}-${player.id}-${Math.round(offerTotalBillion * 10)}-${offerYears}`);
  const rivalCandidates = TEAM_IDS.filter((t) => t !== career.playerTeamId);
  const rivalTeamId = rivalCandidates[h % rivalCandidates.length];
  const rivalOutbid =
    player.ability >= 81 && diff.rivalAggressiveness >= 1.1 && (h % 100) < Math.round(28 * diff.rivalAggressiveness);

  if (rivalOutbid && moneyRatio < 1.15) {
    const competingBidBillion = Number((offerTotalBillion * (1.06 + (h % 8) * 0.01)).toFixed(1));
    return {
      accepted: false,
      rivalTeamId,
      competingBidBillion,
      reason: `[${agent.agency} ${agent.name} · ${agent.persona}] ${rivalTeamId} 구단이 총액 ${competingBidBillion}억 원 규모의 경쟁 조건을 제시했습니다. 조건 상향 또는 장기 보장이 필요합니다.`,
    };
  }

  if (preferenceScore < 72) {
    const cause =
      agent.prefersContender && myRank >= 7
        ? '우승권 전력을 최우선으로 고려하고 있어'
        : agent.persona === '장기보장 선호' && player.age < 35 && offerYears < 3
        ? '최소 3년 이상 장기 보장 조건을 원해'
        : !isMyBigMarket && agent.prefersBigMarket
        ? '수도권·대형 시장 구단 이적을 선호해'
        : `시장 기대 총액(약 ${requiredTotal.toFixed(1)}억 원)에 미치지 못해`;
    return {
      accepted: false,
      reason: `[${agent.agency} ${agent.name} · ${agent.persona}] 선수가 ${cause} 이번 제안을 정중히 거절했습니다.`,
    };
  }

  return {
    accepted: true,
    reason: `[${agent.agency} ${agent.name}] 제안 조건(${offerYears}년 총액 ${offerTotalBillion.toFixed(1)}억 원)에 만족하여 계약에 합의했습니다.`,
  };
}

// =============================================================================
// 11. TRADE DEADLINE, APPROVAL AUDIT & UNIFORM REASSIGNMENT (#17, #29, #30, #32, #33)
// =============================================================================
export function reassignNonConflictingUniformNumber(
  career: CareerSave,
  player: Player,
  destTeamId: TeamId
): number {
  const retired = new Set<number>([
    ...(REAL_KBO_RETIRED_NUMBERS[destTeamId] ?? []),
    ...(career.leagueHistory?.retiredNumbers ?? [])
      .filter((r) => r.teamId === destTeamId)
      .map((r) => r.number),
  ]);
  const used = new Set<number>(
    Object.values(career.players)
      .filter(
        (x) =>
          x.teamId === destTeamId &&
          x.id !== player.id &&
          x.rosterTier !== '은퇴' &&
          x.rosterTier !== '해외이적' &&
          x.uniformNumber !== undefined
      )
      .map((x) => x.uniformNumber!)
  );

  const prevNum = player.uniformNumber;
  if (
    prevNum !== undefined &&
    prevNum >= 1 &&
    prevNum <= 99 &&
    !retired.has(prevNum) &&
    !used.has(prevNum)
  ) {
    player.uniformChangeNote = undefined;
    return prevNum;
  }

  const start = player.rosterTier === '육성' ? 101 : 1;
  const end = player.rosterTier === '육성' ? 140 : 99;
  for (let n = start; n <= end; n++) {
    if (!retired.has(n) && !used.has(n)) {
      player.uniformNumber = n;
      if (prevNum !== undefined && prevNum !== n) {
        const reason = retired.has(prevNum) ? '영구결번' : '기존 선수 중복';
        player.uniformChangeNote = `#${prevNum} → #${n} (${destTeamId} ${reason} 자동 재배정)`;
      }
      return n;
    }
  }
  player.uniformNumber = 99;
  if (prevNum !== undefined && prevNum !== 99) {
    player.uniformChangeNote = `#${prevNum} → #99 (${destTeamId} 중복 자동 재배정)`;
  }
  return 99;
}

export function changePlayerUniformNumber(
  career: CareerSave,
  playerId: string,
  newNumber: number
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const p = next.players[playerId];
  if (!p || p.teamId !== next.playerTeamId) {
    throw new Error('우리 구단 선수만 등번호를 변경할 수 있습니다.');
  }
  const minNum = p.rosterTier === '육성' ? 100 : 0;
  const maxNum = p.rosterTier === '육성' ? 149 : 99;
  if (!Number.isInteger(newNumber) || newNumber < minNum || newNumber > maxNum) {
    throw new Error(`등번호는 ${minNum}~${maxNum} 범위의 정수로 입력해야 합니다.`);
  }
  const retired = new Set<number>([
    ...(REAL_KBO_RETIRED_NUMBERS[next.playerTeamId] ?? []),
    ...(next.leagueHistory?.retiredNumbers ?? [])
      .filter((r) => r.teamId === next.playerTeamId)
      .map((r) => r.number),
  ]);
  if (retired.has(newNumber)) {
    throw new Error(`#${newNumber}번은 구단 영구결번으로 지정되어 배정할 수 없습니다.`);
  }
  const duplicate = Object.values(next.players).find(
    (x) =>
      x.teamId === next.playerTeamId &&
      x.id !== p.id &&
      x.rosterTier !== '은퇴' &&
      x.rosterTier !== '해외이적' &&
      x.uniformNumber === newNumber
  );
  if (duplicate) {
    throw new Error(`#${newNumber}번은 이미 ${duplicate.name} 선수가 사용 중입니다.`);
  }
  const prevNum = p.uniformNumber;
  p.uniformNumber = newNumber;
  next.transactionLogs.unshift({
    id: `tx-num-${Date.now()}`,
    date: `${next.season}-04-01`,
    type: '엔트리',
    teamId: next.playerTeamId,
    summary: `등번호 변경: ${p.name} (#${prevNum ?? '미배정'} → #${newNumber})`,
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export interface TradeWindowStatus {
  isOpen: boolean;
  currentIsoDate: string;
  deadlineIsoDate: string;
  daysUntilDeadline: number;
  isDeadlineApproaching: boolean; // D-14 ~ D-0
  isDeadlineWeek: boolean; // D-7 ~ D-0
  isDeadlineUrgent: boolean; // D-3 ~ D-0
  statusLabel: string;
  detailText: string;
}

function diffIsoDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function addOneDayIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * KBO 공식 트레이드 기간 판정:
 * - 트레이드 가능 기간: 한국시리즈 종료 다음 날(오프시즌 개시) ~ 다음 해 7월 31일
 * - 트레이드 금지 기간: 8월 1일 ~ 한국시리즈 종료일 (정규시즌 8/1~종료 + 포스트시즌 전체)
 */
export function getTradeWindowStatus(career: CareerSave, overrideIsoDate?: string): TradeWindowStatus {
  const currentIsoDate = overrideIsoDate ?? getCurrentCareerDate(career).isoDate;
  const season = career.season;
  const deadlineYear = career.phase === 'OFFSEASON' ? season + 1 : season;
  const deadlineIsoDate = `${deadlineYear}-07-31`;

  // 1) 포스트시즌 기간(한국시리즈 종료일까지): 전면 금지
  if (career.phase === 'POSTSEASON') {
    return {
      isOpen: false,
      currentIsoDate,
      deadlineIsoDate: `${season + 1}-07-31`,
      daysUntilDeadline: 0,
      isDeadlineApproaching: false,
      isDeadlineWeek: false,
      isDeadlineUrgent: false,
      statusLabel: '트레이드 시장 폐쇄',
      detailText: '트레이드 금지 기간 (8월 1일 ~ 한국시리즈 종료일) · 한국시리즈 종료 다음 날 자동 재개방',
    };
  }

  // 2) 오프시즌(한국시리즈 종료 다음 날 ~) 및 개막 준비 기간: 개방 (차기 7월 31일까지)
  if (career.phase !== 'REGULAR_SEASON') {
    const days = Math.max(0, diffIsoDays(currentIsoDate, deadlineIsoDate));
    return {
      isOpen: true,
      currentIsoDate,
      deadlineIsoDate,
      daysUntilDeadline: days,
      isDeadlineApproaching: days <= 14,
      isDeadlineWeek: days <= 7,
      isDeadlineUrgent: days <= 3,
      statusLabel: '트레이드 시장 개방',
      detailText: `가능 기간: 한국시리즈 종료 다음 날 ~ ${deadlineYear}년 7월 31일 (마감까지 D-${days})`,
    };
  }

  // 3) 정규시즌: 7월 31일까지 개방, 8월 1일부터 전면 금지
  //    (레거시 테스트 등에서 일정 인덱스 변경 없이 gamesPlayed만 수동 조작한 경우도 안전하게 차단)
  const expectedSeriesGames =
    career.currentSeriesIndex * 3 + (career.schedule[career.currentSeriesIndex]?.completedRounds ?? 0);
  const manualRoundOverrideClosed =
    !overrideIsoDate &&
    expectedSeriesGames !== career.gamesPlayed &&
    career.gamesPlayed >= (career.tradeDeadlineRound ?? 100);

  const daysUntil = diffIsoDays(currentIsoDate, deadlineIsoDate);
  if (daysUntil < 0 || manualRoundOverrideClosed) {
    return {
      isOpen: false,
      currentIsoDate,
      deadlineIsoDate,
      daysUntilDeadline: 0,
      isDeadlineApproaching: false,
      isDeadlineWeek: false,
      isDeadlineUrgent: false,
      statusLabel: '트레이드 시장 폐쇄',
      detailText: `트레이드 금지 기간 (${season}년 8월 1일 ~ 한국시리즈 종료일) · 한국시리즈 종료 다음 날 자동 재개방`,
    };
  }

  return {
    isOpen: true,
    currentIsoDate,
    deadlineIsoDate,
    daysUntilDeadline: daysUntil,
    isDeadlineApproaching: daysUntil <= 14,
    isDeadlineWeek: daysUntil <= 7,
    isDeadlineUrgent: daysUntil <= 3,
    statusLabel: daysUntil === 0 ? '트레이드 마감 당일' : '트레이드 시장 개방',
    detailText:
      daysUntil === 0
        ? `오늘(${season}년 7월 31일) KBO 트레이드 최종 마감! 미체결 제안은 자정(8월 1일) 자동 취소됩니다.`
        : `가능 기간: ${season}년 7월 31일까지 (마감까지 D-${daysUntil}) · 8월 1일부터 금지`,
  };
}

/**
 * 정규시즌 진행 중 트레이드 마감 7일 전 / 3일 전 / 당일 알림 및 8월 1일 미체결 제안 자동 취소를 처리합니다.
 */
export function processTradeWindowLifecycleInPlace(
  career: CareerSave,
  dateStr?: string
): { alerts: string[]; cancelledCount: number } {
  ensureDeepFranchiseState(career);
  if (!career.tradeDeadlineAlertsSent) career.tradeDeadlineAlertsSent = [];
  if (!career.newsFeed) career.newsFeed = [];

  const status = getTradeWindowStatus(career, dateStr);
  const alerts: string[] = [];
  let cancelledCount = 0;

  if (career.phase !== 'REGULAR_SEASON') {
    return { alerts, cancelledCount };
  }

  const season = career.season;
  const sent = new Set(career.tradeDeadlineAlertsSent);

  // 1) 트레이드 마감 7일 전 / 3일 전 / 당일 알림
  if (status.isOpen) {
    const d7Key = `${season}-D7`;
    const d3Key = `${season}-D3`;
    const d0Key = `${season}-D0`;

    if (status.daysUntilDeadline <= 7 && status.daysUntilDeadline > 3 && !sent.has(d7Key)) {
      sent.add(d7Key);
      const msg = `[트레이드 마감 D-7] ${season} KBO 트레이드 마감(7월 31일)까지 7일 남았습니다.`;
      alerts.push(msg);
      career.newsFeed.unshift({
        id: `news-trade-dl-d7-${season}`,
        season,
        date: status.currentIsoDate,
        category: '이적·계약',
        headline: `[트레이드 마감 7일 전] ${season} KBO 트레이드 시장 마감 임박 (7월 31일 종료)`,
        body: `7월 31일 트레이드 마감을 1주일 앞두고 상위권 구단의 즉시전력감 보강과 하위권 구단의 유망주·지명권 확보 움직임이 본격화되고 있습니다.`,
        teamId: career.playerTeamId,
        isHighlight: true,
      });
    }

    if (status.daysUntilDeadline <= 3 && status.daysUntilDeadline > 0 && !sent.has(d3Key)) {
      sent.add(d3Key);
      const msg = `[트레이드 마감 D-3] ${season} KBO 트레이드 마감(7월 31일)까지 3일 남았습니다.`;
      alerts.push(msg);
      career.newsFeed.unshift({
        id: `news-trade-dl-d3-${season}`,
        season,
        date: status.currentIsoDate,
        category: '이적·계약',
        headline: `[트레이드 마감 3일 전] 각 구단 단장실 막판 대형 협상 가속`,
        body: `KBO 트레이드 마감까지 단 3일 남았습니다. 8월 1일부터 한국시리즈 종료일까지 모든 구단의 트레이드가 전면 금지됩니다.`,
        teamId: career.playerTeamId,
        isHighlight: true,
      });
    }

    if (status.daysUntilDeadline === 0 && !sent.has(d0Key)) {
      sent.add(d0Key);
      const msg = `[트레이드 마감 당일] 오늘(${season}-07-31) KBO 트레이드 최종 마감일입니다.`;
      alerts.push(msg);
      career.newsFeed.unshift({
        id: `news-trade-dl-d0-${season}`,
        season,
        date: status.currentIsoDate,
        category: '이적·계약',
        headline: `[트레이드 마감 당일] ${season}년 7월 31일 KBO 트레이드 최종 마감`,
        body: `오늘이 올 시즌 마지막 트레이드 가능일입니다. 마감일까지 체결되지 않은 모든 트레이드 제안은 8월 1일 자동 취소됩니다.`,
        teamId: career.playerTeamId,
        isHighlight: true,
      });
    }
  } else {
    // 2) 8월 1일 이후 트레이드 금지 기간 진입 -> 미체결 제안 전면 자동 취소
    for (const offer of career.incomingTradeOffers ?? []) {
      if (offer.status === '대기') {
        offer.status = '만료';
        offer.reason = `${offer.reason} (7월 31일 트레이드 마감 경과로 자동 취소)`;
        cancelledCount += 1;
      }
    }

    const closedKey = `${season}-CLOSED`;
    if (!sent.has(closedKey)) {
      sent.add(closedKey);
      const msg = `[트레이드 시장 폐쇄] 8월 1일 트레이드 금지 기간 돌입${cancelledCount > 0 ? ` · 미체결 제안 ${cancelledCount}건 자동 취소` : ''}`;
      alerts.push(msg);
      career.newsFeed.unshift({
        id: `news-trade-closed-${season}`,
        season,
        date: status.currentIsoDate,
        category: '이적·계약',
        headline: `[트레이드 시장 폐쇄] ${season} KBO 트레이드 마감 종료 — 한국시리즈 종료일까지 금지`,
        body: `${season}년 8월 1일부로 트레이드 금지 기간에 돌입해 사용자와 AI 구단 모두 트레이드 제안 및 체결이 불가능합니다.${
          cancelledCount > 0 ? ` 마감까지 체결되지 않은 트레이드 제안 ${cancelledCount}건은 자동 취소되었습니다.` : ''
        } 시장은 한국시리즈 종료 다음 날 자동 재개방됩니다.`,
        teamId: career.playerTeamId,
        isHighlight: true,
      });
    }
  }

  career.tradeDeadlineAlertsSent = Array.from(sent);
  return { alerts, cancelledCount };
}

/**
 * 한국시리즈 종료 다음 날 트레이드 시장 자동 재개방 처리
 */
export function notifyTradeMarketReopenedAfterKoreanSeriesInPlace(
  career: CareerSave,
  koreanSeriesEndIsoDate: string
): string {
  ensureDeepFranchiseState(career);
  if (!career.tradeDeadlineAlertsSent) career.tradeDeadlineAlertsSent = [];
  if (!career.newsFeed) career.newsFeed = [];

  const reopenDate = addOneDayIso(koreanSeriesEndIsoDate);
  const reopenKey = `${career.season}-REOPENED`;
  if (!career.tradeDeadlineAlertsSent.includes(reopenKey)) {
    career.tradeDeadlineAlertsSent.push(reopenKey);
    career.newsFeed.unshift({
      id: `news-trade-reopen-${career.season}`,
      season: career.season + 1,
      date: reopenDate,
      category: '이적·계약',
      headline: `[트레이드 시장 자동 재개방] 한국시리즈 종료 다음 날(${reopenDate}) 스토브리그 트레이드 개시`,
      body: `한국시리즈 종료 다음 날을 기점으로 KBO 전 구단 트레이드 시장이 자동 재개방되었습니다. 차기 시즌(${career.season + 1}년) 7월 31일까지 트레이드가 가능합니다.`,
      teamId: career.playerTeamId,
      isHighlight: true,
    });
  }
  return reopenDate;
}

export function validateTradeCompliance(
  career: CareerSave,
  params: {
    targetTeamId: TeamId;
    myPlayerIds: string[];
    theirPlayerIds: string[];
  }
): { valid: boolean; reason?: string } {
  ensureDeepFranchiseState(career);
  const tradeWindow = getTradeWindowStatus(career);

  // KBO 공식 트레이드 금지 기간 (8월 1일 ~ 한국시리즈 종료일) 차단
  if (!tradeWindow.isOpen) {
    return {
      valid: false,
      reason:
        career.phase === 'POSTSEASON'
          ? '포스트시즌 기간(한국시리즈 종료일까지)에는 모든 구단의 트레이드가 금지됩니다. 한국시리즈 종료 다음 날 자동 재개방됩니다.'
          : `KBO 트레이드 금지 기간(8월 1일 ~ 한국시리즈 종료일)입니다. 트레이드 시장은 한국시리즈 종료 다음 날 자동 재개방됩니다.`,
    };
  }

  // #30 & #33: Player eligibility & duplicate contract audit
  const allMy = params.myPlayerIds.map((id) => career.players[id]).filter(Boolean);
  const allTheir = params.theirPlayerIds.map((id) => career.players[id]).filter(Boolean);
  if (allMy.length !== params.myPlayerIds.length || allTheir.length !== params.theirPlayerIds.length) {
    return { valid: false, reason: '유효하지 않거나 이미 타 구단에 계약된 선수가 포함되어 있습니다.' };
  }

  for (const p of [...allMy, ...allTheir]) {
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') {
      return { valid: false, reason: `${p.name} 선수는 현재 은퇴·해외이적 상태라 트레이드할 수 없습니다.` };
    }
    if (isMilitaryServing(p.militaryStatus)) {
      return { valid: false, reason: `${p.name} 선수는 상무 피닉스 군 복무 중이라 트레이드 불가 대상입니다.` };
    }
    if (p.nationalTeamDuty && career.gamesPlayed <= p.nationalTeamDuty.endRound) {
      return { valid: false, reason: `${p.name} 선수는 국가대표 소집 중이라 트레이드 승인이 보류됩니다.` };
    }
    if (p.signedAsFaSeason === career.season) {
      return { valid: false, reason: `${p.name} 선수는 당해 연도 FA 신규 계약 선수로 KBO 규정상 1년간 트레이드가 제한됩니다.` };
    }
    if (p.rookieInfo && p.serviceYears === 0 && p.age <= 20 && career.phase === 'REGULAR_SEASON' && career.gamesPlayed < 30) {
      return { valid: false, reason: `${p.name} 선수는 당해 연도 신인 등록 보호 기간 중이라 트레이드가 제한됩니다.` };
    }
    if (p.category !== '국내') {
      return { valid: false, reason: `외국인·아시아쿼터 선수(${p.name})는 KBO 규정상 트레이드 대상이 아닙니다.` };
    }
  }

  // #33: Ownership double-check
  if (allMy.some((p) => p.teamId !== career.playerTeamId)) {
    return { valid: false, reason: '우리 구단 소속이 아닌 선수가 포함되어 있어 거래가 차단되었습니다.' };
  }
  if (allTheir.some((p) => p.teamId !== params.targetTeamId)) {
    return { valid: false, reason: '상대 구단 소속이 아닌 선수가 포함되어 있어 거래가 차단되었습니다.' };
  }

  return { valid: true };
}

// =============================================================================
// 12. SALARY NEGOTIATION & BUDGET PRESSURE (#5, #31)
// =============================================================================
export function computePlayerSalaryDemand(p: Player): number {
  const agent = p.agent ?? buildPlayerAgent(p);
  const cur = p.contract.currency === 'KRW' ? p.contract.annualSalary : 1.0;
  let perfFactor = 1.0;
  if (p.role === '타자') {
    const b = p.stats as BatterStats;
    const ops = calcOPS(b) ?? 0.72;
    if ((b.AB ?? 0) >= 120) {
      perfFactor = ops >= 0.9 ? 1.45 : ops >= 0.82 ? 1.24 : ops >= 0.74 ? 1.08 : ops < 0.65 ? 0.86 : 0.98;
    }
  } else {
    const ps = p.stats as PitcherStats;
    const era = calcERA(ps.ER, ps.outs) ?? 4.3;
    if ((ps.outs ?? 0) >= 90) {
      perfFactor = era <= 2.9 ? 1.45 : era <= 3.6 ? 1.22 : era <= 4.3 ? 1.06 : era >= 5.3 ? 0.85 : 0.96;
    }
  }
  const baseTarget = Math.max(0.35, cur * perfFactor * agent.greedFactor);
  const floorByAbility = p.ability >= 85 ? 5.5 : p.ability >= 80 ? 3.2 : p.ability >= 75 ? 1.5 : 0.4;
  return Number(Math.max(floorByAbility, Math.min(25, baseTarget)).toFixed(2));
}

export function negotiateDomesticSalary(
  career: CareerSave,
  playerId: string,
  offeredAnnualBillion: number
): { nextCareer: CareerSave; backupSnapshot: CareerSave; accepted: boolean; message: string } {
  const minSal = career.season >= 2027 ? 0.33 : 0.3;
  const minSalLabel = career.season >= 2027 ? '0.33억 원 = 3,300만 원 (2027 개정)' : '0.3억 원 = 3,000만 원';
  if (!Number.isFinite(offeredAnnualBillion) || offeredAnnualBillion < minSal) {
    throw new Error(`연봉 제시액은 KBO 최저 연봉(${minSalLabel}) 이상이어야 합니다.`);
  }
  const { nextCareer, backupSnapshot, result } = executeAtomicCareerMutation(career, (next) => {
    ensureDeepFranchiseState(next);
    if (
      next.finances.ownerBudgetCapBillion &&
      next.finances.seasonExpenseBillion + offeredAnnualBillion > next.finances.ownerBudgetCapBillion * 1.45 &&
      offeredAnnualBillion > 3.0
    ) {
      throw new Error(
        `구단주 시즌 예산 한도(${next.finances.ownerBudgetCapBillion}억) 및 재정 건전성 제한으로 고액 연봉(${offeredAnnualBillion.toFixed(2)}억)을 승인할 수 없습니다.`
      );
    }
    const p = next.players[playerId];
    if (!p || p.teamId !== next.playerTeamId || p.category !== '국내') {
      throw new Error('우리 구단 국내 선수만 연봉 협상을 진행할 수 있습니다.');
    }
    const demand = p.demandedSalaryBillion ?? computePlayerSalaryDemand(p);
    const diff = DIFFICULTY_CONFIG[next.difficulty ?? '어려움'];
    const resist = getReSignResistanceAssessment(next, p);
    const minAcceptable = Number(
      (
        demand *
        (0.9 + (diff.agentSelectivity - 1) * 0.45) *
        resist.requiredPremiumMultiplier
      ).toFixed(2)
    );

    if (offeredAnnualBillion < minAcceptable) {
      const curDis = getPlayerDissatisfaction(p);
      p.dissatisfaction = Math.min(100, curDis + (resist.dissatisfaction >= 80 ? 6 : 9));
      const causeSet = new Set(p.activeDissatisfactionCauses ?? []);
      causeSet.add('연봉 불만');
      causeSet.add('계약 문제');
      p.activeDissatisfactionCauses = Array.from(causeSet);
      syncPlayerMoraleFromDissatisfaction(p);
      p.salaryNegotiationStatus = '조정신청';
      p.demandedSalaryBillion = demand;
      return {
        accepted: false,
        message:
          resist.dissatisfaction >= 80
            ? `${p.name}(불만도 ${resist.dissatisfaction} · ${resist.level}) 측이 재계약 제시(${offeredAnnualBillion.toFixed(2)}억)를 거부했습니다. ${resist.isFranchiseStar ? '프랜차이즈 충성도가 작용했으나 ' : ''}최소 ${minAcceptable.toFixed(2)}억 원 이상의 성의 있는 조건이 필요합니다.`
            : `${p.name} 측이 제시 연봉(${offeredAnnualBillion.toFixed(2)}억)을 거부했습니다. 희망 연봉은 ${demand.toFixed(2)}억 원입니다.`,
      };
    }

    const yearsRem = Math.max(1, p.contract.yearsRemaining);
    p.contract.annualSalary = Number(offeredAnnualBillion.toFixed(2));
    p.contract.years = Math.max(1, yearsRem);
    p.contract.totalValue = Number((offeredAnnualBillion * yearsRem + (p.contract.signingBonus ?? 0)).toFixed(2));
    p.contract.status = '확정';
    p.salaryNegotiationStatus = '협상완료';
    const curDis = getPlayerDissatisfaction(p);
    p.dissatisfaction = Math.max(0, curDis - (offeredAnnualBillion >= demand ? 24 : 14));
    p.activeDissatisfactionCauses = (p.activeDissatisfactionCauses ?? []).filter(
      (c) => c !== '연봉 불만' && c !== '계약 문제'
    );
    syncPlayerMoraleFromDissatisfaction(p);
    if (p.dissatisfaction < 50) p.tradeRequested = false;
    next.transactionLogs.unshift({
      id: `tx-sal-${Date.now()}`,
      date: `${next.season}-12-20`,
      type: '계약',
      teamId: next.playerTeamId,
      summary: `연봉 협상 타결: ${p.name} 연봉 ${offeredAnnualBillion.toFixed(2)}억 원 (요구 ${demand.toFixed(2)}억)`,
    });
    next.updatedAt = new Date().toISOString();
    return {
      accepted: true,
      message: `${p.name} 선수와 연봉 ${offeredAnnualBillion.toFixed(2)}억 원에 재계약을 완료했습니다.`,
    };
  });

  return {
    nextCareer,
    backupSnapshot,
    accepted: result.accepted,
    message: result.message,
  };
}

// =============================================================================
// 13. SPRING CAMP & EXHIBITION GAMES (#14, #15)
// =============================================================================
export const SPRING_CAMP_LOCATIONS: {
  id: NonNullable<SpringCampState['location']>;
  costBillion: number;
  growthBonus: number;
  fatigueDelta: number;
  desc: string;
}[] = [
  {
    id: '미국 애리조나',
    costBillion: 6.5,
    growthBonus: 3,
    fatigueDelta: 10,
    desc: '최적의 건조 기후와 MLB 수준 훈련 인프라 · 신인·유망주 기량 향상 최대',
  },
  {
    id: '일본 오키나와',
    costBillion: 4.5,
    growthBonus: 2,
    fatigueDelta: 6,
    desc: 'NPB 및 KBO 타 구단과 실전 연습경기 풍부 · 시즌 초반 실전 감각 최적화',
  },
  {
    id: '호주 멜버른',
    costBillion: 4.0,
    growthBonus: 2,
    fatigueDelta: 7,
    desc: '따뜻한 남반구 기후 · 투수 구속 빌드업과 외국인 선수 적응에 유리',
  },
  {
    id: '국내 제주·거제',
    costBillion: 1.8,
    growthBonus: 1,
    fatigueDelta: 4,
    desc: '예산 절감형 국내 캠프 · 이동 피로 최소화로 베테랑 컨디션 유지에 적합',
  },
];

export function runSpringCamp(
  career: CareerSave,
  location: NonNullable<SpringCampState['location']>,
  intensity: SpringCampState['intensity'],
  invitedProspectIds: string[]
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const loc = SPRING_CAMP_LOCATIONS.find((l) => l.id === location)!;
  const cost = Number((loc.costBillion * (intensity === '고강도' ? 1.15 : intensity === '컨디션중심' ? 0.92 : 1.0)).toFixed(2));
  if ((next.finances.cashBalanceBillion ?? 0) < cost) {
    throw new Error(`스프링캠프 예산(${cost}억 원)이 부족합니다.`);
  }

  next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - cost).toFixed(2));
  next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cost).toFixed(2));

  const rng = new SeededRng((next.rngState + next.season * 97) >>> 0);
  const invitedSet = new Set(invitedProspectIds);
  const standoutNames: string[] = [];

  for (const p of Object.values(next.players)) {
    if (p.teamId !== next.playerTeamId || p.rosterTier === '은퇴' || p.rosterTier === '해외이적') continue;
    const isInvited = invitedSet.has(p.id);
    if (p.rosterTier !== '1군' && !isInvited) continue;

    if (intensity === '고강도') {
      p.fatigue = Math.min(35, p.fatigue + loc.fatigueDelta + 6);
      if (p.age <= 25 && p.ability < p.potential && rng.next() < 0.22 + loc.growthBonus * 0.06) {
        p.ability = Math.min(p.potential, p.ability + 1);
        standoutNames.push(`${p.name}(OVR+1)`);
      }
      p.form = Math.min(4, p.form + (rng.next() < 0.6 ? 1 : 0));
    } else if (intensity === '컨디션중심') {
      p.fatigue = Math.max(0, p.fatigue - 8);
      p.form = Math.min(4, p.form + (rng.next() < 0.72 ? 1 : 0));
    } else {
      p.fatigue = Math.min(22, p.fatigue + Math.round(loc.fatigueDelta * 0.5));
      p.form = Math.min(4, p.form + (rng.next() < 0.65 ? 1 : 0));
      if (isInvited && p.ability < p.potential && rng.next() < 0.25) {
        p.ability = Math.min(p.potential, p.ability + 1);
        standoutNames.push(`${p.name}(OVR+1)`);
      }
    }
    if (p.category !== '국내') {
      p.kboAdaptation = Math.min(100, (p.kboAdaptation ?? 78) + 6);
    }
  }

  next.rngState = rng.getState();
  next.springCamp = {
    season: next.season,
    location,
    intensity,
    costBillion: cost,
    invitedProspectIds,
    campCompleted: true,
    exhibitionGames: next.springCamp?.exhibitionGames ?? [],
    summaryNote: `${location} (${intensity}) 캠프 완료 · 비용 ${cost}억 원${
      standoutNames.length > 0 ? ` · 캠프 MVP/성장: ${standoutNames.slice(0, 4).join(', ')}` : ' · 전원 컨디션 빌드업 완료'
    }`,
  };

  next.transactionLogs.unshift({
    id: `tx-camp-${Date.now()}`,
    date: `${next.season}-02-28`,
    type: '육성',
    teamId: next.playerTeamId,
    summary: `스프링캠프 완료: ${location} (${intensity} · ${cost}억 원)`,
    detail: next.springCamp.summaryNote,
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function playExhibitionGames(
  career: CareerSave,
  count = 4
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const rng = new SeededRng((next.rngState + 31337) >>> 0);
  const opponents = TEAM_IDS.filter((t) => t !== next.playerTeamId);
  const myTeam = next.teams[next.playerTeamId];
  const myLineup = myTeam.lineupOrder.map((id) => next.players[id]).filter(Boolean);
  const myRotation = myTeam.rotationOrder.map((id) => next.players[id]).filter(Boolean);
  const existing = next.springCamp?.exhibitionGames ?? [];

  const added: ExhibitionGameRecord[] = [];
  for (let i = 0; i < count; i++) {
    const opp = opponents[(existing.length + i) % opponents.length];
    const oppLineup = next.teams[opp].lineupOrder.map((id) => next.players[id]).filter(Boolean);
    const myAvg = myLineup.reduce((s, p) => s + p.ability + p.form, 0) / Math.max(1, myLineup.length);
    const oppAvg = oppLineup.reduce((s, p) => s + p.ability, 0) / Math.max(1, oppLineup.length);
    const myRuns = Math.max(0, Math.round(4.3 + (myAvg - oppAvg) * 0.14 + (rng.next() - 0.45) * 6.5));
    const oppRuns = Math.max(0, Math.round(4.3 + (oppAvg - myAvg) * 0.14 + (rng.next() - 0.45) * 6.5));
    const result: ExhibitionGameRecord['result'] = myRuns > oppRuns ? '승' : myRuns < oppRuns ? '패' : '무';

    const sp = myRotation[i % Math.max(1, myRotation.length)];
    const hotBat = myLineup[rng.int(0, Math.max(0, myLineup.length - 1))];
    if (hotBat && result === '승') hotBat.form = Math.min(4, hotBat.form + 1);
    if (sp && oppRuns <= 2) sp.form = Math.min(4, sp.form + 1);

    added.push({
      id: `exh-${next.season}-${existing.length + i + 1}`,
      gameNo: existing.length + i + 1,
      opponent: opp,
      isHome: i % 2 === 0,
      myRuns,
      oppRuns,
      result,
      standoutNote: `선발 ${sp?.name ?? '투수진'} 점검 · ${hotBat?.name ?? '타선'} 실전 감각 점검`,
      date: `${next.season}-03-${String(10 + existing.length + i).padStart(2, '0')}`,
    });
  }

  next.rngState = rng.getState();
  next.springCamp = {
    ...(next.springCamp ?? {
      season: next.season,
      location: '국내 제주·거제',
      intensity: '균형',
      costBillion: 0,
      invitedProspectIds: [],
      campCompleted: true,
      exhibitionGames: [],
    }),
    exhibitionGames: [...existing, ...added],
  };
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

// =============================================================================
// 14. GM DISMISSAL & OTHER CLUB JOB OFFERS (#18)
// =============================================================================
export function generateGmJobOffers(career: CareerSave): GmJobOffer[] {
  const standings = computeStandings(career.gamesLedger);
  const candidates = TEAM_IDS.filter((t) => t !== career.playerTeamId)
    .sort((a, b) => {
      const ra = standings.find((s) => s.teamId === a)?.rank ?? 5;
      const rb = standings.find((s) => s.teamId === b)?.rank ?? 5;
      return rb - ra; // Lower-ranked rebuilding clubs eager for a new GM
    })
    .slice(0, 3);

  return candidates.map((tid, idx) => {
    const budget = getTeamOwnerBudgetCapBillion(tid);
    const targetRank = idx === 0 ? '가을야구(5강) 진출' : idx === 1 ? '중위권 도약(6위 이상)' : '리빌딩 기반 구축';
    return {
      id: `gm-offer-${career.season}-${tid}`,
      teamId: tid,
      contractYears: 3,
      budgetBillion: budget,
      targetRankLabel: targetRank,
      pitchMessage: `${KBO_TEAMS[tid].name} 구단주가 귀하의 프런트 경험을 높이 평가하며 3년 신임 단장직을 공식 제안했습니다.`,
    };
  });
}

export function acceptGmJobOffer(
  career: CareerSave,
  offerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const offer = (next.gmJobOffers ?? []).find((o) => o.id === offerId);
  if (!offer) {
    throw new Error('유효한 타 구단 단장 제안이 없습니다.');
  }

  const oldTeam = next.playerTeamId;
  next.playerTeamId = offer.teamId;
  next.label = `${KBO_TEAMS[offer.teamId].name} ${next.season} · 이직 커리어`;
  next.finances.ownerBudgetCapBillion = offer.budgetBillion;
  next.finances.cashBalanceBillion = Math.max(95, Math.round(offer.budgetBillion * 0.85));
  next.ownerEval = {
    season: next.season,
    targetRank: 5,
    targetRankLabel: offer.targetRankLabel,
    targetProfitNote: '신임 단장 체제 첫 시즌 안정적 재정 운용',
    ownerTrust: 72,
    isFired: false,
    evaluationComment: `${KBO_TEAMS[offer.teamId].name} 신임 단장으로 취임했습니다.`,
  };
  next.gmJobOffers = [];
  next.transactionLogs.unshift({
    id: `tx-gm-move-${Date.now()}`,
    date: `${next.season}-11-10`,
    type: '엔트리',
    teamId: offer.teamId,
    summary: `단장 이직 취임: ${KBO_TEAMS[oldTeam].shortName} → ${KBO_TEAMS[offer.teamId].name} (${offer.contractYears}년 계약)`,
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

// =============================================================================
// 15. RETIREMENT CEREMONIES (#38) & OVERSEAS RETURNEE SIGNING (#10)
// =============================================================================
export function buildRetirementCeremony(p: Player, season: number): RetirementCeremonyRecord {
  const live = getLiveCareerStats(p);
  const summary =
    'AB' in live
      ? `통산 ${live.G}경기 · ${live.H}안타 · ${live.HR}홈런 · ${live.RBI}타점 · 타율 ${(
          live.AB > 0 ? live.H / live.AB : 0
        )
          .toFixed(3)
          .replace(/^0/, '')}`
      : `통산 ${live.G}경기 · ${live.W}승 ${live.L}패 ${live.SV}세이브 · ${formatIP(live.outs)}이닝 · ERA ${(
          live.outs > 0 ? (live.ER * 27) / live.outs : 0
        ).toFixed(2)} · ${live.SO}탈삼진`;
  return {
    id: `ret-cer-${season}-${p.id}`,
    season,
    playerId: p.id,
    playerName: p.name,
    teamId: p.teamId,
    position: p.position,
    uniformNumber: p.uniformNumber,
    age: p.age,
    careerSummary: summary,
    ceremonyHeadline: `${KBO_TEAMS[p.teamId].name} 프랜차이즈 스타 ${p.name}(#${p.uniformNumber ?? '—'}) 공식 은퇴식`,
    numberRetired: false,
    acknowledged: false,
  };
}

export function acknowledgeRetirementCeremony(
  career: CareerSave,
  ceremonyId: string,
  retireUniformNumber: boolean
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const cer = (next.retirementCeremonies ?? []).find((c) => c.id === ceremonyId);
  if (!cer) throw new Error('해당 은퇴식 기록을 찾을 수 없습니다.');

  cer.acknowledged = true;
  if (retireUniformNumber && cer.uniformNumber !== undefined && cer.uniformNumber <= 99) {
    cer.numberRetired = true;
    if (!next.leagueHistory) {
      next.leagueHistory = { retiredNumbers: [], hallOfFame: [], trophies: [], clubRecords: [] };
    }
    const already = next.leagueHistory.retiredNumbers.some(
      (r) => r.teamId === cer.teamId && r.number === cer.uniformNumber
    );
    if (!already) {
      next.leagueHistory.retiredNumbers.push({
        teamId: cer.teamId,
        number: cer.uniformNumber,
        playerName: cer.playerName,
        position: cer.position,
        retiredSeason: cer.season,
        careerSummary: cer.careerSummary,
      });
    }
    const inHof = next.leagueHistory.hallOfFame.some((h) => h.playerName === cer.playerName);
    if (!inHof) {
      next.leagueHistory.hallOfFame.push({
        playerId: cer.playerId,
        playerName: cer.playerName,
        teamId: cer.teamId,
        position: cer.position,
        inductedSeason: cer.season,
        careerSummary: cer.careerSummary,
      });
    }
    // Reassign any active player wearing this retired number
    for (const pl of Object.values(next.players)) {
      if (pl.teamId === cer.teamId && pl.id !== cer.playerId && pl.uniformNumber === cer.uniformNumber) {
        reassignNonConflictingUniformNumber(next, pl, cer.teamId);
      }
    }
  }
  next.teams[next.playerTeamId].popularity = Math.min(100, next.teams[next.playerTeamId].popularity + 3);
  next.teams[next.playerTeamId].fanSentiment = Math.min(100, (next.teams[next.playerTeamId].fanSentiment ?? 65) + 5);
  next.transactionLogs.unshift({
    id: `tx-retcer-${Date.now()}`,
    date: `${cer.season}-11-15`,
    type: '엔트리',
    teamId: cer.teamId,
    summary: `${cer.playerName} 공식 은퇴식 거행${cer.numberRetired ? ` · 등번호 #${cer.uniformNumber} 영구결번 지정` : ''}`,
    detail: cer.careerSummary,
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export interface OverseasReturneeContractTerms {
  hasOriginalClub: boolean;
  isOriginalClub: boolean;
  priceMultiplier: number;
  years: number;
  finalTotal: number;
  signingBonus: number;
  annualSalary: number;
}

export function getOverseasReturneeContractTerms(
  cand: OverseasReturnCandidate,
  teamId: TeamId,
  priceScale = 1.0
): OverseasReturneeContractTerms {
  const hasOriginalClub = cand.originalKboTeamId !== null;
  const isOriginalClub = hasOriginalClub && cand.originalKboTeamId === teamId;
  const priceMultiplier = !hasOriginalClub ? 1.0 : isOriginalClub ? 0.88 : 1.12;
  // 만 35세 이상 베테랑은 현실적으로 1~2년 단기 계약으로 제한
  const years =
    cand.age >= 38
      ? Math.min(cand.demandedYears, cand.ability >= 84 ? 2 : 1)
      : cand.age >= 35
      ? Math.min(cand.demandedYears, cand.ability >= 76 ? 2 : 1)
      : Math.max(1, cand.demandedYears);
  const yearScale = cand.demandedYears > 0 ? years / cand.demandedYears : 1;
  const finalTotal = Number(
    Math.max(2.0, cand.demandedTotalBillion * yearScale * priceMultiplier * priceScale).toFixed(1)
  );
  const signingBonus = Number((finalTotal * 0.35).toFixed(1));
  const annualSalary = Number(((finalTotal - signingBonus) / Math.max(1, years)).toFixed(2));
  return {
    hasOriginalClub,
    isOriginalClub,
    priceMultiplier,
    years,
    finalTotal,
    signingBonus,
    annualSalary,
  };
}

/**
 * 해외파 추적 명단(amateurAndOverseas.overseasPlayers) 중 계약 종료·방출되어
 * KBO 복귀 자격(canSignOriginalClub)을 획득한 KBO 출신 선수들을 해외 복귀 시장 풀에 자동 동기화
 */
export function syncEligibleAlumniToOverseasReturnPoolInPlace(career: CareerSave): void {
  const ovList = career.amateurAndOverseas?.overseasPlayers;
  if (!ovList || ovList.length === 0) return;
  if (!career.overseasReturnPool) career.overseasReturnPool = [];

  const isoDate = getCurrentCareerDate(career).isoDate;
  const activeKboNames = new Set(
    Object.values(career.players)
      .filter((p) => p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적')
      .map((p) => p.name)
  );

  for (const ov of ovList) {
    if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') continue;
    if (ov.originCategory === '아마추어직행') continue;
    if (activeKboNames.has(ov.name)) continue;

    const audit = evaluateOverseasReturnEligibility(ov, isoDate);
    if (!audit.canSignOriginalClub) continue;

    const alreadyInPool = career.overseasReturnPool.some(
      (c) => (c.permanentId && c.permanentId === ov.permanentId) || c.playerName === ov.name
    );
    if (alreadyInPool) continue;

    const years = ov.age >= 35 ? (ov.ability >= 76 ? 2 : 1) : ov.age >= 33 ? 3 : 4;
    const annualEst = Math.max(3.5, (ov.ability - 64) * 0.85);
    const totalEst = Number(Math.max(6, annualEst * years * 1.15).toFixed(1));
    career.overseasReturnPool.push({
      id: `ovr-alumni-${career.season}-${ov.permanentId}`,
      permanentId: ov.permanentId,
      playerName: ov.name,
      originalKboTeamId: ov.originalKboTeamId,
      returnPath: ov.originalKboTeamId ? '포스팅·임의탈퇴복귀' : '해외직행(원소속없음)',
      role: ov.role,
      position: ov.position,
      age: ov.age,
      ability: ov.ability,
      potential: ov.potential,
      overseasClub: `${ov.league} ${ov.clubName}`,
      overseasSummary: ov.originalKboTeamId
        ? `KBO 포스팅·해외 진출 후 복귀 가능 (원소속 ${KBO_TEAMS[ov.originalKboTeamId].shortName} 우선협상권 적용)`
        : 'KBO 출신 해외파 자유 복귀 가능',
      demandedYears: years,
      demandedTotalBillion: totalEst,
    });
  }
}

/**
 * 사용자 구단 및 AI 9개 구단 공용 해외 복귀 선수 영입 처리 (in-place)
 */
export function signOverseasReturneeForTeamInPlace(
  next: CareerSave,
  candidateId: string,
  teamId: TeamId,
  options?: { dateStr?: string; priceScale?: number }
): { player: Player; finalTotal: number; finalYears: number; signingBonus: number } {
  ensureDeepFranchiseState(next);
  const cand = (next.overseasReturnPool ?? []).find((c) => c.id === candidateId && !c.signed);
  if (!cand) throw new Error('영입 가능한 해외 복귀 선수가 아닙니다.');

  // 이미 KBO 현역으로 등록된 선수 중복 영입 차단
  const alreadyActive = Object.values(next.players).some(
    (p) => p.name === cand.playerName && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
  );
  if (alreadyActive) {
    cand.signed = true;
    throw new Error(`${cand.playerName} 선수는 이미 KBO 구단에 등록되어 있습니다.`);
  }

  // KBO 규약 제107조 2년 유예 징계 기간 중 우회 영입 차단 (단, 공식 복귀 시장 풀 등재 현역은 허용)
  assertNotBlockedByArticle107(next, cand.playerName, cand.permanentId, {
    allowReturnPoolWaiver: true,
  });

  const dateStr = options?.dateStr ?? getCurrentCareerDate(next).isoDate;
  const terms = getOverseasReturneeContractTerms(cand, teamId, options?.priceScale ?? 1.0);
  const { hasOriginalClub, isOriginalClub, years: finalYears, finalTotal, signingBonus, annualSalary } = terms;

  if (teamId === next.playerTeamId) {
    if (next.finances.cashBalanceBillion !== null && next.finances.cashBalanceBillion < signingBonus) {
      throw new Error(`해외 복귀 영입 계약금(${signingBonus}억 원)이 부족합니다.`);
    }
    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number((next.finances.cashBalanceBillion - signingBonus).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + signingBonus).toFixed(2));
    } else {
      next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + signingBonus).toFixed(2));
    }
  }

  cand.signed = true;
  cand.signedTeamId = teamId;
  cand.signedSeason = next.season;
  cand.signedDate = dateStr;
  cand.signedTotalBillion = finalTotal;
  cand.signedYears = finalYears;

  // 해외파 추적 명단(amateurAndOverseas.overseasPlayers)에 동일 선수가 존재하면 KBO복귀완료로 동기화 (이중 소속 차단)
  const matchedOv = next.amateurAndOverseas?.overseasPlayers.find(
    (ov) =>
      (cand.permanentId && ov.permanentId === cand.permanentId) ||
      (ov.name === cand.playerName && ov.status !== 'KBO복귀완료' && ov.status !== '은퇴')
  );

  const newId = `ovr-${next.season}-${teamId}-${cand.id}`;
  const permId = cand.permanentId ?? matchedOv?.permanentId ?? allocatePermanentPlayerId(next, 'KBO-OVR');
  const player: Player = {
    id: newId,
    permanentId: permId,
    birthYear: matchedOv?.birthYear ?? next.season - cand.age,
    birthDate: matchedOv?.birthDate ?? null,
    name: cand.playerName,
    teamId,
    category: '국내',
    role: cand.role,
    position: cand.position,
    pitchRole:
      cand.role === '투수'
        ? cand.position === 'SP'
          ? '선발'
          : cand.position === 'CL'
          ? '마무리'
          : '필승조'
        : undefined,
    age: cand.age,
    ability: cand.ability,
    potential: cand.potential,
    abilityStatus: '확정',
    form: 1,
    fatigue: 0,
    lastPitchedRound: -10,
    consecutiveAppearances: 0,
    rosterTier: '1군',
    gameDayActive: true,
    nationality: '한국',
    previousLeagueClub: cand.overseasClub,
    militaryStatus: '군필',
    serviceYears: hasOriginalClub ? 7 : 0,
    clubTenureSeasons: isOriginalClub ? 7 : 1,
    registrationDays: hasOriginalClub ? 1015 : 0,
    seasonRatingDelta: 0,
    lastEvaluatedAtTeamGames: next.gamesPlayed,
    morale: '만족',
    trainingFocus: null,
    injury: null,
    contract: {
      status: '확정',
      currency: 'KRW',
      years: finalYears,
      yearsRemaining: finalYears,
      annualSalary,
      signingBonus,
      totalValue: finalTotal,
      startSeason: next.season,
      endSeason: next.season + finalYears - 1,
      note: hasOriginalClub
        ? `해외 복귀 계약 (${cand.overseasClub} · 원소속 ${KBO_TEAMS[cand.originalKboTeamId!].shortName})`
        : `해외 직행 선수 KBO 입단 계약 (${cand.overseasClub} · 원소속 없음)`,
    },
    stats: cand.role === '타자' ? emptyBatterStats() : emptyPitcherStats(),
    postseasonStats: cand.role === '타자' ? emptyBatterStats() : emptyPitcherStats(),
    acquisitionInfo: {
      type: 'FA/트레이드',
      label: hasOriginalClub
        ? `해외 복귀 (${cand.overseasClub})`
        : `해외 직행 입단 (${cand.overseasClub} · 원소속 없음)`,
    },
  };
  const realProf = findRealPlayerClubProfile(cand.playerName, cand.originalKboTeamId ?? undefined);
  const cleanOverseasClub = cand.overseasClub
    .replace(/^MLB\s+/i, '')
    .replace(/\s*\(MLB\)\s*$/i, '')
    .split(/[·(/]/)[0]
    .trim();
  const overseasFrom = Math.max(2018, next.season - Math.max(2, cand.age >= 29 ? 4 : 3));
  const history = realProf
    ? realProf.history.map((h) => ({ ...h, league: h.league ?? (h.teamId ? 'KBO' : undefined) }))
    : [
        ...(cand.originalKboTeamId
          ? [
              {
                teamLabel: KBO_TEAMS[cand.originalKboTeamId].name,
                teamId: cand.originalKboTeamId,
                league: 'KBO' as const,
                fromSeason: Math.max(2014, overseasFrom - 5),
                toSeason: Math.max(2014, overseasFrom - 1),
              },
            ]
          : []),
        {
          teamLabel: cleanOverseasClub || cand.overseasClub,
          league: 'MLB' as const,
          mlbTeamName: cleanOverseasClub || cand.overseasClub,
          fromSeason: overseasFrom,
          toSeason: Math.max(overseasFrom, next.season - 1),
          note: 'MLB 활약',
        },
      ];
  const lastHist = history[history.length - 1];
  if (lastHist && !lastHist.toSeason) {
    lastHist.toSeason = Math.max(lastHist.fromSeason, next.season - 1);
  }
  history.push({
    teamLabel: KBO_TEAMS[teamId].name,
    teamId,
    league: 'KBO',
    fromSeason: next.season,
    transferDate: dateStr,
    moveType: '해외파 복귀',
    note: hasOriginalClub ? '해외파 KBO 복귀' : '해외 직행 KBO 입단',
  });
  player.careerTeamHistory = history;
  player.isOneClubMan =
    new Set(history.map((h) => h.teamId).filter((t): t is TeamId => Boolean(t))).size <= 1;
  reassignNonConflictingUniformNumber(next, player, teamId);
  ensurePlayerOotpRatingsInPlace(player);
  next.players[newId] = player;

  if (matchedOv) {
    matchedOv.status = 'KBO복귀완료';
    matchedOv.league = 'FA/방출';
    matchedOv.sourceKboPlayerId = newId;
    matchedOv.transferHistory.unshift({
      date: dateStr,
      season: next.season,
      eventType: 'KBO복귀',
      fromClub: matchedOv.clubName,
      toClub: KBO_TEAMS[teamId].name,
      note: `${KBO_TEAMS[teamId].name} ${finalYears}년 총액 ${finalTotal}억 원 입단 계약`,
    });
  }

  const ts = next.teams[teamId];
  if (ts) {
    if (player.role === '투수') {
      if (player.position === 'SP') {
        ts.rotationOrder.push(newId);
      } else {
        ts.bullpenOrder.unshift(newId);
      }
    } else {
      ts.benchOrder.unshift(newId);
    }
  }

  syncSeasonRookieEligibilityInPlace(next);

  const teamShort = KBO_TEAMS[teamId].shortName;
  const detailText = !hasOriginalClub
    ? '고교 졸업 후 해외 직행 선수(원소속 구단 없음) · 전 구단 동등 조건 계약'
    : isOriginalClub
    ? `원소속 구단(${KBO_TEAMS[cand.originalKboTeamId!].shortName}) 우선협상권 적용`
    : `원소속 구단(${KBO_TEAMS[cand.originalKboTeamId!].shortName}) 협상 결렬 후 영입 성사`;

  next.transactionLogs.unshift({
    id: `tx-ovr-sign-${Date.now()}-${teamId}-${cand.id}`,
    date: dateStr,
    type: '계약',
    teamId,
    summary: `[해외 복귀 영입] ${teamShort} ← ${cand.playerName} (${finalYears}년 총액 ${finalTotal}억 원 · 계약금 ${signingBonus}억)`,
    detail: detailText,
  });

  if (!next.newsFeed) next.newsFeed = [];
  const headline = `[해외 복귀 영입] ${teamShort}, ${cand.playerName}(${cand.position})과 ${finalYears}년 ${finalTotal}억 원 계약`;
  if (!next.newsFeed.some((n) => n.headline === headline && n.date === dateStr)) {
    next.newsFeed.unshift({
      id: `news-ovr-sign-${next.season}-${teamId}-${cand.id}`,
      season: next.phase === 'OFFSEASON' ? next.season + 1 : next.season,
      date: dateStr,
      category: '이적·계약',
      headline,
      body: `${cand.overseasClub} 출신 ${cand.playerName}(${cand.age}세 · OVR ${cand.ability}) 선수가 ${KBO_TEAMS[teamId].name}와 ${finalYears}년 총액 ${finalTotal}억 원(계약금 ${signingBonus}억 · 연봉 ${annualSalary}억) 계약을 체결했습니다. (${detailText})`,
      teamId,
      isHighlight: true,
    });
  }

  recordLeagueAcquisitionInPlace(
    next,
    {
      dedupeKey: `overseas-return-${next.season}-${cand.id}-${teamId}`,
      season: next.season,
      date: dateStr,
      category: 'FA',
      playerId: newId,
      playerName: cand.playerName,
      position: cand.position,
      previousTeamLabel: cand.overseasClub,
      acquiringTeamId: teamId,
      contractAmountLabel: `${finalYears}년 ${finalTotal}억 원`,
      note: hasOriginalClub ? '해외 복귀 영입' : '해외 직행 입단',
    },
    { pushNewsAlert: false }
  );

  next.updatedAt = new Date().toISOString();
  return { player, finalTotal, finalYears, signingBonus };
}

export function signOverseasReturnee(
  career: CareerSave,
  candidateId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (next) => {
    signOverseasReturneeForTeamInPlace(next, candidateId, next.playerTeamId);
    ensureDeepFranchiseState(next);
  });

  return { nextCareer, backupSnapshot };
}

function estimateClubPayrollBillion(career: CareerSave, teamId: TeamId): number {
  return computeOfficialSalaryCapSummary(career, teamId).teamTop40PayrollBillion;
}

function evaluateAiClubNeedForReturnee(
  career: CareerSave,
  teamId: TeamId,
  cand: OverseasReturnCandidate,
  capBillion: number,
  rng: SeededRng,
  allowNonOriginalClub: boolean
): number {
  const isOrig = cand.originalKboTeamId !== null && cand.originalKboTeamId === teamId;
  if (cand.originalKboTeamId !== null && !isOrig && !allowNonOriginalClub) {
    return -999;
  }

  const terms = getOverseasReturneeContractTerms(cand, teamId);
  const currentPayroll = estimateClubPayrollBillion(career, teamId);
  const projectedPayroll = currentPayroll + terms.annualSalary;
  if (projectedPayroll > capBillion * 1.28) {
    return -999;
  }

  const teamPlayers = Object.values(career.players).filter(
    (p) => p.teamId === teamId && (p.rosterTier === '1군' || p.rosterTier === '2군')
  );
  const samePosPlayers = teamPlayers
    .filter((p) => p.position === cand.position && p.role === cand.role)
    .sort((a, b) => b.ability - a.ability);

  const benchmarkOvr =
    cand.position === 'SP'
      ? (samePosPlayers[2]?.ability ?? 67)
      : cand.position === 'RP' || cand.position === 'CL'
      ? (samePosPlayers[1]?.ability ?? 68)
      : (samePosPlayers[0]?.ability ?? 67);

  const upgradeDelta = cand.ability - benchmarkOvr;
  let score = 48 + upgradeDelta * 2.4 + (cand.ability - 70) * 1.1;

  if (isOrig) score += 36;
  else if (cand.originalKboTeamId !== null) score -= 12;

  if (projectedPayroll <= capBillion * 0.95) score += 10;
  else if (projectedPayroll <= capBillion * 1.05) score += 2;
  else if (projectedPayroll > capBillion * 1.15) score -= 22;

  if (cand.age <= 29 && cand.potential >= 78) score += 6;
  score += rng.next() * 14 - 7;
  return score;
}

/**
 * 타 구단(AI 9개 구단)의 해외 복귀 선수 시장 영입 평가 및 계약 체결 (in-place)
 * - FA 입찰 라운드, 캘린더 경과, 오프시즌 마감 시 호출
 * - 사용자 구단은 자동 계약하지 않음 (단장 직접 승인 원칙 유지)
 */
export function runAiClubsOverseasReturneeMarketInPlace(
  career: CareerSave,
  options?: {
    dateStr?: string;
    maxSignings?: number;
    roundSeed?: number;
    forceSign?: boolean;
  }
): { signedSummaries: string[] } {
  ensureDeepFranchiseState(career);
  const dateStr = options?.dateStr ?? getCurrentCareerDate(career).isoDate;
  const maxSignings = options?.maxSignings ?? 1;
  const roundSeed = options?.roundSeed ?? 1;
  const forceSign = Boolean(options?.forceSign);
  const capBillion = getOfficialAnnualKboCapBillion(career.season);
  const rng = new SeededRng(
    (career.seed * 73 + career.season * 1301 + roundSeed * 97 + dateStr.length * 17) >>> 0
  );

  const signedSummaries: string[] = [];
  const unsigned = (career.overseasReturnPool ?? []).filter((c) => !c.signed);
  const aiTeams = TEAM_IDS.filter((tid) => tid !== career.playerTeamId);

  for (const cand of unsigned) {
    if (signedSummaries.length >= maxSignings) break;

    // 제107조 실제 2년 제한 대상자는 AI 구단도 영입 불가
    try {
      assertNotBlockedByArticle107(career, cand.playerName, cand.permanentId, {
        allowReturnPoolWaiver: true,
      });
    } catch {
      continue;
    }

    const allowNonOrig = forceSign || roundSeed >= 2;
    const scored = aiTeams
      .map((tid) => ({
        teamId: tid,
        score: evaluateAiClubNeedForReturnee(career, tid, cand, capBillion, rng, allowNonOrig),
      }))
      .filter((item) => item.score > (forceSign ? 20 : 48))
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) continue;
    const signChance = forceSign ? 1.0 : roundSeed >= 2 ? 0.85 : 0.72;
    if (rng.next() > signChance) continue;

    const winner = scored[0];
    // 복수 AI 구단 경합 시 약간 프리미엄 반영 (1.00~1.06)
    const competitiveScale =
      scored.length >= 2 && scored[1].score >= scored[0].score - 6 ? 1.04 : 1.0;

    try {
      const res = signOverseasReturneeForTeamInPlace(career, cand.id, winner.teamId, {
        dateStr,
        priceScale: competitiveScale,
      });
      signedSummaries.push(
        `${KBO_TEAMS[winner.teamId].shortName} ← ${cand.playerName} (해외복귀 ${res.finalYears}년 ${res.finalTotal}억)`
      );
    } catch {
      // Skip if duplicate or invalid
    }
  }

  // 추가로 amateurAndOverseas에 방출/복귀자격 보유한 AI 구단 출신 해외파도 자동 복귀 처리
  const ovList = career.amateurAndOverseas?.overseasPlayers ?? [];
  for (const ov of ovList) {
    if (signedSummaries.length >= maxSignings) break;
    if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') continue;
    if (ov.originCategory === '아마추어직행') continue;
    if (!ov.originalKboTeamId || ov.originalKboTeamId === career.playerTeamId) continue;

    const audit = evaluateOverseasReturnEligibility(ov, dateStr);
    if (!audit.canSignOriginalClub) continue;
    if (!forceSign && rng.next() > 0.65) continue;

    const returnTeamId = ov.originalKboTeamId;
    const years = ov.age >= 35 ? (ov.ability >= 76 ? 2 : 1) : ov.age >= 33 ? 2 : 4;
    const annualBillion = Math.max(4, Math.min(28, Number(((ov.ability - 62) * 0.85).toFixed(1))));
    const { totalBillion } = completeOverseasReturnToKboInPlace(career, ov, returnTeamId, {
      years,
      annualBillion,
      signingBonusBillion: Number((annualBillion * 0.4).toFixed(1)),
      isoDate: dateStr,
      notePrefix: '해외파 원소속 구단 복귀',
    });
    signedSummaries.push(
      `${KBO_TEAMS[returnTeamId].shortName} ← ${ov.name} (해외복귀 ${years}년 ${totalBillion}억)`
    );
  }

  return { signedSummaries };
}

/**
 * 해외 복귀 시장 1라운드 단독 진행 (AI 9개 구단의 해외 복귀 선수 영입 경쟁 반영)
 */
export function advanceOverseasReturneeMarketRound(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  signedSummaries: string[];
} {
  let signedSummaries: string[] = [];
  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (next) => {
    const roundSeed = ((next.overseasReturnPool ?? []).filter((c) => c.signed).length + 1) * 3 + 1;
    const res = runAiClubsOverseasReturneeMarketInPlace(next, {
      dateStr: getCurrentCareerDate(next).isoDate,
      maxSignings: 1,
      roundSeed,
      forceSign: true,
    });
    signedSummaries = res.signedSummaries;
    next.updatedAt = new Date().toISOString();
  });
  return { nextCareer, backupSnapshot, signedSummaries };
}

// =============================================================================
// 16. 5 CORE FRONT OFFICE SCENARIOS, EMERGENCY OPS & STAFF POACHING (#11, #22, #36)
// =============================================================================
export function maybeTriggerDeepFrontOfficeEvent(
  career: CareerSave,
  rng: SeededRng,
  dateStr: string
): void {
  ensureDeepFranchiseState(career);
  if (!career.clubEvents) career.clubEvents = [];
  const unresolvedCount = career.clubEvents.filter((e) => !e.resolved).length;
  if (unresolvedCount >= 2) return; // Avoid spamming multiple unresolved emergencies at once

  const standings = computeStandings(career.gamesLedger);
  const myRow = standings.find((r) => r.teamId === career.playerTeamId);
  const myRank = myRow?.rank ?? 5;

  // Scenario 1: 구단주 긴급 면담 (성적 부진 시 감독 교체 요구)
  const alreadyOwnerMeeting = career.clubEvents.some(
    (e) => e.type === '구단주긴급면담' && e.date.startsWith(`${career.season}`)
  );
  if (!alreadyOwnerMeeting && career.gamesPlayed >= 42 && myRank >= 8 && rng.next() < 0.35) {
    const mgr = (career.coaches[career.playerTeamId] ?? []).find((c) => c.role === '감독');
    career.clubEvents.unshift({
      id: `ev-owner-${career.season}-${career.gamesPlayed}`,
      date: dateStr,
      type: '구단주긴급면담',
      title: `구단주 긴급 면담: 리그 ${myRank}위 부진에 따른 감독 교체 요구`,
      description: `구단주가 최근 성적 부진(${myRow?.wins ?? 0}승 ${myRow?.losses ?? 0}패 · ${myRank}위)을 이유로 ${
        mgr?.name ?? '현 감독'
      } 사령탑의 전격 교체를 압박하고 있습니다.`,
      targetCoachId: mgr?.id,
      choices: [
        { id: 'fire_manager', label: '구단주 요구 수용 · 감독 경질 및 새 사령탑 선임', effectPreview: '구단주 신뢰 +10 · 위약금 3억 지출 · 팀 분위기 일시 하락' },
        { id: 'defend_manager', label: '현 감독 강력 재신임 (단장 책임 선언)', effectPreview: '감독 관계 +15 · 팀 분위기 [좋음] · 구단주 신뢰 -8' },
        { id: 'probation', label: '향후 15경기 조건부 유예 합의', effectPreview: '구단주 신뢰 -2 · 선수단 긴장감 및 컨디션 +1' },
      ],
    });
    return;
  }

  // Scenario 2: 코치/인재 유출 스카우트 (#22, #36)
  const alreadyPoach = career.clubEvents.some(
    (e) => e.type === '코치스카우트' && e.date.startsWith(`${career.season}`)
  );
  if (!alreadyPoach && career.gamesPlayed >= 54 && myRank <= 4 && rng.next() < 0.32) {
    const topCoach = (career.coaches[career.playerTeamId] ?? [])
      .filter((c) => c.role !== '감독')
      .sort((a, b) => b.ability - a.ability)[0];
    if (topCoach) {
      const poachingTeam = TEAM_IDS.filter((t) => t !== career.playerTeamId)[rng.int(0, 8)];
      career.clubEvents.unshift({
        id: `ev-poach-${career.season}-${career.gamesPlayed}`,
        date: dateStr,
        type: '코치스카우트',
        title: `인재 유출 경보: ${KBO_TEAMS[poachingTeam].shortName}, ${topCoach.name} ${topCoach.role}에게 감독/수석직 제안`,
        description: `상위권 성적을 이끈 우리 구단 ${topCoach.name} ${topCoach.role}(능력 ${topCoach.ability})에게 ${KBO_TEAMS[poachingTeam].name}이 파격적인 승격 조건으로 접촉했습니다.`,
        targetCoachId: topCoach.id,
        targetTeamId: poachingTeam,
        metaCostBillion: 2.5,
        choices: [
          { id: 'retain_coach', label: '연봉 인상 및 재계약으로 잔류 설득 (2.5억 원)', effectPreview: `${topCoach.name} 잔류 · 지도력 유지 · 구단 자금 -2.5억` },
          { id: 'release_promote', label: '이적 허용 후 내부 육성 코치 승격', effectPreview: '구단 평판·여론 +4 · 내부 신임 코치 승격 (예산 절감)' },
        ],
      });
      career.staffPoachingOffers = [
        ...(career.staffPoachingOffers ?? []),
        {
          id: `poach-${career.season}-${topCoach.id}`,
          date: dateStr,
          staffType: '코치',
          staffId: topCoach.id,
          staffName: topCoach.name,
          currentRole: topCoach.role,
          poachingTeamId: poachingTeam,
          offeredPosition: '차기 감독 후보 / 수석코치',
          retainCostBillion: 2.5,
        },
      ];
      return;
    }
  }

  // Scenario 3: 프랜차이즈 스타 이적 요청 (#36)
  const alreadyStarReq = career.clubEvents.some(
    (e) => e.type === '스타이적요청' && e.date.startsWith(`${career.season}`)
  );
  if (!alreadyStarReq && career.gamesPlayed >= 66 && rng.next() < 0.22) {
    const star = Object.values(career.players)
      .filter((p) => p.teamId === career.playerTeamId && p.category === '국내' && p.rosterTier === '1군' && p.ability >= 81)
      .sort((a, b) => b.ability - a.ability)[0];
    if (star) {
      career.clubEvents.unshift({
        id: `ev-star-${career.season}-${career.gamesPlayed}`,
        date: dateStr,
        type: '스타이적요청',
        title: `프랜차이즈 스타 ${star.name}, 거취 면담 및 장기계약/이적 요청`,
        description: `${star.name}(${star.position} · OVR ${star.ability}) 측 에이전트가 구단 비전과 대우를 확인하고자 하며, 장기 연장 계약이 어려울 경우 트레이드를 고려해 달라고 요청했습니다.`,
        targetPlayerId: star.id,
        metaCostBillion: 14,
        choices: [
          { id: 'extend_star', label: '4년 장기 연장 계약금 즉시 지급 (계약금 14억)', effectPreview: `${star.name} 4년 연장 · 사기 [만족] · 팬 여론 +8` },
          { id: 'trade_block', label: '트레이드 검토 수용 (시장가치 매물 등재)', effectPreview: '계약금 절약 · 선수 사기 [불만] · 트레이드 탭에서 매각 가능' },
          { id: 'persuade_star', label: '시즌 후 협상 약속 및 구단 비전 설득', effectPreview: '비용 0 · 팀 성적 상위권이면 만족, 하위권이면 불만 지속' },
        ],
      });
      return;
    }
  }

  // Scenario 4: 핵심 선수 해외 진출 선언 대비 (#10, #36)
  const alreadyOverseasEv = career.clubEvents.some(
    (e) => e.type === '핵심해외진출' && e.date.startsWith(`${career.season}`)
  );
  if (!alreadyOverseasEv && career.gamesPlayed >= 90 && rng.next() < 0.25) {
    const ace = Object.values(career.players).find(
      (p) => p.teamId === career.playerTeamId && p.overseasInterest === '적극희망' && p.rosterTier === '1군'
    );
    if (ace) {
      career.clubEvents.unshift({
        id: `ev-overseas-${career.season}-${career.gamesPlayed}`,
        date: dateStr,
        type: '핵심해외진출',
        title: `핵심 전력 ${ace.name}, 시즌 후 해외 리그(MLB/NPB) 도전 공식 의향 전달`,
        description: `${ace.name}(${ace.position} · 만 ${ace.age}세)이 시즌 종료 후 해외 진출 도전 의사를 구단에 전달했습니다. 전력 공백 대비 전략을 선택하세요.`,
        targetPlayerId: ace.id,
        metaCostBillion: 6,
        choices: [
          { id: 'support_and_scout', label: '해외 도전 지지 + 대체 유망주 집중 육성 (6억 투자)', effectPreview: `${ace.name} 사기·컨디션 +2 · 동일 포지션 2군 유망주 잠재력 +2` },
          { id: 'retention_bonus', label: '잔류 설득 특별 보너스 제안 (8억 투자)', effectPreview: '해외 진출 의향 완화 · 구단 자금 -8억' },
        ],
      });
      return;
    }
  }

  // Scenario 5: 구단 비상 운영 이벤트 (#11: 구장 보수 / 예산 축소 / 긴급 전력 보강)
  const alreadyEmerg = career.clubEvents.some(
    (e) => e.type === '비상운영' && e.date.startsWith(`${career.season}`)
  );
  if (!alreadyEmerg && career.gamesPlayed >= 36 && rng.next() < 0.24) {
    const fc = career.finances.facilityCondition!;
    if (fc.stadium < 78 || rng.next() < 0.5) {
      career.clubEvents.unshift({
        id: `ev-emerg-${career.season}-${career.gamesPlayed}`,
        date: dateStr,
        type: '비상운영',
        title: '비상 운영 경보: 홈 구장 안전 점검 및 조명·배수 긴급 보수 필요',
        description: '장마철을 앞두고 홈 구장 배수 설비와 외야 펜스 안전 보강이 권고되었습니다. 긴급 보수 또는 임시 운영 계획을 결정해야 합니다.',
        metaCostBillion: 5,
        choices: [
          { id: 'full_repair', label: '즉시 전면 긴급 보수 (5억 원)', effectPreview: '구장 컨디션 100% 회복 · 팬 여론 +6 · 부상 위험 감소' },
          { id: 'minimal_patch', label: '최소 응급 조치만 진행 (1.5억 원)', effectPreview: '비용 절감 · 구장 컨디션 -6 · 팬 여론 -4' },
        ],
      });
    } else {
      career.clubEvents.unshift({
        id: `ev-budget-${career.season}-${career.gamesPlayed}`,
        date: dateStr,
        type: '비상운영',
        title: '비상 운영 통보: 모기업 경기 침체로 구단주 시즌 운영비 긴축 요청',
        description: '모기업 재무본부에서 하반기 구단 예산 효율화를 요청했습니다. 비용 절감안과 구단 자구책을 선택하세요.',
        choices: [
          { id: 'cut_budget', label: '긴축 경영 수용 (비필수 운영비 절감)', effectPreview: '구단주 신뢰 +6 · 구단 현금 +4억 · 팀 사기 소폭 하락' },
          { id: 'keep_invest', label: '우승 도전 투자 유지 설득', effectPreview: '선수단 사기 유지 · 구단주 신뢰 -5 · 성적 압박 증가' },
        ],
      });
    }
  }
}

export function resolveDeepClubEvent(
  career: CareerSave,
  eventId: string,
  choiceId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave; summary: string } | null {
  const existing = (career.clubEvents ?? []).find((e) => e.id === eventId);
  if (
    !existing ||
    !['구단주긴급면담', '스타이적요청', 'FA경쟁입찰', '코치스카우트', '핵심해외진출', '비상운영'].includes(
      existing.type
    )
  ) {
    return null; // Let legacy handler handle older event types
  }

  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const ev = (next.clubEvents ?? []).find((e) => e.id === eventId)!;
  let summary = '결정을 완료했습니다.';

  if (ev.type === '구단주긴급면담') {
    if (choiceId === 'fire_manager') {
      const cost = 3;
      next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - cost).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cost).toFixed(2));
      const faMgr = (next.faCoaches ?? []).filter((c) => c.role === '감독' && c.name !== '선동열').sort((a, b) => b.ability - a.ability)[0];
      if (faMgr) {
        next.coaches[next.playerTeamId] = [
          { ...faMgr, teamId: next.playerTeamId, confirmed: true },
          ...(next.coaches[next.playerTeamId] ?? []).filter((c) => c.role !== '감독'),
        ];
        next.faCoaches = (next.faCoaches ?? []).filter((c) => c.id !== faMgr.id);
        summary = `구단주 요구를 수용해 사령탑을 교체하고 ${faMgr.name} 신임 감독을 선임했습니다 (위약금 3억).`;
      } else {
        summary = '감독 교체를 단행했습니다 (위약금 3억).';
      }
      if (next.ownerEval) next.ownerEval.ownerTrust = Math.min(100, next.ownerEval.ownerTrust + 10);
    } else if (choiceId === 'defend_manager') {
      next.teams[next.playerTeamId].atmosphere = '좋음';
      if (next.ownerEval) next.ownerEval.ownerTrust = Math.max(15, next.ownerEval.ownerTrust - 8);
      summary = '현 감독을 강력히 재신임했습니다. 선수단 결속이 높아졌지만 구단주 신뢰가 하락했습니다.';
    } else {
      if (next.ownerEval) next.ownerEval.ownerTrust = Math.max(20, next.ownerEval.ownerTrust - 2);
      for (const p of Object.values(next.players)) {
        if (p.teamId === next.playerTeamId && p.rosterTier === '1군') p.form = Math.min(5, p.form + 1);
      }
      summary = '향후 15경기 조건부 반등 유예에 합의했습니다. 선수단 집중력이 높아졌습니다.';
    }
  } else if (ev.type === '코치스카우트') {
    const cost = ev.metaCostBillion ?? 2.5;
    if (choiceId === 'retain_coach') {
      if ((next.finances.cashBalanceBillion ?? 0) < cost) {
        throw new Error(`코치 잔류 인상 비용(${cost}억 원)이 부족합니다.`);
      }
      next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - cost).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cost).toFixed(2));
      const coach = (next.coaches[next.playerTeamId] ?? []).find((c) => c.id === ev.targetCoachId);
      if (coach) coach.annualSalaryBillion = Number((coach.annualSalaryBillion + 0.8).toFixed(2));
      summary = `${coach?.name ?? '핵심 코치'}의 연봉 인상 재계약(${cost}억 원)으로 인재 유출을 막아냈습니다.`;
    } else {
      const leaving = (next.coaches[next.playerTeamId] ?? []).find((c) => c.id === ev.targetCoachId);
      if (leaving && ev.targetTeamId) {
        next.coaches[next.playerTeamId] = (next.coaches[next.playerTeamId] ?? []).filter((c) => c.id !== leaving.id);
        const replacement = (next.faCoaches ?? []).find((c) => c.role === leaving.role);
        if (replacement) {
          next.coaches[next.playerTeamId].push({ ...replacement, teamId: next.playerTeamId, confirmed: true });
          next.faCoaches = (next.faCoaches ?? []).filter((c) => c.id !== replacement.id);
        }
        next.teams[next.playerTeamId].fanSentiment = Math.min(100, (next.teams[next.playerTeamId].fanSentiment ?? 65) + 4);
        summary = `${leaving.name} ${leaving.role}의 ${KBO_TEAMS[ev.targetTeamId].shortName} 이적을 허락하고 ${
          replacement?.name ?? '내부 코치'
        }를 승격 배치했습니다.`;
      }
    }
    const po = (next.staffPoachingOffers ?? []).find((o) => o.staffId === ev.targetCoachId && !o.resolved);
    if (po) {
      po.resolved = true;
      po.outcome = summary;
    }
  } else if (ev.type === '스타이적요청') {
    const p = ev.targetPlayerId ? next.players[ev.targetPlayerId] : null;
    if (choiceId === 'extend_star' && p) {
      const bonus = ev.metaCostBillion ?? 14;
      if ((next.finances.cashBalanceBillion ?? 0) < bonus) {
        throw new Error(`장기 연장 계약금(${bonus}억 원)이 부족합니다.`);
      }
      next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - bonus).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + bonus).toFixed(2));
      p.contract.years = 4;
      p.contract.yearsRemaining = 4;
      p.contract.endSeason = next.season + 3;
      p.contract.status = '확정';
      p.morale = '만족';
      p.tradeRequested = false;
      next.teams[next.playerTeamId].fanSentiment = Math.min(100, (next.teams[next.playerTeamId].fanSentiment ?? 65) + 8);
      summary = `${p.name} 선수와 4년 장기 연장 계약(계약금 ${bonus}억)을 체결해 팬덤과 선수단을 안정시켰습니다.`;
    } else if (choiceId === 'trade_block' && p) {
      p.morale = '불만';
      p.tradeRequested = true;
      summary = `${p.name} 선수의 트레이드 검토를 수용했습니다. 계약·트레이드 화면에서 타 구단과 협상할 수 있습니다.`;
    } else if (p) {
      p.morale = '보통';
      summary = `${p.name} 선수와 시즌 종료 후 우선 협상을 약속하고 당장의 이적 요청을 진정시켰습니다.`;
    }
  } else if (ev.type === '핵심해외진출') {
    const p = ev.targetPlayerId ? next.players[ev.targetPlayerId] : null;
    if (choiceId === 'support_and_scout') {
      const cost = 6;
      if ((next.finances.cashBalanceBillion ?? 0) < cost) throw new Error('육성 투자 자금(6억 원)이 부족합니다.');
      next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - cost).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cost).toFixed(2));
      if (p) {
        p.morale = '만족';
        p.form = Math.min(5, p.form + 2);
      }
      const backup = Object.values(next.players).find(
        (x) => x.teamId === next.playerTeamId && x.id !== p?.id && x.position === p?.position && x.age <= 25
      );
      if (backup) backup.potential = Math.min(95, backup.potential + 2);
      summary = `${p?.name ?? '핵심 선수'}의 도전을 지지하며 대체 유망주(${backup?.name ?? '2군 유망주'}) 집중 육성에 6억 원을 투자했습니다.`;
    } else {
      const cost = 8;
      if ((next.finances.cashBalanceBillion ?? 0) < cost) throw new Error('잔류 보너스 자금(8억 원)이 부족합니다.');
      next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - cost).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cost).toFixed(2));
      if (p) {
        p.overseasInterest = '관심';
        p.morale = '만족';
      }
      summary = `특별 잔류 보너스(8억 원)로 ${p?.name ?? '핵심 선수'}의 해외 진출 시점을 조율했습니다.`;
    }
  } else if (ev.type === '비상운영') {
    if (choiceId === 'full_repair') {
      const cost = 5;
      if ((next.finances.cashBalanceBillion ?? 0) < cost) throw new Error('긴급 보수 비용(5억 원)이 부족합니다.');
      next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - cost).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cost).toFixed(2));
      next.finances.facilityCondition!.stadium = 100;
      next.teams[next.playerTeamId].fanSentiment = Math.min(100, (next.teams[next.playerTeamId].fanSentiment ?? 65) + 6);
      summary = '홈 구장 안전·배수 긴급 전면 보수(5억 원)를 완료해 컨디션을 100%로 회복했습니다.';
    } else if (choiceId === 'minimal_patch') {
      const cost = 1.5;
      next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) - cost).toFixed(2));
      next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + cost).toFixed(2));
      next.finances.facilityCondition!.stadium = Math.max(30, next.finances.facilityCondition!.stadium - 6);
      next.teams[next.playerTeamId].fanSentiment = Math.max(20, (next.teams[next.playerTeamId].fanSentiment ?? 65) - 4);
      summary = '최소 응급 보수(1.5억 원)만 진행해 비용을 아꼈으나 구장 노후도가 심화되었습니다.';
    } else if (choiceId === 'cut_budget') {
      next.finances.cashBalanceBillion = Number(((next.finances.cashBalanceBillion ?? 0) + 4).toFixed(2));
      if (next.ownerEval) next.ownerEval.ownerTrust = Math.min(100, next.ownerEval.ownerTrust + 6);
      summary = '긴축 경영을 수용해 운영비 4억 원을 절감하고 구단주 신뢰를 확보했습니다.';
    } else {
      if (next.ownerEval) next.ownerEval.ownerTrust = Math.max(20, next.ownerEval.ownerTrust - 5);
      next.teams[next.playerTeamId].atmosphere = '좋음';
      summary = '투자 유지를 관철해 선수단 사기를 지켰으나 구단주의 성적 기대치가 높아졌습니다.';
    }
  }

  ev.resolved = true;
  ev.resolutionSummary = summary;
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, summary };
}

// =============================================================================
// 17. DATA ANALYTICS CENTER ENGINE (#9)
// =============================================================================
export interface AnalyticsPlayerReport {
  player: Player;
  tradeValue: number;
  tradeTier: string;
  sprayLabel: string;
  splitText: string;
  rispOpsEst: string;
  pitchSummary: string;
  overuseRisk: OveruseMetrics['riskLevel'];
  traitLabel: string;
}

export interface PositionStrengthItem {
  position: Position;
  positionLabel: string;
  group: '야수' | '투수';
  /** 구단 해당 포지션 종합 평가 OVR (SP는 5선발 가중평균, RP는 필승/불펜 가중평균) */
  avgOvr: number;
  /** 리그 10개 구단 평균 OVR */
  leagueAvgOvr: number;
  /** 리그 평균 대비 편차 (+강점 / -취약) */
  diffFromLeagueAvg: number;
  /** KBO 10개 구단 내 포지션 순위 (1..10) */
  leagueRank: number;
  starterName: string;
  starterPlayerId?: string;
  starterAge?: number;
  starterOvr?: number;
  backupSummary: string;
  backupPlayerId?: string;
  prospectSummary?: string;
  depthCount: number;
  depthGrade: '두터움' | '보통' | '얇음';
  status: '강점' | '양호' | '보강필요';
  riskFlags: string[];
  diagnosis: string;
}

export interface TeamPositionSummary {
  overallAvg: number;
  overallRank: number;
  offenseAvg: number;
  offenseRank: number;
  rotationAvg: number;
  rotationRank: number;
  bullpenAvg: number;
  bullpenRank: number;
  strongestPositions: Position[];
  priorityPositions: Position[];
}

export type AcquisitionRouteType =
  | 'FA 영입'
  | '자유계약(방출)'
  | '웨이버 클레임'
  | '트레이드 (유력)'
  | '트레이드 (협상 가능)'
  | '트레이드 (대가 높음)';

export type AcquisitionFeasibility = '높음' | '보통' | '도전적';

export interface RecommendedTargetItem {
  player: Player;
  targetPosition: Position;
  isSecondaryFit: boolean;
  route: AcquisitionRouteType;
  feasibility: AcquisitionFeasibility;
  feasibilityScore: number; // 0..100
  upgradeDelta: number;
  tradeValue: number;
  estimatedCostLabel: string;
  sellerContext: string;
  reason: string;
}

export interface AnalyticsCenterData {
  batters: AnalyticsPlayerReport[];
  pitchers: AnalyticsPlayerReport[];
  positionStrength: PositionStrengthItem[];
  positionSummary: TeamPositionSummary;
  recommendedTargets: RecommendedTargetItem[];
  lineupInsight: string;
  overuseAlerts: Player[];
}

const POSITION_KOREAN_LABEL: Record<Position, string> = {
  C: '포수',
  '1B': '1루수',
  '2B': '2루수',
  '3B': '3루수',
  SS: '유격수',
  LF: '좌익수',
  CF: '중견수',
  RF: '우익수',
  DH: '지명타자',
  SP: '선발진 (5인)',
  RP: '불펜진',
  CL: '마무리',
};

interface RawPositionEvaluation {
  position: Position;
  score: number;
  starter: Player | null;
  starterLabel: string;
  backup: Player | null;
  backupLabel: string;
  prospect: Player | null;
  depthCount: number;
  depthGrade: '두터움' | '보통' | '얇음';
  riskFlags: string[];
  subDetail?: string;
}

function evaluateSingleTeamPositions(
  career: CareerSave,
  tid: TeamId
): Record<Position, RawPositionEvaluation> {
  const teamState = career.teams[tid];
  const activePool = Object.values(career.players).filter(
    (p) =>
      p.teamId === tid &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적' &&
      p.rosterTier !== 'FA' &&
      p.rosterTier !== '제외후보' &&
      !isMilitaryServing(p.militaryStatus)
  );
  const hitters = activePool.filter((p) => p.role === '타자');
  const pitchers = activePool.filter((p) => p.role === '투수');

  const lineupIds = teamState?.lineupOrder ?? [];
  const lineupPosMap = teamState?.lineupPositions ?? {};
  const rotationPlayers = (teamState?.rotationOrder ?? [])
    .map((id) => career.players[id])
    .filter((p): p is Player => Boolean(p) && p.teamId === tid && !isMilitaryServing(p.militaryStatus));
  const bullpenPlayers = (teamState?.bullpenOrder ?? [])
    .map((id) => career.players[id])
    .filter((p): p is Player => Boolean(p) && p.teamId === tid && !isMilitaryServing(p.militaryStatus));

  const result = {} as Record<Position, RawPositionEvaluation>;

  // 1) 8 Field Positions (C, 1B, 2B, 3B, SS, LF, CF, RF)
  const field8: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  for (const pos of field8) {
    const assignedStarterId = lineupIds.find((id) => (lineupPosMap[id] ?? career.players[id]?.position) === pos);
    const assignedStarter = assignedStarterId ? career.players[assignedStarterId] : null;
    const natPool = hitters
      .filter((p) => p.position === pos || p.secondaryPositions?.includes(pos))
      .sort((a, b) => b.ability - a.ability);

    const starter = assignedStarter && assignedStarter.teamId === tid ? assignedStarter : (natPool[0] ?? null);
    const others = natPool.filter((p) => p.id !== starter?.id);
    const backup = others[0] ?? null;
    const prospect =
      natPool
        .filter((p) => p.id !== starter?.id && p.age <= 24)
        .sort((a, b) => b.potential - a.potential || b.ability - a.ability)[0] ?? null;

    const starterOvr = starter ? starter.ability : 52;
    const backupBonus = backup ? Math.max(-2, Math.min(2.5, (backup.ability - 60) * 0.14)) : -2.0;
    const injuryPenalty = starter?.injury ? -3.5 : 0;
    const score = Number(Math.max(45, Math.min(96, starterOvr + backupBonus + injuryPenalty)).toFixed(1));

    const depthCount = Math.max(natPool.length, starter ? 1 + others.length : 0);
    const depthGrade: '두터움' | '보통' | '얇음' =
      (backup && backup.ability >= 65 && depthCount >= 3) || (backup && backup.ability >= 63 && prospect && prospect.potential >= 76)
        ? '두터움'
        : backup && backup.ability >= 56
        ? '보통'
        : '얇음';

    const riskFlags: string[] = [];
    if (starter?.injury) riskFlags.push('부상 이탈');
    if (starter && starter.age >= 36 && (!prospect || prospect.potential < 74) && (!backup || backup.age >= 31)) {
      riskFlags.push('노쇠화 주의');
    }
    if (starter && starter.contract.yearsRemaining <= 1) riskFlags.push('만료 예정');
    if (!backup || backup.ability < 55) riskFlags.push('백업 얇음');

    result[pos] = {
      position: pos,
      score,
      starter,
      starterLabel: starter ? `${starter.name} (${starter.ability})` : '공백',
      backup,
      backupLabel: backup ? `${backup.name} (${backup.ability})` : '백업 부족',
      prospect,
      depthCount,
      depthGrade,
      riskFlags: riskFlags.slice(0, 2),
    };
  }

  // 2) Designated Hitter (DH) — uses actual lineup DH slot or best remaining hitter!
  {
    const dhId = lineupIds.find((id) => lineupPosMap[id] === 'DH');
    const dhStarter =
      (dhId && career.players[dhId]?.teamId === tid ? career.players[dhId] : null) ??
      hitters
        .filter((p) => !lineupIds.includes(p.id) || lineupPosMap[p.id] === 'DH')
        .sort((a, b) => b.ability - a.ability)[0] ??
      null;
    const benchPool = hitters
      .filter((p) => p.id !== dhStarter?.id && !lineupIds.includes(p.id))
      .sort((a, b) => b.ability - a.ability);
    const backup = benchPool[0] ?? null;
    const prospect =
      benchPool
        .filter((p) => p.age <= 24)
        .sort((a, b) => b.potential - a.potential)[0] ?? null;

    const starterOvr = dhStarter ? dhStarter.ability : 58;
    const backupBonus = backup ? Math.max(-1.5, Math.min(2, (backup.ability - 62) * 0.12)) : -1.5;
    const score = Number(Math.max(45, Math.min(96, starterOvr + backupBonus + (dhStarter?.injury ? -3 : 0))).toFixed(1));
    const depthGrade: '두터움' | '보통' | '얇음' =
      backup && backup.ability >= 66 ? '두터움' : backup && backup.ability >= 59 ? '보통' : '얇음';
    const riskFlags: string[] = [];
    if (dhStarter?.injury) riskFlags.push('부상 이탈');
    if (dhStarter && dhStarter.age >= 37) riskFlags.push('베테랑 관리');
    if (dhStarter && dhStarter.contract.yearsRemaining <= 1) riskFlags.push('만료 예정');

    result.DH = {
      position: 'DH',
      score,
      starter: dhStarter,
      starterLabel: dhStarter
        ? `${dhStarter.name} (${dhStarter.ability}${dhStarter.position !== 'DH' ? ` · ${dhStarter.position}` : ''})`
        : '공백',
      backup,
      backupLabel: backup ? `${backup.name} (${backup.ability})` : '대타 자원 부족',
      prospect,
      depthCount: (dhStarter ? 1 : 0) + benchPool.length,
      depthGrade,
      riskFlags: riskFlags.slice(0, 2),
    };
  }

  // 3) Starting Rotation (SP — evaluates full 5-man rotation, not just #1 ace!)
  {
    const rot5 =
      rotationPlayers.length >= 3
        ? rotationPlayers.slice(0, 5)
        : pitchers
            .filter((p) => p.position === 'SP' || p.pitchRole === '선발')
            .sort((a, b) => b.ability - a.ability)
            .slice(0, 5);
    const sortedRot = [...rot5].sort((a, b) => b.ability - a.ability);
    const ace = sortedRot[0] ?? null;
    const top3 = sortedRot.slice(0, 3);
    const back2 = sortedRot.slice(3, 5);
    const top3Avg = top3.length > 0 ? top3.reduce((s, p) => s + p.ability, 0) / top3.length : 55;
    const back2Avg = back2.length > 0 ? back2.reduce((s, p) => s + p.ability, 0) / back2.length : Math.max(50, top3Avg - 12);
    const rawRotAvg = sortedRot.length > 0 ? sortedRot.reduce((s, p) => s + p.ability, 0) / sortedRot.length : 55;
    const score = Number(Math.max(45, Math.min(95, top3Avg * 0.65 + back2Avg * 0.35)).toFixed(1));

    const rotIdSet = new Set(sortedRot.map((p) => p.id));
    const depthStarters = pitchers
      .filter((p) => !rotIdSet.has(p.id) && (p.position === 'SP' || (p.v18Ratings?.pitching?.stamina_proxy ?? 50) >= 52))
      .sort((a, b) => b.ability - a.ability);
    const sixthStarter = depthStarters[0] ?? null;
    const prospect =
      pitchers
        .filter((p) => !rotIdSet.has(p.id) && p.age <= 24)
        .sort((a, b) => b.potential - a.potential)[0] ?? null;

    const depthGrade: '두터움' | '보통' | '얇음' =
      sortedRot.length >= 5 && back2Avg >= 67 && sixthStarter && sixthStarter.ability >= 60
        ? '두터움'
        : sortedRot.length >= 5 && back2Avg >= 60
        ? '보통'
        : '얇음';

    const riskFlags: string[] = [];
    if (sortedRot.some((p) => p.injury)) riskFlags.push('선발 부상');
    if (back2Avg < 63) riskFlags.push('4~5선발 보강');
    if (!sixthStarter || sixthStarter.ability < 56) riskFlags.push('대체선발 얇음');

    result.SP = {
      position: 'SP',
      score,
      starter: ace,
      starterLabel: ace ? `${ace.name} (${ace.ability}) 외 ${Math.max(0, sortedRot.length - 1)}명` : '공백',
      backup: sixthStarter,
      backupLabel: sixthStarter ? `6선발 ${sixthStarter.name} (${sixthStarter.ability})` : '대체 선발 부족',
      prospect,
      depthCount: sortedRot.length + depthStarters.length,
      depthGrade,
      riskFlags: riskFlags.slice(0, 2),
      subDetail: `5선발 평균 ${rawRotAvg.toFixed(1)} (1~3선발 ${top3Avg.toFixed(1)} · 4~5선발 ${back2Avg.toFixed(1)})`,
    };
  }

  // 4) Closer (CL)
  {
    const closer =
      bullpenPlayers.find((p) => p.pitchRole === '마무리' || p.position === 'CL') ??
      pitchers.filter((p) => p.position === 'CL' || p.pitchRole === '마무리').sort((a, b) => b.ability - a.ability)[0] ??
      bullpenPlayers[0] ??
      null;
    const setupPool = bullpenPlayers
      .filter((p) => p.id !== closer?.id)
      .sort((a, b) => b.ability - a.ability);
    const setup = setupPool[0] ?? null;
    const score = Number(
      Math.max(
        45,
        Math.min(95, (closer ? closer.ability : 55) + (setup ? Math.max(-1.5, Math.min(2, (setup.ability - 66) * 0.15)) : -2) + (closer?.injury ? -3.5 : 0))
      ).toFixed(1)
    );
    const depthGrade: '두터움' | '보통' | '얇음' =
      setup && setup.ability >= 70 ? '두터움' : setup && setup.ability >= 63 ? '보통' : '얇음';
    const riskFlags: string[] = [];
    if (closer?.injury) riskFlags.push('마무리 부상');
    if (closer && closer.age >= 36) riskFlags.push('노쇠화 주의');
    if (closer && closer.contract.yearsRemaining <= 1) riskFlags.push('만료 예정');
    if (!setup || setup.ability < 63) riskFlags.push('셋업 보강');

    result.CL = {
      position: 'CL',
      score,
      starter: closer,
      starterLabel: closer ? `${closer.name} (${closer.ability})` : '공백',
      backup: setup,
      backupLabel: setup ? `셋업 ${setup.name} (${setup.ability})` : '셋업 자원 부족',
      prospect: null,
      depthCount: (closer ? 1 : 0) + setupPool.slice(0, 2).length,
      depthGrade,
      riskFlags: riskFlags.slice(0, 2),
    };
  }

  // 5) Bullpen / Relief Pitchers (RP — evaluates full relief corps excluding closer!)
  {
    const closerId = result.CL.starter?.id;
    const activeRelievers = (
      bullpenPlayers.filter((p) => p.id !== closerId).length >= 3
        ? bullpenPlayers.filter((p) => p.id !== closerId)
        : pitchers.filter((p) => p.id !== closerId && !rotationPlayers.some((sp) => sp.id === p.id))
    ).sort((a, b) => b.ability - a.ability);

    const core3 = activeRelievers.slice(0, 3);
    const mid3 = activeRelievers.slice(3, 6);
    const coreAvg = core3.length > 0 ? core3.reduce((s, p) => s + p.ability, 0) / core3.length : 55;
    const midAvg = mid3.length > 0 ? mid3.reduce((s, p) => s + p.ability, 0) / mid3.length : Math.max(50, coreAvg - 8);
    const bullpenAvg =
      activeRelievers.slice(0, 6).length > 0
        ? activeRelievers.slice(0, 6).reduce((s, p) => s + p.ability, 0) / activeRelievers.slice(0, 6).length
        : 55;
    const score = Number(Math.max(45, Math.min(95, coreAvg * 0.65 + midAvg * 0.35)).toFixed(1));

    const leadRp = core3[0] ?? null;
    const secondRp = core3[1] ?? null;
    const rpFutures = pitchers
      .filter((p) => p.rosterTier === '2군' && p.position !== 'SP')
      .sort((a, b) => b.ability - a.ability);
    const prospect =
      pitchers
        .filter((p) => !rotationPlayers.some((sp) => sp.id === p.id) && p.age <= 24)
        .sort((a, b) => b.potential - a.potential)[0] ?? null;

    const depthGrade: '두터움' | '보통' | '얇음' =
      core3.length >= 3 && coreAvg >= 70 && midAvg >= 63
        ? '두터움'
        : core3.length >= 3 && coreAvg >= 64
        ? '보통'
        : '얇음';
    const riskFlags: string[] = [];
    if (core3.some((p) => p.injury)) riskFlags.push('필승조 부상');
    if (coreAvg < 66) riskFlags.push('필승조 보강');
    if (midAvg < 60) riskFlags.push('추격조 얇음');

    result.RP = {
      position: 'RP',
      score,
      starter: leadRp,
      starterLabel: leadRp ? `${leadRp.name} (${leadRp.ability}) 외 ${Math.max(0, activeRelievers.slice(0, 6).length - 1)}명` : '공백',
      backup: secondRp ?? rpFutures[0] ?? null,
      backupLabel: secondRp ? `핵심 불펜 ${secondRp.name} (${secondRp.ability})` : '필승조 부족',
      prospect,
      depthCount: activeRelievers.length + rpFutures.length,
      depthGrade,
      riskFlags: riskFlags.slice(0, 2),
      subDetail: `불펜 평균 ${bullpenAvg.toFixed(1)} (필승조 ${coreAvg.toFixed(1)} · 중간 ${midAvg.toFixed(1)})`,
    };
  }

  return result;
}

export function buildAnalyticsReport(career: CareerSave, teamId: TeamId = career.playerTeamId): AnalyticsCenterData {
  ensureDeepFranchiseState(career);
  const myPlayers = Object.values(career.players).filter(
    (p) => p.teamId === teamId && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
  );

  const batters: AnalyticsPlayerReport[] = myPlayers
    .filter((p) => p.role === '타자')
    .sort((a, b) => b.ability - a.ability)
    .map((p) => {
      const bp = p.battingProfile ?? buildBattingProfile(p);
      const tv = computePlayerTradeValue(p);
      const b = p.stats as BatterStats;
      const baseOps = calcOPS(b) ?? 0.68 + (p.ability - 70) * 0.011;
      const rispOps = Math.max(0.5, Math.min(1.25, baseOps + bp.rispClutch * 0.012));
      return {
        player: p,
        tradeValue: tv.index,
        tradeTier: tv.tierLabel,
        sprayLabel: `${bp.sprayTendency} (당 ${bp.pullPct}% · 중 ${bp.centerPct}% · 밀 ${bp.oppoPct}%)`,
        splitText: `${bp.bats} · 좌투 ${bp.vsLeftEdge >= 0 ? `+${bp.vsLeftEdge}` : bp.vsLeftEdge} / 우투 ${
          bp.vsRightEdge >= 0 ? `+${bp.vsRightEdge}` : bp.vsRightEdge
        }`,
        rispOpsEst: rispOps.toFixed(3).replace(/^0/, ''),
        pitchSummary: `변화구 대처 ${bp.vsBreaking} · 득점권 ${bp.rispClutch >= 0 ? `+${bp.rispClutch}` : bp.rispClutch}`,
        overuseRisk: p.overuse?.riskLevel ?? '정상',
        traitLabel: p.hiddenTrait ?? '꾸준함',
      };
    });

  const pitchers: AnalyticsPlayerReport[] = myPlayers
    .filter((p) => p.role === '투수')
    .sort((a, b) => b.ability - a.ability)
    .map((p) => {
      const rep = p.pitchRepertoire ?? buildPitchRepertoire(p);
      const tv = computePlayerTradeValue(p);
      return {
        player: p,
        tradeValue: tv.index,
        tradeTier: tv.tierLabel,
        sprayLabel: `${rep.throws} · 평균 ${rep.avgVelocityKmh}km/h (최고 ${rep.maxVelocityKmh})`,
        splitText: `제구 ${rep.command} · 변화구 ${rep.breakingSharpness} · 체력 ${rep.stamina}`,
        rispOpsEst: formatIP((p.stats as PitcherStats).outs ?? 0),
        pitchSummary: rep.pitches.map((pt) => `${pt.name}(${pt.grade})`).join(' · '),
        overuseRisk: p.overuse?.riskLevel ?? '정상',
        traitLabel: p.hiddenTrait ?? '꾸준함',
      };
    });

  // 10개 구단 전체 포지션 전력 평가 -> 리그 평균 및 순위(1~10위) 정확 산출
  const fieldPositions: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP', 'CL'];
  const allTeamsEval = {} as Record<TeamId, Record<Position, RawPositionEvaluation>>;
  for (const tid of TEAM_IDS) {
    allTeamsEval[tid] = evaluateSingleTeamPositions(career, tid);
  }
  const myEval = allTeamsEval[teamId];

  const positionStrength: PositionStrengthItem[] = fieldPositions.map((pos) => {
    const mine = myEval[pos];
    const allScores = TEAM_IDS.map((tid) => ({ tid, score: allTeamsEval[tid][pos].score })).sort(
      (a, b) => b.score - a.score
    );
    const leagueAvgOvr = Number(
      (allScores.reduce((s, x) => s + x.score, 0) / Math.max(1, allScores.length)).toFixed(1)
    );
    const leagueRank = allScores.findIndex((x) => x.tid === teamId) + 1;
    const diffFromLeagueAvg = Number((mine.score - leagueAvgOvr).toFixed(1));
    const avgOvr = Math.round(mine.score);

    // v19/v20 통합 척도 + 리그 상대 순위 결합 판정
    const status: '강점' | '양호' | '보강필요' =
      !mine.starter
        ? '보강필요'
        : (leagueRank <= 3 && mine.score >= 72) || mine.score >= 80
        ? '강점'
        : mine.score >= 66 && (leagueRank <= 7 || diffFromLeagueAvg >= -2.5)
        ? '양호'
        : '보강필요';

    let diagnosis = '';
    if (mine.subDetail) {
      diagnosis = mine.subDetail;
    } else if (status === '강점') {
      diagnosis =
        mine.depthGrade === '두터움'
          ? `리그 ${leagueRank}위 · 주전과 백업 모두 안정적`
          : `리그 ${leagueRank}위 핵심 전력 · 백업 뎁스 관리 권장`;
    } else if (status === '양호') {
      diagnosis =
        mine.riskFlags.includes('노쇠화 주의')
          ? `리그 평균권(${leagueRank}위) · 차세대 후계자 육성 필요`
          : `리그 평균권(${leagueRank}위) · 안정적 주전 운용 가능`;
    } else {
      diagnosis = !mine.starter
        ? '주전 공백 상태 · 즉각 영입 또는 콜업 필요'
        : `리그 ${leagueRank}위(평균 대비 ${diffFromLeagueAvg.toFixed(1)}) · FA·트레이드 보강 권장`;
    }

    return {
      position: pos,
      positionLabel: POSITION_KOREAN_LABEL[pos],
      group: pos === 'SP' || pos === 'RP' || pos === 'CL' ? '투수' : '야수',
      avgOvr,
      leagueAvgOvr,
      diffFromLeagueAvg,
      leagueRank,
      starterName: mine.starterLabel,
      starterPlayerId: mine.starter?.id,
      starterAge: mine.starter?.age,
      starterOvr: mine.starter?.ability,
      backupSummary: mine.backupLabel,
      backupPlayerId: mine.backup?.id,
      prospectSummary: mine.prospect ? `${mine.prospect.name} (${mine.prospect.age}세 · POT ${mine.prospect.potential})` : undefined,
      depthCount: mine.depthCount,
      depthGrade: mine.depthGrade,
      status,
      riskFlags: mine.riskFlags,
      diagnosis,
    };
  });

  // 구단 종합/타선/선발/불펜 리그 순위 산출
  const hitPositions: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const teamComposite = TEAM_IDS.map((tid) => {
    const ev = allTeamsEval[tid];
    const offense = hitPositions.reduce((s, p) => s + ev[p].score, 0) / hitPositions.length;
    const rotation = ev.SP.score;
    const bullpen = ev.RP.score * 0.68 + ev.CL.score * 0.32;
    const overall = offense * 0.48 + rotation * 0.32 + bullpen * 0.2;
    return { tid, offense, rotation, bullpen, overall };
  });
  const rankOf = (key: 'offense' | 'rotation' | 'bullpen' | 'overall') =>
    [...teamComposite].sort((a, b) => b[key] - a[key]).findIndex((x) => x.tid === teamId) + 1;
  const myComp = teamComposite.find((x) => x.tid === teamId)!;

  const strongestPositions = [...positionStrength]
    .sort((a, b) => b.diffFromLeagueAvg - a.diffFromLeagueAvg || a.leagueRank - b.leagueRank)
    .filter((p) => p.status === '강점')
    .slice(0, 3)
    .map((p) => p.position);

  const priorityPositions = [...positionStrength]
    .sort((a, b) => a.diffFromLeagueAvg - b.diffFromLeagueAvg || b.leagueRank - a.leagueRank)
    .filter((p) => p.status === '보강필요')
    .slice(0, 3)
    .map((p) => p.position);

  const positionSummary: TeamPositionSummary = {
    overallAvg: Number(myComp.overall.toFixed(1)),
    overallRank: rankOf('overall'),
    offenseAvg: Number(myComp.offense.toFixed(1)),
    offenseRank: rankOf('offense'),
    rotationAvg: Number(myComp.rotation.toFixed(1)),
    rotationRank: rankOf('rotation'),
    bullpenAvg: Number(myComp.bullpen.toFixed(1)),
    bullpenRank: rankOf('bullpen'),
    strongestPositions,
    priorityPositions,
  };

  // =========================================================================
  // 현실적 KBO 추천 영입 타깃 산출 엔진
  // - 프랜차이즈 스타 / 레전드 / 핵심 프랜차이즈 / 트레이드 불가 초특급 유망주 원천 차단
  // - 4대 실제 영입 경로 통합 평가: FA 시장 · 방출 자유계약 · 웨이버 · 타 구단 잉여/예비FA 트레이드
  // - 소속팀 포지션 중복(백업/2군 대기), 계약 만료(예비 FA), 순위(셀러/바이어), 멀티포지션 숙련도, 구단 자금 반영
  // =========================================================================
  const tradeWindow = getTradeWindowStatus(career);
  const standingsRows = computeStandings(career.gamesLedger);
  const teamRankMap = new Map<TeamId, number>();
  standingsRows.forEach((row, idx) => teamRankMap.set(row.teamId, idx + 1));

  const posStrengthMap = new Map(positionStrength.map((x) => [x.position, x]));
  const weakPosList = positionStrength
    .filter((x) => x.status === '보강필요')
    .sort((a, b) => a.diffFromLeagueAvg - b.diffFromLeagueAvg);
  const secondaryNeedList = positionStrength
    .filter(
      (x) =>
        x.status !== '보강필요' &&
        (x.depthGrade === '얇음' ||
          x.riskFlags.includes('노쇠화 주의') ||
          x.riskFlags.includes('부상 이탈') ||
          x.riskFlags.includes('만료 예정') ||
          x.diffFromLeagueAvg < 0)
    )
    .sort((a, b) => a.diffFromLeagueAvg - b.diffFromLeagueAvg);

  // 보강 우선순위 포지션 맵 (weight: 보강필요 1.0, 뎁스/노쇠/만료 주의 0.65)
  const needPositions = new Map<Position, { weight: number; item: PositionStrengthItem; needNote: string }>();
  for (const w of weakPosList) {
    needPositions.set(w.position, {
      weight: 1.0,
      item: w,
      needNote: `취약 ${POSITION_KOREAN_LABEL[w.position]}(리그 ${w.leagueRank}위)`,
    });
  }
  for (const s of secondaryNeedList) {
    if (needPositions.size >= 6) break;
    if (!needPositions.has(s.position)) {
      const flag = s.riskFlags[0] ?? (s.depthGrade === '얇음' ? '뎁스 보강' : '전력 보강');
      needPositions.set(s.position, {
        weight: 0.68,
        item: s,
        needNote: `${POSITION_KOREAN_LABEL[s.position]}(${flag})`,
      });
    }
  }
  // 전 포지션이 최상위권일 때도 하위 3개 포지션 뎁스 보강 후보를 현실적으로 제시
  if (needPositions.size < 3) {
    const lowest = [...positionStrength].sort((a, b) => a.diffFromLeagueAvg - b.diffFromLeagueAvg);
    for (const lo of lowest) {
      if (needPositions.size >= 3) break;
      if (!needPositions.has(lo.position)) {
        needPositions.set(lo.position, {
          weight: 0.55,
          item: lo,
          needNote: `${POSITION_KOREAN_LABEL[lo.position]} 뎁스 강화`,
        });
      }
    }
  }

  const waiverPlayerIds = new Set(
    (career.waiverPool ?? [])
      .filter((w) => w.fromTeamId !== teamId && Boolean(w.player?.id))
      .map((w) => w.player.id)
  );
  const myCash = career.finances.cashBalanceBillion;

  const findBestNeedFit = (
    p: Player
  ): { pos: Position; isSecondary: boolean; prof: number; weight: number; item: PositionStrengthItem; needNote: string } | null => {
    let best: {
      pos: Position;
      isSecondary: boolean;
      prof: number;
      weight: number;
      item: PositionStrengthItem;
      needNote: string;
      fitScore: number;
    } | null = null;

    for (const [needPos, meta] of needPositions.entries()) {
      if (p.role === '투수') {
        if (needPos !== 'SP' && needPos !== 'RP' && needPos !== 'CL') continue;
        const isDirect = p.position === needPos;
        const isBullpenCross =
          (needPos === 'CL' && p.position === 'RP' && p.ability >= 70) ||
          (needPos === 'RP' && (p.position === 'CL' || p.position === 'SP'));
        const isStarterCross =
          needPos === 'SP' && p.position === 'RP' && (p.v18Ratings?.pitching?.stamina_proxy ?? 50) >= 56;
        if (!isDirect && !isBullpenCross && !isStarterCross) continue;
        const fitScore = meta.weight * (isDirect ? 1.0 : 0.78);
        if (!best || fitScore > best.fitScore) {
          best = { pos: needPos, isSecondary: !isDirect, prof: isDirect ? 92 : 76, ...meta, fitScore };
        }
      } else {
        if (needPos === 'SP' || needPos === 'RP' || needPos === 'CL') continue;
        if (needPos === 'DH') {
          // 지명타자는 포수·유격수·중견수 같은 수비 특화 주전이 아니라 1B/LF/RF/DH 타격형 자원만 현실적으로 추천
          if (p.ability < 68 || p.position === 'C' || p.position === 'SS' || p.position === 'CF') continue;
          const fitScore = meta.weight * (p.position === 'DH' || p.position === '1B' || p.position === 'LF' || p.position === 'RF' ? 0.9 : 0.72);
          if (!best || fitScore > best.fitScore) {
            best = { pos: 'DH', isSecondary: p.position !== 'DH', prof: 88, ...meta, fitScore };
          }
          continue;
        }
        const isDirect = p.position === needPos;
        const prof = getPositionProficiency(p, needPos);
        if (!isDirect && prof < 64) continue;
        const fitScore = meta.weight * (isDirect ? 1.0 : 0.72 + (prof - 60) * 0.006);
        if (!best || fitScore > best.fitScore) {
          best = { pos: needPos, isSecondary: !isDirect, prof, ...meta, fitScore };
        }
      }
    }
    return best;
  };

  interface ScoredTargetCandidate extends RecommendedTargetItem {
    compositeScore: number;
  }

  const scoredCandidates: ScoredTargetCandidate[] = [];

  for (const p of Object.values(career.players)) {
    if (p.teamId === teamId && p.rosterTier !== 'FA') continue;
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적' || p.rosterTier === '육성' || p.rosterTier === '제외후보') {
      continue;
    }
    if (p.category !== '국내') continue;
    if (isMilitaryServing(p.militaryStatus)) continue;
    if (p.injury && p.injury.daysRemaining >= 21) continue;

    const isWaiver = waiverPlayerIds.has(p.id);
    const isReleasedFreeAgent = p.rosterTier === 'FA' && Boolean(p.releasedAfter2026);
    const isMarketFa = p.rosterTier === 'FA' && !isReleasedFreeAgent;
    const isDirectSigning = isWaiver || isReleasedFreeAgent || isMarketFa;

    // 우리 팀 원소속 이탈 FA는 별도 재계약 섹션에서 관리하므로 외부 영입 타깃에서 제외
    if (isDirectSigning && (p.formerTeamId ?? p.teamId) === teamId && !isReleasedFreeAgent) continue;
    // 올 시즌 이미 FA 계약 완료한 타 구단 선수는 트레이드 불가
    if (!isDirectSigning && p.signedAsFaSeason === career.season) continue;

    const fit = findBestNeedFit(p);
    if (!fit) continue;

    const myPosInfo = posStrengthMap.get(fit.pos);
    const myStarterOvr = myPosInfo?.starterOvr ?? myPosInfo?.avgOvr ?? 66;
    const upgradeDelta = p.ability - myStarterOvr;

    // 실질 전력 기여 기준: 주전 업그레이드 또는 얇은 뎁스/노쇠 후계자 보강
    const fillsThinOrAging =
      myPosInfo != null &&
      (myPosInfo.depthGrade === '얇음' || myPosInfo.riskFlags.includes('노쇠화 주의')) &&
      ((p.ability >= 62 && p.age <= 29) || (p.potential >= 75 && p.age <= 25));
    const isImmediateUpgrade = p.ability >= Math.max(64, myStarterOvr - 1);
    const isUsefulBullpen = (fit.pos === 'RP' || fit.pos === 'CL') && p.ability >= 65;
    if (!isImmediateUpgrade && !fillsThinOrAging && !isUsefulBullpen) continue;

    // 너무 고령이면서 기량이 하락한 선수 제외 (단, FA/자유계약 즉시전력 베테랑은 36세까지 허용)
    if (p.age >= 37 || (p.age >= 35 && p.ability < 68)) continue;

    const tv = computePlayerTradeValue(p);
    let route: AcquisitionRouteType;
    let feasibility: AcquisitionFeasibility;
    let feasibilityScore = 50;
    let sellerContext = '';
    let estimatedCostLabel = '';

    if (isWaiver) {
      route = '웨이버 클레임';
      feasibility = '높음';
      feasibilityScore = 92;
      sellerContext = '웨이버 공시 중 (선수 교환 없이 즉시 영입 가능)';
      estimatedCostLabel = '웨이버 이적료 300만 원 · 기존 연봉 승계';
    } else if (isReleasedFreeAgent) {
      route = '자유계약(방출)';
      feasibility = '높음';
      feasibilityScore = 90;
      sellerContext = '방출 자유계약 신분 (보상선수·트레이드 불필요)';
      estimatedCostLabel = '예상 계약: 단년 최저연봉~1억 원대';
    } else if (isMarketFa) {
      route = 'FA 영입';
      const grade = p.contract.faGrade ?? p.faApproved2027Grade ?? (p.age >= 35 ? 'C' : p.ability >= 80 ? 'A' : p.ability >= 73 ? 'B' : 'C');
      const estYears = p.age >= 35 ? 2 : p.age >= 32 ? 3 : 4;
      const estAnnual = Math.max(1.5, Number(((p.ability - 64) * 0.72).toFixed(1)));
      const estTotal = Number((estYears * estAnnual).toFixed(1));
      const cashNeeded = estTotal * 0.4;
      const affordable = myCash === null || myCash >= cashNeeded;
      feasibilityScore =
        (grade === 'C' ? 84 : grade === 'B' ? 72 : 60) + (affordable ? 10 : -24);
      feasibility = feasibilityScore >= 76 ? '높음' : feasibilityScore >= 56 ? '보통' : '도전적';
      sellerContext = `현재 FA 시장 등록 (${grade}등급 · ${
        grade === 'C' ? '보상선수 없음' : grade === 'B' ? '보호 25인 외 보상' : '보호 20인 외 보상'
      })`;
      estimatedCostLabel = `예상 FA ${estYears}년 약 ${estTotal.toFixed(1)}억${!affordable ? ' (보유 자금 주의)' : ''}`;
    } else {
      // 트레이드 후보 현실성 엄격 심사 (프랜차이즈 보호 + 소속팀 포지션 중복/순위/계약만료)
      const fran = evaluateFranchiseStar(career, p);

      // 1) 트레이드 불가 프랜차이즈 스타 / 레전드 / 핵심 프랜차이즈 / 24세 이하 초특급 영건 원천 제외!
      if (
        fran.isHardTradeLocked ||
        fran.protectionTier === '프랜차이즈 스타' ||
        fran.tier === '레전드' ||
        fran.tier === '핵심 프랜차이즈' ||
        (p.age <= 24 && (p.ability >= 76 || p.potential >= 84))
      ) {
        continue;
      }

      // 2) 소속팀 로스터 내 실제 입지 정밀 판별 (선발 5인 로테이션·필승조 3인·주전 야수 9인 정확 반영)
      const sellerTeamState = career.teams[p.teamId];
      const sellerEval = allTeamsEval[p.teamId]?.[p.position];
      const sellerStarter = sellerEval?.starter;
      const inSellerRotation5 = Boolean(sellerTeamState?.rotationOrder.slice(0, 5).includes(p.id));
      const inSellerCoreBullpen = Boolean(
        p.role === '투수' &&
          !inSellerRotation5 &&
          (p.pitchRole === '마무리' || p.pitchRole === '필승조' || p.pitchRole === '셋업맨' || sellerTeamState?.bullpenOrder.slice(0, 3).includes(p.id))
      );
      const inSellerLineup9 = Boolean(sellerTeamState?.lineupOrder.slice(0, 9).includes(p.id));
      const isSellerCoreRole =
        p.position === 'SP'
          ? inSellerRotation5
          : p.position === 'CL' || p.position === 'RP'
            ? inSellerCoreBullpen || sellerStarter?.id === p.id
            : inSellerLineup9 || sellerStarter?.id === p.id;

      const sellerHasBetterStarter =
        p.role === '타자'
          ? Boolean(sellerStarter && sellerStarter.id !== p.id && !inSellerLineup9 && sellerStarter.ability >= p.ability - 1)
          : p.position === 'SP'
            ? !inSellerRotation5 && (sellerTeamState?.rotationOrder.length ?? 0) >= 5
            : !inSellerCoreBullpen && (sellerTeamState?.bullpenOrder.length ?? 0) >= 6;

      const sellerDepthCount = sellerEval?.depthCount ?? 1;
      const sellerRank = teamRankMap.get(p.teamId) ?? 5;
      // KBO 보류선수는 매년 1년 재계약이므로, 실제 '예비 FA'는 계약 잔여 1년 이하이면서 FA 취득 연차(고졸 7년+/대졸 6년+)에 근접한 경우만 해당
      const faQual = computeFaQualification(career, p);
      const isImpendingFa =
        p.contract.yearsRemaining <= 1 &&
        (faQual.isFaEligible || faQual.creditedSeasons >= faQual.requiredSeasons - 1 || p.serviceYears >= 7);
      const isSellerRebuilding = sellerRank >= 7 && career.gamesPlayed >= 20;
      const isMinorOrBackup = p.rosterTier === '2군' || !isSellerCoreRole;

      // 최근 다년 대형 계약(FA/비FA 3년 이상 잔여) 체결 직후 주전 선수는 트레이드 불가
      if (p.contract.yearsRemaining >= 3 && p.contract.totalValue >= 20 && isSellerCoreRole) {
        continue;
      }

      if (fran.protectionTier === '핵심 유망주') {
        if (p.potential >= 82 || isSellerCoreRole || !sellerHasBetterStarter) {
          continue;
        }
      }

      // 3) 구단 핵심 선수(protectionTier === '구단 핵심 선수')는 실제 예비 FA이거나 백업으로 밀린 예외 상황만 허용
      if (fran.protectionTier === '구단 핵심 선수') {
        const hasRealOpening =
          (isImpendingFa && (isSellerRebuilding || sellerDepthCount >= 3)) ||
          (sellerHasBetterStarter && p.age >= 30);
        if (!hasRealOpening) {
          continue;
        }
      }

      // 4) 팀 핵심 주전(OVR 74+)이면서 예비 FA도 아니고 리빌딩 매물도 아니면 비현실적 -> 제외
      if (isSellerCoreRole && p.ability >= 74 && !isImpendingFa && !isSellerRebuilding) {
        continue;
      }

      // 현실적 트레이드 성사 가능성 점수 산출 (0~100)
      let score = 46;
      const ctxParts: string[] = [];

      if (sellerHasBetterStarter) {
        score += 24;
        ctxParts.push(
          p.role === '타자' && sellerStarter
            ? `${KBO_TEAMS[p.teamId].shortName} ${POSITION_KOREAN_LABEL[p.position]} 주전(${sellerStarter.name}) 중복 · ${
                p.rosterTier === '2군' ? '2군 대기' : '백업 출장'
              }`
            : `${KBO_TEAMS[p.teamId].shortName} ${POSITION_KOREAN_LABEL[p.position]} 뎁스 잉여 (${p.rosterTier} 대기)`
        );
      } else if (isMinorOrBackup && sellerDepthCount >= 3) {
        score += 18;
        ctxParts.push(`${KBO_TEAMS[p.teamId].shortName} 포지션 잉여 자원 (${p.rosterTier})`);
      }

      if (isImpendingFa) {
        score += 15;
        ctxParts.push('시즌 후 FA 예정(예비 FA)');
      }
      if (isSellerRebuilding && p.age >= 29) {
        score += 12;
        ctxParts.push(`하위권(${sellerRank}위) 구단 베테랑 매물`);
      }
      if (p.tradeRequested || (p.dissatisfaction ?? 0) >= 60) {
        score += 15;
        ctxParts.push('출전 기회 불만 · 이적 의향');
      }
      if (fran.protectionTier === '구단 핵심 선수') {
        score -= 22;
      } else if (fran.protectionTier === '핵심 유망주') {
        score -= 14;
      } else if (fran.protectionTier === '전력 외 선수') {
        score += 16;
      }
      if (isSellerCoreRole && !isImpendingFa) {
        score -= 16;
      }
      if (tv.index >= 82) {
        score -= 10;
      }
      if (!tradeWindow.isOpen) {
        score -= 10;
        ctxParts.push('트레이드 마감(오프시즌 추진)');
      }

      feasibilityScore = Math.max(20, Math.min(92, Math.round(score)));
      if (feasibilityScore < 44) continue; // 성사 가능성이 너무 낮은 비현실적 매물 차단

      if (feasibilityScore >= 70) {
        route = '트레이드 (유력)';
        feasibility = '높음';
      } else if (feasibilityScore >= 54) {
        route = '트레이드 (협상 가능)';
        feasibility = '보통';
      } else {
        route = '트레이드 (대가 높음)';
        feasibility = '도전적';
      }

      sellerContext =
        ctxParts.length > 0
          ? ctxParts.slice(0, 2).join(' · ')
          : `${KBO_TEAMS[p.teamId].shortName} ${p.rosterTier} 협상 가능 매물`;

      estimatedCostLabel =
        tv.index >= 86
          ? '예상 대가: 1군 주전급 1명 + 유망주/지명권'
          : tv.index >= 76
            ? '예상 대가: 1군 준주전급 1명 또는 상위 유망주'
            : tv.index >= 64
              ? '예상 대가: 1군 백업 1명 또는 2군 유망주'
              : '예상 대가: 2군 백업 또는 현금 트레이드';
    }

    const posRoleNote = fit.isSecondary
      ? `${fit.needNote} (보조 ${fit.pos} 숙련 ${fit.prof} 활용)`
      : fit.needNote;
    const deltaLabel =
      upgradeDelta >= 2
        ? `+${upgradeDelta}pt 즉시 보강`
        : upgradeDelta >= 0
          ? '주전 경쟁·뎁스 보강'
          : p.age <= 26 && p.potential >= 74
            ? `차세대 육성(POT ${p.potential})`
            : '1군 백업·로테이션 보강';

    const reason = `${posRoleNote} · ${deltaLabel} · ${sellerContext}`;

    // 종합 현실성 추천 점수: 보강 필요도(40%) + 실제 성사 가능성(38%) + 실전/잠재 기여도(22%)
    const impactScore = Math.max(
      25,
      Math.min(
        95,
        55 + upgradeDelta * 3.2 + (p.age <= 27 && p.potential >= 75 ? (p.potential - 70) * 0.9 : 0)
      )
    );
    const needScore = fit.weight * 85 + (fit.isSecondary ? -6 : 6);
    const compositeScore = Number(
      (needScore * 0.4 + feasibilityScore * 0.38 + impactScore * 0.22).toFixed(2)
    );

    scoredCandidates.push({
      player: p,
      targetPosition: fit.pos,
      isSecondaryFit: fit.isSecondary,
      route,
      feasibility,
      feasibilityScore,
      upgradeDelta,
      tradeValue: tv.index,
      estimatedCostLabel,
      sellerContext,
      reason,
      compositeScore,
    });
  }

  // 포지션 편중 방지(포지션당 최대 3명) + '대가 높음' 최대 2명 제한으로 현실적인 TOP 8 구성
  scoredCandidates.sort((a, b) => b.compositeScore - a.compositeScore || b.feasibilityScore - a.feasibilityScore);
  const recommendedTargets: RecommendedTargetItem[] = [];
  const countByPos = new Map<Position, number>();
  let blockbusterCount = 0;

  for (const cand of scoredCandidates) {
    if (recommendedTargets.length >= 8) break;
    const posCnt = countByPos.get(cand.targetPosition) ?? 0;
    if (posCnt >= 3) continue;
    if (cand.route === '트레이드 (대가 높음)') {
      if (blockbusterCount >= 2) continue;
      blockbusterCount += 1;
    }
    countByPos.set(cand.targetPosition, posCnt + 1);
    const { compositeScore: _ignored, ...cleanItem } = cand;
    void _ignored;
    recommendedTargets.push(cleanItem);
  }

  const overuseAlerts = myPlayers.filter((p) => p.rosterTier === '1군' && (p.overuse?.riskLevel === '위험' || p.overuse?.riskLevel === '주의'));

  const topRisp = [...batters].sort((a, b) => Number(b.rispOpsEst) - Number(a.rispOpsEst)).slice(0, 3);
  const weakLabels = priorityPositions.map((p) => POSITION_KOREAN_LABEL[p]);
  const lineupInsight = `종합 전력 리그 ${positionSummary.overallRank}위 (타선 ${positionSummary.offenseRank}위 · 선발 ${positionSummary.rotationRank}위 · 불펜 ${positionSummary.bullpenRank}위) · 득점권 핵심: ${topRisp
    .map((x) => `${x.player.name}(.${Math.round(Number(x.rispOpsEst) * 1000)})`)
    .join(', ')}${weakLabels.length > 0 ? ` · 우선 보강: ${weakLabels.join(', ')}` : ' · 전 포지션 밸런스 양호'}`;

  return {
    batters,
    pitchers,
    positionStrength,
    positionSummary,
    recommendedTargets,
    lineupInsight,
    overuseAlerts,
  };
}

// =============================================================================
// 18. 12-STEP OFFSEASON NAVIGATION HELPERS (#35)
// =============================================================================
export function setOffseasonStep12(
  career: CareerSave,
  step: OffseasonStep12
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);
  ensureDeepFranchiseState(next);
  const prevStep = next.offseasonStep12;
  if (prevStep && !(next.completedOffseasonSteps12 ?? []).includes(prevStep)) {
    next.completedOffseasonSteps12 = [...(next.completedOffseasonSteps12 ?? []), prevStep];
  }
  next.offseasonStep12 = step;

  // Populate salary demands when entering SALARY_NEGOTIATION
  if (step === 'SALARY_NEGOTIATION') {
    for (const p of Object.values(next.players)) {
      if (p.teamId === next.playerTeamId && p.category === '국내' && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적') {
        if (p.demandedSalaryBillion === undefined) {
          p.demandedSalaryBillion = computePlayerSalaryDemand(p);
        }
        if (!p.salaryNegotiationStatus) {
          p.salaryNegotiationStatus = p.contract.yearsRemaining > 1 ? '협상완료' : '미협상';
        }
      }
    }
  }
  // If fired during OWNER_EVAL, populate GM job offers
  if (step === 'OWNER_EVAL' && next.ownerEval?.isFired && (next.gmJobOffers ?? []).length === 0) {
    next.gmJobOffers = generateGmJobOffers(next);
  }

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

export function getAverageStarterOvr(career: CareerSave, teamId: TeamId): number {
  const lineup = career.teams[teamId]?.lineupOrder ?? [];
  const rot = career.teams[teamId]?.rotationOrder ?? [];
  const ids = [...lineup, ...rot];
  const players = ids.map((id) => career.players[id]).filter(Boolean);
  if (players.length === 0) return 75;
  return Number((players.reduce((s, p) => s + p.ability, 0) / players.length).toFixed(1));
}
