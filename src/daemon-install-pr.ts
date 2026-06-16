import { createHash } from 'node:crypto';
import path from 'node:path';
import { createGitHubCatalogClient } from './daemon-cli/catalog-client';
import {
  CATALOG_PATH,
  DAEMON_ID_PATTERN,
  DEFAULT_CATALOG_REF,
  SOURCE_REPO,
} from './daemon-cli/constants';
import { toDisplayPath } from './daemon-cli/fs-utils';
import { createDaemonInstallPlan } from './daemon-cli/install-plan';
import { prepareDaemonInstallFiles, type RenderedDaemonInstallFile } from './daemon-cli/install-rendering';
import { validateRuntimeDaemonMarkdown } from './daemon-cli/validation/runtime';
import { issue, normalizeErrorMessage } from './daemon-cli/issues';
import { resolveAdaptations, type AdaptationValues } from './daemon-cli/adaptations';
import type { CatalogClient, CliIssue, InstallFilePlan } from './daemon-cli/types';
import type { CatalogExample } from './examples/types';

export const DAEMON_INSTALL_BRANCH_PREFIX = 'charlie/daemon-installs/';
export const DAEMON_INSTALL_MARKER_NAME = 'charlie-daemon-install-v1';

const DEFAULT_INSTALL_ROOT = '/repo';
const GITHUB_API_BASE_URL = 'https://api.github.com';

export type GitHubRepositoryRef = string | { owner: string; repo: string };

export type DaemonInstallPrGitHubRequestOptions = {
  query?: Record<string, string | number | boolean | null | undefined> | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
};

export type DaemonInstallPrGitHubClient = {
  request<T>(method: string, path: string, options?: DaemonInstallPrGitHubRequestOptions): Promise<T>;
};

export type DaemonInstallPullRequestInfo = {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | string;
  merged: boolean;
  mergedAt: string | null;
  headRef: string;
  headSha: string;
  baseRef: string;
};

export type DaemonInstallPullRequestOpenStatus = 'created' | 'existing_open' | 'recovered_branch';

export type DaemonInstallPullRequestOpenResult = {
  status: DaemonInstallPullRequestOpenStatus;
  repository: string;
  daemonId: string;
  sourceRepo: string;
  sourceRef: string;
  catalogSchemaVersion: number;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  pullRequest: DaemonInstallPullRequestInfo;
  filesPlanned: InstallFilePlan[];
  filesWritten: string[];
  adaptationsApplied: string[];
  marker: DaemonInstallMarker;
  markerText: string;
  warnings: CliIssue[];
};

export type DaemonInstallPullRequestListingStatus =
  | 'open'
  | 'merged'
  | 'closed_unmerged'
  | 'branchWithoutPullRequest';

export type DaemonInstallPullRequestListing = {
  status: DaemonInstallPullRequestListingStatus;
  repository: string;
  daemonId: string | null;
  sourceRepo: string | null;
  sourceRef: string | null;
  catalogSchemaVersion: number | null;
  baseBranch: string | null;
  headBranch: string;
  headSha: string | null;
  pullRequest: DaemonInstallPullRequestInfo | null;
  marker: DaemonInstallMarker | null;
  markerPresent: boolean;
  markerValid: boolean;
  warnings: CliIssue[];
};

export type DaemonInstallPullRequestListResult = {
  repository: string;
  branchPrefix: string;
  installPullRequests: DaemonInstallPullRequestListing[];
  count: number;
  warnings: CliIssue[];
};

export type DaemonInstallMarker = {
  version: 1;
  exampleId: string;
  sourceRepo: string;
  sourceRef: string;
  catalogPath: string;
  catalogSchemaVersion: number;
  targetDirectory: string;
  files: string[];
  adaptationKeys: string[];
  branch: string;
};

export type CreateDaemonInstallPullRequestOptions = {
  repo: GitHubRepositoryRef;
  exampleId: string;
  sourceRef?: string | undefined;
  base?: string | undefined;
  title?: string | undefined;
  body?: string | undefined;
  adaptations?: Record<string, string> | ReadonlyMap<string, string> | undefined;
  adaptationFileValues?: Record<string, string> | ReadonlyMap<string, string> | undefined;
  allowDeprecated?: boolean | undefined;
  force?: boolean | undefined;
  catalogClient?: CatalogClient | undefined;
  githubClient?: DaemonInstallPrGitHubClient | undefined;
  authToken?: string | undefined;
  installRoot?: string | undefined;
  headBranch?: string | undefined;
};

export type ListDaemonInstallPullRequestsOptions = {
  repo: GitHubRepositoryRef;
  githubClient?: DaemonInstallPrGitHubClient | undefined;
  authToken?: string | undefined;
};

export class DaemonInstallPullRequestError extends Error {
  readonly code: string;
  readonly errors: CliIssue[];
  readonly data: unknown;

  constructor(args: { code: string; message: string; errors?: CliIssue[] | undefined; data?: unknown }) {
    super(args.message);
    this.name = 'DaemonInstallPullRequestError';
    this.code = args.code;
    this.errors = args.errors ?? [issue({ code: args.code, message: args.message })];
    this.data = args.data ?? null;
  }
}

type ParsedRepository = {
  owner: string;
  repo: string;
  fullName: string;
};

type GitHubRef = {
  ref: string;
  object: {
    sha: string;
    type: string;
  };
};

