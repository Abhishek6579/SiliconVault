import Dexie, { type Table, type Transaction } from 'dexie';
import type { FileContent, FileMeta, Folder, Project, Workspace, WorkspacePreference } from './types';

export const DATABASE_NAME = 'engineering-workspace';
export const DATABASE_VERSION = 3;
export const DEFAULT_WORKSPACE_ID = 'workspace-default';

export async function existingDatabaseVersion(name = DATABASE_NAME): Promise<number> {
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string; version?: number }>> };
  if (factory.databases) {
    const databases = await factory.databases();
    return databases.find((database) => database.name === name)?.version ?? 0;
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let createdDuringCheck = false;
    request.onupgradeneeded = (event) => {
      if ((event as IDBVersionChangeEvent).oldVersion === 0) {
        createdDuringCheck = true;
        request.transaction?.abort();
      }
    };
    request.onsuccess = () => {
      const version = request.result.version;
      request.result.close();
      resolve(version);
    };
    request.onerror = () => {
      if (createdDuringCheck && request.error?.name === 'AbortError') resolve(0);
      else reject(request.error ?? new Error('Could not inspect the local database version.'));
    };
  });
}

const VERSION_ONE_STORES = {
  files: '&id, kind, name, parentFolderId, projectId, createdAt, updatedAt, deletedAt',
  contents: '&fileId',
  folders: '&id, name, parentFolderId, projectId, createdAt, updatedAt',
  projects: '&id, name, archived, createdAt, updatedAt',
};

const VERSION_TWO_STORES = { ...VERSION_ONE_STORES, preferences: '&key, updatedAt' };
const VERSION_THREE_STORES = {
  files: '&id, workspaceId, kind, name, parentFolderId, projectId, createdAt, updatedAt, deletedAt',
  contents: '&fileId',
  folders: '&id, workspaceId, name, parentFolderId, projectId, createdAt, updatedAt',
  projects: '&id, workspaceId, name, archived, createdAt, updatedAt',
  preferences: '&key, updatedAt',
  workspaces: '&id, name, createdAt, updatedAt',
};

/** Initial schema for a fresh workspace. Future schema changes must be named migrations. */
export async function migrateToUnifiedMetadata(_transaction: Transaction): Promise<void> {
  // Version 1 has no predecessor in this fresh workspace. Keep a named migration
  // hook so later schema changes have an explicit, testable migration entry point.
}

/** Adds UI preferences without rewriting user files; IndexedDB rolls back failed upgrades atomically. */
export async function migrateToWorkspacePreferences(_transaction: Transaction): Promise<void> {
  // Version 2 only adds the preferences table. Existing file, folder, and project rows are preserved.
}

/** Gives all v1/v2 records a workspace and creates the initial workspace shell. */
export async function migrateToWorkspaces(transaction: Transaction): Promise<void> {
  const now = Date.now();
  const workspace: Workspace = { id: DEFAULT_WORKSPACE_ID, name: 'My Workspace', createdAt: now, updatedAt: now };
  await transaction.table('workspaces').put(workspace);
  for (const tableName of ['files', 'folders', 'projects']) {
    await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => {
      if (!record.workspaceId) record.workspaceId = DEFAULT_WORKSPACE_ID;
    });
  }
}

export class WorkspaceDatabaseV1 extends Dexie {
  files!: Table<FileMeta, string>;
  contents!: Table<FileContent, string>;
  folders!: Table<Folder, string>;
  projects!: Table<Project, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores(VERSION_ONE_STORES).upgrade(migrateToUnifiedMetadata);
  }
}

export class WorkspaceDatabaseV2 extends Dexie {
  files!: Table<FileMeta, string>;
  contents!: Table<FileContent, string>;
  folders!: Table<Folder, string>;
  projects!: Table<Project, string>;
  preferences!: Table<WorkspacePreference, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores(VERSION_ONE_STORES).upgrade(migrateToUnifiedMetadata);
    this.version(2).stores(VERSION_TWO_STORES).upgrade(migrateToWorkspacePreferences);
  }
}

export class WorkspaceDatabase extends Dexie {
  files!: Table<FileMeta, string>;
  contents!: Table<FileContent, string>;
  folders!: Table<Folder, string>;
  projects!: Table<Project, string>;
  preferences!: Table<WorkspacePreference, string>;
  workspaces!: Table<Workspace, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores(VERSION_ONE_STORES).upgrade(migrateToUnifiedMetadata);
    this.version(2).stores(VERSION_TWO_STORES).upgrade(migrateToWorkspacePreferences);
    this.version(DATABASE_VERSION).stores(VERSION_THREE_STORES).upgrade(migrateToWorkspaces);
    this.on('populate', (transaction) => {
      const now = Date.now();
      return transaction.table('workspaces').add({ id: DEFAULT_WORKSPACE_ID, name: 'My Workspace', createdAt: now, updatedAt: now });
    });
  }
}

export const db = new WorkspaceDatabase();
