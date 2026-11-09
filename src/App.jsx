
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity, Archive, Bell, Bookmark, ChevronDown, ChevronRight,
  Code2, Cpu, FileCode2, FileText, Folder, FolderOpen,
  HardDrive, Home, Layers3, LayoutGrid, List, Plus, Search,
  Settings, Upload, X, Download, Trash2, ArrowUpRight,
  Database, ShieldCheck, Sparkles, Eye
} from 'lucide-react';
import PDFWorkspace from './components/PDFWorkspace.jsx';
import { db, initializeVault } from './lib/db';
import AdvancedEditor from './components/AdvancedEditor.jsx';

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
  const [selectedCollection, setSelectedCollection] = useState(null);

  const [editorDoc, setEditorDoc] = useState(null);
  const [openPDFs, setOpenPDFs] = useState([]);
  const [activePDFId, setActivePDFId] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');

  const uploadRef = useRef(null);

  const collections = useLiveQuery(
    () => db.collections.toArray(), [], []
  );

  const documents = useLiveQuery(
    () => db.documents.orderBy('updatedAt').reverse().toArray(),
    [],
    []
  );

  const assets = useLiveQuery(
    () => db.assets.toArray(), [], []
  );

  const projects = useLiveQuery(
    () => db.projects.toArray(), [], []
  );

  useEffect(() => {
    initializeVault().catch(console.error);
  }, []);

  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const collection = collections.find(
        (item) => item.id === doc.collectionId
      );

      const searchable = [
        doc.title,
        collection?.name || '',
        kindName(doc.kind),
        ...(doc.tags || [])
      ].join(' ').toLowerCase();

      const matchesSearch = searchable.includes(query.toLowerCase());

      const matchesCollection =
        !selectedCollection ||
        doc.collectionId === selectedCollection;

      const matchesSection =
        active === 'Code Studio'
          ? ['verilog', 'systemverilog'].includes(doc.kind)
          : active === 'Bookmarks'
            ? Boolean(doc.bookmarked)
            : true;

      return matchesSearch && matchesCollection && matchesSection;
    });
  }, [documents, collections, query, selectedCollection, active]);

  const totalBytes = assets.reduce(
    (sum, asset) => sum + (asset.size || 0),
    documents.reduce(
      (sum, doc) => sum + new Blob([doc.content || '']).size,
      0
    )
  );

  const openEditor = (doc) => {
    setEditorDoc(doc);
    setDraftTitle(doc.title);
    setDraftContent(doc.content || '');
  };

  const closeEditor = () => {
    setEditorDoc(null);
  };

  const createDocument = async (kind) => {
    const now = new Date().toISOString();

    const defaultCollection = collections[0]?.id;

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
      collectionId: defaultCollection,
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
      updatedAt: now,
      createdAt: documentData.createdAt ?? now
    };

    if (data.id) {
      await db.documents.update(data.id, data);
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
          collectionId: collections[0]?.id,
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
          collectionId: collections[0]?.id,
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
    const [allDocuments, allCollections, allProjects] =
      await Promise.all([
        db.documents.toArray(),
        db.collections.toArray(),
        db.projects.toArray()
      ]);

    const backup = {
      application: 'SiliconVault',
      version: 1,
      exportedAt: new Date().toISOString(),
      documents: allDocuments,
      collections: allCollections,
      projects: allProjects
    };

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

    if (editorDoc?.id === id) {
      closeEditor();
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
    setOpenPDFs(current => {
      if (current.some(pdf => pdf.id === asset.id)) {
        return current;
      }

      return [...current, asset];
    });

    setActivePDFId(asset.id);
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
      collectionId: collections[0]?.id,
      createdAt: now
    });

    const asset = await db.assets.get(id);

    setOpenPDFs(current => [...current, asset]);
    setActivePDFId(id);

    notify(`${file.name} opened successfully`);
  };

  const closePDF = (id) => {
    setOpenPDFs(current =>
      current.filter(pdf => pdf.id !== id)
    );
  };

  const deleteAsset = async (id) => {
    if (!window.confirm('Delete this imported file?')) return;

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

      <aside className="sidebar">

        <div className="brand">
          <div className="brand-mark">
            <Cpu size={18} />
          </div>

          <span>
            Silicon<span className="brand-light">Vault</span>
          </span>

          <span className="local-dot" />
        </div>

        <div className="workspace-switch">
          <div className="workspace-avatar">SV</div>

          <div className="workspace-meta">
            <b>Personal workspace</b>
            <small>Local · This device</small>
          </div>

          <ChevronDown size={14} />
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
                    setSelectedCollection(null);
                  }}
                >
                  <item.icon size={16} />
                  <span>{item.name}</span>
                </button>
              ))}

            </div>
          ))}

          <div className="nav-group">

            <div className="nav-label">Collections</div>

            {collections.map((collection) => (
              <button
                key={collection.id}
                className={`nav-item folder-nav ${selectedCollection === collection.id ? 'active' : ''
                  }`}
                onClick={() => {
                  setActive('Documents');
                  setSelectedCollection(collection.id);
                }}
              >
                <Folder size={15} />
                <span>{collection.name}</span>
              </button>
            ))}

          </div>

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

        <div className="page-content">

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
                    <h2>Collections</h2>
                    <p>Jump back into a subject</p>
                  </div>

                  <span className="text-button">
                    {collections.length} collections
                  </span>
                </div>

                <div className="collection-grid">

                  {collections.map((collection) => (
                    <button
                      className="collection-card"
                      key={collection.id}
                      onClick={() => {
                        setActive('Documents');
                        setSelectedCollection(collection.id);
                      }}
                    >
                      <div className={`folder-art ${collection.color}`}>
                        <FolderOpen size={25} />
                      </div>

                      <div className="collection-info">
                        <b>{collection.name}</b>

                        <small>
                          {documents.filter(
                            d => d.collectionId === collection.id
                          ).length} documents
                        </small>
                      </div>

                      <ChevronRight size={15} />
                    </button>
                  ))}

                </div>

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
                  collections={collections}
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
                  <p>{filteredDocuments.length} items</p>
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
                collections={collections}
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

      </main>

      {/* DOCUMENT EDITOR */}

      {editorDoc && (
        <AdvancedEditor
          document={editorDoc}
          collections={collections}
          onSave={saveDocument}
          onClose={closeEditor}
        />
      )}

      {openPDFs.length > 0 && (
        <PDFWorkspace
          files={openPDFs}
          requestedActiveId={activePDFId}
          onCloseFile={closePDF}
          onImportPDF={importPDFToWorkspace}
          onOpenExistingPDF={openPDF}
        />
      )}


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
  collections,
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
                {collections.find(c => c.id === doc.collectionId)?.name
                  || 'Unsorted'}
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
        <span>COLLECTION</span>
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
            {collections.find(c => c.id === doc.collectionId)?.name
              || 'Unsorted'}
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
