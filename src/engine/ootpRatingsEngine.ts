import { REAL_KBO_BATTER_PROFILES, REAL_KBO_PITCHER_PROFILES } from '../data/kboRealMetrics';
import {
  CareerSave,
  OotpBaserunningRatings,
  OotpBatterRatings,
  OotpDefenseRatings,
  OotpGrowthHistoryEntry,
  OotpPersonalityRatings,
  OotpPitcherRatings,
  OotpPitchItem,
  OotpPlayerRatings,
  OotpRatingPair,
  PitchTypeName,
  Player,
  Position,
} from '../types/kbo';
import { getPositionProficiency } from './positionEngine';
import { parseInningsFloat, resolveRecordOps } from './ratingEvaluationEngine';
import { SeededRng } from './rng';

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return (lo + hi) * 0.5;
  return Math.max(lo, Math.min(hi, v));
}

function rInt(v: number, lo = 1, hi = 100): number {
  return Math.round(clamp(v, lo, hi));
}

function stableHash(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function hashOffset(key: string, span: number): number {
  const h = stableHash(key) % (span * 2 + 1);
  return h - span;
}

/**
 * OOTP 방식 파생 컨택 (Contact):
 * - BABIP(56%) + 삼진 회피(44%)로부터 산출
 * - 경기 시뮬레이터에서는 컨택을 중복 반영하지 않고 BABIP(인플레이 안타)와 AvoidK(삼진 회피)를 독립 적용
 */
export function computeDerivedContact(babip: number, avoidK: number): number {
  return rInt(babip * 0.56 + avoidK * 0.44, 1, 100);
}

export function computeDerivedContactPair(bat: OotpBatterRatings): OotpRatingPair {
  const cur = computeDerivedContact(bat.babip.cur, bat.avoidK.cur);
  const pot = Math.max(cur, computeDerivedContact(bat.babip.pot, bat.avoidK.pot));
  return { cur, pot };
}

/**
 * 구종 구성과 체력·능력치 기반 선발 / 불펜 적합도 산출 (0~100)
 */
export function evaluatePitcherRoleFit(
  pt: Pick<OotpPitcherRatings, 'pitches' | 'stamina' | 'stuff' | 'control' | 'movement' | 'groundballRate'>
): { starterFit: number; relieverFit: number } {
  const sortedPitches = [...pt.pitches].sort((a, b) => b.cur - a.cur);
  const usablePitches = sortedPitches.filter((x) => x.cur >= 45);
  const strongPitches = sortedPitches.filter((x) => x.cur >= 55);
  const top2Avg =
    sortedPitches.length >= 2
      ? (sortedPitches[0].cur + sortedPitches[1].cur) / 2
      : (sortedPitches[0]?.cur ?? pt.stuff.cur);
  const thirdPitch = sortedPitches[2]?.cur ?? 25;
  const fourthPitch = sortedPitches[3]?.cur ?? 0;

  // 선발 적합도: 3구종 이상 완성도 + 충분한 체력(58+) + 제구·무브먼트가 핵심
  const pitchDepthScore =
    usablePitches.length >= 4
      ? 86 + Math.min(14, (thirdPitch - 50) * 0.35 + (fourthPitch - 45) * 0.25)
      : usablePitches.length === 3
      ? 72 + Math.min(18, (thirdPitch - 45) * 0.45)
      : usablePitches.length === 2
      ? 36 + Math.max(0, (top2Avg - 65) * 0.3)
      : 20;

  const staminaStarterScore =
    pt.stamina >= 68
      ? 80 + (pt.stamina - 68) * 0.65
      : pt.stamina >= 56
      ? 58 + (pt.stamina - 56) * 1.8
      : Math.max(15, pt.stamina * 0.95);

  const starterFit = rInt(
    pitchDepthScore * 0.42 +
      staminaStarterScore * 0.36 +
      pt.control.cur * 0.12 +
      pt.movement.cur * 0.06 +
      (strongPitches.length >= 3 ? 6 : 0),
    10,
    99
  );

  // 불펜 적합도: 상위 2구종 위력 + 구위(Stuff) + 제구·피홈런 억제 (체력/3구종 부족해도 높게 평가)
  const relieverFit = rInt(
    pt.stuff.cur * 0.38 +
      top2Avg * 0.30 +
      pt.control.cur * 0.18 +
      pt.movement.cur * 0.14 +
      (usablePitches.length <= 2 ? 5 : 0),
    20,
    99
  );

  return { starterFit, relieverFit };
}

/**
 * 포지션별 수비 종합 점수 (OOTP 내야/외야/포수 세부 지표 + 멀티 포지션 숙련도 연동)
 */
export function computeOotpDefenseForPosition(
  def: OotpDefenseRatings,
  pos: Position,
  proficiency?: number
): number {
  let raw: number;
  switch (pos) {
    case 'C':
      raw = def.catcherFraming * 0.40 + def.catcherBlocking * 0.30 + def.catcherArm * 0.30;
      break;
    case 'SS':
      raw = def.infieldRange * 0.42 + def.infieldError * 0.22 + def.infieldArm * 0.20 + def.turnDP * 0.16;
      break;
    case '2B':
      raw = def.infieldRange * 0.36 + def.infieldError * 0.24 + def.turnDP * 0.28 + def.infieldArm * 0.12;
      break;
    case '3B':
      raw = def.infieldRange * 0.30 + def.infieldError * 0.28 + def.infieldArm * 0.34 + def.turnDP * 0.08;
      break;
    case '1B':
      raw = def.infieldError * 0.48 + def.infieldRange * 0.28 + def.turnDP * 0.14 + def.infieldArm * 0.10;
      break;
    case 'CF':
      raw = def.outfieldRange * 0.56 + def.outfieldError * 0.24 + def.outfieldArm * 0.20;
      break;
    case 'RF':
      raw = def.outfieldRange * 0.34 + def.outfieldError * 0.26 + def.outfieldArm * 0.40;
      break;
    case 'LF':
      raw = def.outfieldRange * 0.40 + def.outfieldError * 0.34 + def.outfieldArm * 0.26;
      break;
    case 'DH':
      return 50;
    default:
      raw = (def.infieldError + def.infieldRange) * 0.5;
  }

  if (typeof proficiency === 'number' && Number.isFinite(proficiency)) {
    // 숙련도 80+: 정상 발휘, 80 미만: 미숙 포지션 페널티 연동
    const profPenalty = proficiency >= 80 ? 0 : (80 - proficiency) * 0.35;
    raw = clamp(raw - profPenalty, 15, 99);
  }
  return rInt(raw, 1, 100);
}

/**
 * 포지션별 가중치 기반 타자 OVR / POT 산출 (단순 평균 금지)
 */
export function computeOotpBatterOverall(
  bat: OotpBatterRatings,
  def: OotpDefenseRatings,
  run: OotpBaserunningRatings,
  pos: Position,
  mode: 'cur' | 'pot',
  proficiency?: number
): number {
  const babip = bat.babip[mode];
  const avoidK = bat.avoidK[mode];
  const contact = computeDerivedContact(babip, avoidK);
  const gap = bat.gapPower[mode];
  const hr = bat.hrPower[mode];
  const eye = bat.eye[mode];
  const splitBalance = bat.vsLHP[mode] * 0.28 + bat.vsRHP[mode] * 0.72;

  // 공격 코어: 컨택(파생)·홈런파워·갭파워·선구안·좌우스플릿(1회 반영)
  const offenseCore =
    contact * 0.31 +
    hr * 0.23 +
    gap * 0.14 +
    eye * 0.20 +
    splitBalance * 0.12;

  const defPos = computeOotpDefenseForPosition(def, pos, mode === 'cur' ? proficiency : undefined);
  const defScore = mode === 'pot' ? Math.max(defPos, Math.min(96, defPos + 4)) : defPos;
  const runScore = run.speed * 0.46 + run.stealAbility * 0.24 + run.baserunning * 0.30;

  // 포지션별 수비·주루·타격 가중치 차등 적용
  let wOff: number;
  let wDef: number;
  let wRun: number;
  switch (pos) {
    case 'C':
      wOff = 0.68; wDef = 0.28; wRun = 0.04;
      break;
    case 'SS':
      wOff = 0.72; wDef = 0.21; wRun = 0.07;
      break;
    case 'CF':
      wOff = 0.73; wDef = 0.19; wRun = 0.08;
      break;
    case '2B':
      wOff = 0.76; wDef = 0.17; wRun = 0.07;
      break;
    case '3B':
      wOff = 0.80; wDef = 0.15; wRun = 0.05;
      break;
    case 'RF':
    case 'LF':
      wOff = 0.82; wDef = 0.12; wRun = 0.06;
      break;
    case '1B':
      wOff = 0.88; wDef = 0.08; wRun = 0.04;
      break;
    default: // DH
      wOff = 0.95; wDef = 0.00; wRun = 0.05;
      break;
  }

  return rInt(offenseCore * wOff + defScore * wDef + runScore * wRun, 25, 99);
}

/**
 * 보직(선발 vs 불펜) 가중치 기반 투수 OVR / POT 산출 (단순 평균 금지)
 */
export function computeOotpPitcherOverall(
  pt: OotpPitcherRatings,
  isStarter: boolean,
  mode: 'cur' | 'pot'
): number {
  const stuff = pt.stuff[mode];
  const movement = pt.movement[mode];
  const control = pt.control[mode];
  const hrPrev = pt.hrPrevent[mode];
  const hitPrev = pt.hitPrevent[mode];
  const splitBalance = pt.vsLHB[mode] * 0.45 + pt.vsRHB[mode] * 0.55;

  const sortedPitches = [...pt.pitches]
    .map((x) => x[mode])
    .sort((a, b) => b - a);
  const arsenalScore = isStarter
    ? sortedPitches.length >= 3
      ? sortedPitches[0] * 0.42 + sortedPitches[1] * 0.33 + sortedPitches[2] * 0.25
      : sortedPitches.length === 2
      ? (sortedPitches[0] * 0.55 + sortedPitches[1] * 0.45) * 0.88
      : (sortedPitches[0] ?? stuff) * 0.75
    : sortedPitches.length >= 2
    ? sortedPitches[0] * 0.56 + sortedPitches[1] * 0.44
    : (sortedPitches[0] ?? stuff) * 0.88;

  // 무브먼트 복합(피홈런억제 + 피안타억제 + 무브먼트 중복 과장 없이 통합 축 1개)
  const preventionAxis = movement * 0.36 + hrPrev * 0.34 + hitPrev * 0.30;
  const staminaAxis = mode === 'pot' ? Math.min(96, pt.stamina + 3) : pt.stamina;

  const raw = isStarter
    ? stuff * 0.24 +
      control * 0.23 +
      preventionAxis * 0.25 +
      arsenalScore * 0.14 +
      staminaAxis * 0.08 +
      splitBalance * 0.04 +
      pt.holdRunner * 0.02
    : stuff * 0.31 +
      control * 0.22 +
      preventionAxis * 0.24 +
      arsenalScore * 0.15 +
      splitBalance * 0.05 +
      pt.holdRunner * 0.02 +
      staminaAxis * 0.01;

  return rInt(raw, 25, 99);
}

export function computeOotpOverall(p: Player): number {
  const o = p.ootpRatings;
  if (!o) return p.ability;
  if (p.role === '타자' && o.batting) {
    return computeOotpBatterOverall(
      o.batting,
      o.defense,
      o.baserunning,
      p.position,
      'cur',
      getPositionProficiency(p, p.position)
    );
  }
  if (p.role === '투수' && o.pitching) {
    const isStarter = p.position === 'SP' || p.pitchRole === '선발';
    return computeOotpPitcherOverall(o.pitching, isStarter, 'cur');
  }
  return p.ability;
}

export function computeOotpPotential(p: Player): number {
  const o = p.ootpRatings;
  if (!o) return p.potential;
  const curOvr = computeOotpOverall(p);
  if (p.role === '타자' && o.batting) {
    return Math.max(
      curOvr,
      computeOotpBatterOverall(o.batting, o.defense, o.baserunning, p.position, 'pot')
    );
  }
  if (p.role === '투수' && o.pitching) {
    const isStarter = p.position === 'SP' || p.pitchRole === '선발';
    return Math.max(curOvr, computeOotpPitcherOverall(o.pitching, isStarter, 'pot'));
  }
  return Math.max(curOvr, p.potential);
}

/**
 * 단일 진실 원천(ootpRatings) → 기존 레거시 필드(v18Ratings, pitchRepertoire, battingProfile) 동기화
 * 불필요한 데이터 괴리·중복을 방지하고 기존 모든 시스템과 100% 호환 유지
 */
export function syncLegacyRatingsFromOotpInPlace(p: Player, preserveCurrentOvrPot = false): void {
  const o = p.ootpRatings;
  if (!o) return;

  if (!preserveCurrentOvrPot) {
    const nextOvr = computeOotpOverall(p);
    const nextPot = Math.max(nextOvr, computeOotpPotential(p));
    p.ability = clamp(nextOvr, 25, 99);
    p.potential = clamp(nextPot, p.ability, 99);
  }

  if (p.role === '타자' && o.batting) {
    const contactCur = computeDerivedContact(o.batting.babip.cur, o.batting.avoidK.cur);
    const powerCur = rInt(o.batting.hrPower.cur * 0.68 + o.batting.gapPower.cur * 0.32, 20, 99);
    const defCur = computeOotpDefenseForPosition(o.defense, p.position);
    const armCur =
      p.position === 'C'
        ? o.defense.catcherArm
        : p.position === 'CF' || p.position === 'RF' || p.position === 'LF'
        ? o.defense.outfieldArm
        : o.defense.infieldArm;

    p.v18Ratings = {
      overall: p.ability,
      potential: p.potential,
      batting: {
        contact: contactCur,
        power: powerCur,
        discipline: o.batting.eye.cur,
        avoid_k: o.batting.avoidK.cur,
        steal_production: rInt(o.baserunning.stealAbility * 0.65 + o.baserunning.stealTendency * 0.35, 20, 99),
        availability: o.personality.durability,
        fielding: defCur,
        arm: armCur,
        speed: o.baserunning.speed,
        injury_resistance: o.personality.durability,
        overall_offense: p.ability,
      },
      pitching: null,
    };

    if (p.battingProfile) {
      p.battingProfile.vsLeftEdge = rInt((o.batting.vsLHP.cur - 65) * 0.24, -8, 8);
      p.battingProfile.vsRightEdge = rInt((o.batting.vsRHP.cur - 65) * 0.24, -8, 8);
    }
  } else if (p.role === '투수' && o.pitching) {
    const fit = evaluatePitcherRoleFit(o.pitching);
    o.pitching.starterFit = fit.starterFit;
    o.pitching.relieverFit = fit.relieverFit;

    const runPrev = rInt(o.pitching.movement.cur * 0.4 + o.pitching.hitPrevent.cur * 0.6, 25, 99);
    const traffic = rInt(o.pitching.control.cur * 0.55 + o.pitching.hitPrevent.cur * 0.45, 25, 99);
    const clutch = rInt((o.pitching.stuff.cur + o.personality.professionalism) * 0.5, 25, 99);

    p.v18Ratings = {
      overall: p.ability,
      potential: p.potential,
      batting: null,
      pitching: {
        stuff: o.pitching.stuff.cur,
        control: o.pitching.control.cur,
        hr_prevention: o.pitching.hrPrevent.cur,
        stamina_proxy: o.pitching.stamina,
        run_prevention: runPrev,
        traffic_control: traffic,
        clutch,
        injury_resistance: o.personality.durability,
        overall_pitching: p.ability,
      },
    };

    if (p.pitchRepertoire) {
      p.pitchRepertoire.avgVelocityKmh = o.pitching.avgVelocityKmh;
      p.pitchRepertoire.maxVelocityKmh = o.pitching.maxVelocityKmh;
      p.pitchRepertoire.command = o.pitching.control.cur;
      p.pitchRepertoire.stamina = o.pitching.stamina;
      const nonFb = o.pitching.pitches.filter((x) => x.name !== '포심' && x.name !== '투심');
      if (nonFb.length > 0) {
        p.pitchRepertoire.breakingSharpness = rInt(
          nonFb.reduce((s, x) => s + x.cur, 0) / nonFb.length,
          35,
          99
        );
      }
      p.pitchRepertoire.pitches = o.pitching.pitches.map((x) => ({
        name: x.name,
        grade: x.cur,
        usagePct: x.usagePct,
      }));
    }
  }
}

/**
 * 최근 3시즌(2024~2026) 실제 성적에서 세부 지표 편차 추출
 */
function extractBatterRecentSignals(p: Player): {
  hasRecentStats: boolean;
  babipDelta: number;
  avoidKDelta: number;
  gapDelta: number;
  hrDelta: number;
  eyeDelta: number;
  sbSignal: number;
} {
  const hist = [...(p.historicalSeasons ?? [])]
    .filter((r) => (r.season ?? 0) >= 2024 && (r.PA ?? r.AB ?? 0) >= 40)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0))
    .slice(0, 3);

  if (hist.length === 0) {
    return { hasRecentStats: false, babipDelta: 0, avoidKDelta: 0, gapDelta: 0, hrDelta: 0, eyeDelta: 0, sbSignal: 0 };
  }

  let paSum = 0;
  let abSum = 0;
  let hSum = 0;
  let b2Sum = 0;
  let b3Sum = 0;
  let hrSum = 0;
  let bbSum = 0;
  let soSum = 0;
  let sbSum = 0;
  for (const r of hist) {
    const ab = r.AB ?? 0;
    const pa = r.PA ?? ab;
    paSum += pa;
    abSum += ab;
    hSum += r.H ?? 0;
    b2Sum += r.B2 ?? 0;
    b3Sum += r.B3 ?? 0;
    hrSum += r.HR ?? 0;
    bbSum += r.BB ?? 0;
    soSum += r.SO ?? 0;
    sbSum += r.SB ?? 0;
  }

  if (paSum < 50 || abSum < 40) {
    return { hasRecentStats: false, babipDelta: 0, avoidKDelta: 0, gapDelta: 0, hrDelta: 0, eyeDelta: 0, sbSignal: 0 };
  }

  const reliability = clamp(paSum / 450, 0.25, 1.0);
  const kRate = soSum / paSum; // KBO avg ~0.195
  const bbRate = bbSum / paSum; // KBO avg ~0.090
  const hrRate = hrSum / paSum; // KBO avg ~0.022
  const xbhNonHrRate = (b2Sum + b3Sum) / Math.max(1, abSum); // KBO avg ~0.052
  const denomBabip = Math.max(20, abSum - soSum - hrSum);
  const babipVal = (hSum - hrSum) / denomBabip; // KBO avg ~0.305
  const sbPer500 = (sbSum / paSum) * 500;

  return {
    hasRecentStats: true,
    babipDelta: clamp((babipVal - 0.305) * 140 * reliability, -11, 12),
    avoidKDelta: clamp((0.195 - kRate) * 135 * reliability, -12, 12),
    gapDelta: clamp((xbhNonHrRate - 0.050) * 340 * reliability, -10, 12),
    hrDelta: clamp((hrRate - 0.022) * 380 * reliability, -14, 15),
    eyeDelta: clamp((bbRate - 0.090) * 185 * reliability, -11, 13),
    sbSignal: clamp(sbPer500 * reliability, 0, 45),
  };
}

