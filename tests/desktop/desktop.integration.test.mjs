import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DesktopWebDriver } from './webdriver.mjs';

const app = new DesktopWebDriver();
const K = { ENTER: '\uE007' };

async function openWorkspaceMenu() {
  await app.click('.workspace-switch-button');
  await app.waitForCss('.workspace-switch-menu');
}

async function createFolder(name) {
  await app.click('.import-button');
  await app.clickText('.import-menu button', 'New folder');
  await app.waitForCss('.app-dialog .dialog-input');
  await app.sendKeys('.dialog-input', name);
  await app.click('.app-dialog button[type="submit"]');
  await app.waitForText('.workspace-body', name);
}

async function createNote(name) {
  await app.click('.import-button');
  await app.clickText('.import-menu button', 'New note');
  await app.waitForCss('.app-dialog .dialog-input');
  await app.clear('.dialog-input');
  await app.sendKeys('.dialog-input', name);
  await app.click('.app-dialog button[type="submit"]');
  const outcome = await app.waitFor(
    () => app.execute(
      'const expected = ' + JSON.stringify(name) + '; const tab = Array.from(document.querySelectorAll(".file-tab")).find((item) => item.innerText.includes(expected)); if (tab) return "opened"; return document.querySelector(".error-banner") ? "error" : false;',
    ),
    10_000,
    'new file tab to open or note creation error for ' + name,
  );
  if (outcome === 'error') {
    const message = await app.execute('return document.querySelector(".error-banner")?.innerText || "Unknown note creation error";');
    throw new Error('Could not create ' + name + ': ' + message);
  }
  await app.waitForCss('.editor-workspace');
  await app.waitForText('.file-tab', name);
}

async function ensureMarkdownEditing() {
  const mode = await app.waitFor(
    () => app.execute(
      'if (document.querySelector(".cm-content[contenteditable=\\"true\\"]")) return "editing"; const button=Array.from(document.querySelectorAll(".editor-tools button")).find((item) => ["Edit note","Preview"].includes(item.textContent.trim())); return button?.textContent.trim() || false;',
    ),
    12_000,
    'Markdown editor or preview toggle to load',
  );
  if (mode === 'Edit note') await app.clickText('.editor-tools button', 'Edit note');
  else if (mode !== 'Preview' && mode !== 'editing') throw new Error('Markdown editor did not reach an editable or preview state.');
  await app.waitForCss('.cm-content[contenteditable="true"]');
}

async function waitForCrashRecoverySnapshot(fileName, marker) {
  const snapshot = await app.waitFor(
    () => app.executeAsync(
      'const done=arguments[arguments.length-1]; const expectedName=arguments[0]; const expectedMarker=arguments[1]; const request=indexedDB.open("engineering-workspace"); request.onerror=()=>done({error:request.error?.message || "database open failed"}); request.onsuccess=()=>{ const database=request.result; let files=null, preferences=null, settled=false; const finish=()=>{ if(files===null || preferences===null || settled) return; settled=true; const file=files.find((item)=>item.name===expectedName && item.deletedAt===null); const draft=file ? preferences.find((item)=>item.key==="draft:"+file.id)?.value : undefined; const sessionValue=file ? preferences.find((item)=>item.key==="session:"+file.workspaceId)?.value : undefined; const session=sessionValue && typeof sessionValue==="object" ? sessionValue : {}; const sessionContainsTab=Boolean(file && Array.isArray(session.openFileIds) && session.openFileIds.includes(file.id) && session.activeFileId===file.id); done({ready:Boolean(file && typeof draft==="string" && draft.includes(expectedMarker) && sessionContainsTab),fileId:file?.id ?? null,draftPersisted:typeof draft==="string" && draft.includes(expectedMarker),sessionContainsTab,activeFileId:session.activeFileId ?? null,openFileIds:session.openFileIds ?? []}); database.close(); }; const tx=database.transaction(["files","preferences"],"readonly"); const fileRequest=tx.objectStore("files").getAll(); const preferenceRequest=tx.objectStore("preferences").getAll(); fileRequest.onsuccess=()=>{files=fileRequest.result;finish();}; preferenceRequest.onsuccess=()=>{preferences=preferenceRequest.result;finish();}; tx.onerror=()=>{if(!settled){settled=true;done({error:tx.error?.message || "database read failed"});database.close();}}; tx.onabort=()=>{if(!settled){settled=true;done({error:tx.error?.message || "database read aborted"});database.close();}}; };',
      fileName,
      marker,
    ),
    900,
    'crash recovery draft and active tab to reach IndexedDB',
  );
  if (!snapshot?.ready) {
    throw new Error('Crash recovery data was not durable before termination: ' + JSON.stringify(snapshot));
  }
}

