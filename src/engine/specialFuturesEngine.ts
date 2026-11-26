import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  buildInitialUlsanWhalesState,
  REAL_2026_SANGMU_PHOENIX_ROSTER,
  SangmuRealPlayerSeed,
  VERIFIED_SANGMU_BIRTHDATES_BY_KEY,
} from '../data/specialFuturesRosters';
import { calculateKoreanFullAge, getCareerCurrentIsoDate, syncEntityAgeInPlace } from './ageEngine';
import {
  CareerSave,
  DraftCandidate,
  DraftState,
  Player,
  TeamId,
  UlsanWhalesPlayer,
} from '../types/kbo';
import {
  buildBattingProfile,
  buildHiddenTrait,
  buildPitchRepertoire,
  buildPlayerAgent,
  reassignNonConflictingUniformNumber,
} from './deepFranchise';
import { isMilitaryResolved, isMilitaryServing } from './militaryEngine';
import { SeededRng } from './rng';
import { emptyBatterStats, emptyPitcherStats } from './stats';
import { createVirtualFuturesDepthPlayer } from './virtualPlayerGenerator';

export const ULSAN_SPECIAL_RULES_SUMMARY = {
  openingTransferDate2026: '2026-05-20',
  maxTransfersPerSeason: 5,
  maxForeignPlayers: 6,
  foreignCapUsd: 100_000,
  domesticMinSalaryBillion: 0.3, // 3,000만 원
  transferDeadlineRound: 100, // 7월 31일
  transferDeadlineLabel: '7월 31일',
};

const USD_TO_KRW_BILLION = 1350 / 100_000_000;

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 현재 게임 내 날짜(YYYY-MM-DD)를 정밀 추정합니다.
 * 2026년 5월 20일 이적 개시 및 7월 31일 마감, 포스트시즌 종료 다음 날 판정에 사용됩니다.
 */
export function getCurrentInGameDate(career: CareerSave): string {
  if (career.phase === 'OFFSEASON') {
    return `${career.season}-11-05`;
  }
  if (career.phase === 'POSTSEASON') {
    return `${career.season}-10-18`;
  }
  const curSeries = career.schedule?.[career.currentSeriesIndex];
  const seriesDate = curSeries?.dates?.[curSeries.completedRounds] ?? curSeries?.dates?.[0];
  if (seriesDate) {
    return seriesDate;
  }
  const latestGame = career.gamesLedger?.[career.gamesLedger.length - 1];
  if (latestGame?.date) {
    return latestGame.date;
  }
  // Opening day ~ March 28, approx 1.25 calendar days per game
  return addDaysIso(`${career.season}-03-28`, Math.round(career.gamesPlayed * 1.25));
}

function buildSangmuPlayerFromSeed(
  seed: SangmuRealPlayerSeed,
  idx: number,
  referenceIsoDate: string = '2027-01-01'
): Player {
  const id = seed.sourcePlayerId ?? `sangmu-real-${seed.originalTeamId}-${idx + 1}`;
  const verifiedBirthDate =
    seed.birthDate ?? VERIFIED_SANGMU_BIRTHDATES_BY_KEY[`${seed.name}|${seed.originalTeamId}`] ?? null;
  const birthYear = verifiedBirthDate ? Number(verifiedBirthDate.slice(0, 4)) : undefined;
  const computedAge =
    (verifiedBirthDate ? calculateKoreanFullAge(verifiedBirthDate, referenceIsoDate) : null) ??
    seed.age;
  const player: Player = {
    id,
    originType: 'real',
    name: seed.name,
    teamId: seed.originalTeamId,
    category: '국내',
    role: seed.role,
    position: seed.position,
    pitchRole: seed.pitchRole,
    age: computedAge,
    birthYear,
    birthDate: verifiedBirthDate,
    heightCm: null,
    weightKg: null,
    bats: null,
    throws: null,
    school: null,
    ability: seed.ability,
    potential: seed.potential,
    abilityStatus: '확정',
    form: 0,
    fatigue: 8,
    lastPitchedRound: -10,
    consecutiveAppearances: 0,
    rosterTier: '대기',
    gameDayActive: false,
    contract: {
      status: '확정',
      currency: 'KRW',
      years: 1,
      yearsRemaining: 1,
      annualSalary: 0.33,
      signingBonus: 0,
      totalValue: 0.33,
      note: `상무 피닉스 복무 중 (${seed.dischargeLabel} · 원소속 ${KBO_TEAMS[seed.originalTeamId].shortName})`,
      startSeason: seed.enlistedSeason,
      endSeason: seed.returnSeason,
    },
    injury: null,
    morale: '만족',
    trainingFocus: seed.role === '투수' ? '구위' : '타격',
    serviceYears: Math.max(0, Math.min(4, seed.age - 20)),
    seasonRatingDelta: 0,
    lastEvaluatedAtTeamGames: 0,
    stats: seed.role === '투수' ? emptyPitcherStats() : emptyBatterStats(),
    postseasonStats: seed.role === '투수' ? emptyPitcherStats() : emptyBatterStats(),
    futuresStats: { G: 0, AB: 0, H: 0, HR: 0, RBI: 0, outs: 0, ER: 0, SO: 0, W: 0, L: 0 },
    militaryStatus: '복무 중',
    militaryNote: seed.note,
    militaryEnlistDate: seed.enlistDate,
    militaryDischargeDate: seed.dischargeDate,
    militaryEnlistedSeason: seed.enlistedSeason,
    militaryEnlistedRound: 0,
    militaryReturnSeason: seed.returnSeason,
    militaryReturnRound: seed.returnRound,
    dataVerification: {
      militarySource: '국군체육부대(상무) 공식 최종 합격 발표',
    },
    nationality: '한국',
    uniformNumber: seed.uniformNumber,
    registrationDays: Math.max(0, (seed.age - 20) * 65),
  };
  if (player.role === '투수') {
    player.pitchRepertoire = buildPitchRepertoire(player);
  } else {
    player.battingProfile = buildBattingProfile(player);
  }
  player.hiddenTrait = buildHiddenTrait(player);
  player.agent = buildPlayerAgent(player);
  return player;
}

