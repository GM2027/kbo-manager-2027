import { KBO_TEAMS } from '../data/kboTeams';
import {
  CareerSave,
  GameRecord,
  Player,
  RivalryRecord,
  RivalryTier,
  TeamId,
} from '../types/kbo';

interface RivalrySeed {
  teamA: TeamId;
  teamB: TeamId;
  name: string;
  subtitle: string;
  baseIntensity: number;
}

export const INITIAL_KBO_RIVALRIES: RivalrySeed[] = [
  {
    teamA: 'LG',
    teamB: '두산',
    name: '잠실 더비',
    subtitle: '잠실구장 한 지붕 두 가족 · KBO 최고 흥행 라이벌리',
    baseIntensity: 94,
  },
  {
    teamA: '삼성',
    teamB: '롯데',
    name: '클래식 시리즈',
    subtitle: '1982 원년 영남 명문 구단 간의 자존심 대결',
    baseIntensity: 90,
  },
  {
    teamA: 'KIA',
    teamB: '삼성',
    name: '달빛 시리즈',
    subtitle: '광주·대구 영호남 최다 우승 명문 라이벌 매치',
    baseIntensity: 88,
  },
  {
    teamA: '한화',
    teamB: 'LG',
    name: '한국시리즈 리턴매치',
    subtitle: '직전 가을야구 격돌에서 이어진 정상 탈환 승부',
    baseIntensity: 86,
  },
  {
    teamA: 'NC',
    teamB: '롯데',
    name: '낙동강 더비',
    subtitle: '부산·창원 경남권 팬덤의 자존심이 충돌하는 지역 더비',
    baseIntensity: 85,
  },
  {
    teamA: 'SSG',
    teamB: '롯데',
    name: '유통 라이벌전',
    subtitle: '인천·부산 유통 그룹사 간 흥행 총력전',
    baseIntensity: 83,
  },
  {
    teamA: 'LG',
    teamB: '키움',
    name: '엘키라시코',
    subtitle: '잠실·고척 서울 연고와 포스트시즌 악연이 얽힌 맞대결',
    baseIntensity: 81,
  },
  {
    teamA: 'KIA',
    teamB: 'LG',
    name: '호랑이·쌍둥이 클래식',
    subtitle: '전국구 팬덤을 거느린 두 인기 구단의 흥행 빅매치',
    baseIntensity: 80,
  },
  {
    teamA: 'SSG',
    teamB: '키움',
    name: '가을야구 인연 매치',
    subtitle: '한국시리즈 명승부에서 비롯된 치열한 승부욕',
    baseIntensity: 77,
  },
  {
    teamA: 'KT',
    teamB: 'SSG',
    name: '수도권 서해안 더비',
    subtitle: '수원·인천 수도권 인접 구단의 순위 쟁탈전',
    baseIntensity: 76,
  },
  {
    teamA: '한화',
    teamB: 'KIA',
    name: '충청·호남 화력전',
    subtitle: '대전·광주 뜨거운 팬심과 타격전이 어우러지는 매치업',
    baseIntensity: 76,
  },
  {
    teamA: 'KT',
    teamB: 'LG',
    name: '수도권 강호 매치',
    subtitle: '최근 포스트시즌에서 거듭 격돌한 수도권 상위권 라이벌',
    baseIntensity: 75,
  },
  {
    teamA: '두산',
    teamB: '키움',
    name: '서울 잠실·고척 더비',
    subtitle: '서울권 팬덤과 젊은 전력이 맞부딪히는 도시 더비',
    baseIntensity: 74,
  },
  {
    teamA: '한화',
    teamB: '두산',
    name: '독수리·곰 대전',
    subtitle: '중부권·수도권 전통 구단 간의 끈질긴 투타 승부',
    baseIntensity: 73,
  },
  {
    teamA: '삼성',
    teamB: 'NC',
    name: '영남 내륙 더비',
    subtitle: '대구·창원 영남권 패권을 다투는 자존심 대결',
    baseIntensity: 72,
  },
  {
    teamA: 'NC',
    teamB: 'KIA',
    name: '남부 강타선 매치',
    subtitle: '호남·경남 남부권 구단 간의 장타력 대결',
    baseIntensity: 71,
  },
  {
    teamA: 'KT',
    teamB: '삼성',
    name: '수원·대구 명승부 매치',
    subtitle: '타이브레이커·가을야구 접전으로 달아오른 경쟁 구도',
    baseIntensity: 72,
  },
];

