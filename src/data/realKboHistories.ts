import { ClubUniformEdition, PlayerTeamHistoryEntry, RookieBonusRankEntry, TeamId } from '../types/kbo';

export interface RealPlayerClubProfile {
  /** 매칭 대상 선수명 */
  name: string;
  /** 로스터 축약명·별칭 (예: '오스틴', '레이예스', '잭로그') */
  aliases?: string[];
  /** 원클럽맨 여부 (해외 진출 후 친정 복귀 포함, 타 KBO 구단 소속 이력이 없는 경우 true) */
  isOneClubMan: boolean;
  /** KBO 현 소속 구단 누적 시즌 수(2026 기준) */
  clubTenure2026: number;
  /** 프랜차이즈 상징 가중치 (실제 구단 간판/레전드 보정: 0..25) */
  franchiseIconBonus: number;
  /** 역대 소속 구단 순서대로 */
  history: PlayerTeamHistoryEntry[];
  /** 동명이인 구분용 현재 소속팀 힌트 (선택) */
  expectedTeamId?: TeamId;
}

/**
 * 실제 KBO 공식 이력 기반 프랜차이즈 스타 · 원클럽맨 · 역대 소속 구단 마스터 테이블
 * - 원클럽맨: KBO 타 구단 이적 이력이 없는 선수 (MLB 진출 후 원소속 복귀는 원클럽맨 유지)
 * - FA/트레이드 이적생: 실제 전 소속 구단 순서를 모두 표기하고 원클럽맨 false 처리
 */
