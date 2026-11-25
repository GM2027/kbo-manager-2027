import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { allocateTeamUniformNumber } from '../data/playerMetadata';
import {
  CareerSave,
  Player,
  PlayerContract,
  TeamId,
  UnclaimedFreeAgentItem,
  WaiverPlayerItem,
} from '../types/kbo';
import { recordLeagueAcquisitionInPlace } from './leagueAcquisitionsEngine';
import {
  appendPlayerTeamHistoryInPlace,
  markReleasedPlayerSignedInPlace,
  recordReleasedPlayerInPlace,
} from './leagueLifeEngine';
import { SeededRng } from './rng';
import { getCurrentCareerDate } from './salaryCapEngine';
import { computeStandings } from './stats';

/** KBO 공식 웨이버 이적료: 300만 원 (= 0.003억 원) */
export const KBO_WAIVER_FEE_MANWON = 300;
export const KBO_WAIVER_FEE_BILLION = 0.003;
/** KBO 공식 웨이버 영입 신청 접수 기간: 7일 */
export const KBO_WAIVER_CLAIM_WINDOW_DAYS = 7;
/** KBO 공식 웨이버 영입 후 재웨이버 금지 기간: 60일 */
export const KBO_REWAIVER_LOCK_DAYS = 60;

const INDEPENDENT_LEAGUE_CLUBS = [
  '연천 미라클 (독립리그)',
  '성남 맥파이스 (독립리그)',
  '파주 챌린저스 (독립리그)',
  '화성 코리요 (독립리그)',
  '수원 파인이그스 (독립리그)',
];

function cloneCareer<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function addCalendarDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function diffCalendarDaysIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function ensureWaiverStateInPlace(career: CareerSave): void {
  if (!career.waiverPool) career.waiverPool = [];
  if (!career.unclaimedFreeAgents) career.unclaimedFreeAgents = [];
  if (!career.newsFeed) career.newsFeed = [];
}

/**
 * 선수의 60일 재웨이버 금지 여부 확인
 */
export function getReWaiverRestrictionStatus(
  player: Player,
  currentDateIso: string
): { blocked: boolean; remainingDays: number; untilDate?: string } {
  if (player.reWaiverBlockedUntilDate) {
    const rem = diffCalendarDaysIso(currentDateIso, player.reWaiverBlockedUntilDate);
    if (rem > 0) {
      return { blocked: true, remainingDays: rem, untilDate: player.reWaiverBlockedUntilDate };
    }
  }
  if (player.waiverClaimedDate) {
    const elapsed = diffCalendarDaysIso(player.waiverClaimedDate, currentDateIso);
    if (elapsed < KBO_REWAIVER_LOCK_DAYS) {
      const untilDate = addCalendarDaysIso(player.waiverClaimedDate, KBO_REWAIVER_LOCK_DAYS);
      return {
        blocked: true,
        remainingDays: KBO_REWAIVER_LOCK_DAYS - Math.max(0, elapsed),
        untilDate,
      };
    }
  }
  return { blocked: false, remainingDays: 0 };
}

/**
 * 8월 1일 이후 웨이버 이적 여부 (포스트시즌 출전 제한 기준)
 */
export function isPostAugustFirstTransfer(isoDate: string, season: number): boolean {
  return isoDate >= `${season}-08-01`;
}

/**
 * 현재 순위 기준 성적 역순 우선권 정렬 (최하위 10위 -> 1위)
 */
export function pickLowestRankedClaimant(
  career: CareerSave,
  claimantTeamIds: TeamId[]
): TeamId | null {
  if (claimantTeamIds.length === 0) return null;
  if (claimantTeamIds.length === 1) return claimantTeamIds[0];

  const standings = computeStandings(career.gamesLedger);
  const rankMap = new Map<TeamId, { rank: number; pct: number }>();
  standings.forEach((row, idx) => {
    rankMap.set(row.teamId, { rank: row.rank ?? idx + 1, pct: row.pct });
  });

  // Sort descending by rank (10th before 1st), tiebreak by lower winning percentage
  const sorted = [...claimantTeamIds].sort((a, b) => {
    const ra = rankMap.get(a) ?? { rank: 5, pct: 0.5 };
    const rb = rankMap.get(b) ?? { rank: 5, pct: 0.5 };
    if (rb.rank !== ra.rank) return rb.rank - ra.rank;
    return ra.pct - rb.pct;
  });
  return sorted[0];
}

/**
 * 선수 웨이버 공시 실행 (사용자 & AI 공통 규칙)
 * - 공시 즉시 선수단(1군/2군/타순/로테이션/불펜)에서 제외
 * - 60일 재웨이버 금지 체크
 * - 기존 계약(preservedContract) 보존 + 이적료 300만 원 + 7일 신청 기간 설정
 */
