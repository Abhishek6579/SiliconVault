# Windows installed-app upgrade validation

This is a required installed-product release gate. A successful frontend test or installer build is not evidence that a Windows upgrade preserves the user's WebView2/IndexedDB profile.

## Automated checks in pull-request CI

The Windows desktop job compares the candidate Tauri application identifier and NSIS install scope against master, builds both NSIS and MSI installers from the PR commit, and uploads them as a 14-day artifact. CI also runs the browser persistence suite, which exercises IndexedDB reload behavior in Chromium. These checks validate packaging and browser persistence separately; they do not simulate an in-place installed MSI upgrade.

## Installed upgrade test matrix

Run on a clean Windows 10/11 VM with WebView2 Runtime installed. Use the same Windows account and per-user install scope for both versions.

1. Install the previous published per-user MSI. Record its version and SHA-256.
2. Launch SiliconVault and create a non-default workspace, a project, nested folder, Markdown note, text/code file, PDF, and a non-empty Trash entry.
3. Change the theme, app zoom, editor font size, and PDF reading position. Edit a note and leave a recoverable unsaved draft.
4. Close the app normally and confirm no SiliconVault process remains.
5. Record the WebView2 user-data directory and confirm the engineering-workspace IndexedDB database exists. Do not copy, rename, or modify the live profile while the app is running.
6. Install the candidate MSI over the existing installation. Do not uninstall first. Capture the installer exit code and log.
7. Launch the upgraded app under the same Windows account.
8. Verify all workspaces, project/folder hierarchy, text and binary file contents, Trash state, theme, zoom, editor font size, PDF page/zoom, open tabs, active tab, and recovered draft.
9. Edit and save a note, close the app, relaunch, and verify the edit persists.
10. Repeat with the app open when the installer starts. The installer must close/restart cleanly or fail without corrupting the existing profile.
11. Capture evidence before uninstalling. Then verify the documented uninstall data-retention policy separately.

## Required evidence

Attach:
- Windows edition/build and WebView2 Runtime version.
- Old/new application versions and installer SHA-256 hashes.
- MSI installation logs and exit codes.
- Exact WebView2 user-data directory.
- Before/after screenshots of the workspace hierarchy, open tabs, editor state, and PDF position.
- A before/after database inventory (store names and record counts); never attach the user's actual database or backup.

## Stable identity invariants

- Tauri application identifier: com.siliconvault.desktop.
- Windows installation scope: per-user (currentUser).
- Installer upgrade must retain the same product identity and WebView2 user-data directory.
- Application data must remain outside the installation directory.
- An installer upgrade must not clear, recreate, or migrate the IndexedDB profile destructively.

**Status:** CI validates the Windows package build and browser IndexedDB reload behavior. Actual installed MSI upgrade persistence remains a manual VM gate and must not be marked complete until the evidence above is attached.