async function selectFolder(name) {
  await app.click('[data-testid="project-tree-item"][data-item-kind="folder"][data-item-name="' + name + '"] .tree-main');
  await app.waitForText('.workspace-switch-button', name);
}

function makePdf() {
  const pages = [
    'SiliconVault desktop integration fixture page one',
    'Searchable signal NEEDLE phrase is on page two',
    'Lifecycle and PDF zoom verification page three',
  ];
  const objects = [];
  const fontId = 3 + pages.length * 2;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [' + pages.map((_, i) => (3 + i * 2) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>';
  pages.forEach((page, i) => {
    const pageId = 3 + i * 2;
    const stream = 'BT /F1 18 Tf 72 720 Td (' + page.replace(/[()\\]/g, '\\$&') + ') Tj ET';
    objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> /Contents ' + (pageId + 1) + ' 0 R >>';
    objects[pageId + 1] = '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream';
  });
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf);
    pdf += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id += 1) pdf += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  return pdf + 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
}

function makeBackup() {
  const now = Date.now();
  const workspaceId = 'desktop-restore-workspace';
  const content = '# Restored desktop note\n\nBackup round-trip marker.';
  const bytes = Buffer.from(content);
  return {
    format: 'engineering-workspace-backup',
    version: 1,
    exportedAt: now,
    files: [{
      meta: {
        id: 'desktop-restored-note', kind: 'markdown', name: 'restored-desktop-note.md',
        workspaceId, parentFolderId: null, projectId: null, size: bytes.length,
        mimeType: 'text/markdown', createdAt: now, updatedAt: now, deletedAt: null,
      },
      content: { encoding: 'text', value: content },
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }],
    folders: [], projects: [], preferences: [],
    workspaces: [{ id: workspaceId, name: 'Restored Desktop Workspace', createdAt: now, updatedAt: now }],
  };
}

before(async () => {
  await app.start();
  await app.waitForCss('body', 30_000);
  await app.waitForText('h1', 'Your work, in one place.', 30_000);
  await app.waitFor(
    () => app.execute('return !document.querySelector(".startup-screen");'),
    30_000,
    'startup overlay to close',
  );
});

after(async () => { await app.stop(); });

