import {
  BoxscoreBatterLine,
  BoxscorePitcherLine,
  CareerSave,
  GameWeather,
  Player,
  Position,
  TeamId,
} from '../types/kbo';
import { GameBatterPlan } from './batterUsageEngine';
import { PitcherGamePlan } from './pitchingUsageEngine';
import {
  computeEffectiveFieldingAtPosition,
  getPositionProficiency,
} from './positionEngine';
import { SeededRng } from './rng';

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return (lo + hi) * 0.5;
  return Math.max(lo, Math.min(hi, v));
}

interface BatterSkills {
  babip: number;
  avoidK: number;
  gapPower: number;
  hrPower: number;
  eye: number;
  vsLHP: number;
  vsRHP: number;
  sacBunt: number;
  buntForHit: number;
  speed: number;
  stealTendency: number;
  stealAbility: number;
  baserunning: number;
  batsHand: '우타' | '좌타' | '양타';
}

interface PitcherSkills {
  stuff: number;
  control: number;
  hrPrevent: number;
  hitPrevent: number;
  vsLHB: number;
  vsRHB: number;
  stamina: number;
  holdRunner: number;
  groundballRate: number; // 25..75 (%)
  throwsLeft: boolean;
}

function getBatterSkills(p: Player, formDelta: number, coachEdge: number): BatterSkills {
  const base = num(p.ability, 64);
  const b = p.v18Ratings?.batting;
  const ob = p.ootpRatings?.batting;
  const orun = p.ootpRatings?.baserunning;
  const fatiguePen = Math.max(0, num(p.fatigue, 0) - 52) * 0.11;
  // 부상 복귀 직후 재활·경기 감각 보정(기본 능력치와 별도 관리: rehabGamesLeft 감소에 따라 자연 회복)
  const rehabSharpnessPen = Math.min(6, Math.max(0, num(p.rehabGamesLeft, 0)) * 0.9);
  const adaptPen =
    p.category !== '국내' && num(p.kboAdaptation, 90) < 80
      ? (80 - num(p.kboAdaptation, 80)) * 0.14
      : 0;
  const formAdj =
    clamp(num(p.form, 0) * 1.1 + formDelta * 0.45 + coachEdge, -8, 8) -
    fatiguePen -
    rehabSharpnessPen -
    adaptPen;
  const focusBat = p.trainingFocus === '타격' ? 1.4 : 0;
  const focusRun = p.trainingFocus === '주루' ? 2.0 : 0;
  const batsHand: '우타' | '좌타' | '양타' =
    p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : p.bats === 'R' ? '우타' : (p.battingProfile?.bats ?? '우타');

  return {
    babip: clamp(num(ob?.babip.cur, num(b?.contact, base)) + formAdj + focusBat, 22, 99),
    avoidK: clamp(num(ob?.avoidK.cur, num(b?.avoid_k, base)) + formAdj * 0.75 + focusBat * 0.5, 22, 99),
    gapPower: clamp(num(ob?.gapPower.cur, num(b?.power, base)) + formAdj * 0.75 + focusBat * 0.6, 20, 99),
    hrPower: clamp(num(ob?.hrPower.cur, num(b?.power, base)) + formAdj * 0.85 + focusBat, 20, 99),
    eye: clamp(num(ob?.eye.cur, num(b?.discipline, base)) + formAdj * 0.7, 22, 99),
    vsLHP: clamp(num(ob?.vsLHP.cur, base), 22, 99),
    vsRHP: clamp(num(ob?.vsRHP.cur, base), 22, 99),
    sacBunt: clamp(num(ob?.sacBunt, 55), 15, 99),
    buntForHit: clamp(num(ob?.buntForHit, 45), 15, 99),
    speed: clamp(num(orun?.speed, num(b?.speed, base)) + focusRun - fatiguePen * 0.4, 20, 99),
    stealTendency: clamp(num(orun?.stealTendency, num(b?.steal_production, 48)) + focusRun * 0.6, 10, 99),
    stealAbility: clamp(num(orun?.stealAbility, num(b?.steal_production, base)) + focusRun, 15, 99),
    baserunning: clamp(num(orun?.baserunning, num(b?.speed, base)) + focusRun * 0.8, 20, 99),
    batsHand,
  };
}

function getPitcherSkills(
  p: Player,
  formDelta: number,
  coachEdge: number,
  livePitchCount: number,
  isStarter: boolean
): PitcherSkills {
  const base = num(p.ability, 64);
  const pt = p.v18Ratings?.pitching;
  const opt = p.ootpRatings?.pitching;
  const preFatiguePen = num(p.fatigue, 0) * 0.12 + Math.max(0, num(p.fatigue, 0) - 50) * 0.1;
  // 부상 복귀 직후 재활·경기 감각 보정(기본 능력치와 별도 관리: 경기 등판/시간 경과로 자동 회복)
  const rehabSharpnessPen = Math.min(6, Math.max(0, num(p.rehabGamesLeft, 0)) * 0.9);
  const adaptPen =
    p.category !== '국내' && num(p.kboAdaptation, 90) < 80
      ? (80 - num(p.kboAdaptation, 80)) * 0.15
      : 0;
  const stamina = clamp(
    num(opt?.stamina, num(pt?.stamina_proxy, num(p.pitchRepertoire?.stamina, isStarter ? 68 : 48))),
    30,
    99
  );
  // 실시간 투구 수 누적에 따른 경기 중 체력 저하 (선발 78~104구, 불펜 18~34구 이후 구위·제구 자연 저하)
  const freshLimit = isStarter
    ? clamp(72 + (stamina - 50) * 0.55 - num(p.fatigue, 0) * 0.25, 62, 102)
    : clamp(18 + (stamina - 45) * 0.25 - num(p.fatigue, 0) * 0.12, 14, 34);
  const liveFatiguePen = Math.max(0, livePitchCount - freshLimit) * (isStarter ? 0.32 : 0.55);

  const focusStuff = p.trainingFocus === '구위' ? 1.5 : 0;
  const focusCtrl = p.trainingFocus === '제구' ? 1.5 : 0;
  const formAdj =
    clamp(num(p.form, 0) * 1.05 + formDelta * 0.45 + coachEdge, -8, 8) -
    preFatiguePen -
    rehabSharpnessPen -
    adaptPen -
    liveFatiguePen;

  // 구종 완성도(상위 구종)를 구위(Stuff) 축에 1회 통합 반영 (중복 반영 방지)
  let arsenalEdge = 0;
  if (opt && opt.pitches.length > 0) {
    const sorted = [...opt.pitches].map((x) => x.cur).sort((a, b) => b - a);
    const topAvg =
      isStarter && sorted.length >= 3
        ? sorted[0] * 0.45 + sorted[1] * 0.32 + sorted[2] * 0.23
        : sorted.length >= 2
        ? sorted[0] * 0.58 + sorted[1] * 0.42
        : sorted[0];
    arsenalEdge = clamp((topAvg - opt.stuff.cur) * 0.25, -4, 4);
  }
  const throwsLeft =
    p.pitchRepertoire?.throws === '좌투' || p.throws === 'L';

  return {
    stuff: clamp(num(opt?.stuff.cur, num(pt?.stuff, base)) + arsenalEdge + formAdj + focusStuff, 22, 99),
    control: clamp(num(opt?.control.cur, num(pt?.control, num(p.pitchRepertoire?.command, base))) + formAdj + focusCtrl, 22, 99),
    hrPrevent: clamp(num(opt?.hrPrevent.cur, num(pt?.hr_prevention, base)) + formAdj * 0.85, 22, 99),
    hitPrevent: clamp(num(opt?.hitPrevent.cur, num(pt?.run_prevention, base)) + formAdj * 0.9, 22, 99),
    vsLHB: clamp(num(opt?.vsLHB.cur, base), 22, 99),
    vsRHB: clamp(num(opt?.vsRHB.cur, base), 22, 99),
    stamina,
    holdRunner: clamp(num(opt?.holdRunner, 60), 20, 99),
    groundballRate: clamp(num(opt?.groundballRate, 49), 28, 72),
    throwsLeft,
  };
}

