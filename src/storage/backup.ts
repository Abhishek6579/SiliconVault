import type { Table } from 'dexie';
import { DEFAULT_WORKSPACE_ID, type WorkspaceDatabase } from './database';
import type { BackupFile, FileContent, FileMeta, Workspace, WorkspaceBackup, WorkspacePreference } from './types';

const FORMAT = 'engineering-workspace-backup';
const VERSION = 1;

type BackupDatabase = Pick<WorkspaceDatabase, 'files' | 'contents' | 'folders' | 'projects'> & {
  preferences?: Table<WorkspacePreference, string>;
  workspaces?: Table<Workspace, string>;
};

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

export async function exportBackup(database: BackupDatabase): Promise<WorkspaceBackup> {
  const [files, contents, folders, projects] = await Promise.all([
    database.files.toArray(), database.contents.toArray(), database.folders.toArray(), database.projects.toArray(),
  ]);
  const preferences = database.preferences ? await database.preferences.toArray() : [];
  const workspaces = database.workspaces ? await database.workspaces.toArray() : [];
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
  return { format: FORMAT, version: VERSION, exportedAt: Date.now(), files: backupFiles, folders, projects, preferences, workspaces };
}

export function downloadBackupFile(backup: WorkspaceBackup): void {
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `engineering-workspace-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function downloadBackup(database: BackupDatabase): Promise<void> {
  const backup = await exportBackup(database);
  downloadBackupFile(backup);
}

export async function importBackup(database: WorkspaceDatabase, value: unknown): Promise<void> {
  const backup = value as WorkspaceBackup;
  if (!backup || backup.format !== FORMAT || backup.version !== VERSION || !Array.isArray(backup.files) ||
      !Array.isArray(backup.folders) || !Array.isArray(backup.projects) || (backup.preferences !== undefined && !Array.isArray(backup.preferences))) {
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

  const workspaces: Workspace[] = backup.workspaces?.length ? backup.workspaces : [{
    id: DEFAULT_WORKSPACE_ID, name: 'My Workspace', createdAt: backup.exportedAt || Date.now(), updatedAt: backup.exportedAt || Date.now(),
  }];
  const knownWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const fileMeta = decoded.map(({ meta }) => ({ ...meta, workspaceId: knownWorkspaceIds.has(meta.workspaceId) ? meta.workspaceId : DEFAULT_WORKSPACE_ID }));
  const folderRecords = backup.folders.map((folder) => ({ ...folder, workspaceId: knownWorkspaceIds.has(folder.workspaceId) ? folder.workspaceId : DEFAULT_WORKSPACE_ID }));
  const projectRecords = backup.projects.map((project) => ({ ...project, workspaceId: knownWorkspaceIds.has(project.workspaceId) ? project.workspaceId : DEFAULT_WORKSPACE_ID }));

  await database.transaction('rw', [database.files, database.contents, database.folders, database.projects, database.preferences, database.workspaces], async () => {
    await database.files.clear();
    await database.contents.clear();
    await database.folders.clear();
    await database.projects.clear();
    await database.preferences.clear();
    await database.workspaces.clear();
    await database.workspaces.bulkAdd(workspaces);
    await database.projects.bulkAdd(projectRecords);
    await database.folders.bulkAdd(folderRecords);
    await database.files.bulkAdd(fileMeta);
    await database.contents.bulkAdd(decoded.map((record) => record.content));
    await database.preferences.bulkAdd(backup.preferences ?? []);
  });
}
