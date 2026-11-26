import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  AwardEntry,
  BatterStats,
  CareerBatterStats,
  CareerPitcherStats,
  CareerSave,
  LiveAwardCandidate,
  ManagerOfYearAward,
  PitcherStats,
  Player,
  PlayerAwardHonor,
  Position,
  RookieEligibilitySnapshot,
  RookiePressVoteEntry,
  SeasonAwards,
  TeamId,
} from '../types/kbo';
import { SeededRng } from './rng';
import {
  calcAVG,
  calcERA,
  calcOPS,
  calcWHIP,
  computeLeaderboards,
  computeStandings,
  formatIP,
  formatRate2,
  formatRate3,
} from './stats';

/**
 * 2026 KBO 공식 시즌 시상식 엔진
 *
 * 1. 골든글러브: 투수 1, 포수 1, 1루수·2루수·3루수·유격수 각 1, 외야수 3, 지명타자 1 = 총 10명
 * 2. 2026 KBO 공식 후보 기준:
 *    - 투수: 규정이닝(144이닝=432아웃) 또는 10승·30세이브·30홀드 + 공식 투수 타이틀홀더 예외
 *    - 야수·포수: 해당 포지션 720수비이닝 이상 + 공식 타격 타이틀홀더 예외
 *    - 지명타자: DH 297타석 이상 + 공식 타격 타이틀홀더 예외
 * 3. MVP: 투수·타자 통합 리그 전체 1명
 * 4. 신인왕: 당해 입단 또는 이전 5개 연도 입단 선수 중 해당 시즌 이전 누적 투구 30이닝 이하 또는
 *    타격 60타석 이하이며 해외 프로야구 기구 소속 경력이 없는 선수
 * 5. MVP·신인왕: 기록 기반 평가점수로 자동 선정
 * 6. 골든글러브: 포지션별 기록 평가점수로 자동 선정
 * 7. 투수·타자 0~100 정규화 점수로 직접 비교 가능
 * 8. 정규시즌 성적(player.stats)만 사용 (postseasonStats 배제)
 * 9. 한 선수가 MVP·신인왕·골든글러브 중복 수상 허용
 * 10. 시상식 화면 + 선수 프로필(awardHonors) + 역대 수상 기록(awardsHistory) 영구 저장
 * 11. 시즌별 중복 실행 방지(completedAwardsSeasons & awardsHistory season 체크)
 * 12. 모든 10개 KBO 구단 동일 규칙 적용
 * 13. 기존 선수 계약·팀 기록·구단 로고·UI·세이브 보존
 * 14. 시상식 확인 완료 후 오프시즌 단장 업무로 이동 (자동 다음 시즌 시작 금지)
 */

export const KBO_2026_AWARDS_RULES = {
  PITCHER_QUALIFIED_OUTS: 432, // 144.0 이닝
  PITCHER_MIN_WINS: 10,
  PITCHER_MIN_SAVES: 30,
  PITCHER_MIN_HOLDS: 30,
  FIELDER_MIN_DEFENSIVE_INNINGS: 720,
  DH_MIN_PA: 297,
  ROOKIE_MAX_PRIOR_YEARS: 5, // 입단 연도 포함 6년 차 이내 (season - entryYear <= 5)
  ROOKIE_MAX_ENTRY_YEAR_NUMBER: 6, // 해당 시즌 포함 입단 6년 차 이내
  ROOKIE_MAX_PRIOR_OUTS: 90, // 이전 시즌까지 1군 통산 30.0 이닝 이하
  ROOKIE_MAX_PRIOR_PA: 60, // 이전 시즌까지 1군 통산 60 타석 이하
  ROOKIE_PRESS_VOTER_COUNT: 100, // 한국야구기자회 기자단 AI 100인 투표
} as const;

/**
 * 실존 KBO 역대 신인왕 기수상자 기준표 (동명이인 오판 방지 위해 출생연도 병기)
 */
const REAL_PRIOR_KBO_ROOKIE_WINNERS: Record<string, { wonSeason: number; birthYear: number }> = {
  안현민: { wonSeason: 2025, birthYear: 2003 },
  김택연: { wonSeason: 2024, birthYear: 2005 },
  문동주: { wonSeason: 2023, birthYear: 2003 },
  정철원: { wonSeason: 2022, birthYear: 1999 },
  이의리: { wonSeason: 2021, birthYear: 2002 },
  소형준: { wonSeason: 2020, birthYear: 2001 },
  정우영: { wonSeason: 2019, birthYear: 1999 },
  강백호: { wonSeason: 2018, birthYear: 1999 },
  이정후: { wonSeason: 2017, birthYear: 1998 },
  신재영: { wonSeason: 2016, birthYear: 1989 },
  구자욱: { wonSeason: 2015, birthYear: 1993 },
  박민우: { wonSeason: 2014, birthYear: 1993 },
  이재학: { wonSeason: 2013, birthYear: 1990 },
  서건창: { wonSeason: 2012, birthYear: 1989 },
  배영섭: { wonSeason: 2011, birthYear: 1986 },
  양의지: { wonSeason: 2010, birthYear: 1987 },
  이용찬: { wonSeason: 2009, birthYear: 1989 },
  최형우: { wonSeason: 2008, birthYear: 1983 },
  류현진: { wonSeason: 2006, birthYear: 1987 },
};

export interface GoldenGloveEligibilityResult {
  eligible: boolean;
  reason: string;
  isTitleHolderException: boolean;
  defensiveInnings?: number;
}

export interface RookieEligibilityResult {
  eligible: boolean;
  reason: string;
  priorInnings: number;
  priorOuts: number;
  priorPA: number;
  entryYear: number;
  /** 해당 시즌 포함 입단 N년차 (1 = 당해 입단, 최대 6년차까지 자격) */
  entryYearNumber: number;
  yearsSinceDebut: number;
  hasOverseasProCareer: boolean;
  alreadyWonRookieOfYear: boolean;
}

function getRegularBatterStats(player: Player): BatterStats {
  return player.stats as BatterStats;
}

function getRegularPitcherStats(player: Player): PitcherStats {
  return player.stats as PitcherStats;
}

/**
 * 정규시즌 야수 수비이닝 산출 (정규시즌 stats만 사용)
 * - defensiveInnings가 기록된 경우 직접 사용
 * - 미기록 세이브는 정규시즌 출전경기(G) * 8.0이닝으로 계산 (90경기 = 720수비이닝)
 */
export function getRegularDefensiveInnings(player: Player): number {
  if (player.role !== '타자' || player.position === 'DH') return 0;
  const b = getRegularBatterStats(player);
  if (typeof b.defensiveInnings === 'number' && Number.isFinite(b.defensiveInnings)) {
    return Math.max(0, Math.round(b.defensiveInnings));
  }
  const g = Math.max(0, b.G ?? 0);
  const pa = Math.max(0, b.PA ?? 0);
  if (g === 0 && pa === 0) return 0;
  // 경기당 평균 수비이닝 보정 (대타 위주 소규모 타석 선수 과대평가 방지)
  const avgPaPerGame = g > 0 ? pa / g : 0;
  const innPerGame = avgPaPerGame >= 3.2 ? 8.2 : avgPaPerGame >= 2.2 ? 7.2 : 5.0;
  return Math.round(g * innPerGame);
}

/**
 * 해외 프로야구 기구(MLB·NPB·CPBL·MiLB 등) 소속 경력 여부 판정
 */
export function hasOverseasProBaseballCareer(player: Player): boolean {
  if (player.category !== '국내') return true;
  const prev = player.previousLeagueClub ?? '';
  if (/MLB|NPB|CPBL|ABL|AAA|AA|마이너|메이저|일본\s*프로|대만\s*프로|미국\s*프로|해외\s*프로|호주\s*프로/i.test(prev)) {
    return true;
  }
  const kboTeamSet = new Set<string>(TEAM_IDS);
  const hist = player.careerTeamHistory ?? [];
  for (const h of hist) {
    if ((h.league && h.league !== 'KBO') || h.mlbTeamName) return true;
    // KBO 10개 구단 소속 이력(예: '롯데 자이언츠')은 해외 구단 키워드 오탐 방지
    if (h.league === 'KBO' || (h.teamId && kboTeamSet.has(h.teamId))) continue;
    if (/MLB|NPB|CPBL|AAA|AA|마이너|메이저|요미우리|소프트뱅크|오릭스|한신|지바롯데|다저스|양키스|샌프란시스코\s*자이언츠|파드리스|컵스|블루제이스/i.test(h.teamLabel)) {
      return true;
    }
  }
  return false;
}

