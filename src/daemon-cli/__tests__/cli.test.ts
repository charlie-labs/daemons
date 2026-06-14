import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseExamplesCatalogValue } from '../../examples/schema';
import type { ExamplesCatalog } from '../../examples/types';
import { executeCli } from '../cli';
import { createDaemonInstallPlan } from '../install-plan';
import type { CatalogClient } from '../types';
import { validateCronExpression } from '../validation/cron';

const readyDaemon = `---
id: ready-daemon
purpose: Keep the fixture ready.
watch:
  - when a pull request changes files under src/
routines:
  - inspect the change and report bounded findings
deny:
  - do not merge pull requests
schedule: "0 9 * * 1-5"
---

# Ready daemon

Use this fixture for CLI tests.
`;

const deprecatedDaemon = `---
id: deprecated-daemon
purpose: Keep the deprecated fixture valid.
watch:
  - when a deprecated test event occurs
routines:
  - no-op safely
deny:
  - do not mutate production resources
---

# Deprecated daemon

Deprecated fixture content.
`;

const catalog: ExamplesCatalog = {
  schemaVersion: 1,
  source: {
    repository: 'charlie-labs/daemons',
    baseDirectory: 'daemons',
  },
  examples: [
    {
      id: 'ready-daemon',
      title: 'Ready daemon',
      status: 'ready',
      summary: 'A ready daemon fixture.',
      readiness: 'adapt-before-use',
      showOnWebsite: true,
      showInDashboard: true,
      fit: {
        jobsToBeDone: ['operate'],
        bestFor: ['tests'],
        notFor: ['production without edits'],
      },
      requirements: {
        requiredIntegrations: ['github'],
        optionalIntegrations: ['linear'],
        other: ['repo-specific commands'],
      },
      adaptation: {
        mustCustomize: ['Replace fixture paths.', 'Confirm verification commands.'],
      },
      daemon: {
        path: 'DAEMON.md',
        content: readyDaemon,
      },
      scripts: ['scripts/run.sh'],
      references: ['references/guide.md'],
      source: {
        directory: 'daemons/ready-daemon',
        url: 'https://github.com/charlie-labs/daemons/tree/master/daemons/ready-daemon',
      },
    },
    {
      id: 'deprecated-daemon',
      title: 'Deprecated daemon',
      status: 'deprecated',
      summary: 'A deprecated daemon fixture.',
      readiness: 'adapt-before-use',
      showOnWebsite: false,
      showInDashboard: false,
      fit: {
        jobsToBeDone: ['operate'],
        bestFor: ['legacy tests'],
        notFor: ['new installs'],
      },
      requirements: {
        requiredIntegrations: ['github'],
        optionalIntegrations: [],
        other: [],
      },
      adaptation: {
        mustCustomize: ['Confirm this deprecated pattern is still wanted.'],
      },
      daemon: {
        path: 'DAEMON.md',
        content: deprecatedDaemon,
      },
      scripts: [],
      references: [],
      source: {
        directory: 'daemons/deprecated-daemon',
        url: 'https://github.com/charlie-labs/daemons/tree/master/daemons/deprecated-daemon',
      },
    },
  ],
};

function memoryCatalogClient(overrides: Partial<Record<string, string>> = {}): CatalogClient {
  const files = new Map<string, string>([
    ['test-ref:daemons/ready-daemon/scripts/run.sh', '#!/usr/bin/env bash\necho ready\n'],
    ['test-ref:daemons/ready-daemon/references/guide.md', '# Guide\n\nAdapt me.\n'],
    ['master:daemons/ready-daemon/scripts/run.sh', '#!/usr/bin/env bash\necho ready\n'],
    ['master:daemons/ready-daemon/references/guide.md', '# Guide\n\nAdapt me.\n'],
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      files.set(key, value);
    }
  }

  return {
    async loadCatalog(): Promise<ExamplesCatalog> {
      return catalog;
    },
    async readTextFile(ref: string, filePath: string): Promise<string> {
      const key = `${ref}:${filePath}`;
      const value = files.get(key);
      if (value === undefined) {
        throw new Error(`missing mock file ${key}`);
      }
      return value;
    },
  };
}