test('native desktop integration', async (t) => {
  await t.test('workspace create, switch and delete', async () => {
    await openWorkspaceMenu();
    await app.clickText('.workspace-switch-menu button', 'New workspace');
    await app.waitForText('.app-dialog h2', 'Create workspace');
    await app.sendKeys('.dialog-input', 'Desktop UI Test Workspace');
    await app.click('.app-dialog button[type="submit"]');
    await app.waitForText('.workspace-switch-button', 'Desktop UI Test Workspace');
    await openWorkspaceMenu();
    await app.clickText('.workspace-switch-menu button', 'My Workspace');
    await openWorkspaceMenu();
    await app.clickText('.workspace-switch-menu button', 'Desktop UI Test Workspace');
    await openWorkspaceMenu();
    await app.clickText('.workspace-switch-menu button', 'Delete this workspace');
    await app.waitForText('.app-dialog h2', 'Delete workspace?');
    await app.clickText('.app-dialog button', 'Delete workspace', true);
    await app.waitForText('.workspace-switch-button', 'My Workspace');
  });

  await t.test('project archive and restore', async () => {
    await openWorkspaceMenu();
    await app.clickText('.workspace-switch-menu button', 'New project');
    await app.waitForCss('.app-dialog .dialog-input');
    await app.sendKeys('.dialog-input', 'Desktop Archive Test');
    await app.click('.app-dialog button[type="submit"]');
    await app.waitForCss('[data-testid="project-tree-item"][data-item-name="Desktop Archive Test"]');
    // Creating a project selects it automatically; do not toggle it back to General files.
    await openWorkspaceMenu();
    await app.clickText('.workspace-switch-menu button', 'Delete project');
    await app.waitForText('.app-dialog h2', 'Delete project?');
    await app.clickText('.app-dialog button', 'Delete project', true);
    await app.waitForCss('.archived-heading');
    await app.click('[data-testid="project-tree-item"][data-item-name="Desktop Archive Test"] .tree-main');
    await openWorkspaceMenu();
    await app.clickText('.workspace-switch-menu button', 'Restore project', true);
    await app.waitForCss('[data-testid="project-tree-item"][data-item-name="Desktop Archive Test"]');
  });

  await t.test('nested folders, internal drag, rename, trash and restore', async () => {
    // Start from the general workspace root; the previous project-restore
    // scenario leaves a project selected, and folder creation uses that target.
    await app.click('[data-testid="nav-workspace"]');
    await createFolder('Desktop Root');
    await createFolder('Desktop Destination');
    await selectFolder('Desktop Root');
    await createFolder('Desktop Child');
    await selectFolder('Desktop Child');
    await createNote('desktop-move-note.md');

    await app.dragItem(
      '[data-testid="project-tree-item"][data-item-kind="file"][data-item-name="desktop-move-note.md"]',
      '[data-testid="project-tree-item"][data-item-kind="folder"][data-item-name="Desktop Destination"]',
    );
    await app.click('[data-testid="nav-workspace"]');
    await selectFolder('Desktop Destination');
    await app.waitForCss('[data-testid="workspace-item-row"][data-item-name="desktop-move-note.md"]');
    await app.click('[data-testid="workspace-item-row"][data-item-name="desktop-move-note.md"] .row-action');
    await app.clickText('.item-context-menu button', 'Rename');
    await app.waitForText('.app-dialog h2', 'Rename file');
    await app.clear('.dialog-input');
    await app.sendKeys('.dialog-input', 'desktop-renamed-note.md');
    await app.click('.app-dialog button[type="submit"]');
    await app.waitForCss('[data-testid="workspace-item-row"][data-item-name="desktop-renamed-note.md"]');

    await app.click('[data-testid="workspace-item-row"][data-item-name="desktop-renamed-note.md"] .row-action');
    await app.clickText('.item-context-menu button', 'Move to Trash');
    await app.waitForText('.app-dialog h2', 'Move file to Trash?');
    await app.clickText('.app-dialog button', 'Move to Trash', true);
    await app.click('[data-testid="nav-trash"]');
    await app.waitForCss('[data-testid="workspace-item-row"][data-item-name="desktop-renamed-note.md"]');
    await app.click('[data-testid="workspace-item-row"][data-item-name="desktop-renamed-note.md"] .file-name-button');
    await app.click('[data-testid="nav-workspace"]');
    await selectFolder('Desktop Destination');
    await app.waitForCss('[data-testid="workspace-item-row"][data-item-name="desktop-renamed-note.md"]');

    await app.click('[data-testid="nav-workspace"]');
    await selectFolder('Desktop Root');
    await app.waitForCss('[data-testid="workspace-item-row"][data-item-kind="folder"][data-item-name="Desktop Child"]');
    await app.click('[data-testid="workspace-item-row"][data-item-name="Desktop Child"] .row-action');
    await app.clickText('.item-context-menu button', 'Rename');
    await app.waitForText('.app-dialog h2', 'Rename folder');
    await app.clear('.dialog-input');
    await app.sendKeys('.dialog-input', 'Desktop Child Renamed');
    await app.click('.app-dialog button[type="submit"]');
    await app.waitForCss('[data-testid="workspace-item-row"][data-item-name="Desktop Child Renamed"]');

    await createFolder('Desktop Delete Folder');
    await app.click('[data-testid="workspace-item-row"][data-item-name="Desktop Delete Folder"] .row-action');
    await app.clickText('.item-context-menu button', 'Delete folder');
    await app.waitForText('.app-dialog h2', 'Delete folder?');
    await app.clickText('.app-dialog button', 'Delete folder', true);
    await app.waitFor(
      () => app.execute('return !document.querySelector(\'[data-testid="workspace-item-row"][data-item-name="Desktop Delete Folder"]\');'),
      8_000,
      'deleted nested folder to disappear',
    );
  });

  await t.test('editor autosave, local content search, tabs and recovery draft', async () => {
    await selectFolder('Desktop Destination');
    await app.click('[data-testid="workspace-item-row"][data-item-name="desktop-renamed-note.md"] .file-name-button');
    await ensureMarkdownEditing();
    await app.waitForCss('.cm-content[contenteditable="true"]');
    await app.click('.cm-content[contenteditable="true"]');
    await app.sendKeys('.cm-content[contenteditable="true"]', '\nDesktop autosave content marker');
    await app.waitForText('.save-status', 'Saved locally', 8_000);
    await app.execute('window.dispatchEvent(new CustomEvent("siliconvault:open-editor-search"));');
    await app.waitForCss('input[aria-label="Find in file"]');
    await app.sendKeys('input[aria-label="Find in file"]', 'Desktop autosave content marker');
    await app.sendKeys('input[aria-label="Find in file"]', K.ENTER);
    await app.waitForCss('.cm-selectionBackground');

    await createNote('desktop-second-tab.md');
    await app.clickText('.file-tab', 'desktop-renamed-note.md');
    await app.waitForText('.cm-content', 'Desktop autosave content marker');
    await app.clickText('.file-tab', 'desktop-second-tab.md');
    await ensureMarkdownEditing();
    await app.waitForCss('.cm-content[contenteditable="true"]');
    await app.click('.cm-content[contenteditable="true"]');
    await app.sendKeys('.cm-content[contenteditable="true"]', '\nPending close recovery marker');
    await waitForCrashRecoverySnapshot('desktop-second-tab.md', 'Pending close recovery marker');
    await app.crashAndRestart();
    await app.waitForText('.file-tab', 'desktop-second-tab.md', 20_000);
    await app.waitForText('.cm-content', 'Pending close recovery marker', 15_000);
  });

  await t.test('external WebView drop, PDF page navigation, full-text search, zoom and tab reopening', async () => {
    await app.click('[data-testid="nav-workspace"]');
    await app.dropFiles('.workspace-body', [{
      name: 'desktop-search-fixture.pdf', type: 'application/pdf', content: makePdf(),
    }]);
    await app.waitForText('.file-tab', 'desktop-search-fixture.pdf', 15_000);
    await app.waitForCss('.pdf-page-wrap[data-page="3"]', 30_000);
    await app.execute('window.dispatchEvent(new CustomEvent("siliconvault:open-file-search"));');
    await app.waitForCss('input[aria-label="Search PDF"]');
    await app.sendKeys('input[aria-label="Search PDF"]', 'NEEDLE phrase');
    await app.sendKeys('input[aria-label="Search PDF"]', K.ENTER);
    await app.waitForText('.pdf-search-results', 'Page 2', 20_000);
    assert.equal(await app.value('input[aria-label="Page number"]'), '2');
    await app.click('button[title="Zoom in"]');
    await app.waitForText('.pdf-zoom', '110%');
    await app.click('button[title="Next page"]');
    await app.waitFor(() => app.value('input[aria-label="Page number"]').then((v) => v === '3'), 8_000, 'PDF page 3');
    await app.clickText('.file-tab', 'desktop-renamed-note.md');
    await app.waitForText('.cm-content', 'Desktop autosave content marker');
    await app.clickText('.file-tab', 'desktop-search-fixture.pdf');
    await app.waitForText('.pdf-zoom', '110%');

    await app.click('.global-search-trigger');
    await app.waitForCss('input[aria-label="Search files and folders"]');
    await app.sendKeys('input[aria-label="Search files and folders"]', 'desktop-renamed-note.md');
    await app.waitForText('.search-result', 'desktop-renamed-note.md');
  });

  await t.test('backup restore confirmation, cancellation, valid restore and invalid-backup failure', async () => {
    const current = await app.text('.workspace-switch-button');
    const input = 'input[type="file"][accept="application/json,.json"]';
    const backup = JSON.stringify(makeBackup());
    await app.setFileInput(input, 'desktop-restore-fixture.json', backup);
    await app.waitForText('.app-dialog h2', 'Restore workspace backup?');
    await app.clickText('.app-dialog button', 'Cancel', true);
    await app.waitForText('.workspace-switch-button', current);

    await app.setFileInput(input, 'desktop-restore-fixture.json', backup);
    await app.waitForText('.app-dialog h2', 'Restore workspace backup?');
    await app.clickText('.app-dialog button', 'Restore backup', true);
    let restoreResult;
    try {
      restoreResult = await app.waitFor(
        () => app.execute(
          'const active=document.querySelector(".workspace-switch-button")?.innerText || ""; if(active.includes("Restored Desktop Workspace")) return "restored"; const error=document.querySelector(".error-banner")?.innerText || ""; if(error.includes("Workspace restore failed")) return "error: " + error; const activity=Array.from(document.querySelectorAll(".activity-card")).find((item) => item.innerText.includes("Restoring workspace")); if(activity?.classList.contains("activity-error")) return "error: " + (activity.querySelector(".activity-detail")?.innerText || "unknown restore error"); return false;',
        ),
        20_000,
        'workspace restore to complete or report an error',
      );
    } catch (error) {
      const state = await app.execute(
        'const activities=Array.from(document.querySelectorAll(".activity-card")).map((item)=>({className:item.className,title:item.querySelector(".activity-card-heading strong")?.innerText || "",detail:item.querySelector(".activity-detail")?.innerText || ""})); return JSON.stringify({activeWorkspace:document.querySelector(".workspace-switch-button")?.innerText || "",errorBanner:document.querySelector(".error-banner")?.innerText || "",alerts:Array.from(document.querySelectorAll("[role=alert]")).map((item)=>item.innerText),activities,dialog:document.querySelector(".app-dialog")?.innerText || ""});',
      );
      throw new Error('Backup restore diagnostic: ' + state + '; ' + error.message);
    }
    if (restoreResult !== 'restored') throw new Error('Backup restore failed: ' + restoreResult);
    await app.waitForCss('[data-testid="workspace-item-row"][data-item-name="restored-desktop-note.md"]');

    await app.setFileInput(input, 'invalid-backup.json', '{"format":');
    await app.waitForText('.error-banner', 'Backup validation failed', 10_000);
    await app.waitForCss('[data-testid="workspace-item-row"][data-item-name="restored-desktop-note.md"]');
  });

  await t.test('diagnostics view and refresh', async () => {
    if (await app.execute('return Boolean(document.querySelector(".global-search-close"));')) await app.click('.global-search-close');
    await app.click('[data-testid="open-diagnostics"]');
    await app.waitForText('.diagnostics-heading', 'Diagnostics');
    await app.waitForText('.diagnostics-section', 'Diagnostic files');
    await app.clickText('.diagnostics-actions button', 'Refresh');
    await app.waitForText('.diagnostics-card-grid', 'Session uptime');
    await app.clickText('.diagnostics-actions button', 'Back to workspace');
    await app.waitForCss('.workspace-body');
  });

  await t.test('graceful close, reopen and retained workspace/tab state', async () => {
    await app.click('[data-testid="workspace-item-row"][data-item-name="restored-desktop-note.md"] .file-name-button');
    await app.waitForCss('.editor-workspace');
    await app.restart();
    await app.waitForText('.workspace-switch-button', 'Restored Desktop Workspace', 20_000);
    await app.waitForText('.file-tab', 'restored-desktop-note.md', 20_000);
    await ensureMarkdownEditing();
    await app.waitForText('.cm-content', 'Backup round-trip marker', 15_000);
  });
});
