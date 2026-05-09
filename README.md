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

A [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) (CSS) runs in Docker alongside OpenClaw. The Skill gives OpenClaw shell scripts to provision WebIDs and Pods and get auth tokens. OpenClaw then uses standard HTTP (`curl`) with Bearer tokens for all Solid operations — reading, writing, deleting, and sharing data.

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

1. **"Create a WebID and Pod for an agent called alpha with display name Agent Alpha"**
2. **"Write a note to alpha's memory"**
3. **"Read alpha's memory"**
4. **"Create a WebID and Pod for a second agent called beta, then grant beta read access to alpha's shared data"**

OpenClaw reads the Skill's instructions and figures out which scripts to run and what curl commands to use.

## What OpenClaw Can Do

Once the Skill is installed, OpenClaw can:

- **Provision identity and storage** — create a WebID, Pod, and credentials for a named agent
- **Deprovision identity and storage** — fully tear down an agent's CSS account and local credentials
- **Store and retrieve data** — write Turtle (RDF) or any content to Pods and read it back
- **Share data** — grant another agent read or write access to specific resources using WAC
- **Revoke access** — remove previously granted permissions
- **Check status** — list all agents with provisioned WebIDs and Pods

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

## Claude Code skills (alternative distribution)

Beyond the OpenClaw Skill described above, this repo also packages two **Claude Code** skills under `claude-code-skill/`:

| Skill | Purpose |
|---|---|
| [`solid-webid-pod`](claude-code-skill/solid-webid-pod/SKILL.md) | Provisions a WebID + Pod for a Claude Code agent and provides authenticated Pod access (Bearer token via client credentials). |
| [`solid-context-memory`](claude-code-skill/solid-context-memory/SKILL.md) | Mirrors a Claude Code project's memory (`~/.claude/projects/<slug>/memory/`) to the agent's Pod under typed RDF. Supports `mem:Reference` pointers to canonical content elsewhere, push / pull / reconstitute. |

These are an **alternative to** the OpenClaw distribution above; they do not require Docker. A Claude Code agent gets a Pod-resident WebID, identity, and memory automatically once installed.

### Build and install

```bash
npm install
npm run build
node scripts/build-claude-code-skill.js --skill solid-webid-pod      --install
node scripts/build-claude-code-skill.js --skill solid-context-memory --install
```

`--install` copies each skill into `~/.claude/skills/<name>/`. Both must be installed for the memory bridge to work — `solid-context-memory` depends on `solid-webid-pod`'s identity layer.

### Provision an agent (once per agent)

```bash
~/.claude/skills/solid-webid-pod/scripts/provision.sh --name <agent-name>
```

Encrypts and stores credentials at `~/.interition/agents/<agent-name>/credentials.enc`.

### Initialise a workspace (once per Claude Code workspace)

```bash
~/.claude/skills/solid-context-memory/scripts/init-project.sh \
  --project-dir <absolute-path-to-workspace> \
  --agent <agent-name> \
  --server-url https://crawlout.io
```

This step:

1. Drops a `.solid-memory-bridge.json` config in `~/.claude/projects/<slug>/` so the bridge knows which agent and Pod to use for that workspace.
2. **Patches the workspace's `CLAUDE.md`** with a marker-bounded orientation block so the agent knows the bridge is active and narrates Pod-resident memory correctly. Idempotent — re-running replaces the block in place between markers, doesn't duplicate.

Optional flag `--no-claude-md` skips the CLAUDE.md patch.

### Install the hook (once per Claude Code installation)

```bash
~/.claude/skills/solid-context-memory/scripts/install-hook.sh
```

Adds a `PostToolUse` hook to `~/.claude/settings.json` that auto-pushes memory writes to the Pod for any initialised workspace.

### Operations and conventions

For pull / push / reconstitute, the type mapping (Claude Code ↔ standard), Reference authoring conventions, validation rules, and error handling, see each skill's `SKILL.md`:

- [`claude-code-skill/solid-webid-pod/SKILL.md`](claude-code-skill/solid-webid-pod/SKILL.md)
- [`claude-code-skill/solid-context-memory/SKILL.md`](claude-code-skill/solid-context-memory/SKILL.md)

