# Examples catalog consumer guide

This guide is for product surfaces, docs sites, installers, and internal tools that consume the generated `examples.json` catalog from `charlie-labs/daemons`.

Use [Examples v2 package and catalog spec](./examples-spec.md) as the normative schema contract. Use [Examples authoring guide](./examples-authoring-guide.md) for how examples are authored and reviewed. The public daemon docs remain the source of truth for what `DAEMON.md` means at runtime.

The package and catalog effort is called Examples v2. The generated catalog now uses `schemaVersion: 2`. Consumers should validate the numeric catalog schema version, not the project nickname.

## Consumer responsibilities

Consumers should:

- fetch repository-root `examples.json` instead of crawling `daemons/`;
- select one source ref for the catalog and any support files;
- validate `schemaVersion === 2` and fail closed on unsupported versions;
- use catalog metadata for discovery, filtering, cards, and install decisions;
- use `entry.daemon.content` as the `DAEMON.md` source for install or rendering;
- fetch only the support paths listed in `entry.scripts` and `entry.references`;
- render and validate the full planned install set before writing any files;
- preserve package-relative support paths under `.agents/daemons/<id>/` when installing;
- treat missing daemon content or failed support-file fetches as blocking install failures.

Consumers should not:

- recursively copy `daemons/<id>/`;
- install `example.yml` into customer repositories;
- fetch unlisted files from an example package;
- use `source.url` as a machine fetch contract;
- infer safety, readiness, or runtime behavior from publication flags alone;
- parse catalog metadata out of `DAEMON.md` frontmatter or body.


## Node package API

Node consumers can use the package API instead of fetching and parsing `examples.json` manually:

```ts
import { getDaemonExample, listDaemonExamples, loadDaemonExamplesCatalog } from "@charlie-labs/daemons";

const catalog = await loadDaemonExamplesCatalog();
const examples = await listDaemonExamples();
const example = await getDaemonExample("js-ts-dependency-upgrades");
```

`loadDaemonExamplesCatalog()` reads the package-root `examples.json` in Node, validates the catalog schema, and returns the same catalog shape documented below. `listDaemonExamples()` returns `catalog.examples`, and `getDaemonExample(id)` returns the matching catalog entry or `null`.

For install flows, the package also exports `createDaemonInstallPlan({ entry, installRoot })`. The planner validates source/support paths, maps catalog files into `.agents/daemons/<id>/`, excludes `example.yml`, and includes Git tree-compatible file modes (`100644`/`100755`) before any writes.

## Catalog shape

The committed catalog lives at the repository root:

```text
examples.json
```

Root shape:

```json
{
  "schemaVersion": 2,
  "source": {
    "repository": "charlie-labs/daemons",
    "baseDirectory": "daemons"
  },
  "examples": []
}
```

Each `examples[]` entry includes the validated `example.yml` metadata plus generated fields:

| Field | Consumer use |
| --- | --- |
| `id`, `title`, `summary`, `status`, `readiness` | Display, filtering, matching, and structured adaptation guidance. |
| `showOnWebsite`, `showInDashboard` | Publication controls for specific surfaces. |
| `fit`, `requirements` | Recommendation and prerequisite copy. |
| `adaptations` | Structured string-only inputs for rendering `{{adapt.key}}` tokens. Always present in generated catalog entries; may be empty. |
| `specializationIdeas` | Optional non-blocking ideas for further team-specific behavior changes. Always present in generated catalog entries; may be empty. |
| `daemon.path` | Currently always `DAEMON.md`. |
| `daemon.content` | Embedded `DAEMON.md` content for rendering and install. |
| `scripts` | Package-relative support script paths to fetch separately. |
| `references` | Package-relative support reference paths to fetch separately. |
| `source.directory` | Package directory, such as `daemons/pr-metadata`. |
| `source.url` | Human GitHub tree URL for the package. Do not use it as the machine fetch contract. |

Support file contents are not embedded in v2. Fetch each listed support file from `entry.source.directory` at the same source ref used for the catalog.

## Source refs

Use one source ref for the catalog and all support-file fetches in a single consume/install operation.

| Consumer goal | Recommended ref |
| --- | --- |
| Reproducible install or audit trail | A commit SHA. |
| Latest validated catalog for a specific schema | `examples-schema-v${schemaVersion}`, such as `examples-schema-v2`. |
| Intentional branch tracking for internal development | `master`. |
| Website or docs deployment | A deployment-pinned ref chosen by that deployment. |

