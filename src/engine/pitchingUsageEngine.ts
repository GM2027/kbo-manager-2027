import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  BoxscorePitcherLine,
  CareerSave,
  Coach,
  PitcherStats,
  Player,
  TeamId,
} from '../types/kbo';
import { SeededRng } from './rng';
import { calcERA } from './stats';

export type BullpenRoleType =
  | '마무리'
  | '셋업맨'
  | '필승조'
  | '중간계투'
  | '추격조'
  | '롱릴리프';

export const ALL_BULLPEN_ROLES: BullpenRoleType[] = [
  '마무리',
  '셋업맨',
  '필승조',
  '중간계투',
  '추격조',
  '롱릴리프',
];

export interface PitcherGamePlan {
  starter: Player;
  starterUsageType: '정규선발' | '대체선발' | '임시선발' | '오프너';
  relievers: Player[];
  openerFollower?: Player;
}

/**
 * ISO 날짜(YYYY-MM-DD) 간 일수 차이 계산 (toIso - fromIso)
 */
export function diffCalendarDays(fromIso?: string, toIso?: string): number | null {
  if (!fromIso || !toIso) return null;
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return null;
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * 선수의 마지막 등판 이후 휴식 일수 계산 (캘린더 기준 우선, 미기록 시 라운드 환산)
 */
export function getPitcherRestDays(
  player: Player,
  currentDate: string,
  currentRound: number
): number {
  if (player.lastPitchedDate) {
    const diff = diffCalendarDays(player.lastPitchedDate, currentDate);
    if (diff !== null) return Math.max(0, diff);
  }
  if (player.lastPitchedRound <= -5) return 7;
  const roundGap = Math.max(0, currentRound - player.lastPitchedRound);
  return Math.round(roundGap * 1.15);
}

/**
 * 최근 3일 누적 투구 수 계산
 */
export function getRecent3DayPitchCount(player: Player, currentDate: string): number {
  if (player.recentPitchLog && player.recentPitchLog.length > 0) {
    let total = 0;
    for (const log of player.recentPitchLog) {
      const d = diffCalendarDays(log.date, currentDate);
      if (d !== null && d >= 0 && d <= 3) {
        total += log.pitches;
      }
    }
    return total;
  }
  return player.recent3DayPitches ?? 0;
}

/**
 * 투수 보직 표준화 ('중간' -> '중간계투')
 */
export function normalizeBullpenRole(role?: Player['pitchRole']): BullpenRoleType {
  switch (role) {
    case '마무리':
      return '마무리';
    case '셋업맨':
      return '셋업맨';
    case '필승조':
      return '필승조';
    case '추격조':
      return '추격조';
    case '롱릴리프':
      return '롱릴리프';
    case '중간계투':
    case '중간':
    default:
      return '중간계투';
  }
}

/**
 * 구단 1군 불펜 6개 보직 자동 배정 (마무리 · 셋업맨 · 필승조 · 중간계투 · 추격조 · 롱릴리프)
 * 사용자 수동 지정 보직(pitchRoleLockedByUser)은 존중하며, 미지정/AI 구단은 능력치·구위·체력·나이 기반으로 배분합니다.
 */
export function assignTeamBullpenRolesInPlace(
  career: CareerSave,
  teamId: TeamId,
  options?: { forceReassign?: boolean }
): void {
  const team = career.teams[teamId];
  if (!team) return;
  const rotSet = new Set(team.rotationOrder);
  const bullpen = team.bullpenOrder
    .map((id) => career.players[id])
    .filter(
      (p): p is Player =>
        Boolean(p && p.teamId === teamId && p.role === '투수' && p.rosterTier === '1군' && !rotSet.has(p.id))
    );
  if (bullpen.length === 0) return;

  const isUser = teamId === career.playerTeamId;
  const alreadyHasModernRoles =
    bullpen.some((p) => p.pitchRole === '셋업맨') &&
    bullpen.some((p) => p.pitchRole === '롱릴리프' || p.pitchRole === '추격조');
  if (isUser && alreadyHasModernRoles && !options?.forceReassign) {
    // Normalize legacy '중간' label only
    for (const p of bullpen) {
      if (p.pitchRole === '중간') p.pitchRole = '중간계투';
    }
    return;
  }

  // Score bullpen arms for leverage hierarchy (OOTP 구위·불펜 적합도·제구 통합 반영)
  const scoreLeverage = (p: Player): number => {
    const ootpP = p.ootpRatings?.pitching;
    const rep = p.pitchRepertoire;
    const stuff = ootpP
      ? (ootpP.stuff.cur - 65) * 0.28 + (ootpP.relieverFit - 65) * 0.14 + (ootpP.avgVelocityKmh - 142) * 0.8
      : rep
      ? (rep.avgVelocityKmh - 142) * 1.4 + (rep.breakingSharpness - 72) * 0.22
      : 0;
    const cmd = ootpP ? (ootpP.control.cur - 65) * 0.16 : rep ? (rep.command - 72) * 0.16 : 0;
    const ps = p.stats as PitcherStats;
    const outs = ps?.outs ?? 0;
    const era = outs >= 24 ? calcERA(ps.ER, outs) : null;
    const eraAdj = era !== null && Number.isFinite(era) ? Math.max(-4, Math.min(4, (4.1 - era) * 1.25)) : 0;
    return p.ability + stuff + cmd + p.form * 0.9 + eraAdj;
  };

  // Respect user-locked roles first
  const assigned = new Set<string>();
  const hasRole = (r: BullpenRoleType) =>
    bullpen.some((p) => assigned.has(p.id) && normalizeBullpenRole(p.pitchRole) === r);

  if (!options?.forceReassign) {
    for (const p of bullpen) {
      if (p.pitchRoleLockedByUser && p.pitchRole && p.pitchRole !== '선발' && p.pitchRole !== '예비') {
        p.pitchRole = normalizeBullpenRole(p.pitchRole);
        assigned.add(p.id);
      }
    }
  }

  const remaining = () => bullpen.filter((p) => !assigned.has(p.id));

  // 1) 마무리 (CL 우선 -> 최고 레버리지)
  if (!hasRole('마무리')) {
    const closer =
      remaining().find((p) => p.pitchRole === '마무리' || p.position === 'CL') ??
      [...remaining()].sort((a, b) => scoreLeverage(b) - scoreLeverage(a))[0];
    if (closer) {
      closer.pitchRole = '마무리';
      assigned.add(closer.id);
    }
  }

  // 2) 셋업맨 (8회 전담 핵심 불펜)
  if (!hasRole('셋업맨')) {
    const setup = [...remaining()].sort((a, b) => scoreLeverage(b) - scoreLeverage(a))[0];
    if (setup) {
      setup.pitchRole = '셋업맨';
      assigned.add(setup.id);
    }
  }

  // 3) 필승조 (1~2명)
  const highLevTarget = bullpen.length >= 7 ? 2 : 1;
  let highLevCount = bullpen.filter((p) => assigned.has(p.id) && p.pitchRole === '필승조').length;
  for (const p of [...remaining()].sort((a, b) => scoreLeverage(b) - scoreLeverage(a))) {
    if (highLevCount >= highLevTarget) break;
    p.pitchRole = '필승조';
    assigned.add(p.id);
    highLevCount++;
  }

  // 4) 롱릴리프 (선발 경력 또는 젊은/이닝 소화력 높은 투수 1명)
  if (!hasRole('롱릴리프') && remaining().length > 0) {
    const longCand = [...remaining()].sort((a, b) => {
      const spBonusA = a.position === 'SP' || a.pitchRole === '롱릴리프' ? 12 : 0;
      const spBonusB = b.position === 'SP' || b.pitchRole === '롱릴리프' ? 12 : 0;
      const staminaA = a.age <= 29 ? 4 : 0;
      const staminaB = b.age <= 29 ? 4 : 0;
      return spBonusB + staminaB + b.ability * 0.4 - (spBonusA + staminaA + a.ability * 0.4);
    })[0];
    if (longCand) {
      longCand.pitchRole = '롱릴리프';
      assigned.add(longCand.id);
    }
  }

  // 5) 중간계투 & 추격조 배분
  const restSorted = [...remaining()].sort((a, b) => scoreLeverage(b) - scoreLeverage(a));
  const midCut = Math.max(1, Math.ceil(restSorted.length * 0.55));
  restSorted.forEach((p, idx) => {
    p.pitchRole = idx < midCut ? '중간계투' : '추격조';
    assigned.add(p.id);
  });

  // Ensure starters in rotationOrder carry '선발'
  for (const sid of team.rotationOrder) {
    const sp = career.players[sid];
    if (sp) sp.pitchRole = '선발';
  }
}

/**
 * 1군 출전 자격 (육성/상무/FA/은퇴/해외이적 + 포스트시즌 8월 1일 이후 웨이버 제한 포함)
 */
export function isPitcherEligibleForGame(
  career: CareerSave,
  p: Player,
  isPostseason: boolean,
  isOnNationalDuty: (p: Player) => boolean
): boolean {
  if (p.role !== '투수') return false;
  if (p.injury) return false;
  if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적' || p.rosterTier === 'FA' || p.rosterTier === '제외후보') {
    return false;
  }
  if (p.rosterTier === '육성' || isMilitaryServing(p.militaryStatus)) return false;
  if (isOnNationalDuty(p)) return false;
  if (isPostseason && p.postseasonIneligibleSeason === career.season) return false;
  return true;
}