Both files are also installed at `~/.claude/skills/<name>/SKILL.md` after build — that is where the agent reads them from at runtime.

### Optional: install `solid-ops` to a team-shared location

`src/cli/solid-ops.ts` is the team's CLI for ad-hoc Pod operations (read-chat, post-message, read-resource, write-resource, patch-resource, delete-resource, list-container). It is **not** packaged as a Claude Code skill — by design, the published `solid-webid-pod` skill stays minimal and spec-faithful for the OpenClaw distribution; `solid-ops` is internal team tooling.

To deploy a self-contained bundle of `solid-ops` to a stable shared path on your machine (so internal CLAUDE.md files can reference it without coupling to a specific repo checkout location):

```bash
cp .env.local.example .env.local
# edit .env.local and set, for example:
#   SOLID_OPS_DEPLOY_DIR=$HOME/Development/interition/team-tools/solid-ops

npm run build
npm run install:team-tools
```

This bundles `src/cli/solid-ops.ts` via esbuild into a single self-contained file plus a thin shell wrapper (`solid-ops`) at the path you specified. `.env.local` is gitignored — the public repo carries no internal paths.

External consumers can ignore this step entirely; nothing happens unless `SOLID_OPS_DEPLOY_DIR` is set.

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

**Phase 4: Agent Discovery & Sharing Protocol** — Complete

- [x] Agent Directory — public registry at `/directory/agents.ttl` with auto-registration during provisioning
- [x] Inbox Notifications — `/inbox/` container per agent using ActivityStreams vocabulary (W3C standard)
- [x] Share Orchestration — `shareResource()` grants ACL access and sends inbox notification in one call
- [x] New CLI commands: `discover.sh`, `share.sh`, `inbox.sh`
- [x] 64 unit tests passing

**Phase 4.5: Multi-Agent Sharing Exercise** — Complete

- [x] Step-by-step exercise for two OpenClaw agents sharing data via Solid Pods
- [x] Self-contained Docker Compose with Alpha (port 18789) and Beta (port 18790) against shared CSS
- [x] Fix `--data-raw` for Turtle content in curl examples
- [x] Fix `/{name}/` path convention (CSS default, not `/agents/{name}/`)
- [x] Language guide enforced — agent vs identity/storage distinction

**Phase 5: Production Interition CSS**

1. [ ] Interition-hosted CSS with real domain and TLS
2. [ ] Cloudflare Tunnel for public access
3. [ ] Publicly resolvable WebIDs (agents verifiable from anywhere)
4. [ ] Production configuration and monitoring

**Phase 6: Multi-Server Federation**

- [ ] Agents on different CSS instances sharing data across the open web
- [ ] Cross-origin WebID verification
- [ ] Federated access control (WAC across servers)
- [ ] Integration tests against multiple CSS instances

**Phase 7: Real-World Agent Workflows**

- [ ] Persistent agent memory patterns (structured recall, summarisation)
- [ ] Task handoff between agents via Pod-based protocols
- [ ] Shared knowledge bases with multi-agent read/write
- [ ] Reference implementations and documentation

## Development

For contributors and maintainers.

### npm scripts

| Command | Description |
|---------|-------------|
| `npm run css:start` | Start Community Solid Server on port 3000 |
| `npm run bootstrap -- --name <n>` | Provision a WebID and Pod (dev workflow) |
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
1. Create WebID + Pod for Agent Alpha and Agent Beta
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
- [`solid-webid-pod` SKILL.md](claude-code-skill/solid-webid-pod/SKILL.md) — Claude Code identity skill (operations, scripts, errors)
- [`solid-context-memory` SKILL.md](claude-code-skill/solid-context-memory/SKILL.md) — Claude Code memory bridge (authoring conventions, type mapping, validation)

## Contributing

This is an open source project. Security is critical in the agent ecosystem — we welcome reviews, audits, and contributions.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Links

- [Interition](https://interition.ai) — The team behind this
- [Solid Project](https://solidproject.org/) — The protocol
- [OpenClaw](https://github.com/openclaw/openclaw) — The agent framework
- [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) — The server implementation
