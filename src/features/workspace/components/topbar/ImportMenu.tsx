import type { Dispatch, Ref, SetStateAction } from 'react';
import { Code2, ChevronDown, FilePlus2, FileText, FolderPlus, Import } from 'lucide-react';

interface Target { folderId: string | null; projectId: string | null; workspaceId: string; }
interface Data {
  view: 'workspace' | 'recent' | 'trash';
  selectedFolder: string | null;
  activeProjectRecord: { name: string } | null;
  activeProject: string | null;
  currentWorkspaceId: string;
  open: boolean;
  menuRef: Ref<HTMLDivElement>;
}
interface Actions {
  setOpen: Dispatch<SetStateAction<boolean>>;
  startImportInto: (target: Target) => void;
  startImportFolderInto: (target: Target) => void;
  createFolderInCurrent: () => void;
  createWorkspaceFile: (kind: 'markdown' | 'code') => Promise<void>;
}
export default function ImportMenu({ data, actions }: { data: Data; actions: Actions }) {
  const { view, selectedFolder, activeProjectRecord, activeProject, currentWorkspaceId, open, menuRef } = data;
  const { setOpen, startImportInto, startImportFolderInto, createFolderInCurrent, createWorkspaceFile } = actions;
  const target = { folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId };
  return view === 'workspace' ? <div className="import-menu-wrapper" ref={menuRef}>
    <button className="primary-button import-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Import size={15} /> Import <ChevronDown size={13} /></button>
    {open && <div className="import-menu">
      <div className="menu-heading">ADD TO {selectedFolder ? 'FOLDER' : activeProjectRecord?.name?.toLocaleUpperCase() ?? 'WORKSPACE'}</div>
      <button onClick={() => { setOpen(false); startImportInto(target); }}><FileText size={15} /><span>Import files</span></button>
      <button onClick={() => { setOpen(false); startImportFolderInto(target); }}><FolderPlus size={15} /><span>Import folder</span></button>
      <div className="switch-menu-separator" />
      <button onClick={() => { setOpen(false); void createFolderInCurrent(); }}><FolderPlus size={15} /><span>New folder</span></button>
      <button onClick={() => { setOpen(false); void createWorkspaceFile('markdown'); }}><FilePlus2 size={15} /><span>New note</span></button>
      <button onClick={() => { setOpen(false); void createWorkspaceFile('code'); }}><Code2 size={15} /><span>New code file</span></button>
    </div>}
  </div> : null;
}
