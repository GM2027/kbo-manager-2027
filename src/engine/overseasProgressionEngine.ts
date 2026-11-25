import { MLB_30_CLUBS_SEED } from '../data/amateurAndOverseasData';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  CareerSave,
  OverseasCanonicalTier,
  OverseasLeagueLevel,
  OverseasPlayerRecord,
  OverseasSeasonStatLine,
} from '../types/kbo';
import { SeededRng } from './rng';

/**
 * 6단계 MLB / 마이너리그 계층 (하위 -> 상위)
 */
export const OVERSEAS_6_TIER_LADDER: OverseasCanonicalTier[] = [
  'Rookie',
  'Single-A',
  'High-A',
  'AA',
  'AAA',
  'MLB',
];

export const OVERSEAS_TIER_DIFFICULTY: Record<OverseasCanonicalTier, number> = {
  Rookie: 56,
  'Single-A': 62,
  'High-A': 67,
  AA: 72,
  AAA: 77,
  MLB: 83,
};

/**
 * 기존 세이브의 'A+' / 'A' 표기를 표준 6단계('High-A' / 'Single-A')로 무손실 정규화
 */
export function normalizeOverseasLeagueLevel(level: OverseasLeagueLevel): OverseasLeagueLevel {
  if (level === 'A+') return 'High-A';
  if (level === 'A') return 'Single-A';
  return level;
}

export function isSixTierOverseasLeague(level: OverseasLeagueLevel): level is OverseasCanonicalTier {
  const norm = normalizeOverseasLeagueLevel(level);
  return (OVERSEAS_6_TIER_LADDER as string[]).includes(norm);
}

export function formatOverseasLeagueLabel(level: OverseasLeagueLevel): string {
  return normalizeOverseasLeagueLevel(level);
}

function addYearsIso(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const ny = (y || 2027) + years;
  return `${ny}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}`;
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const t1 = Date.parse(fromIso);
  const t2 = Date.parse(toIso);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.max(0, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)));
}

function createEmptyLevelStatLine(
  season: number,
  league: OverseasLeagueLevel,
  clubName: string,
  role: '투수' | '타자'
): OverseasSeasonStatLine {
  return {
    season,
    league,
    clubName,
    g: 0,
    ...(role === '타자'
      ? { pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, sb: 0, avg: 0, obp: 0, slg: 0, ops: 0 }
      : { w: 0, l: 0, sv: 0, hld: 0, ip: 0, so: 0, er: 0, hAllowed: 0, bbAllowed: 0, era: 0, whip: 0 }),
  };
}

function computeBatterRatesInPlace(st: OverseasSeasonStatLine): void {
  const ab = Math.max(0, st.ab ?? Math.round((st.g ?? 0) * 3.7));
  const h = Math.max(0, st.h ?? 0);
  const bb = Math.max(0, st.bb ?? Math.round(ab * 0.095));
  const pa = Math.max(ab + bb, st.pa ?? ab + bb);
  const hr = Math.max(0, st.hr ?? 0);
  st.ab = ab;
  st.bb = bb;
  st.pa = pa;
  st.avg = ab > 0 ? Number(Math.min(0.45, h / ab).toFixed(3)) : 0;
  st.obp = pa > 0 ? Number(Math.min(0.54, (h + bb) / pa).toFixed(3)) : 0;
  // Estimate extra bases realistically from HR & H without inflating SLG
  const tb = h + hr * 3 + Math.round(Math.max(0, h - hr) * 0.24);
  st.slg = ab > 0 ? Number(Math.min(0.85, tb / ab).toFixed(3)) : 0;
  st.ops = Number(((st.obp ?? 0) + (st.slg ?? 0)).toFixed(3));
}

function computePitcherRatesInPlace(st: OverseasSeasonStatLine): void {
  const ip = Math.max(0, st.ip ?? 0);
  const er = Math.max(0, st.er ?? (ip > 0 ? ((st.era ?? 3.8) * ip) / 9 : 0));
  const hAl = Math.max(0, st.hAllowed ?? Math.round(ip * 0.88));
  const bbAl = Math.max(0, st.bbAllowed ?? Math.round(ip * 0.34));
  st.ip = Number(ip.toFixed(1));
  st.er = Number(er.toFixed(2));
  st.hAllowed = hAl;
  st.bbAllowed = bbAl;
  st.era = ip > 0 ? Number(Math.min(18.0, (er * 9) / ip).toFixed(2)) : 0;
  st.whip = ip > 0 ? Number(Math.min(4.5, (hAl + bbAl) / ip).toFixed(2)) : 0;
}

function mergeStatLineIntoCareerInPlace(
  target: OverseasSeasonStatLine,
  delta: OverseasSeasonStatLine,
  role: '투수' | '타자'
): void {
  target.g = (target.g ?? 0) + (delta.g ?? 0);
  if (role === '타자') {
    const dAb = delta.ab ?? Math.round((delta.g ?? 0) * 3.7);
    const dBb = delta.bb ?? Math.round(dAb * 0.095);
    const dPa = delta.pa ?? dAb + dBb;
    target.pa = (target.pa ?? 0) + dPa;
    target.ab = (target.ab ?? 0) + dAb;
    target.h = (target.h ?? 0) + (delta.h ?? 0);
    target.hr = (target.hr ?? 0) + (delta.hr ?? 0);
    target.rbi = (target.rbi ?? 0) + (delta.rbi ?? 0);
    target.bb = (target.bb ?? 0) + dBb;
    target.sb = (target.sb ?? 0) + (delta.sb ?? 0);
    computeBatterRatesInPlace(target);
  } else {
    const dIp = delta.ip ?? 0;
    const dEr = delta.er ?? (dIp > 0 ? ((delta.era ?? 3.8) * dIp) / 9 : 0);
    const dHAl = delta.hAllowed ?? Math.round(dIp * 0.88);
    const dBbAl = delta.bbAllowed ?? Math.round(dIp * 0.34);
    target.w = (target.w ?? 0) + (delta.w ?? 0);
    target.l = (target.l ?? 0) + (delta.l ?? 0);
    target.sv = (target.sv ?? 0) + (delta.sv ?? 0);
    target.hld = (target.hld ?? 0) + (delta.hld ?? 0);
    target.ip = Number(((target.ip ?? 0) + dIp).toFixed(1));
    target.so = (target.so ?? 0) + (delta.so ?? 0);
    target.er = Number(((target.er ?? 0) + dEr).toFixed(2));
    target.hAllowed = (target.hAllowed ?? 0) + dHAl;
    target.bbAllowed = (target.bbAllowed ?? 0) + dBbAl;
    computePitcherRatesInPlace(target);
  }
}

