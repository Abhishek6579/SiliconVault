import type { Dispatch, SetStateAction } from 'react';
import { db } from '../../../storage/database';
import type { Project } from '../../../storage/types';

type View = 'workspace' | 'recent' | 'trash';
type RequestInput = (title: string, initialValue: string, placeholder: string, confirmLabel: string, onConfirm: (value: string) => void | Promise<void>, message?: string) => void;

interface Options {
  currentWorkspaceId: string;
  requestInput: RequestInput;
  refresh: () => Promise<void>;
  setActiveProject: Dispatch<SetStateAction<string | null>>;
  setSelectedFolder: Dispatch<SetStateAction<string | null>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
  setView: Dispatch<SetStateAction<View>>;
}

export function useProjectActions({ currentWorkspaceId, requestInput, refresh, setActiveProject, setSelectedFolder, setActiveTabId, setView }: Options) {
  function createProject() {
    requestInput('Create project', '', 'Project name', 'Create project', async (name) => {
      const now = Date.now();
      const project: Project = { id: crypto.randomUUID(), workspaceId: currentWorkspaceId, name: name.trim(), archived: false, createdAt: now, updatedAt: now };
      await db.projects.add(project);
      await refresh();
      setActiveProject(project.id);
      setSelectedFolder(null);
      setActiveTabId(null);
      setView('workspace');
    });
  }
  return { createProject };
}
