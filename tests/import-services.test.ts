import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORKSPACE_ID, WorkspaceDatabase } from '../src/storage/database';
import { createFolder } from '../src/storage/hierarchy';
import { importFiles } from '../src/services/importFiles';
import { importFolder } from '../src/services/importFolder';
import type { FileMeta } from '../src/storage/types';

const databases: WorkspaceDatabase[] = [];
function createDatabase() {
  const database = new WorkspaceDatabase(`service-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await database.delete();
  }));
});

describe('file import services', () => {
  it('reconstructs nested folders across Windows and POSIX separators and reuses them', async () => {
    const database = createDatabase();
    await database.open();
    const files = [new File(['a'], 'a.md'), new File(['b'], 'b.md')];
    const paths = new Map([[files[0], 'Designs\\Nested\\a.md'], [files[1], 'designs/NESTED/b.md']]);
    const first = await importFolder(
      database,
      files,
      { folderId: null, projectId: null, workspaceId: DEFAULT_WORKSPACE_ID },
      (file) => paths.get(file)!,
    );
    expect(first.imported).toBe(2);
    expect((await database.folders.toArray()).map((folder) => folder.name).sort()).toEqual(['Designs', 'Nested']);
    const nested = (await database.folders.toArray()).find((folder) => folder.name === 'Nested')!;
    expect((await database.files.toArray()).map((file) => file.parentFolderId)).toEqual([nested.id, nested.id]);

    const third = new File(['c'], 'c.md');
    await importFolder(
      database,
      [third],
      { folderId: null, projectId: null, workspaceId: DEFAULT_WORKSPACE_ID },
      () => 'designs/nested/c.md',
    );
    expect(await database.folders.count()).toBe(2);
    expect(await database.files.count()).toBe(3);
  });

  it('opens only file kinds supported by the shared workspace tabs', async () => {
    const database = createDatabase();
    await database.open();
    const folder = await createFolder(database, 'Inbox');
    const openFile = vi.fn(async (_file: FileMeta) => undefined);
    const imported = await importFiles(
      database,
      [new File(['note'], 'note.md'), new File(['data'], 'data.bin')],
      { folderId: folder.id, projectId: null, workspaceId: DEFAULT_WORKSPACE_ID },
      openFile,
    );
    expect(imported).toBe(2);
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(openFile.mock.calls[0][0]).toMatchObject({ name: 'note.md', kind: 'markdown', parentFolderId: folder.id });
    expect((await database.files.toArray()).every((file) => file.parentFolderId === folder.id)).toBe(true);
  });
});
