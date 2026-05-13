# Examples authoring guide

This guide is for authors and reviewers adding or editing example daemon packages in this repository.

The goal is to make every example easy to find, safe to publish, realistic enough to copy from, and explicit about what a customer must adapt.

## Required reading before authoring or review

Before adding or reviewing an example, read the relevant Charlie daemon docs first. Treat this as a review requirement, not optional background: if an example conflicts with these docs, fix the example or explain why the docs should change.

Read these pages before continuing through this guide:

- [Examples v2 package and catalog spec](./examples-spec.md) for the repo-owned package/catalog contract.
- [Daemons overview](https://docs.charlielabs.ai/daemons) for what daemons are, the wake model, and how `DAEMON.md` controls behavior.
- [Choosing daemons](https://docs.charlielabs.ai/daemons/choosing-daemons) for deciding whether the customer job is a daemon candidate rather than a one-off Charlie task.
- [Writing and editing `DAEMON.md`](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md) for authoring narrow, explicit, repeatable daemon behavior.
- [`DAEMON.md` reference](https://docs.charlielabs.ai/daemons/daemon-md-reference) for the exact authored file contract, field names, validation rules, and support-tree semantics.
- [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons) for rollout, containment, observability, and verification guidance.

Then use the rest of this guide to align the example package, catalog metadata, support files, and public-safety notes with those docs.

## When to add an example

Start from a customer job-to-be-done, not from an integration demo or clever automation idea. Every example should map to at least one approved `fit.jobsToBeDone` slug. If the customer job is unclear, the example is probably not ready for the public catalog.

Add or keep an example when it shows a reusable daemon pattern that is clearer as source than as prose alone.

Good examples usually have:

- a recurring job with clear ownership;
- a narrow role that is explainable in one sentence;
- a bounded wake model (`watch`, `schedule`, or both);
- small activations with reviewable output on native surfaces;
- concrete routines and deny rules;
- clear integration requirements;
- a useful fit boundary: who it is for and who it is not for;
- public-safe support material that makes adaptation easier.

Do not add an example for:

- one-off tasks;
- vague maintenance wishes without a decision policy;
- workflows that require hidden internal context to understand;
- customer-specific process that cannot be generalized safely;
- broad roles where every activation requires judgment outside the authored policy;
- behavior that would be unsafe to recommend publicly.

## Adaptation, risk, and platform boundaries

Public examples look copyable, but target repos vary by integrations, conventions, permissions, commands, source-of-truth systems, output preferences, existing automation, scale, and tolerance for noise. Make those assumptions visible in `requirements`, `adaptation.mustCustomize`, support files, or `DAEMON.md` runtime policy.

High-risk examples are allowed when they address real operational burden, but author them intentionally. High-risk does not mean "opens a PR touching important code"; reviewable artifacts are usually low operational risk because humans can close, ignore, or revert them. High-risk means the daemon could interfere with human workflows or take actions that are hard or annoying to reverse, such as mutating production state, deleting resources, force-pushing over human changes, closing or reprioritizing many issues, changing production flags, or posting noisy output across surfaces.

For high-risk examples:

- require evidence before consequential claims or writes;
- prefer reviewable artifacts over direct mutation;
- keep scope narrow;
- include strong no-op behavior for ambiguity;
- deny nearby risky shortcuts;
- make visible output easy to review.

If a platform changes the daemon's source of truth, routines, output surface, or required permissions, prefer a separate example instead of hiding branches inside one daemon. `requirements.optionalIntegrations` means the daemon can still perform its core role without that integration; it must not encode one-of-many required alternatives.

Do not imply unsupported event wakes. Today, GitHub-native events are the best fit for `watch`; use `schedule` for surveys, reconciliation, reports, or sources without a supported event wake.

## Authoring workflow

### 1. Pick the pattern and ID

Choose a stable, descriptive, kebab-case ID.

Good IDs:

- `docs-drift-maintainer`
- `github-activity-digest`
- `linear-issue-labeler`

Avoid IDs that are:

- customer-specific;
- tied to temporary project names;
- too broad, such as `repo-helper`;
- too implementation-specific, such as `cron-slack-v2`.

The ID must match all three places:

- `daemons/<id>/`
- `daemons/<id>/example.yml`
- `daemons/<id>/DAEMON.md` frontmatter

Treat renames as breaking. If an example's recommendation changes substantially, consider creating a new example or marking the old one `deprecated`.

### 2. Create the package

Use this shape:

```text
daemons/<id>/
  DAEMON.md
  example.yml
  scripts/**      # optional
  references/**   # optional
```

Keep package contents small. Do not add a package-local `README.md`, screenshots, private source notes, or unrelated sample files.

### 3. Write `DAEMON.md`

Write the daemon file as if a customer might copy it after reading the catalog metadata.

A strong example `DAEMON.md` has:

- a purpose that states the outcome, not just the mechanism;
- wake conditions that are specific enough to avoid noise;
- routines that describe bounded work Charlie can actually perform;
- deny rules for adjacent risky behavior;
- body guidance only where it improves runtime decisions;
- public-safe placeholders for customer-specific values;
- a non-empty body with policy, limits, or verification guidance.

At least one activation path is required:

- use `watch` for event-driven work;
- use `schedule` for recurring surveys, reports, or maintenance windows;
- use both only when the daemon has both event-driven and scheduled responsibilities.

Avoid:

- invented frontmatter fields;
- catalog metadata in `DAEMON.md`;
- rollout instructions, validation checklists, setup tutorials, or catalog presentation notes in `DAEMON.md`;
- copying stale metadata such as `readiness`, `showOnWebsite`, or `bestFor` into frontmatter;
- long generic filler that does not change behavior;
- body headings that imply schema beyond the public docs.

### 4. Write `example.yml`

`example.yml` explains how the example should be discovered, evaluated, and adapted.

Use this template:

```yaml
id: example-id
title: Example Display Title
status: ready
summary: One sentence explaining the outcome this daemon provides.
readiness: adapt-before-use
showOnWebsite: true
showInDashboard: true
fit:
  jobsToBeDone:
    - operate
  bestFor:
    - Teams with a recurring need this daemon can address safely.
  notFor:
    - Teams where the required decision authority is unclear.
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations: []
  other:
    - A repo-local command or policy this daemon relies on.
adaptation:
  mustCustomize:
    - Replace placeholder paths, scopes, thresholds, and output destinations.
```

#### Summary

Write `summary` as a concise outcome statement.

Good:

- `Posts a low-noise scheduled digest of meaningful pull request and CI activity.`

Weak:

- `Uses GitHub and Slack to make a report.`

#### Jobs to be done

Choose the smallest accurate set from the allowed values:

- `maintain-and-modernize`
- `organize`
- `document`
- `review-with-confidence`
- `build-production-grade-typescript`
- `operate`
- `explain`
- `plan`
- `daemon-operations`

Do not add new job strings without updating the schema, tests, generated catalog, and spec.

#### Fit copy

Use `fit.bestFor` for positive matching criteria:

- repo or team conditions;
- volume or recurrence signals;
- ownership expectations;
- review or routing needs.

Use `fit.notFor` to prevent over-application:

- cases requiring human judgment outside Charlie's authority;
- workflows too low-volume for a daemon;
- teams without the required policy or taxonomy;
- scenarios where a one-off task is safer.

#### Requirements

Put integration requirements in `requiredIntegrations` or `optionalIntegrations`.

List an integration as optional only when the daemon can still perform its core role without it. Do not use `optionalIntegrations` to encode required alternatives such as "GitHub or Linear"; if the source-of-truth platform changes daemon behavior, create platform-specific examples.

Allowed integration values are:

- `github`
- `linear`
- `slack`
- `sentry`

Put everything else in `requirements.other`, such as:

- a documented label taxonomy;
- known repository paths;
- verification commands;
- destination channel conventions;
- branch, title, or label conventions;
- signal thresholds or routing rules.

#### Readiness and adaptation

Most examples should use `adapt-before-use` because customer repos differ.

Use `adapt-before-use` when a customer must change any of the following before use:

- path globs;
- issue/team/project scope;
- Slack channel or thread destinations;
- labels, states, milestones, owners, or review conventions;
- install, test, lint, or generation commands;
- thresholds, schedules, or quiet-hours policies;
- support script assumptions.

Use `direct-copy` only when no required customization is declared. Even then, reviewers should verify that the daemon is safe, useful, and accurate for the target repo before use.

Use `adaptation.mustCustomize` for concrete local decisions, replacements, or confirmations. Do not use it for generic warnings, rollout steps, validation checklists, or process advice such as "verify that it works" or "watch the first few activations." Those belong in general daemon rollout docs, not package metadata.

### 5. Add support files only when they help

Use `scripts/**` for reusable helper scripts that are part of the example.

Use `references/**` for reusable public-safe material, such as:

- templates;
- rubrics;
- taxonomies;
- adaptation notes;
- example output formats.

Support files should be small, clearly named, and reusable outside the original authoring context.

Rules to remember:

- nested files are allowed;
- paths are sorted in `examples.json`;
- support paths must stay under `scripts/` or `references/`;
- support scripts with shebangs must be executable;
- support content must be public-safe.

### 6. Generate and validate the catalog

Before opening a PR, run:

```bash
bun install --frozen-lockfile --registry https://registry.npmjs.org/
bun run typecheck
bun run test
bun run generate:examples
bun run validate:examples
git diff --exit-code examples.json
```

If `bun run generate:examples` changes `examples.json`, commit that change with the package edits.

## Editing existing examples

When editing an example, first decide what kind of change it is.

| Change type | Guidance |
| --- | --- |
| Copy improvement | Keep the ID. Tighten `summary`, `bestFor`, `notFor`, or `mustCustomize`. |
| DAEMON.md behavior refinement | Keep the ID if the core pattern is the same. Update fit/adaptation if expectations changed. |
| Support file update | Keep the ID. Re-run generation and validation. |
| Surface change | Update `showOnWebsite` or `showInDashboard`; do not imply this changes safety. |
| Deprecated pattern | Set `status: deprecated`, usually hide public surfaces, and explain replacement guidance in fit/adaptation when useful. |
| New pattern using similar ingredients | Prefer a new package ID instead of changing the old example's identity. |

Avoid broad rewrites when a targeted edit would fix the issue. The public writing guide's edit-mode advice applies here too: diagnose the failure mode, then adjust the smallest useful part.

## Anti-patterns

Avoid these common failures:

- One example tries to cover multiple platforms with hidden branching.
- `example.yml` becomes a configuration language.
- `DAEMON.md` contains setup, tutorial, rollout, checklist, or catalog metadata.
- `mustCustomize` contains rollout or verification instructions instead of local decisions.
- Optional integrations are used to encode required alternatives.
- The daemon assumes unsupported non-GitHub event wakes.
- The daemon requires production secrets or mutating infra commands to be useful.
- The daemon mostly produces noise or restates known information.
- The daemon is so broad that every activation requires judgment outside its authored policy.

## Review checklist

Use this checklist before approving example changes.

### Package layout

- The package is under `daemons/<id>/`.
- `DAEMON.md` and `example.yml` exist.
- Optional files are only under `scripts/**` or `references/**`.
- There is no per-example `README.md`.
- The package does not include unrelated artifacts.

### Identity

- Directory name, `example.yml` `id`, and `DAEMON.md` frontmatter `id` all match.
- The ID is kebab-case and stable.
- The PR is not silently repurposing an existing ID for a different daemon pattern.

### `DAEMON.md`

- Purpose is outcome-oriented.
- At least one activation path is present.
- Watch conditions and schedules are specific enough for safe wake behavior.
- Routines are bounded and actionable.
- Deny rules cover adjacent risky actions.
- Body guidance adds useful policy, limits, verification, target selection, or output guidance.
- No catalog-only fields are in frontmatter.
- The body is non-empty and public-safe.

### `example.yml`

- `status` accurately reflects recommendation state.
- `summary` is concise and outcome-focused.
- `jobsToBeDone` uses only schema-approved values.
- `bestFor` and `notFor` help readers decide quickly.
- Required and optional integrations are accurate.
- `requirements.other` names non-integration prerequisites.
- `readiness` matches `adaptation.mustCustomize`.
- Surface flags are intentional.

### Support files

- Every support file is reusable and part of the pattern.
- Scripts with shebangs are executable.
- References do not depend on private context.
- Paths are normalized and package-relative.

### Public safety

- No secrets, tokens, private keys, or credential assignments.
- No private issue, chat, customer, staging, or internal URLs.
- No local machine paths.
- No customer-specific facts that should not be published.
- Placeholders are clearly placeholders.

### Catalog and checks

- `examples.json` was regenerated if package inputs changed.
- `bun run validate:examples` passes.
- `git diff --exit-code examples.json` passes after generation.
- Tests and typecheck pass unless the PR clearly documents a temporary blocker.

## Troubleshooting validation failures

| Symptom | Likely fix |
| --- | --- |
| ID mismatch | Make directory name, `example.yml` `id`, and `DAEMON.md` `id` identical. |
| Unknown key | Remove the field or update the schema and docs intentionally. |
| Stale metadata field | Move catalog metadata from `DAEMON.md` to `example.yml`. |
| Missing activation path | Add `watch`, `schedule`, or both. |
| Invalid schedule | Use a five-field UTC cron expression. |
| Direct-copy adaptation error | Empty `adaptation.mustCustomize` or change readiness to `adapt-before-use`. |
| Adapt-before-use adaptation error | Add at least one concrete customization. |
| Unsupported support path | Move the file under `scripts/**` or `references/**`, or remove it. |
| Shebang script failure | Make the script executable or remove the shebang. |
| Public-safety failure | Replace private or credential-like content with public-safe placeholders. |
| Catalog drift | Run `bun run generate:examples` and commit `examples.json`. |

## Quality bar

A good example should let a reader answer these questions without reading validation code:

1. What recurring job does this daemon perform?
2. What wakes it, and how often should it act?
3. What integrations and local policies does it require?
4. Who should use this pattern?
5. Who should avoid it?
6. What must be customized before use?
7. What is Charlie explicitly not allowed to do?
8. How can a reviewer verify that the example and catalog stayed in sync?
