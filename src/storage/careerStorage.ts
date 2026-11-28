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

export const MAX_AUTO_SAVE_BACKUPS = 3;
const IDB_NAME = 'kbo_gm_2027_storage_idb_v1';
const IDB_VERSION = 2;
const IDB_STORE_CAREERS = 'careers';
const IDB_STORE_AUTO_BACKUPS = 'auto_backups';
const MANUAL_SLOT_PREFIX = 'manual_slot__';
const AUTO_SLOT_PREFIX = 'auto_slot__';

export type SaveSlotKind = 'manual' | 'auto';

export interface SaveCareerOptions {
  mode?: SaveSlotKind;
  skipAutoBackup?: boolean;
}

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
  slotKind?: SaveSlotKind;
  compressedBytes?: number;
}

export interface AutoBackupRecord {
  backupKey: string;
  careerId: string;
  storageFormat?: 'compressed_v2' | 'gzip_v3' | 'raw_json_v3';
  payload: string | Uint8Array;
  updatedAt: string;
  version: string;
  season: number;
  gamesPlayed: number;
  totalRegularGames: number;
  compressedBytes: number;
}

interface IdbCompressedCareerRecord {
  careerId: string;
  storageFormat: 'compressed_v2' | 'gzip_v3' | 'raw_json_v3';
  slotKind: SaveSlotKind;
  payload: string | Uint8Array;
  updatedAt: string;
  rawBytes: number;
  compressedBytes: number;
}

export interface StorageUsageReport {
  storageBackend: 'IndexedDB + 압축' | 'LocalStorage + 압축';
  indexedDbAvailable: boolean;
  indexedDbBytes: number;
  localStorageBytes: number;
  localStorageEstimatedLimitBytes: number;
  browserUsageBytes: number | null;
  browserQuotaBytes: number | null;
  totalSlotCount: number;
  manualSlotCount: number;
  autoSlotCount: number;
  autoBackupCount: number;
  maxAutoBackupsPerCareer: number;
  perSlotBytes: Record<string, number>;
}

// In-memory cache synced with IndexedDB + localStorage (guarantees fast reads & fallback)
const memoryCareersCache = new Map<string, CareerSave>();
const memoryAutoBackupsCache = new Map<string, AutoBackupRecord[]>();
const memoryAutoBackupSnapshotsCache = new Map<string, CareerSave[]>();
const memorySlotBytes = new Map<string, number>();
const memoryCompressedCache = new Map<
  string,
  { signature: string; compressed: string; rawBytes: number; compressedBytes: number }
>();
let legacyMigrated = false;
let lastSaveErrorMessage: string | null = null;
let cachedCareerIdbPromise: Promise<IDBDatabase | null> | null = null;

interface PendingIdbSaveTask {
  career: CareerSave;
  mode: SaveSlotKind;
  backupSnapshot?: CareerSave;
  skipAutoBackup?: boolean;
}

const pendingIdbSaveTasks = new Map<string, PendingIdbSaveTask>();
let pendingIdbFlushTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleFlushHooksInstalled = false;

function buildCareerCompressionSignature(c: CareerSave): string {
  return `${c.careerId}|${c.version}|${c.season}|${c.phase}|${c.gamesPlayed}|${c.gamesLedger?.length ?? 0}`;
}

function isBrowserAsyncIdbMode(): boolean {
  return typeof window !== 'undefined' && hasIndexedDb();
}

async function gzipTextAsync(text: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined' || typeof TextEncoder === 'undefined') return null;
  try {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    void writer.write(new TextEncoder().encode(text));
    void writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function gunzipBytesAsync(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    void writer.write(copy);
    void writer.close();
    return await new Response(ds.readable).text();
  } catch {
    return null;
  }
}

async function decodeStoredCareerPayloadAsync(raw: unknown): Promise<CareerSave | null> {
  try {
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (obj.storageFormat === 'gzip_v3' && obj.payload instanceof Uint8Array) {
        const text = await gunzipBytesAsync(obj.payload);
        if (!text) return null;
        return JSON.parse(text) as CareerSave;
      }
      if (obj.storageFormat === 'raw_json_v3' && typeof obj.payload === 'string') {
        return JSON.parse(obj.payload) as CareerSave;
      }
    }
    return decodeStoredCareerPayload(raw);
  } catch {
    return null;
  }
}

