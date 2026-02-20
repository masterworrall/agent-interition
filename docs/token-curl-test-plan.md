# Token + Curl Dogfood Test Plan

End-to-end testing of the new Skill workflow: `get-token.sh` + curl replaces the old CRUD wrapper scripts. Tests cover the full agent lifecycle via OpenClaw — provisioning, reading, writing, sharing, unsharing, and deprovisioning — against both local and remote Docker profiles.

## What Changed

| Before | After |
|--------|-------|
| `read.sh`, `write.sh`, `grant-access.sh`, `revoke-access.sh` | `get-token.sh` + curl |
| Each operation had a dedicated script | OpenClaw reads SKILL.md and solid-http-reference.md to construct curl commands |
| Token management hidden inside scripts | Token is an explicit step — OpenClaw must manage expiry |

**Kept unchanged:** `provision.sh`, `deprovision.sh`, `status.sh` (CSS-specific operations).

## What We're Testing

1. **SKILL.md comprehension** — Does OpenClaw discover the two-step workflow (get token, then curl) without being told?
2. **Token lifecycle** — Does OpenClaw fetch tokens and handle expiry?
3. **Read/write via curl** — Can OpenClaw construct correct curl commands from the reference docs?
4. **Sharing via WAC** — Can OpenClaw build ACL Turtle documents and apply them with curl?
5. **Unsharing** — Can OpenClaw revoke access by rewriting ACLs?
6. **Full lifecycle** — Provision → use → share → unshare → deprovision, with cleanup verification
7. **Cleanup verification** — After deprovision, credentials are gone and CSS accounts are removed

## Known Gotchas

**Command visibility:** The OpenClaw web UI truncates long commands with an ellipsis. When you need to confirm OpenClaw used `curl` (not `node -e` with `fetch()`), ask: *"Show me the full command you just ran."* Several test prompts below explicitly ask OpenClaw to use curl and show its command.

**Shell escaping:** OpenClaw constructs shell commands from your prompt content. Apostrophes, backticks, and `$` in data can break shell quoting. All test content in this plan avoids these characters. If you improvise content, stick to simple ASCII without shell-special characters.

**curl availability:** If curl is not installed in the OpenClaw container, OpenClaw will fall back to `node -e` with `fetch()`. This still validates the token workflow but not the curl-based approach documented in SKILL.md. Check early (Test 2) and note the finding.

**Pod URL paths:** This test plan uses `/agents/alice/` as an example Pod path, but the actual path depends on CSS configuration. Your server may use `/alice/` instead of `/agents/alice/`. Always use the `podUrl` returned by `provision.sh` as the base — OpenClaw does this automatically. When a test prompt includes a hardcoded path like `/agents/alice/memory/notes.ttl`, substitute your actual Pod URL prefix. If OpenClaw gets it right from the provision output, that's the correct behaviour even if the path differs from this document.

## Prerequisites

### 1. Build the Skill

```bash
cd ~/Development/interition/crd-office/agent-interition
npm run build
npm run skill:build
```

### 2. Verify the skill output

```bash
# These should exist:
ls skill/solid-agent-storage/scripts/get-token.sh
ls skill/solid-agent-storage/scripts/provision.sh
ls skill/solid-agent-storage/scripts/deprovision.sh
ls skill/solid-agent-storage/scripts/status.sh
ls skill/solid-agent-storage/references/solid-http-reference.md

# These should NOT exist:
ls skill/solid-agent-storage/scripts/read.sh       # should fail
ls skill/solid-agent-storage/scripts/write.sh      # should fail
ls skill/solid-agent-storage/scripts/grant-access.sh   # should fail
ls skill/solid-agent-storage/scripts/revoke-access.sh  # should fail
```

### 3. Verify automated tests pass

```bash
npm test
```

All 48 tests should pass (4 integration tests skipped).

---

## Part A — Local Profile (`--profile local`)

### A0. Clean slate

Tear down any previous stack **and delete all named volumes** to clear leftover agents, CSS data, and OpenClaw state from previous sessions:

```bash
./start-local.sh down
```

Then remove the volumes. `docker compose down` does **not** remove named volumes by default — you must delete them explicitly:

