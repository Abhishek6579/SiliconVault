import { useEffect, useRef, useState } from 'react';
import { pdfjs } from 'react-pdf';
import {
  X,
  ZoomIn,
  ZoomOut,
  FileText,
  LoaderCircle,
  AlertCircle
} from 'lucide-react';

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import '../styles/PDFViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

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

        const fitScale = Math.min(
          1,
          maxWidth / originalViewport.width
        );

        const scale = fitScale * zoom;
        const viewport = page.getViewport({ scale });

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

        if (!cancelled) {
          console.log(`Rendered PDF page ${pageNumber}`);
        }
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
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
      <div className="pdf-page-label">
        Page {pageNumber}
      </div>

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

export default function PDFViewer({ file, onClose }) {
  const [pdf, setPdf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [maxWidth, setMaxWidth] = useState(900);

  const contentRef = useRef(null);

  // Load the PDF document.
  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;

    async function loadPDF() {
      try {
        setLoading(true);
        setError('');
        setPdf(null);

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

        console.log(
          'PDF loaded successfully:',
          loadedPDF.numPages,
          'pages'
        );

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

      if (loadingTask) {
        loadingTask.destroy();
      }
    };
  }, [file]);

  // Measure the available document width.
  useEffect(() => {
    const element = contentRef.current;

    if (!element) return;

    const updateWidth = () => {
      setMaxWidth(Math.max(300, element.clientWidth - 64));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  // Close the viewer with Escape.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const changeZoom = (amount) => {
    setZoom(current =>
      Math.min(2.5, Math.max(0.5, current + amount))
    );
  };

  return (
    <div className="pdf-overlay">
      <section className="pdf-viewer">

        {/* HEADER */}
        <header className="pdf-header">
          <div className="pdf-file-info">
            <div className="pdf-file-icon">
              <FileText size={19} />
            </div>

            <div className="pdf-title-group">
              <h3 title={file?.name}>{file?.name || 'PDF Document'}</h3>

              <span>
                {pdf
                  ? `${pdf.numPages} pages`
                  : 'PDF Document'}
              </span>
            </div>
          </div>

          <button
            className="pdf-close-button"
            onClick={onClose}
            aria-label="Close PDF viewer"
            title="Close"
          >
            <X size={19} />
          </button>
        </header>

        {/* TOOLBAR */}
        <div className="pdf-toolbar">
          <div className="pdf-toolbar-left">
            <span className="pdf-document-status">
              {loading
                ? 'Loading document'
                : error
                  ? 'Loading failed'
                  : 'Document ready'}
            </span>
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

        {/* PDF CONTENT */}
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
              {Array.from(
                { length: pdf.numPages },
                (_, index) => (
                  <PDFPage
                    key={`${file.id}-${index + 1}`}
                    pdf={pdf}
                    pageNumber={index + 1}
                    maxWidth={maxWidth}
                    zoom={zoom}
                  />
                )
              )}
            </div>
          )}

        </main>

        {/* FOOTER */}
        <footer className="pdf-footer">
          <span>
            SiliconVault PDF Viewer
          </span>

          <span>
            {pdf ? `${pdf.numPages} total pages` : 'Local document'}
          </span>
        </footer>

      </section>
    </div>
  );
}