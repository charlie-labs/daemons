---
id: linear-issue-duplicate-finder
purpose: Reduce duplicate Linear issue triage by suggesting likely matches without changing issue state.
watch:
  - A Linear issue is created in a team mapped to this repository.
routines:
  - Skip the new issue when it is already completed, canceled, or otherwise inactive.
  - Search likely duplicate or related Linear issues, checking the same Linear team before broader mapped repository context.
  - Search linked GitHub work for corroborating pull requests, issues, branches, or commits.
  - Comment on the triggering Linear issue with up to five candidate matches, confidence, and evidence when useful candidates exist.
deny:
  - Do not close, merge, cancel, archive, relabel, reassign, reprioritize, or otherwise mutate Linear issues.
  - Do not edit, close, label, assign, or comment on GitHub issues or pull requests.
  - Do not claim that an issue is definitely duplicate unless the evidence is conclusive.
  - Do not post more than five candidate duplicate or related items.
  - Do not repeat an equivalent duplicate-finder comment for unchanged issue content and candidates.
---

# Linear Issue Duplicate Finder

## State gate

Inspect the triggering issue before searching. No-op when the issue state is completed, canceled, archived, or otherwise clearly inactive.

Do not infer state from state name alone when Linear exposes a state type. Prefer Linear state type metadata when available.

## Search policy

Use the new issue title, description, labels, project, team, linked GitHub URLs, customer-facing symptom, error text, component names, and named entities as search terms.

Default search windows:

- open Linear issues regardless of age when the terms strongly match
- completed, canceled, or archived Linear issues updated in the last 180 days
- linked GitHub pull requests, issues, branches, and commits updated in the last 180 days

Search in this order:

1. Open or recently active issues in the same Linear team.
2. Older same-team issues, including completed issues when their resolution may explain the duplicate.
3. Linked GitHub pull requests, issues, branches, and commits in the mapped repository.
4. Issues in other Linear teams mapped to the same repository when terms strongly overlap.

Prefer candidates that share concrete symptoms, error strings, product areas, GitHub links, or implementation artifacts. Treat broad wording or generic labels as weak evidence. Exclude completed, canceled, or archived issues as trigger targets, but allow them as candidate evidence when they may explain prior duplicate handling.

## Candidate confidence

Assign each candidate one confidence value:

- `high`: same underlying problem, shared concrete symptom or link, and no meaningful contradiction
- `medium`: likely related or possibly duplicate with some shared evidence, but not enough to recommend merging
- `low`: weak similarity that may help discovery but should not drive triage decisions alone

Only comment when at least one `high` or `medium` candidate exists. Include `low` candidates only when they add useful context alongside stronger candidates.

## Comment format

Post one Linear issue comment on the triggering issue:

```md
Possible duplicate or related issues

1. <candidate link> — <high|medium|low> confidence
   Evidence: <shared symptom, area, GitHub link, or implementation signal>
   Difference: <known difference or uncertainty>

Suggested action: <review candidates before creating new work; no automatic state change was made>
```

Limit the list to the five best candidates. Prefer fewer candidates with clear evidence over a noisy list.

## Idempotency

Before commenting, check existing Charlie comments on the issue. If the same candidate set and evidence were already posted for the current issue title/body, no-op.

If candidates changed materially after issue edits, post a new concise follow-up only when the updated evidence improves triage.

## No-op when

- the triggering issue is completed, canceled, archived, or inactive
- no candidate reaches medium confidence
- issue identity or mapped repository context is unavailable
- search results are broad keyword matches without concrete duplicate evidence
- an equivalent Charlie duplicate-finder comment already exists
