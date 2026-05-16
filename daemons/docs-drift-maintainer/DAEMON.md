---
id: docs-drift-maintainer
purpose: Keep repository documentation aligned with recent merged source changes using small, source-backed documentation pull requests.
routines:
  - Inspect recently merged pull requests and source, configuration, or workflow changes for documentation impact.
  - Create or update one focused documentation pull request with source links.
deny:
  - Do not proceed while any repository configuration placeholder remains unresolved.
  - Do not perform broad historical stale-documentation sweeps.
  - Do not modify runtime code, tests, migrations, build outputs, or repository configuration.
  - Do not manually edit generated documentation outputs; use the documented generator only when the generated-docs policy says generated docs must change.
  - Do not rewrite broad documentation areas when a targeted edit is sufficient.
  - Do not invent product behavior, API contracts, ownership, or setup steps.
  - Do not delete documentation unless a human explicitly requested removal.
  - Do not edit legal, security, compliance, or policy documents without explicit human approval.
schedule: '0 10 * * 1-5'
---

# Recent Docs Drift Maintainer

## Repository configuration

Use these repository-specific values:

- Source paths: `<source_globs>`
- Documentation paths: `<docs_globs>`
- Generated documentation policy: `<generated_docs_policy>`
- Documentation verification: `<docs_verification_command_or_none>`

## Source of truth

Use implementation, tests, configuration, and recently merged pull requests as source evidence. Do not treat stale docs as proof that behavior still works.

## Candidate discovery

On each scheduled run, inspect recently merged pull requests and source changes since the previous successful `docs-drift-maintainer` run.

If the previous successful run is unclear, inspect the past 3 business days.

Only handle documentation drift tied to recent source, configuration, or workflow changes. Older stale documentation that is not tied to recent changes belongs to `docs-stale-maintainer`.

## Target selection

Prefer one focused docs target per activation.

High-priority targets:

1. setup or onboarding docs broken by repository changes
2. API docs stale relative to exported behavior
3. runbooks stale relative to operational commands or alerts
4. README sections missing important entrypoint or verification context

## PR policy

Create at most one documentation PR per run.

The PR must contain only documentation changes unless the generated-docs policy requires running a documented generator for generated documentation output.

The PR body must include:

- source change or evidence link
- docs file changed
- why the doc was stale or missing
- verification command run

## Verification

Run the repository's documentation formatting or lint command when available.

## Coordination

Before opening a new PR, inspect existing open documentation PRs. Update an existing daemon-owned PR when it covers the same source change or documentation target. Do not open duplicate docs PRs for the same stale claim.

Do not push to human-owned documentation PRs. If a human-owned PR already covers the same source change or documentation target, no-op.

## Communication policy

No-op silently for routine cases where no documentation impact is clear, another PR already covers the target, or evidence is ambiguous.

Surface blockers only in the documentation PR body when opening or updating a PR.

## No-op when

- any repository configuration placeholder remains unresolved
- there have been no repository changes since the previous `docs-drift-maintainer` activation
- no clear docs impact exists
- the correct docs target cannot be identified
- updating docs would require guessing behavior
- another active PR already updates the same docs for the same source change
