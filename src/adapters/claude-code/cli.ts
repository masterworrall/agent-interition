/**
 * solid-memory-bridge — CLI for the Claude Code ↔ Solid Memory adapter (A160).
 *
 * Usage:
 *   node dist/adapters/claude-code/cli.js --agent <name> pull [--memory-dir <path>] [--tags t1,t2]
 *   node dist/adapters/claude-code/cli.js --agent <name> push [--memory-dir <path>] [--dry-run]
 *   node dist/adapters/claude-code/cli.js --agent <name> reconstitute [--memory-dir <path>]
 *
 * Required env: INTERITION_PASSPHRASE
 *
 * Server URL resolution order (highest priority first):
 *   1. SOLID_SERVER_URL env
 *   2. --serverUrl or --server-url flag
 *   3. .solid-memory-bridge.json in the project dir computed from --memory-dir
 *   4. https://crawlout.io (default — emits a warning to stderr)
 *
 * The default memory dir is derived from the current working directory using
 * Claude Code's path-encoding convention:
 *   /Users/paul/foo  →  ~/.claude/projects/-Users-paul-foo/memory/
 */

import path from 'node:path';
import os from 'node:os';
import dns from 'node:dns';
import { promises as fs } from 'node:fs';
import { initStore, loadCredentials, discoverAgentServer } from '../../cli/credentials-store.js';
import { getAuthenticatedFetch } from '../../auth/client-credentials.js';
import { requireArg, getArg, getPassphrase } from '../../cli/args.js';
import { MemoryStore } from '../../memory/store.js';
import { pull } from './pull.js';
import { push } from './push.js';

interface BridgeConfig {
  agent?: string;
  serverUrl?: string;
  ipv4First?: boolean;
}

const agent = requireArg(
  'agent',
  'Usage: solid-memory-bridge --agent <name> <pull|push|reconstitute> [options]',
);
const command = process.argv
  .slice(2)
  .find((a) => a === 'pull' || a === 'push' || a === 'reconstitute');
if (!command) {
  console.error('Missing command. Expected one of: pull, push, reconstitute');
  process.exit(1);
}

const memoryDir = getArg('memory-dir') ?? defaultMemoryDir();
const projectConfig = await readBridgeConfig(memoryDir);
const useIpv4First = resolveIpv4First(projectConfig);
if (useIpv4First) dns.setDefaultResultOrder('ipv4first');
initStore(getPassphrase());

let serverUrl: string;
try {
  serverUrl = resolveServerUrl(agent, projectConfig);
} catch (err) {
  console.error(JSON.stringify({ error: (err as Error).message }));
  process.exit(2);
}

const tagsRaw = getArg('tags');
const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
const dryRun = process.argv.includes('--dry-run');
const regenerateIndex = process.argv.includes('--regenerate-index');

const creds = loadCredentials(agent, serverUrl);
const authFetch = await getAuthenticatedFetch(serverUrl, creds.id, creds.secret);
const store = new MemoryStore({
  podBase: creds.podUrl,
  agentWebId: creds.webId,
  authFetch,
});

try {
  if (command === 'pull') {
    const result = await pull({
      store,
      agentWebId: creds.webId,
      podBase: creds.podUrl,
      memoryDir,
      tags,
      regenerateIndex,
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'push') {
    const result = await push({
      store,
      agentWebId: creds.webId,
      podBase: creds.podUrl,
      memoryDir,
      dryRun,
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    // reconstitute: clear local cache + bridge state, then run pull from the
    // (possibly new) Pod. Standard §10.3.
    await clearMemoryDir(memoryDir);
    const result = await pull({
      store,
      agentWebId: creds.webId,
      podBase: creds.podUrl,
      memoryDir,
      tags,
      regenerateIndex: true,
    });
    console.log(
      JSON.stringify(
        {
          mode: 'reconstitute',
          memoryDir,
          podBase: creds.podUrl,
          ...result,
        },
        null,
        2,
      ),
    );
  }
} catch (err) {
  console.error(JSON.stringify({ error: (err as Error).message }));
  process.exit(1);
}

async function clearMemoryDir(dir: string): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const name of entries) {
    if (name.endsWith('.md') || name === '.solid-memory-bridge') {
      const target = path.join(dir, name);
      await fs.rm(target, { recursive: true, force: true });
    }
  }
}

function defaultMemoryDir(): string {
  const cwd = process.cwd();
  const slug = cwd.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', slug, 'memory');
}

async function readBridgeConfig(memoryDir: string): Promise<BridgeConfig | null> {
  const configPath = path.join(path.dirname(memoryDir), '.solid-memory-bridge.json');
  try {
    const text = await fs.readFile(configPath, 'utf8');
    return JSON.parse(text) as BridgeConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function resolveServerUrl(agentName: string, config: BridgeConfig | null): string {
  if (process.env.SOLID_SERVER_URL) return process.env.SOLID_SERVER_URL;
  const flag = getArg('serverUrl') ?? getArg('server-url');
  if (flag) return flag;
  if (config?.serverUrl) return config.serverUrl;
  // Last fallback: discover from the credential store. Throws clear errors if
  // the agent isn't provisioned, or if it's provisioned on multiple servers.
  return discoverAgentServer(agentName);
}

function resolveIpv4First(config: BridgeConfig | null): boolean {
  // Explicit env wins
  if (process.env.NODE_OPTIONS?.includes('--dns-result-order=ipv4first')) return true;
  // Project config flag — defaults to true unless explicitly false
  if (config?.ipv4First === false) return false;
  // Default true: harmless on networks where ipv4first works the same as default,
  // and necessary on macOS where Node's default IPv6-first resolution can stall.
  return true;
}
