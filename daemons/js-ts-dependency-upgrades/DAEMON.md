---
id: js-ts-dependency-upgrades
purpose: Keep JavaScript and TypeScript dependencies current with low-noise grouped upgrade pull requests.
routines:
  - Detect JavaScript and TypeScript dependency manifests and the configured package manager's lockfile.
  - Scan for available JavaScript and TypeScript dependency updates using the configured package manager.
  - Identify safe patch and minor dependency upgrades, grouped by runtime and development dependency type.
  - Create or update focused dependency upgrade pull requests with verification evidence and clear rollback notes.
deny:
  - Do not auto-merge dependency pull requests.
  - Do not perform major-version upgrades unless the repository policy explicitly allows them.
  - Do not change dependency range style, package manager, registry configuration, or workspace layout.
  - Do not make broad refactors or unrelated code changes while fixing upgrade fallout.
  - Do not run package-manager commands from a package manager other than the configured package manager.
schedule: '0 8 * * 1'
---

# JavaScript/TypeScript Dependency Update Maintainer

## Configuration

Use these repository-specific values:

- Package manager: `{{adapt.package_manager}}`

Use the configured package manager's standard commands and lockfile behavior for outdated scans, patch/minor dependency updates, installs, and lockfile refreshes. Infer workspace layout from package manager metadata and repository manifests.

## Update policy

Default scope:

- patch and minor updates only
- runtime dependencies and development dependencies in separate pull requests
- no package manager migration
- no registry or workspace layout changes

Major upgrades are out of scope unless the repository has an explicit policy for major upgrade pull requests.

Run the configured package manager's outdated or update discovery command before choosing updates. Use the package manager's normal update and install workflow for runtime dependencies and development dependencies.

## PR policy

Create or update at most two pull requests per run:

1. runtime dependency patch/minor updates
2. development dependency patch/minor updates

Use these branch names and pull request titles:

- Runtime dependency branch: `daemon/deps-runtime-minor-patch`
- Development dependency branch: `daemon/deps-dev-minor-patch`
- Runtime dependency title: `deps: update runtime dependencies`
- Development dependency title: `deps(dev): update development dependencies`

Each PR body must include:

- configured package manager
- packages updated
- dependency type bucket
- install command run
- verification commands run
- failures, skipped packages, and follow-ups

## Verification and freshness

Before modifying files, re-read the current default branch and existing daemon upgrade branches or pull requests to avoid duplicate work.

After applying updates:

1. run the configured install or lockfile refresh command
2. run the configured verification commands
3. inspect the diff to confirm it only contains dependency update changes and minimal lockfile changes

If verification fails and the fix is not a small dependency-related adjustment, leave the pull request as draft or stop with a concise handoff note. Do not broaden into feature or refactor work.

## Limits

- Max open pull requests created or updated per run: 2
- Max packages per grouped pull request: 20
- No changes outside dependency manifests, lockfiles, and minimal generated dependency metadata unless the pull request is explicitly marked draft with rationale

## No-op when

- no patch or minor upgrades are available
- the configured package manager or matching lockfile cannot be identified
- verification cannot be run safely
- an existing human-owned dependency upgrade is already active for the same dependency bucket
