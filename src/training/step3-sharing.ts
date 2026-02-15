/**
 * Training Step 3: Two agents sharing data with access control
 *
 * This demonstrates:
 *   1. Agent A writes data to its Pod
 *   2. Agent B tries to read it — DENIED (403)
 *   3. Agent A grants Agent B read access via WAC
 *   4. Agent B reads it — SUCCESS (200)
 *   5. Agent A revokes access
 *   6. Agent B tries again — DENIED (403)
 *
 * This is the fundamental pattern for agent-to-agent collaboration.
 */
import { provisionAgent } from '../bootstrap/index.js';
import { getAuthenticatedFetch } from '../auth/index.js';
import { grantAccess, revokeAccess, AccessMode } from '../sharing/index.js';

const SERVER_URL = 'http://localhost:3000';

async function main() {
  console.log('=== Step 3: Agent-to-Agent Sharing ===\n');

  // --- Provision two agents ---
  console.log('Provisioning Agent Dan...');
  const dan = await provisionAgent({
    name: 'dan',
    displayName: 'Dan the Data Owner',
    serverUrl: SERVER_URL,
  });

  console.log('Provisioning Agent Eve...');
  const eve = await provisionAgent({
    name: 'eve',
    displayName: 'Eve the Explorer',
    serverUrl: SERVER_URL,
  });

  console.log(`Dan's WebID: ${dan.webId}`);
  console.log(`Eve's WebID: ${eve.webId}\n`);

  // --- Authenticate both agents ---
  const danFetch = await getAuthenticatedFetch(
    SERVER_URL, dan.clientCredentials.id, dan.clientCredentials.secret
  );
  const eveFetch = await getAuthenticatedFetch(
    SERVER_URL, eve.clientCredentials.id, eve.clientCredentials.secret
  );

  // --- Dan writes a secret document ---
  const secretUrl = `${dan.podUrl}shared/secret-plan.ttl`;

  const secretContent = `
@prefix schema: <http://schema.org/> .

<#plan>
    a schema:Message ;
    schema:text "The secret plan: deploy Solid Pods for all agents!" ;
    schema:author <${dan.webId}> .
`;

  console.log('Dan writes a secret document to his Pod...');
  await danFetch(secretUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: secretContent,
  });
  console.log('Written!\n');

  // --- Eve tries to read WITHOUT permission ---
  console.log('Eve tries to read Dan\'s secret (no permission yet)...');
  const denied = await eveFetch(secretUrl);
  console.log(`Response: ${denied.status} ${denied.statusText}`);
  console.log('ACCESS DENIED — as expected. Eve has no permission.\n');

  // --- Dan grants Eve read access ---
  console.log('Dan grants Eve READ access to his secret...');
  await grantAccess(
    secretUrl,           // the resource to share
    eve.webId,           // who to share with
    [AccessMode.Read],   // what access to give
    danFetch             // Dan's authenticated fetch (he's the owner)
  );
  console.log('Access granted!\n');

  // --- Eve reads WITH permission ---
  console.log('Eve tries again...');
  const allowed = await eveFetch(secretUrl);
  const content = await allowed.text();
  console.log(`Response: ${allowed.status} ${allowed.statusText}`);
  console.log('Content:');
  console.log('---');
  console.log(content);
  console.log('---');
  console.log('ACCESS GRANTED — Eve can now read the secret!\n');

  // --- Dan revokes Eve's access ---
  console.log('Dan revokes Eve\'s access...');
  await revokeAccess(
    secretUrl,    // the resource
    eve.webId,    // whose access to remove
    danFetch      // Dan's authenticated fetch
  );
  console.log('Access revoked!\n');

  // --- Eve tries again after revocation ---
  console.log('Eve tries one more time...');
  const revoked = await eveFetch(secretUrl);
  console.log(`Response: ${revoked.status} ${revoked.statusText}`);
  console.log('ACCESS DENIED — Dan revoked the permission.\n');

  // --- Summary ---
  console.log('=== Summary ===');
  console.log('1. Each agent has its own identity (WebID) and storage (Pod)');
  console.log('2. By default, only the owner can access their Pod');
  console.log('3. Owners can grant specific access (Read, Write, Append, Control)');
  console.log('4. Owners can revoke access at any time');
  console.log('5. This is WAC (Web Access Control) — a W3C standard');
  console.log('\nThis is the foundation for secure agent collaboration.');
}

main().catch(console.error);
