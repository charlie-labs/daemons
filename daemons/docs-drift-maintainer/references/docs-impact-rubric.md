# Docs impact rubric

Documentation is likely impacted when a change touches:

- exported APIs or public interfaces
- setup, install, build, test, or deployment commands
- configuration files users or operators edit
- service routes, CLI commands, or environment variables
- errors, alerts, runbooks, or operational procedures
- examples, templates, or generated starter code

Skip documentation updates when:

- the change is purely implementation detail and not user/operator visible
- docs already mention the new behavior accurately
- behavior is unclear and no source evidence resolves it
- generated docs should be updated by a separate tool

Prefer targeted updates that keep current docs accurate over broad rewrites.
