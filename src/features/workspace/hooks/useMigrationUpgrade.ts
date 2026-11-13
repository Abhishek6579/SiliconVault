import { useState } from 'react';
import { db, WorkspaceDatabaseV1, WorkspaceDatabaseV2 } from '../../../storage/database';
import { migrateLegacyUiPreferences } from '../../../storage/preferences';
import { downloadBackup, exportBackupStream } from '../../../storage/backup';
import { platform } from '../../../platform';
import type { Workspace } from '../../../storage/types';

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

  async function downloadMigrationBackupAndUpgrade() {
    if (migrationBackup === null) return;
    setUpgrading(true);
    setMigrationError('');
    const previous = migrationBackup === 1 ? new WorkspaceDatabaseV1() : new WorkspaceDatabaseV2();
    try {
      await previous.open();
      if (!platform.capabilities.nativeBackupSave) {
        await downloadBackup(previous);
        setMigrationError('The browser cannot confirm that the backup was saved. The migration was not started. Use the desktop app and save the backup through its native save dialog.');
        return;
      }
      const backupSaved = await platform.saveBackup(exportBackupStream(previous));
      if (!backupSaved) {
        setMigrationError('Backup saving was cancelled. The database migration was not started; your existing database remains unchanged.');
        return;
      }
      previous.close();
      await db.open();
      const uiPreferences = await migrateLegacyUiPreferences(db, localStorage);
      setAppZoom(uiPreferences.appZoom);
      setEditorFontSize(uiPreferences.editorFontSize);
      setPreferencesReady(true);
      const theme = await db.preferences.get('theme');
      setDarkTheme(theme ? theme.value === 'dark' : true);
      const selectedPreference = await db.preferences.get('activeWorkspace');
      const nextWorkspaces = await db.workspaces.toArray();
      setWorkspaces(nextWorkspaces);
      setActiveWorkspaceId(nextWorkspaces.find((workspace) => workspace.id === selectedPreference?.value)?.id ?? nextWorkspaces[0]?.id ?? null);
      setMigrationBackup(null);
      await refresh();
    } catch (reason) {
      setMigrationError(reason instanceof Error ? reason.message : 'The workspace upgrade could not be completed. Your existing database remains unchanged unless the upgrade completed.');
      setLoading(false);
    } finally {
      previous.close();
      setUpgrading(false);
    }
  }

  return { migrationBackup, setMigrationBackup, migrationError, upgrading, downloadMigrationBackupAndUpgrade };
}
