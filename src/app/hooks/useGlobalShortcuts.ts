import { useEffect } from 'react';

export function useGlobalShortcuts(
  setZoom: React.Dispatch<React.SetStateAction<number>>,
  setEditorFontSize: React.Dispatch<React.SetStateAction<number>>,
) {
  useEffect(() => {
    let lastFocusedSurface: 'pdf' | 'editor' | null = null;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.pdf-shell')) lastFocusedSurface = 'pdf';
      else if (target?.closest('.code-editor, .markdown-preview')) lastFocusedSurface = 'editor';
      else lastFocusedSurface = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const pdfFocused = Boolean(target?.closest('.pdf-shell')) || lastFocusedSurface === 'pdf';
      const editorFocused = Boolean(target?.closest('.code-editor, .markdown-preview')) || lastFocusedSurface === 'editor';
      if (pdfFocused) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('siliconvault:pdf-zoom', { detail: { direction: event.key === '-' || event.key === '_' ? -1 : event.key === '0' ? 0 : 1 } }));
      } else if (editorFocused && event.key !== '0') {
        event.preventDefault();
        setEditorFontSize((value) => Math.max(8, Math.min(32, value + (event.key === '-' || event.key === '_' ? -1 : 1))));
      } else if (event.key === '=' || event.key === '+') { event.preventDefault(); setZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 100) / 100)); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoom((value) => Math.max(0.8, Math.round((value - 0.1) * 100) / 100)); }
      else if (event.key === '0') { event.preventDefault(); setZoom(1); }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setZoom, setEditorFontSize]);
}