Schema tracking tags are moving tags. After validation on `master`, automation reads committed root `examples.json#schemaVersion` and force-updates `examples-schema-v${schemaVersion}` to that commit. These tags are separate from package release tags, which remain `v${package.json#version}`.

The `daemon` CLI derives its default source ref from the installed package major: `0.x.x` uses `examples-schema-v1`, `1.x.x` has no default and requires explicit `--ref <sha|branch|tag>`, and `2.x.x+` uses `examples-schema-vN` for the matching major. Prerelease and build metadata keep the same major mapping. Explicit `--ref` always wins.

Catalog v2 intentionally omits nondeterministic fields such as `generatedAt` and `sourceCommit`. If a consumer needs auditability, record the selected source ref in the consuming system, install metadata, PR body, or deployment logs. Store the schema version read from the catalog at that same ref.

Example install metadata:

```json
{
  "catalogRepository": "charlie-labs/daemons",
  "catalogRef": "<catalog-commit-sha>",
  "catalogSchemaVersion": 2,
  "exampleId": "js-ts-dependency-upgrades"
}
```

## Filtering entries

Website and docs surfaces should show entries where:

```ts
entry.showOnWebsite === true && entry.status !== "deprecated"
```

Dashboard surfaces should show entries where:

```ts
entry.showInDashboard === true && entry.status === "ready"
```

`showOnWebsite` and `showInDashboard` are publication controls only. They do not mean an example is safe to install automatically, requires less review, or replaces the public daemon docs.

`readiness` also needs local interpretation:

| Readiness | Meaning for consumers |
| --- | --- |
| `direct-copy` | The catalog declares no required structured adaptation inputs. Consumers still need local verification before enabling the daemon. |
| `adapt-before-use` | The consumer should collect required `adaptations[]` values before rendering and install. |


## Structured adaptations

`adaptations[]` describes renderable inputs for examples that contain `{{adapt.key}}` tokens in `DAEMON.md`, `scripts[]`, or `references[]` support files.

Each entry has:

- `key`: token-safe identifier matching `^[a-z][a-z0-9_]*$`;
- `label` and `description`: display/help copy;
- `required`: whether a caller must provide a value;
- `default`: required for optional inputs and forbidden for required inputs;
- `suggestions`: optional string examples.

Install consumers should merge values deterministically in this order: optional defaults, then adaptation-file values, then explicit CLI/UI values. Values are strings only. Reject unknown input keys, missing required keys, non-string values, malformed or unknown `{{adapt.*}}` tokens, and rendered files that still contain `{{adapt.*}}` tokens across every planned file before writing anything. Do not echo raw caller-provided adaptation values in logs or JSON output; reporting applied keys is sufficient.

## Specialization ideas

`specializationIdeas[]` is display metadata for optional behavior changes a team may consider after install. Consumers may show these ideas in browsing, docs, or review surfaces, but must not treat them as install blockers or adaptation inputs.

## Install algorithm

Install consumers should copy from one catalog entry into:

```text
.agents/daemons/<id>/
```

Recommended flow:

1. Choose a source ref, preferably a commit SHA for reproducibility or `examples-schema-v${schemaVersion}` for the latest validated catalog with a known schema.
2. Fetch `examples.json` from repository root at that ref.
3. Validate `catalog.schemaVersion === 2`.
4. Select an entry from `catalog.examples`.
5. Require `entry.daemon.content` to be present.
6. Collect and validate structured adaptation values for the entry.
7. Build the full install plan: `DAEMON.md` from `entry.daemon.content`, every listed `entry.scripts` file, and every listed `entry.references` file.
8. Fetch every listed support file from `entry.source.directory` at the same ref.
9. Render `entry.daemon.content` and all fetched support files with the collected adaptation values.
10. Validate the rendered runtime daemon.
11. Reject malformed, unknown, missing, or still-unresolved `{{adapt.*}}` tokens across all planned files.
12. Only after all fetch, render, and validation work succeeds, write all rendered planned files under `.agents/daemons/<id>/` using the same package-relative paths.
13. Apply planned file modes when the write surface supports them (`100644` for `DAEMON.md`/references, `100755` for scripts).
14. Exclude `example.yml` and all unlisted upstream files.
15. Run the consumer's preflight, collision, review, and rollout checks before enabling the daemon.

Path mapping example:

```text
source:      daemons/github-activity-digest/references/digest-template.md
installed:   .agents/daemons/github-activity-digest/references/digest-template.md
```

TypeScript-shaped pseudocode:

