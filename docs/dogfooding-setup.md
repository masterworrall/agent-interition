# Phase 3: Dogfooding Setup Guide

How to run a hardened OpenClaw instance with the Solid Agent Storage Skill for end-to-end testing.

Two modes are supported:
- **Local** — runs CSS in a container alongside OpenClaw
- **Remote** — connects to a web-hosted CSS (e.g. `solidcommunity.net`)

## Prerequisites

- Docker Desktop
- An Anthropic API key (set a hard spend limit in the Anthropic console — we used $5)
- The Skill built locally (`npm run skill:build`)
- OpenClaw Docker image built locally (`openclaw:local`)

## Architecture

### Local mode (`--profile local`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Docker Network: dogfood (isolated bridge)                      │
│                                                                  │
│  ┌────────────────────────────────────────────┐  ┌───────────┐  │
│  │  Shared Network Namespace                   │  │  Squid    │  │
│  │                                             │  │  Proxy    │  │
│  │  ┌──────────────┐   ┌────────────────────┐ │  │  :3128    │  │
│  │  │  OpenClaw     │   │  CSS (Solid)       │ │  │           │  │
│  │  │  (hardened)   │   │  :3000             │ │  │  Allows:  │  │
│  │  │              ─┼──▶│                    │ │  │  anthropic │  │
│  │  │  read-only    │   │  Base URL:         │ │  │  .com     │  │
│  │  │  non-root     │ localhost              │ │  │  only     │  │
│  │  │  cap-drop ALL │   │  WebID tokens      │ │  │           │  │
│  │  └──────────────┘   │  require localhost  │ │  └───────────┘  │
│  │                      │  or HTTPS           │ │        ▲        │
│  │  Gateway :18789      └────────────────────┘ │        │        │
│  └──────────────┬─────────────────────────────┘  HTTPS  │        │
│                 │                                 only   │        │
│        ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘        │
│                 │  OpenClaw outbound → proxy → api.anthropic.com │
│                 │                                                 │
└─────────────────┼─────────────────────────────────────────────────┘
                  │
          127.0.0.1:18789
                  │
            ┌─────┴─────┐
            │  Host Mac  │
            │  Browser   │
            └───────────┘
```

OpenClaw shares CSS's network namespace (`network_mode: service:css`) so it can reach CSS at `localhost:3000`. This is required because CSS validates WebID tokens — they must use HTTPS or HTTP on localhost.

### Remote mode (`--profile remote`)

```
┌──────────────────────────────────────────────────────────────┐
│  Docker Network: dogfood (isolated bridge)                    │
│                                                                │
│  ┌──────────────┐          ┌───────────┐                      │
│  │  OpenClaw     │          │  Squid    │                      │
│  │  (hardened)   │          │  Proxy    │                      │
│  │               │          │  :3128    │                      │
│  │  read-only    │          │           │     ┌─────────────┐ │
│  │  non-root     │──HTTPS──▶│  Allows:  │────▶│  Internet   │ │
│  │  cap-drop ALL │          │  anthropic│     │             │ │
│  │               │          │  .com +   │     │             │ │
│  │  Gateway      │          │  solid    │     └─────────────┘ │
│  │  :18789       │          │  server   │           │         │
│  └───────┬───────┘          └───────────┘           │         │
│          │                                          ▼         │
└──────────┼──────────────────────────────  ┌─────────────────┐ │
           │                                │ solidcommunity  │ │
   127.0.0.1:18789                          │ .net (or your   │ │
           │                                │ own CSS v7)     │ │
     ┌─────┴─────┐                          │ HTTPS :443      │ │
     │  Host Mac  │                          └─────────────────┘ │
     │  Browser   │                                              │
     └───────────┘                                               │
                                                                 │
