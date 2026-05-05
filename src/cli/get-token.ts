import dns from 'node:dns';
import { initStore, loadCredentials, discoverAgentServer } from './credentials-store.js';
import { requireArg, getArg, getPassphrase } from './args.js';

dns.setDefaultResultOrder('ipv4first');

const agent = requireArg('agent', 'Usage: get-token --agent <name> [--serverUrl <url>]');

initStore(getPassphrase());

// Server-URL resolution chain:
//   SOLID_SERVER_URL env  →  --serverUrl/--server-url flag  →  discover from store.
// If discovery finds zero or more than one server for this agent, the helper
// throws with a clear message — no silent default to crawlout.io.
function resolveServerUrl(agentName: string): string {
  return (
    process.env.SOLID_SERVER_URL ??
    getArg('serverUrl') ??
    getArg('server-url') ??
    discoverAgentServer(agentName)
  );
}

let serverUrl: string;
try {
  serverUrl = resolveServerUrl(agent);
} catch (err) {
  console.error(JSON.stringify({ error: (err as Error).message }));
  process.exit(2);
}

(async () => {
  const creds = loadCredentials(agent, serverUrl);

  const tokenUrl = `${serverUrl}/.oidc/token`;
  const authString = Buffer.from(`${creds.id}:${creds.secret}`).toString('base64');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      authorization: `Basic ${authString}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'webid',
    }),
  });

  if (!res.ok) {
    console.error(JSON.stringify({ error: `Token request failed: ${res.status} ${await res.text()}` }));
    process.exit(1);
  }

  const json = await res.json() as { access_token: string; expires_in: number };

  console.log(JSON.stringify({
    token: json.access_token,
    expiresIn: json.expires_in,
    serverUrl,
    podUrl: creds.podUrl,
    webId: creds.webId,
  }));
})().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message ?? err) }));
  process.exit(1);
});
