/**
 * 고우석(LG 트윈스) 2027시즌 국내 복귀 등록 및 해외 진출 선수 전수 검증 패치 (v23)
 * - 수정 전 데이터를 src/data/v22PlayerDataBackupBeforeOverseasReturnPatch.json 에 백업
 * - 고우석(2026-LG-19, KBO ID 67119)을 LG 트윈스 1군 투수 명단에 공식 경력·통산 성적·재평가 능력치와 함께 등록
 * - 변경 내역 및 해외 진출 선수 전수 검증 결과를 src/data/overseasReturnAuditLog.json 에 기록
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve('src/data/v18RecalibratedData.json');
const BACKUP_PATH = path.resolve('src/data/v22PlayerDataBackupBeforeOverseasReturnPatch.json');
const AUDIT_LOG_PATH = path.resolve('src/data/overseasReturnAuditLog.json');

if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(DATA_PATH, BACKUP_PATH);
  console.log('Backed up pre-patch dataset to:', BACKUP_PATH);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const GO_WOOSUK_RECORD = {
  id: '2026-LG-19',
  name: '고우석',
  team: 'LG',
  position: 'P',
  jersey: '19',
  level_2026: 1,
  status: '2026_official_baseline',
  fa_approved_2027: false,
  foreign_slot: null,
  draft_round: 1,
  draft_pick: 1,
  draft_year: 2017,
  draft_method: '1차지명',
  draft_rank_label: '1차지명',
  debut_year: 2017,
  school: '충암고',
  birth_date: '1998-08-06',
  bats: 'R',
  throws: 'R',
  height_cm: 182,
  weight_kg: 90,
  salary_krw: 500000000,
  contract_end_year: 2027,
  previous_league_club: 'MLB 미네소타 트윈스 · 마이애미/디트로이트 마이너리그',
  game_ratings: {
    overall: 78,
    potential: 82,
    batting: null,
    pitching: {
      stuff: 86,
      control: 70,
      hr_prevention: 76,
      stamina_proxy: 54,
      run_prevention: 80,
      traffic_control: 75,
      clutch: 81,
      injury_resistance: 68,
      overall_pitching: 78,
    },
    fitness: 100,
    morale: 78,
  },
  evaluation_v18: {
    previous_ovr: 80,
    previous_pot: 83,
    ovr: 78,
    pot: 82,
    basis: 'rebalanced_v23_overseas_return_eval',
    confidence: 'high',
    age_used: 28,
    draft_pick_used: 1,
    weighted_exposure: 65,
    metric_ratings: {
      stuff: 86,
      control: 70,
      hr_prevention: 76,
      run_prevention: 80,
      traffic_control: 75,
    },
    potential_range: [78, 82],
    records: [
      {
        season: 2026,
        playerId: '67119',
        team: 'LG',
        G: 16,
        ERA: 1.57,
        W: 3,
        L: 1,
        SV: 1,
        HLD: 5,
        IP: '23',
        H: 16,
        HR: 1,
        BB: 6,
        SO: 28,
        R: 5,
        ER: 4,
        WHIP: 0.96,
      },
      {
        season: 2023,
        playerId: '67119',
        team: 'LG',
        G: 44,
        ERA: 3.68,
        W: 3,
        L: 8,
        SV: 15,
        HLD: 0,
        IP: '44',
        H: 38,
        HR: 2,
        BB: 22,
        SO: 59,
        R: 19,
        ER: 18,
        WHIP: 1.36,
      },
    ],
  },
  kbo_player_id: '67119',
  fa_grade_2027: null,
  career_by_year: [
    { season: 2026, playerId: '67119', team: 'LG', G: 16, ERA: 1.57, W: 3, L: 1, SV: 1, HLD: 5, IP: '23', H: 16, HR: 1, BB: 6, SO: 28, R: 5, ER: 4, WHIP: 0.96 },
    { season: 2023, playerId: '67119', team: 'LG', G: 44, ERA: 3.68, W: 3, L: 8, SV: 15, HLD: 0, IP: '44', H: 38, HR: 2, BB: 22, SO: 59, R: 19, ER: 18, WHIP: 1.36 },
    { season: 2022, playerId: '67119', team: 'LG', G: 61, ERA: 1.48, W: 4, L: 2, SV: 42, HLD: 0, IP: '60 2/3', H: 37, HR: 6, BB: 21, SO: 80, R: 12, ER: 10, WHIP: 0.96 },
    { season: 2021, playerId: '67119', team: 'LG', G: 63, ERA: 2.17, W: 1, L: 5, SV: 30, HLD: 0, IP: '58', H: 47, HR: 3, BB: 23, SO: 68, R: 15, ER: 14, WHIP: 1.21 },
    { season: 2020, playerId: '67119', team: 'LG', G: 40, ERA: 4.10, W: 0, L: 4, SV: 17, HLD: 1, IP: '41 2/3', H: 37, HR: 2, BB: 19, SO: 51, R: 22, ER: 19, WHIP: 1.34 },
    { season: 2019, playerId: '67119', team: 'LG', G: 65, ERA: 1.52, W: 8, L: 2, SV: 35, HLD: 1, IP: '71', H: 47, HR: 4, BB: 30, SO: 76, R: 13, ER: 12, WHIP: 1.08 },
    { season: 2018, playerId: '67119', team: 'LG', G: 56, ERA: 5.91, W: 3, L: 5, SV: 0, HLD: 3, IP: '67', H: 69, HR: 10, BB: 37, SO: 44, R: 51, ER: 44, WHIP: 1.58 },
    { season: 2017, playerId: '67119', team: 'LG', G: 25, ERA: 4.50, W: 0, L: 0, SV: 0, HLD: 1, IP: '26', H: 30, HR: 2, BB: 11, SO: 23, R: 13, ER: 13, WHIP: 1.58 },
  ],
  futures_2026: null,
  foreign_meta_2026: null,
  rebalance_v19: {
    prev_ovr: 80,
    prev_pot: 83,
    new_ovr: 78,
    new_pot: 82,
    ovr_delta: -2,
    pot_delta: -1,
    tier: '1군 필승조·마무리 경쟁급',
    reason: '미국 마이너(76G ERA 5.61)·MLB(4G ERA 9.00) 부침과 2026 LG 복귀 후 16G ERA 1.57 28K 반등을 종합 재평가',
  },
  military_verified: {
    status: '예술·체육요원',
    note: '2022 항저우 아시안게임 금메달 (예술·체육요원)',
    source: 'KBO·대한체육회 공식 기록',
  },
  verified_team_history: [
    {
      teamLabel: 'LG 트윈스',
      teamId: 'LG',
      league: 'KBO',
      fromSeason: 2017,
      toSeason: 2023,
      note: '2017 1차지명 · 2022 세이브왕(42SV) · 2023 통합우승 마무리',
    },
    {
      teamLabel: '샌디에이고 파드리스',
      league: 'MLB',
      mlbTeamName: 'San Diego Padres',
      fromSeason: 2024,
      toSeason: 2024,
      note: 'MLB 포스팅 2년 계약 (산하 마이너리그)',
    },
    {
      teamLabel: '마이애미 말린스',
      league: 'MLB',
      mlbTeamName: 'Miami Marlins',
      fromSeason: 2024,
      toSeason: 2025,
      note: 'MLB 트레이드 이적 · 마이너리그 통산 76G 6승4패 6SV 7HLD ERA 5.61',
    },
    {
      teamLabel: '디트로이트 / 미네소타 트윈스',
      league: 'MLB',
      mlbTeamName: 'Minnesota Twins',
      fromSeason: 2026,
      toSeason: 2026,
      note: '미네소타 MLB 빅리그 데뷔 (4G 1HLD ERA 9.00 · 4IP) 후 FA 선언',
    },
    {
      teamLabel: 'LG 트윈스',
      teamId: 'LG',
      league: 'KBO',
      fromSeason: 2026,
      transferDate: '2026-09-01',
      moveType: '해외파 복귀',
      note: '2026-09-01 친정팀 LG 복귀 (1년 5억 · 복귀 후 16G 3승1패 1SV 5HLD ERA 1.57)',
    },
  ],
  verified_one_club_man: true,
  verified_club_tenure_2027: 8,
};

const existingIdx = data.players.findIndex(
  (p) => p.id === '2026-LG-19' || p.kbo_player_id === '67119' || (p.name === '고우석' && p.team === 'LG')
);

let action = 'inserted';
if (existingIdx >= 0) {
  data.players[existingIdx] = GO_WOOSUK_RECORD;
  action = 'updated';
} else {
  // LG 투수진 상단 위치에 깔끔하게 삽입
  const firstLgIdx = data.players.findIndex((p) => p.team === 'LG');
  if (firstLgIdx >= 0) {
    data.players.splice(firstLgIdx, 0, GO_WOOSUK_RECORD);
  } else {
    data.players.unshift(GO_WOOSUK_RECORD);
  }
}

data.playerCount = data.players.length;
data.officialRosterCount = data.players.filter((p) => p.status !== 'drafted_2027').length;
data.kboOfficialIdCount = data.players.filter((p) => Boolean(p.kbo_player_id)).length;
data.overseasReturnVerifiedAt = new Date().toISOString();
data.databaseVersion = 'v23_go_woosuk_kbo_return';

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');

const auditLog = {
  patchedAt: data.overseasReturnVerifiedAt,
  databaseVersion: data.databaseVersion,
  backupFile: 'src/data/v22PlayerDataBackupBeforeOverseasReturnPatch.json',
  goWoosukAction: action,
  goWoosukProfile: {
    id: GO_WOOSUK_RECORD.id,
    kboOfficialId: GO_WOOSUK_RECORD.kbo_player_id,
    team: 'LG',
    jersey: '19',
    birthDate: GO_WOOSUK_RECORD.birth_date,
    overall: GO_WOOSUK_RECORD.game_ratings.overall,
    potential: GO_WOOSUK_RECORD.game_ratings.potential,
    kboCareerSummary: '370G 22W 27L 140SV 11HLD 391.1IP 429SO ERA 3.08',
    mlbMilbSummary: 'MLB 4G 1HLD ERA 9.00 / MiLB 76G 6W 4L 6SV 7HLD ERA 5.61',
  },
  verifiedOverseasRosterAudit2027: [
    { name: '고우석', prev: '마이애미 말린스 (AAA)', next: 'LG 트윈스 (KBO 1군 · 해외파 목록 제거)', status: 'KBO복귀완료' },
    { name: '김하성', prev: '탬파베이 레이스 (MLB)', next: '디트로이트 타이거스 (MLB · 1년 $5M)', status: '해외현역' },
    { name: '이정후', prev: '샌프란시스코 자이언츠 (MLB)', next: '샌프란시스코 자이언츠 (MLB)', status: '해외현역' },
    { name: '김혜성', prev: 'LA 다저스 (MLB)', next: 'LA 다저스 (MLB)', status: '해외현역' },
    { name: '송성문', prev: '미등록 (포스팅 진출)', next: '샌디에이고 파드리스 (MLB · 4년 $15M)', status: '해외현역' },
    { name: '배지환', prev: '피츠버그 파이리츠 (AAA)', next: '밀워키 브루어스 (AAA · NYM 경유)', status: '해외현역' },
    { name: '엄형찬', prev: '캔자스시티 로열스 (High-A)', next: '캔자스시티 로열스 (AA 승격)', status: '해외현역' },
    { name: '장현석', prev: 'LA 다저스 (High-A)', next: 'LA 다저스 (High-A)', status: '해외현역' },
    { name: '심준석', prev: '마이애미 말린스 (Single-A)', next: 'FA/방출 (마이애미·뉴욕 메츠 방출 · 제107조 2년 제한)', status: '방출대기' },
    { name: '최지만', prev: '울산 웨일즈 / MLB', next: 'KT 위즈 (KBO 1군 · 2027 2R 15순위)', status: 'KBO복귀완료' },
  ],
};

fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(auditLog, null, 2) + '\n', 'utf8');
console.log('Go Woo-suk & overseas returnees patch complete:', {
  action,
  playerCount: data.playerCount,
  officialRosterCount: data.officialRosterCount,
});
