import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { fetchApprovedCommunitySource, type CommunityGitHubClient } from '../source';
import type { CommunityRegistryEntry } from '../types';

const commit = 'a'.repeat(40);
const daemon = `---\nid: community-daemon\npurpose: Test approved delivery.\nwatch:\n  - when tests run\nroutines:\n  - verify source delivery\ndeny:\n  - do not mutate production\n---\n\n# Community daemon\n\nTest body.\n`;

function hash(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function entry(content = daemon): CommunityRegistryEntry {
  return {
    slug: 'community-daemon', displayName: 'Community daemon', summary: 'Approved.', sourceType: 'community',
    repositoryUrl: 'https://github.com/acme/daemons',
    canonicalSourceUrl: `https://github.com/acme/daemons/blob/${commit}/community/DAEMON.md`,
    daemonPath: 'community/DAEMON.md', commit, integrations: ['github'], approvalStatus: 'approved',
    reviewedFiles: [{ path: 'community/DAEMON.md', mode: '100644', sha256: hash(content) }],
  };
}

function client(args: { content?: Uint8Array | string; tree?: Record<string, unknown>; blob?: Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const content = args.content ?? daemon;
  const bytes = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content);
  const githubClient: CommunityGitHubClient = {
    async request<T>(_method: string, path: string, options?: import('../source').CommunityGitHubRequestOptions): Promise<T> {
      calls.push(`${path}?recursive=${String(options?.query?.recursive ?? '')}`);
      if (path.includes('/git/trees/')) return ({ truncated: false, tree: [{ path: 'community/DAEMON.md', mode: '100644', type: 'blob', sha: 'blob-sha' }], ...args.tree } as T);
      if (path.includes('/git/blobs/')) return ({ encoding: 'base64', content: bytes.toString('base64'), ...args.blob } as T);
      throw new Error(`unexpected ${path}`);
    },
  };
  return { githubClient, calls };
}

describe('approved community source fetch', () => {
  test('fetches only the reviewed path at the exact pinned commit', async () => {
    const mock = client();
    const files = await fetchApprovedCommunitySource({ entry: entry(), githubClient: mock.githubClient });
    expect(files).toHaveLength(1);
    expect(mock.calls[0]).toContain(`/git/trees/${commit}?recursive=1`);
    expect(mock.calls[1]).toContain('/git/blobs/blob-sha');
  });

  test.each([
    ['truncated tree', { tree: { truncated: true } }],
    ['missing file', { tree: { tree: [] } }],
    ['directory', { tree: { tree: [{ path: 'community/DAEMON.md', mode: '040000', type: 'tree', sha: 'x' }] } }],
    ['symlink', { tree: { tree: [{ path: 'community/DAEMON.md', mode: '120000', type: 'blob', sha: 'x' }] } }],
    ['submodule', { tree: { tree: [{ path: 'community/DAEMON.md', mode: '160000', type: 'commit', sha: 'x' }] } }],
    ['wrong mode', { tree: { tree: [{ path: 'community/DAEMON.md', mode: '100755', type: 'blob', sha: 'x' }] } }],
  ])('fails closed for %s', async (_name, overrides) => {
    const mock = client(overrides);
    await expect(fetchApprovedCommunitySource({ entry: entry(), githubClient: mock.githubClient })).rejects.toThrow();
  });

  test('rejects hash mismatch, invalid UTF-8, adaptation tokens, and incomplete responses', async () => {
    await expect(fetchApprovedCommunitySource({ entry: entry('different'), githubClient: client().githubClient })).rejects.toThrow(/SHA-256/);
    const invalid = Uint8Array.from([0xc3, 0x28]);
    await expect(fetchApprovedCommunitySource({ entry: entry(invalid as never), githubClient: client({ content: invalid }).githubClient })).rejects.toThrow(/UTF-8/);
    const adapted = daemon.replace('Test body.', '{{adapt.value}}');
    await expect(fetchApprovedCommunitySource({ entry: entry(adapted), githubClient: client({ content: adapted }).githubClient })).rejects.toThrow(/adapt/);
    await expect(fetchApprovedCommunitySource({ entry: entry(), githubClient: client({ blob: { truncated: true } }).githubClient })).rejects.toThrow(/incomplete/);
  });
});