export const REAL_KBO_CAREER_HISTORIES: RealPlayerClubProfile[] = [
  // ===================== SSG 랜더스 =====================
  {
    name: '최정',
    expectedTeamId: 'SSG',
    isOneClubMan: true,
    clubTenure2026: 22,
    franchiseIconBonus: 25,
    history: [
      { teamLabel: 'SK 와이번스 / SSG 랜더스', teamId: 'SSG', fromSeason: 2005, note: '2005 1차지명 · KBO 통산 최다 홈런' },
    ],
  },
  {
    name: '김광현',
    expectedTeamId: 'SSG',
    isOneClubMan: true,
    clubTenure2026: 18,
    franchiseIconBonus: 24,
    history: [
      { teamLabel: 'SK 와이번스', teamId: 'SSG', league: 'KBO', fromSeason: 2007, toSeason: 2019, note: '2007 1차지명' },
      { teamLabel: '세인트루이스 카디널스', league: 'MLB', mlbTeamName: 'St. Louis Cardinals', fromSeason: 2020, toSeason: 2021, note: 'MLB 포스팅 진출 · 2시즌 10승 7패 ERA 2.97' },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', league: 'KBO', fromSeason: 2022, note: '친정 복귀' },
    ],
  },
  {
    name: '한유섬',
    expectedTeamId: 'SSG',
    isOneClubMan: true,
    clubTenure2026: 15,
    franchiseIconBonus: 14,
    history: [
      { teamLabel: 'SK 와이번스 / SSG 랜더스', teamId: 'SSG', fromSeason: 2012, note: '2012 9R 지명' },
    ],
  },
  {
    name: '박성한',
    expectedTeamId: 'SSG',
    isOneClubMan: true,
    clubTenure2026: 10,
    franchiseIconBonus: 10,
    history: [
      { teamLabel: 'SK 와이번스 / SSG 랜더스', teamId: 'SSG', fromSeason: 2017 },
    ],
  },
  {
    name: '최지훈',
    expectedTeamId: 'SSG',
    isOneClubMan: true,
    clubTenure2026: 7,
    franchiseIconBonus: 9,
    history: [
      { teamLabel: 'SK 와이번스 / SSG 랜더스', teamId: 'SSG', fromSeason: 2020 },
    ],
  },
  {
    name: '노경은',
    expectedTeamId: 'SSG',
    isOneClubMan: false,
    clubTenure2026: 5,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2003, toSeason: 2016 },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2016, toSeason: 2021 },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', fromSeason: 2022, note: '입단 테스트 합류' },
    ],
  },
  {
    name: '이지영',
    expectedTeamId: 'SSG',
    isOneClubMan: false,
    clubTenure2026: 3,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2008, toSeason: 2018 },
      { teamLabel: '키움 히어로즈', teamId: '키움', fromSeason: 2019, toSeason: 2023 },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', fromSeason: 2024, note: '사인앤트레이드' },
    ],
  },

  // ===================== KIA 타이거즈 =====================
  {
    name: '양현종',
    expectedTeamId: 'KIA',
    isOneClubMan: true,
    clubTenure2026: 19,
    franchiseIconBonus: 25,
    history: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2007, toSeason: 2020, note: '2007 2차 1R' },
      { teamLabel: '텍사스 레인저스', league: 'MLB', mlbTeamName: 'Texas Rangers', fromSeason: 2021, toSeason: 2021, note: 'MLB 진출 (12경기 등판)' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2022, note: '친정 복귀' },
    ],
  },
  {
    name: '최형우',
    expectedTeamId: '삼성',
    isOneClubMan: false,
    clubTenure2026: 16,
    franchiseIconBonus: 16,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2002, toSeason: 2016, note: '2002 2차 6R · 삼성 왕조 4번타자' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2017, toSeason: 2025, transferDate: '2016-11-24', moveType: 'FA 이적', note: 'FA 이적 · KIA 통합우승 주역' },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2026, transferDate: '2025-11-25', moveType: 'FA 이적', note: 'FA 2년 계약 친정 삼성 복귀' },
    ],
  },
  {
    name: '김선빈',
    expectedTeamId: 'KIA',
    isOneClubMan: true,
    clubTenure2026: 19,
    franchiseIconBonus: 18,
    history: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2008, note: '2008 2차 6R · 원클럽맨' },
    ],
  },
  {
    name: '나성범',
    expectedTeamId: 'KIA',
    isOneClubMan: false,
    clubTenure2026: 5,
    franchiseIconBonus: 6,
    history: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2012, toSeason: 2021, note: 'NC 창단 프랜차이즈 스타' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2022, note: 'FA 6년 계약 이적' },
    ],
  },
  {
    name: '김도영',
    expectedTeamId: 'KIA',
    isOneClubMan: true,
    clubTenure2026: 5,
    franchiseIconBonus: 16,
    history: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2022, note: '2022 1차지명 · 2024 정규시즌 MVP' },
    ],
  },
  {
    name: '정해영',
    expectedTeamId: 'KIA',
    isOneClubMan: true,
    clubTenure2026: 7,
    franchiseIconBonus: 11,
    history: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2020, note: '2020 1차지명' },
    ],
  },
  {
    name: '박찬호',
    expectedTeamId: '두산',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2014, toSeason: 2025, moveType: '입단', note: '2014 2차 5R 지명' },
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2026, transferDate: '2025-11-18', moveType: 'FA 이적', note: 'FA 4년 최대 80억 이적' },
    ],
  },
  {
    name: '이의리',
    expectedTeamId: 'KIA',
    isOneClubMan: true,
    clubTenure2026: 6,
    franchiseIconBonus: 9,
    history: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2021, note: '2021 1차지명 · 신인왕' },
    ],
  },
  {
    name: '조상우',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', fromSeason: 2013, toSeason: 2024 },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2025, note: '트레이드 이적' },
    ],
  },

  // ===================== 한화 이글스 =====================
  {
    name: '류현진',
    expectedTeamId: '한화',
    isOneClubMan: true,
    clubTenure2026: 10,
    franchiseIconBonus: 25,
    history: [
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2006, toSeason: 2012, note: '2006 신인왕·MVP 동시 석권' },
      { teamLabel: 'LA 다저스', league: 'MLB', mlbTeamName: 'Los Angeles Dodgers', fromSeason: 2013, toSeason: 2019, note: 'MLB 포스팅 진출 · 2019 NL 평균자책점 1위' },
      { teamLabel: '토론토 블루제이스', league: 'MLB', mlbTeamName: 'Toronto Blue Jays', fromSeason: 2020, toSeason: 2023, note: 'MLB FA 4년 계약 · 2020 AL 사이영상 3위' },
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2024, note: '8년 계약 친정 복귀' },
    ],
  },
  {
    name: '노시환',
    expectedTeamId: '한화',
    isOneClubMan: true,
    clubTenure2026: 8,
    franchiseIconBonus: 17,
    history: [
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2019, note: '2019 2차 1R · 홈런왕·타점왕' },
    ],
  },
  {
    name: '문동주',
    expectedTeamId: '한화',
    isOneClubMan: true,
    clubTenure2026: 5,
    franchiseIconBonus: 14,
    history: [
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2022, note: '2022 1차지명 · 2023 신인왕' },
    ],
  },
  {
    name: '김서현',
    expectedTeamId: '한화',
    isOneClubMan: true,
    clubTenure2026: 4,
    franchiseIconBonus: 10,
    history: [
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2023, note: '2023 전체 1순위' },
    ],
  },
  {
    name: '문현빈',
    expectedTeamId: '한화',
    isOneClubMan: true,
    clubTenure2026: 4,
    franchiseIconBonus: 8,
    history: [
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2023, note: '2023 2R 지명' },
    ],
  },
  {
    name: '채은성',
    expectedTeamId: '한화',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 6,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2009, toSeason: 2022 },
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2023, note: 'FA 6년 계약 · 주장' },
    ],
  },
  {
    name: '안치홍',
    expectedTeamId: '키움',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2009, toSeason: 2019 },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2020, toSeason: 2023 },
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2024, toSeason: 2025, moveType: 'FA 이적', note: 'FA 이적' },
      { teamLabel: '키움 히어로즈', teamId: '키움', fromSeason: 2026, transferDate: '2025-11-19', moveType: '2차 드래프트', note: '2차 드래프트 1R 전체 1순위 이적' },
    ],
  },
  {
    name: '손아섭',
    expectedTeamId: 'NC',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 5,
    history: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2007, toSeason: 2021, moveType: '입단', note: '2007 2차 4R · KBO 통산 최다 안타' },
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2022, toSeason: 2025, transferDate: '2021-12-24', endDate: '2025-07-31', moveType: 'FA 이적', note: 'FA 4년 계약 이적' },
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2025, toSeason: 2026, transferDate: '2025-07-31', endDate: '2026-04-14', moveType: '트레이드', note: '2025-07-31 트레이드 이적 · 2026-02 FA 잔류' },
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2026, toSeason: 2026, transferDate: '2026-04-14', endDate: '2026-10-19', moveType: '트레이드', note: '2026-04-14 트레이드 이적 · 2026-10-19 방출' },
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2027, transferDate: '2026-10-27', moveType: '자유계약', note: '2026-10-27 친정 NC 복귀 (연봉 5,000만 원)' },
    ],
  },
  {
    name: '최재훈',
    expectedTeamId: '한화',
    isOneClubMan: false,
    clubTenure2026: 10,
    franchiseIconBonus: 8,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2008, toSeason: 2017 },
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2017, note: '트레이드 이적 · 주전 포수' },
    ],
  },
  {
    name: '엄상백',
    expectedTeamId: '한화',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2015, toSeason: 2024 },
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2025, note: 'FA 4년 계약 이적' },
    ],
  },
  {
    name: '심우준',
    expectedTeamId: '한화',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2014, toSeason: 2024 },
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2025, note: 'FA 4년 계약 이적' },
    ],
  },
  {
    name: '주현상',
    expectedTeamId: '한화',
    isOneClubMan: true,
    clubTenure2026: 12,
    franchiseIconBonus: 8,
    history: [
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2015 },
    ],
  },

  // ===================== LG 트윈스 =====================
  {
    name: '오지환',
    expectedTeamId: 'LG',
    isOneClubMan: true,
    clubTenure2026: 18,
    franchiseIconBonus: 23,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2009, note: '2009 1차지명 · 2023 KS MVP · 원클럽맨' },
    ],
  },
  {
    name: '임찬규',
    expectedTeamId: 'LG',
    isOneClubMan: true,
    clubTenure2026: 16,
    franchiseIconBonus: 18,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2011, note: '2011 1R 지명 · 원클럽맨' },
    ],
  },
  {
    name: '홍창기',
    expectedTeamId: 'LG',
    isOneClubMan: true,
    clubTenure2026: 11,
    franchiseIconBonus: 16,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2016, note: '출루왕 3회 · 원클럽맨' },
    ],
  },
  {
    name: '문보경',
    expectedTeamId: 'LG',
    isOneClubMan: true,
    clubTenure2026: 8,
    franchiseIconBonus: 12,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2019 },
    ],
  },
  {
    name: '김현수',
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 6,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2006, toSeason: 2015, note: '타격기계 · 육성선수 신화' },
      { teamLabel: '볼티모어 오리올스', league: 'MLB', mlbTeamName: 'Baltimore Orioles', fromSeason: 2016, toSeason: 2017, note: 'MLB FA 계약 진출' },
      { teamLabel: '필라델피아 필리스', league: 'MLB', mlbTeamName: 'Philadelphia Phillies', fromSeason: 2017, toSeason: 2017, note: '시즌 중 MLB 트레이드 이적' },
      { teamLabel: 'LG 트윈스', teamId: 'LG', league: 'KBO', fromSeason: 2018, toSeason: 2025, moveType: 'FA 이적', note: 'FA 입단 · 통합우승 주장' },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2026, transferDate: '2025-11-26', moveType: 'FA 이적', note: 'FA 3년 총액 50억 이적' },
    ],
  },
  {
    name: '박해민',
    expectedTeamId: 'LG',
    isOneClubMan: false,
    clubTenure2026: 5,
    franchiseIconBonus: 6,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2012, toSeason: 2021 },
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2022, note: 'FA 이적' },
    ],
  },
  {
    name: '박동원',
    expectedTeamId: 'LG',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 5,
    history: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', fromSeason: 2009, toSeason: 2022 },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2022, toSeason: 2022, note: '트레이드' },
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2023, note: 'FA 이적' },
    ],
  },
  {
    name: '신민재',
    expectedTeamId: 'LG',
    isOneClubMan: false,
    clubTenure2026: 9,
    franchiseIconBonus: 6,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2015, toSeason: 2017 },
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2018, note: '2차 드래프트 이적' },
    ],
  },
  {
    name: '손주영',
    expectedTeamId: 'LG',
    isOneClubMan: true,
    clubTenure2026: 10,
    franchiseIconBonus: 9,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2017 },
    ],
  },
  {
    name: '유영찬',
    expectedTeamId: 'LG',
    isOneClubMan: true,
    clubTenure2026: 7,
    franchiseIconBonus: 8,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2020 },
    ],
  },
  {
    name: '장현식',
    expectedTeamId: 'LG',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 1,
    history: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2013, toSeason: 2020 },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2020, toSeason: 2024 },
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2025, note: 'FA 이적' },
    ],
  },

  // ===================== 삼성 라이온즈 =====================
  {
    name: '구자욱',
    expectedTeamId: '삼성',
    isOneClubMan: true,
    clubTenure2026: 15,
    franchiseIconBonus: 23,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2012, note: '2012 2R 지명 · 삼성 주장 · 원클럽맨' },
    ],
  },
  {
    name: '원태인',
    expectedTeamId: '삼성',
    isOneClubMan: true,
    clubTenure2026: 8,
    franchiseIconBonus: 19,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2019, note: '2019 1차지명 · 푸른피의 에이스' },
    ],
  },
  {
    name: '강민호',
    expectedTeamId: '삼성',
    isOneClubMan: false,
    clubTenure2026: 9,
    franchiseIconBonus: 14,
    history: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2004, toSeason: 2017, note: '2004 2차 3R · 국가대표 포수' },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2018, note: 'FA 이적 · KBO 최다 경기 출장 포수' },
    ],
  },
  {
    name: '박병호',
    expectedTeamId: '삼성',
    isOneClubMan: false,
    clubTenure2026: 3,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', league: 'KBO', fromSeason: 2005, toSeason: 2011 },
      { teamLabel: '넥센 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2011, toSeason: 2015, note: '홈런왕 4연패' },
      { teamLabel: '미네소타 트윈스', league: 'MLB', mlbTeamName: 'Minnesota Twins', fromSeason: 2016, toSeason: 2017, note: 'MLB 포스팅 진출 · 2016시즌 12홈런' },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2018, toSeason: 2021 },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2022, toSeason: 2024 },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2024, note: '트레이드 이적' },
    ],
  },
  {
    name: '김지찬',
    expectedTeamId: '삼성',
    isOneClubMan: true,
    clubTenure2026: 7,
    franchiseIconBonus: 10,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2020 },
    ],
  },
  {
    name: '김영웅',
    expectedTeamId: '삼성',
    isOneClubMan: true,
    clubTenure2026: 5,
    franchiseIconBonus: 10,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2022 },
    ],
  },
  {
    name: '이재현',
    expectedTeamId: '삼성',
    isOneClubMan: true,
    clubTenure2026: 5,
    franchiseIconBonus: 10,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2022, note: '2022 1차지명' },
    ],
  },
  {
    name: '백정현',
    expectedTeamId: '삼성',
    isOneClubMan: true,
    clubTenure2026: 20,
    franchiseIconBonus: 14,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2007, note: '원클럽맨 좌완' },
    ],
  },
  {
    name: '김재윤',
    expectedTeamId: '삼성',
    isOneClubMan: false,
    clubTenure2026: 3,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2015, toSeason: 2023 },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2024, note: 'FA 이적' },
    ],
  },

  // ===================== 두산 베어스 =====================
  {
    name: '양의지',
    expectedTeamId: '두산',
    isOneClubMan: false,
    clubTenure2026: 17,
    franchiseIconBonus: 22,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2006, toSeason: 2018, note: '2006 2차 8R · 신인왕·KS MVP' },
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2019, toSeason: 2022, note: 'FA 이적 · 2020 통합우승 KS MVP' },
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2023, note: 'FA 4+2년 친정 복귀' },
    ],
  },
  {
    name: '정수빈',
    expectedTeamId: '두산',
    isOneClubMan: true,
    clubTenure2026: 18,
    franchiseIconBonus: 21,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2009, note: '2009 2차 5R · 잠실 아이돌 · 원클럽맨' },
    ],
  },
  {
    name: '김재환',
    expectedTeamId: 'SSG',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2008, toSeason: 2025, note: '2018 정규시즌 MVP' },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', fromSeason: 2026, transferDate: '2025-12-05', moveType: '자유계약', note: '자유계약 2년 22억 이적' },
    ],
  },
  {
    name: '곽빈',
    expectedTeamId: '두산',
    isOneClubMan: true,
    clubTenure2026: 9,
    franchiseIconBonus: 14,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2018, note: '2018 1차지명 · 다승왕' },
    ],
  },
  {
    name: '김택연',
    expectedTeamId: '두산',
    isOneClubMan: true,
    clubTenure2026: 3,
    franchiseIconBonus: 12,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2024, note: '2024 1R 전체 2번 · 신인왕' },
    ],
  },
  {
    name: '양석환',
    expectedTeamId: '두산',
    isOneClubMan: false,
    clubTenure2026: 6,
    franchiseIconBonus: 6,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2014, toSeason: 2020 },
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2021, note: '잠실 라이벌 트레이드 이적' },
    ],
  },
  {
    name: '홍건희',
    expectedTeamId: 'KIA',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2011, toSeason: 2020 },
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2020, toSeason: 2025, moveType: '트레이드', note: '트레이드 이적' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2026, toSeason: 2026, endDate: '2026-10-23', moveType: '자유계약', note: '2026 친정 복귀 · 2026-10-23 재계약 불가(방출)' },
    ],
  },

  // ===================== KT 위즈 =====================
  {
    name: '고영표',
    expectedTeamId: 'KT',
    isOneClubMan: true,
    clubTenure2026: 13,
    franchiseIconBonus: 22,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2014, note: '창단 원년 멤버 · 원클럽맨 에이스' },
    ],
  },
  {
    name: '강백호',
    expectedTeamId: '한화',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 5,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2018, toSeason: 2025, moveType: '입단', note: '2018 2차 1R 전체 1번 · 신인왕' },
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2026, transferDate: '2025-11-20', moveType: 'FA 이적', note: 'FA 4년 100억 이적' },
    ],
  },
  {
    name: '소형준',
    expectedTeamId: 'KT',
    isOneClubMan: true,
    clubTenure2026: 7,
    franchiseIconBonus: 14,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2020, note: '2020 1차지명 · 신인왕' },
    ],
  },
  {
    name: '박영현',
    expectedTeamId: 'KT',
    isOneClubMan: true,
    clubTenure2026: 5,
    franchiseIconBonus: 13,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2022, note: '2022 1차지명 · 국가대표 마무리' },
    ],
  },
  {
    name: '손동현',
    expectedTeamId: 'KT',
    isOneClubMan: true,
    clubTenure2026: 8,
    franchiseIconBonus: 8,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2019, note: '2019 2차 3R · 원클럽맨 불펜' },
    ],
  },
  {
    name: '허경민',
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 3,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2009, toSeason: 2024, note: '두산 왕조 주전 3루수' },
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2025, note: 'FA 4년 계약 이적' },
    ],
  },
  {
    name: '황재균',
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 9,
    franchiseIconBonus: 9,
    history: [
      { teamLabel: '현대 / 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2006, toSeason: 2010 },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', league: 'KBO', fromSeason: 2010, toSeason: 2016 },
      { teamLabel: '샌프란시스코 자이언츠', league: 'MLB', mlbTeamName: 'San Francisco Giants', fromSeason: 2017, toSeason: 2017, note: 'MLB 진출 · 데뷔전 결승 홈런' },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2018, note: 'FA 이적 · 2021 통합우승 주장' },
    ],
  },
  {
    name: '장성우',
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 12,
    franchiseIconBonus: 10,
    history: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2008, toSeason: 2015 },
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2015, note: '트레이드 이적 · 안방마님' },
    ],
  },
  {
    name: '김상수',
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 3,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', fromSeason: 2009, toSeason: 2022 },
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2023, note: 'FA 이적' },
    ],
  },
  {
    name: '오원석',
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: 'SK / SSG 랜더스', teamId: 'SSG', fromSeason: 2020, toSeason: 2024 },
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2025, note: '트레이드 이적' },
    ],
  },

  // ===================== 롯데 자이언츠 =====================
  {
    name: '전준우',
    expectedTeamId: '롯데',
    isOneClubMan: true,
    clubTenure2026: 19,
    franchiseIconBonus: 23,
    history: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2008, note: '2008 2차 2R · 사직 캡틴 · 원클럽맨' },
    ],
  },
  {
    name: '김원중',
    expectedTeamId: '롯데',
    isOneClubMan: true,
    clubTenure2026: 15,
    franchiseIconBonus: 18,
    history: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2012, note: '구단 역대 최다 세이브 · 원클럽맨' },
    ],
  },
  {
    name: '박세웅',
    expectedTeamId: '롯데',
    isOneClubMan: false,
    clubTenure2026: 12,
    franchiseIconBonus: 15,
    history: [
      { teamLabel: 'KT 위즈', teamId: 'KT', fromSeason: 2014, toSeason: 2015, note: '2014 1차지명' },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2015, note: '트레이드 이적 · 안경 에이스' },
    ],
  },
  {
    name: '구승민',
    expectedTeamId: '롯데',
    isOneClubMan: true,
    clubTenure2026: 14,
    franchiseIconBonus: 13,
    history: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2013, note: '구단 역대 최다 홀드 · 원클럽맨' },
    ],
  },
  {
    name: '윤동희',
    expectedTeamId: '롯데',
    isOneClubMan: true,
    clubTenure2026: 5,
    franchiseIconBonus: 11,
    history: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2022 },
    ],
  },
  {
    name: '나승엽',
    expectedTeamId: '롯데',
    isOneClubMan: true,
    clubTenure2026: 6,
    franchiseIconBonus: 9,
    history: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2021 },
    ],
  },
  {
    name: '유강남',
    expectedTeamId: '롯데',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 3,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2011, toSeason: 2022 },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2023, note: 'FA 이적' },
    ],
  },
  {
    name: '노진혁',
    expectedTeamId: '롯데',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2012, toSeason: 2022 },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2023, note: 'FA 이적' },
    ],
  },
  {
    name: '손호영',
    expectedTeamId: '롯데',
    isOneClubMan: false,
    clubTenure2026: 3,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2020, toSeason: 2024 },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', fromSeason: 2024, note: '트레이드 이적' },
    ],
  },

  // ===================== NC 다이노스 =====================
  {
    name: '박민우',
    expectedTeamId: 'NC',
    isOneClubMan: true,
    clubTenure2026: 15,
    franchiseIconBonus: 23,
    history: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2012, note: '창단 멤버 · 신인왕 · 원클럽맨 주장' },
    ],
  },
  {
    name: '박건우',
    expectedTeamId: 'NC',
    isOneClubMan: false,
    clubTenure2026: 5,
    franchiseIconBonus: 7,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2009, toSeason: 2021 },
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2022, note: 'FA 6년 계약 이적' },
    ],
  },
  {
    name: '권희동',
    expectedTeamId: 'NC',
    isOneClubMan: true,
    clubTenure2026: 14,
    franchiseIconBonus: 12,
    history: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2013, note: '원클럽맨 외야수' },
    ],
  },
  {
    name: '구창모',
    expectedTeamId: 'NC',
    isOneClubMan: true,
    clubTenure2026: 12,
    franchiseIconBonus: 15,
    history: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2015, note: '2020 통합우승 좌완 에이스' },
    ],
  },
  {
    name: '김주원',
    expectedTeamId: 'NC',
    isOneClubMan: true,
    clubTenure2026: 6,
    franchiseIconBonus: 10,
    history: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2021 },
    ],
  },
  {
    name: '김형준',
    expectedTeamId: 'NC',
    isOneClubMan: true,
    clubTenure2026: 9,
    franchiseIconBonus: 10,
    history: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2018 },
    ],
  },
  {
    name: '이용찬',
    expectedTeamId: '두산',
    isOneClubMan: false,
    clubTenure2026: 14,
    franchiseIconBonus: 5,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2007, toSeason: 2020 },
      { teamLabel: 'NC 다이노스', teamId: 'NC', fromSeason: 2021, toSeason: 2025, moveType: 'FA 이적', note: 'FA 이적' },
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2026, moveType: '2차 드래프트', note: '친정 복귀' },
    ],
  },

  // ===================== 키움 히어로즈 =====================
  {
    name: '송성문',
    expectedTeamId: '키움',
    isOneClubMan: true,
    clubTenure2026: 12,
    franchiseIconBonus: 20,
    history: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', fromSeason: 2015, note: '원클럽맨 · 키움 주장' },
    ],
  },
  {
    name: '안우진',
    expectedTeamId: '키움',
    isOneClubMan: true,
    clubTenure2026: 9,
    franchiseIconBonus: 18,
    history: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', fromSeason: 2018, note: '2018 1차지명 · 탈삼진왕·평균자책점 1위' },
    ],
  },
  {
    name: '하영민',
    expectedTeamId: '키움',
    isOneClubMan: true,
    clubTenure2026: 13,
    franchiseIconBonus: 11,
    history: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', fromSeason: 2014 },
    ],
  },
  {
    name: '이주형',
    expectedTeamId: '키움',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 7,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2020, toSeason: 2023 },
      { teamLabel: '키움 히어로즈', teamId: '키움', fromSeason: 2023, note: '트레이드 이적 · 차세대 간판' },
    ],
  },
  {
    name: '최주환',
    expectedTeamId: '키움',
    isOneClubMan: false,
    clubTenure2026: 3,
    franchiseIconBonus: 3,
    history: [
      { teamLabel: '두산 베어스', teamId: '두산', fromSeason: 2006, toSeason: 2020 },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', fromSeason: 2021, toSeason: 2023 },
      { teamLabel: '키움 히어로즈', teamId: '키움', fromSeason: 2024, note: '2차 드래프트 이적' },
    ],
  },
  {
    name: '이용규',
    expectedTeamId: '키움',
    isOneClubMan: false,
    clubTenure2026: 6,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', fromSeason: 2004, toSeason: 2004 },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', fromSeason: 2005, toSeason: 2013 },
      { teamLabel: '한화 이글스', teamId: '한화', fromSeason: 2014, toSeason: 2020 },
      { teamLabel: '키움 히어로즈', teamId: '키움', fromSeason: 2021 },
    ],
  },

  // ===================== MLB 경력 한국인 해외파 · 레전드 (복귀/조회 시 자동 반영) =====================
  {
    name: '오승환',
    expectedTeamId: '삼성',
    isOneClubMan: true,
    clubTenure2026: 16,
    franchiseIconBonus: 24,
    history: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2005, toSeason: 2013, note: '끝판대장 · 삼성 왕조 마무리' },
      { teamLabel: '한신 타이거스', league: 'NPB', fromSeason: 2014, toSeason: 2015, note: 'NPB 센트럴리그 구원왕 2연패' },
      { teamLabel: '세인트루이스 카디널스', league: 'MLB', mlbTeamName: 'St. Louis Cardinals', fromSeason: 2016, toSeason: 2017, note: 'MLB 마무리 · 2시즌 39세이브' },
      { teamLabel: '토론토 블루제이스', league: 'MLB', mlbTeamName: 'Toronto Blue Jays', fromSeason: 2018, toSeason: 2018, note: 'MLB FA 이적' },
      { teamLabel: '콜로라도 로키스', league: 'MLB', mlbTeamName: 'Colorado Rockies', fromSeason: 2018, toSeason: 2019, note: 'MLB 트레이드 이적' },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2020, note: '친정 복귀 · KBO 통산 최다 세이브' },
    ],
  },
  {
    name: '이정후',
    expectedTeamId: '키움',
    isOneClubMan: true,
    clubTenure2026: 7,
    franchiseIconBonus: 20,
    history: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2017, toSeason: 2023, note: '2022 정규시즌 MVP · 타격왕 2회' },
      { teamLabel: '샌프란시스코 자이언츠', league: 'MLB', mlbTeamName: 'San Francisco Giants', fromSeason: 2024, toSeason: 2026, note: 'MLB 포스팅 6년 $113M 계약' },
    ],
  },
  {
    name: '김하성',
    expectedTeamId: '키움',
    isOneClubMan: true,
    clubTenure2026: 7,
    franchiseIconBonus: 18,
    history: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2014, toSeason: 2020, note: '골든글러브 유격수 3연패' },
      { teamLabel: '샌디에이고 파드리스', league: 'MLB', mlbTeamName: 'San Diego Padres', fromSeason: 2021, toSeason: 2024, note: '2023 NL 유틸리티 골드글러브 수상' },
      { teamLabel: '탬파베이 레이스', league: 'MLB', mlbTeamName: 'Tampa Bay Rays', fromSeason: 2025, toSeason: 2026, note: 'MLB FA 계약' },
    ],
  },
  {
    name: '김혜성',
    expectedTeamId: '키움',
    isOneClubMan: true,
    clubTenure2026: 8,
    franchiseIconBonus: 14,
    history: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2017, toSeason: 2024, note: '골든글러브 4연속 수상' },
      { teamLabel: 'LA 다저스', league: 'MLB', mlbTeamName: 'Los Angeles Dodgers', fromSeason: 2025, toSeason: 2026, note: 'MLB 포스팅 진출' },
    ],
  },
  {
    name: '고우석',
    expectedTeamId: 'LG',
    isOneClubMan: true,
    clubTenure2026: 7,
    franchiseIconBonus: 12,
    history: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', league: 'KBO', fromSeason: 2017, toSeason: 2023, note: '2022 세이브왕 · 2023 통합우승 마무리' },
      { teamLabel: '샌디에이고 파드리스', league: 'MLB', mlbTeamName: 'San Diego Padres', fromSeason: 2024, toSeason: 2024, note: 'MLB 포스팅 계약' },
      { teamLabel: '마이애미 말린스', league: 'MLB', mlbTeamName: 'Miami Marlins', fromSeason: 2024, toSeason: 2025, note: 'MLB 트레이드 이적' },
    ],
  },
  {
    name: '배지환',
    isOneClubMan: false,
    clubTenure2026: 0,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: '피츠버그 파이리츠', league: 'MLB', mlbTeamName: 'Pittsburgh Pirates', fromSeason: 2022, toSeason: 2025, note: 'MLB 빅리그 통산 4시즌' },
    ],
  },
  {
    name: '박효준',
    isOneClubMan: false,
    clubTenure2026: 0,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: '뉴욕 양키스', league: 'MLB', mlbTeamName: 'New York Yankees', fromSeason: 2021, toSeason: 2021, note: 'MLB 빅리그 데뷔' },
      { teamLabel: '피츠버그 파이리츠', league: 'MLB', mlbTeamName: 'Pittsburgh Pirates', fromSeason: 2021, toSeason: 2022, note: 'MLB 트레이드 이적' },
    ],
  },

  // ===================== MLB 경력 2026 KBO 외국인 선수 =====================
  {
    name: '요니 치리노스',
    aliases: ['치리노스'],
    expectedTeamId: 'LG',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '탬파베이 레이스', league: 'MLB', mlbTeamName: 'Tampa Bay Rays', fromSeason: 2018, toSeason: 2023, note: 'MLB 선발·벌크가이' },
      { teamLabel: '애틀랜타 브레이브스', league: 'MLB', mlbTeamName: 'Atlanta Braves', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: '마이애미 말린스', league: 'MLB', mlbTeamName: 'Miami Marlins', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: 'LG 트윈스', teamId: 'LG', league: 'KBO', fromSeason: 2025, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '오스틴 딘',
    aliases: ['오스틴'],
    expectedTeamId: 'LG',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 5,
    history: [
      { teamLabel: '마이애미 말린스', league: 'MLB', mlbTeamName: 'Miami Marlins', fromSeason: 2018, toSeason: 2019 },
      { teamLabel: '세인트루이스 카디널스', league: 'MLB', mlbTeamName: 'St. Louis Cardinals', fromSeason: 2020, toSeason: 2021 },
      { teamLabel: '샌프란시스코 자이언츠', league: 'MLB', mlbTeamName: 'San Francisco Giants', fromSeason: 2022, toSeason: 2022 },
      { teamLabel: 'LG 트윈스', teamId: 'LG', league: 'KBO', fromSeason: 2023, note: '골든글러브 1루수 · 타점왕' },
    ],
  },
  {
    name: '오웬 화이트',
    expectedTeamId: '한화',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '텍사스 레인저스', league: 'MLB', mlbTeamName: 'Texas Rangers', fromSeason: 2023, toSeason: 2024, note: 'MLB 2라운드 출신 우완' },
      { teamLabel: '시카고 화이트삭스', league: 'MLB', mlbTeamName: 'Chicago White Sox', fromSeason: 2025, toSeason: 2025 },
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2026, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '미치 화이트',
    aliases: ['화이트'],
    expectedTeamId: 'SSG',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: 'LA 다저스', league: 'MLB', mlbTeamName: 'Los Angeles Dodgers', fromSeason: 2020, toSeason: 2022 },
      { teamLabel: '토론토 블루제이스', league: 'MLB', mlbTeamName: 'Toronto Blue Jays', fromSeason: 2022, toSeason: 2024 },
      { teamLabel: '샌프란시스코 자이언츠', league: 'MLB', mlbTeamName: 'San Francisco Giants', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: '밀워키 브루어스', league: 'MLB', mlbTeamName: 'Milwaukee Brewers', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', league: 'KBO', fromSeason: 2025, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '앤서니 베니지아노',
    aliases: ['베니지아노'],
    expectedTeamId: 'SSG',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '캔자스시티 로열스', league: 'MLB', mlbTeamName: 'Kansas City Royals', fromSeason: 2023, toSeason: 2024 },
      { teamLabel: '마이애미 말린스', league: 'MLB', mlbTeamName: 'Miami Marlins', fromSeason: 2024, toSeason: 2025 },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', league: 'KBO', fromSeason: 2026, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '기예르모 에레디아',
    aliases: ['에레디아'],
    expectedTeamId: 'SSG',
    isOneClubMan: false,
    clubTenure2026: 4,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: '시애틀 매리너스', league: 'MLB', mlbTeamName: 'Seattle Mariners', fromSeason: 2016, toSeason: 2018 },
      { teamLabel: '탬파베이 레이스', league: 'MLB', mlbTeamName: 'Tampa Bay Rays', fromSeason: 2019, toSeason: 2019 },
      { teamLabel: '피츠버그 파이리츠', league: 'MLB', mlbTeamName: 'Pittsburgh Pirates', fromSeason: 2020, toSeason: 2020 },
      { teamLabel: '뉴욕 메츠', league: 'MLB', mlbTeamName: 'New York Mets', fromSeason: 2020, toSeason: 2020 },
      { teamLabel: '애틀랜타 브레이브스', league: 'MLB', mlbTeamName: 'Atlanta Braves', fromSeason: 2021, toSeason: 2022, note: '2021 월드시리즈 우승' },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', league: 'KBO', fromSeason: 2023, note: '2024 타격왕' },
    ],
  },
  {
    name: '아리엘 후라도',
    aliases: ['후라도'],
    expectedTeamId: '삼성',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: '텍사스 레인저스', league: 'MLB', mlbTeamName: 'Texas Rangers', fromSeason: 2018, toSeason: 2019 },
      { teamLabel: '뉴욕 메츠', league: 'MLB', mlbTeamName: 'New York Mets', fromSeason: 2020, toSeason: 2020 },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2023, toSeason: 2024 },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2025, note: '외국인 에이스 영입' },
    ],
  },
  {
    name: '잭 오러클린',
    aliases: ['오러클린'],
    expectedTeamId: '삼성',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '애슬레틱스', league: 'MLB', mlbTeamName: 'Athletics', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2026, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '르윈 디아즈',
    aliases: ['디아즈'],
    expectedTeamId: '삼성',
    isOneClubMan: false,
    clubTenure2026: 3,
    franchiseIconBonus: 3,
    history: [
      { teamLabel: '마이애미 말린스', league: 'MLB', mlbTeamName: 'Miami Marlins', fromSeason: 2020, toSeason: 2022 },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2024, note: '대체 외국인 입단 후 재계약' },
    ],
  },
  {
    name: '맷 데이비슨',
    aliases: ['데이비슨'],
    expectedTeamId: '키움',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: '애리조나 다이아몬드백스', league: 'MLB', mlbTeamName: 'Arizona Diamondbacks', fromSeason: 2013, toSeason: 2013 },
      { teamLabel: '시카고 화이트삭스', league: 'MLB', mlbTeamName: 'Chicago White Sox', fromSeason: 2016, toSeason: 2018 },
      { teamLabel: '신시내티 레즈', league: 'MLB', mlbTeamName: 'Cincinnati Reds', fromSeason: 2020, toSeason: 2020 },
      { teamLabel: '애리조나 다이아몬드백스', league: 'MLB', mlbTeamName: 'Arizona Diamondbacks', fromSeason: 2022, toSeason: 2022 },
      { teamLabel: '애슬레틱스', league: 'MLB', mlbTeamName: 'Athletics', fromSeason: 2022, toSeason: 2022 },
      { teamLabel: '히로시마 도요 카프', league: 'NPB', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: 'NC 다이노스', teamId: 'NC', league: 'KBO', fromSeason: 2024, toSeason: 2026, endDate: '2026-07-05', note: '2024 홈런왕 · 2026-07 웨이버 공시' },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2026, transferDate: '2026-07-10', moveType: '웨이버 클레임', note: '2026-07 웨이버 클레임 이적 · 2027 재계약' },
    ],
  },
  {
    name: '맷 사우어',
    aliases: ['사우어'],
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '캔자스시티 로열스', league: 'MLB', mlbTeamName: 'Kansas City Royals', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: 'LA 다저스', league: 'MLB', mlbTeamName: 'Los Angeles Dodgers', fromSeason: 2025, toSeason: 2025 },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2026, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '케일럽 보쉴리',
    aliases: ['보쉴리'],
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '밀워키 브루어스', league: 'MLB', mlbTeamName: 'Milwaukee Brewers', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: '미네소타 트윈스', league: 'MLB', mlbTeamName: 'Minnesota Twins', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: '텍사스 레인저스', league: 'MLB', mlbTeamName: 'Texas Rangers', fromSeason: 2025, toSeason: 2025 },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2026, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '샘 힐리어드',
    aliases: ['힐리어드'],
    expectedTeamId: 'KT',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '콜로라도 로키스', league: 'MLB', mlbTeamName: 'Colorado Rockies', fromSeason: 2019, toSeason: 2022 },
      { teamLabel: '애틀랜타 브레이브스', league: 'MLB', mlbTeamName: 'Atlanta Braves', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: '콜로라도 로키스', league: 'MLB', mlbTeamName: 'Colorado Rockies', fromSeason: 2024, toSeason: 2025 },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2026, note: '외국인 타자 입단' },
    ],
  },
  {
    name: '엘빈 로드리게스',
    aliases: ['로드리게스'],
    expectedTeamId: '롯데',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '디트로이트 타이거즈', league: 'MLB', mlbTeamName: 'Detroit Tigers', fromSeason: 2022, toSeason: 2022 },
      { teamLabel: '탬파베이 레이스', league: 'MLB', mlbTeamName: 'Tampa Bay Rays', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: '도쿄 야쿠르트 스왈로스', league: 'NPB', fromSeason: 2023, toSeason: 2024 },
      { teamLabel: '밀워키 브루어스', league: 'MLB', mlbTeamName: 'Milwaukee Brewers', fromSeason: 2025, toSeason: 2025 },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', league: 'KBO', fromSeason: 2026, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '제러미 비슬리',
    aliases: ['비슬리'],
    expectedTeamId: '롯데',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '애리조나 다이아몬드백스', league: 'MLB', mlbTeamName: 'Arizona Diamondbacks', fromSeason: 2020, toSeason: 2020 },
      { teamLabel: '토론토 블루제이스', league: 'MLB', mlbTeamName: 'Toronto Blue Jays', fromSeason: 2021, toSeason: 2022 },
      { teamLabel: '한신 타이거스', league: 'NPB', fromSeason: 2023, toSeason: 2025 },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', league: 'KBO', fromSeason: 2026, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '빅터 레이예스',
    aliases: ['레이예스'],
    expectedTeamId: '롯데',
    isOneClubMan: false,
    clubTenure2026: 3,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: '디트로이트 타이거즈', league: 'MLB', mlbTeamName: 'Detroit Tigers', fromSeason: 2018, toSeason: 2022, note: 'MLB 빅리그 5시즌 394경기' },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', league: 'KBO', fromSeason: 2024, note: '2024 KBO 단일시즌 최다 안타(202안타)' },
    ],
  },
  {
    name: '제임스 네일',
    aliases: ['네일'],
    expectedTeamId: 'KIA',
    isOneClubMan: false,
    clubTenure2026: 3,
    franchiseIconBonus: 4,
    history: [
      { teamLabel: '세인트루이스 카디널스', league: 'MLB', mlbTeamName: 'St. Louis Cardinals', fromSeason: 2022, toSeason: 2023 },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2024, note: '2024 평균자책점 1위 · 통합우승 에이스' },
    ],
  },
  {
    name: '애덤 올러',
    aliases: ['올러'],
    expectedTeamId: 'KIA',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 1,
    history: [
      { teamLabel: '애슬레틱스', league: 'MLB', mlbTeamName: 'Athletics', fromSeason: 2022, toSeason: 2023 },
      { teamLabel: '마이애미 말린스', league: 'MLB', mlbTeamName: 'Miami Marlins', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2025, note: '외국인 투수 입단' },
    ],
  },
  {
    name: '해럴드 카스트로',
    aliases: ['카스트로'],
    expectedTeamId: 'KIA',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '디트로이트 타이거즈', league: 'MLB', mlbTeamName: 'Detroit Tigers', fromSeason: 2018, toSeason: 2022, note: 'MLB 빅리그 5시즌 멀티포지션' },
      { teamLabel: '콜로라도 로키스', league: 'MLB', mlbTeamName: 'Colorado Rockies', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2026, note: '외국인 타자 입단' },
    ],
  },
  {
    name: '잭 로그',
    aliases: ['잭로그'],
    expectedTeamId: '두산',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 1,
    history: [
      { teamLabel: '애슬레틱스', league: 'MLB', mlbTeamName: 'Athletics', fromSeason: 2022, toSeason: 2022 },
      { teamLabel: '디트로이트 타이거즈', league: 'MLB', mlbTeamName: 'Detroit Tigers', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: '애틀랜타 브레이브스', league: 'MLB', mlbTeamName: 'Atlanta Braves', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: 'LA 다저스', league: 'MLB', mlbTeamName: 'Los Angeles Dodgers', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2025, note: '외국인 좌완 입단' },
    ],
  },
  {
    name: '크리스 플렉센',
    aliases: ['플렉센'],
    expectedTeamId: '두산',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 2,
    history: [
      { teamLabel: '뉴욕 메츠', league: 'MLB', mlbTeamName: 'New York Mets', fromSeason: 2017, toSeason: 2019 },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2020, toSeason: 2020, note: '2020 포스트시즌 에이스' },
      { teamLabel: '시애틀 매리너스', league: 'MLB', mlbTeamName: 'Seattle Mariners', fromSeason: 2021, toSeason: 2023, note: 'KBO 역수출 · 2021시즌 14승' },
      { teamLabel: '콜로라도 로키스', league: 'MLB', mlbTeamName: 'Colorado Rockies', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: '시카고 화이트삭스', league: 'MLB', mlbTeamName: 'Chicago White Sox', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: '시카고 컵스', league: 'MLB', mlbTeamName: 'Chicago Cubs', fromSeason: 2025, toSeason: 2025 },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2026, note: '두산 친정 복귀' },
    ],
  },
  {
    name: '다즈 카메론',
    aliases: ['카메론'],
    expectedTeamId: '두산',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '디트로이트 타이거즈', league: 'MLB', mlbTeamName: 'Detroit Tigers', fromSeason: 2020, toSeason: 2022 },
      { teamLabel: '애슬레틱스', league: 'MLB', mlbTeamName: 'Athletics', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: '밀워키 브루어스', league: 'MLB', mlbTeamName: 'Milwaukee Brewers', fromSeason: 2025, toSeason: 2025 },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2026, note: '외국인 외야수 입단' },
    ],
  },
  {
    name: '라울 알칸타라',
    aliases: ['알칸타라'],
    expectedTeamId: '키움',
    isOneClubMan: false,
    clubTenure2026: 2,
    franchiseIconBonus: 1,
    history: [
      { teamLabel: '애슬레틱스', league: 'MLB', mlbTeamName: 'Athletics', fromSeason: 2016, toSeason: 2017 },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2019, toSeason: 2019 },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2020, toSeason: 2020, note: '2020 다승왕(20승) · 골든글러브' },
      { teamLabel: '한신 타이거스', league: 'NPB', fromSeason: 2021, toSeason: 2022 },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2023, toSeason: 2024 },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2025, note: '외국인 투수 합류' },
    ],
  },
  {
    name: '트렌턴 브룩스',
    aliases: ['브룩스'],
    expectedTeamId: '키움',
    isOneClubMan: false,
    clubTenure2026: 1,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '샌프란시스코 자이언츠', league: 'MLB', mlbTeamName: 'San Francisco Giants', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: '샌디에이고 파드리스', league: 'MLB', mlbTeamName: 'San Diego Padres', fromSeason: 2025, toSeason: 2025 },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2026, note: '외국인 타자 입단' },
    ],
  },
  {
    name: '제이크 우드포드',
    aliases: ['우드포드'],
    isOneClubMan: false,
    clubTenure2026: 0,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '세인트루이스 카디널스', league: 'MLB', mlbTeamName: 'St. Louis Cardinals', fromSeason: 2020, toSeason: 2023 },
      { teamLabel: '시카고 화이트삭스', league: 'MLB', mlbTeamName: 'Chicago White Sox', fromSeason: 2024, toSeason: 2024 },
      { teamLabel: '피츠버그 파이리츠', league: 'MLB', mlbTeamName: 'Pittsburgh Pirates', fromSeason: 2024, toSeason: 2024 },
    ],
  },
  {
    name: '브루스 짐머맨',
    aliases: ['짐머맨'],
    isOneClubMan: false,
    clubTenure2026: 0,
    franchiseIconBonus: 0,
    history: [
      { teamLabel: '볼티모어 오리올스', league: 'MLB', mlbTeamName: 'Baltimore Orioles', fromSeason: 2020, toSeason: 2023 },
    ],
  },
];

