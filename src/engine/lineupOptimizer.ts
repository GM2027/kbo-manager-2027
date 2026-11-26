import { isMilitaryServing } from './militaryEngine';
import {
  computeEffectiveFieldingAtPosition,
  getPositionProficiency,
} from './positionEngine';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  BatterStats,
  CareerSave,
  LineupOptimizationResult,
  OptimizedLineupSlot,
  Player,
  Position,
  TeamId,
} from '../types/kbo';
import { calcAVG, calcOBP, calcOPS, calcSLG } from './stats';

export const BATTING_SLOT_SPECS: {
  order: number;
  roleTitle: string;
  keyFactors: string;
}[] = [
  { order: 1, roleTitle: '출루형 타자', keyFactors: '출루율, 주력, 선구안' },
  { order: 2, roleTitle: '팀 내 우수 타자', keyFactors: '출루율, 장타력, 컨택' },
  { order: 3, roleTitle: '중심 타선', keyFactors: '종합 타격 능력' },
  { order: 4, roleTitle: '장타형 타자', keyFactors: '장타율, 홈런, 타점 생산력' },
  { order: 5, roleTitle: '중심 타선 보조', keyFactors: '장타력, 득점권 생산력' },
  { order: 6, roleTitle: '중장거리 타자', keyFactors: '컨택, 장타력' },
  { order: 7, roleTitle: '하위 타선', keyFactors: '타격 능력, 수비 기여' },
  { order: 8, roleTitle: '수비형 타자', keyFactors: '수비력, 출루 능력' },
  { order: 9, roleTitle: '연결형 타자', keyFactors: '컨택, 출루율, 주력' },
];

const UNIQUE_FIELD_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

interface BatterTraitVector {
  obp: number; // 출루율 (0..100)
  eye: number; // 선구안 (0..100)
  speed: number; // 주력 (0..100)
  contact: number; // 컨택 (0..100)
  power: number; // 장타력/장타율/홈런 (0..100)
  rbiClutch: number; // 타점/득점권 생산력 (0..100)
  overallBat: number; // 종합 타격 능력 (0..100)
  defense: number; // 수비 기여도 (0..100)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function isHitterAvailableForLineup(career: CareerSave, p: Player, teamId: TeamId): boolean {
  const onNationalDuty =
    p.nationalTeamDuty != null &&
    career.gamesPlayed >= p.nationalTeamDuty.startRound &&
    career.gamesPlayed < p.nationalTeamDuty.endRound;

  return (
    p.teamId === teamId &&
    p.role === '타자' &&
    p.rosterTier === '1군' &&
    !p.injury &&
    !onNationalDuty &&
    !isMilitaryServing(p.militaryStatus) &&
    !p.overseasTrainingLocation
  );
}

/**
 * 선수의 기본 능력치·폼·나이·포지션·타격 프로필·숨겨진 특성 및 시즌 실전 기록을 결합해
 * 8개 핵심 타격/수비 지표(0..100)를 산출합니다.
 */
