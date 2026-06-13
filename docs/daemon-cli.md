# Daemon catalog CLI

The `@charlie-labs/daemons` package provides the public `daemon` binary for browsing the daemon examples catalog, scaffolding examples into repositories, and validating runtime `DAEMON.md` files.

The CLI is designed for both humans and Charlie automation. Every command supports the stable `--json` envelope:

```json
{
  "command": "show",
  "ok": true,
  "exitCode": 0,
  "summary": "ready-daemon: Ready daemon",
  "warnings": [],
  "errors": [],
  "data": {}
}
```

## Install and run

```bash
npm install -g @charlie-labs/daemons

daemon --help
```

From this repository during development:

```bash
bun run build
node dist/bin.js list --json
```

## Catalog source and pinned refs

The root `examples.json` file is the source of truth. The CLI reads it from `charlie-labs/daemons` and defaults to `master`:

```bash
daemon list
```

Use `--ref <sha|branch|tag>` for reproducible reads and installs:

```bash
daemon show dependency-upgrades --ref 11da8066b1e0cf968d07ce512f65a9a817f9bc10

daemon add dependency-upgrades --ref 11da8066b1e0cf968d07ce512f65a9a817f9bc10
```

A single command uses the same ref for `examples.json` and every support-file fetch.

Unsupported catalog schema versions fail closed.

## Commands

### `daemon list`

Reads root `examples.json` and prints stable example IDs.

```bash
daemon list

daemon list --ref master --json
```

JSON data includes `exampleIds[]`, compact `examples[]`, `sourceRepo`, `sourceRef`, and `schemaVersion`.

### `daemon show <example-id>`

Shows catalog details for one example:

- status and readiness
- required and optional integrations
- support files from `scripts[]` and `references[]`
- structured adaptation inputs from `adaptations[]`
- optional specialization ideas from `specializationIdeas[]`
- the activation caveat

```bash
daemon show pr-metadata

daemon show pr-metadata --json
```

`show` returns `data.adaptations[]` for structured render inputs and `data.specializationIdeas[]` for optional follow-up tuning ideas. No explicit acknowledgement flag is required; the adaptation inputs are prominent in both human and JSON output.

### `daemon add <example-id>` / `daemon install <example-id>`

Scaffolds a catalog example into the current repository:

```text
.agents/daemons/<example-id>/
  DAEMON.md
  scripts/      # only catalog-listed scripts
  references/   # only catalog-listed references
```

If the current working directory is inside a git repository, the destination root is the git repo root. Otherwise, the destination root is the current working directory.

Install behavior is intentionally narrow:

- writes rendered `DAEMON.md` from `entry.daemon.content`
- fetches only paths listed in `entry.scripts[]` and `entry.references[]`
- fetches support files from the same catalog ref as `examples.json`
- never copies `example.yml`
- never crawls upstream daemon directories
- plans destination paths and file modes before writing (`100644` for `DAEMON.md`/references, `100755` for scripts)
- refuses to use an existing destination directory or overwrite existing destination files unless `--force` is provided
- blocks deprecated examples unless `--allow-deprecated` is provided
- supports `--dry-run` for read-only planning
- renders `{{adapt.key}}` tokens in `DAEMON.md`, scripts, and references before validating and writing

Examples:

```bash
daemon add js-ts-dependency-upgrades --dry-run \
  --adapt package_manager=pnpm

daemon install docs-drift-maintainer --ref master

daemon add pr-merge-conflict-repair --allow-deprecated --dry-run

daemon add js-ts-dependency-upgrades --force
```


Structured adaptation inputs:

- repeat `--adapt key=value` for explicit values;
- use `--adapt-file adaptations.json` for a JSON object of string values;
- optional defaults from the catalog are applied first, then file values, then CLI flag values;
- empty string values are accepted when explicitly provided, but rendered `DAEMON.md` must still pass runtime validation;
- unknown keys, non-string file values, missing required values, unknown `{{adapt.*}}` tokens, and unresolved adaptation tokens fail before any files are written.

`adaptations.json` example:

```json
{
  "package_manager": "pnpm"
}
```

JSON data includes:

- `adaptationsApplied[]` (keys only, not raw values)
- `activationRequired`
- `filesPlanned[]`, where each item includes `sourcePath`, `destinationPath`, `kind`, and `mode` (`100644` or `100755`)
- `filesWritten[]`
- `collisions[]`
- `deprecatedBlocked`
- `sourceRef`

Scaffolding does **not** activate a daemon. The daemon becomes eligible only after the change is merged to the target repository default branch and Charlie ingests that merged version.



### `daemon pr open <example-id>`

Renders a catalog example the same way as `daemon add`, but writes the install as a GitHub pull request in a target repository instead of writing to the local filesystem:

```bash
daemon pr open js-ts-dependency-upgrades \
  --repo owner/repo \
  --base main \
  --adapt package_manager=pnpm
```

Options:

