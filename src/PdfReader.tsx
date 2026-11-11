import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { disposePdfResources } from './pdf/lifecycle';

GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfReaderProps { data: Blob | string; title: string; }
interface Match { page: number; snippet: string; }
interface PdfViewState { page: number; zoom: number; fit: boolean; }
interface Props extends PdfReaderProps { tabId: string; initialState?: PdfViewState; onStateChange?: (tabId: string, state: PdfViewState) => void; }
interface PageSize { width: number; height: number; }

export default function PdfReader({ tabId, data, title, initialState, onStateChange }: Props) {
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
  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | null = null;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    initialScrollPending.current = true;
    setDocument(null);
    setPageSizes([]);
    source.arrayBuffer().then((bytes) => {
      if (!active) return null;
      // A view over the Blob's buffer avoids allocating a second full-size PDF copy.
      loadingTask = getDocument({ data: new Uint8Array(bytes) });
      return loadingTask.promise;
    }).then(async (pdf) => {
      if (!pdf || !active) return;
      loaded = pdf;
      const firstPage = await pdf.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1 });
      const firstSize = { width: firstViewport.width, height: firstViewport.height };
      firstPage.cleanup();
      if (!active) return;

      // Show the reader after measuring one page. The rest of the page dimensions
      // are filled in progressively so long PDFs don't delay their first render.
      setDocument(pdf);
      setPageCount(pdf.numPages);
      setPageSizes(Array.from({ length: pdf.numPages }, () => firstSize));
      const restored = Math.min(pdf.numPages, Math.max(1, initialState?.page ?? 1));
      setPageNumber(restored);
      setPageInput(String(restored));
      setError('');

      void (async () => {
        const batchSize = 12;
        for (let start = 2; start <= pdf.numPages; start += batchSize) {
          if (!active) return;
          const end = Math.min(pdf.numPages, start + batchSize - 1);
          const measured = await Promise.all(Array.from({ length: end - start + 1 }, async (_, index) => {
            const number = start + index;
            const page = await pdf.getPage(number);
            try {
              const viewport = page.getViewport({ scale: 1 });
              return { number, size: { width: viewport.width, height: viewport.height } };
            } finally {
              page.cleanup();
            }
          }));
          if (!active) return;
          setPageSizes((current) => {
            const next = current.slice();
            for (const item of measured) next[item.number - 1] = item.size;
            return next;
          });
        }
      })().catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to prepare PDF pages.');
      });
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to open this PDF.'); });
    return () => {
      active = false;
      disposePdfResources(renderTasks.current, loadingTask, loaded);
      renderedScales.current.clear();
      pendingScales.current.clear();
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
    onStateChange?.(tabId, { page: pageNumber, zoom, fit });
  }, [tabId, pageNumber, zoom, fit, onStateChange]);

  function updateVisiblePage() {
    const host = hostRef.current;
    if (!host || !pageCount) return;
    const readingLine = host.getBoundingClientRect().top + 30;
    let low = 1;
    let high = pageCount;
    let visible = 1;

    // Track actual rendered page bounds to avoid cumulative offset drift.
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const element = pageRefs.current.get(mid);
      if (!element) { low = mid + 1; continue; }
      const rect = element.getBoundingClientRect();
      if (readingLine < rect.top) high = mid - 1;
      else if (readingLine > rect.bottom) { visible = mid; low = mid + 1; }
      else { visible = mid; break; }
    }

    if (low > pageCount) visible = pageCount;
    else if (low <= pageCount && low > high) {
      const nextElement = pageRefs.current.get(low);
      const previousElement = pageRefs.current.get(Math.max(1, low - 1));
      if (nextElement && previousElement) {
        const nextTop = nextElement.getBoundingClientRect().top;
        const previousBottom = previousElement.getBoundingClientRect().bottom;
        visible = readingLine - previousBottom < nextTop - readingLine ? low - 1 : low;
      } else if (nextElement) visible = low;
    }

    const nextPage = Math.min(pageCount, Math.max(1, visible));
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
