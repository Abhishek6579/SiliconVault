import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfReaderProps { data: Blob | string; title: string; }
interface Match { page: number; snippet: string; }
interface PdfViewState { page: number; zoom: number; fit: boolean; }
interface Props extends PdfReaderProps { initialState?: PdfViewState; onStateChange?: (state: PdfViewState) => void; }
interface PageSize { width: number; height: number; }

export default function PdfReader({ data, title, initialState, onStateChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const renderTasks = useRef(new Map<number, RenderTask>());
  const renderedScales = useRef(new Map<number, string>());
  const pendingScales = useRef(new Map<number, string>());
  const initialScrollPending = useRef(true);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(initialState?.page ?? 1);
  const [pageInput, setPageInput] = useState(String(initialState?.page ?? 1));
  const [pageCount, setPageCount] = useState(0);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [zoom, setZoom] = useState(initialState?.zoom ?? 1);
  const [fit, setFit] = useState(initialState?.fit ?? true);
  const [hostWidth, setHostWidth] = useState(0);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [error, setError] = useState('');
  const source = useMemo(() => data instanceof Blob ? data : new Blob([data]), [data]);
  const pageOffsets = useMemo(() => {
    let offset = 0;
    return pageSizes.map((size) => {
      const current = offset;
      offset += size.height * (fit ? Math.min(1.8, Math.max(.1, (hostWidth - 72) / size.width)) : zoom) + 18;
      return current;
    });
  }, [fit, hostWidth, pageSizes, zoom]);

  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | null = null;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    initialScrollPending.current = true;
    setDocument(null);
    setPageSizes([]);
    source.arrayBuffer().then((bytes) => {
      if (!active) return null;
      loadingTask = getDocument({ data: new Uint8Array(bytes) });
      return loadingTask.promise;
    }).then(async (pdf) => {
      if (!pdf || !active) return;
      loaded = pdf;
      const sizes: PageSize[] = [];
      for (let number = 1; number <= pdf.numPages; number += 1) {
        if (!active) return;
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        sizes.push({ width: viewport.width, height: viewport.height });
        page.cleanup();
      }
      if (active) {
        setDocument(pdf);
        setPageCount(pdf.numPages);
        setPageSizes(sizes);
        const restored = Math.min(pdf.numPages, Math.max(1, initialState?.page ?? 1));
        setPageNumber(restored);
        setPageInput(String(restored));
        setError('');
      }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to open this PDF.'); });
    return () => {
      active = false;
      for (const task of renderTasks.current.values()) task.cancel();
      renderTasks.current.clear();
      renderedScales.current.clear();
      pendingScales.current.clear();
      if (loadingTask) void loadingTask.destroy();
      else if (loaded) void loaded.destroy();
    };
  }, [source]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => setHostWidth(host.clientWidth));
    observer.observe(host);
    setHostWidth(host.clientWidth);
    return () => observer.disconnect();
  }, []);

  function scaleFor(size: PageSize) {
    return fit ? Math.min(1.8, Math.max(.1, (hostWidth - 72) / size.width)) : zoom;
  }

  function scrollToPage(page: number, behavior: ScrollBehavior = 'smooth') {
    const host = hostRef.current;
    const target = pageRefs.current.get(page);
    if (!host || !target) return;
    const top = target.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop - 10;
    host.scrollTo({ top: Math.max(0, top), behavior });
    setPageNumber(page);
    setPageInput(String(page));
  }

  useLayoutEffect(() => {
    if (!document || !hostWidth || pageSizes.length !== pageCount || !initialScrollPending.current) return;
    const restored = Math.min(pageCount, Math.max(1, initialState?.page ?? 1));
    if (!pageRefs.current.has(restored)) return;
    initialScrollPending.current = false;
    scrollToPage(restored, 'auto');
  }, [document, hostWidth, initialState?.page, pageCount, pageSizes]);

  useEffect(() => {
    if (!document || !hostWidth || pageSizes.length !== pageCount) return;
    const ratio = window.devicePixelRatio || 1;
    const first = Math.max(1, pageNumber - 1);
    const last = Math.min(pageCount, pageNumber + 2);
    for (const [number, canvas] of canvasRefs.current) {
      if (number < first || number > last) {
        const task = renderTasks.current.get(number);
        task?.cancel();
        renderTasks.current.delete(number);
        renderedScales.current.delete(number);
        pendingScales.current.delete(number);
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    const renderPage = async (number: number) => {
      const canvas = canvasRefs.current.get(number);
      const size = pageSizes[number - 1];
      if (!canvas || !size) return;
      const scale = scaleFor(size);
      const scaleKey = `${scale.toFixed(4)}:${ratio}`;
      if (renderedScales.current.get(number) === scaleKey || pendingScales.current.get(number) === scaleKey) return;
      renderTasks.current.get(number)?.cancel();
      renderTasks.current.delete(number);
      renderedScales.current.delete(number);
      pendingScales.current.set(number, scaleKey);
      canvas.width = 0;
      canvas.height = 0;
      const page = await document.getPage(number);
      if (pendingScales.current.get(number) !== scaleKey || canvasRefs.current.get(number) !== canvas) { page.cleanup(); return; }
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');
      if (!context) { pendingScales.current.delete(number); page.cleanup(); return; }
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const task = page.render({ canvasContext: context, viewport });
      renderTasks.current.set(number, task);
      try {
        await task.promise;
        if (pendingScales.current.get(number) === scaleKey) renderedScales.current.set(number, scaleKey);
      }
      catch (reason) {
        if ((reason as { name?: string })?.name !== 'RenderingCancelledException') throw reason;
      }
      finally {
        if (renderTasks.current.get(number) === task) renderTasks.current.delete(number);
        if (pendingScales.current.get(number) === scaleKey) pendingScales.current.delete(number);
        page.cleanup();
      }
    };
    void Promise.all(Array.from({ length: last - first + 1 }, (_, index) => renderPage(first + index)))
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== 'RenderingCancelledException') setError(reason instanceof Error ? reason.message : 'Unable to render this PDF.'); });
  }, [document, pageCount, pageSizes, hostWidth, zoom, fit, pageNumber]);

  useEffect(() => {
    onStateChange?.({ page: pageNumber, zoom, fit });
  }, [pageNumber, zoom, fit, onStateChange]);

  function updateVisiblePage() {
    const host = hostRef.current;
    if (!host || !pageCount || pageOffsets.length !== pageCount) return;
    const targetTop = host.scrollTop + 30;
    let low = 0;
    let high = pageCount - 1;
    let visible = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const size = pageSizes[mid];
      const pageBottom = pageOffsets[mid] + size.height * scaleFor(size);
      if (targetTop < pageOffsets[mid]) high = mid - 1;
      else if (targetTop >= pageBottom) low = mid + 1;
      else { visible = mid; break; }
    }
    if (low > high) visible = Math.min(pageCount - 1, low);
    const nextPage = visible + 1;
    if (nextPage !== pageNumber) {
      setPageNumber(nextPage);
      setPageInput(String(nextPage));
    }
  }

  async function searchPdf() {
    if (!document || !query.trim()) { setMatches([]); return; }
    const found: Match[] = [];
    const needle = query.toLocaleLowerCase();
    for (let page = 1; page <= document.numPages; page += 1) {
      const pdfPage = await document.getPage(page);
      const content = await pdfPage.getTextContent();
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
      pdfPage.cleanup();
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
    if (found[0]) scrollToPage(found[0].page);
  }

  return <div className="pdf-shell">
    <div className="pdf-toolbar">
      <div className="pdf-page-controls">
        <button className="icon-button" title="Previous page" disabled={pageNumber <= 1} onClick={() => scrollToPage(Math.max(1, pageNumber - 1))}><ArrowLeft size={16} /></button>
        <input aria-label="Page number" className="page-input" value={pageInput} onChange={(event) => {
          setPageInput(event.target.value);
          const page = Number(event.target.value); if (Number.isInteger(page) && page >= 1 && page <= pageCount) scrollToPage(page);
        }} />
        <span className="muted">of {pageCount || '—'}</span>
        <button className="icon-button" title="Next page" disabled={pageNumber >= pageCount} onClick={() => scrollToPage(Math.min(pageCount, pageNumber + 1))}><ArrowRight size={16} /></button>
      </div>
      <div className="pdf-find">
        <Search size={15} />
        <input aria-label="Search PDF" placeholder="Find in document" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchPdf(); }} />
        <button onClick={() => void searchPdf()}>Find</button>
        {matches.length > 0 && <span className="muted">{matches.length} hits</span>}
      </div>
      <div className="pdf-zoom">
        <button className={`text-button ${fit ? 'selected' : ''}`} onClick={() => setFit(true)}>Fit</button>
        <button className="icon-button" title="Zoom out" onClick={() => { setFit(false); setZoom((value) => Math.max(.5, value - .1)); }}><ZoomOut size={16} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon-button" title="Zoom in" onClick={() => { setFit(false); setZoom((value) => Math.min(2, value + .1)); }}><ZoomIn size={16} /></button>
      </div>
    </div>
    {error && <div className="inline-error">Could not open {title}: {error}</div>}
    <div className="pdf-page-host" ref={hostRef} onScroll={updateVisiblePage}>
      {!document && !error && <div className="loading-state">Loading PDF…</div>}
      {document && <div className="pdf-document-pages">{pageSizes.map((size, index) => {
        const page = index + 1;
        const scale = scaleFor(size);
        return <div className="pdf-page-wrap" key={page} data-page={page} ref={(element) => { if (element) pageRefs.current.set(page, element); else pageRefs.current.delete(page); }} style={{ height: `${size.height * scale}px` }}>
          <canvas ref={(element) => { if (element) canvasRefs.current.set(page, element); else canvasRefs.current.delete(page); }} aria-label={`${title}, page ${page}`} />
        </div>;
      })}</div>}
    </div>
    {matches.length > 0 && <div className="pdf-search-results">
      <div className="section-label">Search matches</div>
      {matches.slice(0, 30).map((match, index) => <button key={`${match.page}-${index}`} className={`search-hit ${matchIndex === index ? 'active' : ''}`} onClick={() => { setMatchIndex(index); scrollToPage(match.page); }}><b>Page {match.page}</b><span>{match.snippet}</span></button>)}
      {matches.length > 30 && <span className="muted">Showing the first 30 of {matches.length} matches</span>}
    </div>}
  </div>;
}
