import { CareerSave, Player, Position, TeamId } from '../types/kbo';
import { getFacilityEffectivenessMult } from './deepFranchise';

export const ALL_FIELD_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const ALL_HITTER_LINEUP_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

const POSITION_DIFFICULTY_PENALTY_SCALE: Record<Position, number> = {
  C: 1.45,
  SS: 1.25,
  CF: 1.15,
  '2B': 1.1,
  '3B': 1.05,
  RF: 0.95,
  LF: 0.9,
  '1B': 0.85,
  DH: 0,
  SP: 1,
  RP: 1,
  CL: 1,
};

const NATURAL_ADJACENCY: Partial<Record<Position, Partial<Record<Position, number>>>> = {
  SS: { '2B': 54, '3B': 48, LF: 34 },
  '2B': { SS: 50, '3B': 46, LF: 34 },
  '3B': { '1B': 52, '2B': 42, SS: 38, LF: 36 },
  '1B': { '3B': 38, LF: 34, RF: 32 },
  CF: { LF: 62, RF: 60 },
  LF: { RF: 56, CF: 44, '1B': 38 },
  RF: { LF: 56, CF: 44, '1B': 36 },
  C: { '1B': 42 },
  DH: { '1B': 46, LF: 38, RF: 36 },
};

/**
 * 타자의 포지션별 수비 숙련도(0~100) 맵을 안전하게 초기화·보정합니다.
 */
export function ensurePlayerPositionProficiencyInPlace(p: Player): Partial<Record<Position, number>> | undefined {
  if (p.role !== '타자') return undefined;

  const baseFielding = p.v18Ratings?.batting?.fielding ?? p.ability ?? 60;
  const primaryDefault = clamp(78 + (baseFielding - 55) * 0.25 + (p.ability - 60) * 0.14, 76, 97);

  if (!p.positionProficiency) {
    p.positionProficiency = {};
  }
  const map = p.positionProficiency;

  const defaults: Record<Position, number> = {
    C: 8,
    '1B': 28,
    '2B': 22,
    '3B': 24,
    SS: 16,
    LF: 30,
    CF: 22,
    RF: 28,
    DH: 88,
    SP: 0,
    RP: 0,
    CL: 0,
  };
  const adj = NATURAL_ADJACENCY[p.position] ?? {};

  for (const pos of ALL_HITTER_LINEUP_POSITIONS) {
    const existing = map[pos];
    if (typeof existing === 'number' && Number.isFinite(existing)) {
      map[pos] = clamp(existing, 0, 100);
    } else {
      map[pos] = Math.max(defaults[pos], adj[pos] ?? 0);
    }
  }

  // 주 포지션은 최소 76 이상 보장
  map[p.position] = clamp(Math.max(map[p.position] ?? primaryDefault, primaryDefault), 76, 100);
  // 지명타자는 타자 전원 높은 적응도 유지
  map.DH = clamp(Math.max(map.DH ?? 88, 84), 80, 98);

  // 보조 포지션은 최소 60 이상 보장
  if (p.secondaryPositions && p.secondaryPositions.length > 0) {
    const cleanedSec: Position[] = [];
    for (let i = 0; i < p.secondaryPositions.length; i++) {
      const sp = p.secondaryPositions[i];
      if (!sp || sp === p.position || sp === 'DH' || !ALL_FIELD_POSITIONS.includes(sp)) continue;
      if (!cleanedSec.includes(sp)) cleanedSec.push(sp);
      const minSec = clamp(primaryDefault - 14 - i * 4, 60, 82);
      map[sp] = clamp(Math.max(map[sp] ?? minSec, minSec), 60, 96);
    }
    p.secondaryPositions = cleanedSec;
  }

  return map;
}

/**
 * 특정 포지션의 현재 수비 숙련도(0~100) 조회
 */