/**
 * 상무 피닉스 현실 선수단(전역 시 원소속팀 복귀)과 울산 웨일즈 현실 선수단을 초기화합니다.
 * 이미 존재하는 동일 이름·동일 원소속 선수는 중복 생성하지 않고 상무복무 상태로 전환합니다.
 */
export function ensureSpecialFuturesRosters(career: CareerSave): void {
  // 1) 울산 웨일즈 현실 선수단 및 특별 규정 상태 보장
  if (!career.ulsanWhales) {
    career.ulsanWhales = buildInitialUlsanWhalesState();
  }

  // 2) 상무 피닉스 2026 현실 선수단 1회 시딩 (전역 후 재입대 방지)
  if (!career.hasSeededSangmuRoster) {
    const allPlayers = Object.values(career.players);
    const affectedFuturesTeams = new Set<TeamId>();
    const affectedDevTeams = new Set<TeamId>();

    REAL_2026_SANGMU_PHOENIX_ROSTER.forEach((seed, idx) => {
      // 이미 전역 시즌이 지난 기수는 복무 시딩 제외 (전역 완료자 재입대 방지)
      if (seed.returnSeason < career.season) return;

      // 1순위: 고유 sourcePlayerId 매칭 (동명이인 충돌 완전 차단), 2순위: (이름 + 원소속팀 + 투타 역할)
      const existing =
        (seed.sourcePlayerId ? career.players[seed.sourcePlayerId] : undefined) ??
        allPlayers.find(
          (p) =>
            p.name === seed.name &&
            p.teamId === seed.originalTeamId &&
            p.role === seed.role &&
            p.rosterTier !== '은퇴' &&
            p.rosterTier !== '해외이적'
        );

      if (existing) {
        // 이미 군필/예술·체육요원/면제이거나 게임 내에서 병역 변동된 선수는 절대 덮어쓰지 않음
        if (existing.militaryChangedInGame || isMilitaryResolved(existing.militaryStatus)) {
          return;
        }
        const tState = career.teams[seed.originalTeamId];
        const wasFutures = existing.rosterTier === '2군';
        const wasDev = existing.rosterTier === '육성';
        existing.militaryStatus = '복무 중';
        existing.militaryNote = seed.note;
        existing.militaryEnlistDate = seed.enlistDate;
        existing.militaryDischargeDate = seed.dischargeDate;
        existing.militaryEnlistedSeason = seed.enlistedSeason;
        existing.militaryEnlistedRound = 0;
        existing.militaryReturnSeason = seed.returnSeason;
        existing.militaryReturnRound = seed.returnRound;
        existing.rosterTier = '대기';
        existing.gameDayActive = false;
        if (!existing.futuresStats) {
          existing.futuresStats = { G: 0, AB: 0, H: 0, HR: 0, RBI: 0, outs: 0, ER: 0, SO: 0, W: 0, L: 0 };
        }
        if (tState) {
          tState.lineupOrder = tState.lineupOrder.filter((id) => id !== existing.id);
          tState.rotationOrder = tState.rotationOrder.filter((id) => id !== existing.id);
          tState.benchOrder = tState.benchOrder.filter((id) => id !== existing.id);
          tState.bullpenOrder = tState.bullpenOrder.filter((id) => id !== existing.id);
        }
        if (wasFutures) affectedFuturesTeams.add(seed.originalTeamId);
        if (wasDev) affectedDevTeams.add(seed.originalTeamId);
      } else {
        const created = buildSangmuPlayerFromSeed(seed, idx, getCareerCurrentIsoDate(career));
        career.players[created.id] = created;
      }
    });

    // 상무 입대로 2군 인원이 10명 미만으로 줄어든 구단은 가상 선수 생성기로 보충 (실존 데이터와 로직 분리)
    let backupSeq = 0;
    for (const tid of affectedFuturesTeams) {
      let futuresCount = Object.values(career.players).filter(
        (p) => p.teamId === tid && p.rosterTier === '2군' && !isMilitaryServing(p.militaryStatus)
      ).length;
      while (futuresCount < 10) {
        const isPitcher = futuresCount % 2 === 0;
        backupSeq += 1;
        const depthPlayer = createVirtualFuturesDepthPlayer({
          teamId: tid,
          season: career.season,
          seq: backupSeq,
          isPitcher,
          tier: '2군',
        });
        career.players[depthPlayer.id] = depthPlayer;
        reassignNonConflictingUniformNumber(career, depthPlayer, tid);
        futuresCount += 1;
      }
    }

    // 상무 입대로 육성선수가 4명 미만으로 줄어든 구단은 가상 육성선수 생성기로 보충
    let devSeq = 0;
    for (const tid of affectedDevTeams) {
      let devCount = Object.values(career.players).filter(
        (p) => p.teamId === tid && p.rosterTier === '육성' && !isMilitaryServing(p.militaryStatus)
      ).length;
      while (devCount < 4) {
        const isPitcher = devCount % 2 === 0;
        devSeq += 1;
        const devPlayer = createVirtualFuturesDepthPlayer({
          teamId: tid,
          season: career.season,
          seq: devSeq,
          isPitcher,
          tier: '육성',
        });
        career.players[devPlayer.id] = devPlayer;
        reassignNonConflictingUniformNumber(career, devPlayer, tid);
        devCount += 1;
      }
    }

    career.hasSeededSangmuRoster = true;
  }
}

