import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceDatabase } from '../src/storage/database';
import { restoreWorkspaceSession, saveWorkspaceSession, workspaceSessionKey } from '../src/storage/tabSession';
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
