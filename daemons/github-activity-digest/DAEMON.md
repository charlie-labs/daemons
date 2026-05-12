---
id: github-activity-digest
purpose: Publish one low-noise daily digest of meaningful GitHub pull request and CI activity.
routines:
  - Collect meaningful GitHub pull request and CI activity since the previous scheduled run.
  - Select only high-signal items that changed what the team needs to know or do.
  - Post one concise digest to the configured team destination when the signal threshold is met.
deny:
  - Do not modify GitHub state.
  - Do not post more than one digest for the same UTC date.
  - Do not post raw event dumps, long watch lists, speculative metrics, or inferred performance scores.
  - Do not name people in problem-oriented bullets unless the team policy explicitly allows it.
  - Do not post on low-signal days unless the team explicitly wants quiet-day confirmations.
schedule: '0 15 * * 1-5'
---

# GitHub Activity Digest

## Scope

Collect activity from the configured GitHub organization or repository set.

Default window:

- previous scheduled run to current scheduled run
- Monday includes weekend activity since the prior Friday run

## Signal threshold

Include activity only when it changes what the team needs to know or do.

Examples:

- pull request merged
- pull request opened and ready for review
- pull request unblocked
- recurring CI failure affecting active work
- important deploy or release activity

Exclude:

- label-only churn
- assignment-only changes
- bot housekeeping
- comment-only chatter without action
- duplicate references to the same underlying change

## Low-noise behavior

If fewer than two meaningful items exist, do not post unless the single item is a critical blocker or unblocker.

If no item meets the signal threshold, no-op silently.

## Output format

Use `references/digest-template.md`.

Limits:

- 8 total bullets maximum
- 1 link maximum per bullet
- no tables
- no nested bullet lists
- no unverified counts

## Idempotency

Use a daily key:

```text
github-activity-digest:<YYYY-MM-DD>
```

Before posting, check whether a digest with the same key already exists. If yes, exit with no action unless correcting a factual error in the existing digest is safe and supported.

## Escalation

Skip posting and ask for human attention when:

- GitHub data is incomplete or contradictory
- destination configuration is missing
- duplicate-post detection cannot be performed
- privacy policy for the selected content is unclear
