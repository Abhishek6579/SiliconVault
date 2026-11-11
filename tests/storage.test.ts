import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceDatabase } from '../src/storage/database';
import { exportBackup, importBackup } from '../src/storage/backup';
import { createFolder, moveFile, moveFolder, softDeleteProject } from '../src/storage/hierarchy';
import { createTextFile, emptyTrash, restoreFile, saveFileText, softDeleteFile } from '../src/storage/files';

const databases: WorkspaceDatabase[] = [];
function createDatabase(): WorkspaceDatabase {
  const database = new WorkspaceDatabase(`test-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await database.delete();
  }));
});

describe('workspace storage', () => {
  it('creates the unified metadata tables and indexes for a fresh database', async () => {
    const database = createDatabase();
    await database.open();
    expect(database.tables.map((table) => table.name).sort()).toEqual(['contents', 'files', 'folders', 'projects']);
    expect(database.files.schema.indexes.map((index) => index.name)).toContain('updatedAt');
  });

  it('round-trips text and binary content while preserving all metadata', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    const files = [
      { id: 'note-1', kind: 'markdown' as const, name: 'Notes', parentFolderId: null, projectId: null,
        size: 4, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null },
      { id: 'pdf-1', kind: 'pdf' as const, name: 'Spec', parentFolderId: null, projectId: null,
        size: 3, mimeType: 'application/pdf', createdAt: now, updatedAt: now, deletedAt: null },
    ];
    await database.files.bulkAdd(files);
    await database.contents.bulkAdd([
      { fileId: 'note-1', data: 'test' },
      { fileId: 'pdf-1', data: new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }) },
    ]);
    await database.folders.add({ id: 'folder-1', name: 'Research', parentFolderId: null, projectId: null, createdAt: now, updatedAt: now });
    await database.projects.add({ id: 'project-1', name: 'Study', archived: false, createdAt: now, updatedAt: now });

    const expected = {
      files: await database.files.toArray(),
      contents: await database.contents.toArray(),
      folders: await database.folders.toArray(),
      projects: await database.projects.toArray(),
    };
    const backup = await exportBackup(database);
    expect(backup.files.map((file) => file.sha256)).toHaveLength(2);

    await database.files.clear();
    await database.contents.clear();
    await database.folders.clear();
    await database.projects.clear();
    await importBackup(database, backup);

    expect(await database.files.toArray()).toEqual(expected.files);
    expect(await database.contents.toArray()).toEqual(expected.contents);
    expect(await database.folders.toArray()).toEqual(expected.folders);
    expect(await database.projects.toArray()).toEqual(expected.projects);
  });

  it('rejects an invalid version and checksum before changing stored data', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    await database.projects.add({ id: 'keep', name: 'Keep', archived: false, createdAt: now, updatedAt: now });
    await database.files.add({ id: 'f1', kind: 'markdown', name: 'Note', parentFolderId: null, projectId: null, size: 4, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null });
    await database.contents.add({ fileId: 'f1', data: 'text' });
    const backup = await exportBackup(database);
    const bad = { ...backup, version: 999 };
    await expect(importBackup(database, { ...bad, version: 999 })).rejects.toThrow('unsupported version');
    const corrupt = structuredClone(backup);
    corrupt.files[0].sha256 = 'bad-checksum';
    await expect(importBackup(database, corrupt)).rejects.toThrow('Checksum validation failed');
    expect(await database.projects.toArray()).toEqual([{ id: 'keep', name: 'Keep', archived: false, createdAt: now, updatedAt: now }]);
    expect(await database.contents.get('f1')).toEqual({ fileId: 'f1', data: 'text' });
  });

  it('moves a folder subtree atomically and rejects cycles and project mismatches', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    await database.projects.bulkAdd([
      { id: 'p1', name: 'One', archived: false, createdAt: now, updatedAt: now },
      { id: 'p2', name: 'Two', archived: false, createdAt: now, updatedAt: now },
    ]);
    const root = await createFolder(database, 'Root', null, 'p1');
    const child = await createFolder(database, 'Child', root.id);
    await database.files.add({ id: 'f1', kind: 'code', name: 'top.sv', parentFolderId: root.id, projectId: 'p1', size: 0, mimeType: 'text/plain', createdAt: now, updatedAt: now, deletedAt: null });
    await database.files.add({ id: 'f2', kind: 'code', name: 'child.sv', parentFolderId: child.id, projectId: 'p1', size: 0, mimeType: 'text/plain', createdAt: now, updatedAt: now, deletedAt: null });

    await expect(moveFolder(database, root.id, child.id)).rejects.toThrow('own subtree');
    await expect(moveFolder(database, child.id, null, 'p2')).resolves.toBeUndefined();
    expect((await database.folders.get(child.id))?.projectId).toBe('p2');
    expect((await database.files.get('f2'))?.projectId).toBe('p2');
    await expect(moveFile(database, 'f1', child.id, 'p1')).rejects.toThrow('same project');
    expect((await database.files.get('f1'))?.projectId).toBe('p1');
  });

  it('soft-deletes a project’s files', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    await database.projects.add({ id: 'p1', name: 'One', archived: false, createdAt: now, updatedAt: now });
    await database.files.add({ id: 'f1', kind: 'markdown', name: 'Note', parentFolderId: null, projectId: 'p1', size: 0, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null });
    await softDeleteProject(database, 'p1');
    expect((await database.files.get('f1'))?.deletedAt).not.toBeNull();
    expect((await database.projects.get('p1'))?.archived).toBe(true);
  });

  it('creates, autosaves, restores, and permanently clears files', async () => {
    const database = createDatabase();
    await database.open();
    const file = await createTextFile(database, 'draft.md', 'first draft', { kind: 'markdown' });
    await saveFileText(database, file.id, 'saved after editing');
    expect((await database.contents.get(file.id))?.data).toBe('saved after editing');
    await softDeleteFile(database, file.id);
    expect((await database.files.get(file.id))?.deletedAt).not.toBeNull();
    await restoreFile(database, file.id);
    expect((await database.files.get(file.id))?.deletedAt).toBeNull();
    await softDeleteFile(database, file.id);
    await emptyTrash(database);
    expect(await database.files.get(file.id)).toBeUndefined();
    expect(await database.contents.get(file.id)).toBeUndefined();
  });
});
