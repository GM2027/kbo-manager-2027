import { buildCoachSubRatings, COACH_ROLE_METADATA, ensureBenchCoachesInPlace } from '../data/coachesData';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  BenchCoachMeetingReport,
  CareerSave,
  Coach,
  Player,
  TeamId,
} from '../types/kbo';
import { getCurrentCareerDate } from './salaryCapEngine';

export interface BenchCoachRatings {
  leadership: number;
  playerManagement: number;
  tacticalUnderstanding: number;
  average: number;
}

export interface BenchCoachAtmosphereEffect {
  hasBenchCoach: boolean;
  coachName: string | null;
  ratings: BenchCoachRatings;
  /** 불만 증가 배율 (0.90 ~ 1.08: 우수 수석코치는 불만 증가 소폭 억제) */
  dissatisfactionGainMult: number;
  /** 불만 자연 회복 보너스 (-1 ~ +2) */
  dissatisfactionDecayBonus: number;
  /** 팀 분위기 긍정 보정치 (-0.04 ~ +0.07) */
  atmosphereStabilityBonus: number;
}

export interface BenchCoachPromotionRecommendation {
  recommended: boolean;
  reason: string;
  candidate: Coach | null;
  isCurrentlyActingManager: boolean;
  ratings: BenchCoachRatings | null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function cloneCareer(career: CareerSave): CareerSave {
  return JSON.parse(JSON.stringify(career)) as CareerSave;
}

export function getClubBenchCoach(career: CareerSave, teamId: TeamId): Coach | null {
  const list = career.coaches?.[teamId] ?? [];
  return list.find((c) => c.role === '수석코치') ?? null;
}

/**
 * 수석코치 전용 3개 능력치 조회 (리더십 · 선수 관리 · 전술 이해도)
 */
export function getBenchCoachRatings(coach: Coach | null): BenchCoachRatings {
  if (!coach) {
    return { leadership: 72, playerManagement: 72, tacticalUnderstanding: 72, average: 72 };
  }
  const sub =
    coach.subRatings &&
    typeof coach.subRatings.leadership === 'number' &&
    typeof coach.subRatings.playerManagement === 'number' &&
    typeof coach.subRatings.tacticalUnderstanding === 'number'
      ? coach.subRatings
      : buildCoachSubRatings('수석코치', coach.ability, coach.name);
  const leadership = clamp(Math.round(sub.leadership ?? coach.ability), 55, 99);
  const playerManagement = clamp(Math.round(sub.playerManagement ?? coach.ability), 55, 99);
  const tacticalUnderstanding = clamp(Math.round(sub.tacticalUnderstanding ?? coach.ability), 55, 99);
  const average = Math.round((leadership + playerManagement + tacticalUnderstanding) / 3);
  return { leadership, playerManagement, tacticalUnderstanding, average };
}

/**
 * 수석코치 능력치에 따른 선수 불만도 및 팀 분위기 소폭 보정 계산 (10개 구단 동일 규칙)
 */
export function getBenchCoachAtmosphereEffect(
  career: CareerSave,
  teamId: TeamId
): BenchCoachAtmosphereEffect {
  const bench = getClubBenchCoach(career, teamId);
  if (!bench) {
    return {
      hasBenchCoach: false,
      coachName: null,
      ratings: getBenchCoachRatings(null),
      dissatisfactionGainMult: 1.05,
      dissatisfactionDecayBonus: -1,
      atmosphereStabilityBonus: -0.03,
    };
  }
  const ratings = getBenchCoachRatings(bench);
  // 리더십(40%) + 선수 관리(45%) + 전술 이해도(15%) 가중 평균 (기준 78)
  const composite =
    ratings.leadership * 0.4 +
    ratings.playerManagement * 0.45 +
    ratings.tacticalUnderstanding * 0.15;
  const diff = composite - 78; // 대략 -10 ~ +12

  const dissatisfactionGainMult = Number(clamp(1.0 - diff * 0.008, 0.9, 1.08).toFixed(3));
  const dissatisfactionDecayBonus =
    diff >= 5 ? 2 : diff >= 1 ? 1 : diff <= -5 ? -1 : 0;
  const atmosphereStabilityBonus = Number(clamp(diff * 0.005, -0.04, 0.07).toFixed(3));

  return {
    hasBenchCoach: true,
    coachName: bench.name,
    ratings,
    dissatisfactionGainMult,
    dissatisfactionDecayBonus,
    atmosphereStabilityBonus,
  };
}

/**
 * 선수 불만(40 이상) 발생 시 수석코치가 먼저 면담하고 단장에게 결과를 보고 (10개 구단 동일 규칙)
 * - 동일 선수에 대해 최근 14일(또는 동일 주간) 중복 선행 면담 방지
 * - 수석코치의 리더십·선수 관리 능력치에 따라 불만을 소폭 진정(-2 ~ -7)
 * - 계약·트레이드 결정권은 오직 단장에게 있으며 수석코치는 보고·건의만 수행
 */
export function runBenchCoachPreMeetingInPlace(
  career: CareerSave,
  player: Player,
  dateStr: string
): BenchCoachMeetingReport | null {
  const teamId = player.teamId;
  const bench = getClubBenchCoach(career, teamId);
  if (!bench) return null;

  const before = Math.round(player.dissatisfaction ?? 0);
  if (before < 40) return null;

  if (!career.benchCoachReports) career.benchCoachReports = [];
  const recentSamePlayer = career.benchCoachReports.find((r) => {
    if (r.playerId !== player.id || r.teamId !== teamId) return false;
    const prevTime = new Date(`${r.date}T00:00:00Z`).getTime();
    const curTime = new Date(`${dateStr}T00:00:00Z`).getTime();
    if (Number.isNaN(prevTime) || Number.isNaN(curTime)) return r.date === dateStr;
    return Math.abs(curTime - prevTime) < 14 * 24 * 60 * 60 * 1000;
  });
  if (recentSamePlayer) return null;

  const ratings = getBenchCoachRatings(bench);
  const careScore = ratings.leadership * 0.45 + ratings.playerManagement * 0.55;
  // 능력치에 따른 소폭 진정 (70 이하 -2, 75~79 -4, 80~84 -5, 85+ -7)
  const relief = careScore >= 85 ? 7 : careScore >= 80 ? 5 : careScore >= 75 ? 4 : 2;
  const after = clamp(before - relief, 0, 100);
  player.dissatisfaction = after;
  player.morale = after <= 19 ? '만족' : after <= 39 ? '보통' : '불만';

  const causeText =
    player.activeDissatisfactionCauses && player.activeDissatisfactionCauses.length > 0
      ? player.activeDissatisfactionCauses.join('·')
      : '선수단 역할 및 기용';

  const recommendation =
    after >= 70
      ? '불만이 심각한 수준입니다. 단장님 직접 면담 및 기용·계약 방향 검토가 필요합니다.'
      : after >= 40
      ? '1차 면담으로 진정시켰으나 불만이 남아 있습니다. 단장 면담 또는 로스터/계약 점검을 건의합니다.'
      : '1차 면담으로 선수의 마음을 다독여 안정권으로 진정시켰습니다.';

  const report: BenchCoachMeetingReport = {
    id: `bcr-${career.season}-${teamId}-${player.id}-${dateStr}`,
    season: career.season,
    date: dateStr,
    teamId,
    benchCoachName: bench.name,
    playerId: player.id,
    playerName: player.name,
    beforeDissatisfaction: before,
    afterDissatisfaction: after,
    delta: after - before,
    summary: `[수석코치 1차 면담] ${bench.name} 수석코치가 ${player.name}(${causeText})과 선행 면담을 진행했습니다 (불만도 ${before}→${after}).`,
    recommendation,
  };

  career.benchCoachReports.unshift(report);
  if (career.benchCoachReports.length > 60) {
    career.benchCoachReports = career.benchCoachReports.slice(0, 60);
  }

  // 우리 구단 선수인 경우 단장에게 보고 로그 기록
  if (teamId === career.playerTeamId) {
    career.transactionLogs.unshift({
      id: `tx-bcr-${Date.now()}-${player.id}`,
      date: dateStr,
      type: '면담',
      teamId,
      summary: `[수석코치 보고] ${bench.name} → ${player.name} 1차 면담 (불만 ${before}→${after})`,
      detail: `${recommendation} (계약·트레이드 최종 승인은 단장 전권)`,
    });
  }

  return report;
}

/**
 * 감독 공석 시 수석코치를 감독 대행으로 지정 (단장 승인 · 계약·트레이드 권한은 단장 유지)
 */
export function appointBenchCoachAsActingManagerForUser(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  actingManager: Coach;
} {
  const teamId = career.playerTeamId;
  const staff = career.coaches[teamId] ?? [];
  const existingMgr = staff.find((c) => c.role === '감독');
  if (existingMgr) {
    throw new Error(`현재 ${existingMgr.name} 감독이 재임 중입니다. 감독 공석 시에만 수석코치를 감독 대행으로 지정할 수 있습니다.`);
  }
  const bench = staff.find((c) => c.role === '수석코치');
  if (!bench) {
    throw new Error('감독 대행으로 지정할 수석코치가 없습니다. 먼저 수석코치를 선임해 주세요.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureBenchCoachesInPlace(next);

  const nextStaff = next.coaches[teamId] ?? [];
  const targetBench = nextStaff.find((c) => c.id === bench.id) ?? nextStaff.find((c) => c.role === '수석코치')!;
  const ratings = getBenchCoachRatings(targetBench);
  const actingAbility = clamp(
    Math.round(ratings.leadership * 0.35 + ratings.playerManagement * 0.25 + ratings.tacticalUnderstanding * 0.4),
    70,
    92
  );

  const actingMgr: Coach = {
    ...targetBench,
    role: '감독',
    ability: actingAbility,
    isActingManager: true,
    confirmed: true,
    careerNote: `수석코치(${targetBench.name})에서 감독 대행 지정 · 차기 감독 유력 후보`,
    roleSummary: '감독 공석 기간 선수단 지휘 및 경기 운영 대행 (계약·트레이드 단장 전권)',
    subRatings: buildCoachSubRatings('감독', actingAbility, `${targetBench.name}-acting`, {
      leadership: ratings.leadership,
      tactics: ratings.tacticalUnderstanding,
    }),
  };

  next.coaches[teamId] = [actingMgr, ...nextStaff.filter((c) => c.id !== targetBench.id)];
  const today = getCurrentCareerDate(next).isoDate;
  next.transactionLogs.unshift({
    id: `tx-acting-bench-${Date.now()}`,
    date: today,
    type: '계약',
    teamId,
    summary: `[감독 대행 지정] ${targetBench.name} 수석코치 → 감독 대행 선임`,
    detail: '감독 공석에 따라 수석코치를 감독 대행으로 지정했습니다. 정식 감독 승격 또는 외부 FA 감독 선임이 가능합니다.',
  });
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, actingManager: actingMgr };
}

/**
 * 감독 경질/공석 시 수석코치를 차기 감독 후보로 추천
 */
export function getBenchCoachPromotionRecommendation(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): BenchCoachPromotionRecommendation {
  const staff = career.coaches?.[teamId] ?? [];
  const mgr = staff.find((c) => c.role === '감독');
  const bench = staff.find((c) => c.role === '수석코치');

  // 1) 감독이 공석이고 수석코치가 있는 경우
  if (!mgr && bench) {
    const ratings = getBenchCoachRatings(bench);
    return {
      recommended: true,
      reason: `감독 공석 상태입니다. 선수단을 가장 잘 파악하고 있는 ${bench.name} 수석코치(리더십 ${ratings.leadership} · 선수관리 ${ratings.playerManagement} · 전술이해도 ${ratings.tacticalUnderstanding})를 차기 감독 후보로 추천합니다.`,
      candidate: bench,
      isCurrentlyActingManager: false,
      ratings,
    };
  }

  // 2) 수석코치 출신 감독 대행이 지휘 중인 경우 정식 감독 후보 추천
  if (mgr && mgr.isActingManager) {
    const ratings = getBenchCoachRatings(mgr);
    return {
      recommended: true,
      reason: `현재 감독 대행 체제입니다. ${mgr.name} 대행을 정식 감독으로 승격하거나 외부 FA 감독을 선임할 수 있습니다.`,
      candidate: mgr,
      isCurrentlyActingManager: true,
      ratings,
    };
  }

  return {
    recommended: false,
    reason: '',
    candidate: bench ?? null,
    isCurrentlyActingManager: false,
    ratings: bench ? getBenchCoachRatings(bench) : null,
  };
}

/**
 * 단장 승인으로 수석코치(또는 감독 대행)를 정식 감독으로 승격
 */
export function promoteBenchCoachToManagerForUser(
  career: CareerSave,
  params?: { years?: number; annualSalaryBillion?: number }
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  promotedManager: Coach;
} {
  const teamId = career.playerTeamId;
  const staff = career.coaches[teamId] ?? [];
  const currentMgr = staff.find((c) => c.role === '감독');
  const currentBench = staff.find((c) => c.role === '수석코치');

  let sourceCoach: Coach | undefined;
  if (!currentMgr && currentBench) {
    sourceCoach = currentBench;
  } else if (currentMgr && currentMgr.isActingManager) {
    sourceCoach = currentMgr;
  } else {
    throw new Error('감독 공석 또는 감독 대행 체제일 때만 수석코치를 정식 감독으로 승격할 수 있습니다.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const nextStaff = next.coaches[teamId] ?? [];
  const target = nextStaff.find((c) => c.id === sourceCoach!.id)!;
  const ratings = getBenchCoachRatings(target);
  const newAbility = clamp(
    Math.round(ratings.leadership * 0.35 + ratings.playerManagement * 0.25 + ratings.tacticalUnderstanding * 0.4) + 1,
    72,
    93
  );
  const years = clamp(Math.round(params?.years ?? 2), 1, 5);
  const annual = Number(Math.max(2.5, params?.annualSalaryBillion ?? Math.max(3.0, target.annualSalaryBillion + 1.2)).toFixed(1));
  const bonus = Number((annual * 0.35).toFixed(1));
  const totalBillion = Number((years * annual + bonus).toFixed(2));

  const promoted: Coach = {
    ...target,
    teamId,
    role: '감독',
    ability: newAbility,
    contractYears: years,
    annualSalaryBillion: annual,
    signingBonusBillion: bonus,
    totalBillion,
    confirmed: true,
    isIncumbent: false,
    isActingManager: false,
    careerNote: `${next.season}시즌 ${KBO_TEAMS[teamId].shortName} 수석코치 내부 승격 정식 감독`,
    roleSummary: COACH_ROLE_METADATA['감독'].duties,
    subRatings: buildCoachSubRatings('감독', newAbility, `${target.name}-promoted`, {
      leadership: ratings.leadership,
      tactics: ratings.tacticalUnderstanding,
    }),
  };

  next.coaches[teamId] = [promoted, ...nextStaff.filter((c) => c.id !== target.id)];
  const today = getCurrentCareerDate(next).isoDate;
  next.finances.krwUnpaidBillion = Number((next.finances.krwUnpaidBillion + totalBillion).toFixed(2));
  next.finances.obligations.push({
    id: `ob-coach-promote-${promoted.id}-${Date.now()}`,
    label: `수석코치 ${promoted.name} 정식 감독 승격 (${years}년 총액 ${totalBillion}억)`,
    currency: 'KRW',
    amount: totalBillion,
    paidAmount: 0,
  });
  next.transactionLogs.unshift({
    id: `tx-coach-promote-${Date.now()}`,
    date: today,
    type: '계약',
    teamId,
    summary: `[감독 승격] ${promoted.name} 수석코치 → 정식 감독 선임 (${years}년 ${totalBillion}억)`,
    detail: '내부 승격으로 선수단 연속성을 유지하며 새 감독 체제를 출범했습니다. (계약·트레이드 최종 승인은 단장 전권)',
  });
  next.updatedAt = new Date().toISOString();

  return { nextCareer: next, backupSnapshot, promotedManager: promoted };
}
