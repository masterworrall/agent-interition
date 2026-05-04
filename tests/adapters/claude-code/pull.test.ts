import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pull } from '../../../src/adapters/claude-code/pull.js';
import { BridgeStateStore } from '../../../src/adapters/claude-code/bridge-state.js';
import {
  Preference,
  Reference,
  Episode,
  Identity,
  Active,
  Private,
  STANDARD_VERSION,
} from '../../../src/memory/index.js';
import type { MemoryEntry, IndexManifest } from '../../../src/memory/index.js';
import { hashBody } from '../../../src/memory/index.js';

const POD = 'http://example.test/agent/';
const WEBID = 'http://example.test/agent/profile/card#me';

interface FakeStoreData {
  index: IndexManifest;
  entries: Record<string, MemoryEntry>;
  bodies: Record<string, string>;
}

class FakeStore {
  constructor(private data: FakeStoreData) {}
  async loadIndex(): Promise<IndexManifest> {
    return this.data.index;
  }
  async getEntry(metadataUrl: string): Promise<MemoryEntry> {
    const e = this.data.entries[metadataUrl];
    if (!e) throw new Error(`no entry at ${metadataUrl}`);
    return e;
  }
  async loadBody(entry: MemoryEntry): Promise<string> {
    if (!entry.bodyUri) throw new Error('no body');
    return this.data.bodies[entry.bodyUri];
  }
  async loadByTags(): Promise<MemoryEntry[]> {
    return Object.values(this.data.entries);
  }
  async loadIdentity(): Promise<MemoryEntry | null> {
    return Object.values(this.data.entries).find((e) => e.type === Identity) ?? null;
  }
}

function entry(opts: Partial<MemoryEntry> & Pick<MemoryEntry, 'uri' | 'type' | 'label'>): MemoryEntry {
  return {
    author: WEBID,
    created: '2026-05-01T10:00:00Z',
    status: Active,
    scope: Private,
    appliesTo: [],
    standardVersion: STANDARD_VERSION,
    ...opts,
  };
}

