---
id: linear-issue-labeler
purpose: Keep recently changed Linear issues labeled according to the current Linear label set.
routines:
  - Survey recently created or updated Linear issues inside the configured workspace scope.
  - Load available Linear labels, including names, descriptions, archived/deprecated status when exposed, and usage context.
  - Determine clearly supported missing labels from current Linear label metadata and issue context.
  - Add unambiguous missing labels or post one compact repair proposal when label evidence conflicts.
deny:
  - Do not apply archived, deprecated, disabled, or clearly superseded labels.
  - Do not remove or replace existing labels.
  - Do not change issue status, priority, assignee, project, cycle, estimate, due date, or body.
  - Do not guess between two plausible labels in the same required label family.
  - Do not repeat the same repair proposal for an unchanged conflict.
schedule: '0 */4 * * *'
---

# Issue Label Hygiene Helper

## Label discovery

At the start of each activation, load the current Linear labels visible to the workspace or mapped team. Use label names, descriptions, colors only when semantically meaningful, archived/deprecated markers, existing issue usage, and nearby issue context to infer how labels should be applied.

Treat the live Linear label set as the source of truth. Do not rely on a static taxonomy file. If label metadata is missing, stale, contradictory, or too sparse to choose a label confidently, no-op or post a repair proposal instead of mutating labels.

## Scope

Default scope:

- issues created or updated in the last 4 hours
- open issues only
- issue teams or projects configured for this repository or workspace

Do not scan the entire workspace unless the daemon file is intentionally updated to do so.

## Decision policy

Add a missing label when:

- the live Linear label metadata makes the label's meaning clear
- exactly one label in that family is supported by issue evidence
- the label is current, not deprecated
- applying it does not conflict with existing labels

Post a repair proposal instead of mutating when:

- multiple labels in one family could apply
- an issue has deprecated labels
- existing labels conflict with live label metadata
- the issue body or title does not provide enough context

## Repair proposal format

Use one concise issue comment:

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

Use a conflict signature based on issue ID, current label set, title/body hash, and the observed label metadata. Do not repeat the same repair proposal while that signature is unchanged.

## No-op when

- live Linear label metadata cannot be read
- label names and descriptions do not provide enough signal for confident labeling
- Linear issue data is incomplete
- no recently changed in-scope issues need labels
- the correct label cannot be selected with high confidence