/**
 * 기존 KBO 신인왕(신인상) 기수상자 여부 판정 (나이·연차와 무관하게 기수상자는 영구 제외)
 */
export function hasAlreadyWonRookieOfYear(
  player: Player,
  currentSeason: number,
  career?: CareerSave
): { won: boolean; wonSeason?: number } {
  const honorMatch = (player.awardHonors ?? []).find(
    (h) => h.awardType === '신인왕' && h.season < currentSeason
  );
  if (honorMatch) {
    return { won: true, wonSeason: honorMatch.season };
  }
  if (career?.awardsHistory) {
    const histMatch = career.awardsHistory.find(
      (a) => a.season < currentSeason && a.rookieOfYear?.playerId === player.id
    );
    if (histMatch) {
      return { won: true, wonSeason: histMatch.season };
    }
  }
  const realMatch = REAL_PRIOR_KBO_ROOKIE_WINNERS[player.name];
  if (realMatch && realMatch.wonSeason < currentSeason) {
    const birthCompatible =
      typeof player.birthYear === 'number'
        ? Math.abs(player.birthYear - realMatch.birthYear) <= 1
        : Math.abs(currentSeason - player.age - realMatch.birthYear) <= 2;
    if (birthCompatible) {
      return { won: true, wonSeason: realMatch.wonSeason };
    }
  }
  return { won: false };
}

function parseHistoricalIpToOuts(ipRaw: unknown): number {
  if (typeof ipRaw === 'number' && Number.isFinite(ipRaw)) {
    const whole = Math.floor(ipRaw);
    const frac = Math.round((ipRaw - whole) * 10);
    return Math.max(0, whole * 3 + Math.min(2, Math.max(0, frac)));
  }
  if (typeof ipRaw === 'string') {
    const trimmed = ipRaw.trim();
    if (!trimmed) return 0;
    const m = trimmed.match(/^(\d+)(?:\.(\d))?$/);
    if (m) {
      const whole = Number(m[1]);
      const frac = m[2] ? Math.min(2, Number(m[2])) : 0;
      return Math.max(0, whole * 3 + frac);
    }
    const fracMatch = trimmed.match(/^(\d+)\s+(\d)\/3$/);
    if (fracMatch) {
      return Math.max(0, Number(fracMatch[1]) * 3 + Math.min(2, Number(fracMatch[2])));
    }
    const onlyThird = trimmed.match(/^(\d)\/3$/);
    if (onlyThird) {
      return Math.min(2, Number(onlyThird[1]));
    }
  }
  return 0;
}

/**
 * KBO 입단 연도 산출 (나이 제한 미적용 · 드래프트/입단 연도 우선)
 */
function resolveKboEntryYear(player: Player, season: number): number {
  if (typeof player.draftYear === 'number' && player.draftYear >= 1990 && player.draftYear <= season) {
    return player.draftYear;
  }
  if (
    typeof player.acquisitionInfo?.draftYear === 'number' &&
    player.acquisitionInfo.draftYear >= 1990 &&
    player.acquisitionInfo.draftYear <= season
  ) {
    return player.acquisitionInfo.draftYear;
  }
  const kboEntries = (player.careerTeamHistory ?? []).filter(
    (h) => (!h.league || h.league === 'KBO') && !h.mlbTeamName && Boolean(h.teamId) && h.fromSeason <= season
  );
  if (kboEntries.length > 0) {
    return Math.min(...kboEntries.map((h) => h.fromSeason));
  }
  const histYears = (player.historicalSeasons ?? [])
    .map((h) => h.season)
    .filter((s) => typeof s === 'number' && s >= 1990 && s <= season);
  if (histYears.length > 0) {
    return Math.min(...histYears);
  }
  if (player.rookieInfo) return season;
  return season - Math.max(0, player.serviceYears ?? 0);
}

/**
 * 이전 시즌까지의 KBO 1군 통산 이닝(아웃)·타석 산출
 * - 당해 시즌 성적(player.stats) 및 퓨처스리그 기록(futuresStats, verifiedFutures2026)은 완전 배제
 */
function computePriorKboFirstTeamTotals(
  player: Player,
  season: number,
  effectiveYears: number
): { priorOuts: number; priorPA: number } {
  let histOuts = 0;
  let histPA = 0;
  let hasPriorHist = false;
  for (const h of player.historicalSeasons ?? []) {
    if (typeof h.season !== 'number' || h.season >= season) continue;
    hasPriorHist = true;
    if (player.role === '투수') {
      histOuts += parseHistoricalIpToOuts(h.IP);
    } else {
      histPA += Math.max(0, Number(h.PA ?? (h.AB ?? 0) + (h.BB ?? 0)));
    }
  }

  let csOuts = 0;
  let csPA = 0;
  let hasCareerStats = false;
  if (player.role === '투수') {
    const cs = player.careerStats as CareerPitcherStats | undefined;
    if (cs && typeof cs.outs === 'number') {
      hasCareerStats = true;
      csOuts = Math.max(0, cs.outs);
    }
  } else {
    const cs = player.careerStats as CareerBatterStats | undefined;
    if (cs && (typeof cs.PA === 'number' || typeof cs.AB === 'number')) {
      hasCareerStats = true;
      csPA = Math.max(0, cs.PA ?? cs.AB + (cs.BB ?? 0));
    }
  }

  if (hasPriorHist || hasCareerStats) {
    return {
      priorOuts: Math.max(histOuts, csOuts),
      priorPA: Math.max(histPA, csPA),
    };
  }

  // 레거시/합성 세이브에 careerStats·historicalSeasons가 모두 없을 때만 최소 fallback 사용
  if (player.rookieInfo && effectiveYears === 0) {
    return { priorOuts: 0, priorPA: 0 };
  }
  if (player.role === '투수') {
    const est =
      effectiveYears >= 1 && (player.careerSO ?? 0) > 0
        ? Math.round((player.careerSO ?? 0) * 3.1)
        : effectiveYears >= 2 && (player.careerWins ?? 0) >= 3
        ? (player.careerWins ?? 0) * 45
        : 0;
    return { priorOuts: est, priorPA: 0 };
  }
  const estPa =
    effectiveYears >= 1 && (player.careerHits ?? 0) > 0
      ? Math.round((player.careerHits ?? 0) * 3.8)
      : 0;
  return { priorOuts: 0, priorPA: estPa };
}

/**
 * KBO 공식 신인왕 시즌 자격 판정 (시즌 개막 시점 기준 · 당해 성적 및 퓨처스 기록 제외 · 나이 제한 없음)
 * - 해당 시즌 포함 입단 6년 차 이내 (season - entryYear <= 5)
 * - 투수: 이전 시즌까지 1군 통산 30이닝(90아웃) 이하
 * - 타자: 이전 시즌까지 1군 통산 60타석 이하
 * - 해외 프로야구 소속 경력 없음
 * - 기존 신인왕 기수상자 제외
 */