export function findRealPlayerClubProfile(
  playerName: string,
  teamId?: TeamId
): RealPlayerClubProfile | undefined {
  const matchesName = (entry: RealPlayerClubProfile) =>
    entry.name === playerName || Boolean(entry.aliases?.includes(playerName));
  const exactTeamMatch = REAL_KBO_CAREER_HISTORIES.find(
    (entry) => matchesName(entry) && (!entry.expectedTeamId || entry.expectedTeamId === teamId)
  );
  if (exactTeamMatch) return exactTeamMatch;
  return REAL_KBO_CAREER_HISTORIES.find((entry) => matchesName(entry));
}

/**
 * 구단별 2025 시즌 종료 기준 누적 KBO 한국시리즈 우승 횟수 및 마지막 우승 연도
 * (실제 KBO 공식 기록 기반 — 한국시리즈 우승 트로피 V-카운트 및 장기 무관 탈출·창단 첫 우승 업적용)
 */
export const CLUB_CHAMPIONSHIP_BASELINE_2025: Record<
  TeamId,
  { titlesBefore2026: number; lastTitleYear: number | null; foundingYear: number }
> = {
  KIA: { titlesBefore2026: 12, lastTitleYear: 2024, foundingYear: 1982 },
  삼성: { titlesBefore2026: 8, lastTitleYear: 2014, foundingYear: 1982 },
  두산: { titlesBefore2026: 6, lastTitleYear: 2019, foundingYear: 1982 },
  SSG: { titlesBefore2026: 5, lastTitleYear: 2022, foundingYear: 2000 },
  LG: { titlesBefore2026: 4, lastTitleYear: 2025, foundingYear: 1982 },
  롯데: { titlesBefore2026: 2, lastTitleYear: 1992, foundingYear: 1982 },
  한화: { titlesBefore2026: 1, lastTitleYear: 1999, foundingYear: 1986 },
  NC: { titlesBefore2026: 1, lastTitleYear: 2020, foundingYear: 2011 },
  KT: { titlesBefore2026: 1, lastTitleYear: 2021, foundingYear: 2013 },
  키움: { titlesBefore2026: 0, lastTitleYear: null, foundingYear: 2008 },
};

