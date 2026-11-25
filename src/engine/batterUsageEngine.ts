import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  BatterStats,
  BoxscoreBatterLine,
  CareerSave,
  Player,
  Position,
  TeamId,
} from '../types/kbo';
import { canPlayerAppearInFirstTeam } from './developmentalEngine';
import { buildBattingProfile, buildPitchRepertoire } from './deepFranchise';
import { SeededRng } from './rng';
import { calcAVG, calcOPS } from './stats';

export type BatterSubRole = '대타' | '대주자' | '대수비' | '부상교체';

export interface GameStarterSlot {
  player: Player;
  position: Position;
  battingOrder: number; // 1..9
  restedRegularId?: string;
  rotationReason?: string;
}

export interface GameBatterPlan {
  starters: GameStarterSlot[];
  bench: Player[];
  rotationNotes: string[];
}

export interface ManagerBatterProfile {
  pinchHitAggression: number; // 0.7..1.35
  pinchRunAggression: number; // 0.7..1.45
  defensiveSubAggression: number; // 0.7..1.35
  blowoutYouthAggression: number; // 0.8..1.4
  starterRestThreshold: number; // fatigue threshold ~44..56
}

const INFIELD_POSITIONS: Position[] = ['1B', '2B', '3B', 'SS'];
const OUTFIELD_POSITIONS: Position[] = ['LF', 'CF', 'RF'];
const FAST_POSITIONS = new Set<Position>(['CF', 'SS', '2B', 'LF', 'RF']);
const DEFENSIVE_KEY_POSITIONS = new Set<Position>(['C', 'SS', 'CF', '2B', '3B']);

/**
 * 타자가 소화 가능한 수비 포지션 목록 (주 포지션 + 자연스러운 겸업/유틸리티 포지션)
 */
export function getBatterEligiblePositions(p: Player): Position[] {
  const set = new Set<Position>();
  set.add(p.position);
  if (p.secondaryPositions) {
    for (const sp of p.secondaryPositions) set.add(sp);
  }

  switch (p.position) {
    case 'SS':
      set.add('2B');
      set.add('3B');
      set.add('DH');
      break;
    case '2B':
      set.add('SS');
      set.add('3B');
      set.add('LF');
      set.add('DH');
      break;
    case '3B':
      set.add('1B');
      set.add('2B');
      set.add('LF');
      set.add('DH');
      break;
    case '1B':
      set.add('DH');
      set.add('3B');
      set.add('LF');
      break;
    case 'CF':
      set.add('LF');
      set.add('RF');
      set.add('DH');
      break;
    case 'LF':
      set.add('RF');
      set.add('CF');
      set.add('1B');
      set.add('DH');
      break;
    case 'RF':
      set.add('LF');
      set.add('CF');
      set.add('1B');
      set.add('DH');
      break;
    case 'C':
      set.add('DH');
      set.add('1B');
      break;
    case 'DH':
      set.add('1B');
      set.add('LF');
      set.add('RF');
      break;
    default:
      set.add('DH');
      break;
  }

  return Array.from(set);
}

/**
 * 유틸리티 야수 판별 (멀티 내야/외야 겸업 능력)
 */
export function isUtilityPlayer(p: Player): boolean {
  if (p.role !== '타자') return false;
  if ((p.secondaryPositions?.length ?? 0) >= 2) return true;
  return p.position === '2B' || p.position === 'SS' || p.position === '3B' || p.position === 'CF' || p.position === 'LF' || p.position === 'RF';
}

/**
 * 수비 포지션 호환성 점수 (주 포지션 > 자연 보조 포지션 > DH > 비상 투입)
 */
export function getPositionFitScore(p: Player, targetPos: Position): number {
  if (p.position === targetPos) return 10;
  if (targetPos === 'DH') return 8;
  if (targetPos === 'C') {
    // Only true catchers should catch unless absolute emergency
    return p.secondaryPositions?.includes('C') ? 7 : -25;
  }
  if (p.secondaryPositions?.includes(targetPos)) return 8;
  if (INFIELD_POSITIONS.includes(p.position) && INFIELD_POSITIONS.includes(targetPos)) {
    if ((p.position === 'SS' && targetPos === '2B') || (p.position === '2B' && targetPos === 'SS')) return 7;
    if ((p.position === '3B' && targetPos === '1B') || (p.position === '3B' && targetPos === '2B')) return 6;
    if (p.position === '2B' && targetPos === '3B') return 6;
    return 4;
  }
  if (OUTFIELD_POSITIONS.includes(p.position) && OUTFIELD_POSITIONS.includes(targetPos)) {
    if (p.position === 'CF') return 8;
    if (targetPos === 'CF') return p.age <= 29 ? 5 : 2;
    return 7;
  }
  if (p.position === 'DH' && (targetPos === '1B' || targetPos === 'LF' || targetPos === 'RF')) return 4;
  if ((p.position === '1B' || p.position === '3B') && (targetPos === 'LF' || targetPos === 'RF')) return 3;
  return -6;
}

/**
 * 주루 스피드 점수 (대주자 선발 기준)
 */
export function getRunnerSpeedScore(p: Player): number {
  let score = 50;
  if (FAST_POSITIONS.has(p.position)) score += 18;
  if (p.position === 'CF' || p.position === 'SS' || p.position === '2B') score += 8;
  if (p.position === 'C' || p.position === '1B' || p.position === 'DH') score -= 20;
  if (p.age <= 24) score += 12;
  else if (p.age <= 28) score += 6;
  else if (p.age >= 33) score -= 12;
  else if (p.age >= 36) score -= 22;
  if (p.trainingFocus === '주루') score += 14;
  const st = p.stats as BatterStats;
  if ((st.SB ?? 0) >= 8) score += 10;
  else if ((st.SB ?? 0) >= 3) score += 5;
  score -= Math.round(p.fatigue * 0.2);
  return Math.max(10, Math.min(100, score));
}

/**
 * 수비력 점수 (대수비 투입 기준)
 */
export function getDefenseValueScore(p: Player, targetPos: Position): number {
  let score = getPositionFitScore(p, targetPos) * 5 + 45;
  if (p.trainingFocus === '수비') score += 12;
  if (p.age <= 29) score += 5;
  else if (p.age >= 35) score -= 8;
  if (p.ability >= 72) score += 4;
  score -= Math.round(p.fatigue * 0.18);
  return score;
}

/**
 * 상대 투수 좌/우 유형 + 타자 플래툰 스플릿 + 상대 전적(컨디션/매치업) 종합 점수
 */
export function getPlatoonAndMatchupScore(
  batter: Player,
  oppPitcher: Player,
  perfDelta: number
): number {
  const rep = oppPitcher.pitchRepertoire ?? buildPitchRepertoire(oppPitcher);
  const bp = batter.battingProfile ?? buildBattingProfile(batter);
  const isLeftyPit = rep.throws === '좌투';
  const isSideOrUnder = rep.throws === '우언' || rep.throws === '우사';

  let platoonEdge = isLeftyPit ? bp.vsLeftEdge : bp.vsRightEdge;
  if (isLeftyPit) {
    if (bp.bats === '우타') platoonEdge += 2.2;
    else if (bp.bats === '양타') platoonEdge += 1.6;
    else platoonEdge -= 1.8;
  } else {
    if (bp.bats === '좌타') platoonEdge += isSideOrUnder ? 3.2 : 2.0;
    else if (bp.bats === '양타') platoonEdge += 1.4;
    else platoonEdge -= isSideOrUnder ? 1.5 : 0.6;
  }

  return platoonEdge + perfDelta * 0.55;
}

/**
 * 구단 감독 성향별 야수 로테이션·대타·대주자·대수비 운영 프로필
 */
