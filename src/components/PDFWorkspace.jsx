
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import {
    FileText,
    X,
    Minimize2,
    Maximize2,
    Upload,
    Library,
    ChevronDown
} from 'lucide-react';

import { db } from '../lib/db.js';
import PDFViewer from './PDFViewer.jsx';
import '../styles/PDFViewer.css';

export default function PDFWorkspace({
    files,
    workspaceId,
    requestedActiveId,
    onCloseFile,
    onImportPDF,
    onOpenExistingPDF
}) {
    const [activeId, setActiveId] = useState(
        files[files.length - 1]?.id ?? null
    );

    const [minimizedIds, setMinimizedIds] = useState([]);
    const [libraryOpen, setLibraryOpen] = useState(false);

    const uploadRef = useRef(null);

    // Read existing assets from the SiliconVault database.
    const libraryAssets = useLiveQuery(
        () => workspaceId == null ? [] : db.assets.where('workspaceId').equals(workspaceId).toArray(),
        [workspaceId],
        []
    );

    const libraryPDFs = libraryAssets.filter(asset =>
        asset.mimeType === 'application/pdf' ||
        asset.name?.toLowerCase().endsWith('.pdf')
    );

    // Activate the PDF requested by App.jsx.
    useEffect(() => {
        if (!requestedActiveId) return;

        setActiveId(requestedActiveId);

        setMinimizedIds(current =>
            current.filter(id => id !== requestedActiveId)
        );
    }, [requestedActiveId]);

    const handleImportChange = (e) => {
        const file = e.target.files?.[0];

        if (file && onImportPDF) {
            onImportPDF(file);
        }

        e.target.value = '';
    };

    // Open an existing PDF without creating a new database record.
    const handleOpenLibraryPDF = (asset) => {
        if (onOpenExistingPDF) {
            onOpenExistingPDF(asset);
        }

        setLibraryOpen(false);
    };

    const closeFile = (id) => {
        const remaining = files.filter(file => file.id !== id);

        setMinimizedIds(current =>
            current.filter(item => item !== id)
        );

        onCloseFile(id);

        if (activeId === id) {
            const next = remaining.find(
                file => !minimizedIds.includes(file.id)
            );

            setActiveId(next?.id ?? null);
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
        setMinimizedIds(current =>
            current.filter(item => item !== id)
        );

        setActiveId(id);
    };

    const openFile = (id) => {
        setMinimizedIds(current =>
            current.filter(item => item !== id)
        );

        setActiveId(id);
    };

    const activeFile = files.find(file => file.id === activeId);

    const minimizedFiles = files.filter(file =>
        minimizedIds.includes(file.id)
    );

    const openIds = files.map(file => file.id);

    return (
        <div className="pdf-workspace">

            {/* HEADER */}
            <header className="pdf-workspace-header">
                <div className="pdf-workspace-brand">
                    <FileText size={18} />
                    <span>PDF Workspace</span>
                    <small>{files.length} open</small>
                </div>

                <div className="pdf-workspace-actions">

                    {/* OPEN FROM LIBRARY */}
                    <div className="pdf-library-action">
                        <button
                            className="pdf-open-button"
                            onClick={() => setLibraryOpen(current => !current)}
                            title="Open an existing PDF"
                        >
                            <Library size={15} />
                            Library
                            <ChevronDown size={13} />
                        </button>

                        {libraryOpen && (
                            <div className="pdf-library-menu">
                                <div className="pdf-library-menu-header">
                                    <span>PDF Library</span>
                                    <small>{libraryPDFs.length} documents</small>
                                </div>

                                {libraryPDFs.length === 0 ? (
                                    <div className="pdf-library-empty">
                                        No PDFs found in your Library.
                                    </div>
                                ) : (
                                    <div className="pdf-library-list">
                                        {libraryPDFs.map(asset => {
                                            const alreadyOpen = openIds.includes(asset.id);

                                            return (
                                                <button
                                                    key={asset.id}
                                                    className={`pdf-library-item ${alreadyOpen ? 'already-open' : ''
                                                        }`}
                                                    onClick={() =>
                                                        handleOpenLibraryPDF(asset)
                                                    }
                                                    title={asset.name}
                                                >
                                                    <FileText size={16} />

                                                    <span className="pdf-library-item-name">
                                                        {asset.name}
                                                    </span>

                                                    {alreadyOpen && (
                                                        <small>Open</small>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* UPLOAD NEW PDF */}
                    <input
                        ref={uploadRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        hidden
                        onChange={handleImportChange}
                    />

                    <button
                        className="pdf-open-button"
                        onClick={() => uploadRef.current?.click()}
                        title="Upload a new PDF"
                    >
                        <Upload size={15} />
                        Upload PDF
                    </button>

                    {/* CLOSE ALL */}
                    <button
                        className="pdf-workspace-close"
                        onClick={() => files.forEach(file => onCloseFile(file.id))}
                        title="Close all PDFs"
                    >
                        <X size={17} />
                        Close all
                    </button>
                </div>
            </header>

            {/* OPEN PDF TABS */}
            <div className="pdf-tab-bar">
                {files
                    .filter(file => !minimizedIds.includes(file.id))
                    .map(file => (
                        <div
                            key={file.id}
                            className={`pdf-tab ${activeId === file.id ? 'active' : ''
                                }`}
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

            {/* MINIMIZED PDFS */}
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

            {/* PDF VIEWER AREA */}
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
                        <p>
                            Select a minimized document above to continue reading.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
