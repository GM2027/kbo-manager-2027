import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { REAL_KBO_HISTORICAL_LEGENDS } from '../data/playerMetadata';
import {
  BatterStats,
  CareerBatterStats,
  CareerPitcherStats,
  CareerSave,
  ClubLegendRecord,
  Coach,
  CoachRole,
  FranchiseStarAssessment,
  FranchiseStarTier,
  PitcherStats,
  Player,
  RetiredNumberReviewResult,
  TeamId,
  TradePlayerValuationBreakdown,
} from '../types/kbo';
import { findRealPlayerClubProfile } from '../data/realKboHistories';
import { getAwardTradeValueMultiplier } from './leagueLifeEngine';
import { findRivalryBetween } from './rivalryEngine';
import { SeededRng } from './rng';
import {
  ensureCompetitiveBalanceState,
  executeAtomicCareerMutation,
  getCurrentCareerDate,
  getPlayerClubTenureSeasons,
} from './salaryCapEngine';

// =============================================================================
// 1. FRANCHISE STAR EVALUATION (소속 기간 · 통산 기록 · 구단 공헌도)
//    ※ KBO 샐러리캡 프랜차이즈 예외 선수(7시즌 이상 1명 50% 제외)와는 엄격히 별도 관리
// =============================================================================

export function computeCareerProductionPoints(p: Player): number {
  let pts = 0;
  if (p.role === '타자') {
    const cs = p.careerStats as CareerBatterStats | undefined;
    const st = p.stats as BatterStats;
    const hits = (cs?.H ?? p.careerHits ?? 0) + (st?.H ?? 0);
    const hrs = (cs?.HR ?? p.careerHR ?? 0) + (st?.HR ?? 0);
    const rbis = (cs?.RBI ?? 0) + (st?.RBI ?? 0);
    const games = (cs?.G ?? 0) + (st?.G ?? 0);
    pts += Math.min(24, Math.round(hits / 75));
    pts += Math.min(18, Math.round(hrs / 14));
    pts += Math.min(10, Math.round(rbis / 100));
    pts += Math.min(8, Math.round(games / 180));
  } else {
    const cs = p.careerStats as CareerPitcherStats | undefined;
    const st = p.stats as PitcherStats;
    const wins = (cs?.W ?? p.careerWins ?? 0) + (st?.W ?? 0);
    const saves = (cs?.SV ?? 0) + (st?.SV ?? 0);
    const holds = (cs?.HLD ?? 0) + (st?.HLD ?? 0);
    const so = (cs?.SO ?? p.careerSO ?? 0) + (st?.SO ?? 0);
    pts += Math.min(24, Math.round(wins / 4.5));
    pts += Math.min(16, Math.round(saves / 12));
    pts += Math.min(10, Math.round(holds / 18));
    pts += Math.min(14, Math.round(so / 110));
  }
  return Math.min(40, pts);
}

const PROTECTED_FRANCHISE_ICONS: Record<string, { teamId: TeamId; minScore: number }> = {
  류현진: { teamId: '한화', minScore: 98 },
  구자욱: { teamId: '삼성', minScore: 97 },
  김광현: { teamId: 'SSG', minScore: 98 },
  최정: { teamId: 'SSG', minScore: 99 },
  양현종: { teamId: 'KIA', minScore: 99 },
  김도영: { teamId: 'KIA', minScore: 95 },
  노시환: { teamId: '한화', minScore: 95 },
  문동주: { teamId: '한화', minScore: 92 },
  원태인: { teamId: '삼성', minScore: 95 },
  김혜성: { teamId: '키움', minScore: 93 },
  오지환: { teamId: 'LG', minScore: 96 },
  김현수: { teamId: 'LG', minScore: 94 },
  양의지: { teamId: '두산', minScore: 96 },
  정수빈: { teamId: '두산', minScore: 95 },
  강민호: { teamId: '삼성', minScore: 94 },
  전준우: { teamId: '롯데', minScore: 95 },
  박민우: { teamId: 'NC', minScore: 95 },
  고영표: { teamId: 'KT', minScore: 95 },
};