export function getManagerBatterRotationProfile(
  career: CareerSave,
  teamId: TeamId
): ManagerBatterProfile {
  const staff = career.coaches[teamId] ?? [];
  const manager = staff.find((c) => c.role === '감독');
  const style = manager?.tacticalStyle ?? '밸런스';
  const lineupMgmt = manager?.subRatings?.lineupMgmt ?? manager?.ability ?? 75;
  const mgmtScale = 0.92 + Math.max(-10, Math.min(12, lineupMgmt - 75)) * 0.012;

  if (style === '스몰볼·기동력') {
    return {
      pinchHitAggression: 1.05 * mgmtScale,
      pinchRunAggression: 1.42 * mgmtScale,
      defensiveSubAggression: 1.28 * mgmtScale,
      blowoutYouthAggression: 1.05,
      starterRestThreshold: 47,
    };
  }
  if (style === '육성·데이터') {
    return {
      pinchHitAggression: 1.28 * mgmtScale,
      pinchRunAggression: 1.08 * mgmtScale,
      defensiveSubAggression: 1.12 * mgmtScale,
      blowoutYouthAggression: 1.38,
      starterRestThreshold: 44,
    };
  }
  if (style === '빅볼·공격야구') {
    return {
      pinchHitAggression: 1.12 * mgmtScale,
      pinchRunAggression: 0.85 * mgmtScale,
      defensiveSubAggression: 0.88 * mgmtScale,
      blowoutYouthAggression: 0.96,
      starterRestThreshold: 53,
    };
  }
  if (style === '투수전·불펜운용') {
    return {
      pinchHitAggression: 0.98 * mgmtScale,
      pinchRunAggression: 1.14 * mgmtScale,
      defensiveSubAggression: 1.34 * mgmtScale,
      blowoutYouthAggression: 1.04,
      starterRestThreshold: 48,
    };
  }
  return {
    pinchHitAggression: 1.08 * mgmtScale,
    pinchRunAggression: 1.1 * mgmtScale,
    defensiveSubAggression: 1.12 * mgmtScale,
    blowoutYouthAggression: 1.12,
    starterRestThreshold: 48,
  };
}

function isBatterEligibleForGame(
  career: CareerSave,
  p: Player,
  isPostseason: boolean,
  isOnNationalDuty: (p: Player) => boolean
): boolean {
  if (p.role !== '타자') return false;
  if (!canPlayerAppearInFirstTeam(p)) return false;
  if (p.injury) return false;
  if (isOnNationalDuty(p)) return false;
  if (isPostseason && p.postseasonIneligibleSeason === career.season) return false;
  return true;
}

/**
 * 경기 전 현실적인 선발 라인업 + 1군 벤치 구성 (사용자·AI 10개 구단 공통 적용)
 * - 주전 체력/피로도/연속출전/최근 부진에 따라 백업 포수 및 유틸리티 후보를 자연스럽게 선발 로테이션
 * - 상대 선발 좌/우 유형(플래툰) + 타자 상대 전적 반영
 * - 장기 미출전 1군 후보선수에게 적절한 선발/벤치 기회 부여
 */
