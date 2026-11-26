import { KBO_TEAMS } from '../data/kboTeams';
import {
  BatterStats,
  BattingOrderTier,
  CareerSave,
  CoachTacticalStyle,
  LineupOptimizationResult,
  OptimizedLineupSlot,
  Player,
  Position,
  TeamId,
} from '../types/kbo';
import { isMilitaryServing } from './militaryEngine';
import { computeDerivedContact } from './ootpRatingsEngine';
import {
  computeEffectiveFieldingAtPosition,
  getPositionProficiency,
} from './positionEngine';
import { resolveRecordOps } from './ratingEvaluationEngine';
import { calcAVG, calcOBP, calcOPS, calcSLG } from './stats';

export function getBattingOrderTier(order: number): BattingOrderTier {
  if (order <= 2) return '테이블 세터';
  if (order <= 5) return '클린업 트리오';
  return '하위 타선';
}

export const BATTING_SLOT_SPECS: {
  order: number;
  tierLabel: BattingOrderTier;
  roleTitle: string;
  keyFactors: string;
}[] = [
  { order: 1, tierLabel: '테이블 세터', roleTitle: '리드오프 (출루·주루)', keyFactors: '출루율, 선구안, 주력, 주루 능력' },
  { order: 2, tierLabel: '테이블 세터', roleTitle: '2번 타자 (컨택·출루)', keyFactors: '컨택, 출루율, 삼진 회피' },
  { order: 3, tierLabel: '클린업 트리오', roleTitle: '3번 중심 (컨택·장타)', keyFactors: '컨택, 장타력(갭·홈런), 종합 타격' },
  { order: 4, tierLabel: '클린업 트리오', roleTitle: '4번 해결사 (거포·장타)', keyFactors: '홈런 파워, 장타력, 타점 생산' },
  { order: 5, tierLabel: '클린업 트리오', roleTitle: '5번 클린업 (장타·컨택)', keyFactors: '장타력, 컨택, 득점권 생산력' },
  { order: 6, tierLabel: '하위 타선', roleTitle: '6번 하위 중심', keyFactors: '종합 타격, 중장거리 장타, 밸런스' },
  { order: 7, tierLabel: '하위 타선', roleTitle: '7번 하위 타선', keyFactors: '타격 균형, 컨택, 수비 기여' },
  { order: 8, tierLabel: '하위 타선', roleTitle: '8번 하위·수비 균형', keyFactors: '타격 균형, 출루, 수비 안정성' },
  { order: 9, tierLabel: '하위 타선', roleTitle: '9번 상위 연결형', keyFactors: '출루율, 주력, 주루 능력 (1~2번 연결)' },
];

const UNIQUE_FIELD_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

export interface OptimizeLineupOptions {
  /** 상대 선발 투수 (미전달 시 다음 일정 상대 선발 자동 추정) */
  oppStarter?: Player | null;
  /** 감독 전술 성향 명시 지정 (미전달 시 구단 감독 성향 자동 적용) */
  tacticalStyleOverride?: CoachTacticalStyle;
}

interface BatterTraitVector {
  obp: number;         // 출루율 종합 (0..100)
  eye: number;         // 선구안 (0..100)
  contact: number;     // 파생 컨택 (0..100)
  avoidK: number;      // 삼진 회피 (0..100)
  gapPower: number;    // 갭 파워 (0..100)
  hrPower: number;     // 홈런 파워 (0..100)
  slugging: number;    // 장타력 종합 (0..100)
  speed: number;       // 주력 (0..100)
  baserunning: number; // 주루·도루 종합 (0..100)
  rbiClutch: number;   // 득점권·타점 생산력 (0..100)
  overallBat: number;  // 종합 타격 능력 (0..100)
  defense: number;     // 포지션 실효 수비 (0..100)
  bats: '좌타' | '우타' | '양타';
  matchupEdge: number; // 상대 선발 좌/우 매치업 보정 (-8..+8)
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return (lo + hi) * 0.5;
  return Math.max(lo, Math.min(hi, v));
}

function resolveBatterHand(p: Player): '좌타' | '우타' | '양타' {
  if (p.bats === 'L') return '좌타';
  if (p.bats === 'S') return '양타';
  if (p.bats === 'R') return '우타';
  return p.battingProfile?.bats ?? '우타';
}

function isPitcherLefty(p: Player): boolean {
  if (p.pitchRepertoire?.throws === '좌투') return true;
  if (p.throws === 'L') return true;
  return false;
}

export function resolveTeamManagerTacticalStyle(
  career: CareerSave,
  teamId: TeamId
): CoachTacticalStyle {
  const staff = career.coaches?.[teamId] ?? [];
  const mgr = staff.find((c) => c.role === '감독');
  return mgr?.tacticalStyle ?? '밸런스';
}

/**
 * 다음 일정의 상대 선발 투수 추정 (상대 선발 좌/우 유형 반영용)
 */
export function resolveNextOpponentStarter(
  career: CareerSave,
  teamId: TeamId
): Player | null {
  const nextSeries = career.schedule?.[career.currentSeriesIndex];
  const nextMatch = nextSeries?.matchups.find(
    (m) => m.away === teamId || m.home === teamId
  );
  if (!nextMatch) return null;
  const oppTeamId: TeamId = nextMatch.away === teamId ? nextMatch.home : nextMatch.away;
  const oppState = career.teams?.[oppTeamId];
  if (!oppState || oppState.rotationOrder.length === 0) return null;
  const idx =
    ((oppState.nextStarterIdx ?? 0) % oppState.rotationOrder.length +
      oppState.rotationOrder.length) %
    oppState.rotationOrder.length;
  const sp = career.players[oppState.rotationOrder[idx]];
  if (sp && !sp.injury) return sp;
  for (const pid of oppState.rotationOrder) {
    const cand = career.players[pid];
    if (cand && !cand.injury) return cand;
  }
  return null;
}

