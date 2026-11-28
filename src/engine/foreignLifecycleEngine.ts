import { KBO_TEAMS, MLB_CLUBS, TEAM_IDS } from '../data/kboTeams';
import {
  allocateTeamUniformNumber,
  commitSeasonStatsToCareer,
  ensurePlayerRichMetadata,
  REAL_KBO_RETIRED_NUMBERS,
} from '../data/playerMetadata';
import {
  BatterStats,
  CareerSave,
  PitcherStats,
  Player,
  TeamId,
} from '../types/kbo';
import { recordMlbExportPlayer } from './franchiseSystems';
import { recordLeagueAcquisitionInPlace } from './leagueAcquisitionsEngine';
import { reconcileTeamLineupPositionsInPlace } from './lineupValidationEngine';
import { ensurePlayerOotpRatingsInPlace } from './ootpRatingsEngine';
import { SeededRng } from './rng';
import { executeAtomicCareerMutation, getCurrentCareerDate, getPlayerClubTenureSeasons } from './salaryCapEngine';
import {
  calcAVG,
  calcERA,
  calcOPS,
  calcWHIP,
  emptyBatterStats,
  emptyPitcherStats,
} from './stats';

const USD_TO_KRW_BILLION_RATE = 0.000014; // $1,000,000 = 14억 원

function toKrwBillionFromUsd(usd: number): number {
  return Number((Math.max(0, usd) * USD_TO_KRW_BILLION_RATE).toFixed(2));
}

export type ForeignSeasonTier = 'MLB자동진출' | '재계약추천' | '부진_교체검토' | '평가대기';

export interface ForeignSeasonEvaluation {
  tier: ForeignSeasonTier;
  qualifiedForMlb: boolean;
  mlbLikelihood: '확정권' | '유력' | '보통' | '낮음';
  statSummary: string;
  hasMeaningfulSample: boolean;
  reason: string;
  recommendedAction: 'MLB자동진출' | '계약유지' | '계약해지검토';
}

export interface ForeignRenewalQuote {
  playerId: string;
  targetSeason: number;
  alreadyRenewedForTarget: boolean;
  suggestedTotalUsd: number;
  suggestedSalaryUsd: number;
  suggestedSigningBonusUsd: number;
  upfrontKrwBillion: number;
  totalKrwBillion: number;
  adjustmentLabel: string;
  evaluation: ForeignSeasonEvaluation;
}

/**
 * 외국인·아시아쿼터 선수의 KBO 시즌 활약도 판정
 * - 압도적 성적(선발 110IP+ & ERA<=3.15/14승+/160K+, 불펜 28SV+ & ERA<=2.65, 타자 350PA+ & OPS>=0.895/26HR+/타율.320+)
 *   -> 시즌 종료 시 자동으로 MLB 역수출 진출
 * - 준수한 성적 -> 계약 유지(재계약) 추천
 * - 부진한 성적 -> 계약 해지(교체) 또는 할인 재계약(계약 유지) 선택 가능
 */