└────────────────────────────────────────────────────────────────┘
```

No local CSS. OpenClaw connects to a remote CSS over HTTPS. The Squid proxy allows both `api.anthropic.com` and the remote Solid server's domain.

### Service roles

| Service | Role | Local | Remote |
|---------|------|-------|--------|
| **css** | Community Solid Server — Pod storage, WebID, OIDC tokens | Yes | No |
| **openclaw-local** | AI agent runtime — shares CSS network namespace | Yes | No |
| **openclaw-remote** | AI agent runtime — own network, HTTPS to remote CSS | No | Yes |
| **proxy-local** | Squid firewall — allows api.anthropic.com only | Yes | No |
| **proxy-remote** | Squid firewall — allows api.anthropic.com + Solid server | No | Yes |
| **init-volumes** | One-shot — sets uid 1000 ownership on named volumes | Yes | Yes |

## Security Hardening

OpenClaw has known security issues (CVE-2026-25253, CVSS 8.8 RCE). The Docker setup applies these mitigations in both modes:

| Measure | Purpose |
|---------|---------|
| `read_only: true` | Prevents writes to the container filesystem |
| `cap_drop: ALL` | Drops all Linux capabilities |
| `no-new-privileges` | Prevents privilege escalation |
| `user: 1000:1000` | Runs as non-root |
| `tmpfs` on `/tmp` and `~/.cache` | Writable temp dirs in memory only |
| Squid proxy | Restricts outbound to allowed domains only |
| `127.0.0.1:18789` port binding | Web UI accessible only from localhost |
| No Docker socket mount | Container cannot control Docker |
| No host filesystem mounts | Only named volumes + read-only skill dir |
| `allowInsecureAuth` (token-only) | Gateway token required; device pairing skipped (see Gotchas) |

## Step-by-Step Setup

### 1. Clone and build OpenClaw

Clone to a permanent location (not `/tmp`) so you can rebuild the image easily:

```bash
cd /Users/paulworrall/Development
git clone https://github.com/steinbergpeter/OpenClaw.git
cd OpenClaw
docker build -t openclaw:local .
```

The image is ~2.8 GB. The first build takes a while; subsequent builds use cache.

If the `openclaw:local` image gets removed (e.g. by `docker system prune`), rebuild from this directory.

### 2. Build the CSS image (local mode only)

From the agent-interition root:

```bash
ANTHROPIC_API_KEY=dummy INTERITION_PASSPHRASE=dummy \
docker compose -f docker/docker-compose.dogfood.yml build css
```

Note: Compose validates all env vars even when building a single service, so dummy values are needed.

### 3. Build the Skill

```bash
npm run skill:build
```

Output goes to `skill/solid-agent-storage/`. This directory is mounted read-only into the OpenClaw container.

### 4. Generate a gateway token

```bash
openssl rand -hex 32
```

Save this — you'll need it to authenticate with the Web UI.

### 5. Start the stack

Template scripts are provided — copy and fill in your credentials:

```bash
cp template-start-local.sh start-local.sh    # for local mode
cp template-start-remote.sh start-remote.sh  # for remote mode
# Edit the copied file with your actual API key, passphrase, and gateway token
```

The `start-*.sh` files are gitignored so your credentials won't be committed.

**Local CSS:**

```bash
./start-local.sh
# or manually:
ANTHROPIC_API_KEY=sk-ant-... \
INTERITION_PASSPHRASE=your-passphrase \
OPENCLAW_GATEWAY_TOKEN=your-token \
docker compose -f docker/docker-compose.dogfood.yml --profile local up
```

**Remote CSS (e.g. solidcommunity.net):**

```bash
./start-remote.sh
# or manually:
ANTHROPIC_API_KEY=sk-ant-... \
INTERITION_PASSPHRASE=your-passphrase \
OPENCLAW_GATEWAY_TOKEN=your-token \
SOLID_SERVER_URL=https://solidcommunity.net \
docker compose -f docker/docker-compose.dogfood.yml --profile remote up
```

To use a different remote Solid server, change `SOLID_SERVER_URL` and update the domain in `docker/squid-remote.conf`.

### 6. Access the Web UI

Open `http://localhost:18789` in your browser. Enter the gateway token when prompted.

### 7. Test the Skill

Talk to the OpenClaw agent through the Web UI:

1. **Provision an agent:** "Use the solid-agent-storage skill to provision an agent called alpha with display name Agent Alpha"
2. **Write data:** "Use the solid-agent-storage skill to write a note to alpha's memory"
3. **Read it back:** "Use the solid-agent-storage skill to read alpha's memory"
4. **Test sharing:** "Provision a second agent called beta, then grant beta read access to alpha's data"

## Configuration Files

### docker/openclaw-config.json

```json
{
  "gateway": {
    "bind": "lan",
    "port": 18789,
    "controlUi": {
      "allowInsecureAuth": true
    }
  }
}
```

- `bind: "lan"` — binds gateway to `0.0.0.0` so Docker port mapping works (read from config file, not env vars)
- `port: 18789` — gateway port
- `allowInsecureAuth: true` — token-only auth, skips device pairing (required for Docker/HTTP)

### docker/squid.conf (local mode)

Restricts all outbound traffic to `api.anthropic.com` on port 443 only.

### docker/squid-remote.conf (remote mode)

Allows `api.anthropic.com` and `solidcommunity.net` on port 443. Edit this file to allow a different Solid server domain.

### docker/entrypoint.sh

CSS entrypoint. Supports optional `SAP_BASE_URL` env var for overriding the base URL (not used in local mode — defaults to `http://localhost:3000`).

