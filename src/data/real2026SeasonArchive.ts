import { ChampionRecord, SeasonHistorySummary, TeamId } from '../types/kbo';

export interface Real2026StandingRow {
  regularRank: number;
  finalRank: number;
  teamId: TeamId;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winPct: number;
  gamesBehind: number;
  postseasonNote: string;
}

export interface Real2026HeadToHeadRecord {
  wins: number;
  draws: number;
  losses: number;
}

export interface Real2026PostseasonSeries {
  round: 'WILDCARD' | 'SEMI_PO' | 'PO' | 'KOREAN_SERIES';
  title: string;
  higherSeedTeam: TeamId;
  higherSeedRank: number;
  lowerSeedTeam: TeamId;
  lowerSeedRank: number;
  winnerTeam: TeamId;
  seriesScore: string;
  mvpName: string;
  mvpTeamId: TeamId;
  mvpSummary: string;
  note: string;
}

export interface Real2026AwardRecord {
  category: string;
  status: '확정' | '미확정';
  playerName?: string;
  kboPlayerId?: string;
  teamId?: TeamId;
  statSummary?: string;
  coWinners?: { playerName: string; kboPlayerId?: string; teamId: TeamId; statSummary: string }[];
  pendingNote?: string;
}

export interface Real2026FaApprovedEntry {
  playerName: string;
  teamId: TeamId;
  grade: 'A' | 'B' | 'C';
  contractStatus: '미확정 (FA 협상 대기)';
}

export interface Real2026ConfirmedMove {
  playerName: string;
  teamId: TeamId;
  moveType: '은퇴' | '보직전환' | 'FA미신청';
  summary: string;
}

/**
 * 2026 KBO 정규시즌 최종 순위 (144경기 완주 · 총 720경기 · 703승 703패 34무)
 * - 고정된 실제 역사 데이터이며 게임 내에서 재시뮬레이션하지 않습니다.
 */
export const REAL_2026_STANDINGS: Real2026StandingRow[] = [
  {
    regularRank: 1,
    finalRank: 2,
    teamId: 'KT',
    games: 144,
    wins: 90,
    losses: 49,
    draws: 5,
    winPct: 0.647,
    gamesBehind: 0.0,
    postseasonNote: '정규시즌 1위 · 한국시리즈 준우승 (삼성 상대 1승 4패)',
  },
  {
    regularRank: 2,
    finalRank: 1,
    teamId: '삼성',
    games: 144,
    wins: 83,
    losses: 58,
    draws: 3,
    winPct: 0.589,
    gamesBehind: 8.0,
    postseasonNote: '한국시리즈 우승 (통산 9회 · 12년 만의 우승)',
  },
  {
    regularRank: 3,
    finalRank: 3,
    teamId: 'KIA',
    games: 144,
    wins: 79,
    losses: 63,
    draws: 2,
    winPct: 0.556,
    gamesBehind: 12.5,
    postseasonNote: '준PO 3승 0패 돌파 · PO 2승 3패 마감',
  },
  {
    regularRank: 4,
    finalRank: 4,
    teamId: 'LG',
    games: 144,
    wins: 78,
    losses: 65,
    draws: 1,
    winPct: 0.545,
    gamesBehind: 14.0,
    postseasonNote: 'WC 승리(4-1) · 준PO 0승 3패 마감',
  },
  {
    regularRank: 5,
    finalRank: 5,
    teamId: '두산',
    games: 144,
    wins: 73,
    losses: 66,
    draws: 5,
    winPct: 0.525,
    gamesBehind: 17.0,
    postseasonNote: '와일드카드 결정전 진출',
  },
  {
    regularRank: 6,
    finalRank: 6,
    teamId: 'SSG',
    games: 144,
    wins: 65,
    losses: 74,
    draws: 5,
    winPct: 0.468,
    gamesBehind: 25.0,
    postseasonNote: '정규시즌 6위',
  },
  {
    regularRank: 7,
    finalRank: 7,
    teamId: '롯데',
    games: 144,
    wins: 64,
    losses: 77,
    draws: 3,
    winPct: 0.454,
    gamesBehind: 27.0,
    postseasonNote: '정규시즌 7위',
  },
  {
    regularRank: 8,
    finalRank: 8,
    teamId: 'NC',
    games: 144,
    wins: 64,
    losses: 78,
    draws: 2,
    winPct: 0.451,
    gamesBehind: 27.5,
    postseasonNote: '정규시즌 8위',
  },
  {
    regularRank: 9,
    finalRank: 9,
    teamId: '한화',
    games: 144,
    wins: 57,
    losses: 83,
    draws: 4,
    winPct: 0.407,
    gamesBehind: 33.5,
    postseasonNote: '정규시즌 9위',
  },
  {
    regularRank: 10,
    finalRank: 10,
    teamId: '키움',
    games: 144,
    wins: 50,
    losses: 90,
    draws: 4,
    winPct: 0.357,
    gamesBehind: 40.5,
    postseasonNote: '정규시즌 10위',
  },
];