export function evaluateOpeningDayRookieEligibility(
  player: Player,
  season: number,
  career?: CareerSave
): RookieEligibilitySnapshot {
  const entryYear = resolveKboEntryYear(player, season);
  const yearsSinceEntry = Math.max(0, season - entryYear);
  const effectiveYears = Math.max(yearsSinceEntry, Math.max(0, player.serviceYears ?? 0));
  const entryYearNumber = effectiveYears + 1;

  const hasOverseas = hasOverseasProBaseballCareer(player);
  const priorWin = hasAlreadyWonRookieOfYear(player, season, career);
  const { priorOuts, priorPA } = computePriorKboFirstTeamTotals(player, season, effectiveYears);
  const priorInnings = Number((priorOuts / 3).toFixed(1));

  if (hasOverseas) {
    return {
      season,
      eligible: false,
      entryYear,
      entryYearNumber,
      priorInnings,
      priorOuts,
      priorPA,
      hasOverseasProCareer: true,
      alreadyWonRookieOfYear: priorWin.won,
      reason: '해외 프로야구 소속 경력 보유 (신인왕 자격 제외)',
    };
  }

  if (priorWin.won) {
    return {
      season,
      eligible: false,
      entryYear,
      entryYearNumber,
      priorInnings,
      priorOuts,
      priorPA,
      hasOverseasProCareer: false,
      alreadyWonRookieOfYear: true,
      reason: `기존 신인왕 수상자 (${priorWin.wonSeason ? `${priorWin.wonSeason}년 수상` : '기수상'} · 후보 제외)`,
    };
  }

  if (entryYearNumber > KBO_2026_AWARDS_RULES.ROOKIE_MAX_ENTRY_YEAR_NUMBER && !player.rookieInfo) {
    return {
      season,
      eligible: false,
      entryYear,
      entryYearNumber,
      priorInnings,
      priorOuts,
      priorPA,
      hasOverseasProCareer: false,
      alreadyWonRookieOfYear: false,
      reason: `입단 ${entryYearNumber}년 차 (입단 6년 차 이내 기준 초과)`,
    };
  }

  if (player.role === '투수' && priorOuts > KBO_2026_AWARDS_RULES.ROOKIE_MAX_PRIOR_OUTS) {
    return {
      season,
      eligible: false,
      entryYear,
      entryYearNumber,
      priorInnings,
      priorOuts,
      priorPA: 0,
      hasOverseasProCareer: false,
      alreadyWonRookieOfYear: false,
      reason: `이전 1군 통산 ${formatIP(priorOuts)}이닝 (30이닝 상한 초과)`,
    };
  }

  if (player.role === '타자' && priorPA > KBO_2026_AWARDS_RULES.ROOKIE_MAX_PRIOR_PA) {
    return {
      season,
      eligible: false,
      entryYear,
      entryYearNumber,
      priorInnings: 0,
      priorOuts: 0,
      priorPA,
      hasOverseasProCareer: false,
      alreadyWonRookieOfYear: false,
      reason: `이전 1군 통산 ${priorPA}타석 (60타석 상한 초과)`,
    };
  }

  const yearLabel = entryYearNumber === 1 ? '입단 1년 차(순수 신인)' : `입단 ${entryYearNumber}년 차`;
  const priorLabel =
    player.role === '투수'
      ? `이전 1군 ${formatIP(priorOuts)}이닝(≤30IP)`
      : `이전 1군 ${priorPA}타석(≤60PA)`;

  return {
    season,
    eligible: true,
    entryYear,
    entryYearNumber,
    priorInnings: player.role === '투수' ? priorInnings : 0,
    priorOuts: player.role === '투수' ? priorOuts : 0,
    priorPA: player.role === '타자' ? priorPA : 0,
    hasOverseasProCareer: false,
    alreadyWonRookieOfYear: false,
    reason: `${yearLabel} · ${priorLabel} · 신인왕 자격 충족 (나이 무관)`,
  };
}

/**
 * 시즌 개막 시점·새 게임·다음 시즌 전환·세이브 로드 시 전 선수 신인왕 자격을 자동 판정·저장합니다.
 * - 당해 시즌 성적과 퓨처스 기록은 자격 판정에서 완전 제외됩니다.
 */
export function syncSeasonRookieEligibilityInPlace(career: CareerSave): {
  season: number;
  eligibleCount: number;
} {
  const season = career.season;
  let eligibleCount = 0;
  for (const p of Object.values(career.players)) {
    if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') {
      p.rookieEligibility = undefined;
      continue;
    }
    const snap = evaluateOpeningDayRookieEligibility(p, season, career);
    p.rookieEligibility = snap;
    if (snap.eligible) eligibleCount += 1;
  }
  return { season, eligibleCount };
}

/**
 * KBO 공식 신인왕 자격 검증 (시즌 개막 스냅샷 우선 활용 + 당해 출전 여부 옵션)
 */
export function checkRookieOfYearEligibility(
  player: Player,
  season: number,
  options?: {
    career?: CareerSave;
    requireCurrentSeasonAppearance?: boolean;
    ignoreCachedSnapshot?: boolean;
  }
): RookieEligibilityResult {
  const snap =
    !options?.ignoreCachedSnapshot && player.rookieEligibility?.season === season
      ? player.rookieEligibility
      : evaluateOpeningDayRookieEligibility(player, season, options?.career);

  if (!snap.eligible) {
    return {
      eligible: false,
      reason: snap.reason,
      priorInnings: snap.priorInnings,
      priorOuts: snap.priorOuts,
      priorPA: snap.priorPA,
      entryYear: snap.entryYear,
      entryYearNumber: snap.entryYearNumber,
      yearsSinceDebut: Math.max(0, snap.entryYearNumber - 1),
      hasOverseasProCareer: snap.hasOverseasProCareer,
      alreadyWonRookieOfYear: snap.alreadyWonRookieOfYear,
    };
  }

  const requireAppearance = options?.requireCurrentSeasonAppearance !== false;
  if (requireAppearance) {
    if (player.role === '투수') {
      const ps = getRegularPitcherStats(player);
      if ((ps.outs ?? 0) <= 0) {
        return {
          eligible: false,
          reason: '당해 정규시즌 1군 등판 기록 없음',
          priorInnings: snap.priorInnings,
          priorOuts: snap.priorOuts,
          priorPA: 0,
          entryYear: snap.entryYear,
          entryYearNumber: snap.entryYearNumber,
          yearsSinceDebut: Math.max(0, snap.entryYearNumber - 1),
          hasOverseasProCareer: false,
          alreadyWonRookieOfYear: false,
        };
      }
    } else {
      const bs = getRegularBatterStats(player);
      if ((bs.PA ?? 0) <= 0) {
        return {
          eligible: false,
          reason: '당해 정규시즌 1군 타석 기록 없음',
          priorInnings: 0,
          priorOuts: 0,
          priorPA: snap.priorPA,
          entryYear: snap.entryYear,
          entryYearNumber: snap.entryYearNumber,
          yearsSinceDebut: Math.max(0, snap.entryYearNumber - 1),
          hasOverseasProCareer: false,
          alreadyWonRookieOfYear: false,
        };
      }
    }
  }

  return {
    eligible: true,
    reason: snap.reason,
    priorInnings: snap.priorInnings,
    priorOuts: snap.priorOuts,
    priorPA: snap.priorPA,
    entryYear: snap.entryYear,
    entryYearNumber: snap.entryYearNumber,
    yearsSinceDebut: Math.max(0, snap.entryYearNumber - 1),
    hasOverseasProCareer: false,
    alreadyWonRookieOfYear: false,
  };
}

/**
 * 정규시즌 성적 기반 추정 WAR 산출 (정규시즌 1군 기록만 사용 · 기자단 AI 투표 핵심 지표)
 */
export function estimatePlayerSeasonWar(player: Player): number {
  if (player.role === '타자') {
    const b = getRegularBatterStats(player);
    const pa = b.PA ?? 0;
    const ab = b.AB ?? 0;
    if (pa <= 0 || ab <= 0) return 0;
    const ops = calcOPS(b) ?? 0.65;
    const sb = b.SB ?? 0;
    const posBonusPer500: Partial<Record<Position, number>> = {
      C: 0.75,
      SS: 0.65,
      CF: 0.45,
      '2B': 0.3,
      '3B': 0.2,
      RF: 0.0,
      LF: -0.15,
      '1B': -0.35,
      DH: -0.65,
    };
    const posAdj = (posBonusPer500[player.position] ?? 0) * Math.min(1.2, pa / 500);
    const battingRuns = ((ops - 0.725) * 32 + 12.5) * (pa / 500);
    const baserunningRuns = sb * 0.14;
    const war = (battingRuns + baserunningRuns) / 9.6 + posAdj;
    return Number(Math.max(-1.8, Math.min(10.5, war)).toFixed(2));
  }

  const ps = getRegularPitcherStats(player);
  const outs = ps.outs ?? 0;
  if (outs <= 0) return 0;
  const ip = outs / 3;
  const era = calcERA(ps.ER, ps.outs) ?? 5.2;
  const whip = calcWHIP(ps.H, ps.BB, ps.outs) ?? 1.5;
  const sv = ps.SV ?? 0;
  const hld = ps.HLD ?? 0;
  const so = ps.SO ?? 0;
  const isReliever = sv >= 8 || hld >= 8 || ((ps.GS ?? 0) <= 5 && ip < 100);
  const replacementEra = isReliever ? 5.15 : 5.45;
  const runsSaved = ((replacementEra - era) * ip) / 9 + (1.42 - whip) * (ip / 38) + so * 0.025;
  const leverageBonus = isReliever ? sv * 0.045 + hld * 0.032 : 0;
  const war = runsSaved / 9.8 + leverageBonus;
  return Number(Math.max(-1.8, Math.min(9.5, war)).toFixed(2));
}

