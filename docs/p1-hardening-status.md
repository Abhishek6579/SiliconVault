# P1 hardening status

This document separates code delivered by the P1 hardening pull request from work that still requires deeper implementation or repository-owner action.

| ID | Status | Evidence / remaining work |
| --- | --- | --- |
| P1.1 | Partial | Extracted Mermaid rendering, file-kind icon rendering, byte formatting, workspace tree projection, and workspace dialog rendering. Follow-up extraction moved editor/Markdown rendering, workspace navigation state, workspace sidebar/project tree, move/migration dialogs, item context menu, workspace selectors, tab opening/view-state persistence, drag payload handling, and search/wheel/click-outside effects out of `App.tsx`. The shell still owns many workflows and substantial layout JSX; continue extracting feature components and action hooks in smaller changes. |
| P1.2 | Initial coverage | Playwright browser test creates a project and verifies IndexedDB persistence after reload. Expand to import, edit/autosave, backup/restore, trash, and workspace switching workflows. |
| P1.3 | Stronger populated fixtures | v1/v2 migration fixtures now cover nested folders, multiple files, deleted-file metadata, text and binary content, and preferences. Add explicit injected-failure rollback tests before treating migration rollback as fully proven. |
| P1.4 | Cooperative cancellation | PDF search now exposes Cancel and stops between pages. PDF.js `getTextContent()` does not accept an AbortSignal in the current integration, so the currently extracting page cannot be interrupted. |
| P1.5 | Benchmark baseline | Added a repeatable JSON parsing heap/RSS benchmark. Collect baselines on stable CI hardware before setting regression thresholds; add database traversal and PDF rendering benchmarks separately. |
| P1.6 | Open | Import still calls `file.text()` then `JSON.parse()`. A bounded streaming JSON parser is required; do not describe the current implementation as streaming. |
| P1.7 | CI audit added | CI runs `npm audit --audit-level=high`. Review and remediate findings; Dependabot alerts/updates remain complementary, not a substitute for the audit. |
| P1.8 | Owner action required | Added the exact branch/tag ruleset configuration in `repository-settings.md`. Rulesets cannot be applied through the repository integration used for this PR; configure and verify them in GitHub Settings. |
| P1.9 | Manual release gate | Added an installed-app upgrade validation procedure. Automated MSI/WebView2 profile persistence testing remains open. |

## Merge criteria

Do not mark all P1 work complete solely because this PR merges. P1.6, the remaining P1.1 decomposition, broader P1.2 workflows, P1.8 repository settings, and automated P1.9 installer persistence verification remain explicit follow-up work.
