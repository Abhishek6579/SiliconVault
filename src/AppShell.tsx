import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { HardDrive } from 'lucide-react';
import { DEFAULT_WORKSPACE_ID, db } from './storage/database';
import { isDesktopApp } from './platform/desktop';
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
import { useTabLifecycle } from './features/tabs/hooks/useTabLifecycle';
import BackgroundTabStrip from './features/tabs/components/BackgroundTabStrip';
import EditorSurface from './features/tabs/components/EditorSurface';
import { getExcludedFolderIds, getMoveDestinations, selectVisibleFiles } from './features/workspace/selectors/destinations';
import ErrorBanner from './shared/ui/ErrorBanner';
import BusyPill from './shared/ui/BusyPill';
import StartupScreen from './shared/ui/StartupScreen';
import WelcomePage from './features/workspace/components/WelcomePage';
import { useClickOutside } from './shared/hooks/useClickOutside';

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
import { useItemActions, type ContextMenuState, type MoveDialogState } from './features/workspace/hooks/useItemActions';
import { useProjectActions } from './features/workspace/hooks/useProjectActions';
import { useFolderActions } from './features/workspace/hooks/useFolderActions';
import { useMigrationUpgrade } from './features/workspace/hooks/useMigrationUpgrade';
import { useWorkspaceNavigationActions } from './features/workspace/hooks/useWorkspaceNavigationActions';
import FileList from './features/workspace/components/file-list/FileList';
import Topbar from './features/workspace/components/topbar/Topbar';
import RightPanel from './features/workspace/components/RightPanel';
import WorkspaceOverview from './features/workspace/components/overview/WorkspaceOverview';
import { useDragAndDrop } from './features/workspace/hooks/useDragAndDrop';
import { selectWorkspaceViewState } from './features/workspace/selectors';

