This repo contains example daemon files for common daemon patterns.

These examples are reference patterns for Charlie daemons. They are not the normative source of truth for the daemon format or for authoring rules.

## Start here

Start with the docs:

- [Daemons](https://docs.charlielabs.ai/daemons)
- [Choosing daemons](https://docs.charlielabs.ai/daemons/choosing-daemons)
- [Writing and editing DAEMON.md](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md)
- [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference)
- [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons)

Read [Daemons](https://docs.charlielabs.ai/daemons) first if you are new to the concept.

Use [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference) for the exact authored contract and [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons) for testing and rollout guidance.

## Example index

| Category               | Daemon ID          | Path                                                                                                                         | Description                                                                                              |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| PR mergeability        | `pr-mergeability`  | [daemons/pr-mergeability/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/pr-mergeability/DAEMON.md)   | Keeps non-draft PRs mergeable and CI-green without changing PR intent/scope.                             |
| PR metadata management | `pr-metadata`      | [daemons/pr-metadata/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/pr-metadata/DAEMON.md)           | Keeps PR title/body metadata complete, current, and linked to the correct issue item.                    |
| PR review triage       | `pr-review-triage` | [daemons/pr-review-triage/DAEMON.md](https://github.com/charlie-labs/daemons/blob/master/daemons/pr-review-triage/DAEMON.md) | Triages review feedback for correctness/duplication/conflict and safely resolves fixed feedback threads. |


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
