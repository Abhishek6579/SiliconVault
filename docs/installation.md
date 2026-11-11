# Installation

## Windows end-user installation

A downloadable installer exists only when a GitHub Release includes an installer asset. Check [Releases](https://github.com/Abhishek6579/SiliconVault/releases); do not treat source code or workflow artifacts as an official installer.

1. Download the Windows installer from the release.
2. Verify its hash against the accompanying `SHA256SUMS.txt`.
3. Run the installer. Tauri is configured for NSIS and per-user installation (`currentUser`).
4. Launch SiliconVault from the installed shortcut.

If there is no release asset, no official downloadable installer is currently available.

## Windows development prerequisites

1. Install Node.js 22 LTS and npm.
2. Install Rust stable through rustup and use the MSVC toolchain.
3. Install Visual Studio Build Tools with the **Desktop development with C++** workload and Windows SDK.
4. Ensure Microsoft Edge WebView2 Runtime is installed.
5. Verify:

```powershell
node --version
npm --version
rustc --version
cargo --version
```

## Build locally

```powershell
git clone https://github.com/Abhishek6579/SiliconVault.git
cd SiliconVault
npm ci
npm run tauri:dev
npm run tauri:build
```

The configured NSIS installer is expected under `src-tauri/target/release/bundle/nsis/`. Read the actual filename from the build output; do not assume an architecture-specific name.

## Browser development

```bash
npm ci
npm run dev
```

This runs the frontend in a browser, not the standalone desktop app.

## Data persistence

SiliconVault uses Dexie/IndexedDB. Back up important workspace data before clearing browser/WebView data or testing upgrades. The database is not stored alongside the installer. Browser development and packaged Tauri may use different profiles. The exact packaged Windows data path and upgrade persistence must be confirmed on an installed build.

## Platform support

Windows is the configured desktop packaging target. Linux/macOS frontend development may be possible, but release workflows for those platforms are not configured.
