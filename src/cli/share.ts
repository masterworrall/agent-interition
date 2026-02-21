import { shareResourceByName } from '../sharing/share.js';
import { getAuthenticatedFetch } from '../auth/client-credentials.js';
import { initStore, loadCredentials } from './credentials-store.js';
import { requireArg, getArg, getServerUrl, getPassphrase } from './args.js';
import { AccessMode } from '../sharing/types.js';

const agent = requireArg('agent', 'Usage: share --agent <sender> --resource <url> --with <recipientName> [--modes Read,Write]');
const resource = requireArg('resource', 'Usage: share --agent <sender> --resource <url> --with <recipientName> [--modes Read,Write]');
const recipientName = requireArg('with', 'Usage: share --agent <sender> --resource <url> --with <recipientName> [--modes Read,Write]');
const modesArg = getArg('modes') ?? 'Read';
const modes = modesArg.split(',').map((m) => m.trim()) as AccessMode[];
const serverUrl = getServerUrl();

initStore(getPassphrase());

(async () => {
  const creds = loadCredentials(agent);
  const authFetch = await getAuthenticatedFetch(serverUrl, creds.id, creds.secret);

  const result = await shareResourceByName(
    resource,
    recipientName,
    modes,
    creds.webId,
    serverUrl,
    authFetch,
  );

  console.log(JSON.stringify({ status: 'ok', agent, resource, recipient: recipientName, ...result }, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message ?? err) }));
  process.exit(1);
});
