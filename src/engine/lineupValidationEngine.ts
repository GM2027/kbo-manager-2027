import { TEAM_IDS } from '../data/kboTeams';
import { CareerSave, Player, Position, TeamId } from '../types/kbo';
import { isMilitaryServing } from './militaryEngine';
import {
  ALL_FIELD_POSITIONS,
  ALL_HITTER_LINEUP_POSITIONS,
  computeEffectiveFieldingAtPosition,
  ensurePlayerPositionProficiencyInPlace,
  getPositionProficiency,
} from './positionEngine';

export const REQUIRED_STARTING_POSITIONS: Position[] = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
];

export interface LineupDuplicatePositionIssue {
  position: Position;
  playerIds: string[];
  playerNames: string[];
}

export interface LineupInvalidPlayerIssue {
  playerId: string;
  playerName: string;
  reason: string;
}

export interface LineupUnfamiliarWarning {
  playerId: string;
  playerName: string;
  position: Position;
  proficiency: number;
  penalty: number;
}

export interface StartingLineupValidationReport {
  teamId: TeamId;
  isValid: boolean;
  starterCount: number;
  duplicatePositions: LineupDuplicatePositionIssue[];
  missingPositions: Position[];
  duplicatePlayerIds: string[];
  invalidPlayerIssues: LineupInvalidPlayerIssue[];
  unfamiliarWarnings: LineupUnfamiliarWarning[];
  summary: string;
}

function isLineupEligibleBatter(career: CareerSave, p: Player | undefined, teamId: TeamId): p is Player {
  if (!p) return false;
  if (p.teamId !== teamId || p.role !== '타자') return false;
  if (p.rosterTier !== '1군') return false;
  if (isMilitaryServing(p.militaryStatus)) return false;
  if (p.overseasTrainingLocation) return false;
  const onNt =
    p.nationalTeamDuty != null &&
    career.gamesPlayed >= p.nationalTeamDuty.startRound &&
    career.gamesPlayed < p.nationalTeamDuty.endRound;
  if (onNt) return false;
  return true;
}

/**
 * 구단의 현재 1~9번 선발 타자 라인업 정합성 전수 검증
 * - 9명 전원 유효 1군 야수 여부
 * - 선수 ID 중복 여부
 * - 9개 고유 포지션(C, 1B, 2B, 3B, SS, LF, CF, RF, DH) 중복 및 누락 여부
 * - 미숙 포지션 출전 수비 페널티 경고
 */
