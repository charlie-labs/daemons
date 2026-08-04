import {
  COMMUNITY_REGISTRY_PATH,
  COMMUNITY_REGISTRY_REF,
  COMMUNITY_REGISTRY_REPO,
  type CommunityRegistryCatalog,
} from './types';
import { parseCommunityRegistryContent } from './schema';
import { CommunitySourceError, fetchApprovedCommunitySource, type CommunityGitHubClient } from './source';
import type { CommunityRegistryEntry, CommunitySourceFile } from './types';

export type CommunityRegistryClient = {
  loadCatalog(): Promise<CommunityRegistryCatalog>;
  fetchSource(entry: CommunityRegistryEntry): Promise<CommunitySourceFile[]>;
};

export function createGitHubCommunityRegistryClient(githubClient: CommunityGitHubClient): CommunityRegistryClient {
  return {
    async loadCatalog(): Promise<CommunityRegistryCatalog> {
      const [owner, repo] = COMMUNITY_REGISTRY_REPO.split('/');
      const response = await githubClient.request<{ content: string; encoding: string; type: string }>(
        'GET',
        `/repos/${owner}/${repo}/contents/${COMMUNITY_REGISTRY_PATH}`,
        { query: { ref: COMMUNITY_REGISTRY_REF } }
      );
      if (response.type !== 'file' || response.encoding !== 'base64') {
        throw new CommunitySourceError({ code: 'COMMUNITY_CATALOG_INVALID_SOURCE', path: COMMUNITY_REGISTRY_PATH, message: 'Community catalog response is not a base64 file.' });
      }
      const parsed = parseCommunityRegistryContent({
        content: Buffer.from(response.content.replaceAll('\n', ''), 'base64').toString('utf8'),
        path: COMMUNITY_REGISTRY_PATH,
      });
      if (!parsed.ok) {
        const first = parsed.errors[0]!;
        throw new CommunitySourceError({ code: first.code, path: first.path, message: first.message });
      }
      return parsed.value;
    },
    async fetchSource(entry: CommunityRegistryEntry): Promise<CommunitySourceFile[]> {
      return await fetchApprovedCommunitySource({ entry, githubClient });
    },
  };
}
