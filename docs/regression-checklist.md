# SiliconVault Regression Checklist

Run these checks on each supported desktop OS before a release. Record the OS version, app build, runtime, tester, date, and observed result. Items marked manual require a real desktop session.

| Workflow | Steps | Expected result | Result |
| --- | --- | --- | --- |
| File import | Choose Import files, select a PDF and a Markdown or code file, then open each | Each file appears in the selected workspace/folder and opens in the appropriate viewer/editor | Not run in this repository-only session |
| Folder import | Choose Import folder on a nested sample directory | Folder hierarchy and relative file paths are preserved | Not run in this repository-only session |
| OS drag-and-drop | Drop a file from the OS file manager into the workspace | File is imported once into the selected destination | Not run in this repository-only session |
| Internal drag-and-drop | Move an item using the in-app tree/list | Item and folder subtree move to the selected destination | Not run in this repository-only session |
| PDF reader | Open a known PDF; navigate, search, and jump to a page | Page navigation and search results are correct | Not run in this repository-only session |
| Edit and save | Edit a Markdown/code file, wait for autosave, close and reopen | Saved content is present and status reports success | Not run in this repository-only session |
| Unsaved-change handling | Edit a file and close the app before debounce completes | Draft is persisted or close is cancelled on save failure | Not run in this repository-only session |
| Backup and restore | Save a backup, then restore it into a test workspace | Export validates; restore preserves records and attachments | Existing automated storage round-trip tests pass; native dialogs not run |
| Keyboard shortcuts | Test search, close-tab, and zoom shortcuts | Ctrl works on Windows/Linux; Cmd works on macOS | Not run on native sessions |
| Zoom | Zoom in, out, then reset | UI returns to default zoom and remains usable | Not run in a desktop session |
| Restart persistence | Create workspace data, close app, restart | Workspaces, files, theme, and session state persist | Not run in a desktop session |
| Theme persistence | Change theme, close app, restart | Selected theme remains active | Not run in a desktop session |
| Update check | Request an update check on a packaged build | Update state and release notes are reported correctly | Not run in a signed packaged build |