function isHitterAvailableForLineup(career: CareerSave, p: Player, teamId: TeamId): boolean {
  const onNationalDuty =
    p.nationalTeamDuty != null &&
    career.gamesPlayed >= p.nationalTeamDuty.startRound &&
    career.gamesPlayed < p.nationalTeamDuty.endRound;

  return (
    p.teamId === teamId &&
    p.role === '타자' &&
    p.rosterTier === '1군' &&
    !p.injury &&
    !onNationalDuty &&
    !isMilitaryServing(p.militaryStatus) &&
    !p.overseasTrainingLocation
  );
}

/**
 * OOTP 세부 능력치 + 실제 성적(당해 시즌 + 최근 과거 성적) + 상대 선발 좌/우 유형 + 컨디션/피로/재활을 종합해
 * 타순 평가용 12개 지표 벡터(0~100)를 산출합니다.
 */
function buildBatterTraits(
  p: Player,
  assignedPos: Position,
  oppStarter?: Player | null
): BatterTraitVector {
  const bs = p.stats as BatterStats;
  const pa = bs?.PA ?? 0;
  const ab = bs?.AB ?? 0;
  const bats = resolveBatterHand(p);

  const formAdj = clamp(p.form * 1.45, -7.5, 7.5);
  const fatiguePen = Math.max(0, (p.fatigue ?? 0) - 52) * 0.14;
  const rehabPen = Math.min(6, Math.max(0, p.rehabGamesLeft ?? 0) * 0.85);
  const condDelta = formAdj - fatiguePen - rehabPen;

  const ob = p.ootpRatings?.batting;
  const orun = p.ootpRatings?.baserunning;
  const bp = p.battingProfile;
  const baseEff = clamp(p.ability + condDelta, 35, 99);

  // 상대 선발 투수 좌/우 유형에 따른 매치업 스플릿 반영 (강제 조건이 아닌 가중 보정)
  let matchupEdge = 0;
  if (oppStarter) {
    const oppLeft = isPitcherLefty(oppStarter);
    if (ob) {
      const splitVal = oppLeft ? ob.vsLHP.cur : ob.vsRHP.cur;
      const neutralVal = (ob.vsLHP.cur + ob.vsRHP.cur) * 0.5;
      matchupEdge = clamp((splitVal - neutralVal) * 0.55 + (splitVal - 65) * 0.12, -7.5, 7.5);
    } else if (bp) {
      const raw = oppLeft ? bp.vsLeftEdge : bp.vsRightEdge;
      matchupEdge = clamp(raw * 0.65, -6, 6);
    } else {
      if (bats === '양타') matchupEdge = 1.5;
      else if ((bats === '우타' && oppLeft) || (bats === '좌타' && !oppLeft)) matchupEdge = 2.5;
      else matchupEdge = -2.2;
    }
  }

  const trainingBat = p.trainingFocus === '타격' ? 1.5 : 0;
  const trainingSpeed = p.trainingFocus === '주루' ? 3.0 : 0;
  const trainingDef = p.trainingFocus === '수비' ? 3.0 : 0;

  // 1) OOTP 세부 능력치 우선 기반값
  const babipBase = ob ? ob.babip.cur : (p.v18Ratings?.batting?.contact ?? p.ability);
  const avoidKBase = ob ? ob.avoidK.cur : (p.v18Ratings?.batting?.avoid_k ?? p.ability);
  const contactBase = computeDerivedContact(babipBase, avoidKBase);
  const eyeBase = ob ? ob.eye.cur : (p.v18Ratings?.batting?.discipline ?? p.ability);
  const gapBase = ob ? ob.gapPower.cur : (p.v18Ratings?.batting?.power ?? p.ability);
  const hrBase = ob ? ob.hrPower.cur : (p.v18Ratings?.batting?.power ?? p.ability);

  let eye = clamp(eyeBase + condDelta * 0.55 + matchupEdge * 0.35, 25, 99);
  let avoidK = clamp(avoidKBase + condDelta * 0.5 + matchupEdge * 0.4, 25, 99);
  let contact = clamp(contactBase + condDelta * 0.75 + matchupEdge * 0.65 + trainingBat, 25, 99);
  let obp = clamp(eye * 0.48 + babipBase * 0.32 + avoidK * 0.20 + condDelta * 0.65 + matchupEdge * 0.55, 25, 99);
  let gapPower = clamp(gapBase + condDelta * 0.65 + matchupEdge * 0.5 + trainingBat * 0.6, 20, 99);
  let hrPower = clamp(hrBase + condDelta * 0.75 + matchupEdge * 0.65 + trainingBat, 20, 99);
  let slugging = clamp(hrPower * 0.62 + gapPower * 0.38, 20, 99);
  let speed = clamp(
    (orun ? orun.speed : (p.v18Ratings?.batting?.speed ?? Math.max(30, p.ability - 6))) +
      trainingSpeed -
      fatiguePen * 0.5,
    18,
    99
  );
  let baserunning = clamp(
    (orun
      ? orun.baserunning * 0.50 + orun.stealAbility * 0.28 + orun.speed * 0.22
      : speed) +
      trainingSpeed * 0.8 -
      fatiguePen * 0.4,
    18,
    99
  );
  let rbiClutch = clamp(
    slugging * 0.48 +
      contact * 0.30 +
      eye * 0.22 +
      (bp?.rispClutch ?? 0) * 0.9 +
      (p.hiddenTrait === '클러치히터' || p.hiddenTrait === '큰경기강세' ? 4.5 : 0),
    25,
    99
  );
  let overallBat = clamp(
    obp * 0.30 + contact * 0.26 + slugging * 0.32 + avoidK * 0.12,
    25,
    99
  );

  // 2) 시즌 초기(PA < 20)에는 직전 시즌(2024~2026) 실제 성적 경향 소폭 반영 (최대 22%)
  if (pa < 20 && p.historicalSeasons && p.historicalSeasons.length > 0) {
    const latest = [...p.historicalSeasons]
      .filter((r) => (r.PA ?? r.AB ?? 0) >= 80)
      .sort((a, b) => (b.season ?? 0) - (a.season ?? 0))[0];
    if (latest) {
      const hPa = latest.PA ?? latest.AB ?? 0;
      const hAb = latest.AB ?? hPa;
      const hAvg = typeof latest.AVG === 'number' ? latest.AVG : hAb > 0 ? (latest.H ?? 0) / hAb : 0.26;
      const hOps = resolveRecordOps(latest) ?? 0.74;
      const hObp =
        typeof latest.OBP === 'number' && latest.OBP > 0
          ? latest.OBP
          : clamp((latest.H ?? 0 + (latest.BB ?? 0)) / Math.max(1, hPa), 0.22, 0.48);
      const hSlg = typeof latest.SLG === 'number' && latest.SLG > 0 ? latest.SLG : clamp(hOps - hObp, 0.24, 0.72);
      const hHrRate = ((latest.HR ?? 0) / Math.max(1, hPa)) * 520;
      const hKRate = (latest.SO ?? 0) / Math.max(1, hPa);
      const hSbRate = ((latest.SB ?? 0) / Math.max(1, hPa)) * 520;
      const w = 0.20;
      obp = obp * (1 - w) + clamp(46 + (hObp - 0.27) * 245, 32, 98) * w;
      contact = contact * (1 - w) + clamp(46 + (hAvg - 0.21) * 300, 32, 98) * w;
      avoidK = avoidK * (1 - w) + clamp(76 - (hKRate - 0.17) * 165, 30, 98) * w;
      hrPower = hrPower * (1 - w) + clamp(38 + hHrRate * 1.95, 25, 99) * w;
      slugging = slugging * (1 - w) + clamp(42 + (hSlg - 0.30) * 160, 28, 99) * w;
      baserunning = baserunning * (1 - w * 0.6) + clamp(48 + hSbRate * 1.5, 25, 98) * (w * 0.6);
      overallBat = clamp(obp * 0.30 + contact * 0.26 + slugging * 0.32 + avoidK * 0.12, 25, 99);
    }
  }

  // 3) 진행 중인 당해 시즌 실제 성적 반영 (PA >= 15부터 최대 55% 점진 블렌딩)
  if (pa >= 15 && ab >= 10) {
    const w = Math.min(0.55, pa / 190);
    const avg = calcAVG(bs.H, bs.AB) ?? 0.265;
    const liveObp = calcOBP(bs.H, bs.BB, bs.HBP, bs.AB, bs.SF) ?? 0.34;
    const liveSlg = calcSLG(bs.TB, bs.AB) ?? 0.40;
    const liveOps = calcOPS(bs) ?? 0.74;
    const bbRate = (bs.BB ?? 0) / Math.max(1, pa);
    const kRate = (bs.SO ?? 0) / Math.max(1, pa);
    const hrPer520 = ((bs.HR ?? 0) / Math.max(1, pa)) * 520;
    const xbhNonHr = (((bs.B2 ?? 0) + (bs.B3 ?? 0)) / Math.max(1, ab)) * 450;
    const rbiPer520 = ((bs.RBI ?? 0) / Math.max(1, pa)) * 520;
    const sbPer520 = ((bs.SB ?? 0) / Math.max(1, pa)) * 520;

    const obpStat = clamp(45 + (liveObp - 0.27) * 255, 32, 99);
    const eyeStat = clamp(50 + bbRate * 255, 32, 99);
    const avoidKStat = clamp(78 - (kRate - 0.16) * 180, 28, 99);
    const contactStat = clamp(45 + (avg - 0.21) * 310, 32, 99);
    const hrStat = clamp(36 + hrPer520 * 2.05, 22, 99);
    const gapStat = clamp(42 + xbhNonHr * 1.45, 28, 99);
    const slgStat = clamp(42 + (liveSlg - 0.30) * 165, 28, 99);
    const rbiStat = clamp(44 + rbiPer520 * 0.48 + (liveSlg - 0.32) * 85, 32, 99);
    const bsrStat = clamp(48 + sbPer520 * 1.55, 25, 99);
    const overallStat = clamp(44 + (liveOps - 0.58) * 125, 32, 99);

    obp = obp * (1 - w) + obpStat * w;
    eye = eye * (1 - w) + eyeStat * w;
    avoidK = avoidK * (1 - w) + avoidKStat * w;
    contact = contact * (1 - w) + contactStat * w;
    hrPower = hrPower * (1 - w) + hrStat * w;
    gapPower = gapPower * (1 - w) + gapStat * w;
    slugging = slugging * (1 - w) + slgStat * w;
    rbiClutch = rbiClutch * (1 - w) + rbiStat * w;
    baserunning = baserunning * (1 - w * 0.45) + bsrStat * (w * 0.45);
    overallBat = overallBat * (1 - w) + overallStat * w;
  }

  const effDef = computeEffectiveFieldingAtPosition(p, assignedPos);
  const defense = clamp(
    effDef.effectiveFielding + trainingDef + (assignedPos === 'DH' ? -18 : 0),
    20,
    99
  );
  void baseEff;

  return {
    obp: clamp(obp, 15, 99),
    eye: clamp(eye, 15, 99),
    contact: clamp(contact, 15, 99),
    avoidK: clamp(avoidK, 15, 99),
    gapPower: clamp(gapPower, 15, 99),
    hrPower: clamp(hrPower, 15, 99),
    slugging: clamp(slugging, 15, 99),
    speed: clamp(speed, 15, 99),
    baserunning: clamp(baserunning, 15, 99),
    rbiClutch: clamp(rbiClutch, 15, 99),
    overallBat: clamp(overallBat, 15, 99),
    defense,
    bats,
    matchupEdge,
  };
}

