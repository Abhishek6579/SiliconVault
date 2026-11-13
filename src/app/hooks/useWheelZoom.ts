import { useEffect, type MutableRefObject } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type LastFocusedSurface = 'pdf' | 'editor' | null;

export function useWheelZoom(
  lastFocusedSurfaceRef: MutableRefObject<LastFocusedSurface>,
  setAppZoom: Dispatch<SetStateAction<number>>,
  setEditorFontSize: Dispatch<SetStateAction<number>>,
) {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : null;
      const overPdf = Boolean(target?.closest('.pdf-shell'));
      const overEditor = Boolean(target?.closest('.code-editor, .markdown-preview'));
      // Read-only document viewers own their Ctrl+wheel zoom. Do not zoom the app shell as well.
      if (!overPdf && target?.closest('.file-viewer')) return;
      if (overPdf) {
        if (target?.closest('.pdf-page-host')) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('siliconvault:pdf-zoom', { detail: { direction: event.deltaY < 0 ? 1 : -1 } }));
        return;
      }
      if (lastFocusedSurfaceRef.current === 'pdf') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('siliconvault:pdf-zoom', { detail: { direction: event.deltaY < 0 ? 1 : -1 } }));
        return;
      }
      if (overEditor || lastFocusedSurfaceRef.current === 'editor') {
        event.preventDefault();
        setEditorFontSize((current) => Math.max(8, Math.min(32, current + (event.deltaY < 0 ? 1 : -1))));
        return;
      }
      event.preventDefault();
      setAppZoom((current) => Math.max(.8, Math.min(1.4, Math.round((current + (event.deltaY < 0 ? .05 : -.05)) * 100) / 100)));
    };
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', handleWheel, true);
  }, [lastFocusedSurfaceRef, setAppZoom, setEditorFontSize]);
}
