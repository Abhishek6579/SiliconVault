import { ChevronRight, Folder, Layers, Plus } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { Folder as FolderRecord, FileMeta, Project } from '../../../../storage/types';

interface Data {
  view: 'workspace' | 'recent' | 'trash';
  activeProject: string | null;
  selectedFolder: string | null;
  activeProjects: Project[];
  generalRootFolders: FolderRecord[];
  liveFiles: FileMeta[];
  folders: FolderRecord[];
}
interface Actions {
  createProject: () => void;
  switchProject: (id: string) => void;
  setSelectedFolder: Dispatch<SetStateAction<string | null>>;
  setActiveProject: Dispatch<SetStateAction<string | null>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
}
export default function WorkspaceOverview({ data, actions }: { data: Data; actions: Actions }) {
  const { view, activeProject, selectedFolder, activeProjects, generalRootFolders, liveFiles, folders } = data;
  const { createProject, switchProject, setSelectedFolder, setActiveProject, setActiveTabId } = actions;
  if (view !== 'workspace' || activeProject || selectedFolder || (activeProjects.length === 0 && generalRootFolders.length === 0)) return null;
  return <section className="workspace-overview">
    <div className="workspace-overview-heading"><div><span>YOUR WORKSPACE</span><h1>Projects and folders</h1><p>Choose a project to open its own files, or browse general workspace files below.</p></div><button className="outline-button" onClick={createProject}><Plus size={14} /> New project</button></div>
    {activeProjects.length > 0 && <><h2>Projects</h2><div className="overview-card-grid">{activeProjects.map((project) => <button className="overview-card" key={project.id} onClick={() => switchProject(project.id)}><span className="overview-card-icon project-card-icon"><Layers size={17} /></span><b>{project.name}</b><small>{liveFiles.filter((file) => file.projectId === project.id).length} files · {folders.filter((folder) => folder.projectId === project.id).length} folders</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
    {generalRootFolders.length > 0 && <><h2>General folders</h2><div className="overview-card-grid">{generalRootFolders.map((folder) => <button className="overview-card" key={folder.id} onClick={() => { setSelectedFolder(folder.id); setActiveProject(null); setActiveTabId(null); }}><span className="overview-card-icon folder-card-icon"><Folder size={17} /></span><b>{folder.name}</b><small>General workspace folder</small><ChevronRight size={15} className="overview-card-arrow" /></button>)}</div></>}
  </section>;
}
