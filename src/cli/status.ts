import { initStore, listCredentials, loadCredentials } from './credentials-store.js';
import { getPassphrase } from './args.js';

initStore(getPassphrase());

const credentials = listCredentials();

const result = credentials.map(({ name, server }) => {
  try {
    if (server === '(legacy)') {
      // Legacy credentials — need a serverUrl to load; use podUrl from the credential itself
      // We can't load without a serverUrl, so report what we know
      return { name, server, note: 'Legacy format — re-provision to migrate' };
    }
    // Reconstruct a URL from the server key for loading
    // serverKey format: "hostname" or "hostname_port"
    const parts = server.split('_');
    const port = parts.length > 1 ? parts[parts.length - 1] : null;
    const hostname = port ? parts.slice(0, -1).join('_') : server;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const protocol = isLocalhost ? 'http' : 'https';
    const serverUrl = port ? `${protocol}://${hostname}:${port}` : `${protocol}://${hostname}`;

    const creds = loadCredentials(name, serverUrl);
    return { name, server: serverUrl, webId: creds.webId, podUrl: creds.podUrl };
  } catch {
    return { name, server, error: 'Could not decrypt credentials' };
  }
});

console.log(JSON.stringify({ status: 'ok', agents: result }, null, 2));