export function getPositionProficiency(p: Player, pos: Position): number {
  if (p.role !== '타자') {
    return p.position === pos ? 90 : 0;
  }
  if (pos === 'DH') {
    return clamp(p.positionProficiency?.DH ?? 88, 80, 100);
  }
  if (p.positionProficiency && typeof p.positionProficiency[pos] === 'number') {
    return clamp(p.positionProficiency[pos]!, 0, 100);
  }
  if (p.position === pos) return 86;
  if (p.secondaryPositions?.includes(pos)) return 72;
  const adj = NATURAL_ADJACENCY[p.position]?.[pos];
  if (adj !== undefined) return adj;
  return pos === 'C' ? 8 : 24;
}

/**
 * 선수의 주요 보조 포지션 목록 (숙련도 60 이상, 높은 순 정렬)
 */
export function getMajorSecondaryPositions(p: Player, maxCount = 2): Position[] {
  if (p.role !== '타자') return [];
  const candidates = new Set<Position>();
  for (const sp of p.secondaryPositions ?? []) {
    if (sp !== p.position && ALL_FIELD_POSITIONS.includes(sp)) {
      candidates.add(sp);
    }
  }
  if (p.positionProficiency) {
    for (const pos of ALL_FIELD_POSITIONS) {
      if (pos !== p.position && (p.positionProficiency[pos] ?? 0) >= 60) {
        candidates.add(pos);
      }
    }
  }
  return Array.from(candidates)
    .map((pos) => ({ pos, prof: getPositionProficiency(p, pos) }))
    .filter((x) => x.prof >= 60)
    .sort((a, b) => b.prof - a.prof)
    .slice(0, maxCount)
    .map((x) => x.pos);
}

/**
 * 선수 목록용 간결한 포지션 표시 문자열 (주 포지션 + 주요 보조 포지션 최대 2개)
 * 예: '3B (1B)', 'SS (2B·3B)', 'CF (LF·RF)', 'SP'
 */
export function formatCompactPlayerPosition(p: Player, maxSecondary = 2): string {
  if (p.role !== '타자') return p.position;
  const majors = getMajorSecondaryPositions(p, maxSecondary);
  if (majors.length === 0) return p.position;
  return `${p.position} (${majors.join('·')})`;
}

/**
 * 특정 포지션 출전 시 수비 능력 페널티 및 실책 배율 계산
 * - 숙련도 80+: 주전급 (페널티 0)
 * - 숙련도 65~79: 보조 적합 (-2 ~ -6)
 * - 숙련도 45~64: 적응 중 (-7 ~ -15)
 * - 숙련도 0~44: 미숙/비상 투입 (-16 ~ -34, 포수·유격수 가중 페널티)
 */
export function computeEffectiveFieldingAtPosition(
  p: Player,
  pos: Position
): {
  baseFielding: number;
  proficiency: number;
  penalty: number;
  effectiveFielding: number;
  errorRateMult: number;
  tierLabel: '주전급' | '보조적합' | '적응중' | '미숙(페널티)' | '지명타자';
} {
  const baseFielding = clamp(
    (p.v18Ratings?.batting?.fielding ?? p.ability ?? 64) + (p.trainingFocus === '수비' ? 2 : 0),
    25,
    99
  );
  if (pos === 'DH') {
    return {
      baseFielding,
      proficiency: getPositionProficiency(p, 'DH'),
      penalty: 0,
      effectiveFielding: baseFielding,
      errorRateMult: 1.0,
      tierLabel: '지명타자',
    };
  }

  const prof = getPositionProficiency(p, pos);
  const diffScale = POSITION_DIFFICULTY_PENALTY_SCALE[pos] ?? 1.0;

  let rawPenalty = 0;
  let errorRateMult = 1.0;
  let tierLabel: '주전급' | '보조적합' | '적응중' | '미숙(페널티)' = '주전급';

  if (prof >= 80) {
    rawPenalty = 0;
    errorRateMult = 1.0;
    tierLabel = '주전급';
  } else if (prof >= 65) {
    rawPenalty = (80 - prof) * 0.34 * diffScale;
    errorRateMult = 1.0 + (80 - prof) * 0.012 * diffScale;
    tierLabel = '보조적합';
  } else if (prof >= 45) {
    rawPenalty = (5.2 + (65 - prof) * 0.48) * diffScale;
    errorRateMult = 1.18 + (65 - prof) * 0.018 * diffScale;
    tierLabel = '적응중';
  } else {
    rawPenalty = (15.0 + (45 - prof) * 0.52) * diffScale;
    errorRateMult = 1.55 + (45 - prof) * 0.026 * diffScale;
    tierLabel = '미숙(페널티)';
  }

  const penalty = Math.round(rawPenalty * 10) / 10;
  const effectiveFielding = clamp(baseFielding - penalty, 18, 99);

  return {
    baseFielding,
    proficiency: prof,
    penalty,
    effectiveFielding,
    errorRateMult: Number(Math.min(2.8, errorRateMult).toFixed(2)),
    tierLabel,
  };
}

