import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to mock homedir so the store writes to a temp directory
import { vi } from 'vitest';

let tempDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

// Import after mock setup
const { initStore, saveCredentials, loadCredentials, listAgents, deleteAgentCredentials } = await import(
  '../../src/cli/credentials-store.js'
);

const testCreds = {
  webId: 'http://localhost:3000/agents/alpha/profile/card#me',
  podUrl: 'http://localhost:3000/agents/alpha/',
  id: 'test-client-id',
  secret: 'test-client-secret',
  email: 'alpha@agents.interition.local',
  password: 'agent-alpha-1234567890',
};

describe('credentials-store', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'interition-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('round-trips credentials through encrypt/decrypt', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', testCreds);

    const loaded = loadCredentials('alpha');
    expect(loaded).toEqual(testCreds);
  });

  it('rejects wrong passphrase', () => {
    initStore('correct-passphrase');
    saveCredentials('alpha', testCreds);

    // Re-init with wrong passphrase
    initStore('wrong-passphrase');
    expect(() => loadCredentials('alpha')).toThrow('Invalid passphrase');
  });

  it('sets file permissions to 0600', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', testCreds);

    const filePath = join(tempDir, '.interition', 'agents', 'alpha', 'credentials.enc');
    const stats = statSync(filePath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('lists agents with provisioned WebIDs and Pods', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', testCreds);
    saveCredentials('beta', { ...testCreds, webId: testCreds.webId.replace('alpha', 'beta') });

    const agents = listAgents();
    expect(agents).toContain('alpha');
    expect(agents).toContain('beta');
  });

  it('returns empty list when no agents exist', () => {
    initStore('my-secret-passphrase');
    const agents = listAgents();
    expect(agents).toEqual([]);
  });

  it('throws when loading non-existent agent', () => {
    initStore('my-secret-passphrase');
    expect(() => loadCredentials('nonexistent')).toThrow('No credentials found');
  });

  it('loads legacy credentials without email/password as undefined', () => {
    initStore('my-secret-passphrase');
    const legacyCreds = {
      webId: 'http://localhost:3000/agents/legacy/profile/card#me',
      podUrl: 'http://localhost:3000/agents/legacy/',
      id: 'legacy-id',
      secret: 'legacy-secret',
    };
    saveCredentials('legacy', legacyCreds);

    const loaded = loadCredentials('legacy');
    expect(loaded.webId).toBe(legacyCreds.webId);
    expect(loaded.id).toBe(legacyCreds.id);
    expect(loaded.email).toBeUndefined();
    expect(loaded.password).toBeUndefined();
  });

  it('deletes agent credentials directory', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', testCreds);

    expect(listAgents()).toContain('alpha');
    deleteAgentCredentials('alpha');
    expect(listAgents()).not.toContain('alpha');
  });

  it('does not throw when deleting non-existent agent', () => {
    initStore('my-secret-passphrase');
    expect(() => deleteAgentCredentials('nonexistent')).not.toThrow();
  });
});