type GitHubCommit = {
  sha: string;
  tree: {
    sha: string;
  };
};

type GitHubTreeEntry = {
  path?: string | undefined;
  mode?: string | undefined;
  type?: string | undefined;
  sha?: string | undefined;
};

type GitHubTree = {
  sha: string;
  truncated?: boolean | undefined;
  tree: GitHubTreeEntry[];
};

type GitHubPull = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  merged_at?: string | null | undefined;
  body?: string | null | undefined;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
};

type GitHubSearchIssuesResponse = {
  items: Array<{
    number: number;
    pull_request?: unknown;
  }>;
};

type GitHubRepositoryResponse = {
  default_branch: string;
};

type GitHubApiError = Error & {
  status?: number;
  response?: {
    status?: number;
  };
};

function githubApiStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const status = 'status' in error ? Number((error as GitHubApiError).status) : NaN;
    if (Number.isFinite(status)) return status;
    const responseStatus = 'response' in error ? Number((error as GitHubApiError).response?.status) : NaN;
    if (Number.isFinite(responseStatus)) return responseStatus;
  }
  return null;
}

function isNotFound(error: unknown): boolean {
  return githubApiStatus(error) === 404;
}

function isConflictOrValidation(error: unknown): boolean {
  const status = githubApiStatus(error);
  return status === 409 || status === 422;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function pathForRepo(repository: ParsedRepository, suffix: string): string {
  return `/repos/${encodePathSegment(repository.owner)}/${encodePathSegment(repository.repo)}${suffix}`;
}

function markerIssue(code: string, message: string, field?: string | null, pathValue?: string | null): CliIssue {
  return issue({ code, message, field: field ?? null, path: pathValue ?? null });
}

function parseRepository(repo: GitHubRepositoryRef): ParsedRepository {
  if (typeof repo !== 'string') {
    const owner = repo.owner.trim();
    const repoName = repo.repo.trim();
    if (!owner || !repoName || owner.includes('/') || repoName.includes('/')) {
      throw new DaemonInstallPullRequestError({
        code: 'INVALID_REPOSITORY',
        message: 'Repository must be an owner/repo pair.',
      });
    }
    return { owner, repo: repoName, fullName: `${owner}/${repoName}` };
  }

  const [owner, repoName, extra] = repo.split('/');
  if (!owner || !repoName || extra !== undefined) {
    throw new DaemonInstallPullRequestError({
      code: 'INVALID_REPOSITORY',
      message: `Repository '${repo}' must use owner/repo syntax.`,
    });
  }
  return { owner, repo: repoName, fullName: `${owner}/${repoName}` };
}

function toValueMap(values: Record<string, string> | ReadonlyMap<string, string> | undefined): AdaptationValues {
  if (!values) return new Map();
  if (values instanceof Map) return new Map(values);
  return new Map(Object.entries(values));
}

function deterministicInstallBranch(exampleId: string): string {
  return `${DAEMON_INSTALL_BRANCH_PREFIX}${exampleId}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function createDaemonInstallMarker(marker: DaemonInstallMarker): string {
  return `<!-- ${DAEMON_INSTALL_MARKER_NAME} ${stableJson(marker)} -->`;
}

export function parseDaemonInstallMarker(body: string | null | undefined):
  | { ok: true; marker: DaemonInstallMarker }
  | { ok: false; present: boolean; error: CliIssue | null } {
  if (!body) return { ok: false, present: false, error: null };
  const regex = new RegExp(`<!--\\s*${DAEMON_INSTALL_MARKER_NAME}\\s+([\\s\\S]*?)\\s*-->`);
  const match = body.match(regex);
  if (!match) return { ok: false, present: false, error: null };
  const rawJson = match[1] ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return {
      ok: false,
      present: true,
      error: markerIssue('INSTALL_MARKER_INVALID_JSON', `Install marker JSON is invalid: ${normalizeErrorMessage(error)}`),
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      present: true,
      error: markerIssue('INSTALL_MARKER_INVALID', 'Install marker payload must be an object.'),
    };
  }
  const record = parsed as Record<string, unknown>;
  const files = Array.isArray(record.files) ? record.files.filter((item): item is string => typeof item === 'string') : [];
  const adaptationKeys = Array.isArray(record.adaptationKeys)
    ? record.adaptationKeys.filter((item): item is string => typeof item === 'string')
    : [];
  if (
    record.version !== 1 ||
    typeof record.exampleId !== 'string' ||
    typeof record.sourceRepo !== 'string' ||
    typeof record.sourceRef !== 'string' ||
    typeof record.catalogPath !== 'string' ||
    typeof record.catalogSchemaVersion !== 'number' ||
    typeof record.targetDirectory !== 'string' ||
    typeof record.branch !== 'string' ||
    files.length !== (Array.isArray(record.files) ? record.files.length : -1) ||
    adaptationKeys.length !== (Array.isArray(record.adaptationKeys) ? record.adaptationKeys.length : -1)
  ) {
    return {
      ok: false,
      present: true,
      error: markerIssue('INSTALL_MARKER_INVALID', 'Install marker payload is missing required v1 fields.'),
    };
  }
  return {
    ok: true,
    marker: {
      version: 1,
      exampleId: record.exampleId,
      sourceRepo: record.sourceRepo,
      sourceRef: record.sourceRef,
      catalogPath: record.catalogPath,
      catalogSchemaVersion: record.catalogSchemaVersion,
      targetDirectory: record.targetDirectory,
      files,
      adaptationKeys,
      branch: record.branch,
    },
  };
}

export function createDaemonInstallPrGitHubClient(args: {
  authToken?: string | undefined;
  baseUrl?: string | undefined;
} = {}): DaemonInstallPrGitHubClient {
  const baseUrl = args.baseUrl ?? GITHUB_API_BASE_URL;
  const authToken = args.authToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

  return {
    async request<T>(method: string, requestPath: string, options: DaemonInstallPrGitHubRequestOptions = {}): Promise<T> {
      const url = new URL(requestPath, baseUrl);
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }

      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': '@charlie-labs/daemons daemon install PR API',
        ...(options.headers ?? {}),
      };
      let body: string | undefined;
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      let response: Response;
      try {
        response = await fetch(url, { method, headers, body });
      } catch (error) {
        throw new DaemonInstallPullRequestError({
          code: 'GITHUB_REQUEST_FAILED',
          message: `GitHub ${method} ${requestPath} failed: ${normalizeErrorMessage(error)}`,
        });
      }

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        const error = new DaemonInstallPullRequestError({
          code: response.status === 404 ? 'GITHUB_NOT_FOUND' : 'GITHUB_REQUEST_FAILED',
          message: `GitHub ${method} ${requestPath} failed: HTTP ${response.status.toString()} ${response.statusText}${responseText ? `: ${responseText.slice(0, 500)}` : ''}`,
        }) as DaemonInstallPullRequestError & { status: number; response: { status: number } };
        error.status = response.status;
        error.response = { status: response.status };
        throw error;
      }

      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    },
  };
}

async function getDefaultBranch(args: { githubClient: DaemonInstallPrGitHubClient; repository: ParsedRepository }): Promise<string> {
  const response = await args.githubClient.request<GitHubRepositoryResponse>('GET', pathForRepo(args.repository, ''));
  return response.default_branch;
}

async function getRef(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  ref: string;
}): Promise<GitHubRef | null> {
  try {
    return await args.githubClient.request<GitHubRef>(
      'GET',
      pathForRepo(args.repository, `/git/ref/${args.ref}`)
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function getCommit(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  sha: string;
}): Promise<GitHubCommit> {
  return await args.githubClient.request<GitHubCommit>('GET', pathForRepo(args.repository, `/git/commits/${args.sha}`));
}

async function getTree(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  sha: string;
  recursive?: boolean | undefined;
}): Promise<GitHubTree> {
  return await args.githubClient.request<GitHubTree>('GET', pathForRepo(args.repository, `/git/trees/${args.sha}`), {
    query: args.recursive ? { recursive: '1' } : undefined,
  });
}

async function listPullsForHead(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  branch: string;
  state: 'open' | 'closed' | 'all';
  base?: string | undefined;
}): Promise<GitHubPull[]> {
  const query: Record<string, string> = {
    state: args.state,
    head: `${args.repository.owner}:${args.branch}`,
    per_page: '100',
  };
  if (args.base) query.base = args.base;
  return await args.githubClient.request<GitHubPull[]>('GET', pathForRepo(args.repository, '/pulls'), { query });
}

async function findOpenPullRequestForExactHead(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  branch: string;
  headSha: string;
  baseBranch: string;
}): Promise<GitHubPull | null> {
  const pulls = await listPullsForHead({
    githubClient: args.githubClient,
    repository: args.repository,
    branch: args.branch,
    state: 'open',
    base: args.baseBranch,
  });
  return pulls.find((pull) => pull.head.ref === args.branch && pull.head.sha === args.headSha && pull.base.ref === args.baseBranch) ?? null;
}

function pullInfo(pull: GitHubPull): DaemonInstallPullRequestInfo {
  return {
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    state: pull.state,
    merged: pull.merged_at !== null && pull.merged_at !== undefined,
    mergedAt: pull.merged_at ?? null,
    headRef: pull.head.ref,
    headSha: pull.head.sha,
    baseRef: pull.base.ref,
  };
}

function gitBlobSha(content: string): string {
  const buffer = Buffer.from(content, 'utf8');
  return createHash('sha1')
    .update(Buffer.from(`blob ${buffer.length.toString()}\0`, 'utf8'))
    .update(buffer)
    .digest('hex');
}

function renderedFilesToDisplay(args: { installRoot: string; files: readonly RenderedDaemonInstallFile[] }): InstallFilePlan[] {
  return args.files.map((file) => ({
    sourcePath: file.sourcePath,
    destinationPath: toDisplayPath(args.installRoot, file.destinationPath),
    kind: file.kind,
    mode: file.mode,
  }));
}

function renderedFilesToTreeEntries(args: { installRoot: string; files: readonly RenderedDaemonInstallFile[] }) {
  return args.files.map((file) => ({
    path: toDisplayPath(args.installRoot, file.destinationPath),
    mode: file.mode,
    type: 'blob',
    content: file.content,
  }));
}

function plannedPaths(files: readonly InstallFilePlan[]): string[] {
  return files.map((file) => file.destinationPath).sort((left, right) => left.localeCompare(right));
}

function markerForInstall(args: {
  entry: CatalogExample;
  sourceRef: string;
  catalogSchemaVersion: number;
  targetDirectory: string;
  files: readonly InstallFilePlan[];
  adaptationKeys: readonly string[];
  branch: string;
}): DaemonInstallMarker {
  return {
    version: 1,
    exampleId: args.entry.id,
    sourceRepo: SOURCE_REPO,
    sourceRef: args.sourceRef,
    catalogPath: CATALOG_PATH,
    catalogSchemaVersion: args.catalogSchemaVersion,
    targetDirectory: args.targetDirectory,
    files: plannedPaths(args.files),
    adaptationKeys: [...args.adaptationKeys].sort((left, right) => left.localeCompare(right)),
    branch: args.branch,
  };
}

type DaemonInstallPrBodyDaemonMetadata = {
  id: string;
  purpose: string;
  watch: string[];
  routines: string[];
  schedule: string | null;
};

function markdownListLines(items: readonly string[], args: { code?: boolean | undefined } = {}): string[] {
  if (items.length === 0) return ['- None listed'];
  return items.map((item) => {
    const value = args.code ? `\`${item}\`` : item;
    return `- ${value.replaceAll('\n', '\n  ')}`;
  });
}

