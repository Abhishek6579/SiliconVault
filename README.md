# Engineering Workspace

This project contains a runnable desktop-first web workspace backed by local-first storage. Version 3 adds separate workspaces while preserving saved theme and PDF reading position preferences. Existing databases are backed up to a downloadable file before the upgrade proceeds.

## Run the app

1. Run `npm install` once.
2. Run `npm run dev` and open the local address printed in the terminal.

Data is stored in this browser's IndexedDB. Use **Backup** from the lower-left sidebar to download a copy before clearing browser data or switching devices.

## Available now

- Multiple isolated workspaces, each with its own projects, folders, and files. Create and switch workspaces from the top bar.
- Projects and nested folders; folders appear alongside files, and drag files or folders to move them. Drop local files to import.
- In-app dialogs for creating and renaming projects, folders, files, and workspaces, with confirmation dialogs for destructive actions.
- Rename or delete a workspace from its switcher menu. Deleting a workspace removes its files, projects, folders, and saved PDF positions; an empty workspace is created if you delete the last one.
- Import a local folder from the workspace toolbar or a project/folder action menu. Its directory tree and files are recreated in the selected destination.
- A persisted light/dark neutral theme toggle.
- File and folder action popups for open, rename, move, import, and delete operations.
- File list sorting, title/content search for Markdown and code, recent files, and Trash with restore and confirmed permanent deletion.
- Multiple tabs, automatic local autosave, a Markdown editor and preview with math and Mermaid diagrams, and syntax-highlighted code editing.
- Continuous PDF scrolling inside the reader pane, page navigation, fit/zoom controls, and full-text search with page snippets. The reader restores the last page and zoom, and renders only nearby page canvases to reduce memory use. Focus view expands the reader while keeping the sidebar and open-file tabs available.
- Single-file JSON backup and restore with SHA-256 verification.

## Storage

- Dexie/IndexedDB stores metadata separately from text or binary content. Metadata lists and indexes never need to load file bodies.
- Files use stable string IDs, timestamps, soft-delete timestamps, and project/folder references.
- Folder creation and moves enforce parent/project consistency. Folder moves update descendants and contained file metadata in one transaction and reject cycles.
- Project deletion marks its files deleted and archives the project for recovery.
- Dexie stores the theme and per-PDF reading positions with other local workspace state.
- Backups serialize metadata and text/binary content into one JSON file, with SHA-256 checksums. Restore validates the format and checksums before an atomic replacement transaction.

## Commands

- `npm test` runs storage, hierarchy, and backup tests.
- `npm run typecheck` checks strict TypeScript types.

Future schema versions must add a named migration and a previous-version fixture. Existing workspaces get a downloadable full backup before any version upgrade runs.
