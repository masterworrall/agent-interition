import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Integration test: Full discovery & sharing protocol flow.
 * Requires CSS running on localhost:3000.
 *
 * Run with: CSS_URL=http://localhost:3000 npm test -- tests/integration/sharing-protocol
 *
 * This test is skipped by default unless CSS_URL is set.
 *
 * Flow:
 *   1. Provision two agents (auto-registers in directory)
 *   2. Discover Agent Beta via directory
 *   3. Alpha writes a resource
 *   4. Alpha shares resource with Beta (grant + notify)
 *   5. Beta checks inbox, finds notification
 *   6. Beta accesses the shared resource
 *   7. Beta deletes processed notification
 *   8. Alpha revokes access
 *   9. Beta can no longer access the resource
 */

const CSS_URL = process.env.CSS_URL;

const describeIntegration = CSS_URL ? describe : describe.skip;

describeIntegration('Agent Discovery & Sharing Protocol (integration)', () => {
  let alpha: { webId: string; podUrl: string; clientCredentials: { id: string; secret: string } };
  let beta: { webId: string; podUrl: string; clientCredentials: { id: string; secret: string } };
  let alphaFetch: typeof fetch;
  let betaFetch: typeof fetch;
  let suffix: string;

  beforeAll(async () => {
    const { provisionAgent } = await import('../../src/bootstrap/agent-provisioner.js');
    const { getAuthenticatedFetch } = await import('../../src/auth/client-credentials.js');

    suffix = Date.now().toString(36);

    alpha = await provisionAgent({
      name: `alice-${suffix}`,
      displayName: `Alice-${suffix}`,
      serverUrl: CSS_URL!,
      capabilities: ['research', 'analysis'],
    });

    beta = await provisionAgent({
      name: `bob-${suffix}`,
      displayName: `Bob-${suffix}`,
      serverUrl: CSS_URL!,
      capabilities: ['coding'],
    });

    alphaFetch = await getAuthenticatedFetch(CSS_URL!, alpha.clientCredentials.id, alpha.clientCredentials.secret);
    betaFetch = await getAuthenticatedFetch(CSS_URL!, beta.clientCredentials.id, beta.clientCredentials.secret);
  });

  it('1. Both agents appear in the directory', async () => {
    const { listAgents } = await import('../../src/discovery/directory.js');
    const agents = await listAgents(CSS_URL!, alphaFetch);

    const alice = agents.find((a) => a.name === `Alice-${suffix}`);
    const bob = agents.find((a) => a.name === `Bob-${suffix}`);

    expect(alice).toBeDefined();
    expect(alice!.webId).toBe(alpha.webId);
    expect(alice!.capabilities).toContain('research');

    expect(bob).toBeDefined();
    expect(bob!.webId).toBe(beta.webId);
  });

  it('2. Can discover Agent Bob by name', async () => {
    const { findAgentByName } = await import('../../src/discovery/directory.js');
    const bob = await findAgentByName(CSS_URL!, `Bob-${suffix}`, alphaFetch);

    expect(bob).toBeDefined();
    expect(bob!.webId).toBe(beta.webId);
    expect(bob!.podUrl).toBe(beta.podUrl);
  });

  it('3. Can discover agents by capability', async () => {
    const { findAgentsByCapability } = await import('../../src/discovery/directory.js');
    const researchers = await findAgentsByCapability(CSS_URL!, 'research', alphaFetch);

    expect(researchers.length).toBeGreaterThanOrEqual(1);
    expect(researchers.some((a) => a.name === `Alice-${suffix}`)).toBe(true);
  });

  it('4. Alpha writes a resource to share', async () => {
    const resourceUrl = `${alpha.podUrl}shared/findings.ttl`;
    const res = await alphaFetch(resourceUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/turtle' },
      body: `<#finding> <http://schema.org/text> "Important research finding".`,
    });
    expect(res.status).toBeLessThan(300);
  });

  it('5. Alpha shares resource with Bob (grant + notify)', async () => {
    const { shareResource } = await import('../../src/sharing/share.js');
    const resourceUrl = `${alpha.podUrl}shared/findings.ttl`;
    const inboxUrl = `${beta.podUrl}inbox/`;

    const result = await shareResource(
      resourceUrl,
      beta.webId,
      inboxUrl,
      ['Read'],
      alpha.webId,
      alphaFetch,
    );

    expect(result.granted).toBe(true);
    expect(result.notified).toBe(true);
    expect(result.notificationUrl).toBeDefined();
  });

  it('6. Bob checks inbox and finds the notification', async () => {
    const { checkInbox } = await import('../../src/notifications/inbox.js');
    const inboxUrl = `${beta.podUrl}inbox/`;

    const notifications = await checkInbox(inboxUrl, betaFetch);
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    const relevant = notifications.find((n) => n.resourceUrl === `${alpha.podUrl}shared/findings.ttl`);
    expect(relevant).toBeDefined();
    expect(relevant!.actor).toBe(alpha.webId);
  });

  it('7. Bob accesses the shared resource', async () => {
    const resourceUrl = `${alpha.podUrl}shared/findings.ttl`;
    const res = await betaFetch(resourceUrl);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Important research finding');
  });

  it('8. Bob deletes processed notification', async () => {
    const { checkInbox, deleteNotification } = await import('../../src/notifications/inbox.js');
    const inboxUrl = `${beta.podUrl}inbox/`;

    const notifications = await checkInbox(inboxUrl, betaFetch);
    const relevant = notifications.find((n) => n.resourceUrl === `${alpha.podUrl}shared/findings.ttl`);
    expect(relevant).toBeDefined();

    await deleteNotification(relevant!.id, betaFetch);

    // Verify it's gone
    const after = await checkInbox(inboxUrl, betaFetch);
    const stillThere = after.find((n) => n.id === relevant!.id);
    expect(stillThere).toBeUndefined();
  });

  it('9. Alpha revokes access, Bob can no longer read', async () => {
    const { revokeAccess } = await import('../../src/sharing/acl-manager.js');
    const resourceUrl = `${alpha.podUrl}shared/findings.ttl`;

    await revokeAccess(resourceUrl, beta.webId, alphaFetch);

    const res = await betaFetch(resourceUrl);
    expect([401, 403]).toContain(res.status);
  });
});
