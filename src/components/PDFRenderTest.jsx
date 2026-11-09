import { useEffect, useRef } from 'react';
import { pdfjs } from 'react-pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PDFRenderTest({ file }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!file?.blob || !canvasRef.current) return;

    let loadingTask;
    let cancelled = false;

    async function renderPDF() {
      try {
        console.log('Starting direct PDF.js rendering');

        const buffer = await file.blob.arrayBuffer();

        loadingTask = pdfjs.getDocument({
          data: new Uint8Array(buffer)
        });

        const pdf = await loadingTask.promise;

        console.log('PDF.js loaded:', pdf.numPages, 'pages');

        const page = await pdf.getPage(1);

        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport
        }).promise;

        console.log('DIRECT CANVAS RENDER SUCCESS');
      } catch (error) {
        console.error('DIRECT PDF RENDER FAILED:', error);
      }
    }

    renderPDF();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [file]);

  return (
    <div style={{ padding: 20, overflow: 'auto' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          maxWidth: '100%',
          background: 'white',
          margin: '0 auto'
        }}
      />
    </div>
  );
}