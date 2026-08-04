import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { fetchApprovedCommunitySource, type CommunityGitHubClient } from '../source';
import type { CommunityRegistryEntry } from '../types';

const commit = 'a'.repeat(40);
const treeSha = 'b'.repeat(40);
const daemonBlobSha = 'c'.repeat(40);
const referenceBlobSha = 'd'.repeat(40);
const daemon = `---\nid: community-daemon\npurpose: Test approved delivery.\nwatch:\n  - when tests run\nroutines:\n  - verify source delivery\ndeny:\n  - do not mutate production\n---\n\n# Community daemon\n\nTest body.\n`;
const reference = '# Reference\n';

function hash(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function entry(content: Uint8Array | string = daemon, includeReference = false): CommunityRegistryEntry {
  return {
    slug: 'community-daemon', displayName: 'Community daemon', summary: 'Approved.', sourceType: 'community',
    repositoryUrl: 'https://github.com/acme/daemons',
    canonicalSourceUrl: `https://github.com/acme/daemons/blob/${commit}/community/DAEMON.md`,
    daemonPath: 'community/DAEMON.md', commit, integrations: ['github'], approvalStatus: 'approved',
    reviewedFiles: [
      { path: 'community/DAEMON.md', mode: '100644', sha256: hash(content) },
      ...(includeReference ? [{ path: 'community/references/source.md', mode: '100644' as const, sha256: hash(reference) }] : []),
    ],
  };
}

type GitHubCall = {
  method: string;
  path: string;
  options: import('../source').CommunityGitHubRequestOptions | undefined;
};

function client(args: {
  content?: Uint8Array | string;
  commit?: Record<string, unknown>;
  tree?: Record<string, unknown>;
  blob?: Record<string, unknown>;
  failCommit?: boolean;
  failTree?: boolean;
} = {}) {
  const calls: GitHubCall[] = [];
  const content = args.content ?? daemon;
  const bytes = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content);
  const githubClient: CommunityGitHubClient = {
    async request<T>(method: string, path: string, options?: import('../source').CommunityGitHubRequestOptions): Promise<T> {
      calls.push({ method, path, options });
      if (path.includes('/git/commits/')) {
        if (args.failCommit) throw new Error('commit request failed');
        return ({ sha: commit, tree: { sha: treeSha }, ...args.commit } as T);
      }
      if (path.includes('/git/trees/')) {
        if (args.failTree) throw new Error('tree request failed');
        return ({ truncated: false, tree: [{ path: 'community/DAEMON.md', mode: '100644', type: 'blob', sha: daemonBlobSha }], ...args.tree } as T);
      }
      if (path.endsWith(`/git/blobs/${daemonBlobSha}`)) return ({ encoding: 'base64', content: bytes.toString('base64'), ...args.blob } as T);
      if (path.endsWith(`/git/blobs/${referenceBlobSha}`)) return ({ encoding: 'base64', content: Buffer.from(reference).toString('base64'), ...args.blob } as T);
      throw new Error(`unexpected ${path}`);
    },
  };
  return { githubClient, calls };
}

describe('approved community source fetch', () => {
  test('resolves the exact pinned commit to its tree and fetches only reviewed blob SHAs', async () => {
    const mock = client({
      tree: {
        tree: [
          { path: 'community/DAEMON.md', mode: '100644', type: 'blob', sha: daemonBlobSha },
          { path: 'community/references/source.md', mode: '100644', type: 'blob', sha: referenceBlobSha },
          { path: 'community/scripts/unreviewed.sh', mode: '100755', type: 'blob', sha: 'e'.repeat(40) },
        ],
      },
    });
    const files = await fetchApprovedCommunitySource({ entry: entry(daemon, true), githubClient: mock.githubClient });
    expect(files).toHaveLength(2);
    expect(mock.calls).toEqual([
      { method: 'GET', path: `/repos/acme/daemons/git/commits/${commit}`, options: undefined },
      { method: 'GET', path: `/repos/acme/daemons/git/trees/${treeSha}`, options: { query: { recursive: '1' } } },
      { method: 'GET', path: `/repos/acme/daemons/git/blobs/${daemonBlobSha}`, options: undefined },
      { method: 'GET', path: `/repos/acme/daemons/git/blobs/${referenceBlobSha}`, options: undefined },
    ]);
  });

  test.each([
    ['commit API error', { failCommit: true }, /commit request failed/],
    ['wrong commit identity', { commit: { sha: 'f'.repeat(40) } }, /exact pinned source commit/],
    ['malformed commit identity', { commit: { sha: 'A'.repeat(40) } }, /exact pinned source commit/],
    ['non-string commit identity', { commit: { sha: 123 } }, /exact pinned source commit/],
    ['missing commit identity', { commit: { sha: undefined } }, /exact pinned source commit/],
    ['missing tree SHA', { commit: { tree: {} } }, /valid source tree SHA/],
    ['malformed tree SHA', { commit: { tree: { sha: 'B'.repeat(40) } } }, /valid source tree SHA/],
    ['tree API error', { failTree: true }, /tree request failed/],
  ])('fails before blob requests for %s', async (_name, overrides, message) => {
    const mock = client(overrides);
    await expect(fetchApprovedCommunitySource({ entry: entry(), githubClient: mock.githubClient })).rejects.toThrow(message);
    expect(mock.calls.some((call) => call.path.includes('/git/blobs/'))).toBe(false);
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
