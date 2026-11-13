import type { Dispatch, SetStateAction } from 'react';
import { db } from '../../../storage/database';
import { moveFile, moveFolder, renameFolder, restoreProject as unarchiveProject, softDeleteProject } from '../../../storage/hierarchy';
import { countFolderItems, deleteFolderContents, emptyTrash, getFolderSubtreeIds, kindForFile, renameFile, restoreFile, softDeleteFile } from '../../../storage/files';
import type { FileMeta, Folder as FolderRecord, Project } from '../../../storage/types';
import type { Tab } from '../../tabs/types';
import type { ImportTarget } from '../../../services/importFolder';

type View = 'workspace' | 'recent' | 'trash';
export type ContextItemType = 'file' | 'folder' | 'project';
export interface ContextMenuState { type: ContextItemType; id: string; x: number; y: number; }
export interface MoveDialogState { type: 'file' | 'folder'; id: string; name: string; }

type RequestInput = (title: string, initialValue: string, placeholder: string, confirmLabel: string, onConfirm: (value: string) => void | Promise<void>, message?: string) => void;
type RequestConfirmation = (title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>, destructive?: boolean) => void;

interface UseItemActionsOptions {
  files: FileMeta[];
  folders: FolderRecord[];
  projects: Project[];
  tabs: Tab[];
  activeProject: string | null;
  selectedFolder: string | null;
  activeTabId: string | null;
  currentWorkspaceId: string;
  moveDialog: MoveDialogState | null;
  contextMenu: ContextMenuState | null;
  trashedFiles: FileMeta[];
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveProject: Dispatch<SetStateAction<string | null>>;
  setSelectedFolder: Dispatch<SetStateAction<string | null>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
  setView: Dispatch<SetStateAction<View>>;
  setMoveDialog: Dispatch<SetStateAction<MoveDialogState | null>>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  requestInput: RequestInput;
  requestConfirmation: RequestConfirmation;
  openFile: (file: FileMeta) => Promise<void>;
  refresh: () => Promise<void>;
  switchProject: (id: string | null) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  startImportInto: (target: ImportTarget) => void;
  startImportFolderInto: (target: ImportTarget) => void;
  waitForSave: (id: string) => Promise<void>;
  flushPendingSaves: () => Promise<void>;
  setError: (message: string) => void;
}

