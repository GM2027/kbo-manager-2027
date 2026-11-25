import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { CareerSave, IncomingTradeOffer, Player, TeamId } from '../types/kbo';
import {
  computePlayerTradeValue,
  ensureDeepFranchiseState,
  getTradeWindowStatus,
  reassignNonConflictingUniformNumber,
  validateTradeCompliance,
} from './deepFranchise';
import { SeededRng } from './rng';
import { computeStandings } from './stats';
import {
  applyFranchiseStarTransferConsequencesInPlace,
  evaluateFranchiseStar,
  evaluateLegendTradeAvailability,
  evaluatePlayerTradeValuationDetailed,
} from './franchiseStarEngine';
import { recordLeagueAcquisitionInPlace } from './leagueAcquisitionsEngine';
import { recordDraftPickTradeInPlace } from './leagueLifeEngine';
import { getCurrentCareerDate } from './salaryCapEngine';

function getClubStance(career: CareerSave, teamId: TeamId): '우승도전' | '리빌딩' | '균형운영' {
  const standings = computeStandings(career.gamesLedger);
  const row = standings.find((r) => r.teamId === teamId);
  if (!row || career.gamesPlayed < 12) {
    // Early season / offseason heuristic by 1군 average ability
    const starters = Object.values(career.players).filter(
      (p) => p.teamId === teamId && p.rosterTier === '1군'
    );
    const avg =
      starters.length > 0
        ? starters.reduce((s, p) => s + p.ability, 0) / starters.length
        : 73;
    if (avg >= 76) return '우승도전';
    if (avg <= 72.5) return '리빌딩';
    return '균형운영';
  }
  if (row.rank <= 4) return '우승도전';
  if (row.rank >= 8) return '리빌딩';
  return '균형운영';
}

function isPlayerTradeable(career: CareerSave, p: Player): boolean {
  if (p.category !== '국내') return false;
  if (
    p.rosterTier === '은퇴' ||
    p.rosterTier === '해외이적' ||
    p.rosterTier === 'FA' ||
    p.rosterTier === '육성' ||
    p.rosterTier === '제외후보'
  ) {
    return false;
  }
  if (isMilitaryServing(p.militaryStatus)) return false;
  if (p.nationalTeamDuty) return false;
  if (p.signedAsFaSeason === career.season) return false;
  if (p.injury) return false;
  // 모든 10개 구단 프랜차이즈 스타(지수 95+ 포함)는 자동 트레이드 및 AI 제안 대상에서 절대 제외
  const franAssess = evaluateFranchiseStar(career, p);
  if (franAssess.score >= 95 && !p.tradeRequested) return false;
  const legendGate = evaluateLegendTradeAvailability(career, p);
  if (legendGate.isLegend && !legendGate.available) return false;
  return true;
}

export function isIncomingTradeWindowOpen(career: CareerSave): boolean {
  return getTradeWindowStatus(career).isOpen;
}

export function getPendingIncomingTradeOffers(career: CareerSave): IncomingTradeOffer[] {
  const offers = career.incomingTradeOffers ?? [];
  return offers.filter((o) => {
    if (o.status !== '대기') return false;
    if (career.phase === 'REGULAR_SEASON' && career.gamesPlayed > o.expiresRound) return false;
    const reqOk = o.requestPlayerIds.every((id) => {
      const p = career.players[id];
      return p && p.teamId === career.playerTeamId && isPlayerTradeable(career, p);
    });
    const offOk = o.offerPlayerIds.every((id) => {
      const p = career.players[id];
      return p && p.teamId === o.fromTeamId && isPlayerTradeable(career, p);
    });
    return reqOk && offOk;
  });
}