export interface RivalryEffectProfile {
  rivalry: RivalryRecord;
  tier: RivalryTier;
  tierLabel: string;
  /** 타격·투구 기본 투지 보너스 (0..+3.2) */
  spiritPowerBonus: number;
  /** 홈팀 추가 투지 보정 */
  homeSpiritBonus: number;
  /** 원정팀·열세팀 설욕 의지 보정 */
  underdogGritBonus: number;
  /** 라이벌전 혈투로 인한 경기당 추가 피로도 */
  extraFatigue: number;
  /** 홈 관중 동원 배수 (1.10 ~ 1.24) */
  attendanceMult: number;
  /** 유니폼·MD 판매량 배수 (1.10 ~ 1.28) */
  merchMult: number;
  /** 팬 여론 변동 증폭 계수 */
  sentimentMult: number;
  /** 라이벌전 승리 시 선수 컨디션(+1) 추가 발동 확률 */
  winnerFormBoostProb: number;
  summaryText: string;
}

export function makeRivalryId(a: TeamId, b: TeamId): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `riv-${x}-${y}`;
}

export function getRivalryTier(intensity: number): RivalryTier {
  if (intensity >= 90) return '숙적';
  if (intensity >= 75) return '격돌';
  return '경쟁';
}

export function getRivalryTierLabel(tier: RivalryTier): string {
  if (tier === '숙적') return '숙적 더비';
  if (tier === '격돌') return '격돌 라이벌';
  return '경쟁 구도';
}

export function buildInitialRivalries(): RivalryRecord[] {
  return INITIAL_KBO_RIVALRIES.map((seed) => ({
    id: makeRivalryId(seed.teamA, seed.teamB),
    teamA: seed.teamA,
    teamB: seed.teamB,
    name: seed.name,
    subtitle: seed.subtitle,
    intensity: seed.baseIntensity,
    isDynamic: false,
    userFocused: false,
    seasonWinsA: 0,
    seasonWinsB: 0,
    seasonDraws: 0,
    allTimeWinsA: 0,
    allTimeWinsB: 0,
    allTimeDraws: 0,
  }));
}

/**
 * 구 세이브 호환 포함: career.rivalries가 없거나 누락된 기본 라이벌리가 있으면 안전하게 초기화하고
 * 이미 진행된 gamesLedger 경기 기록에서 시즌 상대전적을 동기화합니다.
 */
export function ensureRivalryState(career: CareerSave): RivalryRecord[] {
  if (!career.rivalries || career.rivalries.length === 0) {
    const seeded = buildInitialRivalries();
    // Backfill season head-to-head from existing gamesLedger if any
    for (const g of career.gamesLedger ?? []) {
      const hit = seeded.find(
        (r) =>
          (r.teamA === g.awayTeam && r.teamB === g.homeTeam) ||
          (r.teamA === g.homeTeam && r.teamB === g.awayTeam)
      );
      if (!hit) continue;
      if (g.isDraw) {
        hit.seasonDraws += 1;
        hit.allTimeDraws += 1;
      } else if (g.winner === hit.teamA) {
        hit.seasonWinsA += 1;
        hit.allTimeWinsA += 1;
      } else if (g.winner === hit.teamB) {
        hit.seasonWinsB += 1;
        hit.allTimeWinsB += 1;
      }
      hit.lastMeetingDate = g.date;
    }
    career.rivalries = seeded;
  }
  return career.rivalries;
}

export function findRivalryBetween(
  career: CareerSave,
  a: TeamId,
  b: TeamId
): RivalryRecord | null {
  if (a === b) return null;
  const list = ensureRivalryState(career);
  return (
    list.find(
      (r) => (r.teamA === a && r.teamB === b) || (r.teamA === b && r.teamB === a)
    ) ?? null
  );
}

export function getTeamRivalries(career: CareerSave, teamId: TeamId): RivalryRecord[] {
  const list = ensureRivalryState(career);
  return list
    .filter((r) => r.teamA === teamId || r.teamB === teamId)
    .sort((a, b) => (b.userFocused ? 1 : 0) - (a.userFocused ? 1 : 0) || b.intensity - a.intensity);
}

