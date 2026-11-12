import { describe, expect, it } from 'vitest';
import { buildWorkspaceTree } from '../src/storage/tree';
import type { FileMeta, Folder } from '../src/storage/types';

const now = 1;
function folder(id: string, parentFolderId: string | null, name = id): Folder {
  return { id, name, parentFolderId, projectId: null, workspaceId: 'w', createdAt: now, updatedAt: now };
}
function file(id: string, parentFolderId: string | null, name = id): FileMeta {
  return { id, name, kind: 'text', parentFolderId, projectId: null, workspaceId: 'w', size: 0, mimeType: 'text/plain', createdAt: now, updatedAt: now, deletedAt: null };
}

describe('workspace tree projection', () => {
  it('groups and sorts folders and files by parent while isolating workspace and project records', () => {
    const tree = buildWorkspaceTree(
      [folder('z', null), folder('a', null), folder('nested', 'a'), folder('other-workspace', null)].map((item) =>
        item.id === 'other-workspace' ? { ...item, workspaceId: 'other' } : item),
      [file('root-file', null), file('nested-file', 'nested'), file('other-project', null)].map((item) =>
        item.id === 'other-project' ? { ...item, projectId: 'p' } : item),
      null, null, 'w',
    );
    expect(tree.map((item) => item.record.id)).toEqual(['a', 'z']);
    expect(tree[0].children[0].record.id).toBe('nested');
    expect(tree[0].children[0].files.map((item) => item.id)).toEqual(['nested-file']);
  });

  it('terminates when corrupt folder metadata contains a cycle', () => {
    const tree = buildWorkspaceTree([folder('a', 'b'), folder('b', 'a')], [], null, null, 'w');
    expect(tree).toEqual([]);
  });
});
