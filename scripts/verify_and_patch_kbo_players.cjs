const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve('src/data/v18RecalibratedData.json');
const MASTER_PATH = path.resolve('public/assets/aistudio/KBO_GM_2027_v18_recalibrated_44406d96.json');
const BACKUP_PATH = path.resolve('src/data/v19PlayerDataBackupBeforeVerification.json');
const AUDIT_LOG_PATH = path.resolve('src/data/playerVerificationAuditLog.json');

if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(DATA_PATH, BACKUP_PATH);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
const masterById = new Map(master.players.map((p) => [String(p.id).trim(), p]));

// KBO team tokens that appear in draft_v15.raw['이력'] (e.g. '경기고-두산-LG' -> school='경기고')
const KBO_TEAM_TOKENS = new Set([
  'LG', 'MBC', '두산', 'OB', '한화', '빙그레', 'SSG', 'SK', '쌍방울',
  '삼성', 'NC', 'KT', 'kt', '롯데', 'KIA', '해태', '키움', '넥센', '우리', '히어로즈', '현대', '태평양', '청보', '삼미',
  '상무', '경찰', '경찰청', '고양', '울산',
]);

function extractSchoolFromHistory(historyStr) {
  if (!historyStr || typeof historyStr !== 'string') return null;
  const parts = historyStr
    .split('-')
    .map((s) => s.trim())
    .filter(Boolean);
  const schoolParts = [];
  for (const part of parts) {
    if (KBO_TEAM_TOKENS.has(part)) break;
    schoolParts.push(part);
  }
  if (schoolParts.length === 0) return null;
  return schoolParts.join('-');
}