export function buildRealisticGameLineupAndBench(
  career: CareerSave,
  teamId: TeamId,
  oppTeamId: TeamId,
  oppStarter: Player,
  round: number,
  options: {
    isPostseason: boolean;
    isDoubleheaderGame2?: boolean;
    isOnNationalDuty: (p: Player) => boolean;
    getPerfDelta: (p: Player) => number;
    rng: SeededRng;
  }
): GameBatterPlan {
  const { isPostseason, isDoubleheaderGame2 = false, isOnNationalDuty, getPerfDelta, rng } = options;
  const tState = career.teams[teamId];
  const profile = getManagerBatterRotationProfile(career, teamId);

  // For AI clubs (including loaded legacy saves that started with only 2 bench batters),
  // maintain a realistic KBO 28-man 1군 entry with 5+ bench batters without draining 2군 below 10
  if (!isPostseason && teamId !== career.playerTeamId) {
    const allFirst = Object.values(career.players).filter(
      (p) => p.teamId === teamId && p.rosterTier === '1군'
    );
    const allSecondCount = Object.values(career.players).filter(
      (p) => p.teamId === teamId && p.rosterTier === '2군'
    ).length;
    const healthyFirstBatters = allFirst.filter((p) =>
      isBatterEligibleForGame(career, p, false, isOnNationalDuty)
    );
    const spareMinors = Math.max(0, allSecondCount - 10);
    if (allFirst.length < 28 && healthyFirstBatters.length < 14 && spareMinors > 0) {
      const needCount = Math.min(28 - allFirst.length, 14 - healthyFirstBatters.length, spareMinors);
      const hasBackupC = healthyFirstBatters.filter((p) => p.position === 'C').length >= 2;
      const minorBatters = Object.values(career.players)
        .filter(
          (p) =>
            p.teamId === teamId &&
            p.rosterTier === '2군' &&
            p.category === '국내' &&
            isBatterEligibleForGame(career, p, false, isOnNationalDuty)
        )
        .sort((a, b) => {
          const cBoostA = !hasBackupC && a.position === 'C' ? 20 : 0;
          const cBoostB = !hasBackupC && b.position === 'C' ? 20 : 0;
          return b.ability + cBoostB - (a.ability + cBoostA);
        });
      for (const mb of minorBatters.slice(0, needCount)) {
        mb.rosterTier = '1군';
        mb.gameDayActive = true;
        if (!tState.benchOrder.includes(mb.id) && !tState.lineupOrder.includes(mb.id)) {
          tState.benchOrder.push(mb.id);
        }
      }
    }
  }

  const firstTeamHitters = Object.values(career.players).filter(
    (p) =>
      p.teamId === teamId &&
      p.rosterTier === '1군' &&
      isBatterEligibleForGame(career, p, isPostseason, isOnNationalDuty)
  );
  const activeFirstHitters = firstTeamHitters.filter((p) => p.gameDayActive);
  const pool = activeFirstHitters.length >= 9 ? activeFirstHitters : firstTeamHitters;

  // 1) Base 9-man lineup from team's configured lineupOrder
  const baseStarters: GameStarterSlot[] = [];
  const usedIds = new Set<string>();

  for (const pid of tState.lineupOrder) {
    const p = career.players[pid];
    if (
      p &&
      p.teamId === teamId &&
      p.rosterTier === '1군' &&
      isBatterEligibleForGame(career, p, isPostseason, isOnNationalDuty) &&
      !usedIds.has(p.id)
    ) {
      baseStarters.push({
        player: p,
        position: (tState.lineupPositions[p.id] ?? p.position) as Position,
        battingOrder: baseStarters.length + 1,
      });
      usedIds.add(p.id);
    }
  }

  for (const p of pool) {
    if (baseStarters.length >= 9) break;
    if (!usedIds.has(p.id)) {
      baseStarters.push({
        player: p,
        position: (tState.lineupPositions[p.id] ?? p.position) as Position,
        battingOrder: baseStarters.length + 1,
      });
      usedIds.add(p.id);
    }
  }

  // Fallback to healthy 2군 official hitters if 1군 depleted by injuries/NT callups
  if (baseStarters.length < 9) {
    const minors = Object.values(career.players)
      .filter(
        (p) =>
          p.teamId === teamId &&
          isBatterEligibleForGame(career, p, isPostseason, isOnNationalDuty) &&
          !usedIds.has(p.id)
      )
      .sort((a, b) => b.ability - a.ability);
    for (const p of minors) {
      if (baseStarters.length >= 9) break;
      baseStarters.push({
        player: p,
        position: p.position,
        battingOrder: baseStarters.length + 1,
      });
      usedIds.add(p.id);
    }
  }

  // Build available 1군 bench pool (everyone healthy on 1군 not in baseStarters)
  let benchPool = firstTeamHitters
    .filter((p) => !usedIds.has(p.id))
    .sort((a, b) => {
      const idleDiff = (b.benchIdleGames ?? 0) - (a.benchIdleGames ?? 0);
      if (Math.abs(idleDiff) >= 3) return idleDiff;
      return b.ability + b.form * 1.5 - (a.ability + a.form * 1.5);
    });

  const rotationNotes: string[] = [];
  const starters = baseStarters.slice(0, 9);

  // 2) Natural Pre-Game Starting Rotation (Rest / Backup Catcher / Platoon / Long-Idle Opportunity)
  // Cap swaps so core regulars stay ~118-138 GS over 144G and still qualify cleanly for batting titles (446+ PA)
  const maxPreGameSwaps = isPostseason ? 1 : isDoubleheaderGame2 ? 3 : 2;
  let swapsDone = 0;

  if (benchPool.length > 0 && starters.length === 9) {
    // Priority A: Backup Catcher Rotation (catchers take heavy physical load)
    const catcherSlotIdx = starters.findIndex((s) => s.position === 'C');
    if (catcherSlotIdx >= 0 && swapsDone < maxPreGameSwaps) {
      const startC = starters[catcherSlotIdx].player;
      const backupC = benchPool.find((b) => b.position === 'C' || b.secondaryPositions?.includes('C'));
      if (backupC) {
        const cConsec = startC.overuse?.consecutiveStarts ?? 0;
        const cFatigue = startC.fatigue;
        const cIdleBackup = backupC.benchIdleGames ?? 0;
        let rotateProb = 0;
        if (isPostseason) {
          rotateProb = cFatigue >= 74 ? 0.4 : 0;
        } else {
          if (isDoubleheaderGame2) rotateProb += 0.62;
          if (cFatigue >= 56) rotateProb += 0.48;
          else if (cFatigue >= 40) rotateProb += 0.24;
          if (cConsec >= 5) rotateProb += 0.35;
          else if (cConsec >= 3) rotateProb += 0.16;
          if (startC.form <= -3) rotateProb += 0.18;
          if (cIdleBackup >= 5) rotateProb += 0.22;
          // Mild natural day-game / weekly backup catcher share
          rotateProb += 0.06;
        }

        if (rotateProb > 0 && rng.next() < Math.min(0.85, rotateProb)) {
          const reason =
            isDoubleheaderGame2
              ? '더블헤더 2차전 체력 안배'
              : cFatigue >= 45 || cConsec >= 4
              ? '주전 포수 피로 관리'
              : '백업 포수 로테이션';
          starters[catcherSlotIdx] = {
            player: backupC,
            position: 'C',
            battingOrder: catcherSlotIdx + 1,
            restedRegularId: startC.id,
            rotationReason: reason,
          };
          benchPool = [startC, ...benchPool.filter((b) => b.id !== backupC.id)];
          rotationNotes.push(`${KBO_TEAMS[teamId].shortName} 선발 포수 로테이션: ${startC.name} 휴식 → ${backupC.name} 선발 (${reason})`);
          swapsDone++;
        }
      }
    }

    // Priority B: Fatigue / Platoon / Long-Idle / Utility Starting Rotation for other slots
    const candidateSlotIndices = starters
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => s.position !== 'C')
      .sort((a, b) => {
        // Check most fatigued / slumping / lower-tier regulars first
        const scoreA = a.s.player.fatigue + (a.s.player.age >= 34 ? 10 : 0) - a.s.player.form * 5 - (a.s.player.ability >= 84 ? 14 : 0);
        const scoreB = b.s.player.fatigue + (b.s.player.age >= 34 ? 10 : 0) - b.s.player.form * 5 - (b.s.player.ability >= 84 ? 14 : 0);
        return scoreB - scoreA;
      });

    for (const { s, idx } of candidateSlotIndices) {
      if (swapsDone >= maxPreGameSwaps) break;
      const reg = s.player;
      const pos = s.position;
      const regPlatoon = getPlatoonAndMatchupScore(reg, oppStarter, getPerfDelta(reg));

      // Pick best position-compatible bench candidate
      let bestBench: Player | null = null;
      let bestScore = -999;
      let bestReason = '';

      for (const b of benchPool) {
        if (b.id === s.restedRegularId) continue;
        const posFit = getPositionFitScore(b, pos);
        if (posFit < 3) continue; // must be legitimately capable at this position

        const bPlatoon = getPlatoonAndMatchupScore(b, oppStarter, getPerfDelta(b));
        const platoonGain = bPlatoon - regPlatoon;
        const abilityGap = b.ability - reg.ability; // usually negative (-2..-12)
        const idleBonus = Math.min(10, Math.max(0, (b.benchIdleGames ?? 0) - 3) * 1.6);
        const formGain = (b.form - reg.form) * 1.4;
        const fatigueRelief = Math.max(0, reg.fatigue - b.fatigue) * 0.25;

        const score = abilityGap * 0.95 + platoonGain * 1.25 + posFit * 0.55 + idleBonus + formGain + fatigueRelief;
        if (score > bestScore) {
          bestScore = score;
          bestBench = b;
          if (reg.fatigue >= profile.starterRestThreshold || isDoubleheaderGame2) {
            bestReason = '체력 안배 로테이션';
          } else if (platoonGain >= 3.2) {
            bestReason = `상대 ${oppStarter.pitchRepertoire?.throws ?? '투수'} 플래툰 기용`;
          } else if ((b.benchIdleGames ?? 0) >= 6) {
            bestReason = '후보 실전 감각 유지';
          } else {
            bestReason = '최근 컨디션·성적 반영';
          }
        }
      }

      if (!bestBench) continue;

      const regFatigue = reg.fatigue;
      const bPlatoonGain =
        getPlatoonAndMatchupScore(bestBench, oppStarter, getPerfDelta(bestBench)) - regPlatoon;
      const abilityDrop = reg.ability - bestBench.ability;
      const isCoreStar = reg.ability >= 84;
      const benchIdle = bestBench.benchIdleGames ?? 0;

      let swapProb = 0;
      if (isPostseason) {
        // Postseason: only rotate if starter exhausted or sharp platoon advantage with close ability
        if (regFatigue >= 72 && abilityDrop <= 6) swapProb = 0.45;
        else if (bPlatoonGain >= 4.8 && abilityDrop <= 4) swapProb = 0.32;
      } else {
        if (regFatigue >= profile.starterRestThreshold + 16) swapProb += 0.46;
        else if (regFatigue >= profile.starterRestThreshold) swapProb += 0.22;
        if (isDoubleheaderGame2) swapProb += 0.25;
        if (reg.age >= 35 && regFatigue >= 32) swapProb += 0.16;
        if (reg.form <= -3 && bestBench.form >= 0 && abilityDrop <= 8) swapProb += 0.2;
        if (bPlatoonGain >= 3.5 && abilityDrop <= 7) swapProb += 0.22 * profile.pinchHitAggression;
        if (benchIdle >= 6 && abilityDrop <= 10) swapProb += 0.22;
        if (isUtilityPlayer(bestBench) && abilityDrop <= 8) swapProb += 0.05;
        if (isCoreStar && regFatigue < 56 && !isDoubleheaderGame2) swapProb *= 0.32;
      }

      if (swapProb > 0 && rng.next() < Math.min(0.75, swapProb)) {
        starters[idx] = {
          player: bestBench,
          position: pos,
          battingOrder: idx + 1,
          restedRegularId: reg.id,
          rotationReason: bestReason,
        };
        benchPool = [reg, ...benchPool.filter((b) => b.id !== bestBench!.id)];
        rotationNotes.push(
          `${KBO_TEAMS[teamId].shortName} ${idx + 1}번(${pos}) 선발 로테이션: ${reg.name} → ${bestBench.name} (${bestReason})`
        );
        swapsDone++;
      }
    }
  }

  // Ensure bench only contains valid eligible non-starter 1군 hitters
  const starterIdSet = new Set(starters.map((s) => s.player.id));
  const finalBench = benchPool.filter((p) => !starterIdSet.has(p.id));
  void oppTeamId;
  void round;

  return {
    starters,
    bench: finalBench,
    rotationNotes,
  };
}

/**
 * 실제 경기 이닝 단위 타석·교체 시뮬레이션 엔진
 * - 대타(PH), 대주자(PR), 대수비(DEF), 부상교체(INJ)를 이닝·점수차·체력·플래툰·감독 성향에 따라 자연스럽게 결정
 * - 교체된 선수는 해당 경기 재출전 불가(removedPlayerIds 엄격 검증)
 * - 교체 선수의 타순(1~9), 수비 포지션, 투입 이닝, 타석/안타/득점/타점/도루를 100% 정합성으로 기록
 * - 경기 결과 박스스코어에는 실제 출전한 선수만 포함
 */
