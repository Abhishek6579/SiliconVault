import { downloadBackup, exportBackupStream } from '../storage/backup';
import type { PlatformAdapter } from '../platform/types';

type BackupDatabase = Parameters<typeof exportBackupStream>[0];

/** Export the current workspace using the host's native save dialog when available. */
export async function exportWorkspaceBackup(
  database: BackupDatabase,
  platform: Pick<PlatformAdapter, 'capabilities' | 'saveBackup'>,
): Promise<void> {
  if (platform.capabilities.nativeBackupSave) {
    await platform.saveBackup(exportBackupStream(database));
    return;
  }

  await downloadBackup(database as Parameters<typeof downloadBackup>[0]);
}
