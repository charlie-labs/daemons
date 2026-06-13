# Repo-local Charlie daemons

This directory contains active repo-local daemon definitions for `charlie-labs/daemons`.

These files are not public catalog example packages. The public examples live under `daemons/<id>/`; the definitions here are the functioning daemon configurations this repository intends Charlie to use after they are merged to the default branch and ingested.

When editing these files:

- follow the public daemon docs linked from `AGENTS.md`;
- keep each daemon narrow, explicit, and safe to run repeatedly;
- run `bunx @charlie-labs/daemons validate --all` before opening a PR.
