import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, MLB_CLUBS, TEAM_IDS } from '../data/kboTeams';
import {
  BatterStats,
  CareerSave,
  FaClubBid,
  FaCompetitionState,
  FaMarketNegotiation,
  MlbOverseasFaOffer,
  PitcherStats,
  Player,
  TeamId,
} from '../types/kbo';
import { recordMlbExportPlayer } from './franchiseSystems';
import { evaluateFranchiseStar } from './franchiseStarEngine';
import { recordLeagueAcquisitionInPlace } from './leagueAcquisitionsEngine';
import { appendPlayerTeamHistoryInPlace } from './leagueLifeEngine';
import { SeededRng } from './rng';
import { getAnnualKboCapBillion, getCurrentCareerDate } from './salaryCapEngine';
import { calcAVG, calcERA, calcOPS, computeStandings } from './stats';

/** 고령 선수의 비현실적인 장기계약 방지 상한 (연령·기량 기반) */
export function getMaxRealisticFaYears(age: number, ability = 75): number {
  if (age >= 38) return ability >= 83 ? 2 : 1;
  if (age >= 36) return 2;
  if (age >= 34) return 3;
  if (age >= 32) return 4;
  return 6;
}

/** KBO 공식 구단당 단일 시즌 외부 FA 영입 상한 (원소속팀 재계약은 미포함) */
export const MAX_EXTERNAL_FA_PER_CLUB = 2;

