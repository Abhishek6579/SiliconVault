import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { DATABASE_NAME, DATABASE_VERSION, db, existingDatabaseVersion, openWorkspaceDatabase } from '../../../storage/database';
import { migrateLegacyUiPreferences } from '../../../storage/preferences';
import { getWorkspacePreference, loadWorkspaceCatalog, setWorkspacePreference } from '../../../storage/workspaceCatalog';
import type { Workspace } from '../../../storage/types';
import { logger } from '../../../logger.js';
import { errorContext } from '../../../shared/logging/errorContext';

interface Options {
  refresh: () => Promise<void>;
  setMigrationBackup: Dispatch<SetStateAction<number | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: (message: string) => void;
  setAppZoom: Dispatch<SetStateAction<number>>;
  setEditorFontSize: Dispatch<SetStateAction<number>>;
  setPreferencesReady: (ready: boolean) => void;
  setDarkTheme: Dispatch<SetStateAction<boolean>>;
  setWorkspaces: Dispatch<SetStateAction<Workspace[]>>;
  setActiveWorkspaceId: Dispatch<SetStateAction<string | null>>;
  restoreTabs: (workspaceId: string) => Promise<unknown>;
}

/** Opens the local database and restores persisted app and workspace selections. */
export function useWorkspaceInitialization(options: Options) {
  const {
    refresh, setMigrationBackup, setLoading, setError, setAppZoom, setEditorFontSize,
    setPreferencesReady, setDarkTheme, setWorkspaces, setActiveWorkspaceId, restoreTabs,
  } = options;

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      void logger.info('app.startup.started', 'Local workspace startup started.');
      try {
        const version = await existingDatabaseVersion(DATABASE_NAME);
        if (version > 0 && version < DATABASE_VERSION) {
          if (alive) { setMigrationBackup(version); setLoading(false); }
          return;
        }
        await openWorkspaceDatabase();
        const uiPreferences = await migrateLegacyUiPreferences(db, localStorage);
        if (alive) { setAppZoom(uiPreferences.appZoom); setEditorFontSize(uiPreferences.editorFontSize); setPreferencesReady(true); }
        const theme = await getWorkspacePreference('theme');
        if (alive && theme) setDarkTheme(theme.value === 'dark');
        const storedWorkspace = await getWorkspacePreference('activeWorkspace');
        const { workspaces: nextWorkspaces } = await loadWorkspaceCatalog();
        const selectedWorkspace = nextWorkspaces.find((workspace) => workspace.id === storedWorkspace?.value)?.id ?? nextWorkspaces[0]?.id ?? null;
        if (alive) {
          setWorkspaces(nextWorkspaces);
          setActiveWorkspaceId(selectedWorkspace);
        }
        if (alive && selectedWorkspace && !storedWorkspace) await setWorkspacePreference('activeWorkspace', selectedWorkspace);
        if (alive && selectedWorkspace) await restoreTabs(selectedWorkspace);
        if (alive) await refresh();
        if (alive) void logger.info('app.startup.completed', 'Local workspace startup completed.', { workspaceCount: nextWorkspaces.length });
      } catch (reason) {
        void logger.error('app.startup.failed', 'Local workspace startup failed.', errorContext(reason));
        if (alive) { setError(reason instanceof Error ? reason.message : 'Could not open the local workspace.'); setLoading(false); }
      }
    };
    void initialize();
    return () => { alive = false; };
  }, [
    refresh, setActiveWorkspaceId, setAppZoom, setDarkTheme, setEditorFontSize, setError,
    setLoading, setMigrationBackup, setPreferencesReady, setWorkspaces, restoreTabs,
  ]);
}