export function evaluateForeignPlayerSeasonOutcome(player: Player): ForeignSeasonEvaluation {
  if (player.role === '투수') {
    const ps = player.stats as PitcherStats;
    const outs = ps?.outs ?? 0;
    const ip = outs / 3;
    const era = calcERA(ps?.ER ?? 0, outs);
    const whip = calcWHIP(ps?.H ?? 0, ps?.BB ?? 0, outs);
    const wins = ps?.W ?? 0;
    const losses = ps?.L ?? 0;
    const saves = ps?.SV ?? 0;
    const holds = ps?.HLD ?? 0;
    const so = ps?.SO ?? 0;

    const hasSample = ip >= 25;
    const statSummary = hasSample
      ? `${wins}승 ${losses}패${saves > 0 ? ` ${saves}세이브` : ''}${holds > 0 && saves === 0 ? ` ${holds}홀드` : ''} · ${ip.toFixed(1)}이닝 · ERA ${era?.toFixed(2) ?? '-'} · ${so}K`
      : '시즌 실전 기록 대기';

    const qualifiedForMlb =
      (ip >= 110 &&
        ((era !== null && era <= 3.15) ||
          wins >= 14 ||
          so >= 160)) ||
      (ip >= 90 && era !== null && era <= 2.6 && whip !== null && whip <= 1.05) ||
      (ip >= 45 && saves >= 28 && era !== null && era <= 2.65) ||
      (ip >= 45 && holds >= 28 && era !== null && era <= 2.4);

    if (qualifiedForMlb) {
      return {
        tier: 'MLB자동진출',
        qualifiedForMlb: true,
        mlbLikelihood: '확정권',
        statSummary,
        hasMeaningfulSample: true,
        reason: `KBO 정상급 압도적 투구(${statSummary}) — 시즌 종료 시 MLB 구단 자동 영입 대상`,
        recommendedAction: 'MLB자동진출',
      };
    }

    // 시즌 중 MLB 진출 유력 페이스 판별
    const hotMlbPace =
      (ip >= 55 && era !== null && era <= 2.95 && (so / Math.max(1, ip)) >= 0.95) ||
      (ip >= 30 && saves >= 15 && era !== null && era <= 2.4);

    const lowAbilityThreshold = player.category === '아시아쿼터' ? 68 : 72;
    const isPoor =
      (ip >= 40 && era !== null && era >= 4.65) ||
      (ip >= 25 && era !== null && era >= 5.25) ||
      (!hasSample && player.ability <= lowAbilityThreshold);

    if (isPoor) {
      return {
        tier: '부진_교체검토',
        qualifiedForMlb: false,
        mlbLikelihood: '낮음',
        statSummary,
        hasMeaningfulSample: hasSample,
        reason: hasSample
          ? `성적 부진(${statSummary}) — 계약 해지(교체) 또는 할인 조건으로 계약 유지 선택 가능`
          : `기량(OVR ${player.ability}) 미달 — 교체 또는 단기 계약 유지 검토`,
        recommendedAction: '계약해지검토',
      };
    }

    if (!hasSample) {
      return {
        tier: '평가대기',
        qualifiedForMlb: false,
        mlbLikelihood: player.ability >= 84 ? '보통' : '낮음',
        statSummary,
        hasMeaningfulSample: false,
        reason: `충분한 실전 표본 대기 중 (현재 OVR ${player.ability} · 계약 유지 또는 해지 선택 가능)`,
        recommendedAction: '계약유지',
      };
    }

    return {
      tier: '재계약추천',
      qualifiedForMlb: false,
      mlbLikelihood: hotMlbPace ? '유력' : era !== null && era <= 3.55 ? '보통' : '낮음',
      statSummary,
      hasMeaningfulSample: true,
      reason: hotMlbPace
        ? `MLB 스카우트 주목 페이스(${statSummary}) — 시즌 끝까지 호투 시 MLB 진출 가능`
        : `안정적인 KBO 활약(${statSummary}) — 차기 시즌 계약 유지(재계약) 추천`,
      recommendedAction: '계약유지',
    };
  }

  // 타자 판정
  const bs = player.stats as BatterStats;
  const pa = bs?.PA ?? 0;
  const ops = calcOPS(bs ?? emptyBatterStats(false));
  const avg = calcAVG(bs?.H ?? 0, bs?.AB ?? 0);
  const hr = bs?.HR ?? 0;
  const rbi = bs?.RBI ?? 0;
  const hasSample = pa >= 80;
  const statSummary = hasSample
    ? `타율 ${avg?.toFixed(3) ?? '-'} · ${hr}홈런 ${rbi}타점 · OPS ${ops?.toFixed(3) ?? '-'}`
    : '시즌 실전 기록 대기';

  const qualifiedForMlb =
    pa >= 350 &&
    ((ops !== null && ops >= 0.895) ||
      hr >= 26 ||
      (avg !== null && avg >= 0.32) ||
      (hr >= 22 && ops !== null && ops >= 0.865));

  if (qualifiedForMlb) {
    return {
      tier: 'MLB자동진출',
      qualifiedForMlb: true,
      mlbLikelihood: '확정권',
      statSummary,
      hasMeaningfulSample: true,
      reason: `KBO 최정상급 타격(${statSummary}) — 시즌 종료 시 MLB 구단 자동 영입 대상`,
      recommendedAction: 'MLB자동진출',
    };
  }

  const hotMlbPace = pa >= 160 && ops !== null && ops >= 0.915;
  const lowAbilityThreshold = player.category === '아시아쿼터' ? 68 : 72;
  const isPoor =
    (pa >= 120 && ops !== null && ops <= 0.725) ||
    (pa >= 80 && avg !== null && avg <= 0.23 && ops !== null && ops <= 0.69) ||
    (!hasSample && player.ability <= lowAbilityThreshold);

  if (isPoor) {
    return {
      tier: '부진_교체검토',
      qualifiedForMlb: false,
      mlbLikelihood: '낮음',
      statSummary,
      hasMeaningfulSample: hasSample,
      reason: hasSample
        ? `타격 부진(${statSummary}) — 계약 해지(교체) 또는 할인 조건으로 계약 유지 선택 가능`
        : `기량(OVR ${player.ability}) 미달 — 교체 또는 단기 계약 유지 검토`,
      recommendedAction: '계약해지검토',
    };
  }

  if (!hasSample) {
    return {
      tier: '평가대기',
      qualifiedForMlb: false,
      mlbLikelihood: player.ability >= 84 ? '보통' : '낮음',
      statSummary,
      hasMeaningfulSample: false,
      reason: `충분한 실전 표본 대기 중 (현재 OVR ${player.ability} · 계약 유지 또는 해지 선택 가능)`,
      recommendedAction: '계약유지',
    };
  }

  return {
    tier: '재계약추천',
    qualifiedForMlb: false,
    mlbLikelihood: hotMlbPace ? '유력' : ops !== null && ops >= 0.835 ? '보통' : '낮음',
    statSummary,
    hasMeaningfulSample: true,
    reason: hotMlbPace
      ? `MLB 스카우트 주목 페이스(${statSummary}) — 시즌 끝까지 맹타 시 MLB 진출 가능`
      : `안정적인 KBO 활약(${statSummary}) — 차기 시즌 계약 유지(재계약) 추천`,
    recommendedAction: '계약유지',
  };
}

