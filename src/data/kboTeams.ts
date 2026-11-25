import { SeededRng } from '../engine/rng';
import { ChampionRecord, TeamId, TeamInfo, VirtualForeignPoolItem } from '../types/kbo';

export const TEAM_IDS: TeamId[] = [
  'LG',
  '한화',
  'SSG',
  '삼성',
  'NC',
  'KT',
  '롯데',
  'KIA',
  '두산',
  '키움',
];

// 2026시즌 최종 순위 (1위 삼성 한국시리즈 우승 ~ 10위 키움 · 새 게임 구단 선택 화면 정렬 기준)
export const FINAL_STANDINGS_2026_ORDER: TeamId[] = [
  '삼성',
  'KT',
  'KIA',
  'LG',
  '두산',
  'SSG',
  '롯데',
  'NC',
  '한화',
  '키움',
];

export const FINAL_RANK_2026: Record<TeamId, number> = {
  삼성: 1,
  KT: 2,
  KIA: 3,
  LG: 4,
  두산: 5,
  SSG: 6,
  롯데: 7,
  NC: 8,
  한화: 9,
  키움: 10,
};

// 최초 가상 신인 드래프트 기본 지명 순서 (2026시즌 최종 순위 역순: 키움 → 한화 → NC → 롯데 → SSG → 두산 → LG → KIA → KT → 삼성)
export const INITIAL_VIRTUAL_DRAFT_ORDER_2028: TeamId[] = [...FINAL_STANDINGS_2026_ORDER].reverse();

// 2025 정규시즌 역순 드래프트 순서 (레거시 2026 완료 드래프트 보존용)
export const DRAFT_ORDER_2026: TeamId[] = [
  '키움',
  '두산',
  'KIA',
  '롯데',
  'KT',
  'NC',
  '삼성',
  'SSG',
  '한화',
  'LG',
];

// 역대 KBO 한국시리즈 우승 기준선 (최신 연도 내림차순: 2026 삼성 통산 9회 우승 · 2025 LG 통합우승)
export const HISTORICAL_BASELINE_CHAMPIONS: ChampionRecord[] = [
  {
    season: 2026,
    championTeamId: '삼성',
    runnerUpTeamId: 'KT',
    seriesScore: '4승 1패',
    ksMvpName: '구자욱',
    ksMvpSummary: '2026 KBO 한국시리즈 우승 (통산 9회 · 5G 타율 .500 10안타 1HR 6RBI · 디펜딩 챔피언)',
    rewardCashBillion: 0,
    isHistoricalBaseline: true,
    date: '2026-10-31',
  },
  {
    season: 2025,
    championTeamId: 'LG',
    runnerUpTeamId: '한화',
    seriesScore: '4승 1패',
    ksMvpName: '김현수',
    ksMvpSummary: '2025 KBO 한국시리즈 통합 우승',
    rewardCashBillion: 0,
    isHistoricalBaseline: true,
    date: '2025-10-31',
  },
];

/**
 * 한국시리즈 우승 기록 정규화 유틸리티
 * - 동일 연도(season) 중복 기록 제거 (시뮬레이션/최신 기록 우선 유지)
 * - 항상 연도 내림차순(최신 시즌 최상단: e.g. 2028 → 2027 → 2026 → 2025)으로 자동 정렬
 */
export function normalizeChampionHistory(records?: ChampionRecord[] | null): ChampionRecord[] {
  const source =
    records && records.length > 0
      ? records
      : HISTORICAL_BASELINE_CHAMPIONS;
  const bySeason = new Map<number, ChampionRecord>();
  for (const rec of source) {
    if (!rec || typeof rec.season !== 'number' || !Number.isFinite(rec.season)) continue;
    const prev = bySeason.get(rec.season);
    if (!prev) {
      bySeason.set(rec.season, { ...rec });
    } else if (prev.isHistoricalBaseline && !rec.isHistoricalBaseline) {
      // 동일 연도에 실제 시뮬레이션 기록이 있으면 우선 반영
      bySeason.set(rec.season, { ...rec });
    }
  }
  return Array.from(bySeason.values()).sort((a, b) => b.season - a.season);
}

/**
 * 새 시즌 한국시리즈 우승 기록을 동일 연도 중복 없이 추가하고 연도 내림차순으로 정렬
 */
export function upsertChampionRecord(
  existing: ChampionRecord[] | undefined | null,
  nextRecord: ChampionRecord
): ChampionRecord[] {
  const base =
    existing && existing.length > 0
      ? existing.filter((c) => c.season !== nextRecord.season)
      : HISTORICAL_BASELINE_CHAMPIONS.filter((c) => c.season !== nextRecord.season);
  return normalizeChampionHistory([nextRecord, ...base]);
}

