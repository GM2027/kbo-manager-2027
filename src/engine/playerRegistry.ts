import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  CareerSave,
  OverseasPlayerRecord,
  Player,
  PlayerRole,
  Position,
  TeamId,
} from '../types/kbo';
import { calcAVG, calcERA, calcOPS } from './stats';

// =============================================================================
// 1. PERMANENT UNIQUE PLAYER ID REGISTRY & DUPLICATE PREVENTION (#6)
//    - 모든 선수에게 영구 고유 ID(KBO-PL-XXXXXX) 부여
//    - 동명이인(이름 같지만 출생연도·출신교·고유ID 다름)은 정상 공존 허용
//    - 동일 permanentId 또는 완전 동일 신원(이름+출생연도+출신교) 중복 생성은 차단
// =============================================================================

function stableHashCode(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 900000 + 100000;
}

export function allocatePermanentPlayerId(
  career: CareerSave,
  prefix: 'KBO-PL' | 'KBO-AMA' | 'KBO-OVR' = 'KBO-PL'
): string {
  const used = collectAllPermanentIds(career);
  let seq = career.nextPermanentPlayerSeq ?? 1001;
  let candidate = `${prefix}-${String(seq).padStart(6, '0')}`;
  while (used.has(candidate)) {
    seq += 1;
    candidate = `${prefix}-${String(seq).padStart(6, '0')}`;
  }
  career.nextPermanentPlayerSeq = seq + 1;
  return candidate;
}

export function collectAllPermanentIds(career: CareerSave): Set<string> {
  const set = new Set<string>();
  for (const p of Object.values(career.players)) {
    if (p.permanentId) set.add(p.permanentId);
  }
  for (const c of career.draftState?.candidates ?? []) {
    if (c.permanentId) set.add(c.permanentId);
  }
  for (const pr of career.amateurAndOverseas?.prospects ?? []) {
    if (pr.permanentId) set.add(pr.permanentId);
  }
  for (const ov of career.amateurAndOverseas?.overseasPlayers ?? []) {
    if (ov.permanentId) set.add(ov.permanentId);
  }
  return set;
}

/**
 * 기존 세이브의 모든 선수·드래프트 후보에게 충돌 없는 영구 고유 ID(permanentId)와 출생연도(birthYear)를 보장한다.
 * 기존 player.id 키는 변경하지 않아 세이브 호환성을 100% 유지한다.
 */
export function ensureGlobalPlayerRegistryInPlace(career: CareerSave): void {
  const used = new Set<string>();
  let maxSeq = career.nextPermanentPlayerSeq ?? 1000;

  const trackSeq = (pid: string) => {
    used.add(pid);
    const m = pid.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= maxSeq) maxSeq = n + 1;
    }
  };

  for (const p of Object.values(career.players)) {
    if (p.permanentId) trackSeq(p.permanentId);
  }
  for (const ov of career.amateurAndOverseas?.overseasPlayers ?? []) {
    if (ov.permanentId) trackSeq(ov.permanentId);
  }
  for (const pr of career.amateurAndOverseas?.prospects ?? []) {
    if (pr.permanentId) trackSeq(pr.permanentId);
  }

  for (const p of Object.values(career.players)) {
    if (!p.birthYear) {
      p.birthYear = career.season - p.age;
    }
    if (!p.permanentId) {
      let pid = `KBO-PL-${stableHashCode(`${p.id}|${p.name}|${p.birthYear}`)}`;
      while (used.has(pid)) {
        pid = `KBO-PL-${String(maxSeq++).padStart(6, '0')}`;
      }
      p.permanentId = pid;
      used.add(pid);
    }
  }

  for (const c of career.draftState?.candidates ?? []) {
    if (!c.birthYear) {
      c.birthYear = (career.draftState?.season ?? career.season) - c.age;
    }
    if (!c.permanentId) {
      let pid = `KBO-AMA-${stableHashCode(`draft-${career.draftState.season}-${c.id}-${c.name}-${c.school}`)}`;
      while (used.has(pid)) {
        pid = `KBO-AMA-${String(maxSeq++).padStart(6, '0')}`;
      }
      c.permanentId = pid;
      used.add(pid);
    }
  }

  career.nextPermanentPlayerSeq = Math.max(maxSeq, career.nextPermanentPlayerSeq ?? 1001);
}