/**
 * 구단별 UI 동적 테마 팔레트 (라이트/다크 모드 모두 WCAG AA 대비 충족)
 * - KT(블랙/레드), 두산(네이비/레드), 롯데(네이비/레드) 등 어두운 메인 컬러 구단은
 *   다크 모드에서 가시성이 높은 공식 서브/액센트 컬러를 accentDark로 지정
 */
export interface TeamUiThemeTokens {
  teamId: TeamId;
  /** 라이트 모드 메인 포인트 컬러 */
  primaryLight: string;
  /** 다크 모드 메인 포인트 컬러 (명도/채도 보정) */
  primaryDark: string;
  /** 보조 포인트 컬러 */
  secondary: string;
  /** 버튼/배지 위 텍스트 컬러 */
  onPrimary: string;
  /** 연한 강조 배경 (RGB triplet) */
  rgbLight: string;
  rgbDark: string;
  /** 헤더 상단 그라데이션 시작~끝 */
  bannerFrom: string;
  bannerTo: string;
}

export const TEAM_UI_THEMES: Record<TeamId, TeamUiThemeTokens> = {
  LG: {
    teamId: 'LG',
    primaryLight: '#C30452',
    primaryDark: '#F43F5E',
    secondary: '#111827',
    onPrimary: '#FFFFFF',
    rgbLight: '195, 4, 82',
    rgbDark: '244, 63, 94',
    bannerFrom: '#C30452',
    bannerTo: '#1E1B24',
  },
  한화: {
    teamId: '한화',
    primaryLight: '#EA580C',
    primaryDark: '#FB923C',
    secondary: '#1E1B18',
    onPrimary: '#FFFFFF',
    rgbLight: '234, 88, 12',
    rgbDark: '251, 146, 60',
    bannerFrom: '#FC4E00',
    bannerTo: '#1E1B18',
  },
  SSG: {
    teamId: 'SSG',
    primaryLight: '#CE0E2D',
    primaryDark: '#FB7185',
    secondary: '#F59E0B',
    onPrimary: '#FFFFFF',
    rgbLight: '206, 14, 45',
    rgbDark: '251, 113, 133',
    bannerFrom: '#CE0E2D',
    bannerTo: '#7C0A1E',
  },
  삼성: {
    teamId: '삼성',
    primaryLight: '#074CA1',
    primaryDark: '#38BDF8',
    secondary: '#0F172A',
    onPrimary: '#FFFFFF',
    rgbLight: '7, 76, 161',
    rgbDark: '56, 189, 248',
    bannerFrom: '#074CA1',
    bannerTo: '#0B2447',
  },
  NC: {
    teamId: 'NC',
    primaryLight: '#1D467D',
    primaryDark: '#60A5FA',
    secondary: '#C5A059',
    onPrimary: '#FFFFFF',
    rgbLight: '29, 70, 125',
    rgbDark: '96, 165, 250',
    bannerFrom: '#1D467D',
    bannerTo: '#0C1F3D',
  },
  KT: {
    teamId: 'KT',
    primaryLight: '#E11D48',
    primaryDark: '#FB7185',
    secondary: '#18181B',
    onPrimary: '#FFFFFF',
    rgbLight: '225, 29, 72',
    rgbDark: '251, 113, 133',
    bannerFrom: '#18181B',
    bannerTo: '#BE123C',
  },
  롯데: {
    teamId: '롯데',
    primaryLight: '#041E42',
    primaryDark: '#60A5FA',
    secondary: '#D00F31',
    onPrimary: '#FFFFFF',
    rgbLight: '4, 30, 66',
    rgbDark: '96, 165, 250',
    bannerFrom: '#041E42',
    bannerTo: '#B91C1C',
  },
  KIA: {
    teamId: 'KIA',
    primaryLight: '#DC2626',
    primaryDark: '#F87171',
    secondary: '#0F172A',
    onPrimary: '#FFFFFF',
    rgbLight: '220, 38, 38',
    rgbDark: '248, 113, 113',
    bannerFrom: '#EA0029',
    bannerTo: '#18181B',
  },
  두산: {
    teamId: '두산',
    primaryLight: '#1E293B',
    primaryDark: '#F87171',
    secondary: '#ED1C24',
    onPrimary: '#FFFFFF',
    rgbLight: '30, 41, 59',
    rgbDark: '248, 113, 113',
    bannerFrom: '#131230',
    bannerTo: '#B91C1C',
  },
  키움: {
    teamId: '키움',
    primaryLight: '#820024',
    primaryDark: '#FB7185',
    secondary: '#EC4899',
    onPrimary: '#FFFFFF',
    rgbLight: '130, 0, 36',
    rgbDark: '251, 113, 133',
    bannerFrom: '#820024',
    bannerTo: '#3B0718',
  },
};

