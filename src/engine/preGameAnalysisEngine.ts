import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  BatterStats,
  CareerSave,
  GameRecord,
  InjurySeverity,
  LockedGameLineupPlan,
  PitcherStats,
  Player,
  Position,
  StandingsRow,
  TeamId,
} from '../types/kbo';
import {
  buildRealisticGameLineupAndBench,
  GameBatterPlan,
  GameStarterSlot,
  getRunnerSpeedScore,
} from './batterUsageEngine';
import { buildPitchRepertoire, getFacilityEffectivenessMult, updateMedicalRehabProgress } from './deepFranchise';
import { canPlayerAppearInFirstTeam } from './developmentalEngine';
import { isPlayerOnNationalTeamDuty } from './franchiseSystems';
import { reconcileGameStarterPositionsInPlace } from './lineupValidationEngine';
import { ensurePlayerOotpRatingsInPlace } from './ootpRatingsEngine';
import {
  applyOffDayPitcherRecoveryInPlace,
  buildRealisticPitchingPlan,
  BullpenRoleType,
  getPitcherRestDays,
  getRecent3DayPitchCount,
  isPitcherEligibleForGame,
  normalizeBullpenRole,
  PitcherGamePlan,
} from './pitchingUsageEngine';
import { computeEffectiveFieldingAtPosition } from './positionEngine';
import { getRivalryEffectProfile } from './rivalryEngine';
import { SeededRng } from './rng';
import { addDaysIso } from './schedule';
import {
  calcAVG,
  calcERA,
  calcOBP,
  calcOPS,
  calcWHIP,
  computeStandings,
  formatIP,
} from './stats';

export interface SplitRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface HeadToHeadRecord extends SplitRecord {
  runsFor: number;
  runsAgainst: number;
}

export interface TeamRecentFormSummary {
  last5: ('W' | 'L' | 'D')[];
  last5Wins: number;
  last5Losses: number;
  last5Draws: number;
  streak: string;
  homeRecord: SplitRecord;
  awayRecord: SplitRecord;
  h2hRecord: HeadToHeadRecord;
}

export interface PreGameStarterComparison {
  player: Player;
  usageType: PitcherGamePlan['starterUsageType'];
  throwsLabel: string;
  ability: number;
  potential: number;
  form: number;
  fatigue: number;
  staminaRemainingPct: number;
  restDays: number;
  velocityKmh: number;
  stuff: number;
  control: number;
  staminaRating: number;
  era: number | null;
  whip: number | null;
  wins: number;
  losses: number;
  so: number;
  ip: string;
  gamesStarted: number;
}

export interface PreGameBatterRow {
  battingOrder: number;
  player: Player;
  position: Position;
  ability: number;
  form: number;
  fatigue: number;
  batsLabel: string;
  avg: number | null;
  hr: number;
  rbi: number;
  obp: number | null;
  ops: number | null;
  pa: number;
  isHot: boolean;
  isCold: boolean;
  rotationReason?: string;
}

export type PowerCategoryKey = '타격' | '선발투수' | '불펜' | '수비' | '주루';

export interface PowerComparisonCategory {
  key: PowerCategoryKey;
  label: string;
  myScore: number;
  oppScore: number;
  diff: number;
  advantage: 'MY' | 'OPP' | 'EVEN';
  detailNote: string;
}

export type BullpenAvailability = '가용' | '주의(연투)' | '주의(피로)' | '휴식권장';

export interface OpponentBullpenStatusRow {
  player: Player;
  role: BullpenRoleType;
  ability: number;
  era: number | null;
  whip: number | null;
  saves: number;
  holds: number;
  fatigue: number;
  staminaPct: number;
  consecutiveDays: number;
  recent3DayPitches: number;
  restDays: number;
  availability: BullpenAvailability;
  availabilityReason: string;
}

export interface OpponentInjuredRow {
  player: Player;
  position: Position;
  ability: number;
  severity: InjurySeverity;
  description: string;
  daysRemaining: number;
  isCore: boolean;
}

export interface OpponentSpotlightPlayer {
  player: Player;
  tag: '핵심 타자' | '핵심 투수' | '상승세' | '하락세';
  statLine: string;
  form: number;
  reason: string;
}

export interface PreGameCoachingReport {
  managerName: string;
  managerStyle: string;
  pitchCoachName: string;
  hitCoachName: string;
  defenseCoachName: string;
  batteryCoachName: string;
  overallSummary: string;
  pitchingPlan: string;
  battingPlan: string;
  defenseAndBaserunningNote: string;
  keyMatchup: string;
}

export interface WinProbabilityFactor {
  label: string;
  delta: number; // percentage point contribution for myTeam (+ favors myTeam, - favors opp)
}

export interface PreGameAnalysisReport {
  season: number;
  round: number;
  date: string;
  displayDate: string;
  isPostseason: boolean;
  postseasonLabel?: string;
  seriesGameNumber: number;
  remainingSeriesGames: number;
  stadium: string;
  parkFactor: number;
  parkLabel: '타자 친화' | '투수 친화' | '중립';
  myTeamId: TeamId;
  oppTeamId: TeamId;
  awayTeam: TeamId;
  homeTeam: TeamId;
  isMyTeamHome: boolean;
  rivalryName?: string;
  rivalryIntensity?: number;
  myStanding: StandingsRow;
  oppStanding: StandingsRow;
  myForm: TeamRecentFormSummary;
  oppForm: TeamRecentFormSummary;
  myStarter: PreGameStarterComparison;
  oppStarter: PreGameStarterComparison;
  myLineup: PreGameBatterRow[];
  oppLineup: PreGameBatterRow[];
  myLineupNotes: string[];
  oppLineupNotes: string[];
  powerComparison: PowerComparisonCategory[];
  oppInjuries: OpponentInjuredRow[];
  oppBullpen: OpponentBullpenStatusRow[];
  oppBullpenSummary: {
    total: number;
    available: number;
    caution: number;
    restRecommended: number;
  };
  oppKeyPlayers: OpponentSpotlightPlayer[];
  oppHotPlayers: OpponentSpotlightPlayer[];
  oppColdPlayers: OpponentSpotlightPlayer[];
  oppStrengths: string[];
  oppWeaknesses: string[];
  coachingReport: PreGameCoachingReport;
  winProbability: {
    myWinPct: number;
    oppWinPct: number;
    factors: WinProbabilityFactor[];
  };
  lockedPlan: LockedGameLineupPlan;
}

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function formatKoreanMatchDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = weekdays[dt.getUTCDay()] ?? '';
  return `${y}.${String(mo).padStart(2, '0')}.${String(d).padStart(2, '0')} (${wd})`;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}

function getThrowsLabel(p: Player): string {
  if (p.pitchRepertoire?.throws) return p.pitchRepertoire.throws;
  if (p.throws === 'L') return '좌투';
  if (p.throws === 'R') return '우투';
  return '우투';
}

function getBatsLabel(p: Player): string {
  if (p.bats === 'L') return '좌타';
  if (p.bats === 'S') return '양타';
  if (p.bats === 'R') return '우타';
  return p.battingProfile?.bats ?? '우타';
}

function getBatterStatsSource(p: Player): BatterStats {
  const b = p.stats as BatterStats;
  if (b && b.isPartial && b.PA === null && p.ktSeriesBatting) {
    return p.ktSeriesBatting;
  }
  return b;
}

