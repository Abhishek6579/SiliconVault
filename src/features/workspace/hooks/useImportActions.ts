import type { Dispatch, SetStateAction } from 'react';
import { db } from '../../../storage/database';
import { createFolder } from '../../../storage/hierarchy';
import { importFile } from '../../../storage/files';
import { normalizeRelativePath } from '../../../shared/utils/relativePath';
import { platform } from '../../../platform';
import { OPENABLE_KINDS } from '../../../shared/constants/fileKinds';
import type { FileMeta } from '../../../storage/types';

export interface ImportTarget {
  folderId: string | null;
  projectId: string | null;
  workspaceId: string;
}

interface UseImportActionsOptions {
  openFile: (file: FileMeta) => Promise<void>;
  refresh: () => Promise<void>;
  selectedFolder: string | null;
  activeProject: string | null;
  currentWorkspaceId: string;
  setError: (message: string) => void;
  setImporting: Dispatch<SetStateAction<boolean>>;
  setSelectedFolder: (id: string | null) => void;
  setActiveProject: (id: string | null) => void;
  setView: (view: 'workspace' | 'recent' | 'trash') => void;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
  setStatus: (status: string) => void;
}

export function useImportActions(options: UseImportActionsOptions) {
  const {
    openFile, refresh, selectedFolder, activeProject, currentWorkspaceId,
    setError, setImporting, setSelectedFolder, setActiveProject,
    setView, setExpanded, setStatus,
  } = options;

  async function importFolderFiles(selectedFiles: Iterable<File> | AsyncIterable<File>, target: ImportTarget) {
    const folderIds = new Map<string, string>();
    let imported = 0;
    for await (const file of selectedFiles) {
      const relativePath = normalizeRelativePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
      const segments = relativePath.split('/').filter(Boolean);
      const directorySegments = segments.slice(0, -1);
      let parentFolderId = target.folderId;
      let currentPath = '';
      for (const segment of directorySegments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        let folderId = folderIds.get(currentPath);
        if (!folderId) {
          const folder = await createFolder(db, segment, parentFolderId, target.projectId, target.workspaceId);
          folderId = folder.id;
          folderIds.set(currentPath, folderId);
        }
        parentFolderId = folderId;
      }
      await importFile(db, file, { parentFolderId, projectId: target.projectId, workspaceId: target.workspaceId });
      imported += 1;
    }
    const rootFolderId = folderIds.values().next().value as string | undefined;
    if (rootFolderId) {
      setSelectedFolder(rootFolderId);
      setActiveProject(target.projectId);
      setView('workspace');
      setExpanded((current) => new Set([...current, rootFolderId]));
    }
    setStatus(`Imported ${imported} file${imported === 1 ? '' : 's'}`);
  }

  async function handleImport(fileList: FileList | null, destinationFolderId = selectedFolder, destinationProjectId = activeProject, destinationWorkspaceId = currentWorkspaceId) {
    if (!fileList?.length) return;
    setImporting(true);
    try {
      for (const file of Array.from(fileList)) {
        const meta = await importFile(db, file, { parentFolderId: destinationFolderId, projectId: destinationProjectId, workspaceId: destinationWorkspaceId });
        if (OPENABLE_KINDS.has(meta.kind)) await openFile(meta);
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import the selected file.');
    } finally {
      setImporting(false);
    }
  }

  async function handlePickedImport(files: Iterable<File> | AsyncIterable<File>, target: ImportTarget) {
    setImporting(true);
    try {
      for await (const file of files) {
        const meta = await importFile(db, file, { parentFolderId: target.folderId, projectId: target.projectId, workspaceId: target.workspaceId });
        if (OPENABLE_KINDS.has(meta.kind)) await openFile(meta);
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import the selected files.');
    } finally {
      setImporting(false);
    }
  }

  function startImportInto(target: ImportTarget) {
    void handlePickedImport(platform.chooseFiles(), target).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not open the file picker.'));
  }

  function startImportFolderInto(target: ImportTarget) {
    setImporting(true);
    void (async () => {
      try {
        await importFolderFiles(platform.chooseFolderFiles(), target);
        await refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not import the selected folder.');
      } finally {
        setImporting(false);
      }
    })();
  }

  return { handleImport, handlePickedImport, startImportInto, startImportFolderInto };
}
