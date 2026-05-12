# Daemon examples v2 spec

This is the canonical package and catalog contract for daemon examples in this repo. Use it when creating validators, generators, docs ingestion, dashboard ingestion, recommendation flows, or customer install/copy flows.

Use the [examples authoring guide](./examples-authoring-guide.md) for guidance on choosing, writing, editing, and reviewing good examples.

## Directory contract

Each daemon example lives under `daemons/<daemon-id>/`:

```text
daemons/<daemon-id>/
  DAEMON.md
  example.yml
  scripts/      # optional
  references/   # optional
```

Rules:

- `<daemon-id>` is a stable kebab-case slug.
- `DAEMON.md` is required.
- `example.yml` is required.
- `scripts/**` is optional.
- `references/**` is optional.
- Do not add per-example `README.md` files unless this spec changes.
- Do not add private staging notes, private provenance, or internal-only support files to an example directory.

## Identity rules

The daemon ID must match across:

- the directory slug: `daemons/<daemon-id>/`
- `DAEMON.md` frontmatter: `id: <daemon-id>`
- `example.yml`: `id: <daemon-id>`

## Customer copy semantics

When a customer installs or copies an example, the installed daemon lives under:

```text
.agents/daemons/<daemon-id>/
```

Customer copy includes:

- `DAEMON.md`
- `scripts/**` when present
- `references/**` when present

Customer copy excludes:

- `example.yml`

`example.yml` is metadata for catalog, docs, dashboard, recommendation, and adaptation flows. It is not part of the daemon runtime contract and must not be copied into customer repositories.

Catalog-based consumers must not recursively copy every upstream file. They should install from `examples.json` by writing `DAEMON.md` from `daemon.content`, then fetching only the listed `scripts[]` and `references[]` support files from the same source ref used to fetch the catalog.

## `DAEMON.md`

`DAEMON.md` is the runtime operating policy for the daemon.

It must use only daemon runtime frontmatter fields:

- `id`
- `purpose`
- `watch`
- `routines`
- `deny`
- `schedule`

Do not add example metadata to `DAEMON.md`. Fields such as `readiness`, `showOnWebsite`, `showInDashboard`, `bestFor`, `requirements`, `riskTier`, and `activationMode` do not belong in runtime frontmatter.

Minimum rules:

- `id` is required and must match the daemon directory slug.
- `purpose` is required and should describe the daemon's outcome.
- `routines` is required and must include at least one concrete operation.
- At least one of `watch` or `schedule` is required.
- `watch`, when present, should describe concrete observable events.
- `schedule`, when present, must be a standard five-field UTC cron expression.
- `deny`, when present, should cover nearby risky actions.
- The markdown body should contain runtime guidance that changes behavior, such as policy, scope, limits, output format, coordination, ignore patterns, thresholds, evidence gates, examples, or no-op behavior.

Risky actions are actions that interfere with human workflows or are hard to reverse, such as force-pushing over human changes, mutating production state, deleting branches or resources, changing production flags, closing or reprioritizing many issues, or posting noisy output across surfaces. Opening a reviewable PR is not high-risk by itself.

Rollout instructions, validation checklists, catalog presentation notes, and setup tutorials do not belong in `DAEMON.md`.

## `example.yml`

`example.yml` is public-safe metadata for catalog, docs, dashboard, recommendation, and adaptation flows.

The schema is strict:

- Unknown top-level keys are rejected.
- Unknown nested keys under `fit`, `requirements`, and `adaptation` are rejected.
- Nested objects are rejected unless explicitly defined below.

### Full example

```yaml
id: example-daemon
title: Example daemon
status: draft
summary: Keeps one recurring repo maintenance workflow owned and reviewable.
readiness: adapt-before-use
showOnWebsite: true
showInDashboard: false
fit:
  jobsToBeDone:
    - organize
  bestFor:
    - Repositories where this recurring workflow is under-owned
    - Teams that already review this kind of output on native surfaces
  notFor:
    - Repositories where the workflow is one-off or project-specific
    - Teams without a clear source of truth for this workflow
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations:
    - slack
  other:
    - Documented local workflow conventions
    - Repository commands or files needed by the daemon
adaptation:
  mustCustomize:
    - Replace placeholder labels, statuses, paths, or commands.
    - Confirm the local source of truth for this workflow.
    - Set the intended output destination.
```

### Top-level keys

Allowed top-level keys:

- `id`
- `title`
- `status`
- `summary`
- `readiness`
- `showOnWebsite`
- `showInDashboard`
- `fit`
- `requirements`
- `adaptation`

No other top-level keys are allowed.

### Catalog fields

| Field | Required | Type | Rules |
| --- | --- | --- | --- |
| `id` | yes | string | Stable example slug. Must match the daemon directory name. |
| `title` | yes | string | Human-readable display title. |
| `status` | yes | enum | `draft`, `ready`, or `deprecated`. |
| `summary` | yes | string | Short public-safe description. |
| `readiness` | yes | enum | `direct-copy` or `adapt-before-use`. |
| `showOnWebsite` | yes | boolean | Whether website/docs surfaces should list the example. |
| `showInDashboard` | yes | boolean | Whether dashboard onboarding should list the example. |