async function withTempDir(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'daemon-cli-test-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runJson(argv: string[], cwd: string, client: CatalogClient = memoryCatalogClient()): Promise<{ code: number; stdout: string; stderr: string; json: any }> {
  let stdout = '';
  let stderr = '';
  const code = await executeCli({
    argv: [...argv, '--json'],
    catalogClient: client,
    output: {
      cwd,
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    },
  });
  return { code, stdout, stderr, json: JSON.parse(stdout) };
}

describe('daemon CLI catalog commands', () => {
  test('list returns stable JSON envelope with pinned ref', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['list', '--ref', 'test-ref'], directory);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.json).toMatchObject({
        command: 'list',
        ok: true,
        exitCode: 0,
        data: {
          sourceRef: 'test-ref',
          exampleIds: ['ready-daemon', 'deprecated-daemon'],
        },
      });
    });
  });

  test('show exposes support files, integrations, and adaptationsRequired', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['show', 'ready-daemon', '--ref', 'test-ref'], directory);

      expect(result.code).toBe(0);
      expect(result.json.data).toMatchObject({
        id: 'ready-daemon',
        status: 'ready',
        readiness: 'adapt-before-use',
        requiredIntegrations: ['github'],
        optionalIntegrations: ['linear'],
        scripts: ['scripts/run.sh'],
        references: ['references/guide.md'],
        adaptationsRequired: ['Replace fixture paths.', 'Confirm verification commands.'],
      });
      expect(result.json.data.activationRequired).toContain('not active until');
    });
  });

  test('add dry-run plans catalog-listed files without writing them', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['add', 'ready-daemon', '--ref', 'test-ref', '--dry-run'], directory);

      expect(result.code).toBe(0);
      expect(result.json.data).toMatchObject({
        dryRun: true,
        fileCount: 3,
        filesWritten: [],
        adaptationsRequired: ['Replace fixture paths.', 'Confirm verification commands.'],
      });
      expect(result.json.data.filesPlanned).toEqual([
        {
          sourcePath: 'daemons/ready-daemon/DAEMON.md',
          destinationPath: '.agents/daemons/ready-daemon/DAEMON.md',
          kind: 'daemon',
          mode: '100644',
        },
        {
          sourcePath: 'daemons/ready-daemon/scripts/run.sh',
          destinationPath: '.agents/daemons/ready-daemon/scripts/run.sh',
          kind: 'script',
          mode: '100755',
        },
        {
          sourcePath: 'daemons/ready-daemon/references/guide.md',
          destinationPath: '.agents/daemons/ready-daemon/references/guide.md',
          kind: 'reference',
          mode: '100644',
        },
      ]);
      await expect(readFile(path.join(directory, '.agents/daemons/ready-daemon/DAEMON.md'), 'utf8')).rejects.toThrow();
    });
  });

  test('install writes DAEMON.md and only catalog-listed support files', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['install', 'ready-daemon', '--ref', 'test-ref'], directory);

      expect(result.code).toBe(0);
      expect(result.json.command).toBe('install');
      expect(result.json.data.filesWritten).toEqual([
        '.agents/daemons/ready-daemon/DAEMON.md',
        '.agents/daemons/ready-daemon/scripts/run.sh',
        '.agents/daemons/ready-daemon/references/guide.md',
      ]);
      await expect(readFile(path.join(directory, '.agents/daemons/ready-daemon/example.yml'), 'utf8')).rejects.toThrow();
      await expect(readFile(path.join(directory, '.agents/daemons/ready-daemon/DAEMON.md'), 'utf8')).resolves.toContain('id: ready-daemon');
      await expect(readFile(path.join(directory, '.agents/daemons/ready-daemon/scripts/run.sh'), 'utf8')).resolves.toContain('echo ready');
      const daemonMode = (await stat(path.join(directory, '.agents/daemons/ready-daemon/DAEMON.md'))).mode;
      const scriptMode = (await stat(path.join(directory, '.agents/daemons/ready-daemon/scripts/run.sh'))).mode;
      const referenceMode = (await stat(path.join(directory, '.agents/daemons/ready-daemon/references/guide.md'))).mode;
      expect(daemonMode & 0o777).toBe(0o644);
      expect(scriptMode & 0o777).toBe(0o755);
      expect(referenceMode & 0o777).toBe(0o644);
    });
  });

  test('add refuses collisions unless forced', async () => {
    await withTempDir(async (directory) => {
      await mkdir(path.join(directory, '.agents/daemons/ready-daemon'), { recursive: true });
      await writeFile(path.join(directory, '.agents/daemons/ready-daemon/DAEMON.md'), 'existing', 'utf8');

      const blocked = await runJson(['add', 'ready-daemon'], directory);
      expect(blocked.code).toBe(65);
      expect(blocked.json).toMatchObject({ ok: false, exitCode: 65 });
      expect(blocked.json.data.collisions).toEqual([
        '.agents/daemons/ready-daemon/',
        '.agents/daemons/ready-daemon/DAEMON.md',
      ]);

      const forced = await runJson(['add', 'ready-daemon', '--force'], directory);
      expect(forced.code).toBe(0);
      expect(forced.json.data.overwritten).toBe(true);
      await expect(readFile(path.join(directory, '.agents/daemons/ready-daemon/DAEMON.md'), 'utf8')).resolves.toContain('id: ready-daemon');
    });
  });

  test('install planner validates paths, support files, and file modes before writes', async () => {
    await withTempDir(async (directory) => {
      const entry = catalog.examples[0]!;
      const result = createDaemonInstallPlan({ entry, installRoot: directory });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new TypeError('Expected install plan to be valid.');
      }

      expect(result.plan.destinationDirectory).toBe(path.join(directory, '.agents/daemons/ready-daemon'));
      expect(result.plan.files).toEqual([
        {
          sourcePath: 'daemons/ready-daemon/DAEMON.md',
          destinationPath: path.join(directory, '.agents/daemons/ready-daemon/DAEMON.md'),
          kind: 'daemon',
          mode: '100644',
        },
        {
          sourcePath: 'daemons/ready-daemon/scripts/run.sh',
          destinationPath: path.join(directory, '.agents/daemons/ready-daemon/scripts/run.sh'),
          kind: 'script',
          mode: '100755',
        },
        {
          sourcePath: 'daemons/ready-daemon/references/guide.md',
          destinationPath: path.join(directory, '.agents/daemons/ready-daemon/references/guide.md'),
          kind: 'reference',
          mode: '100644',
        },
      ]);
      expect(result.plan.files.some((file) => file.sourcePath.endsWith('/example.yml'))).toBe(false);
    });
  });

  test('install planner rejects unsafe catalog source and support paths', async () => {
    await withTempDir(async (directory) => {
      const unsafeEntry: ExamplesCatalog['examples'][number] = {
        ...catalog.examples[0]!,
        scripts: ['scripts/../escape.sh'],
        references: ['other/guide.md'],
        source: {
          directory: 'daemons/other-daemon',
          url: 'https://github.com/charlie-labs/daemons/tree/master/daemons/other-daemon',
        },
      };

      const result = createDaemonInstallPlan({ entry: unsafeEntry, installRoot: directory });
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected install plan to be invalid.');
      }

      const codes = result.errors.map((error) => error.code);
      expect(codes).toContain('INVALID_CATALOG_SOURCE_DIRECTORY');
      expect(codes).toContain('INVALID_CATALOG_PATH');
      expect(codes).toContain('INVALID_CATALOG_SUPPORT_PATH');
    });
  });

  test('deprecated examples are blocked by default and allowed with explicit flag', async () => {
    await withTempDir(async (directory) => {
      const blocked = await runJson(['add', 'deprecated-daemon'], directory);
      expect(blocked.code).toBe(65);
      expect(blocked.json.errors[0].code).toBe('DEPRECATED_EXAMPLE_BLOCKED');
      expect(blocked.json.data.adaptationsRequired).toEqual(['Confirm this deprecated pattern is still wanted.']);

      const allowed = await runJson(['add', 'deprecated-daemon', '--allow-deprecated'], directory);
      expect(allowed.code).toBe(0);
      await expect(readFile(path.join(directory, '.agents/daemons/deprecated-daemon/DAEMON.md'), 'utf8')).resolves.toContain('Deprecated daemon');
    });
  });
});

