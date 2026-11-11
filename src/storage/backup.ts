import type { WorkspaceDatabase } from './database';
import type { BackupFile, FileContent, FileMeta, WorkspaceBackup } from './types';

const FORMAT = 'engineering-workspace-backup';
const VERSION = 1;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function contentToBytes(data: Blob | string): Promise<Uint8Array> {
  return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function exportBackup(database: WorkspaceDatabase): Promise<WorkspaceBackup> {
  const [files, contents, folders, projects] = await Promise.all([
    database.files.toArray(), database.contents.toArray(), database.folders.toArray(), database.projects.toArray(),
  ]);
  const contentById = new Map(contents.map((item) => [item.fileId, item]));
  const backupFiles: BackupFile[] = await Promise.all(files.map(async (meta) => {
    const content = contentById.get(meta.id);
    if (!content) throw new Error(`Missing content for file ${meta.id}`);
    const bytes = await contentToBytes(content.data);
    const isText = typeof content.data === 'string';
    return {
      meta,
      content: { encoding: isText ? 'text' : 'base64', value: isText ? content.data as string : bytesToBase64(bytes) },
      sha256: await checksum(bytes),
    };
  }));
  return { format: FORMAT, version: VERSION, exportedAt: Date.now(), files: backupFiles, folders, projects };
}

export async function downloadBackup(database: WorkspaceDatabase): Promise<void> {
  const backup = await exportBackup(database);
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `engineering-workspace-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(database: WorkspaceDatabase, value: unknown): Promise<void> {
  const backup = value as WorkspaceBackup;
  if (!backup || backup.format !== FORMAT || backup.version !== VERSION || !Array.isArray(backup.files) ||
      !Array.isArray(backup.folders) || !Array.isArray(backup.projects)) {
    throw new Error('This backup is invalid or uses an unsupported version.');
  }

  const decoded: Array<{ meta: FileMeta; content: FileContent }> = [];
  for (const item of backup.files) {
    if (!item?.meta?.id || !item.content || !['text', 'base64'].includes(item.content.encoding)) {
      throw new Error('This backup contains an invalid file record.');
    }
    const bytes = item.content.encoding === 'text'
      ? new TextEncoder().encode(item.content.value)
      : base64ToBytes(item.content.value);
    if (await checksum(bytes) !== item.sha256) throw new Error(`Checksum validation failed for ${item.meta.name}.`);
    const data: Blob | string = item.content.encoding === 'text'
      ? item.content.value
      : new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: item.meta.mimeType });
    decoded.push({ meta: item.meta, content: { fileId: item.meta.id, data } });
  }

  await database.transaction('rw', database.files, database.contents, database.folders, database.projects, async () => {
    await database.files.clear();
    await database.contents.clear();
    await database.folders.clear();
    await database.projects.clear();
    await database.projects.bulkAdd(backup.projects);
    await database.folders.bulkAdd(backup.folders);
    await database.files.bulkAdd(decoded.map((record) => record.meta));
    await database.contents.bulkAdd(decoded.map((record) => record.content));
  });
}
