# SiliconVault Roadmap

SiliconVault is a local-first engineering workspace for organizing technical documents, source code, PDFs, and project work.

## Product principles
- **Local-first:** IndexedDB is the primary data store; no account or server is required for normal use.
- **Data preservation:** schema changes must migrate existing records and preserve imported file Blobs.
- **Workspace-oriented:** projects, folders, and files should be navigable from one persistent explorer.
- **Editor-native:** multiple PDFs, Markdown notes, and HDL/source files should open as tabs in one workspace.
- **Low-noise UI:** compact explorer, restrained dark palette, clear typography, subtle separators, and minimal dashboard-style cards.

## Milestones

### SV-001 — Folder and project storage foundation
- [x] Add a versioned Dexie schema for folders.
- [x] Preserve legacy collections and collection references during migration.
- [x] Create a root folder for each existing project.
- [x] Backfill document and asset folder references.
- [x] Add transactional helpers for creating folders and projects.
- [ ] Test migration against a copy of a populated IndexedDB database.
- [ ] Add UI for creating, renaming, moving, and deleting folders/projects.

### SV-002 — Explorer interface
- [ ] Replace collection navigation with an expandable file explorer.
- [ ] Support top-level folders and project roots.
- [ ] Support nested folders inside projects.
- [ ] Add context menus for new folder, rename, move, and delete.
- [ ] Show file-type icons for PDF, Markdown, Verilog, SystemVerilog, and other assets.
- [ ] Preserve the compact VS Code-inspired visual direction.

### SV-003A — Multiple local workspaces and Explorer modes
- [x] Add a versioned workspace store and migrate existing vault data into a default Personal workspace.
- [x] Add a workspace switcher and create-workspace action.
- [x] Scope projects, folders, documents, assets, and the PDF library to the active workspace.
- [x] Add descriptive and compact icon-only Explorer modes.
- [ ] Verify migration and switching against a copy of a populated IndexedDB vault.

### SV-003B — Unified workspace shell
- [x] Move PDF tabs into the common workspace tab strip.
- [x] Open Markdown, Verilog, and SystemVerilog documents beside PDFs.
- [x] Support shared tab selection, close, and minimize/restore behavior.
- [x] Keep editor components and PDF viewers mounted while switching tabs to preserve in-session state.
- [x] Persist open tab references, minimized state, and active tab per workspace across reloads.
- [ ] Persist unsaved editor drafts across reloads (separate recovery/autosave work).
- [ ] Verify PDF page/zoom and CodeMirror state retention in a browser session.
- [ ] Run production build and targeted interaction tests.

### SV-004 — PDF reader
- [x] Multiple PDF tabs and minimize/restore behavior (existing implementation).
- [x] PDF library picker (existing implementation).
- [ ] Text extraction and full-document search.
- [ ] Search result navigation and text highlighting.
- [ ] Fit width/page, rotate, fullscreen, and keyboard navigation.
- [ ] Bookmarks, annotations, and reading-position persistence.

### SV-005 — Engineering code studio
- [ ] Improve Verilog/SystemVerilog syntax support and language modes.
- [ ] Add multi-file code tabs and project-aware file organization.
- [ ] Add snippets and formatting options.
- [ ] Add terminal integration only after the workspace foundation is stable.
- [ ] Consider optional local Icarus Verilog integration; keep simulation execution opt-in.

### SV-006 — Engineering documentation
- [ ] Markdown preview and editor split view.
- [ ] KaTeX math and Mermaid diagrams.
- [ ] Reusable technical note templates.
- [ ] Links between notes, source files, projects, and PDFs.

### SV-007 — Global search
- [ ] Search filenames, titles, tags, and document content.
- [ ] Add project, folder, file-type, and date filters.
- [ ] Add PDF text indexing after extraction is implemented.

### SV-008 — Reliability and release quality
- [ ] Backup and restore documents, folders, projects, and binary assets.
- [ ] Validate imports and handle duplicate filenames.
- [ ] Add autosave/recovery and storage quota visibility.
- [ ] Add keyboard shortcuts and accessibility checks.
- [ ] Add migration, data-integrity, and component tests.
- [ ] Bring README and user documentation in line with the shipped application.

## Development rule
Implement one coherent milestone at a time. For each milestone: inspect current behavior, define acceptance criteria, identify affected files, implement the smallest safe change, run a production build and targeted tests, then update this roadmap and PROGRESS.md.
