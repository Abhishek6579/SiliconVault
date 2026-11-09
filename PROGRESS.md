# SiliconVault Progress

Last updated: 2026-11-09

## Current milestone
**SV-003C — Workspace-scoped folders and collection retirement**

### Implemented in this branch
- Added staged Dexie v4/v5 migration to convert legacy collections into ordinary folders and retire the global store.
- Removed collectionId and legacyCollectionId from the active schema.
- Preserved document content, project metadata, and imported asset Blob values.
- Removed collection dashboard cards, filters, editor selector, and collection-based assignments.
- Replaced the editor selector with a workspace folder selector.
- Retained the unified Markdown/HDL/PDF workspace from SV-003B.

### Verification required before merge
- Run npm ci and npm run build.
- Test v1→v5 migration against a copy of a populated IndexedDB vault.
- Compare document/asset counts and PDF Blob sizes before and after migration.
- Verify all folder references remain within the owning workspace.
- Switch workspaces and confirm files/folders remain isolated.

The migration does not clear IndexedDB or rewrite asset Blobs. Do not clear browser site data to troubleshoot.
