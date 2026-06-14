import { describe, expect, test } from 'vitest';
import {
  knownAdaptationKeys,
  parseAdaptFileContent,
  parseAdaptFlags,
  renderAdaptationTokens,
  resolveAdaptations,
  type AdaptationValues,
} from '../adaptations';
import type { CatalogExample, ExampleAdaptation } from '../../examples/types';

function exampleWithAdaptations(adaptations: ExampleAdaptation[]): CatalogExample {
  return {
    id: 'sample',
    title: 'Sample',
    status: 'ready',
    summary: 'A sample example.',
    readiness: 'adapt-before-use',
    showOnWebsite: true,
    showInDashboard: true,
    fit: { jobsToBeDone: ['operate'], bestFor: ['tests'], notFor: ['prod'] },
    requirements: { requiredIntegrations: ['github'], optionalIntegrations: [], other: [] },
    adaptation: { mustCustomize: ['Customize me.'] },
    adaptations,
    daemon: { path: 'DAEMON.md', content: '---\nid: sample\n---\nbody' },
    scripts: [],
    references: [],
    source: {
      directory: 'daemons/sample',
      url: 'https://github.com/charlie-labs/daemons/tree/master/daemons/sample',
    },
  };
}

function values(record: Record<string, string>): AdaptationValues {
  return new Map(Object.entries(record));
}

describe('parseAdaptFlags', () => {
  test('parses key=value pairs and lets later flags win', () => {
    const result = parseAdaptFlags(['repo=acme/web', 'repo=acme/api', 'base_branch=main']);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(Object.fromEntries(result.values)).toEqual({ repo: 'acme/api', base_branch: 'main' });
  });

  test('keeps values that contain = signs intact', () => {
    const result = parseAdaptFlags(['filter=type==bug']);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.values.get('filter')).toBe('type==bug');
  });

  test('rejects flags without key=value syntax', () => {
    const result = parseAdaptFlags(['oops', '=value']);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors.map((error) => error.code)).toEqual(['ADAPT_FLAG_INVALID', 'ADAPT_FLAG_INVALID']);
  });

  test('rejects keys that do not match the key pattern', () => {
    const result = parseAdaptFlags(['Repo=acme']);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors[0]?.code).toBe('ADAPTATION_KEY_INVALID');
  });
});

describe('parseAdaptFileContent', () => {
  test('parses a JSON object of string values', () => {
    const result = parseAdaptFileContent({ content: '{"repo":"acme/web","base_branch":"main"}', path: 'adapt.json' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(Object.fromEntries(result.values)).toEqual({ repo: 'acme/web', base_branch: 'main' });
  });

  test('rejects invalid JSON', () => {
    const result = parseAdaptFileContent({ content: '{not json', path: 'adapt.json' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors[0]?.code).toBe('ADAPT_FILE_JSON_INVALID');
  });

  test('rejects non-object JSON', () => {
    const result = parseAdaptFileContent({ content: '["a"]', path: 'adapt.json' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors[0]?.code).toBe('ADAPT_FILE_INVALID_TYPE');
  });

  test('rejects non-string values', () => {
    const result = parseAdaptFileContent({ content: '{"repo": 5, "flag": true}', path: 'adapt.json' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors.map((error) => error.code)).toEqual([
      'ADAPT_FILE_VALUE_INVALID_TYPE',
      'ADAPT_FILE_VALUE_INVALID_TYPE',
    ]);
  });
});

describe('resolveAdaptations', () => {
  const entry = exampleWithAdaptations([
    { key: 'repo', label: 'Repository', description: 'Target repo', required: true },
    { key: 'base_branch', label: 'Base branch', description: 'Default branch', required: false, default: 'main' },
  ]);

  test('applies defaults < file < cli precedence', () => {
    const result = resolveAdaptations({
      entry,
      fileValues: values({ repo: 'acme/from-file', base_branch: 'develop' }),
      cliValues: values({ repo: 'acme/from-cli' }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(Object.fromEntries(result.resolution.values)).toEqual({
      repo: 'acme/from-cli',
      base_branch: 'develop',
    });
    expect(result.resolution.appliedKeys).toEqual(['base_branch', 'repo']);
  });

  test('falls back to the optional default when no value is provided', () => {
    const result = resolveAdaptations({
      entry,
      fileValues: values({}),
      cliValues: values({ repo: 'acme/web' }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.resolution.values.get('base_branch')).toBe('main');
  });

  test('rejects missing required values', () => {
    const result = resolveAdaptations({ entry, fileValues: values({}), cliValues: values({}) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_ADAPTATION');
  });

  test('rejects unknown input keys from file and flags', () => {
    const result = resolveAdaptations({
      entry,
      fileValues: values({ mystery: 'x' }),
      cliValues: values({ repo: 'acme/web', other: 'y' }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    const codes = result.errors.map((error) => error.code);
    expect(codes.filter((code) => code === 'UNKNOWN_ADAPTATION_INPUT_KEY')).toHaveLength(2);
  });
});

describe('renderAdaptationTokens', () => {
  const knownKeys = knownAdaptationKeys(
    exampleWithAdaptations([{ key: 'repo', label: 'Repo', description: 'd', required: true }])
  );

  test('replaces declared tokens with provided values', () => {
    const result = renderAdaptationTokens({
      content: 'Repo is {{adapt.repo}} and {{ adapt.repo }}.',
      values: values({ repo: 'acme/web' }),
      knownKeys,
      path: 'DAEMON.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.content).toBe('Repo is acme/web and acme/web.');
  });

  test('leaves non-adaptation mustache tokens untouched', () => {
    const result = renderAdaptationTokens({
      content: 'Keep {{other.thing}} as-is, set {{adapt.repo}}.',
      values: values({ repo: 'acme/web' }),
      knownKeys,
      path: 'DAEMON.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.content).toBe('Keep {{other.thing}} as-is, set acme/web.');
  });

  test('rejects malformed adaptation tokens', () => {
    const result = renderAdaptationTokens({
      content: 'Bad {{adapt.Repo}} token.',
      values: values({ repo: 'acme/web' }),
      knownKeys,
      path: 'DAEMON.md',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors[0]?.code).toBe('MALFORMED_ADAPTATION_TOKEN');
  });

  test('rejects unknown token keys', () => {
    const result = renderAdaptationTokens({
      content: 'Unknown {{adapt.mystery}}.',
      values: values({ repo: 'acme/web' }),
      knownKeys,
      path: 'DAEMON.md',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors[0]?.code).toBe('UNKNOWN_ADAPTATION_TOKEN');
  });

  test('rejects declared tokens that have no resolved value', () => {
    const result = renderAdaptationTokens({
      content: 'Needs {{adapt.repo}}.',
      values: values({}),
      knownKeys,
      path: 'DAEMON.md',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors[0]?.code).toBe('MISSING_ADAPTATION_TOKEN_VALUE');
  });
});