function createPullRequestBody(args: {
  entry: CatalogExample;
  repository: ParsedRepository;
  daemon: DaemonInstallPrBodyDaemonMetadata;
  markerText: string;
  body?: string | undefined;
}): string {
  const daemonId = args.daemon.id;
  const requiredIntegrations = args.entry.requirements.requiredIntegrations;
  const optionalIntegrations = args.entry.requirements.optionalIntegrations;
  const lines: string[] = [];
  if (args.body) {
    lines.push(args.body.trim(), '');
  }
  lines.push(
    '## Summary',
    '',
    `This PR installs the \`${daemonId}\` Charlie daemon to \`.agents/daemons/${daemonId}/DAEMON.md\`. It was generated by Charlie from the [\`${daemonId}\` example](https://github.com/${SOURCE_REPO}/blob/master/daemons/${daemonId}/DAEMON.md).`,
    '',
    `The daemon won't start working until it's merged to the repo's default branch.`,
    '',
    '## What Charlie daemons are',
    '',
    'Charlie is an async engineering teammate that works in the tools your team already uses. In GitHub, Charlie can inspect code, review changes, propose patches, open PRs, and comment with findings. With connected integrations, Charlie can also use Linear, Slack, and Sentry context to understand issues, conversations, alerts, and follow-up work.',
    '',
    'A daemon is a recurring role for Charlie. Instead of waiting for someone to mention Charlie every time the same kind of maintenance work appears, the repo contains a small role definition that tells Charlie when to wake up and what job to do.',
    '',
    `This PR adds that role at \`.agents/daemons/${daemonId}/DAEMON.md\`. The file controls:`,
    '',
    '- when Charlie can activate, through `watch` conditions or a `schedule`',
    '- what work Charlie should perform, through `purpose` and `routines`',
    '- what Charlie should avoid, through `deny` rules and body guidance',
    '',
    'After this PR is merged and Charlie ingests the default-branch version, the daemon can start handling that recurring work inside the limits defined in `DAEMON.md`.',
    '',
    'Learn more: https://docs.charlielabs.ai/daemons',
    '',
    '## What this daemon does',
    '',
    '`DAEMON.md` purpose:',
    '',
    `> ${args.daemon.purpose.replaceAll('\n', '\n> ')}`,
    '',
    'This daemon’s configured routines are:',
    '',
    ...markdownListLines(args.daemon.routines),
    '',
    '## When this daemon can activate',
    '',
    'This PR only installs daemon files. The daemon becomes eligible for live activations after both are true:',
    '',
    `1. this PR is merged to the repo's default branch`,
    '2. Charlie ingests the merged default-branch version of `DAEMON.md`'
  );

  if (args.daemon.watch.length > 0) {
    lines.push(
      '',
      '### Watch conditions',
      '',
      'Charlie may wake this daemon when these `watch` conditions match:',
      '',
      ...markdownListLines(args.daemon.watch)
    );
  }

  if (args.daemon.schedule) {
    lines.push(
      '',
      '### Schedule',
      '',
      'Charlie may also wake this daemon on this `schedule`:',
      '',
      `- \`${args.daemon.schedule}\``,
      '',
      'Schedules use five-field UTC cron syntax.'
    );
  }

  lines.push('', '## Integrations and setup', '');

  if (requiredIntegrations.length > 0) {
    lines.push(
      'This daemon requires these integrations to work as intended:',
      '',
      ...markdownListLines(requiredIntegrations, { code: true }),
      ''
    );
  }

  if (optionalIntegrations.length > 0) {
    lines.push(
      'This daemon declares these optional integrations:',
      '',
      ...markdownListLines(optionalIntegrations, { code: true }),
      ''
    );
  }

  if (requiredIntegrations.length === 0 && optionalIntegrations.length === 0) {
    lines.push(...markdownListLines([]), '');
  }

  lines.push(
    'Set up or configure integrations here:',
    '',
    `https://dash.charlielabs.ai/organizations/${args.repository.owner}/integrations`,
    '',
    '## Review and iterate before merging',
    '',
    'Before merging, review the installed `DAEMON.md` and confirm that:',
    '',
    '- the `purpose` matches the recurring work you want Charlie to own',
    '- the `watch` conditions and/or `schedule` are narrow enough for initial rollout',
    '- the `routines` are concrete and bounded',
    '- the `deny` rules cover actions Charlie should not take',
    '- any required integrations above are connected for this organization',
    '',
    'You can ask Charlie on this PR to adjust the daemon before merging. Just leave a comment mentioning `@CharlieHelps`.',
    '',
    'For rollout and iteration guidance:',
    '',
    'https://docs.charlielabs.ai/daemons/testing-and-iterating-on-daemons',
    '',
    '## Activity and future tuning',
    '',
    'After this daemon is merged and ingested, you can review daemon activity here:',
    '',
    `https://dash.charlielabs.ai/organizations/${args.repository.owner}/activity?daemonId=${daemonId}`,
    '',
    'To browse more daemon examples:',
    '',
    'https://github.com/charlie-labs/daemons/blob/master/README.md',
    '',
    args.markerText
  );

  return lines.join('\n');
}