/**
 * 외국인·아시아쿼터 선수의 계약 유지(재계약) 조건 산출
 */
export function quoteForeignPlayerRenewal(
  career: CareerSave,
  player: Player
): ForeignRenewalQuote {
  const evaluation = evaluateForeignPlayerSeasonOutcome(player);
  const isAsian = player.category === '아시아쿼터';
  const curEnd = player.contract.endSeason ?? career.season;
  const isExpiredNow =
    player.contract.status === '만료' || (player.contract.yearsRemaining ?? 0) <= 0;
  const targetSeason =
    career.phase === 'OFFSEASON'
      ? career.season + 1
      : isExpiredNow
      ? career.season
      : career.season + 1;

  const alreadyRenewedForTarget =
    player.contract.status === '확정' && curEnd >= targetSeason;

  const baseTotalUsd =
    player.contract.currency === 'USD' && (player.contract.totalValue ?? 0) >= 50_000
      ? player.contract.totalValue
      : isAsian
      ? 200_000
      : 900_000;

  let mult = 1.0;
  let adjustmentLabel = '현행 조건 유지';

  if (evaluation.tier === '부진_교체검토') {
    mult = 0.82;
    adjustmentLabel = '부진 할인 재계약 (-18%)';
  } else if (evaluation.tier === '재계약추천') {
    if (evaluation.mlbLikelihood === '유력' || evaluation.mlbLikelihood === '보통') {
      mult = 1.15;
      adjustmentLabel = '우수 성적 인상 (+15%)';
    } else {
      mult = 1.05;
      adjustmentLabel = '안정 활약 소폭 인상 (+5%)';
    }
  } else if (evaluation.tier === 'MLB자동진출') {
    mult = 1.25;
    adjustmentLabel = '특급 활약 인상 (+25%)';
  }

  const minUsd = isAsian ? 120_000 : 500_000;
  const maxUsd = isAsian ? 350_000 : 1_800_000;
  const rawUsd = Math.round((baseTotalUsd * mult) / 10_000) * 10_000;
  const suggestedTotalUsd = Math.max(minUsd, Math.min(maxUsd, rawUsd));
  const suggestedSigningBonusUsd = Math.round((suggestedTotalUsd * 0.2) / 10_000) * 10_000;
  const suggestedSalaryUsd = Math.max(50_000, suggestedTotalUsd - suggestedSigningBonusUsd);

  return {
    playerId: player.id,
    targetSeason,
    alreadyRenewedForTarget,
    suggestedTotalUsd,
    suggestedSalaryUsd,
    suggestedSigningBonusUsd,
    upfrontKrwBillion: toKrwBillionFromUsd(suggestedSigningBonusUsd),
    totalKrwBillion: toKrwBillionFromUsd(suggestedTotalUsd),
    adjustmentLabel,
    evaluation,
  };
}

