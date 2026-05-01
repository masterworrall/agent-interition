import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryStore,
  Preference,
  Reference,
  Episode,
  Identity,
  Active,
  Private,
  TeamShared,
  STANDARD_VERSION,
  validateWrite,
  hashBody,
} from '../../src/memory/index.js';
import type { WriteEntryInput } from '../../src/memory/index.js';
import { serializeEntry, buildEntry } from '../../src/memory/serialize.js';
import { parseEntry } from '../../src/memory/parse.js';

const POD = 'http://localhost:3000/orion/';
const WEBID = 'http://localhost:3000/orion/profile/card#me';

// ── Pure logic ──

describe('hashBody', () => {
  it('is deterministic and prefixed with sha256:', () => {
    const h = hashBody('hello world');
    expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashBody('hello world')).toBe(h);
    expect(hashBody('different')).not.toBe(h);
  });
});

describe('validateWrite', () => {
  it('accepts a valid Preference', () => {
    const result = validateWrite({
      type: Preference,
      label: 'No heredocs',
      body: 'Use printf instead.',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a Preference without a body', () => {
    const result = validateWrite({ type: Preference, label: 'No heredocs' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'missing_required' && e.field === 'body')).toBe(
      true,
    );
  });

  it('rejects a Reference with a body', () => {
    const result = validateWrite({
      type: Reference,
      label: 'Work records',
      authoritativeSource: 'https://crawlout.io/team/work/',
      body: 'should not be allowed',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'forbidden_field' && e.field === 'body')).toBe(true);
  });

  it('rejects a Reference without authoritativeSource', () => {
    const result = validateWrite({ type: Reference, label: 'Work records' });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.code === 'missing_required' && e.field === 'authoritativeSource',
      ),
    ).toBe(true);
  });

  it('rejects an Episode without occurred', () => {
    const result = validateWrite({
      type: Episode,
      label: 'Bypass incident',
      body: 'happened',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'missing_required' && e.field === 'occurred')).toBe(
      true,
    );
  });

  it('rejects a label that contains a reserved authoritative namespace', () => {
    const result = validateWrite({
      type: Preference,
      label: 'See https://interition.ai/vocab/work#status',
      body: 'noop',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'authoritative_source_duplication')).toBe(true);
  });

  it('allows reserved namespace in authoritativeSource for References', () => {
    const result = validateWrite({
      type: Reference,
      label: 'Team work records',
      authoritativeSource: 'https://crawlout.io/team/work/',
      retrieve: 'GET the container',
    });
    expect(result.valid).toBe(true);
  });
});

describe('serialize/parse roundtrip', () => {
  it('preserves a Preference entry through Turtle', () => {
    const original = buildEntry(
      {
        type: Preference,
        label: 'No heredocs',
        appliesTo: ['shell', 'docker'],
        scope: Private,
        body: 'Use printf.',
      },
      {
        uri: 'http://localhost:3000/orion/memory/preferences/x.ttl#entry',
        authorWebId: WEBID,
        bodyUri: 'http://localhost:3000/orion/memory/preferences/x.md',
        bodyHash: hashBody('Use printf.'),
        nowIso: '2026-05-01T10:00:00.000Z',
      },
    );

    const turtle = serializeEntry(original);
    const parsed = parseEntry(turtle, 'http://localhost:3000/orion/memory/preferences/x.ttl');

    expect(parsed.type).toBe(Preference);
    expect(parsed.label).toBe('No heredocs');
    expect(parsed.author).toBe(WEBID);
    expect(parsed.created).toBe('2026-05-01T10:00:00.000Z');
    expect(parsed.scope).toBe(Private);
    expect(parsed.appliesTo.sort()).toEqual(['docker', 'shell']);
    expect(parsed.bodyUri).toBe('http://localhost:3000/orion/memory/preferences/x.md');
    expect(parsed.bodyHash).toBe(hashBody('Use printf.'));
    expect(parsed.standardVersion).toBe(STANDARD_VERSION);
  });

  it('preserves a Reference entry (no body)', () => {
    const original = buildEntry(
      {
        type: Reference,
        label: 'Work records',
        appliesTo: ['planning'],
        scope: TeamShared,
        authoritativeSource: 'https://crawlout.io/team/work/',
        retrieve: 'list-container then read each task',
      },
      {
        uri: 'http://localhost:3000/orion/memory/references/work.ttl#entry',
        authorWebId: WEBID,
        nowIso: '2026-05-01T10:00:00.000Z',
      },
    );

    const turtle = serializeEntry(original);
    const parsed = parseEntry(turtle, 'http://localhost:3000/orion/memory/references/work.ttl');

    expect(parsed.type).toBe(Reference);
    expect(parsed.bodyUri).toBeUndefined();
    expect(parsed.authoritativeSource).toBe('https://crawlout.io/team/work/');
    expect(parsed.retrieve).toBe('list-container then read each task');
    expect(parsed.scope).toBe(TeamShared);
  });
});

