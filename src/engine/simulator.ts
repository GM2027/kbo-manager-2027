import { syncAllAgesToDateInPlace } from './ageEngine';
import { isMilitaryServing } from './militaryEngine';
import { DEFAULT_INVESTMENTS, TICKET_PRICE_CONFIG } from '../data/financesData';
import { getV18EngineSkillBonus } from '../data/kboRealMetrics';
import {
  computeTravelDistanceKm,
  KBO_TEAMS,
  TEAM_IDS,
  upsertChampionRecord,
} from '../data/kboTeams';
import { enforceOvrPotInvariantInPlace } from '../data/v18Importer';
import { simulateRealisticBaseballGame } from './gamePlayEngine';
import { addDaysIso } from './schedule';
import {
  BatterStats,
  BoxscoreBatterLine,
  BoxscorePitcherLine,
  CareerSave,
  ChampionRecord,
  GameRecord,
  GrowthLog,
  InjuryLog,
  InjurySeverity,
  KeyPerformer,
  PitcherStats,
  Player,
  PlayerGrowthCurveProfile,
  PlayerSeasonArc,
  SeriesFinancialSummary,
  TeamId,
} from '../types/kbo';
import {
  archiveCompletedSeasonRecords,
  checkAndAutoRunNationalTeamEvents,
  checkCareerMilestonesAndRecords,
  computeReverseDraftOrder,
  ensureFranchiseState,
  evaluateSeasonOwnerGrade,
  generatePostSeriesCoachFeedbackAndReports,
  generateVerifiedSeriesRecapNews,
  getActiveKboRuleModifiers,
  getTeamRetiredNumbers,
  isPlayerOnNationalTeamDuty,
  processLeagueManagerFiringsAndOtherClubGms,
  processOverseasTrainingReturns,
  processSeriesEventsAndComplaints,
  releaseReturnedNationalTeamPlayers,
  simulateFuturesSeriesAndRehab,
  simulateMlbExportsAndOtherClubNews,
  unlockTrophy,
} from './franchiseSystems';
import {
  applyOffDayPitcherRecoveryInPlace,
  buildRealisticPitchingPlan,
  evaluatePitcherCompetitionAndRolesInPlace,
  PitcherGamePlan,
  simulateInningByInningPitchingBox,
  updatePitcherWorkloadAfterGameInPlace,
} from './pitchingUsageEngine';
import {
  buildRealisticGameLineupAndBench,
  evaluateBatterCompetitionAndMoraleInPlace,
  simulateInningByInningBattingBox,
  updateBatterWorkloadAndMoraleAfterGameInPlace,
} from './batterUsageEngine';
import { processWaiverLifecycleInPlace } from './waiverEngine';
import {
  applyKoreanSeriesChampionshipRewardsInPlace,
  getClubTitleCount,
  syncActingCaptainInPlace,
} from './leagueLifeEngine';
import {
  computePlayerRivalrySpiritBonus,
  escalateRivalryOnSeriesSweep,
  getRivalryEffectProfile,
  recordGameRivalryOutcome,
} from './rivalryEngine';
import { canPlayerAppearInFirstTeam } from './developmentalEngine';
import { computeClubFranchiseMerchandise } from './franchiseStarEngine';
import { processMonthlyAmateurAndOverseasInPlace } from './amateurOverseasEngine';
import { evaluateLeagueWeeklyDissatisfactionInPlace } from './dissatisfactionEngine';
import { runOfficialSeasonAwardsCeremonyInPlace } from './kboAwardsEngine';
import {
  computePitcherBatterMatchupEdge,
  degradeFacilitiesPerSeries,
  DIFFICULTY_CONFIG,
  ensureDeepFranchiseState,
  generateGameWeather,
  getFacilityEffectivenessMult,
  maybeTriggerDeepFrontOfficeEvent,
  notifyTradeMarketReopenedAfterKoreanSeriesInPlace,
  processTradeWindowLifecycleInPlace,
  updateMedicalRehabProgress,
  updateOveruseAfterGame,
} from './deepFranchise';
import { refreshIncomingTradeOffers } from './incomingTradeEngine';
import { SeededRng } from './rng';
import { releaseExpiredFaPlayersToMarket } from './transactions';
import {
  calcERA,
  calcOPS,
  calcWHIP,
  computeStandings,
  emptyBatterStats,
  emptyPitcherStats,
  formatIP,
} from './stats';

function cloneCareer(career: CareerSave): CareerSave {
  return JSON.parse(JSON.stringify(career)) as CareerSave;
}

function bumpVersion(version: string): string {
  const m = version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return `${version}.1`;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]) + 1;
  return `v${major}.${minor}.${patch}`;
}

