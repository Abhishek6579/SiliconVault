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

- **Status:** Open
- **Decision:** No duplicate-name policy is introduced by this change. Existing import behavior and database records must be characterized before enforcing case-insensitive uniqueness, especially for existing workspaces with colliding names.
- **Reason:** Rejecting imports or renames is a user-visible change and requires a migration/compatibility policy for existing data.

## D-03: macOS trackpad zoom

- **Status:** Open
- **Decision:** Decide whether pinch-generated wheel events should zoom the app only after testing on macOS hardware.

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
