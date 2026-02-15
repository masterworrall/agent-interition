/**
 * Training Step 2: Authenticate as an agent and write data to its Pod
 *
 * This demonstrates:
 *   1. Getting an authenticated fetch using client credentials
 *   2. Writing RDF (Linked Data) to the agent's Pod
 *   3. Reading it back to verify
 */
import { provisionAgent } from '../bootstrap/index.js';
import { getAuthenticatedFetch } from '../auth/index.js';

const SERVER_URL = 'http://localhost:3000';

async function main() {
  // --- Provision a fresh agent ---
  console.log('=== Step 2: Write Data to a Pod ===\n');
  console.log('Provisioning agent "carol"...');

  const carol = await provisionAgent({
    name: 'carol',
    displayName: 'Carol the Creator',
    serverUrl: SERVER_URL,
  });

  console.log(`Carol's WebID: ${carol.webId}\n`);

  // --- Get authenticated fetch ---
  // This exchanges client credentials for a Bearer token
  // The returned fetch function automatically adds the Authorization header
  console.log('Authenticating with client credentials...');

  const authFetch = await getAuthenticatedFetch(
    SERVER_URL,
    carol.clientCredentials.id,
    carol.clientCredentials.secret
  );

  console.log('Authenticated! Carol can now read/write her Pod.\n');

  // --- Write a Turtle document to the Pod ---
  // Turtle is a human-readable RDF format
  const noteContent = `
@prefix schema: <http://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#note1>
    a schema:TextDigitalDocument ;
    schema:name "My First Note" ;
    schema:text "Hello from Carol! This is data stored in my Solid Pod." ;
    schema:dateCreated "${new Date().toISOString()}"^^xsd:dateTime .
`;

  const noteUrl = `${carol.podUrl}shared/my-note.ttl`;
  console.log(`Writing note to: ${noteUrl}`);

  const writeResponse = await authFetch(noteUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: noteContent,
  });

  console.log(`Write response: ${writeResponse.status} ${writeResponse.statusText}\n`);

  // --- Read it back ---
  console.log('Reading the note back...');
  const readResponse = await authFetch(noteUrl);
  const body = await readResponse.text();

  console.log(`Read response: ${readResponse.status}`);
  console.log('Content:');
  console.log('---');
  console.log(body);
  console.log('---');
  console.log('\nCarol wrote Linked Data to her Pod and read it back!');
}

main().catch(console.error);
