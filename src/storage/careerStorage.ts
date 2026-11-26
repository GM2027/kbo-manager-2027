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
import { compressSavePayload, decompressSavePayload } from './saveCompression';

const LEGACY_CAREERS_KEY = 'kbo_gm_2026_careers_v1';
const LEGACY_BACKUPS_KEY = 'kbo_gm_2026_backups_v1';
const INDEX_V2_KEY = 'kbo_gm_2026_index_v2';
const SLOT_V2_PREFIX = 'kbo_gm_2026_slot_v2_';
const BACKUP_V2_PREFIX = 'kbo_gm_2026_backup_v2_';
const SETTINGS_KEY = 'kbo_gm_2026_settings_v1';
const LAST_PLAYED_KEY = 'kbo_gm_2026_last_played_v1';

const MAX_ROLLING_BACKUPS = 1;
const IDB_NAME = 'kbo_gm_2027_storage_idb_v1';
const IDB_STORE_CAREERS = 'careers';

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

// In-memory cache synced with IndexedDB + localStorage (guarantees fast reads & fallback even under strict quota)
const memoryCareersCache = new Map<string, CareerSave>();
let legacyMigrated = false;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function buildCareerSummary(c: CareerSave, lastPlayedId: string | null): CareerSummaryItem {
  const regGames = (c.gamesLedger ?? []).filter((g) => !g.isPostseason);
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
}

// -----------------------------------------------------------------------------
// IndexedDB Unlimited-Capacity Async Mirror
// -----------------------------------------------------------------------------
function openCareerIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_CAREERS)) {
          db.createObjectStore(IDB_STORE_CAREERS, { keyPath: 'careerId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function mirrorCareerToIdb(career: CareerSave): void {
  void openCareerIdb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE_CAREERS, 'readwrite');
      tx.objectStore(IDB_STORE_CAREERS).put(career);
    } catch {
      // ignore idb write errors
    }
  });
}

function deleteCareerFromIdb(careerId: string): void {
  void openCareerIdb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE_CAREERS, 'readwrite');
      tx.objectStore(IDB_STORE_CAREERS).delete(careerId);
    } catch {
      // ignore idb delete errors
    }
  });
}

/**
 * 앱 최초 구동 시 IndexedDB에 보관된 세이브를 메모리 캐시 및 인덱스에 동기화합니다.
 */
export async function hydrateCareersFromIndexedDb(): Promise<number> {
  const db = await openCareerIdb();
  if (!db) return 0;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_CAREERS, 'readonly');
      const req = tx.objectStore(IDB_STORE_CAREERS).getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as CareerSave[];
        const idxMap = readIndexV2();
        let added = 0;
        const lastId = getLastPlayedCareerId();
        for (const c of rows) {
          if (!c || !c.careerId) continue;
          const existingMem = memoryCareersCache.get(c.careerId);
          if (!existingMem || (c.updatedAt ?? '') > (existingMem.updatedAt ?? '')) {
            memoryCareersCache.set(c.careerId, c);
          }
          const existingIdx = idxMap[c.careerId];
          if (!existingIdx || (c.updatedAt ?? '') > (existingIdx.updatedAt ?? '')) {
            idxMap[c.careerId] = buildCareerSummary(c, lastId);
            added++;
          }
        }
        if (added > 0) {
          writeIndexV2(idxMap);
        }
        resolve(rows.length);
      };
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

// -----------------------------------------------------------------------------
// Low-Level Compressed LocalStorage Helpers + Quota Recovery
// -----------------------------------------------------------------------------
function safeReadJson<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const text = decompressSavePayload(raw);
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function readIndexV2(): Record<string, CareerSummaryItem> {
  return safeReadJson<Record<string, CareerSummaryItem>>(INDEX_V2_KEY, {});
}

function writeIndexV2(indexMap: Record<string, CareerSummaryItem>): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(INDEX_V2_KEY, JSON.stringify(indexMap));
  } catch {
    // ignore index write failure
  }
}

function removeAllBackupKeysFromLocalStorage(): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(LEGACY_BACKUPS_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(BACKUP_V2_PREFIX)) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

