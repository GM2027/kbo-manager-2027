import {
  CareerSave,
  Coach,
  GameRecord,
  PitcherStats,
  BatterStats,
  Player,
  Position,
  ScheduledSeries,
  TeamId,
  TeamState,
} from '../types/kbo';
import { ensureAmateurAndOverseasStateInPlace } from '../engine/amateurOverseasEngine';
import { ensureGlobalPlayerRegistryInPlace } from '../engine/playerRegistry';
import { emptyBatterStats, emptyPitcherStats } from '../engine/stats';
import { generateRegularSeasonSchedule } from '../engine/schedule';
import { buildInitialCoachesForMode } from './coachesData';
import {
  CONFIRMED_HANWHA_ROOKIES,
  createCompletedHanwhaDraftState,
} from './draftPool';
import { DEFAULT_INVESTMENTS } from './financesData';
import {
  generateVirtualForeignMarket,
  HISTORICAL_BASELINE_CHAMPIONS,
  KBO_TEAMS,
  MASTER_40_FOREIGN_EVALS,
  TEAM_IDS,
} from './kboTeams';
import {
  MASTER_45_GAMES,
  MASTER_9TEAM_AGGREGATE,
  MASTER_9TEAM_ROSTERS,
  MASTER_CURRENT_STATE,
  MASTER_KT_SERIES,
} from './masterRawData';
import {
  applyRealPlayerMetadataAndNumbers,
  REAL_KBO_HITTER_POSITIONS,
} from './playerMetadata';

interface HanwhaPlayerDef {
  name: string;
  role: '투수' | '타자';
  position: Position;
  pitchRole?: Player['pitchRole'];
  category: Player['category'];
  age: number;
  ability: number;
  potential: number;
  abilityStatus: Player['abilityStatus'];
  rosterTier: Player['rosterTier'];
  gameDayActive: boolean;
  serviceYears: number;
  contract: Player['contract'];
}

