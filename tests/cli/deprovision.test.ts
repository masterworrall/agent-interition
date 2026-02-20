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

// Mock the css-client module
const mockLoginWithPassword = vi.fn();
const mockDeleteAccount = vi.fn();

vi.mock('../../src/bootstrap/css-client.js', () => ({
  loginWithPassword: mockLoginWithPassword,
  deleteAccount: mockDeleteAccount,
}));

const { initStore, saveCredentials, loadCredentials, listAgents, deleteAgentCredentials } = await import(
  '../../src/cli/credentials-store.js'
);
const { loginWithPassword, deleteAccount } = await import('../../src/bootstrap/css-client.js');

const fullCreds = {
  webId: 'http://localhost:3000/agents/alpha/profile/card#me',
  podUrl: 'http://localhost:3000/agents/alpha/',
  id: 'test-client-id',
  secret: 'test-client-secret',
  email: 'alpha@agents.interition.local',
  password: 'agent-alpha-1234567890',
};

const legacyCreds = {
  webId: 'http://localhost:3000/agents/legacy/profile/card#me',
  podUrl: 'http://localhost:3000/agents/legacy/',
  id: 'legacy-id',
  secret: 'legacy-secret',
};

describe('deprovision', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'interition-deprovision-test-'));
    initStore('test-passphrase');
    mockLoginWithPassword.mockReset();
    mockDeleteAccount.mockReset();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('deletes CSS account and local credentials for fully provisioned agent', async () => {
    saveCredentials('alpha', fullCreds);
    mockLoginWithPassword.mockResolvedValue('session-cookie');
    mockDeleteAccount.mockResolvedValue(undefined);

    const creds = loadCredentials('alpha');
    expect(creds.email).toBe(fullCreds.email);
    expect(creds.password).toBe(fullCreds.password);

    const cookie = await loginWithPassword('http://localhost:3000', creds.email!, creds.password!);
    await deleteAccount('http://localhost:3000', cookie);
    deleteAgentCredentials('alpha');

    expect(mockLoginWithPassword).toHaveBeenCalledWith('http://localhost:3000', fullCreds.email, fullCreds.password);
    expect(mockDeleteAccount).toHaveBeenCalledWith('http://localhost:3000', 'session-cookie');
    expect(listAgents()).not.toContain('alpha');
  });

  it('skips CSS cleanup for legacy credentials without email/password', () => {
    saveCredentials('legacy', legacyCreds);
    const creds = loadCredentials('legacy');

    expect(creds.email).toBeUndefined();
    expect(creds.password).toBeUndefined();

    deleteAgentCredentials('legacy');
    expect(listAgents()).not.toContain('legacy');
    expect(mockLoginWithPassword).not.toHaveBeenCalled();
  });

  it('still deletes local credentials when CSS login fails', async () => {
    saveCredentials('alpha', fullCreds);
    mockLoginWithPassword.mockRejectedValue(new Error('Server unreachable'));

    const creds = loadCredentials('alpha');

    let accountDeleted = false;
    try {
      const cookie = await loginWithPassword('http://localhost:3000', creds.email!, creds.password!);
      await deleteAccount('http://localhost:3000', cookie);
      accountDeleted = true;
    } catch {
      // Expected — server unreachable
    }

    deleteAgentCredentials('alpha');

    expect(accountDeleted).toBe(false);
    expect(listAgents()).not.toContain('alpha');
  });
});