export interface RealKboClubUniformSpec {
  kitSupplier: string;
  homeTheme: string;
  awayTheme: string;
  altTheme: string;
  homePattern: ClubUniformEdition['pattern'];
  awayPattern: ClubUniformEdition['pattern'];
  altPattern: ClubUniformEdition['pattern'];
  homeBodyHex: string;
  awayBodyHex: string;
  altBodyHex: string;
  homeTrimHex: string;
  homeStripeHex: string;
  awayTrimHex: string;
  altTrimHex: string;
  homeWordmark: string;
  awayWordmark: string;
  altWordmark: string;
  iconicNumber: string;
  seasonSeriesNames: string[];
}

/**
 * 현실 2025~2026 KBO 10개 구단 공식 홈·원정·얼트 유니폼 마스터 사양
 */
export const REAL_KBO_UNIFORM_SPECS: Record<TeamId, RealKboClubUniformSpec> = {
  LG: {
    kitSupplier: 'PRO-SPECS',
    homeTheme: '시그니처 블랙 핀스트라이프 홈',
    awayTheme: '차콜 그레이 어웨이',
    altTheme: '서울 블랙 얼트',
    homePattern: 'pinstripe',
    awayPattern: 'classic',
    altPattern: 'classic',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#2E3338',
    altBodyHex: '#121318',
    homeTrimHex: '#C30452',
    homeStripeHex: '#18181B',
    awayTrimHex: '#C30452',
    altTrimHex: '#C30452',
    homeWordmark: 'TWINS',
    awayWordmark: 'SEOUL',
    altWordmark: 'TWINS',
    iconicNumber: '17',
    seasonSeriesNames: ['잠실 헤리티지 핀스트라이프', '트윈스 클래식 프로', '서울 시티 에디션'],
  },
  한화: {
    kitSupplier: 'SPYDER',
    homeTheme: '화이트 다이나믹 오렌지 홈',
    awayTheme: '다크 그레이·오렌지 어웨이',
    altTheme: '불꽃 오렌지 얼트',
    homePattern: 'classic',
    awayPattern: 'raglan',
    altPattern: 'modern-stripe',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#2B303A',
    altBodyHex: '#F35B04',
    homeTrimHex: '#FC4E00',
    homeStripeHex: '#1F242D',
    awayTrimHex: '#FC4E00',
    altTrimHex: '#18181B',
    homeWordmark: 'EAGLES',
    awayWordmark: 'Hanwha',
    altWordmark: 'EAGLES',
    iconicNumber: '99',
    seasonSeriesNames: ['이글스 다이나믹 프로', '대전 볼파크 에디션', '불꽃 오렌지 트리뷰트'],
  },
  SSG: {
    kitSupplier: 'DYNAFIT',
    homeTheme: '화이트 카리스마 레드 파이핑 홈',
    awayTheme: '카리스마 레드 어웨이',
    altTheme: '인천 헤리티지 크림 얼트',
    homePattern: 'classic',
    awayPattern: 'modern-stripe',
    altPattern: 'classic',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#CE0E2D',
    altBodyHex: '#F6F0E4',
    homeTrimHex: '#CE0E2D',
    homeStripeHex: '#CE0E2D',
    awayTrimHex: '#F5B800',
    altTrimHex: '#CE0E2D',
    homeWordmark: 'LANDERS',
    awayWordmark: 'SSG',
    altWordmark: 'INCHEON',
    iconicNumber: '14',
    seasonSeriesNames: ['랜더스 카리스마 레드', '인천 헤리티지 에디션', '랜더스필드 프로'],
  },
  삼성: {
    kitSupplier: 'UNDER ARMOUR',
    homeTheme: '화이트 왕조 블루 핀스트라이프 홈',
    awayTheme: '왕조 로열 블루 어웨이',
    altTheme: '대구 올드 스카이블루 얼트',
    homePattern: 'pinstripe',
    awayPattern: 'classic',
    altPattern: 'v-collar',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#074CA1',
    altBodyHex: '#1E6FD9',
    homeTrimHex: '#074CA1',
    homeStripeHex: '#074CA1',
    awayTrimHex: '#FFFFFF',
    altTrimHex: '#FFFFFF',
    homeWordmark: 'LIONS',
    awayWordmark: 'SAMSUNG',
    altWordmark: 'LIONS',
    iconicNumber: '18',
    seasonSeriesNames: ['라이온즈 왕조 블루', '라팍 클래식 에디션', '언더아머 프로 킷'],
  },
  NC: {
    kitSupplier: 'DESCENTE',
    homeTheme: '화이트 마린 네이비·골드 홈',
    awayTheme: '마린 네이비·단디 블루 어웨이',
    altTheme: '민트 단디 블루 얼트',
    homePattern: 'pinstripe',
    awayPattern: 'v-collar',
    altPattern: 'modern-stripe',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#13294B',
    altBodyHex: '#009E99',
    homeTrimHex: '#1D467D',
    homeStripeHex: '#1D467D',
    awayTrimHex: '#C5A059',
    altTrimHex: '#13294B',
    homeWordmark: 'DINOS',
    awayWordmark: 'NC',
    altWordmark: 'DINOS',
    iconicNumber: '37',
    seasonSeriesNames: ['마린 네이비 프로', '창원 단디 에디션', '다이노스 골드 포인트'],
  },
  KT: {
    kitSupplier: 'NEW BALANCE',
    homeTheme: '퓨어 화이트·블랙 레드 홈',
    awayTheme: '제트 블랙·레드 어웨이',
    altTheme: '수원 위즈 레드 얼트',
    homePattern: 'classic',
    awayPattern: 'modern-stripe',
    altPattern: 'raglan',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#141418',
    altBodyHex: '#C8102E',
    homeTrimHex: '#141418',
    homeStripeHex: '#E11D48',
    awayTrimHex: '#E11D48',
    altTrimHex: '#141418',
    homeWordmark: 'kt wiz',
    awayWordmark: 'kt wiz',
    altWordmark: 'SUWON',
    iconicNumber: '1',
    seasonSeriesNames: ['위즈 블랙 프로', '수원 매직 에디션', '뉴발란스 퍼포먼스'],
  },
  롯데: {
    kitSupplier: 'WILLBEPLAY',
    homeTheme: '화이트 자이언츠 핀스트라이프 홈',
    awayTheme: '부산 마린 네이비·레드 어웨이',
    altTheme: '동백 레드·챔피언스 얼트',
    homePattern: 'pinstripe',
    awayPattern: 'classic',
    altPattern: 'raglan',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#041E42',
    altBodyHex: '#D00F31',
    homeTrimHex: '#041E42',
    homeStripeHex: '#041E42',
    awayTrimHex: '#D00F31',
    altTrimHex: '#041E42',
    homeWordmark: 'Giants',
    awayWordmark: 'LOTTE',
    altWordmark: 'BUSAN',
    iconicNumber: '10',
    seasonSeriesNames: ['사직 헤리티지 스트라이프', '부산 동백 에디션', '자이언츠 클래식 프로'],
  },
  KIA: {
    kitSupplier: 'IAB STUDIO',
    homeTheme: '화이트 타이거 레드 클래식 홈',
    awayTheme: '타이거 레드 어웨이',
    altTheme: '챔피언스 블랙·레드 얼트',
    homePattern: 'classic',
    awayPattern: 'classic',
    altPattern: 'modern-stripe',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#C80823',
    altBodyHex: '#16171C',
    homeTrimHex: '#EA0029',
    homeStripeHex: '#16171C',
    awayTrimHex: '#FFFFFF',
    altTrimHex: '#EA0029',
    homeWordmark: 'TIGERS',
    awayWordmark: 'KIA',
    altWordmark: 'TIGERS',
    iconicNumber: '5',
    seasonSeriesNames: ['타이거즈 헤리티지 프로', '광주 챔피언스 에디션', '호랑이 붉은 물결'],
  },
  두산: {
    kitSupplier: 'adidas',
    homeTheme: '화이트 네이비 핀스트라이프 홈',
    awayTheme: '미라클 네이비 어웨이',
    altTheme: '서울 클래식 네이비·레드 얼트',
    homePattern: 'pinstripe',
    awayPattern: 'raglan',
    altPattern: 'v-collar',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#131230',
    altBodyHex: '#1B2244',
    homeTrimHex: '#131230',
    homeStripeHex: '#131230',
    awayTrimHex: '#ED1C24',
    altTrimHex: '#ED1C24',
    homeWordmark: 'BEARS',
    awayWordmark: 'DOOSAN',
    altWordmark: 'SEOUL',
    iconicNumber: '25',
    seasonSeriesNames: ['베어스 미라클 스트라이프', '잠실 아디다스 프로', '서울 헤리티지 에디션'],
  },
  키움: {
    kitSupplier: 'NIKE',
    homeTheme: '퓨어 화이트·버건디 미니멀 홈',
    awayTheme: '시그니처 버건디 어웨이',
    altTheme: '고척 블랙 버건디 얼트',
    homePattern: 'classic',
    awayPattern: 'classic',
    altPattern: 'v-collar',
    homeBodyHex: '#FFFFFF',
    awayBodyHex: '#6F0020',
    altBodyHex: '#24111A',
    homeTrimHex: '#820024',
    homeStripeHex: '#820024',
    awayTrimHex: '#F3D2DC',
    altTrimHex: '#D81B60',
    homeWordmark: 'HEROES',
    awayWordmark: 'KIWOOM',
    altWordmark: 'HEROES',
    iconicNumber: '51',
    seasonSeriesNames: ['히어로즈 버건디 미니멀', '고척 나이키 프로', '서울 영웅 에디션'],
  },
};

