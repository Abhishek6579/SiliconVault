# Security policy

## Scope and support

This policy covers SiliconVault and this repository. The application stores documents locally through Dexie/IndexedDB and uses Tauri 2; Windows is the primary configured desktop target.

The source version is currently `0.1.0` and the project is in early development. Security fixes target the current development line. No long-term support or backport commitment is made for older versions unless a release explicitly states otherwise.

## Report a vulnerability

**Do not publish exploitable vulnerability details in a public issue or pull request.**

Use GitHub private vulnerability reporting / security advisories for this repository if enabled. If private reporting is unavailable, contact the repository maintainer through the GitHub profile and request a private channel before sending exploit details. Do not include real user documents or personal data.

Include the affected version/commit, impact, reproducible steps in a test environment, required permissions/user interaction, a safe proof of concept, and a suggested mitigation if known.

The maintainer will acknowledge and investigate reports when practical and coordinate remediation/disclosure. No response-time SLA is currently promised.

## Security expectations

- Keep user documents local; do not add cloud upload without explicit product approval.
- Keep Tauri capabilities and filesystem permissions least-privilege.
- Treat imported files as untrusted input; never execute embedded scripts or commands.
- Keep CSP restrictive and avoid remote script sources.
- Never commit credentials, signing keys, private certificates, databases, or backups.
- Review dependency and GitHub Actions updates.
