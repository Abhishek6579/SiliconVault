# Desktop platform support and release readiness

**Status date:** 14 November 2026  
**Development branch:** `slave`  
**Release baseline:** `v0.2.0-beta.2`

## Product direction

SiliconVault is a **desktop-only, local-first engineering workspace**. The release targets are:

| Priority | Platform | Target packages | Current focus |
| --- | --- | --- | --- |
| Primary | Windows 10/11 x64 | NSIS (.exe), MSI (.msi) | Immediate release and installed-upgrade validation |
| Secondary | Linux x86_64 | AppImage, DEB | Package CI exists; native runtime and release validation follow Windows |

Standalone browser/web deployments and macOS packages or releases are not product targets. Do not add browser compatibility checks or macOS jobs to release criteria.

## Desktop architecture

- Desktop shell: Tauri 2, React, TypeScript, Vite, and Rust.
- Data persistence: Dexie/IndexedDB in the Tauri application's embedded WebView profile.
- Platform integration: one Tauri desktop adapter in `src/platform/desktop.ts`, exposed through the shared `src/platform/types.ts` contract.
- Portable data path: version-1 JSON backup and restore.
- Reference desktop identity: `com.siliconvault.desktop`; Windows installer scope: per-user (`currentUser`).

Feature code must use the shared platform contract rather than calling Tauri APIs directly. The embedded WebView uses web-platform primitives internally; this does not create a standalone browser deployment requirement.

## Windows primary release gate

Windows remains the immediate priority. Do not delay Windows validation to expand Linux support.

1. Preserve the Tauri application identifier and per-user NSIS install scope.
2. Run frontend tests, TypeScript checks, architecture checks, and production build.
3. Run Rust tests and build both NSIS and MSI installers on the Windows runner.
4. Install and launch the candidate; verify native file/folder dialogs, imports, drag-and-drop, backups, restore, diagnostics, updates, and restart persistence.
5. Complete the previous-MSI-to-candidate-MSI installed upgrade test on a clean Windows 10/11 VM. Verify the existing WebView2/IndexedDB profile, workspaces, files, preferences, tabs, drafts, and PDF position.

A successful frontend build or installer build does not replace the installed-upgrade gate. See [Windows upgrade validation](windows-upgrade-validation.md).

The published updater manifest currently contains only the `windows-x86_64` target. Windows x64 is the only platform advertising in-app updater capability.

## Linux secondary track

CI builds AppImage and DEB packages on Ubuntu with the native Tauri prerequisites. Linux work remains secondary to Windows and must not become a dependency of the Windows validation sequence.

Linux AppImage and DEB assets are attached to the release by a downstream job after Windows publication. Before claiming Linux runtime validation complete, test on a real supported Linux desktop:
- AppImage launch and DEB install/uninstall behavior.
- Native file and folder dialogs, recursive import, and file-manager drag-and-drop.
- Backup export and restore, restart persistence, diagnostics, and Office conversion fallback.
- Required runtime libraries, file permissions, desktop integration, and upgrade behavior.

Linux automatic updating is not enabled until an AppImage updater artifact and matching signed manifest entry are deliberately added and verified. Published package artifacts alone are not evidence of installed runtime correctness.

## Continuous integration

- Shared frontend tests, type checks, architecture checks, build, dependency audit, and performance benchmarks.
- Required Windows desktop job: Rust tests, NSIS/MSI build, signing checks, and installer artifacts.
- Secondary, non-blocking Linux desktop job: Rust tests, AppImage/DEB build, and package artifacts. Linux packaging failures are reported but do not fail the Windows validation/release gate.
- No browser-app end-to-end release job.
- No macOS runner, signing, notarization, or package job.

Chromium may still be used as an isolated benchmark harness for IndexedDB measurements. That is not a browser product compatibility target.

## Data portability and backup safeguards

- Backup schema version 1 remains the compatibility format.
- Export and restore share maximum record, per-file, aggregate-content, and serialized-file-size limits.
- Export preflights limits and stored-content size consistency before opening the native save dialog.
- Restore validates record shape, references, duplicate IDs, sizes, and SHA-256 content checksums before live-store replacement.
- The restore transaction replaces application stores together; a failed transaction must leave the previous database intact.
- Restore parsing runs in a dedicated worker to keep JSON parsing off the UI thread, but still materializes the full v1 JSON value. It is not streaming or record-at-a-time parsing.
- A staged v2 streaming restore remains design work. Do not change the default backup format until compatibility, interruption recovery, fault injection, and atomic promotion are verified.

Backups are plaintext JSON and are not encrypted by SiliconVault. Users should protect exported backup files as sensitive data.

## Shared portability constraints

- File and folder sibling names use NFC-normalized, case-insensitive comparison to avoid Windows/Linux name collisions.
- Imported folder paths use normalized forward-slash separators; parent traversal segments are rejected.
- Tauri filesystem operations remain constrained to picker-selected files and folders.
- Existing application data remains in the embedded WebView profile, outside the installation directory. Preserve the Tauri application identifier and installer scope unless a deliberate data migration is designed.
