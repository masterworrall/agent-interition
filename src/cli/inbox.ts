import { checkInbox, deleteNotification } from '../notifications/inbox.js';
import { getAuthenticatedFetch } from '../auth/client-credentials.js';
import { initStore, loadCredentials } from './credentials-store.js';
import { requireArg, getArg, getServerUrl, getPassphrase } from './args.js';

const agent = requireArg('agent', 'Usage: inbox --agent <name> [--delete <notificationUrl>]');
const deleteUrl = getArg('delete');
const serverUrl = getServerUrl();

initStore(getPassphrase());

(async () => {
  const creds = loadCredentials(agent);
  const authFetch = await getAuthenticatedFetch(serverUrl, creds.id, creds.secret);
  const inboxUrl = `${creds.podUrl}inbox/`;

  if (deleteUrl) {
    await deleteNotification(deleteUrl, authFetch);
    console.log(JSON.stringify({ status: 'ok', deleted: deleteUrl }));
  } else {
    const notifications = await checkInbox(inboxUrl, authFetch);
    console.log(JSON.stringify({ status: 'ok', agent, notifications }, null, 2));
  }
})().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message ?? err) }));
  process.exit(1);
});
