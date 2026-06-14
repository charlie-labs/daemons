# Changelog

## 2.0.0 - 2026-06-14

- Bump the daemon examples catalog schema to `schemaVersion: 2` for structured adaptation inputs.
- Align the `@charlie-labs/daemons` package and CLI version with the v2 catalog contract.
- Breaking: once the v2 catalog reaches `master`, old `@charlie-labs/daemons@0.0.1` clients that read the default catalog will fail closed on the unsupported schema. Upgrade to `@charlie-labs/daemons@2.0.0` before consuming `master`.

## 0.0.1 - 2026-05-21

- Initial public release of the `@charlie-labs/daemons` package and `daemon` CLI.
- Includes the generated daemon examples catalog, CLI browsing/scaffolding/validation commands, and release automation bootstrap.