function extractPitcherRecentSignals(p: Player): {
  hasRecentStats: boolean;
  stuffDelta: number;
  controlDelta: number;
  hrPrevDelta: number;
  hitPrevDelta: number;
} {
  const hist = [...(p.historicalSeasons ?? [])]
    .filter((r) => (r.season ?? 0) >= 2024 && parseInningsFloat(r.IP) >= 10)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0))
    .slice(0, 3);

  if (hist.length === 0) {
    return { hasRecentStats: false, stuffDelta: 0, controlDelta: 0, hrPrevDelta: 0, hitPrevDelta: 0 };
  }

  let ipSum = 0;
  let soSum = 0;
  let bbSum = 0;
  let hrSum = 0;
  let hSum = 0;
  for (const r of hist) {
    const ip = parseInningsFloat(r.IP);
    ipSum += ip;
    soSum += r.SO ?? 0;
    bbSum += r.BB ?? 0;
    hrSum += r.HR ?? 0;
    hSum += r.H ?? 0;
  }

  if (ipSum < 15) {
    return { hasRecentStats: false, stuffDelta: 0, controlDelta: 0, hrPrevDelta: 0, hitPrevDelta: 0 };
  }

  const reliability = clamp(ipSum / 140, 0.25, 1.0);
  const k9 = (soSum * 9) / ipSum; // KBO avg ~7.4
  const bb9 = (bbSum * 9) / ipSum; // KBO avg ~3.6
  const hr9 = hrSum > 0 ? (hrSum * 9) / ipSum : 0.85; // KBO avg ~0.92
  const h9 = hSum > 0 ? (hSum * 9) / ipSum : 8.9; // KBO avg ~9.0

  return {
    hasRecentStats: true,
    stuffDelta: clamp((k9 - 7.4) * 3.2 * reliability, -12, 14),
    controlDelta: clamp((3.6 - bb9) * 4.8 * reliability, -12, 12),
    hrPrevDelta: clamp((0.92 - hr9) * 14.0 * reliability, -11, 11),
    hitPrevDelta: clamp((9.0 - h9) * 4.4 * reliability, -11, 12),
  };
}

