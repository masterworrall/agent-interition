# Deprovision Dogfood Test Plan

End-to-end testing of the deprovision feature via OpenClaw's web UI, running against both local and remote Docker profiles.

## How Deprovision Works

CSS v7 has no single "delete account" endpoint. Instead, `deleteAccount` dismantles the account by deleting each component individually via the Account API:

1. **DELETE** each client credential (revokes authentication tokens)
2. **DELETE** each pod (removes stored data)
3. **DELETE** each WebID link (unlinks identity)
4. **DELETE** each password login (removes login method)
5. **POST** logout (invalidates the session)

All of these use existing CSS Account API endpoints — no server-side changes.

## Prerequisites — Build the Skill

The deprovision command is entirely client-side. It runs inside the **OpenClaw container** via the skill mount, not in the CSS container.

No Docker images need rebuilding. OpenClaw mounts `skill/solid-agent-storage/` as a read-only volume from the host, so we just need the skill build output to be up to date.

### 1. Compile TypeScript and build the skill package

```bash
cd ~/Development/interition/crd-office/agent-interition
npm run build
npm run skill:build
```

This produces `dist/cli/deprovision.js` and copies it (along with the new `deprovision.sh` wrapper) into `skill/solid-agent-storage/`.

### 2. Verify the skill output contains the new files

```bash
ls skill/solid-agent-storage/scripts/deprovision.sh
ls skill/solid-agent-storage/dist/cli/deprovision.js
```

Both should exist. If either is missing, check `scripts/build-skill.js` includes the new files.

### 3. Tear down any existing stack

If containers from a previous run are still up, bring them down to pick up the updated skill mount:

```bash
./start-local.sh down
# or for remote:
./start-remote.sh down
```

### How it works at runtime

```
OpenClaw container (mounts skill/)           CSS container (unchanged)
────────────────────────────────────         ────────────────────────
scripts/deprovision.sh
  → node dist/cli/deprovision.js
    → HTTP POST  /.account/login/password/  →  CSS handles login
    → HTTP GET   /.account/                 →  CSS returns controls
    → HTTP DELETE on each credential URL    →  CSS deletes credentials
    → HTTP DELETE on each pod URL           →  CSS deletes pods
    → HTTP DELETE on each WebID link        →  CSS unlinks WebIDs
    → HTTP DELETE on each password login    →  CSS removes logins
    → HTTP POST  logout                     →  CSS invalidates session
```

No containers need rebuilding — only the host-side `npm run skill:build` matters.

---

## Part A — Local Profile (`--profile local`)

Start the local stack:

```bash
./start-local.sh
```

Wait for CSS to be ready and OpenClaw gateway to appear, then open the UI at **http://localhost:18789**.

### Test 1: Provision + deprovision via OpenClaw

**Prompt OpenClaw:**

> Create a WebID and Pod for an agent called "dogfood-test" with display name "Dogfood Test Agent".

**Expected:** OpenClaw runs `scripts/provision.sh --name dogfood-test --displayName "Dogfood Test Agent"` and reports success with a WebID and Pod URL.

**Then prompt:**

> Now delete the WebID and Pod for "dogfood-test".

**Expected:** OpenClaw runs `scripts/deprovision.sh --name dogfood-test` and reports:
- `status: "ok"`
- `accountDeleted: true`
- `credentialsDeleted: true`
- No warnings

### Test 2: Verify cleanup through OpenClaw

**Prompt OpenClaw:**

> List all agents with provisioned WebIDs and Pods.

**Expected:** OpenClaw runs `scripts/status.sh`. `dogfood-test` should not appear.

**Then prompt:**

> Read the resource at http://localhost:3000/dogfood-test/profile/card using agent "dogfood-test".

**Expected:** Error — no credentials found for `dogfood-test`.

**Then verify the Pod is actually gone from CSS:**

```bash
curl -s http://localhost:3000/dogfood-test/profile/card
```

**Expected:** 404 — the pod has been deleted from CSS.

### Test 3: Provision, use, then deprovision

**Prompt OpenClaw:**

> Create a WebID and Pod for an agent called "lifecycle-test". Then write "Hello from lifecycle test" as plain text to its memory at /lifecycle-test/memory/hello.txt. Then read it back to confirm it's stored.

**Expected:** Provision succeeds, write succeeds, read returns the content.