function classifyPull(pull: GitHubPull): DaemonInstallPullRequestListingStatus {
  if (pull.state === 'open') return 'open';
  return pull.merged_at ? 'merged' : 'closed_unmerged';
}

function treeEntryMap(tree: GitHubTree): Map<string, GitHubTreeEntry> {
  const entries = new Map<string, GitHubTreeEntry>();
  for (const entry of tree.tree) {
    if (entry.path) entries.set(entry.path, entry);
  }
  return entries;
}

function detectBaseCollisions(args: {
  baseTree: GitHubTree;
  targetDirectory: string;
  files: readonly InstallFilePlan[];
}): string[] {
  const entries = treeEntryMap(args.baseTree);
  const collisions = new Set<string>();
  const directoryPrefix = `${args.targetDirectory}/`;
  for (const pathValue of entries.keys()) {
    if (pathValue === args.targetDirectory || pathValue.startsWith(directoryPrefix)) {
      collisions.add(`${args.targetDirectory}/`);
      break;
    }
  }
  for (const file of args.files) {
    if (entries.has(file.destinationPath)) collisions.add(file.destinationPath);
  }
  return [...collisions].sort((left, right) => left.localeCompare(right));
}

async function branchContainsRenderedFiles(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  branchSha: string;
  files: readonly RenderedDaemonInstallFile[];
  installRoot: string;
}): Promise<boolean> {
  const branchCommit = await getCommit({ githubClient: args.githubClient, repository: args.repository, sha: args.branchSha });
  const branchTree = await getTree({ githubClient: args.githubClient, repository: args.repository, sha: branchCommit.tree.sha, recursive: true });
  const entries = treeEntryMap(branchTree);
  for (const file of args.files) {
    const targetPath = toDisplayPath(args.installRoot, file.destinationPath);
    const entry = entries.get(targetPath);
    if (!entry || entry.type !== 'blob' || entry.mode !== file.mode || entry.sha !== gitBlobSha(file.content)) {
      return false;
    }
  }
  return true;
}