function makePair(cur: number, potGap: number, potBias = 0): OotpRatingPair {
  const c = rInt(cur, 20, 99);
  const p = rInt(Math.max(c, c + potGap + potBias), c, 99);
  return { cur: c, pot: p };
}

/**
 * 실제 선수·신인·가상 선수 모두 동일한 1~100 척도로 OOTP 세부 능력치 생성
 * - 기존 v27 OVR/POT를 존중하며 포지션·보직 가중치 공식과 100% 정합되도록 보정
 */
export function buildOotpRatingsForPlayer(p: Player): OotpPlayerRatings {
  const targetOvr = clamp(p.ability || 60, 25, 99);
  const targetPot = clamp(Math.max(targetOvr, p.potential || targetOvr), targetOvr, 99);
  const potGap = Math.max(0, targetPot - targetOvr);
  const hKey = `${p.id}-${p.name}`;

  // 1) 성향 (Personality — 1~100)
  const baseDurability =
    p.hiddenTrait === '철강왕'
      ? 86 + (stableHash(hKey + 'dur') % 11)
      : p.hiddenTrait === '유리몸'
      ? 34 + (stableHash(hKey + 'dur') % 16)
      : rInt(
          (p.v18Ratings?.batting?.injury_resistance ?? p.v18Ratings?.pitching?.injury_resistance ?? 70) +
            hashOffset(hKey + 'dur2', 8) -
            Math.min(18, (p.injuryHistoryCount ?? 0) * 5),
          28,
          96
        );

  const loyaltyBase = p.agent?.loyaltyScore ?? (56 + hashOffset(hKey + 'loy', 22));
  const greedBase = p.agent ? rInt((p.agent.greedFactor - 0.85) * 185, 25, 95) : rInt(55 + hashOffset(hKey + 'grd', 22), 25, 92);
  const leadershipBase =
    (p.hiddenTrait === '분위기메이커' || p.hiddenTrait === '멘탈에이스' ? 78 : 54) +
    Math.min(16, (p.serviceYears ?? 0) * 1.4) +
    hashOffset(hKey + 'ldr', 14);
  const workEthicBase =
    (p.hiddenTrait === '꾸준함' || p.hiddenTrait === '철강왕' ? 76 : 60) +
    (p.growthCurveProfile === '대기만성' ? 8 : 0) +
    hashOffset(hKey + 'wrk', 16);
  const profBase =
    (p.hiddenTrait === '멘탈에이스' || p.hiddenTrait === '큰경기강세' ? 78 : 62) +
    Math.min(10, (p.serviceYears ?? 0) * 0.8) +
    hashOffset(hKey + 'prf', 15);
  const adaptBase =
    p.category !== '국내'
      ? rInt((p.kboAdaptation ?? 72) + hashOffset(hKey + 'adp', 10), 32, 95)
      : rInt(64 + hashOffset(hKey + 'adp', 16), 35, 94);

  const personality: OotpPersonalityRatings = {
    professionalism: rInt(profBase, 25, 98),
    workEthic: rInt(workEthicBase, 25, 98),
    loyalty: rInt(loyaltyBase, 20, 98),
    greed: rInt(greedBase, 20, 98),
    leadership: rInt(leadershipBase, 20, 98),
    adaptability: rInt(adaptBase, 25, 98),
    durability: rInt(baseDurability, 25, 98),
  };

  // 2) 수비 (Defense — 내야/외야/포수 세부 분리, 주 포지션 및 멀티 포지션 숙련도 연동)
  // 유망주(<=23세)의 수비 툴(범위·송구)은 타격 완성 전에도 이미 잠재력 수준에 가깝게 발현됨 (OOTP 실제 툴 곡선)
  const rookieToolBase = p.age <= 23 ? targetOvr * 0.48 + targetPot * 0.52 : targetOvr;
  const baseFld = p.v18Ratings?.batting?.fielding ?? (p.role === '타자' ? rookieToolBase : 42);
  const baseArm = p.v18Ratings?.batting?.arm ?? (p.role === '타자' ? rookieToolBase : 58);
  const isCatcher = p.position === 'C' || (p.secondaryPositions?.includes('C') ?? false);
  const isIF = ['1B', '2B', '3B', 'SS'].includes(p.position) || (p.secondaryPositions?.some((s) => ['1B', '2B', '3B', 'SS'].includes(s)) ?? false);
  const isOF = ['LF', 'CF', 'RF'].includes(p.position) || (p.secondaryPositions?.some((s) => ['LF', 'CF', 'RF'].includes(s)) ?? false);
  const upTheMiddleIf = p.position === 'SS' || p.position === '2B';
  const centerOf = p.position === 'CF';

  const defense: OotpDefenseRatings = {
    infieldRange: isIF
      ? rInt(baseFld + (upTheMiddleIf ? 5 : p.position === '1B' ? -8 : 0) + hashOffset(hKey + 'ir', 5), 25, 98)
      : rInt(26 + hashOffset(hKey + 'ir', 8), 15, 52),
    infieldError: isIF
      ? rInt(baseFld + (p.position === '1B' ? 4 : 1) + hashOffset(hKey + 'ie', 5), 28, 98)
      : rInt(30 + hashOffset(hKey + 'ie', 8), 15, 56),
    infieldArm: isIF
      ? rInt(baseArm + (p.position === 'SS' || p.position === '3B' ? 6 : p.position === '1B' ? -8 : -2) + hashOffset(hKey + 'ia', 5), 25, 98)
      : rInt(34 + hashOffset(hKey + 'ia', 8), 18, 60),
    turnDP: isIF
      ? rInt(baseFld + (p.position === '2B' || p.position === 'SS' ? 6 : p.position === '1B' ? -6 : -3) + hashOffset(hKey + 'dp', 5), 25, 98)
      : rInt(24 + hashOffset(hKey + 'dp', 7), 15, 48),
    outfieldRange: isOF
      ? rInt(baseFld + (centerOf ? 7 : -2) + hashOffset(hKey + 'or', 5), 25, 98)
      : rInt(28 + hashOffset(hKey + 'or', 8), 15, 54),
    outfieldError: isOF
      ? rInt(baseFld + 2 + hashOffset(hKey + 'oe', 5), 28, 98)
      : rInt(32 + hashOffset(hKey + 'oe', 8), 15, 56),
    outfieldArm: isOF
      ? rInt(baseArm + (p.position === 'RF' ? 7 : p.position === 'CF' ? 2 : -2) + hashOffset(hKey + 'oa', 5), 25, 98)
      : rInt(34 + hashOffset(hKey + 'oa', 8), 18, 58),
    catcherBlocking: isCatcher
      ? rInt(baseFld + 3 + hashOffset(hKey + 'cb', 5), 32, 98)
      : rInt(18 + hashOffset(hKey + 'cb', 6), 10, 38),
    catcherFraming: isCatcher
      ? rInt(baseFld + 2 + hashOffset(hKey + 'cf', 6), 30, 98)
      : rInt(16 + hashOffset(hKey + 'cf', 6), 10, 36),
    catcherArm: isCatcher
      ? rInt(baseArm + 4 + hashOffset(hKey + 'ca', 5), 32, 98)
      : rInt(22 + hashOffset(hKey + 'ca', 6), 12, 42),
  };

  // 3) 주루 (Baserunning — 주력 / 도루 시도 성향 / 도루 능력 / 주루 판단력 구분)
  const isTwoWay = Boolean(p.isTwoWay);
  const canBat = p.role === '타자' || isTwoWay;
  const canPitch = p.role === '투수' || isTwoWay;
  const batPos: Position =
    p.role === '타자'
      ? p.position
      : p.twoWaySecondaryPosition && !['SP', 'RP', 'CL'].includes(p.twoWaySecondaryPosition)
      ? p.twoWaySecondaryPosition
      : 'RF';

  const batSig = canBat ? extractBatterRecentSignals(p) : null;
  const rawSpeed =
    p.v18Ratings?.batting?.speed ??
    (!canBat
      ? 38 + hashOffset(hKey + 'spd', 10)
      : batPos === 'CF' || batPos === 'SS' || batPos === '2B'
      ? rookieToolBase + 5
      : batPos === 'C' || batPos === '1B' || batPos === 'DH'
      ? Math.max(28, rookieToolBase - 16)
      : rookieToolBase - 3);
  const speed = rInt(
    rawSpeed + (batSig && batSig.sbSignal >= 14 ? Math.min(10, (batSig.sbSignal - 12) * 0.4) : 0) - Math.max(0, p.age - 32) * 1.4,
    20,
    98
  );
  const stealAbility =
    !canBat
      ? 22
      : rInt(
          speed * 0.65 +
            (p.v18Ratings?.batting?.steal_production ?? speed) * 0.35 +
            (batSig ? clamp((batSig.sbSignal - 8) * 0.45, -6, 12) : 0) +
            hashOffset(hKey + 'sta', 5),
          15,
          98
        );
  const stealTendency =
    !canBat
      ? 15
      : rInt(
          stealAbility * 0.62 +
            speed * 0.38 +
            (batSig ? clamp((batSig.sbSignal - 5) * 0.85, -10, 20) : hashOffset(hKey + 'stt', 8)) -
            (p.age >= 33 ? 8 : 0) +
            hashOffset(hKey + 'stt2', 5),
          12,
          98
        );
  const baserunning =
    !canBat
      ? 30
      : rInt(speed * 0.55 + personality.professionalism * 0.25 + targetOvr * 0.20 + hashOffset(hKey + 'bsr', 6), 22, 97);

  const baserunningRatings: OotpBaserunningRatings = {
    speed,
    stealTendency,
    stealAbility,
    baserunning,
  };

  // 4A) 타자 세부 능력치 (순수 타자 및 투타겸업 선수)
  let builtBatting: OotpBatterRatings | null = null;
  if (canBat) {
    const legacyB = p.v18Ratings?.batting;
    const realBat = REAL_KBO_BATTER_PROFILES[p.name];
    const sig = batSig!;
    const baseContact = legacyB?.contact ?? targetOvr;
    const basePower = legacyB?.power ?? targetOvr;
    const baseEye = legacyB?.discipline ?? targetOvr;
    const baseAvoidK = legacyB?.avoid_k ?? targetOvr;

    const babipCur = rInt(baseContact + sig.babipDelta * 0.65 + hashOffset(hKey + 'babip', 4), 25, 98);
    const avoidKCur = rInt(baseAvoidK + sig.avoidKDelta * 0.65 + hashOffset(hKey + 'avk', 4), 25, 98);
    const hrPowerCur = rInt(
      basePower + sig.hrDelta * 0.65 + (batPos === '1B' || batPos === '3B' || batPos === 'DH' ? 3 : -1) + hashOffset(hKey + 'hrp', 4),
      20,
      99
    );
    const gapPowerCur = rInt(
      basePower * 0.62 + baseContact * 0.28 + speed * 0.10 + sig.gapDelta * 0.65 + hashOffset(hKey + 'gpp', 4),
      24,
      98
    );
    const eyeCur = rInt(baseEye + sig.eyeDelta * 0.65 + hashOffset(hKey + 'eye', 4), 24, 98);

    const batsHand = p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : p.bats === 'R' ? '우타' : (p.battingProfile?.bats ?? '우타');
    const leftTrait = p.hiddenTrait === '좌투킬러' ? 7 : p.hiddenTrait === '우투킬러' ? -3 : 0;
    const rightTrait = p.hiddenTrait === '우투킬러' ? 7 : p.hiddenTrait === '좌투킬러' ? -3 : 0;
    const vsLHPCur = rInt(
      targetOvr + (batsHand === '우타' ? 4 : batsHand === '양타' ? 3 : -4) + leftTrait + hashOffset(hKey + 'vl', 4),
      25,
      98
    );
    const vsRHPCur = rInt(
      targetOvr + (batsHand === '좌타' ? 4 : batsHand === '양타' ? 3 : -1) + rightTrait + hashOffset(hKey + 'vr', 4),
      25,
      98
    );

    const isContactSpeedType = baseContact >= basePower || speed >= 66;
    const sacBunt = rInt((isContactSpeedType ? 64 : 44) + (batPos === 'C' || batPos === '2B' || batPos === 'SS' ? 8 : 0) + hashOffset(hKey + 'sb', 10), 20, 95);
    const buntForHit = rInt(speed * 0.55 + sacBunt * 0.30 + hashOffset(hKey + 'bfh', 8), 15, 94);

    builtBatting = {
      babip: makePair(babipCur, potGap, hashOffset(hKey + 'pb1', 2)),
      avoidK: makePair(avoidKCur, potGap, hashOffset(hKey + 'pb2', 2)),
      gapPower: makePair(gapPowerCur, potGap, hashOffset(hKey + 'pb3', 2)),
      hrPower: makePair(hrPowerCur, potGap, hashOffset(hKey + 'pb4', 3)),
      eye: makePair(eyeCur, potGap, hashOffset(hKey + 'pb5', 2)),
      vsLHP: makePair(vsLHPCur, potGap, 0),
      vsRHP: makePair(vsRHPCur, potGap, 0),
      sacBunt,
      buntForHit,
      dataSource: realBat || sig.hasRecentStats ? 'verified' : 'estimated',
    };

    // 포지션 가중치 공식으로 계산한 OVR/POT가 기존 v27 OVR/POT와 정확히 일치하도록 미세 정렬 (개성 편차 보존)
    alignOotpBatterToTarget(builtBatting, defense, baserunningRatings, batPos, targetOvr, targetPot, getPositionProficiency(p, batPos));

    if (!canPitch) {
      return {
        version: 1,
        batting: builtBatting,
        pitching: null,
        defense,
        baserunning: baserunningRatings,
        personality,
        growthHistory: p.ootpRatings?.growthHistory ?? [],
      };
    }
  }

  // 4B) 투수 세부 능력치 + 구종 + 구속 + 보직 적합도 (순수 투수 및 투타겸업 선수)
  const isStarter = p.position === 'SP' || p.pitchRole === '선발' || (isTwoWay && (p.twoWaySecondaryPosition === 'SP' || !p.pitchRole));
  const legacyP = p.v18Ratings?.pitching;
  const realPitch = REAL_KBO_PITCHER_PROFILES[p.name];
  const sigP = extractPitcherRecentSignals(p);

  const stuffCur = rInt((legacyP?.stuff ?? targetOvr) + sigP.stuffDelta * 0.55 + hashOffset(hKey + 'stf', 3), 25, 99);
  const controlCur = rInt((legacyP?.control ?? targetOvr) + sigP.controlDelta * 0.55 + hashOffset(hKey + 'ctl', 3), 25, 99);
  const hrPrevCur = rInt((legacyP?.hr_prevention ?? targetOvr) + sigP.hrPrevDelta * 0.55 + hashOffset(hKey + 'hrv', 3), 25, 99);
  const hitPrevCur = rInt((legacyP?.run_prevention ?? targetOvr) + sigP.hitPrevDelta * 0.55 + hashOffset(hKey + 'htv', 3), 25, 99);
  const movementCur = rInt(hrPrevCur * 0.52 + hitPrevCur * 0.48, 25, 99);

  const throwsHand =
    realPitch?.throws ??
    p.pitchRepertoire?.throws ??
    (p.throws === 'L' ? '좌투' : '우투');
  const isLefty = throwsHand === '좌투';
  const isSubmarine = throwsHand === '우언' || throwsHand === '우사';

  const vsLHBCur = rInt(
    targetOvr + (isLefty ? 6 : isSubmarine ? -5 : -1) + hashOffset(hKey + 'pvl', 4),
    25,
    98
  );
  const vsRHBCur = rInt(
    targetOvr + (isLefty ? -3 : isSubmarine ? 6 : 3) + hashOffset(hKey + 'pvr', 4),
    25,
    98
  );

  const stamina = rInt(
    legacyP?.stamina_proxy ??
      p.pitchRepertoire?.stamina ??
      (isStarter ? Math.max(62, targetOvr + 2) : Math.min(58, Math.max(36, targetOvr - 12))),
    30,
    96
  );
  const holdRunner = rInt(
    (isLefty ? 68 : 58) + (controlCur - 62) * 0.35 + hashOffset(hKey + 'hld', 10),
    25,
    95
  );

  // 평균/최고 구속
  const ageVeloAdj = p.age >= 37 ? -2.0 : p.age >= 34 ? -1.0 : p.age <= 24 ? 0.5 : 0;
  const avgVelocityKmh = realPitch
    ? Number(clamp(realPitch.avgVelocityKmh + (p.age >= 37 ? -1.5 : 0), 128, 157).toFixed(1))
    : p.pitchRepertoire?.avgVelocityKmh
    ? Number(clamp(p.pitchRepertoire.avgVelocityKmh, 128, 157).toFixed(1))
    : Number(
        clamp(
          (isSubmarine ? 136.5 : isStarter ? 142.5 : 145.5) +
            (stuffCur - 65) * 0.24 +
            ageVeloAdj +
            hashOffset(hKey + 'vel', 25) * 0.1,
          130,
          156
        ).toFixed(1)
      );
  const maxVelocityKmh = realPitch
    ? Number(Math.max(avgVelocityKmh + 2.8, realPitch.maxVelocityKmh + (p.age >= 37 ? -1.5 : 0)).toFixed(1))
    : p.pitchRepertoire?.maxVelocityKmh
    ? Number(Math.max(avgVelocityKmh + 2.8, p.pitchRepertoire.maxVelocityKmh).toFixed(1))
    : Number(clamp(avgVelocityKmh + 3.4 + (stableHash(hKey + 'mvel') % 26) * 0.1, avgVelocityKmh + 2.8, 161.5).toFixed(1));

  // 구종 구성 (확인된 실제 구종 vs 추정값 구분)
  let pitches: OotpPitchItem[];
  if (realPitch && realPitch.pitches.length > 0) {
    pitches = realPitch.pitches.map((pt, idx) => {
      const c = rInt(pt.grade, 35, 99);
      const potP = rInt(Math.max(c, c + Math.round(potGap * (idx < 2 ? 0.95 : 0.8))), c, 99);
      return {
        name: pt.name,
        cur: c,
        pot: potP,
        usagePct: pt.usagePct,
        source: 'verified',
      };
    });
  } else if (p.pitchRepertoire?.pitches && p.pitchRepertoire.pitches.length > 0) {
    pitches = p.pitchRepertoire.pitches.map((pt, idx) => {
      const c = rInt(pt.grade, 35, 99);
      const potP = rInt(Math.max(c, c + Math.round(potGap * (idx < 2 ? 0.95 : 0.8))), c, 99);
      return {
        name: pt.name,
        cur: c,
        pot: potP,
        usagePct: pt.usagePct,
        source: 'estimated',
      };
    });
  } else {
    const pool: PitchTypeName[] = isSubmarine
      ? ['체인지업', '커브', '슬라이더', '투심']
      : ['슬라이더', '스위퍼', '커브', '체인지업', '포크볼', '스플리터', '커터', '투심'];
    const count = isStarter ? (stableHash(hKey + 'pc') % 3 === 0 ? 4 : 3) : (stableHash(hKey + 'pc') % 2 === 0 ? 3 : 2);
    const primary: PitchTypeName = stableHash(hKey + 'p0') % 6 === 0 ? '투심' : '포심';
    const picked: PitchTypeName[] = [primary];
    const seedNum = stableHash(hKey + 'pl');
    for (let i = 0; picked.length < count && i < pool.length; i++) {
      const cand = pool[(seedNum + i * 3) % pool.length];
      if (!picked.includes(cand)) picked.push(cand);
    }
    const usages = count === 4 ? [44, 24, 18, 14] : count === 3 ? [50, 30, 20] : [62, 38];
    pitches = picked.map((name, idx) => {
      const baseGrade =
        idx === 0
          ? rInt((avgVelocityKmh - 134) * 2.1 + 48 + (stuffCur - 65) * 0.35, 42, 98)
          : rInt(stuffCur * 0.55 + movementCur * 0.45 + hashOffset(`${hKey}-pg-${idx}`, 6), 38, 97);
      const potP = rInt(Math.max(baseGrade, baseGrade + Math.round(potGap * (idx < 2 ? 0.95 : 0.85))), baseGrade, 99);
      return {
        name,
        cur: baseGrade,
        pot: potP,
        usagePct: usages[idx] ?? 15,
        source: 'estimated',
      };
    });
  }

  // 땅볼 유도율 (25~75%): 투심/싱커/포크/스플리터/언더핸드 높음, 하이패스트볼 낮음
  const hasSinkerOrFork = pitches.some((x) => x.name === '투심' || x.name === '포크볼' || x.name === '스플리터');
  const groundballRate = rInt(
    47 +
      (isSubmarine ? 9 : 0) +
      (hasSinkerOrFork ? 6 : -2) +
      (movementCur - 64) * 0.14 +
      hashOffset(hKey + 'gb', 6),
    28,
    72
  );

  const pitching: OotpPitcherRatings = {
    stuff: makePair(stuffCur, potGap, hashOffset(hKey + 'pp1', 2)),
    movement: makePair(movementCur, potGap, hashOffset(hKey + 'pp2', 2)),
    control: makePair(controlCur, potGap, hashOffset(hKey + 'pp3', 2)),
    hrPrevent: makePair(hrPrevCur, potGap, hashOffset(hKey + 'pp4', 2)),
    hitPrevent: makePair(hitPrevCur, potGap, hashOffset(hKey + 'pp5', 2)),
    vsLHB: makePair(vsLHBCur, potGap, 0),
    vsRHB: makePair(vsRHBCur, potGap, 0),
    stamina,
    holdRunner,
    avgVelocityKmh,
    maxVelocityKmh,
    groundballRate,
    pitches,
    starterFit: 50,
    relieverFit: 50,
    dataSource: realPitch ? 'verified' : 'estimated',
  };

  // 하현승 등 실존 투타겸업 1라운더 구속·4구종 보정 (고교 최고 153km/h 좌완 선발)
  if (isTwoWay && (p.id === 'D2027-001' || p.name === '하현승')) {
    pitching.avgVelocityKmh = 147.5;
    pitching.maxVelocityKmh = 153.0;
    pitching.stamina = Math.max(pitching.stamina, 64);
    pitching.pitches = [
      { name: '포심', cur: 63, pot: 92, usagePct: 48, source: 'verified' },
      { name: '슬라이더', cur: 58, pot: 88, usagePct: 24, source: 'verified' },
      { name: '커브', cur: 54, pot: 84, usagePct: 16, source: 'verified' },
      { name: '체인지업', cur: 52, pot: 84, usagePct: 12, source: 'verified' },
    ];
    pitching.dataSource = 'verified';
  }

  alignOotpPitcherToTarget(pitching, isStarter, targetOvr, targetPot);
  const fit = evaluatePitcherRoleFit(pitching);
  pitching.starterFit = fit.starterFit;
  pitching.relieverFit = fit.relieverFit;

  return {
    version: 1,
    batting: builtBatting,
    pitching,
    defense,
    baserunning: baserunningRatings,
    personality,
    growthHistory: p.ootpRatings?.growthHistory ?? [],
  };
}

