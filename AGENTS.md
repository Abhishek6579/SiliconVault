# AGENTS.md

Guidance for AI coding agents working on SiliconVault. Read this document fully before modifying code.

# 1. Product Purpose

SiliconVault is a **standalone, local-first desktop engineering workspace** for organizing and working with:

- PDFs, datasheets, textbooks and course notes.
- Markdown engineering notes with mathematical expressions and diagrams.
- Verilog and SystemVerilog source files.
- Projects, folders and related engineering documents.

The application is designed primarily for desktop computers.

It must work without an internet connection after installation. User data must remain on the local machine.

The primary development and distribution target is **Windows 10/11**. Linux and macOS compatibility may be maintained where practical, but Windows takes priority.

The application must not depend on a browser being installed or manually opened by the user. It must launch as a normal desktop application.

# 2. Technology Architecture

## 2.1 Desktop framework

Use:

- Tauri 2 for the desktop application shell.
- React for the user interface.
- TypeScript with strict mode.
- Vite for frontend development and builds.
- Rust only for desktop integration and functionality that genuinely requires native system access.

Use the existing frontend wherever possible.

Do not rewrite the application simply to introduce Tauri.

The first objective is to package the existing React application as a working desktop application, then incrementally improve its architecture.

## 2.2 Storage

**Dexie (IndexedDB) remains the primary and only application database.**

Non-negotiable:

- Do not introduce SQLite, localStorage, a JSON database or another persistence layer.
- Do not store file content in React state unnecessarily.
- Do not duplicate the database in Rust.
- Do not move application data into arbitrary filesystem directories.

Use Tauri's filesystem and dialog APIs for explicitly requested file operations, such as selecting files to import and selecting a destination for backups.

Application metadata and document contents must remain in Dexie.

## 2.3 Open-source requirement

Use open-source libraries only.

Preferred libraries include:

- Dexie
- pdf.js
- CodeMirror
- KaTeX
- Mermaid
- Tauri

No paid SDKs or mandatory cloud services.

# 3. Non-Negotiable Rules

1. Never lose user data.
2. Every database schema change requires a migration.
3. Every destructive operation requires confirmation.
4. Never hardcode categories, folder names or project names.
5. Never introduce a second persistence layer.
6. Never silently discard unsaved changes.
7. Never silently ignore database errors.
8. Never introduce cloud dependencies.
9. Do not add features outside Section 6.
10. Measure memory consumption before claiming an optimization is successful.
11. Do not replace working code without understanding its current behavior.
12. Verify changes with tests before claiming completion.

# 4. Desktop-First Requirements

## 4.1 Standalone application

The production deliverable must be a desktop application.

Requirements:

- Launch from a normal Windows application shortcut.
- Provide a proper application icon and name.
- Use native window controls and application lifecycle behavior.
- Support normal minimize, maximize and close operations.
- Provide native file-open and save dialogs.
- Support importing files through the native file picker.
- Support drag-and-drop from Windows Explorer.
- Provide a distributable Windows installer.
- Preserve user data across application updates.
- Never delete user data when uninstalling the application.
- Work offline without requiring an account or remote service.

A browser-based development mode may remain available for debugging, but it is not the primary product.

## 4.2 Tauri security

- Use Tauri 2 capabilities and permissions.
- Grant only the filesystem and system permissions actually required.
- Do not expose unrestricted filesystem access to frontend code.
- Validate all paths and operations crossing the Rust/frontend boundary.
- Never execute arbitrary shell commands from user-controlled input.
- Do not load remote websites into the application window.
- Keep the Content Security Policy restrictive.
- Do not expose unnecessary native commands.

## 4.3 Desktop persistence

The application must preserve its database when:

- The application closes normally.
- The application crashes.
- Windows restarts.
- The application updates.
- The user installs a newer application version.

Use a stable application data location and document it.

Database migrations must not depend on the current installation directory.

# 5. Memory and Resource Management

Memory efficiency is a core architectural requirement.

Do not assume that using Tauri automatically makes the application memory-efficient.

The frontend must be designed to avoid unnecessary retention of large documents.

## 5.1 Content loading

Metadata queries must never load file contents.

Never perform an unrestricted query equivalent to:

`db.contents.toArray()`

during normal workspace refresh.

Instead:

- Fetch file metadata independently.
- Fetch content only when a file is opened.
- Release unnecessary document references when tabs close.
- Avoid retaining multiple copies of the same Blob or text content.
- Avoid duplicating large file contents in React state.
- Avoid repeatedly converting large files into base64 strings.
- Avoid loading every PDF page into memory simultaneously.

## 5.2 PDF memory management

- Render only the visible PDF pages and a small surrounding range.
- Cancel obsolete PDF rendering tasks.
- Release unused rendering resources.
- Avoid keeping multiple full-resolution canvas copies.
- Release PDF document resources when appropriate.

## 5.3 Editor memory management

