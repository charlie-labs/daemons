import { describe, expect, test } from 'vitest';
import { parseExampleYaml } from '../schema';

const BASE_YAML = `id: sample-daemon
title: Sample daemon
status: ready
summary: A sample daemon for adaptation schema tests.
readiness: adapt-before-use
showOnWebsite: true
showInDashboard: true
fit:
  jobsToBeDone:
    - operate
  bestFor:
    - Repositories used in tests.
  notFor:
    - Production without edits.
requirements:
  requiredIntegrations:
    - github
  optionalIntegrations: []
  other: []
adaptation:
  mustCustomize:
    - Set the repository.
`;

function withAdaptations(adaptationsYaml: string): string {
  return `${BASE_YAML}adaptations:\n${adaptationsYaml}`;
}

describe('example.yml adaptations schema', () => {
  test('accepts well-formed required and optional adaptations', () => {
    const result = parseExampleYaml({
      content: withAdaptations(
        `  - key: repo
    label: Repository
    description: Target repository.
    required: true
  - key: base_branch
    label: Base branch
    description: Default branch.
    required: false
    default: main
    suggestions:
      - main
      - develop
`
      ),
      path: 'example.yml',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.adaptations).toHaveLength(2);
  });

  test('omitting adaptations is allowed', () => {
    const result = parseExampleYaml({ content: BASE_YAML, path: 'example.yml' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.adaptations).toBeUndefined();
  });

  test('rejects required adaptations that declare a default', () => {
    const result = parseExampleYaml({
      content: withAdaptations(
        `  - key: repo
    label: Repository
    description: Target repository.
    required: true
    default: acme/web
`
      ),
      path: 'example.yml',
    });
    expect(result.ok).toBe(false);
  });

  test('rejects optional adaptations without a default', () => {
    const result = parseExampleYaml({
      content: withAdaptations(
        `  - key: base_branch
    label: Base branch
    description: Default branch.
    required: false
`
      ),
      path: 'example.yml',
    });
    expect(result.ok).toBe(false);
  });

  test('rejects invalid adaptation keys', () => {
    const result = parseExampleYaml({
      content: withAdaptations(
        `  - key: Repo
    label: Repository
    description: Target repository.
    required: true
`
      ),
      path: 'example.yml',
    });
    expect(result.ok).toBe(false);
  });

  test('rejects duplicate adaptation keys', () => {
    const result = parseExampleYaml({
      content: withAdaptations(
        `  - key: repo
    label: Repository
    description: Target repository.
    required: true
  - key: repo
    label: Repository again
    description: Duplicate key.
    required: true
`
      ),
      path: 'example.yml',
    });
    expect(result.ok).toBe(false);
  });
});