function alignOotpBatterToTarget(
  bat: OotpBatterRatings,
  def: OotpDefenseRatings,
  run: OotpBaserunningRatings,
  pos: Position,
  targetOvr: number,
  targetPot: number,
  proficiency: number
): void {
  const keys: (keyof Pick<OotpBatterRatings, 'babip' | 'avoidK' | 'gapPower' | 'hrPower' | 'eye' | 'vsLHP' | 'vsRHP'>)[] = [
    'babip',
    'avoidK',
    'gapPower',
    'hrPower',
    'eye',
    'vsLHP',
    'vsRHP',
  ];

  // Align current OVR — 수비·주루가 타격 성장에 비해 과도하게 뒤처져 타격 지표가 인플레이션되지 않도록 균형 보정
  const defFloorForPos = pos === 'DH' ? 50 : rInt(targetOvr - 10, 42, 82);
  if (pos === 'C') {
    def.catcherBlocking = Math.max(def.catcherBlocking, defFloorForPos);
    def.catcherFraming = Math.max(def.catcherFraming, defFloorForPos);
    def.catcherArm = Math.max(def.catcherArm, defFloorForPos - 2);
  } else if (pos === '1B' || pos === '2B' || pos === '3B' || pos === 'SS') {
    def.infieldRange = Math.max(def.infieldRange, defFloorForPos - (pos === '1B' ? 6 : 0));
    def.infieldError = Math.max(def.infieldError, defFloorForPos);
    def.infieldArm = Math.max(def.infieldArm, defFloorForPos - (pos === '1B' ? 6 : 2));
    def.turnDP = Math.max(def.turnDP, defFloorForPos - 2);
  } else if (pos === 'LF' || pos === 'CF' || pos === 'RF') {
    def.outfieldRange = Math.max(def.outfieldRange, defFloorForPos);
    def.outfieldError = Math.max(def.outfieldError, defFloorForPos);
    def.outfieldArm = Math.max(def.outfieldArm, defFloorForPos - 2);
  }

  const maxBatCap = rInt(targetOvr + 18, 55, 99);
  for (let iter = 0; iter < 16; iter++) {
    const curOvr = computeOotpBatterOverall(bat, def, run, pos, 'cur', proficiency);
    const diff = targetOvr - curOvr;
    if (diff === 0) break;
    const step = diff > 0 ? Math.max(1, Math.round(diff * 0.7)) : Math.min(-1, Math.round(diff * 0.7));
    for (const k of keys) {
      bat[k].cur = rInt(bat[k].cur + step, 22, maxBatCap);
      if (bat[k].pot < bat[k].cur) bat[k].pot = bat[k].cur;
    }
  }
  for (let iter = 0; iter < 14; iter++) {
    const curOvr = computeOotpBatterOverall(bat, def, run, pos, 'cur', proficiency);
    const diff = targetOvr - curOvr;
    if (diff === 0) break;
    const dir = diff > 0 ? 1 : -1;
    for (const k of keys) {
      if (computeOotpBatterOverall(bat, def, run, pos, 'cur', proficiency) === targetOvr) break;
      bat[k].cur = rInt(bat[k].cur + dir, 22, maxBatCap);
      if (bat[k].pot < bat[k].cur) bat[k].pot = bat[k].cur;
    }
  }

  // Align potential POT (>= cur)
  for (let iter = 0; iter < 16; iter++) {
    const curPot = computeOotpBatterOverall(bat, def, run, pos, 'pot');
    const diff = targetPot - curPot;
    if (diff === 0) break;
    const step = diff > 0 ? Math.max(1, Math.round(diff * 0.7)) : Math.min(-1, Math.round(diff * 0.7));
    for (const k of keys) {
      bat[k].pot = rInt(Math.max(bat[k].cur, bat[k].pot + step), bat[k].cur, 99);
    }
  }
  for (let iter = 0; iter < 14; iter++) {
    const curPot = computeOotpBatterOverall(bat, def, run, pos, 'pot');
    const diff = targetPot - curPot;
    if (diff === 0) break;
    const dir = diff > 0 ? 1 : -1;
    for (const k of keys) {
      if (computeOotpBatterOverall(bat, def, run, pos, 'pot') === targetPot) break;
      bat[k].pot = rInt(Math.max(bat[k].cur, bat[k].pot + dir), bat[k].cur, 99);
    }
  }
}