async function persistTaskToIdbAsync(task: PendingIdbSaveTask): Promise<void> {
  try {
    const rawJson = JSON.stringify(task.career);
    const rawBytes = byteLengthUtf16(rawJson);
    const gz = await gzipTextAsync(rawJson);
    const payload: string | Uint8Array = gz ?? rawJson;
    const storageFormat: IdbCompressedCareerRecord['storageFormat'] = gz ? 'gzip_v3' : 'raw_json_v3';
    const compressedBytes = gz ? gz.byteLength : rawBytes;

    memorySlotBytes.set(task.career.careerId, compressedBytes);
    writeCompressedCareerToIdb({
      careerId: task.career.careerId,
      storageFormat,
      slotKind: task.mode,
      payload,
      updatedAt: task.career.updatedAt,
      rawBytes,
      compressedBytes,
    });

    // Rolling auto-save backups in IndexedDB (async, non-blocking)
    if (task.mode === 'auto' && task.backupSnapshot && !task.skipAutoBackup) {
      const snap = task.backupSnapshot;
      const snapJson = JSON.stringify(snap);
      const snapGz = await gzipTextAsync(snapJson);
      const snapPayload: string | Uint8Array = snapGz ?? snapJson;
      const snapBytes = snapGz ? snapGz.byteLength : byteLengthUtf16(snapJson);
      const rec: AutoBackupRecord = {
        backupKey: `${task.career.careerId}__auto_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        careerId: task.career.careerId,
        storageFormat: snapGz ? 'gzip_v3' : 'raw_json_v3',
        payload: snapPayload,
        updatedAt: snap.updatedAt || new Date().toISOString(),
        version: snap.version,
        season: snap.season,
        gamesPlayed: snap.gamesPlayed,
        totalRegularGames: snap.totalRegularGames,
        compressedBytes: snapBytes,
      };
      const existing = memoryAutoBackupsCache.get(task.career.careerId) ?? [];
      const nextList = [rec, ...existing].slice(0, MAX_AUTO_SAVE_BACKUPS);
      memoryAutoBackupsCache.set(task.career.careerId, nextList);
      syncAutoBackupsToIdb(task.career.careerId, nextList);
    }

    // Keep localStorage clean (no redundant 500KB+ slot/backup blobs when IndexedDB has the latest copy)
    if (hasLocalStorage()) {
      removeAllBackupKeysFromLocalStorage();
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(SLOT_V2_PREFIX)) {
            localStorage.removeItem(k);
          }
        }
      } catch {
        // ignore cleanup error
      }
    }
  } catch {
    // Keep in-memory state intact; never throw from background flush
  }
}

function flushPendingIdbSavesNow(): void {
  if (pendingIdbFlushTimer !== null) {
    clearTimeout(pendingIdbFlushTimer);
    pendingIdbFlushTimer = null;
  }
  if (pendingIdbSaveTasks.size === 0) return;
  const batch = Array.from(pendingIdbSaveTasks.values());
  pendingIdbSaveTasks.clear();
  for (const task of batch) {
    void persistTaskToIdbAsync(task);
  }
}

function installLifecycleFlushHooksOnce(): void {
  if (lifecycleFlushHooksInstalled || typeof window === 'undefined') return;
  lifecycleFlushHooksInstalled = true;
  const flushHandler = () => {
    flushPendingIdbSavesNow();
  };
  window.addEventListener('pagehide', flushHandler);
  window.addEventListener('beforeunload', flushHandler);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPendingIdbSavesNow();
    });
  }
}

function scheduleIdbBackgroundSave(task: PendingIdbSaveTask, immediate = false): void {
  installLifecycleFlushHooksOnce();
  pendingIdbSaveTasks.set(task.career.careerId, task);
  if (immediate) {
    flushPendingIdbSavesNow();
    return;
  }
  if (pendingIdbFlushTimer !== null) {
    clearTimeout(pendingIdbFlushTimer);
  }
  pendingIdbFlushTimer = setTimeout(() => {
    pendingIdbFlushTimer = null;
    flushPendingIdbSavesNow();
  }, 450);
}

export function getLastSaveError(): string | null {
  return lastSaveErrorMessage;
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function byteLengthUtf16(str: string): number {
  return str.length * 2;
}

/**
 * 수동 저장 / 자동 저장 슬롯 ID 매핑 헬퍼
 * - 동일 커리어의 수동 저장과 자동 저장 슬롯을 분리하여 서로 덮어쓰지 않도록 보호합니다.
 */
export function getBaseCareerId(careerId: string): string {
  if (careerId.startsWith(MANUAL_SLOT_PREFIX)) {
    return careerId.slice(MANUAL_SLOT_PREFIX.length);
  }
  if (careerId.startsWith(AUTO_SLOT_PREFIX)) {
    return careerId.slice(AUTO_SLOT_PREFIX.length);
  }
  return careerId;
}

export function getManualSlotId(careerId: string): string {
  return `${MANUAL_SLOT_PREFIX}${getBaseCareerId(careerId)}`;
}

export function getAutoSlotId(careerId: string): string {
  return `${AUTO_SLOT_PREFIX}${getBaseCareerId(careerId)}`;
}

export function inferSlotKind(careerId: string, explicit?: SaveSlotKind): SaveSlotKind {
  if (explicit) return explicit;
  if (careerId.startsWith(MANUAL_SLOT_PREFIX) || careerId.startsWith('career_slot_')) {
    return 'manual';
  }
  return 'auto';
}

function deduplicateByKey<T>(items: T[], getKey: (item: T) => string, maxItems: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * 저장 전 중복·불필요 임시 데이터를 무손실 정리합니다.
 * - 선수 통산 기록(careerStats), 시즌 히스토리, 수상/우승 기록, 계약·재정·경기 기록은 100% 유지합니다.
 * - 반복 저장 및 다년제 커리어에서 누적되는 중복 로그·중복 로스터 ID·과도한 일시 피드만 정리합니다.
 */
export function sanitizeCareerForStorage(career: CareerSave): CareerSave {
  const next: CareerSave = { ...career };

  if (Array.isArray(career.transactionLogs)) {
    next.transactionLogs = deduplicateByKey(
      career.transactionLogs,
      (t) => t.id || `${t.date}|${t.teamId}|${t.summary}`,
      250
    );
  }

  if (Array.isArray(career.newsFeed)) {
    next.newsFeed = deduplicateByKey(
      career.newsFeed,
      (n) => n.id || `${n.season}|${n.date}|${n.headline}`,
      200
    );
  }

  if (Array.isArray(career.growthLogs)) {
    next.growthLogs = deduplicateByKey(
      career.growthLogs,
      (g) => g.id || `${g.date}|${g.playerId}|${g.reason}|${g.prevAbility}`,
      200
    );
  }

  if (Array.isArray(career.injuryLogs)) {
    next.injuryLogs = deduplicateByKey(
      career.injuryLogs,
      (inj) => inj.id || `${inj.date}|${inj.playerId}|${inj.description}`,
      150
    );
  }

  if (Array.isArray(career.leagueAcquisitions)) {
    next.leagueAcquisitions = deduplicateByKey(
      career.leagueAcquisitions,
      (a) => a.dedupeKey || a.id || `${a.season}|${a.playerName}|${a.acquiringTeamId}`,
      300
    );
  }

  if (Array.isArray(career.faCoaches)) {
    next.faCoaches = deduplicateByKey(career.faCoaches, (c) => `${c.id}::${c.name}`, 120);
  }

  if (Array.isArray(career.coachSwapReports) && career.coachSwapReports.length > 30) {
    next.coachSwapReports = career.coachSwapReports.slice(0, 30);
  }

  if (career.teams) {
    const cleanedTeams = { ...career.teams };
    for (const [tid, ts] of Object.entries(cleanedTeams)) {
      if (!ts) continue;
      const lineupOrder = Array.from(new Set(ts.lineupOrder ?? []));
      const lineupSet = new Set(lineupOrder);
      const benchOrder = Array.from(new Set(ts.benchOrder ?? [])).filter((id) => !lineupSet.has(id));
      const rotationOrder = Array.from(new Set(ts.rotationOrder ?? []));
      const rotSet = new Set(rotationOrder);
      const bullpenOrder = Array.from(new Set(ts.bullpenOrder ?? [])).filter((id) => !rotSet.has(id));
      cleanedTeams[tid as TeamId] = {
        ...ts,
        lineupOrder,
        benchOrder,
        rotationOrder,
        bullpenOrder,
      };
    }
    next.teams = cleanedTeams;
  }

  return next;
}

function serializeAndCompressCareerChecked(
  career: CareerSave
): { compressed: string; rawBytes: number; compressedBytes: number } {
  const sanitized = sanitizeCareerForStorage(career);
  const rawJson = JSON.stringify(sanitized);
  if (!rawJson || rawJson.length < 2 || rawJson[0] !== '{' || rawJson[rawJson.length - 1] !== '}') {
    throw new Error('세이브 직렬화에 실패했습니다.');
  }
  const compressed = compressSavePayload(rawJson);
  if (!compressed || compressed.length < 2) {
    throw new Error('세이브 압축에 실패했습니다.');
  }
  return {
    compressed,
    rawBytes: byteLengthUtf16(rawJson),
    compressedBytes: byteLengthUtf16(compressed),
  };
}

function decodeStoredCareerPayload(raw: unknown): CareerSave | null {
  try {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const text = decompressSavePayload(raw);
      if (!text) return null;
      return JSON.parse(text) as CareerSave;
    }
    if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (obj.storageFormat === 'compressed_v2' && typeof obj.payload === 'string') {
        const text = decompressSavePayload(obj.payload);
        if (!text) return null;
        return JSON.parse(text) as CareerSave;
      }
      if (typeof obj.careerId === 'string' && obj.players && obj.teams) {
        return obj as unknown as CareerSave;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildCareerSummary(
  c: CareerSave,
  lastPlayedId: string | null,
  slotKind?: SaveSlotKind,
  compressedBytes?: number
): CareerSummaryItem {
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
    slotKind: inferSlotKind(c.careerId, slotKind),
    compressedBytes: compressedBytes ?? memorySlotBytes.get(c.careerId),
  };
}

// -----------------------------------------------------------------------------
// IndexedDB Compressed Primary Storage (v2: careers + auto_backups)
// -----------------------------------------------------------------------------
function openCareerIdb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (cachedCareerIdbPromise) return cachedCareerIdbPromise;
  cachedCareerIdbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_CAREERS)) {
          db.createObjectStore(IDB_STORE_CAREERS, { keyPath: 'careerId' });
        }
        if (!db.objectStoreNames.contains(IDB_STORE_AUTO_BACKUPS)) {
          const store = db.createObjectStore(IDB_STORE_AUTO_BACKUPS, { keyPath: 'backupKey' });
          store.createIndex('by_careerId', 'careerId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        cachedCareerIdbPromise = null;
        resolve(null);
      };
    } catch {
      cachedCareerIdbPromise = null;
      resolve(null);
    }
  });
  return cachedCareerIdbPromise;
}

function writeCompressedCareerToIdb(record: IdbCompressedCareerRecord): void {
  void openCareerIdb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE_CAREERS, 'readwrite');
      tx.objectStore(IDB_STORE_CAREERS).put(record);
    } catch {
      // keep existing record intact on IDB write failure
    }
  });
}

function syncAutoBackupsToIdb(careerId: string, latestRecords: AutoBackupRecord[]): void {
  void openCareerIdb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE_AUTO_BACKUPS, 'readwrite');
      const store = tx.objectStore(IDB_STORE_AUTO_BACKUPS);
      const index = store.index('by_careerId');
      const getKeysReq = index.getAllKeys(IDBKeyRange.only(careerId));
      getKeysReq.onsuccess = () => {
        const keepKeys = new Set(latestRecords.map((r) => r.backupKey));
        for (const existingKey of getKeysReq.result ?? []) {
          if (!keepKeys.has(String(existingKey))) {
            store.delete(existingKey);
          }
        }
        for (const rec of latestRecords) {
          store.put(rec);
        }
      };
    } catch {
      // ignore idb backup write error without harming primary save
    }
  });
}

function deleteCareerAndBackupsFromIdb(careerId: string): void {
  void openCareerIdb().then((db) => {
    if (!db) return;
    try {
      const stores = db.objectStoreNames.contains(IDB_STORE_AUTO_BACKUPS)
        ? [IDB_STORE_CAREERS, IDB_STORE_AUTO_BACKUPS]
        : [IDB_STORE_CAREERS];
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore(IDB_STORE_CAREERS).delete(careerId);
      if (db.objectStoreNames.contains(IDB_STORE_AUTO_BACKUPS)) {
        const bStore = tx.objectStore(IDB_STORE_AUTO_BACKUPS);
        const idx = bStore.index('by_careerId');
        const keysReq = idx.getAllKeys(IDBKeyRange.only(careerId));
        keysReq.onsuccess = () => {
          for (const k of keysReq.result ?? []) {
            bStore.delete(k);
          }
        };
      }
    } catch {
      // ignore idb delete errors
    }
  });
}

/**
 * 앱 최초 구동 시 IndexedDB에 보관된 압축 세이브 및 최근 3개 자동 백업을 메모리 캐시와 인덱스에 동기화합니다.
 */
export async function hydrateCareersFromIndexedDb(): Promise<number> {
  const db = await openCareerIdb();
  if (!db) return 0;

  const loadedCount = await new Promise<number>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_CAREERS, 'readonly');
      const req = tx.objectStore(IDB_STORE_CAREERS).getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as unknown[];
        void (async () => {
          const idxMap = readIndexV2();
          let added = 0;
          const lastId = getLastPlayedCareerId();
          for (const row of rows) {
            const c = await decodeStoredCareerPayloadAsync(row);
            if (!c || !c.careerId) continue;
            const metaObj = row as Partial<IdbCompressedCareerRecord>;
            const slotKind = inferSlotKind(c.careerId, metaObj.slotKind);
            const compBytes =
              typeof metaObj.compressedBytes === 'number'
                ? metaObj.compressedBytes
                : typeof metaObj.payload === 'string'
                  ? byteLengthUtf16(metaObj.payload)
                  : metaObj.payload instanceof Uint8Array
                    ? metaObj.payload.byteLength
                    : undefined;
            if (compBytes !== undefined) {
              memorySlotBytes.set(c.careerId, compBytes);
            }

            const existingMem = memoryCareersCache.get(c.careerId);
            if (!existingMem || (c.updatedAt ?? '') > (existingMem.updatedAt ?? '')) {
              memoryCareersCache.set(c.careerId, c);
            }
            const existingIdx = idxMap[c.careerId];
            if (!existingIdx || (c.updatedAt ?? '') > (existingIdx.updatedAt ?? '')) {
              idxMap[c.careerId] = buildCareerSummary(c, lastId, slotKind, compBytes);
              added++;
            }
          }
          if (added > 0) {
            writeIndexV2(idxMap);
          }
          resolve(rows.length);
        })();
      };
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });

  if (db.objectStoreNames.contains(IDB_STORE_AUTO_BACKUPS)) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_AUTO_BACKUPS, 'readonly');
        const req = tx.objectStore(IDB_STORE_AUTO_BACKUPS).getAll();
        req.onsuccess = () => {
          const allBackups = (req.result ?? []) as AutoBackupRecord[];
          const grouped = new Map<string, AutoBackupRecord[]>();
          for (const rec of allBackups) {
            if (!rec || !rec.careerId || !rec.payload) continue;
            const arr = grouped.get(rec.careerId) ?? [];
            arr.push(rec);
            grouped.set(rec.careerId, arr);
          }
          for (const [cid, list] of grouped.entries()) {
            const sorted = list
              .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
              .slice(0, MAX_AUTO_SAVE_BACKUPS);
            memoryAutoBackupsCache.set(cid, sorted);
            void (async () => {
              const decodedList: CareerSave[] = [];
              for (const rec of sorted) {
                const decoded = await decodeStoredCareerPayloadAsync({
                  storageFormat: rec.storageFormat ?? 'compressed_v2',
                  payload: rec.payload,
                });
                if (decoded) decodedList.push(decoded);
              }
              if (decodedList.length > 0 && !memoryAutoBackupSnapshotsCache.has(cid)) {
                memoryAutoBackupSnapshotsCache.set(cid, decodedList);
              }
            })();
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  return loadedCount;
}

// -----------------------------------------------------------------------------
// Low-Level Compressed LocalStorage Helpers + Atomic Failure Protection
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

function pruneLocalStorageBackupsForCareer(careerId: string, keepCount: number): void {
  if (!hasLocalStorage()) return;
  try {
    const prefix = `${BACKUP_V2_PREFIX}${careerId}_`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const idxNum = Number(k.slice(prefix.length));
      if (!Number.isInteger(idxNum) || idxNum < 0 || idxNum >= keepCount) {
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

function evictOtherLocalStorageSlotsWhenIdbSafe(excludeCareerId: string): boolean {
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
        const existing = readSlotCareerFromLocalStorage(cand.careerId);
        if (existing) {
          memoryCareersCache.set(cand.careerId, existing);
          if (hasIndexedDb()) {
            try {
              const packed = serializeAndCompressCareerChecked(existing);
              writeCompressedCareerToIdb({
                careerId: existing.careerId,
                storageFormat: 'compressed_v2',
                slotKind: inferSlotKind(existing.careerId, cand.slotKind),
                payload: packed.compressed,
                updatedAt: existing.updatedAt,
                rawBytes: packed.rawBytes,
                compressedBytes: packed.compressedBytes,
              });
            } catch {
              // ignore
            }
          }
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

/**
 * 원자적 localStorage 쓰기: 실패 시 기존 키를 삭제하거나 손상시키지 않고 원본 데이터를 그대로 보호합니다.
 */
function writeCompressedPayloadToLocalStorageSafe(
  key: string,
  compressedPayload: string,
  protectCareerId: string
): boolean {
  if (!hasLocalStorage()) return false;
  const previousRaw = localStorage.getItem(key);

  try {
    localStorage.setItem(key, compressedPayload);
    return true;
  } catch {
    // Step 1: Drop legacy uncompressed blobs & localStorage backups (IndexedDB keeps rolling backups safely)
    removeAllBackupKeysFromLocalStorage();
    try {
      localStorage.removeItem(LEGACY_CAREERS_KEY);
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(key, compressedPayload);
      return true;
    } catch {
      // Step 2: Only evict OTHER slots if IndexedDB is available to preserve them safely
      if (hasIndexedDb()) {
        for (let attempt = 0; attempt < 10; attempt++) {
          const evicted = evictOtherLocalStorageSlotsWhenIdbSafe(protectCareerId);
          if (!evicted) break;
          try {
            localStorage.setItem(key, compressedPayload);
            return true;
          } catch {
            // keep evicting
          }
        }
      }
      // Restore previous value if anything somehow disturbed it
      if (previousRaw !== null) {
        try {
          if (localStorage.getItem(key) !== previousRaw) {
            localStorage.setItem(key, previousRaw);
          }
        } catch {
          // previous key was untouched because setItem threw before mutating
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
    return decodeStoredCareerPayload(raw);
  } catch {
    return null;
  }
}

/**
 * 기존 비압축 단일 키(kbo_gm_2026_careers_v1) 세이브들을 1회 자동 마이그레이션하여
 * IndexedDB 압축 저장 + 개별 압축 슬롯(kbo_gm_2026_slot_v2_*)으로 무손실 전환합니다.
 */
function ensureLegacyCareersMigrated(): void {
  if (legacyMigrated || !hasLocalStorage()) return;
  legacyMigrated = true;

  try {
    const rawLegacy = localStorage.getItem(LEGACY_CAREERS_KEY);
    if (!rawLegacy) {
      if (localStorage.getItem(LEGACY_BACKUPS_KEY) !== null) {
        localStorage.removeItem(LEGACY_BACKUPS_KEY);
      }
      return;
    }

    const legacyMap = JSON.parse(rawLegacy) as Record<string, CareerSave>;
    const entries = Object.values(legacyMap ?? {}).filter((c) => c && c.careerId);

    localStorage.removeItem(LEGACY_CAREERS_KEY);
    localStorage.removeItem(LEGACY_BACKUPS_KEY);

    const idxMap = readIndexV2();
    const lastId = getLastPlayedCareerId();
    for (const c of entries) {
      try {
        const packed = serializeAndCompressCareerChecked(c);
        const slotKind = inferSlotKind(c.careerId);
        memoryCareersCache.set(c.careerId, c);
        memorySlotBytes.set(c.careerId, packed.compressedBytes);
        writeCompressedCareerToIdb({
          careerId: c.careerId,
          storageFormat: 'compressed_v2',
          slotKind,
          payload: packed.compressed,
          updatedAt: c.updatedAt,
          rawBytes: packed.rawBytes,
          compressedBytes: packed.compressedBytes,
        });
        idxMap[c.careerId] = buildCareerSummary(c, lastId, slotKind, packed.compressedBytes);
        writeCompressedPayloadToLocalStorageSafe(
          `${SLOT_V2_PREFIX}${c.careerId}`,
          packed.compressed,
          c.careerId
        );
      } catch {
        // skip corrupted single entry without blocking other careers
      }
    }
    writeIndexV2(idxMap);
  } catch {
    try {
      localStorage.removeItem(LEGACY_CAREERS_KEY);
      localStorage.removeItem(LEGACY_BACKUPS_KEY);
    } catch {
      // ignore
    }
  }
}

function recordAutoBackupEntry(careerId: string, snapshot: CareerSave): void {
  try {
    const sig = buildCareerCompressionSignature(snapshot);
    const cached =
      memoryCompressedCache.get(snapshot.careerId) ??
      memoryCompressedCache.get(careerId);
    const cachedAltSig = buildCareerCompressionSignature({ ...snapshot, careerId });
    const packed =
      cached && (cached.signature === sig || cached.signature === cachedAltSig)
        ? {
            compressed: cached.compressed,
            rawBytes: cached.rawBytes,
            compressedBytes: cached.compressedBytes,
          }
        : serializeAndCompressCareerChecked(snapshot);
    const updatedAt = snapshot.updatedAt || new Date().toISOString();
    const rec: AutoBackupRecord = {
      backupKey: `${careerId}__auto_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      careerId,
      payload: packed.compressed,
      updatedAt,
      version: snapshot.version,
      season: snapshot.season,
      gamesPlayed: snapshot.gamesPlayed,
      totalRegularGames: snapshot.totalRegularGames,
      compressedBytes: packed.compressedBytes,
    };

    const existing = memoryAutoBackupsCache.get(careerId) ?? readLocalStorageBackupsAsRecords(careerId);
    const nextList = [rec, ...existing].slice(0, MAX_AUTO_SAVE_BACKUPS);
    memoryAutoBackupsCache.set(careerId, nextList);

    if (hasIndexedDb()) {
      syncAutoBackupsToIdb(careerId, nextList);
      // Free localStorage backup keys when IndexedDB is storing backups so localStorage stays lightweight
      pruneLocalStorageBackupsForCareer(careerId, 0);
    } else if (hasLocalStorage()) {
      // Fallback for non-IDB environments: keep strictly MAX_AUTO_SAVE_BACKUPS (3) compressed backups
      for (let i = 0; i < nextList.length; i++) {
        try {
          const itemPayload = nextList[i].payload;
          if (typeof itemPayload === 'string') {
            localStorage.setItem(`${BACKUP_V2_PREFIX}${careerId}_${i}`, itemPayload);
          }
        } catch {
          // If tight on localStorage quota, skip backup without harming primary save
          break;
        }
      }
      pruneLocalStorageBackupsForCareer(careerId, nextList.length);
    }
  } catch {
    // Rolling backups are strictly best-effort and never harm primary save
  }
}

function readLocalStorageBackupsAsRecords(careerId: string): AutoBackupRecord[] {
  if (!hasLocalStorage()) return [];
  const results: AutoBackupRecord[] = [];
  for (let i = 0; i < MAX_AUTO_SAVE_BACKUPS; i++) {
    try {
      const raw = localStorage.getItem(`${BACKUP_V2_PREFIX}${careerId}_${i}`);
      if (!raw) continue;
      const parsed = decodeStoredCareerPayload(raw);
      if (!parsed) continue;
      results.push({
        backupKey: `${careerId}__ls_${i}`,
        careerId,
        payload: raw,
        updatedAt: parsed.updatedAt,
        version: parsed.version,
        season: parsed.season,
        gamesPlayed: parsed.gamesPlayed,
        totalRegularGames: parsed.totalRegularGames,
        compressedBytes: byteLengthUtf16(raw),
      });
    } catch {
      // ignore corrupted backup
    }
  }
  return results;
}

// -----------------------------------------------------------------------------
// Public API (100% backward-compatible + Manual/Auto separation + Storage Usage)
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

  // IndexedDB-backed memory cache takes precedence when fresher than localStorage mirror
  const memLoaded = memoryCareersCache.get(careerId) ?? null;
  const lsLoaded = readSlotCareerFromLocalStorage(careerId);
  let loaded: CareerSave | null = null;
  if (memLoaded && lsLoaded) {
    loaded = (memLoaded.updatedAt ?? '') >= (lsLoaded.updatedAt ?? '') ? memLoaded : lsLoaded;
  } else {
    loaded = memLoaded ?? lsLoaded;
  }
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

/**
 * 핵심 세이브 저장 함수 (기존 시그니처 100% 호환 + 압축·IndexedDB·실패 보호·수동/자동 구분)
 * - 동일 careerId 슬롯에 저장 시 기존 슬롯 데이터를 덮어씁니다 (중복 슬롯 생성 없음).
 * - 직렬화/압축 검증 또는 저장 실패 시 기존 세이브 데이터를 절대 훼손하지 않고 false를 반환합니다.
 * - 자동 저장 백업은 최근 3개(MAX_AUTO_SAVE_BACKUPS)만 유지합니다.
 */
export function saveCareer(
  career: CareerSave,
  backupSnapshot?: CareerSave,
  options?: SaveCareerOptions
): boolean {
  ensureLegacyCareersMigrated();
  lastSaveErrorMessage = null;

  const mode = inferSlotKind(career.careerId, options?.mode);
  const stamped: CareerSave = sanitizeCareerForStorage({
    ...career,
    updatedAt: new Date().toISOString(),
  });

  // Fast non-blocking browser path (IndexedDB + native off-main-thread gzip):
  // Eliminates ~950ms~1,780ms synchronous JS LZW compression stalls on every click!
  if (isBrowserAsyncIdbMode()) {
    memoryCareersCache.set(stamped.careerId, stamped);
    if (mode === 'auto' && backupSnapshot && !options?.skipAutoBackup) {
      const prevSnaps = memoryAutoBackupSnapshotsCache.get(stamped.careerId) ?? [];
      memoryAutoBackupSnapshotsCache.set(
        stamped.careerId,
        [backupSnapshot, ...prevSnaps].slice(0, MAX_AUTO_SAVE_BACKUPS)
      );
    }

    const idxMap = readIndexV2();
    idxMap[stamped.careerId] = buildCareerSummary(
      stamped,
      stamped.careerId,
      mode,
      memorySlotBytes.get(stamped.careerId)
    );
    writeIndexV2(idxMap);
    setLastPlayedCareerId(stamped.careerId);

    scheduleIdbBackgroundSave(
      {
        career: stamped,
        mode,
        backupSnapshot,
        skipAutoBackup: options?.skipAutoBackup,
      },
      mode === 'manual'
    );
    return true;
  }

  // 1) Atomic prepare & integrity verification BEFORE mutating any existing stored data (non-IDB fallback & tests)
  let packed: { compressed: string; rawBytes: number; compressedBytes: number };
  try {
    packed = serializeAndCompressCareerChecked(stamped);
  } catch (err) {
    lastSaveErrorMessage =
      err instanceof Error ? err.message : '세이브 데이터 압축 검증 중 오류가 발생했습니다.';
    return false;
  }

  // 2) Persist to primary storage
  // - When IndexedDB is available (browser): IndexedDB is the primary unlimited compressed store.
  //   Keep localStorage ultra-lightweight (only active slot mirror + tiny metadata index) by removing older slot/backup blobs from localStorage!
  // - When IndexedDB is unavailable (fallback/test): persist compressed slots directly to localStorage with atomic failure protection.
  const idbAvailable = hasIndexedDb();
  const slotKey = `${SLOT_V2_PREFIX}${stamped.careerId}`;
  let wroteLocal = false;

  if (idbAvailable) {
    writeCompressedCareerToIdb({
      careerId: stamped.careerId,
      storageFormat: 'compressed_v2',
      slotKind: mode,
      payload: packed.compressed,
      updatedAt: stamped.updatedAt,
      rawBytes: packed.rawBytes,
      compressedBytes: packed.compressedBytes,
    });
    if (hasLocalStorage()) {
      // Keep localStorage clean: drop old backup blobs & non-active slot blobs already stored in IndexedDB
      removeAllBackupKeysFromLocalStorage();
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(SLOT_V2_PREFIX) && k !== slotKey) {
            localStorage.removeItem(k);
          }
        }
      } catch {
        // ignore cleanup error
      }
      wroteLocal = writeCompressedPayloadToLocalStorageSafe(slotKey, packed.compressed, stamped.careerId);
    }
  } else if (hasLocalStorage()) {
    wroteLocal = writeCompressedPayloadToLocalStorageSafe(slotKey, packed.compressed, stamped.careerId);
    if (!wroteLocal) {
      lastSaveErrorMessage =
        '브라우저 저장공간이 부족하여 저장하지 못했습니다. 기존 세이브 데이터는 안전하게 보호되었습니다.';
      return false;
    }
  }

  // 4) Rolling Auto-Save Backups (latest 3 only) — run BEFORE overwriting memoryCompressedCache so snapshot hits cache!
  if (mode === 'auto' && backupSnapshot && !options?.skipAutoBackup) {
    recordAutoBackupEntry(stamped.careerId, backupSnapshot);
  }

  memoryCareersCache.set(stamped.careerId, stamped);
  memorySlotBytes.set(stamped.careerId, packed.compressedBytes);
  memoryCompressedCache.set(stamped.careerId, {
    signature: buildCareerCompressionSignature(stamped),
    compressed: packed.compressed,
    rawBytes: packed.rawBytes,
    compressedBytes: packed.compressedBytes,
  });

  const idxMap = readIndexV2();
  idxMap[stamped.careerId] = buildCareerSummary(stamped, stamped.careerId, mode, packed.compressedBytes);
  writeIndexV2(idxMap);
  setLastPlayedCareerId(stamped.careerId);

  return wroteLocal || idbAvailable || !hasLocalStorage();
}

