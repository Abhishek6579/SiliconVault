import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';

type FocusedSurface = 'pdf' | 'editor' | 'document' | null;

interface GlobalSearchShortcutOptions {
  lastFocusedSurfaceRef: MutableRefObject<FocusedSurface>;
  editorViewRef: MutableRefObject<EditorView | null>;
  setSearchPopupOpen: Dispatch<SetStateAction<boolean>>;
  setRightPanel: Dispatch<SetStateAction<'details' | 'search' | null>>;
}

export function useGlobalSearchShortcut({ lastFocusedSurfaceRef, editorViewRef, setSearchPopupOpen, setRightPanel }: GlobalSearchShortcutOptions) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.pdf-shell')) lastFocusedSurfaceRef.current = 'pdf';
      else if (target?.closest('.code-editor, .markdown-preview')) lastFocusedSurfaceRef.current = 'editor';
      else if (target?.closest('.office-viewer, .file-viewer')) lastFocusedSurfaceRef.current = 'document';
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
      const key = event.key.toLowerCase();
      if (key !== 'k' && key !== 'f') return;
      event.preventDefault();
      event.stopPropagation();
      if (key === 'f') {
        if (lastFocusedSurfaceRef.current === 'pdf') {
          window.dispatchEvent(new Event('siliconvault:open-file-search'));
          return;
        }
        if (lastFocusedSurfaceRef.current === 'editor') {
          const view = editorViewRef.current;
          if (view?.dom.isConnected) { openSearchPanel(view); return; }
        }
        if (lastFocusedSurfaceRef.current === 'document') {
          window.dispatchEvent(new Event('siliconvault:open-document-search'));
          return;
        }
      }
      setSearchPopupOpen(true);
      setRightPanel('search');
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleShortcut, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleShortcut, true);
    };
  }, [lastFocusedSurfaceRef, editorViewRef, setRightPanel, setSearchPopupOpen]);
}
