import { DEFAULT_WORKSPACE_ID, type WorkspaceDatabase } from './database';
import type { Workspace } from './types';
import { collectDescendantIds } from './tree';

function newId(): string {
  return crypto.randomUUID();
}

async function destinationFor(database: WorkspaceDatabase, parentFolderId: string | null, requestedProjectId?: string | null, requestedWorkspaceId?: string): Promise<{ projectId: string | null; workspaceId: string }> {
  if (parentFolderId) {
    const parent = await database.folders.get(parentFolderId);
    if (!parent) throw new Error('The destination folder does not exist.');
    if (requestedProjectId !== undefined && requestedProjectId !== parent.projectId) {
      throw new Error('A folder and its parent must belong to the same project.');
    }
    if (requestedWorkspaceId !== undefined && requestedWorkspaceId !== parent.workspaceId) {
      throw new Error('A folder and its parent must belong to the same workspace.');
    }
    return { projectId: parent.projectId, workspaceId: parent.workspaceId };
  }
  const projectId = requestedProjectId ?? null;
  const project = projectId ? await database.projects.get(projectId) : undefined;
  if (projectId && !project) throw new Error('The destination project does not exist.');
  const workspaceId = requestedWorkspaceId ?? project?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (!(await database.workspaces.get(workspaceId))) throw new Error('The destination workspace does not exist.');
  if (project && project.workspaceId !== workspaceId) throw new Error('A project and its files must belong to the same workspace.');
  return { projectId, workspaceId };
}

export async function createFolder(database: WorkspaceDatabase, name: string, parentFolderId: string | null = null, projectId?: string | null, workspaceId?: string) {
  return database.transaction('rw', database.folders, database.projects, database.workspaces, async () => {
    const destination = await destinationFor(database, parentFolderId, projectId, workspaceId);
    const now = Date.now();
    const folder = { id: newId(), name, parentFolderId, projectId: destination.projectId, workspaceId: destination.workspaceId, createdAt: now, updatedAt: now };
    await database.folders.add(folder);
    return folder;
  });
}

export async function moveFolder(database: WorkspaceDatabase, folderId: string, parentFolderId: string | null, projectId?: string | null, workspaceId?: string): Promise<void> {
  await database.transaction('rw', database.folders, database.projects, database.workspaces, database.files, async () => {
    const folder = await database.folders.get(folderId);
    if (!folder) throw new Error('The folder does not exist.');
    const destination = await destinationFor(database, parentFolderId, projectId, workspaceId ?? (parentFolderId ? undefined : folder.workspaceId));
    const allFolders = await database.folders.toArray();
    const descendants = collectDescendantIds(allFolders, folderId);
    const descendantSet = new Set(descendants);
    if (parentFolderId && descendantSet.has(parentFolderId)) throw new Error('A folder cannot be moved into its own subtree.');
    const foldersById = new Map(allFolders.map((item) => [item.id, item]));
    const now = Date.now();
    await database.folders.bulkPut(descendants.map((descendantId) => {
      const current = foldersById.get(descendantId)!;
      return {
        ...current,
        parentFolderId: descendantId === folderId ? parentFolderId : current.parentFolderId,
        projectId: destination.projectId,
        workspaceId: destination.workspaceId,
        updatedAt: now,
      };
    }));
    await database.files.where('parentFolderId').anyOf(descendants).modify({ projectId: destination.projectId, workspaceId: destination.workspaceId, updatedAt: now });
  });
}

export async function moveFile(database: WorkspaceDatabase, fileId: string, parentFolderId: string | null, projectId?: string | null, workspaceId?: string): Promise<void> {
  await database.transaction('rw', database.files, database.folders, database.projects, database.workspaces, async () => {
    const file = await database.files.get(fileId);
    if (!file) throw new Error('The file does not exist.');
    const destination = await destinationFor(database, parentFolderId, projectId, workspaceId ?? (parentFolderId ? undefined : file.workspaceId));
    await database.files.update(fileId, { parentFolderId, projectId: destination.projectId, workspaceId: destination.workspaceId, updatedAt: Date.now() });
  });
}

export async function softDeleteProject(database: WorkspaceDatabase, projectId: string): Promise<void> {
  await database.transaction('rw', database.projects, database.files, async () => {
    const project = await database.projects.get(projectId);
    if (!project) throw new Error('The project does not exist.');
    const now = Date.now();
    await database.files.where('[projectId+deletedAt]').equals([projectId, null]).modify({ deletedAt: now, updatedAt: now });
    await database.projects.update(projectId, { archived: true, archivedAt: now, updatedAt: now });
  });
}

/** Restore files hidden by project archival without reviving older Trash entries. */
export async function restoreProject(database: WorkspaceDatabase, projectId: string): Promise<void> {
  await database.transaction('rw', database.projects, database.files, async () => {
    const project = await database.projects.get(projectId);
    if (!project) throw new Error('The project does not exist.');
    const now = Date.now();
    const archivedAt = project.archivedAt;
    if (archivedAt != null) {
      await database.files.where('[projectId+deletedAt]').equals([projectId, archivedAt]).modify({ deletedAt: null, updatedAt: now });
    } else {
      await database.files.where('projectId').equals(projectId)
        .filter((file) => file.deletedAt !== null)
        .modify({ deletedAt: null, updatedAt: now });
    }
    await database.projects.update(projectId, { archived: false, archivedAt: null, updatedAt: now });
  });
}

export async function deleteWorkspace(database: WorkspaceDatabase, workspaceId: string): Promise<Workspace> {
  return database.transaction('rw', [database.files, database.contents, database.folders, database.projects, database.workspaces, database.preferences], async () => {
    const workspace = await database.workspaces.get(workspaceId);
    if (!workspace) throw new Error('The workspace does not exist.');
    const activePreference = await database.preferences.get('activeWorkspace');
    const fileIds = await database.files.where('workspaceId').equals(workspaceId).primaryKeys();
    await database.contents.bulkDelete(fileIds);
    await database.files.where('workspaceId').equals(workspaceId).delete();
    await database.folders.where('workspaceId').equals(workspaceId).delete();
    await database.projects.where('workspaceId').equals(workspaceId).delete();
    await database.workspaces.delete(workspaceId);
    await database.preferences.bulkDelete(fileIds.map((id) => `pdf:${id}`));

    const remaining = await database.workspaces.toArray();
    let replacement = remaining[0];
    if (!replacement) {
      const now = Date.now();
      replacement = { id: crypto.randomUUID(), name: 'My Workspace', createdAt: now, updatedAt: now };
      await database.workspaces.add(replacement);
    }
    const activeStillExists = remaining.some((item) => item.id === activePreference?.value);
    const nextActive = activePreference?.value === workspaceId || !activeStillExists
      ? replacement.id
      : String(activePreference?.value);
    await database.preferences.put({ key: 'activeWorkspace', value: nextActive, updatedAt: Date.now() });
    return remaining.find((item) => item.id === nextActive) ?? replacement;
  });
}