function getTeamRetiredNumbersList(career: CareerSave, teamId: TeamId): number[] {
  const base = REAL_KBO_RETIRED_NUMBERS[teamId] ?? [];
  const dynamic = (career.retirementCeremonies ?? [])
    .filter((c) => c.teamId === teamId && c.numberRetired && typeof c.uniformNumber === 'number')
    .map((c) => c.uniformNumber as number);
  return Array.from(new Set([...base, ...dynamic]));
}

function spawnAiReplacementForeignPlayerInPlace(
  career: CareerSave,
  teamId: TeamId,
  departed: Player,
  nextSeasonNum: number,
  dateStr: string,
  rng: SeededRng,
  reasonLabel: string
): Player {
  const isP = departed.role === '투수';
  const isAsian = departed.category === '아시아쿼터';
  const firstPool = isAsian
    ? ['다카하시', '사토', '야마모토', '와타나베', '천', '린', '왕', '스즈키']
    : ['에릭', '카일', '브랜든', '루카스', '드류', '타일러', '로건', '마커스', '호세', '라울', '제이크', '코디'];
  const lastPool = isAsian
    ? ['유키', '렌', '다이키', '하루토', '웨이', '하오', '신지', '켄토']
    : ['페디', '켈리', '산체스', '모건', '해밀턴', '카스트로', '밀러', '베넷', '바르가스', '스콧', '폰세', '알칸타라'];

  const existingNames = new Set(Object.values(career.players).map((pl) => pl.name));
  let repName = `${rng.pick(firstPool)} ${rng.pick(lastPool)}`;
  for (let i = 0; i < 8 && existingNames.has(repName); i++) {
    repName = `${rng.pick(firstPool)} ${rng.pick(lastPool)}`;
  }

  const repId = `ai-for-rep-${nextSeasonNum}-${teamId}-${departed.id.slice(-4)}-${rng.int(100, 999)}`;
  const repAbil = isAsian ? rng.int(72, 78) : rng.int(75, 82);
  const totalUsd = isAsian ? 200_000 : 1_000_000;
  const bonusUsd = isAsian ? 40_000 : 150_000;
  const salaryUsd = totalUsd - bonusUsd;

  const repPlayer: Player = {
    id: repId,
    originType: 'virtual',
    name: repName,
    teamId,
    category: departed.category,
    nationality: isAsian ? '일본' : '미국',
    previousLeagueClub: isAsian ? 'NPB 퍼시픽리그 1군' : 'MLB 40인 · AAA 트리플A',
    role: departed.role,
    position: departed.position,
    pitchRole: isP ? (departed.position === 'SP' ? '선발' : '중간') : undefined,
    age: rng.int(26, 31),
    ability: repAbil,
    potential: Math.min(86, repAbil + rng.int(2, 5)),
    abilityStatus: '확정',
    form: 0,
    fatigue: 0,
    lastPitchedRound: 0,
    consecutiveAppearances: 0,
    rosterTier: '1군',
    gameDayActive: true,
    uniformNumber: allocateTeamUniformNumber(
      career.players,
      teamId,
      false,
      undefined,
      getTeamRetiredNumbersList(career, teamId)
    ),
    contract: {
      status: '확정',
      currency: 'USD',
      years: 1,
      yearsRemaining: 1,
      startSeason: nextSeasonNum,
      endSeason: nextSeasonNum,
      annualSalary: salaryUsd,
      signingBonus: bonusUsd,
      totalValue: totalUsd,
      note: `${nextSeasonNum} ${reasonLabel} ($${(totalUsd / 1_000_000).toFixed(2)}M)`,
    },
    injury: null,
    morale: '만족',
    trainingFocus: isP ? '구위' : '타격',
    serviceYears: 0,
    clubTenureSeasons: 1,
    seasonRatingDelta: 0,
    lastEvaluatedAtTeamGames: 0,
    stats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
    postseasonStats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
    kboAdaptation: rng.int(65, 82),
  };
  ensurePlayerRichMetadata(repPlayer);
  ensurePlayerOotpRatingsInPlace(repPlayer);
  career.players[repId] = repPlayer;

  const t = career.teams[teamId];
  if (t) {
    if (isP) {
      if (repPlayer.pitchRole === '선발' && t.rotationOrder.length < 5) t.rotationOrder.push(repId);
      else t.bullpenOrder.push(repId);
    } else if (t.lineupOrder.length < 9) {
      t.lineupOrder.push(repId);
      t.lineupPositions[repId] = repPlayer.position;
      reconcileTeamLineupPositionsInPlace(career, teamId);
    } else {
      t.benchOrder.push(repId);
    }
  }

  recordLeagueAcquisitionInPlace(
    career,
    {
      dedupeKey: `foreign-ai-rep-${nextSeasonNum}-${teamId}-${repId}`,
      season: nextSeasonNum,
      date: dateStr,
      category: '외국인·아시아쿼터',
      playerId: repId,
      playerName: repName,
      position: repPlayer.position,
      previousTeamLabel: repPlayer.previousLeagueClub || '해외 리그',
      acquiringTeamId: teamId,
      contractAmountLabel: `$${totalUsd.toLocaleString()}`,
      note: `${departed.name} 대체 영입 (${reasonLabel})`,
    },
    { pushNewsAlert: false }
  );

  return repPlayer;
}