export function getRivalryOpponent(rivalry: RivalryRecord, teamId: TeamId): TeamId {
  return rivalry.teamA === teamId ? rivalry.teamB : rivalry.teamA;
}

export function getRivalryRecordForTeam(
  rivalry: RivalryRecord,
  teamId: TeamId
): {
  seasonWins: number;
  seasonLosses: number;
  seasonDraws: number;
  allTimeWins: number;
  allTimeLosses: number;
  allTimeDraws: number;
} {
  const isA = rivalry.teamA === teamId;
  return {
    seasonWins: isA ? rivalry.seasonWinsA : rivalry.seasonWinsB,
    seasonLosses: isA ? rivalry.seasonWinsB : rivalry.seasonWinsA,
    seasonDraws: rivalry.seasonDraws,
    allTimeWins: isA ? rivalry.allTimeWinsA : rivalry.allTimeWinsB,
    allTimeLosses: isA ? rivalry.allTimeWinsB : rivalry.allTimeWinsA,
    allTimeDraws: rivalry.allTimeDraws,
  };
}

/**
 * 라이벌전 경기 내·외적 효과 프로파일 계산
 */
export function getRivalryEffectProfile(
  career: CareerSave,
  awayTeam: TeamId,
  homeTeam: TeamId
): RivalryEffectProfile | null {
  const rivalry = findRivalryBetween(career, awayTeam, homeTeam);
  if (!rivalry) return null;

  const effIntensity = Math.min(100, rivalry.intensity + (rivalry.userFocused ? 6 : 0));
  const tier = getRivalryTier(effIntensity);
  const tierLabel = getRivalryTierLabel(tier);

  const spiritPowerBonus =
    tier === '숙적' ? 2.6 : tier === '격돌' ? 1.9 : 1.25;
  const homeSpiritBonus =
    tier === '숙적' ? 0.85 : tier === '격돌' ? 0.55 : 0.35;
  const underdogGritBonus =
    tier === '숙적' ? 0.9 : tier === '격돌' ? 0.6 : 0.4;
  const extraFatigue =
    tier === '숙적' ? 5 : tier === '격돌' ? 4 : 3;
  const attendanceMult =
    tier === '숙적' ? 1.24 : tier === '격돌' ? 1.16 : 1.1;
  const merchMult =
    tier === '숙적' ? 1.28 : tier === '격돌' ? 1.18 : 1.1;
  const sentimentMult =
    tier === '숙적' ? 1.8 : tier === '격돌' ? 1.5 : 1.2;
  const winnerFormBoostProb =
    tier === '숙적' ? 0.42 : tier === '격돌' ? 0.3 : 0.22;

  const attPct = Math.round((attendanceMult - 1) * 100);
  const merchPct = Math.round((merchMult - 1) * 100);
  const summaryText = `투지 +${spiritPowerBonus.toFixed(1)} · 관중 +${attPct}% · MD +${merchPct}% · 혈투 피로 +${extraFatigue}`;

  return {
    rivalry,
    tier,
    tierLabel,
    spiritPowerBonus,
    homeSpiritBonus,
    underdogGritBonus,
    extraFatigue,
    attendanceMult,
    merchMult,
    sentimentMult,
    winnerFormBoostProb,
    summaryText,
  };
}

/**
 * 개별 선수의 라이벌전 투지 보정치 (큰경기강세·클러치히터·멘탈에이스·분위기메이커·주장 가산)
 */
export function computePlayerRivalrySpiritBonus(
  career: CareerSave,
  player: Player,
  profile: RivalryEffectProfile,
  isHome: boolean
): number {
  let bonus = profile.spiritPowerBonus;
  if (isHome) bonus += profile.homeSpiritBonus;

  const isCaptain = career.teams[player.teamId]?.leadership?.captainPlayerId === player.id;
  if (isCaptain) bonus += 0.9;

  if (
    player.hiddenTrait === '큰경기강세' ||
    player.hiddenTrait === '클러치히터' ||
    player.hiddenTrait === '멘탈에이스'
  ) {
    bonus += 1.3;
  } else if (player.hiddenTrait === '분위기메이커') {
    bonus += 0.7;
  }

  // 상대전적에서 열세인 팀은 설욕 의지로 투지 소폭 추가
  const rec = getRivalryRecordForTeam(profile.rivalry, player.teamId);
  if (rec.seasonLosses > rec.seasonWins) {
    bonus += profile.underdogGritBonus;
  }

  return Number(bonus.toFixed(2));
}

