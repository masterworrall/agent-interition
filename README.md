# Agent Interition

> Give AI agents portable identity and personal data storage

## What This Does

**Agent Interition** is an [OpenClaw](https://github.com/steinbergpeter/OpenClaw) Skill that gives your agents infrastructure they don't have out of the box:

- **A WebID** — a verifiable identity your agent uses to identify itself to other agents and services
- **A Pod** — personal storage your agent reads and writes via the [Solid Protocol](https://solidproject.org/) (W3C standard)
- **Sharing** — your agent can grant and revoke access to its data for other agents, using Web Access Control (WAC)

The agent is your OpenClaw instance. The WebID and Pod are infrastructure the agent uses — like a passport and a filing cabinet. The agent doesn't live in the Pod; it lives in OpenClaw.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Docker                                                      │
│                                                              │
│  ┌──────────────┐         ┌──────────────────────────────┐  │
│  │  OpenClaw     │  curl   │  Community Solid Server      │  │
│  │              ─┼────────▶│                              │  │
│  │  Reads        │ Bearer  │  /{name}/                    │  │
│  │  SKILL.md     │ tokens  │    /profile/card  ← WebID   │  │
│  │              ─┼────────▶│    /memory/       ← private │  │
│  │  Runs         │         │    /shared/       ← ACL     │  │
│  │  scripts      │         │    /conversations/← private │  │
│  └──────────────┘         └──────────────────────────────┘  │
│                                                              │
│  Auth: client credentials → Bearer token via /.oidc/token    │
│  Access control: WAC on .acl resources                       │
└──────────────────────────────────────────────────────────────┘
```

A [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) (CSS) runs in Docker alongside OpenClaw. The Skill gives OpenClaw shell scripts to provision agents and get auth tokens. OpenClaw then uses standard HTTP (`curl`) with Bearer tokens for all Solid operations — reading, writing, deleting, and sharing data.

Two Docker profiles are available:
- **Local mode** — runs CSS alongside OpenClaw in a shared network namespace
- **Remote mode** — connects OpenClaw to an external CSS (e.g. `solidcommunity.net`) over HTTPS

See the [Dogfooding Setup Guide](docs/dogfooding-setup.md) for the full architecture, security hardening details, and gotchas.

## Getting Started

### Prerequisites

- Docker Desktop
- An Anthropic API key (set a hard spend limit — we used $5)
- Node.js 20+ (to build the Skill)

### 1. Build the Skill

```bash
npm install
npm run skill:build
```

Output goes to `skill/solid-agent-storage/`. This directory is mounted read-only into the OpenClaw container.

### 2. Build the Docker images

```bash
# Build the OpenClaw image (from wherever you cloned OpenClaw)
cd /path/to/OpenClaw
docker build -t openclaw:local .

# Build the CSS image (from agent-interition root)
ANTHROPIC_API_KEY=dummy INTERITION_PASSPHRASE=dummy \
docker compose -f docker/docker-compose.dogfood.yml build css
```

### 3. Start the stack

Copy a template startup script and fill in your credentials:

```bash
cp template-start-local.sh start-local.sh    # for local mode
cp template-start-remote.sh start-remote.sh  # for remote mode
# Edit the copied file with your API key, passphrase, and gateway token
```

Generate a gateway token:

```bash
openssl rand -hex 32
```

Then start:

```bash
./start-local.sh   # Local CSS
# or
./start-remote.sh  # Remote CSS (e.g. solidcommunity.net)
```

### 4. Open the Web UI

Go to `http://localhost:18789` in your browser. Enter the gateway token when prompted.

### 5. Talk to your agent

Ask OpenClaw to use the Skill:

1. **"Provision an agent called alpha with display name Agent Alpha"**
2. **"Write a note to alpha's memory"**
3. **"Read alpha's memory"**
4. **"Provision a second agent called beta, then grant beta read access to alpha's shared data"**

OpenClaw reads the Skill's instructions and figures out which scripts to run and what curl commands to use.

## What OpenClaw Can Do

Once the Skill is installed, OpenClaw can:

- **Provision agents** — create a WebID, Pod, and credentials for a named agent
- **Deprovision agents** — fully tear down an agent's CSS account and local credentials
- **Store and retrieve data** — write Turtle (RDF) or any content to the agent's Pod, read it back
- **Share data** — grant another agent read or write access to specific resources using WAC
- **Revoke access** — remove previously granted permissions
- **Check status** — list all provisioned agents and their details

OpenClaw reads `SKILL.md` and the reference docs bundled in the Skill package. It uses the management scripts for provisioning/deprovisioning, gets Bearer tokens via the token helper, and uses `curl` for all standard Solid operations. See `references/solid-http-reference.md` in the Skill package for the full set of operations including containers, SPARQL PATCH, and WAC access control.

## Docker Setup

Two profiles in `docker/docker-compose.dogfood.yml`:

| Profile | What it does |
|---------|-------------|
| `local` | Runs CSS in a container alongside OpenClaw (shared network namespace) |
| `remote` | Connects OpenClaw to an external CSS over HTTPS |

Security hardening applied in both modes:

- Read-only filesystem, non-root user, all capabilities dropped
- No Docker socket mount, no host filesystem mounts
- Outbound traffic restricted via Squid proxy (Anthropic API + Solid server only)
- Web UI bound to `127.0.0.1` only
- Gateway token required for authentication

See [Dogfooding Setup Guide](docs/dogfooding-setup.md) for full details.

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
- [x] Submit to ClawHub
- [x] Tutorial: "Give your agents memory with Solid"

**Phase 3: Dogfooding** — In Progress

- [x] Hardened OpenClaw Docker setup (read-only, non-root, cap-drop ALL, Squid proxy)
- [x] Local CSS profile (shared network namespace)
- [x] Remote CSS profile (e.g. solidcommunity.net over HTTPS)
- [x] Deprovision feature (full CSS account teardown with graceful degradation)
- [x] Replace CRUD scripts with token helper + curl workflow
- [x] Solid HTTP reference doc for OpenClaw
- [ ] Complete dogfood test plan (token-curl-test-plan.md)
- [ ] Feed remaining findings back into Skill

**Phase 4: Moltbook Integration**

- [ ] Moltbook Bridge Skill
- [ ] Archive posts/comments to Pod
- [ ] Portable identity demonstration

## Development

For contributors and maintainers.

### npm scripts

| Command | Description |
|---------|-------------|
| `npm run css:start` | Start Community Solid Server on port 3000 |
| `npm run bootstrap -- --name <n>` | Provision an agent (dev workflow) |
| `npm run demo` | Run the two-agent sharing demo |
| `npm test` | Run unit tests |
| `CSS_URL=http://localhost:3000 npm test` | Run unit + integration tests |
| `npm run build` | Compile TypeScript |
| `npm run skill:build` | Build OpenClaw Skill package |
| `npm run clean` | Remove dist/, .solid-data/, and skill/ |

### Dev workflow (without Docker)

```bash
npm install
npm run css:start          # Start CSS locally
npm run bootstrap -- --name alpha --displayName "Agent Alpha"
curl http://localhost:3000/alpha/profile/card   # Verify WebID
npm run demo               # Run two-agent sharing demo
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

### Programmatic API

The library exports `provisionAgent`, `getAuthenticatedFetch`, `grantAccess`, and `revokeAccess` for use in demos and tests. These are not part of the Skill interface — end users interact through OpenClaw, not through TypeScript imports.

### Project structure

```
agent-interition/
├── src/
│   ├── bootstrap/         # Agent provisioning (account, pod, WebID, containers)
│   ├── auth/              # Client credentials → Bearer token auth
│   ├── sharing/           # WAC access control (library, used by demos/tests)
│   ├── cli/               # CLI commands: provision, deprovision, get-token, status
│   └── demo/              # Two-agent sharing demo
├── skill-src/             # OpenClaw Skill source (SKILL.md, scripts, reference docs)
├── scripts/               # Build scripts
├── css-config/            # Community Solid Server configuration
├── docker/                # Dockerfiles, compose (dev + dogfooding), proxy configs
├── docs/                  # Strategy, tutorial, setup guides, test plans
└── tests/
    ├── bootstrap/         # Unit tests for provisioning
    ├── sharing/           # Unit tests for ACL management
    ├── cli/               # Unit tests for CLI + credentials
    ├── skill/             # Skill package validation
    └── integration/       # E2E two-agent sharing tests
```

## Documentation

- [Strategy & Architecture](docs/STRATEGY.md) — Full technical decisions and roadmap
- [Dogfooding Setup](docs/dogfooding-setup.md) — Hardened OpenClaw + CSS Docker setup guide
- [Tutorial](docs/tutorial.md) — "Give your agents memory with Solid"
- [Token + Curl Test Plan](docs/token-curl-test-plan.md) — End-to-end dogfood test plan
- [Deprovision Test Plan](docs/deprovision-test-plan.md) — Deprovision feature test plan

## Contributing

This is an open source project. Security is critical in the agent ecosystem — we welcome reviews, audits, and contributions.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Links

- [Interition](https://interition.ai) — The team behind this
- [Solid Project](https://solidproject.org/) — The protocol
- [OpenClaw](https://github.com/steinbergpeter/OpenClaw) — The agent framework
- [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) — The server implementation