export function evaluateFranchiseStar(
  career: CareerSave,
  player: Player
): FranchiseStarAssessment {
  const tenureSeasons = getPlayerClubTenureSeasons(player);
  const careerPoints = computeCareerProductionPoints(player);

  // 구단 공헌도: 원클럽/장기 근속 + 현재/전성기 기량 + 구단 우승 이력 + 개인 수상 + 주장/장기계약
  let awardBonus = 0;
  for (const aw of career.awardsHistory ?? []) {
    if (aw.mvp?.playerId === player.id) awardBonus += 8;
    if (aw.koreanSeriesMvp?.playerId === player.id) awardBonus += 7;
    if (aw.choiDongWon?.playerId === player.id) awardBonus += 6;
    if (aw.goldenGloves?.some((g) => g.playerId === player.id)) awardBonus += 4;
  }
  const teamChampCount = (career.championHistory ?? []).filter(
    (c) => !c.isHistoricalBaseline && c.championTeamId === player.teamId
  ).length;
  const realProfile = findRealPlayerClubProfile(player.name, player.teamId);
  const effectiveTenure =
    realProfile && (!realProfile.expectedTeamId || realProfile.expectedTeamId === player.teamId)
      ? Math.max(tenureSeasons, realProfile.clubTenure2026 + Math.max(0, career.season - 2026))
      : tenureSeasons;

  const isCaptain = career.teams[player.teamId]?.leadership?.captainPlayerId === player.id;
  const isOneClub =
    player.isOneClubMan !== undefined
      ? player.isOneClubMan
      : realProfile
      ? realProfile.isOneClubMan
      : player.category === '국내' && player.acquisitionInfo?.type !== 'FA/트레이드';
  const domesticHomegrownBonus = isOneClub && player.category === '국내' ? 6 : 0;
  const realIconBonus =
    realProfile && (!realProfile.expectedTeamId || realProfile.expectedTeamId === player.teamId)
      ? Math.round(realProfile.franchiseIconBonus * 0.65)
      : 0;

  const contributionPoints = Math.min(
    40,
    Math.round(
      Math.max(0, player.ability - 62) * 0.75 +
        awardBonus +
        Math.min(8, teamChampCount * 3) +
        (isCaptain ? 4 : 0) +
        (player.franchiseLongTermSigned ? 5 : 0) +
        domesticHomegrownBonus +
        realIconBonus
    )
  );

  // 소속 기간 점수 (최대 30점)
  const tenurePoints =
    player.category !== '국내'
      ? Math.min(16, effectiveTenure * 3)
      : Math.min(30, effectiveTenure * 2.5);

  let score = Math.max(0, Math.min(100, Math.round(tenurePoints + careerPoints + contributionPoints)));

  // KBO 대표 프랜차이즈 아이콘(류현진·구자욱·김광현·최정·양현종 등) 구단 일치 시 프랜차이즈 지수 보장
  const iconRule = PROTECTED_FRANCHISE_ICONS[player.name];
  if (iconRule && iconRule.teamId === player.teamId) {
    score = Math.max(score, iconRule.minScore);
  }

  let tier: FranchiseStarTier = '일반';
  if (player.category === '국내') {
    if (
      score >= 95 ||
      (score >= 76 && effectiveTenure >= 8) ||
      (score >= 84 && effectiveTenure >= 6 && isOneClub)
    ) {
      tier = '레전드';
    } else if ((score >= 54 && effectiveTenure >= 5) || (score >= 64 && effectiveTenure >= 4)) {
      tier = '핵심 프랜차이즈';
    } else if (score >= 38 && effectiveTenure >= 3) {
      tier = '준프랜차이즈';
    }
  } else {
    // 외국인 선수도 4시즌 이상 장기 활약 시 준프랜차이즈/핵심 프랜차이즈 인정
    if (effectiveTenure >= 5 && score >= 58) tier = '핵심 프랜차이즈';
    else if (effectiveTenure >= 3 && score >= 44) tier = '준프랜차이즈';
  }

  // 5단계 트레이드 보호 등급 산정 (프랜차이즈 스타 / 구단 핵심 선수 / 핵심 유망주 / 일반 선수 / 전력 외 선수)
  const isCoreProspect =
    player.category === '국내' &&
    player.age <= 24 &&
    (player.potential >= 80 ||
      (player.potential >= 75 && player.potential - player.ability >= 16) ||
      Boolean(player.firstRoundSpotlight) ||
      (player.rookieInfo?.round === 1));
  const isOutOfPlan =
    player.rosterTier === '제외후보' ||
    (player.rosterTier !== '1군' && player.ability <= 56 && player.potential <= 64 && player.age >= 25);

  let protectionTier: FranchiseStarAssessment['protectionTier'];
  if (tier === '레전드' || score >= 90) {
    protectionTier = '프랜차이즈 스타';
  } else if (tier === '핵심 프랜차이즈' || score >= 72 || (player.ability >= 78 && player.rosterTier === '1군')) {
    protectionTier = '구단 핵심 선수';
  } else if (isCoreProspect) {
    protectionTier = '핵심 유망주';
  } else if (isOutOfPlan) {
    protectionTier = '전력 외 선수';
  } else {
    protectionTier = '일반 선수';
  }

  // 프랜차이즈 지수 95 이상은 자동 트레이드 후보 및 AI 제안 대상에서 절대 제외
  const isHardTradeLocked = score >= 95;

  const awardBuff = getAwardTradeValueMultiplier(player);
  const teamPop = career.teams[player.teamId]?.popularity ?? 68;
  const fanSent = career.teams[player.teamId]?.fanSentiment ?? 65;
  const tierPopBonus =
    tier === '레전드' ? 28 : tier === '핵심 프랜차이즈' ? 18 : tier === '준프랜차이즈' ? 9 : 0;
  const popularityIndex = Math.max(
    25,
    Math.min(
      100,
      Math.round(player.ability * 0.65 + tierPopBonus + (teamPop - 65) * 0.25 + awardBuff.popularityBonus)
    )
  );

  // 기념상품 연간 예상 매출 (억 원): 등급 + 인기도 + 팬 지지율 연동
  const tierMerchBase =
    tier === '레전드' ? 9.5 : tier === '핵심 프랜차이즈' ? 5.2 : tier === '준프랜차이즈' ? 2.4 : 0;
  const annualMerchBillion =
    tier === '일반'
      ? 0
      : Number(
          (
            tierMerchBase *
            (0.7 + popularityIndex / 140) *
            (0.75 + fanSent / 160)
          ).toFixed(2)
        );

  // KBO 샐러리캡 프랜차이즈 예외 선수 지정 상태 (별도 관리 확인용 읽기 전용 플래그)
  const isSalaryCapException =
    career.competitiveBalance?.clubs?.[player.teamId]?.exceptionPlayerId === player.id;

  const oneClubTag = isOneClub ? '원클럽맨 · ' : '타구단 이적 이력 · ';
  const summary =
    protectionTier === '프랜차이즈 스타'
      ? `${oneClubTag}프랜차이즈 지수 ${score} · 소속 ${effectiveTenure}시즌 — 구단 상징 스타 (원칙적 트레이드 보호)`
      : protectionTier === '구단 핵심 선수'
      ? `${oneClubTag}프랜차이즈 지수 ${score} · 소속 ${effectiveTenure}시즌 — 구단 핵심 전력 (고가치 보호)`
      : protectionTier === '핵심 유망주'
      ? `프랜차이즈 지수 ${score} · 만 ${player.age}세 (POT ${player.potential}) — 차세대 핵심 유망주 (트레이드 보호)`
      : protectionTier === '전력 외 선수'
      ? `프랜차이즈 지수 ${score} · 전력 외 정리 검토 대상`
      : `프랜차이즈 지수 ${score} · 소속 ${effectiveTenure}시즌 · 일반 등록 선수`;

  return {
    playerId: player.id,
    playerName: player.name,
    teamId: player.teamId,
    tier,
    protectionTier,
    isHardTradeLocked,
    score,
    tenureSeasons: effectiveTenure,
    careerPoints,
    contributionPoints,
    popularityIndex,
    annualMerchBillion,
    isSalaryCapException,
    summary,
  };
}

export function getTeamFranchiseStars(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): FranchiseStarAssessment[] {
  return Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === teamId &&
        (p.rosterTier === '1군' || p.rosterTier === '2군') &&
        !isMilitaryServing(p.militaryStatus)
    )
    .map((p) => evaluateFranchiseStar(career, p))
    .filter((a) => a.tier !== '일반')
    .sort((a, b) => b.score - a.score);
}

// =============================================================================
// 2. FRANCHISE MERCHANDISE REVENUE (인기도 · 팬 수요 연동 기념상품 매출)
// =============================================================================

export function computeClubFranchiseMerchandise(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): {
  annualTotalBillion: number;
  perSeriesBillion: number;
  stars: FranchiseStarAssessment[];
} {
  const stars = getTeamFranchiseStars(career, teamId).slice(0, 6);
  const annualTotalBillion = Number(
    stars.reduce((s, a) => s + a.annualMerchBillion, 0).toFixed(2)
  );
  // 48개 시리즈 기준 시리즈당 기념상품 매출
  const perSeriesBillion = Number((annualTotalBillion / 48).toFixed(3));
  return { annualTotalBillion, perSeriesBillion, stars };
}

// =============================================================================
// 3. FRANCHISE STAR LONG-TERM SPECIAL CONTRACT (장기 잔류 특별 재계약)
// =============================================================================

