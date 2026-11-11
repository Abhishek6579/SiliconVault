import type { Table } from 'dexie';
import { DEFAULT_WORKSPACE_ID, type WorkspaceDatabase } from './database';
import type { BackupFile, FileContent, FileMeta, Workspace, WorkspaceBackup, WorkspacePreference } from './types';

const FORMAT = 'engineering-workspace-backup';
const VERSION = 1;
const MAX_RECORDS = 1_000_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

type BackupDatabase = Pick<WorkspaceDatabase, 'files' | 'contents' | 'folders' | 'projects'> & {
  preferences?: Table<WorkspacePreference, string>;
  workspaces?: Table<Workspace, string>;
};

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))));
  }
  return btoa(parts.join(''));
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('This backup contains invalid base64 file content.');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function contentToBytes(data: Blob | string): Promise<Uint8Array> {
  return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function finiteTime(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }

function validateWorkspace(value: unknown): value is Workspace {
  return isRecord(value) && nonEmptyString(value.id) && nonEmptyString(value.name) && finiteTime(value.createdAt) && finiteTime(value.updatedAt);
}
function validateProject(value: unknown): boolean {
  return isRecord(value) && nonEmptyString(value.id) && (value.workspaceId === undefined || nonEmptyString(value.workspaceId)) && nonEmptyString(value.name) &&
    typeof value.archived === 'boolean' && finiteTime(value.createdAt) && finiteTime(value.updatedAt);
}
function validateFolder(value: unknown): boolean {
  return isRecord(value) && nonEmptyString(value.id) && (value.workspaceId === undefined || nonEmptyString(value.workspaceId)) && nonEmptyString(value.name) &&
    (value.parentFolderId === null || nonEmptyString(value.parentFolderId)) &&
    (value.projectId === null || nonEmptyString(value.projectId)) && finiteTime(value.createdAt) && finiteTime(value.updatedAt);
}
function validateFileMeta(value: unknown): value is FileMeta {
  return isRecord(value) && nonEmptyString(value.id) && (value.workspaceId === undefined || nonEmptyString(value.workspaceId)) && nonEmptyString(value.name) &&
    ['pdf', 'markdown', 'code', 'text', 'viewer', 'other'].includes(String(value.kind)) &&
    (value.parentFolderId === null || nonEmptyString(value.parentFolderId)) &&
    (value.projectId === null || nonEmptyString(value.projectId)) &&
    typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size >= 0 &&
    nonEmptyString(value.mimeType) && finiteTime(value.createdAt) && finiteTime(value.updatedAt) &&
    (value.deletedAt === null || finiteTime(value.deletedAt));
}
function validatePreference(value: unknown): boolean {
  return isRecord(value) && nonEmptyString(value.key) && finiteTime(value.updatedAt) && Object.prototype.hasOwnProperty.call(value, 'value');
}

function validateBackup(value: unknown): asserts value is WorkspaceBackup {
  if (!isRecord(value) || value.format !== FORMAT || value.version !== VERSION || !finiteTime(value.exportedAt) ||
      !Array.isArray(value.files) || !Array.isArray(value.folders) || !Array.isArray(value.projects) ||
      (value.preferences !== undefined && !Array.isArray(value.preferences)) ||
      (value.workspaces !== undefined && !Array.isArray(value.workspaces))) {
    throw new Error('This backup is invalid or uses an unsupported version.');
  }
  const arrays = [value.files, value.folders, value.projects, value.preferences ?? [], value.workspaces ?? []];
  if (arrays.some((records) => records.length > MAX_RECORDS)) throw new Error('This backup exceeds the supported record limit.');
  if (!value.files.every((item) => isRecord(item) && validateFileMeta(item.meta) && isRecord(item.content) &&
      (item.content.encoding === 'text' || item.content.encoding === 'base64') && typeof item.content.value === 'string' &&
      typeof item.sha256 === 'string' && SHA256_PATTERN.test(item.sha256))) {
    throw new Error('This backup contains an invalid file record.');
  }
  if (!value.folders.every(validateFolder) || !value.projects.every(validateProject) ||
      !(value.preferences ?? []).every(validatePreference) || !(value.workspaces ?? []).every(validateWorkspace)) {
    throw new Error('This backup contains invalid metadata records.');
  }

  const unique = (records: unknown[], key: (record: any) => string) => {
    const ids = new Set<string>();
    for (const record of records) {
      const id = key(record);
      if (ids.has(id)) return false;
      ids.add(id);
    }
    return true;
  };
  if (!unique(value.files, (record) => record.meta.id) || !unique(value.folders, (record) => record.id) ||
      !unique(value.projects, (record) => record.id) || !unique(value.workspaces ?? [], (record) => record.id) ||
      !unique(value.preferences ?? [], (record) => record.key)) {
    throw new Error('This backup contains duplicate record identifiers.');
  }
}

export async function exportBackup(database: BackupDatabase): Promise<WorkspaceBackup> {
  // Read metadata independently; never materialize the entire contents store.
  const [files, folders, projects, preferences, workspaces] = await Promise.all([
    database.files.toArray(), database.folders.toArray(), database.projects.toArray(),
    database.preferences ? database.preferences.toArray() : [],
    database.workspaces ? database.workspaces.toArray() : [],
  ]);
  const backupFiles: BackupFile[] = [];
  for (const meta of files) {
    const content = await database.contents.get(meta.id);
    if (!content) throw new Error(`Missing content for file ${meta.id}`);
    const isText = typeof content.data === 'string';
    const bytes = await contentToBytes(content.data);
    backupFiles.push({
      meta,
      content: { encoding: isText ? 'text' : 'base64', value: isText ? content.data as string : bytesToBase64(bytes) },
      sha256: await checksum(bytes),
    });
  }
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

export function serializeBackup(backup: WorkspaceBackup): string { return JSON.stringify(backup); }

async function* backupJsonChunks(database: BackupDatabase): AsyncGenerator<string> {
  const [files, folders, projects, preferences, workspaces] = await Promise.all([
    database.files.toArray(), database.folders.toArray(), database.projects.toArray(),
    database.preferences ? database.preferences.toArray() : [],
    database.workspaces ? database.workspaces.toArray() : [],
  ]);
  const exportedAt = Date.now();
  yield `{"format":${JSON.stringify(FORMAT)},"version":${VERSION},"exportedAt":${exportedAt},"files":[`;
  let first = true;
  for (const meta of files) {
    const record = await database.contents.get(meta.id);
    if (!record) throw new Error(`Missing content for file ${meta.id}`);
    const isText = typeof record.data === 'string';
    const bytes = await contentToBytes(record.data);
    const item: BackupFile = {
      meta,
      content: { encoding: isText ? 'text' : 'base64', value: isText ? record.data as string : bytesToBase64(bytes) },
      sha256: await checksum(bytes),
    };
    yield `${first ? '' : ','}${JSON.stringify(item)}`;
    first = false;
  }
  yield `],"folders":${JSON.stringify(folders)},"projects":${JSON.stringify(projects)},"preferences":${JSON.stringify(preferences)},"workspaces":${JSON.stringify(workspaces)}}`;
}

export function exportBackupStream(database: BackupDatabase): ReadableStream<Uint8Array> {
  const iterator = backupJsonChunks(database);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(new TextEncoder().encode(next.value));
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() { void iterator.return?.(); },
  });
  return stream;
}