/**
 * 경기 종료 후 라이벌 상대전적 누적 및 동적 열기(Intensity) 상승,
 * 포스트시즌 맞대결 시 신규 라이벌 관계 자동 생성 처리
 */
export function recordGameRivalryOutcome(
  career: CareerSave,
  game: GameRecord
): { rivalry: RivalryRecord | null; intensityDelta: number; newlyCreated: boolean } {
  const list = ensureRivalryState(career);
  let rivalry =
    list.find(
      (r) =>
        (r.teamA === game.awayTeam && r.teamB === game.homeTeam) ||
        (r.teamA === game.homeTeam && r.teamB === game.awayTeam)
    ) ?? null;

  let newlyCreated = false;

  // 포스트시즌에서 맞붙은 비라이벌 구단은 자동으로 신흥 라이벌 관계 형성
  if (!rivalry && game.isPostseason) {
    const teamA = game.homeTeam;
    const teamB = game.awayTeam;
    const isKs = game.postseasonRound === 'KOREAN_SERIES';
    rivalry = {
      id: makeRivalryId(teamA, teamB),
      teamA,
      teamB,
      name: isKs
        ? `${career.season} 한국시리즈 숙적전`
        : `${career.season} 가을야구 라이벌전`,
      subtitle: `${career.season} 포스트시즌 격돌로 탄생한 신흥 라이벌 관계`,
      intensity: isKs ? 84 : 74,
      isDynamic: true,
      userFocused: false,
      seasonWinsA: 0,
      seasonWinsB: 0,
      seasonDraws: 0,
      allTimeWinsA: 0,
      allTimeWinsB: 0,
      allTimeDraws: 0,
    };
    list.push(rivalry);
    newlyCreated = true;
  }

  if (!rivalry) {
    return { rivalry: null, intensityDelta: 0, newlyCreated: false };
  }

  if (game.isDraw) {
    rivalry.seasonDraws += 1;
    rivalry.allTimeDraws += 1;
  } else if (game.winner === rivalry.teamA) {
    rivalry.seasonWinsA += 1;
    rivalry.allTimeWinsA += 1;
  } else if (game.winner === rivalry.teamB) {
    rivalry.seasonWinsB += 1;
    rivalry.allTimeWinsB += 1;
  }

  const runDiff = Math.abs(game.awayRuns - game.homeRuns);
  let delta = 0;
  if (game.isPostseason) delta += 3;
  if (game.extraInnings && game.extraInnings > 9) delta += 2;
  else if (runDiff <= 1) delta += 1;

  if (delta > 0) {
    rivalry.intensity = Math.min(100, rivalry.intensity + delta);
  }

  rivalry.lastMeetingDate = game.date;
  rivalry.lastMeetingNote = game.isDraw
    ? `${game.awayTeam} ${game.awayRuns}:${game.homeRuns} ${game.homeTeam} 무승부${
        game.extraInnings ? ` (연장 ${game.extraInnings}회)` : ''
      }`
    : `${KBO_TEAMS[game.winner as TeamId].shortName} ${Math.max(game.awayRuns, game.homeRuns)}:${Math.min(
        game.awayRuns,
        game.homeRuns
      )} 승${game.extraInnings ? ` (연장 ${game.extraInnings}회)` : ''}`;

  return { rivalry, intensityDelta: delta, newlyCreated };
}

/**
 * 3연전 스윕 시 라이벌 열기 추가 가열 (+3)
 */
export function escalateRivalryOnSeriesSweep(
  career: CareerSave,
  teamA: TeamId,
  teamB: TeamId,
  winnerTeam: TeamId,
  dateStr: string
): RivalryRecord | null {
  const rivalry = findRivalryBetween(career, teamA, teamB);
  if (!rivalry) return null;
  rivalry.intensity = Math.min(100, rivalry.intensity + 3);
  rivalry.lastMeetingDate = dateStr;
  rivalry.lastMeetingNote = `${KBO_TEAMS[winnerTeam].shortName} 3연전 스윕 (열기 +3 상승)`;
  return rivalry;
}

