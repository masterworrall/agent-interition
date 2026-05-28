import { spawn, spawnSync } from 'node:child_process';
import { initStore, loadCredentials, discoverAgentServer } from './credentials-store.js';
import { requireArg, getArg, getPassphrase } from './args.js';

const agent = requireArg('agent', 'Usage: copy-login --agent <name> [--serverUrl <url>]');

initStore(getPassphrase());

function pbcopyAvailable(): boolean {
  return spawnSync('which', ['pbcopy'], { stdio: 'ignore' }).status === 0;
}

function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pb = spawn('pbcopy');
    pb.on('error', reject);
    pb.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pbcopy exited ${code}`))));
    pb.stdin.write(text);
    pb.stdin.end();
  });
}

if (!pbcopyAvailable()) {
  console.error(JSON.stringify({ error: 'pbcopy not found — this script currently requires macOS.' }));
  process.exit(2);
}

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

  if (!creds.email || !creds.password) {
    console.error(JSON.stringify({
      error: `Credentials for agent "${agent}" do not include email/password. Older provision? Re-provisioning may be required.`,
    }));
    process.exit(1);
  }

  try {
    await copyToClipboard(creds.password);
  } catch (err) {
    console.error(JSON.stringify({ error: `pbcopy failed: ${(err as Error).message}` }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    status: 'ok',
    agent,
    serverUrl,
    email: creds.email,
    webId: creds.webId,
    podUrl: creds.podUrl,
    loginUrl: `${serverUrl}/.account/login/password/`,
    message: 'Password copied to clipboard. Paste it at loginUrl after entering the email above.',
  }, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message ?? err) }));
  process.exit(1);
});