/**
 * 2026 KBO 팀간 상대전적 (공식 확인된 대진만 수록 · 미확인 대진은 null로 표기하며 임의 생성하지 않음)
 */
const VERIFIED_H2H_PAIRS: [TeamId, TeamId, number, number, number][] = [
  // [teamA, teamB, winsA, draws, lossesA] (총 16경기 대칭 반영)
  ['두산', '키움', 11, 1, 4],
  ['두산', 'SSG', 8, 0, 8],
  ['두산', 'LG', 4, 1, 11],
  ['두산', 'NC', 12, 0, 4],
  ['두산', 'KT', 4, 1, 11],
  ['두산', 'KIA', 7, 0, 9],
  ['두산', '삼성', 7, 1, 8],
  ['두산', '한화', 6, 0, 10],
  ['두산', '롯데', 8, 1, 7],
  ['KT', '키움', 11, 1, 4],
  ['KT', 'SSG', 8, 1, 7],
  ['KT', 'LG', 10, 0, 6],
  ['KT', 'NC', 11, 0, 5],
  ['KT', 'KIA', 10, 0, 6],
  ['KT', '한화', 12, 1, 3],
  ['KT', '롯데', 10, 1, 5],
  ['KIA', 'SSG', 11, 1, 4],
  ['KIA', 'NC', 11, 0, 5],
  ['KIA', '삼성', 9, 0, 7],
  ['KIA', '한화', 10, 0, 6],
  ['KIA', '롯데', 10, 1, 5],
  ['키움', 'SSG', 8, 0, 8],
  ['키움', 'LG', 6, 0, 10],
  ['키움', 'NC', 8, 0, 8],
  ['키움', '삼성', 4, 1, 11],
  ['키움', '롯데', 2, 0, 14],
];

export const REAL_2026_HEAD_TO_HEAD: Record<
  TeamId,
  Partial<Record<TeamId, Real2026HeadToHeadRecord | null>>
> = (() => {
  const matrix: Record<TeamId, Partial<Record<TeamId, Real2026HeadToHeadRecord | null>>> = {
    KT: {},
    삼성: {},
    KIA: {},
    LG: {},
    두산: {},
    SSG: {},
    롯데: {},
    NC: {},
    한화: {},
    키움: {},
  };
  for (const [a, b, wA, d, lA] of VERIFIED_H2H_PAIRS) {
    matrix[a][b] = { wins: wA, draws: d, losses: lA };
    matrix[b][a] = { wins: lA, draws: d, losses: wA };
  }
  return matrix;
})();

export function getReal2026HeadToHead(
  teamA: TeamId,
  teamB: TeamId
): Real2026HeadToHeadRecord | null {
  if (teamA === teamB) return null;
  return REAL_2026_HEAD_TO_HEAD[teamA]?.[teamB] ?? null;
}

/**
 * 2026 KBO 포스트시즌 공식 결과 (삼성 라이온즈 한국시리즈 우승)
 */
export const REAL_2026_POSTSEASON: Real2026PostseasonSeries[] = [
  {
    round: 'WILDCARD',
    title: '와일드카드 결정전',
    higherSeedTeam: 'LG',
    higherSeedRank: 4,
    lowerSeedTeam: '두산',
    lowerSeedRank: 5,
    winnerTeam: 'LG',
    seriesScore: 'LG 승 (1차전 4-1)',
    mvpName: 'LG 투타 합작',
    mvpTeamId: 'LG',
    mvpSummary: '잠실 라이벌전 1차전 4-1 승리로 준플레이오프 직행',
    note: '4위 어드밴티지 1승 포함 1차전 종료',
  },
  {
    round: 'SEMI_PO',
    title: '준플레이오프 (5전 3선승제)',
    higherSeedTeam: 'KIA',
    higherSeedRank: 3,
    lowerSeedTeam: 'LG',
    lowerSeedRank: 4,
    winnerTeam: 'KIA',
    seriesScore: '3승 0패 (스윕)',
    mvpName: '김도영',
    mvpTeamId: 'KIA',
    mvpSummary: '3경기 3홈런 8타점 맹타로 스윕 견인',
    note: 'KIA 타이거즈 플레이오프 진출',
  },
  {
    round: 'PO',
    title: '플레이오프 (5전 3선승제)',
    higherSeedTeam: '삼성',
    higherSeedRank: 2,
    lowerSeedTeam: 'KIA',
    lowerSeedRank: 3,
    winnerTeam: '삼성',
    seriesScore: '3승 2패',
    mvpName: '아리엘 후라도',
    mvpTeamId: '삼성',
    mvpSummary: '2경기 13⅔이닝 2자책 ERA 1.32 2승',
    note: '5차전 혈투 끝 삼성 라이온즈 한국시리즈 진출',
  },
  {
    round: 'KOREAN_SERIES',
    title: '한국시리즈 (7전 4선승제)',
    higherSeedTeam: 'KT',
    higherSeedRank: 1,
    lowerSeedTeam: '삼성',
    lowerSeedRank: 2,
    winnerTeam: '삼성',
    seriesScore: '4승 1패 (1차전 패 후 4연승)',
    mvpName: '구자욱',
    mvpTeamId: '삼성',
    mvpSummary: '5경기 타율 .500 (20타수 10안타) 1홈런 6타점 5득점',
    note: '삼성 라이온즈 12년 만의 통산 9회 한국시리즈 우승',
  },
];

