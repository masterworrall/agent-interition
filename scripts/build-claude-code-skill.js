#!/usr/bin/env node
/**
 * Build a self-contained Claude Code skill bundle from source under
 *   claude-code-skill/<name>/
 * to
 *   claude-code-skill-build/<name>/
 *
 * Bundles the CLI entry points (src/cli/*.ts) into single-file JS via esbuild
 * so the skill is independent of agent-interition's filesystem layout once
 * installed at ~/.claude/skills/<name>/.
 *
 * Usage:
 *   node scripts/build-claude-code-skill.js [--skill <name>]
 *   node scripts/build-claude-code-skill.js --skill solid-webid-pod
 *   node scripts/build-claude-code-skill.js              (build all skills)
 *   node scripts/build-claude-code-skill.js --install    (also copy to ~/.claude/skills)
 */

import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(REPO_ROOT, 'claude-code-skill');
const OUT_ROOT = path.join(REPO_ROOT, 'claude-code-skill-build');
const INSTALL_ROOT = path.join(os.homedir(), '.claude', 'skills');

// Per-skill manifest: which CLI entry points to bundle into bin/.
const SKILLS = {
  'solid-webid-pod': {
    entries: {
      'provision.js': 'src/cli/provision.ts',
      'deprovision.js': 'src/cli/deprovision.ts',
      'get-token.js': 'src/cli/get-token.ts',
      'status.js': 'src/cli/status.ts',
      'copy-login.js': 'src/cli/copy-login.ts',
      'set-password.js': 'src/cli/set-password.ts',
    },
  },
  'solid-context-memory': {
    entries: {
      'memory-bridge.js': 'src/adapters/claude-code/cli.ts',
      'hook.js': 'src/adapters/claude-code/hook.ts',
    },
  },
};

const args = process.argv.slice(2);
const targetSkill = args.includes('--skill') ? args[args.indexOf('--skill') + 1] : null;
const installAfter = args.includes('--install');

const skillsToBuild = targetSkill ? [targetSkill] : Object.keys(SKILLS);

for (const name of skillsToBuild) {
  if (!SKILLS[name]) {
    console.error(`unknown skill: ${name}`);
    console.error(`available: ${Object.keys(SKILLS).join(', ')}`);
    process.exit(1);
  }
  await buildSkill(name);
  if (installAfter) await installSkill(name);
}

console.log(installAfter ? '\nbuild + install complete.' : '\nbuild complete. use --install to copy to ~/.claude/skills/.');

async function buildSkill(name) {
  console.log(`\n[build] ${name}`);
  const src = path.join(SRC_ROOT, name);
  const out = path.join(OUT_ROOT, name);

  // Verify source layout
  await fs.access(path.join(src, 'SKILL.md'));

  // Reset output
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(path.join(out, 'bin'), { recursive: true });

  // Bundle each CLI entry into bin/
  const { entries } = SKILLS[name];
  for (const [outFile, srcEntry] of Object.entries(entries)) {
    const entryPath = path.join(REPO_ROOT, srcEntry);
    const outPath = path.join(out, 'bin', outFile);
    await build({
      entryPoints: [entryPath],
      outfile: outPath,
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      banner: {
        js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
      },
      // Inrupt libs are unused at runtime in the CLIs we ship — keep the
      // bundle small by leaving them external (they'd be loaded only if
      // touched, and they aren't here).
      external: ['@inrupt/solid-client', '@inrupt/solid-client-authn-node', '@solid/community-server'],
      logLevel: 'warning',
    });
    await fs.chmod(outPath, 0o755);
    const { size } = await fs.stat(outPath);
    console.log(`  bundled bin/${outFile} (${(size / 1024).toFixed(1)} KB)`);
  }

  // Copy SKILL.md, scripts/, references/ verbatim
  await copyTree(src, out, ['SKILL.md', 'scripts', 'references']);

  // Mark scripts executable
  const scriptsDir = path.join(out, 'scripts');
  try {
    const entries = await fs.readdir(scriptsDir);
    for (const f of entries) {
      if (f.endsWith('.sh')) await fs.chmod(path.join(scriptsDir, f), 0o755);
    }
  } catch {
    // No scripts dir — that's fine for skills that have none
  }

  console.log(`[done] ${name} → ${path.relative(REPO_ROOT, out)}`);
}

async function copyTree(src, dst, items) {
  for (const item of items) {
    const srcPath = path.join(src, item);
    const dstPath = path.join(dst, item);
    try {
      const stat = await fs.stat(srcPath);
      if (stat.isDirectory()) {
        await fs.cp(srcPath, dstPath, { recursive: true });
      } else {
        await fs.cp(srcPath, dstPath);
      }
    } catch (err) {
      if (err.code === 'ENOENT') continue; // optional item missing
      throw err;
    }
  }
}

async function installSkill(name) {
  const src = path.join(OUT_ROOT, name);
  const dst = path.join(INSTALL_ROOT, name);
  await fs.mkdir(INSTALL_ROOT, { recursive: true });
  await fs.rm(dst, { recursive: true, force: true });
  await fs.cp(src, dst, { recursive: true });
  console.log(`[install] ${name} → ${dst}`);
}