function cloneCareer(career: CareerSave): CareerSave {
  return JSON.parse(JSON.stringify(career)) as CareerSave;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * FA 등급 및 KBO 보상 규정 계산 (원소속팀 기준 A/B/C)
 */
export function evaluateFaGradeAndComp(
  career: CareerSave,
  p: Player
): {
  grade: 'A' | 'B' | 'C';
  protectionLimit: number;
  cashCompBillion: number;
  fairYears: number;
  fairTotalBillion: number;
} {
  const originTeam = p.formerTeamId ?? p.teamId;
  const grade: 'A' | 'B' | 'C' =
    p.contract.faGrade ??
    (p.age >= 35
      ? 'C'
      : p.ability >= 82 || p.contract.annualSalary >= 5.0
      ? 'A'
      : p.ability >= 76 || p.contract.annualSalary >= 2.5
      ? 'B'
      : 'C');
  const prevSal = Math.max(0.5, p.contract.annualSalary || 1.0);
  const protectionLimit = grade === 'A' ? 20 : grade === 'B' ? 25 : 0;
  const cashCompBillion = Number(
    (grade === 'A' ? prevSal * 2.0 : grade === 'B' ? prevSal * 1.0 : prevSal * 1.5).toFixed(2)
  );

  // 시장 적정가 산출: 최근 3시즌 성적(recent3YrScore) + 능력치 + 연령 반영 (고령 장기계약 방지)
  const maxYears = getMaxRealisticFaYears(p.age, p.ability);
  const fairYears = clamp(p.age >= 36 ? 2 : p.age >= 34 ? 2 : p.age >= 32 ? 3 : 4, 1, maxYears);
  const recent3 = typeof p.recent3YrScore === 'number' && Number.isFinite(p.recent3YrScore)
    ? p.recent3YrScore
    : p.ability;
  const effectiveRating = p.ability * 0.65 + recent3 * 0.35;
  const baseAnnual =
    effectiveRating >= 86
      ? 22.0
      : effectiveRating >= 83
      ? 15.5
      : effectiveRating >= 80
      ? 11.0
      : effectiveRating >= 77
      ? 7.2
      : effectiveRating >= 74
      ? 4.6
      : 2.4;
  const ageMult = p.age >= 38 ? 0.5 : p.age >= 36 ? 0.62 : p.age >= 34 ? 0.78 : p.age >= 32 ? 0.9 : 1.04;
  const fairTotalBillion = Number(
    Math.max(1.8, fairYears * baseAnnual * ageMult * (originTeam ? 1 : 1)).toFixed(1)
  );

  return { grade, protectionLimit, cashCompBillion, fairYears, fairTotalBillion };
}

/**
 * 구단별 포지션 전력 보강 필요도 (0..100) 및 예상 출전 기회 점수 산출
 */
function computeClubPositionalNeed(career: CareerSave, teamId: TeamId, target: Player): number {
  const roster = Object.values(career.players).filter(
    (p) =>
      p.teamId === teamId &&
      p.id !== target.id &&
      (p.rosterTier === '1군' || p.rosterTier === '2군') &&
      !isMilitaryServing(p.militaryStatus)
  );

  if (target.role === '투수') {
    const sameRole = roster
      .filter((p) => p.role === '투수' && (target.pitchRole === '선발' ? p.pitchRole === '선발' : p.pitchRole !== '선발'))
      .sort((a, b) => b.ability - a.ability);
    const benchmark = target.pitchRole === '선발' ? sameRole[3]?.ability ?? 68 : sameRole[4]?.ability ?? 68;
    return clamp(55 + (target.ability - benchmark) * 3.8, 15, 98);
  }

  const samePos = roster
    .filter((p) => p.role === '타자' && (p.position === target.position || (target.position === 'DH' && p.position === '1B')))
    .sort((a, b) => b.ability - a.ability);
  const incumbent = samePos[0]?.ability ?? 66;
  return clamp(56 + (target.ability - incumbent) * 4.2, 15, 98);
}

/**
 * 구단별 우승 경쟁력 점수 (0..100) 및 재정 여력 계수 (0.68..1.25)
 * - 인위적 균등 분배 없이 구단별 실제 성적·예산·성향에 따라 자연스럽게 분산
 */
function getClubMarketProfile(
  career: CareerSave,
  teamId: TeamId,
  rankByTeam: Map<TeamId, number>
): {
  contentionScore: number;
  budgetCapacityBillion: number;
  aggressiveness: number;
  payrollBillion: number;
} {
  const rank = rankByTeam.get(teamId) ?? 5;
  const teamMeta = KBO_TEAMS[teamId];
  const payrollBillion = Object.values(career.players)
    .filter((p) => p.teamId === teamId && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적' && p.rosterTier !== 'FA')
    .reduce((s, p) => s + (p.contract.currency === 'KRW' ? p.contract.annualSalary : 0), 0);

  const softCap = getAnnualKboCapBillion(career.season);
  const headroom = Math.max(0, softCap - payrollBillion);
  const marketMult = teamMeta.ticketDemandMultiplier ?? 1.0;

  // 구단별 현실적 재정 여력 + 시즌 성적에 따른 공격성 (고정 균등할당 없음)
  const seedJitter = ((hashStr(`${career.season}-${teamId}`) % 21) - 10) / 100; // -0.10..+0.10
  const contentionScore = clamp(96 - (rank - 1) * 7.5 + (marketMult - 1) * 10, 30, 96);
  const budgetCapacityBillion = Number(
    Math.max(12, headroom * 1.1 + marketMult * 32 + (rank <= 5 ? 10 : 4)).toFixed(1)
  );
  // 중상위권(3~6위)이 승부수를 던지고, 최하위 리빌딩 구단은 고령 FA에 보수적
  const rankAggro = rank <= 2 ? 1.02 : rank <= 6 ? 1.07 : 0.91;
  const aggressiveness = clamp(rankAggro * (0.94 + (marketMult - 0.95) * 0.35) + seedJitter, 0.78, 1.2);

  return {
    contentionScore,
    budgetCapacityBillion,
    aggressiveness,
    payrollBillion: Number(payrollBillion.toFixed(1)),
  };
}

/**
 * 선수의 입찰 구단 선택 평가점수 계산
 * 고려 요소: 계약 총액, 연평균(AAV), 계약 기간, 출전 기회(포지션 필요도), 우승 가능성, 원소속 구단 친숙도
 */
export function scoreBidForPlayer(
  career: CareerSave,
  p: Player,
  bid: Omit<FaClubBid, 'score' | 'note'>,
  rankByTeam: Map<TeamId, number>
): { score: number; note: string } {
  const { fairTotalBillion, fairYears } = evaluateFaGradeAndComp(career, p);
  const need = computeClubPositionalNeed(career, bid.teamId, p);
  const clubProfile = getClubMarketProfile(career, bid.teamId, rankByTeam);

  const moneyRatio = bid.totalBillion / Math.max(1, fairTotalBillion);
  const aavRatio = bid.annualBillion / Math.max(0.5, fairTotalBillion / Math.max(1, fairYears));
  const moneyScore = clamp(moneyRatio * 52 + aavRatio * 14, 15, 88);
  const yearsFit = p.age >= 34
    ? bid.years >= 2 ? 8 : 3
    : bid.years >= 4 ? 10 : bid.years === 3 ? 7 : 4;
  const playTimeScore = (need / 100) * 14;
  const contentionBonus =
    (p.age >= 32 ? 0.14 : 0.09) * clubProfile.contentionScore;
  const originalBonus = bid.isOriginalClub ? 5.5 : 0;

  const totalScore = Number(
    (moneyScore + yearsFit + playTimeScore + contentionBonus + originalBonus).toFixed(2)
  );

  const reasons: string[] = [];
  if (moneyRatio >= 1.04) reasons.push('최고 대우');
  if (need >= 75) reasons.push('확실한 주전 기회');
  if (clubProfile.contentionScore >= 75) reasons.push('우승 전력');
  if (bid.isOriginalClub) reasons.push('원소속 친숙도');

  return {
    score: totalScore,
    note: reasons.length > 0 ? reasons.join(' · ') : '조건 검토',
  };
}

export function getTeamExternalFaSigningCount(career: CareerSave, teamId: TeamId): number {
  const state = career.faCompetition;
  if (!state || state.season !== career.season) return 0;
  return state.externalSigningsByTeam[teamId] ?? 0;
}

/**
 * 전체 10개 구단 대상 FA 시장 대상 선수 목록 조회
 */
export function getAllMarketFaPlayers(career: CareerSave): Player[] {
  return Object.values(career.players)
    .filter((p) => {
      if (p.category !== '국내') return false;
      if (isMilitaryServing(p.militaryStatus)) return false;
      if (p.signedAsFaSeason === career.season) return false;
      // 실제 FA 신분(rosterTier === 'FA' 또는 contract.status === 'FA')만 시장 대상 — 계약 유지 중인 현역 1·2군 선수 오인 방지
      if (p.rosterTier === 'FA' || p.contract.status === 'FA') return true;
      return (
        career.phase === 'OFFSEASON' &&
        (p.rosterTier === '1군' || p.rosterTier === '2군') &&
        p.contract.yearsRemaining <= 0 &&
        Boolean(p.contract.isFAEligible)
      );
    })
    .sort((a, b) => (b.rosterTier === 'FA' ? 1 : 0) - (a.rosterTier === 'FA' ? 1 : 0) || b.ability - a.ability);
}

/**
 * 해외 FA 자격 여부 판정 (구단 승인 없이 MLB 구단과 직접 계약 협상 가능)
 * - 포스팅(7시즌 이상 · 구단 승인 필수)과 구분되는 해외 FA 경로
 */
export function isOverseasFaEligible(p: Player): boolean {
  if (p.category !== '국내') return false;
  if (isMilitaryServing(p.militaryStatus)) return false;
  if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') return false;
  return p.serviceYears >= 8 && (p.rosterTier === 'FA' || Boolean(p.contract.isFAEligible));
}

/**
 * MLB 구단 스카우트용 최근 성적 평가 보정 (능력치 + 나이 + 최근 성적 3요소 반영)
 */
export function evaluatePlayerRecentMlbStats(p: Player): { delta: number; summary: string } {
  if (p.role === '타자') {
    const bs = p.stats as BatterStats;
    const pa = bs.PA ?? 0;
    if (pa < 120) return { delta: 0, summary: '능력치·경력 중심 평가' };
    const ops = calcOPS(bs) ?? 0.76;
    const avg = calcAVG(bs.H, bs.AB) ?? 0.27;
    const hr = bs.HR ?? 0;
    if (ops >= 0.93 || (ops >= 0.87 && hr >= 25)) {
      return { delta: 4, summary: `최근 성적 최상위(OPS ${ops.toFixed(3)}, ${hr}HR)` };
    }
    if (ops >= 0.84 || avg >= 0.31) {
      return { delta: 2, summary: `최근 성적 우수(OPS ${ops.toFixed(3)})` };
    }
    if (ops < 0.74) {
      return { delta: -5, summary: `최근 성적 부진(OPS ${ops.toFixed(3)})` };
    }
    return { delta: 0, summary: `최근 성적 보통(OPS ${ops.toFixed(3)})` };
  }
  const ps = p.stats as PitcherStats;
  const outs = ps.outs ?? 0;
  if (outs < 120) return { delta: 0, summary: '능력치·경력 중심 평가' };
  const era = calcERA(ps.ER, outs) ?? 3.85;
  const w = ps.W ?? 0;
  const sv = ps.SV ?? 0;
  if (era <= 2.7 || (era <= 3.1 && (w >= 13 || sv >= 30))) {
    return { delta: 4, summary: `최근 성적 최상위(ERA ${era.toFixed(2)})` };
  }
  if (era <= 3.35) {
    return { delta: 2, summary: `최근 성적 우수(ERA ${era.toFixed(2)})` };
  }
  if (era >= 4.45) {
    return { delta: -5, summary: `최근 성적 부진(ERA ${era.toFixed(2)})` };
  }
  return { delta: 0, summary: `최근 성적 보통(ERA ${era.toFixed(2)})` };
}

/**
 * 해외 FA 선수에 대한 MLB 구단 오퍼 평가 (최상위권 선수 위주로 엄격하게 발생)
 */
export function evaluateOverseasFaMlbOffer(
  career: CareerSave,
  p: Player,
  dateStr: string,
  rng: SeededRng
): MlbOverseasFaOffer | null {
  if (!isOverseasFaEligible(p)) return null;
  // 나이 상한: 만 34세 이상은 MLB 해외 FA 다년/메이저 보장 계약 극도로 어려움
  if (p.age >= 34) return null;

  const recent = evaluatePlayerRecentMlbStats(p);
  const agePenalty = p.age <= 29 ? 2 : p.age <= 31 ? 0 : p.age === 32 ? -3 : -6;
  const effectiveScore = p.ability + recent.delta + agePenalty;

  // MLB 진출 장벽 높게 유지: 최소 능력치 82 이상 & 종합 평가 85 이상 최상위권 위주
  if (p.ability < 82 || effectiveScore < 85) return null;

  const offerProb =
    effectiveScore >= 90
      ? 0.92
      : effectiveScore >= 88
      ? 0.78
      : effectiveScore >= 86
      ? 0.56
      : 0.34;
  if (rng.next() > offerProb) return null;

  const mlbTeam = MLB_CLUBS[rng.int(0, MLB_CLUBS.length - 1)];
  const ageMult = p.age <= 28 ? 1.15 : p.age <= 30 ? 1.0 : p.age <= 31 ? 0.82 : 0.62;
  const rawUsd =
    effectiveScore >= 90
      ? 48 + (effectiveScore - 90) * 10 + rng.int(4, 22)
      : effectiveScore >= 87
      ? 24 + (effectiveScore - 87) * 7 + rng.int(2, 12)
      : 10 + (effectiveScore - 85) * 4 + rng.int(1, 6);
  const guaranteedUsdMillions = Math.max(6, Math.min(105, Math.round(rawUsd * ageMult)));
  const years =
    p.age >= 32
      ? rng.int(1, 2)
      : guaranteedUsdMillions >= 52
      ? rng.int(4, 5)
      : guaranteedUsdMillions >= 22
      ? rng.int(3, 4)
      : rng.int(2, 3);
  // $1M ≈ 13.5억 원
  const krwEquivalentBillion = Number((guaranteedUsdMillions * 13.5).toFixed(1));

  const { fairTotalBillion } = evaluateFaGradeAndComp(career, p);
  // KBO FA 점수와 직접 비교 가능한 선수 관점 MLB 평가 점수 산출
  // (단기·소규모 MLB 보장액은 초대형 KBO FA 제안에 밀릴 수 있고, 빅리그 대형 계약은 MLB가 우세)
  const moneyRatio = Math.min(2.0, krwEquivalentBillion / Math.max(15, fairTotalBillion * 1.55));
  const desireBonus =
    p.overseasInterest === '적극희망' ? 11 : p.overseasInterest === '관심' ? 5 : -6;
  const mlbPrestige = guaranteedUsdMillions >= 30 ? 12 : guaranteedUsdMillions >= 16 ? 7 : 3;
  const yearsFit = years >= 4 ? 10 : years === 3 ? 7 : 4;
  const score = Number(
    clamp(moneyRatio * 56 + yearsFit + mlbPrestige + desireBonus, 40, 122).toFixed(2)
  );

  return {
    mlbTeam,
    years,
    guaranteedUsdMillions,
    krwEquivalentBillion,
    score,
    evaluationNote: `능력치 ${p.ability} · 만 ${p.age}세 · ${recent.summary}`,
    submittedDate: dateStr,
  };
}

/**
 * 해외 FA 선수의 MLB 직접 계약 최종 확정 (구단 승인 불필요 · 기존 해외 추적 시스템 즉시 반영)
 */
function finalizeOverseasFaMlbSigningInPlace(
  career: CareerSave,
  neg: FaMarketNegotiation,
  p: Player,
  offer: MlbOverseasFaOffer,
  dateStr: string
): void {
  if (p.signedAsFaSeason === career.season || neg.status === '계약완료') return;

  const fromTeamId = neg.formerTeamId ?? p.formerTeamId ?? p.teamId;
  if (career.teams[fromTeamId]) {
    career.teams[fromTeamId].lineupOrder = career.teams[fromTeamId].lineupOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].benchOrder = career.teams[fromTeamId].benchOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].rotationOrder = career.teams[fromTeamId].rotationOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].bullpenOrder = career.teams[fromTeamId].bullpenOrder.filter((id) => id !== p.id);
  }

  p.formerTeamId = fromTeamId;
  p.rosterTier = '해외이적';
  p.gameDayActive = false;
  p.signedAsFaSeason = career.season;
  p.contract = {
    ...p.contract,
    status: '확정',
    currency: 'USD',
    years: offer.years,
    yearsRemaining: offer.years,
    annualSalary: Number((offer.guaranteedUsdMillions / Math.max(1, offer.years)).toFixed(2)),
    totalValue: offer.guaranteedUsdMillions,
    startSeason: career.season,
    endSeason: career.season + offer.years - 1,
    isFAEligible: false,
    note: `${career.season} 해외 FA MLB 진출 (${offer.mlbTeam} ${offer.years}년 $${offer.guaranteedUsdMillions}M)`,
  };

  neg.status = '계약완료';
  neg.mlbStatus = 'MLB진출확정';
  neg.signedMlbTeam = offer.mlbTeam;
  neg.signedMlbUsdMillions = offer.guaranteedUsdMillions;
  neg.signedYears = offer.years;
  neg.closedDate = dateStr;
  neg.pendingWinnerTeamId = undefined;

  // 기존 MLB/해외파 추적 시스템(mlbExports + player.teamHistory + amateurAndOverseas.overseasPlayers)에 반영
  recordMlbExportPlayer(
    career,
    p,
    offer.mlbTeam,
    offer.years,
    offer.guaranteedUsdMillions,
    dateStr,
    '해외FA'
  );

  const fromShort = KBO_TEAMS[fromTeamId].shortName;
  if (!career.newsFeed) career.newsFeed = [];
  career.newsFeed.unshift({
    id: `news-mlb-ofa-${career.season}-${p.id}`,
    season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
    date: dateStr,
    category: 'MLB소식',
    headline: `[해외 FA MLB 진출 확정] 전 ${fromShort} ${p.name}, ${offer.mlbTeam}과 ${offer.years}년 $${offer.guaranteedUsdMillions}M 계약!`,
    body: `해외 FA 자격을 얻은 ${p.name}(${p.position}, ${p.age}세) 선수가 구단 승인 없이 KBO와 MLB 제안을 직접 비교한 끝에 ${offer.mlbTeam} 입단을 확정 지었습니다. (${offer.evaluationNote})`,
    teamId: fromTeamId,
    isHighlight: true,
  });

  if (fromTeamId === career.playerTeamId) {
    career.transactionLogs.unshift({
      id: `tx-mlb-ofa-${career.season}-${p.id}`,
      date: dateStr,
      type: '포스팅',
      teamId: fromTeamId,
      summary: `[해외 FA MLB 이적] ${p.name} → ${offer.mlbTeam} (${offer.years}년 $${offer.guaranteedUsdMillions}M)`,
      detail: '해외 FA 자격으로 구단 승인 없이 MLB 구단과 직접 계약 체결 (이적료 없음)',
    });
  }
}