/**
 * 수동 저장 전용 슬롯에 저장합니다.
 * - 자동 저장 슬롯과 분리되어 있으며, 같은 커리어에서 반복 수동 저장 시 해당 수동 슬롯을 덮어씁니다.
 */
export function saveManualCareer(career: CareerSave): { ok: boolean; savedCareer: CareerSave } {
  const manualId = getManualSlotId(career.careerId);
  const baseLabel = career.label.replace(/\s*\[(수동|자동)\]$/, '').trim();
  const manualCareer: CareerSave = {
    ...career,
    careerId: manualId,
    label: `${baseLabel} [수동]`,
    isArchived: false,
    updatedAt: new Date().toISOString(),
  };
  const ok = saveCareer(manualCareer, undefined, { mode: 'manual', skipAutoBackup: true });
  return { ok, savedCareer: manualCareer };
}

/**
 * 자동 저장 전용 슬롯에 저장합니다.
 * - 수동 저장 슬롯에서 플레이를 이어가더라도 수동 슬롯 원본을 덮어쓰지 않고 별도 자동 저장 슬롯에 저장합니다.
 * - 직전 스냅샷이 제공되면 최근 3개 자동 저장 백업 링에 보관합니다.
 */
export function saveAutoCareer(
  career: CareerSave,
  backupSnapshot?: CareerSave
): { ok: boolean; savedCareer: CareerSave } {
  const isAlreadyManualSlot =
    career.careerId.startsWith(MANUAL_SLOT_PREFIX) || career.careerId.startsWith('career_slot_');
  const autoId = isAlreadyManualSlot ? getAutoSlotId(career.careerId) : career.careerId;
  const baseLabel = career.label.replace(/\s*\[(수동|자동)\]$/, '').trim();
  const autoCareer: CareerSave = isAlreadyManualSlot
    ? {
        ...career,
        careerId: autoId,
        label: `${baseLabel} [자동]`,
        isArchived: false,
        updatedAt: new Date().toISOString(),
      }
    : career;

  // Keep backupSnapshot aligned with the auto slot ID if present
  const ok = saveCareer(autoCareer, backupSnapshot, { mode: 'auto' });
  return { ok, savedCareer: autoCareer };
}

