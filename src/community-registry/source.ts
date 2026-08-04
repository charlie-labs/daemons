import { createHash } from 'node:crypto';
import type { CommunityRegistryEntry, CommunitySourceFile } from './types';

export type CommunityGitHubRequestOptions = {
  query?: Record<string, string | number | boolean | null | undefined> | undefined;
  headers?: Record<string, string> | undefined;
};

export type CommunityGitHubClient = {
  request<T>(method: string, path: string, options?: CommunityGitHubRequestOptions): Promise<T>;
};

type GitCommit = { sha?: string; tree?: { sha?: string } };
type GitTree = { truncated: boolean; tree: Array<{ path?: string; mode?: string; type?: string; sha?: string }> };
type GitBlob = { content: string; encoding: string; truncated?: boolean };

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export class CommunitySourceError extends Error {
  readonly code: string;
  readonly path: string | null;
  constructor(args: { code: string; message: string; path?: string | null }) {
    super(args.message);
    this.name = 'CommunitySourceError';
    this.code = args.code;
    this.path = args.path ?? null;
  }
}

function repositoryParts(repositoryUrl: string): { owner: string; repo: string } {
  const match = repositoryUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) throw new CommunitySourceError({ code: 'INVALID_COMMUNITY_REPOSITORY', message: `Invalid repository URL ${repositoryUrl}.` });
  return { owner: match[1]!, repo: match[2]! };
}

function strictUtf8(bytes: Uint8Array, filePath: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_INVALID_UTF8', path: filePath, message: `${filePath} is not valid UTF-8.` });
  }
}

export async function fetchApprovedCommunitySource(args: {
  entry: CommunityRegistryEntry;
  githubClient: CommunityGitHubClient;
}): Promise<CommunitySourceFile[]> {
  const repository = repositoryParts(args.entry.repositoryUrl);
  const basePath = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  const commit = await args.githubClient.request<GitCommit>('GET', `${basePath}/git/commits/${args.entry.commit}`);
  if (!commit || typeof commit.sha !== 'string' || commit.sha !== args.entry.commit || !FULL_GIT_SHA_PATTERN.test(commit.sha)) {
    throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_COMMIT_MISMATCH', message: 'GitHub did not return the exact pinned source commit.' });
  }
  const treeSha = commit.tree?.sha;
  if (typeof treeSha !== 'string' || !FULL_GIT_SHA_PATTERN.test(treeSha)) {
    throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_INVALID_TREE_SHA', message: 'GitHub did not return a valid source tree SHA.' });
  }
  const tree = await args.githubClient.request<GitTree>('GET', `${basePath}/git/trees/${treeSha}`, { query: { recursive: '1' } });
  if (tree.truncated) {
    throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_TRUNCATED_TREE', message: 'GitHub returned a truncated source tree.' });
  }
  const byPath = new Map(tree.tree.map((item) => [item.path, item]));
  const files: CommunitySourceFile[] = [];
  for (const reviewed of args.entry.reviewedFiles) {
    const treeEntry = byPath.get(reviewed.path);
    if (!treeEntry) throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_MISSING_FILE', path: reviewed.path, message: `Missing reviewed file ${reviewed.path}.` });
    if (treeEntry.type !== 'blob' || !treeEntry.sha) {
      throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_NOT_BLOB', path: reviewed.path, message: `${reviewed.path} is not a regular Git blob.` });
    }
    if (treeEntry.mode !== reviewed.mode) {
      throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_MODE_MISMATCH', path: reviewed.path, message: `${reviewed.path} mode does not match the reviewed manifest.` });
    }
    const blob = await args.githubClient.request<GitBlob>('GET', `${basePath}/git/blobs/${treeEntry.sha}`);
    if (blob.truncated || blob.encoding !== 'base64') {
      throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_INVALID_BLOB', path: reviewed.path, message: `${reviewed.path} blob response is incomplete or unsupported.` });
    }
    const bytes = Buffer.from(blob.content.replaceAll('\n', ''), 'base64');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== reviewed.sha256) {
      throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_HASH_MISMATCH', path: reviewed.path, message: `${reviewed.path} SHA-256 does not match the reviewed manifest.` });
    }
    const content = strictUtf8(bytes, reviewed.path);
    if (/{{\s*adapt\./.test(content)) {
      throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_ADAPTATION_TOKEN', path: reviewed.path, message: `${reviewed.path} contains unsupported {{adapt.*}} tokens.` });
    }
    files.push({ ...reviewed, content });
  }
  if (files.length !== args.entry.reviewedFiles.length) {
    throw new CommunitySourceError({ code: 'COMMUNITY_SOURCE_INCOMPLETE_MANIFEST', message: 'Community source did not produce the complete reviewed manifest.' });
  }
  return files;
}
