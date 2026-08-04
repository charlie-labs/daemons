import path from 'node:path';
import { z, type ZodIssue } from 'zod';
import { DAEMON_ID_PATTERN } from '../daemon-cli/constants';
import type {
  CommunityRegistryCatalog,
  CommunityRegistryValidationError,
  CommunityRegistryValidationResult,
} from './types';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REPOSITORY_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]+)$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function canonicalRepositoryUrl(value: string): boolean {
  const repository = value.match(REPOSITORY_PATTERN);
  if (!repository) return false;
  const repo = repository[2]!;
  return repo.length <= 100 && repo !== '.' && repo !== '..' && !repo.toLowerCase().endsWith('.git');
}

function normalizedRelativePosixPath(value: string): boolean {
  if (!value || value.trim() !== value || value.startsWith('/') || value.includes('\\') || value.includes('//')) return false;
  const parts = value.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..' && PATH_SEGMENT_PATTERN.test(part)) && path.posix.normalize(value) === value;
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

const reviewedFileSchema = z
  .object({
    path: z.string().refine(normalizedRelativePosixPath, 'Expected a normalized relative POSIX path.'),
    mode: z.enum(['100644', '100755']),
    sha256: z.string().regex(SHA256_PATTERN, 'Expected a lowercase 64-hex SHA-256.'),
  })
  .strict();

const entrySchema = z
  .object({
    slug: z.string().regex(DAEMON_ID_PATTERN, 'Expected a stable kebab-case slug.'),
    displayName: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    sourceType: z.enum(['first-party', 'community']),
    repositoryUrl: z.string().refine(canonicalRepositoryUrl, 'Expected canonical https://github.com/owner/repo URL.'),
    canonicalSourceUrl: z.string().url(),
    daemonPath: z.string().refine(normalizedRelativePosixPath, 'Expected a normalized relative POSIX path.'),
    commit: z.string().regex(COMMIT_PATTERN, 'Expected a full lowercase 40-hex commit.'),
    integrations: z.array(z.enum(['github', 'linear', 'slack', 'sentry'])),
    approvalStatus: z.literal('approved'),
    reviewedFiles: z.array(reviewedFileSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (!sortedUnique(value.integrations)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['integrations'], message: 'integrations must be sorted and unique.' });
    }
    if (value.daemonPath !== 'DAEMON.md' && !value.daemonPath.endsWith('/DAEMON.md')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['daemonPath'], message: 'daemonPath must identify DAEMON.md.' });
    }
    const reviewedPaths = value.reviewedFiles.map((file) => file.path);
    if (!sortedUnique(reviewedPaths)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviewedFiles'], message: 'reviewedFiles must be sorted by unique path.' });
    }
    const daemonMatches = value.reviewedFiles.filter((file) => file.path === value.daemonPath);
    if (daemonMatches.length !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviewedFiles'], message: 'Exactly one reviewed file must equal daemonPath.' });
    }
    const daemonPaths = reviewedPaths.filter((filePath) => filePath === 'DAEMON.md' || filePath.endsWith('/DAEMON.md'));
    if (daemonPaths.length !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reviewedFiles'], message: 'reviewedFiles must contain exactly one DAEMON.md path.' });
    }
    const daemonDirectory = path.posix.dirname(value.daemonPath);
    for (const [index, file] of value.reviewedFiles.entries()) {
      const relative = path.posix.relative(daemonDirectory, file.path);
      const allowedSupport = relative.startsWith('scripts/') || relative.startsWith('references/');
      if (file.path !== value.daemonPath && !allowedSupport) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reviewedFiles', index, 'path'],
          message: 'Reviewed files may only include daemonPath and same-directory scripts/** or references/**.',
        });
      }
      if ((file.path === value.daemonPath || relative.startsWith('references/')) && file.mode !== '100644') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reviewedFiles', index, 'mode'],
          message: 'DAEMON.md and references must use mode 100644.',
        });
      }
    }
    const repository = value.repositoryUrl.match(REPOSITORY_PATTERN);
    if (repository) {
      const expected = `https://github.com/${repository[1]}/${repository[2]}/blob/${value.commit}/${value.daemonPath}`;
      if (value.canonicalSourceUrl !== expected) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['canonicalSourceUrl'],
          message: `canonicalSourceUrl must equal ${expected}.`,
        });
      }
    }
  });

const catalogSchema = z
  .object({ schemaVersion: z.literal(1), entries: z.array(entrySchema) })
  .strict()
  .superRefine((value, context) => {
    if (!sortedUnique(value.entries.map((entry) => entry.slug))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message: 'entries must be sorted by unique slug.' });
    }
  });

function formatFieldPath(pathValue: readonly PropertyKey[]): string | null {
  if (pathValue.length === 0) return null;
  return pathValue.map((part) => typeof part === 'number' ? `[${part.toString()}]` : String(part)).join('.').replace('.[', '[');
}

function validationError(issue: ZodIssue, sourcePath: string): CommunityRegistryValidationError {
  const fieldPath = issue.code === z.ZodIssueCode.unrecognized_keys
    ? formatFieldPath([...issue.path, issue.keys[0] ?? ''])
    : formatFieldPath(issue.path);
  return {
    code: issue.code === z.ZodIssueCode.unrecognized_keys ? 'unknown_field' : 'invalid_community_catalog',
    path: sourcePath,
    fieldPath,
    message: issue.message,
  };
}

export function parseCommunityRegistryValue(args: { value: unknown; path?: string }): CommunityRegistryValidationResult {
  const sourcePath = args.path ?? 'catalog.json';
  const parsed = catalogSchema.safeParse(args.value);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((item) => validationError(item, sourcePath)) };
  return { ok: true, value: parsed.data, errors: [] };
}

export function parseCommunityRegistryContent(args: { content: string; path?: string }): CommunityRegistryValidationResult {
  const sourcePath = args.path ?? 'catalog.json';
  let value: unknown;
  try {
    value = JSON.parse(args.content);
  } catch (error) {
    return {
      ok: false,
      errors: [{
        code: 'invalid_community_catalog_json',
        path: sourcePath,
        fieldPath: null,
        message: error instanceof Error ? error.message : 'Community catalog is not valid JSON.',
      }],
    };
  }
  return parseCommunityRegistryValue({ value, path: sourcePath });
}
