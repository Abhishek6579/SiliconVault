# Release engineering

This is the release contract, not evidence that a release has been published.

## Versioning

The current source version is `0.1.0`. Keep these identical:
- `package.json` → `version`
- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `[package].version`

Use Semantic Versioning: patch for compatible fixes, minor for compatible features, major for incompatible behavior/data changes. Pre-release identifiers may use `-alpha.N`, `-beta.N`, or `-rc.N`. Do not bump versions for every commit.

## Changelog

Update `CHANGELOG.md` during release preparation. Move user-visible changes from Unreleased to a versioned heading with a date. Do not invent history or claim partial format support as a completed renderer.

## Pre-release checklist

1. Sync `slave` with `master`; use the established branch workflow.
2. Review the full diff for secrets, user data, databases, backups, and generated artifacts.
3. Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`.
4. On Windows, run `npm run tauri:build` and install the NSIS output.
5. Validate startup, native dialogs, import, backup/restore, restart persistence, upgrade, and uninstall data retention.
6. Verify all three version fields match and update the changelog.
7. Merge release-ready changes to `master`.

## Tag and publish

After the version commit is on `master`, create and push an annotated tag:

```bash
git tag -a v0.1.1 -m "SiliconVault v0.1.1"
git push origin v0.1.1
```

The version is illustrative; use the actual synchronized version. Never tag an unmerged development commit.

Pushing a `v*` tag triggers `.github/workflows/release.yml`. It verifies the tag against the three version fields, builds the Windows NSIS installer, generates `SHA256SUMS.txt`, and publishes a GitHub Release with both assets. Fix a failed workflow before announcing the release.

## Checksum verification

The release checksum file contains SHA-256 hashes for the installer assets. Verify in PowerShell:

```powershell
Get-FileHash .\<installer-file>.exe -Algorithm SHA256
```

Compare the result with the matching filename in `SHA256SUMS.txt`.

## Signing status

No Authenticode certificate or Tauri updater signing key is configured by this change. Installers are therefore not claimed to be code-signed; Windows SmartScreen may show an unknown-publisher warning. Configure and verify signing separately before making signing claims.

## Rollback

Never overwrite an existing release tag. Publish a corrected patch version with a new tag and mark defective releases as superseded/withdrawn with an explanation. Reinstalling an older binary is not a database rollback; schema changes require their own compatibility and recovery plan.
