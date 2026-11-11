import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORKSPACE_ID, WorkspaceDatabase, WorkspaceDatabaseV1, WorkspaceDatabaseV2 } from '../src/storage/database';
import { exportBackup, exportBackupStream, importBackup } from '../src/storage/backup';
import { createFolder, deleteWorkspace, moveFile, moveFolder, restoreProject, softDeleteProject } from '../src/storage/hierarchy';
import { createTextFile, emptyTrash, kindForFile, renameFile, restoreFile, saveFileText, softDeleteFile, validateFileName } from '../src/storage/files';
import { flushPendingAutosaves } from '../src/storage/autosave';

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

describe('file rename validation', () => {
  it('rejects unsafe names and extension changes that would misclassify stored content', () => {
    for (const name of ['', ' note.md', 'note.md ', '../note.md', 'folder\\note.md', 'bad:name.md', 'CON.txt', 'trailing.']) {
      expect(() => validateFileName(name, 'note.md')).toThrow();
    }
    expect(() => validateFileName('report.pdf', 'report.md')).toThrow(/does not convert/);
    expect(() => validateFileName('note.txt', 'note.md')).toThrow(/does not convert/);
    expect(() => validateFileName('note.md', 'note.md')).not.toThrow();
    expect(() => validateFileName('NOTE.MD', 'note.md')).not.toThrow();
  });

  it('renames a file without changing its stored format classification', async () => {
    const database = createDatabase();
    await database.open();
    const file = await createTextFile(database, 'notes.md', 'text', { kind: 'markdown' });
    await expect(renameFile(database, file.id, 'notes.pdf')).rejects.toThrow(/does not convert/);
    await renameFile(database, file.id, 'engineering-notes.md');
    expect(await database.files.get(file.id)).toMatchObject({ name: 'engineering-notes.md', kind: 'markdown' });
  });
});