export default function AppShell() {
  useEffect(() => collectFrontendDiagnostics(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const workspace = useWorkspace(setError, setLoading);
  const { files, folders, projects, workspaces, setWorkspaces, activeWorkspaceId, setActiveWorkspaceId, refresh } = workspace;
  const currentWorkspaceId = activeWorkspaceId ?? DEFAULT_WORKSPACE_ID;
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const getProjectName = (id: string | null) => id ? projectNames.get(id) : undefined;
  const { view, setView, activeProject, setActiveProject, selectedFolder, setSelectedFolder, expanded, setExpanded } = useWorkspaceNav();
  const { tabs, setTabs, activeTabId, setActiveTabId, restoreWorkspaceTabs, flushWorkspaceSession } = useWorkspaceTabs(activeWorkspaceId, loading, setError);
  const [query, setQuery] = useState('');
  const [searchPopupOpen, setSearchPopupOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const lastFocusedSurfaceRef = useRef<'pdf' | 'editor' | 'document' | null>(null);
  const [sort, setSort] = useState<'name' | 'type' | 'size' | 'updatedAt'>('name');
  const [sortDesc, setSortDesc] = useState(false);
  const [rightPanel, setRightPanel] = useState<'details' | 'search' | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { darkTheme, setDarkTheme, appZoom, setAppZoom, editorFontSize, setEditorFontSize, setReady: setUiPreferencesReady, toggleTheme } = useUiSettings(setError);
  const systemStats = useSystemStats();
  const { migrationBackup, setMigrationBackup, migrationError, upgrading, downloadMigrationBackupAndUpgrade } = useMigrationUpgrade({
    setLoading, setError, setAppZoom, setEditorFontSize, setPreferencesReady: setUiPreferencesReady,
    setDarkTheme, setWorkspaces, setActiveWorkspaceId, refresh,
  });
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

  const { persistEditorViewState, updateViewerView, updatePdfView } = useTabViewState({ setTabs, setError });

  useGlobalSearchShortcut({ lastFocusedSurfaceRef, editorViewRef, activeTabId, setSearchPopupOpen, setRightPanel });
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
  const { closeTab } = useTabLifecycle({ tabs, activeTabId, setTabs, setActiveTabId, requestConfirmation, persistDraft });
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

  const { createProject } = useProjectActions({
    currentWorkspaceId, requestInput, refresh, setActiveProject, setSelectedFolder, setActiveTabId, setView,
  });
  const { createFolderInCurrent, createNewFile, createWorkspaceFile } = useFolderActions({
    currentWorkspaceId, selectedFolder, activeProject, view, setView, requestInput, refresh, openFile, setExpanded,
  });

  const { handleImport, startImportInto, startImportFolderInto, handleFolderImport } = useImportActions({
    openFile, refresh, selectedFolder, activeProject, currentWorkspaceId,
    setError, setImporting, setImportTarget, setSelectedFolder, setActiveProject,
    setView, setExpanded, setStatus, fileInput, folderInput,
  });
  const { handleDrop } = useDragAndDrop({ activeProject, currentWorkspaceId, handleImport, refresh, setError });
  const { showContextMenu, switchProject, switchWorkspace } = useWorkspaceNavigationActions({
    workspaces, activeWorkspaceId, workspaceTabs, activeTabId,
    switchWorkspace: workspace.switchWorkspace, restoreWorkspaceTabs,
    setActiveProject, setSelectedFolder, setActiveTabId, setView, setWorkspaceMenuOpen, setContextMenu,
  });

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
        actionsData={{ view, selectedFolder, activeProjectRecord, activeProject, currentWorkspaceId, importMenuOpen, importMenuRef, darkTheme, status, searchOpen: searchPopupOpen, query, searchInputRef }}
        actions={{
          setImportMenuOpen, startImportInto, startImportFolderInto, createFolderInCurrent: () => void createFolderInCurrent(),
          createWorkspaceFile, setSearchPopupOpen, setQuery, setRightPanel, toggleTheme,
          setDetailsOpen: () => setRightPanel((current) => current === 'details' ? null : 'details'),
        }}
      />



      <input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId }; void handleImport(event.target.files, target.folderId, target.projectId, target.workspaceId); setImportTarget(null); }} />
      <input ref={folderInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId }; void handleFolderImport(event.target.files, target); }} />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {activeTab ? <EditorSurface
        data={{ activeTab, workspaceTabs, activeTabId, editorFontSize, editorWorkspaceRef, editorViewRef, folders, getProjectName, focusMode }}
        actions={{
          onOpenTab: (tab) => void openFile(tab.meta),
          onCloseTab: closeTab,
          onImport: () => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId }),
          onFontSizeChange: setEditorFontSize,
          onTogglePreview: () => {
            const preview = !activeTab.preview;
            const editorState = { anchor: activeTab.editorState?.anchor ?? 0, head: activeTab.editorState?.head ?? 0, scrollTop: activeTab.editorState?.scrollTop ?? 0, scrollLeft: activeTab.editorState?.scrollLeft ?? 0, preview };
            setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, preview, editorState } : tab));
            void db.preferences.put({ key: `editor:${activeTab.id}`, value: editorState, updatedAt: Date.now() }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save editor view state.'));
          },
          onSave: () => void persistDraft(activeTab.id, activeTab.draft).catch(() => undefined),
          onRename: () => void renameItem(activeTab.meta),
          onDelete: () => void deleteFile(activeTab.meta),
          onToggleFocus: () => setFocusMode((value) => !value),
          updatePdfView, updateViewerView, updateDraft, persistEditorViewState,
        }}
      />: <div className="workspace-body" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
        <BackgroundTabStrip tabs={workspaceTabs} activeTabId={activeTabId} onOpen={(tab) => void openFile(tab.meta)} onClose={closeTab} />
        {view === 'workspace' && !activeProject && !selectedFolder && !workspaceHasContent ? <>
          <WelcomePage onCreateProject={() => void createProject()} onImportFiles={() => startImportInto({ folderId: null, projectId: null, workspaceId: currentWorkspaceId })} onCreateNote={() => void createWorkspaceFile('markdown')} onCreateCodeFile={() => void createWorkspaceFile('code')} />
          <div className="privacy-note"><HardDrive size={15} /> Your files stay in this browser on this device.</div>
        </> : <div className="file-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
          <WorkspaceOverview
            data={{ view, activeProject, selectedFolder, activeProjects, generalRootFolders, liveFiles, folders }}
            actions={{ createProject: () => void createProject(), switchProject, setSelectedFolder, setActiveProject, setActiveTabId }}
          />
          <FileList
            data={{ view, sort, sortDesc, currentFolders, selectedFolder, activeProject, activeProjectRecord, activeProjects, currentWorkspaceId, trashedFiles, sortedVisible, getProjectName }}
            actions={{ setSelectedFolder, setActiveTabId, setSort, setSortDesc, showContextMenu, handleDrop, doEmptyTrash, restoreTrashedFile, openFile, deleteFile, createWorkspaceFile, startImportInto }}
          />
        </div>}
      </div>}
    </main>

    <RightPanel
      data={{ panel: rightPanel, liveFiles, activeProjects, folders, activeWorkspaceId, query, searchResults, folderSearchResults, getProjectName }}
      actions={{
        setPanel: setRightPanel,
        saveBackup: () => void backup.saveWorkspaceBackup(),
        openFile: (file) => { void openFile(file); setSearchPopupOpen(false); },
        openFolder: (folder) => { setSelectedFolder(folder.id); setActiveProject(folder.projectId); setView('workspace'); setRightPanel(null); setSearchPopupOpen(false); },
      }}
    />

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