export function validateStartingLineup(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): StartingLineupValidationReport {
  const ts = career.teams[teamId];
  const rawOrder = ts?.lineupOrder ?? [];
  const posMap = ts?.lineupPositions ?? {};

  const seenIds = new Set<string>();
  const duplicatePlayerIds: string[] = [];
  const invalidPlayerIssues: LineupInvalidPlayerIssue[] = [];
  const unfamiliarWarnings: LineupUnfamiliarWarning[] = [];
  const byPos = new Map<Position, { id: string; name: string }[]>();

  for (const pid of rawOrder) {
    if (seenIds.has(pid)) {
      duplicatePlayerIds.push(pid);
      continue;
    }
    seenIds.add(pid);

    const p = career.players[pid];
    if (!p) {
      invalidPlayerIssues.push({ playerId: pid, playerName: pid, reason: '존재하지 않는 선수 ID' });
      continue;
    }
    if (p.teamId !== teamId) {
      invalidPlayerIssues.push({ playerId: pid, playerName: p.name, reason: '타 구단 소속 선수' });
      continue;
    }
    if (p.role !== '타자') {
      invalidPlayerIssues.push({ playerId: pid, playerName: p.name, reason: '투수는 야수 타순에 배치 불가' });
      continue;
    }
    if (p.rosterTier !== '1군') {
      invalidPlayerIssues.push({
        playerId: pid,
        playerName: p.name,
        reason: `1군 엔트리 미등록 (${p.rosterTier})`,
      });
    } else if (isMilitaryServing(p.militaryStatus)) {
      invalidPlayerIssues.push({ playerId: pid, playerName: p.name, reason: '군 복무 중 출전 불가' });
    }

    const assignedPos = (posMap[pid] ?? p.position) as Position;
    if (!ALL_HITTER_LINEUP_POSITIONS.includes(assignedPos)) {
      invalidPlayerIssues.push({
        playerId: pid,
        playerName: p.name,
        reason: `유효하지 않은 수비 포지션(${assignedPos})`,
      });
      continue;
    }

    const list = byPos.get(assignedPos) ?? [];
    list.push({ id: pid, name: p.name });
    byPos.set(assignedPos, list);

    if (assignedPos !== 'DH') {
      const eff = computeEffectiveFieldingAtPosition(p, assignedPos);
      if (eff.proficiency < 60) {
        unfamiliarWarnings.push({
          playerId: pid,
          playerName: p.name,
          position: assignedPos,
          proficiency: eff.proficiency,
          penalty: eff.penalty,
        });
      }
    }
  }

  const duplicatePositions: LineupDuplicatePositionIssue[] = [];
  for (const [pos, entries] of byPos.entries()) {
    if (entries.length > 1) {
      duplicatePositions.push({
        position: pos,
        playerIds: entries.map((e) => e.id),
        playerNames: entries.map((e) => e.name),
      });
    }
  }

  const missingPositions = REQUIRED_STARTING_POSITIONS.filter((pos) => !byPos.has(pos));

  const isValid =
    rawOrder.length === 9 &&
    duplicatePlayerIds.length === 0 &&
    invalidPlayerIssues.length === 0 &&
    duplicatePositions.length === 0 &&
    missingPositions.length === 0;

  let summary = '선발 9포지션(C·1B·2B·3B·SS·LF·CF·RF·DH) 정상 · 중복 없음';
  if (!isValid) {
    const parts: string[] = [];
    if (duplicatePositions.length > 0) {
      parts.push(
        `포지션 중복 ${duplicatePositions
          .map((d) => `${d.position}(${d.playerNames.join('·')})`)
          .join(', ')}`
      );
    }
    if (missingPositions.length > 0) {
      parts.push(`누락 포지션 ${missingPositions.join('·')}`);
    }
    if (rawOrder.length !== 9) {
      parts.push(`선발 인원 ${rawOrder.length}/9명`);
    }
    if (invalidPlayerIssues.length > 0) {
      parts.push(`출전 불가 ${invalidPlayerIssues.length}명`);
    }
    if (duplicatePlayerIds.length > 0) {
      parts.push(`선수 중복 ${duplicatePlayerIds.length}명`);
    }
    summary = parts.join(' / ');
  }

  return {
    teamId,
    isValid,
    starterCount: rawOrder.length,
    duplicatePositions,
    missingPositions,
    duplicatePlayerIds,
    invalidPlayerIssues,
    unfamiliarWarnings,
    summary,
  };
}

/**
 * 주어진 9명(또는 N명) 선발 타자들에 대해 중복 없는 1:1 최적 포지션 배정(C, 1B, 2B, 3B, SS, LF, CF, RF, DH) 산출
 * - 비트마스크 DP(N <= 9 -> 최대 512상태)로 수학적 전역 최적 1:1 매칭을 0.05ms 이내에 보장
 * - lockedPlayerId/lockedPosition 지정 시 해당 선수의 포지션을 고정한 채 나머지 8명의 중복을 완전 해소
 */