export function waiveDomesticPlayerInPlace(
  career: CareerSave,
  teamId: TeamId,
  playerId: string,
  options?: { dateIso?: string; reason?: string; bumpVersion?: boolean }
): WaiverPlayerItem {
  ensureWaiverStateInPlace(career);
  const p = career.players[playerId];
  if (!p || p.teamId !== teamId) {
    throw new Error('웨이버 공시할 소속 선수를 찾을 수 없습니다.');
  }
  if (p.category !== '국내') {
    throw new Error('외국인 선수는 외국인 계약 탭에서 해지하세요.');
  }

  const dateIso = options?.dateIso ?? getCurrentCareerDate(career).isoDate;
  const reWaiverCheck = getReWaiverRestrictionStatus(p, dateIso);
  if (reWaiverCheck.blocked) {
    throw new Error(
      `${p.name} 선수는 웨이버 영입 후 60일간 재웨이버 공시가 금지됩니다 (해제일 ${reWaiverCheck.untilDate}, 잔여 ${reWaiverCheck.remainingDays}일).`
    );
  }

  // 기존 계약 정보 보존 (영입 구단 승계용 · 방출 구단 잔여 보장 계약 데드머니 유지)
  const minSal = career.season >= 2027 ? 0.33 : 0.3;
  const origYearsRem = Math.max(1, p.contract.yearsRemaining || 1);
  const origAnnual = Math.max(minSal, p.contract.annualSalary || minSal);
  const preservedContract: PlayerContract = {
    ...JSON.parse(JSON.stringify(p.contract)),
    status: '확정',
    years: Math.max(1, p.contract.years || 1),
    yearsRemaining: origYearsRem,
    annualSalary: origAnnual,
    totalValue: Math.max(minSal, p.contract.totalValue || origAnnual),
  };

  // 방출 선수 잔여 보장 계약 지급 의무 기록 (타 구단 웨이버 클레임 시 승계 해제 가능)
  if (teamId === career.playerTeamId && origAnnual > 0) {
    career.finances.deadMoneyEntries = career.finances.deadMoneyEntries ?? [];
    if (!career.finances.deadMoneyEntries.some((d) => d.playerId === p.id && d.remainingSeasons > 0)) {
      career.finances.deadMoneyEntries.push({
        id: `dm-waiv-${Date.now()}-${p.id}`,
        playerId: p.id,
        playerName: p.name,
        teamId,
        releasedDate: dateIso,
        releasedSeason: career.season,
        currency: 'KRW',
        annualObligationBillion: origAnnual,
        remainingSeasons: origYearsRem,
        totalRemainingBillion: Number((origAnnual * origYearsRem).toFixed(2)),
        reason: '국내 선수 웨이버 방출 잔여 보장 계약',
      });
    }
  }

  // 공시 즉시 선수단에서 제외
  const t = career.teams[teamId];
  p.rosterTier = '제외후보';
  p.gameDayActive = false;
  p.contract.status = '만료';
  p.contract.yearsRemaining = 0;

  t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
  t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
  t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
  t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);

  if (p.ability >= 76 && teamId === career.playerTeamId) {
    t.fanSentiment = Math.max(15, (t.fanSentiment ?? 65) - 5);
  }

  const expiresDate = addCalendarDaysIso(dateIso, KBO_WAIVER_CLAIM_WINDOW_DAYS);
  const waiverItem: WaiverPlayerItem = {
    id: `waiv-${teamId}-${Date.now()}-${p.id}`,
    player: JSON.parse(JSON.stringify(p)) as Player,
    fromTeamId: teamId,
    waivedDate: dateIso,
    expiresDate,
    claimCostBillion: KBO_WAIVER_FEE_BILLION,
    claimFeeManwon: KBO_WAIVER_FEE_MANWON,
    claimTeamIds: [],
    preservedContract,
    reason: options?.reason ?? `${KBO_TEAMS[teamId].shortName} 선수단 정리 웨이버 공시`,
    expiresAtRound: career.gamesPlayed + KBO_WAIVER_CLAIM_WINDOW_DAYS,
  };
  // Put restored contract on the snapshot player so records & contract info stay intact
  waiverItem.player.contract = JSON.parse(JSON.stringify(preservedContract)) as PlayerContract;

  career.waiverPool!.unshift(waiverItem);
  recordReleasedPlayerInPlace(
    career,
    p,
    teamId,
    `${KBO_TEAMS[teamId].shortName} 웨이버 공시 (7일 영입 접수)`
  );

  career.newsFeed!.unshift({
    id: `news-waiv-rel-${Date.now()}-${p.id}`,
    season: career.season,
    date: dateIso,
    category: '규정·웨이버',
    headline: `[웨이버 공시] ${KBO_TEAMS[teamId].shortName}, ${p.name}(${p.position}·${p.age}세) 웨이버 공시`,
    body: `${KBO_TEAMS[teamId].name}이(가) ${p.name} 선수를 선수단에서 제외하고 웨이버 공시했습니다. ${expiresDate}까지 7일간 타 구단 영입 신청을 접수하며(이적료 300만 원·기존 계약 승계), 복수 신청 시 하위 순위 구단에 우선권이 부여됩니다.`,
    teamId,
  });

  career.transactionLogs.unshift({
    id: `tx-waiv-rel-${Date.now()}-${p.id}`,
    date: dateIso,
    type: '엔트리',
    teamId,
    summary: `웨이버 공시: ${p.name} (${p.position}·OVR ${p.ability} · 마감 ${expiresDate})`,
  });

  return waiverItem;
}