export function proposeFranchiseLongTermContract(
  career: CareerSave,
  playerId: string,
  years: number,
  annualSalaryBillion: number,
  signingBonusBillion: number
): { nextCareer: CareerSave; backupSnapshot: CareerSave; message: string } {
  const target = career.players[playerId];
  if (!target || target.teamId !== career.playerTeamId) {
    throw new Error('소속 구단 선수를 찾을 수 없습니다.');
  }
  if (target.category !== '국내') {
    throw new Error('프랜차이즈 스타 장기 특별 계약은 국내 선수에게만 제안할 수 있습니다.');
  }
  const assessment = evaluateFranchiseStar(career, target);
  if (assessment.tier === '일반') {
    throw new Error(
      `${target.name} 선수는 아직 프랜차이즈 스타 등급(준프랜차이즈 이상)에 도달하지 않았습니다. (현재 소속 ${assessment.tenureSeasons}시즌 · 종합 ${assessment.score}점)`
    );
  }
  if (years < 4 || years > 6) {
    throw new Error('프랜차이즈 스타 장기 특별 계약은 4~6년 범위로 제안해야 합니다.');
  }

  // 프랜차이즈 스타 원클럽 충성 할인(약 8~12%) 반영한 최소 수용 기준
  const marketAnnual = Math.max(2.5, Number(((target.ability - 65) * 0.65).toFixed(1)));
  const loyaltyDiscount = assessment.tier === '레전드' ? 0.86 : assessment.tier === '핵심 프랜차이즈' ? 0.9 : 0.93;
  const minAcceptedTotal = Number((marketAnnual * years * loyaltyDiscount).toFixed(1));
  const offeredTotal = Number((annualSalaryBillion * years + signingBonusBillion).toFixed(1));

  if (offeredTotal < minAcceptedTotal) {
    throw new Error(
      `${target.name}(${assessment.tier}) 선수가 장기 잔류 의사는 있으나 조건이 부족하다고 판단했습니다. (제안 ${offeredTotal.toFixed(1)}억 / 최소 희망 총액 약 ${minAcceptedTotal.toFixed(1)}억)`
    );
  }

  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (draft) => {
    const p = draft.players[playerId];
    const team = draft.teams[draft.playerTeamId];
    const isoDate = getCurrentCareerDate(draft).isoDate;

    if (
      draft.finances.cashBalanceBillion !== null &&
      signingBonusBillion > 0
    ) {
      if (draft.finances.cashBalanceBillion < signingBonusBillion) {
        throw new Error(
          `계약금(${signingBonusBillion.toFixed(1)}억) 지급에 필요한 보유 자금(${draft.finances.cashBalanceBillion.toFixed(1)}억)이 부족합니다.`
        );
      }
      draft.finances.cashBalanceBillion = Number(
        (draft.finances.cashBalanceBillion - signingBonusBillion).toFixed(2)
      );
      draft.finances.seasonExpenseBillion = Number(
        (draft.finances.seasonExpenseBillion + signingBonusBillion).toFixed(2)
      );
    }

    // 기존 성적/기록 보존, 계약 갱신 (샐러리캡 예외 선수 지정과는 독립 유지)
    p.contract = {
      ...p.contract,
      status: '확정',
      currency: 'KRW',
      years,
      yearsRemaining: years,
      annualSalary: Number(annualSalaryBillion.toFixed(2)),
      signingBonus: Number(signingBonusBillion.toFixed(2)),
      totalValue: offeredTotal,
      startSeason: draft.season,
      endSeason: draft.season + years - 1,
      isFAEligible: false,
      faGrade: null,
      note: `${draft.season} 프랜차이즈 스타 장기 연장(${years}년 ${offeredTotal}억 · ${assessment.tier})`,
    };
    p.franchiseLongTermSigned = true;
    p.morale = '만족';
    p.tradeRequested = false;

    // 팬 지지율 및 구단 평판 상승
    team.fanSentiment = Math.min(100, (team.fanSentiment ?? 65) + 6);
    team.clubReputation = Math.min(100, (team.clubReputation ?? 70) + 5);
    team.popularity = Math.min(100, team.popularity + 3);
    team.fanSentimentReason = `프랜차이즈 스타 ${p.name} ${years}년 장기 재계약 성사`;

    draft.transactionLogs.unshift({
      id: `tx-fran-ext-${Date.now()}`,
      date: isoDate,
      type: '계약',
      teamId: draft.playerTeamId,
      summary: `프랜차이즈 스타 장기계약: ${p.name}(${assessment.tier}) ${years}년 총 ${offeredTotal}억 (연봉 ${annualSalaryBillion}억 · 계약금 ${signingBonusBillion}억)`,
      detail: '팬 지지율 +6 · 구단 평판 +5 · KBO 경쟁균형세 다년계약 자동 산정식 반영 (예외 선수 지정은 별도 관리)',
    });

    draft.newsFeed = [
      {
        id: `news-fran-ext-${Date.now()}`,
        season: draft.season,
        date: isoDate,
        category: '이적·계약' as const,
        headline: `[종신 선언] ${KBO_TEAMS[draft.playerTeamId].shortName}, 프랜차이즈 스타 ${p.name}과 ${years}년 ${offeredTotal}억 장기 연장`,
        body: `${KBO_TEAMS[draft.playerTeamId].name}이 구단 상징 ${p.name}(${assessment.tier} · 소속 ${assessment.tenureSeasons}시즌) 선수와 ${years}년 총액 ${offeredTotal}억 원(계약금 ${signingBonusBillion}억 포함)에 특별 장기계약을 체결했습니다. 팬들은 구단의 레전드 예우에 뜨거운 환호를 보내고 있습니다.`,
        teamId: draft.playerTeamId,
        isHighlight: true,
      },
      ...(draft.newsFeed ?? []),
    ].slice(0, 120);
    draft.updatedAt = new Date().toISOString();
  });

  return {
    nextCareer,
    backupSnapshot,
    message: `${target.name}(${assessment.tier}) 선수와 ${years}년 총 ${offeredTotal}억 원 프랜차이즈 장기계약을 체결했습니다! (팬 지지율 +6 · 구단 평판 +5)`,
  };
}

// =============================================================================
// 4. PERMANENT RETIRED NUMBER REVIEW COMMITTEE (영구결번 심사)
// =============================================================================

export function evaluateRetiredNumberReview(
  career: CareerSave,
  player: Player
): RetiredNumberReviewResult {
  const assessment = evaluateFranchiseStar(career, player);
  const careerScore = Math.min(40, assessment.careerPoints);
  const tenureScore = Math.min(30, assessment.tenureSeasons * 3);
  const contributionScore = Math.min(30, assessment.contributionPoints);
  const totalScore = Math.min(100, careerScore + tenureScore + contributionScore);

  const reasons: string[] = [];
  reasons.push(`구단 소속 기간: ${assessment.tenureSeasons}시즌 (${tenureScore}/30점)`);
  reasons.push(`통산 누적 성적: ${careerScore}/40점`);
  reasons.push(`구단 공헌도(수상·우승·상징성): ${contributionScore}/30점`);

  let verdict: RetiredNumberReviewResult['verdict'] = '보류';
  if (totalScore >= 78 && assessment.tenureSeasons >= 8) {
    verdict = '만장일치 영구결번 추천';
    reasons.push('심사위원회 전원 찬성 — 구단 역사에 길이 남을 등번호 영구결번 강력 추천');
  } else if (totalScore >= 64 && assessment.tenureSeasons >= 6) {
    verdict = '심사 통과';
    reasons.push('영구결번 심사 기준 충족 — 단장 최종 승인으로 영구결번 지정 가능');
  } else {
    reasons.push('영구결번 기준(종합 64점 이상 & 소속 6시즌 이상) 미달 — 명예의 전당 헌액만 진행 권장');
  }

  return {
    playerId: player.id,
    playerName: player.name,
    teamId: player.teamId,
    uniformNumber: player.uniformNumber ?? 0,
    totalScore,
    careerScore,
    contributionScore,
    tenureScore,
    verdict,
    eligible: verdict !== '보류' && (player.uniformNumber ?? 0) > 0,
    reasons,
  };
}