export function buildAnnualClubUniform(
  teamId: TeamId,
  season: number,
  primaryHex: string,
  secondaryHex: string,
  accentHex: string
): ClubUniformEdition {
  const spec = REAL_KBO_UNIFORM_SPECS[teamId];
  const seriesName = spec.seasonSeriesNames[season % spec.seasonSeriesNames.length];
  const merchBoostPct = 4 + ((season * 3 + teamId.charCodeAt(0)) % 6); // +4% ~ +9%
  return {
    season,
    teamId,
    editionName: `${season} ${seriesName}`,
    homeTheme: spec.homeTheme,
    awayTheme: spec.awayTheme,
    altTheme: spec.altTheme,
    pattern: spec.homePattern,
    primaryHex: spec.homeTrimHex || primaryHex,
    secondaryHex: spec.awayBodyHex || secondaryHex,
    accentHex: spec.awayTrimHex || accentHex,
    releasedDate: `${season}-02-15`,
    merchBoostPct,
    headline: `${season} 시즌 공식 유니폼 '${seriesName}' (${spec.kitSupplier}) 공개 (상품 매출 +${merchBoostPct}%)`,
    kitSupplier: spec.kitSupplier,
    homeWordmark: spec.homeWordmark,
    awayWordmark: spec.awayWordmark,
    altWordmark: spec.altWordmark,
    homeBodyHex: spec.homeBodyHex,
    awayBodyHex: spec.awayBodyHex,
    altBodyHex: spec.altBodyHex,
    homePattern: spec.homePattern,
    awayPattern: spec.awayPattern,
    altPattern: spec.altPattern,
    homeStripeHex: spec.homeStripeHex,
    homeTrimHex: spec.homeTrimHex,
    awayTrimHex: spec.awayTrimHex,
    altTrimHex: spec.altTrimHex,
    iconicNumber: spec.iconicNumber,
  };
}

