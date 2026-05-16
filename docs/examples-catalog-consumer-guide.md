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
| `id`, `title`, `summary`, `status`, `readiness` | Display, filtering, matching, and adaptation guidance. |
| `showOnWebsite`, `showInDashboard` | Publication controls for specific surfaces. |
| `fit`, `requirements`, `adaptation` | Recommendation, prerequisites, and required customization copy. |
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
| `direct-copy` | The catalog declares no required `adaptation.mustCustomize` items. Consumers still need local verification before enabling the daemon. |
| `adapt-before-use` | The consumer should surface or enforce every item in `adaptation.mustCustomize` before install or enablement. |

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
6. Write `entry.daemon.content` to `.agents/daemons/<id>/DAEMON.md`.
7. Fetch each listed support file in `entry.scripts` and `entry.references` from the same ref.
8. Write support files under `.agents/daemons/<id>/` using the same package-relative paths.
9. Exclude `example.yml` and all unlisted upstream files.
10. Run the consumer's preflight, collision, review, and rollout checks before enabling the daemon.

Path mapping example:

```text
source:      daemons/js-ts-dependency-upgrades/references/package-manager-adaptation.md
installed:   .agents/daemons/js-ts-dependency-upgrades/references/package-manager-adaptation.md
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

await writeFile(
  `.agents/daemons/${entry.id}/DAEMON.md`,
  entry.daemon.content,
);

for (const supportPath of [...entry.scripts, ...entry.references]) {
  const sourcePath = `${entry.source.directory}/${supportPath}`;
  const content = await fetchText("charlie-labs/daemons", ref, sourcePath);

  await writeFile(
    `.agents/daemons/${entry.id}/${supportPath}`,
    content,
  );
}
```

This is intentionally not a recursive copy. The catalog controls the install set.

## Support-file caveats

Catalog v1 lists support file paths, not file contents or mode metadata.

If a support script requires executable bits, consumers that write through GitHub APIs should either preserve or set `100755` through tree APIs, or invoke the script through an interpreter instead of relying on executable mode. For example, the current catalog includes:

```text
daemons/js-ts-dependency-upgrades/references/package-manager-adaptation.md
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
- an `adapt-before-use` example has not had required customization reviewed.

Consumers may still display a non-installable entry for browsing if the surface clearly separates browsing from installation. Do not convert browsing eligibility into install eligibility.

## Consumer checklist

Before shipping a catalog integration, verify that it:

- fetches `examples.json` instead of crawling `daemons/`;
- validates `schemaVersion === 1`;
- uses one selected source ref for catalog and support files;
- records that ref externally when auditability matters;
- uses the correct surface filter;
- treats surface flags as publication controls only;
- uses `entry.daemon.content` for rendered or installed `DAEMON.md`;
- fetches only listed `scripts` and `references` support paths;
- preserves package-relative paths under `.agents/daemons/<id>/`;
- excludes `example.yml` and unlisted files;
- handles support script executable mode intentionally;
- preserves existing collision, preflight, and human-review gates;
- links readers to the public daemon docs for daemon semantics.
