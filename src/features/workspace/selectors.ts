import type { FileMeta, Folder, Project, Workspace } from '../../storage/types';
import type { Tab } from '../tabs/types';

export interface WorkspaceViewStateInput {
  files: FileMeta[];
  folders: Folder[];
  projects: Project[];
  workspaces: Workspace[];
  tabs: Tab[];
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  selectedFolderId: string | null;
  activeTabId: string | null;
}

/** Pure selectors for the active workspace view; keeps filtering policy out of App.tsx. */
export function selectWorkspaceViewState(input: WorkspaceViewStateInput) {
  const {
    files, folders, projects, workspaces, tabs,
    activeWorkspaceId, activeProjectId, selectedFolderId, activeTabId,
  } = input;
  const activeProjectRecord = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const activeProjects = projects.filter((project) => !project.archived && project.workspaceId === activeWorkspaceId);
  const generalRootFolders = folders.filter((folder) =>
    folder.workspaceId === activeWorkspaceId && folder.projectId === null && folder.parentFolderId === null,
  );
  // Tabs for inactive workspaces remain in memory but are never exposed in the active workspace UI.
  const workspaceTabs = tabs.filter((tab) => tab.meta.workspaceId === activeWorkspaceId);
  const workspaceTabSignature = workspaceTabs.map((tab) => tab.id).join('\u0000');
  const activeTab = workspaceTabs.find((tab) => tab.id === activeTabId) ?? null;
  const liveFiles = files.filter((file) => file.deletedAt === null && file.workspaceId === activeWorkspaceId);
  const storedBytes = files.reduce((sum, file) => sum + file.size, 0);
  const workspaceHasContent = activeProjects.length > 0 ||
    generalRootFolders.length > 0 || liveFiles.some((file) => file.projectId === null);
  const trashedFiles = files
    .filter((file) => file.workspaceId === activeWorkspaceId && file.deletedAt !== null)
    .sort((a, b) => b.deletedAt! - a.deletedAt!);
  const rootFiles = liveFiles.filter((file) =>
    file.parentFolderId === null && file.projectId === activeProjectId,
  );
  const currentFolders = folders.filter((folder) =>
    folder.workspaceId === activeWorkspaceId &&
    folder.parentFolderId === selectedFolderId &&
    folder.projectId === activeProjectId,
  );

  return {
    activeProjectRecord, activeWorkspace, activeProjects, generalRootFolders,
    workspaceTabs, workspaceTabSignature, activeTab, liveFiles, storedBytes,
    workspaceHasContent, trashedFiles, rootFiles, currentFolders,
  };
}
