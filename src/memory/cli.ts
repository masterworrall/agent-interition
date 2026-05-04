/**
 * solid-memory — CLI for the Solid Memory Standard library (A157).
 *
 * Usage:
 *   node dist/memory/cli.js --agent <name> <command> [options]
 *
 * Commands:
 *   provision                          Ensure memory/ container layout + empty index
 *   write --type <T> --label "..."     Write a memory entry
 *         [--body "..." | --body-file <path>]
 *         [--tags "tag1,tag2"]
 *         [--scope Private|OfficeShared|TeamShared]
 *         [--source <url>]             (Reference only)
 *         [--retrieve "..."]           (Reference only)
 *         [--occurred <ISO8601>]       (Episode only)
 *   list [--type <T>]                  Show all entries from the index
 *   read --uri <metadata-url>          Fetch metadata + body for an entry
 *   tags <tag1,tag2,...>               Selective load: entries matching tags
 *   supersede --uri <old> --label ...  Supersede an existing entry
 *         [--body "..." | --body-file <path>]
 *         [--tags "..."] [--scope ...]
 */

import { readFileSync } from 'node:fs';
import { initStore, loadCredentials } from '../cli/credentials-store.js';
import { getAuthenticatedFetch } from '../auth/client-credentials.js';
import { requireArg, getArg, getServerUrl, getPassphrase } from '../cli/args.js';
import { MemoryStore, MemoryValidationError } from './store.js';
import {
  Identity,
  Preference,
  Procedure,
  Reference,
  Episode,
  Private,
  OfficeShared,
  TeamShared,
} from './vocab.js';
import type { EntryType, Scope } from './vocab.js';
import type { WriteEntryInput } from './types.js';

const agent = requireArg('agent', 'Usage: solid-memory --agent <name> <command> [options]');
const serverUrl = getServerUrl();

initStore(getPassphrase());
const creds = loadCredentials(agent, serverUrl);
const authFetch = await getAuthenticatedFetch(serverUrl, creds.id, creds.secret);

const store = new MemoryStore({
  podBase: creds.podUrl,
  agentWebId: creds.webId,
  authFetch,
});

const command = findCommand();

try {
  switch (command) {
    case 'provision':
      await provision();
      break;
    case 'write':
      await write();
      break;
    case 'list':
      await list();
      break;
    case 'read':
      await read();
      break;
    case 'tags':
      await tagsCmd();
      break;
    case 'supersede':
      await supersede();
      break;
    case 'reconcile':
      await reconcile();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Commands: provision, write, list, read, tags, supersede, reconcile');
      process.exit(1);
  }
} catch (err) {
  if (err instanceof MemoryValidationError) {
    console.error(JSON.stringify({ error: 'validation', details: err.errors }, null, 2));
    process.exit(2);
  }
  console.error(JSON.stringify({ error: String((err as Error).message ?? err) }));
  process.exit(1);
}

// ── Commands ──

async function provision() {
  await store.ensureContainers();
  console.log(JSON.stringify({ status: 'ok', podBase: creds.podUrl }, null, 2));
}

async function write() {
  const input = readWriteInput();
  const entry = await store.write(input);
  console.log(JSON.stringify({ status: 'ok', entry: summarise(entry) }, null, 2));
}

async function list() {
  const filterType = getArg('type');
  const index = await store.loadIndex();
  let entries = index.entries;
  if (filterType) {
    const t = parseType(filterType);
    entries = entries.filter((e) => e.type === t);
  }
  console.log(
    JSON.stringify(
      {
        count: entries.length,
        entries: entries.map((e) => ({
          uri: e.uri,
          type: shortType(e.type),
          label: e.label,
          status: shortStatus(e.status),
          scope: shortScope(e.scope),
          tags: e.appliesTo,
        })),
      },
      null,
      2,
    ),
  );
}