export const KBO_TEAMS: Record<TeamId, TeamInfo> = {
  LG: {
    id: 'LG',
    name: 'LG 트윈스',
    shortName: 'LG',
    city: '서울',
    stadium: '서울종합운동장 야구장 (잠실)',
    capacity: 23750,
    parkFactor: 0.89,
    basePopularity: 90,
    ticketDemandMultiplier: 1.15,
    ticketPriceAvg: 20500,
    operatingCostPerSeriesBillion: 2.35,
    primaryColor: '#C30452',
    secondaryColor: '#111827',
    accentColor: '#F43F5E',
    emblemCode: 'LG',
    logoUrls: [
      '/logos/hd/LG.svg',
      '/logos/hd/LG.png',
      '/logos/LG.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_LG.png',
    ],
    prevRank2025: 1,
  },
  한화: {
    id: '한화',
    name: '한화 이글스',
    shortName: '한화',
    city: '대전',
    stadium: '대전 한화생명 볼파크',
    capacity: 20007,
    parkFactor: 1.06,
    basePopularity: 85,
    ticketDemandMultiplier: 1.12,
    ticketPriceAvg: 19500,
    operatingCostPerSeriesBillion: 2.15,
    primaryColor: '#FC4E00',
    secondaryColor: '#1E1B18',
    accentColor: '#FB923C',
    emblemCode: 'H',
    logoUrls: [
      '/logos/hd/HH.svg',
      '/logos/hd/HH.png',
      '/logos/HH.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_HH.png',
    ],
    prevRank2025: 2,
  },
  SSG: {
    id: 'SSG',
    name: 'SSG 랜더스',
    shortName: 'SSG',
    city: '인천',
    stadium: '인천 SSG 랜더스필드',
    capacity: 23000,
    parkFactor: 1.1,
    basePopularity: 82,
    ticketDemandMultiplier: 1.05,
    ticketPriceAvg: 19000,
    operatingCostPerSeriesBillion: 2.2,
    primaryColor: '#CE0E2D',
    secondaryColor: '#1F2937',
    accentColor: '#F59E0B',
    emblemCode: 'SSG',
    logoUrls: [
      '/logos/hd/SK.png?v=2027ssg',
      '/logos/SK.png?v=2027ssg',
    ],
    prevRank2025: 3,
  },
  삼성: {
    id: '삼성',
    name: '삼성 라이온즈',
    shortName: '삼성',
    city: '대구',
    stadium: '대구 삼성 라이온즈 파크',
    capacity: 24000,
    parkFactor: 1.13,
    basePopularity: 88,
    ticketDemandMultiplier: 1.13,
    ticketPriceAvg: 19500,
    operatingCostPerSeriesBillion: 2.25,
    primaryColor: '#074CA1',
    secondaryColor: '#0F172A',
    accentColor: '#38BDF8',
    emblemCode: 'S',
    logoUrls: [
      '/logos/hd/SS.svg',
      '/logos/hd/SS.png',
      '/logos/SS.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_SS.png',
    ],
    prevRank2025: 4,
  },
  NC: {
    id: 'NC',
    name: 'NC 다이노스',
    shortName: 'NC',
    city: '창원',
    stadium: '창원 NC 파크',
    capacity: 17891,
    parkFactor: 1.02,
    basePopularity: 70,
    ticketDemandMultiplier: 0.92,
    ticketPriceAvg: 17500,
    operatingCostPerSeriesBillion: 1.75,
    primaryColor: '#315288',
    secondaryColor: '#0C1F3D',
    accentColor: '#C5A059',
    emblemCode: 'NC',
    logoUrls: [
      '/logos/hd/NC.svg',
      '/logos/hd/NC.png',
      '/logos/NC.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_NC.png',
    ],
    prevRank2025: 5,
  },
  KT: {
    id: 'KT',
    name: 'KT 위즈',
    shortName: 'KT',
    city: '수원',
    stadium: '수원 케이티 위즈 파크',
    capacity: 18700,
    parkFactor: 1.01,
    basePopularity: 73,
    ticketDemandMultiplier: 0.96,
    ticketPriceAvg: 18000,
    operatingCostPerSeriesBillion: 1.88,
    primaryColor: '#18181B',
    secondaryColor: '#E11D48',
    accentColor: '#EF4444',
    emblemCode: 'KT',
    logoUrls: [
      '/logos/hd/KT.svg',
      '/logos/hd/KT.png',
      '/logos/KT.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_KT.png',
    ],
    prevRank2025: 6,
  },
  롯데: {
    id: '롯데',
    name: '롯데 자이언츠',
    shortName: '롯데',
    city: '부산',
    stadium: '사직 야구장',
    capacity: 22990,
    parkFactor: 1.05,
    basePopularity: 88,
    ticketDemandMultiplier: 1.14,
    ticketPriceAvg: 19000,
    operatingCostPerSeriesBillion: 2.18,
    primaryColor: '#041E42',
    secondaryColor: '#D00F31',
    accentColor: '#F43F5E',
    emblemCode: 'L',
    logoUrls: [
      '/logos/hd/LT.svg',
      '/logos/hd/LT.png',
      '/logos/LT.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_LT.png',
    ],
    prevRank2025: 7,
  },
  KIA: {
    id: 'KIA',
    name: 'KIA 타이거즈',
    shortName: 'KIA',
    city: '광주',
    stadium: '광주-기아 챔피언스 필드',
    capacity: 20500,
    parkFactor: 1.04,
    basePopularity: 89,
    ticketDemandMultiplier: 1.14,
    ticketPriceAvg: 19500,
    operatingCostPerSeriesBillion: 2.2,
    primaryColor: '#EA0029',
    secondaryColor: '#0F172A',
    accentColor: '#FB7185',
    emblemCode: 'KIA',
    logoUrls: [
      '/logos/hd/HT.svg',
      '/logos/hd/HT.png',
      '/logos/HT.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_HT.png',
    ],
    prevRank2025: 8,
  },
  두산: {
    id: '두산',
    name: '두산 베어스',
    shortName: '두산',
    city: '서울',
    stadium: '서울종합운동장 야구장 (잠실)',
    capacity: 23750,
    parkFactor: 0.89,
    basePopularity: 81,
    ticketDemandMultiplier: 1.04,
    ticketPriceAvg: 19000,
    operatingCostPerSeriesBillion: 2.05,
    primaryColor: '#131230',
    secondaryColor: '#ED1C24',
    accentColor: '#EF4444',
    emblemCode: 'D',
    logoUrls: [
      '/logos/hd/OB.svg',
      '/logos/hd/OB.png',
      '/logos/OB.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_OB.png',
    ],
    prevRank2025: 9,
  },
  키움: {
    id: '키움',
    name: '키움 히어로즈',
    shortName: '키움',
    city: '서울',
    stadium: '고척 스카이돔',
    capacity: 16000,
    parkFactor: 0.94,
    basePopularity: 64,
    ticketDemandMultiplier: 0.85,
    ticketPriceAvg: 17000,
    operatingCostPerSeriesBillion: 1.5,
    primaryColor: '#820024',
    secondaryColor: '#270A14',
    accentColor: '#F43F5E',
    emblemCode: 'K',
    logoUrls: [
      '/logos/hd/WO.svg',
      '/logos/hd/WO.png',
      '/logos/WO.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_WO.png',
    ],
    prevRank2025: 10,
  },
};