function craftSingleIncomingOffer(
  career: CareerSave,
  rng: SeededRng,
  dateStr: string,
  excludeTeamIds: Set<TeamId>
): IncomingTradeOffer | null {
  if (!isIncomingTradeWindowOpen(career)) return null;

  const myPool = Object.values(career.players).filter(
    (p) => p.teamId === career.playerTeamId && isPlayerTradeable(career, p)
  );
  if (myPool.length < 12) return null;

  const rivalTeams = TEAM_IDS.filter((t) => t !== career.playerTeamId && !excludeTeamIds.has(t));
  if (rivalTeams.length === 0) return null;

  const fromTeamId = rivalTeams[rng.int(0, rivalTeams.length - 1)];
  const stance = getClubStance(career, fromTeamId);

  const rivalPool = Object.values(career.players).filter(
    (p) => p.teamId === fromTeamId && isPlayerTradeable(career, p)
  );
  if (rivalPool.length < 12) return null;

  // Prefer players who requested a trade, or players fitting rival club positional need & stance
  const rivalActiveFirst = Object.values(career.players).filter(
    (p) => p.teamId === fromTeamId && p.rosterTier === '1군' && !p.injury
  );
  const hasPosNeed = (cand: Player): boolean => {
    if (cand.role === '투수') {
      const isSp = cand.position === 'SP' || cand.pitchRole === '선발';
      const same = rivalActiveFirst
        .filter((p) => p.role === '투수' && (isSp ? p.position === 'SP' || p.pitchRole === '선발' : p.position !== 'SP' && p.pitchRole !== '선발'))
        .sort((a, b) => b.ability - a.ability);
      const benchMark = same[Math.min(same.length - 1, isSp ? 4 : 5)]?.ability ?? 66;
      return same.length < (isSp ? 4 : 5) || cand.ability >= benchMark + 2;
    }
    const isOf = cand.position === 'LF' || cand.position === 'CF' || cand.position === 'RF';
    const same = rivalActiveFirst
      .filter((p) => p.role === '타자' && (p.position === cand.position || (isOf && (p.position === 'LF' || p.position === 'CF' || p.position === 'RF'))))
      .sort((a, b) => b.ability - a.ability);
    const benchMark = same[(isOf ? 3 : 1) - 1]?.ability ?? 65;
    return same.length < (isOf ? 3 : 1) || cand.ability >= benchMark + 1;
  };

  const tradeRequesters = myPool.filter((p) => p.tradeRequested);
  const highDissatPlayers = myPool.filter(
    (p) => !p.tradeRequested && (p.dissatisfaction ?? 0) >= 65
  );
  let targetCandidates: Player[];
  if (tradeRequesters.length > 0 && rng.next() < 0.72) {
    targetCandidates = tradeRequesters;
  } else if (highDissatPlayers.length > 0 && rng.next() < 0.45) {
    // 불만도 65+ 높은 선수에게도 타 구단이 선제적으로 트레이드 제안 가능
    targetCandidates = highDissatPlayers;
  } else if (stance === '우승도전') {
    const needFits = myPool.filter((p) => p.rosterTier === '1군' && p.ability >= 73 && p.ability <= 83 && hasPosNeed(p));
    targetCandidates = needFits.length > 0 ? needFits : myPool.filter((p) => p.rosterTier === '1군' && p.ability >= 72 && p.ability <= 83);
  } else if (stance === '리빌딩') {
    const needFits = myPool.filter((p) => p.age <= 25 && p.potential >= 77 && (hasPosNeed(p) || p.potential >= 80));
    targetCandidates = needFits.length > 0 ? needFits : myPool.filter((p) => p.age <= 25 && p.potential >= 77);
  } else {
    const needFits = myPool.filter((p) => p.ability >= 69 && p.ability <= 81 && hasPosNeed(p));
    targetCandidates = needFits.length > 0 ? needFits : myPool.filter((p) => p.ability >= 69 && p.ability <= 81);
  }
  if (targetCandidates.length === 0) {
    targetCandidates = myPool.filter((p) => p.ability >= 68 && p.ability <= 82);
  }
  if (targetCandidates.length === 0) return null;

  const requestedPlayer = targetCandidates[rng.int(0, targetCandidates.length - 1)];
  const reqVal = Math.max(
    computePlayerTradeValue(requestedPlayer).index,
    evaluatePlayerTradeValuationDetailed(career, requestedPlayer).homeClubValue
  );

  // Build balanced counter-package from rivalPool (1:1 or 2:1 + optional cash) using detailed valuation (OVR, POT, age, salary, yearsRemaining)
  const rivalSorted = rivalPool
    .map((p) => ({
      p,
      val: Math.max(
        computePlayerTradeValue(p).index,
        evaluatePlayerTradeValuationDetailed(career, p).homeClubValue
      ),
    }))
    .filter(({ p }) => p.id !== requestedPlayer.id);

  // Try 1:1 close match first, else 2:1 package
  const closeOneToOne = rivalSorted.filter(
    ({ val }) => val >= reqVal * 0.88 && val <= reqVal * 1.18
  );

  let offerPlayers: Player[] = [];
  let offerCash = 0;

  if (closeOneToOne.length > 0 && rng.next() < 0.58) {
    const pick = closeOneToOne[rng.int(0, closeOneToOne.length - 1)];
    offerPlayers = [pick.p];
    if (pick.val < reqVal) {
      offerCash = Math.min(8, Math.max(0.5, Number(((reqVal - pick.val) * 0.22).toFixed(1))));
    }
  } else {
    // 2:1 package: 1 core piece (~60-78% of reqVal) + 1 prospect/depth (~25-45% of reqVal)
    const primaryCands = rivalSorted.filter(
      ({ val }) => val >= reqVal * 0.52 && val <= reqVal * 0.85
    );
    const secondaryCands = rivalSorted.filter(
      ({ val }) => val >= reqVal * 0.2 && val <= reqVal * 0.55
    );
    if (primaryCands.length > 0 && secondaryCands.length > 0) {
      const p1 = primaryCands[rng.int(0, primaryCands.length - 1)];
      const secFiltered = secondaryCands.filter((x) => x.p.id !== p1.p.id);
      if (secFiltered.length > 0) {
        const p2 = secFiltered[rng.int(0, secFiltered.length - 1)];
        offerPlayers = [p1.p, p2.p];
        const sumVal = p1.val + p2.val;
        if (sumVal < reqVal) {
          offerCash = Math.min(6, Math.max(0.5, Number(((reqVal - sumVal) * 0.2).toFixed(1))));
        }
      }
    }
  }

  if (offerPlayers.length === 0) {
    // Fallback nearest-value 1:1 + cash
    rivalSorted.sort((a, b) => Math.abs(a.val - reqVal) - Math.abs(b.val - reqVal));
    if (rivalSorted.length === 0) return null;
    offerPlayers = [rivalSorted[0].p];
    if (rivalSorted[0].val < reqVal) {
      offerCash = Math.min(10, Math.max(0.5, Number(((reqVal - rivalSorted[0].val) * 0.22).toFixed(1))));
    }
  }

  // Validate KBO trade compliance
  const compliance = validateTradeCompliance(career, {
    targetTeamId: fromTeamId,
    myPlayerIds: [requestedPlayer.id],
    theirPlayerIds: offerPlayers.map((p) => p.id),
  });
  if (!compliance.valid) return null;

  // 상위권 구단(우승도전)은 즉시전력감 영입을 위해 유망주 + 차기 지명권 패키지 제안 가능
  const myStance = getClubStance(career, career.playerTeamId);
  let offerDraftPickRound: 1 | 2 | 3 | null = null;
  if (
    (stance === '우승도전' || myStance === '리빌딩') &&
    reqVal >= 58 &&
    offerCash >= 2 &&
    rng.next() < 0.42
  ) {
    offerDraftPickRound = reqVal >= 76 ? 2 : 3;
    offerCash = Math.max(0, Number((offerCash - (offerDraftPickRound === 2 ? 2.5 : 1.5)).toFixed(1)));
  }

  const fromName = KBO_TEAMS[fromTeamId].shortName;
  const pickNote = offerDraftPickRound ? ` (차기 ${offerDraftPickRound}R 지명권 포함)` : '';
  const stancePitch =
    requestedPlayer.tradeRequested
      ? `${requestedPlayer.name} 선수의 이적 요청 소식을 접하고 즉시 영입 패키지를 제안합니다.${pickNote}`
      : stance === '우승도전'
      ? `가을야구 우승 즉시전력감 보강을 위해 ${requestedPlayer.position} 자원 ${requestedPlayer.name} 영입을 희망합니다.${pickNote}`
      : stance === '리빌딩'
      ? `중장기 리빌딩 핵심 유망주 확보를 위해 ${requestedPlayer.name}(${requestedPlayer.age}세) 영입을 적극 타진합니다.${pickNote}`
      : `양 구단의 포지션 취약점을 상호 보완할 수 있는 균형 트레이드 제안입니다.${pickNote}`;

  const expiresRound =
    career.phase === 'OFFSEASON'
      ? 144
      : Math.min(career.tradeDeadlineRound ?? 106, career.gamesPlayed + 9);

  return {
    id: `in-trade-${career.season}-${career.gamesPlayed}-${fromTeamId}-${rng.int(1000, 9999)}`,
    fromTeamId,
    createdDate: dateStr,
    expiresRound,
    offerPlayerIds: offerPlayers.map((p) => p.id),
    requestPlayerIds: [requestedPlayer.id],
    offerCashBillion: offerCash,
    offerDraftPickRound,
    reason: `[${fromName} 단장실] ${stancePitch}`,
    aiStance: stance,
    status: '대기',
  };
}