const adaptiveDaemon = `---
id: adaptive-daemon
purpose: Keep {{adapt.repo}} tidy.
watch:
  - when a pull request changes files under src/
routines:
  - inspect the change on {{adapt.base_branch}} and report findings
deny:
  - do not merge pull requests
---

# Adaptive daemon

Target repo {{adapt.repo}} on base branch {{adapt.base_branch}}.
`;

const adaptiveReference = '# Setup\n\nConfigure {{adapt.repo}} before enabling.\n';

const undeclaredTokenDaemon = `---
id: bad-token-daemon
purpose: Watch {{adapt.ghost}}.
watch:
  - when something changes
routines:
  - do a bounded thing
deny:
  - do not mutate prod
---

# Bad token daemon

Uses an undeclared {{adapt.ghost}} token.
`;

const adaptiveCatalog: ExamplesCatalog = {
  schemaVersion: 1,
  source: { repository: 'charlie-labs/daemons', baseDirectory: 'daemons' },
  examples: [
    {
      id: 'adaptive-daemon',
      title: 'Adaptive daemon',
      status: 'ready',
      summary: 'An adaptation fixture.',
      readiness: 'adapt-before-use',
      showOnWebsite: true,
      showInDashboard: true,
      fit: { jobsToBeDone: ['operate'], bestFor: ['tests'], notFor: ['prod'] },
      requirements: { requiredIntegrations: ['github'], optionalIntegrations: [], other: [] },
      adaptation: { mustCustomize: ['Set the repo.'] },
      adaptations: [
        { key: 'base_branch', label: 'Base branch', description: 'Default branch', required: false, default: 'main' },
        { key: 'repo', label: 'Repository', description: 'Target repository', required: true },
      ],
      daemon: { path: 'DAEMON.md', content: adaptiveDaemon },
      scripts: [],
      references: ['references/setup.md'],
      source: {
        directory: 'daemons/adaptive-daemon',
        url: 'https://github.com/charlie-labs/daemons/tree/master/daemons/adaptive-daemon',
      },
    },
    {
      id: 'bad-token-daemon',
      title: 'Bad token daemon',
      status: 'ready',
      summary: 'A daemon with an undeclared token.',
      readiness: 'adapt-before-use',
      showOnWebsite: true,
      showInDashboard: true,
      fit: { jobsToBeDone: ['operate'], bestFor: ['tests'], notFor: ['prod'] },
      requirements: { requiredIntegrations: ['github'], optionalIntegrations: [], other: [] },
      adaptation: { mustCustomize: ['Fix the token.'] },
      adaptations: [],
      daemon: { path: 'DAEMON.md', content: undeclaredTokenDaemon },
      scripts: [],
      references: [],
      source: {
        directory: 'daemons/bad-token-daemon',
        url: 'https://github.com/charlie-labs/daemons/tree/master/daemons/bad-token-daemon',
      },
    },
  ],
};