/**
 * 포지션 출전 가능 여부 및 등급 평가 (주 포지션 + 보조 포지션 + 비상 투입 허용, 미숙 시 경고 제공)
 */
export function evaluatePositionAssignment(
  p: Player,
  targetPos: Position
): {
  allowed: boolean;
  isPrimary: boolean;
  isSecondary: boolean;
  isUnfamiliar: boolean;
  proficiency: number;
  penalty: number;
  warning?: string;
} {
  if (p.role !== '타자') {
    return {
      allowed: false,
      isPrimary: false,
      isSecondary: false,
      isUnfamiliar: true,
      proficiency: 0,
      penalty: 40,
      warning: '투수는 야수 라인업 포지션에 배치할 수 없습니다.',
    };
  }
  const eff = computeEffectiveFieldingAtPosition(p, targetPos);
  const isPrimary = p.position === targetPos || targetPos === 'DH';
  const isSecondary = !isPrimary && (p.secondaryPositions?.includes(targetPos) || eff.proficiency >= 60);
  const isUnfamiliar = !isPrimary && !isSecondary;
  const warning = isUnfamiliar
    ? `${p.name} 선수의 ${targetPos} 숙련도(${eff.proficiency})가 낮아 수비력 -${Math.round(eff.penalty)} 페널티 및 실책 위험(x${eff.errorRateMult})이 적용됩니다.`
    : undefined;
  return {
    allowed: true,
    isPrimary,
    isSecondary,
    isUnfamiliar,
    proficiency: eff.proficiency,
    penalty: eff.penalty,
    warning,
  };
}

/**
 * 경기 출전 후 반복 출전에 따른 포지션 수비 숙련도 자동 상승
 * - 비주전/보조/신규 포지션 출전 시 경기 누적에 따라 숙련도 점진 상승
 * - 숙련도 60 도달 시 자동으로 보조 포지션(secondaryPositions) 획득
 */
export function recordPositionAppearanceAndGrowProficiencyInPlace(
  p: Player,
  playedPos: Position,
  isStarter: boolean
): { gained: number; unlockedSecondary: boolean; newProficiency: number } {
  if (p.role !== '타자' || !ALL_FIELD_POSITIONS.includes(playedPos)) {
    return { gained: 0, unlockedSecondary: false, newProficiency: getPositionProficiency(p, playedPos) };
  }

  const map = ensurePlayerPositionProficiencyInPlace(p)!;
  if (!p.positionGamesPlayed) p.positionGamesPlayed = {};
  p.positionGamesPlayed[playedPos] = (p.positionGamesPlayed[playedPos] ?? 0) + 1;

  const current = map[playedPos] ?? getPositionProficiency(p, playedPos);
  const ageFactor = p.age <= 23 ? 1.35 : p.age <= 27 ? 1.15 : p.age <= 31 ? 0.95 : 0.65;
  const maxCap =
    playedPos === p.position
      ? 99
      : playedPos === 'C' && p.position !== 'C'
        ? 78
        : p.age <= 27
          ? 88
          : 82;

  if (current >= maxCap) {
    return { gained: 0, unlockedSecondary: false, newProficiency: current };
  }

  // 주 포지션은 매우 완만하게, 비주전·훈련 대상 포지션은 반복 출전으로 뚜렷하게 상승
  const gamesAtPos = p.positionGamesPlayed[playedPos] ?? 1;
  let gain = 0;
  if (playedPos === p.position) {
    if (isStarter && gamesAtPos % 15 === 0 && current < 96) {
      gain = 1;
    }
  } else {
    const isTarget = p.positionTrainingTarget === playedPos;
    const defFocus = p.trainingFocus === '수비';
    const baseStep = isStarter ? 1.15 : 0.55;
    const targetBonus = isTarget ? 0.85 : 0;
    const focusBonus = defFocus ? 0.35 : 0;
    const expected = (baseStep + targetBonus + focusBonus) * ageFactor;
    // 결정론적 누적 방식: 경기 수 모듈로 부드럽게 정수 +1/+2 반영
    if (expected >= 1.65) {
      gain = gamesAtPos % 2 === 0 ? 2 : 1;
    } else if (expected >= 0.95) {
      gain = 1;
    } else if (gamesAtPos % 2 === 0) {
      gain = 1;
    }
  }

  if (gain <= 0) {
    return { gained: 0, unlockedSecondary: false, newProficiency: current };
  }

  const nextProf = clamp(Math.min(maxCap, current + gain), 0, 100);
  map[playedPos] = nextProf;

  let unlockedSecondary = false;
  if (playedPos !== p.position && nextProf >= 60) {
    if (!p.secondaryPositions) p.secondaryPositions = [];
    if (!p.secondaryPositions.includes(playedPos)) {
      p.secondaryPositions.push(playedPos);
      unlockedSecondary = true;
    }
  }

  return { gained: nextProf - current, unlockedSecondary, newProficiency: nextProf };
}

