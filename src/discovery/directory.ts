import { Parser } from 'n3';
import { AgentDirectoryEntry } from './types.js';

const DIRECTORY_PATH = 'directory/agents.ttl';
const INTERITION_VOCAB = 'https://vocab.interition.org/agents#';

/**
 * Registers an agent in the public directory.
 * Creates the directory on first use (If-None-Match: *), then appends via PATCH.
 */
export async function registerAgent(
  serverUrl: string,
  entry: AgentDirectoryEntry,
  authFetch: typeof fetch,
): Promise<void> {
  const directoryUrl = new URL(DIRECTORY_PATH, serverUrl).href;

  // Try to create the directory resource on first use
  await ensureDirectoryExists(directoryUrl, authFetch);

  // Append this agent's entry via SPARQL UPDATE PATCH
  const entryTriples = buildEntryTriples(entry);
  const patchBody = `INSERT DATA { ${entryTriples} }`;

  const res = await authFetch(directoryUrl, {
    method: 'PATCH',
    headers: { 'content-type': 'application/sparql-update' },
    body: patchBody,
  });

  if (!res.ok) {
    throw new Error(`Failed to register agent: ${res.status} ${await res.text()}`);
  }
}

/**
 * Lists all agents in the directory.
 * Publicly readable — no auth needed.
 */
export async function listAgents(
  serverUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<AgentDirectoryEntry[]> {
  const directoryUrl = new URL(DIRECTORY_PATH, serverUrl).href;
  const res = await fetchFn(directoryUrl, {
    headers: { accept: 'text/turtle' },
  });

  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Failed to list agents: ${res.status} ${await res.text()}`);
  }

  const turtle = await res.text();
  return parseDirectory(turtle, directoryUrl);
}

/**
 * Finds an agent by name (case-insensitive).
 */
export async function findAgentByName(
  serverUrl: string,
  name: string,
  fetchFn: typeof fetch = fetch,
): Promise<AgentDirectoryEntry | undefined> {
  const agents = await listAgents(serverUrl, fetchFn);
  return agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
}

/**
 * Finds agents by capability.
 */
export async function findAgentsByCapability(
  serverUrl: string,
  capability: string,
  fetchFn: typeof fetch = fetch,
): Promise<AgentDirectoryEntry[]> {
  const agents = await listAgents(serverUrl, fetchFn);
  return agents.filter((a) =>
    a.capabilities.some((c) => c.toLowerCase() === capability.toLowerCase()),
  );
}

/**
 * Ensures the directory resource exists. Uses If-None-Match: * to avoid overwriting.
 */
async function ensureDirectoryExists(
  directoryUrl: string,
  authFetch: typeof fetch,
): Promise<void> {
  // First ensure the container exists
  const containerUrl = directoryUrl.substring(0, directoryUrl.lastIndexOf('/') + 1);
  const containerRes = await authFetch(containerUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'text/turtle',
      'if-none-match': '*',
      link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
    },
    body: '',
  });
  // 201 or 409 both fine
  if (!containerRes.ok && containerRes.status !== 409) {
    throw new Error(`Failed to create directory container: ${containerRes.status}`);
  }

  // Then ensure the agents.ttl resource exists
  const prefixes = `@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix interition: <${INTERITION_VOCAB}>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.

`;

  const res = await authFetch(directoryUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'text/turtle',
      'if-none-match': '*',
    },
    body: prefixes,
  });

  // 201 Created (first time) or 412 Precondition Failed (already exists) are both fine
  if (!res.ok && res.status !== 412 && res.status !== 409) {
    throw new Error(`Failed to create directory resource: ${res.status}`);
  }
}

function buildEntryTriples(entry: AgentDirectoryEntry): string {
  const capTriples = entry.capabilities
    .map((c) => `    <${INTERITION_VOCAB}capability> "${c}"`)
    .join(' ;\n');

  let triples = `<${entry.webId}>
    a <${INTERITION_VOCAB}Agent>, <http://xmlns.com/foaf/0.1/Agent> ;
    <http://xmlns.com/foaf/0.1/name> "${entry.name}" ;
    <http://www.w3.org/ns/solid/terms#account> <${entry.podUrl}>`;

  if (capTriples) {
    triples += ` ;\n${capTriples}`;
  }

  triples += ' .';
  return triples;
}

function parseDirectory(turtle: string, baseUrl: string): AgentDirectoryEntry[] {
  const parser = new Parser({ baseIRI: baseUrl });
  const agentMap = new Map<string, AgentDirectoryEntry>();

  try {
    const quads = parser.parse(turtle);
    for (const quad of quads) {
      const subject = quad.subject.value;

      // Initialize entry if we haven't seen this agent
      if (!agentMap.has(subject)) {
        agentMap.set(subject, {
          webId: subject,
          name: '',
          podUrl: '',
          capabilities: [],
        });
      }
      const entry = agentMap.get(subject)!;

      switch (quad.predicate.value) {
        case 'http://xmlns.com/foaf/0.1/name':
          entry.name = quad.object.value;
          break;
        case 'http://www.w3.org/ns/solid/terms#account':
          entry.podUrl = quad.object.value;
          break;
        case `${INTERITION_VOCAB}capability`:
          entry.capabilities.push(quad.object.value);
          break;
      }
    }
  } catch {
    // If parsing fails, return what we have
  }

  // Only return entries that have at least a name (actual agent entries, not prefixes)
  return Array.from(agentMap.values()).filter((e) => e.name);
}