/**
 * 주력·주루 능력치는 KBO 선수단 분포(35~72)가 타격 능력치(50~98)보다 좁으므로
 * 타순 적합도 산출 시 동일 스케일(15~99)로 정규화하여 리드오프/9번 연결형 변별력을 확보합니다.
 */
function scaleMobilityForSlot(val: number, pivot = 34, slope = 2.05): number {
  return clamp((val - pivot) * slope + 24, 12, 99);
}

/**
 * 감독 전술 성향 + 1~9번 타순별 역할 가중치 기반 타순 적합도 (0~100, 강제 조건 아닌 연속 가중치)
 */
function scoreBatterForSlot(
  slotOrder: number,
  t: BatterTraitVector,
  tacticalStyle: CoachTacticalStyle = '밸런스'
): number {
  const speedScaled = scaleMobilityForSlot(t.speed, 34, 2.05);
  const bsrScaled = scaleMobilityForSlot(t.baserunning, 38, 1.95);
  // 발이 매우 느린 거포·포수 유형은 1번·9번 기동형 타순 적합도가 자연스럽게 완화됨 (강제 제외가 아닌 연속 감점)
  const slowLeadoffDrag = t.speed < 50 ? (50 - t.speed) * 0.95 : 0;

  let raw: number;
  switch (slotOrder) {
    case 1: {
      // 1번 (테이블 세터): 출루율, 선구안, 주력 및 주루 능력 우선
      if (tacticalStyle === '스몰볼·기동력') {
        raw =
          t.obp * 0.30 +
          t.eye * 0.14 +
          t.contact * 0.12 +
          speedScaled * 0.24 +
          bsrScaled * 0.20 -
          slowLeadoffDrag * 1.15;
      } else if (tacticalStyle === '육성·데이터') {
        raw =
          t.obp * 0.38 +
          t.eye * 0.20 +
          t.contact * 0.14 +
          speedScaled * 0.14 +
          bsrScaled * 0.14 -
          slowLeadoffDrag * 0.75;
      } else if (tacticalStyle === '빅볼·공격야구') {
        raw =
          t.obp * 0.34 +
          t.eye * 0.16 +
          t.gapPower * 0.12 +
          speedScaled * 0.20 +
          bsrScaled * 0.18 -
          slowLeadoffDrag * 0.9;
      } else {
        raw =
          t.obp * 0.34 +
          t.eye * 0.15 +
          t.contact * 0.13 +
          speedScaled * 0.20 +
          bsrScaled * 0.18 -
          slowLeadoffDrag;
      }
      break;
    }
    case 2: {
      // 2번 (테이블 세터): 컨택, 출루율, 삼진 회피 우수 (+ 데이터/빅볼 감독은 강한 2번 장타 가중)
      if (tacticalStyle === '육성·데이터') {
        raw = t.obp * 0.30 + t.contact * 0.24 + t.slugging * 0.24 + t.avoidK * 0.22;
      } else if (tacticalStyle === '스몰볼·기동력') {
        raw = t.contact * 0.32 + t.avoidK * 0.26 + t.obp * 0.24 + bsrScaled * 0.18;
      } else if (tacticalStyle === '빅볼·공격야구') {
        raw = t.contact * 0.28 + t.obp * 0.28 + t.slugging * 0.24 + t.avoidK * 0.20;
      } else {
        raw = t.contact * 0.34 + t.obp * 0.32 + t.avoidK * 0.24 + t.slugging * 0.10;
      }
      break;
    }
    case 3: {
      // 3번 (클린업 트리오): 컨택과 장타력이 모두 우수한 타자
      if (tacticalStyle === '빅볼·공격야구') {
        raw = t.contact * 0.30 + t.slugging * 0.36 + t.hrPower * 0.12 + t.overallBat * 0.22;
      } else {
        raw = t.contact * 0.34 + t.slugging * 0.32 + t.overallBat * 0.24 + t.obp * 0.10;
      }
      break;
    }
    case 4: {
      // 4번 (클린업 트리오): 홈런 파워와 장타력이 뛰어난 핵심 거포 우선
      if (tacticalStyle === '빅볼·공격야구') {
        raw = t.hrPower * 0.44 + t.slugging * 0.28 + t.overallBat * 0.16 + t.rbiClutch * 0.12;
      } else if (tacticalStyle === '스몰볼·기동력') {
        raw = t.hrPower * 0.36 + t.slugging * 0.28 + t.overallBat * 0.20 + t.rbiClutch * 0.16;
      } else {
        raw = t.hrPower * 0.40 + t.slugging * 0.28 + t.overallBat * 0.18 + t.rbiClutch * 0.14;
      }
      break;
    }
    case 5: {
      // 5번 (클린업 트리오): 장타력과 컨택이 우수한 타자
      raw = t.slugging * 0.36 + t.contact * 0.28 + t.rbiClutch * 0.20 + t.hrPower * 0.16;
      break;
    }
    case 6: {
      // 6번 (하위 타선): 남은 타자 중 타격 능력 + 중장거리 생산력
      raw = t.overallBat * 0.44 + t.slugging * 0.30 + t.contact * 0.26;
      break;
    }
    case 7: {
      // 7번 (하위 타선): 타격 능력과 타선 균형
      raw = t.overallBat * 0.46 + t.contact * 0.28 + t.obp * 0.16 + t.defense * 0.10;
      break;
    }
    case 8: {
      // 8번 (하위 타선): 타격·출루·수비 균형
      raw =
        tacticalStyle === '투수전·불펜운용'
          ? t.overallBat * 0.36 + t.obp * 0.22 + t.defense * 0.28 + t.contact * 0.14
          : t.overallBat * 0.42 + t.obp * 0.22 + t.contact * 0.18 + t.defense * 0.18;
      break;
    }
    case 9: {
      // 9번 (하위 타선 · 상위 연결형): 출루 및 주루 능력 고려해 1~2번과 연결
      if (tacticalStyle === '스몰볼·기동력') {
        raw =
          t.obp * 0.28 +
          speedScaled * 0.30 +
          bsrScaled * 0.28 +
          t.contact * 0.14 -
          slowLeadoffDrag * 0.65;
      } else {
        raw =
          t.obp * 0.34 +
          speedScaled * 0.25 +
          bsrScaled * 0.23 +
          t.contact * 0.18 -
          slowLeadoffDrag * 0.55;
      }
      break;
    }
    default:
      raw = t.overallBat;
  }
  return clamp(Math.round(raw * 10) / 10, 0, 100);
}

