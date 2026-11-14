# Storage audit

This audit records the existing Dexie schema before adding storage features. The application database is named `engineering-workspace` and uses IndexedDB through Dexie. Application data is not stored in the installation directory. IndexedDB is scoped to the Tauri application's persistent embedded-WebView data directory, which should remain stable across updates. A concrete Windows data path must be confirmed on the first packaged build.

## Schema history

| Version | Stores and indexes | Migration |
| --- | --- | --- |
| 1 | `files`: `&id, kind, name, parentFolderId, projectId, createdAt, updatedAt, deletedAt`; `contents`: `&fileId`; `folders`: `&id, name, parentFolderId, projectId, createdAt, updatedAt`; `projects`: `&id, name, archived, createdAt, updatedAt` | `migrateToUnifiedMetadata` (initial schema; no predecessor) |
| 2 | Version 1 stores plus `preferences`: `&key, updatedAt` | `migrateToWorkspacePreferences` (adds preferences; preserves existing rows) |
| 3 | `files`: `&id, workspaceId, kind, name, parentFolderId, projectId, createdAt, updatedAt, deletedAt`; `contents`: `&fileId`; `folders`: `&id, workspaceId, name, parentFolderId, projectId, createdAt, updatedAt`; `projects`: `&id, workspaceId, name, archived, createdAt, updatedAt`; preferences unchanged; `workspaces`: `&id, name, createdAt, updatedAt` | `migrateToWorkspaces` (creates default workspace and assigns missing workspace IDs) |
| 4 | Version 3 stores plus `[workspaceId+deletedAt]` and `[projectId+deletedAt]` compound indexes on `files` | Adds targeted indexes for workspace Trash and project archive restoration; no record rewrite |

## Record model and integrity

- File metadata and content are separate: `FileMeta.id` is the stable key for `FileContent.fileId`.
- Folders and projects have stable string IDs, workspace and parent references, and creation/update timestamps. Files have timestamps, kind, MIME type, size, parent/project/workspace references, and a nullable soft-delete timestamp.
- Preferences use a stable string key and update timestamp. Workspaces have stable string IDs and timestamps.
- Existing migrations preserve document IDs and content. The v1 and v2 schema classes are retained for fixture-based upgrade tests.
- Version 4 defines compound `[workspaceId+deletedAt]` and `[projectId+deletedAt]` indexes on `files`; these support workspace Trash and project-archive restore queries. Other hierarchy operations still build or filter metadata indexes in application code.
- `sources/` is read-only reference material. No source files were modified for this audit. The current repository schema contains no separate assets or collections stores; historical synced data should be reviewed before any future migration that assumes this is exhaustive.
- Normal workspace refresh now reads only metadata. Search reads text content by individual file key and keeps only result snippets in React state. PDFs are not yet indexed for content search.

## Verification still needed

- Exercise migration against representative real user backups before any future schema change.
- Confirm the persistent WebView data location and restart/update behavior from a packaged Windows build.
- Collect the seven startup, workspace, document and tab memory measurements listed in `AGENTS.md` using repeatable Windows measurements. No memory measurements are claimed by this audit.

## Backup and migration fault-injection coverage

The automated regression suite exercises the following failure boundaries:

- A v2-to-current IndexedDB upgrade is interrupted after an earlier store has been modified. The upgrade must abort, and reopening through the v2 schema must expose the original metadata, preferences, and content.
- Backup preparation rejects a file metadata record whose content record is missing. Restore rejects checksum mismatches, oversized records, dangling project/folder references, cross-workspace folder hierarchies, and folders assigned to projects in another workspace before replacing live data.
- File import is interrupted between metadata and content writes; the transaction must leave neither an orphan metadata record nor a partial content record. Duplicate-name import attempts must preserve the existing file body.
- Restore is interrupted after content writes begin and is also forced to fail with a quota error. Both failures must leave all live stores unchanged. Repeated restoration of one valid backup must produce identical store contents.
- The editor recovery draft is read after closing and reopening a database instance. The committed body remains unchanged while the recovery draft is restored as dirty editor state.
- Native dialog adapter tests verify picker options, cancellation behavior, the size check before native file reads, and propagation of filesystem write errors. These tests mock Tauri APIs; they do not replace manual checks against packaged Windows and Linux applications.

