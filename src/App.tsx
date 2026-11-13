import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Activity, Archive, ArrowDownUp, BookOpen, Check, ChevronDown, ChevronRight, Code2, Command, Download,
  Ellipsis, File, FileCode2, FilePlus2, FileText, Folder, FolderPlus, FolderTree, HardDrive,
  Import, LayoutGrid, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2,
  Trash2, X, Clock3, Bookmark, Pencil, Sparkles, Save, FileArchive, ExternalLink, Moon, Sun, Layers, MoveRight, Maximize2, Minimize2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { DEFAULT_WORKSPACE_ID, db, WorkspaceDatabaseV1, WorkspaceDatabaseV2 } from './storage/database';
import MermaidDiagram from './components/MermaidDiagram';
import FileKindIcon from './components/FileKindIcon';
import WorkspaceDialog, { type WorkspaceDialogState } from './components/WorkspaceDialog';
import { buildWorkspaceTree, type WorkspaceTreeFolder } from './storage/tree';
import { formatSize } from './utils/format';
import { migrateLegacyUiPreferences } from './storage/preferences';
import { hydrateWorkspaceTab, saveWorkspaceSession } from './storage/tabSession';
import { createFolder, moveFile, moveFolder, restoreProject as unarchiveProject, softDeleteProject } from './storage/hierarchy';
import { countFolderItems, createTextFile, deleteFolderContents, emptyTrash, getFolderSubtreeIds, importFile, kindForFile, renameFile, restoreFile, softDeleteFile } from './storage/files';
import { downloadBackup, exportBackupStream } from './storage/backup';
import { isDesktopApp, iterateDesktopFiles, iterateDesktopFolder, saveBackupToDesktop } from './platform/desktop';
import { useWorkspaceSearch } from './features/search/hooks/useWorkspaceSearch';
import { useGlobalShortcuts } from './app/hooks/useGlobalShortcuts';
import { useSystemStats } from './features/settings/hooks/useSystemStats';
import DiagnosticsDashboard from './features/diagnostics/components/DiagnosticsDashboard';
import { collectFrontendDiagnostics } from './diagnostics.js';
import { useUiSettings } from './features/settings/hooks/useUiSettings';
import { useWorkspace } from './features/workspace/hooks/useWorkspace';
import { useWorkspaceActions } from './features/workspace/hooks/useWorkspaceActions';
import { useWorkspaceInitialization } from './features/workspace/hooks/useWorkspaceInitialization';
import { useAutosave } from './features/editor/hooks/useAutosave';
import { useWorkspaceBackup } from './features/backup/hooks/useWorkspaceBackup';
import { useWorkspaceTabs } from './features/tabs/hooks/useWorkspaceTabs';
import { selectWorkspaceViewState } from './features/workspace/selectors';
import type { EditorViewState, PdfViewState, Tab } from './features/tabs/types';
import type { FileMeta, Folder as FolderRecord, Project, Workspace } from './storage/types';
const PdfReader = lazy(() => import('./PdfReader'));
const ReadOnlyFileViewer = lazy(() => import('./viewers/ReadOnlyFileViewer'));

type View = 'workspace' | 'recent' | 'trash' | 'diagnostics';
type ContextItemType = 'file' | 'folder' | 'project';
interface ContextMenuState { type: ContextItemType; id: string; x: number; y: number; }
interface MoveDialogState { type: 'file' | 'folder'; id: string; name: string; }
interface ImportTarget { folderId: string | null; projectId: string | null; workspaceId: string; }
interface SearchResult { file: FileMeta; text: string; }

