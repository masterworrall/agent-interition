# Agent Lab A3 — Scripted Walkthrough

Two AI agents — Scout and Analyst — demonstrate Solid Protocol boundary enforcement using WebIDs and Pods on crawlout.io. Each agent runs in its own OpenClaw instance. Access is denied by default and granted explicitly.

The user drives both agents by typing prompts into their respective OpenClaw UIs. The agents use the Solid Agent Storage skill (installed from ClawHub) to provision identities, store data, and manage access control.

## What This Demonstrates

Three boundary moments that prove the Solid Protocol's access control model:

| Moment | What happens | HTTP Status |
|--------|-------------|-------------|
| **Denied** | Analyst tries to read Scout's data without permission | 403 Forbidden |
| **Granted** | Scout grants Analyst read access, Analyst reads successfully | 200 OK |
| **Revoked** | Scout revokes access, Analyst is denied again | 403 Forbidden |

No out-of-band coordination beyond WebIDs. The only thing shared between agents is the WebID URL. Everything else — authentication, storage, access control — flows through the Solid Protocol.

## Prerequisites

- Two OpenClaw instances, each with:
  - An Anthropic API key
  - The `jq` binary available (Docker users: build with `--build-arg OPENCLAW_DOCKER_APT_PACKAGES=jq`)
  - Network access to `https://crawlout.io`