function buildBatterTraits(p: Player, assignedPos: Position): BatterTraitVector {
  const bs = p.stats as BatterStats;
  const pa = bs.PA ?? 0;
  const ab = bs.AB ?? 0;
  const formDelta = p.form * 1.8;
  const fatiguePenalty = Math.max(0, p.fatigue - 60) * 0.14;
  const baseEff = clamp(p.ability + formDelta - fatiguePenalty, 45, 99);
  const bp = p.battingProfile;

  // Position priors
  const posSpeedPrior: Record<Position, number> = {
    CF: 14,
    SS: 10,
    '2B': 10,
    LF: 6,
    RF: 5,
    '3B': -2,
    '1B': -10,
    DH: -11,
    C: -14,
    SP: 0,
    RP: 0,
    CL: 0,
  };
  const posPowerPrior: Record<Position, number> = {
    '1B': 12,
    DH: 12,
    '3B': 9,
    RF: 8,
    LF: 6,
    C: 1,
    CF: -2,
    SS: -5,
    '2B': -7,
    SP: 0,
    RP: 0,
    CL: 0,
  };
  const posDefensePrior: Record<Position, number> = {
    C: 90,
    SS: 88,
    CF: 84,
    '2B': 82,
    '3B': 78,
    RF: 74,
    LF: 70,
    '1B': 65,
    DH: 40,
    SP: 50,
    RP: 50,
    CL: 50,
  };

  // Age speed curve
  const ageSpeedAdj = p.age <= 24 ? 7 : p.age <= 28 ? 4 : p.age <= 32 ? 0 : p.age <= 35 ? -6 : -12;
  const sprayPowerAdj = bp?.sprayTendency === '당겨치기' ? 6 : bp?.sprayTendency === '스프레이' ? 2 : -2;
  const sprayContactAdj = bp?.sprayTendency === '밀어치기' ? 6 : bp?.sprayTendency === '스프레이' ? 4 : -1;
  const trainingSpeed = p.trainingFocus === '주루' ? 4 : 0;
  const trainingDefense = p.trainingFocus === '수비' ? 5 : 0;
  const trainingBat = p.trainingFocus === '타격' ? 2 : 0;

  const ob = p.ootpRatings?.batting;
  const orun = p.ootpRatings?.baserunning;
  let obpPrior = ob
    ? clamp(ob.eye.cur * 0.52 + ob.babip.cur * 0.30 + ob.avoidK.cur * 0.18 + formDelta - fatiguePenalty, 40, 99)
    : clamp(baseEff + sprayContactAdj * 0.6 + (bp ? (bp.vsBreaking - 70) * 0.25 : 0) + (p.age >= 29 ? 2 : 0), 45, 99);
  let eyePrior = ob
    ? clamp(ob.eye.cur + formDelta * 0.6, 40, 99)
    : clamp(baseEff + (bp ? (bp.vsBreaking - 68) * 0.45 : 0) + (p.hiddenTrait === '꾸준함' ? 4 : 0), 45, 99);
  let speedPrior = orun
    ? clamp(orun.speed * 0.6 + orun.baserunning * 0.25 + orun.stealAbility * 0.15 + trainingSpeed, 25, 99)
    : clamp(68 + (posSpeedPrior[p.position] ?? 0) + ageSpeedAdj + trainingSpeed + (baseEff - 72) * 0.35, 35, 99);
  let contactPrior = ob
    ? clamp(ob.babip.cur * 0.56 + ob.avoidK.cur * 0.44 + trainingBat + formDelta * 0.7, 40, 99)
    : clamp(baseEff + sprayContactAdj + trainingBat + (p.hiddenTrait === '꾸준함' ? 3 : 0), 45, 99);
  let powerPrior = ob
    ? clamp(ob.hrPower.cur * 0.68 + ob.gapPower.cur * 0.32 + trainingBat + formDelta * 0.7, 35, 99)
    : clamp(baseEff + (posPowerPrior[p.position] ?? 0) + sprayPowerAdj + trainingBat, 42, 99);
  let rbiClutchPrior = clamp(
    baseEff +
      (posPowerPrior[p.position] ?? 0) * 0.55 +
      (bp?.rispClutch ?? 0) * 1.4 +
      (p.hiddenTrait === '클러치히터' || p.hiddenTrait === '큰경기강세' ? 6 : 0),
    45,
    99
  );
  let overallBatPrior = clamp(baseEff + trainingBat + (p.hiddenTrait === '클러치히터' ? 2.5 : 0), 45, 99);
  const effDef = computeEffectiveFieldingAtPosition(p, assignedPos);
  const defense = clamp(
    (posDefensePrior[assignedPos] ?? 65) * 0.45 +
      effDef.effectiveFielding * 0.55 +
      trainingDefense +
      (assignedPos === 'DH' ? -15 : 0),
    25,
    99
  );

  // Smoothly blend real season statistics when PA >= 15
  if (pa >= 15 && ab >= 10) {
    const weight = Math.min(0.62, pa / 180);
    const avg = calcAVG(bs.H, bs.AB) ?? 0.265;
    const obp = calcOBP(bs.H, bs.BB, bs.HBP, bs.AB, bs.SF) ?? 0.34;
    const slg = calcSLG(bs.TB, bs.AB) ?? 0.4;
    const ops = calcOPS(bs) ?? 0.74;
    const bbRate = (bs.BB ?? 0) / Math.max(1, pa);
    const kRate = (bs.SO ?? 0) / Math.max(1, pa);
    const hrPer144 = ((bs.HR ?? 0) / Math.max(1, pa)) * 520;
    const rbiPer144 = ((bs.RBI ?? 0) / Math.max(1, pa)) * 520;
    const sbPer144 = ((bs.SB ?? 0) / Math.max(1, pa)) * 520;

    const obpStat = clamp(45 + (obp - 0.27) * 260, 40, 99);
    const eyeStat = clamp(55 + bbRate * 240 - kRate * 95, 40, 99);
    const speedStat = clamp(52 + sbPer144 * 1.65 + (posSpeedPrior[p.position] ?? 0) * 0.5, 35, 99);
    const contactStat = clamp(45 + (avg - 0.21) * 320, 40, 99);
    const powerStat = clamp(42 + (slg - 0.3) * 165 + hrPer144 * 0.85, 40, 99);
    const rbiStat = clamp(44 + rbiPer144 * 0.45 + (slg - 0.32) * 90 + (bp?.rispClutch ?? 0) * 1.1, 40, 99);
    const overallStat = clamp(44 + (ops - 0.58) * 125, 40, 99);

    obpPrior = obpPrior * (1 - weight) + obpStat * weight;
    eyePrior = eyePrior * (1 - weight) + eyeStat * weight;
    speedPrior = speedPrior * (1 - weight) + speedStat * weight;
    contactPrior = contactPrior * (1 - weight) + contactStat * weight;
    powerPrior = powerPrior * (1 - weight) + powerStat * weight;
    rbiClutchPrior = rbiClutchPrior * (1 - weight) + rbiStat * weight;
    overallBatPrior = overallBatPrior * (1 - weight) + overallStat * weight;
  }

  return {
    obp: obpPrior,
    eye: eyePrior,
    speed: speedPrior,
    contact: contactPrior,
    power: powerPrior,
    rbiClutch: rbiClutchPrior,
    overallBat: overallBatPrior,
    defense,
  };
}