// ── MemoryStore against a mocked Pod ──

interface MockPod {
  resources: Map<string, { contentType: string; body: string }>;
  fetch: typeof fetch;
}

function createMockPod(): MockPod {
  const resources = new Map<string, { contentType: string; body: string }>();
  // Pretend the memory containers and the empty index already exist
  for (const c of [
    'memory/',
    'memory/identity/',
    'memory/preferences/',
    'memory/procedures/',
    'memory/references/',
    'memory/episodes/',
    'memory/superseded/',
  ]) {
    resources.set(`${POD}${c}`, { contentType: 'text/turtle', body: '' });
  }

  const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'HEAD') {
      return resources.has(url)
        ? new Response(null, { status: 200 })
        : new Response(null, { status: 404 });
    }
    if (method === 'GET') {
      const r = resources.get(url);
      if (!r) return new Response(null, { status: 404 });
      return new Response(r.body, {
        status: 200,
        headers: { 'content-type': r.contentType },
      });
    }
    if (method === 'PUT') {
      const contentType = (init?.headers as Record<string, string>)?.['content-type'] ?? 'text/plain';
      resources.set(url, { contentType, body: (init?.body as string) ?? '' });
      return new Response(null, { status: 201 });
    }
    if (method === 'DELETE') {
      resources.delete(url);
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 405 });
  }) as unknown as typeof fetch;

  return { resources, fetch: mockFetch };
}

