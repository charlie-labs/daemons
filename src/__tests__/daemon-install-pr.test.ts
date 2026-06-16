import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { executeCli } from '../daemon-cli/cli';
import type { CatalogClient } from '../daemon-cli/types';
import {
  DAEMON_INSTALL_BRANCH_PREFIX,
  DaemonInstallPullRequestError,
  createDaemonInstallMarker,
  createDaemonInstallPullRequest,
  listDaemonInstallPullRequests,
  parseDaemonInstallMarker,
  type DaemonInstallPrGitHubClient,
} from '../daemon-install-pr';
import type { ExamplesCatalog } from '../examples/types';

const templatedDaemon = `---
id: templated-daemon
purpose: Keep {{adapt.required_value}} healthy.
watch:
  - when {{adapt.required_value}} changes
routines:
  - run {{adapt.optional_value}} checks
deny:
  - do not expose raw adaptation values in CLI output
schedule: "0 9 * * 1"
---

# Templated daemon

Target: {{adapt.required_value}}
Optional: {{adapt.optional_value}}
`;

const catalog: ExamplesCatalog = {
  schemaVersion: 2,
  source: {
    repository: 'charlie-labs/daemons',
    baseDirectory: 'daemons',
  },
  examples: [
    {
      id: 'templated-daemon',
      title: 'Templated daemon',
      status: 'ready',
      summary: 'A daemon fixture with structured adaptations.',
      readiness: 'adapt-before-use',
      showOnWebsite: true,
      showInDashboard: true,
      fit: {
        jobsToBeDone: ['operate'],
        bestFor: ['tests with adaptation values'],
        notFor: ['production without edits'],
      },
      requirements: {
        requiredIntegrations: ['github'],
        optionalIntegrations: ['linear'],
        other: [],
      },
      adaptations: [
        {
          key: 'required_value',
          label: 'Required value',
          description: 'Required string rendered into the daemon and support files.',
          required: true,
        },
        {
          key: 'optional_value',
          label: 'Optional value',
          description: 'Optional string rendered into the daemon and support files.',
          required: false,
          default: 'from-default',
        },
      ],
      specializationIdeas: [],
      daemon: {
        path: 'DAEMON.md',
        content: templatedDaemon,
      },
      scripts: ['scripts/render.sh'],
      references: ['references/render.md'],
      source: {
        directory: 'daemons/templated-daemon',
        url: 'https://github.com/charlie-labs/daemons/tree/master/daemons/templated-daemon',
      },
    },
  ],
};

const catalogClient: CatalogClient = {
  async loadCatalog(): Promise<ExamplesCatalog> {
    return catalog;
  },
  async readTextFile(_ref: string, path: string): Promise<string> {
    if (path === 'daemons/templated-daemon/scripts/render.sh') {
      return '#!/usr/bin/env bash\necho {{adapt.required_value}} {{adapt.optional_value}}\n';
    }
    if (path === 'daemons/templated-daemon/references/render.md') {
      return '# Rendered\n\nTarget: {{adapt.required_value}}\nOptional: {{adapt.optional_value}}\n';
    }
    throw new Error(`unexpected catalog path ${path}`);
  },
};

type RecordedCall = {
  method: string;
  path: string;
  options: unknown;
};

function githubError(status: number, message: string): Error & { status: number; response: { status: number } } {
  const error = new Error(message) as Error & { status: number; response: { status: number } };
  error.status = status;
  error.response = { status };
  return error;
}

function gitBlobSha(content: string): string {
  const buffer = Buffer.from(content, 'utf8');
  return createHash('sha1')
    .update(Buffer.from(`blob ${buffer.length.toString()}\0`, 'utf8'))
    .update(buffer)
    .digest('hex');
}

function makePull(args: {
  number: number;
  branch: string;
  sha: string;
  state?: string;
  mergedAt?: string | null;
  body?: string | null;
  base?: string;
  title?: string;
}) {
  return {
    number: args.number,
    title: args.title ?? `Install ${args.branch}`,
    html_url: `https://github.com/acme/widgets/pull/${args.number.toString()}`,
    state: args.state ?? 'open',
    merged_at: args.mergedAt ?? null,
    body: args.body ?? null,
    head: { ref: args.branch, sha: args.sha },
    base: { ref: args.base ?? 'main' },
  };
}

