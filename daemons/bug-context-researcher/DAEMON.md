---
id: bug-context-researcher
purpose: Help teams triage likely bugs by adding concise issue and repository context on the configured issue platform.
watch:
  - 'An issue is created on {{adapt.issue_platform}} with observable bug or regression signals.'
routines:
  - Decide whether the new issue is a likely bug or regression from its labels and text.
  - Research recent related issues on the configured issue platform and available repository evidence.
  - Post one concise triage comment on the triggering issue when useful context or missing reproduction details are found.
deny:
  - Do not act on issues that are not clearly bugs or regressions.
  - Do not change issue fields, labels, lifecycle state, assignees, priority, project metadata, milestone, cycle, estimate, due date, title, or description.
  - Do not create, edit, close, label, assign, or comment on any issue other than the triggering issue.
  - Do not create, edit, close, merge, label, assign, or comment on pull requests.
  - Do not post more than five useful links in one triage comment.
  - Do not repeat an equivalent triage comment for unchanged issue content and search results.
---

# Bug Context Researcher

## Platform policy

The configured issue platform is `{{adapt.issue_platform}}`. The only supported values are exactly `GitHub Issues` and `Linear`. Operate only on that platform for issue discovery and issue comments. Treat the triggering issue as the source of truth for the symptom and affected area. If the platform value is anything else, cannot be resolved, or lacks the access required for this work, no-op without comments or mutations.

For GitHub Issues, keep issue searches within the triggering repository unless the issue explicitly links another relevant repository. For Linear, search the triggering team first and expand to another mapped team only when the issue names the same component, error, or repository.

GitHub pull requests, commits, files, and documentation may be used as supporting evidence when repository access is available. Their absence must not block issue-platform research or commenting. Do not search or require the other issue tracker.

## Bug signals

Treat an issue as in scope when at least one of these signals is present:

- a label named `Bug`, `bug`, or an equivalent bug/regression label
- title or description language such as bug, regression, broken, crash, error, exception, failing, failure, expected versus actual, repro, stack trace, or previously worked
- screenshots, logs, stack traces, or reproduction steps describing behavior that should work but does not

No-op silently when the issue appears to be a feature request, task, question, planning note, support handoff without a defect, or any other non-bug item.

## Research policy

Derive search terms from the title, labels, component names, error text, stack frames, linked repository URLs, and concrete nouns in the issue body.

Search in this order:

1. Related issues on the configured platform in the triggering repository or team from the last 180 days.
2. Related issues in an explicitly linked or mapped nearby scope when the issue text names the same component or error.
3. Recent pull requests from the last 30 days when repository evidence is available.
4. Commits, files, or documentation only when they directly explain the symptom, ownership, or likely changed area.

Prefer fresh, specific evidence over broad matches. At most five total links may appear in the comment. Use fewer links when fewer are useful.

## Comment format

Post one comment on the triggering issue only when it adds useful triage value. Keep it concise and use this shape:

```md
**Bug triage context**

Related items: <0-2 most relevant issue or repository links with one-line relevance>
Recent changes: <0-2 recent pull requests or commits that may matter>
Suspicious areas: <files, modules, services, or ownership clues with evidence>
Missing repro details: <specific details needed, if any>
```

Omit empty sections. Do not include raw log dumps, long search transcripts, or speculative blame. Phrase findings as evidence and uncertainty, not final root cause, unless the root cause is directly proven.

## Idempotency

Before commenting, inspect existing Charlie comments on the triggering issue. If an equivalent `Bug triage context` comment already covers the same issue content and search results, no-op.

If the issue changed materially and a fresh comment would reduce triage work, post one new concise follow-up rather than repeating the original content.

## No-op when

- the issue is not clearly a bug or regression
- the configured issue platform cannot be read or the triggering issue is unavailable
- the configured issue platform is not exactly `GitHub Issues` or `Linear`, cannot be resolved, or lacks required access
- no related context is found and no specific reproduction detail is missing
- search results are too weak or ambiguous to be useful
- an equivalent Charlie triage comment already exists