/**
 * 선발 + 불펜 게임 플랜 수립 (기본 5선발 + 4일 휴식, 포스트시즌 3~4선발 + 유동 불펜, 대체/임시선발/오프너)
 */
export function buildRealisticPitchingPlan(
  career: CareerSave,
  teamId: TeamId,
  round: number,
  date: string,
  options: {
    isPostseason: boolean;
    isDoubleheaderGame2?: boolean;
    isOnNationalDuty: (p: Player) => boolean;
  }
): PitcherGamePlan {
  assignTeamBullpenRolesInPlace(career, teamId);

  const tState = career.teams[teamId];
  const { isPostseason, isDoubleheaderGame2 = false, isOnNationalDuty } = options;

  const eligibleFirstTeam = Object.values(career.players).filter(
    (p) =>
      p.teamId === teamId &&
      p.rosterTier === '1군' &&
      isPitcherEligibleForGame(career, p, isPostseason, isOnNationalDuty)
  );

  // Regular season: 5-man rotation, minimum 4 days rest preferred
  // Postseason: 3~4-man rotation (top 4 starters), minimum 3 days rest allowed
  const rawRotation = tState.rotationOrder
    .map((id) => career.players[id])
    .filter(
      (p): p is Player =>
        Boolean(p && p.rosterTier === '1군' && isPitcherEligibleForGame(career, p, isPostseason, isOnNationalDuty))
    );

  const effectiveRotation = isPostseason
    ? rawRotation.slice(0, Math.min(4, Math.max(3, rawRotation.length)))
    : rawRotation.slice(0, 5);

  const minStarterRestDays = isPostseason ? 3 : 4;

  let starter: Player | undefined;
  let starterUsageType: PitcherGamePlan['starterUsageType'] = '정규선발';
  let openerFollower: Player | undefined;

  if (effectiveRotation.length > 0) {
    // Check scheduled starter first
    const scheduledIdx = tState.nextStarterIdx % effectiveRotation.length;
    const scheduled = effectiveRotation[scheduledIdx];
    const schedRest = getPitcherRestDays(scheduled, date, round);
    const schedSlumpingBadly =
      !isPostseason &&
      scheduled.fatigue >= 68 &&
      scheduled.form <= -3 &&
      effectiveRotation.length >= 4;

    if (schedRest >= minStarterRestDays && scheduled.fatigue < 78 && !schedSlumpingBadly) {
      starter = scheduled;
      tState.nextStarterIdx = (scheduledIdx + 1) % effectiveRotation.length;
    } else {
      // Find another rested rotation starter (e.g., after doubleheader or compressed schedule)
      let foundIdx = -1;
      for (let offset = 1; offset < effectiveRotation.length; offset++) {
        const candIdx = (scheduledIdx + offset) % effectiveRotation.length;
        const cand = effectiveRotation[candIdx];
        if (getPitcherRestDays(cand, date, round) >= minStarterRestDays && cand.fatigue < 75) {
          foundIdx = candIdx;
          break;
        }
      }

      if (foundIdx >= 0) {
        starter = effectiveRotation[foundIdx];
        tState.nextStarterIdx = (foundIdx + 1) % effectiveRotation.length;
      } else if (!isPostseason) {
        // Regular season: look for 대체 선발 (2군/1군 비로테이션 SP) -> 임시 선발 (롱릴리프) -> 오프너
        const rotIds = new Set(tState.rotationOrder);
        const substituteSp = Object.values(career.players)
          .filter(
            (p) =>
              p.teamId === teamId &&
              (p.rosterTier === '1군' || p.rosterTier === '2군') &&
              !rotIds.has(p.id) &&
              (p.position === 'SP' || p.pitchRole === '선발') &&
              isPitcherEligibleForGame(career, p, false, isOnNationalDuty) &&
              getPitcherRestDays(p, date, round) >= 4 &&
              p.fatigue < 50
          )
          .sort((a, b) => b.ability - a.ability)[0];

        if (substituteSp) {
          starter = substituteSp;
          starterUsageType = isDoubleheaderGame2 ? '임시선발' : '대체선발';
        } else {
          // Check long reliever as spot starter (임시선발) or opener (오프너)
          const freshLongReliever = eligibleFirstTeam
            .filter(
              (p) =>
                !rotIds.has(p.id) &&
                normalizeBullpenRole(p.pitchRole) === '롱릴리프' &&
                getPitcherRestDays(p, date, round) >= 2 &&
                p.fatigue < 48
            )
            .sort((a, b) => b.ability - a.ability)[0];

          const freshOpener = eligibleFirstTeam
            .filter(
              (p) =>
                !rotIds.has(p.id) &&
                p.id !== freshLongReliever?.id &&
                (normalizeBullpenRole(p.pitchRole) === '중간계투' ||
                  normalizeBullpenRole(p.pitchRole) === '추격조' ||
                  normalizeBullpenRole(p.pitchRole) === '필승조') &&
                getPitcherRestDays(p, date, round) >= 2 &&
                (p.consecutivePitchDays ?? 0) === 0 &&
                p.fatigue < 35
            )
            .sort((a, b) => b.ability - a.ability)[0];

          if (freshOpener && freshLongReliever) {
            starter = freshOpener;
            starterUsageType = '오프너';
            openerFollower = freshLongReliever;
          } else if (freshLongReliever) {
            starter = freshLongReliever;
            starterUsageType = '임시선발';
          } else {
            // Fallback to most rested rotation starter
            const mostRested = [...effectiveRotation].sort(
              (a, b) => getPitcherRestDays(b, date, round) - getPitcherRestDays(a, date, round) || a.fatigue - b.fatigue
            )[0];
            starter = mostRested;
            tState.nextStarterIdx = (effectiveRotation.indexOf(mostRested) + 1) % effectiveRotation.length;
          }
        }
      } else {
        // Postseason: pick most rested among top 4 rotation starters
        const mostRested = [...effectiveRotation].sort(
          (a, b) => getPitcherRestDays(b, date, round) - getPitcherRestDays(a, date, round) || a.fatigue - b.fatigue
        )[0];
        starter = mostRested;
        tState.nextStarterIdx = (effectiveRotation.indexOf(mostRested) + 1) % effectiveRotation.length;
      }
    }
  }

  // Emergency fallback if rotation had 0 healthy starters
  if (!starter) {
    const rotSet = new Set(tState.rotationOrder);
    const subSp = Object.values(career.players)
      .filter(
        (p) =>
          p.teamId === teamId &&
          (p.rosterTier === '1군' || p.rosterTier === '2군') &&
          !rotSet.has(p.id) &&
          isPitcherEligibleForGame(career, p, isPostseason, isOnNationalDuty)
      )
      .sort((a, b) => (b.position === 'SP' ? 12 : 0) + b.ability - ((a.position === 'SP' ? 12 : 0) + a.ability))[0];
    starter =
      subSp ??
      eligibleFirstTeam[0] ??
      Object.values(career.players).find(
        (p) => p.teamId === teamId && isPitcherEligibleForGame(career, p, isPostseason, isOnNationalDuty)
      );
    starterUsageType = subSp?.position === 'SP' ? '대체선발' : '임시선발';
  }

  if (!starter) {
    throw new Error(`No available pitcher for team ${teamId}`);
  }

  // Build available bullpen pool
  const bullpenPool = tState.bullpenOrder
    .map((id) => career.players[id])
    .filter(
      (p): p is Player =>
        Boolean(
          p &&
            p.id !== starter!.id &&
            p.rosterTier === '1군' &&
            (isPostseason || p.gameDayActive) &&
            isPitcherEligibleForGame(career, p, isPostseason, isOnNationalDuty)
        )
    );

  // Postseason flexible bullpen: rested 4th/5th starters not pitching today can join bullpen as multi-inning weapons
  if (isPostseason) {
    for (const sid of tState.rotationOrder) {
      if (sid === starter.id) continue;
      const sp = career.players[sid];
      if (
        sp &&
        sp.rosterTier === '1군' &&
        isPitcherEligibleForGame(career, sp, true, isOnNationalDuty) &&
        !bullpenPool.some((b) => b.id === sp.id) &&
        getPitcherRestDays(sp, date, round) >= 2 &&
        sp.fatigue < 48
      ) {
        bullpenPool.push(sp);
      }
    }
  }

  const relievers =
    bullpenPool.length > 0
      ? bullpenPool
      : eligibleFirstTeam.filter((p) => p.id !== starter!.id);

  return {
    starter,
    starterUsageType,
    relievers,
    openerFollower,
  };
}

