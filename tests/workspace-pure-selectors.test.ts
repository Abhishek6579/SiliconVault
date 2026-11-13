import { describe, expect, it } from 'vitest';
import { getExcludedFolderIds, getMoveDestinations, selectVisibleFiles } from '../src/features/workspace/selectors/destinations';
import { releaseInactiveTabData } from '../src/features/tabs/utils/releaseInactiveTabData';
import type { FileMeta, Folder, Project, Workspace } from '../src/storage/types';
import type { Tab } from '../src/features/tabs/types';

const workspace = (id: string): Workspace => ({ id, name: id, createdAt: 1, updatedAt: 1 });
const project = (id: string, archived = false): Project => ({ id, workspaceId: 'w', name: id, archived, createdAt: 1, updatedAt: 1 });
const folder = (id: string, parentFolderId: string | null = null): Folder => ({ id, workspaceId: 'w', name: id, parentFolderId, projectId: null, createdAt: 1, updatedAt: 1 });
const file = (id: string, options: Partial<FileMeta> = {}): FileMeta => ({
  id, workspaceId: 'w', kind: 'text', name: id, parentFolderId: null, projectId: null,
  size: 1, mimeType: 'text/plain', createdAt: 1, updatedAt: 1, deletedAt: null, ...options,
});
const tab = (id: string, kind: FileMeta['kind'], data?: Blob): Tab => ({
  id, meta: file(id, { kind }), data, draft: '', dirty: false, preview: false, hydrated: Boolean(data),
});

describe('workspace pure selectors', () => {
  it('excludes a moved folder and all of its descendants from destinations', () => {
    const folders = [folder('moving'), folder('child', 'moving'), folder('grandchild', 'child'), folder('other')];
    const excluded = getExcludedFolderIds(folders, 'moving');
    expect([...excluded]).toEqual(['moving', 'child', 'grandchild']);
    expect(getMoveDestinations([workspace('w')], [project('p'), project('archived', true)], folders, excluded)
      .map((destination) => destination.key)).toEqual(['workspace-w', 'project-p', 'folder-other']);
  });

  it('keeps recent order, applies workspace filters and sorts workspace files', () => {
    const files = [file('b', { updatedAt: 2 }), file('a', { updatedAt: 3 }), file('elsewhere', { workspaceId: 'other' })];
    expect(selectVisibleFiles('recent', files, [], 'w', null, null, 'name', false).map((item) => item.id)).toEqual(['a', 'b', 'elsewhere']);
    const currentWorkspaceFiles = files.filter((item) => item.workspaceId === 'w');
    expect(selectVisibleFiles('workspace', currentWorkspaceFiles, [], 'w', null, null, 'name', false).map((item) => item.id)).toEqual(['a', 'b']);
    expect(selectVisibleFiles('workspace', currentWorkspaceFiles, [], 'w', null, null, 'name', true).map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('inactive tab data release', () => {
  it('releases inactive PDF blobs and preserves the active tab and viewer blobs', () => {
    const pdfBlob = new Blob(['pdf']);
    const viewerBlob = new Blob(['viewer']);
    const result = releaseInactiveTabData([
      tab('active', 'pdf', pdfBlob), tab('inactive', 'pdf', pdfBlob), tab('viewer', 'viewer', viewerBlob),
    ], 'active');
    expect(result[0].data).toBe(pdfBlob);
    expect(result[1].data).toBeUndefined();
    expect(result[1].hydrated).toBe(false);
    expect(result[2].data).toBe(viewerBlob);
  });
});