/**
 * 정규시즌 3연전 종료 또는 오프시즌 전환 시 만료 제안을 정리하고 타 구단 트레이드 제안을 자동 수신합니다.
 */
export function refreshIncomingTradeOffers(
  career: CareerSave,
  rng: SeededRng,
  dateStr: string
): IncomingTradeOffer | null {
  ensureDeepFranchiseState(career);
  if (!career.incomingTradeOffers) career.incomingTradeOffers = [];

  // Expire outdated or invalid pending offers
  for (const o of career.incomingTradeOffers) {
    if (o.status !== '대기') continue;
    if (!isIncomingTradeWindowOpen(career) || (career.phase === 'REGULAR_SEASON' && career.gamesPlayed > o.expiresRound)) {
      o.status = '만료';
      continue;
    }
    const stillValid =
      o.requestPlayerIds.every((id) => {
        const p = career.players[id];
        return p && p.teamId === career.playerTeamId && isPlayerTradeable(career, p);
      }) &&
      o.offerPlayerIds.every((id) => {
        const p = career.players[id];
        return p && p.teamId === o.fromTeamId && isPlayerTradeable(career, p);
      });
    if (!stillValid) o.status = '만료';
  }

  const tradeWin = getTradeWindowStatus(career, dateStr);
  if (!tradeWin.isOpen) return null;

  const activePending = career.incomingTradeOffers.filter((o) => o.status === '대기');
  const maxPending = tradeWin.isDeadlineWeek ? 4 : 3;
  if (activePending.length >= maxPending) return null;

  const hasTradeRequester = Object.values(career.players).some(
    (p) => p.teamId === career.playerTeamId && p.tradeRequested && isPlayerTradeable(career, p)
  );
  // 마감일이 가까워질수록 AI 구단 트레이드 문의 빈도 대폭 증가
  const baseProb =
    career.phase === 'OFFSEASON'
      ? 0.65
      : tradeWin.isDeadlineUrgent
      ? 0.85
      : tradeWin.isDeadlineWeek
      ? 0.68
      : tradeWin.isDeadlineApproaching
      ? 0.48
      : 0.28;
  const triggerProb = hasTradeRequester ? Math.max(baseProb, 0.56) : baseProb;
  if (rng.next() > triggerProb) return null;

  const activeTeams = new Set<TeamId>(activePending.map((o) => o.fromTeamId));
  const created = craftSingleIncomingOffer(career, rng, dateStr, activeTeams);
  if (!created) return null;

  career.incomingTradeOffers.unshift(created);
  // Keep history bounded
  if (career.incomingTradeOffers.length > 20) {
    career.incomingTradeOffers = career.incomingTradeOffers.slice(0, 20);
  }

  const reqNames = created.requestPlayerIds.map((id) => career.players[id]?.name ?? '').join('·');
  const offNames = created.offerPlayerIds.map((id) => career.players[id]?.name ?? '').join('·');
  if (!career.newsFeed) career.newsFeed = [];
  career.newsFeed.unshift({
    id: `news-in-trade-${Date.now()}-${created.id}`,
    date: dateStr,
    season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
    category: '이적·계약',
    headline: `[트레이드 제안 수신] ${KBO_TEAMS[created.fromTeamId].shortName}, ${reqNames} 영입 공식 제안`,
    body: `${KBO_TEAMS[created.fromTeamId].name}이(가) ${offNames}${
      created.offerCashBillion > 0 ? ` + 현금 ${created.offerCashBillion}억` : ''
    } 카드로 ${reqNames} 트레이드를 요청했습니다. [계약·FA·트레이드] 탭에서 수락·역제안·거절할 수 있습니다.`,
    teamId: career.playerTeamId,
    isHighlight: true,
  });

  return created;
}

