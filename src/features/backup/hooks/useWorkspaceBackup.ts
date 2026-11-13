import { useCallback } from 'react';
import { db } from '../../../storage/database';
import { parseBackupFile } from '../parse';
import { platform } from '../../../platform';
import { exportWorkspaceBackup } from '../../../services/exportBackup';
import { restoreWorkspaceBackup } from '../../../services/restoreBackup';

type RequestConfirmation = (title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>, destructive?: boolean) => void;

export function useWorkspaceBackup(
  flushPendingSaves: () => Promise<void>,
  requestConfirmation: RequestConfirmation,
  onError: (message: string) => void,
  onRestored: () => Promise<void>,
) {
  const openBackup = useCallback(async (file: File | undefined, input?: HTMLInputElement | null) => {
    if (!file) return;
    try {
      const backup = await parseBackupFile(file);
      requestConfirmation(
        'Restore workspace backup?',
        'Restoring replaces the current workspaces, projects, folders, files, and preferences.',
        'Restore backup',
        async () => {
          await flushPendingSaves();
          await restoreWorkspaceBackup(db, backup);
          await onRestored();
        },
        true,
      );
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Unable to restore this backup.'); }
    finally { if (input) input.value = ''; }
  }, [flushPendingSaves, onError, onRestored, requestConfirmation]);

  const restoreFromPicker = useCallback(async (input?: HTMLInputElement | null) => {
    if (!platform.capabilities.nativeBackupOpen) { input?.click(); return; }
    try { await openBackup(await platform.chooseBackup() ?? undefined, input); }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not open the backup picker.'); }
  }, [onError, openBackup]);

  const saveWorkspaceBackup = useCallback(async () => {
    try {
      await exportWorkspaceBackup(db, platform);
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not create the workspace backup.'); }
  }, [onError]);

  return { openBackup, restoreFromPicker, saveWorkspaceBackup };
}