/**
 * 구단 감독 성향 기반 투수 교체 프로파일
 */
function getManagerPitchingHookProfile(career: CareerSave, teamId: TeamId): {
  starterPitchSoftCap: number;
  starterPitchHardCap: number;
  quickHookBias: number; // +값일수록 빠른 불펜 투입
  bullpenTrust: number;
} {
  const manager: Coach | undefined = (career.coaches[teamId] ?? []).find((c) => c.role === '감독');
  const style = manager?.tacticalStyle ?? '밸런스';
  const pitchChg = manager?.subRatings?.pitchingChange ?? manager?.ability ?? 75;
  const iqAdj = (pitchChg - 75) * 0.04;

  if (style === '투수전·불펜운용') {
    return {
      starterPitchSoftCap: 92,
      starterPitchHardCap: 109,
      quickHookBias: 0.28 + iqAdj,
      bullpenTrust: 1.12,
    };
  }
  if (style === '빅볼·공격야구') {
    return {
      starterPitchSoftCap: 98,
      starterPitchHardCap: 113,
      quickHookBias: -0.1 + iqAdj,
      bullpenTrust: 0.96,
    };
  }
  if (style === '육성·데이터') {
    return {
      starterPitchSoftCap: 91,
      starterPitchHardCap: 108,
      quickHookBias: 0.22 + iqAdj,
      bullpenTrust: 1.06,
    };
  }
  return {
    starterPitchSoftCap: 95,
    starterPitchHardCap: 111,
    quickHookBias: 0.05 + iqAdj,
    bullpenTrust: 1.0,
  };
}

interface PitcherInningSegment {
  player: Player;
  isStarter: boolean;
  roleUsed: string;
  outs: number;
  runs: number;
  hits: number;
  bb: number;
  so: number;
  pitches: number;
  enteredInSaveSit: boolean;
  enteredLead: number;
  exitedLead: number;
  blewSave: boolean;
  finishedGame: boolean;
  pitchedInnings: number[];
}

/**
 * 상황별 불펜투수 선택 AI (6개 보직 + 최근 등판/연투/피로도/장기 미등판 기회 부여 + 포스트시즌 유동 운용)
 */
