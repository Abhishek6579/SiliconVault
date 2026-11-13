import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { GlobalWorkerOptions, getDocument, TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { disposePdfResources } from './pdf/lifecycle';
import { MAX_PDF_FILE_SIZE_BYTES } from './storage/limits';

GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfReaderProps { data: Blob | string; title: string; }
interface Match { page: number; snippet: string; }
interface PdfViewState { page: number; zoom: number; fit: boolean; }
interface Props extends PdfReaderProps { tabId: string; initialState?: PdfViewState; onStateChange?: (tabId: string, state: PdfViewState) => void; }
interface PageSize { width: number; height: number; }

export default function PdfReader({ tabId, data, title, initialState, onStateChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const textLayerRefs = useRef(new Map<number, HTMLDivElement>());
  const renderTasks = useRef(new Map<number, RenderTask>());
  const renderedScales = useRef(new Map<number, string>());
  const pendingScales = useRef(new Map<number, string>());
  const searchRequestRef = useRef(0);
  const searchControllerRef = useRef<AbortController | null>(null);

  // Single source of truth for the page the user is on. Updated only by
  // navigation or by scroll tracking that is trusted (see updateVisiblePage).
  const anchorRef = useRef(initialState?.page ?? 1);
  // Ignore scroll events caused by our own scrolling for a short window.
  const navigatingUntilRef = useRef(0);
  // Set when the host is hidden (display: none) so we know to re-anchor on show.
  const hiddenRef = useRef(false);
  const cancelPageEditRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  const viewRef = useRef({ tabId, zoom: initialState?.zoom ?? 1, fit: initialState?.fit ?? true });

  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(initialState?.page ?? 1);
  const [pageInput, setPageInput] = useState(String(initialState?.page ?? 1));
  const [pageCount, setPageCount] = useState(0);
  const [measuredThroughPage, setMeasuredThroughPage] = useState(0);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [zoom, setZoom] = useState(initialState?.zoom ?? 1);
  const [fit, setFit] = useState(initialState?.fit ?? true);
  const [hostWidth, setHostWidth] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [error, setError] = useState('');

  const source = useMemo(() => data instanceof Blob ? data : new Blob([data]), [data]);

  // Scale per page, and the exact top offset of every page, computed from
  // known sizes. No DOM measurement, so navigation is deterministic.
  const pageScales = useMemo(
    () => pageSizes.map((size) => fit ? Math.min(1.8, Math.max(.1, (hostWidth - 72) / size.width)) : zoom),
    [pageSizes, fit, zoom, hostWidth],
  );
  const pageOffsets = useMemo(() => {
    const offsets: number[] = [];
    let top = 0;
    pageSizes.forEach((size, index) => {
      offsets.push(top);
      top += size.height * pageScales[index];
    });
    return offsets;
  }, [pageSizes, pageScales]);

  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | null = null;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    setDocument(null);
    setPageSizes([]);
    setMeasuredThroughPage(0);
    setSearching(false);

    const cleanup = () => {
      active = false;
      searchRequestRef.current += 1;
      searchControllerRef.current?.abort();
      searchControllerRef.current = null;
      disposePdfResources(renderTasks.current, loadingTask, loaded);
      renderedScales.current.clear();
      pendingScales.current.clear();
    };
    if (source.size > MAX_PDF_FILE_SIZE_BYTES) {
      setError(`This PDF is too large to open. PDF files are limited to ${Math.floor(MAX_PDF_FILE_SIZE_BYTES / (1024 * 1024))} MiB.`);
      return cleanup;
    }

    source.arrayBuffer().then((bytes) => {
      if (!active) return null;
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

      const restored = Math.min(pdf.numPages, Math.max(1, initialState?.page ?? 1));
      anchorRef.current = restored;
      setDocument(pdf);
      setPageCount(pdf.numPages);
      setPageSizes(Array.from({ length: pdf.numPages }, () => firstSize));
      setMeasuredThroughPage(1);
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
          setMeasuredThroughPage(end);
        }
      })().catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to prepare PDF pages.');
      });
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to open this PDF.');
    });

    return cleanup;
  }, [source]);

  // Track container width. A zero width means the tab is hidden; remember that
  // so we re-anchor when it becomes visible again.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      const width = host.clientWidth;
      if (width === 0) { hiddenRef.current = true; return; }
      if (hiddenRef.current) {
        hiddenRef.current = false;
        setLayoutVersion((version) => version + 1);
      }
      setHostWidth(width);
    });
    observer.observe(host);
    if (host.clientWidth > 0) setHostWidth(host.clientWidth);
    return () => observer.disconnect();
  }, []);

  function scrollToPageTop(page: number, behavior: ScrollBehavior) {
    const host = hostRef.current;
    const top = pageOffsets[page - 1];
    if (!host || top === undefined) return;
    navigatingUntilRef.current = performance.now() + (behavior === 'smooth' ? 700 : 250);
    host.scrollTo({ top, behavior });
  }

  function goTo(page: number, behavior: ScrollBehavior = 'smooth') {
    anchorRef.current = page;
    setPageNumber(page);
    setPageInput(String(page));
    // If the target isn't measured yet, the anchor effect below scrolls once it is.
    if (measuredThroughPage >= page) scrollToPageTop(page, behavior);
  }

  function goToEnteredPage() {
    const page = Number(pageInput);
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      setPageInput(String(pageNumber));
      return;
    }
    goTo(page, 'auto');
  }

  // Re-land on the anchored page whenever anything that changes layout happens:
  // initial load, measurement progress, width, zoom/fit, or tab re-show.
  useLayoutEffect(() => {
    if (!document || !hostWidth || measuredThroughPage < anchorRef.current) return;
    scrollToPageTop(anchorRef.current, 'auto');
  }, [document, hostWidth, zoom, fit, measuredThroughPage, layoutVersion]);

  useEffect(() => {
    if (!document || !hostWidth || pageSizes.length !== pageCount) return;
    const ratio = window.devicePixelRatio || 1;
    const first = Math.max(1, pageNumber - 1);
    const last = Math.min(pageCount, pageNumber + 2);
    for (const [number, canvas] of canvasRefs.current) {
      if (number < first || number > last) {
        renderTasks.current.get(number)?.cancel();
        renderTasks.current.delete(number);
        renderedScales.current.delete(number);
        pendingScales.current.delete(number);
        canvas.width = 0;
        canvas.height = 0;
        textLayerRefs.current.get(number)?.replaceChildren();
      }
    }
    const renderPage = async (number: number) => {
      const canvas = canvasRefs.current.get(number);
      const scale = pageScales[number - 1];
      if (!canvas || scale === undefined) return;
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
        if (pendingScales.current.get(number) !== scaleKey) return;
        const textLayerContainer = textLayerRefs.current.get(number);
        if (textLayerContainer) {
          textLayerContainer.replaceChildren();
          textLayerContainer.style.width = `${viewport.width}px`;
          textLayerContainer.style.height = `${viewport.height}px`;
          const textContent = await page.getTextContent();
          const textLayer = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
          await textLayer.render();
        }
        if (pendingScales.current.get(number) === scaleKey) renderedScales.current.set(number, scaleKey);
      } catch (reason) {
        if ((reason as { name?: string })?.name !== 'RenderingCancelledException') throw reason;
      } finally {
        if (renderTasks.current.get(number) === task) renderTasks.current.delete(number);
        if (pendingScales.current.get(number) === scaleKey) pendingScales.current.delete(number);
        page.cleanup();
      }
    };
    void Promise.all(Array.from({ length: last - first + 1 }, (_, index) => renderPage(first + index)))
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== 'RenderingCancelledException') {
          setError(reason instanceof Error ? reason.message : 'Unable to render this PDF.');
        }
      });
  }, [document, pageCount, pageSizes, pageScales, hostWidth, pageNumber]);

  // Persist view state. Also saves on unmount, so switching tabs (which may
  // unmount this reader) keeps the current page.
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { viewRef.current = { tabId, zoom, fit }; }, [tabId, zoom, fit]);
  useEffect(() => {
    onStateChangeRef.current?.(tabId, { page: anchorRef.current, zoom, fit });
  }, [tabId, pageNumber, zoom, fit]);
  useEffect(() => () => {
    const view = viewRef.current;
    onStateChangeRef.current?.(view.tabId, { page: anchorRef.current, zoom: view.zoom, fit: view.fit });
  }, []);

  function updateVisiblePage() {
    const host = hostRef.current;
    if (!host || !pageCount || host.clientWidth === 0 || host.clientHeight === 0) return;
    if (performance.now() < navigatingUntilRef.current) return;
    if (measuredThroughPage < anchorRef.current) return;

    // Largest page whose top is at or above the current scroll position.
    const y = host.scrollTop + 1;
    let low = 0;
    let high = pageOffsets.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (pageOffsets[mid] <= y) low = mid;
      else high = mid - 1;
    }
    const next = low + 1;
    // Offsets are only exact for measured pages (plus the first unmeasured one).
    if (next > measuredThroughPage + 1) return;

    anchorRef.current = next;
    if (next !== pageNumber) {
      setPageNumber(next);
      setPageInput(String(next));
    }
  }

  function cancelSearch() {
    searchRequestRef.current += 1;
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    setSearching(false);
  }

  async function searchPdf() {
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    const request = ++searchRequestRef.current;
    if (!document || !query.trim()) {
      setMatches([]);
      searchControllerRef.current = null;
      setSearching(false);
      return;
    }

    setSearching(true);
    setError('');
    const found: Match[] = [];
    const needle = query.toLocaleLowerCase();
    try {
      for (let page = 1; page <= document.numPages; page += 1) {
        if (controller.signal.aborted || request !== searchRequestRef.current) return;
        const pdfPage = await document.getPage(page);
        let text: string;
        try {
          // PDF.js does not expose AbortSignal for getTextContent. Cancellation
          // is cooperative: finish the current page, then stop before next page.
          const content = await pdfPage.getTextContent();
          text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
        } finally {
          pdfPage.cleanup();
        }
        if (controller.signal.aborted || request !== searchRequestRef.current) return;

        const lower = text.toLocaleLowerCase();
        let from = 0;
        let hit = lower.indexOf(needle, from);
        while (hit !== -1) {
          found.push({ page, snippet: text.slice(Math.max(0, hit - 44), Math.min(text.length, hit + needle.length + 64)).trim() });
          from = hit + needle.length;
          hit = lower.indexOf(needle, from);
        }
      }

      if (controller.signal.aborted || request !== searchRequestRef.current) return;
      setMatches(found);
      setMatchIndex(0);
      if (found[0]) goTo(found[0].page);
    } catch (reason) {
      if (!controller.signal.aborted && request === searchRequestRef.current) {
        setMatches([]);
        setError(reason instanceof Error ? reason.message : 'Unable to search this PDF.');
      }
    } finally {
      if (request === searchRequestRef.current) {
        searchControllerRef.current = null;
        setSearching(false);
      }
    }
  }

  return <div className="pdf-shell">
    <div className="pdf-toolbar">
      <div className="pdf-page-controls">
        <button className="icon-button" title="Previous page" disabled={pageNumber <= 1} onClick={() => goTo(Math.max(1, pageNumber - 1))}><ArrowLeft size={16} /></button>
        <input
          aria-label="Page number"
          className="page-input"
          type="text"
          inputMode="numeric"
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ''))}
          onBlur={() => {
            if (cancelPageEditRef.current) { cancelPageEditRef.current = false; return; }
            goToEnteredPage();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              cancelPageEditRef.current = true;
              setPageInput(String(pageNumber));
              event.currentTarget.blur();
            }
          }}
        />
        <span className="muted">of {pageCount || '—'}</span>
        <button className="icon-button" title="Next page" disabled={pageNumber >= pageCount} onClick={() => goTo(Math.min(pageCount, pageNumber + 1))}><ArrowRight size={16} /></button>
      </div>
      <div className="pdf-find">
        <Search size={15} />
        <input aria-label="Search PDF" placeholder="Find in document" value={query} onChange={(event) => { cancelSearch(); setQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Enter') void searchPdf(); }} />
        <button onClick={() => searching ? cancelSearch() : void searchPdf()}>{searching ? 'Cancel' : 'Find'}</button>
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
    <div
      className="pdf-page-host"
      ref={hostRef}
      onScroll={updateVisiblePage}
      onWheel={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        setFit(false);
        setZoom((value) => Math.max(.5, Math.min(2, Math.round((value + (event.deltaY < 0 ? .1 : -.1)) * 100) / 100)));
      }}
      style={{ overflowAnchor: 'none' }}
    >
      {!document && !error && <div className="loading-state">Loading PDF…</div>}
      {document && <div
        className="pdf-document-pages"
        style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, margin: 0 }}
      >{pageSizes.map((size, index) => {
        const page = index + 1;
        const scale = pageScales[index];
        return <div
          className="pdf-page-wrap"
          key={page}
          data-page={page}
          style={{ height: `${size.height * scale}px`, margin: 0 }}
        >
          <canvas
            style={{ display: 'block' }}
            ref={(element) => { if (element) canvasRefs.current.set(page, element); else canvasRefs.current.delete(page); }}
            aria-label={`${title}, page ${page}`}
          />
          <div className="textLayer"
            ref={(element) => { if (element) textLayerRefs.current.set(page, element); else textLayerRefs.current.delete(page); }}
            aria-label={`${title}, page ${page}, selectable text`}
          />
        </div>;
      })}</div>}
    </div>
    {matches.length > 0 && <div className="pdf-search-results">
      <div className="section-label">Search matches</div>
      {matches.slice(0, 30).map((match, index) => <button key={`${match.page}-${index}`} className={`search-hit ${matchIndex === index ? 'active' : ''}`} onClick={() => { setMatchIndex(index); goTo(match.page); }}><b>Page {match.page}</b><span>{match.snippet}</span></button>)}
      {matches.length > 30 && <span className="muted">Showing the first 30 of {matches.length} matches</span>}
    </div>}
  </div>;
}