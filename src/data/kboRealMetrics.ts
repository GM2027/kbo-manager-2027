import { PitchTypeName, Player } from '../types/kbo';

/**
 * 실제 KBO 최근 3시즌(2024~2026) 리그 평균 기준 지표 (시뮬레이션 환경 보정용)
 * - 비정상적인 타율·홈런·평균자책점·탈삼진 드리프트 방지
 * - 뛰어난 선수의 기록 경신 가능성은 별도 상한 개방으로 유지
 */
export const KBO_3YR_LEAGUE_BASELINE = {
  seasons: [2024, 2025, 2026] as const,
  leagueAvg: 0.272,
  leagueObp: 0.346,
  leagueSlg: 0.415,
  leagueOps: 0.761,
  runsPerTeamGame: 4.95,
  hrPerTeamGame: 0.95,
  leagueEra: 4.65,
  leagueWhip: 1.44,
  kPer9: 7.45,
  bbPer9: 3.55,
  babip: 0.312,
};

function safeNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * v18 재보정 세부 능력치(game_ratings)를 경기 시뮬레이션 엔진 보정치로 변환 (결측 필드 NaN 원천 차단)
 */
export function getV18EngineSkillBonus(p: Player): number {
  const baseAbility = safeNum(p.ability, 60);
  if (!p.v18Ratings) return 0;
  if (p.role === '타자' && p.v18Ratings.batting) {
    const b = p.v18Ratings.batting;
    const composite =
      safeNum(b.contact, baseAbility) * 0.32 +
      safeNum(b.power, baseAbility) * 0.28 +
      safeNum(b.discipline, baseAbility) * 0.18 +
      safeNum(b.avoid_k, baseAbility) * 0.12 +
      safeNum(b.speed, baseAbility) * 0.1;
    const delta = (composite - baseAbility) * 0.18;
    return Number.isFinite(delta) ? Math.max(-3.5, Math.min(3.5, delta)) : 0;
  }
  if (p.role === '투수' && p.v18Ratings.pitching) {
    const pt = p.v18Ratings.pitching;
    const composite =
      safeNum(pt.stuff, baseAbility) * 0.3 +
      safeNum(pt.control, baseAbility) * 0.28 +
      safeNum(pt.hr_prevention, baseAbility) * 0.18 +
      safeNum(pt.run_prevention, baseAbility) * 0.14 +
      safeNum(pt.traffic_control, baseAbility) * 0.1;
    const delta = (composite - baseAbility) * 0.18;
    return Number.isFinite(delta) ? Math.max(-3.5, Math.min(3.5, delta)) : 0;
  }
  return 0;
}

export interface RealPitcherTrackManProfile {
  throws: '우투' | '좌투' | '우언' | '우사';
  avgVelocityKmh: number;
  maxVelocityKmh: number;
  command: number;
  breakingSharpness: number;
  pitches: { name: PitchTypeName; grade: number; usagePct: number }[];
}

export interface RealBatterStatcastProfile {
  bats: '우타' | '좌타' | '양타';
  sprayTendency: '당겨치기' | '스프레이' | '밀어치기';
  avgExitVelocityKmh: number;
  maxExitVelocityKmh: number;
  launchAngleDeg: number;
  barrelPct: number;
  hardHitPct: number;
  sprintSpeedMs: number;
}

/**
 * 실제 KBO 트랙맨(TrackMan) / PTS 투구 자료 기반 주요 투수 구속·구종 프로필.
 * (구속 단위: km/h, 평균 포심/주구종 구속 및 최고 구속 + 실제 주무기 구종 배합)
 */