```ts
const catalog = await fetchJson("charlie-labs/daemons", ref, "examples.json");

if (catalog.schemaVersion !== 2) {
  throw new Error(`Unsupported examples catalog schema: ${catalog.schemaVersion}`);
}

const entry = catalog.examples.find((candidate) => candidate.id === exampleId);
if (!entry?.daemon?.content) {
  throw new Error(`Catalog entry ${exampleId} is missing daemon.content`);
}

const plannedFiles = [
  {
    sourcePath: `${entry.source.directory}/DAEMON.md`,
    destinationPath: `.agents/daemons/${entry.id}/DAEMON.md`,
    mode: "100644",
    content: entry.daemon.content,
  },
];

for (const supportPath of [...entry.scripts, ...entry.references]) {
  const sourcePath = `${entry.source.directory}/${supportPath}`;
  plannedFiles.push({
    sourcePath,
    destinationPath: `.agents/daemons/${entry.id}/${supportPath}`,
    mode: supportPath.startsWith("scripts/") ? "100755" : "100644",
    content: await fetchText("charlie-labs/daemons", ref, sourcePath),
  });
}

const renderedFiles = plannedFiles.map((file) => ({
  ...file,
  content: renderAdaptationTokens(file.content, values),
}));

await rejectAdaptationErrors(renderedFiles);
await validateRuntimeDaemonMarkdown(
  renderedFiles.find((file) => file.destinationPath.endsWith("/DAEMON.md"))!.content,
);

for (const file of renderedFiles) {
  await writePlannedFile(file.destinationPath, file.content, file.mode);
}
```

This is intentionally not a recursive copy. The catalog controls the install set.

## Support-file caveats

Catalog v2 lists support file paths, not file contents or mode metadata. The package install planner derives write modes for consumers that need Git tree file modes: `100644` for `DAEMON.md` and references, `100755` for scripts.

If a consumer works directly from raw catalog JSON without the planner, support scripts may still need explicit executable handling through tree APIs or invocation through an interpreter. For example, the current catalog includes:

```text
daemons/github-activity-digest/references/digest-template.md
```

That support file is listed in the catalog, but v2 does not include support file contents in `examples.json`.

Consumers should treat any support-file fetch failure as a blocking install failure before writing files. A partial daemon copy can be misleading if `DAEMON.md` references scripts or reference material that were not installed.

## `DAEMON.md` and catalog metadata

Public daemon docs at `docs.charlielabs.ai` define daemon semantics. `DAEMON.md` frontmatter and body are runtime guidance for Charlie, not a catalog metadata container.

Catalog metadata belongs in `example.yml` and the generated `examples.json`. The v2 schema rejects stale catalog metadata fields in `DAEMON.md`, including fields such as `readiness`, `showOnWebsite`, `showInDashboard`, `bestFor`, `requirements`, `riskTier`, `activationMode`, `display`, and `metadata`.

Consumers should not depend on catalog metadata appearing in `DAEMON.md`, and authors should not add it there for consumer convenience.

## Failure behavior

Consumers should fail closed when:

- `schemaVersion` is not `2`;
- the selected entry is missing;
- `entry.daemon.content` is missing or empty;
- a listed support path cannot be fetched from the selected ref;
- install preflight detects collisions or unsafe local conditions;
- required structured adaptation values are missing or not strings;
- any planned file contains malformed or unknown `{{adapt.*}}` tokens;
- rendered content still contains unresolved `{{adapt.*}}` tokens.

Consumers may still display a non-installable entry for browsing if the surface clearly separates browsing from installation. Do not convert browsing eligibility into install eligibility.

## Consumer checklist

Before shipping a catalog integration, verify that it:

- fetches `examples.json` instead of crawling `daemons/`;
- validates `schemaVersion === 2`;
- uses one selected source ref for catalog and support files;
- records that ref externally when auditability matters;
- uses the correct surface filter;
- treats surface flags as publication controls only;
- collects and validates structured adaptation values before rendering;
- builds a full install plan before writing files;
- fetches only listed `scripts` and `references` support paths from the selected ref;
- renders `{{adapt.key}}` tokens in `DAEMON.md`, scripts, and references before writing any file;
- rejects malformed, unknown, missing, or unresolved adaptation tokens across all planned files;
- validates rendered `DAEMON.md` before writing files;
- writes rendered planned files under `.agents/daemons/<id>/` while preserving package-relative paths;
- excludes `example.yml` and unlisted files;
- handles support script executable mode intentionally;
- preserves existing collision, preflight, and human-review gates;
- links readers to the public daemon docs for daemon semantics.
