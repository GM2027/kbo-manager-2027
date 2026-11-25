import { createPreservedHanwhaCareer } from '../data/masterImport';
import { sanitizePlayerAgeAndServiceYearsInPlace } from '../data/playerMetadata';
import { sanitizeCareerOvrPotInPlace } from '../data/v18Importer';
import { ensureBenchCoachesInPlace } from '../data/coachesData';
import { ensureAmateurAndOverseasStateInPlace } from '../engine/amateurOverseasEngine';
import { ensureLeagueAcquisitionsInPlace } from '../engine/leagueAcquisitionsEngine';
import { ensureGlobalPlayerRegistryInPlace } from '../engine/playerRegistry';
import { migrateAndValidateCareerSave } from '../engine/salaryCapEngine';
import { computeStandings } from '../engine/stats';
import { AppSettings, CareerSave, GamePhase, TeamId } from '../types/kbo';

const CAREERS_KEY = 'kbo_gm_2026_careers_v1';
const BACKUPS_KEY = 'kbo_gm_2026_backups_v1';
const SETTINGS_KEY = 'kbo_gm_2026_settings_v1';
const LAST_PLAYED_KEY = 'kbo_gm_2026_last_played_v1';

export interface CareerSummaryItem {
  careerId: string;
  label: string;
  gmName: string;
  playerTeamId: TeamId;
  season: number;
  phase: GamePhase;
  rank: number | null;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  totalRegularGames: number;
  cashBalanceBillion: number | null;
  version: string;
  updatedAt: string;
  isPreservedMaster: boolean;
  isArchived: boolean;
  isLastPlayed?: boolean;
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Attempt quota recovery by pruning older rolling backups first
    try {
      const backups = safeReadJson<Record<string, CareerSave[]>>(BACKUPS_KEY, {});
      for (const cid of Object.keys(backups)) {
        backups[cid] = (backups[cid] ?? []).slice(0, 2);
      }
      localStorage.setItem(BACKUPS_KEY, JSON.stringify(backups));
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

export function getLastPlayedCareerId(): string | null {
  try {
    return localStorage.getItem(LAST_PLAYED_KEY);
  } catch {
    return null;
  }
}

export function setLastPlayedCareerId(careerId: string): void {
  try {
    localStorage.setItem(LAST_PLAYED_KEY, careerId);
  } catch {
    // ignore storage restriction
  }
}

export function loadSettings(): AppSettings {
  return safeReadJson<AppSettings>(SETTINGS_KEY, {
    theme: 'dark',
    showDetailedColumnsByDefault: false,
  });
}

export function saveSettings(settings: AppSettings): void {
  safeWriteJson(SETTINGS_KEY, settings);
}

export function loadAllSavedCareers(): Record<string, CareerSave> {
  return safeReadJson<Record<string, CareerSave>>(CAREERS_KEY, {});
}

export function loadCareerById(careerId: string): CareerSave | null {
  if (careerId === 'career_hanwha_v46030_master') {
    const master = createPreservedHanwhaCareer();
    const migrated = migrateAndValidateCareerSave(master, { mutateInPlace: true }).career;
    ensureGlobalPlayerRegistryInPlace(migrated);
    ensureAmateurAndOverseasStateInPlace(migrated);
    ensureBenchCoachesInPlace(migrated);
    ensureLeagueAcquisitionsInPlace(migrated);
    sanitizePlayerAgeAndServiceYearsInPlace(migrated.players, migrated.season);
    sanitizeCareerOvrPotInPlace(migrated);
    return migrated;
  }
  const map = loadAllSavedCareers();
  const loaded = map[careerId] ?? null;
  if (!loaded) return null;
  const migrated = migrateAndValidateCareerSave(loaded).career;
  ensureGlobalPlayerRegistryInPlace(migrated);
  ensureAmateurAndOverseasStateInPlace(migrated);
  ensureBenchCoachesInPlace(migrated);
  ensureLeagueAcquisitionsInPlace(migrated);
  sanitizePlayerAgeAndServiceYearsInPlace(migrated.players, migrated.season);
  sanitizeCareerOvrPotInPlace(migrated);
  return migrated;
}

export function saveCareer(career: CareerSave, backupSnapshot?: CareerSave): boolean {
  const map = loadAllSavedCareers();
  const stamped: CareerSave = {
    ...career,
    updatedAt: new Date().toISOString(),
  };
  map[stamped.careerId] = stamped;
  const ok = safeWriteJson(CAREERS_KEY, map);
  if (ok) {
    setLastPlayedCareerId(stamped.careerId);
  }

  if (backupSnapshot) {
    const backups = safeReadJson<Record<string, CareerSave[]>>(BACKUPS_KEY, {});
    const arr = backups[stamped.careerId] ?? [];
    arr.unshift(backupSnapshot);
    backups[stamped.careerId] = arr.slice(0, 5); // Keep up to 5 rolling backups per careerId
    safeWriteJson(BACKUPS_KEY, backups);
  }
  return ok;
}

/**
 * 현재 진행 중인 커리어를 새 슬롯(다른 이름)으로 안전하게 복제 저장합니다.
 */
export function saveCareerAsNewSlot(career: CareerSave, customLabel: string): CareerSave {
  const trimmed = customLabel.trim() || `${career.playerTeamId} ${career.season}시즌 세이브`;
  const cloned: CareerSave = {
    ...(JSON.parse(JSON.stringify(career)) as CareerSave),
    careerId: `career_slot_${career.playerTeamId}_${Date.now()}`,
    label: trimmed,
    isArchived: false,
    updatedAt: new Date().toISOString(),
  };
  saveCareer(cloned);
  return cloned;
}

export function renameSavedCareer(careerId: string, newLabel: string): boolean {
  const trimmed = newLabel.trim();
  if (!trimmed) return false;
  const map = loadAllSavedCareers();
  const target = map[careerId];
  if (!target) return false;
  map[careerId] = { ...target, label: trimmed, updatedAt: new Date().toISOString() };
  return safeWriteJson(CAREERS_KEY, map);
}

export function archiveExistingCareersBeforeNewGame(): void {
  const map = loadAllSavedCareers();
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!map[id].isArchived) {
      map[id] = { ...map[id], isArchived: true };
      changed = true;
    }
  }
  if (changed) {
    safeWriteJson(CAREERS_KEY, map);
  }
}