/**
 * 경기 직전 일일 회복/휴식일 회복 및 AI 부상자 2군 콜업을 복제 스냅샷에 미리 반영하여
 * 전력 분석 화면의 체력/부상/선발 상태가 실제 경기 진입 직전 상태와 100% 일치하도록 투영합니다.
 */
function projectPreGameSnapshot(
  career: CareerSave,
  params: { isPostseason: boolean; startOffset: number; hasMondayRestBefore?: boolean; isAllStarBreakBefore?: boolean }
): CareerSave {
  const snap = JSON.parse(JSON.stringify(career)) as CareerSave;

  if (!params.isPostseason && params.startOffset === 0) {
    if (params.isAllStarBreakBefore) {
      for (const p of Object.values(snap.players)) {
        if (p.fatigue > 0) p.fatigue = Math.max(0, p.fatigue - 26);
      }
      applyOffDayPitcherRecoveryInPlace(snap, 3);
    } else if (params.hasMondayRestBefore) {
      for (const p of Object.values(snap.players)) {
        if (p.fatigue > 0) p.fatigue = Math.max(0, p.fatigue - 12);
      }
      applyOffDayPitcherRecoveryInPlace(snap, 1);
    }
  }

  // Mirror advanceDailyRecoveryAndInjuries
  const medicalLevel = snap.finances.investments?.medicalLevel ?? 1;
  const medCondMult = getFacilityEffectivenessMult(snap.finances.facilityCondition?.medical);
  const medicalBonus = Math.round((medicalLevel - 1) * 3 * medCondMult);
  for (const p of Object.values(snap.players)) {
    if (p.fatigue > 0) {
      const baseRec = p.role === '타자' ? 5 : p.pitchRole === '선발' ? 16 : 22;
      const bonus =
        p.teamId === snap.playerTeamId
          ? p.role === '타자'
            ? Math.round(medicalBonus * 0.4)
            : medicalBonus
          : 0;
      p.fatigue = Math.max(0, p.fatigue - (baseRec + bonus));
    }
    if (p.injury) {
      p.injury.daysRemaining -= 1;
      updateMedicalRehabProgress(p);
      if (p.injury.daysRemaining <= 0) {
        p.injury = null;
        p.form = Math.max(-5, p.form - 2);
        p.gameDayActive = p.rosterTier === '1군';
      }
    }
  }

  // Mirror AI 1군 replacement for medium/long injuries
  if (!params.isPostseason) {
    for (const tid of TEAM_IDS) {
      if (tid === snap.playerTeamId) continue;
      const t = snap.teams[tid];
      const teamPlayers = Object.values(snap.players).filter((p) => p.teamId === tid);
      const injuredFirst = teamPlayers.filter(
        (p) => p.rosterTier === '1군' && p.injury && p.injury.daysRemaining >= 7
      );
      for (const injP of injuredFirst) {
        injP.rosterTier = '2군';
        injP.gameDayActive = false;
        t.lineupOrder = t.lineupOrder.filter((id) => id !== injP.id);
        t.benchOrder = t.benchOrder.filter((id) => id !== injP.id);
        t.rotationOrder = t.rotationOrder.filter((id) => id !== injP.id);
        t.bullpenOrder = t.bullpenOrder.filter((id) => id !== injP.id);

        const replacement = teamPlayers
          .filter((c) => c.rosterTier === '2군' && c.role === injP.role && !c.injury)
          .sort((a, b) => b.ability - a.ability)[0];
        if (replacement) {
          replacement.rosterTier = '1군';
          replacement.gameDayActive = true;
          if (replacement.role === '투수') {
            if (t.rotationOrder.length < 5) t.rotationOrder.push(replacement.id);
            else t.bullpenOrder.push(replacement.id);
          } else if (t.lineupOrder.length < 9) {
            t.lineupOrder.push(replacement.id);
            t.lineupPositions[replacement.id] = replacement.position;
          } else {
            t.benchOrder.push(replacement.id);
          }
        }
      }
    }
  }

  return snap;
}

/**
 * 사용자 구단 선발 라인업 구성:
 * 단장이 직접 편성한 lineupOrder / lineupPositions를 100% 존중하되,
 * 부상·국가대표 차출·출장 불가 선수만 건강한 1군(없으면 2군) 대체 선수로 자동 보완합니다.
 */
function buildUserDeterministicLineup(
  snap: CareerSave,
  teamId: TeamId,
  isPostseason: boolean
): { starters: GameStarterSlot[]; notes: string[] } {
  const tState = snap.teams[teamId];
  const isOnNtDuty = (p: Player) => !isPostseason && isPlayerOnNationalTeamDuty(p, snap.gamesPlayed);
  const isEligible = (p: Player) =>
    p.teamId === teamId &&
    p.role === '타자' &&
    canPlayerAppearInFirstTeam(p) &&
    !p.injury &&
    !isOnNtDuty(p) &&
    !(isPostseason && p.postseasonIneligibleSeason === snap.season);

  const starters: GameStarterSlot[] = [];
  const usedIds = new Set<string>();
  const notes: string[] = [];

  for (const pid of tState.lineupOrder) {
    const p = snap.players[pid];
    if (!p) continue;
    if (p.rosterTier === '1군' && isEligible(p) && !usedIds.has(p.id)) {
      starters.push({
        player: p,
        position: (tState.lineupPositions[p.id] ?? p.position) as Position,
        battingOrder: starters.length + 1,
      });
      usedIds.add(p.id);
    } else if (p.injury) {
      notes.push(`${p.name}(부상 잔여 ${p.injury.daysRemaining}일) 결장으로 대체 선발 자동 보완`);
    } else if (isOnNtDuty(p)) {
      notes.push(`${p.name}(국가대표 차출) 결장으로 대체 선발 자동 보완`);
    }
  }

  if (starters.length < 9) {
    const firstPool = Object.values(snap.players)
      .filter((p) => p.rosterTier === '1군' && isEligible(p) && !usedIds.has(p.id))
      .sort((a, b) => (b.gameDayActive ? 1 : 0) - (a.gameDayActive ? 1 : 0) || b.ability - a.ability);
    for (const p of firstPool) {
      if (starters.length >= 9) break;
      starters.push({
        player: p,
        position: (tState.lineupPositions[p.id] ?? p.position) as Position,
        battingOrder: starters.length + 1,
        rotationReason: '결원 대체 선발',
      });
      usedIds.add(p.id);
    }
  }

  if (starters.length < 9) {
    const minorPool = Object.values(snap.players)
      .filter((p) => isEligible(p) && !usedIds.has(p.id))
      .sort((a, b) => b.ability - a.ability);
    for (const p of minorPool) {
      if (starters.length >= 9) break;
      starters.push({
        player: p,
        position: p.position,
        battingOrder: starters.length + 1,
        rotationReason: '긴급 대체 선발',
      });
      usedIds.add(p.id);
    }
  }

  reconcileGameStarterPositionsInPlace(starters);
  starters.forEach((s, idx) => {
    s.battingOrder = idx + 1;
  });

  return { starters: starters.slice(0, 9), notes };
}