export function solveUniqueLineupPositions(
  players: Player[],
  currentPosMap: Record<string, Position>,
  options?: {
    lockedPlayerId?: string;
    lockedPosition?: Position;
  }
): Record<string, Position> {
  const n = Math.min(9, players.length);
  if (n === 0) return {};

  const targetPlayers = players.slice(0, n);
  const allPositions = REQUIRED_STARTING_POSITIONS.slice(0, 9);
  const lockedIdx =
    options?.lockedPlayerId && options?.lockedPosition && ALL_HITTER_LINEUP_POSITIONS.includes(options.lockedPosition)
      ? targetPlayers.findIndex((p) => p.id === options.lockedPlayerId)
      : -1;
  const lockedPosIdx =
    lockedIdx >= 0 && options?.lockedPosition
      ? allPositions.indexOf(options.lockedPosition)
      : -1;

  const scoreMatrix: number[][] = targetPlayers.map((p, pIdx) => {
    const curPos = currentPosMap[p.id];
    return allPositions.map((pos, posIdx) => {
      if (lockedIdx >= 0) {
        if (pIdx === lockedIdx && posIdx !== lockedPosIdx) return -1e7;
        if (pIdx !== lockedIdx && posIdx === lockedPosIdx) return -1e7;
      }
      if (pos === 'DH') {
        const isCurrentBonus = curPos === 'DH' ? 14 : 0;
        const dhAffinity =
          p.position === 'DH'
            ? 26
            : p.position === '1B'
            ? 14
            : p.position === 'LF' || p.position === 'RF' || p.position === '3B'
            ? 8
            : p.position === 'C'
            ? 2
            : 0;
        return 62 + isCurrentBonus + dhAffinity;
      }

      const prof = getPositionProficiency(p, pos);
      const eff = computeEffectiveFieldingAtPosition(p, pos);
      const isPrimary = p.position === pos;
      const isSecondary = !isPrimary && (p.secondaryPositions?.includes(pos) || prof >= 60);
      const isCurrentBonus = curPos === pos ? 16 : 0;
      const catcherPenalty = pos === 'C' && prof < 45 ? -260 : 0;
      const ssPenalty = pos === 'SS' && prof < 45 ? -75 : 0;
      const primaryBonus = isPrimary ? 34 : 0;
      const secondaryBonus = isSecondary ? 16 : 0;
      const unfamiliarPenalty = !isPrimary && !isSecondary ? (60 - prof) * 1.4 : 0;

      return (
        prof * 0.9 +
        eff.effectiveFielding * 0.3 +
        primaryBonus +
        secondaryBonus +
        isCurrentBonus -
        eff.penalty * 1.1 -
        unfamiliarPenalty +
        catcherPenalty +
        ssPenalty
      );
    });
  });

  // Exact Bitmask DP over 9 positions (2^9 = 512 states)
  const maskCount = 1 << 9;
  const dp = new Float64Array(maskCount).fill(-1e12);
  const parentPos = new Int8Array(maskCount).fill(-1);
  const parentMask = new Int16Array(maskCount).fill(-1);
  dp[0] = 0;

  // Assign player by player (pIdx = popcount(mask))
  for (let mask = 0; mask < maskCount; mask++) {
    if (dp[mask] <= -1e11) continue;
    let pIdx = 0;
    let tmp = mask;
    while (tmp > 0) {
      pIdx += tmp & 1;
      tmp >>= 1;
    }
    if (pIdx >= n) continue;

    for (let posIdx = 0; posIdx < 9; posIdx++) {
      if ((mask & (1 << posIdx)) !== 0) continue;
      const nextMask = mask | (1 << posIdx);
      const val = dp[mask] + scoreMatrix[pIdx][posIdx];
      if (val > dp[nextMask]) {
        dp[nextMask] = val;
        parentPos[nextMask] = posIdx;
        parentMask[nextMask] = mask;
      }
    }
  }

  // Pick best final mask with popcount === n
  let bestFinalMask = -1;
  let bestFinalVal = -1e12;
  for (let mask = 0; mask < maskCount; mask++) {
    let bits = 0;
    let tmp = mask;
    while (tmp > 0) {
      bits += tmp & 1;
      tmp >>= 1;
    }
    if (bits === n && dp[mask] > bestFinalVal) {
      bestFinalVal = dp[mask];
      bestFinalMask = mask;
    }
  }

  const assigned: Record<string, Position> = {};
  if (bestFinalMask >= 0) {
    let cur = bestFinalMask;
    for (let pIdx = n - 1; pIdx >= 0; pIdx--) {
      const posIdx = parentPos[cur];
      assigned[targetPlayers[pIdx].id] = allPositions[posIdx >= 0 ? posIdx : pIdx];
      cur = parentMask[cur];
      if (cur < 0) break;
    }
  } else {
    targetPlayers.forEach((p, idx) => {
      assigned[p.id] = allPositions[idx];
    });
  }

  return assigned;
}

