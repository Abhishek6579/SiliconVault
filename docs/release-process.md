# Desktop release engineering

This is the release contract, not evidence that a release has been published.

## Release priorities

1. **Windows 10/11 x64 is primary.** Complete Windows package, signing, installed-upgrade, persistence, and rollback validation first.
2. **Linux x86_64 is secondary.** CI builds AppImage and DEB packages; native installation/runtime validation and public release attachment follow the Windows gate. Linux work must not become a dependency of Windows validation.
3. Standalone browser/web and macOS releases are out of scope.

## Versioning

Keep these identical:
- `package.json` → `version`
- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `[package].version`

Use Semantic Versioning: patch for compatible fixes, minor for compatible features, major for incompatible behavior/data changes. Pre-release identifiers may use `-alpha.N`, `-beta.N`, or `-rc.N`. Do not bump versions for every commit.

## Changelog

Update `CHANGELOG.md` during release preparation. Move user-visible changes from Unreleased to a versioned heading with a date. Do not invent history or claim partial format support as a completed renderer.

## Windows release checklist — required first

1. Sync `slave` with `master`; use the established branch workflow.
2. Review the full diff for secrets, user data, databases, backups, and generated artifacts.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run check:architecture`, and `npm run build`.
4. On Windows, run `cargo test --manifest-path src-tauri/Cargo.toml` and `npm run tauri:build`.
5. Install both NSIS and MSI outputs. Validate startup, native dialogs, import, drag-and-drop, backup/restore, restart persistence, update behavior, installed upgrade, and uninstall data retention.
6. Verify all three version fields match, review the signed updater manifest, and update the changelog.
7. Merge release-ready changes to `master`.

## Linux secondary checklist

After the Windows candidate is validated:
1. Run the Linux CI job with Tauri's native GTK/WebKitGTK prerequisites.
2. Build the AppImage and DEB packages and verify their checksums.
3. Install/launch on a supported Linux desktop and validate dialogs, file-manager drag-and-drop, import, persistence, backup/restore, diagnostics, and Office fallback.
4. Keep Linux updater capability disabled until the AppImage updater artifact and signed manifest entry have been tested.
5. Record Linux-only gaps separately; do not use them to delay the Windows installed-upgrade gate.

The current release workflow publishes Windows NSIS/MSI installers and the Windows x64 updater manifest. Linux AppImage/DEB packaging is validated by CI; attaching Linux packages to public releases is a separate secondary rollout task.

## Tag and publish

After the version commit is on `master`, create and push an annotated tag:

```bash
git tag -a vX.Y.Z -m "SiliconVault vX.Y.Z"
git push origin vX.Y.Z
```

Use the actual synchronized version. Never tag an unmerged development commit.

Pushing a `v*` tag triggers `.github/workflows/release.yml`. The workflow verifies that the tag commit is reachable from `master`. Manual dispatch is accepted only when run against `master`, and refuses to retarget an existing tag. It verifies the tag against the three version fields, builds Windows NSIS and MSI installers, generates `SHA256SUMS.txt`, and publishes the release. A manual dispatch from `slave` or another development branch is rejected. Fix a failed workflow before announcing the release. Never rerun an old tag against different source.

## Checksum verification

The release checksum file contains SHA-256 hashes for installer assets. Verify in PowerShell:

```powershell
Get-FileHash .\<installer-file>.exe -Algorithm SHA256
```

Compare the result with the matching filename in `SHA256SUMS.txt`.

## Signing status

The Windows updater requires the configured Tauri signing key. Authenticode signing is separate; do not claim Windows installers are Authenticode-signed unless that signing step has been configured and verified. Linux package signing/updater metadata must be validated independently before enabling Linux updates.

## Rollback

Never overwrite an existing release tag. Publish a corrected patch version with a new tag and mark defective releases as superseded/withdrawn with an explanation. Reinstalling an older binary is not a database rollback; schema changes require their own compatibility and recovery plan.
