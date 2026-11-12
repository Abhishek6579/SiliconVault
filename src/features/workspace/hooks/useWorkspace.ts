import { useCallback, useState } from 'react';
import { db } from '../../../storage/database';
import type { FileMeta, Folder, Project, Workspace } from '../../../storage/types';

/** Owns the persisted workspace catalog and the currently selected workspace. */
export function useWorkspace(onError: (message: string) => void, onLoading: (loading: boolean) => void) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextFiles, nextFolders, nextProjects, nextWorkspaces] = await Promise.all([
        db.files.toArray(), db.folders.toArray(), db.projects.toArray(), db.workspaces.toArray(),
      ]);
      setFiles(nextFiles);
      setFolders(nextFolders);
      setProjects(nextProjects);
      setWorkspaces(nextWorkspaces);
      onError('');
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Could not open the local workspace.');
    } finally { onLoading(false); }
  }, [onError, onLoading]);

  const switchWorkspace = useCallback(async (id: string) => {
    await db.preferences.put({ key: 'activeWorkspace', value: id, updatedAt: Date.now() });
    setActiveWorkspaceId(id);
  }, []);

  return {
    files, setFiles, folders, setFolders, projects, setProjects,
    workspaces, setWorkspaces, activeWorkspaceId, setActiveWorkspaceId,
    refresh, switchWorkspace,
  };
}
