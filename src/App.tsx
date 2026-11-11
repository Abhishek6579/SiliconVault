import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Archive, ArrowDownUp, BookOpen, Check, ChevronDown, ChevronRight, Code2, Command, Download,
  Ellipsis, File, FileCode2, FilePlus2, FileText, Folder, FolderPlus, FolderTree, HardDrive,
  Import, LayoutGrid, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2,
  Trash2, X, Clock3, Bookmark, Pencil, Sparkles, Save, FileArchive, ExternalLink,
} from 'lucide-react';
import { db } from './storage/database';
import { createFolder, moveFile, moveFolder, softDeleteProject } from './storage/hierarchy';
import { countFolderItems, createTextFile, deleteFolderContents, emptyTrash, getFolderSubtreeIds, importFile, kindForFile, renameFile, restoreFile, saveFileText, softDeleteFile } from './storage/files';
import { downloadBackup, importBackup } from './storage/backup';
import type { FileContent, FileKind, FileMeta, Folder as FolderRecord, Project } from './storage/types';
const PdfReader = lazy(() => import('./PdfReader'));

type View = 'workspace' | 'recent' | 'trash';
interface Tab { id: string; meta: FileMeta; data: Blob | string; draft: string; dirty: boolean; preview: boolean; }
interface TreeFolder { record: FolderRecord; children: TreeFolder[]; files: FileMeta[]; }
interface MermaidDiagramProps { source: string; }

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

