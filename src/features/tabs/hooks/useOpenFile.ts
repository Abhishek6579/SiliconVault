import { useCallback } from 'react';
import { hydratePersistedWorkspaceTab, savePersistedWorkspaceSession } from '../../../storage/tabSession';
import { kindForFile } from '../../../storage/files';
import { releaseInactiveTabData } from '../utils/releaseInactiveTabData';
import type { FileMeta } from '../../../storage/types';
import type { Tab } from '../types';
import type { SetTabState } from './useWorkspaceTabs';
import { logger } from '../../../logger.js';
import { errorContext } from '../../../shared/logging/errorContext';

interface OpenFileDependencies {
  activeWorkspaceId: string | null;
  activeTabId: string | null;
  tabs: Tab[];
  setTabs: SetTabState;
  setActiveTabId: (id: string | null) => void;
  setActiveProject: (id: string | null) => void;
  setSelectedFolder: (id: string | null) => void;
  setView: (view: 'workspace' | 'recent' | 'trash') => void;
  switchWorkspace: (id: string) => Promise<void>;
  restoreWorkspaceTabs: (id: string) => Promise<{ tabs: Tab[]; activeTabId: string | null }>;
  trackRecoveredDraft: (id: string, draft: string) => void;
  setError: (message: string) => void;
  setStatus: (message: string) => void;
}

/** Opens and hydrates a tab, committing its session before publishing it in UI state. */
export function useOpenFile(dependencies: OpenFileDependencies) {
  const {
    activeWorkspaceId, activeTabId, tabs, setTabs, setActiveTabId, setActiveProject,
    setSelectedFolder, setView, switchWorkspace, restoreWorkspaceTabs,
    trackRecoveredDraft, setError, setStatus,
  } = dependencies;

  return useCallback(async (fileMeta: FileMeta) => {
    const meta: FileMeta = { ...fileMeta, kind: kindForFile(fileMeta.name, fileMeta.mimeType) };
    let restoredTabs: Tab[] = [];
    if (meta.workspaceId !== activeWorkspaceId) {
      if (activeWorkspaceId) {
        await savePersistedWorkspaceSession(activeWorkspaceId, tabs.filter((tab) => tab.meta.workspaceId === activeWorkspaceId).map((tab) => tab.id), activeTabId);
      }
      await switchWorkspace(meta.workspaceId);
      const restored = await restoreWorkspaceTabs(meta.workspaceId);
      restoredTabs = restored.tabs;
      setActiveProject(meta.projectId);
      setSelectedFolder(meta.parentFolderId);
      setView('workspace');
    }

    const existing = tabs.find((tab) => tab.id === meta.id) ?? restoredTabs.find((tab) => tab.id === meta.id);
    const persistOpenTabSession = async () => {
      const currentWorkspaceTabs = (meta.workspaceId === activeWorkspaceId ? tabs : restoredTabs)
        .filter((tab) => tab.meta.workspaceId === meta.workspaceId);
      const openFileIds = [...new Set([...currentWorkspaceTabs.map((tab) => tab.id), meta.id])];
      try {
        await savePersistedWorkspaceSession(meta.workspaceId, openFileIds, meta.id);
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not save the open-tab session.');
        return false;
      }
    };

    if (existing) {
      let hydrated: Tab;
      try {
        hydrated = existing.hydrated !== true ? await hydratePersistedWorkspaceTab(existing) : existing;
      } catch (reason) {
        void logger.error('file.open.failed', 'An existing workspace tab could not be hydrated.', errorContext(reason));
        setError(reason instanceof Error ? reason.message : `Could not open “${meta.name}”.`);
        return;
      }
      if (hydrated.dirty) trackRecoveredDraft(meta.id, hydrated.draft);
      if (!(await persistOpenTabSession())) return;
      setTabs((current) => releaseInactiveTabData(current.map((tab) => tab.id === meta.id ? hydrated : tab), meta.id));
      setActiveTabId(meta.id);
      setError('');
      return;
    }

    let newTab: Tab;
    try {
      newTab = await hydratePersistedWorkspaceTab({ id: meta.id, meta, draft: '', dirty: false, preview: meta.kind === 'markdown' });
    } catch (reason) {
      void logger.error('file.open.failed', 'A workspace file could not be opened.', errorContext(reason));
      setError(reason instanceof Error ? reason.message : `Could not open “${meta.name}”.`);
      return;
    }
    if (newTab.dirty) trackRecoveredDraft(meta.id, newTab.draft);
    if (!(await persistOpenTabSession())) return;
    setTabs((current) => [...releaseInactiveTabData(current, meta.id), newTab]);
    setActiveTabId(meta.id);
    if (newTab.dirty) setStatus('Recovered an unsaved draft · Save to keep these changes');
    setError('');
  }, [activeTabId, activeWorkspaceId, restoreWorkspaceTabs, setActiveProject, setActiveTabId,
    setError, setSelectedFolder, setStatus, setTabs, setView, switchWorkspace, tabs, trackRecoveredDraft]);
}