### `fit`

Allowed keys under `fit`:

- `jobsToBeDone`
- `bestFor`
- `notFor`

No other keys are allowed under `fit`.

| Field | Required | Type | Rules |
| --- | --- | --- | --- |
| `jobsToBeDone` | yes | list of enums | One or more JTBD slugs. |
| `bestFor` | yes | list of strings | Public-safe descriptions of repos, teams, or situations where the example fits well. |
| `notFor` | yes | list of strings | Public-safe descriptions of repos, teams, or situations where the example is a poor fit. |

Allowed `jobsToBeDone` values:

- `maintain-and-modernize`
- `organize`
- `document`
- `review-with-confidence`
- `build-production-grade-typescript`
- `operate`
- `explain`
- `plan`
- `daemon-operations`

### `requirements`

Allowed keys under `requirements`:

- `requiredIntegrations`
- `optionalIntegrations`
- `other`

No other keys are allowed under `requirements`.

| Field | Required | Type | Rules |
| --- | --- | --- | --- |
| `requiredIntegrations` | yes | list of enums | Integrations the example cannot reasonably work without. |
| `optionalIntegrations` | yes | list of enums | Truly optional integrations that enhance the example but are not required. |
| `other` | yes | list of strings | Public-safe non-integration prerequisites. |

Allowed integration slugs:

- `github`
- `linear`
- `slack`
- `sentry`

Use `optionalIntegrations` only for integrations that are genuinely optional. Do not use optional integrations to encode one-of-many required alternatives. If the source-of-truth platform changes daemon behavior, create separate examples.

### `adaptation`

Allowed keys under `adaptation`:

- `mustCustomize`

No other keys are allowed under `adaptation`.

| Field | Required | Type | Rules |
| --- | --- | --- | --- |
| `mustCustomize` | yes | list of strings | Concrete local decisions, replacements, or confirmations needed before use. |

`mustCustomize` is required for every example. Use an empty list only when `readiness: direct-copy`.

Example:

```yaml
readiness: direct-copy
adaptation:
  mustCustomize: []
```

Do not use `mustCustomize` for general warnings, marketing notes, runtime daemon policy, rollout instructions, or verification steps. Runtime policy belongs in `DAEMON.md`; rollout and verification guidance belongs in general daemon docs.

## `scripts/**`

Use `scripts/**` for executable helpers or deterministic utilities the daemon can call or reference.

Rules:

- Scripts must be public-safe and customer-facing.
- Scripts must not include private paths, private tokens, private hostnames, or customer-specific secrets.
- Scripts should be small, deterministic, and understandable.
- Scripts should not be hidden product dependencies.
- Scripts should avoid mutating production or remote state.
- Executable scripts should have executable file permissions.
- Inputs, outputs, and failure behavior must be documented either in `DAEMON.md` or adjacent `references/**`.

## `references/**`

Use `references/**` for customer-facing context the daemon can read but should not modify.

Good reference files include:

- rubrics
- templates
- taxonomies
- provider policies
- style guides
- output examples
- local-adaptation notes that are safe to copy

Rules:

- References must be public-safe.
- References must not contain private Linear links, private Slack links, internal repo paths, private provenance, customer names, or private thresholds.
- References should support runtime behavior or required local adaptation.
- References should not be generic tutorials that duplicate the public daemon docs.

## Generated catalog artifact: root `examples.json`

Root `examples.json` is a strict, versioned generated catalog derived from each `daemons/<id>/example.yml`, the full `DAEMON.md`, and discovered support files. Generation is owned by this repo because the repo owns the public package layout and generated root artifact.

### v1 JSON shape

```json
{
  "schemaVersion": 1,
  "source": {
    "repository": "charlie-labs/daemons",
    "baseDirectory": "daemons"
  },
  "examples": [
    {
      "id": "dependency-upgrades",
      "title": "Dependency upgrades",
      "status": "ready",
      "summary": "Opens low-noise dependency upgrade PRs with verification evidence.",
      "readiness": "adapt-before-use",
      "showOnWebsite": true,
      "showInDashboard": true,
      "fit": {
        "jobsToBeDone": ["maintain-and-modernize"],
        "bestFor": ["Repositories with regular dependency drift"],
        "notFor": ["Repositories without a package manager lockfile"]
      },
      "requirements": {
        "requiredIntegrations": ["github"],
        "optionalIntegrations": [],
        "other": ["A package manager lockfile"]
      },
      "adaptation": {
        "mustCustomize": ["Confirm install, lockfile, and verification commands."]
      },
      "daemon": {
        "path": "DAEMON.md",
        "content": "<full DAEMON.md markdown>"
      },
      "scripts": ["scripts/detect-package-manager.sh"],
      "references": ["references/package-manager-adaptation.md"],
      "source": {
        "directory": "daemons/dependency-upgrades",
        "url": "https://github.com/charlie-labs/daemons/tree/<publication-ref>/daemons/dependency-upgrades"
      }
    }
  ]
}
```

