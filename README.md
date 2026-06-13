This repo contains example daemon files for common daemon patterns.

These examples are reference patterns for Charlie daemons. They are not the normative source of truth for the daemon format or for authoring rules.

## Start here

Start with the docs:

- [Daemons](https://docs.charlielabs.ai/daemons)
- [Choosing daemons](https://docs.charlielabs.ai/daemons/choosing-daemons)
- [Writing and editing DAEMON.md](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md)
- [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference)
- [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons)

For this repo's examples package, CLI, and catalog contract, use:

- [Daemon catalog CLI](docs/daemon-cli.md)
- [Examples v2 package and catalog spec](docs/examples-spec.md)
- [Examples authoring guide](docs/examples-authoring-guide.md)
- [Examples catalog consumer guide](docs/examples-catalog-consumer-guide.md)

Read [Daemons](https://docs.charlielabs.ai/daemons) first if you are new to the concept.

Use [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference) for the exact authored contract and [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons) for testing and rollout guidance.

## Example index

| Category | Daemon ID | Path | Description |
| --- | --- | --- | --- |
| Dependency maintenance | `js-ts-dependency-upgrades` | [daemons/js-ts-dependency-upgrades/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/js-ts-dependency-upgrades/DAEMON.md) | Opens low-noise JavaScript/TypeScript dependency upgrade PRs with configured package-manager commands. |
| Documentation freshness | `docs-drift-maintainer` | [daemons/docs-drift-maintainer/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/docs-drift-maintainer/DAEMON.md) | Repairs docs drift from recent merged source changes with small source-backed PRs. |
| Documentation freshness | `docs-stale-maintainer` | [daemons/docs-stale-maintainer/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/docs-stale-maintainer/DAEMON.md) | Runs weekly to repair older outdated documentation in small source-backed PRs with a hard size limit. |
| GitHub activity reporting | `github-activity-digest` | [daemons/github-activity-digest/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/github-activity-digest/DAEMON.md) | Posts a low-noise scheduled digest of meaningful pull request and CI activity. |
| Linear issue hygiene | `linear-bug-context-researcher` | [daemons/linear-bug-context-researcher/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/linear-bug-context-researcher/DAEMON.md) | Adds concise repo-aware triage context to newly created Linear bugs and regressions. |
| Linear issue hygiene | `linear-issue-duplicate-finder` | [daemons/linear-issue-duplicate-finder/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/linear-issue-duplicate-finder/DAEMON.md) | Suggests likely duplicate or related Linear issues when new issues are created. |
| Linear issue hygiene | `linear-issue-labeler` | [daemons/linear-issue-labeler/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/linear-issue-labeler/DAEMON.md) | Keeps recently changed Linear issues aligned with a documented label taxonomy. |
| Linear issue hygiene | `linear-pr-link-reconciler` | [daemons/linear-pr-link-reconciler/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/linear-pr-link-reconciler/DAEMON.md) | Finds likely GitHub code work for Linear issues and asks for confirmation without editing links automatically. |
| PR check repair | `pr-check-repair` | [daemons/pr-check-repair/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/pr-check-repair/DAEMON.md) | Repairs failing GitHub-visible PR checks with focused evidence-grounded commits, flaky reruns, or low-noise blocked comments. |
| PR merge conflict repair | `pr-merge-conflict-repair` | [daemons/pr-merge-conflict-repair/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/pr-merge-conflict-repair/DAEMON.md) | Repairs clear merge conflicts on non-draft GitHub pull requests after target base branch changes, with focused verification and low-noise blocked comments. |
| PR metadata management | `pr-metadata` | [daemons/pr-metadata/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/pr-metadata/DAEMON.md) | Keeps PR title/body metadata complete, current, and linked to the correct issue item. |
| PR review triage | `pr-review-triage` | [daemons/pr-review-triage/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/pr-review-triage/DAEMON.md) | Triages PR review threads and top-level PR comments for merge-readiness, duplicate feedback, fixed items, and safe low-noise follow-up. |
| Slack operations | `slack-alert-context-researcher` | [daemons/slack-alert-context-researcher/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/slack-alert-context-researcher/DAEMON.md) | Replies to alert-like Slack bot messages with compact GitHub and incident context for triage. |
| Slack planning | `slack-meeting-followup-planner` | [daemons/slack-meeting-followup-planner/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/slack-meeting-followup-planner/DAEMON.md) | Turns Slack meeting notes or transcripts into concise, repo-aware follow-up options Charlie can help execute. |

## Generated examples catalog

The root `examples.json` file is generated from each `daemons/<id>/example.yml`, `DAEMON.md`, and supported files under `scripts/**` and `references/**`.

## Node examples API

Node consumers can import the packaged catalog API without shelling out to the CLI:

```ts
import { getDaemonExample, listDaemonExamples, loadDaemonExamplesCatalog } from "@charlie-labs/daemons";

const catalog = await loadDaemonExamplesCatalog();
const examples = await listDaemonExamples();
const example = await getDaemonExample("js-ts-dependency-upgrades");
```

The API reads the package-root `examples.json`, so it works from the built npm package and keeps dashboard or other Node consumers on the same generated catalog contract as the CLI.

## Daemon catalog CLI

This package is npm-ready as `@charlie-labs/daemons` and exposes the `daemon` binary.

Use it to browse the public examples catalog, safely scaffold catalog examples into `.agents/daemons/<id>/`, and validate runtime daemon files:

```bash
daemon list

daemon show js-ts-dependency-upgrades --json

daemon add js-ts-dependency-upgrades --dry-run --adapt-file adaptations.json

daemon validate .agents/daemons/js-ts-dependency-upgrades/DAEMON.md

daemon validate --all --json
```

Key safety defaults:

- catalog reads default to `master` and support `--ref <sha|branch|tag>`;
- install copies only catalog-listed `DAEMON.md`, `scripts[]`, and `references[]` files from the same ref;
- install never copies `example.yml` or crawls upstream directories;
- install plans include destination paths and file modes (`100644`/`100755`);
- existing destination directories/files require `--force`;
- deprecated examples require `--allow-deprecated`;
- add/install/show always surface `adaptationsRequired[]` in JSON;
- show surfaces structured `adaptations[]`, and add/install render `{{adapt.key}}` tokens with string-only values before validation;
- scaffolding does not activate a daemon until the change is merged and ingested by Charlie.

See [Daemon catalog CLI](docs/daemon-cli.md) for command details, JSON envelope, validation semantics, and exit codes.

For release instructions, see [Releasing `@charlie-labs/daemons`](RELEASING.md).


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