function evictOldestArchivedLocalStorageSlot(excludeCareerId: string): boolean {
  if (!hasLocalStorage()) return false;
  try {
    const idxMap = readIndexV2();
    const candidates = Object.values(idxMap)
      .filter((item) => item.careerId !== excludeCareerId)
      .sort((a, b) => {
        if (a.isArchived !== b.isArchived) return a.isArchived ? -1 : 1;
        return (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
      });
    for (const cand of candidates) {
      const slotKey = `${SLOT_V2_PREFIX}${cand.careerId}`;
      if (localStorage.getItem(slotKey) !== null) {
        // Ensure it stays backed up in memory & IndexedDB before removing from localStorage
        const existing = readSlotCareerFromLocalStorage(cand.careerId);
        if (existing) {
          memoryCareersCache.set(cand.careerId, existing);
          mirrorCareerToIdb(existing);
        }
        localStorage.removeItem(slotKey);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function writeCompressedLocalStorageKey(
  key: string,
  value: unknown,
  protectCareerId?: string
): boolean {
  if (!hasLocalStorage()) return false;
  let compressed: string;
  try {
    compressed = compressSavePayload(JSON.stringify(value));
  } catch {
    return false;
  }

  try {
    localStorage.setItem(key, compressed);
    return true;
  } catch {
    // Step 1: Drop legacy uncompressed blobs & rolling backups to reclaim megabytes immediately
    removeAllBackupKeysFromLocalStorage();
    try {
      localStorage.removeItem(LEGACY_CAREERS_KEY);
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(key, compressed);
      return true;
    } catch {
      // Step 2: Evict oldest archived localStorage slots (kept safely in IndexedDB) until it fits
      for (let attempt = 0; attempt < 10; attempt++) {
        const evicted = evictOldestArchivedLocalStorageSlot(protectCareerId ?? '');
        if (!evicted) break;
        try {
          localStorage.setItem(key, compressed);
          return true;
        } catch {
          // keep evicting
        }
      }
      return false;
    }
  }
}

function readSlotCareerFromLocalStorage(careerId: string): CareerSave | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(`${SLOT_V2_PREFIX}${careerId}`);
    if (!raw) return null;
    const text = decompressSavePayload(raw);
    if (!text) return null;
    return JSON.parse(text) as CareerSave;
  } catch {
    return null;
  }
}

/**
 * 기존 비압축 단일 키(kbo_gm_2026_careers_v1) 세이브들을 1회 자동 마이그레이션하여
 * 개별 압축 슬롯(kbo_gm_2026_slot_v2_*) + IndexedDB로 무손실 전환하고 수 MB의 용량을 즉시 회수합니다.
 */
function ensureLegacyCareersMigrated(): void {
  if (legacyMigrated || !hasLocalStorage()) return;
  legacyMigrated = true;

  try {
    const rawLegacy = localStorage.getItem(LEGACY_CAREERS_KEY);
    if (!rawLegacy) {
      // Also clear bloated legacy uncompressed backups if present
      if (localStorage.getItem(LEGACY_BACKUPS_KEY) !== null) {
        localStorage.removeItem(LEGACY_BACKUPS_KEY);
      }
      return;
    }

    const legacyMap = JSON.parse(rawLegacy) as Record<string, CareerSave>;
    const entries = Object.values(legacyMap ?? {}).filter((c) => c && c.careerId);

    // Free bloated legacy keys BEFORE writing compressed v2 slots so migration never hits QuotaExceeded
    localStorage.removeItem(LEGACY_CAREERS_KEY);
    localStorage.removeItem(LEGACY_BACKUPS_KEY);

    const idxMap = readIndexV2();
    const lastId = getLastPlayedCareerId();
    for (const c of entries) {
      memoryCareersCache.set(c.careerId, c);
      mirrorCareerToIdb(c);
      idxMap[c.careerId] = buildCareerSummary(c, lastId);
      writeCompressedLocalStorageKey(`${SLOT_V2_PREFIX}${c.careerId}`, c, c.careerId);
    }
    writeIndexV2(idxMap);
  } catch {
    // If legacy JSON was corrupted, remove so saves aren't permanently blocked
    try {
      localStorage.removeItem(LEGACY_CAREERS_KEY);
      localStorage.removeItem(LEGACY_BACKUPS_KEY);
    } catch {
      // ignore
    }
  }
}

// -----------------------------------------------------------------------------
// Public API (100% backward-compatible synchronous signatures)
// -----------------------------------------------------------------------------
export function getLastPlayedCareerId(): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return localStorage.getItem(LAST_PLAYED_KEY);
  } catch {
    return null;
  }
}

export function setLastPlayedCareerId(careerId: string): void {
  if (!hasLocalStorage()) return;
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
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function loadAllSavedCareers(): Record<string, CareerSave> {
  ensureLegacyCareersMigrated();
  const result: Record<string, CareerSave> = {};
  for (const [id, c] of memoryCareersCache.entries()) {
    result[id] = c;
  }
  if (hasLocalStorage()) {
    const idxMap = readIndexV2();
    for (const careerId of Object.keys(idxMap)) {
      if (!result[careerId]) {
        const loaded = readSlotCareerFromLocalStorage(careerId);
        if (loaded) {
          result[careerId] = loaded;
          memoryCareersCache.set(careerId, loaded);
        }
      }
    }
    // Also scan any orphaned v2 slot keys not yet in index
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(SLOT_V2_PREFIX)) {
          const cid = k.slice(SLOT_V2_PREFIX.length);
          if (!result[cid]) {
            const loaded = readSlotCareerFromLocalStorage(cid);
            if (loaded) {
              result[cid] = loaded;
              memoryCareersCache.set(cid, loaded);
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return result;
}

export function loadCareerById(careerId: string): CareerSave | null {
  ensureLegacyCareersMigrated();
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

  const loaded =
    readSlotCareerFromLocalStorage(careerId) ?? memoryCareersCache.get(careerId) ?? null;
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
  ensureLegacyCareersMigrated();
  const stamped: CareerSave = {
    ...career,
    updatedAt: new Date().toISOString(),
  };

  memoryCareersCache.set(stamped.careerId, stamped);
  mirrorCareerToIdb(stamped);

  const slotKey = `${SLOT_V2_PREFIX}${stamped.careerId}`;
  const wroteLocal = writeCompressedLocalStorageKey(slotKey, stamped, stamped.careerId);

  const idxMap = readIndexV2();
  idxMap[stamped.careerId] = buildCareerSummary(stamped, stamped.careerId);
  writeIndexV2(idxMap);
  setLastPlayedCareerId(stamped.careerId);

  // Rolling backups are strictly best-effort and never allowed to fail or slow down the primary save
  if (backupSnapshot && wroteLocal && hasLocalStorage()) {
    const writeBackup = () => {
      try {
        const compressedBackup = compressSavePayload(JSON.stringify(backupSnapshot));
        localStorage.setItem(`${BACKUP_V2_PREFIX}${stamped.careerId}_0`, compressedBackup);
      } catch {
        // If quota is tight for rolling backups, silently skip backup without harming primary save
      }
    };
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(writeBackup, 0);
    } else {
      writeBackup();
    }
  }

  // Return true if persisted to localStorage OR IndexedDB/memory fallback
  return wroteLocal || typeof indexedDB !== 'undefined';
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
  ensureLegacyCareersMigrated();
  const trimmed = newLabel.trim();
  if (!trimmed) return false;
  const target =
    readSlotCareerFromLocalStorage(careerId) ?? memoryCareersCache.get(careerId) ?? null;
  if (!target) return false;
  const updated: CareerSave = {
    ...target,
    label: trimmed,
    updatedAt: new Date().toISOString(),
  };
  return saveCareer(updated);
}

export function archiveExistingCareersBeforeNewGame(): void {
  ensureLegacyCareersMigrated();
  const idxMap = readIndexV2();
  let changed = false;
  for (const id of Object.keys(idxMap)) {
    if (!idxMap[id].isArchived) {
      idxMap[id] = { ...idxMap[id], isArchived: true };
      changed = true;
      const existing = readSlotCareerFromLocalStorage(id) ?? memoryCareersCache.get(id);
      if (existing && !existing.isArchived) {
        const archived = { ...existing, isArchived: true };
        memoryCareersCache.set(id, archived);
        mirrorCareerToIdb(archived);
        writeCompressedLocalStorageKey(`${SLOT_V2_PREFIX}${id}`, archived, id);
      }
    }
  }
  if (changed) {
    writeIndexV2(idxMap);
  }
}

export function listBackupsForCareer(careerId: string): CareerSave[] {
  ensureLegacyCareersMigrated();
  if (!hasLocalStorage()) return [];
  const results: CareerSave[] = [];
  for (let i = 0; i < MAX_ROLLING_BACKUPS; i++) {
    try {
      const raw = localStorage.getItem(`${BACKUP_V2_PREFIX}${careerId}_${i}`);
      if (!raw) continue;
      const text = decompressSavePayload(raw);
      if (!text) continue;
      results.push(JSON.parse(text) as CareerSave);
    } catch {
      // ignore corrupted backup entry
    }
  }
  return results;
}

export function restoreCareerFromBackup(careerId: string, backupIndex: number): CareerSave | null {
  const list = listBackupsForCareer(careerId);
  const chosen = list[backupIndex];
  if (!chosen) return null;
  saveCareer(chosen);
  return chosen;
}

export function deleteSavedCareer(careerId: string): void {
  ensureLegacyCareersMigrated();
  memoryCareersCache.delete(careerId);
  deleteCareerFromIdb(careerId);

  const idxMap = readIndexV2();
  delete idxMap[careerId];
  writeIndexV2(idxMap);

  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(`${SLOT_V2_PREFIX}${careerId}`);
      for (let i = 0; i < MAX_ROLLING_BACKUPS; i++) {
        localStorage.removeItem(`${BACKUP_V2_PREFIX}${careerId}_${i}`);
      }
    } catch {
      // ignore
    }
  }

  if (getLastPlayedCareerId() === careerId && hasLocalStorage()) {
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
  ensureLegacyCareersMigrated();
  const idxMap = readIndexV2();
  const lastPlayedId = getLastPlayedCareerId();

  // Merge any cached careers missing from index
  for (const [id, c] of memoryCareersCache.entries()) {
    if (!idxMap[id]) {
      idxMap[id] = buildCareerSummary(c, lastPlayedId);
    }
  }

  const savedCareers: CareerSummaryItem[] = Object.values(idxMap)
    .map((item) => ({
      ...item,
      isLastPlayed: item.careerId === lastPlayedId,
    }))
    .sort((a, b) => {
      if (a.isLastPlayed && !b.isLastPlayed) return -1;
      if (!a.isLastPlayed && b.isLastPlayed) return 1;
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
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
