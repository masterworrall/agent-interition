/**
 * Training Step 4: Understanding WAC Access Modes
 *
 * WAC (Web Access Control) has four permission levels:
 *   - Read:    Can read the resource
 *   - Write:   Can overwrite the resource
 *   - Append:  Can add to the resource (but not overwrite)
 *   - Control: Can modify the ACL (permissions) of the resource
 *
 * This script demonstrates granting Write access so another agent
 * can collaborate by modifying shared data.
 */
import { provisionAgent } from '../bootstrap/index.js';
import { getAuthenticatedFetch } from '../auth/index.js';
import { grantAccess, revokeAccess } from '../sharing/index.js';
import type { AccessMode } from '../sharing/index.js';

const SERVER_URL = 'http://localhost:3000';

async function main() {
  console.log('=== Step 4: Access Modes Deep Dive ===\n');

  // --- Provision two agents ---
  const frank = await provisionAgent({
    name: 'frank', displayName: 'Frank', serverUrl: SERVER_URL,
  });
  const grace = await provisionAgent({
    name: 'grace', displayName: 'Grace', serverUrl: SERVER_URL,
  });

  const frankFetch = await getAuthenticatedFetch(
    SERVER_URL, frank.clientCredentials.id, frank.clientCredentials.secret
  );
  const graceFetch = await getAuthenticatedFetch(
    SERVER_URL, grace.clientCredentials.id, grace.clientCredentials.secret
  );

  // --- Frank creates a collaborative document ---
  const docUrl = `${frank.podUrl}shared/collab-doc.ttl`;

  await frankFetch(docUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: `
@prefix schema: <http://schema.org/> .
<#doc> a schema:TextDigitalDocument ;
    schema:name "Collaboration Document" ;
    schema:text "Frank started this document." .
`,
  });
  console.log('Frank created a collaborative document.\n');

  // --- Grant Read + Write access ---
  console.log('Frank grants Grace READ + WRITE access...');
  await grantAccess(
    docUrl,
    grace.webId,
    ['Read', 'Write'] as AccessMode[],
    frankFetch,
    frank.webId  // owner WebID — ensures Frank keeps access
  );
  console.log('Granted!\n');

  // --- Grace reads the document ---
  console.log('Grace reads the document:');
  const readRes = await graceFetch(docUrl);
  console.log(await readRes.text());

  // --- Grace overwrites with her changes ---
  console.log('Grace updates the document...');
  const updateRes = await graceFetch(docUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: `
@prefix schema: <http://schema.org/> .
<#doc> a schema:TextDigitalDocument ;
    schema:name "Collaboration Document" ;
    schema:text "Grace updated this document! Frank started it, Grace improved it." .
`,
  });
  console.log(`Update response: ${updateRes.status} ${updateRes.statusText}\n`);

  // --- Frank reads Grace's changes ---
  console.log('Frank reads the updated document:');
  const frankRead = await frankFetch(docUrl);
  console.log(await frankRead.text());

  // --- Clean up ---
  console.log('Frank revokes Grace\'s access...');
  await revokeAccess(docUrl, grace.webId, frankFetch);
  console.log('Revoked.\n');

  console.log('=== Access Modes Reference ===');
  console.log('  Read    — GET requests (view data)');
  console.log('  Write   — PUT/DELETE requests (modify/remove data)');
  console.log('  Append  — POST requests (add data, cannot overwrite)');
  console.log('  Control — modify .acl files (manage permissions)');
  console.log('\nCombine modes for fine-grained access control.');
}

main().catch(console.error);
