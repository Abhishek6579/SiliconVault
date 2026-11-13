import { db } from './database';
import type { WorkspacePreference } from './types';

export function readPreference(key: string): Promise<WorkspacePreference | undefined> {
  return db.preferences.get(key);
}

export async function writePreference(key: string, value: unknown, updatedAt = Date.now()): Promise<void> {
  await db.preferences.put({ key, value, updatedAt });
}

export async function deletePreference(key: string): Promise<void> {
  await db.preferences.delete(key);
}