### Field rules

Root required fields:

- `schemaVersion`
- `source.repository`
- `source.baseDirectory`
- `examples`

Entry required fields:

- all strict `example.yml` fields: `id`, `title`, `status`, `summary`, `readiness`, `showOnWebsite`, `showInDashboard`, `fit`, `requirements`, and `adaptation`
- `daemon`
- `scripts`
- `references`
- `source`

Path rules:

- `daemon.path`, `scripts[]`, and `references[]` are daemon-directory-relative paths.
- Join those paths with `entry.source.directory` when fetching from source.
- Join those paths with `.agents/daemons/<id>/` when installing into a customer repo.
- `daemon.path` must be `DAEMON.md` in v1.
- `scripts[]` entries must be files under `scripts/**`.
- `references[]` entries must be files under `references/**`.
- Support paths are normalized POSIX file paths only: no absolute paths, no `..` segments, no backslash separators, no repeated separators, no directory entries, and no embedded file contents.
- Missing or empty optional `scripts/` or `references/` directories emit empty arrays.

Source rules:

- `source.directory` is the daemon directory path, such as `daemons/dependency-upgrades`.
- `source.url` is a human source link.
- Machine consumers should fetch support file content from the same ref they used to fetch `examples.json`, using `source.directory` plus the listed relative support path.
- Committed v1 output does not require `sourceCommit` or `generatedAt`.

Runtime metadata rules:

- v1 includes full `DAEMON.md` markdown content in `daemon.content`.
- v1 does not include parsed runtime frontmatter fields beyond the strict `example.yml` metadata.
- `example.yml` is never copied into customer repos.

### Generation and validation behavior

Generation fails the whole artifact on any invalid example. Do not emit partial catalogs.

Validation covers:

- required `DAEMON.md` and `example.yml`
- strict `example.yml` keys and enums
- daemon-runtime-only `DAEMON.md` frontmatter
- ID match across directory slug, `DAEMON.md` frontmatter, and `example.yml`
- support files only under `scripts/**` and `references/**`
- no unexpected top-level package entries
- no per-example `README.md` unless this spec changes
- public-safety checks for all package contents
- executable script mode validation where practical

Output must be deterministic:

- `examples` sorted by `id`
- support paths sorted lexicographically
- stable object key order

Validation errors should be machine-readable:

```json
{
  "code": "invalid_example",
  "path": "daemons/dependency-upgrades/example.yml",
  "fieldPath": "requirements.requiredIntegrations[0]",
  "message": "Unsupported integration slug."
}
```

### Consumer and install behavior

Website/docs consumers show entries where:

- `showOnWebsite: true`
- `status !== "deprecated"`

Dashboard consumers show entries where:

- `showInDashboard: true`
- `status === "ready"`

If dashboard draft previews are needed later, add an explicit preview-only consumer path instead of overloading the public catalog contract.

Install consumers should:

1. Fetch `examples.json` from one source ref.
2. Select an entry from the catalog rather than crawling the repo tree.
3. Write `DAEMON.md` from `entry.daemon.content`.
4. Fetch each `scripts[]` and `references[]` path from `entry.source.directory` at the same source ref.
5. Preserve support file relative paths under `.agents/daemons/<id>/`.
6. Exclude `example.yml`.

## Public-safety rules

All example package contents must be public-safe.

Do not include:

- private Linear links
- private Slack links
- internal repo paths
- private source provenance
- customer names
- private thresholds
- secrets or credential names that are not generic placeholders
- private hostnames or account IDs

Keep private research, staging notes, and source provenance outside the public example package.

## Validation checklist

Before publishing or accepting an example package, confirm:

- The directory is `daemons/<daemon-id>/`.
- `DAEMON.md` exists.
- `example.yml` exists.
- The daemon ID matches the directory, `DAEMON.md`, and `example.yml`.
- `DAEMON.md` uses only daemon runtime frontmatter fields.
- `DAEMON.md` has at least one activation path through `watch` or `schedule`.
- `example.yml` uses only the strict schema.
- `example.yml` text is public-safe.
- Optional integrations are truly optional.
- `mustCustomize` lists local decisions only.
- Support files, if present, are public-safe and customer-facing.
- Support files are only under `scripts/**` or `references/**`.
- Executable scripts have executable file permissions where practical.
- No per-example `README.md` exists unless this spec changes.
- The generated root `examples.json` validates every example and fails as a whole on any invalid example.
- The generated root `examples.json` has deterministic ordering and stable object key order.
- Catalog-based install writes `DAEMON.md`, fetches listed support files from the same source ref, and never copies `example.yml`.
