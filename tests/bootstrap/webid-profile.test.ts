import { describe, it, expect } from 'vitest';
import { buildProfilePatch } from '../../src/bootstrap/webid-profile.js';

describe('buildProfilePatch', () => {
  const webId = 'http://localhost:3000/alpha/profile/card#me';

  it('generates valid SPARQL UPDATE with agent metadata', () => {
    const patch = buildProfilePatch({
      name: 'alpha',
      displayName: 'Agent Alpha',
      serverUrl: 'http://localhost:3000',
    }, webId);

    expect(patch).toContain('PREFIX foaf:');
    expect(patch).toContain('PREFIX interition:');
    expect(patch).toContain('INSERT DATA');
    expect(patch).toContain('interition:Agent');
    expect(patch).toContain('foaf:Agent');
    expect(patch).toContain('"Agent Alpha"');
    expect(patch).toContain('"alpha"');
    expect(patch).toContain(`<${webId}>`);
  });

  it('includes capabilities when provided', () => {
    const patch = buildProfilePatch({
      name: 'beta',
      displayName: 'Agent Beta',
      serverUrl: 'http://localhost:3000',
      capabilities: ['memory', 'sharing'],
    }, 'http://localhost:3000/beta/profile/card#me');

    expect(patch).toContain('interition:capability "memory"');
    expect(patch).toContain('interition:capability "sharing"');
  });

  it('escapes special characters in display name', () => {
    const patch = buildProfilePatch({
      name: 'test',
      displayName: 'Agent "Test" \\Special',
      serverUrl: 'http://localhost:3000',
    }, 'http://localhost:3000/test/profile/card#me');

    expect(patch).toContain('Agent \\"Test\\" \\\\Special');
  });
});
