import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { generateCatalogFromRepository, serializeCatalog } from '../catalog';
import { isSupportPath } from '../paths';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('examples catalog generator and validator', () => {

  test('validates daemon-directory-relative support path rules', () => {
    expect(isSupportPath('scripts/run.ts', 'scripts')).toBe(true);
    expect(isSupportPath('scripts/nested/run.ts', 'scripts')).toBe(true);
    expect(isSupportPath('/scripts/run.ts', 'scripts')).toBe(false);
    expect(isSupportPath('scripts/../run.ts', 'scripts')).toBe(false);
    expect(isSupportPath('scripts//run.ts', 'scripts')).toBe(false);
    expect(isSupportPath('scripts', 'scripts')).toBe(false);
    expect(isSupportPath('scripts/', 'scripts')).toBe(false);
    expect(isSupportPath('other/run.ts', 'scripts')).toBe(false);
    expect(isSupportPath('references\\run.md', 'references')).toBe(false);
  });

  test('emits empty support arrays when support directories are absent', async () => {
    await withFixture('valid-no-support', async (repoRoot) => {
      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new TypeError('Expected fixture to be valid.');
      }

      expect(result.value.examples).toHaveLength(1);
      expect(result.value.examples[0]?.scripts).toEqual([]);
      expect(result.value.examples[0]?.references).toEqual([]);
      expect(result.value.examples[0]?.specializationIdeas).toEqual([]);
    });
  });

  test('emits empty support arrays when support directories are empty', async () => {
    await withFixture('valid-no-support', async (repoRoot) => {
      await mkdir(join(repoRoot, 'daemons/no-support/scripts'), { recursive: true });
      await mkdir(join(repoRoot, 'daemons/no-support/references'), { recursive: true });

      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new TypeError('Expected fixture to be valid.');
      }

      expect(result.value.examples[0]?.scripts).toEqual([]);
      expect(result.value.examples[0]?.references).toEqual([]);
    });
  });

  test('discovers nested support files in lexicographic order', async () => {
    await withFixture('valid-nested-support', async (repoRoot) => {
      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new TypeError('Expected fixture to be valid.');
      }

      expect(result.value.examples[0]?.scripts).toEqual([
        'scripts/a.ts',
        'scripts/nested/z.ts',
      ]);
      expect(result.value.examples[0]?.references).toEqual([
        'references/a.md',
        'references/nested/z.md',
      ]);
    });
  });

  test('reports ID mismatches across path, example.yml, and DAEMON.md', async () => {
    await withFixture('invalid-id-mismatch', async (repoRoot) => {
      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors.map((error) => error.code)).toContain('id_mismatch');
      expect(result.errors.some((error) => error.path === 'daemons/path-id/example.yml')).toBe(true);
    });
  });

  test('reports stale PR #10023 metadata fields', async () => {
    await withFixture('invalid-stale-metadata', async (repoRoot) => {
      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'stale_metadata_field',
          path: 'daemons/stale-metadata/DAEMON.md',
          fieldPath: 'readiness',
        })
      );
    });
  });

  test('reports invalid DAEMON.md frontmatter and body failures', async () => {
    await withFixture('invalid-daemon-md', async (repoRoot) => {
      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'invalid_daemon_md', path: 'daemons/invalid-daemon/DAEMON.md' })
      );
    });
  });

  test('reports strict example.yml schema failures', async () => {
    await withFixture('invalid-example-yml', async (repoRoot) => {
      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors.map((error) => error.code)).toEqual(
        expect.arrayContaining(['invalid_enum_value', 'unknown_key'])
      );
    });
  });

  test('emits structured adaptations in deterministic key order', async () => {
    await withFixture('valid-no-support', async (repoRoot) => {
      await writeFile(
        join(repoRoot, 'daemons/no-support/example.yml'),
        `id: no-support
title: no support fixture
status: ready
summary: Demonstrates structured adaptation metadata for catalog validation.
readiness: adapt-before-use
showOnWebsite: true
showInDashboard: false
fit:
  jobsToBeDone:
    - daemon-operations
  bestFor:
    - Teams validating the examples catalog generator.
  notFor:
    - Production daemon deployments without local review.
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations: []
  other: []
adaptations:
  - key: target_repo
    label: Target repository
    description: Repository slug to mention in rendered daemon files.
    required: true
    suggestions:
      - owner/repo
  - key: branch_prefix
    label: Branch prefix
    description: Branch prefix for generated work.
    required: false
    default: daemon/example
`,
        'utf8'
      );

      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new TypeError('Expected fixture to be valid.');
      }

      expect(result.value.examples[0]?.adaptations).toEqual([
        {
          key: 'branch_prefix',
          label: 'Branch prefix',
          description: 'Branch prefix for generated work.',
          required: false,
          default: 'daemon/example',
        },
        {
          key: 'target_repo',
          label: 'Target repository',
          description: 'Repository slug to mention in rendered daemon files.',
          required: true,
          suggestions: ['owner/repo'],
        },
      ]);
    });
  });

  test('emits optional specialization ideas', async () => {
    await withFixture('valid-no-support', async (repoRoot) => {
      await writeFile(
        join(repoRoot, 'daemons/no-support/example.yml'),
        `id: no-support
title: no support fixture
status: ready
summary: Demonstrates optional specialization ideas for catalog validation.
readiness: direct-copy
showOnWebsite: true
showInDashboard: false
fit:
  jobsToBeDone:
    - daemon-operations
  bestFor:
    - Teams validating the examples catalog generator.
  notFor:
    - Production daemon deployments without local review.
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations: []
  other: []
specializationIdeas:
  - Restrict the daemon to a narrower repository area.
  - Add a team-specific output format.
`,
        'utf8'
      );

      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new TypeError('Expected fixture to be valid.');
      }

      expect(result.value.examples[0]?.specializationIdeas).toEqual([
        'Restrict the daemon to a narrower repository area.',
        'Add a team-specific output format.',
      ]);
    });
  });

  test('reports invalid specialization ideas', async () => {
    await withFixture('valid-no-support', async (repoRoot) => {
      await writeFile(
        join(repoRoot, 'daemons/no-support/example.yml'),
        `id: no-support
title: no support fixture
status: ready
summary: Demonstrates invalid specialization ideas.
readiness: direct-copy
showOnWebsite: true
showInDashboard: false
fit:
  jobsToBeDone:
    - daemon-operations
  bestFor:
    - Teams validating the examples catalog generator.
  notFor:
    - Production daemon deployments without local review.
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations: []
  other: []
specializationIdeas:
  - ''
`,
        'utf8'
      );

      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'invalid_schema', fieldPath: 'specializationIdeas[0]' })
      );
    });
  });

  test('reports duplicate structured adaptation keys', async () => {
    await withFixture('valid-no-support', async (repoRoot) => {
      await writeFile(
        join(repoRoot, 'daemons/no-support/example.yml'),
        `id: no-support
title: no support fixture
status: ready
summary: Demonstrates duplicate structured adaptation keys.
readiness: adapt-before-use
showOnWebsite: true
showInDashboard: false
fit:
  jobsToBeDone:
    - daemon-operations
  bestFor:
    - Teams validating the examples catalog generator.
  notFor:
    - Production daemon deployments without local review.
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations: []
  other: []
adaptations:
  - key: duplicate_key
    label: Duplicate key one
    description: First duplicate.
    required: true
  - key: duplicate_key
    label: Duplicate key two
    description: Second duplicate.
    required: true
`,
        'utf8'
      );

      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'invalid_field_value', fieldPath: 'adaptations[1].key' })
      );
    });
  });

  test('reports structured adaptation metadata validation failures', async () => {
    await withFixture('valid-no-support', async (repoRoot) => {
      await writeFile(
        join(repoRoot, 'daemons/no-support/example.yml'),
        `id: no-support
title: no support fixture
status: ready
summary: Demonstrates invalid structured adaptation metadata.
readiness: adapt-before-use
showOnWebsite: true
showInDashboard: false
fit:
  jobsToBeDone:
    - daemon-operations
  bestFor:
    - Teams validating the examples catalog generator.
  notFor:
    - Production daemon deployments without local review.
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations: []
  other: []
adaptations:
  - key: 9bad
    label: Bad key
    description: This key is not token safe.
    required: true
    default: should-not-exist
  - key: duplicate_key
    label: Duplicate key one
    description: First duplicate.
    required: false
  - key: duplicate_key
    label: Duplicate key two
    description: Second duplicate.
    required: false
    default: ok
    suggestions:
      - valid
      - 123
`,
        'utf8'
      );

      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'invalid_schema', fieldPath: 'adaptations[0].key' }),
          expect.objectContaining({ code: 'invalid_field_value', fieldPath: 'adaptations[0].default' }),
          expect.objectContaining({ code: 'invalid_field_value', fieldPath: 'adaptations[1].default' }),
          expect.objectContaining({ code: 'invalid_schema', fieldPath: 'adaptations[2].suggestions[1]' }),
        ])
      );
    });
  });

  test('reports public-safety failures in package contents', async () => {
    await withFixture('invalid-public-safety', async (repoRoot) => {
      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'public_safety', path: 'daemons/public-safety/example.yml' })
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'public_safety', path: 'daemons/public-safety/references/secret.md' })
      );
    });
  });

  test('rejects unsupported support-file locations', async () => {
    await withFixture('invalid-unsupported-support', async (repoRoot) => {
      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'unsupported_support_path', path: 'daemons/unsupported-support/notes.md' })
      );
    });
  });

  test('reports duplicate example IDs', async () => {
    await withFixture('valid-no-support', async (repoRoot) => {
      await cp(
        join(repoRoot, 'daemons/no-support'),
        join(repoRoot, 'daemons/duplicate-support'),
        { recursive: true }
      );
      await writeFile(
        join(repoRoot, 'daemons/duplicate-support/DAEMON.md'),
        validDaemonMarkdown('duplicate-support'),
        'utf8'
      );

      const result = await generateCatalogFromRepository(repoRoot);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new TypeError('Expected fixture to be invalid.');
      }

      expect(result.errors.map((error) => error.code)).toContain('duplicate_id');
    });
  });

  test('sorts examples and support paths for deterministic output', async () => {
    await withFixture('deterministic', async (repoRoot) => {
      const first = await generateCatalogFromRepository(repoRoot);
      const second = await generateCatalogFromRepository(repoRoot);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        throw new TypeError('Expected deterministic fixture to be valid.');
      }

      expect(first.value.examples.map((example) => example.id)).toEqual(['alpha-daemon', 'zebra-daemon']);
      expect(first.value.examples[0]?.scripts).toEqual(['scripts/a.ts', 'scripts/b.ts']);
      expect(serializeCatalog(first.value)).toEqual(serializeCatalog(second.value));
    });
  });
});

async function withFixture(
  fixtureName: string,
  run: (repoRoot: string) => Promise<void>
): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), `daemon-examples-${fixtureName}-`));
  try {
    await cp(join(FIXTURES_DIR, fixtureName), tempRoot, { recursive: true });
    await run(tempRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validDaemonMarkdown(id: string): string {
  return `---
id: ${id}
purpose: Keep the ${id} fixture valid for catalog generation tests.
watch:
  - Wake on pull request changes for this fixture.
routines:
  - Inspect the trigger and produce a bounded handoff.
deny:
  - Do not mutate production resources.
---

# ${id}

## Policy

Use only public-safe fixture content and no-op when context is missing.
`;
}
