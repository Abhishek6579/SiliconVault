import type { Dispatch, RefObject, SetStateAction } from 'react';
import { Moon, Search, Settings2, Sun, X } from 'lucide-react';
import ImportMenu from './ImportMenu';

interface ImportTarget { folderId: string | null; projectId: string | null; workspaceId: string; }
interface Data {
  view: 'workspace' | 'recent' | 'trash';
  selectedFolder: string | null;
  activeProjectRecord: { name: string } | null;
  activeProject: string | null;
  currentWorkspaceId: string;
  importMenuOpen: boolean;
  importMenuRef: RefObject<HTMLDivElement | null>;
  darkTheme: boolean;
  status: string;
  searchOpen: boolean;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
}
interface Actions {
  setImportMenuOpen: Dispatch<SetStateAction<boolean>>;
  startImportInto: (target: ImportTarget) => void;
  startImportFolderInto: (target: ImportTarget) => void;
  createFolderInCurrent: () => void;
  createWorkspaceFile: (kind: 'markdown' | 'code') => Promise<void>;
  setSearchPopupOpen: Dispatch<SetStateAction<boolean>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setRightPanel: Dispatch<SetStateAction<'details' | 'search' | null>>;
  toggleTheme: () => Promise<void>;
  setDetailsOpen: () => void;
}
export default function TopbarActions({ data, actions }: { data: Data; actions: Actions }) {
  const { view, selectedFolder, activeProjectRecord, activeProject, currentWorkspaceId, importMenuOpen, importMenuRef, darkTheme, status, searchOpen, query, searchInputRef } = data;
  const { setImportMenuOpen, startImportInto, startImportFolderInto, createFolderInCurrent, createWorkspaceFile, setSearchPopupOpen, setQuery, setRightPanel, toggleTheme, setDetailsOpen } = actions;
  return <div className="topbar-actions">
    <ImportMenu data={{ view, selectedFolder, activeProjectRecord, activeProject, currentWorkspaceId, open: importMenuOpen, menuRef: importMenuRef }} actions={{ setOpen: setImportMenuOpen, startImportInto, startImportFolderInto, createFolderInCurrent, createWorkspaceFile }} />
    {searchOpen ? <div className="global-search-inline">
      <Search size={16} />
      <input ref={searchInputRef as RefObject<HTMLInputElement>} value={query} autoFocus aria-label="Search files and folders" placeholder="Search files and folders…" onChange={(event) => { setQuery(event.target.value); setRightPanel('search'); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setSearchPopupOpen(false); setRightPanel((current) => current === 'search' ? null : current); } }} />
      <kbd>ESC</kbd>
      <button type="button" className="global-search-close" aria-label="Close search" title="Close search" onClick={() => { setSearchPopupOpen(false); setRightPanel((current) => current === 'search' ? null : current); }}><X size={14} /></button>
    </div> : <button className="global-search-trigger" onClick={() => { setSearchPopupOpen(true); setRightPanel('search'); }} title="Search files and folders (Ctrl+F)"><Search size={16} /><span>Search files and folders</span><kbd>Ctrl F</kbd></button>}
    <button className="icon-button theme-toggle" title={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => void toggleTheme()}>{darkTheme ? <Sun size={16} /> : <Moon size={16} />}</button>
    <span className={`save-status ${status === 'Saved locally' ? 'saved' : ''}`}><span className="status-dot" />{status}</span>
    <button className="icon-button" title="Details" onClick={setDetailsOpen}><Settings2 size={17} /></button>
  </div>;
}
