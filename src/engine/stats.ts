import { TEAM_IDS } from '../data/kboTeams';
import {
  BatterStats,
  CareerSave,
  GameRecord,
  LeaderboardEntry,
  PitcherStats,
  Player,
  StandingsRow,
  TeamId,
} from '../types/kbo';

export function emptyBatterStats(isSynthetic = false): BatterStats {
  return {
    G: 0,
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
    isSynthetic,
  };
}

export function emptyPitcherStats(isSynthetic = false): PitcherStats {
  return {
    G: 0,
    GS: 0,
    outs: 0,
    W: 0,
    L: 0,
    HLD: 0,
    SV: 0,
    H: 0,
    BB: 0,
    SO: 0,
    ER: 0,
    R: 0,
    HR: 0,
    PC: 0,
    isSynthetic,
  };
}

export function formatIP(outs: number | null | undefined): string {
  if (outs === null || outs === undefined) return '미집계';
  const whole = Math.floor(outs / 3);
  const rem = outs % 3;
  return `${whole}.${rem}`;
}

export function calcAVG(h: number | null, ab: number | null): number | null {
  if (h === null || ab === null || ab <= 0) return null;
  return h / ab;
}

export function calcOBP(
  h: number | null,
  bb: number | null,
  hbp: number | null,
  ab: number | null,
  sf: number | null
): number | null {
  if (h === null || bb === null || ab === null) return null;
  const hbpVal = hbp ?? 0;
  const sfVal = sf ?? 0;
  const denom = ab + bb + hbpVal + sfVal;
  if (denom <= 0) return null;
  return (h + bb + hbpVal) / denom;
}

export function calcSLG(tb: number | null, ab: number | null): number | null {
  if (tb === null || ab === null || ab <= 0) return null;
  return tb / ab;
}

export function calcOPS(b: BatterStats): number | null {
  const obp = calcOBP(b.H, b.BB, b.HBP, b.AB, b.SF);
  const slg = calcSLG(b.TB, b.AB);
  if (obp === null || slg === null) return null;
  return obp + slg;
}

export function calcERA(er: number | null, outs: number | null): number | null {
  if (er === null || outs === null || outs <= 0) return null;
  return (er * 27) / outs;
}

export function calcWHIP(h: number | null, bb: number | null, outs: number | null): number | null {
  if (h === null || bb === null || outs === null || outs <= 0) return null;
  return ((h + bb) * 3) / outs;
}

export function calcWPCT(w: number | null, l: number | null): number | null {
  if (w === null || l === null) return null;
  const denom = w + l;
  if (denom <= 0) return null;
  return w / denom;
}

export function formatRate3(val: number | null): string {
  if (val === null || Number.isNaN(val)) return '—';
  return val.toFixed(3).replace(/^0(?=\.)/, '');
}

export function formatRate2(val: number | null): string {
  if (val === null || Number.isNaN(val)) return '—';
  return val.toFixed(2);
}

