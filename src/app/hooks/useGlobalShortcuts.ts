import { useEffect } from 'react';

export function useGlobalShortcuts(setZoom: React.Dispatch<React.SetStateAction<number>>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); setZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 100) / 100)); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoom((value) => Math.max(0.8, Math.round((value - 0.1) * 100) / 100)); }
      else if (event.key === '0') { event.preventDefault(); setZoom(1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setZoom]);
}