/**
 * 사용자가 직접 타 구단 단장실에 트레이드 문의를 띄워 즉시 1~2건의 트레이드 제안을 수신합니다.
 */
export function solicitIncomingTradeOffers(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  newOffers: IncomingTradeOffer[];
} {
  if (!isIncomingTradeWindowOpen(career)) {
    throw new Error('현재 트레이드 마감 이후이거나 포스트시즌 기간이어서 타 구단 제안을 받을 수 없습니다.');
  }
  const backupSnapshot: CareerSave = structuredClone(career);
  const next: CareerSave = structuredClone(career);
  ensureDeepFranchiseState(next);
  if (!next.incomingTradeOffers) next.incomingTradeOffers = [];

  const rng = new SeededRng((next.rngState || 12345) + Date.now() % 100000);
  const dateStr =
    next.phase === 'OFFSEASON'
      ? `${next.season}-11-18`
      : next.schedule[next.currentSeriesIndex]?.dates?.[0] ?? `${next.season}-05-15`;

  const existingTeams = new Set<TeamId>(
    next.incomingTradeOffers.filter((o) => o.status === '대기').map((o) => o.fromTeamId)
  );

  const newOffers: IncomingTradeOffer[] = [];
  const targetCount = Math.max(1, 2 - existingTeams.size);
  for (let i = 0; i < targetCount; i++) {
    const offer = craftSingleIncomingOffer(next, rng, dateStr, existingTeams);
    if (offer) {
      existingTeams.add(offer.fromTeamId);
      next.incomingTradeOffers.unshift(offer);
      newOffers.push(offer);
    }
  }

  if (newOffers.length === 0) {
    throw new Error('현재 추가 트레이드 제안을 보낼 수 있는 상대 구단이 없습니다. 기존 대기 제안을 먼저 처리하세요.');
  }

  next.rngState = rng.getState();
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, newOffers };
}

