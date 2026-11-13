import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { EditorView } from '@codemirror/view';
import {
  Archive, ArrowDownUp, Check, ChevronDown, ChevronRight, Code2, Command, Download,
  Ellipsis, File, FileCode2, FilePlus2, FileText, Folder, FolderPlus, FolderTree, HardDrive,
  Import, LayoutGrid, Menu, MoreHorizontal, Plus, Search, Settings2,
  Trash2, X, Clock3, Bookmark, Pencil, Save, ExternalLink, Moon, Sun, Layers, MoveRight, Maximize2, Minimize2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { DEFAULT_WORKSPACE_ID, db, WorkspaceDatabaseV1, WorkspaceDatabaseV2 } from './storage/database';
import FileKindIcon from './components/FileKindIcon';
import WorkspaceDialog, { type WorkspaceDialogState } from './components/WorkspaceDialog';
import { formatSize } from './utils/format';
import { migrateLegacyUiPreferences } from './storage/preferences';
import { saveWorkspaceSession } from './storage/tabSession';
import { createFolder, moveFile, moveFolder, restoreProject as unarchiveProject, softDeleteProject } from './storage/hierarchy';
import { countFolderItems, createTextFile, deleteFolderContents, emptyTrash, getFolderSubtreeIds, importFile, kindForFile, renameFile, restoreFile, softDeleteFile } from './storage/files';
import { downloadBackup, exportBackupStream } from './storage/backup';
import { isDesktopApp, iterateDesktopFiles, iterateDesktopFolder, saveBackupToDesktop } from './platform/desktop';
import { useWorkspaceSearch } from './features/search/hooks/useWorkspaceSearch';
import { useGlobalShortcuts } from './app/hooks/useGlobalShortcuts';
import { useSystemStats } from './features/settings/hooks/useSystemStats';
import { collectFrontendDiagnostics } from './diagnostics.js';
import UpdateManager from './features/updates/UpdateManager';
import { useUiSettings } from './features/settings/hooks/useUiSettings';
import { useWorkspace } from './features/workspace/hooks/useWorkspace';
import { useWorkspaceActions } from './features/workspace/hooks/useWorkspaceActions';
import { useWorkspaceInitialization } from './features/workspace/hooks/useWorkspaceInitialization';
import { useAutosave } from './features/editor/hooks/useAutosave';
import { useWorkspaceBackup } from './features/backup/hooks/useWorkspaceBackup';
import { useWorkspaceTabs } from './features/tabs/hooks/useWorkspaceTabs';
import WorkspaceEditor from './features/editor/components/WorkspaceEditor';
import { isEditableKind, OPENABLE_KINDS } from './shared/constants/fileKinds';
import { getExcludedFolderIds, getMoveDestinations, selectVisibleFiles } from './features/workspace/selectors/destinations';
import EmptyState from './shared/ui/EmptyState';
import ErrorBanner from './shared/ui/ErrorBanner';
import BusyPill from './shared/ui/BusyPill';
import StartupScreen from './shared/ui/StartupScreen';
import WelcomePage from './features/workspace/components/WelcomePage';
import { useClickOutside } from './shared/hooks/useClickOutside';
import { readDragPayload, writeDragPayload } from './shared/utils/dragPayload';
import { useOpenFile } from './features/tabs/hooks/useOpenFile';
import MoveDialog from './features/workspace/components/dialogs/MoveDialog';
import MigrationDialog from './features/workspace/components/dialogs/MigrationDialog';
import { useTabViewState } from './features/tabs/hooks/useTabViewState';
import { useWheelZoom } from './app/hooks/useWheelZoom';
import { useGlobalSearchShortcut } from './features/search/hooks/useGlobalSearchShortcut';
import ItemContextMenu from './features/workspace/components/menus/ItemContextMenu';
import Sidebar from './features/workspace/components/sidebar/Sidebar';
import ProjectTree from './features/workspace/components/sidebar/ProjectTree';
import { WorkspaceNavProvider, useWorkspaceNav } from './features/workspace/context/WorkspaceNavContext';
import { selectWorkspaceViewState } from './features/workspace/selectors';
import type { Tab } from './features/tabs/types';
import type { FileMeta, Folder as FolderRecord, Project, Workspace } from './storage/types';
const PdfReader = lazy(() => import('./PdfReader'));
const ReadOnlyFileViewer = lazy(() => import('./viewers/ReadOnlyFileViewer'));

type View = 'workspace' | 'recent' | 'trash';
type ContextItemType = 'file' | 'folder' | 'project';
interface ContextMenuState { type: ContextItemType; id: string; x: number; y: number; }
interface MoveDialogState { type: 'file' | 'folder'; id: string; name: string; }
interface ImportTarget { folderId: string | null; projectId: string | null; workspaceId: string; }
interface SearchResult { file: FileMeta; text: string; }

export default function App() {
  return <WorkspaceNavProvider><AppShell /></WorkspaceNavProvider>;
}

function AppShell() {
  useEffect(() => collectFrontendDiagnostics(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const workspace = useWorkspace(setError, setLoading);
  const { files, folders, projects, workspaces, setWorkspaces, activeWorkspaceId, setActiveWorkspaceId, refresh } = workspace;
  const currentWorkspaceId = activeWorkspaceId ?? DEFAULT_WORKSPACE_ID;
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const getProjectName = (id: string | null) => id ? projectNames.get(id) : undefined;
  const [migrationBackup, setMigrationBackup] = useState<number | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const { view, setView, activeProject, setActiveProject, selectedFolder, setSelectedFolder, expanded, setExpanded } = useWorkspaceNav();
  const { tabs, setTabs, activeTabId, setActiveTabId, restoreWorkspaceTabs, flushWorkspaceSession } = useWorkspaceTabs(activeWorkspaceId, loading, setError);
  const [query, setQuery] = useState('');
  const [searchPopupOpen, setSearchPopupOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const lastFocusedSurfaceRef = useRef<'pdf' | 'editor' | null>(null);
  const [sort, setSort] = useState<'name' | 'type' | 'size' | 'updatedAt'>('name');
  const [sortDesc, setSortDesc] = useState(false);
  const [rightPanel, setRightPanel] = useState<'details' | 'search' | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { darkTheme, setDarkTheme, appZoom, setAppZoom, editorFontSize, setEditorFontSize, setReady: setUiPreferencesReady, toggleTheme } = useUiSettings(setError);
  const systemStats = useSystemStats();
  const [focusMode, setFocusMode] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialogState | null>(null);
  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null);
  const [dialog, setDialog] = useState<WorkspaceDialogState | null>(null);
  const [status, setStatus] = useState('All changes saved');
  const [importing, setImporting] = useState(false);
  const editorWorkspaceRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useWorkspaceInitialization({
    refresh, setMigrationBackup, setLoading, setError, setAppZoom, setEditorFontSize,
    setPreferencesReady: setUiPreferencesReady, setDarkTheme, setWorkspaces, setActiveWorkspaceId,
    restoreTabs: restoreWorkspaceTabs,
  });
  useGlobalShortcuts(setAppZoom, setEditorFontSize);
  useWheelZoom(lastFocusedSurfaceRef, setAppZoom, setEditorFontSize);


  function requestInput(title: string, initialValue: string, placeholder: string, confirmLabel: string, onConfirm: (value: string) => void | Promise<void>, message?: string) {
    setDialog({ mode: 'input', title, value: initialValue, placeholder, confirmLabel, onConfirm, message });
  }

  function requestConfirmation(title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>, destructive = false) {
    setDialog({ mode: 'confirm', title, message, confirmLabel, destructive, onConfirm: () => onConfirm() });
  }

  async function submitDialog() {
    if (!dialog || (dialog.mode === 'input' && !dialog.value?.trim())) return;
    const active = dialog;
    setDialog(null);
    try { await active.onConfirm(active.value ?? ''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'This action could not be completed.'); }
  }

  async function downloadMigrationBackupAndUpgrade() {
    if (migrationBackup === null) return;
    setUpgrading(true);
    setMigrationError('');
    const previous = migrationBackup === 1 ? new WorkspaceDatabaseV1() : new WorkspaceDatabaseV2();
    try {
      await previous.open();
      if (!isDesktopApp()) {
        await downloadBackup(previous);
        setMigrationError('The browser cannot confirm that the backup was saved. The migration was not started. Use the desktop app and save the backup through its native save dialog.');
        return;
      }
      const backupSaved = await saveBackupToDesktop(exportBackupStream(previous));
      if (!backupSaved) {
        setMigrationError('Backup saving was cancelled. The database migration was not started; your existing database remains unchanged.');
        return;
      }
      previous.close();
      await db.open();
      const uiPreferences = await migrateLegacyUiPreferences(db, localStorage);
      setAppZoom(uiPreferences.appZoom); setEditorFontSize(uiPreferences.editorFontSize); setUiPreferencesReady(true);
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
  const { persistEditorViewState, updateViewerView, updatePdfView } = useTabViewState({ setTabs, setError });

  useGlobalSearchShortcut({ editorViewRef, lastFocusedSurfaceRef, setSearchPopupOpen, setRightPanel });
  useEffect(() => {
    if (searchPopupOpen) searchInputRef.current?.focus();
  }, [searchPopupOpen]);
  useEffect(() => { if (!activeTabId) setFocusMode(false); }, [activeTabId]);
  useClickOutside(workspaceMenuRef, () => setWorkspaceMenuOpen(false));
  useClickOutside(importMenuRef, () => setImportMenuOpen(false));
  useClickOutside(contextMenuRef, () => setContextMenu(null));

  const {
    activeProjectRecord, activeWorkspace, activeProjects, generalRootFolders,
    workspaceTabs, workspaceTabSignature, activeTab, liveFiles, storedBytes,
    workspaceHasContent, trashedFiles, rootFiles, currentFolders,
  } = useMemo(() => selectWorkspaceViewState({
    files, folders, projects, workspaces, tabs,
    activeWorkspaceId, activeProjectId: activeProject, selectedFolderId: selectedFolder, activeTabId,
  }), [files, folders, projects, workspaces, tabs, activeWorkspaceId, activeProject, selectedFolder, activeTabId]);

  const { updateDraft, persistDraft, flushPendingSaves, trackRecoveredDraft, waitForSave } = useAutosave(activeTab, setTabs, refresh, setError, setStatus, flushWorkspaceSession);
  const onBackupRestored = useCallback(async () => {
    setTabs([]); setActiveTabId(null); setActiveProject(null); setSelectedFolder(null);
    const restoredWorkspaces = await db.workspaces.toArray();
    const storedWorkspace = await db.preferences.get('activeWorkspace');
    const selected = restoredWorkspaces.find((item) => item.id === storedWorkspace?.value)?.id ?? restoredWorkspaces[0]?.id ?? null;
    setWorkspaces(restoredWorkspaces);
    setActiveWorkspaceId(selected);
    if (selected) await db.preferences.put({ key: 'activeWorkspace', value: selected, updatedAt: Date.now() });
    await refresh();
  }, [refresh, setWorkspaces]);
  const backup = useWorkspaceBackup(flushPendingSaves, requestConfirmation, setError, onBackupRestored);
  const workspaceActions = useWorkspaceActions({
    files, folders, projects, workspaces, activeWorkspaceId, activeTabId, tabs,
    setTabs, setActiveWorkspaceId, setActiveProject, setSelectedFolder, setActiveTabId,
    setView, refresh, flushPendingSaves, requestInput, requestConfirmation,
  });
  const { createWorkspace, renameWorkspace, deleteCurrentWorkspace } = workspaceActions;


  const moveDestinations = useMemo(
    () => getMoveDestinations(workspaces, projects, folders, getExcludedFolderIds(folders, moveDialog?.type === 'folder' ? moveDialog.id : null)),
    [folders, moveDialog, projects, workspaces],
  );

  const searchResults = useWorkspaceSearch(liveFiles, query, setError);
  const folderSearchResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return folders.filter((folder) =>
      folder.workspaceId === activeWorkspaceId && folder.name.toLocaleLowerCase().includes(needle)
    ).slice(0, 50);
  }, [folders, query, activeWorkspaceId]);

  const openFile = useOpenFile({
    activeWorkspaceId,
    activeTabId,
    tabs,
    setTabs,
    setActiveTabId,
    setActiveProject,
    setSelectedFolder,
    setView,
    switchWorkspace: workspace.switchWorkspace,
    restoreWorkspaceTabs,
    trackRecoveredDraft,
    setError,
    setStatus,
  });

  useEffect(() => {
    if (!activeTab || activeTab.hydrated === true || loading) return;
    void openFile(activeTab.meta).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : `Could not restore “${activeTab.meta.name}”.`);
    });
  }, [activeTab, loading, openFile]);

  function createProject() {
    requestInput('Create project', '', 'Project name', 'Create project', async (name) => {
      const now = Date.now();
      const project: Project = { id: crypto.randomUUID(), workspaceId: currentWorkspaceId, name: name.trim(), archived: false, createdAt: now, updatedAt: now };
      await db.projects.add(project);
      await refresh();
      setActiveProject(project.id); setSelectedFolder(null); setActiveTabId(null); setView('workspace');
    });
  }

  function createFolderInCurrent() {
    requestInput('Create folder', '', 'Folder name', 'Create folder', async (name) => {
      const folder = await createFolder(db, name.trim(), selectedFolder, activeProject, currentWorkspaceId);
      setExpanded((current) => new Set(current).add(folder.id));
      await refresh();
    });
  }

  function createNewFile(kind: 'markdown' | 'code') {
    const initial = kind === 'markdown' ? 'Untitled note.md' : 'Untitled.ts';
    requestInput(kind === 'markdown' ? 'Create note' : 'Create code file', initial, 'File name', 'Create file', async (name) => {
      const text = kind === 'markdown' ? `# ${name.replace(/\.(md|markdown)$/i, '')}\n\n` : '';
      const meta = await createTextFile(db, name.trim(), text, { parentFolderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId, kind });
      await refresh();
      await openFile(meta);
    });
  }

  async function handleImport(fileList: FileList | null, destinationFolderId = selectedFolder, destinationProjectId = activeProject, destinationWorkspaceId = currentWorkspaceId) {
    if (!fileList?.length) return;
    setImporting(true);
    try {
      for (const file of Array.from(fileList)) {
        const meta = await importFile(db, file, { parentFolderId: destinationFolderId, projectId: destinationProjectId, workspaceId: destinationWorkspaceId });
        if (OPENABLE_KINDS.has(meta.kind)) await openFile(meta);
      }
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import the selected file.'); }
    finally { setImporting(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function handlePickedImport(files: Iterable<File> | AsyncIterable<File>, target: ImportTarget) {
    setImporting(true);
    try {
      for await (const file of files) {
        const meta = await importFile(db, file, { parentFolderId: target.folderId, projectId: target.projectId, workspaceId: target.workspaceId });
        if (OPENABLE_KINDS.has(meta.kind)) await openFile(meta);
      }
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import the selected files.'); }
    finally { setImporting(false); }
  }

  function startImportInto(target: ImportTarget) {
    setImportTarget(target);
    if (isDesktopApp()) { void handlePickedImport(iterateDesktopFiles(), target).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not open the file picker.')); return; }
    fileInput.current?.click();
  }

  function startImportFolderInto(target: ImportTarget) {
    setImportTarget(target);
    if (isDesktopApp()) { setImporting(true); void (async () => { try { await importFolderFiles(iterateDesktopFolder(), target); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import the selected folder.'); } finally { setImporting(false); setImportTarget(null); } })(); return; }
    folderInput.current?.setAttribute('webkitdirectory', '');
    folderInput.current?.setAttribute('directory', '');
    folderInput.current?.click();
  }

  async function handleFolderImport(fileList: FileList | null, target: ImportTarget) {
    if (!fileList?.length) return;
    setImporting(true);
    try { await importFolderFiles(Array.from(fileList), target); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import this folder.'); }
    finally { setImporting(false); setImportTarget(null); if (folderInput.current) folderInput.current.value = ''; }
  }

  async function importFolderFiles(selectedFiles: Iterable<File> | AsyncIterable<File>, target: ImportTarget) {
    const folderIds = new Map<string, string>();
    let imported = 0;
    {
      for await (const file of selectedFiles) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.replaceAll('\\', '/') ?? file.name;
        const segments = relativePath.split('/').filter(Boolean);
        const directorySegments = segments.slice(0, -1);
        let parentFolderId = target.folderId;
        let currentPath = '';
        for (const segment of directorySegments) {
          currentPath = currentPath ? `${currentPath}/${segment}` : segment;
          let folderId = folderIds.get(currentPath);
          if (!folderId) {
            const folder = await createFolder(db, segment, parentFolderId, target.projectId, target.workspaceId);
            folderId = folder.id;
            folderIds.set(currentPath, folderId);
          }
          parentFolderId = folderId;
        }
        await importFile(db, file, { parentFolderId, projectId: target.projectId, workspaceId: target.workspaceId });
        imported += 1;
      }
      const rootFolderId = folderIds.values().next().value as string | undefined;
      if (rootFolderId) {
        setSelectedFolder(rootFolderId);
        setActiveProject(target.projectId);
        setView('workspace');
        setExpanded((current) => new Set([...current, rootFolderId]));
      }
      setStatus(`Imported ${imported} file${imported === 1 ? '' : 's'}`);
    }
  }

  function showContextMenu(type: ContextItemType, id: string, event: ReactMouseEvent) {
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
    await workspace.switchWorkspace(workspaceId);
    await restoreWorkspaceTabs(workspaceId);
    setActiveProject(null);
    setSelectedFolder(null);
    setView('workspace');
    setWorkspaceMenuOpen(false);
  }

  async function moveItemTo(destination: ImportTarget) {
    if (!moveDialog) return;
    try {
      if (moveDialog.type === 'file') {
        await moveFile(db, moveDialog.id, destination.folderId, destination.projectId, destination.workspaceId);
        setTabs((current) => current.map((tab) => tab.id === moveDialog.id ? { ...tab, meta: { ...tab.meta, parentFolderId: destination.folderId, projectId: destination.projectId, workspaceId: destination.workspaceId } } : tab));
      } else {
        await moveFolder(db, moveDialog.id, destination.folderId, destination.projectId, destination.workspaceId);
      }
      await workspace.switchWorkspace(destination.workspaceId);
      setActiveProject(destination.projectId);
      setSelectedFolder(destination.folderId);
      setMoveDialog(null);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not move this item.'); }
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

  async function renameItem(meta: FileMeta | FolderRecord | Project) {
    requestInput(`Rename ${'kind' in meta ? 'file' : 'archived' in meta ? 'project' : 'folder'}`, meta.name, 'Name', 'Save name', async (name) => {
      if (name.trim() === meta.name) return;
      if ('kind' in meta) await renameFile(db, meta.id, name.trim());
      else if ('archived' in meta) await db.projects.update(meta.id, { name: name.trim(), updatedAt: Date.now() });
      else await db.folders.update(meta.id, { name: name.trim(), updatedAt: Date.now() });
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

  function closeTab(id: string) {
    const tab = tabs.find((item) => item.id === id);
    const close = () => {
      const remaining = tabs.filter((item) => item.id !== id);
      setTabs(remaining);
      if (activeTabId === id) setActiveTabId(remaining.at(-1)?.id ?? null);
    };
    if (tab?.dirty) {
      requestConfirmation('Save before closing?', `“${tab.meta.name}” has unsaved changes. Save them before closing this tab?`, 'Save & close', async () => {
        await persistDraft(id, tab.draft);
        close();
      });
      return;
    }
    close();
  }

  function handleDrop(event: DragEvent, folderId: string | null, destinationProjectId = activeProject, destinationWorkspaceId = currentWorkspaceId) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files.length > 0) {
      void handleImport(event.dataTransfer.files, folderId, destinationProjectId, destinationWorkspaceId);
      return;
    }
    let payload: ReturnType<typeof readDragPayload>;
    try { payload = readDragPayload(event.dataTransfer); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read this dragged item.'); return; }
    if (!payload) return;
    const { id, type } = payload;
    void (async () => {
      try {
        if (type === 'file') await moveFile(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        else await moveFolder(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        await refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not move this item.'); }
    })();
  }

  async function createWorkspaceFile(kind: 'markdown' | 'code') {
    if (view !== 'workspace') setView('workspace');
    await createNewFile(kind);
  }

  const sortedVisible = useMemo(() => selectVisibleFiles(
    view, liveFiles, trashedFiles, activeWorkspaceId, activeProject, selectedFolder, sort, sortDesc,
  ), [view, liveFiles, trashedFiles, activeWorkspaceId, activeProject, selectedFolder, sort, sortDesc]);

  return <div className="app-viewport" data-theme={darkTheme ? 'dark' : 'light'}><div className={`app-shell ${focusMode ? 'focus-mode' : ''}`} data-theme={darkTheme ? 'dark' : 'light'} style={{ transform: `scale(${appZoom})`, width: `calc(100% / ${appZoom})`, height: `calc(100% / ${appZoom})` }}>
    <Sidebar
      data={{ collapsed: sidebarCollapsed, view, activeProjectId: activeProject, liveFileCount: liveFiles.length, trashCount: trashedFiles.length, cpu: systemStats.cpu, ram: systemStats.ram, gpu: systemStats.gpu, storedBytes }}
      actions={{
        onToggleCollapsed: () => setSidebarCollapsed((value) => !value),
        onNavigate: (nextView) => { setView(nextView); if (nextView === 'workspace') { setActiveProject(null); setSelectedFolder(null); } setActiveTabId(null); },
        onCreateProject: () => void createProject(),
        onSaveBackup: () => void backup.saveWorkspaceBackup(),
        onRestoreBackup: (input) => void backup.restoreFromPicker(input),
        onBackupFileChange: (event) => void backup.openBackup(event.target.files?.[0], event.currentTarget),
      }}
    >
      <ProjectTree
        data={{ folders, files: liveFiles, projects, workspaceId: activeWorkspaceId, activeProjectId: activeProject, selectedFolderId: selectedFolder, activeTabId, expandedIds: expanded }}
        actions={{
          onContextMenu: showContextMenu,
          onDrop: handleDrop,
          onSelectFolder: (folderId, projectId) => { setSelectedFolder(folderId); setActiveProject(projectId); setView('workspace'); setActiveTabId(null); },
          onSelectProject: (projectId) => { setActiveProject((current) => current === projectId ? null : projectId); setSelectedFolder(null); setView('workspace'); setActiveTabId(null); },
          onOpenFile: (file) => void openFile(file),
          onToggleFolder: (id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
          onCreateNote: () => void createNewFile('markdown'),
        }}
      />
    </Sidebar>
    <main className="main-area">
      <header className="topbar">
        <div className="workspace-switcher" ref={workspaceMenuRef}>
          <button className="workspace-switch-button" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((open) => !open)}>
            <Layers size={16} /><span>{view === 'trash' ? 'Trash' : view === 'recent' ? 'Recent files' : activeWorkspace?.name ?? 'Workspace'}{activeProjectRecord ? ` / ${activeProjectRecord.name}` : ''}</span>
            {selectedFolder && view === 'workspace' && <small> / {folders.find((folder) => folder.id === selectedFolder)?.name}</small>}
            <ChevronDown size={14} />
          </button>
          {workspaceMenuOpen && <div className="workspace-switch-menu">
            <div className="menu-heading">WORKSPACES</div>
            {workspaces.map((workspace) => <button key={workspace.id} className={workspace.id === activeWorkspaceId ? 'current' : ''} onClick={() => void switchWorkspace(workspace.id)}><Layers size={15} /><span>{workspace.name}</span>{workspace.id === activeWorkspaceId && <Check size={14} />}</button>)}
            <button onClick={() => { setWorkspaceMenuOpen(false); createWorkspace(); }}><Plus size={15} /><span>New workspace…</span></button>
            {activeWorkspace && <>
              <button onClick={() => { setWorkspaceMenuOpen(false); renameWorkspace(activeWorkspace); }}><Pencil size={15} /><span>Rename this workspace…</span></button>
              <button className="workspace-delete-option" onClick={() => { setWorkspaceMenuOpen(false); deleteCurrentWorkspace(); }}><Trash2 size={15} /><span>Delete this workspace…</span></button>
            </>}
            <div className="switch-menu-separator" />
            <div className="menu-heading">PROJECTS IN {activeWorkspace?.name?.toLocaleUpperCase() ?? 'WORKSPACE'}</div>
            <button className={!activeProject && view === 'workspace' ? 'current' : ''} onClick={() => void switchProject(null)}><Layers size={15} /><span>General files</span>{!activeProject && view === 'workspace' && <Check size={14} />}</button>
            {activeProjects.map((project) => <button key={project.id} className={activeProject === project.id && view === 'workspace' ? 'current' : ''} onClick={() => void switchProject(project.id)}><span className="project-dot" /><span>{project.name}</span>{activeProject === project.id && view === 'workspace' && <Check size={14} />}</button>)}
            <div className="switch-menu-separator" />
            <button onClick={() => { setView('recent'); setActiveTabId(null); setWorkspaceMenuOpen(false); }}><Clock3 size={15} /><span>Recent files</span></button>
            <button onClick={() => { setView('trash'); setActiveTabId(null); setWorkspaceMenuOpen(false); }}><Trash2 size={15} /><span>Trash</span></button>
            <button onClick={() => { setWorkspaceMenuOpen(false); void createProject(); }}><Plus size={15} /><span>New project…</span></button>
            {(view === 'trash' && trashedFiles.length > 0) || (view === 'workspace' && (activeProjectRecord || selectedFolder)) ? <>
              <div className="switch-menu-separator" />
              <div className="menu-heading">CURRENT VIEW</div>
              {view === 'trash' && trashedFiles.length > 0 && <button className="workspace-delete-option" onClick={() => { setWorkspaceMenuOpen(false); void doEmptyTrash(); }}><Trash2 size={15} /><span>Empty trash…</span></button>}
              {view === 'workspace' && activeProjectRecord?.archived && <button onClick={() => { setWorkspaceMenuOpen(false); void restoreProject(activeProjectRecord); }}><Archive size={15} /><span>Restore project</span></button>}
              {view === 'workspace' && activeProjectRecord && !activeProjectRecord.archived && <button className="workspace-delete-option" onClick={() => { setWorkspaceMenuOpen(false); void deleteProject(activeProjectRecord); }}><Trash2 size={15} /><span>Delete project…</span></button>}
              {view === 'workspace' && selectedFolder && folders.find((folder) => folder.id === selectedFolder) && <button className="workspace-delete-option" onClick={() => { setWorkspaceMenuOpen(false); void deleteFolder(folders.find((folder) => folder.id === selectedFolder)!); }}><Trash2 size={15} /><span>Delete folder…</span></button>}
            </> : null}
          </div>}
        </div>
        <div className="topbar-actions">
          {view === 'workspace' && <div className="import-menu-wrapper" ref={importMenuRef}>
            <button className="primary-button import-button" aria-expanded={importMenuOpen} onClick={() => setImportMenuOpen((open) => !open)}><Import size={15} /> Import <ChevronDown size={13} /></button>
            {importMenuOpen && <div className="import-menu">
              <div className="menu-heading">ADD TO {selectedFolder ? 'FOLDER' : activeProjectRecord?.name?.toLocaleUpperCase() ?? 'WORKSPACE'}</div>
              <button onClick={() => { setImportMenuOpen(false); startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId }); }}><FileText size={15} /><span>Import files</span></button>
              <button onClick={() => { setImportMenuOpen(false); startImportFolderInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId }); }}><FolderPlus size={15} /><span>Import folder</span></button>
              <div className="switch-menu-separator" />
              <button onClick={() => { setImportMenuOpen(false); void createFolderInCurrent(); }}><FolderPlus size={15} /><span>New folder</span></button>
              <button onClick={() => { setImportMenuOpen(false); void createWorkspaceFile('markdown'); }}><FilePlus2 size={15} /><span>New note</span></button>
              <button onClick={() => { setImportMenuOpen(false); void createWorkspaceFile('code'); }}><Code2 size={15} /><span>New code file</span></button>
            </div>}
          </div>}
          <button className="global-search-trigger" onClick={() => { setSearchPopupOpen(true); setRightPanel('search'); }} title="Search files and folders (Ctrl+F)"><Search size={16} /><span>Search files and folders</span><kbd>Ctrl F</kbd></button>
          <button className="icon-button theme-toggle" title={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => void toggleTheme()}>{darkTheme ? <Sun size={16} /> : <Moon size={16} />}</button>
          <span className={`save-status ${status === 'Saved locally' ? 'saved' : ''}`}><span className="status-dot" />{status}</span>
          <button className="icon-button" title="Details" onClick={() => setRightPanel((value) => value === 'details' ? null : 'details')}><Settings2 size={17} /></button>
        </div>
      </header>

      {searchPopupOpen && <div className="search-popup-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setSearchPopupOpen(false); }}>
        <section className="search-popup" role="dialog" aria-modal="true" aria-label="Search files and folders">
          <div className="search-popup-input"><Search size={17} /><input ref={searchInputRef} value={query} placeholder="Search files, folders and note/code content…" onChange={(event) => { setQuery(event.target.value); setRightPanel('search'); }} onKeyDown={(event) => { if (event.key === 'Escape') setSearchPopupOpen(false); if (event.key === 'Enter') setSearchPopupOpen(false); }} /><kbd>ESC</kbd><button className="icon-button" aria-label="Close search" onClick={() => setSearchPopupOpen(false)}><X size={15} /></button></div>
          <div className="search-popup-scope">Searching file and folder names, plus note/code text</div>
        </section>
      </div>}

      <input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId }; void handleImport(event.target.files, target.folderId, target.projectId, target.workspaceId); setImportTarget(null); }} />
      <input ref={folderInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId }; void handleFolderImport(event.target.files, target); }} />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {activeTab ? <div ref={editorWorkspaceRef} className="editor-workspace">
        <div className="tab-strip">
          <div className="tab-list">
            {workspaceTabs.map((tab) => <button key={tab.id} className={`file-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>
              {<FileKindIcon kind={tab.meta.kind} size={15} />}<span className="truncate" title={tab.meta.name}>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}
              <span role="button" tabIndex={0} className="tab-close" aria-label={`Close ${tab.meta.name}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); closeTab(tab.id); } }}><X size={14} /></span>
            </button>)}
          </div>
          <button className="icon-button tab-plus" title="Import a file" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId })}><Plus size={16} /></button>
        </div>
        <div className="editor-titlebar">
          <div className="editor-file-title">{<FileKindIcon kind={activeTab.meta.kind} size={16} />}<b title={activeTab.meta.name}>{activeTab.meta.name}</b><span className="title-location" title={`${activeTab.meta.projectId ? getProjectName(activeTab.meta.projectId) : 'Workspace'}${activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}`}>{activeTab.meta.projectId ? getProjectName(activeTab.meta.projectId) : 'Workspace'}{activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}</span></div>
          <div className="editor-tools">
            {isEditableKind(activeTab.meta.kind) && <div className="editor-font-controls" title="Editor text size"><button className="icon-button" aria-label="Decrease editor text size" title="Decrease editor text size" onClick={() => setEditorFontSize((value) => Math.max(11, value - 1))}><ZoomOut size={14} /></button><span>{editorFontSize}px</span><button className="icon-button" aria-label="Increase editor text size" title="Increase editor text size" onClick={() => setEditorFontSize((value) => Math.min(24, value + 1))}><ZoomIn size={14} /></button></div>}
            {activeTab.meta.kind === 'markdown' && <button className={`text-button ${activeTab.preview ? 'selected' : ''}`} onClick={() => {
              const preview = !activeTab.preview;
              const editorState = { anchor: activeTab.editorState?.anchor ?? 0, head: activeTab.editorState?.head ?? 0, scrollTop: activeTab.editorState?.scrollTop ?? 0, scrollLeft: activeTab.editorState?.scrollLeft ?? 0, preview };
              setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, preview, editorState } : tab));
              void db.preferences.put({ key: `editor:${activeTab.id}`, value: editorState, updatedAt: Date.now() }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save editor view state.'));
            }}>{activeTab.preview ? 'Edit note' : 'Preview'}</button>}
            {isEditableKind(activeTab.meta.kind) && <button className="text-button" title="Save changes (Ctrl+S)" disabled={!activeTab.dirty} onClick={() => void persistDraft(activeTab.id, activeTab.draft).catch(() => undefined)}><Save size={14} /> Save</button>}
            <button className="icon-button" title="Rename" onClick={() => void renameItem(activeTab.meta)}><Pencil size={15} /></button>
            <button className="icon-button" title="Move to trash" onClick={() => void deleteFile(activeTab.meta)}><Trash2 size={15} /></button>
            <button className="icon-button" title={focusMode ? 'Exit focus view' : 'Maximize file'} onClick={() => setFocusMode((value) => !value)}>{focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
          </div>
        </div>
        {activeTab.meta.kind === 'pdf' && (
          <div className="pdf-tabs-host">
            <div className="pdf-tab-host" key={activeTab.id}>
              {activeTab.data ? <Suspense fallback={<div className="loading-state">Loading PDF tools…</div>}>
                <PdfReader tabId={activeTab.id} data={activeTab.data} title={activeTab.meta.name} initialState={activeTab.pdfState} onStateChange={updatePdfView} />
              </Suspense> : <div className="loading-state">Preparing PDF…</div>}
            </div>
          </div>
        )}
        {activeTab.meta.kind === 'pdf' || activeTab.meta.kind === 'viewer' ? null : isEditableKind(activeTab.meta.kind) ? (
          <WorkspaceEditor
            kind={activeTab.meta.kind}
            name={activeTab.meta.name}
            value={activeTab.draft}
            fontSize={editorFontSize}
            preview={activeTab.preview}
            editorState={activeTab.editorState}
            editorViewRef={activeTab.meta.kind === 'markdown' ? editorViewRef : undefined}
            onChange={(value) => updateDraft(activeTab.id, value)}
            onViewStateChange={(view, preview) => persistEditorViewState(activeTab.id, view, preview)}
          />
        ) : <div className="unsupported-file"><div className="unsupported-icon"><File size={26} /></div><h2>Preview unavailable</h2><p>This file is saved in your workspace. Download it through a backup or open it in another app.</p><span>{formatSize(activeTab.meta.size)} · {activeTab.meta.mimeType}</span></div>}
        {workspaceTabs.filter((tab) => tab.meta.kind === 'viewer' && tab.data instanceof Blob).map((tab) => (
          <div key={tab.id} className="persistent-viewer-panel" style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}>
            <Suspense fallback={<div className="loading-state">Loading file viewer…</div>}>
              <ReadOnlyFileViewer
                tabId={tab.id}
                fileName={tab.meta.name}
                data={tab.data}
                mimeType={tab.meta.mimeType}
                initialState={tab.viewerState}
                initialPdfState={tab.pdfState}
                onStateChange={updateViewerView}
                onPdfStateChange={updatePdfView}
              />
            </Suspense>
          </div>
        ))}
        <footer className="editor-footer"><span>{activeTab.meta.kind === 'code' ? 'Code editor' : activeTab.meta.kind === 'text' ? 'Text editor' : activeTab.meta.kind === 'viewer' ? 'Read-only viewer' : activeTab.meta.kind === 'markdown' ? 'Markdown' : activeTab.meta.kind === 'pdf' ? 'PDF document' : 'File'}{activeTab.dirty ? ' · Unsaved changes' : ''}</span><span>{formatSize(activeTab.meta.size)}</span></footer>
      </div> : <div className="workspace-body" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
        {workspaceTabs.length > 0 && <div className="background-tab-strip"><span>OPEN TABS</span>{workspaceTabs.map((tab) => <button key={tab.id} className={`background-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>{<FileKindIcon kind={tab.meta.kind} size={14} />}<span>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}<span className="background-tab-close" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}><X size={12} /></span></button>)}</div>}
        {view === 'workspace' && !activeProject && !selectedFolder && !workspaceHasContent ? <>
          <WelcomePage onCreateProject={() => void createProject()} onImportFiles={() => startImportInto({ folderId: null, projectId: null, workspaceId: currentWorkspaceId })} onCreateNote={() => void createWorkspaceFile('markdown')} onCreateCodeFile={() => void createWorkspaceFile('code')} />
          <div className="privacy-note"><HardDrive size={15} /> Your files stay in this browser on this device.</div>
        </> : <div className="file-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
          {view === 'workspace' && !activeProject && !selectedFolder && (activeProjects.length > 0 || generalRootFolders.length > 0) && <section className="workspace-overview">
            <div className="workspace-overview-heading"><div><span>YOUR WORKSPACE</span><h1>Projects and folders</h1><p>Choose a project to open its own files, or browse general workspace files below.</p></div><button className="outline-button" onClick={() => void createProject()}><Plus size={14} /> New project</button></div>
            {activeProjects.length > 0 && <><h2>Projects</h2><div className="overview-card-grid">{activeProjects.map((project) => <button className="overview-card" key={project.id} onClick={() => void switchProject(project.id)}><span className="overview-card-icon project-card-icon"><Layers size={17} /></span><b>{project.name}</b><small>{liveFiles.filter((file) => file.projectId === project.id).length} files · {folders.filter((folder) => folder.projectId === project.id).length} folders</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
            {generalRootFolders.length > 0 && <><h2>General folders</h2><div className="overview-card-grid">{generalRootFolders.map((folder) => <button className="overview-card" key={folder.id} onClick={() => { setSelectedFolder(folder.id); setActiveProject(null); setActiveTabId(null); }}><span className="overview-card-icon folder-card-icon"><Folder size={17} /></span><b>{folder.name}</b><small>General workspace folder</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
          </section>}
          <div className="file-list-scroll">
            {view === 'workspace' && currentFolders.length > 0 && <>
              {selectedFolder && <div className="folder-contents-heading"><Folder size={14} /> Folders</div>}
              {currentFolders.sort((a, b) => a.name.localeCompare(b.name)).map((folder) => <div className="file-list-row folder-list-row" key={folder.id} draggable onContextMenu={(event) => showContextMenu('folder', folder.id, event)} onDragStart={(event) => writeDragPayload(event.dataTransfer, { id: folder.id, type: 'folder' })} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.id, folder.projectId, folder.workspaceId)}>
                <button className="file-name-button" onClick={() => { setSelectedFolder(folder.id); setActiveTabId(null); }}><Folder size={17} className="folder-icon" /><span>{folder.name}</span><small>Folder</small></button><span className="kind-cell">Folder</span><span className="size-cell">—</span><span className="date-cell">{new Date(folder.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.id, event)}><Ellipsis size={16} /></button>
              </div>)}
            </>}
            {/* {view === 'workspace' && !activeProject && !selectedFolder && <div className="workspace-files-heading"><span>{visibleFiles.length} file{visibleFiles.length === 1 ? '' : 's'}</span></div>} */}
            {view === 'trash' && trashedFiles.length > 0 && <div className="trash-actions"><span>{trashedFiles.length} item{trashedFiles.length === 1 ? '' : 's'} in Trash</span><button className="outline-button danger-outline" onClick={() => void doEmptyTrash()}><Trash2 size={14} /> Empty Trash</button></div>}
            <div className="list-header"><button onClick={() => { setSort('name'); setSortDesc(sort === 'name' ? !sortDesc : false); }}>Name <ArrowDownUp size={12} /></button><button onClick={() => { setSort('type'); setSortDesc(sort === 'type' ? !sortDesc : false); }}>Kind <ArrowDownUp size={12} /></button><button onClick={() => { setSort('size'); setSortDesc(sort === 'size' ? !sortDesc : false); }}>Size <ArrowDownUp size={12} /></button><button onClick={() => { setSort('updatedAt'); setSortDesc(sort === 'updatedAt' ? !sortDesc : true); }}>Modified <ArrowDownUp size={12} /></button><span /></div>
            {view === 'trash' ? sortedVisible.length === 0 ? <EmptyState title="Trash is empty" message="Files you delete will appear here until you permanently remove them." icon={<Trash2 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
              <button className="file-name-button" onClick={() => void restoreFile(db, file.id).then(refresh)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>Deleted {new Date(file.deletedAt!).toLocaleDateString()}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Restore" onClick={() => void restoreFile(db, file.id).then(refresh)}><Archive size={15} /></button>
            </div>) : view === 'recent' ? sortedVisible.length === 0 ? <EmptyState title="No recent files" message="Open a file or import one to start building your workspace." icon={<Clock3 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
              <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{getProjectName(file.projectId) ?? 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Move to trash" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>
            </div>) : sortedVisible.length === 0 && currentFolders.length === 0 && !(view === 'workspace' && !activeProject && activeProjects.length > 0) ? <EmptyState title={selectedFolder ? 'This folder is empty' : activeProjectRecord ? 'This project is empty' : 'Workspace is empty'} message="Create a note or file, or drag something in from your computer." icon={<FolderTree size={21} />} action={<><button className="primary-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button><button className="text-button" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId })}><Import size={15} /> Import</button></>} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => writeDragPayload(event.dataTransfer, { id: file.id, type: 'file' })}>
              <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{file.projectId ? getProjectName(file.projectId) : 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={16} /></button>
            </div>)}
            {view === 'workspace' && <div className="root-drop-hint"><Import size={14} /> Drop files here to import them into {selectedFolder ? 'this folder' : activeProjectRecord?.name ?? 'the workspace'}</div>}
          </div>
        </div>}
      </div>}
    </main>

    {rightPanel && <aside className="right-panel">
      <div className="right-panel-header"><b>{rightPanel === 'details' ? 'Workspace details' : 'Search results'}</b><button className="icon-button" onClick={() => setRightPanel(null)}><X size={16} /></button></div>
      {rightPanel === 'details' ? <div className="details-content">
        <div className="details-card"><span className="details-icon"><HardDrive size={18} /></span><div><b>Stored on this device</b><span>Only you can access these files.</span></div></div>
        <div className="detail-row"><span>Total files</span><b>{liveFiles.length}</b></div><div className="detail-row"><span>Projects</span><b>{activeProjects.length}</b></div><div className="detail-row"><span>Folders</span><b>{folders.filter((folder) => folder.workspaceId === activeWorkspaceId).length}</b></div><div className="detail-row"><span>Storage used</span><b>{formatSize(liveFiles.reduce((sum, item) => sum + item.size, 0))}</b></div>
        <div className="details-tip"><Bookmark size={15} /> Make regular backups to keep a copy of your workspace.</div><button className="outline-button full-width" onClick={() => void backup.saveWorkspaceBackup()}><Download size={15} /> Save backup</button>
      </div> : <div className="search-results-panel">
        {!query.trim() ? <div className="search-placeholder"><Search size={22} /><b>Search your workspace</b><span>Search file names and folder names, plus text in notes and code.</span></div> : searchResults.length === 0 && folderSearchResults.length === 0 ? <div className="search-placeholder"><Search size={22} /><b>No results found</b><span>Searching file names and folders. Try a different word or phrase.</span></div> : <>
        {folderSearchResults.map((folder) => <button className="search-result" key={`folder-${folder.id}`} onClick={() => { setSelectedFolder(folder.id); setActiveProject(folder.projectId); setView('workspace'); setRightPanel(null); setSearchPopupOpen(false); }}><span className="search-result-title"><Folder size={15} /><b>{folder.name}</b></span><span className="search-result-location">Folder · {getProjectName(folder.projectId) ?? 'Workspace'}</span><span className="search-result-snippet">Open folder</span></button>)}
        {searchResults.map(({ file, text }) => <button className="search-result" key={file.id} onClick={() => { void openFile(file); setSearchPopupOpen(false); }}>
          <span className="search-result-title">{<FileKindIcon kind={file.kind} size={15} />}<b>{file.name}</b></span><span className="search-result-location">{getProjectName(file.projectId) ?? 'Workspace'}</span><span className="search-result-snippet">{text.slice(Math.max(0, text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 42), text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) + 100) || file.name}</span>
        </button>)}
        {query.trim() && (searchResults.length > 0 || folderSearchResults.length > 0) && <div className="search-count">{searchResults.length} file{searchResults.length === 1 ? '' : 's'} · {folderSearchResults.length} folder{folderSearchResults.length === 1 ? '' : 's'}</div>}
        </>}
      </div>}
    </aside>}

    {contextMenu && <div ref={contextMenuRef} className="item-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
      <ItemContextMenu type={contextMenu.type} name={contextMenu.type === 'file' ? files.find((file) => file.id === contextMenu.id)?.name ?? '' : contextMenu.type === 'folder' ? folders.find((folder) => folder.id === contextMenu.id)?.name ?? '' : projects.find((project) => project.id === contextMenu.id)?.name ?? ''} onAction={(action) => void runContextAction(action)} />
    </div>}

    {moveDialog && <MoveDialog itemName={moveDialog.name} destinations={moveDestinations} onClose={() => setMoveDialog(null)} onMove={(target) => void moveItemTo(target)} />}

    <WorkspaceDialog dialog={dialog} onClose={() => setDialog(null)} onSubmit={() => void submitDialog()} onChange={(value) => setDialog((current) => current ? { ...current, value } : current)} />

    {migrationBackup && <MigrationDialog error={migrationError} upgrading={upgrading} desktopApp={isDesktopApp()} onUpgrade={() => void downloadMigrationBackupAndUpgrade()} />}

    <UpdateManager />
    {loading && <StartupScreen />}
    {importing && <BusyPill label="Importing files…" />}
  </div></div>;
}