- Do not mount editors for every open file simultaneously.
- Preserve editor state without retaining unnecessary editor instances.
- Avoid excessive React rerenders.
- Avoid repeated database reads caused by component lifecycle changes.

## 5.4 Measurement

Establish memory baselines for:

1. Application startup with an empty workspace.
2. Workspace containing 100 files.
3. Opening a large PDF.
4. Opening several Markdown notes.
5. Opening several code files.
6. Switching between multiple tabs.
7. Closing files after editing.

Record memory usage and identify the source of significant growth.

Do not introduce arbitrary performance optimizations without measurement.

# 6. Features In Scope

The following features define the product.

Do not expand beyond this list without explicit authorization.

## 6.1 Folders and Projects

- Create, rename, move and delete nested folders.
- Create, rename, archive and delete projects.
- Create folders at workspace root or inside projects.
- Move files and folders between folders and projects.
- Moving a folder moves its entire subtree atomically.
- Deletion requires confirmation and displays the affected item count.

## 6.2 File Explorer

- Expandable and collapsible folder tree.
- File-type icons for PDF, Markdown and code.
- Context menu: rename, move, delete and open.
- Multi-select with Ctrl/Cmd and Shift.
- Drag-and-drop file and folder movement.
- Sort by name, type, size and modification date.
- Recent files.
- Pinned folders.
- Empty states for workspace, folder and project.

## 6.3 Multi-File Workspace

- One shared tab bar for PDFs, Markdown and code.
- Open multiple files simultaneously.
- Close and reorder tabs.
- Restore previous tabs and active tab after restart.
- Preserve unsaved changes across tab closure and application restart.
- Display dirty indicators.
- Remember each tab's editor state.
- Remember PDF page and zoom.
- Two-pane split view, horizontal or vertical.
- No nested splits beyond two levels.

## 6.4 PDF Reader

Built using pdf.js.

- Fit-to-width and fit-to-page.
- Page navigation and jump-to-page.
- Full-text search.
- Page numbers for search results.
- Next and previous search matches.
- Search-match highlighting.
- Text selection and copying.
- Page bookmarks.
- Highlight annotations.
- Text-note annotations.
- Remember last page and zoom per file.

## 6.5 Markdown and Engineering Notes

- Markdown editor with live preview.
- Preview split or toggle.
- KaTeX inline and block mathematics.
- Mermaid diagrams in fenced code blocks.
- Technical note template.
- Lab report template.
- Architecture/design decision record template.
- Link notes to code files or PDF pages.
- Store links as metadata so renames do not break them.
- Backlinks panel.

## 6.6 Code Files

- CodeMirror editor.
- Verilog syntax highlighting.
- SystemVerilog syntax highlighting.
- Editing and saving.
- Debounced autosave.
- Visible save status.

## 6.7 Search

Search:

- File names.
- Markdown content.
- Source code.
- Extracted PDF text.

Requirements:

- Project filters.
- Folder filters.
- File-type filters.
- File name and location in results.
- Relevant content snippets.
- Open results at the matching location where supported.

Search must not require loading all document content into React state.

## 6.8 Reliability

- Autosave with visible save status.
- Backup and restore.
- Single-project package export/import.
- Database error handling and recovery options.
- Storage usage per project.
- Recovery of unsaved edits.
- Safe application shutdown.
- Persistent data across application upgrades.

# 7. Storage Architecture

Storage architecture must be completed before adding new features.

## 7.1 Audit

Inventory:

- Every existing Dexie table.
- Every index.
- Every database version.
- Every existing migration.
- Existing documents, assets, projects and collections.
- Records missing IDs, timestamps or parent references.

Do not assume the existing database is empty.

Do not replace the existing schema without understanding its migration history.

## 7.2 Unified metadata model

Every stored file must have a unified metadata record.

```ts
interface FileMeta {
  id: string;
  kind: 'pdf' | 'markdown' | 'code' | 'other';
  name: string;
  parentFolderId: string | null;
  projectId: string | null;
  size: number;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface Project {
  id: string;
  name: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}
```

Existing workspace-specific fields may remain where required by the current application architecture.

Content must live in a separate Dexie table keyed by `FileMeta.id`.

Metadata queries must never load file contents.

IDs must remain stable and must never be reused.

## 7.3 Hierarchy rules

- Folders can nest arbitrarily.
- Every folder belongs to one project or the workspace root.
- A folder's project must match its parent's project.
- Moving a folder updates its entire subtree atomically.
- Moving a folder into itself or its descendants is rejected.
- Project mismatch is rejected.
- Project deletion soft-deletes its contents.
- Permanent deletion happens only after confirmed empty-trash action.

## 7.4 Migration requirements

Every Dexie version bump must have:

- A named migration function.
- A fixture representing the previous version.
- A migration test.
- A data-integrity test.

Existing collection records must map to folders.

Existing document and asset IDs must be preserved.

Before migration:

1. Export a complete backup.
2. Validate that the backup was created successfully.
3. Save the backup through a native desktop save dialog.
4. Only then proceed with the migration.

