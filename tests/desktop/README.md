# Native desktop integration testing

This suite launches the **Tauri application binary** and drives its embedded WebView over WebDriver. It does not start Vite in a browser, launch Chrome as a product target, or restore browser E2E requirements. Targets are Windows (primary) and Linux (secondary).

## Run locally

Requirements: Node.js 22+, Rust/Tauri build prerequisites, `npm ci`, `cargo install tauri-driver --locked`, and the native WebView driver.

- Windows: WebView2 Runtime and a matching Microsoft Edge WebDriver on `PATH`. `msedgedriver-tool` can provision a matching driver.
- Linux: the WebKitGTK WebDriver binary (`WebKitWebDriver`) and an active display. Ubuntu 26.04 uses the `webkitgtk-webdriver` package; headless CI uses Xvfb.

Run:

```sh
npm run test:desktop
```

The command builds the debug Tauri executable without bundling, then runs Node's built-in test runner serially. The harness creates a temporary app-data profile (APPDATA/LOCALAPPDATA on Windows or XDG paths on Linux), so it does not use the normal user workspace.

Optional environment overrides:

- `TAURI_APPLICATION_PATH`: absolute path to the debug app executable.
- `TAURI_DRIVER_PATH`: absolute path to `tauri-driver`.
- `TAURI_WEBDRIVER_URL`: WebDriver URL; defaults to `http://127.0.0.1:4444`.

## Automated coverage

- Workspace creation, switching, deletion; project archive and restore.
- Nested folder creation, internal file movement, file/folder rename, trash and restore.
- Markdown editing, autosave, in-document find, tab switching, crash recovery draft and graceful reopen.
- External file-drop event into the embedded WebView; PDF page navigation, full-text search, zoom and tab reopening.
- Backup restore confirmation, cancellation, valid restore and invalid-backup error.
- Diagnostics view and refresh; export contents and native save-dialog failure cases are covered by the acceptance checklist.

The synthetic file-drop test exercises the app's WebView drop handler. A physical drag from Explorer or a Linux file manager is listed separately below. Existing Vitest and Rust tests remain responsible for lower-level hierarchy, backup checksum/rollback, database and logging behavior.

## Native acceptance tests

WebDriver cannot reliably own OS-native picker dialogs or exercise real installers. Run and record these checks separately on each supported OS (include OS version, app version and package):

- [ ] Import a file through the native open dialog; verify name, MIME type and contents.
- [ ] Cancel file import; verify no changes and no hang.
- [ ] Import a nested folder; verify relative paths and all descendants.
- [ ] Cancel folder import; verify no changes.
- [ ] Export a workspace backup via the native save dialog; verify non-empty output and successful restore.
- [ ] Cancel backup export; verify no partial output and no data changes.
- [ ] Restore using the native open dialog; test both confirmation and Cancel.
- [ ] Cancel the native restore picker; verify the current workspace is untouched.
- [ ] Export diagnostics; inspect valid JSON, bounded logs, system metadata and absence of document contents.
- [ ] Make the diagnostics destination unavailable/read-only; verify a visible error and no crash.
- [ ] Drag a real file and directory from Windows Explorer / Linux file manager into the app.
- [ ] Move files and folders within the tree; reject moves into a folder's own descendant and verify the hierarchy remains intact.
- [ ] Fresh-install Windows NSIS and MSI packages; launch from Start menu/shortcut.
- [ ] Upgrade over the previous supported build; verify workspaces, preferences and open tabs survive.
- [ ] Uninstall/reinstall; confirm user workspace data is retained.
- [ ] Install/launch Linux AppImage and DEB packages; repeat persistence checks.
- [ ] Verify minimize, maximize, normal close, restart and reopen.

Use `scripts/windows/validate-installed-upgrade.ps1` for the existing Windows installed-upgrade workflow. Building a package in CI is not equivalent to executing its installer.

## Search boundary

Current global search searches file and folder names. Content search is tested within an opened Markdown editor and PDF reader; the suite does not claim workspace-wide full-text indexing. Adding global content indexing is a separate product feature.