/**
 * 특정 선수의 특정 타순(1~9번) 적합도(0~100) 공개 평가 API (UI 및 AI 공용)
 */
export function evaluatePlayerSlotSuitability(
  career: CareerSave,
  player: Player,
  slotOrder: number,
  assignedPos?: Position,
  options?: OptimizeLineupOptions
): {
  score: number; // 0..100
  tierLabel: BattingOrderTier;
  reason: string;
} {
  const pos = assignedPos ?? player.position;
  const tacticalStyle =
    options?.tacticalStyleOverride ?? resolveTeamManagerTacticalStyle(career, player.teamId);
  const oppStarter =
    options?.oppStarter !== undefined
      ? options.oppStarter
      : resolveNextOpponentStarter(career, player.teamId);
  const traits = buildBatterTraits(player, pos, oppStarter);
  const score = Math.round(scoreBatterForSlot(slotOrder, traits, tacticalStyle));
  return {
    score,
    tierLabel: getBattingOrderTier(slotOrder),
    reason: buildSlotReason(slotOrder, traits, tacticalStyle),
  };
}

function buildSlotReason(
  slotOrder: number,
  t: BatterTraitVector,
  tacticalStyle: CoachTacticalStyle
): string {
  const splitTag =
    t.matchupEdge >= 2.2
      ? ' · 매치업우세'
      : t.matchupEdge <= -2.2
      ? ' · 역스플릿'
      : '';
  switch (slotOrder) {
    case 1:
      return `출루 ${Math.round(t.obp)} · 선구 ${Math.round(t.eye)} · 주력 ${Math.round(t.speed)} · 주루 ${Math.round(t.baserunning)}${splitTag}`;
    case 2:
      return tacticalStyle === '육성·데이터'
        ? `강한2번(출루 ${Math.round(t.obp)} · 장타 ${Math.round(t.slugging)} · 컨택 ${Math.round(t.contact)} · 삼진회피 ${Math.round(t.avoidK)})${splitTag}`
        : `컨택 ${Math.round(t.contact)} · 출루 ${Math.round(t.obp)} · 삼진회피 ${Math.round(t.avoidK)}${splitTag}`;
    case 3:
      return `컨택 ${Math.round(t.contact)} · 장타 ${Math.round(t.slugging)} · 종합 ${Math.round(t.overallBat)}${splitTag}`;
    case 4:
      return `홈런파워 ${Math.round(t.hrPower)} · 장타 ${Math.round(t.slugging)} · 해결력 ${Math.round(t.rbiClutch)}${splitTag}`;
    case 5:
      return `장타 ${Math.round(t.slugging)} · 컨택 ${Math.round(t.contact)} · 득점권 ${Math.round(t.rbiClutch)}${splitTag}`;
    case 6:
      return `타격 ${Math.round(t.overallBat)} · 장타 ${Math.round(t.slugging)} · 컨택 ${Math.round(t.contact)}${splitTag}`;
    case 7:
      return `타격균형 ${Math.round(t.overallBat)} · 컨택 ${Math.round(t.contact)} · 수비 ${Math.round(t.defense)}`;
    case 8:
      return `균형 ${Math.round(t.overallBat)} · 출루 ${Math.round(t.obp)} · 수비 ${Math.round(t.defense)}`;
    case 9:
      return `상위연결(출루 ${Math.round(t.obp)} · 주력 ${Math.round(t.speed)} · 주루 ${Math.round(t.baserunning)})`;
    default:
      return `종합 ${Math.round(t.overallBat)}`;
  }
}