**Then prompt:**

> Now delete the WebID and Pod for "lifecycle-test" and confirm it's gone.

**Expected:** Deprovision reports `status: "ok"`, `accountDeleted: true`. Follow-up status check shows no identity or storage remains for lifecycle-test.

### Test 4: Delete identity and storage for an agent that doesn't exist

**Prompt OpenClaw:**

> Delete the WebID and Pod for an agent called "never-created".

**Expected:** OpenClaw runs the script and reports the error: `No credentials found for agent "never-created"`.

### Test 5: Create identity for two agents, delete one

**Prompt OpenClaw:**

> Create WebIDs and Pods for two agents: "keeper" and "disposable".

**Then prompt:**

> Delete the WebID and Pod for "disposable" but keep "keeper".

**Expected:** Only `disposable` is deprovisioned. Status shows `keeper` still present and functional.

**Then prompt:**

> Write "Still alive" to keeper's memory at /keeper/memory/alive.txt and read it back.

**Expected:** Write and read succeed — `keeper` is unaffected by deleting the other agent's identity and storage.

**Cleanup:**

> Delete the WebID and Pod for "keeper".

### Test 6: Re-provision after deprovision

**Prompt OpenClaw:**

> Create a WebID and Pod for an agent called "phoenix". Delete its WebID and Pod. Then create a WebID and Pod for "phoenix" again.

**Expected:** The second provision succeeds cleanly — the old account components were fully deleted, so there are no conflicts with the new account.

Tear down:

```bash
./start-local.sh down
```

---

## Part B — Remote Profile (`--profile remote`)

> **Note:** Remote mode connects to an external CSS (e.g. `solidcommunity.net`) via the Squid proxy. Only run this if you have an account-creation-enabled remote server. Skip if the remote server does not support the CSS Account API.

Start the remote stack:

```bash
./start-remote.sh
```

Open the UI at **http://localhost:18789**.

### Test 7: Provision + deprovision against remote CSS

**Prompt OpenClaw:**

> Create a WebID and Pod for an agent called "remote-test".

**Expected:** Succeeds against the remote server.

**Then prompt:**

> Delete the WebID and Pod for "remote-test".

**Expected:** `status: "ok"`, `accountDeleted: true`.

### Test 8: Deprovision with network issues

If you can simulate a network interruption (e.g. pause the proxy container):

```bash
docker pause proxy
```

**Prompt OpenClaw:**

> Deprovision "some-agent".

**Expected:** Output has `status: "partial"`, `accountDeleted: false` with a warning about the CSS being unreachable, but `credentialsDeleted: true` — local cleanup still happens.

```bash
docker unpause proxy
```

Tear down:

```bash
./start-remote.sh down
```

---

## What to Look For

| Area | Check |
|------|-------|
| **SKILL.md comprehension** | Does OpenClaw find and use `scripts/deprovision.sh` without being told the exact command? |
| **Honest reporting** | Does OpenClaw report `"ok"` vs `"partial"` accurately? |
| **Error reporting** | Are error messages and warnings surfaced clearly in OpenClaw's response? |
| **Isolation** | Does deprovisioning one agent leave other agents untouched? |
| **CSS account cleanup** | After deprovision, is the Pod actually gone from the server (404 on pod URL)? |
| **Credential cleanup** | After deprovision, does `status.sh` confirm the agent is removed locally? |
| **Graceful degradation** | When the CSS is unreachable, does local cleanup still happen with a clear warning? |
| **Re-provisioning** | Can you create a new WebID and Pod with the same name after deleting the previous ones? |

## Summary Checklist

| # | Profile | Scenario | Key assertion |
|---|---------|----------|---------------|
| 1 | Local | Provision + deprovision | Account deleted, status "ok" |
| 2 | Local | Verify cleanup | Agent gone from status, pod returns 404 |
| 3 | Local | Full lifecycle (provision → use → deprovision) | Works end to end |
| 4 | Local | Deprovision non-existent agent | Clean error message |
| 5 | Local | Deprovision one of two agents | Other agent unaffected |
| 6 | Local | Re-provision after deprovision | No conflicts |
| 7 | Remote | Provision + deprovision | Works against remote CSS |
| 8 | Remote | Network interruption during deprovision | Local cleanup succeeds, status "partial" |
