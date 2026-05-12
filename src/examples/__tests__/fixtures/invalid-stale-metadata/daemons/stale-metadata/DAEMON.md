---
id: stale-metadata
purpose: Keep the stale-metadata fixture valid for catalog generation tests.
readiness: adapt-before-use
watch:
  - Wake on pull request changes for this fixture.
routines:
  - Inspect the trigger and produce a bounded handoff.
deny:
  - Do not mutate production resources.
---

# stale-metadata

## Policy

Use only public-safe fixture content and no-op when context is missing.