/**
 * 전체 타선 좌/우 타석 지그재그 균형 보너스 계산 (연속 동일 타석 3명+ 완화, 득점 연결성 향상)
 */
function computeHandednessSynergyScore(orderedTraits: BatterTraitVector[]): number {
  let bonus = 0;
  for (let i = 0; i < orderedTraits.length - 1; i++) {
    const a = orderedTraits[i].bats;
    const b = orderedTraits[i + 1].bats;
    if (a === '양타' || b === '양타') {
      bonus += 0.9;
    } else if (a !== b) {
      // 클린업(3~5번)과 상위(1~5번) 좌우 교차 가치 높음
      bonus += i < 5 ? 1.5 : 0.9;
    } else if (i < orderedTraits.length - 2 && orderedTraits[i + 2].bats === a) {
      // 3연속 동일 타석 소폭 감점 (강제 제약 아닌 미세 가중치)
      bonus -= i < 5 ? 1.4 : 0.7;
    }
  }
  return bonus;
}

/**
 * 이미 선정된 9명의 선발 타자(고유 수비 포지션 확정 상태)에 대해
 * OOTP 세부 능력치·실제 성적·상대 선발·감독 성향·좌우 균형을 종합한 전역 최적 1~9번 타순을 산출합니다.
 */
export function optimizeOrderForFixedNineStarters(
  career: CareerSave,
  teamId: TeamId,
  starters: { player: Player; assignedPos: Position }[],
  options?: OptimizeLineupOptions
): LineupOptimizationResult {
  const n = starters.length;
  const tacticalStyle =
    options?.tacticalStyleOverride ?? resolveTeamManagerTacticalStyle(career, teamId);
  const oppStarter =
    options?.oppStarter !== undefined
      ? options.oppStarter
      : resolveNextOpponentStarter(career, teamId);

  const traitsList = starters.map((s) => buildBatterTraits(s.player, s.assignedPos, oppStarter));

  // 타석 수와 득점 기대치에 비례한 슬롯 중요도 가중치
  // 1~2 테이블세터, 3~5 클린업 트리오(3·4번 핵심 비중 강화로 주포가 5번으로 밀리는 왜곡 방지), 6~8 하위, 9번 연결형
  const slotImportanceWeight =
    tacticalStyle === '육성·데이터'
      ? [1.34, 1.40, 1.44, 1.46, 1.24, 1.00, 0.88, 0.80, 0.85]
      : tacticalStyle === '빅볼·공격야구'
      ? [1.30, 1.34, 1.44, 1.50, 1.26, 1.02, 0.88, 0.80, 0.84]
      : tacticalStyle === '스몰볼·기동력'
      ? [1.40, 1.36, 1.42, 1.44, 1.22, 1.00, 0.88, 0.80, 0.89]
      : [1.35, 1.35, 1.44, 1.48, 1.24, 1.00, 0.88, 0.80, 0.86];

  // Exact Bitmask DP for optimal 1-to-1 assignment across slots 1..n
  const maskCount = 1 << n;
  const dp = new Float64Array(maskCount).fill(-1e12);
  const parentPlayer = new Int8Array(maskCount).fill(-1);
  dp[0] = 0;

  for (let mask = 0; mask < maskCount; mask++) {
    if (dp[mask] <= -1e11) continue;
    let slotIdx = 0;
    let tmp = mask;
    while (tmp > 0) {
      slotIdx += tmp & 1;
      tmp >>= 1;
    }
    if (slotIdx >= n) continue;

    const slotOrder = slotIdx + 1;
    const w = slotImportanceWeight[slotIdx] ?? 1.0;

    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) continue;
      const nextMask = mask | (1 << i);
      const val = dp[mask] + scoreBatterForSlot(slotOrder, traitsList[i], tacticalStyle) * w;
      if (val > dp[nextMask]) {
        dp[nextMask] = val;
        parentPlayer[nextMask] = i;
      }
    }
  }

  // Reconstruct DP assignment
  const assignedIndices: number[] = new Array(n).fill(0);
  let curMask = maskCount - 1;
  for (let slotIdx = n - 1; slotIdx >= 0; slotIdx--) {
    const pIdx = parentPlayer[curMask];
    assignedIndices[slotIdx] = pIdx >= 0 ? pIdx : slotIdx;
    curMask ^= 1 << assignedIndices[slotIdx];
  }

  // Step 2B: 전체 타선 좌/우 균형 & 득점 연결성 2-opt 미세 최적화 (핵심 적합도를 해치지 않는 범위 내)
  const evalTotalObjective = (orderIdxs: number[]): number => {
    let base = 0;
    const orderedTraits: BatterTraitVector[] = [];
    for (let s = 0; s < orderIdxs.length; s++) {
      const tr = traitsList[orderIdxs[s]];
      orderedTraits.push(tr);
      base += scoreBatterForSlot(s + 1, tr, tacticalStyle) * (slotImportanceWeight[s] ?? 1.0);
    }
    return base + computeHandednessSynergyScore(orderedTraits);
  };

  if (n === 9) {
    // 인접 구간 쌍(1-2, 3-4, 4-5, 6-7, 7-8, 6-8) 중 좌우 교차 시너지가 총점을 높이면 채택
    const candidatePairs: [number, number][] = [
      [0, 1],
      [2, 3],
      [3, 4],
      [5, 6],
      [6, 7],
      [5, 7],
    ];
    let bestObj = evalTotalObjective(assignedIndices);
    for (const [a, b] of candidatePairs) {
      const swapped = [...assignedIndices];
      [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
      const obj = evalTotalObjective(swapped);
      if (obj > bestObj + 0.15) {
        assignedIndices[a] = swapped[a];
        assignedIndices[b] = swapped[b];
        bestObj = obj;
      }
    }
  }

  const lineupPositions: Record<string, Position> = {};
  const slots: OptimizedLineupSlot[] = assignedIndices.map((pIdx, slotIdx) => {
    const starter = starters[pIdx];
    const traits = traitsList[pIdx];
    const spec = BATTING_SLOT_SPECS[slotIdx] ?? {
      order: slotIdx + 1,
      tierLabel: getBattingOrderTier(slotIdx + 1),
      roleTitle: '선발 타자',
      keyFactors: '종합 타격',
    };
    lineupPositions[starter.player.id] = starter.assignedPos;
    const score = Math.round(scoreBatterForSlot(spec.order, traits, tacticalStyle));
    return {
      order: spec.order,
      tierLabel: spec.tierLabel,
      roleTitle: spec.roleTitle,
      keyFactors: spec.keyFactors,
      playerId: starter.player.id,
      playerName: starter.player.name,
      naturalPosition: starter.player.position,
      assignedPosition: starter.assignedPos,
      bats: traits.bats,
      ability: starter.player.ability,
      form: starter.player.form,
      slotScore: score,
      reason: buildSlotReason(spec.order, traits, tacticalStyle),
    };
  });

  // 전체 타선 예상 득점 생산력 점수 (0..100)
  const weightedSum = slots.reduce(
    (acc, s, idx) => acc + s.slotScore * (slotImportanceWeight[idx] ?? 1.0),
    0
  );
  const weightDenom = slots.reduce(
    (acc, _, idx) => acc + (slotImportanceWeight[idx] ?? 1.0),
    0
  );
  const synBonus = computeHandednessSynergyScore(assignedIndices.map((i) => traitsList[i]));
  const lineupProductionScore = Math.round(
    clamp(weightDenom > 0 ? weightedSum / weightDenom + synBonus * 0.25 : 50, 0, 100)
  );

  const oppStarterLabel = oppStarter
    ? `${KBO_TEAMS[oppStarter.teamId].shortName} ${oppStarter.name}(${isPitcherLefty(oppStarter) ? '좌투' : '우투'})`
    : undefined;

  const lineupOrder = slots.map((s) => s.playerId);
  const s1 = slots[0];
  const s2 = slots[1];
  const s3 = slots[2];
  const s4 = slots[3];
  const s5 = slots[4];
  const s9 = slots[8];
  const summary = `${KBO_TEAMS[teamId].shortName} 최적 타순(${tacticalStyle}${oppStarterLabel ? ` · vs ${oppStarterLabel}` : ''}): 테이블 ${s1?.playerName ?? '-'}-${s2?.playerName ?? '-'} · 클린업 ${s3?.playerName ?? '-'}-${s4?.playerName ?? '-'}-${s5?.playerName ?? '-'}${s9 ? ` · 9번연결 ${s9.playerName}` : ''} (생산력 ${lineupProductionScore})`;

  return {
    teamId,
    slots,
    lineupOrder,
    lineupPositions,
    tacticalStyle,
    opponentStarterLabel: oppStarterLabel,
    lineupProductionScore,
    summary,
  };
}