/**
 * KBO에서 정상급 활약을 펼친 외국인·아시아쿼터 선수 자동 MLB 역수출 처리 (전 10개 구단 대상, 중복 실행 안전)
 * - 오프시즌 진입 시 및 시즌 전환 시 호출
 * - 사용자 구단 선수는 슬롯이 비어 오프시즌 동안 신규 외국인 영입 가능
 * - AI 구단 선수는 이탈 후 차기 시즌 대체 외국인 자동 보강
 */
export function processForeignPlayersMlbExportInPlace(
  career: CareerSave,
  rng: SeededRng,
  options?: { dateStr?: string; nextSeasonNum?: number }
): { exportedSummaries: string[]; exportedUserNames: string[] } {
  const nextSeasonNum =
    options?.nextSeasonNum ?? (career.phase === 'OFFSEASON' ? career.season + 1 : career.season);
  const dateStr = options?.dateStr ?? `${nextSeasonNum - 1}-12-08`;
  const exportedSummaries: string[] = [];
  const exportedUserNames: string[] = [];

  for (const p of Object.values(career.players)) {
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적' || p.rosterTier === '제외후보') {
      continue;
    }
    if (p.category !== '외국인' && p.category !== '아시아쿼터') continue;

    const ev = evaluateForeignPlayerSeasonOutcome(p);
    if (!ev.qualifiedForMlb) continue;

    ensurePlayerRichMetadata(p);
    commitSeasonStatsToCareer(p);
    const originTeamId = p.teamId;
    const mlbClub = rng.pick(MLB_CLUBS);
    const mlbYears = p.age <= 30 ? rng.int(2, 3) : 2;
    const mlbUsdMillions = Number(
      Math.max(8, Math.min(36, Math.round((p.ability - 72) * 1.45 * mlbYears + rng.int(2, 6)))).toFixed(1)
    );

    p.rosterTier = '해외이적';
    p.gameDayActive = false;
    p.contract = {
      ...p.contract,
      status: '만료',
      yearsRemaining: 0,
      note: `${nextSeasonNum - 1} KBO 맹활약 후 ${mlbClub} MLB 역수출 (${mlbYears}년 $${mlbUsdMillions}M)`,
    };

    const t = career.teams[originTeamId];
    if (t) {
      const wasInLineup = t.lineupOrder.includes(p.id);
      t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
      t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
      t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
      t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);
      if (wasInLineup && t.lineupOrder.length < 9) {
        reconcileTeamLineupPositionsInPlace(career, originTeamId);
      }
    }

    recordMlbExportPlayer(career, p, mlbClub, mlbYears, mlbUsdMillions, dateStr, '외국인역수출');
    exportedSummaries.push(`${p.name}(${KBO_TEAMS[originTeamId].shortName}→${mlbClub})`);

    if (!career.newsFeed) career.newsFeed = [];
    const headline = `[외국인 MLB 역수출 확정] ${KBO_TEAMS[originTeamId].shortName} ${p.name}, ${mlbClub}와 ${mlbYears}년 $${mlbUsdMillions}M 계약!`;
    if (!career.newsFeed.some((n) => n.headline === headline)) {
      career.newsFeed.unshift({
        id: `news-for-mlb-${nextSeasonNum}-${p.id}`,
        season: nextSeasonNum,
        date: dateStr,
        category: 'MLB소식',
        headline,
        body: `KBO에서 압도적 성적(${ev.statSummary})을 남긴 외국인 선수 ${p.name}(${p.position})이 메이저리그 스카우트들의 러브콜 끝에 ${mlbClub}와 ${mlbYears}년 총액 $${mlbUsdMillions}M 계약을 맺고 자동으로 MLB에 진출했습니다.`,
        teamId: originTeamId,
        isHighlight: true,
      });
    }

    if (originTeamId === career.playerTeamId) {
      exportedUserNames.push(`${p.name}→${mlbClub}`);
      career.transactionLogs.unshift({
        id: `tx-for-mlb-${nextSeasonNum}-${p.id}`,
        date: dateStr,
        type: '포스팅',
        teamId: originTeamId,
        summary: `[외국인 MLB 자동 진출] ${p.name} → ${mlbClub} (${mlbYears}년 $${mlbUsdMillions}M)`,
        detail: `시즌 압도적 활약(${ev.statSummary})으로 MLB 역수출 확정 — 빈 외국인 슬롯 신규 영입 필요`,
      });
    } else {
      spawnAiReplacementForeignPlayerInPlace(
        career,
        originTeamId,
        p,
        nextSeasonNum,
        dateStr,
        rng,
        '외국인 MLB 이탈 대체 영입'
      );
    }
  }

  return { exportedSummaries, exportedUserNames };
}