/**
 * 웨이버 영입 확정 공통 처리 (이적료 300만 원, 기존 계약 승계, 60일 재웨이버 금지, 8/1 이후 PS 출전 제한, 기존 기록 유지)
 */
export function awardWaiverPlayerToTeamInPlace(
  career: CareerSave,
  item: WaiverPlayerItem,
  winningTeamId: TeamId,
  resolveDateIso: string,
  extraRetiredNumbers?: number[]
): Player {
  ensureWaiverStateInPlace(career);

  // Check if user club has enough cash for 300만원 (0.003억)
  if (
    winningTeamId === career.playerTeamId &&
    career.finances.cashBalanceBillion !== null &&
    career.finances.cashBalanceBillion < KBO_WAIVER_FEE_BILLION
  ) {
    throw new Error('웨이버 이적료 300만 원 지급에 필요한 구단 자금이 부족합니다.');
  }

  // Preserve original player ID if available so career stats & records stay 100% continuous
  const existingOrig = career.players[item.player.id];
  const inheritedContract: PlayerContract = item.preservedContract
    ? JSON.parse(JSON.stringify(item.preservedContract))
    : {
        ...JSON.parse(JSON.stringify(item.player.contract)),
        status: '확정',
        yearsRemaining: Math.max(1, item.player.contract.yearsRemaining || 1),
      };
  inheritedContract.status = '확정';
  inheritedContract.note = `${career.season} 웨이버 양수·기존 계약 승계 (${KBO_TEAMS[item.fromTeamId].shortName} → ${KBO_TEAMS[winningTeamId].shortName}, 이적료 300만 원)`;

  const postAug1 = isPostAugustFirstTransfer(resolveDateIso, career.season);
  const reWaiverUntil = addCalendarDaysIso(resolveDateIso, KBO_REWAIVER_LOCK_DAYS);
  const newUniform = allocateTeamUniformNumber(
    career.players,
    winningTeamId,
    false,
    item.player.uniformNumber,
    extraRetiredNumbers
  );

  const targetId = existingOrig ? item.player.id : `${winningTeamId}-WAIV-${item.player.id}-${Date.now()}`;
  const basePlayer: Player = existingOrig
    ? existingOrig
    : (JSON.parse(JSON.stringify(item.player)) as Player);

  basePlayer.id = targetId;
  basePlayer.teamId = winningTeamId;
  basePlayer.rosterTier = '2군';
  basePlayer.gameDayActive = false;
  basePlayer.morale = '만족';
  basePlayer.uniformNumber = newUniform;
  basePlayer.contract = inheritedContract;
  basePlayer.waiverClaimedDate = resolveDateIso;
  basePlayer.reWaiverBlockedUntilDate = reWaiverUntil;
  if (postAug1) {
    basePlayer.postseasonIneligibleSeason = career.season;
  }

  appendPlayerTeamHistoryInPlace(
    basePlayer,
    winningTeamId,
    career.season,
    `웨이버 영입 (이적료 300만 원 · 계약 승계)`
  );
  career.players[targetId] = basePlayer;

  markReleasedPlayerSignedInPlace(
    career,
    item.player.id,
    winningTeamId,
    `${KBO_TEAMS[winningTeamId].name} 웨이버 영입 (300만 원·기존 계약 승계)`
  );

  // Deduct 300만원 (0.003억) from user club if user won
  if (winningTeamId === career.playerTeamId && career.finances.cashBalanceBillion !== null) {
    career.finances.cashBalanceBillion = Number(
      (career.finances.cashBalanceBillion - KBO_WAIVER_FEE_BILLION).toFixed(4)
    );
    career.finances.seasonExpenseBillion = Number(
      (career.finances.seasonExpenseBillion + KBO_WAIVER_FEE_BILLION).toFixed(4)
    );
  } else if (item.fromTeamId === career.playerTeamId && career.finances.cashBalanceBillion !== null) {
    // Receiving club pays 300만원 transfer fee to waiving club
    career.finances.cashBalanceBillion = Number(
      (career.finances.cashBalanceBillion + KBO_WAIVER_FEE_BILLION).toFixed(4)
    );
    career.finances.seasonRevenueBillion = Number(
      (career.finances.seasonRevenueBillion + KBO_WAIVER_FEE_BILLION).toFixed(4)
    );
  }

  // Remove from waiver pool
  career.waiverPool = (career.waiverPool ?? []).filter((w) => w.id !== item.id);

  const claimantCount = (item.claimTeamIds ?? []).length;
  const priorityNote =
    claimantCount > 1
      ? ` (${claimantCount}개 구단 경합 → 하위 순위 우선권 적용)`
      : '';
  const psNote = postAug1 ? ' · 8월 1일 이후 이적으로 당해 포스트시즌 출전 제한' : '';

  career.newsFeed!.unshift({
    id: `news-waiv-win-${Date.now()}-${basePlayer.id}`,
    season: career.season,
    date: resolveDateIso,
    category: '규정·웨이버',
    headline: `[웨이버 영입 확정] ${KBO_TEAMS[winningTeamId].shortName}, 전 ${KBO_TEAMS[item.fromTeamId].shortName} ${basePlayer.name} 양수${priorityNote}`,
    body: `${KBO_TEAMS[winningTeamId].name}이(가) 공식 이적료 300만 원을 지급하고 ${basePlayer.name}(${basePlayer.position}·OVR ${basePlayer.ability})의 기존 계약(연 ${inheritedContract.annualSalary}억·잔여 ${inheritedContract.yearsRemaining}년)을 승계했습니다. 영입 후 60일간 재웨이버 금지(${reWaiverUntil}까지)${psNote}.`,
    teamId: winningTeamId,
    isHighlight: winningTeamId === career.playerTeamId || claimantCount > 1,
  });

  career.transactionLogs.unshift({
    id: `tx-waiv-win-${Date.now()}-${basePlayer.id}`,
    date: resolveDateIso,
    type: '계약',
    teamId: winningTeamId,
    summary: `웨이버 영입 확정: ${basePlayer.name} (${item.fromTeamId} → ${winningTeamId} · 이적료 300만 원 · 기존 계약 승계${psNote})`,
  });

  recordLeagueAcquisitionInPlace(
    career,
    {
      dedupeKey: `waiver-${career.season}-${item.id}-${winningTeamId}`,
      season: career.season,
      date: resolveDateIso,
      category: '방출선수 영입',
      playerId: basePlayer.id,
      playerName: basePlayer.name,
      position: basePlayer.position,
      previousTeamLabel: `${KBO_TEAMS[item.fromTeamId]?.shortName ?? item.fromTeamId} (웨이버)`,
      acquiringTeamId: winningTeamId,
      contractAmountLabel: `이적료 300만 원 · 연 ${inheritedContract.annualSalary}억 승계`,
      note: `웨이버 양수${priorityNote}${psNote}`,
    },
    { pushNewsAlert: false }
  );

  return basePlayer;
}

