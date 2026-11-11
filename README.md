# Engineering Workspace

This project currently contains the first implementation milestone: local-first storage for files, folders, and projects. The project mirror started without an application codebase or existing IndexedDB database, so version 1 is a fresh schema; there are no legacy records to migrate yet.

## Storage

- Dexie/IndexedDB stores metadata separately from text or binary content. Metadata lists and indexes never need to load file bodies.
- Files use stable string IDs, timestamps, soft-delete timestamps, and project/folder references.
- Folder creation and moves enforce parent/project consistency. Folder moves update descendants and contained file metadata in one transaction and reject cycles.
- Project deletion marks its files deleted and archives the project for recovery.
- Backups serialize metadata and text/binary content into one JSON file, with SHA-256 checksums. Restore validates the format and checksums before an atomic replacement transaction.

## Commands

- `npm test` runs storage, hierarchy, and backup tests.
- `npm run typecheck` checks strict TypeScript types.

The next schema version must add an explicit named migration and a fixture for the previous version before changing the database schema.