interface RunnerOnBase {
  batterId: string;
  responsiblePitcherId: string;
  isEarned: boolean;
  speed: number;
  stealTendency: number;
  stealAbility: number;
  baserunning: number;
}

interface ActivePitcherRuntime {
  player: Player;
  line: BoxscorePitcherLine;
  enteredInning: number;
  enteredScoreDiff: number; // own - opp when entered
  wasSaveSituation: boolean;
  runsInCurrentInning: number;
  blownSaveRecorded: boolean;
}

interface SideRuntime {
  teamId: TeamId;
  activeLineup: { player: Player; pos: Position; slotIndex: number }[];
  removedIds: Set<string>;
  benchPool: Player[];
  batterMap: Map<string, BoxscoreBatterLine>;
  batterOrder: string[];
  nextSlotIdx: number;
  inGameInjuredIds: string[];
  substitutionNotes: string[];
  // Pitching side
  starter: Player;
  relieversPool: Player[];
  usedPitcherIds: Set<string>;
  pitchers: ActivePitcherRuntime[];
  currentPitcher: ActivePitcherRuntime;
  pitcherOfRecordForLeadId: string | null;
  pitcherOfRecordForLossId: string | null;
  errors: number;
}

function createEmptyBatterLine(
  p: Player,
  pos: Position,
  orderSlot: number,
  isStarter: boolean,
  enteredInning: number,
  subRole?: BoxscoreBatterLine['subRole'],
  replacedPlayer?: Player
): BoxscoreBatterLine {
  return {
    playerId: p.id,
    name: p.name,
    position: pos,
    battingOrder: orderSlot,
    isSubstitute: !isStarter,
    subRole: isStarter ? undefined : subRole,
    enteredInning,
    replacedPlayerId: !isStarter ? replacedPlayer?.id : undefined,
    replacedPlayerName: !isStarter ? replacedPlayer?.name : undefined,
    PA: 0,
    AB: 0,
    H: 0,
    B2: 0,
    B3: 0,
    HR: 0,
    BB: 0,
    HBP: 0,
    SF: 0,
    SO: 0,
    R: 0,
    RBI: 0,
    SB: 0,
    TB: 0,
  };
}

function createEmptyPitcherLine(p: Player, isStarter: boolean, starterUsageType?: Player['starterUsageType']): BoxscorePitcherLine {
  return {
    playerId: p.id,
    name: p.name,
    GS: isStarter ? 1 : 0,
    outs: 0,
    H: 0,
    BB: 0,
    SO: 0,
    ER: 0,
    R: 0,
    HR: 0,
    PC: 0,
    W: 0,
    L: 0,
    HLD: 0,
    SV: 0,
    BS: 0,
    QS: 0,
    QSP: 0,
    CG: 0,
    SHO: 0,
    NH: 0,
    PG: 0,
    pitchRoleUsed: isStarter ? '선발' : p.pitchRole ?? '중간',
    starterUsageType: isStarter ? starterUsageType ?? '정규선발' : undefined,
  };
}

function initSideRuntime(
  teamId: TeamId,
  batPlan: GameBatterPlan,
  pitchPlan: PitcherGamePlan
): SideRuntime {
  const activeLineup = batPlan.starters.map((slot, idx) => ({
    player: slot.player,
    pos: slot.position ?? slot.player.position,
    slotIndex: idx,
  }));
  const batterMap = new Map<string, BoxscoreBatterLine>();
  const batterOrder: string[] = [];
  for (const item of activeLineup) {
    const line = createEmptyBatterLine(item.player, item.pos, item.slotIndex + 1, true, 1);
    batterMap.set(item.player.id, line);
    batterOrder.push(item.player.id);
  }

  const starterLine = createEmptyPitcherLine(pitchPlan.starter, true, pitchPlan.starterUsageType);
  const starterRt: ActivePitcherRuntime = {
    player: pitchPlan.starter,
    line: starterLine,
    enteredInning: 1,
    enteredScoreDiff: 0,
    wasSaveSituation: false,
    runsInCurrentInning: 0,
    blownSaveRecorded: false,
  };

  return {
    teamId,
    activeLineup,
    removedIds: new Set<string>(),
    benchPool: [...batPlan.bench],
    batterMap,
    batterOrder,
    nextSlotIdx: 0,
    inGameInjuredIds: [],
    substitutionNotes: [...(batPlan.rotationNotes ?? [])],
    starter: pitchPlan.starter,
    relieversPool: [...pitchPlan.relievers],
    usedPitcherIds: new Set<string>([pitchPlan.starter.id]),
    pitchers: [starterRt],
    currentPitcher: starterRt,
    pitcherOfRecordForLeadId: null,
    pitcherOfRecordForLossId: null,
    errors: 0,
  };
}

function isSaveSituation(inning: number, scoreDiff: number, runnersCount: number): boolean {
  if (scoreDiff <= 0) return false;
  if (inning >= 7 && scoreDiff <= 3) return true;
  if (scoreDiff <= runnersCount + 2) return true;
  return false;
}

function selectNextReliever(
  defSide: SideRuntime,
  inning: number,
  ownScore: number,
  oppScore: number
): Player | null {
  const available = defSide.relieversPool.filter((r) => !defSide.usedPitcherIds.has(r.id));
  if (available.length === 0) return null;

  const diff = ownScore - oppScore;
  const pickByRole = (roles: string[]): Player | undefined =>
    available.find((r) => roles.includes(r.pitchRole ?? '') || (roles.includes('마무리') && r.position === 'CL'));

  // 9회+ 리드 1~3점 또는 동점: 마무리 우선 투입
  if (inning >= 9 && diff >= 0 && diff <= 3) {
    return pickByRole(['마무리']) ?? pickByRole(['필승조', '셋업맨']) ?? available[0];
  }
  // 7~8회 3점 이내 접전: 필승조/셋업맨 투입
  if (inning >= 7 && Math.abs(diff) <= 3) {
    return pickByRole(['필승조', '셋업맨']) ?? pickByRole(['중간', '중간계투']) ?? available[0];
  }
  // 5회 이전 조기 강판: 롱릴리프 우선 투입
  if (inning <= 5) {
    return pickByRole(['롱릴리프']) ?? pickByRole(['추격조', '중간', '중간계투']) ?? available[0];
  }
  // 점수 차 큰 경기: 추격조/중간계투 투입 (필승조·마무리 아낌)
  return pickByRole(['추격조', '중간', '중간계투', '롱릴리프']) ?? available[available.length - 1];
}

function shouldHookCurrentPitcher(
  pitcherRt: ActivePitcherRuntime,
  inning: number,
  outs: number,
  ownScore: number,
  oppScore: number,
  hasRelieverAvailable: boolean,
  isPostseason: boolean
): boolean {
  if (!hasRelieverAvailable) return false;
  const isStarter = pitcherRt.line.GS === 1;
  const pc = pitcherRt.line.PC;
  const opt = pitcherRt.player.ootpRatings?.pitching;
  const stamina = num(opt?.stamina, num(pitcherRt.player.v18Ratings?.pitching?.stamina_proxy, isStarter ? 68 : 48));
  const starterFitAdj = isStarter && opt ? clamp((opt.starterFit - 68) * 0.18, -8, 5) : 0;
  const preFatigue = num(pitcherRt.player.fatigue, 0);
  const diff = ownScore - oppScore;

  if (isStarter) {
    const pitchCap = clamp(
      Math.round(88 + (stamina - 50) * 0.45 + starterFitAdj - preFatigue * 0.25 + (isPostseason ? 6 : 0)),
      72,
      114
    );
    // 이닝 종료 시점 (outs === 0, 다음 이닝 시작 전 판단)
    if (outs === 0) {
      if (pc >= pitchCap - 6) return true;
      if (inning >= 7 && Math.abs(diff) <= 3 && pc >= pitchCap - 16) return true;
      if (inning >= 8 && Math.abs(diff) <= 3 && pc >= 78) return true;
      if (pitcherRt.line.R >= 5 && inning >= 5) return true;
      if (pitcherRt.line.R >= 6) return true;
      return false;
    }
    // 이닝 도중 강판 조건
    if (pc >= pitchCap + 8) return true;
    if (pitcherRt.runsInCurrentInning >= 4 && pc >= 50) return true;
    if (pitcherRt.line.R >= 6 && pc >= 55) return true;
    return false;
  }

  // 불펜 투수 교체 판단
  const isLong = pitcherRt.player.pitchRole === '롱릴리프';
  const isCloser = pitcherRt.player.pitchRole === '마무리' || pitcherRt.player.position === 'CL';
  const relieverMaxPitches = isLong ? 48 : isCloser ? 30 : 28;
  const maxOuts = isLong ? 7 : isCloser ? 4 : 4;

  if (outs === 0) {
    // 9회 세이브 상황에서 비마무리 투수가 올라와 있다면 마무리로 교체
    if (inning >= 9 && diff > 0 && diff <= 3 && !isCloser) return true;
    if (pitcherRt.line.outs >= maxOuts || pc >= relieverMaxPitches - 4) return true;
    if (pitcherRt.line.R >= 2) return true;
    return false;
  }
  if (pc >= relieverMaxPitches + 8) return true;
  if (pitcherRt.runsInCurrentInning >= 3) return true;
  return false;
}

