import { normalizeRelativePath } from '../domain/paths';
import { getOrCreateImportedFolder } from '../storage/hierarchy';
import { importFile } from '../storage/files';
import type { WorkspaceDatabase } from '../storage/database';

export interface ImportTarget {
  folderId: string | null;
  projectId: string | null;
  workspaceId: string;
}

export async function importFolder(
  database: WorkspaceDatabase,
  files: Iterable<File> | AsyncIterable<File>,
  target: ImportTarget,
  getRelativePath: (file: File) => string,
): Promise<{ imported: number; rootFolderId?: string }> {
  const folderIds = new Map<string, string>();
  let imported = 0;
  for await (const file of files) {
    const segments = normalizeRelativePath(getRelativePath(file)).split('/').filter(Boolean);
    const directorySegments = segments.slice(0, -1);
    let parentFolderId = target.folderId;
    let currentPath = '';
    for (const segment of directorySegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let folderId = folderIds.get(currentPath);
      if (!folderId) {
        const folder = await getOrCreateImportedFolder(database, segment, parentFolderId, target.projectId, target.workspaceId);
        folderId = folder.id;
        folderIds.set(currentPath, folderId);
      }
      parentFolderId = folderId;
    }
    await importFile(database, file, { parentFolderId, projectId: target.projectId, workspaceId: target.workspaceId });
    imported += 1;
  }
  return { imported, rootFolderId: folderIds.values().next().value };
}