/**
 * 1번~9번 각 타순별 전용 적합도 점수 (0..100 스케일)
 */
function scoreBatterForSlot(slotOrder: number, t: BatterTraitVector): number {
  switch (slotOrder) {
    case 1: // 1번 출루형 타자: 출루율, 주력, 선구안
      return t.obp * 0.44 + t.speed * 0.34 + t.eye * 0.22;
    case 2: // 2번 팀 내 우수 타자: 출루율, 장타력, 컨택
      return t.obp * 0.34 + t.power * 0.32 + t.contact * 0.34 + t.overallBat * 0.08;
    case 3: // 3번 중심 타선: 종합 타격 능력
      return t.overallBat * 0.58 + t.contact * 0.22 + t.power * 0.2 + t.obp * 0.08;
    case 4: // 4번 장타형 타자: 장타율, 홈런, 타점 생산력
      return t.power * 0.52 + t.rbiClutch * 0.36 + t.overallBat * 0.16;
    case 5: // 5번 중심 타선 보조: 장타력, 득점권 생산력
      return t.power * 0.42 + t.rbiClutch * 0.46 + t.overallBat * 0.12;
    case 6: // 6번 중장거리 타자: 컨택, 장타력
      return t.contact * 0.46 + t.power * 0.44 + t.overallBat * 0.1;
    case 7: // 7번 하위 타선: 타격 능력, 수비 기여
      return t.overallBat * 0.52 + t.defense * 0.48;
    case 8: // 8번 수비형 타자: 수비력, 출루 능력
      return t.defense * 0.62 + t.obp * 0.38;
    case 9: // 9번 연결형 타자: 컨택, 출루율, 주력
      return t.contact * 0.34 + t.obp * 0.34 + t.speed * 0.32;
    default:
      return t.overallBat;
  }
}

/**
 * 타순별 배치 사유 요약 문자열
 */
