import { provisionAgent } from './agent-provisioner.js';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const name = getArg('name');
const displayName = getArg('displayName') ?? name;
const serverUrl = getArg('serverUrl') ?? 'https://crawlout.io';

if (!name) {
  console.error('Usage: npm run bootstrap -- --name <name> [--displayName <name>] [--serverUrl <url>]');
  process.exit(1);
}

provisionAgent({
  name,
  displayName: displayName!,
  serverUrl,
}).then((agent) => {
  console.log('\nAgent WebID and Pod created:');
  console.log(JSON.stringify(agent, null, 2));
}).catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