export function computeStandings(gamesLedger: GameRecord[]): StandingsRow[] {
  const acc: Record<
    TeamId,
    {
      wins: number;
      losses: number;
      draws: number;
      games: number;
      rs: number;
      ra: number;
      results: ('W' | 'L' | 'D')[];
    }
  > = {} as never;

  for (const t of TEAM_IDS) {
    acc[t] = { wins: 0, losses: 0, draws: 0, games: 0, rs: 0, ra: 0, results: [] };
  }

  const regGames = gamesLedger
    .filter((g) => !g.isPostseason)
    .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date));

  for (const g of regGames) {
    const away = acc[g.awayTeam];
    const home = acc[g.homeTeam];
    if (!away || !home) continue;

    away.games += 1;
    home.games += 1;
    away.rs += g.awayRuns;
    away.ra += g.homeRuns;
    home.rs += g.homeRuns;
    home.ra += g.awayRuns;

    if (g.isDraw || g.awayRuns === g.homeRuns) {
      away.draws += 1;
      home.draws += 1;
      away.results.push('D');
      home.results.push('D');
    } else if (g.winner === g.awayTeam) {
      away.wins += 1;
      home.losses += 1;
      away.results.push('W');
      home.results.push('L');
    } else {
      home.wins += 1;
      away.losses += 1;
      home.results.push('W');
      away.results.push('L');
    }
  }

  const rows: StandingsRow[] = TEAM_IDS.map((teamId) => {
    const d = acc[teamId];
    const dec = d.wins + d.losses;
    const pct = dec > 0 ? d.wins / dec : 0;

    // Calculate streak ignoring draws at end or stopping on change
    let streak = '—';
    if (d.results.length > 0) {
      const last = d.results[d.results.length - 1];
      let count = 0;
      for (let i = d.results.length - 1; i >= 0; i--) {
        if (d.results[i] === last) count++;
        else break;
      }
      streak = last === 'W' ? `${count}연승` : last === 'L' ? `${count}연패` : `${count}무`;
    }

    return {
      rank: 1,
      isTied: false,
      teamId,
      games: d.games,
      wins: d.wins,
      losses: d.losses,
      draws: d.draws,
      pct,
      gb: 0,
      streak,
      runsScored: d.rs,
      runsAllowed: d.ra,
      runDiff: d.rs - d.ra,
    };
  });

  rows.sort((a, b) => {
    if (b.pct !== a.pct) return b.pct - a.pct;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.teamId.localeCompare(b.teamId, 'ko');
  });

  const leader = rows[0];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i === 0) {
      r.rank = 1;
      r.gb = 0;
    } else {
      const prev = rows[i - 1];
      const samePct = Math.abs(r.pct - prev.pct) < 1e-6 && r.wins === prev.wins && r.losses === prev.losses;
      r.rank = samePct ? prev.rank : i + 1;
      r.gb = ((leader.wins - r.wins) + (r.losses - leader.losses)) / 2;
    }
  }

  // Mark shared ranks
  const rankCounts = new Map<number, number>();
  for (const r of rows) {
    rankCounts.set(r.rank, (rankCounts.get(r.rank) ?? 0) + 1);
  }
  for (const r of rows) {
    r.isTied = (rankCounts.get(r.rank) ?? 0) > 1;
  }

  return rows;
}

export type BatterTitleKey = 'HR' | 'AVG' | 'RBI' | 'H' | 'R' | 'SB' | 'OBP' | 'SLG' | 'OPS';
export type PitcherTitleKey = 'W' | 'ERA' | 'SO' | 'SV' | 'HLD' | 'WHIP' | 'IP' | 'WPCT';

