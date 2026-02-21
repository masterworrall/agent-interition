import { listAgents, findAgentByName, findAgentsByCapability } from '../discovery/directory.js';
import { getArg, getServerUrl } from './args.js';

const name = getArg('name');
const capability = getArg('capability');
const serverUrl = getServerUrl();

(async () => {
  if (name) {
    const agent = await findAgentByName(serverUrl, name);
    if (agent) {
      console.log(JSON.stringify({ status: 'ok', agent }, null, 2));
    } else {
      console.log(JSON.stringify({ status: 'ok', agent: null, message: `No agent found with name "${name}"` }));
    }
  } else if (capability) {
    const agents = await findAgentsByCapability(serverUrl, capability);
    console.log(JSON.stringify({ status: 'ok', agents }, null, 2));
  } else {
    const agents = await listAgents(serverUrl);
    console.log(JSON.stringify({ status: 'ok', agents }, null, 2));
  }
})().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message ?? err) }));
  process.exit(1);
});
