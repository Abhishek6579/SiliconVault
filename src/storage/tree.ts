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