export function simulateInningByInningBattingBox(params: {
  career: CareerSave;
  teamId: TeamId;
  oppTeamId: TeamId;
  plan: GameBatterPlan;
  teamInningRuns: number[];
  oppInningRuns: number[];
  oppPitchPower: number;
  oppStarter: Player;
  oppBullpenRelievers: Player[];
  parkFactor: number;
  isHomeSide: boolean;
  round: number;
  date: string;
  isPostseason: boolean;
  isDoubleheaderGame2: boolean;
  getPerfDelta: (p: Player, oppPit?: Player) => number;
  rng: SeededRng;
}): {
  lines: BoxscoreBatterLine[];
  totalHits: number;
  subNotes: string[];
  inGameInjuredBatterIds: string[];
} {
  const {
    career,
    teamId,
    plan,
    teamInningRuns,
    oppInningRuns,
    oppPitchPower,
    oppStarter,
    oppBullpenRelievers,
    parkFactor,
    round,
    isPostseason,
    isDoubleheaderGame2,
    getPerfDelta,
    rng,
  } = params;

  const totalInnings = Math.max(1, teamInningRuns.length);
  const teamRuns = teamInningRuns.reduce((s, r) => s + r, 0);
  const profile = getManagerBatterRotationProfile(career, teamId);
  const shortClub = KBO_TEAMS[teamId].shortName;

  // Strict per-game tracking structures (NO RE-ENTRY ALLOWED)
  const removedPlayerIds = new Set<string>();
  const availableBench: Player[] = [...plan.bench];
  const subNotes: string[] = [...plan.rotationNotes];
  const inGameInjuredBatterIds: string[] = [];

  interface InternalBatterEntry {
    player: Player;
    line: BoxscoreBatterLine;
    slotIdx: number; // 0..8
    seqInSlot: number; // 0 for starter, 1+ for subs
    perInningPAs: Map<number, number>; // inning (1-based) -> count
    perInningWalks: Map<number, number>;
    perInningHits: Map<number, number>;
    pinchRunInning?: number;
  }

  const entries: InternalBatterEntry[] = [];
  const activeSlots: { entryIdx: number; position: Position; seqCounter: number }[] = [];

  plan.starters.forEach((st, idx) => {
    const line: BoxscoreBatterLine = {
      playerId: st.player.id,
      name: st.player.name,
      position: st.position,
      battingOrder: idx + 1,
      isSubstitute: false,
      PA: 0,
      AB: 0,
      H: 0,
      B2: 0,
      B3: 0,
      HR: 0,
      BB: 0,
      HBP: 0,
      SF: 0,
      SO: 0,
      R: 0,
      RBI: 0,
      SB: 0,
      TB: 0,
    };
    entries.push({
      player: st.player,
      line,
      slotIdx: idx,
      seqInSlot: 0,
      perInningPAs: new Map(),
      perInningWalks: new Map(),
      perInningHits: new Map(),
    });
    activeSlots.push({ entryIdx: idx, position: st.position, seqCounter: 0 });
  });

  // Helper: execute a strictly valid, no-reentry substitution on slotIdx
  const executeSubstitution = (
    slotIdx: number,
    incoming: Player,
    subRole: BatterSubRole,
    inning: number,
    newPos?: Position
  ): number | null => {
    if (removedPlayerIds.has(incoming.id)) return null;
    const benchIdx = availableBench.findIndex((b) => b.id === incoming.id);
    if (benchIdx < 0) return null;

    const currentSlot = activeSlots[slotIdx];
    const outgoingEntry = entries[currentSlot.entryIdx];
    if (!outgoingEntry) return null;

    // Remove outgoing player permanently from this game (NO RE-ENTRY!)
    removedPlayerIds.add(outgoingEntry.player.id);
    // Remove incoming player from available bench
    availableBench.splice(benchIdx, 1);

    const assignedPos: Position = newPos ?? currentSlot.position;
    currentSlot.seqCounter += 1;
    const newLine: BoxscoreBatterLine = {
      playerId: incoming.id,
      name: incoming.name,
      position: assignedPos,
      battingOrder: slotIdx + 1,
      isSubstitute: true,
      subRole,
      enteredInning: inning,
      replacedPlayerId: outgoingEntry.player.id,
      replacedPlayerName: outgoingEntry.player.name,
      PA: 0,
      AB: 0,
      H: 0,
      B2: 0,
      B3: 0,
      HR: 0,
      BB: 0,
      HBP: 0,
      SF: 0,
      SO: 0,
      R: 0,
      RBI: 0,
      SB: 0,
      TB: 0,
    };

    const newEntryIdx = entries.length;
    entries.push({
      player: incoming,
      line: newLine,
      slotIdx,
      seqInSlot: currentSlot.seqCounter,
      perInningPAs: new Map(),
      perInningWalks: new Map(),
      perInningHits: new Map(),
      pinchRunInning: subRole === '대주자' ? inning : undefined,
    });
    currentSlot.entryIdx = newEntryIdx;
    currentSlot.position = assignedPos;

    subNotes.push(
      `${inning}회 ${shortClub} ${slotIdx + 1}번(${assignedPos}) ${subRole}: ${outgoingEntry.player.name} → ${incoming.name}`
    );
    return newEntryIdx;
  };

  // Pre-calibrate realistic KBO team totals (exact same calibration as before for 144G stat realism)
  const baseHits = Math.max(
    Math.min(teamRuns, 2),
    Math.min(17, Math.round(teamRuns * 0.96 + rng.int(3, 6) + (rng.next() < 0.25 ? 1 : 0)))
  );
  const baseWalks = rng.int(2, 5);
  const totalPAs = Math.max(
    totalInnings * 3 + Math.min(baseHits + baseWalks, 11),
    totalInnings * 3 + Math.max(4, Math.round((baseHits + baseWalks) * 0.78))
  );

  // Distribute PAs across innings cleanly (at least 3 per inning, extra PAs weighted by runs scored)
  const inningPAs = new Array<number>(totalInnings).fill(3);
  let extraPAs = Math.max(0, totalPAs - totalInnings * 3);
  const runWeights = teamInningRuns.map((r) => 1 + r * 2.6);
  const runWeightSum = runWeights.reduce((a, b) => a + b, 0) || 1;
  while (extraPAs > 0) {
    let roll = rng.next() * runWeightSum;
    let pick = 0;
    for (let i = 0; i < totalInnings; i++) {
      roll -= runWeights[i];
      if (roll <= 0) {
        pick = i;
        break;
      }
    }
    inningPAs[pick] += 1;
    extraPAs--;
  }

  // Distribute walks & hits across innings so in-game events (pinch running, scoring) align with real innings
  const inningWalks = new Array<number>(totalInnings).fill(0);
  const inningHits = new Array<number>(totalInnings).fill(0);
  let wRem = baseWalks;
  let wGuard = 0;
  while (wRem > 0 && wGuard < 100) {
    wGuard++;
    const idx = rng.int(0, totalInnings - 1);
    if (inningWalks[idx] < Math.max(1, inningPAs[idx] - 2)) {
      inningWalks[idx] += 1;
      wRem--;
    }
  }
  let hRem = baseHits;
  // Guarantee scoring innings receive hits first
  for (let i = 0; i < totalInnings && hRem > 0; i++) {
    if (teamInningRuns[i] > 0) {
      const guaranteed = Math.min(hRem, Math.max(1, Math.min(teamInningRuns[i], inningPAs[i] - inningWalks[i])));
      inningHits[i] += guaranteed;
      hRem -= guaranteed;
    }
  }
  let hGuard = 0;
  while (hRem > 0 && hGuard < 160) {
    hGuard++;
    let roll = rng.next() * runWeightSum;
    let pick = 0;
    for (let i = 0; i < totalInnings; i++) {
      roll -= runWeights[i];
      if (roll <= 0) {
        pick = i;
        break;
      }
    }
    const maxAllowed = Math.max(0, inningPAs[pick] - inningWalks[pick]);
    if (inningHits[pick] < maxAllowed) {
      inningHits[pick] += 1;
      hRem--;
    }
  }
  // If any hits still remain due to tight inning cap, widen an inning PA slightly
  while (hRem > 0) {
    const pick = rng.int(0, totalInnings - 1);
    inningPAs[pick] += 1;
    inningHits[pick] += 1;
    hRem--;
  }

  // Track cumulative score & substitutions per game
  let teamCumRuns = 0;
  let oppCumRuns = 0;
  let batterCursor = 0;
  let subsMadeCount = 0;
  let injurySubDone = false;

  // Pick opponent pitcher active in inning (starter innings 1..5/6, relievers 6+)
  const getOppPitcherForInning = (inn: number): Player => {
    if (inn <= 5 || oppBullpenRelievers.length === 0) return oppStarter;
    const relIdx = Math.min(oppBullpenRelievers.length - 1, inn - 6);
    return oppBullpenRelievers[relIdx] ?? oppStarter;
  };

  // Helper: pick best bench player for a specific substitution role
  const pickBenchCandidate = (
    role: BatterSubRole,
    slotIdx: number,
    targetPos: Position,
    outgoing: Player,
    oppPit: Player,
    isBlowout: boolean
  ): { player: Player; score: number } | null => {
    let best: Player | null = null;
    let bestScore = -999;

    for (const b of availableBench) {
      if (removedPlayerIds.has(b.id)) continue;
      const posFit = getPositionFitScore(b, targetPos);
      const idleBoost = Math.min(12, (b.benchIdleGames ?? 0) * 1.4);

      if (role === '부상교체') {
        if (targetPos === 'C' && posFit < 0) continue;
        const sc = posFit * 4 + b.ability * 0.5 + idleBoost;
        if (sc > bestScore) {
          bestScore = sc;
          best = b;
        }
      } else if (role === '대타') {
        // Pinch hitter can bat for any slot; prioritize platoon matchup, form & bat ability over position fit
        if (targetPos === 'C' && posFit < 0 && availableBench.some((x) => x.position === 'C')) {
          continue;
        }
        const bPlatoon = getPlatoonAndMatchupScore(b, oppPit, getPerfDelta(b, oppPit));
        const outPlatoon = getPlatoonAndMatchupScore(outgoing, oppPit, getPerfDelta(outgoing, oppPit));
        const sc =
          (b.ability - outgoing.ability) * 0.6 +
          (bPlatoon - outPlatoon) * 2.0 +
          (b.form - outgoing.form) * 1.5 +
          (posFit >= 3 ? 2 : 0) +
          idleBoost * 0.75;
        if (sc > bestScore) {
          bestScore = sc;
          best = b;
        }
      } else if (role === '대주자') {
        const bSpeed = getRunnerSpeedScore(b);
        const outSpeed = getRunnerSpeedScore(outgoing);
        if (bSpeed < outSpeed + 4) continue;
        if (targetPos === 'C' && posFit < 0 && !isBlowout) continue;
        const sc = (bSpeed - outSpeed) * 1.4 + (posFit >= 3 ? 6 : 0) + idleBoost * 0.6;
        if (sc > bestScore) {
          bestScore = sc;
          best = b;
        }
      } else {
        // 대수비 (defensive replacement / blowout youth / backup catcher / utility)
        if (targetPos === 'C' && posFit < 0) continue;
        if (!isBlowout && posFit < 2) continue;
        if (isBlowout && posFit < 0) continue;
        const defGain = getDefenseValueScore(b, targetPos) - getDefenseValueScore(outgoing, targetPos);
        const youthBonus = isBlowout ? (b.age <= 24 ? 14 : b.potential >= 76 ? 8 : 0) : 0;
        const utilityBonus = isUtilityPlayer(b) ? 6 : 0;
        const sc = defGain * 0.95 + posFit * 2.2 + youthBonus + utilityBonus + idleBoost;
        if (sc > bestScore) {
          bestScore = sc;
          best = b;
        }
      }
    }

    return best ? { player: best, score: bestScore } : null;
  };

  // =========================================================================
  // INNING-BY-INNING SIMULATION LOOP (Innings 1 .. totalInnings)
  // =========================================================================
  for (let innIdx = 0; innIdx < totalInnings; innIdx++) {
    const inning = innIdx + 1;
    const oppPit = getOppPitcherForInning(inning);
    const leadBefore = teamCumRuns - oppCumRuns;
    const absLead = Math.abs(leadBefore);
    const isBlowout = (absLead >= 5 && inning >= 6) || (absLead >= 4 && inning >= 7);
    const isCloseGame = absLead <= 3;
    const gameSubCap = isBlowout || inning >= 10 || isDoubleheaderGame2 ? 5 : 4;

    // 1) Start-of-Inning Defensive Replacement / Blowout Prospect & Bench Deployment (Innings 6..N)
    if (inning >= 6 && availableBench.length > 0 && subsMadeCount < gameSubCap) {
      const slotsToReview = activeSlots
        .map((sl, slotIdx) => ({
          slotIdx,
          entry: entries[sl.entryIdx],
          pos: sl.position,
        }))
        .filter(
          (x) =>
            !x.entry.line.isSubstitute ||
            x.entry.line.subRole === '대타' ||
            x.entry.line.subRole === '대주자'
        );

      if (isBlowout) {
        // In large margin games (4-5+ runs), actively rest tired stars/veterans & bring in youth/bench/backup catcher
        const blowoutCandidates = slotsToReview.sort((a, b) => {
          const priA =
            a.entry.player.fatigue * 0.8 +
            (a.entry.player.age >= 32 ? 18 : 0) +
            (a.entry.player.ability >= 81 ? 14 : 0) +
            (a.pos === 'C' ? 12 : 0);
          const priB =
            b.entry.player.fatigue * 0.8 +
            (b.entry.player.age >= 32 ? 18 : 0) +
            (b.entry.player.ability >= 81 ? 14 : 0) +
            (b.pos === 'C' ? 12 : 0);
          return priB - priA;
        });

        let blowoutSubsThisInning = 0;
        const maxBlowoutThisInn = inning >= 7 ? 2 : 1;
        for (const item of blowoutCandidates) {
          if (blowoutSubsThisInning >= maxBlowoutThisInn || availableBench.length === 0 || subsMadeCount >= gameSubCap) {
            break;
          }
          const cand = pickBenchCandidate('대수비', item.slotIdx, item.pos, item.entry.player, oppPit, true);
          if (!cand) continue;
          const prob = Math.min(
            0.62,
            (0.28 + (inning - 6) * 0.08 + (item.entry.player.fatigue >= 42 ? 0.1 : 0)) *
              profile.blowoutYouthAggression
          );
          if (rng.next() < prob) {
            executeSubstitution(item.slotIdx, cand.player, '대수비', inning, item.pos);
            subsMadeCount++;
            blowoutSubsThisInning++;
          }
        }
      } else if (inning >= 7 && leadBefore >= 0 && leadBefore <= 4) {
        // Late-inning defensive alignment / protecting lead or tie / post-PH/PR defensive upgrade
        const defTargets = slotsToReview
          .filter(
            (x) =>
              x.pos !== 'DH' &&
              (x.entry.line.subRole === '대타' ||
                x.entry.line.subRole === '대주자' ||
                (leadBefore >= 1 &&
                  (DEFENSIVE_KEY_POSITIONS.has(x.pos) ||
                    x.entry.player.fatigue >= 40 ||
                    x.entry.player.age >= 33)) ||
                (inning >= 8 && (x.entry.player.fatigue >= 42 || x.pos === 'C')))
          )
          .sort(
            (a, b) =>
              getDefenseValueScore(a.entry.player, a.pos) - getDefenseValueScore(b.entry.player, b.pos)
          );

        for (const item of defTargets.slice(0, 2)) {
          if (availableBench.length === 0 || subsMadeCount >= gameSubCap) break;
          const cand = pickBenchCandidate('대수비', item.slotIdx, item.pos, item.entry.player, oppPit, false);
          if (!cand) continue;
          const baseProb =
            (item.entry.line.subRole === '대타' || item.entry.line.subRole === '대주자'
              ? 0.44
              : 0.18 + (inning - 7) * 0.08 + (leadBefore >= 1 ? 0.06 : 0)) *
            profile.defensiveSubAggression;
          if (cand.score >= 3 && rng.next() < Math.min(0.6, baseProb)) {
            executeSubstitution(item.slotIdx, cand.player, '대수비', inning, item.pos);
            subsMadeCount++;
            break;
          }
        }
      }
    }

    // 2) Mid-Game Injury Replacement check (realistic ~1.6% per team per game in innings 3..8)
    if (!injurySubDone && inning >= 3 && inning <= 8 && availableBench.length > 0) {
      const injuredCandidate = activeSlots
        .map((sl, slotIdx) => ({ slotIdx, entry: entries[sl.entryIdx], pos: sl.position }))
        .find((x) => {
          const p = x.entry.player;
          const pProb = 0.00032 + (p.fatigue > 62 ? 0.0007 : 0) + (p.age >= 34 ? 0.00035 : 0);
          return rng.next() < pProb;
        });

      if (injuredCandidate) {
        const cand = pickBenchCandidate(
          '부상교체',
          injuredCandidate.slotIdx,
          injuredCandidate.pos,
          injuredCandidate.entry.player,
          oppPit,
          false
        );
        if (cand) {
          inGameInjuredBatterIds.push(injuredCandidate.entry.player.id);
          executeSubstitution(
            injuredCandidate.slotIdx,
            cand.player,
            '부상교체',
            inning,
            injuredCandidate.pos
          );
          injurySubDone = true;
          subsMadeCount++;
        }
      }
    }

    // 3) Simulate each PA in this inning sequentially through batting order (1..9)
    const paCount = inningPAs[innIdx];
    const paEntriesThisInning: { entryIdx: number; slotIdx: number }[] = [];

    for (let k = 0; k < paCount; k++) {
      const slotIdx = batterCursor % 9;
      batterCursor++;

      let currentSlot = activeSlots[slotIdx];
      let currentEntry = entries[currentSlot.entryIdx];

      // Check Pinch-Hit (대타) before PA in innings 6..N
      if (inning >= 6 && availableBench.length > 0 && subsMadeCount < gameSubCap && !currentEntry.line.isSubstitute) {
        const outP = currentEntry.player;
        const isLowerOrTired =
          slotIdx >= 5 || outP.fatigue >= 44 || outP.form <= -2 || currentSlot.position === 'C';
        const hasLongIdleBench = availableBench.some((b) => (b.benchIdleGames ?? 0) >= 6);
        const leverageSit =
          (isCloseGame && inning >= 6) || (leadBefore <= -1 && leadBefore >= -4 && inning >= 6);

        if (isLowerOrTired || (hasLongIdleBench && inning >= 7) || (isBlowout && inning >= 7)) {
          const phCand = pickBenchCandidate('대타', slotIdx, currentSlot.position, outP, oppPit, isBlowout);
          if (phCand) {
            let phProb = 0;
            if (leverageSit) {
              if (phCand.score >= 3) phProb = 0.28;
              else if (phCand.score >= -1) phProb = 0.16;
              else if (slotIdx >= 6) phProb = 0.11;
            } else if (isBlowout && inning >= 7) {
              phProb = 0.22;
            } else if (hasLongIdleBench && inning >= 7 && slotIdx >= 5) {
              phProb = 0.15;
            }
            if (isDoubleheaderGame2 && inning >= 6) phProb += 0.08;
            if (outP.ability >= 84 && !isBlowout && outP.fatigue < 62) phProb *= 0.16;
            phProb *= profile.pinchHitAggression;

            if (phProb > 0 && rng.next() < Math.min(0.68, phProb)) {
              const newPos =
                getPositionFitScore(phCand.player, currentSlot.position) >= 2
                  ? currentSlot.position
                  : currentSlot.position === 'C'
                  ? 'C'
                  : currentSlot.position;
              const newIdx = executeSubstitution(slotIdx, phCand.player, '대타', inning, newPos);
              if (newIdx !== null) {
                subsMadeCount++;
                currentSlot = activeSlots[slotIdx];
                currentEntry = entries[newIdx];
              }
            }
          }
        }
      }

      // Record this PA for the actual batter at the plate
      currentEntry.line.PA += 1;
      currentEntry.perInningPAs.set(inning, (currentEntry.perInningPAs.get(inning) ?? 0) + 1);
      paEntriesThisInning.push({ entryIdx: currentSlot.entryIdx, slotIdx });
    }

    // 4) Assign this inning's walks/HBP and hits among the actual batters who batted in this inning
    const walkPool = paEntriesThisInning.map((x) => {
      const e = entries[x.entryIdx];
      return {
        entryIdx: x.entryIdx,
        slotIdx: x.slotIdx,
        w: Math.max(0.5, 1.0 + (e.player.ability - 75) * 0.025 + (x.slotIdx <= 3 ? 0.18 : 0)),
      };
    });
    const walkWSum = walkPool.reduce((s, x) => s + x.w, 0) || 1;
    let wLeft = inningWalks[innIdx];
    const inningAssignedWalks = new Map<number, number>();
    let wg = 0;
    while (wLeft > 0 && wg < 60) {
      wg++;
      let roll = rng.next() * walkWSum;
      let chosen = walkPool[0];
      for (const item of walkPool) {
        roll -= item.w;
        if (roll <= 0) {
          chosen = item;
          break;
        }
      }
      const ent = entries[chosen.entryIdx];
      const maxInInn = ent.perInningPAs.get(inning) ?? 0;
      const usedW = inningAssignedWalks.get(chosen.entryIdx) ?? 0;
      if (usedW < maxInInn) {
        inningAssignedWalks.set(chosen.entryIdx, usedW + 1);
        if (rng.next() < 0.13) ent.line.HBP += 1;
        else ent.line.BB += 1;
        ent.perInningWalks.set(inning, usedW + 1);
        wLeft--;
      }
    }

    const hitPool = paEntriesThisInning.map((x) => {
      const e = entries[x.entryIdx];
      const evEdge = e.player.battingProfile?.avgExitVelocityKmh
        ? (e.player.battingProfile.avgExitVelocityKmh - 143) * 0.004
        : 0;
      const perfDelta = getPerfDelta(e.player, oppPit);
      const rate = Math.max(
        0.84,
        Math.min(
          1.14,
          1.0 +
            (e.player.ability - 75) * 0.0085 +
            evEdge +
            e.player.form * 0.004 +
            perfDelta * 0.0055 -
            (oppPitchPower - 75) * 0.002
        )
      );
      return { entryIdx: x.entryIdx, slotIdx: x.slotIdx, rate };
    });

    let hLeft = inningHits[innIdx];
    const inningAssignedHits = new Map<number, number>();
    let hg = 0;
    while (hLeft > 0 && hg < 100) {
      hg++;
      let remWeight = 0;
      for (const item of hitPool) {
        const ent = entries[item.entryIdx];
        const maxAbInInn = (ent.perInningPAs.get(inning) ?? 0) - (ent.perInningWalks.get(inning) ?? 0);
        const curH = inningAssignedHits.get(item.entryIdx) ?? 0;
        if (curH < maxAbInInn) remWeight += item.rate;
      }
      if (remWeight <= 0) break;
      let roll = rng.next() * remWeight;
      let chosen: (typeof hitPool)[number] | null = null;
      for (const item of hitPool) {
        const ent = entries[item.entryIdx];
        const maxAbInInn = (ent.perInningPAs.get(inning) ?? 0) - (ent.perInningWalks.get(inning) ?? 0);
        const curH = inningAssignedHits.get(item.entryIdx) ?? 0;
        if (curH >= maxAbInInn) continue;
        roll -= item.rate;
        if (roll <= 0) {
          chosen = item;
          break;
        }
      }
      if (chosen) {
        const ent = entries[chosen.entryIdx];
        const curH = inningAssignedHits.get(chosen.entryIdx) ?? 0;
        inningAssignedHits.set(chosen.entryIdx, curH + 1);
        ent.line.H += 1;
        ent.perInningHits.set(inning, curH + 1);
        hLeft--;
      }
    }

    // 5) Pinch-Runner (대주자) check in late close innings when a slower runner reached base this inning!
    if (inning >= 7 && (isCloseGame || (leadBefore <= -1 && leadBefore >= -3)) && availableBench.length > 0 && subsMadeCount < gameSubCap) {
      const onBaseSlowSlots = paEntriesThisInning
        .filter((x) => {
          const ent = entries[x.entryIdx];
          const reached = (ent.perInningHits.get(inning) ?? 0) + (ent.perInningWalks.get(inning) ?? 0) > 0;
          const pos = activeSlots[x.slotIdx].position;
          const isSlowArchetype =
            getRunnerSpeedScore(ent.player) <= 64 || pos === 'C' || pos === '1B' || pos === 'DH';
          return reached && activeSlots[x.slotIdx].entryIdx === x.entryIdx && isSlowArchetype;
        })
        .sort((a, b) => getRunnerSpeedScore(entries[a.entryIdx].player) - getRunnerSpeedScore(entries[b.entryIdx].player));

      for (const runnerSlot of onBaseSlowSlots.slice(0, 2)) {
        if (availableBench.length === 0 || subsMadeCount >= gameSubCap) break;
        const slowEnt = entries[runnerSlot.entryIdx];
        const slotPos = activeSlots[runnerSlot.slotIdx].position;
        const prCand = pickBenchCandidate('대주자', runnerSlot.slotIdx, slotPos, slowEnt.player, oppPit, false);
        if (prCand) {
          const prProb = Math.min(
            0.68,
            (0.32 + (inning >= 8 ? 0.14 : 0) + (Math.abs(leadBefore) <= 1 ? 0.12 : 0)) *
              profile.pinchRunAggression
          );
          if (rng.next() < prProb) {
            const newPos =
              getPositionFitScore(prCand.player, slotPos) >= 2 ? slotPos : slotPos;
            const prEntryIdx = executeSubstitution(runnerSlot.slotIdx, prCand.player, '대주자', inning, newPos);
            if (prEntryIdx !== null) {
              subsMadeCount++;
              // Pinch runner gets stolen base opportunity right away
              const prEnt = entries[prEntryIdx];
              const sbProb = Math.min(0.42, 0.16 + (getRunnerSpeedScore(prCand.player) - 60) * 0.007);
              if (rng.next() < sbProb) {
                prEnt.line.SB += 1;
              }
              break;
            }
          }
        }
      }
    }

    teamCumRuns += teamInningRuns[innIdx] ?? 0;
    oppCumRuns += oppInningRuns[innIdx] ?? 0;
  }

  // Finalize AB strictly from PA - BB - HBP - SF (subs who only pinch-ran/fielded legitimately have PA=0, AB=0)
  for (const e of entries) {
    e.line.AB = Math.max(0, e.line.PA - e.line.BB - e.line.HBP - e.line.SF);
    if (e.line.H > e.line.AB) {
      // Safety guard: guarantee H <= AB always
      e.line.H = e.line.AB;
    }
  }

  const totalHitsActual = entries.reduce((s, e) => s + e.line.H, 0);

  // Distribute HRs realistically across batters who actually recorded hits
  const hrParkMult = parkFactor >= 1.06 ? 1.14 : parkFactor <= 0.92 ? 0.86 : 1.0;
  let targetHR = 0;
  const hrRoll = rng.next();
  if (teamRuns >= 1) {
    const p1 = Math.min(0.75, (0.42 + teamRuns * 0.048) * hrParkMult);
    const p2 = Math.min(0.34, (0.095 + teamRuns * 0.024) * hrParkMult);
    const p3 = Math.min(0.1, (0.014 + teamRuns * 0.0075) * hrParkMult);
    if (hrRoll < p3) targetHR = 3;
    else if (hrRoll < p2) targetHR = 2;
    else if (hrRoll < p1) targetHR = 1;
  }
  const maxHR = Math.min(teamRuns, totalHitsActual, targetHR);

  const hrWeights = entries.map((e) => {
    const p = e.player;
    const cleanupMult = e.slotIdx >= 2 && e.slotIdx <= 5 ? 1.24 : e.slotIdx <= 1 ? 0.78 : 0.74;
    const pos = e.line.position;
    const posMult =
      pos === '1B' || pos === '3B' || pos === 'DH' || pos === 'RF' || pos === 'LF' ? 1.15 : 0.86;
    const focusMult = p.trainingFocus === '타격' ? 1.08 : 1.0;
    const evMult = p.battingProfile?.avgExitVelocityKmh
      ? Math.max(0.82, Math.min(1.18, 1.0 + (p.battingProfile.avgExitVelocityKmh - 143.5) * 0.028))
      : 1.0;
    const barrelMult = p.battingProfile?.barrelPct
      ? Math.max(0.85, Math.min(1.16, 0.88 + p.battingProfile.barrelPct * 0.016))
      : 1.0;
    const abilityScale = Math.max(0.48, 1.0 + (p.ability - 74) * 0.048);
    const perfMult = Math.max(0.92, Math.min(1.09, 1.0 + getPerfDelta(p, oppStarter) * 0.018));
    return e.line.H > 0
      ? Math.max(0.3, abilityScale * cleanupMult * posMult * focusMult * evMult * barrelMult * perfMult)
      : 0;
  });
  const hrWeightSum = hrWeights.reduce((a, b) => a + b, 0);

  let hrLeft = maxHR;
  let hrGuard = 0;
  while (hrLeft > 0 && hrWeightSum > 0 && hrGuard < 140) {
    hrGuard++;
    let roll = rng.next() * hrWeightSum;
    let idx = 0;
    for (let i = 0; i < hrWeights.length; i++) {
      roll -= hrWeights[i];
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    const l = entries[idx].line;
    if (l.HR + l.B2 + l.B3 < l.H) {
      l.HR += 1;
      hrLeft--;
    }
  }

  // Extra-base hits, TB, SO, SB for all appearing players
  for (const e of entries) {
    const l = e.line;
    const pObj = e.player;
    const remHits = l.H - l.HR;
    for (let k = 0; k < remHits; k++) {
      const roll = rng.next();
      if (roll < 0.19) l.B2 += 1;
      else if (roll < 0.205) l.B3 += 1;
    }
    const singles = l.H - l.HR - l.B2 - l.B3;
    l.TB = singles + l.B2 * 2 + l.B3 * 3 + l.HR * 4;
    const nonHits = Math.max(0, l.AB - l.H);
    const kBase = Math.max(0.15, 0.245 - (pObj.ability - 74) * 0.003);
    l.SO = Math.min(nonHits, Math.round(nonHits * (kBase + rng.next() * 0.14)));

    if (l.H + l.BB > 0) {
      let sbProb = 0.03;
      if (FAST_POSITIONS.has(pObj.position)) sbProb += 0.075;
      if (e.slotIdx === 0 || e.slotIdx === 1 || e.slotIdx === 8) sbProb += 0.085;
      if (pObj.age <= 29) sbProb += 0.035;
      if (pObj.age >= 34 || pObj.position === 'C' || pObj.position === '1B' || pObj.position === 'DH') {
        sbProb *= 0.22;
      }
      if (pObj.trainingFocus === '주루') sbProb += 0.075;
      if (rng.next() < sbProb) {
        l.SB += 1;
        if (l.H + l.BB >= 2 && rng.next() < sbProb * 0.28) l.SB += 1;
      }
    }
  }

  // Distribute Runs & RBIs strictly matching teamRuns (including pinch-runner scoring credit!)
  let runsLeft = teamRuns;
  let rbiLeft = teamRuns;
  for (const e of entries) {
    if (e.line.HR > 0) {
      const giveR = Math.min(runsLeft, e.line.HR);
      const giveRBI = Math.min(rbiLeft, e.line.HR);
      e.line.R += giveR;
      e.line.RBI += giveRBI;
      runsLeft -= giveR;
      rbiLeft -= giveRBI;
    }
  }

  while (runsLeft > 0) {
    const onBase = entries
      .map((e) => {
        const prBonus = e.pinchRunInning && (teamInningRuns[e.pinchRunInning - 1] ?? 0) > 0 ? 2.4 : e.pinchRunInning ? 0.9 : 0;
        const baseReach = e.line.H + e.line.BB + e.line.HBP;
        const w = (baseReach + prBonus) * (e.slotIdx <= 3 ? 1.25 : 0.9);
        return { l: e.line, w };
      })
      .filter((x) => x.w > 0);
    if (onBase.length > 0) {
      let roll = rng.next() * onBase.reduce((s, x) => s + x.w, 0);
      let chosen = onBase[0].l;
      for (const item of onBase) {
        roll -= item.w;
        if (roll <= 0) {
          chosen = item.l;
          break;
        }
      }
      chosen.R += 1;
    } else {
      rng.pick(entries).line.R += 1;
    }
    runsLeft--;
  }

  while (rbiLeft > 0) {
    const hitters = entries
      .map((e) => ({
        l: e.line,
        w: (e.line.H + e.line.HR * 1.1 + e.line.B2 * 0.45 + (e.line.PA > 0 ? 0.08 : 0)) *
          (e.slotIdx >= 2 && e.slotIdx <= 5 ? 1.24 : 0.88),
      }))
      .filter((x) => x.w > 0);
    if (hitters.length > 0) {
      let roll = rng.next() * hitters.reduce((s, x) => s + x.w, 0);
      let chosen = hitters[0].l;
      for (const item of hitters) {
        roll -= item.w;
        if (roll <= 0) {
          chosen = item.l;
          break;
        }
      }
      chosen.RBI += 1;
    } else {
      const anyPa = entries.filter((e) => e.line.PA > 0);
      rng.pick(anyPa.length > 0 ? anyPa : entries).line.RBI += 1;
    }
    rbiLeft--;
  }

  // Order boxscore lines cleanly by batting order (1..9), starter first then substitutes in entry order
  const orderedLines = [...entries]
    .sort((a, b) => {
      if (a.slotIdx !== b.slotIdx) return a.slotIdx - b.slotIdx;
      return a.seqInSlot - b.seqInSlot;
    })
    .map((e) => e.line);

  void round;
  return {
    lines: orderedLines,
    totalHits: totalHitsActual,
    subNotes,
    inGameInjuredBatterIds,
  };
}

/**
 * 경기 종료 후 야수 체력/피로도/연속 미출전 일수(benchIdleGames)/출전 기회 기반 불만도·사기 갱신 (전 10구단 공통)
 */
export function updateBatterWorkloadAndMoraleAfterGameInPlace(
  career: CareerSave,
  teamId: TeamId,
  date: string,
  round: number,
  batterLines: BoxscoreBatterLine[],
  options?: { isDoubleheaderGame2?: boolean }
): void {
  const lineMap = new Map(batterLines.map((l) => [l.playerId, l]));
  const replacedSet = new Set(
    batterLines.map((l) => l.replacedPlayerId).filter((id): id is string => Boolean(id))
  );
  const lineupSet = new Set(career.teams[teamId]?.lineupOrder ?? []);

  for (const p of Object.values(career.players)) {
    const line = lineMap.get(p.id);
    if (!line && (p.teamId !== teamId || p.role !== '타자' || p.rosterTier !== '1군')) continue;

    if (line) {
      p.lastPlayedRound = round;
      p.lastPlayedDate = date;
      p.benchIdleGames = 0;

      const wasPulledEarly = replacedSet.has(p.id);
      const isCatcher = line.position === 'C';
      const dhExtra = options?.isDoubleheaderGame2 ? 3 : 0;

      let fatigueAdd = 0;
      if (line.isSubstitute) {
        fatigueAdd = Math.max(2, Math.min(5, line.PA * 2 + (isCatcher ? 2 : 1)));
      } else if (wasPulledEarly) {
        fatigueAdd = (isCatcher ? 6 : 4) + dhExtra;
      } else {
        fatigueAdd = (isCatcher ? 11 : 7) + (p.age >= 34 ? 2 : 0) + dhExtra;
      }
      p.fatigue = Math.min(100, p.fatigue + fatigueAdd);

      // Playing-time morale boost for bench players & productive appearances
      const isRegular = lineupSet.has(p.id);
      const productive = line.H >= 1 || line.RBI >= 1 || line.SB >= 1 || line.R >= 1;
      if (!isRegular) {
        const relief = productive ? 5 : 2;
        p.dissatisfaction = Math.max(0, (p.dissatisfaction ?? 22) - relief);
        if ((p.dissatisfaction ?? 20) <= 28 && p.morale === '불만') {
          p.morale = '보통';
        } else if ((p.dissatisfaction ?? 20) <= 18 && productive) {
          p.morale = '만족';
        }
      }
    } else if (!p.injury) {
      // Did not play today -> recover fatigue!
      const isRegular = lineupSet.has(p.id);
      const recover = isRegular ? 15 : 10;
      p.fatigue = Math.max(0, p.fatigue - recover);
      p.consecutiveAppearances = 0;

      // Track consecutive games sitting idle on 1군 bench
      p.benchIdleGames = (p.benchIdleGames ?? 0) + 1;
      if (!isRegular && p.benchIdleGames >= 8 && p.ability >= 66) {
        p.dissatisfaction = Math.min(100, (p.dissatisfaction ?? 20) + 3);
        if (p.dissatisfaction >= 68) {
          p.morale = '불만';
        }
      }
    }
  }
}

/**
 * 성적 기반 야수 주전 경쟁 및 주전 승격 · 출전 기회 불만도 연동 (전 10구단 동일 적용)
 */
export function evaluateBatterCompetitionAndMoraleInPlace(
  career: CareerSave,
  date: string
): void {
  if (career.phase !== 'REGULAR_SEASON' || career.gamesPlayed < 18) return;

  for (const tid of TEAM_IDS) {
    const team = career.teams[tid];
    if (!team) continue;
    const isUser = tid === career.playerTeamId;
    const lineupSet = new Set(team.lineupOrder);

    const benchHitters = Object.values(career.players).filter(
      (p) =>
        p.teamId === tid &&
        p.role === '타자' &&
        p.rosterTier === '1군' &&
        !lineupSet.has(p.id) &&
        !p.injury
    );
    const regularHitters = team.lineupOrder
      .map((id, idx) => ({ p: career.players[id], idx }))
      .filter((x): x is { p: Player; idx: number } => Boolean(x.p && !x.p.injury));

    // Check hot bench challengers with meaningful playing time
    const hotChallengers = benchHitters
      .map((b) => {
        const st = b.stats as BatterStats;
        const pa = st.PA ?? 0;
        const ops = pa >= 24 ? calcOPS(st) : null;
        const avg = pa >= 24 ? calcAVG(st.H, st.AB) : null;
        return { b, pa, ops, avg };
      })
      .filter((x) => x.pa >= 24 && ((x.ops !== null && x.ops >= 0.8) || (x.avg !== null && x.avg >= 0.305) || x.b.form >= 3))
      .sort((a, b) => (b.ops ?? 0) - (a.ops ?? 0));

    if (hotChallengers.length === 0) continue;

    for (const chal of hotChallengers) {
      // Find a struggling compatible regular starter
      const strugglingTarget = regularHitters
        .filter(({ p }) => {
          const targetPos = (team.lineupPositions[p.id] ?? p.position) as Position;
          if (getPositionFitScore(chal.b, targetPos) < 4) return false;
          const st = p.stats as BatterStats;
          const pa = st.PA ?? 0;
          if (pa < 40) return false;
          const ops = calcOPS(st);
          return (ops !== null && ops <= 0.67) || p.form <= -3;
        })
        .sort((a, b) => {
          const stA = a.p.stats as BatterStats;
          const stB = b.p.stats as BatterStats;
          const opsA = calcOPS(stA) ?? 0.7;
          const opsB = calcOPS(stB) ?? 0.7;
          return opsA - opsB;
        })[0];

      if (!strugglingTarget) continue;
      const targetPos = (team.lineupPositions[strugglingTarget.p.id] ?? strugglingTarget.p.position) as Position;

      if (!isUser) {
        // AI club automatically promotes hot bench challenger to starting lineup
        team.lineupOrder[strugglingTarget.idx] = chal.b.id;
        team.lineupPositions[chal.b.id] = targetPos;
        delete team.lineupPositions[strugglingTarget.p.id];
        team.benchOrder = [
          strugglingTarget.p.id,
          ...team.benchOrder.filter((id) => id !== chal.b.id && id !== strugglingTarget.p.id),
        ];

        chal.b.morale = '만족';
        chal.b.dissatisfaction = Math.max(0, (chal.b.dissatisfaction ?? 20) - 12);
        chal.b.benchIdleGames = 0;

        strugglingTarget.p.dissatisfaction = Math.min(100, (strugglingTarget.p.dissatisfaction ?? 20) + 12);
        if (strugglingTarget.p.dissatisfaction >= 60) strugglingTarget.p.morale = '불만';

        if (!career.newsFeed) career.newsFeed = [];
        career.newsFeed.unshift({
          id: `news-bat-promo-${tid}-${chal.b.id}-${career.gamesPlayed}`,
          season: career.season,
          date,
          category: '타구단소식',
          headline: `[주전 승격] ${KBO_TEAMS[tid].shortName}, 맹타 ${chal.b.name}(${targetPos}) 주전 전격 발탁`,
          body: `후보로 출전해 OPS ${(chal.ops ?? 0.82).toFixed(3)}의 맹타를 휘두른 ${chal.b.name} 선수가 부진한 ${strugglingTarget.p.name} 대신 ${targetPos} 주전 자리를 차지했습니다.`,
          teamId: tid,
        });
      } else {
        // User club: hot bench player gains strong momentum & expects starting chance; publish coaching notice
        chal.b.dissatisfaction = Math.min(100, (chal.b.dissatisfaction ?? 18) + 4);
        const dedupeId = `news-user-bat-comp-${chal.b.id}-${Math.floor(career.gamesPlayed / 12)}`;
        if (!career.newsFeed) career.newsFeed = [];
        if (!career.newsFeed.some((n) => n.id === dedupeId)) {
          career.newsFeed.unshift({
            id: dedupeId,
            season: career.season,
            date,
            category: '구단사건',
            headline: `[주전 경쟁] ${KBO_TEAMS[tid].shortName} 후보 ${chal.b.name}(OPS ${(chal.ops ?? 0.82).toFixed(3)}), ${targetPos} 주전 도전장`,
            body: `교체·로테이션 출전마다 맹활약 중인 ${chal.b.name} 선수가 부진한 ${strugglingTarget.p.name}의 ${targetPos} 주전 자리를 위협하고 있습니다. 라인업 관리에서 주전 승격을 검토해 보세요.`,
            teamId: tid,
          });
        }
      }
      break; // max 1 promotion/report per club per cycle
    }
  }
}
