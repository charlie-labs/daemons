export const COMMUNITY_REGISTRY_REPO = 'charlie-labs/daemon-registry';
export const COMMUNITY_REGISTRY_REF = 'master';
export const COMMUNITY_REGISTRY_PATH = 'catalog.json';
export const COMMUNITY_REGISTRY_SCHEMA_VERSION = 1;

export type CommunityIntegration = 'github' | 'linear' | 'slack' | 'sentry';
export type CommunityReviewedFileMode = '100644' | '100755';

export type CommunityReviewedFile = {
  path: string;
  mode: CommunityReviewedFileMode;
  sha256: string;
};

export type CommunityRegistryEntry = {
  slug: string;
  displayName: string;
  summary: string;
  sourceType: 'first-party' | 'community';
  repositoryUrl: string;
  canonicalSourceUrl: string;
  daemonPath: string;
  commit: string;
  integrations: CommunityIntegration[];
  approvalStatus: 'approved';
  reviewedFiles: CommunityReviewedFile[];
};

export type CommunityRegistryCatalog = {
  schemaVersion: 1;
  entries: CommunityRegistryEntry[];
};

export type CommunityRegistryValidationError = {
  code: string;
  path: string;
  fieldPath: string | null;
  message: string;
};

export type CommunityRegistryValidationResult =
  | { ok: true; value: CommunityRegistryCatalog; errors: [] }
  | { ok: false; errors: CommunityRegistryValidationError[] };

export type CommunitySourceFile = CommunityReviewedFile & {
  content: string;
};
