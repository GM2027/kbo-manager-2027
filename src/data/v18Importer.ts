import rawV18Dataset from './v18RecalibratedData.json';
import {
  CareerBatterStats,
  CareerPitcherStats,
  CareerSave,
  Coach,
  MilitaryStatus,
  Player,
  PlayerTeamHistoryEntry,
  Position,
  TeamId,
  TeamState,
  V18EvaluationMeta,
  V18SeasonStatRecord,
} from '../types/kbo';
import {
  calculateKoreanFullAge,
  parseIsoDate,
  syncAllAgesToDateInPlace,
} from '../engine/ageEngine';
import { isMilitaryResolved, isMilitaryServing } from '../engine/militaryEngine';
import {
  ALL_FIELD_POSITIONS,
  ALL_HITTER_LINEUP_POSITIONS,
  ensurePlayerPositionProficiencyInPlace,
  getPositionProficiency,
} from '../engine/positionEngine';
import { reconcileAllTeamsLineupPositionsInPlace } from '../engine/lineupValidationEngine';
import { syncSeasonRookieEligibilityInPlace } from '../engine/kboAwardsEngine';
import {
  ensureCareerOotpRatingsInPlace,
  ensurePlayerOotpRatingsInPlace,
} from '../engine/ootpRatingsEngine';
import { buildVerifiedOverseasBaseline } from './amateurAndOverseasData';
import {
  VERIFIED_SANGMU_BIRTHDATES_BY_KEY,
  VERIFIED_ULSAN_BIRTHDATES_BY_ID,
} from './specialFuturesRosters';
import { emptyBatterStats, emptyPitcherStats } from '../engine/stats';
import { buildInitialCoachesForMode } from './coachesData';
import {
  DRAFT_ORDER_2026,
  INITIAL_VIRTUAL_DRAFT_ORDER_2028,
  KBO_TEAMS,
  normalizeChampionHistory,
  TEAM_IDS,
} from './kboTeams';
import {
  REAL_KBO_HITTER_POSITIONS,
  REAL_PLAYER_DRAFT_INFO,
  resolveRealForeignNationality,
  sanitizePlayerAgeAndServiceYearsInPlace,
} from './playerMetadata';
import {
  BASELINE_2027_ROOKIE_BONUS_TOP10,
  findRealPlayerClubProfile,
  VERIFIED_2027_ROOKIE_BONUSES_BY_ID,
} from './realKboHistories';

export const KBO_2027_MIN_SALARY_BILLION = 0.33; // 2027 개정 KBO 규정: 최저 연봉 3,300만 원
export const KBO_2026_MIN_SALARY_BILLION = 0.3;

export function getKboMinSalaryBillion(season: number): number {
  return season >= 2027 ? KBO_2027_MIN_SALARY_BILLION : KBO_2026_MIN_SALARY_BILLION;
}

interface RawV18Player {
  id: string;
  name: string;
  team: string;
  position: string;
  primary_position?: string;
  pitch_role?: Player['pitchRole'];
  secondary_positions?: string[];
  position_proficiency?: Record<string, number>;
  jersey: string | null;
  level_2026: number | null;
  status: string;
  fa_approved_2027: boolean;
  fa_grade_2027?: 'A' | 'B' | 'C' | null;
  kbo_player_id?: string | null;
  career_by_year?: V18SeasonStatRecord[];
  futures_2026?: {
    season: number;
    kind: 'batting' | 'pitching' | string;
    team?: string;
    source?: string;
    scope?: string;
    values: Record<string, number>;
  } | null;
  foreign_meta_2026?: {
    nationality: string | null;
    salary_usd: number | null;
    signing_bonus_usd: number | null;
    entry_history: number | null;
  } | null;
  foreign_slot: string | null;
  draft_round: number | null;
  draft_pick: number | null;
  draft_year?: number | null;
  draft_method?: string | null;
  draft_rank_label?: string | null;
  debut_year?: number | null;
  school?: string | null;
  birth_date: string | null;
  bats: string | null;
  throws: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  salary_krw: number | null;
  contract_end_year: number | null;
  previous_league_club?: string | null;
  published_contract?: {
    start_year: number | null;
    end_year: number | null;
    source?: string;
  } | null;
  fa_notice_2027?: {
    qualification: string | null;
    recognized_years: number | null;
    grade: 'A' | 'B' | 'C' | null;
    approval_status: string | null;
    source?: string;
  } | null;
  retired_after_2026?: boolean;
  retired_date?: string;
  retired_note?: string;
  released_after_2026?: boolean;
  release_date?: string;
  release_note?: string;
  fa_signed_2027?: {
    years: number;
    totalBillion: number;
    annualBillion: number;
    signingBonusBillion: number;
    endYear: number;
    signedDate: string;
    note: string;
    source?: string;
  } | null;
  verified_team_history?: PlayerTeamHistoryEntry[];
  verified_one_club_man?: boolean;
  verified_club_tenure_2027?: number;
  military_verified?: {
    status: MilitaryStatus;
    note?: string;
    enlist_date?: string;
    discharge_date?: string;
    enlisted_season?: number;
    return_season?: number;
    return_round?: number;
    source?: string;
  } | null;
  game_ratings: {
    overall: number;
    potential: number;
    batting: Player['v18Ratings'] extends infer R
      ? R extends { batting: infer B }
        ? B
        : never
      : never;
    pitching: Player['v18Ratings'] extends infer R
      ? R extends { pitching: infer P }
        ? P
        : never
      : never;
    fitness?: number;
    morale?: number;
  };
  evaluation_v18: V18EvaluationMeta;
  rebalance_v19?: {
    prev_ovr: number;
    prev_pot: number;
    new_ovr: number;
    new_pot: number;
    ovr_delta: number;
    pot_delta: number;
    tier: string;
    reason: string;
  };
  rebalance_v27?: {
    prev_ovr: number;
    prev_pot: number;
    new_ovr: number;
    new_pot: number;
    ovr_delta: number;
    pot_delta: number;
    tier: string;
    bounce_back_eligible?: boolean;
    reason: string;
  };
}

interface RawV18Dataset {
  version: string;
  verifiedAt?: string;
  generatedFrom: string;
  playerCount: number;
  officialRosterCount: number;
  draftCandidates2027: number;
  kboOfficialIdCount?: number;
  playersWithCareerHistory?: number;
  totalCareerSeasonRows?: number;
  verifiedFutures2026Count?: number;
  players: RawV18Player[];
}

const V18_DATA = rawV18Dataset as unknown as RawV18Dataset;

const V18_TEAM_MAP: Record<string, TeamId> = {
  LG: 'LG',
  HH: '한화',
  SSG: 'SSG',
  SS: '삼성',
  NC: 'NC',
  KT: 'KT',
  LT: '롯데',
  HT: 'KIA',
  OB: '두산',
  WO: '키움',
};

