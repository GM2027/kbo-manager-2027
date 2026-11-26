import { PreGameEditorStore } from '../types/kbo';

const PREGAME_EDITOR_STORAGE_KEY = 'kbo_gm_2027_pregame_editor_v1';

export function createEmptyPreGameEditorStore(): PreGameEditorStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    playerPatches: {},
    createdPlayers: [],
    overseasPatches: {},
    overseasReturnedToKbo: {},
    clubCashOverrides: {},
    clubBudgetCapOverrides: {},
    clubFacilityOverrides: {},
    history: [],
  };
}

export function loadPreGameEditorStore(): PreGameEditorStore {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createEmptyPreGameEditorStore();
  }
  try {
    const raw = window.localStorage.getItem(PREGAME_EDITOR_STORAGE_KEY);
    if (!raw) return createEmptyPreGameEditorStore();
    const parsed = JSON.parse(raw) as Partial<PreGameEditorStore>;
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      playerPatches: parsed.playerPatches ?? {},
      createdPlayers: Array.isArray(parsed.createdPlayers) ? parsed.createdPlayers : [],
      overseasPatches: parsed.overseasPatches ?? {},
      overseasReturnedToKbo: parsed.overseasReturnedToKbo ?? {},
      clubCashOverrides: parsed.clubCashOverrides ?? {},
      clubBudgetCapOverrides: parsed.clubBudgetCapOverrides ?? {},
      clubFacilityOverrides: parsed.clubFacilityOverrides ?? {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return createEmptyPreGameEditorStore();
  }
}

export function savePreGameEditorStore(store: PreGameEditorStore): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload: PreGameEditorStore = {
      ...store,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(PREGAME_EDITOR_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota errors cleanly
  }
}

export function resetPreGameEditorStore(): PreGameEditorStore {
  const empty = createEmptyPreGameEditorStore();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(PREGAME_EDITOR_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return empty;
}

export function countPreGameEditorChanges(store: PreGameEditorStore): number {
  return (
    Object.keys(store.playerPatches).length +
    store.createdPlayers.length +
    Object.keys(store.overseasPatches).length +
    Object.keys(store.clubCashOverrides).length +
    Object.keys(store.clubBudgetCapOverrides).length +
    Object.keys(store.clubFacilityOverrides).length
  );
}
