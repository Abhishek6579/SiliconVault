import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceDatabase } from '../src/storage/database';
import { loadWorkspaceCatalog } from '../src/storage/workspaceCatalog';

const databases: WorkspaceDatabase[] = [];
function createDatabase() {
  const database = new WorkspaceDatabase(`workspace-catalog-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => { database.close(); await database.delete(); }));
});

describe('workspace catalog storage', () => {
  it('loads metadata tables without loading document content', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    await database.files.add({
      id: 'file-1', workspaceId: 'workspace-1', kind: 'markdown', name: 'note.md',
      parentFolderId: null, projectId: null, size: 8, mimeType: 'text/markdown',
      createdAt: now, updatedAt: now, deletedAt: null,
    });
    await database.contents.add({ fileId: 'file-1', data: '# note' });

    const catalog = await loadWorkspaceCatalog(database);

    expect(catalog.files.map(({ id, name }) => ({ id, name }))).toEqual([{ id: 'file-1', name: 'note.md' }]);
    expect(catalog).not.toHaveProperty('contents');
    expect(catalog).not.toHaveProperty('data');
  });
});
