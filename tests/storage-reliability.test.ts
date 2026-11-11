import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceDatabase } from '../src/storage/database';
import { migrateLegacyUiPreferences, LEGACY_UI_PREFERENCES } from '../src/storage/preferences';
import { collectDescendantIds } from '../src/storage/tree';
import { disposePdfResources } from '../src/pdf/lifecycle';

const databases: WorkspaceDatabase[] = [];
function database() {
  const db = new WorkspaceDatabase(`reliability-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}
afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => { db.close(); await db.delete(); }));
});

describe('UI preference persistence', () => {
  it('migrates validated legacy values into Dexie and removes old keys only after commit', async () => {
    const db = database();
    await db.open();
    const values = new Map([
      [LEGACY_UI_PREFERENCES.appZoom, '1.2'],
      [LEGACY_UI_PREFERENCES.editorFontSize, '18'],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => { values.delete(key); },
    };
    await expect(migrateLegacyUiPreferences(db, storage)).resolves.toEqual({ appZoom: 1.2, editorFontSize: 18 });
    expect(await db.preferences.get('appZoom')).toMatchObject({ value: 1.2 });
    expect(await db.preferences.get('editorFontSize')).toMatchObject({ value: 18 });
    expect(values.size).toBe(0);
  });

  it('ignores out-of-range legacy values and preserves already migrated Dexie values', async () => {
    const db = database();
    await db.open();
    await db.preferences.put({ key: 'appZoom', value: 1.1, updatedAt: Date.now() });
    const values = new Map([[LEGACY_UI_PREFERENCES.appZoom, '99'], [LEGACY_UI_PREFERENCES.editorFontSize, '8']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key); } };
    await expect(migrateLegacyUiPreferences(db, storage)).resolves.toEqual({ appZoom: 1.1, editorFontSize: 14 });
  });
});

describe('folder hierarchy traversal', () => {
  it('collects deep descendants without repeated full-tree scans', () => {
    const folders = [
      { id: 'root', parentFolderId: null },
      { id: 'a', parentFolderId: 'root' },
      { id: 'b', parentFolderId: 'a' },
      { id: 'c', parentFolderId: 'root' },
      { id: 'unrelated', parentFolderId: null },
    ];
    expect(new Set(collectDescendantIds(folders, 'root'))).toEqual(new Set(['root', 'a', 'b', 'c']));
  });

  it('terminates safely when imported metadata contains a hierarchy cycle', () => {
    const folders = [
      { id: 'root', parentFolderId: 'child' },
      { id: 'child', parentFolderId: 'root' },
      { id: 'other', parentFolderId: null },
    ];
    expect(new Set(collectDescendantIds(folders, 'root'))).toEqual(new Set(['root', 'child']));
  });
});

describe('PDF resource lifecycle', () => {
  it('cancels active render tasks, clears references, and destroys the loading task once', () => {
    const cancelA = vi.fn();
    const cancelB = vi.fn();
    const destroyLoading = vi.fn();
    const destroyDocument = vi.fn();
    const tasks = new Map([[1, { cancel: cancelA }], [2, { cancel: cancelB }]]);
    disposePdfResources(tasks, { destroy: destroyLoading }, { destroy: destroyDocument });
    expect(cancelA).toHaveBeenCalledOnce();
    expect(cancelB).toHaveBeenCalledOnce();
    expect(tasks.size).toBe(0);
    expect(destroyLoading).toHaveBeenCalledOnce();
    expect(destroyDocument).not.toHaveBeenCalled();
  });

  it('destroys an already loaded document when no loading task remains', () => {
    const destroy = vi.fn();
    disposePdfResources(new Map(), null, { destroy });
    expect(destroy).toHaveBeenCalledOnce();
  });
});
