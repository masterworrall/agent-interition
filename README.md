# Agent Interition

> Give AI agents portable identity and personal data storage

**Agent Interition** provides [Solid Protocol](https://solidproject.org/) infrastructure for AI agents. Starting with [OpenClaw](https://github.com/steinbergpeter/OpenClaw) integration, we enable agents to have:

- **Persistent Identity** — WebID for each agent
- **Personal Storage** — Pod containers for agent data
- **Cross-Agent Sharing** — WAC-controlled data access
- **User Sovereignty** — Users own and control their agents' data

## Why?

OpenClaw has 183K GitHub stars and 30K+ deployed instances. Moltbook (agent social network) has 1.6M registered bots. These agents face common problems:

| Problem | Solution |
|---------|----------|
| No persistent memory | Pod storage survives restarts |
| No identity standard | WebID provides verifiable identity |
| No secure sharing | Solid WAC controls access |
| Platform lock-in | Data is portable, user-owned |

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Run locally

```bash
# Install dependencies
npm install

# Start the Community Solid Server
npm run css:start

# In another terminal — provision an agent
npm run bootstrap -- --name alpha --displayName "Agent Alpha"

# Verify the agent's WebID profile
curl http://localhost:3000/alpha/profile/card
```

### Run with Docker

```bash
# Start CSS in a container
docker compose -f docker/docker-compose.yml up

# Auto-provision agents on startup
BOOTSTRAP_AGENTS=alpha,beta docker compose -f docker/docker-compose.yml up
```

### Run the demo

The demo provisions two agents and walks through a full sharing lifecycle:

```bash
# Make sure CSS is running first (npm run css:start or docker compose up)
npm run demo
```

Output:

```
1. Provision Agent Alpha + Agent Beta
2. Alpha writes greeting.ttl to /shared/
3. Beta tries to read → 403 (no access)
4. Alpha grants Beta read access via WAC
5. Beta reads → 200 (success!)
6. Alpha revokes access
7. Beta tries again → 403 (revoked)
```

## Usage

### Provisioning an agent

Each agent gets a WebID (identity), a Pod (storage), and client credentials (auth):

```bash
npm run bootstrap -- --name <name> [--displayName <name>] [--serverUrl <url>]
```

This creates:
- **WebID** at `http://localhost:3000/<name>/profile/card#me` — with agent metadata (type, name, capabilities)
- **Pod** at `http://localhost:3000/<name>/` — with containers: `/memory/`, `/shared/`, `/conversations/`
- **Client credentials** — id + secret for authenticated API access

### Programmatic usage

```typescript
import { provisionAgent, getAuthenticatedFetch, grantAccess, revokeAccess } from '@interition/agent-interition';

// Provision an agent
const agent = await provisionAgent({
  name: 'my-agent',
  displayName: 'My Agent',
  serverUrl: 'http://localhost:3000',
  capabilities: ['memory', 'sharing'],
});

// Get an authenticated fetch function
const authFetch = await getAuthenticatedFetch(
  'http://localhost:3000',
  agent.clientCredentials.id,
  agent.clientCredentials.secret,
);

// Write data to the agent's pod
await authFetch(`${agent.podUrl}memory/note.ttl`, {
  method: 'PUT',
  headers: { 'content-type': 'text/turtle' },
  body: '<#note> <http://schema.org/text> "Hello from my agent".',
});

// Grant another agent read access
await grantAccess(
  `${agent.podUrl}shared/data.ttl`,
  'http://localhost:3000/other-agent/profile/card#me',
  ['Read'],
  authFetch,
);

// Revoke access
await revokeAccess(
  `${agent.podUrl}shared/data.ttl`,
  'http://localhost:3000/other-agent/profile/card#me',
  authFetch,
);
```

### npm scripts

| Command | Description |
|---------|-------------|
| `npm run css:start` | Start Community Solid Server on port 3000 |
| `npm run bootstrap -- --name <n>` | Provision an agent |
| `npm run demo` | Run the two-agent sharing demo |
| `npm test` | Run unit tests |
| `CSS_URL=http://localhost:3000 npm test` | Run unit + integration tests |
| `npm run build` | Compile TypeScript |
| `npm run skill:build` | Build OpenClaw Skill package |
| `npm run clean` | Remove dist/, .solid-data/, and skill/ |

## OpenClaw Skill

This project packages as an OpenClaw Skill. Once published to ClawHub, OpenClaw users can install it with:

```bash
clawhub install solid-agent-storage
```

### Building the Skill locally

```bash
# Build the Skill package
npm run skill:build

# Output is in skill/solid-agent-storage/
```

### Using the Skill

Set the passphrase (used to encrypt stored credentials):
```bash
export INTERITION_PASSPHRASE="your-passphrase"
```

Provision an agent:
```bash
skill/solid-agent-storage/scripts/provision.sh --name myagent --displayName "My Agent"
```

Write data:
```bash
skill/solid-agent-storage/scripts/write.sh --agent myagent \
  --url "http://localhost:3000/agents/myagent/memory/note.ttl" \
  --content '<#note> <http://schema.org/text> "Hello".' \
  --content-type "text/turtle"
```

Read data:
```bash
skill/solid-agent-storage/scripts/read.sh --agent myagent \
  --url "http://localhost:3000/agents/myagent/memory/note.ttl"
```

All commands output JSON to stdout and errors to stderr.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your Machine (or Docker container)                         │
│                                                             │
│  ┌─────────────┐                                            │
│  │  Bootstrap   │  Provisions agents:                       │
│  │  Service     │  • Creates CSS account                    │
│  │              │  • Creates Pod + WebID                     │
│  │              │  • Issues client credentials               │
│  └──────┬──────┘  • Patches profile metadata                │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────┐                    │
│  │  Community Solid Server (CSS v7)    │                    │
│  │                                     │                    │
│  │  /{name}/                           │                    │
│  │    /profile/card    ← WebID         │                    │
│  │    /memory/         ← private       │                    │
│  │    /shared/         ← ACL-controlled│                    │
│  │    /conversations/  ← private       │                    │
│  └─────────────────────────────────────┘                    │
│                                                             │
│  Auth: client credentials → Bearer token via /.oidc/token   │
│  Access control: Web Access Control (WAC) on .acl resources │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
agent-interition/
├── src/
│   ├── bootstrap/         # Agent provisioning (account, pod, WebID, containers)
│   ├── auth/              # Client credentials → Bearer token auth
│   ├── sharing/           # WAC access control (grant/revoke)
│   ├── cli/               # CLI commands for OpenClaw Skill
│   └── demo/              # Two-agent sharing demo
├── skill-src/             # OpenClaw Skill source (SKILL.md, scripts, docs)
├── scripts/               # Build scripts
├── css-config/            # Community Solid Server configuration
├── docker/                # Dockerfile, docker-compose, entrypoint
└── tests/
    ├── bootstrap/         # Unit tests for provisioning
    ├── sharing/           # Unit tests for ACL management
    ├── cli/               # Unit tests for CLI + credentials
    ├── skill/             # Skill package validation
    └── integration/       # E2E two-agent sharing tests
```

## Status

**Phase 1: Proof of Concept** — Complete

- [x] Basic CSS running in Docker
- [x] WebID generation for agents
- [x] Pod provisioning
- [x] Demo: Two agents sharing data

**Phase 2: OpenClaw Integration** — Complete

- [x] Package as OpenClaw Skill (`npm run skill:build`)
- [x] Encrypted credentials store (AES-256-GCM)
- [x] CLI commands + shell wrappers
- [x] SKILL.md, SECURITY.md, reference docs
- [ ] Submit to ClawHub
- [ ] Tutorial: "Give your agents memory with Solid"

**Phase 3: Moltbook Integration**

- [ ] Moltbook Bridge Skill
- [ ] Archive posts/comments to Pod
- [ ] Portable identity demonstration

## Documentation

- [Strategy & Architecture](docs/STRATEGY.md) — Full technical decisions and roadmap

## Contributing

This is an open source project. Security is critical in the agent ecosystem — we welcome reviews, audits, and contributions.

## License

MIT

## Links

- [Interition](https://interition.ai) — The team behind this
- [Solid Project](https://solidproject.org/) — The protocol
- [OpenClaw](https://github.com/steinbergpeter/OpenClaw) — The agent framework
- [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) — The server implementation
