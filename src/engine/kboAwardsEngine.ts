import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  AwardEntry,
  BatterStats,
  CareerBatterStats,
  CareerPitcherStats,
  CareerSave,
  ManagerOfYearAward,
  PitcherStats,
  Player,
  PlayerAwardHonor,
  Position,
  SeasonAwards,
} from '../types/kbo';
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
  ROOKIE_MAX_PRIOR_YEARS: 5,
  ROOKIE_MAX_PRIOR_OUTS: 90, // 30.0 이닝
  ROOKIE_MAX_PRIOR_PA: 60,
} as const;

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
  priorPA: number;
  yearsSinceDebut: number;
  hasOverseasProCareer: boolean;
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
  if (/MLB|NPB|CPBL|AAA|AA|마이너|메이저|일본\s*프로|대만\s*프로|미국\s*프로|해외\s*프로|독립리그\s*해외/i.test(prev)) {
    return true;
  }
  const hist = player.careerTeamHistory ?? [];
  for (const h of hist) {
    if ((h.league && h.league !== 'KBO') || h.mlbTeamName) return true;
    if (/MLB|NPB|CPBL|AAA|마이너|메이저|요미우리|소프트뱅크|오릭스|한신|지바롯데|다저스|양키스|자이언츠|파드리스|컵스|블루제이스/i.test(h.teamLabel)) {
      return true;
    }
  }
  return false;
}

/**
 * 2026 KBO 공식 신인왕 자격 검증
 * - 당해 입단 선수 또는 이전 5개 연도 입단 선수
 * - 해당 시즌 이전 누적 투구 30이닝(90아웃) 이하 또는 타격 60타석 이하
 * - 해외 프로야구 기구 소속 경력이 없는 선수
 */