/**
 * 타 구단의 트레이드 제안을 수락해 즉시 선수 및 현금을 교환합니다.
 */
export function acceptIncomingTradeOffer(
  career: CareerSave,
  offerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave; summary: string } {
  const backupSnapshot: CareerSave = structuredClone(career);
  const next: CareerSave = structuredClone(career);
  ensureDeepFranchiseState(next);

  const offer = (next.incomingTradeOffers ?? []).find((o) => o.id === offerId);
  if (!offer || offer.status !== '대기') {
    throw new Error('유효한 대기 상태의 트레이드 제안이 아닙니다.');
  }
  if (!isIncomingTradeWindowOpen(next)) {
    offer.status = '만료';
    throw new Error('트레이드 마감 이후에는 제안을 수락할 수 없습니다.');
  }

  const compliance = validateTradeCompliance(next, {
    targetTeamId: offer.fromTeamId,
    myPlayerIds: offer.requestPlayerIds,
    theirPlayerIds: offer.offerPlayerIds,
  });
  if (!compliance.valid) {
    throw new Error(compliance.reason ?? 'KBO 트레이드 규정에 위배됩니다.');
  }

  const myTeamId = next.playerTeamId;
  const fromTeamId = offer.fromTeamId;

  const giveNames: string[] = [];
  const recvNames: string[] = [];

  for (const pid of offer.requestPlayerIds) {
    const p = next.players[pid];
    if (!p || p.teamId !== myTeamId) {
      throw new Error('요청 선수가 더 이상 우리 구단 소속이 아닙니다.');
    }
    giveNames.push(p.name);
    applyFranchiseStarTransferConsequencesInPlace(next, p, myTeamId, fromTeamId, '트레이드');
    if (next.competitiveBalance?.clubs?.[myTeamId]?.exceptionPlayerId === pid) {
      next.competitiveBalance.clubs[myTeamId].exceptionPlayerId = null;
    }
    next.teams[myTeamId].lineupOrder = next.teams[myTeamId].lineupOrder.filter((id) => id !== pid);
    next.teams[myTeamId].benchOrder = next.teams[myTeamId].benchOrder.filter((id) => id !== pid);
    next.teams[myTeamId].rotationOrder = next.teams[myTeamId].rotationOrder.filter((id) => id !== pid);
    next.teams[myTeamId].bullpenOrder = next.teams[myTeamId].bullpenOrder.filter((id) => id !== pid);

    p.teamId = fromTeamId;
    p.clubTenureSeasons = 1;
    p.tradeRequested = false;
    p.morale = '만족';
    reassignNonConflictingUniformNumber(next, p, fromTeamId);

    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `trade-inc-${offer.id}-${pid}-${fromTeamId}`,
        season: next.season,
        date: getCurrentCareerDate(next).isoDate,
        category: '트레이드',
        playerId: pid,
        playerName: p.name,
        position: p.position,
        previousTeamLabel: KBO_TEAMS[myTeamId].shortName,
        acquiringTeamId: fromTeamId,
        contractAmountLabel: `기존 계약 승계 (연 ${p.contract.annualSalary}억)`,
        note: `${KBO_TEAMS[myTeamId].shortName}↔${KBO_TEAMS[fromTeamId].shortName} 트레이드`,
      },
      { pushNewsAlert: false }
    );

    if (p.rosterTier === '1군') {
      if (p.role === '투수') {
        if (p.pitchRole === '선발' && next.teams[fromTeamId].rotationOrder.length < 5) {
          next.teams[fromTeamId].rotationOrder.push(pid);
        } else {
          next.teams[fromTeamId].bullpenOrder.push(pid);
        }
      } else {
        next.teams[fromTeamId].benchOrder.push(pid);
      }
    }
  }

  for (const pid of offer.offerPlayerIds) {
    const p = next.players[pid];
    if (!p || p.teamId !== fromTeamId) {
      throw new Error('상대 제시 선수가 더 이상 상대 구단 소속이 아닙니다.');
    }
    recvNames.push(p.name);
    applyFranchiseStarTransferConsequencesInPlace(next, p, fromTeamId, myTeamId, '트레이드');
    if (next.competitiveBalance?.clubs?.[fromTeamId]?.exceptionPlayerId === pid) {
      next.competitiveBalance.clubs[fromTeamId].exceptionPlayerId = null;
    }
    next.teams[fromTeamId].lineupOrder = next.teams[fromTeamId].lineupOrder.filter((id) => id !== pid);
    next.teams[fromTeamId].benchOrder = next.teams[fromTeamId].benchOrder.filter((id) => id !== pid);
    next.teams[fromTeamId].rotationOrder = next.teams[fromTeamId].rotationOrder.filter((id) => id !== pid);
    next.teams[fromTeamId].bullpenOrder = next.teams[fromTeamId].bullpenOrder.filter((id) => id !== pid);

    p.teamId = myTeamId;
    p.clubTenureSeasons = 1;
    p.tradeRequested = false;
    p.morale = '만족';
    p.acquiredRound = next.gamesPlayed;
    p.acquiredSeason = next.season;
    reassignNonConflictingUniformNumber(next, p, myTeamId);

    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `trade-inc-${offer.id}-${pid}-${myTeamId}`,
        season: next.season,
        date: getCurrentCareerDate(next).isoDate,
        category: '트레이드',
        playerId: pid,
        playerName: p.name,
        position: p.position,
        previousTeamLabel: KBO_TEAMS[fromTeamId].shortName,
        acquiringTeamId: myTeamId,
        contractAmountLabel: `기존 계약 승계 (연 ${p.contract.annualSalary}억)`,
        note: `${KBO_TEAMS[fromTeamId].shortName} 제안 수락 트레이드`,
      },
      { pushNewsAlert: false }
    );

    if (p.rosterTier === '1군') {
      if (p.role === '투수') {
        if (p.pitchRole === '선발' && next.teams[myTeamId].rotationOrder.length < 5) {
          next.teams[myTeamId].rotationOrder.push(pid);
        } else {
          next.teams[myTeamId].bullpenOrder.push(pid);
        }
      } else {
        next.teams[myTeamId].benchOrder.push(pid);
      }
    }
  }

  // Credit incoming cash & draft pick to user club
  if (offer.offerCashBillion > 0) {
    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number(
        (next.finances.cashBalanceBillion + offer.offerCashBillion).toFixed(2)
      );
    }
    next.finances.seasonRevenueBillion = Number(
      (next.finances.seasonRevenueBillion + offer.offerCashBillion).toFixed(2)
    );
  }
  if (offer.offerDraftPickRound) {
    recordDraftPickTradeInPlace(
      next,
      offer.offerDraftPickRound,
      fromTeamId,
      myTeamId,
      getCurrentCareerDate(next).isoDate
    );
  }

  // Ensure user starting lineup remains 9 players if a starter was traded away
  if (next.teams[myTeamId].lineupOrder.length < 9) {
    const availableBench = Object.values(next.players)
      .filter(
        (p) =>
          p.teamId === myTeamId &&
          p.role === '타자' &&
          p.rosterTier === '1군' &&
          !next.teams[myTeamId].lineupOrder.includes(p.id)
      )
      .sort((a, b) => b.ability - a.ability);
    for (const b of availableBench) {
      if (next.teams[myTeamId].lineupOrder.length >= 9) break;
      next.teams[myTeamId].lineupOrder.push(b.id);
      next.teams[myTeamId].benchOrder = next.teams[myTeamId].benchOrder.filter((id) => id !== b.id);
    }
  }

  offer.status = '수락';
  // Expire any other pending offers involving the moved players
  const movedSet = new Set([...offer.requestPlayerIds, ...offer.offerPlayerIds]);
  for (const other of next.incomingTradeOffers ?? []) {
    if (other.id !== offer.id && other.status === '대기') {
      if (
        other.requestPlayerIds.some((id) => movedSet.has(id)) ||
        other.offerPlayerIds.some((id) => movedSet.has(id))
      ) {
        other.status = '만료';
      }
    }
  }

  const dateStr =
    next.phase === 'OFFSEASON'
      ? `${next.season}-11-20`
      : next.schedule[next.currentSeriesIndex]?.dates?.[0] ?? `${next.season}-06-01`;

  const summary = `${KBO_TEAMS[fromTeamId].shortName} 트레이드 제안 수락: 영입 [${recvNames.join(', ')}${
    offer.offerCashBillion > 0 ? ` + 현금 ${offer.offerCashBillion}억` : ''
  }] ↔ 이적 [${giveNames.join(', ')}]`;

  next.transactionLogs.unshift({
    id: `tx-in-trade-${Date.now()}`,
    date: dateStr,
    type: '트레이드',
    teamId: myTeamId,
    summary,
  });

  if (!next.newsFeed) next.newsFeed = [];
  next.newsFeed.unshift({
    id: `news-in-trade-done-${Date.now()}`,
    date: dateStr,
    season: next.phase === 'OFFSEASON' ? next.season + 1 : next.season,
    category: '이적·계약',
    headline: `[트레이드 성사] ${KBO_TEAMS[myTeamId].shortName}·${KBO_TEAMS[fromTeamId].shortName}, ${recvNames.join('·')} ↔ ${giveNames.join('·')} 맞트레이드`,
    body: `${KBO_TEAMS[fromTeamId].name}의 공식 트레이드 제안을 ${KBO_TEAMS[myTeamId].name} 단장실이 수락하며 트레이드가 최종 확정되었습니다.`,
    teamId: myTeamId,
    isHighlight: true,
  });

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, summary };
}

/**
 * 타 구단의 트레이드 제안을 거절합니다.
 */
export function rejectIncomingTradeOffer(
  career: CareerSave,
  offerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot: CareerSave = structuredClone(career);
  const next: CareerSave = structuredClone(career);
  const offer = (next.incomingTradeOffers ?? []).find((o) => o.id === offerId);
  if (!offer) throw new Error('해당 트레이드 제안을 찾을 수 없습니다.');
  offer.status = '거절';
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}