export interface ForeignEvaluationEntry {
  teamId: TeamId;
  name: string;
  rosterShortName?: string; // matches 182a5799 short names like '잭로그', '데이비슨', '유토'
  category: '외국인' | '아시아쿼터';
  role: '투수' | '타자';
  ability: number;
  potential: number;
  status: '확정' | '제안';
}

// v4.60.4 E2 & E3 + v4.60.5~6 Hanwha confirmed evaluations
export const MASTER_40_FOREIGN_EVALS: ForeignEvaluationEntry[] = [
  // 일반 외국인 30명
  { teamId: 'LG', name: '요니 치리노스', rosterShortName: '치리노스', category: '외국인', role: '투수', ability: 72, potential: 75, status: '제안' },
  { teamId: 'LG', name: '앤더스 톨허스트', rosterShortName: '톨허스트', category: '외국인', role: '투수', ability: 85, potential: 87, status: '제안' },
  { teamId: 'LG', name: '오스틴 딘', rosterShortName: '오스틴', category: '외국인', role: '타자', ability: 95, potential: 95, status: '제안' },

  { teamId: '한화', name: '윌켈 에르난데스', category: '외국인', role: '투수', ability: 73, potential: 78, status: '확정' },
  { teamId: '한화', name: '오웬 화이트', category: '외국인', role: '투수', ability: 79, potential: 83, status: '확정' },
  { teamId: '한화', name: '페라자', category: '외국인', role: '타자', ability: 87, potential: 87, status: '확정' },

  { teamId: 'SSG', name: '미치 화이트', rosterShortName: '화이트', category: '외국인', role: '투수', ability: 73, potential: 77, status: '제안' },
  { teamId: 'SSG', name: '앤서니 베니지아노', rosterShortName: '베니지아노', category: '외국인', role: '투수', ability: 70, potential: 76, status: '제안' },
  { teamId: 'SSG', name: '기예르모 에레디아', rosterShortName: '에레디아', category: '외국인', role: '타자', ability: 86, potential: 86, status: '제안' },

  { teamId: '삼성', name: '아리엘 후라도', rosterShortName: '후라도', category: '외국인', role: '투수', ability: 88, potential: 89, status: '제안' },
  { teamId: '삼성', name: '잭 오러클린', rosterShortName: '오러클린', category: '외국인', role: '투수', ability: 77, potential: 81, status: '제안' },
  { teamId: '삼성', name: '르윈 디아즈', rosterShortName: '디아즈', category: '외국인', role: '타자', ability: 90, potential: 91, status: '제안' },

  { teamId: 'NC', name: '라일리 톰슨', rosterShortName: '라일리', category: '외국인', role: '투수', ability: 88, potential: 91, status: '제안' },
  { teamId: 'NC', name: '커티스 테일러', rosterShortName: '테일러', category: '외국인', role: '투수', ability: 76, potential: 81, status: '제안' },
  { teamId: 'NC', name: '맷 데이비슨', rosterShortName: '데이비슨', category: '외국인', role: '타자', ability: 78, potential: 81, status: '제안' },

  { teamId: 'KT', name: '맷 사우어', rosterShortName: '사우어', category: '외국인', role: '투수', ability: 79, potential: 84, status: '제안' },
  { teamId: 'KT', name: '케일럽 보쉴리', rosterShortName: '보쉴리', category: '외국인', role: '투수', ability: 74, potential: 78, status: '제안' },
  { teamId: 'KT', name: '샘 힐리어드', rosterShortName: '힐리어드', category: '외국인', role: '타자', ability: 93, potential: 94, status: '제안' },

  { teamId: '롯데', name: '엘빈 로드리게스', rosterShortName: '로드리게스', category: '외국인', role: '투수', ability: 78, potential: 82, status: '제안' },
  { teamId: '롯데', name: '제러미 비슬리', rosterShortName: '비슬리', category: '외국인', role: '투수', ability: 75, potential: 79, status: '제안' },
  { teamId: '롯데', name: '빅터 레이예스', rosterShortName: '레이예스', category: '외국인', role: '타자', ability: 91, potential: 91, status: '제안' },

  { teamId: 'KIA', name: '제임스 네일', rosterShortName: '네일', category: '외국인', role: '투수', ability: 88, potential: 89, status: '제안' },
  { teamId: 'KIA', name: '애덤 올러', rosterShortName: '올러', category: '외국인', role: '투수', ability: 90, potential: 91, status: '제안' },
  { teamId: 'KIA', name: '해럴드 카스트로', rosterShortName: '카스트로', category: '외국인', role: '타자', ability: 74, potential: 78, status: '제안' },

  { teamId: '두산', name: '잭 로그', rosterShortName: '잭로그', category: '외국인', role: '투수', ability: 82, potential: 84, status: '제안' },
  { teamId: '두산', name: '크리스 플렉센', rosterShortName: '플렉센', category: '외국인', role: '투수', ability: 76, potential: 81, status: '제안' },
  { teamId: '두산', name: '다즈 카메론', rosterShortName: '카메론', category: '외국인', role: '타자', ability: 67, potential: 73, status: '제안' },

  { teamId: '키움', name: '라울 알칸타라', rosterShortName: '알칸타라', category: '외국인', role: '투수', ability: 81, potential: 82, status: '제안' },
  { teamId: '키움', name: '네이선 와일스', rosterShortName: '와일스', category: '외국인', role: '투수', ability: 73, potential: 79, status: '제안' },
  { teamId: '키움', name: '트렌턴 브룩스', rosterShortName: '브룩스', category: '외국인', role: '타자', ability: 67, potential: 73, status: '제안' },

  // 아시아쿼터 10명
  { teamId: 'LG', name: '라클란 웰스', rosterShortName: '웰스', category: '아시아쿼터', role: '투수', ability: 77, potential: 80, status: '제안' },
  { teamId: '한화', name: '왕옌청', category: '아시아쿼터', role: '투수', ability: 78, potential: 85, status: '확정' },
  { teamId: 'SSG', name: '다케다 쇼타', rosterShortName: '다케다', category: '아시아쿼터', role: '투수', ability: 63, potential: 66, status: '제안' },
  { teamId: '삼성', name: '미야지 유라', rosterShortName: '미야지', category: '아시아쿼터', role: '투수', ability: 65, potential: 70, status: '제안' },
  { teamId: 'NC', name: '도다 나쓰키', rosterShortName: '토다', category: '아시아쿼터', role: '투수', ability: 72, potential: 77, status: '제안' },
  { teamId: 'KT', name: '스기모토 고키', rosterShortName: '스기모토', category: '아시아쿼터', role: '투수', ability: 69, potential: 73, status: '제안' },
  { teamId: '롯데', name: '교야마 마사야', rosterShortName: '교야마', category: '아시아쿼터', role: '투수', ability: 64, potential: 70, status: '제안' },
  { teamId: 'KIA', name: '제리드 데일', rosterShortName: '데일', category: '아시아쿼터', role: '타자', ability: 66, potential: 73, status: '제안' },
  { teamId: '두산', name: '다무라 이치로', rosterShortName: '다무라', category: '아시아쿼터', role: '투수', ability: 65, potential: 70, status: '제안' },
  { teamId: '키움', name: '가나쿠보 유토', rosterShortName: '유토', category: '아시아쿼터', role: '투수', ability: 80, potential: 84, status: '제안' },
];

