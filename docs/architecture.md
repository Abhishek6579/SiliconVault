# Architecture

This describes the implementation visible in the repository, not the full roadmap.

## Runtime layers

| Layer | Technology | Responsibility |
| --- | --- | --- |
| UI | React 18, TypeScript | Workspace, tabs, editors, readers, dialogs |
| Build/dev | Vite 6 | Frontend development and production assets |
| Desktop shell | Tauri 2 | Native window and desktop integration |
| Native backend | Rust | Tauri entry point, native command and plugins |
| Persistence | Dexie 4 / IndexedDB | Workspace metadata, content, preferences |
| Code editor | CodeMirror | Editable source and text |
| PDF | pdfjs-dist | PDF rendering and text search |
| Markdown | React Markdown, KaTeX, Mermaid | Markdown, math, diagrams |

The frontend is not a client for a remote application server. The Tauri entry point registers a system-monitor command plus dialog and filesystem plugins.

## Important source paths

- `src/App.tsx`: workspace composition and application interactions.
- `src/styles.css`: application styling.
- `src/storage/`: Dexie schema, migrations, metadata/content operations, file classification.
- `src/PdfReader.tsx`: PDF reader.
- `src/viewers/ReadOnlyFileViewer.tsx`: image, table, VCD, and source previews.
- `src-tauri/src/main.rs`: Tauri entry point.
- `src-tauri/tauri.conf.json`: app identity, Vite integration, CSP, window, bundle.
- `src-tauri/capabilities/default.json`: main-window permissions.
- `tests/`: Vitest tests.

## Persistence

Database name: `engineering-workspace`. Dexie tables separate file metadata (`files`) from file bodies/blobs (`contents`, keyed by file ID); related tables include `folders`, `projects`, `workspaces`, and `preferences`. Stable string IDs and soft-delete timestamps are used. Backup/restore includes SHA-256 integrity verification.

Schema versions 1–3 and named migrations are recorded in [storage-audit.md](storage-audit.md). Read it before changing database behavior.

## PDF tab lifecycle

- The PDF reader is mounted for the active PDF tab. Inactive tabs retain their metadata and view state, but the application releases their Blob-backed document data; activating an inactive PDF tab reloads its content from Dexie.
- Page, zoom, and fit mode are persisted in the `preferences` table under `pdf:<file-id>` whenever the reader reports a state change, and are restored when that file is opened again.
- Unmounting the reader or replacing its source cancels outstanding render tasks and releases the active PDF.js loading task (or, if loading has completed, the loaded document). This cleanup is centralized in `src/pdf/lifecycle.ts` and covered by `tests/storage-reliability.test.ts`.
- Keep PDF rendering, pagination, zoom, and lifecycle changes isolated from workspace/storage refactors. Revalidate the Windows desktop build and reader behavior before changing this contract.

IndexedDB is scoped to a browser/WebView profile. Browser development data must not be assumed to be the same as packaged desktop data. The exact packaged Windows data path and update persistence require validation on an installed build.

## File format support

| Format | Current behavior |
| --- | --- |
| PDF | Dedicated pdf.js reader |
| Markdown | Editor and preview; math and Mermaid |
| Verilog/SystemVerilog (.v/.sv/.vh/.svh) | Editable CodeMirror editor with Verilog mode |
| Other classified code extensions | Code editor; syntax mode depends on configured language support |
| TXT, LOG, INI, CONF, ENV, JSON, XML, YAML, TOML | Text editing |
| PNG, JPG/JPEG, WEBP, SVG | Image preview |
| CSV, TSV | Read-only table preview, maximum 200 rows and 30 columns |
| VCD | Read-only declarations and basic activity inspection; no waveform traces |
| SPICE (.sp/.cir/.lib), KiCad schematic (.kicad_sch) | Read-only source-text preview |
| DOC/DOCX/PPTX/XLSX, FST, GDS/GDSII, KiCad PCB (.kicad_pcb) | Recognized, no dedicated renderer |
| Other extensions | Generic unsupported/other-file handling |

The Blob-backed text preview has a 24 MiB read guard. This is not an import-size limit. Extension classification alone does not establish usable rendering support.

## Security boundaries

Tauri capabilities currently grant core defaults, dialog open/save, and selected filesystem read/write operations. CSP is configured in `tauri.conf.json`. Keep permissions least-privilege; do not add remote script execution, arbitrary shell commands, unrestricted filesystem access, or cloud upload. Treat imported document contents as untrusted data.

## Known gaps

- No dedicated Office, FST, GDS/GDSII, or KiCad PCB renderer.
- No interactive VCD waveform viewer.
- No verified packaged Windows data-path or memory baseline documented.
- Windows NSIS packaging is configured, but install/upgrade/uninstall persistence needs Windows validation.
- No application license has been granted in the repository.