export function listBackupsForCareer(careerId: string): CareerSave[] {
  const backups = safeReadJson<Record<string, CareerSave[]>>(BACKUPS_KEY, {});
  return backups[careerId] ?? [];
}

export function restoreCareerFromBackup(careerId: string, backupIndex: number): CareerSave | null {
  const list = listBackupsForCareer(careerId);
  const chosen = list[backupIndex];
  if (!chosen) return null;
  saveCareer(chosen);
  return chosen;
}

export function deleteSavedCareer(careerId: string): void {
  const map = loadAllSavedCareers();
  delete map[careerId];
  safeWriteJson(CAREERS_KEY, map);
  if (getLastPlayedCareerId() === careerId) {
    try {
      localStorage.removeItem(LAST_PLAYED_KEY);
    } catch {
      // ignore
    }
  }
}

export function listContinueOptions(): {
  savedCareers: CareerSummaryItem[];
  bundledHanwhaMaster: CareerSummaryItem;
  lastPlayedCareer: CareerSummaryItem | null;
} {
  const map = loadAllSavedCareers();
  const lastPlayedId = getLastPlayedCareerId();

  const savedCareers: CareerSummaryItem[] = Object.values(map)
    .map((c) => {
      const regGames = c.gamesLedger.filter((g) => !g.isPostseason);
      const teamWins = regGames.filter((g) => g.winner === c.playerTeamId).length;
      const teamLosses = regGames.filter((g) => g.loser === c.playerTeamId).length;
      const teamDraws = regGames.filter(
        (g) => g.isDraw && (g.awayTeam === c.playerTeamId || g.homeTeam === c.playerTeamId)
      ).length;
      const standings = regGames.length > 0 ? computeStandings(c.gamesLedger) : [];
      const rankRow = standings.find((r) => r.teamId === c.playerTeamId);

      return {
        careerId: c.careerId,
        label: c.label,
        gmName: c.gmName || '단장',
        playerTeamId: c.playerTeamId,
        season: c.season,
        phase: c.phase,
        rank: rankRow ? rankRow.rank : null,
        wins: teamWins,
        losses: teamLosses,
        draws: teamDraws,
        gamesPlayed: c.gamesPlayed,
        totalRegularGames: c.totalRegularGames,
        cashBalanceBillion: c.finances?.cashBalanceBillion ?? null,
        version: c.version,
        updatedAt: c.updatedAt,
        isPreservedMaster: c.isPreservedMaster,
        isArchived: c.isArchived,
        isLastPlayed: c.careerId === lastPlayedId,
      };
    })
    .sort((a, b) => {
      if (a.isLastPlayed && !b.isLastPlayed) return -1;
      if (!a.isLastPlayed && b.isLastPlayed) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const bundledHanwhaMaster: CareerSummaryItem = {
    careerId: 'career_hanwha_v46030_master',
    label: '보존된 한화 이글스 마스터 세이브 (v4.60.30)',
    gmName: '단장',
    playerTeamId: '한화',
    season: 2026,
    phase: 'REGULAR_SEASON',
    rank: 2,
    wins: 6,
    losses: 3,
    draws: 0,
    gamesPlayed: 9,
    totalRegularGames: 144,
    cashBalanceBillion: null,
    version: 'v4.60.30',
    updatedAt: '2026-11-23T00:00:00.000Z',
    isPreservedMaster: true,
    isArchived: false,
  };

  const lastPlayedCareer =
    savedCareers.find((c) => c.careerId === lastPlayedId) ??
    savedCareers.find((c) => !c.isArchived) ??
    savedCareers[0] ??
    null;

  return { savedCareers, bundledHanwhaMaster, lastPlayedCareer };
}

export function exportCareerJson(career: CareerSave): string {
  return JSON.stringify(career, null, 2);
}

export function importCareerJson(rawJson: string): CareerSave {
  const parsed = JSON.parse(rawJson) as Partial<CareerSave>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.playerTeamId ||
    !parsed.players ||
    !parsed.teams ||
    !Array.isArray(parsed.gamesLedger) ||
    !Array.isArray(parsed.schedule)
  ) {
    throw new Error('올바른 KBO GM 세이브 JSON 형식이 아닙니다.');
  }

  // Assign an isolated careerId on import so existing preserved saves are never overwritten
  const safeId = parsed.careerId
    ? `${parsed.careerId}_imp_${Date.now()}`
    : `career_import_${Date.now()}`;
  const importedRaw: CareerSave = {
    ...(parsed as CareerSave),
    careerId: safeId,
    label: `${parsed.label ?? `${parsed.playerTeamId} 세이브`} (불러옴)`,
    isArchived: false,
    updatedAt: new Date().toISOString(),
  };

  const { career: imported } = migrateAndValidateCareerSave(importedRaw, { mutateInPlace: true });
  ensureGlobalPlayerRegistryInPlace(imported);
  ensureAmateurAndOverseasStateInPlace(imported);
  saveCareer(imported);
  return imported;
}