export function useItemActions(options: UseItemActionsOptions) {
  const {
    files, folders, projects, tabs, activeProject, selectedFolder, activeTabId,
    currentWorkspaceId, moveDialog, contextMenu, trashedFiles, setTabs,
    setActiveProject, setSelectedFolder, setActiveTabId, setView, setMoveDialog,
    setContextMenu, requestInput, requestConfirmation, openFile, refresh,
    switchProject, switchWorkspace, startImportInto, startImportFolderInto,
    waitForSave, flushPendingSaves, setError,
  } = options;

  async function moveItemTo(destination: ImportTarget) {
    if (!moveDialog) return;
    try {
      if (moveDialog.type === 'file') {
        await moveFile(db, moveDialog.id, destination.folderId, destination.projectId, destination.workspaceId);
        setTabs((current) => current.map((tab) => tab.id === moveDialog.id ? { ...tab, meta: { ...tab.meta, parentFolderId: destination.folderId, projectId: destination.projectId, workspaceId: destination.workspaceId } } : tab));
      } else {
        await moveFolder(db, moveDialog.id, destination.folderId, destination.projectId, destination.workspaceId);
      }
      await switchWorkspace(destination.workspaceId);
      setActiveProject(destination.projectId);
      setSelectedFolder(destination.folderId);
      setMoveDialog(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not move this item.');
    }
  }

  async function renameItem(meta: FileMeta | FolderRecord | Project) {
    requestInput(`Rename ${'kind' in meta ? 'file' : 'archived' in meta ? 'project' : 'folder'}`, meta.name, 'Name', 'Save name', async (name) => {
      if (name.trim() === meta.name) return;
      if ('kind' in meta) await renameFile(db, meta.id, name.trim());
      else if ('archived' in meta) await db.projects.update(meta.id, { name: name.trim(), updatedAt: Date.now() });
      else await renameFolder(db, meta.id, name.trim());
      if ('kind' in meta) setTabs((current) => current.map((tab) => tab.id === meta.id ? { ...tab, meta: { ...tab.meta, name: name.trim(), kind: kindForFile(name.trim(), tab.meta.mimeType) } } : tab));
      await refresh();
    });
  }

  async function deleteFile(meta: FileMeta) {
    requestConfirmation('Move file to Trash?', `“${meta.name}” can be restored from Trash.`, 'Move to Trash', async () => {
      await waitForSave(meta.id);
      await softDeleteFile(db, meta.id);
      setTabs((current) => current.filter((tab) => tab.id !== meta.id));
      if (activeTabId === meta.id) setActiveTabId(null);
      await refresh();
    }, true);
  }

  async function deleteFolder(folder: FolderRecord) {
    const count = await countFolderItems(db, folder.id);
    requestConfirmation('Delete folder?', `Delete “${folder.name}” and ${count} item${count === 1 ? '' : 's'} inside it? This cannot be undone.`, 'Delete folder', async () => {
      const folderIds = await getFolderSubtreeIds(db, folder.id);
      const closingTabs = tabs.filter((tab) => tab.meta.parentFolderId !== null && folderIds.includes(tab.meta.parentFolderId));
      await Promise.all(closingTabs.map((tab) => waitForSave(tab.id)));
      await deleteFolderContents(db, folder.id);
      setTabs((current) => current.filter((tab) => !closingTabs.some((closing) => closing.id === tab.id)));
      if (closingTabs.some((tab) => tab.id === activeTabId)) setActiveTabId(tabs.find((tab) => !closingTabs.some((closing) => closing.id === tab.id))?.id ?? null);
      if (selectedFolder && folderIds.includes(selectedFolder)) setSelectedFolder(folder.parentFolderId);
      await refresh();
    }, true);
  }

  async function deleteProject(project: Project) {
    const itemCount = files.filter((file) => file.projectId === project.id && file.deletedAt === null).length + folders.filter((folder) => folder.projectId === project.id).length;
    requestConfirmation('Delete project?', `Delete project “${project.name}” and its ${itemCount} item${itemCount === 1 ? '' : 's'}? Files will move to Trash.`, 'Delete project', async () => {
      const projectTabs = tabs.filter((tab) => tab.meta.projectId === project.id);
      await Promise.all(projectTabs.map((tab) => waitForSave(tab.id)));
      await softDeleteProject(db, project.id);
      setTabs((current) => current.filter((tab) => !projectTabs.some((tabToClose) => tabToClose.id === tab.id)));
      if (activeProject === project.id) { setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }
      await refresh();
    }, true);
  }

  async function restoreProject(project: Project) {
    await unarchiveProject(db, project.id);
    setActiveProject(project.id);
    setSelectedFolder(null);
    setView('workspace');
    await refresh();
  }

  async function restoreTrashedFile(id: string) {
    await restoreFile(db, id);
    await refresh();
  }

  async function doEmptyTrash() {
    if (!trashedFiles.length) return;
    requestConfirmation('Empty Trash?', `Permanently delete ${trashedFiles.length} trashed file${trashedFiles.length === 1 ? '' : 's'}? This cannot be undone.`, 'Empty Trash', async () => {
      const trashIds = new Set(trashedFiles.map((file) => file.id));
      await flushPendingSaves();
      await emptyTrash(db, currentWorkspaceId);
      setTabs((current) => current.filter((tab) => !trashIds.has(tab.id)));
      if (activeTabId && trashIds.has(activeTabId)) setActiveTabId(tabs.find((tab) => !trashIds.has(tab.id))?.id ?? null);
      await refresh();
    }, true);
  }

  async function runContextAction(action: 'open' | 'rename' | 'move' | 'import' | 'import-folder' | 'delete') {
    if (!contextMenu) return;
    const { type, id } = contextMenu;
    setContextMenu(null);
    if (type === 'file') {
      const file = files.find((item) => item.id === id);
      if (!file) return;
      if (action === 'open') await openFile(file);
      if (action === 'rename') await renameItem(file);
      if (action === 'move') setMoveDialog({ type: 'file', id, name: file.name });
      if (action === 'delete') await deleteFile(file);
      return;
    }
    if (type === 'folder') {
      const folder = folders.find((item) => item.id === id);
      if (!folder) return;
      if (action === 'open') { setSelectedFolder(id); setActiveProject(folder.projectId); setView('workspace'); setActiveTabId(null); }
      if (action === 'rename') await renameItem(folder);
      if (action === 'move') setMoveDialog({ type: 'folder', id, name: folder.name });
      if (action === 'import') startImportInto({ folderId: id, projectId: folder.projectId, workspaceId: folder.workspaceId });
      if (action === 'import-folder') startImportFolderInto({ folderId: id, projectId: folder.projectId, workspaceId: folder.workspaceId });
      if (action === 'delete') await deleteFolder(folder);
      return;
    }
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    if (action === 'open') await switchProject(id);
    if (action === 'rename') await renameItem(project);
    if (action === 'import') startImportInto({ folderId: null, projectId: id, workspaceId: project.workspaceId });
    if (action === 'import-folder') startImportFolderInto({ folderId: null, projectId: id, workspaceId: project.workspaceId });
    if (action === 'delete') await deleteProject(project);
  }

  return { moveItemTo, renameItem, deleteFile, deleteFolder, deleteProject, restoreProject, restoreTrashedFile, doEmptyTrash, runContextAction };
}