async function read() {
  const uri = requireArg('uri', 'Usage: read --uri <metadata-url>');
  const metadataUrl = uri.replace(/#.*$/, '');
  const entry = await store.getEntry(metadataUrl);
  let body: string | undefined;
  if (entry.bodyUri) {
    try {
      body = await store.loadBody(entry);
    } catch (err) {
      body = `<error loading body: ${(err as Error).message}>`;
    }
  }
  console.log(JSON.stringify({ entry: summarise(entry), body }, null, 2));
}

async function tagsCmd() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));
  const tagArg = positional[positional.indexOf('tags') + 1];
  if (!tagArg) {
    console.error('Usage: solid-memory --agent <name> tags <tag1,tag2,...>');
    process.exit(1);
  }
  const tags = tagArg.split(',').map((t) => t.trim()).filter(Boolean);
  const entries = await store.loadByTags(tags);
  console.log(
    JSON.stringify(
      {
        tags,
        count: entries.length,
        entries: entries.map((e) => summarise(e)),
      },
      null,
      2,
    ),
  );
}

async function supersede() {
  const oldUri = requireArg('uri', 'Usage: supersede --uri <old-entry-uri> --label "..." [--body ...]');
  const input = readWriteInput();
  const newEntry = await store.supersede(oldUri, input);
  console.log(
    JSON.stringify({ status: 'ok', new: summarise(newEntry), supersedes: newEntry.supersedes }, null, 2),
  );
}

async function reconcile() {
  const result = await store.reconcileIndex();
  console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
}

// ── Helpers ──

function readWriteInput(): WriteEntryInput {
  const type = parseType(requireArg('type', 'Usage: write --type Identity|Preference|Procedure|Reference|Episode --label "..."'));
  const label = requireArg('label', 'Usage: write --label "..."');
  const tagsCsv = getArg('tags') ?? '';
  const tags = tagsCsv ? tagsCsv.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const scope = parseScope(getArg('scope'));

  let body: string | undefined;
  const bodyFlag = getArg('body');
  const bodyFile = getArg('body-file');
  if (bodyFile) body = readFileSync(bodyFile, 'utf8');
  else if (bodyFlag !== undefined) body = bodyFlag;

  return {
    type,
    label,
    appliesTo: tags,
    scope,
    body,
    authoritativeSource: getArg('source'),
    retrieve: getArg('retrieve'),
    occurred: getArg('occurred'),
  };
}

function parseType(s: string): EntryType {
  switch (s.toLowerCase()) {
    case 'identity':
      return Identity;
    case 'preference':
      return Preference;
    case 'procedure':
      return Procedure;
    case 'reference':
      return Reference;
    case 'episode':
      return Episode;
    default:
      throw new Error(
        `Unknown type: ${s}. Use Identity | Preference | Procedure | Reference | Episode.`,
      );
  }
}

function parseScope(s: string | undefined): Scope | undefined {
  if (!s) return undefined;
  switch (s.toLowerCase()) {
    case 'private':
      return Private;
    case 'officeshared':
      return OfficeShared;
    case 'teamshared':
      return TeamShared;
    default:
      throw new Error(`Unknown scope: ${s}. Use Private | OfficeShared | TeamShared.`);
  }
}

function shortType(uri: string): string {
  return uri.split('#').pop() ?? uri;
}
function shortStatus(uri: string): string {
  return uri.split('#').pop() ?? uri;
}
function shortScope(uri: string): string {
  return uri.split('#').pop() ?? uri;
}

function summarise(entry: import('./types.js').MemoryEntry) {
  return {
    uri: entry.uri,
    type: shortType(entry.type),
    label: entry.label,
    status: shortStatus(entry.status),
    scope: shortScope(entry.scope),
    tags: entry.appliesTo,
    bodyUri: entry.bodyUri,
    bodyHash: entry.bodyHash,
    authoritativeSource: entry.authoritativeSource,
    retrieve: entry.retrieve,
    occurred: entry.occurred,
    supersedes: entry.supersedes,
    supersededBy: entry.supersededBy,
    created: entry.created,
    standardVersion: entry.standardVersion,
  };
}

function findCommand(): string {
  const argv = process.argv.slice(2);
  for (const a of argv) {
    if (!a.startsWith('--') && a !== agent) return a;
  }
  return '';
}
