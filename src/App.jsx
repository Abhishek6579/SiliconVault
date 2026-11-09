
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity, Archive, Bell, Bookmark, ChevronDown, ChevronRight,
  Code2, Cpu, FileCode2, FileText, Folder, FolderOpen,
  HardDrive, Home, Layers3, LayoutGrid, List, Plus, Search,
  Settings, Upload, X, Download, Trash2, ArrowUpRight,
  Database, ShieldCheck, Sparkles, Eye, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import PDFWorkspace from './components/PDFWorkspace.jsx';
import { db, initializeVault, createFolder, createProject } from './lib/db';
import AdvancedEditor from './components/AdvancedEditor.jsx';
import ExplorerTree from './components/ExplorerTree.jsx';

const navigation = [
  {
    title: 'Workspace',
    items: [
      { name: 'Overview', icon: Home },
      { name: 'Documents', icon: FileText },
      { name: 'Code Studio', icon: Code2 },
      { name: 'Library', icon: Archive },
      { name: 'Projects', icon: Layers3 }
    ]
  },
  {
    title: 'Manage',
    items: [
      { name: 'Activity', icon: Activity },
      { name: 'Bookmarks', icon: Bookmark }
    ]
  }
];

const getKind = (name) => {
  const ext = name.split('.').pop().toLowerCase();

  if (ext === 'v') return 'verilog';
  if (['sv', 'svh'].includes(ext)) return 'systemverilog';
  if (['md', 'markdown', 'txt'].includes(ext)) return 'markdown';
  if (ext === 'pdf') return 'pdf';

  return 'file';
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const kindName = (kind) => ({
  markdown: 'Markdown',
  verilog: 'Verilog',
  systemverilog: 'SystemVerilog',
  pdf: 'PDF',
  file: 'File'
}[kind] || kind);

function App() {
  const [active, setActive] = useState('Overview');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('list');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => {
    const saved = Number(localStorage.getItem('siliconvault-active-workspace'));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  });
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('siliconvault-sidebar-collapsed') === 'true');

  const [openDocuments, setOpenDocuments] = useState([]);
  const [openPDFs, setOpenPDFs] = useState([]);
  const [activePDFId, setActivePDFId] = useState(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState(null);
  const [minimizedTabKeys, setMinimizedTabKeys] = useState([]);
  const [tabsHydratedFor, setTabsHydratedFor] = useState(null);

  const uploadRef = useRef(null);

  const workspaces = useLiveQuery(() => db.workspaces.orderBy('name').toArray(), [], []);
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const documents = useLiveQuery(
    () => activeWorkspaceId == null ? [] : db.documents.where('workspaceId').equals(activeWorkspaceId).sortBy('updatedAt').then(rows => rows.reverse()),
    [activeWorkspaceId],
    []
  );

  const assets = useLiveQuery(
    () => activeWorkspaceId == null ? [] : db.assets.where('workspaceId').equals(activeWorkspaceId).toArray(),
    [activeWorkspaceId],
    []
  );

  const projects = useLiveQuery(
    () => activeWorkspaceId == null ? [] : db.projects.where('workspaceId').equals(activeWorkspaceId).toArray(),
    [activeWorkspaceId],
    []
  );

  const folders = useLiveQuery(
    () => activeWorkspaceId == null ? [] : db.folders.where('workspaceId').equals(activeWorkspaceId).sortBy('name'),
    [activeWorkspaceId],
    []
  );

  useEffect(() => {
    initializeVault().catch(console.error);
  }, []);

  useEffect(() => {
    if (!workspaces.length) return;
    const valid = workspaces.some(workspace => workspace.id === activeWorkspaceId);
    if (!valid) setActiveWorkspaceId(workspaces[0].id);
  }, [workspaces, activeWorkspaceId]);

  useEffect(() => {
    if (activeWorkspaceId != null) localStorage.setItem('siliconvault-active-workspace', String(activeWorkspaceId));
  }, [activeWorkspaceId]);

  useEffect(() => {
    localStorage.setItem('siliconvault-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    setSelectedFolderId(null);
    setSelectedProjectId(null);
    setOpenDocuments([]);
    setOpenPDFs([]);
    setActivePDFId(null);
    setActiveWorkspaceTab(null);
    setMinimizedTabKeys([]);
    setTabsHydratedFor(null);
  }, [activeWorkspaceId]);

  // Restore open tabs per workspace without copying document contents into localStorage.
  useEffect(() => {
    if (activeWorkspaceId == null || tabsHydratedFor === activeWorkspaceId) return;
    let cancelled = false;

    async function restoreTabs() {
      const storageKey = `siliconvault-open-tabs-${activeWorkspaceId}`;
      let saved = [];
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!Array.isArray(saved)) saved = [];
      } catch {
        saved = [];
      }

      const restoredDocuments = [];
      const restoredPDFs = [];
      const restoredMinimized = [];

      for (const item of saved) {
        if (!item || !['doc', 'pdf'].includes(item.type) || item.id == null) continue;
        const record = item.type === 'doc'
          ? await db.documents.get(item.id)
          : await db.assets.get(item.id);
        if (!record || record.workspaceId !== activeWorkspaceId) continue;
        if (item.type === 'doc') restoredDocuments.push(record);
        else if (record.mimeType === 'application/pdf' || record.name?.toLowerCase().endsWith('.pdf')) restoredPDFs.push(record);
        if (item.minimized) restoredMinimized.push(`${item.type}:${item.id}`);
      }

      if (cancelled) return;
      setOpenDocuments(restoredDocuments);
      setOpenPDFs(restoredPDFs);
      setMinimizedTabKeys(restoredMinimized);
      const savedActive = localStorage.getItem(`siliconvault-active-tab-${activeWorkspaceId}`);
      const validKeys = new Set([
        ...restoredDocuments.map(item => `doc:${item.id}`),
        ...restoredPDFs.map(item => `pdf:${item.id}`)
      ]);
      const nextActive = validKeys.has(savedActive) && !restoredMinimized.includes(savedActive)
        ? savedActive
        : restoredDocuments[0] ? `doc:${restoredDocuments[0].id}`
          : restoredPDFs[0] ? `pdf:${restoredPDFs[0].id}` : null;
      setActiveWorkspaceTab(nextActive);
      setActivePDFId(nextActive?.startsWith('pdf:') ? Number(nextActive.slice(4)) : null);
      setTabsHydratedFor(activeWorkspaceId);
    }

    restoreTabs().catch(error => {
      console.error('Could not restore workspace tabs:', error);
      if (!cancelled) setTabsHydratedFor(activeWorkspaceId);
    });

    return () => { cancelled = true; };
  }, [activeWorkspaceId, tabsHydratedFor]);

  // Persist tab references and minimized state; document bodies remain safely in IndexedDB.
  useEffect(() => {
    if (activeWorkspaceId == null || tabsHydratedFor !== activeWorkspaceId) return;
    const tabs = [
      ...openDocuments.map(item => ({ type: 'doc', id: item.id, minimized: minimizedTabKeys.includes(`doc:${item.id}`) })),
      ...openPDFs.map(item => ({ type: 'pdf', id: item.id, minimized: minimizedTabKeys.includes(`pdf:${item.id}`) }))
    ];
    localStorage.setItem(`siliconvault-open-tabs-${activeWorkspaceId}`, JSON.stringify(tabs));
    if (activeWorkspaceTab) localStorage.setItem(`siliconvault-active-tab-${activeWorkspaceId}`, activeWorkspaceTab);
    else localStorage.removeItem(`siliconvault-active-tab-${activeWorkspaceId}`);
  }, [activeWorkspaceId, tabsHydratedFor, openDocuments, openPDFs, activeWorkspaceTab, minimizedTabKeys]);

  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const selectedFolderScope = useMemo(() => {
    if (!selectedFolderId) return null;

    const descendants = new Set([selectedFolderId]);
    let changed = true;

    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parentFolderId != null && descendants.has(folder.parentFolderId) && !descendants.has(folder.id)) {
          descendants.add(folder.id);
          changed = true;
        }
      }
    }

    return descendants;
  }, [folders, selectedFolderId]);

  const getFolderPath = (folderId) => {
    const names = [];
    let current = folders.find(folder => folder.id === folderId);

    while (current) {
      names.unshift(current.name);
      current = folders.find(folder => folder.id === current.parentFolderId);
    }

    return names.join(' / ') || 'Unsorted';
  };

  const filteredDocuments=useMemo(()=>documents.filter(doc=>{const searchable=[doc.title,getFolderPath(doc.folderId),kindName(doc.kind),...(doc.tags||[])].join(' ').toLowerCase();const matchesSearch=searchable.includes(query.toLowerCase());const matchesFolder=!selectedFolderScope||selectedFolderScope.has(doc.folderId);const matchesSection=active==='Code Studio'?['verilog','systemverilog'].includes(doc.kind):active==='Bookmarks'?Boolean(doc.bookmarked):true;return matchesSearch&&matchesFolder&&matchesSection;}),[documents,query,selectedFolderScope,active,folders]);

  const totalBytes = assets.reduce(
    (sum, asset) => sum + (asset.size || 0),
    documents.reduce(
      (sum, doc) => sum + new Blob([doc.content || '']).size,
      0
    )
  );

  const openEditor = (doc) => {
    setOpenDocuments(current => current.some(item => item.id === doc.id)
      ? current
      : [...current, doc]);
    const key = `doc:${doc.id}`;
    setMinimizedTabKeys(current => current.filter(item => item !== key));
    setActiveWorkspaceTab(key);
  };

  const closeWorkspaceTab = (key) => {
    const [type, rawId] = key.split(':');
    const id = Number(rawId);
    const nextDocuments = type === 'doc' ? openDocuments.filter(item => item.id !== id) : openDocuments;
    const nextPDFs = type === 'pdf' ? openPDFs.filter(item => item.id !== id) : openPDFs;
    setOpenDocuments(nextDocuments);
    setOpenPDFs(nextPDFs);
    setMinimizedTabKeys(current => current.filter(item => item !== key));
    if (activeWorkspaceTab === key) {
      const next = [
        ...nextDocuments.map(item => `doc:${item.id}`),
        ...nextPDFs.map(item => `pdf:${item.id}`)
      ].find(item => !minimizedTabKeys.includes(item)) ?? null;
      setActiveWorkspaceTab(next);
      setActivePDFId(next?.startsWith('pdf:') ? Number(next.slice(4)) : null);
    }
  };

  const minimizeWorkspaceTab = (key) => {
    setMinimizedTabKeys(current => current.includes(key) ? current : [...current, key]);
    if (activeWorkspaceTab === key) {
      const next = [
        ...openDocuments.filter(item => `doc:${item.id}` !== key).map(item => `doc:${item.id}`),
        ...openPDFs.filter(item => `pdf:${item.id}` !== key).map(item => `pdf:${item.id}`)
      ].find(item => !minimizedTabKeys.includes(item)) ?? null;
      setActiveWorkspaceTab(next);
      setActivePDFId(next?.startsWith('pdf:') ? Number(next.slice(4)) : null);
    }
  };

  const activateWorkspaceTab = (key) => {
    setMinimizedTabKeys(current => current.filter(item => item !== key));
    setActiveWorkspaceTab(key);
    setActivePDFId(key.startsWith('pdf:') ? Number(key.slice(4)) : null);
  };

  const createDocument = async (kind) => {
    const now = new Date().toISOString();

    const title = {
      markdown: 'Untitled note',
      verilog: 'Untitled.v',
      systemverilog: 'Untitled.sv'
    }[kind];

    const content = kind === 'markdown'
      ? '# Untitled note\n\nStart writing here.'
      : '';

    const id = await db.documents.add({
      title,
      kind,
      folderId: selectedFolderId ?? null,
      workspaceId: activeWorkspaceId,
      content,
      tags: [],
      bookmarked: false,
      createdAt: now,
      updatedAt: now
    });

    const doc = await db.documents.get(id);

    setMenuOpen(false);
    setActive(kind === 'markdown' ? 'Documents' : 'Code Studio');

    openEditor(doc);
  };


  async function saveDocument(documentData) {
    const now = new Date().toISOString();

    const data = {
      ...documentData,
      workspaceId: documentData.workspaceId ?? activeWorkspaceId,
      updatedAt: now,
      createdAt: documentData.createdAt ?? now
    };

    if (data.id) {
      await db.documents.update(data.id, data);
      setOpenDocuments(current => current.map(doc => doc.id === data.id ? data : doc));
      return data;
    }

    const { id, ...newDocument } = data;
    const newId = await db.documents.add(newDocument);

    return {
      ...newDocument,
      id: newId
    };
  }


  const importFiles = async (fileList) => {
    const files = Array.from(fileList || []);

    for (const file of files) {
      const kind = getKind(file.name);
      const now = new Date().toISOString();

      if (['markdown', 'verilog', 'systemverilog'].includes(kind)) {
        const content = await file.text();

        await db.documents.add({
          title: file.name,
          kind,
          folderId: selectedFolderId ?? null,
          workspaceId: activeWorkspaceId,
          content,
          tags: [],
          bookmarked: false,
          createdAt: now,
          updatedAt: now
        });
      } else {
        await db.assets.add({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          blob: file,
          folderId: selectedFolderId ?? null,
          workspaceId: activeWorkspaceId,
          createdAt: now
        });
      }
    }

    notify(`${files.length} file(s) imported successfully`);

    if (uploadRef.current) {
      uploadRef.current.value = '';
    }
  };

  const exportDocument = (doc) => {
    const extension = {
      markdown: 'md',
      verilog: 'v',
      systemverilog: 'sv'
    }[doc.kind] || 'txt';

    const blob = new Blob(
      [doc.content || ''],
      { type: 'text/plain;charset=utf-8' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = doc.title.includes('.')
      ? doc.title
      : `${doc.title}.${extension}`;

    link.click();
    URL.revokeObjectURL(url);
  };

  const exportBackup = async () => {
    const [allDocuments,allFolders,allProjects]=await Promise.all([db.documents.toArray(),db.folders.toArray(),db.projects.toArray()]);
    const backup={application:'SiliconVault',version:2,exportedAt:new Date().toISOString(),documents:allDocuments,folders:allFolders,projects:allProjects};

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'siliconvault-backup.json';
    link.click();

    URL.revokeObjectURL(url);

    notify('Document backup exported');
  };

  const deleteDocument = async (id) => {
    if (!window.confirm('Delete this document permanently?')) return;

    await db.documents.delete(id);

    if (openDocuments.some(doc => doc.id === id)) {
      closeWorkspaceTab(`doc:${id}`);
    }

    notify('Document deleted');
  };

  const downloadAsset = (asset) => {
    const url = URL.createObjectURL(asset.blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = asset.name;
    link.click();

    URL.revokeObjectURL(url);
  };
  const openPDF = (asset) => {
    setOpenPDFs(current => current.some(pdf => pdf.id === asset.id) ? current : [...current, asset]);
    const key = `pdf:${asset.id}`;
    setMinimizedTabKeys(current => current.filter(item => item !== key));
    setActivePDFId(asset.id);
    setActiveWorkspaceTab(key);
  };

  const importPDFToWorkspace = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      notify('Please select a PDF file');
      return;
    }

    const now = new Date().toISOString();

    const id = await db.assets.add({
      name: file.name,
      mimeType: 'application/pdf',
      size: file.size,
      blob: file,
      folderId: selectedFolderId ?? null,
      workspaceId: activeWorkspaceId,
      createdAt: now
    });

    const asset = await db.assets.get(id);

    setOpenPDFs(current => [...current, asset]);
    setActivePDFId(id);
    setActiveWorkspaceTab(`pdf:${id}`);

    notify(`${file.name} opened successfully`);
  };

  const closePDF = (id) => {
    closeWorkspaceTab(`pdf:${id}`);
  };

  const deleteAsset = async (id) => {
    if (!window.confirm('Delete this imported file?')) return;

    if (openPDFs.some(pdf => pdf.id === id)) closeWorkspaceTab(`pdf:${id}`);
    await db.assets.delete(id);
    notify('File deleted');
  };

  const pageTitle = active === 'Overview'
    ? 'Workspace overview'
    : active;

  const isDocumentPage = [
    'Documents',
    'Code Studio',
    'Bookmarks'
  ].includes(active);

  return (
    <div className="app-shell">

      {/* SIDEBAR */}

      <aside className={`sidebar ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>

        <div className="brand">
          <div className="brand-mark">
            <Cpu size={18} />
          </div>

          <span>
            Silicon<span className="brand-light">Vault</span>
          </span>

          <span className="local-dot" />
          <button className="sidebar-toggle" title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => { setSidebarCollapsed(value => !value); setWorkspaceMenuOpen(false); }}>
            {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        <div className="workspace-switch-wrap">
          <button className="workspace-switch" onClick={() => setWorkspaceMenuOpen(value => !value)} aria-expanded={workspaceMenuOpen}>
            <div className="workspace-avatar">{(activeWorkspace?.name || 'W').slice(0, 2).toUpperCase()}</div>
            <div className="workspace-meta"><b>{activeWorkspace?.name || 'Loading workspace'}</b><small>Local · This device</small></div>
            <ChevronDown size={14} />
          </button>
          {workspaceMenuOpen && <div className="workspace-menu">
            <div className="workspace-menu-label">SWITCH WORKSPACE</div>
            {workspaces.map(workspace => <button key={workspace.id} className={workspace.id === activeWorkspaceId ? 'selected' : ''} onClick={() => {
              setActiveWorkspaceId(workspace.id); setWorkspaceMenuOpen(false); setActive('Overview'); setQuery('');
            }}>
              <span className="workspace-menu-avatar">{workspace.name.slice(0, 1).toUpperCase()}</span>
              <span><b>{workspace.name}</b><small>{workspace.description || 'Local workspace'}</small></span>
              {workspace.id === activeWorkspaceId && <span className="workspace-current-dot" />}
            </button>)}
            <div className="workspace-menu-divider" />
            <button className="workspace-create" onClick={async () => {
              const name = window.prompt('New workspace name (e.g. School, Projects, Personal)');
              if (!name?.trim()) return;
              try {
                const now = new Date().toISOString();
                const id = await db.workspaces.add({ name: name.trim(), description: 'Local workspace', createdAt: now, updatedAt: now });
                setActiveWorkspaceId(id); setWorkspaceMenuOpen(false); setActive('Overview');
                notify(`Workspace “${name.trim()}” created`);
              } catch (error) { notify(error.message || 'Could not create workspace'); }
            }}><Plus size={14} /> Create workspace</button>
          </div>}
        </div>

        <div className="side-scroll">

          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>

              <div className="nav-label">{group.title}</div>

              {group.items.map((item) => (
                <button
                  key={item.name}
                  className={`nav-item ${active === item.name ? 'active' : ''
                    }`}
                  onClick={() => {
                    setActive(item.name);
                                  }}
                >
                  <item.icon size={16} />
                  <span>{item.name}</span>
                </button>
              ))}

            </div>
          ))}

          <ExplorerTree
            folders={folders}
            projects={projects}
            selectedFolderId={selectedFolderId}
            selectedProjectId={selectedProjectId}
            onSelectFolder={(folder) => {
              setActive('Documents');
                        setSelectedFolderId(folder.id);
              setSelectedProjectId(folder.projectId ?? null);
            }}
            onSelectProject={(project) => {
              setActive('Documents');
                        setSelectedProjectId(project.id);
              setSelectedFolderId(project.rootFolderId ?? null);
            }}
            onCreateFolder={async (parentFolderId, projectId) => {
              const name = window.prompt('Folder name');
              if (!name?.trim()) return;
              try {
                await createFolder({ name, parentFolderId, projectId, workspaceId: activeWorkspaceId });
                notify('Folder created');
              } catch (error) {
                notify(error.message || 'Could not create folder');
              }
            }}
            onCreateProject={async () => {
              const name = window.prompt('Project name');
              if (!name?.trim()) return;
              try {
                await createProject({ name, workspaceId: activeWorkspaceId });
                notify('Project created');
              } catch (error) {
                notify(error.message || 'Could not create project');
              }
            }}
          />

        </div>

        <div className="sidebar-bottom">

          <button className="nav-item" onClick={exportBackup}>
            <Download size={16} />
            <span>Export backup</span>
          </button>

          <div className="storage-card">

            <div className="storage-head">
              <HardDrive size={14} />
              <span>Local storage</span>
              <span className="storage-state">READY</span>
            </div>

            <div className="storage-bar">
              <i style={{ width: '8%' }} />
            </div>

            <small>{formatSize(totalBytes)} tracked</small>

          </div>

          <div className="profile">
            <div className="profile-avatar">A</div>

            <div>
              <b>Personal vault</b>
              <small>Private workspace</small>
            </div>

            <ShieldCheck size={16} />
          </div>

        </div>

      </aside>

      {/* MAIN CONTENT */}

      <main className="main-area">

        <header className="topbar">

          <div className="breadcrumbs">
            <span>SiliconVault</span>
            <ChevronRight size={13} />
            <b>{pageTitle}</b>
          </div>

          <div className="top-actions">

            <div className="searchbox">
              <Search size={15} />

              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search this vault..."
              />
            </div>

            <button
              className="icon-btn"
              onClick={() => notify('Your local vault is ready')}
            >
              <Bell size={17} />
            </button>

            <button className="avatar-mini">A</button>

          </div>

        </header>

        {(openDocuments.length > 0 || openPDFs.length > 0) && (
          <div className="unified-tab-bar" role="tablist" aria-label="Open workspace files">
            {[...openDocuments.map(item => ({ key: `doc:${item.id}`, type: 'doc', id: item.id, title: item.title, kind: item.kind })),
              ...openPDFs.map(item => ({ key: `pdf:${item.id}`, type: 'pdf', id: item.id, title: item.name, kind: 'pdf' }))]
              .map(tab => {
                const minimized = minimizedTabKeys.includes(tab.key);
                const activeTab = activeWorkspaceTab === tab.key;
                return (
                  <div key={tab.key} className={`unified-tab ${activeTab ? 'active' : ''} ${minimized ? 'minimized' : ''}`}>
                    <button className="unified-tab-select" role="tab" aria-selected={activeTab} onClick={() => activateWorkspaceTab(tab.key)} title={tab.title}>
                      {tab.type === 'pdf' ? <FileText size={14} /> : tab.kind === 'markdown' ? <FileText size={14} /> : <FileCode2 size={14} />}
                      <span>{tab.title}</span>
                    </button>
                    <button className="unified-tab-action" onClick={() => minimized ? activateWorkspaceTab(tab.key) : minimizeWorkspaceTab(tab.key)} title={minimized ? 'Restore tab' : 'Minimize tab'}>
                      {minimized ? <Eye size={13} /> : <span>−</span>}
                    </button>
                    <button className="unified-tab-action close" onClick={() => closeWorkspaceTab(tab.key)} title="Close tab" aria-label={`Close ${tab.title}`}>
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
          </div>
        )}

        <div className="page-content" style={{ display: activeWorkspaceTab ? 'none' : undefined }}>

          <div className="page-heading">

            <div>
              <div className="eyebrow">
                LOCAL ENGINEERING WORKSPACE
                <span className="eyebrow-line" />
              </div>

              <h1>{pageTitle}</h1>

              <p className="subheading">
                Your engineering knowledge, organized in one place.
              </p>
            </div>

            <div className="heading-actions">

              <input
                ref={uploadRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.md,.markdown,.txt,.v,.sv,.svh,.png,.jpg,.jpeg,.webp"
                onChange={(e) => importFiles(e.target.files)}
              />

              <button
                className="button secondary"
                onClick={() => uploadRef.current.click()}
              >
                <Upload size={15} />
                Import files
              </button>

              <div className="relative">

                <button
                  className="button primary"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <Plus size={16} />
                  Create new
                  <ChevronDown size={14} />
                </button>

                {menuOpen && (
                  <div className="dropdown">

                    <button onClick={() => createDocument('markdown')}>
                      <FileText size={15} />
                      New Markdown note
                    </button>

                    <button onClick={() => createDocument('verilog')}>
                      <FileCode2 size={15} />
                      New Verilog file
                    </button>

                    <button onClick={() => createDocument('systemverilog')}>
                      <Code2 size={15} />
                      New SystemVerilog file
                    </button>

                  </div>
                )}

              </div>

            </div>

          </div>

          {/* OVERVIEW */}

          {active === 'Overview' && (

            <>

              <section className="stats-grid">

                <StatCard
                  title="Documents"
                  value={documents.length}
                  description="Saved in this browser"
                  icon={FileText}
                />

                <StatCard
                  title="Code files"
                  value={documents.filter(d =>
                    ['verilog', 'systemverilog'].includes(d.kind)
                  ).length}
                  description="Verilog · SystemVerilog"
                  icon={Code2}
                />

                <StatCard
                  title="Library files"
                  value={assets.length}
                  description="PDFs and attachments"
                  icon={Archive}
                />

                <StatCard
                  title="Storage used"
                  value={formatSize(totalBytes)}
                  description="Estimated content size"
                  icon={HardDrive}
                />

              </section>

              <section className="section-block">

                <div className="section-heading">

                  <div>
                    <h2>Recent files</h2>
                    <p>Pick up where you left off</p>
                  </div>

                  <div className="view-controls">

                    <button
                      className={view === 'list' ? 'selected' : ''}
                      onClick={() => setView('list')}
                    >
                      <List size={15} />
                    </button>

                    <button
                      className={view === 'grid' ? 'selected' : ''}
                      onClick={() => setView('grid')}
                    >
                      <LayoutGrid size={15} />
                    </button>

                    <button
                      className="text-button"
                      onClick={() => setActive('Documents')}
                    >
                      View all <ArrowUpRight size={14} />
                    </button>

                  </div>

                </div>

                <DocumentList
                  documents={filteredDocuments.slice(0, 6)}
                  view={view}
                  openEditor={openEditor}
                  exportDocument={exportDocument}
                  deleteDocument={deleteDocument}
                />

              </section>

            </>

          )}

          {/* DOCUMENTS AND CODE */}

          {isDocumentPage && (

            <section className="section-block">

              <div className="section-heading">

                <div>
                  <h2>{active}</h2>
                  <p>{filteredDocuments.length} items · {selectedFolderId ? getFolderPath(selectedFolderId) : selectedProjectId ? projects.find(project => project.id === selectedProjectId)?.name : 'All folders'}</p>
                </div>

                <div className="view-controls">

                  <button
                    className={view === 'list' ? 'selected' : ''}
                    onClick={() => setView('list')}
                  >
                    <List size={15} />
                  </button>

                  <button
                    className={view === 'grid' ? 'selected' : ''}
                    onClick={() => setView('grid')}
                  >
                    <LayoutGrid size={15} />
                  </button>

                </div>

              </div>

              <DocumentList
                documents={filteredDocuments}
                folders={folders}
                getFolderPath={getFolderPath}
                view={view}
                openEditor={openEditor}
                exportDocument={exportDocument}
                deleteDocument={deleteDocument}
              />

            </section>

          )}

          {/* LIBRARY */}

          {active === 'Library' && (

            <section className="section-block">

              <div className="section-heading">
                <div>
                  <h2>File library</h2>
                  <p>{assets.length} imported files</p>
                </div>
              </div>

              {!assets.length ? (

                <EmptyState
                  icon={Archive}
                  title="Your library is empty"
                  description="Import PDFs and other files to add them here."
                />

              ) : (

                <div className="asset-list">

                  {assets.map(asset => (

                    <div className="asset-row" key={asset.id}>

                      <div className="file-icon pdf">
                        <FileText size={18} />
                      </div>

                      <div className="asset-info">
                        <b>{asset.name}</b>
                        <small>
                          {formatSize(asset.size)} · {asset.mimeType}
                        </small>
                      </div>
                      {asset.mimeType === 'application/pdf' && (
                        <button
                          className="icon-btn"
                          onClick={() => openPDF(asset)}
                          title="Open PDF"
                        >
                          <Eye size={15} />
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        onClick={() => downloadAsset(asset)}
                        title="Download"
                      >
                        <Download size={15} />

                      </button>

                      <button
                        className="icon-btn"
                        onClick={() => deleteAsset(asset.id)}
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>

                    </div>

                  ))}

                </div>

              )}

            </section>

          )}

          {/* PROJECTS */}

          {active === 'Projects' && (

            <section className="section-block">

              <div className="section-heading">
                <div>
                  <h2>Engineering projects</h2>
                  <p>Your active workspaces</p>
                </div>
              </div>

              <div className="project-grid">

                {projects.map(project => (

                  <div className="project-card" key={project.id}>

                    <div className="project-top">
                      <Cpu size={19} />
                      <span className="type-pill">{project.status}</span>
                    </div>

                    <b>{project.name}</b>
                    <small>{project.detail}</small>

                    <div className="progress-meta">
                      <span>Progress</span>
                      <b>{project.progress}%</b>
                    </div>

                    <div className="progress-track">
                      <i style={{ width: `${project.progress}%` }} />
                    </div>

                  </div>

                ))}

              </div>

            </section>

          )}

          {/* SETTINGS */}

          {active === 'Settings' && (

            <section className="section-block">

              <div className="project-card">

                <Database size={22} />

                <h2>Local database</h2>

                <p>
                  Your notes and imported files are stored in this
                  browser profile using IndexedDB.
                </p>

                <button className="button secondary" onClick={exportBackup}>
                  <Download size={15} />
                  Export backup
                </button>

              </div>

            </section>

          )}

          {active === 'Activity' && (
            <EmptyState
              icon={Activity}
              title="Activity timeline coming later"
              description="Document history will be implemented in a future phase."
            />
          )}

          <footer className="footer">
            <span>SiliconVault <i>v0.2.0</i></span>
            <span>
              <span className="green-dot" />
              Local-first · IndexedDB
            </span>
          </footer>

        </div>

        {(openDocuments.length > 0 || openPDFs.length > 0) && (
          <section className="unified-workspace-stage" aria-label="Open file workspace">
            {openDocuments.map(doc => (
              <div key={doc.id} className="unified-document-panel" style={{ display: activeWorkspaceTab === `doc:${doc.id}` ? 'flex' : 'none' }}>
                <AdvancedEditor
                  document={doc}
                  folders={folders}
                  getFolderPath={getFolderPath}
                  onSave={saveDocument}
                  onClose={() => closeWorkspaceTab(`doc:${doc.id}`)}
                  embedded
                />
              </div>
            ))}
            {openPDFs.length > 0 && (
              <div className="unified-pdf-panel" style={{ display: activeWorkspaceTab?.startsWith('pdf:') ? 'flex' : 'none' }}>
                <PDFWorkspace
                  workspaceId={activeWorkspaceId}
                  files={openPDFs}
                  requestedActiveId={activePDFId}
                  onCloseFile={closePDF}
                  onImportPDF={importPDFToWorkspace}
                  onOpenExistingPDF={openPDF}
                  unified
                />
              </div>
            )}
          </section>
        )}

      </main>


      {notice && (

        <div className="toast">
          <Sparkles size={15} />
          {notice}

          <button onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>

      )}

    </div>
  );
}

function StatCard({ title, value, description, icon: Icon }) {
  return (
    <div className="stat-card">

      <div className="stat-top">
        <span>{title}</span>
        <div className="stat-icon">
          <Icon size={17} />
        </div>
      </div>

      <strong>{value}</strong>
      <small>{description}</small>

    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="empty-state">
      <Icon size={23} />
      <b>{title}</b>
      <span>{description}</span>
    </div>
  );
}

function DocumentList({
  documents,
  folders = [],
  getFolderPath,
  view,
  openEditor,
  exportDocument,
  deleteDocument
}) {
  if (!documents.length) {
    return (
      <EmptyState
        icon={Search}
        title="No documents found"
        description="Create a document or change your search."
      />
    );
  }

  if (view === 'grid') {
    return (
      <div className="file-grid">

        {documents.map(doc => (

          <div className="file-tile" key={doc.id}>

            <button
              className="tile-open"
              onClick={() => openEditor(doc)}
            >
              <div className="tile-top">
                <span className="file-icon code">
                  {doc.kind === 'verilog' ? 'V' :
                    doc.kind === 'systemverilog' ? 'SV' : 'MD'}
                </span>

                <span className="type-pill">{kindName(doc.kind)}</span>
              </div>

              <b>{doc.title}</b>

              <small>
                {getFolderPath?.(doc.folderId) || 'Unsorted'}
              </small>
            </button>

            <div className="tile-foot">
              <span>
                {new Date(doc.updatedAt).toLocaleDateString()}
              </span>

              <button onClick={() => exportDocument(doc)}>
                <Download size={14} />
              </button>

              <button onClick={() => deleteDocument(doc.id)}>
                <Trash2 size={14} />
              </button>
            </div>

          </div>

        ))}

      </div>
    );
  }

  return (
    <div className="file-table">

      <div className="table-head">
        <span>NAME</span>
        <span>LOCATION</span>
        <span>TYPE</span>
        <span>MODIFIED</span>
        <span>SIZE</span>
        <span />
      </div>

      {documents.map(doc => (

        <div className="file-row" key={doc.id}>

          <button
            className="file-name"
            onClick={() => openEditor(doc)}
          >
            <span className="file-icon code">
              {doc.kind === 'verilog' ? 'V' :
                doc.kind === 'systemverilog' ? 'SV' : 'MD'}
            </span>

            <b>{doc.title}</b>
          </button>

          <span className="muted">
            {getFolderPath?.(doc.folderId) || 'Unsorted'}
          </span>

          <span>
            <i className="type-pill">{kindName(doc.kind)}</i>
          </span>

          <span className="muted">
            {new Date(doc.updatedAt).toLocaleDateString()}
          </span>

          <span className="muted mono">
            {formatSize(new Blob([doc.content || '']).size)}
          </span>

          <span className="row-actions">

            <button onClick={() => exportDocument(doc)}>
              <Download size={14} />
            </button>

            <button onClick={() => deleteDocument(doc.id)}>
              <Trash2 size={14} />
            </button>

          </span>

        </div>

      ))}

    </div>
  );
}

export default App;