## Gotchas We Hit

### 1. Named volume permissions (EACCES)

**Problem:** OpenClaw runs as uid 1000 but Docker creates named volumes owned by root.

**Solution:** The `init-volumes` service runs as root, creates the workspace directory structure, does `chown -R 1000:1000` on the volumes, then exits. OpenClaw's `depends_on` waits for this to complete before starting.

### 2. Workspace directory permissions (EACCES on AGENTS.md)

**Problem:** The skill bind mount at `.../workspace/skills/solid-agent-storage:ro` causes Docker to create intermediate directories (`workspace/`, `workspace/skills/`) as root. OpenClaw can't write to `workspace/` even though the parent volume is writable.

**Solution:** The `init-volumes` service explicitly creates `mkdir -p /home/node/.openclaw/workspace/skills` before chowning, ensuring the workspace directory is owned by uid 1000.

### 3. Gateway binding (ERR_EMPTY_RESPONSE)

**Problem:** OpenClaw's gateway defaults to binding on `127.0.0.1` (loopback). Inside a Docker container, Docker's port mapping can't reach it.

**Solution:** Set `gateway.bind: "lan"` in `openclaw.json`. This binds to `0.0.0.0` inside the container.

**Important:** This setting is read from the config file (`~/.openclaw/openclaw.json`), not from environment variables. Confirmed by tracing source: `bind: params.cfg.gateway?.bind ?? "loopback"` in `configure-D2gIsBVi.js`.

### 4. Config file name (still ERR_EMPTY_RESPONSE)

**Problem:** We initially mounted the config as `config.json`. OpenClaw reads `openclaw.json`.

**Solution:** Found by tracing `entry.js` line 156: `env.OPENCLAW_CONFIG_PATH = path.join(stateDir, "openclaw.json")`. Correct mount: `./openclaw-config.json:/home/node/.openclaw/openclaw.json:ro`.

### 5. Device pairing over Docker (1008: pairing required)

**Problem:** OpenClaw's Control UI uses device identity (IP-based pairing). Docker NAT translates the browser's IP, causing a mismatch.

**Solution:** Set `gateway.controlUi.allowInsecureAuth: true` in `openclaw.json`. Switches to token-only auth. This is OpenClaw's documented approach for HTTP/Docker setups.

**Security note:** Acceptable here because the port is bound to `127.0.0.1` (localhost only) and the gateway token is still required.

### 6. CSS WebID token validation (401 Unauthorized) — local mode only

**Problem:** CSS requires WebID URIs in tokens to be HTTPS or HTTP on localhost. When CSS was configured with base URL `http://css:3000`, it issued tokens with WebID `http://css:3000/alpha/profile/card#me`. CSS then rejected these tokens as insecure.

**Error from CSS logs:**
```
Error verifying WebID via Bearer access token: The URI claim could not be verified as secure.
Actual: http://css:3000/alpha/profile/card#me
Expected: The webid claim to be an HTTPS URI or a localhost with port number HTTP URI
```

**Solution:** Use `network_mode: service:css` so OpenClaw shares CSS's network namespace. CSS keeps its default base URL of `http://localhost:3000`, OpenClaw reaches CSS at `localhost:3000`, and WebID tokens use `http://localhost:3000/...` which CSS accepts.

**Note:** This issue does not apply to remote mode — remote CSS uses HTTPS, so WebID URIs are HTTPS and pass validation.

## Files

| File | Purpose |
|------|---------|
| `docker/docker-compose.dogfood.yml` | Orchestrates services with `local` and `remote` profiles |
| `docker/openclaw-config.json` | OpenClaw gateway configuration (bind, port, auth) |
| `docker/squid.conf` | Proxy whitelist for local mode (api.anthropic.com only) |
| `docker/squid-remote.conf` | Proxy whitelist for remote mode (api.anthropic.com + Solid server) |
| `docker/Dockerfile` | CSS image (reused from Phase 1) |
| `docker/entrypoint.sh` | CSS entrypoint (supports optional SAP_BASE_URL) |
| `template-start-local.sh` | Template startup script for local mode (copy to `start-local.sh` and fill in credentials) |
| `template-start-remote.sh` | Template startup script for remote mode (copy to `start-remote.sh` and fill in credentials) |

## Tearing Down

```bash
docker compose -f docker/docker-compose.dogfood.yml --profile local down
# or
docker compose -f docker/docker-compose.dogfood.yml --profile remote down
```

To also remove the named volumes (deletes all Pod data and OpenClaw state):

```bash
docker compose -f docker/docker-compose.dogfood.yml --profile local down -v
```
