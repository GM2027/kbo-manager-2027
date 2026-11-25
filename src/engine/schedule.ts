import { computeTravelDistanceKm, TEAM_IDS } from '../data/kboTeams';
import { ScheduledSeries, TeamId } from '../types/kbo';
import { SeededRng } from './rng';

export function addDaysIso(baseDate: string, days: number): string {
  const [y, m, d] = baseDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function getDayOfWeekUtc(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
}

export interface ScheduleValidationReport {
  valid: boolean;
  totalLeagueGames: number;
  gamesPerTeam: Record<TeamId, number>;
  homeGamesPerTeam: Record<TeamId, number>;
  awayGamesPerTeam: Record<TeamId, number>;
  mondayGamesCount: number;
  duplicateDateConflicts: number;
  minOpponentGames: number;
  maxOpponentGames: number;
  issues: string[];
}

/**
 * 생성/가져온 정규시즌 일정의 무결성을 검증:
 * - 팀당 144경기, 리그 전체 720경기
 * - 상대 구단별 16경기, 홈·원정 균형
 * - 월요일 원칙적 휴식일 준수
 * - 동일 날짜 중복 경기 방지
 */
export function validateScheduleIntegrity(schedule: ScheduledSeries[]): ScheduleValidationReport {
  const gamesPerTeam = {} as Record<TeamId, number>;
  const homeGamesPerTeam = {} as Record<TeamId, number>;
  const awayGamesPerTeam = {} as Record<TeamId, number>;
  const pairCounts: Record<string, number> = {};
  const teamDateSeen = new Set<string>();

  for (const tid of TEAM_IDS) {
    gamesPerTeam[tid] = 0;
    homeGamesPerTeam[tid] = 0;
    awayGamesPerTeam[tid] = 0;
  }

  let totalLeagueGames = 0;
  let mondayGamesCount = 0;
  let duplicateDateConflicts = 0;
  const issues: string[] = [];

  for (const s of schedule) {
    for (const dt of s.dates) {
      if (getDayOfWeekUtc(dt) === 1 && !s.isMakeupWindow) {
        mondayGamesCount += 1;
      }
      for (const m of s.matchups) {
        totalLeagueGames += 1;
        gamesPerTeam[m.away] = (gamesPerTeam[m.away] ?? 0) + 1;
        gamesPerTeam[m.home] = (gamesPerTeam[m.home] ?? 0) + 1;
        awayGamesPerTeam[m.away] = (awayGamesPerTeam[m.away] ?? 0) + 1;
        homeGamesPerTeam[m.home] = (homeGamesPerTeam[m.home] ?? 0) + 1;

        const key = [m.away, m.home].sort().join('__');
        pairCounts[key] = (pairCounts[key] ?? 0) + 1;

        const aKey = `${dt}::${m.away}`;
        const hKey = `${dt}::${m.home}`;
        if (teamDateSeen.has(aKey)) duplicateDateConflicts += 1;
        if (teamDateSeen.has(hKey)) duplicateDateConflicts += 1;
        teamDateSeen.add(aKey);
        teamDateSeen.add(hKey);
      }
    }
  }

  const pairVals = Object.values(pairCounts);
  const minOpponentGames = pairVals.length > 0 ? Math.min(...pairVals) : 0;
  const maxOpponentGames = pairVals.length > 0 ? Math.max(...pairVals) : 0;

  if (totalLeagueGames !== 720) {
    issues.push(`리그 전체 경기 수 불일치: ${totalLeagueGames}경기 (기준 720경기)`);
  }
  if (minOpponentGames !== 16 || maxOpponentGames !== 16) {
    issues.push(`상대 구단별 경기 수 불균형: ${minOpponentGames}~${maxOpponentGames}경기 (기준 16경기)`);
  }
  if (duplicateDateConflicts > 0) {
    issues.push(`동일 날짜 중복 경기 충돌 ${duplicateDateConflicts}건`);
  }
  if (mondayGamesCount > 0) {
    issues.push(`정규 편성 월요일 경기 ${mondayGamesCount}일 포함`);
  }

  return {
    valid: issues.length === 0,
    totalLeagueGames,
    gamesPerTeam,
    homeGamesPerTeam,
    awayGamesPerTeam,
    mondayGamesCount,
    duplicateDateConflicts,
    minOpponentGames,
    maxOpponentGames,
    issues,
  };
}

/**
 * 실제 KBO 정규시즌 일정 엔진 (예상 일정 생성):
 * - 팀당 정확히 144경기, 리그 전체 720경기
 * - 9개 상대 구단별 정확히 16경기 (홈 8경기 · 원정 8경기 -> 총 홈 72경기 / 원정 72경기 완벽 균형)
 *   - 3연전 4순환(36시리즈 = 108경기: 상대별 홈 2시리즈 + 원정 2시리즈 = 6H/6A)
 *   - 2연전 2순환(18시리즈 = 36경기: 상대별 홈 1시리즈 + 원정 1시리즈 = 2H/2A)
 * - 개막전 주말 2연전(토·일) + 월요일 원칙적 휴식일 + 화~목 / 금~일 편성 (정규 월요일 경기 0건)
 * - 5월 5일 어린이날 특별 시리즈 & 7월 중순 올스타 휴식기(4일) 반영
 * - 구단 간 이동 거리(km) 산출 및 선수 피로도 연동
 * - 동일 날짜 중복 경기 생성 원천 차단
 */
export function generateRegularSeasonSchedule(
  seed: number,
  startDate = '2027-03-27',
  lockedFirstThreeSeries?: ScheduledSeries[]
): ScheduledSeries[] {
  const rng = new SeededRng(seed + 303);

  // 기존 보존 세이브(lockedFirstThreeSeries 존재)는 하위 호환성 유지
  if (lockedFirstThreeSeries && lockedFirstThreeSeries.length > 0) {
    return generateLegacyLockedSchedule(rng, startDate, lockedFirstThreeSeries);
  }

  const baseOrder = rng.shuffle(TEAM_IDS);
  const cycleRounds: { away: TeamId; home: TeamId }[][] = [];

  const fixed = baseOrder[0];
  const rotating = baseOrder.slice(1); // 9 teams

  for (let r = 0; r < 9; r++) {
    const arr = [fixed, ...rotating];
    const pairings: { away: TeamId; home: TeamId }[] = [];
    for (let i = 0; i < 5; i++) {
      const a = arr[i];
      const b = arr[9 - i];
      const flipHome = (r + i) % 2 === 1;
      pairings.push(flipHome ? { away: b, home: a } : { away: a, home: b });
    }
    cycleRounds.push(pairings);
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  // 54개 시리즈 슬롯 구성:
  // - 2연전 18시리즈 (Cycle 4 정방향 9 + Cycle 5 역방향 9 = 2H/2A per opponent)
  // - 3연전 36시리즈 (Cycle 0 정, Cycle 1 역, Cycle 2 정, Cycle 3 역 = 6H/6A per opponent)
  // 개막전 주말(토·일)은 2연전으로 배치해 월요일 경기를 원천 차단하고, 나머지는 시즌 후반(8~9월) 잔여/2연전 주간에 배치!
  interface SeriesBlueprint {
    games: 2 | 3;
    matchups: { away: TeamId; home: TeamId }[];
    isMakeupWindow: boolean;
  }

  const twoGameSeries: SeriesBlueprint[] = [];
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let r = 0; r < 9; r++) {
      const matchups = cycleRounds[r].map((m) =>
        cycle % 2 === 1 ? { away: m.home, home: m.away } : { ...m }
      );
      twoGameSeries.push({ games: 2, matchups, isMakeupWindow: cycle === 1 });
    }
  }

  const threeGameSeries: SeriesBlueprint[] = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    for (let r = 0; r < 9; r++) {
      const matchups = cycleRounds[r].map((m) =>
        cycle % 2 === 1 ? { away: m.home, home: m.away } : { ...m }
      );
      threeGameSeries.push({ games: 3, matchups, isMakeupWindow: false });
    }
  }

  // 개막전 2연전 1개 -> 정규 3연전 36개 (화~목 / 금~일) -> 후반기 2연전 17개 (잔여/2연전 편성)
  const orderedBlueprints: SeriesBlueprint[] = [
    twoGameSeries[0],
    ...threeGameSeries,
    ...twoGameSeries.slice(1),
  ];

  const seasonYear = Number(startDate.slice(0, 4)) || 2027;
  const childrenDayIso = `${seasonYear}-05-05`;
  const allStarTargetIso = `${seasonYear}-07-15`;

  const seriesList: ScheduledSeries[] = [];
  let currentDate = startDate;
  // 토요일 개막이 아닌 월요일이면 화요일로 이동
  if (getDayOfWeekUtc(currentDate) === 1) {
    currentDate = addDaysIso(currentDate, 1);
  }

  let gameRound = 1;
  let allStarInserted = false;
  const usedTeamDates = new Set<string>();

  for (let idx = 0; idx < orderedBlueprints.length; idx++) {
    const bp = orderedBlueprints[idx];
    let hasMondayRestBefore = false;
    let isAllStarBreakBefore = false;

    // 7월 중순 올스타전 휴식기 (4~5일 휴식 후 금/화 재개)
    if (!allStarInserted && currentDate >= allStarTargetIso) {
      currentDate = addDaysIso(currentDate, 5);
      while (getDayOfWeekUtc(currentDate) === 1) {
        currentDate = addDaysIso(currentDate, 1);
      }
      isAllStarBreakBefore = true;
      allStarInserted = true;
    }

    // 시리즈 내 단 하루라도 월요일(1)이 포함되지 않도록 시작일 보정
    // (어린이날 5월 5일이 월요일인 경우를 제외하고 원칙적 월요일 휴식일 적용)
    let guard = 0;
    while (guard < 7) {
      const candidateDates: string[] = [];
      for (let g = 0; g < bp.games; g++) {
        candidateDates.push(addDaysIso(currentDate, g));
      }
      const hasMonday = candidateDates.some(
        (d) => getDayOfWeekUtc(d) === 1 && d !== childrenDayIso
      );
      const hasConflict = candidateDates.some((d) =>
        bp.matchups.some(
          (m) => usedTeamDates.has(`${d}::${m.away}`) || usedTeamDates.has(`${d}::${m.home}`)
        )
      );
      if (!hasMonday && !hasConflict) {
        break;
      }
      if (getDayOfWeekUtc(currentDate) === 1) {
        hasMondayRestBefore = true;
      }
      currentDate = addDaysIso(currentDate, 1);
      guard += 1;
    }

    // 직전 날짜가 월요일이었으면 월요일 휴식 플래그 표시
    if (getDayOfWeekUtc(addDaysIso(currentDate, -1)) === 1) {
      hasMondayRestBefore = true;
    }

    const dates: string[] = [];
    for (let g = 0; g < bp.games; g++) {
      const d = addDaysIso(currentDate, g);
      dates.push(d);
      for (const m of bp.matchups) {
        usedTeamDates.add(`${d}::${m.away}`);
        usedTeamDates.add(`${d}::${m.home}`);
      }
    }

    const isChildrenDaySeries = dates.includes(childrenDayIso);
    const avgTravelKm = Math.round(
      bp.matchups.reduce((s, m) => s + computeTravelDistanceKm(m.away, m.home), 0) /
        Math.max(1, bp.matchups.length)
    );

    seriesList.push({
      seriesIndex: idx + 1,
      startRound: gameRound,
      endRound: gameRound + bp.games - 1,
      dates,
      matchups: bp.matchups,
      completedRounds: 0,
      hasMondayRestBefore,
      isAllStarBreakBefore,
      isChildrenDaySeries,
      isMakeupWindow: bp.isMakeupWindow || idx >= orderedBlueprints.length - 6,
      travelDistanceKm: avgTravelKm,
      scheduleSource: 'PROJECTED',
    });

    // 다음 시리즈 시작일 계산 (2연전 후반부에는 이동/휴식 1일 여유)
    const lastDate = dates[dates.length - 1];
    let nextDate = addDaysIso(lastDate, 1);
    if (getDayOfWeekUtc(nextDate) === 1) {
      nextDate = addDaysIso(nextDate, 1);
    } else if (bp.games === 2 && idx > 0 && idx >= orderedBlueprints.length - 14) {
      // 잔여 경기 편성 주간: 2연전 사이 이동 휴식일 반영
      nextDate = addDaysIso(nextDate, 1);
      if (getDayOfWeekUtc(nextDate) === 1) {
        nextDate = addDaysIso(nextDate, 1);
      }
    }
    currentDate = nextDate;
    gameRound += bp.games;
  }

  return seriesList;
}

