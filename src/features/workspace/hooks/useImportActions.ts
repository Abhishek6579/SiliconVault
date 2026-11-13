import type { Dispatch, SetStateAction } from 'react';
import { db } from '../../../storage/database';
import { platform } from '../../../platform';
import { importFiles } from '../../../services/importFiles';
import { importFolder, type ImportTarget } from '../../../services/importFolder';
import type { FileMeta } from '../../../storage/types';
import { logger } from '../../../logger.js';
import { errorContext } from '../../../shared/logging/errorContext';

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
    void logger.info('workspace.folder_import.started', 'Folder import started.');
    const { imported, rootFolderId } = await importFolder(db, selectedFiles, target, platform.getRelativePath);
    if (rootFolderId) {
      setSelectedFolder(rootFolderId);
      setActiveProject(target.projectId);
      setView('workspace');
      setExpanded((current) => new Set([...current, rootFolderId]));
    }
    setStatus(`Imported ${imported} file${imported === 1 ? '' : 's'}`);
    void logger.info('workspace.folder_import.completed', 'Folder import completed.', { importedFileCount: imported });
  }

  async function handleImport(fileList: FileList | null, destinationFolderId = selectedFolder, destinationProjectId = activeProject, destinationWorkspaceId = currentWorkspaceId) {
    if (!fileList?.length) return;
    setImporting(true);
    void logger.info('workspace.file_import.started', 'File import started.', { selectedFileCount: fileList.length });
    try {
      const imported = await importFiles(db, Array.from(fileList), { folderId: destinationFolderId, projectId: destinationProjectId, workspaceId: destinationWorkspaceId }, openFile);
      await refresh();
      void logger.info('workspace.file_import.completed', 'File import completed.', { importedFileCount: imported });
    } catch (reason) {
      void logger.error('workspace.file_import.failed', 'File import failed.', errorContext(reason));
      setError(reason instanceof Error ? reason.message : 'Could not import the selected file.');
    } finally {
      setImporting(false);
    }
  }

  async function handlePickedImport(files: Iterable<File> | AsyncIterable<File>, target: ImportTarget) {
    setImporting(true);
    void logger.info('workspace.file_import.started', 'File import started.');
    try {
      const imported = await importFiles(db, files, target, openFile);
      await refresh();
      void logger.info('workspace.file_import.completed', 'File import completed.', { importedFileCount: imported });
    } catch (reason) {
      void logger.error('workspace.file_import.failed', 'File import failed.', errorContext(reason));
      setError(reason instanceof Error ? reason.message : 'Could not import the selected files.');
    } finally {
      setImporting(false);
    }
  }

  function startImportInto(target: ImportTarget) {
    void handlePickedImport(platform.chooseFiles(), target).catch((reason: unknown) => {
      void logger.error('workspace.file_picker.failed', 'File picker or import stream failed.', errorContext(reason));
      setError(reason instanceof Error ? reason.message : 'Could not open the file picker.');
    });
  }

  function startImportFolderInto(target: ImportTarget) {
    setImporting(true);
    void (async () => {
      try {
        await importFolderFiles(platform.chooseFolderFiles(), target);
        await refresh();
      } catch (reason) {
        void logger.error('workspace.folder_import.failed', 'Folder import failed.', errorContext(reason));
        setError(reason instanceof Error ? reason.message : 'Could not import the selected folder.');
      } finally {
        setImporting(false);
      }
    })();
  }

  return { handleImport, handlePickedImport, startImportInto, startImportFolderInto };
}
