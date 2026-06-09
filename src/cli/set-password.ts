import { initStore, loadCredentials, saveCredentials, discoverAgentServer } from './credentials-store.js';
import { requireArg, getArg, getPassphrase } from './args.js';

const agent = requireArg('agent', 'Usage: set-password --agent <name> [--serverUrl <url>]  (new password on stdin)');

initStore(getPassphrase());

function resolveServerUrl(agentName: string): string {
  return (
    process.env.SOLID_SERVER_URL ??
    getArg('serverUrl') ??
    getArg('server-url') ??
    discoverAgentServer(agentName)
  );
}

// Control codes read from a raw-mode TTY.
const CR = 13; // \r — Enter
const LF = 10; // \n — Enter
const EOT = 4; // Ctrl-D — end of input
const ETX = 3; // Ctrl-C — abort
const DEL = 127; // backspace key on most terminals
const BS = 8; // \b — backspace fallback

// Read the new password from stdin (piped) or a hidden TTY prompt. Never argv —
// argv leaks into `ps` output and shell history.
function readNewPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      let buf = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (c) => (buf += c));
      process.stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')));
      process.stdin.on('error', reject);
      return;
    }
    // Interactive: read one line with echo off.
    process.stderr.write('New password: ');
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');
    let buf = '';
    stdin.on('data', (chunk: string) => {
      for (const c of chunk) {
        const code = c.charCodeAt(0);
        if (code === CR || code === LF || code === EOT) {
          stdin.setRawMode(false);
          stdin.pause();
          process.stderr.write('\n');
          return resolve(buf);
        }
        if (code === ETX) {
          stdin.setRawMode(false);
          process.exit(130);
        }
        if (code === DEL || code === BS) {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += c;
      }
    });
  });
}

let serverUrl: string;
try {
  serverUrl = resolveServerUrl(agent);
} catch (err) {
  console.error(JSON.stringify({ error: (err as Error).message }));
  process.exit(2);
}

(async () => {
  const creds = loadCredentials(agent, serverUrl); // throws if no creds — good
  const newPassword = (await readNewPassword()).trim();

  if (!newPassword) {
    console.error(JSON.stringify({ error: 'Empty password — nothing written.' }));
    process.exit(1);
  }

  // End-to-end rotate would go HERE: call the CSS /.account/ password-change
  // API with the OLD creds.password, abort on non-2xx, before persisting below.

  const changed = creds.password !== newPassword;
  saveCredentials(agent, serverUrl, { ...creds, password: newPassword });

  console.log(JSON.stringify(
    {
      status: 'ok',
      agent,
      serverUrl,
      email: creds.email ?? null,
      webId: creds.webId,
      changed, // false if it already matched (idempotent re-run)
      scope: 'local-store-only', // honesty: the server password is NOT touched
      message:
        'Local credential store updated. The CSS server password was not changed by this command.',
    },
    null,
    2,
  ));
})().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message ?? err) }));
  process.exit(1);
});