/**
 * 구단별 간소화 로스터 경쟁도 산출 (대형 빅마켓·우승권 구단은 경쟁 치열, 리빌딩 구단은 여유)
 */
export function inferClubRosterCompetition(clubName: string): '여유' | '보통' | '치열' {
  if (
    /다저스|양키스|애틀랜타|필리스|메츠|애스트로스|파드리스|레인저스/.test(clubName)
  ) {
    return '치열';
  }
  if (
    /애슬레틱스|화이트삭스|로키스|말린스|내셔널스|파이리츠|로열스|에인절스/.test(clubName)
  ) {
    return '여유';
  }
  return '보통';
}

/**
 * 성적·나이·오버롤·잠재력·계약 조건에 따른 6단계 시작 리그 결정
 * - 고교·대학 해외 아마추어 계약 선수는 반드시 하위 마이너(Rookie / Single-A)부터 성장
 * - KBO 포스팅·FA 메이저 보장 계약 스타는 MLB 또는 AAA부터 시작
 */
export function determineInitialOverseasLeague(params: {
  originCategory: OverseasPlayerRecord['originCategory'];
  age: number;
  ability: number;
  potential: number;
  annualSalaryUsdThousands?: number;
  guaranteedUsdMillions?: number;
  schoolType?: '고교' | '대학';
  clubName?: string;
}): {
  league: OverseasCanonicalTier;
  contractType: NonNullable<OverseasPlayerRecord['contractType']>;
  minorOptionsRemaining: number;
  rosterCompetition: '여유' | '보통' | '치열';
} {
  const {
    originCategory,
    age,
    ability,
    potential,
    annualSalaryUsdThousands = 80,
    guaranteedUsdMillions,
    schoolType,
    clubName = '',
  } = params;
  const rosterCompetition = inferClubRosterCompetition(clubName);

  // 1) 고교·대학 해외 아마추어 직행 선수 -> 하위 마이너리그(Rookie / Single-A)부터 시작
  if (originCategory === '아마추어직행') {
    const isCollege = schoolType === '대학' || age >= 21;
    let league: OverseasCanonicalTier = 'Rookie';
    if (isCollege && ability >= 56) {
      league = ability >= 63 ? 'High-A' : 'Single-A';
    } else if (ability >= 60 && potential >= 88) {
      league = 'Single-A';
    } else {
      league = 'Rookie';
    }
    return {
      league,
      contractType: '국제아마추어',
      minorOptionsRemaining: 3,
      rosterCompetition,
    };
  }

  // 2) KBO 포스팅·FA 해외 진출 선수 -> 계약 규모 + OVR + 구단 로스터 경쟁 반영
  const totalM = guaranteedUsdMillions ?? (annualSalaryUsdThousands / 1000) * 2;
  const isMajorGuaranteed = totalM >= 8 || annualSalaryUsdThousands >= 3000;
  const isSplit = !isMajorGuaranteed && (totalM >= 2 || annualSalaryUsdThousands >= 1000);

  if (isMajorGuaranteed) {
    const compAdj = rosterCompetition === '치열' ? 2 : rosterCompetition === '여유' ? -2 : 0;
    const league: OverseasCanonicalTier = ability >= 78 + compAdj ? 'MLB' : 'AAA';
    return {
      league,
      contractType: '메이저보장',
      minorOptionsRemaining: age >= 29 || totalM >= 20 ? 0 : 2,
      rosterCompetition,
    };
  }

  if (isSplit) {
    const league: OverseasCanonicalTier =
      ability >= 80 && rosterCompetition !== '치열' ? 'MLB' : ability >= 72 ? 'AAA' : 'AA';
    return {
      league,
      contractType: '스플릿',
      minorOptionsRemaining: 3,
      rosterCompetition,
    };
  }

  const league: OverseasCanonicalTier =
    ability >= 74 ? 'AAA' : ability >= 68 ? 'AA' : 'High-A';
  return {
    league,
    contractType: '마이너계약',
    minorOptionsRemaining: 3,
    rosterCompetition,
  };
}

/**
 * 기존 세이브의 해외파 선수 레코드를 6단계 시스템으로 안전하게 정규화 (기존 데이터 100% 보존)
 */
