import { describe, expect, test } from 'vitest';
import { parseCommunityRegistryValue } from '../schema';

const commit = 'a'.repeat(40);
const sha256 = 'b'.repeat(64);

function validEntry() {
  return {
    slug: 'community-daemon',
    displayName: 'Community daemon',
    summary: 'An approved community daemon.',
    sourceType: 'community' as const,
    repositoryUrl: 'https://github.com/acme/daemons',
    canonicalSourceUrl: `https://github.com/acme/daemons/blob/${commit}/packages/community-daemon/DAEMON.md`,
    daemonPath: 'packages/community-daemon/DAEMON.md',
    commit,
    integrations: ['github', 'linear'] as const,
    approvalStatus: 'approved' as const,
    reviewedFiles: [
      { path: 'packages/community-daemon/DAEMON.md', mode: '100644' as const, sha256 },
      { path: 'packages/community-daemon/references/guide.md', mode: '100644' as const, sha256 },
      { path: 'packages/community-daemon/scripts/run.sh', mode: '100755' as const, sha256 },
    ],
  };
}

describe('approved community registry schema v1', () => {
  test('accepts empty and valid catalogs', () => {
    expect(parseCommunityRegistryValue({ value: { schemaVersion: 1, entries: [] } }).ok).toBe(true);
    expect(parseCommunityRegistryValue({ value: { schemaVersion: 1, entries: [validEntry()] } }).ok).toBe(true);
  });

  test.each([
    ['unknown fields', () => ({ ...validEntry(), extra: true })],
    ['invalid repository URL', () => ({ ...validEntry(), repositoryUrl: 'http://github.com/acme/daemons' })],
    ['canonical mismatch', () => ({ ...validEntry(), canonicalSourceUrl: 'https://github.com/acme/daemons/blob/main/DAEMON.md' })],
    ['short commit', () => ({ ...validEntry(), commit: 'abc' })],
    ['unsafe daemon path', () => ({ ...validEntry(), daemonPath: '../DAEMON.md' })],
    ['bad hash', () => ({ ...validEntry(), reviewedFiles: [{ ...validEntry().reviewedFiles[0], sha256: 'ABC' }] })],
    ['executable daemon', () => ({ ...validEntry(), reviewedFiles: [{ ...validEntry().reviewedFiles[0], mode: '100755' }] })],
    ['extra package file', () => ({ ...validEntry(), reviewedFiles: [...validEntry().reviewedFiles, { path: 'packages/community-daemon/notes.md', mode: '100644', sha256 }] })],
    ['missing daemon', () => ({ ...validEntry(), reviewedFiles: validEntry().reviewedFiles.slice(1) })],
    ['duplicate daemon', () => ({ ...validEntry(), reviewedFiles: [validEntry().reviewedFiles[0], validEntry().reviewedFiles[0]] })],
    ['unsorted integrations', () => ({ ...validEntry(), integrations: ['linear', 'github'] })],
    ['duplicate integrations', () => ({ ...validEntry(), integrations: ['github', 'github'] })],
    ['unsorted files', () => ({ ...validEntry(), reviewedFiles: [...validEntry().reviewedFiles].reverse() })],
  ])('rejects %s', (_name, mutate) => {
    expect(parseCommunityRegistryValue({ value: { schemaVersion: 1, entries: [mutate()] } }).ok).toBe(false);
  });

  test('rejects duplicate or unsorted slugs', () => {
    const first = validEntry();
    const duplicate = { ...validEntry() };
    expect(parseCommunityRegistryValue({ value: { schemaVersion: 1, entries: [first, duplicate] } }).ok).toBe(false);
    expect(parseCommunityRegistryValue({ value: { schemaVersion: 1, entries: [{ ...first, slug: 'z-daemon' }, { ...duplicate, slug: 'a-daemon' }] } }).ok).toBe(false);
  });
});
