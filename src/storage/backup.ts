import Dexie, { type Table } from 'dexie';
import { DEFAULT_WORKSPACE_ID, type WorkspaceDatabase } from './database';
import type { BackupFile, FileMeta, Workspace, WorkspaceBackup, WorkspacePreference } from './types';
import { MAX_BACKUP_FILE_SIZE_BYTES, MAX_BACKUP_INDIVIDUAL_FILE_BYTES, MAX_BACKUP_RECORDS, MAX_BACKUP_TOTAL_CONTENT_BYTES } from './limits';

const FORMAT = 'engineering-workspace-backup';
const VERSION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const BACKUP_STREAM_CHUNK_BYTES = 64 * 1024;

type BackupDatabase = Pick<WorkspaceDatabase, 'files' | 'contents' | 'folders' | 'projects'> & {
  preferences?: Table<WorkspacePreference, string>;
  workspaces?: Table<Workspace, string>;
};

export interface BackupExportSnapshot {
  files: FileMeta[];
  folders: import('./types').Folder[];
  projects: import('./types').Project[];
  preferences: WorkspacePreference[];
  workspaces: Workspace[];
  exportedAt: number;
}

export interface BackupProgressUpdate {
  stage: string;
  current: number;
  total: number | null;
  item?: string;
}
export type BackupProgressReporter = (progress: BackupProgressUpdate) => void;

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))));
  }
  return btoa(parts.join(''));
}

async function base64ToBytesChunked(value: string, yieldBetweenChunks?: () => Promise<unknown>): Promise<Uint8Array> {
  if (value.length % 4 !== 0) throw new Error('This backup contains invalid base64 file content.');
  const outputLength = Math.floor(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  const output = new Uint8Array(outputLength);
  const chunkCharacters = 4 * 16 * 1024;
  let outputOffset = 0;
  for (let offset = 0; offset < value.length; offset += chunkCharacters) {
    const end = Math.min(offset + chunkCharacters, value.length);
    const chunk = value.slice(offset, end);
    const finalChunk = end === value.length;
    if (!(finalChunk
      ? /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(chunk)
      : /^(?:[A-Za-z0-9+/]{4})*$/.test(chunk))) {
      throw new Error('This backup contains invalid base64 file content.');
    }
    const binary = atob(chunk);
    for (let index = 0; index < binary.length; index += 1) output[outputOffset + index] = binary.charCodeAt(index);
    outputOffset += binary.length;
    if (yieldBetweenChunks && end < value.length) await yieldBetweenChunks();
  }
  if (outputOffset !== outputLength) throw new Error('This backup contains invalid base64 file content.');
  return output;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function contentToBytes(data: Blob | string): Promise<Uint8Array> {
  return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createBackupFileFromData(meta: FileMeta, data: Blob | string): Promise<BackupFile> {
  const isText = typeof data === 'string';
  const bytes = await contentToBytes(data);
  if (bytes.byteLength !== meta.size) {
    throw new Error(`File size metadata is inconsistent for "${meta.name}". Save or re-import the file before creating a backup.`);
  }
  return {
    meta,
    content: { encoding: isText ? 'text' : 'base64', value: isText ? data as string : bytesToBase64(bytes) },
    sha256: await checksum(bytes),
  };
}

interface BackupFileWorkerResult { id: number; ok: boolean; byteLength?: number; serialized?: string; serializedBytes?: ArrayBuffer; error?: string }

/** Performs the expensive binary encoding, checksum and JSON serialization outside the UI thread. */
class BackupFileProcessor {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: { byteLength: number; serialized?: string; bytes?: Uint8Array }) => void; reject: (error: Error) => void }>();

  constructor() {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./backupExport.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<BackupFileWorkerResult>) => {
        const response = event.data;
        const pending = this.pending.get(response.id);
        if (!pending) return;
        this.pending.delete(response.id);
        if (!response.ok || typeof response.byteLength !== 'number') pending.reject(new Error(response.error || 'Could not encode a backup file.'));
        else pending.resolve({ byteLength: response.byteLength, serialized: response.serialized, bytes: response.serializedBytes ? new Uint8Array(response.serializedBytes) : undefined });
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'The backup processing worker failed.');
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  async process(database: BackupDatabase, meta: FileMeta, includeSerialized: boolean): Promise<{ byteLength: number; serialized?: string; bytes?: Uint8Array }> {
    const record = await database.contents.get(meta.id);
    if (!record) throw new Error(`Missing content for file ${meta.id}`);
    if (!this.worker) {
      const serialized = JSON.stringify(await createBackupFileFromData(meta, record.data));
      return { byteLength: new TextEncoder().encode(serialized).byteLength, serialized: includeSerialized ? serialized : undefined };
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker!.postMessage({ id, meta, data: record.data, includeSerialized });
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error('Could not send file content to the backup worker.'));
      }
    });
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) pending.reject(new Error('Backup processing was cancelled.'));
    this.pending.clear();
  }
}