function pickSituationalReliever(params: {
  available: Player[];
  usedIds: Set<string>;
  inning: number;
  totalInnings: number;
  currentLead: number; // teamScore - oppScore at entry
  isOpenerFollow: boolean;
  openerFollower?: Player;
  date: string;
  round: number;
  isPostseason: boolean;
  isDoubleheaderGame2: boolean;
  rng: SeededRng;
}): Player | null {
  const {
    available,
    usedIds,
    inning,
    totalInnings,
    currentLead,
    isOpenerFollow,
    openerFollower,
    date,
    round,
    isPostseason,
    isDoubleheaderGame2,
    rng,
  } = params;

  const candidates = available.filter((p) => !usedIds.has(p.id));
  if (candidates.length === 0) return null;

  if (isOpenerFollow && openerFollower && !usedIds.has(openerFollower.id)) {
    return openerFollower;
  }

  const isSaveSituation9th = inning >= totalInnings && currentLead >= 1 && currentLead <= 3;
  const is8thHoldSit = inning === totalInnings - 1 && currentLead >= 1 && currentLead <= 3;
  const isTightLeverage =
    inning >= 6 && currentLead >= 0 && currentLead <= 3;
  const isEarlyMopUp = inning <= 5;
  const isTrailingBig = currentLead <= -4;
  const isBigLead = currentLead >= 4;

  // Target role preference map for current situation
  const getRoleMatchBonus = (p: Player): number => {
    const role = p.pitchRole === '선발' ? '롱릴리프' : normalizeBullpenRole(p.pitchRole);
    if (isSaveSituation9th) {
      if (role === '마무리') return 42;
      if (role === '셋업맨') return 26;
      if (role === '필승조') return 16;
      return -10;
    }
    if (is8thHoldSit) {
      if (role === '셋업맨') return 36;
      if (role === '필승조') return 26;
      if (role === '마무리') return isPostseason ? 14 : -24; // Save closer for 9th in regular season
      if (role === '중간계투') return 10;
      return -8;
    }
    if (isTightLeverage) {
      if (role === '필승조') return 30;
      if (role === '셋업맨') return inning >= 7 ? 20 : 6;
      if (role === '중간계투') return 22;
      if (role === '마무리') return -30;
      if (role === '롱릴리프') return inning <= 6 ? 10 : -4;
      return 2;
    }
    if (isEarlyMopUp || isTrailingBig) {
      if (role === '롱릴리프') return 34;
      if (role === '추격조') return 26;
      if (role === '중간계투') return 12;
      if (role === '마무리' || role === '셋업맨' || role === '필승조') return -34;
      return 0;
    }
    if (isBigLead) {
      if (role === '추격조') return 24;
      if (role === '중간계투') return 22;
      if (role === '롱릴리프') return 14;
      if (role === '마무리' || role === '셋업맨' || role === '필승조') return -26;
      return 0;
    }
    // Close trailing (-3..-1)
    if (role === '추격조') return 26;
    if (role === '중간계투') return 24;
    if (role === '롱릴리프') return 14;
    if (role === '필승조') return inning >= 7 && currentLead === -1 ? 14 : -10;
    if (role === '마무리' || role === '셋업맨') return -24;
    return 0;
  };

  let best: Player | null = null;
  let bestScore = -99999;

  for (const p of candidates) {
    const restDays = getPitcherRestDays(p, date, round);
    const consec = p.consecutivePitchDays ?? 0;
    const recent3d = getRecent3DayPitchCount(p, date);
    const gPlayed = (p.stats as PitcherStats)?.G ?? 0;

    let score = getRoleMatchBonus(p);
    score += (p.ability - 70) * 0.65 + p.form * 1.1;

    // Anti-overuse penalties (prevent concentrating appearances on one reliever)
    score -= p.fatigue * 0.85;
    if (consec >= 3) score -= isPostseason ? 32 : 85;
    else if (consec === 2) score -= isPostseason ? 12 : 44;
    else if (consec === 1) score -= isPostseason ? 4 : 14;

    if (recent3d >= 55) score -= 35;
    else if (recent3d >= 35) score -= 18;

    // Doubleheader game 2 protection: avoid relievers who already threw heavily today
    if (isDoubleheaderGame2 && restDays === 0) {
      score -= 48;
    }

    // Balance seasonal appearance load across bullpen
    score -= gPlayed * 0.28;

    // Give rust-breaker innings to long-idle relievers (especially in non-critical situations)
    if (restDays >= 6) {
      const rustBonus = isTightLeverage || isSaveSituation9th ? 6 : 22;
      score += rustBonus;
    } else if (restDays >= 4) {
      score += 8;
    }

    // Slight organic randomness so usage varies naturally without hard-coding
    score += (rng.next() - 0.5) * 7;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best;
}

/**
 * 실제 이닝 단위 투수 운용 · 투구 수 · 교체 AI · 승리/패전/홀드/세이브/블론세이브/QS/QS+/완투/완봉/노히트노런/퍼펙트게임 시뮬레이터
 * 기존 경기 스코어보드(이닝별 득점, 총 피안타, 총 피홈런, 총 아웃카운트)와 100% 정합성을 보장합니다.
 */
export function simulateInningByInningPitchingBox(params: {
  career: CareerSave;
  teamId: TeamId;
  oppTeamId: TeamId;
  plan: PitcherGamePlan;
  teamInningRuns: number[]; // 우리 팀 공격 이닝 득점
  oppInningRuns: number[]; // 상대 팀 공격 이닝 득점 (= 우리 투수진 실점)
  totalOutsNeeded: number;
  totalHitsAllowed: number;
  totalHrAllowed: number;
  teamWon: boolean;
  teamLost: boolean;
  isHomeSide: boolean;
  round: number;
  date: string;
  isPostseason: boolean;
  isDoubleheaderGame2: boolean;
  hasRivalry: boolean;
  getPerfDelta: (p: Player) => number;
  rng: SeededRng;
}): BoxscorePitcherLine[] {
  const {
    career,
    teamId,
    plan,
    teamInningRuns,
    oppInningRuns,
    totalOutsNeeded,
    totalHitsAllowed,
    totalHrAllowed,
    teamWon,
    teamLost,
    round,
    date,
    isPostseason,
    isDoubleheaderGame2,
    hasRivalry,
    getPerfDelta,
    rng,
  } = params;

  const totalHalfInnings = Math.max(1, Math.round(totalOutsNeeded / 3));
  const hookProfile = getManagerPitchingHookProfile(career, teamId);

  // Pre-distribute opponent hits across innings consistent with oppInningRuns
  const inningHits = new Array<number>(totalHalfInnings).fill(0);
  const inningRunWeights = oppInningRuns.slice(0, totalHalfInnings).map((r) => 1.0 + r * 2.4);
  const wSum = inningRunWeights.reduce((a, b) => a + b, 0) || 1;
  let hitsRem = totalHitsAllowed;
  // Guarantee scoring innings have plausible hits first
  for (let i = 0; i < totalHalfInnings && hitsRem > 0; i++) {
    if ((oppInningRuns[i] ?? 0) > 0) {
      const guaranteed = Math.min(hitsRem, Math.max(1, Math.min(oppInningRuns[i], 2)));
      inningHits[i] += guaranteed;
      hitsRem -= guaranteed;
    }
  }
  while (hitsRem > 0) {
    let roll = rng.next() * wSum;
    let pick = 0;
    for (let i = 0; i < totalHalfInnings; i++) {
      roll -= inningRunWeights[i];
      if (roll <= 0) {
        pick = i;
        break;
      }
    }
    inningHits[pick] += 1;
    hitsRem--;
  }

  // Helper to know score before/after an inning
  const teamCumBefore = (innIdx: number) =>
    teamInningRuns.slice(0, innIdx).reduce((a, b) => a + (b ?? 0), 0);
  const oppCumBefore = (innIdx: number) =>
    oppInningRuns.slice(0, innIdx).reduce((a, b) => a + (b ?? 0), 0);

  const segments: PitcherInningSegment[] = [];
  const usedRelieverIds = new Set<string>();

  // Helper to simulate BB/SO/pitches for a pitcher's outs & hits in a slice
  const calcSliceMetrics = (
    p: Player,
    outsInSlice: number,
    hitsInSlice: number,
    runsInSlice: number,
    cumPitchesBefore: number
  ): { bb: number; so: number; pitches: number } => {
    const rep = p.pitchRepertoire;
    const ctrlBonus = p.trainingFocus === '제구' ? -0.05 : 0;
    const stuffBonus = p.trainingFocus === '구위' ? 0.11 : 0;
    const rivalryK = hasRivalry ? 0.04 : 0;
    const fatigueFactor = Math.max(0, (p.fatigue + cumPitchesBefore * 0.35 - 55) / 100);
    const cmdEffect = rep ? -(rep.command - 78) * 0.0055 : 0;
    const veloKEffect = rep
      ? (rep.avgVelocityKmh - 145) * 0.018 + (rep.breakingSharpness - 78) * 0.0065
      : 0;
    const perfDelta = getPerfDelta(p);
    const effAbil = p.ability + perfDelta * 0.55;

    const bbRatePerInning = Math.max(
      0.11,
      0.34 - (effAbil - 74) * 0.0085 + ctrlBonus + cmdEffect + fatigueFactor * 0.16
    );
    const expectedBb = (outsInSlice / 3) * bbRatePerInning + (runsInSlice >= 2 ? 0.25 : 0);
    // Keep no-hit / perfect game possibilities genuinely achievable when totalHitsAllowed === 0
    const bb =
      totalHitsAllowed === 0 && runsInSlice === 0 && rng.next() < 0.72
        ? 0
        : Math.max(
            0,
            Math.floor(expectedBb) + (rng.next() < expectedBb - Math.floor(expectedBb) ? 1 : 0)
          );

    const soRatePerInning = Math.max(
      0.42,
      0.74 + stuffBonus + rivalryK + veloKEffect + (effAbil - 74) * 0.019 - fatigueFactor * 0.12
    );
    const expectedSo = (outsInSlice / 3) * soRatePerInning;
    const so = Math.min(
      outsInSlice,
      Math.max(0, Math.floor(expectedSo) + (rng.next() < expectedSo - Math.floor(expectedSo) ? 1 : 0))
    );

    // Realistic KBO pitch count: ~15-17 pitches per clean inning, more with hits/walks/strikeouts
    const commandEfficiency = rep ? (78 - rep.command) * 0.08 : 0;
    const pitchesPerOut = 3.55 + commandEfficiency + (rng.next() - 0.45) * 0.9;
    const pitches = Math.max(
      outsInSlice * 2 + hitsInSlice + bb * 4,
      Math.round(outsInSlice * pitchesPerOut + hitsInSlice * 3.1 + bb * 4.2 + so * 0.8 + runsInSlice * 1.2)
    );

    return { bb, so, pitches };
  };

  // Start with the starting pitcher
  const starter = plan.starter;
  const starterRep = starter.pitchRepertoire;
  const starterStaminaBase =
    plan.starterUsageType === '오프너'
      ? 34
      : plan.starterUsageType === '임시선발'
      ? 72
      : plan.starterUsageType === '대체선발'
      ? 84
      : Math.max(82, Math.min(108, 92 + (starter.ability - 75) * 0.75 + ((starterRep?.command ?? 75) - 75) * 0.22 - starter.fatigue * 0.28));

  let activeSegment: PitcherInningSegment = {
    player: starter,
    isStarter: true,
    roleUsed: plan.starterUsageType === '오프너' ? '오프너' : '선발',
    outs: 0,
    runs: 0,
    hits: 0,
    bb: 0,
    so: 0,
    pitches: 0,
    enteredInSaveSit: false,
    enteredLead: 0,
    exitedLead: 0,
    blewSave: false,
    finishedGame: false,
    pitchedInnings: [],
  };
  segments.push(activeSegment);

  let starterPulled = false;

  for (let innIdx = 0; innIdx < totalHalfInnings; innIdx++) {
    const inningNo = innIdx + 1;
    const innRuns = oppInningRuns[innIdx] ?? 0;
    const innHits = inningHits[innIdx] ?? 0;
    const leadAtInningStart = teamCumBefore(innIdx) - oppCumBefore(innIdx);
    const leadAtInningEnd = teamCumBefore(innIdx + 1) - oppCumBefore(innIdx + 1);

    // Decide BEFORE starting this inning whether to change pitchers
    if (!starterPulled) {
      let shouldPullStarterBeforeInning = false;
      const pc = activeSegment.pitches;
      const runsSoFar = activeSegment.runs;
      const isSpecialBid =
        inningNo >= 7 &&
        activeSegment.runs === 0 &&
        (activeSegment.hits === 0 || (inningNo >= 8 && activeSegment.hits <= 3));

      if (plan.starterUsageType === '오프너') {
        if (inningNo >= 3 || pc >= 35 || runsSoFar >= 2) {
          shouldPullStarterBeforeInning = true;
        }
      } else if (plan.starterUsageType === '임시선발') {
        if (inningNo >= 5 || pc >= 76 || runsSoFar >= 4) {
          shouldPullStarterBeforeInning = true;
        }
      } else {
        // Standard / Substitute starter hook AI:
        // 1) Hard cap >= 110 pitches unless special milestone (shutout/no-hitter/perfect game bid)
        if (pc >= hookProfile.starterPitchHardCap && !(isSpecialBid && pc < 120)) {
          shouldPullStarterBeforeInning = true;
        }
        // 2) Soft review window 90~100+ pitches
        else if (pc >= hookProfile.starterPitchSoftCap) {
          const fatigueStress = Math.max(0, (starter.fatigue + pc * 0.45 - 62) * 0.012);
          const runStress = runsSoFar >= 4 ? 0.38 : runsSoFar >= 3 ? 0.18 : runsSoFar === 0 ? -0.22 : 0;
          const abilityBonus = (starter.ability - 78) * 0.018;
          const specialHold = isSpecialBid ? -0.45 : 0;
          const pullProb = Math.min(
            0.96,
            Math.max(
              0.08,
              0.46 +
                (pc - hookProfile.starterPitchSoftCap) * 0.032 +
                fatigueStress +
                runStress +
                hookProfile.quickHookBias -
                abilityBonus +
                specialHold
            )
          );
          if (rng.next() < pullProb) shouldPullStarterBeforeInning = true;
        }
        // 3) Blowup / heavy damage before 90 pitches
        else if (runsSoFar >= 6 && inningNo >= 4) {
          shouldPullStarterBeforeInning = true;
        } else if (runsSoFar >= 5 && inningNo >= 5 && rng.next() < 0.72) {
          shouldPullStarterBeforeInning = true;
        } else if (pc >= starterStaminaBase && inningNo >= 6 && rng.next() < 0.65) {
          shouldPullStarterBeforeInning = true;
        } else if (inningNo >= 7 && !isSpecialBid && pc >= 84 && rng.next() < 0.56 + hookProfile.quickHookBias) {
          shouldPullStarterBeforeInning = true;
        } else if (inningNo >= 8 && !isSpecialBid && rng.next() < 0.84) {
          shouldPullStarterBeforeInning = true;
        } else if (inningNo === totalHalfInnings && leadAtInningStart >= 1 && leadAtInningStart <= 3 && !isSpecialBid) {
          // Close 9th save situation: usually hand to closer unless shutout/no-hit CG bid
          shouldPullStarterBeforeInning = pc >= 82 || rng.next() < 0.88;
        }
      }

      if (shouldPullStarterBeforeInning && plan.relievers.some((r) => !usedRelieverIds.has(r.id))) {
        starterPulled = true;
        activeSegment.exitedLead = leadAtInningStart;
        const nextRel = pickSituationalReliever({
          available: plan.relievers,
          usedIds: usedRelieverIds,
          inning: inningNo,
          totalInnings: totalHalfInnings,
          currentLead: leadAtInningStart,
          isOpenerFollow: plan.starterUsageType === '오프너' && segments.length === 1,
          openerFollower: plan.openerFollower,
          date,
          round,
          isPostseason,
          isDoubleheaderGame2,
          rng,
        });
        if (nextRel) {
          usedRelieverIds.add(nextRel.id);
          const inSaveSit = inningNo >= 7 && leadAtInningStart >= 1 && leadAtInningStart <= 3;
          activeSegment = {
            player: nextRel,
            isStarter: false,
            roleUsed:
              nextRel.pitchRole === '선발' ? '불펜지원' : normalizeBullpenRole(nextRel.pitchRole),
            outs: 0,
            runs: 0,
            hits: 0,
            bb: 0,
            so: 0,
            pitches: 0,
            enteredInSaveSit: inSaveSit,
            enteredLead: leadAtInningStart,
            exitedLead: leadAtInningStart,
            blewSave: false,
            finishedGame: false,
            pitchedInnings: [],
          };
          segments.push(activeSegment);
        } else {
          starterPulled = false;
        }
      }
    } else {
      // Reliever already on the mound: decide whether to bring a fresh reliever for this inning
      const role = normalizeBullpenRole(activeSegment.player.pitchRole);
      const isLongArm =
        role === '롱릴리프' ||
        activeSegment.player.id === plan.openerFollower?.id ||
        activeSegment.roleUsed === '불펜지원';
      const maxRelOuts = isLongArm ? 6 : role === '추격조' && leadAtInningStart <= -4 ? 6 : 3;
      const mustBringCloser =
        inningNo === totalHalfInnings &&
        leadAtInningStart >= 1 &&
        leadAtInningStart <= 3 &&
        role !== '마무리';
      const mustBringSetup =
        inningNo === totalHalfInnings - 1 &&
        leadAtInningStart >= 1 &&
        leadAtInningStart <= 3 &&
        (role === '롱릴리프' || role === '추격조' || role === '중간계투');

      const shouldChangeReliever =
        mustBringCloser ||
        mustBringSetup ||
        activeSegment.outs >= maxRelOuts ||
        activeSegment.pitches >= (isLongArm ? 42 : 24) ||
        activeSegment.runs >= 2 ||
        (activeSegment.outs >= 3 && (!isLongArm || rng.next() < 0.78));

      if (shouldChangeReliever) {
        const nextRel = pickSituationalReliever({
          available: plan.relievers,
          usedIds: usedRelieverIds,
          inning: inningNo,
          totalInnings: totalHalfInnings,
          currentLead: leadAtInningStart,
          isOpenerFollow: false,
          date,
          round,
          isPostseason,
          isDoubleheaderGame2,
          rng,
        });
        if (nextRel) {
          activeSegment.exitedLead = leadAtInningStart;
          usedRelieverIds.add(nextRel.id);
          const inSaveSit = inningNo >= 7 && leadAtInningStart >= 1 && leadAtInningStart <= 3;
          activeSegment = {
            player: nextRel,
            isStarter: false,
            roleUsed:
              nextRel.pitchRole === '선발' ? '불펜지원' : normalizeBullpenRole(nextRel.pitchRole),
            outs: 0,
            runs: 0,
            hits: 0,
            bb: 0,
            so: 0,
            pitches: 0,
            enteredInSaveSit: inSaveSit,
            enteredLead: leadAtInningStart,
            exitedLead: leadAtInningStart,
            blewSave: false,
            finishedGame: false,
            pitchedInnings: [],
          };
          segments.push(activeSegment);
        }
      }
    }

    // Check mid-inning pitching change (run explosion / baserunner jam / 110+ pitch mid-inning hook)
    const canMidInningHook =
      plan.relievers.some((r) => !usedRelieverIds.has(r.id)) &&
      ((!starterPulled &&
        ((innRuns >= 3 && inningNo >= 3) ||
          (activeSegment.pitches >= 96 && (innRuns >= 2 || innHits >= 2)) ||
          (activeSegment.pitches >= 106 && innHits >= 1))) ||
        (starterPulled && innRuns >= 3 && activeSegment.pitches >= 16));

    if (canMidInningHook) {
      const outsBeforeHook = rng.int(1, 2);
      const outsAfterHook = 3 - outsBeforeHook;
      const runsBefore = Math.max(1, Math.min(innRuns, Math.ceil(innRuns * 0.72)));
      const runsAfter = innRuns - runsBefore;
      const hitsBefore = Math.max(Math.min(innHits, 1), Math.min(innHits, Math.ceil(innHits * 0.7)));
      const hitsAfter = innHits - hitsBefore;

      const m1 = calcSliceMetrics(activeSegment.player, outsBeforeHook, hitsBefore, runsBefore, activeSegment.pitches);
      activeSegment.outs += outsBeforeHook;
      activeSegment.runs += runsBefore;
      activeSegment.hits += hitsBefore;
      activeSegment.bb += m1.bb;
      activeSegment.so += m1.so;
      activeSegment.pitches += m1.pitches;
      activeSegment.pitchedInnings.push(inningNo);

      const midLead = leadAtInningStart - runsBefore;
      activeSegment.exitedLead = midLead;
      if (activeSegment.enteredInSaveSit && activeSegment.enteredLead > 0 && midLead <= 0) {
        activeSegment.blewSave = true;
      }

      if (!starterPulled) starterPulled = true;
      const fireman = pickSituationalReliever({
        available: plan.relievers,
        usedIds: usedRelieverIds,
        inning: inningNo,
        totalInnings: totalHalfInnings,
        currentLead: midLead,
        isOpenerFollow: plan.starterUsageType === '오프너' && segments.length === 1,
        openerFollower: plan.openerFollower,
        date,
        round,
        isPostseason,
        isDoubleheaderGame2,
        rng,
      });

      if (fireman) {
        usedRelieverIds.add(fireman.id);
        const firemanSaveSit = inningNo >= 7 && midLead >= 1 && midLead <= 3;
        activeSegment = {
          player: fireman,
          isStarter: false,
          roleUsed:
            fireman.pitchRole === '선발' ? '불펜지원' : normalizeBullpenRole(fireman.pitchRole),
          outs: 0,
          runs: 0,
          hits: 0,
          bb: 0,
          so: 0,
          pitches: 0,
          enteredInSaveSit: firemanSaveSit,
          enteredLead: midLead,
          exitedLead: leadAtInningEnd,
          blewSave: false,
          finishedGame: false,
          pitchedInnings: [],
        };
        segments.push(activeSegment);
      }

      const m2 = calcSliceMetrics(activeSegment.player, outsAfterHook, hitsAfter, runsAfter, activeSegment.pitches);
      activeSegment.outs += outsAfterHook;
      activeSegment.runs += runsAfter;
      activeSegment.hits += hitsAfter;
      activeSegment.bb += m2.bb;
      activeSegment.so += m2.so;
      activeSegment.pitches += m2.pitches;
      activeSegment.pitchedInnings.push(inningNo);
      activeSegment.exitedLead = leadAtInningEnd;
      if (activeSegment.enteredInSaveSit && activeSegment.enteredLead > 0 && leadAtInningEnd <= 0) {
        activeSegment.blewSave = true;
      }
    } else {
      // Full inning pitched by activeSegment
      const m = calcSliceMetrics(activeSegment.player, 3, innHits, innRuns, activeSegment.pitches);
      activeSegment.outs += 3;
      activeSegment.runs += innRuns;
      activeSegment.hits += innHits;
      activeSegment.bb += m.bb;
      activeSegment.so += m.so;
      activeSegment.pitches += m.pitches;
      activeSegment.pitchedInnings.push(inningNo);
      activeSegment.exitedLead = leadAtInningEnd;
      if (activeSegment.enteredInSaveSit && activeSegment.enteredLead > 0 && leadAtInningEnd <= 0) {
        activeSegment.blewSave = true;
      }
    }
  }

  // Mark game finisher
  if (segments.length > 0) {
    segments[segments.length - 1].finishedGame = true;
  }

  // Build BoxscorePitcherLine array
  const lines: BoxscorePitcherLine[] = segments.map((seg) => ({
    playerId: seg.player.id,
    name: seg.player.name,
    GS: seg.isStarter ? 1 : 0,
    outs: seg.outs,
    W: 0,
    L: 0,
    HLD: 0,
    SV: 0,
    BS: seg.blewSave ? 1 : 0,
    QS: 0,
    QSP: 0,
    CG: 0,
    SHO: 0,
    NH: 0,
    PG: 0,
    H: seg.hits,
    BB: seg.bb,
    SO: seg.so,
    ER: 0,
    R: seg.runs,
    HR: 0,
    PC: seg.pitches,
    pitchRoleUsed: seg.roleUsed,
    starterUsageType: seg.isStarter ? plan.starterUsageType : undefined,
  }));

  // Reconcile exact totalOutsNeeded safety check
  const outDiff = totalOutsNeeded - lines.reduce((s, l) => s + l.outs, 0);
  if (outDiff !== 0 && lines.length > 0) {
    lines[lines.length - 1].outs = Math.max(0, lines[lines.length - 1].outs + outDiff);
  }

  // Distribute HRs strictly to pitchers who allowed runs & hits
  let hrsLeft = totalHrAllowed;
  let hrGuard = 0;
  while (hrsLeft > 0 && hrGuard < 100) {
    hrGuard++;
    const withRoomAndHits = lines.filter((l) => l.R - l.HR > 0 && l.H - l.HR > 0);
    const withRoom = lines.filter((l) => l.R - l.HR > 0);
    const candidates = withRoomAndHits.length > 0 ? withRoomAndHits : withRoom;
    if (candidates.length === 0) break;
    const target = rng.pick(candidates);
    target.HR += 1;
    hrsLeft--;
  }
  if (hrsLeft > 0 && lines.length > 0) {
    lines[0].HR += hrsLeft;
    lines[0].R = Math.max(lines[0].R, lines[0].HR);
  }

  // Earned runs strictly bounded by [HR, R]
  for (const l of lines) {
    const unearned = rng.next() < 0.085 && l.R > l.HR ? 1 : 0;
    l.ER = Math.min(l.R, Math.max(l.HR, l.R - unearned));
  }

  // Official Starter Milestones: QS, QS+, CG, SHO, NH, PG
  const stLine = lines[0];
  if (stLine && stLine.GS === 1) {
    if (stLine.outs >= 18 && stLine.ER <= 3) stLine.QS = 1;
    if (stLine.outs >= 21 && stLine.ER <= 3) stLine.QSP = 1;
    if (lines.length === 1 && stLine.outs >= totalOutsNeeded) {
      stLine.CG = 1;
      if (stLine.R === 0) stLine.SHO = 1;
      if (stLine.H === 0 && stLine.outs >= 27) {
        stLine.NH = 1;
        if (stLine.BB === 0 && stLine.R === 0) {
          stLine.PG = 1;
        }
      }
    }
  }

  // Official W, L, HLD, SV, BS attribution
  const finalMargin =
    teamInningRuns.reduce((a, b) => a + (b ?? 0), 0) -
    oppInningRuns.reduce((a, b) => a + (b ?? 0), 0);

  if (teamWon) {
    // Check if starter qualifies for win (5+ IP and team held lead upon exit without losing it)
    const stSeg = segments[0];
    let leadLostAfterStarter = false;
    const stLastInn = stSeg.pitchedInnings[stSeg.pitchedInnings.length - 1] ?? 0;
    for (let i = stLastInn; i < totalHalfInnings; i++) {
      if (teamCumBefore(i + 1) - oppCumBefore(i + 1) <= 0) {
        leadLostAfterStarter = true;
        break;
      }
    }

    if (stLine.outs >= 15 && stSeg.exitedLead > 0 && !leadLostAfterStarter) {
      stLine.W = 1;
    } else if (lines.length > 1) {
      // Find reliever on mound when decisive go-ahead lead was taken (or best middle reliever)
      let winIdx = -1;
      for (let i = lines.length - 1; i >= 1; i--) {
        const seg = segments[i];
        if (seg.exitedLead > 0 && seg.enteredLead <= 0) {
          winIdx = i;
          break;
        }
      }
      if (winIdx < 0) {
        // Fallback: non-finisher middle/setup reliever with best performance
        const maxIdx = finalMargin <= 3 && lines.length > 2 ? lines.length - 2 : lines.length - 1;
        winIdx = maxIdx >= 1 ? maxIdx : 1;
        for (let i = 1; i <= maxIdx; i++) {
          if (lines[i].ER === 0 && lines[i].outs >= lines[winIdx].outs) {
            winIdx = i;
          }
        }
      }
      lines[winIdx].W = 1;
    } else {
      stLine.W = 1;
    }

    // Save & Hold attribution
    if (lines.length >= 2) {
      const lastIdx = lines.length - 1;
      const lastSeg = segments[lastIdx];
      const lastLine = lines[lastIdx];
      const qualifiesForSave =
        lastLine.W === 0 &&
        lastSeg.finishedGame &&
        ((lastSeg.enteredLead >= 1 && lastSeg.enteredLead <= 3 && lastLine.outs >= 1) ||
          lastLine.outs >= 9);
      if (qualifiesForSave) {
        lastLine.SV = 1;
      }

      for (let i = 1; i < lastIdx; i++) {
        const seg = segments[i];
        const l = lines[i];
        if (
          l.W === 0 &&
          l.SV === 0 &&
          !seg.blewSave &&
          seg.enteredLead >= 1 &&
          seg.enteredLead <= 3 &&
          seg.exitedLead > 0 &&
          l.outs >= 1
        ) {
          l.HLD = 1;
        }
      }
    }
  } else if (teamLost) {
    // Pitcher who gave up the decisive go-ahead run gets the L
    let loseIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (segments[i].enteredLead >= 0 && segments[i].exitedLead < 0 && lines[i].R > 0) {
        loseIdx = i;
        break;
      }
    }
    if (loseIdx < 0) {
      loseIdx = 0;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].R > lines[loseIdx].R) loseIdx = i;
      }
    }
    lines[loseIdx].L = 1;
  }

  return lines;
}

