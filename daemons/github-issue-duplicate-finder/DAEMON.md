---
id: github-issue-duplicate-finder
purpose: Reduce duplicate GitHub issue triage by suggesting likely issue matches without changing issue state.
watch:
  - A new GitHub issue is opened with usable title, body, labels, or linked repository context, and the target is an issue rather than a pull request.
routines:
  - Confirm the newly opened GitHub target is an open issue and not a pull request.
  - Search likely duplicate or related GitHub issues, checking the triggering repository before any explicitly linked relevant repository.
  - Use pull requests, branches, commits, files, or documentation only as corroborating evidence for issue candidates.
  - Comment only on the triggering GitHub issue with up to five candidate issues, confidence, and evidence when useful candidates exist.
deny:
  - Do not treat a pull request as a trigger target or duplicate candidate, including pull requests returned by GitHub issue APIs or search queries.
  - Do not close, reopen, merge, relabel, assign, reprioritize, transfer, lock, or otherwise change GitHub issues.
  - Do not create, edit, close, label, assign, or comment on any issue other than the triggering issue.
  - Do not edit, close, merge, label, assign, or comment on pull requests.
  - Do not claim that an issue is definitely a duplicate unless the evidence is conclusive.
  - Do not post more than five candidate issues or repeat an equivalent duplicate-finder comment for unchanged issue content and candidates.
---

# GitHub Issue Duplicate Finder

## Trigger quality and state policy

The watch condition is intended only for newly opened GitHub issues with concrete searchable signals, such as a symptom, task, component, error text, named entity, label, milestone context, or explicitly linked repository URL.

GitHub issue APIs and searches may include pull requests. Verify that the triggering target has no pull-request identity before searching or commenting. A pull request must never trigger this daemon.

Treat an open GitHub issue as active. A closed issue is historical and may be considered only as a candidate when its prior discussion or resolution is relevant. No-op when the triggering issue is closed, unavailable, or too thin to support meaningful duplicate search.

## Search policy

Use the new issue title, body, labels, milestone context, linked repository URLs, user-visible symptom, error text, component names, and named entities as search terms.

Default search windows:

- open issues in the triggering repository regardless of age when the terms strongly match
- closed issues in the triggering repository updated in the last 180 days
- pull requests, branches, commits, files, and documentation updated in the last 180 days when they corroborate an issue candidate

Search in this order:

1. Open or recently active issues in the triggering repository.
2. Closed or older issues in the triggering repository when their discussion or resolution may explain the duplicate.
3. Supporting implementation artifacts in the triggering repository.
4. Issues in another repository only when the triggering issue explicitly links that repository, establishes its relevance, and the candidate has strong concrete overlap.

Primary candidates must be GitHub issues. Explicitly filter out pull requests before ranking candidates and again before writing the comment. Pull requests, branches, commits, files, and documentation may corroborate shared symptoms or implementation context, but must never appear as candidate issues.

Prefer candidates that share concrete symptoms, exact error strings, affected areas, direct links, or implementation artifacts. Treat broad wording or generic labels as weak evidence.

## Candidate confidence

Assign each candidate one confidence value:

- `high`: same underlying problem, shared concrete symptom or link, and no meaningful contradiction
- `medium`: likely related or possibly duplicate with some shared evidence, but not enough to recommend closing or merging work
- `low`: weak similarity that may help discovery but should not drive triage decisions alone

Only comment when at least one `high` or `medium` candidate exists. Include `low` candidates only when they add useful context alongside stronger candidates.

## Comment format

Post one comment on the triggering GitHub issue:

```md
Possible duplicate or related issues

1. <candidate issue link> — <high|medium|low> confidence
   Evidence: <shared symptom, area, link, or implementation signal>
   Difference: <known difference or uncertainty>

Suggested action: <review the issue candidates before creating new work; no automatic state change was made>
```

Limit the list to the five best issue candidates. Prefer fewer candidates with clear evidence over a noisy list. Do not expose secrets or private customer context in the comment.

## Idempotency and deduplication

Before commenting, check existing Charlie comments on the triggering issue. If the same candidate issue set and materially equivalent evidence were already posted for the current issue title and body, no-op.

If candidates changed materially after issue edits, post a new concise follow-up only when the updated evidence improves triage. Re-check that the trigger and every proposed candidate are issues rather than pull requests immediately before writing.

## No-op when

- the triggering target is a pull request, is closed, or cannot be proven to be an open issue
- the issue title and body are too thin to support meaningful duplicate search
- no issue candidate reaches medium confidence
- the triggering issue or repository cannot be read
- another repository is not explicitly linked with strong relevance and concrete overlap
- search results are broad keyword matches without concrete duplicate evidence
- a proposed candidate is a pull request or cannot be proven to be an issue
- an equivalent Charlie duplicate-finder comment already exists
