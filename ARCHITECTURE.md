# SiliconVault Architecture

## Canonical hierarchy
```text
Workspace
├── Project
│   └── Folder
│       ├── Document
│       └── Asset (PDF or other file)
└── Folder
    ├── Document
    └── Asset
```

Workspaces are independent contexts such as School, Projects, and Personal. Projects are workspace-owned engineering efforts. Folders organize documents and assets. Every file belongs to one workspace and may optionally belong to one folder. Collections are not part of the product model.

## IndexedDB stores

| Store | Responsibility | Boundary |
|---|---|---|
| workspaces | Workspace metadata | Primary boundary |
| projects | Engineering project metadata and root-folder reference | workspaceId |
| folders | Hierarchical organization | workspaceId and optional projectId |
| documents | Markdown and source-code documents | workspaceId and optional folderId |
| assets | Imported files and binary Blobs | workspaceId and optional folderId |

## Dexie migrations
- v1: Initial collections, documents, assets, and projects.
- v2: Adds folders, legacy collection folders, and project roots.
- v3: Adds workspaces and assigns existing records to Personal.
- v4: Converts collection assignments into ordinary folders scoped to each file's workspace; removes collectionId and legacyCollectionId.
- v5: Deletes the now-empty collections object store.

The migration changes metadata only. Document content and asset Blob values are preserved. A legacy collection becomes a folder only in workspaces containing files assigned to it; no cross-workspace references are created.

## Integrity rules
- Every project, folder, document, and asset belongs to one workspace.
- A document or asset may reference only a folder in the same workspace.
- A project root folder shares its workspaceId and projectId.
- Nested folders remain inside the parent's workspace and project.
- Create projects and root folders in one IndexedDB transaction.
- Never clear browser site data to troubleshoot a migration; test against a copy and verify record counts and Blob sizes.

## Unified workspace
Markdown, Verilog, SystemVerilog, and PDF tabs share one editor shell. Tab references and active/minimized state are scoped by workspace; document bodies and PDF Blobs remain in IndexedDB.