function buildTree(folders: FolderRecord[], files: FileMeta[], parentId: string | null, projectId: string | null): TreeFolder[] {
  return folders.filter((folder) => folder.parentFolderId === parentId && folder.projectId === projectId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((record) => ({ record, children: buildTree(folders, files, record.id, projectId), files: files.filter((file) => file.parentFolderId === record.id && file.projectId === projectId) }));
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
  const [contents, setContents] = useState<FileContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('workspace');
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'type' | 'size' | 'updatedAt'>('name');
  const [sortDesc, setSortDesc] = useState(false);
  const [rightPanel, setRightPanel] = useState<'details' | 'search' | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [status, setStatus] = useState('All changes saved');
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveChains = useRef(new Map<string, Promise<void>>());
  const draftRevisions = useRef(new Map<string, number>());

  const refresh = useCallback(async () => {
    try {
      const [nextFiles, nextFolders, nextProjects, nextContents] = await Promise.all([
        db.files.toArray(), db.folders.toArray(), db.projects.toArray(), db.contents.toArray(),
      ]);
      setFiles(nextFiles);
      setFolders(nextFolders);
      setProjects(nextProjects);
      setContents(nextContents);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open the local workspace.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); return () => { for (const timer of saveTimers.current.values()) clearTimeout(timer); }; }, [refresh]);
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

  const activeProjectRecord = projects.find((project) => project.id === activeProject) ?? null;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const liveFiles = files.filter((file) => file.deletedAt === null);
  const trashedFiles = files.filter((file) => file.deletedAt !== null).sort((a, b) => b.deletedAt! - a.deletedAt!);
  const activeFolders = folders.filter((folder) => folder.projectId === activeProject);
  const rootFiles = liveFiles.filter((file) => file.parentFolderId === null && file.projectId === activeProject);
  const tree = useMemo(() => buildTree(folders, liveFiles, null, activeProject), [folders, liveFiles, activeProject]);

  const searchResults = useMemo(() => {
    const textById = new Map(contents.map((item) => [item.fileId, typeof item.data === 'string' ? item.data : '']));
    if (!query.trim()) return [];
    const needle = query.toLocaleLowerCase();
    return liveFiles.filter((file) => `${file.name} ${textById.get(file.id) ?? ''}`.toLocaleLowerCase().includes(needle))
      .map((file) => ({ file, text: textById.get(file.id) ?? '' }));
  }, [contents, liveFiles, query]);

  const openFile = useCallback(async (meta: FileMeta) => {
    const existing = tabs.find((tab) => tab.id === meta.id);
    if (existing) { setActiveTabId(meta.id); return; }
    const content = await db.contents.get(meta.id);
    if (!content) { setError(`The content for “${meta.name}” is missing.`); return; }
    const data = (meta.kind === 'markdown' || meta.kind === 'code') && content.data instanceof Blob ? await content.data.text() : content.data;
    const draft = fileText(data);
    setTabs((current) => [...current, { id: meta.id, meta, data, draft, dirty: false, preview: meta.kind === 'markdown' }]);
    setActiveTabId(meta.id);
    setError('');
  }, [tabs]);

  const updateDraft = useCallback((id: string, draft: string) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, draft, dirty: true } : tab));
    setStatus('Saving…');
    const revision = (draftRevisions.current.get(id) ?? 0) + 1;
    draftRevisions.current.set(id, revision);
    const previousSave = saveChains.current.get(id) ?? Promise.resolve();
    const save = previousSave.catch(() => undefined).then(() => saveFileText(db, id, draft)).then(() => {
      if (draftRevisions.current.get(id) === revision) {
        setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, dirty: false, meta: { ...tab.meta, size: new TextEncoder().encode(draft).byteLength, updatedAt: Date.now() } } : tab));
        setStatus('Saved locally');
      }
    }).catch((reason: unknown) => {
      if (draftRevisions.current.get(id) === revision) { setStatus('Could not save'); setError(reason instanceof Error ? reason.message : 'Unable to save changes.'); }
    });
    saveChains.current.set(id, save);
    const previous = saveTimers.current.get(id);
    if (previous) clearTimeout(previous);
    saveTimers.current.set(id, setTimeout(() => {
      saveTimers.current.delete(id);
      void refresh();
    }, 350));
  }, [refresh]);

  async function createProject() {
    const name = window.prompt('Project name');
    if (!name?.trim()) return;
    const now = Date.now();
    const project = { id: crypto.randomUUID(), name: name.trim(), archived: false, createdAt: now, updatedAt: now };
    await db.projects.add(project);
    await refresh();
    setActiveProject(project.id);
    setSelectedFolder(null);
    setView('workspace');
  }

  async function createFolderInCurrent() {
    const name = window.prompt('Folder name');
    if (!name?.trim()) return;
    try {
      const folder = await createFolder(db, name.trim(), selectedFolder, activeProject);
      setExpanded((current) => new Set(current).add(folder.id));
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create folder.'); }
  }

  async function createNewFile(kind: 'markdown' | 'code') {
    const name = window.prompt(kind === 'markdown' ? 'Note name' : 'Code file name', kind === 'markdown' ? 'Untitled note.md' : 'Untitled.sv');
    if (!name?.trim()) return;
    const text = kind === 'markdown' ? `# ${name.replace(/\.(md|markdown)$/i, '')}\n\n` : '';
    const meta = await createTextFile(db, name.trim(), text, { parentFolderId: selectedFolder, projectId: activeProject, kind });
    await refresh();
    await openFile(meta);
  }

  async function handleImport(fileList: FileList | null, destinationFolderId = selectedFolder, destinationProjectId = activeProject) {
    if (!fileList?.length) return;
    setImporting(true);
    try {
      for (const file of Array.from(fileList)) {
        const meta = await importFile(db, file, { parentFolderId: destinationFolderId, projectId: destinationProjectId });
        if (kindForFile(file.name, file.type) === 'pdf' || kindForFile(file.name, file.type) === 'markdown' || kindForFile(file.name, file.type) === 'code') await openFile(meta);
      }
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import the selected file.'); }
    finally { setImporting(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function openBackup(file: File | undefined) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      if (!window.confirm('Restore this backup? The current workspace will be replaced.')) return;
      await Promise.all(tabs.map((tab) => saveChains.current.get(tab.id)));
      await importBackup(db, backup);
      setTabs([]); setActiveTabId(null); setActiveProject(null); setSelectedFolder(null);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to restore this backup.'); }
    finally { if (backupInput.current) backupInput.current.value = ''; }
  }

  async function renameItem(meta: FileMeta | FolderRecord | Project) {
    const name = window.prompt('Rename', meta.name);
    if (!name?.trim() || name.trim() === meta.name) return;
    if ('kind' in meta) await renameFile(db, meta.id, name.trim());
    else if ('archived' in meta) await db.projects.update(meta.id, { name: name.trim(), updatedAt: Date.now() });
    else await db.folders.update(meta.id, { name: name.trim(), updatedAt: Date.now() });
    if ('kind' in meta) setTabs((current) => current.map((tab) => tab.id === meta.id ? { ...tab, meta: { ...tab.meta, name: name.trim(), kind: kindForFile(name.trim(), tab.meta.mimeType) } } : tab));
    await refresh();
  }

  async function deleteFile(meta: FileMeta) {
    if (!window.confirm(`Move “${meta.name}” to Trash? It can be restored later.`)) return;
    await saveChains.current.get(meta.id);
    await softDeleteFile(db, meta.id);
    setTabs((current) => current.filter((tab) => tab.id !== meta.id));
    if (activeTabId === meta.id) setActiveTabId(null);
    await refresh();
  }

  async function deleteFolder(folder: FolderRecord) {
    const count = await countFolderItems(db, folder.id);
    if (!window.confirm(`Delete “${folder.name}” and ${count} item${count === 1 ? '' : 's'} inside it? This cannot be undone.`)) return;
    const folderIds = await getFolderSubtreeIds(db, folder.id);
    const closingTabs = tabs.filter((tab) => tab.meta.parentFolderId !== null && folderIds.includes(tab.meta.parentFolderId));
    await Promise.all(closingTabs.map((tab) => saveChains.current.get(tab.id)));
    await deleteFolderContents(db, folder.id);
    setTabs((current) => current.filter((tab) => !closingTabs.some((closing) => closing.id === tab.id)));
    if (closingTabs.some((tab) => tab.id === activeTabId)) setActiveTabId(tabs.find((tab) => !closingTabs.some((closing) => closing.id === tab.id))?.id ?? null);
    if (selectedFolder && folderIds.includes(selectedFolder)) setSelectedFolder(folder.parentFolderId);
    await refresh();
  }

  async function deleteProject(project: Project) {
    const itemCount = files.filter((file) => file.projectId === project.id && file.deletedAt === null).length + folders.filter((folder) => folder.projectId === project.id).length;
    if (!window.confirm(`Delete project “${project.name}” and its ${itemCount} item${itemCount === 1 ? '' : 's'}? Files will move to Trash.`)) return;
    const projectTabs = tabs.filter((tab) => tab.meta.projectId === project.id);
    await Promise.all(projectTabs.map((tab) => saveChains.current.get(tab.id)));
    await softDeleteProject(db, project.id);
    setTabs((current) => current.filter((tab) => !projectTabs.some((tabToClose) => tabToClose.id === tab.id)));
    if (activeProject === project.id) { setActiveProject(null); setSelectedFolder(null); setActiveTabId(null); }
    await refresh();
  }

  async function restoreProject(project: Project) {
    await db.projects.update(project.id, { archived: false, updatedAt: Date.now() });
    setActiveProject(project.id);
    setSelectedFolder(null);
    setView('workspace');
    await refresh();
  }

  async function doEmptyTrash() {
    if (!trashedFiles.length || !window.confirm(`Permanently delete ${trashedFiles.length} trashed file${trashedFiles.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const trashIds = new Set(trashedFiles.map((file) => file.id));
    const closingTabs = tabs.filter((tab) => trashIds.has(tab.id));
    await Promise.all(closingTabs.map((tab) => saveChains.current.get(tab.id)));
    await emptyTrash(db);
    setTabs((current) => current.filter((tab) => !trashIds.has(tab.id)));
    if (activeTabId && trashIds.has(activeTabId)) setActiveTabId(tabs.find((tab) => !trashIds.has(tab.id))?.id ?? null);
    await refresh();
  }

  function closeTab(id: string) {
    const tab = tabs.find((item) => item.id === id);
    if (tab?.dirty && !window.confirm(`“${tab.meta.name}” is still saving. Close it anyway?`)) return;
    const remaining = tabs.filter((item) => item.id !== id);
    setTabs(remaining);
    if (activeTabId === id) setActiveTabId(remaining.at(-1)?.id ?? null);
  }

  function toggleFolder(id: string) {
    setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function handleDrop(event: DragEvent, folderId: string | null, destinationProjectId = activeProject) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files.length > 0) {
      void handleImport(event.dataTransfer.files, folderId, destinationProjectId);
      return;
    }
    const payload = event.dataTransfer.getData('application/x-workbench-item');
    if (!payload) return;
    const { id, type } = JSON.parse(payload) as { id: string; type: 'file' | 'folder' };
    void (async () => {
      try {
        if (type === 'file') await moveFile(db, id, folderId, destinationProjectId);
        else await moveFolder(db, id, folderId, destinationProjectId);
        await refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not move this item.'); }
    })();
  }

  function renderFolder(folder: TreeFolder, depth = 0) {
    const isOpen = expanded.has(folder.record.id);
    const selected = selectedFolder === folder.record.id;
    return <div key={folder.record.id}>
        <div className={`tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: `${12 + depth * 16}px` }} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: folder.record.id, type: 'folder' }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.record.id)}>
        <button className="tree-main" onClick={() => { setSelectedFolder(folder.record.id); setView('workspace'); }} onDoubleClick={() => toggleFolder(folder.record.id)}>
          <span className="twisty" onClick={(event) => { event.stopPropagation(); toggleFolder(folder.record.id); }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          {isOpen ? <Folder size={16} className="folder-icon open" /> : <Folder size={16} className="folder-icon" />}
          <span className="truncate">{folder.record.name}</span>
        </button>
        <button className="mini-action" title="Folder options" onClick={() => void renameItem(folder.record)}><Ellipsis size={15} /></button>
      </div>
      {isOpen && <>
        {folder.children.map((child) => renderFolder(child, depth + 1))}
        {folder.files.sort((a, b) => a.name.localeCompare(b.name)).map((file) => renderFileTree(file, depth + 1))}
      </>}
    </div>;
  }

  function renderFileTree(file: FileMeta, depth = 0) {
    return <div key={file.id} className={`tree-row file-row ${activeTabId === file.id ? 'selected' : ''}`} style={{ paddingLeft: `${31 + depth * 16}px` }} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
      <button className="tree-main" onClick={() => void openFile(file)}>{typeIcon(file.kind, 15)}<span className="truncate">{file.name}</span></button>
      <button className="mini-action" title="Rename file" onClick={() => void renameItem(file)}><Ellipsis size={15} /></button>
    </div>;
  }

  function renderProjectTree(project: Project) {
    const open = activeProject === project.id;
    const projectTree = buildTree(folders, liveFiles, null, project.id);
    const filesAtRoot = liveFiles.filter((file) => file.projectId === project.id && file.parentFolderId === null);
    return <div key={project.id}>
      <div className={`tree-row project-row ${open ? 'selected' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, null, project.id)}>
        <button className="tree-main" onClick={() => { setActiveProject(project.id); setSelectedFolder(null); setView('workspace'); }}>
          <span className="twisty">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <span className="project-dot" />
          <span className="truncate">{project.name}</span>
        </button>
        <button className="mini-action" title="Project options" onClick={() => void renameItem(project)}><Ellipsis size={15} /></button>
      </div>
      {open && <div className="project-children" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, null)}>
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
    : liveFiles.filter((file) => file.projectId === activeProject && file.parentFolderId === selectedFolder);
  const sortedVisible = view === 'recent' || view === 'trash' ? [...visibleFiles] : [...visibleFiles].sort((a, b) => {
    const order = sort === 'type' ? a.kind.localeCompare(b.kind) : sort === 'size' ? a.size - b.size : sort === 'updatedAt' ? a.updatedAt - b.updatedAt : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sortDesc ? -order : order;
  });

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Command size={19} strokeWidth={2.2} /></div>
        {!sidebarCollapsed && <div className="brand-copy"><b>Workbench</b><span>Engineering workspace</span></div>}
        <button className="icon-button sidebar-toggle" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
      </div>

      {!sidebarCollapsed && <>
        <div className="sidebar-primary">
          <button className={`nav-item ${view === 'workspace' ? 'active' : ''}`} onClick={() => { setView('workspace'); setSelectedFolder(null); }}><LayoutGrid size={16} /> Workspace</button>
          <button className={`nav-item ${view === 'recent' ? 'active' : ''}`} onClick={() => setView('recent')}><Clock3 size={16} /> Recent <span className="nav-count">{liveFiles.length}</span></button>
          <button className={`nav-item ${view === 'trash' ? 'active' : ''}`} onClick={() => setView('trash')}><Trash2 size={16} /> Trash {trashedFiles.length > 0 && <span className="nav-count">{trashedFiles.length}</span>}</button>
        </div>
        <div className="sidebar-section-heading"><span>PROJECTS</span><button title="New project" onClick={() => void createProject()}><Plus size={15} /></button></div>
        <div className="project-tree">
          {(buildTree(folders, liveFiles, null, null).length > 0 || liveFiles.some((file) => file.projectId === null && file.parentFolderId === null)) && <div className="sidebar-section-heading workspace-tree-heading"><span>WORKSPACE FILES</span></div>}
          {buildTree(folders, liveFiles, null, null).map((folder) => renderFolder(folder))}
          {liveFiles.filter((file) => file.projectId === null && file.parentFolderId === null).map((file) => renderFileTree(file))}
          {projects.filter((project) => !project.archived).map(renderProjectTree)}
          {projects.filter((project) => !project.archived).length === 0 && <div className="sidebar-empty">Your projects<br /><span>show up here</span></div>}
          {projects.some((project) => project.archived) && <>
            <div className="sidebar-section-heading archived-heading"><span>ARCHIVED</span></div>
            {projects.filter((project) => project.archived).map(renderProjectTree)}
          </>}
        </div>
        <div className="sidebar-bottom">
          <div className="storage-line"><HardDrive size={15} /><span>Stored on this device</span></div>
          <div className="storage-meter"><i style={{ width: `${Math.min(100, files.reduce((sum, item) => sum + item.size, 0) / (250 * 1024 * 1024) * 100)}%` }} /></div>
          <span className="storage-caption">{formatSize(files.reduce((sum, item) => sum + item.size, 0))} used</span>
          <div className="sidebar-actions">
            <button onClick={() => void downloadBackup(db)} title="Download a workspace backup"><Download size={15} /> Backup</button>
            <button onClick={() => backupInput.current?.click()} title="Restore from backup"><Import size={15} /> Restore</button>
          </div>
          <input ref={backupInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void openBackup(event.target.files?.[0])} />
        </div>
      </>}
      {sidebarCollapsed && <div className="collapsed-nav"><button title="Workspace" onClick={() => setView('workspace')}><LayoutGrid size={18} /></button><button title="Recent" onClick={() => setView('recent')}><Clock3 size={18} /></button><button title="Trash" onClick={() => setView('trash')}><Trash2 size={18} /></button><button title="New project" onClick={() => void createProject()}><Plus size={18} /></button></div>}
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs">
          <span>{view === 'trash' ? 'Trash' : view === 'recent' ? 'Recent files' : activeProjectRecord?.name ?? 'Workspace'}</span>
          {selectedFolder && <><ChevronRight size={14} /><b>{folders.find((folder) => folder.id === selectedFolder)?.name}</b></>}
        </div>
        <div className="topbar-actions">
          <label className="global-search"><Search size={16} /><input placeholder="Search files and notes" value={query} onChange={(event) => { setQuery(event.target.value); setRightPanel('search'); }} /><kbd>⌘ K</kbd></label>
          <span className={`save-status ${status === 'Saved locally' ? 'saved' : ''}`}><span className="status-dot" />{status}</span>
          <button className="icon-button" title="Details" onClick={() => setRightPanel((value) => value === 'details' ? null : 'details')}><Settings2 size={17} /></button>
        </div>
      </header>

      <div className="content-toolbar">
        <div className="toolbar-left">
          <span className="toolbar-caption">{view === 'workspace' ? (selectedFolder ? 'FOLDER' : activeProject ? 'PROJECT FILES' : 'GENERAL WORKSPACE') : view === 'recent' ? 'RECENT' : 'RECYCLE BIN'}</span>
          {view === 'workspace' && <span className="file-count">{visibleFiles.length} item{visibleFiles.length === 1 ? '' : 's'}</span>}
        </div>
        <div className="toolbar-right">
          {view === 'trash' && trashedFiles.length > 0 && <button className="text-button danger-text" onClick={() => void doEmptyTrash()}><Trash2 size={14} /> Empty trash</button>}
          {view === 'workspace' && activeProjectRecord && !activeProjectRecord.archived && <button className="text-button danger-text" onClick={() => void deleteProject(activeProjectRecord)}><Trash2 size={14} /> Delete project</button>}
          {view === 'workspace' && activeProjectRecord?.archived && <button className="text-button" onClick={() => void restoreProject(activeProjectRecord)}><Archive size={14} /> Restore project</button>}
          {view === 'workspace' && selectedFolder && folders.find((folder) => folder.id === selectedFolder) && <button className="text-button danger-text" onClick={() => void deleteFolder(folders.find((folder) => folder.id === selectedFolder)!)}><Trash2 size={14} /> Delete folder</button>}
          {view === 'workspace' && <>
            <button className="text-button" onClick={() => void createFolderInCurrent()}><FolderPlus size={15} /> New folder</button>
            <button className="text-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button>
            <button className="primary-button" onClick={() => void createWorkspaceFile('code')}><Plus size={16} /> New file</button>
            <button className="icon-button" title="Import files" onClick={() => fileInput.current?.click()}><Import size={16} /></button>
          </>}
          <input ref={fileInput} className="hidden" type="file" multiple onChange={(event) => void handleImport(event.target.files)} />
        </div>
      </div>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}

      {activeTab ? <div className="editor-workspace">
        <div className="tab-strip">
          <div className="tab-list">
            {tabs.map((tab) => <button key={tab.id} className={`file-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => setActiveTabId(tab.id)}>
              {typeIcon(tab.meta.kind, 15)}<span className="truncate">{tab.meta.name}</span>{tab.dirty && <i className="dirty-dot" />}
              <span role="button" tabIndex={0} className="tab-close" aria-label={`Close ${tab.meta.name}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); closeTab(tab.id); } }}><X size={14} /></span>
            </button>)}
          </div>
          <button className="icon-button tab-plus" title="Import a file" onClick={() => fileInput.current?.click()}><Plus size={16} /></button>
        </div>
        <div className="editor-titlebar">
          <div className="editor-file-title">{typeIcon(activeTab.meta.kind, 16)}<b>{activeTab.meta.name}</b><span className="title-location">{activeTab.meta.projectId ? projects.find((project) => project.id === activeTab.meta.projectId)?.name : 'Workspace'}{activeTab.meta.parentFolderId ? ` / ${folders.find((folder) => folder.id === activeTab.meta.parentFolderId)?.name ?? ''}` : ''}</span></div>
          <div className="editor-tools">
            {activeTab.meta.kind === 'markdown' && <button className={`text-button ${activeTab.preview ? 'selected' : ''}`} onClick={() => setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, preview: !tab.preview } : tab))}>{activeTab.preview ? 'Edit note' : 'Preview'}</button>}
            <button className="icon-button" title="Rename" onClick={() => void renameItem(activeTab.meta)}><Pencil size={15} /></button>
            <button className="icon-button" title="Move to trash" onClick={() => void deleteFile(activeTab.meta)}><Trash2 size={15} /></button>
          </div>
        </div>
        {activeTab.meta.kind === 'pdf' ? <Suspense fallback={<div className="loading-state">Loading PDF tools…</div>}><PdfReader data={activeTab.data} title={activeTab.meta.name} /></Suspense> : activeTab.meta.kind === 'markdown' ? (
          <div className={`note-layout ${activeTab.preview ? 'preview-only' : ''}`}>
            {!activeTab.preview && <div className="code-editor markdown-editor"><CodeMirror value={activeTab.draft} height="100%" extensions={[markdown()]} onChange={(value) => updateDraft(activeTab.id, value)} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true }} /></div>}
            <div className="markdown-preview"><div className="preview-label">PREVIEW</div><article className="prose"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ code({ className, children, ...props }) {
              const code = String(children).replace(/\n$/, '');
              if (className === 'language-mermaid') return <MermaidDiagram source={code} />;
              return <code className={className} {...props}>{children}</code>;
            } }}>{activeTab.draft}</ReactMarkdown></article></div>
          </div>
        ) : activeTab.meta.kind === 'code' ? (
          <div className="code-editor"><CodeMirror value={activeTab.draft} height="100%" extensions={[activeTab.meta.name.match(/\.(sv|v)$/i) ? StreamLanguage.define(verilog) : javascript()]} onChange={(value) => updateDraft(activeTab.id, value)} basicSetup={{ lineNumbers: true, foldGutter: true, bracketMatching: true, closeBrackets: true }} /></div>
        ) : <div className="unsupported-file"><div className="unsupported-icon"><File size={26} /></div><h2>Preview unavailable</h2><p>This file is saved in your workspace. Download it through a backup or open it in another app.</p><span>{formatSize(activeTab.meta.size)} · {activeTab.meta.mimeType}</span></div>}
        <footer className="editor-footer"><span>{activeTab.meta.kind === 'code' ? 'Code editor' : activeTab.meta.kind === 'markdown' ? 'Markdown' : activeTab.meta.kind === 'pdf' ? 'PDF document' : 'File'}{activeTab.dirty ? ' · Unsaved changes' : ''}</span><span>{formatSize(activeTab.meta.size)}</span></footer>
      </div> : <div className="workspace-body">
        {view === 'workspace' && !activeProject && !selectedFolder ? <div className="welcome-page">
          <div className="welcome-kicker"><Sparkles size={15} /> LOCAL ENGINEERING WORKSPACE</div>
          <h1>Your work, in one place.</h1>
          <p>Keep technical notes, PDFs and source files organized on this device.</p>
          <div className="welcome-actions"><button className="primary-button large" onClick={() => void createProject()}><Plus size={17} /> Create a project</button><button className="text-button large" onClick={() => fileInput.current?.click()}><Import size={16} /> Import files</button></div>
          <div className="feature-grid">
            <button className="feature-card" onClick={() => void createWorkspaceFile('markdown')}><div className="feature-icon note"><BookOpen size={18} /></div><b>Technical notes</b><span>Markdown with math and diagrams</span><Plus size={15} className="feature-plus" /></button>
            <button className="feature-card" onClick={() => void createWorkspaceFile('code')}><div className="feature-icon code"><Code2 size={18} /></div><b>Source files</b><span>Write and save code locally</span><Plus size={15} className="feature-plus" /></button>
            <button className="feature-card" onClick={() => fileInput.current?.click()}><div className="feature-icon pdf"><FileText size={18} /></div><b>Reference PDFs</b><span>Read and search your documents</span><Plus size={15} className="feature-plus" /></button>
          </div>
          <div className="privacy-note"><HardDrive size={15} /> Your files stay in this browser on this device.</div>
        </div> : <div className="file-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selectedFolder)}>
          <div className="list-header"><button onClick={() => { setSort('name'); setSortDesc(sort === 'name' ? !sortDesc : false); }}>Name <ArrowDownUp size={12} /></button><button onClick={() => { setSort('type'); setSortDesc(sort === 'type' ? !sortDesc : false); }}>Kind <ArrowDownUp size={12} /></button><button onClick={() => { setSort('size'); setSortDesc(sort === 'size' ? !sortDesc : false); }}>Size <ArrowDownUp size={12} /></button><button onClick={() => { setSort('updatedAt'); setSortDesc(sort === 'updatedAt' ? !sortDesc : true); }}>Modified <ArrowDownUp size={12} /></button><span /></div>
          {view === 'trash' ? sortedVisible.length === 0 ? <EmptyState title="Trash is empty" message="Files you delete will appear here until you permanently remove them." icon={<Trash2 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
            <button className="file-name-button" onClick={() => void restoreFile(db, file.id).then(refresh)}>{typeIcon(file.kind, 17)}<span>{file.name}</span><small>Deleted {new Date(file.deletedAt!).toLocaleDateString()}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Restore" onClick={() => void restoreFile(db, file.id).then(refresh)}><Archive size={15} /></button>
          </div>) : view === 'recent' ? sortedVisible.length === 0 ? <EmptyState title="No recent files" message="Open a file or import one to start building your workspace." icon={<Clock3 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
            <button className="file-name-button" onClick={() => void openFile(file)}>{typeIcon(file.kind, 17)}<span>{file.name}</span><small>{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Move to trash" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>
          </div>) : sortedVisible.length === 0 ? <EmptyState title={selectedFolder ? 'This folder is empty' : activeProjectRecord ? 'This project is empty' : 'Workspace is empty'} message="Create a note or file, or drag something in from your computer." icon={<FolderTree size={21} />} action={<><button className="primary-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button><button className="text-button" onClick={() => fileInput.current?.click()}><Import size={15} /> Import</button></>} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-workbench-item', JSON.stringify({ id: file.id, type: 'file' }))}>
            <button className="file-name-button" onClick={() => void openFile(file)}>{typeIcon(file.kind, 17)}<span>{file.name}</span><small>{file.projectId ? projects.find((project) => project.id === file.projectId)?.name : 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Move to trash" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>
          </div>)}
          {view === 'workspace' && <div className="root-drop-hint"><Import size={14} /> Drop files here to import them into {selectedFolder ? 'this folder' : activeProjectRecord?.name ?? 'the workspace'}</div>}
        </div>}
      </div>}
    </main>

    {rightPanel && <aside className="right-panel">
      <div className="right-panel-header"><b>{rightPanel === 'details' ? 'Workspace details' : 'Search results'}</b><button className="icon-button" onClick={() => setRightPanel(null)}><X size={16} /></button></div>
      {rightPanel === 'details' ? <div className="details-content">
        <div className="details-card"><span className="details-icon"><HardDrive size={18} /></span><div><b>Stored on this device</b><span>Only you can access these files.</span></div></div>
        <div className="detail-row"><span>Total files</span><b>{liveFiles.length}</b></div><div className="detail-row"><span>Projects</span><b>{projects.filter((item) => !item.archived).length}</b></div><div className="detail-row"><span>Folders</span><b>{folders.length}</b></div><div className="detail-row"><span>Storage used</span><b>{formatSize(files.reduce((sum, item) => sum + item.size, 0))}</b></div>
        <div className="details-tip"><Bookmark size={15} /> Make regular backups to keep a copy of your workspace.</div><button className="outline-button full-width" onClick={() => void downloadBackup(db)}><Download size={15} /> Download backup</button>
      </div> : <div className="search-results-panel">
        {!query.trim() ? <div className="search-placeholder"><Search size={22} /><b>Search your workspace</b><span>Search file names and text in notes or code.</span></div> : searchResults.length === 0 ? <div className="search-placeholder"><Search size={22} /><b>No results found</b><span>Try a different word or phrase.</span></div> : searchResults.map(({ file, text }) => <button className="search-result" key={file.id} onClick={() => void openFile(file)}>
          <span className="search-result-title">{typeIcon(file.kind, 15)}<b>{file.name}</b></span><span className="search-result-location">{projects.find((project) => project.id === file.projectId)?.name ?? 'Workspace'}</span><span className="search-result-snippet">{text.slice(Math.max(0, text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 42), text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) + 100) || file.name}</span>
        </button>)}
        {query.trim() && searchResults.length > 0 && <div className="search-count">{searchResults.length} matching file{searchResults.length === 1 ? '' : 's'}</div>}
      </div>}
    </aside>}

    {loading && <div className="startup-screen"><div className="brand-mark"><Command size={19} /></div><span>Opening your workspace…</span></div>}
    {importing && <div className="busy-pill"><span className="spinner" /> Importing files…</div>}
  </div>;
}

function EmptyState({ title, message, icon, action }: { title: string; message: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{message}</p>{action && <div className="empty-actions">{action}</div>}</div>;
}
