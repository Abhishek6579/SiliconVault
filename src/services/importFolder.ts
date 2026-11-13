import { normalizeRelativePath } from '../domain/paths';
import { getOrCreateImportedFolder } from '../storage/hierarchy';
import { importFile } from '../storage/files';
import type { WorkspaceDatabase } from '../storage/database';
import type { ImportProgress, ImportTarget } from './importTypes';

export async function importFolder(
  database: WorkspaceDatabase,
  files: Iterable<File> | AsyncIterable<File>,
  target: ImportTarget,
  getRelativePath: (file: File) => string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<{ imported: number; rootFolderId?: string }> {
  const folderIds = new Map<string, string>();
  const length = (files as { length?: unknown }).length;
  let total = typeof length === 'number' && Number.isInteger(length) && length >= 0 ? length : null;
  let imported = 0;
  onProgress?.({ completed: 0, total, fileName: '' });
  for await (const file of files) {
    const currentLength = (files as { length?: unknown }).length;
    if (total === null && typeof currentLength === 'number' && Number.isInteger(currentLength)) total = currentLength;
    onProgress?.({ completed: imported, total, fileName: file.name });
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
    onProgress?.({ completed: imported, total, fileName: file.name });
  }
  return { imported, rootFolderId: folderIds.values().next().value };
}