describe('pull', () => {
  let memoryDir: string;

  beforeEach(async () => {
    memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-bridge-test-'));
  });

  it('writes a Preference as feedback_<slug>.md and verifies the body hash', async () => {
    const body = 'Use printf, not heredoc.';
    const data: FakeStoreData = {
      index: {
        uri: `${POD}memory/index.ttl`,
        standardVersion: STANDARD_VERSION,
        modified: '2026-05-01T10:00:00Z',
        entries: [
          {
            uri: `${POD}memory/preferences/no-heredoc.ttl#entry`,
            type: Preference,
            label: 'No heredocs',
            scope: Private,
            appliesTo: ['shell'],
            status: Active,
            modified: '2026-05-01T10:00:00Z',
          },
        ],
      },
      entries: {
        [`${POD}memory/preferences/no-heredoc.ttl`]: entry({
          uri: `${POD}memory/preferences/no-heredoc.ttl#entry`,
          type: Preference,
          label: 'No heredocs',
          appliesTo: ['shell'],
          bodyUri: `${POD}memory/preferences/no-heredoc.md`,
          bodyHash: hashBody(body),
        }),
      },
      bodies: { [`${POD}memory/preferences/no-heredoc.md`]: body },
    };

    const result = await pull({
      store: new FakeStore(data) as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(result.loaded).toBe(1);
    expect(result.written).toContain('feedback_no-heredoc.md');
    expect(result.hashMismatches).toEqual([]);

    const written = await fs.readFile(path.join(memoryDir, 'feedback_no-heredoc.md'), 'utf8');
    expect(written).toContain('type: feedback');
    expect(written).toContain('No heredocs');
    expect(written).toContain(body);
  });

  it('renders a Reference into a synthetic body since the standard forbids stored bodies', async () => {
    const data: FakeStoreData = {
      index: {
        uri: `${POD}memory/index.ttl`,
        standardVersion: STANDARD_VERSION,
        modified: '2026-05-01T10:00:00Z',
        entries: [
          {
            uri: `${POD}memory/references/work-graph.ttl#entry`,
            type: Reference,
            label: 'Team work graph',
            scope: Private,
            appliesTo: ['planning'],
            status: Active,
            modified: '2026-05-01T10:00:00Z',
          },
        ],
      },
      entries: {
        [`${POD}memory/references/work-graph.ttl`]: entry({
          uri: `${POD}memory/references/work-graph.ttl#entry`,
          type: Reference,
          label: 'Team work graph',
          authoritativeSource: 'https://crawlout.io/team/work/',
          retrieve: 'GET /team/work/, parse Turtle, look for int:Task entries.',
        }),
      },
      bodies: {},
    };

    const result = await pull({
      store: new FakeStore(data) as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(result.written).toContain('reference_work-graph.md');
    const written = await fs.readFile(path.join(memoryDir, 'reference_work-graph.md'), 'utf8');
    expect(written).toContain('type: reference');
    expect(written).toContain('Authoritative source:** https://crawlout.io/team/work/');
    expect(written).toContain('GET /team/work/');
  });

  it('records bridge state for round-trip identity', async () => {
    const body = 'You are Two, Chief of R&D.';
    const data: FakeStoreData = {
      index: {
        uri: `${POD}memory/index.ttl`,
        standardVersion: STANDARD_VERSION,
        modified: '2026-05-01T10:00:00Z',
        entries: [
          {
            uri: `${POD}memory/identity/two.ttl#entry`,
            type: Identity,
            label: 'Identity — Two',
            scope: Private,
            appliesTo: [],
            status: Active,
            modified: '2026-05-01T10:00:00Z',
          },
        ],
      },
      entries: {
        [`${POD}memory/identity/two.ttl`]: entry({
          uri: `${POD}memory/identity/two.ttl#entry`,
          type: Identity,
          label: 'Identity — Two',
          bodyUri: `${POD}memory/identity/two.md`,
          bodyHash: hashBody(body),
        }),
      },
      bodies: { [`${POD}memory/identity/two.md`]: body },
    };

    await pull({
      store: new FakeStore(data) as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    const bridge = await new BridgeStateStore(memoryDir).load();
    expect(bridge?.entries['user_two.md']).toMatchObject({
      localFile: 'user_two.md',
      metadataUri: `${POD}memory/identity/two.ttl#entry`,
      standardType: Identity,
    });
  });

  it('regenerates MEMORY.md when requested, grouped by Claude Code type', async () => {
    const fb = 'feedback body';
    const data: FakeStoreData = {
      index: {
        uri: `${POD}memory/index.ttl`,
        standardVersion: STANDARD_VERSION,
        modified: '2026-05-01T10:00:00Z',
        entries: [
          {
            uri: `${POD}memory/preferences/foo.ttl#entry`,
            type: Preference,
            label: 'Foo',
            scope: Private,
            appliesTo: ['x'],
            status: Active,
            modified: '2026-05-01T10:00:00Z',
          },
          {
            uri: `${POD}memory/episodes/2026-05-01-bar.ttl#entry`,
            type: Episode,
            label: 'Bar event',
            scope: Private,
            appliesTo: ['x'],
            status: Active,
            modified: '2026-05-01T10:00:00Z',
          },
        ],
      },
      entries: {
        [`${POD}memory/preferences/foo.ttl`]: entry({
          uri: `${POD}memory/preferences/foo.ttl#entry`,
          type: Preference,
          label: 'Foo',
          appliesTo: ['x'],
          bodyUri: `${POD}memory/preferences/foo.md`,
          bodyHash: hashBody(fb),
        }),
        [`${POD}memory/episodes/2026-05-01-bar.ttl`]: entry({
          uri: `${POD}memory/episodes/2026-05-01-bar.ttl#entry`,
          type: Episode,
          label: 'Bar event',
          appliesTo: ['x'],
          occurred: '2026-05-01T10:00:00Z',
        }),
      },
      bodies: {
        [`${POD}memory/preferences/foo.md`]: fb,
      },
    };

    await pull({
      store: new FakeStore(data) as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
      regenerateIndex: true,
    });

    const indexMd = await fs.readFile(path.join(memoryDir, 'MEMORY.md'), 'utf8');
    expect(indexMd).toContain('## Preferences');
    expect(indexMd).toContain('## Projects');
    expect(indexMd).toContain('[Foo](feedback_foo.md)');
    expect(indexMd).toContain('[Bar event](project_2026-05-01-bar.md)');
  });
});