function alignOotpPitcherToTarget(
  pt: OotpPitcherRatings,
  isStarter: boolean,
  targetOvr: number,
  targetPot: number
): void {
  const keys: (keyof Pick<OotpPitcherRatings, 'stuff' | 'movement' | 'control' | 'hrPrevent' | 'hitPrevent' | 'vsLHB' | 'vsRHB'>)[] = [
    'stuff',
    'movement',
    'control',
    'hrPrevent',
    'hitPrevent',
    'vsLHB',
    'vsRHB',
  ];

  // Align current OVR
  for (let iter = 0; iter < 16; iter++) {
    const curOvr = computeOotpPitcherOverall(pt, isStarter, 'cur');
    const diff = targetOvr - curOvr;
    if (diff === 0) break;
    const step = diff > 0 ? Math.max(1, Math.round(diff * 0.75)) : Math.min(-1, Math.round(diff * 0.75));
    for (const k of keys) {
      pt[k].cur = rInt(pt[k].cur + step, 22, 99);
      if (pt[k].pot < pt[k].cur) pt[k].pot = pt[k].cur;
    }
    for (const pitch of pt.pitches) {
      pitch.cur = rInt(pitch.cur + Math.round(step * 0.65), 32, 99);
      if (pitch.pot < pitch.cur) pitch.pot = pitch.cur;
    }
  }
  for (let iter = 0; iter < 14; iter++) {
    const curOvr = computeOotpPitcherOverall(pt, isStarter, 'cur');
    const diff = targetOvr - curOvr;
    if (diff === 0) break;
    const dir = diff > 0 ? 1 : -1;
    for (const k of keys) {
      if (computeOotpPitcherOverall(pt, isStarter, 'cur') === targetOvr) break;
      pt[k].cur = rInt(pt[k].cur + dir, 22, 99);
      if (pt[k].pot < pt[k].cur) pt[k].pot = pt[k].cur;
    }
  }

  // Align potential POT
  for (let iter = 0; iter < 16; iter++) {
    const curPot = computeOotpPitcherOverall(pt, isStarter, 'pot');
    const diff = targetPot - curPot;
    if (diff === 0) break;
    const step = diff > 0 ? Math.max(1, Math.round(diff * 0.75)) : Math.min(-1, Math.round(diff * 0.75));
    for (const k of keys) {
      pt[k].pot = rInt(Math.max(pt[k].cur, pt[k].pot + step), pt[k].cur, 99);
    }
    for (const pitch of pt.pitches) {
      pitch.pot = rInt(Math.max(pitch.cur, pitch.pot + Math.round(step * 0.65)), pitch.cur, 99);
    }
  }
  for (let iter = 0; iter < 14; iter++) {
    const curPot = computeOotpPitcherOverall(pt, isStarter, 'pot');
    const diff = targetPot - curPot;
    if (diff === 0) break;
    const dir = diff > 0 ? 1 : -1;
    for (const k of keys) {
      if (computeOotpPitcherOverall(pt, isStarter, 'pot') === targetPot) break;
      pt[k].pot = rInt(Math.max(pt[k].cur, pt[k].pot + dir), pt[k].cur, 99);
    }
  }
}