function bringInReliever(
  defSide: SideRuntime,
  inning: number,
  ownScore: number,
  oppScore: number,
  runnersCount: number
): boolean {
  const nextRel = selectNextReliever(defSide, inning, ownScore, oppScore);
  if (!nextRel) return false;
  defSide.usedPitcherIds.add(nextRel.id);
  const line = createEmptyPitcherLine(nextRel, false);
  const rt: ActivePitcherRuntime = {
    player: nextRel,
    line,
    enteredInning: inning,
    enteredScoreDiff: ownScore - oppScore,
    wasSaveSituation: isSaveSituation(inning, ownScore - oppScore, runnersCount),
    runsInCurrentInning: 0,
    blownSaveRecorded: false,
  };
  defSide.pitchers.push(rt);
  defSide.currentPitcher = rt;
  return true;
}

function maybePinchHit(
  batSide: SideRuntime,
  slotIdx: number,
  inning: number,
  ownScore: number,
  oppScore: number,
  runnersCount: number,
  rng: SeededRng
): void {
  if (inning < 7 || batSide.benchPool.length === 0) return;
  const curSlot = batSide.activeLineup[slotIdx];
  if (!curSlot) return;
  const curPlayer = curSlot.player;
  const diff = ownScore - oppScore;

  // 접전 후반(7~9회+, -3..+1점, 주자 있음) 하위 타선 또는 피로한 타자 대타 교체
  const isCloseClutch = Math.abs(diff) <= 3 && diff <= 1 && (runnersCount > 0 || inning >= 8) && slotIdx >= 5;
  // 대량 점수차(7점 이상, 8회+) 후보 선수 실전 기회 부여
  const isBlowout = Math.abs(diff) >= 7 && inning >= 8;

  if (!isCloseClutch && !isBlowout) return;
  if (isCloseClutch && rng.next() > 0.34) return;
  if (isBlowout && rng.next() > 0.25) return;

  const candidates = batSide.benchPool.filter((b) => !batSide.removedIds.has(b.id) && !b.injury);
  if (candidates.length === 0) return;

  // 수비 이닝을 이어받아야 하므로 주/보조 포지션 숙련도와 타격력을 함께 고려해 대타 후보 선정
  candidates.sort((a, b) => {
    const profA = curSlot.pos === 'DH' ? 88 : getPositionProficiency(a, curSlot.pos);
    const profB = curSlot.pos === 'DH' ? 88 : getPositionProficiency(b, curSlot.pos);
    const penA = curSlot.pos === 'C' && profA < 45 ? -40 : profA < 45 ? -10 : 0;
    const penB = curSlot.pos === 'C' && profB < 45 ? -40 : profB < 45 ? -10 : 0;
    if (isBlowout) {
      return (a.age - penA * 0.25) - (b.age - penB * 0.25);
    }
    return (b.ability + penB + profB * 0.08) - (a.ability + penA + profA * 0.08);
  });
  const sub = candidates[0];
  if (curSlot.pos === 'C' && getPositionProficiency(sub, 'C') < 45) return;
  if (isCloseClutch && sub.ability < curPlayer.ability - 2 && curPlayer.fatigue < 65) return;

  // 재출전 금지: 기존 타자 영구 제외, 교체 타자 타순 승계
  batSide.removedIds.add(curPlayer.id);
  batSide.benchPool = batSide.benchPool.filter((b) => b.id !== sub.id);
  batSide.activeLineup[slotIdx] = {
    player: sub,
    pos: curSlot.pos,
    slotIndex: slotIdx,
  };
  if (!batSide.batterMap.has(sub.id)) {
    const line = createEmptyBatterLine(sub, curSlot.pos, slotIdx + 1, false, inning, '대타', curPlayer);
    batSide.batterMap.set(sub.id, line);
    batSide.batterOrder.push(sub.id);
  }
  batSide.substitutionNotes.push(
    `${inning}회 대타: ${curPlayer.name} → ${sub.name} (${isBlowout ? '점수차 여유 기용' : '승부처 대타'})`
  );
}

function maybeDefensiveSub(
  defSide: SideRuntime,
  inning: number,
  ownScore: number,
  oppScore: number,
  rng: SeededRng
): void {
  if (inning < 8 || defSide.benchPool.length === 0) return;
  const diff = ownScore - oppScore;
  if (diff < 1 || diff > 3) return;
  if (rng.next() > 0.22) return;

  // 수비력이 가장 낮은 주전(DH 제외 · 포지션 숙련도 페널티 반영) 1명을 주/보조 포지션 수비형 벤치 선수로 교체
  const fieldSlots = defSide.activeLineup.filter((s) => s.pos !== 'DH');
  fieldSlots.sort(
    (a, b) =>
      computeEffectiveFieldingAtPosition(a.player, a.pos).effectiveFielding -
      computeEffectiveFieldingAtPosition(b.player, b.pos).effectiveFielding
  );
  const weakSlot = fieldSlots[0];
  if (!weakSlot) return;

  const weakDef = computeEffectiveFieldingAtPosition(weakSlot.player, weakSlot.pos).effectiveFielding;
  const sub = defSide.benchPool
    .filter(
      (b) =>
        !defSide.removedIds.has(b.id) &&
        !b.injury &&
        getPositionProficiency(b, weakSlot.pos) >= (weakSlot.pos === 'C' ? 60 : 55)
    )
    .sort(
      (a, b) =>
        computeEffectiveFieldingAtPosition(b, weakSlot.pos).effectiveFielding -
        computeEffectiveFieldingAtPosition(a, weakSlot.pos).effectiveFielding
    )[0];
  if (!sub) return;
  const subDef = computeEffectiveFieldingAtPosition(sub, weakSlot.pos).effectiveFielding;
  if (subDef < weakDef + 4) return;

  defSide.removedIds.add(weakSlot.player.id);
  defSide.benchPool = defSide.benchPool.filter((b) => b.id !== sub.id);
  defSide.activeLineup[weakSlot.slotIndex] = {
    player: sub,
    pos: weakSlot.pos,
    slotIndex: weakSlot.slotIndex,
  };
  if (!defSide.batterMap.has(sub.id)) {
    const line = createEmptyBatterLine(sub, weakSlot.pos, weakSlot.slotIndex + 1, false, inning, '대수비', weakSlot.player);
    defSide.batterMap.set(sub.id, line);
    defSide.batterOrder.push(sub.id);
  }
  defSide.substitutionNotes.push(`${inning}회 대수비: ${weakSlot.player.name} → ${sub.name} (${weakSlot.pos})`);
}

