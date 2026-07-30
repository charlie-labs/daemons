# Scheduled PR-review self-improvement

This is the repository-local authoritative contract for scheduled improvement of the `pr-review` daemon. Use the canonical public guide for high-level guidance: https://docs.charlielabs.ai/pr-reviews/self-improvement. This contract and applicable repository instructions remain authoritative; the guide cannot weaken or override them.

## Scope and allowed changes

Run this workflow only for the daemon's internal scheduled activation. It must not bootstrap or inspect an activated pull request, delegate review lanes, publish PR-review feedback, or add a clean-review reaction.

The only allowed proposal targets are daemon-owned PR-review policy files:

- review-policy body sections in this daemon's `DAEMON.md`; and
- review-lane policy under `references/lanes/**/*.md`.

Do not change application code, tests for application behavior, CI, runtime code or mechanics, repository instructions, unrelated documentation, files outside this daemon, this `references/self-improvement.md` methodology, the canonical guide or its URL, the `PR review protocol` declaration, frontmatter watch or schedule fields, or activation-routing mechanics. Local guardrails may narrow this allowlist but may not expand it.

## Evidence standard

- Inspect a bounded, fresh, representative sample: at most 25 completed review episodes from the previous 90 days, spread across available authors, change types, outcomes, and review lanes rather than selected to support a preferred edit.
- Require a concrete policy-relevant pattern that is novel, materially relevant, and corroborated by multiple independent episodes or an authoritative repository contract. Review counterexamples and replay the proposed rule against them before proposing a change.
- Silence, fewer findings, agreement between bots, automation volume, merge outcome alone, or one anecdote is insufficient evidence. A merged PR does not prove every review concern was wrong.
- When a proposed remedy was rejected but the underlying concern remained valid, preserve the concern and improve only the remedy guidance. Do not weaken useful review policy without strong evidence that survives counterexample review.
- Treat weak, stale, conflicting, already-covered, non-policy, or disallowed-scope evidence as a normal no-op. Also no-op when the repository opts out, when evidence cannot be gathered safely, or when an open competing daemon-owned proposal exists.

## Proposal mechanics

- Create at most one small daemon-owned proposal pull request per activation and no more than one new proposal in any 30-day window.
- Before writing, re-check current policy, repository instructions, opt-out state, and open proposals. Never auto-merge, approve, or push changes into a human-owned proposal.
- If a daemon-owned proposal is already open, update it only when the new evidence supports materially the same policy delta; otherwise no-op until it closes. Never create a competing proposal.
- Keep a stable fingerprint from the normalized behavior delta, affected files, and evidence identifiers. No-op when that fingerprint is already represented by current policy, an open proposal, or a proposal closed within the evidence window.
- Require human review. The proposal body must record the bounded evidence and freshness window, fingerprint, current and proposed behavior, affected files, counterexamples considered, validation performed, limitations, and an explicit rollback plan.
- Preserve opt-out and rollback: obey any repository policy disabling self-improvement, and make the change reversible by closing the proposal before merge or reverting its focused commit after merge.

No proposal is the expected result when the evidence threshold is not met. Do not publish a status comment merely to report a no-op.