/**
 * 현재 진행 중인 커리어를 새 수동 슬롯(다른 이름)으로 안전하게 복제 저장합니다.
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
  saveCareer(cloned, undefined, { mode: 'manual', skipAutoBackup: true });
  return cloned;
}

export function renameSavedCareer(careerId: string, newLabel: string): boolean {
  ensureLegacyCareersMigrated();
  const trimmed = newLabel.trim();
  if (!trimmed) return false;
  const target =
    memoryCareersCache.get(careerId) ?? readSlotCareerFromLocalStorage(careerId) ?? null;
  if (!target) return false;
  const idxItem = readIndexV2()[careerId];
  const updated: CareerSave = {
    ...target,
    label: trimmed,
    updatedAt: new Date().toISOString(),
  };
  return saveCareer(updated, undefined, {
    mode: inferSlotKind(careerId, idxItem?.slotKind),
    skipAutoBackup: true,
  });
}

export function archiveExistingCareersBeforeNewGame(): void {
  ensureLegacyCareersMigrated();
  const idxMap = readIndexV2();
  let changed = false;
  for (const id of Object.keys(idxMap)) {
    if (!idxMap[id].isArchived) {
      idxMap[id] = { ...idxMap[id], isArchived: true };
      changed = true;
      const existing = memoryCareersCache.get(id) ?? readSlotCareerFromLocalStorage(id);
      if (existing && !existing.isArchived) {
        const archived = { ...existing, isArchived: true };
        memoryCareersCache.set(id, archived);
        try {
          const packed = serializeAndCompressCareerChecked(archived);
          writeCompressedCareerToIdb({
            careerId: id,
            storageFormat: 'compressed_v2',
            slotKind: inferSlotKind(id, idxMap[id].slotKind),
            payload: packed.compressed,
            updatedAt: archived.updatedAt,
            rawBytes: packed.rawBytes,
            compressedBytes: packed.compressedBytes,
          });
          if (!hasIndexedDb()) {
            writeCompressedPayloadToLocalStorageSafe(`${SLOT_V2_PREFIX}${id}`, packed.compressed, id);
          }
        } catch {
          // ignore
        }
      }
    }
  }
  if (changed) {
    writeIndexV2(idxMap);
  }
}

export function listBackupsForCareer(careerId: string): CareerSave[] {
  ensureLegacyCareersMigrated();
  const inMemSnapshots = memoryAutoBackupSnapshotsCache.get(careerId);
  if (inMemSnapshots && inMemSnapshots.length > 0) {
    return inMemSnapshots.slice(0, MAX_AUTO_SAVE_BACKUPS);
  }
  const cached = memoryAutoBackupsCache.get(careerId);
  const records =
    cached && cached.length > 0 ? cached : readLocalStorageBackupsAsRecords(careerId);
  const results: CareerSave[] = [];
  for (const rec of records.slice(0, MAX_AUTO_SAVE_BACKUPS)) {
    const parsed = decodeStoredCareerPayload(
      rec.storageFormat === 'raw_json_v3' && typeof rec.payload === 'string'
        ? rec.payload
        : rec.payload
    );
    if (parsed) results.push(parsed);
  }
  return results;
}

export function restoreCareerFromBackup(careerId: string, backupIndex: number): CareerSave | null {
  const list = listBackupsForCareer(careerId);
  const chosen = list[backupIndex];
  if (!chosen) return null;
  const restored: CareerSave = {
    ...chosen,
    careerId,
    updatedAt: new Date().toISOString(),
  };
  saveCareer(restored, undefined, { mode: 'auto', skipAutoBackup: true });
  return restored;
}

export function deleteSavedCareer(careerId: string): void {
  ensureLegacyCareersMigrated();
  pendingIdbSaveTasks.delete(careerId);
  memoryCareersCache.delete(careerId);
  memoryAutoBackupsCache.delete(careerId);
  memoryAutoBackupSnapshotsCache.delete(careerId);
  memorySlotBytes.delete(careerId);
  deleteCareerAndBackupsFromIdb(careerId);

  const idxMap = readIndexV2();
  delete idxMap[careerId];
  writeIndexV2(idxMap);

  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(`${SLOT_V2_PREFIX}${careerId}`);
      pruneLocalStorageBackupsForCareer(careerId, 0);
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

  for (const [id, c] of memoryCareersCache.entries()) {
    if (!idxMap[id]) {
      idxMap[id] = buildCareerSummary(c, lastPlayedId);
    }
  }

  const savedCareers: CareerSummaryItem[] = Object.values(idxMap)
    .map((item) => ({
      ...item,
      slotKind: inferSlotKind(item.careerId, item.slotKind),
      compressedBytes: item.compressedBytes ?? memorySlotBytes.get(item.careerId),
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
    slotKind: 'manual',
  };

  const lastPlayedCareer =
    savedCareers.find((c) => c.careerId === lastPlayedId) ??
    savedCareers.find((c) => !c.isArchived) ??
    savedCareers[0] ??
    null;

  return { savedCareers, bundledHanwhaMaster, lastPlayedCareer };
}

/**
 * 현재 저장공간 사용량(IndexedDB + localStorage + 브라우저 저장소 할당량 + 슬롯/자동백업 현황) 조회
 */
