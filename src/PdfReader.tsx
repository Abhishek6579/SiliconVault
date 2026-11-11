import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfReaderProps { data: Blob | string; title: string; }
interface Match { page: number; snippet: string; }

export default function PdfReader({ data, title }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [error, setError] = useState('');
  const source = useMemo(() => data instanceof Blob ? data : new Blob([data]), [data]);

  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | null = null;
    source.arrayBuffer().then((bytes) => getDocument({ data: new Uint8Array(bytes) }).promise)
      .then((pdf) => {
        loaded = pdf;
        if (active) { setDocument(pdf); setPageCount(pdf.numPages); setPageNumber(1); setError(''); }
      }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to open this PDF.'); });
    return () => { active = false; void loaded?.destroy(); };
  }, [source]);

  useEffect(() => {
    if (!document || !canvasRef.current || !hostRef.current) return;
    let active = true;
    document.getPage(pageNumber).then(async (page) => {
      if (!active || !canvasRef.current || !hostRef.current) return;
      const base = page.getViewport({ scale: 1 });
      const scale = fit ? Math.min(1.8, (hostRef.current.clientWidth - 72) / base.width) : zoom;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      await page.render({ canvasContext: context, viewport }).promise;
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to render this page.'));
    return () => { active = false; };
  }, [document, pageNumber, zoom, fit]);

  async function searchPdf() {
    if (!document || !query.trim()) { setMatches([]); return; }
    const found: Match[] = [];
    const needle = query.toLocaleLowerCase();
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await (await document.getPage(page)).getTextContent();
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
      const lower = text.toLocaleLowerCase();
      let from = 0;
      let hit = lower.indexOf(needle, from);
      while (hit !== -1) {
        found.push({ page, snippet: text.slice(Math.max(0, hit - 44), Math.min(text.length, hit + needle.length + 64)).trim() });
        from = hit + needle.length;
        hit = lower.indexOf(needle, from);
      }
    }
    setMatches(found);
    setMatchIndex(0);
    if (found[0]) setPageNumber(found[0].page);
  }

  return <div className="pdf-shell">
    <div className="pdf-toolbar">
      <div className="pdf-page-controls">
        <button className="icon-button" title="Previous page" disabled={pageNumber <= 1} onClick={() => setPageNumber((n) => Math.max(1, n - 1))}><ArrowLeft size={16} /></button>
        <input aria-label="Page number" className="page-input" value={pageNumber} onChange={(event) => {
          const page = Number(event.target.value); if (Number.isInteger(page) && page >= 1 && page <= pageCount) setPageNumber(page);
        }} />
        <span className="muted">of {pageCount || '—'}</span>
        <button className="icon-button" title="Next page" disabled={pageNumber >= pageCount} onClick={() => setPageNumber((n) => Math.min(pageCount, n + 1))}><ArrowRight size={16} /></button>
      </div>
      <div className="pdf-find">
        <Search size={15} />
        <input aria-label="Search PDF" placeholder="Find in document" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchPdf(); }} />
        <button onClick={() => void searchPdf()}>Find</button>
        {matches.length > 0 && <span className="muted">{matches.length} hits</span>}
      </div>
      <div className="pdf-zoom">
        <button className={`text-button ${fit ? 'selected' : ''}`} onClick={() => setFit(true)}>Fit</button>
        <button className="icon-button" title="Zoom out" onClick={() => { setFit(false); setZoom((n) => Math.max(.5, n - .1)); }}><ZoomOut size={16} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon-button" title="Zoom in" onClick={() => { setFit(false); setZoom((n) => Math.min(2, n + .1)); }}><ZoomIn size={16} /></button>
      </div>
    </div>
    {error && <div className="inline-error">Could not open {title}: {error}</div>}
    <div className="pdf-page-host" ref={hostRef}>
      {!document && !error && <div className="loading-state">Loading PDF…</div>}
      <canvas ref={canvasRef} aria-label={`${title}, page ${pageNumber}`} />
    </div>
    {matches.length > 0 && <div className="pdf-search-results">
      <div className="section-label">Search matches</div>
      {matches.slice(0, 30).map((match, index) => <button key={`${match.page}-${index}`} className={`search-hit ${matchIndex === index ? 'active' : ''}`} onClick={() => { setMatchIndex(index); setPageNumber(match.page); }}><b>Page {match.page}</b><span>{match.snippet}</span></button>)}
      {matches.length > 30 && <span className="muted">Showing the first 30 of {matches.length} matches</span>}
    </div>}
  </div>;
}
