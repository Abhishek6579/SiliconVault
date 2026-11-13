# Cross-platform readiness

**Status date:** 14 November 2026  
**Development branch:** `slave`  
**Release baseline:** `v0.2.0-beta.2`

## Architecture

- Desktop shell: Tauri 2, React, TypeScript, Vite, and Rust.
- Data persistence: Dexie/IndexedDB in the application WebView.
- Platform integration: shared `src/platform/` contract with a Tauri desktop adapter and browser adapter.
- Portable data path: version-1 JSON backup and restore.
- Reference desktop identity: `com.siliconvault.desktop`; Windows installer scope: per-user (`currentUser`).

The platform adapter centralizes native dialogs, file and folder selection, backup save/open, diagnostics, system statistics, Office conversion, update events, and safe shutdown. Feature code should depend on the adapter rather than calling Tauri APIs or inspecting the host OS directly.

The published updater manifest currently contains only the `windows-x86_64` target. The desktop adapter therefore advertises update support only for Windows x64; Linux, macOS, and Windows ARM must not show a working updater until matching signed artifacts and manifest entries are published.

## Automated validation evidence

The following results were observed on the remote `slave` head `d1a778a9a916bb35866c7ca3707e385bb810487f` (GitHub Actions run [#795](https://github.com/Abhishek6579/SiliconVault/actions/runs/43507779310)):

- Frontend unit tests, TypeScript, architecture-boundary check, and production build passed.
- Browser Playwright workflows passed.
- Dependency audit passed at `npm audit --audit-level=high`.
- Storage and backup-memory benchmark jobs passed.
- Rust tests passed in the Windows, Linux, and macOS jobs.
- Windows NSIS/MSI, Linux AppImage/DEB, and macOS DMG CI package builds and artifact uploads passed.

The same validation was run locally on Windows using `validate.ps1`: 89 unit tests, 8 Playwright tests, TypeScript, Vite build, storage benchmark, and backup-memory benchmark passed. The local output included three non-fatal Rust dead-code warnings.

**Scope of this evidence:** it establishes successful automated checks and package builds for the specified commits. It does not establish end-user runtime behavior on every OS or validate upgrades of an already-installed application. The newer backup-export and updater-capability changes must receive their own CI run before being treated as verified.

## Data portability and backup safeguards

- Backup schema version 1 remains the compatibility format.
- Export and restore share the same maximum record, per-file, aggregate-content, and serialized-file-size limits.
- Export preflights limits and stored-content size consistency before opening the native save dialog or starting the browser download.
- Restore validates record shape, references, duplicate IDs, sizes, and SHA-256 content checksums before the live-store replacement transaction.
- The restore transaction replaces application stores together; a failed transaction must leave the previous database intact.
- The current restore parser still uses `File.text()` followed by `JSON.parse()` inside a dedicated worker. This keeps JSON parsing off the UI thread but materializes the full v1 JSON value. It is not streaming or record-at-a-time parsing.
- A staged v2 streaming restore remains design work. Do not change the default backup format until cross-version compatibility, interruption recovery, fault injection, and atomic promotion are verified.

Backups are plaintext JSON and are not encrypted by SiliconVault. Users should protect exported backup files as sensitive data.

## Remaining native and distribution gates

1. **Windows installed upgrade:** run the documented previous-MSI-to-candidate-MSI test on a clean Windows 10/11 VM. Verify the same WebView2 profile, workspaces, files, settings, tabs, drafts, and PDF position survive an in-place upgrade. A successful installer build is not a substitute.
2. **Native runtime smoke tests:** launch the packaged app on supported Windows, Linux, and macOS systems. Exercise file/folder dialogs, folder import, save/restore, drag-and-drop, PDF viewing, Office viewing/fallback, close handling, and diagnostics.
3. **Cross-OS backup matrix:** exercise Windows→Linux, Windows→macOS, Linux→Windows, Linux→macOS, macOS→Windows, and macOS→Linux with real representative backups; compare record counts, hierarchy, hashes, and PDF content.
4. **Office fidelity:** maintain representative DOCX, XLSX, and PPTX fixtures. Validate charts, images, tables, formulas, fonts, large files, and worker behavior in real WebViews. Do not claim pixel parity with Microsoft Office.
5. **Linux/macOS updating:** implement and validate platform-specific signed update packages and updater manifest entries before enabling those capabilities.
6. **macOS distribution:** determine signing and notarization requirements for the intended distribution channel and validate the downloaded DMG on a clean Mac.
7. **Repository protection:** configure and verify GitHub rulesets for `master` and `v*` tags. The documentation alone does not enforce them.
8. **Golden backup:** export a representative backup from a real installed application, inspect it for private data, and only then preserve a redacted or synthetic fixture for repeatable compatibility tests.

## Decisions and portability constraints

- File and folder sibling names use NFC-normalized, case-insensitive comparison to prevent cross-platform collisions.
- Imported folder paths use normalized forward-slash separators; parent traversal segments are rejected.
- macOS pinch-to-zoom is mapped to the shared Ctrl/Cmd-wheel gesture but still requires hardware verification.
- Tauri filesystem operations should remain constrained to picker-selected files and folders.
- Existing application data remains in the WebView profile, outside the installation directory. Preserve the Tauri application identifier and installer scope unless a deliberate data migration is designed.
