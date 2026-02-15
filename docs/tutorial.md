# Give Your Agents Memory with Solid

Your OpenClaw agent can remember things — it writes daily markdown logs, searches over them, and loads recent context at startup. But that memory lives in local files on one machine, managed by one agent. You don't control who sees it, you can't share a specific finding with a specific agent while keeping everything else private, and a third-party agent on someone else's machine has no way to access it at all.

This tutorial gives your agents something different: **a personal data store they own, with an identity other agents can verify, and fine-grained access control you manage**.

In about 30 minutes you'll set up:

- **A Pod** — a personal data store for each agent, backed by the Solid Protocol
- **A WebID** — a portable identity that any agent or service can look up and verify
- **Per-resource, per-agent access control** — share specific data with specific agents, with specific permissions (Read, Write, or both), and revoke access at any time

Everything runs locally on your machine. You own all of it.

## Prerequisites

- **Node.js 20+** ([nodejs.org](https://nodejs.org))
- **Docker** ([docker.com](https://www.docker.com/get-started/)) — for running the Solid server
- A terminal and about 30 minutes

## Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/interition/agent-interition.git
cd agent-interition
npm install
```

Start the Community Solid Server (CSS) — this is the data store that holds your agents' Pods:

```bash
npm run css:start
```

Leave that running in its terminal. Open a new terminal for the rest of the tutorial.

Build the project so the CLI commands are available:

```bash
npm run build
```

Set a passphrase that will encrypt your agents' credentials on disk:

```bash
export INTERITION_PASSPHRASE="my-tutorial-passphrase"
```

> In production you'd use a strong, unique passphrase. For this tutorial, anything will do.

The Solid server URL defaults to `http://localhost:3000`. If yours is different, also set:

```bash
export SOLID_SERVER_URL="http://localhost:3000"
```

That's it. You're ready.

## Part 1: Give Your Agent an Identity

Let's create an agent called `researcher` with a display name of "Research Assistant":

```bash
node dist/cli/provision.js --name researcher --displayName "Research Assistant"
```

You should see:

```json
{"status":"ok","agent":"researcher","webId":"http://localhost:3000/researcher/profile/card#me","podUrl":"http://localhost:3000/researcher/"}
```

What just happened:

1. A **WebID** was created — `http://localhost:3000/researcher/profile/card#me`. This is your agent's identity on the web. Any other agent or service can look up this URL to find out who it is.
2. A **Pod** was created at `http://localhost:3000/researcher/`. This is your agent's personal data store, with containers for `/memory/`, `/shared/`, and `/conversations/`.
3. **Client credentials** were generated and encrypted on disk at `~/.interition/agents/researcher/credentials.enc`. These let your agent authenticate to its Pod without a password prompt.

You can verify the WebID profile is publicly accessible:

```bash
curl -H "Accept: text/turtle" http://localhost:3000/researcher/profile/card
```

You'll see a Turtle document describing your agent — its name, its type (`foaf:Agent`), and links to its Pod.

## Part 2: Store and Retrieve Data

### Write a plain-text note

```bash
node dist/cli/write.js --agent researcher \
  --url "http://localhost:3000/researcher/memory/todo.txt" \
  --content "Buy more GPU credits" \
  --content-type "text/plain"
```

```json
{"status":"ok","url":"http://localhost:3000/researcher/memory/todo.txt","contentType":"text/plain","httpStatus":205}
```

### Read it back

```bash
node dist/cli/read.js --agent researcher \
  --url "http://localhost:3000/researcher/memory/todo.txt"
```

```json
{"status":"ok","url":"http://localhost:3000/researcher/memory/todo.txt","contentType":"text/plain","body":"Buy more GPU credits"}
```

The data is stored in the agent's Pod on the Solid server. Restart the server, restart your machine — the data persists.

### Write structured data (Turtle)

Plain text works, but Turtle (RDF) lets agents store structured, linked data that's machine-readable:

```bash
node dist/cli/write.js --agent researcher \
  --url "http://localhost:3000/researcher/memory/preferences.ttl" \
  --content '@prefix schema: <http://schema.org/>.
<#pref-1> a schema:PropertyValue;
  schema:name "summary-style";
  schema:value "bullet-points".
<#pref-2> a schema:PropertyValue;
  schema:name "detail-level";
  schema:value "concise".' \
  --content-type "text/turtle"
```

```json
{"status":"ok","url":"http://localhost:3000/researcher/memory/preferences.ttl","contentType":"text/turtle","httpStatus":205}
```

Now your agent's preferences survive across sessions. Any time it starts up, it can read `preferences.ttl` and know how the user likes their summaries.

## Part 3: Multi-Agent Collaboration with Access Control

This is where things get interesting. We'll provision three agents that work together — with different levels of access.

### Set up the team

```bash
node dist/cli/provision.js --name writer --displayName "Content Writer"
node dist/cli/provision.js --name reviewer --displayName "Review Editor"
```

Check that all three agents are provisioned:

```bash
node dist/cli/status.js
```

```json
{
  "status": "ok",
  "agents": [
    { "name": "researcher", "webId": "http://localhost:3000/researcher/profile/card#me", "podUrl": "http://localhost:3000/researcher/" },
    { "name": "writer", "webId": "http://localhost:3000/writer/profile/card#me", "podUrl": "http://localhost:3000/writer/" },
    { "name": "reviewer", "webId": "http://localhost:3000/reviewer/profile/card#me", "podUrl": "http://localhost:3000/reviewer/" }
  ]
}
```

### Researcher publishes findings

The researcher writes findings to its `/shared/` container:

```bash
node dist/cli/write.js --agent researcher \
  --url "http://localhost:3000/researcher/shared/findings.ttl" \
  --content '@prefix schema: <http://schema.org/>.
<#finding-1> a schema:Dataset;
  schema:name "API Performance Analysis";
  schema:description "Response times average 230ms under load. Rate limit is 100 req/min.";
  schema:dateModified "2026-02-15".' \
  --content-type "text/turtle"
```

### Writer and reviewer try to read — both blocked

By default, only the owner can access their Pod resources. Let's verify:

```bash
node dist/cli/read.js --agent writer \
  --url "http://localhost:3000/researcher/shared/findings.ttl"
```

```json
{"error":"HTTP 403","body":"..."}
```

The writer gets a 403 Forbidden. Same for the reviewer:

```bash
node dist/cli/read.js --agent reviewer \
  --url "http://localhost:3000/researcher/shared/findings.ttl"
```

```json
{"error":"HTTP 403","body":"..."}
```

Good. The data is private by default.

### Grant differentiated access

Now the researcher grants access — but with different permissions for each agent:

**Writer gets Read + Write** (can read and update the findings):

```bash
node dist/cli/grant-access.js --agent researcher \
  --resource "http://localhost:3000/researcher/shared/findings.ttl" \
  --grantee "http://localhost:3000/writer/profile/card#me" \
  --modes "Read,Write"
```

**Reviewer gets Read only** (can view but not modify):

```bash
node dist/cli/grant-access.js --agent researcher \
  --resource "http://localhost:3000/researcher/shared/findings.ttl" \
  --grantee "http://localhost:3000/reviewer/profile/card#me" \
  --modes "Read"
```

### Writer reads and updates — success

```bash
node dist/cli/read.js --agent writer \
  --url "http://localhost:3000/researcher/shared/findings.ttl"
```

```json
{"status":"ok","url":"http://localhost:3000/researcher/shared/findings.ttl","contentType":"text/turtle","body":"@prefix schema: ..."}
```

The writer can also update the findings (they have Write access):

```bash
node dist/cli/write.js --agent writer \
  --url "http://localhost:3000/researcher/shared/findings.ttl" \
  --content '@prefix schema: <http://schema.org/>.
<#finding-1> a schema:Dataset;
  schema:name "API Performance Analysis";
  schema:description "Response times average 230ms under load. Rate limit is 100 req/min. Recommendation: implement caching layer.";
  schema:dateModified "2026-02-15".' \
  --content-type "text/turtle"
```

```json
{"status":"ok","url":"http://localhost:3000/researcher/shared/findings.ttl","contentType":"text/turtle","httpStatus":205}
```

### Reviewer reads — success; tries to write — blocked

```bash
node dist/cli/read.js --agent reviewer \
  --url "http://localhost:3000/researcher/shared/findings.ttl"
```

```json
{"status":"ok","url":"http://localhost:3000/researcher/shared/findings.ttl","contentType":"text/turtle","body":"@prefix schema: ..."}
```

But the reviewer cannot modify the findings:

```bash
node dist/cli/write.js --agent reviewer \
  --url "http://localhost:3000/researcher/shared/findings.ttl" \
  --content "Unauthorized edit attempt" \
  --content-type "text/plain"
```

```json
{"error":"HTTP 403","body":"..."}
```

Read-only means read-only.

### Revoke access

The researcher decides the writer's work is done and revokes their access:

```bash
node dist/cli/revoke-access.js --agent researcher \
  --resource "http://localhost:3000/researcher/shared/findings.ttl" \
  --grantee "http://localhost:3000/writer/profile/card#me"
```

Now the writer is blocked again:

```bash
node dist/cli/read.js --agent writer \
  --url "http://localhost:3000/researcher/shared/findings.ttl"
```

```json
{"error":"HTTP 403","body":"..."}
```

But the reviewer still has access — each agent's permissions are independent:

```bash
node dist/cli/read.js --agent reviewer \
  --url "http://localhost:3000/researcher/shared/findings.ttl"
```

```json
{"status":"ok","url":"http://localhost:3000/researcher/shared/findings.ttl","contentType":"text/turtle","body":"@prefix schema: ..."}
```

This is the key insight: access control is **per-resource, per-agent, per-mode**. Not all-or-nothing. You grant exactly what's needed, and revoke it the moment it's not.

## Part 4: Sharing Beyond Your Machine

Everything so far runs on a single machine — all three agents share the same Solid server at `localhost:3000`. That's fine for agents you run yourself, but what about agents run by other people, on other machines?

### Local vs Remote Sharing

```
LOCAL SHARING (what we just did)
================================

  ┌──────────────────────────────────┐
  │  Your Machine                    │
  │                                  │
  │  researcher ─┐                   │
  │  writer ─────┼── localhost:3000  │
  │  reviewer ───┘                   │
  │                                  │
  └──────────────────────────────────┘

  All agents authenticate to the same CSS.
  WebIDs are localhost URLs — not reachable from outside.


REMOTE SHARING (what's coming)
================================

  ┌──────────────┐       ┌──────────────┐
  │  Your Machine│       │  Their Machine│
  │              │       │               │
  │  researcher  │◄─────►│  analyst      │
  │  Pod + WebID │  WAC  │  Pod + WebID  │
  │              │       │               │
  └──────┬───────┘       └───────┬───────┘
         │                       │
    Cloudflare Tunnel      Cloudflare Tunnel
         │                       │
    https://your.tunnel    https://their.tunnel
```

For remote sharing to work, two things need to change:

1. **Pods need public URLs.** A `localhost` URL can't be reached from another machine. A Cloudflare tunnel (or similar) gives your Pod a public HTTPS URL like `https://your-agent.example.com`.
2. **WebIDs need to resolve publicly.** When a remote agent checks your WebID, it needs to fetch the profile document over the internet.

The good news: **the access control model is identical**. WAC works the same way whether agents are on the same machine or across the globe. The `grant-access.sh` and `revoke-access.sh` commands don't change — you just use public URLs instead of localhost ones.

Remote sharing via Cloudflare tunnels is planned for Phase 3. The protocol layer is already in place — it's the same HTTP + WAC we used throughout this tutorial.

## Part 5: What Just Happened

Let's step back and name the concepts you've been using:

**WebID** — A URL that identifies an agent. Like `http://localhost:3000/researcher/profile/card#me`. Anyone can look up this URL to find the agent's profile. It's a W3C standard.

**Pod** — A personal data store at a URL like `http://localhost:3000/researcher/`. It holds containers (like folders) and resources (like files). The agent that owns a Pod has full control over what's in it and who can access it.

**WAC (Web Access Control)** — The permission system. Each resource can have an Access Control List that specifies exactly who can Read, Write, Append, or Control it. Permissions are per-resource and per-agent.

**Solid Protocol** — The W3C specification that ties all of this together. It's built on standard HTTP, which means any programming language and any HTTP client can participate. Your agents don't need special libraries — just `fetch`.

This is why Solid matters for agents: any agent, anywhere, built with any framework or LLM, can participate in this ecosystem. All it needs is a WebID. The data format is open (RDF/Turtle), the protocol is standard (HTTP), and the identity system is decentralized (WebIDs are just URLs).

For a deeper dive into these concepts, see the [Solid Protocol Primer](../skill-src/references/solid-primer.md).

## Part 6: Next Steps

**Install as an OpenClaw Skill.** Once published to ClawHub, you'll be able to install this as a Skill and let your OpenClaw agents use Pods autonomously — reading and writing data, managing access, all driven by the agent's own decisions.

**Explore SKILL.md.** The [SKILL.md](../skill-src/SKILL.md) file shows exactly how an AI agent uses these commands. It's the instruction set that OpenClaw reads when your agent needs to interact with its Pod.

**Remote sharing.** Phase 3 will add Cloudflare tunnel integration so agents on different machines can share data with each other using the same WAC commands you learned here.

**Build your own integration.** The CLI commands are thin wrappers around standard HTTP calls. If you're building a custom agent (not using OpenClaw), you can use the TypeScript library directly:

```typescript
import { provisionAgent } from '@interition/agent-interition/bootstrap/agent-provisioner';
import { getAuthenticatedFetch } from '@interition/agent-interition/auth/client-credentials';
```

## Cleanup

To remove everything from this tutorial:

```bash
# Stop the Solid server (Ctrl+C in its terminal)

# Remove agent credentials
rm -rf ~/.interition/agents/researcher
rm -rf ~/.interition/agents/writer
rm -rf ~/.interition/agents/reviewer

# Remove server data
rm -rf .solid-data
```
