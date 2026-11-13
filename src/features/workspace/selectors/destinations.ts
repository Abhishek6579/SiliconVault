import type { FileMeta, Folder, Project, Workspace } from '../../../storage/types';

export interface MoveDestination {
  key: string;
  label: string;
  detail: string;
  folderId: string | null;
  projectId: string | null;
  workspaceId: string;
}

export function getExcludedFolderIds(folders: Folder[], movingFolderId: string | null): Set<string> {
  const ids = new Set<string>();
  if (!movingFolderId) return ids;
  ids.add(movingFolderId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentFolderId && ids.has(folder.parentFolderId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function getMoveDestinations(
  workspaces: Workspace[],
  projects: Project[],
  folders: Folder[],
  excludedFolderIds: ReadonlySet<string>,
): MoveDestination[] {
  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  return [
    ...workspaces.map((workspace) => ({
      key: `workspace-${workspace.id}`, label: workspace.name, detail: 'Workspace root',
      folderId: null, projectId: null, workspaceId: workspace.id,
    })),
    ...projects.filter((project) => !project.archived).map((project) => ({
      key: `project-${project.id}`, label: project.name,
      detail: `${workspaceNames.get(project.workspaceId) ?? 'Workspace'} · Project`,
      folderId: null, projectId: project.id, workspaceId: project.workspaceId,
    })),
    ...folders.filter((folder) => !excludedFolderIds.has(folder.id)
      && (folder.projectId === null || projects.some((project) => project.id === folder.projectId && !project.archived)))
      .map((folder) => ({
        key: `folder-${folder.id}`, label: folder.name,
        detail: `${workspaceNames.get(folder.workspaceId) ?? 'Workspace'} · ${projectNames.get(folder.projectId ?? '') ?? 'General'} · Folder`,
        folderId: folder.id, projectId: folder.projectId, workspaceId: folder.workspaceId,
      })),
  ];
}

export function selectVisibleFiles(
  view: 'workspace' | 'recent' | 'trash',
  files: FileMeta[],
  trashedFiles: FileMeta[],
  activeWorkspaceId: string | null,
  activeProjectId: string | null,
  selectedFolderId: string | null,
  sort: 'name' | 'type' | 'size' | 'updatedAt',
  sortDesc: boolean,
): FileMeta[] {
  const visible = view === 'trash' ? trashedFiles : view === 'recent'
    ? [...files].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40)
    : view === 'workspace' && !activeProjectId && !selectedFolderId
      ? files
      : files.filter((file) => file.workspaceId === activeWorkspaceId
        && file.projectId === activeProjectId && file.parentFolderId === selectedFolderId);
  if (view === 'recent' || view === 'trash') return [...visible];
  return [...visible].sort((a, b) => {
    const order = sort === 'type' ? a.kind.localeCompare(b.kind)
      : sort === 'size' ? a.size - b.size
        : sort === 'updatedAt' ? a.updatedAt - b.updatedAt
          : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sortDesc ? -order : order;
  });
}
