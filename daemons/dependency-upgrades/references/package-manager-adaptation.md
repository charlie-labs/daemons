# Package manager adaptation

Use repository evidence to choose commands.

## Detection hints

| Evidence                  | Package manager |
| ------------------------- | --------------- |
| `pnpm-lock.yaml`          | pnpm            |
| `yarn.lock`               | Yarn            |
| `package-lock.json`       | npm             |
| `bun.lock` or `bun.lockb` | Bun             |

If multiple lockfiles exist, inspect recent commits and package scripts before acting. If still ambiguous, stop and ask a human.

## Command examples

These examples are starting points. Replace them with repository-specific commands and only use commands that preserve the daemon's patch/minor policy. Do not use `@latest` or major-version update flags unless the daemon policy is explicitly expanded.

pnpm:

```bash
pnpm outdated
pnpm update <package>
pnpm install
pnpm test
```

npm:

```bash
npm outdated
npm update <package>
npm test
```

Yarn:

```bash
yarn outdated
yarn up <package>
yarn test
```

Bun:

```bash
bun outdated
bun update <package>
bun install
bun test
```

Use the repository's own scripts when they are clearer than generic examples.