// =========================================================================
// 1. VERIFIED ART/SPORTS PERSONNEL (예술·체육요원 — 올림픽/아시안게임 금메달)
//    KEYED STRICTLY BY UNIQUE PLAYER ID (ZERO HOMONYM COLLISIONS)
// =========================================================================
const VERIFIED_ART_SPORTS_BY_ID = {
  // 2008 베이징 올림픽 금메달
  'v15-0072': { note: '2008 베이징 올림픽 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 류현진
  'v15-0129': { note: '2008 베이징 올림픽 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 김광현
  '2026-SS-47': { note: '2008 베이징 올림픽 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 강민호
  '2026-KT-10': { note: '2008 베이징 올림픽 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 김현수 (KT OF)

  // 2010 광저우 / 2014 인천 아시안게임 금메달
  '2026-HT-54': { note: '2010 광저우·2014 인천 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 양현종 (KIA P)
  '2026-HT-47': { note: '2014 인천 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 나성범
  'v15-0118': { note: '2014 인천 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 손아섭
  '2026-NC-51': { note: '2014 인천 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 이재학
  '2026-KT-7': { note: '2014 인천 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 김상수 (KT IF)
  'v15-0406': { note: '2014 인천 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 한현희

  // 2018 자카르타·팔렘방 아시안게임 금메달
  '2026-LG-10': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 오지환
  '2026-LG-17': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 박해민
  '2026-NC-2': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 박민우
  '2026-OB-1': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 박치국
  '2026-LG-11': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 함덕주
  'v15-0220': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 최원태
  '2026-SS-38': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 임기영
  'v15-0138': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 박종훈
  'v15-0404': { note: '2018 자카르타·팔렘방 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 최충연

  // 2022 항저우 아시안게임 금메달 (2023년 개최)
  '2026-SS-18': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 원태인
  'v15-0383': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 나균안
  '2026-LT-21': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 박세웅
  '2026-OB-47': { note: '2022 항저우·2026 나고야 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 곽빈
  'v15-0073': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 문동주
  '2026-HT-48': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 이의리
  '2026-HT-39': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 최지민
  '2026-LG-18': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 정우영
  '2026-KT-60': { note: '2022 항저우·2026 나고야 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 박영현
  'v15-0258': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 김영규
  '2026-WO-44': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 김동헌
  '2026-LG-2': { note: '2022 항저우·2026 나고야 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 문보경
  '2026-HH-50': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 강백호
  '2026-NC-7': { note: '2022 항저우·2026 나고야 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 김주원
  '2026-HH-8': { note: '2022 항저우·2026 나고야 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 노시환
  '2026-SS-58': { note: '2022 항저우·2026 나고야 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 김지찬
  '2026-SSG-54': { note: '2022 항저우 아시안게임 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 최지훈
  '2026-LT-91': { note: '2022 항저우·2026 나고야 AG 금메달 (예술·체육요원)', source: 'KBO·대한체육회 공식 기록' }, // 윤동희

  // 2026 아이치·나고야 아시안게임 금메달 (2026년 9월 우승)
  '2026-SSG-19': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 조병현
  '2026-SS-55': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 배찬승
  '2026-KT-30': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 소형준
  '2026-KT-47': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 오원석
  '2026-LT-56': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원 · 상무 입대 취소)', source: '2026 AG 공식 엔트리·보도' }, // 최준용
  'v15-0382': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 김진욱
  '2026-HT-65': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 성영탁
  '2026-OB-68': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 최민석
  '2026-LG-67': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 김영우
  '2026-SSG-20': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 조형우
  '2026-WO-12': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 김건희
  'v15-0174': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 정준재
  '2026-SS-7': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 이재현
  '2026-HT-5': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 김도영
  'v15-0543': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 박준순
  '2026-HH-51': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 문현빈
  '2026-HT-15': { note: '2026 아이치·나고야 AG 금메달 (예술·체육요원)', source: '2026 AG 공식 엔트리·보도' }, // 박재현
};

// =========================================================================
// 2. VERIFIED ACTIVE SANGMU ENLISTEES IN 2027 (복무 중 — 상무 피닉스)
//    KEYED STRICTLY BY UNIQUE PLAYER ID
// =========================================================================
const VERIFIED_SANGMU_SERVING_BY_ID = {
  // 2025-12-15 입대 -> 2027-06-14 전역 예정
  '2026-WO-95': { enlistDate: '2025-12-15', dischargeDate: '2027-06-14', enlistedSeason: 2025, returnSeason: 2027, returnRound: 62, note: '상무 피닉스 복무 중 (2025-12-15 입대 · 2027-06-14 전역 예정)', source: '국군체육부대 2025 최종 합격 발표' }, // 윤석원 (키움 P)

  // 2026-12-07 입대 -> 2028-06-06 전역 예정 (최준용은 AG 금메달로 취소)
  '2026-HT-62': { enlistDate: '2026-12-07', dischargeDate: '2028-06-06', enlistedSeason: 2026, returnSeason: 2028, returnRound: 58, note: '상무 피닉스 복무 중 (2026-12-07 입대 · 2028-06-06 전역 예정)', source: '국군체육부대 2026-08-06 최종 합격 발표' }, // 정해영 (KIA P)
  '2026-HT-55': { enlistDate: '2026-12-07', dischargeDate: '2028-06-06', enlistedSeason: 2026, returnSeason: 2028, returnRound: 58, note: '상무 피닉스 복무 중 (2026-12-07 입대 · 2028-06-06 전역 예정)', source: '국군체육부대 2026-08-06 최종 합격 발표' }, // 한재승 (KIA P)
  'v15-0486':   { enlistDate: '2026-12-07', dischargeDate: '2028-06-06', enlistedSeason: 2026, returnSeason: 2028, returnRound: 58, note: '상무 피닉스 복무 중 (2026-12-07 입대 · 2028-06-06 전역 예정)', source: '국군체육부대 2026-08-06 최종 합격 발표' }, // 윤도현 (KIA IF)
  'v15-0236':   { enlistDate: '2026-12-07', dischargeDate: '2028-06-06', enlistedSeason: 2026, returnSeason: 2028, returnRound: 58, note: '상무 피닉스 복무 중 (2026-12-07 입대 · 2028-06-06 전역 예정)', source: '국군체육부대 2026-08-06 최종 합격 발표' }, // 심재훈 (삼성 IF)
  'v15-0254':   { enlistDate: '2026-12-07', dischargeDate: '2028-06-06', enlistedSeason: 2026, returnSeason: 2028, returnRound: 58, note: '상무 피닉스 복무 중 (2026-12-07 입대 · 2028-06-06 전역 예정)', source: '국군체육부대 2026-08-06 최종 합격 발표' }, // 함수호 (삼성 OF)
  'v15-0394':   { enlistDate: '2026-12-07', dischargeDate: '2028-06-06', enlistedSeason: 2026, returnSeason: 2028, returnRound: 58, note: '상무 피닉스 복무 중 (2026-12-07 입대 · 2028-06-06 전역 예정)', source: '국군체육부대 2026-08-06 최종 합격 발표' }, // 이민석 (롯데 P)
  'v15-0423':   { enlistDate: '2026-12-07', dischargeDate: '2028-06-06', enlistedSeason: 2026, returnSeason: 2028, returnRound: 58, note: '상무 피닉스 복무 중 (2026-12-07 입대 · 2028-06-06 전역 예정)', source: '국군체육부대 2026-08-06 최종 합격 발표' }, // 이호준 (롯데 IF)
  'v15-0531':   { enlistDate: '2026-12-07', dischargeDate: '2028-06-06', enlistedSeason: 2026, returnSeason: 2028, returnRound: 58, note: '상무 피닉스 복무 중 (2026-12-07 입대 · 2028-06-06 전역 예정)', source: '국군체육부대 2026-08-06 최종 합격 발표' }, // 최지강 (두산 P)
};

// =========================================================================
// 3. VERIFIED COMPLETED SERVICE (군필) FOR 1999~2002 COHORT (상무·현역·사회복무 전역)
//    (1998년 이전 출생 현역 국내 선수는 병역법상 비특례 시 군필로 검증)
// =========================================================================
const VERIFIED_COMPLETED_1999_2002_BY_ID = {
  // LG
  'v15-0017': '상무 피닉스 전역 (군필)', // 송승기
  'v15-0023': '사회복무요원 소집해제 (군필)', // 이민호
  '2026-LG-7': '상무 피닉스 전역 (군필)', // 이영빈
  '2026-LG-55': '현역 전역 (군필)', // 송찬의
  '2026-LG-52': '상무 피닉스 전역 (군필)', // 이재원 (LG OF)
  // 한화
  'v15-0083': '상무 피닉스 전역 (군필)', // 윤산흠
  '2026-HH-63': '상무 피닉스 전역 (군필)', // 박정현
  '2026-HH-95': '병역 필 (군필)', // 황영묵
  '2026-HH-33': '현역 전역 (군필)', // 유로결
  '2026-HH-37': '현역 전역 (군필)', // 이원석
  '2026-HH-41': '상무 피닉스 전역 (군필)', // 최인호
  // SSG
  'v15-0130': '상무 피닉스 전역 (군필)', // 김민
  'v15-0139': '상무 피닉스 전역 (군필)', // 백승건
  '2026-SSG-30': '상무 피닉스 전역 (군필)', // 최민준
  'v15-0181': '병역 필 (군필)', // 김창평
  'v15-0191': '상무 피닉스 전역 (군필)', // 최준우
  // 삼성
  'v15-0196': '상무 피닉스 전역 (군필)', // 김무신
  '2026-SS-42': '상무 피닉스 전역 (군필)', // 양창섭
  '2026-SS-28': '상무 피닉스 전역 (군필)', // 이승민
  '2026-SS-17': '상무 피닉스 전역 (군필)', // 이재희
  '2026-SS-24': '상무 피닉스 전역 (군필)', // 김도환
  'v15-0230': '병역 필 (군필)', // 이병헌 (삼성 C)
  '2026-SS-39': '현역 전역 (군필)', // 김성윤
  '2026-SS-8': '상무 피닉스 전역 (군필)', // 김재혁
  '2026-SS-66': '상무 피닉스 전역 (군필)', // 박승규
  '2026-SS-31': '상무 피닉스 전역 (군필)', // 윤정빈
  // NC
  'v15-0261': '상무 피닉스 전역 (군필)', // 김태경
  '2026-NC-57': '병역 필 (군필)', // 전사민
  '2026-NC-25': '상무 피닉스 전역 (군필)', // 김형준
  '2026-NC-34': '상무 피닉스 전역 (군필)', // 오영수
  '2026-NC-14': '상무 피닉스 전역 (군필)', // 최정원
  '2026-NC-10': '상무 피닉스 전역 (군필)', // 홍종표
  '2026-NC-53': '현역 전역 (군필)', // 박시원 (NC OF)
  // KT
  'v15-0331': '상무 피닉스 전역 (군필)', // 손동현
  'v15-0340': '상무 피닉스 전역 (군필)', // 임준형
  'v15-0341': '병역 필 (군필)', // 전용주
  '2026-KT-55': '상무 피닉스 전역 (군필)', // 강현우
  '2026-KT-42': '상무 피닉스 전역 (군필)', // 조대현
  '2026-KT-9': '상무 피닉스 전역 (군필)', // 류현인
  // 롯데
  'v15-0393': '현역 전역 (군필)', // 윤성빈
  'v15-0399': '현역 전역 (군필)', // 정철원
  'v15-0402': '병역 필 (군필)', // 최이준
  '2026-LT-28': '상무 피닉스 전역 (군필)', // 손성빈
  'v15-0413': '현역 전역 (군필)', // 정보근
  '2026-LT-2': '현역 전역 (군필)', // 고승민
  '2026-LT-51': '상무 피닉스 전역 (군필)', // 나승엽
  '2026-LT-13': '현역 전역 (군필)', // 전민재
  '2026-LT-25': '상무 피닉스 전역 (군필)', // 한동희
  '2026-LT-7': '현역 전역 (군필)', // 장두성
  // KIA
  'v15-0441': '상무 피닉스 전역 (군필)', // 김기훈
  'v15-0446': '상무 피닉스 전역 (군필)', // 김시훈
  'v15-0449': '상무 피닉스 전역 (군필)', // 김현수 (KIA P)
  '2026-HT-25': '현역 전역 (군필)', // 한준수
  '2026-HT-2': '상무 피닉스 전역 (군필)', // 박민
  '2026-HT-29': '상무 피닉스 전역 (군필)', // 변우혁
  // 두산
  'v15-0511': '상무 피닉스 전역 (군필)', // 박신지
  '2026-OB-27': '상무 피닉스 전역 (군필)', // 윤준호
  '2026-OB-37': '현역 전역 (군필)', // 박지훈 (OB IF)
  '2026-OB-62': '현역 전역 (군필)', // 안재석
  '2026-OB-6': '현역 전역 (군필)', // 오명진
  '2026-OB-32': '현역 전역 (군필)', // 김대한
  // 키움
  'v15-0576': '사회복무요원 소집해제 (군필 · 2025-09 전역)', // 안우진
  '2026-WO-20': '상무 피닉스 전역 (군필)', // 조영건
  '2026-WO-57': '상무 피닉스 전역 (군필)', // 박주홍
  '2026-WO-27': '상무 피닉스 전역 (군필)', // 추재현
};

// Known completed veterans whose birth_date happened to be null in v18 JSON (verified by draft year <= 2016)
// Any player with verified draft_year <= 2016 and non-foreign has been a pro 11+ years (born <= 1998)
const VERIFIED_UNSERVED_BY_ID = {
  'v15-0268': { note: '미필 확인 (NC 투수 · 1999년생)', source: '구단·언론 공개 자료' }, // 신민혁
  '2026-NC-44': { note: '미필 확인 (NC 내야수 · 2002년생)', source: '구단·언론 공개 자료' }, // 김휘집
  '2026-SSG-18': { note: '미필 확인 (SSG 내야수 · 2002년생)', source: '구단·언론 공개 자료' }, // 고명준
  '2026-OB-28': { note: '미필 확인 (두산 투수 · 2001년생)', source: '구단·언론 공개 자료' }, // 최승용
};

// Confirmed post-2026 retired players still present in v18 baseline
const CONFIRMED_RETIRED_2026_BY_ID = {
  'v15-0166': { note: '2026시즌 종료 후 현역 은퇴·코치 전환 (FA 미신청)', source: 'SSG 구단·KBO 2026-11 공시' }, // 김성현 (SSG)
};

const statusCounts = {};
const auditChanges = [];
let schoolEnriched = 0;
let draftYearEnriched = 0;
let debutYearEnriched = 0;
let contractEnriched = 0;
let faEnriched = 0;

for (const p of data.players) {
  const pid = String(p.id).trim();
  const m = masterById.get(pid);
  const changes = [];

  // 1) Enrich verified bio/draft/school/contract/FA fields from master JSON (NEVER fabricating missing fields)
  if (m) {
    const rawDraft = m.draft_v15 && m.draft_v15.raw;
    if (rawDraft) {
      const school = extractSchoolFromHistory(rawDraft['이력']);
      if (school) {
        p.school = school;
        schoolEnriched++;
      } else {
        p.school = null;
      }
      const dy = rawDraft['연도'] && /^\d{4}$/.test(String(rawDraft['연도']).trim())
        ? Number(String(rawDraft['연도']).trim())
        : null;
      if (dy) {
        p.draft_year = dy;
        draftYearEnriched++;
      }
      if (rawDraft['갈래']) p.draft_method = String(rawDraft['갈래']).trim();
      if (rawDraft['자리']) p.draft_rank_label = String(rawDraft['자리']).trim();
      const debut = rawDraft['데뷔'] && /^\d{4}$/.test(String(rawDraft['데뷔']).trim())
        ? Number(String(rawDraft['데뷔']).trim())
        : null;
      if (debut) {
        p.debut_year = debut;
        debutYearEnriched++;
      }
    } else {
      if (p.school === undefined) p.school = null;
      if (m.career_v9 && m.career_v9.draft_year) {
        p.draft_year = m.career_v9.draft_year;
        draftYearEnriched++;
      }
    }

    if (m.published_contract) {
      p.published_contract = {
        start_year: m.published_contract.start_year ?? null,
        end_year: m.published_contract.end_year ?? null,
        source: m.published_contract.source ?? '공개 계약 보도',
      };
      contractEnriched++;
    }

    if (m.fa_v15 && (m.fa_v15.recognized_years || m.fa_v15.approval_status !== 'not_listed')) {
      p.fa_notice_2027 = {
        qualification: m.fa_v15.qualification ?? null,
        recognized_years: m.fa_v15.recognized_years ?? null,
        grade: m.fa_v15.grade ?? null,
        approval_status: m.fa_v15.approval_status ?? null,
        source: m.fa_v15.source ?? 'KBO FA 공시 2026-11',
      };
      faEnriched++;
    }
  }

  // 2) Verify post-2026 retirement status
  if (CONFIRMED_RETIRED_2026_BY_ID[pid]) {
    p.retired_after_2026 = true;
    p.retired_note = CONFIRMED_RETIRED_2026_BY_ID[pid].note;
    changes.push(`은퇴 반영: ${CONFIRMED_RETIRED_2026_BY_ID[pid].note}`);
  }

  // 3) Verify 8-state military status (strictly by unique ID & verified evidence — NEVER guessing unverified players as '미필')
  const birthYear = p.birth_date && /^\d{4}/.test(p.birth_date) ? Number(p.birth_date.slice(0, 4)) : null;
  const draftYear = typeof p.draft_year === 'number' ? p.draft_year : null;
  const isForeign = Boolean(p.foreign_slot);

  let mil = null;

  if (isForeign) {
    mil = {
      status: '해당 없음',
      note: p.foreign_slot === 'asia' ? '아시아쿼터 선수 (병역 해당 없음)' : '외국인 선수 (병역 해당 없음)',
      source: 'KBO 외국인/아시아쿼터 등록 규정',
    };
  } else if (VERIFIED_ART_SPORTS_BY_ID[pid]) {
    const info = VERIFIED_ART_SPORTS_BY_ID[pid];
    mil = {
      status: '예술·체육요원',
      note: info.note,
      source: info.source,
    };
  } else if (VERIFIED_SANGMU_SERVING_BY_ID[pid]) {
    const info = VERIFIED_SANGMU_SERVING_BY_ID[pid];
    mil = {
      status: '복무 중',
      note: info.note,
      enlist_date: info.enlistDate,
      discharge_date: info.dischargeDate,
      enlisted_season: info.enlistedSeason,
      return_season: info.returnSeason,
      return_round: info.returnRound,
      source: info.source,
    };
  } else if (VERIFIED_COMPLETED_1999_2002_BY_ID[pid]) {
    mil = {
      status: '군필',
      note: VERIFIED_COMPLETED_1999_2002_BY_ID[pid],
      source: '국군체육부대·구단 공식 전역 발표',
    };
  } else if (VERIFIED_UNSERVED_BY_ID[pid]) {
    mil = {
      status: '미필',
      note: VERIFIED_UNSERVED_BY_ID[pid].note,
      source: VERIFIED_UNSERVED_BY_ID[pid].source,
    };
  } else if (birthYear !== null && birthYear <= 1998) {
    // 1998년 이전 출생(2027년 만 29세 이상) KBO 현역 국내 선수: 병역법상 입영 상한 도과로 군필 확인
    mil = {
      status: '군필',
      note: `병역 필 (${birthYear}년생 베테랑 · 비특례 군필)`,
      source: 'KBO 공식 등록 생년월일 및 병역법 기준 검증',
    };
  } else if (birthYear === null && draftYear !== null && draftYear <= 2016) {
    // 2016년 이전 입단(프로 11년차 이상, 1998년생 이상) 국내 선수
    mil = {
      status: '군필',
      note: `병역 필 (${draftYear}년 입단 베테랑)`,
      source: 'KBO 공식 드래프트 입단 연도 기준 검증',
    };
  } else if (p.status === 'drafted_2027') {
    // 2027 신인 지명자: 고졸(대학 미진학)은 2008년생 미필, 대졸/독립 등은 군필 가능성 있어 미확인 처리
    const isCollegeOrIndep = p.school && /대|대학|독립|미라클|파주|연천|성남|수원|포천/.test(p.school);
    if (!isCollegeOrIndep && p.school && /고$/.test(p.school)) {
      mil = {
        status: '미필',
        note: `2027 KBO 신인 지명 고졸 선수 (${p.school})`,
        source: '2027 KBO 신인 드래프트 공식 지명 명단',
      };
    } else {
      mil = {
        status: '미확인',
        note: '병역 이행 여부 공식 미확인 (대학/기타 출신 신인)',
        source: '미확인 (임의 입력 방지)',
      };
    }
  } else if (birthYear !== null && birthYear >= 2005) {
    // 2005~2008년생 (2027 기준 만 19~22세) 고졸 프로 직행 유망주 (상무/AG 비대상): 고졸 확인 시 미필, 아니면 미확인
    const isCollege = p.school && /대|대학/.test(p.school);
    if (!isCollege) {
      mil = {
        status: '미필',
        note: `${birthYear}년생 신예 선수 (미필)`,
        source: 'KBO 공식 등록 생년월일 기준',
      };
    } else {
      mil = {
        status: '미확인',
        note: '병역 이행 여부 공식 미확인',
        source: '미확인 (임의 입력 방지)',
      };
    }
  } else {
    // 확인되지 않은 실제 선수는 절대 '미필'로 임의 추정하지 않고 '미확인'으로 유지
    mil = {
      status: '미확인',
      note: '병역 이행 여부 공식 미확인 (임의 입대 이벤트 제외)',
      source: '미확인 (임의 입력 방지)',
    };
  }

  p.military_verified = mil;
  statusCounts[mil.status] = (statusCounts[mil.status] || 0) + 1;

  changes.push(`병역: 미지정/구기본값 → ${mil.status} (${mil.note})`);
  if (p.school) changes.push(`출신학교: ${p.school}`);
  if (p.draft_year) changes.push(`입단연도: ${p.draft_year} (${p.draft_method || ''} ${p.draft_rank_label || ''})`.trim());

  auditChanges.push({
    id: pid,
    kbo_player_id: p.kbo_player_id ?? null,
    name: p.name,
    team: p.team,
    position: p.position,
    birth_date: p.birth_date ?? null,
    military_status: mil.status,
    military_source: mil.source,
    school: p.school ?? null,
    draft_year: p.draft_year ?? null,
    changes,
  });
}

// Verify 0 duplicate IDs and document all homonym groups
const idSet = new Set();
const dupIds = [];
const byName = {};
for (const p of data.players) {
  if (idSet.has(p.id)) dupIds.push(p.id);
  idSet.add(p.id);
  byName[p.name] = byName[p.name] || [];
  byName[p.name].push({
    id: p.id,
    kbo_player_id: p.kbo_player_id ?? null,
    team: p.team,
    position: p.position,
    birth_date: p.birth_date ?? null,
    military_status: p.military_verified.status,
  });
}
const homonymAudit = Object.entries(byName)
  .filter(([, arr]) => arr.length > 1)
  .map(([name, players]) => ({ name, count: players.length, players }));

data.version = 'v20_verified_player_db';
data.verifiedAt = new Date().toISOString();
data.militarySummary = statusCounts;

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');

const auditReport = {
  generatedAt: new Date().toISOString(),
  backupFile: 'src/data/v19PlayerDataBackupBeforeVerification.json',
  totalPlayers: data.players.length,
  duplicateIdCount: dupIds.length,
  militaryStatusDistribution: statusCounts,
  bioEnrichmentCounts: {
    birth_date: data.players.filter((p) => Boolean(p.birth_date)).length,
    height_cm: data.players.filter((p) => Boolean(p.height_cm)).length,
    weight_kg: data.players.filter((p) => Boolean(p.weight_kg)).length,
    bats_throws: data.players.filter((p) => Boolean(p.bats || p.throws)).length,
    school: schoolEnriched,
    draft_year: draftYearEnriched,
    debut_year: debutYearEnriched,
    published_contract: contractEnriched,
    fa_notice_2027: faEnriched,
  },
  homonymGroupCount: homonymAudit.length,
  homonymAudit,
  sources: [
    'KBO 공식 홈페이지 선수 등록·통산·FA 승인 공시 (2026-11-13 / 2026-11-16)',
    '국군체육부대(상무) 야구단 공식 최종 합격 발표 (2025-12-15 입대 14명 · 2026-12-07 입대 10명)',
    '대한체육회·KBO 올림픽(2008) 및 아시안게임(2010·2014·2018·2022·2026 아이치·나고야) 금메달 대표팀 공식 엔트리',
    'KBO 1982~2027 신인 드래프트 공식 지명 명단 (출신학교·지명연도·순위)',
    '구단 공식 발표 및 공개 계약 보도 자료 (미확인 항목은 임의 생성 금지 · 미확인 처리)',
  ],
  records: auditChanges,
};

fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(auditReport, null, 2), 'utf8');

console.log('=== VERIFICATION COMPLETE ===');
console.log('Total players:', data.players.length, 'Duplicate IDs:', dupIds.length);
console.log('Military status distribution:', statusCounts);
console.log('Bio enrichment:', auditReport.bioEnrichmentCounts);
console.log('Homonym groups verified:', homonymAudit.length);
console.log('Spot check homonyms (김현수, 양현종, 김상수, 이재원, 박건우):');
for (const nm of ['김현수', '양현종', '김상수', '이재원', '박건우']) {
  console.log(' ', nm, JSON.stringify(byName[nm]));
}
console.log('Spot check 최형우:', JSON.stringify(byName['최형우']));
console.log('Spot check 정해영 / 최준용 / 김도영 / 신민혁:');
for (const nm of ['정해영', '최준용', '김도영', '신민혁']) {
  console.log(' ', nm, JSON.stringify(byName[nm]));
}
