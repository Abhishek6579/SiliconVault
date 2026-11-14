import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { restorePersistedWorkspaceSession, savePersistedWorkspaceSession } from '../../../storage/tabSession';
import type { Tab } from '../types';

export type SetTabState = Dispatch<SetStateAction<Tab[]>>;

/** Owns workspace-scoped tab state, session restoration, and durable session writes. */
export function useWorkspaceTabs(
  activeWorkspaceId: string | null,
  loading: boolean,
  setError: (message: string) => void,
) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const workspaceTabs = useMemo(
    () => tabs.filter((tab) => tab.meta.workspaceId === activeWorkspaceId),
    [activeWorkspaceId, tabs],
  );
  const workspaceTabSignature = workspaceTabs.map((tab) => tab.id).join('\u0000');
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  // A workspace switch updates activeWorkspaceId before its IndexedDB session
  // has been restored. Do not let the autosave effect persist the previous
  // workspace's empty/stale React state over the destination session.
  const restoredWorkspaceId = useRef<string | null>(null);

  const restoreWorkspaceTabs = useCallback(async (workspaceId: string) => {
    const restored = await restorePersistedWorkspaceSession(workspaceId);
    restoredWorkspaceId.current = workspaceId;
    setTabs((current) => {
      const existingTabs = new Map(
        current.filter((tab) => tab.meta.workspaceId === workspaceId).map((tab) => [tab.id, tab]),
      );
      return [
        ...current.filter((tab) => tab.meta.workspaceId !== workspaceId),
        ...restored.tabs.map((tab) => existingTabs.get(tab.id) ?? tab),
      ];
    });
    setActiveTabId(restored.activeTabId);
    return restored;
  }, []);

  useEffect(() => {
    if (loading || !activeWorkspaceId || restoredWorkspaceId.current !== activeWorkspaceId) return;
    const workspaceId = activeWorkspaceId;
    const openFileIds = workspaceTabSignature ? workspaceTabSignature.split('\u0000') : [];
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      saveChain.current = saveChain.current
        .catch(() => undefined)
        .then(() => savePersistedWorkspaceSession(workspaceId, openFileIds, activeTabId).then(() => undefined))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save the open-tab session.'));
    }, 120);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [activeTabId, activeWorkspaceId, loading, setError, workspaceTabSignature]);

  const flushWorkspaceSession = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await saveChain.current.catch(() => undefined);
    if (!activeWorkspaceId || restoredWorkspaceId.current !== activeWorkspaceId) return;
    const openFileIds = workspaceTabSignature ? workspaceTabSignature.split('\u0000') : [];
    await savePersistedWorkspaceSession(activeWorkspaceId, openFileIds, activeTabId);
  }, [activeTabId, activeWorkspaceId, workspaceTabSignature]);

  return { tabs, setTabs, activeTabId, setActiveTabId, restoreWorkspaceTabs, flushWorkspaceSession };
}
