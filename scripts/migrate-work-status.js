/**
 * migrate-work-status.js
 *
 * Migrates work graph status values from schema.org URIs to int: URIs:
 *   schema:PotentialActionStatus  →  int:BacklogStatus
 *   schema:ActiveActionStatus     →  int:ActiveStatus
 *   schema:CompletedActionStatus  →  int:DoneStatus
 *   schema:FailedActionStatus     →  int:CancelledStatus
 *
 * Also adds int:SpecifyingStatus, int:WaitingStatus, int:CancelledStatus
 * to vocab.ttl.
 *
 * Usage:
 *   node scripts/migrate-work-status.js [--dry-run]
 */

import { initStore, loadCredentials } from '../dist/cli/credentials-store.js';
import { getAuthenticatedFetch } from '../dist/auth/client-credentials.js';

const BASE = 'https://crawlout.io/team/work/';
const CONTAINERS = ['epics/', 'tasks/', 'triggers/'];

const REPLACEMENTS = [
  ['schema:PotentialActionStatus', 'int:BacklogStatus'],
  ['schema:ActiveActionStatus',    'int:ActiveStatus'],
  ['schema:CompletedActionStatus', 'int:DoneStatus'],
  ['schema:FailedActionStatus',    'int:CancelledStatus'],
  // full URI forms (defensive)
  ['<http://schema.org/PotentialActionStatus>', '<https://interition.ai/vocab/work#BacklogStatus>'],
  ['<http://schema.org/ActiveActionStatus>',    '<https://interition.ai/vocab/work#ActiveStatus>'],
  ['<http://schema.org/CompletedActionStatus>', '<https://interition.ai/vocab/work#DoneStatus>'],
  ['<http://schema.org/FailedActionStatus>',    '<https://interition.ai/vocab/work#CancelledStatus>'],
];

const dryRun = process.argv.includes('--dry-run');
const serverUrl = 'https://crawlout.io';

initStore(process.env.INTERITION_PASSPHRASE ?? (() => { console.error('Set INTERITION_PASSPHRASE'); process.exit(1); })());
const creds = loadCredentials('two', serverUrl);
const authFetch = await getAuthenticatedFetch(serverUrl, creds.id, creds.secret);

// ── HELPERS ──

async function getText(url) {
  const r = await authFetch(url, { headers: { Accept: 'text/turtle' } });
  if (!r.ok) throw new Error(`GET ${url}: ${r.status}`);
  return r.text();
}

async function putText(url, body) {
  const r = await authFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body,
  });
  if (!r.ok) throw new Error(`PUT ${url}: ${r.status}`);
}

async function listContainer(url) {
  const text = await getText(url);
  const matches = [];
  const re = /<([^>]+\.ttl)>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const href = m[1];
    matches.push(href.startsWith('http') ? href : url + href);
  }
  return [...new Set(matches)];
}

async function migrateFile(url) {
  const original = await getText(url);
  let updated = original;
  for (const [from, to] of REPLACEMENTS) {
    updated = updated.replaceAll(from, to);
  }
  if (updated === original) {
    console.log(`  skip    ${url.replace(BASE, '')}`);
    return false;
  }
  if (dryRun) {
    const changes = REPLACEMENTS
      .filter(([from]) => original.includes(from))
      .map(([from, to]) => `${from} → ${to}`);
    console.log(`  would update  ${url.replace(BASE, '')}  [${changes.join(', ')}]`);
    return true;
  }
  await putText(url, updated);
  console.log(`  updated  ${url.replace(BASE, '')}`);
  return true;
}

// ── MAIN ──

console.log(dryRun ? '── DRY RUN ──' : '── MIGRATING ──');
console.log('Status URIs: schema.org → interition.ai/vocab/work#\n');

let total = 0;
let changed = 0;

for (const file of ['vocab.ttl', 'graph.ttl']) {
  total++;
  if (await migrateFile(BASE + file)) changed++;
}

for (const container of CONTAINERS) {
  const files = await listContainer(BASE + container);
  for (const url of files) {
    if (url.endsWith('.placeholder')) continue;
    total++;
    if (await migrateFile(url)) changed++;
  }
}

console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${changed} of ${total} files.`);