// 스카우트 가능 외국인 후보 풀 (마스터 D4 + v4.60.6 명시 후보 포함)
export type ForeignScoutCandidate = VirtualForeignPoolItem;

export const FOREIGN_SCOUT_POOL: ForeignScoutCandidate[] = [
  {
    id: 'scout-watson',
    name: '트로이 왓슨',
    nationality: '미국',
    previousLeagueClub: 'AAA 버펄로 바이슨스 (토론토 산하)',
    category: '외국인',
    role: '투수',
    position: 'SP',
    age: 28,
    ability: 81,
    potential: 84,
    suggestedTotalUsd: 800000,
    suggestedSigningBonusUsd: 200000,
    suggestedSalaryUsd: 600000,
    scoutingNote: '우완 선발 스카우트 후보 (150km/h 포심·슬라이더)',
  },
  {
    id: 'scout-hernandez',
    name: '윌켈 에르난데스',
    nationality: '베네수엘라',
    previousLeagueClub: 'AAA 톨레도 머드헨스 (디트로이트 산하)',
    category: '외국인',
    role: '투수',
    position: 'SP',
    age: 27,
    ability: 73,
    potential: 78,
    suggestedTotalUsd: 700000,
    suggestedSigningBonusUsd: 150000,
    suggestedSalaryUsd: 550000,
    scoutingNote: '우완 선발 후보 (싱커·체인지업 구사)',
  },
  {
    id: 'scout-white',
    name: '오웬 화이트',
    nationality: '미국',
    previousLeagueClub: 'MLB 텍사스 레인저스 · AAA 라운드록',
    category: '외국인',
    role: '투수',
    position: 'SP',
    age: 27,
    ability: 79,
    potential: 83,
    suggestedTotalUsd: 900000,
    suggestedSigningBonusUsd: 200000,
    suggestedSalaryUsd: 700000,
    scoutingNote: 'MLB 경력 우완 선발 (다양한 변화구·이닝 소화)',
  },
  {
    id: 'scout-wang',
    name: '왕옌청',
    nationality: '대만',
    previousLeagueClub: 'NPB 도호쿠 라쿠텐 골든이글스 (2군)',
    category: '아시아쿼터',
    role: '투수',
    position: 'SP',
    age: 25,
    ability: 78,
    potential: 85,
    suggestedTotalUsd: 100000,
    suggestedSigningBonusUsd: 0,
    suggestedSalaryUsd: 100000,
    scoutingNote: '아시아쿼터 좌완 선발 (20만 달러 상한)',
  },
  {
    id: 'scout-woodford',
    name: '제이크 우드포드',
    nationality: '미국',
    previousLeagueClub: 'MLB 피츠버그 파이리츠 · AAA 인디애나폴리스',
    category: '외국인',
    role: '투수',
    position: 'SP',
    age: 29,
    ability: 77,
    potential: 80,
    suggestedTotalUsd: 850000,
    suggestedSigningBonusUsd: 200000,
    suggestedSalaryUsd: 650000,
    scoutingNote: 'MLB 통산 80+경기 등판 우완 선발 후보',
  },
  {
    id: 'scout-zimmermann',
    name: '브루스 짐머맨',
    nationality: '미국',
    previousLeagueClub: 'MLB 볼티모어 오리올스 · AAA 노퍽 타이즈',
    category: '외국인',
    role: '투수',
    position: 'SP',
    age: 31,
    ability: 76,
    potential: 78,
    suggestedTotalUsd: 750000,
    suggestedSigningBonusUsd: 150000,
    suggestedSalaryUsd: 600000,
    scoutingNote: 'MLB 선발 경험 갖춘 안정형 좌완 후보',
  },
];

