import { describe, it, expect, vi } from 'vitest';
import { grantAccess, revokeAccess } from '../../src/sharing/acl-manager.js';

describe('grantAccess', () => {
  it('creates an ACL rule for the given agent', async () => {
    let savedAcl = '';
    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { link: '<http://localhost:3000/resource.acl>; rel="acl"' },
        });
      }
      if (urlStr.endsWith('.acl') && !init?.method) {
        return new Response(null, { status: 404 });
      }
      if (urlStr.endsWith('.acl') && init?.method === 'PUT') {
        savedAcl = init.body as string;
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await grantAccess(
      'http://localhost:3000/resource',
      'http://localhost:3000/agents/beta/profile/card#me',
      ['Read'],
      mockFetch,
    );

    expect(savedAcl).toContain('acl:agent <http://localhost:3000/agents/beta/profile/card#me>');
    expect(savedAcl).toContain('acl:Read');
    expect(savedAcl).toContain('acl:accessTo <http://localhost:3000/resource>');
  });
});

describe('revokeAccess', () => {
  it('removes the agent rule from the ACL', async () => {
    let savedAcl = '';
    const existingAcl = `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#owner>
    a acl:Authorization;
    acl:agent <http://localhost:3000/agents/alpha/profile/card#me>;
    acl:accessTo <http://localhost:3000/resource>;
    acl:mode acl:Read, acl:Write, acl:Control.

<#agent-http___localhost_3000_agents_beta_profile_card_me>
    a acl:Authorization;
    acl:agent <http://localhost:3000/agents/beta/profile/card#me>;
    acl:accessTo <http://localhost:3000/resource>;
    acl:mode acl:Read.
`;

    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { link: '<http://localhost:3000/resource.acl>; rel="acl"' },
        });
      }
      if (urlStr.endsWith('.acl') && !init?.method) {
        return new Response(existingAcl, { status: 200 });
      }
      if (urlStr.endsWith('.acl') && init?.method === 'PUT') {
        savedAcl = init.body as string;
        return new Response(null, { status: 205 });
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await revokeAccess(
      'http://localhost:3000/resource',
      'http://localhost:3000/agents/beta/profile/card#me',
      mockFetch,
    );

    expect(savedAcl).toContain('#owner');
    expect(savedAcl).not.toContain('agents/beta/profile/card#me');
  });
});
