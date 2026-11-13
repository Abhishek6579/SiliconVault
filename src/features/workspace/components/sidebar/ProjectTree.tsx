import { ChevronDown, ChevronRight, Ellipsis, FileText, Folder } from 'lucide-react';
import FileKindIcon from '../../../../components/FileKindIcon';
import { buildWorkspaceTree, type WorkspaceTreeFolder } from '../../../../storage/tree';
import type { FileMeta, Folder as FolderRecord, Project } from '../../../../storage/types';
import { writeDragPayload } from '../../../../shared/utils/dragPayload';

type View = 'workspace' | 'recent' | 'trash';
type ContextItemType = 'file' | 'folder' | 'project';

interface ProjectTreeData {
  folders: FolderRecord[];
  files: FileMeta[];
  projects: Project[];
  workspaceId: string | null;
  activeProjectId: string | null;
  selectedFolderId: string | null;
  activeTabId: string | null;
  expandedIds: Set<string>;
}

interface ProjectTreeActions {
  onContextMenu: (type: ContextItemType, id: string, event: React.MouseEvent) => void;
  onDrop: (event: React.DragEvent, folderId: string | null, projectId?: string | null, workspaceId?: string) => void;
  onSelectFolder: (folderId: string, projectId: string | null) => void;
  onSelectProject: (projectId: string) => void;
  onOpenFile: (file: FileMeta) => void;
  onToggleFolder: (id: string) => void;
  onCreateNote: () => void;
}

interface ProjectTreeProps { data: ProjectTreeData; actions: ProjectTreeActions; }

export default function ProjectTree({ data, actions }: ProjectTreeProps) {
  const { folders, files, projects, workspaceId, activeProjectId, selectedFolderId, activeTabId, expandedIds } = data;

  function renderFolder(folder: WorkspaceTreeFolder, depth = 0) {
    const id = folder.record.id;
    const isOpen = expandedIds.has(id);
    const selected = selectedFolderId === id;
    return <div key={id}>
      <div className={`tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: `${12 + depth * 16}px` }} draggable
        onContextMenu={(event) => actions.onContextMenu('folder', id, event)}
        onDragStart={(event) => writeDragPayload(event.dataTransfer, { id, type: 'folder' })}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => actions.onDrop(event, id, folder.record.projectId, folder.record.workspaceId)}>
        <button className="tree-main" onClick={() => actions.onSelectFolder(id, folder.record.projectId)} onDoubleClick={() => actions.onToggleFolder(id)}>
          <span className="twisty" onClick={(event) => { event.stopPropagation(); actions.onToggleFolder(id); }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          {isOpen ? <Folder size={16} className="folder-icon open" /> : <Folder size={16} className="folder-icon" />}
          <span className="truncate" title={folder.record.name}>{folder.record.name}</span>
        </button>
        <button className="mini-action" title="Folder actions" onClick={(event) => actions.onContextMenu('folder', id, event)}><Ellipsis size={15} /></button>
      </div>
      {isOpen && <>{folder.children.map((child) => renderFolder(child, depth + 1))}{[...folder.files].sort((a, b) => a.name.localeCompare(b.name)).map((file) => renderFile(file, depth + 1))}</>}
    </div>;
  }

  function renderFile(file: FileMeta, depth = 0) {
    return <div key={file.id} className={`tree-row file-row ${activeTabId === file.id ? 'selected' : ''}`} style={{ paddingLeft: `${31 + depth * 16}px` }} draggable
      onContextMenu={(event) => actions.onContextMenu('file', file.id, event)}
      onDragStart={(event) => writeDragPayload(event.dataTransfer, { id: file.id, type: 'file' })}>
      <button className="tree-main" onClick={() => actions.onOpenFile(file)}><FileKindIcon kind={file.kind} size={15} /><span className="truncate" title={file.name}>{file.name}</span></button>
      <button className="mini-action" title="File actions" onClick={(event) => actions.onContextMenu('file', file.id, event)}><Ellipsis size={15} /></button>
    </div>;
  }

  function renderProject(project: Project) {
    const open = activeProjectId === project.id;
    const projectTree = buildWorkspaceTree(folders, files, null, project.id, project.workspaceId);
    const filesAtRoot = files.filter((file) => file.projectId === project.id && file.parentFolderId === null);
    return <div key={project.id}>
      <div className={`tree-row project-row ${open ? 'selected' : ''}`} onContextMenu={(event) => actions.onContextMenu('project', project.id, event)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => actions.onDrop(event, null, project.id, project.workspaceId)}>
        <button className="tree-main" aria-expanded={open} onClick={() => actions.onSelectProject(project.id)}><span className="twisty">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span><span className="project-dot" /><span className="truncate" title={project.name}>{project.name}</span></button>
        <button className="mini-action" title="Project actions" onClick={(event) => actions.onContextMenu('project', project.id, event)}><Ellipsis size={15} /></button>
      </div>
      {open && <div className="project-children" onDragOver={(event) => event.preventDefault()} onDrop={(event) => actions.onDrop(event, null, project.id, project.workspaceId)}>
        {projectTree.map((folder) => renderFolder(folder))}{filesAtRoot.map((file) => renderFile(file))}
        {projectTree.length === 0 && filesAtRoot.length === 0 && <button className="tree-empty" onClick={actions.onCreateNote}>Nothing here yet <span>+ add a note</span></button>}
      </div>}
    </div>;
  }

  const workspaceFolders = buildWorkspaceTree(folders, files, null, null, workspaceId);
  const workspaceRootFiles = files.filter((file) => file.workspaceId === workspaceId && file.projectId === null && file.parentFolderId === null);
  const workspaceProjects = projects.filter((project) => !project.archived && project.workspaceId === workspaceId);
  const archivedProjects = projects.filter((project) => project.archived && project.workspaceId === workspaceId);
  return <>
    {(workspaceFolders.length > 0 || workspaceRootFiles.length > 0) && <div className="sidebar-section-heading workspace-tree-heading"><span>WORKSPACE FILES</span></div>}
    {workspaceFolders.map((folder) => renderFolder(folder))}{workspaceRootFiles.map((file) => renderFile(file))}
    {workspaceProjects.map(renderProject)}
    {workspaceProjects.length === 0 && <div className="sidebar-empty">Your projects<br /><span>show up here</span></div>}
    {archivedProjects.length > 0 && <><div className="sidebar-section-heading archived-heading"><span>ARCHIVED</span></div>{archivedProjects.map(renderProject)}</>}
  </>;
}