/**
 * 우천 취소 경기를 향후 비어있는 잔여 경기일(또는 월요일 예비일)로 재편성한다.
 * 동일 날짜에 해당 두 팀의 중복 경기가 없는 가장 빠른 유효 날짜를 반환한다.
 */
export function findNextMakeupDate(
  schedule: ScheduledSeries[],
  awayTeam: TeamId,
  homeTeam: TeamId,
  afterDate: string
): string {
  const occupied = new Set<string>();
  let lastRegularDate = afterDate;
  for (const s of schedule) {
    for (const d of s.dates) {
      if (d > lastRegularDate) lastRegularDate = d;
      for (const m of s.matchups) {
        occupied.add(`${d}::${m.away}`);
        occupied.add(`${d}::${m.home}`);
      }
    }
  }

  // 1차: 시즌 후반(9월 이후) 두 팀 모두 경기가 없는 날 탐색
  const sepStart = `${afterDate.slice(0, 4)}-09-01`;
  let cursor = afterDate > sepStart ? addDaysIso(afterDate, 3) : sepStart;
  for (let i = 0; i < 45; i++) {
    const d = addDaysIso(cursor, i);
    if (!occupied.has(`${d}::${awayTeam}`) && !occupied.has(`${d}::${homeTeam}`)) {
      return d;
    }
  }
  return addDaysIso(lastRegularDate, 1);
}

