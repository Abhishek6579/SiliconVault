# Development guide

## Prerequisites

Frontend: Git, Node.js 22 LTS recommended, npm.

Windows desktop: Rust stable via rustup using the MSVC toolchain, Visual Studio Build Tools with **Desktop development with C++**, Windows SDK, and Microsoft Edge WebView2 Runtime.

See [Installation](installation.md) for the Windows sequence.

## Clone and install

```bash
git clone https://github.com/Abhishek6579/SiliconVault.git
cd SiliconVault
npm ci
```

Use `npm ci` against the committed lockfile. Do not commit node_modules, build output, local databases, backups, or signing credentials.

## Run modes

```bash
npm run dev          # browser-based frontend
npm run tauri:dev    # native desktop app; starts Vite on 127.0.0.1:1420
```

## Required verification

```bash
npm test
npm run typecheck
npm run build
```

For native changes, additionally run:

```bash
cd src-tauri
cargo check
cd ..
npm run tauri:build
```

A frontend build does not prove the Windows installer works. Validate native dialogs, persistence, upgrade, and uninstall behavior on Windows.

## Data safety

- Never clear/reset a developer's IndexedDB database to make tests pass.
- Use isolated test databases and fixtures.
- Back up important data before migration testing.
- Every Dexie schema change needs a named migration, previous-version fixture, and integrity tests.
- Do not load all content blobs during normal workspace refresh.
- Never silently discard unsaved edits or weaken destructive-action confirmations.
- Do not add another persistence layer or cloud service.

## Adding a file format

1. Inspect `src/storage/files.ts` and the editor/viewer dispatch in `src/App.tsx`.
2. Decide whether the format is editable, preview-only, or merely recognized.
3. Add an isolated renderer where practical; do not overload the PDF reader.
4. Bound memory use and release Blob URLs/resources when tabs close.
5. Add classification/rendering tests.
6. Update the support matrix only after implementation exists.

## Branch and pull request workflow

For coordinated project work, sync the existing `slave` branch with `master` first and continue on `slave`; do not create ad-hoc branches. Keep changes scoped and preserve existing behavior. Include actual commands and results; never claim checks that were not run. See [CONTRIBUTING.md](../CONTRIBUTING.md).
