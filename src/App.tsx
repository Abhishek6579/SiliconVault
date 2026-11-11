import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
import { DATABASE_NAME, DATABASE_VERSION, DEFAULT_WORKSPACE_ID, db, existingDatabaseVersion, WorkspaceDatabaseV1, WorkspaceDatabaseV2 } from './storage/database';
import { flushPendingAutosaves } from './storage/autosave';
import { migrateLegacyUiPreferences } from './storage/preferences';
import { createFolder, deleteWorkspace as removeWorkspace, moveFile, moveFolder, softDeleteProject } from './storage/hierarchy';
import { countFolderItems, createTextFile, deleteFolderContents, emptyTrash, getFolderSubtreeIds, importFile, kindForFile, renameFile, restoreFile, saveFileText, softDeleteFile } from './storage/files';
import { downloadBackup, downloadBackupFile, exportBackup, exportBackupStream, importBackup, serializeBackup } from './storage/backup';
import { chooseBackupToRestore, isDesktopApp, iterateDesktopFolder, pickDesktopFiles, saveBackupToDesktop } from './platform/desktop';
import type { FileKind, FileMeta, Folder as FolderRecord, Project, Workspace, WorkspaceBackup } from './storage/types';
const PdfReader = lazy(() => import('./PdfReader'));
const ReadOnlyFileViewer = lazy(() => import('./viewers/ReadOnlyFileViewer'));

type View = 'workspace' | 'recent' | 'trash';
interface Tab { id: string; meta: FileMeta; data?: Blob | string; draft: string; dirty: boolean; preview: boolean; pdfState?: PdfViewState; }
interface TreeFolder { record: FolderRecord; children: TreeFolder[]; files: FileMeta[]; }
interface MermaidDiagramProps { source: string; }
interface PdfViewState { page: number; zoom: number; fit: boolean; }
interface SystemStats { cpu: number | null; ram: number | null; gpu: number | null; }
type ContextItemType = 'file' | 'folder' | 'project';
interface ContextMenuState { type: ContextItemType; id: string; x: number; y: number; }
interface MoveDialogState { type: 'file' | 'folder'; id: string; name: string; }
interface ImportTarget { folderId: string | null; projectId: string | null; workspaceId: string; }
interface SearchResult { file: FileMeta; text: string; }
interface DialogState {
  mode: 'input' | 'confirm';
  title: string;
  message?: string;
  value?: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (value: string) => void | Promise<void>;
}

function MermaidDiagram({ source }: MermaidDiagramProps) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const id = `diagram-${crypto.randomUUID()}`;
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
      return mermaid.render(id, source);
    }).then(({ svg }) => { if (alive && target.current) target.current.innerHTML = svg; }).catch(() => {
      if (alive && target.current) target.current.textContent = 'This diagram could not be rendered.';
    });
    return () => { alive = false; };
  }, [source]);
  return <div className="mermaid-diagram" ref={target} />;
}

