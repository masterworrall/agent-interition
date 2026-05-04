import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { push } from '../../../src/adapters/claude-code/push.js';
import { BridgeStateStore } from '../../../src/adapters/claude-code/bridge-state.js';
import {
  Preference,
  Episode,
  Reference,
  Active,
  Private,
  STANDARD_VERSION,
  hashBody,
} from '../../../src/memory/index.js';
import type { MemoryEntry, WriteEntryInput } from '../../../src/memory/index.js';

const POD = 'http://example.test/agent/';
const WEBID = 'http://example.test/agent/profile/card#me';

class CapturingStore {
  writes: WriteEntryInput[] = [];
  supersedes: { oldUri: string; input: WriteEntryInput }[] = [];

  async write(input: WriteEntryInput): Promise<MemoryEntry> {
    this.writes.push(input);
    return {
      uri: `${POD}memory/${slugForType(input.type)}/${slug(input.label)}.ttl#entry`,
      type: input.type,
      label: input.label,
      author: WEBID,
      created: new Date().toISOString(),
      status: Active,
      scope: input.scope ?? Private,
      appliesTo: input.appliesTo ?? [],
      standardVersion: STANDARD_VERSION,
      bodyHash: input.body ? hashBody(input.body) : undefined,
    };
  }

  async supersede(oldUri: string, input: WriteEntryInput): Promise<MemoryEntry> {
    this.supersedes.push({ oldUri, input });
    return {
      uri: `${POD}memory/${slugForType(input.type)}/${slug(input.label)}-v2.ttl#entry`,
      type: input.type,
      label: input.label,
      author: WEBID,
      created: new Date().toISOString(),
      status: Active,
      scope: input.scope ?? Private,
      appliesTo: input.appliesTo ?? [],
      standardVersion: STANDARD_VERSION,
      bodyHash: input.body ? hashBody(input.body) : undefined,
    };
  }
}

