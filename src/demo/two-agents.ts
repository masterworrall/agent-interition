import { provisionAgent } from '../bootstrap/agent-provisioner.js';
import { getAuthenticatedFetch } from '../auth/client-credentials.js';
import { grantAccess, revokeAccess } from '../sharing/acl-manager.js';

const SERVER_URL = process.env.CSS_URL ?? 'http://localhost:3000';

async function main() {
  console.log('=== Solid Agent Pods Demo: Two Agents Sharing Data ===\n');

  // Step 1: Provision two agents
  console.log('--- Step 1: Provisioning Agent Alpha ---');
  const alpha = await provisionAgent({
    name: 'alpha',
    displayName: 'Agent Alpha',
    serverUrl: SERVER_URL,
    capabilities: ['memory', 'sharing'],
  });

  console.log('\n--- Step 1: Provisioning Agent Beta ---');
  const beta = await provisionAgent({
    name: 'beta',
    displayName: 'Agent Beta',
    serverUrl: SERVER_URL,
    capabilities: ['memory', 'sharing'],
  });

  // Get authenticated fetch for both agents
  const alphaFetch = await getAuthenticatedFetch(
    SERVER_URL,
    alpha.clientCredentials.id,
    alpha.clientCredentials.secret,
  );
  const betaFetch = await getAuthenticatedFetch(
    SERVER_URL,
    beta.clientCredentials.id,
    beta.clientCredentials.secret,
  );

  // Step 2: Alpha writes a greeting to /shared/
  console.log('\n--- Step 2: Alpha writes greeting to /shared/ ---');
  const greetingUrl = `${alpha.podUrl}shared/greeting.ttl`;
  const greetingTurtle = `
@prefix schema: <http://schema.org/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#greeting>
    a schema:Message;
    schema:text "Hello from Agent Alpha! This is a shared message.";
    schema:dateCreated "${new Date().toISOString()}"^^xsd:dateTime;
    schema:author <${alpha.webId}>.
`;

  const writeRes = await alphaFetch(greetingUrl, {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: greetingTurtle,
  });
  console.log(`  Write result: ${writeRes.status} ${writeRes.statusText}`);

  // Step 3: Beta tries to read — should fail (403)
  console.log('\n--- Step 3: Beta tries to read (no access) ---');
  const readRes1 = await betaFetch(greetingUrl);
  console.log(`  Read result: ${readRes1.status} ${readRes1.statusText}`);
  if (readRes1.status === 403 || readRes1.status === 401) {
    console.log('  ✓ Access correctly denied!');
  } else {
    console.log(`  ✗ Expected 403, got ${readRes1.status}`);
  }

  // Step 4: Alpha grants Beta read access via WAC
  console.log('\n--- Step 4: Alpha grants Beta read access ---');
  await grantAccess(greetingUrl, beta.webId, ['Read'], alphaFetch);
  console.log('  ✓ Access granted!');

  // Step 5: Beta reads — should succeed (200)
  console.log('\n--- Step 5: Beta reads (with access) ---');
  const readRes2 = await betaFetch(greetingUrl);
  console.log(`  Read result: ${readRes2.status} ${readRes2.statusText}`);
  if (readRes2.ok) {
    const content = await readRes2.text();
    console.log('  ✓ Content received:');
    console.log(`  ${content.trim().split('\n').join('\n  ')}`);
  } else {
    console.log(`  ✗ Expected 200, got ${readRes2.status}`);
  }

  // Step 6: Alpha revokes access
  console.log('\n--- Step 6: Alpha revokes Beta\'s access ---');
  await revokeAccess(greetingUrl, beta.webId, alphaFetch);
  console.log('  ✓ Access revoked!');

  // Step 7: Beta tries again — should fail (403)
  console.log('\n--- Step 7: Beta tries to read again (revoked) ---');
  const readRes3 = await betaFetch(greetingUrl);
  console.log(`  Read result: ${readRes3.status} ${readRes3.statusText}`);
  if (readRes3.status === 403 || readRes3.status === 401) {
    console.log('  ✓ Access correctly denied after revocation!');
  } else {
    console.log(`  ✗ Expected 403, got ${readRes3.status}`);
  }

  console.log('\n=== Demo Complete! ===');
  console.log(`\nAgent Alpha WebID: ${alpha.webId}`);
  console.log(`Agent Beta WebID:  ${beta.webId}`);
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