/**
 * 단일 선수 OOTP 세부 능력치 보장 (없으면 생성 후 기존 레거시 필드와 동기화)
 */
export function ensurePlayerOotpRatingsInPlace(p: Player): OotpPlayerRatings {
  const missingTwoWayHalf = Boolean(p.isTwoWay && (!p.ootpRatings?.batting || !p.ootpRatings?.pitching));
  if (!p.ootpRatings || p.ootpRatings.version !== 1 || missingTwoWayHalf) {
    p.ootpRatings = buildOotpRatingsForPlayer(p);
    syncLegacyRatingsFromOotpInPlace(p, true);
  } else {
    // 보직 적합도 최신화 및 cur <= pot 불변식 검증
    if (p.ootpRatings.pitching) {
      const pt = p.ootpRatings.pitching;
      for (const k of ['stuff', 'movement', 'control', 'hrPrevent', 'hitPrevent', 'vsLHB', 'vsRHB'] as const) {
        pt[k].cur = rInt(pt[k].cur, 1, 100);
        pt[k].pot = rInt(Math.max(pt[k].cur, pt[k].pot), pt[k].cur, 100);
      }
      for (const pitch of pt.pitches) {
        pitch.cur = rInt(pitch.cur, 1, 100);
        pitch.pot = rInt(Math.max(pitch.cur, pitch.pot), pitch.cur, 100);
      }
      const fit = evaluatePitcherRoleFit(pt);
      pt.starterFit = fit.starterFit;
      pt.relieverFit = fit.relieverFit;
    }
    if (p.ootpRatings.batting) {
      const b = p.ootpRatings.batting;
      for (const k of ['babip', 'avoidK', 'gapPower', 'hrPower', 'eye', 'vsLHP', 'vsRHP'] as const) {
        b[k].cur = rInt(b[k].cur, 1, 100);
        b[k].pot = rInt(Math.max(b[k].cur, b[k].pot), b[k].cur, 100);
      }
    }
  }
  return p.ootpRatings;
}