export function approveRetiredNumberReview(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave; message: string } {
  const player = career.players[playerId];
  if (!player || player.teamId !== career.playerTeamId) {
    throw new Error('심사 대상 구단 선수를 찾을 수 없습니다.');
  }
  const review = evaluateRetiredNumberReview(career, player);
  if (!review.eligible) {
    throw new Error(
      `${player.name} 선수는 영구결번 심사 기준을 충족하지 못했습니다. (종합 ${review.totalScore}점 · ${review.verdict})`
    );
  }

  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (draft) => {
    const p = draft.players[playerId];
    const team = draft.teams[draft.playerTeamId];
    const isoDate = getCurrentCareerDate(draft).isoDate;
    const num = p.uniformNumber ?? 0;

    if (!draft.leagueHistory) {
      draft.leagueHistory = { retiredNumbers: [], hallOfFame: [], trophies: [], clubRecords: [] };
    }
    const alreadyRetired = draft.leagueHistory.retiredNumbers.some(
      (r) => r.teamId === draft.playerTeamId && r.number === num
    );
    if (!alreadyRetired && num > 0) {
      draft.leagueHistory.retiredNumbers.unshift({
        teamId: draft.playerTeamId,
        number: num,
        playerName: p.name,
        position: p.position,
        retiredSeason: draft.season,
        careerSummary: `${review.verdict} (${review.totalScore}점 · 소속 ${getPlayerClubTenureSeasons(p)}시즌)`,
      });
    }

    // 구단 명예의 전당 기록 업데이트
    ensureClubLegendsHallOfFameInPlace(draft);
    const existingHof = draft.clubLegendsHof?.find((l) => l.playerId === p.id);
    if (existingHof) {
      existingHof.retiredNumberApproved = true;
    } else {
      inductPlayerToClubLegendsHofInPlace(draft, p, true);
    }

    // 은퇴식 레코드도 영구결번 승인 표시
    const cer = (draft.retirementCeremonies ?? []).find((c) => c.playerId === p.id);
    if (cer) {
      cer.numberRetired = true;
      cer.acknowledged = true;
    }

    team.clubReputation = Math.min(100, (team.clubReputation ?? 70) + 6);
    team.fanSentiment = Math.min(100, (team.fanSentiment ?? 65) + 5);

    draft.transactionLogs.unshift({
      id: `tx-ret-num-${Date.now()}`,
      date: isoDate,
      type: '면담',
      teamId: draft.playerTeamId,
      summary: `[영구결번 확정] ${p.name} #${num} 영구결번 지정 (${review.verdict} · ${review.totalScore}점)`,
      detail: '향후 구단 내 등번호 배정에서 영구 제외 · 구단 레전드 명예의 전당 헌액 완료',
    });

    draft.newsFeed = [
      {
        id: `news-ret-num-${Date.now()}`,
        season: draft.season,
        date: isoDate,
        category: '수상·이달의선수' as const,
        headline: `[영구결번 지정] ${KBO_TEAMS[draft.playerTeamId].name}, ${p.name} 등번호 #${num} 영구결번 확정`,
        body: `${KBO_TEAMS[draft.playerTeamId].name} 영구결번 심사위원회가 통산 기록과 구단 공헌도(${review.totalScore}점 · ${review.verdict})를 검토해 ${p.name}의 등번호 ${num}번을 구단 영구결번으로 지정했습니다.`,
        teamId: draft.playerTeamId,
        isHighlight: true,
      },
      ...(draft.newsFeed ?? []),
    ].slice(0, 120);
    draft.updatedAt = new Date().toISOString();
  });

  return {
    nextCareer,
    backupSnapshot,
    message: `${player.name} 선수의 등번호 #${review.uniformNumber} 영구결번이 확정되어 구단 레전드 명예의 전당에 등재되었습니다!`,
  };
}

// =============================================================================
// 5. POST-RETIREMENT STAFF RE-HIRING (은퇴 후 감독·코치·스카우트 재영입)
// =============================================================================

export function signRetiredLegendAsStaff(
  career: CareerSave,
  playerId: string,
  role: CoachRole | '스카우트'
): { nextCareer: CareerSave; backupSnapshot: CareerSave; message: string } {
  const p = career.players[playerId];
  if (!p) throw new Error('은퇴 선수를 찾을 수 없습니다.');
  if (p.rosterTier !== '은퇴') {
    throw new Error(`${p.name} 선수는 아직 현역 선수입니다. 은퇴 후 지도자·스카우트로 재영입할 수 있습니다.`);
  }
  if (p.hiredPostRetirementRole) {
    throw new Error(`${p.name} 레전드는 이미 ${p.hiredPostRetirementRole} 직책으로 재영입되었습니다.`);
  }

  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (draft) => {
    const retired = draft.players[playerId];
    const teamId = draft.playerTeamId;
    const team = draft.teams[teamId];
    const isoDate = getCurrentCareerDate(draft).isoDate;
    const assessment = evaluateFranchiseStar(draft, retired);

    retired.hiredPostRetirementRole = role;

    if (role === '스카우트') {
      // 스카우트 영입 -> 구단 전력분석/스카우트 역량 영구 상승
      draft.analyticsStaffBonus = Math.min(10, (draft.analyticsStaffBonus ?? 3) + 2);
      team.clubReputation = Math.min(100, (team.clubReputation ?? 70) + 3);
      team.fanSentiment = Math.min(100, (team.fanSentiment ?? 65) + 3);
    } else {
      // 감독 또는 파트 코치로 정식 합류 (기존 동일 보직 교체)
      const staffList = draft.coaches[teamId] ?? [];
      const coachAbility = Math.max(
        76,
        Math.min(89, Math.round(72 + (retired.ability - 62) * 0.45 + (assessment.tier === '레전드' ? 4 : 2)))
      );
      const newCoach: Coach = {
        id: `coach-legend-${draft.season}-${retired.id}`,
        teamId,
        role,
        name: retired.name,
        nationality: retired.nationality ?? '한국',
        isVirtual: false,
        ability: coachAbility,
        contractYears: role === '감독' ? 3 : 2,
        annualSalaryBillion: role === '감독' ? 3.2 : 1.5,
        signingBonusBillion: role === '감독' ? 1.5 : 0.4,
        totalBillion: role === '감독' ? 11.1 : 3.4,
        confirmed: true,
        isIncumbent: true,
        careerNote: `${KBO_TEAMS[retired.teamId].shortName} ${assessment.tier} 은퇴 후 ${role} 재영입`,
        roleSummary: `프랜차이즈 레전드 출신 ${role} — 선수단 결속력 및 유망주 육성 강화`,
        tacticalStyle: retired.role === '투수' ? '투수전·불펜운용' : '빅볼·공격야구',
        devSpecialty: retired.role === '투수' ? '제구·변화구' : '컨택·선구안',
        tacticalRating: Math.min(92, coachAbility + 2),
        developmentRating: Math.min(94, coachAbility + 4),
      };
      draft.coaches[teamId] = [...staffList.filter((c) => c.role !== role), newCoach];
      team.clubReputation = Math.min(100, (team.clubReputation ?? 70) + 4);
      team.fanSentiment = Math.min(100, (team.fanSentiment ?? 65) + 4);
    }

    ensureClubLegendsHallOfFameInPlace(draft);
    const hofEntry = draft.clubLegendsHof?.find((l) => l.playerId === retired.id);
    if (hofEntry) {
      hofEntry.hiredAsStaffRole = role;
    }

    draft.transactionLogs.unshift({
      id: `tx-legend-staff-${Date.now()}`,
      date: isoDate,
      type: '계약',
      teamId,
      summary: `[레전드 지도자 계약] ${retired.name}, 은퇴 후 ${KBO_TEAMS[teamId].shortName} ${role} 합류`,
      detail:
        role === '스카우트'
          ? '구단 스카우트·전력분석 역량 +2 · 팬 지지율 +3 · 구단 평판 +3'
          : `구단 공식 ${role} 취임 · 구단 평판 +4 · 팬 지지율 +4`,
    });

    draft.newsFeed = [
      {
        id: `news-legend-staff-${Date.now()}`,
        season: draft.season,
        date: isoDate,
        category: '이적·계약' as const,
        headline: `[레전드 귀환] ${KBO_TEAMS[teamId].shortName}, 은퇴 스타 ${retired.name} ${role} 선임`,
        body: `${KBO_TEAMS[teamId].name}이 현역에서 은퇴한 프랜차이즈 스타 ${retired.name}을(를) ${role}(으)로 재영입했습니다. 구단 전통 계승과 젊은 선수단 지도에 큰 힘이 될 전망입니다.`,
        teamId,
        isHighlight: true,
      },
      ...(draft.newsFeed ?? []),
    ].slice(0, 120);
    draft.updatedAt = new Date().toISOString();
  });

  return {
    nextCareer,
    backupSnapshot,
    message: `${p.name} 레전드를 구단 ${role}(으)로 재영입했습니다!`,
  };
}

