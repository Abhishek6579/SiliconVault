import type { DragEvent } from 'react';
import { useCallback } from 'react';
import { db } from '../../../storage/database';
import { moveFile, moveFolder } from '../../../storage/hierarchy';
import { readDragPayload } from '../../../shared/utils/dragPayload';

interface Options {
  activeProject: string | null;
  currentWorkspaceId: string;
  handleImport: (files: FileList | null, folderId?: string | null, projectId?: string | null, workspaceId?: string) => Promise<void>;
  refresh: () => Promise<void>;
  setError: (message: string) => void;
}

export function useDragAndDrop({ activeProject, currentWorkspaceId, handleImport, refresh, setError }: Options) {
  const handleDrop = useCallback((event: DragEvent, folderId: string | null, destinationProjectId = activeProject, destinationWorkspaceId = currentWorkspaceId) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files.length > 0) {
      void handleImport(event.dataTransfer.files, folderId, destinationProjectId, destinationWorkspaceId);
      return;
    }
    let payload: ReturnType<typeof readDragPayload>;
    try {
      payload = readDragPayload(event.dataTransfer);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read this dragged item.');
      return;
    }
    if (!payload) return;
    const { id, type } = payload;
    void (async () => {
      try {
        if (type === 'file') await moveFile(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        else await moveFolder(db, id, folderId, destinationProjectId, destinationWorkspaceId);
        await refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not move this item.');
      }
    })();
  }, [activeProject, currentWorkspaceId, handleImport, refresh, setError]);

  return { handleDrop };
}