export const HANWHA_2026_CORE_ROSTER: HanwhaPlayerDef[] = [
  // 선발 5
  {
    name: '류현진', role: '투수', position: 'SP', pitchRole: '선발', category: '국내', age: 39,
    ability: 86, potential: 86, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 12,
    contract: { status: '확정', currency: 'KRW', years: 8, yearsRemaining: 6, annualSalary: 20, signingBonus: 0, totalValue: 170, note: '기존 다년계약 유지 (미지급 장부 미합산)' },
  },
  {
    name: '문동주', role: '투수', position: 'SP', pitchRole: '선발', category: '국내', age: 23,
    ability: 84, potential: 94, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 4,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 보류선수 (게임 계약 미확인)' },
  },
  {
    name: '윌켈 에르난데스', role: '투수', position: 'SP', pitchRole: '선발', category: '외국인', age: 27,
    ability: 81, potential: 84, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 0,
    contract: { status: '확정', currency: 'USD', years: 1, yearsRemaining: 1, annualSalary: 600000, signingBonus: 200000, totalValue: 800000, startSeason: 2026, endSeason: 2026, note: '2026 외국인 투수 계약 확정 ($800,000)' },
  },
  {
    name: '오웬 화이트', role: '투수', position: 'SP', pitchRole: '선발', category: '외국인', age: 27,
    ability: 79, potential: 83, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 0,
    contract: { status: '확정', currency: 'USD', years: 1, yearsRemaining: 1, annualSalary: 700000, signingBonus: 200000, totalValue: 900000, note: 'v4.60.8 게임 내 계약 확정 ($900,000)' },
  },
  {
    name: '왕옌청', role: '투수', position: 'SP', pitchRole: '선발', category: '아시아쿼터', age: 25,
    ability: 78, potential: 85, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 0,
    contract: { status: '확정', currency: 'USD', years: 1, yearsRemaining: 1, annualSalary: 100000, signingBonus: 0, totalValue: 100000, note: 'v4.60.8 아시아쿼터 계약 확정 ($100,000)' },
  },
  // 불펜 9 (1군 등록 8 + 당일 출장제외 강재민 1)
  {
    name: '김서현', role: '투수', position: 'CL', pitchRole: '마무리', category: '국내', age: 22,
    ability: 82, potential: 93, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 3,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 보류선수' },
  },
  {
    name: '주현상', role: '투수', position: 'RP', pitchRole: '필승조', category: '국내', age: 34,
    ability: 78, potential: 78, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 7,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '김종수', role: '투수', position: 'RP', pitchRole: '필승조', category: '국내', age: 32,
    ability: 73, potential: 77, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 7,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 불펜 투수' },
  },
  {
    name: '박상원', role: '투수', position: 'RP', pitchRole: '중간', category: '국내', age: 32,
    ability: 75, potential: 79, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 8,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '엄상백', role: '투수', position: 'RP', pitchRole: '롱릴리프', category: '국내', age: 30,
    ability: 75, potential: 80, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 9,
    contract: { status: '미확인', currency: 'KRW', years: 4, yearsRemaining: 3, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '황준서', role: '투수', position: 'RP', pitchRole: '중간', category: '국내', age: 21,
    ability: 69, potential: 88, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 2,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '조동욱', role: '투수', position: 'RP', pitchRole: '중간', category: '국내', age: 22,
    ability: 67, potential: 84, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 2,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: 'KT 트레이드 한화 잔류 확정' },
  },
  {
    name: '정우주', role: '투수', position: 'RP', pitchRole: '추격조', category: '국내', age: 20,
    ability: 70, potential: 92, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 1,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '강재민', role: '투수', position: 'RP', pitchRole: '예비', category: '국내', age: 29,
    ability: 69, potential: 71, abilityStatus: '확정', rosterTier: '1군', gameDayActive: false, serviceYears: 5,
    contract: { status: '확정', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0.8, signingBonus: 0, totalValue: 0.8, note: 'v4.60.13 신규 게임 계약 (29인 등록 · 당일 출장 제외)' },
  },
  // 주전 타순 9
  {
    name: '문현빈', role: '타자', position: 'LF', category: '국내', age: 22,
    ability: 83, potential: 91, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 3,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '페라자', role: '타자', position: 'RF', category: '외국인', age: 28,
    ability: 87, potential: 87, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 2,
    contract: { status: '미확인', currency: 'USD', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 외국인 타자 (계약금 미확인)' },
  },
  {
    name: '노시환', role: '타자', position: '3B', category: '국내', age: 26,
    ability: 88, potential: 93, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 7,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 핵심 (포스팅 자격 7시즌 검토 가능)' },
  },
  {
    name: '강백호', role: '타자', position: '1B', category: '국내', age: 27,
    ability: 85, potential: 90, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 8,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '채은성', role: '타자', position: '1B', category: '국내', age: 36,
    ability: 81, potential: 82, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 12,
    contract: { status: '미확인', currency: 'KRW', years: 6, yearsRemaining: 3, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 다년계약 선수' },
  },
  {
    name: '허인서', role: '타자', position: 'C', category: '국내', age: 24,
    ability: 82, potential: 90, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 4,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: 'v4.54 능력치 상향 확정 (82/90)' },
  },
  {
    name: '황영묵', role: '타자', position: '2B', category: '국내', age: 27,
    ability: 72, potential: 79, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 2,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '이진영', role: '타자', position: 'CF', category: '국내', age: 29,
    ability: 73, potential: 81, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 7,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: 'KT 트레이드 한화 잔류 확정' },
  },
  {
    name: '심우준', role: '타자', position: 'SS', category: '국내', age: 31,
    ability: 73, potential: 76, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 10,
    contract: { status: '미확인', currency: 'KRW', years: 4, yearsRemaining: 3, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  // 벤치 6 (당일 출장 5 + 출장 제외 장규현 1)
  {
    name: '최재훈', role: '타자', position: 'C', category: '국내', age: 37,
    ability: 79, potential: 79, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 14,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '김태연', role: '타자', position: '1B', category: '국내', age: 29,
    ability: 76, potential: 81, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 7,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '기존 구단 선수' },
  },
  {
    name: '이도윤', role: '타자', position: 'SS', category: '국내', age: 30,
    ability: 73, potential: 75, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 8,
    contract: { status: '확정', currency: 'KRW', years: 2, yearsRemaining: 2, annualSalary: 1.2, signingBonus: 0.2, totalValue: 2.6, note: 'v4.60.13 신규 게임 계약 (2년 2.6억)' },
  },
  {
    name: '하주석', role: '타자', position: 'SS', category: '국내', age: 32,
    ability: 70, potential: 72, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 11,
    contract: { status: '확정', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 1.0, signingBonus: 0, totalValue: 1.0, note: 'v4.60.13 신규 게임 계약 (1년 1.0억)' },
  },
  {
    name: '손아섭', role: '타자', position: 'LF', category: '국내', age: 38,
    ability: 68, potential: 68, abilityStatus: '확정', rosterTier: '1군', gameDayActive: true, serviceYears: 16,
    contract: { status: '확정', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 1.5, signingBonus: 0, totalValue: 1.5, note: 'v4.60.13 신규 게임 계약 (1년 1.5억)' },
  },
  {
    name: '장규현', role: '타자', position: 'C', category: '국내', age: 24,
    ability: 69, potential: 81, abilityStatus: '확정', rosterTier: '1군', gameDayActive: false, serviceYears: 3,
    contract: { status: '확정', currency: 'KRW', years: 2, yearsRemaining: 2, annualSalary: 0.45, signingBonus: 0.1, totalValue: 1.0, note: 'v4.60.13 신규 게임 계약 (29인 등록 · 당일 출장 제외)' },
  },
  // 개막 대기 1명
  {
    name: '유로결', role: '타자', position: 'CF', category: '국내', age: 26,
    ability: 66, potential: 75, abilityStatus: '평가대기', rosterTier: '대기', gameDayActive: false, serviceYears: 4,
    contract: { status: '미확인', currency: 'KRW', years: 1, yearsRemaining: 1, annualSalary: 0, signingBonus: 0, totalValue: 0, note: '개막 엔트리 대기 (방출/말소 아님)' },
  },
];

function inferHitterPositionByOrder(order: number): Position {
  const map: Position[] = ['CF', 'RF', '3B', '1B', 'C', 'SS', 'LF', '2B', 'DH'];
  return map[(order - 1) % map.length];
}

function inferPitcherPositionByOrder(order: number): { pos: Position; pitchRole: Player['pitchRole'] } {
  if (order <= 5) return { pos: 'SP', pitchRole: '선발' };
  if (order === 6) return { pos: 'CL', pitchRole: '마무리' };
  if (order === 7) return { pos: 'RP', pitchRole: '필승조' };
  return { pos: 'RP', pitchRole: '중간' };
}

interface FuturesSeed {
  name: string;
  role: '투수' | '타자';
  position: Position;
  pitchRole?: Player['pitchRole'];
  age: number;
  ability: number;
  potential: number;
}

/**
 * 타 9개 구단 1군 현실 불펜·벤치 뎁스 보강 (선발 5 + 불펜 7~8 + 벤치 2 구성 · 2군 시드와 중복 없음)
 */
const EXTRA_1ST_DEPTH_BY_TEAM: Partial<Record<TeamId, FuturesSeed[]>> = {
  LG: [
    { name: '정우영', role: '투수', position: 'RP', pitchRole: '필승조', age: 27, ability: 74, potential: 80 },
    { name: '함덕주', role: '투수', position: 'RP', pitchRole: '중간', age: 31, ability: 73, potential: 76 },
    { name: '장현식', role: '투수', position: 'RP', pitchRole: '필승조', age: 31, ability: 75, potential: 77 },
    { name: '김강률', role: '투수', position: 'RP', pitchRole: '추격조', age: 38, ability: 70, potential: 71 },
    { name: '허도환', role: '타자', position: 'C', age: 41, ability: 67, potential: 67 },
    { name: '최승민', role: '타자', position: 'CF', age: 30, ability: 68, potential: 71 },
    { name: '안익훈', role: '타자', position: 'RF', age: 30, ability: 68, potential: 71 },
    { name: '함창건', role: '타자', position: 'LF', age: 25, ability: 67, potential: 75 },
    { name: '손용준', role: '타자', position: '2B', age: 25, ability: 67, potential: 75 },
  ],
  두산: [
    { name: '홍건희', role: '투수', position: 'RP', pitchRole: '필승조', age: 34, ability: 75, potential: 76 },
    { name: '김명신', role: '투수', position: 'RP', pitchRole: '중간', age: 33, ability: 72, potential: 74 },
    { name: '김강률B', role: '투수', position: 'RP', pitchRole: '중간', age: 29, ability: 70, potential: 73 },
    { name: '박정수', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 30, ability: 70, potential: 73 },
    { name: '장승현', role: '타자', position: 'C', age: 32, ability: 69, potential: 71 },
    { name: '박계범', role: '타자', position: 'SS', age: 30, ability: 69, potential: 72 },
    { name: '김인태', role: '타자', position: 'RF', age: 32, ability: 70, potential: 72 },
    { name: '서예일', role: '타자', position: '2B', age: 33, ability: 68, potential: 70 },
    { name: '박준영', role: '타자', position: '3B', age: 29, ability: 70, potential: 75 },
  ],
  KT: [
    { name: '손동현', role: '투수', position: 'RP', pitchRole: '필승조', age: 26, ability: 75, potential: 83 },
    { name: '김민수B', role: '투수', position: 'RP', pitchRole: '중간', age: 27, ability: 71, potential: 75 },
    { name: '문용익', role: '투수', position: 'RP', pitchRole: '추격조', age: 31, ability: 70, potential: 73 },
    { name: '박시영', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 37, ability: 69, potential: 70 },
    { name: '조대현', role: '타자', position: 'C', age: 27, ability: 68, potential: 74 },
    { name: '송민섭', role: '타자', position: 'RF', age: 35, ability: 68, potential: 70 },
    { name: '안치영', role: '타자', position: 'CF', age: 28, ability: 68, potential: 73 },
    { name: '윤준혁', role: '타자', position: '3B', age: 25, ability: 67, potential: 76 },
    { name: '장준원', role: '타자', position: 'SS', age: 31, ability: 68, potential: 71 },
  ],
  키움: [
    { name: '주승우', role: '투수', position: 'RP', pitchRole: '필승조', age: 26, ability: 74, potential: 81 },
    { name: '문성현', role: '투수', position: 'RP', pitchRole: '중간', age: 35, ability: 70, potential: 71 },
    { name: '김선기', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 35, ability: 70, potential: 72 },
    { name: '양지율', role: '투수', position: 'RP', pitchRole: '추격조', age: 28, ability: 69, potential: 74 },
    { name: '김재현', role: '타자', position: 'C', age: 33, ability: 69, potential: 71 },
    { name: '이용규', role: '타자', position: 'LF', age: 40, ability: 69, potential: 69 },
    { name: '변상권', role: '타자', position: 'RF', age: 29, ability: 69, potential: 73 },
    { name: '임병욱', role: '타자', position: 'CF', age: 31, ability: 69, potential: 72 },
    { name: '김웅빈', role: '타자', position: '3B', age: 30, ability: 68, potential: 72 },
  ],
  SSG: [
    { name: '고효준', role: '투수', position: 'RP', pitchRole: '중간', age: 43, ability: 70, potential: 70 },
    { name: '한두솔', role: '투수', position: 'RP', pitchRole: '중간', age: 29, ability: 72, potential: 76 },
    { name: '최민준', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 27, ability: 71, potential: 76 },
    { name: '박민호', role: '투수', position: 'RP', pitchRole: '추격조', age: 34, ability: 70, potential: 72 },
    { name: '김민식', role: '타자', position: 'C', age: 37, ability: 69, potential: 70 },
    { name: '김성현', role: '타자', position: '2B', age: 39, ability: 69, potential: 70 },
    { name: '안상현', role: '타자', position: 'SS', age: 29, ability: 69, potential: 73 },
    { name: '정현승', role: '타자', position: 'CF', age: 25, ability: 67, potential: 76 },
    { name: '김찬형', role: '타자', position: '3B', age: 29, ability: 68, potential: 72 },
  ],
  NC: [
    { name: '김영규', role: '투수', position: 'RP', pitchRole: '필승조', age: 26, ability: 75, potential: 82 },
    { name: '한재승', role: '투수', position: 'RP', pitchRole: '중간', age: 25, ability: 72, potential: 79 },
    { name: '송명기', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 26, ability: 71, potential: 77 },
    { name: '이준호', role: '투수', position: 'RP', pitchRole: '추격조', age: 26, ability: 69, potential: 75 },
    { name: '박세혁', role: '타자', position: 'C', age: 36, ability: 70, potential: 71 },
    { name: '도태훈', role: '타자', position: '1B', age: 33, ability: 68, potential: 71 },
    { name: '최정원', role: '타자', position: '2B', age: 26, ability: 69, potential: 75 },
    { name: '오영수', role: '타자', position: 'LF', age: 26, ability: 69, potential: 76 },
    { name: '박영빈', role: '타자', position: 'CF', age: 29, ability: 68, potential: 72 },
  ],
  KIA: [
    { name: '장현식B', role: '투수', position: 'RP', pitchRole: '중간', age: 28, ability: 73, potential: 77 },
    { name: '임기영B', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 32, ability: 72, potential: 74 },
    { name: '이준영', role: '투수', position: 'RP', pitchRole: '중간', age: 34, ability: 72, potential: 74 },
    { name: '유승철', role: '투수', position: 'RP', pitchRole: '추격조', age: 28, ability: 69, potential: 74 },
    { name: '한승택', role: '타자', position: 'C', age: 32, ability: 68, potential: 71 },
    { name: '고종욱', role: '타자', position: 'LF', age: 37, ability: 70, potential: 70 },
    { name: '서건창', role: '타자', position: '2B', age: 37, ability: 70, potential: 70 },
    { name: '이우성', role: '타자', position: 'RF', age: 32, ability: 71, potential: 73 },
    { name: '김석환', role: '타자', position: '1B', age: 27, ability: 68, potential: 75 },
  ],
  삼성: [
    { name: '김태훈', role: '투수', position: 'RP', pitchRole: '필승조', age: 34, ability: 74, potential: 76 },
    { name: '우완 이승현', role: '투수', position: 'RP', pitchRole: '중간', age: 35, ability: 72, potential: 74 },
    { name: '이상민', role: '투수', position: 'RP', pitchRole: '중간', age: 36, ability: 71, potential: 73 },
    { name: '양창섭', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 27, ability: 70, potential: 76 },
    { name: '이병헌C', role: '타자', position: 'C', age: 27, ability: 69, potential: 75 },
    { name: '박병호', role: '타자', position: '1B', age: 40, ability: 72, potential: 72 },
    { name: '김헌곤', role: '타자', position: 'RF', age: 38, ability: 70, potential: 70 },
    { name: '이성규', role: '타자', position: 'CF', age: 33, ability: 70, potential: 72 },
    { name: '안주형', role: '타자', position: '2B', age: 33, ability: 69, potential: 71 },
  ],
  롯데: [
    { name: '구승민', role: '투수', position: 'RP', pitchRole: '필승조', age: 36, ability: 74, potential: 75 },
    { name: '김상수P', role: '투수', position: 'RP', pitchRole: '중간', age: 38, ability: 72, potential: 73 },
    { name: '박진', role: '투수', position: 'RP', pitchRole: '중간', age: 27, ability: 71, potential: 77 },
    { name: '한현희', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 33, ability: 71, potential: 74 },
    { name: '서동욱', role: '타자', position: 'C', age: 26, ability: 68, potential: 75 },
    { name: '노진혁', role: '타자', position: '3B', age: 37, ability: 70, potential: 71 },
    { name: '이학주', role: '타자', position: 'SS', age: 36, ability: 69, potential: 70 },
    { name: '신윤후', role: '타자', position: 'CF', age: 30, ability: 68, potential: 72 },
    { name: '최항', role: '타자', position: '2B', age: 32, ability: 69, potential: 72 },
  ],
};

const TEAM_FUTURES_SEEDS: Record<TeamId, FuturesSeed[]> = {
  LG: [
    { name: '김영우', role: '투수', position: 'SP', pitchRole: '선발', age: 20, ability: 64, potential: 84 },
    { name: '김대현', role: '투수', position: 'SP', pitchRole: '선발', age: 27, ability: 66, potential: 73 },
    { name: '박명근', role: '투수', position: 'RP', pitchRole: '중간', age: 22, ability: 67, potential: 82 },
    { name: '우강훈', role: '투수', position: 'RP', pitchRole: '중간', age: 24, ability: 63, potential: 78 },
    { name: '최채흥', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 30, ability: 66, potential: 72 },
    { name: '이주헌', role: '타자', position: 'C', age: 23, ability: 63, potential: 81 },
    { name: '김범석', role: '타자', position: '1B', age: 22, ability: 65, potential: 83 },
    { name: '이영빈', role: '타자', position: 'SS', age: 24, ability: 64, potential: 79 },
    { name: '최원영', role: '타자', position: 'CF', age: 23, ability: 63, potential: 78 },
    { name: '송찬의', role: '타자', position: 'LF', age: 26, ability: 65, potential: 75 },
    { name: '이지강', role: '투수', position: 'SP', pitchRole: '선발', age: 27, ability: 65, potential: 75 },
    { name: '문정빈', role: '타자', position: '1B', age: 23, ability: 64, potential: 80 },
  ],
  한화: [
    { name: '김기중', role: '투수', position: 'SP', pitchRole: '선발', age: 24, ability: 65, potential: 81 },
    { name: '김범수', role: '투수', position: 'RP', pitchRole: '중간', age: 30, ability: 67, potential: 73 },
    { name: '이태양', role: '투수', position: 'SP', pitchRole: '선발', age: 35, ability: 66, potential: 69 },
    { name: '한승주', role: '투수', position: 'RP', pitchRole: '중간', age: 25, ability: 64, potential: 79 },
    { name: '성지훈', role: '투수', position: 'RP', pitchRole: '추격조', age: 23, ability: 61, potential: 77 },
    { name: '박상언', role: '타자', position: 'C', age: 28, ability: 64, potential: 72 },
    { name: '정한균', role: '타자', position: '2B', age: 22, ability: 61, potential: 78 },
    { name: '김인환', role: '타자', position: '1B', age: 31, ability: 66, potential: 71 },
    { name: '임종찬', role: '타자', position: 'RF', age: 25, ability: 64, potential: 78 },
    { name: '이원석', role: '타자', position: 'CF', age: 27, ability: 65, potential: 74 },
  ],
  SSG: [
    { name: '송영진', role: '투수', position: 'SP', pitchRole: '선발', age: 22, ability: 66, potential: 83 },
    { name: '박종훈', role: '투수', position: 'SP', pitchRole: '선발', age: 34, ability: 65, potential: 69 },
    { name: '서진용', role: '투수', position: 'RP', pitchRole: '필승조', age: 33, ability: 67, potential: 72 },
    { name: '박시후', role: '투수', position: 'RP', pitchRole: '중간', age: 25, ability: 62, potential: 77 },
    { name: '정동윤', role: '투수', position: 'RP', pitchRole: '추격조', age: 28, ability: 63, potential: 72 },
    { name: '이지영', role: '타자', position: 'C', age: 40, ability: 67, potential: 68 },
    { name: '박지환', role: '타자', position: '2B', age: 21, ability: 66, potential: 85 },
    { name: '최준우', role: '타자', position: 'LF', age: 27, ability: 64, potential: 75 },
    { name: '하재훈', role: '타자', position: 'RF', age: 35, ability: 65, potential: 69 },
    { name: '김창평', role: '타자', position: 'CF', age: 26, ability: 62, potential: 75 },
  ],
  삼성: [
    { name: '황동재', role: '투수', position: 'SP', pitchRole: '선발', age: 25, ability: 66, potential: 80 },
    { name: '육선엽', role: '투수', position: 'SP', pitchRole: '선발', age: 21, ability: 64, potential: 84 },
    { name: '이호성', role: '투수', position: 'RP', pitchRole: '중간', age: 22, ability: 65, potential: 82 },
    { name: '최하늘', role: '투수', position: 'RP', pitchRole: '롱릴리프', age: 27, ability: 63, potential: 74 },
    { name: '김윤수', role: '투수', position: 'RP', pitchRole: '중간', age: 26, ability: 65, potential: 77 },
    { name: '김도환', role: '타자', position: 'C', age: 26, ability: 63, potential: 76 },
    { name: '양도근', role: '타자', position: '2B', age: 23, ability: 64, potential: 79 },
    { name: '전병우', role: '타자', position: '3B', age: 33, ability: 65, potential: 70 },
    { name: '김현준', role: '타자', position: 'CF', age: 24, ability: 66, potential: 80 },
    { name: '윤정빈', role: '타자', position: 'RF', age: 27, ability: 66, potential: 76 },
  ],
  NC: [
    { name: '신영우', role: '투수', position: 'SP', pitchRole: '선발', age: 22, ability: 64, potential: 84 },
    { name: '이용준', role: '투수', position: 'SP', pitchRole: '선발', age: 24, ability: 65, potential: 79 },
    { name: '김시훈', role: '투수', position: 'RP', pitchRole: '중간', age: 27, ability: 67, potential: 76 },
    { name: '전사민', role: '투수', position: 'RP', pitchRole: '중간', age: 27, ability: 64, potential: 75 },
    { name: '손주환', role: '투수', position: 'RP', pitchRole: '추격조', age: 24, ability: 62, potential: 77 },
    { name: '안중열', role: '타자', position: 'C', age: 30, ability: 64, potential: 71 },
    { name: '김성욱', role: '타자', position: 'CF', age: 33, ability: 67, potential: 71 },
    { name: '김한별', role: '타자', position: 'SS', age: 25, ability: 63, potential: 77 },
    { name: '박시원', role: '타자', position: 'RF', age: 25, ability: 64, potential: 78 },
    { name: '한석현', role: '타자', position: 'LF', age: 31, ability: 64, potential: 71 },
  ],
  KT: [
    { name: '원상현', role: '투수', position: 'SP', pitchRole: '선발', age: 21, ability: 65, potential: 84 },
    { name: '육청명', role: '투수', position: 'SP', pitchRole: '선발', age: 21, ability: 63, potential: 82 },
    { name: '김민', role: '투수', position: 'RP', pitchRole: '필승조', age: 27, ability: 68, potential: 77 },
    { name: '이상동', role: '투수', position: 'RP', pitchRole: '중간', age: 30, ability: 64, potential: 71 },
    { name: '우규민', role: '투수', position: 'RP', pitchRole: '중간', age: 41, ability: 65, potential: 66 },
    { name: '강현우', role: '타자', position: 'C', age: 25, ability: 64, potential: 78 },
    { name: '문상철', role: '타자', position: '1B', age: 35, ability: 67, potential: 70 },
    { name: '천성호', role: '타자', position: '2B', age: 28, ability: 66, potential: 75 },
    { name: '권동진', role: '타자', position: 'SS', age: 28, ability: 64, potential: 74 },
    { name: '정준영', role: '타자', position: 'CF', age: 22, ability: 63, potential: 80 },
  ],
  롯데: [
    { name: '나균안', role: '투수', position: 'SP', pitchRole: '선발', age: 28, ability: 68, potential: 75 },
    { name: '김진욱', role: '투수', position: 'SP', pitchRole: '선발', age: 24, ability: 66, potential: 82 },
    { name: '정현수', role: '투수', position: 'SP', pitchRole: '선발', age: 25, ability: 64, potential: 79 },
    { name: '송재영', role: '투수', position: 'RP', pitchRole: '중간', age: 24, ability: 63, potential: 78 },
    { name: '진해수', role: '투수', position: 'RP', pitchRole: '추격조', age: 39, ability: 62, potential: 65 },
    { name: '손성빈', role: '타자', position: 'C', age: 24, ability: 65, potential: 81 },
    { name: '정보근', role: '타자', position: 'C', age: 27, ability: 64, potential: 73 },
    { name: '박승욱', role: '타자', position: 'SS', age: 33, ability: 67, potential: 71 },
    { name: '김동혁', role: '타자', position: 'CF', age: 26, ability: 63, potential: 75 },
    { name: '추재현', role: '타자', position: 'LF', age: 27, ability: 65, potential: 75 },
  ],
  KIA: [
    { name: '윤영철', role: '투수', position: 'SP', pitchRole: '선발', age: 22, ability: 67, potential: 85 },
    { name: '황동하', role: '투수', position: 'SP', pitchRole: '선발', age: 24, ability: 66, potential: 81 },
    { name: '곽도규', role: '투수', position: 'RP', pitchRole: '필승조', age: 22, ability: 67, potential: 83 },
    { name: '김기훈', role: '투수', position: 'RP', pitchRole: '중간', age: 26, ability: 65, potential: 79 },
    { name: '김대유', role: '투수', position: 'RP', pitchRole: '추격조', age: 35, ability: 63, potential: 68 },
    { name: '김태군', role: '타자', position: 'C', age: 36, ability: 68, potential: 70 },
    { name: '김규성', role: '타자', position: 'SS', age: 29, ability: 64, potential: 72 },
    { name: '홍종표', role: '타자', position: '2B', age: 26, ability: 64, potential: 76 },
    { name: '이창진', role: '타자', position: 'LF', age: 35, ability: 66, potential: 70 },
    { name: '박정우', role: '타자', position: 'CF', age: 28, ability: 64, potential: 73 },
  ],
  두산: [
    { name: '최준호', role: '투수', position: 'SP', pitchRole: '선발', age: 22, ability: 65, potential: 83 },
    { name: '김유성', role: '투수', position: 'SP', pitchRole: '선발', age: 24, ability: 64, potential: 81 },
    { name: '최승용', role: '투수', position: 'SP', pitchRole: '선발', age: 25, ability: 67, potential: 80 },
    { name: '최지강', role: '투수', position: 'RP', pitchRole: '필승조', age: 25, ability: 66, potential: 80 },
    { name: '이영하', role: '투수', position: 'RP', pitchRole: '중간', age: 29, ability: 67, potential: 74 },
    { name: '김기연', role: '타자', position: 'C', age: 28, ability: 66, potential: 74 },
    { name: '박준순', role: '타자', position: '2B', age: 20, ability: 64, potential: 85 },
    { name: '이유찬', role: '타자', position: 'SS', age: 28, ability: 66, potential: 75 },
    { name: '김대한', role: '타자', position: 'CF', age: 26, ability: 64, potential: 79 },
    { name: '전다민', role: '타자', position: 'RF', age: 24, ability: 63, potential: 78 },
  ],
  키움: [
    { name: '정현우', role: '투수', position: 'SP', pitchRole: '선발', age: 20, ability: 66, potential: 88 },
    { name: '김윤하', role: '투수', position: 'SP', pitchRole: '선발', age: 21, ability: 66, potential: 85 },
    { name: '조영건', role: '투수', position: 'RP', pitchRole: '중간', age: 27, ability: 64, potential: 74 },
    { name: '윤석원', role: '투수', position: 'RP', pitchRole: '중간', age: 23, ability: 63, potential: 79 },
    { name: '박윤성', role: '투수', position: 'RP', pitchRole: '추격조', age: 22, ability: 62, potential: 78 },
    { name: '김동헌', role: '타자', position: 'C', age: 22, ability: 66, potential: 84 },
    { name: '이재상', role: '타자', position: 'SS', age: 21, ability: 64, potential: 84 },
    { name: '고영우', role: '타자', position: '3B', age: 25, ability: 65, potential: 78 },
    { name: '장재영', role: '타자', position: 'RF', age: 24, ability: 64, potential: 83 },
    { name: '원성준', role: '타자', position: 'CF', age: 26, ability: 63, potential: 75 },
  ],
};

function appendTeamFuturesSquad(
  players: Record<string, Player>,
  tid: TeamId
): void {
  const existingTeamNames = new Set(
    Object.values(players)
      .filter((p) => p.teamId === tid)
      .map((p) => p.name)
  );
  const seeds = TEAM_FUTURES_SEEDS[tid] ?? [];
  seeds.forEach((s, idx) => {
    if (existingTeamNames.has(s.name)) return;
    const pid = `${tid}-2군-${idx + 1}-${s.name}`;
    players[pid] = {
      id: pid,
      name: s.name,
      teamId: tid,
      category: '국내',
      role: s.role,
      position: s.position,
      pitchRole: s.pitchRole,
      age: s.age,
      ability: s.ability,
      potential: s.potential,
      abilityStatus: '확정',
      form: 0,
      fatigue: 0,
      lastPitchedRound: 0,
      consecutiveAppearances: 0,
      rosterTier: '2군',
      gameDayActive: false,
      contract: {
        status: '확정',
        currency: 'KRW',
        years: 1,
        yearsRemaining: 1,
        annualSalary: 0.4,
        signingBonus: 0,
        totalValue: 0.4,
        note: '2군(퓨처스리그) 육성 선수',
      },
      injury: null,
      morale: '보통',
      trainingFocus: null,
      serviceYears: Math.max(1, s.age - 19),
      seasonRatingDelta: 0,
      lastEvaluatedAtTeamGames: 0,
      stats: s.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      postseasonStats: s.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
    };
    existingTeamNames.add(s.name);
  });
}

export function buildAll10TeamsPlayersAndState(options: {
  includeHistoricalStats: boolean;
  includeHanwhaRookies: boolean;
}): {
  players: Record<string, Player>;
  teams: Record<TeamId, TeamState>;
  coaches: Record<TeamId, Coach[]>;
  faCoaches: Coach[];
} {
  const players: Record<string, Player> = {};
  const teams: Record<TeamId, TeamState> = {} as Record<TeamId, TeamState>;
  const { coaches, faCoaches } = buildInitialCoachesForMode(options.includeHistoricalStats);

  // Index aggregate stats from 182a5799
  const aggById = new Map<string, (typeof MASTER_9TEAM_AGGREGATE)[number]>();
  for (const row of MASTER_9TEAM_AGGREGATE) {
    aggById.set(row.id, row);
  }

  // Foreign lookup by team + short/full name
  const foreignByTeamAndName = new Map<string, (typeof MASTER_40_FOREIGN_EVALS)[number]>();
  for (const f of MASTER_40_FOREIGN_EVALS) {
    foreignByTeamAndName.set(`${f.teamId}:${f.name}`, f);
    if (f.rosterShortName) {
      foreignByTeamAndName.set(`${f.teamId}:${f.rosterShortName}`, f);
    }
  }

  // 1) Build Hanwha
  const hwLineupOrder: string[] = [];
  const hwLineupPos: Record<string, Position> = {};
  const hwRotation: string[] = [];
  const hwBullpen: string[] = [];
  const hwBench: string[] = [];

  for (const def of HANWHA_2026_CORE_ROSTER) {
    const pid = `한화-${def.name}`;
    const bStats: BatterStats = emptyBatterStats(false);
    const pStats: PitcherStats = emptyPitcherStats(false);

    players[pid] = {
      id: pid,
      name: def.name,
      teamId: '한화',
      category: def.category,
      role: def.role,
      position: def.position,
      pitchRole: def.pitchRole,
      age: def.age,
      ability: def.ability,
      potential: def.potential,
      abilityStatus: def.abilityStatus,
      form: 0,
      fatigue: 0,
      lastPitchedRound: 0,
      consecutiveAppearances: 0,
      rosterTier: def.rosterTier,
      gameDayActive: def.gameDayActive,
      contract: { ...def.contract },
      injury: null,
      morale: options.includeHistoricalStats ? '평가 대기' : '보통',
      trainingFocus: null,
      serviceYears: def.serviceYears,
      seasonRatingDelta: 0,
      lastEvaluatedAtTeamGames: 0,
      stats: def.role === '타자' ? bStats : pStats,
      postseasonStats: def.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
    };

    if (def.role === '투수') {
      if (def.pitchRole === '선발') hwRotation.push(pid);
      else hwBullpen.push(pid);
    } else if (def.rosterTier === '1군') {
      const lineupIdx = MASTER_CURRENT_STATE.roster.lineup.findIndex((l) => l.name === def.name);
      if (lineupIdx >= 0) {
        hwLineupOrder[lineupIdx] = pid;
        hwLineupPos[pid] = MASTER_CURRENT_STATE.roster.lineup[lineupIdx].position as Position;
      } else {
        hwBench.push(pid);
      }
    }
  }

  if (options.includeHanwhaRookies) {
    for (const r of CONFIRMED_HANWHA_ROOKIES) {
      const pid = `한화-신인-${r.draftId}`;
      players[pid] = {
        id: pid,
        name: r.name,
        teamId: '한화',
        category: '국내',
        role: r.role,
        position: r.position,
        pitchRole: r.role === '투수' ? (r.position === 'SP' ? '선발' : '중간') : undefined,
        age: r.age,
        ability: r.ability,
        potential: r.potential,
        abilityStatus: '확정',
        form: 0,
        fatigue: 0,
        lastPitchedRound: 0,
        consecutiveAppearances: 0,
        rosterTier: '2군',
        gameDayActive: false,
        contract: {
          status: '확정',
          currency: 'KRW',
          years: 1,
          yearsRemaining: 1,
          annualSalary: 0.3,
          signingBonus: r.signingBonusBillion,
          totalValue: r.signingBonusBillion,
          note: `${r.pickNotation} · ${r.school} (계약금 ${r.signingBonusBillion}억)`,
        },
        injury: null,
        morale: '평가 대기',
        trainingFocus: null,
        serviceYears: 0,
        seasonRatingDelta: 0,
        lastEvaluatedAtTeamGames: 0,
        rookieInfo: {
          draftId: r.draftId,
          pickNotation: r.pickNotation,
          round: r.round,
          pickInRound: r.pickInRound,
          originType: r.originType,
          school: r.school,
          signingBonusBillion: r.signingBonusBillion,
          amateurSummary: r.amateurSummary,
        },
        stats: r.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
        postseasonStats: r.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      };
    }
  } else {
    appendTeamFuturesSquad(players, '한화');
  }

  teams['한화'] = {
    teamId: '한화',
    lineupOrder: hwLineupOrder,
    lineupPositions: hwLineupPos,
    rotationOrder: hwRotation,
    bullpenOrder: hwBullpen,
    benchOrder: hwBench,
    nextStarterIdx: options.includeHistoricalStats ? 4 : 0, // G9 was Owen White -> next is Wang Yan-cheng (index 4)
    atmosphere: options.includeHistoricalStats ? '좋음' : '보통',
    popularity: KBO_TEAMS['한화'].basePopularity,
  };

  // 2) Build the other 9 teams from verified 2026 rosters in MASTER_9TEAM_ROSTERS
  for (const tid of TEAM_IDS) {
    if (tid === '한화') continue;
    const rawRoster = MASTER_9TEAM_ROSTERS[tid as keyof typeof MASTER_9TEAM_ROSTERS];
    const lineupOrder: string[] = [];
    const lineupPositions: Record<string, Position> = {};
    const rotationOrder: string[] = [];
    const bullpenOrder: string[] = [];

    // Also add any missing foreign/Asian-quarter player from MASTER_40_FOREIGN_EVALS if not in the 17-man roster
    const existingNames = new Set<string>([
      ...rawRoster.hitters.map((h) => h.name),
      ...rawRoster.pitchers.map((p) => p.name),
    ]);

    const benchOrder: string[] = [];

    for (const h of rawRoster.hitters) {
      const foreignMatch = foreignByTeamAndName.get(`${tid}:${h.name}`);
      const posInfo = REAL_KBO_HITTER_POSITIONS[tid]?.[h.name];
      const natPos = posInfo?.position ?? inferHitterPositionByOrder(h.order);
      const assignedLineupPos = posInfo?.lineupPos ?? natPos;
      const ability = foreignMatch ? foreignMatch.ability : Math.max(68, 82 - Math.floor(h.order * 0.9));
      const potential = foreignMatch ? foreignMatch.potential : Math.min(92, ability + 5);
      const agg = options.includeHistoricalStats ? aggById.get(h.id) : undefined;

      let stats: BatterStats = emptyBatterStats(options.includeHistoricalStats);
      if (agg && agg.type === '타자' && 'PA' in agg) {
        stats = {
          G: agg.G,
          PA: agg.PA,
          AB: agg.AB,
          H: agg.H,
          B2: agg.B2,
          B3: agg.B3,
          HR: agg.HR,
          BB: agg.BB,
          HBP: agg.HBP,
          SF: agg.SF,
          SO: agg.SO,
          R: agg.R,
          RBI: agg.RBI,
          SB: agg.SB,
          TB: agg.TB,
          isSynthetic: true,
        };
      }

      players[h.id] = {
        id: h.id,
        name: h.name,
        teamId: tid,
        category: foreignMatch ? foreignMatch.category : '국내',
        role: '타자',
        position: natPos,
        age: foreignMatch ? 29 : 27 + (h.order % 7),
        ability,
        potential,
        abilityStatus: foreignMatch ? '제안' : '평가대기',
        form: 0,
        fatigue: 0,
        lastPitchedRound: 0,
        consecutiveAppearances: 0,
        rosterTier: '1군',
        gameDayActive: true,
        contract: {
          status: '미확인',
          currency: foreignMatch ? 'USD' : 'KRW',
          years: 1,
          yearsRemaining: 1,
          annualSalary: 0,
          signingBonus: 0,
          totalValue: 0,
          note: foreignMatch ? '2026 외국인 평가표 등재' : '2026 개막 엔트리 기준',
        },
        injury: null,
        morale: '보통',
        trainingFocus: null,
        serviceYears: foreignMatch ? 1 : Math.max(1, Math.min(8, (27 + (h.order % 7)) - 22)),
        seasonRatingDelta: 0,
        lastEvaluatedAtTeamGames: 0,
        stats,
        postseasonStats: emptyBatterStats(false),
      };

      lineupOrder.push(h.id);
      lineupPositions[h.id] = assignedLineupPos;
    }

    for (const p of rawRoster.pitchers) {
      const foreignMatch = foreignByTeamAndName.get(`${tid}:${p.name}`);
      const roleInfo = inferPitcherPositionByOrder(p.order);
      const ability = foreignMatch ? foreignMatch.ability : Math.max(68, 81 - p.order);
      const potential = foreignMatch ? foreignMatch.potential : Math.min(91, ability + 5);
      const agg = options.includeHistoricalStats ? aggById.get(p.id) : undefined;

      let stats: PitcherStats = emptyPitcherStats(options.includeHistoricalStats);
      if (agg && agg.type === '투수' && 'outs' in agg) {
        stats = {
          G: agg.G,
          GS: agg.GS,
          outs: agg.outs,
          W: agg.W,
          L: agg.L,
          HLD: agg.HLD,
          SV: agg.SV,
          H: agg.H,
          BB: agg.BB,
          SO: agg.SO,
          ER: agg.ER,
          R: agg.ER,
          HR: 0,
          PC: (agg.outs ?? 0) * 5,
          isSynthetic: true,
        };
      }

      players[p.id] = {
        id: p.id,
        name: p.name,
        teamId: tid,
        category: foreignMatch ? foreignMatch.category : '국내',
        role: '투수',
        position: roleInfo.pos,
        pitchRole: roleInfo.pitchRole,
        age: foreignMatch ? 28 : 25 + (p.order % 8),
        ability,
        potential,
        abilityStatus: foreignMatch ? '제안' : '평가대기',
        form: 0,
        fatigue: 0,
        lastPitchedRound: 0,
        consecutiveAppearances: 0,
        rosterTier: '1군',
        gameDayActive: true,
        contract: {
          status: '미확인',
          currency: foreignMatch ? 'USD' : 'KRW',
          years: 1,
          yearsRemaining: 1,
          annualSalary: 0,
          signingBonus: 0,
          totalValue: 0,
          note: foreignMatch ? 'v4.60.4 외국인 평가표 등재' : '2026-03-27 개막 엔트리 기준',
        },
        injury: null,
        morale: '보통',
        trainingFocus: null,
        serviceYears: foreignMatch ? 1 : Math.max(1, Math.min(8, (25 + (p.order % 8)) - 21)),
        seasonRatingDelta: 0,
        lastEvaluatedAtTeamGames: 0,
        stats,
        postseasonStats: emptyPitcherStats(false),
      };

      if (p.order <= 5) rotationOrder.push(p.id);
      else bullpenOrder.push(p.id);
    }

    // Ensure every foreign/Asian-quarter player in MASTER_40_FOREIGN_EVALS is available on their team
    const extraForeign = MASTER_40_FOREIGN_EVALS.filter(
      (f) =>
        f.teamId === tid &&
        !existingNames.has(f.name) &&
        !(f.rosterShortName && existingNames.has(f.rosterShortName))
    );
    extraForeign.forEach((f, idx) => {
      const pid = `${tid}-F${idx + 1}`;
      const isP = f.role === '투수';
      players[pid] = {
        id: pid,
        name: f.name,
        teamId: tid,
        category: f.category,
        role: f.role,
        position: isP ? 'SP' : 'LF',
        pitchRole: isP ? '선발' : undefined,
        age: 27,
        ability: f.ability,
        potential: f.potential,
        abilityStatus: '제안',
        form: 0,
        fatigue: 0,
        lastPitchedRound: 0,
        consecutiveAppearances: 0,
        rosterTier: '1군',
        gameDayActive: true,
        contract: {
          status: '미확인',
          currency: 'USD',
          years: 1,
          yearsRemaining: 1,
          annualSalary: 0,
          signingBonus: 0,
          totalValue: 0,
          note: 'v4.60.4 40인 평가표 등재',
        },
        injury: null,
        morale: '보통',
        trainingFocus: null,
        serviceYears: 1,
        seasonRatingDelta: 0,
        lastEvaluatedAtTeamGames: 0,
        stats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
        postseasonStats: isP ? emptyPitcherStats(false) : emptyBatterStats(false),
      };
      if (isP) {
        if (rotationOrder.length < 5) {
          rotationOrder.push(pid);
        } else if (f.ability >= 78) {
          // Promote high-OVR foreign starter into rotation and shift lowest-OVR domestic starter to bullpen
          let weakestIdx = -1;
          let weakestOvr = 999;
          rotationOrder.forEach((rid, rIdx) => {
            const rp = players[rid];
            if (rp && rp.category === '국내' && rp.ability < weakestOvr) {
              weakestOvr = rp.ability;
              weakestIdx = rIdx;
            }
          });
          if (weakestIdx >= 0) {
            const demotedId = rotationOrder[weakestIdx];
            rotationOrder[weakestIdx] = pid;
            const demoted = players[demotedId];
            if (demoted) {
              demoted.position = 'RP';
              demoted.pitchRole = '롱릴리프';
            }
            bullpenOrder.push(demotedId);
          } else {
            players[pid].position = 'RP';
            players[pid].pitchRole = '필승조';
            bullpenOrder.push(pid);
          }
        } else {
          players[pid].position = 'RP';
          players[pid].pitchRole = '중간';
          bullpenOrder.push(pid);
        }
      } else {
        benchOrder.push(pid);
      }
      existingNames.add(f.name);
    });

    // Add realistic 1군 bullpen & bench depth so every team has 7-8 relievers and 2+ bench hitters
    const extraDepth = EXTRA_1ST_DEPTH_BY_TEAM[tid] ?? [];
    extraDepth.forEach((d, idx) => {
      if (existingNames.has(d.name)) return;
      const pid = `${tid}-D1-${idx + 1}-${d.name}`;
      players[pid] = {
        id: pid,
        name: d.name,
        teamId: tid,
        category: '국내',
        role: d.role,
        position: d.position,
        pitchRole: d.pitchRole,
        age: d.age,
        ability: d.ability,
        potential: d.potential,
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
          annualSalary: 0,
          signingBonus: 0,
          totalValue: 0,
          note: '2026 개막 1군 엔트리',
        },
        injury: null,
        morale: '보통',
        trainingFocus: null,
        serviceYears: Math.max(2, d.age - 20),
        seasonRatingDelta: 0,
        lastEvaluatedAtTeamGames: 0,
        stats: d.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
        postseasonStats: d.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      };
      if (d.role === '투수') bullpenOrder.push(pid);
      else benchOrder.push(pid);
      existingNames.add(d.name);
    });

    teams[tid] = {
      teamId: tid,
      lineupOrder,
      lineupPositions,
      rotationOrder,
      bullpenOrder,
      benchOrder,
      nextStarterIdx: options.includeHistoricalStats ? 4 : 0,
      atmosphere: '보통',
      popularity: KBO_TEAMS[tid].basePopularity,
    };

    appendTeamFuturesSquad(players, tid);
  }

  applyRealPlayerMetadataAndNumbers(players, {
    preserveHanwhaMasterContracts: options.includeHistoricalStats,
  });

  return { players, teams, coaches, faCoaches };
}

