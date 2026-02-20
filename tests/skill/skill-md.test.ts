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

  it('documents get-token workflow', () => {
    expect(content).toContain('get-token.sh');
    expect(content).toContain('Authorization: Bearer');
  });

  it('documents token expiry', () => {
    expect(content).toContain('600 seconds');
    expect(content).toContain('8 minutes');
  });

  it('references solid-http-reference.md', () => {
    expect(content).toContain('references/solid-http-reference.md');
  });
});

describe('Shell scripts reference existing JS files', () => {
  const scripts = ['provision', 'get-token', 'deprovision', 'status'];

  for (const script of scripts) {
    it(`${script}.sh references dist/cli/${script}.js`, () => {
      const shPath = join(SKILL_SRC, 'scripts', `${script}.sh`);
      expect(existsSync(shPath)).toBe(true);

      const shContent = readFileSync(shPath, 'utf-8');
      expect(shContent).toContain(`dist/cli/${script}.js`);
    });
  }
});

describe('CRUD scripts are removed', () => {
  const removedScripts = ['read', 'write', 'grant-access', 'revoke-access'];

  for (const script of removedScripts) {
    it(`${script}.sh does not exist`, () => {
      const shPath = join(SKILL_SRC, 'scripts', `${script}.sh`);
      expect(existsSync(shPath)).toBe(false);
    });
  }
});

describe('Required Skill files exist', () => {
  const requiredFiles = [
    'SKILL.md',
    'SECURITY.md',
    'scripts/provision.sh',
    'scripts/get-token.sh',
    'scripts/deprovision.sh',
    'scripts/status.sh',
    'references/solid-primer.md',
    'references/troubleshooting.md',
    'references/solid-http-reference.md',
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(join(SKILL_SRC, file))).toBe(true);
    });
  }
});
