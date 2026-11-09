import { useEffect, useState } from 'react';
import { FileText, X, Minimize2, Maximize2 } from 'lucide-react';
import PDFViewer from './PDFViewer.jsx';
import '../styles/PDFViewer.css';

export default function PDFWorkspace({
  files,
  requestedActiveId,
  onCloseFile
}) {
  const [activeId, setActiveId] = useState(
    files[files.length - 1]?.id ?? null
  );

  const [minimizedIds, setMinimizedIds] = useState([]);

  // Automatically activate a newly opened document.
  useEffect(() => {
    if (files.length > 0) {
      const latest = files[files.length - 1];
      setActiveId(latest.id);

      setMinimizedIds(current =>
        current.filter(id => id !== latest.id)
      );
    }
  }, [files.length]);

  const closeFile = (id) => {
    const remaining = files.filter(file => file.id !== id);

    setMinimizedIds(current => current.filter(item => item !== id));
    onCloseFile(id);

    if (activeId === id) {
      const next = remaining.filter(
        file => !minimizedIds.includes(file.id)
      );

      setActiveId(next[0]?.id ?? null);
    }
  };

  const minimizeFile = (id) => {
    setMinimizedIds(current =>
      current.includes(id) ? current : [...current, id]
    );

    if (activeId === id) {
      const next = files.find(
        file => file.id !== id && !minimizedIds.includes(file.id)
      );

      setActiveId(next?.id ?? null);
    }
  };

  const restoreFile = (id) => {
    setMinimizedIds(current => current.filter(item => item !== id));
    setActiveId(id);
  };

  const openFile = (id) => {
    setMinimizedIds(current => current.filter(item => item !== id));
    setActiveId(id);
  };

  const activeFile = files.find(file => file.id === activeId);
  const minimizedFiles = files.filter(file =>
    minimizedIds.includes(file.id)
  );

  return (
    <div className="pdf-workspace">
      <header className="pdf-workspace-header">
        <div className="pdf-workspace-brand">
          <FileText size={18} />
          <span>PDF Workspace</span>
          <small>{files.length} open</small>
        </div>

        <button
          className="pdf-workspace-close"
          onClick={() => files.forEach(file => onCloseFile(file.id))}
          title="Close all PDFs"
        >
          <X size={17} />
          Close all
        </button>
      </header>

      <div className="pdf-tab-bar">
        {files
          .filter(file => !minimizedIds.includes(file.id))
          .map(file => (
            <div
              key={file.id}
              className={`pdf-tab ${activeId === file.id ? 'active' : ''}`}
            >
              <button
                className="pdf-tab-select"
                onClick={() => openFile(file.id)}
                title={file.name}
              >
                <FileText size={14} />
                <span>{file.name}</span>
              </button>

              <button
                className="pdf-tab-close"
                onClick={() => closeFile(file.id)}
                title="Close tab"
              >
                <X size={13} />
              </button>
            </div>
          ))}
      </div>

      <div className="pdf-minimized-bar">
        <div className="pdf-minimized-label">
          <Minimize2 size={13} />
          Minimized
        </div>

        {minimizedFiles.length === 0 ? (
          <span className="pdf-minimized-empty">
            No minimized documents
          </span>
        ) : (
          minimizedFiles.map(file => (
            <button
              key={file.id}
              className="pdf-minimized-item"
              onClick={() => restoreFile(file.id)}
              title={`Restore ${file.name}`}
            >
              <FileText size={13} />
              <span>{file.name}</span>
              <Maximize2 size={12} />
            </button>
          ))
        )}
      </div>

      <main className="pdf-workspace-stage">
        {files.map(file => (
          <PDFViewer
            key={file.id}
            file={file}
            isActive={
              activeId === file.id &&
              !minimizedIds.includes(file.id)
            }
            onMinimize={() => minimizeFile(file.id)}
            onClose={() => closeFile(file.id)}
          />
        ))}

        {!activeFile && (
          <div className="pdf-workspace-empty">
            <Minimize2 size={28} />
            <h3>All documents minimized</h3>
            <p>Select a minimized document above to continue reading.</p>
          </div>
        )}
      </main>
    </div>
  );
}