import { describe, it, expect, vi } from 'vitest';
import { createPodContainers } from '../../src/bootstrap/pod-structure.js';

describe('createPodContainers', () => {
  it('creates memory, shared, and conversations containers', async () => {
    const calls: string[] = [];
    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(typeof url === 'string' ? url : url.toString());
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    await createPodContainers('http://localhost:3000/agents/alpha/', mockFetch);

    expect(calls).toContain('http://localhost:3000/agents/alpha/memory/');
    expect(calls).toContain('http://localhost:3000/agents/alpha/shared/');
    expect(calls).toContain('http://localhost:3000/agents/alpha/conversations/');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('accepts 409 Conflict for existing containers', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(null, { status: 409 });
    }) as unknown as typeof fetch;

    await expect(
      createPodContainers('http://localhost:3000/agents/alpha/', mockFetch),
    ).resolves.not.toThrow();
  });

  it('throws on unexpected errors', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response('Server Error', { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      createPodContainers('http://localhost:3000/agents/alpha/', mockFetch),
    ).rejects.toThrow('Failed to create container');
  });
});