- A Solid server — this walkthrough uses [crawlout.io](https://crawlout.io) (operated by Interition)

### Docker Setup (optional)

If running OpenClaw in Docker, a reference `docker-compose.yml` is provided in the `agent-lab/` directory that starts two OpenClaw instances:

- **Scout** on port 18791
- **Analyst** on port 18792

See `agent-lab/start.sh.template` for configuration. Copy to `start.sh`, fill in your API key, passphrases, and gateway tokens, then run `./start.sh`. Use `./start.sh help` for all commands.

**Browser access via Docker:** If accessing from a remote machine, use an SSH tunnel so the browser connects via localhost (required for OpenClaw's secure context):

```bash
ssh -L 18791:localhost:18791 -L 18792:localhost:18792 user@your-server
```

Then open `http://localhost:18791` (Scout) and `http://localhost:18792` (Analyst).

**Device pairing:** On first browser connection, approve the device on the server:

```bash
docker exec -it agent-lab-scout-1 node /app/openclaw.mjs devices list
docker exec -it agent-lab-scout-1 node /app/openclaw.mjs devices approve <requestId>
```

Repeat for analyst.

---

## The Walkthrough

Each step shows a **prompt you type into the OpenClaw UI**. The agent reads the Solid Agent Storage skill instructions and determines the right commands to run.

### Step 1: Install the Solid Agent Storage skill

**Tell Scout:**

> Install the solid-agent-storage skill from ClawHub.

**Expected:** The agent downloads and installs the skill. It will advise starting a new session for the skill to take effect.

Start a new session in Scout (use `/new` or the new chat button).

**Tell Analyst:** the same prompt. Start a new session after install.

Both agents now have the Solid Agent Storage skill available.

### Step 2: Create Scout's identity and storage

**Tell Scout:**

> Create a WebID and Pod for an agent called "scout" with display name "Scout Agent".

**Expected:** The agent runs the provisioning script and reports:

```
WebID: https://crawlout.io/scout/profile/card#me
Pod:   https://crawlout.io/scout/
```

Note Scout's WebID — Analyst will need it later.

### Step 3: Create Analyst's identity and storage

**Tell Analyst:**

> Create a WebID and Pod for an agent called "analyst" with display name "Analyst Agent".

**Expected:**

```
WebID: https://crawlout.io/analyst/profile/card#me
Pod:   https://crawlout.io/analyst/
```

### Step 4: Scout writes research findings

**Tell Scout:**

> Write a Turtle resource to your Pod at the path `shared/findings.ttl` with this content:
>
> ```turtle
> @prefix schema: <http://schema.org/>.
> <#finding-1> a schema:Dataset;
>   schema:name "Shared Research Findings";
>   schema:description "Cross-agent collaboration proof of concept";
>   schema:dateCreated "2026-03-05".
> ```

**Expected:** The agent gets a token, PUTs the resource, and confirms success.

### Step 5: Analyst tries to read Scout's data — DENIED

**Tell Analyst:**

> Read the resource at `https://crawlout.io/scout/shared/findings.ttl` using your credentials.

**Expected:** **403 Forbidden.** Access is denied by default — Analyst has no permission to read Scout's data. This is the first boundary moment.

### Step 6: Scout grants Analyst read access

**Tell Scout:**

> Grant read access on `shared/findings.ttl` to the agent with WebID `https://crawlout.io/analyst/profile/card#me`.

**Expected:** The agent creates an ACL document on `shared/findings.ttl.acl` that grants Analyst `acl:Read` while preserving Scout's full control.

### Step 7: Analyst reads Scout's data — GRANTED

**Tell Analyst:**

> Read the resource at `https://crawlout.io/scout/shared/findings.ttl` using your credentials.

**Expected:** **200 OK.** The agent returns the Turtle content. Cross-Pod access works. This is the second boundary moment.

### Step 8: Scout revokes Analyst's access

**Tell Scout:**

> Revoke analyst's access to `shared/findings.ttl`. Analyst's WebID is `https://crawlout.io/analyst/profile/card#me`.

**Expected:** The agent updates the ACL document, removing Analyst's authorization rule while keeping Scout's owner rule.

### Step 9: Analyst tries to read again — DENIED

**Tell Analyst:**

> Read the resource at `https://crawlout.io/scout/shared/findings.ttl` using your credentials.

**Expected:** **403 Forbidden.** Access has been revoked. This is the third boundary moment.

---

## Summary

| Step | Who | Action | Result |
|------|-----|--------|--------|
| 1 | Both | Install skill from ClawHub | Skill available |
| 2 | Scout | Provision WebID and Pod | Identity created on crawlout.io |
| 3 | Analyst | Provision WebID and Pod | Identity created on crawlout.io |
| 4 | Scout | Write research findings | Resource created in Pod |
| 5 | Analyst | Read Scout's findings | **403 Forbidden** |
| 6 | Scout | Grant Analyst read access | ACL created |
| 7 | Analyst | Read Scout's findings | **200 OK** |
| 8 | Scout | Revoke Analyst's access | ACL updated |
| 9 | Analyst | Read Scout's findings | **403 Forbidden** |

## What This Proves

- **Agents run separately, identity and storage are shared infrastructure.** Scout and Analyst are independent OpenClaw instances. crawlout.io holds their WebIDs and Pods, but the agents run wherever you start them.
- **Access is denied by default.** Step 5 proves it.
- **Access is granted per-resource, per-agent.** Step 6 gives Analyst read access to one specific resource — nothing else.
- **Access is revocable.** Steps 8–9 prove revocation works immediately.
- **No proprietary wrappers.** The skill provides provisioning scripts and token helpers. All data operations (read, write, ACL) use standard Solid Protocol HTTP requests that work against any compliant server.
- **Everything runs through the skill.** No CLI tools, no dev APIs, no code. If it can't be done through the published skill, it's not in the demo.

## Cleanup

**Tell Scout:**

> Delete the WebID and Pod for the agent called "scout".

**Tell Analyst:**

> Delete the WebID and Pod for the agent called "analyst".

If running Docker:

```bash
./start.sh down -v
```

## Technology

| Component | What | Role |
|-----------|------|------|
| [Solid Protocol](https://solidproject.org/TR/protocol) | W3C standard | Identity (WebID), storage (Pod), access control (WAC) |
| [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) | Open-source server | Hosts WebIDs and Pods on crawlout.io |
| [crawlout.io](https://crawlout.io) | Interition-operated CSS | Production Solid server for this demo |
| [OpenClaw](https://github.com/openclaw/openclaw) | AI agent framework | Runs Scout and Analyst |
| [Solid Agent Storage](https://clawhub.ai) | OpenClaw Skill | Provisioning, authentication, and Solid protocol reference |
