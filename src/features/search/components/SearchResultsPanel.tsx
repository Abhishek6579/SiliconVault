import { Folder, Search } from 'lucide-react';
import FileKindIcon from '../../../components/FileKindIcon';
import type { FileMeta, Folder as FolderRecord } from '../../../storage/types';

export interface SearchResult { file: FileMeta; text: string; }
interface Props {
  query: string;
  searchResults: SearchResult[];
  folderSearchResults: FolderRecord[];
  getProjectName: (id: string | null) => string | undefined;
  onOpenFile: (file: FileMeta) => void;
  onOpenFolder: (folder: FolderRecord) => void;
}
export default function SearchResultsPanel({ query, searchResults, folderSearchResults, getProjectName, onOpenFile, onOpenFolder }: Props) {
  return <div className="search-results-panel">
    {!query.trim() ? <div className="search-placeholder"><Search size={22} /><b>Search your workspace</b><span>Search file names and folder names, plus text in notes and code.</span></div> : searchResults.length === 0 && folderSearchResults.length === 0 ? <div className="search-placeholder"><Search size={22} /><b>No results found</b><span>Searching file names and folders. Try a different word or phrase.</span></div> : <>
      {folderSearchResults.map((folder) => <button className="search-result" key={`folder-${folder.id}`} onClick={() => onOpenFolder(folder)}><span className="search-result-title"><Folder size={15} /><b>{folder.name}</b></span><span className="search-result-location">Folder · {getProjectName(folder.projectId) ?? 'Workspace'}</span><span className="search-result-snippet">Open folder</span></button>)}
      {searchResults.map(({ file, text }) => <button className="search-result" key={file.id} onClick={() => onOpenFile(file)}>
        <span className="search-result-title">{<FileKindIcon kind={file.kind} size={15} />}<b>{file.name}</b></span><span className="search-result-location">{getProjectName(file.projectId) ?? 'Workspace'}</span><span className="search-result-snippet">{text.slice(Math.max(0, text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 42), text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) + 100) || file.name}</span>
      </button>)}
      {query.trim() && (searchResults.length > 0 || folderSearchResults.length > 0) && <div className="search-count">{searchResults.length} file{searchResults.length === 1 ? '' : 's'} · {folderSearchResults.length} folder{folderSearchResults.length === 1 ? '' : 's'}</div>}
    </>}
  </div>;
}
