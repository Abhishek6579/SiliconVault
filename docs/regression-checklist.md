# SiliconVault Regression Checklist

Run the full checklist on Windows first; this is the immediate release gate. Run the corresponding native smoke checks on Linux as the secondary track after Windows validation. Record the OS version, app build, runtime, tester, date, and observed result. Items marked manual require a real desktop session.

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
| Keyboard shortcuts | Test search, close-tab, and zoom shortcuts | Ctrl shortcuts work consistently on Windows and Linux | Not run on native sessions |
| Zoom | Zoom in, out, then reset | UI returns to default zoom and remains usable | Not run in a desktop session |
| Restart persistence | Create workspace data, close app, restart | Workspaces, files, theme, and session state persist | Not run in a desktop session |
| Theme persistence | Change theme, close app, restart | Selected theme remains active | Not run in a desktop session |
| Update check | Request an update check on a packaged build | Windows x64 reports the published signed update; Linux does not advertise updater support until its manifest target is verified | Not run in a signed packaged build |
| Linux package smoke test | Install the DEB or launch the AppImage on a supported Linux desktop | The app launches, imports files, persists data, and exports/restores a backup | Secondary validation; not run in this repository-only session |
