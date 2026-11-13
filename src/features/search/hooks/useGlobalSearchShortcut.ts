import { useEffect, type MutableRefObject, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';

type FocusedSurface = 'pdf' | 'editor' | null;

interface GlobalSearchShortcutOptions {
  editorViewRef: RefObject<EditorView | null>;
  lastFocusedSurfaceRef: MutableRefObject<FocusedSurface>;
  setSearchPopupOpen: Dispatch<SetStateAction<boolean>>;
  setRightPanel: Dispatch<SetStateAction<'details' | 'search' | null>>;
}

export function useGlobalSearchShortcut({ editorViewRef, lastFocusedSurfaceRef, setSearchPopupOpen, setRightPanel }: GlobalSearchShortcutOptions) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.pdf-shell')) lastFocusedSurfaceRef.current = 'pdf';
      else if (target?.closest('.code-editor, .markdown-preview')) lastFocusedSurfaceRef.current = 'editor';
      else lastFocusedSurfaceRef.current = null;
    };
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        if (event.key === 'Escape') {
          setSearchPopupOpen(false);
          setRightPanel((current) => current === 'search' ? null : current);
        }
        return;
      }
      if (event.key.toLowerCase() !== 'k' && event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      const target = event.target instanceof Element ? event.target : null;
      const pdfFocused = target?.closest('.pdf-shell') || lastFocusedSurfaceRef.current === 'pdf';
      const editorFocused = target?.closest('.code-editor, .markdown-preview') || lastFocusedSurfaceRef.current === 'editor';
      if (event.key.toLowerCase() === 'f' && pdfFocused) {
        window.dispatchEvent(new Event('siliconvault:open-file-search'));
      } else if (event.key.toLowerCase() === 'f' && editorFocused && editorViewRef.current?.dom.isConnected) {
        openSearchPanel(editorViewRef.current);
        window.setTimeout(() => {
          const searchField = document.querySelector<HTMLInputElement>('.cm-search input');
          if (searchField) searchField.placeholder = 'Find in current file…';
        }, 0);
      } else {
        setSearchPopupOpen(true);
        setRightPanel('search');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleShortcut);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleShortcut);
    };
  }, [editorViewRef, lastFocusedSurfaceRef, setRightPanel, setSearchPopupOpen]);
}