If migration fails:

- Abort the migration transaction.
- Preserve the previous database wherever possible.
- Offer restoration from the verified backup.
- Display a clear error.
- Never leave a partially migrated database.

## 7.5 Backup and Restore

Backup format:

- One manifest containing metadata and schema version.
- All associated content blobs.
- Checksums for content integrity.
- One downloadable/exportable package.

Restore must:

- Validate manifest version.
- Validate checksums.
- Validate record relationships.
- Reject malformed data.
- Avoid partial database replacement.
- Perform the write transaction atomically wherever possible.

Round-trip testing is mandatory:

Export → Clear database → Import → Deep compare every record.

# 8. Testing Requirements

No feature is complete without relevant tests.

Mandatory tests:

## 8.1 Database

- Fresh database initialization.
- Migration fixture for every previous Dexie version.
- No data loss during migration.
- Backup round-trip.
- Invalid checksum rejection.
- Invalid manifest rejection.
- Transaction rollback.

## 8.2 Hierarchy

- Nested folder creation.
- Moving folders.
- Moving entire subtrees.
- Moving into own subtree is rejected.
- Project mismatch is rejected.
- Project soft deletion.
- Permanent deletion requires confirmation.

## 8.3 Autosave

- Normal autosave.
- Reload during editing.
- Close application during editing.
- Reopen application and recover unsaved content.
- Dirty indicator behavior.

## 8.4 PDF

- Known fixture PDF.
- Known search match count.
- Correct match page numbers.
- Search navigation.
- Bookmark persistence.
- Annotation persistence.

## 8.5 Desktop

- Tauri development build.
- Production Windows build.
- Installer generation.
- Application launches without a browser.
- Application launches without internet access.
- Database survives application restart.
- Database survives application update.
- Backup and restore through native file dialogs.
- File import through Windows Explorer.
- Drag-and-drop behavior.
- No accidental data deletion on application uninstall.

## 8.6 Resource usage

- Measure startup memory.
- Measure large PDF memory.
- Measure multi-tab memory.
- Check memory release after closing documents.
- Investigate memory growth rather than hiding it with arbitrary limits.

# 9. Out of Scope

Do not implement:

- Cloud synchronization.
- Accounts or authentication.
- Online collaboration.
- Sharing.
- PDF rotation, merging or splitting.
- Fullscreen reading mode.
- Keyboard shortcut customization.
- Mobile applications.
- Responsive mobile layouts.
- Reference management.
- Citation export.
- General-purpose tag systems.
- AI features.
- Online document processing.
- Features not explicitly listed in Section 6.

# 10. Development Strategy

Follow this order.

## Phase 1: Desktop foundation

- Audit the current repository.
- Verify the current frontend build.
- Introduce Tauri 2 without rewriting React.
- Configure Windows development prerequisites.
- Configure application identity and icon.
- Verify native file dialogs.
- Verify persistent Dexie storage.
- Generate a working Windows desktop build.

## Phase 2: Storage correctness

- Separate metadata loading from content loading.
- Fix memory-heavy refresh operations.
- Implement durable draft persistence.
- Complete migration recovery.
- Strengthen backup validation.
- Complete round-trip tests.

## Phase 3: Workspace functionality

- Multi-select.
- Pinned folders.
- Persistent tabs.
- Session restoration.
- Tab reordering.
- Two-pane split view.

## Phase 4: Document functionality

- Complete PDF reader.
- Add bookmarks and annotations.
- Add engineering-note templates.
- Add metadata-based links and backlinks.
- Complete Verilog and SystemVerilog editing.

## Phase 5: Search and reliability

- PDF text indexing.
- Search filters.
- Search navigation.
- Project package import/export.
- Storage usage reporting.
- Full regression tests.

## Phase 6: Distribution

- Windows installer.
- Application icon and metadata.
- Versioning.
- Upgrade safety.
- Backup/recovery verification.
- Final memory measurements.

Do not skip earlier phases to implement later features.

# 11. Coding Conventions

- TypeScript strict mode.
- Small, feature-oriented components.
- One feature per directory where practical.
- Keep storage logic separate from UI components.
- Keep desktop integration separate from application logic.
- Use typed interfaces for frontend/backend communication.
- Avoid unnecessary global state.
- Avoid retaining large blobs in React state.
- Avoid unnecessary dependencies.
- Prefer maintained open-source libraries.
- Document non-obvious storage and migration behavior.

# 12. Definition of Done

A change is complete only when:

1. It is explicitly in scope.
2. It follows the desktop-first architecture.
3. It does not introduce another persistence layer.
4. It does not compromise existing user data.
5. Required tests pass.
6. Existing migrations remain valid.
7. Backup and restore remain functional.
8. No destructive operation lacks confirmation.
9. The production desktop build succeeds when applicable.
10. Memory behavior has been measured for changes that affect document loading or resource usage.

**Never claim completion based solely on code being written. Verify the behavior.**