## Remaining manual release gates

- Migrate a representative installed Windows profile with the packaged upgrade and verify the existing WebView profile, metadata, preferences, and file contents are retained.
- Exercise actual native open/save dialogs on packaged Windows and Linux builds, including a destination with insufficient free disk space.
- Test process termination during restore and unsaved-draft recovery on an installed build. Automated transaction fault injection and database reopen tests do not substitute for killing the real application process.

The v1 restore parser still reads the bounded backup file as text and parses it with `JSON.parse()` in a Worker. Streaming v2 parsing with staged records remains future hardening and is not claimed as implemented.
 
## Confidentiality boundary

Dexie/IndexedDB provides local persistence, not encryption. Workspace records and exported JSON backups are not encrypted by the application. Access is governed by the operating-system account, application WebView profile, and device protections. Users should enable full-disk encryption where appropriate and protect exported backups as plaintext sensitive data.

## Filesystem capability review

The main-window capability retains file read, directory read and file write operations because the current product imports user-selected files, recursively imports a user-selected directory, and writes a backup to a user-selected destination. The unused text-specific read/write permissions were removed; the application uses byte-oriented operations. No recursive home-directory or whole-disk filesystem scope was added. Keep filesystem access behind the native file/directory/save dialogs, and re-audit this capability whenever a new filesystem operation is introduced.

## Reliability and scalability changes

- Backup export preflights the shared record-count, per-file, aggregate-content, and serialized JSON size limits, and checks that stored content byte length matches file metadata before showing the native save dialog. Restore enforces the same size limits and validates record shape, field types, duplicate identifiers, SHA-256 integrity and workspace/folder/project references before the replacement transaction begins. Pre-workspace version-1 backups remain importable and are assigned to the default workspace.
- Backup export reads one content record at a time instead of materializing the entire contents table. Native desktop saves and the pre-migration safety backup use the same incremental serializer. Restore validates one file payload at a time before the replacement transaction and decodes content again in bounded batches, rather than retaining all decoded files in memory.
- Project archival records its archive timestamp and only soft-deletes files that were live. Restoring a project revives files deleted by that archive operation while preserving files that were already in Trash. Legacy archived projects without an archive timestamp use a best-effort compatibility path that restores their deleted project files.
- Workspace tree construction builds folder/file buckets once per render and traverses those indexes rather than filtering the complete metadata arrays at every recursive node.
- Desktop folder import walks the selected directory incrementally and imports each file before reading the next. Folder import processes each file from the native picker selection sequentially.
- Desktop multi-file import reads and persists one selected file before reading the next, avoiding the previous `Promise.all` allocation of every selected file at once.
- Text/code/Markdown edits write a short-lived recovery shadow to IndexedDB preferences; opening a file restores that shadow as a dirty draft, and a successful content save removes it. The normal one-second autosave remains in place.
- Folder subtree discovery now builds a parent-to-children index and traverses it in O(V + E), with cycle protection.
- UI preference values previously stored under legacy localStorage keys are migrated to Dexie before the legacy keys are removed.
- PDF render-task cancellation and PDF.js document destruction are centralized and covered by lifecycle tests.

## Import and restore size limits

- File imports are capped at 64 MiB per non-PDF file; PDF imports and PDF.js loading are capped at 100 MiB. The limits are enforced before persistence and before PDF.js requests a full `arrayBuffer()`.
- Backup restore rejects JSON files larger than 160 MiB before calling `File.text()` or allocating a desktop `Uint8Array`. Desktop file and folder pickers inspect file metadata before reading selected bytes.
- Backup records are limited to 100,000 in aggregate, each restored file is limited to 100 MiB, and aggregate decoded file content is limited to 100 MiB. These limits are checked against metadata before base64 decoding and before the replacement transaction.
- Restore still uses the existing JSON parser after the file-size preflight. A streaming JSON parser is intentionally deferred: the hard file/content bounds make current parsing bounded, while streaming parsing requires a separate parser and compatibility test effort.
