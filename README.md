# Engineering Workspace

This project contains a runnable desktop-first web workspace backed by local-first storage. The project mirror started without an application codebase or existing IndexedDB database, so version 1 is a fresh schema; there are no legacy records to migrate yet.

## Run the app

1. Run `npm install` once.
2. Run `npm run dev` and open the local address printed in the terminal.

Data is stored in this browser's IndexedDB. Use **Backup** from the lower-left sidebar to download a copy before clearing browser data or switching devices.

## Available now

- Projects and nested folders; drag files or folders to move them, and drop local files to import.
- File list sorting, title/content search for Markdown and code, recent files, and Trash with restore and confirmed permanent deletion.
- Multiple tabs, automatic local autosave, a Markdown editor and preview with math and Mermaid diagrams, and syntax-highlighted code editing.
- PDF page navigation, fit/zoom controls, and full-text search with page snippets.
- Single-file JSON backup and restore with SHA-256 verification.

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