export function checkRookieOfYearEligibility(
  player: Player,
  season: number
): RookieEligibilityResult {
  const hasOverseas = hasOverseasProBaseballCareer(player);
  if (hasOverseas) {
    return {
      eligible: false,
      reason: '해외 프로야구 기구 소속 경력 보유 (신인왕 자격 제외)',
      priorInnings: 0,
      priorPA: 0,
      yearsSinceDebut: player.serviceYears,
      hasOverseasProCareer: true,
    };
  }

  // 입단 연차 판정: 당해(0년차) 또는 이전 5개 연도(1~5년차)
  const kboEntries = (player.careerTeamHistory ?? []).filter(
    (h) => (!h.league || h.league === 'KBO') && !h.mlbTeamName && Boolean(h.teamId)
  );
  const firstKboSeason =
    kboEntries.length > 0
      ? Math.min(...kboEntries.map((h) => h.fromSeason))
      : season - Math.max(0, player.serviceYears);
  const yearsSinceDebut = Math.max(0, season - firstKboSeason);
  const effectiveYears = Math.max(yearsSinceDebut, Math.max(0, player.serviceYears));

  if (effectiveYears > KBO_2026_AWARDS_RULES.ROOKIE_MAX_PRIOR_YEARS && !player.rookieInfo) {
    return {
      eligible: false,
      reason: `입단 ${effectiveYears}년차 (5년 이내 입단 기준 초과)`,
      priorInnings: 0,
      priorPA: 0,
      yearsSinceDebut: effectiveYears,
      hasOverseasProCareer: false,
    };
  }

  // 해당 시즌 이전 누적 기록 산출 (careerStats는 이전 시즌 누적분)
  let priorOuts = 0;
  let priorPA = 0;

  if (player.role === '투수') {
    const cs = player.careerStats as CareerPitcherStats | undefined;
    if (cs && typeof cs.outs === 'number') {
      priorOuts = Math.max(0, cs.outs);
    } else if (effectiveYears >= 1 && (player.careerSO ?? 0) > 0) {
      // 이전 시즌 기록 fallback 추정 (당해 신인 rookieInfo는 0)
      priorOuts = player.rookieInfo ? 0 : Math.round((player.careerSO ?? 0) * 3.1);
    } else if (effectiveYears >= 2 && !player.rookieInfo && (player.careerWins ?? 0) >= 3) {
      priorOuts = (player.careerWins ?? 0) * 45;
    }
  } else {
    const cs = player.careerStats as CareerBatterStats | undefined;
    if (cs && typeof cs.AB === 'number') {
      priorPA = Math.max(0, cs.AB + (cs.BB ?? 0));
    } else if (effectiveYears >= 1 && (player.careerHits ?? 0) > 0) {
      priorPA = player.rookieInfo ? 0 : Math.round((player.careerHits ?? 0) * 3.8);
    }
  }

  const priorInnings = Number((priorOuts / 3).toFixed(1));

  if (player.role === '투수' && priorOuts > KBO_2026_AWARDS_RULES.ROOKIE_MAX_PRIOR_OUTS) {
    return {
      eligible: false,
      reason: `이전 시즌 누적 ${priorInnings}이닝 (30이닝 상한 초과)`,
      priorInnings,
      priorPA: 0,
      yearsSinceDebut: effectiveYears,
      hasOverseasProCareer: false,
    };
  }

  if (player.role === '타자' && priorPA > KBO_2026_AWARDS_RULES.ROOKIE_MAX_PRIOR_PA) {
    return {
      eligible: false,
      reason: `이전 시즌 누적 ${priorPA}타석 (60타석 상한 초과)`,
      priorInnings: 0,
      priorPA,
      yearsSinceDebut: effectiveYears,
      hasOverseasProCareer: false,
    };
  }

  // 당해 정규시즌 실제 출전 기록 보유 확인
  if (player.role === '투수') {
    const ps = getRegularPitcherStats(player);
    if ((ps.outs ?? 0) <= 0) {
      return {
        eligible: false,
        reason: '당해 정규시즌 등판 기록 없음',
        priorInnings,
        priorPA: 0,
        yearsSinceDebut: effectiveYears,
        hasOverseasProCareer: false,
      };
    }
  } else {
    const bs = getRegularBatterStats(player);
    if ((bs.PA ?? 0) <= 0) {
      return {
        eligible: false,
        reason: '당해 정규시즌 타석 기록 없음',
        priorInnings: 0,
        priorPA,
        yearsSinceDebut: effectiveYears,
        hasOverseasProCareer: false,
      };
    }
  }

  const yearLabel = effectiveYears === 0 || Boolean(player.rookieInfo) ? '당해 입단 신인' : `입단 ${effectiveYears}년차`;
  const priorLabel =
    player.role === '투수' ? `이전 누적 ${priorInnings}IP(≤30IP)` : `이전 누적 ${priorPA}타석(≤60타석)`;

  return {
    eligible: true,
    reason: `${yearLabel} · ${priorLabel} · 국내 순수 신인 자격 충족`,
    priorInnings,
    priorPA,
    yearsSinceDebut: effectiveYears,
    hasOverseasProCareer: false,
  };
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

  // 4. 신인왕 (2026 KBO 공식 자격: 5년 이내 입단, 이전 ≤30IP/≤60PA, 해외 프로 경력 없음)
  const rookieCandidates = activeKboPlayers
    .map((p) => ({
      player: p,
      elig: checkRookieOfYearEligibility(p, targetSeason),
      score: getScore(p),
    }))
    .filter((x) => x.elig.eligible && x.score > 0)
    .sort((a, b) => b.score - a.score || b.player.ability - a.player.ability);
  const royWinner = rookieCandidates[0] ?? null;

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
    rookieOfYear: royWinner
      ? {
          category: '신인왕',
          playerId: royWinner.player.id,
          playerName: royWinner.player.name,
          teamId: royWinner.player.teamId,
          statSummary:
            royWinner.player.role === '투수'
              ? buildPitcherSummary(royWinner.player)
              : buildBatterSummary(royWinner.player),
          normalizedScore: royWinner.score,
          eligibilityNote: royWinner.elig.reason,
          candidateCount: rookieCandidates.length,
          votes: Math.min(98, Math.max(60, Math.round(54 + royWinner.score * 0.44))),
        }
      : null,
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