function computeTeamRecentForm(
  gamesLedger: GameRecord[],
  teamId: TeamId,
  oppTeamId: TeamId
): TeamRecentFormSummary {
  const regGames = gamesLedger
    .filter((g) => !g.isPostseason && (g.awayTeam === teamId || g.homeTeam === teamId))
    .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date));

  const results: ('W' | 'L' | 'D')[] = [];
  const homeRecord: SplitRecord = { wins: 0, losses: 0, draws: 0 };
  const awayRecord: SplitRecord = { wins: 0, losses: 0, draws: 0 };
  const h2hRecord: HeadToHeadRecord = { wins: 0, losses: 0, draws: 0, runsFor: 0, runsAgainst: 0 };

  for (const g of regGames) {
    const isHome = g.homeTeam === teamId;
    const opp = isHome ? g.awayTeam : g.homeTeam;
    const myRuns = isHome ? g.homeRuns : g.awayRuns;
    const oppRuns = isHome ? g.awayRuns : g.homeRuns;
    const res: 'W' | 'L' | 'D' =
      g.isDraw || myRuns === oppRuns ? 'D' : myRuns > oppRuns ? 'W' : 'L';
    results.push(res);

    const split = isHome ? homeRecord : awayRecord;
    if (res === 'W') split.wins++;
    else if (res === 'L') split.losses++;
    else split.draws++;

    if (opp === oppTeamId) {
      h2hRecord.runsFor += myRuns;
      h2hRecord.runsAgainst += oppRuns;
      if (res === 'W') h2hRecord.wins++;
      else if (res === 'L') h2hRecord.losses++;
      else h2hRecord.draws++;
    }
  }

  const last5 = results.slice(-5);
  const last5Wins = last5.filter((x) => x === 'W').length;
  const last5Losses = last5.filter((x) => x === 'L').length;
  const last5Draws = last5.filter((x) => x === 'D').length;

  let streak = '기록 없음';
  if (results.length > 0) {
    const last = results[results.length - 1];
    let count = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i] === last) count++;
      else break;
    }
    streak = last === 'W' ? `${count}연승` : last === 'L' ? `${count}연패` : `${count}무`;
  }

  return {
    last5,
    last5Wins,
    last5Losses,
    last5Draws,
    streak,
    homeRecord,
    awayRecord,
    h2hRecord,
  };
}

function buildStarterComparison(
  p: Player,
  usageType: PitcherGamePlan['starterUsageType'],
  date: string,
  round: number
): PreGameStarterComparison {
  const ootp = ensurePlayerOotpRatingsInPlace(p).pitching;
  const v18 = p.v18Ratings?.pitching;
  const rep = p.pitchRepertoire ?? buildPitchRepertoire(p);
  const ps = p.stats as PitcherStats;
  const outs = ps?.outs ?? 0;
  const era = calcERA(ps?.ER ?? null, outs > 0 ? outs : null);
  const whip = calcWHIP(ps?.H ?? null, ps?.BB ?? null, outs > 0 ? outs : null);
  const restDays = getPitcherRestDays(p, date, round);
  const staminaRemainingPct = Math.round(clamp(100 - p.fatigue, 0, 100));

  return {
    player: p,
    usageType,
    throwsLabel: getThrowsLabel(p),
    ability: p.ability,
    potential: p.potential,
    form: p.form,
    fatigue: Math.round(p.fatigue),
    staminaRemainingPct,
    restDays,
    velocityKmh: Math.round(ootp?.avgVelocityKmh ?? rep.avgVelocityKmh ?? 144),
    stuff: Math.round(ootp?.stuff.cur ?? v18?.stuff ?? p.ability),
    control: Math.round(ootp?.control.cur ?? v18?.control ?? rep.command ?? p.ability),
    staminaRating: Math.round(ootp?.stamina ?? v18?.stamina_proxy ?? rep.stamina ?? 68),
    era,
    whip,
    wins: ps?.W ?? 0,
    losses: ps?.L ?? 0,
    so: ps?.SO ?? 0,
    ip: formatIP(outs),
    gamesStarted: ps?.GS ?? 0,
  };
}

function buildBatterRows(slots: GameStarterSlot[]): PreGameBatterRow[] {
  return slots.map((s, idx) => {
    const b = getBatterStatsSource(s.player);
    const avg = calcAVG(b?.H ?? null, b?.AB ?? null);
    const obp = calcOBP(b?.H ?? null, b?.BB ?? null, b?.HBP ?? null, b?.AB ?? null, b?.SF ?? null);
    const ops = b ? calcOPS(b) : null;
    const pa = b?.PA ?? 0;
    const isHot = s.player.form >= 2 || (pa >= 35 && ops !== null && ops >= 0.86);
    const isCold = !isHot && (s.player.form <= -2 || (pa >= 35 && ops !== null && ops <= 0.62));
    return {
      battingOrder: idx + 1,
      player: s.player,
      position: s.position,
      ability: s.player.ability,
      form: s.player.form,
      fatigue: Math.round(s.player.fatigue),
      batsLabel: getBatsLabel(s.player),
      avg,
      hr: b?.HR ?? b?.confirmedMinHR ?? 0,
      rbi: b?.RBI ?? b?.confirmedMinRBI ?? 0,
      obp,
      ops,
      pa,
      isHot,
      isCold,
      rotationReason: s.rotationReason,
    };
  });
}

function buildBullpenStatusList(
  snap: CareerSave,
  teamId: TeamId,
  starterId: string,
  date: string,
  round: number,
  isPostseason: boolean
): OpponentBullpenStatusRow[] {
  const tState = snap.teams[teamId];
  const isOnNtDuty = (p: Player) => !isPostseason && isPlayerOnNationalTeamDuty(p, snap.gamesPlayed);
  const roleOrder: Record<BullpenRoleType, number> = {
    마무리: 1,
    셋업맨: 2,
    필승조: 3,
    중간계투: 4,
    롱릴리프: 5,
    추격조: 6,
  };

  const relievers = Object.values(snap.players)
    .filter(
      (p) =>
        p.teamId === teamId &&
        p.id !== starterId &&
        p.role === '투수' &&
        p.rosterTier === '1군' &&
        !tState.rotationOrder.includes(p.id) &&
        isPitcherEligibleForGame(snap, p, isPostseason, isOnNtDuty)
    )
    .map((p) => {
      const role = normalizeBullpenRole(p.pitchRole);
      const ps = p.stats as PitcherStats;
      const outs = ps?.outs ?? 0;
      const era = calcERA(ps?.ER ?? null, outs > 0 ? outs : null);
      const whip = calcWHIP(ps?.H ?? null, ps?.BB ?? null, outs > 0 ? outs : null);
      const consec = p.consecutivePitchDays ?? 0;
      const recent3P = getRecent3DayPitchCount(p, date);
      const restDays = getPitcherRestDays(p, date, round);
      const fatigue = Math.round(p.fatigue);
      const staminaPct = Math.round(clamp(100 - fatigue, 0, 100));

      let availability: BullpenAvailability = '가용';
      let availabilityReason = '정상 등판 가능';

      if (consec >= 3 || fatigue >= 72 || recent3P >= 70) {
        availability = '휴식권장';
        availabilityReason =
          consec >= 3
            ? `${consec}일 연투 누적`
            : fatigue >= 72
            ? `피로 누적(체력 ${staminaPct}%)`
            : `3일 ${recent3P}구 과부하`;
      } else if (consec >= 2) {
        availability = '주의(연투)';
        availabilityReason = `${consec}일 연속 등판`;
      } else if (fatigue >= 46 || recent3P >= 45) {
        availability = '주의(피로)';
        availabilityReason = `체력 ${staminaPct}% · 최근 3일 ${recent3P}구`;
      }

      return {
        player: p,
        role,
        ability: p.ability,
        era,
        whip,
        saves: ps?.SV ?? 0,
        holds: ps?.HLD ?? 0,
        fatigue,
        staminaPct,
        consecutiveDays: consec,
        recent3DayPitches: recent3P,
        restDays,
        availability,
        availabilityReason,
      };
    })
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || b.ability - a.ability);

  return relievers;
}

