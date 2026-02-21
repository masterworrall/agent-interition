import { describe, it, expect, vi } from 'vitest';
import { createPodContainers } from '../../src/bootstrap/pod-structure.js';

describe('createPodContainers', () => {
  it('creates memory, shared, conversations, and inbox containers', async () => {
    const calls: string[] = [];
    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(typeof url === 'string' ? url : url.toString());
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    await createPodContainers('http://localhost:3000/alpha/', mockFetch);

    expect(calls).toContain('http://localhost:3000/alpha/memory/');
    expect(calls).toContain('http://localhost:3000/alpha/shared/');
    expect(calls).toContain('http://localhost:3000/alpha/conversations/');
    expect(calls).toContain('http://localhost:3000/alpha/inbox/');
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('accepts 409 Conflict for existing containers', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(null, { status: 409 });
    }) as unknown as typeof fetch;

    await expect(
      createPodContainers('http://localhost:3000/alpha/', mockFetch),
    ).resolves.not.toThrow();
  });

  it('throws on unexpected errors', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response('Server Error', { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      createPodContainers('http://localhost:3000/alpha/', mockFetch),
    ).rejects.toThrow('Failed to create container');
  });

  it('sets inbox ACL when ownerWebId is provided', async () => {
    let aclBody = '';
    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.endsWith('.acl') && init?.method === 'PUT') {
        aclBody = init.body as string;
      }
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    await createPodContainers(
      'http://localhost:3000/alpha/',
      mockFetch,
      'http://localhost:3000/alpha/profile/card#me',
    );

    // 4 container PUTs + 1 ACL PUT
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(aclBody).toContain('acl:agent <http://localhost:3000/alpha/profile/card#me>');
    expect(aclBody).toContain('acl:mode acl:Read, acl:Write, acl:Control');
    expect(aclBody).toContain('acl:AuthenticatedAgent');
    expect(aclBody).toContain('acl:mode acl:Append');
    expect(aclBody).toContain('acl:default <http://localhost:3000/alpha/inbox/>');
  });

  it('skips inbox ACL when no ownerWebId provided', async () => {
    const calls: string[] = [];
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(typeof url === 'string' ? url : url.toString());
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    await createPodContainers('http://localhost:3000/alpha/', mockFetch);

    // Only 4 container PUTs, no ACL
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(calls.some((c) => c.endsWith('.acl'))).toBe(false);
  });
});
