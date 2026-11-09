# SiliconVault Progress

Last updated: 2026-11-09

## Current milestone
**SV-001 — Folder and project storage foundation**

### Completed in the feature branch
- Added Dexie schema v2 with a folders table.
- Added folderId indexes to documents and assets.
- Added rootFolderId to projects.
- Added a migration that converts legacy collections into general-workspace folders.
- Added project root folders and backfilled existing document/asset folder references.
- Retained legacy collection records and IDs for compatibility.
- Added transactional createProject and validated createFolder helpers.
- Added idempotent initialization repair for missing folders.

### Not yet verified
- Migration against a populated browser database containing real PDFs.
- Runtime behavior in the user's local working copy.
- Production build and browser-level migration tests.

### Next actions
1. Test against a backup/copy of the current IndexedDB database.
2. Verify document counts, project counts, and PDF Blob sizes before and after migration.
3. Add explorer UI for folders and projects.
4. Only after the migration is verified, begin SV-002.

## Important safety note
Do not clear the browser's site data to troubleshoot a migration. That can permanently remove the local vault. Export or otherwise back up the existing data before testing schema changes.
