
import { useEffect, useRef, useState } from 'react';
import { pdfjs } from 'react-pdf';
import {
    X,
    ZoomIn,
    ZoomOut,
    FileText,
    LoaderCircle,
    AlertCircle,
    Minus,
    ChevronLeft,
    ChevronRight,
    PanelLeftClose,
    PanelLeftOpen
} from 'lucide-react';

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import '../styles/PDFViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/* -------------------- FULL-SIZE PDF PAGE -------------------- */

function PDFPage({ pdf, pageNumber, maxWidth, zoom }) {
    const canvasRef = useRef(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        let renderTask = null;

        async function renderPage() {
            try {
                setError('');

                const page = await pdf.getPage(pageNumber);

                if (cancelled || !canvasRef.current) return;

                const originalViewport = page.getViewport({ scale: 1 });
                const fitScale = Math.min(1, maxWidth / originalViewport.width);
                const viewport = page.getViewport({
                    scale: fitScale * zoom
                });

                const canvas = canvasRef.current;
                const context = canvas.getContext('2d');
                const pixelRatio = window.devicePixelRatio || 1;

                canvas.width = Math.floor(viewport.width * pixelRatio);
                canvas.height = Math.floor(viewport.height * pixelRatio);

                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;

                renderTask = page.render({
                    canvasContext: context,
                    viewport,
                    transform: pixelRatio !== 1
                        ? [pixelRatio, 0, 0, pixelRatio, 0, 0]
                        : null
                });

                await renderTask.promise;
            } catch (err) {
                if (
                    err?.name !== 'RenderingCancelledException' &&
                    !cancelled
                ) {
                    console.error(`Page ${pageNumber} rendering failed:`, err);
                    setError('This page could not be rendered.');
                }
            }
        }

        renderPage();

        return () => {
            cancelled = true;
            renderTask?.cancel();
        };
    }, [pdf, pageNumber, maxWidth, zoom]);

    return (
        <div className="pdf-page-wrapper">
            <div className="pdf-page-label">Page {pageNumber}</div>

            {error ? (
                <div className="pdf-page-error">
                    <AlertCircle size={18} />
                    {error}
                </div>
            ) : (
                <canvas ref={canvasRef} className="pdf-canvas" />
            )}
        </div>
    );
}

/* -------------------- THUMBNAIL PAGE -------------------- */

function PDFThumbnail({ pdf, pageNumber, isActive, onClick }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [visible, setVisible] = useState(false);

    // Render thumbnails only when they approach the visible sidebar area.
    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            {
                root: element.closest('.pdf-thumbnail-list'),
                rootMargin: '160px'
            }
        );

        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!visible || !pdf || !canvasRef.current) return;

        let cancelled = false;
        let renderTask = null;

        async function renderThumbnail() {
            try {
                const page = await pdf.getPage(pageNumber);

                if (cancelled || !canvasRef.current) return;

                const baseViewport = page.getViewport({ scale: 1 });

                const scale = Math.min(
                    110 / baseViewport.width,
                    140 / baseViewport.height
                );

                const viewport = page.getViewport({ scale });
                const canvas = canvasRef.current;
                const context = canvas.getContext('2d');

                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;

                renderTask = page.render({
                    canvasContext: context,
                    viewport
                });

                await renderTask.promise;
            } catch (err) {
                if (
                    err?.name !== 'RenderingCancelledException' &&
                    !cancelled
                ) {
                    console.error(
                        `Thumbnail ${pageNumber} rendering failed:`,
                        err
                    );
                }
            }
        }

        renderThumbnail();

        return () => {
            cancelled = true;
            renderTask?.cancel();
        };
    }, [pdf, pageNumber, visible]);

    return (
        <button
            ref={containerRef}
            className={`pdf-thumbnail ${isActive ? 'active' : ''}`}
            onClick={onClick}
            title={`Go to page ${pageNumber}`}
            aria-label={`Go to page ${pageNumber}`}
            aria-current={isActive ? 'page' : undefined}
        >
            <div className="pdf-thumbnail-preview">
                <canvas ref={canvasRef} />

                {!visible && (
                    <span className="pdf-thumbnail-placeholder">
                        <FileText size={20} />
                    </span>
                )}
            </div>

            <span className="pdf-thumbnail-number">
                {pageNumber}
            </span>
        </button>
    );
}

