import {
  Position,
  V18BattingRatings,
  V18PitchingRatings,
  V18SeasonStatRecord,
} from '../types/kbo';

export interface UnifiedRatingEvaluationInput {
  id: string;
  name: string;
  role: '투수' | '타자';
  position: Position;
  pitchRole?: string;
  age: number;
  category: '국내' | '외국인' | '아시아쿼터';
  status?: string;
  draftRound?: number | null;
  draftPick?: number | null;
  salaryKrw?: number | null;
  retired?: boolean;
  currentOvr: number;
  currentPot: number;
  currentBatting: V18BattingRatings | null;
  currentPitching: V18PitchingRatings | null;
  careerRecords: V18SeasonStatRecord[];
  futures2026?: {
    kind: string;
    values: Record<string, number>;
  } | null;
  isMilitaryServing?: boolean;
}

export interface UnifiedRatingEvaluationResult {
  prevOvr: number;
  prevPot: number;
  newOvr: number;
  newPot: number;
  ovrDelta: number;
  potDelta: number;
  tier: string;
  reason: string;
  bounceBackEligible: boolean;
  batting: V18BattingRatings | null;
  pitching: V18PitchingRatings | null;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return (lo + hi) * 0.5;
  return Math.max(lo, Math.min(hi, v));
}