/**
 * 7일 미영입 선수 -> 자유계약선수 명단 자동 이동 (당해 시즌 KBO 계약 금지, 시즌 종료 후 제한 해제)
 */
export function moveUnclaimedWaiverToFreeAgentInPlace(
  career: CareerSave,
  item: WaiverPlayerItem,
  resolveDateIso: string
): UnclaimedFreeAgentItem {
  ensureWaiverStateInPlace(career);

  const playerSnap = JSON.parse(JSON.stringify(item.player)) as Player;
  playerSnap.rosterTier = 'FA';
  playerSnap.gameDayActive = false;
  playerSnap.contract.status = 'FA';
  playerSnap.contract.yearsRemaining = 0;

  // Keep player record updated in master table if present
  if (career.players[item.player.id]) {
    career.players[item.player.id].rosterTier = 'FA';
    career.players[item.player.id].gameDayActive = false;
  }

  const faItem: UnclaimedFreeAgentItem = {
    id: `ufa-${career.season}-${item.player.id}-${Date.now()}`,
    player: playerSnap,
    formerTeamId: item.fromTeamId,
    waivedDate: item.waivedDate,
    enteredFreeAgentDate: resolveDateIso,
    waivedSeason: career.season,
    eligibleSeason: career.season + 1,
    status: '당해시즌계약금지',
    statusUpdatedDate: resolveDateIso,
    statusNote: `${career.season}시즌 웨이버 미영입으로 자유계약선수 공시 (${career.season + 1}시즌부터 KBO 계약 가능)`,
  };

  career.unclaimedFreeAgents!.unshift(faItem);
  career.waiverPool = (career.waiverPool ?? []).filter((w) => w.id !== item.id);

  career.newsFeed!.unshift({
    id: `news-waiv-ufa-${Date.now()}-${item.player.id}`,
    season: career.season,
    date: resolveDateIso,
    category: '규정·웨이버',
    headline: `[자유계약선수 공시] 전 ${KBO_TEAMS[item.fromTeamId].shortName} ${playerSnap.name}, 웨이버 미영입 → FA 전환`,
    body: `7일간의 웨이버 공시 기간 동안 영입 신청 구단이 없어 ${playerSnap.name}(${playerSnap.position}·${playerSnap.age}세) 선수가 자유계약선수로 전환되었습니다. 규정에 따라 ${career.season}시즌에는 KBO 구단과 계약할 수 없으며, 시즌 종료 후(${career.season + 1}시즌)부터 계약 제한이 해제됩니다.`,
    teamId: item.fromTeamId,
  });

  return faItem;
}