const VIRTUAL_WESTERN_FIRST = [
  '마커스', '카를로스', '헌터', '로건', '라파엘', '브랜든', '디에고', '루카스', '타일러', '미겔', '에릭', '조던', '네이선', '세바스찬',
];
const VIRTUAL_WESTERN_LAST = [
  '발데스', '맥도널드', '산타나', '레이놀즈', '크루즈', '몬테로', '켈리', '카브레라', '핸슨', '메디나', '코빈', '베르가스', '프리먼', '가르시아',
];
const VIRTUAL_WESTERN_CLUBS = [
  'AAA 라스베이거스 에비에이터스 (애슬레틱스 산하)',
  'AAA 새크라멘토 리버캣츠 (샌프란시스코 산하)',
  'MLB 시카고 화이트삭스 · AAA 샬럿',
  'AAA 엘패소 치와와스 (샌디에이고 산하)',
  'MLB 콜로라도 로키스 · AAA 앨버커키',
  'AAA 타코마 레이니어스 (시애틀 산하)',
  'AAA 리하이밸리 아이언피그스 (필라델피아 산하)',
  'MLB 마이애미 말린스 · AAA 잭슨빌',
  'AAA 오클라호마시티 코메츠 (LA 다저스 산하)',
  'AAA 슈거랜드 스페이스 카우보이스 (휴스턴 산하)',
  'LMB 디아블로스 로호스 델 멕시코 (멕시코리그)',
  'AAA 그위넷 스트라이퍼스 (애틀랜타 산하)',
];
const VIRTUAL_ASIAN_PLAYERS = [
  { name: '사토 류세이', nat: '일본', club: 'NPB 사이타마 세이부 라이온즈 (2군)', role: '투수' as const, pos: 'SP' as const, note: '일본 독립/NPB 2군 출신 제구형 우완 (가상)' },
  { name: '다카하시 켄토', nat: '일본', club: 'NPB 요코하마 DeNA 베이스타즈', role: '투수' as const, pos: 'RP' as const, note: '152km/h 스플리터 구사 필승조 우완 (가상)' },
  { name: '린즈웨이', nat: '대만', club: 'CPBL 중신 브라더스', role: '투수' as const, pos: 'SP' as const, note: '대만 대표팀 경력 좌완 선발 유망주 (가상)' },
  { name: '천위하오', nat: '대만', club: 'CPBL 웨이취안 드래곤스', role: '타자' as const, pos: 'RF' as const, note: '컨택·주루 겸비 아시아쿼터 외야수 (가상)' },
  { name: '매튜 콜린스', nat: '호주', club: 'ABL 멜버른 에이시스', role: '투수' as const, pos: 'SP' as const, note: 'ABL 다승왕 출신 이닝이터 우완 (가상)' },
  { name: '나카무라 다이키', nat: '일본', club: 'NPB 오릭스 버펄로스 (2군)', role: '타자' as const, pos: '3B' as const, note: '강한 어깨와 선구안 갖춘 코너 내야수 (가상)' },
];

