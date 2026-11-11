import type { WorkspaceDatabase } from './database';

export const LEGACY_UI_PREFERENCES = {
  appZoom: 'silicon-vault-app-zoom',
  editorFontSize: 'silicon-vault-editor-font-size',
} as const;

export interface UiPreferences {
  appZoom: number;
  editorFontSize: number;
}

const DEFAULTS: UiPreferences = { appZoom: 1, editorFontSize: 14 };

function boundedNumber(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/** One-time migration from legacy localStorage keys into the existing Dexie preferences table. */
export async function migrateLegacyUiPreferences(
  database: WorkspaceDatabase,
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
): Promise<UiPreferences> {
  const appZoom = boundedNumber(storage.getItem(LEGACY_UI_PREFERENCES.appZoom), 0.8, 1.4, DEFAULTS.appZoom);
  const editorFontSize = boundedNumber(storage.getItem(LEGACY_UI_PREFERENCES.editorFontSize), 11, 24, DEFAULTS.editorFontSize);
  const [storedZoom, storedFontSize] = await Promise.all([
    database.preferences.get('appZoom'),
    database.preferences.get('editorFontSize'),
  ]);
  const result = {
    appZoom: typeof storedZoom?.value === 'number' && Number.isFinite(storedZoom.value) && storedZoom.value >= 0.8 && storedZoom.value <= 1.4
      ? storedZoom.value : appZoom,
    editorFontSize: typeof storedFontSize?.value === 'number' && Number.isFinite(storedFontSize.value) && storedFontSize.value >= 11 && storedFontSize.value <= 24
      ? storedFontSize.value : editorFontSize,
  };
  const validZoom = typeof storedZoom?.value === 'number' && Number.isFinite(storedZoom.value) && storedZoom.value >= 0.8 && storedZoom.value <= 1.4;
  const validFontSize = typeof storedFontSize?.value === 'number' && Number.isFinite(storedFontSize.value) && storedFontSize.value >= 11 && storedFontSize.value <= 24;
  await database.transaction('rw', database.preferences, async () => {
    if (!validZoom) await database.preferences.put({ key: 'appZoom', value: result.appZoom, updatedAt: Date.now() });
    if (!validFontSize) await database.preferences.put({ key: 'editorFontSize', value: result.editorFontSize, updatedAt: Date.now() });
  });
  // Remove legacy keys only after the Dexie transaction commits.
  storage.removeItem(LEGACY_UI_PREFERENCES.appZoom);
  storage.removeItem(LEGACY_UI_PREFERENCES.editorFontSize);
  return result;
}
