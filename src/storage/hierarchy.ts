import type { WorkspaceDatabase } from './database';

function newId(): string {
  return crypto.randomUUID();
}

async function projectForParent(database: WorkspaceDatabase, parentFolderId: string | null, requestedProjectId?: string | null): Promise<string | null> {
  if (parentFolderId) {
    const parent = await database.folders.get(parentFolderId);
    if (!parent) throw new Error('The destination folder does not exist.');
    if (requestedProjectId !== undefined && requestedProjectId !== parent.projectId) {
      throw new Error('A folder and its parent must belong to the same project.');
    }
    return parent.projectId;
  }
  const projectId = requestedProjectId ?? null;
  if (projectId && !(await database.projects.get(projectId))) throw new Error('The destination project does not exist.');
  return projectId;
}

export async function createFolder(database: WorkspaceDatabase, name: string, parentFolderId: string | null = null, projectId?: string | null) {
  return database.transaction('rw', database.folders, database.projects, async () => {
    const actualProjectId = await projectForParent(database, parentFolderId, projectId);
    const now = Date.now();
    const folder = { id: newId(), name, parentFolderId, projectId: actualProjectId, createdAt: now, updatedAt: now };
    await database.folders.add(folder);
    return folder;
  });
}

export async function moveFolder(database: WorkspaceDatabase, folderId: string, parentFolderId: string | null, projectId?: string | null): Promise<void> {
  await database.transaction('rw', database.folders, database.projects, database.files, async () => {
    const folder = await database.folders.get(folderId);
    if (!folder) throw new Error('The folder does not exist.');
    const destinationProjectId = await projectForParent(database, parentFolderId, projectId);
    const allFolders = await database.folders.toArray();
    const descendants = new Set<string>([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const candidate of allFolders) {
        if (candidate.parentFolderId && descendants.has(candidate.parentFolderId) && !descendants.has(candidate.id)) {
          descendants.add(candidate.id);
          grew = true;
        }
      }
    }
    if (parentFolderId && descendants.has(parentFolderId)) throw new Error('A folder cannot be moved into its own subtree.');
    const now = Date.now();
    for (const descendantId of descendants) {
      const current = allFolders.find((candidate) => candidate.id === descendantId)!;
      await database.folders.update(descendantId, {
        parentFolderId: descendantId === folderId ? parentFolderId : current.parentFolderId,
        projectId: destinationProjectId,
        updatedAt: now,
      });
    }
    await database.files.where('parentFolderId').anyOf([...descendants]).modify({ projectId: destinationProjectId, updatedAt: now });
  });
}

export async function moveFile(database: WorkspaceDatabase, fileId: string, parentFolderId: string | null, projectId?: string | null): Promise<void> {
  await database.transaction('rw', database.files, database.folders, database.projects, async () => {
    const file = await database.files.get(fileId);
    if (!file) throw new Error('The file does not exist.');
    const destinationProjectId = await projectForParent(database, parentFolderId, projectId);
    await database.files.update(fileId, { parentFolderId, projectId: destinationProjectId, updatedAt: Date.now() });
  });
}

export async function softDeleteProject(database: WorkspaceDatabase, projectId: string): Promise<void> {
  await database.transaction('rw', database.projects, database.files, async () => {
    const project = await database.projects.get(projectId);
    if (!project) throw new Error('The project does not exist.');
    const now = Date.now();
    await database.files.where('projectId').equals(projectId).modify({ deletedAt: now, updatedAt: now });
    await database.projects.update(projectId, { archived: true, updatedAt: now });
  });
}
