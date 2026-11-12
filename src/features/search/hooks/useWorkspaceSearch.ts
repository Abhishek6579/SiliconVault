import { useEffect, useState } from 'react';
import { db } from '../../../storage/database';
import type { FileMeta } from '../../../storage/types';

export interface SearchResult { file: FileMeta; text: string; }

export function useWorkspaceSearch(files: FileMeta[], query: string, onError: (message: string) => void) {
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) { setResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const matches: SearchResult[] = [];
        for (const file of files) {
          const titleMatch = file.name.toLocaleLowerCase().includes(needle);
          let text = '';
          if (file.kind === 'markdown' || file.kind === 'code' || file.kind === 'text') {
            const content = await db.contents.get(file.id);
            if (typeof content?.data === 'string') text = content.data;
            else if (content?.data instanceof Blob) text = await content.data.text();
          }
          if (cancelled) return;
          if (titleMatch || text.toLocaleLowerCase().includes(needle)) {
            const index = text.toLocaleLowerCase().indexOf(needle);
            const snippet = index < 0 ? file.name : text.slice(Math.max(0, index - 56), Math.min(text.length, index + needle.length + 88)).trim();
            matches.push({ file, text: snippet });
            if (matches.length >= 100) break;
          }
        }
        if (!cancelled) setResults(matches);
      })().catch((reason: unknown) => {
        if (!cancelled) onError(reason instanceof Error ? reason.message : 'Search could not read workspace content.');
      });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [files, onError, query]);

  return results;
}
