import { db } from './database';
import type { WorkspaceDatabase } from './database';
import type { FileMeta, Folder, Project, Workspace, WorkspacePreference } from './types';
import { readPreference, writePreference } from './preferenceStore';

export interface WorkspaceCatalog {
  files: FileMeta[];
  folders: Folder[];
  projects: Project[];
  workspaces: Workspace[];
}

/** Loads metadata tables only; document contents remain lazy-loaded by the tab storage layer. */
export async function loadWorkspaceCatalog(database: WorkspaceDatabase = db): Promise<WorkspaceCatalog> {
  const [files, folders, projects, workspaces] = await Promise.all([
    database.files.toArray(), database.folders.toArray(), database.projects.toArray(), database.workspaces.toArray(),
  ]);
  return { files, folders, projects, workspaces };
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  return db.workspaces.get(id);
}

export async function getWorkspacePreference(key: string): Promise<WorkspacePreference | undefined> {
  return readPreference(key);
}

export async function setWorkspacePreference(key: string, value: unknown, updatedAt = Date.now()): Promise<void> {
  await writePreference(key, value, updatedAt);
}

export async function createWorkspace(workspace: Workspace): Promise<void> {
  await db.workspaces.add(workspace);
}

export async function renameWorkspace(id: string, name: string, updatedAt = Date.now()): Promise<void> {
  await db.workspaces.update(id, { name, updatedAt });
}

export async function createProject(project: Project): Promise<void> {
  await db.projects.add(project);
}

export async function renameProject(id: string, name: string, updatedAt = Date.now()): Promise<void> {
  await db.projects.update(id, { name, updatedAt });
}
