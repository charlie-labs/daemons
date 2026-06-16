# Changelog

## 2.0.2 - 2026-06-16

- Release the daemon install PR body fix from PR #28 so empty optional integration lists render cleanly without a placeholder bullet.
- Add regression coverage for install PR bodies when optional integrations are empty.

## 2.0.1 - 2026-06-16

- Release the daemon install PR body improvements from PR #26, replacing the generated install PR body with an educational template that explains what the daemon does and how it works.
- Derive the PR body purpose, routines, watch conditions, and schedule from the rendered and validated `DAEMON.md` after adaptations are applied.
- Include required and optional catalog integrations while preserving the hidden install marker without raw adaptation values.

## 2.0.0 - 2026-06-14

- Bump the daemon examples catalog schema to `schemaVersion: 2` for structured adaptation inputs.
- Add public install-PR automation APIs: `createDaemonInstallPullRequest()` renders daemon install plans into deterministic GitHub pull requests, and `listDaemonInstallPullRequests()` reconciles install PRs by hidden marker plus deterministic branch refs.
- Add `daemon pr open` and `daemon pr list` CLI commands for creating idempotent daemon install PRs and listing install PR statuses from the command line.
- Keep raw adaptation values out of install PR markers, API result metadata, and CLI output; marker metadata records adaptation key names only.
- Align the `@charlie-labs/daemons` package and CLI version with the v2 catalog contract.
- Breaking: once the v2 catalog reaches `master`, old `@charlie-labs/daemons@0.0.1` clients that read the default catalog will fail closed on the unsupported schema. Upgrade to `@charlie-labs/daemons@2.0.0` before consuming `master`.

## 0.0.1 - 2026-05-21

- Initial public release of the `@charlie-labs/daemons` package and `daemon` CLI.
- Includes the generated daemon examples catalog, CLI browsing/scaffolding/validation commands, and release automation bootstrap.
