import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceDatabase } from '../src/storage/database';
import { createTextFile } from '../src/storage/files';
import { hydrateWorkspaceTab } from '../src/storage/tabSession';
import type { Tab } from '../src/features/tabs/types';

const databases: WorkspaceDatabase[] = [];
function createDatabase() {
  const database = new WorkspaceDatabase(`tab-hydration-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await database.delete();
  }));
});

describe('editable tab hydration', () => {
  it('keeps one editable document copy in the draft field', async () => {
    const database = createDatabase();
    await database.open();
    const meta = await createTextFile(database, 'single-copy.md', 'one authoritative document');
    const placeholder: Tab = { id: meta.id, meta, draft: '', dirty: false, hydrated: false, preview: true };
    const hydrated = await hydrateWorkspaceTab(database, placeholder);
    expect(hydrated.hydrated).toBe(true);
    expect(hydrated.draft).toBe('one authoritative document');
    expect(Object.prototype.hasOwnProperty.call(hydrated, 'data')).toBe(false);
  });
});
