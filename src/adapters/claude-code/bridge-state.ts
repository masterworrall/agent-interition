/**
 * Bridge state for the Claude Code ↔ Solid Memory adapter.
 *
 * We need to round-trip between Claude Code's four-type vocabulary
 * (`user|feedback|project|reference`) and the standard's five-type vocabulary
 * (Identity/Preference/Procedure/Reference/Episode) without losing precision.
 *
 * The state file is an explicit JSON record kept alongside the Claude Code
 * memory dir. It is NOT persisted to the Pod — it's local-only adapter state.
 *
 *   ~/.claude/projects/<slug>/memory/.solid-memory-bridge/state.json
 *
 * Each entry maps a local filename → its Pod metadata URI + standard type +
 * the body hash at last sync (so we can detect local-only edits).
 *
 * v0.2 of the standard (§12) defers harness round-trip rules to v0.3. This is
 * the operational placeholder — once the standard formalises round-tripping,
 * we replace the on-disk format with the standard one and migrate.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EntryType } from '../../memory/vocab.js';

export interface BridgeEntry {
  localFile: string; // basename, e.g. "feedback_rdf-tooling.md"
  metadataUri: string; // full Pod URL with #entry fragment
  standardType: EntryType;
  bodyHash?: string; // sha256 of the body at last sync
  lastPulledAt?: string; // ISO 8601
  lastPushedAt?: string; // ISO 8601
  // Type-specific fields preserved from the Pod entry so round-trip writes
  // can rebuild the entry without re-deriving from the rendered local body.
  appliesTo?: string[];
  scope?: string;
  authoritativeSource?: string; // mem:Reference only
  retrieve?: string; // mem:Reference only
  occurred?: string; // mem:Episode only — ISO 8601
  // Rendered body that pull wrote to disk. Used to detect whether the user
  // has edited the file locally vs simply held a passthrough copy.
  renderedBodyHash?: string;
}

export interface BridgeState {
  version: '1';
  agentWebId: string;
  podBase: string;
  entries: Record<string, BridgeEntry>; // keyed by localFile
}

const STATE_DIR = '.solid-memory-bridge';
const STATE_FILE = 'state.json';

export class BridgeStateStore {
  private readonly dirPath: string;
  private readonly filePath: string;

  constructor(memoryDir: string) {
    this.dirPath = path.join(memoryDir, STATE_DIR);
    this.filePath = path.join(this.dirPath, STATE_FILE);
  }

  async load(): Promise<BridgeState | null> {
    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(text) as BridgeState;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(state: BridgeState): Promise<void> {
    await fs.mkdir(this.dirPath, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }

  async update(
    agentWebId: string,
    podBase: string,
    mutate: (entries: Record<string, BridgeEntry>) => void,
  ): Promise<BridgeState> {
    const existing = await this.load();
    const state: BridgeState =
      existing && existing.agentWebId === agentWebId && existing.podBase === podBase
        ? existing
        : { version: '1', agentWebId, podBase, entries: {} };
    mutate(state.entries);
    await this.save(state);
    return state;
  }
}
