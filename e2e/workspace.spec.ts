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