function computeTeamFivePowers(
  snap: CareerSave,
  teamId: TeamId,
  lineup: PreGameBatterRow[],
  starter: PreGameStarterComparison,
  bullpen: OpponentBullpenStatusRow[]
): Record<PowerCategoryKey, number> {
  // 1. 타격
  const batAvg =
    lineup.length > 0
      ? lineup.reduce((sum, row) => {
          const ob = ensurePlayerOotpRatingsInPlace(row.player).batting;
          const skill = ob
            ? ob.babip.cur * 0.28 + ob.hrPower.cur * 0.26 + ob.eye.cur * 0.24 + ob.avoidK.cur * 0.22
            : row.ability;
          const opsBonus = row.pa >= 35 && row.ops !== null ? clamp((row.ops - 0.74) * 20, -5, 6) : 0;
          const fatiguePen = Math.max(0, row.fatigue - 55) * 0.14;
          return sum + row.ability * 0.52 + skill * 0.48 + row.form * 1.15 + opsBonus - fatiguePen;
        }, 0) / lineup.length
      : 68;

  // 2. 선발투수
  const spEraBonus = starter.era !== null && starter.gamesStarted >= 2 ? clamp((4.2 - starter.era) * 2.2, -6, 6) : 0;
  const spFatiguePen = Math.max(0, starter.fatigue - 30) * 0.22;
  const spScore =
    starter.ability * 0.55 +
    (starter.stuff * 0.42 + starter.control * 0.42 + starter.staminaRating * 0.16) * 0.45 +
    starter.form * 1.2 +
    spEraBonus -
    spFatiguePen;

  // 3. 불펜
  const topRelievers = bullpen.slice(0, 6);
  const bullpenScore =
    topRelievers.length > 0
      ? topRelievers.reduce((sum, r) => {
          const availPen =
            r.availability === '휴식권장' ? 8 : r.availability === '주의(연투)' ? 4 : r.availability === '주의(피로)' ? 3 : 0;
          const eraAdj = r.era !== null && ((r.player.stats as PitcherStats)?.outs ?? 0) >= 18 ? clamp((4.1 - r.era) * 1.8, -5, 5) : 0;
          return sum + r.ability + r.player.form * 0.9 + eraAdj - availPen;
        }, 0) / topRelievers.length
      : 66;

  // 4. 수비
  const defenseScore =
    lineup.length > 0
      ? lineup.reduce((sum, row) => {
          if (row.position === 'DH') return sum + 72;
          const eff = computeEffectiveFieldingAtPosition(row.player, row.position);
          const posWeight = row.position === 'C' || row.position === 'SS' || row.position === 'CF' ? 1.15 : 0.95;
          return sum + (eff.effectiveFielding * 0.72 + eff.proficiency * 0.28) * posWeight;
        }, 0) / lineup.length
      : 68;

  // 5. 주루
  const baserunningScore =
    lineup.length > 0
      ? lineup.reduce((sum, row) => {
          const run = ensurePlayerOotpRatingsInPlace(row.player).baserunning;
          const raw = run
            ? run.speed * 0.45 + run.baserunning * 0.35 + run.stealAbility * 0.2
            : getRunnerSpeedScore(row.player);
          return sum + raw - Math.max(0, row.fatigue - 55) * 0.12;
        }, 0) / lineup.length
      : 66;

  void snap;
  void teamId;

  return {
    타격: Math.round(clamp(batAvg, 42, 96)),
    선발투수: Math.round(clamp(spScore, 42, 96)),
    불펜: Math.round(clamp(bullpenScore, 42, 96)),
    수비: Math.round(clamp(defenseScore, 42, 96)),
    주루: Math.round(clamp(baserunningScore, 42, 96)),
  };
}

function buildOpponentSpotlights(
  snap: CareerSave,
  oppTeamId: TeamId,
  oppLineup: PreGameBatterRow[],
  oppStarter: PreGameStarterComparison,
  oppBullpen: OpponentBullpenStatusRow[]
): {
  keyPlayers: OpponentSpotlightPlayer[];
  hotPlayers: OpponentSpotlightPlayer[];
  coldPlayers: OpponentSpotlightPlayer[];
} {
  const oppActive = Object.values(snap.players).filter(
    (p) => p.teamId === oppTeamId && p.rosterTier === '1군' && !p.injury
  );

  // Key players: top 2 hitters from lineup + top pitcher (today's starter or closer)
  const keyBatters = [...oppLineup]
    .sort((a, b) => b.ability + b.form * 1.2 - (a.ability + a.form * 1.2))
    .slice(0, 2)
    .map<OpponentSpotlightPlayer>((row) => ({
      player: row.player,
      tag: '핵심 타자',
      statLine:
        row.pa >= 10 && row.avg !== null && row.ops !== null
          ? `타율 ${row.avg.toFixed(3).replace(/^0/, '')} · ${row.hr}HR ${row.rbi}타점 · OPS ${row.ops.toFixed(3)}`
          : `OVR ${row.ability} · ${row.battingOrder}번 타자 (${row.position})`,
      form: row.form,
      reason: `${row.battingOrder}번 중심 타선 핵심 (${row.position} · OVR ${row.ability})`,
    }));

  const closer = oppBullpen.find((b) => b.role === '마무리');
  const keyPitcherObj =
    oppStarter.ability >= (closer?.ability ?? 0) - 2 ? oppStarter.player : closer!.player;
  const kpStats = keyPitcherObj.stats as PitcherStats;
  const kpEra = calcERA(kpStats?.ER ?? null, (kpStats?.outs ?? 0) > 0 ? kpStats.outs : null);
  const keyPitcher: OpponentSpotlightPlayer = {
    player: keyPitcherObj,
    tag: '핵심 투수',
    statLine:
      kpEra !== null
        ? `ERA ${kpEra.toFixed(2)} · ${kpStats.W ?? 0}승 ${kpStats.L ?? 0}패${(kpStats.SV ?? 0) > 0 ? ` ${kpStats.SV}세` : ''} · ${kpStats.SO ?? 0}K`
        : `OVR ${keyPitcherObj.ability} · ${keyPitcherObj.id === oppStarter.player.id ? '오늘 선발투수' : '마무리 투수'}`,
    form: keyPitcherObj.form,
    reason:
      keyPitcherObj.id === oppStarter.player.id
        ? `오늘 등판 선발 (${oppStarter.throwsLabel} · 구속 ${oppStarter.velocityKmh}km/h)`
        : `뒷문 수호신 (${closer?.availability ?? '가용'})`,
  };

  const keyPlayers = [...keyBatters, keyPitcher];

  // Hot & Cold players
  const scoredTrend = oppActive.map((p) => {
    let perfScore = p.form * 2.4;
    let statLine = `OVR ${p.ability} · 컨디션 ${p.form >= 0 ? `+${p.form}` : p.form}`;
    if (p.role === '타자') {
      const b = getBatterStatsSource(p);
      const pa = b?.PA ?? 0;
      const avg = calcAVG(b?.H ?? null, b?.AB ?? null);
      const ops = b ? calcOPS(b) : null;
      if (pa >= 20 && ops !== null && avg !== null) {
        perfScore += (ops - 0.74) * 15;
        statLine = `타율 ${avg.toFixed(3).replace(/^0/, '')} · ${b.HR ?? 0}HR · OPS ${ops.toFixed(3)}`;
      }
    } else {
      const ps = p.stats as PitcherStats;
      const outs = ps?.outs ?? 0;
      const era = calcERA(ps?.ER ?? null, outs > 0 ? outs : null);
      if (outs >= 18 && era !== null) {
        perfScore += (4.2 - era) * 1.7;
        statLine = `ERA ${era.toFixed(2)} · ${formatIP(outs)}이닝 · ${ps.SO ?? 0}K`;
      }
    }
    return { player: p, perfScore, statLine };
  });

  const hotPlayers: OpponentSpotlightPlayer[] = scoredTrend
    .filter((x) => x.player.form >= 1 || x.perfScore >= 2.2)
    .sort((a, b) => b.perfScore - a.perfScore || b.player.ability - a.player.ability)
    .slice(0, 3)
    .map((x) => ({
      player: x.player,
      tag: '상승세',
      statLine: x.statLine,
      form: x.player.form,
      reason:
        x.player.form >= 3
          ? `최상 컨디션 (+${x.player.form}) · 집중 견제 필요`
          : `최근 타격·투구 감각 상승 중`,
    }));

  const coldPlayers: OpponentSpotlightPlayer[] = scoredTrend
    .filter((x) => x.player.form <= -1 || x.perfScore <= -2.0)
    .sort((a, b) => a.perfScore - b.perfScore || b.player.ability - a.player.ability)
    .slice(0, 3)
    .map((x) => ({
      player: x.player,
      tag: '하락세',
      statLine: x.statLine,
      form: x.player.form,
      reason:
        x.player.form <= -3
          ? `심각한 슬럼프 (${x.player.form}) · 적극 승부 기회`
          : `최근 경기력 침체 구간`,
    }));

  return { keyPlayers, hotPlayers, coldPlayers };
}

