import { describe, expect, test } from 'vitest';
import { getDaemonExample, listDaemonExamples, loadDaemonExamplesCatalog } from '../daemon-examples';

describe('daemon examples package API', () => {
  test('loads, lists, and shows examples from the packaged catalog', async () => {
    const catalog = await loadDaemonExamplesCatalog();
    const examples = await listDaemonExamples();
    const firstExample = examples[0];

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.source.repository).toBe('charlie-labs/daemons');
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.map((example) => example.id)).toEqual(catalog.examples.map((example) => example.id));
    expect(firstExample).toBeDefined();
    expect(firstExample?.adaptations).toBeDefined();

    const shown = await getDaemonExample(firstExample!.id);
    expect(shown).toMatchObject({
      id: firstExample!.id,
      daemon: { path: 'DAEMON.md' },
    });

    await expect(getDaemonExample('missing-daemon-example')).resolves.toBeNull();
  });
});