/**
 * 차기 시즌 전환 시 시즌 상대전적은 초기화하되 통산 전적과 라이벌 열기(소폭 자연 진정)는 보존합니다.
 */
export function resetRivalriesForNewSeason(career: CareerSave): void {
  const list = ensureRivalryState(career);
  for (const r of list) {
    r.seasonWinsA = 0;
    r.seasonWinsB = 0;
    r.seasonDraws = 0;
    // 비시즌 동안 과열된 라이벌리는 1~2포인트만 자연 진정 (기본 하한 65 유지)
    if (r.intensity > 85) {
      r.intensity = Math.max(65, r.intensity - 2);
    }
  }
}

/**
 * 사용자가 우리 구단의 중점 숙적 라이벌을 지정하거나 해제합니다.
 * 기존 라이벌리가 없는 상대 구단도 '단장 지정 라이벌'로 신규 등록할 수 있습니다.
 */
export function toggleUserFocusRivalry(
  career: CareerSave,
  targetTeamId: TeamId
): { nextCareer: CareerSave; message: string; active: boolean } {
  if (targetTeamId === career.playerTeamId) {
    throw new Error('우리 구단을 라이벌로 지정할 수 없습니다.');
  }
  const next: CareerSave = structuredClone(career);
  const list = ensureRivalryState(next);
  const myTeam = next.playerTeamId;

  let hit = list.find(
    (r) => (r.teamA === myTeam && r.teamB === targetTeamId) || (r.teamA === targetTeamId && r.teamB === myTeam)
  );

  if (hit && hit.userFocused) {
    hit.userFocused = false;
    next.updatedAt = new Date().toISOString();
    return {
      nextCareer: next,
      message: `${KBO_TEAMS[targetTeamId].shortName}와의 [${hit.name}] 중점 라이벌 지정을 해제했습니다.`,
      active: false,
    };
  }

  // 기존 중점 지정 해제 (우리 구단 기준 최대 1개 중점 숙적 유지)
  for (const r of list) {
    if (r.teamA === myTeam || r.teamB === myTeam) {
      r.userFocused = false;
    }
  }

  if (!hit) {
    hit = {
      id: makeRivalryId(myTeam, targetTeamId),
      teamA: myTeam,
      teamB: targetTeamId,
      name: `${KBO_TEAMS[myTeam].shortName}·${KBO_TEAMS[targetTeamId].shortName} 숙적 매치`,
      subtitle: `${next.season} 시즌 단장실 집중 견제 라이벌로 공식 지정`,
      intensity: 76,
      isDynamic: true,
      userFocused: true,
      seasonWinsA: 0,
      seasonWinsB: 0,
      seasonDraws: 0,
      allTimeWinsA: 0,
      allTimeWinsB: 0,
      allTimeDraws: 0,
    };
    list.push(hit);
  } else {
    hit.userFocused = true;
    hit.intensity = Math.min(100, hit.intensity + 4);
  }

  if (!next.newsFeed) next.newsFeed = [];
  next.newsFeed.unshift({
    id: `news-rivalry-focus-${Date.now()}`,
    date:
      next.phase === 'OFFSEASON'
        ? `${next.season}-11-15`
        : next.schedule[next.currentSeriesIndex]?.dates?.[0] ?? `${next.season}-04-01`,
    season: next.season,
    category: '구단사건',
    headline: `[라이벌 선포] ${KBO_TEAMS[myTeam].shortName}, ${KBO_TEAMS[targetTeamId].shortName}을 시즌 중점 숙적 라이벌로 지목`,
    body: `${KBO_TEAMS[myTeam].name} 단장실이 ${KBO_TEAMS[targetTeamId].name}과의 [${hit.name}]을 시즌 핵심 라이벌전으로 지정했습니다. 맞대결 시 선수단 투지와 홈 구장 흥행 열기가 한층 고조됩니다.`,
    teamId: myTeam,
    isHighlight: true,
  });

  next.updatedAt = new Date().toISOString();
  return {
    nextCareer: next,
    message: `${KBO_TEAMS[targetTeamId].shortName}과의 [${hit.name}]을 시즌 중점 라이벌로 지정했습니다 (열기 ${hit.intensity}).`,
    active: true,
  };
}