function successGithubClient(): DaemonInstallPrGitHubClient & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client: DaemonInstallPrGitHubClient & { calls: RecordedCall[] } = {
    calls,
    async request<T>(method: string, requestPath: string, options?: unknown): Promise<T> {
      calls.push({ method, path: requestPath, options });
      if (method === 'GET' && requestPath.endsWith('/git/ref/heads/charlie/daemon-installs/templated-daemon')) {
        throw githubError(404, 'branch missing');
      }
      if (method === 'GET' && requestPath.endsWith('/git/ref/heads/main')) {
        return { ref: 'refs/heads/main', object: { sha: 'base-sha', type: 'commit' } } as T;
      }
      if (method === 'GET' && requestPath.endsWith('/git/commits/base-sha')) {
        return { sha: 'base-sha', tree: { sha: 'base-tree' } } as T;
      }
      if (method === 'GET' && requestPath.endsWith('/git/trees/base-tree')) {
        return { sha: 'base-tree', tree: [] } as T;
      }
      if (method === 'POST' && requestPath.endsWith('/git/trees')) {
        return { sha: 'created-tree', tree: [] } as T;
      }
      if (method === 'POST' && requestPath.endsWith('/git/commits')) {
        return { sha: 'created-commit', tree: { sha: 'created-tree' } } as T;
      }
      if (method === 'POST' && requestPath.endsWith('/git/refs')) {
        return { ref: 'refs/heads/charlie/daemon-installs/templated-daemon', object: { sha: 'created-commit', type: 'commit' } } as T;
      }
      if (method === 'POST' && requestPath.endsWith('/pulls')) {
        const body = (options as { body: { body: string } }).body.body;
        return makePull({
          number: 42,
          branch: 'charlie/daemon-installs/templated-daemon',
          sha: 'created-commit',
          body,
          title: 'Install templated-daemon daemon',
        }) as T;
      }
      throw new Error(`unexpected GitHub request ${method} ${requestPath}`);
    },
  };
  return client;
}

