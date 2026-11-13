import type { Tab } from '../types';

/** Drop retained PDF blobs from inactive tabs while preserving read-only viewer data. */
export function releaseInactiveTabData(tabs: Tab[], activeId: string): Tab[] {
  return tabs.map((tab) => {
    if (tab.id === activeId || !(tab.data instanceof Blob) || tab.meta.kind === 'viewer') return tab;
    const { data: _released, ...withoutPdfData } = tab;
    return { ...withoutPdfData, hydrated: false };
  });
}
