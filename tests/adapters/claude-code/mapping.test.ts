import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  serializeFrontmatter,
  defaultStandardTypeFor,
  claudeCodeTypeFor,
  localFilenameFor,
  isClaudeCodeType,
} from '../../../src/adapters/claude-code/mapping.js';
import {
  Identity,
  Preference,
  Procedure,
  Reference,
  Episode,
} from '../../../src/memory/index.js';

describe('parseFrontmatter', () => {
  it('parses a minimal feedback file', () => {
    const input = `---\nname: Foo\ndescription: Bar\ntype: feedback\n---\nbody here\n`;
    const { frontmatter, body } = parseFrontmatter(input);
    expect(frontmatter.name).toBe('Foo');
    expect(frontmatter.description).toBe('Bar');
    expect(frontmatter.type).toBe('feedback');
    expect(body).toBe('body here\n');
  });

  it('preserves additional frontmatter keys', () => {
    const input = `---\nname: F\ndescription: D\ntype: project\noriginSessionId: abc-123\n---\n\nbody\n`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.originSessionId).toBe('abc-123');
  });

  it('strips quoted scalars', () => {
    const input = `---\nname: "quoted name"\ndescription: 'single'\ntype: user\n---\nbody\n`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.name).toBe('quoted name');
    expect(frontmatter.description).toBe('single');
  });

  it('rejects missing required keys', () => {
    const input = `---\nname: F\ntype: feedback\n---\nbody\n`;
    expect(() => parseFrontmatter(input)).toThrow(/missing required keys/);
  });

  it('rejects unknown type', () => {
    const input = `---\nname: F\ndescription: D\ntype: bogus\n---\nbody\n`;
    expect(() => parseFrontmatter(input)).toThrow(/Unknown Claude Code memory type/);
  });

  it('rejects file without frontmatter', () => {
    expect(() => parseFrontmatter('just some markdown')).toThrow(/does not start with YAML frontmatter/);
  });

  it('rejects unterminated frontmatter', () => {
    expect(() => parseFrontmatter('---\nname: x\n')).toThrow(/Unterminated/);
  });

  it('parses multi-paragraph bodies verbatim', () => {
    const body = 'first paragraph\n\nsecond paragraph\n\n- bullet';
    const input = `---\nname: F\ndescription: D\ntype: feedback\n---\n${body}`;
    expect(parseFrontmatter(input).body).toBe(body);
  });
});

describe('serializeFrontmatter', () => {
  it('round-trips with parseFrontmatter', () => {
    const original = parseFrontmatter(
      `---\nname: Foo\ndescription: Bar baz\ntype: feedback\noriginSessionId: abc\n---\nbody one\n\nbody two\n`,
    );
    const serialized = serializeFrontmatter(original);
    const reparsed = parseFrontmatter(serialized);
    expect(reparsed.frontmatter).toEqual(original.frontmatter);
    expect(reparsed.body).toBe(original.body);
  });

  it('quotes scalars containing special YAML characters', () => {
    const out = serializeFrontmatter({
      frontmatter: {
        name: 'has: colon',
        description: 'plain',
        type: 'feedback',
      },
      body: 'b',
    });
    expect(out).toContain('name: "has: colon"');
  });
});

describe('defaultStandardTypeFor', () => {
  it('maps user → Preference (facts about the human user, NOT agent Identity)', () => {
    expect(defaultStandardTypeFor('user', false)).toBe(Preference);
  });
  it('maps feedback → Preference', () => {
    expect(defaultStandardTypeFor('feedback', false)).toBe(Preference);
  });
  it('maps project → Episode', () => {
    expect(defaultStandardTypeFor('project', false)).toBe(Episode);
  });
  it('maps reference → Reference when authoritative source present', () => {
    expect(defaultStandardTypeFor('reference', true)).toBe(Reference);
  });
  it('maps reference → Procedure without authoritative source', () => {
    expect(defaultStandardTypeFor('reference', false)).toBe(Procedure);
  });
});

describe('claudeCodeTypeFor', () => {
  it('Identity → user', () => expect(claudeCodeTypeFor(Identity)).toBe('user'));
  it('Preference → feedback', () => expect(claudeCodeTypeFor(Preference)).toBe('feedback'));
  it('Procedure → reference (best-fit collapse)', () => expect(claudeCodeTypeFor(Procedure)).toBe('reference'));
  it('Reference → reference', () => expect(claudeCodeTypeFor(Reference)).toBe('reference'));
  it('Episode → project', () => expect(claudeCodeTypeFor(Episode)).toBe('project'));
});

describe('localFilenameFor', () => {
  it('prefixes the slug with the Claude Code type', () => {
    expect(localFilenameFor(Preference, 'rdf-tooling')).toBe('feedback_rdf-tooling.md');
    expect(localFilenameFor(Reference, 'work-records')).toBe('reference_work-records.md');
    expect(localFilenameFor(Episode, '2026-04-30-source-bypass')).toBe('project_2026-04-30-source-bypass.md');
    expect(localFilenameFor(Identity, 'two')).toBe('user_two.md');
    expect(localFilenameFor(Procedure, 'css-config')).toBe('reference_css-config.md');
  });
});

describe('isClaudeCodeType', () => {
  it('accepts the four canonical types', () => {
    for (const t of ['user', 'feedback', 'project', 'reference']) {
      expect(isClaudeCodeType(t)).toBe(true);
    }
  });
  it('rejects other strings', () => {
    expect(isClaudeCodeType('preference')).toBe(false);
    expect(isClaudeCodeType('')).toBe(false);
  });
});