async function createPullRequest(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
}): Promise<GitHubPull> {
  return await args.githubClient.request<GitHubPull>('POST', pathForRepo(args.repository, '/pulls'), {
    body: {
      title: args.title,
      body: args.body,
      head: args.headBranch,
      base: args.baseBranch,
    },
  });
}

async function openPullFromExistingBranch(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  branch: string;
  branchSha: string;
  baseBranch: string;
  title: string;
  body: string;
}): Promise<{ status: 'existing_open' | 'recovered_branch'; pull: GitHubPull }> {
  const open = await findOpenPullRequestForExactHead({
    githubClient: args.githubClient,
    repository: args.repository,
    branch: args.branch,
    headSha: args.branchSha,
    baseBranch: args.baseBranch,
  });
  if (open) return { status: 'existing_open', pull: open };

  try {
    const pull = await createPullRequest({
      githubClient: args.githubClient,
      repository: args.repository,
      title: args.title,
      body: args.body,
      headBranch: args.branch,
      baseBranch: args.baseBranch,
    });
    return { status: 'recovered_branch', pull };
  } catch (error) {
    if (isConflictOrValidation(error)) {
      const raced = await findOpenPullRequestForExactHead({
        githubClient: args.githubClient,
        repository: args.repository,
        branch: args.branch,
        headSha: args.branchSha,
        baseBranch: args.baseBranch,
      });
      if (raced) return { status: 'existing_open', pull: raced };
    }
    throw error;
  }
}

async function recoverExistingBranch(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  branch: string;
  branchSha: string;
  baseBranch: string;
  title: string;
  body: string;
  renderedFiles: readonly RenderedDaemonInstallFile[];
  installRoot: string;
}): Promise<{ status: 'existing_open' | 'recovered_branch'; pull: GitHubPull }> {
  const open = await findOpenPullRequestForExactHead({
    githubClient: args.githubClient,
    repository: args.repository,
    branch: args.branch,
    headSha: args.branchSha,
    baseBranch: args.baseBranch,
  });
  if (open) return { status: 'existing_open', pull: open };

  const branchMatches = await branchContainsRenderedFiles({
    githubClient: args.githubClient,
    repository: args.repository,
    branchSha: args.branchSha,
    files: args.renderedFiles,
    installRoot: args.installRoot,
  });
  if (!branchMatches) {
    throw new DaemonInstallPullRequestError({
      code: 'INSTALL_BRANCH_COLLISION',
      message: `Branch '${args.branch}' already exists but does not contain the expected daemon install files.`,
      errors: [
        markerIssue(
          'INSTALL_BRANCH_COLLISION',
          `Branch '${args.branch}' already exists but does not contain the expected daemon install files.`
        ),
      ],
    });
  }

  return await openPullFromExistingBranch(args);
}

