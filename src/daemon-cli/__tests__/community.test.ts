import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { executeCli } from '../cli';
import type { CatalogClient } from '../types';
import type { CommunityRegistryCatalog, CommunitySourceFile } from '../../community-registry/types';
import type { ExamplesCatalog } from '../../examples/types';
import { createDaemonInstallPullRequest, parseDaemonInstallMarker, type DaemonInstallPrGitHubClient } from '../../daemon-install-pr';

const commit = 'a'.repeat(40);
const daemon = `---\nid: community-daemon\npurpose: Exercise approved community delivery.\nwatch:\n  - when approved tests run\nroutines:\n  - verify reviewed files\ndeny:\n  - do not execute upstream content\n---\n\n# Community daemon\n\nApproved content.\n`;
const script = '#!/usr/bin/env bash\necho approved\n';
const sha = (content: string) => createHash('sha256').update(content).digest('hex');

const firstParty: ExamplesCatalog = { schemaVersion: 2, source: { repository: 'charlie-labs/daemons', baseDirectory: 'daemons' }, examples: [] };
const community: CommunityRegistryCatalog = {
  schemaVersion: 1,
  entries: [{
    slug: 'community-daemon', displayName: 'Community daemon', summary: 'Approved external fixture.', sourceType: 'community',
    repositoryUrl: 'https://github.com/acme/daemon-pack',
    canonicalSourceUrl: `https://github.com/acme/daemon-pack/blob/${commit}/pack/DAEMON.md`,
    daemonPath: 'pack/DAEMON.md', commit, integrations: ['github', 'slack'], approvalStatus: 'approved',
    reviewedFiles: [
      { path: 'pack/DAEMON.md', mode: '100644', sha256: sha(daemon) },
      { path: 'pack/scripts/run.sh', mode: '100755', sha256: sha(script) },
    ],
  }],
};
const sourceFiles: CommunitySourceFile[] = [
  { ...community.entries[0]!.reviewedFiles[0]!, content: daemon },
  { ...community.entries[0]!.reviewedFiles[1]!, content: script },
];

function client(args: { communityCatalog?: CommunityRegistryCatalog; sourceError?: Error } = {}): CatalogClient {
  return {
    async loadCatalog() { return firstParty; },
    async readTextFile() { throw new Error('first-party source should not be read'); },
    async loadCommunityCatalog() { return args.communityCatalog ?? community; },
    async fetchCommunitySource() {
      if (args.sourceError) throw args.sourceError;
      return sourceFiles;
    },
  };
}

async function runJson(argv: string[], cwd: string, catalogClient = client()) {
  let stdout = '';
  const code = await executeCli({ argv: [...argv, '--json'], catalogClient, output: { cwd, stdout: (text) => { stdout += text; }, stderr: () => {} } });
  return { code, json: JSON.parse(stdout) };
}

function githubTargetClient(): DaemonInstallPrGitHubClient & { calls: Array<{ method: string; path: string; options: unknown }> } {
  const calls: Array<{ method: string; path: string; options: unknown }> = [];
  return {
    calls,
    async request<T>(method: string, requestPath: string, options?: import('../../daemon-install-pr').DaemonInstallPrGitHubRequestOptions): Promise<T> {
      calls.push({ method, path: requestPath, options });
      if (method === 'GET' && requestPath.endsWith('/git/ref/heads/charlie/daemon-installs/community-daemon')) throw Object.assign(new Error('missing'), { status: 404 });
      if (method === 'GET' && requestPath.endsWith('/git/ref/heads/main')) return { ref: 'refs/heads/main', object: { sha: 'base', type: 'commit' } } as T;
      if (method === 'GET' && requestPath.endsWith('/git/commits/base')) return { sha: 'base', tree: { sha: 'base-tree' } } as T;
      if (method === 'GET' && requestPath.endsWith('/git/trees/base-tree')) return { sha: 'base-tree', tree: [], truncated: false } as T;
      if (method === 'POST' && requestPath.endsWith('/git/trees')) return { sha: 'new-tree', tree: [] } as T;
      if (method === 'POST' && requestPath.endsWith('/git/commits')) return { sha: 'new-commit', tree: { sha: 'new-tree' } } as T;
      if (method === 'POST' && requestPath.endsWith('/git/refs')) return { ref: 'refs/heads/charlie/daemon-installs/community-daemon', object: { sha: 'new-commit', type: 'commit' } } as T;
      if (method === 'POST' && requestPath.endsWith('/pulls')) return { number: 7, title: 'Install community-daemon daemon', html_url: 'https://github.com/acme/target/pull/7', state: 'open', merged_at: null, body: (options as any).body.body, head: { ref: 'charlie/daemon-installs/community-daemon', sha: 'new-commit' }, base: { ref: 'main' } } as T;
      throw new Error(`unexpected ${method} ${requestPath}`);
    },
  };
}

