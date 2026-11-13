import { useCallback, useState } from 'react';
import { getWorkspace, loadWorkspaceCatalog, setWorkspacePreference } from '../../../storage/workspaceCatalog';
import type { FileMeta, Folder, Project, Workspace } from '../../../storage/types';
import { logger } from '../../../logger.js';
import { errorContext } from '../../../shared/logging/errorContext';

/** Owns the persisted workspace catalog and the currently selected workspace. */
export function useWorkspace(onError: (message: string) => void, onLoading: (loading: boolean) => void) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { files: nextFiles, folders: nextFolders, projects: nextProjects, workspaces: nextWorkspaces } = await loadWorkspaceCatalog();
      setFiles(nextFiles);
      setFolders(nextFolders);
      setProjects(nextProjects);
      setWorkspaces(nextWorkspaces);
      // Do not clear errors on success. That would hide a save failure shown moments earlier.
    } catch (reason) {
      console.error('Workspace refresh failed:', reason);
      void logger.error('workspace.refresh.failed', 'Workspace metadata refresh failed.', errorContext(reason));
      onError(reason instanceof Error ? reason.message : 'Could not open the local workspace.');
    } finally {
      onLoading(false);
    }
  }, [onError, onLoading]);

  const switchWorkspace = useCallback(async (id: string) => {
    try {
      const exists = await getWorkspace(id);
      if (!exists) {
        onError('That workspace no longer exists.');
        return;
      }
      await setWorkspacePreference('activeWorkspace', id);
      setActiveWorkspaceId(id);
      void logger.info('workspace.switch.completed', 'Active workspace changed.');
    } catch (reason) {
      console.error('Workspace switch failed:', reason);
      void logger.error('workspace.switch.failed', 'Active workspace could not be changed.', errorContext(reason));
      onError(reason instanceof Error ? reason.message : 'Could not switch workspace.');
    }
  }, [onError]);

  return {
    files, setFiles,
    folders, setFolders,
    projects, setProjects,
    workspaces, setWorkspaces,
    activeWorkspaceId, setActiveWorkspaceId,
    refresh, switchWorkspace,
  };
}
