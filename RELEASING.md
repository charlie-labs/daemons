# Releasing `@charlie-labs/daemons`

Releases are created from reviewed PRs. A human updates the package version and release notes in a normal PR, merges it to `master`, and the `Release` GitHub Actions workflow publishes the package.

## Human release flow

1. Open a normal PR against `master` that includes:
   - the intended `package.json` version;
   - the matching CLI-reported version in `src/daemon-cli/constants.ts`;
   - release notes in `CHANGELOG.md` for that exact version.
2. Get the PR reviewed and wait for CI to pass.
3. Merge the PR to `master`.
4. Let `.github/workflows/release.yml` run on the merged `master` commit. The workflow validates the commit, creates or validates the `v${version}` annotated tag, creates or validates the GitHub Release, and publishes `@charlie-labs/daemons` to npm through trusted publishing.

Do not publish manually as part of the normal flow, and do not add a long-lived `NPM_TOKEN` secret.

## Version and release-notes requirements

Every release PR must keep these inputs in sync:

- `package.json#version` is the source for the npm package version and release tag.
- `src/daemon-cli/constants.ts` must report the same version through `daemon --version`. The `smoke:daemon` check packs and installs the package, then verifies the installed binary prints the package version.
- `CHANGELOG.md` must include an entry for the exact version. The release workflow uses that entry for the GitHub Release notes when it is present.

Use valid semver. Stable versions look like `0.0.1`; prereleases look like `0.0.2-beta.1`.

## Validation checklist

Run the local checklist before opening the version PR:

```bash
bun install --frozen-lockfile --registry https://registry.npmjs.org/
bun run typecheck
bun run test
bun run build
bun run smoke:daemon
bun run generate:examples
bun run validate:examples
git diff --exit-code examples.json
npm pack --dry-run
```

The release workflow runs the same validation checklist before it creates release artifacts or publishes to npm.

## Stable and prerelease behavior

The workflow reads the version from `package.json`:

- Stable semver versions publish to npm with the `latest` dist-tag and create a normal GitHub Release.
- Semver prerelease versions publish to npm with the `next` dist-tag and create a GitHub prerelease.

## Guardrails and reruns

The workflow is safe to rerun for the same merged commit, and safe for later `master` merges that leave `package.json#version` unchanged:

- If the exact `@charlie-labs/daemons@${version}` already exists on npm, the workflow skips `npm publish` instead of failing on a duplicate publish.
- If the `v${version}` tag already exists, it must always be an annotated tag.
- If npm does not contain the exact package version yet, an existing `v${version}` tag must resolve to the current merged `master` commit.
- If npm already contains the exact package version, an annotated `v${version}` tag from the earlier release commit is allowed so unchanged-version `master` merges can leave existing release artifacts unchanged.
- If the GitHub Release already exists, it must use the matching tag and the expected stable/prerelease setting.
- Any lightweight tag, mismatched GitHub Release metadata, or existing tag on another commit before the exact npm version exists fails loudly instead of mutating an unsafe release.

## npm trusted publishing setup

Configure npm trusted publishing for:

- Package: `@charlie-labs/daemons`
- GitHub repository: `charlie-labs/daemons`
- Workflow: `.github/workflows/release.yml`

The workflow has `id-token: write` permission so npm can exchange GitHub OIDC identity for publish authorization. It does not use a long-lived `NPM_TOKEN` and does not use a token-based npm publish action.

First-publish caveat: if npm requires the package to exist before trusted publishing can be configured, a maintainer may need to do the smallest approved one-time bootstrap package creation first. After trusted publishing is enabled, future releases should use this workflow without keeping an npm token in GitHub secrets.
