import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { flushPendingAutosaves } from '../../../storage/autosave';
import { db } from '../../../storage/database';
import { deletePreference, writePreference } from '../../../storage/preferenceStore';
import { saveFileText } from '../../../storage/files';
import { platform } from '../../../platform';
import type { Tab } from '../../tabs/types';
import { logger } from '../../../logger.js';
import { errorContext } from '../../../shared/logging/errorContext';

type SetTabs = Dispatch<SetStateAction<Tab[]>>;

export function useAutosave(
  activeTab: Tab | null,
  setTabs: SetTabs,
  refresh: () => Promise<void>,
  setError: (message: string) => void,
  setStatus: (message: string) => void,
  flushSession: () => Promise<void> = async () => undefined,
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

    const tracked: Promise<void> = previousSave
      .catch(() => undefined)
      .then(() => saveFileText(db, id, draft))
      .then(async () => {
        // Only clear the draft if the user has not typed since this save started.
        if ((draftRevisions.current.get(id) ?? 0) === revision) {
          await deletePreference(`draft:${id}`);
          pendingDrafts.current.delete(id);
          setTabs((current) => current.map((tab) => tab.id === id
            ? {
                ...tab,
                dirty: false,
                meta: { ...tab.meta, size: new TextEncoder().encode(draft).byteLength, updatedAt: Date.now() },
              }
            : tab));
          setStatus('Saved locally');
        }
      })
      .catch((reason: unknown) => {
        // The draft stays in pendingDrafts, so the next save or close attempt retries it.
        console.error('persistDraft failed for', id, reason);
        void logger.error('editor.autosave.failed', 'An editor draft could not be saved.', errorContext(reason));
        if ((draftRevisions.current.get(id) ?? 0) === revision) {
          setStatus('Could not save');
          setError(reason instanceof Error ? reason.message : 'Unable to save changes.');
        }
        throw reason;
      });

    saveChains.current.set(id, tracked);

    // Remove failed or finished saves from the chain. Otherwise a single old failure
    // rejects every later close attempt, even when nothing new was edited.
    tracked
      .catch(() => undefined)
      .finally(() => {
        if (saveChains.current.get(id) === tracked) saveChains.current.delete(id);
      });

    await tracked;
    await refresh();
  }, [refresh, setError, setStatus, setTabs]);

  const updateDraft = useCallback((id: string, draft: string) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, draft, dirty: true } : tab));
    pendingDrafts.current.set(id, draft);

    const recoveryTimer = draftRecoveryTimers.current.get(id);
    if (recoveryTimer) clearTimeout(recoveryTimer);
    draftRecoveryTimers.current.set(id, setTimeout(() => {
      draftRecoveryTimers.current.delete(id);
      void writePreference(`draft:${id}`, draft).catch((reason: unknown) => {
        console.error('Crash-recovery draft write failed for', id, reason);
        void logger.error('editor.recovery_draft.failed', 'Crash-recovery draft persistence failed.', errorContext(reason));
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
    await flushSession();
  }, [flushSession, persistDraft]);

  const trackRecoveredDraft = useCallback((id: string, draft: string) => {
    // Recovered drafts have no in-memory revision yet. Initialize revision zero
    // so a successful flush clears the pending entry instead of looping forever.
    if (!draftRevisions.current.has(id)) draftRevisions.current.set(id, 0);
    pendingDrafts.current.set(id, draft);
  }, []);

  const waitForSave = useCallback((id: string) => saveChains.current.get(id) ?? Promise.resolve(), []);

  useEffect(() => {
    if (!platform.capabilities.safeShutdown) {
      const warnBeforeUnload = (event: BeforeUnloadEvent) => {
        if (pendingDrafts.current.size === 0) return;
        event.preventDefault();
        event.returnValue = '';
      };
      const persistWorkspaceBeforePageHide = () => {
        void flushPendingSaves().catch((reason: unknown) => {
          console.error('Could not persist workspace data before page hide.', reason);
        });
      };
      window.addEventListener('beforeunload', warnBeforeUnload);
      window.addEventListener('pagehide', persistWorkspaceBeforePageHide);
      return () => {
        window.removeEventListener('beforeunload', warnBeforeUnload);
        window.removeEventListener('pagehide', persistWorkspaceBeforePageHide);
      };
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void platform.onCloseRequested(async (retryClose) => {
      // Ignore a second close request while the first is still saving.
      if (closeInProgress.current) {
        return;
      }
      closeInProgress.current = true;
      try {
        await flushPendingSaves();
        await retryClose();
      } catch (reason) {
        closeInProgress.current = false;
        console.error('Close cancelled: save failed.', reason);
        void logger.error('app.shutdown_cancelled', 'Application close was cancelled because pending edits could not be saved.', errorContext(reason));
        setStatus('Save failed · close cancelled');
        setError(reason instanceof Error ? reason.message : 'Unsaved changes could not be saved. The application remains open.');
      }
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch((reason: unknown) => {
      console.error('Could not register close handler.', reason);
      setError(reason instanceof Error ? reason.message : 'Could not register safe shutdown handling.');
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [flushPendingSaves, flushSession, setError, setStatus]);

  return { updateDraft, persistDraft, flushPendingSaves, trackRecoveredDraft, waitForSave };
}