export interface UlsanTransferWindowStatus {
  isOpen: boolean;
  currentDate: string;
  reason: string;
  remainingTransfers: number;
  usedTransfers: number;
  maxTransfers: number;
}

/**
 * 울산 웨일즈 특별 이적 가능 기간 및 인원 한도 판정
 * - 2026년 5월 20일부터 이적 가능
 * - 원칙적으로 포스트시즌 종료 다음 날(오프시즌)부터 다음 해 7월 31일(R100)까지
 * - 한 시즌 최대 5명 이적 가능
 */
export function getUlsanTransferWindowStatus(career: CareerSave): UlsanTransferWindowStatus {
  const uw = career.ulsanWhales ?? buildInitialUlsanWhalesState();
  const currentDate = getCurrentInGameDate(career);
  const used = uw.seasonTransfersUsed;
  const max = uw.maxTransfersPerSeason;
  const remaining = Math.max(0, max - used);

  if (used >= max) {
    return {
      isOpen: false,
      currentDate,
      reason: `울산 웨일즈 한 시즌 최대 이적 인원(${max}명)이 모두 소진되었습니다.`,
      remainingTransfers: 0,
      usedTransfers: used,
      maxTransfers: max,
    };
  }

  if (career.phase === 'POSTSEASON') {
    return {
      isOpen: false,
      currentDate,
      reason: '포스트시즌 기간에는 이적이 불가합니다. 포스트시즌 종료 다음 날부터 이적 가능합니다.',
      remainingTransfers: remaining,
      usedTransfers: used,
      maxTransfers: max,
    };
  }

  if (career.phase === 'OFFSEASON') {
    return {
      isOpen: true,
      currentDate,
      reason: `오프시즌 이적 가능 기간 (포스트시즌 종료 익일 ~ 차기 시즌 7월 31일 · 잔여 ${remaining}/${max}명)`,
      remainingTransfers: remaining,
      usedTransfers: used,
      maxTransfers: max,
    };
  }

  // Regular season / Intro / Staff / Draft
  if (career.season === 2026 && currentDate < ULSAN_SPECIAL_RULES_SUMMARY.openingTransferDate2026) {
    return {
      isOpen: false,
      currentDate,
      reason: `울산 웨일즈 특별 규정에 따라 2026년 5월 20일부터 이적 가능합니다 (현재 ${currentDate}).`,
      remainingTransfers: remaining,
      usedTransfers: used,
      maxTransfers: max,
    };
  }

  const deadlineDate = `${career.season}-07-31`;
  const deadlineRound = career.tradeDeadlineRound ?? ULSAN_SPECIAL_RULES_SUMMARY.transferDeadlineRound;
  if (career.gamesPlayed >= deadlineRound || currentDate > deadlineDate) {
    return {
      isOpen: false,
      currentDate,
      reason: `울산 웨일즈 시즌 중 이적 마감(7월 31일)이 경과했습니다. 포스트시즌 종료 다음 날부터 다시 이적 가능합니다.`,
      remainingTransfers: remaining,
      usedTransfers: used,
      maxTransfers: max,
    };
  }

  return {
    isOpen: true,
    currentDate,
    reason: `이적 가능 기간 진행 중 (~${career.season}-07-31 마감 · 잔여 ${remaining}/${max}명)`,
    remainingTransfers: remaining,
    usedTransfers: used,
    maxTransfers: max,
  };
}

