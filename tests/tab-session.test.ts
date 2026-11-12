import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceDatabase } from '../src/storage/database';
import { hydrateWorkspaceTab, loadEditorViewState, restoreWorkspaceSession, saveWorkspaceSession, workspaceSessionKey } from '../src/storage/tabSession';
import type { FileMeta } from '../src/storage/types';

const databases: WorkspaceDatabase[] = [];
function createDatabase() {
  const database = new WorkspaceDatabase(`tab-session-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}
function file(id: string, workspaceId: string, deletedAt: number | null = null): FileMeta {
  const now = Date.now();
  return { id, workspaceId, kind: 'markdown', name: `${id}.md`, parentFolderId: null, projectId: null, size: 0, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt };
}
afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => { database.close(); await database.delete(); }));
});

describe('workspace tab sessions', () => {
  it('persists ordered IDs and the selected active file without document contents', async () => {
    const database = createDatabase();
    await database.open();
    await database.files.bulkAdd([file('a', 'workspace-a'), file('b', 'workspace-a')]);
    const session = await saveWorkspaceSession(database, 'workspace-a', ['a', 'b', 'a'], 'a');
    expect(session.openFileIds).toEqual(['a', 'b']);
    expect(session.activeFileId).toBe('a');
    const stored = await database.preferences.get(workspaceSessionKey('workspace-a'));
    expect(stored?.value).toEqual(session);
    expect(JSON.stringify(stored?.value)).not.toContain('draft');
    expect(JSON.stringify(stored?.value)).not.toContain('contents');
  });

  it('restores tabs in order and repairs missing, deleted, and cross-workspace references', async () => {
    const database = createDatabase();
    await database.open();
    await database.files.bulkAdd([
      file('first', 'workspace-a'),
      file('deleted', 'workspace-a', Date.now()),
      file('foreign', 'workspace-b'),
      file('last', 'workspace-a'),
    ]);
    await database.preferences.put({
      key: workspaceSessionKey('workspace-a'),
      value: { workspaceId: 'workspace-a', openFileIds: ['first', 'deleted', 'missing', 'foreign', 'last'], activeFileId: 'deleted', updatedAt: Date.now() },
      updatedAt: Date.now(),
    });
    const restored = await restoreWorkspaceSession(database, 'workspace-a');
    expect(restored.tabs.map((tab) => tab.id)).toEqual(['first', 'last']);
    expect(restored.activeTabId).toBe('last');
    expect(restored.tabs.every((tab) => tab.data === undefined && tab.draft === '')).toBe(true);
    const repaired = await database.preferences.get(workspaceSessionKey('workspace-a'));
    expect(repaired?.value).toMatchObject({ openFileIds: ['first', 'last'], activeFileId: 'last' });
  });

  it('keeps sessions isolated by workspace and restores an empty session safely', async () => {
    const database = createDatabase();
    await database.open();
    await database.files.bulkAdd([file('a', 'workspace-a'), file('b', 'workspace-b')]);
    await saveWorkspaceSession(database, 'workspace-a', ['a'], 'a');
    await saveWorkspaceSession(database, 'workspace-b', ['b'], 'b');
    const a = await restoreWorkspaceSession(database, 'workspace-a');
    const b = await restoreWorkspaceSession(database, 'workspace-b');
    expect(a.tabs.map((tab) => tab.id)).toEqual(['a']);
    expect(b.tabs.map((tab) => tab.id)).toEqual(['b']);
    expect((await restoreWorkspaceSession(database, 'missing-workspace')).tabs).toEqual([]);
  });

  it('falls back to the last valid tab when the stored active ID is invalid', async () => {
    const database = createDatabase();
    await database.open();
    await database.files.bulkAdd([file('a', 'workspace-a'), file('b', 'workspace-a')]);
    await database.preferences.put({
      key: workspaceSessionKey('workspace-a'),
      value: { workspaceId: 'workspace-a', openFileIds: ['a', 'b'], activeFileId: 'removed', updatedAt: Date.now() },
      updatedAt: Date.now(),
    });
    const restored = await restoreWorkspaceSession(database, 'workspace-a');
    expect(restored.activeTabId).toBe('b');
  });
});

describe('per-file editor view state', () => {
  it('loads valid cursor, scroll, and preview metadata from Dexie', async () => {
    const database = createDatabase();
    await database.open();
    const state = { anchor: 12, head: 15, scrollTop: 240, scrollLeft: 8, preview: true };
    await database.preferences.put({ key: 'editor:note-1', value: state, updatedAt: Date.now() });
    await expect(loadEditorViewState(database, 'note-1')).resolves.toEqual(state);
  });

  it('rejects malformed editor state instead of applying invalid positions', async () => {
    const database = createDatabase();
    await database.open();
    await database.preferences.put({ key: 'editor:note-1', value: { anchor: -1, head: 3, scrollTop: 0, scrollLeft: 0, preview: false }, updatedAt: Date.now() });
    await expect(loadEditorViewState(database, 'note-1')).resolves.toBeUndefined();
  });
});

describe('tab hydration and draft recovery', () => {
  it('hydrates only the selected tab and restores its unsaved draft and PDF/editor positions', async () => {
    const database = createDatabase();
    await database.open();
    await database.files.add(file('note', 'workspace-a'));
    await database.contents.add({ fileId: 'note', data: '# Saved content' });
    await database.preferences.put({ key: 'draft:note', value: '# Recovered unsaved content', updatedAt: Date.now() });
    await database.preferences.put({ key: 'editor:note', value: { anchor: 4, head: 9, scrollTop: 120, scrollLeft: 0, preview: true }, updatedAt: Date.now() });
    const placeholder = {
      id: 'note',
      meta: file('note', 'workspace-a'),
      draft: '',
      dirty: false,
      preview: false,
    };
    const hydrated = await hydrateWorkspaceTab(database, placeholder);
    expect(hydrated.draft).toBe('# Recovered unsaved content');
    expect(hydrated.dirty).toBe(true);
    expect(hydrated.preview).toBe(true);
    expect(hydrated.editorState).toMatchObject({ anchor: 4, head: 9, scrollTop: 120 });
    expect(hydrated.data).toBe('# Saved content');
  });

  it('rejects hydration when the referenced file content is missing', async () => {
    const database = createDatabase();
    await database.open();
    const placeholder = { id: 'missing', meta: file('missing', 'workspace-a'), draft: '', dirty: false, preview: false };
    await expect(hydrateWorkspaceTab(database, placeholder)).rejects.toThrow('content for');
  });
});
