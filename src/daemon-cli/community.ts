import path from 'node:path';
import { ACTIVATION_CAVEAT, DAEMON_FILENAME, SOURCE_REPO } from './constants';
import { expectedDaemonIdFromPath, toDisplayPath } from './fs-utils';
import { createSourceNeutralDaemonInstallPlan, type DaemonInstallPlan } from './install-plan';
import { issue } from './issues';
import type { CatalogClient, CliIssue } from './types';
import { validateRuntimeDaemonMarkdown } from './validation/runtime';
import type { CatalogExample, ExamplesCatalog } from '../examples/types';
import type { CommunityRegistryCatalog, CommunityRegistryEntry } from '../community-registry/types';
import type { RenderedDaemonInstallFile } from './install-rendering';

export type ResolvedDaemon =
  | { kind: 'bundled'; entry: CatalogExample; sourceRef: string; catalogSchemaVersion: number }
  | { kind: 'registry'; entry: CommunityRegistryEntry; sourceRef: string; catalogSchemaVersion: number };

export async function loadDaemonCatalogs(args: { catalogClient: CatalogClient; ref: string }): Promise<{
  firstParty: ExamplesCatalog;
  community: CommunityRegistryCatalog;
}> {
  const [firstParty, community] = await Promise.all([
    args.catalogClient.loadCatalog(args.ref),
    args.catalogClient.loadCommunityCatalog
      ? args.catalogClient.loadCommunityCatalog()
      : Promise.resolve({ schemaVersion: 1 as const, entries: [] }),
  ]);
  const reserved = new Set(firstParty.examples.map((entry) => entry.id));
  const collision = community.entries.find((entry) => reserved.has(entry.slug));
  if (collision) {
    const error = new Error(`Approved external slug '${collision.slug}' collides with a first-party daemon.`) as Error & { code: string; path: string };
    error.code = 'COMMUNITY_SLUG_COLLISION';
    error.path = 'catalog.json';
    throw error;
  }
  return { firstParty, community };
}

export function resolveDaemon(args: {
  firstParty: ExamplesCatalog;
  community: CommunityRegistryCatalog;
  slug: string;
  firstPartyRef: string;
}): ResolvedDaemon | null {
  const firstParty = args.firstParty.examples.find((entry) => entry.id === args.slug);
  if (firstParty) return { kind: 'bundled', entry: firstParty, sourceRef: args.firstPartyRef, catalogSchemaVersion: args.firstParty.schemaVersion };
  const community = args.community.entries.find((entry) => entry.slug === args.slug);
  if (community) return { kind: 'registry', entry: community, sourceRef: community.commit, catalogSchemaVersion: args.community.schemaVersion };
  return null;
}

export function communityRelativePath(entry: CommunityRegistryEntry, sourcePath: string): string {
  const directory = path.posix.dirname(entry.daemonPath);
  return sourcePath === entry.daemonPath ? DAEMON_FILENAME : path.posix.relative(directory, sourcePath);
}

export async function prepareCommunityInstall(args: {
  entry: CommunityRegistryEntry;
  catalogClient: CatalogClient;
  installRoot: string;
}): Promise<{ ok: true; plan: DaemonInstallPlan; files: RenderedDaemonInstallFile[] } | { ok: false; errors: CliIssue[] }> {
  if (!args.catalogClient.fetchCommunitySource) {
    return { ok: false, errors: [issue({ code: 'COMMUNITY_SOURCE_UNAVAILABLE', message: 'Community source fetching is unavailable.' })] };
  }
  const sourceFiles = await args.catalogClient.fetchCommunitySource(args.entry);
  if (sourceFiles.length !== args.entry.reviewedFiles.length) {
    return { ok: false, errors: [issue({ code: 'COMMUNITY_SOURCE_INCOMPLETE_MANIFEST', message: 'Community source did not return the complete reviewed manifest.' })] };
  }
  for (const [index, reviewed] of args.entry.reviewedFiles.entries()) {
    const fetched = sourceFiles[index];
    if (!fetched || fetched.path !== reviewed.path || fetched.mode !== reviewed.mode || fetched.sha256 !== reviewed.sha256 || typeof fetched.content !== 'string') {
      return {
        ok: false,
        errors: [issue({
          code: 'COMMUNITY_SOURCE_STALE_MANIFEST',
          message: `Community source result does not exactly match reviewedFiles[${index.toString()}].`,
          field: `reviewedFiles[${index.toString()}]`,
          path: reviewed.path,
        })],
      };
    }
  }
  const planResult = createSourceNeutralDaemonInstallPlan({
    daemonId: args.entry.slug,
    installRoot: args.installRoot,
    files: sourceFiles.map((file) => ({ sourcePath: file.path, relativePath: communityRelativePath(args.entry, file.path), mode: file.mode })),
  });
  if (!planResult.ok) return planResult;
  const contentByPath = new Map(sourceFiles.map((file) => [file.path, file.content]));
  const files: RenderedDaemonInstallFile[] = planResult.plan.files.map((file) => ({ ...file, content: contentByPath.get(file.sourcePath)! }));
  const daemon = files.find((file) => file.kind === 'daemon');
  if (!daemon) return { ok: false, errors: [issue({ code: 'INSTALL_PLAN_MISSING_DAEMON', message: 'Install plan did not include DAEMON.md.' })] };
  const displayPath = toDisplayPath(args.installRoot, daemon.destinationPath);
  const validation = validateRuntimeDaemonMarkdown({ content: daemon.content, path: displayPath, expectedId: expectedDaemonIdFromPath(displayPath) });
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, plan: planResult.plan, files };
}

export function firstPartyListItem(entry: CatalogExample) {
  return { id: entry.id, title: entry.title, status: entry.status, readiness: entry.readiness, summary: entry.summary, sourceType: 'first-party' as const };
}

export function communityListItem(entry: CommunityRegistryEntry) {
  return { id: entry.slug, title: entry.displayName, status: 'ready' as const, readiness: 'direct-copy' as const, summary: entry.summary, sourceType: entry.sourceType };
}

export function communitySourceMetadata(entry: CommunityRegistryEntry) {
  return {
    sourceRepo: entry.repositoryUrl.replace('https://github.com/', ''),
    sourceRef: entry.commit,
    sourceType: entry.sourceType,
    repositoryUrl: entry.repositoryUrl,
    canonicalSourceUrl: entry.canonicalSourceUrl,
    activationRequired: ACTIVATION_CAVEAT,
  };
}

export function firstPartySourceMetadata(ref: string) {
  return { sourceRepo: SOURCE_REPO, sourceRef: ref, sourceType: 'first-party' as const };
}
