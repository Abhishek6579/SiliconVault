import type { Dispatch, SetStateAction } from 'react';
import { db } from '../../../storage/database';
import { platform } from '../../../platform';
import { importFiles } from '../../../services/importFiles';
import { importFolder, type ImportTarget } from '../../../services/importFolder';
import type { FileMeta } from '../../../storage/types';
import { logger } from '../../../logger.js';
import { errorContext } from '../../../shared/logging/errorContext';
import { useActivity } from '../../../shared/activity/ActivityContext';

interface UseImportActionsOptions {
  openFile: (file: FileMeta) => Promise<void>;
  refresh: () => Promise<void>;
  selectedFolder: string | null;
  activeProject: string | null;
  currentWorkspaceId: string;
  setError: (message: string) => void;
  setSelectedFolder: (id: string | null) => void;
  setActiveProject: (id: string | null) => void;
  setView: (view: 'workspace' | 'recent' | 'trash') => void;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
  setStatus: (status: string) => void;
}

export function useImportActions(options: UseImportActionsOptions) {
  const {
    openFile, refresh, selectedFolder, activeProject, currentWorkspaceId,
    setError, setSelectedFolder, setActiveProject, setView, setExpanded, setStatus,
  } = options;
  const { startActivity } = useActivity();

  async function handleImport(
    fileList: FileList | null,
    destinationFolderId = selectedFolder,
    destinationProjectId = activeProject,
    destinationWorkspaceId = currentWorkspaceId,
  ) {
    if (!fileList?.length) return;
    await handlePickedImport(
      Array.from(fileList),
      { folderId: destinationFolderId, projectId: destinationProjectId, workspaceId: destinationWorkspaceId },
    );
  }

  async function handlePickedImport(files: Iterable<File> | AsyncIterable<File>, target: ImportTarget) {
    const activity = startActivity('Importing files', 'Waiting for file selection…');
    void logger.info('workspace.file_import.started', 'File import started.');
    try {
      const imported = await importFiles(db, files, target, openFile, (progress) => {
        activity.update({
          detail: progress.fileName ? `Importing ${progress.fileName}` : 'Reading selected files…',
          current: progress.completed,
          total: progress.total,
        });
      });
      activity.update({ detail: 'Updating workspace view…', current: 0, total: null });
      await refresh();
      if (imported > 0) activity.complete(`Imported ${imported} file${imported === 1 ? '' : 's'}`);
      else activity.dismiss();
      void logger.info('workspace.file_import.completed', 'File import completed.', { importedFileCount: imported });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not import the selected files.';
      activity.fail(message);
      void logger.error('workspace.file_import.failed', 'File import failed.', errorContext(reason));
      setError(message);
    }
  }

  async function startImportInto(target: ImportTarget) {
    await handlePickedImport(platform.chooseFiles(), target);
  }

  async function startImportFolderInto(target: ImportTarget) {
    const activity = startActivity('Importing folder', 'Waiting for folder selection…');
    void logger.info('workspace.folder_import.started', 'Folder import started.');
    try {
      const { imported, rootFolderId } = await importFolder(
        db,
        platform.chooseFolderFiles(),
        target,
        platform.getRelativePath,
        (progress) => activity.update({
          detail: progress.fileName ? `Importing ${progress.fileName}` : 'Reading folder contents…',
          current: progress.completed,
          total: progress.total,
        }),
      );
      if (rootFolderId) {
        setSelectedFolder(rootFolderId);
        setActiveProject(target.projectId);
        setView('workspace');
        setExpanded((current) => new Set([...current, rootFolderId]));
      }
      if (imported > 0) {
        setStatus(`Imported ${imported} file${imported === 1 ? '' : 's'}`);
        activity.update({ detail: 'Updating workspace view…', current: imported, total: imported });
        await refresh();
        activity.complete(`Imported ${imported} file${imported === 1 ? '' : 's'}`);
      } else {
        activity.dismiss();
      }
      void logger.info('workspace.folder_import.completed', 'Folder import completed.', { importedFileCount: imported });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not import the selected folder.';
      activity.fail(message);
      void logger.error('workspace.folder_import.failed', 'Folder import failed.', errorContext(reason));
      setError(message);
    }
  }

  return { handleImport, handlePickedImport, startImportInto, startImportFolderInto };
}