export interface RealisticGameSimInput {
  career: CareerSave;
  awayTeam: TeamId;
  homeTeam: TeamId;
  awayBatPlan: GameBatterPlan;
  homeBatPlan: GameBatterPlan;
  awayPitchPlan: PitcherGamePlan;
  homePitchPlan: PitcherGamePlan;
  awayCoachEdge: { battingEdge: number; pitchingEdge: number };
  homeCoachEdge: { battingEdge: number; pitchingEdge: number };
  parkFactor: number;
  weather: GameWeather;
  envRunMult: number;
  ruleMods: { runEnvMultiplier: number; extraInningCap: number; hasTiebreaker: boolean };
  round: number;
  isPostseason: boolean;
  getPerfDelta: (p: Player, oppTeam: TeamId, isHome: boolean, oppPitcher?: Player) => number;
  rng: SeededRng;
}

export interface RealisticGameSimResult {
  awayInnings: number[];
  homeInnings: (number | null)[];
  awayRuns: number;
  homeRuns: number;
  awayHits: number;
  homeHits: number;
  awayErrors: number;
  homeErrors: number;
  awayBatters: BoxscoreBatterLine[];
  homeBatters: BoxscoreBatterLine[];
  awayPitchers: BoxscorePitcherLine[];
  homePitchers: BoxscorePitcherLine[];
  awayInGameInjuredIds: string[];
  homeInGameInjuredIds: string[];
  substitutionNotes: string[];
  isWalkOff: boolean;
}

/**
 * 실제 야구 규칙 기반 타석(PA) 단위 경기 시뮬레이션 엔진.
 * - 매 경기 0:0 초기화, 3아웃 이닝 정상 종료 및 주자/아웃카운트 초기화
 * - 타자·투수 세부 능력치(컨택·파워·선구안·삼진억제·주력·수비 / 구위·제구·피홈런억제·실점억제·스태미나)
 * - 실시간 투구 수 체력 저하, 선발/불펜 교체, 대타/대수비 교체(재출전 금지)
 * - KBO 최근 3시즌(2024~2026) 통계 분포 기반 확률 보정 (인위적 점수 축소/상한 없음)
 * - 이닝별 득점, 최종 점수, 개인 타격/투구 기록의 100% 수학적 일치 보장
 */