/**
 * Generates deterministic virtual foreign & Asian-quarter scout candidates for signing/replacement.
 */
export function generateVirtualForeignMarket(season: number, seed: number): ForeignScoutCandidate[] {
  const rng = new SeededRng(seed + season * 97 + 313);
  const results: ForeignScoutCandidate[] = [];
  const used = new Set<string>();

  // 7 regular foreign candidates (4 pitchers, 3 hitters)
  const regularTemplates: { role: '투수' | '타자'; pos: ForeignScoutCandidate['position']; nat: string; style: string }[] = [
    { role: '투수', pos: 'SP', nat: '미국', style: '최고 154km/h 파워피처 · 트리플A 선발' },
    { role: '투수', pos: 'SP', nat: '도미니카', style: '싱커·슬라이더 땅볼 유도형 이닝이터' },
    { role: '투수', pos: 'SP', nat: '베네수엘라', style: '안정된 커맨드와 체인지업 구사 좌완 선발' },
    { role: '투수', pos: 'SP', nat: '미국', style: 'MLB 불펜/스윙맨 경력 하이업사이드 우완' },
    { role: '타자', pos: '1B', nat: '도미니카', style: '30홈런 잠재력의 장타 특화 1루 거포' },
    { role: '타자', pos: 'RF', nat: '쿠바', style: '강한 어깨와 중장거리 갭파워 겸비 코너 외야' },
    { role: '타자', pos: 'LF', nat: '미국', style: '높은 출루율과 20-20 가능 5툴형 외야수' },
  ];

  for (let i = 0; i < regularTemplates.length; i++) {
    const tpl = regularTemplates[i];
    let fullName = '';
    for (let a = 0; a < 20; a++) {
      const n = `${VIRTUAL_WESTERN_FIRST[rng.int(0, VIRTUAL_WESTERN_FIRST.length - 1)]} ${VIRTUAL_WESTERN_LAST[rng.int(0, VIRTUAL_WESTERN_LAST.length - 1)]}`;
      if (!used.has(n)) {
        fullName = n;
        used.add(n);
        break;
      }
    }
    const age = rng.int(25, 32);
    const ability = rng.int(75, 88);
    const potential = Math.min(93, ability + rng.int(1, 5));
    const totalUsd = Math.round((550_000 + (ability - 74) * 58_000 + rng.int(0, 80_000)) / 50_000) * 50_000;
    const boundedTotal = Math.max(500_000, Math.min(1_000_000, totalUsd)); // KBO 신규 외국인 상한 $1,000,000 준수
    const bonusUsd = Math.round((boundedTotal * 0.25) / 50_000) * 50_000;
    const salaryUsd = boundedTotal - bonusUsd;
    const prevClub = VIRTUAL_WESTERN_CLUBS[(i * 2 + rng.int(0, VIRTUAL_WESTERN_CLUBS.length - 1)) % VIRTUAL_WESTERN_CLUBS.length];

    const overseasLeagueTier: ForeignScoutCandidate['overseasLeagueTier'] =
      ability >= 85 ? 'MLB_REG' : ability >= 81 ? 'MLB_40MAN' : ability >= 77 ? 'AAA' : 'INDY';
    const signingDifficulty: ForeignScoutCandidate['signingDifficulty'] =
      ability >= 85 ? '매우높음' : ability >= 81 ? '높음' : ability >= 77 ? '보통' : '낮음';
    const adaptationRisk: ForeignScoutCandidate['adaptationRisk'] =
      tpl.role === '투수' && age <= 27 ? '보통' : ability >= 83 ? '안정' : rng.next() < 0.28 ? '고위험' : '보통';
    const competingClubInterest = Math.min(95, Math.max(25, Math.round((ability - 70) * 4.5 + rng.int(-8, 12))));

    results.push({
      id: `vfor-${season}-${seed % 1000}-${i + 1}`,
      name: fullName,
      nationality: tpl.nat,
      previousLeagueClub: prevClub,
      overseasLeagueTier,
      overseasCareerSummary:
        overseasLeagueTier === 'MLB_REG'
          ? `MLB 빅리그 실전 경력 보유 (${prevClub})`
          : overseasLeagueTier === 'MLB_40MAN'
          ? `MLB 40인 로스터 · AAA 주축 (${prevClub})`
          : `AAA 마이너리그 상위 레벨 (${prevClub})`,
      signingDifficulty,
      adaptationRisk,
      competingClubInterest,
      category: '외국인',
      role: tpl.role,
      position: tpl.pos,
      age,
      ability,
      potential,
      suggestedTotalUsd: boundedTotal,
      suggestedSigningBonusUsd: bonusUsd,
      suggestedSalaryUsd: salaryUsd,
      scoutingNote: `[가상 외국인 · ${tpl.nat} · 영입난이도:${signingDifficulty}] ${tpl.style}`,
      isVirtual: true,
    });
  }

  // 3 Asian-quarter candidates (<= $200,000 cap)
  const pickedAsian = rng.shuffle(VIRTUAL_ASIAN_PLAYERS).slice(0, 3);
  pickedAsian.forEach((ap, idx) => {
    const ability = rng.int(72, 81);
    const potential = Math.min(87, ability + rng.int(2, 6));
    const totalUsd = Math.min(200_000, Math.max(100_000, Math.round((100_000 + (ability - 71) * 10_000) / 10_000) * 10_000));
    const overseasLeagueTier: ForeignScoutCandidate['overseasLeagueTier'] =
      ap.nat === '일본' ? 'NPB' : ap.nat === '대만' ? 'CPBL' : 'INDY';
    results.push({
      id: `vasia-${season}-${seed % 1000}-${idx + 1}`,
      name: ap.name,
      nationality: ap.nat,
      previousLeagueClub: ap.club,
      overseasLeagueTier,
      overseasCareerSummary: `${overseasLeagueTier} 아시아 프로리그 경력 (${ap.club})`,
      signingDifficulty: ability >= 79 ? '높음' : '보통',
      adaptationRisk: '안정',
      competingClubInterest: Math.min(85, 35 + (ability - 70) * 4),
      category: '아시아쿼터',
      role: ap.role,
      position: ap.pos,
      age: rng.int(23, 29),
      ability,
      potential,
      suggestedTotalUsd: totalUsd,
      suggestedSigningBonusUsd: 0,
      suggestedSalaryUsd: totalUsd,
      scoutingNote: `[가상 아시아쿼터 · ${ap.nat}] ${ap.note}`,
      isVirtual: true,
    });
  });

  return results;
}