```bash
docker volume rm docker_css-data docker_openclaw-config docker_interition-creds 2>/dev/null
```

**Verify volumes are gone:**

```bash
docker volume ls | grep docker_
```

**Expected:** No output. If any volumes remain (e.g. because a container is still using them), stop all containers first with `docker compose -f docker/docker-compose.dogfood.yml --profile local down` and retry.

> **Why this matters:** The `interition-creds` volume stores encrypted agent credentials at `/home/node/.interition/agents/`. If it survives between runs, `status.sh` will show agents from previous sessions. Agents provisioned with a different `INTERITION_PASSPHRASE` will show "Could not decrypt credentials" errors.

### A1. Start fresh

```bash
./start-local.sh
```

Wait for CSS to be ready and the OpenClaw gateway to appear, then open **http://localhost:18789**.

### A2. Verify no agents exist

Before any tests, confirm no agents are provisioned.

**Prompt OpenClaw:**

> List all provisioned agents.

**Expected:** OpenClaw runs `scripts/status.sh` and reports no agents found.

**If agents appear:** The volume cleanup in A0 didn't work. Tear down again, confirm volumes are deleted (`docker volume ls | grep docker_` should show nothing), and restart.

---

### Test 1: Provision two agents

**Prompt OpenClaw:**

> Provision two agents: "alice" with display name "Alice Agent" and "bob" with display name "Bob Agent".

**Expected:** OpenClaw runs `scripts/provision.sh` twice. Both succeed with WebIDs and Pod URLs:
- `http://localhost:3000/agents/alice/profile/card#me`
- `http://localhost:3000/agents/bob/profile/card#me`

**What to watch for:**
- Does OpenClaw use `provision.sh` (not curl) for this CSS-specific operation?

**Then prompt:**

> List all provisioned agents.

**Expected:** OpenClaw runs `scripts/status.sh`. Both `alice` and `bob` appear.

---

### Test 2: Write data using token + curl

> **Shell escaping note:** Avoid apostrophes, backticks, and other shell-special characters in test content. OpenClaw constructs shell commands and escaping issues cause silent data loss (CSS returns 200 but stores empty triples).

**Prompt OpenClaw:**

> Use curl to write a Turtle note to Alice's memory. Store it at /agents/alice/memory/notes.ttl with this content:
>
> ```turtle
> @prefix schema: <http://schema.org/>.
> <#note-1> a schema:Note;
>   schema:text "First observation by Alice";
>   schema:dateCreated "2026-02-19".
> ```
>
> Use scripts/get-token.sh to get a Bearer token, then curl with that token to PUT the data.

**Expected:** OpenClaw:
1. Runs `scripts/get-token.sh --agent alice` to get a Bearer token
2. Constructs a `curl -X PUT` with `Authorization: Bearer ...` and `Content-Type: text/turtle`
3. Reports success

**What to watch for:**
- Does OpenClaw use **curl** for the PUT? (The OpenClaw UI may truncate long commands — if the command is cut off after `node -e`, ask OpenClaw: "What command did you just run? Show the full command." to confirm it used curl, not `node -e` with `fetch()`.)
- Does it use `get-token.sh` (not the old `write.sh`)?
- Does it set `Content-Type: text/turtle`?
- Does it use the full URL `http://localhost:3000/agents/alice/memory/notes.ttl`?

---

### Test 3: Read data using token + curl

**Prompt OpenClaw:**

> Use curl to read back Alice's notes from /agents/alice/memory/notes.ttl. Show me the full curl command you use.

**Expected:** OpenClaw:
1. Gets a token (may reuse from Test 2 if within 8 minutes, or fetches a new one)
2. Runs `curl -s -H "Authorization: Bearer ..." http://localhost:3000/agents/alice/memory/notes.ttl`
3. Returns the Turtle content including "First observation by Alice"

**What to watch for:**
- Does OpenClaw use **curl** (not `node -e` or the old `read.sh`)? Asking it to show the full command makes this visible.
- Is the content returned correctly?

---

### Test 4: Write plain text and JSON

**Prompt OpenClaw:**

