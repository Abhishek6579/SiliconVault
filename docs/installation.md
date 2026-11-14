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

## Data persistence

SiliconVault uses Dexie/IndexedDB. Back up important workspace data before clearing browser/WebView data or testing upgrades. The database is not stored alongside the installer. A Tauri development profile and an installed application profile may differ. The exact packaged Windows data path and upgrade persistence must be confirmed on an installed build.

## Platform support

- **Windows 10/11 x64 — primary:** NSIS and MSI installers. Windows validation and installed-upgrade safety take priority.
- **Linux x86_64 — secondary:** AppImage and DEB package builds run in CI; native installation, runtime, and upgrade validation follow the Windows gate.

Standalone browser/web applications and macOS packages or releases are not supported targets. Linux is not allowed to block Windows validation.

## Linux secondary-target installation

Linux releases provide an AppImage and a Debian package when those assets are attached to the GitHub Release.

- **Debian/Ubuntu:** download the `.deb` asset, verify it against `SHA256SUMS-linux.txt`, then install it using the distribution package manager.
- **Other supported Linux distributions:** download the AppImage asset, verify its checksum, mark it executable, and launch it.

Linux package availability is published as a secondary job after Windows release publication. Linux runtime validation remains a separate track and does not delay the Windows release gate.