/**
 * 구단의 선발 9명 라인업과 포지션 맵(lineupPositions)을 검증하고 중복/누락이 있으면 자동 보정합니다.
 * - 기존 타순(1~9번)을 최대한 유지하면서 중복 포지션 0건 · 누락 포지션 0건을 보장합니다.
 * - 선발에 포수(C)가 전혀 없고 1군 벤치에 주 포지션 포수가 있다면 자동으로 1명을 포함시켜 포수 누락을 방지합니다.
 */
export function reconcileTeamLineupPositionsInPlace(
  career: CareerSave,
  teamId: TeamId,
  options?: {
    lockedPlayerId?: string;
    lockedPosition?: Position;
    forceResolveIfValid?: boolean;
  }
): { changed: boolean; report: StartingLineupValidationReport } {
  const ts = career.teams[teamId];
  if (!ts) {
    return {
      changed: false,
      report: validateStartingLineup(career, teamId),
    };
  }

  const beforeReport = validateStartingLineup(career, teamId);
  if (beforeReport.isValid && !options?.lockedPlayerId && !options?.forceResolveIfValid) {
    // Clean stale keys from lineupPositions not in lineupOrder
    const activeSet = new Set(ts.lineupOrder);
    let cleaned = false;
    for (const k of Object.keys(ts.lineupPositions ?? {})) {
      if (!activeSet.has(k)) {
        delete ts.lineupPositions[k];
        cleaned = true;
      }
    }
    return { changed: cleaned, report: beforeReport };
  }

  // 1) Remove duplicates and ineligible IDs from lineupOrder (preserving order)
  const seen = new Set<string>();
  const validStarters: Player[] = [];
  for (const pid of ts.lineupOrder ?? []) {
    if (seen.has(pid)) continue;
    const p = career.players[pid];
    if (isLineupEligibleBatter(career, p, teamId)) {
      ensurePlayerPositionProficiencyInPlace(p);
      validStarters.push(p);
      seen.add(pid);
      if (validStarters.length >= 9) break;
    }
  }

  // 2) Fill missing slots up to 9 from eligible 1군 bench (prioritizing missing positions like C/SS/CF)
  const benchEligible = Object.values(career.players)
    .filter((p) => isLineupEligibleBatter(career, p, teamId) && !seen.has(p.id))
    .sort((a, b) => b.ability - a.ability);

  while (validStarters.length < 9 && benchEligible.length > 0) {
    const occupiedNow = new Set<Position>(
      validStarters.map((p) => (ts.lineupPositions?.[p.id] ?? p.position) as Position)
    );
    const missingNow = ALL_FIELD_POSITIONS.filter((pos) => !occupiedNow.has(pos));
    let pickIdx = 0;
    if (missingNow.length > 0) {
      // Prioritize a missing catcher first, then any natural fit for a missing field slot
      const needC = missingNow.includes('C');
      const idx = benchEligible.findIndex((b) =>
        needC
          ? b.position === 'C' || getPositionProficiency(b, 'C') >= 60
          : missingNow.includes(b.position) ||
            missingNow.some((mp) => getPositionProficiency(b, mp) >= 65)
      );
      if (idx >= 0) pickIdx = idx;
    }
    const chosen = benchEligible.splice(pickIdx, 1)[0];
    ensurePlayerPositionProficiencyInPlace(chosen);
    chosen.gameDayActive = true;
    validStarters.push(chosen);
    seen.add(chosen.id);
  }

  // 3) If still fewer than 9 healthy 1군 batters (e.g., severe injury wave), keep available 1군 batters even if injured
  if (validStarters.length < 9) {
    const backupFirst = Object.values(career.players)
      .filter(
        (p) =>
          p.teamId === teamId &&
          p.role === '타자' &&
          p.rosterTier === '1군' &&
          !isMilitaryServing(p.militaryStatus) &&
          !seen.has(p.id)
      )
      .sort((a, b) => b.ability - a.ability);
    for (const b of backupFirst) {
      if (validStarters.length >= 9) break;
      ensurePlayerPositionProficiencyInPlace(b);
      validStarters.push(b);
      seen.add(b.id);
    }
  }

  // 4) Solve exact 1:1 unique position assignment across the 9 starters
  const solvedMap = solveUniqueLineupPositions(validStarters, ts.lineupPositions ?? {}, {
    lockedPlayerId: options?.lockedPlayerId,
    lockedPosition: options?.lockedPosition,
  });

  ts.lineupOrder = validStarters.map((p) => p.id);
  ts.lineupPositions = solvedMap;

  // Keep benchOrder synced cleanly with 1군 non-starter hitters
  const starterSet = new Set(ts.lineupOrder);
  const allFirstHitters = Object.values(career.players)
    .filter((p) => p.teamId === teamId && p.role === '타자' && p.rosterTier === '1군')
    .map((p) => p.id);
  ts.benchOrder = allFirstHitters.filter((id) => !starterSet.has(id));

  return {
    changed: true,
    report: validateStartingLineup(career, teamId),
  };
}

