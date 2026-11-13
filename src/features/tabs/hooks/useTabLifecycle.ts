import type { Dispatch, SetStateAction } from 'react';
import type { Tab } from '../types';

type RequestConfirmation = (title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>, destructive?: boolean) => void;

interface Options {
  tabs: Tab[];
  activeTabId: string | null;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
  requestConfirmation: RequestConfirmation;
  persistDraft: (id: string, draft: string) => Promise<void>;
}

export function useTabLifecycle({ tabs, activeTabId, setTabs, setActiveTabId, requestConfirmation, persistDraft }: Options) {
  function closeTab(id: string) {
    const tab = tabs.find((item) => item.id === id);
    const close = () => {
      const remaining = tabs.filter((item) => item.id !== id);
      setTabs(remaining);
      if (activeTabId === id) setActiveTabId(remaining.at(-1)?.id ?? null);
    };
    if (tab?.dirty) {
      requestConfirmation('Save before closing?', `“${tab.meta.name}” has unsaved changes. Save them before closing this tab?`, 'Save & close', async () => {
        await persistDraft(id, tab.draft);
        close();
      });
      return;
    }
    close();
  }

  return { closeTab };
}