/**
 * 2026 신인 계약금 TOP 10 기준 데이터 (신규 시즌 드래프트 완료 시 매 시즌 자동 갱신)
 */
export const BASELINE_2026_ROOKIE_BONUS_TOP10: RookieBonusRankEntry[] = [
  { rank: 1, season: 2026, playerName: '박준현', teamId: '키움', pickNotation: '1R 1순위', position: 'SP', school: '북일고', signingBonusBillion: 7.0, ability: 66, potential: 92 },
  { rank: 2, season: 2026, playerName: '신재인', teamId: 'NC', pickNotation: '1R 2순위', position: '3B', school: '유신고', signingBonusBillion: 3.5, ability: 64, potential: 88 },
  { rank: 3, season: 2026, playerName: '오재원', teamId: '한화', pickNotation: '1R 3순위', position: 'CF', school: '유신고', signingBonusBillion: 3.0, ability: 64, potential: 87 },
  { rank: 4, season: 2026, playerName: '신동건', teamId: '롯데', pickNotation: '1R 4순위', position: 'SP', school: '동산고', signingBonusBillion: 2.7, ability: 63, potential: 86 },
  { rank: 5, season: 2026, playerName: '김민준', teamId: 'SSG', pickNotation: '1R 5순위', position: 'SP', school: '대구고', signingBonusBillion: 2.7, ability: 63, potential: 85 },
  { rank: 6, season: 2026, playerName: '박지훈', teamId: 'KT', pickNotation: '1R 6순위', position: 'SP', school: '전주고', signingBonusBillion: 2.6, ability: 62, potential: 86 },
  { rank: 7, season: 2026, playerName: '김주오', teamId: '두산', pickNotation: '1R 7순위', position: 'RF', school: '마산용마고', signingBonusBillion: 2.5, ability: 62, potential: 85 },
  { rank: 8, season: 2026, playerName: '양우진', teamId: 'LG', pickNotation: '1R 8순위', position: 'SP', school: '경기항공고', signingBonusBillion: 2.5, ability: 62, potential: 85 },
  { rank: 9, season: 2026, playerName: '이호범', teamId: '삼성', pickNotation: '1R 9순위', position: 'SP', school: '서울고', signingBonusBillion: 2.5, ability: 62, potential: 84 },
  { rank: 10, season: 2026, playerName: '김현수', teamId: 'KIA', pickNotation: '2R 10순위', position: 'SP', school: '광남고BC', signingBonusBillion: 2.0, ability: 60, potential: 83 },
];