export function computeLeaderboards(
  career: CareerSave,
  category: BatterTitleKey | PitcherTitleKey
): LeaderboardEntry[] {
  const standings = computeStandings(career.gamesLedger);
  const gamesByTeam = new Map<TeamId, number>();
  for (const s of standings) gamesByTeam.set(s.teamId, s.games);

  const players = Object.values(career.players).filter((p) => p.rosterTier !== '은퇴');
  const isBatterCat = ['HR', 'AVG', 'RBI', 'H', 'R', 'SB', 'OBP', 'SLG', 'OPS'].includes(category);

  interface RawCandidate {
    player: Player;
    val: number;
    display: string;
    qualified: boolean;
    isMin: boolean;
    note?: string;
  }

  const list: RawCandidate[] = [];

  for (const p of players) {
    const teamGames = Math.max(1, gamesByTeam.get(p.teamId) ?? career.gamesPlayed);
    const minPA = Math.ceil(teamGames * 3.1);
    const minOuts = teamGames * 3; // 1 IP per game

    if (isBatterCat && p.role === '타자') {
      const b = p.stats as BatterStats;
      if (category === 'HR') {
        const val = b.HR ?? b.confirmedMinHR ?? null;
        if (val === null) continue;
        const isMin = b.HR === null && b.confirmedMinHR !== undefined;
        list.push({
          player: p,
          val,
          display: isMin ? `${val}+` : String(val),
          qualified: true,
          isMin,
          note: isMin ? '초반 3경기 원자료 부족 최소치' : undefined,
        });
      } else if (category === 'RBI') {
        const val = b.RBI ?? b.confirmedMinRBI ?? null;
        if (val === null) continue;
        const isMin = b.RBI === null && b.confirmedMinRBI !== undefined;
        list.push({
          player: p,
          val,
          display: isMin ? `${val}+` : String(val),
          qualified: true,
          isMin,
          note: isMin ? '초반 3경기 원자료 부족 최소치' : undefined,
        });
      } else if (category === 'H' || category === 'R' || category === 'SB') {
        const val = b[category];
        if (val === null) continue;
        list.push({
          player: p,
          val,
          display: String(val),
          qualified: true,
          isMin: Boolean(b.isPartial),
        });
      } else {
        // Ratio categories: AVG, OBP, SLG, OPS
        if (b.isPartial || b.PA === null || b.AB === null) continue; // Do not distort with incomplete early Hanwha series
        const qualified = b.PA >= minPA;
        let val: number | null = null;
        if (category === 'AVG') val = calcAVG(b.H, b.AB);
        else if (category === 'OBP') val = calcOBP(b.H, b.BB, b.HBP, b.AB, b.SF);
        else if (category === 'SLG') val = calcSLG(b.TB, b.AB);
        else if (category === 'OPS') val = calcOPS(b);
        if (val === null) continue;
        list.push({
          player: p,
          val,
          display: formatRate3(val),
          qualified,
          isMin: false,
          note: qualified ? undefined : `규정타석(${minPA}PA) 미달`,
        });
      }
    } else if (!isBatterCat && p.role === '투수') {
      const ps = p.stats as PitcherStats;
      if (category === 'W' || category === 'SO' || category === 'SV' || category === 'HLD') {
        const val = ps[category];
        if (val === null) continue;
        list.push({
          player: p,
          val,
          display: String(val),
          qualified: true,
          isMin: Boolean(ps.isPartial),
        });
      } else if (category === 'IP') {
        if (ps.outs === null) continue;
        list.push({
          player: p,
          val: ps.outs,
          display: formatIP(ps.outs),
          qualified: true,
          isMin: Boolean(ps.isPartial),
        });
      } else if (category === 'ERA') {
        if (ps.isPartial && ps.ER === null) continue;
        const val = calcERA(ps.ER, ps.outs);
        if (val === null || ps.outs === null) continue;
        const qualified = ps.outs >= minOuts;
        list.push({
          player: p,
          val,
          display: formatRate2(val),
          qualified,
          isMin: Boolean(ps.isPartial),
          note: qualified ? undefined : `규정이닝(${teamGames}.0IP) 미달`,
        });
      } else if (category === 'WHIP') {
        if (ps.isPartial && (ps.H === null || ps.BB === null)) continue;
        const val = calcWHIP(ps.H, ps.BB, ps.outs);
        if (val === null || ps.outs === null) continue;
        const qualified = ps.outs >= minOuts;
        list.push({
          player: p,
          val,
          display: formatRate2(val),
          qualified,
          isMin: Boolean(ps.isPartial),
          note: qualified ? undefined : `규정이닝(${teamGames}.0IP) 미달`,
        });
      } else if (category === 'WPCT') {
        const val = calcWPCT(ps.W, ps.L);
        if (val === null) continue;
        const minWins = teamGames >= 100 ? 10 : Math.max(1, Math.floor(teamGames / 9));
        const qualified = (ps.W ?? 0) >= minWins;
        list.push({
          player: p,
          val,
          display: formatRate3(val),
          qualified,
          isMin: Boolean(ps.isPartial),
          note: qualified ? undefined : `최소 ${minWins}승 조건 미달`,
        });
      }
    }
  }

  const lowerIsBetter = category === 'ERA' || category === 'WHIP';

  // Filter qualified first; if ratio category has qualified entries, only rank qualified (v4.59 rule: never auto-rank unqualified as 1st)
  const isRatio = ['AVG', 'OBP', 'SLG', 'OPS', 'ERA', 'WHIP', 'WPCT'].includes(category);
  const qualifiedPool = isRatio ? list.filter((c) => c.qualified) : list;
  const activePool = qualifiedPool.length > 0 ? qualifiedPool : list;

  activePool.sort((a, b) => {
    if (lowerIsBetter) {
      if (a.val !== b.val) return a.val - b.val;
    } else {
      if (b.val !== a.val) return b.val - a.val;
    }
    return a.player.name.localeCompare(b.player.name, 'ko');
  });

  const top = activePool.slice(0, 10);
  const result: LeaderboardEntry[] = [];
  for (let i = 0; i < top.length; i++) {
    const item = top[i];
    const prev = i > 0 ? top[i - 1] : null;
    const sameVal = prev !== null && Math.abs(item.val - prev.val) < 1e-6;
    const rank = sameVal ? result[i - 1].rank : i + 1;

    result.push({
      rank,
      playerId: item.player.id,
      playerName: item.player.name,
      teamId: item.player.teamId,
      value: item.val,
      displayValue: item.display,
      qualified: item.qualified,
      isMinimumOnly: item.isMin,
      isSynthetic: Boolean((item.player.stats as BatterStats).isSynthetic),
      note: item.note,
    });
  }

  return result;
}