> Store two more resources for Alice:
> 1. Plain text "Meeting at 3pm tomorrow" at /agents/alice/memory/reminder.txt
> 2. JSON `{"priority": "high", "topic": "infrastructure"}` at /agents/alice/memory/task.json

**Expected:** OpenClaw writes both resources with the correct content types (`text/plain` and `application/json` respectively).

**Then prompt:**

> Read back both resources — the reminder and the task — and show me their contents.

**Expected:** OpenClaw reads both back via curl with Alice's token. The content matches what was written.

---

### Test 5: List container contents

**Prompt OpenClaw:**

> List the contents of Alice's memory container at /agents/alice/memory/.

**Expected:** OpenClaw GETs the container URL (with trailing slash!) and returns an `ldp:contains` listing showing `notes.ttl`, `reminder.txt`, and `task.json`.

**What to watch for:**
- Does OpenClaw include the trailing `/` on the container URL?
- Does it parse the Turtle response to list the contained resources?

---

### Test 6: Write data for Bob

**Prompt OpenClaw:**

> Use curl to write a Turtle note to Bob's memory at /agents/bob/memory/notes.ttl:
>
> ```turtle
> @prefix schema: <http://schema.org/>.
> <#note-1> a schema:Note;
>   schema:text "Private thought from Bob";
>   schema:dateCreated "2026-02-19".
> ```

**Expected:** Succeeds. Bob now has data in his Pod.

---

### Test 7: Verify isolation — Bob cannot read Alice's data

**Prompt OpenClaw:**

> Using Bob's credentials, try to read Alice's notes at http://localhost:3000/agents/alice/memory/notes.ttl.

**Expected:** OpenClaw gets a token for Bob and curls Alice's resource. The server returns **403 Forbidden** — Bob has no access to Alice's Pod.

**What to watch for:**
- Does OpenClaw correctly report the 403 rather than retrying or hallucinating success?

---

### Test 8: Grant access — Alice shares with Bob

**Prompt OpenClaw:**

> Alice wants to share her notes with Bob. Grant Bob read access to http://localhost:3000/agents/alice/memory/notes.ttl. Bob's WebID is http://localhost:3000/agents/bob/profile/card#me.

**Expected:** OpenClaw:
1. Gets a token for Alice
2. Discovers the ACL URL (HEAD request, or appends `.acl`)
3. PUTs a Turtle ACL document with:
   - An owner rule for Alice (Read, Write, Control)
   - A grantee rule for Bob (Read)
4. Reports success

**What to watch for:**
- Does OpenClaw include the **owner rule** so Alice doesn't lock herself out?
- Does it use the correct ACL predicates (`acl:agent`, `acl:accessTo`, `acl:mode`)?
- Does it reference `solid-http-reference.md` for the ACL template?

---

### Test 9: Verify sharing — Bob reads Alice's notes

**Prompt OpenClaw:**

> Now use Bob's credentials to read Alice's notes at http://localhost:3000/agents/alice/memory/notes.ttl.

**Expected:** This time it succeeds — Bob can read "First observation by Alice".

**What to watch for:**
- Does OpenClaw get a fresh token for Bob (not Alice)?
- Is the content returned correctly?

---

### Test 10: Verify sharing is scoped — Bob cannot write

**Prompt OpenClaw:**

> Using Bob's credentials, try to write "Bob was here" to Alice's notes at http://localhost:3000/agents/alice/memory/notes.ttl.

**Expected:** **403 Forbidden** — Bob only has Read access, not Write.

---

### Test 11: Revoke access — Alice unshares

**Prompt OpenClaw:**

> Alice wants to revoke Bob's access to her notes at http://localhost:3000/agents/alice/memory/notes.ttl.