describe('autosave shutdown flushing', () => {
  it('cancels debounce timers and awaits every pending draft save', async () => {
    const pending = new Map([['a', 'latest A'], ['b', 'latest B']]);
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    timers.set('a', setTimeout(() => undefined, 60_000));
    timers.set('b', setTimeout(() => undefined, 60_000));
    const saved: string[] = [];
    await flushPendingAutosaves(pending, timers, async (id, draft) => {
      await Promise.resolve();
      saved.push(`${id}:${draft}`);
      pending.delete(id);
    });
    expect(saved.sort()).toEqual(['a:latest A', 'b:latest B']);
    expect(timers.size).toBe(0);
  });

  it('flushes edits that arrive while an earlier save is in progress', async () => {
    const pending = new Map([['a', 'first']]);
    const saved: string[] = [];
    await flushPendingAutosaves(pending, new Map(), async (id, draft) => {
      saved.push(draft);
      if (draft === 'first') pending.set(id, 'latest');
      else pending.delete(id);
    });
    expect(saved).toEqual(['first', 'latest']);
  });

  it('does not report a flush as successful when a save fails', async () => {
    const pending = new Map([['a', 'unsaved']]);
    await expect(flushPendingAutosaves(pending, new Map(), async () => {
      throw new Error('disk write failed');
    })).rejects.toThrow('disk write failed');
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

  it('exports file contents one record at a time instead of materializing the contents table', async () => {
    const database = createDatabase();
    await database.open();
    await createTextFile(database, 'one.txt', 'one');
    await createTextFile(database, 'two.txt', 'two');
    const contentsArray = vi.spyOn(database.contents, 'toArray');
    const contentsGet = vi.spyOn(database.contents, 'get');
    const backup = await exportBackup(database);
    expect(backup.files).toHaveLength(2);
    expect(contentsArray).not.toHaveBeenCalled();
    expect(contentsGet).toHaveBeenCalledTimes(2);
  });

  it('produces a valid streamed backup without retaining a complete backup object', async () => {
    const database = createDatabase();
    await database.open();
    await createTextFile(database, 'streamed.md', 'stream payload', { kind: 'markdown' });
    const stream = exportBackupStream(database);
    const streamed = JSON.parse(await new Response(stream).text()) as Awaited<ReturnType<typeof exportBackup>>;
    expect(streamed.format).toBe('engineering-workspace-backup');
    expect(streamed.files).toHaveLength(1);
    expect(streamed.files[0].content).toMatchObject({ encoding: 'text', value: 'stream payload' });
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

  it('rejects malformed backup metadata and broken references before replacing existing data', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    await database.projects.add({ id: 'keep', name: 'Keep', workspaceId: DEFAULT_WORKSPACE_ID, archived: false, createdAt: now, updatedAt: now });
    const valid = await exportBackup(database);
    const malformed = {
      ...valid,
      files: [{
        meta: { id: 'bad', workspaceId: DEFAULT_WORKSPACE_ID, name: 'bad.txt', kind: 'text', parentFolderId: null, projectId: null,
          size: -1, mimeType: 'text/plain', createdAt: now, updatedAt: now, deletedAt: null },
        content: { encoding: 'text', value: '' }, sha256: '0'.repeat(64),
      }],
    };
    await expect(importBackup(database, malformed)).rejects.toThrow('invalid file record');
    const dangling = { ...valid, folders: [{ id: 'child', workspaceId: DEFAULT_WORKSPACE_ID, name: 'Child', parentFolderId: 'missing', projectId: null, createdAt: now, updatedAt: now }] };
    await expect(importBackup(database, dangling)).rejects.toThrow('folder that does not exist');
    const cyclic = { ...valid, folders: [
      { id: 'a', workspaceId: DEFAULT_WORKSPACE_ID, name: 'A', parentFolderId: 'b', projectId: null, createdAt: now, updatedAt: now },
      { id: 'b', workspaceId: DEFAULT_WORKSPACE_ID, name: 'B', parentFolderId: 'a', projectId: null, createdAt: now, updatedAt: now },
    ] };
    await expect(importBackup(database, cyclic)).rejects.toThrow('hierarchy cycle');
    expect(await database.projects.get('keep')).toBeDefined();
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

  it('restores files hidden by project archival but preserves files already in Trash', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    await database.projects.add({ id: 'p-restore', name: 'Restore me', workspaceId: DEFAULT_WORKSPACE_ID, archived: false, createdAt: now, updatedAt: now });
    await database.files.bulkAdd([
      { id: 'live-before-archive', kind: 'markdown', name: 'live.md', parentFolderId: null, projectId: 'p-restore', workspaceId: DEFAULT_WORKSPACE_ID, size: 0, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null },
      { id: 'already-trashed', kind: 'markdown', name: 'trash.md', parentFolderId: null, projectId: 'p-restore', workspaceId: DEFAULT_WORKSPACE_ID, size: 0, mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: now - 1000 },
    ]);
    await softDeleteProject(database, 'p-restore');
    expect((await database.projects.get('p-restore'))?.archivedAt).toEqual(expect.any(Number));
    expect((await database.files.get('already-trashed'))?.deletedAt).toBe(now - 1000);
    await restoreProject(database, 'p-restore');
    expect(await database.projects.get('p-restore')).toMatchObject({ archived: false, archivedAt: null });
    expect((await database.files.get('live-before-archive'))?.deletedAt).toBeNull();
    expect((await database.files.get('already-trashed'))?.deletedAt).toBe(now - 1000);
  });

  it('empties only the selected workspace trash and preserves other workspaces', async () => {
    const database = createDatabase();
    await database.open();
    const now = Date.now();
    const other = { id: 'workspace-other-trash', name: 'Other', createdAt: now, updatedAt: now };
    await database.workspaces.add(other);
    const activeFile = await createTextFile(database, 'active.md', 'active');
    const otherFile = await createTextFile(database, 'other.md', 'other', { workspaceId: other.id });
    await softDeleteFile(database, activeFile.id);
    await softDeleteFile(database, otherFile.id);

    await emptyTrash(database, DEFAULT_WORKSPACE_ID);

    expect(await database.files.get(activeFile.id)).toBeUndefined();
    expect(await database.contents.get(activeFile.id)).toBeUndefined();
    expect(await database.files.get(otherFile.id)).toMatchObject({ deletedAt: expect.any(Number), workspaceId: other.id });
    expect(await database.contents.get(otherFile.id)).toEqual({ fileId: otherFile.id, data: 'other' });
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
    await emptyTrash(database, DEFAULT_WORKSPACE_ID);
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

    const restored = createDatabase();
    await restored.open();
    await importBackup(restored, preUpgradeBackup);
    expect(await restored.files.get('legacy-file')).toMatchObject({ workspaceId: DEFAULT_WORKSPACE_ID, name: 'legacy.md' });
    expect(await restored.folders.get('legacy-folder')).toMatchObject({ workspaceId: DEFAULT_WORKSPACE_ID });
    expect(await restored.projects.get('legacy-project')).toMatchObject({ workspaceId: DEFAULT_WORKSPACE_ID });

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