/**
 * 신규 포지션 집중 훈련(positionTrainingTarget) 주기적 숙련도 성장 처리
 * - 1군·2군·육성 타자 모두 적용 (10~15경기 주기 평가 시 호출)
 */
export function applyPositionTrainingProgressInPlace(
  career: CareerSave,
  teamId: TeamId
): { playerId: string; playerName: string; targetPos: Position; prev: number; next: number; unlocked: boolean }[] {
  const results: {
    playerId: string;
    playerName: string;
    targetPos: Position;
    prev: number;
    next: number;
    unlocked: boolean;
  }[] = [];

  const staff = career.coaches[teamId] ?? [];
  const defCoach = staff.find((c) => c.role === '수비코치');
  const defCoachBonus = defCoach ? Math.max(0, ((defCoach.ability ?? 75) - 70) * 0.06) : 0;
  const academyMult =
    teamId === career.playerTeamId
      ? getFacilityEffectivenessMult(career.finances.facilityCondition?.academy)
      : 1.0;

  for (const p of Object.values(career.players)) {
    if (p.teamId !== teamId || p.role !== '타자') continue;
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적' || p.rosterTier === 'FA') continue;
    if (p.injury) continue;

    const targetPos = p.positionTrainingTarget;
    if (!targetPos || targetPos === p.position || !ALL_FIELD_POSITIONS.includes(targetPos)) continue;

    const map = ensurePlayerPositionProficiencyInPlace(p)!;
    const prev = map[targetPos] ?? getPositionProficiency(p, targetPos);
    const maxCap = targetPos === 'C' ? 80 : p.age <= 26 ? 90 : 84;
    if (prev >= maxCap) continue;

    const ageMult = p.age <= 23 ? 1.35 : p.age <= 27 ? 1.15 : p.age <= 31 ? 0.95 : 0.7;
    const focusBoost = p.trainingFocus === '수비' ? 1.25 : 1.0;
    const rawGain = (2.6 + defCoachBonus) * ageMult * focusBoost * (0.9 + academyMult * 0.15);
    const gain = Math.max(1, Math.min(6, Math.round(rawGain)));
    const next = clamp(Math.min(maxCap, prev + gain), 0, 100);
    map[targetPos] = next;

    let unlocked = false;
    if (next >= 60) {
      if (!p.secondaryPositions) p.secondaryPositions = [];
      if (!p.secondaryPositions.includes(targetPos)) {
        p.secondaryPositions.push(targetPos);
        unlocked = true;
      }
    }

    if (next > prev) {
      results.push({
        playerId: p.id,
        playerName: p.name,
        targetPos,
        prev,
        next,
        unlocked,
      });
    }
  }

  return results;
}
