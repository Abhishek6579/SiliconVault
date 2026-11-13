# SiliconVault

**A local-first engineering workspace for organizing, editing, previewing, and backing up technical project files in one desktop application.**

## Overview & Key Features

SiliconVault is a desktop-first engineering workspace built with React, TypeScript, Tauri 2, and Rust. Workspace metadata and file contents are stored locally in IndexedDB through Dexie; the application does not require a hosted application server or cloud account.

Implemented capabilities:

- Multiple workspaces, projects, and nested folders.
- Import files and folders; rename, move, delete, restore, and manage items in Trash.
- CodeMirror editing for text, Markdown, Verilog, and SystemVerilog.
- Markdown preview with KaTeX mathematics and Mermaid diagrams.
- PDF reading with page navigation, zoom, and text search.
- Image previews and CSV/TSV table previews.
- Basic VCD declaration/activity inspection (not an interactive waveform viewer).
- Read-only DOCX/DOCM and PPTX/PPTM previews; PDF conversion can use ONLYOFFICE Document Builder or LibreOffice when installed.
- Multiple tabs, automatic local saves, and recoverable editing drafts.
- Workspace backup and restore with validation and SHA-256 integrity checks.
- Application diagnostics, logs, and signed update support.

File-format recognition does not guarantee a dedicated renderer. See [the implemented file-format matrix](docs/architecture.md#file-format-support).

## Supported Platforms & Prerequisites

### End-user platform support

| Platform | Status |
| --- | --- |
| Windows 10/11 | Configured desktop packaging and release workflow. This is the supported packaged target. |
| macOS | Tauri is cross-platform, but this repository does not configure or publish macOS release artifacts. |
| Linux | Tauri is cross-platform, but this repository does not configure or publish Linux release artifacts. |

Do not treat macOS/Linux builds as release-supported until native dependencies, packaging, and installed-app behavior have been validated.

### Developer prerequisites

- Git.
- Node.js 22 LTS and npm (Node 22 is used by CI and release workflows).
- Rust stable via rustup for native Tauri builds.
- Windows: the MSVC Rust toolchain, Visual Studio Build Tools with **Desktop development with C++**, and the Windows SDK.
- Microsoft Edge WebView2 Runtime on Windows.

Office document-to-PDF conversion optionally requires LibreOffice or a licensed ONLYOFFICE Document Builder runtime. These are external conversion engines, not npm dependencies.

Verify the toolchain:

~~~powershell
node --version
npm --version
rustc --version
cargo --version
~~~

## Installation (End Users)

Official installers are published through [GitHub Releases](https://github.com/Abhishek6579/SiliconVault/releases). The current release workflow builds Windows **NSIS (.exe)** and **MSI (.msi)** installers. It does not publish macOS DMG or Linux AppImage packages.

1. Open the [SiliconVault Releases](https://github.com/Abhishek6579/SiliconVault/releases) page.
2. Select the release you want. Prereleases may contain incomplete or changing functionality.
3. Download the Windows NSIS **.exe** or **.msi** installer asset.
4. Download **SHA256SUMS.txt** from the same release and verify the installer checksum.
5. Run the installer and follow the Windows prompts. NSIS is configured for per-user installation.
6. Launch **SiliconVault** from the installed shortcut.

If a release has no installer assets, there is no published installer for that release. Do not treat source archives or CI artifacts as official installers.

## Building from Source (Developers)

### Clone and install

~~~bash
git clone https://github.com/Abhishek6579/SiliconVault.git
cd SiliconVault
npm ci
~~~

Use **npm ci** to install the dependency versions recorded in the committed lockfile.

### Run

Run the frontend in a browser:

~~~bash
npm run dev
~~~

Run the native desktop application:

~~~bash
npm run tauri:dev
~~~

The Tauri development command starts Vite at **http://127.0.0.1:1420**.

### Validate and build

~~~bash
npm test
npm run typecheck
npm run build
npm run tauri:build
~~~

For a native Rust check:

~~~bash
cd src-tauri
cargo check
cd ..
~~~

On Windows, configured bundles are written beneath:

- **src-tauri/target/release/bundle/nsis/**
- **src-tauri/target/release/bundle/msi/**

Use the exact filenames printed by the build.

### Optional environment variables

No frontend .env file is required by the current configuration. The native Office conversion code recognizes:

| Variable | Purpose |
| --- | --- |
| **SILICONVAULT_SOFFICE_PATH** | Explicit path to the LibreOffice soffice executable. Otherwise the app checks known locations and PATH. |
| **SILICONVAULT_DOCBUILDER_PATH** | Explicit path to ONLYOFFICE Document Builder (docbuilder.exe on Windows; documentbuilder elsewhere). |

PowerShell example:

~~~powershell
$env:SILICONVAULT_SOFFICE_PATH = "C:\Program Files\LibreOffice\program\soffice.exe"
$env:SILICONVAULT_DOCBUILDER_PATH = "C:\Path\To\docbuilder.exe"
npm run tauri:dev
~~~

Set only the variable for an installed conversion engine. Document Builder requires an appropriately licensed runtime. Updater signing keys are release-pipeline secrets and are not needed for ordinary local development; never commit them.

### Available npm scripts

| Command | Purpose |
| --- | --- |
| **npm run dev** | Browser-based Vite development |
| **npm run dev:desktop** | Vite on the fixed Tauri development port |
| **npm run build** | Production frontend build |
| **npm test** | Vitest suite |
| **npm run typecheck** | TypeScript checks |
| **npm run test:e2e** | Playwright end-to-end tests |
| **npm run tauri:dev** | Native desktop development |
| **npm run tauri:build** | Desktop bundle build |
| **npm run benchmark:backup-memory** | Backup memory benchmark |
| **npm run benchmark:storage** | Storage/startup benchmark |

## Usage & Keyboard Shortcuts

### Basic workflow

1. Launch SiliconVault. A new installation initializes a local **My Workspace**.
2. Use the workspace switcher and project/folder navigation to organize work.
3. Import files or folders using the import controls, or create supported workspace files.
4. Select a file to open it in the editor or corresponding reader. Open documents appear in tabs.
5. Edit supported text, Markdown, Verilog, or SystemVerilog files. Changes are autosaved locally; the editor also provides a Save action.
6. Use global search to locate workspace items. When a PDF, editor, or supported document viewer is focused, Find opens that surface's search.
7. Export backups regularly and store them securely. Backups are not encrypted by SiliconVault.

### Keyboard shortcuts

These shortcuts are implemented by the frontend keyboard handlers. **Ctrl** corresponds to **Command** on macOS when the runtime reports the Meta key.

| Shortcut | Context | Action |
| --- | --- | --- |
| Ctrl+K | Global | Open workspace search. |
| Ctrl+F | PDF reader | Open PDF text search. |
| Ctrl+F | Code/Markdown editor or preview | Open editor search. |
| Ctrl+F | Supported document viewer | Open document text search. |
| Escape | Search popup/panel | Close the search popup and dismiss the search panel. |
| Ctrl++ / Ctrl+= | General workspace | Increase application UI zoom. |
| Ctrl+- | General workspace | Decrease application UI zoom. |
| Ctrl+0 | General workspace | Reset application UI zoom. |
| Ctrl++ / Ctrl+= | PDF reader | Zoom in. |
| Ctrl+- | PDF reader | Zoom out. |
| Ctrl+0 | PDF reader | Reset PDF zoom. |
| Ctrl++ / Ctrl+= | Code/Markdown editor | Increase editor font size. |
| Ctrl+- | Code/Markdown editor | Decrease editor font size. |
| Ctrl++ / Ctrl+= | Office/document viewer | Zoom in. |
| Ctrl+- | Office/document viewer | Zoom out. |
| Ctrl+0 | Office/document viewer | Reset viewer zoom. |

Zoom shortcuts are context-sensitive. The focused surface determines whether the application, editor, PDF, or document viewer is zoomed.

## Configuration & Data Storage

SiliconVault is local-first and does not require an account or remote application server.

### Workspace database

- Database name: **engineering-workspace**.
- Storage engine: IndexedDB through Dexie.
- Current schema version: **4**.
- Tables: **files**, **contents**, **folders**, **projects**, **preferences**, and **workspaces**.
- File metadata and file bodies are stored separately.
- UI preferences, tab/session state, and recoverable drafts are persisted through the local storage layer.

IndexedDB is scoped to the browser/WebView profile. Browser development and the packaged desktop app can use different databases. The workspace database is not stored beside the installer.

### Per-OS storage locations

Workspace data lives in the persistent WebView IndexedDB profile. Diagnostics use Tauri's platform-managed application directories. The repository does not hard-code a cross-platform filesystem path for the IndexedDB database.

| OS | Workspace data | Diagnostics/logs |
| --- | --- | --- |
| Windows | Persistent IndexedDB in the SiliconVault WebView2 profile. The exact installed-app path is not yet documented as validated. | Tauri app_log_dir/diagnostics location. |
| macOS | Persistent WebView IndexedDB profile if packaged; packaged behavior is not release-validated. | Tauri platform-managed application log directory. |
| Linux | Persistent WebView IndexedDB profile if packaged; packaged behavior is not release-validated. | Tauri platform-managed application log directory. |

Diagnostic files include **app.log**, **crash.log**, and **startup.json**. Log rotation is implemented. Diagnostics export excludes Dexie workspace data and user documents.

### Data safety

- IndexedDB and exported JSON backups are **not encrypted by the application**.
- Protect the OS account and device; use full-disk encryption where appropriate.
- Treat exported backups as plaintext copies of workspace data.
- Back up before migrations, reinstallations, profile cleanup, or upgrade testing.
- Do not assume browser-development data is the same as packaged desktop data.

See [Storage audit](docs/storage-audit.md) for schema history, migration details, data limits, and outstanding validation work.

## Project Architecture

The frontend is React/TypeScript inside a Tauri 2 desktop shell. Rust provides native integration and commands; Dexie/IndexedDB provides local persistence.

~~~text
SiliconVault/
├── .github/
│   ├── ISSUE_TEMPLATE/       # Bug report and feature request templates
│   └── workflows/            # CI validation and Windows release automation
├── docs/                     # Architecture, development, storage, installation,
│                             # release, performance, and validation documentation
├── e2e/                      # Playwright end-to-end tests
├── scripts/
│   ├── benchmarks/           # Storage and backup-memory benchmarks
│   └── windows/              # Installed-upgrade validation scripts
├── src/
│   ├── app/                  # App-level hooks and global shortcuts/zoom
│   ├── components/            # Shared UI components
│   ├── features/
│   │   ├── backup/            # Backup parsing and export/restore workflows
│   │   ├── diagnostics/       # Diagnostics dashboard
│   │   ├── editor/            # Editor surface and autosave
│   │   ├── search/            # Global and in-document search
│   │   ├── settings/          # UI preferences and system statistics
│   │   ├── tabs/              # Tab state, lifecycle, and editor surfaces
│   │   ├── updates/           # In-app update UI
│   │   └── workspace/         # Navigation, import, projects, folders, file list,
│   │                          # dialogs, and workspace actions
│   ├── pdf/                   # PDF lifecycle/resource cleanup
│   ├── platform/              # Desktop/browser detection and adapters
│   ├── shared/                # Shared constants, hooks, UI, and utilities
│   ├── storage/               # Dexie schema, migrations, persistence, backups,
│   │                          # file classification, and hierarchy operations
│   ├── utils/                 # General utilities
│   ├── viewers/               # Read-only file and Office viewers
│   ├── App.tsx                # Provider composition root
│   ├── AppShell.tsx           # Main application orchestration and layout
│   ├── PdfReader.tsx          # PDF reader
│   ├── main.tsx               # React entry point and global styles
│   └── styles.css             # Application styles
├── src-tauri/
│   ├── capabilities/          # Tauri window permissions
│   ├── icons/                 # Application icons
│   ├── src/
│   │   ├── diagnostics.rs     # Diagnostics collection/export commands
│   │   ├── error_handler.rs   # Native error handling
│   │   ├── logger.rs          # Startup, application, and crash logging
│   │   ├── system_monitor.rs  # Native system statistics
│   │   ├── updater.rs         # Signed update check/install commands
│   │   └── main.rs            # Tauri entry point and native commands
│   ├── Cargo.toml             # Rust dependencies and package metadata
│   └── tauri.conf.json        # App identity, window, Vite, CSP, bundle, updater
├── tests/                     # Vitest unit/integration tests
├── package.json               # npm scripts and frontend dependencies
├── package-lock.json          # Locked npm dependency graph
├── vite.config.ts             # Vite configuration
├── vitest.config.ts            # Vitest configuration
└── playwright.config.ts       # Playwright configuration
~~~

For deeper subsystem contracts, see [docs/architecture.md](docs/architecture.md).

## Contributing & License

### Contributing

Contributions are welcome, but changes must preserve existing behavior and local user data.

1. Read [AGENTS.md](AGENTS.md), [docs/architecture.md](docs/architecture.md), and [docs/development.md](docs/development.md).
2. Review existing issues and pull requests before starting substantial work.
3. Follow the established branch workflow in [CONTRIBUTING.md](CONTRIBUTING.md).
4. Keep changes scoped and add or update tests for behavior changes.
5. Run the relevant checks and report only commands actually run:

   ~~~bash
   npm test
   npm run typecheck
   npm run build
   ~~~

6. For native changes, also run **cargo check** from **src-tauri/** and validate a Windows desktop build with **npm run tauri:build**.
7. Open a pull request describing the problem, implementation, affected areas, test results, platform limitations, and migration impact. Include screenshots for UI changes where useful.

Do not commit secrets, signing keys, local databases, workspace backups, node_modules, or generated build output. Every Dexie schema change requires a named migration and upgrade/integrity tests. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

### License

SiliconVault is licensed under the **Apache License 2.0**. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for the full terms and attribution information. Third-party dependencies remain subject to their respective licenses.
