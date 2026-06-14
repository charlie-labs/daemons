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

The root `examples.json` file is the source of truth. The CLI reads it from `charlie-labs/daemons`.

When `--ref` is omitted, the CLI derives a schema tracking tag from the installed package version in `package.json`:

| Installed package major | Default catalog ref |
| --- | --- |
| `0.x.x` | `examples-schema-v1` |
| `1.x.x` | No default; pass `--ref <sha|branch|tag>` explicitly. |
| `2.x.x` | `examples-schema-v2` |
| `N.x.x`, where `N >= 2` | `examples-schema-vN` |

Prerelease and build metadata keep the same major mapping, so `2.0.0-beta.1` uses `examples-schema-v2`. If the package version is invalid or the installed major is `1`, commands that need the catalog fail with a clear prompt to pass `--ref <sha|branch|tag>`.

```bash
daemon list
```

Use `--ref <sha|branch|tag>` for reproducible reads and installs. An explicit `--ref` always wins over the package-major default:

```bash
daemon show dependency-upgrades --ref 11da8066b1e0cf968d07ce512f65a9a817f9bc10

daemon add dependency-upgrades --ref examples-schema-v2
```

A single command uses the selected ref for `examples.json` and every support-file fetch.

Unsupported catalog schema versions fail closed.

## Commands

### `daemon list`

Reads root `examples.json` and prints stable example IDs.

```bash
daemon list

daemon list --ref examples-schema-v2 --json
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

daemon install docs-drift-maintainer --ref examples-schema-v2

daemon add pr-merge-conflict-repair --allow-deprecated --dry-run

daemon add js-ts-dependency-upgrades --force \
  --adapt package_manager=pnpm
```


Structured adaptation inputs:

- repeat `--adapt key=value` for explicit values;
- use `--adapt-file adaptations.json` for a JSON object of string values;
- optional defaults from the catalog are applied first, then file values, then CLI flag values;
- empty string values are accepted when explicitly provided, but rendered `DAEMON.md` must still pass runtime validation;
- unknown keys, non-string file values, missing required values, malformed or unknown `{{adapt.*}}` tokens, and unresolved adaptation tokens fail before any files are written.

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
