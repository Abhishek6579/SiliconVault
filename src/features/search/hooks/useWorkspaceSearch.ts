import { useEffect, useState } from 'react';
import type { FileMeta } from '../../../storage/types';

export interface SearchResult { file: FileMeta; text: string; }

export function useWorkspaceSearch(files: FileMeta[], query: string, onError: (message: string) => void) {
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const needle = query.trim().toLocaleLowerCase();

    if (!needle) {
      // Only update when there is something to clear. A new [] on every run causes a render loop.
      setResults(current => (current.length === 0 ? current : []));
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const matches: SearchResult[] = [];
        for (const file of files) {
          if (file.name.toLocaleLowerCase().includes(needle)) {
            matches.push({ file, text: file.name });
            if (matches.length >= 100) break;
          }
        }
        if (!cancelled) setResults(matches);
      })().catch((reason: unknown) => {
        console.error('Workspace search failed:', reason);
        if (!cancelled) {
          onError(reason instanceof Error ? reason.message : 'Workspace name search failed.');
        }
      });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [files, onError, query]);

  return results;
}