export interface UlsanPlayerTransferCheck {
  eligible: boolean;
  requiresDraft: boolean;
  maxTransferFeeBillion: number;
  reason: string;
}

/**
 * 울산 웨일즈 개별 선수의 KBO 10개 회원 구단 이적(양도) 자격 검증
 */
export function evaluateUlsanTransferEligibility(
  career: CareerSave,
  ulsanPlayerId: string,
  acquiringTeamId: TeamId = career.playerTeamId
): UlsanPlayerTransferCheck {
  const uw = career.ulsanWhales ?? buildInitialUlsanWhalesState();
  const up = uw.roster.find((p) => p.id === ulsanPlayerId);
  if (!up) {
    return { eligible: false, requiresDraft: false, maxTransferFeeBillion: 0, reason: '선수를 찾을 수 없습니다.' };
  }
  if (up.transferredToTeamId) {
    return {
      eligible: false,
      requiresDraft: false,
      maxTransferFeeBillion: 0,
      reason: `이미 ${KBO_TEAMS[up.transferredToTeamId].shortName}(으)로 이적 완료된 선수입니다.`,
    };
  }

  // 이적료는 해당 선수의 연봉을 초과할 수 없음
  const maxFeeBillion = up.isForeign
    ? Number(((Math.min(up.totalCapUsd ?? 100_000, uw.foreignCapUsd) * USD_TO_KRW_BILLION)).toFixed(2))
    : Number(Math.max(uw.domesticMinSalaryBillion, up.salaryKrwBillion).toFixed(2));

  // 드래프트 참가 이력이 없는 국내 선수는 KBO 신인 드래프트를 거쳐야 이적 가능
  if (!up.isForeign && !up.hasKboDraftHistory) {
    return {
      eligible: false,
      requiresDraft: true,
      maxTransferFeeBillion: maxFeeBillion,
      reason: 'KBO 드래프트 미참가 국내 선수는 시즌 중 직접 이적이 불가하며, KBO 신인 드래프트 절차를 거쳐야 이적할 수 있습니다.',
    };
  }

  // 이적 가능 기간 및 시즌 최대 5명 한도 검증
  const winStatus = getUlsanTransferWindowStatus(career);
  if (!winStatus.isOpen) {
    return {
      eligible: false,
      requiresDraft: false,
      maxTransferFeeBillion: maxFeeBillion,
      reason: winStatus.reason,
    };
  }

  // 외국인 선수 영입 시 KBO 회원 구단 외국인(3명)/아시아쿼터(1명) 한도 체크
  if (up.isForeign) {
    const isAsiaNat = ['일본', '대만', '호주'].includes(up.nationality);
    const activeForeigns = Object.values(career.players).filter(
      (p) =>
        p.teamId === acquiringTeamId &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        p.rosterTier !== '제외후보'
    );
    const regCount = activeForeigns.filter((p) => p.category === '외국인').length;
    const asiaCount = activeForeigns.filter((p) => p.category === '아시아쿼터').length;
    if (isAsiaNat) {
      if (asiaCount >= 1 && regCount >= 3) {
        return {
          eligible: false,
          requiresDraft: false,
          maxTransferFeeBillion: maxFeeBillion,
          reason: `${KBO_TEAMS[acquiringTeamId].shortName}의 아시아쿼터(1명) 및 외국인(3명) 슬롯이 모두 가득 찼습니다.`,
        };
      }
    } else if (regCount >= 3) {
      return {
        eligible: false,
        requiresDraft: false,
        maxTransferFeeBillion: maxFeeBillion,
        reason: `${KBO_TEAMS[acquiringTeamId].shortName}의 외국인 보유 한도(3명)가 가득 찼습니다. 기존 외국인 해지 후 영입 가능합니다.`,
      };
    }
  }

  if (acquiringTeamId === career.playerTeamId) {
    const cash = career.finances.cashBalanceBillion ?? 0;
    if (cash < maxFeeBillion) {
      return {
        eligible: false,
        requiresDraft: false,
        maxTransferFeeBillion: maxFeeBillion,
        reason: `보유 자금(${cash.toFixed(2)}억)이 이적료(${maxFeeBillion.toFixed(2)}억)보다 부족합니다.`,
      };
    }
  }

  return {
    eligible: true,
    requiresDraft: false,
    maxTransferFeeBillion: maxFeeBillion,
    reason: `이적 가능 · 최대 이적료 ${maxFeeBillion.toFixed(2)}억 원 (연봉 상한 이내)`,
  };
}

