export interface FolderLink { id: string; parentFolderId: string | null; }

/** Collect a folder and its descendants in O(V + E), tolerating corrupt cycles. */
export function collectDescendantIds(folders: readonly FolderLink[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentFolderId) continue;
    const siblings = children.get(folder.parentFolderId);
    if (siblings) siblings.push(folder.id);
    else children.set(folder.parentFolderId, [folder.id]);
  }

  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const child of children.get(current) ?? []) {
      if (!visited.has(child)) stack.push(child);
    }
  }
  return [...visited];
}


import type { FileMeta, Folder } from './types';

export interface WorkspaceTreeFolder {
  record: Folder;
  children: WorkspaceTreeFolder[];
  files: FileMeta[];
}

/** Build the visible folder hierarchy for one project/workspace in O(V + E). */
export function buildWorkspaceTree(
  folders: readonly Folder[],
  files: readonly FileMeta[],
  parentId: string | null,
  projectId: string | null,
  workspaceId: string | null,
): WorkspaceTreeFolder[] {
  const foldersByParent = new Map<string | null, Folder[]>();
  const filesByParent = new Map<string | null, FileMeta[]>();

  for (const folder of folders) {
    if (folder.projectId !== projectId || folder.workspaceId !== workspaceId) continue;
    const siblings = foldersByParent.get(folder.parentFolderId);
    if (siblings) siblings.push(folder);
    else foldersByParent.set(folder.parentFolderId, [folder]);
  }
  for (const file of files) {
    if (file.projectId !== projectId || file.workspaceId !== workspaceId) continue;
    const siblings = filesByParent.get(file.parentFolderId);
    if (siblings) siblings.push(file);
    else filesByParent.set(file.parentFolderId, [file]);
  }

  for (const siblings of foldersByParent.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  const visited = new Set<string>();
  const build = (parent: string | null): WorkspaceTreeFolder[] => {
    const children: WorkspaceTreeFolder[] = [];
    for (const record of foldersByParent.get(parent) ?? []) {
      if (visited.has(record.id)) continue;
      visited.add(record.id);
      children.push({ record, children: build(record.id), files: filesByParent.get(record.id) ?? [] });
    }
    return children;
  };

  return build(parentId);
}
