import { OPENABLE_KINDS } from '../shared/constants/fileKinds';
import { importFile } from '../storage/files';
import type { WorkspaceDatabase } from '../storage/database';
import type { FileMeta } from '../storage/types';
import type { ImportTarget } from './importFolder';

export async function importFiles(
  database: WorkspaceDatabase,
  files: Iterable<File> | AsyncIterable<File>,
  target: ImportTarget,
  openFile: (file: FileMeta) => Promise<void>,
): Promise<number> {
  let imported = 0;
  for await (const file of files) {
    const meta = await importFile(database, file, {
      parentFolderId: target.folderId,
      projectId: target.projectId,
      workspaceId: target.workspaceId,
    });
    if (OPENABLE_KINDS.has(meta.kind)) await openFile(meta);
    imported += 1;
  }
  return imported;
}