/**
 * 동일 선수 중복 생성 방지 검사:
 * - permanentId가 이미 존재하면 중복
 * - 이름 + 출생연도(±1년) + 출신교(또는 원소속팀)가 모두 일치하면 중복
 * - 이름만 같고 출생연도/출신교가 다르면 정상 동명이인으로 허용
 */
export function isDuplicatePlayerIdentity(
  career: CareerSave,
  candidate: {
    permanentId?: string;
    name: string;
    birthYear?: number;
    school?: string;
  }
): boolean {
  if (candidate.permanentId) {
    const allIds = collectAllPermanentIds(career);
    if (allIds.has(candidate.permanentId)) return true;
  }
  if (candidate.birthYear && candidate.school) {
    for (const p of Object.values(career.players)) {
      if (
        p.name === candidate.name &&
        p.birthYear === candidate.birthYear &&
        p.rookieInfo?.school === candidate.school
      ) {
        return true;
      }
    }
    for (const pr of career.amateurAndOverseas?.prospects ?? []) {
      if (
        pr.name === candidate.name &&
        pr.birthYear === candidate.birthYear &&
        pr.schoolName === candidate.school
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 동명이인 존재 여부 판별 유틸 (UI에서 출생연도·출신교·고유ID 구분 표시에 사용)
 */
export function getSameNameCounts(career: CareerSave): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of Object.values(career.players)) {
    if (p.rosterTier === '은퇴') continue;
    map.set(p.name, (map.get(p.name) ?? 0) + 1);
  }
  for (const ov of career.amateurAndOverseas?.overseasPlayers ?? []) {
    if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') continue;
    // avoid double counting if linked to active KBO player
    if (ov.sourceKboPlayerId && career.players[ov.sourceKboPlayerId]) continue;
    map.set(ov.name, (map.get(ov.name) ?? 0) + 1);
  }
  return map;
}

// =============================================================================
// 2. LEAGUE-WIDE GLOBAL PLAYER SEARCH (#5)
//    - 전체 10개 KBO 구단 + 상무 피닉스 + 울산 웨일즈 + 해외파 선수 통합 검색
// =============================================================================

export interface GlobalPlayerSearchEntry {
  key: string;
  source: 'KBO' | '상무' | '울산' | '해외파';
  kboPlayerId?: string;
  permanentId: string;
  name: string;
  birthYear: number;
  age: number;
  teamId: TeamId | '상무' | '울산' | '해외';
  teamLabel: string;
  role: PlayerRole;
  position: Position;
  rosterStatus: string;
  uniformNumber?: number;
  ability: number;
  potential: number;
  salaryLabel: string;
  salarySortValue: number;
  statSummary: string;
  schoolOrOrigin: string;
  isNamesake: boolean;
  playerRef?: Player;
  overseasRef?: OverseasPlayerRecord;
}

export interface GlobalPlayerSearchFilter {
  query: string;
  teamFilter: '전체' | TeamId | '상무' | '울산' | '해외파';
  roleFilter: '전체' | PlayerRole;
  positionFilter: '전체' | Position;
  tierFilter: '전체' | '1군' | '2군' | '육성' | '상무복무' | '해외파' | '은퇴';
  sortBy: 'ability' | 'potential' | 'age' | 'salary' | 'name';
}

export function searchAllLeaguePlayers(
  career: CareerSave,
  filter: GlobalPlayerSearchFilter
): GlobalPlayerSearchEntry[] {
  const nameCounts = getSameNameCounts(career);
  const results: GlobalPlayerSearchEntry[] = [];
  const q = filter.query.trim().toLowerCase();

  // 1) All 10 KBO clubs + Sangmu active/retired players in career.players
  for (const p of Object.values(career.players)) {
    const isSangmu = isMilitaryServing(p.militaryStatus);
    const isOverseasExported = p.rosterTier === '해외이적';
    const source: GlobalPlayerSearchEntry['source'] = isSangmu
      ? '상무'
      : isOverseasExported
      ? '해외파'
      : 'KBO';

    if (filter.teamFilter !== '전체') {
      if (filter.teamFilter === '상무' && !isSangmu) continue;
      if (filter.teamFilter === '해외파' && !isOverseasExported) continue;
      if (filter.teamFilter === '울산') continue;
      if (
        filter.teamFilter !== '상무' &&
        filter.teamFilter !== '해외파' &&
        p.teamId !== filter.teamFilter
      ) {
        continue;
      }
    }
    if (filter.roleFilter !== '전체' && p.role !== filter.roleFilter) continue;
    if (filter.positionFilter !== '전체' && p.position !== filter.positionFilter) continue;
    if (filter.tierFilter !== '전체') {
      if (filter.tierFilter === '상무복무' && !isSangmu) continue;
      if (filter.tierFilter === '해외파' && !isOverseasExported) continue;
      if (
        filter.tierFilter !== '상무복무' &&
        filter.tierFilter !== '해외파' &&
        p.rosterTier !== filter.tierFilter
      ) {
        continue;
      }
    } else if (p.rosterTier === '은퇴' && !q) {
      // Hide retired players unless explicitly searched or filtered
      continue;
    }

    const schoolOrOrigin =
      p.rookieInfo?.school ?? p.acquisitionInfo?.label ?? p.previousLeagueClub ?? p.nationality ?? '국내';

    if (q) {
      const hay = `${p.name} ${p.permanentId ?? ''} ${p.teamId} ${KBO_TEAMS[p.teamId]?.name ?? ''} ${p.position} ${p.uniformNumber ?? ''} ${schoolOrOrigin}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    let statSummary = '-';
    if (p.role === '타자') {
      const b = p.stats as import('../types/kbo').BatterStats;
      if ((b.G ?? 0) > 0) {
        const avg = calcAVG(b.H, b.AB);
        const ops = calcOPS(b);
        statSummary = `${b.G}G .${avg !== null ? Math.round(avg * 1000).toString().padStart(3, '0') : '---'} ${b.HR ?? 0}HR ${b.RBI ?? 0}RBI OPS ${ops !== null ? ops.toFixed(3) : '-'}`;
      }
    } else {
      const pt = p.stats as import('../types/kbo').PitcherStats;
      if ((pt.G ?? 0) > 0) {
        const era = calcERA(pt.ER, pt.outs);
        statSummary = `${pt.G}G ${pt.W ?? 0}승 ${pt.L ?? 0}패 ${(pt.SV ?? 0) > 0 ? `${pt.SV}S ` : ''}ERA ${era !== null ? era.toFixed(2) : '-'} ${pt.SO ?? 0}K`;
      }
    }

    const salarySortValue =
      p.contract.currency === 'USD'
        ? (p.contract.annualSalary * 1350) / 100_000_000
        : p.contract.annualSalary ?? 0;
    const salaryLabel =
      p.contract.currency === 'USD'
        ? `$${Math.round(p.contract.annualSalary / 1000)}K`
        : `${(p.contract.annualSalary ?? 0).toFixed(2)}억`;

    results.push({
      key: `kbo-${p.id}`,
      source,
      kboPlayerId: p.id,
      permanentId: p.permanentId ?? p.id,
      name: p.name,
      birthYear: p.birthYear ?? career.season - p.age,
      age: p.age,
      teamId: isSangmu ? '상무' : p.teamId,
      teamLabel: isSangmu
        ? `상무 (원소속 ${KBO_TEAMS[p.teamId].shortName})`
        : KBO_TEAMS[p.teamId]?.shortName ?? p.teamId,
      role: p.role,
      position: p.position,
      rosterStatus: isSangmu ? '상무복무' : p.rosterTier,
      uniformNumber: p.uniformNumber,
      ability: p.ability,
      potential: p.potential,
      salaryLabel,
      salarySortValue,
      statSummary,
      schoolOrOrigin,
      isNamesake: (nameCounts.get(p.name) ?? 0) > 1,
      playerRef: p,
    });
  }

  // 2) Ulsan Whales players
  if (filter.teamFilter === '전체' || filter.teamFilter === '울산') {
    if (filter.tierFilter === '전체' || filter.tierFilter === '2군') {
      for (const up of career.ulsanWhales?.roster ?? []) {
        if (up.transferredToTeamId) continue;
        if (filter.roleFilter !== '전체' && up.role !== filter.roleFilter) continue;
        if (filter.positionFilter !== '전체' && up.position !== filter.positionFilter) continue;
        if (q) {
          const hay = `${up.name} 울산 웨일즈 ${up.position} ${up.previousClub} ${up.nationality}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        results.push({
          key: `ulsan-${up.id}`,
          source: '울산',
          permanentId: `KBO-ULS-${up.id}`,
          name: up.name,
          birthYear: career.season - up.age,
          age: up.age,
          teamId: '울산',
          teamLabel: '울산 웨일즈',
          role: up.role,
          position: up.position,
          rosterStatus: up.isForeign ? '울산 외국인' : '울산 자율선발',
          uniformNumber: up.uniformNumber,
          ability: up.ability,
          potential: up.potential,
          salaryLabel: up.isForeign
            ? `$${Math.round((up.totalCapUsd ?? 80000) / 1000)}K`
            : `${up.salaryKrwBillion.toFixed(2)}억`,
          salarySortValue: up.salaryKrwBillion,
          statSummary: up.scoutingNote,
          schoolOrOrigin: up.previousClub,
          isNamesake: (nameCounts.get(up.name) ?? 0) > 1,
        });
      }
    }
  }

  // 3) Overseas Korean players (MLB / MiLB / NPB)
  if (filter.teamFilter === '전체' || filter.teamFilter === '해외파') {
    if (filter.tierFilter === '전체' || filter.tierFilter === '해외파') {
      for (const ov of career.amateurAndOverseas?.overseasPlayers ?? []) {
        if (ov.status === 'KBO복귀완료') continue;
        if (ov.status === '은퇴' && !q) continue;
        if (filter.roleFilter !== '전체' && ov.role !== filter.roleFilter) continue;
        if (filter.positionFilter !== '전체' && ov.position !== filter.positionFilter) continue;
        if (q) {
          const hay = `${ov.name} ${ov.permanentId} ${ov.clubName} ${ov.league} ${ov.position} ${ov.originCategory}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        const st = ov.currentSeasonStats;
        const statSummary =
          ov.role === '타자'
            ? `${st.g}G AVG ${(st.avg ?? 0).toFixed(3)} ${st.hr ?? 0}HR ${st.rbi ?? 0}RBI OPS ${(st.ops ?? 0).toFixed(3)}`
            : `${st.g}G ${st.w ?? 0}승 ${st.l ?? 0}패 ERA ${(st.era ?? 0).toFixed(2)} ${(st.ip ?? 0).toFixed(1)}IP ${st.so ?? 0}K`;
        results.push({
          key: `ovr-${ov.permanentId}`,
          source: '해외파',
          permanentId: ov.permanentId,
          name: ov.name,
          birthYear: ov.birthYear,
          age: ov.age,
          teamId: '해외',
          teamLabel: `${ov.clubName} (${ov.league})`,
          role: ov.role,
          position: ov.position,
          rosterStatus: `${ov.league} · ${ov.status}`,
          ability: ov.ability,
          potential: ov.potential,
          salaryLabel: `$${ov.annualSalaryUsdThousands.toLocaleString()}K`,
          salarySortValue: (ov.annualSalaryUsdThousands * 1000 * 1350) / 100_000_000,
          statSummary,
          schoolOrOrigin: ov.originCategory,
          isNamesake: (nameCounts.get(ov.name) ?? 0) > 1,
          overseasRef: ov,
        });
      }
    }
  }

  results.sort((a, b) => {
    if (filter.sortBy === 'ability') return b.ability - a.ability || b.potential - a.potential;
    if (filter.sortBy === 'potential') return b.potential - a.potential || b.ability - a.ability;
    if (filter.sortBy === 'age') return a.age - b.age || b.ability - a.ability;
    if (filter.sortBy === 'salary') return b.salarySortValue - a.salarySortValue;
    return a.name.localeCompare(b.name, 'ko');
  });

  return results;
}
