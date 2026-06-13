# Examples catalog consumer guide

This guide is for product surfaces, docs sites, installers, and internal tools that consume the generated `examples.json` catalog from `charlie-labs/daemons`.

Use [Examples v2 package and catalog spec](./examples-spec.md) as the normative schema contract. Use [Examples authoring guide](./examples-authoring-guide.md) for how examples are authored and reviewed. The public daemon docs remain the source of truth for what `DAEMON.md` means at runtime.

The package and catalog effort is called Examples v2. The current generated catalog still uses `schemaVersion: 1`. Consumers should validate the numeric catalog schema version, not the project nickname.

## Consumer responsibilities

Consumers should:

- fetch repository-root `examples.json` instead of crawling `daemons/`;
- select one source ref for the catalog and any support files;
- validate `schemaVersion === 1` and fail closed on unsupported versions;
- use catalog metadata for discovery, filtering, cards, and install decisions;
- use `entry.daemon.content` as the `DAEMON.md` source for install or rendering;
- fetch only the support paths listed in `entry.scripts` and `entry.references`;
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
  "schemaVersion": 1,
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

Support file contents are not embedded in v1. Fetch each listed support file from `entry.source.directory` at the same source ref used for the catalog.

## Source refs

Use one source ref for the catalog and all support-file fetches in a single consume/install operation.

| Consumer goal | Recommended ref |
| --- | --- |
| Reproducible install or audit trail | A commit SHA. |
| Intentionally latest internal surface | `master`. |
| Website or docs deployment | A deployment-pinned ref chosen by that deployment. |

Catalog v1 intentionally omits nondeterministic fields such as `generatedAt` and `sourceCommit`. If a consumer needs auditability, record the selected source ref in the consuming system, install metadata, PR body, or deployment logs.

Example install metadata:

```json
{
  "catalogRepository": "charlie-labs/daemons",
  "catalogRef": "11da8066b1e0cf968d07ce512f65a9a817f9bc10",
  "catalogSchemaVersion": 1,
  "exampleId": "dependency-upgrades"
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

Install consumers should merge values deterministically in this order: optional defaults, then adaptation-file values, then explicit CLI/UI values. Values are strings only. Reject unknown input keys, missing required keys, non-string values, unknown `{{adapt.*}}` tokens, and rendered files that still contain `{{adapt.*}}` tokens. Do not echo raw caller-provided adaptation values in logs or JSON output; reporting applied keys is sufficient.

## Specialization ideas

`specializationIdeas[]` is display metadata for optional behavior changes a team may consider after install. Consumers may show these ideas in browsing, docs, or review surfaces, but must not treat them as install blockers or adaptation inputs.

## Install algorithm

Install consumers should copy from one catalog entry into:

```text
.agents/daemons/<id>/
```

Recommended flow:

1. Choose a source ref.
2. Fetch `examples.json` from repository root at that ref.
3. Validate `catalog.schemaVersion === 1`.
4. Select an entry from `catalog.examples`.
5. Require `entry.daemon.content` to be present.
6. Render `entry.daemon.content`, validate the rendered runtime daemon, then write it to `.agents/daemons/<id>/DAEMON.md`.
7. Fetch each listed support file in `entry.scripts` and `entry.references` from the same ref.
8. Render support files and write them under `.agents/daemons/<id>/` using the same package-relative paths.
9. Apply planned file modes when the write surface supports them (`100644` for `DAEMON.md`/references, `100755` for scripts).
10. Exclude `example.yml` and all unlisted upstream files.
11. Run the consumer's preflight, collision, review, and rollout checks before enabling the daemon.

Path mapping example:

```text
source:      daemons/github-activity-digest/references/digest-template.md
installed:   .agents/daemons/github-activity-digest/references/digest-template.md
```

TypeScript-shaped pseudocode:

```ts
const catalog = await fetchJson("charlie-labs/daemons", ref, "examples.json");

if (catalog.schemaVersion !== 1) {
  throw new Error(`Unsupported examples catalog schema: ${catalog.schemaVersion}`);
}

const entry = catalog.examples.find((candidate) => candidate.id === exampleId);
if (!entry?.daemon?.content) {
  throw new Error(`Catalog entry ${exampleId} is missing daemon.content`);
}

const renderedDaemon = renderAdaptationTokens(entry.daemon.content, values);
await validateRuntimeDaemonMarkdown(renderedDaemon);

await writeFile(
  `.agents/daemons/${entry.id}/DAEMON.md`,
  renderedDaemon,
);

for (const supportPath of [...entry.scripts, ...entry.references]) {
  const sourcePath = `${entry.source.directory}/${supportPath}`;
  const content = await fetchText("charlie-labs/daemons", ref, sourcePath);
  const renderedContent = renderAdaptationTokens(content, values);

  await writeFile(
    `.agents/daemons/${entry.id}/${supportPath}`,
    renderedContent,
  );
}
```

This is intentionally not a recursive copy. The catalog controls the install set.

## Support-file caveats

Catalog v1 lists support file paths, not file contents or mode metadata. The package install planner derives write modes for consumers that need Git tree file modes: `100644` for `DAEMON.md` and references, `100755` for scripts.

If a consumer works directly from raw catalog JSON without the planner, support scripts may still need explicit executable handling through tree APIs or invocation through an interpreter. For example, the current catalog includes:

```text
daemons/github-activity-digest/references/digest-template.md
```

That support file is listed in the catalog, but v1 does not include support file contents in `examples.json`.

Consumers should treat any support-file fetch failure as a blocking install failure. A partial daemon copy can be misleading if `DAEMON.md` references scripts or reference material that were not installed.

## `DAEMON.md` and catalog metadata

Public daemon docs at `docs.charlielabs.ai` define daemon semantics. `DAEMON.md` frontmatter and body are runtime guidance for Charlie, not a catalog metadata container.

Catalog metadata belongs in `example.yml` and the generated `examples.json`. The v2 schema rejects stale catalog metadata fields in `DAEMON.md`, including fields such as `readiness`, `showOnWebsite`, `showInDashboard`, `bestFor`, `requirements`, `riskTier`, `activationMode`, `display`, and `metadata`.

Consumers should not depend on catalog metadata appearing in `DAEMON.md`, and authors should not add it there for consumer convenience.

## Failure behavior

Consumers should fail closed when:

- `schemaVersion` is not `1`;
- the selected entry is missing;
- `entry.daemon.content` is missing or empty;
- a listed support path cannot be fetched from the selected ref;
- install preflight detects collisions or unsafe local conditions;
- required structured adaptation values are missing or not strings;
- rendered content still contains `{{adapt.*}}` tokens.

Consumers may still display a non-installable entry for browsing if the surface clearly separates browsing from installation. Do not convert browsing eligibility into install eligibility.

## Consumer checklist

Before shipping a catalog integration, verify that it:

- fetches `examples.json` instead of crawling `daemons/`;
- validates `schemaVersion === 1`;
- uses one selected source ref for catalog and support files;
- records that ref externally when auditability matters;
- uses the correct surface filter;
- treats surface flags as publication controls only;
- renders `entry.daemon.content` before installing `DAEMON.md`;
- fetches only listed `scripts` and `references` support paths;
- renders `{{adapt.key}}` tokens in `DAEMON.md`, scripts, and references;
- validates rendered `DAEMON.md` before writing files;
- preserves package-relative paths under `.agents/daemons/<id>/`;
- excludes `example.yml` and unlisted files;
- handles support script executable mode intentionally;
- preserves existing collision, preflight, and human-review gates;
- links readers to the public daemon docs for daemon semantics.
