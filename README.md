# SiliconVault

SiliconVault is a desktop-first, local-first engineering workspace built with React, TypeScript, Tauri 2, and Dexie/IndexedDB.

> **Status:** early development. The source version is `0.1.0`; this is not a claim that a public release exists.

## Implemented functionality

- Multiple workspaces, projects, nested folders, and file organization.
- Local file import, rename/move/delete, Trash, and restore.
- Dexie/IndexedDB metadata and content storage.
- Markdown editor/preview with math and Mermaid diagrams.
- CodeMirror source editing, including Verilog and SystemVerilog.
- PDF reader with continuous scrolling, navigation, zoom, and text search.
- Image previews; CSV/TSV table previews; basic VCD declaration/activity inspection.
- JSON backup/restore with SHA-256 integrity checks.
- Multiple open tabs and local save workflows.

See [Architecture](docs/architecture.md#file-format-support) for exact renderer limits. A recognized extension is not necessarily a rendered format.

## Known limitations

- DOC/DOCX/PPTX/XLSX, FST, GDS/GDSII, and KiCad PCB files are recognized but have no dedicated renderer.
- VCD inspection does not provide interactive timing traces.
- Windows is the configured desktop packaging target; Linux/macOS release installers are not configured.
- A source version number does not imply a published installer. Check [GitHub Releases](https://github.com/Abhishek6579/SiliconVault/releases).

## Quick start: browser development

Requirements: Node.js 22 LTS recommended, npm, and Git.

```bash
git clone https://github.com/Abhishek6579/SiliconVault.git
cd SiliconVault
npm ci
npm run dev
```

This launches the frontend in a browser; it is not the standalone desktop deliverable.

## Run/build the Windows desktop app

Install prerequisites in [Installation](docs/installation.md), then:

```powershell
npm ci
npm run tauri:dev
npm run tauri:build
```

The configured bundle is a per-user NSIS installer under `src-tauri/target/release/bundle/nsis/`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Browser frontend development |
| `npm run dev:desktop` | Fixed-port Vite server for Tauri |
| `npm run build` | Production frontend build |
| `npm test` | Vitest suite |
| `npm run typecheck` | Strict TypeScript check |
| `npm run tauri:dev` | Tauri desktop development |
| `npm run tauri:build` | Desktop bundle build |

## Data model

Workspace data is stored locally through Dexie/IndexedDB; no account, cloud sync, or hosted backend is required. **Local storage is not encryption:** the application does not currently encrypt workspace records or backups at rest. Anyone with access to the same OS account/profile and its application data may be able to access them. Use full-disk encryption and OS account security for device-level protection; do not store highly sensitive material on the assumption that the app encrypts it. Back up important data before clearing browser/WebView data, changing machines, or testing migrations. Browser development and packaged Tauri use distinct WebView/browser profiles; do not assume their IndexedDB data is shared. The packaged Windows data path still requires confirmation on an installed build. See [Storage audit](docs/storage-audit.md).

## Project documentation

- [Developer instructions](AGENTS.md)
- [Architecture and file support](docs/architecture.md)
- [Development guide](docs/development.md)
- [Windows installation](docs/installation.md)
- [Storage audit](docs/storage-audit.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release process](docs/release-process.md)
- [Changelog](CHANGELOG.md)
- [License status](docs/license-status.md)

## License

No license file is currently present. No license grant should be assumed. See [License status](docs/license-status.md); the maintainer must choose the intended terms before describing this repository as open source.