describe('approved community CLI delivery', () => {
  test('merges list/show and keeps an empty registry compatible', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'community-cli-'));
    try {
      const listed = await runJson(['list'], directory);
      expect(listed.json.data.examples[0]).toMatchObject({ id: 'community-daemon', sourceType: 'community' });
      const shown = await runJson(['show', 'community-daemon', '--ref', 'other-ref'], directory);
      expect(shown.json.data).toMatchObject({ sourceType: 'community', sourceRef: commit, pinnedCommit: commit, repositoryUrl: 'https://github.com/acme/daemon-pack' });
      expect(shown.json.data.reviewedFiles).toHaveLength(2);
      const empty = await runJson(['list'], directory, client({ communityCatalog: { schemaVersion: 1, entries: [] } }));
      expect(empty.json.data.count).toBe(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('installs exactly reviewed destinations and --ref cannot override the pinned commit', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'community-add-'));
    try {
      const added = await runJson(['add', 'community-daemon', '--ref', 'attacker-ref'], directory);
      expect(added.code).toBe(0);
      expect(added.json.data.sourceRef).toBe(commit);
      expect(added.json.data.filesWritten).toEqual(['.agents/daemons/community-daemon/DAEMON.md', '.agents/daemons/community-daemon/scripts/run.sh']);
      expect(await readFile(path.join(directory, '.agents/daemons/community-daemon/DAEMON.md'), 'utf8')).toBe(daemon);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('rejects collisions, arbitrary URLs, and adaptation input', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'community-errors-'));
    try {
      const collisionCatalog = { ...community, entries: [{ ...community.entries[0]!, slug: 'reserved' }] };
      const reservedFirstParty = { ...firstParty, examples: [{ id: 'reserved' } as never] };
      const collisionClient = { ...client({ communityCatalog: collisionCatalog }), async loadCatalog() { return reservedFirstParty; } };
      expect((await runJson(['list'], directory, collisionClient)).code).toBe(65);
      expect((await runJson(['show', 'https://github.com/acme/daemon-pack'], directory)).code).toBe(64);
      expect((await runJson(['add', 'community-daemon', '--adapt', 'x=y'], directory)).code).toBe(65);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('validates all external source before target mutation and creates reviewable v2 provenance', async () => {
    const target = githubTargetClient();
    await expect(createDaemonInstallPullRequest({ repo: 'acme/target', exampleId: 'community-daemon', base: 'main', catalogClient: client({ sourceError: new Error('late source failure') }), githubClient: target })).rejects.toThrow('late source failure');
    expect(target.calls).toHaveLength(0);

    const result = await createDaemonInstallPullRequest({ repo: 'acme/target', exampleId: 'community-daemon', base: 'main', sourceRef: 'ignored-ref', catalogClient: client(), githubClient: target });
    expect(result.sourceRef).toBe(commit);
    expect(result.filesPlanned.map((file) => file.destinationPath)).toEqual(['.agents/daemons/community-daemon/DAEMON.md', '.agents/daemons/community-daemon/scripts/run.sh']);
    expect(result.marker.version).toBe(2);
    expect(parseDaemonInstallMarker(result.markerText)).toEqual({ ok: true, marker: result.marker });
    const pullCall = target.calls.find((call) => call.method === 'POST' && call.path.endsWith('/pulls'))!;
    const body = (pullCall.options as any).body.body as string;
    expect(body).toContain('Approved external source');
    expect(body).toContain(commit);
    expect(body).toContain('eligible for live activations after both are true');
  });

  test('leaves local destination untouched on late or stale external preparation failure', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'community-boundary-'));
    try {
      const late = await runJson(['add', 'community-daemon'], directory, client({ sourceError: new Error('late source failure') }));
      expect(late.code).toBe(65);
      await expect(readFile(path.join(directory, '.agents/daemons/community-daemon/DAEMON.md'), 'utf8')).rejects.toThrow();
      const staleClient = { ...client(), async fetchCommunitySource() { return [...sourceFiles].reverse(); } };
      const stale = await runJson(['add', 'community-daemon'], directory, staleClient);
      expect(stale.code).toBe(65);
      expect(stale.json.errors[0].code).toBe('COMMUNITY_SOURCE_STALE_MANIFEST');
      await expect(readFile(path.join(directory, '.agents/daemons/community-daemon/DAEMON.md'), 'utf8')).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