// =============================================================================
// 6. CLUB LEGENDS HALL OF FAME (구단 레전드 명예의 전당 영구 보존)
// =============================================================================

export function ensureClubLegendsHallOfFameInPlace(career: CareerSave): ClubLegendRecord[] {
  if (!Array.isArray(career.clubLegendsHof)) {
    career.clubLegendsHof = [];
  }
  if (career.clubLegendsHof.length === 0) {
    // 10개 구단 실제 역대 은퇴 레전드를 명예의 전당 기본 아카이브로 시드
    for (const item of REAL_KBO_HISTORICAL_LEGENDS) {
      career.clubLegendsHof.push({
        id: `hof-base-${item.teamId}-${item.uniformNumber ?? item.playerName}`,
        playerId: `historical-${item.teamId}-${item.uniformNumber ?? item.playerName}`,
        playerName: item.playerName,
        teamId: item.teamId,
        position: item.role === '투수' ? 'SP' : '1B',
        uniformNumber: item.uniformNumber,
        inductedSeason: item.retiredYear ?? 2020,
        tenureSeasons: 14,
        franchiseTier: '레전드',
        retiredNumberApproved: Boolean(item.uniformNumber),
        careerSummary: `${item.careerSummary} (${item.notableStats})`,
        isHistoricalBaseline: true,
      });
    }
  }
  return career.clubLegendsHof;
}

export function inductPlayerToClubLegendsHofInPlace(
  career: CareerSave,
  player: Player,
  retiredNumberApproved: boolean
): void {
  const list = ensureClubLegendsHallOfFameInPlace(career);
  if (list.some((r) => r.playerId === player.id)) return;
  const assess = evaluateFranchiseStar(career, player);
  if (assess.tier === '일반' && !retiredNumberApproved) return;

  const summary =
    player.role === '타자'
      ? `소속 ${assess.tenureSeasons}시즌 · 통산 ${(player.careerStats as CareerBatterStats | undefined)?.H ?? player.careerHits ?? 0}안타 ${(player.careerStats as CareerBatterStats | undefined)?.HR ?? player.careerHR ?? 0}홈런`
      : `소속 ${assess.tenureSeasons}시즌 · 통산 ${(player.careerStats as CareerPitcherStats | undefined)?.W ?? player.careerWins ?? 0}승 ${(player.careerStats as CareerPitcherStats | undefined)?.SO ?? player.careerSO ?? 0}탈삼진`;

  list.unshift({
    id: `hof-${player.teamId}-${player.id}`,
    playerId: player.id,
    playerName: player.name,
    teamId: player.teamId,
    position: player.position,
    uniformNumber: player.uniformNumber,
    inductedSeason: career.season,
    tenureSeasons: assess.tenureSeasons,
    franchiseTier: assess.tier,
    retiredNumberApproved,
    careerSummary: summary,
    isHistoricalBaseline: false,
  });
}

// =============================================================================
// 7. FRANCHISE STAR DEPARTURE / RIVAL CLUB TRANSFER EVENT
// =============================================================================

