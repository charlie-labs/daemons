# Repo-local daemons

The directories in this folder are installed Charlie daemon definitions for `charlie-labs/daemons`.

When merged to the default branch and ingested by Charlie, each `DAEMON.md` file here is a functioning repo-local daemon policy for this repository. These are not public example packages or catalog sources.

Public examples live under `daemons/<id>/`, and the generated `examples.json` catalog is built from those example packages.

Current repo-local daemons:

- `docs-drift-maintainer`
- `docs-stale-maintainer`
- `js-ts-dependency-upgrades`
- `pr-check-repair`
- `pr-merge-conflict-repair`
- `pr-metadata`
- `pr-review-triage`

When adding or editing repo-local daemons from catalog examples, prefer the daemon CLI and validate the runtime files:

```bash
bunx @charlie-labs/daemons validate --all
```