export const REAL_KBO_PITCHER_PROFILES: Record<string, RealPitcherTrackManProfile> = {
  // 한화 이글스
  문동주: {
    throws: '우투',
    avgVelocityKmh: 154.2,
    maxVelocityKmh: 160.1,
    command: 74,
    breakingSharpness: 84,
    pitches: [
      { name: '포심', grade: 94, usagePct: 50 },
      { name: '커브', grade: 84, usagePct: 22 },
      { name: '슬라이더', grade: 82, usagePct: 18 },
      { name: '체인지업', grade: 76, usagePct: 10 },
    ],
  },
  김서현: {
    throws: '우투',
    avgVelocityKmh: 153.8,
    maxVelocityKmh: 159.8,
    command: 70,
    breakingSharpness: 83,
    pitches: [
      { name: '포심', grade: 93, usagePct: 54 },
      { name: '슬라이더', grade: 85, usagePct: 34 },
      { name: '체인지업', grade: 75, usagePct: 12 },
    ],
  },
  류현진: {
    throws: '좌투',
    avgVelocityKmh: 142.8,
    maxVelocityKmh: 149.2,
    command: 95,
    breakingSharpness: 89,
    pitches: [
      { name: '포심', grade: 82, usagePct: 38 },
      { name: '체인지업', grade: 95, usagePct: 26 },
      { name: '커터', grade: 86, usagePct: 20 },
      { name: '커브', grade: 85, usagePct: 16 },
    ],
  },
  엄상백: {
    throws: '우사',
    avgVelocityKmh: 145.6,
    maxVelocityKmh: 151.0,
    command: 80,
    breakingSharpness: 85,
    pitches: [
      { name: '포심', grade: 83, usagePct: 44 },
      { name: '체인지업', grade: 89, usagePct: 34 },
      { name: '커터', grade: 78, usagePct: 14 },
      { name: '슬라이더', grade: 76, usagePct: 8 },
    ],
  },
  와이스: {
    throws: '우투',
    avgVelocityKmh: 151.4,
    maxVelocityKmh: 157.2,
    command: 79,
    breakingSharpness: 86,
    pitches: [
      { name: '포심', grade: 89, usagePct: 46 },
      { name: '스위퍼', grade: 89, usagePct: 30 },
      { name: '커브', grade: 81, usagePct: 14 },
      { name: '체인지업', grade: 77, usagePct: 10 },
    ],
  },
  폰세: {
    throws: '우투',
    avgVelocityKmh: 152.6,
    maxVelocityKmh: 158.0,
    command: 83,
    breakingSharpness: 88,
    pitches: [
      { name: '포심', grade: 91, usagePct: 44 },
      { name: '커브', grade: 86, usagePct: 22 },
      { name: '체인지업', grade: 85, usagePct: 20 },
      { name: '슬라이더', grade: 84, usagePct: 14 },
    ],
  },
  '코디 폰세': {
    throws: '우투',
    avgVelocityKmh: 152.6,
    maxVelocityKmh: 158.0,
    command: 83,
    breakingSharpness: 88,
    pitches: [
      { name: '포심', grade: 91, usagePct: 44 },
      { name: '커브', grade: 86, usagePct: 22 },
      { name: '체인지업', grade: 85, usagePct: 20 },
      { name: '슬라이더', grade: 84, usagePct: 14 },
    ],
  },
  // KIA 타이거즈
  네일: {
    throws: '우투',
    avgVelocityKmh: 148.9,
    maxVelocityKmh: 154.0,
    command: 88,
    breakingSharpness: 94,
    pitches: [
      { name: '투심', grade: 90, usagePct: 42 },
      { name: '스위퍼', grade: 96, usagePct: 36 },
      { name: '커터', grade: 84, usagePct: 12 },
      { name: '체인지업', grade: 81, usagePct: 10 },
    ],
  },
  양현종: {
    throws: '좌투',
    avgVelocityKmh: 142.4,
    maxVelocityKmh: 148.5,
    command: 88,
    breakingSharpness: 84,
    pitches: [
      { name: '포심', grade: 82, usagePct: 45 },
      { name: '체인지업', grade: 88, usagePct: 26 },
      { name: '슬라이더', grade: 82, usagePct: 21 },
      { name: '커브', grade: 76, usagePct: 8 },
    ],
  },
  정해영: {
    throws: '우투',
    avgVelocityKmh: 147.8,
    maxVelocityKmh: 152.6,
    command: 83,
    breakingSharpness: 84,
    pitches: [
      { name: '포심', grade: 88, usagePct: 58 },
      { name: '슬라이더', grade: 84, usagePct: 28 },
      { name: '포크볼', grade: 80, usagePct: 14 },
    ],
  },
  이의리: {
    throws: '좌투',
    avgVelocityKmh: 147.5,
    maxVelocityKmh: 153.8,
    command: 69,
    breakingSharpness: 84,
    pitches: [
      { name: '포심', grade: 89, usagePct: 50 },
      { name: '체인지업', grade: 83, usagePct: 22 },
      { name: '슬라이더', grade: 82, usagePct: 18 },
      { name: '커브', grade: 78, usagePct: 10 },
    ],
  },
  // 삼성 라이온즈
  원태인: {
    throws: '우투',
    avgVelocityKmh: 146.2,
    maxVelocityKmh: 151.4,
    command: 89,
    breakingSharpness: 88,
    pitches: [
      { name: '포심', grade: 85, usagePct: 42 },
      { name: '체인지업', grade: 92, usagePct: 28 },
      { name: '슬라이더', grade: 86, usagePct: 22 },
      { name: '커브', grade: 78, usagePct: 8 },
    ],
  },
  후라도: {
    throws: '우투',
    avgVelocityKmh: 147.0,
    maxVelocityKmh: 152.5,
    command: 90,
    breakingSharpness: 87,
    pitches: [
      { name: '투심', grade: 88, usagePct: 36 },
      { name: '포심', grade: 84, usagePct: 24 },
      { name: '체인지업', grade: 88, usagePct: 22 },
      { name: '커브', grade: 83, usagePct: 18 },
    ],
  },
  레예스: {
    throws: '우투',
    avgVelocityKmh: 146.5,
    maxVelocityKmh: 152.0,
    command: 86,
    breakingSharpness: 85,
    pitches: [
      { name: '포심', grade: 84, usagePct: 40 },
      { name: '커터', grade: 86, usagePct: 24 },
      { name: '체인지업', grade: 85, usagePct: 20 },
      { name: '스위퍼', grade: 83, usagePct: 16 },
    ],
  },
  // LG 트윈스
  임찬규: {
    throws: '우투',
    avgVelocityKmh: 142.5,
    maxVelocityKmh: 148.0,
    command: 88,
    breakingSharpness: 87,
    pitches: [
      { name: '포심', grade: 80, usagePct: 38 },
      { name: '체인지업', grade: 89, usagePct: 28 },
      { name: '커브', grade: 87, usagePct: 22 },
      { name: '슬라이더', grade: 80, usagePct: 12 },
    ],
  },
  손주영: {
    throws: '좌투',
    avgVelocityKmh: 146.8,
    maxVelocityKmh: 152.4,
    command: 84,
    breakingSharpness: 86,
    pitches: [
      { name: '포심', grade: 87, usagePct: 48 },
      { name: '커브', grade: 86, usagePct: 22 },
      { name: '포크볼', grade: 83, usagePct: 18 },
      { name: '슬라이더', grade: 81, usagePct: 12 },
    ],
  },
  유영찬: {
    throws: '우투',
    avgVelocityKmh: 148.5,
    maxVelocityKmh: 153.6,
    command: 80,
    breakingSharpness: 86,
    pitches: [
      { name: '포심', grade: 88, usagePct: 54 },
      { name: '슬라이더', grade: 86, usagePct: 28 },
      { name: '포크볼', grade: 84, usagePct: 18 },
    ],
  },
  에르난데스: {
    throws: '우투',
    avgVelocityKmh: 150.2,
    maxVelocityKmh: 155.8,
    command: 81,
    breakingSharpness: 87,
    pitches: [
      { name: '포심', grade: 89, usagePct: 44 },
      { name: '스위퍼', grade: 88, usagePct: 26 },
      { name: '커터', grade: 84, usagePct: 18 },
      { name: '체인지업', grade: 80, usagePct: 12 },
    ],
  },
  // 두산 베어스
  곽빈: {
    throws: '우투',
    avgVelocityKmh: 150.4,
    maxVelocityKmh: 156.2,
    command: 77,
    breakingSharpness: 87,
    pitches: [
      { name: '포심', grade: 91, usagePct: 48 },
      { name: '커브', grade: 87, usagePct: 22 },
      { name: '슬라이더', grade: 84, usagePct: 18 },
      { name: '체인지업', grade: 81, usagePct: 12 },
    ],
  },
  김택연: {
    throws: '우투',
    avgVelocityKmh: 150.8,
    maxVelocityKmh: 155.6,
    command: 84,
    breakingSharpness: 86,
    pitches: [
      { name: '포심', grade: 93, usagePct: 68 },
      { name: '슬라이더', grade: 85, usagePct: 22 },
      { name: '스플리터', grade: 80, usagePct: 10 },
    ],
  },
  // KT 위즈
  고영표: {
    throws: '우언',
    avgVelocityKmh: 136.2,
    maxVelocityKmh: 141.5,
    command: 94,
    breakingSharpness: 92,
    pitches: [
      { name: '투심', grade: 86, usagePct: 40 },
      { name: '체인지업', grade: 96, usagePct: 38 },
      { name: '커브', grade: 82, usagePct: 14 },
      { name: '슬라이더', grade: 78, usagePct: 8 },
    ],
  },
  박영현: {
    throws: '우투',
    avgVelocityKmh: 149.2,
    maxVelocityKmh: 154.5,
    command: 85,
    breakingSharpness: 86,
    pitches: [
      { name: '포심', grade: 92, usagePct: 62 },
      { name: '체인지업', grade: 87, usagePct: 24 },
      { name: '슬라이더', grade: 82, usagePct: 14 },
    ],
  },
  소형준: {
    throws: '우투',
    avgVelocityKmh: 144.8,
    maxVelocityKmh: 150.2,
    command: 86,
    breakingSharpness: 85,
    pitches: [
      { name: '투심', grade: 88, usagePct: 44 },
      { name: '커터', grade: 85, usagePct: 24 },
      { name: '체인지업', grade: 84, usagePct: 20 },
      { name: '커브', grade: 80, usagePct: 12 },
    ],
  },
  헤이수스: {
    throws: '좌투',
    avgVelocityKmh: 149.0,
    maxVelocityKmh: 154.6,
    command: 82,
    breakingSharpness: 87,
    pitches: [
      { name: '포심', grade: 89, usagePct: 45 },
      { name: '슬라이더', grade: 87, usagePct: 26 },
      { name: '체인지업', grade: 84, usagePct: 19 },
      { name: '투심', grade: 81, usagePct: 10 },
    ],
  },
  // SSG 랜더스
  김광현: {
    throws: '좌투',
    avgVelocityKmh: 145.2,
    maxVelocityKmh: 151.0,
    command: 85,
    breakingSharpness: 88,
    pitches: [
      { name: '포심', grade: 84, usagePct: 42 },
      { name: '슬라이더', grade: 92, usagePct: 32 },
      { name: '체인지업', grade: 82, usagePct: 16 },
      { name: '커브', grade: 80, usagePct: 10 },
    ],
  },
  앤더슨: {
    throws: '우투',
    avgVelocityKmh: 152.2,
    maxVelocityKmh: 157.8,
    command: 78,
    breakingSharpness: 88,
    pitches: [
      { name: '포심', grade: 92, usagePct: 52 },
      { name: '커브', grade: 87, usagePct: 22 },
      { name: '슬라이더', grade: 85, usagePct: 16 },
      { name: '체인지업', grade: 80, usagePct: 10 },
    ],
  },
  조병현: {
    throws: '우투',
    avgVelocityKmh: 149.4,
    maxVelocityKmh: 154.2,
    command: 83,
    breakingSharpness: 86,
    pitches: [
      { name: '포심', grade: 91, usagePct: 60 },
      { name: '포크볼', grade: 87, usagePct: 26 },
      { name: '커브', grade: 81, usagePct: 14 },
    ],
  },
  // 롯데 자이언츠
  박세웅: {
    throws: '우투',
    avgVelocityKmh: 146.5,
    maxVelocityKmh: 152.4,
    command: 82,
    breakingSharpness: 86,
    pitches: [
      { name: '포심', grade: 85, usagePct: 42 },
      { name: '슬라이더', grade: 86, usagePct: 24 },
      { name: '포크볼', grade: 87, usagePct: 20 },
      { name: '커브', grade: 83, usagePct: 14 },
    ],
  },
  김원중: {
    throws: '우투',
    avgVelocityKmh: 147.2,
    maxVelocityKmh: 152.8,
    command: 79,
    breakingSharpness: 87,
    pitches: [
      { name: '포심', grade: 86, usagePct: 50 },
      { name: '포크볼', grade: 91, usagePct: 36 },
      { name: '커브', grade: 78, usagePct: 14 },
    ],
  },
  반즈: {
    throws: '좌투',
    avgVelocityKmh: 145.6,
    maxVelocityKmh: 151.0,
    command: 84,
    breakingSharpness: 88,
    pitches: [
      { name: '포심', grade: 85, usagePct: 40 },
      { name: '슬라이더', grade: 90, usagePct: 34 },
      { name: '체인지업', grade: 84, usagePct: 16 },
      { name: '투심', grade: 81, usagePct: 10 },
    ],
  },
  // NC 다이노스
  하트: {
    throws: '좌투',
    avgVelocityKmh: 148.2,
    maxVelocityKmh: 153.6,
    command: 87,
    breakingSharpness: 91,
    pitches: [
      { name: '포심', grade: 88, usagePct: 40 },
      { name: '스위퍼', grade: 93, usagePct: 30 },
      { name: '체인지업', grade: 86, usagePct: 18 },
      { name: '커터', grade: 83, usagePct: 12 },
    ],
  },
  구창모: {
    throws: '좌투',
    avgVelocityKmh: 145.8,
    maxVelocityKmh: 151.5,
    command: 86,
    breakingSharpness: 88,
    pitches: [
      { name: '포심', grade: 87, usagePct: 46 },
      { name: '슬라이더', grade: 88, usagePct: 24 },
      { name: '포크볼', grade: 86, usagePct: 20 },
      { name: '커브', grade: 80, usagePct: 10 },
    ],
  },
  // 키움 히어로즈
  안우진: {
    throws: '우투',
    avgVelocityKmh: 154.0,
    maxVelocityKmh: 160.0,
    command: 86,
    breakingSharpness: 93,
    pitches: [
      { name: '포심', grade: 96, usagePct: 48 },
      { name: '슬라이더', grade: 95, usagePct: 32 },
      { name: '커브', grade: 86, usagePct: 12 },
      { name: '체인지업', grade: 82, usagePct: 8 },
    ],
  },
  하영민: {
    throws: '우투',
    avgVelocityKmh: 145.2,
    maxVelocityKmh: 150.5,
    command: 82,
    breakingSharpness: 82,
    pitches: [
      { name: '포심', grade: 83, usagePct: 44 },
      { name: '슬라이더', grade: 83, usagePct: 26 },
      { name: '포크볼', grade: 82, usagePct: 20 },
      { name: '커브', grade: 76, usagePct: 10 },
    ],
  },
  주승우: {
    throws: '우투',
    avgVelocityKmh: 148.8,
    maxVelocityKmh: 154.0,
    command: 80,
    breakingSharpness: 84,
    pitches: [
      { name: '포심', grade: 88, usagePct: 54 },
      { name: '포크볼', grade: 86, usagePct: 30 },
      { name: '슬라이더', grade: 80, usagePct: 16 },
    ],
  },
};

