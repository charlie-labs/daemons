---
id: issue-labeler
purpose: Keep recently changed issues labeled according to the current label set on the configured issue platform and scope.
routines:
  - 'Survey recently created or updated issues on {{adapt.issue_platform}} inside {{adapt.issue_scope}}.'
  - Load available labels and the platform-specific metadata that explains whether and how they should be used.
  - Determine clearly supported missing labels from current label metadata and issue context.
  - Add unambiguous missing labels or post one compact repair proposal on the issue when label evidence conflicts.
deny:
  - Do not discover or select GitHub pull requests as issues, or add labels or post repair-proposal comments on pull requests, including pull requests returned by GitHub issue APIs or search queries.
  - Do not apply labels that selected-platform metadata marks inactive, deprecated, disabled, or clearly superseded.
  - Do not remove or replace existing labels.
  - Do not change issue lifecycle state, priority, assignee, project metadata, milestone, cycle, estimate, due date, title, or body.
  - Do not guess between two plausible labels in the same required label family.
  - Do not repeat the same repair proposal for an unchanged conflict.
schedule: '0 */4 * * *'
---

# Issue Labeler

## Platform and scope

The configured issue platform is `{{adapt.issue_platform}}`. The only supported values are exactly `GitHub Issues` and `Linear`. The configured issue scope is `{{adapt.issue_scope}}`. Read issues, mutate labels, and post repair proposals only on that platform and inside that scope. Do not search or require the other issue tracker. If the platform value is anything else, cannot be resolved, or lacks the access required for this work, no-op without comments or mutations.

Interpret the scope using selected-platform capabilities: a GitHub repository or an intentionally narrower repository query for GitHub Issues, and a Linear team, project, or intentionally bounded workspace query for Linear. If the configured scope cannot be resolved unambiguously, no-op.

For GitHub Issues, select only issues and explicitly filter out pull requests, including pull requests returned by GitHub issue APIs or search queries. Never mutate labels or post repair proposals on pull requests. This exclusion does not apply to Linear issues, and an explicitly linked pull request may be read only as supporting issue context when otherwise useful.

## Label discovery

At the start of each activation, load the current labels visible in the configured scope.

For GitHub Issues, use available label names, descriptions, and semantically meaningful colors plus documented and observed usage. GitHub does not provide Linear-style archived or deprecated label metadata; do not invent it. Treat a GitHub label as superseded only when its description, repository policy, or unambiguous current usage establishes that fact.

For Linear, use label names, descriptions, semantically meaningful colors, usage context, and archived, deprecated, disabled, or equivalent lifecycle metadata when the API exposes it. If a capability or metadata field is unavailable, skip that signal rather than treating absence as proof.

Treat the selected platform's live label set as the source of truth. Do not rely on a static taxonomy file. If label metadata is missing, stale, contradictory, or too sparse to choose a label confidently, no-op or post a repair proposal instead of mutating labels.

## Issue selection

Default scope within each activation:

- issues created or updated in the last 4 hours
- active issues only
- at most the configured repository, team, project, or narrower query

For GitHub Issues, active means open, and pull requests are never eligible for selection. For Linear, use workflow state type or category metadata when available and exclude completed, canceled, or another explicitly inactive state; do not assume Linear has only open and closed states. If reliable state metadata is unavailable, skip ambiguous issues.

Do not scan beyond the configured scope.

## Decision policy

Add a missing label when:

- the selected platform's live label metadata makes the label's meaning clear
- exactly one label in that family is supported by issue evidence
- available lifecycle metadata does not mark the label inactive or superseded
- applying it does not conflict with existing labels

Post a repair proposal instead of mutating when:

- multiple labels in one family could apply
- an existing label is demonstrably inactive or superseded
- existing labels conflict with live label metadata
- the issue body or title does not provide enough context

When the selected platform lacks a metadata capability needed for a decision, no-op on that decision rather than guessing.

## Repair proposal format

Use one concise comment on the affected issue:

```md
Label repair needed

Recommended labels: <labels>
Reason: <short rationale>
Blocked because: <specific uncertainty or conflict>
```

## Limits

- Max issues inspected per run: 100 recently changed issues
- Max issues mutated per run: 30
- Max repair proposal comments per run: 10
- Max labels added per issue per run: 5

## Idempotency

Never add duplicate labels. Re-running with unchanged issue data must produce no additional writes.

Use a conflict signature based on platform, issue ID, current label set, title/body hash, and the observed label metadata. Do not repeat the same repair proposal while that signature is unchanged.

## No-op when

- the configured issue platform or scope cannot be read
- the configured issue platform is not exactly `GitHub Issues` or `Linear`, cannot be resolved, or lacks required access
- live label metadata does not provide enough signal for confident labeling
- issue data is incomplete or lifecycle state is ambiguous
- no recently changed in-scope issues need labels
- the correct label cannot be selected with high confidence