/* -------------------- MAIN PDF VIEWER -------------------- */

export default function PDFViewer({
    file,
    isActive,
    onMinimize,
    onClose
}) {
    const [pdf, setPdf] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [zoom, setZoom] = useState(1);
    const [maxWidth, setMaxWidth] = useState(900);

    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState('1');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const contentRef = useRef(null);
    const thumbnailListRef = useRef(null);

    /* Load PDF */

    useEffect(() => {
        let cancelled = false;
        let loadingTask;

        async function loadPDF() {
            try {
                setLoading(true);
                setError('');
                setPdf(null);
                setCurrentPage(1);
                setPageInput('1');

                if (!file?.blob) {
                    throw new Error('The selected PDF file is unavailable.');
                }

                const buffer = await file.blob.arrayBuffer();

                if (cancelled) return;

                loadingTask = pdfjs.getDocument({
                    data: new Uint8Array(buffer)
                });

                const loadedPDF = await loadingTask.promise;

                if (cancelled) {
                    await loadedPDF.destroy();
                    return;
                }

                setPdf(loadedPDF);
                setLoading(false);
            } catch (err) {
                if (!cancelled) {
                    console.error('PDF loading failed:', err);
                    setError(err.message || 'Unable to load this PDF.');
                    setLoading(false);
                }
            }
        }

        loadPDF();

        return () => {
            cancelled = true;
            loadingTask?.destroy();
        };
    }, [file]);

    /* Measure available page width */

    useEffect(() => {
        const element = contentRef.current;
        if (!element) return;

        const updateWidth = () => {
            setMaxWidth(Math.max(250, element.clientWidth - 64));
        };

        updateWidth();

        const observer = new ResizeObserver(updateWidth);
        observer.observe(element);

        return () => observer.disconnect();
    }, [sidebarOpen, isActive]);

    /* Keep page input synchronized */

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    /* Scroll thumbnail sidebar to active page */

    useEffect(() => {
        if (!sidebarOpen || !thumbnailListRef.current) return;

        const activeThumbnail =
            thumbnailListRef.current.querySelector('.pdf-thumbnail.active');

        activeThumbnail?.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
        });
    }, [currentPage, sidebarOpen]);

    /* Page navigation */

    const goToPage = (page) => {
        if (!pdf) return;

        const nextPage = Math.min(
            pdf.numPages,
            Math.max(1, Math.floor(Number(page) || 1))
        );

        setCurrentPage(nextPage);
        setPageInput(String(nextPage));
    };

    const handlePageInput = () => {
        goToPage(pageInput);
    };

    const handlePageInputKeyDown = (event) => {
        if (event.key === 'Enter') {
            handlePageInput();
            event.currentTarget.blur();
        }
    };

    /* Zoom */

    const changeZoom = (amount) => {
        setZoom(current =>
            Math.min(2.5, Math.max(0.5, current + amount))
        );
    };

    return (
        <section
            className="pdf-viewer"
            style={{ display: isActive ? 'flex' : 'none' }}
        >
            {/* HEADER */}

            <header className="pdf-header">
                <div className="pdf-file-info">
                    <div className="pdf-file-icon">
                        <FileText size={19} />
                    </div>

                    <div className="pdf-title-group">
                        <h3 title={file.name}>{file.name}</h3>

                        <span>
                            {pdf ? `${pdf.numPages} pages` : 'PDF Document'}
                        </span>
                    </div>
                </div>

                <div className="pdf-header-actions">
                    <button
                        className="pdf-close-button"
                        onClick={onMinimize}
                        title="Minimize PDF"
                        aria-label="Minimize PDF"
                    >
                        <Minus size={18} />
                    </button>

                    <button
                        className="pdf-close-button"
                        onClick={onClose}
                        title="Close PDF"
                        aria-label="Close PDF"
                    >
                        <X size={18} />
                    </button>
                </div>
            </header>

            {/* TOOLBAR */}

            <div className="pdf-toolbar">
                <div className="pdf-document-status">
                    {loading
                        ? 'Loading document'
                        : error
                            ? 'Loading failed'
                            : 'Document ready'}
                </div>

                <div className="pdf-reading-controls">
                    <button
                        className="pdf-sidebar-toggle"
                        onClick={() => setSidebarOpen(current => !current)}
                        disabled={loading || Boolean(error)}
                        title={sidebarOpen ? 'Hide thumbnails' : 'Show thumbnails'}
                        aria-label={sidebarOpen ? 'Hide thumbnails' : 'Show thumbnails'}
                    >
                        {sidebarOpen
                            ? <PanelLeftClose size={17} />
                            : <PanelLeftOpen size={17} />}
                    </button>

                    <div className="pdf-page-navigation">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={!pdf || currentPage <= 1}
                            title="Previous page"
                            aria-label="Previous page"
                        >
                            <ChevronLeft size={17} />
                        </button>

                        <input
                            type="number"
                            min="1"
                            max={pdf?.numPages || 1}
                            value={pageInput}
                            disabled={!pdf}
                            onChange={event => setPageInput(event.target.value)}
                            onBlur={handlePageInput}
                            onKeyDown={handlePageInputKeyDown}
                            aria-label="Current page number"
                        />

                        <span className="pdf-page-total">
                            / {pdf?.numPages || '—'}
                        </span>

                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={!pdf || currentPage >= pdf.numPages}
                            title="Next page"
                            aria-label="Next page"
                        >
                            <ChevronRight size={17} />
                        </button>
                    </div>

                    <div className="pdf-zoom-controls">
                        <button
                            onClick={() => changeZoom(-0.1)}
                            disabled={zoom <= 0.5 || loading}
                            title="Zoom out"
                        >
                            <ZoomOut size={17} />
                        </button>

                        <span>{Math.round(zoom * 100)}%</span>

                        <button
                            onClick={() => changeZoom(0.1)}
                            disabled={zoom >= 2.5 || loading}
                            title="Zoom in"
                        >
                            <ZoomIn size={17} />
                        </button>
                    </div>
                </div>
            </div>

            {/* READING AREA */}

            <div className="pdf-reading-layout">
                {sidebarOpen && pdf && !loading && !error && (
                    <aside className="pdf-thumbnail-sidebar">
                        <div className="pdf-thumbnail-heading">
                            <span>Pages</span>
                            <small>{pdf.numPages} total</small>
                        </div>

                        <div
                            className="pdf-thumbnail-list"
                            ref={thumbnailListRef}
                        >
                            {Array.from(
                                { length: pdf.numPages },
                                (_, index) => {
                                    const pageNumber = index + 1;

                                    return (
                                        <PDFThumbnail
                                            key={`${file.id}-thumbnail-${pageNumber}`}
                                            pdf={pdf}
                                            pageNumber={pageNumber}
                                            isActive={currentPage === pageNumber}
                                            onClick={() => goToPage(pageNumber)}
                                        />
                                    );
                                }
                            )}
                        </div>
                    </aside>
                )}

                <main className="pdf-content" ref={contentRef}>
                    {loading && (
                        <div className="pdf-state">
                            <LoaderCircle className="pdf-spinner" size={28} />
                            <p>Loading PDF document...</p>
                        </div>
                    )}

                    {error && (
                        <div className="pdf-state pdf-error">
                            <AlertCircle size={26} />
                            <p>{error}</p>
                        </div>
                    )}

                    {pdf && !loading && !error && (
                        <div className="pdf-pages">
                            <PDFPage
                                key={`${file.id}-${currentPage}`}
                                pdf={pdf}
                                pageNumber={currentPage}
                                maxWidth={maxWidth}
                                zoom={zoom}
                            />
                        </div>
                    )}
                </main>
            </div>

            {/* FOOTER */}

            <footer className="pdf-footer">
                <span>SiliconVault PDF Viewer</span>
                <span>
                    {pdf
                        ? `Page ${currentPage} of ${pdf.numPages}`
                        : 'Local document'}
                </span>
            </footer>
        </section>
    );
}
