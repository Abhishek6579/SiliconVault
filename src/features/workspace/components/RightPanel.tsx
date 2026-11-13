import { X } from 'lucide-react';
import DetailsPanel from './overview/DetailsPanel';
import SearchResultsPanel, { type SearchResult } from '../../search/components/SearchResultsPanel';
import type { FileMeta, Folder, Project, Workspace } from '../../../storage/types';

type Panel = 'details' | 'search' | null;
interface Data {
  panel: Panel;
  liveFiles: FileMeta[];
  activeProjects: Project[];
  folders: Folder[];
  activeWorkspaceId: string | null;
  query: string;
  searchResults: SearchResult[];
  folderSearchResults: Folder[];
  getProjectName: (id: string | null) => string | undefined;
}
interface Actions {
  setPanel: (panel: Panel) => void;
  saveBackup: () => void;
  openFile: (file: FileMeta) => void;
  openFolder: (folder: Folder) => void;
}
export default function RightPanel({ data, actions }: { data: Data; actions: Actions }) {
  const { panel, liveFiles, activeProjects, folders, activeWorkspaceId, query, searchResults, folderSearchResults, getProjectName } = data;
  if (!panel) return null;
  return <aside className="right-panel">
    <div className="right-panel-header"><b>{panel === 'details' ? 'Workspace details' : 'Search results'}</b><button className="icon-button" onClick={() => actions.setPanel(null)}><X size={16} /></button></div>
    {panel === 'details' ? <DetailsPanel liveFiles={liveFiles} activeProjects={activeProjects} folders={folders} activeWorkspaceId={activeWorkspaceId} onSaveBackup={actions.saveBackup} /> : <SearchResultsPanel
      query={query}
      searchResults={searchResults}
      folderSearchResults={folderSearchResults}
      getProjectName={getProjectName}
      onOpenFile={actions.openFile}
      onOpenFolder={actions.openFolder}
    />}
  </aside>;
}
