# Repository protection settings

These controls live in GitHub repository settings and cannot be enforced by a workflow file alone.

## Required branch ruleset

Create a branch ruleset targeting `master` and `release/**` (if release branches are introduced):

- Require a pull request before merging.
- Require at least one approval if another maintainer is available.
- Require branches to be up to date before merging.
- Require these status checks:
  - `Frontend checks`
  - `Dependency security audit`
  - `Windows desktop build`
- Block force pushes.
- Block branch deletion.
- Do not grant bypass to routine write access; reserve bypass for a documented emergency role.

Keep `slave` writable for development. It is not a release branch and should not be the default release source.

The `Linux desktop packages` job is a non-blocking secondary platform track. It may be monitored independently, but it must not become a prerequisite for completing the immediate Windows validation sequence.

## Release tag ruleset

Create a tag ruleset targeting `v*`:

- Restrict tag creation to release maintainers.
- Block tag updates and deletion.
- Require a reviewed release PR to land on `master` before creating a release tag.
- Do not use `workflow_dispatch` from an arbitrary development branch for production releases.

## Verification

After saving the rulesets, verify them with a test branch and a test tag in a disposable repository or a controlled maintenance window. Confirm that an unprivileged writer cannot push directly to `master`, force-push, delete protected refs, or create a release tag.

**Status:** documentation only. Repository rulesets have not been applied by this change; an owner must configure them in Settings → Rules → Rulesets.
