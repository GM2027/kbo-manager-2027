import { KBO_TEAMS } from '../data/kboTeams';
import {
  CareerSave,
  LeagueAcquisitionCategory,
  LeagueAcquisitionRecord,
  Position,
  TeamId,
} from '../types/kbo';

export const LEAGUE_ACQUISITION_CATEGORIES: LeagueAcquisitionCategory[] = [
  'FA',
  '트레이드',
  '외국인·아시아쿼터',
  '신인',
  '방출선수 영입',
];

export interface RecordAcquisitionInput {
  dedupeKey: string;
  season: number;
  date: string;
  category: LeagueAcquisitionCategory;
  playerId?: string;
  playerName: string;
  position?: Position;
  previousTeamLabel: string;
  acquiringTeamId: TeamId;
  contractAmountLabel: string;
  note?: string;
}

/**
 * 확정된 영입만 '전체 구단 영입 현황'에 기록 (dedupeKey 기반 중복 절대 방지)
 * - 타 구단 영입 확정 시 간단한 리그 뉴스 알림 발행
 */
export function recordLeagueAcquisitionInPlace(
  career: CareerSave,
  input: RecordAcquisitionInput,
  options?: { pushNewsAlert?: boolean }
): LeagueAcquisitionRecord | null {
  if (!career.leagueAcquisitions) {
    career.leagueAcquisitions = [];
  }
  const cleanKey = input.dedupeKey.trim();
  if (!cleanKey) return null;

  const exists = career.leagueAcquisitions.some((r) => r.dedupeKey === cleanKey);
  if (exists) return null;

  const rec: LeagueAcquisitionRecord = {
    id: `acq-${input.season}-${career.leagueAcquisitions.length + 1}-${Math.abs(hashText(cleanKey))}`,
    dedupeKey: cleanKey,
    season: input.season,
    date: input.date,
    category: input.category,
    playerId: input.playerId,
    playerName: input.playerName,
    position: input.position,
    previousTeamLabel: input.previousTeamLabel,
    acquiringTeamId: input.acquiringTeamId,
    contractAmountLabel: input.contractAmountLabel,
    note: input.note,
  };

  career.leagueAcquisitions.unshift(rec);
  if (career.leagueAcquisitions.length > 600) {
    career.leagueAcquisitions = career.leagueAcquisitions.slice(0, 600);
  }

  // 타 구단 영입 확정 시 간단한 리그 뉴스 알림 (동일 dedupeKey 중복 뉴스 방지)
  const shouldAlert =
    options?.pushNewsAlert !== false &&
    input.acquiringTeamId !== career.playerTeamId;

  if (shouldAlert) {
    if (!career.newsFeed) career.newsFeed = [];
    const teamShort = KBO_TEAMS[input.acquiringTeamId]?.shortName ?? input.acquiringTeamId;
    const headline = `[구단 영입 · ${input.category}] ${teamShort}, ${input.playerName} 영입 (${input.contractAmountLabel})`;
    const alreadyInNews = career.newsFeed.some((n) => n.headline === headline && n.date === input.date);
    if (!alreadyInNews) {
      career.newsFeed.unshift({
        id: `news-acq-${cleanKey}`,
        season:
          career.phase === 'OFFSEASON'
            ? Math.max(input.season, career.season + 1)
            : input.season,
        date: input.date,
        category: '이적·계약',
        headline,
        body: `${teamShort} 구단이 ${input.previousTeamLabel} 출신 ${input.playerName}${input.position ? `(${input.position})` : ''} 선수를 ${input.category} 형태로 영입 확정했습니다. (${input.contractAmountLabel})`,
        teamId: input.acquiringTeamId,
      });
      if (career.newsFeed.length > 220) {
        career.newsFeed = career.newsFeed.slice(0, 220);
      }
    }
  }

  return rec;
}

function hashText(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

/**
 * 기존 세이브 호환: leagueAcquisitions 배열을 보장하고 기존 확정 드래프트 지명 등을 중복 없이 보강
 */
export function ensureLeagueAcquisitionsInPlace(career: CareerSave): void {
  if (!career.leagueAcquisitions) {
    career.leagueAcquisitions = [];
  }

  // 이미 확정 완료된 드래프트 지명 결과가 있으면 중복 없이 동기화
  if (career.draftState && Array.isArray(career.draftState.picks)) {
    const draftSeason = career.draftState.season;
    const draftDate = `${draftSeason}-09-17`;
    for (const pick of career.draftState.picks) {
      if (!pick.candidateId || !pick.playerName || !pick.teamId) continue;
      const cand = career.draftState.candidates?.find((c) => c.id === pick.candidateId);
      const overallPick = (pick.round - 1) * 10 + pick.pickInRound;
      const bonus = pick.signingBonusBillion ?? cand?.signingBonusBillion ?? (pick.round === 1 ? 3.0 : pick.round <= 3 ? 1.1 : 0.4);
      recordLeagueAcquisitionInPlace(
        career,
        {
          dedupeKey: `draft-${draftSeason}-${overallPick}-${pick.candidateId}`,
          season: draftSeason,
          date: draftDate,
          category: '신인',
          playerName: pick.playerName,
          position: pick.position ?? cand?.position,
          previousTeamLabel: cand?.school ? `${cand.school} (${cand.originType})` : '신인 드래프트',
          acquiringTeamId: pick.teamId,
          contractAmountLabel: `계약금 ${bonus.toFixed(1)}억`,
          note: `${pick.round}R 전체 ${overallPick}순위 지명`,
        },
        { pushNewsAlert: false }
      );
    }
  }
}

export interface LeagueAcquisitionFilter {
  teamId?: TeamId | 'ALL';
  season?: number | 'ALL';
  category?: LeagueAcquisitionCategory | 'ALL';
  search?: string;
}

export function queryLeagueAcquisitions(
  career: CareerSave,
  filter: LeagueAcquisitionFilter = {}
): LeagueAcquisitionRecord[] {
  const list = career.leagueAcquisitions ?? [];
  const q = (filter.search ?? '').trim().toLowerCase();
  return list.filter((rec) => {
    if (filter.teamId && filter.teamId !== 'ALL' && rec.acquiringTeamId !== filter.teamId) {
      return false;
    }
    if (filter.season && filter.season !== 'ALL' && rec.season !== filter.season) {
      return false;
    }
    if (filter.category && filter.category !== 'ALL' && rec.category !== filter.category) {
      return false;
    }
    if (q) {
      const hay = `${rec.playerName} ${rec.previousTeamLabel} ${KBO_TEAMS[rec.acquiringTeamId]?.name ?? rec.acquiringTeamId} ${rec.contractAmountLabel} ${rec.note ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
