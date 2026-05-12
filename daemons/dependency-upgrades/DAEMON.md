---
id: dependency-upgrades
purpose: Keep repository dependencies current with low-noise grouped upgrade pull requests.
routines:
  - Detect the repository package manager, dependency manifests, lockfile, and verification commands.
  - Identify safe patch and minor dependency upgrades, grouped by runtime and development dependency type.
  - Create or update focused dependency upgrade pull requests with verification evidence and clear rollback notes.
deny:
  - Do not auto-merge dependency pull requests.
  - Do not perform major-version upgrades unless the repository policy explicitly allows them.
  - Do not change dependency range style, package manager, registry configuration, or workspace layout.
  - Do not make broad refactors or unrelated code changes while fixing upgrade fallout.
  - Do not proceed when package manager, lockfile, or verification commands are ambiguous.
schedule: '0 8 * * 1'
---

# Grouped Dependency Update Maintainer

## Package manager detection

Detect the package manager from the repository, preferring lockfiles and repository scripts over assumptions.

When available, run:

```bash
.agents/daemons/dependency-upgrades/scripts/detect-package-manager.sh
```

The script takes no arguments and prints exactly one package manager name to stdout: `pnpm`, `yarn`, `npm`, or `bun`. It exits non-zero for unknown or ambiguous lockfile state. Treat a non-zero exit as a stop condition, not as permission to guess.

If the package manager cannot be determined confidently, stop and ask for the correct package manager and verification commands.

## Update policy

Default scope:

- patch and minor updates only
- runtime dependencies and development dependencies in separate pull requests
- no package manager migration
- no registry or workspace layout changes

Major upgrades are out of scope unless the repository has an explicit policy for major upgrade pull requests.

## PR policy

Create or update at most two pull requests per run:

1. runtime dependency patch/minor updates
2. development dependency patch/minor updates

Use stable branches:

- `daemon/deps-runtime-minor-patch`
- `daemon/deps-dev-minor-patch`

Use clear titles:

- `deps: update runtime dependencies`
- `deps(dev): update development dependencies`

Each PR body must include:

- package manager detected
- packages updated
- dependency type bucket
- install command run
- verification commands run
- failures, skipped packages, and follow-ups

## Verification and freshness

Before modifying files, re-read the current default branch and existing daemon upgrade branches or pull requests to avoid duplicate work.

After applying updates:

1. run the repository install command
2. run the repository verification commands
3. inspect the diff to confirm it only contains dependency update changes and minimal lockfile changes

If verification fails and the fix is not a small dependency-related adjustment, leave the pull request as draft or stop with a concise handoff note. Do not broaden into feature or refactor work.

## Limits

- Max open pull requests created or updated per run: 2
- Max packages per grouped pull request: 20
- Max retry attempts after failed verification: 1
- No changes outside dependency manifests, lockfiles, and minimal generated dependency metadata unless the pull request is explicitly marked draft with rationale

## No-op when

- no patch or minor upgrades are available
- package manager detection is ambiguous
- verification cannot be run safely
- an existing human-owned dependency upgrade is already active for the same dependency bucket