// Accept both Markdown's $...$ syntax and the common LaTeX \\( ... \\) / \\[ ... \\] delimiters.
// Normalize only the math delimiters and escaped subscripts inside math spans; the stored note stays untouched.
function normalizeMarkdownMath(source: string): string {
  const normalized = source
    .replace(/\\\\\\\\?\\(/g, '
export default function App() {
  useEffect(() => collectFrontendDiagnostics(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const workspace = useWorkspace(setError, setLoading);
  const { files, folders, projects, workspaces, setWorkspaces, activeWorkspaceId, setActiveWorkspaceId, refresh } = workspace;
  const [migrationBackup, setMigrationBackup] = useState<number | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [view, setView] = useState<View>('workspace');
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { tabs, setTabs, activeTabId, setActiveTabId, restoreWorkspaceTabs, flushWorkspaceSession } = useWorkspaceTabs(activeWorkspaceId, loading, setError);
  const [query, setQuery] = useState('');
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
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useWorkspaceInitialization({
    refresh, setMigrationBackup, setLoading, setError, setAppZoom, setEditorFontSize,
    setPreferencesReady: setUiPreferencesReady, setDarkTheme, setWorkspaces, setActiveWorkspaceId,
    restoreTabs: restoreWorkspaceTabs,
  });
  useGlobalShortcuts(setAppZoom);

  // Fixed near-black editor theme inspired by the supplied reference.
  const editorTheme = useMemo(() => EditorView.theme({
    '&': { height: '100%', backgroundColor: '#111111', color: '#e6e6e6' },
    '.cm-scroller': { fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace", lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { caretColor: '#f2f2f2', fontSize: `${editorFontSize}px` },
    '.cm-line': { padding: '0 4px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#f2f2f2' },
    '.cm-gutters': { backgroundColor: '#111111', color: '#777777', border: 'none', borderRight: '1px solid #242424', fontSize: `${editorFontSize}px` },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '3.5em', padding: '0 12px 0 10px' },
    '.cm-activeLine': { backgroundColor: '#191919' },
    '.cm-activeLineGutter': { backgroundColor: '#191919', color: '#d8d8d8' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#343b4a' },
    '.cm-selectionMatch': { backgroundColor: '#292f3a' },
    '.cm-focused .cm-matchingBracket': { backgroundColor: '#292f3a', outline: '1px solid #59677f' },
    '.cm-searchMatch': { backgroundColor: '#51421f', outline: '1px solid #8a7134' },
    '.cm-searchMatch-selected': { backgroundColor: '#6a5526' },
    '.cm-tooltip': { backgroundColor: '#1b1b1b', color: '#e6e6e6', border: '1px solid #383838' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#30343d', color: '#ffffff' },
    '.cm-foldPlaceholder': { backgroundColor: '#292929', color: '#c7c7c7', border: 'none' },
  }, { dark: true }), [editorFontSize]);
  const editorSyntax = useMemo(() => syntaxHighlighting(HighlightStyle.define([
    { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
    { tag: tags.keyword, color: '#c586c0' },
    { tag: [tags.typeName, tags.className], color: '#4ec9b0' },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: '#dcdcaa' },
    { tag: [tags.string, tags.regexp, tags.special(tags.string)], color: '#ce9178' },
    { tag: [tags.number, tags.bool, tags.null], color: '#b5cea8' },
    { tag: tags.operator, color: '#d4d4d4' },
  ])), []);

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
  const persistEditorViewState = useCallback((id: string, view: EditorView, preview: boolean) => {
    const selection = view.state.selection.main;
    const state: EditorViewState = {
      anchor: selection.anchor,
      head: selection.head,
      scrollTop: view.scrollDOM.scrollTop,
      scrollLeft: view.scrollDOM.scrollLeft,
      preview,
    };
    void db.preferences.put({ key: `editor:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save editor position.');
    });
  }, [setError]);

  const updatePdfView = useCallback((id: string, state: PdfViewState) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, pdfState: state } : tab));
    void db.preferences.put({ key: `pdf:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save this PDF reading position.');
    });
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.global-search input')?.focus();
      }
      if (event.key === 'Escape') document.querySelector<HTMLInputElement>('.global-search input')?.blur();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  useEffect(() => { if (!activeTabId) setFocusMode(false); }, [activeTabId]);
  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!workspaceMenuRef.current?.contains(target)) setWorkspaceMenuOpen(false);
      if (!importMenuRef.current?.contains(target)) setImportMenuOpen(false);
      if (!contextMenuRef.current?.contains(target)) setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenus);
    return () => window.removeEventListener('pointerdown', closeMenus);
  }, []);

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

  const tree = useMemo(() => buildWorkspaceTree(folders, liveFiles, null, activeProject, activeWorkspaceId), [folders, liveFiles, activeProject, activeWorkspaceId]);
  const excludedMoveFolders = useMemo(() => {
    const ids = new Set<string>();
    if (moveDialog?.type !== 'folder') return ids;
    ids.add(moveDialog.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) if (folder.parentFolderId && ids.has(folder.parentFolderId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
    }
    return ids;
  }, [folders, moveDialog]);
  const moveDestinations = useMemo(() => [
    ...workspaces.map((workspace) => ({ key: `workspace-${workspace.id}`, label: workspace.name, detail: 'Workspace root', folderId: null, projectId: null, workspaceId: workspace.id })),
    ...projects.filter((project) => !project.archived).map((project) => ({ key: `project-${project.id}`, label: project.name, detail: `${workspaces.find((workspace) => workspace.id === project.workspaceId)?.name ?? 'Workspace'} · Project`, folderId: null, projectId: project.id, workspaceId: project.workspaceId })),
    ...folders.filter((folder) => !excludedMoveFolders.has(folder.id) && (folder.projectId === null || projects.some((project) => project.id === folder.projectId && !project.archived))).map((folder) => ({
      key: `folder-${folder.id}`,
      label: folder.name,
      detail: `${workspaces.find((workspace) => workspace.id === folder.workspaceId)?.name ?? 'Workspace'} · ${projects.find((project) => project.id === folder.projectId)?.name ?? 'General'} · Folder`,
      folderId: folder.id,
      projectId: folder.projectId,
      workspaceId: folder.workspaceId,
    })),
  ], [excludedMoveFolders, folders, projects, workspaces]);

  const searchResults = useWorkspaceSearch(liveFiles, query, setError);

  const openFile = useCallback(async (fileMeta: FileMeta) => {
    // Reclassify on open so legacy HDL records cannot remain editable.
    const meta: FileMeta = { ...fileMeta, kind: kindForFile(fileMeta.name, fileMeta.mimeType) };
    let restoredTabs: Tab[] = [];
    if (meta.workspaceId !== activeWorkspaceId) {
      if (activeWorkspaceId) {
        await saveWorkspaceSession(db, activeWorkspaceId, tabs.filter((tab) => tab.meta.workspaceId === activeWorkspaceId).map((tab) => tab.id), activeTabId);
      }
      await workspace.switchWorkspace(meta.workspaceId);
      const restored = await restoreWorkspaceTabs(meta.workspaceId);
      restoredTabs = restored.tabs;
      setActiveProject(meta.projectId);
      setSelectedFolder(meta.parentFolderId);
      setView('workspace');
    }
    const existing = tabs.find((tab) => tab.id === meta.id) ?? restoredTabs.find((tab) => tab.id === meta.id);
    const persistOpenTabSession = async () => {
      const currentWorkspaceTabs = (meta.workspaceId === activeWorkspaceId ? tabs : restoredTabs)
        .filter((tab) => tab.meta.workspaceId === meta.workspaceId);
      const openFileIds = [...new Set([...currentWorkspaceTabs.map((tab) => tab.id), meta.id])];
      try {
        // Commit the session before publishing the tab in React state. A page reload
        // immediately after the tab appears must not race the debounced session effect.
        await saveWorkspaceSession(db, meta.workspaceId, openFileIds, meta.id);
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not save the open-tab session.');
        return false;
      }
    };
    if (existing) {
      let hydrated: Tab;
      try {
        hydrated = existing.hydrated !== true ? await hydrateWorkspaceTab(db, existing) : existing;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : `Could not open “${meta.name}”.`);
        return;
      }
      if (hydrated.dirty) trackRecoveredDraft(meta.id, hydrated.draft);
      if (!(await persistOpenTabSession())) return;
      setTabs((current) => current.map((tab) => {
        if (tab.id === meta.id) return hydrated;
        if (!(tab.data instanceof Blob)) return tab;
        const { data: _released, ...withoutPdfData } = tab;
        return { ...withoutPdfData, hydrated: false };
      }));
      setActiveTabId(meta.id);
      setError('');
      return;
    }
    let newTab: Tab;
    try {
      newTab = await hydrateWorkspaceTab(db, {
        id: meta.id,
        meta,
        draft: '',
        dirty: false,
        preview: meta.kind === 'markdown',
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not open “${meta.name}”.`);
      return;
    }
    if (newTab.dirty) trackRecoveredDraft(meta.id, newTab.draft);
    if (!(await persistOpenTabSession())) return;
    setTabs((current) => [
      ...current.map((tab) => {
        if (!(tab.data instanceof Blob)) return tab;
        const { data: _released, ...withoutPdfData } = tab;
        return { ...withoutPdfData, hydrated: false };
      }),
      newTab,
    ]);
    setActiveTabId(meta.id);
    if (newTab.dirty) setStatus('Recovered an unsaved draft · Save to keep these changes');
    setError('');
  }, [activeWorkspaceId, restoreWorkspaceTabs, tabs, trackRecoveredDraft, workspace.switchWorkspace]);

  useEffect(() => {
    if (!activeTab || activeTab.hydrated === true || loading) return;
    void openFile(activeTab.meta).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : `Could not restore “${activeTab.meta.name}”.`);
    });
  }, [activeTab, loading, openFile]);

  function createProject() {
    requestInput('Create project', '', 'Project name', 'Create project', async (name) => {
      const now = Date.now();
      const project: Project = { id: crypto.randomUUID(), workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID, name: name.trim(), archived: false, createdAt: now, updatedAt: now };
      await db.projects.add(project);
      await refresh();
      setActiveProject(project.id); setSelectedFolder(null); setActiveTabId(null); setView('workspace');
    });
  }

  function createFolderInCurrent() {
    requestInput('Create folder', '', 'Folder name', 'Create folder', async (name) => {
      const folder = await createFolder(db, name.trim(), selectedFolder, activeProject, activeWorkspaceId ?? DEFAULT_WORKSPACE_ID);
      setExpanded((current) => new Set(current).add(folder.id));
      await refresh();
    });
  }

  function createNewFile(kind: 'markdown' | 'code') {
    const initial = kind === 'markdown' ? 'Untitled note.md' : 'Untitled.ts';
    requestInput(kind === 'markdown' ? 'Create note' : 'Create code file', initial, 'File name', 'Create file', async (name) => {
      const text = kind === 'markdown' ? `# ${name.replace(/\.(md|markdown)$/i, '')}\n\n` : '';
      const meta = await createTextFile(db, name.trim(), text, { parentFolderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID, kind });
      await refresh();
      await openFile(meta);
    });
  }

  async function handleImport(fileList: FileList | null, destinationFolderId = selectedFolder, destinationProjectId = activeProject, destinationWorkspaceId = activeWorkspaceId ?? DEFAULT_WORKSPACE_ID) {
    if (!fileList?.length) return;
    setImporting(true);
    try {
      for (const file of Array.from(fileList)) {
        const meta = await importFile(db, file, { parentFolderId: destinationFolderId, projectId: destinationProjectId, workspaceId: destinationWorkspaceId });
        if (['pdf', 'markdown', 'code', 'text', 'viewer'].includes(meta.kind)) await openFile(meta);
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
        if (['pdf', 'markdown', 'code', 'text', 'viewer'].includes(meta.kind)) await openFile(meta);
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
      await emptyTrash(db, activeWorkspaceId ?? DEFAULT_WORKSPACE_ID);
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

  function toggleFolder(id: string) {
    setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function handleDrop(event: DragEvent, folderId: string | null, destinationProjectId = activeProject, destinationWorkspaceId = activeWorkspaceId ?? DEFAULT_WORKSPACE_ID) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files.length > 0) {
      void handleImport(event.dataTransfer.files, folderId, destinationProjectId, destinationWorkspaceId);
      return;
    }
    const payload = event.dataTransfer.getData('application/x-workbench-item');
    if (!payload) return;
    const { id, type } = JSON.parse(payload) as { id: string; type: 'file' | 'folder' };
    void (async () => {
      try {
        if (type === 'file') await moveFile(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        else await moveFolder(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        await refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not move this item.'); }
    })();
  }

  function renderFolder(folder: WorkspaceTreeFolder, depth = 0) {
    const isOpen = expanded.has(folder.record.id);
    const selected = selectedFolder === folder.record.id;
    return <div key={folder.record.id}>
      <div className={`tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: `${12 + depth * 16}px` }} draggable onContextMenu={(event) => showContextMenu('folder', folder.record.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: folder.record.id, type: 'folder' }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.record.id, folder.record.projectId, folder.record.workspaceId)}>
        <button className="tree-main" onClick={() => { setSelectedFolder(folder.record.id); setActiveProject(folder.record.projectId); setView('workspace'); setActiveTabId(null); }} onDoubleClick={() => toggleFolder(folder.record.id)}>
          <span className="twisty" onClick={(event) => { event.stopPropagation(); toggleFolder(folder.record.id); }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          {isOpen ? <Folder size={16} className="folder-icon open" /> : <Folder size={16} className="folder-icon" />}
          <span className="truncate" title={folder.record.name}>{folder.record.name}</span>
        </button>
        <button className="mini-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.record.id, event)}><Ellipsis size={15} /></button>
      </div>
      {isOpen && <>
        {folder.children.map((child) => renderFolder(child, depth + 1))}
        {folder.files.sort((a, b) => a.name.localeCompare(b.name)).map((file) => renderFileTree(file, depth + 1))}
      </>}
    </div>;
  }

  function renderFileTree(file: FileMeta, depth = 0) {
    return <div key={file.id} className={`tree-row file-row ${activeTabId === file.id ? 'selected' : ''}`} style={{ paddingLeft: `${31 + depth * 16}px` }} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
      <button className="tree-main" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={15} />}<span className="truncate" title={file.name}>{file.name}</span></button>
      <button className="mini-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={15} /></button>
    </div>;
  }

  function renderProjectTree(project: Project) {
    const open = activeProject === project.id;
    const projectTree = buildWorkspaceTree(folders, liveFiles, null, project.id, project.workspaceId);
    const filesAtRoot = liveFiles.filter((file) => file.projectId === project.id && file.parentFolderId === null);
    return <div key={project.id}>
      <div className={`tree-row project-row ${open ? 'selected' : ''}`} onContextMenu={(event) => showContextMenu('project', project.id, event)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, null, project.id, project.workspaceId)}>
        <button className="tree-main" aria-expanded={open} onClick={() => { setActiveProject((current) => current === project.id ? null : project.id); setSelectedFolder(null); setView('workspace'); setActiveTabId(null); }}>
          <span className="twisty">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <span className="project-dot" />
          <span className="truncate" title={project.name}>{project.name}</span>
        </button>
        <button className="mini-action" title="Project actions" onClick={(event) => showContextMenu('project', project.id, event)}><Ellipsis size={15} /></button>
      </div>
      {open && <div className="project-children" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, null, project.id, project.workspaceId)}>
        {projectTree.map((folder) => renderFolder(folder))}
        {filesAtRoot.map((file) => renderFileTree(file))}
        {projectTree.length === 0 && filesAtRoot.length === 0 && <button className="tree-empty" onClick={() => void createNewFile('markdown')}>Nothing here yet <span>+ add a note</span></button>}
      </div>}
    </div>;
  }

  async function createWorkspaceFile(kind: 'markdown' | 'code') {
    if (view !== 'workspace') setView('workspace');
    await createNewFile(kind);
  }

  const visibleFiles = view === 'trash' ? trashedFiles : view === 'recent'
    ? [...liveFiles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40)
    : view === 'workspace' && !activeProject && !selectedFolder
      ? liveFiles
      : liveFiles.filter((file) => file.workspaceId === activeWorkspaceId && file.projectId === activeProject && file.parentFolderId === selectedFolder);
  const sortedVisible = view === 'recent' || view === 'trash' ? [...visibleFiles] : [...visibleFiles].sort((a, b) => {
    const order = sort === 'type' ? a.kind.localeCompare(b.kind) : sort === 'size' ? a.size - b.size : sort === 'updatedAt' ? a.updatedAt - b.updatedAt : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sortDesc ? -order : order;
  });

  return <div className="app-viewport" data-theme={darkTheme ? 'dark' : 'light'}><div className={`app-shell ${focusMode ? 'focus-mode' : ''}`} data-theme={darkTheme ? 'dark' : 'light'} style={{ transform: `scale(${appZoom})`, width: `calc(100% / ${appZoom})`, height: `calc(100% / ${appZoom})` }}>
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Command size={19} strokeWidth={2.2} /></div>
        {!sidebarCollapsed && <div className="brand-copy"><b>Workbench</b><span>Engineering workspace</span></div>}
        <button className="icon-button sidebar-toggle" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
      </div>

      {!sidebarCollapsed && <>
        <div className="sidebar-primary">
          <button className={`nav-item ${view === 'workspace' && activeProject === null ? 'active' : ''}`} onClick={() => { setView('workspace'); setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }}><LayoutGrid size={16} /> Workspace</button>
          <button className={`nav-item ${view === 'recent' ? 'active' : ''}`} onClick={() => { setView('recent'); setActiveTabId(null); }}><Clock3 size={16} /> Recent <span className="nav-count">{liveFiles.length}</span></button>
          <button className={`nav-item ${view === 'trash' ? 'active' : ''}`} onClick={() => { setView('trash'); setActiveTabId(null); }}><Trash2 size={16} /> Trash {trashedFiles.length > 0 && <span className="nav-count">{trashedFiles.length}</span>}</button>
          <button className={`nav-item ${view === 'diagnostics' ? 'active' : ''}`} onClick={() => { setView('diagnostics'); setActiveTabId(null); }}><Activity size={16} /> Diagnostics</button>
        </div>
        <div className="sidebar-section-heading"><span>PROJECTS</span><button title="New project" onClick={() => void createProject()}><Plus size={15} /></button></div>
        <div className="project-tree">
          {(buildWorkspaceTree(folders, liveFiles, null, null, activeWorkspaceId).length > 0 || liveFiles.some((file) => file.workspaceId === activeWorkspaceId && file.projectId === null && file.parentFolderId === null)) && <div className="sidebar-section-heading workspace-tree-heading"><span>WORKSPACE FILES</span></div>}
          {buildWorkspaceTree(folders, liveFiles, null, null, activeWorkspaceId).map((folder) => renderFolder(folder))}
          {liveFiles.filter((file) => file.workspaceId === activeWorkspaceId && file.projectId === null && file.parentFolderId === null).map((file) => renderFileTree(file))}
          {projects.filter((project) => !project.archived && project.workspaceId === activeWorkspaceId).map(renderProjectTree)}
          {projects.filter((project) => !project.archived && project.workspaceId === activeWorkspaceId).length === 0 && <div className="sidebar-empty">Your projects<br /><span>show up here</span></div>}
          {projects.some((project) => project.archived && project.workspaceId === activeWorkspaceId) && <>
            <div className="sidebar-section-heading archived-heading"><span>ARCHIVED</span></div>
            {projects.filter((project) => project.archived && project.workspaceId === activeWorkspaceId).map(renderProjectTree)}
          </>}
        </div>
        <div className="sidebar-bottom">
          <div className="system-monitor" aria-label="System utilisation">
            <div className="system-monitor-heading"><Activity size={13} /><span>System</span><span className="system-monitor-live">LIVE</span></div>
            {[
              { label: 'CPU', value: systemStats.cpu },
              { label: 'RAM', value: systemStats.ram },
              { label: 'GPU', value: systemStats.gpu },
            ].map(({ label, value }) => (
              <div className="system-metric" key={label} title={value == null ? `${label} utilisation unavailable` : `${label} utilisation ${Math.round(value)}%`}>
                <span className="system-metric-label">{label}</span>
                <div className="system-metric-track" role="meter" aria-label={`${label} utilisation`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
                  <i style={{ width: `${value == null ? 0 : Math.min(100, Math.max(0, value))}%` }} />
                </div>
                <span className="system-metric-value">{value == null ? '—' : `${Math.round(value)}%`}</span>
              </div>
            ))}
            <div className="system-storage">
              <div className="storage-line"><HardDrive size={14} /><span>Stored on this device</span></div>
              <div className="storage-meter"><i style={{ width: `${Math.min(100, storedBytes / (250 * 1024 * 1024) * 100)}%` }} /></div>
              <span className="storage-caption">{formatSize(storedBytes)} used</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button onClick={() => void backup.saveWorkspaceBackup()} title="Save a workspace backup"><Download size={15} /> Backup</button>
            <button onClick={() => void backup.restoreFromPicker(backupInput.current)} title="Restore from backup"><Import size={15} /> Restore</button>
          </div>
          <input ref={backupInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void backup.openBackup(event.target.files?.[0], event.currentTarget)} />
        </div>
      </>}
      {sidebarCollapsed && <div className="collapsed-nav"><button title="Workspace" onClick={() => { setView('workspace'); setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }}><LayoutGrid size={18} /></button><button title="Recent" onClick={() => { setView('recent'); setActiveTabId(null); }}><Clock3 size={18} /></button><button title="Trash" onClick={() => { setView('trash'); setActiveTabId(null); }}><Trash2 size={18} /></button><button title="Diagnostics" onClick={() => { setView('diagnostics'); setActiveTabId(null); }}><Activity size={18} /></button><button title="New project" onClick={() => void createProject()}><Plus size={18} /></button></div>}
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="workspace-switcher" ref={workspaceMenuRef}>
          <button className="workspace-switch-button" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((open) => !open)}>
            <Layers size={16} /><span>{view === 'trash' ? 'Trash' : view === 'recent' ? 'Recent files' : view === 'diagnostics' ? 'Diagnostics' : activeWorkspace?.name ?? 'Workspace'}{activeProjectRecord ? ` / ${activeProjectRecord.name}` : ''}</span>
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
              <button onClick={() => { setImportMenuOpen(false); startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }); }}><FileText size={15} /><span>Import files</span></button>
              <button onClick={() => { setImportMenuOpen(false); startImportFolderInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }); }}><FolderPlus size={15} /><span>Import folder</span></button>
              <div className="switch-menu-separator" />
              <button onClick={() => { setImportMenuOpen(false); void createFolderInCurrent(); }}><FolderPlus size={15} /><span>New folder</span></button>
              <button onClick={() => { setImportMenuOpen(false); void createWorkspaceFile('markdown'); }}><FilePlus2 size={15} /><span>New note</span></button>
              <button onClick={() => { setImportMenuOpen(false); void createWorkspaceFile('code'); }}><Code2 size={15} /><span>New code file</span></button>
            </div>}
          </div>}
          <label className="global-search"><Search size={16} /><input placeholder="Search files and notes" value={query} onChange={(event) => { setQuery(event.target.value); setRightPanel('search'); }} /><kbd>⌘ K</kbd></label>
          <div className="app-zoom-controls" title="App zoom: Ctrl+= to increase, Ctrl+- to decrease, Ctrl+0 to reset"><button className="icon-button" aria-label="Decrease app size" title="Decrease app size (Ctrl+-)" onClick={() => setAppZoom((value) => Math.max(0.8, Math.round((value - 0.1) * 100) / 100))}><ZoomOut size={15} /></button><span>{Math.round(appZoom * 100)}%</span><button className="icon-button" aria-label="Increase app size" title="Increase app size (Ctrl+=)" onClick={() => setAppZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 100) / 100))}><ZoomIn size={15} /></button><button className="icon-button" aria-label="Reset app size" title="Reset app size (Ctrl+0)" onClick={() => setAppZoom(1)}><span className="zoom-reset-label">100</span></button></div>
          <button className="icon-button theme-toggle" title={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => void toggleTheme()}>{darkTheme ? <Sun size={16} /> : <Moon size={16} />}</button>
          <span className={`save-status ${status === 'Saved locally' ? 'saved' : ''}`}><span className="status-dot" />{status}</span>
          <button className="icon-button" title="Details" onClick={() => setRightPanel((value) => value === 'details' ? null : 'details')}><Settings2 size={17} /></button>
        </div>
      </header>

      <input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }; void handleImport(event.target.files, target.folderId, target.projectId, target.workspaceId); setImportTarget(null); }} />
      <input ref={folderInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }; void handleFolderImport(event.target.files, target); }} />

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}

      {view === 'diagnostics' ? <DiagnosticsDashboard /> : activeTab ? <div className="editor-workspace">
        <div className="tab-strip">
          <div className="tab-list">
            {workspaceTabs.map((tab) => <button key={tab.id} className={`file-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>
              {<FileKindIcon kind={tab.meta.kind} size={15} />}<span className="truncate" title={tab.meta.name}>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}
              <span role="button" tabIndex={0} className="tab-close" aria-label={`Close ${tab.meta.name}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); closeTab(tab.id); } }}><X size={14} /></span>
            </button>)}
          </div>
          <button className="icon-button tab-plus" title="Import a file" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Plus size={16} /></button>
        </div>
        <div className="editor-titlebar">
          <div className="editor-file-title">{<FileKindIcon kind={activeTab.meta.kind} size={16} />}<b title={activeTab.meta.name}>{activeTab.meta.name}</b><span className="title-location" title={`${activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}${activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}`}>{activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}{activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}</span></div>
          <div className="editor-tools">
            {(activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' || activeTab.meta.kind === 'markdown') && <div className="editor-font-controls" title="Editor text size"><button className="icon-button" aria-label="Decrease editor text size" title="Decrease editor text size" onClick={() => setEditorFontSize((value) => Math.max(11, value - 1))}><ZoomOut size={14} /></button><span>{editorFontSize}px</span><button className="icon-button" aria-label="Increase editor text size" title="Increase editor text size" onClick={() => setEditorFontSize((value) => Math.min(24, value + 1))}><ZoomIn size={14} /></button></div>}
            {activeTab.meta.kind === 'markdown' && <button className={`text-button ${activeTab.preview ? 'selected' : ''}`} onClick={() => {
              const preview = !activeTab.preview;
              const editorState = { anchor: activeTab.editorState?.anchor ?? 0, head: activeTab.editorState?.head ?? 0, scrollTop: activeTab.editorState?.scrollTop ?? 0, scrollLeft: activeTab.editorState?.scrollLeft ?? 0, preview };
              setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, preview, editorState } : tab));
              void db.preferences.put({ key: `editor:${activeTab.id}`, value: editorState, updatedAt: Date.now() }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save editor view state.'));
            }}>{activeTab.preview ? 'Edit note' : 'Preview'}</button>}
            {(activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' || activeTab.meta.kind === 'markdown') && <button className="text-button" title="Save changes (Ctrl+S)" disabled={!activeTab.dirty} onClick={() => void persistDraft(activeTab.id, activeTab.draft).catch(() => undefined)}><Save size={14} /> Save</button>}
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
        {activeTab.meta.kind === 'pdf' ? null : activeTab.meta.kind === 'markdown' ? (
          <div className={`note-layout ${activeTab.preview ? 'preview-only' : ''}`}>
            {!activeTab.preview && <div className="code-editor markdown-editor"><CodeMirror value={activeTab.draft} height="100%" theme={editorTheme} extensions={[markdown(), editorSyntax]} onChange={(value) => updateDraft(activeTab.id, value)} onCreateEditor={(view) => restoreEditorViewState(view, activeTab.editorState)} onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) persistEditorViewState(activeTab.id, update.view, activeTab.preview); }} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true }} /></div>}
            <div className="markdown-preview"><div className="preview-label">PREVIEW</div><article className="prose" style={{ fontSize: `${editorFontSize}px` }}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
              code({ className, children, ...props }) {
                const code = String(children).replace(/\n$/, '');
                if (className === 'language-mermaid') return <MermaidDiagram source={code} />;
                return <code className={className} {...props}>{children}</code>;
              }
            }}>{normalizeMarkdownMath(activeTab.draft)}</ReactMarkdown></article></div>
          </div>
        ) : activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' ? (
          <div className="code-editor"><CodeMirror value={activeTab.draft} height="100%" theme={editorTheme} extensions={[activeTab.meta.kind === 'code' ? (['v', 'sv', 'vh', 'svh'].includes(activeTab.meta.name.split('.').pop()?.toLowerCase() ?? '') ? StreamLanguage.define(verilog) : javascript()) : [], editorSyntax]} onChange={(value) => updateDraft(activeTab.id, value)} onCreateEditor={(view) => restoreEditorViewState(view, activeTab.editorState)} onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) persistEditorViewState(activeTab.id, update.view, activeTab.preview); }} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true, closeBrackets: true }} /></div>
        ) : activeTab.meta.kind === 'viewer' ? (
          <Suspense fallback={<div className="loading-state">Loading file viewer…</div>}><ReadOnlyFileViewer fileName={activeTab.meta.name} data={activeTab.data} mimeType={activeTab.meta.mimeType} /></Suspense>
        ) : <div className="unsupported-file"><div className="unsupported-icon"><File size={26} /></div><h2>Preview unavailable</h2><p>This file is saved in your workspace. Download it through a backup or open it in another app.</p><span>{formatSize(activeTab.meta.size)} · {activeTab.meta.mimeType}</span></div>}
        <footer className="editor-footer"><span>{activeTab.meta.kind === 'code' ? 'Code editor' : activeTab.meta.kind === 'text' ? 'Text editor' : activeTab.meta.kind === 'viewer' ? 'Read-only viewer' : activeTab.meta.kind === 'markdown' ? 'Markdown' : activeTab.meta.kind === 'pdf' ? 'PDF document' : 'File'}{activeTab.dirty ? ' · Unsaved changes' : ''}</span><span>{formatSize(activeTab.meta.size)}</span></footer>
      </div> : <div className="workspace-body" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
        {workspaceTabs.length > 0 && <div className="background-tab-strip"><span>OPEN TABS</span>{workspaceTabs.map((tab) => <button key={tab.id} className={`background-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>{<FileKindIcon kind={tab.meta.kind} size={14} />}<span>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}<span className="background-tab-close" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}><X size={12} /></span></button>)}</div>}
        {view === 'workspace' && !activeProject && !selectedFolder && !workspaceHasContent ? <div className="welcome-page">
          <div className="welcome-kicker"><Sparkles size={15} /> LOCAL ENGINEERING WORKSPACE</div>
          <h1>Your work, in one place.</h1>
          <p>Keep technical notes, PDFs and source files organized on this device.</p>
          <div className="welcome-actions"><button className="primary-button large" onClick={() => void createProject()}><Plus size={17} /> Create a project</button><button className="text-button large" onClick={() => startImportInto({ folderId: null, projectId: null, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={16} /> Import files</button></div>
          <div className="feature-grid">
            <button className="feature-card" onClick={() => void createWorkspaceFile('markdown')}><div className="feature-icon note"><BookOpen size={18} /></div><b>Technical notes</b><span>Markdown with math and diagrams</span><Plus size={15} className="feature-plus" /></button>
            <button className="feature-card" onClick={() => void createWorkspaceFile('code')}><div className="feature-icon code"><Code2 size={18} /></div><b>Source files</b><span>Write and save code locally</span><Plus size={15} className="feature-plus" /></button>
            <button className="feature-card" onClick={() => startImportInto({ folderId: null, projectId: null, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><div className="feature-icon pdf"><FileText size={18} /></div><b>Reference PDFs</b><span>Read and search your documents</span><Plus size={15} className="feature-plus" /></button>
          </div>
          <div className="privacy-note"><HardDrive size={15} /> Your files stay in this browser on this device.</div>
        </div> : <div className="file-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
          {view === 'workspace' && !activeProject && !selectedFolder && (activeProjects.length > 0 || generalRootFolders.length > 0) && <section className="workspace-overview">
            <div className="workspace-overview-heading"><div><span>YOUR WORKSPACE</span><h1>Projects and folders</h1><p>Choose a project to open its own files, or browse general workspace files below.</p></div><button className="outline-button" onClick={() => void createProject()}><Plus size={14} /> New project</button></div>
            {activeProjects.length > 0 && <><h2>Projects</h2><div className="overview-card-grid">{activeProjects.map((project) => <button className="overview-card" key={project.id} onClick={() => void switchProject(project.id)}><span className="overview-card-icon project-card-icon"><Layers size={17} /></span><b>{project.name}</b><small>{liveFiles.filter((file) => file.projectId === project.id).length} files · {folders.filter((folder) => folder.projectId === project.id).length} folders</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
            {generalRootFolders.length > 0 && <><h2>General folders</h2><div className="overview-card-grid">{generalRootFolders.map((folder) => <button className="overview-card" key={folder.id} onClick={() => { setSelectedFolder(folder.id); setActiveProject(null); setActiveTabId(null); }}><span className="overview-card-icon folder-card-icon"><Folder size={17} /></span><b>{folder.name}</b><small>General workspace folder</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
          </section>}
          <div className="file-list-scroll">
            {view === 'workspace' && currentFolders.length > 0 && <>
              {selectedFolder && <div className="folder-contents-heading"><Folder size={14} /> Folders</div>}
              {currentFolders.sort((a, b) => a.name.localeCompare(b.name)).map((folder) => <div className="file-list-row folder-list-row" key={folder.id} draggable onContextMenu={(event) => showContextMenu('folder', folder.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: folder.id, type: 'folder' }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.id, folder.projectId, folder.workspaceId)}>
                <button className="file-name-button" onClick={() => { setSelectedFolder(folder.id); setActiveTabId(null); }}><Folder size={17} className="folder-icon" /><span>{folder.name}</span><small>Folder</small></button><span className="kind-cell">Folder</span><span className="size-cell">—</span><span className="date-cell">{new Date(folder.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.id, event)}><Ellipsis size={16} /></button>
              </div>)}
            </>}
            {/* {view === 'workspace' && !activeProject && !selectedFolder && <div className="workspace-files-heading"><span>{visibleFiles.length} file{visibleFiles.length === 1 ? '' : 's'}</span></div>} */}
            <div className="list-header"><button onClick={() => { setSort('name'); setSortDesc(sort === 'name' ? !sortDesc : false); }}>Name <ArrowDownUp size={12} /></button><button onClick={() => { setSort('type'); setSortDesc(sort === 'type' ? !sortDesc : false); }}>Kind <ArrowDownUp size={12} /></button><button onClick={() => { setSort('size'); setSortDesc(sort === 'size' ? !sortDesc : false); }}>Size <ArrowDownUp size={12} /></button><button onClick={() => { setSort('updatedAt'); setSortDesc(sort === 'updatedAt' ? !sortDesc : true); }}>Modified <ArrowDownUp size={12} /></button><span /></div>
            {view === 'trash' ? sortedVisible.length === 0 ? <EmptyState title="Trash is empty" message="Files you delete will appear here until you permanently remove them." icon={<Trash2 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
              <button className="file-name-button" onClick={() => void restoreFile(db, file.id).then(refresh)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>Deleted {new Date(file.deletedAt!).toLocaleDateString()}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Restore" onClick={() => void restoreFile(db, file.id).then(refresh)}><Archive size={15} /></button>
            </div>) : view === 'recent' ? sortedVisible.length === 0 ? <EmptyState title="No recent files" message="Open a file or import one to start building your workspace." icon={<Clock3 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
              <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Move to trash" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>
            </div>) : sortedVisible.length === 0 && currentFolders.length === 0 && !(view === 'workspace' && !activeProject && activeProjects.length > 0) ? <EmptyState title={selectedFolder ? 'This folder is empty' : activeProjectRecord ? 'This project is empty' : 'Workspace is empty'} message="Create a note or file, or drag something in from your computer." icon={<FolderTree size={21} />} action={<><button className="primary-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button><button className="text-button" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={15} /> Import</button></>} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
              <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{file.projectId ? projects.find((project) => project.id === file.projectId)?.name : 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={16} /></button>
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
        {!query.trim() ? <div className="search-placeholder"><Search size={22} /><b>Search your workspace</b><span>Search file names and text in notes or code.</span></div> : searchResults.length === 0 ? <div className="search-placeholder"><Search size={22} /><b>No results found</b><span>Try a different word or phrase.</span></div> : searchResults.map(({ file, text }) => <button className="search-result" key={file.id} onClick={() => void openFile(file)}>
          <span className="search-result-title">{<FileKindIcon kind={file.kind} size={15} />}<b>{file.name}</b></span><span className="search-result-location">{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</span><span className="search-result-snippet">{text.slice(Math.max(0, text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 42), text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) + 100) || file.name}</span>
        </button>)}
        {query.trim() && searchResults.length > 0 && <div className="search-count">{searchResults.length} matching file{searchResults.length === 1 ? '' : 's'}</div>}
      </div>}
    </aside>}

    {contextMenu && <div ref={contextMenuRef} className="item-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
      <div className="context-menu-title">{contextMenu.type === 'file' ? files.find((file) => file.id === contextMenu.id)?.name : contextMenu.type === 'folder' ? folders.find((folder) => folder.id === contextMenu.id)?.name : projects.find((project) => project.id === contextMenu.id)?.name}</div>
      <button onClick={() => void runContextAction('open')}><ExternalLink size={15} /><span>{contextMenu.type === 'file' ? 'Open' : contextMenu.type === 'folder' ? 'Open folder' : 'Switch to workspace'}</span></button>
      <button onClick={() => void runContextAction('rename')}><Pencil size={15} /><span>Rename</span></button>
      {contextMenu.type !== 'project' && <button onClick={() => void runContextAction('move')}><MoveRight size={15} /><span>Move to…</span></button>}
      {contextMenu.type !== 'file' && <button onClick={() => void runContextAction('import')}><Import size={15} /><span>Import files here…</span></button>}
      {contextMenu.type !== 'file' && <button onClick={() => void runContextAction('import-folder')}><FolderPlus size={15} /><span>Import folder here…</span></button>}
      <div className="context-separator" />
      <button className="context-danger" onClick={() => void runContextAction('delete')}><Trash2 size={15} /><span>{contextMenu.type === 'file' ? 'Move to Trash' : contextMenu.type === 'folder' ? 'Delete folder' : 'Delete project'}</span></button>
    </div>}

    {moveDialog && <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setMoveDialog(null); }}>
      <section className="move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-title">
        <div className="move-dialog-header"><div><div className="modal-eyebrow">MOVE ITEM</div><h2 id="move-title">Move “{moveDialog.name}”</h2></div><button className="icon-button" onClick={() => setMoveDialog(null)} aria-label="Close"><X size={17} /></button></div>
        <p className="move-dialog-copy">Choose a workspace, project, or folder as the destination.</p>
        <div className="destination-list">
          {moveDestinations.map((destination) => <button key={destination.key} className="destination-option" onClick={() => void moveItemTo({ folderId: destination.folderId, projectId: destination.projectId, workspaceId: destination.workspaceId })}>
            {destination.folderId ? <Folder size={16} /> : <Layers size={16} />}<span><b>{destination.label}</b><small>{destination.detail}</small></span><ChevronRight size={15} />
          </button>)}
          {moveDestinations.length === 1 && <div className="destination-empty">Create a project or folder to add more destinations.</div>}
        </div>
        <div className="move-dialog-footer"><button className="text-button" onClick={() => setMoveDialog(null)}>Cancel</button></div>
      </section>
    </div>}

    <WorkspaceDialog dialog={dialog} onClose={() => setDialog(null)} onSubmit={() => void submitDialog()} onChange={(value) => setDialog((current) => current ? { ...current, value } : current)} />

    {migrationBackup && <div className="modal-backdrop upgrade-backdrop">
      <section className="move-dialog upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <div className="upgrade-mark"><HardDrive size={21} /></div>
        <div className="modal-eyebrow">SAFE WORKSPACE UPDATE</div>
        <h2 id="upgrade-title">Back up before we continue</h2>
        <p className="move-dialog-copy">This update adds separate workspaces and keeps your theme and PDF reading positions. Before the database changes, a full backup of your files, folders, projects, and settings will download.</p>
        {migrationError && <div className="inline-error">The update did not finish: {migrationError}. Your old database is left in place; you can retry after saving the downloaded backup.</div>}
        <button className="primary-button upgrade-button" disabled={upgrading} onClick={() => void downloadMigrationBackupAndUpgrade()}>{upgrading ? <><span className="spinner" /> Updating…</> : <><Download size={15} /> {isDesktopApp() ? 'Download backup & continue' : 'Download backup (desktop required)'}</>}</button>
      </section>
    </div>}

    {loading && <div className="startup-screen"><div className="brand-mark"><Command size={19} /></div><span>Opening your workspace…</span></div>}
    {importing && <div className="busy-pill"><span className="spinner" /> Importing files…</div>}
  </div></div>;
}

function restoreEditorViewState(view: EditorView, state?: EditorViewState) {
  if (!state) return;
  const length = view.state.doc.length;
  view.dispatch({ selection: { anchor: Math.min(state.anchor, length), head: Math.min(state.head, length) } });
  view.scrollDOM.scrollTop = state.scrollTop;
  view.scrollDOM.scrollLeft = state.scrollLeft;
}

function EmptyState({ title, message, icon, action }: { title: string; message: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{message}</p>{action && <div className="empty-actions">{action}</div>}</div>;
}
)
    .replace(/\\\\\\\\?\\)/g, '
export default function App() {
  useEffect(() => collectFrontendDiagnostics(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const workspace = useWorkspace(setError, setLoading);
  const { files, folders, projects, workspaces, setWorkspaces, activeWorkspaceId, setActiveWorkspaceId, refresh } = workspace;
  const [migrationBackup, setMigrationBackup] = useState<number | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [view, setView] = useState<View>('workspace');
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { tabs, setTabs, activeTabId, setActiveTabId, restoreWorkspaceTabs, flushWorkspaceSession } = useWorkspaceTabs(activeWorkspaceId, loading, setError);
  const [query, setQuery] = useState('');
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
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useWorkspaceInitialization({
    refresh, setMigrationBackup, setLoading, setError, setAppZoom, setEditorFontSize,
    setPreferencesReady: setUiPreferencesReady, setDarkTheme, setWorkspaces, setActiveWorkspaceId,
    restoreTabs: restoreWorkspaceTabs,
  });
  useGlobalShortcuts(setAppZoom);

  // Fixed near-black editor theme inspired by the supplied reference.
  const editorTheme = useMemo(() => EditorView.theme({
    '&': { height: '100%', backgroundColor: '#111111', color: '#e6e6e6' },
    '.cm-scroller': { fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace", lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { caretColor: '#f2f2f2', fontSize: `${editorFontSize}px` },
    '.cm-line': { padding: '0 4px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#f2f2f2' },
    '.cm-gutters': { backgroundColor: '#111111', color: '#777777', border: 'none', borderRight: '1px solid #242424', fontSize: `${editorFontSize}px` },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '3.5em', padding: '0 12px 0 10px' },
    '.cm-activeLine': { backgroundColor: '#191919' },
    '.cm-activeLineGutter': { backgroundColor: '#191919', color: '#d8d8d8' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#343b4a' },
    '.cm-selectionMatch': { backgroundColor: '#292f3a' },
    '.cm-focused .cm-matchingBracket': { backgroundColor: '#292f3a', outline: '1px solid #59677f' },
    '.cm-searchMatch': { backgroundColor: '#51421f', outline: '1px solid #8a7134' },
    '.cm-searchMatch-selected': { backgroundColor: '#6a5526' },
    '.cm-tooltip': { backgroundColor: '#1b1b1b', color: '#e6e6e6', border: '1px solid #383838' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#30343d', color: '#ffffff' },
    '.cm-foldPlaceholder': { backgroundColor: '#292929', color: '#c7c7c7', border: 'none' },
  }, { dark: true }), [editorFontSize]);
  const editorSyntax = useMemo(() => syntaxHighlighting(HighlightStyle.define([
    { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
    { tag: tags.keyword, color: '#c586c0' },
    { tag: [tags.typeName, tags.className], color: '#4ec9b0' },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: '#dcdcaa' },
    { tag: [tags.string, tags.regexp, tags.special(tags.string)], color: '#ce9178' },
    { tag: [tags.number, tags.bool, tags.null], color: '#b5cea8' },
    { tag: tags.operator, color: '#d4d4d4' },
  ])), []);

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
  const persistEditorViewState = useCallback((id: string, view: EditorView, preview: boolean) => {
    const selection = view.state.selection.main;
    const state: EditorViewState = {
      anchor: selection.anchor,
      head: selection.head,
      scrollTop: view.scrollDOM.scrollTop,
      scrollLeft: view.scrollDOM.scrollLeft,
      preview,
    };
    void db.preferences.put({ key: `editor:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save editor position.');
    });
  }, [setError]);

  const updatePdfView = useCallback((id: string, state: PdfViewState) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, pdfState: state } : tab));
    void db.preferences.put({ key: `pdf:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save this PDF reading position.');
    });
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.global-search input')?.focus();
      }
      if (event.key === 'Escape') document.querySelector<HTMLInputElement>('.global-search input')?.blur();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  useEffect(() => { if (!activeTabId) setFocusMode(false); }, [activeTabId]);
  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!workspaceMenuRef.current?.contains(target)) setWorkspaceMenuOpen(false);
      if (!importMenuRef.current?.contains(target)) setImportMenuOpen(false);
      if (!contextMenuRef.current?.contains(target)) setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenus);
    return () => window.removeEventListener('pointerdown', closeMenus);
  }, []);

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

  const tree = useMemo(() => buildWorkspaceTree(folders, liveFiles, null, activeProject, activeWorkspaceId), [folders, liveFiles, activeProject, activeWorkspaceId]);
  const excludedMoveFolders = useMemo(() => {
    const ids = new Set<string>();
    if (moveDialog?.type !== 'folder') return ids;
    ids.add(moveDialog.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) if (folder.parentFolderId && ids.has(folder.parentFolderId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
    }
    return ids;
  }, [folders, moveDialog]);
  const moveDestinations = useMemo(() => [
    ...workspaces.map((workspace) => ({ key: `workspace-${workspace.id}`, label: workspace.name, detail: 'Workspace root', folderId: null, projectId: null, workspaceId: workspace.id })),
    ...projects.filter((project) => !project.archived).map((project) => ({ key: `project-${project.id}`, label: project.name, detail: `${workspaces.find((workspace) => workspace.id === project.workspaceId)?.name ?? 'Workspace'} · Project`, folderId: null, projectId: project.id, workspaceId: project.workspaceId })),
    ...folders.filter((folder) => !excludedMoveFolders.has(folder.id) && (folder.projectId === null || projects.some((project) => project.id === folder.projectId && !project.archived))).map((folder) => ({
      key: `folder-${folder.id}`,
      label: folder.name,
      detail: `${workspaces.find((workspace) => workspace.id === folder.workspaceId)?.name ?? 'Workspace'} · ${projects.find((project) => project.id === folder.projectId)?.name ?? 'General'} · Folder`,
      folderId: folder.id,
      projectId: folder.projectId,
      workspaceId: folder.workspaceId,
    })),
  ], [excludedMoveFolders, folders, projects, workspaces]);

  const searchResults = useWorkspaceSearch(liveFiles, query, setError);

  const openFile = useCallback(async (fileMeta: FileMeta) => {
    // Reclassify on open so legacy HDL records cannot remain editable.
    const meta: FileMeta = { ...fileMeta, kind: kindForFile(fileMeta.name, fileMeta.mimeType) };
    let restoredTabs: Tab[] = [];
    if (meta.workspaceId !== activeWorkspaceId) {
      if (activeWorkspaceId) {
        await saveWorkspaceSession(db, activeWorkspaceId, tabs.filter((tab) => tab.meta.workspaceId === activeWorkspaceId).map((tab) => tab.id), activeTabId);
      }
      await workspace.switchWorkspace(meta.workspaceId);
      const restored = await restoreWorkspaceTabs(meta.workspaceId);
      restoredTabs = restored.tabs;
      setActiveProject(meta.projectId);
      setSelectedFolder(meta.parentFolderId);
      setView('workspace');
    }
    const existing = tabs.find((tab) => tab.id === meta.id) ?? restoredTabs.find((tab) => tab.id === meta.id);
    const persistOpenTabSession = async () => {
      const currentWorkspaceTabs = (meta.workspaceId === activeWorkspaceId ? tabs : restoredTabs)
        .filter((tab) => tab.meta.workspaceId === meta.workspaceId);
      const openFileIds = [...new Set([...currentWorkspaceTabs.map((tab) => tab.id), meta.id])];
      try {
        // Commit the session before publishing the tab in React state. A page reload
        // immediately after the tab appears must not race the debounced session effect.
        await saveWorkspaceSession(db, meta.workspaceId, openFileIds, meta.id);
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not save the open-tab session.');
        return false;
      }
    };
    if (existing) {
      let hydrated: Tab;
      try {
        hydrated = existing.hydrated !== true ? await hydrateWorkspaceTab(db, existing) : existing;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : `Could not open “${meta.name}”.`);
        return;
      }
      if (hydrated.dirty) trackRecoveredDraft(meta.id, hydrated.draft);
      if (!(await persistOpenTabSession())) return;
      setTabs((current) => current.map((tab) => {
        if (tab.id === meta.id) return hydrated;
        if (!(tab.data instanceof Blob)) return tab;
        const { data: _released, ...withoutPdfData } = tab;
        return { ...withoutPdfData, hydrated: false };
      }));
      setActiveTabId(meta.id);
      setError('');
      return;
    }
    let newTab: Tab;
    try {
      newTab = await hydrateWorkspaceTab(db, {
        id: meta.id,
        meta,
        draft: '',
        dirty: false,
        preview: meta.kind === 'markdown',
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not open “${meta.name}”.`);
      return;
    }
    if (newTab.dirty) trackRecoveredDraft(meta.id, newTab.draft);
    if (!(await persistOpenTabSession())) return;
    setTabs((current) => [
      ...current.map((tab) => {
        if (!(tab.data instanceof Blob)) return tab;
        const { data: _released, ...withoutPdfData } = tab;
        return { ...withoutPdfData, hydrated: false };
      }),
      newTab,
    ]);
    setActiveTabId(meta.id);
    if (newTab.dirty) setStatus('Recovered an unsaved draft · Save to keep these changes');
    setError('');
  }, [activeWorkspaceId, restoreWorkspaceTabs, tabs, trackRecoveredDraft, workspace.switchWorkspace]);

  useEffect(() => {
    if (!activeTab || activeTab.hydrated === true || loading) return;
    void openFile(activeTab.meta).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : `Could not restore “${activeTab.meta.name}”.`);
    });
  }, [activeTab, loading, openFile]);

  function createProject() {
    requestInput('Create project', '', 'Project name', 'Create project', async (name) => {
      const now = Date.now();
      const project: Project = { id: crypto.randomUUID(), workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID, name: name.trim(), archived: false, createdAt: now, updatedAt: now };
      await db.projects.add(project);
      await refresh();
      setActiveProject(project.id); setSelectedFolder(null); setActiveTabId(null); setView('workspace');
    });
  }

  function createFolderInCurrent() {
    requestInput('Create folder', '', 'Folder name', 'Create folder', async (name) => {
      const folder = await createFolder(db, name.trim(), selectedFolder, activeProject, activeWorkspaceId ?? DEFAULT_WORKSPACE_ID);
      setExpanded((current) => new Set(current).add(folder.id));
      await refresh();
    });
  }

  function createNewFile(kind: 'markdown' | 'code') {
    const initial = kind === 'markdown' ? 'Untitled note.md' : 'Untitled.ts';
    requestInput(kind === 'markdown' ? 'Create note' : 'Create code file', initial, 'File name', 'Create file', async (name) => {
      const text = kind === 'markdown' ? `# ${name.replace(/\.(md|markdown)$/i, '')}\n\n` : '';
      const meta = await createTextFile(db, name.trim(), text, { parentFolderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID, kind });
      await refresh();
      await openFile(meta);
    });
  }

  async function handleImport(fileList: FileList | null, destinationFolderId = selectedFolder, destinationProjectId = activeProject, destinationWorkspaceId = activeWorkspaceId ?? DEFAULT_WORKSPACE_ID) {
    if (!fileList?.length) return;
    setImporting(true);
    try {
      for (const file of Array.from(fileList)) {
        const meta = await importFile(db, file, { parentFolderId: destinationFolderId, projectId: destinationProjectId, workspaceId: destinationWorkspaceId });
        if (['pdf', 'markdown', 'code', 'text', 'viewer'].includes(meta.kind)) await openFile(meta);
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
        if (['pdf', 'markdown', 'code', 'text', 'viewer'].includes(meta.kind)) await openFile(meta);
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
      await emptyTrash(db, activeWorkspaceId ?? DEFAULT_WORKSPACE_ID);
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

  function toggleFolder(id: string) {
    setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function handleDrop(event: DragEvent, folderId: string | null, destinationProjectId = activeProject, destinationWorkspaceId = activeWorkspaceId ?? DEFAULT_WORKSPACE_ID) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files.length > 0) {
      void handleImport(event.dataTransfer.files, folderId, destinationProjectId, destinationWorkspaceId);
      return;
    }
    const payload = event.dataTransfer.getData('application/x-workbench-item');
    if (!payload) return;
    const { id, type } = JSON.parse(payload) as { id: string; type: 'file' | 'folder' };
    void (async () => {
      try {
        if (type === 'file') await moveFile(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        else await moveFolder(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        await refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not move this item.'); }
    })();
  }

  function renderFolder(folder: WorkspaceTreeFolder, depth = 0) {
    const isOpen = expanded.has(folder.record.id);
    const selected = selectedFolder === folder.record.id;
    return <div key={folder.record.id}>
      <div className={`tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: `${12 + depth * 16}px` }} draggable onContextMenu={(event) => showContextMenu('folder', folder.record.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: folder.record.id, type: 'folder' }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.record.id, folder.record.projectId, folder.record.workspaceId)}>
        <button className="tree-main" onClick={() => { setSelectedFolder(folder.record.id); setActiveProject(folder.record.projectId); setView('workspace'); setActiveTabId(null); }} onDoubleClick={() => toggleFolder(folder.record.id)}>
          <span className="twisty" onClick={(event) => { event.stopPropagation(); toggleFolder(folder.record.id); }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          {isOpen ? <Folder size={16} className="folder-icon open" /> : <Folder size={16} className="folder-icon" />}
          <span className="truncate" title={folder.record.name}>{folder.record.name}</span>
        </button>
        <button className="mini-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.record.id, event)}><Ellipsis size={15} /></button>
      </div>
      {isOpen && <>
        {folder.children.map((child) => renderFolder(child, depth + 1))}
        {folder.files.sort((a, b) => a.name.localeCompare(b.name)).map((file) => renderFileTree(file, depth + 1))}
      </>}
    </div>;
  }

  function renderFileTree(file: FileMeta, depth = 0) {
    return <div key={file.id} className={`tree-row file-row ${activeTabId === file.id ? 'selected' : ''}`} style={{ paddingLeft: `${31 + depth * 16}px` }} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
      <button className="tree-main" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={15} />}<span className="truncate" title={file.name}>{file.name}</span></button>
      <button className="mini-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={15} /></button>
    </div>;
  }

  function renderProjectTree(project: Project) {
    const open = activeProject === project.id;
    const projectTree = buildWorkspaceTree(folders, liveFiles, null, project.id, project.workspaceId);
    const filesAtRoot = liveFiles.filter((file) => file.projectId === project.id && file.parentFolderId === null);
    return <div key={project.id}>
      <div className={`tree-row project-row ${open ? 'selected' : ''}`} onContextMenu={(event) => showContextMenu('project', project.id, event)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, null, project.id, project.workspaceId)}>
        <button className="tree-main" onClick={() => { setActiveProject(project.id); setSelectedFolder(null); setView('workspace'); setActiveTabId(null); }}>
          <span className="twisty">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <span className="project-dot" />
          <span className="truncate" title={project.name}>{project.name}</span>
        </button>
        <button className="mini-action" title="Project actions" onClick={(event) => showContextMenu('project', project.id, event)}><Ellipsis size={15} /></button>
      </div>
      {open && <div className="project-children" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, null, project.id, project.workspaceId)}>
        {projectTree.map((folder) => renderFolder(folder))}
        {filesAtRoot.map((file) => renderFileTree(file))}
        {projectTree.length === 0 && filesAtRoot.length === 0 && <button className="tree-empty" onClick={() => void createNewFile('markdown')}>Nothing here yet <span>+ add a note</span></button>}
      </div>}
    </div>;
  }

  async function createWorkspaceFile(kind: 'markdown' | 'code') {
    if (view !== 'workspace') setView('workspace');
    await createNewFile(kind);
  }

  const visibleFiles = view === 'trash' ? trashedFiles : view === 'recent'
    ? [...liveFiles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40)
    : view === 'workspace' && !activeProject && !selectedFolder
      ? liveFiles
      : liveFiles.filter((file) => file.workspaceId === activeWorkspaceId && file.projectId === activeProject && file.parentFolderId === selectedFolder);
  const sortedVisible = view === 'recent' || view === 'trash' ? [...visibleFiles] : [...visibleFiles].sort((a, b) => {
    const order = sort === 'type' ? a.kind.localeCompare(b.kind) : sort === 'size' ? a.size - b.size : sort === 'updatedAt' ? a.updatedAt - b.updatedAt : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sortDesc ? -order : order;
  });

  return <div className="app-viewport" data-theme={darkTheme ? 'dark' : 'light'}><div className={`app-shell ${focusMode ? 'focus-mode' : ''}`} data-theme={darkTheme ? 'dark' : 'light'} style={{ transform: `scale(${appZoom})`, width: `calc(100% / ${appZoom})`, height: `calc(100% / ${appZoom})` }}>
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Command size={19} strokeWidth={2.2} /></div>
        {!sidebarCollapsed && <div className="brand-copy"><b>Workbench</b><span>Engineering workspace</span></div>}
        <button className="icon-button sidebar-toggle" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
      </div>

      {!sidebarCollapsed && <>
        <div className="sidebar-primary">
          <button className={`nav-item ${view === 'workspace' && activeProject === null ? 'active' : ''}`} onClick={() => { setView('workspace'); setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }}><LayoutGrid size={16} /> Workspace</button>
          <button className={`nav-item ${view === 'recent' ? 'active' : ''}`} onClick={() => { setView('recent'); setActiveTabId(null); }}><Clock3 size={16} /> Recent <span className="nav-count">{liveFiles.length}</span></button>
          <button className={`nav-item ${view === 'trash' ? 'active' : ''}`} onClick={() => { setView('trash'); setActiveTabId(null); }}><Trash2 size={16} /> Trash {trashedFiles.length > 0 && <span className="nav-count">{trashedFiles.length}</span>}</button>
          <button className={`nav-item ${view === 'diagnostics' ? 'active' : ''}`} onClick={() => { setView('diagnostics'); setActiveTabId(null); }}><Activity size={16} /> Diagnostics</button>
        </div>
        <div className="sidebar-section-heading"><span>PROJECTS</span><button title="New project" onClick={() => void createProject()}><Plus size={15} /></button></div>
        <div className="project-tree">
          {(buildWorkspaceTree(folders, liveFiles, null, null, activeWorkspaceId).length > 0 || liveFiles.some((file) => file.workspaceId === activeWorkspaceId && file.projectId === null && file.parentFolderId === null)) && <div className="sidebar-section-heading workspace-tree-heading"><span>WORKSPACE FILES</span></div>}
          {buildWorkspaceTree(folders, liveFiles, null, null, activeWorkspaceId).map((folder) => renderFolder(folder))}
          {liveFiles.filter((file) => file.workspaceId === activeWorkspaceId && file.projectId === null && file.parentFolderId === null).map((file) => renderFileTree(file))}
          {projects.filter((project) => !project.archived && project.workspaceId === activeWorkspaceId).map(renderProjectTree)}
          {projects.filter((project) => !project.archived && project.workspaceId === activeWorkspaceId).length === 0 && <div className="sidebar-empty">Your projects<br /><span>show up here</span></div>}
          {projects.some((project) => project.archived && project.workspaceId === activeWorkspaceId) && <>
            <div className="sidebar-section-heading archived-heading"><span>ARCHIVED</span></div>
            {projects.filter((project) => project.archived && project.workspaceId === activeWorkspaceId).map(renderProjectTree)}
          </>}
        </div>
        <div className="sidebar-bottom">
          <div className="system-monitor" aria-label="System utilisation">
            <div className="system-monitor-heading"><Activity size={13} /><span>System</span><span className="system-monitor-live">LIVE</span></div>
            {[
              { label: 'CPU', value: systemStats.cpu },
              { label: 'RAM', value: systemStats.ram },
              { label: 'GPU', value: systemStats.gpu },
            ].map(({ label, value }) => (
              <div className="system-metric" key={label} title={value == null ? `${label} utilisation unavailable` : `${label} utilisation ${Math.round(value)}%`}>
                <span className="system-metric-label">{label}</span>
                <div className="system-metric-track" role="meter" aria-label={`${label} utilisation`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
                  <i style={{ width: `${value == null ? 0 : Math.min(100, Math.max(0, value))}%` }} />
                </div>
                <span className="system-metric-value">{value == null ? '—' : `${Math.round(value)}%`}</span>
              </div>
            ))}
            <div className="system-storage">
              <div className="storage-line"><HardDrive size={14} /><span>Stored on this device</span></div>
              <div className="storage-meter"><i style={{ width: `${Math.min(100, storedBytes / (250 * 1024 * 1024) * 100)}%` }} /></div>
              <span className="storage-caption">{formatSize(storedBytes)} used</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button onClick={() => void backup.saveWorkspaceBackup()} title="Save a workspace backup"><Download size={15} /> Backup</button>
            <button onClick={() => void backup.restoreFromPicker(backupInput.current)} title="Restore from backup"><Import size={15} /> Restore</button>
          </div>
          <input ref={backupInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void backup.openBackup(event.target.files?.[0], event.currentTarget)} />
        </div>
      </>}
      {sidebarCollapsed && <div className="collapsed-nav"><button title="Workspace" onClick={() => { setView('workspace'); setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }}><LayoutGrid size={18} /></button><button title="Recent" onClick={() => { setView('recent'); setActiveTabId(null); }}><Clock3 size={18} /></button><button title="Trash" onClick={() => { setView('trash'); setActiveTabId(null); }}><Trash2 size={18} /></button><button title="Diagnostics" onClick={() => { setView('diagnostics'); setActiveTabId(null); }}><Activity size={18} /></button><button title="New project" onClick={() => void createProject()}><Plus size={18} /></button></div>}
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="workspace-switcher" ref={workspaceMenuRef}>
          <button className="workspace-switch-button" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((open) => !open)}>
            <Layers size={16} /><span>{view === 'trash' ? 'Trash' : view === 'recent' ? 'Recent files' : view === 'diagnostics' ? 'Diagnostics' : activeWorkspace?.name ?? 'Workspace'}{activeProjectRecord ? ` / ${activeProjectRecord.name}` : ''}</span>
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
              <button onClick={() => { setImportMenuOpen(false); startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }); }}><FileText size={15} /><span>Import files</span></button>
              <button onClick={() => { setImportMenuOpen(false); startImportFolderInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }); }}><FolderPlus size={15} /><span>Import folder</span></button>
              <div className="switch-menu-separator" />
              <button onClick={() => { setImportMenuOpen(false); void createFolderInCurrent(); }}><FolderPlus size={15} /><span>New folder</span></button>
              <button onClick={() => { setImportMenuOpen(false); void createWorkspaceFile('markdown'); }}><FilePlus2 size={15} /><span>New note</span></button>
              <button onClick={() => { setImportMenuOpen(false); void createWorkspaceFile('code'); }}><Code2 size={15} /><span>New code file</span></button>
            </div>}
          </div>}
          <label className="global-search"><Search size={16} /><input placeholder="Search files and notes" value={query} onChange={(event) => { setQuery(event.target.value); setRightPanel('search'); }} /><kbd>⌘ K</kbd></label>
          <div className="app-zoom-controls" title="App zoom: Ctrl+= to increase, Ctrl+- to decrease, Ctrl+0 to reset"><button className="icon-button" aria-label="Decrease app size" title="Decrease app size (Ctrl+-)" onClick={() => setAppZoom((value) => Math.max(0.8, Math.round((value - 0.1) * 100) / 100))}><ZoomOut size={15} /></button><span>{Math.round(appZoom * 100)}%</span><button className="icon-button" aria-label="Increase app size" title="Increase app size (Ctrl+=)" onClick={() => setAppZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 100) / 100))}><ZoomIn size={15} /></button><button className="icon-button" aria-label="Reset app size" title="Reset app size (Ctrl+0)" onClick={() => setAppZoom(1)}><span className="zoom-reset-label">100</span></button></div>
          <button className="icon-button theme-toggle" title={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => void toggleTheme()}>{darkTheme ? <Sun size={16} /> : <Moon size={16} />}</button>
          <span className={`save-status ${status === 'Saved locally' ? 'saved' : ''}`}><span className="status-dot" />{status}</span>
          <button className="icon-button" title="Details" onClick={() => setRightPanel((value) => value === 'details' ? null : 'details')}><Settings2 size={17} /></button>
        </div>
      </header>

      <input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }; void handleImport(event.target.files, target.folderId, target.projectId, target.workspaceId); setImportTarget(null); }} />
      <input ref={folderInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }; void handleFolderImport(event.target.files, target); }} />

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}

      {view === 'diagnostics' ? <DiagnosticsDashboard /> : activeTab ? <div className="editor-workspace">
        <div className="tab-strip">
          <div className="tab-list">
            {workspaceTabs.map((tab) => <button key={tab.id} className={`file-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>
              {<FileKindIcon kind={tab.meta.kind} size={15} />}<span className="truncate" title={tab.meta.name}>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}
              <span role="button" tabIndex={0} className="tab-close" aria-label={`Close ${tab.meta.name}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); closeTab(tab.id); } }}><X size={14} /></span>
            </button>)}
          </div>
          <button className="icon-button tab-plus" title="Import a file" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Plus size={16} /></button>
        </div>
        <div className="editor-titlebar">
          <div className="editor-file-title">{<FileKindIcon kind={activeTab.meta.kind} size={16} />}<b title={activeTab.meta.name}>{activeTab.meta.name}</b><span className="title-location" title={`${activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}${activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}`}>{activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}{activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}</span></div>
          <div className="editor-tools">
            {(activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' || activeTab.meta.kind === 'markdown') && <div className="editor-font-controls" title="Editor text size"><button className="icon-button" aria-label="Decrease editor text size" title="Decrease editor text size" onClick={() => setEditorFontSize((value) => Math.max(11, value - 1))}><ZoomOut size={14} /></button><span>{editorFontSize}px</span><button className="icon-button" aria-label="Increase editor text size" title="Increase editor text size" onClick={() => setEditorFontSize((value) => Math.min(24, value + 1))}><ZoomIn size={14} /></button></div>}
            {activeTab.meta.kind === 'markdown' && <button className={`text-button ${activeTab.preview ? 'selected' : ''}`} onClick={() => {
              const preview = !activeTab.preview;
              const editorState = { anchor: activeTab.editorState?.anchor ?? 0, head: activeTab.editorState?.head ?? 0, scrollTop: activeTab.editorState?.scrollTop ?? 0, scrollLeft: activeTab.editorState?.scrollLeft ?? 0, preview };
              setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, preview, editorState } : tab));
              void db.preferences.put({ key: `editor:${activeTab.id}`, value: editorState, updatedAt: Date.now() }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save editor view state.'));
            }}>{activeTab.preview ? 'Edit note' : 'Preview'}</button>}
            {(activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' || activeTab.meta.kind === 'markdown') && <button className="text-button" title="Save changes (Ctrl+S)" disabled={!activeTab.dirty} onClick={() => void persistDraft(activeTab.id, activeTab.draft).catch(() => undefined)}><Save size={14} /> Save</button>}
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
        {activeTab.meta.kind === 'pdf' ? null : activeTab.meta.kind === 'markdown' ? (
          <div className={`note-layout ${activeTab.preview ? 'preview-only' : ''}`}>
            {!activeTab.preview && <div className="code-editor markdown-editor"><CodeMirror value={activeTab.draft} height="100%" theme={editorTheme} extensions={[markdown(), editorSyntax]} onChange={(value) => updateDraft(activeTab.id, value)} onCreateEditor={(view) => restoreEditorViewState(view, activeTab.editorState)} onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) persistEditorViewState(activeTab.id, update.view, activeTab.preview); }} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true }} /></div>}
            <div className="markdown-preview"><div className="preview-label">PREVIEW</div><article className="prose" style={{ fontSize: `${editorFontSize}px` }}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
              code({ className, children, ...props }) {
                const code = String(children).replace(/\n$/, '');
                if (className === 'language-mermaid') return <MermaidDiagram source={code} />;
                return <code className={className} {...props}>{children}</code>;
              }
            }}>{activeTab.draft}</ReactMarkdown></article></div>
          </div>
        ) : activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' ? (
          <div className="code-editor"><CodeMirror value={activeTab.draft} height="100%" theme={editorTheme} extensions={[activeTab.meta.kind === 'code' ? (['v', 'sv', 'vh', 'svh'].includes(activeTab.meta.name.split('.').pop()?.toLowerCase() ?? '') ? StreamLanguage.define(verilog) : javascript()) : [], editorSyntax]} onChange={(value) => updateDraft(activeTab.id, value)} onCreateEditor={(view) => restoreEditorViewState(view, activeTab.editorState)} onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) persistEditorViewState(activeTab.id, update.view, activeTab.preview); }} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true, closeBrackets: true }} /></div>
        ) : activeTab.meta.kind === 'viewer' ? (
          <Suspense fallback={<div className="loading-state">Loading file viewer…</div>}><ReadOnlyFileViewer fileName={activeTab.meta.name} data={activeTab.data} mimeType={activeTab.meta.mimeType} /></Suspense>
        ) : <div className="unsupported-file"><div className="unsupported-icon"><File size={26} /></div><h2>Preview unavailable</h2><p>This file is saved in your workspace. Download it through a backup or open it in another app.</p><span>{formatSize(activeTab.meta.size)} · {activeTab.meta.mimeType}</span></div>}
        <footer className="editor-footer"><span>{activeTab.meta.kind === 'code' ? 'Code editor' : activeTab.meta.kind === 'text' ? 'Text editor' : activeTab.meta.kind === 'viewer' ? 'Read-only viewer' : activeTab.meta.kind === 'markdown' ? 'Markdown' : activeTab.meta.kind === 'pdf' ? 'PDF document' : 'File'}{activeTab.dirty ? ' · Unsaved changes' : ''}</span><span>{formatSize(activeTab.meta.size)}</span></footer>
      </div> : <div className="workspace-body" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
        {workspaceTabs.length > 0 && <div className="background-tab-strip"><span>OPEN TABS</span>{workspaceTabs.map((tab) => <button key={tab.id} className={`background-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>{<FileKindIcon kind={tab.meta.kind} size={14} />}<span>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}<span className="background-tab-close" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}><X size={12} /></span></button>)}</div>}
        {view === 'workspace' && !activeProject && !selectedFolder && !workspaceHasContent ? <div className="welcome-page">
          <div className="welcome-kicker"><Sparkles size={15} /> LOCAL ENGINEERING WORKSPACE</div>
          <h1>Your work, in one place.</h1>
          <p>Keep technical notes, PDFs and source files organized on this device.</p>
          <div className="welcome-actions"><button className="primary-button large" onClick={() => void createProject()}><Plus size={17} /> Create a project</button><button className="text-button large" onClick={() => startImportInto({ folderId: null, projectId: null, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={16} /> Import files</button></div>
          <div className="feature-grid">
            <button className="feature-card" onClick={() => void createWorkspaceFile('markdown')}><div className="feature-icon note"><BookOpen size={18} /></div><b>Technical notes</b><span>Markdown with math and diagrams</span><Plus size={15} className="feature-plus" /></button>
            <button className="feature-card" onClick={() => void createWorkspaceFile('code')}><div className="feature-icon code"><Code2 size={18} /></div><b>Source files</b><span>Write and save code locally</span><Plus size={15} className="feature-plus" /></button>
            <button className="feature-card" onClick={() => startImportInto({ folderId: null, projectId: null, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><div className="feature-icon pdf"><FileText size={18} /></div><b>Reference PDFs</b><span>Read and search your documents</span><Plus size={15} className="feature-plus" /></button>
          </div>
          <div className="privacy-note"><HardDrive size={15} /> Your files stay in this browser on this device.</div>
        </div> : <div className="file-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
          {view === 'workspace' && !activeProject && !selectedFolder && (activeProjects.length > 0 || generalRootFolders.length > 0) && <section className="workspace-overview">
            <div className="workspace-overview-heading"><div><span>YOUR WORKSPACE</span><h1>Projects and folders</h1><p>Choose a project to open its own files, or browse general workspace files below.</p></div><button className="outline-button" onClick={() => void createProject()}><Plus size={14} /> New project</button></div>
            {activeProjects.length > 0 && <><h2>Projects</h2><div className="overview-card-grid">{activeProjects.map((project) => <button className="overview-card" key={project.id} onClick={() => void switchProject(project.id)}><span className="overview-card-icon project-card-icon"><Layers size={17} /></span><b>{project.name}</b><small>{liveFiles.filter((file) => file.projectId === project.id).length} files · {folders.filter((folder) => folder.projectId === project.id).length} folders</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
            {generalRootFolders.length > 0 && <><h2>General folders</h2><div className="overview-card-grid">{generalRootFolders.map((folder) => <button className="overview-card" key={folder.id} onClick={() => { setSelectedFolder(folder.id); setActiveProject(null); setActiveTabId(null); }}><span className="overview-card-icon folder-card-icon"><Folder size={17} /></span><b>{folder.name}</b><small>General workspace folder</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
          </section>}
          <div className="file-list-scroll">
            {view === 'workspace' && currentFolders.length > 0 && <>
              {selectedFolder && <div className="folder-contents-heading"><Folder size={14} /> Folders</div>}
              {currentFolders.sort((a, b) => a.name.localeCompare(b.name)).map((folder) => <div className="file-list-row folder-list-row" key={folder.id} draggable onContextMenu={(event) => showContextMenu('folder', folder.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: folder.id, type: 'folder' }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.id, folder.projectId, folder.workspaceId)}>
                <button className="file-name-button" onClick={() => { setSelectedFolder(folder.id); setActiveTabId(null); }}><Folder size={17} className="folder-icon" /><span>{folder.name}</span><small>Folder</small></button><span className="kind-cell">Folder</span><span className="size-cell">—</span><span className="date-cell">{new Date(folder.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.id, event)}><Ellipsis size={16} /></button>
              </div>)}
            </>}
            {/* {view === 'workspace' && !activeProject && !selectedFolder && <div className="workspace-files-heading"><span>{visibleFiles.length} file{visibleFiles.length === 1 ? '' : 's'}</span></div>} */}
            <div className="list-header"><button onClick={() => { setSort('name'); setSortDesc(sort === 'name' ? !sortDesc : false); }}>Name <ArrowDownUp size={12} /></button><button onClick={() => { setSort('type'); setSortDesc(sort === 'type' ? !sortDesc : false); }}>Kind <ArrowDownUp size={12} /></button><button onClick={() => { setSort('size'); setSortDesc(sort === 'size' ? !sortDesc : false); }}>Size <ArrowDownUp size={12} /></button><button onClick={() => { setSort('updatedAt'); setSortDesc(sort === 'updatedAt' ? !sortDesc : true); }}>Modified <ArrowDownUp size={12} /></button><span /></div>
            {view === 'trash' ? sortedVisible.length === 0 ? <EmptyState title="Trash is empty" message="Files you delete will appear here until you permanently remove them." icon={<Trash2 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
              <button className="file-name-button" onClick={() => void restoreFile(db, file.id).then(refresh)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>Deleted {new Date(file.deletedAt!).toLocaleDateString()}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Restore" onClick={() => void restoreFile(db, file.id).then(refresh)}><Archive size={15} /></button>
            </div>) : view === 'recent' ? sortedVisible.length === 0 ? <EmptyState title="No recent files" message="Open a file or import one to start building your workspace." icon={<Clock3 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
              <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Move to trash" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>
            </div>) : sortedVisible.length === 0 && currentFolders.length === 0 && !(view === 'workspace' && !activeProject && activeProjects.length > 0) ? <EmptyState title={selectedFolder ? 'This folder is empty' : activeProjectRecord ? 'This project is empty' : 'Workspace is empty'} message="Create a note or file, or drag something in from your computer." icon={<FolderTree size={21} />} action={<><button className="primary-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button><button className="text-button" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={15} /> Import</button></>} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
              <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{file.projectId ? projects.find((project) => project.id === file.projectId)?.name : 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={16} /></button>
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
        {!query.trim() ? <div className="search-placeholder"><Search size={22} /><b>Search your workspace</b><span>Search file names and text in notes or code.</span></div> : searchResults.length === 0 ? <div className="search-placeholder"><Search size={22} /><b>No results found</b><span>Try a different word or phrase.</span></div> : searchResults.map(({ file, text }) => <button className="search-result" key={file.id} onClick={() => void openFile(file)}>
          <span className="search-result-title">{<FileKindIcon kind={file.kind} size={15} />}<b>{file.name}</b></span><span className="search-result-location">{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</span><span className="search-result-snippet">{text.slice(Math.max(0, text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 42), text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) + 100) || file.name}</span>
        </button>)}
        {query.trim() && searchResults.length > 0 && <div className="search-count">{searchResults.length} matching file{searchResults.length === 1 ? '' : 's'}</div>}
      </div>}
    </aside>}

    {contextMenu && <div ref={contextMenuRef} className="item-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
      <div className="context-menu-title">{contextMenu.type === 'file' ? files.find((file) => file.id === contextMenu.id)?.name : contextMenu.type === 'folder' ? folders.find((folder) => folder.id === contextMenu.id)?.name : projects.find((project) => project.id === contextMenu.id)?.name}</div>
      <button onClick={() => void runContextAction('open')}><ExternalLink size={15} /><span>{contextMenu.type === 'file' ? 'Open' : contextMenu.type === 'folder' ? 'Open folder' : 'Switch to workspace'}</span></button>
      <button onClick={() => void runContextAction('rename')}><Pencil size={15} /><span>Rename</span></button>
      {contextMenu.type !== 'project' && <button onClick={() => void runContextAction('move')}><MoveRight size={15} /><span>Move to…</span></button>}
      {contextMenu.type !== 'file' && <button onClick={() => void runContextAction('import')}><Import size={15} /><span>Import files here…</span></button>}
      {contextMenu.type !== 'file' && <button onClick={() => void runContextAction('import-folder')}><FolderPlus size={15} /><span>Import folder here…</span></button>}
      <div className="context-separator" />
      <button className="context-danger" onClick={() => void runContextAction('delete')}><Trash2 size={15} /><span>{contextMenu.type === 'file' ? 'Move to Trash' : contextMenu.type === 'folder' ? 'Delete folder' : 'Delete project'}</span></button>
    </div>}

    {moveDialog && <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setMoveDialog(null); }}>
      <section className="move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-title">
        <div className="move-dialog-header"><div><div className="modal-eyebrow">MOVE ITEM</div><h2 id="move-title">Move “{moveDialog.name}”</h2></div><button className="icon-button" onClick={() => setMoveDialog(null)} aria-label="Close"><X size={17} /></button></div>
        <p className="move-dialog-copy">Choose a workspace, project, or folder as the destination.</p>
        <div className="destination-list">
          {moveDestinations.map((destination) => <button key={destination.key} className="destination-option" onClick={() => void moveItemTo({ folderId: destination.folderId, projectId: destination.projectId, workspaceId: destination.workspaceId })}>
            {destination.folderId ? <Folder size={16} /> : <Layers size={16} />}<span><b>{destination.label}</b><small>{destination.detail}</small></span><ChevronRight size={15} />
          </button>)}
          {moveDestinations.length === 1 && <div className="destination-empty">Create a project or folder to add more destinations.</div>}
        </div>
        <div className="move-dialog-footer"><button className="text-button" onClick={() => setMoveDialog(null)}>Cancel</button></div>
      </section>
    </div>}

    <WorkspaceDialog dialog={dialog} onClose={() => setDialog(null)} onSubmit={() => void submitDialog()} onChange={(value) => setDialog((current) => current ? { ...current, value } : current)} />

    {migrationBackup && <div className="modal-backdrop upgrade-backdrop">
      <section className="move-dialog upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <div className="upgrade-mark"><HardDrive size={21} /></div>
        <div className="modal-eyebrow">SAFE WORKSPACE UPDATE</div>
        <h2 id="upgrade-title">Back up before we continue</h2>
        <p className="move-dialog-copy">This update adds separate workspaces and keeps your theme and PDF reading positions. Before the database changes, a full backup of your files, folders, projects, and settings will download.</p>
        {migrationError && <div className="inline-error">The update did not finish: {migrationError}. Your old database is left in place; you can retry after saving the downloaded backup.</div>}
        <button className="primary-button upgrade-button" disabled={upgrading} onClick={() => void downloadMigrationBackupAndUpgrade()}>{upgrading ? <><span className="spinner" /> Updating…</> : <><Download size={15} /> {isDesktopApp() ? 'Download backup & continue' : 'Download backup (desktop required)'}</>}</button>
      </section>
    </div>}

    {loading && <div className="startup-screen"><div className="brand-mark"><Command size={19} /></div><span>Opening your workspace…</span></div>}
    {importing && <div className="busy-pill"><span className="spinner" /> Importing files…</div>}
  </div></div>;
}

function restoreEditorViewState(view: EditorView, state?: EditorViewState) {
  if (!state) return;
  const length = view.state.doc.length;
  view.dispatch({ selection: { anchor: Math.min(state.anchor, length), head: Math.min(state.head, length) } });
  view.scrollDOM.scrollTop = state.scrollTop;
  view.scrollDOM.scrollLeft = state.scrollLeft;
}

function EmptyState({ title, message, icon, action }: { title: string; message: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{message}</p>{action && <div className="empty-actions">{action}</div>}</div>;
}
)
    .replace(/\\\\\\\\?\\[/g, '$')
    .replace(/\\\\\\\\?\\]/g, '$');
  return normalized.replace(/(\\$\\$?)([\\s\\S]*?)\\1/g, (_match, delimiter: string, expression: string) =>
    `${delimiter}${expression.replace(/\\\\_/g, '_')}${delimiter}`,
  );
}

export default function App() {
  useEffect(() => collectFrontendDiagnostics(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const workspace = useWorkspace(setError, setLoading);
  const { files, folders, projects, workspaces, setWorkspaces, activeWorkspaceId, setActiveWorkspaceId, refresh } = workspace;
  const [migrationBackup, setMigrationBackup] = useState<number | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [view, setView] = useState<View>('workspace');
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { tabs, setTabs, activeTabId, setActiveTabId, restoreWorkspaceTabs, flushWorkspaceSession } = useWorkspaceTabs(activeWorkspaceId, loading, setError);
  const [query, setQuery] = useState('');
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
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useWorkspaceInitialization({
    refresh, setMigrationBackup, setLoading, setError, setAppZoom, setEditorFontSize,
    setPreferencesReady: setUiPreferencesReady, setDarkTheme, setWorkspaces, setActiveWorkspaceId,
    restoreTabs: restoreWorkspaceTabs,
  });
  useGlobalShortcuts(setAppZoom);

  // Fixed near-black editor theme inspired by the supplied reference.
  const editorTheme = useMemo(() => EditorView.theme({
    '&': { height: '100%', backgroundColor: '#111111', color: '#e6e6e6' },
    '.cm-scroller': { fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace", lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { caretColor: '#f2f2f2', fontSize: `${editorFontSize}px` },
    '.cm-line': { padding: '0 4px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#f2f2f2' },
    '.cm-gutters': { backgroundColor: '#111111', color: '#777777', border: 'none', borderRight: '1px solid #242424', fontSize: `${editorFontSize}px` },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '3.5em', padding: '0 12px 0 10px' },
    '.cm-activeLine': { backgroundColor: '#191919' },
    '.cm-activeLineGutter': { backgroundColor: '#191919', color: '#d8d8d8' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#343b4a' },
    '.cm-selectionMatch': { backgroundColor: '#292f3a' },
    '.cm-focused .cm-matchingBracket': { backgroundColor: '#292f3a', outline: '1px solid #59677f' },
    '.cm-searchMatch': { backgroundColor: '#51421f', outline: '1px solid #8a7134' },
    '.cm-searchMatch-selected': { backgroundColor: '#6a5526' },
    '.cm-tooltip': { backgroundColor: '#1b1b1b', color: '#e6e6e6', border: '1px solid #383838' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#30343d', color: '#ffffff' },
    '.cm-foldPlaceholder': { backgroundColor: '#292929', color: '#c7c7c7', border: 'none' },
  }, { dark: true }), [editorFontSize]);
  const editorSyntax = useMemo(() => syntaxHighlighting(HighlightStyle.define([
    { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
    { tag: tags.keyword, color: '#c586c0' },
    { tag: [tags.typeName, tags.className], color: '#4ec9b0' },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: '#dcdcaa' },
    { tag: [tags.string, tags.regexp, tags.special(tags.string)], color: '#ce9178' },
    { tag: [tags.number, tags.bool, tags.null], color: '#b5cea8' },
    { tag: tags.operator, color: '#d4d4d4' },
  ])), []);

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
  const persistEditorViewState = useCallback((id: string, view: EditorView, preview: boolean) => {
    const selection = view.state.selection.main;
    const state: EditorViewState = {
      anchor: selection.anchor,
      head: selection.head,
      scrollTop: view.scrollDOM.scrollTop,
      scrollLeft: view.scrollDOM.scrollLeft,
      preview,
    };
    void db.preferences.put({ key: `editor:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save editor position.');
    });
  }, [setError]);

  const updatePdfView = useCallback((id: string, state: PdfViewState) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, pdfState: state } : tab));
    void db.preferences.put({ key: `pdf:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save this PDF reading position.');
    });
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.global-search input')?.focus();
      }
      if (event.key === 'Escape') document.querySelector<HTMLInputElement>('.global-search input')?.blur();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  useEffect(() => { if (!activeTabId) setFocusMode(false); }, [activeTabId]);
  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!workspaceMenuRef.current?.contains(target)) setWorkspaceMenuOpen(false);
      if (!importMenuRef.current?.contains(target)) setImportMenuOpen(false);
      if (!contextMenuRef.current?.contains(target)) setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenus);
    return () => window.removeEventListener('pointerdown', closeMenus);
  }, []);

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

  const tree = useMemo(() => buildWorkspaceTree(folders, liveFiles, null, activeProject, activeWorkspaceId), [folders, liveFiles, activeProject, activeWorkspaceId]);
  const excludedMoveFolders = useMemo(() => {
    const ids = new Set<string>();
    if (moveDialog?.type !== 'folder') return ids;
    ids.add(moveDialog.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) if (folder.parentFolderId && ids.has(folder.parentFolderId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
    }
    return ids;
  }, [folders, moveDialog]);
  const moveDestinations = useMemo(() => [
    ...workspaces.map((workspace) => ({ key: `workspace-${workspace.id}`, label: workspace.name, detail: 'Workspace root', folderId: null, projectId: null, workspaceId: workspace.id })),
    ...projects.filter((project) => !project.archived).map((project) => ({ key: `project-${project.id}`, label: project.name, detail: `${workspaces.find((workspace) => workspace.id === project.workspaceId)?.name ?? 'Workspace'} · Project`, folderId: null, projectId: project.id, workspaceId: project.workspaceId })),
    ...folders.filter((folder) => !excludedMoveFolders.has(folder.id) && (folder.projectId === null || projects.some((project) => project.id === folder.projectId && !project.archived))).map((folder) => ({
      key: `folder-${folder.id}`,
      label: folder.name,
      detail: `${workspaces.find((workspace) => workspace.id === folder.workspaceId)?.name ?? 'Workspace'} · ${projects.find((project) => project.id === folder.projectId)?.name ?? 'General'} · Folder`,
      folderId: folder.id,
      projectId: folder.projectId,
      workspaceId: folder.workspaceId,
    })),
  ], [excludedMoveFolders, folders, projects, workspaces]);

  const searchResults = useWorkspaceSearch(liveFiles, query, setError);

  const openFile = useCallback(async (fileMeta: FileMeta) => {
    // Reclassify on open so legacy HDL records cannot remain editable.
    const meta: FileMeta = { ...fileMeta, kind: kindForFile(fileMeta.name, fileMeta.mimeType) };
    let restoredTabs: Tab[] = [];
    if (meta.workspaceId !== activeWorkspaceId) {
      if (activeWorkspaceId) {
        await saveWorkspaceSession(db, activeWorkspaceId, tabs.filter((tab) => tab.meta.workspaceId === activeWorkspaceId).map((tab) => tab.id), activeTabId);
      }
      await workspace.switchWorkspace(meta.workspaceId);
      const restored = await restoreWorkspaceTabs(meta.workspaceId);
      restoredTabs = restored.tabs;
      setActiveProject(meta.projectId);
      setSelectedFolder(meta.parentFolderId);
      setView('workspace');
    }
    const existing = tabs.find((tab) => tab.id === meta.id) ?? restoredTabs.find((tab) => tab.id === meta.id);
    const persistOpenTabSession = async () => {
      const currentWorkspaceTabs = (meta.workspaceId === activeWorkspaceId ? tabs : restoredTabs)
        .filter((tab) => tab.meta.workspaceId === meta.workspaceId);
      const openFileIds = [...new Set([...currentWorkspaceTabs.map((tab) => tab.id), meta.id])];
      try {
        // Commit the session before publishing the tab in React state. A page reload
        // immediately after the tab appears must not race the debounced session effect.
        await saveWorkspaceSession(db, meta.workspaceId, openFileIds, meta.id);
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not save the open-tab session.');
        return false;
      }
    };
    if (existing) {
      let hydrated: Tab;
      try {
        hydrated = existing.hydrated !== true ? await hydrateWorkspaceTab(db, existing) : existing;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : `Could not open “${meta.name}”.`);
        return;
      }
      if (hydrated.dirty) trackRecoveredDraft(meta.id, hydrated.draft);
      if (!(await persistOpenTabSession())) return;
      setTabs((current) => current.map((tab) => {
        if (tab.id === meta.id) return hydrated;
        if (!(tab.data instanceof Blob)) return tab;
        const { data: _released, ...withoutPdfData } = tab;
        return { ...withoutPdfData, hydrated: false };
      }));
      setActiveTabId(meta.id);
      setError('');
      return;
    }
    let newTab: Tab;
    try {
      newTab = await hydrateWorkspaceTab(db, {
        id: meta.id,
        meta,
        draft: '',
        dirty: false,
        preview: meta.kind === 'markdown',
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not open “${meta.name}”.`);
      return;
    }
    if (newTab.dirty) trackRecoveredDraft(meta.id, newTab.draft);
    if (!(await persistOpenTabSession())) return;
    setTabs((current) => [
      ...current.map((tab) => {
        if (!(tab.data instanceof Blob)) return tab;
        const { data: _released, ...withoutPdfData } = tab;
        return { ...withoutPdfData, hydrated: false };
      }),
      newTab,
    ]);
    setActiveTabId(meta.id);
    if (newTab.dirty) setStatus('Recovered an unsaved draft · Save to keep these changes');
    setError('');
  }, [activeWorkspaceId, restoreWorkspaceTabs, tabs, trackRecoveredDraft, workspace.switchWorkspace]);

  useEffect(() => {
    if (!activeTab || activeTab.hydrated === true || loading) return;
    void openFile(activeTab.meta).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : `Could not restore “${activeTab.meta.name}”.`);
    });
  }, [activeTab, loading, openFile]);

  function createProject() {
    requestInput('Create project', '', 'Project name', 'Create project', async (name) => {
      const now = Date.now();
      const project: Project = { id: crypto.randomUUID(), workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID, name: name.trim(), archived: false, createdAt: now, updatedAt: now };
      await db.projects.add(project);
      await refresh();
      setActiveProject(project.id); setSelectedFolder(null); setActiveTabId(null); setView('workspace');
    });
  }

  function createFolderInCurrent() {
    requestInput('Create folder', '', 'Folder name', 'Create folder', async (name) => {
      const folder = await createFolder(db, name.trim(), selectedFolder, activeProject, activeWorkspaceId ?? DEFAULT_WORKSPACE_ID);
      setExpanded((current) => new Set(current).add(folder.id));
      await refresh();
    });
  }

  function createNewFile(kind: 'markdown' | 'code') {
    const initial = kind === 'markdown' ? 'Untitled note.md' : 'Untitled.ts';
    requestInput(kind === 'markdown' ? 'Create note' : 'Create code file', initial, 'File name', 'Create file', async (name) => {
      const text = kind === 'markdown' ? `# ${name.replace(/\.(md|markdown)$/i, '')}\n\n` : '';
      const meta = await createTextFile(db, name.trim(), text, { parentFolderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID, kind });
      await refresh();
      await openFile(meta);
    });
  }

  async function handleImport(fileList: FileList | null, destinationFolderId = selectedFolder, destinationProjectId = activeProject, destinationWorkspaceId = activeWorkspaceId ?? DEFAULT_WORKSPACE_ID) {
    if (!fileList?.length) return;
    setImporting(true);
    try {
      for (const file of Array.from(fileList)) {
        const meta = await importFile(db, file, { parentFolderId: destinationFolderId, projectId: destinationProjectId, workspaceId: destinationWorkspaceId });
        if (['pdf', 'markdown', 'code', 'text', 'viewer'].includes(meta.kind)) await openFile(meta);
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
        if (['pdf', 'markdown', 'code', 'text', 'viewer'].includes(meta.kind)) await openFile(meta);
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
      await emptyTrash(db, activeWorkspaceId ?? DEFAULT_WORKSPACE_ID);
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

  function toggleFolder(id: string) {
    setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function handleDrop(event: DragEvent, folderId: string | null, destinationProjectId = activeProject, destinationWorkspaceId = activeWorkspaceId ?? DEFAULT_WORKSPACE_ID) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files.length > 0) {
      void handleImport(event.dataTransfer.files, folderId, destinationProjectId, destinationWorkspaceId);
      return;
    }
    const payload = event.dataTransfer.getData('application/x-workbench-item');
    if (!payload) return;
    const { id, type } = JSON.parse(payload) as { id: string; type: 'file' | 'folder' };
    void (async () => {
      try {
        if (type === 'file') await moveFile(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        else await moveFolder(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        await refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not move this item.'); }
    })();
  }

  function renderFolder(folder: WorkspaceTreeFolder, depth = 0) {
    const isOpen = expanded.has(folder.record.id);
    const selected = selectedFolder === folder.record.id;
    return <div key={folder.record.id}>
      <div className={`tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: `${12 + depth * 16}px` }} draggable onContextMenu={(event) => showContextMenu('folder', folder.record.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: folder.record.id, type: 'folder' }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.record.id, folder.record.projectId, folder.record.workspaceId)}>
        <button className="tree-main" onClick={() => { setSelectedFolder(folder.record.id); setActiveProject(folder.record.projectId); setView('workspace'); setActiveTabId(null); }} onDoubleClick={() => toggleFolder(folder.record.id)}>
          <span className="twisty" onClick={(event) => { event.stopPropagation(); toggleFolder(folder.record.id); }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          {isOpen ? <Folder size={16} className="folder-icon open" /> : <Folder size={16} className="folder-icon" />}
          <span className="truncate" title={folder.record.name}>{folder.record.name}</span>
        </button>
        <button className="mini-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.record.id, event)}><Ellipsis size={15} /></button>
      </div>
      {isOpen && <>
        {folder.children.map((child) => renderFolder(child, depth + 1))}
        {folder.files.sort((a, b) => a.name.localeCompare(b.name)).map((file) => renderFileTree(file, depth + 1))}
      </>}
    </div>;
  }

  function renderFileTree(file: FileMeta, depth = 0) {
    return <div key={file.id} className={`tree-row file-row ${activeTabId === file.id ? 'selected' : ''}`} style={{ paddingLeft: `${31 + depth * 16}px` }} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
      <button className="tree-main" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={15} />}<span className="truncate" title={file.name}>{file.name}</span></button>
      <button className="mini-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={15} /></button>
    </div>;
  }

  function renderProjectTree(project: Project) {
    const open = activeProject === project.id;
    const projectTree = buildWorkspaceTree(folders, liveFiles, null, project.id, project.workspaceId);
    const filesAtRoot = liveFiles.filter((file) => file.projectId === project.id && file.parentFolderId === null);
    return <div key={project.id}>
      <div className={`tree-row project-row ${open ? 'selected' : ''}`} onContextMenu={(event) => showContextMenu('project', project.id, event)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, null, project.id, project.workspaceId)}>
        <button className="tree-main" onClick={() => { setActiveProject(project.id); setSelectedFolder(null); setView('workspace'); setActiveTabId(null); }}>
          <span className="twisty">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <span className="project-dot" />
          <span className="truncate" title={project.name}>{project.name}</span>
        </button>
        <button className="mini-action" title="Project actions" onClick={(event) => showContextMenu('project', project.id, event)}><Ellipsis size={15} /></button>
      </div>
      {open && <div className="project-children" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, null, project.id, project.workspaceId)}>
        {projectTree.map((folder) => renderFolder(folder))}
        {filesAtRoot.map((file) => renderFileTree(file))}
        {projectTree.length === 0 && filesAtRoot.length === 0 && <button className="tree-empty" onClick={() => void createNewFile('markdown')}>Nothing here yet <span>+ add a note</span></button>}
      </div>}
    </div>;
  }

  async function createWorkspaceFile(kind: 'markdown' | 'code') {
    if (view !== 'workspace') setView('workspace');
    await createNewFile(kind);
  }

  const visibleFiles = view === 'trash' ? trashedFiles : view === 'recent'
    ? [...liveFiles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40)
    : view === 'workspace' && !activeProject && !selectedFolder
      ? liveFiles
      : liveFiles.filter((file) => file.workspaceId === activeWorkspaceId && file.projectId === activeProject && file.parentFolderId === selectedFolder);
  const sortedVisible = view === 'recent' || view === 'trash' ? [...visibleFiles] : [...visibleFiles].sort((a, b) => {
    const order = sort === 'type' ? a.kind.localeCompare(b.kind) : sort === 'size' ? a.size - b.size : sort === 'updatedAt' ? a.updatedAt - b.updatedAt : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sortDesc ? -order : order;
  });

  return <div className="app-viewport" data-theme={darkTheme ? 'dark' : 'light'}><div className={`app-shell ${focusMode ? 'focus-mode' : ''}`} data-theme={darkTheme ? 'dark' : 'light'} style={{ transform: `scale(${appZoom})`, width: `calc(100% / ${appZoom})`, height: `calc(100% / ${appZoom})` }}>
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Command size={19} strokeWidth={2.2} /></div>
        {!sidebarCollapsed && <div className="brand-copy"><b>Workbench</b><span>Engineering workspace</span></div>}
        <button className="icon-button sidebar-toggle" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
      </div>

      {!sidebarCollapsed && <>
        <div className="sidebar-primary">
          <button className={`nav-item ${view === 'workspace' && activeProject === null ? 'active' : ''}`} onClick={() => { setView('workspace'); setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }}><LayoutGrid size={16} /> Workspace</button>
          <button className={`nav-item ${view === 'recent' ? 'active' : ''}`} onClick={() => { setView('recent'); setActiveTabId(null); }}><Clock3 size={16} /> Recent <span className="nav-count">{liveFiles.length}</span></button>
          <button className={`nav-item ${view === 'trash' ? 'active' : ''}`} onClick={() => { setView('trash'); setActiveTabId(null); }}><Trash2 size={16} /> Trash {trashedFiles.length > 0 && <span className="nav-count">{trashedFiles.length}</span>}</button>
          <button className={`nav-item ${view === 'diagnostics' ? 'active' : ''}`} onClick={() => { setView('diagnostics'); setActiveTabId(null); }}><Activity size={16} /> Diagnostics</button>
        </div>
        <div className="sidebar-section-heading"><span>PROJECTS</span><button title="New project" onClick={() => void createProject()}><Plus size={15} /></button></div>
        <div className="project-tree">
          {(buildWorkspaceTree(folders, liveFiles, null, null, activeWorkspaceId).length > 0 || liveFiles.some((file) => file.workspaceId === activeWorkspaceId && file.projectId === null && file.parentFolderId === null)) && <div className="sidebar-section-heading workspace-tree-heading"><span>WORKSPACE FILES</span></div>}
          {buildWorkspaceTree(folders, liveFiles, null, null, activeWorkspaceId).map((folder) => renderFolder(folder))}
          {liveFiles.filter((file) => file.workspaceId === activeWorkspaceId && file.projectId === null && file.parentFolderId === null).map((file) => renderFileTree(file))}
          {projects.filter((project) => !project.archived && project.workspaceId === activeWorkspaceId).map(renderProjectTree)}
          {projects.filter((project) => !project.archived && project.workspaceId === activeWorkspaceId).length === 0 && <div className="sidebar-empty">Your projects<br /><span>show up here</span></div>}
          {projects.some((project) => project.archived && project.workspaceId === activeWorkspaceId) && <>
            <div className="sidebar-section-heading archived-heading"><span>ARCHIVED</span></div>
            {projects.filter((project) => project.archived && project.workspaceId === activeWorkspaceId).map(renderProjectTree)}
          </>}
        </div>
        <div className="sidebar-bottom">
          <div className="system-monitor" aria-label="System utilisation">
            <div className="system-monitor-heading"><Activity size={13} /><span>System</span><span className="system-monitor-live">LIVE</span></div>
            {[
              { label: 'CPU', value: systemStats.cpu },
              { label: 'RAM', value: systemStats.ram },
              { label: 'GPU', value: systemStats.gpu },
            ].map(({ label, value }) => (
              <div className="system-metric" key={label} title={value == null ? `${label} utilisation unavailable` : `${label} utilisation ${Math.round(value)}%`}>
                <span className="system-metric-label">{label}</span>
                <div className="system-metric-track" role="meter" aria-label={`${label} utilisation`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
                  <i style={{ width: `${value == null ? 0 : Math.min(100, Math.max(0, value))}%` }} />
                </div>
                <span className="system-metric-value">{value == null ? '—' : `${Math.round(value)}%`}</span>
              </div>
            ))}
            <div className="system-storage">
              <div className="storage-line"><HardDrive size={14} /><span>Stored on this device</span></div>
              <div className="storage-meter"><i style={{ width: `${Math.min(100, storedBytes / (250 * 1024 * 1024) * 100)}%` }} /></div>
              <span className="storage-caption">{formatSize(storedBytes)} used</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button onClick={() => void backup.saveWorkspaceBackup()} title="Save a workspace backup"><Download size={15} /> Backup</button>
            <button onClick={() => void backup.restoreFromPicker(backupInput.current)} title="Restore from backup"><Import size={15} /> Restore</button>
          </div>
          <input ref={backupInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void backup.openBackup(event.target.files?.[0], event.currentTarget)} />
        </div>
      </>}
      {sidebarCollapsed && <div className="collapsed-nav"><button title="Workspace" onClick={() => { setView('workspace'); setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }}><LayoutGrid size={18} /></button><button title="Recent" onClick={() => { setView('recent'); setActiveTabId(null); }}><Clock3 size={18} /></button><button title="Trash" onClick={() => { setView('trash'); setActiveTabId(null); }}><Trash2 size={18} /></button><button title="Diagnostics" onClick={() => { setView('diagnostics'); setActiveTabId(null); }}><Activity size={18} /></button><button title="New project" onClick={() => void createProject()}><Plus size={18} /></button></div>}
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="workspace-switcher" ref={workspaceMenuRef}>
          <button className="workspace-switch-button" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((open) => !open)}>
            <Layers size={16} /><span>{view === 'trash' ? 'Trash' : view === 'recent' ? 'Recent files' : view === 'diagnostics' ? 'Diagnostics' : activeWorkspace?.name ?? 'Workspace'}{activeProjectRecord ? ` / ${activeProjectRecord.name}` : ''}</span>
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
              <button onClick={() => { setImportMenuOpen(false); startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }); }}><FileText size={15} /><span>Import files</span></button>
              <button onClick={() => { setImportMenuOpen(false); startImportFolderInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }); }}><FolderPlus size={15} /><span>Import folder</span></button>
              <div className="switch-menu-separator" />
              <button onClick={() => { setImportMenuOpen(false); void createFolderInCurrent(); }}><FolderPlus size={15} /><span>New folder</span></button>
              <button onClick={() => { setImportMenuOpen(false); void createWorkspaceFile('markdown'); }}><FilePlus2 size={15} /><span>New note</span></button>
              <button onClick={() => { setImportMenuOpen(false); void createWorkspaceFile('code'); }}><Code2 size={15} /><span>New code file</span></button>
            </div>}
          </div>}
          <label className="global-search"><Search size={16} /><input placeholder="Search files and notes" value={query} onChange={(event) => { setQuery(event.target.value); setRightPanel('search'); }} /><kbd>⌘ K</kbd></label>
          <div className="app-zoom-controls" title="App zoom: Ctrl+= to increase, Ctrl+- to decrease, Ctrl+0 to reset"><button className="icon-button" aria-label="Decrease app size" title="Decrease app size (Ctrl+-)" onClick={() => setAppZoom((value) => Math.max(0.8, Math.round((value - 0.1) * 100) / 100))}><ZoomOut size={15} /></button><span>{Math.round(appZoom * 100)}%</span><button className="icon-button" aria-label="Increase app size" title="Increase app size (Ctrl+=)" onClick={() => setAppZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 100) / 100))}><ZoomIn size={15} /></button><button className="icon-button" aria-label="Reset app size" title="Reset app size (Ctrl+0)" onClick={() => setAppZoom(1)}><span className="zoom-reset-label">100</span></button></div>
          <button className="icon-button theme-toggle" title={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => void toggleTheme()}>{darkTheme ? <Sun size={16} /> : <Moon size={16} />}</button>
          <span className={`save-status ${status === 'Saved locally' ? 'saved' : ''}`}><span className="status-dot" />{status}</span>
          <button className="icon-button" title="Details" onClick={() => setRightPanel((value) => value === 'details' ? null : 'details')}><Settings2 size={17} /></button>
        </div>
      </header>

      <input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }; void handleImport(event.target.files, target.folderId, target.projectId, target.workspaceId); setImportTarget(null); }} />
      <input ref={folderInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }; void handleFolderImport(event.target.files, target); }} />

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}

      {view === 'diagnostics' ? <DiagnosticsDashboard /> : activeTab ? <div className="editor-workspace">
        <div className="tab-strip">
          <div className="tab-list">
            {workspaceTabs.map((tab) => <button key={tab.id} className={`file-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>
              {<FileKindIcon kind={tab.meta.kind} size={15} />}<span className="truncate" title={tab.meta.name}>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}
              <span role="button" tabIndex={0} className="tab-close" aria-label={`Close ${tab.meta.name}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); closeTab(tab.id); } }}><X size={14} /></span>
            </button>)}
          </div>
          <button className="icon-button tab-plus" title="Import a file" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Plus size={16} /></button>
        </div>
        <div className="editor-titlebar">
          <div className="editor-file-title">{<FileKindIcon kind={activeTab.meta.kind} size={16} />}<b title={activeTab.meta.name}>{activeTab.meta.name}</b><span className="title-location" title={`${activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}${activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}`}>{activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}{activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}</span></div>
          <div className="editor-tools">
            {(activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' || activeTab.meta.kind === 'markdown') && <div className="editor-font-controls" title="Editor text size"><button className="icon-button" aria-label="Decrease editor text size" title="Decrease editor text size" onClick={() => setEditorFontSize((value) => Math.max(11, value - 1))}><ZoomOut size={14} /></button><span>{editorFontSize}px</span><button className="icon-button" aria-label="Increase editor text size" title="Increase editor text size" onClick={() => setEditorFontSize((value) => Math.min(24, value + 1))}><ZoomIn size={14} /></button></div>}
            {activeTab.meta.kind === 'markdown' && <button className={`text-button ${activeTab.preview ? 'selected' : ''}`} onClick={() => {
              const preview = !activeTab.preview;
              const editorState = { anchor: activeTab.editorState?.anchor ?? 0, head: activeTab.editorState?.head ?? 0, scrollTop: activeTab.editorState?.scrollTop ?? 0, scrollLeft: activeTab.editorState?.scrollLeft ?? 0, preview };
              setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, preview, editorState } : tab));
              void db.preferences.put({ key: `editor:${activeTab.id}`, value: editorState, updatedAt: Date.now() }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save editor view state.'));
            }}>{activeTab.preview ? 'Edit note' : 'Preview'}</button>}
            {(activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' || activeTab.meta.kind === 'markdown') && <button className="text-button" title="Save changes (Ctrl+S)" disabled={!activeTab.dirty} onClick={() => void persistDraft(activeTab.id, activeTab.draft).catch(() => undefined)}><Save size={14} /> Save</button>}
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
        {activeTab.meta.kind === 'pdf' ? null : activeTab.meta.kind === 'markdown' ? (
          <div className={`note-layout ${activeTab.preview ? 'preview-only' : ''}`}>
            {!activeTab.preview && <div className="code-editor markdown-editor"><CodeMirror value={activeTab.draft} height="100%" theme={editorTheme} extensions={[markdown(), editorSyntax]} onChange={(value) => updateDraft(activeTab.id, value)} onCreateEditor={(view) => restoreEditorViewState(view, activeTab.editorState)} onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) persistEditorViewState(activeTab.id, update.view, activeTab.preview); }} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true }} /></div>}
            <div className="markdown-preview"><div className="preview-label">PREVIEW</div><article className="prose" style={{ fontSize: `${editorFontSize}px` }}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
              code({ className, children, ...props }) {
                const code = String(children).replace(/\n$/, '');
                if (className === 'language-mermaid') return <MermaidDiagram source={code} />;
                return <code className={className} {...props}>{children}</code>;
              }
            }}>{activeTab.draft}</ReactMarkdown></article></div>
          </div>
        ) : activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' ? (
          <div className="code-editor"><CodeMirror value={activeTab.draft} height="100%" theme={editorTheme} extensions={[activeTab.meta.kind === 'code' ? (['v', 'sv', 'vh', 'svh'].includes(activeTab.meta.name.split('.').pop()?.toLowerCase() ?? '') ? StreamLanguage.define(verilog) : javascript()) : [], editorSyntax]} onChange={(value) => updateDraft(activeTab.id, value)} onCreateEditor={(view) => restoreEditorViewState(view, activeTab.editorState)} onUpdate={(update) => { if (update.selectionSet || update.viewportChanged) persistEditorViewState(activeTab.id, update.view, activeTab.preview); }} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true, closeBrackets: true }} /></div>
        ) : activeTab.meta.kind === 'viewer' ? (
          <Suspense fallback={<div className="loading-state">Loading file viewer…</div>}><ReadOnlyFileViewer fileName={activeTab.meta.name} data={activeTab.data} mimeType={activeTab.meta.mimeType} /></Suspense>
        ) : <div className="unsupported-file"><div className="unsupported-icon"><File size={26} /></div><h2>Preview unavailable</h2><p>This file is saved in your workspace. Download it through a backup or open it in another app.</p><span>{formatSize(activeTab.meta.size)} · {activeTab.meta.mimeType}</span></div>}
        <footer className="editor-footer"><span>{activeTab.meta.kind === 'code' ? 'Code editor' : activeTab.meta.kind === 'text' ? 'Text editor' : activeTab.meta.kind === 'viewer' ? 'Read-only viewer' : activeTab.meta.kind === 'markdown' ? 'Markdown' : activeTab.meta.kind === 'pdf' ? 'PDF document' : 'File'}{activeTab.dirty ? ' · Unsaved changes' : ''}</span><span>{formatSize(activeTab.meta.size)}</span></footer>
      </div> : <div className="workspace-body" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
        {workspaceTabs.length > 0 && <div className="background-tab-strip"><span>OPEN TABS</span>{workspaceTabs.map((tab) => <button key={tab.id} className={`background-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>{<FileKindIcon kind={tab.meta.kind} size={14} />}<span>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}<span className="background-tab-close" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}><X size={12} /></span></button>)}</div>}
        {view === 'workspace' && !activeProject && !selectedFolder && !workspaceHasContent ? <div className="welcome-page">
          <div className="welcome-kicker"><Sparkles size={15} /> LOCAL ENGINEERING WORKSPACE</div>
          <h1>Your work, in one place.</h1>
          <p>Keep technical notes, PDFs and source files organized on this device.</p>
          <div className="welcome-actions"><button className="primary-button large" onClick={() => void createProject()}><Plus size={17} /> Create a project</button><button className="text-button large" onClick={() => startImportInto({ folderId: null, projectId: null, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={16} /> Import files</button></div>
          <div className="feature-grid">
            <button className="feature-card" onClick={() => void createWorkspaceFile('markdown')}><div className="feature-icon note"><BookOpen size={18} /></div><b>Technical notes</b><span>Markdown with math and diagrams</span><Plus size={15} className="feature-plus" /></button>
            <button className="feature-card" onClick={() => void createWorkspaceFile('code')}><div className="feature-icon code"><Code2 size={18} /></div><b>Source files</b><span>Write and save code locally</span><Plus size={15} className="feature-plus" /></button>
            <button className="feature-card" onClick={() => startImportInto({ folderId: null, projectId: null, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><div className="feature-icon pdf"><FileText size={18} /></div><b>Reference PDFs</b><span>Read and search your documents</span><Plus size={15} className="feature-plus" /></button>
          </div>
          <div className="privacy-note"><HardDrive size={15} /> Your files stay in this browser on this device.</div>
        </div> : <div className="file-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
          {view === 'workspace' && !activeProject && !selectedFolder && (activeProjects.length > 0 || generalRootFolders.length > 0) && <section className="workspace-overview">
            <div className="workspace-overview-heading"><div><span>YOUR WORKSPACE</span><h1>Projects and folders</h1><p>Choose a project to open its own files, or browse general workspace files below.</p></div><button className="outline-button" onClick={() => void createProject()}><Plus size={14} /> New project</button></div>
            {activeProjects.length > 0 && <><h2>Projects</h2><div className="overview-card-grid">{activeProjects.map((project) => <button className="overview-card" key={project.id} onClick={() => void switchProject(project.id)}><span className="overview-card-icon project-card-icon"><Layers size={17} /></span><b>{project.name}</b><small>{liveFiles.filter((file) => file.projectId === project.id).length} files · {folders.filter((folder) => folder.projectId === project.id).length} folders</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
            {generalRootFolders.length > 0 && <><h2>General folders</h2><div className="overview-card-grid">{generalRootFolders.map((folder) => <button className="overview-card" key={folder.id} onClick={() => { setSelectedFolder(folder.id); setActiveProject(null); setActiveTabId(null); }}><span className="overview-card-icon folder-card-icon"><Folder size={17} /></span><b>{folder.name}</b><small>General workspace folder</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
          </section>}
          <div className="file-list-scroll">
            {view === 'workspace' && currentFolders.length > 0 && <>
              {selectedFolder && <div className="folder-contents-heading"><Folder size={14} /> Folders</div>}
              {currentFolders.sort((a, b) => a.name.localeCompare(b.name)).map((folder) => <div className="file-list-row folder-list-row" key={folder.id} draggable onContextMenu={(event) => showContextMenu('folder', folder.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: folder.id, type: 'folder' }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.id, folder.projectId, folder.workspaceId)}>
                <button className="file-name-button" onClick={() => { setSelectedFolder(folder.id); setActiveTabId(null); }}><Folder size={17} className="folder-icon" /><span>{folder.name}</span><small>Folder</small></button><span className="kind-cell">Folder</span><span className="size-cell">—</span><span className="date-cell">{new Date(folder.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.id, event)}><Ellipsis size={16} /></button>
              </div>)}
            </>}
            {/* {view === 'workspace' && !activeProject && !selectedFolder && <div className="workspace-files-heading"><span>{visibleFiles.length} file{visibleFiles.length === 1 ? '' : 's'}</span></div>} */}
            <div className="list-header"><button onClick={() => { setSort('name'); setSortDesc(sort === 'name' ? !sortDesc : false); }}>Name <ArrowDownUp size={12} /></button><button onClick={() => { setSort('type'); setSortDesc(sort === 'type' ? !sortDesc : false); }}>Kind <ArrowDownUp size={12} /></button><button onClick={() => { setSort('size'); setSortDesc(sort === 'size' ? !sortDesc : false); }}>Size <ArrowDownUp size={12} /></button><button onClick={() => { setSort('updatedAt'); setSortDesc(sort === 'updatedAt' ? !sortDesc : true); }}>Modified <ArrowDownUp size={12} /></button><span /></div>
            {view === 'trash' ? sortedVisible.length === 0 ? <EmptyState title="Trash is empty" message="Files you delete will appear here until you permanently remove them." icon={<Trash2 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
              <button className="file-name-button" onClick={() => void restoreFile(db, file.id).then(refresh)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>Deleted {new Date(file.deletedAt!).toLocaleDateString()}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Restore" onClick={() => void restoreFile(db, file.id).then(refresh)}><Archive size={15} /></button>
            </div>) : view === 'recent' ? sortedVisible.length === 0 ? <EmptyState title="No recent files" message="Open a file or import one to start building your workspace." icon={<Clock3 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
              <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Move to trash" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>
            </div>) : sortedVisible.length === 0 && currentFolders.length === 0 && !(view === 'workspace' && !activeProject && activeProjects.length > 0) ? <EmptyState title={selectedFolder ? 'This folder is empty' : activeProjectRecord ? 'This project is empty' : 'Workspace is empty'} message="Create a note or file, or drag something in from your computer." icon={<FolderTree size={21} />} action={<><button className="primary-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button><button className="text-button" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={15} /> Import</button></>} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
              <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{file.projectId ? projects.find((project) => project.id === file.projectId)?.name : 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={16} /></button>
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
        {!query.trim() ? <div className="search-placeholder"><Search size={22} /><b>Search your workspace</b><span>Search file names and text in notes or code.</span></div> : searchResults.length === 0 ? <div className="search-placeholder"><Search size={22} /><b>No results found</b><span>Try a different word or phrase.</span></div> : searchResults.map(({ file, text }) => <button className="search-result" key={file.id} onClick={() => void openFile(file)}>
          <span className="search-result-title">{<FileKindIcon kind={file.kind} size={15} />}<b>{file.name}</b></span><span className="search-result-location">{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</span><span className="search-result-snippet">{text.slice(Math.max(0, text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 42), text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) + 100) || file.name}</span>
        </button>)}
        {query.trim() && searchResults.length > 0 && <div className="search-count">{searchResults.length} matching file{searchResults.length === 1 ? '' : 's'}</div>}
      </div>}
    </aside>}

    {contextMenu && <div ref={contextMenuRef} className="item-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
      <div className="context-menu-title">{contextMenu.type === 'file' ? files.find((file) => file.id === contextMenu.id)?.name : contextMenu.type === 'folder' ? folders.find((folder) => folder.id === contextMenu.id)?.name : projects.find((project) => project.id === contextMenu.id)?.name}</div>
      <button onClick={() => void runContextAction('open')}><ExternalLink size={15} /><span>{contextMenu.type === 'file' ? 'Open' : contextMenu.type === 'folder' ? 'Open folder' : 'Switch to workspace'}</span></button>
      <button onClick={() => void runContextAction('rename')}><Pencil size={15} /><span>Rename</span></button>
      {contextMenu.type !== 'project' && <button onClick={() => void runContextAction('move')}><MoveRight size={15} /><span>Move to…</span></button>}
      {contextMenu.type !== 'file' && <button onClick={() => void runContextAction('import')}><Import size={15} /><span>Import files here…</span></button>}
      {contextMenu.type !== 'file' && <button onClick={() => void runContextAction('import-folder')}><FolderPlus size={15} /><span>Import folder here…</span></button>}
      <div className="context-separator" />
      <button className="context-danger" onClick={() => void runContextAction('delete')}><Trash2 size={15} /><span>{contextMenu.type === 'file' ? 'Move to Trash' : contextMenu.type === 'folder' ? 'Delete folder' : 'Delete project'}</span></button>
    </div>}

    {moveDialog && <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setMoveDialog(null); }}>
      <section className="move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-title">
        <div className="move-dialog-header"><div><div className="modal-eyebrow">MOVE ITEM</div><h2 id="move-title">Move “{moveDialog.name}”</h2></div><button className="icon-button" onClick={() => setMoveDialog(null)} aria-label="Close"><X size={17} /></button></div>
        <p className="move-dialog-copy">Choose a workspace, project, or folder as the destination.</p>
        <div className="destination-list">
          {moveDestinations.map((destination) => <button key={destination.key} className="destination-option" onClick={() => void moveItemTo({ folderId: destination.folderId, projectId: destination.projectId, workspaceId: destination.workspaceId })}>
            {destination.folderId ? <Folder size={16} /> : <Layers size={16} />}<span><b>{destination.label}</b><small>{destination.detail}</small></span><ChevronRight size={15} />
          </button>)}
          {moveDestinations.length === 1 && <div className="destination-empty">Create a project or folder to add more destinations.</div>}
        </div>
        <div className="move-dialog-footer"><button className="text-button" onClick={() => setMoveDialog(null)}>Cancel</button></div>
      </section>
    </div>}

    <WorkspaceDialog dialog={dialog} onClose={() => setDialog(null)} onSubmit={() => void submitDialog()} onChange={(value) => setDialog((current) => current ? { ...current, value } : current)} />

    {migrationBackup && <div className="modal-backdrop upgrade-backdrop">
      <section className="move-dialog upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <div className="upgrade-mark"><HardDrive size={21} /></div>
        <div className="modal-eyebrow">SAFE WORKSPACE UPDATE</div>
        <h2 id="upgrade-title">Back up before we continue</h2>
        <p className="move-dialog-copy">This update adds separate workspaces and keeps your theme and PDF reading positions. Before the database changes, a full backup of your files, folders, projects, and settings will download.</p>
        {migrationError && <div className="inline-error">The update did not finish: {migrationError}. Your old database is left in place; you can retry after saving the downloaded backup.</div>}
        <button className="primary-button upgrade-button" disabled={upgrading} onClick={() => void downloadMigrationBackupAndUpgrade()}>{upgrading ? <><span className="spinner" /> Updating…</> : <><Download size={15} /> {isDesktopApp() ? 'Download backup & continue' : 'Download backup (desktop required)'}</>}</button>
      </section>
    </div>}

    {loading && <div className="startup-screen"><div className="brand-mark"><Command size={19} /></div><span>Opening your workspace…</span></div>}
    {importing && <div className="busy-pill"><span className="spinner" /> Importing files…</div>}
  </div></div>;
}

function restoreEditorViewState(view: EditorView, state?: EditorViewState) {
  if (!state) return;
  const length = view.state.doc.length;
  view.dispatch({ selection: { anchor: Math.min(state.anchor, length), head: Math.min(state.head, length) } });
  view.scrollDOM.scrollTop = state.scrollTop;
  view.scrollDOM.scrollLeft = state.scrollLeft;
}

function EmptyState({ title, message, icon, action }: { title: string; message: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{message}</p>{action && <div className="empty-actions">{action}</div>}</div>;
}