/**
 * 사용자 구단 7일 웨이버 영입 신청 접수 (복수 신청 시 7일 마감일에 성적 역순으로 확정)
 */
export function submitUserWaiverClaim(
  career: CareerSave,
  waiverId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureWaiverStateInPlace(next);

  const item = next.waiverPool!.find((w) => w.id === waiverId);
  if (!item) throw new Error('영입 신청할 웨이버 선수를 찾을 수 없습니다.');
  if (item.fromTeamId === next.playerTeamId) {
    throw new Error('원소속 구단이 공시한 선수는 동일 웨이버 기간에 영입 신청할 수 없습니다.');
  }
  if (!item.claimTeamIds) item.claimTeamIds = [];
  if (item.claimTeamIds.includes(next.playerTeamId)) {
    throw new Error('이미 해당 선수의 웨이버 영입 신청을 접수했습니다.');
  }
  if (
    next.finances.cashBalanceBillion !== null &&
    next.finances.cashBalanceBillion < KBO_WAIVER_FEE_BILLION
  ) {
    throw new Error('웨이버 이적료 300만 원 지급 자금이 부족합니다.');
  }

  item.claimTeamIds.push(next.playerTeamId);
  const dateIso = getCurrentCareerDate(next).isoDate;
  next.transactionLogs.unshift({
    id: `tx-waiv-apply-${Date.now()}`,
    date: dateIso,
    type: '계약',
    teamId: next.playerTeamId,
    summary: `웨이버 영입 신청 접수: ${item.player.name} (${item.fromTeamId} 공시 · 마감 ${item.expiresDate ?? '7일 내'})`,
  });

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * AI 구단 웨이버 영입 신청 평가 + 7일 마감 도래 건 일괄 심사(성적 역순 우선권 / 미영입 자유계약 전환)
 * + 장기 미계약 자유계약선수 독립리그 진출 / 은퇴 처리 + 차기 시즌 AI 영입
 */
export function processWaiverLifecycleInPlace(
  career: CareerSave,
  currentDateIso: string,
  rng: SeededRng,
  options?: { extraRetiredByTeam?: (tid: TeamId) => number[]; allowAiNewReleases?: boolean }
): { claimedCount: number; movedToFaCount: number; retiredOrIndyCount: number } {
  ensureWaiverStateInPlace(career);
  let claimedCount = 0;
  let movedToFaCount = 0;
  let retiredOrIndyCount = 0;

  const standings = computeStandings(career.gamesLedger);
  const rankMap = new Map<TeamId, number>();
  standings.forEach((r, idx) => rankMap.set(r.teamId, r.rank ?? idx + 1));

  // 1) AI 구단 영입 신청 접수 (7일 기간 중)
  for (const item of career.waiverPool ?? []) {
    if (!item.claimTeamIds) item.claimTeamIds = [];
    if (!item.expiresDate) {
      item.expiresDate = addCalendarDaysIso(item.waivedDate, KBO_WAIVER_CLAIM_WINDOW_DAYS);
    }
    const p = item.player;

    for (const tid of TEAM_IDS) {
      if (tid === career.playerTeamId || tid === item.fromTeamId) continue;
      if (item.claimTeamIds.includes(tid)) continue;

      const rank = rankMap.get(tid) ?? 5;
      // Lower-ranked teams or teams needing depth evaluate claiming based on ability, age & salary
      const needBonus = rank >= 7 ? 0.14 : rank >= 5 ? 0.08 : 0.04;
      const skillBonus = p.ability >= 73 ? 0.24 : p.ability >= 69 ? 0.12 : p.ability >= 66 ? 0.05 : -0.05;
      const ageAdj = p.age <= 27 ? 0.08 : p.age >= 34 ? -0.1 : 0;
      const salPenalty = (item.preservedContract?.annualSalary ?? p.contract.annualSalary) >= 4.0 ? -0.14 : 0;
      const claimProb = Math.max(0.01, Math.min(0.42, needBonus + skillBonus + ageAdj + salPenalty));

      if (rng.next() < claimProb) {
        item.claimTeamIds.push(tid);
      }
    }
  }

  // 2) 7일 만료된 웨이버 공시 건 최종 심사 (복수 신청 시 하위 순위 구단 우선권, 미신청 시 자유계약선수 자동 이동)
  const snapshotPool = [...(career.waiverPool ?? [])];
  for (const item of snapshotPool) {
    const expiresDate = item.expiresDate ?? addCalendarDaysIso(item.waivedDate, KBO_WAIVER_CLAIM_WINDOW_DAYS);
    const expiredByDate = currentDateIso >= expiresDate;
    const expiredByRound = career.gamesPlayed > item.expiresAtRound;
    if (!expiredByDate && !expiredByRound) continue;

    const claimants = (item.claimTeamIds ?? []).filter((tid) => tid !== item.fromTeamId);
    if (claimants.length > 0) {
      const winner = pickLowestRankedClaimant(career, claimants);
      if (winner) {
        try {
          awardWaiverPlayerToTeamInPlace(
            career,
            item,
            winner,
            currentDateIso,
            options?.extraRetiredByTeam?.(winner)
          );
          claimedCount++;
        } catch {
          // If winning club failed cash check, try next claimant or move to FA
          const fallback = pickLowestRankedClaimant(
            career,
            claimants.filter((t) => t !== winner)
          );
          if (fallback) {
            awardWaiverPlayerToTeamInPlace(
              career,
              item,
              fallback,
              currentDateIso,
              options?.extraRetiredByTeam?.(fallback)
            );
            claimedCount++;
          } else {
            moveUnclaimedWaiverToFreeAgentInPlace(career, item, currentDateIso);
            movedToFaCount++;
          }
        }
      }
    } else {
      moveUnclaimedWaiverToFreeAgentInPlace(career, item, currentDateIso);
      movedToFaCount++;
    }
  }

  // 3) AI 구단 주기적 신규 웨이버 공시 (60일 재웨이버 금지 준수)
  if (
    options?.allowAiNewReleases !== false &&
    career.phase === 'REGULAR_SEASON' &&
    (career.waiverPool ?? []).length < 3 &&
    rng.next() < 0.24
  ) {
    const aiTeams = TEAM_IDS.filter((id) => id !== career.playerTeamId);
    const chosenTeam = rng.pick(aiTeams);
    const candidates = Object.values(career.players).filter((p) => {
      if (
        p.teamId !== chosenTeam ||
        p.category !== '국내' ||
        p.rosterTier !== '2군' ||
        p.age < 24 ||
        p.ability < 63 ||
        p.ability > 74 ||
        p.injury ||
        isMilitaryServing(p.militaryStatus)
      ) {
        return false;
      }
      return !getReWaiverRestrictionStatus(p, currentDateIso).blocked;
    });
    if (candidates.length > 0) {
      const waived = rng.pick(candidates);
      waiveDomesticPlayerInPlace(career, chosenTeam, waived.id, {
        dateIso: currentDateIso,
        reason: `${KBO_TEAMS[chosenTeam].shortName} 선수단 정리 웨이버 공시`,
      });
    }
  }

  // 4) 장기 미계약 자유계약선수 처리 (나이·능력치·잠재력에 따라 독립리그 진출 또는 은퇴) + 차기 시즌 AI 계약
  for (const fa of career.unclaimedFreeAgents ?? []) {
    if (fa.status === '은퇴' || fa.status === '재계약완료') continue;

    // 차기 시즌 도래 시 계약 제한 해제
    if (fa.status === '당해시즌계약금지' && career.season >= fa.eligibleSeason) {
      fa.status = '계약가능';
      fa.statusUpdatedDate = currentDateIso;
      fa.statusNote = `${career.season}시즌 계약 제한 해제 (KBO 전 구단 영입 가능)`;
    }

    const unemployedDays = Math.max(0, diffCalendarDaysIso(fa.enteredFreeAgentDate, currentDateIso));
    const p = fa.player;

    // AI 구단 계약 가능 자유계약선수(또는 독립리그 활약 선수) 영입 시도
    if ((fa.status === '계약가능' || fa.status === '독립리그') && career.season >= fa.eligibleSeason) {
      if (p.ability >= 68 && p.age <= 34 && rng.next() < 0.14) {
        const aiTeams = TEAM_IDS.filter((t) => t !== career.playerTeamId);
        const buyer = rng.pick(aiTeams);
        signUnclaimedFreeAgentInPlace(
          career,
          fa,
          buyer,
          currentDateIso,
          options?.extraRetiredByTeam?.(buyer)
        );
        continue;
      }
    }

    // 장기 미소속 시 독립리그 진출 또는 은퇴 판정
    if (unemployedDays >= 60) {
      const shouldRetire =
        p.age >= 35 ||
        (p.age >= 32 && p.ability <= 68) ||
        (unemployedDays >= 150 && p.potential < 70) ||
        (fa.status === '독립리그' && unemployedDays >= 240 && p.age >= 29 && p.ability <= 69);

      if (shouldRetire) {
        fa.status = '은퇴';
        fa.statusUpdatedDate = currentDateIso;
        fa.statusNote = `장기 미계약(${unemployedDays}일) 및 연령(${p.age}세)·전력 평가에 따라 현역 은퇴 결정`;
        p.rosterTier = '은퇴';
        if (career.players[p.id]) career.players[p.id].rosterTier = '은퇴';
        retiredOrIndyCount++;

        career.newsFeed!.unshift({
          id: `news-ufa-retire-${Date.now()}-${p.id}`,
          season: career.season,
          date: currentDateIso,
          category: '규정·웨이버',
          headline: `[현역 은퇴] 전 ${KBO_TEAMS[fa.formerTeamId].shortName} ${p.name}, 미계약 끝 현역 은퇴 선언`,
          body: `웨이버 공시 후 자유계약선수로 남아있던 ${p.name}(${p.position}·${p.age}세) 선수가 현역 은퇴를 결정했습니다.`,
          teamId: fa.formerTeamId,
        });
      } else if (fa.status !== '독립리그' && unemployedDays >= 60 && (p.age <= 31 || p.potential >= 70)) {
        const indyClub = rng.pick(INDEPENDENT_LEAGUE_CLUBS);
        fa.status = '독립리그';
        fa.independentClubName = indyClub;
        fa.statusUpdatedDate = currentDateIso;
        fa.statusNote = `${indyClub} 입단 — 실전 감각 유지 및 ${fa.eligibleSeason}시즌 KBO 복귀 도전`;
        retiredOrIndyCount++;

        career.newsFeed!.unshift({
          id: `news-ufa-indy-${Date.now()}-${p.id}`,
          season: career.season,
          date: currentDateIso,
          category: '규정·웨이버',
          headline: `[독립리그 진출] 전 ${KBO_TEAMS[fa.formerTeamId].shortName} ${p.name}, ${indyClub} 합류`,
          body: `소속팀을 찾지 못한 ${p.name}(${p.position}·${p.age}세·잠재 ${p.potential}) 선수가 ${indyClub}에 입단해 KBO 재도전을 이어갑니다.`,
          teamId: fa.formerTeamId,
        });
      }
    }
  }

  return { claimedCount, movedToFaCount, retiredOrIndyCount };
}

/**
 * 시즌 종료 / 오프시즌 전환 시 웨이버 미영입 자유계약선수 계약 제한 해제 + 장기 미계약 정리
 */
export function unlockUnclaimedFreeAgentsForNewSeasonInPlace(
  career: CareerSave,
  newSeason: number,
  dateIso: string,
  rng?: SeededRng
): void {
  ensureWaiverStateInPlace(career);
  const localRng = rng ?? new SeededRng(newSeason * 7919 + 41);

  // Clear previous season's post-8/1 waiver postseason restriction on active players
  for (const p of Object.values(career.players)) {
    if (p.postseasonIneligibleSeason && p.postseasonIneligibleSeason < newSeason) {
      p.postseasonIneligibleSeason = undefined;
    }
  }

  for (const fa of career.unclaimedFreeAgents ?? []) {
    if (fa.status === '은퇴' || fa.status === '재계약완료') continue;

    // Age up unclaimed free agent smoothly with new season
    fa.player.age += 1;

    if (newSeason >= fa.eligibleSeason) {
      if (fa.status === '당해시즌계약금지') {
        fa.status = '계약가능';
        fa.statusUpdatedDate = dateIso;
        fa.statusNote = `${newSeason}시즌 도래로 KBO 계약 제한 해제 (전 구단 영입 가능)`;
      } else if (fa.status === '독립리그') {
        // Independent league players can sharpen slight ability if young, or retire if older
        if (fa.player.age <= 27 && fa.player.potential > fa.player.ability) {
          fa.player.ability = Math.min(fa.player.potential, fa.player.ability + 1);
        }
        fa.statusNote = `${fa.independentClubName ?? '독립리그'} 소속 — ${newSeason}시즌 KBO 복귀 계약 가능`;
      }
    }

    // Retire long-unemployed veterans at offseason rollover
    if (
      fa.player.age >= 36 ||
      (fa.player.age >= 33 && fa.player.ability <= 67) ||
      (newSeason >= fa.eligibleSeason + 2 && fa.player.potential < 72)
    ) {
      fa.status = '은퇴';
      fa.statusUpdatedDate = dateIso;
      fa.statusNote = `장기 미계약 및 연령(${fa.player.age}세)으로 현역 은퇴`;
      fa.player.rosterTier = '은퇴';
      if (career.players[fa.player.id]) {
        career.players[fa.player.id].rosterTier = '은퇴';
      }
    } else if (
      fa.status === '계약가능' &&
      newSeason >= fa.eligibleSeason + 1 &&
      fa.player.age <= 31
    ) {
      const club = localRng.pick(INDEPENDENT_LEAGUE_CLUBS);
      fa.status = '독립리그';
      fa.independentClubName = club;
      fa.statusUpdatedDate = dateIso;
      fa.statusNote = `장기 미계약으로 ${club} 진출 (${newSeason}시즌 KBO 재영입 가능)`;
    }
  }
}

/**
 * 자유계약선수(웨이버 미영입 / 독립리그) 계약 체결 (공통)
 */
export function signUnclaimedFreeAgentInPlace(
  career: CareerSave,
  fa: UnclaimedFreeAgentItem,
  signingTeamId: TeamId,
  dateIso: string,
  extraRetiredNumbers?: number[]
): Player {
  ensureWaiverStateInPlace(career);
  if (fa.status === '은퇴' || fa.status === '재계약완료') {
    throw new Error('이미 은퇴했거나 타 구단과 계약이 완료된 선수입니다.');
  }
  if (career.season < fa.eligibleSeason || fa.status === '당해시즌계약금지') {
    throw new Error(
      `${fa.player.name} 선수는 ${fa.waivedSeason}시즌 웨이버 미영입 자유계약선수로, ${fa.eligibleSeason}시즌부터 KBO 구단과 계약할 수 있습니다.`
    );
  }

  const salaryBillion = Number(Math.max(0.35, Math.min(2.5, (fa.player.ability - 62) * 0.08 + 0.35)).toFixed(2));
  if (
    signingTeamId === career.playerTeamId &&
    career.finances.cashBalanceBillion !== null &&
    career.finances.cashBalanceBillion < salaryBillion
  ) {
    throw new Error(`보유 자금이 부족합니다 (필요 연봉 ${salaryBillion}억 원).`);
  }

  const existingOrig = career.players[fa.player.id];
  const targetId = existingOrig ? fa.player.id : `${signingTeamId}-UFA-${fa.player.id}-${Date.now()}`;
  const signed: Player = existingOrig
    ? existingOrig
    : (JSON.parse(JSON.stringify(fa.player)) as Player);

  signed.id = targetId;
  signed.teamId = signingTeamId;
  signed.rosterTier = '2군';
  signed.gameDayActive = false;
  signed.morale = '만족';
  signed.uniformNumber = allocateTeamUniformNumber(
    career.players,
    signingTeamId,
    false,
    signed.uniformNumber,
    extraRetiredNumbers
  );
  signed.contract = {
    status: '확정',
    currency: 'KRW',
    years: 1,
    yearsRemaining: 1,
    annualSalary: salaryBillion,
    signingBonus: 0,
    totalValue: salaryBillion,
    startSeason: career.season,
    endSeason: career.season,
    note: `${career.season} 자유계약선수 재영입 (연 ${salaryBillion}억 원)`,
  };
  appendPlayerTeamHistoryInPlace(
    signed,
    signingTeamId,
    career.season,
    fa.independentClubName ? `${fa.independentClubName} → KBO 복귀` : '자유계약선수 영입'
  );
  career.players[targetId] = signed;

  fa.status = '재계약완료';
  fa.signedTeamId = signingTeamId;
  fa.statusUpdatedDate = dateIso;
  fa.statusNote = `${KBO_TEAMS[signingTeamId].name}과 1년 ${salaryBillion}억 원 계약 체결`;

  if (signingTeamId === career.playerTeamId && career.finances.cashBalanceBillion !== null) {
    career.finances.cashBalanceBillion = Number(
      (career.finances.cashBalanceBillion - salaryBillion).toFixed(2)
    );
    career.finances.seasonExpenseBillion = Number(
      (career.finances.seasonExpenseBillion + salaryBillion).toFixed(2)
    );
  }

  markReleasedPlayerSignedInPlace(
    career,
    fa.player.id,
    signingTeamId,
    `${KBO_TEAMS[signingTeamId].name} 자유계약 재영입`
  );

  career.newsFeed!.unshift({
    id: `news-ufa-sign-${Date.now()}-${signed.id}`,
    season: career.season,
    date: dateIso,
    category: '이적·계약',
    headline: `[자유계약 영입] ${KBO_TEAMS[signingTeamId].shortName}, ${signed.name}(${signed.position}) 1년 ${salaryBillion}억 계약`,
    body: `${KBO_TEAMS[signingTeamId].name}이(가) ${fa.independentClubName ? `${fa.independentClubName}에서 활약하던 ` : '자유계약 신분이던 '}${signed.name} 선수를 영입해 2군 뎁스를 보강했습니다.`,
    teamId: signingTeamId,
  });

  recordLeagueAcquisitionInPlace(
    career,
    {
      dedupeKey: `ufa-${career.season}-${fa.id}-${signingTeamId}`,
      season: career.season,
      date: dateIso,
      category: '방출선수 영입',
      playerId: signed.id,
      playerName: signed.name,
      position: signed.position,
      previousTeamLabel: fa.independentClubName ?? `${KBO_TEAMS[fa.formerTeamId]?.shortName ?? fa.formerTeamId} (자유계약)`,
      acquiringTeamId: signingTeamId,
      contractAmountLabel: `1년 ${salaryBillion}억`,
      note: '자유계약선수 영입',
    },
    { pushNewsAlert: false }
  );

  return signed;
}

/**
 * 사용자 구단 자유계약선수(웨이버 미영입/독립리그) 영입 래퍼
 */
export function signUnclaimedFreeAgentForUser(
  career: CareerSave,
  itemId: string,
  extraRetiredNumbers?: number[]
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureWaiverStateInPlace(next);

  const fa = next.unclaimedFreeAgents!.find((x) => x.id === itemId);
  if (!fa) throw new Error('영입할 자유계약선수를 찾을 수 없습니다.');

  const dateIso = getCurrentCareerDate(next).isoDate;
  signUnclaimedFreeAgentInPlace(next, fa, next.playerTeamId, dateIso, extraRetiredNumbers);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}
