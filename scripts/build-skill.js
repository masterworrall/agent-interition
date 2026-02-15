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

// Copy compiled JS
cpSync(join(ROOT, 'dist'), join(SKILL_DIR, 'dist'), { recursive: true });

// Copy skill-src contents
cpSync(join(ROOT, 'skill-src'), SKILL_DIR, { recursive: true });

console.log('[build-skill] Skill package assembled at skill/solid-agent-storage/');
console.log('[build-skill] Contents:');
execSync(`find "${SKILL_DIR}" -type f | sort`, { stdio: 'inherit' });