export async function createDaemonInstallPullRequest(
  options: CreateDaemonInstallPullRequestOptions
): Promise<DaemonInstallPullRequestOpenResult> {
  const repository = parseRepository(options.repo);
  const exampleId = options.exampleId;
  if (!DAEMON_ID_PATTERN.test(exampleId)) {
    throw new DaemonInstallPullRequestError({
      code: 'INVALID_DAEMON_ID',
      message: `Invalid example id '${exampleId}'. Expected kebab-case.`,
    });
  }

  const sourceRef = options.sourceRef ?? DEFAULT_CATALOG_REF;
  const installRoot = options.installRoot ?? DEFAULT_INSTALL_ROOT;
  const catalogClient = options.catalogClient ?? createGitHubCatalogClient();
  const githubClient = options.githubClient ?? createDaemonInstallPrGitHubClient({ authToken: options.authToken });
  const catalog = await catalogClient.loadCatalog(sourceRef);
  const entry = catalog.examples.find((candidate) => candidate.id === exampleId);
  if (!entry) {
    throw new DaemonInstallPullRequestError({
      code: 'EXAMPLE_NOT_FOUND',
      message: `No daemon example found for '${exampleId}'.`,
    });
  }
  if (entry.status === 'deprecated' && options.allowDeprecated !== true) {
    throw new DaemonInstallPullRequestError({
      code: 'DEPRECATED_EXAMPLE_BLOCKED',
      message: `Example '${exampleId}' is deprecated.`,
    });
  }

  const installPlanResult = createDaemonInstallPlan({ entry, installRoot });
  if (!installPlanResult.ok) {
    throw new DaemonInstallPullRequestError({
      code: 'INSTALL_PLAN_INVALID',
      message: `Catalog entry '${exampleId}' cannot be installed safely.`,
      errors: installPlanResult.errors,
    });
  }

  const fileValues = toValueMap(options.adaptationFileValues);
  const cliValues = toValueMap(options.adaptations);
  const adaptationResolution = resolveAdaptations({ entry, fileValues, cliValues });
  if (!adaptationResolution.ok) {
    throw new DaemonInstallPullRequestError({
      code: 'ADAPTATION_INPUTS_INVALID',
      message: `Adaptation inputs for '${exampleId}' are incomplete or invalid.`,
      errors: adaptationResolution.errors,
    });
  }

  const rendered = await prepareDaemonInstallFiles({
    entry,
    ref: sourceRef,
    catalogClient,
    installRoot,
    files: installPlanResult.plan.files,
    resolution: adaptationResolution.resolution,
  });
  if (!rendered.ok) {
    throw new DaemonInstallPullRequestError({
      code: 'RENDERED_INSTALL_INVALID',
      message: `Rendered daemon example '${exampleId}' is invalid.`,
      errors: rendered.errors,
    });
  }

  const baseBranch = options.base ?? (await getDefaultBranch({ githubClient, repository }));
  const headBranch = options.headBranch ?? deterministicInstallBranch(entry.id);
  if (!headBranch.startsWith(DAEMON_INSTALL_BRANCH_PREFIX)) {
    throw new DaemonInstallPullRequestError({
      code: 'INVALID_INSTALL_BRANCH',
      message: `Install branch '${headBranch}' must be under '${DAEMON_INSTALL_BRANCH_PREFIX}'.`,
    });
  }

  const plannedDisplayFiles = renderedFilesToDisplay({ installRoot, files: rendered.files });
  const targetDirectory = toDisplayPath(installRoot, installPlanResult.plan.destinationDirectory);
  const marker = markerForInstall({
    entry,
    sourceRef,
    catalogSchemaVersion: catalog.schemaVersion,
    targetDirectory,
    files: plannedDisplayFiles,
    adaptationKeys: adaptationResolution.resolution.appliedKeys,
    branch: headBranch,
  });
  const markerText = createDaemonInstallMarker(marker);
  const daemonFile = rendered.files.find((file) => file.kind === 'daemon');
  if (!daemonFile) {
    throw new DaemonInstallPullRequestError({
      code: 'INSTALL_PLAN_MISSING_DAEMON',
      message: 'Install plan did not include DAEMON.md.',
    });
  }
  const daemonDisplayPath = toDisplayPath(installRoot, daemonFile.destinationPath);
  const daemonValidation = validateRuntimeDaemonMarkdown({
    content: daemonFile.content,
    path: daemonDisplayPath,
    expectedId: entry.id,
  });
  if (!daemonValidation.ok) {
    throw new DaemonInstallPullRequestError({
      code: 'RENDERED_DAEMON_METADATA_INVALID',
      message: `Rendered daemon example '${exampleId}' metadata could not be read for PR body generation.`,
      errors: daemonValidation.errors,
    });
  }

  const title = options.title ?? `Install ${entry.id} daemon`;
  const body = createPullRequestBody({
    entry,
    repository,
    daemon: daemonValidation.daemon,
    markerText,
    body: options.body,
  });

  const existingBranchRef = await getRef({ githubClient, repository, ref: `heads/${headBranch}` });
  if (existingBranchRef) {
    const recovered = await recoverExistingBranch({
      githubClient,
      repository,
      branch: headBranch,
      branchSha: existingBranchRef.object.sha,
      baseBranch,
      title,
      body,
      renderedFiles: rendered.files,
      installRoot,
    });
    return {
      status: recovered.status,
      repository: repository.fullName,
      daemonId: entry.id,
      sourceRepo: SOURCE_REPO,
      sourceRef,
      catalogSchemaVersion: catalog.schemaVersion,
      baseBranch,
      headBranch,
      headSha: recovered.pull.head.sha,
      pullRequest: pullInfo(recovered.pull),
      filesPlanned: plannedDisplayFiles,
      filesWritten: plannedDisplayFiles.map((file) => file.destinationPath),
      adaptationsApplied: adaptationResolution.resolution.appliedKeys,
      marker,
      markerText,
      warnings: [],
    };
  }

  const baseRef = await getRef({ githubClient, repository, ref: `heads/${baseBranch}` });
  if (!baseRef) {
    throw new DaemonInstallPullRequestError({
      code: 'BASE_REF_NOT_FOUND',
      message: `Base branch '${baseBranch}' was not found in '${repository.fullName}'.`,
    });
  }
  const baseCommit = await getCommit({ githubClient, repository, sha: baseRef.object.sha });
  const baseTree = await getTree({ githubClient, repository, sha: baseCommit.tree.sha, recursive: true });
  const collisions = detectBaseCollisions({
    baseTree,
    targetDirectory,
    files: plannedDisplayFiles,
  });
  if (collisions.length > 0 && options.force !== true) {
    throw new DaemonInstallPullRequestError({
      code: 'INSTALL_COLLISION',
      message: `Refusing to open daemon install PR because ${collisions.length.toString()} target path${collisions.length === 1 ? '' : 's'} already exist.`,
      errors: collisions.map((collision) =>
        markerIssue('INSTALL_COLLISION', `Target path already exists: ${collision}`, null, collision)
      ),
      data: { collisions },
    });
  }

  const createdTree = await githubClient.request<GitHubTree>('POST', pathForRepo(repository, '/git/trees'), {
    body: {
      base_tree: baseCommit.tree.sha,
      tree: renderedFilesToTreeEntries({ installRoot, files: rendered.files }),
    },
  });
  const createdCommit = await githubClient.request<GitHubCommit>('POST', pathForRepo(repository, '/git/commits'), {
    body: {
      message: `Install ${entry.id} daemon`,
      tree: createdTree.sha,
      parents: [baseRef.object.sha],
    },
  });

  try {
    await githubClient.request<GitHubRef>('POST', pathForRepo(repository, '/git/refs'), {
      body: {
        ref: `refs/heads/${headBranch}`,
        sha: createdCommit.sha,
      },
    });
  } catch (error) {
    if (!isConflictOrValidation(error)) throw error;
    const racedBranch = await getRef({ githubClient, repository, ref: `heads/${headBranch}` });
    if (!racedBranch) throw error;
    const recovered = await recoverExistingBranch({
      githubClient,
      repository,
      branch: headBranch,
      branchSha: racedBranch.object.sha,
      baseBranch,
      title,
      body,
      renderedFiles: rendered.files,
      installRoot,
    });
    return {
      status: recovered.status,
      repository: repository.fullName,
      daemonId: entry.id,
      sourceRepo: SOURCE_REPO,
      sourceRef,
      catalogSchemaVersion: catalog.schemaVersion,
      baseBranch,
      headBranch,
      headSha: recovered.pull.head.sha,
      pullRequest: pullInfo(recovered.pull),
      filesPlanned: plannedDisplayFiles,
      filesWritten: plannedDisplayFiles.map((file) => file.destinationPath),
      adaptationsApplied: adaptationResolution.resolution.appliedKeys,
      marker,
      markerText,
      warnings: [],
    };
  }

  let pull: GitHubPull;
  try {
    pull = await createPullRequest({
      githubClient,
      repository,
      title,
      body,
      headBranch,
      baseBranch,
    });
  } catch (error) {
    if (!isConflictOrValidation(error)) throw error;
    const raced = await findOpenPullRequestForExactHead({
      githubClient,
      repository,
      branch: headBranch,
      headSha: createdCommit.sha,
      baseBranch,
    });
    if (!raced) throw error;
    pull = raced;
  }

  return {
    status: 'created',
    repository: repository.fullName,
    daemonId: entry.id,
    sourceRepo: SOURCE_REPO,
    sourceRef,
    catalogSchemaVersion: catalog.schemaVersion,
    baseBranch,
    headBranch,
    headSha: createdCommit.sha,
    pullRequest: pullInfo(pull),
    filesPlanned: plannedDisplayFiles,
    filesWritten: plannedDisplayFiles.map((file) => file.destinationPath),
    adaptationsApplied: adaptationResolution.resolution.appliedKeys,
    marker,
    markerText,
    warnings: [],
  };
}

