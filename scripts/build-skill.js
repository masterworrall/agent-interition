import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKILL_DIR = join(ROOT, 'skill', 'solid-agent-storage');

console.log('[build-skill] Compiling TypeScript...');
execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });

console.log('[build-skill] Assembling Skill package...');

// Clean previous build
if (existsSync(SKILL_DIR)) {
  rmSync(SKILL_DIR, { recursive: true });
}
mkdirSync(SKILL_DIR, { recursive: true });

// Copy only the dist directories the Skill needs at runtime
const skillDirs = ['cli', 'auth', 'bootstrap'];
for (const dir of skillDirs) {
  cpSync(join(ROOT, 'dist', dir), join(SKILL_DIR, 'dist', dir), { recursive: true });
}
// Copy top-level index (re-exports)
for (const ext of ['.js', '.d.ts', '.js.map']) {
  const name = `index${ext}`;
  const src = join(ROOT, 'dist', name);
  if (existsSync(src)) {
    cpSync(src, join(SKILL_DIR, 'dist', name));
  }
}

// Remove Phase 1 CLI (bootstrap/cli.*) — not used by the Skill
for (const ext of ['.js', '.d.ts', '.js.map']) {
  const file = join(SKILL_DIR, 'dist', 'bootstrap', `cli${ext}`);
  if (existsSync(file)) rmSync(file);
}

// Copy skill-src contents
cpSync(join(ROOT, 'skill-src'), SKILL_DIR, { recursive: true });

// Remove .js.map files — ClawHub only accepts text files
execSync(`find "${SKILL_DIR}" -name "*.js.map" -delete`);

console.log('[build-skill] Skill package assembled at skill/solid-agent-storage/');
console.log('[build-skill] Contents:');
execSync(`find "${SKILL_DIR}" -type f | sort`, { stdio: 'inherit' });