/**
 * FA 경쟁 상태 초기화 및 10개 구단 + 해외 FA MLB 자동 평가·입찰 동기화 (기존 세이브 호환)
 */
export function syncFaCompetitionMarketInPlace(
  career: CareerSave,
  dateStr = `${career.season}-11-18`
): FaCompetitionState {
  if (!career.faCompetition || career.faCompetition.season !== career.season) {
    career.faCompetition = {
      season: career.season,
      round: 1,
      externalSigningsByTeam: {},
      negotiations: {},
    };
  }
  const state = career.faCompetition;
  const standings = computeStandings(career.gamesLedger);
  const rankByTeam = new Map<TeamId, number>();
  standings.forEach((row, idx) => rankByTeam.set(row.teamId, idx + 1));

  const faPlayers = getAllMarketFaPlayers(career);
  const rng = new SeededRng((career.season * 9973 + state.round * 131 + 77) >>> 0);

  for (const p of faPlayers) {
    const formerTeamId = p.formerTeamId ?? p.teamId;
    const comp = evaluateFaGradeAndComp(career, p);
    const overseasEligible = isOverseasFaEligible(p);

    let neg = state.negotiations[p.id];
    if (!neg) {
      neg = {
        playerId: p.id,
        playerName: p.name,
        formerTeamId,
        faGrade: comp.grade,
        status: '입찰중',
        bids: [],
        roundCount: 0,
        mlbOverseasFaEligible: overseasEligible,
        mlbStatus: '미제안',
      };
      state.negotiations[p.id] = neg;
    } else if (neg.mlbOverseasFaEligible === undefined) {
      neg.mlbOverseasFaEligible = overseasEligible;
    }

    if (neg.status === '계약완료' || p.signedAsFaSeason === career.season) {
      neg.status = '계약완료';
      continue;
    }

    // 9개 AI 구단(원소속 구단 포함!)이 모든 FA 선수를 평가하고 예산·필요도·능력치 기반 자동 입찰
    evaluateAiClubBidsForPlayerInPlace(career, state, neg, p, rankByTeam, dateStr, rng);

    // 해외 FA 자격 선수(사용자·AI 구단 동일 적용): 최상위권 위주 MLB 직접 제안 평가
    if (
      overseasEligible &&
      neg.mlbStatus !== 'MLB협상결렬' &&
      neg.mlbStatus !== 'MLB진출확정' &&
      !neg.mlbOffer
    ) {
      const mlbRng = new SeededRng((career.season * 44111 + hashStr(p.id) + state.round * 19) >>> 0);
      const mlbOffer = evaluateOverseasFaMlbOffer(career, p, dateStr, mlbRng);
      if (mlbOffer) {
        neg.mlbOffer = mlbOffer;
        neg.mlbStatus = 'MLB제안접수';
      }
    }
  }

  return state;
}