function buildKboPlayerFromUlsan(
  career: CareerSave,
  up: UlsanWhalesPlayer,
  toTeamId: TeamId,
  transferFeeBillion: number,
  method: '시즌이적' | '신인드래프트'
): Player {
  const isAsiaNat = up.isForeign && ['일본', '대만', '호주'].includes(up.nationality);
  const existingAsia = Object.values(career.players).filter(
    (p) =>
      p.teamId === toTeamId &&
      p.category === '아시아쿼터' &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적' &&
      p.rosterTier !== '제외후보'
  ).length;
  const category: Player['category'] = !up.isForeign
    ? '국내'
    : isAsiaNat && existingAsia < 1
    ? '아시아쿼터'
    : '외국인';

  const id = `kbo-from-ulsan-${up.id}-${career.season}`;
  const annualUsd = up.totalCapUsd ?? 90_000;
  const annualKrw = Math.max(0.3, up.salaryKrwBillion);

  const player: Player = {
    id,
    name: up.name,
    teamId: toTeamId,
    category,
    role: up.role,
    position: up.position,
    pitchRole: up.pitchRole,
    age: up.age,
    ability: up.ability,
    potential: up.potential,
    abilityStatus: '확정',
    form: 1,
    fatigue: 10,
    lastPitchedRound: -5,
    consecutiveAppearances: 0,
    rosterTier: '2군',
    gameDayActive: false,
    contract:
      category === '국내'
        ? {
            status: '확정',
            currency: 'KRW',
            years: 1,
            yearsRemaining: 1,
            annualSalary: annualKrw,
            signingBonus: 0,
            totalValue: annualKrw,
            note: `울산 웨일즈 ${method} 영입 (이적료 ${transferFeeBillion.toFixed(2)}억)`,
            startSeason: career.season,
            endSeason: career.season,
          }
        : {
            status: '확정',
            currency: 'USD',
            years: 1,
            yearsRemaining: 1,
            annualSalary: annualUsd,
            signingBonus: 0,
            totalValue: annualUsd,
            note: `울산 웨일즈 외국인 양도 영입 (상한 $10만 규정 · 이적료 ${transferFeeBillion.toFixed(2)}억)`,
            startSeason: career.season,
            endSeason: career.season,
          },
    injury: null,
    morale: '만족',
    trainingFocus: up.role === '투수' ? '구위' : '타격',
    serviceYears: up.hasKboDraftHistory ? Math.max(0, Math.min(8, up.age - 22)) : 0,
    seasonRatingDelta: 0,
    lastEvaluatedAtTeamGames: career.gamesPlayed,
    stats: up.role === '투수' ? emptyPitcherStats() : emptyBatterStats(),
    postseasonStats: up.role === '투수' ? emptyPitcherStats() : emptyBatterStats(),
    futuresStats: up.futuresStats
      ? { ...up.futuresStats }
      : { G: 0, AB: 0, H: 0, HR: 0, RBI: 0, outs: 0, ER: 0, SO: 0, W: 0, L: 0 },
    militaryStatus: category === '국내' ? (up.age >= 26 ? '군필' : '미필') : undefined,
    nationality: up.nationality,
    previousLeagueClub: `울산 웨일즈 · ${up.previousClub}`,
    uniformNumber: up.uniformNumber,
    acquiredRound: career.gamesPlayed,
    acquiredSeason: career.season,
    registrationDays: up.hasKboDraftHistory ? Math.max(0, (up.age - 23) * 40) : 0,
    acquisitionInfo: {
      type: category === '국내' ? (method === '신인드래프트' ? '드래프트' : 'FA/트레이드') : category,
      label:
        method === '신인드래프트'
          ? `${career.season} KBO 신인드래프트 (울산 웨일즈 출신)`
          : `${career.season} 울산 웨일즈 양도 영입`,
    },
  };

  if (player.role === '투수') {
    player.pitchRepertoire = buildPitchRepertoire(player);
  } else {
    player.battingProfile = buildBattingProfile(player);
  }
  player.hiddenTrait = buildHiddenTrait(player);
  player.agent = buildPlayerAgent(player);
  return player;
}

