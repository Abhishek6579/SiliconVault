import type { WorkspaceDatabase } from './database';
import type { FileKind } from './types';

const CODE_EXTENSIONS = new Set(['sv', 'v', 'vhd', 'vhdl', 'c', 'h', 'cpp', 'py', 'js', 'ts', 'json', 'sh', 's', 'asm']);
const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', ...CODE_EXTENSIONS]);

export function kindForFile(name: string, mimeType = ''): FileKind {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (['md', 'markdown'].includes(extension)) return 'markdown';
  if (CODE_EXTENSIONS.has(extension)) return 'code';
  return 'other';
}

export async function createTextFile(database: WorkspaceDatabase, name: string, text: string, options: { parentFolderId?: string | null; projectId?: string | null; kind?: FileKind } = {}) {
  const now = Date.now();
  const id = crypto.randomUUID();
  const kind = options.kind ?? kindForFile(name, 'text/plain');
  const meta = {
    id, kind, name,
    parentFolderId: options.parentFolderId ?? null,
    projectId: options.projectId ?? null,
    size: new TextEncoder().encode(text).byteLength,
    mimeType: kind === 'markdown' ? 'text/markdown' : 'text/plain',
    createdAt: now, updatedAt: now, deletedAt: null,
  };
  await database.transaction('rw', database.files, database.contents, async () => {
    await database.files.add(meta);
    await database.contents.add({ fileId: id, data: text });
  });
  return meta;
}

export async function importFile(database: WorkspaceDatabase, file: File, options: { parentFolderId?: string | null; projectId?: string | null } = {}) {
  const now = Date.now();
  const id = crypto.randomUUID();
  const meta = {
    id, kind: kindForFile(file.name, file.type), name: file.name,
    parentFolderId: options.parentFolderId ?? null,
    projectId: options.projectId ?? null,
    size: file.size, mimeType: file.type || 'application/octet-stream',
    createdAt: now, updatedAt: now, deletedAt: null,
  };
  await database.transaction('rw', database.files, database.contents, async () => {
    await database.files.add(meta);
    await database.contents.add({ fileId: id, data: file });
  });
  return meta;
}

export async function renameFile(database: WorkspaceDatabase, id: string, name: string): Promise<void> {
  const file = await database.files.get(id);
  if (!file) throw new Error('The file does not exist.');
  await database.files.update(id, { name, kind: kindForFile(name, file.mimeType), updatedAt: Date.now() });
}

export async function saveFileText(database: WorkspaceDatabase, id: string, text: string): Promise<void> {
  await database.transaction('rw', database.files, database.contents, async () => {
    const current = await database.files.get(id);
    if (!current) throw new Error('The file does not exist.');
    await database.contents.put({ fileId: id, data: text });
    await database.files.update(id, { size: new TextEncoder().encode(text).byteLength, updatedAt: Date.now() });
  });
}

export async function softDeleteFile(database: WorkspaceDatabase, id: string): Promise<void> {
  const now = Date.now();
  await database.files.update(id, { deletedAt: now, updatedAt: now });
}

export async function restoreFile(database: WorkspaceDatabase, id: string): Promise<void> {
  await database.files.update(id, { deletedAt: null, updatedAt: Date.now() });
}

export async function emptyTrash(database: WorkspaceDatabase): Promise<void> {
  await database.transaction('rw', database.files, database.contents, async () => {
    const deleted = await database.files.where('deletedAt').above(0).primaryKeys();
    await database.contents.bulkDelete(deleted);
    await database.files.bulkDelete(deleted);
  });
}

export async function getFolderSubtreeIds(database: WorkspaceDatabase, folderId: string): Promise<string[]> {
  const folders = await database.folders.toArray();
  const descendants = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) if (folder.parentFolderId && descendants.has(folder.parentFolderId) && !descendants.has(folder.id)) {
      descendants.add(folder.id); changed = true;
    }
  }
  return [...descendants];
}

export async function countFolderItems(database: WorkspaceDatabase, folderId: string): Promise<number> {
  const descendants = await getFolderSubtreeIds(database, folderId);
  const [nestedFolders, files] = await Promise.all([
    database.folders.where('parentFolderId').anyOf([...descendants]).count(),
    database.files.where('parentFolderId').anyOf([...descendants]).filter((file) => file.deletedAt === null).count(),
  ]);
  return nestedFolders + files;
}

export async function deleteFolderContents(database: WorkspaceDatabase, folderId: string): Promise<void> {
  await database.transaction('rw', database.folders, database.files, database.contents, async () => {
    const descendants = await getFolderSubtreeIds(database, folderId);
    const fileIds = await database.files.where('parentFolderId').anyOf(descendants).primaryKeys();
    await database.contents.bulkDelete(fileIds);
    await database.files.bulkDelete(fileIds);
    await database.folders.bulkDelete(descendants);
  });
}