- `--repo owner/repo` is required and selects the target GitHub repository.
- `--ref <sha|branch|tag>` pins the daemon catalog source ref. It defaults to `master`.
- `--base <branch>` selects the target PR base branch. If omitted, the GitHub repository default branch is used.
- `--adapt key=value` and `--adapt-file adaptations.json` use the same structured adaptation rules and precedence as `daemon add`.
- `--force` allows the PR commit to write catalog-managed install paths even when the target base already contains `.agents/daemons/<example-id>/`. Without `--force`, existing target files or directories are reported as collisions and no branch is created.

The command uses `GITHUB_TOKEN` or `GH_TOKEN` for GitHub API authentication. Node callers can pass an explicit token or injected GitHub client to `createDaemonInstallPullRequest()`.

PR creation is idempotent for a given target repo and example ID:

- the install branch is deterministic: `charlie/daemon-installs/<example-id>`;
- if an exact-head open PR already exists for that branch and base, the command returns it instead of opening another PR;
- if the branch exists without a PR and its files match the rendered install, the command opens a PR from that existing branch;
- if the branch exists but does not match the rendered install, the command fails closed with a branch-collision error;
- if another caller creates the branch or PR concurrently, the command re-reads the branch/PR and returns the existing open PR when possible.

The implementation writes via GitHub's tree, commit, ref, and pull-request REST APIs. The PR body includes a hidden marker in this format:

```html
<!-- charlie-daemon-install-v1 {"adaptationKeys":["package_manager"],"...":"..."} -->
```

The marker is used for reconciliation and intentionally stores only adaptation keys, never raw adaptation values. JSON output likewise reports `adaptationsApplied[]` keys only.

JSON data includes:

- `repository`, `daemonId`, `sourceRepo`, `sourceRef`, and `catalogSchemaVersion`;
- `baseBranch`, deterministic `headBranch`, and `headSha`;
- `pullRequest` number, URL, state, head/base refs, and merge metadata;
- `filesPlanned[]` / `filesWritten[]` with destination paths and Git file modes;
- `adaptationsApplied[]` key names;
- parsed marker metadata.

### `daemon pr list`

Lists daemon install PRs and deterministic install branches in a target repository:

```bash
daemon pr list --repo owner/repo

daemon pr list --repo owner/repo --json
```

The listing reconciles two sources:

1. GitHub issue search for PR bodies containing the hidden `charlie-daemon-install-v1` marker.
2. Git refs under `heads/charlie/daemon-installs/`.

Each item is classified as:

- `open` — an open install PR;
- `merged` — a closed PR with `merged_at` set;
- `closed_unmerged` — a closed PR that was not merged;
- `branchWithoutPullRequest` — a deterministic install branch with no associated PR.

If a PR body was edited and the hidden marker was removed, `daemon pr list` still reports the PR while the deterministic branch exists, with a warning that marker metadata is missing. If GitHub search is temporarily stale or unavailable, the command falls back to branch reconciliation and returns a warning.

## Runtime validation

`daemon validate` validates runtime daemon files, not catalog metadata.

```bash
daemon validate .agents/daemons/pr-metadata/DAEMON.md

daemon validate --all

daemon validate --all --dry-run --json
```

`--all` discovers runtime daemon files under:

```text
.agents/daemons/**/DAEMON.md
```

`--dry-run` is accepted for validation as an explicit read-only/no-op flag and is reported in output.

Validation enforces the canonical runtime `DAEMON.md` contract:

- YAML frontmatter must parse separately from the Markdown body.
- Frontmatter must be a YAML object.
- Allowed frontmatter keys are exactly `id`, `purpose`, `watch`, `routines`, `deny`, and `schedule`.
- Unknown keys are rejected.
- Legacy keys such as `name`, `description`, `triggers`, `actions`, and `disallowed` are rejected with replacement guidance.
- Catalog/example metadata keys such as `status`, `readiness`, and `requirements` are rejected in runtime frontmatter.
- `id`, `purpose`, and non-empty `routines[]` are required.
- At least one activation path is required: non-empty `watch[]` or a valid `schedule`.
- `schedule`, when present and non-blank, must be a standard five-field cron expression.
- Cron validation returns field-level reasons such as `cron:minute value out of range`.
- The Markdown body below frontmatter must be non-empty.
- Files under `.agents/daemons/<id>/DAEMON.md` must have matching frontmatter `id` and directory slug.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `64` | Usage error, such as missing arguments or unknown flags. |
| `65` | Validation, catalog, or data error. |
| `70` | Internal or I/O error. |

## Examples are patterns

The catalog examples are reference patterns to adapt before production use. Treat required `adaptations[]` entries as required local inputs before enabling or relying on a scaffolded daemon.

Use the public daemon docs for the runtime contract:

- [Daemons](https://docs.charlielabs.ai/daemons)
- [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference)
- [Writing and editing DAEMON.md](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md)
- [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons)