/**
 * 울산 웨일즈 선수를 KBO 회원 구단(사용자 구단)으로 이적(양도) 영입합니다.
 * - 이적료는 해당 선수의 연봉을 초과할 수 없음 (초과 시 자동 검증 차단)
 * - 시즌 최대 5명, 2026-05-20 이후 / 포스트시즌 종료 다음 날 ~ 7월 31일 엄격 적용
 */
export function transferPlayerFromUlsanWhales(
  career: CareerSave,
  ulsanPlayerId: string,
  offeredTransferFeeBillion?: number
): { nextCareer: CareerSave; backupSnapshot: CareerSave; player: Player; transferFeeBillion: number } {
  const backupSnapshot: CareerSave = JSON.parse(JSON.stringify(career));
  const next: CareerSave = JSON.parse(JSON.stringify(career));
  ensureSpecialFuturesRosters(next);

  const check = evaluateUlsanTransferEligibility(next, ulsanPlayerId, next.playerTeamId);
  if (!check.eligible) {
    throw new Error(check.reason);
  }

  const uw = next.ulsanWhales!;
  const up = uw.roster.find((p) => p.id === ulsanPlayerId)!;
  const fee =
    offeredTransferFeeBillion !== undefined
      ? Number(offeredTransferFeeBillion.toFixed(2))
      : check.maxTransferFeeBillion;

  if (fee < 0) {
    throw new Error('이적료는 0억 원 이상이어야 합니다.');
  }
  if (fee > check.maxTransferFeeBillion + 0.001) {
    throw new Error(
      `울산 웨일즈 특별 규정에 따라 이적료(${fee.toFixed(2)}억)는 해당 선수의 연봉(${check.maxTransferFeeBillion.toFixed(2)}억)을 초과할 수 없습니다.`
    );
  }

  const cash = next.finances.cashBalanceBillion ?? 0;
  if (cash < fee) {
    throw new Error(`보유 자금(${cash.toFixed(2)}억)이 이적료(${fee.toFixed(2)}억)보다 부족합니다.`);
  }

  const dateStr = getCurrentInGameDate(next);
  const newPlayer = buildKboPlayerFromUlsan(next, up, next.playerTeamId, fee, '시즌이적');
  next.players[newPlayer.id] = newPlayer;
  reassignNonConflictingUniformNumber(next, newPlayer, next.playerTeamId);

  // Mark transferred in Ulsan Whales
  up.transferredToTeamId = next.playerTeamId;
  up.transferredSeason = next.season;
  up.transferredDate = dateStr;
  uw.seasonTransfersUsed += 1;
  uw.transferHistory.unshift({
    id: `uw-tx-${Date.now()}-${up.id}`,
    season: next.season,
    date: dateStr,
    playerId: up.id,
    playerName: up.name,
    position: up.position,
    isForeign: up.isForeign,
    toTeamId: next.playerTeamId,
    transferFeeBillion: fee,
    method: '시즌이적',
  });

  // Deduct transfer fee from club cash
  next.finances.cashBalanceBillion = Number((cash - fee).toFixed(2));
  next.finances.seasonExpenseBillion = Number((next.finances.seasonExpenseBillion + fee).toFixed(2));

  next.transactionLogs.unshift({
    id: `tx-ulsan-${Date.now()}`,
    date: dateStr,
    type: '계약',
    teamId: next.playerTeamId,
    summary: `울산 웨일즈 양도 영입: ${up.name} (${up.position}${up.isForeign ? ` · ${up.nationality}` : ''}) · 이적료 ${fee.toFixed(2)}억 원 (시즌 ${uw.seasonTransfersUsed}/${uw.maxTransfersPerSeason}명)`,
  });

  if (!next.newsFeed) next.newsFeed = [];
  next.newsFeed.unshift({
    id: `news-ulsan-tx-${Date.now()}-${up.id}`,
    date: dateStr,
    season: next.season,
    category: '이적·계약',
    headline: `[울산 웨일즈 이적] ${KBO_TEAMS[next.playerTeamId].shortName}, ${up.name}(${up.position}) 양도 영입 (이적료 ${fee.toFixed(2)}억)`,
    body: `${KBO_TEAMS[next.playerTeamId].name}이(가) 울산 웨일즈 특별 규정에 따라 ${up.name} 선수를 이적료 ${fee.toFixed(2)}억 원(연봉 상한 이내)에 영입했습니다. 올 시즌 울산 웨일즈 이적 누적 ${uw.seasonTransfersUsed}/${uw.maxTransfersPerSeason}명.`,
    teamId: next.playerTeamId,
    isHighlight: true,
  });

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, player: newPlayer, transferFeeBillion: fee };
}

/**
 * 퓨처스리그 3연전 시뮬레이션 시 울산 웨일즈 선수단의 실전 성적을 기록하고,
 * 이적 가능 기간(5월 20일 ~ 7월 31일) 중 타 구단의 간헐적 영입(연간 최대 5명 한도 내)을 반영합니다.
 */
