import type { WorkspaceDatabase } from './database';
import type { FileMeta } from './types';
import type { Tab, EditorViewState } from '../features/tabs/types';

export interface WorkspaceSession {
  workspaceId: string;
  openFileIds: string[];
  activeFileId: string | null;
  updatedAt: number;
}

export interface RestoredWorkspaceSession {
  tabs: Tab[];
  activeTabId: string | null;
}

export const workspaceSessionKey = (workspaceId: string) => `session:${workspaceId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEditorViewState(value: unknown): value is EditorViewState {
  if (!isRecord(value)) return false;
  const numeric = ['anchor', 'head', 'scrollTop', 'scrollLeft'];
  return numeric.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && (value[key] as number) >= 0)
    && typeof value.preview === 'boolean';
}

/** Persists only file IDs and the active ID; document contents remain in the existing contents/draft stores. */
export async function saveWorkspaceSession(
  database: WorkspaceDatabase,
  workspaceId: string,
  openFileIds: string[],
  activeFileId: string | null,
): Promise<WorkspaceSession> {
  const uniqueIds = [...new Set(openFileIds.filter((id) => typeof id === 'string' && id.length > 0))];
  const previous = await database.preferences.get(workspaceSessionKey(workspaceId));
  const previousValue = previous?.value;
  const previousActive = isRecord(previousValue) && typeof previousValue.activeFileId === 'string'
    ? previousValue.activeFileId : null;
  const selectedActive = activeFileId && uniqueIds.includes(activeFileId)
    ? activeFileId
    : previousActive && uniqueIds.includes(previousActive)
      ? previousActive
      : uniqueIds.at(-1) ?? null;
  const session: WorkspaceSession = { workspaceId, openFileIds: uniqueIds, activeFileId: selectedActive, updatedAt: Date.now() };
  await database.preferences.put({ key: workspaceSessionKey(workspaceId), value: session, updatedAt: session.updatedAt });
  return session;
}

/** Restores metadata placeholders only. File content is loaded lazily when a tab becomes active. */
export async function restoreWorkspaceSession(
  database: WorkspaceDatabase,
  workspaceId: string,
): Promise<RestoredWorkspaceSession> {
  const preference = await database.preferences.get(workspaceSessionKey(workspaceId));
  const value = preference?.value;
  const rawIds = isRecord(value) && Array.isArray(value.openFileIds) ? value.openFileIds : [];
  const requestedIds = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const records = await database.files.bulkGet(requestedIds);
  const validFiles = records.filter((file): file is FileMeta => Boolean(
    file && file.workspaceId === workspaceId && file.deletedAt === null
  ));
  const validIds = validFiles.map((file) => file.id);
  const requestedActive = isRecord(value) && typeof value.activeFileId === 'string' ? value.activeFileId : null;
  const activeTabId = requestedActive && validIds.includes(requestedActive)
    ? requestedActive
    : validIds.at(-1) ?? null;
  const isValidRecord = isRecord(value)
    && value.workspaceId === workspaceId
    && requestedIds.length === rawIds.length
    && validIds.length === requestedIds.length
    && value.activeFileId === activeTabId;
  if (!isValidRecord) {
    await saveWorkspaceSession(database, workspaceId, validIds, activeTabId);
  }
  return {
    tabs: validFiles.map((meta) => ({
      id: meta.id,
      meta,
      draft: '',
      dirty: false,
      preview: meta.kind === 'markdown',
    })),
    activeTabId,
  };
}

/** Returns only validated cursor/scroll/preview metadata; no editor document is stored here. */
export async function loadEditorViewState(database: WorkspaceDatabase, fileId: string): Promise<EditorViewState | undefined> {
  const value = (await database.preferences.get(`editor:${fileId}`))?.value;
  if (!isEditorViewState(value)) return undefined;
  return value;
}
