# SiliconVault Architecture Decisions

## ADR-001: Windows is the reference platform; keep the React UI

- **Status:** Accepted
- **Decision:** Keep the existing React application and Tauri 2 shell. Windows remains the regression reference while platform integrations move behind `src/platform/`.
- **Reason:** The current application already has a Tauri desktop shell, React UI, and Windows installer workflow. Rewriting the UI or changing the shell would increase migration risk without helping the port.
- **Consequence:** Windows behavior must be checked after platform changes. macOS and Linux packaging and runtime support remain unverified until tested on their native runners.

## D-01: Canonical imported relative paths

- **Status:** Accepted
- **Decision:** Store paths reconstructed from folder imports with `/` separators. Normalize both slash styles at the picker boundary and reject parent traversal segments.
- **Reason:** Browser folder pickers and native dialogs can report paths with different separators. A single internal representation avoids platform-dependent folder trees.

## D-02: Case-insensitive duplicate names

- **Status:** Accepted for new and moved items
- **Decision:** Compare sibling file and folder names using NFC normalization and locale-independent lowercase. Reject new imports, creations, renames, and moves that collide within the same workspace, project, and parent folder. Existing records are preserved; no startup migration or deletion is performed.
- **Reason:** Windows and default macOS filesystems are case-insensitive while common Linux filesystems are case-sensitive. A consistent rule avoids workspaces that cannot be represented on every target.
- **User impact:** On Linux, users can no longer create or import `notes.md` beside `Notes.md`. Existing collisions remain visible and are not silently modified; users must resolve them before moving/renaming into a colliding destination.

## D-03: macOS trackpad zoom

- **Status:** Accepted; native macOS verification pending
- **Decision:** Treat pinch-generated wheel events reported with `ctrlKey` as the same zoom gesture as Ctrl/Cmd+wheel. The focused surface receives the existing zoom behavior (PDF zoom, editor font size, or app zoom).
- **Reason:** This preserves one shared input path and matches the existing Ctrl/Cmd+wheel behavior without adding platform-specific detection to the UI.
- **Validation:** Unit coverage verifies the shared modifier recognizes a Ctrl wheel gesture. Confirm the actual WebKit event and focused-surface behavior on macOS hardware before release.

## D-04: Backup schema version

- **Status:** Accepted
- **Decision:** Keep the existing backup `version: 1` schema. Do not add or rename a version field without a versioned compatibility migration.
- **Reason:** Existing exported backups use this field. The current importer validates it, validates relationships and SHA-256 checksums, and writes records transactionally.

## D-05: Desktop shell

- **Status:** Accepted
- **Decision:** Tauri 2 with React, TypeScript, Vite, Rust native integration, and Dexie/IndexedDB for application data.
- **Reason:** This is the existing shipped architecture and is confirmed by `src-tauri/`, `package.json`, and the Tauri configuration.

## D-06: Per-OS overrides

- **Status:** Accepted
- **Decision:** Keep behavior shared unless a native-runner test demonstrates an OS-specific difference. Do not add speculative Windows, macOS, or Linux override modules.