/**
 * Populates Hanwha's exact confirmed & partial cumulative stats from rounds 1-9 (v4.60.18 + v4.60.21 + v4.60.25 + v4.60.30).
 * Missing Kiwoom (G1-3) and Doosan (G7-9) raw counting stats are preserved as null ('미집계') with confirmedMinHR/RBI where known!
 */
function applyHanwhaHistoricalStats(players: Record<string, Player>): void {
  // 1) Sum exact KT 3-game boxscores from MASTER_KT_SERIES
  const ktHitters: Record<string, BatterStats> = {};
  const ktPitchers: Record<string, PitcherStats> = {};

  for (const g of MASTER_KT_SERIES.games) {
    for (const [name, st] of Object.entries(g.hb)) {
      if (!ktHitters[name]) ktHitters[name] = emptyBatterStats(false);
      const acc = ktHitters[name];
      acc.G = (acc.G ?? 0) + st.G;
      acc.PA = (acc.PA ?? 0) + st.PA;
      acc.AB = (acc.AB ?? 0) + st.AB;
      acc.H = (acc.H ?? 0) + st.H;
      acc.B2 = (acc.B2 ?? 0) + st.B2;
      acc.B3 = (acc.B3 ?? 0) + st.B3;
      acc.HR = (acc.HR ?? 0) + st.HR;
      acc.BB = (acc.BB ?? 0) + st.BB;
      acc.HBP = (acc.HBP ?? 0) + st.HBP;
      acc.SF = (acc.SF ?? 0) + st.SF;
      acc.SO = (acc.SO ?? 0) + st.SO;
      acc.R = (acc.R ?? 0) + st.R;
      acc.RBI = (acc.RBI ?? 0) + st.RBI;
      acc.SB = (acc.SB ?? 0) + st.SB;
      acc.TB = (acc.TB ?? 0) + st.TB;
    }

    for (const [name, st] of Object.entries(g.hp)) {
      if (!ktPitchers[name]) ktPitchers[name] = emptyPitcherStats(false);
      const acc = ktPitchers[name];
      acc.G = (acc.G ?? 0) + st.G;
      acc.GS = (acc.GS ?? 0) + st.GS;
      acc.outs = (acc.outs ?? 0) + st.outs;
      acc.W = (acc.W ?? 0) + st.W;
      acc.L = (acc.L ?? 0) + st.L;
      acc.HLD = (acc.HLD ?? 0) + st.HLD;
      acc.SV = (acc.SV ?? 0) + st.SV;
      acc.H = (acc.H ?? 0) + st.H;
      acc.BB = (acc.BB ?? 0) + st.BB;
      acc.SO = (acc.SO ?? 0) + st.SO;
      acc.ER = (acc.ER ?? 0) + st.ER;
      acc.R = (acc.R ?? 0) + st.R;
      acc.HR = (acc.HR ?? 0) + st.HR;
      acc.PC = (acc.PC ?? 0) + st.PC;
    }
  }

  // Confirmed Kiwoom (G1-3) partial hitter counts (v4.60.19)
  const kiwoomConfirmedHitters: Record<string, { hr?: number; rbi?: number }> = {
    노시환: { hr: 1, rbi: 3 },
    허인서: { hr: 1, rbi: 2 },
    페라자: { rbi: 2 },
    강백호: { rbi: 2 },
    채은성: { rbi: 1 },
    문현빈: { rbi: 1 },
  };

  for (const p of Object.values(players)) {
    if (p.teamId !== '한화' || p.rookieInfo) continue;

    if (p.role === '타자') {
      const kt = ktHitters[p.name] ?? emptyBatterStats(false);
      p.ktSeriesBatting = { ...kt };
      const kw = kiwoomConfirmedHitters[p.name];
      const minHR = (kt.HR ?? 0) + (kw?.hr ?? 0);
      const minRBI = (kt.RBI ?? 0) + (kw?.rbi ?? 0);

      // Season batting raw counts remain null (미집계) because G1-3 & G7-9 per-player AB/PA are incomplete in master files
      p.stats = {
        G: null,
        PA: null,
        AB: null,
        H: null,
        B2: null,
        B3: null,
        HR: null,
        BB: null,
        HBP: null,
        SF: null,
        SO: null,
        R: null,
        RBI: null,
        SB: null,
        TB: null,
        confirmedMinHR: minHR,
        confirmedMinRBI: minRBI,
        isPartial: true,
        partialNote: '키움(1~3G) 및 두산(7~9G) 타격 세부 원자료 미완전 (KT 3연전은 완전 집계)',
        isSynthetic: false,
      };
    } else {
      // Pitchers: merge confirmed Kiwoom (v4.60.19) + KT (v4.60.21) + Doosan confirmed wins (v4.60.30)
      const kt = ktPitchers[p.name];
      const base: PitcherStats = {
        G: kt?.G ?? 0,
        GS: kt?.GS ?? 0,
        outs: kt?.outs ?? 0,
        W: kt?.W ?? 0,
        L: kt?.L ?? 0,
        HLD: kt?.HLD ?? 0,
        SV: kt?.SV ?? 0,
        H: kt?.H ?? null,
        BB: kt?.BB ?? null,
        SO: kt?.SO ?? null,
        ER: kt?.ER ?? null,
        R: kt?.R ?? null,
        HR: kt?.HR ?? null,
        PC: kt?.PC ?? null,
        isPartial: true,
        partialNote: '두산(7~9G) 세부 투구원자료 미첨부 · 확인된 최소 시즌 기록',
        isSynthetic: false,
      };

      if (p.name === '류현진') {
        base.G = 2; base.GS = 2; base.outs = 36; base.W = 1; base.L = 0; base.H = 9; base.BB = 2; base.SO = 11; base.ER = 3; base.PC = 161;
      } else if (p.name === '문동주') {
        // G2: 6IP 1W + G7 Doosan win confirmed in aggregate_players (W: 2)
        base.G = 2; base.GS = 2; base.outs = 18; base.W = 2; base.L = 0; base.SO = 8; base.ER = 2; base.H = 5; base.BB = 2; base.PC = 96; base.confirmedMinG = true; base.confirmedMinOuts = true;
      } else if (p.name === '윌켈 에르난데스') {
        base.G = 2; base.GS = 2; base.outs = 15; base.W = 0; base.L = 1; base.SO = 5; base.ER = 4; base.H = 7; base.BB = 2; base.PC = 93; base.confirmedMinG = true; base.confirmedMinOuts = true;
      } else if (p.name === '오웬 화이트') {
        // G4 KT win (1W) + G9 Doosan win confirmed in aggregate_players (W: 2)
        base.G = 2; base.GS = 2; base.outs = 18; base.W = 2; base.L = 0; base.SO = 9; base.ER = 1; base.H = 8; base.BB = 0; base.PC = 75; base.confirmedMinG = true; base.confirmedMinOuts = true;
      } else if (p.name === '왕옌청') {
        base.G = 1; base.GS = 1; base.outs = 18; base.W = 0; base.L = 1; base.SO = 7; base.ER = 6; base.H = 12; base.BB = 0; base.PC = 104; base.confirmedMinG = true; base.confirmedMinOuts = true;
      } else if (p.name === '김서현') {
        base.G = 4; base.GS = 0; base.outs = 12; base.W = 0; base.L = 0; base.SV = 3; base.ER = 0; base.confirmedMinG = true;
      } else if (p.name === '주현상') {
        base.G = 3; base.GS = 0; base.outs = 9; base.W = 0; base.L = 0; base.HLD = 2; base.ER = 0; base.confirmedMinG = true;
      } else if (p.name === '김종수') {
        base.G = 2; base.GS = 0; base.outs = 6; base.W = 0; base.L = 0; base.HLD = 1; base.ER = 1; base.confirmedMinG = true;
      } else if (p.name === '엄상백') {
        base.G = 2; base.GS = 0; base.outs = 9; base.W = 1; base.L = 0; base.ER = null; base.confirmedMinG = true;
      } else if (p.name === '박상원') {
        base.G = 2; base.GS = 0; base.outs = 6; base.W = 0; base.L = 0; base.ER = null; base.confirmedMinG = true;
      } else if (p.name === '조동욱') {
        base.G = 2; base.GS = 0; base.outs = 6; base.W = 0; base.L = 0; base.ER = 3; base.confirmedMinG = true;
      } else if (p.name === '정우주') {
        base.G = 2; base.GS = 0; base.outs = 6; base.W = 0; base.L = 0; base.ER = 0; base.confirmedMinG = true;
      } else if (p.name === '황준서') {
        base.G = 1; base.GS = 0; base.outs = 3; base.W = 0; base.L = 0; base.H = 3; base.BB = 0; base.SO = 1; base.ER = 0; base.confirmedMinG = true; base.confirmedMinOuts = true;
      } else if (p.name === '강재민') {
        base.G = 0; base.GS = 0; base.outs = 0; base.W = 0; base.L = 0; base.HLD = 0; base.SV = 0; base.ER = null;
      }

      p.stats = base;
    }
  }
}

