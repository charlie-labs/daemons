This repo contains example daemon files for common daemon patterns.

These examples are reference patterns for Charlie daemons. They are not the normative source of truth for the daemon format or for authoring rules.

## Start here

Start with the docs:

- [Daemons](https://docs.charlielabs.ai/daemons)
- [Choosing daemons](https://docs.charlielabs.ai/daemons/choosing-daemons)
- [Writing and editing DAEMON.md](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md)
- [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference)
- [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons)

For this repo's examples package and catalog contract, use:

- [Examples v2 package and catalog spec](docs/examples-spec.md)
- [Examples authoring guide](docs/examples-authoring-guide.md)
- [Examples catalog consumer guide](docs/examples-catalog-consumer-guide.md)

Read [Daemons](https://docs.charlielabs.ai/daemons) first if you are new to the concept.

Use [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference) for the exact authored contract and [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons) for testing and rollout guidance.

## Example index

| Category | Daemon ID | Path | Description |
| --- | --- | --- | --- |
| Dependency maintenance | `dependency-upgrades` | [daemons/dependency-upgrades/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/dependency-upgrades/DAEMON.md) | Opens low-noise dependency upgrade PRs with grouped minor and patch updates. |
| Documentation freshness | `docs-drift-maintainer` | [daemons/docs-drift-maintainer/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/docs-drift-maintainer/DAEMON.md) | Finds documentation drift caused by code changes and opens small source-backed docs PRs. |
| GitHub activity reporting | `github-activity-digest` | [daemons/github-activity-digest/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/github-activity-digest/DAEMON.md) | Posts a low-noise scheduled digest of meaningful pull request and CI activity. |
| Linear issue hygiene | `linear-issue-labeler` | [daemons/linear-issue-labeler/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/linear-issue-labeler/DAEMON.md) | Keeps recently changed Linear issues aligned with a documented label taxonomy. |
| PR metadata management | `pr-metadata` | [daemons/pr-metadata/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/pr-metadata/DAEMON.md) | Keeps PR title/body metadata complete, current, and linked to the correct issue item. |

## Generated examples catalog

The root `examples.json` file is generated from each `daemons/<id>/example.yml`, `DAEMON.md`, and supported files under `scripts/**` and `references/**`.

Use [Examples v2 package and catalog spec](docs/examples-spec.md) for the exact package, metadata, generation, validation, and public-safety contract. Use [Examples authoring guide](docs/examples-authoring-guide.md) for author/reviewer guidance. Use [Examples catalog consumer guide](docs/examples-catalog-consumer-guide.md) for website, dashboard, and install consumer guidance.

Use the repo-owned checks before changing examples:

```bash
bun install
bun run generate:examples
bun run validate:examples
bun run test
```

`examples.json` is deterministic and should be committed whenever example packages change.

## How to use this repo

Use this repo to:

- find the nearest example pattern
- calibrate scope and level of specificity
- compare watch-driven, schedule-driven, and hybrid shapes
- adapt a proven structure to your repo’s real maintenance role

Do not assume an example can be copied directly into your repo without changes.

The docs are the source of truth for:

- [what daemons are](https://docs.charlielabs.ai/daemons)
- [what fields exist](https://docs.charlielabs.ai/daemons/daemon-md-reference)
- [what the validation rules are](https://docs.charlielabs.ai/daemons/daemon-md-reference)
- [what good daemon files look like](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md)
- [how to test and iterate safely](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons)

Use the docs for concept, contract, and authoring guidance. Use this repo for concrete patterns.

## How Charlie should use these examples

When choosing daemons:

- use [Choosing daemons](https://docs.charlielabs.ai/daemons/choosing-daemons) and the `Example index` to find the nearest pattern.

When creating or editing daemon files:

- use [Writing and editing DAEMON.md](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md) and [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference), and treat examples as reference patterns rather than source of truth.
- use [Examples authoring guide](docs/examples-authoring-guide.md) when adding or reviewing example packages in this repo.
