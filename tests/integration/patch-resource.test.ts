import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Integration test: SPARQL Update PATCH semantics on a Solid resource.
 * Requires CSS running on localhost:3000.
 *
 * Run with: CSS_URL=http://localhost:3000 npm test -- tests/integration/patch-resource
 *
 * Skipped by default unless CSS_URL is set. Verifies A146 — that PATCH
 * with application/sparql-update is surgical (preserves untouched triples).
 */

const CSS_URL = process.env.CSS_URL;
const describeIntegration = CSS_URL ? describe : describe.skip;

describeIntegration('PATCH with SPARQL Update (A146)', () => {
  let agentFetch: typeof fetch;
  let resourceUrl: string;

  beforeAll(async () => {
    const { provisionAgent } = await import('../../src/bootstrap/agent-provisioner.js');
    const { getAuthenticatedFetch } = await import('../../src/auth/client-credentials.js');

    const suffix = Date.now().toString(36);
    const agent = await provisionAgent({
      name: `patch-test-${suffix}`,
      displayName: 'Patch Test Agent',
      serverUrl: CSS_URL!,
    });

    agentFetch = await getAuthenticatedFetch(
      CSS_URL!,
      agent.clientCredentials.id,
      agent.clientCredentials.secret,
    );

    resourceUrl = `${agent.podUrl}scratch/patch-test.ttl`;

    const initial = `@prefix schema: <http://schema.org/> .
<#test>
  schema:name "initial" ;
  schema:description "test resource" ;
  schema:identifier "patch-test-001" .`;

    const put = await agentFetch(resourceUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/turtle' },
      body: initial,
    });
    expect(put.status).toBeLessThan(300);
  });

  it('INSERT DATA preserves existing triples and adds new ones', async () => {
    const insert = `PREFIX schema: <http://schema.org/>
INSERT DATA {
  <#test> schema:keywords "patch-test" .
}`;

    const resp = await agentFetch(resourceUrl, {
      method: 'PATCH',
      headers: { 'content-type': 'application/sparql-update' },
      body: insert,
    });
    expect(resp.status).toBeLessThan(300);

    const body = await (await agentFetch(resourceUrl)).text();
    expect(body).toContain('schema:name "initial"');
    expect(body).toContain('schema:description "test resource"');
    expect(body).toContain('schema:identifier "patch-test-001"');
    expect(body).toContain('schema:keywords "patch-test"');
  });

  it('DELETE DATA + INSERT DATA changes one triple, preserves others', async () => {
    const update = `PREFIX schema: <http://schema.org/>
DELETE DATA { <#test> schema:name "initial" . } ;
INSERT DATA { <#test> schema:name "patched" . }`;

    const resp = await agentFetch(resourceUrl, {
      method: 'PATCH',
      headers: { 'content-type': 'application/sparql-update' },
      body: update,
    });
    expect(resp.status).toBeLessThan(300);

    const body = await (await agentFetch(resourceUrl)).text();
    expect(body).toContain('schema:name "patched"');
    expect(body).not.toContain('schema:name "initial"');
    expect(body).toContain('schema:description "test resource"');
    expect(body).toContain('schema:identifier "patch-test-001"');
    expect(body).toContain('schema:keywords "patch-test"');
  });

  it('PATCH on non-existent resource returns an error status', async () => {
    const ghostUrl = resourceUrl.replace('patch-test.ttl', 'does-not-exist.ttl');
    const update = `PREFIX schema: <http://schema.org/>
INSERT DATA { <#test> schema:name "ghost" . }`;

    const resp = await agentFetch(ghostUrl, {
      method: 'PATCH',
      headers: { 'content-type': 'application/sparql-update' },
      body: update,
    });
    expect(resp.status).toBeGreaterThanOrEqual(400);
  });
});
