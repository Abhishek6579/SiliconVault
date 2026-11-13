import type { Dispatch, RefObject, SetStateAction } from 'react';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import TopbarActions from './TopbarActions';
import type { FileMeta, Folder as FolderRecord, Project, Workspace } from '../../../../storage/types';

type View = 'workspace' | 'recent' | 'trash';
interface SwitcherData {
  view: View; activeWorkspace: Workspace | null; activeWorkspaceId: string | null;
  activeProjectRecord: Project | null; activeProject: string | null; selectedFolder: string | null;
  folders: FolderRecord[]; workspaces: Workspace[]; activeProjects: Project[]; trashedFiles: FileMeta[];
  open: boolean; menuRef: RefObject<HTMLDivElement | null>;
}
interface SwitcherActions {
  setOpen: Dispatch<SetStateAction<boolean>>; switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: () => void; renameWorkspace: (workspace: Workspace) => void; deleteCurrentWorkspace: () => void;
  switchProject: (id: string | null) => Promise<void>; setView: Dispatch<SetStateAction<View>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>; createProject: () => void;
  doEmptyTrash: () => Promise<void>; restoreProject: (project: Project) => Promise<void>;
  deleteProject: (project: Project) => Promise<void>; deleteFolder: (folder: FolderRecord) => Promise<void>;
}
interface ActionsData {
  view: View; selectedFolder: string | null; activeProjectRecord: Project | null; activeProject: string | null;
  currentWorkspaceId: string; importMenuOpen: boolean; importMenuRef: RefObject<HTMLDivElement | null>;
  darkTheme: boolean; status: string; searchOpen: boolean; query: string; searchInputRef: RefObject<HTMLInputElement | null>;
}
interface Actions {
  setImportMenuOpen: Dispatch<SetStateAction<boolean>>;
  startImportInto: (target: { folderId: string | null; projectId: string | null; workspaceId: string }) => void;
  startImportFolderInto: (target: { folderId: string | null; projectId: string | null; workspaceId: string }) => void;
  createFolderInCurrent: () => void; createWorkspaceFile: (kind: 'markdown' | 'code') => Promise<void>;
  setSearchPopupOpen: Dispatch<SetStateAction<boolean>>; setQuery: Dispatch<SetStateAction<string>>;
  setRightPanel: Dispatch<SetStateAction<'details' | 'search' | null>>;
  toggleTheme: () => Promise<void>; setDetailsOpen: () => void;
}
export default function Topbar({ switcherData, switcherActions, actionsData, actions }: {
  switcherData: SwitcherData; switcherActions: SwitcherActions; actionsData: ActionsData; actions: Actions;
}) {
  return <header className="topbar">
    <WorkspaceSwitcher data={switcherData} actions={switcherActions} />
    <TopbarActions data={actionsData} actions={actions} />
  </header>;
}