export function createPreservedHanwhaCareer(): CareerSave {
  const { players, teams, coaches, faCoaches } = buildAll10TeamsPlayersAndState({
    includeHistoricalStats: true,
    includeHanwhaRookies: true,
  });

  applyHanwhaHistoricalStats(players);

  // Convert immutable 45 games ledger into GameRecord[]
  const ktByDate = new Map<string, (typeof MASTER_KT_SERIES.games)[number]>(
    MASTER_KT_SERIES.games.map((g) => [g.date, g])
  );
  const gamesLedger: GameRecord[] = MASTER_45_GAMES.map((g, idx) => {
    const isHanwha = (g.away as TeamId) === '한화' || (g.home as TeamId) === '한화';
    const ktMatch = isHanwha && ((g.away as TeamId) === 'KT' || (g.home as TeamId) === 'KT') ? ktByDate.get(g.date) : undefined;

    const innings = ktMatch
      ? {
          away: [...ktMatch.score.KT] as number[],
          home: [...ktMatch.score.한화] as (number | null)[],
        }
      : null;

    const keyPerformers: GameRecord['keyPerformers'] = [];
    if (ktMatch) {
      if (ktMatch.g === 1) {
        keyPerformers.push(
          { playerName: '오웬 화이트', teamId: '한화', role: '투수', summary: '6.0이닝 1자책 9K 75구 (승)' },
          { playerName: '채은성', teamId: '한화', role: '타자', summary: '4타수 3안타 2홈런 3타점' },
          { playerName: '문현빈', teamId: '한화', role: '타자', summary: '4타수 1안타 1홈런 2타점' }
        );
      } else if (ktMatch.g === 2) {
        keyPerformers.push(
          { playerName: '왕옌청', teamId: '한화', role: '투수', summary: '6.0이닝 6자책 7K 104구 (패)' },
          { playerName: '강백호', teamId: '한화', role: '타자', summary: '5타수 3안타 1도루성 2루타' },
          { playerName: '페라자', teamId: '한화', role: '타자', summary: '5타수 1안타 1홈런 1타점' }
        );
      } else if (ktMatch.g === 3) {
        keyPerformers.push(
          { playerName: '황영묵', teamId: '한화', role: '타자', summary: '4타수 2안타 1홈런 4타점' },
          { playerName: '류현진', teamId: '한화', role: '투수', summary: '6.0이닝 1자책 5K 70구' },
          { playerName: '김서현', teamId: '한화', role: '투수', summary: '1.0이닝 무실점 (세이브)' }
        );
      }
    } else if (g.round === 1 && isHanwha) {
      keyPerformers.push(
        { playerName: '류현진', teamId: '한화', role: '투수', summary: '6.0이닝 2자책 6K 91구 (승)' },
        { playerName: '노시환', teamId: '한화', role: '타자', summary: '2점 홈런 (2타점)' },
        { playerName: '김서현', teamId: '한화', role: '투수', summary: '1.0이닝 무실점 (세이브)' }
      );
    } else if (g.round === 2 && isHanwha) {
      keyPerformers.push(
        { playerName: '문동주', teamId: '한화', role: '투수', summary: '6.0이닝 2자책 8K 96구 (승)' },
        { playerName: '노시환', teamId: '한화', role: '타자', summary: '1타점 적시타' }
      );
    } else if (g.round === 3 && isHanwha) {
      keyPerformers.push(
        { playerName: '윌켈 에르난데스', teamId: '한화', role: '투수', summary: '5.0이닝 4자책 5K 93구 (패)' },
        { playerName: '문현빈', teamId: '한화', role: '타자', summary: '1타점 2루타' }
      );
    } else if (g.round === 7 && isHanwha) {
      keyPerformers.push({ playerName: '문동주', teamId: '한화', role: '투수', summary: '선발 승리 (시즌 2승)' });
    } else if (g.round === 9 && isHanwha) {
      keyPerformers.push({ playerName: '오웬 화이트', teamId: '한화', role: '투수', summary: '선발 승리 (시즌 2승)' });
    }

    return {
      id: `hist-r${g.round}-${g.away}-${g.home}-${idx}`,
      round: g.round,
      date: g.date,
      awayTeam: g.away as TeamId,
      homeTeam: g.home as TeamId,
      awayRuns: g.away_runs,
      homeRuns: g.home_runs,
      awayHits: null,
      homeHits: null,
      awayErrors: null,
      homeErrors: null,
      innings,
      winner: g.winner as TeamId,
      loser: g.loser as TeamId,
      isDraw: false,
      isPostseason: false,
      source: g.source,
      isSynthetic: !isHanwha || g.round >= 4,
      verified: false,
      validationNote: '초반 1~9경기 마스터 원자료 보존 (세부 박스스코어 미완전)',
      keyPerformers,
      boxscore: null,
    };
  });

  // Build locked first 3 series from rounds 1-9
  const lockedSeries: ScheduledSeries[] = [1, 2, 3].map((sIdx) => {
    const rStart = (sIdx - 1) * 3 + 1;
    const roundGames = gamesLedger.filter((gm) => gm.round === rStart);
    const d1 = gamesLedger.find((gm) => gm.round === rStart)?.date ?? '2026-03-28';
    const d2 = gamesLedger.find((gm) => gm.round === rStart + 1)?.date ?? '2026-03-29';
    const d3 = gamesLedger.find((gm) => gm.round === rStart + 2)?.date ?? '2026-03-30';
    return {
      seriesIndex: sIdx,
      startRound: rStart,
      endRound: rStart + 2,
      dates: [d1, d2, d3],
      matchups: roundGames.map((gm) => ({ away: gm.awayTeam, home: gm.homeTeam })),
      completedRounds: 3,
    };
  });

  const schedule = generateRegularSeasonSchedule(46030, '2026-03-28', lockedSeries);

  const doosanGames = gamesLedger.filter((g) => g.round >= 7 && g.round <= 9 && (g.awayTeam === '한화' || g.homeTeam === '한화'));
  const allDoosanWindow = gamesLedger.filter((g) => g.round >= 7 && g.round <= 9);

  const preserved: CareerSave = {
    careerId: 'career_hanwha_v46030',
    label: '한화 이글스 2026 · 기존 세이브 (v4.60.30)',
    version: 'v4.60.30',
    isPreservedMaster: true,
    isArchived: false,
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-23T00:00:00.000Z',
    gmName: '단장',
    playerTeamId: '한화',
    season: 2026,
    phase: 'REGULAR_SEASON',
    seed: 46030,
    rngState: 46030,
    gamesPlayed: 9,
    totalRegularGames: 144,
    currentSeriesIndex: 3, // Rounds 1-9 (indices 0,1,2) completed; next is index 3 (rounds 10-12)
    schedule,
    teams,
    players,
    coaches,
    faCoaches,
    gamesLedger,
    finances: {
      krwUnpaidBillion: 43.3,
      usdUnpaid: 1800000,
      krwCashPaidBillion: 0,
      usdCashPaid: 0,
      cashBalanceBillion: null,
      perazaContractNote: '미확인 (기존 외국인 타자)',
      seasonRevenueBillion: 0,
      seasonExpenseBillion: 0,
      ticketRevenueBillion: 0,
      uniformRevenueBillion: 0,
      sponsorRevenueBillion: 0,
      sponsor: null,
      investments: { ...DEFAULT_INVESTMENTS },
      obligations: [
        { id: 'ob-coaches', label: '지도자 3인 확정 (류지현 15억 + 양상문 5억 + 장종훈 5억)', currency: 'KRW', amount: 25.0, paidAmount: 0 },
        { id: 'ob-rookies', label: '2026 특별 신인 11명 계약금 합계', currency: 'KRW', amount: 11.4, paidAmount: 0 },
        { id: 'ob-domestic5', label: '국내 선수 5인 신규 게임 계약 (강재민·이도윤·하주석·손아섭·장규현)', currency: 'KRW', amount: 6.9, paidAmount: 0 },
        { id: 'ob-hernandez', label: '윌켈 에르난데스 1년 계약 ($200k + $600k)', currency: 'USD', amount: 800000, paidAmount: 0 },
        { id: 'ob-white', label: '오웬 화이트 1년 계약 ($200k + $700k)', currency: 'USD', amount: 900000, paidAmount: 0 },
        { id: 'ob-wang', label: '왕옌청 아시아쿼터 1년 계약', currency: 'USD', amount: 100000, paidAmount: 0 },
      ],
    },
    injuryLogs: [],
    growthLogs: [],
    transactionLogs: [
      {
        id: 'tx-master-roster-check',
        date: '2026-03-20',
        type: '엔트리',
        teamId: '한화',
        summary: '2026시즌 한화 이글스 불펜진 확정 (김서현·주현상·김종수·박상원·엄상백)',
        detail: '조동욱·이진영 한화 잔류. 개막 투수진 구성을 완료했습니다.',
      },
      {
        id: 'tx-master-draft',
        date: '2026-03-22',
        type: '드래프트',
        teamId: '한화',
        summary: '2026 특별 신인 드래프트 11명 전원 계약 완료 (계약금 11.4억 원 미지급)',
        detail: '1R 9순위 김우진(3.2억) ~ 11R 9순위 신민재(0.2억)',
      },
      {
        id: 'tx-master-foreign',
        date: '2026-03-23',
        type: '계약',
        teamId: '한화',
        summary: '외국인 3+1 완료: 윌켈 에르난데스($800k), 오웬 화이트($900k), 왕옌청($100k), 페라자 유지',
        detail: '2026시즌 한화 외국인 선발진 윌켈 에르난데스·오웬 화이트 체제 확정.',
      },
      {
        id: 'tx-master-dom5',
        date: '2026-03-25',
        type: '계약',
        teamId: '한화',
        summary: '국내 선수 5인 일괄 계약 체결 (합계 6.90억 원 미지급)',
        detail: '강재민 0.8억, 이도윤 2.6억, 하주석 1.0억, 손아섭 1.5억, 장규현 1.0억',
      },
      {
        id: 'tx-master-entry',
        date: '2026-03-27',
        type: '엔트리',
        teamId: '한화',
        summary: '개막 29인 등록 · 27인 당일 출장 확정 (강재민·장규현 출장 제외, 유로결 개막 대기)',
      },
    ],
    draftState: createCompletedHanwhaDraftState(),
    postingRecords: [],
    postseason: {
      active: false,
      currentRound: 'NONE',
      standingsSeed: [],
      seriesHistory: [],
      currentSeries: null,
      champion: null,
    },
    awardsHistory: [],
    championHistory: HISTORICAL_BASELINE_CHAMPIONS.map((c) => ({ ...c })),
    virtualForeignMarket: generateVirtualForeignMarket(2026, 46030),
    lastSeriesReport: {
      id: 'report-r7-r9',
      title: '두산 원정 3연전 종료 (2승 1패 · 시즌 6승 3패)',
      isPostseason: false,
      playerTeamGames: doosanGames,
      allGamesInWindow: allDoosanWindow,
      newInjuries: [],
      newGrowths: [],
      createdAt: '2026-04-05T18:00:00.000Z',
    },
    warnings: [
      '한화 시즌 1~3차전(키움전) 타석·타수 및 두산전 세부 박스스코어 일부는 마스터 원자료 기준 미집계입니다.',
      '다른 9개 구단의 초반 9경기 개인 성적은 v4.60.30 실제 선수명 기반 게임 내 가상 기록입니다.',
    ],
  };

  ensureGlobalPlayerRegistryInPlace(preserved);
  ensureAmateurAndOverseasStateInPlace(preserved);
  return preserved;
}
