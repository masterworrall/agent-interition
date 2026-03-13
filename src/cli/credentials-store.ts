import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface StoredCredentials {
  webId: string;
  podUrl: string;
  id: string;
  secret: string;
  email?: string;
  password?: string;
}

interface EncryptedPayload {
  salt: string;   // base64
  iv: string;     // base64
  tag: string;    // base64
  data: string;   // base64
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;

let encryptionKey: Buffer | null = null;

function getStoreDir(): string {
  return join(homedir(), '.interition', 'agents');
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

export function initStore(passphrase: string): void {
  // Derive a key from passphrase with a fixed salt for session use.
  // Each file has its own random salt for actual encryption.
  // We store the passphrase-derived material to re-derive per-file keys.
  // Actually, we just hold the passphrase and derive per-file.
  // Simpler: hold passphrase in closure. But we need it in module scope.
  // Store passphrase hash as the "session key" indicator.
  encryptionKey = Buffer.from(passphrase, 'utf-8');
}

export function isStoreInitialised(): boolean {
  return encryptionKey !== null;
}

function getPassphrase(): Buffer {
  if (!encryptionKey) {
    throw new Error('Credentials store not initialised. Call initStore(passphrase) first.');
  }
  return encryptionKey;
}

function encrypt(data: string, passphrase: Buffer): EncryptedPayload {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase.toString('utf-8'), salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

function decrypt(payload: EncryptedPayload, passphrase: Buffer): string {
  const salt = Buffer.from(payload.salt, 'base64');
  const key = deriveKey(passphrase.toString('utf-8'), salt);
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    throw new Error('Invalid passphrase — cannot decrypt credentials');
  }
}

/**
 * Derive a filesystem-safe key from a server URL.
 * e.g. "https://crawlout.io" → "crawlout.io"
 *      "http://localhost:3000" → "localhost_3000"
 */
export function serverKey(serverUrl: string): string {
  const url = new URL(serverUrl);
  const isDefaultPort =
    (url.protocol === 'https:' && (!url.port || url.port === '443')) ||
    (url.protocol === 'http:' && (!url.port || url.port === '80'));
  if (isDefaultPort) {
    return url.hostname;
  }
  return `${url.hostname}_${url.port}`;
}

export function saveCredentials(name: string, serverUrl: string, credentials: StoredCredentials): void {
  const passphrase = getPassphrase();
  const credDir = join(getStoreDir(), name, serverKey(serverUrl));
  mkdirSync(credDir, { recursive: true });

  const payload = encrypt(JSON.stringify(credentials), passphrase);
  const filePath = join(credDir, 'credentials.enc');
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

  // Defence in depth: restrict file permissions (owner only)
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // chmod may fail on some platforms (e.g., Windows) — non-fatal
  }
}

export function loadCredentials(name: string, serverUrl: string): StoredCredentials {
  const passphrase = getPassphrase();
  const key = serverKey(serverUrl);
  const newPath = join(getStoreDir(), name, key, 'credentials.enc');

  // Try new multi-server path first
  if (existsSync(newPath)) {
    const raw = readFileSync(newPath, 'utf-8');
    const payload: EncryptedPayload = JSON.parse(raw);
    const decrypted = decrypt(payload, passphrase);
    return JSON.parse(decrypted);
  }

  // Fallback: legacy flat path (agent dir with no server subdirectory)
  const legacyPath = join(getStoreDir(), name, 'credentials.enc');
  if (existsSync(legacyPath)) {
    const raw = readFileSync(legacyPath, 'utf-8');
    const payload: EncryptedPayload = JSON.parse(raw);
    const decrypted = decrypt(payload, passphrase);
    return JSON.parse(decrypted);
  }

  throw new Error(`No credentials found for agent "${name}" on server "${serverUrl}". Run provision first.`);
}

export function deleteAgentCredentials(name: string, serverUrl: string): void {
  const key = serverKey(serverUrl);
  const credDir = join(getStoreDir(), name, key);
  if (existsSync(credDir)) {
    rmSync(credDir, { recursive: true, force: true });
  }

  // Clean up agent directory if empty
  const agentDir = join(getStoreDir(), name);
  if (existsSync(agentDir)) {
    const remaining = readdirSync(agentDir);
    if (remaining.length === 0) {
      rmSync(agentDir, { recursive: true, force: true });
    }
  }
}

export function listAgents(): string[] {
  const dir = getStoreDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export function listCredentials(): Array<{ name: string; server: string }> {
  const dir = getStoreDir();
  if (!existsSync(dir)) return [];

  const results: Array<{ name: string; server: string }> = [];
  const agents = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const agent of agents) {
    const agentDir = join(dir, agent.name);
    const entries = readdirSync(agentDir, { withFileTypes: true });

    // Check for legacy credentials.enc at agent root
    const hasLegacy = entries.some((e) => e.isFile() && e.name === 'credentials.enc');
    if (hasLegacy) {
      results.push({ name: agent.name, server: '(legacy)' });
    }

    // Check for server subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && existsSync(join(agentDir, entry.name, 'credentials.enc'))) {
        results.push({ name: agent.name, server: entry.name });
      }
    }
  }

  return results;
}