export function simulateUlsanWhalesFuturesStats(
  next: CareerSave,
  rng: SeededRng,
  dateStr: string,
  winsInSeries: number
): void {
  ensureSpecialFuturesRosters(next);
  const uw = next.ulsanWhales!;
  const activeRoster = uw.roster.filter((p) => !p.transferredToTeamId);

  for (const up of activeRoster) {
    if (!up.futuresStats) {
      up.futuresStats = { G: 0, AB: 0, H: 0, HR: 0, RBI: 0, outs: 0, ER: 0, SO: 0, W: 0, L: 0 };
    }
    const fs = up.futuresStats;
    if (up.role === '타자') {
      const g = rng.int(2, 3);
      const ab = g * rng.int(3, 4);
      const hitRate = Math.max(0.2, Math.min(0.41, 0.255 + (up.ability - 63) * 0.0085));
      const h = Math.min(ab, Math.max(0, Math.round(ab * hitRate + (rng.next() - 0.45) * 1.3)));
      const hr = h > 0 && rng.next() < 0.14 + Math.max(0, (up.ability - 65) * 0.012) ? 1 : 0;
      const rbi = hr + (h >= 2 && rng.next() < 0.55 ? rng.int(1, 2) : 0);
      fs.G += g;
      fs.AB += ab;
      fs.H += h;
      fs.HR += hr;
      fs.RBI += rbi;
    } else {
      const isSp = up.pitchRole === '선발' || up.position === 'SP';
      const g = isSp ? (rng.next() < 0.72 ? 1 : 0) : rng.int(1, 2);
      if (g > 0) {
        const outs = isSp ? rng.int(14, 20) : rng.int(3, 6);
        const erBase = Math.max(0.06, 0.21 - (up.ability - 64) * 0.008);
        const er = Math.max(0, Math.round((outs / 3) * erBase * 2.1 + (rng.next() - 0.5) * 1.2));
        const so = Math.max(0, Math.round((outs / 3) * (0.82 + (up.ability - 64) * 0.028)));
        fs.G += g;
        fs.outs += outs;
        fs.ER += er;
        fs.SO += so;
        if (winsInSeries >= 2 && rng.next() < (isSp ? 0.48 : 0.22)) fs.W += 1;
        else if (winsInSeries === 0 && rng.next() < (isSp ? 0.35 : 0.18)) fs.L += 1;
      }
    }
  }

  // Rival KBO clubs occasionally sign 1 eligible Ulsan Whales player during open transfer window (preserving room for user)
  const winStatus = getUlsanTransferWindowStatus(next);
  if (winStatus.isOpen && uw.seasonTransfersUsed < 3 && rng.next() < 0.07) {
    const eligibleTargets = activeRoster.filter(
      (up) => (up.hasKboDraftHistory || up.isForeign) && up.ability >= 66
    );
    if (eligibleTargets.length > 0) {
      const picked = eligibleTargets[rng.int(0, eligibleTargets.length - 1)];
      const rivalCandidates = TEAM_IDS.filter((tid) => tid !== next.playerTeamId);
      const rivalTeam = rivalCandidates[rng.int(0, rivalCandidates.length - 1)];
      const check = evaluateUlsanTransferEligibility(next, picked.id, rivalTeam);
      if (check.eligible) {
        const fee = check.maxTransferFeeBillion;
        const created = buildKboPlayerFromUlsan(next, picked, rivalTeam, fee, '시즌이적');
        next.players[created.id] = created;
        reassignNonConflictingUniformNumber(next, created, rivalTeam);
        picked.transferredToTeamId = rivalTeam;
        picked.transferredSeason = next.season;
        picked.transferredDate = dateStr;
        uw.seasonTransfersUsed += 1;
        uw.transferHistory.unshift({
          id: `uw-tx-rival-${Date.now()}-${picked.id}`,
          season: next.season,
          date: dateStr,
          playerId: picked.id,
          playerName: picked.name,
          position: picked.position,
          isForeign: picked.isForeign,
          toTeamId: rivalTeam,
          transferFeeBillion: fee,
          method: '시즌이적',
        });
        if (!next.newsFeed) next.newsFeed = [];
        next.newsFeed.unshift({
          id: `news-ulsan-rival-${Date.now()}-${picked.id}`,
          date: dateStr,
          season: next.season,
          category: '타구단소식',
          headline: `[울산 웨일즈 이적] ${KBO_TEAMS[rivalTeam].shortName}, 울산 ${picked.name}(${picked.position}) 양도 영입`,
          body: `${KBO_TEAMS[rivalTeam].name}이(가) 울산 웨일즈에서 활약하던 ${picked.name} 선수를 이적료 ${fee.toFixed(2)}억 원에 영입했습니다 (시즌 누적 ${uw.seasonTransfersUsed}/${uw.maxTransfersPerSeason}명).`,
          teamId: rivalTeam,
        });
      }
    }
  }
}

