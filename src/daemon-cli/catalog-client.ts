import { CATALOG_PATH, SOURCE_REPO, SOURCE_REPO_NAME, SOURCE_REPO_OWNER } from './constants';
import { normalizeErrorMessage } from './issues';
import type { CatalogClient } from './types';
import { parseExamplesCatalogContent } from '../examples/schema';
import type { ExamplesCatalog } from '../examples/types';
import { createGitHubCommunityRegistryClient } from '../community-registry/client';
import type { CommunityGitHubRequestOptions } from '../community-registry/source';

export class CatalogClientError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(args: { code: string; path: string; message: string }) {
    super(args.message);
    this.name = 'CatalogClientError';
    this.code = args.code;
    this.path = args.path;
  }
}

function encodePath(pathValue: string): string {
  return pathValue.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

async function readGitHubTextFile(args: { ref: string; path: string }): Promise<string> {
  const url = new URL(
    `https://api.github.com/repos/${SOURCE_REPO_OWNER}/${SOURCE_REPO_NAME}/contents/${encodePath(args.path)}`
  );
  url.searchParams.set('ref', args.ref);

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.raw+json',
    'User-Agent': '@charlie-labs/daemons daemon CLI',
  };

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new CatalogClientError({
      code: 'CATALOG_FETCH_FAILED',
      path: args.path,
      message: `Unable to fetch ${SOURCE_REPO}@${args.ref}:${args.path}: ${normalizeErrorMessage(error)}`,
    });
  }

  if (!response.ok) {
    throw new CatalogClientError({
      code: response.status === 404 ? 'CATALOG_FILE_NOT_FOUND' : 'CATALOG_FETCH_FAILED',
      path: args.path,
      message: `Unable to fetch ${SOURCE_REPO}@${args.ref}:${args.path}: HTTP ${response.status.toString()} ${response.statusText}`,
    });
  }

  return await response.text();
}

async function requestGitHubJson<T>(method: string, requestPath: string, options: CommunityGitHubRequestOptions = {}): Promise<T> {
  const url = new URL(requestPath, 'https://api.github.com');
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': '@charlie-labs/daemons community registry client',
    ...(options.headers ?? {}),
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { method, headers });
  if (!response.ok) {
    throw new CatalogClientError({
      code: response.status === 404 ? 'COMMUNITY_CATALOG_NOT_FOUND' : 'COMMUNITY_GITHUB_REQUEST_FAILED',
      path: requestPath,
      message: `GitHub ${method} ${requestPath} failed: HTTP ${response.status.toString()} ${response.statusText}`,
    });
  }
  return await response.json() as T;
}

export function createGitHubCatalogClient(): CatalogClient {
  const community = createGitHubCommunityRegistryClient({ request: requestGitHubJson });
  return {
    async loadCatalog(ref: string): Promise<ExamplesCatalog> {
      const content = await readGitHubTextFile({ ref, path: CATALOG_PATH });
      const parsed = parseExamplesCatalogContent({ content, path: CATALOG_PATH });
      if (!parsed.ok) {
        const firstError = parsed.errors[0];
        throw new CatalogClientError({
          code: firstError?.code ?? 'INVALID_CATALOG',
          path: firstError?.path ?? CATALOG_PATH,
          message: firstError?.message ?? 'examples.json is invalid.',
        });
      }
      return parsed.value;
    },

    async readTextFile(ref: string, path: string): Promise<string> {
      return await readGitHubTextFile({ ref, path });
    },

    async loadCommunityCatalog() {
      try {
        return await community.loadCatalog();
      } catch (error) {
        if (error instanceof CatalogClientError && error.code === 'COMMUNITY_CATALOG_NOT_FOUND') {
          return { schemaVersion: 1, entries: [] };
        }
        throw error;
      }
    },

    async fetchCommunitySource(entry) {
      return await community.fetchSource(entry);
    },
  };
}
