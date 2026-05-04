/**
 * Pull mode — read entries from the agent's Pod and render them into the
 * Claude Code memory directory.
 *
 * Implements the standard's §10.1 session-start path:
 *   1. GET <pod>/memory/index.ttl
 *   2. Filter to Active entries; optionally restrict by appliesTo tags
 *   3. Always include Identity entries
 *   4. For each match: fetch metadata + body (where applicable)
 *   5. Verify body hash; flag drift
 *   6. Write each entry to the local memory dir
 *   7. Update the bridge state file
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MemoryStore } from '../../memory/store.js';
import { Identity, Reference, Active } from '../../memory/vocab.js';
import type { MemoryEntry } from '../../memory/types.js';
import { hashBody } from '../../memory/hash.js';
import { BridgeStateStore, type BridgeEntry } from './bridge-state.js';
import {
  claudeCodeTypeFor,
  localFilenameFor,
  serializeFrontmatter,
  type ParsedFile,
  type Frontmatter,
} from './mapping.js';

export interface PullOptions {
  store: MemoryStore;
  agentWebId: string;
  podBase: string;
  memoryDir: string; // ~/.claude/projects/<slug>/memory/
  tags?: string[]; // selective load; if undefined, load all Active
  regenerateIndex?: boolean; // rewrite MEMORY.md (default: false)
}

export interface PullResult {
  loaded: number;
  written: string[]; // local filenames
  hashMismatches: string[]; // metadata URIs whose body hash didn't match
  skipped: string[]; // index entries we couldn't fetch or render
}

interface FetchedEntry {
  entry: MemoryEntry;
  body: string | undefined;
  metadataUrl: string;
  hashMismatch: boolean;
}

export async function pull(opts: PullOptions): Promise<PullResult> {
  const { store, memoryDir, tags, regenerateIndex } = opts;
  await fs.mkdir(memoryDir, { recursive: true });

  const index = await store.loadIndex();
  const activeEntries = index.entries.filter((e) => e.status === Active);

  const tagSet = tags ? new Set(tags) : null;
  const matched = activeEntries.filter((e) => {
    if (e.type === Identity) return true;
    if (!tagSet) return true;
    return e.appliesTo.some((t) => tagSet.has(t));
  });

  const fetched: (FetchedEntry | null)[] = await Promise.all(
    matched.map(async (idxEntry): Promise<FetchedEntry | null> => {
      const metadataUrl = stripFragment(idxEntry.uri);
      try {
        const entry = await store.getEntry(metadataUrl);
        let body: string | undefined;
        let hashMismatch = false;
        if (entry.bodyUri) {
          try {
            body = await store.loadBody(entry);
          } catch (err) {
            if ((err as Error).message.includes('hash mismatch')) {
              hashMismatch = true;
            } else {
              throw err;
            }
          }
        }
        return { entry, body, metadataUrl, hashMismatch };
      } catch {
        return null;
      }
    }),
  );

  const written: string[] = [];
  const hashMismatches: string[] = [];
  const skipped: string[] = [];
  const updates: Record<string, BridgeEntry> = {};

  for (let i = 0; i < fetched.length; i++) {
    const f = fetched[i];
    if (!f) {
      skipped.push(matched[i].uri);
      continue;
    }
    if (f.hashMismatch) hashMismatches.push(f.entry.uri);
    const slug = slugFromUrl(f.metadataUrl);
    const filename = localFilenameFor(f.entry.type, slug);
    const parsed: ParsedFile = renderEntry(f.entry, f.body, slug);
    const fileContent = serializeFrontmatter(parsed);
    const target = path.join(memoryDir, filename);
    await fs.writeFile(target, fileContent, 'utf8');
    written.push(filename);
    updates[filename] = {
      localFile: filename,
      metadataUri: f.entry.uri,
      standardType: f.entry.type,
      bodyHash: f.entry.bodyHash,
      lastPulledAt: new Date().toISOString(),
      appliesTo: f.entry.appliesTo,
      scope: f.entry.scope,
      authoritativeSource: f.entry.authoritativeSource,
      retrieve: f.entry.retrieve,
      occurred: f.entry.occurred,
      renderedBodyHash: hashBody(parsed.body),
    };
  }

  const bridge = new BridgeStateStore(memoryDir);
  await bridge.update(opts.agentWebId, opts.podBase, (entries) => {
    for (const [k, v] of Object.entries(updates)) entries[k] = v;
  });

  if (regenerateIndex) {
    const indexMd = renderMemoryIndex(
      fetched.filter((f): f is FetchedEntry => f !== null),
    );
    await fs.writeFile(path.join(memoryDir, 'MEMORY.md'), indexMd, 'utf8');
    written.push('MEMORY.md');
  }

  return {
    loaded: matched.length - skipped.length,
    written,
    hashMismatches,
    skipped,
  };
}

function renderEntry(entry: MemoryEntry, body: string | undefined, _slug: string): ParsedFile {
  const fm: Frontmatter = {
    name: entry.label,
    description: descriptionFor(entry, body),
    type: claudeCodeTypeFor(entry.type),
  };
  const renderedBody = body ?? renderReferenceBody(entry);
  return { frontmatter: fm, body: renderedBody };
}

function descriptionFor(entry: MemoryEntry, body: string | undefined): string {
  if (entry.type === Reference && entry.retrieve) return entry.retrieve;
  if (body) {
    const firstParagraph = body.split(/\n\n/)[0].trim();
    // Skip duplication when the body's lead paragraph IS the body — the
    // resulting frontmatter would just repeat the prose. Falling back to
    // the label keeps the description meaningful at a glance.
    if (firstParagraph && firstParagraph !== body.trim()) {
      return truncate(firstParagraph, 200);
    }
  }
  return entry.label;
}

function renderReferenceBody(entry: MemoryEntry): string {
  const lines: string[] = [];
  lines.push(`# ${entry.label}`);
  lines.push('');
  if (entry.authoritativeSource) {
    lines.push(`**Authoritative source:** ${entry.authoritativeSource}`);
    lines.push('');
  }
  if (entry.retrieve) {
    lines.push(entry.retrieve);
  }
  return lines.join('\n') + '\n';
}

function renderMemoryIndex(loaded: FetchedEntry[]): string {
  const groups: Record<string, string[]> = {
    Identity: [],
    Preferences: [],
    Procedures: [],
    References: [],
    Projects: [],
  };
  for (const { entry, body } of loaded) {
    const slug = slugFromUrl(stripFragment(entry.uri));
    const filename = localFilenameFor(entry.type, slug);
    const hook = indexHookFor(entry, body);
    const line = hook ? `- [${entry.label}](${filename}) — ${hook}` : `- [${entry.label}](${filename})`;
    const cc = claudeCodeTypeFor(entry.type);
    if (cc === 'user') groups.Identity.push(line);
    else if (cc === 'feedback') groups.Preferences.push(line);
    else if (cc === 'project') groups.Projects.push(line);
    else if (entry.type === Reference) groups.References.push(line);
    else groups.Procedures.push(line);
  }
  const out: string[] = ['# Memory', ''];
  for (const [heading, lines] of Object.entries(groups)) {
    if (lines.length === 0) continue;
    out.push(`## ${heading}`);
    out.push(...lines);
    out.push('');
  }
  return out.join('\n');
}

/**
 * Build a one-line keyword hook for MEMORY.md. Search-via-index relies on
 * keywords appearing in the index line so the agent has a reason to open the
 * topic file. Without a hook, an agent searching for "heredoc" against an
 * index line that only says "Test preference" misses real content.
 *
 * Strategy: prefer the entry's body's lead sentence (truncated). Fall back
 * to the Reference retrieve text. Skip if it'd just duplicate the label.
 */
function indexHookFor(entry: MemoryEntry, body: string | undefined): string | null {
  const candidate = (() => {
    if (entry.type === Reference && entry.retrieve) return entry.retrieve;
    if (body) {
      // Split into paragraphs, find the first non-heading paragraph. The
      // body's leading heading is usually the same as the entry's label —
      // repeating it as the hook adds nothing for keyword search.
      const paragraphs = body.split(/\n\n/).map((p) => p.trim()).filter(Boolean);
      const firstProse = paragraphs.find((p) => !/^#+\s/.test(p));
      return firstProse ?? paragraphs[0] ?? '';
    }
    return '';
  })();
  if (!candidate) return null;
  if (candidate === entry.label) return null;
  return truncate(candidate.replace(/\s+/g, ' '), 120);
}

function stripFragment(uri: string): string {
  const i = uri.indexOf('#');
  return i === -1 ? uri : uri.slice(0, i);
}

function slugFromUrl(url: string): string {
  const last = url.split('/').pop() ?? '';
  return last.replace(/\.ttl$/, '');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
