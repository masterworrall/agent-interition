import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SKILL_SRC = join(import.meta.dirname, '..', '..', 'skill-src');

describe('SKILL.md validation', () => {
  const skillMdPath = join(SKILL_SRC, 'SKILL.md');
  const content = readFileSync(skillMdPath, 'utf-8');

  it('has YAML frontmatter', () => {
    expect(content.startsWith('---\n')).toBe(true);
    const endIdx = content.indexOf('---', 4);
    expect(endIdx).toBeGreaterThan(4);
  });

  it('has required frontmatter fields', () => {
    const endIdx = content.indexOf('---', 4);
    const frontmatter = content.slice(4, endIdx);

    expect(frontmatter).toContain('name:');
    expect(frontmatter).toContain('description:');
    expect(frontmatter).toContain('version:');
    expect(frontmatter).toContain('author:');
    expect(frontmatter).toContain('license:');
    expect(frontmatter).toContain('metadata:');
  });

  it('has metadata as single-line JSON', () => {
    const endIdx = content.indexOf('---', 4);
    const frontmatter = content.slice(4, endIdx);
    const metadataLine = frontmatter.split('\n').find((l) => l.startsWith('metadata:'));
    expect(metadataLine).toBeDefined();

    const jsonStr = metadataLine!.replace('metadata: ', '').replace('metadata:', '').trim();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.requires).toBeDefined();
    expect(parsed.requires.bins).toContain('node');
    expect(parsed.requires.bins).toContain('docker');
  });
});

describe('Shell scripts reference existing JS files', () => {
  const scripts = ['provision', 'read', 'write', 'grant-access', 'revoke-access', 'status'];

  for (const script of scripts) {
    it(`${script}.sh references dist/cli/${script}.js`, () => {
      const shPath = join(SKILL_SRC, 'scripts', `${script}.sh`);
      expect(existsSync(shPath)).toBe(true);

      const shContent = readFileSync(shPath, 'utf-8');
      expect(shContent).toContain(`dist/cli/${script}.js`);
    });
  }
});

describe('Required Skill files exist', () => {
  const requiredFiles = [
    'SKILL.md',
    'SECURITY.md',
    'scripts/provision.sh',
    'scripts/read.sh',
    'scripts/write.sh',
    'scripts/grant-access.sh',
    'scripts/revoke-access.sh',
    'scripts/status.sh',
    'references/solid-primer.md',
    'references/troubleshooting.md',
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(join(SKILL_SRC, file))).toBe(true);
    });
  }
});
