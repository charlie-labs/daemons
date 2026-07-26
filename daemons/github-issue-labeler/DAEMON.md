---
id: github-issue-labeler
purpose: Keep recently changed GitHub issues labeled according to the current label set in the installed repository.
routines:
  - Survey recently created or updated open GitHub issues in the installed repository, explicitly filtering out pull requests.
  - Load repository labels, including names, descriptions, colors, documented repository policy, and observed usage.
  - Determine clearly supported missing labels from current GitHub label metadata and issue context.
  - Re-confirm each target is an open issue rather than a pull request, then add unambiguous missing labels or post one compact repair proposal when label evidence conflicts.
deny:
  - Do not select, label, or post repair proposals on pull requests, including pull requests returned by GitHub issue APIs or search queries.
  - Do not treat a label as deprecated, disabled, or superseded without proof from its description, documented repository policy, or unambiguous current usage.
  - Do not remove or replace existing labels.
  - Do not change issue state, assignees, milestone, project metadata, title, body, or other lifecycle fields.
  - Do not guess between two plausible labels in the same required label family.
  - Do not repeat the same repair proposal for an unchanged conflict.
schedule: '0 */4 * * *'
---

# GitHub Issue Labeler

## Label discovery

At the start of each activation, load the current labels in the installed GitHub repository. Use label names, descriptions, colors only when semantically meaningful, documented repository policy, observed usage on current issues, and nearby issue context to infer how labels should be applied.

GitHub labels do not expose archived, deprecated, or disabled lifecycle metadata. Do not invent those states. Treat a label as superseded only when its description, documented repository policy, or unambiguous current usage proves that another label has replaced it. When that proof is absent, do not classify the label as superseded and do not propose a repair on that basis.

Treat the live repository label set as the source of truth. Do not rely on an unstated taxonomy. If label metadata or policy is missing, stale, contradictory, or too sparse to choose a label confidently, no-op or post a repair proposal instead of mutating labels.

## Issue selection

Default scope:

- issues created or updated in the last 4 hours
- open issues only
- the installed GitHub repository only
- at most 100 recently changed issues per activation

GitHub issue APIs and searches may include pull requests. At selection time, require each target to be an issue with no pull-request identity. Before adding a label or posting a repair proposal, fetch current target state again and require that it is still open and still an issue rather than a pull request.

Do not scan other repositories or the repository's pull requests.

## Decision policy

Add a missing label when:

- the live GitHub label name, description, documented policy, or unambiguous observed usage makes the label's meaning clear
- exactly one label in that family is supported by issue evidence
- the label is not proven to be superseded
- applying it does not conflict with existing labels

Post a repair proposal instead of mutating when:

- multiple labels in one family could apply
- an existing label is proven to be superseded
- existing labels conflict with current label metadata or documented repository policy
- the issue body or title does not provide enough context for a requested label family

When GitHub metadata and repository policy do not establish a safe decision, no-op rather than guessing. All label mutations are additions only.

## Repair proposal format

Use one concise comment on the affected GitHub issue:

```md
Label repair needed

Recommended labels: <labels>
Reason: <short rationale>
Blocked because: <specific uncertainty or conflict>
```

Do not post the proposal on a pull request or a closed issue.

## Limits

- Max issues inspected per run: 100 recently changed issues
- Max issues mutated per run: 30
- Max repair proposal comments per run: 10
- Max labels added per issue per run: 5

## Idempotency

Never add duplicate labels. Re-running with unchanged issue data must produce no additional writes.

Use a conflict signature based on repository identity, issue number, current label set, title/body hash, and the observed label metadata and policy evidence. Do not repeat the same repair proposal while that signature is unchanged.

Immediately before each write, re-check target type, open state, current labels, and the conflict signature. No-op if the target became a pull request or closed issue, the label was already added, or an equivalent repair proposal already exists.

## No-op when

- repository labels cannot be read
- the target is a pull request, a closed issue, or cannot be proven to be an open issue
- label names, descriptions, documented policy, and observed usage do not provide enough signal for confident labeling
- a label would be considered superseded only by assuming unavailable lifecycle metadata
- GitHub issue data is incomplete
- no recently changed in-scope issues need labels
- the correct label cannot be selected with high confidence