export function ensureCareerOotpRatingsInPlace(career: CareerSave): void {
  for (const p of Object.values(career.players)) {
    ensurePlayerOotpRatingsInPlace(p);
  }
}

/**
 * 나이·훈련 집중·코칭스태프·성향(프로의식·훈련태도·내구성)·부상·성장유형 기반
 * 개별 세부 능력치(현재 & 잠재) 단계적 성장/노쇠화 처리
 */
export function evolvePlayerOotpSubRatingsInPlace(params: {
  player: Player;
  season: number;
  date: string;
  ovrDelta: number;
  potDelta: number;
  reason: string;
  rng: SeededRng;
}): OotpGrowthHistoryEntry | null {
  const { player: p, season, date, ovrDelta, potDelta, reason, rng } = params;
  const o = ensurePlayerOotpRatingsInPlace(p);
  const prevOvr = p.ability;
  const prevPot = p.potential;
  const changed: { label: string; prev: number; next: number; isPot?: boolean }[] = [];

  const workBonus = (o.personality.workEthic - 60) / 100; // -0.35..+0.38
  const profBonus = (o.personality.professionalism - 60) / 120;
  const curveMult =
    p.growthCurveProfile === '조기개화'
      ? p.age <= 24 ? 1.2 : p.age >= 31 ? 1.15 : 0.95
      : p.growthCurveProfile === '대기만성'
      ? p.age >= 24 && p.age <= 29 ? 1.25 : 0.9
      : p.growthCurveProfile === '철강왕'
      ? p.age >= 31 ? 0.72 : 1.0
      : 1.0;

  const applyPairStep = (
    pair: OotpRatingPair,
    label: string,
    dir: number,
    focused: boolean,
    potShift: number
  ) => {
    const oldCur = pair.cur;
    const oldPot = pair.pot;
    if (potShift !== 0) {
      pair.pot = rInt(Math.max(pair.cur, pair.pot + potShift), pair.cur, 99);
      if (pair.pot !== oldPot) {
        changed.push({ label: `${label}(잠재)`, prev: oldPot, next: pair.pot, isPot: true });
      }
    }
    if (dir > 0 && pair.cur < pair.pot) {
      const mag = Math.max(1, Math.round(dir * (focused ? 1.45 : 1.0) * (1 + workBonus * 0.5) * curveMult));
      pair.cur = rInt(Math.min(pair.pot, pair.cur + mag), 20, pair.pot);
    } else if (dir < 0) {
      const resist = clamp(1 - profBonus * 0.35, 0.7, 1.2);
      const mag = Math.max(1, Math.round(Math.abs(dir) * resist * curveMult));
      pair.cur = rInt(pair.cur - mag, 20, pair.pot);
    }
    if (pair.cur !== oldCur) {
      changed.push({ label, prev: oldCur, next: pair.cur });
    }
  };

  if (p.role === '타자' && o.batting) {
    const b = o.batting;
    const focus = p.trainingFocus;
    const pairs: { key: keyof Pick<OotpBatterRatings, 'babip' | 'avoidK' | 'gapPower' | 'hrPower' | 'eye' | 'vsLHP' | 'vsRHP'>; label: string; weight: number }[] = [
      { key: 'babip', label: 'BABIP', weight: focus === '타격' ? 1.35 : 1.0 },
      { key: 'avoidK', label: '삼진 회피', weight: focus === '타격' ? 1.3 : 1.0 },
      { key: 'gapPower', label: '갭 파워', weight: focus === '타격' ? 1.25 : 0.95 },
      { key: 'hrPower', label: '홈런 파워', weight: focus === '타격' ? 1.35 : p.age >= 24 && p.age <= 30 ? 1.1 : 0.9 },
      { key: 'eye', label: '선구안', weight: focus === '타격' ? 1.25 : p.age >= 26 ? 1.1 : 0.95 },
      { key: 'vsLHP', label: '좌완 상대', weight: 0.75 },
      { key: 'vsRHP', label: '우완 상대', weight: 0.85 },
    ];

    const pickCount = Math.max(2, Math.min(5, Math.abs(ovrDelta) + 2));
    for (let i = 0; i < pairs.length; i++) {
      const item = pairs[i];
      const chance = clamp((0.45 + Math.abs(ovrDelta) * 0.14) * item.weight, 0.25, 0.95);
      if (i < pickCount || rng.next() < chance) {
        const subPotShift = potDelta !== 0 && rng.next() < 0.6 ? potDelta : 0;
        applyPairStep(b[item.key], item.label, ovrDelta, focus === '타격', subPotShift);
      }
    }

    // 주력·수비는 연령 곡선에 따라 개별 변화 (유망주 성장 시 수비/주루도 함께 성장, 32세+ 조기 노쇠)
    if ((focus === '주루' || p.age <= 25) && ovrDelta > 0 && p.age <= 29) {
      const oldSpd = o.baserunning.speed;
      if (focus === '주루' || rng.next() < 0.45) {
        o.baserunning.speed = rInt(oldSpd + 1, 20, 99);
        o.baserunning.baserunning = rInt(o.baserunning.baserunning + 1, 20, 99);
        o.baserunning.stealAbility = rInt(o.baserunning.stealAbility + 1, 20, 99);
        if (o.baserunning.speed !== oldSpd) changed.push({ label: '주력', prev: oldSpd, next: o.baserunning.speed });
      }
    } else if (p.age >= 32 && ovrDelta < 0 && rng.next() < 0.55) {
      const oldSpd = o.baserunning.speed;
      o.baserunning.speed = rInt(oldSpd - 1, 20, 99);
      if (o.baserunning.speed !== oldSpd) changed.push({ label: '주력', prev: oldSpd, next: o.baserunning.speed });
    }

    if ((focus === '수비' || p.age <= 26) && ovrDelta > 0) {
      const defChance = focus === '수비' ? 1.0 : 0.65;
      if (rng.next() < defChance) {
        if (p.position === 'C') {
          const prev = o.defense.catcherFraming;
          o.defense.catcherFraming = rInt(prev + 1, 20, 99);
          o.defense.catcherBlocking = rInt(o.defense.catcherBlocking + 1, 20, 99);
          if (o.defense.catcherFraming !== prev) changed.push({ label: '프레이밍', prev, next: o.defense.catcherFraming });
        } else if (['LF', 'CF', 'RF'].includes(p.position)) {
          const prev = o.defense.outfieldRange;
          o.defense.outfieldRange = rInt(prev + 1, 20, 99);
          o.defense.outfieldError = rInt(o.defense.outfieldError + 1, 20, 99);
          if (o.defense.outfieldRange !== prev) changed.push({ label: '외야 범위', prev, next: o.defense.outfieldRange });
        } else if (p.position !== 'DH') {
          const prev = o.defense.infieldRange;
          o.defense.infieldRange = rInt(prev + 1, 20, 99);
          o.defense.infieldError = rInt(o.defense.infieldError + 1, 20, 99);
          o.defense.turnDP = rInt(o.defense.turnDP + 1, 20, 99);
          if (o.defense.infieldRange !== prev) changed.push({ label: '내야 범위', prev, next: o.defense.infieldRange });
        }
      }
    }
  } else if (p.role === '투수' && o.pitching) {
    const pt = o.pitching;
    const focus = p.trainingFocus;
    const pairs: { key: keyof Pick<OotpPitcherRatings, 'stuff' | 'movement' | 'control' | 'hrPrevent' | 'hitPrevent' | 'vsLHB' | 'vsRHB'>; label: string; focused: boolean }[] = [
      { key: 'stuff', label: '구위', focused: focus === '구위' },
      { key: 'movement', label: '무브먼트', focused: focus === '구위' || focus === '제구' },
      { key: 'control', label: '제구력', focused: focus === '제구' },
      { key: 'hrPrevent', label: '피홈런 억제', focused: focus === '제구' },
      { key: 'hitPrevent', label: '피안타 억제', focused: focus === '구위' },
      { key: 'vsLHB', label: '좌타 상대', focused: false },
      { key: 'vsRHB', label: '우타 상대', focused: false },
    ];

    for (const item of pairs) {
      const chance = item.focused ? 0.85 : 0.58;
      if (rng.next() < chance) {
        const subPotShift = potDelta !== 0 && rng.next() < 0.6 ? potDelta : 0;
        applyPairStep(pt[item.key], item.label, ovrDelta, item.focused, subPotShift);
      }
    }

    // 구종별 개별 성장/노쇠화
    if (pt.pitches.length > 0) {
      const targetPitch = pt.pitches[rng.int(0, pt.pitches.length - 1)];
      const oldG = targetPitch.cur;
      if (ovrDelta > 0 && targetPitch.cur < targetPitch.pot) {
        targetPitch.cur = rInt(Math.min(targetPitch.pot, targetPitch.cur + Math.max(1, ovrDelta)), 25, targetPitch.pot);
      } else if (ovrDelta < 0) {
        targetPitch.cur = rInt(targetPitch.cur + ovrDelta, 25, targetPitch.pot);
      }
      if (targetPitch.cur !== oldG) {
        changed.push({ label: `${targetPitch.name}`, prev: oldG, next: targetPitch.cur });
      }
    }

    // 체력·구속 변화
    if (focus === '체력' && ovrDelta > 0 && pt.stamina < 92) {
      const oldSt = pt.stamina;
      pt.stamina = rInt(oldSt + 1, 30, 96);
      if (pt.stamina !== oldSt) changed.push({ label: '체력', prev: oldSt, next: pt.stamina });
    } else if (p.age >= 33 && ovrDelta < 0 && rng.next() < 0.5) {
      const oldVelo = pt.avgVelocityKmh;
      pt.avgVelocityKmh = Number(clamp(oldVelo - 0.4, 128, 157).toFixed(1));
      pt.maxVelocityKmh = Number(Math.max(pt.avgVelocityKmh + 2.5, pt.maxVelocityKmh - 0.4).toFixed(1));
      if (pt.avgVelocityKmh !== oldVelo) {
        changed.push({ label: '평균구속(km/h)', prev: oldVelo, next: pt.avgVelocityKmh });
      }
    } else if (focus === '구위' && ovrDelta > 0 && p.age <= 25 && rng.next() < 0.4) {
      const oldVelo = pt.avgVelocityKmh;
      pt.avgVelocityKmh = Number(clamp(oldVelo + 0.4, 128, 158).toFixed(1));
      pt.maxVelocityKmh = Number(Math.min(162, pt.maxVelocityKmh + 0.4).toFixed(1));
      if (pt.avgVelocityKmh !== oldVelo) {
        changed.push({ label: '평균구속(km/h)', prev: oldVelo, next: pt.avgVelocityKmh });
      }
    }
  }

  // 세부 능력치 변동 후 OVR/POT를 공식에 맞춰 재산출 (단, 시즌 성장 캡 존중)
  const targetOvr = clamp(prevOvr + ovrDelta, 25, Math.min(99, prevPot + potDelta));
  const targetPot = clamp(Math.max(targetOvr, prevPot + potDelta), targetOvr, 99);
  if (p.role === '타자' && o.batting) {
    alignOotpBatterToTarget(o.batting, o.defense, o.baserunning, p.position, targetOvr, targetPot, getPositionProficiency(p, p.position));
  } else if (p.role === '투수' && o.pitching) {
    const isStarter = p.position === 'SP' || p.pitchRole === '선발';
    alignOotpPitcherToTarget(o.pitching, isStarter, targetOvr, targetPot);
  }
  syncLegacyRatingsFromOotpInPlace(p, false);

  if (changed.length === 0 && p.ability === prevOvr && p.potential === prevPot) {
    return null;
  }

  const entry: OotpGrowthHistoryEntry = {
    season,
    date,
    age: p.age,
    prevOvr,
    newOvr: p.ability,
    prevPot,
    newPot: p.potential,
    changedFields: changed.slice(0, 6),
    reason,
  };
  if (!o.growthHistory) o.growthHistory = [];
  o.growthHistory.unshift(entry);
  if (o.growthHistory.length > 30) {
    o.growthHistory = o.growthHistory.slice(0, 30);
  }
  return entry;
}

/**
 * 최근 성적 기준 개별 선수 OOTP 세부 능력치 재평가 요약 라벨 (스카우팅/UI 표시용)
 */
export function getOotpDataSourceSummary(p: Player): {
  label: string;
  isVerified: boolean;
} {
  const o = ensurePlayerOotpRatingsInPlace(p);
  if (p.role === '투수' && o.pitching) {
    const hasVerifiedPitch = o.pitching.pitches.some((x) => x.source === 'verified');
    if (o.pitching.dataSource === 'verified' && hasVerifiedPitch) {
      return { label: '실측 구종·지표 기반', isVerified: true };
    }
    return { label: '실제 성적 기반 추정치', isVerified: false };
  }
  if (p.role === '타자' && o.batting) {
    if (o.batting.dataSource === 'verified') {
      return { label: '실제 성적·지표 기반', isVerified: true };
    }
    return { label: '스카우팅 추정치', isVerified: false };
  }
  return { label: '추정치', isVerified: false };
}
