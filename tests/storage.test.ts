import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_ID, WorkspaceDatabase, WorkspaceDatabaseV1, WorkspaceDatabaseV2 } from '../src/storage/database';
import { exportBackup, importBackup } from '../src/storage/backup';
import { createFolder, deleteWorkspace, moveFile, moveFolder, softDeleteProject } from '../src/storage/hierarchy';
import { createTextFile, emptyTrash, kindForFile, restoreFile, saveFileText, softDeleteFile } from '../src/storage/files';

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

describe('file format classification', () => {
  it('keeps ordinary text and structured text files editable', () => {
    for (const name of ['notes.txt', 'build.log', 'settings.ini', 'config.conf', '.env', 'data.json', 'layout.xml', 'params.yaml', 'params.yml', 'settings.toml']) expect(kindForFile(name)).toBe('text');
    for (const name of ['design.v', 'design.sv', 'header.vh', 'header.svh']) expect(kindForFile(name)).toBe('code');
  });
  it('routes image, tabular, office, and non-editable engineering formats to read-only viewers', () => {
    for (const name of ['plot.png', 'photo.jpeg', 'vector.svg', 'table.csv', 'table.tsv', 'report.docx', 'slides.pptx', 'book.xlsx', 'trace.vcd', 'trace.fst', 'amp.sp', 'amp.cir', 'models.lib', 'chip.gds', 'chip.gdsii', 'board.kicad_pcb', 'sheet.kicad_sch']) expect(kindForFile(name)).toBe('viewer');
  });
  it('preserves PDF, Markdown, and general code classifications', () => {
    expect(kindForFile('manual.pdf')).toBe('pdf');
    expect(kindForFile('notes.md')).toBe('markdown');
    expect(kindForFile('main.c')).toBe('code');
    expect(kindForFile('unknown.bin')).toBe('other');
  });
});

