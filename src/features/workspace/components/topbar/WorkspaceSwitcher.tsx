import type { Dispatch, RefObject, SetStateAction } from 'react';
import { Archive, Check, ChevronDown, Clock3, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import type { FileMeta, Folder as FolderRecord, Project, Workspace } from '../../../../storage/types';

type View = 'workspace' | 'recent' | 'trash';
interface Data {
  view: View;
  activeWorkspace: Workspace | null;
  activeWorkspaceId: string | null;
  activeProjectRecord: Project | null;
  activeProject: string | null;
  selectedFolder: string | null;
  folders: FolderRecord[];
  workspaces: Workspace[];
  activeProjects: Project[];
  trashedFiles: FileMeta[];
  open: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
}
interface Actions {
  setOpen: Dispatch<SetStateAction<boolean>>;
  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: () => void;
  renameWorkspace: (workspace: Workspace) => void;
  deleteCurrentWorkspace: () => void;
  switchProject: (id: string | null) => Promise<void>;
  setView: Dispatch<SetStateAction<View>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
  createProject: () => void;
  doEmptyTrash: () => Promise<void>;
  restoreProject: (project: Project) => Promise<void>;
  deleteProject: (project: Project) => Promise<void>;
  deleteFolder: (folder: FolderRecord) => Promise<void>;
}

export default function WorkspaceSwitcher({ data, actions }: { data: Data; actions: Actions }) {
  const { view, activeWorkspace, activeWorkspaceId, activeProjectRecord, activeProject, selectedFolder, folders, workspaces, activeProjects, trashedFiles, open, menuRef } = data;
  const { setOpen, switchWorkspace, createWorkspace, renameWorkspace, deleteCurrentWorkspace, switchProject, setView, setActiveTabId, createProject, doEmptyTrash, restoreProject, deleteProject, deleteFolder } = actions;
  return (
    <div className="workspace-switcher" ref={menuRef}>
      <button className="workspace-switch-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Layers size={16} /><span>{view === 'trash' ? 'Trash' : view === 'recent' ? 'Recent files' : activeWorkspace?.name ?? 'Workspace'}{activeProjectRecord ? ` / ${activeProjectRecord.name}` : ''}</span>
        {selectedFolder && view === 'workspace' && <small> / {folders.find((folder) => folder.id === selectedFolder)?.name}</small>}
        <ChevronDown size={14} />
      </button>
      {open && <div className="workspace-switch-menu">
        <div className="menu-heading">WORKSPACES</div>
        {workspaces.map((workspace) => <button key={workspace.id} className={workspace.id === activeWorkspaceId ? 'current' : ''} onClick={() => void switchWorkspace(workspace.id)}><Layers size={15} /><span>{workspace.name}</span>{workspace.id === activeWorkspaceId && <Check size={14} />}</button>)}
        <button onClick={() => { setOpen(false); createWorkspace(); }}><Plus size={15} /><span>New workspace…</span></button>
        {activeWorkspace && <>
          <button onClick={() => { setOpen(false); renameWorkspace(activeWorkspace); }}><Pencil size={15} /><span>Rename this workspace…</span></button>
          <button className="workspace-delete-option" onClick={() => { setOpen(false); deleteCurrentWorkspace(); }}><Trash2 size={15} /><span>Delete this workspace…</span></button>
        </>}
        <div className="switch-menu-separator" />
        <div className="menu-heading">PROJECTS IN {activeWorkspace?.name?.toLocaleUpperCase() ?? 'WORKSPACE'}</div>
        <button className={!activeProject && view === 'workspace' ? 'current' : ''} onClick={() => void switchProject(null)}><Layers size={15} /><span>General files</span>{!activeProject && view === 'workspace' && <Check size={14} />}</button>
        {activeProjects.map((project) => <button key={project.id} className={activeProject === project.id && view === 'workspace' ? 'current' : ''} onClick={() => void switchProject(project.id)}><span className="project-dot" /><span>{project.name}</span>{activeProject === project.id && view === 'workspace' && <Check size={14} />}</button>)}
        <div className="switch-menu-separator" />
        <button onClick={() => { setView('recent'); setActiveTabId(null); setOpen(false); }}><Clock3 size={15} /><span>Recent files</span></button>
        <button onClick={() => { setView('trash'); setActiveTabId(null); setOpen(false); }}><Trash2 size={15} /><span>Trash</span></button>
        <button onClick={() => { setOpen(false); void createProject(); }}><Plus size={15} /><span>New project…</span></button>
        {(view === 'trash' && trashedFiles.length > 0) || (view === 'workspace' && (activeProjectRecord || selectedFolder)) ? <>
          <div className="switch-menu-separator" />
          <div className="menu-heading">CURRENT VIEW</div>
          {view === 'trash' && trashedFiles.length > 0 && <button className="workspace-delete-option" onClick={() => { setOpen(false); void doEmptyTrash(); }}><Trash2 size={15} /><span>Empty trash…</span></button>}
          {view === 'workspace' && activeProjectRecord?.archived && <button onClick={() => { setOpen(false); void restoreProject(activeProjectRecord); }}><Archive size={15} /><span>Restore project</span></button>}
          {view === 'workspace' && activeProjectRecord && !activeProjectRecord.archived && <button className="workspace-delete-option" onClick={() => { setOpen(false); void deleteProject(activeProjectRecord); }}><Trash2 size={15} /><span>Delete project…</span></button>}
          {view === 'workspace' && selectedFolder && folders.find((folder) => folder.id === selectedFolder) && <button className="workspace-delete-option" onClick={() => { setOpen(false); void deleteFolder(folders.find((folder) => folder.id === selectedFolder)!); }}><Trash2 size={15} /><span>Delete folder…</span></button>}
        </> : null}
      </div>}
    </div>
  );
}