async function createBackupFile(database: BackupDatabase, meta: FileMeta): Promise<BackupFile> {
  const record = await database.contents.get(meta.id);
  if (!record) throw new Error(`Missing content for file ${meta.id}`);
  return createBackupFileFromData(meta, record.data);
}

/** Preflight every limit before showing a save dialog or writing any backup bytes. */
export async function prepareBackupExport(database: BackupDatabase, onProgress?: BackupProgressReporter): Promise<BackupExportSnapshot> {
  onProgress?.({ stage: 'Reading workspace metadata', current: 0, total: null });
  const [files, folders, projects, preferences, workspaces] = await Promise.all([
    database.files.toArray(), database.folders.toArray(), database.projects.toArray(),
    database.preferences ? database.preferences.toArray() : [],
    database.workspaces ? database.workspaces.toArray() : [],
  ]);
  const recordCount = files.length + folders.length + projects.length + preferences.length + workspaces.length;
  if (recordCount > MAX_BACKUP_RECORDS) {
    throw new Error(`This workspace exceeds the supported backup limit of ${MAX_BACKUP_RECORDS.toLocaleString()} records.`);
  }

  const exportedAt = Date.now();
  const encoder = new TextEncoder();
  const prefix = `{"format":${JSON.stringify(FORMAT)},"version":${VERSION},"exportedAt":${exportedAt},"files":[`;
  let serializedBytes = encoder.encode(prefix).byteLength;
  let aggregateContentBytes = 0;
  for (const meta of files) {
    if (!Number.isSafeInteger(meta.size) || meta.size < 0) {
      throw new Error(`File "${meta.name}" has invalid size metadata and cannot be backed up.`);
    }
    if (meta.size > MAX_BACKUP_INDIVIDUAL_FILE_BYTES) {
      throw new Error(`File "${meta.name}" exceeds the per-file backup limit of ${Math.floor(MAX_BACKUP_INDIVIDUAL_FILE_BYTES / (1024 * 1024))} MiB.`);
    }
    aggregateContentBytes += meta.size;
    if (aggregateContentBytes > MAX_BACKUP_TOTAL_CONTENT_BYTES) {
      throw new Error(`Workspace content exceeds the total backup limit of ${Math.floor(MAX_BACKUP_TOTAL_CONTENT_BYTES / (1024 * 1024))} MiB.`);
    }
  }

  onProgress?.({ stage: 'Checking backup content', current: 0, total: files.length });
  const processor = new BackupFileProcessor();
  try {
    for (let index = 0; index < files.length; index += 1) {
      const meta = files[index];
      const processed = await processor.process(database, meta, false);
      serializedBytes += processed.byteLength + (index === 0 ? 0 : 1);
      if (serializedBytes > MAX_BACKUP_FILE_SIZE_BYTES) {
        throw new Error(`The generated backup would exceed the maximum backup size of ${Math.floor(MAX_BACKUP_FILE_SIZE_BYTES / (1024 * 1024))} MiB.`);
      }
      onProgress?.({ stage: 'Checking backup content', current: index + 1, total: files.length, item: meta.name });
    }
  } finally {
    processor.close();
  }

  const suffix = `],"folders":${JSON.stringify(folders)},"projects":${JSON.stringify(projects)},"preferences":${JSON.stringify(preferences)},"workspaces":${JSON.stringify(workspaces)}}`;
  serializedBytes += encoder.encode(suffix).byteLength;
  if (serializedBytes > MAX_BACKUP_FILE_SIZE_BYTES) {
    throw new Error(`The generated backup would exceed the maximum backup size of ${Math.floor(MAX_BACKUP_FILE_SIZE_BYTES / (1024 * 1024))} MiB.`);
  }

  return { files, folders, projects, preferences, workspaces, exportedAt };
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
    typeof value.archived === 'boolean' &&
    (value.archivedAt === undefined || value.archivedAt === null || finiteTime(value.archivedAt)) &&
    finiteTime(value.createdAt) && finiteTime(value.updatedAt);
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
  if (arrays.some((records) => records.length > MAX_BACKUP_RECORDS) || arrays.reduce((total, records) => total + records.length, 0) > MAX_BACKUP_RECORDS) {
    throw new Error(`This backup exceeds the supported record limit of ${MAX_BACKUP_RECORDS.toLocaleString()} records.`);
  }
  if (!value.files.every((item) => isRecord(item) && validateFileMeta(item.meta) && isRecord(item.content) &&
      (item.content.encoding === 'text' || item.content.encoding === 'base64') && typeof item.content.value === 'string' &&
      typeof item.sha256 === 'string')) {
    throw new Error('This backup contains an invalid file record.');
  }
  if (!value.folders.every(validateFolder) || !value.projects.every(validateProject) ||
      !(value.preferences ?? []).every(validatePreference) || !(value.workspaces ?? []).every(validateWorkspace)) {
    throw new Error('This backup contains invalid metadata records.');
  }

  let aggregateContentBytes = 0;
  for (const item of value.files as Array<{ meta: FileMeta; content: { encoding: 'text' | 'base64'; value: string } }>) {
    if (item.meta.size > MAX_BACKUP_INDIVIDUAL_FILE_BYTES) {
      throw new Error(`Backup file "${item.meta.name}" exceeds the per-file restore limit of ${Math.floor(MAX_BACKUP_INDIVIDUAL_FILE_BYTES / (1024 * 1024))} MiB.`);
    }
    aggregateContentBytes += item.meta.size;
    if (aggregateContentBytes > MAX_BACKUP_TOTAL_CONTENT_BYTES) {
      throw new Error(`This backup exceeds the total restored-content limit of ${Math.floor(MAX_BACKUP_TOTAL_CONTENT_BYTES / (1024 * 1024))} MiB.`);
    }
    if (item.content.encoding === 'base64' && item.content.value.length !== Math.ceil(item.meta.size / 3) * 4) {
      throw new Error(`Backup file "${item.meta.name}" has an invalid encoded content length.`);
    }
    if (item.content.encoding === 'text' && item.content.value.length > item.meta.size) {
      throw new Error(`Backup file "${item.meta.name}" has an invalid text content length.`);
    }
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
  const snapshot = await prepareBackupExport(database);
  const backupFiles: BackupFile[] = [];
  for (const meta of snapshot.files) backupFiles.push(await createBackupFile(database, meta));
  return {
    format: FORMAT, version: VERSION, exportedAt: snapshot.exportedAt,
    files: backupFiles, folders: snapshot.folders, projects: snapshot.projects,
    preferences: snapshot.preferences, workspaces: snapshot.workspaces,
  };
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

async function* backupJsonChunks(
  database: BackupDatabase,
  prepared?: BackupExportSnapshot,
  onProgress?: BackupProgressReporter,
): AsyncGenerator<string | Uint8Array> {
  const snapshot = prepared ?? await prepareBackupExport(database, onProgress);
  const encoder = new TextEncoder();
  let serializedBytes = 0;
  const assertWithinLimit = () => {
    if (serializedBytes > MAX_BACKUP_FILE_SIZE_BYTES) {
      throw new Error(`The generated backup exceeded the maximum backup size of ${Math.floor(MAX_BACKUP_FILE_SIZE_BYTES / (1024 * 1024))} MiB.`);
    }
  };
  const emit = (chunk: string): string => {
    serializedBytes += encoder.encode(chunk).byteLength;
    assertWithinLimit();
    return chunk;
  };
  const emitBytes = (chunk: Uint8Array): Uint8Array => {
    serializedBytes += chunk.byteLength;
    assertWithinLimit();
    return chunk;
  };

  yield emit(`{"format":${JSON.stringify(FORMAT)},"version":${VERSION},"exportedAt":${snapshot.exportedAt},"files":[`);
  const processor = new BackupFileProcessor();
  try {
    onProgress?.({ stage: 'Writing backup', current: 0, total: snapshot.files.length });
    for (let index = 0; index < snapshot.files.length; index += 1) {
      const meta = snapshot.files[index];
      const processed = await processor.process(database, meta, true);
      if (processed.bytes) {
        if (index > 0) yield emit(',');
        yield emitBytes(processed.bytes);
      } else if (processed.serialized !== undefined) {
        yield emit(`${index === 0 ? '' : ','}${processed.serialized}`);
      } else {
        throw new Error('The backup worker did not return serialized file content.');
      }
      onProgress?.({ stage: 'Writing backup', current: index + 1, total: snapshot.files.length, item: meta.name });
    }
    yield emit(`],"folders":${JSON.stringify(snapshot.folders)},"projects":${JSON.stringify(snapshot.projects)},"preferences":${JSON.stringify(snapshot.preferences)},"workspaces":${JSON.stringify(snapshot.workspaces)}}`);
  } finally {
    processor.close();
  }
}

export function exportBackupStream(database: BackupDatabase, prepared?: BackupExportSnapshot, onProgress?: BackupProgressReporter): ReadableStream<Uint8Array> {
  const iterator = backupJsonChunks(database, prepared, onProgress);
  const encoder = new TextEncoder();
  let pending: Uint8Array | null = null;
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!pending) {
          const next = await iterator.next();
          if (next.done) { controller.close(); return; }
          pending = typeof next.value === 'string' ? encoder.encode(next.value) : next.value;
          offset = 0;
        }
        const end = Math.min(offset + BACKUP_STREAM_CHUNK_BYTES, pending.length);
        controller.enqueue(pending.subarray(offset, end));
        offset = end;
        if (offset >= pending.length) { pending = null; offset = 0; }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() { pending = null; void iterator.return?.(undefined); },
  });
  return stream;
}