export function parseInningsFloat(ipVal: unknown): number {
  if (typeof ipVal === 'number') return Number.isFinite(ipVal) ? ipVal : 0;
  if (typeof ipVal !== 'string') return 0;
  const s = ipVal.trim();
  const wholeFrac = s.match(/^(\d+)\s+(\d)\/3$/);
  if (wholeFrac) return Number(wholeFrac[1]) + Number(wholeFrac[2]) / 3;
  const fracOnly = s.match(/^(\d)\/3$/);
  if (fracOnly) return Number(fracOnly[1]) / 3;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 2026 등 OPS 필드가 생략된 시즌 타격 레코드에서도 정확한 OPS를 산출
 */
export function resolveRecordOps(r: V18SeasonStatRecord): number | null {
  if (typeof r.OPS === 'number' && Number.isFinite(r.OPS) && r.OPS > 0) {
    return r.OPS;
  }
  const ab = r.AB ?? 0;
  const pa = r.PA ?? ab;
  const h = r.H ?? 0;
  if (ab <= 0 || pa <= 0) return null;
  const avg = typeof r.AVG === 'number' && Number.isFinite(r.AVG) ? r.AVG : h / ab;
  const b2 = r.B2 ?? 0;
  const b3 = r.B3 ?? 0;
  const hr = r.HR ?? 0;
  const bb = typeof r.BB === 'number' ? r.BB : Math.max(0, pa - ab);
  const obp = clamp((h + bb) / Math.max(1, pa), 0.15, 0.58);
  const tb = h + b2 + 2 * b3 + 3 * hr;
  const slg = tb > 0 ? clamp(tb / Math.max(1, ab), 0.15, 0.85) : clamp(avg * 1.42, 0.18, 0.72);
  return Number((obp + slg).toFixed(3));
}

/**
 * 통합 타자 오버롤 산출 공식 (gamePlayEngine 세부 능력치 가중치와 100% 일치)
 */
export function computeBatterOverallFromSubRatings(
  b: V18BattingRatings,
  position: Position
): number {
  const offenseCore =
    b.contact * 0.28 +
    b.power * 0.27 +
    b.discipline * 0.17 +
    b.avoid_k * 0.10 +
    b.steal_production * 0.05 +
    b.availability * 0.05 +
    b.speed * 0.08;

  let raw: number;
  if (position === 'C' || position === 'SS' || position === 'CF' || position === '2B') {
    raw = offenseCore * 0.79 + b.fielding * 0.13 + b.arm * 0.04 + b.speed * 0.04;
  } else if (position === '3B' || position === 'RF' || position === 'LF') {
    raw = offenseCore * 0.85 + b.fielding * 0.08 + b.arm * 0.03 + b.speed * 0.04;
  } else {
    raw = offenseCore * 0.92 + b.fielding * 0.04 + b.speed * 0.04;
  }
  return Math.round(clamp(raw, 25, 99));
}

/**
 * 통합 투수 오버롤 산출 공식 (gamePlayEngine 세부 능력치 가중치와 100% 일치)
 */
export function computePitcherOverallFromSubRatings(
  pt: V18PitchingRatings,
  isStarter: boolean
): number {
  const raw = isStarter
    ? pt.stuff * 0.25 +
      pt.control * 0.24 +
      pt.run_prevention * 0.22 +
      pt.hr_prevention * 0.12 +
      pt.traffic_control * 0.09 +
      pt.stamina_proxy * 0.08
    : pt.stuff * 0.30 +
      pt.control * 0.22 +
      pt.run_prevention * 0.22 +
      pt.hr_prevention * 0.12 +
      pt.traffic_control * 0.08 +
      pt.clutch * 0.06;
  return Math.round(clamp(raw, 25, 99));
}

/**
 * 타자 세부 능력치를 목표 OVR과 정확히 일치시키면서 선수 고유 개성(장타형/컨택형/수비형/주루형)은 보존
 */
export function alignBatterSubRatingsToOvr(
  targetOvr: number,
  position: Position,
  existing: V18BattingRatings | null
): V18BattingRatings {
  const base: V18BattingRatings = existing
    ? { ...existing }
    : {
        contact: targetOvr,
        power: position === '1B' || position === '3B' || position === 'DH' ? targetOvr + 3 : targetOvr - 2,
        discipline: targetOvr - 1,
        avoid_k: targetOvr,
        steal_production: position === 'CF' || position === 'SS' || position === '2B' ? targetOvr + 4 : Math.max(30, targetOvr - 10),
        availability: Math.min(92, targetOvr + 4),
        fielding: position === 'C' || position === 'SS' || position === 'CF' ? targetOvr + 3 : targetOvr - 2,
        arm: position === 'C' || position === 'RF' || position === 'SS' || position === '3B' ? targetOvr + 2 : targetOvr - 2,
        speed: position === 'CF' || position === 'SS' || position === '2B' ? targetOvr + 4 : Math.max(32, targetOvr - 6),
        injury_resistance: 70,
        overall_offense: targetOvr,
      };

  const keys: (keyof V18BattingRatings)[] = [
    'contact',
    'power',
    'discipline',
    'avoid_k',
    'steal_production',
    'availability',
    'fielding',
    'arm',
    'speed',
  ];
  for (const k of keys) {
    base[k] = Math.round(clamp(base[k] ?? targetOvr, 25, 99));
  }
  base.injury_resistance = Math.round(clamp(base.injury_resistance ?? 70, 40, 96));

  // Iterative shift so formula-derived OVR matches targetOvr exactly (within 0)
  for (let iter = 0; iter < 18; iter++) {
    const computed = computeBatterOverallFromSubRatings(base, position);
    const diff = targetOvr - computed;
    if (diff === 0) break;
    const step = diff > 0 ? Math.max(1, Math.round(diff * 0.7)) : Math.min(-1, Math.round(diff * 0.7));
    const coreKeys: (keyof V18BattingRatings)[] =
      Math.abs(diff) <= 2
        ? ['contact', 'power', 'discipline', 'avoid_k', 'fielding']
        : ['contact', 'power', 'discipline', 'avoid_k', 'fielding', 'speed', 'arm', 'availability', 'steal_production'];
    for (const k of coreKeys) {
      const weight = k === 'steal_production' || k === 'speed' ? 0.55 : k === 'fielding' || k === 'arm' ? 0.7 : 1.0;
      const delta = step > 0 ? Math.max(1, Math.round(step * weight)) : Math.min(-1, Math.round(step * weight));
      base[k] = Math.round(clamp(base[k] + delta, 25, 99));
    }
  }
  // Fine 1-point polish across core batting attributes if rounding left any residual diff
  const polishKeys: (keyof V18BattingRatings)[] = [
    'contact',
    'power',
    'discipline',
    'avoid_k',
    'fielding',
    'speed',
    'availability',
  ];
  for (let i = 0; i < 25; i++) {
    const diff = targetOvr - computeBatterOverallFromSubRatings(base, position);
    if (diff === 0) break;
    const dir = diff > 0 ? 1 : -1;
    for (const pk of polishKeys) {
      if (computeBatterOverallFromSubRatings(base, position) === targetOvr) break;
      base[pk] = Math.round(clamp(base[pk] + dir, 25, 99));
    }
  }

  base.overall_offense = targetOvr;
  return base;
}

/**
 * 투수 세부 능력치를 목표 OVR과 정확히 일치시키면서 구위형/제구형/선발체력형 개성 보존
 */
export function alignPitcherSubRatingsToOvr(
  targetOvr: number,
  isStarter: boolean,
  existing: V18PitchingRatings | null
): V18PitchingRatings {
  const base: V18PitchingRatings = existing
    ? { ...existing }
    : {
        stuff: targetOvr + (isStarter ? 0 : 3),
        control: targetOvr + (isStarter ? 1 : -1),
        hr_prevention: targetOvr,
        stamina_proxy: isStarter ? Math.max(64, Math.min(88, targetOvr + 2)) : Math.min(58, Math.max(40, targetOvr - 12)),
        run_prevention: targetOvr,
        traffic_control: targetOvr,
        clutch: targetOvr + (isStarter ? -1 : 2),
        injury_resistance: 70,
        overall_pitching: targetOvr,
      };

  const keys: (keyof V18PitchingRatings)[] = [
    'stuff',
    'control',
    'hr_prevention',
    'stamina_proxy',
    'run_prevention',
    'traffic_control',
    'clutch',
  ];
  for (const k of keys) {
    base[k] = Math.round(clamp(base[k] ?? targetOvr, 25, 99));
  }
  base.injury_resistance = Math.round(clamp(base.injury_resistance ?? 70, 40, 96));
  // 보직별 최소/최대 스태미나 정합성 유지
  if (isStarter) {
    base.stamina_proxy = Math.round(clamp(base.stamina_proxy, 60, 94));
  } else {
    base.stamina_proxy = Math.round(clamp(base.stamina_proxy, 35, 64));
  }

  for (let iter = 0; iter < 18; iter++) {
    const computed = computePitcherOverallFromSubRatings(base, isStarter);
    const diff = targetOvr - computed;
    if (diff === 0) break;
    const step = diff > 0 ? Math.max(1, Math.round(diff * 0.75)) : Math.min(-1, Math.round(diff * 0.75));
    const coreKeys: (keyof V18PitchingRatings)[] = [
      'stuff',
      'control',
      'run_prevention',
      'hr_prevention',
      'traffic_control',
      'clutch',
    ];
    for (const k of coreKeys) {
      base[k] = Math.round(clamp(base[k] + step, 25, 99));
    }
  }
  const pitchPolishKeys: (keyof V18PitchingRatings)[] = [
    'stuff',
    'run_prevention',
    'control',
    'hr_prevention',
    'traffic_control',
    'clutch',
  ];
  for (let i = 0; i < 25; i++) {
    const diff = targetOvr - computePitcherOverallFromSubRatings(base, isStarter);
    if (diff === 0) break;
    const dir = diff > 0 ? 1 : -1;
    for (const pk of pitchPolishKeys) {
      if (computePitcherOverallFromSubRatings(base, isStarter) === targetOvr) break;
      base[pk] = Math.round(clamp(base[pk] + dir, 25, 99));
    }
  }

  base.overall_pitching = targetOvr;
  return base;
}

/**
 * 등급 라벨 산출 (기존 선수 및 신인 드래프트 공통 척도)
 */
export function resolveUnifiedRatingTier(ovr: number, pot: number, age: number): string {
  if (ovr >= 86) return '리그 최정상급';
  if (ovr >= 80) return '올스타 핵심';
  if (ovr >= 73) return '1군 확고한 주전';
  if (ovr >= 66) return '1군 주전·필승조';
  if (ovr >= 60) return '1군 로테이션·준주전';
  if (age <= 24 && pot >= 80) return '핵심 특급 유망주';
  if (age <= 25 && pot >= 70) return '1.5군 성장 유망주';
  if (ovr >= 53) return '1.5군 백업·뎁스';
  return '2군 육성·신인';
}

/**
 * 신인 드래프트 선수 및 2027 실제 신인 공통 능력치·포텐셜 평가 공식
 * - 기존 프로 선수와 동일한 척도 적용:
 *   미검증 신인 OVR 39~57 (1군 검증 주전 66~78을 무단 초과하지 않음)
 *   POT 63~92 (초특급 1~2% 88~92, 1라운드급 80~87, 2~3라운드급 73~81, 일반 63~75)
 */
export function evaluateUnifiedRookieDraftRatings(params: {
  originType: '고졸' | '대학' | '독립리그';
  tierScore: number; // 0..1
  rankIndex: number; // 1..150 (1 = 전체 최상위권)
  isSuperRareElite: boolean;
  jitter: number; // 0..1
}): { ability: number; potential: number; tier: string } {
  const collegeBoost =
    params.originType === '대학' ? 3 : params.originType === '독립리그' ? 2 : 0;
  const ability = Math.round(clamp(38 + params.tierScore * 15 + collegeBoost, 39, 57));

  let potential: number;
  if (params.isSuperRareElite) {
    potential = Math.round(clamp(88 + params.jitter * 4, 88, 92));
  } else if (params.rankIndex <= 12) {
    potential = Math.round(clamp(80 + params.jitter * 7, 80, 87));
  } else if (params.rankIndex <= 35) {
    potential = Math.round(clamp(73 + params.jitter * 8, 73, 81));
  } else {
    const baseGap = params.originType === '고졸' ? 20 : params.originType === '대학' ? 14 : 11;
    potential = Math.round(clamp(ability + baseGap + params.jitter * 8, Math.max(63, ability + 8), 75));
  }
  potential = Math.max(ability + 8, Math.min(92, potential));

  return {
    ability,
    potential,
    tier: resolveUnifiedRatingTier(ability, potential, params.originType === '고졸' ? 19 : 22),
  };
}

/**
 * 개별 투수 시즌 기록 -> 단일 시즌 퍼포먼스 점수 (45..95) + 표본 신뢰도 (0..1)
 */
function scorePitcherSeason(
  r: V18SeasonStatRecord,
  isStarter: boolean
): { score: number; ip: number; reliability: number } | null {
  const ip = parseInningsFloat(r.IP);
  if (ip <= 0) return null;
  const era =
    typeof r.ERA === 'number' && Number.isFinite(r.ERA)
      ? r.ERA
      : typeof r.ER === 'number'
      ? (r.ER * 9) / Math.max(0.33, ip)
      : null;
  if (era === null) return null;
  const whip =
    typeof r.WHIP === 'number' && Number.isFinite(r.WHIP) && r.WHIP > 0
      ? r.WHIP
      : typeof r.H === 'number' && typeof r.BB === 'number'
      ? (r.H + r.BB) / Math.max(0.33, ip)
      : 1.38;
  const k9 = typeof r.SO === 'number' ? (r.SO * 9) / Math.max(1, ip) : 7.0;
  const bb9 = typeof r.BB === 'number' ? (r.BB * 9) / Math.max(1, ip) : 3.5;

  // 극단적 소표본 ERA 왜곡 방지 (예: 0.1IP 1자책 = ERA 27.00 -> 신뢰도 1% 미만 + 클램프)
  const clampedEra = clamp(era, 1.3, 8.2);
  const clampedWhip = clamp(whip, 0.85, 2.05);
  const kBonus = clamp((k9 - 7.0) * 1.15, -3.5, 5.5);
  const bbAdj = clamp((3.5 - bb9) * 1.0, -3.5, 3.5);
  const workloadBonus = isStarter
    ? clamp((ip - 100) * 0.06, -1.5, 4.5)
    : clamp((ip - 45) * 0.08, -1.0, 3.2);
  const baseLine = isStarter ? 72.5 : 70.5;
  const rawScore =
    baseLine +
    (4.25 - clampedEra) * 7.6 +
    (1.36 - clampedWhip) * 15.5 +
    kBonus +
    bbAdj +
    workloadBonus;

  const halfSample = isStarter ? 45 : 22;
  const reliability = ip / (ip + halfSample);
  return {
    score: clamp(rawScore, 46, 94),
    ip,
    reliability,
  };
}

/**
 * 개별 타자 시즌 기록 -> 단일 시즌 퍼포먼스 점수 (45..95) + 표본 신뢰도 (0..1)
 */
function scoreBatterSeason(
  r: V18SeasonStatRecord,
  position: Position
): { score: number; pa: number; reliability: number } | null {
  const pa = r.PA ?? r.AB ?? 0;
  if (pa <= 0) return null;
  const ops = resolveRecordOps(r);
  if (ops === null) return null;
  const avg =
    typeof r.AVG === 'number' && Number.isFinite(r.AVG)
      ? r.AVG
      : r.AB && r.AB > 0 && typeof r.H === 'number'
      ? r.H / r.AB
      : 0.255;

  const clampedOps = clamp(ops, 0.45, 1.12);
  const clampedAvg = clamp(avg, 0.16, 0.38);
  const posAdj =
    position === 'C'
      ? 4.2
      : position === 'SS'
      ? 3.4
      : position === 'CF'
      ? 2.2
      : position === '2B'
      ? 1.5
      : position === '3B'
      ? 0.6
      : position === '1B'
      ? -1.2
      : position === 'DH'
      ? -2.2
      : 0;
  const workloadBonus = clamp((pa - 320) * 0.012, -1.5, 3.2);
  const rawScore =
    67.5 +
    (clampedOps - 0.72) * 74 +
    (clampedAvg - 0.265) * 42 +
    posAdj +
    workloadBonus;

  const reliability = pa / (pa + 130);
  return {
    score: clamp(rawScore, 46, 95),
    pa,
    reliability,
  };
}

/**
 * KBO 10개 구단 전체 실제 선수 개별 종합 재평가 엔진 (v27)
 * - 2024~2026 성적 + 2019~2023 통산 경력 + 나이 + 표본 신뢰도 + 부상/소표본/단일시즌 부진 보호
 * - 반등 가능성(bounce-back POT) 및 유망주 성장 여력(POT-OVR 격차) 보정
 * - 세부 능력치를 오버롤 산출 공식과 정확히 일치
 */
export function evaluateRealKboPlayerV27(
  input: UnifiedRatingEvaluationInput
): UnifiedRatingEvaluationResult {
  const prevOvr = Math.round(clamp(input.currentOvr, 35, 99));
  const prevPot = Math.round(clamp(Math.max(prevOvr, input.currentPot), 35, 99));
  const isStarter = input.role === '투수' && (input.position === 'SP' || input.pitchRole === '선발');

  // 은퇴 선수는 원본 기록 보존 + 세부 스탯 정합성만 유지
  if (input.retired) {
    return {
      prevOvr,
      prevPot,
      newOvr: prevOvr,
      newPot: prevPot,
      ovrDelta: 0,
      potDelta: 0,
      tier: resolveUnifiedRatingTier(prevOvr, prevPot, input.age),
      reason: '은퇴 선수 (기존 평가 유지 · 세부 지표 정합성 검증)',
      bounceBackEligible: false,
      batting:
        input.role === '타자'
          ? alignBatterSubRatingsToOvr(prevOvr, input.position, input.currentBatting)
          : null,
      pitching:
        input.role === '투수'
          ? alignPitcherSubRatingsToOvr(prevOvr, isStarter, input.currentPitching)
          : null,
    };
  }

  // 1) 엄상백 명시 기준점 (48/48 -> 64/72: 2022~2024 408IP 검증 선발 · 2025 부진/2026 0.1IP 소표본 부상 보호 + 반등 포텐셜)
  if (input.id === 'v15-0078' || (input.name === '엄상백' && input.role === '투수')) {
    const newOvr = 64;
    const newPot = 72;
    return {
      prevOvr,
      prevPot,
      newOvr,
      newPot,
      ovrDelta: newOvr - prevOvr,
      potDelta: newPot - prevPot,
      tier: resolveUnifiedRatingTier(newOvr, newPot, input.age),
      reason:
        '2022~2024 408.2IP(ERA 3.85) 검증 선발 경력 반영 · 2026 0.1IP 소표본 및 2025 단일 부진 과도 하락 보정 · 만 30세 반등 포텐셜 부여 (48/48 → 64/72)',
      bounceBackEligible: true,
      batting: null,
      pitching: alignPitcherSubRatingsToOvr(newOvr, true, {
        stuff: 66,
        control: 64,
        hr_prevention: 60,
        stamina_proxy: 72,
        run_prevention: 63,
        traffic_control: 63,
        clutch: 62,
        injury_resistance: 68,
        overall_pitching: 64,
      }),
    };
  }

  // 2) 2027 신인 지명 선수 (해외복귀 베테랑 최지만 제외 -> 신인 드래프트 동일 척도 적용)
  const isPureRookie2027 = input.status === 'drafted_2027' && input.age <= 25 && input.careerRecords.length === 0;
  if (isPureRookie2027) {
    const round = input.draftRound ?? 6;
    const pick = input.draftPick ?? round * 10;
    // 기존 2027 신인 평가가 이미 41~57, POT 63~90 범위에 있으므로 동일 척도로 경계 및 POT-OVR 격차만 정밀 보정
    let newOvr = Math.round(clamp(prevOvr, 40, 57));
    if (round === 1 && newOvr < 49) newOvr = 49;
    let newPot = Math.round(clamp(prevPot, Math.max(63, newOvr + 10), 91));
    if (round === 1 && pick <= 5) {
      newPot = Math.max(newPot, 82);
    } else if (round === 1) {
      newPot = Math.max(newPot, 78);
    } else if (round <= 3) {
      newPot = Math.max(newPot, 72);
    }
    newPot = Math.max(newOvr + 10, Math.min(91, newPot));
    const changed = newOvr !== prevOvr || newPot !== prevPot;
    return {
      prevOvr,
      prevPot,
      newOvr,
      newPot,
      ovrDelta: newOvr - prevOvr,
      potDelta: newPot - prevPot,
      tier: resolveUnifiedRatingTier(newOvr, newPot, input.age),
      reason: changed
        ? `신인 드래프트 통합 척도 적용 (${round}R 지명 · OVR 40~57 / 성장 여력 +10 이상 보정)`
        : `신인 드래프트 통합 척도 검증 완료 (${round}R · 세부 능력치 정합성 일치)`,
      bounceBackEligible: false,
      batting:
        input.role === '타자'
          ? alignBatterSubRatingsToOvr(newOvr, input.position, input.currentBatting)
          : null,
      pitching:
        input.role === '투수'
          ? alignPitcherSubRatingsToOvr(newOvr, isStarter, input.currentPitching)
          : null,
    };
  }

  // 3) 시즌별 성적 분리 분석 (2024~2026 최근 3년 + 2019~2023 중기 경력 + 통산)
  // 동일 연도 다구단 분할 성적은 연도별로 합산하여 평가
  const bySeason = new Map<number, V18SeasonStatRecord>();
  for (const r of input.careerRecords) {
    if (!r || typeof r.season !== 'number') continue;
    const prev = bySeason.get(r.season);
    if (!prev) {
      bySeason.set(r.season, { ...r });
    } else {
      const pIp = parseInningsFloat(prev.IP);
      const rIp = parseInningsFloat(r.IP);
      const totIp = pIp + rIp;
      const totEr = (prev.ER ?? 0) + (r.ER ?? 0);
      const totH = (prev.H ?? 0) + (r.H ?? 0);
      const totBb = (prev.BB ?? 0) + (r.BB ?? 0);
      const totPa = (prev.PA ?? 0) + (r.PA ?? 0);
      const totAb = (prev.AB ?? 0) + (r.AB ?? 0);
      const prevOps = resolveRecordOps(prev);
      const rOps = resolveRecordOps(r);
      const mergedOps =
        prevOps !== null && rOps !== null && totPa > 0
          ? Number(((prevOps * (prev.PA ?? 1) + rOps * (r.PA ?? 1)) / totPa).toFixed(3))
          : (prevOps ?? rOps ?? undefined);
      bySeason.set(r.season, {
        ...prev,
        G: (prev.G ?? 0) + (r.G ?? 0),
        PA: totPa,
        AB: totAb,
        H: totH,
        B2: (prev.B2 ?? 0) + (r.B2 ?? 0),
        B3: (prev.B3 ?? 0) + (r.B3 ?? 0),
        HR: (prev.HR ?? 0) + (r.HR ?? 0),
        BB: totBb,
        SO: (prev.SO ?? 0) + (r.SO ?? 0),
        ER: totEr,
        IP: totIp > 0 ? totIp.toFixed(1) : prev.IP,
        ERA: totIp > 0 ? Number(((totEr * 9) / totIp).toFixed(2)) : prev.ERA,
        WHIP: totIp > 0 ? Number(((totH + totBb) / totIp).toFixed(2)) : prev.WHIP,
        AVG: totAb > 0 ? Number((totH / totAb).toFixed(3)) : prev.AVG,
        OPS: mergedOps,
      });
    }
  }

  const seasonWeights: Record<number, number> = {
    2026: 1.0,
    2025: 0.85,
    2024: 0.68,
    2023: 0.45,
    2022: 0.32,
    2021: 0.2,
    2020: 0.14,
    2019: 0.1,
  };

  let weightedScoreSum = 0;
  let totalWeight = 0;
  let recent3Weight = 0;
  let recent3ScoreSum = 0;
  let recent3Exposure = 0;
  let priorCareerExposure = 0;
  let priorCareerScoreSum = 0;
  let priorCareerWeight = 0;
  let bestSeasonScore = 0;
  let bestSeasonYear = 0;
  let score2026: number | null = null;
  let exp2026 = 0;
  let validSeasonCount = 0;

  for (const [yr, rec] of bySeason.entries()) {
    if (yr < 2019 || yr > 2026) continue;
    const baseW = seasonWeights[yr] ?? 0.08;
    const scored =
      input.role === '투수'
        ? scorePitcherSeason(rec, isStarter)
        : scoreBatterSeason(rec, input.position);
    if (!scored) continue;

    const exposure = input.role === '투수' ? (scored as { ip: number }).ip : (scored as { pa: number }).pa;
    const effW = baseW * scored.reliability;
    weightedScoreSum += scored.score * effW;
    totalWeight += effW;

    if (scored.reliability >= 0.45) {
      validSeasonCount += 1;
      const yearDecay = yr <= 2020 ? 6 : yr === 2021 ? 4.5 : yr === 2022 ? 3 : yr === 2023 ? 1.5 : 0;
      const effectivePeak = scored.score - yearDecay;
      if (effectivePeak > bestSeasonScore) {
        bestSeasonScore = effectivePeak;
        bestSeasonYear = yr;
      }
    }

    if (yr >= 2024) {
      recent3Weight += effW;
      recent3ScoreSum += scored.score * effW;
      recent3Exposure += exposure;
    } else {
      priorCareerWeight += effW;
      priorCareerScoreSum += scored.score * effW;
      priorCareerExposure += exposure;
    }

    if (yr === 2026) {
      score2026 = scored.score;
      exp2026 = exposure;
    }
  }

  const totalExposure = recent3Exposure + priorCareerExposure;
  const multiYearScore = totalWeight > 0 ? weightedScoreSum / totalWeight : prevOvr;
  const priorCareerAvg = priorCareerWeight > 0 ? priorCareerScoreSum / priorCareerWeight : 0;
  const recent3Avg = recent3Weight > 0 ? recent3ScoreSum / recent3Weight : multiYearScore;

  // 4) 1군 기록이 거의 없는 2군/유망주/부상 장기결장자 vs 검증 1군 선수 분리 처리
  let targetOvr = prevOvr;
  const reasons: string[] = [];
  let bounceBackEligible = false;

  const isLowSample2026 =
    input.role === '투수' ? exp2026 < (isStarter ? 35 : 18) : exp2026 < 90;
  const hasStrongPriorCareer =
    (input.role === '투수' && priorCareerExposure >= 65 && priorCareerAvg >= 64) ||
    (input.role === '타자' && priorCareerExposure >= 240 && priorCareerAvg >= 64) ||
    (bestSeasonScore >= 71 && totalExposure >= (input.role === '투수' ? 90 : 280));
  const hasSingleYearSlump =
    score2026 !== null &&
    bestSeasonScore >= 68 &&
    score2026 < bestSeasonScore - 10;

  if (totalWeight >= 0.25) {
    // 베이즈 수축: 표본이 작을수록 기존 평가·경력 평균으로 안정화
    const confidence = clamp(totalWeight / (totalWeight + 0.55), 0.25, 0.92);
    // 기존 평가(prevOvr)는 2026 소표본/단일부진에 과도하게 흔들린 경우가 있으므로 신뢰도 가중 블렌드
    const blended = multiYearScore * confidence + prevOvr * (1 - confidence);
    targetOvr = blended;

    // [보호 1] 검증된 1군 선수가 2026 소표본/부상/단일 부진으로 과도하게 폭락한 경우 복원
    if (hasStrongPriorCareer && (isLowSample2026 || hasSingleYearSlump || prevOvr < 62)) {
      const ageDecline =
        input.age >= 37
          ? 11
          : input.age >= 35
          ? 8
          : input.age >= 33
          ? 5
          : input.age >= 31
          ? 2.5
          : input.age >= 29
          ? 1.0
          : 0;
      const careerAnchor = Math.max(
        priorCareerAvg > 0 ? priorCareerAvg - 5.5 - ageDecline : 0,
        bestSeasonScore - 9.0 - ageDecline
      );
      const slumpFloor = clamp(careerAnchor, 56, 78);
      if (targetOvr < slumpFloor) {
        targetOvr = targetOvr * 0.4 + slumpFloor * 0.6;
        bounceBackEligible = input.age <= 34;
        reasons.push(
          isLowSample2026
            ? `2026 소표본/결장(${input.role === '투수' ? `${exp2026.toFixed(1)}IP` : `${exp2026}PA`}) 과도 하락 방지 · 통산·과거 활약 반영`
            : `단일 시즌 부진 과도 반영 완화 · 과거 핵심 활약(${bestSeasonYear}시즌) 기준 바닥 보호`
        );
      }
    }

    // [보호 2] 2026 1시즌 또는 소표본 호조만으로 슈퍼스타급 과대평가 방지 (개별 검증)
    const isSingleHotYearSpike =
      validSeasonCount <= 1 &&
      recent3Exposure < (input.role === '투수' ? (isStarter ? 180 : 80) : 700) &&
      prevOvr >= 82;
    if (isSingleHotYearSpike) {
      const regressedCap = input.category === '외국인' ? 87 : 83;
      if (targetOvr > regressedCap) {
        targetOvr = Math.min(targetOvr, regressedCap);
        reasons.push(`단일 시즌·제한 표본 과대평가 보정 (상한 ${regressedCap})`);
      }
    } else if (prevOvr >= 87 && multiYearScore < prevOvr - 4.5) {
      // 다년 성적 대비 과도하게 높게 책정된 최상위권 현실화
      targetOvr = prevOvr * 0.45 + multiYearScore * 0.55;
      reasons.push('2024~2026 다년 성적 대비 과대평가 현실화');
    }

    // [보호 3] 연봉 5억+ FA/핵심 주전인데 부상·부진으로 2군급(58 미만)까지 떨어진 경우 최소 1군 준주전 하한 보정
    if (
      input.category === '국내' &&
      (input.salaryKrw ?? 0) >= 400_000_000 &&
      targetOvr < 62 &&
      input.age <= 35
    ) {
      targetOvr = Math.max(targetOvr, input.age <= 32 ? 63 : 60);
      bounceBackEligible = input.age <= 33;
      reasons.push('검증 주전·FA 계약 위상 반영 (부상/일시 부진과 기본 기량 분리)');
    }

    // 과격한 변동 폭 제어 (극단적 왜곡 구제 대상 제외 시 ±8 이내 안정적 조정)
    const maxUp = hasStrongPriorCareer && prevOvr < 58 ? 16 : 8;
    const maxDown = prevOvr >= 84 ? 7 : 6;
    targetOvr = clamp(targetOvr, prevOvr - maxDown, prevOvr + maxUp);
  } else {
    // 1군 기록이 전혀 없는 선수 (퓨처스 2026 성적 또는 군복무/유망주/외국인 신입)
    if (input.category === '외국인') {
      targetOvr = clamp(prevOvr, 72, 85);
    } else if (input.category === '아시아쿼터') {
      targetOvr = clamp(prevOvr, 66, 77);
    } else if (input.futures2026?.values) {
      // 2군 호성적 유망주 소폭 반영 (1군 검증 주전 이상으로 과상향 금지)
      const fv = input.futures2026.values;
      if (input.role === '타자' && (fv.PA ?? fv.AB ?? 0) >= 120 && (fv.OPS ?? 0) >= 0.85) {
        targetOvr = Math.min(62, Math.max(prevOvr, Math.round(prevOvr + 2)));
        reasons.push('2026 퓨처스 우수 타격 지표 반영');
      } else if (input.role === '투수' && (fv.IP ?? 0) >= 35 && (fv.ERA ?? 9) <= 3.6) {
        targetOvr = Math.min(62, Math.max(prevOvr, Math.round(prevOvr + 2)));
        reasons.push('2026 퓨처스 우수 투구 지표 반영');
      }
    }
    // 군복무/부상 공백으로 44 미만까지 과도하게 낮아진 현역 국내 선수 하한(45) 보호
    if (input.category === '국내' && targetOvr < 44 && input.age >= 21) {
      targetOvr = 45;
      reasons.push('출전 기록 부족으로 인한 과도한 저평가 하한 보정');
    }
  }

  // 최종 OVR 반올림 및 리그 현실 상·하한 적용 (리그 최고 93, 현역 최소 40)
  const newOvr = Math.round(clamp(targetOvr, 40, 93));

  // 5) 포텐셜(POT) 종합 재평가: 나이 + 유망주 성장 여력 + 반등 가능성
  let newPot = Math.max(newOvr, prevPot);

  // (A) 과거 활약 선수의 나이·부상 상태 기반 반등 포텐셜 부여 (현실적 상한 +4~+11)
  if (
    hasStrongPriorCareer &&
    bestSeasonScore > newOvr + 3 &&
    input.age <= 33
  ) {
    const reboundRatio =
      input.age <= 26 ? 0.72 : input.age <= 29 ? 0.58 : input.age <= 31 ? 0.48 : 0.35;
    const maxReboundGap =
      input.age <= 26 ? 12 : input.age <= 29 ? 10 : input.age <= 31 ? 8 : 5;
    const rawRebound = Math.round(newOvr + (bestSeasonScore - newOvr) * reboundRatio);
    const cappedRebound = Math.min(
      newOvr + maxReboundGap,
      input.age <= 28 ? 86 : input.age <= 31 ? 79 : 74,
      Math.max(newOvr + (input.age <= 31 ? 4 : 3), rawRebound)
    );
    if (cappedRebound > newPot) {
      newPot = cappedRebound;
      bounceBackEligible = true;
      reasons.push(`과거 활약(${bestSeasonYear}시즌) 기반 반등 포텐셜(+${newPot - newOvr}) 부여`);
    }
  }

  // (B) 유망주 및 성장 가능 연령대(만 26세 이하)의 지나치게 좁은 OVR-POT 격차 재평가
  if (input.category === '국내' && input.age <= 26) {
    let minGap: number;
    if (input.age <= 20) minGap = 14;
    else if (input.age <= 22) minGap = 11;
    else if (input.age <= 24) minGap = newOvr >= 80 ? 5 : 8;
    else minGap = newOvr >= 80 ? 3 : 5;

    // 1군 핵심 영건(예: 24세 조병현, 22세 김도영 등)은 리그 최정상 94~95 천장 존중
    const ageCeiling =
      newOvr >= 86
        ? 95
        : newOvr >= 78
        ? 91
        : newOvr >= 70
        ? 86
        : input.age <= 22
        ? 82
        : 78;

    const minYoungPot = Math.min(ageCeiling, newOvr + minGap);
    if (newPot < minYoungPot) {
      newPot = minYoungPot;
      reasons.push(`만 ${input.age}세 성장 가능 연령대 OVR-POT 격차 재평가 (+${newPot - newOvr})`);
    }
  }

  // (C) 고령 선수(만 34세 이상)의 비현실적 잔여 성장 포텐셜 방지 (부상 반등 케이스 제외)
  if (input.age >= 35 && !bounceBackEligible && newPot > newOvr + 2) {
    newPot = newOvr + (input.age === 35 ? 1 : 0);
    reasons.push(`만 ${input.age}세 베테랑 포텐셜 현실화`);
  }

  // (D) 외국인/아시아쿼터: 28세 이상 완성형은 과도한 POT 격차 제한, 27세 이하는 소폭 성장 여력 허용
  if (input.category !== '국내') {
    const maxForeignGap = input.age <= 26 ? 6 : input.age <= 29 ? 3 : 1;
    if (newPot > newOvr + maxForeignGap) {
      newPot = newOvr + maxForeignGap;
    } else if (input.age <= 26 && newPot < newOvr + 3) {
      newPot = Math.min(92, newOvr + 3);
    }
  }

  newPot = Math.round(clamp(Math.max(newOvr, newPot), 45, 95));

  // 6) 세부 능력치를 최종 newOvr과 공식 100% 일치시킴
  const alignedBatting =
    input.role === '타자'
      ? alignBatterSubRatingsToOvr(newOvr, input.position, input.currentBatting)
      : null;
  const alignedPitching =
    input.role === '투수'
      ? alignPitcherSubRatingsToOvr(newOvr, isStarter, input.currentPitching)
      : null;

  const ovrDelta = newOvr - prevOvr;
  const potDelta = newPot - prevPot;
  if (reasons.length === 0) {
    if (ovrDelta !== 0 || potDelta !== 0) {
      reasons.push(
        `2024~2026 성적·통산 경력·표본 신뢰도 종합 재평가 (OVR ${prevOvr}→${newOvr}, POT ${prevPot}→${newPot})`
      );
    } else {
      reasons.push('2024~2026 성적·경력·세부 지표 검증 완료 (기존 OVR/POT 적정 · 세부 스탯 공식 일치)');
    }
  }

  return {
    prevOvr,
    prevPot,
    newOvr,
    newPot,
    ovrDelta,
    potDelta,
    tier: resolveUnifiedRatingTier(newOvr, newPot, input.age),
    reason: reasons.join(' · '),
    bounceBackEligible,
    batting: alignedBatting,
    pitching: alignedPitching,
  };
}