function buildSlotReason(slotOrder: number, t: BatterTraitVector): string {
  switch (slotOrder) {
    case 1:
      return `출루 ${Math.round(t.obp)} · 주력 ${Math.round(t.speed)} · 선구안 ${Math.round(t.eye)}`;
    case 2:
      return `출루 ${Math.round(t.obp)} · 장타 ${Math.round(t.power)} · 컨택 ${Math.round(t.contact)}`;
    case 3:
      return `종합타격 ${Math.round(t.overallBat)} · 컨택 ${Math.round(t.contact)} · 장타 ${Math.round(t.power)}`;
    case 4:
      return `장타 ${Math.round(t.power)} · 타점/득점권 ${Math.round(t.rbiClutch)}`;
    case 5:
      return `장타 ${Math.round(t.power)} · 득점권 생산 ${Math.round(t.rbiClutch)}`;
    case 6:
      return `컨택 ${Math.round(t.contact)} · 중장거리 장타 ${Math.round(t.power)}`;
    case 7:
      return `타격 ${Math.round(t.overallBat)} · 수비기여 ${Math.round(t.defense)}`;
    case 8:
      return `수비력 ${Math.round(t.defense)} · 출루능력 ${Math.round(t.obp)}`;
    case 9:
      return `컨택 ${Math.round(t.contact)} · 출루 ${Math.round(t.obp)} · 주력 ${Math.round(t.speed)}`;
    default:
      return `종합 ${Math.round(t.overallBat)}`;
  }
}

/**
 * 1) 중복 포지션 불가(C,1B,2B,3B,SS,LF,CF,RF 각 1명 + DH 1명)로 최적 선발 9명을 선정하고
 * 2) 1~9번 슬롯별 가중치 행렬에 대해 비트마스크 DP로 전역 최적 타순을 산출합니다.
 */
