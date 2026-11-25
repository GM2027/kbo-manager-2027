import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  BatterStats,
  CareerSave,
  DissatisfactionCause,
  DissatisfactionLevel,
  GmMeetingAction,
  PitcherStats,
  Player,
  PlayerComplaint,
  TeamId,
} from '../types/kbo';
import {
  getBenchCoachAtmosphereEffect,
  runBenchCoachPreMeetingInPlace,
} from './benchCoachEngine';
import { evaluateFranchiseStar } from './franchiseStarEngine';
import { SeededRng } from './rng';
import { getCurrentCareerDate } from './salaryCapEngine';
import { computeStandings } from './stats';

export const MEETING_COOLDOWN_DAYS = 30;
export const MEETING_MIN_DISSATISFACTION = 40;
export const WEEKLY_EVAL_MIN_GAMES_DELTA = 6;
export const WEEKLY_EVAL_MIN_DAYS_DELTA = 7;

export const GM_MEETING_ACTIONS: GmMeetingAction[] = [
  '출전 기회 검토',
  '계약 협상',
  '감독 면담',
  '트레이드 검토',
];

function cloneCareer(career: CareerSave): CareerSave {
  return JSON.parse(JSON.stringify(career)) as CareerSave;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** ISO 날짜(YYYY-MM-DD) 간 경과 일수 계산 */
export function daysBetweenIso(fromIso: string | undefined, toIso: string): number {
  if (!fromIso) return 9999;
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 9999;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 불만도 5단계 분류 (0~100)
 * 0~19: 만족 / 20~39: 보통 / 40~59: 불만 / 60~79: 높은 불만 / 80~100: 심각한 불만
 */
export function getDissatisfactionLevel(score: number): DissatisfactionLevel {
  const s = clamp(Math.round(score), 0, 100);
  if (s <= 19) return '만족';
  if (s <= 39) return '보통';
  if (s <= 59) return '불만';
  if (s <= 79) return '높은 불만';
  return '심각한 불만';
}

/**
 * 기존 세이브 호환 포함 선수 불만도(0~100) 조회
 */
export function getPlayerDissatisfaction(p: Player): number {
  if (typeof p.dissatisfaction === 'number' && Number.isFinite(p.dissatisfaction)) {
    return clamp(Math.round(p.dissatisfaction), 0, 100);
  }
  if (p.tradeRequested) return 82;
  if (p.morale === '만족') return 12;
  if (p.morale === '보통') return 26;
  if (p.morale === '불만') return 52;
  return 20;
}

/**
 * 불만도(0~100)를 기존 morale 상태와 일관되게 동기화
 */
export function syncPlayerMoraleFromDissatisfaction(p: Player): void {
  const score = getPlayerDissatisfaction(p);
  p.dissatisfaction = score;
  if (score <= 19) {
    p.morale = '만족';
  } else if (score <= 39) {
    p.morale = '보통';
  } else {
    p.morale = '불만';
  }
}

export function getPlayerGamesPlayed(p: Player): number {
  if (p.role === '타자') {
    const b = p.stats as BatterStats;
    return b.G ?? 0;
  }
  const ps = p.stats as PitcherStats;
  return ps.G ?? 0;
}

/**
 * 선수 성격(hiddenTrait / agent.persona), 나이, 팀 내 역할에 따른 불만도 민감도/회복 계수
 */
export function getPlayerDissatisfactionProfile(
  career: CareerSave,
  p: Player
): {
  roleLabel: '프랜차이즈 스타' | '핵심 주전' | '1군 로테이션' | '백업·유망주';
  gainMult: number;
  decayMult: number;
  loyaltyCushion: number; // 0..0.45 (프랜차이즈 스타·충성 성향 보정)
  isFranchiseStar: boolean;
} {
  const fStar = evaluateFranchiseStar(career, p);
  const isFranchiseStar =
    fStar.tier === '레전드' || fStar.tier === '핵심 프랜차이즈' || fStar.score >= 55;
  const teamState = p.teamId ? career.teams[p.teamId] : undefined;
  const inStarterSlot = Boolean(
    teamState &&
      (teamState.lineupOrder.includes(p.id) || teamState.rotationOrder.includes(p.id))
  );

  let roleLabel: '프랜차이즈 스타' | '핵심 주전' | '1군 로테이션' | '백업·유망주' = '백업·유망주';
  let gainMult = 0.85;
  let decayMult = 1.1;

  if (isFranchiseStar) {
    roleLabel = '프랜차이즈 스타';
    gainMult = 1.15;
    decayMult = 1.05;
  } else if (p.ability >= 80 || (inStarterSlot && p.ability >= 76)) {
    roleLabel = '핵심 주전';
    gainMult = 1.25;
    decayMult = 0.95;
  } else if (p.ability >= 72 || p.rosterTier === '1군') {
    roleLabel = '1군 로테이션';
    gainMult = 1.0;
    decayMult = 1.0;
  } else {
    roleLabel = '백업·유망주';
    gainMult = 0.72;
    decayMult = 1.15;
  }

  // 나이 보정: 전성기(25~32세)는 출전·연봉에 가장 민감, 22세 이하 신예는 인내심 높음
  if (p.age >= 25 && p.age <= 32) {
    gainMult *= 1.12;
  } else if (p.age <= 22) {
    gainMult *= 0.75;
    decayMult *= 1.15;
  } else if (p.age >= 35) {
    gainMult *= 0.95;
    decayMult *= 1.05;
  }

  // 성격(히든 특성) 보정
  const trait = p.hiddenTrait;
  if (trait === '유리몸' || trait === '슬로우스타터') {
    gainMult *= 1.15;
    decayMult *= 0.92;
  } else if (
    trait === '멘탈에이스' ||
    trait === '분위기메이커' ||
    trait === '꾸준함' ||
    trait === '철강왕'
  ) {
    gainMult *= 0.82;
    decayMult *= 1.2;
  }

  // 에이전트 성향 보정
  const persona = p.agent?.persona;
  if (persona === '강경 협상가' || persona === '시장가치 극대화' || persona === '해외진출 전문') {
    gainMult *= 1.14;
  } else if (persona === '원클럽 충성형' || persona === '장기보장 선호') {
    gainMult *= 0.85;
    decayMult *= 1.15;
  }

  // 프랜차이즈 스타 구단 충성도 및 계약 조건 별도 고려
  let loyaltyCushion = 0;
  if (isFranchiseStar) {
    loyaltyCushion += fStar.tier === '레전드' ? 0.26 : 0.18;
    if (fStar.tenureSeasons >= 8) loyaltyCushion += 0.08;
    if (p.contract.annualSalary >= 5.0 || p.contract.yearsRemaining >= 2) {
      loyaltyCushion += 0.08;
    }
  } else if (persona === '원클럽 충성형' || (p.agent?.loyaltyScore ?? 0) >= 75) {
    loyaltyCushion += 0.1;
  }

  return {
    roleLabel,
    gainMult: Number(gainMult.toFixed(2)),
    decayMult: Number(decayMult.toFixed(2)),
    loyaltyCushion: clamp(loyaltyCushion, 0, 0.45),
    isFranchiseStar,
  };
}

/**
 * 기대 연봉 대비 저평가 여부 추정 (억원 단위)
 */
function estimateFairAnnualSalary(p: Player): number {
  if (p.demandedSalaryBillion && p.demandedSalaryBillion > 0) {
    return p.demandedSalaryBillion;
  }
  if (p.ability >= 86) return 7.5;
  if (p.ability >= 82) return 4.5;
  if (p.ability >= 78) return 2.6;
  if (p.ability >= 74) return 1.4;
  return 0.6;
}

function mapCauseToComplaintReason(
  cause: DissatisfactionCause
): PlayerComplaint['reason'] {
  switch (cause) {
    case '출전 기회 부족':
      return '출장기회';
    case '2군 강등':
      return '2군강등';
    case '연봉 불만':
      return '연봉불만';
    case '감독 갈등':
      return '감독갈등';
    case '계약 문제':
      return '계약문제';
    case '보직/역할 변경':
      return '보직변경';
  }
}

/**
 * 선수의 현재 실제 출전·강등·연봉·감독·계약 상태를 진단해 활성 불만 원인 및 주간 변화량을 산출
 */
export function diagnosePlayerDissatisfaction(
  career: CareerSave,
  p: Player
): {
  causes: DissatisfactionCause[];
  rawIncrease: number;
  rawDecay: number;
} {
  if (
    !p.teamId ||
    p.rosterTier === '은퇴' ||
    p.rosterTier === '해외이적' ||
    p.rosterTier === 'FA' ||
    isMilitaryServing(p.militaryStatus) ||
    p.injury
  ) {
    return { causes: [], rawIncrease: 0, rawDecay: 4 };
  }

  const teamState = career.teams[p.teamId];
  const gamesPlayedSeason = Math.max(0, career.gamesPlayed);
  const actualG = getPlayerGamesPlayed(p);
  const causes: DissatisfactionCause[] = [];
  let rawIncrease = 0;

  const isStarterCaliber = p.ability >= 76;
  const isFirstTeamCaliber = p.ability >= 72 && p.age >= 23;

  // 1. 출전 기회 부족 (실제 경기 출전 수 반영)
  if (gamesPlayedSeason >= 12 && p.rosterTier === '1군') {
    const playRate = actualG / Math.max(1, gamesPlayedSeason);
    const inLineupOrRot =
      teamState.lineupOrder.includes(p.id) || teamState.rotationOrder.includes(p.id);

    if (p.role === '타자') {
      const expectedRate = isStarterCaliber ? 0.55 : isFirstTeamCaliber ? 0.3 : 0.08;
      if (!inLineupOrRot && playRate < expectedRate && p.ability >= 73) {
        causes.push('출전 기회 부족');
        rawIncrease += isStarterCaliber ? 10 : 6;
      }
    } else {
      const expectedRate =
        p.pitchRole === '선발'
          ? 0.12
          : isStarterCaliber
          ? 0.24
          : isFirstTeamCaliber
          ? 0.14
          : 0.04;
      if (playRate < expectedRate && p.ability >= 74) {
        causes.push('출전 기회 부족');
        rawIncrease += isStarterCaliber ? 9 : 6;
      }
    }
  }

  // 2. 2군 강등
  if (p.rosterTier === '2군') {
    const recentlyDemoted =
      typeof p.lastDemotedRound === 'number' &&
      career.gamesPlayed - p.lastDemotedRound <= 24;
    if (p.ability >= 75 || (recentlyDemoted && p.ability >= 70) || (p.age >= 27 && p.ability >= 73)) {
      causes.push('2군 강등');
      rawIncrease += p.ability >= 79 ? 13 : 8;
    }
  }

  // 3. 연봉 불만 (능력치·실적 대비 현 연봉 격차)
  if (p.category === '국내' && p.serviceYears >= 3 && p.ability >= 77) {
    const fair = estimateFairAnnualSalary(p);
    if (p.contract.annualSalary > 0 && p.contract.annualSalary < fair * 0.55) {
      causes.push('연봉 불만');
      rawIncrease += p.contract.annualSalary < fair * 0.38 ? 9 : 6;
    }
  }

  // 4. 감독 갈등 (팀 분위기 나쁨 + 성향·연패·폼 저하 복합)
  const lowAtmosphere = teamState.atmosphere === '나쁨';
  const highStress = p.form <= -3 || (p.consecutiveAppearances >= 4 && p.fatigue >= 78);
  if (
    (lowAtmosphere && p.ability >= 75 && (p.form <= -1 || p.hiddenTrait === '슬로우스타터' || p.agent?.persona === '강경 협상가')) ||
    (highStress && p.ability >= 76)
  ) {
    causes.push('감독 갈등');
    rawIncrease += lowAtmosphere && highStress ? 9 : 5;
  }

  // 5. 계약 문제 (계약 만료 임박/조정신청/미확정 상태)
  const expiringCore =
    p.category === '국내' &&
    p.contract.yearsRemaining <= 1 &&
    p.ability >= 78 &&
    gamesPlayedSeason >= 36 &&
    p.serviceYears >= 6;
  const negotiationFriction =
    p.salaryNegotiationStatus === '조정신청' || p.contract.status === '만료';
  if (negotiationFriction || (expiringCore && p.contract.annualSalary < estimateFairAnnualSalary(p) * 0.78)) {
    causes.push('계약 문제');
    rawIncrease += negotiationFriction ? 10 : 6;
  }

  // 6. 보직/역할 변경 불만 (선발->불펜 강등, 마무리->중간 강등, 주전->벤치 강등)
  if (p.roleChangeDissatisfactionNote) {
    causes.push('보직/역할 변경');
    rawIncrease += p.ability >= 78 ? 9 : 6;
  }

  // 구단 성적·순위·연승/연패 상황 반영 (하위권/연패 시 불만 상승 가속, 상위권/연승 시 완화)
  const standings = computeStandings(career.gamesLedger);
  const teamStanding = standings.find((r) => r.teamId === p.teamId);
  const isStrugglingTeam = Boolean(
    teamStanding && (teamStanding.rank >= 8 || teamStanding.streak.includes('패'))
  );
  const isWinningTeam = Boolean(
    teamStanding && (teamStanding.rank <= 3 || teamStanding.streak.includes('승'))
  );
  if (isStrugglingTeam && causes.length > 0) {
    rawIncrease += teamStanding!.rank >= 9 ? 3 : 2;
  }

  // 자연 완화 조건: 원인이 없거나 출전 기회를 꾸준히 얻고 있으면 점진적 감소
  let rawDecay = 0;
  if (causes.length === 0) {
    const inActivePlay =
      p.rosterTier === '1군' &&
      (teamState.lineupOrder.includes(p.id) ||
        teamState.rotationOrder.includes(p.id) ||
        (gamesPlayedSeason >= 6 && actualG / Math.max(1, gamesPlayedSeason) >= 0.4));
    rawDecay = inActivePlay ? 9 : 6;
    if (teamState.atmosphere === '좋음') rawDecay += 2;
    if (isWinningTeam) rawDecay += 2;
  } else if (causes.length === 1 && p.rosterTier === '1군' && (teamState.atmosphere === '좋음' || isWinningTeam)) {
    rawDecay = 2;
  }

  return {
    causes: Array.from(new Set(causes)),
    rawIncrease,
    rawDecay,
  };
}

/**
 * 2군 강등 직후 즉각적인 강등 불만 반영 (원인 중복 방지)
 */
export function recordPlayerDemotionDissatisfactionInPlace(
  career: CareerSave,
  p: Player
): void {
  const cur = getPlayerDissatisfaction(p);
  p.lastDemotedRound = career.gamesPlayed;
  const profile = getPlayerDissatisfactionProfile(career, p);
  const baseSpike = p.ability >= 80 ? 18 : p.ability >= 75 ? 12 : p.age >= 27 ? 9 : 4;
  const delta = Math.round(baseSpike * profile.gainMult * (1 - profile.loyaltyCushion * 0.35));
  p.dissatisfaction = clamp(cur + Math.max(2, delta), 0, 100);
  const set = new Set<DissatisfactionCause>(p.activeDissatisfactionCauses ?? []);
  if (p.ability >= 70 || p.age >= 25) {
    set.add('2군 강등');
  }
  p.activeDissatisfactionCauses = Array.from(set);
  syncPlayerMoraleFromDissatisfaction(p);
  if ((p.dissatisfaction ?? 0) >= MEETING_MIN_DISSATISFACTION) {
    runBenchCoachPreMeetingInPlace(career, p, getCurrentCareerDate(career).isoDate);
  }
}

/**
 * 단장 면담 가능 여부 확인:
 * - 불만도 40 이상
 * - 동일 선수 30일 쿨다운 준수
 */
export function canHoldPlayerMeeting(
  career: CareerSave,
  player: Player
): {
  allowed: boolean;
  daysRemaining: number;
  nextAvailableDate?: string;
  reason?: string;
} {
  const score = getPlayerDissatisfaction(player);
  if (score < MEETING_MIN_DISSATISFACTION) {
    return {
      allowed: false,
      daysRemaining: 0,
      reason: `불만도가 ${MEETING_MIN_DISSATISFACTION} 이상일 때만 선수 면담이 가능합니다. (현재 ${score} · ${getDissatisfactionLevel(score)})`,
    };
  }
  const today = getCurrentCareerDate(career).isoDate;
  if (player.lastMeetingDate) {
    const elapsed = daysBetweenIso(player.lastMeetingDate, today);
    if (elapsed < MEETING_COOLDOWN_DAYS) {
      const rem = MEETING_COOLDOWN_DAYS - elapsed;
      const nextDate = addDaysIso(player.lastMeetingDate, MEETING_COOLDOWN_DAYS);
      return {
        allowed: false,
        daysRemaining: rem,
        nextAvailableDate: nextDate,
        reason: `최근 면담(${player.lastMeetingDate}) 이후 30일 동안 동일 선수와 반복 면담할 수 없습니다. (${rem}일 후 가능 · ${nextDate})`,
      };
    }
  }
  return { allowed: true, daysRemaining: 0 };
}

/**
 * 단장 면담 실행 (4대 대응 선택지: 출전 기회 검토 / 계약 협상 / 감독 면담 / 트레이드 검토)
 * - 면담만으로 무조건 해결되지 않으며, 실제 후속 조치 결과를 주간 평가에서 반영
 * - 30일 동일 선수 면담 쿨다운 적용
 * - 절대 자동 이적시키지 않음
 */
export function conductGmPlayerMeeting(
  career: CareerSave,
  playerId: string,
  action: GmMeetingAction
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  beforeScore: number;
  afterScore: number;
  summary: string;
} {
  const targetOrig = career.players[playerId];
  if (!targetOrig || targetOrig.teamId !== career.playerTeamId) {
    throw new Error('우리 구단 소속 선수를 찾을 수 없습니다.');
  }
  const gate = canHoldPlayerMeeting(career, targetOrig);
  if (!gate.allowed) {
    throw new Error(gate.reason ?? '현재 선수 면담을 진행할 수 없습니다.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const p = next.players[playerId];
  const today = getCurrentCareerDate(next).isoDate;
  const beforeScore = getPlayerDissatisfaction(p);
  const profile = getPlayerDissatisfactionProfile(next, p);
  const activeCauses = new Set<DissatisfactionCause>(p.activeDissatisfactionCauses ?? []);
  if (activeCauses.size === 0) {
    for (const c of diagnosePlayerDissatisfaction(next, p).causes) {
      activeCauses.add(c);
    }
  }

  // 면담 자체가 해결을 보장하지 않음: 원인 일치 시 소폭 초기 진정(-5~-10), 불일치 시 미미(-1~-2)
  let immediateDelta = -2;
  let detailNote = '';

  if (action === '출전 기회 검토') {
    const relevant = activeCauses.has('출전 기회 부족') || activeCauses.has('2군 강등');
    immediateDelta = relevant ? -8 : -2;
    detailNote = relevant
      ? '출전 기회 확대 계획을 전달했습니다. 향후 2주간 실제 1군 출전·콜업 여부가 불만 해소를 결정합니다.'
      : '출전 기회를 언급했으나 선수의 핵심 불만 원인과 다소 어긋납니다. 실제 기용 변화가 지켜집니다.';
  } else if (action === '계약 협상') {
    const relevant = activeCauses.has('연봉 불만') || activeCauses.has('계약 문제');
    immediateDelta = relevant ? -9 : -2;
    if (profile.isFranchiseStar && relevant) immediateDelta -= 3;
    detailNote = relevant
      ? '연봉 및 계약 조건 협상 의지를 전달했습니다. 실제 연봉 조정·다년계약 체결 시 불만이 크게 완화됩니다.'
      : '계약 논의를 제안했으나 선수는 우선 현재 팀 내 입지 해결을 원하고 있습니다.';
  } else if (action === '감독 면담') {
    const relevant = activeCauses.has('감독 갈등') || activeCauses.has('출전 기회 부족');
    immediateDelta = relevant ? -8 : -3;
    detailNote = relevant
      ? '감독·코칭스태프와의 3자 소통 자리를 마련하기로 했습니다. 향후 팀 분위기와 기용 안정화가 반영됩니다.'
      : '감독과의 대화 채널을 열었으나 근본 원인(연봉/계약 등) 해결이 병행되어야 합니다.';
  } else {
    // '트레이드 검토' — 절대 자동 이적시키지 않음!
    immediateDelta = beforeScore >= 70 ? -6 : -3;
    p.tradeRequested = beforeScore >= 60 ? true : p.tradeRequested;
    detailNote =
      '선수의 트레이드 검토 요청을 접수했습니다. 자동 이적은 발생하지 않으며 단장이 트레이드 탭에서 최종 결정합니다.';
  }

  const adjustedDelta = Math.round(immediateDelta * profile.decayMult);
  // 면담 한 번으로 곧바로 0이 되거나 무조건 해결되지 않도록 상한 완화폭 제한 (-12 최대)
  const cappedDelta = Math.max(-12, Math.min(0, adjustedDelta));
  const afterScore = clamp(beforeScore + cappedDelta, 0, 100);

  p.dissatisfaction = afterScore;
  p.lastMeetingDate = today;
  p.pendingMeetingFollowUp = {
    action,
    meetingDate: today,
    meetingRound: next.gamesPlayed,
    evalAfterRound: next.gamesPlayed + 12, // 약 2주(12경기) 뒤 실제 조치 결과 검증
    startGames: getPlayerGamesPlayed(p),
    startSalary: p.contract.annualSalary,
    startContractYears: p.contract.yearsRemaining,
    startTier: p.rosterTier,
    resolved: false,
  };
  syncPlayerMoraleFromDissatisfaction(p);

  // 관련 미해결 불만 알림에 면담 기록 연동
  if (next.complaints) {
    for (const c of next.complaints) {
      if (c.playerId === p.id && !c.resolved) {
        c.dissatisfactionScore = afterScore;
        c.resolutionNote = `${today} 단장 면담(${action}) 진행 — 후속 조치 결과 대기 중`;
      }
    }
  }

  const summary = `${p.name} 단장 면담 (${action}): 불만도 ${beforeScore}→${afterScore} [${getDissatisfactionLevel(afterScore)}] · ${detailNote}`;

  if (!next.meetingHistory) next.meetingHistory = [];
  next.meetingHistory.unshift({
    id: `meet-${Date.now()}-${p.id}`,
    date: today,
    playerId: p.id,
    playerName: p.name,
    teamId: next.playerTeamId,
    action,
    beforeScore,
    afterScore,
    causesAtMeeting: Array.from(activeCauses),
    summary,
  });
  if (next.meetingHistory.length > 80) next.meetingHistory = next.meetingHistory.slice(0, 80);

  next.transactionLogs.unshift({
    id: `tx-meet-${Date.now()}-${p.id}`,
    date: today,
    type: '면담',
    teamId: next.playerTeamId,
    summary: `[단장 면담] ${p.name} (${action}) · 불만도 ${beforeScore}→${afterScore}`,
    detail: detailNote,
  });

  next.updatedAt = new Date().toISOString();
  return {
    nextCareer: next,
    backupSnapshot,
    beforeScore,
    afterScore,
    summary,
  };
}

/**
 * 계약·연봉 재협상 시 불만도 80+ 연동 거부 가능성 및 프랜차이즈 스타 충성도 보정 계산
 */
export function getReSignResistanceAssessment(
  career: CareerSave,
  p: Player
): {
  dissatisfaction: number;
  level: DissatisfactionLevel;
  refusalRiskPct: number;
  requiredPremiumMultiplier: number;
  isFranchiseStar: boolean;
  loyaltyNote: string;
} {
  const score = getPlayerDissatisfaction(p);
  const level = getDissatisfactionLevel(score);
  const profile = getPlayerDissatisfactionProfile(career, p);

  let refusalRiskPct = 0;
  let requiredPremiumMultiplier = 1.0;

  if (score >= 80) {
    const rawRisk = 48 + (score - 80) * 1.8; // 48% ~ 84%
    const cushionedRisk = rawRisk * (1 - profile.loyaltyCushion);
    refusalRiskPct = clamp(Math.round(cushionedRisk), 15, 85);
    requiredPremiumMultiplier = Number(
      (1 + (0.18 - profile.loyaltyCushion * 0.25)).toFixed(2)
    );
  } else if (score >= 60) {
    const rawRisk = 15 + (score - 60) * 1.1;
    refusalRiskPct = clamp(Math.round(rawRisk * (1 - profile.loyaltyCushion * 0.8)), 5, 40);
    requiredPremiumMultiplier = Number((1 + (0.07 - profile.loyaltyCushion * 0.1)).toFixed(2));
  }

  const loyaltyNote = profile.isFranchiseStar
    ? `프랜차이즈 스타 구단 충성도 보정 적용 (거부 위험 -${Math.round(profile.loyaltyCushion * 100)}% 완화 · 합당한 계약 조건 시 잔류 의지 높음)`
    : score >= 80
    ? '심각한 불만 상태 — 재계약 거부 및 타 구단 이적 요구 가능성 높음'
    : '정상 협상 가능 범위';

  return {
    dissatisfaction: score,
    level,
    refusalRiskPct,
    requiredPremiumMultiplier: Math.max(1.0, requiredPremiumMultiplier),
    isFranchiseStar: profile.isFranchiseStar,
    loyaltyNote,
  };
}

/**
 * 주 1회 리그 전체(사용자 + AI 9개 구단 동일 규칙) 선수 불만도 자동 평가
 * - 매 경기가 아니라 주 1회(최소 6경기 또는 7일 경과)만 실행
 * - 동일 원인 중복 생성 방지
 * - 면담 후 실제 조치 결과 검증 (이행 시 큰 완화 / 미이행 시 반등)
 * - 원인 해소 시 자연 점진 감소
 * - 불만 80+ 시 트레이드 요청·재계약 거부 가능성 상승 (절대 자동 이적 없음!)
 */
export function evaluateLeagueWeeklyDissatisfactionInPlace(
  career: CareerSave,
  _rng: SeededRng,
  dateStr?: string,
  options?: { force?: boolean }
): {
  ran: boolean;
  evaluatedPlayers: number;
  newTradeRequests: string[];
} {
  // 메인 시뮬레이션 RNG 스트림을 오염시키지 않는 독립 주간 결정론적 RNG 사용
  const localRng = new SeededRng(
    (career.season * 10007 + career.gamesPlayed * 97 + 202607) >>> 0
  );
  const today = dateStr ?? getCurrentCareerDate(career).isoDate;
  const lastRound = career.lastDissatisfactionEvalRound ?? 0;
  const gamesDelta = career.gamesPlayed - lastRound;
  const daysDelta = daysBetweenIso(career.lastDissatisfactionEvalDate, today);

  if (!options?.force) {
    const enoughGames = gamesDelta >= WEEKLY_EVAL_MIN_GAMES_DELTA;
    const enoughDays =
      Boolean(career.lastDissatisfactionEvalDate) && daysDelta >= WEEKLY_EVAL_MIN_DAYS_DELTA;
    if (!enoughGames && !enoughDays) {
      return { ran: false, evaluatedPlayers: 0, newTradeRequests: [] };
    }
  }

  career.lastDissatisfactionEvalRound = career.gamesPlayed;
  career.lastDissatisfactionEvalDate = today;
  if (!career.complaints) career.complaints = [];
  if (!career.newsFeed) career.newsFeed = [];

  let evaluatedPlayers = 0;
  const newTradeRequests: string[] = [];

  for (const teamId of TEAM_IDS) {
    const teamPlayers = Object.values(career.players).filter(
      (p) =>
        p.teamId === teamId &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        p.rosterTier !== 'FA'
    );

    for (const p of teamPlayers) {
      evaluatedPlayers += 1;
      let score = getPlayerDissatisfaction(p);
      const profile = getPlayerDissatisfactionProfile(career, p);
      const diag = diagnosePlayerDissatisfaction(career, p);

      // 1) 면담 후속 조치 실제 결과 검증
      if (p.pendingMeetingFollowUp && !p.pendingMeetingFollowUp.resolved) {
        const fu = p.pendingMeetingFollowUp;
        const waitedEnough =
          career.gamesPlayed >= fu.evalAfterRound ||
          daysBetweenIso(fu.meetingDate, today) >= 14;
        if (waitedEnough) {
          const curG = getPlayerGamesPlayed(p);
          const deltaG = curG - fu.startGames;
          let fulfilled = false;
          let note = '';

          if (fu.action === '출전 기회 검토') {
            fulfilled =
              (fu.startTier === '2군' && p.rosterTier === '1군') ||
              deltaG >= 4 ||
              (p.role === '투수' && deltaG >= 2);
            if (fulfilled) {
              score -= Math.round(16 * profile.decayMult);
              note = '면담 후 실제 1군 출전 기회가 늘어 불만이 크게 해소되었습니다.';
            } else {
              score += Math.round(10 * profile.gainMult);
              note = '면담 이후에도 출전 기회가 늘어나지 않아 실망감이 커졌습니다.';
            }
          } else if (fu.action === '계약 협상') {
            fulfilled =
              p.contract.annualSalary > fu.startSalary + 0.05 ||
              p.contract.yearsRemaining > fu.startContractYears ||
              p.salaryNegotiationStatus === '협상완료';
            if (fulfilled) {
              score -= Math.round(20 * profile.decayMult);
              note = '실제 연봉·계약 조건이 개선되어 구단에 대한 신뢰가 회복되었습니다.';
            } else {
              score += Math.round(8 * profile.gainMult);
              note = '계약 협상 진전이 없어 불만이 다시 높아졌습니다.';
            }
          } else if (fu.action === '감독 면담') {
            const teamAtm = career.teams[teamId].atmosphere;
            fulfilled = teamAtm !== '나쁨' && p.rosterTier === '1군';
            if (fulfilled) {
              score -= Math.round(12 * profile.decayMult);
              note = '감독과의 소통 이후 관계와 팀 분위기가 안정되었습니다.';
            } else {
              score += Math.round(7 * profile.gainMult);
              note = '감독 면담 이후에도 갈등 요인이 해소되지 않았습니다.';
            }
          } else {
            // '트레이드 검토' — 자동 이적 없음; 상황 개선 시 진정, 방치 시 불만 유지
            fulfilled = p.rosterTier === '1군' && deltaG >= 5;
            if (fulfilled) {
              score -= Math.round(10 * profile.decayMult);
              note = '트레이드 검토 이후 1군 기용이 늘며 마음이 다소 누그러졌습니다.';
            } else {
              score += Math.round(4 * profile.gainMult);
              note = '트레이드 검토 결과가 나오지 않아 이적 의사가 유지되고 있습니다.';
            }
          }

          fu.resolved = true;
          fu.outcomeNote = note;
        }
      }

      // 2) 주간 원인별 증가 / 해소 시 점진적 감소 반영 (+ 수석코치 능력치 소폭 보정 · 10개 구단 동일 적용)
      const benchEffect = getBenchCoachAtmosphereEffect(career, teamId);
      if (diag.rawIncrease > 0) {
        const inc = Math.max(
          1,
          Math.round(
            diag.rawIncrease *
              profile.gainMult *
              benchEffect.dissatisfactionGainMult *
              (1 - profile.loyaltyCushion * 0.25)
          )
        );
        score += inc;
      }
      if (diag.rawDecay > 0) {
        const dec = Math.max(
          1,
          Math.round(diag.rawDecay * profile.decayMult) + benchEffect.dissatisfactionDecayBonus
        );
        score -= Math.max(1, dec);
      }

      score = clamp(Math.round(score), 0, 100);
      p.dissatisfaction = score;
      p.activeDissatisfactionCauses = diag.causes;
      syncPlayerMoraleFromDissatisfaction(p);

      // 2-b) 불만 40+ 발생 시 수석코치가 먼저 면담하고 단장에게 결과 보고 (10개 구단 동일 규칙)
      if ((p.dissatisfaction ?? 0) >= MEETING_MIN_DISSATISFACTION) {
        runBenchCoachPreMeetingInPlace(career, p, today);
      }

      // 3) 재계약 거부 가능성 갱신 (프랜차이즈 충성도 반영)
      const resist = getReSignResistanceAssessment(career, p);
      p.reSignRefusalRiskPct = resist.refusalRiskPct;

      // 4) 불만 80+ 시 트레이드 요청 가능성 상승 (절대 자동 이적 금지!)
      if (score >= 80 && !p.tradeRequested) {
        const baseReqProb = 0.25 + (score - 80) * 0.025; // 25%~75%
        const effectiveProb = clamp(baseReqProb * (1 - profile.loyaltyCushion), 0.08, 0.78);
        if (localRng.next() < effectiveProb) {
          p.tradeRequested = true;
          newTradeRequests.push(p.id);

          if (teamId === career.playerTeamId) {
            const hasOpenTradeReq = career.complaints.some(
              (c) => !c.resolved && c.playerId === p.id && c.reason === '트레이드요구'
            );
            if (!hasOpenTradeReq) {
              career.complaints.unshift({
                id: `cmp-trq-${career.gamesPlayed}-${p.id}`,
                playerId: p.id,
                playerName: p.name,
                position: p.position,
                reason: '트레이드요구',
                severity: '심각',
                message: `${p.name}(불만도 ${score} · 심각한 불만) 선수가 구단에 공식 트레이드를 요청했습니다. (자동 이적은 발생하지 않으며 단장의 최종 승인이 필요합니다.)`,
                createdDate: today,
                unresolvedSeries: 0,
                dissatisfactionScore: score,
              });
            }
            career.newsFeed.unshift({
              id: `news-trq-${career.gamesPlayed}-${p.id}`,
              season: career.season,
              date: today,
              category: '이적·계약',
              headline: `[트레이드 요청] ${KBO_TEAMS[teamId].shortName} ${p.name}, 심각한 불만으로 이적 요청`,
              body: `원인: ${diag.causes.join(', ') || '누적 불만'} (불만도 ${score}/100). 단장 면담 또는 트레이드 검토가 필요합니다.`,
              teamId,
              isHighlight: true,
            });
          }
        }
      } else if (score < 45 && p.tradeRequested && (!p.pendingMeetingFollowUp || p.pendingMeetingFollowUp.action !== '트레이드 검토')) {
        // 불만이 충분히 완화되면 트레이드 요청 자연 철회
        p.tradeRequested = false;
      }

      // 5) 사용자 구단 미해결 불만 알림 동기화 (동일 원인 중복 생성 철저 방지!)
      if (teamId === career.playerTeamId) {
        // 원인이 사라지고 불만도 < 40이면 기존 미해결 일반 불만 자동 정리
        for (const cmp of career.complaints) {
          if (cmp.resolved || cmp.playerId !== p.id) continue;
          if (cmp.reason === '포스팅희망') continue;
          cmp.dissatisfactionScore = score;
          if (score < 35 && diag.causes.length === 0) {
            cmp.resolved = true;
            cmp.resolutionNote = `원인 해소로 불만도가 자연 완화되었습니다. (현재 ${score} · ${getDissatisfactionLevel(score)})`;
          }
        }

        // 불만 40+ & 활성 원인이 있을 때 동일 원인 중복 없이 최대 1건 등록
        if (score >= 40 && diag.causes.length > 0) {
          const primaryCause = diag.causes[0];
          const mappedReason = mapCauseToComplaintReason(primaryCause);
          const duplicateExists = career.complaints.some(
            (c) => !c.resolved && c.playerId === p.id && c.reason === mappedReason
          );
          if (!duplicateExists) {
            const openCount = career.complaints.filter((c) => !c.resolved).length;
            if (openCount < 10) {
              const lvl = getDissatisfactionLevel(score);
              career.complaints.unshift({
                id: `cmp-wk-${career.gamesPlayed}-${p.id}-${mappedReason}`,
                playerId: p.id,
                playerName: p.name,
                position: p.position,
                reason: mappedReason,
                severity: score >= 60 ? '심각' : '경고',
                message: `${p.name}(${p.position} · 불만도 ${score} [${lvl}]) — 주요 원인: ${diag.causes.join(', ')}. 단장 면담을 통해 대응할 수 있습니다.`,
                createdDate: today,
                unresolvedSeries: 0,
                dissatisfactionScore: score,
              });
            }
          }
        }
      }
    }
  }

  return { ran: true, evaluatedPlayers, newTradeRequests };
}
