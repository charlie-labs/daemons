import { describe, expect, test } from 'vitest';
import { getDaemonExample, listDaemonExamples, loadDaemonExamplesCatalog } from '../daemon-examples';
import { parseDaemonMarkdown } from '../examples/schema';

describe('daemon examples package API', () => {
  test('loads, lists, and shows examples from the packaged catalog', async () => {
    const catalog = await loadDaemonExamplesCatalog();
    const examples = await listDaemonExamples();
    const firstExample = examples[0];

    expect(catalog.schemaVersion).toBe(2);
    expect(catalog.source.repository).toBe('charlie-labs/daemons');
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.map((example) => example.id)).toEqual(catalog.examples.map((example) => example.id));
    expect(firstExample).toBeDefined();
    expect(firstExample?.adaptations).toBeDefined();
    expect(firstExample?.specializationIdeas).toBeDefined();

    const shown = await getDaemonExample(firstExample!.id);
    expect(shown).toMatchObject({
      id: firstExample!.id,
      daemon: { path: 'DAEMON.md' },
    });

    await expect(getDaemonExample('missing-daemon-example')).resolves.toBeNull();
  });

  test('retains every PR review activation path in the packaged catalog', async () => {
    const example = await getDaemonExample('pr-review');
    expect(example).not.toBeNull();

    const parsed = parseDaemonMarkdown({
      content: example!.daemon.content,
      path: 'daemons/pr-review/DAEMON.md',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new TypeError('Expected the packaged pr-review daemon to be valid.');
    }

    expect(parsed.value.frontmatter.watch).toEqual([
      'A non-draft pull request is opened.',
      'A draft pull request is marked ready for review.',
      'A new commit is pushed to an open non-draft pull request.',
      'The user CharlieHelps is requested as a reviewer.',
      'A comment on a pull request requests a review from CharlieHelps.',
    ]);
    expect(parsed.value.frontmatter.schedule).toBe('0 9 * * 1');
  });
});
