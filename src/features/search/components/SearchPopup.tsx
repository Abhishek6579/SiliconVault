import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  query: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onClose: () => void;
}
export default function SearchPopup({ query, inputRef, onQueryChange, onClose }: Props) {
  return <div className="search-popup-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="search-popup" role="dialog" aria-modal="true" aria-label="Search files and folders">
      <div className="search-popup-input"><Search size={17} /><input ref={inputRef} value={query} placeholder="Search files, folders and note/code content…" onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Escape' || event.key === 'Enter') onClose(); }} /><kbd>ESC</kbd><button className="icon-button" aria-label="Close search" onClick={onClose}><X size={15} /></button></div>
      <div className="search-popup-scope">Searching file and folder names, plus note/code text</div>
    </section>
  </div>;
}