export function getSyncStorageUsageSnapshot(): StorageUsageReport {
  let localStorageBytes = 0;
  const perSlotBytes: Record<string, number> = {};

  if (hasLocalStorage()) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const v = localStorage.getItem(k) ?? '';
        const b = byteLengthUtf16(k) + byteLengthUtf16(v);
        localStorageBytes += b;
        if (k.startsWith(SLOT_V2_PREFIX)) {
          const cid = k.slice(SLOT_V2_PREFIX.length);
          perSlotBytes[cid] = byteLengthUtf16(v);
        }
      }
    } catch {
      // ignore
    }
  }

  const idxMap = readIndexV2();
  let indexedDbBytes = 0;
  let manualSlotCount = 0;
  let autoSlotCount = 0;

  for (const [cid, item] of Object.entries(idxMap)) {
    const kind = inferSlotKind(cid, item.slotKind);
    if (kind === 'manual') manualSlotCount++;
    else autoSlotCount++;
    const bytes = item.compressedBytes ?? memorySlotBytes.get(cid) ?? perSlotBytes[cid] ?? 0;
    if (bytes > 0) {
      perSlotBytes[cid] = bytes;
      indexedDbBytes += bytes;
    }
  }

  let autoBackupCount = 0;
  for (const list of memoryAutoBackupsCache.values()) {
    autoBackupCount += list.length;
    for (const rec of list) {
      indexedDbBytes += rec.compressedBytes;
    }
  }

  return {
    storageBackend: hasIndexedDb() ? 'IndexedDB + 압축' : 'LocalStorage + 압축',
    indexedDbAvailable: hasIndexedDb(),
    indexedDbBytes,
    localStorageBytes,
    localStorageEstimatedLimitBytes: 5 * 1024 * 1024,
    browserUsageBytes: null,
    browserQuotaBytes: null,
    totalSlotCount: manualSlotCount + autoSlotCount,
    manualSlotCount,
    autoSlotCount,
    autoBackupCount,
    maxAutoBackupsPerCareer: MAX_AUTO_SAVE_BACKUPS,
    perSlotBytes,
  };
}

