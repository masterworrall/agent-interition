/**
 * Training Step 1: Provision an agent programmatically
 *
 * This does the same thing as:
 *   npm run bootstrap -- --name bob --displayName "Bob the Builder"
 *
 * But now you can see every step in code.
 */
import { provisionAgent } from '../bootstrap/index.js';

const SERVER_URL = 'http://localhost:3000';

async function main() {
  console.log('=== Step 1: Provisioning Agent Bob ===\n');

  const bob = await provisionAgent({
    name: 'bob',
    displayName: 'Bob the Builder',
    serverUrl: SERVER_URL,
  });

  console.log('WebID:       ', bob.webId);
  console.log('Pod URL:     ', bob.podUrl);
  console.log('Credential ID:', bob.clientCredentials.id);
  console.log('Secret:       ', bob.clientCredentials.secret);
  console.log('\nBob now has:');
  console.log('  - A globally unique identity (WebID)');
  console.log('  - Personal storage (Pod) with memory/, shared/, conversations/');
  console.log('  - OAuth credentials to authenticate programmatically');

  return bob;
}

main().catch(console.error);
