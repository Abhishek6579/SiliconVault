import { useCallback } from 'react';
import { db } from '../../../storage/database';
import { downloadBackup, exportBackupStream, importBackup } from '../../../storage/backup';
import { parseBackupFile } from '../parse';
import { chooseBackupToRestore, isDesktopApp, saveBackupToDesktop } from '../../../platform/desktop';

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
          await importBackup(db, backup);
          await onRestored();
        },
        true,
      );
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Unable to restore this backup.'); }
    finally { if (input) input.value = ''; }
  }, [flushPendingSaves, onError, onRestored, requestConfirmation]);

  const restoreFromPicker = useCallback(async (input?: HTMLInputElement | null) => {
    if (!isDesktopApp()) { input?.click(); return; }
    try { await openBackup(await chooseBackupToRestore() ?? undefined, input); }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not open the backup picker.'); }
  }, [onError, openBackup]);

  const saveWorkspaceBackup = useCallback(async () => {
    try {
      if (isDesktopApp()) await saveBackupToDesktop(exportBackupStream(db));
      else await downloadBackup(db);
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not create the workspace backup.'); }
  }, [onError]);

  return { openBackup, restoreFromPicker, saveWorkspaceBackup };
}