/**
 * KBO 10개 구단 전체 선발 라인업 포지션 중복 일괄 검증 및 보정
 */
export function reconcileAllTeamsLineupPositionsInPlace(career: CareerSave): {
  fixedTeams: TeamId[];
  reports: Record<TeamId, StartingLineupValidationReport>;
} {
  const fixedTeams: TeamId[] = [];
  const reports = {} as Record<TeamId, StartingLineupValidationReport>;
  for (const tid of TEAM_IDS) {
    const res = reconcileTeamLineupPositionsInPlace(career, tid);
    if (res.changed) fixedTeams.push(tid);
    reports[tid] = res.report;
  }
  return { fixedTeams, reports };
}

/**
 * 경기 당일 실제 출전하는 9명 선발 타자(GameStarterSlot[])의 수비 포지션 중복을 최종 차단
 * (부상 대체·포수 휴식·플래툰 교체 직후 호출)
 */
export function reconcileGameStarterPositionsInPlace<
  T extends { player: Player; position: Position }
>(starters: T[]): void {
  if (starters.length === 0) return;
  const seenPos = new Set<Position>();
  let hasDupOrInvalid = false;
  for (const s of starters) {
    if (!ALL_HITTER_LINEUP_POSITIONS.includes(s.position) || seenPos.has(s.position)) {
      hasDupOrInvalid = true;
      break;
    }
    seenPos.add(s.position);
  }
  if (!hasDupOrInvalid && starters.length === 9 && seenPos.size === 9) {
    return;
  }

  const curMap: Record<string, Position> = {};
  for (const s of starters) {
    curMap[s.player.id] = s.position;
  }
  const solved = solveUniqueLineupPositions(
    starters.map((s) => s.player),
    curMap
  );
  for (const s of starters) {
    s.position = solved[s.player.id] ?? s.position;
  }
}

/**
 * 사용자 구단의 선발 라인업 포지션 중복을 안전하게 복제·수정하는 UI 액션
 */
export function fixMyTeamLineupPositions(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  report: StartingLineupValidationReport;
  changed: boolean;
} {
  const backupSnapshot: CareerSave = JSON.parse(JSON.stringify(career));
  const next: CareerSave = JSON.parse(JSON.stringify(career));
  const { changed, report } = reconcileTeamLineupPositionsInPlace(next, next.playerTeamId, {
    forceResolveIfValid: false,
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, report, changed };
}
