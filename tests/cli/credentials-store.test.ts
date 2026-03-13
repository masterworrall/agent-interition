import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const {
  initStore, saveCredentials, loadCredentials, listAgents,
  deleteAgentCredentials, listCredentials, serverKey,
} = await import(
  '../../src/cli/credentials-store.js'
);

const SERVER_A = 'http://localhost:3000';
const SERVER_B = 'https://crawlout.io';

const testCreds = {
  webId: 'http://localhost:3000/agents/alpha/profile/card#me',
  podUrl: 'http://localhost:3000/agents/alpha/',
  id: 'test-client-id',
  secret: 'test-client-secret',
  email: 'alpha@agents.interition.local',
  password: 'agent-alpha-1234567890',
};

const testCredsCrawlout = {
  webId: 'https://crawlout.io/alpha/profile/card#me',
  podUrl: 'https://crawlout.io/alpha/',
  id: 'crawlout-client-id',
  secret: 'crawlout-client-secret',
  email: 'alpha@crawlout.io',
  password: 'alpha-crawlout-pass',
};

describe('serverKey', () => {
  it('uses hostname only for default HTTPS port', () => {
    expect(serverKey('https://crawlout.io')).toBe('crawlout.io');
    expect(serverKey('https://crawlout.io/')).toBe('crawlout.io');
    expect(serverKey('https://crawlout.io:443')).toBe('crawlout.io');
  });

  it('uses hostname only for default HTTP port', () => {
    expect(serverKey('http://example.com')).toBe('example.com');
    expect(serverKey('http://example.com:80')).toBe('example.com');
  });

  it('includes non-default port with underscore separator', () => {
    expect(serverKey('http://localhost:3000')).toBe('localhost_3000');
    expect(serverKey('https://example.com:8443')).toBe('example.com_8443');
  });
});