/**
 * 실제 KBO 트랙맨 타구 데이터 기반 주요 타자 타구속도·발사각·배럴율·주력 프로필.
 */
export const REAL_KBO_BATTER_PROFILES: Record<string, RealBatterStatcastProfile> = {
  김도영: {
    bats: '우타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 149.8,
    maxExitVelocityKmh: 179.4,
    launchAngleDeg: 14.8,
    barrelPct: 15.6,
    hardHitPct: 49.2,
    sprintSpeedMs: 9.1,
  },
  노시환: {
    bats: '우타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 150.2,
    maxExitVelocityKmh: 180.1,
    launchAngleDeg: 17.2,
    barrelPct: 14.8,
    hardHitPct: 48.6,
    sprintSpeedMs: 7.9,
  },
  강백호: {
    bats: '좌타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 151.0,
    maxExitVelocityKmh: 181.2,
    launchAngleDeg: 14.2,
    barrelPct: 15.2,
    hardHitPct: 51.4,
    sprintSpeedMs: 7.8,
  },
  구자욱: {
    bats: '좌타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 148.5,
    maxExitVelocityKmh: 176.8,
    launchAngleDeg: 14.6,
    barrelPct: 13.8,
    hardHitPct: 47.5,
    sprintSpeedMs: 8.3,
  },
  최정: {
    bats: '우타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 149.2,
    maxExitVelocityKmh: 178.5,
    launchAngleDeg: 19.1,
    barrelPct: 16.4,
    hardHitPct: 47.8,
    sprintSpeedMs: 7.8,
  },
  나성범: {
    bats: '좌타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 150.4,
    maxExitVelocityKmh: 179.6,
    launchAngleDeg: 15.4,
    barrelPct: 15.0,
    hardHitPct: 49.8,
    sprintSpeedMs: 8.0,
  },
  오스틴: {
    bats: '우타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 150.8,
    maxExitVelocityKmh: 180.5,
    launchAngleDeg: 16.2,
    barrelPct: 15.4,
    hardHitPct: 50.2,
    sprintSpeedMs: 8.1,
  },
  디아즈: {
    bats: '좌타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 151.6,
    maxExitVelocityKmh: 182.0,
    launchAngleDeg: 17.5,
    barrelPct: 16.8,
    hardHitPct: 52.1,
    sprintSpeedMs: 7.7,
  },
  데이비슨: {
    bats: '우타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 152.2,
    maxExitVelocityKmh: 183.1,
    launchAngleDeg: 19.4,
    barrelPct: 17.9,
    hardHitPct: 53.0,
    sprintSpeedMs: 7.5,
  },
  레이예스: {
    bats: '양타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 147.8,
    maxExitVelocityKmh: 175.4,
    launchAngleDeg: 11.4,
    barrelPct: 10.6,
    hardHitPct: 46.8,
    sprintSpeedMs: 8.3,
  },
  로하스: {
    bats: '양타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 149.6,
    maxExitVelocityKmh: 179.0,
    launchAngleDeg: 15.8,
    barrelPct: 14.5,
    hardHitPct: 49.0,
    sprintSpeedMs: 8.2,
  },
  에레디아: {
    bats: '우타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 147.4,
    maxExitVelocityKmh: 174.8,
    launchAngleDeg: 11.8,
    barrelPct: 10.4,
    hardHitPct: 46.2,
    sprintSpeedMs: 8.3,
  },
  문보경: {
    bats: '좌타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 147.5,
    maxExitVelocityKmh: 175.0,
    launchAngleDeg: 14.5,
    barrelPct: 11.8,
    hardHitPct: 45.4,
    sprintSpeedMs: 8.0,
  },
  송성문: {
    bats: '좌타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 147.2,
    maxExitVelocityKmh: 174.6,
    launchAngleDeg: 13.8,
    barrelPct: 11.4,
    hardHitPct: 45.1,
    sprintSpeedMs: 8.4,
  },
  양의지: {
    bats: '우타',
    sprayTendency: '밀어치기',
    avgExitVelocityKmh: 146.8,
    maxExitVelocityKmh: 174.2,
    launchAngleDeg: 14.1,
    barrelPct: 11.2,
    hardHitPct: 44.5,
    sprintSpeedMs: 7.4,
  },
  홍창기: {
    bats: '좌타',
    sprayTendency: '밀어치기',
    avgExitVelocityKmh: 143.5,
    maxExitVelocityKmh: 170.2,
    launchAngleDeg: 9.8,
    barrelPct: 6.4,
    hardHitPct: 39.2,
    sprintSpeedMs: 8.5,
  },
  김지찬: {
    bats: '좌타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 138.6,
    maxExitVelocityKmh: 164.5,
    launchAngleDeg: 8.5,
    barrelPct: 3.4,
    hardHitPct: 31.0,
    sprintSpeedMs: 9.2,
  },
  박해민: {
    bats: '좌타',
    sprayTendency: '밀어치기',
    avgExitVelocityKmh: 140.2,
    maxExitVelocityKmh: 167.0,
    launchAngleDeg: 9.2,
    barrelPct: 4.5,
    hardHitPct: 34.1,
    sprintSpeedMs: 9.0,
  },
  채은성: {
    bats: '우타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 147.0,
    maxExitVelocityKmh: 175.6,
    launchAngleDeg: 15.2,
    barrelPct: 11.6,
    hardHitPct: 44.8,
    sprintSpeedMs: 7.6,
  },
  최형우: {
    bats: '좌타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 148.1,
    maxExitVelocityKmh: 176.2,
    launchAngleDeg: 14.9,
    barrelPct: 12.6,
    hardHitPct: 46.5,
    sprintSpeedMs: 7.4,
  },
  박건우: {
    bats: '우타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 146.9,
    maxExitVelocityKmh: 174.4,
    launchAngleDeg: 12.6,
    barrelPct: 10.2,
    hardHitPct: 44.6,
    sprintSpeedMs: 8.4,
  },
  박민우: {
    bats: '좌타',
    sprayTendency: '밀어치기',
    avgExitVelocityKmh: 142.8,
    maxExitVelocityKmh: 169.5,
    launchAngleDeg: 9.6,
    barrelPct: 5.8,
    hardHitPct: 38.0,
    sprintSpeedMs: 8.8,
  },
  윤동희: {
    bats: '우타',
    sprayTendency: '스프레이',
    avgExitVelocityKmh: 146.4,
    maxExitVelocityKmh: 174.2,
    launchAngleDeg: 13.4,
    barrelPct: 10.4,
    hardHitPct: 44.0,
    sprintSpeedMs: 8.5,
  },
  정수빈: {
    bats: '좌타',
    sprayTendency: '밀어치기',
    avgExitVelocityKmh: 139.8,
    maxExitVelocityKmh: 166.2,
    launchAngleDeg: 9.0,
    barrelPct: 4.2,
    hardHitPct: 33.4,
    sprintSpeedMs: 9.1,
  },
  안현민: {
    bats: '우타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 150.6,
    maxExitVelocityKmh: 180.8,
    launchAngleDeg: 16.5,
    barrelPct: 15.8,
    hardHitPct: 50.4,
    sprintSpeedMs: 8.3,
  },
  김영웅: {
    bats: '좌타',
    sprayTendency: '당겨치기',
    avgExitVelocityKmh: 148.9,
    maxExitVelocityKmh: 178.4,
    launchAngleDeg: 17.8,
    barrelPct: 14.4,
    hardHitPct: 47.6,
    sprintSpeedMs: 8.2,
  },
};
