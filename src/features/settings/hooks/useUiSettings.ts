import { useEffect, useState } from 'react';
import { db } from '../../../storage/database';

export function useUiSettings(onError: (message: string) => void) {
  const [darkTheme, setDarkTheme] = useState(true);
  const [appZoom, setAppZoom] = useState(1);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void db.preferences.put({ key: 'appZoom', value: appZoom, updatedAt: Date.now() })
      .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : 'Could not save application zoom.'));
  }, [appZoom, onError, ready]);
  useEffect(() => {
    if (!ready) return;
    void db.preferences.put({ key: 'editorFontSize', value: editorFontSize, updatedAt: Date.now() })
      .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : 'Could not save editor font size.'));
  }, [editorFontSize, onError, ready]);

  async function toggleTheme() {
    const next = !darkTheme;
    setDarkTheme(next);
    try { await db.preferences.put({ key: 'theme', value: next ? 'dark' : 'light', updatedAt: Date.now() }); }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not save the theme preference.'); }
  }

  return { darkTheme, setDarkTheme, appZoom, setAppZoom, editorFontSize, setEditorFontSize, ready, setReady, toggleTheme };
}