/**
 * 경기 종료 후 투수 연투/피로도/최근 등판일/부상 위험 갱신 (등판하지 않은 투수는 휴식 회복)
 */
export function updatePitcherWorkloadAfterGameInPlace(
  career: CareerSave,
  teamId: TeamId,
  date: string,
  round: number,
  pitchedLines: BoxscorePitcherLine[],
  options?: { isRainout?: boolean; isDoubleheaderGame2?: boolean }
): void {
  const pitchedMap = new Map(pitchedLines.map((l) => [l.playerId, l]));

  for (const p of Object.values(career.players)) {
    const line = pitchedMap.get(p.id);
    if (!line && (p.teamId !== teamId || p.role !== '투수' || p.rosterTier !== '1군')) continue;
    if (line) {
      const prevDate = p.lastPitchedDate;
      const dayGap = diffCalendarDays(prevDate, date);
      const isBackToBack =
        dayGap !== null ? dayGap <= 1 : round - p.lastPitchedRound <= 1;

      p.consecutivePitchDays = isBackToBack ? (p.consecutivePitchDays ?? 0) + 1 : 1;
      p.lastPitchedRound = round;
      p.lastPitchedDate = date;
      if (line.starterUsageType) {
        p.starterUsageType = line.starterUsageType;
      }

      // Append to recent pitch log (keep last 10 outings)
      const prevLog = p.recentPitchLog ?? [];
      const nextLog = [
        {
          date,
          round,
          pitches: line.PC,
          outs: line.outs,
          isStarter: line.GS > 0,
        },
        ...prevLog,
      ].slice(0, 10);
      p.recentPitchLog = nextLog;
      p.recent3DayPitches = getRecent3DayPitchCount(p, date);

      // Realistic fatigue increment: starters ~36-48 on 95-110 pitches, relievers ~10-20 on 15-28 pitches
      const consecExtra = (p.consecutivePitchDays ?? 1) >= 3 ? 14 : (p.consecutivePitchDays ?? 1) === 2 ? 6 : 0;
      const dhExtra = options?.isDoubleheaderGame2 ? 5 : 0;
      const fatigueAdd =
        line.GS > 0
          ? Math.round(line.PC * 0.44 + consecExtra)
          : Math.round(line.PC * 0.52 + consecExtra + dhExtra);
      p.fatigue = Math.min(100, p.fatigue + fatigueAdd);
    } else {
      // Did not pitch today -> natural rest recovery & reset consecutive streak
      const dayGap = diffCalendarDays(p.lastPitchedDate, date);
      if (dayGap === null || dayGap >= 1) {
        p.consecutivePitchDays = 0;
      }
      const isStarter = p.pitchRole === '선발' || career.teams[teamId]?.rotationOrder.includes(p.id);
      const restRecover = (isStarter ? 12 : 16) + (options?.isRainout ? 8 : 0);
      p.fatigue = Math.max(0, p.fatigue - restRecover);
      p.recent3DayPitches = getRecent3DayPitchCount(p, date);
    }
  }
}