export const MLB_CLUBS: string[] = [
  'New York Yankees',
  'Los Angeles Dodgers',
  'San Diego Padres',
  'San Francisco Giants',
  'Boston Red Sox',
  'Seattle Mariners',
  'Toronto Blue Jays',
  'Chicago Cubs',
  'Atlanta Braves',
  'Houston Astros',
  'Philadelphia Phillies',
  'New York Mets',
  'Texas Rangers',
  'Baltimore Orioles',
  'Minnesota Twins',
  'Arizona Diamondbacks',
  'St. Louis Cardinals',
  'Cleveland Guardians',
  'Detroit Tigers',
  'Tampa Bay Rays',
  'Kansas City Royals',
  'Milwaukee Brewers',
  'Cincinnati Reds',
  'Pittsburgh Pirates',
  'Los Angeles Angels',
  'Athletics',
  'Washington Nationals',
  'Miami Marlins',
  'Chicago White Sox',
  'Colorado Rockies',
];

export interface FuturesTeamMeta {
  teamId: TeamId | '상무' | '울산';
  division: '북부리그' | '남부리그';
  officialName: string;
  homeCity: string;
  stadium: string;
  parentTeamId?: TeamId;
  badgeCode: string;
  badgeColor: string;
}

export const FUTURES_TEAMS_META: Record<TeamId | '상무' | '울산', FuturesTeamMeta> = {
  // 북부리그 (6팀: 상무, 한화, 고양, LG, 두산, SSG)
  상무: {
    teamId: '상무',
    division: '북부리그',
    officialName: '상무 피닉스',
    homeCity: '문경',
    stadium: '문경 상무야구장',
    badgeCode: '상무',
    badgeColor: '#1B365D',
  },
  한화: {
    teamId: '한화',
    division: '북부리그',
    officialName: '한화 이글스',
    homeCity: '서산',
    stadium: '서산 전용연습구장',
    parentTeamId: '한화',
    badgeCode: 'HH',
    badgeColor: '#F37321',
  },
  키움: {
    teamId: '키움',
    division: '북부리그',
    officialName: '고양 히어로즈',
    homeCity: '고양',
    stadium: '고양 국가대표야구훈련장',
    parentTeamId: '키움',
    badgeCode: 'GY',
    badgeColor: '#570514',
  },
  LG: {
    teamId: 'LG',
    division: '북부리그',
    officialName: 'LG 트윈스',
    homeCity: '이천',
    stadium: '이천 LG챔피언스파크',
    parentTeamId: 'LG',
    badgeCode: 'LG',
    badgeColor: '#C30452',
  },
  두산: {
    teamId: '두산',
    division: '북부리그',
    officialName: '두산 베어스',
    homeCity: '이천',
    stadium: '이천 베어스파크',
    parentTeamId: '두산',
    badgeCode: 'OB',
    badgeColor: '#131230',
  },
  SSG: {
    teamId: 'SSG',
    division: '북부리그',
    officialName: 'SSG 랜더스',
    homeCity: '강화',
    stadium: '강화 SSG퓨처스필드',
    parentTeamId: 'SSG',
    badgeCode: 'SK',
    badgeColor: '#CE0E2D',
  },
  // 남부리그 (6팀: 울산, 롯데, NC, KT, KIA, 삼성)
  울산: {
    teamId: '울산',
    division: '남부리그',
    officialName: '울산 웨일즈',
    homeCity: '울산',
    stadium: '울산 문수야구장',
    badgeCode: '울산',
    badgeColor: '#B91C1C',
  },
  롯데: {
    teamId: '롯데',
    division: '남부리그',
    officialName: '롯데 자이언츠',
    homeCity: '상동',
    stadium: '김해 상동야구장',
    parentTeamId: '롯데',
    badgeCode: 'LT',
    badgeColor: '#041E42',
  },
  NC: {
    teamId: 'NC',
    division: '남부리그',
    officialName: 'NC 다이노스',
    homeCity: '마산',
    stadium: '창원 마산야구장',
    parentTeamId: 'NC',
    badgeCode: 'NC',
    badgeColor: '#1D467D',
  },
  KT: {
    teamId: 'KT',
    division: '남부리그',
    officialName: 'KT 위즈',
    homeCity: '익산',
    stadium: '익산 국가대표야구훈련장',
    parentTeamId: 'KT',
    badgeCode: 'KT',
    badgeColor: '#111111',
  },
  KIA: {
    teamId: 'KIA',
    division: '남부리그',
    officialName: 'KIA 타이거즈',
    homeCity: '함평',
    stadium: '함평 기아챌린저스필드',
    parentTeamId: 'KIA',
    badgeCode: 'HT',
    badgeColor: '#EA0029',
  },
  삼성: {
    teamId: '삼성',
    division: '남부리그',
    officialName: '삼성 라이온즈',
    homeCity: '경산',
    stadium: '경산 볼파크',
    parentTeamId: '삼성',
    badgeCode: 'SS',
    badgeColor: '#074CA1',
  },
};