export function applyFranchiseStarTransferConsequencesInPlace(
  career: CareerSave,
  player: Player,
  fromTeamId: TeamId,
  toTeamId: TeamId,
  via: '트레이드' | 'FA'
): { wasFranchiseStar: boolean; wasRivalTransfer: boolean; tier: FranchiseStarTier } {
  const assess = evaluateFranchiseStar(career, { ...player, teamId: fromTeamId });
  if (assess.tier === '일반') {
    return { wasFranchiseStar: false, wasRivalTransfer: false, tier: '일반' };
  }

  const fromTeam = career.teams[fromTeamId];
  const rivalry = findRivalryBetween(career, fromTeamId, toTeamId);
  const wasRivalTransfer = Boolean(rivalry);
  const isoDate = getCurrentCareerDate(career).isoDate;

  const baseFanDrop =
    assess.tier === '레전드' ? 14 : assess.tier === '핵심 프랜차이즈' ? 9 : 4;
  const baseRepDrop =
    assess.tier === '레전드' ? 10 : assess.tier === '핵심 프랜차이즈' ? 6 : 3;
  const rivalExtraFan = wasRivalTransfer ? 8 : 0;
  const rivalExtraRep = wasRivalTransfer ? 5 : 0;
  // 선수가 직접 트레이드를 요청한 경우 구단 비난 완화
  const reqRelief = player.tradeRequested ? 0.45 : 1.0;

  const fanDelta = Math.round((baseFanDrop + rivalExtraFan) * reqRelief);
  const repDelta = Math.round((baseRepDrop + rivalExtraRep) * reqRelief);
  const popDelta = Math.round(
    ((assess.tier === '레전드' || assess.score >= 95 ? 12 : assess.tier === '핵심 프랜차이즈' ? 7 : 3) +
      (wasRivalTransfer ? 5 : 0)) *
      reqRelief
  );

  if (fromTeam) {
    fromTeam.fanSentiment = Math.max(15, (fromTeam.fanSentiment ?? 65) - fanDelta);
    fromTeam.clubReputation = Math.max(20, (fromTeam.clubReputation ?? 70) - repDelta);
    fromTeam.popularity = Math.max(20, (fromTeam.popularity ?? 65) - popDelta);
    if ((assess.tier === '레전드' || assess.score >= 90) && !player.tradeRequested) {
      fromTeam.atmosphere = '나쁨';
    }
    fromTeam.fanSentimentReason = wasRivalTransfer
      ? `프랜차이즈 스타 ${player.name}, 라이벌 ${KBO_TEAMS[toTeamId].shortName}로 ${via} 이적 충격 (인기도 -${popDelta})`
      : `프랜차이즈 스타 ${player.name} ${via} 이적에 따른 팬심·선수단 동요 (인기도 -${popDelta})`;
  }

  // 선수단 사기 저하: 원소속팀 잔류 1군 선수들의 불만도 상승 및 사기 하락
  if (via === '트레이드' && (assess.tier === '레전드' || assess.tier === '핵심 프랜차이즈' || assess.score >= 90)) {
    const moraleHit = Math.round((assess.score >= 95 ? 8 : 5) * reqRelief);
    for (const mate of Object.values(career.players)) {
      if (mate.teamId === fromTeamId && mate.id !== player.id && mate.rosterTier === '1군') {
        mate.dissatisfaction = Math.min(100, (mate.dissatisfaction ?? 15) + moraleHit);
        if (mate.morale === '만족') mate.morale = '보통';
        else if (mate.morale === '보통' && moraleHit >= 6) mate.morale = '불만';
      }
    }
  }

  // 라이벌 구단 이적 시 라이벌 열기 대폭 상승 + 특보 이벤트 발동
  if (wasRivalTransfer && rivalry) {
    rivalry.intensity = Math.min(100, rivalry.intensity + (assess.tier === '레전드' ? 18 : 12));
    rivalry.lastMeetingDate = isoDate;
    rivalry.lastMeetingNote = `${player.name}(${assess.tier}) ${KBO_TEAMS[fromTeamId].shortName}→${KBO_TEAMS[toTeamId].shortName} 금단의 ${via} 이적`;
  }

  if (fromTeamId === career.playerTeamId || toTeamId === career.playerTeamId || wasRivalTransfer) {
    career.newsFeed = [
      {
        id: `news-fran-move-${Date.now()}-${player.id}`,
        season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
        date: isoDate,
        category: '이적·계약' as const,
        headline: wasRivalTransfer
          ? `[라이벌 충격 이적] ${KBO_TEAMS[fromTeamId].shortName} ${assess.tier} ${player.name}, 숙적 ${KBO_TEAMS[toTeamId].shortName} 유니폼 입는다`
          : `[프랜차이즈 스타 이적] ${KBO_TEAMS[fromTeamId].shortName} ${assess.tier} ${player.name}, ${KBO_TEAMS[toTeamId].shortName}로 ${via}`,
        body: wasRivalTransfer
          ? `${KBO_TEAMS[fromTeamId].name}에서 ${assess.tenureSeasons}시즌간 활약한 ${assess.tier} ${player.name}이(가) 라이벌 ${KBO_TEAMS[toTeamId].name}(${rivalry?.name ?? '라이벌'})으로 ${via} 이적했습니다. ${KBO_TEAMS[fromTeamId].shortName} 팬 만족도(-${fanDelta})와 구단 평판(-${repDelta})이 큰 타격을 입었으며 라이벌 열기가 치솟고 있습니다.`
          : `${KBO_TEAMS[fromTeamId].name}의 ${assess.tier} ${player.name}(소속 ${assess.tenureSeasons}시즌)이(가) ${KBO_TEAMS[toTeamId].name}으로 ${via} 이적했습니다. (팬 만족도 -${fanDelta} · 구단 평판 -${repDelta}${player.tradeRequested ? ' · 선수 트레이드 요청으로 반발 일부 완화' : ''})`,
        teamId: fromTeamId,
        isHighlight: true,
      },
      ...(career.newsFeed ?? []),
    ].slice(0, 120);
  }

  return { wasFranchiseStar: true, wasRivalTransfer, tier: assess.tier };
}

// =============================================================================
// 8. FRANCHISE STAR TRADE EVALUATION IMPROVEMENT PATCH (#6 & #7)
//    - 순수 실력 기반 시장 트레이드 지수 유지
//    - 나이·고액 잔여 연봉에 따른 가치 하락 정상 반영
//    - 낮은 트레이드 지수의 구체적 사유(lowValueReasons) 표시
//    - 프랜차이즈 상징성에 따른 구단별 평가 차이(원소속 구단 내부 프리미엄 vs 타 구단 시장가)
//    - 선수의 트레이드 요청 시 소속 구단 매각 저항 완화
// =============================================================================