function hashSeasonDiversity(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * 시즌별 선수 커리어 다양성 초기화 (결정론적·세이브 영속)
 * - 개인별 성장/노쇠 곡선(growthCurveProfile) 최초 1회 부여
 * - 시즌마다 깜짝 활약 / 슬럼프 / 후반기 반등 / 평온 흐름(seasonArc)을 제한된 범위([-2.2, +2.4])로 배정
 * - 이미 해당 시즌에 확정된 흐름은 재로드 시 절대 변하지 않음
 */
export function ensureSeasonPlayerArcsInPlace(career: CareerSave): void {
  const season = career.season;
  const seed = career.seed ?? 2026;
  const needsSeasonInit = career.seasonArcInitializedSeason !== season;

  for (const p of Object.values(career.players)) {
    if (!p.growthCurveProfile) {
      const gh = hashSeasonDiversity(`growth-${seed}-${p.id}`) % 100;
      const profile: PlayerGrowthCurveProfile =
        gh < 20 ? '조기개화' : gh < 65 ? '표준' : gh < 85 ? '대기만성' : '철강왕';
      p.growthCurveProfile = profile;
    }

    if (!needsSeasonInit && p.seasonArc && p.seasonArc.season === season) {
      continue;
    }

    const ah = hashSeasonDiversity(`arc-${seed}-${season}-${p.id}`);
    const roll = ah % 100;
    const mag = ((ah >>> 8) % 5) * 0.1; // 0.0 ~ 0.4
    let arc: PlayerSeasonArc;

    if (p.ability >= 80) {
      // 스타/주전 선수도 제한된 슬럼프·후반기 반등 가능 (능력치 지배력은 유지)
      if (roll < 14) {
        arc = {
          season,
          kind: '슬럼프',
          firstHalfDelta: Number((-1.8 - mag).toFixed(2)),
          secondHalfDelta: Number((-1.2 - mag * 0.6).toFixed(2)),
        };
      } else if (roll < 26) {
        arc = {
          season,
          kind: '후반기반등',
          firstHalfDelta: Number((-1.5 - mag * 0.5).toFixed(2)),
          secondHalfDelta: Number((1.7 + mag * 0.8).toFixed(2)),
        };
      } else if (roll < 38) {
        arc = {
          season,
          kind: '깜짝활약',
          firstHalfDelta: Number((1.4 + mag).toFixed(2)),
          secondHalfDelta: Number((1.2 + mag * 0.8).toFixed(2)),
        };
      } else {
        arc = {
          season,
          kind: '평온',
          firstHalfDelta: Number((((ah >>> 12) % 9) - 4) * 0.15),
          secondHalfDelta: Number((((ah >>> 16) % 9) - 4) * 0.15),
        };
      }
    } else if (p.ability >= 66) {
      // 평범한/준주전 선수의 깜짝 활약 또는 후반기 급성장 가능
      if (roll < 16) {
        arc = {
          season,
          kind: '깜짝활약',
          firstHalfDelta: Number((1.9 + mag).toFixed(2)),
          secondHalfDelta: Number((1.7 + mag * 0.9).toFixed(2)),
        };
      } else if (roll < 28) {
        arc = {
          season,
          kind: '후반기반등',
          firstHalfDelta: Number((-0.4 - mag * 0.4).toFixed(2)),
          secondHalfDelta: Number((1.8 + mag).toFixed(2)),
        };
      } else if (roll < 40) {
        arc = {
          season,
          kind: '슬럼프',
          firstHalfDelta: Number((-1.6 - mag).toFixed(2)),
          secondHalfDelta: Number((-1.1 - mag * 0.6).toFixed(2)),
        };
      } else {
        arc = {
          season,
          kind: '평온',
          firstHalfDelta: Number((((ah >>> 12) % 9) - 4) * 0.15),
          secondHalfDelta: Number((((ah >>> 16) % 9) - 4) * 0.15),
        };
      }
    } else {
      if (roll < 15) {
        arc = {
          season,
          kind: '깜짝활약',
          firstHalfDelta: Number((1.6 + mag).toFixed(2)),
          secondHalfDelta: Number((1.5 + mag * 0.8).toFixed(2)),
        };
      } else {
        arc = {
          season,
          kind: '평온',
          firstHalfDelta: Number((((ah >>> 12) % 7) - 3) * 0.15),
          secondHalfDelta: Number((((ah >>> 16) % 7) - 3) * 0.15),
        };
      }
    }

    p.seasonArc = arc;
  }

  career.seasonArcInitializedSeason = season;
}

/**
 * 경기별 선수 활약 보정치 (능력치 지배력을 해치지 않도록 [-2.6, +2.8] 엄격 제한)
 * 반영 요소: 컨디션(form), 시즌 최근 성적 흐름, 시즌 아크(깜짝활약/슬럼프/후반기반등),
 * 좌우투수 상성, 홈·원정 성향, 상대 구단별 강세·약세
 */
export function computePlayerGameDayPerformanceDelta(
  career: CareerSave,
  player: Player,
  oppTeamId: TeamId,
  oppStarter: Player | undefined,
  isHome: boolean,
  round: number
): number {
  const seed = career.seed ?? 2026;
  // 1. 컨디션 영향
  const formDelta = player.form * 0.42;

  // 2. 최근/시즌 경기력 모멘텀 (표본 충분 시 제한 반영)
  let recentPerfDelta = 0;
  if (player.role === '타자') {
    const bs = player.stats as BatterStats;
    if (bs && (bs.PA ?? 0) >= 45) {
      const ops = calcOPS(bs);
      if (ops !== null && Number.isFinite(ops)) {
        recentPerfDelta = Math.max(-1.05, Math.min(1.05, (ops - 0.755) * 4.5));
      }
    }
  } else if (player.role === '투수') {
    const ps = player.stats as PitcherStats;
    if (ps && (ps.outs ?? 0) >= 30) {
      const era = calcERA(ps.ER, ps.outs);
      if (era !== null && Number.isFinite(era)) {
        recentPerfDelta = Math.max(-1.05, Math.min(1.05, (4.35 - era) * 0.42));
      }
    }
  }

  // 3. 시즌 흐름 (전반기 <= 72G, 후반기 > 72G)
  const arc = player.seasonArc && player.seasonArc.season === career.season ? player.seasonArc : undefined;
  const arcDelta = arc ? (round <= 72 ? arc.firstHalfDelta : arc.secondHalfDelta) : 0;

  // 4. 좌우투수 상성 (타자)
  let platoonDelta = 0;
  if (player.role === '타자' && oppStarter) {
    const bats = player.battingProfile?.bats ?? '우타';
    const throwsHand = oppStarter.pitchRepertoire?.throws ?? '우투';
    if (bats === '양타') {
      platoonDelta = 0.25;
    } else if ((bats === '좌타' && throwsHand === '우투') || (bats === '우타' && throwsHand === '좌투')) {
      platoonDelta = 0.62;
    } else {
      platoonDelta = -0.52;
    }
  }

  // 5. 홈·원정 성향 (선수별 결정론적 스플릿, ±0.55)
  const haHash = hashSeasonDiversity(`ha-${seed}-${player.id}`) % 11; // 0..10 -> -5..+5
  const homeBias = (haHash - 5) * 0.11;
  const homeAwayDelta = isHome ? homeBias : -homeBias * 0.85;

  // 6. 상대 구단별 상성 (선수×상대구단별 결정론적 스플릿, ±0.72)
  const oppHash = hashSeasonDiversity(`opp-${seed}-${career.season}-${player.id}-${oppTeamId}`) % 13; // 0..12 -> -6..+6
  const oppSplitDelta = (oppHash - 6) * 0.12;

  const raw = formDelta + recentPerfDelta + arcDelta + platoonDelta + homeAwayDelta + oppSplitDelta;
  if (!Number.isFinite(raw)) return 0;
  return Number(Math.max(-2.6, Math.min(2.8, raw)).toFixed(3));
}

/**
 * AI 감독 성적·컨디션 기반 라인업/선발 로테이션 주기적 조정
 * - 잘 치는 벤치 선수를 주전으로 승격하고 타순(중심·리드오프) 미세 조정
 * - 심각한 부진/컨디션 난조 선발은 5선발 또는 대기 선발과 교체
 */
export function adjustAiLineupsAndRotationByFormInPlace(career: CareerSave): void {
  const round = career.gamesPlayed;
  for (const tid of TEAM_IDS) {
    if (tid === career.playerTeamId) continue;
    const t = career.teams[tid];
    const teamPlayers = Object.values(career.players).filter((p) => p.teamId === tid);

    const scoreBatter = (p: Player): number => {
      const arc = p.seasonArc && p.seasonArc.season === career.season
        ? (round <= 72 ? p.seasonArc.firstHalfDelta : p.seasonArc.secondHalfDelta)
        : 0;
      const bs = p.stats as BatterStats;
      const ops = bs && (bs.PA ?? 0) >= 45 ? calcOPS(bs) : null;
      const opsBonus = ops !== null && Number.isFinite(ops) ? Math.max(-3, Math.min(3.5, (ops - 0.74) * 14)) : 0;
      return p.ability + p.form * 1.45 + opsBonus + arc * 0.65 - Math.max(0, p.fatigue - 55) * 0.12;
    };

    // 1) 핫한 1군 벤치 타자 <-> 부진한 동포지션/DH 주전 교체
    const activeLineup = t.lineupOrder
      .map((id) => career.players[id])
      .filter((p): p is Player => Boolean(p && p.teamId === tid && p.rosterTier === '1군' && !p.injury));
    const healthyBench = t.benchOrder
      .map((id) => career.players[id])
      .filter((p): p is Player => Boolean(p && p.teamId === tid && p.rosterTier === '1군' && !p.injury && p.role === '타자'));

    if (activeLineup.length >= 9 && healthyBench.length > 0) {
      const hottestBench = [...healthyBench].sort((a, b) => scoreBatter(b) - scoreBatter(a))[0];
      const hotScore = scoreBatter(hottestBench);
      const replaceable = activeLineup
        .filter((st) => {
          const assignedPos = t.lineupPositions[st.id] ?? st.position;
          return assignedPos === 'DH' || assignedPos === hottestBench.position || st.position === hottestBench.position;
        })
        .sort((a, b) => scoreBatter(a) - scoreBatter(b))[0];

      if (replaceable && hotScore >= scoreBatter(replaceable) + 3.4) {
        const repIdx = t.lineupOrder.indexOf(replaceable.id);
        const benchIdx = t.benchOrder.indexOf(hottestBench.id);
        if (repIdx >= 0 && benchIdx >= 0) {
          const inheritedPos = t.lineupPositions[replaceable.id] ?? replaceable.position;
          t.lineupOrder[repIdx] = hottestBench.id;
          t.benchOrder[benchIdx] = replaceable.id;
          t.lineupPositions[hottestBench.id] = inheritedPos;
          delete t.lineupPositions[replaceable.id];
        }
      }

      // 2) 타순 재정렬: 성적·컨디션 좋은 상위 타자들을 1~5번 핵심 타순에 우선 배치 (수비 포지션 유지)
      const current9 = t.lineupOrder
        .map((id) => career.players[id])
        .filter((p): p is Player => Boolean(p && p.teamId === tid));
      if (current9.length === 9) {
        const byScore = [...current9].sort((a, b) => scoreBatter(b) - scoreBatter(a));
        // 3번(최고), 4번(2위), 1번(3위), 2번(4위), 5번(5위), 6~9번(나머지)
        t.lineupOrder = [
          byScore[2].id,
          byScore[3].id,
          byScore[0].id,
          byScore[1].id,
          byScore[4].id,
          byScore[5].id,
          byScore[6].id,
          byScore[7].id,
          byScore[8].id,
        ];
      }
    }

    // 3) 부진 선발 로테이션 조정 (ERA > 5.85 또는 컨디션 -2 이하 선발과 대기 SP 교체)
    const scorePitcher = (p: Player): number => {
      const arc = p.seasonArc && p.seasonArc.season === career.season
        ? (round <= 72 ? p.seasonArc.firstHalfDelta : p.seasonArc.secondHalfDelta)
        : 0;
      const ps = p.stats as PitcherStats;
      const era = ps && (ps.outs ?? 0) >= 60 ? calcERA(ps.ER, ps.outs) : null;
      const eraBonus = era !== null && Number.isFinite(era) ? Math.max(-3.5, Math.min(3.5, (4.35 - era) * 1.1)) : 0;
      return p.ability + p.form * 1.4 + eraBonus + arc * 0.65 - Math.max(0, p.fatigue - 55) * 0.14;
    };

    const rotPlayers = t.rotationOrder
      .map((id) => career.players[id])
      .filter((p): p is Player => Boolean(p && p.teamId === tid && !p.injury));
    const altStarters = teamPlayers.filter(
      (p) =>
        p.role === '투수' &&
        !p.injury &&
        (p.position === 'SP' || p.pitchRole === '선발') &&
        !t.rotationOrder.includes(p.id) &&
        canPlayerAppearInFirstTeam(p)
    );

    if (rotPlayers.length >= 5 && altStarters.length > 0) {
      const strugglingSp = [...rotPlayers]
        .filter((p) => {
          const ps = p.stats as PitcherStats;
          const spEra = ps && (ps.outs ?? 0) >= 90 ? calcERA(ps.ER, ps.outs) : null;
          return p.form <= -2 || (spEra !== null && spEra >= 5.85);
        })
        .sort((a, b) => scorePitcher(a) - scorePitcher(b))[0];
      const bestAltSp = [...altStarters].sort((a, b) => scorePitcher(b) - scorePitcher(a))[0];

      if (strugglingSp && bestAltSp && scorePitcher(bestAltSp) >= scorePitcher(strugglingSp) + 3.0) {
        const rotIdx = t.rotationOrder.indexOf(strugglingSp.id);
        if (rotIdx >= 0) {
          bestAltSp.rosterTier = '1군';
          bestAltSp.gameDayActive = true;
          t.bullpenOrder = t.bullpenOrder.filter((id) => id !== bestAltSp.id);
          t.rotationOrder[rotIdx] = bestAltSp.id;
          if (!t.bullpenOrder.includes(strugglingSp.id)) {
            t.bullpenOrder.push(strugglingSp.id);
          }
        }
      }
    }
  }
}

function getTeamPitchingPlan(
  career: CareerSave,
  teamId: TeamId,
  round: number,
  date: string,
  isPostseason = false,
  isDoubleheaderGame2 = false
): PitcherGamePlan {
  const onNtDuty = (p: Player) => !isPostseason && isPlayerOnNationalTeamDuty(p, career.gamesPlayed);
  return buildRealisticPitchingPlan(career, teamId, round, date, {
    isPostseason,
    isDoubleheaderGame2,
    isOnNationalDuty: onNtDuty,
  });
}

function getTeamCoachingProfile(career: CareerSave, teamId: TeamId): {
  battingEdge: number;
  pitchingEdge: number;
  hitCoachBonus: number;
  pitchCoachBonus: number;
  managerBonus: number;
  tacticalStyle: string;
} {
  const staff = career.coaches[teamId] ?? [];
  const manager = staff.find((c) => c.role === '감독');
  const pitchCoach = staff.find((c) => c.role === '투수코치');
  const hitCoach = staff.find((c) => c.role === '타격코치');
  const batteryCoach = staff.find((c) => c.role === '배터리코치');
  const defenseCoach = staff.find((c) => c.role === '수비코치');

  // Detailed sub-ratings across all 5 roles
  const mgrTactics = manager?.subRatings?.tactics ?? manager?.tacticalRating ?? manager?.ability ?? 75;
  const mgrLineup = manager?.subRatings?.lineupMgmt ?? manager?.ability ?? 75;
  const mgrPitchChg = manager?.subRatings?.pitchingChange ?? manager?.ability ?? 75;
  const mgrLead = manager?.subRatings?.leadership ?? manager?.ability ?? 75;

  const pitStuff = pitchCoach?.subRatings?.stuffCoaching ?? pitchCoach?.ability ?? 75;
  const pitCtrl = pitchCoach?.subRatings?.controlCoaching ?? pitchCoach?.ability ?? 75;
  const pitDev = pitchCoach?.subRatings?.development ?? pitchCoach?.developmentRating ?? pitchCoach?.ability ?? 75;
  const pitCond = pitchCoach?.subRatings?.conditionMgmt ?? pitchCoach?.ability ?? 75;

  const hitContact = hitCoach?.subRatings?.contactCoaching ?? hitCoach?.ability ?? 75;
  const hitPower = hitCoach?.subRatings?.powerCoaching ?? hitCoach?.ability ?? 75;
  const hitEye = hitCoach?.subRatings?.eyeCoaching ?? hitCoach?.ability ?? 75;
  const hitSlump = hitCoach?.subRatings?.slumpCare ?? hitCoach?.developmentRating ?? hitCoach?.ability ?? 75;

  const batFraming = batteryCoach?.subRatings?.framing ?? batteryCoach?.ability ?? 75;
  const batCall = batteryCoach?.subRatings?.pitchCalling ?? batteryCoach?.ability ?? 75;
  const batDef = batteryCoach?.subRatings?.catcherDefense ?? batteryCoach?.ability ?? 75;

  const defInf = defenseCoach?.subRatings?.infieldDefense ?? defenseCoach?.ability ?? 75;
  const defOut = defenseCoach?.subRatings?.outfieldDefense ?? defenseCoach?.ability ?? 75;
  const defErr = defenseCoach?.subRatings?.errorReduction ?? defenseCoach?.ability ?? 75;
  const defRun = defenseCoach?.subRatings?.baseRunning ?? defenseCoach?.ability ?? 75;

  const mgrBatEff = manager ? ((mgrTactics + mgrLineup) / 2 - 75) * 0.05 : -0.35;
  const mgrPitEff = manager ? ((mgrTactics + mgrPitchChg) / 2 - 75) * 0.05 : -0.35;
  const hitEff = hitCoach ? ((hitContact + hitPower + hitEye) / 3 - 75) * 0.075 : -0.45;
  const pitEff = pitchCoach ? ((pitStuff + pitCtrl + pitCond) / 3 - 75) * 0.075 : -0.45;
  const batteryEff = batteryCoach ? ((batFraming + batCall + batDef) / 3 - 75) * 0.045 : -0.15;
  const defensePitEff = defenseCoach ? ((defInf + defOut + defErr) / 3 - 75) * 0.045 : -0.15;
  const defenseBatEff = defenseCoach ? (defRun - 75) * 0.025 : 0;

  const style = manager?.tacticalStyle ?? '밸런스';
  const styleBatAdj = style === '빅볼·공격야구' ? 0.55 : style === '스몰볼·기동력' ? 0.25 : 0;
  const stylePitAdj = style === '투수전·불펜운용' ? 0.65 : style === '스몰볼·기동력' ? 0.2 : 0;
  const devAdj = style === '육성·데이터' ? 0.12 : 0;

  return {
    battingEdge: mgrBatEff + hitEff + defenseBatEff + styleBatAdj,
    pitchingEdge: mgrPitEff + pitEff + batteryEff + defensePitEff + stylePitAdj,
    hitCoachBonus: (hitCoach ? (hitSlump - 75) * 0.048 : 0) + devAdj,
    pitchCoachBonus: (pitchCoach ? (pitDev - 75) * 0.048 : 0) + devAdj,
    managerBonus: (manager ? (mgrLead - 75) * 0.028 : 0) + devAdj,
    tacticalStyle: style,
  };
}

export function verifyGameBoxscoreIntegrity(game: GameRecord): { valid: boolean; issues: string[] } {
  if (!game.boxscore) {
    return { valid: false, issues: ['박스스코어 데이터 미포함 (원자료 부분 기록)'] };
  }
  const issues: string[] = [];
  const { awayBatters, homeBatters, awayPitchers, homePitchers } = game.boxscore;

  const sumAwayH = awayBatters.reduce((s, b) => s + b.H, 0);
  const sumHomeH = homeBatters.reduce((s, b) => s + b.H, 0);
  const sumAwayR = awayBatters.reduce((s, b) => s + b.R, 0);
  const sumHomeR = homeBatters.reduce((s, b) => s + b.R, 0);
  const sumAwayRBI = awayBatters.reduce((s, b) => s + b.RBI, 0);
  const sumHomeRBI = homeBatters.reduce((s, b) => s + b.RBI, 0);
  const sumAwayHR = awayBatters.reduce((s, b) => s + b.HR, 0);
  const sumHomeHR = homeBatters.reduce((s, b) => s + b.HR, 0);

  if (game.awayHits !== null && sumAwayH !== game.awayHits) {
    issues.push(`원정 안타 불일치 (${sumAwayH} vs ${game.awayHits})`);
  }
  if (game.homeHits !== null && sumHomeH !== game.homeHits) {
    issues.push(`홈 안타 불일치 (${sumHomeH} vs ${game.homeHits})`);
  }
  if (sumAwayR !== game.awayRuns) {
    issues.push(`원정 득점 불일치 (${sumAwayR} vs ${game.awayRuns})`);
  }
  if (sumHomeR !== game.homeRuns) {
    issues.push(`홈 득점 불일치 (${sumHomeR} vs ${game.homeRuns})`);
  }
  if (sumAwayRBI > game.awayRuns) {
    issues.push(`원정 타점 합계 초과 (${sumAwayRBI} > ${game.awayRuns})`);
  }
  if (sumHomeRBI > game.homeRuns) {
    issues.push(`홈 타점 합계 초과 (${sumHomeRBI} > ${game.homeRuns})`);
  }

  for (const b of [...awayBatters, ...homeBatters]) {
    if (b.B2 + b.B3 + b.HR > b.H) {
      issues.push(`${b.name} 장타 합(${b.B2 + b.B3 + b.HR}) > 안타(${b.H})`);
    }
  }
  for (const [label, sideBatters] of [
    ['원정', awayBatters],
    ['홈', homeBatters],
  ] as const) {
    const seen = new Set<string>();
    for (const b of sideBatters) {
      if (seen.has(b.playerId)) {
        issues.push(`${label} 타자 중복 출전/재출전 위반 (${b.name})`);
      }
      seen.add(b.playerId);
    }
  }

  const sumAwayBatSO = awayBatters.reduce((s, b) => s + b.SO, 0);
  const sumHomeBatSO = homeBatters.reduce((s, b) => s + b.SO, 0);
  const sumAwayBatBB = awayBatters.reduce((s, b) => s + b.BB, 0);
  const sumHomeBatBB = homeBatters.reduce((s, b) => s + b.BB, 0);

  const sumAwayPitH = awayPitchers.reduce((s, p) => s + p.H, 0);
  const sumHomePitH = homePitchers.reduce((s, p) => s + p.H, 0);
  const sumAwayPitR = awayPitchers.reduce((s, p) => s + p.R, 0);
  const sumHomePitR = homePitchers.reduce((s, p) => s + p.R, 0);
  const sumAwayPitHR = awayPitchers.reduce((s, p) => s + p.HR, 0);
  const sumHomePitHR = homePitchers.reduce((s, p) => s + p.HR, 0);
  const sumAwayPitSO = awayPitchers.reduce((s, p) => s + p.SO, 0);
  const sumHomePitSO = homePitchers.reduce((s, p) => s + p.SO, 0);
  const sumAwayPitBB = awayPitchers.reduce((s, p) => s + p.BB, 0);
  const sumHomePitBB = homePitchers.reduce((s, p) => s + p.BB, 0);

  if (sumAwayPitH !== sumHomeH) {
    issues.push(`원정 투수 피안타(${sumAwayPitH}) != 홈 타선 안타(${sumHomeH})`);
  }
  if (sumHomePitH !== sumAwayH) {
    issues.push(`홈 투수 피안타(${sumHomePitH}) != 원정 타선 안타(${sumAwayH})`);
  }
  if (sumAwayPitR !== game.homeRuns) {
    issues.push(`원정 투수 실점(${sumAwayPitR}) != 홈 득점(${game.homeRuns})`);
  }
  if (sumHomePitR !== game.awayRuns) {
    issues.push(`홈 투수 실점(${sumHomePitR}) != 원정 득점(${game.awayRuns})`);
  }
  if (sumAwayPitHR !== sumHomeHR) {
    issues.push(`원정 투수 피홈런(${sumAwayPitHR}) != 홈 타선 홈런(${sumHomeHR})`);
  }
  if (sumHomePitHR !== sumAwayHR) {
    issues.push(`홈 투수 피홈런(${sumHomePitHR}) != 원정 타선 홈런(${sumAwayHR})`);
  }
  if (sumAwayPitSO !== sumHomeBatSO) {
    issues.push(`원정 투수 탈삼진(${sumAwayPitSO}) != 홈 타선 삼진(${sumHomeBatSO})`);
  }
  if (sumHomePitSO !== sumAwayBatSO) {
    issues.push(`홈 투수 탈삼진(${sumHomePitSO}) != 원정 타선 삼진(${sumAwayBatSO})`);
  }
  if (sumAwayPitBB !== sumHomeBatBB) {
    issues.push(`원정 투수 볼넷(${sumAwayPitBB}) != 홈 타선 볼넷(${sumHomeBatBB})`);
  }
  if (sumHomePitBB !== sumAwayBatBB) {
    issues.push(`홈 투수 볼넷(${sumHomePitBB}) != 원정 타선 볼넷(${sumAwayBatBB})`);
  }
  for (const pt of [...awayPitchers, ...homePitchers]) {
    if (pt.ER > pt.R) {
      issues.push(`${pt.name} 자책(${pt.ER}) > 실점(${pt.R})`);
    }
  }

  if (game.innings) {
    const awayInnSum = game.innings.away.reduce((s, x) => s + x, 0);
    const homeInnSum = game.innings.home.reduce<number>((s, x) => s + (x ?? 0), 0);
    if (awayInnSum !== game.awayRuns) {
      issues.push(`원정 이닝별 득점 합(${awayInnSum}) != 최종 점수(${game.awayRuns})`);
    }
    if (homeInnSum !== game.homeRuns) {
      issues.push(`홈 이닝별 득점 합(${homeInnSum}) != 최종 점수(${game.homeRuns})`);
    }
    const awayHalfInnings = game.innings.away.length;
    const homeHalfInnings = game.innings.home.filter((x) => x !== null).length;
    const awayPitOuts = awayPitchers.reduce((s, p) => s + p.outs, 0);
    const homePitOuts = homePitchers.reduce((s, p) => s + p.outs, 0);
    // 끝내기 승리(홈팀 말 공격 중 승리 종료) 시 마지막 이닝 아웃카운트는 0~2아웃까지 정상
    const homeWalkOffPossible = game.winner === game.homeTeam && homeHalfInnings >= 9;
    const minAwayPitOuts = homeWalkOffPossible ? (homeHalfInnings - 1) * 3 : homeHalfInnings * 3;
    if (awayPitOuts < minAwayPitOuts || awayPitOuts > homeHalfInnings * 3) {
      issues.push(`원정 투수 아웃카운트(${awayPitOuts}) 범위 오류 (${minAwayPitOuts}..${homeHalfInnings * 3})`);
    }
    if (homePitOuts !== awayHalfInnings * 3) {
      issues.push(`홈 투수 아웃카운트(${homePitOuts}) != ${awayHalfInnings * 3}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function simulateSingleGame(
  career: CareerSave,
  rng: SeededRng,
  params: {
    round: number;
    date: string;
    awayTeam: TeamId;
    homeTeam: TeamId;
    isPostseason: boolean;
    postseasonRound?: CareerSave['postseason']['currentRound'];
    isDoubleheaderGame2?: boolean;
  }
): {
  game: GameRecord;
  newInjuries: InjuryLog[];
} {
  const {
    round,
    date,
    awayTeam,
    homeTeam,
    isPostseason,
    postseasonRound,
    isDoubleheaderGame2 = false,
  } = params;
  ensureSeasonPlayerArcsInPlace(career);
  const awayPitchPlan = getTeamPitchingPlan(
    career,
    awayTeam,
    round,
    date,
    isPostseason,
    isDoubleheaderGame2
  );
  const homePitchPlan = getTeamPitchingPlan(
    career,
    homeTeam,
    round,
    date,
    isPostseason,
    isDoubleheaderGame2
  );
  const onNtDutyForGame = (p: Player) =>
    !isPostseason && isPlayerOnNationalTeamDuty(p, career.gamesPlayed);
  const awayBatPlan = buildRealisticGameLineupAndBench(
    career,
    awayTeam,
    homeTeam,
    homePitchPlan.starter,
    round,
    {
      isPostseason,
      isDoubleheaderGame2,
      isOnNationalDuty: onNtDutyForGame,
      getPerfDelta: (p) =>
        computePlayerGameDayPerformanceDelta(
          career,
          p,
          homeTeam,
          homePitchPlan.starter,
          false,
          round
        ),
      rng,
    }
  );
  const homeBatPlan = buildRealisticGameLineupAndBench(
    career,
    homeTeam,
    awayTeam,
    awayPitchPlan.starter,
    round,
    {
      isPostseason,
      isDoubleheaderGame2,
      isOnNationalDuty: onNtDutyForGame,
      getPerfDelta: (p) =>
        computePlayerGameDayPerformanceDelta(
          career,
          p,
          awayTeam,
          awayPitchPlan.starter,
          true,
          round
        ),
      rng,
    }
  );
  const awayLineup = awayBatPlan.starters.map((s) => s.player);
  const homeLineup = homeBatPlan.starters.map((s) => s.player);

  const homeTeamInfo = KBO_TEAMS[homeTeam];
  const parkFactor = homeTeamInfo.parkFactor ?? 1.0;
  const weather = generateGameWeather(homeTeam, date, rng);
  const leagueEnv = career.leagueEnv;

  const awayCoach = getTeamCoachingProfile(career, awayTeam);
  const homeCoach = getTeamCoachingProfile(career, homeTeam);

  // #3: Captain & leadership clubhouse chemistry bonus
  const awayLeadBonus = ((career.teams[awayTeam].leadership?.veteranLeadership ?? 72) - 72) * 0.04;
  const homeLeadBonus = ((career.teams[homeTeam].leadership?.veteranLeadership ?? 72) - 72) * 0.04;

  // #2 & #24: Actual pitch repertoire (velocity, command, breaking pitches) vs batter platoon/breaking profile & hidden traits
  const rivalryProfile = getRivalryEffectProfile(career, awayTeam, homeTeam);
  const isHighStakesGame = isPostseason || Boolean(rivalryProfile);
  const awayPitVsHomeBat = computePitcherBatterMatchupEdge(awayPitchPlan.starter, homeLineup, isHighStakesGame);
  const homePitVsAwayBat = computePitcherBatterMatchupEdge(homePitchPlan.starter, awayLineup, isHighStakesGame);

  const calcLineupBatPower = (
    lineup: Player[],
    isHomeSide: boolean,
    oppTeamId: TeamId,
    oppStarter: Player
  ): number =>
    lineup.reduce((s, p) => {
      const focusBonus = p.trainingFocus === '타격' ? 1.2 : 0;
      const fatiguePenalty = Math.max(0, p.fatigue - 50) * 0.08 + (p.overuse?.riskLevel === '위험' ? 2.2 : p.overuse?.riskLevel === '주의' ? 0.8 : 0);
      const adaptPenalty = p.category !== '국내' && (p.kboAdaptation ?? 90) < 80 ? (80 - (p.kboAdaptation ?? 80)) * 0.14 : 0;
      const traitEdge = p.hiddenTrait === '꾸준함' ? 0.6 : isPostseason && p.hiddenTrait === '큰경기강세' ? 2.4 : 0;
      const rivalrySpirit = rivalryProfile
        ? computePlayerRivalrySpiritBonus(career, p, rivalryProfile, isHomeSide)
        : 0;
      const situationalDelta = computePlayerGameDayPerformanceDelta(
        career,
        p,
        oppTeamId,
        oppStarter,
        isHomeSide,
        round
      );
      const v18Bonus = getV18EngineSkillBonus(p);
      return (
        s +
        p.ability +
        v18Bonus +
        p.form * 1.1 +
        situationalDelta * 0.42 +
        focusBonus +
        traitEdge +
        rivalrySpirit -
        fatiguePenalty -
        adaptPenalty
      );
    }, 0) / Math.max(1, lineup.length);

  const calcDefenseSuppression = (lineup: Player[]): number =>
    lineup.filter((p) => p.trainingFocus === '수비').length * 0.35;

  const calcPitchPower = (
    plan: { starter: Player; relievers: Player[] },
    isHomeSide: boolean,
    oppTeamId: TeamId
  ): number => {
    const bullpenTop = plan.relievers.slice(0, 3);
    const bullpenAvg =
      bullpenTop.length > 0
        ? bullpenTop.reduce(
            (s, r) =>
              s +
              r.ability +
              r.form * 0.7 +
              computePlayerGameDayPerformanceDelta(career, r, oppTeamId, undefined, isHomeSide, round) * 0.35 +
              (rivalryProfile ? computePlayerRivalrySpiritBonus(career, r, rivalryProfile, isHomeSide) * 0.85 : 0) -
              r.fatigue * 0.14 -
              (r.overuse?.riskLevel === '위험' ? 2.8 : r.overuse?.riskLevel === '주의' ? 1.1 : 0),
            0
          ) / bullpenTop.length
        : 73;
    const starterFatiguePenalty =
      plan.starter.fatigue * 0.14 + Math.max(0, plan.starter.fatigue - 45) * 0.12;
    const starterFocusBonus =
      plan.starter.trainingFocus === '구위' || plan.starter.trainingFocus === '제구' ? 1.1 : 0;
    const starterRivalrySpirit = rivalryProfile
      ? computePlayerRivalrySpiritBonus(career, plan.starter, rivalryProfile, isHomeSide)
      : 0;
    const starterSituational = computePlayerGameDayPerformanceDelta(
      career,
      plan.starter,
      oppTeamId,
      undefined,
      isHomeSide,
      round
    );
    const adaptPenalty =
      plan.starter.category !== '국내' && (plan.starter.kboAdaptation ?? 90) < 80
        ? (80 - (plan.starter.kboAdaptation ?? 80)) * 0.15
        : 0;
    return (
      (plan.starter.ability +
        plan.starter.form * 1.05 +
        starterSituational * 0.45 +
        starterFocusBonus +
        starterRivalrySpirit -
        starterFatiguePenalty -
        adaptPenalty) *
        0.64 +
      bullpenAvg * 0.36
    );
  };

  const awayBatPower =
    calcLineupBatPower(awayLineup, false, homeTeam, homePitchPlan.starter) +
    awayCoach.battingEdge +
    awayLeadBonus -
    calcDefenseSuppression(homeLineup);
  const homeBatPower =
    calcLineupBatPower(homeLineup, true, awayTeam, awayPitchPlan.starter) +
    homeCoach.battingEdge +
    homeLeadBonus -
    calcDefenseSuppression(awayLineup) +
    1.15; // 홈 구장 이점

  const awayPitchPower =
    calcPitchPower(awayPitchPlan, false, homeTeam) +
    awayCoach.pitchingEdge +
    awayPitVsHomeBat.pitcherEdge * 0.55 +
    weather.pitchControlDelta * 0.4;
  const homePitchPower =
    calcPitchPower(homePitchPlan, true, awayTeam) +
    homeCoach.pitchingEdge +
    homePitVsAwayBat.pitcherEdge * 0.55 +
    weather.pitchControlDelta * 0.4;

  // 실제 야구 규칙 기반 타석(PA) 단위 이닝 시뮬레이션 엔진 (3아웃 종료 · 주자 초기화 · 선발/불펜/대타/대수비 교체 · 개인/팀 기록 100% 일치)
  const ruleMods = getActiveKboRuleModifiers(career);
  const envRunMult = (leagueEnv?.runMultiplier ?? 1.0) * (0.96 + weather.hrMult * 0.04);

  const gamePlay = simulateRealisticBaseballGame({
    career,
    awayTeam,
    homeTeam,
    awayBatPlan,
    homeBatPlan,
    awayPitchPlan,
    homePitchPlan,
    awayCoachEdge: {
      battingEdge: awayCoach.battingEdge + awayLeadBonus,
      pitchingEdge: awayCoach.pitchingEdge + awayPitVsHomeBat.pitcherEdge * 0.45,
    },
    homeCoachEdge: {
      battingEdge: homeCoach.battingEdge + homeLeadBonus,
      pitchingEdge: homeCoach.pitchingEdge + homePitVsAwayBat.pitcherEdge * 0.45,
    },
    parkFactor,
    weather,
    envRunMult,
    ruleMods: {
      runEnvMultiplier: ruleMods.runEnvMultiplier,
      extraInningCap: ruleMods.extraInningCap,
      hasTiebreaker: ruleMods.hasTiebreaker,
    },
    round,
    isPostseason,
    getPerfDelta: (p, oppTid, isHomeSide, oppPit) => {
      const baseDelta = computePlayerGameDayPerformanceDelta(
        career,
        p,
        oppTid,
        oppPit,
        isHomeSide,
        round
      );
      const rivalryBonus = rivalryProfile
        ? computePlayerRivalrySpiritBonus(career, p, rivalryProfile, isHomeSide)
        : 0;
      const traitEdge =
        p.hiddenTrait === '꾸준함'
          ? 0.6
          : isPostseason && p.hiddenTrait === '큰경기강세'
          ? 2.2
          : 0;
      return baseDelta + rivalryBonus + traitEdge;
    },
    rng,
  });

  const awayInnings = gamePlay.awayInnings;
  const homeInnings = gamePlay.homeInnings;
  const awayRuns = gamePlay.awayRuns;
  const homeRuns = gamePlay.homeRuns;
  const isDraw = awayRuns === homeRuns;
  const winner: TeamId | '무승부' = isDraw ? '무승부' : awayRuns > homeRuns ? awayTeam : homeTeam;
  const loser: TeamId | '무승부' = isDraw ? '무승부' : awayRuns > homeRuns ? homeTeam : awayTeam;
  const awayTotalInnings = awayInnings.length;

  const awayBatBox = {
    lines: gamePlay.awayBatters,
    totalHits: gamePlay.awayHits,
    inGameInjuredBatterIds: gamePlay.awayInGameInjuredIds,
    subNotes: gamePlay.substitutionNotes.filter((_, i) => i < 4),
  };
  const homeBatBox = {
    lines: gamePlay.homeBatters,
    totalHits: gamePlay.homeHits,
    inGameInjuredBatterIds: gamePlay.homeInGameInjuredIds,
    subNotes: gamePlay.substitutionNotes.filter((_, i) => i >= 4),
  };
  const awayErrors = gamePlay.awayErrors;
  const homeErrors = gamePlay.homeErrors;
  const awayPitchLines = gamePlay.awayPitchers;
  const homePitchLines = gamePlay.homePitchers;
  if (gamePlay.isWalkOff) {
    homeBatBox.subNotes.unshift(`9회말+ 끝내기 승리 (${homeTeam} ${homeRuns}:${awayRuns} ${awayTeam})`);
  }

  // Accumulate stats into career players
  const accumulateBatter = (line: BoxscoreBatterLine) => {
    const p = career.players[line.playerId];
    if (!p) return;
    const target = isPostseason
      ? (p.postseasonStats as BatterStats)
      : (p.stats as BatterStats);

    if (target.isPartial && target.PA === null) {
      // Preserve partial historical marker; accumulate confirmed HR/RBI & post-R9 detailed counters cleanly
      target.confirmedMinHR = (target.confirmedMinHR ?? 0) + line.HR;
      target.confirmedMinRBI = (target.confirmedMinRBI ?? 0) + line.RBI;
      // Track complete detailed stats starting from R10 inside ktSeriesBatting or convert cleanly?
      // Rule v4.60.27: Never fabricate 0s for missing G1-3, keep partialNote while accumulating exact post-R9 in a readable way:
      if (!p.ktSeriesBatting) p.ktSeriesBatting = emptyBatterStats(false);
      p.ktSeriesBatting.G = (p.ktSeriesBatting.G ?? 0) + 1;
      p.ktSeriesBatting.PA = (p.ktSeriesBatting.PA ?? 0) + line.PA;
      p.ktSeriesBatting.AB = (p.ktSeriesBatting.AB ?? 0) + line.AB;
      p.ktSeriesBatting.H = (p.ktSeriesBatting.H ?? 0) + line.H;
      p.ktSeriesBatting.B2 = (p.ktSeriesBatting.B2 ?? 0) + line.B2;
      p.ktSeriesBatting.B3 = (p.ktSeriesBatting.B3 ?? 0) + line.B3;
      p.ktSeriesBatting.HR = (p.ktSeriesBatting.HR ?? 0) + line.HR;
      p.ktSeriesBatting.BB = (p.ktSeriesBatting.BB ?? 0) + line.BB;
      p.ktSeriesBatting.HBP = (p.ktSeriesBatting.HBP ?? 0) + line.HBP;
      p.ktSeriesBatting.SF = (p.ktSeriesBatting.SF ?? 0) + line.SF;
      p.ktSeriesBatting.SO = (p.ktSeriesBatting.SO ?? 0) + line.SO;
      p.ktSeriesBatting.R = (p.ktSeriesBatting.R ?? 0) + line.R;
      p.ktSeriesBatting.RBI = (p.ktSeriesBatting.RBI ?? 0) + line.RBI;
      p.ktSeriesBatting.SB = (p.ktSeriesBatting.SB ?? 0) + line.SB;
      p.ktSeriesBatting.TB = (p.ktSeriesBatting.TB ?? 0) + line.TB;
    } else {
      target.G = (target.G ?? 0) + 1;
      target.PA = (target.PA ?? 0) + line.PA;
      target.AB = (target.AB ?? 0) + line.AB;
      target.H = (target.H ?? 0) + line.H;
      target.B2 = (target.B2 ?? 0) + line.B2;
      target.B3 = (target.B3 ?? 0) + line.B3;
      target.HR = (target.HR ?? 0) + line.HR;
      target.BB = (target.BB ?? 0) + line.BB;
      target.HBP = (target.HBP ?? 0) + line.HBP;
      target.SF = (target.SF ?? 0) + line.SF;
      target.SO = (target.SO ?? 0) + line.SO;
      target.R = (target.R ?? 0) + line.R;
      target.RBI = (target.RBI ?? 0) + line.RBI;
      target.SB = (target.SB ?? 0) + line.SB;
      target.TB = (target.TB ?? 0) + line.TB;
    }

    // Update short-term form (-5..+5, max +-2 per game)
    const gamePerf = line.H * 1 + line.HR * 2 + line.BB * 0.5 - (line.AB - line.H) * 0.25;
    const formDelta = gamePerf >= 2.2 ? 1 : gamePerf <= -0.8 ? -1 : 0;
    p.form = Math.max(-5, Math.min(5, p.form + formDelta));
  };

  const accumulatePitcher = (line: BoxscorePitcherLine) => {
    const p = career.players[line.playerId];
    if (!p) return;
    const target = isPostseason
      ? (p.postseasonStats as PitcherStats)
      : (p.stats as PitcherStats);

    target.G = (target.G ?? 0) + 1;
    target.GS = (target.GS ?? 0) + line.GS;
    target.outs = (target.outs ?? 0) + line.outs;
    target.W = (target.W ?? 0) + line.W;
    target.L = (target.L ?? 0) + line.L;
    target.HLD = (target.HLD ?? 0) + line.HLD;
    target.SV = (target.SV ?? 0) + line.SV;
    if (line.BS) target.BS = (target.BS ?? 0) + line.BS;
    if (line.QS) target.QS = (target.QS ?? 0) + line.QS;
    if (line.QSP) target.QSP = (target.QSP ?? 0) + line.QSP;
    if (line.CG) target.CG = (target.CG ?? 0) + line.CG;
    if (line.SHO) target.SHO = (target.SHO ?? 0) + line.SHO;
    if (line.NH) target.NH = (target.NH ?? 0) + line.NH;
    if (line.PG) target.PG = (target.PG ?? 0) + line.PG;
    if (target.H !== null) target.H += line.H;
    else if (!target.isPartial) target.H = line.H;
    if (target.BB !== null) target.BB += line.BB;
    else if (!target.isPartial) target.BB = line.BB;
    if (target.SO !== null) target.SO += line.SO;
    else if (!target.isPartial) target.SO = line.SO;
    if (target.ER !== null) target.ER += line.ER;
    else if (!target.isPartial) target.ER = line.ER;
    if (target.R !== null) target.R += line.R;
    else if (!target.isPartial) target.R = line.R;
    if (target.HR !== null) target.HR += line.HR;
    else if (!target.isPartial) target.HR = line.HR;
    if (target.PC !== null) target.PC += line.PC;
    else if (!target.isPartial) target.PC = line.PC;

    const pPerf = line.outs * 0.25 - line.ER * 1.1 + line.SO * 0.3;
    const fDelta = pPerf >= 2.2 ? 1 : pPerf <= -1.2 ? -1 : 0;
    p.form = Math.max(-5, Math.min(5, p.form + fDelta));
  };

  awayBatBox.lines.forEach(accumulateBatter);
  homeBatBox.lines.forEach(accumulateBatter);
  awayPitchLines.forEach(accumulatePitcher);
  homePitchLines.forEach(accumulatePitcher);

  // Update batter fatigue, bench idle streaks & playing-time morale/dissatisfaction for both clubs
  updateBatterWorkloadAndMoraleAfterGameInPlace(career, awayTeam, date, round, awayBatBox.lines, {
    isDoubleheaderGame2,
  });
  updateBatterWorkloadAndMoraleAfterGameInPlace(career, homeTeam, date, round, homeBatBox.lines, {
    isDoubleheaderGame2,
  });

  // Update pitcher fatigue, consecutive days, recent 3-day pitches, lastPitchedDate & rest recovery for non-pitching arms
  updatePitcherWorkloadAfterGameInPlace(career, awayTeam, date, round, awayPitchLines, {
    isDoubleheaderGame2,
  });
  updatePitcherWorkloadAfterGameInPlace(career, homeTeam, date, round, homePitchLines, {
    isDoubleheaderGame2,
  });

  // Injury checks (v4.56 + pitcher연투/누적피로 + mid-game batter injury replacement) for participants
  const newInjuries: InjuryLog[] = [];
  const inGameInjuredBatterSet = new Set<string>([
    ...awayBatBox.inGameInjuredBatterIds,
    ...homeBatBox.inGameInjuredBatterIds,
  ]);
  for (const injPid of inGameInjuredBatterSet) {
    const p = career.players[injPid];
    if (!p || p.injury) continue;
    const sevRoll = rng.next();
    const severity: InjurySeverity = sevRoll < 0.72 ? '경미' : sevRoll < 0.94 ? '보통' : '장기';
    const days =
      severity === '경미' ? rng.int(2, 6) : severity === '보통' ? rng.int(10, 21) : rng.int(28, 50);
    const desc =
      severity === '경미'
        ? '경기 중 타박상 및 근육 경련'
        : severity === '보통'
        ? '주루·수비 중 햄스트링 손상'
        : '경기 중 발목·무릎 인대 손상';
    const injId = `inj-ig-r${round}-${p.id}`;
    p.injury = {
      id: injId,
      playerId: p.id,
      playerName: p.name,
      teamId: p.teamId,
      description: desc,
      severity,
      daysTotal: days,
      daysRemaining: days,
      occurredRound: round,
      occurredDate: date,
    };
    p.injuryHistoryCount = (p.injuryHistoryCount ?? 0) + 1;
    p.rehabGamesLeft = severity === '장기' ? 6 : severity === '보통' ? 3 : 0;
    p.gameDayActive = false;
    newInjuries.push({
      id: injId,
      date,
      round,
      teamId: p.teamId,
      playerId: p.id,
      playerName: p.name,
      severity,
      days,
      description: desc,
    });
  }

  const participants = [
    ...awayBatBox.lines.map((l) => career.players[l.playerId]),
    ...homeBatBox.lines.map((l) => career.players[l.playerId]),
    ...awayPitchLines.map((l) => career.players[l.playerId]),
    ...homePitchLines.map((l) => career.players[l.playerId]),
  ].filter(Boolean);

  const medicalLevel = career.finances.investments?.medicalLevel ?? 1;
  const medicalFactor = Math.max(0.45, 1 - (medicalLevel - 1) * 0.12);

  for (const p of participants) {
    if (p.injury) continue;
    p.consecutiveAppearances = (p.consecutiveAppearances ?? 0) + 1;
    const consecRisk = p.consecutiveAppearances >= 5 ? 0.0022 : 0;
    const pitcherConsecRisk =
      p.role === '투수'
        ? (p.consecutivePitchDays ?? 0) >= 3
          ? 0.0055
          : (p.consecutivePitchDays ?? 0) === 2
          ? 0.0018
          : 0
        : 0;
    const pitcherLoadRisk =
      p.role === '투수' && (p.recent3DayPitches ?? 0) >= 115 ? 0.0028 : 0;
    const rawProb =
      0.003 +
      (p.age >= 33 ? 0.0022 : 0) +
      (p.fatigue > 62 ? 0.0045 : 0) +
      consecRisk +
      pitcherConsecRisk +
      pitcherLoadRisk;
    const baseProb = p.teamId === career.playerTeamId ? rawProb * medicalFactor : rawProb;
    if (rng.next() < baseProb) {
      const sevRoll = rng.next();
      const severity: InjurySeverity = sevRoll < 0.68 ? '경미' : sevRoll < 0.93 ? '보통' : '장기';
      const days =
        severity === '경미' ? rng.int(2, 7) : severity === '보통' ? rng.int(10, 24) : rng.int(32, 60);
      const desc =
        p.role === '투수'
          ? severity === '경미'
            ? '전완부 근육 긴장'
            : severity === '보통'
            ? '어깨 염증'
            : '팔꿈치 인대 손상'
          : severity === '경미'
          ? '가벼운 햄스트링 불편감'
          : severity === '보통'
          ? '내복사근 손상'
          : '발목 인대 파열';

      const injId = `inj-r${round}-${p.id}`;
      p.injury = {
        id: injId,
        playerId: p.id,
        playerName: p.name,
        teamId: p.teamId,
        description: desc,
        severity,
        daysTotal: days,
        daysRemaining: days,
        occurredRound: round,
        occurredDate: date,
      };
      p.injuryHistoryCount = (p.injuryHistoryCount ?? 0) + 1;
      p.rehabGamesLeft = severity === '장기' ? 6 : severity === '보통' ? 3 : 0;
      p.gameDayActive = false;

      newInjuries.push({
        id: injId,
        date,
        round,
        teamId: p.teamId,
        playerId: p.id,
        playerName: p.name,
        severity,
        days,
        description: desc,
      });
    }
  }

  // Pick 2-3 Key Performers with concrete numbers
  const keyPerformers: KeyPerformer[] = [];
  const allBatters = [...awayBatBox.lines, ...homeBatBox.lines].sort(
    (a, b) => b.HR * 4 + b.RBI * 2 + b.H - (a.HR * 4 + a.RBI * 2 + a.H)
  );
  const allPitchers = [...awayPitchLines, ...homePitchLines].sort(
    (a, b) => b.W * 6 + b.SV * 3 + b.outs * 0.4 - b.ER * 2 - (a.W * 6 + a.SV * 3 + a.outs * 0.4 - a.ER * 2)
  );

  if (allPitchers[0]) {
    const pt = allPitchers[0];
    const pObj = career.players[pt.playerId];
    keyPerformers.push({
      playerName: pt.name,
      teamId: pObj?.teamId ?? homeTeam,
      role: '투수',
      summary: `${formatIP(pt.outs)}이닝 ${pt.ER}자책 ${pt.SO}K${pt.W ? ' (승)' : pt.SV ? ' (세이브)' : ''}`,
    });
  }
  for (let i = 0; i < Math.min(2, allBatters.length); i++) {
    const bt = allBatters[i];
    const pObj = career.players[bt.playerId];
    keyPerformers.push({
      playerName: bt.name,
      teamId: pObj?.teamId ?? homeTeam,
      role: '타자',
      summary: `${bt.AB}타수 ${bt.H}안타${bt.HR > 0 ? ` ${bt.HR}홈런` : ''} ${bt.RBI}타점`,
    });
  }

  // Real in-game tactical substitutions (PH/PR/DEF/INJ) & lineup rotation logs + rivalry/rainout markers (#16, #22)
  const subNotes: string[] = [...awayBatBox.subNotes, ...homeBatBox.subNotes].slice(0, 8);
  const extraInnings = awayTotalInnings > 9 ? awayTotalInnings : undefined;
  const isRivalryGame = Boolean(rivalryProfile);
  if (rivalryProfile) {
    // Rivalry game physical/mental intensity: extra exertion + winning-side fighting spirit form surge
    for (const pl of participants) {
      const fatigueAdd = pl.role === '투수' ? rivalryProfile.extraFatigue : Math.max(1, Math.round(rivalryProfile.extraFatigue * 0.6));
      pl.fatigue = Math.min(100, pl.fatigue + fatigueAdd);
      if (!isDraw && pl.teamId === winner && rng.next() < rivalryProfile.winnerFormBoostProb) {
        pl.form = Math.min(5, pl.form + 1);
      }
    }
    subNotes.push(
      `[${rivalryProfile.rivalry.name} · 열기 ${rivalryProfile.rivalry.intensity}] 양 팀 투지 +${rivalryProfile.spiritPowerBonus.toFixed(1)} 발동 · 혈투 피로 +${rivalryProfile.extraFatigue}`
    );
  }
  const isDome = homeTeam === '키움';
  const isRainoutRescheduled = !isPostseason && !isDome && rng.next() < 0.04;
  if (isRainoutRescheduled) {
    // Rainout gives both clubs extra bullpen/starter rest recovery before makeup
    for (const pl of participants) {
      pl.fatigue = Math.max(0, pl.fatigue - 10);
      if (pl.role === '투수') {
        pl.consecutivePitchDays = 0;
      }
    }
    subNotes.push('우천 순연 후 재편성 경기 (양 팀 투수진 휴식 회복 및 연투 리셋)');
  }

  // #19 & #26: Track player overuse (catcher consecutive starts, pitcher연투/105구+) & 1군 registration days
  updateOveruseAfterGame(
    career,
    awayTeam,
    new Set(awayBatBox.lines.filter((l) => !l.isSubstitute).map((l) => l.playerId)),
    awayPitchLines.map((pl) => ({ playerId: pl.playerId, isStarter: pl.GS > 0, pitchCount: pl.PC }))
  );
  updateOveruseAfterGame(
    career,
    homeTeam,
    new Set(homeBatBox.lines.filter((l) => !l.isSubstitute).map((l) => l.playerId)),
    homePitchLines.map((pl) => ({ playerId: pl.playerId, isStarter: pl.GS > 0, pitchCount: pl.PC }))
  );

  const game: GameRecord = {
    id: `sim-${isPostseason ? 'ps' : 'reg'}-r${round}-${awayTeam}-${homeTeam}`,
    round,
    date,
    awayTeam,
    homeTeam,
    awayRuns,
    homeRuns,
    awayHits: awayBatBox.totalHits,
    homeHits: homeBatBox.totalHits,
    awayErrors,
    homeErrors,
    innings: {
      away: awayInnings,
      home: homeInnings,
    },
    winner,
    loser,
    isDraw,
    isPostseason,
    postseasonRound,
    source: isPostseason ? '게임 내 포스트시즌 가상 시뮬레이션' : '게임 내 정규시즌 가상 시뮬레이션',
    isSynthetic: true,
    keyPerformers,
    extraInnings,
    isRainoutRescheduled,
    substitutionNotes: subNotes.length > 0 ? subNotes : undefined,
    isRivalryGame,
    rivalryName: rivalryProfile?.rivalry.name,
    rivalryIntensity: rivalryProfile?.rivalry.intensity,
    rivalryEffectNote: rivalryProfile?.summaryText,
    weather,
    boxscore: {
      awayBatters: awayBatBox.lines,
      homeBatters: homeBatBox.lines,
      awayPitchers: awayPitchLines,
      homePitchers: homePitchLines,
    },
  };

  // Update dynamic rivalry H2H & heat (and forge new rivalries from postseason clashes)
  const rivalryUpdate = recordGameRivalryOutcome(career, game);
  if (rivalryUpdate.rivalry) {
    game.isRivalryGame = true;
    game.rivalryName = rivalryUpdate.rivalry.name;
    game.rivalryIntensity = rivalryUpdate.rivalry.intensity;
    if (!game.rivalryEffectNote) {
      game.rivalryEffectNote = `열기 ${rivalryUpdate.rivalry.intensity} · 포스트시즌 신흥 라이벌전`;
    }
    if (rivalryUpdate.newlyCreated) {
      if (!career.newsFeed) career.newsFeed = [];
      career.newsFeed.unshift({
        id: `news-new-rivalry-${round}-${rivalryUpdate.rivalry.id}`,
        date,
        season: career.season,
        category: '경기·시리즈',
        headline: `[신흥 라이벌 탄생] ${KBO_TEAMS[awayTeam].shortName}·${KBO_TEAMS[homeTeam].shortName}, 가을야구 맞대결로 [${rivalryUpdate.rivalry.name}] 형성`,
        body: `포스트시즌 혈투를 계기로 두 구단이 새로운 KBO 공식 라이벌 관계(열기 ${rivalryUpdate.rivalry.intensity})로 등록되었습니다. 향후 맞대결에서 선수단 투지와 관중 열기가 크게 상승합니다.`,
        teamId: homeTeam,
        isHighlight: true,
      });
    }
  }

  const integrity = verifyGameBoxscoreIntegrity(game);
  game.verified = integrity.valid;
  game.validationNote = integrity.valid
    ? `박스스코어 자동 검증 완료 (${homeTeamInfo.stadium.split(' ')[0]} · 구장계수 ${parkFactor.toFixed(2)} · ${weather.condition} ${weather.tempC}°C${extraInnings ? ` · 연장 ${extraInnings}회` : ''})`
    : integrity.issues.join(' / ');

  return { game, newInjuries };
}

function advanceDailyRecoveryAndInjuries(career: CareerSave): void {
  const medicalLevel = career.finances.investments?.medicalLevel ?? 1;
  const medCondMult = getFacilityEffectivenessMult(career.finances.facilityCondition?.medical);
  const medicalBonus = Math.round((medicalLevel - 1) * 3 * medCondMult);
  for (const p of Object.values(career.players)) {
    // Recover pitcher/player fatigue each day
    if (p.fatigue > 0) {
      const baseRec = p.role === '타자' ? 5 : p.pitchRole === '선발' ? 16 : 22;
      const bonus = p.teamId === career.playerTeamId ? (p.role === '타자' ? Math.round(medicalBonus * 0.4) : medicalBonus) : 0;
      p.fatigue = Math.max(0, p.fatigue - (baseRec + bonus));
    }
    if (p.injury) {
      p.injury.daysRemaining -= 1;
      updateMedicalRehabProgress(p);
      if (p.injury.daysRemaining <= 0) {
        p.injury = null;
        p.form = Math.max(-5, p.form - 2); // v4.58: post-injury return starts with lower form, not permanent ability drop
        p.gameDayActive = p.rosterTier === '1군';
      }
    }
  }
}

/**
 * v4.58 10-game interval performance + Korean age rating evaluation for all 10 teams.
 * Requires >= 30 PA (hitters) or >= 10 IP (30 outs, pitchers). Season cap +-8, ability <= potential.
 */
function runTenGameGrowthEvaluation(
  career: CareerSave,
  rng: SeededRng,
  teamGamesAfterRound: Map<TeamId, number>,
  round: number,
  date: string
): GrowthLog[] {
  const logs: GrowthLog[] = [];

  for (const teamId of TEAM_IDS) {
    const teamGames = teamGamesAfterRound.get(teamId) ?? 0;
    if (teamGames === 0 || teamGames % 10 !== 0) continue;

    const coachProf = getTeamCoachingProfile(career, teamId);
    const academyLevel = career.finances.investments?.academyLevel ?? 1;
    const facilityContribution = teamId === career.playerTeamId ? Number(((academyLevel - 1) * 0.25).toFixed(2)) : 0;

    for (const p of Object.values(career.players)) {
      if (p.teamId !== teamId || p.rosterTier === '은퇴' || p.rosterTier === '해외이적') continue;
      if (p.lastEvaluatedAtTeamGames >= teamGames) continue;

      let qualifiedSample = false;
      let perfScore = 0;
      let sampleText = '';
      let playingTimeNote = '';
      let isFuturesOnly = false;

      if (p.role === '타자') {
        const b = p.stats as BatterStats;
        const pa = b.PA ?? p.ktSeriesBatting?.PA ?? 0;
        if (pa >= 30) {
          const src = b.PA !== null ? b : p.ktSeriesBatting!;
          const ops = calcOPS(src) ?? 0.72;
          qualifiedSample = true;
          perfScore = (ops - 0.75) * 9.0;
          sampleText = `${pa}타석 OPS .${Math.round(ops * 1000)}`;
          playingTimeNote = pa >= 60 ? '1군 주전 출장' : '1군 출장 기회';
        } else if (p.rosterTier === '2군' && p.age <= 24 && p.potential - p.ability >= 6 && p.ability < 66) {
          // 2군 육성은 완만한 점진 성장으로 제한 (자동 +6 인플레이션 방지 · 1군 실전 검증 필요)
          qualifiedSample = teamGames % 30 === 0;
          isFuturesOnly = true;
          perfScore = 0.25 + (p.trainingFocus ? 0.2 : 0);
          sampleText = `2군 육성 훈련 (${teamGames}G 구간)`;
          playingTimeNote = '2군 집중 육성';
        }
      } else {
        const ps = p.stats as PitcherStats;
        const outs = ps.outs ?? 0;
        if (outs >= 30) {
          const era = calcERA(ps.ER, outs) ?? 4.2;
          const whip = calcWHIP(ps.H, ps.BB, outs) ?? 1.35;
          qualifiedSample = true;
          perfScore = (4.2 - era) * 0.8 + (1.36 - whip) * 1.8;
          sampleText = `${formatIP(outs)}이닝 ERA ${era.toFixed(2)}`;
          playingTimeNote = outs >= 60 ? '1군 주축 등판' : '1군 마운드 출장';
        } else if (p.rosterTier === '2군' && p.age <= 24 && p.potential - p.ability >= 6 && p.ability < 66) {
          qualifiedSample = teamGames % 30 === 0;
          isFuturesOnly = true;
          perfScore = 0.25 + (p.trainingFocus ? 0.2 : 0);
          sampleText = `2군 투구 훈련 (${teamGames}G 구간)`;
          playingTimeNote = '2군 집중 육성';
        }
      }

      if (!qualifiedSample) continue;
      p.lastEvaluatedAtTeamGames = teamGames;

      // #1 & #8: Realistic KBO aging, injury-history decline & anti-inflation rookie growth curve
      const injuryDrag = Math.min(1.4, (p.injuryHistoryCount ?? 0) * 0.28);
      const academyCondMult =
        teamId === career.playerTeamId
          ? getFacilityEffectivenessMult(career.finances.facilityCondition?.academy)
          : 1.0;
      const rookieLeaderBoost =
        p.age <= 24 ? (career.teams[teamId].leadership?.rookieAdaptationBonus ?? 0) * 0.06 : 0;
      const effFacilityContrib = Number((facilityContribution * academyCondMult).toFixed(2));

      let ageBias = 0;
      if (p.age <= 22) ageBias = 0.36;
      else if (p.age <= 26) ageBias = 0.16;
      else if (p.age <= 30) ageBias = 0.0;
      else if (p.age <= 33) ageBias = -0.25 - injuryDrag * 0.32;
      else if (p.age <= 36) ageBias = -0.68 - injuryDrag * 0.5;
      else ageBias = -1.15 - injuryDrag * 0.65;

      const headroom = Math.max(0, p.potential - p.ability);
      const potentialBonus = p.age <= 23 ? Math.min(1.1, headroom * 0.045) : p.age <= 27 ? Math.min(0.8, headroom * 0.032) : 0;

      // Training focus alignment bonus
      const batterFocuses = new Set(['타격', '수비', '주루']);
      const pitcherFocuses = new Set(['구위', '제구', '체력']);
      const focusMatched =
        (p.role === '타자' && p.trainingFocus && batterFocuses.has(p.trainingFocus)) ||
        (p.role === '투수' && p.trainingFocus && pitcherFocuses.has(p.trainingFocus));
      const trainingBonus = focusMatched ? 0.32 : 0;

      const roleCoachBonus =
        (p.role === '타자' ? coachProf.hitCoachBonus : coachProf.pitchCoachBonus) + coachProf.managerBonus;
      const coachContribution = Number(roleCoachBonus.toFixed(2));

      const combined =
        perfScore +
        ageBias +
        potentialBonus +
        trainingBonus +
        coachContribution +
        effFacilityContrib +
        rookieLeaderBoost -
        (p.age <= 25 && (p.injuryHistoryCount ?? 0) >= 2 ? 0.45 : 0) +
        (rng.next() - 0.5) * 0.65;

      let delta = 0;
      if (isFuturesOnly) {
        // 2군 훈련은 시즌 최대 +2~3 완만 성장 (과도한 2군 폭풍 성장 및 리그 인플레이션 방지)
        if (combined >= 1.35 && p.seasonRatingDelta < 3 && p.ability < 66) delta = 1;
      } else {
        if (combined >= 2.75 && p.age <= 25 && headroom >= 5) delta = 2;
        else if (combined >= 1.30 && p.age <= 34) delta = 1;
        else if (combined >= 1.95 && p.age >= 35) delta = 1;
        else if (combined <= -2.10 && p.age >= 33) delta = -2;
        else if (combined <= -1.05) delta = -1;
      }

      if (delta === 0) continue;

      // 시즌당 최대 변동 폭 제한 (신인 과도 성장 및 인플레이션 방지: +4 기본, 1군 특급 활약 시 +5)
      const maxPosCap = !isFuturesOnly && perfScore >= 2.2 && p.age <= 24 ? 5 : 4;
      const maxNegCap = p.age >= 35 ? -5 : -4;
      if (p.seasonRatingDelta + delta > maxPosCap) delta = Math.max(0, maxPosCap - p.seasonRatingDelta);
      if (p.seasonRatingDelta + delta < maxNegCap) delta = Math.min(0, maxNegCap - p.seasonRatingDelta);
      if (delta === 0) continue;

      // #8: 성적·부상·출전기회·훈련환경에 따른 잠재력(potential) 자체 변동 (90+ 인플레이션 방지)
      let potDelta = 0;
      if (!isFuturesOnly && perfScore >= 2.2 && p.age <= 26 && p.potential < 91 && rng.next() < 0.35) {
        potDelta = 1;
        p.potential = Math.min(92, p.potential + potDelta);
        p.potentialTrend = '급상승';
      } else if (
        (!isFuturesOnly && perfScore <= -1.55 && p.age <= 26 && rng.next() < 0.4) ||
        (!isFuturesOnly && perfScore <= -1.7 && p.age >= 27) ||
        (delta < 0 && p.age >= 34) ||
        ((p.injuryHistoryCount ?? 0) >= 3 && delta < 0)
      ) {
        potDelta = -1;
        p.potential = Math.max(Math.max(45, p.ability), p.potential - 1);
        p.potentialTrend = p.age <= 25 ? '정체' : '하락';
      }

      const prevAbility = p.ability;
      let nextAbility = Math.max(35, Math.min(99, prevAbility + delta));
      // 전역 불변식: OVR은 절대 POT를 초과할 수 없음 (v18 POT는 전성기 예상 상한이며 모두 도달하는 것은 아님)
      if (nextAbility > p.potential) {
        nextAbility = p.potential;
        delta = nextAbility - prevAbility;
      }
      if (delta === 0 && potDelta === 0) continue;

      p.ability = nextAbility;
      p.seasonRatingDelta += delta;

      const reasonParts: string[] = [playingTimeNote];
      if (potDelta !== 0) {
        reasonParts.push(`성적 반영 잠재력 ${potDelta > 0 ? `+${potDelta}` : potDelta} (현재 잠재 ${p.potential})`);
      }
      if (delta > 0 && p.age <= 26) {
        reasonParts.push(`유망주 성장곡선(${p.age}세 · 잠재여유 +${headroom})`);
      } else if (delta < 0 && p.age >= 34) {
        reasonParts.push(`베테랑 노쇠화 구간(${p.age}세)`);
      }
      if (focusMatched && p.trainingFocus) {
        reasonParts.push(`${p.trainingFocus} 집중훈련(+0.45)`);
      }
      if (coachContribution !== 0) {
        reasonParts.push(
          `${p.role === '타자' ? '타격코치' : '투수코치'} 지도(${coachContribution > 0 ? `+${coachContribution}` : coachContribution})`
        );
      }
      if (facilityContribution > 0) {
        reasonParts.push(`아카데미 Lv.${academyLevel}(+${facilityContribution})`);
      }

      logs.push({
        id: `gr-r${round}-${p.id}`,
        date,
        round,
        teamId,
        playerId: p.id,
        playerName: p.name,
        age: p.age,
        sampleText,
        prevAbility,
        form: p.form,
        delta,
        nextAbility,
        trainingFocus: p.trainingFocus,
        coachContribution,
        facilityContribution,
        playingTimeNote,
        reason: reasonParts.join(' · '),
      });
    }
  }

  return logs;
}

function simulateRegularGames(
  career: CareerSave,
  maxGamesToRun: 1 | 3
): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  if (career.pendingAwardsCeremonySeason === career.season) {
    throw new Error(
      `${career.season} KBO 시즌 시상식 확인을 완료하고 오프시즌 단장 업무를 모두 마쳐야 경기를 진행할 수 있습니다.`
    );
  }
  if (career.phase === 'OFFSEASON') {
    throw new Error(
      '오프시즌 필수 업무를 모두 완료하고 단장 최종 개막 승인을 마쳐야 차기 시즌 경기를 진행할 수 있습니다.'
    );
  }
  if (career.phase !== 'REGULAR_SEASON') {
    throw new Error('정규시즌 단계에서만 정규시즌 시뮬레이션을 실행할 수 있습니다.');
  }
  if (career.currentSeriesIndex >= career.schedule.length) {
    throw new Error('모든 정규시즌 144경기가 이미 완료되었습니다.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  ensureSeasonPlayerArcsInPlace(next);
  const rng = new SeededRng(next.rngState);

  // 직전 경기/시리즈 시뮬레이션 전 정규시즌 구단별 순위 스냅샷 (순위 상승·하락 ▲▼ 표시용)
  if (next.gamesPlayed > 0 && next.gamesLedger.length > 0) {
    const prevRows = computeStandings(next.gamesLedger);
    const snap: Partial<Record<TeamId, number>> = {};
    for (const row of prevRows) {
      snap[row.teamId] = row.rank;
    }
    next.previousStandingsRanks = snap;
  }

  const series = next.schedule[next.currentSeriesIndex];
  const remainingCount = 3 - series.completedRounds;
  if (remainingCount <= 0) {
    next.currentSeriesIndex += 1;
    return { nextCareer: next, backupSnapshot };
  }

  const gamesToRunNow = Math.min(remainingCount, maxGamesToRun);
  const startOffset = series.completedRounds;
  const endOffset = startOffset + gamesToRunNow;

  const allNewGames: GameRecord[] = [];
  const playerTeamGames: GameRecord[] = [];
  const newInjuries: InjuryLog[] = [];
  const newGrowths: GrowthLog[] = [];

  const inv = next.finances.investments ?? DEFAULT_INVESTMENTS;
  const stadiumMult = 1 + (inv.stadiumLevel - 1) * 0.1;
  const marketingMult = 1 + (inv.marketingLevel - 1) * 0.18;
  const sponsorMerchMult = 1 + (next.finances.sponsor?.merchBoostPct ?? 0) / 100;

  const myTopStars = Object.values(next.players)
    .filter((p) => p.teamId === next.playerTeamId && p.rosterTier === '1군')
    .sort((a, b) => b.ability - a.ability)
    .slice(0, 3);
  const starAvg =
    myTopStars.length > 0
      ? myTopStars.reduce((s, p) => s + p.ability, 0) / myTopStars.length
      : 78;
  const starBoost = Math.max(0.85, Math.min(1.3, starAvg / 80));

  let seriesTicketBillion = 0;
  let seriesUniformBillion = 0;
  let seriesSpectators = 0;
  let seriesUniformUnits = 0;

  // #9: Realistic KBO Monday rest day / All-Star Break recovery & away travel fatigue (only at series start offset === 0)
  if (startOffset === 0) {
    if (series.isAllStarBreakBefore) {
      for (const p of Object.values(next.players)) {
        if (p.fatigue > 0) p.fatigue = Math.max(0, p.fatigue - 26);
      }
      applyOffDayPitcherRecoveryInPlace(next, 3);
    } else if (series.hasMondayRestBefore) {
      for (const p of Object.values(next.players)) {
        if (p.fatigue > 0) p.fatigue = Math.max(0, p.fatigue - 12);
      }
      applyOffDayPitcherRecoveryInPlace(next, 1);
    }

    const seriesTravelKm = series.travelDistanceKm ?? 150;
    if (seriesTravelKm >= 220) {
      for (const m of series.matchups) {
        const dist = computeTravelDistanceKm(m.away, m.home);
        if (dist >= 220) {
          for (const p of Object.values(next.players)) {
            if (p.teamId === m.away && p.rosterTier === '1군') {
              p.fatigue = Math.min(95, p.fatigue + 3);
            }
          }
        }
      }
    }
  }

  // Track matchups experiencing a rainout -> Doubleheader on Game 3 date (#9)
  const doubleheaderMatchupKeys = new Set<string>();
  const seriesNewsAttMult = Math.max(0.82, Math.min(1.22, 1 + (next.newsAttendanceBoostPct ?? 0) / 100));

  for (let offset = startOffset; offset < endOffset; offset++) {
    const round = series.startRound + offset;
    const rawDate = series.dates[offset] ?? series.dates[series.dates.length - 1];

    // Release national team players whose tournament call-up window has finished (#5)
    releaseReturnedNationalTeamPlayers(next, next.gamesPlayed, rawDate);

    advanceDailyRecoveryAndInjuries(next);

    // Other clubs automatically call up healthy 2군 depth when 1군 players suffer medium/long injuries
    for (const tid of TEAM_IDS) {
      if (tid === next.playerTeamId) continue;
      const t = next.teams[tid];
      const teamPlayers = Object.values(next.players).filter((p) => p.teamId === tid);
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

    // AI 감독 경기력·컨디션 기반 주기적 라인업/선발 로테이션 조정 (매 9경기)
    if (round > 0 && round % 9 === 0) {
      adjustAiLineupsAndRotationByFormInPlace(next);
    }

    for (const matchup of series.matchups) {
      const mKey = `${matchup.away}-${matchup.home}`;
      const isOutdoor = matchup.home !== '키움';
      if (offset === 1 && isOutdoor && rng.next() < 0.045) {
        doubleheaderMatchupKeys.add(mKey);
      }
      const isDh = doubleheaderMatchupKeys.has(mKey) && (offset === 1 || offset === 2);
      const dhGameNo: 1 | 2 | undefined = isDh ? (offset === 1 ? 1 : 2) : undefined;
      const gameDate = isDh ? (series.dates[2] ?? rawDate) : rawDate;

      const res = simulateSingleGame(next, rng, {
        round,
        date: gameDate,
        awayTeam: matchup.away,
        homeTeam: matchup.home,
        isPostseason: false,
        isDoubleheaderGame2: dhGameNo === 2,
      });

      if (isDh && dhGameNo) {
        res.game.isDoubleheader = true;
        res.game.doubleheaderGameNo = dhGameNo;
        res.game.isRainoutRescheduled = true;
        const dhNote = `우천 취소 → 더블헤더 ${dhGameNo}차전 편성 (${gameDate})`;
        res.game.substitutionNotes = [...(res.game.substitutionNotes ?? []), dhNote];
        if (dhGameNo === 2) {
          // Doubleheader game 2 adds slight extra fatigue to bullpen
          for (const p of Object.values(next.players)) {
            if ((p.teamId === matchup.away || p.teamId === matchup.home) && p.role === '투수' && p.rosterTier === '1군') {
              p.fatigue = Math.min(98, p.fatigue + 4);
            }
          }
        }
        if (matchup.away === next.playerTeamId || matchup.home === next.playerTeamId) {
          series.doubleheaderNote = `우천 취소로 ${gameDate} 더블헤더 1·2차전 진행`;
          series.rainoutCount = (series.rainoutCount ?? 0) + (dhGameNo === 1 ? 1 : 0);
        }
      }

      next.gamesLedger.push(res.game);
      allNewGames.push(res.game);
      if (matchup.away === next.playerTeamId || matchup.home === next.playerTeamId) {
        playerTeamGames.push(res.game);
      }

      if (res.newInjuries.length > 0) {
        next.injuryLogs.push(...res.newInjuries);
        newInjuries.push(...res.newInjuries);
      }

      // #7 & #4: Realistic club ticket/MD revenue (stadium share, facility condition, difficulty tightness)
      const diffRevMult = DIFFICULTY_CONFIG[next.difficulty ?? '어려움'].revenueTightness;
      const stadCondMult = getFacilityEffectivenessMult(next.finances.facilityCondition?.stadium);
      const mktCondMult = getFacilityEffectivenessMult(next.finances.facilityCondition?.marketing);

      const gameRivalryProfile = getRivalryEffectProfile(next, matchup.away, matchup.home);
      if (matchup.home === next.playerTeamId) {
        const teamInfo = KBO_TEAMS[next.playerTeamId];
        const pop = next.teams[next.playerTeamId].popularity / 100;
        const sentimentMult = 0.84 + ((next.teams[next.playerTeamId].fanSentiment ?? 65) / 100) * 0.32;
        const tPolicy = TICKET_PRICE_CONFIG[next.finances.ticketPricePolicy ?? '표준'];
        const rivalryMult = gameRivalryProfile ? gameRivalryProfile.attendanceMult : 1.0;
        const demandMult = teamInfo.ticketDemandMultiplier ?? 1.0;
        const attendanceRatio = Math.min(
          1.0,
          Math.max(
            0.35,
            pop *
              demandMult *
              sentimentMult *
              seriesNewsAttMult *
              tPolicy.attendanceMult *
              rivalryMult *
              stadCondMult *
              (0.7 + rng.next() * 0.2) +
              (inv.stadiumLevel - 1) * 0.025
          )
        );
        const spectators = Math.round(teamInfo.capacity * attendanceRatio);
        // Net ticket share (~56% after stadium rental, security, ticketing agency fees)
        const ticketBillion = Number(
          (
            (spectators * (teamInfo.ticketPriceAvg ?? 18000) * 0.56 * tPolicy.priceMult * stadiumMult * diffRevMult) /
            100_000_000
          ).toFixed(3)
        );
        seriesSpectators += spectators;
        seriesTicketBillion += ticketBillion;
      }

      if (matchup.home === next.playerTeamId || matchup.away === next.playerTeamId) {
        const isHome = matchup.home === next.playerTeamId;
        const teamInfo = KBO_TEAMS[next.playerTeamId];
        const pop = next.teams[next.playerTeamId].popularity;
        const demandMult = teamInfo.ticketDemandMultiplier ?? 1.0;
        const rivalryMerchMult = gameRivalryProfile ? gameRivalryProfile.merchMult : 1.0;
        const baseUnits =
          (260 + pop * 4.2) * demandMult * (isHome ? 1.4 : 0.62) * (0.85 + rng.next() * 0.3);
        const unitsSold = Math.round(
          baseUnits * marketingMult * sponsorMerchMult * starBoost * rivalryMerchMult * mktCondMult * diffRevMult
        );
        const uniformBillion = Number(((unitsSold * 135000) / 100_000_000).toFixed(3));
        seriesUniformUnits += unitsSold;
        seriesUniformBillion += uniformBillion;
      }
    }

    series.completedRounds += 1;
    next.gamesPlayed += 1;

    // Check 10-game growth milestone
    const standingsNow = computeStandings(next.gamesLedger);
    const gamesByTeam = new Map<TeamId, number>();
    for (const row of standingsNow) gamesByTeam.set(row.teamId, row.games);

    const gLogs = runTenGameGrowthEvaluation(next, rng, gamesByTeam, round, rawDate);
    if (gLogs.length > 0) {
      next.growthLogs.push(...gLogs);
      newGrowths.push(...gLogs);
    }
  }

  ensureFranchiseState(next);
  const completedWholeSeries = series.completedRounds >= 3;
  if (completedWholeSeries) {
    next.currentSeriesIndex += 1;
  }
  const playerStandings = computeStandings(next.gamesLedger).find((r) => r.teamId === next.playerTeamId);
  next.gamesPlayed = playerStandings?.games ?? next.gamesPlayed;
  const seriesDate = series.dates[Math.min(series.completedRounds - 1, series.dates.length - 1)] ?? `${next.season}-05-01`;

  // Release any national team players whose return round was reached on this game
  releaseReturnedNationalTeamPlayers(next, next.gamesPlayed, seriesDate);

  // Count rainouts & doubleheaders in window
  const rainoutCountInSeries = playerTeamGames.filter((g) => g.isRainoutRescheduled).length;
  const dhCountInSeries = playerTeamGames.filter((g) => g.isDoubleheader && g.doubleheaderGameNo === 1).length;
  next.rainoutCount = (next.rainoutCount ?? 0) + rainoutCountInSeries;
  next.doubleheaderCount = (next.doubleheaderCount ?? 0) + dhCountInSeries;

  // Simulate 2군 Futures League & rehab when a series finishes (or proportionally on single game)
  if (completedWholeSeries) {
    simulateFuturesSeriesAndRehab(next, rng, seriesDate);
  }

  const opponentTeam =
    playerTeamGames[0]?.awayTeam === next.playerTeamId
      ? playerTeamGames[0]?.homeTeam
      : playerTeamGames[0]?.awayTeam;
  const winsInSeries = playerTeamGames.filter((g) => g.winner === next.playerTeamId).length;
  const lossesInSeries = playerTeamGames.filter((g) => g.loser === next.playerTeamId).length;
  const drawsInSeries = playerTeamGames.filter((g) => g.isDraw).length;
  const seriesFraction = gamesToRunNow / 3;

  const activeSponsor =
    next.finances.sponsor &&
    next.finances.sponsor.status !== '만료' &&
    (next.finances.sponsor.yearsRemaining ?? 1) > 0
      ? next.finances.sponsor
      : null;

  const myTeamInfo = KBO_TEAMS[next.playerTeamId];
  const avgHomeOcc =
    seriesSpectators > 0 ? seriesSpectators / (myTeamInfo.capacity * Math.max(1, gamesToRunNow)) : 0;
  const attendanceBonusBillion =
    activeSponsor && avgHomeOcc >= 0.75
      ? Number(((activeSponsor.attendanceBonusBillion ?? 0) * seriesFraction).toFixed(3))
      : 0;

  const seriesSponsorBillion = activeSponsor
    ? Number(
        (
          activeSponsor.perSeriesBonusBillion * seriesFraction +
          winsInSeries * activeSponsor.winBonusBillion +
          attendanceBonusBillion
        ).toFixed(3)
      )
    : 0;
  const roundedTicket = Number(seriesTicketBillion.toFixed(3));
  const roundedUniform = Number(seriesUniformBillion.toFixed(3));
  const seriesTotalBillion = Number((roundedTicket + roundedUniform + seriesSponsorBillion).toFixed(3));

  // #19 & #33: Itemized realistic club accounting (scaled cleanly for 1-game or 3-game window)
  const myFirstTeamPlayers = Object.values(next.players).filter(
    (p) => p.teamId === next.playerTeamId && p.rosterTier === '1군'
  );
  const avgFirstAbility =
    myFirstTeamPlayers.length > 0
      ? myFirstTeamPlayers.reduce((s, p) => s + p.ability, 0) / myFirstTeamPlayers.length
      : 74;
  const facilityMaintCost =
    ((inv.stadiumLevel - 1) + (inv.marketingLevel - 1) + (inv.academyLevel - 1) + (inv.medicalLevel - 1)) * 0.09;
  const rosterPayrollFactor = Math.max(-0.15, (avgFirstAbility - 74) * 0.06);
  const fullSeriesOperatingCost = Math.max(
    1.15,
    myTeamInfo.operatingCostPerSeriesBillion * 0.92 + rosterPayrollFactor + facilityMaintCost
  );
  const seriesOperatingCost = Number((fullSeriesOperatingCost * seriesFraction).toFixed(3));
  const merchCogsBillion = Number((roundedUniform * 0.52).toFixed(3));
  const awayGamesCount = playerTeamGames.filter((g) => g.awayTeam === next.playerTeamId).length;
  const myAwayHost = playerTeamGames.find((g) => g.awayTeam === next.playerTeamId)?.homeTeam;
  const actualTravelKm = myAwayHost ? computeTravelDistanceKm(next.playerTeamId, myAwayHost) : 0;
  const travelCostBillion =
    awayGamesCount > 0
      ? Number((awayGamesCount * 0.11 + actualTravelKm * 0.001 * seriesFraction).toFixed(3))
      : 0;

  // #5 & #7: Realistic monthly payroll installment every 6 series (현역 선수 + 코치 + 방출 데드머니 분리 정산 · 이중지급 차단)
  let payrollCostBillion = 0;
  let deadMoneyInstallmentBillion = 0;
  if (completedWholeSeries && next.currentSeriesIndex % 6 === 0) {
    const activePlayersAnnualKrw = Object.values(next.players)
      .filter(
        (p) =>
          p.teamId === next.playerTeamId &&
          p.rosterTier !== '은퇴' &&
          p.rosterTier !== '해외이적' &&
          p.rosterTier !== '제외후보' &&
          p.rosterTier !== 'FA' &&
          !isMilitaryServing(p.militaryStatus)
      )
      .reduce((s, p) => {
        const ann =
          p.contract.currency === 'USD'
            ? (p.contract.annualSalary * 1350) / 100_000_000
            : p.contract.annualSalary ?? 0;
        return s + ann;
      }, 0);
    const coachAnnualKrw = (next.coaches[next.playerTeamId] ?? []).reduce(
      (s, c) => s + (c.annualSalaryBillion ?? 0),
      0
    );
    const annualDeadMoney = (next.finances.deadMoneyEntries ?? [])
      .filter((d) => d.teamId === next.playerTeamId && d.remainingSeasons > 0)
      .reduce((s, d) => s + d.annualObligationBillion, 0);
    // 8 monthly installments across season (연봉은 월 분할 1회만 지급, 계약금은 체결 시 1회만 지급)
    payrollCostBillion = Number(Math.max(3.0, (activePlayersAnnualKrw + coachAnnualKrw) / 8.5).toFixed(3));
    deadMoneyInstallmentBillion = Number((annualDeadMoney / 8.5).toFixed(3));
  }

  // #4: Degrade stadium / academy / medical / marketing facility condition over time
  degradeFacilitiesPerSeries(next, seriesFraction);

  // Evaluate performance incentive bonuses (#28)
  let incentiveCostBillion = 0;
  for (const p of myFirstTeamPlayers) {
    if (p.contract.incentiveBonusBillion && !p.contract.incentivePaid) {
      let achieved = false;
      if (p.role === '타자') {
        const b = p.stats as BatterStats;
        if ((b.HR ?? 0) >= 20 || (b.RBI ?? 0) >= 80 || (b.H ?? 0) >= 120) achieved = true;
      } else {
        const ps = p.stats as PitcherStats;
        if ((ps.W ?? 0) >= 10 || (ps.SV ?? 0) + (ps.HLD ?? 0) >= 15 || (ps.outs ?? 0) >= 450) achieved = true;
      }
      if (achieved) {
        p.contract.incentivePaid = true;
        p.morale = '만족';
        incentiveCostBillion = Number((incentiveCostBillion + p.contract.incentiveBonusBillion).toFixed(3));
      }
    }
  }

  // 프랜차이즈 스타 기념상품 매출 정산 (인기도 · 팬 수요 연동)
  const franchiseMerchInfo = computeClubFranchiseMerchandise(next, next.playerTeamId);
  const franchiseMerchDelta = Number((franchiseMerchInfo.perSeriesBillion * seriesFraction).toFixed(3));
  const totalSeriesRevWithFranchise = Number((seriesTotalBillion + franchiseMerchDelta).toFixed(3));
  const totalSeriesExpense = Number(
    (
      seriesOperatingCost +
      merchCogsBillion +
      travelCostBillion +
      payrollCostBillion +
      deadMoneyInstallmentBillion +
      incentiveCostBillion
    ).toFixed(3)
  );
  const seriesNetBillion = Number((totalSeriesRevWithFranchise - totalSeriesExpense).toFixed(3));

  next.finances.ticketRevenueBillion = Number(
    ((next.finances.ticketRevenueBillion ?? 0) + roundedTicket).toFixed(3)
  );
  next.finances.uniformRevenueBillion = Number(
    ((next.finances.uniformRevenueBillion ?? 0) + roundedUniform + franchiseMerchDelta).toFixed(3)
  );
  next.finances.franchiseMerchRevenueBillion = Number(
    ((next.finances.franchiseMerchRevenueBillion ?? 0) + franchiseMerchDelta).toFixed(3)
  );
  next.finances.sponsorRevenueBillion = Number(
    ((next.finances.sponsorRevenueBillion ?? 0) + seriesSponsorBillion).toFixed(3)
  );
  next.finances.seasonRevenueBillion = Number(
    (next.finances.seasonRevenueBillion + totalSeriesRevWithFranchise).toFixed(3)
  );
  next.finances.operatingExpenseBillion = Number(
    ((next.finances.operatingExpenseBillion ?? 0) + seriesOperatingCost).toFixed(3)
  );
  next.finances.merchCogsBillion = Number(
    ((next.finances.merchCogsBillion ?? 0) + merchCogsBillion).toFixed(3)
  );
  next.finances.travelExpenseBillion = Number(
    ((next.finances.travelExpenseBillion ?? 0) + travelCostBillion).toFixed(3)
  );
  next.finances.payrollPaidBillion = Number(
    ((next.finances.payrollPaidBillion ?? 0) + payrollCostBillion).toFixed(3)
  );
  next.finances.deadMoneyPaidBillion = Number(
    ((next.finances.deadMoneyPaidBillion ?? 0) + deadMoneyInstallmentBillion).toFixed(3)
  );
  next.finances.incentivePaidBillion = Number(
    ((next.finances.incentivePaidBillion ?? 0) + incentiveCostBillion).toFixed(3)
  );
  next.finances.optionBonusPaidBillion = Number(
    ((next.finances.optionBonusPaidBillion ?? 0) + incentiveCostBillion).toFixed(3)
  );
  next.finances.seasonExpenseBillion = Number(
    (next.finances.seasonExpenseBillion + totalSeriesExpense).toFixed(3)
  );
  if (next.finances.cashBalanceBillion !== null) {
    next.finances.cashBalanceBillion = Number(
      (next.finances.cashBalanceBillion + seriesNetBillion).toFixed(2)
    );
    if (next.finances.cashBalanceBillion < 0) {
      next.finances.cumulativeDeficitBillion = Number(
        Math.abs(next.finances.cashBalanceBillion).toFixed(2)
      );
      next.finances.spendingFrozenReason = `구단 운영 적자(${next.finances.cashBalanceBillion.toFixed(1)}억) 발생 — 신규 대형 FA·외국인 지출 제한`;
    } else {
      next.finances.spendingFrozenReason = null;
    }
  }
  if (seriesDate) {
    next.currentDate = seriesDate;
    syncAllAgesToDateInPlace(next, seriesDate);
  }
  enforceOvrPotInvariantInPlace(next.players);

  const seriesRivalryProfile = opponentTeam
    ? getRivalryEffectProfile(next, next.playerTeamId, opponentTeam)
    : null;
  if (completedWholeSeries && opponentTeam && seriesRivalryProfile) {
    if (winsInSeries === 3) {
      escalateRivalryOnSeriesSweep(next, next.playerTeamId, opponentTeam, next.playerTeamId, seriesDate);
    } else if (lossesInSeries === 3) {
      escalateRivalryOnSeriesSweep(next, next.playerTeamId, opponentTeam, opponentTeam, seriesDate);
    }
  }

  const financialSummary: SeriesFinancialSummary = {
    ticketBillion: roundedTicket,
    uniformBillion: Number((roundedUniform + franchiseMerchDelta).toFixed(3)),
    merchCogsBillion,
    sponsorBillion: seriesSponsorBillion,
    attendanceBonusBillion,
    operatingCostBillion: seriesOperatingCost,
    travelCostBillion,
    payrollCostBillion,
    incentiveCostBillion,
    totalBillion: totalSeriesRevWithFranchise,
    netBillion: seriesNetBillion,
    totalSpectators: seriesSpectators,
    uniformUnitsSold: seriesUniformUnits,
    rivalryName: seriesRivalryProfile?.rivalry.name,
    rivalryAttendanceBoostPct: seriesRivalryProfile
      ? Math.round((seriesRivalryProfile.attendanceMult - 1) * 100)
      : undefined,
    rivalryMerchBoostPct: seriesRivalryProfile
      ? Math.round((seriesRivalryProfile.merchMult - 1) * 100)
      : undefined,
  };

  // 월별 고교·대학 전국대회, MLB 30개 구단 해외 스카우팅, 해외파 성적·승격·이적 자동 경량 산출 (월 1회 가드)
  processMonthlyAmateurAndOverseasInPlace(next, rng, seriesDate);

  // Coach feedback + real-time slump swap reports + club events/news/complaints
  const { feedback, reports } = generatePostSeriesCoachFeedbackAndReports(
    next,
    playerTeamGames,
    rainoutCountInSeries
  );
  processSeriesEventsAndComplaints(next, rng, seriesDate, playerTeamGames);
  // 주 1회(최소 6경기 또는 7일 경과 시) 사용자·AI 10개 구단 전체 선수 불만도(0~100) 자동 평가
  evaluateLeagueWeeklyDissatisfactionInPlace(next, rng, seriesDate);
  if (completedWholeSeries) {
    ensureDeepFranchiseState(next);
    maybeTriggerDeepFrontOfficeEvent(next, rng, seriesDate);
  }

  // KBO 트레이드 마감 7일 전·3일 전·당일 알림 및 8월 1일 미체결 제안 자동 취소 (1경기 진행 시에도 누락 방지)
  processTradeWindowLifecycleInPlace(next, seriesDate);

  // 선발 경쟁 · 불펜 6개 보직 변동 · 야수 주전 경쟁/승격 · 출전 기회 불만 연동 (전 10개 구단 동일 적용)
  if (completedWholeSeries || next.gamesPlayed % 6 === 0) {
    evaluatePitcherCompetitionAndRolesInPlace(next, seriesDate);
    evaluateBatterCompetitionAndMoraleInPlace(next, seriesDate);
  }

  // KBO 웨이버 7일 심사(성적 역순 우선권 · 이적료 300만 원 · 기존 계약 승계 · 미영입 자유계약 · 독립리그/은퇴)
  processWaiverLifecycleInPlace(next, seriesDate, rng, {
    extraRetiredByTeam: (tid) => getTeamRetiredNumbers(next, tid),
  });

  // #7 해외연수 복귀, #5 국가대표 자동 차출, #3 감독 경질 + #10 타 9개 구단 단장 자율 운영, #11 검증 시리즈 속보
  // + #2 타구단 소식 & MLB 진출 선수 근황 + #6 KBO 통산 기록 실시간 갱신
  processOverseasTrainingReturns(next, rng, seriesDate);
  checkAndAutoRunNationalTeamEvents(next, rng);
  if (completedWholeSeries) {
    processLeagueManagerFiringsAndOtherClubGms(next, rng, seriesDate);
    simulateMlbExportsAndOtherClubNews(next, rng, seriesDate, allNewGames);
    refreshIncomingTradeOffers(next, rng, seriesDate);
  }
  generateVerifiedSeriesRecapNews(next, playerTeamGames, seriesDate);
  checkCareerMilestonesAndRecords(next, seriesDate);

  const seriesRec = `${winsInSeries}승 ${lossesInSeries}패${drawsInSeries > 0 ? ` ${drawsInSeries}무` : ''}`;
  const modeLabel =
    gamesToRunNow === 1
      ? `${opponentTeam ?? '리그'}전 ${series.completedRounds}차전 종료`
      : `${opponentTeam ?? '리그'} ${gamesToRunNow}연전 종료`;
  next.lastSeriesReport = {
    id: `report-s${series.seriesIndex}-g${series.completedRounds}`,
    title: `${modeLabel} (${seriesRec} · 시즌 ${playerStandings?.wins ?? 0}승 ${playerStandings?.losses ?? 0}패)`,
    isPostseason: false,
    playerTeamGames,
    allGamesInWindow: allNewGames,
    newInjuries,
    newGrowths,
    financialSummary,
    seriesFeedback: feedback,
    coachReports: reports,
    createdAt: new Date().toISOString(),
  };

  // Transition to POSTSEASON readiness when all 144 games completed
  if (next.gamesPlayed >= next.totalRegularGames || next.currentSeriesIndex >= next.schedule.length) {
    // Clear any remaining national team duty before postseason
    next.activeNationalTeamDuty = null;
    for (const pl of Object.values(next.players)) {
      pl.nationalTeamDuty = null;
    }
    const finalStandings = computeStandings(next.gamesLedger);
    const top5 = finalStandings.slice(0, 5).map((r) => r.teamId);
    // Lock reverse standings draft order for next season (#36)
    next.nextSeasonDraftOrder = computeReverseDraftOrder(next);
    if (finalStandings[0]?.teamId === next.playerTeamId) {
      unlockTrophy(next, {
        title: `${next.season} 정규시즌 페넌트레이스 1위`,
        category: '우승',
        description: `정규시즌 ${finalStandings[0].wins}승 ${finalStandings[0].losses}패로 한국시리즈 직행`,
        earnedDate: seriesDate,
      });
    }
    next.phase = 'POSTSEASON';
    next.postseason = {
      active: true,
      currentRound: 'WILDCARD',
      standingsSeed: top5,
      seriesHistory: [],
      currentSeries: {
        round: 'WILDCARD',
        label: '와일드카드 결정전 (4위 vs 5위)',
        higherSeedTeam: top5[3],
        lowerSeedTeam: top5[4],
        higherSeedRank: 4,
        lowerSeedRank: 5,
        higherWins: 0,
        lowerWins: 0,
        winsRequiredHigher: 1, // 4위 1승 또는 무승부 시 진출
        winsRequiredLower: 2,  // 5위 2승 필요
        games: [],
        winnerTeam: null,
      },
      champion: null,
    };
  }

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();

  return { nextCareer: next, backupSnapshot };
}

/**
 * Simulates strictly ONE regular-season 3-game series (or remaining games of current series) across all 10 teams.
 */
export function simulateNextRegularSeries(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  return simulateRegularGames(career, 3);
}

/**
 * #7: Simulates strictly ONE regular-season game (1 round across all 10 teams).
 */
export function simulateNextRegularGame(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  return simulateRegularGames(career, 1);
}

/**
 * Simulates strictly ONE postseason game per user click (v4.60.17).
 */
export function simulateNextPostseasonGame(career: CareerSave): {
  nextCareer: CareerSave;
  backupSnapshot: CareerSave;
} {
  if (career.phase !== 'POSTSEASON' || !career.postseason.currentSeries) {
    throw new Error('진행 가능한 포스트시즌 경기가 없습니다.');
  }

  const backupSnapshot = cloneCareer(career);
  const next = cloneCareer(career);
  const rng = new SeededRng(next.rngState);
  const ps = next.postseason;
  const series = ps.currentSeries!;

  const gameNumber = series.games.length + 1;
  const psGamesCount = next.gamesLedger.filter((g) => g.isPostseason).length;
  const roundNum = 1000 + psGamesCount + 1;
  const dateStr = addDaysIso(`${next.season}-10-05`, psGamesCount);
  next.currentDate = dateStr;
  syncAllAgesToDateInPlace(next, dateStr);

  // Home/away assignment by series format
  let homeTeam = series.higherSeedTeam;
  let awayTeam = series.lowerSeedTeam;
  if (series.round === 'SEMI_PO' || series.round === 'PO') {
    // 2-2-1 format
    if (gameNumber === 3 || gameNumber === 4) {
      homeTeam = series.lowerSeedTeam;
      awayTeam = series.higherSeedTeam;
    }
  } else if (series.round === 'KOREAN_SERIES') {
    // 2-3-2 format
    if (gameNumber >= 3 && gameNumber <= 5) {
      homeTeam = series.lowerSeedTeam;
      awayTeam = series.higherSeedTeam;
    }
  }

  advanceDailyRecoveryAndInjuries(next);

  const res = simulateSingleGame(next, rng, {
    round: roundNum,
    date: dateStr,
    awayTeam,
    homeTeam,
    isPostseason: true,
    postseasonRound: series.round,
  });

  next.gamesLedger.push(res.game);
  series.games.push(res.game);
  if (res.newInjuries.length > 0) {
    next.injuryLogs.push(...res.newInjuries);
  }

  if (res.game.winner === series.higherSeedTeam) series.higherWins += 1;
  else if (res.game.winner === series.lowerSeedTeam) series.lowerWins += 1;

  // Check series winner
  if (series.higherWins >= series.winsRequiredHigher) {
    series.winnerTeam = series.higherSeedTeam;
  } else if (series.lowerWins >= series.winsRequiredLower) {
    series.winnerTeam = series.lowerSeedTeam;
  }

  let psFinancialSummary: SeriesFinancialSummary | undefined;
  if (homeTeam === next.playerTeamId || awayTeam === next.playerTeamId) {
    const inv = next.finances.investments ?? DEFAULT_INVESTMENTS;
    const stadiumMult = 1 + (inv.stadiumLevel - 1) * 0.1;
    const marketingMult = 1 + (inv.marketingLevel - 1) * 0.18;
    const activeSponsor =
      next.finances.sponsor &&
      next.finances.sponsor.status !== '만료' &&
      (next.finances.sponsor.yearsRemaining ?? 1) > 0
        ? next.finances.sponsor
        : null;
    const sponsorMerchMult = 1 + (activeSponsor?.merchBoostPct ?? 0) / 100;
    const myTeamInfo = KBO_TEAMS[next.playerTeamId];

    let psSpectators = 0;
    let psTicket = 0;
    if (homeTeam === next.playerTeamId) {
      psSpectators = myTeamInfo.capacity;
      psTicket = Number(((psSpectators * 25000 * stadiumMult) / 100_000_000).toFixed(3));
    }
    const psUnits = Math.round(
      (1400 + next.teams[next.playerTeamId].popularity * 15) *
        (myTeamInfo.ticketDemandMultiplier ?? 1.0) *
        (homeTeam === next.playerTeamId ? 1.6 : 0.9) *
        marketingMult *
        sponsorMerchMult
    );
    const psUniform = Number(((psUnits * 145000) / 100_000_000).toFixed(3));
    const psAttBonus =
      activeSponsor && homeTeam === next.playerTeamId
        ? Number(((activeSponsor.attendanceBonusBillion ?? 0) * 0.5).toFixed(3))
        : 0;
    const psSponsor = activeSponsor
      ? Number(
          (
            activeSponsor.perSeriesBonusBillion * 0.4 +
            psAttBonus +
            (res.game.winner === next.playerTeamId ? activeSponsor.winBonusBillion * 1.5 : 0)
          ).toFixed(3)
        )
      : 0;
    const psTotal = Number((psTicket + psUniform + psSponsor).toFixed(3));
    const psOpCost = Number((myTeamInfo.operatingCostPerSeriesBillion / 3).toFixed(3));
    const psNet = Number((psTotal - psOpCost).toFixed(3));

    next.finances.ticketRevenueBillion = Number(
      ((next.finances.ticketRevenueBillion ?? 0) + psTicket).toFixed(3)
    );
    next.finances.uniformRevenueBillion = Number(
      ((next.finances.uniformRevenueBillion ?? 0) + psUniform).toFixed(3)
    );
    next.finances.sponsorRevenueBillion = Number(
      ((next.finances.sponsorRevenueBillion ?? 0) + psSponsor).toFixed(3)
    );
    next.finances.seasonRevenueBillion = Number(
      (next.finances.seasonRevenueBillion + psTotal).toFixed(3)
    );
    next.finances.operatingExpenseBillion = Number(
      ((next.finances.operatingExpenseBillion ?? 0) + psOpCost).toFixed(3)
    );
    next.finances.seasonExpenseBillion = Number(
      (next.finances.seasonExpenseBillion + psOpCost).toFixed(3)
    );
    if (next.finances.cashBalanceBillion !== null) {
      next.finances.cashBalanceBillion = Number(
        (next.finances.cashBalanceBillion + psNet).toFixed(2)
      );
    }

    psFinancialSummary = {
      ticketBillion: psTicket,
      uniformBillion: psUniform,
      sponsorBillion: psSponsor,
      attendanceBonusBillion: psAttBonus,
      operatingCostBillion: psOpCost,
      totalBillion: psTotal,
      netBillion: psNet,
      totalSpectators: psSpectators,
      uniformUnitsSold: psUnits,
    };
  }

  next.lastSeriesReport = {
    id: `report-ps-${series.round}-g${gameNumber}`,
    title: `${series.label} ${gameNumber}차전 (${awayTeam} ${res.game.awayRuns}:${res.game.homeRuns} ${homeTeam})`,
    isPostseason: true,
    playerTeamGames: [res.game],
    allGamesInWindow: [res.game],
    newInjuries: res.newInjuries,
    newGrowths: [],
    financialSummary: psFinancialSummary,
    createdAt: new Date().toISOString(),
  };

  if (series.winnerTeam) {
    const winner = series.winnerTeam;
    const winnerRank =
      winner === series.higherSeedTeam ? series.higherSeedRank : series.lowerSeedRank;
    ps.seriesHistory.push({ ...series });

    const seeds = ps.standingsSeed;
    if (series.round === 'WILDCARD') {
      ps.currentRound = 'SEMI_PO';
      ps.currentSeries = {
        round: 'SEMI_PO',
        label: '준플레이오프 (5전 3선승)',
        higherSeedTeam: seeds[2],
        lowerSeedTeam: winner,
        higherSeedRank: 3,
        lowerSeedRank: winnerRank,
        higherWins: 0,
        lowerWins: 0,
        winsRequiredHigher: 3,
        winsRequiredLower: 3,
        games: [],
        winnerTeam: null,
      };
    } else if (series.round === 'SEMI_PO') {
      ps.currentRound = 'PO';
      ps.currentSeries = {
        round: 'PO',
        label: '플레이오프 (5전 3선승)',
        higherSeedTeam: seeds[1],
        lowerSeedTeam: winner,
        higherSeedRank: 2,
        lowerSeedRank: winnerRank,
        higherWins: 0,
        lowerWins: 0,
        winsRequiredHigher: 3,
        winsRequiredLower: 3,
        games: [],
        winnerTeam: null,
      };
    } else if (series.round === 'PO') {
      ps.currentRound = 'KOREAN_SERIES';
      ps.currentSeries = {
        round: 'KOREAN_SERIES',
        label: '한국시리즈 (7전 4선승)',
        higherSeedTeam: seeds[0],
        lowerSeedTeam: winner,
        higherSeedRank: 1,
        lowerSeedRank: winnerRank,
        higherWins: 0,
        lowerWins: 0,
        winsRequiredHigher: 4,
        winsRequiredLower: 4,
        games: [],
        winnerTeam: null,
      };
    } else if (series.round === 'KOREAN_SERIES') {
      ps.currentRound = 'FINISHED';
      ps.champion = winner;
      ps.currentSeries = null;
      next.phase = 'OFFSEASON';

      const runnerUp =
        winner === series.higherSeedTeam ? series.lowerSeedTeam : series.higherSeedTeam;
      const winCount =
        winner === series.higherSeedTeam ? series.higherWins : series.lowerWins;
      const loseCount =
        winner === series.higherSeedTeam ? series.lowerWins : series.higherWins;

      // Compute Korean Series MVP from winning team's KS boxscores
      const batScore = new Map<
        string,
        { name: string; score: number; AB: number; H: number; HR: number; RBI: number }
      >();
      const pitScore = new Map<
        string,
        { name: string; score: number; W: number; SV: number; outs: number; ER: number; SO: number }
      >();

      for (const gm of series.games) {
        if (!gm.boxscore) continue;
        const winBats = gm.homeTeam === winner ? gm.boxscore.homeBatters : gm.boxscore.awayBatters;
        const winPits = gm.homeTeam === winner ? gm.boxscore.homePitchers : gm.boxscore.awayPitchers;
        for (const b of winBats) {
          const cur = batScore.get(b.playerId) ?? {
            name: b.name,
            score: 0,
            AB: 0,
            H: 0,
            HR: 0,
            RBI: 0,
          };
          cur.AB += b.AB;
          cur.H += b.H;
          cur.HR += b.HR;
          cur.RBI += b.RBI;
          cur.score += b.HR * 4.5 + b.RBI * 2.1 + b.H * 1.2 + b.BB * 0.4;
          batScore.set(b.playerId, cur);
        }
        for (const pt of winPits) {
          const cur = pitScore.get(pt.playerId) ?? {
            name: pt.name,
            score: 0,
            W: 0,
            SV: 0,
            outs: 0,
            ER: 0,
            SO: 0,
          };
          cur.W += pt.W;
          cur.SV += pt.SV;
          cur.outs += pt.outs;
          cur.ER += pt.ER;
          cur.SO += pt.SO;
          cur.score += pt.W * 9 + pt.SV * 5.5 + pt.outs * 0.5 - pt.ER * 2.2 + pt.SO * 0.45;
          pitScore.set(pt.playerId, cur);
        }
      }

      const bestBat = [...batScore.entries()].sort((a, b) => b[1].score - a[1].score)[0];
      const bestPit = [...pitScore.entries()].sort((a, b) => b[1].score - a[1].score)[0];

      let ksMvp = {
        category: '한국시리즈 MVP',
        playerId: '',
        playerName: `${KBO_TEAMS[winner].shortName} 주장`,
        teamId: winner,
        statSummary: '한국시리즈 우승 주역',
        votes: 76,
      };
      if (bestBat && (!bestPit || bestBat[1].score >= bestPit[1].score)) {
        const b = bestBat[1];
        const avg = b.AB > 0 ? (b.H / b.AB).toFixed(3).replace(/^0/, '') : '.000';
        ksMvp = {
          category: '한국시리즈 MVP',
          playerId: bestBat[0],
          playerName: b.name,
          teamId: winner,
          statSummary: `KS 타율 ${avg} (${b.H}/${b.AB}) · ${b.HR}홈런 ${b.RBI}타점`,
          votes: 79,
        };
      } else if (bestPit) {
        const pt = bestPit[1];
        ksMvp = {
          category: '한국시리즈 MVP',
          playerId: bestPit[0],
          playerName: pt.name,
          teamId: winner,
          statSummary: `KS ${pt.W}승${pt.SV > 0 ? ` ${pt.SV}세이브` : ''} · ${formatIP(pt.outs)}이닝 ${pt.ER}자책 ${pt.SO}K`,
          votes: 81,
        };
      }

      ps.ksMvp = ksMvp;

      const isUserWinner = winner === next.playerTeamId;

      const champRec: ChampionRecord = {
        season: next.season,
        championTeamId: winner,
        runnerUpTeamId: runnerUp,
        seriesScore: `${winCount}승 ${loseCount}패`,
        ksMvpName: ksMvp.playerName,
        ksMvpSummary: ksMvp.statSummary,
        rewardCashBillion: isUserWinner ? 25.0 : 0,
        date: dateStr,
      };

      next.championHistory = upsertChampionRecord(next.championHistory, champRec);

      // 우승 보상 및 포스트시즌 모기업 차등 보너스 · 예산 +10% · 특수 업적 · 중복 방지 정산 (#18)
      const rewardRec = applyKoreanSeriesChampionshipRewardsInPlace(next, winner, runnerUp, dateStr);
      const userPsReward = rewardRec?.postseasonRewards.find((r) => r.teamId === next.playerTeamId);
      const bonusCashBillion = userPsReward?.parentCompanyBonusBillion ?? (isUserWinner ? 25.0 : 0);
      const totalV = getClubTitleCount(next, winner);

      ps.championEvent = {
        season: next.season,
        championTeamId: winner,
        runnerUpTeamId: runnerUp,
        seriesScore: `${winCount}승 ${loseCount}패`,
        ksMvp,
        isPlayerChampion: isUserWinner,
        rewardCashBillion: bonusCashBillion,
        popularityBoost: 8,
        headline: isUserWinner
          ? `${next.season} KBO 한국시리즈 우승! ${KBO_TEAMS[winner].name} V${totalV} 통합 우승 달성`
          : `${next.season} KBO 한국시리즈 ${KBO_TEAMS[winner].name} V${totalV} 우승 확정`,
        details: isUserWinner
          ? [
              `모기업 특별 우승 보너스 +${bonusCashBillion.toFixed(1)}억 원 지급 · 차기 시즌 구단 운영 예산 +10% 확정`,
              `우승 반지 수여식 · 구단주 신뢰도·구단 평판·팬 충성도 대폭 상승 · FA/외국인 선호도 소폭 상승`,
              ...(rewardRec?.specialAchievements ?? []),
              `참고: 우승 핵심 선수 연봉 인상 요구 소폭 상승 및 타 구단 코치 영입 관심 발생 (샐러리캡·정원 규정 정상 준수)`,
            ]
          : [
              `${KBO_TEAMS[winner].name}이(가) ${KBO_TEAMS[runnerUp].name}을(를) ${winCount}승 ${loseCount}패로 꺾고 V${totalV} 우승을 차지했습니다.`,
              `한국시리즈 MVP: ${ksMvp.playerName} (${ksMvp.statSummary})`,
              ...(rewardRec?.specialAchievements ?? []),
              ...(userPsReward
                ? [`우리 구단 ${userPsReward.finishLabel} 모기업 특별 보너스 +${userPsReward.parentCompanyBonusBillion.toFixed(1)}억 원 지급`]
                : []),
            ],
        acknowledged: false,
      };

      next.transactionLogs.unshift({
        id: `tx-ks-champ-${next.season}`,
        date: dateStr,
        type: isUserWinner ? '재정' : '엔트리',
        teamId: winner,
        summary: `${next.season} KBO 한국시리즈 우승: ${KBO_TEAMS[winner].name} V${totalV} (${winCount}승 ${loseCount}패 vs ${KBO_TEAMS[runnerUp].shortName}) · MVP ${ksMvp.playerName}`,
        detail: isUserWinner
          ? `우승 보너스 +${bonusCashBillion.toFixed(1)}억 · 차기 시즌 운영 예산 +10% · 우승 반지 수여식 발동`
          : `KS MVP: ${ksMvp.playerName} (${ksMvp.statSummary})`,
      });

      // 임시 주장 동기화 (#15)
      for (const tid of TEAM_IDS) {
        syncActingCaptainInPlace(next, tid, false);
      }

      // #26, #32, #35, #36: 한국시리즈 최종 순위 확정 직후 차기 신인 드래프트 순서 자동 갱신 (KS 우승팀 = 마지막 기본 순번)
      next.nextSeasonDraftOrder = computeReverseDraftOrder(next);
      next.offseasonStep = 'AWARDS_AND_EVAL';
      next.offseasonStep12 = 'FINAL_SETTLEMENT';
      next.completedOffseasonSteps12 = [];
      next.offseasonStep8 = 'SETTLEMENT';
      next.completedOffseasonSteps8 = [];
      next.aiOffseasonProcessedSeason = undefined;
      next.aiOffseasonLogSummary = [];
      evaluateSeasonOwnerGrade(next);
      if (isUserWinner) {
        unlockTrophy(next, {
          title: `${next.season} KBO 한국시리즈 우승`,
          category: '우승',
          description: `${KBO_TEAMS[runnerUp].name} 상대로 ${winCount}승 ${loseCount}패 우승 · MVP ${ksMvp.playerName}`,
          earnedDate: dateStr,
        });
      }
      // 한국시리즈 우승 직후 2026 KBO 공식 정규시즌 시상식 자동 집계 (시상식 화면 선행 노출 · 자동 차기시즌 금지)
      const { awards: officialAwards } = runOfficialSeasonAwardsCeremonyInPlace(next, {
        setPendingCeremony: true,
      });
      if (officialAwards.mvp && officialAwards.mvp.teamId === next.playerTeamId) {
        unlockTrophy(next, {
          title: `${next.season} 정규시즌 MVP 배출`,
          category: '개인배출',
          description: `${officialAwards.mvp.playerName} (${officialAwards.mvp.statSummary})`,
          earnedDate: `${next.season}-11-15`,
        });
      }
      if (
        officialAwards.managerOfTheYear &&
        officialAwards.managerOfTheYear.teamId === next.playerTeamId
      ) {
        unlockTrophy(next, {
          title: `${next.season} 올해의 감독상 수상`,
          category: '개인배출',
          description: `${officialAwards.managerOfTheYear.managerName} 감독 (${officialAwards.managerOfTheYear.wins}승 ${officialAwards.managerOfTheYear.losses}패 · ${officialAwards.managerOfTheYear.rank}위)`,
          earnedDate: `${next.season}-11-15`,
        });
      }
      archiveCompletedSeasonRecords(next, officialAwards);
      // 오프시즌 진입(한국시리즈 종료 다음 날) -> 트레이드 시장 자동 재개방 + FA 자격 만료 선수 이탈 + 스토브리그 트레이드 제안
      const ksEndDate = dateStr || `${next.season}-11-11`;
      const tradeReopenDate = notifyTradeMarketReopenedAfterKoreanSeriesInPlace(next, ksEndDate);
      releaseExpiredFaPlayersToMarket(next, tradeReopenDate);
      refreshIncomingTradeOffers(next, rng, tradeReopenDate);
    }
  }

  next.rngState = rng.getState();
  next.version = bumpVersion(next.version);
  next.updatedAt = new Date().toISOString();

  return { nextCareer: next, backupSnapshot };
}