function evaluateAiClubBidsForPlayerInPlace(
  career: CareerSave,
  state: FaCompetitionState,
  neg: FaMarketNegotiation,
  p: Player,
  rankByTeam: Map<TeamId, number>,
  dateStr: string,
  rng: SeededRng
): void {
  const comp = evaluateFaGradeAndComp(career, p);
  const existingTopTotal = neg.bids.reduce((m, b) => Math.max(m, b.totalBillion), 0);

  for (const tid of TEAM_IDS) {
    // 사용자 구단은 절대 AI가 자동 입찰하지 않음 (단장 직접 입찰·승인 전용)
    if (tid === career.playerTeamId) continue;

    const isOriginalClub = tid === neg.formerTeamId;
    const extCount = state.externalSigningsByTeam[tid] ?? 0;
    // KBO 외부 FA 영입 상한 준수 (원소속 재계약은 예외)
    if (!isOriginalClub && extCount >= MAX_EXTERNAL_FA_PER_CLUB) continue;

    const need = computeClubPositionalNeed(career, tid, p);
    const clubProfile = getClubMarketProfile(career, tid, rankByTeam);

    // 구단별 관심도 계산: 능력치 + 포지션 필요도 + 원소속 우선권 + 재정 여력
    const budgetOk = clubProfile.budgetCapacityBillion >= comp.fairTotalBillion * 0.72;
    if (!budgetOk && !isOriginalClub) continue;

    // 이미 입찰이 과도하게 쏠린 구단은 자연스럽게 추가 대형 FA 추격 자제 (인위적 할당 X, 예산/로스터 현실 반영)
    const activeBidsByClub = Object.values(state.negotiations).filter(
      (n) => n.status === '입찰중' && n.bids.some((b) => b.teamId === tid)
    ).length;
    if (!isOriginalClub && activeBidsByClub >= 4) continue;

    // 외부 A/B등급 FA는 보상선수 + 보상금 부담 반영
    const compBurdenPenalty =
      !isOriginalClub && comp.grade === 'A'
        ? 8.5
        : !isOriginalClub && comp.grade === 'B'
        ? 4.0
        : 0;
    const interestScore =
      p.ability * 0.45 +
      need * 0.4 +
      (isOriginalClub ? 16 : 0) +
      (clubProfile.aggressiveness - 1) * 30 -
      compBurdenPenalty +
      (rng.next() * 14 - 7);

    // 70점 이상이면 입찰 참여 (특급 FA는 여러 구단 동시 경합, C등급/중견도 복수 구단 관심)
    const threshold = p.ability >= 81 ? 66 : p.ability >= 76 ? 70 : 73;
    const prevBidIdx = neg.bids.findIndex((b) => b.teamId === tid);

    if (prevBidIdx < 0 && interestScore < threshold) continue;

    // 입찰 금액 산정
    const needMult = 0.88 + (need / 100) * 0.24; // 0.91 ~ 1.12
    const origMult = isOriginalClub ? 0.97 : 1.03;
    const maxWilling = Number(
      Math.min(
        clubProfile.budgetCapacityBillion * 1.15,
        comp.fairTotalBillion * needMult * origMult * clubProfile.aggressiveness * (0.94 + rng.next() * 0.16)
      ).toFixed(1)
    );

    if (prevBidIdx >= 0) {
      const prevBid = neg.bids[prevBidIdx];
      // 경쟁 입찰이 더 높고 구단 상한 여유가 있으면 4~9% 상향 재입찰
      if (existingTopTotal > prevBid.totalBillion && maxWilling > prevBid.totalBillion * 1.03) {
        const raisedTotal = Number(
          Math.min(maxWilling, existingTopTotal * (1.02 + rng.next() * 0.06)).toFixed(1)
        );
        const years = prevBid.years;
        const annualBillion = Number((raisedTotal / years).toFixed(2));
        const scored = scoreBidForPlayer(
          career,
          p,
          { teamId: tid, years, totalBillion: raisedTotal, annualBillion, isOriginalClub, submittedDate: dateStr },
          rankByTeam
        );
        neg.bids[prevBidIdx] = {
          teamId: tid,
          years,
          totalBillion: raisedTotal,
          annualBillion,
          isOriginalClub,
          submittedDate: dateStr,
          score: scored.score,
          note: scored.note,
        };
      }
      continue;
    }

    const offerTotal = Number(
      Math.max(1.8, Math.min(maxWilling, comp.fairTotalBillion * (0.9 + rng.next() * 0.16))).toFixed(1)
    );
    const maxYears = getMaxRealisticFaYears(p.age, p.ability);
    const offerYears = clamp(
      comp.fairYears + (need >= 80 && p.age <= 31 ? 1 : 0) - (p.age >= 35 ? 1 : 0),
      1,
      maxYears
    );
    const annualBillion = Number((offerTotal / offerYears).toFixed(2));
    const scored = scoreBidForPlayer(
      career,
      p,
      { teamId: tid, years: offerYears, totalBillion: offerTotal, annualBillion, isOriginalClub, submittedDate: dateStr },
      rankByTeam
    );
    neg.bids.push({
      teamId: tid,
      years: offerYears,
      totalBillion: offerTotal,
      annualBillion,
      isOriginalClub,
      submittedDate: dateStr,
      score: scored.score,
      note: scored.note,
    });
  }

  neg.bids.sort((a, b) => b.score - a.score || b.totalBillion - a.totalBillion);
}

