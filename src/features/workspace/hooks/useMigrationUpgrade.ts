import { useState } from 'react';
import { db, openWorkspaceDatabase, WorkspaceDatabaseV1, WorkspaceDatabaseV2 } from '../../../storage/database';
import { migrateLegacyUiPreferences } from '../../../storage/preferences';
import { downloadBackup, exportBackupStream } from '../../../storage/backup';
import { platform } from '../../../platform';
import { getWorkspacePreference, loadWorkspaceCatalog } from '../../../storage/workspaceCatalog';
import type { Workspace } from '../../../storage/types';
import { logger } from '../../../logger.js';
import { errorContext } from '../../../shared/logging/errorContext';
import { useActivity } from '../../../shared/activity/ActivityContext';

interface Options {
  setLoading: (loading: boolean) => void;
  setError: (message: string) => void;
  setAppZoom: (value: number) => void;
  setEditorFontSize: (value: number) => void;
  setPreferencesReady: (ready: boolean) => void;
  setDarkTheme: (dark: boolean) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

export function useMigrationUpgrade(options: Options) {
  const [migrationBackup, setMigrationBackup] = useState<number | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const { setLoading, setError, setAppZoom, setEditorFontSize, setPreferencesReady, setDarkTheme, setWorkspaces, setActiveWorkspaceId, refresh } = options;
  const { startActivity } = useActivity();

  async function downloadMigrationBackupAndUpgrade() {
    if (migrationBackup === null) return;
    setUpgrading(true);
    setMigrationError('');
    const activity = startActivity('Upgrading workspace', 'Creating a safety backup…');
    const previous = migrationBackup === 1 ? new WorkspaceDatabaseV1() : new WorkspaceDatabaseV2();
    try {
      await previous.open();
      const report = (progress: { stage: string; current: number; total: number | null; item?: string }) => activity.update({
        detail: progress.item ? `${progress.stage}: ${progress.item}` : progress.stage,
        current: progress.current,
        total: progress.total,
      });
      if (!platform.capabilities.nativeBackupSave) {
        await downloadBackup(previous, report);
        setMigrationError('The browser cannot confirm that the backup was saved. The migration was not started. Use the desktop app and save the backup through its native save dialog.');
        activity.complete('Safety backup downloaded; migration not started');
        return;
      }
      const backupSaved = await platform.saveBackup(exportBackupStream(previous, undefined, report));
      if (!backupSaved) {
        setMigrationError('Backup saving was cancelled. The database migration was not started; your existing database remains unchanged.');
        activity.dismiss();
        return;
      }
      previous.close();
      activity.update({ detail: 'Opening upgraded workspace database…', current: 0, total: null });
      await openWorkspaceDatabase();
      const uiPreferences = await migrateLegacyUiPreferences(db, localStorage);
      setAppZoom(uiPreferences.appZoom);
      setEditorFontSize(uiPreferences.editorFontSize);
      setPreferencesReady(true);
      const theme = await getWorkspacePreference('theme');
      setDarkTheme(theme ? theme.value === 'dark' : true);
      const selectedPreference = await getWorkspacePreference('activeWorkspace');
      const { workspaces: nextWorkspaces } = await loadWorkspaceCatalog();
      setWorkspaces(nextWorkspaces);
      setActiveWorkspaceId(nextWorkspaces.find((workspace) => workspace.id === selectedPreference?.value)?.id ?? nextWorkspaces[0]?.id ?? null);
      setMigrationBackup(null);
      activity.update({ detail: 'Refreshing workspace…', current: 0, total: null });
      await refresh();
      activity.complete('Workspace upgraded successfully');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The workspace upgrade could not be completed.';
      activity.fail(message);
      void logger.error('storage.migration.failed', 'Database migration or recovery failed.', errorContext(reason));
      setMigrationError(message);
      setLoading(false);
    } finally {
      previous.close();
      setUpgrading(false);
    }
  }

  return { migrationBackup, setMigrationBackup, migrationError, upgrading, downloadMigrationBackupAndUpgrade };
}