export const FUTURES_NORTH_TEAMS: (TeamId | '상무' | '울산')[] = [
  '상무',
  '한화',
  '키움',
  'LG',
  '두산',
  'SSG',
];

export const FUTURES_SOUTH_TEAMS: (TeamId | '상무' | '울산')[] = [
  '울산',
  '롯데',
  'NC',
  'KT',
  'KIA',
  '삼성',
];

export const FUTURES_TEAM_IDS: (TeamId | '상무' | '울산')[] = [
  ...FUTURES_NORTH_TEAMS,
  ...FUTURES_SOUTH_TEAMS,
];

// Approximate stadium coordinates (lat, lng) for realistic KBO home/away travel distance (km)
const TEAM_COORDS: Record<TeamId, [number, number]> = {
  LG: [37.5122, 127.0719], // 잠실
  두산: [37.5122, 127.0719], // 잠실
  키움: [37.4982, 126.8671], // 고척
  SSG: [37.437, 126.6933], // 문학
  KT: [37.2997, 127.0097], // 수원
  한화: [36.3171, 127.4292], // 대전
  KIA: [35.1682, 126.8891], // 광주
  삼성: [35.8411, 128.6815], // 대구
  NC: [35.2225, 128.5823], // 창원
  롯데: [35.194, 129.0615], // 부산 사직
};

export function computeTravelDistanceKm(fromHome: TeamId, toHome: TeamId): number {
  if (fromHome === toHome) return 0;
  const [lat1, lon1] = TEAM_COORDS[fromHome];
  const [lat2, lon2] = TEAM_COORDS[toHome];
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const straightKm = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Highway distance factor (~1.22x straight line in Korea)
  return Math.round(straightKm * 1.22);
}