/**
 * AI 9개 구단의 오프시즌 외국인·아시아쿼터 계약 유지(재계약) vs 계약 해지(교체) 자동 처리
 */
export function processAiClubsOffseasonForeignDecisionsInPlace(
  career: CareerSave,
  rng: SeededRng,
  options?: { dateStr?: string; nextSeasonNum?: number }
): { mlbExports: string[]; renewedCount: number; replacedCount: number; logs: string[] } {
  const nextSeasonNum =
    options?.nextSeasonNum ?? (career.phase === 'OFFSEASON' ? career.season + 1 : career.season + 1);
  const dateStr = options?.dateStr ?? `${nextSeasonNum - 1}-12-10`;
  const logs: string[] = [];

  // 1) 정상급 외국인 먼저 MLB 자동 역수출
  const mlbRes = processForeignPlayersMlbExportInPlace(career, rng, { dateStr, nextSeasonNum });
  for (const s of mlbRes.exportedSummaries) {
    logs.push(`외국인 MLB 역수출: ${s}`);
  }

  let renewedCount = 0;
  let replacedCount = 0;

  // 2) 잔류 외국인 중 부진 선수는 계약 해지(교체) 또는 할인 유지, 준수 선수는 재계약(계약 유지)
  for (const p of Object.values(career.players)) {
    if (p.teamId === career.playerTeamId) continue;
    if (p.category !== '외국인' && p.category !== '아시아쿼터') continue;
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적' || p.rosterTier === '제외후보') {
      continue;
    }
    if ((p.contract.endSeason ?? 0) >= nextSeasonNum && p.contract.status === '확정') {
      continue; // 이미 차기 시즌 계약 확정됨 (신규 대체 선수 포함)
    }

    const ev = evaluateForeignPlayerSeasonOutcome(p);
    const quote = quoteForeignPlayerRenewal(career, p);
    const shouldReplace =
      ev.tier === '부진_교체검토'
        ? rng.next() < 0.75
        : p.age >= 35
        ? rng.next() < 0.38
        : rng.next() < 0.12;

    if (shouldReplace) {
      const originTeamId = p.teamId;
      p.rosterTier = '제외후보';
      p.gameDayActive = false;
      p.contract = {
        ...p.contract,
        status: '만료',
        yearsRemaining: 0,
        note: `${nextSeasonNum} 재계약 포기 (계약 해지 · ${ev.statSummary})`,
      };
      const t = career.teams[originTeamId];
      if (t) {
        t.lineupOrder = t.lineupOrder.filter((id) => id !== p.id);
        t.benchOrder = t.benchOrder.filter((id) => id !== p.id);
        t.rotationOrder = t.rotationOrder.filter((id) => id !== p.id);
        t.bullpenOrder = t.bullpenOrder.filter((id) => id !== p.id);
      }
      const rep = spawnAiReplacementForeignPlayerInPlace(
        career,
        originTeamId,
        p,
        nextSeasonNum,
        dateStr,
        rng,
        '부진 외국인 교체 영입'
      );
      replacedCount++;
      logs.push(`${KBO_TEAMS[originTeamId].shortName} 외국인 교체: ${p.name} 계약 해지 → ${rep.name}`);
      if (!career.newsFeed) career.newsFeed = [];
      career.newsFeed.unshift({
        id: `news-ai-for-cut-${nextSeasonNum}-${p.id}`,
        season: nextSeasonNum,
        date: dateStr,
        category: '이적·계약',
        headline: `[외국인 계약 해지 · 교체] ${KBO_TEAMS[originTeamId].shortName}, ${p.name} 재계약 포기 → ${rep.name} 영입`,
        body: `${KBO_TEAMS[originTeamId].name}가 ${p.name}(${ev.statSummary})과의 계약을 해지하고 새 ${p.category} ${rep.name}(${rep.position} · OVR ${rep.ability})을 영입했습니다.`,
        teamId: originTeamId,
      });
    } else {
      // 계약 유지 (재계약)
      p.contract = {
        ...p.contract,
        status: '확정',
        currency: 'USD',
        years: 1,
        yearsRemaining: 1,
        startSeason: nextSeasonNum,
        endSeason: nextSeasonNum,
        annualSalary: quote.suggestedSalaryUsd,
        signingBonus: quote.suggestedSigningBonusUsd,
        totalValue: quote.suggestedTotalUsd,
        note: `${nextSeasonNum} ${p.category} 재계약 (${quote.adjustmentLabel})`,
      };
      p.kboAdaptation = Math.min(100, (p.kboAdaptation ?? 78) + 4);
      renewedCount++;
      if (ev.tier === '부진_교체검토') {
        logs.push(
          `${KBO_TEAMS[p.teamId].shortName} ${p.name} 할인 재계약 ($${(quote.suggestedTotalUsd / 1_000_000).toFixed(2)}M)`
        );
      }
    }
  }

  return { mlbExports: mlbRes.exportedSummaries, renewedCount, replacedCount, logs };
}

