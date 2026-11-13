import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import { db } from '../../../storage/database';
import { saveWorkspaceSession } from '../../../storage/tabSession';
import type { Workspace } from '../../../storage/types';
import type { Tab } from '../../tabs/types';
import type { WorkspaceView } from '../context/WorkspaceNavContext';

interface Options {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  workspaceTabs: Tab[];
  activeTabId: string | null;
  switchWorkspace: (id: string) => Promise<void>;
  restoreWorkspaceTabs: (id: string) => Promise<void>;
  setActiveProject: Dispatch<SetStateAction<string | null>>;
  setSelectedFolder: Dispatch<SetStateAction<string | null>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
  setView: Dispatch<SetStateAction<WorkspaceView>>;
  setWorkspaceMenuOpen: Dispatch<SetStateAction<boolean>>;
  setContextMenu: Dispatch<SetStateAction<{ type: 'file' | 'folder' | 'project'; id: string; x: number; y: number } | null>>;
}

export function useWorkspaceNavigationActions(options: Options) {
  const {
    workspaces, activeWorkspaceId, workspaceTabs, activeTabId, switchWorkspace: persistWorkspaceSwitch,
    restoreWorkspaceTabs, setActiveProject, setSelectedFolder, setActiveTabId, setView,
    setWorkspaceMenuOpen, setContextMenu,
  } = options;

  function showContextMenu(type: 'file' | 'folder' | 'project', id: string, event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setWorkspaceMenuOpen(false);
    setContextMenu({ type, id, x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 260) });
  }

  async function switchProject(projectId: string | null) {
    setActiveProject(projectId);
    setSelectedFolder(null);
    setView('workspace');
    setActiveTabId(null);
    setWorkspaceMenuOpen(false);
  }

  async function switchWorkspace(workspaceId: string) {
    if (!workspaces.some((item) => item.id === workspaceId)) return;
    if (activeWorkspaceId) {
      await saveWorkspaceSession(db, activeWorkspaceId, workspaceTabs.map((tab) => tab.id), activeTabId);
    }
    await persistWorkspaceSwitch(workspaceId);
    await restoreWorkspaceTabs(workspaceId);
    setActiveProject(null);
    setSelectedFolder(null);
    setView('workspace');
    setWorkspaceMenuOpen(false);
  }

  return { showContextMenu, switchProject, switchWorkspace };
}
