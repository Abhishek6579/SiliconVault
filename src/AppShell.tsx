import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { EditorView } from '@codemirror/view';
import {
  Archive, ArrowDownUp, Check, ChevronDown, ChevronRight, Code2, Command, Download,
  Ellipsis, File, FileCode2, FilePlus2, FileText, Folder, FolderPlus, FolderTree, HardDrive,
  Import, LayoutGrid, Menu, MoreHorizontal, Plus, Search, Settings2,
  Trash2, X, Clock3, Bookmark, Pencil, Save, ExternalLink, Moon, Sun, Layers, MoveRight, Maximize2, Minimize2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { DEFAULT_WORKSPACE_ID, db, WorkspaceDatabaseV1, WorkspaceDatabaseV2 } from './storage/database';
import FileKindIcon from './components/FileKindIcon';
import { formatSize } from './utils/format';
import { migrateLegacyUiPreferences } from './storage/preferences';
import { saveWorkspaceSession } from './storage/tabSession';
import { createFolder } from './storage/hierarchy';
import { countFolderItems, createTextFile, deleteFolderContents, emptyTrash, getFolderSubtreeIds, kindForFile, renameFile, restoreFile, softDeleteFile } from './storage/files';
import { downloadBackup, exportBackupStream } from './storage/backup';
import { isDesktopApp, saveBackupToDesktop } from './platform/desktop';
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
import { isEditableKind } from './shared/constants/fileKinds';
import { getExcludedFolderIds, getMoveDestinations, selectVisibleFiles } from './features/workspace/selectors/destinations';
import EmptyState from './shared/ui/EmptyState';
import ErrorBanner from './shared/ui/ErrorBanner';
import BusyPill from './shared/ui/BusyPill';
import StartupScreen from './shared/ui/StartupScreen';
import WelcomePage from './features/workspace/components/WelcomePage';
import { useClickOutside } from './shared/hooks/useClickOutside';
import { readDragPayload } from './shared/utils/dragPayload';
import { useOpenFile } from './features/tabs/hooks/useOpenFile';
import MoveDialog from './features/workspace/components/dialogs/MoveDialog';
import MigrationDialog from './features/workspace/components/dialogs/MigrationDialog';
import { useTabViewState } from './features/tabs/hooks/useTabViewState';
import { useWheelZoom } from './app/hooks/useWheelZoom';
import { useGlobalSearchShortcut } from './features/search/hooks/useGlobalSearchShortcut';
import ItemContextMenu from './features/workspace/components/menus/ItemContextMenu';
import Sidebar from './features/workspace/components/sidebar/Sidebar';
import ProjectTree from './features/workspace/components/sidebar/ProjectTree';
import { useWorkspaceNav } from './features/workspace/context/WorkspaceNavContext';
import { DialogHost, useDialog } from './features/workspace/context/DialogContext';
import { useImportActions, type ImportTarget } from './features/workspace/hooks/useImportActions';
import { useItemActions, type ContextItemType, type ContextMenuState, type MoveDialogState } from './features/workspace/hooks/useItemActions';
import FileList from './features/workspace/components/file-list/FileList';
import Topbar from './features/workspace/components/topbar/Topbar';
import { useDragAndDrop } from './features/workspace/hooks/useDragAndDrop';
import { selectWorkspaceViewState } from './features/workspace/selectors';
import type { Tab } from './features/tabs/types';
import type { FileMeta, Folder as FolderRecord, Project, Workspace } from './storage/types';
const PdfReader = lazy(() => import('./PdfReader'));
const ReadOnlyFileViewer = lazy(() => import('./viewers/ReadOnlyFileViewer'));

type View = 'workspace' | 'recent' | 'trash';
interface SearchResult { file: FileMeta; text: string; }

export default function AppShell() {
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


  const { prompt: requestInput, confirm: requestConfirmation } = useDialog();

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

  const { handleImport, startImportInto, startImportFolderInto, handleFolderImport } = useImportActions({
    openFile, refresh, selectedFolder, activeProject, currentWorkspaceId,
    setError, setImporting, setImportTarget, setSelectedFolder, setActiveProject,
    setView, setExpanded, setStatus, fileInput, folderInput,
  });
  const { handleDrop } = useDragAndDrop({ activeProject, currentWorkspaceId, handleImport, refresh, setError });

  const {
    moveItemTo, renameItem, deleteFile, deleteFolder, deleteProject, restoreProject, restoreTrashedFile,
    doEmptyTrash, runContextAction,
  } = useItemActions({
    files, folders, projects, tabs, activeProject, selectedFolder, activeTabId,
    currentWorkspaceId, moveDialog, contextMenu, trashedFiles,
    setTabs, setActiveProject, setSelectedFolder, setActiveTabId, setView,
    setMoveDialog, setContextMenu, requestInput, requestConfirmation, openFile,
    refresh, switchProject, switchWorkspace: workspace.switchWorkspace,
    startImportInto, startImportFolderInto, waitForSave, flushPendingSaves, setError,
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
      <Topbar
        switcherData={{ view, activeWorkspace, activeWorkspaceId, activeProjectRecord, activeProject, selectedFolder, folders, workspaces, activeProjects, trashedFiles, open: workspaceMenuOpen, menuRef: workspaceMenuRef }}
        switcherActions={{
          setOpen: setWorkspaceMenuOpen, switchWorkspace, createWorkspace, renameWorkspace, deleteCurrentWorkspace,
          switchProject, setView, setActiveTabId, createProject: () => void createProject(), doEmptyTrash,
          restoreProject, deleteProject, deleteFolder,
        }}
        actionsData={{ view, selectedFolder, activeProjectRecord, activeProject, currentWorkspaceId, importMenuOpen, importMenuRef, darkTheme, status }}
        actions={{
          setImportMenuOpen, startImportInto, startImportFolderInto, createFolderInCurrent: () => void createFolderInCurrent(),
          createWorkspaceFile, setSearchPopupOpen, setRightPanel, toggleTheme,
          setDetailsOpen: () => setRightPanel((current) => current === 'details' ? null : 'details'),
        }}
      />

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
          <FileList
            data={{ view, sortDesc, currentFolders, selectedFolder, activeProject, activeProjectRecord, activeProjects, currentWorkspaceId, trashedFiles, sortedVisible, getProjectName }}
            actions={{ setSelectedFolder, setActiveTabId, setSort, setSortDesc, showContextMenu, handleDrop, doEmptyTrash, restoreTrashedFile, openFile, deleteFile, createWorkspaceFile, startImportInto }}
          />
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

    <DialogHost onError={setError} />

    {migrationBackup && <MigrationDialog error={migrationError} upgrading={upgrading} desktopApp={isDesktopApp()} onUpgrade={() => void downloadMigrationBackupAndUpgrade()} />}

    <UpdateManager />
    {loading && <StartupScreen />}
    {importing && <BusyPill label="Importing files…" />}
  </div></div>;
}

