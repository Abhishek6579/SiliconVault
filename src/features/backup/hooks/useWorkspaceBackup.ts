import { useCallback } from 'react';
import { db } from '../../../storage/database';
import { parseBackupFile } from '../parse';
import { platform } from '../../../platform';
import { exportWorkspaceBackup } from '../../../services/exportBackup';
import { restoreWorkspaceBackup } from '../../../services/restoreBackup';
import { logger } from '../../../logger.js';
import { errorContext } from '../../../shared/logging/errorContext';

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
      void logger.info('backup.restore.parse_started', 'Backup validation started.', { sizeBytes: file.size });
      const backup = await parseBackupFile(file);
      requestConfirmation(
        'Restore workspace backup?',
        'Restoring replaces the current workspaces, projects, folders, files, and preferences.',
        'Restore backup',
        async () => {
          void logger.info('backup.restore.started', 'Workspace restore started.');
          try {
            await flushPendingSaves();
            await restoreWorkspaceBackup(db, backup);
            await onRestored();
            void logger.info('backup.restore.completed', 'Workspace restore completed.');
          } catch (reason) {
            void logger.error('backup.restore.failed', 'Workspace restore failed.', errorContext(reason));
            onError(`Workspace restore failed: ${reason instanceof Error ? reason.message : 'Unexpected error'}. Check Diagnostics for event backup.restore.failed.`);
          }
        },
        true,
      );
    } catch (reason) {
      void logger.error('backup.restore.validation_failed', 'Backup could not be parsed or validated.', errorContext(reason));
      onError(`Backup validation failed: ${reason instanceof Error ? reason.message : 'Unexpected error'}. Check Diagnostics for event backup.restore.validation_failed.`);
    }
    finally { if (input) input.value = ''; }
  }, [flushPendingSaves, onError, onRestored, requestConfirmation]);

  const restoreFromPicker = useCallback(async (input?: HTMLInputElement | null) => {
    if (!platform.capabilities.nativeBackupOpen) { input?.click(); return; }
    try { await openBackup(await platform.chooseBackup() ?? undefined, input); }
    catch (reason) {
      void logger.error('backup.restore.picker_failed', 'The backup file picker failed.', errorContext(reason));
      onError(`Could not open the backup picker: ${reason instanceof Error ? reason.message : 'Unexpected error'}. Check Diagnostics for event backup.restore.picker_failed.`);
    }
  }, [onError, openBackup]);

  const saveWorkspaceBackup = useCallback(async () => {
    void logger.info('backup.export.started', 'Workspace backup export started.');
    try {
      const saved = await exportWorkspaceBackup(db, platform);
      if (saved) void logger.info('backup.export.completed', 'Workspace backup export completed.');
      else void logger.info('backup.export.cancelled', 'Workspace backup export was cancelled in the save dialog.');
    } catch (reason) {
      void logger.error('backup.export.failed', 'Workspace backup export failed before completion.', errorContext(reason));
      onError(`Workspace backup export failed: ${reason instanceof Error ? reason.message : 'Unexpected error'}. The file may be incomplete; do not restore it. Check Diagnostics for event backup.export.failed.`);
    }
  }, [onError]);

  return { openBackup, restoreFromPicker, saveWorkspaceBackup };
}
