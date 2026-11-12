# Windows installed-app upgrade validation

This is a manual release gate until an automated installer test can launch and inspect a real WebView2 profile.

## Test matrix

Run on a clean Windows 10/11 VM with WebView2 Runtime installed.

1. Install the previous published per-user MSI using the same Windows account and install scope as production.
2. Launch SiliconVault and create:
   - A workspace with a non-default name.
   - A project, nested folder, Markdown note, text/code file, and PDF.
   - A non-empty Trash entry.
   - A changed theme, app zoom, editor font size, and PDF reading position.
3. Close the app normally and confirm no process remains.
4. Record the app data directory and verify the workspace database is present. Do not copy or modify the live database while the app is running.
5. Install the candidate MSI over the existing installation. Do not uninstall first; uninstalling can exercise a different data-removal path.
6. Launch the upgraded app under the same Windows account.
7. Verify all workspaces, hierarchy, file contents, Trash state, preferences, and PDF position.
8. Edit and save a note, close the app, relaunch, and verify the edit persists.
9. Repeat with an upgrade where the app is open during installer startup; the installer should either close/restart cleanly or fail without corrupting the existing profile.
10. Uninstall only after evidence has been captured. Verify the documented uninstall policy for user data.

## Required evidence

Attach Windows version, old/new app versions, MSI SHA-256 hashes, install logs, screenshots of the preserved records, and the exact app-data path. A successful MSI build alone is not evidence of data preservation.

## Stable identity assumptions to verify

- Tauri application identifier remains `com.siliconvault.desktop`.
- Windows installation remains per-user (`currentUser`).
- Upgrade uses the same product identity and does not change WebView2 user-data location.
- Installer upgrade does not remove user profile data.

**Status:** test procedure only. Installed-app persistence across MSI upgrades is not yet proven by automated CI.
