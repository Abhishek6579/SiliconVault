import { useEffect, useState } from 'react';
import { writePreference } from '../../../storage/preferenceStore';

export function useUiSettings(onError: (message: string) => void) {
  const [darkTheme, setDarkTheme] = useState(true);
  const [appZoom, setAppZoom] = useState(1);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void writePreference('appZoom', appZoom)
      .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : 'Could not save application zoom.'));
  }, [appZoom, onError, ready]);
  useEffect(() => {
    if (!ready) return;
    void writePreference('editorFontSize', editorFontSize)
      .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : 'Could not save editor font size.'));
  }, [editorFontSize, onError, ready]);

  async function toggleTheme() {
    const next = !darkTheme;
    setDarkTheme(next);
    try { await writePreference('theme', next ? 'dark' : 'light'); }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not save the theme preference.'); }
  }

  return { darkTheme, setDarkTheme, appZoom, setAppZoom, editorFontSize, setEditorFontSize, ready, setReady, toggleTheme };
}
