# SiliconVault Architecture

## Current application
- **Frontend:** React + Vite.
- **Persistence:** Dexie over browser IndexedDB.
- **Document editing:** CodeMirror-based editor.
- **PDF rendering:** PDF.js.
- **UI icons:** lucide-react.
- **Deployment model:** browser application; user data remains in the local browser profile.

## Storage model

### Existing tables
| Table | Purpose |
|---|---|
| collections | Legacy top-level subject groups retained for compatibility |
| documents | Markdown and code documents |
| assets | Imported binary files, including PDF Blobs |
| projects | Engineering project metadata |

### Folder/project foundation (schema v2)
| Table | Purpose |
|---|---|
| folders | Hierarchical folders; parentFolderId links nested folders |
| documents | Adds folderId while retaining legacy collectionId |
| assets | Adds folderId while retaining legacy collectionId |
| projects | Adds rootFolderId pointing to the project's root folder |

Folder fields:
- id: auto-increment primary key.
- name: visible folder name.
- parentFolderId: parent folder ID, or null for a root.
- projectId: owning project ID, or null for the general workspace.
- legacyCollectionId: links migrated subject folders to their original collection.
- createdAt and updatedAt: ISO timestamps.

A project's root folder has projectId set to the project ID and parentFolderId set to null. Nested project folders inherit the same projectId. General workspace folders use projectId: null.

## Migration and compatibility
Dexie schema v2 adds the folder table and new indexes without deleting the v1 tables or fields.

During upgrade:
1. Every existing collection becomes a top-level general-workspace folder.
2. Every existing project receives a dedicated root folder.
3. Existing documents and assets receive a folderId corresponding to their former collection.
4. Original collection rows and collectionId values remain intact during the transition.
5. Asset Blob values are not read, transformed, or rewritten by the migration.

On initialization, missing collection folders and project root folders are repaired idempotently. This also handles fresh installs, where starter records are seeded after the schema upgrade.

## Data integrity rules
- Do not delete legacy collection data as part of the folder migration.
- Do not replace an imported asset record merely to move it between folders; update its metadata only.
- A folder's parent and project must belong to the same workspace/project boundary.
- Create a project and its root folder in one IndexedDB transaction.
- Before introducing a destructive migration, test it against a copy of a populated database and verify document counts and PDF Blob sizes.

## Current limitations
- The visible UI still uses the older collection-oriented navigation.
- Folder creation helpers exist, but explorer CRUD and move operations are not yet exposed in the UI.
- Documents/assets still carry legacy collectionId fields for compatibility.
- Unified tabs for PDFs, Markdown, and code are not yet implemented.
- Backup currently needs a binary-safe format to include PDF and other asset Blobs.