/**
 * 휴식일(월요일 등 이동일) · 우천 취소 시 전 구단 투수 피로도 자동 회복
 */
export function applyOffDayPitcherRecoveryInPlace(
  career: CareerSave,
  offDaysCount: number
): void {
  if (offDaysCount <= 0) return;
  for (const p of Object.values(career.players)) {
    if (p.role !== '투수' || p.rosterTier !== '1군') continue;
    p.consecutivePitchDays = 0;
    p.fatigue = Math.max(0, p.fatigue - offDaysCount * 14);
  }
}

/**
 * 성적 기반 선발 경쟁 · 불펜 보직 변동 · 투수 보직 불만도 연동 (전 10구단 동일 적용)
 */
export function evaluatePitcherCompetitionAndRolesInPlace(
  career: CareerSave,
  date: string
): void {
  if (career.phase !== 'REGULAR_SEASON' || career.gamesPlayed < 18) return;

  for (const tid of TEAM_IDS) {
    const team = career.teams[tid];
    if (!team) continue;
    const isUser = tid === career.playerTeamId;

    // 1) Bullpen role promotion/demotion based on ERA & Blown Saves
    const bullpen = team.bullpenOrder
      .map((id) => career.players[id])
      .filter((p): p is Player => Boolean(p && p.rosterTier === '1군' && !p.injury));

    // Check long-idle relievers (>= 12 team games without pitching -> mild dissatisfaction)
    for (const bp of bullpen) {
      const idleRounds = career.gamesPlayed - bp.lastPitchedRound;
      if (idleRounds >= 12 && bp.ability >= 68 && !bp.injury) {
        bp.dissatisfaction = Math.min(100, (bp.dissatisfaction ?? 15) + 4);
      } else if (idleRounds <= 4 && (bp.dissatisfaction ?? 15) > 15) {
        bp.dissatisfaction = Math.max(0, (bp.dissatisfaction ?? 15) - 2);
      }
    }

    // For AI clubs, dynamically adjust closer / setup / high-leverage roles based on performance
    if (!isUser && bullpen.length >= 4) {
      const closer = bullpen.find((p) => p.pitchRole === '마무리');
      const setup = bullpen.find((p) => p.pitchRole === '셋업맨');
      if (closer && setup) {
        const clStats = closer.stats as PitcherStats;
        const clOuts = clStats.outs ?? 0;
        const clEra = clOuts >= 27 ? calcERA(clStats.ER, clOuts) : null;
        const clBs = clStats.BS ?? 0;
        const suStats = setup.stats as PitcherStats;
        const suOuts = suStats.outs ?? 0;
        const suEra = suOuts >= 24 ? calcERA(suStats.ER, suOuts) : null;

        if (
          ((clEra !== null && clEra >= 5.5) || clBs >= 4) &&
          suEra !== null &&
          suEra <= 3.1
        ) {
          closer.pitchRole = '필승조';
          closer.dissatisfaction = Math.min(100, (closer.dissatisfaction ?? 20) + 12);
          setup.pitchRole = '마무리';
          setup.dissatisfaction = Math.max(0, (setup.dissatisfaction ?? 20) - 8);
          if (!career.newsFeed) career.newsFeed = [];
          career.newsFeed.unshift({
            id: `news-closer-swap-${tid}-${career.gamesPlayed}`,
            season: career.season,
            date,
            category: '타구단소식',
            headline: `[불펜 보직 변경] ${KBO_TEAMS[tid].shortName}, 마무리 ${closer.name} → ${setup.name} 교체`,
            body: `최근 부진한 ${closer.name} 대신 안정적인 피칭을 선보인 ${setup.name}이(가) 새 마무리 보직을 맡게 되었습니다.`,
            teamId: tid,
          });
        }
      }
    }

    // 2) Starter rotation competition: struggling 5th starter vs strong 1군/2군 alt starter
    const rotPitchers = team.rotationOrder
      .map((id) => career.players[id])
      .filter((p): p is Player => Boolean(p && p.rosterTier === '1군' && !p.injury));
    if (!isUser && rotPitchers.length >= 5) {
      const weakestSp = rotPitchers
        .filter((p) => {
          const ps = p.stats as PitcherStats;
          const era = (ps.outs ?? 0) >= 60 ? calcERA(ps.ER, ps.outs) : null;
          return era !== null && era >= 5.75;
        })
        .sort((a, b) => (calcERA((b.stats as PitcherStats).ER, (b.stats as PitcherStats).outs) ?? 0) - (calcERA((a.stats as PitcherStats).ER, (a.stats as PitcherStats).outs) ?? 0))[0];

      const challenger = Object.values(career.players)
        .filter(
          (p) =>
            p.teamId === tid &&
            p.role === '투수' &&
            (p.rosterTier === '1군' || p.rosterTier === '2군') &&
            !team.rotationOrder.includes(p.id) &&
            !p.injury &&
            (p.position === 'SP' || normalizeBullpenRole(p.pitchRole) === '롱릴리프') &&
            p.ability >= (weakestSp?.ability ?? 99) - 2
        )
        .sort((a, b) => b.ability + b.form * 2 - (a.ability + a.form * 2))[0];

      if (weakestSp && challenger) {
        const idx = team.rotationOrder.indexOf(weakestSp.id);
        if (idx >= 0) {
          challenger.rosterTier = '1군';
          challenger.gameDayActive = true;
          challenger.pitchRole = '선발';
          team.bullpenOrder = team.bullpenOrder.filter((id) => id !== challenger.id);
          team.rotationOrder[idx] = challenger.id;

          weakestSp.pitchRole = '롱릴리프';
          weakestSp.dissatisfaction = Math.min(100, (weakestSp.dissatisfaction ?? 20) + 14);
          if (!team.bullpenOrder.includes(weakestSp.id)) {
            team.bullpenOrder.push(weakestSp.id);
          }
        }
      }
    }
  }
}

