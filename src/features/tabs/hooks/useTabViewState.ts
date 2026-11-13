import { useCallback } from 'react';
import { db } from '../../../storage/database';
import type { SetTabState } from './useWorkspaceTabs';
import type { EditorViewState, PdfViewState, Tab, ViewerViewState } from '../types';
import type { EditorView } from '@codemirror/view';

interface TabViewStateDependencies {
  setTabs: SetTabState;
  setError: (message: string) => void;
}

export function useTabViewState({ setTabs, setError }: TabViewStateDependencies) {
  const persistEditorViewState = useCallback((id: string, view: EditorView, preview: boolean) => {
    const selection = view.state.selection.main;
    const state: EditorViewState = {
      anchor: selection.anchor,
      head: selection.head,
      scrollTop: view.scrollDOM.scrollTop,
      scrollLeft: view.scrollDOM.scrollLeft,
      preview,
    };
    void db.preferences.put({ key: `editor:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save editor position.');
    });
  }, [setError]);

  const updateViewerView = useCallback((id: string, state: ViewerViewState) => {
    setTabs((current) => current.map((tab: Tab) => tab.id === id ? { ...tab, viewerState: state } : tab));
    void db.preferences.put({ key: `viewer:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save this file viewing position.');
    });
  }, [setError, setTabs]);

  const updatePdfView = useCallback((id: string, state: PdfViewState) => {
    setTabs((current) => current.map((tab: Tab) => tab.id === id ? { ...tab, pdfState: state } : tab));
    void db.preferences.put({ key: `pdf:${id}`, value: state, updatedAt: Date.now() }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not save this PDF reading position.');
    });
  }, [setError, setTabs]);

  return { persistEditorViewState, updateViewerView, updatePdfView };
}