/**
 * AI 구단 FA 계약 최종 확정 (KBO A/B/C 보상 규정 + 모든 경쟁 입찰 즉시 마감 + 중복 방지 + 영입 현황 기록 + 뉴스)
 */
function finalizeAiClubFaSigningInPlace(
  career: CareerSave,
  state: FaCompetitionState,
  neg: FaMarketNegotiation,
  p: Player,
  winningBid: FaClubBid,
  dateStr: string
): void {
  if (p.signedAsFaSeason === career.season || neg.status === '계약완료') return;

  const newTeamId = winningBid.teamId;
  const fromTeamId = neg.formerTeamId;
  const isOriginalClub = newTeamId === fromTeamId;
  const comp = evaluateFaGradeAndComp(career, p);

  // 이전 소속팀 라인업/로테이션 정리
  if (career.teams[fromTeamId]) {
    career.teams[fromTeamId].lineupOrder = career.teams[fromTeamId].lineupOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].benchOrder = career.teams[fromTeamId].benchOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].rotationOrder = career.teams[fromTeamId].rotationOrder.filter((id) => id !== p.id);
    career.teams[fromTeamId].bullpenOrder = career.teams[fromTeamId].bullpenOrder.filter((id) => id !== p.id);
  }

  const signingBonus = Number((winningBid.totalBillion * 0.4).toFixed(2));
  const annualSalary = Number(
    ((winningBid.totalBillion - signingBonus) / Math.max(1, winningBid.years)).toFixed(2)
  );

  p.teamId = newTeamId;
  p.formerTeamId = undefined;
  p.rosterTier = '1군';
  p.gameDayActive = true;
  p.signedAsFaSeason = career.season;
  p.morale = '만족';
  p.dissatisfaction = Math.min(p.dissatisfaction ?? 15, 18);
  if (!isOriginalClub) {
    p.clubTenureSeasons = 1;
    appendPlayerTeamHistoryInPlace(p, newTeamId, career.season, `${career.season} FA 이적`);
    state.externalSigningsByTeam[newTeamId] = (state.externalSigningsByTeam[newTeamId] ?? 0) + 1;
  }

  p.contract = {
    status: '확정',
    currency: 'KRW',
    years: winningBid.years,
    yearsRemaining: winningBid.years,
    annualSalary,
    signingBonus,
    totalValue: winningBid.totalBillion,
    startSeason: career.season,
    endSeason: career.season + winningBid.years - 1,
    isFAEligible: false,
    faGrade: comp.grade,
    optionBonusPaidBillion: 0,
    note: isOriginalClub
      ? `${career.season} 원소속팀 FA 잔류 (${winningBid.years}년 ${winningBid.totalBillion.toFixed(1)}억)`
      : `${career.season} 외부 FA ${comp.grade}등급 계약 (${winningBid.years}년 ${winningBid.totalBillion.toFixed(1)}억)`,
  };

  if (career.teams[newTeamId]) {
    if (p.role === '투수') {
      if (p.pitchRole === '선발' && career.teams[newTeamId].rotationOrder.length < 5) {
        career.teams[newTeamId].rotationOrder.push(p.id);
      } else {
        career.teams[newTeamId].bullpenOrder.push(p.id);
      }
    } else {
      career.teams[newTeamId].benchOrder.push(p.id);
    }
  }

  // KBO A/B/C FA 보상 규정 적용 (외부 영입 시)
  let compSummary = '원소속팀 잔류 (보상 없음)';
  if (!isOriginalClub) {
    if (comp.grade === 'A' || comp.grade === 'B') {
      // AI 영입 구단의 20인(A) / 25인(B) 보호명단 외 최상위 선수 1명 보상 지명 (프랜차이즈 스타 자동 보호)
      const pool = Object.values(career.players)
        .filter(
          (pl) =>
            pl.teamId === newTeamId &&
            pl.id !== p.id &&
            pl.category === '국내' &&
            (pl.rosterTier === '1군' || pl.rosterTier === '2군') &&
            !isMilitaryServing(pl.militaryStatus)
        )
        .sort((a, b) => {
          const faA = evaluateFranchiseStar(career, a);
          const faB = evaluateFranchiseStar(career, b);
          const protA = faA.score >= 85 || faA.protectionTier === '프랜차이즈 스타' ? 100 : 0;
          const protB = faB.score >= 85 || faB.protectionTier === '프랜차이즈 스타' ? 100 : 0;
          return (
            protB +
            b.ability +
            b.potential * 0.25 -
            (protA + a.ability + a.potential * 0.25)
          );
        });
      const compPlayer = pool[comp.protectionLimit];
      if (compPlayer) {
        if (career.teams[newTeamId]) {
          career.teams[newTeamId].lineupOrder = career.teams[newTeamId].lineupOrder.filter((id) => id !== compPlayer.id);
          career.teams[newTeamId].benchOrder = career.teams[newTeamId].benchOrder.filter((id) => id !== compPlayer.id);
          career.teams[newTeamId].rotationOrder = career.teams[newTeamId].rotationOrder.filter((id) => id !== compPlayer.id);
          career.teams[newTeamId].bullpenOrder = career.teams[newTeamId].bullpenOrder.filter((id) => id !== compPlayer.id);
        }
        compPlayer.teamId = fromTeamId;
        compPlayer.rosterTier = '2군';
        compPlayer.gameDayActive = false;
        compPlayer.clubTenureSeasons = 1;
        appendPlayerTeamHistoryInPlace(compPlayer, fromTeamId, career.season, `${p.name} FA 보상선수`);
        compSummary = `${comp.grade}등급 보상: 보호선수 ${comp.protectionLimit}인 외 ${compPlayer.name} + 보상금 ${comp.cashCompBillion}억`;
      } else {
        compSummary = `${comp.grade}등급 금전 보상 ${comp.cashCompBillion}억 정산`;
      }
      // 만약 원소속 구단이 사용자 구단이라면 현금 보상 입금
      if (fromTeamId === career.playerTeamId && career.finances.cashBalanceBillion !== null) {
        career.finances.cashBalanceBillion = Number(
          (career.finances.cashBalanceBillion + comp.cashCompBillion).toFixed(2)
        );
        career.finances.compensationReceivedBillion = Number(
          ((career.finances.compensationReceivedBillion ?? 0) + comp.cashCompBillion).toFixed(2)
        );
      }
    } else {
      compSummary = `C등급 보상금 ${comp.cashCompBillion}억 정산 (보상선수 없음)`;
      if (fromTeamId === career.playerTeamId && career.finances.cashBalanceBillion !== null) {
        career.finances.cashBalanceBillion = Number(
          (career.finances.cashBalanceBillion + comp.cashCompBillion).toFixed(2)
        );
        career.finances.compensationReceivedBillion = Number(
          ((career.finances.compensationReceivedBillion ?? 0) + comp.cashCompBillion).toFixed(2)
        );
      }
    }
  }

  // 계약 확정 즉시 해당 선수의 모든 타 구단 입찰 마감
  neg.status = '계약완료';
  neg.signedTeamId = newTeamId;
  neg.signedTotalBillion = winningBid.totalBillion;
  neg.signedYears = winningBid.years;
  neg.closedDate = dateStr;
  neg.bids = [winningBid];

  const newClubShort = KBO_TEAMS[newTeamId].shortName;
  const fromClubShort = KBO_TEAMS[fromTeamId].shortName;

  // 리그 전체 뉴스 발행 (오프시즌 스토브리그 뉴스는 다음 시즌으로 분류)
  if (!career.newsFeed) career.newsFeed = [];
  career.newsFeed.unshift({
    id: `news-fa-comp-${career.season}-${p.id}-${newTeamId}`,
    season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
    date: dateStr,
    category: '이적·계약',
    headline: isOriginalClub
      ? `[FA 잔류] ${newClubShort}, ${p.name}(${comp.grade}등급)과 ${winningBid.years}년 ${winningBid.totalBillion.toFixed(1)}억 재계약`
      : `[FA 이적] ${newClubShort}, ${comp.grade}등급 ${p.name} ${winningBid.years}년 ${winningBid.totalBillion.toFixed(1)}억 영입 확정`,
    body: `${p.name} 선수가 치열한 구단 경합 끝에 ${KBO_TEAMS[newTeamId].name}와 계약했습니다. (${compSummary})`,
    teamId: newTeamId,
    isHighlight: p.ability >= 80 || fromTeamId === career.playerTeamId,
  });

  // 전체 구단 영입 현황 기록 (중복 방지)
  recordLeagueAcquisitionInPlace(
    career,
    {
      dedupeKey: `fa-${career.season}-${p.id}-${newTeamId}`,
      season: career.season,
      date: dateStr,
      category: 'FA',
      playerId: p.id,
      playerName: p.name,
      position: p.position,
      previousTeamLabel: isOriginalClub ? `${fromClubShort} (원소속 재계약)` : fromClubShort,
      acquiringTeamId: newTeamId,
      contractAmountLabel: `${winningBid.years}년 ${winningBid.totalBillion.toFixed(1)}억`,
      note: compSummary,
    },
    { pushNewsAlert: false }
  );
}

