#!/usr/bin/env node
/**
 * Idempotent installer for the solid-context-memory PostToolUse hook into
 * ~/.claude/settings.json. Run via install-hook.sh / uninstall-hook.sh.
 *
 * Merges into existing settings rather than replacing them. Recognises an
 * already-present entry by its hook command path (CLAUDE_SKILL_DIR/bin/hook.js)
 * and is therefore safe to re-run.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MODE = process.argv[2]; // "install" | "uninstall"
const SCRIPT_DIR = process.argv[3]; // .../scripts/
if (!SCRIPT_DIR) {
  console.error('install-hook.js: missing scripts dir argument');
  process.exit(1);
}

const SKILL_DIR = path.resolve(SCRIPT_DIR, '..');
const HOOK_BIN = path.join(SKILL_DIR, 'bin', 'hook.js');
const HOOK_COMMAND = `node ${HOOK_BIN}`;
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

async function readSettings() {
  try {
    const text = await fs.readFile(SETTINGS_PATH, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeSettings(settings) {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

function entryMatches(entry) {
  if (entry?.matcher !== 'Write|Edit') return false;
  const hooks = entry?.hooks ?? [];
  return hooks.some((h) => h?.command === HOOK_COMMAND);
}

// Migration: detect older manual entries that point at agent-interition's
// source `hook.ts` via tsx — these were the pre-skill installation pattern.
// Drop them so we don't end up with duplicate hooks firing on every write.
function isLegacyManualEntry(entry) {
  if (entry?.matcher !== 'Write|Edit') return false;
  const hooks = entry?.hooks ?? [];
  return hooks.some(
    (h) =>
      typeof h?.command === 'string' &&
      h.command.includes('src/adapters/claude-code/hook.ts'),
  );
}

const settings = await readSettings();
settings.hooks = settings.hooks ?? {};
settings.hooks.PostToolUse = settings.hooks.PostToolUse ?? [];

if (MODE === 'install') {
  const migrated = settings.hooks.PostToolUse.filter(isLegacyManualEntry).length;
  if (migrated > 0) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter((e) => !isLegacyManualEntry(e));
  }
  if (settings.hooks.PostToolUse.some(entryMatches)) {
    if (migrated > 0) await writeSettings(settings);
    console.log(JSON.stringify({ status: 'already-installed', migratedLegacyEntries: migrated, settingsPath: SETTINGS_PATH, command: HOOK_COMMAND }));
  } else {
    settings.hooks.PostToolUse.push({
      matcher: 'Write|Edit',
      hooks: [
        {
          type: 'command',
          command: HOOK_COMMAND,
          timeout: 30,
        },
      ],
    });
    await writeSettings(settings);
    console.log(JSON.stringify({ status: 'installed', migratedLegacyEntries: migrated, settingsPath: SETTINGS_PATH, command: HOOK_COMMAND }));
  }
} else if (MODE === 'uninstall') {
  const before = settings.hooks.PostToolUse.length;
  settings.hooks.PostToolUse = settings.hooks.PostToolUse
    .map((entry) => {
      if (entry?.matcher !== 'Write|Edit') return entry;
      const filteredHooks = (entry.hooks ?? []).filter((h) => h?.command !== HOOK_COMMAND);
      if (filteredHooks.length === 0) return null; // drop entry entirely if no hooks left
      return { ...entry, hooks: filteredHooks };
    })
    .filter((e) => e !== null);
  const after = settings.hooks.PostToolUse.length;
  if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  await writeSettings(settings);
  console.log(JSON.stringify({ status: 'uninstalled', removedEntries: before - after, settingsPath: SETTINGS_PATH }));
} else {
  console.error(`unknown mode: ${MODE}`);
  process.exit(1);
}
