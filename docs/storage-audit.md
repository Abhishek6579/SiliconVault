# Storage audit

This audit records the existing Dexie schema before adding storage features. The application database is named `engineering-workspace` and uses IndexedDB through Dexie. Application data is not stored in the installation directory. Browser IndexedDB is origin-scoped; a Tauri WebView uses a persistent application webview data directory, which should remain stable across updates. A concrete Windows data path must be confirmed on the first packaged build.

## Schema history

| Version | Stores and indexes | Migration |
| --- | --- | --- |
| 1 | `files`: `&id, kind, name, parentFolderId, projectId, createdAt, updatedAt, deletedAt`; `contents`: `&fileId`; `folders`: `&id, name, parentFolderId, projectId, createdAt, updatedAt`; `projects`: `&id, name, archived, createdAt, updatedAt` | `migrateToUnifiedMetadata` (initial schema; no predecessor) |
| 2 | Version 1 stores plus `preferences`: `&key, updatedAt` | `migrateToWorkspacePreferences` (adds preferences; preserves existing rows) |
| 3 | `files`: `&id, workspaceId, kind, name, parentFolderId, projectId, createdAt, updatedAt, deletedAt`; `contents`: `&fileId`; `folders`: `&id, workspaceId, name, parentFolderId, projectId, createdAt, updatedAt`; `projects`: `&id, workspaceId, name, archived, createdAt, updatedAt`; preferences unchanged; `workspaces`: `&id, name, createdAt, updatedAt` | `migrateToWorkspaces` (creates default workspace and assigns missing workspace IDs) |

## Record model and integrity

- File metadata and content are separate: `FileMeta.id` is the stable key for `FileContent.fileId`.
- Folders and projects have stable string IDs, workspace and parent references, and creation/update timestamps. Files have timestamps, kind, MIME type, size, parent/project/workspace references, and a nullable soft-delete timestamp.
- Preferences use a stable string key and update timestamp. Workspaces have stable string IDs and timestamps.
- Existing migrations preserve document IDs and content. The v1 and v2 schema classes are retained for fixture-based upgrade tests.
- Current tables do not define compound indexes for workspace/parent, project or deleted-state queries; those queries currently filter metadata in application code.
- `sources/` is read-only reference material. No source files were modified for this audit. The current repository schema contains no separate assets or collections stores; historical synced data should be reviewed before any future migration that assumes this is exhaustive.
- Normal workspace refresh now reads only metadata. Search reads text content by individual file key and keeps only result snippets in React state. PDFs are not yet indexed for content search.

## Verification still needed

- Exercise migration against representative real user backups before any future schema change.
- Confirm the persistent WebView data location and restart/update behavior from a packaged Windows build.
- Collect the seven startup, workspace, document and tab memory measurements listed in `AGENTS.md` using repeatable Windows measurements. No memory measurements are claimed by this audit.

## Confidentiality boundary

Dexie/IndexedDB provides local persistence, not encryption. Workspace records and exported JSON backups are not encrypted by the application. Access is governed by the operating-system account, browser/WebView profile and device protections. Users should enable full-disk encryption where appropriate and protect exported backups as plaintext sensitive data.