export async function getStorageUsageReport(): Promise<StorageUsageReport> {
  const base = getSyncStorageUsageSnapshot();

  // Read exact byte sizes from IndexedDB if available
  const db = await openCareerIdb();
  if (db) {
    let idbTotalBytes = 0;
    const idbPerSlot: Record<string, number> = { ...base.perSlotBytes };
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_CAREERS, 'readonly');
        const req = tx.objectStore(IDB_STORE_CAREERS).getAll();
        req.onsuccess = () => {
          for (const row of (req.result ?? []) as unknown[]) {
            const obj = row as Partial<IdbCompressedCareerRecord> & { careerId?: string };
            if (!obj || !obj.careerId) continue;
            const bytes =
              typeof obj.compressedBytes === 'number'
                ? obj.compressedBytes
                : typeof obj.payload === 'string'
                  ? byteLengthUtf16(obj.payload)
                  : byteLengthUtf16(JSON.stringify(row));
            idbPerSlot[obj.careerId] = bytes;
            idbTotalBytes += bytes;
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });

    let idbBackupCount = 0;
    if (db.objectStoreNames.contains(IDB_STORE_AUTO_BACKUPS)) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE_AUTO_BACKUPS, 'readonly');
          const req = tx.objectStore(IDB_STORE_AUTO_BACKUPS).getAll();
          req.onsuccess = () => {
            for (const rec of (req.result ?? []) as AutoBackupRecord[]) {
              if (!rec) continue;
              idbBackupCount++;
              const fallbackBytes =
                typeof rec.payload === 'string'
                  ? byteLengthUtf16(rec.payload)
                  : rec.payload instanceof Uint8Array
                    ? rec.payload.byteLength
                    : 0;
              idbTotalBytes += rec.compressedBytes ?? fallbackBytes;
            }
            resolve();
          };
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    base.indexedDbBytes = idbTotalBytes;
    base.perSlotBytes = idbPerSlot;
    base.autoBackupCount = Math.max(base.autoBackupCount, idbBackupCount);
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number') base.browserUsageBytes = est.usage;
      if (typeof est.quota === 'number') base.browserQuotaBytes = est.quota;
    }
  } catch {
    // ignore estimate restriction
  }

  return base;
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function exportCareerJson(career: CareerSave): string {
  return JSON.stringify(sanitizeCareerForStorage(career), null, 2);
}

