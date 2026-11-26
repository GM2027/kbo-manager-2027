/**
 * 선수 프로필 이미지 전용 영구 캐시 스토리지 (In-Memory LRU + IndexedDB)
 * - 동일 선수의 AI 프로필 이미지 중복 생성을 원천 차단하고, CareerSave JSON 용량 증가를 0으로 유지합니다.
 * - 키 형식: `${permanentIdentityKey}::${uniformKey}::v1` (이적 시 유니폼 키만 변경되어 동일 얼굴 + 새 유니폼 캐싱)
 */

const IDB_NAME = 'kbo_gm_2027_portraits_idb_v1';
const IDB_STORE = 'portraits';
const MAX_MEMORY_ENTRIES = 250;

const memoryCache = new Map<string, string>();
const inFlightCache = new Map<string, Promise<string>>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openPortraitDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function setMemoryEntry(key: string, dataUrl: string): void {
  if (memoryCache.has(key)) {
    memoryCache.delete(key);
  }
  memoryCache.set(key, dataUrl);
  if (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
}

export function getMemoryCachedPortrait(key: string): string | null {
  return memoryCache.get(key) ?? null;
}

export async function getCachedPortrait(key: string): Promise<string | null> {
  const mem = memoryCache.get(key);
  if (mem) return mem;

  const db = await openPortraitDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as { key: string; dataUrl: string } | undefined;
        if (row?.dataUrl) {
          setMemoryEntry(key, row.dataUrl);
          resolve(row.dataUrl);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putCachedPortrait(key: string, dataUrl: string): Promise<void> {
  setMemoryEntry(key, dataUrl);
  const db = await openPortraitDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({
        key,
        dataUrl,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * 캐시 조회 후 미존재 시에만 1회 생성·영구 저장하며, 동시 호출 시 중복 생성을 차단합니다.
 */
export async function getOrCreateCachedPortrait(
  key: string,
  generator: () => string | Promise<string>
): Promise<{ dataUrl: string; fromCache: boolean }> {
  const mem = memoryCache.get(key);
  if (mem) return { dataUrl: mem, fromCache: true };

  const existingPromise = inFlightCache.get(key);
  if (existingPromise) {
    const dataUrl = await existingPromise;
    return { dataUrl, fromCache: true };
  }

  let cacheHit = false;
  const task = (async () => {
    const stored = await getCachedPortrait(key);
    if (stored) {
      cacheHit = true;
      return stored;
    }
    const created = await generator();
    await putCachedPortrait(key, created);
    return created;
  })();

  inFlightCache.set(key, task);
  try {
    const dataUrl = await task;
    return { dataUrl, fromCache: cacheHit };
  } finally {
    inFlightCache.delete(key);
  }
}

export function clearMemoryPortraitCacheForPrefix(identityKey: string): void {
  const prefix = `${identityKey}::`;
  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(prefix)) {
      memoryCache.delete(k);
    }
  }
}

export function getPortraitMemoryCacheSize(): number {
  return memoryCache.size;
}