/**
 * 1) 멀티 포지션·수비 숙련도·상대 선발 좌/우·감독 성향을 고려해 중복 없는 최적 선발 9명(8수비+DH)을 선정하고
 * 2) 1~9번 타순 적합도(0~100) + 전체 타선 생산력 기반으로 전역 최적 타순을 구성합니다.
 */
export function optimizeBattingLineup(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId,
  options?: OptimizeLineupOptions
): LineupOptimizationResult {
  const tacticalStyle =
    options?.tacticalStyleOverride ?? resolveTeamManagerTacticalStyle(career, teamId);
  const oppStarter =
    options?.oppStarter !== undefined
      ? options.oppStarter
      : resolveNextOpponentStarter(career, teamId);

  const scoreCandidateOffense = (p: Player): number => {
    const tr = buildBatterTraits(p, p.position, oppStarter);
    const youthBonus = tacticalStyle === '육성·데이터' && p.age <= 24 ? 1.8 : 0;
    const speedBonus = tacticalStyle === '스몰볼·기동력' ? (tr.speed - 60) * 0.08 : 0;
    const powerBonus = tacticalStyle === '빅볼·공격야구' ? (tr.hrPower - 60) * 0.09 : 0;
    return tr.overallBat + tr.matchupEdge * 0.45 + youthBonus + speedBonus + powerBonus;
  };

  const pool = Object.values(career.players)
    .filter((p) => isHitterAvailableForLineup(career, p, teamId))
    .sort((a, b) => scoreCandidateOffense(b) - scoreCandidateOffense(a));

  // Step 1: Multi-position optimal 9-man selection (8 unique fielding positions + 1 DH)
  const starters: { player: Player; assignedPos: Position }[] = [];
  const topCandidates = pool.slice(0, Math.min(14, pool.length));
  const allSlots: Position[] = [...UNIQUE_FIELD_POSITIONS, 'DH'];

  const defEmphasis =
    tacticalStyle === '투수전·불펜운용'
      ? 0.30
      : tacticalStyle === '스몰볼·기동력'
      ? 0.26
      : tacticalStyle === '빅볼·공격야구'
      ? 0.17
      : 0.22;

  const scorePlayerAtFieldSlot = (p: Player, slot: Position): number => {
    const batVal = scoreCandidateOffense(p);
    if (slot === 'DH') {
      const defWeight = p.position === 'DH' ? 11.0 : p.position === '1B' || p.position === 'LF' ? 2.8 : 0;
      return batVal * 1.06 + defWeight;
    }
    const prof = getPositionProficiency(p, slot);
    const eff = computeEffectiveFieldingAtPosition(p, slot);
    // 포수 자리는 숙련도 45 미만 강력 억제
    if (slot === 'C' && prof < 45) return -180 + batVal * 0.2;
    const primaryBonus = p.position === slot ? 6.5 : 0;
    const secondaryBonus = p.position !== slot && prof >= 60 ? 2.2 : 0;
    const unfamiliarPenalty = prof < 60 ? (60 - prof) * 0.88 : 0;
    return (
      batVal * 1.0 +
      eff.effectiveFielding * defEmphasis +
      primaryBonus +
      secondaryBonus -
      eff.penalty * 0.9 -
      unfamiliarPenalty
    );
  };

  if (topCandidates.length >= 9) {
    const slotChoices: { idx: number; score: number }[][] = allSlots.map((slot) =>
      topCandidates
        .map((p, idx) => ({ idx, score: scorePlayerAtFieldSlot(p, slot) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(5, topCandidates.length))
    );

    let bestTotal = -1e12;
    let bestAssign: number[] | null = null;
    const curAssign = new Array<number>(9).fill(-1);
    const usedCand = new Array<boolean>(topCandidates.length).fill(false);

    const suffixMax = new Array<number>(10).fill(0);
    for (let s = 8; s >= 0; s--) {
      suffixMax[s] = suffixMax[s + 1] + (slotChoices[s][0]?.score ?? 0);
    }

    const dfs = (slotIdx: number, accScore: number) => {
      if (slotIdx === 9) {
        if (accScore > bestTotal) {
          bestTotal = accScore;
          bestAssign = [...curAssign];
        }
        return;
      }
      if (accScore + suffixMax[slotIdx] <= bestTotal) return;
      for (const ch of slotChoices[slotIdx]) {
        if (usedCand[ch.idx]) continue;
        usedCand[ch.idx] = true;
        curAssign[slotIdx] = ch.idx;
        dfs(slotIdx + 1, accScore + ch.score);
        usedCand[ch.idx] = false;
      }
    };
    dfs(0, 0);

    if (bestAssign) {
      for (let s = 0; s < 9; s++) {
        starters.push({
          player: topCandidates[bestAssign[s]],
          assignedPos: allSlots[s],
        });
      }
    }
  }

  // Fallback if fewer than 9 candidates or backtracking didn't complete
  if (starters.length < 9) {
    starters.length = 0;
    const usedIds = new Set<string>();
    const usedPositions = new Set<Position>();

    for (const fieldPos of UNIQUE_FIELD_POSITIONS) {
      const bestAtPos = pool
        .filter((p) => !usedIds.has(p.id))
        .sort((a, b) => scorePlayerAtFieldSlot(b, fieldPos) - scorePlayerAtFieldSlot(a, fieldPos))[0];
      if (bestAtPos && getPositionProficiency(bestAtPos, fieldPos) >= (fieldPos === 'C' ? 45 : 35)) {
        starters.push({ player: bestAtPos, assignedPos: fieldPos });
        usedIds.add(bestAtPos.id);
        usedPositions.add(fieldPos);
      }
    }

    const bestDh = pool.find((p) => !usedIds.has(p.id));
    if (bestDh && starters.length < 9) {
      starters.push({ player: bestDh, assignedPos: 'DH' });
      usedIds.add(bestDh.id);
      usedPositions.add('DH');
    }

    for (const p of pool) {
      if (starters.length >= 9) break;
      if (usedIds.has(p.id)) continue;
      const openPos = UNIQUE_FIELD_POSITIONS.find((pos) => !usedPositions.has(pos));
      const chosenPos: Position =
        !usedPositions.has(p.position) && p.position !== 'SP' && p.position !== 'RP' && p.position !== 'CL'
          ? p.position
          : openPos ?? (!usedPositions.has('DH') ? 'DH' : UNIQUE_FIELD_POSITIONS[starters.length % UNIQUE_FIELD_POSITIONS.length]);
      starters.push({ player: p, assignedPos: chosenPos });
      usedIds.add(p.id);
      usedPositions.add(chosenPos);
    }
  }

  return optimizeOrderForFixedNineStarters(career, teamId, starters, {
    oppStarter,
    tacticalStyleOverride: tacticalStyle,
  });
}

/**
 * 최적 타순을 구단 라인업에 적용합니다.
 * - 동일 선수 중복, 수비 포지션 중복, 필수 포지션 누락 방지
 * - 현재 선발 투수 로테이션 순번(nextStarterIdx)은 절대 변경하지 않음
 */
export function applyOptimizedBattingLineup(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId,
  options?: OptimizeLineupOptions
): { nextCareer: CareerSave; backupSnapshot: CareerSave; result: LineupOptimizationResult } {
  const backupSnapshot: CareerSave = JSON.parse(JSON.stringify(career));
  const next: CareerSave = JSON.parse(JSON.stringify(career));
  const result = optimizeBattingLineup(next, teamId, options);

  if (result.lineupOrder.length === 0) {
    throw new Error('선발 출전 가능한 1군 야수가 부족하여 타순을 최적화할 수 없습니다.');
  }

  const tState = next.teams[teamId];
  const preservedStarterIdx = tState.nextStarterIdx;
  tState.lineupOrder = [...result.lineupOrder];
  tState.lineupPositions = { ...result.lineupPositions };
  // 타순 적용 시 선발투수 로테이션 순번 절대 보존
  tState.nextStarterIdx = preservedStarterIdx;

  for (const pid of result.lineupOrder) {
    if (next.players[pid]) {
      next.players[pid].gameDayActive = true;
    }
  }

  const allFirstHitters = Object.values(next.players)
    .filter((p) => p.teamId === teamId && p.role === '타자' && p.rosterTier === '1군')
    .map((p) => p.id);
  tState.benchOrder = allFirstHitters.filter((id) => !result.lineupOrder.includes(id));

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, backupSnapshot, result };
}
