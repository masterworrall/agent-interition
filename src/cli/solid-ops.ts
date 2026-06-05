/**
 * solid-ops — Solid Pod operations CLI for team agents.
 *
 * Single-process CLI that authenticates once and executes
 * Solid Pod operations with automatic token refresh.
 *
 * Usage:
 *   node dist/cli/solid-ops.js --agent <name> <command> [options]
 *
 * Commands:
 *   read-chat [--last N]                      List and fetch last N messages
 *   post-message --to <webid> --text <msg> --topic <t>   Post to team chat
 *   read-resource <url>                       GET any Solid resource
 *   write-resource <url> --file <path>        PUT Turtle file to Pod URL
 *   patch-resource <url> --file <path>        PATCH with SPARQL Update body from file
 *   delete-resource <url>                     DELETE a Solid resource
 *   list-container <url>                      List container members
 */

import { initStore, loadCredentials } from './credentials-store.js';
import { getAuthenticatedFetch } from '../auth/client-credentials.js';
import { requireArg, getArg, getServerUrl, getPassphrase } from './args.js';

// ── SETUP ──

const agent = requireArg('agent', 'Usage: solid-ops --agent <name> <command> [options]');
const serverUrl = getServerUrl();

initStore(getPassphrase());
const creds = loadCredentials(agent, serverUrl);
const authFetch = await getAuthenticatedFetch(serverUrl, creds.id, creds.secret);

// ── COMMAND DISPATCH ──

const command = findCommand();

switch (command) {
  case 'read-chat':
    await readChat();
    break;
  case 'post-message':
    await postMessage();
    break;
  case 'read-resource':
    await readResource();
    break;
  case 'write-resource':
    await writeResource();
    break;
  case 'patch-resource':
    await patchResource();
    break;
  case 'delete-resource':
    await deleteResource();
    break;
  case 'list-container':
    await listContainer();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Commands: read-chat, post-message, read-resource, write-resource, patch-resource, delete-resource, list-container');
    process.exit(1);
}

// ── COMMAND IMPLEMENTATIONS ──

async function readChat() {
  const lastN = parseInt(getArg('last') ?? '10', 10);
  const chatUrl = `${serverUrl}/team/chat/`;

  const listing = await solidGet(chatUrl);
  const members = parseTtlMembers(listing, chatUrl);

  // Sort by filename (which is timestamped) descending, take last N
  const sorted = members
    .filter(m => m.endsWith('.ttl'))
    .sort()
    .slice(-lastN);

  const messages: Array<{ url: string; from: string; date: string; to: string; text: string; topic: string }> = [];

  for (const member of sorted) {
    const url = member.startsWith('http') ? member : chatUrl + member;
    const body = await solidGet(url);
    if (!body.trim()) {
      messages.push({ url, from: '?', date: '?', to: '?', text: '(empty — 0 bytes)', topic: '?' });
      continue;
    }
    messages.push({
      url,
      from: extractTtlValue(body, 'schema:author') || '?',
      date: extractTtlValue(body, 'schema:dateCreated') || '?',
      to: extractTtlValue(body, 'schema:recipient') || 'all',
      text: extractTtlValue(body, 'schema:text') || '(no text)',
      topic: extractTtlValue(body, 'schema:about') || '?',
    });
  }

  console.log(JSON.stringify(messages, null, 2));
}