/**
 * 사용자 구단 불펜 투수 보직 수동 변경 (마무리/셋업맨/필승조/중간계투/추격조/롱릴리프) + 보직 강등 시 불만도 소폭 반영
 */
export function setTeamBullpenPitcherRole(
  career: CareerSave,
  playerId: string,
  newRole: BullpenRoleType
): CareerSave {
  const next = JSON.parse(JSON.stringify(career)) as CareerSave;
  const p = next.players[playerId];
  if (!p || p.teamId !== next.playerTeamId || p.role !== '투수') {
    throw new Error('보직을 변경할 투수를 찾을 수 없습니다.');
  }

  const prevRole = normalizeBullpenRole(p.pitchRole);
  const rankMap: Record<BullpenRoleType, number> = {
    마무리: 6,
    셋업맨: 5,
    필승조: 4,
    중간계투: 3,
    롱릴리프: 2,
    추격조: 1,
  };

  // If assigning 마무리, demote previous 마무리 to 셋업맨 cleanly
  if (newRole === '마무리') {
    for (const id of next.teams[next.playerTeamId].bullpenOrder) {
      const other = next.players[id];
      if (other && other.id !== p.id && other.pitchRole === '마무리') {
        other.pitchRole = '셋업맨';
        other.dissatisfaction = Math.min(100, (other.dissatisfaction ?? 20) + 10);
      }
    }
  }

  p.pitchRole = newRole;
  p.pitchRoleLockedByUser = true;

  const delta = rankMap[newRole] - rankMap[prevRole];
  if (delta <= -2) {
    p.dissatisfaction = Math.min(100, (p.dissatisfaction ?? 20) + 10);
  } else if (delta >= 2) {
    p.dissatisfaction = Math.max(0, (p.dissatisfaction ?? 20) - 6);
  }

  next.updatedAt = new Date().toISOString();
  return next;
}
