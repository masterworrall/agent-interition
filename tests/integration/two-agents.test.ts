import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Integration test: Full two-agent sharing flow.
 * Requires CSS running on localhost:3000.
 *
 * Run with: CSS_URL=http://localhost:3000 npm test -- tests/integration/
 *
 * This test is skipped by default unless CSS_URL is set.
 */

const CSS_URL = process.env.CSS_URL;

const describeIntegration = CSS_URL ? describe : describe.skip;

describeIntegration('Two agents sharing data (integration)', () => {
  let alpha: { webId: string; podUrl: string; clientCredentials: { id: string; secret: string } };
  let beta: { webId: string; podUrl: string; clientCredentials: { id: string; secret: string } };
  let alphaFetch: typeof fetch;
  let betaFetch: typeof fetch;

  beforeAll(async () => {
    const { provisionAgent } = await import('../../src/bootstrap/agent-provisioner.js');
    const { getAuthenticatedFetch } = await import('../../src/auth/client-credentials.js');

    const suffix = Date.now().toString(36);

    alpha = await provisionAgent({
      name: `alpha-${suffix}`,
      displayName: 'Agent Alpha',
      serverUrl: CSS_URL!,
    });

    beta = await provisionAgent({
      name: `beta-${suffix}`,
      displayName: 'Agent Beta',
      serverUrl: CSS_URL!,
    });

    alphaFetch = await getAuthenticatedFetch(CSS_URL!, alpha.clientCredentials.id, alpha.clientCredentials.secret);
    betaFetch = await getAuthenticatedFetch(CSS_URL!, beta.clientCredentials.id, beta.clientCredentials.secret);
  });

  it('Alpha can write to own pod', async () => {
    const greetingUrl = `${alpha.podUrl}shared/greeting.ttl`;
    const res = await alphaFetch(greetingUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/turtle' },
      body: `<#greeting> <http://schema.org/text> "Hello from Alpha".`,
    });
    expect(res.status).toBeLessThan(300);
  });

  it('Beta cannot read Alpha\'s resource without permission', async () => {
    const greetingUrl = `${alpha.podUrl}shared/greeting.ttl`;
    const res = await betaFetch(greetingUrl);
    expect([401, 403]).toContain(res.status);
  });

  it('Beta can read after Alpha grants access', async () => {
    const { grantAccess } = await import('../../src/sharing/acl-manager.js');
    const greetingUrl = `${alpha.podUrl}shared/greeting.ttl`;

    await grantAccess(greetingUrl, beta.webId, ['Read'], alphaFetch);

    const res = await betaFetch(greetingUrl);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Hello from Alpha');
  });

  it('Beta cannot read after Alpha revokes access', async () => {
    const { revokeAccess } = await import('../../src/sharing/acl-manager.js');
    const greetingUrl = `${alpha.podUrl}shared/greeting.ttl`;

    await revokeAccess(greetingUrl, beta.webId, alphaFetch);

    const res = await betaFetch(greetingUrl);
    expect([401, 403]).toContain(res.status);
  });
});
