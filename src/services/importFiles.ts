import { OPENABLE_KINDS } from '../shared/constants/fileKinds';
import { importFile } from '../storage/files';
import type { WorkspaceDatabase } from '../storage/database';
import type { FileMeta } from '../storage/types';
import type { ImportProgress, ImportTarget } from './importTypes';

function getKnownTotal(files: Iterable<File> | AsyncIterable<File>): number | null {
  const length = (files as { length?: unknown }).length;
  return typeof length === 'number' && Number.isInteger(length) && length >= 0 ? length : null;
}

export async function importFiles(
  database: WorkspaceDatabase,
  files: Iterable<File> | AsyncIterable<File>,
  target: ImportTarget,
  openFile: (file: FileMeta) => Promise<void>,
  onProgress?: (progress: ImportProgress) => void,
): Promise<number> {
  let imported = 0;
  let total = getKnownTotal(files);
  onProgress?.({ completed: 0, total, fileName: '' });
  for await (const file of files) {
    total = total ?? getKnownTotal(files);
    onProgress?.({ completed: imported, total, fileName: file.name });
    const meta = await importFile(database, file, {
      parentFolderId: target.folderId,
      projectId: target.projectId,
      workspaceId: target.workspaceId,
    });
    if (OPENABLE_KINDS.has(meta.kind)) await openFile(meta);
    imported += 1;
    onProgress?.({ completed: imported, total, fileName: file.name });
  }
  return imported;
}
