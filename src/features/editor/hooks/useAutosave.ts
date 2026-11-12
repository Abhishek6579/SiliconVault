import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { flushPendingAutosaves } from '../../../storage/autosave';
import { db } from '../../../storage/database';
import { saveFileText } from '../../../storage/files';
import { isDesktopApp } from '../../../platform/desktop';
import type { Tab } from '../../tabs/types';

type SetTabs = Dispatch<SetStateAction<Tab[]>>;

export function useAutosave(
  activeTab: Tab | null,
  setTabs: SetTabs,
  refresh: () => Promise<void>,
  setError: (message: string) => void,
  setStatus: (message: string) => void,
) {
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const draftRecoveryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveChains = useRef(new Map<string, Promise<void>>());
  const draftRevisions = useRef(new Map<string, number>());
  const pendingDrafts = useRef(new Map<string, string>());
  const closeInProgress = useRef(false);

  const persistDraft = useCallback(async (id: string, draft: string) => {
    const pendingTimer = saveTimers.current.get(id);
    if (pendingTimer) clearTimeout(pendingTimer);
    saveTimers.current.delete(id);
    const recoveryTimer = draftRecoveryTimers.current.get(id);
    if (recoveryTimer) clearTimeout(recoveryTimer);
    draftRecoveryTimers.current.delete(id);
    const revision = draftRevisions.current.get(id) ?? 0;
    const previousSave = saveChains.current.get(id) ?? Promise.resolve();
    const save = previousSave.catch(() => undefined).then(() => saveFileText(db, id, draft)).then(async () => {
      if (draftRevisions.current.get(id) === revision) {
        await db.preferences.delete(`draft:${id}`);
        setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, dirty: false, meta: { ...tab.meta, size: new TextEncoder().encode(draft).byteLength, updatedAt: Date.now() } } : tab));
        pendingDrafts.current.delete(id);
        setStatus('Saved locally');
      }
    }).catch((reason: unknown) => {
      if (draftRevisions.current.get(id) === revision) { setStatus('Could not save'); setError(reason instanceof Error ? reason.message : 'Unable to save changes.'); }
      throw reason;
    });
    saveChains.current.set(id, save);
    await save;
    await refresh();
  }, [refresh, setError, setStatus, setTabs]);

  const updateDraft = useCallback((id: string, draft: string) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, draft, dirty: true } : tab));
    pendingDrafts.current.set(id, draft);
    const recoveryTimer = draftRecoveryTimers.current.get(id);
    if (recoveryTimer) clearTimeout(recoveryTimer);
    draftRecoveryTimers.current.set(id, setTimeout(() => {
      draftRecoveryTimers.current.delete(id);
      void db.preferences.put({ key: `draft:${id}`, value: draft, updatedAt: Date.now() }).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Could not persist the crash-recovery draft.');
      });
    }, 150));
    const revision = (draftRevisions.current.get(id) ?? 0) + 1;
    draftRevisions.current.set(id, revision);
    setStatus('Unsaved changes · Auto-save in 1 second');
    const previous = saveTimers.current.get(id);
    if (previous) clearTimeout(previous);
    saveTimers.current.set(id, setTimeout(() => {
      saveTimers.current.delete(id);
      void persistDraft(id, draft).catch(() => undefined);
    }, 1000));
  }, [persistDraft, setError, setStatus, setTabs]);

  const flushPendingSaves = useCallback(async () => {
    await flushPendingAutosaves(pendingDrafts.current, saveTimers.current, persistDraft);
    await Promise.all([...saveChains.current.values()]);
  }, [persistDraft]);

  const trackRecoveredDraft = useCallback((id: string, draft: string) => pendingDrafts.current.set(id, draft), []);
  const waitForSave = useCallback((id: string) => saveChains.current.get(id) ?? Promise.resolve(), []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (!isDesktopApp()) {
      const warnBeforeUnload = (event: BeforeUnloadEvent) => {
        if (pendingDrafts.current.size === 0) return;
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', warnBeforeUnload);
      return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }
    const currentWindow = getCurrentWindow();
    void currentWindow.onCloseRequested(async (event) => {
      if (closeInProgress.current) return;
      event.preventDefault();
      closeInProgress.current = true;
      try {
        await flushPendingSaves();
        await Promise.all([...saveChains.current.values()]);
        await currentWindow.close();
      } catch (reason) {
        closeInProgress.current = false;
        setStatus('Save failed · close cancelled');
        setError(reason instanceof Error ? reason.message : 'Unsaved changes could not be saved. The application remains open.');
      }
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not register safe shutdown handling.');
    });
    return () => { disposed = true; unlisten?.(); };
  }, [flushPendingSaves, setError, setStatus]);

  useEffect(() => {
    const onSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
      if (!activeTab || !activeTab.dirty || !['code', 'text', 'markdown'].includes(activeTab.meta.kind)) return;
      event.preventDefault();
      void persistDraft(activeTab.id, activeTab.draft).catch(() => undefined);
    };
    window.addEventListener('keydown', onSaveShortcut);
    return () => window.removeEventListener('keydown', onSaveShortcut);
  }, [activeTab, persistDraft]);

  return { updateDraft, persistDraft, flushPendingSaves, trackRecoveredDraft, waitForSave };
}