export function optimizeBattingLineup(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): LineupOptimizationResult {
  const pool = Object.values(career.players)
    .filter((p) => isHitterAvailableForLineup(career, p, teamId))
    .sort((a, b) => {
      const sA = a.ability + a.form * 2.1 - Math.max(0, a.fatigue - 58) * 0.14;
      const sB = b.ability + b.form * 2.1 - Math.max(0, b.fatigue - 58) * 0.14;
      return sB - sA;
    });

  // Step 1: Multi-position optimal 9-man selection (8 unique fielding positions + 1 DH)
  // 주 포지션 + 보조 포지션(숙련도 0~100)을 함께 평가해 상위 타자가 벤치에 밀리지 않도록 최적 수비 배치
  const starters: { player: Player; assignedPos: Position }[] = [];
  const topCandidates = pool.slice(0, Math.min(13, pool.length));
  const allSlots: Position[] = [...UNIQUE_FIELD_POSITIONS, 'DH'];

  const scorePlayerAtFieldSlot = (p: Player, slot: Position): number => {
    const batVal = p.ability + p.form * 2.1 - Math.max(0, p.fatigue - 58) * 0.14;
    if (slot === 'DH') {
      // 지명타자는 순수 타격력 위주 (수비 가치가 낮은 거포 우선)
      const defWeight = p.position === 'DH' || p.position === '1B' || p.position === 'LF' ? 2.5 : 0;
      return batVal * 1.05 + defWeight;
    }
    const prof = getPositionProficiency(p, slot);
    const eff = computeEffectiveFieldingAtPosition(p, slot);
    // 포수 자리는 숙련도 45 미만 강력 억제
    if (slot === 'C' && prof < 45) return -180 + batVal * 0.2;
    const primaryBonus = p.position === slot ? 6.5 : 0;
    const secondaryBonus = p.position !== slot && prof >= 60 ? 2.0 : 0;
    const unfamiliarPenalty = prof < 60 ? (60 - prof) * 0.85 : 0;
    return batVal * 1.0 + eff.effectiveFielding * 0.22 + primaryBonus + secondaryBonus - eff.penalty * 0.9 - unfamiliarPenalty;
  };

  if (topCandidates.length >= 9) {
    // 각 수비 슬롯별 상위 후보 4명만 분기 탐색하여 빠르고 정확한 전역 최적 배치 산출
    const slotChoices: { idx: number; score: number }[][] = allSlots.map((slot) =>
      topCandidates
        .map((p, idx) => ({ idx, score: scorePlayerAtFieldSlot(p, slot) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(4, topCandidates.length))
    );

    let bestTotal = -1e12;
    let bestAssign: number[] | null = null;
    const curAssign = new Array<number>(9).fill(-1);
    const usedCand = new Array<boolean>(topCandidates.length).fill(false);

    // 남은 슬롯 최대 가능 점수(상한 가지치기)
    const suffixMax = new Array<number>(10).fill(0);
    for (let s = 8; s >= 0; s--) {
      suffixMax[s] = suffixMax[s + 1] + (slotChoices[s][0]?.score ?? 0);
    }

    const dfs = (slotIdx: number, accScore: number) => {
      if (slotIdx === 9) {
        if (accScore > bestTotal) {
          bestTotal = accScore;
          bestAssign = [...curAssign];
        }
        return;
      }
      if (accScore + suffixMax[slotIdx] <= bestTotal) return;
      for (const ch of slotChoices[slotIdx]) {
        if (usedCand[ch.idx]) continue;
        usedCand[ch.idx] = true;
        curAssign[slotIdx] = ch.idx;
        dfs(slotIdx + 1, accScore + ch.score);
        usedCand[ch.idx] = false;
      }
    };
    dfs(0, 0);

    if (bestAssign) {
      for (let s = 0; s < 9; s++) {
        starters.push({
          player: topCandidates[bestAssign[s]],
          assignedPos: allSlots[s],
        });
      }
    }
  }

  // Fallback if fewer than 9 candidates or backtracking didn't complete
  if (starters.length < 9) {
    starters.length = 0;
    const usedIds = new Set<string>();
    const usedPositions = new Set<Position>();

    for (const fieldPos of UNIQUE_FIELD_POSITIONS) {
      const bestAtPos = pool
        .filter((p) => !usedIds.has(p.id))
        .sort((a, b) => scorePlayerAtFieldSlot(b, fieldPos) - scorePlayerAtFieldSlot(a, fieldPos))[0];
      if (bestAtPos && getPositionProficiency(bestAtPos, fieldPos) >= (fieldPos === 'C' ? 45 : 35)) {
        starters.push({ player: bestAtPos, assignedPos: fieldPos });
        usedIds.add(bestAtPos.id);
        usedPositions.add(fieldPos);
      }
    }

    const bestDh = pool.find((p) => !usedIds.has(p.id));
    if (bestDh && starters.length < 9) {
      starters.push({ player: bestDh, assignedPos: 'DH' });
      usedIds.add(bestDh.id);
      usedPositions.add('DH');
    }

    for (const p of pool) {
      if (starters.length >= 9) break;
      if (usedIds.has(p.id)) continue;
      const openPos = UNIQUE_FIELD_POSITIONS.find((pos) => !usedPositions.has(pos));
      const chosenPos: Position =
        !usedPositions.has(p.position) && p.position !== 'SP' && p.position !== 'RP' && p.position !== 'CL'
          ? p.position
          : openPos ?? (!usedPositions.has('DH') ? 'DH' : UNIQUE_FIELD_POSITIONS[starters.length % UNIQUE_FIELD_POSITIONS.length]);
      starters.push({ player: p, assignedPos: chosenPos });
      usedIds.add(p.id);
      usedPositions.add(chosenPos);
    }
  }

  const n = starters.length;
  const traitsList = starters.map((s) => buildBatterTraits(s.player, s.assignedPos));

  // Emphasize upper/core batting slots (1~5번 receive higher plate appearances across a season)
  const slotImportanceWeight = [1.22, 1.24, 1.28, 1.28, 1.18, 1.04, 0.94, 0.88, 0.94];

  // Step 2: Exact Bitmask DP for optimal 1-to-1 assignment of n starters to slots 1..n
  const maskCount = 1 << n;
  const dp = new Float64Array(maskCount).fill(-1e12);
  const parentPlayer = new Int8Array(maskCount).fill(-1);
  dp[0] = 0;

  for (let mask = 0; mask < maskCount; mask++) {
    if (dp[mask] <= -1e11) continue;
    // Count set bits = current slot index (0..n-1)
    let slotIdx = 0;
    let tmp = mask;
    while (tmp > 0) {
      slotIdx += tmp & 1;
      tmp >>= 1;
    }
    if (slotIdx >= n) continue;

    const slotOrder = slotIdx + 1;
    const w = slotImportanceWeight[slotIdx] ?? 1.0;

    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) continue;
      const nextMask = mask | (1 << i);
      const val = dp[mask] + scoreBatterForSlot(slotOrder, traitsList[i]) * w;
      if (val > dp[nextMask]) {
        dp[nextMask] = val;
        parentPlayer[nextMask] = i;
      }
    }
  }

  // Reconstruct optimal assignment
  const assignedIndices: number[] = new Array(n).fill(0);
  let curMask = maskCount - 1;
  for (let slotIdx = n - 1; slotIdx >= 0; slotIdx--) {
    const pIdx = parentPlayer[curMask];
    assignedIndices[slotIdx] = pIdx >= 0 ? pIdx : slotIdx;
    curMask ^= 1 << assignedIndices[slotIdx];
  }

  const lineupPositions: Record<string, Position> = {};
  const slots: OptimizedLineupSlot[] = assignedIndices.map((pIdx, slotIdx) => {
    const starter = starters[pIdx];
    const traits = traitsList[pIdx];
    const spec = BATTING_SLOT_SPECS[slotIdx] ?? {
      order: slotIdx + 1,
      roleTitle: '선발 타자',
      keyFactors: '종합 타격',
    };
    lineupPositions[starter.player.id] = starter.assignedPos;
    const rawScore = scoreBatterForSlot(spec.order, traits);
    return {
      order: spec.order,
      roleTitle: spec.roleTitle,
      keyFactors: spec.keyFactors,
      playerId: starter.player.id,
      playerName: starter.player.name,
      naturalPosition: starter.player.position,
      assignedPosition: starter.assignedPos,
      ability: starter.player.ability,
      form: starter.player.form,
      slotScore: Math.round(rawScore * 10) / 10,
      reason: buildSlotReason(spec.order, traits),
    };
  });

  const lineupOrder = slots.map((s) => s.playerId);
  const s1 = slots[0];
  const s3 = slots[2];
  const s4 = slots[3];
  const s9 = slots[8];
  const summary = `${KBO_TEAMS[teamId].shortName} 최적 타순(포지션 중복 없음): 1번 ${s1?.playerName ?? '-'} · 3번 ${s3?.playerName ?? '-'} · 4번 ${s4?.playerName ?? '-'}${s9 ? ` · 9번 연결 ${s9.playerName}` : ''}`;

  return {
    teamId,
    slots,
    lineupOrder,
    lineupPositions,
    summary,
  };
}

export function applyOptimizedBattingLineup(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): { nextCareer: CareerSave; backupSnapshot: CareerSave; result: LineupOptimizationResult } {
  const backupSnapshot: CareerSave = JSON.parse(JSON.stringify(career));
  const next: CareerSave = JSON.parse(JSON.stringify(career));
  const result = optimizeBattingLineup(next, teamId);

  if (result.lineupOrder.length === 0) {
    throw new Error('선발 출전 가능한 1군 야수가 부족하여 타순을 최적화할 수 없습니다.');
  }

  const tState = next.teams[teamId];
  tState.lineupOrder = [...result.lineupOrder];
  tState.lineupPositions = { ...result.lineupPositions };

  for (const pid of result.lineupOrder) {
    if (next.players[pid]) {
      next.players[pid].gameDayActive = true;
    }
  }

  const allFirstHitters = Object.values(next.players)
    .filter((p) => p.teamId === teamId && p.role === '타자' && p.rosterTier === '1군')
    .map((p) => p.id);
  tState.benchOrder = allFirstHitters.filter((id) => !result.lineupOrder.includes(id));

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, result };
}
