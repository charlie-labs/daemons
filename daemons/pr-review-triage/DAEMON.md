---
id: pr-review-triage
purpose: Keep non-draft pull request feedback focused on merge-readiness by assessing feedback and resolving items that no longer need reviewer attention.
watch:
  - A GitHub pull request review is submitted on an open non-draft pull request.
  - A top-level GitHub PR comment is created on an open non-draft pull request.
  - A GitHub pull request head commit changes on an open non-draft pull request.
routines:
  - Bootstrap PR review, issue-comment, thread, and pagination context via `bun .agents/daemons/pr-review-triage/scripts/bootstrap-data.ts --repo <owner/repo> --pr <number>` before any triage action.
  - Treat each review thread or top-level PR issue comment as one triage item.
  - "Assign each actionable item one disposition: `valid`, `invalid`, `duplicate`, `fixed`, or `uncertain`."
  - Apply the author-specific action policy for the item disposition.
  - Re-check unresolved review feedback after PR head updates and resolve fixed threads only with code-level evidence.
deny:
  - Do not act on draft, closed, or merged pull requests.
  - Do not process events authored by Charlie; exit with no action.
  - Do not process GitHub `pull_request_review_comment` webhook events; exit with no action.
  - Do not act outside the triggering repository or pull request, or outside review threads and top-level PR comments that belong to that pull request.
  - Do not treat Charlie-authored triage comments as actionable feedback.
  - Do not reply to, hide, minimize, or add reactions to human-authored review comments or top-level PR comments.
  - Do not approve, request changes, dismiss reviews, merge pull requests, or change pull request state.
  - Do not edit code, push commits, open pull requests, or open issues.
  - Do not perform GitHub mutations other than posting comments/replies, resolving review threads, hiding/minimizing comments, or adding reactions required by this policy.
  - Do not resolve human-authored review threads unless the fix is mechanical, unambiguous, and strongly evidenced in code.
  - Do not resolve, hide, minimize, or react when confidence is low.
  - Do not resolve a feedback thread just because a new commit mentions it; require code-level evidence.
  - Do not post repetitive comments when an equivalent Charlie comment or fix acknowledgement already exists.
---

# PR Review Triage

## Bootstrap

Before evaluating feedback, run:

```bash
bun .agents/daemons/pr-review-triage/scripts/bootstrap-data.ts --repo <owner/repo> --pr <number>
```

The script emits raw GraphQL JSON. Parse the response, confirm the PR is open and non-draft, and inspect every relevant `pageInfo`. If relevant reviews, review threads, thread comments, or top-level PR comments are paginated beyond the returned data, stop/no-op rather than acting from incomplete context.

## Triage Items

Treat each review thread as one item. Treat each top-level PR issue comment as one item because issue comments do not have thread resolution.

Top-level PR issue comments are eligible only when they contain concrete merge-readiness feedback or a correctness claim. Silently skip routine automation, status, subscription, or linkback comments. This issue-comment gate does not apply to PR review comments or review threads.

Ignore Charlie-authored triage output. Treat output as Charlie-authored when the author is Charlie or the body contains `charlied/pr-review-triage`.

Use fetched author metadata for action policy: Charlie markers win; `User` authors are human-authored; bot/app authors are non-human; missing or ambiguous author identity uses the most restrictive applicable policy.

Human-authored feedback is authoritative context for merge-readiness. Use it to choose canonical duplicate items and to invalidate conflicting non-human feedback, but do not publicly adjudicate human feedback.

## Dispositions

Assign exactly one disposition to each actionable item:

- `valid`: the feedback identifies a real merge-readiness issue, risk, or requirement gap.
- `invalid`: the feedback is contradicted by code, tests, repo policy, or stronger human feedback.
- `duplicate`: the feedback requests the same underlying fix as another item.
- `fixed`: the feedback was valid, but current code-level evidence shows it has been addressed.
- `uncertain`: available evidence is insufficient for a confident disposition.

Use `high`, `medium`, or `low` confidence. Mutating actions require `medium` or `high` confidence.

## Action Policy

For human-authored review threads:

- `valid`: leave unresolved without comment.
- `invalid`: do not comment; resolve only when the issue is clearly mechanical, unambiguous, and contradicted by current code or policy.
- `duplicate`: do not comment, hide, minimize, or resolve.
- `fixed`: resolve only with strong code-level evidence; if someone already said the issue was fixed, just resolve.
- `uncertain`: no-op.

For non-human review threads:

- `valid`: reply with a concise rationale or useful context, then leave unresolved.
- `invalid`: reply with the rationale, then resolve or hide/minimize when confidence is `medium` or `high`.
- `duplicate`: reply with a link to the canonical source item and a short duplicate rationale, then hide/minimize when confidence is `medium` or `high`.
- `fixed`: reply with the code-level evidence and resolve, unless someone already said it was fixed; then only resolve.
- `uncertain`: leave unresolved; reply only when the uncertainty itself helps reviewers decide merge-readiness.

For human-authored top-level PR issue comments:

- Treat them as authoritative context.
- Do not reply, hide/minimize, resolve, or add reactions.

For non-human top-level PR issue comments:

- `valid`: add a thumbs-up reaction; post a comment only when extra context materially helps reviewers.
- `invalid`: add a thumbs-down reaction, then post a new top-level PR comment linking to the invalid comment and explaining why it is invalid.
- `duplicate`: hide/minimize the duplicate when possible, and post a new top-level PR comment linking the duplicate to the canonical source item.
- `fixed`: post a fixed acknowledgement only when it helps reviewers; skip the comment when someone already acknowledged the fix.
- `uncertain`: no-op unless a short uncertainty comment would reduce reviewer confusion.

## Duplicate And Conflict Policy

Classify feedback as duplicate when it points to the same underlying fix, even if wording, line span, or author differs. Prefer a human-authored canonical item over an equivalent non-human item. Otherwise prefer the earliest still-relevant item with the clearest requested fix.

Treat feedback as conflicting when requested changes cannot both be correct. Human feedback overrides conflicting non-human feedback unless current code or repo policy clearly proves the human feedback was mechanical and incorrect.

## Idempotency

Before any visible action, check whether an equivalent Charlie reply, top-level comment, reaction, resolve, hide, or minimize action already exists for the same item and PR head. If yes, do not repeat it.

Stay silent for routine no-ops: draft/closed/merged PRs, Charlie-authored triggers, unsupported event types, incomplete relevant pagination, or equivalent actions already taken.

When a PR head update makes feedback fixed, do not post a fixed comment if the fix author or another reviewer already said the thread/comment was fixed. Resolve the thread when resolution is allowed.

Use reviewer value as the tie-breaker when the rules do not decide: act only when the action makes it easier to determine whether the PR is ready to merge or what must change before it can merge.
