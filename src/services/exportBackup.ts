import { downloadBackup, exportBackupStream, prepareBackupExport, type BackupProgressReporter } from '../storage/backup';
import type { PlatformAdapter } from '../platform/types';

type BackupDatabase = Parameters<typeof exportBackupStream>[0];

/** Export the current workspace using the host's native save dialog when available. */
export async function exportWorkspaceBackup(
  database: BackupDatabase,
  platform: Pick<PlatformAdapter, 'capabilities' | 'saveBackup'>,
  onProgress?: BackupProgressReporter,
): Promise<boolean> {
  if (platform.capabilities.nativeBackupSave) {
    const prepared = await prepareBackupExport(database, onProgress);
    onProgress?.({ stage: 'Waiting for save location', current: 0, total: null });
    const saved = await platform.saveBackup(exportBackupStream(database, prepared, onProgress));
    if (saved) onProgress?.({ stage: 'Backup saved', current: prepared.files.length, total: prepared.files.length });
    return saved;
  }

  await downloadBackup(database, onProgress);
  return true;
}
