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


test('moves a file to Trash and restores it without losing its content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your work, in one place.' })).toBeVisible();

  await page.getByRole('button', { name: /Technical notes/ }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByPlaceholder('File name').fill('trash-roundtrip.md');
  await createDialog.getByRole('button', { name: 'Create file' }).click();
  await expect(page.locator('.tree-row.file-row').filter({ hasText: 'trash-roundtrip.md' })).toBeVisible();

  await page.locator('.tree-row.file-row').filter({ hasText: 'trash-roundtrip.md' }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog.getByRole('heading', { name: 'Move file to Trash?' })).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Move to Trash', exact: true }).click();

  await page.locator('.sidebar-primary .nav-item').filter({ hasText: 'Trash' }).click();
  const trashedRow = page.locator('.file-list-row').filter({ hasText: 'trash-roundtrip.md' });
  await expect(trashedRow).toBeVisible();
  await trashedRow.getByRole('button', { name: 'Restore' }).click();
  await expect(trashedRow).toHaveCount(0);

  await page.locator('.sidebar-primary .nav-item').filter({ hasText: 'Workspace' }).click();
  await expect(page.locator('.tree-row.file-row').filter({ hasText: 'trash-roundtrip.md' })).toBeVisible();
});

test('keeps files isolated when switching between workspaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your work, in one place.' })).toBeVisible();

  const createNote = async (name: string) => {
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('button', { name: 'New note' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Create note' })).toBeVisible();
    await dialog.getByPlaceholder('File name').fill(name);
    await dialog.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.tree-row.file-row').filter({ hasText: name })).toBeVisible();
  };

  await createNote('workspace-alpha.md');

  await page.locator('.workspace-switch-button').click();
  await page.getByRole('button', { name: 'New workspace…' }).click();
  const workspaceDialog = page.getByRole('dialog');
  await expect(workspaceDialog.getByRole('heading', { name: 'Create workspace' })).toBeVisible();
  await workspaceDialog.getByPlaceholder('Workspace name').fill('E2E Workspace Beta');
  await workspaceDialog.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.locator('.workspace-switch-button')).toContainText('E2E Workspace Beta');

  await createNote('workspace-beta.md');
  await expect(page.locator('.tree-row.file-row').filter({ hasText: 'workspace-alpha.md' })).toHaveCount(0);

  await page.locator('.workspace-switch-button').click();
  await page.getByRole('button', { name: 'My Workspace', exact: true }).click();
  await expect(page.locator('.tree-row.file-row').filter({ hasText: 'workspace-alpha.md' })).toBeVisible();
  await expect(page.locator('.tree-row.file-row').filter({ hasText: 'workspace-beta.md' })).toHaveCount(0);

  await page.locator('.workspace-switch-button').click();
  await page.getByRole('button', { name: 'E2E Workspace Beta', exact: true }).click();
  await expect(page.locator('.tree-row.file-row').filter({ hasText: 'workspace-beta.md' })).toBeVisible();
  await expect(page.locator('.tree-row.file-row').filter({ hasText: 'workspace-alpha.md' })).toHaveCount(0);
});


test('imports a text file, edits it, saves it, and recovers the saved content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your work, in one place.' })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'import-edit.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('original import content'),
  });
  await expect(page.locator('.editor-workspace')).toBeVisible();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.fill('edited content persisted by SiliconVault');
  await page.locator('button[title="Save changes (Ctrl+S)"]').click();

  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('engineering-workspace');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const transaction = database.transaction(['files', 'contents'], 'readonly');
        const files = transaction.objectStore('files').getAll();
        files.onsuccess = () => {
          const file = files.result.find((item: { name: string }) => item.name === 'import-edit.txt');
          if (!file) { resolve(null); return; }
          const contentRequest = transaction.objectStore('contents').get(file.id);
          contentRequest.onsuccess = () => resolve(typeof contentRequest.result?.data === 'string' ? contentRequest.result.data : null);
          contentRequest.onerror = () => reject(contentRequest.error);
        };
        files.onerror = () => reject(files.error);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  })).toBe('edited content persisted by SiliconVault');

  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('edited content persisted by SiliconVault');
});

test('exports and restores a backup through the browser workflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your work, in one place.' })).toBeVisible();

  await page.getByRole('button', { name: /Technical notes/ }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByPlaceholder('File name').fill('backup-roundtrip.md');
  await createDialog.getByRole('button', { name: 'Create file' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();

  await page.locator('input[type="file"]').nth(2).setInputFiles(backupPath!);
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog.getByRole('heading', { name: 'Restore workspace backup?' })).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Restore backup', exact: true }).click();

  await expect(page.locator('.tree-row.file-row').filter({ hasText: 'backup-roundtrip.md' })).toBeVisible();
});