function buildTree(folders: FolderRecord[], files: FileMeta[], parentId: string | null, projectId: string | null, workspaceId: string | null): TreeFolder[] {
  return folders.filter((folder) => folder.parentFolderId === parentId && folder.projectId === projectId && folder.workspaceId === workspaceId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((record) => ({ record, children: buildTree(folders, files, record.id, projectId, workspaceId), files: files.filter((file) => file.parentFolderId === record.id && file.projectId === projectId && file.workspaceId === workspaceId) }));
}

function typeIcon(kind: FileKind, size = 16) {
  if (kind === 'pdf') return <FileText size={size} className="file-kind pdf-kind" />;
  if (kind === 'markdown') return <BookOpen size={size} className="file-kind md-kind" />;
  if (kind === 'code') return <FileCode2 size={size} className="file-kind code-kind" />;
  return <File size={size} className="file-kind" />;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function fileText(data: Blob | string) {
  return typeof data === 'string' ? data : '';
}

export default function App() {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrationBackup, setMigrationBackup] = useState<WorkspaceBackup | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [view, setView] = useState<View>('workspace');
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'type' | 'size' | 'updatedAt'>('name');
  const [sortDesc, setSortDesc] = useState(false);
  const [rightPanel, setRightPanel] = useState<'details' | 'search' | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkTheme, setDarkTheme] = useState(true);
  const [appZoom, setAppZoom] = useState(1);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [uiPreferencesReady, setUiPreferencesReady] = useState(false);
  const [systemStats, setSystemStats] = useState<SystemStats>({ cpu: null, ram: null, gpu: null });
  const [focusMode, setFocusMode] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialogState | null>(null);
  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [status, setStatus] = useState('All changes saved');
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveChains = useRef(new Map<string, Promise<void>>());
  const draftRevisions = useRef(new Map<string, number>());
  const pendingDrafts = useRef(new Map<string, string>());
  const closeInProgress = useRef(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!uiPreferencesReady) return;
    void db.preferences.put({ key: 'appZoom', value: appZoom, updatedAt: Date.now() }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save application zoom.'));
  }, [appZoom, uiPreferencesReady]);
  useEffect(() => {
    if (!uiPreferencesReady) return;
    void db.preferences.put({ key: 'editorFontSize', value: editorFontSize, updatedAt: Date.now() }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save editor font size.'));
  }, [editorFontSize, uiPreferencesReady]);
  // Poll native counters sequentially; no renderer-side hardware polling or extra process.
  useEffect(() => {
    if (!isDesktopApp()) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await invoke<SystemStats>('get_system_stats');
        if (active) setSystemStats(next);
      } catch {
        if (active) setSystemStats({ cpu: null, ram: null, gpu: null });
      }
      if (active) timer = setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);


  useEffect(() => {
    const onGlobalZoom = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); setAppZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 100) / 100)); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); setAppZoom((value) => Math.max(0.8, Math.round((value - 0.1) * 100) / 100)); }
      else if (event.key === '0') { event.preventDefault(); setAppZoom(1); }
    };
    window.addEventListener('keydown', onGlobalZoom);
    return () => window.removeEventListener('keydown', onGlobalZoom);
  }, []);

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

  const refresh = useCallback(async () => {
    try {
      const [nextFiles, nextFolders, nextProjects, nextWorkspaces] = await Promise.all([
        db.files.toArray(), db.folders.toArray(), db.projects.toArray(), db.workspaces.toArray(),
      ]);
      setFiles(nextFiles);
      setFolders(nextFolders);
      setProjects(nextProjects);
      setWorkspaces(nextWorkspaces);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open the local workspace.');
    } finally { setLoading(false); }
  }, []);

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
    if (!migrationBackup) return;
    setUpgrading(true);
    setMigrationError('');
    try {
      if (!isDesktopApp()) {
        downloadBackupFile(migrationBackup);
        setMigrationError('The browser cannot confirm that a backup was saved. The migration was not started. Use the desktop app and save the backup through its native save dialog.');
        return;
      }
      const backupSaved = await saveBackupToDesktop(serializeBackup(migrationBackup));
      if (!backupSaved) {
        setMigrationError('Backup saving was cancelled. The database migration was not started; your existing database remains unchanged.');
        return;
      }
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
      setMigrationError(reason instanceof Error ? reason.message : 'The workspace upgrade could not be completed. Your downloaded backup is safe.');
      setLoading(false);
    } finally { setUpgrading(false); }
  }

  async function toggleTheme() {
    const next = !darkTheme;
    setDarkTheme(next);
    try { await db.preferences.put({ key: 'theme', value: next ? 'dark' : 'light', updatedAt: Date.now() }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the theme preference.'); }
  }

  const updatePdfView = useCallback((id: string, state: PdfViewState) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, pdfState: state } : tab));
    void db.preferences.put({ key: `pdf:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save this PDF reading position.');
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      try {
        const version = await existingDatabaseVersion(DATABASE_NAME);
        if (version > 0 && version < DATABASE_VERSION) {
          const previous = version === 1 ? new WorkspaceDatabaseV1() : new WorkspaceDatabaseV2();
          await previous.open();
          try {
            const backup = await exportBackup(previous);
            if (alive) { setMigrationBackup(backup); setLoading(false); }
          } finally { previous.close(); }
          return;
        }
        await db.open();
        const uiPreferences = await migrateLegacyUiPreferences(db, localStorage);
        if (alive) { setAppZoom(uiPreferences.appZoom); setEditorFontSize(uiPreferences.editorFontSize); setUiPreferencesReady(true); }
        const theme = await db.preferences.get('theme');
        if (theme?.value === 'dark') setDarkTheme(true);
        const storedWorkspace = await db.preferences.get('activeWorkspace');
        const nextWorkspaces = await db.workspaces.toArray();
        const selectedWorkspace = nextWorkspaces.find((workspace) => workspace.id === storedWorkspace?.value)?.id ?? nextWorkspaces[0]?.id ?? null;
        setWorkspaces(nextWorkspaces);
        setActiveWorkspaceId(selectedWorkspace);
        if (selectedWorkspace && !storedWorkspace) await db.preferences.put({ key: 'activeWorkspace', value: selectedWorkspace, updatedAt: Date.now() });
        await refresh();
      } catch (reason) {
        if (alive) { setError(reason instanceof Error ? reason.message : 'Could not open the local workspace.'); setLoading(false); }
      }
    };
    void initialize();
    return () => { alive = false; };
  }, [refresh]);
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
      if (!contextMenuRef.current?.contains(target)) setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenus);
    return () => window.removeEventListener('pointerdown', closeMenus);
  }, []);

  const activeProjectRecord = projects.find((project) => project.id === activeProject) ?? null;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const activeProjects = projects.filter((project) => !project.archived && project.workspaceId === activeWorkspaceId);
  const generalRootFolders = folders.filter((folder) => folder.workspaceId === activeWorkspaceId && folder.projectId === null && folder.parentFolderId === null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const allLiveFiles = files.filter((file) => file.deletedAt === null);
  const liveFiles = allLiveFiles.filter((file) => file.workspaceId === activeWorkspaceId);
  const storedBytes = files.reduce((sum, item) => sum + item.size, 0);
  const workspaceHasContent = activeProjects.length > 0 || generalRootFolders.length > 0 || liveFiles.some((file) => file.projectId === null);
  const trashedFiles = files.filter((file) => file.workspaceId === activeWorkspaceId && file.deletedAt !== null).sort((a, b) => b.deletedAt! - a.deletedAt!);
  const rootFiles = liveFiles.filter((file) => file.parentFolderId === null && file.projectId === activeProject);
  const currentFolders = folders.filter((folder) => folder.workspaceId === activeWorkspaceId && folder.parentFolderId === selectedFolder && folder.projectId === activeProject);
  const tree = useMemo(() => buildTree(folders, liveFiles, null, activeProject, activeWorkspaceId), [folders, liveFiles, activeProject, activeWorkspaceId]);
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

  useEffect(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) { setSearchResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const results: SearchResult[] = [];
        for (const file of liveFiles) {
          const titleMatch = file.name.toLocaleLowerCase().includes(needle);
          let text = '';
          if (file.kind === 'markdown' || file.kind === 'code' || file.kind === 'text') {
            const content = await db.contents.get(file.id);
            if (typeof content?.data === 'string') text = content.data;
            else if (content?.data instanceof Blob) text = await content.data.text();
          }
          if (cancelled) return;
          if (titleMatch || text.toLocaleLowerCase().includes(needle)) {
            const index = text.toLocaleLowerCase().indexOf(needle);
            const snippet = index < 0 ? file.name : text.slice(Math.max(0, index - 56), Math.min(text.length, index + needle.length + 88)).trim();
            results.push({ file, text: snippet });
            if (results.length >= 100) break;
          }
        }
        if (!cancelled) setSearchResults(results);
      })().catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Search could not read workspace content.');
      });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [liveFiles, query]);

  const openFile = useCallback(async (fileMeta: FileMeta) => {
    // Reclassify on open so legacy HDL records cannot remain editable.
    const meta: FileMeta = { ...fileMeta, kind: kindForFile(fileMeta.name, fileMeta.mimeType) };
    if (meta.workspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(meta.workspaceId);
      setActiveProject(meta.projectId);
      setSelectedFolder(meta.parentFolderId);
      setView('workspace');
      await db.preferences.put({ key: 'activeWorkspace', value: meta.workspaceId, updatedAt: Date.now() });
    }
    const existing = tabs.find((tab) => tab.id === meta.id);
    if (existing) {
      let data = existing.data;
      if ((meta.kind === 'pdf' || meta.kind === 'viewer') && !data) {
        const content = await db.contents.get(meta.id);
        if (!content) { setError(`The content for “${meta.name}” is missing.`); return; }
        data = content.data;
      }
      setTabs((current) => current.map((tab) => {
        if (tab.id === meta.id) return data === undefined ? tab : { ...tab, data };
        if (!(tab.data instanceof Blob)) return tab;
        const { data: _released, ...withoutPdfData } = tab;
        return withoutPdfData;
      }));
      setActiveTabId(meta.id);
      setError('');
      return;
    }
    const content = await db.contents.get(meta.id);
    if (!content) { setError(`The content for “${meta.name}” is missing.`); return; }
    const data = (meta.kind === 'markdown' || meta.kind === 'code' || meta.kind === 'text') && content.data instanceof Blob ? await content.data.text() : content.data;
    const draft = fileText(data);
    const savedPdfState = meta.kind === 'pdf' ? (await db.preferences.get(`pdf:${meta.id}`))?.value as Partial<PdfViewState> | undefined : undefined;
    const pdfState = meta.kind === 'pdf' ? {
      page: Number.isFinite(savedPdfState?.page) ? Math.max(1, Math.floor(savedPdfState!.page!)) : 1,
      zoom: Number.isFinite(savedPdfState?.zoom) ? Math.max(.5, Math.min(2, savedPdfState!.zoom!)) : 1,
      fit: typeof savedPdfState?.fit === 'boolean' ? savedPdfState.fit : true,
    } : undefined;
    setTabs((current) => [
      ...current.map((tab) => {
        if (!(tab.data instanceof Blob)) return tab;
        const { data: _released, ...withoutPdfData } = tab;
        return withoutPdfData;
      }),
      { id: meta.id, meta, data, draft, dirty: false, preview: meta.kind === 'markdown', pdfState },
    ]);
    setActiveTabId(meta.id);
    setError('');
  }, [activeWorkspaceId, tabs]);

  const persistDraft = useCallback(async (id: string, draft: string) => {
    const pendingTimer = saveTimers.current.get(id);
    if (pendingTimer) clearTimeout(pendingTimer);
    saveTimers.current.delete(id);
    const revision = draftRevisions.current.get(id) ?? 0;
    const previousSave = saveChains.current.get(id) ?? Promise.resolve();
    const save = previousSave.catch(() => undefined).then(() => saveFileText(db, id, draft)).then(() => {
      if (draftRevisions.current.get(id) === revision) {
        setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, dirty: false, meta: { ...tab.meta, size: new TextEncoder().encode(draft).byteLength, updatedAt: Date.now() } } : tab));
        pendingDrafts.current.delete(id);
        setStatus('Saved locally');
      }
    }).catch((reason: unknown) => {
      if (draftRevisions.current.get(id) === revision) { setStatus('Could not save'); setError(reason instanceof Error ? reason.message : 'Unable to save changes.'); }
      throw reason;
    });
    saveChains.current.set(id, save);
    await save;
    await refresh();
  }, [refresh]);

  const updateDraft = useCallback((id: string, draft: string) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, draft, dirty: true } : tab));
    pendingDrafts.current.set(id, draft);
    const revision = (draftRevisions.current.get(id) ?? 0) + 1;
    draftRevisions.current.set(id, revision);
    setStatus('Unsaved changes · Auto-save in 1 second');
    const previous = saveTimers.current.get(id);
    if (previous) clearTimeout(previous);
    saveTimers.current.set(id, setTimeout(() => {
      saveTimers.current.delete(id);
      void persistDraft(id, draft).catch(() => undefined);
    }, 1000));
  }, [persistDraft]);

  const flushPendingSaves = useCallback(async () => {
    await flushPendingAutosaves(pendingDrafts.current, saveTimers.current, persistDraft);
    await Promise.all([...saveChains.current.values()]);
  }, [persistDraft]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (!isDesktopApp()) {
      const warnBeforeUnload = (event: BeforeUnloadEvent) => {
        if (pendingDrafts.current.size === 0) return;
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', warnBeforeUnload);
      return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }
    const currentWindow = getCurrentWindow();
    void currentWindow.onCloseRequested(async (event) => {
      if (closeInProgress.current) return;
      event.preventDefault();
      closeInProgress.current = true;
      try {
        await flushPendingSaves();
        await Promise.all([...saveChains.current.values()]);
        await currentWindow.close();
      } catch (reason) {
        closeInProgress.current = false;
        setStatus('Save failed · close cancelled');
        setError(reason instanceof Error ? reason.message : 'Unsaved changes could not be saved. The application remains open.');
      }
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not register safe shutdown handling.');
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [flushPendingSaves]);
  
  useEffect(() => {
    const onSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
      if (!activeTab || !activeTab.dirty || !['code', 'text', 'markdown'].includes(activeTab.meta.kind)) return;
      event.preventDefault();
      void persistDraft(activeTab.id, activeTab.draft).catch(() => undefined);
    };
    window.addEventListener('keydown', onSaveShortcut);
    return () => window.removeEventListener('keydown', onSaveShortcut);
  }, [activeTab, persistDraft]);

  function createWorkspace() {
    requestInput('Create workspace', '', 'Workspace name', 'Create workspace', async (name) => {
      const now = Date.now();
      const workspace: Workspace = { id: crypto.randomUUID(), name: name.trim(), createdAt: now, updatedAt: now };
      await db.workspaces.add(workspace);
      await db.preferences.put({ key: 'activeWorkspace', value: workspace.id, updatedAt: now });
      setActiveWorkspaceId(workspace.id);
      setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); setView('workspace');
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
    if (!activeWorkspace) return;
    const target = activeWorkspace;
    const fileCount = files.filter((file) => file.workspaceId === target.id).length;
    const folderCount = folders.filter((folder) => folder.workspaceId === target.id).length;
    const projectCount = projects.filter((project) => project.workspaceId === target.id).length;
    requestConfirmation('Delete workspace?', `Permanently delete “${target.name}” and its ${projectCount} project${projectCount === 1 ? '' : 's'}, ${folderCount} folder${folderCount === 1 ? '' : 's'}, and ${fileCount} file${fileCount === 1 ? '' : 's'}? This cannot be undone.`, 'Delete workspace', async () => {
      const closingTabs = tabs.filter((tab) => tab.meta.workspaceId === target.id);
      await flushPendingSaves();
      const nextWorkspace = await removeWorkspace(db, target.id);
      setTabs((current) => current.filter((tab) => tab.meta.workspaceId !== target.id));
      if (activeTabId && closingTabs.some((tab) => tab.id === activeTabId)) setActiveTabId(null);
      if (activeWorkspaceId === target.id) {
        setActiveWorkspaceId(nextWorkspace.id);
        setActiveProject(null); setSelectedFolder(null); setView('workspace');
      }
      await refresh();
    }, true);
  }

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

  async function handlePickedImport(files: File[], target: ImportTarget) {
    if (!files.length) return;
    setImporting(true);
    try {
      for (const file of files) {
        const meta = await importFile(db, file, { parentFolderId: target.folderId, projectId: target.projectId, workspaceId: target.workspaceId });
        if (['pdf', 'markdown', 'code', 'text', 'viewer'].includes(meta.kind)) await openFile(meta);
      }
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import the selected files.'); }
    finally { setImporting(false); }
  }

  async function openBackup(file: File | undefined) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      requestConfirmation('Restore workspace backup?', 'Restoring replaces the current workspaces, projects, folders, files, and preferences.', 'Restore backup', async () => {
        await flushPendingSaves();
        await importBackup(db, backup);
        setTabs([]); setActiveTabId(null); setActiveProject(null); setSelectedFolder(null);
        const restoredWorkspaces = await db.workspaces.toArray();
        const storedWorkspace = await db.preferences.get('activeWorkspace');
        const selected = restoredWorkspaces.find((workspace) => workspace.id === storedWorkspace?.value)?.id ?? restoredWorkspaces[0]?.id ?? null;
        setWorkspaces(restoredWorkspaces);
        setActiveWorkspaceId(selected);
        if (selected) await db.preferences.put({ key: 'activeWorkspace', value: selected, updatedAt: Date.now() });
        await refresh();
      }, true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to restore this backup.'); }
    finally { if (backupInput.current) backupInput.current.value = ''; }
  }

  async function restoreFromPicker() {
    if (!isDesktopApp()) { backupInput.current?.click(); return; }
    try { await openBackup(await chooseBackupToRestore() ?? undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open the backup picker.'); }
  }

  async function saveWorkspaceBackup() {
    try {
      if (isDesktopApp()) await saveBackupToDesktop(exportBackupStream(db));
      else await downloadBackup(db);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the workspace backup.'); }
  }

  function startImportInto(target: ImportTarget) {
    setImportTarget(target);
    if (isDesktopApp()) { void pickDesktopFiles().then((files) => handlePickedImport(files, target)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not open the file picker.')); return; }
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
    setActiveWorkspaceId(workspaceId);
    setActiveProject(null);
    setSelectedFolder(null);
    setView('workspace');
    setActiveTabId(null);
    setWorkspaceMenuOpen(false);
    await db.preferences.put({ key: 'activeWorkspace', value: workspaceId, updatedAt: Date.now() });
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
      setActiveWorkspaceId(destination.workspaceId);
      setActiveProject(destination.projectId);
      setSelectedFolder(destination.folderId);
      await db.preferences.put({ key: 'activeWorkspace', value: destination.workspaceId, updatedAt: Date.now() });
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
      await saveChains.current.get(meta.id);
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
      await Promise.all(closingTabs.map((tab) => saveChains.current.get(tab.id)));
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
      await Promise.all(projectTabs.map((tab) => saveChains.current.get(tab.id)));
      await softDeleteProject(db, project.id);
      setTabs((current) => current.filter((tab) => !projectTabs.some((tabToClose) => tabToClose.id === tab.id)));
      if (activeProject === project.id) { setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }
      await refresh();
    }, true);
  }

  async function restoreProject(project: Project) {
    await db.projects.update(project.id, { archived: false, updatedAt: Date.now() });
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

  function renderFolder(folder: TreeFolder, depth = 0) {
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
      <button className="tree-main" onClick={() => void openFile(file)}>{typeIcon(file.kind, 15)}<span className="truncate" title={file.name}>{file.name}</span></button>
      <button className="mini-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={15} /></button>
    </div>;
  }

  function renderProjectTree(project: Project) {
    const open = activeProject === project.id;
    const projectTree = buildTree(folders, liveFiles, null, project.id, project.workspaceId);
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
        </div>
        <div className="sidebar-section-heading"><span>PROJECTS</span><button title="New project" onClick={() => void createProject()}><Plus size={15} /></button></div>
        <div className="project-tree">
          {(buildTree(folders, liveFiles, null, null, activeWorkspaceId).length > 0 || liveFiles.some((file) => file.workspaceId === activeWorkspaceId && file.projectId === null && file.parentFolderId === null)) && <div className="sidebar-section-heading workspace-tree-heading"><span>WORKSPACE FILES</span></div>}
          {buildTree(folders, liveFiles, null, null, activeWorkspaceId).map((folder) => renderFolder(folder))}
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
            <button onClick={() => void saveWorkspaceBackup()} title="Save a workspace backup"><Download size={15} /> Backup</button>
            <button onClick={() => void restoreFromPicker()} title="Restore from backup"><Import size={15} /> Restore</button>
          </div>
          <input ref={backupInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void openBackup(event.target.files?.[0])} />
        </div>
      </>}
      {sidebarCollapsed && <div className="collapsed-nav"><button title="Workspace" onClick={() => { setView('workspace'); setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }}><LayoutGrid size={18} /></button><button title="Recent" onClick={() => { setView('recent'); setActiveTabId(null); }}><Clock3 size={18} /></button><button title="Trash" onClick={() => { setView('trash'); setActiveTabId(null); }}><Trash2 size={18} /></button><button title="New project" onClick={() => void createProject()}><Plus size={18} /></button></div>}
    </aside>

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
          </div>}
        </div>
        <div className="topbar-actions">
          <label className="global-search"><Search size={16} /><input placeholder="Search files and notes" value={query} onChange={(event) => { setQuery(event.target.value); setRightPanel('search'); }} /><kbd>⌘ K</kbd></label>
          <div className="app-zoom-controls" title="App zoom: Ctrl+= to increase, Ctrl+- to decrease, Ctrl+0 to reset"><button className="icon-button" aria-label="Decrease app size" title="Decrease app size (Ctrl+-)" onClick={() => setAppZoom((value) => Math.max(0.8, Math.round((value - 0.1) * 100) / 100))}><ZoomOut size={15} /></button><span>{Math.round(appZoom * 100)}%</span><button className="icon-button" aria-label="Increase app size" title="Increase app size (Ctrl+=)" onClick={() => setAppZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 100) / 100))}><ZoomIn size={15} /></button><button className="icon-button" aria-label="Reset app size" title="Reset app size (Ctrl+0)" onClick={() => setAppZoom(1)}><span className="zoom-reset-label">100</span></button></div>
          <button className="icon-button theme-toggle" title={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => void toggleTheme()}>{darkTheme ? <Sun size={16} /> : <Moon size={16} />}</button>
          <span className={`save-status ${status === 'Saved locally' ? 'saved' : ''}`}><span className="status-dot" />{status}</span>
          <button className="icon-button" title="Details" onClick={() => setRightPanel((value) => value === 'details' ? null : 'details')}><Settings2 size={17} /></button>
        </div>
      </header>

      <div className="content-toolbar">
        <div className="toolbar-left">
          <span className="toolbar-caption">{view === 'workspace' ? (selectedFolder ? 'FOLDER' : activeProject ? 'PROJECT FILES' : 'GENERAL WORKSPACE') : view === 'recent' ? 'RECENT' : 'RECYCLE BIN'}</span>
          {view === 'workspace' && <span className="file-count">{visibleFiles.length + currentFolders.length} item{visibleFiles.length + currentFolders.length === 1 ? '' : 's'}</span>}
        </div>
        <div className="toolbar-right">
          {view === 'trash' && trashedFiles.length > 0 && <button className="text-button danger-text" onClick={() => void doEmptyTrash()}><Trash2 size={14} /> Empty trash</button>}
          {view === 'workspace' && activeProjectRecord && !activeProjectRecord.archived && <button className="text-button danger-text" onClick={() => void deleteProject(activeProjectRecord)}><Trash2 size={14} /> Delete project</button>}
          {view === 'workspace' && activeProjectRecord?.archived && <button className="text-button" onClick={() => void restoreProject(activeProjectRecord)}><Archive size={14} /> Restore project</button>}
          {view === 'workspace' && selectedFolder && folders.find((folder) => folder.id === selectedFolder) && <button className="text-button danger-text" onClick={() => void deleteFolder(folders.find((folder) => folder.id === selectedFolder)!)}><Trash2 size={14} /> Delete folder</button>}
          {view === 'workspace' && <>
            <button className="text-button" onClick={() => void createFolderInCurrent()}><FolderPlus size={15} /> New folder</button>
            <button className="text-button" onClick={() => startImportFolderInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={15} /> Import folder</button>
            <button className="text-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button>
            <button className="primary-button" onClick={() => void createWorkspaceFile('code')}><Plus size={16} /> New file</button>
            <button className="icon-button" title="Import files" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={16} /></button>
          </>}
          <input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }; void handleImport(event.target.files, target.folderId, target.projectId, target.workspaceId); setImportTarget(null); }} />
          <input ref={folderInput} className="hidden" type="file" multiple onChange={(event) => { const target = importTarget ?? { folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID }; void handleFolderImport(event.target.files, target); }} />
        </div>
      </div>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}

      {activeTab ? <div className="editor-workspace">
        <div className="tab-strip">
          <div className="tab-list">
            {tabs.map((tab) => <button key={tab.id} className={`file-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>
              {typeIcon(tab.meta.kind, 15)}<span className="truncate" title={tab.meta.name}>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}
              <span role="button" tabIndex={0} className="tab-close" aria-label={`Close ${tab.meta.name}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); closeTab(tab.id); } }}><X size={14} /></span>
            </button>)}
          </div>
            <button className="icon-button tab-plus" title="Import a file" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Plus size={16} /></button>
        </div>
        <div className="editor-titlebar">
          <div className="editor-file-title">{typeIcon(activeTab.meta.kind, 16)}<b title={activeTab.meta.name}>{activeTab.meta.name}</b><span className="title-location" title={`${activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}${activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}`}>{activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}{activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}</span></div>
          <div className="editor-tools">
            {(activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' || activeTab.meta.kind === 'markdown') && <div className="editor-font-controls" title="Editor text size"><button className="icon-button" aria-label="Decrease editor text size" title="Decrease editor text size" onClick={() => setEditorFontSize((value) => Math.max(11, value - 1))}><ZoomOut size={14} /></button><span>{editorFontSize}px</span><button className="icon-button" aria-label="Increase editor text size" title="Increase editor text size" onClick={() => setEditorFontSize((value) => Math.min(24, value + 1))}><ZoomIn size={14} /></button></div>}
            {activeTab.meta.kind === 'markdown' && <button className={`text-button ${activeTab.preview ? 'selected' : ''}`} onClick={() => setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, preview: !tab.preview } : tab))}>{activeTab.preview ? 'Edit note' : 'Preview'}</button>}
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
            {!activeTab.preview && <div className="code-editor markdown-editor"><CodeMirror value={activeTab.draft} height="100%" theme={editorTheme} extensions={[markdown(), editorSyntax]} onChange={(value) => updateDraft(activeTab.id, value)} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true }} /></div>}
            <div className="markdown-preview"><div className="preview-label">PREVIEW</div><article className="prose" style={{ fontSize: `${editorFontSize}px` }}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ code({ className, children, ...props }) {
              const code = String(children).replace(/\n$/, '');
              if (className === 'language-mermaid') return <MermaidDiagram source={code} />;
              return <code className={className} {...props}>{children}</code>;
            } }}>{activeTab.draft}</ReactMarkdown></article></div>
          </div>
        ) : activeTab.meta.kind === 'code' || activeTab.meta.kind === 'text' ? (
          <div className="code-editor"><CodeMirror value={activeTab.draft} height="100%" theme={editorTheme} extensions={[activeTab.meta.kind === 'code' ? (['v', 'sv', 'vh', 'svh'].includes(activeTab.meta.name.split('.').pop()?.toLowerCase() ?? '') ? StreamLanguage.define(verilog) : javascript()) : [], editorSyntax]} onChange={(value) => updateDraft(activeTab.id, value)} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true, closeBrackets: true }} /></div>
        ) : activeTab.meta.kind === 'viewer' ? (
          <Suspense fallback={<div className="loading-state">Loading file viewer…</div>}><ReadOnlyFileViewer fileName={activeTab.meta.name} data={activeTab.data} mimeType={activeTab.meta.mimeType} /></Suspense>
        ) : <div className="unsupported-file"><div className="unsupported-icon"><File size={26} /></div><h2>Preview unavailable</h2><p>This file is saved in your workspace. Download it through a backup or open it in another app.</p><span>{formatSize(activeTab.meta.size)} · {activeTab.meta.mimeType}</span></div>}
        <footer className="editor-footer"><span>{activeTab.meta.kind === 'code' ? 'Code editor' : activeTab.meta.kind === 'text' ? 'Text editor' : activeTab.meta.kind === 'viewer' ? 'Read-only viewer' : activeTab.meta.kind === 'markdown' ? 'Markdown' : activeTab.meta.kind === 'pdf' ? 'PDF document' : 'File'}{activeTab.dirty ? ' · Unsaved changes' : ''}</span><span>{formatSize(activeTab.meta.size)}</span></footer>
      </div> : <div className="workspace-body">
        {tabs.length > 0 && <div className="background-tab-strip"><span>OPEN TABS</span>{tabs.map((tab) => <button key={tab.id} className={`background-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => void openFile(tab.meta)}>{typeIcon(tab.meta.kind, 14)}<span>{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}<span className="background-tab-close" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}><X size={12} /></span></button>)}</div>}
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
          {view === 'workspace' && currentFolders.length > 0 && <>
            {selectedFolder && <div className="folder-contents-heading"><Folder size={14} /> Folders</div>}
            {currentFolders.sort((a, b) => a.name.localeCompare(b.name)).map((folder) => <div className="file-list-row folder-list-row" key={folder.id} draggable onContextMenu={(event) => showContextMenu('folder', folder.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: folder.id, type: 'folder' }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.id, folder.projectId, folder.workspaceId)}>
              <button className="file-name-button" onClick={() => { setSelectedFolder(folder.id); setActiveTabId(null); }}><Folder size={17} className="folder-icon" /><span>{folder.name}</span><small>Folder</small></button><span className="kind-cell">Folder</span><span className="size-cell">—</span><span className="date-cell">{new Date(folder.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.id, event)}><Ellipsis size={16} /></button>
            </div>)}
          </>}
          <div className="list-header"><button onClick={() => { setSort('name'); setSortDesc(sort === 'name' ? !sortDesc : false); }}>Name <ArrowDownUp size={12} /></button><button onClick={() => { setSort('type'); setSortDesc(sort === 'type' ? !sortDesc : false); }}>Kind <ArrowDownUp size={12} /></button><button onClick={() => { setSort('size'); setSortDesc(sort === 'size' ? !sortDesc : false); }}>Size <ArrowDownUp size={12} /></button><button onClick={() => { setSort('updatedAt'); setSortDesc(sort === 'updatedAt' ? !sortDesc : true); }}>Modified <ArrowDownUp size={12} /></button><span /></div>
          {view === 'trash' ? sortedVisible.length === 0 ? <EmptyState title="Trash is empty" message="Files you delete will appear here until you permanently remove them." icon={<Trash2 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
            <button className="file-name-button" onClick={() => void restoreFile(db, file.id).then(refresh)}>{typeIcon(file.kind, 17)}<span>{file.name}</span><small>Deleted {new Date(file.deletedAt!).toLocaleDateString()}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Restore" onClick={() => void restoreFile(db, file.id).then(refresh)}><Archive size={15} /></button>
          </div>) : view === 'recent' ? sortedVisible.length === 0 ? <EmptyState title="No recent files" message="Open a file or import one to start building your workspace." icon={<Clock3 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
            <button className="file-name-button" onClick={() => void openFile(file)}>{typeIcon(file.kind, 17)}<span>{file.name}</span><small>{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Move to trash" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>
          </div>) : sortedVisible.length === 0 && currentFolders.length === 0 ? <EmptyState title={selectedFolder ? 'This folder is empty' : activeProjectRecord ? 'This project is empty' : 'Workspace is empty'} message="Create a note or file, or drag something in from your computer." icon={<FolderTree size={21} />} action={<><button className="primary-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button><button className="text-button" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: activeWorkspaceId ?? DEFAULT_WORKSPACE_ID })}><Import size={15} /> Import</button></>} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
            <button className="file-name-button" onClick={() => void openFile(file)}>{typeIcon(file.kind, 17)}<span>{file.name}</span><small>{file.projectId ? projects.find((project) => project.id === file.projectId)?.name : 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={16} /></button>
          </div>)}
          {view === 'workspace' && <div className="root-drop-hint"><Import size={14} /> Drop files here to import them into {selectedFolder ? 'this folder' : activeProjectRecord?.name ?? 'the workspace'}</div>}
        </div>}
      </div>}
    </main>

    {rightPanel && <aside className="right-panel">
      <div className="right-panel-header"><b>{rightPanel === 'details' ? 'Workspace details' : 'Search results'}</b><button className="icon-button" onClick={() => setRightPanel(null)}><X size={16} /></button></div>
      {rightPanel === 'details' ? <div className="details-content">
        <div className="details-card"><span className="details-icon"><HardDrive size={18} /></span><div><b>Stored on this device</b><span>Only you can access these files.</span></div></div>
        <div className="detail-row"><span>Total files</span><b>{liveFiles.length}</b></div><div className="detail-row"><span>Projects</span><b>{activeProjects.length}</b></div><div className="detail-row"><span>Folders</span><b>{folders.filter((folder) => folder.workspaceId === activeWorkspaceId).length}</b></div><div className="detail-row"><span>Storage used</span><b>{formatSize(liveFiles.reduce((sum, item) => sum + item.size, 0))}</b></div>
        <div className="details-tip"><Bookmark size={15} /> Make regular backups to keep a copy of your workspace.</div><button className="outline-button full-width" onClick={() => void saveWorkspaceBackup()}><Download size={15} /> Save backup</button>
      </div> : <div className="search-results-panel">
        {!query.trim() ? <div className="search-placeholder"><Search size={22} /><b>Search your workspace</b><span>Search file names and text in notes or code.</span></div> : searchResults.length === 0 ? <div className="search-placeholder"><Search size={22} /><b>No results found</b><span>Try a different word or phrase.</span></div> : searchResults.map(({ file, text }) => <button className="search-result" key={file.id} onClick={() => void openFile(file)}>
          <span className="search-result-title">{typeIcon(file.kind, 15)}<b>{file.name}</b></span><span className="search-result-location">{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</span><span className="search-result-snippet">{text.slice(Math.max(0, text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 42), text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) + 100) || file.name}</span>
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

    {dialog && <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
      <form className="app-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); void submitDialog(); }}>
        <div className="move-dialog-header"><div><div className="modal-eyebrow">WORKSPACE</div><h2>{dialog.title}</h2></div><button type="button" className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><X size={17} /></button></div>
        {dialog.message && <p className="move-dialog-copy">{dialog.message}</p>}
        {dialog.mode === 'input' && <input className="dialog-input" autoFocus value={dialog.value ?? ''} placeholder={dialog.placeholder} onChange={(event) => setDialog((current) => current ? { ...current, value: event.target.value } : current)} onKeyDown={(event) => { if (event.key === 'Escape') setDialog(null); }} />}
        <div className="move-dialog-footer"><button type="button" className="text-button" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className={dialog.destructive ? 'danger-button' : 'primary-button'} disabled={dialog.mode === 'input' && !dialog.value?.trim()}>{dialog.confirmLabel}</button></div>
      </form>
    </div>}

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

function EmptyState({ title, message, icon, action }: { title: string; message: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{message}</p>{action && <div className="empty-actions">{action}</div>}</div>;
}