async function postMessage() {
  const to = getArg('to') ?? '';
  const text = getArg('text');
  const topic = getArg('topic') ?? 'general';

  if (!text) {
    console.error('Usage: solid-ops --agent <name> post-message --text "message" --topic "topic" [--to <webid>]');
    process.exit(1);
  }

  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, '').slice(0, 13);
  const slug = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 13)}-${agent}-${topic}`;
  const chatUrl = `${serverUrl}/team/chat/${slug}.ttl`;

  const recipientTriple = to
    ? `  schema:recipient <${to}> ;`
    : '';

  const turtle = [
    '@prefix schema: <http://schema.org/> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '<>',
    '  a schema:Message ;',
    `  schema:author <${creds.webId}> ;`,
    `  schema:dateCreated "${now.toISOString()}"^^xsd:dateTime ;`,
    recipientTriple,
    `  schema:text "${escapeTurtle(text)}" ;`,
    `  schema:about "${escapeTurtle(topic)}" .`,
  ].filter(line => line !== '').join('\n');

  const resp = await authFetch(chatUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: turtle,
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(JSON.stringify({ error: `PUT failed: ${resp.status}`, detail: err }));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, url: chatUrl }));
}

async function readResource() {
  const url = findPositionalArg();
  if (!url) {
    console.error('Usage: solid-ops --agent <name> read-resource <url>');
    process.exit(1);
  }
  const body = await solidGet(url);
  console.log(body);
}

async function writeResource() {
  const url = findPositionalArg();
  const filePath = getArg('file');
  const contentType = getArg('content-type') ?? 'text/turtle';
  if (!url || !filePath) {
    console.error('Usage: solid-ops --agent <name> write-resource <url> --file <path> [--content-type <mime>]');
    console.error('  --content-type defaults to text/turtle. Pass text/html, application/json, image/png, etc. for non-RDF resources.');
    process.exit(1);
  }
  const { readFileSync } = await import('fs');
  // Read as binary Buffer when the content-type is not text-shaped; reading
  // a binary file (PNG, JPG, etc.) as utf8 corrupts it on transit.
  const isBinary = !/^(text\/|application\/(json|ld\+json|sparql-update|n-quads|n-triples|trig|turtle|xml|x-www-form-urlencoded)|image\/svg\+xml)/i.test(contentType);
  const body = isBinary ? readFileSync(filePath) : readFileSync(filePath, 'utf8');
  const resp = await authFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(JSON.stringify({ error: `PUT failed: ${resp.status}`, detail: err }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, url, status: resp.status, contentType }));
}

async function patchResource() {
  const url = findPositionalArg();
  const filePath = getArg('file');
  if (!url || !filePath) {
    console.error('Usage: solid-ops --agent <name> patch-resource <url> --file <path>');
    console.error('  File must contain a SPARQL Update body, e.g.:');
    console.error('    PREFIX schema: <http://schema.org/>');
    console.error('    INSERT DATA { <#me> schema:name "Two" . }');
    process.exit(1);
  }
  const { readFileSync } = await import('fs');
  const body = readFileSync(filePath, 'utf8');
  const resp = await authFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/sparql-update' },
    body,
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(JSON.stringify({ error: `PATCH failed: ${resp.status}`, detail: err }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, url, status: resp.status }));
}

async function deleteResource() {
  const url = findPositionalArg();
  if (!url) {
    console.error('Usage: solid-ops --agent <name> delete-resource <url>');
    process.exit(1);
  }
  const resp = await authFetch(url, { method: 'DELETE' });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(JSON.stringify({ error: `DELETE failed: ${resp.status}`, detail: err }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, url, status: resp.status }));
}

async function listContainer() {
  const url = findPositionalArg();
  if (!url) {
    console.error('Usage: solid-ops --agent <name> list-container <url>');
    process.exit(1);
  }
  const body = await solidGet(url);
  const members = parseTtlMembers(body, url);
  console.log(JSON.stringify(members, null, 2));
}

// ── HELPERS ──

async function solidGet(url: string): Promise<string> {
  const resp = await authFetch(url, {
    headers: { 'Accept': 'text/turtle' },
  });
  if (!resp.ok) {
    throw new Error(`GET ${url}: ${resp.status} ${resp.statusText}`);
  }
  return resp.text();
}

function parseTtlMembers(turtle: string, _containerUrl: string): string[] {
  // Extract ldp:contains references from container Turtle.
  // CSS serialises the whole ldp:contains list on one line with comma-separated <uri> refs.
  const containsIdx = turtle.indexOf('ldp:contains');
  if (containsIdx < 0) return [];

  // Everything from ldp:contains to the Turtle statement terminator.
  // The terminator is '.' followed by whitespace/newline or end of string.
  // We can't just use indexOf('.') because URIs contain dots (e.g. '.ttl').
  const rest = turtle.slice(containsIdx);
  const termMatch = rest.match(/\.\s*$/m);
  const chunk = termMatch ? rest.slice(0, termMatch.index) : rest;

  const members: string[] = [];
  const uriRegex = /<([^>]+)>/g;
  let m;
  while ((m = uriRegex.exec(chunk)) !== null) {
    members.push(m[1]);
  }
  return members;
}

function extractTtlValue(turtle: string, predicate: string): string | null {
  // Match predicate followed by <uri> or "literal"
  const uriPattern = new RegExp(`${escapeRegex(predicate)}\\s+<([^>]+)>`);
  const litPattern = new RegExp(`${escapeRegex(predicate)}\\s+"([^"]*)"`, 's');

  const uriMatch = turtle.match(uriPattern);
  if (uriMatch) return uriMatch[1];

  const litMatch = turtle.match(litPattern);
  if (litMatch) return litMatch[1];

  return null;
}

function escapeTurtle(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCommand(): string {
  // Find the first positional arg that isn't a flag value
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      i++; // skip flag value
      continue;
    }
    return argv[i];
  }
  console.error('No command specified.');
  console.error('Commands: read-chat, post-message, read-resource, write-resource, patch-resource, delete-resource, list-container');
  process.exit(1);
}

function findPositionalArg(): string | undefined {
  // Find the second positional arg (first is the command)
  const argv = process.argv.slice(2);
  let positionals = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      i++; // skip flag value
      continue;
    }
    positionals++;
    if (positionals === 2) return argv[i];
  }
  return undefined;
}
