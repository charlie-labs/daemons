import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { executeCli } from '../cli';
import type { CatalogClient } from '../types';
import type { CommunityRegistryCatalog, CommunitySourceFile } from '../../community-registry/types';
import type { ExamplesCatalog } from '../../examples/types';
import { createDaemonInstallPullRequest, listDaemonInstallPullRequests, parseDaemonInstallMarker, type DaemonInstallPrGitHubClient } from '../../daemon-install-pr';

const commit = 'a'.repeat(40);
const daemon = `---\nid: community-daemon\npurpose: Exercise approved community delivery.\nwatch:\n  - when approved tests run\nroutines:\n  - verify reviewed files\ndeny:\n  - do not execute upstream content\n---\n\n# Community daemon\n\nApproved content.\n`;
const script = '#!/usr/bin/env bash\necho approved\n';
const sha = (content: string) => createHash('sha256').update(content).digest('hex');
const gitBlobSha = (content: string) => {
  const buffer = Buffer.from(content, 'utf8');
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length.toString()}\0`, 'utf8')).update(buffer).digest('hex');
};

const firstParty: ExamplesCatalog = { schemaVersion: 2, source: { repository: 'charlie-labs/daemons', baseDirectory: 'daemons' }, examples: [] };
const community: CommunityRegistryCatalog = {
  schemaVersion: 1,
  entries: [{
    slug: 'community-daemon', displayName: 'Community daemon', summary: 'Approved external fixture.', sourceType: 'first-party',
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

describe('approved registry CLI delivery', () => {
  test('merges list/show and keeps an empty registry compatible', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'community-cli-'));
    try {
      const listed = await runJson(['list'], directory);
      expect(listed.json.data.examples[0]).toMatchObject({ id: 'community-daemon', sourceType: 'first-party' });
      const shown = await runJson(['show', 'community-daemon', '--ref', 'other-ref'], directory);
      expect(shown.json.data).toMatchObject({ sourceType: 'first-party', sourceRef: commit, pinnedCommit: commit, repositoryUrl: 'https://github.com/acme/daemon-pack' });
      expect(shown.json.data.reviewedFiles).toHaveLength(2);
      const communityOwned = { ...community, entries: [{ ...community.entries[0]!, sourceType: 'community' as const }] };
      const communityListed = await runJson(['list'], directory, client({ communityCatalog: communityOwned }));
      expect(communityListed.json.data.examples[0]).toMatchObject({ id: 'community-daemon', sourceType: 'community' });
      const communityShown = await runJson(['show', 'community-daemon'], directory, client({ communityCatalog: communityOwned }));
      expect(communityShown.json.data).toMatchObject({ sourceType: 'community', sourceRef: commit });
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
      expect((await stat(path.join(directory, '.agents/daemons/community-daemon/DAEMON.md'))).mode & 0o777).toBe(0o644);
      expect((await stat(path.join(directory, '.agents/daemons/community-daemon/scripts/run.sh'))).mode & 0o777).toBe(0o755);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('local registry add --force replaces only the exact reviewed daemon directory', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'community-force-add-'));
    try {
      const daemonDirectory = path.join(directory, '.agents/daemons/community-daemon');
      const outsidePath = path.join(directory, '.agents/daemons/other-daemon/keep.txt');
      await mkdir(path.join(daemonDirectory, 'scripts'), { recursive: true });
      await mkdir(path.dirname(outsidePath), { recursive: true });
      await writeFile(path.join(daemonDirectory, 'extra.txt'), 'remove me', 'utf8');
      await writeFile(path.join(daemonDirectory, 'scripts/old.sh'), 'remove me', 'utf8');
      await writeFile(outsidePath, 'keep me', 'utf8');

      const added = await runJson(['add', 'community-daemon', '--force'], directory);
      expect(added.code).toBe(0);
      expect(added.json.data.overwritten).toBe(true);
      await expect(readFile(path.join(daemonDirectory, 'extra.txt'), 'utf8')).rejects.toThrow();
      await expect(readFile(path.join(daemonDirectory, 'scripts/old.sh'), 'utf8')).rejects.toThrow();
      await expect(readFile(outsidePath, 'utf8')).resolves.toBe('keep me');
      await expect(readFile(path.join(daemonDirectory, 'DAEMON.md'), 'utf8')).resolves.toBe(daemon);
      await expect(readFile(path.join(daemonDirectory, 'scripts/run.sh'), 'utf8')).resolves.toBe(script);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('local registry force validates before replacement and rejects symlinked install parents', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'community-force-boundary-'));
    const external = await mkdtemp(path.join(tmpdir(), 'community-force-external-'));
    try {
      const daemonDirectory = path.join(directory, '.agents/daemons/community-daemon');
      await mkdir(daemonDirectory, { recursive: true });
      await writeFile(path.join(daemonDirectory, 'existing.txt'), 'unchanged', 'utf8');
      const failed = await runJson(['add', 'community-daemon', '--force'], directory, client({ sourceError: new Error('late source failure') }));
      expect(failed.code).toBe(65);
      await expect(readFile(path.join(daemonDirectory, 'existing.txt'), 'utf8')).resolves.toBe('unchanged');

      await rm(path.join(directory, '.agents'), { recursive: true, force: true });
      await mkdir(path.join(directory, '.agents'), { recursive: true });
      await writeFile(path.join(external, 'keep.txt'), 'outside', 'utf8');
      await symlink(external, path.join(directory, '.agents/daemons'));
      const escaped = await runJson(['add', 'community-daemon', '--force'], directory);
      expect(escaped.code).toBe(65);
      expect(escaped.json.errors[0].code).toBe('INVALID_INSTALL_DESTINATION');
      await expect(readFile(path.join(external, 'keep.txt'), 'utf8')).resolves.toBe('outside');
      await expect(readFile(path.join(external, 'community-daemon/DAEMON.md'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
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
    expect(result.marker).toMatchObject({
      sourceType: 'first-party',
      catalogPath: 'catalog.json',
      registrySlug: 'community-daemon',
      registryRepo: 'charlie-labs/daemon-registry',
      registryRef: 'master',
    });
    expect(parseDaemonInstallMarker(result.markerText)).toEqual({ ok: true, marker: result.marker });
    const pullCall = target.calls.find((call) => call.method === 'POST' && call.path.endsWith('/pulls'))!;
    const body = (pullCall.options as any).body.body as string;
    expect(body).toContain('Approved external source');
    expect(body).toContain(commit);
    expect(body).toContain('eligible for live activations after both are true');

    const listed = await listDaemonInstallPullRequests({
      repo: 'acme/target',
      githubClient: {
        async request<T>(method: string, requestPath: string): Promise<T> {
          if (method === 'GET' && requestPath === '/search/issues') return { items: [{ number: 7, pull_request: {} }] } as T;
          if (method === 'GET' && requestPath.endsWith('/pulls/7')) {
            return {
              number: 7,
              title: 'Install community-daemon daemon',
              html_url: 'https://github.com/acme/target/pull/7',
              state: 'open',
              merged_at: null,
              body,
              head: { ref: 'charlie/daemon-installs/community-daemon', sha: 'new-commit' },
              base: { ref: 'main' },
            } as T;
          }
          if (method === 'GET' && requestPath.includes('/git/matching-refs/heads/charlie/daemon-installs/')) return [] as T;
          throw new Error(`unexpected ${method} ${requestPath}`);
        },
      },
    });
    expect(listed.installPullRequests[0]).toMatchObject({
      markerValid: true,
      marker: { version: 2, sourceType: 'first-party', registrySlug: 'community-daemon' },
    });
  });

  test('registry PR --force deletes inherited extras and reuses the exact open PR', async () => {
    const calls: Array<{ method: string; path: string; options: any }> = [];
    let branchExists = false;
    const pull = {
      number: 9,
      title: 'Install community-daemon daemon',
      html_url: 'https://github.com/acme/target/pull/9',
      state: 'open',
      merged_at: null,
      head: { ref: 'charlie/daemon-installs/community-daemon', sha: 'new-commit' },
      base: { ref: 'main' },
    };
    const baseTree = [
      { path: '.agents/daemons/community-daemon/DAEMON.md', type: 'blob', mode: '100644', sha: 'old-daemon' },
      { path: '.agents/daemons/community-daemon/extra.txt', type: 'blob', mode: '100644', sha: 'extra' },
      { path: '.agents/daemons/community-daemon/link', type: 'blob', mode: '120000', sha: 'link' },
      { path: '.agents/daemons/community-daemon/vendor', type: 'commit', mode: '160000', sha: 'submodule' },
      { path: '.agents/daemons/other-daemon/keep.txt', type: 'blob', mode: '100644', sha: 'outside' },
    ];
    const exactTree = [
      { path: '.agents/daemons/community-daemon/DAEMON.md', type: 'blob', mode: '100644', sha: gitBlobSha(daemon) },
      { path: '.agents/daemons/community-daemon/scripts/run.sh', type: 'blob', mode: '100755', sha: gitBlobSha(script) },
      { path: '.agents/daemons/other-daemon/keep.txt', type: 'blob', mode: '100644', sha: 'outside' },
    ];
    const githubClient: DaemonInstallPrGitHubClient = {
      async request<T>(method: string, requestPath: string, options?: any): Promise<T> {
        calls.push({ method, path: requestPath, options });
        if (method === 'GET' && requestPath.endsWith('/git/ref/heads/charlie/daemon-installs/community-daemon')) {
          if (!branchExists) throw Object.assign(new Error('missing'), { status: 404 });
          return { ref: 'refs/heads/charlie/daemon-installs/community-daemon', object: { sha: 'new-commit', type: 'commit' } } as T;
        }
        if (method === 'GET' && requestPath.endsWith('/git/ref/heads/main')) return { ref: 'refs/heads/main', object: { sha: 'base', type: 'commit' } } as T;
        if (method === 'GET' && requestPath.endsWith('/git/commits/base')) return { sha: 'base', tree: { sha: 'base-tree' } } as T;
        if (method === 'GET' && requestPath.endsWith('/git/trees/base-tree')) return { sha: 'base-tree', tree: baseTree, truncated: false } as T;
        if (method === 'POST' && requestPath.endsWith('/git/trees')) return { sha: 'new-tree', tree: [] } as T;
        if (method === 'POST' && requestPath.endsWith('/git/commits')) return { sha: 'new-commit', tree: { sha: 'new-tree' } } as T;
        if (method === 'POST' && requestPath.endsWith('/git/refs')) {
          branchExists = true;
          return { ref: 'refs/heads/charlie/daemon-installs/community-daemon', object: { sha: 'new-commit', type: 'commit' } } as T;
        }
        if (method === 'POST' && requestPath.endsWith('/pulls')) return pull as T;
        if (method === 'GET' && requestPath.endsWith('/git/commits/new-commit')) return { sha: 'new-commit', tree: { sha: 'new-tree' } } as T;
        if (method === 'GET' && requestPath.endsWith('/git/trees/new-tree')) return { sha: 'new-tree', tree: exactTree, truncated: false } as T;
        if (method === 'GET' && requestPath.endsWith('/pulls')) return [pull] as T;
        throw new Error(`unexpected ${method} ${requestPath}`);
      },
    };

    const first = await createDaemonInstallPullRequest({ repo: 'acme/target', exampleId: 'community-daemon', base: 'main', force: true, catalogClient: client(), githubClient });
    expect(first.status).toBe('created');
    const createTree = calls.find((call) => call.method === 'POST' && call.path.endsWith('/git/trees'))!;
    expect(createTree.options.body.tree).toEqual(expect.arrayContaining([
      { path: '.agents/daemons/community-daemon/extra.txt', mode: '100644', type: 'blob', sha: null },
      { path: '.agents/daemons/community-daemon/link', mode: '120000', type: 'blob', sha: null },
      { path: '.agents/daemons/community-daemon/vendor', mode: '160000', type: 'commit', sha: null },
      expect.objectContaining({ path: '.agents/daemons/community-daemon/DAEMON.md', mode: '100644', type: 'blob', content: daemon }),
      expect.objectContaining({ path: '.agents/daemons/community-daemon/scripts/run.sh', mode: '100755', type: 'blob', content: script }),
    ]));
    expect(createTree.options.body.tree).not.toContainEqual(expect.objectContaining({ path: '.agents/daemons/other-daemon/keep.txt' }));

    const second = await createDaemonInstallPullRequest({ repo: 'acme/target', exampleId: 'community-daemon', base: 'main', force: true, catalogClient: client(), githubClient });
    expect(second.status).toBe('existing_open');
    expect(second.pullRequest.number).toBe(9);
    expect(calls.filter((call) => call.method === 'POST' && call.path.endsWith('/git/trees'))).toHaveLength(1);
  });

  test('registry PR without --force rejects inherited target entries before mutation', async () => {
    const target = githubTargetClient();
    const originalRequest = target.request.bind(target);
    target.request = async <T>(method: string, requestPath: string, options?: any): Promise<T> => {
      if (method === 'GET' && requestPath.endsWith('/git/trees/base-tree')) {
        target.calls.push({ method, path: requestPath, options });
        return { sha: 'base-tree', tree: [{ path: '.agents/daemons/community-daemon/extra.txt', type: 'blob', mode: '100644', sha: 'extra' }], truncated: false } as T;
      }
      return await originalRequest<T>(method, requestPath, options);
    };
    await expect(createDaemonInstallPullRequest({ repo: 'acme/target', exampleId: 'community-daemon', base: 'main', catalogClient: client(), githubClient: target })).rejects.toMatchObject({ code: 'INSTALL_COLLISION' });
    expect(target.calls.some((call) => call.method === 'POST')).toBe(false);
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
