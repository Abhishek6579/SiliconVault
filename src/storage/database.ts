import Dexie, { type Table, type Transaction } from 'dexie';
import type { FileContent, FileMeta, Folder, Project } from './types';

export const DATABASE_NAME = 'engineering-workspace';
export const DATABASE_VERSION = 1;

/** Initial schema for a fresh workspace. Future schema changes must be named migrations. */
export async function migrateToUnifiedMetadata(_transaction: Transaction): Promise<void> {
  // Version 1 has no predecessor in this fresh workspace. Keep a named migration
  // hook so later schema changes have an explicit, testable migration entry point.
}

export class WorkspaceDatabase extends Dexie {
  files!: Table<FileMeta, string>;
  contents!: Table<FileContent, string>;
  folders!: Table<Folder, string>;
  projects!: Table<Project, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(DATABASE_VERSION).stores({
      files: '&id, kind, name, parentFolderId, projectId, createdAt, updatedAt, deletedAt',
      contents: '&fileId',
      folders: '&id, name, parentFolderId, projectId, createdAt, updatedAt',
      projects: '&id, name, archived, createdAt, updatedAt',
    }).upgrade(migrateToUnifiedMetadata);
  }
}

export const db = new WorkspaceDatabase();
