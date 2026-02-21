import { describe, it, expect, vi } from 'vitest';
import { registerAgent, listAgents, findAgentByName, findAgentsByCapability } from '../../src/discovery/directory.js';

const VOCAB = 'https://vocab.interition.org/agents#';

describe('registerAgent', () => {
  it('creates directory resource and patches agent entry', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      calls.push({
        url: urlStr,
        method: init?.method ?? 'GET',
        body: init?.body as string | undefined,
      });

      // Container PUT → 409 (already exists)
      if (urlStr.endsWith('directory/') && init?.method === 'PUT') {
        return new Response(null, { status: 409 });
      }
      // agents.ttl PUT with If-None-Match → 412 (already exists)
      if (urlStr.endsWith('agents.ttl') && init?.method === 'PUT') {
        return new Response(null, { status: 412 });
      }
      // PATCH → 205 No Content
      if (init?.method === 'PATCH') {
        return new Response(null, { status: 205 });
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await registerAgent(
      'http://localhost:3000',
      {
        webId: 'http://localhost:3000/alpha/profile/card#me',
        name: 'Alpha',
        podUrl: 'http://localhost:3000/alpha/',
        capabilities: ['research', 'analysis'],
      },
      mockFetch,
    );

    // Should have made: container PUT, agents.ttl PUT, PATCH
    expect(calls).toHaveLength(3);

    const patchCall = calls.find((c) => c.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(patchCall!.body).toContain('INSERT DATA');
    expect(patchCall!.body).toContain('http://localhost:3000/alpha/profile/card#me');
    expect(patchCall!.body).toContain('"Alpha"');
    expect(patchCall!.body).toContain('"research"');
    expect(patchCall!.body).toContain('"analysis"');
  });

  it('creates directory on first use when resource does not exist', async () => {
    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      // Container → 201 (first time)
      if (urlStr.endsWith('directory/') && init?.method === 'PUT') {
        return new Response(null, { status: 201 });
      }
      // agents.ttl → 201 (first time)
      if (urlStr.endsWith('agents.ttl') && init?.method === 'PUT') {
        return new Response(null, { status: 201 });
      }
      // PATCH → 205
      if (init?.method === 'PATCH') {
        return new Response(null, { status: 205 });
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await expect(
      registerAgent(
        'http://localhost:3000',
        {
          webId: 'http://localhost:3000/alpha/profile/card#me',
          name: 'Alpha',
          podUrl: 'http://localhost:3000/alpha/',
          capabilities: [],
        },
        mockFetch,
      ),
    ).resolves.not.toThrow();
  });
});

describe('listAgents', () => {
  it('parses directory turtle into agent entries', async () => {
    const directoryTurtle = `
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix interition: <${VOCAB}>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.

<http://localhost:3000/alpha/profile/card#me>
    a interition:Agent, foaf:Agent ;
    foaf:name "Alpha" ;
    solid:account <http://localhost:3000/alpha/> ;
    interition:capability "research" ;
    interition:capability "analysis" .

<http://localhost:3000/beta/profile/card#me>
    a interition:Agent, foaf:Agent ;
    foaf:name "Beta" ;
    solid:account <http://localhost:3000/beta/> ;
    interition:capability "coding" .
`;

    const mockFetch = vi.fn(async () => {
      return new Response(directoryTurtle, { status: 200 });
    }) as unknown as typeof fetch;

    const agents = await listAgents('http://localhost:3000', mockFetch);

    expect(agents).toHaveLength(2);
    expect(agents[0].name).toBe('Alpha');
    expect(agents[0].webId).toBe('http://localhost:3000/alpha/profile/card#me');
    expect(agents[0].podUrl).toBe('http://localhost:3000/alpha/');
    expect(agents[0].capabilities).toContain('research');
    expect(agents[0].capabilities).toContain('analysis');
    expect(agents[1].name).toBe('Beta');
    expect(agents[1].capabilities).toContain('coding');
  });

  it('returns empty array when directory does not exist', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const agents = await listAgents('http://localhost:3000', mockFetch);
    expect(agents).toHaveLength(0);
  });
});

describe('findAgentByName', () => {
  it('finds an agent by name (case-insensitive)', async () => {
    const directoryTurtle = `
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix interition: <${VOCAB}>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.

<http://localhost:3000/alpha/profile/card#me>
    a interition:Agent ;
    foaf:name "Alpha" ;
    solid:account <http://localhost:3000/alpha/> .
`;

    const mockFetch = vi.fn(async () => {
      return new Response(directoryTurtle, { status: 200 });
    }) as unknown as typeof fetch;

    const agent = await findAgentByName('http://localhost:3000', 'alpha', mockFetch);
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('Alpha');
  });

  it('returns undefined for non-existent agent', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const agent = await findAgentByName('http://localhost:3000', 'nonexistent', mockFetch);
    expect(agent).toBeUndefined();
  });
});

describe('findAgentsByCapability', () => {
  it('finds agents by capability', async () => {
    const directoryTurtle = `
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix interition: <${VOCAB}>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.

<http://localhost:3000/alpha/profile/card#me>
    a interition:Agent ;
    foaf:name "Alpha" ;
    solid:account <http://localhost:3000/alpha/> ;
    interition:capability "research" .

<http://localhost:3000/beta/profile/card#me>
    a interition:Agent ;
    foaf:name "Beta" ;
    solid:account <http://localhost:3000/beta/> ;
    interition:capability "coding" .
`;

    const mockFetch = vi.fn(async () => {
      return new Response(directoryTurtle, { status: 200 });
    }) as unknown as typeof fetch;

    const agents = await findAgentsByCapability('http://localhost:3000', 'research', mockFetch);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Alpha');
  });
});