describe('MemoryStore.write', () => {
  let pod: MockPod;
  let store: MemoryStore;

  beforeEach(() => {
    pod = createMockPod();
    store = new MemoryStore({ podBase: POD, agentWebId: WEBID, authFetch: pod.fetch });
  });

  it('writes a Preference: body, metadata, and index all populated', async () => {
    await store.ensureContainers();

    const entry = await store.write({
      type: Preference,
      label: 'No heredocs in shell',
      appliesTo: ['shell', 'docker'],
      body: 'Use printf instead.',
    });

    expect(entry.type).toBe(Preference);
    expect(entry.label).toBe('No heredocs in shell');
    expect(entry.author).toBe(WEBID);
    expect(entry.bodyHash).toBe(hashBody('Use printf instead.'));

    // Body resource exists
    const bodyResource = pod.resources.get(entry.bodyUri!);
    expect(bodyResource).toBeDefined();
    expect(bodyResource!.body).toBe('Use printf instead.');
    expect(bodyResource!.contentType).toBe('text/markdown');

    // Metadata resource exists with correct prefixes
    const metadataUrl = entry.uri.replace(/#entry$/, '');
    const metadataResource = pod.resources.get(metadataUrl);
    expect(metadataResource).toBeDefined();
    expect(metadataResource!.body).toContain('mem:Preference');
    expect(metadataResource!.body).toContain('mem:author');
    expect(metadataResource!.body).toContain(WEBID);

    // Index has the new entry
    const indexResource = pod.resources.get(`${POD}memory/index.ttl`);
    expect(indexResource).toBeDefined();
    expect(indexResource!.body).toContain('"No heredocs in shell"');
  });

  it('writes a Reference with no body resource', async () => {
    await store.ensureContainers();

    const entry = await store.write({
      type: Reference,
      label: 'Team work records',
      appliesTo: ['planning'],
      scope: TeamShared,
      authoritativeSource: 'https://crawlout.io/team/work/',
      retrieve: 'list-container, read each task',
    });

    expect(entry.bodyUri).toBeUndefined();
    expect(entry.bodyHash).toBeUndefined();

    // No body file should have been created
    const mdFiles = Array.from(pod.resources.keys()).filter((k) =>
      k.includes('/references/') && k.endsWith('.md'),
    );
    expect(mdFiles).toHaveLength(0);

    // Metadata exists with authoritativeSource
    const metadataUrl = entry.uri.replace(/#entry$/, '');
    expect(pod.resources.get(metadataUrl)!.body).toContain('mem:authoritativeSource');
  });

  it('rejects an invalid write (Reference with body)', async () => {
    await store.ensureContainers();

    await expect(
      store.write({
        type: Reference,
        label: 'Work records',
        authoritativeSource: 'https://crawlout.io/team/work/',
        body: 'oops',
      }),
    ).rejects.toThrow(/must not have a body/);
  });
});

describe('MemoryStore.getEntry roundtrip', () => {
  it('reads back exactly what was written', async () => {
    const pod = createMockPod();
    const store = new MemoryStore({ podBase: POD, agentWebId: WEBID, authFetch: pod.fetch });
    await store.ensureContainers();

    const written = await store.write({
      type: Preference,
      label: 'No heredocs',
      appliesTo: ['shell'],
      body: 'Use printf.',
    });

    const metadataUrl = written.uri.replace(/#entry$/, '');
    const read = await store.getEntry(metadataUrl);

    expect(read.label).toBe(written.label);
    expect(read.type).toBe(written.type);
    expect(read.author).toBe(written.author);
    expect(read.bodyUri).toBe(written.bodyUri);
    expect(read.bodyHash).toBe(written.bodyHash);

    const body = await store.loadBody(read);
    expect(body).toBe('Use printf.');
  });
});

describe('MemoryStore.supersede', () => {
  it('moves the old pair to superseded/ and writes the new pair with a supersedes link', async () => {
    const pod = createMockPod();
    const store = new MemoryStore({ podBase: POD, agentWebId: WEBID, authFetch: pod.fetch });
    await store.ensureContainers();

    const v1 = await store.write({
      type: Preference,
      label: 'No heredocs',
      appliesTo: ['shell'],
      body: 'Use printf.',
    });

    const v2 = await store.supersede(v1.uri, {
      type: Preference,
      label: 'No heredocs (refined)',
      appliesTo: ['shell', 'docker'],
      body: 'Use printf or echo. Never heredocs.',
    });

    expect(v2.supersedes).toBeDefined();
    expect(v2.supersedes).toContain('superseded/preferences/');

    const oldMetadataUrl = v1.uri.replace(/#entry$/, '');
    const oldBodyUrl = v1.bodyUri!;
    expect(pod.resources.has(oldMetadataUrl)).toBe(false);
    expect(pod.resources.has(oldBodyUrl)).toBe(false);

    const movedTtl = v2.supersedes!.replace(/#entry$/, '');
    expect(pod.resources.get(movedTtl)!.body).toContain('mem:Superseded');
    expect(pod.resources.get(movedTtl)!.body).toContain('mem:supersededBy');

    const indexBody = pod.resources.get(`${POD}memory/index.ttl`)!.body;
    expect(indexBody).toContain('"No heredocs (refined)"');
    expect(indexBody).not.toContain('"No heredocs"\n'); // old label gone
  });
});