function buildStrengthsAndWeaknesses(params: {
  oppTeamId: TeamId;
  oppPowers: Record<PowerCategoryKey, number>;
  myPowers: Record<PowerCategoryKey, number>;
  oppStarter: PreGameStarterComparison;
  oppForm: TeamRecentFormSummary;
  oppInjuries: OpponentInjuredRow[];
  oppBullpenSummary: { total: number; available: number; caution: number; restRecommended: number };
  oppLineup: PreGameBatterRow[];
}): { strengths: string[]; weaknesses: string[] } {
  const { oppTeamId, oppPowers, myPowers, oppStarter, oppForm, oppInjuries, oppBullpenSummary, oppLineup } = params;
  const oppName = KBO_TEAMS[oppTeamId].shortName;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Category-based strengths & weaknesses
  const categories: PowerCategoryKey[] = ['타격', '선발투수', '불펜', '수비', '주루'];
  const sortedBest = [...categories].sort((a, b) => oppPowers[b] - oppPowers[a]);
  const sortedWorst = [...categories].sort((a, b) => oppPowers[a] - oppPowers[b]);

  for (const cat of sortedBest.slice(0, 2)) {
    const sc = oppPowers[cat];
    const diff = sc - myPowers[cat];
    if (cat === '타격' && (sc >= 74 || diff >= 3)) {
      const topBat = [...oppLineup].sort((a, b) => b.ability - a.ability)[0];
      strengths.push(`강력한 타선 화력(타격 ${sc}점) — ${topBat ? `${topBat.player.name} 중심의 장타·출루 생산력 우수` : '상위 타선 집중력 우수'}`);
    } else if (cat === '선발투수' && (sc >= 74 || diff >= 3)) {
      strengths.push(
        `경쟁력 있는 선발 마운드(${oppStarter.player.name} · OVR ${oppStarter.ability} · 구속 ${oppStarter.velocityKmh}km/h)`
      );
    } else if (cat === '불펜' && (sc >= 73 || diff >= 3)) {
      strengths.push(`탄탄한 뒷문 계투진(불펜 ${sc}점 · 가용 ${oppBullpenSummary.available}/${oppBullpenSummary.total}명)`);
    } else if (cat === '수비' && (sc >= 74 || diff >= 3)) {
      strengths.push(`안정적인 센터라인 수비(수비 ${sc}점) — 실책 억제와 병살 처리 능력 우수`);
    } else if (cat === '주루' && (sc >= 73 || diff >= 3)) {
      strengths.push(`기동력 있는 주루 플레이(주루 ${sc}점) — 도루와 적극적인 추가 진루 주의`);
    }
  }

  if (oppForm.last5Wins >= 4) {
    strengths.push(`최근 5경기 ${oppForm.last5Wins}승 ${oppForm.last5Losses}패(${oppForm.streak})로 팀 분위기 절정`);
  }
  if (oppStarter.staminaRemainingPct >= 90 && oppStarter.restDays >= 5) {
    strengths.push(`상대 선발 ${oppStarter.player.name} 충분한 휴식(${oppStarter.restDays}일 · 체력 ${oppStarter.staminaRemainingPct}%) 확보`);
  }

  // Weaknesses
  if (oppBullpenSummary.restRecommended >= 2 || oppBullpenSummary.caution + oppBullpenSummary.restRecommended >= Math.ceil(oppBullpenSummary.total * 0.5)) {
    weaknesses.push(
      `불펜 과부하 노출 — 연투·피로 투수 ${oppBullpenSummary.caution + oppBullpenSummary.restRecommended}명(휴식권장 ${oppBullpenSummary.restRecommended}명), 중반 이후 공략 유리`
    );
  }
  if (oppStarter.fatigue >= 45 || oppStarter.form <= -2 || (oppStarter.era !== null && oppStarter.era >= 5.0)) {
    weaknesses.push(
      `상대 선발 ${oppStarter.player.name} 불안 요소(${
        oppStarter.era !== null && oppStarter.era >= 5.0
          ? `ERA ${oppStarter.era.toFixed(2)}`
          : oppStarter.form <= -2
          ? `컨디션 ${oppStarter.form}`
          : `체력 ${oppStarter.staminaRemainingPct}%`
      }) — 초반 투구 수 압박 유효`
    );
  }
  const coreInjuries = oppInjuries.filter((i) => i.isCore);
  if (coreInjuries.length > 0) {
    weaknesses.push(
      `핵심 전력 부상 이탈(${coreInjuries.slice(0, 2).map((i) => `${i.player.name}/${i.position}`).join(', ')})으로 선수층 약화`
    );
  }
  for (const cat of sortedWorst.slice(0, 2)) {
    const sc = oppPowers[cat];
    const diff = sc - myPowers[cat];
    if (weaknesses.length >= 4) break;
    if (diff <= -3 || sc <= 67) {
      if (cat === '타격') weaknesses.push(`타선 응집력 열세(타격 ${sc}점 · 우리 대비 ${diff}) — 정면 승부로 이닝 소화 유리`);
      else if (cat === '선발투수') weaknesses.push(`선발 매치업 열세(선발 ${sc}점 · 우리 대비 ${diff}) — 초반 대량 득점 기회`);
      else if (cat === '불펜') weaknesses.push(`계투진 뎁스 취약(불펜 ${sc}점) — 6회 이후 불펜전 승부 유리`);
      else if (cat === '수비') weaknesses.push(`수비 안정성 약점(수비 ${sc}점) — 적극적인 인플레이 타구·작전 압박 유효`);
      else if (cat === '주루') weaknesses.push(`기동력 부족(주루 ${sc}점) — 단타 위주 억제 시 실점 최소화 가능`);
    }
  }
  if (oppForm.last5Losses >= 4 && weaknesses.length < 4) {
    weaknesses.push(`최근 5경기 ${oppForm.last5Wins}승 ${oppForm.last5Losses}패(${oppForm.streak}) 하락세 — 선취점 시 흐름 장악 가능`);
  }

  if (strengths.length === 0) {
    strengths.push(`${oppName} 특유의 균형 잡힌 전력 구성(최고 영역: ${sortedBest[0]} ${oppPowers[sortedBest[0]]}점)`);
  }
  if (weaknesses.length === 0) {
    weaknesses.push(`상대적으로 열세인 ${sortedWorst[0]} 부문(${oppPowers[sortedWorst[0]]}점)을 집중 공략할 필요`);
  }

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
  };
}

