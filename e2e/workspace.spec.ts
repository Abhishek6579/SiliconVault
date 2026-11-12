import { expect, test } from '@playwright/test';

test('creates a project and preserves it after a browser restart', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your work, in one place.' })).toBeVisible();

  await page.getByRole('button', { name: 'Create a project' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create project' })).toBeVisible();
  await dialog.getByPlaceholder('Project name').fill('E2E persistence project');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByText('E2E persistence project', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('E2E persistence project', { exact: true }).first()).toBeVisible();
});

test('restores open tabs and the active file after a browser reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your work, in one place.' })).toBeVisible();

  await page.getByRole('button', { name: /Technical notes/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create note' })).toBeVisible();
  await dialog.getByPlaceholder('File name').fill('session-restore.md');
  await dialog.getByRole('button', { name: 'Create file' }).click();

  const tabs = page.locator('.tab-strip .file-tab');
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toContainText('session-restore.md');

  // The tab is only rendered after its session record has committed to IndexedDB.
  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('engineering-workspace');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const transaction = database.transaction('preferences', 'readonly');
        const request = transaction.objectStore('preferences').get('session:workspace-default');
        request.onsuccess = () => {
          const session = request.result?.value;
          resolve(Boolean(
            session
            && session.openFileIds?.length === 1
            && session.activeFileId === session.openFileIds[0]
          ));
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  })).toBe(true);

  await page.reload();

  const restoredTabs = page.locator('.tab-strip .file-tab');
  await expect(restoredTabs).toHaveCount(1);
  await expect(restoredTabs.first()).toContainText('session-restore.md');
  await expect(page.locator('.editor-workspace')).toBeVisible();
});


test('keeps multiple open documents and the selected tab across reloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your work, in one place.' })).toBeVisible();

  const createNote = async (name: string) => {
    if (name === 'first-session.md') {
      await page.getByRole('button', { name: /Technical notes/ }).click();
    } else {
      await page.getByRole('button', { name: 'Import', exact: true }).click();
      await page.getByRole('button', { name: 'New note' }).click();
    }
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Create note' })).toBeVisible();
    await dialog.getByPlaceholder('File name').fill(name);
    await dialog.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.tab-strip .file-tab').filter({ hasText: name })).toBeVisible();
  };

  await createNote('first-session.md');
  await createNote('second-session.md');
  const tabs = page.locator('.tab-strip .file-tab');
  await expect(tabs).toHaveCount(2);
  await tabs.filter({ hasText: 'first-session.md' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('engineering-workspace');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const transaction = database.transaction(['files', 'preferences'], 'readonly');
        const files = transaction.objectStore('files').getAll();
        const session = transaction.objectStore('preferences').get('session:workspace-default');
        transaction.oncomplete = () => {
          const first = files.result.find((file: { name: string }) => file.name === 'first-session.md');
          resolve(Boolean(first && session.result?.value?.activeFileId === first.id
            && session.result?.value?.openFileIds?.length === 2));
        };
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { database.close(); }
  })).toBe(true);
  await page.reload();
  await expect(page.locator('.tab-strip .file-tab')).toHaveCount(2);
  await expect(page.locator('.tab-strip .file-tab').filter({ hasText: 'first-session.md' })).toBeVisible();
  await expect(page.locator('.tab-strip .file-tab').filter({ hasText: 'second-session.md' })).toBeVisible();
  await expect(page.locator('.editor-workspace')).toBeVisible();
});