describe('credentials-store', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'interition-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('round-trips credentials through encrypt/decrypt', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', SERVER_A, testCreds);

    const loaded = loadCredentials('alpha', SERVER_A);
    expect(loaded).toEqual(testCreds);
  });

  it('rejects wrong passphrase', () => {
    initStore('correct-passphrase');
    saveCredentials('alpha', SERVER_A, testCreds);

    // Re-init with wrong passphrase
    initStore('wrong-passphrase');
    expect(() => loadCredentials('alpha', SERVER_A)).toThrow('Invalid passphrase');
  });

  it('sets file permissions to 0600', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', SERVER_A, testCreds);

    const filePath = join(tempDir, '.interition', 'agents', 'alpha', 'localhost_3000', 'credentials.enc');
    const stats = statSync(filePath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('lists agents with provisioned WebIDs and Pods', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', SERVER_A, testCreds);
    saveCredentials('beta', SERVER_A, { ...testCreds, webId: testCreds.webId.replace('alpha', 'beta') });

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
    expect(() => loadCredentials('nonexistent', SERVER_A)).toThrow('No credentials found');
  });

  it('loads legacy credentials without email/password as undefined', () => {
    initStore('my-secret-passphrase');
    const legacyCreds = {
      webId: 'http://localhost:3000/agents/legacy/profile/card#me',
      podUrl: 'http://localhost:3000/agents/legacy/',
      id: 'legacy-id',
      secret: 'legacy-secret',
    };
    saveCredentials('legacy', SERVER_A, legacyCreds);

    const loaded = loadCredentials('legacy', SERVER_A);
    expect(loaded.webId).toBe(legacyCreds.webId);
    expect(loaded.id).toBe(legacyCreds.id);
    expect(loaded.email).toBeUndefined();
    expect(loaded.password).toBeUndefined();
  });

  it('deletes agent credentials for a specific server', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', SERVER_A, testCreds);
    saveCredentials('alpha', SERVER_B, testCredsCrawlout);

    deleteAgentCredentials('alpha', SERVER_A);

    // Server A credentials gone
    expect(() => loadCredentials('alpha', SERVER_A)).toThrow('No credentials found');
    // Server B credentials still there
    const loaded = loadCredentials('alpha', SERVER_B);
    expect(loaded).toEqual(testCredsCrawlout);
    // Agent directory still exists (has server B)
    expect(listAgents()).toContain('alpha');
  });

  it('removes agent directory when last server credentials deleted', () => {
    initStore('my-secret-passphrase');
    saveCredentials('alpha', SERVER_A, testCreds);

    deleteAgentCredentials('alpha', SERVER_A);
    expect(listAgents()).not.toContain('alpha');
  });

  it('does not throw when deleting non-existent agent', () => {
    initStore('my-secret-passphrase');
    expect(() => deleteAgentCredentials('nonexistent', SERVER_A)).not.toThrow();
  });

  describe('multi-server support', () => {
    it('stores credentials independently per server', () => {
      initStore('my-secret-passphrase');
      saveCredentials('alpha', SERVER_A, testCreds);
      saveCredentials('alpha', SERVER_B, testCredsCrawlout);

      const loadedA = loadCredentials('alpha', SERVER_A);
      const loadedB = loadCredentials('alpha', SERVER_B);

      expect(loadedA).toEqual(testCreds);
      expect(loadedB).toEqual(testCredsCrawlout);
    });

    it('provisioning on second server does not overwrite first', () => {
      initStore('my-secret-passphrase');
      saveCredentials('alpha', SERVER_A, testCreds);
      saveCredentials('alpha', SERVER_B, testCredsCrawlout);

      // Verify first server credentials are untouched
      const loaded = loadCredentials('alpha', SERVER_A);
      expect(loaded.id).toBe('test-client-id');
      expect(loaded.webId).toBe('http://localhost:3000/agents/alpha/profile/card#me');
    });

    it('listCredentials returns all server entries', () => {
      initStore('my-secret-passphrase');
      saveCredentials('alpha', SERVER_A, testCreds);
      saveCredentials('alpha', SERVER_B, testCredsCrawlout);
      saveCredentials('beta', SERVER_B, { ...testCredsCrawlout, webId: 'https://crawlout.io/beta/profile/card#me' });

      const creds = listCredentials();
      expect(creds).toHaveLength(3);
      expect(creds).toContainEqual({ name: 'alpha', server: 'localhost_3000' });
      expect(creds).toContainEqual({ name: 'alpha', server: 'crawlout.io' });
      expect(creds).toContainEqual({ name: 'beta', server: 'crawlout.io' });
    });

    it('listAgents deduplicates across servers', () => {
      initStore('my-secret-passphrase');
      saveCredentials('alpha', SERVER_A, testCreds);
      saveCredentials('alpha', SERVER_B, testCredsCrawlout);

      const agents = listAgents();
      expect(agents.filter((a: string) => a === 'alpha')).toHaveLength(1);
    });
  });

  describe('legacy fallback', () => {
    it('loads credentials from legacy flat path', () => {
      initStore('my-secret-passphrase');

      const agentDir = join(tempDir, '.interition', 'agents', 'oldagent');

      // Save via new API then move to legacy path
      saveCredentials('oldagent', SERVER_A, testCreds);

      const newFile = join(agentDir, 'localhost_3000', 'credentials.enc');
      const legacyFile = join(agentDir, 'credentials.enc');
      const content = readFileSync(newFile, 'utf-8');
      writeFileSync(legacyFile, content);
      rmSync(join(agentDir, 'localhost_3000'), { recursive: true, force: true });

      // Now load — should fall back to legacy path
      const loaded = loadCredentials('oldagent', SERVER_A);
      expect(loaded).toEqual(testCreds);
    });

    it('prefers new server-keyed path over legacy', () => {
      initStore('my-secret-passphrase');

      // Save via new path
      saveCredentials('alpha', SERVER_A, testCreds);

      const agentDir = join(tempDir, '.interition', 'agents', 'alpha');
      // Save different creds to a temp agent, read the encrypted file, write to legacy location
      saveCredentials('_temp_', SERVER_A, testCredsCrawlout);
      const tempFile = join(tempDir, '.interition', 'agents', '_temp_', 'localhost_3000', 'credentials.enc');
      const content = readFileSync(tempFile, 'utf-8');
      writeFileSync(join(agentDir, 'credentials.enc'), content);

      // Should load from the new path, not legacy
      const loaded = loadCredentials('alpha', SERVER_A);
      expect(loaded).toEqual(testCreds);
    });
  });
});
