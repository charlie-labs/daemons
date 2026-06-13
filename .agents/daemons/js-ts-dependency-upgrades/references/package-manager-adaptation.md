# Package manager configuration

This repo-local daemon is configured for Bun because this repository has `bun.lock`, `package.json`, and Bun-based package scripts.

Current commands are configured in `../DAEMON.md`:

- Outdated scan: `bun outdated`
- Runtime dependency update: `bun update yaml`
- Development dependency update: `bun update @types/bun typescript vitest`
- Install or lockfile refresh: `bun install`
- Verification: the Bun scripts listed in the daemon configuration, plus `git diff --check`

If this repository adds more dependencies, changes package managers, or changes required validation scripts, update `../DAEMON.md` in the same PR before relying on the daemon.

## Lockfile hints for future edits

| Evidence                  | Package manager |
| ------------------------- | --------------- |
| `bun.lock` or `bun.lockb` | Bun             |
| `pnpm-lock.yaml`          | pnpm            |
| `yarn.lock`               | Yarn            |
| `package-lock.json`       | npm             |

If multiple lockfiles exist, inspect recent commits and package scripts before choosing the configuration. If still ambiguous, stop and ask a human.

Use the repository's own scripts when they are clearer than generic package-manager examples.
