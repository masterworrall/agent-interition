# Agent Interition

> Give AI agents portable identity and personal data storage

## What This Does

**Agent Interition** is an [OpenClaw](https://github.com/openclaw/openclaw) Skill that gives your agents infrastructure they don't have out of the box:

- **A WebID** — a verifiable identity your agent uses to identify itself to other agents and services
- **A Pod** — personal storage your agent reads and writes via the [Solid Protocol](https://solidproject.org/) (W3C standard)
- **Sharing** — your agent can grant and revoke access to its data for other agents, using Web Access Control (WAC)

The agent is your OpenClaw instance. The WebID and Pod are infrastructure the agent uses — like a passport and a filing cabinet. The agent doesn't live in the Pod; it lives in OpenClaw.

## How It Works

For clarity we use a Docker architecture with OpenClaw and the Community Solid Server (CSS). For local testing the Docker configuration has both OpenClaw and CSS. This configuration is limited to local use. A second configuration is provided for use of an external CSS instance. The external CSS instance configuration is necessary if you want to share information with agents elsewhere.

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

Docker profiles are available for local and remote CSS use:
- **Local mode** — runs CSS alongside OpenClaw in a shared network namespace
- **Remote mode** — connects OpenClaw to an external CSS (e.g. `solidcommunity.net`) over HTTPS

See the [Dogfooding Setup Guide](docs/dogfooding-setup.md) for the full architecture, security hardening details, and gotchas.

## Getting Started

### Prerequisites

- Docker Desktop
- An Anthropic API key (see note on API costs below)
- Node.js 20+ (to build the Skill)

> **A note on API costs.** OpenClaw consumes significantly more API credits per interaction than other clients like Claude Code. During dogfooding we observed costs roughly 3–5x higher for equivalent tasks. We are investigating this with the OpenClaw community — it may relate to how OpenClaw manages context windows or tool-use loops. In the meantime, **set a hard spend limit** in the Anthropic console before starting. We used $5, which was sufficient for initial testing.

### 1. Build the Skill

```bash
npm install
npm run skill:build
```

Output goes to `skill/solid-agent-storage/`. This directory is mounted read-only into the OpenClaw container.

### 2. Build the OpenClaw Docker image

Clone [OpenClaw](https://github.com/openclaw/openclaw) and build its Docker image. Use a permanent location — you'll need the source directory to rebuild if the image gets pruned.

```bash
git clone https://github.com/openclaw/openclaw.git
cd OpenClaw
docker build -t openclaw:local .
```

The image is ~2.8 GB. The first build takes a while; subsequent builds use cache.

### 3. Build the CSS Docker image

Back in the agent-interition directory (local mode only):

```bash
ANTHROPIC_API_KEY=dummy INTERITION_PASSPHRASE=dummy \
docker compose -f docker/docker-compose.dogfood.yml build css
```

Note: Compose validates all env vars even when building a single service, so dummy values are needed here.

### 4. Start the stack

Copy a template startup script and fill in your credentials:

```bash
cp template-start-local.sh start-local.sh    # for local mode
cp template-start-remote.sh start-remote.sh  # for remote mode
```

Edit the copied file and set three values:

| Variable | What it is |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (OpenClaw uses Claude as its LLM) |
| `INTERITION_PASSPHRASE` | Encrypts stored agent credentials (AES-256-GCM). Choose something strong and keep it secret. |
| `OPENCLAW_GATEWAY_TOKEN` | A shared secret that protects the Web UI. Generate one with `openssl rand -hex 32`. You'll paste this into the browser when you connect. |

Then start:

```bash
./start-local.sh   # Local CSS
# or
./start-remote.sh  # Remote CSS (e.g. solidcommunity.net)
```

### 5. Open the Web UI

Go to `http://localhost:18789` in your browser. Enter your gateway token when prompted — this is the `OPENCLAW_GATEWAY_TOKEN` you set in the start script.

### 6. Talk to your agent

Ask OpenClaw to use the Skill:

1. **"Provision an agent called alpha with display name Agent Alpha"**
2. **"Write a note to alpha's memory"**
3. **"Read alpha's memory"**
4. **"Provision a second agent called beta, then grant beta read access to alpha's shared data"**

OpenClaw reads the Skill's instructions and figures out which scripts to run and what curl commands to use.

## What OpenClaw Can Do

Once the Skill is installed, OpenClaw can:

- **Provision an Identity and a Store for itself** — create a WebID, Pod, and credentials for a named agent
- **Deprovision Identities and Store** — fully tear down an agent's CSS account and local credentials
- **Store and retrieve data** — write Turtle (RDF) or any content to Pods and read it back
- **Share data** — grant another agent read or write access to specific resources using WAC
- **Revoke access** — remove previously granted permissions
- **Check status** — list all provisioned WebId and their Pods

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

**Phase 3: Dogfooding** — Complete

- [x] Hardened OpenClaw Docker setup (read-only, non-root, cap-drop ALL, Squid proxy)
- [x] Local CSS profile (shared network namespace)
- [x] Remote CSS profile (e.g. solidcommunity.net over HTTPS)
- [x] Deprovision feature (full CSS account teardown with graceful degradation)
- [x] Replace CRUD scripts with token helper + curl workflow
- [x] Solid HTTP reference doc for OpenClaw
- [x] Complete dogfood test plan (token-curl-test-plan.md)
- [x] Feed findings back into Skill and README

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
- [OpenClaw](https://github.com/openclaw/openclaw) — The agent framework
- [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) — The server implementation