function computeRookieTeamContribution(
  player: Player,
  teamRank: number,
  teamPct: number
): number {
  // 팀 성적 가중 (가을야구권 1~5위 + 승률 반영)
  const teamStandingPts =
    (teamRank <= 5 ? 24 + (6 - teamRank) * 3.5 : 14 + (11 - teamRank) * 1.4) +
    Math.max(0, (teamPct - 0.4) * 38);

  if (player.role === '타자') {
    const b = getRegularBatterStats(player);
    const prod = (b.RBI ?? 0) * 0.42 + (b.R ?? 0) * 0.36 + (b.HR ?? 0) * 0.95 + (b.H ?? 0) * 0.12;
    return Number(Math.max(0, Math.min(100, teamStandingPts + Math.min(62, prod * 0.62))).toFixed(1));
  }

  const ps = getRegularPitcherStats(player);
  const ip = (ps.outs ?? 0) / 3;
  const prod = (ps.W ?? 0) * 3.8 + (ps.SV ?? 0) * 1.65 + (ps.HLD ?? 0) * 1.45 + ip * 0.16;
  return Number(Math.max(0, Math.min(100, teamStandingPts + Math.min(62, prod * 0.72))).toFixed(1));
}

/**
 * 한국야구기자회 기자단 AI 투표 (100명 · 1위 5점 / 2위 3점 / 3위 1점)
 * - WAR, 타격 성적, 투구 성적, 팀 기여도를 기자단 성향별로 종합 평가하여 최종 수상자 선정
 */