export function importCareerJson(rawJson: string): CareerSave {
  const trimmedInput = rawJson.trim();
  const decodedText = decompressSavePayload(trimmedInput) ?? trimmedInput;
  const parsed = JSON.parse(decodedText) as Partial<CareerSave>;
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

  // Assign an isolated manual careerId on import so existing preserved saves are never overwritten
  const baseId = parsed.careerId ? getBaseCareerId(parsed.careerId) : 'career_import';
  const safeId = `${MANUAL_SLOT_PREFIX}${baseId}_imp_${Date.now()}`;
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
  ensureBenchCoachesInPlace(imported);
  ensureLeagueAcquisitionsInPlace(imported);
  sanitizePlayerAgeAndServiceYearsInPlace(imported.players, imported.season);
  sanitizeCareerOvrPotInPlace(imported);
  saveCareer(imported, undefined, { mode: 'manual', skipAutoBackup: true });
  return imported;
}

/**
 * 테스트 전용: 내부 메모리 캐시 초기화 (브라우저 런타임에서는 호출하지 않음)
 */
export function __resetStorageMemoryCacheForTests(): void {
  if (pendingIdbFlushTimer !== null) {
    clearTimeout(pendingIdbFlushTimer);
    pendingIdbFlushTimer = null;
  }
  pendingIdbSaveTasks.clear();
  memoryCareersCache.clear();
  memoryAutoBackupsCache.clear();
  memoryAutoBackupSnapshotsCache.clear();
  memorySlotBytes.clear();
  memoryCompressedCache.clear();
  legacyMigrated = false;
  lastSaveErrorMessage = null;
  cachedCareerIdbPromise = null;
}
