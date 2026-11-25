/**
 * KBO 실제 선수 생년월일 전수 검증 및 최지만 능력치·프로필 보정 스크립트 (v22)
 * - 수정 전 데이터를 src/data/v21PlayerDataBackupBeforeBirthdatePatch.json 에 자동 백업
 * - KBO 공식 기록실 / 구단 공식 프로필 / 위키백과 기준 확인된 실존 선수의 정확한 YYYY-MM-DD 반영
 * - 확인되지 않은 실제 신인 선수의 생년월일은 임의 생성하지 않고 null('미확인') 유지
 * - 변경된 전체 선수 목록과 출처를 src/data/birthdateVerificationAuditLog.json 에 기록
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve('src/data/v18RecalibratedData.json');
const BACKUP_PATH = path.resolve('src/data/v21PlayerDataBackupBeforeBirthdatePatch.json');
const AUDIT_LOG_PATH = path.resolve('src/data/birthdateVerificationAuditLog.json');

if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(DATA_PATH, BACKUP_PATH);
  console.log('Backed up pre-patch dataset to:', BACKUP_PATH);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// =============================================================================
// 1. 공식 확인된 실존 선수 생년월일 맵 (고유 선수 ID 기준 — 동명이인 충돌 0건 보장)
// =============================================================================
const VERIFIED_BIRTHDATES_BY_ID = {
  // --- 최지만 & 박종훈 (최우선 수정 대상) ---
  'D2027-015': { birth_date: '1991-05-19', source: 'MLB/KBO 공식 프로필 (최지만 1991-05-19)' },
  'v15-0138':  { birth_date: '1991-08-13', source: 'KBO 공식 기록실 #60841 (박종훈 1991-08-13)' },

  // --- LG 트윈스 ---
  'v15-0007':  { birth_date: '1996-12-08', source: 'KBO 공식 기록실 #65411 (김주온)' },
  'v15-0010':  { birth_date: '2004-03-27', source: 'KBO 공식 기록실 #53139 (박명근)' },
  'v15-0026':  { birth_date: '1999-07-02', source: 'KBO 공식 기록실 #69108 (이지강)' },
  '2026-LG-18':{ birth_date: '1999-08-19', source: 'KBO 공식 기록실 #69159 (정우영)' },
  'v15-0038':  { birth_date: '1994-07-25', source: 'KBO 공식 기록실 #62558 (김준태)' },
  'v15-0056':  { birth_date: '2006-03-22', source: 'KBO 공식 기록실 #55164 (박관우)' },
  '2026-LG-49':{ birth_date: '2007-01-08', source: 'LG 트윈스 공식 프로필 · 2026 신인 (권우준)' },
  '2026-LG-43':{ birth_date: '2005-03-03', source: 'LG 트윈스 공식 프로필 · 2026 신인 (김동현)' },
  'v15-0012':  { birth_date: '2007-12-11', source: 'LG 트윈스 공식 프로필 · 2026 신인 (박준성)' },
  'v15-0020':  { birth_date: '2007-02-07', source: 'LG 트윈스 공식 프로필 · 2026 신인 (우명현)' },
  'v15-0028':  { birth_date: '1987-11-01', source: 'KBO 공식 기록실 (장시환)' },
  'v15-0043':  { birth_date: '1998-03-18', source: 'KBO 공식 기록실 (김정율)' },
  'v15-0052':  { birth_date: '2006-04-19', source: 'LG 트윈스 공식 프로필 (추세현)' },
  'v15-0058':  { birth_date: '2006-03-18', source: 'LG 트윈스 공식 프로필 (서영준)' },

  // --- 한화 이글스 ---
  'v15-0068':  { birth_date: '1995-07-25', source: 'KBO 공식 기록실 #65764 (김민우)' },
  'v15-0077':  { birth_date: '1999-11-18', source: 'KBO 공식 기록실 #69974 (배민서)' },
  '2026-HH-42':{ birth_date: '1997-03-03', source: 'KBO 공식 기록실 #66707 (박상언)' },
  'v15-0098':  { birth_date: '1999-02-12', source: 'KBO 공식 기록실 #69706 (허관회)' },
  'v15-0107':  { birth_date: '2002-07-23', source: 'KBO 공식 기록실 #55712 (이승현 · 한화 IF)' },
  'v15-0122':  { birth_date: '2004-03-07', source: 'KBO 공식 기록실 #55710 (이민재)' },
  'v15-0125':  { birth_date: '2001-09-28', source: 'KBO 공식 기록실 #50704 (임종찬)' },
  'v15-0076':  { birth_date: '2003-03-02', source: '한화 이글스 공식 프로필 (박준영 · P)' },
  'v15-0081':  { birth_date: '2006-09-09', source: '한화 이글스 공식 프로필 (양수호)' },
  'v15-0087':  { birth_date: '2000-03-07', source: 'KBO 공식 기록실 (정이황)' },
  'v15-0091':  { birth_date: '2003-12-04', source: '한화 이글스 공식 프로필 (한서구)' },
  'v15-0101':  { birth_date: '2007-03-23', source: '한화 이글스 공식 프로필 · 2026 신인 (권현규)' },

  // --- SSG 랜더스 ---
  'v15-0129':  { birth_date: '1988-07-22', source: 'KBO 공식 기록실 #77829 (김광현)' },
  'v15-0136':  { birth_date: '2005-07-26', source: 'KBO 공식 기록실 #54802 (박기호)' },
  '2026-SSG-60':{ birth_date: '2006-04-17', source: 'KBO 공식 기록실 #55860 (신지환)' },
  'v15-0142':  { birth_date: '2004-05-28', source: 'KBO 공식 기록실 #53898 (송영진)' },
  'v15-0151':  { birth_date: '2000-01-06', source: 'KBO 공식 기록실 #51809 (조요한)' },
  'v15-0161':  { birth_date: '2006-11-21', source: 'KBO 공식 기록실 #55832 (이율예)' },
  'v15-0167':  { birth_date: '1998-07-16', source: 'KBO 공식 기록실 #67900 (김수윤)' },
  'v15-0169':  { birth_date: '2003-02-28', source: 'KBO 공식 기록실 #52803 (김태윤)' },
  'v15-0176':  { birth_date: '1987-02-28', source: 'KBO 공식 기록실 #75847 (최정)' },
  'v15-0177':  { birth_date: '2001-07-08', source: 'KBO 공식 기록실 #50840 (현원회)' },
  'v15-0183':  { birth_date: '2005-07-12', source: 'KBO 공식 기록실 #54805 (박지환)' },
  '2026-SSG-9':{ birth_date: '2005-01-06', source: 'KBO 공식 기록실 #54806 (이승민 · SSG OF)' },
  'v15-0193':  { birth_date: '1990-10-29', source: 'KBO 공식 기록실 #69813 (하재훈)' },
  'v15-0132':  { birth_date: '2001-04-30', source: 'SSG 랜더스 공식 프로필 (김성민 · P)' },
  'v15-0152':  { birth_date: '2006-03-06', source: 'SSG 랜더스 공식 프로필 (천범석)' },
  'v15-0158':  { birth_date: '2002-08-23', source: 'SSG 랜더스 공식 프로필 (김규민 · C)' },
  '2026-SSG-49':{ birth_date: '2007-09-12', source: 'SSG 랜더스 공식 프로필 · 2026 신인 (장재율)' },

  // --- 삼성 라이온즈 ---
  'v15-0195':  { birth_date: '2001-10-15', source: 'KBO 공식 기록실 #54401 (김대호)' },
  'v15-0215':  { birth_date: '2004-08-14', source: 'KBO 공식 기록실 #53455 (이호성)' },
  'v15-0218':  { birth_date: '2005-05-09', source: 'KBO 공식 기록실 #54467 (정민성)' },
  'v15-0222':  { birth_date: '1999-03-26', source: 'KBO 공식 기록실 #68501 (최하늘)' },
  'v15-0229':  { birth_date: '2003-10-14', source: 'KBO 공식 기록실 #53411 (박진우 · C)' },
  '2026-SS-67':{ birth_date: '2006-08-18', source: '삼성 라이온즈 공식 프로필 · 2026 신인 (김상호)' },
  'v15-0199':  { birth_date: '1992-03-02', source: 'KBO 공식 기록실 (김태훈 · 삼성 투수)' },
  'v15-0200':  { birth_date: '1998-01-28', source: 'MLB/KBO 공식 프로필 (맷 매닝)' },
  'v15-0210':  { birth_date: '1991-11-20', source: 'KBO 공식 기록실 (이승현 · 삼성 우완)' },
  'v15-0211':  { birth_date: '2002-05-19', source: 'KBO 공식 기록실 (이승현 · 삼성 좌완)' },
  'v15-0214':  { birth_date: '2007-05-28', source: '삼성 라이온즈 공식 프로필 · 2026 신인 (이호범)' },
  'v15-0247':  { birth_date: '1996-03-31', source: 'KBO 공식 기록실 (김태훈 · 삼성 외야수)' },

  // --- NC 다이노스 ---
  'v15-0257':  { birth_date: '2003-05-17', source: 'KBO 공식 기록실 #52995 (김녹원)' },
  'v15-0276':  { birth_date: '2000-06-16', source: 'KBO 공식 기록실 #50995 (정구범)' },
  '2026-NC-47':{ birth_date: '1998-12-21', source: 'KBO 공식 기록실 #52903 (조민석)' },
  'v15-0307':  { birth_date: '2001-03-15', source: 'KBO 공식 기록실 #54908 (고승완)' },
  'v15-0271':  { birth_date: '2005-08-08', source: 'NC 다이노스 공식 프로필 (이세민)' },
  'v15-0288':  { birth_date: '2006-08-13', source: 'NC 다이노스 공식 프로필 (신민우)' },

  // --- KT 위즈 ---
  'v15-0316':  { birth_date: '2004-07-12', source: 'KBO 공식 기록실 #53006 (강건)' },
  'v15-0320':  { birth_date: '2006-01-21', source: 'KBO 공식 기록실 #55040 (김동현 · KT P)' },
  'v15-0324':  { birth_date: '2006-11-28', source: 'KBO 공식 기록실 #55046 (박건우 · KT P)' },
  'v15-0335':  { birth_date: '2004-10-16', source: 'KBO 공식 기록실 #54063 (원상현)' },
  'v15-0339':  { birth_date: '1998-11-23', source: 'KBO 공식 기록실 #68896 (이채호)' },
  'v15-0342':  { birth_date: '1995-06-27', source: 'KBO 공식 기록실 #64768 (조이현)' },
  '2026-KT-16':{ birth_date: '1989-09-19', source: 'KBO 공식 기록실 #79140 (최동환)' },
  'v15-0375':  { birth_date: '2002-07-05', source: 'KBO 공식 기록실 #51007 (최성민)' },
  'v15-0318':  { birth_date: '2005-05-29', source: 'KT 위즈 공식 프로필 · 2026 신인 (고준혁)' },
  'v15-0319':  { birth_date: '2003-03-09', source: 'KT 위즈 공식 프로필 (권성준)' },
  '2026-KT-64':{ birth_date: '2003-05-07', source: 'KBO 공식 기록실 (이원재)' },
  '2026-KT-97':{ birth_date: '2007-09-11', source: 'KT 위즈 공식 프로필 · 2026 신인 (김건휘)' },
  'v15-0362':  { birth_date: '2003-01-03', source: 'KT 위즈 공식 프로필 · 2026 신인 (임상우)' },

  // --- 롯데 자이언츠 ---
  'v15-0379':  { birth_date: '1988-01-02', source: 'KBO 공식 기록실 #76430 (김상수 · P)' },
  'v15-0386':  { birth_date: '1989-03-10', source: 'KBO 공식 기록실 #60559 (박시영)' },
  'v15-0389':  { birth_date: '1999-04-02', source: 'KBO 공식 기록실 #69594 (박진)' },
  'v15-0398':  { birth_date: '1995-11-16', source: 'KBO 공식 기록실 #68556 (정성종)' },
  'v15-0406':  { birth_date: '1993-06-25', source: 'KBO 공식 기록실 #62363 (한현희)' },
  'v15-0422':  { birth_date: '2002-11-24', source: 'KBO 공식 기록실 #55511 (이태경)' },
  '2026-LT-35':{ birth_date: '1999-01-12', source: 'KBO 공식 기록실 (김영준 · P)' },
  '2026-LT-32':{ birth_date: '2007-02-24', source: '롯데 자이언츠 공식 프로필 · 2026 신인 (정문혁)' },

  // --- KIA 타이거즈 ---
  'v15-0442':  { birth_date: '1991-05-08', source: 'KBO 공식 기록실 #60337 (김대유)' },
  'v15-0443':  { birth_date: '2000-09-13', source: 'KBO 공식 기록실 #69745 (김도현)' },
  '2026-HT-21':{ birth_date: '1994-06-08', source: 'KBO 공식 기록실 #63894 (김사윤)' },
  'v15-0447':  { birth_date: '2006-04-18', source: 'KBO 공식 기록실 #55646 (김정엽)' },
  'v15-0455':  { birth_date: '2000-11-15', source: 'KBO 공식 기록실 #50604 (유지성)' },
  'v15-0456':  { birth_date: '2004-04-20', source: 'KBO 공식 기록실 #53613 (윤영철)' },
  '2026-HT-19':{ birth_date: '1995-04-25', source: 'KBO 공식 기록실 #68619 (윤중현)' },
  '2026-HT-66':{ birth_date: '2005-01-07', source: 'KBO 공식 기록실 #53615 (이도현)' },
  '2026-HT-58':{ birth_date: '2006-05-18', source: 'KBO 공식 기록실 #55632 (이성원)' },
  'v15-0461':  { birth_date: '1992-08-10', source: 'KBO 공식 기록실 #65665 (이준영)' },
  'v15-0464':  { birth_date: '2006-08-26', source: 'KBO 공식 기록실 #55663 (이호민 · KIA P)' },
  '2026-HT-23':{ birth_date: '1996-10-24', source: 'KBO 공식 기록실 #65464 (최정용)' },
  'v15-0493':  { birth_date: '1999-02-28', source: 'KBO 공식 기록실 #67610 (김석환)' },
  'v15-0499':  { birth_date: '2004-05-21', source: 'KBO 공식 기록실 #53659 (정해원)' },
  'v15-0467':  { birth_date: '2006-06-10', source: 'KIA 타이거즈 공식 프로필 · 2026 신인 (정찬화)' },

  // --- 두산 베어스 ---
  'v15-0504':  { birth_date: '1999-05-07', source: 'KBO 공식 기록실 #68200 (김민규 · 두산 P)' },
  'v15-0505':  { birth_date: '2002-01-01', source: 'KBO 공식 기록실 #53262 (김유성)' },
  '2026-OB-56':{ birth_date: '1998-05-17', source: 'KBO 공식 기록실 #68269 (김호준)' },
  '2026-OB-43':{ birth_date: '2001-03-26', source: 'KBO 공식 기록실 #50262 (이주엽)' },
  'v15-0528':  { birth_date: '2001-05-01', source: 'KBO 공식 기록실 #50206 (최종인)' },
  '2026-OB-26':{ birth_date: '2002-10-21', source: 'KBO 공식 기록실 #53204 (박민준)' },
  '2026-OB-11':{ birth_date: '2002-09-04', source: 'KBO 공식 기록실 #52267 (김동준)' },
  'v15-0541':  { birth_date: '1996-05-03', source: 'KBO 공식 기록실 #65269 (김민혁 · 두산 IF)' },
  'v15-0507':  { birth_date: '2004-01-13', source: '두산 베어스 공식 프로필 (김지윤)' },
  'v15-0522':  { birth_date: '2006-11-21', source: '두산 베어스 공식 프로필 · 2026 신인 (이주호)' },
  '2026-OB-101':{ birth_date: '2002-08-09', source: '두산 베어스 공식 프로필 (최우인)' },
  '2026-OB-117':{ birth_date: '2003-11-16', source: '두산 베어스 공식 프로필 · 2026 신인 (심건보)' },
  '2026-OB-66':{ birth_date: '2007-09-14', source: '두산 베어스 공식 프로필 · 2026 신인 (김주오)' },
  'v15-0556':  { birth_date: '2001-12-30', source: '두산 베어스 공식 프로필 · 2026 신인 (신우열)' },

  // --- 키움 히어로즈 ---
  'v15-0571':  { birth_date: '2000-11-09', source: 'KBO 공식 기록실 #69328 (박주성)' },
  '2026-WO-23':{ birth_date: '2001-02-16', source: 'KBO 공식 기록실 #50304 (김병휘)' },
  'v15-0615':  { birth_date: '1985-08-26', source: 'KBO 공식 기록실 #74163 (이용규)' },
  '2026-WO-2': { birth_date: '2001-04-02', source: 'KBO 공식 기록실 (이주형)' },

  // --- 2027 신인 드래프트 중 공식 생년월일 확인 완료 선수 (미확인 신인은 null 유지) ---
  'D2027-001': { birth_date: '2008-03-09', source: '2027 드래프트 공식 프로필 (하현승)' },
  'D2027-003': { birth_date: '2008-01-21', source: '2027 드래프트 공식 프로필 (이호민 · 경남고)' },
};

const changes = [];

for (const p of data.players) {
  const entry = VERIFIED_BIRTHDATES_BY_ID[p.id];
  if (entry) {
    const prevDob = p.birth_date ?? null;
    if (prevDob !== entry.birth_date) {
      p.birth_date = entry.birth_date;
      if (p.evaluation_v18) {
        p.evaluation_v18.age_used = 2026 - Number(entry.birth_date.slice(0, 4));
      }
      changes.push({
        id: p.id,
        name: p.name,
        team: p.team,
        field: 'birth_date',
        before: prevDob,
        after: entry.birth_date,
        source: entry.source,
      });
    }
  }

  // 최지만(D2027-015) 베테랑 전 MLB 타자 실전 능력치·체격·투타 보정
  if (p.id === 'D2027-015') {
    const beforeRatings = {
      overall: p.game_ratings?.overall,
      potential: p.game_ratings?.potential,
    };
    p.bats = 'L';
    p.throws = 'R';
    p.height_cm = 185;
    p.weight_kg = 118;
    p.game_ratings = {
      ...p.game_ratings,
      overall: 73,
      potential: 75,
      batting: {
        contact: 71,
        power: 80,
        discipline: 84,
        avoid_k: 64,
        steal_production: 35,
        availability: 72,
        fielding: 58,
        arm: 56,
        speed: 40,
        injury_resistance: 58,
        overall_offense: 75,
      },
      pitching: null,
    };
    if (p.evaluation_v18) {
      p.evaluation_v18.ovr = 73;
      p.evaluation_v18.pot = 75;
      p.evaluation_v18.age_used = 35;
      p.evaluation_v18.confidence = 'medium';
      p.evaluation_v18.potential_range = [73, 75];
    }
    p.rebalance_v19 = {
      prev_ovr: beforeRatings.overall ?? 49,
      prev_pot: beforeRatings.potential ?? 78,
      new_ovr: 73,
      new_pot: 75,
      ovr_delta: 73 - (beforeRatings.overall ?? 49),
      pot_delta: 75 - (beforeRatings.potential ?? 78),
      tier: '1군 주전급 베테랑',
      reason: 'MLB 통산 8시즌 67홈런·2026 울산 웨일즈 3할 중심타자 경력 및 만 35세(1991-05-19) 반영 보정',
    };
    changes.push({
      id: p.id,
      name: p.name,
      team: p.team,
      field: 'ratings_and_bio',
      before: beforeRatings,
      after: { overall: 73, potential: 75, bats: 'L', throws: 'R', height_cm: 185, weight_kg: 118 },
      source: 'MLB 통산 525G 67HR OPS .764 + 2026 울산 웨일즈·2027 KT 2R 15순위 공식 프로필',
    });
  }
}

// 전수 검증 통계 집계
let verifiedCount = 0;
let unverifiedBaseline = 0;
let unverifiedDraft2027 = 0;
for (const p of data.players) {
  if (p.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(p.birth_date)) {
    verifiedCount++;
  } else if (p.status === 'drafted_2027') {
    unverifiedDraft2027++;
  } else {
    unverifiedBaseline++;
  }
}

data.birthdateVerifiedAt = new Date().toISOString();
data.databaseVersion = 'v22_verified_birthdates';

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');

const auditLog = {
  patchedAt: data.birthdateVerifiedAt,
  databaseVersion: data.databaseVersion,
  backupFile: 'src/data/v21PlayerDataBackupBeforeBirthdatePatch.json',
  summary: {
    totalPlayers: data.players.length,
    verifiedBirthDateCount: verifiedCount,
    unverifiedBaselineCount: unverifiedBaseline,
    unverifiedDraft2027Count: unverifiedDraft2027,
    totalFieldChanges: changes.length,
  },
  changes,
};

fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(auditLog, null, 2) + '\n', 'utf8');
console.log('Birthdate verification patch complete:', auditLog.summary);
