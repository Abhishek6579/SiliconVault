# SiliconVault Architecture Decisions

## ADR-001: Windows is the reference platform; keep the React UI

- **Status:** Accepted
- **Decision:** Keep the existing React application and Tauri 2 shell. Windows remains the regression reference while platform integrations stay behind `src/platform/`.
- **Reason:** The current application already has a Tauri desktop shell, React UI, and Windows installer workflow. Rewriting the UI or changing the shell would increase migration risk without helping the product.
- **Consequence:** Windows NSIS/MSI builds and installed-upgrade validation are the immediate release gate. Linux AppImage/DEB packaging and native-runtime validation are the secondary track. macOS and standalone browser/web deployments are not supported targets.

## D-01: Canonical imported relative paths

- **Status:** Accepted
- **Decision:** Store paths reconstructed from folder imports with `/` separators. Normalize both slash styles at the native picker boundary and reject parent traversal segments.
- **Reason:** Windows and Linux file pickers can report paths with different separators. A single internal representation avoids platform-dependent folder trees.

## D-02: Case-insensitive duplicate names

- **Status:** Accepted for new and moved items
- **Decision:** Compare sibling file and folder names using NFC normalization and locale-independent lowercase. Reject new imports, creations, renames, and moves that collide within the same workspace, project, and parent folder. Existing records are preserved; no startup migration or deletion is performed.
- **Reason:** Windows filesystems are commonly case-insensitive while common Linux filesystems are case-sensitive. A consistent rule prevents workspaces that cannot be represented on both supported targets.
- **User impact:** On Linux, users cannot create or import `notes.md` beside `Notes.md`. Existing collisions remain visible and are not silently modified; users must resolve them before moving/renaming into a colliding destination.

## D-03: Backup schema version

- **Status:** Accepted
- **Decision:** Keep the existing backup `version: 1` schema. Do not add or rename a version field without a versioned compatibility migration.
- **Reason:** Existing exported backups use this field. The current importer validates it, validates relationships and SHA-256 checksums, and writes records transactionally.

## D-04: Desktop shell

- **Status:** Accepted
- **Decision:** Tauri 2 with React, TypeScript, Vite, Rust native integration, and Dexie/IndexedDB for application data.
- **Reason:** This is the existing desktop architecture and is confirmed by `src-tauri/`, `package.json`, and the Tauri configuration. The embedded WebView is part of the desktop runtime, not a browser product target.

## D-05: Per-OS overrides

- **Status:** Accepted
- **Decision:** Keep behavior shared unless a native-runner test demonstrates a Windows/Linux-specific difference. Do not add speculative platform override modules.