async function createBackupBlob(database: BackupDatabase): Promise<Blob> {
  return new Response(exportBackupStream(database), { headers: { 'Content-Type': 'application/json' } }).blob();
}

export async function downloadBackup(database: BackupDatabase): Promise<void> {
  const blob = await createBackupBlob(database);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `engineering-workspace-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function importBackup(database: WorkspaceDatabase, value: unknown): Promise<void> {
  validateBackup(value);
  const backup = value;
  const workspaces: Workspace[] = backup.workspaces?.length ? backup.workspaces : [{
    id: DEFAULT_WORKSPACE_ID, name: 'My Workspace', createdAt: backup.exportedAt || Date.now(), updatedAt: backup.exportedAt || Date.now(),
  }];
  const knownWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const folderIds = new Set(backup.folders.map((folder) => folder.id));
  const projectIds = new Set(backup.projects.map((project) => project.id));
  const validateRelations = (records: Array<{ workspaceId: string; parentFolderId?: string | null; projectId?: string | null }>) => {
    for (const record of records) {
      if (record.workspaceId && !knownWorkspaceIds.has(record.workspaceId)) throw new Error('This backup references a workspace that does not exist.');
      if (record.parentFolderId && !folderIds.has(record.parentFolderId)) throw new Error('This backup references a folder that does not exist.');
      if (record.projectId && !projectIds.has(record.projectId)) throw new Error('This backup references a project that does not exist.');
    }
  };
  validateRelations(backup.folders);
  validateRelations(backup.files.map((file) => file.meta));
  validateRelations(backup.projects);
  const normalizedFolders = backup.folders.map((folder) => ({ ...folder, workspaceId: folder.workspaceId ?? DEFAULT_WORKSPACE_ID }));
  const normalizedProjects = backup.projects.map((project) => ({ ...project, workspaceId: project.workspaceId ?? DEFAULT_WORKSPACE_ID }));
  const normalizedFileMeta = backup.files.map((file) => ({ ...file.meta, workspaceId: file.meta.workspaceId ?? DEFAULT_WORKSPACE_ID }));
  const normalizedMetaById = new Map(normalizedFileMeta.map((meta) => [meta.id, meta]));
  const foldersById = new Map(normalizedFolders.map((folder) => [folder.id, folder]));
  const projectsById = new Map(normalizedProjects.map((project) => [project.id, project]));
  const parentById = new Map(normalizedFolders.map((folder) => [folder.id, folder.parentFolderId]));
  const visitState = new Map<string, 1 | 2>();
  for (const folder of normalizedFolders) {
    const path: string[] = [];
    let current: string | null | undefined = folder.id;
    while (current && visitState.get(current) !== 2) {
      if (visitState.get(current) === 1) throw new Error('This backup contains a folder hierarchy cycle.');
      visitState.set(current, 1);
      path.push(current);
      current = parentById.get(current);
    }
    for (const id of path) visitState.set(id, 2);
  }
  for (const folder of normalizedFolders) {
    const parent = folder.parentFolderId ? foldersById.get(folder.parentFolderId) : undefined;
    const project = folder.projectId ? projectsById.get(folder.projectId) : undefined;
    if (folder.parentFolderId && (!parent || parent.workspaceId !== folder.workspaceId || parent.projectId !== folder.projectId)) {
      throw new Error('This backup contains an inconsistent folder hierarchy.');
    }
    if (folder.projectId && (!project || project.workspaceId !== folder.workspaceId)) {
      throw new Error('This backup contains a folder assigned to an inconsistent project.');
    }
  }
  for (const meta of normalizedFileMeta) {
    const parent = meta.parentFolderId ? foldersById.get(meta.parentFolderId) : undefined;
    const project = meta.projectId ? projectsById.get(meta.projectId) : undefined;
    if (meta.parentFolderId && (!parent || parent.workspaceId !== meta.workspaceId || parent.projectId !== meta.projectId)) {
      throw new Error('This backup contains a file assigned to an inconsistent folder.');
    }
    if (meta.projectId && (!project || project.workspaceId !== meta.workspaceId)) {
      throw new Error('This backup contains a file assigned to an inconsistent project.');
    }
  }

  const decoded: Array<{ meta: FileMeta; content: FileContent }> = [];
  for (const item of backup.files) {
    let bytes: Uint8Array;
    try {
      bytes = item.content.encoding === 'text' ? new TextEncoder().encode(item.content.value) : base64ToBytes(item.content.value);
    } catch {
      throw new Error(`File content for ${item.meta.name} is not valid.`);
    }
    if (bytes.byteLength !== item.meta.size) throw new Error(`File size validation failed for ${item.meta.name}.`);
    if (await checksum(bytes) !== item.sha256) throw new Error(`Checksum validation failed for ${item.meta.name}.`);
    const data: Blob | string = item.content.encoding === 'text'
      ? item.content.value
      : new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: item.meta.mimeType });
    const meta = normalizedMetaById.get(item.meta.id)!;
    decoded.push({ meta, content: { fileId: item.meta.id, data } });
  }

  await database.transaction('rw', [database.files, database.contents, database.folders, database.projects, database.preferences, database.workspaces], async () => {
    await database.files.clear();
    await database.contents.clear();
    await database.folders.clear();
    await database.projects.clear();
    await database.preferences.clear();
    await database.workspaces.clear();
    await database.workspaces.bulkAdd(workspaces);
    await database.projects.bulkAdd(normalizedProjects);
    await database.folders.bulkAdd(normalizedFolders);
    await database.files.bulkAdd(decoded.map((record) => record.meta));
    // Write content in bounded batches to keep IndexedDB transaction payloads bounded.
    for (let offset = 0; offset < decoded.length; offset += 100) {
      await database.contents.bulkAdd(decoded.slice(offset, offset + 100).map((record) => record.content));
    }
    await database.preferences.bulkAdd(backup.preferences ?? []);
  });
}