/**
 * 사용자 구단 단장이 FA 선수에게 공식 입찰 제안 제출
 * - 사용자 구단 FA 계약은 절대 자동 확정되지 않으며, 선수 선택 시 '단장승인대기'로 전환 후 단장 최종 승인 시에만 체결
 */
export function submitUserClubFaBid(
  career: CareerSave,
  playerId: string,
  offerYears: number,
  offerTotalBillion: number
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  status: '입찰중' | '단장승인대기';
  message: string;
} {
  if (!Number.isFinite(offerYears) || offerYears < 1 || !Number.isFinite(offerTotalBillion) || offerTotalBillion <= 0) {
    throw new Error('유효한 계약 연수와 총액을 입력해 주세요.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const dateStr = getCurrentCareerDate(next).isoDate;
  const state = syncFaCompetitionMarketInPlace(next, dateStr);
  const p = next.players[playerId];
  if (!p) throw new Error('대상 FA 선수를 찾을 수 없습니다.');
  if (p.signedAsFaSeason === next.season) {
    throw new Error('이미 올 시즌 FA 계약을 완료한 선수입니다 (중복 계약 방지).');
  }

  const neg = state.negotiations[playerId];
  if (!neg || neg.status === '계약완료') {
    throw new Error('이미 계약이 마감된 FA 선수입니다.');
  }

  const isOriginalClub = neg.formerTeamId === next.playerTeamId;
  const extCount = state.externalSigningsByTeam[next.playerTeamId] ?? 0;
  if (!isOriginalClub && extCount >= MAX_EXTERNAL_FA_PER_CLUB) {
    throw new Error(
      `KBO 규정상 단일 시즌 외부 FA 영입은 최대 ${MAX_EXTERNAL_FA_PER_CLUB}명까지 가능합니다. (현재 ${extCount}명 영입 완료 · 원소속 재계약은 제한 없음)`
    );
  }

  const comp = evaluateFaGradeAndComp(next, p);
  const signingBonus = Number((offerTotalBillion * 0.4).toFixed(2));
  const cComp = !isOriginalClub && comp.grade === 'C' ? comp.cashCompBillion : 0;
  const requiredCash = Number((signingBonus + cComp).toFixed(2));
  if (next.finances.cashBalanceBillion !== null && next.finances.cashBalanceBillion < requiredCash) {
    throw new Error(`예상 계약금${cComp > 0 ? '+C등급 보상금' : ''}(${requiredCash}억)이 현재 보유 자금을 초과합니다.`);
  }

  const standings = computeStandings(next.gamesLedger);
  const rankByTeam = new Map<TeamId, number>();
  standings.forEach((row, idx) => rankByTeam.set(row.teamId, idx + 1));

  const maxRealisticYears = getMaxRealisticFaYears(p.age, p.ability);
  if (Math.round(offerYears) > maxRealisticYears) {
    throw new Error(
      `고령 선수 장기계약 현실성 제한: 만 ${p.age}세 ${p.name} 선수의 최대 현실적 계약 기간은 ${maxRealisticYears}년입니다.`
    );
  }
  const years = clamp(Math.round(offerYears), 1, maxRealisticYears);
  const totalBillion = Number(offerTotalBillion.toFixed(1));
  const annualBillion = Number((totalBillion / years).toFixed(2));
  const scored = scoreBidForPlayer(
    next,
    p,
    {
      teamId: next.playerTeamId,
      years,
      totalBillion,
      annualBillion,
      isOriginalClub,
      submittedDate: dateStr,
    },
    rankByTeam
  );

  const userBid: FaClubBid = {
    teamId: next.playerTeamId,
    years,
    totalBillion,
    annualBillion,
    isOriginalClub,
    submittedDate: dateStr,
    score: scored.score,
    note: scored.note,
  };

  neg.bids = [...neg.bids.filter((b) => b.teamId !== next.playerTeamId), userBid];
  // AI 경쟁 구단 즉각 반응 평가
  const rng = new SeededRng((next.season * 31337 + state.round * 53 + hashStr(playerId)) >>> 0);
  evaluateAiClubBidsForPlayerInPlace(next, state, neg, p, rankByTeam, dateStr, rng);
  neg.roundCount += 1;

  const topBid = neg.bids[0];
  const meetsThreshold = totalBillion >= comp.fairTotalBillion * (isOriginalClub ? 0.88 : 0.94);
  const mlbBeatsUser = Boolean(
    neg.mlbOffer &&
      neg.mlbStatus === 'MLB제안접수' &&
      neg.mlbOffer.score > (topBid?.score ?? 0)
  );

  if (topBid && topBid.teamId === next.playerTeamId && meetsThreshold && !mlbBeatsUser) {
    neg.status = '단장승인대기';
    neg.pendingWinnerTeamId = next.playerTeamId;
    next.updatedAt = new Date().toISOString();
    return {
      nextCareer: next,
      backupSnapshot,
      status: '단장승인대기',
      message: neg.mlbOffer
        ? `${p.name} 선수가 MLB(${neg.mlbOffer.mlbTeam}) 제안보다 우리 구단 조건(${years}년 ${totalBillion.toFixed(1)}억)을 높게 평가해 수락했습니다! [최종 계약 승인] 버튼을 눌러야 계약이 확정됩니다.`
        : `${p.name} 선수가 우리 구단 조건(${years}년 ${totalBillion.toFixed(1)}억)을 최우선으로 수락했습니다! [최종 계약 승인] 버튼을 눌러야 계약이 확정됩니다.`,
    };
  }

  const leaderLabel = mlbBeatsUser && neg.mlbOffer
    ? `MLB ${neg.mlbOffer.mlbTeam}(${neg.mlbOffer.years}년 $${neg.mlbOffer.guaranteedUsdMillions}M)`
    : topBid
    ? `${KBO_TEAMS[topBid.teamId].shortName}(${topBid.years}년 ${topBid.totalBillion.toFixed(1)}억)`
    : '시장 적정가 미달';

  next.updatedAt = new Date().toISOString();
  return {
    nextCareer: next,
    backupSnapshot,
    status: '입찰중',
    message: `${p.name}에게 ${years}년 ${totalBillion.toFixed(1)}억 입찰을 제출했습니다. 현재 선두: ${leaderLabel} (KBO ${neg.bids.length}개팀${neg.mlbOffer ? ' + MLB 1개팀' : ''})`,
  };
}

/**
 * 10개 구단 FA 경쟁 1라운드 진행
 * - AI 구단들이 추가 입찰 및 최종 계약 결정을 진행
 * - AI 승리 건은 즉시 계약 확정 + 타 입찰 마감 + 뉴스 + 영입 현황 기록
 * - 사용자 구단이 1순위인 건은 절대 자동 체결하지 않고 '단장승인대기' 상태로 보고
 */
export function advanceFaCompetitionRound(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
  signedSummaries: string[];
  pendingUserApprovals: string[];
} {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const state = syncFaCompetitionMarketInPlace(next, `${next.season}-11-21`);
  state.round += 1;

  const dateStr = `${next.season}-11-${String(Math.min(30, 18 + state.round)).padStart(2, '0')}`;
  const standings = computeStandings(next.gamesLedger);
  const rankByTeam = new Map<TeamId, number>();
  standings.forEach((row, idx) => rankByTeam.set(row.teamId, idx + 1));
  const rng = new SeededRng((next.season * 19997 + state.round * 419) >>> 0);

  const signedSummaries: string[] = [];
  const pendingUserApprovals: string[] = [];

  for (const neg of Object.values(state.negotiations)) {
    if (neg.status !== '입찰중') continue;
    const p = next.players[neg.playerId];
    if (!p || p.signedAsFaSeason === next.season) {
      neg.status = '계약완료';
      continue;
    }

    evaluateAiClubBidsForPlayerInPlace(next, state, neg, p, rankByTeam, dateStr, rng);
    neg.roundCount += 1;

    const topBid = neg.bids[0];
    const activeMlbOffer = neg.mlbStatus === 'MLB제안접수' ? neg.mlbOffer : undefined;

    // 해외 FA 선수는 KBO와 MLB의 계약 제안을 직접 비교해 선택 (구단 승인 불필요)
    if (activeMlbOffer) {
      const kboTopScore = topBid?.score ?? 0;
      if (activeMlbOffer.score > kboTopScore) {
        // 1라운드에서는 더 좋은 MLB 제안을 검토하며 KBO 구단의 추가 대응 입찰을 1라운드 대기
        if (neg.roundCount < 2) {
          continue;
        }
        // 경계선 규모 MLB 계약은 메디컬·세부 조건 이견으로 결렬될 수 있음 -> 실패 시 KBO 잔류/국내 FA 협상 지속
        const failChance = activeMlbOffer.guaranteedUsdMillions < 18 ? 0.24 : 0.08;
        if (rng.next() < failChance) {
          neg.mlbStatus = 'MLB협상결렬';
          neg.mlbFailureReason = `${activeMlbOffer.mlbTeam}와 보장 조건·마이너 옵션 이견으로 MLB 협상 결렬 → KBO 잔류 및 국내 FA 협상 지속`;
          neg.mlbOffer = undefined;
          if (!next.newsFeed) next.newsFeed = [];
          next.newsFeed.unshift({
            id: `news-mlb-ofa-fail-${next.season}-${p.id}`,
            season: next.phase === 'OFFSEASON' ? next.season + 1 : next.season,
            date: dateStr,
            category: 'MLB소식',
            headline: `[해외 FA MLB 협상 결렬] ${p.name}, ${activeMlbOffer.mlbTeam} 계약 불발… KBO FA 협상 복귀`,
            body: `해외 FA로 빅리그 진출을 타진하던 ${p.name} 선수가 ${activeMlbOffer.mlbTeam}과의 세부 조건 합의에 실패해 KBO 국내 FA 협상으로 복귀했습니다.`,
            teamId: neg.formerTeamId,
          });
          continue;
        }
        finalizeOverseasFaMlbSigningInPlace(next, neg, p, activeMlbOffer, dateStr);
        signedSummaries.push(
          `MLB ${activeMlbOffer.mlbTeam} ← ${p.name} (해외 FA ${activeMlbOffer.years}년 $${activeMlbOffer.guaranteedUsdMillions}M)`
        );
        continue;
      }
    }

    if (!topBid) continue;
    const comp = evaluateFaGradeAndComp(next, p);

    // 라운드가 진행될수록 선수가 최종 행선지 결정
    const decideThreshold =
      neg.roundCount >= 3
        ? comp.fairTotalBillion * 0.82
        : neg.roundCount >= 2
        ? comp.fairTotalBillion * 0.92
        : comp.fairTotalBillion * 1.02;

    if (topBid.totalBillion < decideThreshold) continue;

    if (topBid.teamId === next.playerTeamId) {
      // 사용자 구단은 단장 최종 승인 없이 자동 체결 금지!
      neg.status = '단장승인대기';
      neg.pendingWinnerTeamId = next.playerTeamId;
      pendingUserApprovals.push(`${p.name} (${topBid.years}년 ${topBid.totalBillion.toFixed(1)}억)`);
    } else {
      // AI 구단 외부 FA 상한 재확인
      const isOrig = topBid.teamId === neg.formerTeamId;
      const extCnt = state.externalSigningsByTeam[topBid.teamId] ?? 0;
      if (!isOrig && extCnt >= MAX_EXTERNAL_FA_PER_CLUB) {
        neg.bids = neg.bids.filter((b) => b.teamId !== topBid.teamId);
        continue;
      }
      finalizeAiClubFaSigningInPlace(next, state, neg, p, topBid, dateStr);
      signedSummaries.push(
        `${KBO_TEAMS[topBid.teamId].shortName} ← ${p.name} (${topBid.years}년 ${topBid.totalBillion.toFixed(1)}억)`
      );
    }
  }

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, signedSummaries, pendingUserApprovals };
}

/**
 * 단장승인대기 상태의 사용자 구단 FA 입찰 취소(철회)
 */
export function declinePendingUserFaApproval(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave } {
  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const neg = next.faCompetition?.negotiations[playerId];
  if (neg && neg.status === '단장승인대기') {
    neg.status = '입찰중';
    neg.pendingWinnerTeamId = undefined;
    neg.bids = neg.bids.filter((b) => b.teamId !== next.playerTeamId);
  }
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}

/**
 * 계약 확정된 선수의 FA 경쟁 입찰 상태를 즉시 마감 처리 (외부 signExternalFaPlayer 연동용)
 */
export function markFaNegotiationSignedInPlace(
  career: CareerSave,
  playerId: string,
  signedTeamId: TeamId,
  years: number,
  totalBillion: number,
  isOriginalClub: boolean,
  dateStr: string
): void {
  if (!career.faCompetition || career.faCompetition.season !== career.season) {
    career.faCompetition = {
      season: career.season,
      round: 1,
      externalSigningsByTeam: {},
      negotiations: {},
    };
  }
  const state = career.faCompetition;
  if (!isOriginalClub) {
    state.externalSigningsByTeam[signedTeamId] = (state.externalSigningsByTeam[signedTeamId] ?? 0) + 1;
  }
  const p = career.players[playerId];
  const existing = state.negotiations[playerId];
  state.negotiations[playerId] = {
    playerId,
    playerName: p?.name ?? existing?.playerName ?? playerId,
    formerTeamId: existing?.formerTeamId ?? p?.formerTeamId ?? signedTeamId,
    faGrade: existing?.faGrade ?? p?.contract.faGrade ?? 'B',
    status: '계약완료',
    bids: [
      {
        teamId: signedTeamId,
        years,
        totalBillion,
        annualBillion: Number((totalBillion / Math.max(1, years)).toFixed(2)),
        isOriginalClub,
        submittedDate: dateStr,
        score: 100,
        note: '단장 최종 승인 확정',
      },
    ],
    signedTeamId,
    signedTotalBillion: totalBillion,
    signedYears: years,
    closedDate: dateStr,
    roundCount: (existing?.roundCount ?? 0) + 1,
  };
}

/**
 * 오프시즌 종료/차기 시즌 개막 전 남은 미계약 FA들에 대한 AI 구단 최종 정리 (사용자 구단 자동 체결 절대 없음)
 */
export function resolveRemainingAiFaCompetitionInPlace(
  career: CareerSave,
  dateStr = `${career.season}-12-10`
): string[] {
  const state = syncFaCompetitionMarketInPlace(career, dateStr);
  const standings = computeStandings(career.gamesLedger);
  const rankByTeam = new Map<TeamId, number>();
  standings.forEach((row, idx) => rankByTeam.set(row.teamId, idx + 1));
  const rng = new SeededRng((career.season * 61333 + 19) >>> 0);
  const summaries: string[] = [];

  for (const neg of Object.values(state.negotiations)) {
    if (neg.status === '계약완료') continue;
    const p = career.players[neg.playerId];
    if (!p || p.rosterTier !== 'FA' || p.signedAsFaSeason === career.season) continue;

    evaluateAiClubBidsForPlayerInPlace(career, state, neg, p, rankByTeam, dateStr, rng);
    const activeMlbOffer = neg.mlbStatus === 'MLB제안접수' ? neg.mlbOffer : undefined;
    const aiWinner = neg.bids.find((b) => {
      if (b.teamId === career.playerTeamId) return false;
      const isOrig = b.teamId === neg.formerTeamId;
      return isOrig || (state.externalSigningsByTeam[b.teamId] ?? 0) < MAX_EXTERNAL_FA_PER_CLUB;
    });

    if (activeMlbOffer && activeMlbOffer.score > (aiWinner?.score ?? 0)) {
      const failChance = activeMlbOffer.guaranteedUsdMillions < 18 ? 0.24 : 0.08;
      if (rng.next() >= failChance) {
        finalizeOverseasFaMlbSigningInPlace(career, neg, p, activeMlbOffer, dateStr);
        summaries.push(`MLB ${activeMlbOffer.mlbTeam} ← ${p.name} (해외 FA)`);
        continue;
      } else {
        neg.mlbStatus = 'MLB협상결렬';
        neg.mlbFailureReason = `${activeMlbOffer.mlbTeam} 계약 합의 불발 → KBO 잔류`;
        neg.mlbOffer = undefined;
      }
    }

    if (aiWinner) {
      finalizeAiClubFaSigningInPlace(career, state, neg, p, aiWinner, dateStr);
      summaries.push(`${KBO_TEAMS[aiWinner.teamId].shortName} ← ${p.name}`);
    }
  }
  return summaries;
}
