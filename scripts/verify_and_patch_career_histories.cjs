/**
 * 실제 KBO 선수 소속 구단 · 통산 소속팀 이력 · 이적/방출/은퇴 전수 검증 및 패치 스크립트 (v21)
 *
 * 원칙:
 * 1. 수정 전 v18RecalibratedData.json을 v20PlayerDataBackupBeforeCareerPatch.json에 1회 백업
 * 2. 2026시즌 중 트레이드(3건)·웨이버 클레임(2건)·2026-11-20 오프시즌 트레이드(1건)·
 *    2026-10~11 방출(재계약 불가)·은퇴·공식 확정 FA 재계약(2026-11-25 기준) 반영
 * 3. KBO 10개 구단 731명 전원의 현재 소속 구단과 과거 소속 구단 이력(verified_team_history)을 분리 저장
 * 4. 손아섭(2025 NC/한화 분할 성적 및 롯데→NC→한화→두산→NC 전 이력)을 포함한 다구단 경력자·원클럽맨 판정 전수 교정
 * 5. 확인되지 않은 이력·성적은 임의로 생성하지 않음
 * 6. 변경 내역과 출처를 src/data/careerHistoryAuditLog.json에 기록
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'src', 'data', 'v18RecalibratedData.json');
const BACKUP_PATH = path.join(__dirname, '..', 'src', 'data', 'v20PlayerDataBackupBeforeCareerPatch.json');
const AUDIT_PATH = path.join(__dirname, '..', 'src', 'data', 'careerHistoryAuditLog.json');

const CODE_TO_KO = {
  LG: 'LG',
  OB: '두산',
  SS: '삼성',
  HT: 'KIA',
  SK: 'SSG',
  SSG: 'SSG',
  KT: 'KT',
  NC: 'NC',
  LT: '롯데',
  HH: '한화',
  WO: '키움',
};

const KO_TO_FULL = {
  LG: 'LG 트윈스',
  두산: '두산 베어스',
  삼성: '삼성 라이온즈',
  KIA: 'KIA 타이거즈',
  SSG: 'SSG 랜더스',
  SK: 'SK 와이번스',
  KT: 'KT 위즈',
  NC: 'NC 다이노스',
  롯데: '롯데 자이언츠',
  한화: '한화 이글스',
  키움: '키움 히어로즈',
  넥센: '넥센 히어로즈',
};

function normalizeFranchiseId(teamLabel) {
  if (!teamLabel) return null;
  if (CODE_TO_KO[teamLabel]) return CODE_TO_KO[teamLabel];
  if (teamLabel === 'SK' || teamLabel === 'SK 와이번스') return 'SSG';
  if (teamLabel === '넥센' || teamLabel === '넥센 히어로즈' || teamLabel === '우리' || teamLabel === '히어로즈') return '키움';
  if (teamLabel === '해태' || teamLabel === '해태 타이거즈') return 'KIA';
  if (teamLabel === 'OB' || teamLabel === 'OB 베어스') return '두산';
  if (KO_TO_FULL[teamLabel]) return teamLabel;
  return null;
}

function teamFullLabelFromRaw(rawTeam, fromSeason, toSeason) {
  const franchise = normalizeFranchiseId(rawTeam);
  if (!franchise) return rawTeam;
  if (franchise === 'SSG') {
    if (toSeason !== undefined && toSeason <= 2020) return 'SK 와이번스';
    if (fromSeason <= 2020) return 'SK 와이번스 / SSG 랜더스';
    return 'SSG 랜더스';
  }
  if (franchise === '키움') {
    if (toSeason !== undefined && toSeason <= 2018) return '넥센 히어로즈';
    if (fromSeason <= 2018) return '넥센 / 키움 히어로즈';
    return '키움 히어로즈';
  }
  return KO_TO_FULL[franchise] || rawTeam;
}

// ============================================================================
// 1. 2026 정규시즌 및 2026-11 오프시즌 공식 확인 소속팀 이동 (10명)
// ============================================================================
const VERIFIED_CLUB_TRANSFERS = {
  'v15-0118': {
    // 손아섭 (KBO ID 77532)
    newTeamCode: 'NC',
    salaryKrw: 50000000,
    contractEndYear: 2027,
    level2026: 1,
    source: 'KBO 공식 공시 · NC 다이노스 공식 발표 (2026-10-27)',
    reason: '2025-07-31 NC→한화 트레이드 → 2026-04-14 한화→두산 트레이드 → 2026-10-19 두산 방출 → 2026-10-27 NC 다이노스 복귀 계약(연봉 5,000만 원)',
    verifiedHistory: [
      { teamLabel: '롯데 자이언츠', teamId: '롯데', league: 'KBO', fromSeason: 2007, toSeason: 2021, transferDate: '2007-01-01', moveType: '입단', note: '2007 2차 4R 지명 · KBO 통산 최다 안타' },
      { teamLabel: 'NC 다이노스', teamId: 'NC', league: 'KBO', fromSeason: 2022, toSeason: 2025, transferDate: '2021-12-24', endDate: '2025-07-31', moveType: 'FA 이적', note: 'FA 4년 64억 계약 이적' },
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2025, toSeason: 2026, transferDate: '2025-07-31', endDate: '2026-04-14', moveType: '트레이드', note: '2025-07-31 트레이드(2026 3R+현금 3억) · 2026-02 FA 1년 1억 잔류' },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2026, toSeason: 2026, transferDate: '2026-04-14', endDate: '2026-10-19', moveType: '트레이드', note: '2026-04-14 트레이드(이교훈+현금 1.5억) · 2026-10-19 재계약 불가(방출)' },
      { teamLabel: 'NC 다이노스', teamId: 'NC', league: 'KBO', fromSeason: 2027, transferDate: '2026-10-27', moveType: '자유계약', note: '2026-10-27 친정 NC 복귀 계약 (연봉 5,000만 원)' },
    ],
    // 2025 시즌 공식 확인 구단별 분할 성적 (합계: 111G 372AB 107H 1HR 50RBI 39R AVG .288 OPS .723)
    split2025Rows: [
      {
        season: 2025,
        playerId: '77532',
        team: '한화',
        stintOrder: 2,
        transferNote: '2025-07-31 NC→한화 트레이드 후',
        G: 35,
        AB: 132,
        R: 18,
        H: 35,
        HR: 1,
        RBI: 17,
        AVG: 0.265,
        OPS: 0.689,
      },
      {
        season: 2025,
        playerId: '77532',
        team: 'NC',
        stintOrder: 1,
        transferNote: '트레이드 전 NC 성적',
        G: 76,
        AB: 240,
        R: 21,
        H: 72,
        HR: 0,
        RBI: 33,
        AVG: 0.300,
        OPS: 0.741,
      },
    ],
  },
  'v15-0517': {
    // 이교훈 (두산 → 한화)
    newTeamCode: 'HH',
    source: 'KBO 공식 공시 (2026-04-14 한화↔두산 트레이드)',
    reason: '2026-04-14 손아섭↔이교훈(+현금 1.5억) 트레이드로 두산→한화 이적',
    verifiedHistory: [
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2019, toSeason: 2026, endDate: '2026-04-14', moveType: '입단', note: '2019 2차 3R 지명' },
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2026, transferDate: '2026-04-14', moveType: '트레이드', note: '2026-04-14 한화↔두산 트레이드 이적' },
    ],
  },
  'v15-0542': {
    // 박계범 (두산 → 삼성)
    newTeamCode: 'SS',
    source: 'KBO 공식 공시 (2026-05-06 두산↔삼성 트레이드)',
    reason: '2026-05-06 박계범↔류승민 1:1 트레이드로 두산→삼성 복귀',
    verifiedHistory: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2014, toSeason: 2020, moveType: '입단', note: '2014 2차 2R 지명' },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2021, toSeason: 2026, endDate: '2026-05-06', moveType: 'FA 보상선수', note: '오재일 FA 보상선수 이적' },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2026, transferDate: '2026-05-06', moveType: '트레이드', note: '2026-05-06 두산↔삼성 1:1 트레이드 친정 복귀' },
    ],
  },
  'v15-0249': {
    // 류승민 (삼성 → 두산)
    newTeamCode: 'OB',
    source: 'KBO 공식 공시 (2026-05-06 삼성↔두산 트레이드)',
    reason: '2026-05-06 박계범↔류승민 1:1 트레이드로 삼성→두산 이적',
    verifiedHistory: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2023, toSeason: 2026, endDate: '2026-05-06', moveType: '입단', note: '2023 신인 지명' },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2026, transferDate: '2026-05-06', moveType: '트레이드', note: '2026-05-06 삼성↔두산 1:1 트레이드 이적' },
    ],
  },
  'v15-0187': {
    // 이정범 (SSG → KT)
    newTeamCode: 'KT',
    source: 'KBO 공식 공시 (2026-07 KT 웨이버 클레임)',
    reason: '2026년 6월 말 SSG 웨이버 공시 → 2026년 7월 초 KT 위즈 클레임 이적',
    verifiedHistory: [
      { teamLabel: 'SK 와이번스 / SSG 랜더스', teamId: 'SSG', league: 'KBO', fromSeason: 2017, toSeason: 2026, endDate: '2026-06-30', moveType: '입단' },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2026, transferDate: '2026-07-02', moveType: '웨이버 클레임', note: '2026-07 SSG 웨이버 공시 후 KT 클레임 영입' },
    ],
  },
  'v15-0295': {
    // 맷 데이비슨 (NC → 키움)
    newTeamCode: 'WO',
    level2026: 1,
    source: 'KBO 공식 공시 · 키움 히어로즈 공식 발표 (2026-07 웨이버 클레임 및 2027 재계약)',
    reason: '2026년 7월 NC 웨이버 공시 → 키움 클레임 이적 및 시즌 종료 후 키움 재계약',
    verifiedHistory: [
      { teamLabel: '애리조나 다이아몬드백스', league: 'MLB', mlbTeamName: 'Arizona Diamondbacks', fromSeason: 2013, toSeason: 2013 },
      { teamLabel: '시카고 화이트삭스', league: 'MLB', mlbTeamName: 'Chicago White Sox', fromSeason: 2016, toSeason: 2018 },
      { teamLabel: '신시내티 레즈', league: 'MLB', mlbTeamName: 'Cincinnati Reds', fromSeason: 2020, toSeason: 2020 },
      { teamLabel: '애리조나 다이아몬드백스', league: 'MLB', mlbTeamName: 'Arizona Diamondbacks', fromSeason: 2022, toSeason: 2022 },
      { teamLabel: '애슬레틱스', league: 'MLB', mlbTeamName: 'Athletics', fromSeason: 2022, toSeason: 2022 },
      { teamLabel: '히로시마 도요 카프', league: 'NPB', fromSeason: 2023, toSeason: 2023 },
      { teamLabel: 'NC 다이노스', teamId: 'NC', league: 'KBO', fromSeason: 2024, toSeason: 2026, endDate: '2026-07-05', note: '2024 홈런왕 · 2026-07 웨이버 공시' },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2026, transferDate: '2026-07-10', moveType: '웨이버 클레임', note: '2026-07 웨이버 클레임 이적 · 2027 재계약' },
    ],
    // 2026 NC/키움 시즌 중 이적 표기 (확인되지 않은 세부 AB/H 분할은 임의 생성하지 않고 공식 합계 유지 + 확인된 NC 구간 메모)
    tag2026SplitLabel: 'NC→키움',
    tag2026SplitNote: '시즌 중 NC(63G .290 8HR 40RBI)→키움 웨이버 이적 · 합계 124G .297 28HR 89RBI',
  },
  'v15-0112': {
    // 하주석 (한화 → KIA)
    newTeamCode: 'HT',
    level2026: 1,
    source: 'KBO 공식 공시 (2026-07-23 한화↔KIA 트레이드)',
    reason: '2026-07-23 하주석↔이형범 1:1 트레이드로 한화→KIA 이적 (원클럽맨 해제)',
    verifiedHistory: [
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2012, toSeason: 2026, endDate: '2026-07-23', moveType: '입단', note: '2012 1R 전체 1순위 지명' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2026, transferDate: '2026-07-23', moveType: '트레이드', note: '2026-07-23 한화↔KIA 1:1 트레이드 이적' },
    ],
    tag2026SplitLabel: '한화→KIA',
    tag2026SplitNote: '2026-07-23 한화→KIA 트레이드 · 시즌 합계 71G .249 4HR 22RBI',
  },
  'v15-0463': {
    // 이형범 (KIA → 한화)
    newTeamCode: 'HH',
    source: 'KBO 공식 공시 (2026-07-23 KIA↔한화 트레이드)',
    reason: '2026-07-23 하주석↔이형범 1:1 트레이드로 KIA→한화 이적',
    verifiedHistory: [
      { teamLabel: 'NC 다이노스', teamId: 'NC', league: 'KBO', fromSeason: 2012, toSeason: 2018, moveType: '입단' },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2019, toSeason: 2023, moveType: 'FA 보상선수' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2024, toSeason: 2026, endDate: '2026-07-23', moveType: '2차 드래프트' },
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2026, transferDate: '2026-07-23', moveType: '트레이드', note: '2026-07-23 KIA↔한화 1:1 트레이드 이적' },
    ],
  },
  'v15-0619': {
    // 임지열 (키움 → 롯데)
    newTeamCode: 'LT',
    source: 'KBO 공식 공시 (2026-11-20 키움↔롯데 트레이드)',
    reason: '2026-11-20 임지열↔정철원 1:1 트레이드로 키움→롯데 이적 (원클럽맨 해제)',
    verifiedHistory: [
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2014, toSeason: 2026, endDate: '2026-11-20', moveType: '입단', note: '2014 2차 2R 지명' },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', league: 'KBO', fromSeason: 2027, transferDate: '2026-11-20', moveType: '트레이드', note: '2026-11-20 키움↔롯데 1:1 트레이드 이적' },
    ],
  },
  'v15-0399': {
    // 정철원 (롯데 → 키움)
    newTeamCode: 'WO',
    source: 'KBO 공식 공시 (2026-11-20 롯데↔키움 트레이드)',
    reason: '2026-11-20 정철원↔임지열 1:1 트레이드로 롯데→키움 이적',
    verifiedHistory: [
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2018, toSeason: 2024, moveType: '입단', note: '2022 신인왕' },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', league: 'KBO', fromSeason: 2025, toSeason: 2026, endDate: '2026-11-20', moveType: '트레이드', note: '2024-11 두산↔롯데 트레이드 이적' },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2027, transferDate: '2026-11-20', moveType: '트레이드', note: '2026-11-20 롯데↔키움 1:1 트레이드 이적' },
    ],
  },
};

// ============================================================================
// 2. 2025~2026 주요 이적 완료 선수 정확 이력 (현재 소속은 이미 맞으나 이적일·전소속 정밀화)
// ============================================================================
const VERIFIED_TRANSFER_HISTORIES_EXISTING_TEAM = {
  '2026-SS-34': {
    // 최형우 (삼성 → KIA → 삼성)
    source: '삼성 라이온즈 공식 발표 (2025-11 FA 계약)',
    verifiedHistory: [
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2002, toSeason: 2016, moveType: '입단', note: '2002 2차 6R · 삼성 왕조 4번타자' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2017, toSeason: 2025, transferDate: '2016-11-24', moveType: 'FA 이적', note: 'FA 이적 · KIA 통합우승 주역' },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2026, transferDate: '2025-11-25', moveType: 'FA 이적', note: 'FA 2년 계약 친정 삼성 복귀' },
    ],
  },
  '2026-OB-7': {
    // 박찬호 (KIA → 두산)
    source: '두산 베어스 공식 발표 (2025-11-18 FA 4년 80억)',
    verifiedHistory: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2014, toSeason: 2025, moveType: '입단', note: '2014 2차 5R 지명' },
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2026, transferDate: '2025-11-18', moveType: 'FA 이적', note: 'FA 4년 최대 80억 이적' },
    ],
  },
  '2026-KT-10': {
    // 김현수 (두산 → MLB → LG → KT)
    source: 'KT 위즈 공식 발표 (2025-11 FA 3년 50억)',
    verifiedHistory: [
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2006, toSeason: 2015, moveType: '입단', note: '육성선수 신화 · 타격기계' },
      { teamLabel: '볼티모어 오리올스', league: 'MLB', mlbTeamName: 'Baltimore Orioles', fromSeason: 2016, toSeason: 2017, moveType: 'MLB FA', note: 'MLB FA 진출' },
      { teamLabel: '필라델피아 필리스', league: 'MLB', mlbTeamName: 'Philadelphia Phillies', fromSeason: 2017, toSeason: 2017, moveType: '트레이드', note: '시즌 중 MLB 트레이드' },
      { teamLabel: 'LG 트윈스', teamId: 'LG', league: 'KBO', fromSeason: 2018, toSeason: 2025, moveType: 'FA 이적', note: 'FA 입단 · 2023·2025 통합우승' },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2026, transferDate: '2025-11-26', moveType: 'FA 이적', note: 'FA 3년 총액 50억 이적' },
    ],
  },
  '2026-HH-50': {
    // 강백호 (KT → 한화)
    source: '한화 이글스 공식 발표 (2025-11-20 FA 4년 100억)',
    verifiedHistory: [
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2018, toSeason: 2025, moveType: '입단', note: '2018 2차 1R 전체 1번 · 신인왕' },
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2026, transferDate: '2025-11-20', moveType: 'FA 이적', note: 'FA 4년 100억 이적' },
    ],
  },
  '2026-WO-9': {
    // 안치홍 (KIA → 롯데 → 한화 → 키움)
    source: 'KBO 2차 드래프트 공식 결과 (2025-11-19 전체 1순위)',
    verifiedHistory: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2009, toSeason: 2019, moveType: '입단' },
      { teamLabel: '롯데 자이언츠', teamId: '롯데', league: 'KBO', fromSeason: 2020, toSeason: 2023, moveType: 'FA 이적' },
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2024, toSeason: 2025, moveType: 'FA 이적' },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2026, transferDate: '2025-11-19', moveType: '2차 드래프트', note: '2025-11-19 2차 드래프트 1R 전체 1순위 이적' },
    ],
  },
  '2026-SSG-32': {
    // 김재환 (두산 → SSG)
    source: 'SSG 랜더스 공식 발표 (2025-12-05 자유계약 2년 22억)',
    verifiedHistory: [
      { teamLabel: '두산 베어스', teamId: '두산', league: 'KBO', fromSeason: 2008, toSeason: 2025, moveType: '입단', note: '2018 정규시즌 MVP' },
      { teamLabel: 'SSG 랜더스', teamId: 'SSG', league: 'KBO', fromSeason: 2026, transferDate: '2025-12-05', moveType: '자유계약', note: '두산 보류권 해소 후 자유계약 2년 22억 이적' },
    ],
  },
  '2026-KT-3': {
    // 최원준 (KIA → NC → KT)
    source: 'KBO 공식 공시 (2025-07-28 트레이드 · 2025-11 FA 이적)',
    verifiedHistory: [
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2016, toSeason: 2025, endDate: '2025-07-28', moveType: '입단', note: '2016 2차 1R 지명' },
      { teamLabel: 'NC 다이노스', teamId: 'NC', league: 'KBO', fromSeason: 2025, toSeason: 2025, transferDate: '2025-07-28', moveType: '트레이드', note: '2025-07-28 KIA↔NC 3:3 트레이드' },
      { teamLabel: 'KT 위즈', teamId: 'KT', league: 'KBO', fromSeason: 2026, transferDate: '2025-11-25', moveType: 'FA 이적', note: 'FA 이적' },
    ],
    tag2025SplitLabel: 'KIA→NC',
    tag2025SplitNote: '2025-07-28 트레이드 · KIA 76G .229 4HR / NC 50G .258 2HR (합계 126G 100H .242)',
  },
  '2026-SS-38': {
    // 임기영 (한화 → KIA → 삼성)
    source: 'KBO 공식 기록실',
    verifiedHistory: [
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2012, toSeason: 2014, moveType: '입단' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2015, toSeason: 2025, moveType: 'FA 보상선수' },
      { teamLabel: '삼성 라이온즈', teamId: '삼성', league: 'KBO', fromSeason: 2026, moveType: '2차 드래프트', note: '2025-11 2차 드래프트 이적' },
    ],
  },
  '2026-HT-49': {
    // 김범수 (한화 → KIA)
    source: 'KBO 공식 기록실',
    verifiedHistory: [
      { teamLabel: '한화 이글스', teamId: '한화', league: 'KBO', fromSeason: 2015, toSeason: 2025, moveType: '입단', note: '2015 1차지명' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2026, moveType: 'FA 이적', note: 'FA 이적' },
    ],
  },
  'v15-0601': {
    // 서건창 (LG → 넥센/키움 → LG → KIA → 키움)
    source: 'KBO 공식 기록실',
    verifiedHistory: [
      { teamLabel: 'LG 트윈스', teamId: 'LG', league: 'KBO', fromSeason: 2008, toSeason: 2008, moveType: '입단' },
      { teamLabel: '넥센 / 키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2012, toSeason: 2021, moveType: '자유계약', note: '2014 정규시즌 MVP · 최초 201안타' },
      { teamLabel: 'LG 트윈스', teamId: 'LG', league: 'KBO', fromSeason: 2021, toSeason: 2023, moveType: '트레이드' },
      { teamLabel: 'KIA 타이거즈', teamId: 'KIA', league: 'KBO', fromSeason: 2024, toSeason: 2025, moveType: '자유계약' },
      { teamLabel: '키움 히어로즈', teamId: '키움', league: 'KBO', fromSeason: 2026, moveType: '자유계약', note: '친정 키움 복귀' },
    ],
  },
};

// ============================================================================
// 3. 2027 FA 공식 체결 완료 (2026-11-25 기준 4건 · 모두 원소속 잔류)
// ============================================================================
const VERIFIED_FA_SIGNED_2027 = {
  '2026-OB-25': {
    years: 2,
    totalBillion: 55,
    annualBillion: 5.0,
    signingBonusBillion: 40.0,
    endYear: 2028,
    signedDate: '2026-11-18',
    note: '2027 FA 잔류 확정 (2년 최대 55억 · 계약금 40억 / 연봉 총 10억 / 옵션 5억)',
    source: '두산 베어스 공식 발표 (2026-11)',
  },
  '2026-SSG-54': {
    years: 4,
    totalBillion: 67,
    annualBillion: 5.0,
    signingBonusBillion: 38.0,
    endYear: 2030,
    signedDate: '2026-11-20',
    note: '2027 FA 잔류 확정 (4년 최대 67억 · 계약금 38억 / 연봉 총 20억 / 옵션 9억)',
    source: 'SSG 랜더스 공식 발표 (2026-11)',
  },
  '2026-SSG-42': {
    years: 3,
    totalBillion: 15,
    annualBillion: 2.5,
    signingBonusBillion: 5.0,
    endYear: 2029,
    signedDate: '2026-11-22',
    note: '2027 FA 잔류 확정 (2+1년 최대 15억 · 계약금 5억 / 연봉 총 7.5억 / 옵션 2.5억)',
    source: 'SSG 랜더스 공식 발표 (2026-11)',
  },
  '2026-SSG-37': {
    years: 3,
    totalBillion: 11,
    annualBillion: 2.47,
    signingBonusBillion: 2.0,
    endYear: 2029,
    signedDate: '2026-11-19',
    note: '2027 FA 잔류 확정 (3년 최대 11억 · 계약금 2억 / 연봉 총 7.4억 / 옵션 1.6억)',
    source: 'SSG 랜더스 공식 발표 (2026-11)',
  },
};

// ============================================================================
// 4. 2026 시즌 중·종료 후 공식 은퇴 선수 (ID 기준 정밀 매칭)
// ============================================================================
const VERIFIED_RETIRED_2026 = {
  'v15-0615': { date: '2026-06-15', note: '2026-06 키움 히어로즈 은퇴', source: '키움 히어로즈 공식 발표' },
  'v15-0095': { date: '2026-11-01', note: '2026-11 현역 은퇴 (한화 1군 배터리코치 선임)', source: '한화 이글스 공식 발표' },
  'v15-0028': { date: '2026-10-20', note: '2026-10 LG 재계약 불가 통보 후 현역 은퇴', source: 'LG 트윈스 공식 발표' },
  'v15-0276': { date: '2026-10-20', note: '2026-10 어깨 부상으로 현역 은퇴', source: 'NC 다이노스 공식 발표' },
  '2026-WO-6': { date: '2026-10-25', note: '2026시즌 종료 후 현역 은퇴', source: '키움 히어로즈 공식 발표' },
  '2026-KT-24': { date: '2026-10-25', note: '2026시즌 종료 후 현역 은퇴', source: 'KT 위즈 공식 발표' },
  '2026-SSG-45': { date: '2026-10-25', note: '2026-10 SSG 재계약 불가 후 현역 은퇴', source: 'SSG 랜더스 공식 발표' },
};

// ============================================================================
// 5. 2026년 10~11월 공식 방출(재계약 불가 · 미계약 자유계약 신분, 고유 ID 매칭)
//    ※ 동명이인 제외 완료 (키움 외야수 2026-WO-2 이주형, KT 외야수 2026-KT-53 김민혁, KT 투수 2026-KT-26 김민수 제외)
// ============================================================================
const VERIFIED_RELEASED_2026 = {
  // KIA (2026-10-23)
  'v15-0472': { date: '2026-10-23', note: 'KIA 재계약 불가 (방출 · 자유계약)', source: 'KIA 타이거즈 공식 발표 (2026-10-23)' },
  '2026-HT-21': { date: '2026-10-23', note: 'KIA 재계약 불가 (방출 · 자유계약)', source: 'KIA 타이거즈 공식 발표 (2026-10-23)' },
  'v15-0442': { date: '2026-10-23', note: 'KIA 재계약 불가 (방출 · 자유계약)', source: 'KIA 타이거즈 공식 발표 (2026-10-23)' },
  '2026-HT-19': { date: '2026-10-23', note: 'KIA 재계약 불가 (방출 · 자유계약)', source: 'KIA 타이거즈 공식 발표 (2026-10-23)' },
  'v15-0491': { date: '2026-10-23', note: 'KIA 재계약 불가 (방출 · 자유계약)', source: 'KIA 타이거즈 공식 발표 (2026-10-23)' },
  '2026-HT-8': { date: '2026-10-23', note: 'KIA 재계약 불가 (방출 · 자유계약)', source: 'KIA 타이거즈 공식 발표 (2026-10-23)' },
  // LG (2026-10)
  'v15-0007': { date: '2026-10-20', note: 'LG 재계약 불가 (방출 · 자유계약)', source: 'LG 트윈스 공식 발표 (2026-10)' },
  'v15-0038': { date: '2026-10-20', note: 'LG 재계약 불가 (방출 · 자유계약)', source: 'LG 트윈스 공식 발표 (2026-10)' },
  '2026-LG-62': { date: '2026-10-20', note: 'LG 재계약 불가 (방출 · 자유계약)', source: 'LG 트윈스 공식 발표 (2026-10)' },
  'v15-0043': { date: '2026-10-20', note: 'LG 재계약 불가 (방출 · 자유계약)', source: 'LG 트윈스 공식 발표 (2026-10)' },
  // 한화 (2026-10)
  'v15-0098': { date: '2026-10-20', note: '한화 재계약 불가 (방출 · 자유계약)', source: '한화 이글스 공식 발표 (2026-10)' },
  // 삼성 (2026-10)
  'v15-0206': { date: '2026-10-25', note: '삼성 재계약 불가 (방출 · 자유계약)', source: '삼성 라이온즈 공식 발표 (2026-10)' },
  'v15-0223': { date: '2026-10-25', note: '삼성 재계약 불가 (방출 · 자유계약)', source: '삼성 라이온즈 공식 발표 (2026-10)' },
  '2026-SS-51': { date: '2026-10-25', note: '삼성 재계약 불가 (방출 · 자유계약)', source: '삼성 라이온즈 공식 발표 (2026-10)' },
  // SSG (2026-10)
  'v15-0132': { date: '2026-10-10', note: 'SSG 재계약 불가 (방출 · 자유계약)', source: 'SSG 랜더스 공식 발표 (2026-10)' },
  'v15-0138': { date: '2026-10-10', note: 'SSG 상호 합의 계약 해지 (방출 · 자유계약)', source: 'SSG 랜더스 공식 발표 (2026-10-10)' },
  '2026-SSG-52': { date: '2026-10-10', note: 'SSG 재계약 불가 (방출 · 자유계약)', source: 'SSG 랜더스 공식 발표 (2026-10)' },
  'v15-0159': { date: '2026-10-25', note: 'SSG 재계약 불가 (방출 · 자유계약)', source: 'SSG 랜더스 공식 발표 (2026-10)' },
  'v15-0169': { date: '2026-10-25', note: 'SSG 재계약 불가 (방출 · 자유계약)', source: 'SSG 랜더스 공식 발표 (2026-10)' },
  'v15-0181': { date: '2026-10-25', note: 'SSG 재계약 불가 (방출 · 자유계약)', source: 'SSG 랜더스 공식 발표 (2026-10)' },
  // 롯데 (2026-10)
  'v15-0398': { date: '2026-10-20', note: '롯데 재계약 불가 (방출 · 자유계약)', source: '롯데 자이언츠 공식 발표 (2026-10)' },
  'v15-0404': { date: '2026-10-20', note: '롯데 재계약 불가 (방출 · 자유계약)', source: '롯데 자이언츠 공식 발표 (2026-10)' },
  // KT (2026-10)
  'v15-0342': { date: '2026-10-20', note: 'KT 재계약 불가 (방출 · 자유계약)', source: 'KT 위즈 공식 발표 (2026-10)' },
  '2026-KT-16': { date: '2026-10-20', note: 'KT 재계약 불가 (방출 · 자유계약)', source: 'KT 위즈 공식 발표 (2026-10)' },
  // 키움 (2026-10)
  'v15-0571': { date: '2026-10-20', note: '키움 재계약 불가 (방출 · 자유계약)', source: '키움 히어로즈 공식 발표 (2026-10)' },
  '2026-WO-23': { date: '2026-10-20', note: '키움 재계약 불가 (방출 · 자유계약)', source: '키움 히어로즈 공식 발표 (2026-10)' },
  // 두산 (2026-10-19)
  'v15-0503': { date: '2026-10-19', note: '두산 재계약 불가 (방출 · 자유계약)', source: '두산 베어스 공식 발표 (2026-10-19)' },
  'v15-0507': { date: '2026-10-19', note: '두산 재계약 불가 (방출 · 자유계약)', source: '두산 베어스 공식 발표 (2026-10-19)' },
  'v15-0541': { date: '2026-10-19', note: '두산 재계약 불가 (방출 · 자유계약)', source: '두산 베어스 공식 발표 (2026-10-19)' },
};

function deriveHistoryFromCareerByYear(player, currentTeamKo) {
  const cby = Array.isArray(player.career_by_year) ? [...player.career_by_year] : [];
  // Sort ascending by season, then stintOrder ascending
  cby.sort((a, b) => (a.season - b.season) || ((a.stintOrder || 1) - (b.stintOrder || 1)));

  const stints = [];
  for (const rec of cby) {
    if (!rec.team || typeof rec.season !== 'number') continue;
    // Handle combined split label like "KIA→NC" or "NC→키움"
    const rawTeams = String(rec.team).includes('→')
      ? String(rec.team).split('→').map((s) => s.trim())
      : [String(rec.team).trim()];
    for (const rt of rawTeams) {
      const fid = normalizeFranchiseId(rt);
      if (!fid) continue;
      const last = stints[stints.length - 1];
      if (last && last.teamId === fid) {
        last.toSeason = Math.max(last.toSeason, rec.season);
        last.rawTeams.add(rt);
      } else {
        stints.push({
          teamId: fid,
          fromSeason: rec.season,
          toSeason: rec.season,
          rawTeams: new Set([rt]),
        });
      }
    }
  }

  const isRetired = Boolean(player.retired_after_2026);
  const isReleased = Boolean(player.released_after_2026);
  const isDrafted2027 = player.status === 'drafted_2027';

  if (stints.length === 0) {
    if (isDrafted2027) {
      return [
        {
          teamLabel: KO_TO_FULL[currentTeamKo] || currentTeamKo,
          teamId: currentTeamKo,
          league: 'KBO',
          fromSeason: 2027,
          moveType: '드래프트 입단',
          note: '2027 KBO 신인 드래프트 지명',
        },
      ];
    }
    const startYear = player.draft_year || player.debut_year || (player.futures_2026 ? 2026 : 2026);
    const entry = {
      teamLabel: teamFullLabelFromRaw(currentTeamKo, startYear, isRetired || isReleased ? 2026 : undefined),
      teamId: currentTeamKo,
      league: 'KBO',
      fromSeason: startYear,
    };
    if (isRetired) {
      entry.toSeason = 2026;
      entry.note = player.retired_note || '2026시즌 종료 후 은퇴';
    } else if (isReleased) {
      entry.toSeason = 2026;
      entry.note = player.release_note || '2026시즌 종료 후 방출';
    }
    return [entry];
  }

  // Format contiguous stints
  const result = stints.map((st, idx) => {
    const isLast = idx === stints.length - 1;
    const matchesCurrent = st.teamId === currentTeamKo;
    const isOngoing = isLast && matchesCurrent && !isRetired && !isReleased;
    const entry = {
      teamLabel: teamFullLabelFromRaw(st.teamId, st.fromSeason, isOngoing ? undefined : st.toSeason),
      teamId: st.teamId,
      league: 'KBO',
      fromSeason: st.fromSeason,
    };
    if (!isOngoing) {
      entry.toSeason = st.toSeason;
    }
    if (idx === 0 && player.draft_year && player.draft_year < st.fromSeason) {
      entry.fromSeason = player.draft_year;
      entry.teamLabel = teamFullLabelFromRaw(st.teamId, entry.fromSeason, entry.toSeason);
    }
    if (isLast && isRetired) {
      entry.toSeason = Math.max(st.toSeason, 2026);
      entry.note = player.retired_note || '2026시즌 종료 후 은퇴';
    } else if (isLast && isReleased) {
      entry.toSeason = Math.max(st.toSeason, 2026);
      entry.note = player.release_note || '2026시즌 종료 후 방출';
    }
    return entry;
  });

  // If current active club differs from the last career_by_year stint (e.g. offseason transfer before 2027)
  const lastEntry = result[result.length - 1];
  if (lastEntry && lastEntry.teamId !== currentTeamKo && !isRetired && !isReleased) {
    if (!lastEntry.toSeason) lastEntry.toSeason = 2026;
    result.push({
      teamLabel: KO_TO_FULL[currentTeamKo] || currentTeamKo,
      teamId: currentTeamKo,
      league: 'KBO',
      fromSeason: 2027,
      moveType: '이적',
    });
  }

  return result;
}

function main() {
  if (!fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(DATA_PATH, BACKUP_PATH);
    console.log('Backed up original DB to:', BACKUP_PATH);
  } else {
    console.log('Backup already exists, preserving:', BACKUP_PATH);
  }

  const rawText = fs.readFileSync(BACKUP_PATH, 'utf8');
  const db = JSON.parse(rawText);

  const auditChanges = [];
  let transferCount = 0;
  let faSignedCount = 0;
  let retiredCount = 0;
  let releasedCount = 0;
  let splitUpdatedCount = 0;
  let multiClubCount = 0;
  let oneClubCount = 0;

  for (const p of db.players) {
    const prevTeamCode = p.team;
    const prevTeamKo = CODE_TO_KO[prevTeamCode] || prevTeamCode;
    const prevFa = Boolean(p.fa_approved_2027);
    const prevRetired = Boolean(p.retired_after_2026);
    const changes = [];

    // 1) Apply verified club transfers
    const tr = VERIFIED_CLUB_TRANSFERS[p.id];
    if (tr) {
      p.team = tr.newTeamCode;
      if (tr.salaryKrw !== undefined) p.salary_krw = tr.salaryKrw;
      if (tr.contractEndYear !== undefined) p.contract_end_year = tr.contractEndYear;
      if (tr.level2026 !== undefined) p.level_2026 = tr.level2026;
      if (tr.split2025Rows) {
        const rest = (p.career_by_year || []).filter((r) => r.season !== 2025);
        p.career_by_year = [...rest, ...tr.split2025Rows].sort(
          (a, b) => b.season - a.season || (b.stintOrder || 1) - (a.stintOrder || 1)
        );
        if (p.evaluation_v18 && Array.isArray(p.evaluation_v18.records)) {
          const evalRest = p.evaluation_v18.records.filter((r) => r.season !== 2025);
          p.evaluation_v18.records = [...evalRest, ...tr.split2025Rows].sort(
            (a, b) => b.season - a.season || (b.stintOrder || 1) - (a.stintOrder || 1)
          );
        }
        splitUpdatedCount += 1;
        changes.push('2025시즌 구단별 분할 성적 분리(NC 76G / 한화 35G)');
      }
      if (tr.tag2026SplitLabel && Array.isArray(p.career_by_year)) {
        const r26 = p.career_by_year.find((r) => r.season === 2026);
        if (r26) {
          r26.team = tr.tag2026SplitLabel;
          r26.transferNote = tr.tag2026SplitNote;
          splitUpdatedCount += 1;
          changes.push(`2026시즌 중 이적 표기(${tr.tag2026SplitLabel})`);
        }
      }
      p.verified_team_history = tr.verifiedHistory;
      transferCount += 1;
      changes.push(`소속팀 변경(${prevTeamKo}→${CODE_TO_KO[tr.newTeamCode]}): ${tr.reason}`);
    }

    // 2) Apply verified existing-team transfer histories (2025~2026 FA/2차드래프트 이적생)
    const existTr = VERIFIED_TRANSFER_HISTORIES_EXISTING_TEAM[p.id];
    if (existTr) {
      p.verified_team_history = existTr.verifiedHistory;
      if (existTr.tag2025SplitLabel && Array.isArray(p.career_by_year)) {
        const r25 = p.career_by_year.find((r) => r.season === 2025);
        if (r25) {
          r25.team = existTr.tag2025SplitLabel;
          r25.transferNote = existTr.tag2025SplitNote;
          splitUpdatedCount += 1;
          changes.push(`2025시즌 중 이적 표기(${existTr.tag2025SplitLabel})`);
        }
      }
      changes.push(`이적 이력·날짜 정밀 보강 (${existTr.source})`);
    }

    // 3) Apply verified 2027 FA official signings (as of 2026-11-25)
    const faSigned = VERIFIED_FA_SIGNED_2027[p.id];
    if (faSigned) {
      p.fa_approved_2027 = false;
      p.fa_signed_2027 = faSigned;
      p.contract_end_year = faSigned.endYear;
      p.salary_krw = Math.round(faSigned.annualBillion * 100000000);
      faSignedCount += 1;
      changes.push(`2027 FA 공식 잔류 확정 (${faSigned.note})`);
    }

    // 4) Apply verified 2026 retirements
    const ret = VERIFIED_RETIRED_2026[p.id];
    if (ret) {
      p.retired_after_2026 = true;
      p.retired_date = ret.date;
      p.retired_note = ret.note;
      p.fa_approved_2027 = false;
      retiredCount += 1;
      changes.push(`2026 은퇴 반영 (${ret.note})`);
    }

    // 5) Apply verified 2026 Oct-Nov releases (not left on active team roster!)
    const rel = VERIFIED_RELEASED_2026[p.id];
    if (rel && !p.retired_after_2026) {
      p.released_after_2026 = true;
      p.release_date = rel.date;
      p.release_note = rel.note;
      p.fa_approved_2027 = false;
      releasedCount += 1;
      changes.push(`2026 시즌 종료 방출 반영 (${rel.note})`);
    }

    // 6) Derive verified_team_history for EVERY player who didn't have a manual override
    const finalTeamKo = CODE_TO_KO[p.team] || p.team;
    if (!p.verified_team_history || p.verified_team_history.length === 0) {
      p.verified_team_history = deriveHistoryFromCareerByYear(p, finalTeamKo);
    } else if (p.retired_after_2026 || p.released_after_2026) {
      const lastH = p.verified_team_history[p.verified_team_history.length - 1];
      if (lastH && !lastH.toSeason) {
        lastH.toSeason = 2026;
        lastH.endDate = p.retired_date || p.release_date;
        if (p.retired_note) lastH.note = p.retired_note;
        else if (p.release_note) lastH.note = p.release_note;
      }
    }

    // 7) Compute strict One-Club-Man flag & current club tenure for ALL 731 players
    const isDomestic = !p.foreign_slot;
    const kboFranchises = new Set();
    for (const h of p.verified_team_history) {
      if (h.teamId) kboFranchises.add(h.teamId);
    }
    for (const rec of p.career_by_year || []) {
      const rawTeams = String(rec.team || '').split('→');
      for (const rt of rawTeams) {
        const fid = normalizeFranchiseId(rt.trim());
        if (fid) kboFranchises.add(fid);
      }
    }
    if (!p.retired_after_2026 && !p.released_after_2026) {
      kboFranchises.add(finalTeamKo);
    }

    const isOneClubMan = isDomestic && kboFranchises.size === 1;
    p.verified_one_club_man = isOneClubMan;
    if (isOneClubMan) oneClubCount += 1;
    else multiClubCount += 1;

    // Calculate cumulative seasons with current club (up to 2027)
    let currentClubYears = 0;
    const distinctYearsWithCurrent = new Set();
    for (const h of p.verified_team_history) {
      if (h.teamId === finalTeamKo) {
        const endY = h.toSeason !== undefined ? h.toSeason : 2027;
        for (let y = h.fromSeason; y <= Math.min(2027, endY); y += 1) {
          distinctYearsWithCurrent.add(y);
        }
      }
    }
    currentClubYears = p.status === 'drafted_2027' ? 0 : Math.max(1, distinctYearsWithCurrent.size);
    p.verified_club_tenure_2027 = currentClubYears;

    if (changes.length > 0 || prevTeamCode !== p.team || prevFa !== Boolean(p.fa_approved_2027) || prevRetired !== Boolean(p.retired_after_2026)) {
      auditChanges.push({
        id: p.id,
        name: p.name,
        kbo_player_id: p.kbo_player_id || null,
        prevTeam: prevTeamKo,
        newTeam: finalTeamKo,
        statusAfter: p.retired_after_2026
          ? '은퇴'
          : p.released_after_2026
            ? '방출(자유계약)'
            : p.fa_approved_2027
              ? '2027 FA 미계약'
              : '현역 소속',
        isOneClubMan,
        clubTenure2027: currentClubYears,
        changes,
        historySummary: p.verified_team_history.map(
          (h) => `${h.teamLabel}(${h.fromSeason}~${h.toSeason ?? '현재'}${h.transferDate ? ` · ${h.transferDate}` : ''})`
        ),
      });
    }
  }

  db.careerHistoryVerifiedAt = '2026-11-25';
  db.databaseVersion = 'v21_verified_career_histories';

  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');

  const auditReport = {
    generatedAt: '2026-11-25',
    databaseVersion: db.databaseVersion,
    backupFile: 'src/data/v20PlayerDataBackupBeforeCareerPatch.json',
    summary: {
      totalPlayersAudited: db.players.length,
      clubTransfersUpdated: transferCount,
      faSigned2027Updated: faSignedCount,
      retired2026Updated: retiredCount,
      released2026Updated: releasedCount,
      splitSeasonRecordsUpdated: splitUpdatedCount,
      totalOneClubMen: oneClubCount,
      totalMultiClubOrForeign: multiClubCount,
      totalAuditEntries: auditChanges.length,
    },
    changes: auditChanges,
  };
  fs.writeFileSync(AUDIT_PATH, JSON.stringify(auditReport, null, 2) + '\n', 'utf8');

  console.log('=== v21 Career History Verification & Patch Summary ===');
  console.log(JSON.stringify(auditReport.summary, null, 2));
}

main();
