import { describe, expect, it } from 'vitest';
import type { FileMeta, Folder, Project, Workspace } from '../src/storage/types';
import type { Tab } from '../src/features/tabs/types';
import { selectWorkspaceViewState } from '../src/features/workspace/selectors';

const workspace = (id: string): Workspace => ({ id, name: id, createdAt: 1, updatedAt: 1 });
const project = (id: string, workspaceId: string, archived = false): Project => ({
  id, workspaceId, name: id, archived, createdAt: 1, updatedAt: 1,
});
const folder = (id: string, workspaceId: string, projectId: string | null, parentFolderId: string | null = null): Folder => ({
  id, workspaceId, name: id, projectId, parentFolderId, createdAt: 1, updatedAt: 1,
});
const file = (id: string, workspaceId: string, size: number, options: Partial<FileMeta> = {}): FileMeta => ({
  id, workspaceId, name: id, kind: 'text', parentFolderId: null, projectId: null,
  size, mimeType: 'text/plain', createdAt: 1, updatedAt: 1, deletedAt: null, ...options,
});
const tab = (id: string, workspaceId: string): Tab => ({
  id, meta: file(id, workspaceId, 0), draft: '', dirty: false, preview: false, hydrated: false,
});

describe('selectWorkspaceViewState', () => {
  it('isolates live files, projects, folders and tabs to the active workspace', () => {
    const state = selectWorkspaceViewState({
      files: [
        file('live-a', 'a', 10),
        file('trashed-a', 'a', 20, { deletedAt: 5 }),
        file('live-b', 'b', 30),
      ],
      folders: [folder('root-a', 'a', null), folder('project-folder-a', 'a', 'project-a'), folder('root-b', 'b', null)],
      projects: [project('project-a', 'a'), project('archived-a', 'a', true), project('project-b', 'b')],
      workspaces: [workspace('a'), workspace('b')],
      tabs: [tab('tab-a', 'a'), tab('tab-b', 'b')],
      activeWorkspaceId: 'a',
      activeProjectId: null,
      selectedFolderId: null,
      activeTabId: 'tab-b',
    });

    expect(state.activeWorkspace?.id).toBe('a');
    expect(state.activeProjects.map((item) => item.id)).toEqual(['project-a']);
    expect(state.generalRootFolders.map((item) => item.id)).toEqual(['root-a']);
    expect(state.liveFiles.map((item) => item.id)).toEqual(['live-a']);
    expect(state.trashedFiles.map((item) => item.id)).toEqual(['trashed-a']);
    expect(state.rootFiles.map((item) => item.id)).toEqual(['live-a']);
    expect(state.workspaceTabs.map((item) => item.id)).toEqual(['tab-a']);
    expect(state.activeTab).toBeNull();
    expect(state.workspaceTabSignature).toBe('tab-a');
    expect(state.storedBytes).toBe(60);
  });

  it('selects files and folders for the active project and folder', () => {
    const state = selectWorkspaceViewState({
      files: [
        file('root-file', 'a', 1),
        file('nested-file', 'a', 2, { parentFolderId: 'folder-a', projectId: 'project-a' }),
        file('other-project-file', 'a', 3, { projectId: 'project-b' }),
      ],
      folders: [folder('folder-a', 'a', 'project-a'), folder('child-a', 'a', 'project-a', 'folder-a'), folder('other-project-folder', 'a', 'project-b')],
      projects: [project('project-a', 'a'), project('project-b', 'a')],
      workspaces: [workspace('a')],
      tabs: [],
      activeWorkspaceId: 'a',
      activeProjectId: 'project-a',
      selectedFolderId: 'folder-a',
      activeTabId: null,
    });

    expect(state.rootFiles).toEqual([]);
    expect(state.currentFolders.map((item) => item.id)).toEqual(['child-a']);
    expect(state.workspaceHasContent).toBe(true);
  });
});
