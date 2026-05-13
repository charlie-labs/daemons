# AGENTS.md

This repository publishes public Charlie daemon examples. Example packages live in `daemons/<id>/`, the root `examples.json` catalog is generated from those packages, and the npm package `@charlie-labs/daemons` exposes the public `daemon` CLI binary.

## Source of truth

Use this order when authoring or reviewing changes:

1. Public daemon docs define `DAEMON.md` semantics and runtime behavior:
   - https://docs.charlielabs.ai/daemons
   - https://docs.charlielabs.ai/daemons/choosing-daemons
   - https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md
   - https://docs.charlielabs.ai/daemons/daemon-md-reference
   - https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons
2. Repo docs define this package layout, generated catalog, CLI, and review conventions:
   - `README.md`
   - `docs/daemon-cli.md`
   - `docs/examples-spec.md`
   - `docs/examples-authoring-guide.md`
   - `docs/examples-catalog-consumer-guide.md`

## Example package rules

Each public example package must use this shape:

```text
daemons/<id>/
  DAEMON.md
  example.yml
  scripts/**      # optional support files
  references/**   # optional support files
```

- Keep `<id>` stable and kebab-case.
- The directory name, `example.yml` `id`, and `DAEMON.md` frontmatter `id` must match exactly.
- Do not add unsupported top-level package files or directories. Per-example `README.md` files are not supported.
- Keep support files only under `scripts/**` or `references/**`.
- Any executable shebang script must be committed with executable permissions.

## `DAEMON.md` authoring guardrails

- Use only supported runtime frontmatter keys: `id`, `purpose`, `watch`, `routines`, `deny`, and `schedule`.
- Required fields: `id`, `purpose`, non-empty `routines[]`, and a non-empty Markdown body.
- Include at least one activation path: non-empty `watch[]` or a valid five-field cron `schedule`.
- Do not invent frontmatter fields.
- Do not use legacy keys: `name`, `description`, `triggers`, `actions`, or `disallowed`.
- Do not put catalog metadata in `DAEMON.md`, including `status`, `readiness`, `requirements`, `adaptation`, `activationMode`, `display`, or `metadata`.
- `activationMode` is derived at runtime and must never be authored.

## Catalog workflow

- `examples.json` is generated and deterministic from `daemons/**`, full `DAEMON.md` content, `example.yml`, and discovered support files.
- Run `bun run generate:examples` after changing example packages.
- Commit `examples.json` whenever the generator changes it.
- Do not hand-edit generated catalog output without running the generator.
- `bun run validate:examples` checks generated catalog drift in memory.

## Public `daemon` CLI guidance

See `docs/daemon-cli.md` for the full CLI contract.

- Package: `@charlie-labs/daemons`
- Binary: `daemon`
- Commands: `daemon list`, `daemon show <example-id>`, `daemon add <example-id>`, `daemon install <example-id>`, `daemon validate <path>`, and `daemon validate --all`.
- Every command supports `--json`.
- Catalog reads default to `master`; use `--ref <sha|branch|tag>` for reproducible reads and installs.
- A single command uses the same ref for the catalog and support-file fetches.
- `daemon add` and `daemon install` scaffold into `.agents/daemons/<id>/`.
- Scaffolding copies only catalog-listed `DAEMON.md`, `scripts[]`, and `references[]`; it never copies `example.yml` or crawls upstream daemon directories.
- Use `--dry-run` before writes when possible.
- Existing destination paths require `--force`.
- Deprecated examples require `--allow-deprecated`.
- `daemon show`, `daemon add`, and `daemon install` surface `adaptationsRequired[]`; treat every item as required local work.
- Scaffolding does not activate a daemon. A daemon becomes eligible only after the target repo default branch contains it and Charlie ingests it.
- `daemon validate` validates runtime daemon files, not catalog metadata.

## Public-safety guidance

This repo and generated catalog are public-facing. Do not include private Linear URLs, internal-only hostnames, secrets, customer-private context, staging notes, or machine-local paths.

Use placeholders for repo-specific values, secrets, and destinations, for example:

- `<channel-id>`
- `<team-id>`
- `YOUR_TOKEN`
- `REPLACE_WITH_REPO_COMMAND`

## Validation

For normal example package changes, run:

```bash
bun run generate:examples
bun run validate:examples
git diff --exit-code examples.json
bun run typecheck
bun run test
```

For CLI, package, or CLI docs changes, also run when feasible:

```bash
bun run build
bun run smoke:daemon
node dist/bin.js list --json
```
