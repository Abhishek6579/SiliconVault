import { useEffect, type MutableRefObject, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { EditorView } from '@codemirror/view';
import { isModKey } from '../../../shared/keyboard/modifier';

type FocusedSurface = 'pdf' | 'editor' | 'document' | null;

interface GlobalSearchShortcutOptions {
  lastFocusedSurfaceRef: MutableRefObject<FocusedSurface>;
  editorViewRef: MutableRefObject<EditorView | null>;
  activeTabId: string | null;
  searchInputRef: RefObject<HTMLInputElement | null>;
  setSearchPopupOpen: Dispatch<SetStateAction<boolean>>;
  setRightPanel: Dispatch<SetStateAction<'details' | 'search' | null>>;
}

export function useGlobalSearchShortcut({ lastFocusedSurfaceRef, editorViewRef, activeTabId, searchInputRef, setSearchPopupOpen, setRightPanel }: GlobalSearchShortcutOptions) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.pdf-shell')) lastFocusedSurfaceRef.current = 'pdf';
      else if (target?.closest('.code-editor, .markdown-preview')) lastFocusedSurfaceRef.current = 'editor';
      else if (target?.closest('.office-viewer, .file-viewer')) lastFocusedSurfaceRef.current = 'document';
      else lastFocusedSurfaceRef.current = null;
    };
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isModKey(event) || event.altKey) {
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
      const target = event.target instanceof Element ? event.target : null;
      const focusedSurface = target?.closest('.pdf-shell') ? 'pdf'
        : target?.closest('.code-editor, .markdown-preview') ? 'editor'
        : target?.closest('.office-viewer, .file-viewer') ? 'document'
        : lastFocusedSurfaceRef.current;
      if (key === 'f') {
        if (focusedSurface === 'pdf') {
          window.dispatchEvent(new CustomEvent('siliconvault:open-file-search', { detail: { tabId: activeTabId } }));
          return;
        }
        if (focusedSurface === 'editor') {
          // WorkspaceEditor also handles Markdown preview mode, where the
          // CodeMirror view is intentionally unmounted.
          window.dispatchEvent(new CustomEvent('siliconvault:open-editor-search', { detail: { tabId: activeTabId } }));
          return;
        }
        if (focusedSurface === 'document') {
          window.dispatchEvent(new CustomEvent('siliconvault:open-document-search', { detail: { tabId: activeTabId } }));
          return;
        }
      }
      setSearchPopupOpen(true);
      setRightPanel(null);
      // The input is mounted by the state update; explicitly focus it after React commits.
      window.setTimeout(() => searchInputRef?.current?.focus(), 0);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleShortcut, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleShortcut, true);
    };
  }, [lastFocusedSurfaceRef, editorViewRef, activeTabId, searchInputRef, setRightPanel, setSearchPopupOpen]);
}