async function createBackupBlob(database: BackupDatabase, prepared: BackupExportSnapshot, onProgress?: BackupProgressReporter): Promise<Blob> {
  return new Response(exportBackupStream(database, prepared, onProgress), { headers: { 'Content-Type': 'application/json' } }).blob();
}

export async function downloadBackup(database: BackupDatabase, onProgress?: BackupProgressReporter): Promise<void> {
  const prepared = await prepareBackupExport(database, onProgress);
  const blob = await createBackupBlob(database, prepared, onProgress);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `engineering-workspace-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function importBackup(database: WorkspaceDatabase, value: unknown, onProgress?: BackupProgressReporter): Promise<void> {
  onProgress?.({ stage: 'Validating backup structure', current: 0, total: null });
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

  // Validate checksums before replacing live data. Chunked decoding yields to the UI
  // between base64 blocks so a large backup does not monopolize the main thread.
  onProgress?.({ stage: 'Verifying backup files', current: 0, total: backup.files.length });
  for (let index = 0; index < backup.files.length; index += 1) {
    const item = backup.files[index];
    if (index > 0 && index % 3 === 0) await yieldToMain();
    let bytes: Uint8Array;
    try {
      bytes = item.content.encoding === 'text'
        ? new Uint8Array(await new Blob([item.content.value]).arrayBuffer())
        : await base64ToBytesChunked(item.content.value, yieldToMain);
    } catch {
      throw new Error(`File content for ${item.meta.name} is not valid.`);
    }
    if (bytes.byteLength !== item.meta.size) throw new Error(`File size validation failed for ${item.meta.name}.`);
    if (!SHA256_PATTERN.test(item.sha256) || await checksum(bytes) !== item.sha256) {
      throw new Error(`Checksum validation failed for ${item.meta.name}.`);
    }
    onProgress?.({ stage: 'Verifying backup files', current: index + 1, total: backup.files.length, item: item.meta.name });
  }

  onProgress?.({ stage: 'Restoring workspace records', current: 0, total: backup.files.length });
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
    await database.files.bulkAdd(normalizedFileMeta);
    // Decode and persist small batches; Dexie.waitFor keeps the atomic transaction
    // alive while yielding during unusually large base64 payloads.
    const batchSize = 5;
    for (let offset = 0; offset < backup.files.length; offset += batchSize) {
      const batch = [];
      for (const item of backup.files.slice(offset, offset + batchSize)) {
        const meta = normalizedMetaById.get(item.meta.id)!;
        let data: Blob | string = item.content.value;
        if (item.content.encoding === 'base64') {
          const bytes = await base64ToBytesChunked(item.content.value, () => Dexie.waitFor(yieldToMain()));
          data = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: meta.mimeType });
        }
        batch.push({ fileId: meta.id, data });
      }
      await database.contents.bulkAdd(batch);
      onProgress?.({ stage: 'Restoring file content', current: Math.min(offset + batch.length, backup.files.length), total: backup.files.length });
    }
    if (backup.workspaces?.length) {
      // The active workspace is application state, not merely an optional UI
      // preference. Persist a valid selection in the same transaction as the
      // restored catalog so a restart cannot fall back to a stale workspace.
      const importedActiveWorkspace = backup.preferences?.find((preference) => preference.key === 'activeWorkspace')?.value;
      const activeWorkspaceId = workspaces.some((workspace) => workspace.id === importedActiveWorkspace)
        ? importedActiveWorkspace as string
        : workspaces[0].id;
      const restoredPreferences = (backup.preferences ?? []).filter((preference) => preference.key !== 'activeWorkspace');
      restoredPreferences.push({ key: 'activeWorkspace', value: activeWorkspaceId, updatedAt: Date.now() });
      await database.preferences.bulkAdd(restoredPreferences);
    } else {
      // Legacy backups without a workspace catalog retain their old preference
      // behavior; startup will select and persist the migrated default workspace.
      await database.preferences.bulkAdd(backup.preferences ?? []);
    }
  });
  onProgress?.({ stage: 'Workspace restored', current: backup.files.length, total: backup.files.length });
}
