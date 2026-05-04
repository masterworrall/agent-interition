/**
 * Claude Code adapter for the Solid Memory Standard (A160).
 *
 * Bridges Claude Code's native memory layout (`~/.claude/projects/<slug>/memory/`)
 * with the Solid Memory Standard (v0.2). Provides:
 *
 *   - pull(): session-start path (Pod → local)
 *   - push(): memory-write path (local → Pod)
 *
 * Spec: crd-office/solid-memory-standard.md §10
 * Work record: A160
 */

export { pull } from './pull.js';
export type { PullOptions, PullResult } from './pull.js';
export { push } from './push.js';
export type { PushOptions, PushResult } from './push.js';
export { BridgeStateStore } from './bridge-state.js';
export type { BridgeState, BridgeEntry } from './bridge-state.js';
export {
  parseFrontmatter,
  serializeFrontmatter,
  isClaudeCodeType,
  defaultStandardTypeFor,
  claudeCodeTypeFor,
  localFilenameFor,
} from './mapping.js';
export type { ClaudeCodeType, Frontmatter, ParsedFile } from './mapping.js';