function parseIpToOuts(ipStr?: string): number {
  if (!ipStr) return 0;
  const trimmed = ipStr.trim();
  const fracMatch = trimmed.match(/^(\d+)\s+(\d)\/3$/);
  if (fracMatch) {
    return Number(fracMatch[1]) * 3 + Number(fracMatch[2]);
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return 0;
  const whole = Math.floor(num);
  const rem = Math.round((num - whole) * 10);
  if (rem === 1 || rem === 2) return whole * 3 + rem;
  return Math.round(num * 3);
}

function inferDrafted2027UnverifiedBirthYear(raw: RawV18Player): number {
  const school = raw.school ?? '';
  // 4년제 대학 졸업 예정자 (2004년생 기준)
  if (/(연세대|고려대|성균관대|한양대|동국대|경희대|중앙대|건국대|단국대|인하대|홍익대|원광대|동의대|영남대)/.test(school)) {
    return 2004;
  }
  // 2년제 전문대 졸업 예정자 (2006년생 기준)
  if (/(과학기술대|동의과학대|동원과학기술대|강릉영동대|김포대|여주대|동강대|수성대)/.test(school)) {
    return 2006;
  }
  // 고교 졸업 예정자 (2008년생 기준)
  return 2008;
}

function computeAgeFor2027(
  raw: RawV18Player,
  referenceIsoDate: string = '2027-01-01'
): { age: number; birthYear: number; birthDate: string | null } {
  // 1) 공식 확인된 생년월일(YYYY-MM-DD)이 있으면 게임 시작 날짜(2027-01-01) 기준 정확한 만 나이 산출
  if (raw.birth_date && parseIsoDate(raw.birth_date)) {
    const by = Number(raw.birth_date.slice(0, 4));
    const exactAge = calculateKoreanFullAge(raw.birth_date, referenceIsoDate);
    if (exactAge !== null) {
      return { age: exactAge, birthYear: by, birthDate: raw.birth_date };
    }
  }
  // 2) 미확인 2027 실제 신인: 생년월일은 임의 생성하지 않고 null('미확인') 유지, 학제 기반 출생연도만 참고
  if (raw.status === 'drafted_2027') {
    const by = inferDrafted2027UnverifiedBirthYear(raw);
    return { age: Math.max(18, 2027 - by), birthYear: by, birthDate: null };
  }
  // 3) 기타 미확인 케이스도 임의 생년월일 생성 금지 (null 유지)
  const evalAge = raw.evaluation_v18?.age_used;
  if (typeof evalAge === 'number' && Number.isFinite(evalAge) && evalAge >= 18 && evalAge <= 46) {
    const age2027 = Math.min(45, Math.max(19, Math.round(evalAge) + 1));
    return { age: age2027, birthYear: 2027 - age2027, birthDate: null };
  }
  const est = raw.level_2026 === 1 ? 27 : 23;
  return { age: est, birthYear: 2027 - est, birthDate: null };
}

function computeRecent3YrScore(
  records: V18SeasonStatRecord[],
  role: '투수' | '타자',
  fallbackOvr: number
): number {
  if (!records || records.length === 0) return Math.max(30, Math.min(95, fallbackOvr));
  const weights: Record<number, number> = { 2026: 0.5, 2025: 0.32, 2024: 0.18 };
  let totalW = 0;
  let weightedSum = 0;
  for (const r of records) {
    const w = weights[r.season] ?? 0.12;
    let sScore = fallbackOvr;
    if (role === '타자') {
      const avg = typeof r.AVG === 'number' && Number.isFinite(r.AVG) ? r.AVG : 0.255;
      const ops =
        typeof r.OPS === 'number' && Number.isFinite(r.OPS)
          ? r.OPS
          : avg * 2.65 + ((r.HR ?? 0) / Math.max(40, r.PA ?? 150)) * 2.2;
      const pa = r.PA ?? r.AB ?? 0;
      const exposureFactor = Math.min(1, Math.max(0.35, pa / 350));
      sScore = Math.round(
        Math.max(38, Math.min(98, 52 + (ops - 0.72) * 115 + (avg - 0.265) * 85)) *
          (0.65 + 0.35 * exposureFactor)
      );
    } else {
      const era = typeof r.ERA === 'number' && Number.isFinite(r.ERA) ? r.ERA : 4.65;
      const whip = typeof r.WHIP === 'number' && Number.isFinite(r.WHIP) ? r.WHIP : 1.42;
      const outs = parseIpToOuts(r.IP);
      const exposureFactor = Math.min(1, Math.max(0.35, outs / 180));
      sScore = Math.round(
        Math.max(38, Math.min(98, 72 + (4.4 - era) * 9.5 + (1.38 - whip) * 22)) *
          (0.65 + 0.35 * exposureFactor)
      );
    }
    weightedSum += sScore * w;
    totalW += w;
  }
  if (totalW <= 0) return Math.max(30, Math.min(95, fallbackOvr));
  return Math.max(35, Math.min(98, Math.round(weightedSum / totalW)));
}

function buildHistoricalCareerStats(
  records: V18SeasonStatRecord[],
  role: '투수' | '타자'
): CareerBatterStats | CareerPitcherStats | undefined {
  if (!records || records.length === 0) return undefined;
  const distinctSeasonCount = new Set(records.map((r) => r.season)).size;
  if (role === '타자') {
    const agg: CareerBatterStats = {
      seasons: distinctSeasonCount,
      G: 0,
      PA: 0,
      AB: 0,
      H: 0,
      HR: 0,
      RBI: 0,
      R: 0,
      BB: 0,
      SB: 0,
    };
    for (const r of records) {
      agg.G += r.G ?? 0;
      agg.PA = (agg.PA ?? 0) + (r.PA ?? (r.AB ?? 0) + (r.BB ?? 0));
      agg.AB += r.AB ?? 0;
      agg.H += r.H ?? 0;
      agg.HR += r.HR ?? 0;
      agg.RBI += r.RBI ?? 0;
      agg.R += r.R ?? 0;
      agg.BB += r.BB ?? 0;
      agg.SB += r.SB ?? 0;
    }
    return agg;
  }
  const agg: CareerPitcherStats = {
    seasons: distinctSeasonCount,
    G: 0,
    outs: 0,
    W: 0,
    L: 0,
    SV: 0,
    HLD: 0,
    SO: 0,
    ER: 0,
    BB: 0,
    H: 0,
  };
  for (const r of records) {
    agg.G += r.G ?? 0;
    agg.outs += parseIpToOuts(r.IP);
    agg.W += r.W ?? 0;
    agg.L += r.L ?? 0;
    agg.SV += r.SV ?? 0;
    agg.HLD += r.HLD ?? 0;
    agg.SO += r.SO ?? 0;
    agg.ER += r.ER ?? 0;
    agg.BB += r.BB ?? 0;
    agg.H += r.H ?? 0;
  }
  return agg;
}

/**
 * 2027 실존 포지션 교정 및 전담 지명타자(DH) 포지션 매핑
 * - 힐리어드(KT): 외야수(LF 주포지션 · CF/RF 멀티, 1B 보조)
 * - 강백호(한화), 최형우(삼성), 김현수(KT), 김재환(SSG), 전준우(롯데): 전담 지명타자(DH) 주포지션
 */
const REAL_KBO_2027_POSITION_OVERRIDES: Record<
  string,
  {
    position: Position;
    secondaryPositions: Position[];
    positionProficiency: Partial<Record<Position, number>>;
  }
> = {
  'KT::힐리어드': {
    position: 'LF',
    secondaryPositions: ['CF', 'RF', '1B'],
    positionProficiency: { LF: 88, CF: 84, RF: 84, '1B': 64, DH: 88 },
  },
  '한화::강백호': {
    position: 'DH',
    secondaryPositions: ['1B', 'RF', 'C'],
    positionProficiency: { DH: 96, '1B': 72, RF: 68, C: 60 },
  },
  '삼성::최형우': {
    position: 'DH',
    secondaryPositions: ['LF'],
    positionProficiency: { DH: 97, LF: 68, '1B': 52 },
  },
  'KT::김현수': {
    position: 'DH',
    secondaryPositions: ['LF', '1B'],
    positionProficiency: { DH: 95, LF: 72, '1B': 68 },
  },
  'SSG::김재환': {
    position: 'DH',
    secondaryPositions: ['LF', '1B'],
    positionProficiency: { DH: 95, LF: 68, '1B': 60 },
  },
  '롯데::전준우': {
    position: 'DH',
    secondaryPositions: ['LF', '1B'],
    positionProficiency: { DH: 94, LF: 72, '1B': 66 },
  },
};

function findVerifiedPositionOverride(teamId: TeamId, name: string) {
  const clean = name.replace(/\s+/g, '');
  return (
    REAL_KBO_2027_POSITION_OVERRIDES[`${teamId}::${clean}`] ??
    REAL_KBO_2027_POSITION_OVERRIDES[`${teamId}::${name}`] ??
    (clean === '힐리어드' || clean === '샘힐리어드'
      ? REAL_KBO_2027_POSITION_OVERRIDES['KT::힐리어드']
      : clean === '강백호'
      ? REAL_KBO_2027_POSITION_OVERRIDES['한화::강백호']
      : clean === '최형우'
      ? REAL_KBO_2027_POSITION_OVERRIDES['삼성::최형우']
      : clean === '김재환'
      ? REAL_KBO_2027_POSITION_OVERRIDES['SSG::김재환']
      : clean === '전준우'
      ? REAL_KBO_2027_POSITION_OVERRIDES['롯데::전준우']
      : undefined)
  );
}

function inferConcretePosition(
  raw: RawV18Player,
  teamId: TeamId,
  ifCounter: number,
  ofCounter: number
): {
  role: '투수' | '타자';
  position: Position;
  secondaryPositions?: Position[];
  positionProficiency?: Partial<Record<Position, number>>;
} {
  const posRaw = (raw.position || '').toUpperCase();
  const explicitPrimary = raw.primary_position as Position | undefined;
  const cleanName = /^[가-힣\s]+$/.test(raw.name) ? raw.name.replace(/\s+/g, '') : raw.name;

  if (posRaw === 'P' || explicitPrimary === 'SP' || explicitPrimary === 'RP' || explicitPrimary === 'CL') {
    return { role: '투수', position: explicitPrimary === 'RP' || explicitPrimary === 'CL' ? explicitPrimary : 'SP' };
  }

  const verifiedOverride = findVerifiedPositionOverride(teamId, cleanName);
  if (verifiedOverride) {
    return {
      role: '타자',
      position: verifiedOverride.position,
      secondaryPositions: [...verifiedOverride.secondaryPositions],
      positionProficiency: { ...verifiedOverride.positionProficiency },
    };
  }

  const validSec = Array.isArray(raw.secondary_positions)
    ? (raw.secondary_positions.filter((sp): sp is Position =>
        ALL_FIELD_POSITIONS.includes(sp as Position)
      ) as Position[])
    : undefined;
  const explicitProf = raw.position_proficiency
    ? ({ ...raw.position_proficiency } as Partial<Record<Position, number>>)
    : undefined;

  if (explicitPrimary && (ALL_FIELD_POSITIONS.includes(explicitPrimary) || explicitPrimary === 'DH')) {
    return {
      role: '타자',
      position: explicitPrimary,
      secondaryPositions: validSec?.filter((sp) => sp !== explicitPrimary),
      positionProficiency: explicitProf,
    };
  }

  if (posRaw === 'TWP') {
    // 투타겸업(TWP): 세부 능력치 비교로 주포지션 결정
    const off = raw.game_ratings?.batting?.overall_offense ?? 0;
    const pit = raw.game_ratings?.pitching?.overall_pitching ?? 0;
    if (pit >= off) return { role: '투수', position: 'SP' };
    return { role: '타자', position: 'RF', secondaryPositions: ['LF', '1B'], positionProficiency: explicitProf };
  }
  if (posRaw === 'C') {
    return { role: '타자', position: 'C', secondaryPositions: validSec, positionProficiency: explicitProf };
  }
  const teamPosMap = REAL_KBO_HITTER_POSITIONS[teamId];
  const known = teamPosMap?.[cleanName]?.position ?? teamPosMap?.[raw.name]?.position;
  if (known) {
    return { role: '타자', position: known, secondaryPositions: validSec, positionProficiency: explicitProf };
  }
  if (posRaw === 'IF') {
    const cycle: Position[] = ['SS', '3B', '2B', '1B'];
    return { role: '타자', position: cycle[ifCounter % cycle.length], secondaryPositions: validSec, positionProficiency: explicitProf };
  }
  if (posRaw === 'OF') {
    const cycle: Position[] = ['CF', 'RF', 'LF'];
    return { role: '타자', position: cycle[ofCounter % cycle.length], secondaryPositions: validSec, positionProficiency: explicitProf };
  }
  return { role: '타자', position: 'DH', secondaryPositions: validSec, positionProficiency: explicitProf };
}

function estimateDomesticSalaryBillion(raw: RawV18Player, ovr: number, age: number): number {
  if (typeof raw.salary_krw === 'number' && Number.isFinite(raw.salary_krw) && raw.salary_krw > 0) {
    return Math.max(
      KBO_2027_MIN_SALARY_BILLION,
      Math.round((raw.salary_krw / 1e8) * 100) / 100
    );
  }
  if (raw.status === 'drafted_2027') return KBO_2027_MIN_SALARY_BILLION;
  if (ovr >= 84) return Math.round((8.5 + (ovr - 84) * 1.4) * 10) / 10;
  if (ovr >= 78) return Math.round((4.0 + (ovr - 78) * 0.7) * 10) / 10;
  if (ovr >= 72) return Math.round((1.8 + (ovr - 72) * 0.35) * 10) / 10;
  if (ovr >= 65) return Math.round((0.8 + (ovr - 65) * 0.14) * 100) / 100;
  if (age >= 27) return 0.55;
  return KBO_2027_MIN_SALARY_BILLION;
}

function assignForeignAdaptationProfile(ovr: number, seedHash: number): Player['foreignAdaptationProfile'] {
  const roll = Math.abs(seedHash) % 100;
  if (ovr >= 76 && roll < 38) return '빠른적응';
  if (roll < 72) return '표준';
  if (roll < 90) return '기복';
  return '적응난항';
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 전체 선수단의 OVR <= POT 불변식 및 ID 유일성 보장.
 * v18 데이터 적용, 성장/노쇠화, 세이브 로드 등 모든 시점에서 안전하게 호출 가능.
 */
export function enforceOvrPotInvariantInPlace(players: Record<string, Player>): void {
  for (const p of Object.values(players)) {
    if (!Number.isFinite(p.ability)) p.ability = 50;
    if (!Number.isFinite(p.potential)) p.potential = p.ability;
    p.potential = Math.max(1, Math.min(99, Math.round(p.potential)));
    p.ability = Math.max(1, Math.min(p.potential, Math.round(p.ability)));
    if (p.v18Ratings) {
      p.v18Ratings.potential = Math.max(p.v18Ratings.overall, Math.min(99, p.v18Ratings.potential));
      p.v18Ratings.overall = Math.min(p.v18Ratings.overall, p.v18Ratings.potential);
    }
    ensurePlayerOotpRatingsInPlace(p);
  }
}

const V18_BY_SOURCE_ID: Map<string, RawV18Player> = new Map(
  V18_DATA.players.map((p) => [String(p.id).trim(), p])
);

/**
 * v18 DB에서 2024~2026 최근 3년치만 수록되었거나(이적/특수 이력) 과거 1군 기록이 일부 누락된
 * 실존 베테랑·군필 선수의 2027시즌 개막 전(2026 종료 기준) 실제 KBO 1군 인정 연차 보정 테이블
 */
const VERIFIED_2027_SERVICE_YEARS_BY_KEY: Record<string, number> = {
  'LG::이민호': 4, // 2020 입단, 2020~2022 1군 + 2023 부상 + 2024~2025 사회복무요원 + 2026 복귀
  'LG::이재원': 5, // 2018 입단, 2020~2023 1군 + 2024~2025 상무 + 2026 복귀
  'LG::최지명': 6, // 최채흥 개명, 2018 대졸 입단, 상무 군필
  'LG::김민수': 9, // 2014 대졸 입단 포수, 군필
  'LG::장시환': 15, // 2007 입단 베테랑 투수
  'LG::김정율': 2, // 2017 입단, 주로 2군
  '한화::강백호': 9, // 2018 입단, 2018~2026 9시즌
  '한화::정이황': 1, // 2019 입단, 주로 2군
  'SSG::김재환': 15, // 2008 입단, 2016~2026 주전 포함
  'SSG::최정': 22, // 2005 입단, 2005~2026 22시즌
  '삼성::최형우': 20, // 2002 입단, 2008~2026 주전 + 2002/2004
  '삼성::김태훈(투)': 11, // 2012 입단, 2015~2026 1군
  '삼성::이승현(우)': 12, // 2010 입단, 2015~2026 1군
  '삼성::이승현(좌)': 6, // 2021 입단, 2021~2026 1군 6시즌
  '삼성::김태훈(타)': 5, // 2015 입단, 1군 백업/2군
  'KT::한승혁': 12, // 2011 입단, 군필
  'KT::김현수': 19, // 2006 입단, KBO 2006~2015(10) + 2018~2026(9)
  'KT::최원준': 9, // 2016 입단, 상무(2022~2023) 제외 9시즌
  'KIA::이태양': 13, // 2010 입단, 2012~2026 1군
  '롯데::김영준': 2, // 1999년생, 주로 2군/군필
  '키움::장재영': 4, // 2021 입단, 부상/투타전향
  '키움::이주형': 4, // 2020 입단, 군필 후 2023~2026 1군
};

/**
 * 2027시즌 개막 전(2027-01-01, 2026시즌 완료 기준) 실제 KBO 1군 인정 연차(serviceYears)를 산출합니다.
 * - 기존 clubTenureSeasons(구단 근속 +1 포함) 오용으로 발생하던 25세 8년차·26세 9년차·이적 베테랑 저연차 오류를 근본 해결
 * - 2027 신인 = 0년, 외국인/아시아쿼터 = 실제 KBO 1군 완료 시즌 수
 * - 국내 선수 = career_by_year 1군 출장량 기반 KBO 145일 인정 연차 환산 + 입단연도/생년월일 물리 상한 준수
 */
export function computeRealisticServiceYears2027(
  raw: RawV18Player,
  teamId: TeamId,
  role: '투수' | '타자',
  birthYear: number,
  birthDate: string | null,
  historicalSeasons: V18SeasonStatRecord[]
): number {
  const isDrafted2027 = raw.status === 'drafted_2027' || raw.draft_year === 2027;
  if (isDrafted2027) return 0;

  // 외국인 / 아시아쿼터: 실제 KBO 1군 완료 시즌 수 (<= 2026)
  if (raw.foreign_slot) {
    const kboSeasons = new Set(
      historicalSeasons
        .filter((r) => typeof r.season === 'number' && r.season >= 2000 && r.season <= 2026)
        .map((r) => r.season)
    );
    return kboSeasons.size;
  }

  // 물리적·규정상 가능한 최대 완료 시즌 상한 (2027-01-01 기준)
  const birthMonth =
    birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? Number(birthDate.slice(5, 7)) : 6;
  const isEarlyBorn = birthMonth <= 2; // 빠른 년생 조기입학 허용
  const maxByBirthStrict = Math.max(0, 2027 - (birthYear + (isEarlyBorn ? 18 : 19)));
  const maxByBirthLoose = Math.max(0, 2027 - (birthYear + 18));

  const realDraftInfo = REAL_PLAYER_DRAFT_INFO[raw.name];
  const safeRealDraftYear =
    realDraftInfo?.draftYear && realDraftInfo.draftYear >= birthYear + 17
      ? realDraftInfo.draftYear
      : undefined;
  const effDraftYear = raw.draft_year ?? safeRealDraftYear;

  const hardMax =
    typeof effDraftYear === 'number' && effDraftYear >= 1995 && effDraftYear <= 2027
      ? Math.min(maxByBirthLoose, Math.max(0, 2027 - effDraftYear))
      : maxByBirthStrict;

  // 1) 부분 기록/특수 이력 실존 베테랑 검증 오버라이드
  const overrideKey = `${teamId}::${raw.name}`;
  if (VERIFIED_2027_SERVICE_YEARS_BY_KEY[overrideKey] !== undefined) {
    return Math.max(0, Math.min(hardMax, VERIFIED_2027_SERVICE_YEARS_BY_KEY[overrideKey]));
  }

  // 2) 공식 연도별 1군 기록(career_by_year) 기반 KBO 인정 연차(145일=1시즌 근사) 합산
  const bySeason = new Map<number, { g: number; pa: number; outs: number }>();
  for (const r of historicalSeasons) {
    if (typeof r.season !== 'number' || r.season < 2000 || r.season > 2026) continue;
    const prev = bySeason.get(r.season) ?? { g: 0, pa: 0, outs: 0 };
    const g = Number(r.G ?? 0);
    const pa = Number(r.PA ?? r.AB ?? 0);
    const outs = parseIpToOuts(r.IP);
    bySeason.set(r.season, {
      g: prev.g + (Number.isFinite(g) ? g : 0),
      pa: prev.pa + (Number.isFinite(pa) ? pa : 0),
      outs: prev.outs + outs,
    });
  }

  let totalCredit = 0;
  for (const { g, pa, outs } of bySeason.values()) {
    if (role === '타자') {
      if (g >= 55 || pa >= 150) totalCredit += 1.0;
      else if (g >= 30 || pa >= 70) totalCredit += 0.75;
      else if (g >= 12 || pa >= 25) totalCredit += 0.4;
      else if (g >= 1) totalCredit += 0.15;
    } else {
      if (g >= 24 || outs >= 165) totalCredit += 1.0;
      else if (g >= 12 || outs >= 84) totalCredit += 0.75;
      else if (g >= 5 || outs >= 30) totalCredit += 0.4;
      else if (g >= 1) totalCredit += 0.15;
    }
  }

  let computed = bySeason.size > 0 ? Math.floor(totalCredit + 0.35) : 0;

  // 공식 FA 공시 인정 연차 / 2027 FA 승인 선수 하한 정합성 유지
  if (
    typeof raw.fa_notice_2027?.recognized_years === 'number' &&
    Number.isFinite(raw.fa_notice_2027.recognized_years)
  ) {
    computed = Math.max(computed, Math.round(raw.fa_notice_2027.recognized_years));
  }
  if (raw.fa_approved_2027) {
    computed = Math.max(computed, Math.min(hardMax, 7));
  }

  return Math.max(0, Math.min(hardMax, computed));
}

function getDatabaseVersionRank(ver?: string): number {
  switch (ver) {
    case 'v30_hilliard_of_and_dh_position':
      return 30;
    case 'v29_realistic_service_years':
      return 29;
    case 'v28_ootp_detailed_ratings':
      return 28;
    case 'v27_unified_player_ratings':
      return 27;
    case 'v26_feedback_roles_military_fa':
      return 26;
    case 'v25_verified_positions_and_fa_compensation':
      return 25;
    case 'v24_recalibrated_prospect_potentials':
      return 24;
    case 'v23_go_woosuk_kbo_return':
      return 23;
    case 'v22_verified_birthdates':
      return 22;
    case 'v21_verified_career_histories':
      return 21;
    case 'v20_verified_player_db':
      return 20;
    case 'v19_unified_rebalance':
      return 19;
    case 'v18_recalibrated':
      return 18;
    default:
      return 0;
  }
}

export function sanitizeCareerOvrPotInPlace(career: CareerSave): void {
  const initialDbRank = getDatabaseVersionRank(career.databaseVersion);

  // 기존 v18 2027 세이브 로드 시 계약·경기 기록·로스터를 100% 유지하면서 v19 통합 능력치 척도로 1회 안전 마이그레이션
  if (
    !career.isPreservedMaster &&
    career.season >= 2027 &&
    initialDbRank === 18
  ) {
    for (const p of Object.values(career.players)) {
      const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
      if (!src || !src.rebalance_v19) continue;
      // 기존 세이브에서 이미 진행된 시즌 성장/노쇠화 변동분(p.ability - prev_ovr)을 보존하며 새 척도 반영
      const liveDelta = p.ability - src.rebalance_v19.prev_ovr;
      const nextPot = Math.max(1, Math.min(99, src.rebalance_v19.new_pot));
      const nextOvr = Math.max(35, Math.min(nextPot, src.rebalance_v19.new_ovr + liveDelta));
      p.ability = nextOvr;
      p.potential = Math.max(nextOvr, nextPot);
      p.v18Ratings = {
        overall: p.ability,
        potential: p.potential,
        batting: src.game_ratings?.batting ?? null,
        pitching: src.game_ratings?.pitching ?? null,
      };
      p.rebalanceMeta = {
        prevOvr: src.rebalance_v19.prev_ovr,
        prevPot: src.rebalance_v19.prev_pot,
        newOvr: src.rebalance_v19.new_ovr,
        newPot: src.rebalance_v19.new_pot,
        ovrDelta: src.rebalance_v19.ovr_delta,
        potDelta: src.rebalance_v19.pot_delta,
        tier: src.rebalance_v19.tier,
        reason: src.rebalance_v19.reason,
      };
    }
    career.databaseVersion = 'v19_unified_rebalance';
  }

  enforceOvrPotInvariantInPlace(career.players);

  // v20 실제 KBO 선수 정보 검증 패치 1회 안전 마이그레이션
  // - 진행 중인 세이브의 선수 이동(teamId), 계약, 경기 성적, 게임 내 병역 진행(militaryChangedInGame)은 100% 보존
  // - 과거 기본값 버그로 '미필' 또는 미지정이었던 실존 군필·예술체육요원·외국인·미확인 선수의 병역 및 프로필만 안전 보정
  for (const p of Object.values(career.players)) {
    const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
    if (src) {
      if (!p.originType) p.originType = 'real';
      if (p.birthDate === undefined) p.birthDate = src.birth_date ?? null;
      if (p.heightCm === undefined) p.heightCm = src.height_cm ?? null;
      if (p.weightKg === undefined) p.weightKg = src.weight_kg ?? null;
      if (p.bats === undefined) {
        p.bats = src.bats === 'L' || src.bats === 'R' || src.bats === 'S' ? src.bats : null;
      }
      if (p.throws === undefined) {
        p.throws = src.throws === 'L' || src.throws === 'R' ? src.throws : null;
      }
      if (p.school === undefined) p.school = src.school ?? null;
      if (p.debutYear === undefined) p.debutYear = src.debut_year ?? null;
      if (p.draftYear === undefined) p.draftYear = src.draft_year ?? null;

      // 게임 내 병역 이벤트(입대·전역·국대 특례)가 아직 발생하지 않은 실존 선수만 검증된 병역 상태로 보정
      if (!p.militaryChangedInGame && src.military_verified) {
        const verified = src.military_verified;
        const alreadyInGameServing =
          isMilitaryServing(p.militaryStatus) &&
          typeof p.militaryEnlistedSeason === 'number' &&
          p.militaryEnlistedSeason >= 2027;
        const alreadyInGameCompleted =
          p.militaryStatus === '군필' &&
          (verified.status === '미필' || verified.status === '복무 중' || verified.status === '미확인');

        if (!alreadyInGameServing && !alreadyInGameCompleted) {
          p.militaryStatus = verified.status;
          p.militaryNote = verified.note;
          if (verified.enlist_date) p.militaryEnlistDate = verified.enlist_date;
          if (verified.discharge_date) p.militaryDischargeDate = verified.discharge_date;
          if (verified.enlisted_season !== undefined && p.militaryEnlistedSeason === undefined) {
            p.militaryEnlistedSeason = verified.enlisted_season;
          }
          if (verified.return_season !== undefined && p.militaryReturnSeason === undefined) {
            p.militaryReturnSeason = verified.return_season;
          }
          if (verified.return_round !== undefined && p.militaryReturnRound === undefined) {
            p.militaryReturnRound = verified.return_round;
          }
          p.dataVerification = {
            verifiedAt: V18_DATA.verifiedAt,
            militarySource: verified.source,
            bioSource: 'KBO 공식 등록·드래프트 아카이브',
          };
        }
      }
    } else if (p.category !== '국내') {
      p.militaryStatus = '해당 없음';
      if (!p.militaryNote) p.militaryNote = '외국인/아시아쿼터 선수 (병역 해당 없음)';
    } else if (!p.militaryStatus) {
      p.militaryStatus = '미확인';
    } else if (p.militaryStatus === '상무복무') {
      p.militaryStatus = '복무 중';
    }

    if (p.category === '국내') {
      if (!p.nationality) p.nationality = '한국';
    } else {
      const resolved = resolveRealForeignNationality(p.name, p.category, p.nationality);
      if (
        !p.nationality ||
        p.nationality === '아시아쿼터' ||
        p.nationality === '외국인' ||
        p.nationality === '도미니카' ||
        (p.name === '테일러' && p.nationality === '미국')
      ) {
        p.nationality = resolved;
      }
      if (p.militaryStatus !== '해당 없음') {
        p.militaryStatus = '해당 없음';
      }
    }
  }

  if (
    !career.isPreservedMaster &&
    career.season >= 2027 &&
    (!career.rookieBonusRankingsBySeason || !career.rookieBonusRankingsBySeason[2027])
  ) {
    career.rookieBonusRankingsBySeason = {
      ...(career.rookieBonusRankingsBySeason ?? {}),
      2027: BASELINE_2027_ROOKIE_BONUS_TOP10.map((e) => ({ ...e })),
    };
  }

  // 세이브 불러오기·재접속 시에도 한국시리즈 우승 기록 연도 내림차순 정렬 및 중복 제거 영구 보장
  if (career.championHistory && career.championHistory.length > 0) {
    career.championHistory = normalizeChampionHistory(career.championHistory);
  }

  // 아직 진행되지 않은 2028 최초 가상 신인 드래프트가 구버전(2025 역순)으로 저장돼 있었다면 2026 최종 순위 역순으로 안전 보정
  // (이미 완료되었거나 지명이 진행된 드래프트 결과는 절대 변경하지 않음)
  if (
    !career.isPreservedMaster &&
    career.season === 2027 &&
    career.draftState &&
    career.draftState.season === 2028 &&
    !career.draftState.completed &&
    (career.draftState.picks?.length ?? 0) === 0 &&
    Array.isArray(career.draftState.draftOrder) &&
    career.draftState.draftOrder.join(',') === DRAFT_ORDER_2026.join(',')
  ) {
    career.draftState.draftOrder = [...INITIAL_VIRTUAL_DRAFT_ORDER_2028];
    // 기존 tradedDraftPicks를 유지한 채 새 기본 순번으로 지명권 출처를 재동기화
    career.draftState.pickProvenance = undefined;
  }

  if (
    !career.isPreservedMaster &&
    career.season >= 2027 &&
    getDatabaseVersionRank(career.databaseVersion) < 21
  ) {
    const prePatchChangedIds = new Set<string>();
    for (const p of Object.values(career.players)) {
      const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
      if (!src) continue;
      const verifiedTeamId: TeamId = V18_TEAM_MAP[src.team] ?? p.teamId;
      const realHist = findRealPlayerClubProfile(src.name, verifiedTeamId);
      const nextHistorical = buildHistoricalSeasonsFromRaw(src);
      const nextAgg = buildHistoricalCareerStats(nextHistorical, p.role);

      // 과거 시즌 공식 성적(분할 시즌 포함)과 통산 기준선 동기화 (현재 진행 중 2027+ 성적 p.stats는 보존)
      p.historicalSeasons = nextHistorical;
      if (nextAgg) {
        p.careerStats = nextAgg;
        if (p.role === '타자' && 'HR' in nextAgg) {
          p.careerHits = nextAgg.H;
          p.careerHR = nextAgg.HR;
        } else if (p.role === '투수' && 'W' in nextAgg) {
          p.careerWins = nextAgg.W;
          p.careerSO = nextAgg.SO;
        }
      }

      // 게임 내 가상 이적(트레이드·FA·방출)이 이미 발생한 선수는 가상 이동을 100% 보존
      const hasInGameMove =
        Boolean(p.teamHistoryChangedInGame) ||
        Boolean(
          p.careerTeamHistory?.some(
            (h) =>
              h.fromSeason >= 2027 &&
              Boolean(h.note) &&
              /(트레이드|FA 이적|웨이버 영입|자유계약선수 영입|보상선수)/.test(h.note ?? '') &&
              !/(2026-10-27|2026-11-20)/.test(h.note ?? '')
          )
        );

      const { history: verifiedHist, isOneClubMan, clubTenureSeasons } = mergeVerifiedTeamHistory(
        src,
        verifiedTeamId,
        realHist
      );

      if (hasInGameMove) {
        // 과거(<=2026) 이력만 정밀 교정하고 게임 내 2027+ 가상 이적 내역은 뒤에 보존
        const inGameEntries = (p.careerTeamHistory ?? []).filter((h) => h.fromSeason >= 2027);
        if (inGameEntries.length > 0) {
          const basePast = verifiedHist.filter((h) => h.fromSeason <= 2026).map((h) => ({ ...h }));
          const lastPast = basePast[basePast.length - 1];
          if (lastPast && !lastPast.toSeason) {
            lastPast.toSeason = 2026;
          }
          p.careerTeamHistory = [...basePast, ...inGameEntries];
          const distinctClubs = new Set(
            p.careerTeamHistory.map((h) => h.teamId).filter((t): t is TeamId => Boolean(t))
          );
          p.isOneClubMan = p.category === '국내' && distinctClubs.size <= 1;
        }
        continue;
      }

      // 게임 내 가상 이동이 없는 실존 선수: 검증된 2026-11-25 소속 구단·이력·원클럽맨·방출·은퇴·FA 확정 반영
      p.careerTeamHistory = verifiedHist;
      p.isOneClubMan = isOneClubMan;
      p.clubTenureSeasons = clubTenureSeasons;

      if (career.season === 2027) {
        if (p.teamId !== verifiedTeamId && !src.released_after_2026 && !src.retired_after_2026) {
          prePatchChangedIds.add(p.id);
          const oldTeam = career.teams[p.teamId];
          if (oldTeam) {
            oldTeam.lineupOrder = oldTeam.lineupOrder.filter((id) => id !== p.id);
            oldTeam.benchOrder = oldTeam.benchOrder.filter((id) => id !== p.id);
            oldTeam.rotationOrder = oldTeam.rotationOrder.filter((id) => id !== p.id);
            oldTeam.bullpenOrder = oldTeam.bullpenOrder.filter((id) => id !== p.id);
          }
          p.teamId = verifiedTeamId;
        }
        if (src.retired_after_2026 && p.rosterTier !== '은퇴') {
          prePatchChangedIds.add(p.id);
          p.rosterTier = '은퇴';
          p.gameDayActive = false;
        } else if (src.released_after_2026 && p.rosterTier !== 'FA' && p.rosterTier !== '은퇴') {
          prePatchChangedIds.add(p.id);
          p.formerTeamId = verifiedTeamId;
          p.rosterTier = 'FA';
          p.gameDayActive = false;
          p.releasedAfter2026 = true;
          p.releaseDate = src.release_date;
          p.releaseNote = src.release_note;
          p.contract.status = '만료';
          p.contract.yearsRemaining = 0;
          p.contract.note = src.release_note ?? '2026시즌 종료 후 재계약 불가 (방출 · 자유계약)';
        } else if (src.fa_signed_2027 && p.rosterTier === 'FA') {
          const fs = src.fa_signed_2027;
          p.rosterTier = '1군';
          p.gameDayActive = true;
          p.faApproved2027Grade = undefined;
          p.formerTeamId = undefined;
          p.contract = {
            status: '확정',
            currency: 'KRW',
            years: fs.years,
            yearsRemaining: fs.years,
            annualSalary: fs.annualBillion,
            signingBonus: fs.signingBonusBillion,
            totalValue: fs.totalBillion,
            startSeason: 2027,
            endSeason: fs.endYear,
            isFAEligible: false,
            faGrade: null,
            note: fs.note,
          };
        }
      }
    }

    // 방출·은퇴·이적 처리된 선수를 구단 라인업/로테이션에서 정리
    if (prePatchChangedIds.size > 0) {
      for (const tid of TEAM_IDS) {
        const ts = career.teams[tid];
        if (!ts) continue;
        const keepValid = (id: string) => {
          const pl = career.players[id];
          return Boolean(pl && pl.teamId === tid && pl.rosterTier === '1군');
        };
        ts.lineupOrder = ts.lineupOrder.filter(keepValid);
        ts.benchOrder = ts.benchOrder.filter(keepValid);
        ts.rotationOrder = ts.rotationOrder.filter(keepValid);
        ts.bullpenOrder = ts.bullpenOrder.filter(keepValid);
      }
    }
    career.databaseVersion = 'v21_verified_career_histories';
  }

  // v22: 전수 검증된 실제 선수 생년월일(최지만·박종훈 및 KBO 10개 구단/2군/상무/FA/해외파) + 최지만 능력치 보정 + 날짜 기준 만 나이 동기화
  if (!career.isPreservedMaster) {
    const needsV22Patch = getDatabaseVersionRank(career.databaseVersion) < 22;

    if (needsV22Patch) {
      for (const p of Object.values(career.players)) {
        const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
        if (src) {
          if (src.birth_date && parseIsoDate(src.birth_date)) {
            p.birthDate = src.birth_date;
            p.birthYear = Number(src.birth_date.slice(0, 4));
          } else if (src.status === 'drafted_2027' && !p.birthDate) {
            p.birthDate = null;
            p.birthYear = inferDrafted2027UnverifiedBirthYear(src);
          }

          // 최지만(D2027-015): 1991-05-19 생년월일 + 전 MLB 베테랑 실전 능력치/체격/포지션 보정
          // (다른 모든 실존 선수의 OVR/POT/계약/성적은 절대 변경하지 않음)
          if (src.id === 'D2027-015' && p.ability <= 58 && p.potential >= 75) {
            p.ability = src.game_ratings.overall;
            p.potential = src.game_ratings.potential;
            p.position = '1B';
            p.bats = 'L';
            p.throws = 'R';
            p.heightCm = 185;
            p.weightKg = 118;
            p.v18Ratings = {
              overall: src.game_ratings.overall,
              potential: src.game_ratings.potential,
              batting: src.game_ratings.batting ?? null,
              pitching: null,
            };
          }
        } else if (p.originType === 'real' || !p.originType) {
          // 상무 단독 시딩 선수 등 v18SourceId가 없는 실존 선수 생년월일 보정
          const sangmuDob = VERIFIED_SANGMU_BIRTHDATES_BY_KEY[`${p.name}|${p.teamId}`];
          if (sangmuDob && !parseIsoDate(p.birthDate)) {
            p.birthDate = sangmuDob;
            p.birthYear = Number(sangmuDob.slice(0, 4));
          }
        }
      }

      // 미영입 FA 풀 내 실존 선수 생년월일 동기화
      for (const fa of career.unclaimedFreeAgents ?? []) {
        const src = fa.player.v18SourceId ? V18_BY_SOURCE_ID.get(fa.player.v18SourceId) : undefined;
        if (src?.birth_date && parseIsoDate(src.birth_date)) {
          fa.player.birthDate = src.birth_date;
          fa.player.birthYear = Number(src.birth_date.slice(0, 4));
        }
      }

      // 해외 진출 선수 8명 공식 확인 생년월일 동기화
      const verifiedOverseasById = new Map(
        buildVerifiedOverseasBaseline(career.season).map((ov) => [ov.permanentId, ov])
      );
      for (const ov of career.amateurAndOverseas?.overseasPlayers ?? []) {
        const ref = verifiedOverseasById.get(ov.permanentId);
        if (ref?.birthDate && !parseIsoDate(ov.birthDate)) {
          ov.birthDate = ref.birthDate;
          ov.birthYear = Number(ref.birthDate.slice(0, 4));
        }
      }

      // 울산 웨일즈 실존 선수 생년월일 동기화
      for (const uw of career.ulsanWhales?.roster ?? []) {
        const dob = VERIFIED_ULSAN_BIRTHDATES_BY_ID[uw.id];
        if (dob && !parseIsoDate(uw.birthDate)) {
          uw.birthDate = dob;
          uw.birthYear = Number(dob.slice(0, 4));
        }
      }

      career.databaseVersion = 'v22_verified_birthdates';
    }

    // v23: 고우석 LG 트윈스 국내 복귀 등록, 해외파 전수 검증 현행화, KBO↔해외 중복 등록 차단
    if (career.season >= 2027 && getDatabaseVersionRank(career.databaseVersion) < 23) {
      const goRaw = V18_BY_SOURCE_ID.get('2026-LG-19');
      const existingGo = Object.values(career.players).find(
        (p) => p.v18SourceId === '2026-LG-19' || p.kboOfficialId === '67119' || (p.name === '고우석' && p.teamId === 'LG')
      );

      if (goRaw && !existingGo) {
        const prevOvGo = career.amateurAndOverseas?.overseasPlayers?.find(
          (o) => o.permanentId === 'KBO-OVR-0004' || o.name === '고우석'
        );
        const goHist = buildHistoricalSeasonsFromRaw(goRaw);
        const goCareerAgg = buildHistoricalCareerStats(goHist, '투수');
        const goMerged = mergeVerifiedTeamHistory(goRaw, 'LG', findRealPlayerClubProfile('고우석', 'LG'));
        const goAge = calculateKoreanFullAge(goRaw.birth_date, career.currentDate ?? '2027-01-01') ?? 28;
        const goPlayer: Player = {
          id: '2026-LG-19',
          originType: 'real',
          v18SourceId: '2026-LG-19',
          kboOfficialId: '67119',
          permanentId: prevOvGo?.permanentId ?? 'KBO-OVR-0004',
          name: '고우석',
          teamId: 'LG',
          category: '국내',
          nationality: '한국',
          role: '투수',
          position: 'RP',
          pitchRole: '필승조',
          age: goAge,
          birthYear: 1998,
          birthDate: '1998-08-06',
          heightCm: 182,
          weightKg: 90,
          bats: 'R',
          throws: 'R',
          school: '충암고',
          debutYear: 2017,
          draftYear: 2017,
          uniformNumber: 19,
          militaryStatus: '예술·체육요원',
          militaryNote: '2022 항저우 아시안게임 금메달 (예술·체육요원)',
          ability: goRaw.game_ratings.overall,
          potential: goRaw.game_ratings.potential,
          abilityStatus: '확정',
          form: 0,
          fatigue: 0,
          lastPitchedRound: 0,
          consecutiveAppearances: 0,
          rosterTier: '1군',
          gameDayActive: true,
          contract: {
            status: '확정',
            currency: 'KRW',
            years: 1,
            yearsRemaining: 1,
            annualSalary: 5.0,
            signingBonus: 0,
            totalValue: 5.0,
            startSeason: 2027,
            endSeason: 2027,
            note: '2026-09-01 LG 트윈스 국내 복귀 계약 (1년 5억 원)',
          },
          injury: null,
          morale: '만족',
          trainingFocus: null,
          serviceYears: 8,
          clubTenureSeasons: goMerged.clubTenureSeasons,
          careerSeasons: 8,
          isOneClubMan: goMerged.isOneClubMan,
          careerTeamHistory: goMerged.history,
          previousLeagueClub: goRaw.previous_league_club ?? undefined,
          careerStats: goCareerAgg,
          careerWins: goCareerAgg && 'W' in goCareerAgg ? goCareerAgg.W : 22,
          careerSO: goCareerAgg && 'SO' in goCareerAgg ? goCareerAgg.SO : 429,
          historicalSeasons: goHist,
          recent3YrScore: 78,
          seasonRatingDelta: 0,
          lastEvaluatedAtTeamGames: 0,
          stats: emptyPitcherStats(false),
          postseasonStats: emptyPitcherStats(false),
          v18Ratings: {
            overall: goRaw.game_ratings.overall,
            potential: goRaw.game_ratings.potential,
            batting: null,
            pitching: goRaw.game_ratings.pitching ?? null,
          },
          v18Evaluation: {
            ...goRaw.evaluation_v18,
            ovr: goRaw.game_ratings.overall,
            pot: goRaw.game_ratings.potential,
          },
          rebalanceMeta: goRaw.rebalance_v19
            ? {
                prevOvr: goRaw.rebalance_v19.prev_ovr,
                prevPot: goRaw.rebalance_v19.prev_pot,
                newOvr: goRaw.rebalance_v19.new_ovr,
                newPot: goRaw.rebalance_v19.new_pot,
                ovrDelta: goRaw.rebalance_v19.ovr_delta,
                potDelta: goRaw.rebalance_v19.pot_delta,
                tier: goRaw.rebalance_v19.tier,
                reason: goRaw.rebalance_v19.reason,
              }
            : undefined,
          acquisitionInfo: {
            type: '드래프트',
            draftYear: 2017,
            draftRound: 1,
            draftPick: 1,
            label: '2017 1차지명 (충암고 · 2026 해외파 복귀)',
          },
        };
        career.players[goPlayer.id] = goPlayer;

        const lgTeam = career.teams['LG'];
        if (lgTeam && !lgTeam.bullpenOrder.includes(goPlayer.id) && !lgTeam.rotationOrder.includes(goPlayer.id)) {
          // 유영찬 다음 필승조/마무리 경쟁 슬롯으로 자동 등록
          lgTeam.bullpenOrder.splice(Math.min(1, lgTeam.bullpenOrder.length), 0, goPlayer.id);
        }
      }

      // 기존 세이브 해외파 목록에서 고우석 제거 & 2027 실제 해외파 소속 동기화 (게임 내 이동이 없던 선수만)
      if (career.amateurAndOverseas?.overseasPlayers) {
        career.amateurAndOverseas.overseasPlayers = career.amateurAndOverseas.overseasPlayers.filter(
          (ov) => ov.permanentId !== 'KBO-OVR-0004' && ov.name !== '고우석'
        );
        const latestBaseline = buildVerifiedOverseasBaseline(career.season);
        const byPerm = new Map(latestBaseline.map((b) => [b.permanentId, b]));
        const hasSong = career.amateurAndOverseas.overseasPlayers.some(
          (o) => o.permanentId === 'KBO-OVR-0009' || o.name === '송성문'
        );
        const songInKbo = Object.values(career.players).some(
          (p) => p.name === '송성문' && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
        );
        if (!hasSong && !songInKbo) {
          const songBase = byPerm.get('KBO-OVR-0009');
          if (songBase) career.amateurAndOverseas.overseasPlayers.push(songBase);
        }
        // 게임 내 2027 시즌 진행 전(gamesPlayed === 0) 세이브의 구 해외 소속팀 최신화
        if ((career.gamesPlayed ?? 0) === 0) {
          for (const ov of career.amateurAndOverseas.overseasPlayers) {
            const ref = byPerm.get(ov.permanentId);
            if (!ref) continue;
            if (
              (ov.permanentId === 'KBO-OVR-0002' && ov.clubName === '탬파베이 레이스') ||
              (ov.permanentId === 'KBO-OVR-0005' && ov.clubName === '피츠버그 파이리츠') ||
              (ov.permanentId === 'KBO-OVR-0007' && ov.clubName === '마이애미 말린스') ||
              (ov.permanentId === 'KBO-OVR-0008' && (ov.league === 'High-A' || ov.league === 'A+'))
            ) {
              ov.clubName = ref.clubName;
              ov.league = ref.league;
              ov.status = ref.status;
              ov.ability = ref.ability;
              ov.potential = ref.potential;
              ov.contractYearsRemaining = ref.contractYearsRemaining;
              ov.annualSalaryUsdThousands = ref.annualSalaryUsdThousands;
              ov.overseasContractEndDate = ref.overseasContractEndDate;
              ov.domesticEligibleDate = ref.domesticEligibleDate;
              ov.returnRestrictionActive = ref.returnRestrictionActive;
              ov.returnRestrictionNote = ref.returnRestrictionNote;
              ov.currentSeasonStats = { ...ref.currentSeasonStats };
              ov.seasonHistory = ref.seasonHistory.map((s) => ({ ...s }));
              ov.transferHistory = ref.transferHistory.map((t) => ({ ...t }));
            }
          }
        }
      }

      if (career.overseasReturnPool) {
        career.overseasReturnPool = career.overseasReturnPool.filter(
          (c) => c.playerName !== '고우석'
        );
      }

      career.databaseVersion = 'v23_go_woosuk_kbo_return';
    }

    // v24: 기존 유망주 및 2군 젊은 선수 잠재력(POT) 통일 척도 재평가 마이그레이션
    // - 기존 세이브의 선수 ID·현재 오버롤·성적·계약·인게임 성장을 모두 보존하면서 과소평가된 잠재력만 상향 보정
    if (career.season >= 2027 && getDatabaseVersionRank(career.databaseVersion) < 24) {
      for (const p of Object.values(career.players)) {
        if (p.rosterTier === '은퇴' || p.category !== '국내') continue;
        const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
        if (!src || src.status === 'drafted_2027') continue;
        const verifiedPot = Math.round(Number(src.game_ratings?.potential ?? p.potential));
        // 게임 내 하락/성장이 크게 누적되지 않은 젊은 유망주(만 26세 이하)의 과소평가 POT만 안전 보정
        if (p.age <= 26 && verifiedPot > p.potential) {
          p.potential = Math.max(p.ability, Math.min(95, verifiedPot));
          if (p.v18Ratings) {
            p.v18Ratings.potential = p.potential;
          }
          if (p.v18Evaluation) {
            p.v18Evaluation.pot = p.potential;
            p.v18Evaluation.potential_range = [p.ability, p.potential];
          }
          if (src.rebalance_v19) {
            p.rebalanceMeta = {
              prevOvr: src.rebalance_v19.prev_ovr,
              prevPot: src.rebalance_v19.prev_pot,
              newOvr: p.ability,
              newPot: p.potential,
              ovrDelta: 0,
              potDelta: p.potential - src.rebalance_v19.prev_pot,
              tier: src.rebalance_v19.tier,
              reason: src.rebalance_v19.reason,
            };
          }
        }
        // 누락된 드래프트 메타데이터 보완
        if (!p.draftYear && src.draft_year) {
          p.draftYear = src.draft_year;
        }
      }
      career.databaseVersion = 'v24_recalibrated_prospect_potentials';
    }

    // v25: KBO 10개 구단 전체 선수 주/보조 포지션 + 포지션별 수비 숙련도(0~100) 전수 검증 및 최정 3B 교정 마이그레이션
    // - 기존 세이브의 선수 ID, 능력치(OVR/POT), 성적, 계약, 인게임 성장/훈련 숙련도는 100% 보존
    if (getDatabaseVersionRank(career.databaseVersion) < 25) {
      for (const p of Object.values(career.players)) {
        // 한글 이름 내부 공백 정규화 (예: '최  정' -> '최정')
        if (/^[가-힣\s]+$/.test(p.name) && /\s/.test(p.name)) {
          p.name = p.name.replace(/\s+/g, '');
        }
        if (p.role !== '타자') continue;
        const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
        if (src && src.primary_position && ALL_HITTER_LINEUP_POSITIONS.includes(src.primary_position as Position)) {
          const verifiedPrimary = src.primary_position as Position;
          const prevPos = p.position;
          p.position = verifiedPrimary;
          const verifiedSec = (src.secondary_positions ?? []).filter(
            (sp): sp is Position => ALL_FIELD_POSITIONS.includes(sp as Position) && sp !== verifiedPrimary
          );
          const mergedSec = Array.from(new Set([...(p.secondaryPositions ?? []), ...verifiedSec])).filter(
            (sp) => sp !== verifiedPrimary
          );
          p.secondaryPositions = mergedSec;

          // 기존 훈련/출전으로 오른 숙련도가 있다면 보존(Math.max), 검증 기본 숙련도 병합
          const nextProf: Partial<Record<Position, number>> = { ...(p.positionProficiency ?? {}) };
          if (src.position_proficiency) {
            for (const [k, v] of Object.entries(src.position_proficiency)) {
              const pk = k as Position;
              const existingVal = nextProf[pk];
              nextProf[pk] =
                typeof existingVal === 'number' && Number.isFinite(existingVal)
                  ? Math.max(existingVal, v)
                  : v;
            }
          }
          p.positionProficiency = nextProf;

          // 기존 세이브에서 잘못된 주 포지션(예: 최정 SS)으로 선발 배치된 경우 정정된 주 포지션으로 동기화
          if (prevPos !== verifiedPrimary) {
            const ts = career.teams[p.teamId];
            if (ts && ts.lineupPositions[p.id] === prevPos) {
              const occupied = ts.lineupOrder.some(
                (lid) => lid !== p.id && (ts.lineupPositions[lid] ?? career.players[lid]?.position) === verifiedPrimary
              );
              if (!occupied) {
                ts.lineupPositions[p.id] = verifiedPrimary;
              }
            }
          }
        }
        ensurePlayerPositionProficiencyInPlace(p);
      }
      career.databaseVersion = 'v25_verified_positions_and_fa_compensation';
    } else {
      // 모든 세이브 로드 시 누락된 숙련도 맵만 안전 보완
      for (const p of Object.values(career.players)) {
        if (p.role === '타자' && !p.positionProficiency) {
          ensurePlayerPositionProficiencyInPlace(p);
        }
      }
    }

    // v26: 사용자 피드백 기반 선수 데이터 복구(전의산 등 상무 전역자), 병역(박지환·이율예 등), 10구단 투수 보직(이로운·노경은 등) 일괄 보정
    // - 기존 세이브의 선수 ID, 성적, 계약, 인게임 이동/입대·전역 상태는 100% 보존
    if (career.season >= 2027 && getDatabaseVersionRank(career.databaseVersion) < 26) {
      // 1) 누락된 2026 상무 전역 복귀 선수(전의산·정은원·김현준·장재영·전미르) 복구
      const recoveredSeedIds = ['2026-SSG-47', '2026-HH-43', 'v26-SS-KHJ', 'v26-WO-JJY', 'v26-LT-JMR'];
      const hasAnyMissing = recoveredSeedIds.some((sid) => {
        const src = V18_BY_SOURCE_ID.get(sid);
        if (!src) return false;
        const tid = V18_TEAM_MAP[src.team];
        return !Object.values(career.players).some(
          (pl) =>
            pl.v18SourceId === sid ||
            (pl.name.replace(/\s+/g, '') === src.name && pl.teamId === tid)
        );
      });
      if (hasAnyMissing) {
        const freshAll = buildAll10TeamsFromV18Dataset().players;
        for (const sid of recoveredSeedIds) {
          const freshPl = freshAll[sid];
          if (!freshPl) continue;
          const dupExists = Object.values(career.players).some(
            (pl) =>
              pl.v18SourceId === sid ||
              (pl.name.replace(/\s+/g, '') === freshPl.name && pl.teamId === freshPl.teamId)
          );
          if (!dupExists) {
            career.players[freshPl.id] = freshPl;
            const ts = career.teams[freshPl.teamId];
            if (ts && freshPl.role === '타자' && freshPl.rosterTier === '1군' && !ts.benchOrder.includes(freshPl.id) && !ts.lineupOrder.includes(freshPl.id)) {
              ts.benchOrder.push(freshPl.id);
            } else if (ts && freshPl.role === '투수' && freshPl.rosterTier === '1군' && !ts.bullpenOrder.includes(freshPl.id) && !ts.rotationOrder.includes(freshPl.id)) {
              ts.bullpenOrder.push(freshPl.id);
            }
          }
        }
      }

      // 2) 박지환·이율예·송영진·김규민 군 복무(상무 군보류) 반영 + 1군 액티브 정리
      const sangmuSyncIds = new Set(['v15-0183', 'v15-0161', 'v15-0142', 'v15-0158']);
      for (const p of Object.values(career.players)) {
        if (!p.v18SourceId || !sangmuSyncIds.has(p.v18SourceId)) continue;
        if (p.militaryChangedInGame) continue;
        const src = V18_BY_SOURCE_ID.get(p.v18SourceId);
        if (src?.military_verified && isMilitaryServing(src.military_verified.status)) {
          p.militaryStatus = '복무 중';
          p.militaryNote = src.military_verified.note;
          p.militaryEnlistDate = src.military_verified.enlist_date;
          p.militaryDischargeDate = src.military_verified.discharge_date;
          p.militaryEnlistedSeason = src.military_verified.enlisted_season;
          p.militaryReturnSeason = src.military_verified.return_season;
          p.militaryReturnRound = src.military_verified.return_round;
          p.rosterTier = '대기';
          p.gameDayActive = false;
          const ts = career.teams[p.teamId];
          if (ts) {
            ts.lineupOrder = ts.lineupOrder.filter((id) => id !== p.id);
            ts.benchOrder = ts.benchOrder.filter((id) => id !== p.id);
            ts.rotationOrder = ts.rotationOrder.filter((id) => id !== p.id);
            ts.bullpenOrder = ts.bullpenOrder.filter((id) => id !== p.id);
          }
        }
      }

      // 3) KBO 10개 구단 투수 보직(SP / RP / CL · 선발 / 필승조 / 마무리 / 중간) 실등판 기록 기반 보정
      for (const p of Object.values(career.players)) {
        if (p.role !== '투수' || p.rosterTier === '은퇴') continue;
        const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
        if (!src) continue;
        const verifiedPos =
          src.primary_position === 'CL' || src.primary_position === 'RP' || src.primary_position === 'SP'
            ? (src.primary_position as Position)
            : null;
        if (verifiedPos) {
          p.position = verifiedPos;
        }
        if (src.pitch_role) {
          p.pitchRole = src.pitch_role;
        }
        if (p.v18Ratings?.pitching && src.game_ratings?.pitching) {
          p.v18Ratings.pitching.stamina_proxy = src.game_ratings.pitching.stamina_proxy;
        }
      }

      // 불펜/마무리 투수가 선발 로테이션에 잘못 들어가 있는 경우 불펜으로 이동하고 실선발 투수로 보충
      for (const tid of TEAM_IDS) {
        const ts = career.teams[tid];
        if (!ts) continue;
        const misInRot = ts.rotationOrder.filter((pid) => {
          const pl = career.players[pid];
          return pl && (pl.position === 'RP' || pl.position === 'CL' || (pl.pitchRole && pl.pitchRole !== '선발'));
        });
        if (misInRot.length > 0) {
          ts.rotationOrder = ts.rotationOrder.filter((pid) => !misInRot.includes(pid));
          for (const rid of misInRot) {
            if (!ts.bullpenOrder.includes(rid)) {
              const rpl = career.players[rid];
              if (rpl?.pitchRole === '마무리' || rpl?.position === 'CL') {
                ts.bullpenOrder.unshift(rid);
              } else {
                ts.bullpenOrder.splice(Math.min(1, ts.bullpenOrder.length), 0, rid);
              }
            }
          }
          // 선발 로테이션 5인 보충
          const spCandidates = Object.values(career.players)
            .filter(
              (pl) =>
                pl.teamId === tid &&
                pl.role === '투수' &&
                (pl.rosterTier === '1군' || pl.rosterTier === '2군') &&
                !isMilitaryServing(pl.militaryStatus) &&
                !ts.rotationOrder.includes(pl.id) &&
                pl.position === 'SP'
            )
            .sort((a, b) => b.ability - a.ability);
          for (const sp of spCandidates) {
            if (ts.rotationOrder.length >= 5) break;
            sp.rosterTier = '1군';
            sp.gameDayActive = true;
            sp.pitchRole = '선발';
            ts.bullpenOrder = ts.bullpenOrder.filter((id) => id !== sp.id);
            ts.rotationOrder.push(sp.id);
          }
        }
      }

      career.databaseVersion = 'v26_feedback_roles_military_fa';
    }

    // v27: 전체 실제 선수 OVR/POT 및 세부 능력치 통합 재평가 1회 안전 마이그레이션
    // - 엄상백(48/48 → 64/72) 포함 10개 구단 전체 실제 선수 개별 재평가 + 세부 스탯 공식 일치
    // - 인게임 에디터로 사용자가 직접 수정한 선수(editorOriginals.players 등록)는 절대 덮어쓰지 않음
    // - 기존 세이브의 시즌 중 성장/노쇠화 변동분(liveDelta), 계약, 경기 성적, 소속팀 이동은 100% 보존
    if (career.season >= 2027 && getDatabaseVersionRank(career.databaseVersion) < 27) {
      const editorTouchedIds = new Set(Object.keys(career.editorOriginals?.players ?? {}));
      for (const p of Object.values(career.players)) {
        if (editorTouchedIds.has(p.id)) continue;
        const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
        if (!src || !src.rebalance_v27) continue;

        const r27 = src.rebalance_v27;
        // 기존 세이브에서 이미 진행된 시즌 성장/하락분 보존
        const liveDelta = Math.max(-10, Math.min(10, p.ability - r27.prev_ovr));
        const nextPot = Math.max(40, Math.min(99, r27.new_pot));
        const nextOvr = Math.max(38, Math.min(nextPot, r27.new_ovr + (career.gamesPlayed > 0 || career.season > 2027 ? liveDelta : 0)));
        p.ability = nextOvr;
        p.potential = Math.max(nextOvr, nextPot);
        p.v18Ratings = {
          overall: p.ability,
          potential: p.potential,
          batting: src.game_ratings?.batting ? { ...src.game_ratings.batting } : null,
          pitching: src.game_ratings?.pitching ? { ...src.game_ratings.pitching } : null,
        };
        if (p.v18Evaluation) {
          p.v18Evaluation.ovr = p.ability;
          p.v18Evaluation.pot = p.potential;
          p.v18Evaluation.basis = 'recalibrated_v27_unified_rating_engine';
          p.v18Evaluation.potential_range = [p.ability, p.potential];
        }
        p.rebalanceMeta = {
          prevOvr: r27.prev_ovr,
          prevPot: r27.prev_pot,
          newOvr: r27.new_ovr,
          newPot: r27.new_pot,
          ovrDelta: r27.ovr_delta,
          potDelta: r27.pot_delta,
          tier: r27.tier,
          reason: r27.reason,
        };
      }
      career.databaseVersion = 'v27_unified_player_ratings';
    }

    // v28: OOTP 스타일 세부 능력치 시스템 마이그레이션 (기존 세이브 선수 ID·계약·기록·소속팀·에디터 수정 100% 보존)
    if (getDatabaseVersionRank(career.databaseVersion) < 28) {
      ensureCareerOotpRatingsInPlace(career);
      career.databaseVersion = 'v28_ootp_detailed_ratings';
    } else {
      // 신규 영입/생성 선수 중 ootpRatings 누락분 안전 보정
      ensureCareerOotpRatingsInPlace(career);
    }

    // v29: 전 구단 실제 KBO 1군 인정 연차(serviceYears) 및 1군 등록일수 현실화 마이그레이션
    // (기존 구단 근속 +1 오용으로 인한 25세 8년차·26세 9년차·이적 베테랑 저연차 오류 일괄 정상화, 에디터 수정 선수 보존)
    if (getDatabaseVersionRank(career.databaseVersion) < 29) {
      const editorTouchedIds = new Set(Object.keys(career.editorOriginals?.players ?? {}));
      const seasonsElapsedSince2027 = Math.max(0, (career.season ?? 2027) - 2027);
      for (const p of Object.values(career.players)) {
        if (editorTouchedIds.has(p.id)) continue;
        const src = p.v18SourceId ? V18_BY_SOURCE_ID.get(p.v18SourceId) : undefined;
        if (!src) continue;
        const origTeamId: TeamId = V18_TEAM_MAP[src.team] ?? p.teamId;
        const { birthYear, birthDate } = computeAgeFor2027(src, '2027-01-01');
        const hist =
          p.historicalSeasons && p.historicalSeasons.length > 0
            ? p.historicalSeasons
            : buildHistoricalSeasonsFromRaw(src);
        const base2027 = computeRealisticServiceYears2027(
          src,
          origTeamId,
          p.role,
          birthYear,
          birthDate,
          hist
        );
        const nextSy =
          seasonsElapsedSince2027 > 0 && p.rosterTier === '1군'
            ? base2027 + seasonsElapsedSince2027
            : base2027;
        p.serviceYears = Math.max(0, nextSy);
        p.registrationDays = p.serviceYears * 145;
      }
      sanitizePlayerAgeAndServiceYearsInPlace(career.players, career.season ?? 2027);
      career.databaseVersion = 'v29_realistic_service_years';
    }

    // v30: 힐리어드 외야수(LF/CF/RF) 포지션 교정 + 강백호·최형우·김현수·김재환·전준우 전담 DH 포지션 마이그레이션
    if (getDatabaseVersionRank(career.databaseVersion) < 30) {
      const editorTouchedIds = new Set(Object.keys(career.editorOriginals?.players ?? {}));
      let anyPositionChanged = false;
      for (const p of Object.values(career.players)) {
        if (p.role !== '타자' || editorTouchedIds.has(p.id)) continue;
        const ov = findVerifiedPositionOverride(p.teamId, p.name);
        if (!ov) continue;
        p.position = ov.position;
        p.secondaryPositions = [...ov.secondaryPositions];
        p.positionProficiency = {
          ...(p.positionProficiency ?? {}),
          ...ov.positionProficiency,
        };
        ensurePlayerPositionProficiencyInPlace(p);
        ensurePlayerOotpRatingsInPlace(p);
        anyPositionChanged = true;
      }
      if (anyPositionChanged) {
        reconcileAllTeamsLineupPositionsInPlace(career);
      }
      career.databaseVersion = 'v30_hilliard_of_and_dh_position';
    }

    // KBO 현역 선수단과 해외파 목록 간 중복 등록 상시 방지
    if (career.amateurAndOverseas?.overseasPlayers) {
      const activeKboKey = new Set<string>();
      for (const p of Object.values(career.players)) {
        if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') continue;
        if (p.permanentId) activeKboKey.add(p.permanentId);
        if (p.birthYear) activeKboKey.add(`${p.name}|${p.birthYear}`);
      }
      for (const ov of career.amateurAndOverseas.overseasPlayers) {
        if (ov.status === 'KBO복귀완료' || ov.status === '은퇴') continue;
        if (activeKboKey.has(ov.permanentId) || activeKboKey.has(`${ov.name}|${ov.birthYear}`)) {
          ov.status = 'KBO복귀완료';
          ov.league = 'FA/방출';
        }
      }
    }

    // 세이브 로드 시마다 현재 게임 날짜·생년월일 기준으로 전체 만 나이 일괄 동기화
    syncAllAgesToDateInPlace(career);
    // 세이브 로드 시마다 당해 시즌 신인왕 자격 스냅샷 자동 동기화 (당해 성적·퓨처스 제외, 기존 세이브 100% 보존)
    syncSeasonRookieEligibilityInPlace(career);
    // 세이브 로드 시마다 10개 구단 선발 타자 라인업 9포지션 중복·누락 자동 검증 및 보정 (이미 정상인 라인업은 불변)
    reconcileAllTeamsLineupPositionsInPlace(career);
  }
}

function buildHistoricalSeasonsFromRaw(raw: RawV18Player): V18SeasonStatRecord[] {
  const rawCareerByYear =
    raw.career_by_year && raw.career_by_year.length > 0
      ? raw.career_by_year
      : (raw.evaluation_v18?.records ?? []);
  const dedup = new Map<string, V18SeasonStatRecord>();
  for (const rec of rawCareerByYear) {
    if (typeof rec.season !== 'number' || !Number.isFinite(rec.season)) continue;
    const key = `${rec.season}__${rec.team ?? ''}__${rec.stintOrder ?? 1}`;
    if (!dedup.has(key)) {
      dedup.set(key, { ...rec });
    }
  }
  return Array.from(dedup.values()).sort(
    (a, b) => b.season - a.season || (b.stintOrder ?? 1) - (a.stintOrder ?? 1)
  );
}

function mergeVerifiedTeamHistory(
  raw: RawV18Player,
  teamId: TeamId,
  realHist: ReturnType<typeof findRealPlayerClubProfile>
): { history: PlayerTeamHistoryEntry[]; isOneClubMan: boolean; clubTenureSeasons: number } {
  const isDomestic = !raw.foreign_slot;
  const isDrafted2027 = raw.status === 'drafted_2027';

  let history: PlayerTeamHistoryEntry[] =
    raw.verified_team_history && raw.verified_team_history.length > 0
      ? raw.verified_team_history.map((h) => ({ ...h }))
      : realHist
        ? realHist.history.map((h) => ({ ...h }))
        : [
            {
              teamLabel: KBO_TEAMS[teamId]?.name ?? teamId,
              teamId,
              league: 'KBO',
              fromSeason: raw.draft_year ?? raw.debut_year ?? (isDrafted2027 ? 2027 : 2026),
            },
          ];

  // verified_team_history에 MLB/NPB 이력이 빠져 있고 realHist에 공식 해외 경력이 있으면 비파괴 병합
  if (realHist && raw.verified_team_history && raw.verified_team_history.length > 0) {
    const hasOverseasInVerified = history.some((h) => h.league === 'MLB' || h.league === 'NPB' || Boolean(h.mlbTeamName));
    const overseasEntries = realHist.history.filter(
      (h) => h.league === 'MLB' || h.league === 'NPB' || Boolean(h.mlbTeamName)
    );
    if (!hasOverseasInVerified && overseasEntries.length > 0) {
      // KBO 복귀자(류현진·김광현·양현종·김현수 등)는 realHist의 연대순 정렬을 우선 보존
      const merged = [...history, ...overseasEntries.map((h) => ({ ...h }))].sort(
        (a, b) => a.fromSeason - b.fromSeason || (a.toSeason ?? 9999) - (b.toSeason ?? 9999)
      );
      history = merged;
    }
  }

  const distinctKboClubs = new Set<TeamId>();
  for (const h of history) {
    if (h.teamId) distinctKboClubs.add(h.teamId);
  }
  if (!raw.retired_after_2026 && !raw.released_after_2026) {
    distinctKboClubs.add(teamId);
  }

  const isOneClubMan =
    typeof raw.verified_one_club_man === 'boolean'
      ? raw.verified_one_club_man
      : isDomestic && distinctKboClubs.size <= 1;

  const clubTenureSeasons =
    typeof raw.verified_club_tenure_2027 === 'number'
      ? raw.verified_club_tenure_2027
      : isDrafted2027
        ? 0
        : realHist && (!realHist.expectedTeamId || realHist.expectedTeamId === teamId)
          ? realHist.clubTenure2026 + 1
          : 1;

  return { history, isOneClubMan, clubTenureSeasons };
}

/**
 * KBO_GM_2027_v18_recalibrated.json (731명) 기반 2027시즌 새 커리어 전체 10개 구단 선수단·로스터·코치 생성.
 * - 기존 731명 전원 유지, ID 중복 0건, OVR <= POT 100% 보장
 * - 2024~2026 성적은 historicalSeasons & careerStats로 보존, 2027시즌 stats는 0부터 시작
 * - 2027 개정 최저연봉 3,300만 원(0.33억) 반영
 */
export function buildAll10TeamsFromV18Dataset(): {
  players: Record<string, Player>;
  teams: Record<TeamId, TeamState>;
  coaches: Record<TeamId, Coach[]>;
  faCoaches: Coach[];
  v18Summary: {
    totalPlayers: number;
    officialRosterCount: number;
    drafted2027Count: number;
    faApproved2027Count: number;
  };
} {
  const players: Record<string, Player> = {};
  const seenIds = new Set<string>();
  const seenKboOfficialIds = new Set<string>();
  const { coaches, faCoaches } = buildInitialCoachesForMode(false);

  const ifCountByTeam: Record<string, number> = {};
  const ofCountByTeam: Record<string, number> = {};
  let drafted2027Count = 0;
  let faApproved2027Count = 0;

  for (const raw of V18_DATA.players) {
    const teamId: TeamId = V18_TEAM_MAP[raw.team] ?? 'LG';
    const pid = String(raw.id).trim();
    if (!pid || seenIds.has(pid)) {
      continue;
    }
    const kboOfficialId = raw.kbo_player_id ? String(raw.kbo_player_id).trim() : undefined;
    if (kboOfficialId && seenKboOfficialIds.has(kboOfficialId)) {
      continue;
    }
    seenIds.add(pid);
    if (kboOfficialId) seenKboOfficialIds.add(kboOfficialId);

    const ifIdx = ifCountByTeam[teamId] ?? 0;
    const ofIdx = ofCountByTeam[teamId] ?? 0;
    const {
      role,
      position,
      secondaryPositions,
      positionProficiency,
    } = inferConcretePosition(raw, teamId, ifIdx, ofIdx);
    if (raw.position === 'IF') ifCountByTeam[teamId] = ifIdx + 1;
    if (raw.position === 'OF') ofCountByTeam[teamId] = ofIdx + 1;

    const rawOvr = Math.round(Number(raw.game_ratings?.overall ?? raw.evaluation_v18?.ovr ?? 50));
    const rawPot = Math.round(Number(raw.game_ratings?.potential ?? raw.evaluation_v18?.pot ?? rawOvr));
    const potential = Math.max(1, Math.min(99, Math.max(rawOvr, rawPot)));
    const ability = Math.max(1, Math.min(potential, rawOvr));

    const { age, birthYear, birthDate } = computeAgeFor2027(raw, '2027-01-01');
    const category: Player['category'] =
      raw.foreign_slot === 'asia'
        ? '아시아쿼터'
        : raw.foreign_slot === 'foreign'
          ? '외국인'
          : '국내';

    const isDrafted2027 = raw.status === 'drafted_2027';
    if (isDrafted2027) drafted2027Count += 1;
    if (raw.fa_approved_2027) faApproved2027Count += 1;

    // 연도별 공식 과거 성적 (2006~2026, 같은 시즌 다구단 분할 성적 보존 및 최신순 정렬)
    const historicalSeasons = buildHistoricalSeasonsFromRaw(raw);
    const recent3Records = historicalSeasons.filter((r) => r.season >= 2024 && r.season <= 2026);
    const recent3YrScore = computeRecent3YrScore(
      recent3Records.length > 0 ? recent3Records : (raw.evaluation_v18?.records ?? []),
      role,
      ability
    );

    // 실제 KBO 통산 소속팀 이력·원클럽맨·구단 근속 연수 (현재 소속과 과거 이력 분리 관리)
    const realHist = findRealPlayerClubProfile(raw.name, teamId);
    const v18CareerAgg = buildHistoricalCareerStats(historicalSeasons, role);
    const mergedCareer = mergeVerifiedTeamHistory(raw, teamId, realHist);

    const careerStats: CareerBatterStats | CareerPitcherStats | undefined = v18CareerAgg;
    const distinctHistoricalYears = new Set(historicalSeasons.map((h) => h.season)).size;
    const careerSeasons = Math.max(
      isDrafted2027 ? 0 : 1,
      distinctHistoricalYears,
      mergedCareer.clubTenureSeasons
    );
    const clubTenureSeasons = mergedCareer.clubTenureSeasons;
    const isOneClubMan = mergedCareer.isOneClubMan;
    const careerTeamHistory: Player['careerTeamHistory'] = mergedCareer.history;
    const realisticServiceYears = computeRealisticServiceYears2027(
      raw,
      teamId,
      role,
      birthYear,
      birthDate,
      historicalSeasons
    );

    // 계약 정보 구성 (2027 최저연봉 3,300만 원 적용 · 공식 확인 외국인 보수 반영 · 미발표 FA 계약은 협상 대기 유지)
    const fm = raw.foreign_meta_2026;
    let contract: Player['contract'];
    if (category === '외국인') {
      const salUsd =
        fm?.salary_usd && fm.salary_usd > 0
          ? fm.salary_usd
          : Math.min(900000, Math.max(550000, Math.round((ability * 10000) / 50000) * 50000));
      const bonusUsd =
        fm?.signing_bonus_usd !== null && fm?.signing_bonus_usd !== undefined && fm.signing_bonus_usd >= 0
          ? fm.signing_bonus_usd
          : Math.min(200000, Math.max(100000, 1000000 - salUsd));
      contract = {
        status: '확정',
        currency: 'USD',
        years: 1,
        yearsRemaining: 1,
        annualSalary: salUsd,
        signingBonus: bonusUsd,
        totalValue: salUsd + bonusUsd,
        startSeason: 2027,
        endSeason: 2027,
        note: fm ? '2026 등록 보수 기준 외국인 선수 (2027 재계약 반영)' : '2027 외국인 선수 계약 (v18 DB)',
      };
    } else if (category === '아시아쿼터') {
      const salUsd = fm?.salary_usd && fm.salary_usd > 0 ? Math.min(200000, fm.salary_usd) : 150000;
      const bonusUsd =
        fm?.signing_bonus_usd !== null && fm?.signing_bonus_usd !== undefined && fm.signing_bonus_usd >= 0
          ? Math.min(200000 - salUsd, fm.signing_bonus_usd)
          : Math.min(30000, 200000 - salUsd);
      contract = {
        status: '확정',
        currency: 'USD',
        years: 1,
        yearsRemaining: 1,
        annualSalary: salUsd,
        signingBonus: bonusUsd,
        totalValue: salUsd + bonusUsd,
        startSeason: 2027,
        endSeason: 2027,
        note: '2027 아시아쿼터 선수 계약 ($200,000 상한 준수)',
      };
    } else if (raw.fa_signed_2027) {
      const fs = raw.fa_signed_2027;
      contract = {
        status: '확정',
        currency: 'KRW',
        years: fs.years,
        yearsRemaining: fs.years,
        annualSalary: fs.annualBillion,
        signingBonus: fs.signingBonusBillion,
        totalValue: fs.totalBillion,
        startSeason: 2027,
        endSeason: fs.endYear,
        isFAEligible: false,
        faGrade: null,
        note: fs.note,
      };
    } else if (raw.released_after_2026) {
      const annual = estimateDomesticSalaryBillion(raw, ability, age);
      contract = {
        status: '만료',
        currency: 'KRW',
        years: 0,
        yearsRemaining: 0,
        annualSalary: annual,
        signingBonus: 0,
        totalValue: 0,
        startSeason: 2027,
        endSeason: 2026,
        isFAEligible: false,
        faGrade: null,
        note: raw.release_note ?? '2026시즌 종료 후 재계약 불가 (방출 · 자유계약)',
      };
    } else {
      const annual = estimateDomesticSalaryBillion(raw, ability, age);
      const endYear =
        typeof raw.contract_end_year === 'number' && raw.contract_end_year >= 2027
          ? raw.contract_end_year
          : 2027;
      const yearsRem = Math.max(1, endYear - 2026);
      const officialFaGrade = raw.fa_approved_2027 ? (raw.fa_grade_2027 ?? 'B') : undefined;
      contract = {
        status: raw.fa_approved_2027 ? 'FA' : '확정',
        currency: 'KRW',
        years: yearsRem,
        yearsRemaining: raw.fa_approved_2027 ? 0 : yearsRem,
        annualSalary: annual,
        signingBonus: 0,
        totalValue: Math.round(annual * yearsRem * 100) / 100,
        startSeason: 2027,
        endSeason: endYear,
        isFAEligible: raw.fa_approved_2027 || false,
        faGrade: officialFaGrade ?? null,
        note: raw.fa_approved_2027
          ? `2027 FA 승인 ${officialFaGrade ?? 'B'}등급 (계약 미확정 · FA 협상 대기)`
          : isDrafted2027
            ? '2027 KBO 신인 지명 선수 (최저연봉 3,300만 원)'
            : '2027 보류선수 (v18 재보정 DB)',
      };
    }

    const jerseyNum = raw.jersey && /^\d+$/.test(raw.jersey) ? Number(raw.jersey) : undefined;
    const seedH = hashStr(pid + raw.name);

    // 2026 공식 확정 주요 수상 이력 (발표 전 MVP/신인왕/골든글러브는 미확정이므로 부여하지 않음)
    const awardHonors2026: Player['awardHonors'] =
      kboOfficialId === '62404' || (raw.name === '구자욱' && teamId === '삼성')
        ? [
            {
              season: 2026,
              awardType: '한국시리즈 MVP',
              label: '한국시리즈 MVP',
              teamId: '삼성',
              statSummary: '5G 타율 .500 (20타수 10안타) 1홈런 6타점 5득점 · 삼성 통산 9회 우승',
            },
          ]
        : undefined;

    const milVer = raw.military_verified;
    const verifiedMilStatus: MilitaryStatus =
      category !== '국내'
        ? '해당 없음'
        : (milVer?.status ?? '미확인');
    const isServingMilitary = isMilitaryServing(verifiedMilStatus);
    const isRetired2026 = Boolean(raw.retired_after_2026);
    const isReleased2026 = Boolean(raw.released_after_2026) && !isRetired2026;
    const initialRosterTier: Player['rosterTier'] = isRetired2026
      ? '은퇴'
      : isReleased2026
        ? 'FA'
        : isServingMilitary
          ? '대기'
          : raw.fa_approved_2027
            ? 'FA'
            : isDrafted2027
              ? ability >= 70
                ? '1군'
                : '2군'
              : raw.level_2026 === 1
                ? '1군'
                : '2군';

    const player: Player = {
      id: pid,
      originType: 'real',
      v18SourceId: pid,
      kboOfficialId,
      verifiedFutures2026: raw.futures_2026 ?? null,
      faApproved2027Grade: raw.fa_approved_2027 ? (raw.fa_grade_2027 ?? 'B') : undefined,
      awardHonors: awardHonors2026,
      name: raw.name,
      teamId,
      formerTeamId: raw.fa_approved_2027 || isReleased2026 ? teamId : undefined,
      releasedAfter2026: isReleased2026 || undefined,
      releaseDate: raw.release_date,
      releaseNote: raw.release_note,
      category,
      role,
      position,
      pitchRole:
        role === '투수'
          ? (raw.pitch_role ?? (position === 'CL' ? '마무리' : position === 'RP' ? '중간' : '선발'))
          : undefined,
      secondaryPositions: role === '타자' ? secondaryPositions : undefined,
      positionProficiency: role === '타자' ? positionProficiency : undefined,
      age,
      birthYear,
      birthDate,
      heightCm: raw.height_cm ?? null,
      weightKg: raw.weight_kg ?? null,
      bats: raw.bats === 'L' || raw.bats === 'R' || raw.bats === 'S' ? raw.bats : null,
      throws: raw.throws === 'L' || raw.throws === 'R' ? raw.throws : null,
      school: raw.school ?? null,
      debutYear: raw.debut_year ?? null,
      draftYear: raw.draft_year ?? null,
      militaryStatus: verifiedMilStatus,
      militaryNote: milVer?.note ?? (category !== '국내' ? '외국인/아시아쿼터 선수 (병역 해당 없음)' : undefined),
      militaryEnlistDate: milVer?.enlist_date,
      militaryDischargeDate: milVer?.discharge_date,
      militaryEnlistedSeason: milVer?.enlisted_season,
      militaryEnlistedRound: isServingMilitary ? 0 : undefined,
      militaryReturnSeason: milVer?.return_season,
      militaryReturnRound: milVer?.return_round,
      dataVerification: {
        verifiedAt: V18_DATA.verifiedAt,
        militarySource: milVer?.source,
        bioSource: raw.school || raw.birth_date ? 'KBO 공식 등록·드래프트 아카이브' : undefined,
      },
      ability,
      potential,
      abilityStatus: '확정',
      form: 0,
      fatigue: 0,
      lastPitchedRound: 0,
      consecutiveAppearances: 0,
      rosterTier: initialRosterTier,
      gameDayActive: initialRosterTier === '1군',
      contract,
      injury: null,
      morale: '보통',
      trainingFocus: null,
      serviceYears: realisticServiceYears,
      registrationDays: realisticServiceYears * 145,
      clubTenureSeasons,
      careerSeasons,
      careerStats,
      careerHits: role === '타자' && careerStats && 'H' in careerStats ? careerStats.H : undefined,
      careerHR: role === '타자' && careerStats && 'HR' in careerStats ? careerStats.HR : undefined,
      careerWins: role === '투수' && careerStats && 'W' in careerStats ? careerStats.W : undefined,
      careerSO: role === '투수' && careerStats && 'SO' in careerStats ? careerStats.SO : undefined,
      careerTeamHistory,
      previousLeagueClub: raw.previous_league_club ?? undefined,
      isOneClubMan,
      uniformNumber: jerseyNum,
      nationality: resolveRealForeignNationality(raw.name, category, fm?.nationality),
      kboAdaptation:
        category === '외국인'
          ? 64 + (seedH % 14)
          : category === '아시아쿼터'
            ? 74 + (seedH % 12)
            : undefined,
      foreignAdaptationProfile:
        category !== '국내' ? assignForeignAdaptationProfile(ability, seedH) : undefined,
      recent3YrScore,
      seasonRatingDelta: 0,
      lastEvaluatedAtTeamGames: 0,
      // 2027시즌 개인 성적은 반드시 0부터 시작 (기존 통산·연도별 기록은 historicalSeasons & careerStats로 보존)
      stats: role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      postseasonStats: role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      v18Ratings: {
        overall: ability,
        potential,
        batting: raw.game_ratings?.batting ?? null,
        pitching: raw.game_ratings?.pitching ?? null,
      },
      v18Evaluation: {
        ...raw.evaluation_v18,
        ovr: ability,
        pot: potential,
      },
      rebalanceMeta: (raw.rebalance_v27 ?? raw.rebalance_v19)
        ? {
            prevOvr: (raw.rebalance_v27 ?? raw.rebalance_v19)!.prev_ovr,
            prevPot: (raw.rebalance_v27 ?? raw.rebalance_v19)!.prev_pot,
            newOvr: (raw.rebalance_v27 ?? raw.rebalance_v19)!.new_ovr,
            newPot: (raw.rebalance_v27 ?? raw.rebalance_v19)!.new_pot,
            ovrDelta: (raw.rebalance_v27 ?? raw.rebalance_v19)!.ovr_delta,
            potDelta: (raw.rebalance_v27 ?? raw.rebalance_v19)!.pot_delta,
            tier: (raw.rebalance_v27 ?? raw.rebalance_v19)!.tier,
            reason: (raw.rebalance_v27 ?? raw.rebalance_v19)!.reason,
          }
        : undefined,
      historicalSeasons,
      rookieInfo: isDrafted2027
        ? {
            draftId: raw.draft_pick ?? 0,
            pickNotation: `${raw.draft_round ?? 1}R 전체 ${raw.draft_pick ?? 1}번`,
            round: raw.draft_round ?? 1,
            pickInRound: ((raw.draft_pick ?? 1) - 1) % 10 + 1,
            originType: raw.school && /대|대학/.test(raw.school) ? '대학' : raw.school && /독립/.test(raw.school) ? '독립리그' : '고졸',
            school: raw.school ?? '미확인',
            signingBonusBillion:
              VERIFIED_2027_ROOKIE_BONUSES_BY_ID[pid] !== undefined
                ? VERIFIED_2027_ROOKIE_BONUSES_BY_ID[pid]
                : Math.max(0.3, Math.round((3.0 - ((raw.draft_round ?? 10) - 1) * 0.28) * 10) / 10),
            amateurSummary: `2027 KBO 신인 드래프트 ${raw.draft_round ?? 1}라운드 지명 (${raw.school ?? '출신교 미확인'})`,
          }
        : undefined,
      acquisitionInfo: isDrafted2027
        ? {
            type: '드래프트',
            draftYear: 2027,
            draftRound: raw.draft_round ?? undefined,
            draftPick: raw.draft_pick ?? undefined,
            label: `2027 ${raw.draft_round ?? 1}R 전체 ${raw.draft_pick ?? 1}번${raw.school ? ` (${raw.school})` : ''}`,
          }
        : raw.draft_year || raw.draft_round
          ? {
              type: '드래프트',
              draftYear: raw.draft_year ?? undefined,
              draftRound: raw.draft_round ?? undefined,
              draftPick: raw.draft_pick ?? undefined,
              label: [
                raw.draft_year ? `${raw.draft_year}` : '',
                raw.draft_method ?? (raw.draft_round ? `${raw.draft_round}R` : ''),
                raw.draft_rank_label ?? (raw.draft_pick ? `전체 ${raw.draft_pick}번` : ''),
              ]
                .filter(Boolean)
                .join(' ') || '드래프트 지명',
            }
          : category !== '국내'
            ? {
                type: category === '아시아쿼터' ? '아시아쿼터' : '외국인',
                label: category === '아시아쿼터' ? '아시아쿼터 영입' : '외국인 선수 영입',
              }
            : undefined,
      previousAnnualSalary: contract.currency === 'KRW' ? contract.annualSalary : undefined,
      growthCurveProfile:
        age <= 22 && potential - ability >= 20
          ? '대기만성'
          : age >= 35 && ability >= 70
            ? '철강왕'
            : seedH % 5 === 0
              ? '조기개화'
              : '표준',
    };

    if (role === '타자') {
      ensurePlayerPositionProficiencyInPlace(player);
    }
    players[pid] = player;
  }

  // 구단별 1군(28명) / 선발 5 / 불펜 8 / 주전 9 / 벤치 6 자동 균형 구성
  const teams = {} as Record<TeamId, TeamState>;

  for (const tid of TEAM_IDS) {
    const teamPlayers = Object.values(players).filter(
      (p) =>
        p.teamId === tid &&
        p.rosterTier !== 'FA' &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        !isMilitaryServing(p.militaryStatus)
    );

    const pitchers = teamPlayers
      .filter((p) => p.role === '투수')
      .sort((a, b) => {
        const aScore = a.ability + (a.rosterTier === '1군' ? 4 : 0) + (a.category !== '국내' ? 3 : 0);
        const bScore = b.ability + (b.rosterTier === '1군' ? 4 : 0) + (b.category !== '국내' ? 3 : 0);
        return bScore - aScore;
      });

    const hitters = teamPlayers
      .filter((p) => p.role === '타자')
      .sort((a, b) => {
        const aScore = a.ability + (a.rosterTier === '1군' ? 4 : 0) + (a.category !== '국내' ? 4 : 0);
        const bScore = b.ability + (b.rosterTier === '1군' ? 4 : 0) + (b.category !== '국내' ? 4 : 0);
        return bScore - aScore;
      });

    // 선발 5명 (실제 등판 기록 기반 SP 우선 · 전문 구원/필승조/마무리 투수는 불펜 엄격 유지)
    const activePitchers = pitchers.filter((p) => !isMilitaryServing(p.militaryStatus));
    const isDedicatedReliever = (p: Player): boolean => {
      if (
        p.position === 'RP' ||
        p.position === 'CL' ||
        p.pitchRole === '마무리' ||
        p.pitchRole === '필승조' ||
        p.pitchRole === '중간' ||
        p.pitchRole === '추격조' ||
        p.pitchRole === '롱릴리프'
      ) {
        return true;
      }
      const cs = p.careerStats;
      if (cs && 'SV' in cs) {
        if (cs.SV >= 20) return true;
        if (cs.G >= 30 && cs.outs / Math.max(1, cs.G) < 6) return true;
      }
      return false;
    };
    const starterPool = [...activePitchers].sort((a, b) => {
      const aStam = a.v18Ratings?.pitching?.stamina_proxy ?? 50;
      const bStam = b.v18Ratings?.pitching?.stamina_proxy ?? 50;
      const aRelPen = isDedicatedReliever(a) ? -90 : 0;
      const bRelPen = isDedicatedReliever(b) ? -90 : 0;
      const aVal = a.ability * 1.35 + aStam * 0.45 + (a.category !== '국내' ? 5 : 0) + aRelPen;
      const bVal = b.ability * 1.35 + bStam * 0.45 + (b.category !== '국내' ? 5 : 0) + bRelPen;
      return bVal - aVal;
    });
    const rotationOrder: string[] = [];
    const usedPitchers = new Set<string>();
    for (const sp of starterPool.slice(0, 5)) {
      sp.position = 'SP';
      sp.pitchRole = '선발';
      sp.rosterTier = '1군';
      sp.gameDayActive = true;
      rotationOrder.push(sp.id);
      usedPitchers.add(sp.id);
    }

    // 불펜 8명 (마무리 1 + 셋업/필승조 3 + 중간 3 + 롱릴리프 1 · 실제 보직 우선 정렬)
    const bpPriority = (p: Player): number => {
      if (p.position === 'CL' || p.pitchRole === '마무리') return 300;
      if (p.pitchRole === '필승조') return 200;
      if (p.pitchRole === '중간') return 100;
      if (p.pitchRole === '롱릴리프') return 60;
      return 40;
    };
    const relievers = activePitchers
      .filter((p) => !usedPitchers.has(p.id))
      .sort((a, b) => bpPriority(b) - bpPriority(a) || b.ability - a.ability);
    const bullpenOrder: string[] = [];
    relievers.slice(0, 8).forEach((rp, idx) => {
      if (idx === 0) {
        rp.position = 'CL';
        rp.pitchRole = '마무리';
      } else {
        rp.position = 'RP';
        rp.pitchRole =
          rp.pitchRole === '필승조' || idx <= 3
            ? '필승조'
            : rp.pitchRole === '롱릴리프' || idx === 7
              ? '롱릴리프'
              : idx <= 5
                ? '중간'
                : '추격조';
      }
      rp.rosterTier = '1군';
      rp.gameDayActive = true;
      bullpenOrder.push(rp.id);
      usedPitchers.add(rp.id);
    });

    // 나머지 투수는 2군 배치 (군복무 중인 선수는 '대기' 유지, 실제 보직 보존)
    for (const p of pitchers) {
      if (isMilitaryServing(p.militaryStatus)) {
        p.rosterTier = '대기';
        p.gameDayActive = false;
        continue;
      }
      if (!usedPitchers.has(p.id)) {
        p.rosterTier = '2군';
        p.gameDayActive = false;
        if (!p.pitchRole) {
          p.position = (p.v18Ratings?.pitching?.stamina_proxy ?? 45) >= 58 ? 'SP' : 'RP';
          p.pitchRole = p.position === 'SP' ? '선발' : '중간';
        }
      }
    }

    // 주전 9명 (각 수비 포지션 C, 1B, 2B, 3B, SS, LF, CF, RF + DH · 멀티 포지션 숙련도 반영 · 군복무 선수 제외)
    const activeHitters = hitters.filter((h) => !isMilitaryServing(h.militaryStatus));
    const requiredSlots: Position[] = ['C', 'SS', 'CF', '2B', '3B', '1B', 'RF', 'LF', 'DH'];
    const lineupOrder: string[] = [];
    const lineupPositions: Record<string, Position> = {};
    const usedHitters = new Set<string>();

    for (const slot of requiredSlots) {
      let chosen = activeHitters.find((h) => !usedHitters.has(h.id) && h.position === slot);
      if (!chosen && slot !== 'DH') {
        chosen = activeHitters
          .filter((h) => !usedHitters.has(h.id) && getPositionProficiency(h, slot) >= (slot === 'C' ? 60 : 62))
          .sort(
            (a, b) =>
              b.ability + getPositionProficiency(b, slot) * 0.25 - (a.ability + getPositionProficiency(a, slot) * 0.25)
          )[0];
      }
      if (!chosen) {
        chosen = activeHitters.find((h) => !usedHitters.has(h.id));
      }
      if (chosen) {
        chosen.rosterTier = '1군';
        chosen.gameDayActive = true;
        lineupOrder.push(chosen.id);
        lineupPositions[chosen.id] = slot;
        usedHitters.add(chosen.id);
      }
    }

    // 벤치 6명 (최소 포수 백업 1명 포함)
    const benchOrder: string[] = [];
    const backupCatcher = activeHitters.find((h) => !usedHitters.has(h.id) && h.position === 'C');
    if (backupCatcher) {
      backupCatcher.rosterTier = '1군';
      backupCatcher.gameDayActive = true;
      benchOrder.push(backupCatcher.id);
      usedHitters.add(backupCatcher.id);
    }
    for (const h of activeHitters) {
      if (benchOrder.length >= 6) break;
      if (!usedHitters.has(h.id)) {
        h.rosterTier = '1군';
        h.gameDayActive = true;
        benchOrder.push(h.id);
        usedHitters.add(h.id);
      }
    }
    // 나머지 야수는 2군 배치 (군복무 중인 선수는 '대기' 유지)
    for (const h of hitters) {
      if (isMilitaryServing(h.militaryStatus)) {
        h.rosterTier = '대기';
        h.gameDayActive = false;
        continue;
      }
      if (!usedHitters.has(h.id)) {
        h.rosterTier = '2군';
        h.gameDayActive = false;
      }
    }

    // KBO 정식 등록 선수 정원(68명) 준수: 1군+2군이 68명을 초과하는 구단은 최하위 2군 국내 자원을 육성선수로 배치
    const officialTeamPlayers = teamPlayers.filter(
      (p) => p.rosterTier === '1군' || p.rosterTier === '2군'
    );
    if (officialTeamPlayers.length > 68) {
      const overflowCount = officialTeamPlayers.length - 68;
      const demoteToDevCandidates = officialTeamPlayers
        .filter((p) => p.rosterTier === '2군' && p.category === '국내')
        .sort((a, b) => a.ability - b.ability || a.potential - b.potential);
      for (let i = 0; i < Math.min(overflowCount, demoteToDevCandidates.length); i++) {
        demoteToDevCandidates[i].rosterTier = '육성';
        demoteToDevCandidates[i].gameDayActive = false;
      }
    }

    // 실제 KBO 선수 중 공식 등번호 미확인 선수는 임의 번호를 생성하지 않고 미확인(undefined)으로 유지합니다.
    void isMilitaryResolved;

    teams[tid] = {
      teamId: tid,
      lineupOrder,
      lineupPositions,
      rotationOrder,
      bullpenOrder,
      benchOrder,
      nextStarterIdx: 0,
      atmosphere: '보통',
      popularity: KBO_TEAMS[tid].basePopularity,
      fanSentiment: 65,
      clubReputation: 70,
    };
  }

  enforceOvrPotInvariantInPlace(players);
  for (const pl of Object.values(players)) {
    ensurePlayerOotpRatingsInPlace(pl);
  }

  return {
    players,
    teams,
    coaches,
    faCoaches,
    v18Summary: {
      totalPlayers: Object.keys(players).length,
      officialRosterCount: V18_DATA.officialRosterCount,
      drafted2027Count,
      faApproved2027Count,
    },
  };
}
