# Exercise: Multi-Agent Sharing

Two independent OpenClaw agents, each running in its own container, share data through a common Solid server. Each agent has its own WebID and Pod. Access is denied by default and granted explicitly.

The user drives both agents by typing prompts into their respective OpenClaw UIs. The agents determine the right commands to run based on the Solid Agent Storage skill instructions.

## Prerequisites

- Docker Desktop
- An Anthropic API key

## Setup

### 1. Build the OpenClaw Docker image

Clone OpenClaw somewhere convenient and build the image (only needed once):

```bash
git clone https://github.com/openclaw/openclaw.git
cd OpenClaw
docker build -t openclaw:local .
```

The image is ~2.8 GB. Subsequent builds use cache. If `openclaw:local` gets removed (e.g. by `docker system prune`), rebuild from this directory.

### 2. Build the Skill and CSS image

Back in the agent-interition directory, build the Skill package and the CSS Docker image:

```bash
cd /path/to/agent-interition
npm run skill:build

ANTHROPIC_API_KEY=dummy INTERITION_PASSPHRASE=dummy \
OPENCLAW_ALPHA_TOKEN=dummy OPENCLAW_BETA_TOKEN=dummy \
docker compose -f docker/docker-compose.exercise.yml build css
```

> The `dummy` values are not real credentials. Docker Compose validates that all required environment variables are present even when only building an image, so placeholder values are needed to satisfy that check.

### 3. Generate gateway tokens

Each OpenClaw instance needs its own gateway token:

```bash
echo "Alpha token: $(openssl rand -hex 32)"
echo "Beta token:  $(openssl rand -hex 32)"
```

Save both — you'll need them to access each agent's web UI.

### 4. Create a start script

```bash
cp template-start-exercise.sh start-exercise.sh
```

Edit `start-exercise.sh` with your Anthropic API key, passphrase, and both gateway tokens. The file is gitignored so your credentials won't be committed.

### 5. Start the stack

```bash
./start-exercise.sh
```

Or run manually:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key \
INTERITION_PASSPHRASE=your-passphrase \
OPENCLAW_ALPHA_TOKEN=your-alpha-token \
OPENCLAW_BETA_TOKEN=your-beta-token \
docker compose -f docker/docker-compose.exercise.yml up
```

This starts:
- **CSS** — the Solid server at `localhost:3000`
- **Alpha** — OpenClaw instance with gateway at `http://localhost:18789`
- **Beta** — OpenClaw instance with gateway at `http://localhost:18790`
- **Proxy** — Squid firewall restricting outbound to `api.anthropic.com` only

Both OpenClaw instances share CSS's network namespace so they reach the Solid server at `localhost:3000` (required for WebID token validation).

### 6. Open both UIs

- **Alpha:** `http://localhost:18789` — enter Alpha's gateway token
- **Beta:** `http://localhost:18790` — enter Beta's gateway token

You now have two independent OpenClaw agents, each in its own container with its own credentials volume, both with the Solid Agent Storage skill installed.

---

## The Exercise

Each step shows a **prompt you type into the OpenClaw UI**. The agent reads SKILL.md and figures out the right commands. Expected outcomes are shown so you can verify each step worked.

### Step 1: Provision Alpha

**Tell Alpha (port 18789):**

> Provision a new Solid agent called "alpha" with display name "Alpha Agent".

**Expected:** The agent runs `scripts/provision.sh` and reports Alpha's WebID and Pod URL.

Note Alpha's WebID — you'll need it in a moment:
```
http://localhost:3000/alpha/profile/card#me
```

### Step 2: Provision Beta

**Tell Beta (port 18790):**

> Provision a new Solid agent called "beta" with display name "Beta Agent".

**Expected:** The agent provisions Beta and reports its WebID:
```
http://localhost:3000/beta/profile/card#me
```

### Step 3: Alpha writes research findings

**Tell Alpha:**

> Write a Turtle resource to alpha's Pod at the path `shared/findings.ttl` with this content:
>
> ```turtle
> @prefix schema: <http://schema.org/>.
> <#finding-1> a schema:Dataset;
>   schema:name "Shared Research Findings";
>   schema:description "Cross-agent collaboration proof of concept";
>   schema:dateCreated "2026-02-21".
> ```

**Expected:** The agent gets a token, PUTs the resource, and confirms success.

### Step 4: Verify Alpha can read its own data

**Tell Alpha:**

> Read the resource at `shared/findings.ttl` in alpha's Pod.

**Expected:** The agent reads back the Turtle content you just wrote.

### Step 5: Beta tries to read Alpha's data (should fail)

**Tell Beta:**

> Read the resource at `http://localhost:3000/alpha/shared/findings.ttl` using beta's credentials.

**Expected:** The agent reports a **403 Forbidden** error. Access is denied by default — Beta has no permission to read Alpha's data.

### Step 6: Alpha grants Beta read access

**Tell Alpha:**

> Grant read access on `shared/findings.ttl` to the agent with WebID `http://localhost:3000/beta/profile/card#me`.

**Expected:** The agent creates an ACL document on `shared/findings.ttl.acl` that grants Beta `acl:Read` while preserving Alpha's full control.

### Step 7: Beta reads Alpha's data (should succeed)

**Tell Beta:**

> Read the resource at `http://localhost:3000/alpha/shared/findings.ttl` using beta's credentials.

**Expected:** The agent returns the Turtle content — **200 OK**. Cross-Pod access works.

