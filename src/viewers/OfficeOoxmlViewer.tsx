import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Search, X, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  data: Blob;
  extension: string;
  tabId: string;
  onError: (error: Error) => void;
  zoom: number;
  initialScrollTop: number;
  initialScrollLeft: number;
  onStateChange: (scale: number) => void;
  onScrollStateChange: (scrollTop: number, scrollLeft: number) => void;
}

interface ViewerHandle {
  load(source: ArrayBuffer): Promise<void>;
  destroy(): void;
  setScale(scale: number): void;
  getScale(): number;
}

const MAX_OFFICE_FILE_BYTES = 100 * 1024 * 1024;

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error('The Office renderer could not open this document.');
}

export default function OfficeOoxmlViewer({ data, extension, tabId, onError, zoom, initialScrollTop, initialScrollLeft, onStateChange, onScrollStateChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(zoom);
  const viewerRef = useRef<ViewerHandle | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const findInputRef = useRef<HTMLInputElement>(null);
  const findCursorRef = useRef({ query: '', offset: -1 });
  const textIndexRef = useRef<{ text: string; lower: string; segments: Array<{ node: Text; start: number; end: number }> } | null>(null);
  const findTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const changeScale = (next: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const bounded = Math.min(4, Math.max(0.1, Math.round(next * 100) / 100));
    const host = hostRef.current;
    const top = host?.scrollTop ?? 0;
    const left = host?.scrollLeft ?? 0;
    viewer.setScale(bounded);
    if (host) { host.scrollTop = top; host.scrollLeft = left; }
    setScale(viewer.getScale());
    onStateChange(viewer.getScale());
  };

  const clearOfficeFindHighlight = () => {
    const highlights = (window.CSS as typeof CSS & { highlights?: { delete: (name: string) => void } }).highlights;
    highlights?.delete('siliconvault-find');
  };
  const applyOfficeFindHighlight = (range: Range) => {
    const css = window.CSS as typeof CSS & { highlights?: { set: (name: string, value: unknown) => void } };
    const HighlightConstructor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (css.highlights && HighlightConstructor) css.highlights.set('siliconvault-find', new HighlightConstructor(range));
  };

  const findInDocument = (query: string, direction: 1 | -1 = 1) => {
    const host = hostRef.current;
    const needle = query.trim().toLocaleLowerCase();
    if (!host) return;
    if (!needle) { clearOfficeFindHighlight(); findCursorRef.current = { query: '', offset: -1 }; return; }

    // Build the DOM text index once. The previous implementation rebuilt it and
    // collected every occurrence on each keystroke; a one-character query in a
    // large workbook/document could allocate millions of offsets and freeze UI.
    let index = textIndexRef.current;
    if (!index) {
      const segments: Array<{ node: Text; start: number; end: number }> = [];
      let combined = '';
      let previousBlock: Element | null = null;
      const walker = window.document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        const node = current as Text;
        const parent = node.parentElement;
        const block = parent?.closest('p, li, td, th, tr, section, article, h1, h2, h3, h4, div') ?? parent;
        if (block && previousBlock && block !== previousBlock) combined += '\n';
        const value = node.textContent ?? '';
        if (value) {
          segments.push({ node, start: combined.length, end: combined.length + value.length });
          combined += value;
        }
        previousBlock = block ?? previousBlock;
        current = walker.nextNode();
      }
      index = { text: combined, lower: combined.toLocaleLowerCase(), segments };
      textIndexRef.current = index;
    }

    if (findCursorRef.current.query !== needle) findCursorRef.current = { query: needle, offset: -1 };
    const from = direction > 0
      ? findCursorRef.current.offset + 1
      : Math.max(0, findCursorRef.current.offset - 1);
    let matchOffset = direction > 0 ? index.lower.indexOf(needle, from) : index.lower.lastIndexOf(needle, from);
    if (matchOffset < 0) matchOffset = direction > 0 ? index.lower.indexOf(needle) : index.lower.lastIndexOf(needle);
    if (matchOffset < 0) return;
    findCursorRef.current = { query: needle, offset: matchOffset };

    const locate = (offset: number) => {
      let low = 0;
      let high = index!.segments.length - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        const segment = index!.segments[middle];
        if (offset < segment.start) high = middle - 1;
        else if (offset >= segment.end) low = middle + 1;
        else return segment;
      }
      return null;
    };
    const startSegment = locate(matchOffset);
    const endSegment = locate(matchOffset + needle.length - 1);
    if (!startSegment || !endSegment) return;
    const range = window.document.createRange();
    range.setStart(startSegment.node, matchOffset - startSegment.start);
    range.setEnd(endSegment.node, matchOffset + needle.length - endSegment.start);
    applyOfficeFindHighlight(range);
    endSegment.node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  useEffect(() => {
    const openFind = (event: Event) => {
      const requestedTabId = (event as CustomEvent<{ tabId?: string }>).detail?.tabId;
      if (requestedTabId && requestedTabId !== tabId) return;
      setFindOpen(true);
      window.setTimeout(() => findInputRef.current?.focus(), 0);
    };
    window.addEventListener('siliconvault:open-document-search', openFind);
    return () => window.removeEventListener('siliconvault:open-document-search', openFind);
  }, [tabId]);
  // OOXML renders into its own scrolling host. Handle zoom here in capture
  // phase so embedded document elements cannot swallow Ctrl/Cmd zoom input.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      changeScale(scale + (event.deltaY < 0 ? 0.1 : -0.1));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (!['=', '+', '-', '_', '0'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === '0') changeScale(1);
      else changeScale(scale + (event.key === '-' || event.key === '_' ? -0.1 : 0.1));
    };
    const handleGlobalZoom = (event: Event) => {
      const direction = (event as CustomEvent<{ direction: number }>).detail?.direction ?? 0;
      changeScale(direction === 0 ? 1 : scale + direction * 0.1);
    };
    host.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    host.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('siliconvault:office-zoom', handleGlobalZoom);
    return () => {
      host.removeEventListener('wheel', handleWheel, true);
      host.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('siliconvault:office-zoom', handleGlobalZoom);
    };
  }, [scale, onStateChange]);

  useEffect(() => {
    let active = true;
    let viewer: ViewerHandle | null = null;
    const host = hostRef.current;
    setLoading(true);
    textIndexRef.current = null;
    findCursorRef.current = { query: '', offset: -1 };
    setScale(zoom);
    viewerRef.current = null;

    const openDocument = async () => {
      if (!host) throw new Error('The Office preview container is unavailable.');
      if (data.size === 0) throw new Error('The Office document is empty.');
      if (data.size > MAX_OFFICE_FILE_BYTES) {
        throw new Error('Office previews are limited to 100 MB to protect memory usage.');
      }

      const source = await data.arrayBuffer();
      if (!active) return;

      // Keep parsing and (where supported) layout/painting away from the UI thread.
      // The library falls back to its main-thread renderer on WebViews without OffscreenCanvas.
      const mode = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
        ? 'worker'
        : 'main';

      if (extension === 'docx' || extension === 'docm') {
        const { DocxScrollViewer } = await import('@silurus/ooxml/docx');
        if (!active) return;
        viewer = new DocxScrollViewer(host, {
          mode,
          progressiveLayout: true,
          enableTextSelection: true,
          useGoogleFonts: false,
          onError: (reason: Error) => { if (active) onError(reason); },
          onScaleChange: (next: number) => { if (active) { setScale(next); onStateChange(next); } },
          onLayoutComplete: (reason?: unknown) => {
            if (active && reason) onError(asError(reason));
          },
        });
      } else if (extension === 'xlsx' || extension === 'xlsm') {
        const { XlsxViewer } = await import('@silurus/ooxml/xlsx');
        if (!active) return;
        viewer = new XlsxViewer(host, {
          mode,
          showZoomSlider: false,
          useGoogleFonts: false,
          onScaleChange: (next: number) => { if (active) { setScale(next); onStateChange(next); } },
          onError: (reason: Error) => { if (active) onError(reason); },
        });
      } else if (extension === 'pptx' || extension === 'pptm') {
        const { PptxScrollViewer } = await import('@silurus/ooxml/pptx');
        if (!active) return;
        viewer = new PptxScrollViewer(host, {
          mode,
          progressiveLayout: true,
          enableTextSelection: true,
          enableHyperlinks: false,
          useGoogleFonts: false,
          onError: (reason: Error) => { if (active) onError(reason); },
          onScaleChange: (next: number) => { if (active) { setScale(next); onStateChange(next); } },
          onLayoutComplete: (reason?: unknown) => {
            if (active && reason) onError(asError(reason));
          },
        });
      } else {
        throw new Error(`Unsupported browser Office format: .${extension}`);
      }

      viewerRef.current = viewer;
      await viewer.load(source);
      if (active) {
        viewer.setScale(zoom);
        host.scrollTop = initialScrollTop;
        host.scrollLeft = initialScrollLeft;
        setScale(viewer.getScale());
        onStateChange(viewer.getScale());
        setLoading(false);
      }
    };

    void openDocument().catch((reason: unknown) => {
      if (!active) return;
      setLoading(false);
      onError(asError(reason));
    });

    return () => {
      active = false;
      viewerRef.current = null;
      try {
        viewer?.destroy();
      } finally {
        host?.replaceChildren();
      }
    };
  }, [data, extension, onError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new MutationObserver(() => { textIndexRef.current = null; });
    observer.observe(host, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (Math.abs(viewer.getScale() - zoom) > 0.005) {
      const host = hostRef.current;
      const top = host?.scrollTop ?? 0;
      const left = host?.scrollLeft ?? 0;
      viewer.setScale(zoom);
      if (host) { host.scrollTop = top; host.scrollLeft = left; }
      setScale(viewer.getScale());
    }
  }, [zoom]);

  return (
    <div className="office-ooxml-viewer">
      <div className="office-ooxml-toolbar" role="toolbar" aria-label="Document controls">
        {findOpen && <div className="office-document-find file-find-bar"><Search size={14} /><input ref={findInputRef} aria-label="Find in document" placeholder="Find in document" value={findQuery} onChange={(event) => { const next = event.target.value; setFindQuery(next); findCursorRef.current = { query: '', offset: -1 }; if (findTimerRef.current) window.clearTimeout(findTimerRef.current); findTimerRef.current = window.setTimeout(() => findInDocument(next), 120); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (findTimerRef.current) window.clearTimeout(findTimerRef.current); findInDocument(findQuery, event.shiftKey ? -1 : 1); } if (event.key === 'Escape') setFindOpen(false); }} /><button type="button" className="icon-button" aria-label="Close find" onClick={() => setFindOpen(false)}><X size={13} /></button></div>}
        <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={() => changeScale(scale - 0.1)} disabled={scale <= 0.1}><ZoomOut size={15} /></button>
        <span aria-live="polite">{Math.round(scale * 100)}%</span>
        <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => changeScale(scale + 0.1)} disabled={scale >= 4}><ZoomIn size={15} /></button>
        <button type="button" className="icon-button" aria-label="Reset zoom" title="Reset zoom" onClick={() => changeScale(1)} disabled={scale === 1}><RotateCcw size={13} /></button>
      </div>
      <div className="office-ooxml-host" data-viewer-scroll ref={hostRef} tabIndex={0} onScroll={(event) => onScrollStateChange(event.currentTarget.scrollTop, event.currentTarget.scrollLeft)} aria-label={`${extension.toUpperCase()} read-only preview`} />
      {loading && <div className="office-ooxml-loading" role="status">Rendering Office document…</div>}
    </div>
  );
}
