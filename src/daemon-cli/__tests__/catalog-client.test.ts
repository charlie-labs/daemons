import { afterEach, describe, expect, test, vi } from 'vitest';
import { createGitHubCatalogClient } from '../catalog-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('production community registry client', () => {
  test('treats only an absent catalog.json 404 as an empty rollout catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404, statusText: 'Not Found' })));

    await expect(createGitHubCatalogClient().loadCommunityCatalog!()).resolves.toEqual({ schemaVersion: 1, entries: [] });
  });

  test('fails closed for a malformed catalog response', async () => {
    const content = Buffer.from(JSON.stringify({ schemaVersion: 1, entries: 'invalid' })).toString('base64');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'file', encoding: 'base64', content }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(createGitHubCatalogClient().loadCommunityCatalog!()).rejects.toMatchObject({
      code: 'invalid_community_catalog',
    });
  });

  test.each([
    ['non-404 response', async () => new Response('', { status: 503, statusText: 'Unavailable' })],
    ['transport failure', async () => { throw new Error('network down'); }],
  ])('fails closed for %s', async (_name, fetchImpl) => {
    vi.stubGlobal('fetch', vi.fn(fetchImpl));

    await expect(createGitHubCatalogClient().loadCommunityCatalog!()).rejects.toThrow();
  });
});
