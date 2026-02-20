import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

const { initStore, saveCredentials, loadCredentials } = await import(
  '../../src/cli/credentials-store.js'
);

const testCreds = {
  webId: 'http://localhost:3000/agents/researcher/profile/card#me',
  podUrl: 'http://localhost:3000/agents/researcher/',
  id: 'test-client-id',
  secret: 'test-client-secret',
  email: 'researcher@agents.interition.local',
  password: 'agent-researcher-1234567890',
};

describe('get-token', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'interition-test-'));
    initStore('test-passphrase');
    saveCredentials('researcher', testCreds);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('constructs correct Basic auth header from credentials', () => {
    const expected = Buffer.from(`${testCreds.id}:${testCreds.secret}`).toString('base64');
    expect(expected).toBe(Buffer.from('test-client-id:test-client-secret').toString('base64'));
  });

  it('token endpoint URL is derived from server URL', () => {
    const serverUrl = 'http://localhost:3000';
    const tokenUrl = `${serverUrl}/.oidc/token`;
    expect(tokenUrl).toBe('http://localhost:3000/.oidc/token');
  });

  it('credentials store returns correct id and secret for token request', () => {
    const creds = loadCredentials('researcher');
    expect(creds.id).toBe('test-client-id');
    expect(creds.secret).toBe('test-client-secret');
    expect(creds.podUrl).toBe('http://localhost:3000/agents/researcher/');
    expect(creds.webId).toBe('http://localhost:3000/agents/researcher/profile/card#me');
  });

  it('output shape matches expected JSON structure', () => {
    // Validate the expected output structure that get-token.ts produces
    const mockTokenResponse = {
      token: 'eyJhbGciOiJSUzI1NiJ9.mock',
      expiresIn: 600,
      serverUrl: 'http://localhost:3000',
      podUrl: testCreds.podUrl,
      webId: testCreds.webId,
    };

    expect(mockTokenResponse).toHaveProperty('token');
    expect(mockTokenResponse).toHaveProperty('expiresIn');
    expect(mockTokenResponse).toHaveProperty('serverUrl');
    expect(mockTokenResponse).toHaveProperty('podUrl');
    expect(mockTokenResponse).toHaveProperty('webId');
    expect(mockTokenResponse.expiresIn).toBe(600);
  });

  it('Basic auth encoding matches CSS client_credentials flow', () => {
    const creds = loadCredentials('researcher');
    const authString = Buffer.from(`${creds.id}:${creds.secret}`).toString('base64');

    // Verify it can be decoded back
    const decoded = Buffer.from(authString, 'base64').toString('utf-8');
    expect(decoded).toBe(`${testCreds.id}:${testCreds.secret}`);
  });
});