### Step 8: Beta writes a response to its own Pod

**Tell Beta:**

> Write a Turtle resource to beta's Pod at the path `shared/response.ttl` with this content:
>
> ```turtle
> @prefix schema: <http://schema.org/>.
> <#response-1> a schema:Comment;
>   schema:name "Response to Alpha Findings";
>   schema:text "Confirmed — the cross-agent sharing protocol works.";
>   schema:dateCreated "2026-02-21".
> ```

**Expected:** The agent writes the resource to Beta's Pod.

### Step 9: Beta grants Alpha read access

**Tell Beta:**

> Grant read access on `shared/response.ttl` to the agent with WebID `http://localhost:3000/alpha/profile/card#me`.

**Expected:** The agent creates an ACL on Beta's resource granting Alpha read access.

### Step 10: Alpha reads Beta's response (full round-trip)

**Tell Alpha:**

> Read the resource at `http://localhost:3000/beta/shared/response.ttl` using alpha's credentials.

**Expected:** Alpha reads Beta's response — **200 OK**. Bidirectional sharing is working.

### Step 11: Alpha revokes Beta's access

**Tell Alpha:**

> Revoke beta's access to `shared/findings.ttl`. Beta's WebID is `http://localhost:3000/beta/profile/card#me`.

**Expected:** The agent updates the ACL document, removing Beta's authorization rule while keeping Alpha's owner rule.

### Step 12: Beta tries to read again (should fail)

**Tell Beta:**

> Read the resource at `http://localhost:3000/alpha/shared/findings.ttl` using beta's credentials.

**Expected:** **403 Forbidden**. Access has been revoked.

---

## Summary

| Step | Who | Prompt (short form) | Expected |
|------|-----|---------------------|----------|
| 1 | Alpha | Provision alpha | WebID + Pod created |
| 2 | Beta | Provision beta | WebID + Pod created |
| 3 | Alpha | Write findings to alpha's Pod | Resource created |
| 4 | Alpha | Read alpha's findings | Content returned |
| 5 | Beta | Read alpha's findings as beta | 403 Forbidden |
| 6 | Alpha | Grant beta read access | ACL created |
| 7 | Beta | Read alpha's findings as beta | 200 OK |
| 8 | Beta | Write response to beta's Pod | Resource created |
| 9 | Beta | Grant alpha read access | ACL created |
| 10 | Alpha | Read beta's response as alpha | 200 OK |
| 11 | Alpha | Revoke beta's access | ACL updated |
| 12 | Beta | Read alpha's findings as beta | 403 Forbidden |

## Cleanup

**Tell Alpha:**

> Deprovision the agent called "alpha".

**Tell Beta:**

> Deprovision the agent called "beta".

Then tear down the stack:

```bash
./start-exercise.sh down
# or:
docker compose -f docker/docker-compose.exercise.yml down
```

To also remove all Pod data and OpenClaw state:

```bash
docker compose -f docker/docker-compose.exercise.yml down -v
```

## What This Demonstrates

- **Agents run separately, storage is shared infrastructure.** Alpha and Beta are independent OpenClaw containers. The CSS holds their identities (WebIDs) and storage (Pods), but the agents don't live there — they run wherever you start them.
- **Access is denied by default.** Step 5 proves it.
- **Access is granted per-resource, per-agent.** Step 6 gives Beta read access to one specific resource.
- **Sharing is bidirectional.** Steps 8-10 show both agents granting and consuming access.
- **Access is revocable.** Steps 11-12 prove revocation works immediately.
- **No out-of-band coordination beyond WebIDs.** The only thing shared between agents is the WebID URL. Everything else — authentication, storage, access control — flows through the Solid Protocol.

## Docker Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Shared Network Namespace (service:css)                          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Alpha        │  │  Beta         │  │  CSS (Solid Server)   │  │
│  │  OpenClaw     │  │  OpenClaw     │  │  :3000                │  │
│  │  :18789       │  │  :18790       │  │                       │  │
│  │              ─┼──┼──────────────┼─▶│  WebIDs + Pods        │  │
│  │  Own creds    │  │  Own creds    │  │  for both agents      │  │
│  │  volume       │  │  volume       │  │                       │  │
│  └──────────────┘  └──────────────┘  └────────────────────────┘  │
│                                                                   │
│  Ports exposed: 18789 (Alpha UI), 18790 (Beta UI)                │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Squid Proxy    │
│  :3128          │
│  Allows:        │
│  api.anthropic  │
│  .com only      │
└─────────────────┘
```

Each OpenClaw instance has its own named volumes for credentials and config, so they are fully isolated from each other. Both share CSS's network namespace so they reach the Solid server at `localhost:3000`.

## Files

| File | Purpose |
|------|---------|
| `docker/docker-compose.exercise.yml` | Orchestrates CSS + Alpha + Beta + proxy |
| `docker/openclaw-config-alpha.json` | Alpha gateway config (port 18789) |
| `docker/openclaw-config-beta.json` | Beta gateway config (port 18790) |
| `docker/squid.conf` | Proxy whitelist (api.anthropic.com only) |
| `template-start-exercise.sh` | Template startup script (copy to `start-exercise.sh`) |

## Reference

- `SKILL.md` — the instructions OpenClaw reads to understand Solid operations
- `references/solid-http-reference.md` — all curl patterns (what the agent runs under the hood)
- `references/troubleshooting.md` — common issues and fixes
- `docs/dogfooding-setup.md` — single-agent Docker environment (Phase 3)
