# SiliconVault Progress

Last updated: 2026-11-09

## Current milestone
**SV-003A — Multiple local workspaces and Explorer modes**

### Implemented in this feature branch
- Added Dexie schema v3 with a workspaces table and workspace indexes on folders, projects, documents, and assets.
- Migrates existing records into a default Personal workspace without deleting documents, folders, projects, collections, or imported PDF blobs.
- Added a local workspace switcher and create-workspace action (examples: School, Projects, Personal).
- Scopes the Explorer, document views, project list, asset library, and PDF library to the selected workspace.
- Clears the active editor/PDF session and folder selection when switching workspaces; stored records remain intact.
- Added descriptive and compact icon-only Explorer modes with a header toggle.
- Added workspace-boundary validation when nesting folders.

### Not yet verified
- Production build and browser-level interaction tests.
- Schema v3 migration against a copy of a populated IndexedDB database.
- Workspace switching with pre-existing documents, nested folders, projects, and PDF blobs.
- Confirm that no old records disappear from the Personal workspace after migration.

### Next milestone
**SV-003B — Unified workspace shell**
- One tab strip for PDF, Markdown, Verilog, and SystemVerilog files.
- Preserve each editor's unsaved draft and PDF page/zoom state when switching tabs.
- Close, minimize, and restore tabs without losing per-tab state.
- Persist open tabs and active tab across reloads.

## Important data-safety note
Do not clear browser site data to troubleshoot a migration. That can permanently remove the local vault. Export or otherwise back up the existing data before testing.