describe('daemon install PR API', () => {
  test('creates a deterministic branch, atomic commit, educational PR body, and hidden marker without raw adaptation values', async () => {
    const githubClient = successGithubClient();

    const result = await createDaemonInstallPullRequest({
      repo: 'acme/widgets',
      exampleId: 'templated-daemon',
      base: 'main',
      sourceRef: 'test-ref',
      adaptations: { required_value: 'secret-target', optional_value: 'secret-option' },
      catalogClient,
      githubClient,
    });

    expect(result.status).toBe('created');
    expect(result.repository).toBe('acme/widgets');
    expect(result.baseBranch).toBe('main');
    expect(result.headBranch).toBe(`${DAEMON_INSTALL_BRANCH_PREFIX}templated-daemon`);
    expect(result.headSha).toBe('created-commit');
    expect(result.filesPlanned.map((file) => file.destinationPath)).toEqual([
      '.agents/daemons/templated-daemon/DAEMON.md',
      '.agents/daemons/templated-daemon/scripts/render.sh',
      '.agents/daemons/templated-daemon/references/render.md',
    ]);
    expect(result.adaptationsApplied).toEqual(['optional_value', 'required_value']);
    expect(result.markerText).toContain('charlie-daemon-install-v1');
    expect(result.markerText).toContain('required_value');
    expect(result.markerText).not.toContain('secret-target');
    expect(result.markerText).not.toContain('secret-option');
    expect(result.pullRequest.url).toBe('https://github.com/acme/widgets/pull/42');

    const createTreeCall = githubClient.calls.find((call) => call.method === 'POST' && call.path.endsWith('/git/trees'));
    expect(createTreeCall).toBeDefined();
    expect(createTreeCall?.options).toMatchObject({
      body: {
        base_tree: 'base-tree',
        tree: expect.arrayContaining([
          expect.objectContaining({ path: '.agents/daemons/templated-daemon/DAEMON.md', mode: '100644', type: 'blob' }),
          expect.objectContaining({ path: '.agents/daemons/templated-daemon/scripts/render.sh', mode: '100755', type: 'blob' }),
        ]),
      },
    });

    const pullCall = githubClient.calls.find((call) => call.method === 'POST' && call.path.endsWith('/pulls'));
    const pullBody = (pullCall?.options as { body: { body: string } }).body.body;
    expect(pullBody).toBe(`## Summary

This PR installs the \`templated-daemon\` Charlie daemon to \`.agents/daemons/templated-daemon/DAEMON.md\`. It was generated by Charlie from the [\`templated-daemon\` example](https://github.com/charlie-labs/daemons/blob/master/daemons/templated-daemon/DAEMON.md).

The daemon won't start working until it's merged to the repo's default branch.

## What Charlie daemons are

Charlie is an async engineering teammate that works in the tools your team already uses. In GitHub, Charlie can inspect code, review changes, propose patches, open PRs, and comment with findings. With connected integrations, Charlie can also use Linear, Slack, and Sentry context to understand issues, conversations, alerts, and follow-up work.

A daemon is a recurring role for Charlie. Instead of waiting for someone to mention Charlie every time the same kind of maintenance work appears, the repo contains a small role definition that tells Charlie when to wake up and what job to do.

This PR adds that role at \`.agents/daemons/templated-daemon/DAEMON.md\`. The file controls:

- when Charlie can activate, through \`watch\` conditions or a \`schedule\`
- what work Charlie should perform, through \`purpose\` and \`routines\`
- what Charlie should avoid, through \`deny\` rules and body guidance

After this PR is merged and Charlie ingests the default-branch version, the daemon can start handling that recurring work inside the limits defined in \`DAEMON.md\`.

Learn more: https://docs.charlielabs.ai/daemons

## What this daemon does

\`DAEMON.md\` purpose:

> Keep secret-target healthy.

This daemon’s configured routines are:

- run secret-option checks

## When this daemon can activate

This PR only installs daemon files. The daemon becomes eligible for live activations after both are true:

1. this PR is merged to the repo's default branch
2. Charlie ingests the merged default-branch version of \`DAEMON.md\`

### Watch conditions

Charlie may wake this daemon when these \`watch\` conditions match:

- when secret-target changes

### Schedule

Charlie may also wake this daemon on this \`schedule\`:

- \`0 9 * * 1\`

Schedules use five-field UTC cron syntax.

## Integrations and setup

This daemon requires these integrations to work as intended:

- \`github\`

This daemon declares these optional integrations:

- \`linear\`

Set up or configure integrations here:

https://dash.charlielabs.ai/organizations/acme/integrations

## Review and iterate before merging

Before merging, review the installed \`DAEMON.md\` and confirm that:

- the \`purpose\` matches the recurring work you want Charlie to own
- the \`watch\` conditions and/or \`schedule\` are narrow enough for initial rollout
- the \`routines\` are concrete and bounded
- the \`deny\` rules cover actions Charlie should not take
- any required integrations above are connected for this organization

You can ask Charlie on this PR to adjust the daemon before merging. Just leave a comment mentioning \`@CharlieHelps\`.

For rollout and iteration guidance:

https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons

## Activity and future tuning

After this daemon is merged and ingested, you can review daemon activity here:

https://dash.charlielabs.ai/organizations/acme/activity?daemonId=templated-daemon

To browse more daemon examples:

https://github.com/charlie-labs/daemons/blob/master/README.md

${result.markerText}`);
    expect(pullBody).toContain('secret-target');
    expect(pullBody).toContain('secret-option');
    expect(result.markerText).toContain('charlie-daemon-install-v1');
    expect(result.markerText).toContain('required_value');
    expect(result.markerText).not.toContain('secret-target');
    expect(result.markerText).not.toContain('secret-option');
    expect(pullBody.endsWith(result.markerText)).toBe(true);
    expect(parseDaemonInstallMarker(pullBody)).toMatchObject({ ok: true });
  });

  test('idempotently returns an exact-head open PR for an existing install branch', async () => {
    const calls: RecordedCall[] = [];
    const githubClient: DaemonInstallPrGitHubClient = {
      async request<T>(method: string, requestPath: string, options?: unknown): Promise<T> {
        calls.push({ method, path: requestPath, options });
        if (method === 'GET' && requestPath.endsWith('/git/ref/heads/charlie/daemon-installs/templated-daemon')) {
          return { ref: 'refs/heads/charlie/daemon-installs/templated-daemon', object: { sha: 'existing-sha', type: 'commit' } } as T;
        }
        if (method === 'GET' && requestPath.endsWith('/pulls')) {
          return [makePull({ number: 7, branch: 'charlie/daemon-installs/templated-daemon', sha: 'existing-sha' })] as T;
        }
        throw new Error(`unexpected GitHub request ${method} ${requestPath}`);
      },
    };

    const result = await createDaemonInstallPullRequest({
      repo: 'acme/widgets',
      exampleId: 'templated-daemon',
      base: 'main',
      sourceRef: 'test-ref',
      adaptations: { required_value: 'secret-target' },
      catalogClient,
      githubClient,
    });

    expect(result.status).toBe('existing_open');
    expect(result.pullRequest.number).toBe(7);
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/git/trees'))).toBe(false);
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/git/refs'))).toBe(false);
  });

  test('recovers an existing deterministic branch without a pull request when files match', async () => {
    const renderedDaemon = templatedDaemon.replaceAll('{{adapt.required_value}}', 'secret-target').replaceAll('{{adapt.optional_value}}', 'from-default');
    const renderedScript = '#!/usr/bin/env bash\necho secret-target from-default\n';
    const renderedReference = '# Rendered\n\nTarget: secret-target\nOptional: from-default\n';
    const calls: RecordedCall[] = [];
    const githubClient: DaemonInstallPrGitHubClient = {
      async request<T>(method: string, requestPath: string, options?: unknown): Promise<T> {
        calls.push({ method, path: requestPath, options });
        if (method === 'GET' && requestPath.endsWith('/git/ref/heads/charlie/daemon-installs/templated-daemon')) {
          return { ref: 'refs/heads/charlie/daemon-installs/templated-daemon', object: { sha: 'existing-sha', type: 'commit' } } as T;
        }
        if (method === 'GET' && requestPath.endsWith('/pulls')) {
          return [] as T;
        }
        if (method === 'GET' && requestPath.endsWith('/git/commits/existing-sha')) {
          return { sha: 'existing-sha', tree: { sha: 'existing-tree' } } as T;
        }
        if (method === 'GET' && requestPath.endsWith('/git/trees/existing-tree')) {
          return {
            sha: 'existing-tree',
            tree: [
              { path: '.agents/daemons/templated-daemon/DAEMON.md', type: 'blob', mode: '100644', sha: gitBlobSha(renderedDaemon) },
              { path: '.agents/daemons/templated-daemon/scripts/render.sh', type: 'blob', mode: '100755', sha: gitBlobSha(renderedScript) },
              { path: '.agents/daemons/templated-daemon/references/render.md', type: 'blob', mode: '100644', sha: gitBlobSha(renderedReference) },
            ],
          } as T;
        }
        if (method === 'POST' && requestPath.endsWith('/pulls')) {
          const body = (options as { body: { body: string } }).body.body;
          return makePull({ number: 8, branch: 'charlie/daemon-installs/templated-daemon', sha: 'existing-sha', body }) as T;
        }
        throw new Error(`unexpected GitHub request ${method} ${requestPath}`);
      },
    };

    const result = await createDaemonInstallPullRequest({
      repo: 'acme/widgets',
      exampleId: 'templated-daemon',
      base: 'main',
      sourceRef: 'test-ref',
      adaptations: { required_value: 'secret-target' },
      catalogClient,
      githubClient,
    });

    expect(result.status).toBe('recovered_branch');
    expect(result.pullRequest.number).toBe(8);
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/git/refs'))).toBe(false);
  });

  test('refuses target path collisions on the target base before creating a branch', async () => {
    const calls: RecordedCall[] = [];
    const githubClient: DaemonInstallPrGitHubClient = {
      async request<T>(method: string, requestPath: string, options?: unknown): Promise<T> {
        calls.push({ method, path: requestPath, options });
        if (method === 'GET' && requestPath.endsWith('/git/ref/heads/charlie/daemon-installs/templated-daemon')) {
          throw githubError(404, 'branch missing');
        }
        if (method === 'GET' && requestPath.endsWith('/git/ref/heads/main')) {
          return { ref: 'refs/heads/main', object: { sha: 'base-sha', type: 'commit' } } as T;
        }
        if (method === 'GET' && requestPath.endsWith('/git/commits/base-sha')) {
          return { sha: 'base-sha', tree: { sha: 'base-tree' } } as T;
        }
        if (method === 'GET' && requestPath.endsWith('/git/trees/base-tree')) {
          return {
            sha: 'base-tree',
            tree: [{ path: '.agents/daemons/templated-daemon/DAEMON.md', type: 'blob', mode: '100644', sha: 'old' }],
          } as T;
        }
        throw new Error(`unexpected GitHub request ${method} ${requestPath}`);
      },
    };

    await expect(
      createDaemonInstallPullRequest({
        repo: 'acme/widgets',
        exampleId: 'templated-daemon',
        base: 'main',
        sourceRef: 'test-ref',
        adaptations: { required_value: 'secret-target' },
        catalogClient,
        githubClient,
      })
    ).rejects.toMatchObject({ code: 'INSTALL_COLLISION' });
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/git/trees'))).toBe(false);
  });

  test('lists marker-backed PRs and reconciles edited-body install branches', async () => {
    const branch = 'charlie/daemon-installs/templated-daemon';
    const marker = createDaemonInstallMarker({
      version: 1,
      exampleId: 'templated-daemon',
      sourceRepo: 'charlie-labs/daemons',
      sourceRef: 'test-ref',
      catalogPath: 'examples.json',
      catalogSchemaVersion: 1,
      targetDirectory: '.agents/daemons/templated-daemon',
      files: ['.agents/daemons/templated-daemon/DAEMON.md'],
      adaptationKeys: ['required_value'],
      branch,
    });
    const githubClient: DaemonInstallPrGitHubClient = {
      async request<T>(method: string, requestPath: string, options?: unknown): Promise<T> {
        if (method === 'GET' && requestPath === '/search/issues') {
          return { items: [{ number: 1, pull_request: {} }, { number: 2, pull_request: {} }] } as T;
        }
        if (method === 'GET' && requestPath.endsWith('/pulls/1')) {
          return makePull({ number: 1, branch, sha: 'open-sha', body: marker }) as T;
        }
        if (method === 'GET' && requestPath.endsWith('/pulls/2')) {
          return makePull({ number: 2, branch: 'charlie/daemon-installs/merged-daemon', sha: 'merged-sha', state: 'closed', mergedAt: '2026-01-01T00:00:00Z', body: marker }) as T;
        }
        if (method === 'GET' && requestPath.includes('/git/matching-refs/heads/charlie/daemon-installs/')) {
          return [
            { ref: 'refs/heads/charlie/daemon-installs/edited-body', object: { sha: 'edited-sha', type: 'commit' } },
            { ref: 'refs/heads/charlie/daemon-installs/orphan', object: { sha: 'orphan-sha', type: 'commit' } },
          ] as T;
        }
        if (method === 'GET' && requestPath.endsWith('/pulls')) {
          const query = (options as { query: { head: string } }).query;
          if (query.head.endsWith(':charlie/daemon-installs/edited-body')) {
            return [makePull({ number: 3, branch: 'charlie/daemon-installs/edited-body', sha: 'edited-sha', state: 'closed', body: null })] as T;
          }
          if (query.head.endsWith(':charlie/daemon-installs/orphan')) {
            return [] as T;
          }
        }
        throw new Error(`unexpected GitHub request ${method} ${requestPath}`);
      },
    };

    const result = await listDaemonInstallPullRequests({ repo: 'acme/widgets', githubClient });

    expect(result.installPullRequests.map((item) => item.status)).toEqual([
      'open',
      'merged',
      'closed_unmerged',
      'branchWithoutPullRequest',
    ]);
    expect(result.installPullRequests[0]?.markerValid).toBe(true);
    expect(result.installPullRequests[2]?.warnings).toContainEqual(expect.objectContaining({ code: 'INSTALL_MARKER_MISSING' }));
    expect(result.installPullRequests[3]).toMatchObject({
      daemonId: 'orphan',
      headSha: 'orphan-sha',
      pullRequest: null,
    });
  });

  test('CLI pr open uses env-style wrapper shape and keeps raw adaptation values out of JSON output', async () => {
    const githubClient = successGithubClient();
    let stdout = '';
    let stderr = '';
    const code = await executeCli({
      argv: [
        'pr',
        'open',
        'templated-daemon',
        '--repo',
        'acme/widgets',
        '--base',
        'main',
        '--ref',
        'test-ref',
        '--adapt',
        'required_value=secret-target',
        '--json',
      ],
      catalogClient,
      githubClient,
      output: {
        cwd: process.cwd(),
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      },
    });

    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).not.toContain('secret-target');
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      command: 'pr open',
      ok: true,
      data: {
        repository: 'acme/widgets',
        baseBranch: 'main',
        headBranch: 'charlie/daemon-installs/templated-daemon',
        adaptationsApplied: ['optional_value', 'required_value'],
      },
    });
  });

  test('marker parser reports invalid marker bodies without throwing', () => {
    expect(parseDaemonInstallMarker('no marker')).toEqual({ ok: false, present: false, error: null });
    expect(parseDaemonInstallMarker('<!-- charlie-daemon-install-v1 {bad json} -->')).toMatchObject({
      ok: false,
      present: true,
      error: { code: 'INSTALL_MARKER_INVALID_JSON' },
    });
  });

  test('public error exposes structured issue data', async () => {
    await expect(
      createDaemonInstallPullRequest({
        repo: 'acme/widgets',
        exampleId: 'templated-daemon',
        base: 'main',
        sourceRef: 'test-ref',
        catalogClient,
        githubClient: successGithubClient(),
      })
    ).rejects.toBeInstanceOf(DaemonInstallPullRequestError);
  });
});
