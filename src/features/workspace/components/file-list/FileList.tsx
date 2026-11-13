import type { Dispatch, DragEvent, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import { Archive, ArrowDownUp, Clock3, Ellipsis, FilePlus2, Folder, FolderTree, Import, Trash2 } from 'lucide-react';
import FileKindIcon from '../../../../components/FileKindIcon';
import EmptyState from '../../../../shared/ui/EmptyState';
import { formatSize } from '../../../../utils/format';
import { writeDragPayload } from '../../../../shared/utils/dragPayload';
import type { FileMeta, Folder as FolderRecord, Project } from '../../../../storage/types';
import type { ContextItemType } from '../../hooks/useItemActions';

type View = 'workspace' | 'recent' | 'trash';
type Sort = 'name' | 'type' | 'size' | 'updatedAt';

interface FileListData {
  view: View;
  currentFolders: FolderRecord[];
  folders: FolderRecord[];
  selectedFolder: string | null;
  activeProject: string | null;
  activeProjectRecord: Project | null;
  activeProjects: Project[];
  currentWorkspaceId: string;
  liveFiles: FileMeta[];
  trashedFiles: FileMeta[];
  sortedVisible: FileMeta[];
  getProjectName: (id: string | null) => string | undefined;
}

interface FileListActions {
  setSelectedFolder: Dispatch<SetStateAction<string | null>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
  setSort: Dispatch<SetStateAction<Sort>>;
  setSortDesc: Dispatch<SetStateAction<boolean>>;
  showContextMenu: (type: ContextItemType, id: string, event: ReactMouseEvent) => void;
  handleDrop: (event: DragEvent, folderId: string | null, projectId?: string | null, workspaceId?: string) => void;
  doEmptyTrash: () => Promise<void>;
  restoreTrashedFile: (id: string) => Promise<void>;
  openFile: (file: FileMeta) => Promise<void>;
  deleteFile: (file: FileMeta) => Promise<void>;
  createWorkspaceFile: (kind: 'markdown' | 'code') => Promise<void>;
  startImportInto: (target: { folderId: string | null; projectId: string | null; workspaceId: string }) => void;
}

export default function FileList({ data, actions }: { data: FileListData; actions: FileListActions }) {
  const {
    view, currentFolders, folders, selectedFolder, activeProject, activeProjectRecord,
    activeProjects, currentWorkspaceId, liveFiles, trashedFiles, sortedVisible, getProjectName,
  } = data;
  const {
    setSelectedFolder, setActiveTabId, setSort, setSortDesc, showContextMenu,
    handleDrop, doEmptyTrash, restoreTrashedFile, openFile, deleteFile,
    createWorkspaceFile, startImportInto,
  } = actions;

  return (
    <div className="file-list-scroll">
      {view === 'workspace' && currentFolders.length > 0 && <>
        {selectedFolder && <div className="folder-contents-heading"><Folder size={14} /> Folders</div>}
        {currentFolders.sort((a, b) => a.name.localeCompare(b.name)).map((folder) => <div className="file-list-row folder-list-row" key={folder.id} draggable onContextMenu={(event) => showContextMenu('folder', folder.id, event)} onDragStart={(event) => writeDragPayload(event.dataTransfer, { id: folder.id, type: 'folder' })} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, folder.id, folder.projectId, folder.workspaceId)}>
          <button className="file-name-button" onClick={() => { setSelectedFolder(folder.id); setActiveTabId(null); }}><Folder size={17} className="folder-icon" /><span>{folder.name}</span><small>Folder</small></button><span className="kind-cell">Folder</span><span className="size-cell">—</span><span className="date-cell">{new Date(folder.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Folder actions" onClick={(event) => showContextMenu('folder', folder.id, event)}><Ellipsis size={16} /></button>
        </div>)}
      </>}
      {view === 'trash' && trashedFiles.length > 0 && <div className="trash-actions"><span>{trashedFiles.length} item{trashedFiles.length === 1 ? '' : 's'} in Trash</span><button className="outline-button danger-outline" onClick={() => void doEmptyTrash()}><Trash2 size={14} /> Empty Trash</button></div>}
      <div className="list-header"><button onClick={() => { setSort('name'); setSortDesc(sort === 'name' ? !data.sortDesc : false); }}>Name <ArrowDownUp size={12} /></button><button onClick={() => { setSort('type'); setSortDesc(sort === 'type' ? !data.sortDesc : false); }}>Kind <ArrowDownUp size={12} /></button><button onClick={() => { setSort('size'); setSortDesc(sort === 'size' ? !data.sortDesc : false); }}>Size <ArrowDownUp size={12} /></button><button onClick={() => { setSort('updatedAt'); setSortDesc(sort === 'updatedAt' ? !data.sortDesc : true); }}>Modified <ArrowDownUp size={12} /></button><span /></div>
      {view === 'trash' ? sortedVisible.length === 0 ? <EmptyState title="Trash is empty" message="Files you delete will appear here until you permanently remove them." icon={<Trash2 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
        <button className="file-name-button" onClick={() => void restoreTrashedFile(file.id)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>Deleted {new Date(file.deletedAt!).toLocaleDateString()}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Restore" onClick={() => void restoreTrashedFile(file.id)}><Archive size={15} /></button>
      </div>) : view === 'recent' ? sortedVisible.length === 0 ? <EmptyState title="No recent files" message="Open a file or import one to start building your workspace." icon={<Clock3 size={20} />} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id}>
        <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{getProjectName(file.projectId) ?? 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="Move to trash" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>
      </div>) : sortedVisible.length === 0 && currentFolders.length === 0 && !(view === 'workspace' && !activeProject && activeProjects.length > 0) ? <EmptyState title={selectedFolder ? 'This folder is empty' : activeProjectRecord ? 'This project is empty' : 'Workspace is empty'} message="Create a note or file, or drag something in from your computer." icon={<FolderTree size={21} />} action={<><button className="primary-button" onClick={() => void createWorkspaceFile('markdown')}><FilePlus2 size={15} /> New note</button><button className="text-button" onClick={() => startImportInto({ folderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId })}><Import size={15} /> Import</button></>} /> : sortedVisible.map((file) => <div className="file-list-row" key={file.id} draggable onContextMenu={(event) => showContextMenu('file', file.id, event)} onDragStart={(event) => writeDragPayload(event.dataTransfer, { id: file.id, type: 'file' })}>
        <button className="file-name-button" onClick={() => void openFile(file)}>{<FileKindIcon kind={file.kind} size={17} />}<span>{file.name}</span><small>{file.projectId ? getProjectName(file.projectId) : 'Workspace'}</small></button><span className="kind-cell">{file.kind}</span><span className="size-cell">{formatSize(file.size)}</span><span className="date-cell">{new Date(file.updatedAt).toLocaleDateString()}</span><button className="row-action" title="File actions" onClick={(event) => showContextMenu('file', file.id, event)}><Ellipsis size={16} /></button>
      </div>)}
      {view === 'workspace' && <div className="root-drop-hint"><Import size={14} /> Drop files here to import them into {selectedFolder ? 'this folder' : activeProjectRecord?.name ?? 'the workspace'}</div>}
    </div>
  );
}