describe('workspace storage', () => {
  it('creates the unified metadata tables and indexes for a fresh database', async () => {
    const database = createDatabase();
    await database.open();
    expect(database.tables.map((table) => table.name).sort()).toEqual(['contents', 'files', 'folders', 'preferences', 'projects', 'workspaces']);
    expect(await database.workspaces.get(DEFAULT_WORKSPACE_ID)).toMatchObject({ name: 'My Workspace' });
    expect(database.files.schema.indexes.map((index) => index.name)).toContain('updatedAt');
  });

  it('round-trips text and binary content while preserving all metadata', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    const files = [
      { id: 'note-1', kind: 'markdown' as const, name: 'Notes', parentFolderId: null, projectId: null, workspaceId: DEFAULT_WORKSPACE_ID,
        size: 4, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null },
      { id: 'pdf-1', kind: 'pdf' as const, name: 'Spec', parentFolderId: null, projectId: null, workspaceId: DEFAULT_WORKSPACE_ID,
        size: 3, mimeType: 'application/pdf', createdAt: now, updatedAt: now, deletedAt: null },
    ];
    await database.files.bulkAdd(files);
    await database.contents.bulkAdd([
      { fileId: 'note-1', data: 'test' },
      { fileId: 'pdf-1', data: new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }) },
    ]);
    await database.folders.add({ id: 'folder-1', name: 'Research', parentFolderId: null, projectId: null, workspaceId: DEFAULT_WORKSPACE_ID, createdAt: now, updatedAt: now });
    await database.projects.add({ id: 'project-1', name: 'Study', workspaceId: DEFAULT_WORKSPACE_ID, archived: false, createdAt: now, updatedAt: now });
    await database.preferences.add({ key: 'theme', value: 'dark', updatedAt: now });

    const expected = {
      files: await database.files.toArray(),
      contents: await database.contents.toArray(),
      folders: await database.folders.toArray(),
      projects: await database.projects.toArray(),
      preferences: await database.preferences.toArray(),
      workspaces: await database.workspaces.toArray(),
    };
    const backup = await exportBackup(database);
    expect(backup.files.map((file) => file.sha256)).toHaveLength(2);

    await database.files.clear();
    await database.contents.clear();
    await database.folders.clear();
    await database.projects.clear();
    await database.preferences.clear();
    await database.workspaces.clear();
    await importBackup(database, backup);

    expect(await database.files.toArray()).toEqual(expected.files);
    expect(await database.contents.toArray()).toEqual(expected.contents);
    expect(await database.folders.toArray()).toEqual(expected.folders);
    expect(await database.projects.toArray()).toEqual(expected.projects);
    expect(await database.preferences.toArray()).toEqual(expected.preferences);
    expect(await database.workspaces.toArray()).toEqual(expected.workspaces);
  });

  it('rejects an invalid version and checksum before changing stored data', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    await database.projects.add({ id: 'keep', name: 'Keep', workspaceId: DEFAULT_WORKSPACE_ID, archived: false, createdAt: now, updatedAt: now });
    await database.files.add({ id: 'f1', kind: 'markdown', name: 'Note', parentFolderId: null, projectId: null, workspaceId: DEFAULT_WORKSPACE_ID, size: 4, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null });
    await database.contents.add({ fileId: 'f1', data: 'text' });
    const backup = await exportBackup(database);
    const bad = { ...backup, version: 999 };
    await expect(importBackup(database, { ...bad, version: 999 })).rejects.toThrow('unsupported version');
    const corrupt = structuredClone(backup);
    corrupt.files[0].sha256 = 'bad-checksum';
    await expect(importBackup(database, corrupt)).rejects.toThrow('Checksum validation failed');
    expect(await database.projects.toArray()).toEqual([{ id: 'keep', name: 'Keep', workspaceId: DEFAULT_WORKSPACE_ID, archived: false, createdAt: now, updatedAt: now }]);
    expect(await database.contents.get('f1')).toEqual({ fileId: 'f1', data: 'text' });
  });

  it('moves a folder subtree atomically and rejects cycles and project mismatches', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    await database.projects.bulkAdd([
      { id: 'p1', name: 'One', workspaceId: DEFAULT_WORKSPACE_ID, archived: false, createdAt: now, updatedAt: now },
      { id: 'p2', name: 'Two', workspaceId: DEFAULT_WORKSPACE_ID, archived: false, createdAt: now, updatedAt: now },
    ]);
    const root = await createFolder(database, 'Root', null, 'p1');
    const child = await createFolder(database, 'Child', root.id);
    await database.files.add({ id: 'f1', kind: 'code', name: 'top.sv', parentFolderId: root.id, projectId: 'p1', workspaceId: DEFAULT_WORKSPACE_ID, size: 0, mimeType: 'text/plain', createdAt: now, updatedAt: now, deletedAt: null });
    await database.files.add({ id: 'f2', kind: 'code', name: 'child.sv', parentFolderId: child.id, projectId: 'p1', workspaceId: DEFAULT_WORKSPACE_ID, size: 0, mimeType: 'text/plain', createdAt: now, updatedAt: now, deletedAt: null });

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
    await database.projects.add({ id: 'p1', name: 'One', workspaceId: DEFAULT_WORKSPACE_ID, archived: false, createdAt: now, updatedAt: now });
    await database.files.add({ id: 'f1', kind: 'markdown', name: 'Note', parentFolderId: null, projectId: 'p1', workspaceId: DEFAULT_WORKSPACE_ID, size: 0, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null });
    await softDeleteProject(database, 'p1');
    expect((await database.files.get('f1'))?.deletedAt).not.toBeNull();
    expect((await database.projects.get('p1'))?.archived).toBe(true);
  });

  it('deletes only the selected workspace and its saved PDF positions', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    const secondWorkspace = { id: 'workspace-second', name: 'Second', createdAt: now, updatedAt: now };
    await database.workspaces.add(secondWorkspace);
    const file = await createTextFile(database, 'reference.pdf', '', { workspaceId: secondWorkspace.id, kind: 'pdf' });
    await database.preferences.put({ key: `pdf:${file.id}`, value: { page: 12, zoom: 1, fit: true }, updatedAt: now });
    await database.preferences.put({ key: 'activeWorkspace', value: secondWorkspace.id, updatedAt: now });

    const next = await deleteWorkspace(database, secondWorkspace.id);
    expect(next.id).toBe(DEFAULT_WORKSPACE_ID);
    expect(await database.files.get(file.id)).toBeUndefined();
    expect(await database.contents.get(file.id)).toBeUndefined();
    expect(await database.preferences.get(`pdf:${file.id}`)).toBeUndefined();
    expect(await database.preferences.get('activeWorkspace')).toMatchObject({ value: DEFAULT_WORKSPACE_ID });
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

  it('upgrades a version 1 fixture without changing existing records', async () => {
    const name = `fixture-${crypto.randomUUID()}`;
    const legacy = new WorkspaceDatabaseV1(name);
    await legacy.open();
    const now = Date.now();
    await legacy.projects.add({ id: 'legacy-project', name: 'Legacy project', archived: false, createdAt: now, updatedAt: now } as never);
    await legacy.folders.add({ id: 'legacy-folder', name: 'Legacy folder', parentFolderId: null, projectId: 'legacy-project', createdAt: now, updatedAt: now } as never);
    await legacy.files.add({ id: 'legacy-file', kind: 'markdown', name: 'legacy.md', parentFolderId: 'legacy-folder', projectId: 'legacy-project', size: 6, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null } as never);
    await legacy.contents.add({ fileId: 'legacy-file', data: 'legacy' });
    const preUpgradeBackup = await exportBackup(legacy);
    expect(preUpgradeBackup.files[0].meta.id).toBe('legacy-file');
    legacy.close();

    const upgraded = new WorkspaceDatabase(name);
    databases.push(upgraded);
    await upgraded.open();
    expect(await upgraded.projects.get('legacy-project')).toMatchObject({ name: 'Legacy project' });
    expect(await upgraded.folders.get('legacy-folder')).toMatchObject({ projectId: 'legacy-project' });
    expect(await upgraded.files.get('legacy-file')).toMatchObject({ id: 'legacy-file', size: 6 });
    expect(await upgraded.contents.get('legacy-file')).toEqual({ fileId: 'legacy-file', data: 'legacy' });
    expect(await upgraded.preferences.count()).toBe(0);
  });

  it('upgrades a version 2 fixture into an isolated default workspace', async () => {
    const name = `fixture-v2-${crypto.randomUUID()}`;
    const legacy = new WorkspaceDatabaseV2(name);
    await legacy.open();
    const now = Date.now();
    await legacy.projects.add({ id: 'v2-project', name: 'Version two', archived: false, createdAt: now, updatedAt: now } as never);
    await legacy.files.add({ id: 'v2-file', kind: 'markdown', name: 'v2.md', parentFolderId: null, projectId: 'v2-project', size: 3, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null } as never);
    await legacy.contents.add({ fileId: 'v2-file', data: 'v2!' });
    await legacy.preferences.add({ key: 'theme', value: 'dark', updatedAt: now });
    legacy.close();

    const upgraded = new WorkspaceDatabase(name);
    databases.push(upgraded);
    await upgraded.open();
    expect(await upgraded.workspaces.get(DEFAULT_WORKSPACE_ID)).toMatchObject({ name: 'My Workspace' });
    expect(await upgraded.projects.get('v2-project')).toMatchObject({ workspaceId: DEFAULT_WORKSPACE_ID });
    expect(await upgraded.files.get('v2-file')).toMatchObject({ workspaceId: DEFAULT_WORKSPACE_ID });
    expect(await upgraded.contents.get('v2-file')).toEqual({ fileId: 'v2-file', data: 'v2!' });
    expect(await upgraded.preferences.get('theme')).toMatchObject({ value: 'dark' });
  });
});
