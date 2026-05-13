# AGENTS.md

These rules must be strictly followed for all work in this repository.

This repository publishes public Charlie daemon examples and the npm package `@charlie-labs/daemons`, which exposes the `daemon` CLI. Example packages live in `daemons/<id>/`; the generated root `examples.json` catalog is the public index consumed by the CLI.

## Source map

Read the most specific source of truth before editing; do not duplicate detailed rules here.

- Public daemon docs: [overview](https://docs.charlielabs.ai/daemons), [choosing daemons](https://docs.charlielabs.ai/daemons/choosing-daemons), [writing and editing `DAEMON.md`](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md), [`DAEMON.md` reference](https://docs.charlielabs.ai/daemons/daemon-md-reference), and [testing/iterating](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons).
- Repo docs: [`README.md`](README.md), [`docs/daemon-cli.md`](docs/daemon-cli.md), [`docs/examples-authoring-guide.md`](docs/examples-authoring-guide.md), [`docs/examples-spec.md`](docs/examples-spec.md), and [`docs/examples-catalog-consumer-guide.md`](docs/examples-catalog-consumer-guide.md).
- Example/catalog source: [`src/examples/catalog.ts`](src/examples/catalog.ts), [`src/examples/schema.ts`](src/examples/schema.ts), [`src/examples/public-safety.ts`](src/examples/public-safety.ts), [`src/examples/cli.ts`](src/examples/cli.ts), [`scripts/generate-examples.ts`](scripts/generate-examples.ts), and [`scripts/validate-examples.ts`](scripts/validate-examples.ts).
- CLI source: [`src/daemon-cli/cli.ts`](src/daemon-cli/cli.ts), [`src/daemon-cli/commands.ts`](src/daemon-cli/commands.ts), [`src/daemon-cli/catalog-client.ts`](src/daemon-cli/catalog-client.ts), [`src/daemon-cli/validation/runtime.ts`](src/daemon-cli/validation/runtime.ts), and [`src/daemon-cli/help.ts`](src/daemon-cli/help.ts).

## Example package rules

*Read [`docs/examples-authoring-guide.md`](docs/examples-authoring-guide.md) and [`docs/examples-spec.md`](docs/examples-spec.md) before editing `daemons/<id>/`, `example.yml`, or support-file layout; if `DAEMON.md` content changes, also follow the public daemon docs linked above.*

Keep example IDs stable and consistent across the directory name, `example.yml`, `DAEMON.md`, and catalog output. Put support files only in documented locations, keep generated `examples.json` in sync, and treat public-safety failures as release blockers.

## `DAEMON.md` authoring guardrails

*Follow the public daemon docs for daemon implementation and runtime semantics, especially [writing/editing `DAEMON.md`](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md) and the [`DAEMON.md` reference](https://docs.charlielabs.ai/daemons/daemon-md-reference); use [`src/daemon-cli/validation/runtime.ts`](src/daemon-cli/validation/runtime.ts) and [`src/examples/schema.ts`](src/examples/schema.ts) as validation/source links.*

Do not restate or invent runtime frontmatter rules here. Authors must write `DAEMON.md` and paired `example.yml` files against the public docs, repo docs, and validators, then validate the package/catalog behavior.

## Catalog workflow

*Follow [`docs/examples-spec.md`](docs/examples-spec.md), [`docs/examples-catalog-consumer-guide.md`](docs/examples-catalog-consumer-guide.md), [`src/examples/catalog.ts`](src/examples/catalog.ts), [`src/examples/schema.ts`](src/examples/schema.ts), [`src/examples/cli.ts`](src/examples/cli.ts), [`scripts/generate-examples.ts`](scripts/generate-examples.ts), and [`scripts/validate-examples.ts`](scripts/validate-examples.ts) before changing catalog generation, validation, or consumer behavior.*

`examples.json` is generated deterministically from `daemons/**`; run generation/validation for relevant changes and never hand-edit catalog drift.

## Public `daemon` CLI guidance

Use [`docs/daemon-cli.md`](docs/daemon-cli.md) plus [`src/daemon-cli/cli.ts`](src/daemon-cli/cli.ts), [`src/daemon-cli/commands.ts`](src/daemon-cli/commands.ts), [`src/daemon-cli/catalog-client.ts`](src/daemon-cli/catalog-client.ts), [`src/daemon-cli/validation/runtime.ts`](src/daemon-cli/validation/runtime.ts), and [`src/daemon-cli/help.ts`](src/daemon-cli/help.ts) for CLI behavior, catalog fetching, runtime validation, and help text. Keep docs, source, tests, and smoke coverage aligned when CLI behavior changes.

## Public-safety guidance

This repo and generated catalog are public-facing. Do not include private Linear URLs, internal-only hostnames, secrets, customer-private context, staging notes, or machine-local paths; use placeholders for repo-specific values, credentials, and destinations.

## Validation

- `AGENTS.md`-only edits: `git diff --check`.
- Example/catalog changes: `bun run generate:examples`, `bun run validate:examples`, then review and commit generated `examples.json` changes; use `git diff --exit-code examples.json` when expecting no catalog drift.
- Source or CLI behavior changes: `bun run typecheck` and `bun run test`; for CLI/package output changes, also run `bun run build`, `bun run smoke:daemon`, and `node dist/bin.js list --json`.