export function ensureOverseasProgressionFieldsInPlace(
  ov: OverseasPlayerRecord,
  currentSeason: number
): void {
  ov.league = normalizeOverseasLeagueLevel(ov.league);
  if (ov.rehabFromLeague) {
    ov.rehabFromLeague = normalizeOverseasLeagueLevel(ov.rehabFromLeague);
  }
  if (ov.currentSeasonStats) {
    ov.currentSeasonStats.league = normalizeOverseasLeagueLevel(ov.currentSeasonStats.league);
    if (ov.role === '타자' && ov.currentSeasonStats.g > 0 && ov.currentSeasonStats.obp === undefined) {
      computeBatterRatesInPlace(ov.currentSeasonStats);
    } else if (ov.role === '투수' && (ov.currentSeasonStats.ip ?? 0) > 0 && ov.currentSeasonStats.whip === undefined) {
      computePitcherRatesInPlace(ov.currentSeasonStats);
    }
  }

  if (ov.seasonHistory) {
    for (const h of ov.seasonHistory) {
      h.league = normalizeOverseasLeagueLevel(h.league);
      if (ov.role === '타자' && h.g > 0 && h.obp === undefined) {
        computeBatterRatesInPlace(h);
      } else if (ov.role === '투수' && (h.ip ?? 0) > 0 && h.whip === undefined) {
        computePitcherRatesInPlace(h);
      }
    }
  }

  if (!ov.rosterCompetition) {
    ov.rosterCompetition = inferClubRosterCompetition(ov.clubName);
  }
  if (!ov.contractType) {
    if (ov.originCategory === '아마추어직행' && ov.annualSalaryUsdThousands < 500) {
      ov.contractType = '국제아마추어';
    } else if (ov.annualSalaryUsdThousands >= 3000) {
      ov.contractType = '메이저보장';
    } else if (ov.annualSalaryUsdThousands >= 750) {
      ov.contractType = '스플릿';
    } else {
      ov.contractType = '마이너계약';
    }
  }
  if (ov.minorOptionsRemaining === undefined) {
    ov.minorOptionsRemaining =
      ov.contractType === '메이저보장' && ov.annualSalaryUsdThousands >= 8000
        ? 0
        : ov.league === 'MLB'
          ? 2
          : 3;
  }
  if (ov.daysAtCurrentLevel === undefined) {
    ov.daysAtCurrentLevel = 0;
  }

  // 시즌 리그별 성적 초기화
  if (!ov.seasonStatsByLevel) {
    ov.seasonStatsByLevel = {};
    if (isSixTierOverseasLeague(ov.league) || ov.league === 'NPB' || ov.league === 'NPB2군') {
      ov.seasonStatsByLevel[ov.league] = {
        ...createEmptyLevelStatLine(currentSeason, ov.league, ov.clubName, ov.role),
        ...(ov.currentSeasonStats ?? {}),
        season: currentSeason,
        league: ov.league,
        clubName: ov.clubName,
      };
    }
  } else {
    // Normalize any legacy A+ / A keys in seasonStatsByLevel
    for (const key of Object.keys(ov.seasonStatsByLevel) as OverseasLeagueLevel[]) {
      const norm = normalizeOverseasLeagueLevel(key);
      if (norm !== key) {
        const val = ov.seasonStatsByLevel[key];
        if (val) {
          val.league = norm;
          ov.seasonStatsByLevel[norm] = val;
        }
        delete ov.seasonStatsByLevel[key];
      }
    }
  }

  // 통산 리그별 성적 초기화 (기존 seasonHistory + 당해 currentSeasonStats 기반 무손실 집계)
  if (!ov.careerStatsByLevel) {
    ov.careerStatsByLevel = {};
    for (const h of ov.seasonHistory ?? []) {
      const lv = normalizeOverseasLeagueLevel(h.league);
      if (!ov.careerStatsByLevel[lv]) {
        ov.careerStatsByLevel[lv] = createEmptyLevelStatLine(h.season, lv, h.clubName, ov.role);
      }
      mergeStatLineIntoCareerInPlace(ov.careerStatsByLevel[lv]!, h, ov.role);
    }
    if (ov.currentSeasonStats && ov.currentSeasonStats.g > 0) {
      const lv = normalizeOverseasLeagueLevel(ov.currentSeasonStats.league);
      if (!ov.careerStatsByLevel[lv]) {
        ov.careerStatsByLevel[lv] = createEmptyLevelStatLine(currentSeason, lv, ov.clubName, ov.role);
      }
      mergeStatLineIntoCareerInPlace(ov.careerStatsByLevel[lv]!, ov.currentSeasonStats, ov.role);
    }
  }
}