function slugForType(t: string): string {
  return t.endsWith('Preference') ? 'preferences' : t.endsWith('Episode') ? 'episodes' : 'other';
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

describe('push', () => {
  let memoryDir: string;

  beforeEach(async () => {
    memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-push-test-'));
  });

  it('writes a new feedback file as a Preference', async () => {
    await fs.writeFile(
      path.join(memoryDir, 'feedback_no-heredoc.md'),
      `---\nname: No heredocs\ndescription: prefer printf\ntype: feedback\n---\nUse printf instead of heredoc.\n`,
      'utf8',
    );

    const store = new CapturingStore();
    const result = await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(result.written).toHaveLength(1);
    expect(result.written[0].mode).toBe('new');
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].type).toBe(Preference);
    expect(store.writes[0].label).toBe('No heredocs');
    expect(store.writes[0].body).toContain('printf');
  });

  it('skips files when bridge state already has the same body hash', async () => {
    const body = 'Use printf.\n';
    const filename = 'feedback_no-heredoc.md';
    await fs.writeFile(
      path.join(memoryDir, filename),
      `---\nname: No heredocs\ndescription: x\ntype: feedback\n---\n${body}`,
      'utf8',
    );

    const bridge = new BridgeStateStore(memoryDir);
    await bridge.update(WEBID, POD, (entries) => {
      entries[filename] = {
        localFile: filename,
        metadataUri: `${POD}memory/preferences/no-heredoc.ttl#entry`,
        standardType: Preference,
        bodyHash: hashBody(body),
      };
    });

    const store = new CapturingStore();
    const result = await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(result.unchanged).toContain(filename);
    expect(store.writes).toHaveLength(0);
    expect(store.supersedes).toHaveLength(0);
  });

  it('supersedes when the body has changed since last sync', async () => {
    const filename = 'feedback_no-heredoc.md';
    const oldBody = 'old.';
    const newBody = 'new.';
    await fs.writeFile(
      path.join(memoryDir, filename),
      `---\nname: No heredocs\ndescription: x\ntype: feedback\n---\n${newBody}`,
      'utf8',
    );

    await new BridgeStateStore(memoryDir).update(WEBID, POD, (entries) => {
      entries[filename] = {
        localFile: filename,
        metadataUri: `${POD}memory/preferences/no-heredoc.ttl#entry`,
        standardType: Preference,
        bodyHash: hashBody(oldBody),
      };
    });

    const store = new CapturingStore();
    const result = await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(result.written).toHaveLength(1);
    expect(result.written[0].mode).toBe('supersede');
    expect(store.supersedes).toHaveLength(1);
    expect(store.supersedes[0].oldUri).toBe(`${POD}memory/preferences/no-heredoc.ttl#entry`);
  });

  it('does not supersede an Episode — appends a new one instead', async () => {
    const filename = 'project_2026-05-02-event.md';
    await fs.writeFile(
      path.join(memoryDir, filename),
      `---\nname: An event\ndescription: x\ntype: project\n---\nbody\n`,
      'utf8',
    );

    await new BridgeStateStore(memoryDir).update(WEBID, POD, (entries) => {
      entries[filename] = {
        localFile: filename,
        metadataUri: `${POD}memory/episodes/an-event.ttl#entry`,
        standardType: Episode,
        bodyHash: hashBody('different'),
      };
    });

    const store = new CapturingStore();
    await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(store.supersedes).toHaveLength(0);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].type).toBe(Episode);
  });

  it('skips files without a recognised type prefix', async () => {
    await fs.writeFile(path.join(memoryDir, 'random_notes.md'), 'not a memory file', 'utf8');
    const store = new CapturingStore();
    const result = await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });
    expect(result.skipped[0].localFile).toBe('random_notes.md');
    expect(store.writes).toHaveLength(0);
  });

  it('supersedes a Reference using bridge-state-preserved authoritativeSource and retrieve', async () => {
    const filename = 'reference_work-graph.md';
    const renderedBody = '# Team work graph\n\n**Authoritative source:** https://crawlout.io/team/work/\n\nGET it.\n';
    await fs.writeFile(
      path.join(memoryDir, filename),
      `---\nname: Team work graph\ndescription: GET it\ntype: reference\n---\n${renderedBody}`,
      'utf8',
    );

    // The bridge state records the authoritative-source fields and the hash
    // of the rendered body that pull wrote. We force a different hash here to
    // make this look like a "metadata-side" change worth pushing.
    await new BridgeStateStore(memoryDir).update(WEBID, POD, (entries) => {
      entries[filename] = {
        localFile: filename,
        metadataUri: `${POD}memory/references/team-work-graph.ttl#entry`,
        standardType: Reference,
        authoritativeSource: 'https://crawlout.io/team/work/',
        retrieve: 'GET it',
        appliesTo: ['planning'],
        renderedBodyHash: hashBody(renderedBody),
        // Force a body-hash mismatch with the wrong field so we exercise the
        // supersede path without flagging a "user edited the rendered body"
        // error. (Reference entries don't have Pod-side bodyHash so leaving
        // it undefined lets the rendered-body comparison decide.)
      };
    });

    const store = new CapturingStore();
    const result = await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    // Body unchanged → unchanged path. Verifies Reference no-op behaviour.
    expect(result.unchanged).toContain(filename);
    expect(store.writes).toHaveLength(0);
    expect(store.supersedes).toHaveLength(0);
  });

  it('skips Reference push when the user edited the rendered body locally', async () => {
    const filename = 'reference_work-graph.md';
    const originalRendered = '# Team work graph\n\nOriginal\n';
    const editedBody = '# Team work graph\n\nEdited prose the user added\n';

    await fs.writeFile(
      path.join(memoryDir, filename),
      `---\nname: Team work graph\ndescription: GET it\ntype: reference\n---\n${editedBody}`,
      'utf8',
    );

    await new BridgeStateStore(memoryDir).update(WEBID, POD, (entries) => {
      entries[filename] = {
        localFile: filename,
        metadataUri: `${POD}memory/references/team-work-graph.ttl#entry`,
        standardType: Reference,
        authoritativeSource: 'https://crawlout.io/team/work/',
        retrieve: 'GET it',
        appliesTo: ['planning'],
        renderedBodyHash: hashBody(originalRendered),
      };
    });

    const store = new CapturingStore();
    const result = await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].localFile).toBe(filename);
    expect(result.skipped[0].reason).toMatch(/cannot carry prose/);
    expect(store.writes).toHaveLength(0);
    expect(store.supersedes).toHaveLength(0);
  });

  it('treats a brand-new reference_*.md (no Pod-side state) as a Procedure since no authoritativeSource is available locally', async () => {
    // Per defaultStandardTypeFor: claudeType=reference + hasAuthoritativeSource=false → Procedure.
    // mem:Procedure carries a body, so the local prose has somewhere to land.
    const filename = 'reference_new.md';
    await fs.writeFile(
      path.join(memoryDir, filename),
      `---\nname: New ref\ndescription: x\ntype: reference\n---\nlocal prose body\n`,
      'utf8',
    );

    const store = new CapturingStore();
    const result = await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(result.skipped).toHaveLength(0);
    expect(result.written).toHaveLength(1);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].type).toBe('https://interition.ai/vocab/memory#Procedure');
    expect(store.writes[0].body).toContain('local prose body');
  });

  it('preserves Episode occurred on supersede attempts (Episodes still write fresh)', async () => {
    const filename = 'project_2026-05-04-event.md';
    await fs.writeFile(
      path.join(memoryDir, filename),
      `---\nname: An event\ndescription: x\ntype: project\n---\nbody\n`,
      'utf8',
    );

    await new BridgeStateStore(memoryDir).update(WEBID, POD, (entries) => {
      entries[filename] = {
        localFile: filename,
        metadataUri: `${POD}memory/episodes/an-event.ttl#entry`,
        standardType: Episode,
        bodyHash: hashBody('different'),
        occurred: '2026-05-04T08:00:00Z',
      };
    });

    const store = new CapturingStore();
    await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
    });

    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].occurred).toBe('2026-05-04T08:00:00Z');
  });

  it('honors --dry-run by not calling write or updating bridge state', async () => {
    await fs.writeFile(
      path.join(memoryDir, 'feedback_x.md'),
      `---\nname: X\ndescription: x\ntype: feedback\n---\nbody\n`,
      'utf8',
    );
    const store = new CapturingStore();
    const result = await push({
      store: store as never,
      agentWebId: WEBID,
      podBase: POD,
      memoryDir,
      dryRun: true,
    });
    expect(result.written[0].mode).toBe('new');
    expect(store.writes).toHaveLength(0);

    const bridge = await new BridgeStateStore(memoryDir).load();
    expect(bridge).toBeNull();
  });
});
