# Cross-Platform Port Readiness

## Repository baseline

- Shell: Tauri 2, React, TypeScript, Vite, Rust.
- Data: Dexie/IndexedDB in the WebView; backup/restore is the portable data path.
- Existing automated coverage at inspection: Vitest tests and Playwright browser tests exist; 10 Vitest files passed before the latest path-adapter test was added.
- Current task branch: `slave`, based on local commit `17a53390478f0f9205fd5cc40002b1c59685c358` (`chore(updater): publish v0.2.0-beta.2`).
- The checked-out Git metadata reports the correct branch and commit, but `git status` fails with “this operation must be run in a work tree”. No baseline tag was created because a reliable working-tree state could not be established.
- A real golden backup was not created: this session has repository access, not the running Windows app's IndexedDB data. Do not substitute a fabricated or empty fixture.

## Platform integration changes

`src/platform/` now contains the platform contract, one-time shell selection, a browser adapter, and the Tauri adapter. React features use the contract for native commands, update events, safe shutdown, diagnostics, Office conversion, backup dialogs, and file/folder pickers. Folder import paths pass through one normalizer before hierarchy reconstruction.

Tauri filesystem access remains limited to picker-selected paths, and the existing Content Security Policy, capabilities, database, backup format, and Windows install identity were not changed.

## Automated validation

- `npm run typecheck`: passed after the final platform changes.
- `npm run build`: passed; Vite reported large-chunk warnings.
- `npm test`: 64 tests passed across 11 files, including the new relative-path tests.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 4 passed. Cargo emitted three existing dead-code warnings.
- `npm run tauri:build`: not run. This requires native Windows build prerequisites and project build output access.

## Remaining native bring-up gates

Do not mark the port complete until all of these are performed and recorded:

1. Export and validate a representative backup from a real Windows installation; save it as a protected golden fixture only after checking it contains no private data.
2. Repair or recreate the local Git worktree metadata, confirm a clean baseline, and create the requested baseline tag without moving the task off `slave`. Git reports the branch and commit but `git status` and `git diff --check` both fail because Git does not recognize this checkout as a work tree.
3. Run Windows packaged-app regression workflows and Rust tests.
4. Configure and run Linux AppImage/deb and macOS DMG builds on native CI runners; document prerequisites.
5. Exercise the manual workflow checklist on Windows, Linux, and macOS, including WebView behavior and drag-and-drop.
6. Run all six cross-OS backup/restore directions and record hashes, counts, metadata, and PDF checks.
7. Resolve open decisions on duplicate filenames, macOS pinch zoom, signing/notarization, and per-OS updater behavior.
8. Complete the architecture migration and enforce dependency boundaries only after each area is characterized and tested. Existing features still import the database directly; this adapter change intentionally does not rewrite storage architecture.
