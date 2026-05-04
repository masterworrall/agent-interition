/**
 * Claude Code ↔ Solid Memory Standard mapping (A160).
 *
 * Claude Code stores agent memory under `~/.claude/projects/<slug>/memory/` as:
 *   - `MEMORY.md` (one-line index with links to topic files)
 *   - topic files with YAML frontmatter: `name`, `description`, `type`
 *     (`type` is one of `user | feedback | project | reference`).
 *
 * The Solid Memory Standard (v0.2) has five entry types:
 *   `mem:Identity | mem:Preference | mem:Procedure | mem:Reference | mem:Episode`.
 *
 * Claude Code's four-type vocabulary is narrower than the standard. We use a
 * bridge-state file (see bridge-state.ts) to record the precise Pod URI and
 * standard type for each local file so round-trips don't lose typing.
 *
 * Default mapping (used when there's no bridge-state hint, e.g. for a new
 * local file pushed to the Pod for the first time):
 *
 *   user      → mem:Identity
 *   feedback  → mem:Preference
 *   project   → mem:Episode
 *   reference → mem:Reference  (when authoritativeSource is parseable)
 *               mem:Procedure  (otherwise — body is treated as how-to prose)
 */

import {
  Identity,
  Preference,
  Procedure,
  Reference,
  Episode,
  type EntryType,
} from '../../memory/vocab.js';

export type ClaudeCodeType = 'user' | 'feedback' | 'project' | 'reference';

export interface Frontmatter {
  name: string;
  description: string;
  type: ClaudeCodeType;
  [key: string]: string | undefined;
}

export interface ParsedFile {
  frontmatter: Frontmatter;
  body: string;
}

const FENCE = '---';

export function parseFrontmatter(content: string): ParsedFile {
  if (!content.startsWith(FENCE + '\n') && !content.startsWith(FENCE + '\r\n')) {
    throw new Error('File does not start with YAML frontmatter (---)');
  }
  const after = content.slice(FENCE.length).replace(/^\r?\n/, '');
  const end = after.indexOf('\n' + FENCE);
  if (end < 0) throw new Error('Unterminated YAML frontmatter');
  const yamlBlock = after.slice(0, end);
  const body = after.slice(end + 1 + FENCE.length).replace(/^\r?\n/, '');

  const fm: Record<string, string> = {};
  for (const rawLine of yamlBlock.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }

  if (!fm.name || !fm.description || !fm.type) {
    throw new Error(
      `Frontmatter missing required keys (name/description/type). Got: ${Object.keys(fm).join(', ')}`,
    );
  }
  if (!isClaudeCodeType(fm.type)) {
    throw new Error(`Unknown Claude Code memory type: ${fm.type}`);
  }
  return { frontmatter: fm as Frontmatter, body };
}

export function serializeFrontmatter(parsed: ParsedFile): string {
  const fm = parsed.frontmatter;
  const lines = [FENCE];
  for (const key of ['name', 'description', 'type']) {
    lines.push(`${key}: ${escapeYamlScalar(fm[key]!)}`);
  }
  for (const key of Object.keys(fm)) {
    if (key === 'name' || key === 'description' || key === 'type') continue;
    const value = fm[key];
    if (value === undefined) continue;
    lines.push(`${key}: ${escapeYamlScalar(value)}`);
  }
  lines.push(FENCE, '');
  return lines.join('\n') + parsed.body;
}

function escapeYamlScalar(s: string): string {
  // Quote if the scalar contains characters that would confuse a flow-style YAML parser
  if (/[:#\[\]{},&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

export function isClaudeCodeType(s: string): s is ClaudeCodeType {
  return s === 'user' || s === 'feedback' || s === 'project' || s === 'reference';
}

/**
 * Map a Claude Code type to the most likely standard type, given whether the
 * body parses as a Reference (i.e. has an explicit `authoritativeSource`).
 *
 * For `reference` we tip toward `mem:Reference` only if a `solid:source`
 * frontmatter key is present. Without that, the file body is prose, which
 * doesn't fit `mem:Reference` (no body allowed) — fall back to `mem:Procedure`.
 */
export function defaultStandardTypeFor(
  claudeType: ClaudeCodeType,
  hasAuthoritativeSource: boolean,
): EntryType {
  switch (claudeType) {
    case 'user':
      return Identity;
    case 'feedback':
      return Preference;
    case 'project':
      return Episode;
    case 'reference':
      return hasAuthoritativeSource ? Reference : Procedure;
  }
}

/**
 * Reverse mapping: when pulling from the Pod, write each entry as one of the
 * four Claude Code types. Procedure has no native counterpart — use
 * `reference` because it best matches "pointer/lookup material" semantics in
 * Claude Code's taxonomy.
 */
export function claudeCodeTypeFor(standardType: EntryType): ClaudeCodeType {
  switch (standardType) {
    case Identity:
      return 'user';
    case Preference:
      return 'feedback';
    case Procedure:
      return 'reference';
    case Reference:
      return 'reference';
    case Episode:
      return 'project';
    default:
      throw new Error(`Unknown standard memory type: ${standardType}`);
  }
}

/**
 * Generate the local filename Claude Code uses for a memory entry.
 * Keeps the slug from the Pod URI and prefixes the Claude Code type.
 */
export function localFilenameFor(
  standardType: EntryType,
  podSlug: string,
): string {
  const cc = claudeCodeTypeFor(standardType);
  return `${cc}_${podSlug}.md`;
}
