import { importBackup, type BackupProgressReporter } from '../storage/backup';
import type { WorkspaceDatabase } from '../storage/database';

/** Validate and atomically restore a parsed workspace backup. */
export async function restoreWorkspaceBackup(
  database: WorkspaceDatabase,
  value: unknown,
  onProgress?: BackupProgressReporter,
): Promise<void> {
  await importBackup(database, value, onProgress);
}
