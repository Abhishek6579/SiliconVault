# SiliconVault — Phase 1

A local-first engineering knowledge workspace. Phase 1 delivers the visual shell, responsive navigation, dashboard, collections, recent-file list/grid, project cards, and working UI interactions with seeded demo data.

## Requirements
- Node.js 20.19+ or 22.12+
- npm

## Setup
```bash
npm install
npm run dev
```
Open the local URL printed by Vite (normally http://localhost:5173).

## Build
```bash
npm run build
npm run preview
```

## Architecture decisions
- React + Vite + JavaScript: consistent with the existing frontend experience.
- Local-first: no Supabase, cloud account, or remote database.
- Phase 1 uses seeded in-memory data. It does **not** yet persist user-created files.
- Planned persistence: IndexedDB (Dexie) for metadata and editor content; File System Access API as an optional user-authorized folder integration; local filesystem bridge via Tauri if unrestricted native file access is required.
- Monaco Editor for advanced multi-file editing; Markdown editor/preview; PDF.js for PDF rendering.
- Keep file metadata separate from file bytes. Use IndexedDB for app-managed local files and a filesystem adapter for an explicitly selected vault folder.
- Never execute arbitrary uploaded code in the UI. A future simulator integration should run in a restricted local process.

## Planned phases
1. UI shell and dashboard (included)
2. Local persistence, vault creation, import/export, autosave
3. Markdown editor, preview, math and diagrams
4. Monaco code workspace, tabs, file tree, Verilog/SystemVerilog highlighting
5. PDF viewer and document library
6. Project linking, tags, global search, backups and polish

## Notes
The dashboard currently contains clearly illustrative sample counts and sample documents. Replace them with real IndexedDB records in Phase 2.
