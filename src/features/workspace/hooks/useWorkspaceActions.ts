import type { Dispatch, SetStateAction } from 'react';
import { db } from '../../../storage/database';
import { deleteWorkspace } from '../../../storage/hierarchy';
import type { FileMeta, Folder, Project, Workspace } from '../../../storage/types';
import type { Tab } from '../../tabs/types';

type RequestInput = (title: string, initialValue: string, placeholder: string, confirmLabel: string, onConfirm: (value: string) => void | Promise<void>, message?: string) => void;
type RequestConfirmation = (title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>, destructive?: boolean) => void;
interface Options {
  files: FileMeta[]; folders: Folder[]; projects: Project[]; workspaces: Workspace[];
  activeWorkspaceId: string | null; activeTabId: string | null; tabs: Tab[];
  setTabs: Dispatch<SetStateAction<Tab[]>>; setActiveWorkspaceId: (id: string | null) => void;
  setActiveProject: (id: string | null) => void; setSelectedFolder: (id: string | null) => void;
  setActiveTabId: (id: string | null) => void; setView: (view: 'workspace' | 'recent' | 'trash') => void;
  refresh: () => Promise<void>; flushPendingSaves: () => Promise<void>;
  requestInput: RequestInput; requestConfirmation: RequestConfirmation;
}

/** Owns workspace creation, renaming, and safe deletion workflows. */
export function useWorkspaceActions(options: Options) {
  const { files, folders, projects, workspaces, activeWorkspaceId, activeTabId, tabs, setTabs,
    setActiveWorkspaceId, setActiveProject, setSelectedFolder, setActiveTabId, setView,
    refresh, flushPendingSaves, requestInput, requestConfirmation } = options;
  function createWorkspace() {
    requestInput('Create workspace', '', 'Workspace name', 'Create workspace', async (name) => {
      const now = Date.now();
      const workspace: Workspace = { id: crypto.randomUUID(), name: name.trim(), createdAt: now, updatedAt: now };
      await db.workspaces.add(workspace);
      await db.preferences.put({ key: 'activeWorkspace', value: workspace.id, updatedAt: now });
      setActiveWorkspaceId(workspace.id); setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); setView('workspace');
      await refresh();
    }, 'Each workspace has its own projects, folders, and files.');
  }
  function renameWorkspace(workspace: Workspace) {
    requestInput('Rename workspace', workspace.name, 'Workspace name', 'Save name', async (name) => {
      await db.workspaces.update(workspace.id, { name: name.trim(), updatedAt: Date.now() });
      await refresh();
    });
  }
  function deleteCurrentWorkspace() {
    const target = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
    if (!target) return;
    const fileCount = files.filter((file) => file.workspaceId === target.id).length;
    const folderCount = folders.filter((folder) => folder.workspaceId === target.id).length;
    const projectCount = projects.filter((project) => project.workspaceId === target.id).length;
    requestConfirmation('Delete workspace?', `Permanently delete “${target.name}” and its ${projectCount} project${projectCount === 1 ? '' : 's'}, ${folderCount} folder${folderCount === 1 ? '' : 's'}, and ${fileCount} file${fileCount === 1 ? '' : 's'}? This cannot be undone.`, 'Delete workspace', async () => {
      const closingTabs = tabs.filter((tab) => tab.meta.workspaceId === target.id);
      await flushPendingSaves();
      const nextWorkspace = await deleteWorkspace(db, target.id);
      setTabs((current) => current.filter((tab) => tab.meta.workspaceId !== target.id));
      if (activeTabId && closingTabs.some((tab) => tab.id === activeTabId)) setActiveTabId(null);
      if (activeWorkspaceId === target.id) {
        setActiveWorkspaceId(nextWorkspace.id); setActiveProject(null); setSelectedFolder(null); setView('workspace');
      }
      await refresh();
    }, true);
  }
  return { createWorkspace, renameWorkspace, deleteCurrentWorkspace };
}