function adaptiveCatalogClient(): CatalogClient {
  const files = new Map<string, string>([
    ['master:daemons/adaptive-daemon/references/setup.md', adaptiveReference],
  ]);
  return {
    async loadCatalog(): Promise<ExamplesCatalog> {
      return adaptiveCatalog;
    },
    async readTextFile(ref: string, filePath: string): Promise<string> {
      const value = files.get(`${ref}:${filePath}`);
      if (value === undefined) {
        throw new Error(`missing mock file ${ref}:${filePath}`);
      }
      return value;
    },
  };
}

describe('daemon CLI adaptation rendering', () => {
  test('install renders declared tokens in DAEMON.md and support files', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(
        ['install', 'adaptive-daemon', '--adapt', 'repo=acme/web', '--adapt', 'base_branch=develop'],
        directory,
        adaptiveCatalogClient()
      );

      expect(result.code).toBe(0);
      expect(result.json.data.adaptationsApplied).toEqual(['base_branch', 'repo']);

      const daemon = await readFile(path.join(directory, '.agents/daemons/adaptive-daemon/DAEMON.md'), 'utf8');
      expect(daemon).toContain('purpose: Keep acme/web tidy.');
      expect(daemon).toContain('Target repo acme/web on base branch develop.');
      expect(daemon).not.toContain('{{');

      const reference = await readFile(path.join(directory, '.agents/daemons/adaptive-daemon/references/setup.md'), 'utf8');
      expect(reference).toContain('Configure acme/web before enabling.');
      expect(reference).not.toContain('{{');
    });
  });

  test('optional adaptation falls back to its default when omitted', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['install', 'adaptive-daemon', '--adapt', 'repo=acme/web'], directory, adaptiveCatalogClient());

      expect(result.code).toBe(0);
      const daemon = await readFile(path.join(directory, '.agents/daemons/adaptive-daemon/DAEMON.md'), 'utf8');
      expect(daemon).toContain('on base branch main.');
    });
  });

  test('--adapt flags override --adapt-file values', async () => {
    await withTempDir(async (directory) => {
      const adaptFile = path.join(directory, 'adapt.json');
      await writeFile(adaptFile, JSON.stringify({ repo: 'acme/from-file', base_branch: 'from-file' }), 'utf8');

      const result = await runJson(
        ['install', 'adaptive-daemon', '--adapt-file', 'adapt.json', '--adapt', 'repo=acme/from-cli'],
        directory,
        adaptiveCatalogClient()
      );

      expect(result.code).toBe(0);
      const daemon = await readFile(path.join(directory, '.agents/daemons/adaptive-daemon/DAEMON.md'), 'utf8');
      expect(daemon).toContain('Keep acme/from-cli tidy.');
      expect(daemon).toContain('on base branch from-file.');
    });
  });

  test('dry-run resolves and validates without writing files', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['add', 'adaptive-daemon', '--dry-run', '--adapt', 'repo=acme/web'], directory, adaptiveCatalogClient());

      expect(result.code).toBe(0);
      expect(result.json.data.adaptationsApplied).toEqual(['base_branch', 'repo']);
      expect(result.json.data.filesWritten).toEqual([]);
      await expect(readFile(path.join(directory, '.agents/daemons/adaptive-daemon/DAEMON.md'), 'utf8')).rejects.toThrow();
    });
  });

  test('missing required adaptation fails closed without writing files', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['add', 'adaptive-daemon'], directory, adaptiveCatalogClient());

      expect(result.code).toBe(65);
      expect(result.json.errors.map((error: { code: string }) => error.code)).toContain('MISSING_REQUIRED_ADAPTATION');
      await expect(readFile(path.join(directory, '.agents/daemons/adaptive-daemon/DAEMON.md'), 'utf8')).rejects.toThrow();
    });
  });

  test('unknown input keys are rejected', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(
        ['add', 'adaptive-daemon', '--adapt', 'repo=acme/web', '--adapt', 'mystery=value'],
        directory,
        adaptiveCatalogClient()
      );

      expect(result.code).toBe(65);
      expect(result.json.errors.map((error: { code: string }) => error.code)).toContain('UNKNOWN_ADAPTATION_INPUT_KEY');
    });
  });

  test('malformed --adapt flags are a usage error', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['add', 'adaptive-daemon', '--adapt', 'oops'], directory, adaptiveCatalogClient());

      expect(result.code).toBe(64);
      expect(result.json.errors[0].code).toBe('ADAPT_FLAG_INVALID');
    });
  });

  test('undeclared tokens in catalog content fail at render time', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['add', 'bad-token-daemon'], directory, adaptiveCatalogClient());

      expect(result.code).toBe(65);
      expect(result.json.errors.map((error: { code: string }) => error.code)).toContain('UNKNOWN_ADAPTATION_TOKEN');
      await expect(readFile(path.join(directory, '.agents/daemons/bad-token-daemon/DAEMON.md'), 'utf8')).rejects.toThrow();
    });
  });
});