/**
 * 2026 KBO 주요 시상 현황
 * - 공식 발표 전인 MVP, 신인왕, 골든글러브는 임의로 생성하지 않고 반드시 '미확정' 상태로 유지합니다.
 */
export const REAL_2026_MAJOR_AWARDS: Real2026AwardRecord[] = [
  {
    category: '한국시리즈 MVP',
    status: '확정',
    playerName: '구자욱',
    kboPlayerId: '62404',
    teamId: '삼성',
    statSummary: '5G 타율 .500 (20타수 10안타) 1HR 6RBI 5R · 삼성 통산 9회 우승 주역',
  },
  {
    category: '정규시즌 MVP',
    status: '미확정',
    pendingNote: '공식 시상식 발표 전 미확정 상태 (유력 후보: 김도영·곽빈 등)',
  },
  {
    category: '신인왕',
    status: '미확정',
    pendingNote: '공식 시상식 발표 전 미확정 상태',
  },
  {
    category: '골든글러브 (10개 부문)',
    status: '미확정',
    pendingNote: '2026년 12월 공식 시상식 발표 전 미확정 상태',
  },
];

/**
 * 2026 KBO 정규시즌 공식 개인 타이틀 (확정)
 */
export const REAL_2026_BATTING_TITLES: Real2026AwardRecord[] = [
  {
    category: '타율왕',
    status: '확정',
    playerName: '구자욱',
    kboPlayerId: '62404',
    teamId: '삼성',
    statSummary: '타율 .371 (114G 156안타)',
  },
  {
    category: '홈런왕',
    status: '확정',
    playerName: '김도영',
    kboPlayerId: '52605',
    teamId: 'KIA',
    statSummary: '45홈런 (타율 .308)',
  },
  {
    category: '최다안타왕',
    status: '확정',
    playerName: '빅터 레이예스',
    teamId: '롯데',
    statSummary: '211안타 (KBO 역대 단일시즌 최다안타 신기록)',
  },
  {
    category: '타점왕',
    status: '확정',
    playerName: '샘 힐리어드',
    teamId: 'KT',
    statSummary: '139타점',
  },
  {
    category: '출루율왕',
    status: '확정',
    playerName: '구자욱',
    kboPlayerId: '62404',
    teamId: '삼성',
    statSummary: '출루율 .458',
  },
  {
    category: '장타율왕',
    status: '확정',
    playerName: '김도영',
    kboPlayerId: '52605',
    teamId: 'KIA',
    statSummary: '장타율 .647',
  },
  {
    category: '득점왕',
    status: '확정',
    playerName: '최원준',
    teamId: 'KT',
    statSummary: '125득점',
  },
  {
    category: '도루왕',
    status: '확정',
    playerName: '황성빈',
    teamId: '롯데',
    statSummary: '55도루',
  },
];

export const REAL_2026_PITCHING_TITLES: Real2026AwardRecord[] = [
  {
    category: '다승왕 (공동)',
    status: '확정',
    coWinners: [
      { playerName: '임찬규', teamId: 'LG', statSummary: '15승' },
      { playerName: '고영표', teamId: 'KT', statSummary: '15승' },
    ],
    statSummary: '임찬규(LG) · 고영표(KT) 공동 15승',
  },
  {
    category: '평균자책점왕',
    status: '확정',
    playerName: '곽빈',
    teamId: '두산',
    statSummary: 'ERA 2.24',
  },
  {
    category: '탈삼진왕',
    status: '확정',
    playerName: '곽빈',
    teamId: '두산',
    statSummary: '197탈삼진',
  },
  {
    category: '세이브왕',
    status: '확정',
    playerName: '김재윤',
    teamId: '삼성',
    statSummary: '35세이브',
  },
  {
    category: '홀드왕',
    status: '확정',
    playerName: '스기모토 코우키',
    teamId: 'KT',
    statSummary: '25홀드 (아시아쿼터)',
  },
  {
    category: '승률왕',
    status: '확정',
    playerName: '소형준',
    teamId: 'KT',
    statSummary: '승률 .769',
  },
];