function pushOverseasNews(
  career: CareerSave,
  article: {
    date: string;
    category: '이적·계약' | 'MLB소식' | '국제·병역' | '구단사건' | '수상·이달의선수';
    headline: string;
    body: string;
    isHighlight?: boolean;
  }
): void {
  career.newsFeed = [
    {
      id: `news-ov-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
      ...article,
    },
    ...(career.newsFeed ?? []),
  ].slice(0, 120);
}

/**
 * 14일 구간 해외파 성적 시뮬레이션 (현재 소속 리그의 seasonStatsByLevel & careerStatsByLevel에 별도 누적)
 */
function simulate14DaysStatsInPlace(
  ov: OverseasPlayerRecord,
  rng: SeededRng,
  season: number,
  activeLevel: OverseasCanonicalTier
): OverseasSeasonStatLine {
  const diff = OVERSEAS_TIER_DIFFICULTY[activeLevel];
  const edge = (ov.ability - diff) / 11; // approx -1.8 .. +1.8

  if (!ov.seasonStatsByLevel) ov.seasonStatsByLevel = {};
  if (!ov.careerStatsByLevel) ov.careerStatsByLevel = {};

  if (!ov.seasonStatsByLevel[activeLevel]) {
    ov.seasonStatsByLevel[activeLevel] = createEmptyLevelStatLine(season, activeLevel, ov.clubName, ov.role);
  }
  if (!ov.careerStatsByLevel[activeLevel]) {
    ov.careerStatsByLevel[activeLevel] = createEmptyLevelStatLine(season, activeLevel, ov.clubName, ov.role);
  }

  const delta = createEmptyLevelStatLine(season, activeLevel, ov.clubName, ov.role);

  if (ov.role === '타자') {
    const addG = ov.status === '재활경기' ? rng.int(3, 5) : rng.int(9, 12);
    const addPa = Math.round(addG * (3.9 + rng.next() * 0.5));
    const walkRate = Math.max(0.045, Math.min(0.18, 0.088 + edge * 0.022 + (rng.next() - 0.5) * 0.025));
    const addBb = Math.max(0, Math.round(addPa * walkRate));
    const addAb = Math.max(addG, addPa - addBb);
    const expectedAvg = Math.max(0.165, Math.min(0.395, 0.258 + edge * 0.042 + (rng.next() - 0.5) * 0.055));
    const addH = Math.min(addAb, Math.max(0, Math.round(addAb * expectedAvg)));
    const hrPerG = Math.max(0.02, 0.105 + edge * 0.07 + (rng.next() - 0.45) * 0.06);
    const addHR = Math.min(addH, Math.max(0, Math.round(addG * hrPerG)));
    const addRBI = Math.max(addHR, Math.round(addHR * 1.85 + addH * 0.34));
    const addSB =
      ov.position === 'CF' || ov.position === 'SS' || ov.position === '2B'
        ? rng.int(0, 3)
        : rng.next() < 0.28
          ? 1
          : 0;

    delta.g = addG;
    delta.pa = addPa;
    delta.ab = addAb;
    delta.h = addH;
    delta.bb = addBb;
    delta.hr = addHR;
    delta.rbi = addRBI;
    delta.sb = addSB;
    computeBatterRatesInPlace(delta);
  } else {
    const isStarter = ov.position === 'SP';
    const addG =
      ov.status === '재활경기'
        ? isStarter
          ? 2
          : 3
        : isStarter
          ? rng.int(2, 3)
          : rng.int(4, 6);
    const addIp = isStarter
      ? Number((addG * (4.6 + rng.next() * 1.5)).toFixed(1))
      : Number((addG * (0.95 + rng.next() * 0.45)).toFixed(1));
    const expectedEra = Math.max(1.35, Math.min(7.8, 3.88 - edge * 0.92 + (rng.next() - 0.5) * 1.15));
    const addEr = Number(Math.max(0, (expectedEra * addIp) / 9).toFixed(2));
    const expectedWhip = Math.max(0.76, Math.min(2.15, 1.26 - edge * 0.21 + (rng.next() - 0.5) * 0.26));
    const totalBaserunners = Math.max(0, Math.round(expectedWhip * addIp));
    const addBbAl = Math.max(0, Math.round(totalBaserunners * Math.max(0.22, Math.min(0.45, 0.32 - edge * 0.04))));
    const addHAl = Math.max(0, totalBaserunners - addBbAl);
    const kPer9 = Math.max(5.0, Math.min(13.5, 8.6 + edge * 1.35 + (rng.next() - 0.5) * 1.6));
    const addSO = Math.max(0, Math.round((kPer9 * addIp) / 9));
    const addW = Math.max(0, Math.round((isStarter ? 0.38 : 0.14) * addG * Math.max(0.2, 1 + edge * 0.28) * rng.next() * 1.5));
    const addL = Math.max(0, Math.round((isStarter ? 0.28 : 0.11) * addG * Math.max(0.2, 1 - edge * 0.22) * rng.next() * 1.4));
    const addSV = !isStarter && ov.position === 'CL' && rng.next() < 0.72 ? rng.int(1, 3) : 0;
    const addHLD = !isStarter && ov.position !== 'CL' && rng.next() < 0.65 ? rng.int(1, 3) : 0;

    delta.g = addG;
    delta.ip = addIp;
    delta.er = addEr;
    delta.hAllowed = addHAl;
    delta.bbAllowed = addBbAl;
    delta.so = addSO;
    delta.w = addW;
    delta.l = addL;
    delta.sv = addSV;
    delta.hld = addHLD;
    computePitcherRatesInPlace(delta);
  }

  const seasonLine = ov.seasonStatsByLevel[activeLevel]!;
  seasonLine.clubName = ov.clubName;
  mergeStatLineIntoCareerInPlace(seasonLine, delta, ov.role);
  mergeStatLineIntoCareerInPlace(ov.careerStatsByLevel[activeLevel]!, delta, ov.role);

  ov.currentSeasonStats = { ...seasonLine };
  return seasonLine;
}

/**
 * 14일 주기 승격·강등 평가 결과
 * - 타자: 타율(AVG), 출루율(OBP), OPS, 홈런(HR) + 충분한 타석(PA >= 50)
 * - 투수: ERA, WHIP, 탈삼진(SO/K9), 투구 이닝(IP >= 18 선발 / >= 12 불펜)
 * - 뛰어난 성적은 최대 2단계 건너뛰기 승격 허용
 */
export function evaluateOverseasLevelMovement(
  ov: OverseasPlayerRecord,
  levelStats: OverseasSeasonStatLine,
  isoDate: string
): {
  action: 'PROMOTE_2' | 'PROMOTE_1' | 'DEMOTE_1' | 'DFA_RISK' | 'HOLD';
  reason: string;
} {
  const normLeague = normalizeOverseasLeagueLevel(ov.league);
  if (!isSixTierOverseasLeague(normLeague)) {
    return { action: 'HOLD', reason: '비MLB 계층' };
  }
  const idx = OVERSEAS_6_TIER_LADDER.indexOf(normLeague);
  const compMod =
    ov.rosterCompetition === '치열' ? 0.025 : ov.rosterCompetition === '여유' ? -0.02 : 0;
  const eraCompMod =
    ov.rosterCompetition === '치열' ? -0.25 : ov.rosterCompetition === '여유' ? 0.25 : 0;

  // 단기간 성적으로 잦은 승격·강등 방지 (최소 28일 쿨다운)
  if (ov.lastMovementDate && daysBetweenIso(ov.lastMovementDate, isoDate) < 28) {
    return { action: 'HOLD', reason: '최근 이동 후 적응 기간(28일 미만)' };
  }

  const tierDiff = OVERSEAS_TIER_DIFFICULTY[normLeague];
  const ovrGap = ov.ability - tierDiff;

  if (ov.role === '타자') {
    const pa = levelStats.pa ?? Math.round((levelStats.g ?? 0) * 4.0);
    const avg = levelStats.avg ?? 0;
    const obp = levelStats.obp ?? 0;
    const ops = levelStats.ops ?? 0;
    const hr = levelStats.hr ?? 0;

    // 최소 타석 표본 충족 확인 (잦은 변동 방지)
    if (pa < 50) {
      return { action: 'HOLD', reason: `표본 부족 (${pa}PA / 기준 50PA)` };
    }

    // 1) 2단계 점프 승격 검토 (단, MLB 직행은 최소 AA 이상에서 압도적 활약 시)
    if (idx <= OVERSEAS_6_TIER_LADDER.length - 3) {
      const targetJumpLevel = OVERSEAS_6_TIER_LADDER[idx + 2];
      const allowedJump =
        targetJumpLevel !== 'MLB' || (ov.ability >= 77 && ov.age >= 21);
      if (
        allowedJump &&
        pa >= 75 &&
        avg >= 0.325 + compMod &&
        obp >= 0.405 + compMod &&
        ops >= 0.960 + compMod * 1.4 &&
        hr >= Math.max(4, Math.round(pa / 22)) &&
        ovrGap >= 3
      ) {
        return {
          action: 'PROMOTE_2',
          reason: `압도적 타격(${pa}PA 타율 ${avg.toFixed(3)} 출루율 ${obp.toFixed(3)} OPS ${ops.toFixed(3)} ${hr}HR) — 2단계 점프 승격`,
        };
      }
    }

    // 2) 1단계 정상 승격 검토
    if (idx < OVERSEAS_6_TIER_LADDER.length - 1) {
      const nextTier = OVERSEAS_6_TIER_LADDER[idx + 1];
      const promoOps = (nextTier === 'MLB' ? 0.855 : 0.825) + compMod;
      const promoObp = (nextTier === 'MLB' ? 0.365 : 0.350) + compMod * 0.6;
      const promoAvg = (nextTier === 'MLB' ? 0.285 : 0.275) + compMod * 0.5;
      const meetsHr = hr >= (nextTier === 'MLB' ? 4 : 2);
      const perfPass = ops >= promoOps && obp >= promoObp && (avg >= promoAvg || meetsHr);
      const ovrPass = ovrGap >= 6 && ops >= promoOps - 0.045;
      if (perfPass || ovrPass) {
        return {
          action: 'PROMOTE_1',
          reason: `${normLeague} 호성적(${pa}PA 타율 ${avg.toFixed(3)} 출루율 ${obp.toFixed(3)} OPS ${ops.toFixed(3)} ${hr}HR)`,
        };
      }
    }

    // 3) 강등 검토 (최소 65PA 이상 부진 지속 시)
    if (idx > 0 && pa >= 65) {
      const demoteOps = (normLeague === 'MLB' ? 0.615 : 0.600) + compMod * 0.8;
      const demoteObp = 0.280 + compMod * 0.4;
      const demoteAvg = 0.205 + compMod * 0.4;
      if (ops < demoteOps && obp < demoteObp && avg < demoteAvg) {
        if (normLeague === 'MLB' && ov.contractType === '메이저보장' && (ov.minorOptionsRemaining ?? 0) <= 0) {
          return {
            action: 'DFA_RISK',
            reason: `MLB 장기 부진(${pa}PA 타율 ${avg.toFixed(3)} OPS ${ops.toFixed(3)}) · 마이너 옵션 소진`,
          };
        }
        return {
          action: 'DEMOTE_1',
          reason: `${normLeague} 성적 부진(${pa}PA 타율 ${avg.toFixed(3)} 출루율 ${obp.toFixed(3)} OPS ${ops.toFixed(3)})`,
        };
      }
    }

    return { action: 'HOLD', reason: '현 리그 유지' };
  }

  // 투수 평가: ERA, WHIP, 탈삼진(SO/K9), 투구 이닝(IP)
  const isStarter = ov.position === 'SP';
  const ip = levelStats.ip ?? 0;
  const minIp = isStarter ? 18 : 11;
  if (ip < minIp) {
    return { action: 'HOLD', reason: `이닝 표본 부족 (${ip.toFixed(1)}IP / 기준 ${minIp}IP)` };
  }
  const era = levelStats.era ?? 4.0;
  const whip = levelStats.whip ?? 1.3;
  const so = levelStats.so ?? 0;
  const k9 = ip > 0 ? (so * 9) / ip : 0;

  // 1) 2단계 점프 승격
  if (idx <= OVERSEAS_6_TIER_LADDER.length - 3) {
    const targetJumpLevel = OVERSEAS_6_TIER_LADDER[idx + 2];
    const allowedJump =
      targetJumpLevel !== 'MLB' || (ov.ability >= 77 && ov.age >= 21);
    if (
      allowedJump &&
      ip >= (isStarter ? 28 : 16) &&
      era <= 2.05 + eraCompMod &&
      whip <= 0.96 &&
      k9 >= 10.2 &&
      ovrGap >= 3
    ) {
      return {
        action: 'PROMOTE_2',
        reason: `압도적 투구(${ip.toFixed(1)}IP ERA ${era.toFixed(2)} WHIP ${whip.toFixed(2)} ${so}K) — 2단계 점프 승격`,
      };
    }
  }

  // 2) 1단계 정상 승격
  if (idx < OVERSEAS_6_TIER_LADDER.length - 1) {
    const nextTier = OVERSEAS_6_TIER_LADDER[idx + 1];
    const promoEra = (nextTier === 'MLB' ? 2.95 : 3.20) + eraCompMod;
    const promoWhip = nextTier === 'MLB' ? 1.12 : 1.18;
    const promoK9 = nextTier === 'MLB' ? 8.8 : 8.2;
    const perfPass = era <= promoEra && whip <= promoWhip && k9 >= promoK9;
    const ovrPass = ovrGap >= 6 && era <= promoEra + 0.45 && whip <= promoWhip + 0.08;
    if (perfPass || ovrPass) {
      return {
        action: 'PROMOTE_1',
        reason: `${normLeague} 호투(${ip.toFixed(1)}IP ERA ${era.toFixed(2)} WHIP ${whip.toFixed(2)} ${so}K)`,
      };
    }
  }

  // 3) 강등 검토
  const demoteMinIp = isStarter ? 24 : 14;
  if (idx > 0 && ip >= demoteMinIp) {
    const demoteEra = (normLeague === 'MLB' ? 5.65 : 5.85) + eraCompMod;
    const demoteWhip = 1.56;
    if (era >= demoteEra && whip >= demoteWhip) {
      if (normLeague === 'MLB' && ov.contractType === '메이저보장' && (ov.minorOptionsRemaining ?? 0) <= 0) {
        return {
          action: 'DFA_RISK',
          reason: `MLB 부진(${ip.toFixed(1)}IP ERA ${era.toFixed(2)} WHIP ${whip.toFixed(2)}) · 마이너 옵션 소진`,
        };
      }
      return {
        action: 'DEMOTE_1',
        reason: `${normLeague} 투구 부진(${ip.toFixed(1)}IP ERA ${era.toFixed(2)} WHIP ${whip.toFixed(2)})`,
      };
    }
  }

  return { action: 'HOLD', reason: '현 리그 유지' };
}

/**
 * 14일마다 호출되는 해외 진출 선수 성적 누적 및 승격·강등·재활·트레이드·방출 자동 처리
 */
export function processBiweeklyOverseasProgressionInPlace(
  career: CareerSave,
  rng: SeededRng,
  isoDate: string,
  forceRun = false
): void {
  const state = career.amateurAndOverseas;
  if (!state || !state.overseasPlayers || state.overseasPlayers.length === 0) return;

  if (
    !forceRun &&
    state.lastBiweeklyProcessedDate &&
    daysBetweenIso(state.lastBiweeklyProcessedDate, isoDate) < 14
  ) {
    return;
  }
  state.lastBiweeklyProcessedDate = isoDate;

  const monthNum = Number(isoDate.slice(5, 7)) || 4;
  // 정규 해외 야구 시즌 (4~9월) 위주 시뮬레이션
  if (monthNum < 4 || monthNum > 9) return;

  for (const ov of state.overseasPlayers) {
    ensureOverseasProgressionFieldsInPlace(ov, career.season);
    if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') continue;

    // 방출대기/FA 선수의 해외 재계약 검토
    if (ov.league === 'FA/방출' || ov.status === '방출대기') {
      if (ov.ability >= 71 && ov.age <= 34 && rng.next() < 0.14) {
        const newClub = rng.pick(MLB_30_CLUBS_SEED).clubName;
        const init = determineInitialOverseasLeague({
          originCategory: ov.originCategory,
          age: ov.age,
          ability: ov.ability,
          potential: ov.potential,
          annualSalaryUsdThousands: ov.ability >= 80 ? 3500 : 800,
          clubName: newClub,
        });
        ov.clubName = newClub;
        ov.league = init.league;
        ov.contractType = init.contractType;
        ov.rosterCompetition = init.rosterCompetition;
        ov.minorOptionsRemaining = init.minorOptionsRemaining;
        ov.status = '현역';
        ov.contractYearsRemaining = 1;
        ov.overseasContractEndDate = undefined;
        ov.domesticEligibleDate = undefined;
        ov.returnRestrictionActive = false;
        ov.returnRestrictionNote = `${newClub} 재계약 (${init.league}) — 계약 종료 시 복귀 자격 재검토`;
        ov.lastMovementDate = isoDate;
        ov.daysAtCurrentLevel = 0;
        if (!ov.seasonStatsByLevel) ov.seasonStatsByLevel = {};
        if (!ov.seasonStatsByLevel[init.league]) {
          ov.seasonStatsByLevel[init.league] = createEmptyLevelStatLine(career.season, init.league, newClub, ov.role);
        }
        ov.currentSeasonStats = { ...ov.seasonStatsByLevel[init.league]! };
        ov.transferHistory.unshift({
          date: isoDate,
          season: career.season,
          eventType: '재계약',
          toClub: newClub,
          toLeague: init.league,
          note: `${newClub} (${init.league}) ${init.contractType} 체결`,
        });
        pushOverseasNews(career, {
          date: isoDate,
          category: 'MLB소식',
          headline: `[해외파 계약] ${ov.name}, ${newClub}(${init.league})과 새 계약 체결`,
          body: `방출 후 새 구단을 찾던 ${ov.name}(${ov.position} · 만 ${ov.age}세) 선수가 ${newClub} 산하 ${init.league}에서 재도전에 나섭니다.`,
        });
      }
      continue;
    }

    // 부상자명단(IL) 회복 & 마이너 재활 배정 간소화
    if (ov.status === '부상자명단') {
      ov.injuryDaysRemaining = Math.max(0, (ov.injuryDaysRemaining ?? 14) - 14);
      if (ov.injuryDaysRemaining <= 0) {
        const curNorm = normalizeOverseasLeagueLevel(ov.league);
        const curIdx = isSixTierOverseasLeague(curNorm) ? OVERSEAS_6_TIER_LADDER.indexOf(curNorm) : -1;
        if (curIdx >= 3) {
          // AA/AAA/MLB 선수는 하위 마이너(AAA 또는 AA)에서 단기 재활 경기 소화
          const rehabTier = OVERSEAS_6_TIER_LADDER[Math.max(1, curIdx - 1)];
          ov.rehabFromLeague = curNorm;
          ov.league = rehabTier;
          ov.status = '재활경기';
          ov.rehabGamesRemaining = 4;
          ov.transferHistory.unshift({
            date: isoDate,
            season: career.season,
            eventType: '재활배정',
            fromClub: `${ov.clubName} (IL)`,
            toClub: `${ov.clubName} (${rehabTier})`,
            fromLeague: curNorm,
            toLeague: rehabTier,
            note: `부상 회복 후 ${rehabTier} 마이너 재활 경기 배정`,
          });
        } else {
          ov.status = '현역';
        }
      }
      continue;
    }

    // 재활 경기 진행 후 원 리그 복귀
    if (ov.status === '재활경기' && ov.rehabFromLeague) {
      const rehabLevel = normalizeOverseasLeagueLevel(ov.league);
      if (isSixTierOverseasLeague(rehabLevel)) {
        simulate14DaysStatsInPlace(ov, rng, career.season, rehabLevel);
      }
      const origLeague = normalizeOverseasLeagueLevel(ov.rehabFromLeague);
      ov.league = origLeague;
      ov.status = '현역';
      ov.rehabFromLeague = undefined;
      ov.rehabGamesRemaining = undefined;
      if (!ov.seasonStatsByLevel) ov.seasonStatsByLevel = {};
      if (!ov.seasonStatsByLevel[origLeague]) {
        ov.seasonStatsByLevel[origLeague] = createEmptyLevelStatLine(career.season, origLeague, ov.clubName, ov.role);
      }
      ov.currentSeasonStats = { ...ov.seasonStatsByLevel[origLeague]! };
      ov.transferHistory.unshift({
        date: isoDate,
        season: career.season,
        eventType: '재활배정',
        fromClub: `${ov.clubName} (${rehabLevel} 재활)`,
        toClub: `${ov.clubName} (${origLeague})`,
        fromLeague: rehabLevel,
        toLeague: origLeague,
        note: `마이너 재활 경기 완료 후 ${origLeague} 로스터 복귀`,
      });
      continue;
    }

    // 간헐적 부상 발생 (14일당 ~2.4%)
    if (rng.next() < 0.024) {
      ov.status = '부상자명단';
      ov.injuryDaysRemaining = rng.int(14, 42);
      continue;
    }

    const activeLevel = normalizeOverseasLeagueLevel(ov.league);
    if (!isSixTierOverseasLeague(activeLevel)) continue;

    // 14일 성적 시뮬레이션 (리그별 시즌·통산 성적 별도 저장)
    const levelStats = simulate14DaysStatsInPlace(ov, rng, career.season, activeLevel);
    ov.daysAtCurrentLevel = (ov.daysAtCurrentLevel ?? 0) + 14;
    ov.lastEvaluatedDate = isoDate;

    // 14일 주기 승격·강등 자동 평가
    const verdict = evaluateOverseasLevelMovement(ov, levelStats, isoDate);
    const curIdx = OVERSEAS_6_TIER_LADDER.indexOf(activeLevel);

    if (verdict.action === 'PROMOTE_2' || verdict.action === 'PROMOTE_1') {
      const step = verdict.action === 'PROMOTE_2' ? 2 : 1;
      const nextLevel = OVERSEAS_6_TIER_LADDER[Math.min(OVERSEAS_6_TIER_LADDER.length - 1, curIdx + step)];
      const isMlbDebut = nextLevel === 'MLB' && !ov.mlbDebutSeason;
      if (isMlbDebut) ov.mlbDebutSeason = career.season;
      ov.league = nextLevel;
      ov.lastMovementDate = isoDate;
      ov.daysAtCurrentLevel = 0;

      // 새 리그의 시즌 성적 슬롯 생성 (기존 리그 성적은 seasonStatsByLevel[activeLevel]에 그대로 보존!)
      if (!ov.seasonStatsByLevel) ov.seasonStatsByLevel = {};
      if (!ov.seasonStatsByLevel[nextLevel]) {
        ov.seasonStatsByLevel[nextLevel] = createEmptyLevelStatLine(career.season, nextLevel, ov.clubName, ov.role);
      }
      ov.currentSeasonStats = { ...ov.seasonStatsByLevel[nextLevel]! };

      ov.transferHistory.unshift({
        date: isoDate,
        season: career.season,
        eventType: isMlbDebut ? 'MLB데뷔' : '승격',
        fromClub: `${ov.clubName} (${activeLevel})`,
        toClub: `${ov.clubName} (${nextLevel})`,
        fromLeague: activeLevel,
        toLeague: nextLevel,
        note: `${step === 2 ? '[2단계 승격] ' : ''}${activeLevel} → ${nextLevel} · ${verdict.reason}`,
      });

      if (isMlbDebut || nextLevel === 'MLB' || nextLevel === 'AAA' || step === 2) {
        pushOverseasNews(career, {
          date: isoDate,
          category: 'MLB소식',
          headline: isMlbDebut
            ? `[MLB 콜업 데뷔] ${ov.name}(${ov.clubName}), ${activeLevel}에서 빅리그 승격!`
            : step === 2
              ? `[파격 2단계 승격] ${ov.name}(${ov.clubName}), ${activeLevel} → ${nextLevel} 초고속 승격`
              : `[리그 승격] ${ov.name}(${ov.clubName}), ${activeLevel} → ${nextLevel} 승격 확정`,
          body: `${ov.name}(${ov.position} · 만 ${ov.age}세) 선수가 ${verdict.reason}을(를) 바탕으로 ${nextLevel}로 승격했습니다.`,
          isHighlight: isMlbDebut || nextLevel === 'MLB' || step === 2,
        });
      }
    } else if (verdict.action === 'DEMOTE_1') {
      const lowerLevel = OVERSEAS_6_TIER_LADDER[Math.max(0, curIdx - 1)];
      let optionNote = '';
      if (activeLevel === 'MLB' && (ov.minorOptionsRemaining ?? 0) > 0 && ov.optionUsedSeason !== career.season) {
        ov.minorOptionsRemaining = Math.max(0, (ov.minorOptionsRemaining ?? 1) - 1);
        ov.optionUsedSeason = career.season;
        optionNote = ` · 마이너 옵션 행사 (잔여 ${ov.minorOptionsRemaining}회)`;
      }
      ov.league = lowerLevel;
      ov.lastMovementDate = isoDate;
      ov.daysAtCurrentLevel = 0;

      if (!ov.seasonStatsByLevel) ov.seasonStatsByLevel = {};
      if (!ov.seasonStatsByLevel[lowerLevel]) {
        ov.seasonStatsByLevel[lowerLevel] = createEmptyLevelStatLine(career.season, lowerLevel, ov.clubName, ov.role);
      }
      ov.currentSeasonStats = { ...ov.seasonStatsByLevel[lowerLevel]! };

      ov.transferHistory.unshift({
        date: isoDate,
        season: career.season,
        eventType: '강등',
        fromClub: `${ov.clubName} (${activeLevel})`,
        toClub: `${ov.clubName} (${lowerLevel})`,
        fromLeague: activeLevel,
        toLeague: lowerLevel,
        note: `${activeLevel} → ${lowerLevel} 강등${optionNote} · ${verdict.reason}`,
      });

      if (activeLevel === 'MLB' || activeLevel === 'AAA') {
        pushOverseasNews(career, {
          date: isoDate,
          category: 'MLB소식',
          headline: `[마이너 강등] ${ov.name}(${ov.clubName}), ${activeLevel} → ${lowerLevel} 조정`,
          body: `${ov.name}(${ov.position}) 선수가 ${verdict.reason} 여파로 ${lowerLevel}로 내려가 재정비에 들어갑니다${optionNote}.`,
        });
      }
    } else if (verdict.action === 'DFA_RISK') {
      // 옵션 없는 MLB 부진 베테랑 -> 타 구단 트레이드/클레임 또는 방출(DFA)
      if (ov.ability >= 74 && rng.next() < 0.6) {
        const destPool = MLB_30_CLUBS_SEED.filter(
          (c) => c.clubName !== ov.clubName && inferClubRosterCompetition(c.clubName) !== '치열'
        );
        const newClub = (rng.pick(destPool.length > 0 ? destPool : MLB_30_CLUBS_SEED)).clubName;
        const oldClub = ov.clubName;
        ov.clubName = newClub;
        ov.rosterCompetition = inferClubRosterCompetition(newClub);
        ov.lastMovementDate = isoDate;
        ov.currentSeasonStats.clubName = newClub;
        ov.transferHistory.unshift({
          date: isoDate,
          season: career.season,
          eventType: '트레이드',
          fromClub: `${oldClub} (MLB)`,
          toClub: `${newClub} (MLB)`,
          fromLeague: 'MLB',
          toLeague: 'MLB',
          note: `DFA 후 ${newClub} 트레이드/웨이버 클레임 이적 (${verdict.reason})`,
        });
        pushOverseasNews(career, {
          date: isoDate,
          category: 'MLB소식',
          headline: `[MLB DFA 이적] ${ov.name}, ${oldClub} → ${newClub} 새 둥지`,
          body: `마이너 옵션이 소진된 ${ov.name} 선수가 ${oldClub}에서 지명할당(DFA)된 뒤 ${newClub}으로 이적해 빅리그 기회를 이어갑니다.`,
          isHighlight: true,
        });
      } else {
        const oldClub = ov.clubName;
        ov.league = 'FA/방출';
        ov.status = '방출대기';
        ov.overseasContractEndDate = isoDate;
        if (ov.originCategory === '아마추어직행') {
          ov.domesticEligibleDate = addYearsIso(isoDate, 2);
          ov.returnRestrictionActive = true;
          ov.returnRestrictionNote = `해외 방출(${isoDate}) — KBO 규약 제107조 2년 제한 (가능일 ${ov.domesticEligibleDate})`;
        } else {
          ov.domesticEligibleDate = isoDate;
          ov.returnRestrictionActive = false;
          ov.returnRestrictionNote = `해외 방출(${isoDate}) — KBO 원소속(${ov.originalKboTeamId ? KBO_TEAMS[ov.originalKboTeamId].shortName : '자유'}) 복귀 가능`;
        }
        ov.transferHistory.unshift({
          date: isoDate,
          season: career.season,
          eventType: '방출',
          fromClub: `${oldClub} (MLB)`,
          toClub: 'FA/방출',
          fromLeague: 'MLB',
          toLeague: 'FA/방출',
          note: `마이너 옵션 소진 후 DFA 방출 (${verdict.reason})`,
        });
        pushOverseasNews(career, {
          date: isoDate,
          category: 'MLB소식',
          headline: `[해외파 방출] ${ov.name}, ${oldClub}에서 방출 · 거취 주목`,
          body: `${ov.name}(${ov.position}) 선수가 ${oldClub}에서 방출되어 자유계약 신분이 되었습니다. ${ov.returnRestrictionNote}`,
          isHighlight: true,
        });
      }
      continue;
    }

    // 7월 트레이드 마감 기간 AI 구단 간 트레이드 (14일 주기 약 3.5%)
    if (monthNum === 7 && rng.next() < 0.035) {
      const candidates = MLB_30_CLUBS_SEED.filter((c) => c.clubName !== ov.clubName);
      const newClub = rng.pick(candidates).clubName;
      const oldClub = ov.clubName;
      ov.clubName = newClub;
      ov.rosterCompetition = inferClubRosterCompetition(newClub);
      ov.currentSeasonStats.clubName = newClub;
      if (ov.seasonStatsByLevel?.[activeLevel]) {
        ov.seasonStatsByLevel[activeLevel]!.clubName = newClub;
      }
      ov.transferHistory.unshift({
        date: isoDate,
        season: career.season,
        eventType: '트레이드',
        fromClub: `${oldClub} (${ov.league})`,
        toClub: `${newClub} (${ov.league})`,
        fromLeague: ov.league,
        toLeague: ov.league,
        note: `MLB 트레이드 마감 이적 (${oldClub} → ${newClub})`,
      });
      pushOverseasNews(career, {
        date: isoDate,
        category: 'MLB소식',
        headline: `[해외파 트레이드] ${ov.name}, ${oldClub} → ${newClub} 이적`,
        body: `${ov.name}(${ov.league} · ${ov.position}) 선수가 트레이드를 통해 ${newClub}으로 이적했습니다.`,
      });
    }
  }
}

/**
 * 시즌 전환 시 각 리그별 시즌 성적(seasonStatsByLevel)을 seasonHistory에 분리 아카이브하고 새 시즌 초기화
 */
export function archiveOverseasSeasonByLevelInPlace(
  ov: OverseasPlayerRecord,
  newSeason: number
): void {
  ensureOverseasProgressionFieldsInPlace(ov, newSeason - 1);
  const byLevel = ov.seasonStatsByLevel ?? {};
  const playedLevels = (Object.keys(byLevel) as OverseasLeagueLevel[])
    .filter((lv) => (byLevel[lv]?.g ?? 0) > 0)
    .sort((a, b) => {
      const ia = OVERSEAS_6_TIER_LADDER.indexOf(normalizeOverseasLeagueLevel(a) as OverseasCanonicalTier);
      const ib = OVERSEAS_6_TIER_LADDER.indexOf(normalizeOverseasLeagueLevel(b) as OverseasCanonicalTier);
      return ib - ia;
    });

  if (playedLevels.length > 0) {
    for (const lv of playedLevels) {
      ov.seasonHistory.unshift({ ...byLevel[lv]! });
    }
  } else if (ov.currentSeasonStats && ov.currentSeasonStats.g > 0) {
    ov.seasonHistory.unshift({ ...ov.currentSeasonStats });
  }

  // 새 시즌용 초기화 (careerStatsByLevel은 영구 누적 유지!)
  const normLeague = normalizeOverseasLeagueLevel(ov.league);
  ov.league = normLeague;
  ov.seasonStatsByLevel = {};
  if (normLeague !== 'FA/방출') {
    ov.seasonStatsByLevel[normLeague] = createEmptyLevelStatLine(newSeason, normLeague, ov.clubName, ov.role);
  }
  ov.currentSeasonStats = createEmptyLevelStatLine(newSeason, normLeague, ov.clubName, ov.role);
  ov.rehabFromLeague = undefined;
  ov.rehabGamesRemaining = undefined;
  if (ov.status === '재활경기' || ov.status === '부상자명단') {
    ov.status = '현역';
    ov.injuryDaysRemaining = 0;
  }
}
