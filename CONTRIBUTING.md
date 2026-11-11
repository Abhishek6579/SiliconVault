# Contributing

SiliconVault is an early-stage, desktop-first engineering workspace. Contributions must preserve local user data and existing behavior.

## Before starting

- Read [AGENTS.md](AGENTS.md) completely. Its architecture, scope, data-safety, and regression rules are mandatory.
- Read [Architecture](docs/architecture.md) and [Development](docs/development.md).
- Check existing issues and pull requests.
- Discuss substantial features before implementation; do not expand product scope without maintainer approval.

## Workflow

1. Sync the established `slave` branch with `master` before coordinated work; do not create ad-hoc branches for this repository workflow.
2. Install with `npm ci`.
3. Make one coherent, scoped change.
4. Preserve database history, working viewers, and existing workflows.
5. Add/update tests.
6. Run `npm test`, `npm run typecheck`, and `npm run build`.
7. For native changes, validate `cargo check` and a Windows `npm run tauri:build`.
8. Update documentation only when implemented behavior changes.

## Pull request contents

Include the problem, scope, implementation decisions, affected subsystems, tests actually run and their results, platform limitations, migration impact, and screenshots for visible UI changes where useful. Do not claim tests or installer builds that were not run. Never include secrets, local databases, user backups, or generated build output.

## Code and data rules

- Keep TypeScript strict and storage logic separate from UI where practical.
- Dexie/IndexedDB remains the application persistence layer.
- Every schema change requires a named migration, previous-version fixture, and integrity tests.
- Do not load every file body during normal workspace refresh.
- Treat imported documents as untrusted data.
- Avoid remote code execution, arbitrary shell commands, excessive Tauri permissions, and cloud upload.
- Destructive operations require explicit confirmation.
- Never silently discard unsaved changes.

## Security reports

Do not file public issues for exploitable vulnerabilities. Follow [SECURITY.md](SECURITY.md).