async function listMatchingRefs(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
}): Promise<GitHubRef[]> {
  try {
    return await args.githubClient.request<GitHubRef[]>(
      'GET',
      pathForRepo(args.repository, `/git/matching-refs/heads/${DAEMON_INSTALL_BRANCH_PREFIX}`)
    );
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

async function searchMarkerPullRequests(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  warnings: CliIssue[];
}): Promise<number[]> {
  try {
    const search = await args.githubClient.request<GitHubSearchIssuesResponse>('GET', '/search/issues', {
      query: {
        q: `repo:${args.repository.fullName} is:pr in:body ${DAEMON_INSTALL_MARKER_NAME}`,
        per_page: '100',
      },
    });
    return search.items.filter((item) => item.pull_request !== undefined).map((item) => item.number);
  } catch (error) {
    args.warnings.push(
      markerIssue(
        'INSTALL_PR_SEARCH_UNAVAILABLE',
        `GitHub search for install markers failed; falling back to deterministic branch reconciliation: ${normalizeErrorMessage(error)}`
      )
    );
    return [];
  }
}

async function getPull(args: {
  githubClient: DaemonInstallPrGitHubClient;
  repository: ParsedRepository;
  number: number;
}): Promise<GitHubPull | null> {
  try {
    return await args.githubClient.request<GitHubPull>('GET', pathForRepo(args.repository, `/pulls/${args.number.toString()}`));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function listingFromPull(args: { repository: ParsedRepository; pull: GitHubPull }): DaemonInstallPullRequestListing {
  const markerResult = parseDaemonInstallMarker(args.pull.body);
  const warnings: CliIssue[] = [];
  let marker: DaemonInstallMarker | null = null;
  let markerPresent = false;
  let markerValid = false;
  if (markerResult.ok) {
    marker = markerResult.marker;
    markerPresent = true;
    markerValid = true;
  } else {
    markerPresent = markerResult.present;
    markerValid = false;
    if (markerResult.error) warnings.push(markerResult.error);
    if (!markerPresent && args.pull.head.ref.startsWith(DAEMON_INSTALL_BRANCH_PREFIX)) {
      warnings.push(
        markerIssue(
          'INSTALL_MARKER_MISSING',
          `Pull request #${args.pull.number.toString()} uses an install branch but does not currently contain an install marker.`
        )
      );
    }
  }

  return {
    status: classifyPull(args.pull),
    repository: args.repository.fullName,
    daemonId: marker?.exampleId ?? daemonIdFromBranch(args.pull.head.ref),
    sourceRepo: marker?.sourceRepo ?? null,
    sourceRef: marker?.sourceRef ?? null,
    catalogSchemaVersion: marker?.catalogSchemaVersion ?? null,
    baseBranch: args.pull.base.ref,
    headBranch: args.pull.head.ref,
    headSha: args.pull.head.sha,
    pullRequest: pullInfo(args.pull),
    marker,
    markerPresent,
    markerValid,
    warnings,
  };
}

function daemonIdFromBranch(branch: string): string | null {
  if (!branch.startsWith(DAEMON_INSTALL_BRANCH_PREFIX)) return null;
  const id = branch.slice(DAEMON_INSTALL_BRANCH_PREFIX.length);
  return DAEMON_ID_PATTERN.test(id) ? id : null;
}

export async function listDaemonInstallPullRequests(
  options: ListDaemonInstallPullRequestsOptions
): Promise<DaemonInstallPullRequestListResult> {
  const repository = parseRepository(options.repo);
  const githubClient = options.githubClient ?? createDaemonInstallPrGitHubClient({ authToken: options.authToken });
  const warnings: CliIssue[] = [];
  const listingsByKey = new Map<string, DaemonInstallPullRequestListing>();

  const markerPullNumbers = await searchMarkerPullRequests({ githubClient, repository, warnings });
  for (const pullNumber of markerPullNumbers) {
    const pull = await getPull({ githubClient, repository, number: pullNumber });
    if (!pull) continue;
    const listing = listingFromPull({ repository, pull });
    listingsByKey.set(`pr:${pull.number.toString()}`, listing);
  }

  const refs = await listMatchingRefs({ githubClient, repository });
  for (const ref of refs) {
    const branch = ref.ref.replace(/^refs\/heads\//, '');
    const pulls = await listPullsForHead({ githubClient, repository, branch, state: 'all' });
    if (pulls.length === 0) {
      listingsByKey.set(`branch:${branch}`, {
        status: 'branchWithoutPullRequest',
        repository: repository.fullName,
        daemonId: daemonIdFromBranch(branch),
        sourceRepo: null,
        sourceRef: null,
        catalogSchemaVersion: null,
        baseBranch: null,
        headBranch: branch,
        headSha: ref.object.sha,
        pullRequest: null,
        marker: null,
        markerPresent: false,
        markerValid: false,
        warnings: [markerIssue('INSTALL_BRANCH_WITHOUT_PULL_REQUEST', `Branch '${branch}' has no associated pull request.`)],
      });
      continue;
    }

    for (const pull of pulls) {
      const key = `pr:${pull.number.toString()}`;
      if (!listingsByKey.has(key)) {
        listingsByKey.set(key, listingFromPull({ repository, pull }));
      }
    }
  }

  const installPullRequests = [...listingsByKey.values()].sort((left, right) => {
    const leftNumber = left.pullRequest?.number ?? Number.MAX_SAFE_INTEGER;
    const rightNumber = right.pullRequest?.number ?? Number.MAX_SAFE_INTEGER;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    return left.headBranch.localeCompare(right.headBranch);
  });

  return {
    repository: repository.fullName,
    branchPrefix: DAEMON_INSTALL_BRANCH_PREFIX,
    installPullRequests,
    count: installPullRequests.length,
    warnings,
  };
}