export interface SeasonStatReconciliationReport {
  valid: boolean;
  season: number;
  teamRunsTotal: number;
  playerRunsTotal: number;
  teamWinsTotal: number;
  playerWinsTotal: number;
  teamLossesTotal: number;
  playerLossesTotal: number;
  issues: string[];
}

/**
 * 정규시즌 구단 기록 합계(gamesLedger)와 리그 전체 선수 개인 기록 합계(player.stats)의 일치성을 검사한다.
 * (1군·2군·포스트시즌 기록이 분리 관리되는지 및 이적 포함 리그 전체 합계 일치를 검증)
 */
export function verifySeasonTeamPlayerReconciliation(
  career: CareerSave
): SeasonStatReconciliationReport {
  const regGames = career.gamesLedger.filter((g) => !g.isPostseason && g.boxscore !== null);
  let teamRunsTotal = 0;
  let teamWinsTotal = 0;
  let teamLossesTotal = 0;

  for (const g of regGames) {
    teamRunsTotal += g.awayRuns + g.homeRuns;
    if (!g.isDraw) {
      teamWinsTotal += 1;
      teamLossesTotal += 1;
    }
  }

  let playerRunsTotal = 0;
  let playerWinsTotal = 0;
  let playerLossesTotal = 0;

  for (const p of Object.values(career.players)) {
    if (p.role === '타자') {
      const b = p.stats as BatterStats;
      playerRunsTotal += b.R ?? 0;
    } else {
      const pt = p.stats as PitcherStats;
      playerWinsTotal += pt.W ?? 0;
      playerLossesTotal += pt.L ?? 0;
    }
  }

  const issues: string[] = [];
  if (regGames.length > 0 && career.gamesLedger.filter((g) => !g.isPostseason).every((g) => g.boxscore !== null)) {
    if (Math.abs(teamRunsTotal - playerRunsTotal) > 0) {
      issues.push(`정규시즌 구단 득점 합계(${teamRunsTotal})와 개인 득점 합계(${playerRunsTotal}) 불일치`);
    }
    if (Math.abs(teamWinsTotal - playerWinsTotal) > 0) {
      issues.push(`정규시즌 구단 승수 합계(${teamWinsTotal})와 투수 개인 승수 합계(${playerWinsTotal}) 불일치`);
    }
    if (Math.abs(teamLossesTotal - playerLossesTotal) > 0) {
      issues.push(`정규시즌 구단 패수 합계(${teamLossesTotal})와 투수 개인 패수 합계(${playerLossesTotal}) 불일치`);
    }
  }

  return {
    valid: issues.length === 0,
    season: career.season,
    teamRunsTotal,
    playerRunsTotal,
    teamWinsTotal,
    playerWinsTotal,
    teamLossesTotal,
    playerLossesTotal,
    issues,
  };
}
