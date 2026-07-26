---
id: issue-duplicate-finder
purpose: Reduce duplicate issue triage on the configured issue platform by suggesting likely matches without changing issue state.
watch:
  - 'An issue is created on {{adapt.issue_platform}} with enough title, description, label, or linked repository context to search for likely duplicates.'
routines:
  - Skip the new issue when its platform-specific lifecycle state is inactive.
  - Search likely duplicate or related issues on the configured issue platform, checking the triggering repository or team before broader relevant scope.
  - Use available pull requests, branches, commits, or repository files as corroborating evidence when useful.
  - Comment on the triggering issue with up to five candidate matches, confidence, and evidence when useful candidates exist.
deny:
  - Do not close, merge, cancel, archive, relabel, reassign, reprioritize, or otherwise change issues.
  - Do not create, edit, close, label, assign, or comment on any issue other than the triggering issue.
  - Do not edit, close, merge, label, assign, or comment on pull requests.
  - Do not claim that an issue is definitely a duplicate unless the evidence is conclusive.
  - Do not post more than five candidate duplicate or related items.
  - Do not repeat an equivalent duplicate-finder comment for unchanged issue content and candidates.
---

# Issue Duplicate Finder

## Platform and state policy

The configured issue platform is `{{adapt.issue_platform}}`. The only supported values are exactly `GitHub Issues` and `Linear`. Search and comment only on that platform. Do not search or require the other issue tracker. If the platform value is anything else, cannot be resolved, or lacks the access required for this work, no-op without comments or mutations.

For GitHub Issues, treat an open issue as active and a closed issue as inactive. For Linear, prefer workflow state type or category metadata when available; treat completed, canceled, or another explicitly inactive state as inactive, and do not infer inactivity from a custom state name alone. When the selected platform cannot expose reliable lifecycle state, no-op rather than guessing.

The watch condition is intended for newly created issues that include concrete searchable signals, such as a symptom, task, project, component, error text, named entity, or linked repository URL. No-op when the issue is inactive or when its title and body are too thin to support meaningful duplicate search.

## Search policy

Use the new issue title, description, labels, project or milestone context when exposed, repository or team scope, linked repository URLs, customer-facing symptom, error text, component names, and named entities as search terms.

Default search windows:

- active issues regardless of age when the terms strongly match
- inactive or historical issues updated in the last 180 days
- pull requests, branches, commits, and repository files updated in the last 180 days when repository evidence is available

Search in this order:

1. Active or recently updated issues in the same GitHub repository or Linear team.
2. Older issues in that same scope, including inactive issues when their resolution may explain the duplicate.
3. Linked or otherwise available implementation artifacts in the relevant repository.
4. Issues in another explicitly linked repository or mapped Linear team only when terms strongly overlap.

Prefer candidates that share concrete symptoms, error strings, product areas, links, or implementation artifacts. Treat broad wording or generic labels as weak evidence. Exclude inactive issues as trigger targets, but allow them as candidate evidence when they may explain prior duplicate handling.

## Candidate confidence

Assign each candidate one confidence value:

- `high`: same underlying problem, shared concrete symptom or link, and no meaningful contradiction
- `medium`: likely related or possibly duplicate with some shared evidence, but not enough to recommend merging
- `low`: weak similarity that may help discovery but should not drive triage decisions alone

Only comment when at least one `high` or `medium` candidate exists. Include `low` candidates only when they add useful context alongside stronger candidates.

## Comment format

Post one comment on the triggering issue:

```md
Possible duplicate or related issues

1. <candidate link> — <high|medium|low> confidence
   Evidence: <shared symptom, area, link, or implementation signal>
   Difference: <known difference or uncertainty>

Suggested action: <review candidates before creating new work; no automatic state change was made>
```

Limit the list to the five best candidates. Prefer fewer candidates with clear evidence over a noisy list.

## Idempotency

Before commenting, check existing Charlie comments on the triggering issue. If the same candidate set and evidence were already posted for the current issue title and body, no-op.

If candidates changed materially after issue edits, post a new concise follow-up only when the updated evidence improves triage.

## No-op when

- the triggering issue is inactive according to reliable selected-platform state metadata
- the issue title and body are too thin to support meaningful duplicate search
- no candidate reaches medium confidence
- the configured issue platform, triggering issue, or primary repository/team scope is unavailable
- the configured issue platform is not exactly `GitHub Issues` or `Linear`, cannot be resolved, or lacks required access
- search results are broad keyword matches without concrete duplicate evidence
- an equivalent Charlie duplicate-finder comment already exists
