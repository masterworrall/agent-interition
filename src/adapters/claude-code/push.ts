/**
 * Push mode — read Claude Code memory files from the local memory directory
 * and write each as a Solid Memory entry on the agent's Pod.
 *
 * Implements the standard's §10.2 memory-write path:
 *   1. Walk the local memory dir for `<type>_<slug>.md` files
 *   2. Parse frontmatter; classify against the bridge state
 *   3. New file → write a fresh entry of the mapped standard type
 *   4. Existing file with changed body → supersede the previous entry
 *   5. Existing file with unchanged body → no-op
 *
 * `MEMORY.md` and the bridge-state directory are skipped — neither is a
 * memory entry. Files without recognised `<type>_` prefixes are also skipped
 * so we don't accidentally upload notes or scratch files.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MemoryStore } from '../../memory/store.js';
import { Identity, Episode, Reference } from '../../memory/vocab.js';
import type { Scope } from '../../memory/vocab.js';
import { hashBody } from '../../memory/hash.js';
import type { WriteEntryInput } from '../../memory/types.js';
import { Private } from '../../memory/vocab.js';
import { BridgeStateStore, type BridgeEntry } from './bridge-state.js';
import {
  parseFrontmatter,
  defaultStandardTypeFor,
  isClaudeCodeType,
  type ClaudeCodeType,
} from './mapping.js';

const RECOGNISED_PREFIXES: ClaudeCodeType[] = ['user', 'feedback', 'project', 'reference'];

export interface PushOptions {
  store: MemoryStore;
  agentWebId: string;
  podBase: string;
  memoryDir: string;
  defaultTags?: string[]; // appliesTo tags for entries that don't carry their own
  dryRun?: boolean;
}

export interface PushResult {
  written: { localFile: string; metadataUri: string; mode: 'new' | 'supersede' }[];
  unchanged: string[];
  skipped: { localFile: string; reason: string }[];
}

export async function push(opts: PushOptions): Promise<PushResult> {
  const { store, memoryDir, defaultTags = [], dryRun = false } = opts;

  const dirEntries = await fs.readdir(memoryDir, { withFileTypes: true });
  const files = dirEntries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'MEMORY.md')
    .map((e) => e.name);

  const bridge = new BridgeStateStore(memoryDir);
  const state = (await bridge.load()) ?? {
    version: '1' as const,
    agentWebId: opts.agentWebId,
    podBase: opts.podBase,
    entries: {},
  };

  const written: PushResult['written'] = [];
  const unchanged: string[] = [];
  const skipped: PushResult['skipped'] = [];
  const newBridgeEntries: Record<string, BridgeEntry> = {};

  for (const filename of files) {
    const claudeType = inferClaudeType(filename);
    if (!claudeType) {
      skipped.push({ localFile: filename, reason: 'no recognised <type>_ prefix' });
      continue;
    }
    const filePath = path.join(memoryDir, filename);
    const raw = await fs.readFile(filePath, 'utf8');
    let parsed;
    try {
      parsed = parseFrontmatter(raw);
    } catch (err) {
      skipped.push({ localFile: filename, reason: `frontmatter parse: ${(err as Error).message}` });
      continue;
    }

    if (!isClaudeCodeType(parsed.frontmatter.type) || parsed.frontmatter.type !== claudeType) {
      skipped.push({
        localFile: filename,
        reason: `frontmatter type "${parsed.frontmatter.type}" doesn't match filename prefix "${claudeType}"`,
      });
      continue;
    }

    const bodyHash = hashBody(parsed.body);
    const existing = state.entries[filename];

    // A171: frontmatter may declare `authoritativeSource: <URL>`. When present
    // on a new `reference_*.md` file (no bridge-state hint yet), it tips the
    // type classification toward mem:Reference instead of falling back to
    // mem:Procedure. This is the only path to create a new Reference from a
    // local file.
    const fmAuthSource = parsed.frontmatter.authoritativeSource;

    // Unchanged-body fast path. For non-Reference entries, the body hash on
    // the Pod (existing.bodyHash) is the comparison; for Reference entries,
    // there is no Pod-side body — compare against the rendered body hash we
    // recorded at pull time.
    const previousType = existing?.standardType;
    const isReference = (previousType ?? defaultStandardTypeFor(claudeType, !!fmAuthSource)) === Reference;
    const referenceBodyUnchanged =
      isReference && existing?.renderedBodyHash !== undefined && existing.renderedBodyHash === bodyHash;

    if (existing && (existing.bodyHash === bodyHash || referenceBodyUnchanged)) {
      unchanged.push(filename);
      continue;
    }

    // Reference entries cannot carry a body on the Pod. If the user edited
    // the rendered body, we cannot represent the change as a mem:Reference —
    // surface a warning rather than silently dropping the prose.
    if (isReference && existing && existing.renderedBodyHash !== bodyHash) {
      skipped.push({
        localFile: filename,
        reason:
          'Reference body edited locally — mem:Reference cannot carry prose. Edit the authoritative source on the Pod or convert this entry to mem:Procedure.',
      });
      continue;
    }

    const standardType = previousType ?? defaultStandardTypeFor(claudeType, !!fmAuthSource);
    const tagsForEntry =
      existing?.appliesTo && existing.appliesTo.length > 0
        ? existing.appliesTo
        : mergeTags(defaultTags, parsed.frontmatter.name);

    const writeInput: WriteEntryInput = {
      type: standardType,
      label: parsed.frontmatter.name,
      appliesTo: tagsForEntry,
      scope: (existing?.scope as Scope | undefined) ?? Private,
    };

    if (standardType === Reference) {
      // A171: source the URL from existing bridge state (preserves prior
      // round-trips) or from the local file's frontmatter (the new path that
      // lets agents create References from local files alone).
      const authSource = existing?.authoritativeSource ?? fmAuthSource;
      if (!authSource) {
        skipped.push({
          localFile: filename,
          reason: 'Reference entry needs `authoritativeSource: <URL>` in the frontmatter (no other write path).',
        });
        continue;
      }
      // Reference entries cannot carry a body. Reject prose with a clear
      // message so the operator knows to either move the prose elsewhere or
      // convert to a Procedure entry.
      if (parsed.body.trim().length > 0) {
        skipped.push({
          localFile: filename,
          reason: 'Reference entry must have an empty body. The authoritative source carries the content; this file is the pointer.',
        });
        continue;
      }
      writeInput.authoritativeSource = authSource;
      if (existing?.retrieve) writeInput.retrieve = existing.retrieve;
    } else {
      writeInput.body = parsed.body;
      if (standardType === Episode && existing?.occurred) {
        writeInput.occurred = existing.occurred;
      } else if (standardType === Episode) {
        writeInput.occurred = new Date().toISOString();
      }
    }

    if (dryRun) {
      written.push({
        localFile: filename,
        metadataUri: existing?.metadataUri ?? '(new)',
        mode: existing ? 'supersede' : 'new',
      });
      continue;
    }

    try {
      let result;
      if (existing && standardType !== Identity && standardType !== Episode) {
        result = await store.supersede(existing.metadataUri, writeInput);
      } else {
        result = await store.write(writeInput);
      }
      written.push({
        localFile: filename,
        metadataUri: result.uri,
        mode: existing ? 'supersede' : 'new',
      });
      newBridgeEntries[filename] = {
        localFile: filename,
        metadataUri: result.uri,
        standardType: result.type,
        bodyHash: result.bodyHash,
        lastPushedAt: new Date().toISOString(),
        lastPulledAt: existing?.lastPulledAt,
        appliesTo: tagsForEntry,
        scope: writeInput.scope,
        authoritativeSource: writeInput.authoritativeSource,
        retrieve: writeInput.retrieve,
        occurred: writeInput.occurred,
        // For Reference entries the rendered body is unchanged; for others the
        // local body IS what we just pushed so the next push diffs against it.
        renderedBodyHash: bodyHash,
      };
    } catch (err) {
      skipped.push({ localFile: filename, reason: (err as Error).message });
    }
  }

  if (!dryRun && Object.keys(newBridgeEntries).length > 0) {
    await bridge.update(opts.agentWebId, opts.podBase, (entries) => {
      for (const [k, v] of Object.entries(newBridgeEntries)) entries[k] = v;
    });
  }

  return { written, unchanged, skipped };
}

function inferClaudeType(filename: string): ClaudeCodeType | null {
  for (const prefix of RECOGNISED_PREFIXES) {
    if (filename.startsWith(`${prefix}_`)) return prefix;
  }
  return null;
}

function mergeTags(defaults: string[], label: string): string[] {
  // Generate at least one tag from the label so the entry survives selective load
  const slugTag = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tags = new Set([...defaults, slugTag].filter(Boolean));
  return Array.from(tags);
}