/**
 * 사용자 구단 외국인·아시아쿼터 계약 유지(재계약) 체결
 * - 부진 선수라도 단장 판단에 따라 할인 조건으로 계약 유지(재계약) 가능!
 */
export function renewForeignPlayerContract(
  career: CareerSave,
  playerId: string
): { nextCareer: CareerSave; backupSnapshot: CareerSave; quote: ForeignRenewalQuote } {
  const prePlayer = career.players[playerId];
  if (!prePlayer || prePlayer.teamId !== career.playerTeamId) {
    throw new Error('재계약할 소속 외국인·아시아쿼터 선수를 찾을 수 없습니다.');
  }
  if (prePlayer.category === '국내') {
    throw new Error('외국인·아시아쿼터 선수만 외국인 계약 유지(재계약)가 가능합니다.');
  }
  if (
    prePlayer.rosterTier === '해외이적' ||
    prePlayer.rosterTier === '은퇴' ||
    prePlayer.rosterTier === '제외후보'
  ) {
    throw new Error('이미 이탈하거나 계약 해지된 선수는 재계약할 수 없습니다.');
  }

  const quote = quoteForeignPlayerRenewal(career, prePlayer);
  if (quote.alreadyRenewedForTarget) {
    throw new Error(`${prePlayer.name} 선수는 이미 ${quote.targetSeason}시즌 재계약이 확정되었습니다.`);
  }

  const { nextCareer, backupSnapshot } = executeAtomicCareerMutation(career, (next) => {
    const p = next.players[playerId];
    if (!p) throw new Error('대상 선수를 찾을 수 없습니다.');

    // 외국인 3명 합계 총액 $4,000,000 + 재계약 연차 보너스 상한 확인 (일반 외국인)
    if (p.category === '외국인') {
      const otherRegulars = Object.values(next.players).filter(
        (x) =>
          x.id !== p.id &&
          x.teamId === next.playerTeamId &&
          x.category === '외국인' &&
          x.rosterTier !== '제외후보' &&
          x.rosterTier !== '은퇴' &&
          x.rosterTier !== '해외이적'
      );
      const reSignBonusCap = [...otherRegulars, p].reduce(
        (acc, x) => acc + Math.max(0, getPlayerClubTenureSeasons(x)) * 100_000,
        0
      );
      const clubForeignCapUsd = 4_000_000 + reSignBonusCap;
      const otherSumUsd = otherRegulars.reduce((sum, x) => sum + (x.contract.totalValue || 0), 0);
      if (otherSumUsd + quote.suggestedTotalUsd > clubForeignCapUsd) {
        throw new Error(
          `구단 외국인 3명 총액 상한($${clubForeignCapUsd.toLocaleString()})을 초과합니다.`
        );
      }
    }

    if (
      next.finances.cashBalanceBillion !== null &&
      next.finances.cashBalanceBillion < quote.upfrontKrwBillion
    ) {
      throw new Error(
        `외국인 재계약 계약금(${quote.upfrontKrwBillion.toFixed(2)}억 원)이 부족합니다.`
      );
    }

    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number(
        (next.finances.cashBalanceBillion - quote.upfrontKrwBillion).toFixed(2)
      );
      next.finances.seasonExpenseBillion = Number(
        (next.finances.seasonExpenseBillion + quote.upfrontKrwBillion).toFixed(2)
      );
    }

    const dateStr = getCurrentCareerDate(next).isoDate;
    p.contract = {
      ...p.contract,
      status: '확정',
      currency: 'USD',
      years: 1,
      yearsRemaining: Math.max(1, quote.targetSeason - next.season + 1),
      startSeason: quote.targetSeason,
      endSeason: quote.targetSeason,
      annualSalary: quote.suggestedSalaryUsd,
      signingBonus: quote.suggestedSigningBonusUsd,
      totalValue: quote.suggestedTotalUsd,
      note: `${quote.targetSeason} ${p.category} 계약 유지 (${quote.adjustmentLabel} · $${quote.suggestedTotalUsd.toLocaleString()})`,
    };
    p.morale = '만족';
    p.kboAdaptation = Math.min(100, (p.kboAdaptation ?? 78) + 5);

    next.transactionLogs.unshift({
      id: `tx-for-renew-${Date.now()}-${p.id}`,
      date: dateStr,
      type: '계약',
      teamId: next.playerTeamId,
      summary: `[${p.category} 계약 유지] ${p.name} ${quote.targetSeason}시즌 재계약 ($${quote.suggestedTotalUsd.toLocaleString()} · ${quote.adjustmentLabel})`,
      detail: `계약금 $${quote.suggestedSigningBonusUsd.toLocaleString()}(${quote.upfrontKrwBillion.toFixed(2)}억) · 연봉 $${quote.suggestedSalaryUsd.toLocaleString()} · ${quote.evaluation.statSummary}`,
    });

    if (!next.newsFeed) next.newsFeed = [];
    next.newsFeed.unshift({
      id: `news-for-renew-${quote.targetSeason}-${p.id}`,
      season: quote.targetSeason,
      date: dateStr,
      category: '이적·계약',
      headline: `[외국인 재계약 확정] ${KBO_TEAMS[next.playerTeamId].shortName}, ${p.name}과 ${quote.targetSeason}시즌 총액 $${(quote.suggestedTotalUsd / 1_000_000).toFixed(2)}M 계약 유지`,
      body: `${KBO_TEAMS[next.playerTeamId].name}가 ${p.category} ${p.name}(${p.position}) 선수와 ${quote.adjustmentLabel} 조건(총액 $${quote.suggestedTotalUsd.toLocaleString()})으로 동행을 이어갑니다.`,
      teamId: next.playerTeamId,
      isHighlight: true,
    });

    recordLeagueAcquisitionInPlace(
      next,
      {
        dedupeKey: `foreign-renew-${quote.targetSeason}-${next.playerTeamId}-${p.id}`,
        season: quote.targetSeason,
        date: dateStr,
        category: '외국인·아시아쿼터',
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        previousTeamLabel: `${KBO_TEAMS[next.playerTeamId].shortName} (재계약)`,
        acquiringTeamId: next.playerTeamId,
        contractAmountLabel: `$${quote.suggestedTotalUsd.toLocaleString()}`,
        note: `계약 유지 (${quote.adjustmentLabel})`,
      },
      { pushNewsAlert: false }
    );

    next.updatedAt = new Date().toISOString();
  });

  return { nextCareer, backupSnapshot, quote };
}