/**
 * 2027 KBO 신인 드래프트 공식 확인 계약금 TOP 10 (2026년 10월 구단별 공식 발표 기준)
 * - 하현승(키움 1R 1순위): 16.0억 원 (KBO 역대 신인 계약금 최고 신기록 · 2006 한기주 10억 경신)
 * - 김지우(두산 1R 2순위): 5.0억 원 (역대 야수 신인 계약금 타이)
 * - 박보승(NC 1R 6순위): 기본 계약금 2.5억 원 (+옵션 0.5억, 최대 3.0억)
 * - LG 1R 10순위 윤예성(인창고)은 구단 공식 계약금 비공개(미확인)로 TOP 10 집계 제외
 */
export const BASELINE_2027_ROOKIE_BONUS_TOP10: RookieBonusRankEntry[] = [
  { rank: 1, season: 2027, playerName: '하현승', teamId: '키움', pickNotation: '1R 1순위', position: 'SP', school: '부산고', signingBonusBillion: 16.0, ability: 55, potential: 90, note: '역대 최고 신기록' },
  { rank: 2, season: 2027, playerName: '김지우', teamId: '두산', pickNotation: '1R 2순위', position: 'SS', school: '서울고', signingBonusBillion: 5.0, ability: 54, potential: 87, note: '역대 야수 타이' },
  { rank: 3, season: 2027, playerName: '이호민', teamId: 'KIA', pickNotation: '1R 3순위', position: '3B', school: '경남고', signingBonusBillion: 3.5, ability: 53, potential: 85 },
  { rank: 4, season: 2027, playerName: '박근서', teamId: '롯데', pickNotation: '1R 4순위', position: 'SP', school: '서울디자인고', signingBonusBillion: 3.0, ability: 53, potential: 84 },
  { rank: 5, season: 2027, playerName: '이승원', teamId: 'KT', pickNotation: '1R 5순위', position: 'SP', school: '유신고', signingBonusBillion: 2.5, ability: 52, potential: 83 },
  { rank: 6, season: 2027, playerName: '박보승', teamId: 'NC', pickNotation: '1R 6순위', position: 'CF', school: '경남고', signingBonusBillion: 2.5, ability: 52, potential: 82, note: '옵션 0.5억 별도' },
  { rank: 7, season: 2027, playerName: '김민훈', teamId: '삼성', pickNotation: '1R 7순위', position: 'SP', school: '광주진흥고', signingBonusBillion: 2.5, ability: 51, potential: 82 },
  { rank: 8, season: 2027, playerName: '이윤성', teamId: 'SSG', pickNotation: '1R 8순위', position: 'SP', school: '마산고', signingBonusBillion: 2.5, ability: 51, potential: 81 },
  { rank: 9, season: 2027, playerName: '민주홍', teamId: '한화', pickNotation: '1R 9순위', position: 'SP', school: '설악고', signingBonusBillion: 2.5, ability: 51, potential: 81 },
  { rank: 10, season: 2027, playerName: '최우준', teamId: '키움', pickNotation: '2R 11순위', position: 'SS', school: '경북고', signingBonusBillion: 1.7, ability: 50, potential: 79, note: '두산 설재민(1.7억) 동률' },
];

/**
 * 2027 신인 드래프트 공식 확인 개별 계약금 (억 원 · 고유 ID 기준)
 */
export const VERIFIED_2027_ROOKIE_BONUSES_BY_ID: Record<string, number> = {
  'D2027-001': 16.0, // 하현승 (키움 1R 1순위)
  'D2027-002': 5.0,  // 김지우 (두산 1R 2순위)
  'D2027-003': 3.5,  // 이호민 (KIA 1R 3순위)
  'D2027-004': 3.0,  // 박근서 (롯데 1R 4순위)
  'D2027-005': 2.5,  // 이승원 (KT 1R 5순위)
  'D2027-006': 2.5,  // 박보승 (NC 1R 6순위 · 기본 계약금)
  'D2027-007': 2.5,  // 김민훈 (삼성 1R 7순위)
  'D2027-008': 2.5,  // 이윤성 (SSG 1R 8순위)
  'D2027-009': 2.5,  // 민주홍 (한화 1R 9순위)
  'D2027-011': 1.7,  // 최우준 (키움 2R 11순위)
  'D2027-012': 1.7,  // 설재민 (두산 2R 12순위)
  'D2027-013': 1.6,  // 곽병진 (KIA 2R 13순위)
  'D2027-015': 0.0,  // 최지만 (KT 2R 15순위 · 해외 진출 선수 규정상 계약금 없음)
  'D2027-019': 1.5,  // 이준우 (한화 2R 19순위)
};

/**
 * 실제 KBO/MLB 한국인 해외파 병역 상태 기본값 (2026 기준)
 */
export const REAL_OVERSEAS_MILITARY_STATUS: Record<
  string,
  { status: '미필' | '군필' | '면제' | '복무중'; note: string }
> = {
  이정후: { status: '면제', note: '2018 자카르타-팔렘방 아시안게임 금메달 병역특례' },
  김하성: { status: '면제', note: '2018 자카르타-팔렘방 아시안게임 금메달 병역특례' },
  김혜성: { status: '면제', note: '2022 항저우 아시안게임 금메달 병역특례' },
  고우석: { status: '면제', note: '2022 항저우 아시안게임 금메달 병역특례' },
  배지환: { status: '미필', note: '병역 미필 (국외여행허가 체류 · 국제대회 입상 시 특례 가능)' },
  박효준: { status: '미필', note: '병역 미필 (국외여행허가 체류)' },
  장현석: { status: '면제', note: '2022 항저우 아시안게임 금메달 병역특례' },
  심준석: { status: '미필', note: '병역 미필 (유망주 · 국제대회 병역특례 도전 가능)' },
  엄형찬: { status: '미필', note: '병역 미필' },
  최현일: { status: '미필', note: '병역 미필' },
  조원빈: { status: '미필', note: '병역 미필' },
  이찬솔: { status: '미필', note: '병역 미필' },
};