export function evaluatePlayerTradeValuationDetailed(
  career: CareerSave,
  player: Player
): TradePlayerValuationBreakdown {
  const assess = evaluateFranchiseStar(career, player);

  // (1) 순수 실력·잠재력·최근 성적 기본 점수 (10..115 스케일)
  const upside = Math.max(0, player.potential - player.ability);
  const youthUpsideWeight =
    player.age <= 22 ? 0.82 : player.age <= 25 ? 0.58 : player.age <= 28 ? 0.3 : 0.12;
  const multiYearRecentAdj = Math.round(((player.recent3YrScore ?? player.ability) - player.ability) * 0.25);

  // 당해 시즌 최근 성적(타자 OPS / 투수 ERA + 최근 컨디션) 반영 (표본 충족 시)
  let livePerfAdj = 0;
  if (player.role === '타자') {
    const b = player.stats as { AB?: number | null; PA?: number | null; H?: number | null; BB?: number | null; HBP?: number | null; SF?: number | null; TB?: number | null };
    const ab = b.AB ?? 0;
    const pa = b.PA ?? ab;
    if (pa >= 60 && ab > 0 && b.H !== null && b.H !== undefined && b.TB !== null && b.TB !== undefined) {
      const obp = (b.H + (b.BB ?? 0) + (b.HBP ?? 0)) / Math.max(1, ab + (b.BB ?? 0) + (b.HBP ?? 0) + (b.SF ?? 0));
      const slg = b.TB / ab;
      const ops = obp + slg;
      const expectedOps = 0.72 + (player.ability - 73) * 0.011;
      livePerfAdj = Math.max(-7, Math.min(8, Math.round((ops - expectedOps) * 28)));
    }
  } else {
    const ps = player.stats as { outs?: number | null; ER?: number | null };
    const outs = ps.outs ?? 0;
    if (outs >= 45 && ps.ER !== null && ps.ER !== undefined) {
      const era = (ps.ER * 27) / outs;
      const expectedEra = Math.max(2.6, 4.35 - (player.ability - 73) * 0.09);
      livePerfAdj = Math.max(-7, Math.min(8, Math.round((expectedEra - era) * 3.5)));
    }
  }
  const formRecentAdj = Math.max(-9, Math.min(10, multiYearRecentAdj + livePerfAdj));
  const posScarcity =
    player.position === 'SP' || player.position === 'C' || player.position === 'SS' || player.position === 'CF'
      ? 4
      : 0;
  const baseSkillScore = Math.max(
    18,
    Math.round((player.ability - 50) * 2.15 + upside * youthUpsideWeight + formRecentAdj + posScarcity)
  );

  // (2) 나이 노쇠화 가치 하락 정상 반영
  let ageAdjustment = 0;
  if (player.age <= 23) ageAdjustment = 10;
  else if (player.age <= 27) ageAdjustment = 5;
  else if (player.age <= 30) ageAdjustment = 0;
  else if (player.age <= 32) ageAdjustment = -7;
  else if (player.age <= 34) ageAdjustment = -15;
  else if (player.age <= 36) ageAdjustment = -23;
  else ageAdjustment = -32;

  // (3) 연봉·잔여 총액 부담에 따른 가치 하락 정상 반영
  const yrsRem = Math.max(1, player.contract.yearsRemaining || 1);
  const annSal = player.contract.annualSalary || 0;
  const fairAnnualForAbility = Math.max(0.5, (player.ability - 68) * 0.52);
  const excessAnnual = Math.max(0, annSal - fairAnnualForAbility);
  let salaryAdjustment = 0;
  if (annSal >= 18) salaryAdjustment = -Math.round(10 + excessAnnual * 1.15);
  else if (annSal >= 10) salaryAdjustment = -Math.round(5 + excessAnnual * 0.95);
  else if (annSal >= 5 && excessAnnual > 2.5) salaryAdjustment = -Math.round(excessAnnual * 0.85);
  else if (annSal <= 1.2 && player.ability >= 74 && player.age <= 28) salaryAdjustment = 7; // 저연봉 가성비

  // (4) 잔여 계약 기간 / 통제권 보정
  let contractTermAdjustment = 0;
  if (player.contract.status === '만료' || yrsRem <= 1) {
    contractTermAdjustment = player.contract.isFAEligible ? -9 : -4;
  } else if (yrsRem >= 4 && annSal >= 12 && player.age >= 33) {
    contractTermAdjustment = -8; // 고령 장기 고액 잔여 계약 리스크
  } else if (yrsRem >= 3 && player.age <= 29 && excessAnnual <= 2) {
    contractTermAdjustment = 4; // 전성기 안정적 통제권
  }

  // (5) 부상 이력 / 현재 부상 감점
  let injuryAdjustment = 0;
  if (player.injury) injuryAdjustment -= 9;
  if ((player.injuryHistoryCount ?? 0) >= 2) {
    injuryAdjustment -= Math.min(10, (player.injuryHistoryCount ?? 0) * 3);
  }
  if (isMilitaryServing(player.militaryStatus)) {
    injuryAdjustment -= 8;
  }

  // 순수 실력·나이·연봉 기반 시장 트레이드 지수 + 개인 수상(골든글러브/MVP) 가치 상승 반영 (#20)
  const awardVal = getAwardTradeValueMultiplier(player);
  const rawMarket =
    baseSkillScore + ageAdjustment + salaryAdjustment + contractTermAdjustment + injuryAdjustment;
  const skillMarketIndex = Math.max(
    8,
    Math.min(125, Math.round(rawMarket * awardVal.multiplier))
  );

  // (6) 전체 구단 팀 내 레전드 트레이드 고난도 보호 (#3) + 프랜차이즈 상징성 프리미엄
  // 레전드 등급 선수는 타 구단이 영입하기 매우 어렵도록 초고강도 내부 상징 프리미엄(68) 부여
  const rawHomeSymbolic =
    assess.tier === '레전드'
      ? 68
      : assess.tier === '핵심 프랜차이즈'
      ? 28
      : assess.tier === '준프랜차이즈'
      ? 12
      : 0;

  // (7) 선수 트레이드 요청 시 소속 구단의 매각 저항 대폭 감소
  const tradeRequestRelief = player.tradeRequested
    ? Math.round(rawHomeSymbolic * 0.65) + 6
    : 0;

  const homeClubSymbolicPremium = Math.max(0, rawHomeSymbolic - tradeRequestRelief);
  const homeClubValue = Math.max(8, skillMarketIndex + homeClubSymbolicPremium);
  // 타 구단은 프랜차이즈 상징성 프리미엄을 극히 제한적(마케팅 +0~3)으로만 반영
  const marketClubValue =
    skillMarketIndex + (assess.tier === '레전드' ? 4 : assess.tier === '핵심 프랜차이즈' ? 2 : 0);

  // (8) 낮은 트레이드 지수의 구체적 사유 목록 생성
  const lowValueReasons: string[] = [];
  if (ageAdjustment <= -15) {
    lowValueReasons.push(`고령(${player.age}세) 노쇠화 리스크 (${ageAdjustment})`);
  } else if (ageAdjustment <= -7) {
    lowValueReasons.push(`30대 진입(${player.age}세) 잔여 전성기 단축 (${ageAdjustment})`);
  }
  if (salaryAdjustment <= -5) {
    lowValueReasons.push(
      `고액 연봉 부담(연 ${annSal.toFixed(1)}억 · 잔여 ${yrsRem}년 · ${salaryAdjustment})`
    );
  }
  if (contractTermAdjustment <= -6) {
    lowValueReasons.push(
      yrsRem <= 1
        ? `잔여 계약 ${yrsRem}년(FA 임박 렌탈 리스크 · ${contractTermAdjustment})`
        : `고령 장기 고액 잔여계약 부담 (${contractTermAdjustment})`
    );
  }
  if (injuryAdjustment <= -6) {
    lowValueReasons.push(
      player.injury
        ? `현재 부상 이탈 중(${player.injury.description} · ${injuryAdjustment})`
        : `부상 이력(${player.injuryHistoryCount ?? 0}회) 내구성 우려 (${injuryAdjustment})`
    );
  }
  if (player.ability <= 68) {
    lowValueReasons.push(`현재 1군 즉시전력 기량 부족(능력치 ${player.ability})`);
  }
  if (player.category !== '국내') {
    lowValueReasons.push('외국인 선수 쿼터 제한 및 단년 계약 구조');
  }
  if (player.tradeRequested) {
    lowValueReasons.push(`선수 본인 트레이드 요청 — 소속 구단 매각 저항 -${tradeRequestRelief} 완화`);
  }

  return {
    playerId: player.id,
    playerName: player.name,
    teamId: player.teamId,
    skillMarketIndex,
    baseSkillScore,
    ageAdjustment,
    salaryAdjustment,
    contractTermAdjustment,
    injuryAdjustment,
    homeClubSymbolicPremium,
    tradeRequestRelief,
    homeClubValue,
    marketClubValue,
    franchiseTier: assess.tier,
    lowValueReasons,
  };
}

/**
 * 샐러리캡 예외 선수 지정과 프랜차이즈 스타 지위가 독립적으로 관리되는지 검증용 요약
 */