function buildCoachingReport(params: {
  snap: CareerSave;
  myTeamId: TeamId;
  oppTeamId: TeamId;
  myStarter: PreGameStarterComparison;
  oppStarter: PreGameStarterComparison;
  oppLineup: PreGameBatterRow[];
  oppKeyPlayers: OpponentSpotlightPlayer[];
  oppBullpenSummary: { total: number; available: number; caution: number; restRecommended: number };
  myPowers: Record<PowerCategoryKey, number>;
  oppPowers: Record<PowerCategoryKey, number>;
  stadium: string;
  parkLabel: '타자 친화' | '투수 친화' | '중립';
  winPct: number;
}): PreGameCoachingReport {
  const {
    snap,
    myTeamId,
    oppTeamId,
    myStarter,
    oppStarter,
    oppLineup,
    oppKeyPlayers,
    oppBullpenSummary,
    myPowers,
    oppPowers,
    stadium,
    parkLabel,
    winPct,
  } = params;

  const staff = snap.coaches[myTeamId] ?? [];
  const manager = staff.find((c) => c.role === '감독');
  const pitchCoach = staff.find((c) => c.role === '투수코치');
  const hitCoach = staff.find((c) => c.role === '타격코치');
  const defCoach = staff.find((c) => c.role === '수비코치');
  const batCoach = staff.find((c) => c.role === '배터리코치');

  const managerName = manager?.name ?? `${KBO_TEAMS[myTeamId].shortName} 감독`;
  const managerStyle = manager?.tacticalStyle ?? '밸런스';
  const pitchCoachName = pitchCoach?.name ?? '투수코치';
  const hitCoachName = hitCoach?.name ?? '타격코치';
  const defenseCoachName = defCoach?.name ?? '수비코치';
  const batteryCoachName = batCoach?.name ?? '배터리코치';

  const oppName = KBO_TEAMS[oppTeamId].shortName;
  const topOppBatter = oppKeyPlayers.find((k) => k.tag === '핵심 타자')?.player ?? oppLineup[2]?.player;
  const spEdge = myPowers['선발투수'] - oppPowers['선발투수'];
  const batEdge = myPowers['타격'] - oppPowers['타격'];
  const bullpenExhausted = oppBullpenSummary.restRecommended >= 2 || oppBullpenSummary.caution >= 3;

  const overallSummary =
    winPct >= 56
      ? `[${managerStyle}] 전체 전력과 매치업에서 우리가 근소 이상 우위(${winPct}%)입니다. ${myStarter.player.name}의 초반 리드를 앞세워 무리 없는 투수 운용으로 승기를 굳히겠습니다.`
      : winPct <= 44
      ? `[${managerStyle}] ${oppName}의 전력이 만만치 않습니다(예상 승률 ${winPct}%). 초반 실점을 최소화하고 ${
          bullpenExhausted ? '피로가 쌓인 상대 불펜 구간' : '후반 대타·작전 승부처'
        }에서 역전을 노리겠습니다.`
      : `[${managerStyle}] 팽팽한 백중세(${winPct}% vs ${100 - winPct}%)입니다. ${stadium}(${parkLabel}) 구장 특성과 중반 불펜 타이밍 싸움이 승부를 가를 것입니다.`;

  const pitchingPlan =
    `${myStarter.player.name}(체력 ${myStarter.staminaRemainingPct}% · 휴식 ${myStarter.restDays}일)은 ` +
    `${topOppBatter ? `${oppName} 핵심 타자 ${topOppBatter.name}(OVR ${topOppBatter.ability})과의 승부가 핵심` : '상대 중심 타선 억제가 핵심'}입니다. ` +
    `${
      parkLabel === '타자 친화'
        ? '타자 친화 구장이므로 낮은 코스 제구와 땅볼 유도에 집중합니다.'
        : '초구 스트라이크 비율을 높여 6이닝 이상 이닝 소화를 목표로 합니다.'
    }`;

  const battingPlan =
    `상대 선발 ${oppStarter.player.name}(${oppStarter.throwsLabel} · 평균 ${oppStarter.velocityKmh}km/h · 제구 ${oppStarter.control}) 상대로 ` +
    `${
      oppStarter.control <= 68
        ? '유인구를 철저히 참아내며 볼넷과 투구 수 누적을 유도해야 합니다.'
        : oppStarter.stuff >= 78
        ? '구위가 뛰어난 만큼 빠른 카운트 노림수 타격과 컨택 집중이 유효합니다.'
        : '좌·우 타선 밸런스를 살려 1~2회부터 적극적인 선취점을 노리겠습니다.'
    }` +
    `${bullpenExhausted ? ` 특히 ${oppName} 불펜 피로도가 높아 선발을 조기 강판시키면 승산이 크게 올라갑니다.` : ''}`;

  const defenseAndBaserunningNote =
    `${
      myPowers['주루'] - oppPowers['주루'] >= 3
        ? '주루 우위를 살린 적극적인 도루·히트앤드런으로 상대 내야를 흔들겠습니다.'
        : oppPowers['주루'] >= 75
        ? `상대 기동력(주루 ${oppPowers['주루']}점)이 위협적이므로 퀵모션과 도루 저지 사인을 강화합니다.`
        : '실책 없는 안정 수비와 볼배합 완성도로 한 점 승부에 대비합니다.'
    }`;

  const keyMatchup =
    spEdge >= 4
      ? `${myStarter.player.name} vs ${oppName} 중심 타선 — 선발 에이스 우위 유지`
      : batEdge >= 4
      ? `우리 타선 vs ${oppStarter.player.name} — 초반 집중타로 조기 강판 유도`
      : `${myStarter.player.name} vs ${oppStarter.player.name} 선발 맞대결 & 7회 이후 필승조 싸움`;

  return {
    managerName,
    managerStyle,
    pitchCoachName,
    hitCoachName,
    defenseCoachName,
    batteryCoachName,
    overallSummary,
    pitchingPlan,
    battingPlan,
    defenseAndBaserunningNote,
    keyMatchup,
  };
}