/**
 * 2027 FA 최종 승인 22명 공식 명단 (2026-11-16 KBO 공식 공시 · 미발표 계약은 미확정/FA 협상 대기 유지)
 */
export const REAL_2027_FA_APPROVED_22: Real2026FaApprovedEntry[] = [
  { playerName: '구자욱', teamId: '삼성', grade: 'A', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '원태인', teamId: '삼성', grade: 'A', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '홍창기', teamId: 'LG', grade: 'A', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '김민혁', teamId: 'KT', grade: 'A', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '배정대', teamId: 'KT', grade: 'A', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '박상원', teamId: '한화', grade: 'A', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '박동원', teamId: 'LG', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '최지훈', teamId: 'SSG', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '박치국', teamId: '두산', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '정수빈', teamId: '두산', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '권희동', teamId: 'NC', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '최재훈', teamId: '한화', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '김민수', teamId: 'KT', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '한승혁', teamId: 'KT', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '오윤석', teamId: 'KT', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '김태군', teamId: 'KIA', grade: 'B', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '양의지', teamId: '두산', grade: 'C', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '김상수', teamId: 'KT', grade: 'C', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '김호령', teamId: 'KIA', grade: 'C', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '전병우', teamId: '삼성', grade: 'C', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '문승원', teamId: 'SSG', grade: 'C', contractStatus: '미확정 (FA 협상 대기)' },
  { playerName: '오태곤', teamId: 'SSG', grade: 'C', contractStatus: '미확정 (FA 협상 대기)' },
];

export const REAL_2026_CONFIRMED_OFFSEASON_MOVES: Real2026ConfirmedMove[] = [
  {
    playerName: '김성현',
    teamId: 'SSG',
    moveType: '은퇴',
    summary: '2026시즌 종료 후 현역 은퇴 공식 발표',
  },
  {
    playerName: '이재원',
    teamId: '한화',
    moveType: '보직전환',
    summary: '한화 이글스 플레잉코치 전환 (FA 미신청)',
  },
  {
    playerName: '서진용 · 한유섬 · 박승욱',
    teamId: 'SSG',
    moveType: 'FA미신청',
    summary: '2027 FA 권리 미행사 · 원소속 구단 잔류',
  },
  {
    playerName: '최주환',
    teamId: '키움',
    moveType: 'FA미신청',
    summary: '2027 FA 권리 미행사 · 원소속 구단 잔류',
  },
];

export const REAL_2026_CHAMPION_RECORD: ChampionRecord = {
  season: 2026,
  championTeamId: '삼성',
  runnerUpTeamId: 'KT',
  seriesScore: '4승 1패',
  ksMvpName: '구자욱',
  ksMvpSummary: '2026 KBO 한국시리즈 우승 (통산 9회 · 5G 타율 .500 10안타 1HR 6RBI)',
  rewardCashBillion: 0,
  isHistoricalBaseline: true,
  date: '2026-10-31',
};

export function buildReal2026SeasonHistorySummary(playerTeamId: TeamId): SeasonHistorySummary {
  const myRow =
    REAL_2026_STANDINGS.find((r) => r.teamId === playerTeamId) ?? REAL_2026_STANDINGS[0];
  return {
    season: 2026,
    regularChampionTeamId: 'KT',
    koreanSeriesChampionTeamId: '삼성',
    runnerUpTeamId: 'KT',
    playerTeamId,
    playerTeamRank: myRow.finalRank,
    playerTeamRecord: `${myRow.wins}승 ${myRow.losses}패 ${myRow.draws}무 (${myRow.winPct.toFixed(3)})`,
    seasonMvpName: '미확정 (발표 전)',
    ksMvpName: '구자욱 (삼성)',
    hrLeader: '김도영 45HR',
    avgLeader: '구자욱 .371',
    winsLeader: '임찬규·고영표 15승',
    eraLeader: '곽빈 2.24',
  };
}

export const REAL_2026_DATA_METADATA = {
  season: 2026,
  isHistoricalLocked: true,
  totalRegularGames: 720,
  gamesPerTeam: 144,
  sourceNote: 'KBO 공식 기록 기준 (미발표 시상·FA 계약·미확인 상대전적·미확인 퓨처스 기록은 임의 생성 없이 미확정/미확인 처리)',
  draft2027Count: 110,
  faApproved2027Count: 22,
};