/**
 * 기존 2026 보존 세이브(lockedFirstThreeSeries) 하위 호환용 생성기
 */
function generateLegacyLockedSchedule(
  rng: SeededRng,
  startDate: string,
  lockedFirstThreeSeries: ScheduledSeries[]
): ScheduledSeries[] {
  const seriesList: ScheduledSeries[] = [];
  for (let i = 0; i < lockedFirstThreeSeries.length; i++) {
    const s = lockedFirstThreeSeries[i];
    const maxKm = Math.max(
      0,
      ...s.matchups.map((m) => computeTravelDistanceKm(m.away, m.home))
    );
    seriesList.push({
      ...s,
      dates: [...s.dates],
      matchups: s.matchups.map((m) => ({ ...m })),
      hasMondayRestBefore: i > 0 && i % 2 === 1,
      travelDistanceKm: maxKm,
      scheduleSource: 'PROJECTED',
    });
  }

  const startSeriesIdx = lockedFirstThreeSeries.length + 1;
  const lastLockedDate =
    lockedFirstThreeSeries[lockedFirstThreeSeries.length - 1].dates[
      lockedFirstThreeSeries[lockedFirstThreeSeries.length - 1].dates.length - 1
    ] ?? startDate;
  let currentDate = addDaysIso(lastLockedDate, 1);
  if (getDayOfWeekUtc(currentDate) === 1) {
    currentDate = addDaysIso(currentDate, 1);
  }

  const baseOrder = rng.shuffle(TEAM_IDS);
  const cycleRounds: { away: TeamId; home: TeamId }[][] = [];
  const fixed = baseOrder[0];
  const rotating = baseOrder.slice(1);
  for (let r = 0; r < 9; r++) {
    const arr = [fixed, ...rotating];
    const pairings: { away: TeamId; home: TeamId }[] = [];
    for (let i = 0; i < 5; i++) {
      const a = arr[i];
      const b = arr[9 - i];
      const flipHome = (r + i) % 2 === 1;
      pairings.push(flipHome ? { away: b, home: a } : { away: a, home: b });
    }
    cycleRounds.push(pairings);
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  let seriesIdx = startSeriesIdx;
  let roundCursor = 0;
  let gameRound = (startSeriesIdx - 1) * 3 + 1;

  while (seriesIdx <= 48) {
    const cycleNum = Math.floor(roundCursor / 9);
    const roundInCycle = roundCursor % 9;
    const rawMatchups = cycleRounds[roundInCycle];
    const matchups = rawMatchups.map((m) =>
      cycleNum % 2 === 1 ? { away: m.home, home: m.away } : { ...m }
    );

    let hasMondayRestBefore = false;
    let isAllStarBreakBefore = false;
    if (seriesIdx === 29) {
      currentDate = addDaysIso(currentDate, 4);
      isAllStarBreakBefore = true;
    }
    while (
      getDayOfWeekUtc(currentDate) === 1 ||
      getDayOfWeekUtc(addDaysIso(currentDate, 1)) === 1 ||
      getDayOfWeekUtc(addDaysIso(currentDate, 2)) === 1
    ) {
      if (getDayOfWeekUtc(currentDate) === 1) hasMondayRestBefore = true;
      currentDate = addDaysIso(currentDate, 1);
    }

    const d1 = currentDate;
    const d2 = addDaysIso(currentDate, 1);
    const d3 = addDaysIso(currentDate, 2);
    const avgTravelKm = Math.round(
      matchups.reduce((s, m) => s + computeTravelDistanceKm(m.away, m.home), 0) /
        Math.max(1, matchups.length)
    );

    seriesList.push({
      seriesIndex: seriesIdx,
      startRound: gameRound,
      endRound: gameRound + 2,
      dates: [d1, d2, d3],
      matchups,
      completedRounds: 0,
      hasMondayRestBefore,
      isAllStarBreakBefore,
      isMakeupWindow: seriesIdx >= 46,
      travelDistanceKm: avgTravelKm,
      scheduleSource: 'PROJECTED',
    });

    currentDate = addDaysIso(d3, 1);
    if (getDayOfWeekUtc(currentDate) === 1) {
      currentDate = addDaysIso(currentDate, 1);
    }
    seriesIdx += 1;
    gameRound += 3;
    roundCursor += 1;
  }

  return seriesList;
}
