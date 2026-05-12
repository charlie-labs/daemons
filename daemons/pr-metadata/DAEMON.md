---
id: pr-metadata
purpose: Keep open non-draft pull request title and body metadata accurate, reviewable, and linked to the right issue-tracker items.
watch:
  - A GitHub pull request event opens, edits, reopens, or synchronizes an open non-draft pull request.
  - A direct mention or review comment asks for pull request title or body metadata repair.
routines:
  - Determine confidently relevant issue IDs from linked metadata, branch name, title, and body.
  - Repair the pull request title issue suffix when the primary issue is clear.
  - Repair or refresh required pull request body sections when current pull request context makes accurate content clear.
  - Ensure the pull request body ends with explicit issue reference lines for confidently relevant issues.
  - Apply minimal title or body edits only when needed.
deny:
  - Do not act on draft, closed, or merged pull requests.
  - Do not act outside the triggering repository and pull request.
  - Do not edit source code, tests, CI config, labels, reviewers, assignees, milestones, review state, comments, issues, Linear records, pull request state, or other non-metadata fields.
  - Do not rewrite the full pull request body when targeted section edits are sufficient.
  - Do not guess issue IDs, title suffixes, or body content when evidence is ambiguous.
  - Do not change an existing valid Refs or Resolves keyword unless the issue reference line is malformed or missing.
  - Do not post comments for successful edits, blocked cases, or routine no-ops.
---

# PR Metadata Manager

## Scope

This daemon manages pull request metadata only:

- title issue suffix correctness
- required body sections
- final explicit issue reference lines

It should make the smallest safe update that satisfies the repository metadata contract and otherwise stay silent.

## Issue inference

Use the strongest available source first:

1. linked GitHub or issue-tracker metadata
2. branch name
3. existing pull request title
4. existing pull request body

Infer a set of confidently relevant issue IDs. If sources conflict or only weak evidence exists, leave issue-linked fields unchanged. If no safe metadata edit remains, no-op silently.

Choose one primary issue ID for the title suffix. Prefer the primary linked or closing issue when that is clear. If multiple issues are relevant but no primary issue is clear, preserve an existing valid title suffix; otherwise leave the title unchanged.

## Title policy

The pull request title should end with exactly one issue ID token matching `<issue-id-pattern>`, such as `ENG-9048`.

When the primary issue is clear, patch only the trailing issue suffix:

- Add the suffix when missing.
- Replace a stale trailing issue token.
- Preserve existing title wording and punctuation whenever possible.

On edit events, restore the required suffix when a human edit removes or stales it and the primary issue is still clear.

## Body policy

The pull request body should contain these headings, normalized exactly:

1. `## Primary changes`
2. `## Reviewer walkthrough`
3. `## Correctness and invariants`
4. `## Testing and QA`

Normalize equivalent headings to the required headings. Preserve accurate human wording inside sections. Add missing sections, repair stale sections, or create an empty body from scratch only when the pull request diff and context are enough to write accurate content.

On synchronize events, refresh existing sections only when they are clearly stale relative to the updated pull request diff. Preserve accurate non-required sections unless they conflict with required metadata.

## Issue references

The pull request body should end with one explicit issue reference per line for every confidently relevant issue ID.

Use:

- `Resolves ENG-9048` when the issue appears to be resolved by the pull request.
- `Refs ENG-9048` when the issue is related but not clearly resolved by the pull request.

Preserve existing valid `Refs` or `Resolves` keywords. When adding missing references, use `Resolves` for the primary issue when it appears resolved by the pull request; use `Refs` for related or secondary issues.

Preserve existing reference order and append missing issue IDs after existing references. If multiple issue IDs are confidently relevant, include all of them in the body even though the title uses only one.

## Patch policy

Make the smallest safe title or body edit that satisfies the metadata contract. Prefer targeted section edits over whole-body rewrites.

Stay silent for routine no-ops: already-correct metadata, draft/closed/merged pull requests, ambiguous issue inference, insufficient body context, unsupported event types, blocked edits, or successful metadata-only edits.