/**
 * 울산 웨일즈 소속 국내 선수 중 'KBO 드래프트 미참가 선수'를 차기 KBO 신인 드래프트 풀에 자동 편입합니다.
 * (규정: 드래프트 미참가 선수는 KBO 신인 드래프트 절차를 거친 후에만 이적 가능)
 */
export function injectUndraftedUlsanPlayersIntoDraft(
  career: CareerSave,
  draftState: DraftState
): void {
  ensureSpecialFuturesRosters(career);
  const uw = career.ulsanWhales!;
  const undraftedActive = uw.roster.filter(
    (p) => !p.isForeign && !p.hasKboDraftHistory && !p.transferredToTeamId
  );
  if (undraftedActive.length === 0) return;

  const existingNames = new Set(draftState.candidates.map((c) => c.name));
  let maxId = draftState.candidates.reduce((m, c) => Math.max(m, c.id), 150);

  for (const up of undraftedActive) {
    if (existingNames.has(up.name)) continue;
    maxId += 1;
    const fs = up.futuresStats;
    const fStatStr =
      fs && fs.G > 0
        ? up.role === '타자'
          ? `울산 웨일즈 퓨처스 ${fs.G}G ${(fs.AB > 0 ? fs.H / fs.AB : 0).toFixed(3).replace(/^0/, '')} ${fs.HR}HR ${fs.RBI}RBI`
          : `울산 웨일즈 퓨처스 ${fs.G}G ${fs.W}승${fs.L}패 ERA ${fs.outs > 0 ? ((fs.ER * 27) / fs.outs).toFixed(2) : '0.00'}`
        : `울산 웨일즈 자율 선발 (${up.isOverseasUnentered ? '해외 미입단' : '트라이아웃'})`;

    const cand: DraftCandidate = {
      id: maxId,
      name: up.name,
      age: up.age,
      originType: '독립리그',
      school: '울산 웨일즈 (드래프트 참가)',
      role: up.role,
      position: up.position,
      ability: up.ability,
      potential: up.potential,
      scoutGrade: up.potential >= 81 ? 'A' : up.potential >= 78 ? 'B+' : 'B',
      scoutTag: '울산 웨일즈 드래프트 경유',
      amateurSummary: `${fStatStr} · ${up.scoutingNote}`,
      signingBonusBillion: up.potential >= 80 ? 0.9 : 0.5,
    };
    draftState.candidates.push(cand);
    existingNames.add(up.name);
  }
}

/**
 * KBO 신인 드래프트에서 울산 웨일즈 출신 드래프트 미참가 선수가 지명되었을 때 울산 명단에서 이적 완료 처리합니다.
 */
export function markUlsanPlayerDrafted(
  career: CareerSave,
  playerName: string,
  draftedByTeamId: TeamId,
  dateStr: string
): void {
  if (!career.ulsanWhales) return;
  const target = career.ulsanWhales.roster.find(
    (p) => !p.isForeign && !p.hasKboDraftHistory && !p.transferredToTeamId && p.name === playerName
  );
  if (!target) return;
  target.transferredToTeamId = draftedByTeamId;
  target.transferredSeason = career.season;
  target.transferredDate = dateStr;
  career.ulsanWhales.transferHistory.unshift({
    id: `uw-draft-${Date.now()}-${target.id}`,
    season: career.season,
    date: dateStr,
    playerId: target.id,
    playerName: target.name,
    position: target.position,
    isForeign: false,
    toTeamId: draftedByTeamId,
    transferFeeBillion: 0,
    method: '신인드래프트',
  });
}

/**
 * 새 시즌 개막 시 울산 웨일즈 시즌 이적 카운터(0/5)를 초기화하고,
 * 이적한 자리만큼 새 자율 선발 선수로 뎁스를 보충합니다.
 */
export function resetUlsanWhalesForNewSeason(career: CareerSave, nextSeason: number): void {
  ensureSpecialFuturesRosters(career);
  const uw = career.ulsanWhales!;
  uw.seasonTransfersUsed = 0;
  const nextIso = `${nextSeason}-01-01`;
  for (const p of uw.roster) {
    if (!p.transferredToTeamId) {
      syncEntityAgeInPlace(p, nextIso);
      p.futuresStats = { G: 0, AB: 0, H: 0, HR: 0, RBI: 0, outs: 0, ER: 0, SO: 0, W: 0, L: 0 };
    }
  }
  // Remove already transferred players from active roster list after recording in transferHistory
  uw.roster = uw.roster.filter((p) => !p.transferredToTeamId);
}