export function getFranchiseVsCapExceptionSeparationNote(
  career: CareerSave,
  player: Player
): {
  franchiseTier: FranchiseStarTier;
  isSalaryCapException: boolean;
  separationLabel: string;
} {
  ensureCompetitiveBalanceState(career);
  const assess = evaluateFranchiseStar(career, player);
  const isCapEx = career.competitiveBalance?.clubs?.[player.teamId]?.exceptionPlayerId === player.id;
  return {
    franchiseTier: assess.tier,
    isSalaryCapException: isCapEx,
    separationLabel: isCapEx
      ? `프랜차이즈 등급: ${assess.tier} | 경쟁균형세 예외 선수: 지정됨 (별도 관리)`
      : `프랜차이즈 등급: ${assess.tier} | 경쟁균형세 예외 선수: 미지정 (재정 탭에서 별도 지정)`,
  };
}

// =============================================================================
// 6. ALL-10-CLUBS LEGEND 0.5% RARE TRADE MARKET AVAILABILITY RULE
// =============================================================================

/** 모든 구단 팀 내 레전드 선수의 트레이드 시장 출현 확률: 0.5% (0.005) */
export const LEGEND_TRADE_APPEARANCE_PROBABILITY = 0.005;

export function isClubLegend(career: CareerSave, player: Player): boolean {
  return evaluateFranchiseStar(career, player).tier === '레전드';
}

export function rollLegendTradeAppearance(rng?: SeededRng): boolean {
  const sample = rng ? rng.next() : Math.random();
  return sample < LEGEND_TRADE_APPEARANCE_PROBABILITY;
}

/**
 * 시즌별 10개 전 구단 레전드 선수 0.5% 트레이드 출현 판정 (결정론적 독립 시드 RNG 사용)
 */
export function getSeasonLegendTradeBlockIds(career: CareerSave): string[] {
  if (
    career.legendTradeBlockSeason === career.season &&
    Array.isArray(career.legendTradeBlockPlayerIds)
  ) {
    return career.legendTradeBlockPlayerIds;
  }

  const validTeams = new Set<string>(TEAM_IDS);
  const isolatedRng = new SeededRng(((career.seed || 2026) ^ (career.season * 10007) ^ 0x51a7c3) >>> 0);
  const unlocked: string[] = [];

  const activePlayers = Object.values(career.players)
    .filter((p) => validTeams.has(p.teamId) && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적')
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const p of activePlayers) {
    if (isClubLegend(career, p)) {
      if (rollLegendTradeAppearance(isolatedRng)) {
        unlocked.push(p.id);
      }
    }
  }

  return unlocked;
}

export interface LegendTradeAvailability {
  isLegend: boolean;
  available: boolean;
  probabilityPct: number;
  reason: string;
}

/**
 * 모든 KBO 10개 구단 레전드 선수의 트레이드 출현 가능 여부 판정
 * - 일반/프랜차이즈/핵심 선수: 정상 협상 가능
 * - 구단 레전드(tier === '레전드'): 기본 불가침(99.5% 차단), 0.5% 희귀 출현 또는 본인 트레이드 요청 시에만 시장 개방
 */
export function evaluateLegendTradeAvailability(
  career: CareerSave,
  player: Player
): LegendTradeAvailability {
  const assess = evaluateFranchiseStar(career, player);

  // 프랜차이즈 지수 95+ 상징 선수는 자동 트레이드/AI 제안 영구 제외 (본인 트레이드 요청 시에만 예외)
  if (assess.score >= 95 || assess.isHardTradeLocked) {
    if (player.tradeRequested) {
      return {
        isLegend: true,
        available: true,
        probabilityPct: 100,
        reason: `[프랜차이즈 스타 · 지수 ${assess.score}] 본인 트레이드 요청으로 예외 검토 개방`,
      };
    }
    return {
      isLegend: true,
      available: false,
      probabilityPct: 0,
      reason: `[프랜차이즈 스타 · 지수 ${assess.score}] ${KBO_TEAMS[player.teamId].name} 구단 상징 선수 — 원칙적 트레이드 불가 (자동 트레이드·AI 제안 제외)`,
    };
  }

  if (assess.tier !== '레전드' && assess.protectionTier !== '프랜차이즈 스타') {
    return {
      isLegend: false,
      available: true,
      probabilityPct: 100,
      reason: `[${assess.protectionTier ?? '일반 선수'} · 지수 ${assess.score}] 트레이드 협상 가능`,
    };
  }

  if (player.tradeRequested) {
    return {
      isLegend: true,
      available: true,
      probabilityPct: LEGEND_TRADE_APPEARANCE_PROBABILITY * 100,
      reason: `[프랜차이즈 스타 · 지수 ${assess.score}] 선수 본인 이적 요청으로 예외 협상 개방`,
    };
  }

  const unlockedIds = getSeasonLegendTradeBlockIds(career);
  if (unlockedIds.includes(player.id)) {
    return {
      isLegend: true,
      available: true,
      probabilityPct: LEGEND_TRADE_APPEARANCE_PROBABILITY * 100,
      reason: `[프랜차이즈 스타 · 지수 ${assess.score}] 특별한 구단 상황(희귀 블록)으로 예외 협상 개방`,
    };
  }

  return {
    isLegend: true,
    available: false,
    probabilityPct: LEGEND_TRADE_APPEARANCE_PROBABILITY * 100,
    reason: `[프랜차이즈 스타 · 지수 ${assess.score}] ${KBO_TEAMS[player.teamId].name} 상징 선수 — 원칙적 트레이드 불가 (이적 요청/특별 상황 외 보호)`,
  };
}

/**
 * 시즌 종료 후 전체 현역 선수의 프랜차이즈 지수(0~100)와 5단계 보호 등급을 재평가한다.
 */
export function reevaluateLeagueFranchiseProtectionInPlace(career: CareerSave): string[] {
  const highlights: string[] = [];
  const isoDate = getCurrentCareerDate(career).isoDate;
  for (const p of Object.values(career.players)) {
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') continue;
    const prevTier = p.protectionTier;
    const assess = evaluateFranchiseStar(career, p);
    p.franchiseIndex = assess.score;
    p.protectionTier = assess.protectionTier;
    if (
      prevTier &&
      prevTier !== assess.protectionTier &&
      (assess.protectionTier === '프랜차이즈 스타' || assess.protectionTier === '구단 핵심 선수') &&
      p.teamId === career.playerTeamId
    ) {
      highlights.push(`${p.name}: ${prevTier} → ${assess.protectionTier} (지수 ${assess.score})`);
    }
  }
  career.franchiseReevalLog = career.franchiseReevalLog ?? [];
  career.franchiseReevalLog.unshift({
    season: career.season,
    date: isoDate,
    summary:
      highlights.length > 0
        ? `${career.season}시즌 종료 프랜차이즈 보호 등급 재평가 완료: ${highlights.slice(0, 4).join(', ')}`
        : `${career.season}시즌 종료 전체 선수 프랜차이즈 지수(0~100) 및 5단계 보호 등급 재평가 완료`,
  });
  return highlights;
}