export function runRookieOfYearPressVote(
  career: CareerSave,
  options?: { season?: number; voterCount?: number; limit?: number }
): {
  voterCount: number;
  entries: RookiePressVoteEntry[];
} {
  const season = options?.season ?? career.season;
  const voterCount = options?.voterCount ?? KBO_2026_AWARDS_RULES.ROOKIE_PRESS_VOTER_COUNT;
  const validTeamSet = new Set<string>(TEAM_IDS);

  const standings = computeStandings(career.gamesLedger);
  const standingByTeam = new Map<TeamId, { rank: number; pct: number }>();
  standings.forEach((row, idx) => {
    standingByTeam.set(row.teamId, { rank: idx + 1, pct: row.pct });
  });

  const activeKboPlayers = Object.values(career.players).filter(
    (p) => validTeamSet.has(p.teamId) && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
  );

  const pool = activeKboPlayers
    .map((p) => {
      const elig = checkRookieOfYearEligibility(p, season, {
        career,
        requireCurrentSeasonAppearance: true,
      });
      if (!elig.eligible) return null;
      const statScore = computeNormalizedRegularAwardScore(p);
      if (statScore <= 0) return null;
      const war = estimatePlayerSeasonWar(p);
      const st = standingByTeam.get(p.teamId) ?? { rank: 5, pct: 0.5 };
      const teamContribution = computeRookieTeamContribution(p, st.rank, st.pct);
      return {
        player: p,
        elig,
        war,
        statScore,
        teamContribution,
        // WAR(0~100 환산): WAR 0 -> 20, WAR 5 -> 88
        warScore: Math.max(0, Math.min(100, 20 + war * 13.6)),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (pool.length === 0) {
    return { voterCount, entries: [] };
  }

  // 결정론적 기자단 AI 100명 투표 (4개 기자단 성향: 세이버/WAR 35명 · 클래식 성적 30명 · 팀기여/임팩트 20명 · 균형파 15명)
  const rng = new SeededRng((season * 7919 + career.gamesPlayed * 97 + pool.length * 31) >>> 0);
  const voteTallies = new Map<
    string,
    { points: number; first: number; second: number; third: number }
  >();
  for (const c of pool) {
    voteTallies.set(c.player.id, { points: 0, first: 0, second: 0, third: 0 });
  }

  for (let v = 0; v < voterCount; v++) {
    // 기자단 성향별 가중치
    let wWar: number;
    let wStat: number;
    let wTeam: number;
    if (v < Math.round(voterCount * 0.35)) {
      // 세이버메트릭스·WAR 중시 기자단
      wWar = 0.56;
      wStat = 0.30;
      wTeam = 0.14;
    } else if (v < Math.round(voterCount * 0.65)) {
      // 클래식 타격·투구 기록 중시 기자단
      wWar = 0.26;
      wStat = 0.56;
      wTeam = 0.18;
    } else if (v < Math.round(voterCount * 0.85)) {
      // 팀 성적·임팩트·기여도 중시 기자단
      wWar = 0.32;
      wStat = 0.30;
      wTeam = 0.38;
    } else {
      // 종합 균형형 기자단
      wWar = 0.42;
      wStat = 0.38;
      wTeam = 0.20;
    }

    const ballot = pool
      .map((c) => {
        const jitter = (rng.next() - 0.5) * 6.5;
        const val = c.warScore * wWar + c.statScore * wStat + c.teamContribution * wTeam + jitter;
        return { id: c.player.id, val };
      })
      .sort((a, b) => b.val - a.val);

    if (ballot[0]) {
      const t = voteTallies.get(ballot[0].id)!;
      t.points += 5;
      t.first += 1;
    }
    if (ballot[1]) {
      const t = voteTallies.get(ballot[1].id)!;
      t.points += 3;
      t.second += 1;
    }
    if (ballot[2]) {
      const t = voteTallies.get(ballot[2].id)!;
      t.points += 1;
      t.third += 1;
    }
  }

  const maxPointsPerPlayer = voterCount * 5;
  const ranked: RookiePressVoteEntry[] = pool
    .map((c) => {
      const t = voteTallies.get(c.player.id)!;
      const combinedScore = Number(
        (c.warScore * 0.42 + c.statScore * 0.38 + c.teamContribution * 0.20).toFixed(1)
      );
      return {
        rank: 0,
        playerId: c.player.id,
        playerName: c.player.name,
        teamId: c.player.teamId,
        position: c.player.position,
        role: c.player.role,
        age: c.player.age,
        entryYearNumber: c.elig.entryYearNumber,
        war: c.war,
        statSummary:
          c.player.role === '투수' ? buildPitcherSummary(c.player) : buildBatterSummary(c.player),
        teamContribution: c.teamContribution,
        normalizedScore: combinedScore,
        totalVotePoints: t.points,
        firstPlaceVotes: t.first,
        secondPlaceVotes: t.second,
        thirdPlaceVotes: t.third,
        voteSharePct: Number(((t.points / Math.max(1, maxPointsPerPlayer)) * 100).toFixed(1)),
        eligibilityNote: c.elig.reason,
      };
    })
    .sort(
      (a, b) =>
        b.totalVotePoints - a.totalVotePoints ||
        b.firstPlaceVotes - a.firstPlaceVotes ||
        b.war - a.war ||
        b.normalizedScore - a.normalizedScore
    );

  ranked.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  return {
    voterCount,
    entries: options?.limit ? ranked.slice(0, options.limit) : ranked,
  };
}

/**
 * 시즌 진행 중 공식 신인왕 후보 실시간 TOP 10 순위 산출 (공식 자격 + WAR + 기자단 AI 예상 득표율)
 */
export function computeLiveRookieRace(
  career: CareerSave,
  limit = 10
): LiveAwardCandidate[] {
  const { entries } = runRookieOfYearPressVote(career, { limit });
  return entries.map((e) => ({
    rank: e.rank,
    playerId: e.playerId,
    playerName: e.playerName,
    teamId: e.teamId,
    position: e.position,
    role: e.role,
    score: e.normalizedScore,
    statSummary: `WAR ${e.war.toFixed(1)} · ${e.statSummary}`,
    war: e.war,
    entryYearNumber: e.entryYearNumber,
    projectedVoteSharePct: e.voteSharePct,
    tag: `입단 ${e.entryYearNumber}년 차 · ${e.age}세`,
  }));
}

/**
 * 정규시즌 타자 기록 기반 0~100 정규화 평가점수 (postseasonStats 절대 미사용)
 */
export function computeNormalizedBatterScore(player: Player): number {
  const b = getRegularBatterStats(player);
  const pa = b.PA ?? 0;
  const ab = b.AB ?? 0;
  if (pa <= 0 || ab <= 0) return 0;

  const avg = calcAVG(b.H, b.AB) ?? 0;
  const ops = calcOPS(b) ?? 0.5;
  const hr = b.HR ?? 0;
  const rbi = b.RBI ?? 0;
  const h = b.H ?? 0;
  const r = b.R ?? 0;
  const sb = b.SB ?? 0;
  const bb = b.BB ?? 0;

  // 규정타석(446타석) 대비 출장 비중 계수 (소표본 왜곡 방지)
  const volumeFactor = Math.min(1.06, 0.32 + (Math.min(pa, 560) / 446) * 0.68);

  // KBO 역사적 최정상 MVP 타자(.350 / 1.080 OPS / 40HR / 125RBI / 185H / 115R) ≈ 95~99점
  // 준수한 주전 타자(.280 / .800 OPS / 15HR / 65RBI / 135H / 65R) ≈ 58~68점
  const ratePoints =
    Math.max(0, ops - 0.52) * 52 + // .800 -> 14.6, 1.050 -> 27.6
    Math.max(0, avg - 0.19) * 65;  // .280 -> 5.85, .350 -> 10.4
  const countingPoints =
    hr * 0.72 +
    rbi * 0.17 +
    h * 0.085 +
    r * 0.11 +
    sb * 0.22 +
    bb * 0.06;

  const raw = (ratePoints + countingPoints) * volumeFactor;
  return Number(Math.max(0, Math.min(100, raw)).toFixed(1));
}

/**
 * 정규시즌 투수 기록 기반 0~100 정규화 평가점수 (postseasonStats 절대 미사용)
 */
export function computeNormalizedPitcherScore(player: Player): number {
  const ps = getRegularPitcherStats(player);
  const outs = ps.outs ?? 0;
  if (outs <= 0) return 0;

  const ip = outs / 3;
  const era = calcERA(ps.ER, ps.outs) ?? 6.5;
  const whip = calcWHIP(ps.H, ps.BB, ps.outs) ?? 1.7;
  const w = ps.W ?? 0;
  const l = ps.L ?? 0;
  const sv = ps.SV ?? 0;
  const hld = ps.HLD ?? 0;
  const so = ps.SO ?? 0;

  const isRelieverDominant = sv >= 12 || hld >= 12 || ((ps.GS ?? 0) <= 5 && ip < 100);

  if (isRelieverDominant) {
    // 마무리/필승조: 40세이브 1.80 ERA 70IP 85K ≈ 82~90점
    const relVolume = Math.min(1.04, 0.35 + (Math.min(ip, 80) / 60) * 0.65);
    const eraPts = Math.max(0, 4.6 - era) * 11.2;
    const whipPts = Math.max(0, 1.55 - whip) * 16;
    const countPts = sv * 0.92 + hld * 0.78 + w * 1.4 + so * 0.16 - l * 0.8;
    const raw = (eraPts + whipPts + countPts) * relVolume;
    return Number(Math.max(0, Math.min(100, raw)).toFixed(1));
  }

  // 선발 투수: 17승 2.15 ERA 185IP 200K 1.02 WHIP ≈ 92~97점
  // 준수한 3선발: 10승 3.70 ERA 150IP 125K 1.28 WHIP ≈ 60~68점
  const starterVolume = Math.min(1.06, 0.28 + (Math.min(ip, 200) / 144) * 0.72);
  const eraPts = Math.max(0, 5.2 - era) * 10.5;
  const whipPts = Math.max(0, 1.6 - whip) * 15;
  const countPts = w * 1.95 + so * 0.115 + ip * 0.085 + sv * 0.7 + hld * 0.5 - l * 0.55;
  const raw = (eraPts + whipPts + countPts) * starterVolume;
  return Number(Math.max(0, Math.min(100, raw)).toFixed(1));
}

/**
 * 투수·타자 공통 0~100 정규시즌 평가점수 (직접 비교 가능)
 */
export function computeNormalizedRegularAwardScore(player: Player): number {
  return player.role === '투수'
    ? computeNormalizedPitcherScore(player)
    : computeNormalizedBatterScore(player);
}

/**
 * 공식 정규시즌 개인 타이틀 산출 (정규시즌 성적만 사용)
 */
export function computeOfficialRegularTitles(career: CareerSave): {
  battingTitles: AwardEntry[];
  pitchingTitles: AwardEntry[];
  battingTitleHolderMap: Map<string, string[]>;
  pitchingTitleHolderMap: Map<string, string[]>;
} {
  const battingTitleKeys = [
    { key: 'AVG', label: '타격왕(타율)' },
    { key: 'HR', label: '홈런왕' },
    { key: 'RBI', label: '타점왕' },
    { key: 'H', label: '최다안타' },
    { key: 'R', label: '득점왕' },
    { key: 'SB', label: '도루왕' },
    { key: 'OBP', label: '출루율왕' },
    { key: 'SLG', label: '장타율왕' },
  ] as const;

  const pitchingTitleKeys = [
    { key: 'ERA', label: '평균자책점상' },
    { key: 'W', label: '다승왕' },
    { key: 'SO', label: '탈삼진왕' },
    { key: 'SV', label: '세이브왕' },
    { key: 'HLD', label: '홀드왕' },
    { key: 'WPCT', label: '승률왕' },
  ] as const;

  const battingTitleHolderMap = new Map<string, string[]>();
  const pitchingTitleHolderMap = new Map<string, string[]>();

  const battingTitles: AwardEntry[] = battingTitleKeys
    .map((t): AwardEntry | null => {
      const top = computeLeaderboards(career, t.key)[0];
      if (!top) return null;
      const cur = battingTitleHolderMap.get(top.playerId) ?? [];
      cur.push(t.label);
      battingTitleHolderMap.set(top.playerId, cur);
      const pl = career.players[top.playerId];
      return {
        category: t.label,
        playerId: top.playerId,
        playerName: top.playerName,
        teamId: top.teamId,
        statSummary: top.displayValue,
        normalizedScore: pl ? computeNormalizedRegularAwardScore(pl) : undefined,
      };
    })
    .filter((x): x is AwardEntry => Boolean(x));

  const pitchingTitles: AwardEntry[] = pitchingTitleKeys
    .map((t): AwardEntry | null => {
      const top = computeLeaderboards(career, t.key)[0];
      if (!top) return null;
      const cur = pitchingTitleHolderMap.get(top.playerId) ?? [];
      cur.push(t.label);
      pitchingTitleHolderMap.set(top.playerId, cur);
      const pl = career.players[top.playerId];
      return {
        category: t.label,
        playerId: top.playerId,
        playerName: top.playerName,
        teamId: top.teamId,
        statSummary: top.displayValue,
        normalizedScore: pl ? computeNormalizedRegularAwardScore(pl) : undefined,
      };
    })
    .filter((x): x is AwardEntry => Boolean(x));

  return {
    battingTitles,
    pitchingTitles,
    battingTitleHolderMap,
    pitchingTitleHolderMap,
  };
}

/**
 * 2026 KBO 공식 골든글러브 후보 자격 검증
 * - 투수: 규정이닝(144IP) OR 10승 OR 30세이브 OR 30홀드 OR 공식 투수 타이틀홀더 예외
 * - 야수/포수: 해당 포지션 720수비이닝 이상 OR 공식 타격 타이틀홀더 예외
 * - 지명타자: DH 297타석 이상 OR 공식 타격 타이틀홀더 예외
 */
export function checkGoldenGloveEligibility(
  player: Player,
  slotType: 'P' | 'FIELDER' | 'DH',
  titleHolderLabels: string[]
): GoldenGloveEligibilityResult {
  const hasTitle = titleHolderLabels.length > 0;

  if (slotType === 'P') {
    const ps = getRegularPitcherStats(player);
    const outs = ps.outs ?? 0;
    const w = ps.W ?? 0;
    const sv = ps.SV ?? 0;
    const hld = ps.HLD ?? 0;

    if (outs >= KBO_2026_AWARDS_RULES.PITCHER_QUALIFIED_OUTS) {
      return {
        eligible: true,
        reason: `규정이닝 충족 (${formatIP(outs)}이닝 ≥ 144IP)`,
        isTitleHolderException: false,
      };
    }
    if (w >= KBO_2026_AWARDS_RULES.PITCHER_MIN_WINS) {
      return {
        eligible: true,
        reason: `10승 기준 충족 (${w}승)`,
        isTitleHolderException: false,
      };
    }
    if (sv >= KBO_2026_AWARDS_RULES.PITCHER_MIN_SAVES) {
      return {
        eligible: true,
        reason: `30세이브 기준 충족 (${sv}세이브)`,
        isTitleHolderException: false,
      };
    }
    if (hld >= KBO_2026_AWARDS_RULES.PITCHER_MIN_HOLDS) {
      return {
        eligible: true,
        reason: `30홀드 기준 충족 (${hld}홀드)`,
        isTitleHolderException: false,
      };
    }
    if (hasTitle) {
      return {
        eligible: true,
        reason: `공식 타이틀홀더 예외 (${titleHolderLabels.join('·')})`,
        isTitleHolderException: true,
      };
    }
    return {
      eligible: false,
      reason: `투수 기준 미달 (${formatIP(outs)}IP · ${w}승 · ${sv}SV · ${hld}HLD)`,
      isTitleHolderException: false,
    };
  }

  if (slotType === 'DH') {
    const b = getRegularBatterStats(player);
    const pa = b.PA ?? 0;
    if (player.position === 'DH' && pa >= KBO_2026_AWARDS_RULES.DH_MIN_PA) {
      return {
        eligible: true,
        reason: `DH 297타석 기준 충족 (${pa}타석)`,
        isTitleHolderException: false,
      };
    }
    if (player.position === 'DH' && hasTitle) {
      return {
        eligible: true,
        reason: `공식 타이틀홀더 예외 (${titleHolderLabels.join('·')})`,
        isTitleHolderException: true,
      };
    }
    return {
      eligible: false,
      reason: `DH 297타석 미달 (${pa}타석)`,
      isTitleHolderException: false,
    };
  }

  // 포수 및 야수 (C, 1B, 2B, 3B, SS, OF)
  const defInn = getRegularDefensiveInnings(player);
  if (defInn >= KBO_2026_AWARDS_RULES.FIELDER_MIN_DEFENSIVE_INNINGS) {
    return {
      eligible: true,
      reason: `720수비이닝 기준 충족 (${defInn}이닝)`,
      isTitleHolderException: false,
      defensiveInnings: defInn,
    };
  }
  if (hasTitle) {
    return {
      eligible: true,
      reason: `공식 타이틀홀더 예외 (${titleHolderLabels.join('·')})`,
      isTitleHolderException: true,
      defensiveInnings: defInn,
    };
  }
  return {
    eligible: false,
    reason: `720수비이닝 미달 (${defInn}이닝)`,
    isTitleHolderException: false,
    defensiveInnings: defInn,
  };
}

function buildBatterSummary(player: Player): string {
  const b = getRegularBatterStats(player);
  const avg = formatRate3(calcAVG(b.H, b.AB));
  const ops = formatRate3(calcOPS(b));
  return `타율 ${avg} · OPS ${ops} · ${b.HR ?? 0}홈런 ${b.RBI ?? 0}타점`;
}

function buildPitcherSummary(player: Player): string {
  const ps = getRegularPitcherStats(player);
  const era = formatRate2(calcERA(ps.ER, ps.outs));
  const ip = formatIP(ps.outs);
  const svHld =
    (ps.SV ?? 0) >= 10
      ? ` ${ps.SV}세이브`
      : (ps.HLD ?? 0) >= 10
      ? ` ${ps.HLD}홀드`
      : '';
  return `${ps.W ?? 0}승${svHld} · ERA ${era} · ${ip}이닝 ${ps.SO ?? 0}K`;
}

function appendPermanentAwardHonor(player: Player, honor: PlayerAwardHonor): void {
  if (!player.awardHonors) player.awardHonors = [];
  const exists = player.awardHonors.some(
    (h) =>
      h.season === honor.season &&
      h.awardType === honor.awardType &&
      h.label === honor.label
  );
  if (!exists) {
    player.awardHonors.unshift(honor);
  }
}

/**
 * 2026 KBO 공식 시즌 시상식 집계 및 영구 저장 (In-Place · 시즌당 1회 중복 실행 방지)
 * - 모든 10개 KBO 구단 동일 규칙 적용
 * - 정규시즌 성적(player.stats)만 사용 (포스트시즌 성적 완전 배제)
 * - 중복 수상(MVP + 신인왕 + 골든글러브 동시 수상) 허용
 * - 단장 확인 완료 전까지 pendingAwardsCeremonySeason 유지 (자동 다음 시즌 시작 금지)
 */
export function runOfficialSeasonAwardsCeremonyInPlace(
  career: CareerSave,
  options?: { setPendingCeremony?: boolean }
): {
  awards: SeasonAwards;
  alreadyComputed: boolean;
} {
  const targetSeason = career.season;
  if (!career.completedAwardsSeasons) career.completedAwardsSeasons = [];

  const existing = career.awardsHistory.find((a) => a.season === targetSeason);
  if (existing || career.completedAwardsSeasons.includes(targetSeason)) {
    const resolved = existing ?? career.awardsHistory[career.awardsHistory.length - 1];
    return { awards: resolved, alreadyComputed: true };
  }

  // 모든 10개 KBO 구단 소속 선수 동일 평가 (은퇴·해외이적·FA 미소속 배제, 정규시즌 소속 선수 대상)
  const validTeamSet = new Set<string>(TEAM_IDS);
  const activeKboPlayers = Object.values(career.players).filter(
    (p) => validTeamSet.has(p.teamId) && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
  );
  const allBatters = activeKboPlayers.filter((p) => p.role === '타자');
  const allPitchers = activeKboPlayers.filter((p) => p.role === '투수');

  // 1. 공식 개인 타이틀 산출 (타이틀홀더 예외 판정에 선행 사용)
  const { battingTitles, pitchingTitles, battingTitleHolderMap, pitchingTitleHolderMap } =
    computeOfficialRegularTitles(career);

  // 2. 투수·타자 0~100 정규화 점수 맵 (정규시즌 성적만 사용)
  const scoreMap = new Map<string, number>();
  for (const p of activeKboPlayers) {
    scoreMap.set(p.id, computeNormalizedRegularAwardScore(p));
  }
  const getScore = (p: Player) => scoreMap.get(p.id) ?? 0;

  // 3. 정규시즌 MVP (투수·타자 통합 리그 전체 1명)
  const mvpCandidates = activeKboPlayers
    .filter((p) => getScore(p) > 0)
    .sort((a, b) => getScore(b) - getScore(a) || b.ability - a.ability);
  const mvpPlayer = mvpCandidates[0] ?? null;

  // 4. 신인왕 (KBO 공식 규정: 입단 6년 차 이내, 이전 1군 ≤30IP/≤60PA, 당해·퓨처스 제외, 비해외파, 기수상 제외, 나이 무관)
  //    정규시즌 종료 후 WAR · 타격 성적 · 투구 성적 · 팀 기여도를 종합해 한국야구기자회 기자단 AI 100인 투표로 최종 선정
  const rookieVoteResult = runRookieOfYearPressVote(career, { season: targetSeason });
  const royVoteWinner = rookieVoteResult.entries[0] ?? null;

  // 5. 골든글러브 10명 (투수 1, 포수 1, 1B·2B·3B·SS 각 1, 외야수 3, 지명타자 1)
  interface GgSlotDef {
    slotKey: string;
    categoryLabel: string;
    positionLabel: string;
    posList: Position[];
    slotType: 'P' | 'FIELDER' | 'DH';
  }

  const ggSlots: GgSlotDef[] = [
    { slotKey: 'P', categoryLabel: '골든글러브 투수', positionLabel: '투수', posList: ['SP', 'RP', 'CL'], slotType: 'P' },
    { slotKey: 'C', categoryLabel: '골든글러브 포수', positionLabel: '포수', posList: ['C'], slotType: 'FIELDER' },
    { slotKey: '1B', categoryLabel: '골든글러브 1루수', positionLabel: '1루수', posList: ['1B'], slotType: 'FIELDER' },
    { slotKey: '2B', categoryLabel: '골든글러브 2루수', positionLabel: '2루수', posList: ['2B'], slotType: 'FIELDER' },
    { slotKey: '3B', categoryLabel: '골든글러브 3루수', positionLabel: '3루수', posList: ['3B'], slotType: 'FIELDER' },
    { slotKey: 'SS', categoryLabel: '골든글러브 유격수', positionLabel: '유격수', posList: ['SS'], slotType: 'FIELDER' },
    { slotKey: 'OF1', categoryLabel: '골든글러브 외야수 1', positionLabel: '외야수', posList: ['LF', 'CF', 'RF'], slotType: 'FIELDER' },
    { slotKey: 'OF2', categoryLabel: '골든글러브 외야수 2', positionLabel: '외야수', posList: ['LF', 'CF', 'RF'], slotType: 'FIELDER' },
    { slotKey: 'OF3', categoryLabel: '골든글러브 외야수 3', positionLabel: '외야수', posList: ['LF', 'CF', 'RF'], slotType: 'FIELDER' },
    { slotKey: 'DH', categoryLabel: '골든글러브 지명타자', positionLabel: '지명타자', posList: ['DH'], slotType: 'DH' },
  ];

  const usedOutfielders = new Set<string>();
  const usedNonDhWinners = new Set<string>();
  const goldenGloves: AwardEntry[] = [];

  for (const slot of ggSlots) {
    const pool = slot.slotType === 'P' ? allPitchers : allBatters;
    const posPool = pool.filter((p) => {
      if (slot.slotKey.startsWith('OF') && usedOutfielders.has(p.id)) return false;
      return slot.posList.includes(p.position);
    });

    const evaluated = posPool.map((p) => {
      const titles =
        slot.slotType === 'P'
          ? pitchingTitleHolderMap.get(p.id) ?? []
          : battingTitleHolderMap.get(p.id) ?? [];
      const elig = checkGoldenGloveEligibility(p, slot.slotType, titles);
      return { player: p, elig, score: getScore(p) };
    });

    const qualified = evaluated
      .filter((x) => x.elig.eligible)
      .sort((a, b) => b.score - a.score || b.player.ability - a.player.ability);

    let chosen = qualified[0];
    let candidateCount = qualified.length;
    let fallbackNote: string | undefined;

    if (!chosen) {
      // 예외적 단축/특수 세이브에서 공식 충족자가 0명일 때만 해당 포지션 최우수 성적자 보완
      if (slot.slotType === 'DH') {
        const dhFallbackPool = allBatters
          .filter((p) => (p.position === 'DH' || !usedNonDhWinners.has(p.id)) && (getRegularBatterStats(p).PA ?? 0) >= 297)
          .sort((a, b) => getScore(b) - getScore(a));
        const fallbackPlayer =
          dhFallbackPool[0] ??
          evaluated.sort((a, b) => b.score - a.score)[0]?.player ??
          allBatters.sort((a, b) => getScore(b) - getScore(a))[0];
        if (fallbackPlayer) {
          const pa = getRegularBatterStats(fallbackPlayer).PA ?? 0;
          chosen = {
            player: fallbackPlayer,
            score: getScore(fallbackPlayer),
            elig: {
              eligible: pa >= KBO_2026_AWARDS_RULES.DH_MIN_PA,
              reason:
                pa >= KBO_2026_AWARDS_RULES.DH_MIN_PA
                  ? `DH 부문 297타석 이상 충족 (${pa}타석)`
                  : `DH 포지션 최우수 기록 보완 (${pa}타석)`,
              isTitleHolderException: false,
            },
          };
          candidateCount = Math.max(1, dhFallbackPool.length);
        }
      } else {
        const sortedAny = [...evaluated].sort((a, b) => b.score - a.score || b.player.ability - a.player.ability);
        if (sortedAny[0]) {
          chosen = sortedAny[0];
          fallbackNote = `포지션 최우수 기록 보완 (${chosen.elig.reason})`;
          candidateCount = Math.max(1, sortedAny.length);
        }
      }
    }

    if (!chosen) continue;

    if (slot.slotKey.startsWith('OF')) {
      usedOutfielders.add(chosen.player.id);
    }
    if (slot.slotType === 'FIELDER') {
      usedNonDhWinners.add(chosen.player.id);
    }

    goldenGloves.push({
      category: slot.categoryLabel,
      positionLabel: slot.positionLabel,
      playerId: chosen.player.id,
      playerName: chosen.player.name,
      teamId: chosen.player.teamId,
      statSummary:
        slot.slotType === 'P'
          ? buildPitcherSummary(chosen.player)
          : buildBatterSummary(chosen.player),
      normalizedScore: chosen.score,
      eligibilityNote: fallbackNote ?? chosen.elig.reason,
      isTitleHolderException: chosen.elig.isTitleHolderException,
      candidateCount,
      votes: Math.min(99, Math.max(58, Math.round(52 + chosen.score * 0.48))),
    });
  }

  // 6. 최동원상 (선발 최우수 투수)
  const choiBest =
    [...allPitchers]
      .filter((p) => (getRegularPitcherStats(p).GS ?? 0) >= 15)
      .sort((a, b) => getScore(b) - getScore(a))[0] ??
    [...allPitchers].sort((a, b) => getScore(b) - getScore(a))[0] ??
    null;

  // 7. 한국시리즈 우승·준우승·KS MVP & 올해의 감독상
  const ksHistoryRec = (career.championHistory ?? []).find((c) => c.season === targetSeason);
  const ksSeriesRec = career.postseason.seriesHistory.find((s) => s.round === 'KOREAN_SERIES');
  const championTeamId = career.postseason.champion ?? ksHistoryRec?.championTeamId ?? null;
  const runnerUpTeamId =
    ksHistoryRec?.runnerUpTeamId ??
    (ksSeriesRec && championTeamId
      ? championTeamId === ksSeriesRec.higherSeedTeam
        ? ksSeriesRec.lowerSeedTeam
        : ksSeriesRec.higherSeedTeam
      : null);

  const finalStandings = computeStandings(career.gamesLedger);
  const managerCandidates = finalStandings
    .map((row) => {
      const mgr = (career.coaches[row.teamId] ?? []).find((c) => c.role === '감독');
      if (!mgr) return null;
      const isChamp = championTeamId === row.teamId;
      const isRunnerUp = runnerUpTeamId === row.teamId;
      const score =
        row.pct * 120 +
        (11 - row.rank) * 5 +
        (isChamp ? 28 : isRunnerUp ? 12 : 0) +
        (mgr.ability - 75) * 0.6;
      return { row, mgr, isChamp, score };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.score - a.score);

  const bestMgr = managerCandidates[0] ?? null;
  const managerOfTheYear: ManagerOfYearAward | null = bestMgr
    ? {
        managerName: bestMgr.mgr.name,
        teamId: bestMgr.row.teamId,
        wins: bestMgr.row.wins,
        losses: bestMgr.row.losses,
        draws: bestMgr.row.draws,
        rank: bestMgr.row.rank,
        summary: bestMgr.isChamp
          ? `정규시즌 ${bestMgr.row.rank}위 (${bestMgr.row.wins}승 ${bestMgr.row.draws}무 ${bestMgr.row.losses}패 · 승률 ${formatRate3(bestMgr.row.pct)}) · 한국시리즈 우승`
          : `정규시즌 ${bestMgr.row.rank}위 (${bestMgr.row.wins}승 ${bestMgr.row.draws}무 ${bestMgr.row.losses}패 · 승률 ${formatRate3(bestMgr.row.pct)}) · 탁월한 팀 운영`,
        votes: bestMgr.isChamp ? 92 : 81,
      }
    : null;

  const awardSeason: SeasonAwards = {
    season: targetSeason,
    officialRuleVersion: '2026 KBO 공식 시상 규정',
    ceremonyConfirmed: options?.setPendingCeremony ? false : true,
    championTeamId,
    runnerUpTeamId,
    koreanSeriesMvp: career.postseason.ksMvp
      ? {
          category: '한국시리즈 MVP',
          playerId: career.postseason.ksMvp.playerId,
          playerName: career.postseason.ksMvp.playerName,
          teamId: career.postseason.ksMvp.teamId,
          statSummary: career.postseason.ksMvp.statSummary,
          votes: career.postseason.ksMvp.votes ?? 84,
        }
      : null,
    mvp: mvpPlayer
      ? {
          category: '정규시즌 MVP',
          playerId: mvpPlayer.id,
          playerName: mvpPlayer.name,
          teamId: mvpPlayer.teamId,
          statSummary:
            mvpPlayer.role === '투수'
              ? buildPitcherSummary(mvpPlayer)
              : buildBatterSummary(mvpPlayer),
          normalizedScore: getScore(mvpPlayer),
          eligibilityNote: `정규시즌 투·타 통합 1위 (0~100 정규화 ${getScore(mvpPlayer).toFixed(1)}점)`,
          candidateCount: mvpCandidates.length,
          votes: Math.min(99, Math.max(66, Math.round(58 + getScore(mvpPlayer) * 0.42))),
        }
      : null,
    rookieOfYear: royVoteWinner
      ? {
          category: '신인왕',
          playerId: royVoteWinner.playerId,
          playerName: royVoteWinner.playerName,
          teamId: royVoteWinner.teamId,
          statSummary: `WAR ${royVoteWinner.war.toFixed(1)} · ${royVoteWinner.statSummary}`,
          normalizedScore: royVoteWinner.normalizedScore,
          war: royVoteWinner.war,
          firstPlaceVotes: royVoteWinner.firstPlaceVotes,
          votePoints: royVoteWinner.totalVotePoints,
          voteSharePct: royVoteWinner.voteSharePct,
          voterCount: rookieVoteResult.voterCount,
          eligibilityNote: royVoteWinner.eligibilityNote,
          candidateCount: rookieVoteResult.entries.length,
          votes: Math.round(royVoteWinner.voteSharePct),
        }
      : null,
    rookiePressVotes: rookieVoteResult.entries.slice(0, 5),
    rookiePressVoterCount: rookieVoteResult.voterCount,
    choiDongWon: choiBest
      ? {
          category: '최동원상',
          playerId: choiBest.id,
          playerName: choiBest.name,
          teamId: choiBest.teamId,
          statSummary: buildPitcherSummary(choiBest),
          normalizedScore: getScore(choiBest),
          votes: Math.min(98, Math.max(65, Math.round(56 + getScore(choiBest) * 0.42))),
        }
      : null,
    managerOfTheYear,
    goldenGloves,
    defenseAwards: goldenGloves.slice(0, 6).map((g) => ({
      ...g,
      category: g.category.replace('골든글러브', 'KBO 수비상'),
    })),
    battingTitles,
    pitchingTitles,
  };

  career.awardsHistory.push(awardSeason);
  career.completedAwardsSeasons.push(targetSeason);
  if (options?.setPendingCeremony) {
    career.pendingAwardsCeremonySeason = targetSeason;
  }

  // 선수 프로필 영구 수상 기록(awardHonors) + 직전 시즌 수상 태그(lastSeasonAwards) 반영 (중복 수상 허용)
  for (const pl of Object.values(career.players)) {
    pl.lastSeasonAwards = undefined;
  }
  const addSeasonAward = (
    entry: AwardEntry | null | undefined,
    tag: 'MVP' | '신인왕' | '골든글러브',
    label: string
  ) => {
    if (!entry?.playerId) return;
    const pl = career.players[entry.playerId];
    if (!pl) return;
    const cur = pl.lastSeasonAwards ?? [];
    if (!cur.includes(tag)) cur.push(tag);
    pl.lastSeasonAwards = cur;
    appendPermanentAwardHonor(pl, {
      season: targetSeason,
      awardType: tag,
      label,
      positionLabel: entry.positionLabel,
      teamId: entry.teamId,
      normalizedScore: entry.normalizedScore,
      statSummary: entry.statSummary,
    });
  };

  addSeasonAward(awardSeason.mvp, 'MVP', '정규시즌 MVP');
  addSeasonAward(awardSeason.rookieOfYear, '신인왕', 'KBO 신인왕');
  for (const gg of awardSeason.goldenGloves) {
    addSeasonAward(gg, '골든글러브', `골든글러브 (${gg.positionLabel ?? gg.category.replace('골든글러브 ', '')})`);
  }
  if (awardSeason.koreanSeriesMvp?.playerId && career.players[awardSeason.koreanSeriesMvp.playerId]) {
    appendPermanentAwardHonor(career.players[awardSeason.koreanSeriesMvp.playerId], {
      season: targetSeason,
      awardType: '한국시리즈 MVP',
      label: '한국시리즈 MVP',
      teamId: awardSeason.koreanSeriesMvp.teamId,
      statSummary: awardSeason.koreanSeriesMvp.statSummary,
    });
  }

  // 공식 시상식 기록 로그 추가
  const mvpText = awardSeason.mvp
    ? `MVP ${awardSeason.mvp.playerName}(${KBO_TEAMS[awardSeason.mvp.teamId].shortName} · ${awardSeason.mvp.normalizedScore?.toFixed(1)}점)`
    : 'MVP 미선정';
  const royText = awardSeason.rookieOfYear
    ? `신인왕 ${awardSeason.rookieOfYear.playerName}(${KBO_TEAMS[awardSeason.rookieOfYear.teamId].shortName})`
    : '신인왕 해당자 없음';

  career.transactionLogs.unshift({
    id: `tx-kbo-awards-${targetSeason}`,
    date: `${targetSeason}-11-15`,
    type: '엔트리',
    teamId: awardSeason.mvp?.teamId ?? career.playerTeamId,
    summary: `[${targetSeason} KBO 공식 시상식] ${mvpText} · ${royText} · 골든글러브 ${goldenGloves.length}명 확정`,
    detail: '2026 KBO 공식 정규시즌 성적 기준(투·타 0~100 정규화, 720수비이닝·DH 297타석·신인 5년/30IP/60PA 기준 적용)',
  });

  return { awards: awardSeason, alreadyComputed: false };
}

/**
 * 단장이 시즌 시상식을 확인 완료하고 오프시즌 단장 업무로 이동
 * - 절대로 다음 시즌(career.season + 1)으로 자동 전환하지 않음!
 */
export function confirmAwardsCeremonyAndEnterOffseason(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  const backupSnapshot = structuredClone(career);
  const next = structuredClone(career);

  const curAwards = next.awardsHistory.find((a) => a.season === next.season);
  if (curAwards) {
    curAwards.ceremonyConfirmed = true;
    curAwards.ceremonyConfirmedAt = new Date().toISOString();
  }
  next.pendingAwardsCeremonySeason = null;
  if (next.phase !== 'OFFSEASON') {
    next.phase = 'OFFSEASON';
  }
  if (!next.offseasonStep8) {
    next.offseasonStep8 = 'SETTLEMENT';
  }
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot };
}
