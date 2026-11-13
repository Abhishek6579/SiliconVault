import type { Dispatch, SetStateAction } from 'react';
import { db } from '../../../storage/database';
import { createFolder } from '../../../storage/hierarchy';
import { createTextFile } from '../../../storage/files';
import type { FileMeta } from '../../../storage/types';

type RequestInput = (title: string, initialValue: string, placeholder: string, confirmLabel: string, onConfirm: (value: string) => void | Promise<void>, message?: string) => void;

interface Options {
  currentWorkspaceId: string;
  selectedFolder: string | null;
  activeProject: string | null;
  view: 'workspace' | 'recent' | 'trash';
  setView: (view: 'workspace' | 'recent' | 'trash') => void;
  requestInput: RequestInput;
  refresh: () => Promise<void>;
  openFile: (file: FileMeta) => Promise<void>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
}

export function useFolderActions({ currentWorkspaceId, selectedFolder, activeProject, view, setView, requestInput, refresh, openFile, setExpanded }: Options) {
  function createFolderInCurrent() {
    requestInput('Create folder', '', 'Folder name', 'Create folder', async (name) => {
      const folder = await createFolder(db, name.trim(), selectedFolder, activeProject, currentWorkspaceId);
      setExpanded((current) => new Set(current).add(folder.id));
      await refresh();
    });
  }

  function createNewFile(kind: 'markdown' | 'code') {
    const initial = kind === 'markdown' ? 'Untitled note.md' : 'Untitled.ts';
    requestInput(kind === 'markdown' ? 'Create note' : 'Create code file', initial, 'File name', 'Create file', async (name) => {
      const text = kind === 'markdown' ? `# ${name.replace(/\.(md|markdown)$/i, '')}

` : '';
      const meta = await createTextFile(db, name.trim(), text, { parentFolderId: selectedFolder, projectId: activeProject, workspaceId: currentWorkspaceId, kind });
      await refresh();
      await openFile(meta);
    });
  }

  async function createWorkspaceFile(kind: 'markdown' | 'code') {
    if (view !== 'workspace') setView('workspace');
    await createNewFile(kind);
  }

  return { createFolderInCurrent, createNewFile, createWorkspaceFile };
}
