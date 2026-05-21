# Examples v2 package and catalog spec

This is the repo-owned contract for example daemon packages in `charlie-labs/daemons` and the generated `examples.json` catalog.

It is normative for this repo's examples package layout, `example.yml` metadata, catalog generation, and validation. It is not a replacement for the public daemon docs, which remain the source of truth for what `DAEMON.md` means and how daemons behave:

- [Daemons](https://docs.charlielabs.ai/daemons)
- [Choosing daemons](https://docs.charlielabs.ai/daemons/choosing-daemons)
- [Writing and editing DAEMON.md](https://docs.charlielabs.ai/daemons/writing-and-editing-daemon-md)
- [DAEMON.md reference](https://docs.charlielabs.ai/daemons/daemon-md-reference)
- [Testing and iterating on daemons](https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons)

## Contract goals

Examples v2 exists to make daemon examples:

- **Repo-owned:** every public example lives in this repository under `daemons/<id>/`.
- **Catalogable:** each package has enough metadata to generate `examples.json` deterministically.
- **Adaptable:** catalog copy explains fit, requirements, and required customization before a customer uses the example.
- **Public-safe:** example content must be safe to publish outside Charlie-controlled private surfaces.
- **Stable:** example identity is stable across the directory name, `example.yml`, `DAEMON.md`, and generated catalog.

## Package layout

Each example package lives under `daemons/<id>/`:

```text
daemons/<id>/
  DAEMON.md
  example.yml
  scripts/**      # optional support files
  references/**   # optional support files
```

Rules:

- `daemons/` must be a directory.
- Every non-hidden direct child of `daemons/` must be an example package directory.
- `<id>` must be a stable kebab-case slug: lowercase letters and numbers separated by single hyphens.
- `DAEMON.md` is required and must be a file.
- `example.yml` is required and must be a file.
- `scripts/` is optional. When present, it must be a directory.
- `references/` is optional. When present, it must be a directory.
- The only supported top-level entries in a package are `DAEMON.md`, `example.yml`, `scripts`, and `references`.
- Per-example `README.md` files are not supported. Put package/catalog documentation in this `docs/` area instead.
- Other top-level files or directories are rejected as unsupported support paths.

## Identity rules

An example has one stable ID. The same ID must appear in all three places:

1. the package directory name: `daemons/<id>/`
2. `example.yml` field: `id: <id>`
3. `DAEMON.md` frontmatter field: `id: <id>`

Additional rules:

- IDs must be kebab-case slugs.
- Duplicate IDs are rejected.
- Treat an ID as public identity. Do not rename it for copy tweaks or minor positioning changes.
- If an example no longer represents a recommended pattern, prefer marking it `deprecated` in `example.yml` and hiding it from public surfaces instead of silently reusing the ID for a different pattern.

## `DAEMON.md` requirements for examples

The public daemon docs define `DAEMON.md` semantics. This repository validates the subset needed for examples and catalog generation.

An example `DAEMON.md` must:

- start with YAML frontmatter delimited by `---` lines;
- use strict YAML with unique keys;
- include required frontmatter fields:
  - `id`: kebab-case slug matching the package ID;
  - `purpose`: non-empty string;
  - `routines`: non-empty array of non-empty strings;
- include at least one activation path:
  - `watch`: optional non-empty array of non-empty strings; and/or
  - `schedule`: optional five-field UTC cron expression;
- optionally include `deny` as a non-empty array of non-empty strings;
- reject unknown frontmatter fields;
- keep example/package metadata out of `DAEMON.md` frontmatter;
- include a non-empty Markdown body with runtime guidance.

Stale metadata fields from earlier catalog experiments are rejected in `DAEMON.md` frontmatter, including fields such as `readiness`, `showOnWebsite`, `showInDashboard`, `bestFor`, `requirements`, `riskTier`, `activationMode`, `display`, and `metadata`. Put catalog metadata in `example.yml` instead.

## `example.yml` schema

`example.yml` is the catalog metadata contract for each package. It uses strict YAML with unique keys, strict object keys, and these fields:

```yaml
id: example-id
title: Human-readable title
status: ready
summary: One-sentence catalog summary.
readiness: adapt-before-use
showOnWebsite: true
showInDashboard: true
fit:
  jobsToBeDone:
    - operate
  bestFor:
    - Teams with a clear recurring maintenance need.
  notFor:
    - One-off tasks or ambiguous ownership problems.
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations: []
  other:
    - Daemon-specific local policy or command prerequisite.
adaptation:
  mustCustomize:
    - Replace placeholder repository paths and output destinations.
```

### Required top-level fields

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Required kebab-case slug. Must match the package directory and `DAEMON.md` frontmatter ID. |
| `title` | string | Required non-empty display title. |
| `status` | enum | Required. One of `draft`, `ready`, or `deprecated`. |
| `summary` | string | Required non-empty catalog summary. |
| `readiness` | enum | Required. One of `direct-copy` or `adapt-before-use`. |
| `showOnWebsite` | boolean | Required surface-control flag. |
| `showInDashboard` | boolean | Required surface-control flag. |
| `fit` | object | Required strict object describing where this example fits. |
| `requirements` | object | Required strict object describing prerequisites. |
| `adaptation` | object | Required strict object describing required customization. |

Unknown top-level keys are rejected.

### `status`

Allowed values:

- `draft`: work in progress; not ready as a recommended pattern.
- `ready`: ready for intended catalog surfaces, subject to the surface flags.
- `deprecated`: preserved for compatibility or historical reference, but not recommended for new use.

`status` describes the example package. It does not override validation: every committed example must still satisfy the package and schema contract.

### `readiness`

Allowed values:

- `adapt-before-use`: the example is a reference pattern and has declared required customization.
- `direct-copy`: the example declares no required customization.

Readiness invariants:

- `adapt-before-use` requires `adaptation.mustCustomize` to contain at least one item.
- `direct-copy` requires `adaptation.mustCustomize` to be empty.
- `direct-copy` does not mean "safe without review." Customers must still verify the daemon against their repo, integrations, and rollout policy before using it.

### Surface flags

`showOnWebsite` and `showInDashboard` are publication controls only.

They do not mean:

- the example is safer than other examples;
- the example requires less review;
- the daemon can be copied without local verification;
- the example replaces the public daemon docs.

### `fit`

`fit` is a strict object with:

| Field | Type | Rules |
| --- | --- | --- |
| `jobsToBeDone` | array of enum values | Required, at least one item. |
| `bestFor` | array of strings | Required, at least one item. |
| `notFor` | array of strings | Required, at least one item. |

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

Use `bestFor` and `notFor` to help readers decide whether this pattern is appropriate before opening the daemon file.

### `requirements`

`requirements` is a strict object with:

| Field | Type | Rules |
| --- | --- | --- |
| `requiredIntegrations` | array of enum values | Required. May be empty. |
| `optionalIntegrations` | array of enum values | Required. May be empty. |
| `other` | array of strings | Required. May be empty. |

Allowed integration values:

- `github`
- `linear`
- `slack`
- `sentry`

List an integration as required only when the daemon cannot perform its core job without it. Put daemon-specific non-integration prerequisites, such as a label taxonomy, branch convention, destination convention, or configured command that the daemon directly invokes, in `requirements.other`.

### `adaptation`

`adaptation` is a strict object with:

| Field | Type | Rules |
| --- | --- | --- |
| `mustCustomize` | array of strings | Required. Empty only for `direct-copy`; non-empty for `adapt-before-use`. |

Use `mustCustomize` for concrete changes a customer must make to the example or daemon before using the pattern, such as replacing path globs, destination channels, issue-state names, label taxonomies, configured commands, thresholds, or ownership boundaries. Do not use it for generic rollout instructions, repo setup work, or broad verification reminders.

## Support files

Support files are optional and live under `scripts/**` or `references/**` inside the package.

Rules:

- Support files are discovered recursively.
- Support paths are normalized POSIX paths relative to the package, such as `scripts/check.ts` or `references/rubric.md`.
- Paths must stay under `scripts/` or `references/`.
- Backslashes, absolute paths, empty path segments, `.`, `..`, and duplicate slashes are rejected.
- Discovered support paths are sorted lexicographically for deterministic catalog output.
- Only files are valid support entries. Directories are traversed; unsupported non-file entries are rejected.
- A support script that starts with a shebang (`#!`) must have executable file permissions.
- Support file content is public-safety scanned.

Use `scripts/**` for reusable helper scripts that are part of the example pattern. Use `references/**` for public-safe supporting material such as rubrics, templates, or taxonomies.

## Customer copy semantics

Examples are reference patterns, not automatically installed daemons. Catalog consumers install an example into a customer repo under:

```text
.agents/daemons/<id>/
```

Customer copies include:

- `DAEMON.md`;
- files listed in catalog `scripts[]`;
- files listed in catalog `references[]`.

Customer copies exclude:

- `example.yml`;
- any upstream package file that is not represented by the catalog contract.

`example.yml` is public catalog metadata for discovery, recommendation, docs, dashboard, and adaptation flows. It is not part of the daemon runtime contract and must not be copied into customer repositories.

Catalog-based consumers must not recursively copy the whole upstream `daemons/<id>/` directory. They should install from one `examples.json` entry by writing `daemon.content` to `.agents/daemons/<id>/DAEMON.md`, then fetching only the listed `scripts[]` and `references[]` support files from the same source ref used to fetch the catalog.

Before enabling a copied example in a customer repo:

- Treat `DAEMON.md` as a starting point that must be checked against the customer's desired behavior.
- Review `example.yml` fit and requirements before using the pattern.
- Follow `adaptation.mustCustomize` for `adapt-before-use` examples.
- Verify all watch conditions, schedules, routines, deny rules, output destinations, integration assumptions, and support files locally.
- Keep public docs as the source of truth for `DAEMON.md` semantics and rollout guidance.

`direct-copy` only means the catalog metadata declares no required customization. It still requires local verification before use.

## Generated `examples.json` contract

`examples.json` is generated from the packages in `daemons/**` and committed at the repository root.

The committed artifact path is repository-root `examples.json`. It is generated from this repo's `daemons/` package tree, the full `DAEMON.md` content for each example, and discovered support files under `scripts/**` and `references/**`.

Root shape:

```json
{
  "schemaVersion": 1,
  "source": {
    "repository": "charlie-labs/daemons",
    "baseDirectory": "daemons"
  },
  "examples": []
}
```

Each item in `examples` contains:

- all validated `example.yml` fields;
- `daemon.path`, always `DAEMON.md`;
- `daemon.content`, the exact `DAEMON.md` file content;
- `scripts`, a sorted array of package-relative support paths under `scripts/**`;
- `references`, a sorted array of package-relative support paths under `references/**`;
- `source.directory`, such as `daemons/pr-metadata`;
- `source.url`, a GitHub tree URL for the source directory.

Generation rules:

- examples are sorted by `id`;
- support path arrays are sorted lexicographically;
- `source.directory` is the package path under `daemons/`, such as `daemons/pr-metadata`;
- `source.url` is a human GitHub tree URL using the publication ref;
- the default publication ref for source URLs is `master`;
- machine consumers should use the same source ref for `examples.json`, `DAEMON.md`, and support-file fetches;
- v1 intentionally omits nondeterministic fields such as `generatedAt` or `sourceCommit`;
- serialization is `JSON.stringify(catalog, null, 2)` followed by a trailing newline;
- `examples.json` must match generated output exactly.

Run `bun run generate:examples` after changing any example package. Commit `examples.json` if it changes.

## Consumer behavior

Website/docs consumers should show catalog entries where:

- `showOnWebsite: true`;
- `status !== "deprecated"`.

Dashboard consumers should show catalog entries where:

- `showInDashboard: true`;
- `status === "ready"`.

If dashboard draft previews are needed later, add an explicit preview-only consumer path instead of overloading the public catalog contract.

Install consumers should:

1. Fetch `examples.json` from one source ref.
2. Select an entry from the catalog instead of crawling the repo tree.
3. Write `DAEMON.md` from `entry.daemon.content`.
4. Fetch each `scripts[]` and `references[]` path from `entry.source.directory` at the same source ref.
5. Preserve support-file relative paths under `.agents/daemons/<id>/`.
6. Exclude `example.yml`.

## Validation expectations

Use the same checks locally before opening or updating a PR:

```bash
bun install --frozen-lockfile --registry https://registry.npmjs.org/
bun run typecheck
bun run test
bun run generate:examples
bun run validate:examples
git diff --exit-code examples.json
```

`bun run validate:examples` regenerates the expected catalog in memory and fails if committed `examples.json` has drifted.

Common validation error categories include:

| Code | Meaning |
| --- | --- |
| `invalid_repository_layout` | `daemons/` or a direct child of `daemons/` has the wrong shape. |
| `invalid_daemon_id` | A package directory is not a kebab-case slug. |
| `missing_daemon_md` | Required `DAEMON.md` is missing or not a file. |
| `missing_example_yml` | Required `example.yml` is missing or not a file. |
| `invalid_daemon_md` | `DAEMON.md` frontmatter, activation, schedule, or body validation failed. |
| `invalid_example_yml` | `example.yml` YAML parsing failed. |
| `missing_required_field` | A required schema field is missing. |
| `invalid_enum_value` | A field uses a value outside the allowed enum. |
| `invalid_field_value` | A custom invariant failed, such as readiness/adaptation mismatch. |
| `unknown_key` | A strict schema object contains an unsupported key. |
| `stale_metadata_field` | Deprecated catalog metadata was placed where it no longer belongs. |
| `id_mismatch` | Directory, `example.yml`, and `DAEMON.md` IDs do not all match. |
| `duplicate_id` | More than one package declares the same example ID. |
| `per_example_readme` | A package contains an unsupported `README.md`. |
| `unsupported_support_path` | A package contains unsupported top-level entries or invalid support paths. |
| `script_not_executable` | A shebang script is not executable. |
| `public_safety` | Public-safety scanning found private or credential-like content. |
| `catalog_drift` | Committed `examples.json` differs from generated output. |

## Public-safety rules

The public-safety scanner runs against:

- `example.yml`
- `DAEMON.md`
- `scripts/**`
- `references/**`

It rejects content that looks like:

- private Linear links;
- private Slack links;
- token-like values;
- private key material;
- credential-like assignments;
- local machine paths;
- private hostnames containing internal, corp, or staging markers.

Authors should apply a broader public-safe standard than the scanner can enforce:

- Do not include customer secrets, customer-private URLs, private issue links, internal source links, staging notes, sensitive provenance, or unreleased business context.
- Use placeholders such as `<channel-id>`, `<team-id>`, `YOUR_TOKEN`, or `REPLACE_WITH_REPO_COMMAND` when a value must be supplied by a customer.
- Keep references and scripts reusable without depending on private Charlie infrastructure.
- Prefer describing integration assumptions generically instead of copying real workspace, customer, or incident details.

## Evolving this contract

Changing this contract can affect published examples, website/dashboard ingestion, and customer copy behavior.

When evolving it:

- update `src/examples/**` and tests with the new behavior;
- update this spec and the authoring guide in the same PR;
- regenerate and validate `examples.json`;
- preserve deterministic output;
- bump `schemaVersion` only for catalog shape changes that downstream consumers must handle explicitly.