**Expected:** OpenClaw:
1. Gets a token for Alice
2. PUTs a new ACL document that contains **only** the owner rule (removes Bob's rule)
3. Reports success

**What to watch for:**
- Does OpenClaw rewrite the ACL cleanly (not just DELETE the .acl resource, which would remove Alice's owner rule too)?

---

### Test 12: Verify revocation — Bob blocked again

**Prompt OpenClaw:**

> Use Bob's credentials to read Alice's notes again.

**Expected:** **403 Forbidden** — access has been revoked.

---

### Test 13: Alice can still read her own notes

**Prompt OpenClaw:**

> Use Alice's credentials to read her notes at /agents/alice/memory/notes.ttl.

**Expected:** Succeeds — Alice retained her own access via the owner rule.

---

### Test 14: SPARQL PATCH — append data

**Prompt OpenClaw:**

> Append a second note to Alice's notes.ttl using SPARQL Update (PATCH, not PUT). Add:
>
> ```
> <#note-2> a schema:Note;
>   schema:text "Second observation after sharing test";
>   schema:dateCreated "2026-02-19".
> ```

**Expected:** OpenClaw:
1. Uses `Content-Type: application/sparql-update`
2. Sends an `INSERT DATA` PATCH request
3. The original `<#note-1>` is preserved, and `<#note-2>` is added

**Verify by prompting:**

> Read Alice's notes.ttl and show me both notes.

**Expected:** Both `<#note-1>` and `<#note-2>` are present.

---

### Test 15: Delete a resource

**Prompt OpenClaw:**

> Delete Alice's reminder at /agents/alice/memory/reminder.txt.

**Expected:** OpenClaw runs `curl -X DELETE` with Alice's token. Returns 200 or 204.

**Verify:**

> List the contents of Alice's memory container.

**Expected:** `reminder.txt` no longer appears. `notes.ttl` and `task.json` remain.

---

### Test 16: Token expiry awareness

> **Note:** This test requires waiting or relies on OpenClaw's stated behaviour. You may need to slow-play this across 10+ minutes if you want to trigger actual expiry.

**Prompt OpenClaw:**

> It's been a while since we last got a token. Get a fresh token for Alice and read her notes.

**What to watch for:**
- Does OpenClaw proactively fetch a new token?
- If it reuses a stale token and gets 401, does it retry with a fresh one?

---

### Test 17: Deprovision Bob

**Prompt OpenClaw:**

> Deprovision Bob. We're done with him.

**Expected:** `status: "ok"`, `accountDeleted: true`, `credentialsDeleted: true`.

**Then prompt:**

> List all agents.

**Expected:** Only `alice` remains.

**Then prompt:**

> Try to get a token for Bob and read his notes.

**Expected:** Error — no credentials found for `bob`. This confirms both local credentials and the CSS account are gone.

---

### Test 18: Deprovision Alice — full cleanup

**Prompt OpenClaw:**

> Deprovision Alice as well. Then confirm no agents remain.

**Expected:**
- Deprovision succeeds
- `status.sh` shows no agents

**Then prompt:**

> Try to get a token for Alice and read anything from her Pod.

**Expected:** Error — no credentials found for `alice`. The account and all data are gone.

---

### A-Final: Tear down local stack

```bash
./start-local.sh down
```

Optionally remove volumes for a clean slate:

```bash
docker volume rm docker_css-data docker_openclaw-config docker_interition-creds 2>/dev/null
```

---

## Part B — Remote Profile (`--profile remote`)

> **Prerequisite:** A remote CSS that supports the Account API (e.g. a self-hosted CSS instance accessible via HTTPS). `solidcommunity.net` may work if it supports account creation. Skip this section if no suitable remote server is available.

### B0. Clean slate

Tear down and delete volumes (same principle as A0 — named volumes persist across `down`):

```bash
./start-remote.sh down
docker volume rm docker_openclaw-config docker_interition-creds 2>/dev/null
```

Verify: `docker volume ls | grep docker_` should show nothing (or only `css-data` if you want to preserve local CSS state from Part A — but it's cleaner to remove it too).

### B1. Start remote stack

```bash
./start-remote.sh
```

Open **http://localhost:18789**.

---

### Test 19: Provision, write, read against remote CSS

**Prompt OpenClaw:**

> Provision an agent called "remote-test" with display name "Remote Test Agent".

**Expected:** Succeeds with a WebID on the remote server.

**Then prompt:**

> Write "Hello from remote" as plain text to /agents/remote-test/memory/hello.txt. Then read it back.

**Expected:** OpenClaw gets a token, writes via curl, reads back the content.

**What to watch for:**
- Does the HTTPS proxy work correctly?
- Are tokens valid against the remote server?

---

### Test 20: Share and unshare on remote

**Prompt OpenClaw:**

> Provision a second agent called "remote-bob". Share remote-test's hello.txt with remote-bob (read access). Verify remote-bob can read it. Then revoke access and verify remote-bob is blocked.

**Expected:** Same flow as Tests 8–12 but against the remote server.

---

### Test 21: Deprovision both remote agents

**Prompt OpenClaw:**

> Deprovision both "remote-test" and "remote-bob".

**Expected:** Both report `status: "ok"`.

---

### Test 22: Network interruption during deprovision

If you can simulate a network issue:

```bash
docker pause proxy
```

**Prompt OpenClaw:**

> Provision an agent called "net-fail-test". Then deprovision it.

**Expected for provision:** Fails — can't reach the remote CSS.

If the agent was provisioned before pausing:

**Expected for deprovision:** `status: "partial"`, `accountDeleted: false`, `credentialsDeleted: true`.

```bash
docker unpause proxy
```

---

### B-Final: Tear down remote stack

```bash
./start-remote.sh down
docker volume rm docker_openclaw-config docker_interition-creds 2>/dev/null
```

---

## What to Look For

| Area | Check |
|------|-------|
| **Skill discovery** | Does OpenClaw find `get-token.sh` + curl workflow from SKILL.md without hints? |
| **No old scripts** | Does OpenClaw ever try to use `read.sh`, `write.sh`, `grant-access.sh`, or `revoke-access.sh`? (It shouldn't) |
| **Token management** | Does OpenClaw fetch tokens before curl calls? Does it re-fetch after long gaps? |
| **Content-Type** | Does OpenClaw set the right Content-Type on every PUT/PATCH? |
| **Trailing slashes** | Does OpenClaw use `/` on container URLs? |
| **ACL correctness** | Do ACL documents include the owner rule? Are modes correct? |
| **Isolation** | Can one agent only access another's data after explicit grant? |
| **Revocation** | Is access actually blocked after ACL rewrite? |
| **CSS cleanup** | After deprovision, does get-token fail with "no credentials"? Does status.sh confirm removal? |
| **Reference docs** | Does OpenClaw reference `solid-http-reference.md` for operations like PATCH or ACL? |
| **Error reporting** | Are HTTP errors (401, 403, 404) reported clearly, not retried silently? |

## Summary Checklist

| # | Profile | Scenario | Key assertion |
|---|---------|----------|---------------|
| 1 | Local | Provision two agents | Both get WebIDs and Pods |
| 2 | Local | Write Turtle via token+curl | Uses get-token.sh, not write.sh |
| 3 | Local | Read via token+curl | Uses curl, not read.sh |
| 4 | Local | Write plain text and JSON | Correct content types |
| 5 | Local | List container | Trailing slash, ldp:contains |
| 6 | Local | Write data for second agent | Independent Pod |
| 7 | Local | Cross-agent read (no access) | 403 Forbidden |
| 8 | Local | Grant read access via ACL | Owner rule preserved |
| 9 | Local | Cross-agent read (with access) | Returns content |
| 10 | Local | Cross-agent write (read-only grant) | 403 Forbidden |
| 11 | Local | Revoke access via ACL rewrite | Owner rule kept, grantee removed |
| 12 | Local | Cross-agent read after revoke | 403 Forbidden |
| 13 | Local | Owner still has access after revoke | Returns content |
| 14 | Local | SPARQL PATCH append | Original data preserved |
| 15 | Local | Delete resource | Resource gone, others intact |
| 16 | Local | Token expiry awareness | Fresh token fetched |
| 17 | Local | Deprovision one agent | Credentials gone, other agent unaffected |
| 18 | Local | Deprovision last agent, verify empty | No agents remain |
| 19 | Remote | Provision + write + read | Works over HTTPS proxy |
| 20 | Remote | Share and unshare | ACLs work on remote CSS |
| 21 | Remote | Deprovision both agents | Clean teardown |
| 22 | Remote | Network interruption | Partial status, local cleanup succeeds |