/**
 * 다음 예정된 경기(정규시즌 또는 포스트시즌)의 전체 전력 분석 리포트와
 * 실제 경기 실행 시 100% 동일하게 적용될 LockedGameLineupPlan을 생성합니다.
 * 원본 career 객체는 절대 변경하지 않습니다.
 */
export function buildPreGameAnalysis(career: CareerSave): PreGameAnalysisReport | null {
  const myTeamId = career.playerTeamId;
  let round = 0;
  let date = career.currentDate ?? `${career.season}-04-01`;
  let awayTeam: TeamId;
  let homeTeam: TeamId;
  let isPostseason = false;
  let postseasonLabel: string | undefined;
  let seriesGameNumber = 1;
  let remainingSeriesGames = 1;
  let startOffset = 0;
  let hasMondayRestBefore = false;
  let isAllStarBreakBefore = false;

  if (career.phase === 'REGULAR_SEASON') {
    if (career.gamesPlayed >= career.totalRegularGames || career.currentSeriesIndex >= career.schedule.length) {
      return null;
    }
    let seriesIdx = career.currentSeriesIndex;
    let series = career.schedule[seriesIdx];
    if (series && series.completedRounds >= 3 && seriesIdx + 1 < career.schedule.length) {
      seriesIdx += 1;
      series = career.schedule[seriesIdx];
    }
    if (!series) return null;
    startOffset = Math.min(2, Math.max(0, series.completedRounds));
    const matchup = series.matchups.find((m) => m.away === myTeamId || m.home === myTeamId);
    if (!matchup) return null;
    awayTeam = matchup.away;
    homeTeam = matchup.home;
    round = series.startRound + startOffset;
    date = series.dates[startOffset] ?? series.dates[series.dates.length - 1] ?? date;
    seriesGameNumber = startOffset + 1;
    remainingSeriesGames = Math.max(1, 3 - startOffset);
    hasMondayRestBefore = Boolean(series.hasMondayRestBefore);
    isAllStarBreakBefore = Boolean(series.isAllStarBreakBefore);
  } else if (career.phase === 'POSTSEASON' && career.postseason.currentSeries && !career.postseason.currentSeries.winnerTeam) {
    const psSeries = career.postseason.currentSeries;
    // 사용자 구단이 출전하지 않는 타 구단 포스트시즌 경기라도 분석 가능하지만,
    // 여기서는 사용자 구단 참여 시 myTeamId 기준, 미참여 시 상위 시드 기준으로 표시
    const gameNumber = psSeries.games.length + 1;
    const psGamesCount = career.gamesLedger.filter((g) => g.isPostseason).length;
    round = 1000 + psGamesCount + 1;
    date = addDaysIso(`${career.season}-10-05`, psGamesCount);
    homeTeam = psSeries.higherSeedTeam;
    awayTeam = psSeries.lowerSeedTeam;
    if (psSeries.round === 'SEMI_PO' || psSeries.round === 'PO') {
      if (gameNumber === 3 || gameNumber === 4) {
        homeTeam = psSeries.lowerSeedTeam;
        awayTeam = psSeries.higherSeedTeam;
      }
    } else if (psSeries.round === 'KOREAN_SERIES') {
      if (gameNumber >= 3 && gameNumber <= 5) {
        homeTeam = psSeries.lowerSeedTeam;
        awayTeam = psSeries.higherSeedTeam;
      }
    }
    isPostseason = true;
    postseasonLabel = `${psSeries.label} ${gameNumber}차전`;
    seriesGameNumber = gameNumber;
    remainingSeriesGames = 1;
    if (awayTeam !== myTeamId && homeTeam !== myTeamId) {
      return null;
    }
  } else {
    return null;
  }

  const isMyTeamHome = homeTeam === myTeamId;
  const oppTeamId = isMyTeamHome ? awayTeam : homeTeam;

  // Clone & project exact pre-game recovery/injury state (read-only on original career)
  const snap = projectPreGameSnapshot(career, {
    isPostseason,
    startOffset,
    hasMondayRestBefore,
    isAllStarBreakBefore,
  });

  const onNtDuty = (p: Player) => !isPostseason && isPlayerOnNationalTeamDuty(p, snap.gamesPlayed);

  // Build starting pitching plans using the exact engine function
  const awayPitchPlan = buildRealisticPitchingPlan(snap, awayTeam, round, date, {
    isPostseason,
    isDoubleheaderGame2: false,
    isOnNationalDuty: onNtDuty,
  });
  const homePitchPlan = buildRealisticPitchingPlan(snap, homeTeam, round, date, {
    isPostseason,
    isDoubleheaderGame2: false,
    isOnNationalDuty: onNtDuty,
  });

  const myPitchPlan = isMyTeamHome ? homePitchPlan : awayPitchPlan;
  const oppPitchPlan = isMyTeamHome ? awayPitchPlan : homePitchPlan;

  // Build user team lineup faithfully (exact configured 1~9 order + injury safety fallback)
  const userBuilt = buildUserDeterministicLineup(snap, myTeamId, isPostseason);

  // Build opponent AI lineup deterministically from real ratings, condition, injuries, stamina, platoon
  const oppRng = new SeededRng(
    (snap.rngState ^ hashSeed(`pregame-ai-${snap.season}-${round}-${oppTeamId}`)) >>> 0
  );
  const oppBatPlan: GameBatterPlan = buildRealisticGameLineupAndBench(
    snap,
    oppTeamId,
    myTeamId,
    myPitchPlan.starter,
    round,
    {
      isPostseason,
      isDoubleheaderGame2: false,
      isOnNationalDuty: onNtDuty,
      getPerfDelta: (p) => clamp(p.form * 0.45, -2.5, 2.5),
      rng: oppRng,
    }
  );

  const awayStarters = isMyTeamHome ? oppBatPlan.starters : userBuilt.starters;
  const homeStarters = isMyTeamHome ? userBuilt.starters : oppBatPlan.starters;

  const myLineup = buildBatterRows(userBuilt.starters);
  const oppLineup = buildBatterRows(oppBatPlan.starters);

  const myStarter = buildStarterComparison(myPitchPlan.starter, myPitchPlan.starterUsageType, date, round);
  const oppStarter = buildStarterComparison(oppPitchPlan.starter, oppPitchPlan.starterUsageType, date, round);

  const myBullpen = buildBullpenStatusList(snap, myTeamId, myStarter.player.id, date, round, isPostseason);
  const oppBullpen = buildBullpenStatusList(snap, oppTeamId, oppStarter.player.id, date, round, isPostseason);

  const oppBullpenSummary = {
    total: oppBullpen.length,
    available: oppBullpen.filter((b) => b.availability === '가용').length,
    caution: oppBullpen.filter((b) => b.availability === '주의(연투)' || b.availability === '주의(피로)').length,
    restRecommended: oppBullpen.filter((b) => b.availability === '휴식권장').length,
  };

  const oppInjuries: OpponentInjuredRow[] = Object.values(snap.players)
    .filter((p) => p.teamId === oppTeamId && Boolean(p.injury) && p.rosterTier !== '은퇴')
    .map((p) => ({
      player: p,
      position: p.position,
      ability: p.ability,
      severity: p.injury!.severity,
      description: p.injury!.description,
      daysRemaining: Math.max(1, p.injury!.daysRemaining),
      isCore: p.ability >= 76 || p.rosterTier === '1군',
    }))
    .sort((a, b) => (b.isCore ? 1 : 0) - (a.isCore ? 1 : 0) || b.ability - a.ability);

  const standings = computeStandings(snap.gamesLedger);
  const defaultStanding = (tid: TeamId): StandingsRow => ({
    rank: 1,
    isTied: false,
    teamId: tid,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    pct: 0,
    gb: 0,
    streak: '—',
    runsScored: 0,
    runsAllowed: 0,
    runDiff: 0,
  });
  const myStanding = standings.find((r) => r.teamId === myTeamId) ?? defaultStanding(myTeamId);
  const oppStanding = standings.find((r) => r.teamId === oppTeamId) ?? defaultStanding(oppTeamId);

  const myForm = computeTeamRecentForm(snap.gamesLedger, myTeamId, oppTeamId);
  const oppForm = computeTeamRecentForm(snap.gamesLedger, oppTeamId, myTeamId);

  const myPowers = computeTeamFivePowers(snap, myTeamId, myLineup, myStarter, myBullpen);
  const oppPowers = computeTeamFivePowers(snap, oppTeamId, oppLineup, oppStarter, oppBullpen);

  const categoryDetail = (key: PowerCategoryKey): string => {
    switch (key) {
      case '타격':
        return '1~9번 선발 타선 능력치·OPS·컨디션';
      case '선발투수':
        return `${myStarter.player.name}(${myStarter.ability}) vs ${oppStarter.player.name}(${oppStarter.ability})`;
      case '불펜':
        return `1군 계투진 능력치·연투·체력 가용성`;
      case '수비':
        return '선발 9인 포지션 숙련도·실효 수비력';
      case '주루':
        return '선발 라인업 주력·주루 센스·도루 능력';
    }
  };

  const powerComparison: PowerComparisonCategory[] = (['타격', '선발투수', '불펜', '수비', '주루'] as PowerCategoryKey[]).map(
    (key) => {
      const diff = myPowers[key] - oppPowers[key];
      return {
        key,
        label: key,
        myScore: myPowers[key],
        oppScore: oppPowers[key],
        diff,
        advantage: diff >= 2 ? 'MY' : diff <= -2 ? 'OPP' : 'EVEN',
        detailNote: categoryDetail(key),
      };
    }
  );

  // Predicted Win Probability combining team power, starting pitcher, recent form, home advantage & bullpen
  const batFactor = (myPowers['타격'] - oppPowers['타격']) * 0.68;
  const spFactor = (myPowers['선발투수'] - oppPowers['선발투수']) * 0.78;
  const bullpenFactor = (myPowers['불펜'] - oppPowers['불펜']) * 0.42;
  const defRunFactor =
    (myPowers['수비'] - oppPowers['수비']) * 0.24 + (myPowers['주루'] - oppPowers['주루']) * 0.16;
  const recentFormFactor =
    (myForm.last5Wins - myForm.last5Losses - (oppForm.last5Wins - oppForm.last5Losses)) * 0.9;
  const homeFieldFactor = isMyTeamHome ? 2.6 : -2.6;

  const rawEdge = batFactor + spFactor + bullpenFactor + defRunFactor + recentFormFactor + homeFieldFactor;
  const myWinPct = Math.round(clamp(50 + rawEdge, 24, 76));
  const oppWinPct = 100 - myWinPct;

  const factors: WinProbabilityFactor[] = [
    { label: '선발 매치업', delta: Number(spFactor.toFixed(1)) },
    { label: '타선 화력', delta: Number(batFactor.toFixed(1)) },
    { label: '불펜 가용력', delta: Number(bullpenFactor.toFixed(1)) },
    { label: '수비·주루', delta: Number(defRunFactor.toFixed(1)) },
    { label: '최근 5경기 흐름', delta: Number(recentFormFactor.toFixed(1)) },
    { label: isMyTeamHome ? '홈 구장 이점' : '원정 부담', delta: Number(homeFieldFactor.toFixed(1)) },
  ];

  const homeTeamInfo = KBO_TEAMS[homeTeam];
  const parkFactor = homeTeamInfo.parkFactor ?? 1.0;
  const parkLabel: '타자 친화' | '투수 친화' | '중립' =
    parkFactor >= 1.03 ? '타자 친화' : parkFactor <= 0.97 ? '투수 친화' : '중립';

  const spotlights = buildOpponentSpotlights(snap, oppTeamId, oppLineup, oppStarter, oppBullpen);
  const { strengths: oppStrengths, weaknesses: oppWeaknesses } = buildStrengthsAndWeaknesses({
    oppTeamId,
    oppPowers,
    myPowers,
    oppStarter,
    oppForm,
    oppInjuries,
    oppBullpenSummary,
    oppLineup,
  });

  const coachingReport = buildCoachingReport({
    snap,
    myTeamId,
    oppTeamId,
    myStarter,
    oppStarter,
    oppLineup,
    oppKeyPlayers: spotlights.keyPlayers,
    oppBullpenSummary,
    myPowers,
    oppPowers,
    stadium: homeTeamInfo.stadium,
    parkLabel,
    winPct: myWinPct,
  });

  const rivalry = getRivalryEffectProfile(snap, awayTeam, homeTeam);

  const lockedPlan: LockedGameLineupPlan = {
    season: career.season,
    round,
    date,
    isPostseason,
    awayTeam,
    homeTeam,
    awayStarterId: awayPitchPlan.starter.id,
    homeStarterId: homePitchPlan.starter.id,
    awayStarterUsageType: awayPitchPlan.starterUsageType,
    homeStarterUsageType: homePitchPlan.starterUsageType,
    awayLineup: awayStarters.map((s, idx) => ({
      playerId: s.player.id,
      position: s.position,
      battingOrder: idx + 1,
    })),
    homeLineup: homeStarters.map((s, idx) => ({
      playerId: s.player.id,
      position: s.position,
      battingOrder: idx + 1,
    })),
  };

  return {
    season: career.season,
    round,
    date,
    displayDate: formatKoreanMatchDate(date),
    isPostseason,
    postseasonLabel,
    seriesGameNumber,
    remainingSeriesGames,
    stadium: homeTeamInfo.stadium,
    parkFactor,
    parkLabel,
    myTeamId,
    oppTeamId,
    awayTeam,
    homeTeam,
    isMyTeamHome,
    rivalryName: rivalry?.rivalry.name,
    rivalryIntensity: rivalry?.rivalry.intensity,
    myStanding,
    oppStanding,
    myForm,
    oppForm,
    myStarter,
    oppStarter,
    myLineup,
    oppLineup,
    myLineupNotes: userBuilt.notes,
    oppLineupNotes: oppBatPlan.rotationNotes,
    powerComparison,
    oppInjuries,
    oppBullpen,
    oppBullpenSummary,
    oppKeyPlayers: spotlights.keyPlayers,
    oppHotPlayers: spotlights.hotPlayers,
    oppColdPlayers: spotlights.coldPlayers,
    oppStrengths,
    oppWeaknesses,
    coachingReport,
    winProbability: {
      myWinPct,
      oppWinPct,
      factors,
    },
    lockedPlan,
  };
}