export function simulateRealisticBaseballGame(
  input: RealisticGameSimInput
): RealisticGameSimResult {
  const {
    awayTeam,
    homeTeam,
    awayBatPlan,
    homeBatPlan,
    awayPitchPlan,
    homePitchPlan,
    awayCoachEdge,
    homeCoachEdge,
    parkFactor,
    weather,
    envRunMult,
    ruleMods,
    isPostseason,
    getPerfDelta,
    rng,
  } = input;

  const away = initSideRuntime(awayTeam, awayBatPlan, awayPitchPlan);
  const home = initSideRuntime(homeTeam, homeBatPlan, homePitchPlan);

  const awayInnings: number[] = [];
  const homeInnings: (number | null)[] = [];
  let awayRuns = 0;
  let homeRuns = 0;
  let isWalkOff = false;

  // 경기 중 리드 변화 추적 (승리·패전 투수 정확한 판정용)
  let prevLeadSide: 'AWAY' | 'HOME' | 'TIE' = 'TIE';
  let awayGoAheadPitcherId: string | null = null;
  let homeGoAheadPitcherId: string | null = null;
  let awayLosingPitcherId: string | null = null;
  let homeLosingPitcherId: string | null = null;

  const safePark = clamp(num(parkFactor, 1.0), 0.86, 1.16);
  const safeEnv = clamp(num(envRunMult, 1.0) * num(ruleMods.runEnvMultiplier, 1.0), 0.93, 1.07);
  const safeHrMult = clamp(num(weather?.hrMult, 1.0), 0.82, 1.2);
  const weatherCtrlDelta = clamp(num(weather?.pitchControlDelta, 0), -4, 4);

  const getTeamDefenseMetrics = (
    side: SideRuntime
  ): {
    avgDefense: number;
    errorRateMult: number;
    infieldRange: number;
    infieldError: number;
    infieldArm: number;
    turnDP: number;
    outfieldRange: number;
    outfieldError: number;
    outfieldArm: number;
    catcherBlocking: number;
    catcherFraming: number;
    catcherArm: number;
  } => {
    const fielders = side.activeLineup.filter((s) => s.pos !== 'DH');
    if (fielders.length === 0) {
      return {
        avgDefense: 65,
        errorRateMult: 1.0,
        infieldRange: 64,
        infieldError: 64,
        infieldArm: 64,
        turnDP: 64,
        outfieldRange: 64,
        outfieldError: 64,
        outfieldArm: 64,
        catcherBlocking: 64,
        catcherFraming: 64,
        catcherArm: 64,
      };
    }
    let sumDef = 0;
    let sumErrMult = 0;
    let ifR = 0, ifE = 0, ifA = 0, ifDP = 0, ifCnt = 0;
    let ofR = 0, ofE = 0, ofA = 0, ofCnt = 0;
    let cBlk = 64, cFrm = 64, cArm = 64;

    for (const s of fielders) {
      const eff = computeEffectiveFieldingAtPosition(s.player, s.pos);
      sumDef += eff.effectiveFielding;
      sumErrMult += eff.errorRateMult;
      const d = s.player.ootpRatings?.defense;
      const pen = eff.penalty;
      if (s.pos === 'C') {
        cBlk = clamp((d?.catcherBlocking ?? eff.baseFielding) - pen * 0.8, 20, 99);
        cFrm = clamp((d?.catcherFraming ?? eff.baseFielding) - pen * 0.8, 20, 99);
        cArm = clamp((d?.catcherArm ?? eff.baseFielding) - pen * 0.8, 20, 99);
      } else if (s.pos === '1B' || s.pos === '2B' || s.pos === '3B' || s.pos === 'SS') {
        ifR += clamp((d?.infieldRange ?? eff.baseFielding) - pen, 20, 99);
        ifE += clamp((d?.infieldError ?? eff.baseFielding) - pen * 0.9, 20, 99);
        ifA += clamp((d?.infieldArm ?? eff.baseFielding) - pen * 0.6, 20, 99);
        ifDP += clamp((d?.turnDP ?? eff.baseFielding) - pen * 0.8, 20, 99);
        ifCnt += 1;
      } else if (s.pos === 'LF' || s.pos === 'CF' || s.pos === 'RF') {
        ofR += clamp((d?.outfieldRange ?? eff.baseFielding) - pen, 20, 99);
        ofE += clamp((d?.outfieldError ?? eff.baseFielding) - pen * 0.9, 20, 99);
        ofA += clamp((d?.outfieldArm ?? eff.baseFielding) - pen * 0.6, 20, 99);
        ofCnt += 1;
      }
    }
    return {
      avgDefense: sumDef / fielders.length,
      errorRateMult: sumErrMult / fielders.length,
      infieldRange: ifCnt > 0 ? ifR / ifCnt : 64,
      infieldError: ifCnt > 0 ? ifE / ifCnt : 64,
      infieldArm: ifCnt > 0 ? ifA / ifCnt : 64,
      turnDP: ifCnt > 0 ? ifDP / ifCnt : 64,
      outfieldRange: ofCnt > 0 ? ofR / ofCnt : 64,
      outfieldError: ofCnt > 0 ? ofE / ofCnt : 64,
      outfieldArm: ofCnt > 0 ? ofA / ofCnt : 64,
      catcherBlocking: cBlk,
      catcherFraming: cFrm,
      catcherArm: cArm,
    };
  };

  const getPitcherLineById = (defSide: SideRuntime, pid: string): BoxscorePitcherLine => {
    const found = defSide.pitchers.find((x) => x.player.id === pid);
    return found ? found.line : defSide.currentPitcher.line;
  };

  const recordRunScored = (
    batSide: SideRuntime,
    defSide: SideRuntime,
    isHomeBatting: boolean,
    runner: RunnerOnBase,
    batterLine: BoxscoreBatterLine,
    creditRbi: boolean
  ) => {
    const runnerLine = batSide.batterMap.get(runner.batterId);
    if (runnerLine) runnerLine.R += 1;
    if (creditRbi) batterLine.RBI += 1;

    const respPitcherLine = getPitcherLineById(defSide, runner.responsiblePitcherId);
    respPitcherLine.R += 1;
    if (runner.isEarned) respPitcherLine.ER += 1;
    defSide.currentPitcher.runsInCurrentInning += 1;

    if (isHomeBatting) homeRuns += 1;
    else awayRuns += 1;

    // 블론세이브 판정: 세이브 상황에 등판한 불펜 투수가 동점 또는 역전을 허용한 경우
    const curP = defSide.currentPitcher;
    if (curP.wasSaveSituation && !curP.blownSaveRecorded && curP.line.GS === 0) {
      const defNow = isHomeBatting ? awayRuns : homeRuns;
      const offNow = isHomeBatting ? homeRuns : awayRuns;
      if (defNow <= offNow) {
        curP.line.BS = (curP.line.BS ?? 0) + 1;
        curP.blownSaveRecorded = true;
      }
    }

    // 리드 전환 시 승리·패전 책임 투수 갱신
    const newLead: 'AWAY' | 'HOME' | 'TIE' =
      awayRuns > homeRuns ? 'AWAY' : homeRuns > awayRuns ? 'HOME' : 'TIE';
    if (newLead !== prevLeadSide) {
      if (newLead === 'AWAY') {
        awayGoAheadPitcherId = away.currentPitcher.player.id;
        homeLosingPitcherId = runner.responsiblePitcherId;
      } else if (newLead === 'HOME') {
        homeGoAheadPitcherId = home.currentPitcher.player.id;
        awayLosingPitcherId = runner.responsiblePitcherId;
      } else {
        // 동점이 되면 이전 결승 리드 초기화
        awayGoAheadPitcherId = null;
        homeGoAheadPitcherId = null;
        awayLosingPitcherId = null;
        homeLosingPitcherId = null;
      }
      prevLeadSide = newLead;
    }
  };

  const simulateHalfInning = (
    inning: number,
    isHomeBatting: boolean,
    isTiebreakerInning: boolean
  ): number => {
    const batSide = isHomeBatting ? home : away;
    const defSide = isHomeBatting ? away : home;
    const batCoach = isHomeBatting ? homeCoachEdge : awayCoachEdge;
    const defCoach = isHomeBatting ? awayCoachEdge : homeCoachEdge;
    const batTeamId = batSide.teamId;
    const defTeamId = defSide.teamId;

    // 이닝 시작 전 수비 교체 및 투수 교체 점검
    const defScoreStart = isHomeBatting ? awayRuns : homeRuns;
    const batScoreStart = isHomeBatting ? homeRuns : awayRuns;
    defSide.currentPitcher.runsInCurrentInning = 0;

    if (inning >= 2) {
      maybeDefensiveSub(defSide, inning, defScoreStart, batScoreStart, rng);
      const hasMoreRelievers = defSide.relieversPool.some(
        (r) => !defSide.usedPitcherIds.has(r.id)
      );
      if (
        shouldHookCurrentPitcher(
          defSide.currentPitcher,
          inning,
          0,
          defScoreStart,
          batScoreStart,
          hasMoreRelievers,
          isPostseason
        )
      ) {
        bringInReliever(defSide, inning, defScoreStart, batScoreStart, 0);
      }
    }

    // 3아웃 이닝 상태 초기화 (주자 및 아웃카운트 완전 리셋)
    let outs = 0;
    let base1: RunnerOnBase | null = null;
    let base2: RunnerOnBase | null = null;
    let base3: RunnerOnBase | null = null;
    let inningRuns = 0;
    let errorOccurredThisInning = false;
    let virtualOutsWithoutError = 0;

    // 연장 승부치기(채택 시 10회+) 무사 1·2루 배치
    if (isTiebreakerInning) {
      const prev1 = batSide.activeLineup[(batSide.nextSlotIdx + 8) % 9]?.player;
      const prev2 = batSide.activeLineup[(batSide.nextSlotIdx + 7) % 9]?.player;
      const makeTieRunner = (pl: Player): RunnerOnBase => ({
        batterId: pl.id,
        responsiblePitcherId: defSide.currentPitcher.player.id,
        isEarned: false,
        speed: num(pl.ootpRatings?.baserunning.speed, num(pl.v18Ratings?.batting?.speed, pl.ability)),
        stealTendency: num(pl.ootpRatings?.baserunning.stealTendency, 48),
        stealAbility: num(pl.ootpRatings?.baserunning.stealAbility, num(pl.v18Ratings?.batting?.speed, 55)),
        baserunning: num(pl.ootpRatings?.baserunning.baserunning, num(pl.v18Ratings?.batting?.speed, 58)),
      });
      if (prev2) base2 = makeTieRunner(prev2);
      if (prev1) base1 = makeTieRunner(prev1);
    }

    const teamDefMetrics = getTeamDefenseMetrics(defSide);
    const teamDefRating = teamDefMetrics.avgDefense;
    const teamErrorMult = teamDefMetrics.errorRateMult;
    const homeFieldEdge = isHomeBatting ? 0.65 : 0;

    const countRunners = () => (base1 ? 1 : 0) + (base2 ? 1 : 0) + (base3 ? 1 : 0);

    const checkWalkOff = (): boolean => {
      if (isHomeBatting && inning >= 9 && homeRuns > awayRuns) {
        isWalkOff = true;
        return true;
      }
      return false;
    };

    let paSafety = 0;
    while (outs < 3 && paSafety < 45) {
      paSafety += 1;

      // 이닝 도중 투수 교체 점검
      const defScoreNow = isHomeBatting ? awayRuns : homeRuns;
      const batScoreNow = isHomeBatting ? homeRuns : awayRuns;
      const hasMoreRelievers = defSide.relieversPool.some(
        (r) => !defSide.usedPitcherIds.has(r.id)
      );
      if (
        shouldHookCurrentPitcher(
          defSide.currentPitcher,
          inning,
          outs,
          defScoreNow,
          batScoreNow,
          hasMoreRelievers,
          isPostseason
        )
      ) {
        bringInReliever(defSide, inning, defScoreNow, batScoreNow, countRunners());
      }

      // 타순 슬롯 및 승부처 대타 점검
      const slotIdx = batSide.nextSlotIdx % batSide.activeLineup.length;
      maybePinchHit(batSide, slotIdx, inning, batScoreNow, defScoreNow, countRunners(), rng);

      const batterSlot = batSide.activeLineup[slotIdx];
      const batter = batterSlot.player;
      const batterLine = batSide.batterMap.get(batter.id)!;
      const pitcherRt = defSide.currentPitcher;
      const pitcher = pitcherRt.player;
      const pitcherLine = pitcherRt.line;

      // 도루 시도 판정 (OOTP 도루 시도 성향 vs 투수 주자 견제 + 포수 송구/도루 저지)
      const pitcherHold = num(pitcher.ootpRatings?.pitching?.holdRunner, 60);
      if (base1 && !base2 && (outs < 2 || base1.stealTendency >= 62) && base1.stealTendency >= 42) {
        const attemptProb = clamp(
          (base1.stealTendency - 34) * 0.0068 - (pitcherHold - 62) * 0.0005,
          0.02,
          0.25
        );
        if (rng.next() < attemptProb) {
          const runnerStealSkill = base1.stealAbility * 0.72 + base1.speed * 0.28;
          const defenseThrowSkill = pitcherHold * 0.44 + teamDefMetrics.catcherArm * 0.56;
          const successProb = clamp(0.70 + (runnerStealSkill - defenseThrowSkill) * 0.0048, 0.48, 0.89);
          if (rng.next() < successProb) {
            const rLine = batSide.batterMap.get(base1.batterId);
            if (rLine) rLine.SB += 1;
            base2 = base1;
            base1 = null;
          } else {
            outs += 1;
            virtualOutsWithoutError += 1;
            pitcherLine.outs += 1;
            base1 = null;
            if (outs >= 3) break;
          }
        }
      }

      // 포수 블로킹 기반 폭투/포일 진루 판정 (드문 이벤트, 블로킹이 낮을수록 증가)
      if ((base1 || base2 || base3) && outs < 3) {
        const wpPbProb = clamp(0.0075 - (teamDefMetrics.catcherBlocking - 64) * 0.00014, 0.002, 0.018);
        if (rng.next() < wpPbProb) {
          if (base3) {
            recordRunScored(batSide, defSide, isHomeBatting, base3, batterLine, false);
            inningRuns += 1;
            base3 = null;
            if (checkWalkOff()) break;
          }
          if (base2 && !base3) {
            base3 = base2;
            base2 = null;
          }
          if (base1 && !base2) {
            base2 = base1;
            base1 = null;
          }
        }
      }

      // 타석 진입
      batSide.nextSlotIdx = (batSide.nextSlotIdx + 1) % batSide.activeLineup.length;
      const batPerfDelta = getPerfDelta(batter, defTeamId, isHomeBatting, pitcher);
      const pitPerfDelta = getPerfDelta(pitcher, batTeamId, !isHomeBatting);

      const bSkill = getBatterSkills(batter, batPerfDelta, batCoach.battingEdge + homeFieldEdge);
      const pSkill = getPitcherSkills(
        pitcher,
        pitPerfDelta,
        defCoach.pitchingEdge + weatherCtrlDelta * 0.4,
        pitcherLine.PC,
        pitcherLine.GS === 1
      );

      // OOTP 좌/우 스플릿 매치업 1회 산출 (중복 반영 방지)
      const batVsPitchSplit = pSkill.throwsLeft ? bSkill.vsLHP : bSkill.vsRHP;
      const batterFacesAsLefty =
        bSkill.batsHand === '양타' ? !pSkill.throwsLeft : bSkill.batsHand === '좌타';
      const pitVsBatSplit = batterFacesAsLefty ? pSkill.vsLHB : pSkill.vsRHB;
      const splitEdge = clamp((batVsPitchSplit - pitVsBatSplit) * 0.14, -4.5, 4.5);

      // 포수 프레이밍(스트라이크 존 보정: 삼진 미세 상승, 볼넷 미세 감소 — 1회 반영)
      const framingDelta = (teamDefMetrics.catcherFraming - 64) * 0.00024;

      // KBO 최근 3시즌 실측 분포 기반 타석 결과 확률 계산 (각 세부 능력치 직교 1회 반영 — 컨택 중복 반영 금지!)
      // 1) 삼진(SO): 투수 구위 vs 타자 삼진 회피 (BABIP/컨택 미중복)
      const pSO = clamp(
        0.194 + (pSkill.stuff - bSkill.avoidK - splitEdge * 0.5) * 0.0022 + framingDelta,
        0.055,
        0.43
      );
      // 2) 볼넷(BB) / 사구(HBP): 타자 선구안 vs 투수 제구력
      const pBB = clamp(
        (0.088 + (bSkill.eye - pSkill.control) * 0.00165 - framingDelta * 0.8) * (0.94 + safeEnv * 0.06),
        0.025,
        0.21
      );
      const pHBP = clamp(0.012 + (64 - pSkill.control) * 0.00022, 0.005, 0.022);
      // 3) 홈런(HR): 타자 홈런 파워 vs 투수 피홈런 억제
      const pHR = clamp(
        (0.0215 + (bSkill.hrPower - pSkill.hrPrevent + splitEdge * 0.35) * 0.00052) *
          safePark *
          safeHrMult *
          safeEnv,
        0.0025,
        0.092
      );

      const nonBipTotal = pSO + pBB + pHBP + pHR;
      const bipProb = Math.max(0.25, 1 - nonBipTotal);

      // 4) 인플레이 안타(BABIP): 타자 BABIP vs 투수 피안타 억제 + 수비 범위(내야/외야 땅볼비율 가중)
      const gbShare = clamp(pSkill.groundballRate / 100, 0.30, 0.70);
      const weightedRangeDef =
        teamDefMetrics.infieldRange * gbShare + teamDefMetrics.outfieldRange * (1 - gbShare);
      const babip = clamp(
        (0.312 +
          (bSkill.babip - pSkill.hitPrevent + splitEdge * 0.55) * 0.00165 -
          (weightedRangeDef - 64) * 0.0012) *
          (0.95 + safePark * 0.05) *
          (0.94 + safeEnv * 0.06),
        0.19,
        0.41
      );

      const pHitBip = bipProb * babip;
      const pOutBip = bipProb - pHitBip;

      // 타석 투구 수 반영
      const roll = rng.next();
      batterLine.PA += 1;

      const runsAreEarnedNow = !(errorOccurredThisInning && virtualOutsWithoutError >= 3);

      // 0A) 접전 후반 무사 1루/1·2루 희생번트 작전 (OOTP 희생번트 능력치 반영)
      const scoreDiffBat = batScoreNow - defScoreNow;
      if (
        inning >= 7 &&
        Math.abs(scoreDiffBat) <= 2 &&
        outs === 0 &&
        base1 &&
        !base3 &&
        bSkill.sacBunt >= 62 &&
        bSkill.hrPower <= 68 &&
        rng.next() < clamp((bSkill.sacBunt - 52) * 0.0085, 0.04, 0.28)
      ) {
        pitcherLine.PC += rng.int(1, 3);
        const sacSuccess = clamp(0.68 + (bSkill.sacBunt - 60) * 0.005, 0.55, 0.90);
        if (rng.next() < sacSuccess) {
          // 희생번트 성공 (타수 미포함, 주자 1베이스 진루)
          outs += 1;
          virtualOutsWithoutError += 1;
          pitcherLine.outs += 1;
          if (base2) {
            base3 = base2;
            base2 = base1;
            base1 = null;
          } else {
            base2 = base1;
            base1 = null;
          }
          continue;
        }
        // 실패 시 일반 인플레이 흐름으로 자연 진입하지 않고 포스아웃/실패 처리
        batterLine.AB += 1;
        outs += 1;
        virtualOutsWithoutError += 1;
        pitcherLine.outs += 1;
        continue;
      }

      // 0B) 기습번트 안타 시도 (높은 기습번트 + 주력 선수, 주자 없거나 1루)
      if (
        !base2 &&
        !base3 &&
        bSkill.buntForHit >= 68 &&
        bSkill.speed >= 68 &&
        rng.next() < clamp((bSkill.buntForHit - 64) * 0.0014, 0.005, 0.032)
      ) {
        pitcherLine.PC += rng.int(1, 2);
        batterLine.AB += 1;
        const buntHitProb = clamp(
          0.34 + (bSkill.buntForHit * 0.5 + bSkill.speed * 0.5 - teamDefMetrics.infieldRange * 0.6 - teamDefMetrics.infieldArm * 0.4) * 0.006,
          0.18,
          0.56
        );
        if (rng.next() < buntHitProb) {
          batterLine.H += 1;
          batterLine.TB += 1;
          pitcherLine.H += 1;
          if (base1) base2 = base1;
          base1 = {
            batterId: batter.id,
            responsiblePitcherId: pitcher.id,
            isEarned: runsAreEarnedNow,
            speed: bSkill.speed,
            stealTendency: bSkill.stealTendency,
            stealAbility: bSkill.stealAbility,
            baserunning: bSkill.baserunning,
          };
        } else {
          outs += 1;
          virtualOutsWithoutError += 1;
          pitcherLine.outs += 1;
        }
        continue;
      }

      // 1) 삼진 (SO)
      if (roll < pSO) {
        batterLine.AB += 1;
        batterLine.SO += 1;
        pitcherLine.SO += 1;
        pitcherLine.outs += 1;
        pitcherLine.PC += rng.int(3, 6);
        outs += 1;
        virtualOutsWithoutError += 1;
        continue;
      }

      // 2) 볼넷 (BB) / 사구 (HBP)
      if (roll < pSO + pBB + pHBP) {
        const isHbp = roll >= pSO + pBB;
        if (isHbp) {
          batterLine.HBP += 1;
          pitcherLine.PC += rng.int(1, 4);
        } else {
          batterLine.BB += 1;
          pitcherLine.BB += 1;
          pitcherLine.PC += rng.int(4, 7);
        }

        const newRunner: RunnerOnBase = {
          batterId: batter.id,
          responsiblePitcherId: pitcher.id,
          isEarned: runsAreEarnedNow,
          speed: bSkill.speed,
          stealTendency: bSkill.stealTendency,
          stealAbility: bSkill.stealAbility,
          baserunning: bSkill.baserunning,
        };
        if (base1 && base2 && base3) {
          recordRunScored(batSide, defSide, isHomeBatting, base3, batterLine, true);
          inningRuns += 1;
          base3 = base2;
          base2 = base1;
          base1 = newRunner;
          if (checkWalkOff()) break;
        } else if (base1 && base2) {
          base3 = base2;
          base2 = base1;
          base1 = newRunner;
        } else if (base1) {
          base2 = base1;
          base1 = newRunner;
        } else {
          base1 = newRunner;
        }
        continue;
      }

      // 3) 홈런 (HR)
      if (roll < pSO + pBB + pHBP + pHR) {
        batterLine.AB += 1;
        batterLine.H += 1;
        batterLine.HR += 1;
        batterLine.TB += 4;
        pitcherLine.H += 1;
        pitcherLine.HR += 1;
        pitcherLine.PC += rng.int(2, 5);

        const scoringRunners: RunnerOnBase[] = [];
        if (base3) scoringRunners.push(base3);
        if (base2) scoringRunners.push(base2);
        if (base1) scoringRunners.push(base1);
        scoringRunners.push({
          batterId: batter.id,
          responsiblePitcherId: pitcher.id,
          isEarned: runsAreEarnedNow,
          speed: bSkill.speed,
          stealTendency: bSkill.stealTendency,
          stealAbility: bSkill.stealAbility,
          baserunning: bSkill.baserunning,
        });
        base1 = null;
        base2 = null;
        base3 = null;

        for (const r of scoringRunners) {
          recordRunScored(batSide, defSide, isHomeBatting, r, batterLine, true);
          inningRuns += 1;
        }
        if (checkWalkOff()) break;
        continue;
      }

      // 4) 인플레이 안타 (1B / 2B / 3B — 갭 파워·주력·주루 판단력·외야 송구 반영)
      if (roll < nonBipTotal + pHitBip) {
        batterLine.AB += 1;
        batterLine.H += 1;
        pitcherLine.H += 1;
        pitcherLine.PC += rng.int(2, 5);

        const doubleShare = clamp(
          0.195 +
            (bSkill.gapPower - 64) * 0.0024 +
            (bSkill.speed - 64) * 0.0008 +
            (bSkill.baserunning - 64) * 0.0005 +
            (safePark - 1) * 0.08,
          0.1,
          0.36
        );
        const tripleShare = clamp(
          0.017 + (bSkill.speed - 64) * 0.00085 + (bSkill.gapPower - 64) * 0.00045,
          0.004,
          0.068
        );
        const hitRoll = rng.next();

        const batterRunner: RunnerOnBase = {
          batterId: batter.id,
          responsiblePitcherId: pitcher.id,
          isEarned: runsAreEarnedNow,
          speed: bSkill.speed,
          stealTendency: bSkill.stealTendency,
          stealAbility: bSkill.stealAbility,
          baserunning: bSkill.baserunning,
        };

        if (hitRoll < tripleShare) {
          // 3루타
          batterLine.B3 += 1;
          batterLine.TB += 3;
          for (const r of [base3, base2, base1]) {
            if (r) {
              recordRunScored(batSide, defSide, isHomeBatting, r, batterLine, true);
              inningRuns += 1;
            }
          }
          base1 = null;
          base2 = null;
          base3 = batterRunner;
        } else if (hitRoll < tripleShare + doubleShare) {
          // 2루타
          batterLine.B2 += 1;
          batterLine.TB += 2;
          if (base3) {
            recordRunScored(batSide, defSide, isHomeBatting, base3, batterLine, true);
            inningRuns += 1;
          }
          if (base2) {
            recordRunScored(batSide, defSide, isHomeBatting, base2, batterLine, true);
            inningRuns += 1;
          }
          let next3: RunnerOnBase | null = null;
          if (base1) {
            const rSkill = base1.baserunning * 0.55 + base1.speed * 0.45;
            const scoreFromFirst =
              outs === 2
                ? clamp(0.62 + (rSkill - teamDefMetrics.outfieldArm) * 0.005, 0.42, 0.85)
                : clamp(0.36 + (rSkill - teamDefMetrics.outfieldArm) * 0.0065, 0.18, 0.65);
            if (rng.next() < scoreFromFirst) {
              recordRunScored(batSide, defSide, isHomeBatting, base1, batterLine, true);
              inningRuns += 1;
            } else {
              next3 = base1;
            }
          }
          base1 = null;
          base2 = batterRunner;
          base3 = next3;
        } else {
          // 단타 (1루타)
          batterLine.TB += 1;
          if (base3) {
            recordRunScored(batSide, defSide, isHomeBatting, base3, batterLine, true);
            inningRuns += 1;
          }
          let next3: RunnerOnBase | null = null;
          let next2: RunnerOnBase | null = null;
          if (base2) {
            const rSkill = base2.baserunning * 0.55 + base2.speed * 0.45;
            const scoreFromSecond =
              outs === 2
                ? clamp(0.78 + (rSkill - teamDefMetrics.outfieldArm) * 0.0045, 0.58, 0.94)
                : clamp(0.52 + (rSkill - teamDefMetrics.outfieldArm) * 0.007, 0.30, 0.78);
            if (rng.next() < scoreFromSecond) {
              recordRunScored(batSide, defSide, isHomeBatting, base2, batterLine, true);
              inningRuns += 1;
            } else {
              next3 = base2;
            }
          }
          if (base1) {
            const rSkill = base1.baserunning * 0.55 + base1.speed * 0.45;
            if (!next3 && rng.next() < clamp(0.24 + (rSkill - teamDefMetrics.outfieldArm) * 0.006, 0.08, 0.48)) {
              next3 = base1;
            } else {
              next2 = base1;
            }
          }
          base1 = batterRunner;
          base2 = next2;
          base3 = next3;
        }

        if (checkWalkOff()) break;
        continue;
      }

      // 5) 인플레이 범타 (투수 땅볼유도율 · 내/외야 실책방지 · 병살 처리 · 외야 송구 반영)
      pitcherLine.PC += rng.int(1, 5);
      const isGroundball = rng.next() < gbShare;
      const relevantErrDef = isGroundball ? teamDefMetrics.infieldError : teamDefMetrics.outfieldError;
      const errProbOnBipOut = clamp(
        (0.019 - (relevantErrDef - 64) * 0.00032) * clamp(teamErrorMult, 0.85, 1.45),
        0.008,
        0.048
      );

      if (rng.next() < errProbOnBipOut) {
        // 수비 실책 출루 (비자책 진행)
        batterLine.AB += 1;
        defSide.errors += 1;
        errorOccurredThisInning = true;
        virtualOutsWithoutError += 1;

        if (base3) {
          recordRunScored(
            batSide,
            defSide,
            isHomeBatting,
            { ...base3, isEarned: false },
            batterLine,
            false
          );
          inningRuns += 1;
        }
        base3 = base2;
        base2 = base1;
        base1 = {
          batterId: batter.id,
          responsiblePitcherId: pitcher.id,
          isEarned: false,
          speed: bSkill.speed,
          stealTendency: bSkill.stealTendency,
          stealAbility: bSkill.stealAbility,
          baserunning: bSkill.baserunning,
        };
        if (checkWalkOff()) break;
        continue;
      }

      if (isGroundball) {
        batterLine.AB += 1;
        // 병살타 판정 (1루 주자 존재 & 2아웃 미만 · 내야 병살 처리 + 내야 송구 vs 타자 주력)
        if (base1 && outs < 2) {
          const dpSkill = teamDefMetrics.turnDP * 0.72 + teamDefMetrics.infieldArm * 0.28;
          const dpProb = clamp(0.42 - (bSkill.speed - 64) * 0.0052 + (dpSkill - 64) * 0.0038, 0.20, 0.62);
          if (rng.next() < dpProb) {
            outs += 2;
            virtualOutsWithoutError += 2;
            pitcherLine.outs += 2;
            base1 = null;
            // 무사 1·3루 병살 시 3루 주자 득점 (타점 미인정 공식 야구 규정)
            if (outs < 3 && base3) {
              recordRunScored(batSide, defSide, isHomeBatting, base3, batterLine, false);
              inningRuns += 1;
              base3 = base2;
              base2 = null;
              if (checkWalkOff()) break;
            }
            continue;
          }
        }
        // 일반 땅볼 아웃 (진루타 가능)
        outs += 1;
        virtualOutsWithoutError += 1;
        pitcherLine.outs += 1;
        if (outs < 3) {
          if (base3 && rng.next() < clamp(0.34 + (base3.baserunning - 64) * 0.004, 0.22, 0.5)) {
            recordRunScored(batSide, defSide, isHomeBatting, base3, batterLine, true);
            inningRuns += 1;
            base3 = null;
            if (checkWalkOff()) break;
          }
          if (base2 && !base3 && rng.next() < clamp(0.45 + (base2.baserunning - 64) * 0.004, 0.3, 0.62)) {
            base3 = base2;
            base2 = null;
          }
        }
      } else {
        // 뜬공 (3루 주자 & 2아웃 미만 시 희생플라이: 주루판단+주력 vs 외야 송구)
        const tagUpProb = base3
          ? clamp(0.56 + (base3.baserunning * 0.5 + base3.speed * 0.5 - teamDefMetrics.outfieldArm) * 0.0055, 0.32, 0.78)
          : 0;
        if (base3 && outs < 2 && rng.next() < tagUpProb) {
          batterLine.SF += 1; // 희생플라이는 AB에 미포함
          outs += 1;
          virtualOutsWithoutError += 1;
          pitcherLine.outs += 1;
          recordRunScored(batSide, defSide, isHomeBatting, base3, batterLine, true);
          inningRuns += 1;
          base3 = null;
          if (checkWalkOff()) break;
        } else {
          batterLine.AB += 1;
          outs += 1;
          virtualOutsWithoutError += 1;
          pitcherLine.outs += 1;
        }
      }
      // pOutBip intentionally used to mirror total probability split
      void pOutBip;
    }

    return inningRuns;
  };

  // 1~9회 정규 이닝 진행
  for (let inn = 1; inn <= 9; inn++) {
    const ar = simulateHalfInning(inn, false, false);
    awayInnings.push(ar);

    if (inn === 9 && homeRuns > awayRuns) {
      homeInnings.push(null); // 홈팀 9회말 공격 생략 (X)
    } else {
      const hr = simulateHalfInning(inn, true, false);
      homeInnings.push(hr);
    }
  }

  // 연장전 진행 (정규시즌 규정 상한 / 포스트시즌 최대 15회)
  const maxInnings = isPostseason ? 15 : clamp(num(ruleMods.extraInningCap, 11), 11, 15);
  let extraInn = 10;
  while (awayRuns === homeRuns && extraInn <= maxInnings) {
    const tiebreaker = !isPostseason && ruleMods.hasTiebreaker && extraInn >= 10;
    const ar = simulateHalfInning(extraInn, false, tiebreaker);
    awayInnings.push(ar);
    const hr = simulateHalfInning(extraInn, true, tiebreaker);
    homeInnings.push(hr);
    extraInn += 1;
  }

  // 포스트시즌 15회까지 동점 시 서든데스 1이닝 추가 (무승부 불가)
  while (isPostseason && awayRuns === homeRuns && extraInn <= 18) {
    const ar = simulateHalfInning(extraInn, false, true);
    awayInnings.push(ar);
    const hr = simulateHalfInning(extraInn, true, true);
    homeInnings.push(hr);
    extraInn += 1;
  }

  // 승리/패전/세이브/홀드/QS/완투/완봉/노히트/퍼펙트 공식 기록 정산
  const finalizePitchingDecisions = (
    side: SideRuntime,
    won: boolean,
    lost: boolean,
    goAheadPitcherId: string | null,
    losingPitcherId: string | null,
    oppRuns: number,
    oppHits: number
  ) => {
    if (side.pitchers.length === 0) return;

    const starterRt = side.pitchers[0];
    const starter = starterRt.line;
    const isCompleteGame = side.pitchers.length === 1;

    if (starter.outs >= 18 && starter.ER <= 3) starter.QS = 1;
    if (starter.outs >= 21 && starter.ER <= 3) starter.QSP = 1;
    if (isCompleteGame && starter.outs >= 24) {
      starter.CG = 1;
      if (oppRuns === 0 && starter.outs >= 27) {
        starter.SHO = 1;
        if (oppHits === 0) {
          starter.NH = 1;
          if (starter.BB === 0 && side.errors === 0) {
            starter.PG = 1;
          }
        }
      }
    }

    if (won) {
      let winRt: ActivePitcherRuntime | undefined;
      if (goAheadPitcherId) {
        const cand = side.pitchers.find((p) => p.player.id === goAheadPitcherId);
        if (cand && (cand.line.GS === 0 || cand.line.outs >= 15)) {
          winRt = cand;
        }
      }
      if (!winRt) {
        if (starter.outs >= 15) {
          winRt = starterRt;
        } else {
          // 선발 5이닝 미만 승리 시 가장 효과적인 불펜 투수에게 승리 부여
          winRt =
            side.pitchers
              .slice(1)
              .sort((a, b) => b.line.outs - b.line.ER * 3 - (a.line.outs - a.line.ER * 3))[0] ??
            starterRt;
        }
      }
      winRt.line.W = 1;

      const finalRt = side.pitchers[side.pitchers.length - 1];
      if (
        finalRt !== winRt &&
        finalRt.line.GS === 0 &&
        !finalRt.blownSaveRecorded &&
        (finalRt.wasSaveSituation || finalRt.line.outs >= 9)
      ) {
        finalRt.line.SV = 1;
      }

      for (let i = 1; i < side.pitchers.length - 1; i++) {
        const midRt = side.pitchers[i];
        if (
          midRt !== winRt &&
          midRt.wasSaveSituation &&
          !midRt.blownSaveRecorded &&
          midRt.line.outs >= 1
        ) {
          midRt.line.HLD = 1;
        }
      }
    } else if (lost) {
      const lossRt =
        (losingPitcherId
          ? side.pitchers.find((p) => p.player.id === losingPitcherId)
          : undefined) ??
        side.pitchers[side.pitchers.length - 1];
      lossRt.line.L = 1;
    }
  };

  const awayBatters = away.batterOrder.map((id) => away.batterMap.get(id)!);
  const homeBatters = home.batterOrder.map((id) => home.batterMap.get(id)!);
  const awayHits = awayBatters.reduce((s, b) => s + b.H, 0);
  const homeHits = homeBatters.reduce((s, b) => s + b.H, 0);

  finalizePitchingDecisions(
    away,
    awayRuns > homeRuns,
    awayRuns < homeRuns,
    awayGoAheadPitcherId,
    awayLosingPitcherId,
    homeRuns,
    homeHits
  );
  finalizePitchingDecisions(
    home,
    homeRuns > awayRuns,
    homeRuns < awayRuns,
    homeGoAheadPitcherId,
    homeLosingPitcherId,
    awayRuns,
    awayHits
  );

  return {
    awayInnings,
    homeInnings,
    awayRuns,
    homeRuns,
    awayHits,
    homeHits,
    awayErrors: away.errors,
    homeErrors: home.errors,
    awayBatters,
    homeBatters,
    awayPitchers: away.pitchers.map((p) => p.line),
    homePitchers: home.pitchers.map((p) => p.line),
    awayInGameInjuredIds: away.inGameInjuredIds,
    homeInGameInjuredIds: home.inGameInjuredIds,
    substitutionNotes: [...away.substitutionNotes, ...home.substitutionNotes],
    isWalkOff,
  };
}
