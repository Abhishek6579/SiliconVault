import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';

type FocusedSurface = 'pdf' | 'editor' | null;

interface GlobalSearchShortcutOptions {
  lastFocusedSurfaceRef: MutableRefObject<FocusedSurface>;
  setSearchPopupOpen: Dispatch<SetStateAction<boolean>>;
  setRightPanel: Dispatch<SetStateAction<'details' | 'search' | null>>;
}

export function useGlobalSearchShortcut({ lastFocusedSurfaceRef, setSearchPopupOpen, setRightPanel }: GlobalSearchShortcutOptions) {
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
      event.stopPropagation();
      setSearchPopupOpen(true);
      setRightPanel('search');
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleShortcut, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleShortcut, true);
    };
  }, [lastFocusedSurfaceRef, setRightPanel, setSearchPopupOpen]);
}