describe('daemon CLI validation', () => {
  test('validate reports cron, unknown key, body, and slug errors with exit 65', async () => {
    await withTempDir(async (directory) => {
      const daemonPath = path.join(directory, '.agents/daemons/path-id/DAEMON.md');
      await mkdir(path.dirname(daemonPath), { recursive: true });
      await writeFile(
        daemonPath,
        `---
id: wrong-id
purpose: Bad daemon
watch: []
routines:
  - do bad things
schedule: "70 99 * * *"
readiness: adapt-before-use
---
`,
        'utf8'
      );

      const result = await runJson(['validate', daemonPath], directory);
      expect(result.code).toBe(65);
      const codes = result.json.errors.map((error: { code: string }) => error.code);
      expect(codes).toContain('FRONTMATTER_SCHEDULE_INVALID_CRON');
      expect(codes).toContain('FRONTMATTER_CATALOG_METADATA_NOT_ALLOWED');
      expect(codes).toContain('DAEMON_BODY_MISSING');
      // Schema errors are returned before path consistency checks because the daemon is not canonical yet.
    });
  });

  test('validate enforces directory slug consistency for runtime daemon files', async () => {
    await withTempDir(async (directory) => {
      const daemonPath = path.join(directory, '.agents/daemons/path-id/DAEMON.md');
      await mkdir(path.dirname(daemonPath), { recursive: true });
      await writeFile(
        daemonPath,
        readyDaemon.replace('id: ready-daemon', 'id: wrong-id'),
        'utf8'
      );

      const result = await runJson(['validate', daemonPath], directory);
      expect(result.code).toBe(65);
      expect(result.json.errors).toContainEqual(expect.objectContaining({ code: 'DAEMON_ID_PATH_MISMATCH' }));
    });
  });

  test('validate --all discovers runtime DAEMON.md files and supports dry-run no-op output', async () => {
    await withTempDir(async (directory) => {
      const goodPath = path.join(directory, '.agents/daemons/ready-daemon/DAEMON.md');
      const badPath = path.join(directory, '.agents/daemons/bad-daemon/DAEMON.md');
      await mkdir(path.dirname(goodPath), { recursive: true });
      await mkdir(path.dirname(badPath), { recursive: true });
      await writeFile(goodPath, readyDaemon, 'utf8');
      await writeFile(badPath, readyDaemon.replace('id: ready-daemon', 'name: bad-daemon'), 'utf8');

      const result = await runJson(['validate', '--all', '--dry-run'], directory);
      expect(result.code).toBe(65);
      expect(result.json.data).toMatchObject({ dryRun: true, fileCount: 2, validCount: 1, invalidCount: 1 });
      expect(result.json.warnings).toContainEqual(expect.objectContaining({ code: 'VALIDATE_DRY_RUN_NOOP' }));
      expect(result.json.errors).toContainEqual(expect.objectContaining({ code: 'FRONTMATTER_LEGACY_KEY_NOT_ALLOWED' }));
    });
  });

  test('usage errors use exit code 64', async () => {
    await withTempDir(async (directory) => {
      const result = await runJson(['validate'], directory);
      expect(result.code).toBe(64);
      expect(result.json).toMatchObject({ ok: false, exitCode: 64 });
    });
  });
});

describe('daemon CLI catalog and cron helpers', () => {
  test('unsupported catalog schema versions fail closed', () => {
    const result = parseExamplesCatalogValue({ value: { ...catalog, schemaVersion: 999 }, path: 'examples.json' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({ code: 'unsupported_catalog_schema_version' }));
    }
  });

  test('cron validator returns field-level reasons', () => {
    expect(validateCronExpression({ cronExpression: '0 9 * * 1-5' })).toMatchObject({ ok: true });
    expect(validateCronExpression({ cronExpression: '99 9 * * *' })).toMatchObject({
      ok: false,
      reason: 'cron:minute value out of range',
    });
  });
});
