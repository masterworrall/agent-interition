# Discovery & Sharing Protocol — Dogfood Test Plan

End-to-end testing of the Phase 4 discovery and sharing protocol. Tests cover the full flow: provision → auto-register → discover → share (grant + notify) → check inbox → access → cleanup → revoke.

## Why One CSS, Not Two

Agents are runtime processes — they run wherever their OpenClaw instance (or script, or bot) executes. The CSS is not where agents live; it's where their **identity (WebID) and storage (Pod)** are hosted. Think of the CSS as a passport office and safe deposit provider — agents use it, but don't reside in it.

For this test, all agents' WebIDs and Pods are hosted on a single CSS instance. Each agent has its own WebID, Pod, credentials, and inbox — they are independent identities that happen to be issued by the same server. Two separate CSS instances would only be needed for Phase 5 (cross-server federation).

We test from **two separate OpenClaw sessions** (two browser tabs or terminal windows) to simulate two independent agents running in different environments, each with their own credentials and no shared state.

## What We're Testing

1. **Auto-registration** — Provisioning automatically registers agents in the public directory
2. **Discovery** — Agents can find each other by name or capability without prior knowledge
3. **Share orchestration** — `share.sh` grants ACL access AND sends an inbox notification in one step
4. **Inbox notifications** — Recipients can check their inbox and see who shared what
5. **Resource access** — After sharing, the recipient can read the shared resource
6. **Notification cleanup** — Recipients can delete processed notifications
7. **Revocation** — After revoking access, the recipient can no longer read the resource
8. **SKILL.md comprehension** — Does OpenClaw discover the new commands from SKILL.md?

## Known Gotchas

**Directory is server-scoped:** The directory lives at `{serverUrl}/directory/agents.ttl`. The first agent to provision creates it. All agents on the server share it.

**Inbox ACL timing:** The inbox ACL is set during provisioning. If you're testing with agents provisioned before Phase 4, they won't have inbox containers. Deprovision and re-provision them.

**Notification parsing:** Notifications use ActivityStreams vocabulary. If OpenClaw constructs notifications manually via curl (instead of using `share.sh`), the format must match exactly for `inbox.sh` to parse them.

**Pod URL paths:** CSS creates pods at `/{name}/`, not `/agents/{name}/`. Always use the `podUrl` returned by `provision.sh`.

## Prerequisites

### 1. Build the Skill

```bash
cd ~/Development/interition/crd-office/agent-interition
npm run build
npm run skill:build
```

### 2. Verify new scripts exist

```bash
ls skill/solid-agent-storage/scripts/discover.sh
ls skill/solid-agent-storage/scripts/share.sh
ls skill/solid-agent-storage/scripts/inbox.sh
```

All three should exist alongside the existing scripts (provision.sh, deprovision.sh, get-token.sh, status.sh).

### 3. Verify automated tests pass

```bash
npm test
```

All 64 tests should pass (integration tests skipped).

### 4. Verify SKILL.md includes Discovery & Sharing

```bash
grep "Discovery & Sharing" skill/solid-agent-storage/SKILL.md
```

Should show the section heading.

---

## Part A — Clean Slate

### A0. Tear down previous stack

```bash
./start-local.sh down
docker volume rm docker_css-data docker_openclaw-config docker_interition-creds 2>/dev/null
```

**Verify:**

```bash
docker volume ls | grep docker_
```

Expected: No output.

### A1. Start fresh

```bash
./start-local.sh
```

Wait for CSS and OpenClaw gateway to appear, then open **http://localhost:18789**.

---

## Part B — Agent Provisioning & Auto-Registration

### Test 1: Provision Agent Alpha

Open **OpenClaw Session 1** (first browser tab).

**Prompt OpenClaw:**

> Provision an agent called "alpha" with display name "Alpha Agent" and capabilities "research" and "analysis".

**Expected:**
- OpenClaw runs `scripts/provision.sh --name alpha --displayName "Alpha Agent"`
- Output includes `webId` and `podUrl`
- Console output mentions "Registering agent in directory"

**What to verify:**
- Note the `podUrl` (should be `http://localhost:3000/alpha/`)
- Note the `webId` (should be `http://localhost:3000/alpha/profile/card#me`)

### Test 2: Provision Agent Beta

Open **OpenClaw Session 2** (second browser tab).

**Prompt OpenClaw:**

> Provision an agent called "beta" with display name "Beta Agent" and capabilities "coding" and "testing".

**Expected:** Same as Test 1 but for beta.

**What to verify:**
- Note the `podUrl` and `webId` for beta

### Test 3: Verify both agents in directory

In **either session**:

**Prompt OpenClaw:**

> List all agents in the directory.

**Expected:** OpenClaw runs `scripts/discover.sh` and shows both agents:
```json
{
  "status": "ok",
  "agents": [
    { "webId": "...", "name": "Alpha Agent", "podUrl": "...", "capabilities": ["research", "analysis"] },
    { "webId": "...", "name": "Beta Agent", "podUrl": "...", "capabilities": ["coding", "testing"] }
  ]
}
```

**If only one agent appears:** The other agent's provisioning may have failed to register. Check the provisioning output for "Directory registration failed" warnings.

---

## Part C — Discovery

### Test 4: Find agent by name

In **Session 1** (Alpha):

**Prompt OpenClaw:**

> Find the agent called "Beta Agent" in the directory.

**Expected:** OpenClaw runs `scripts/discover.sh --name "Beta Agent"` and returns Beta's details including WebID and Pod URL.

### Test 5: Find agents by capability

In **Session 1** (Alpha):

**Prompt OpenClaw:**

> Find all agents that have the "coding" capability.

**Expected:** OpenClaw runs `scripts/discover.sh --capability coding` and returns Beta.

### Test 6: Search for non-existent agent

In **Session 1** (Alpha):

**Prompt OpenClaw:**

> Find the agent called "Gamma Agent" in the directory.

**Expected:** OpenClaw reports no agent found with that name.

---

## Part D — Resource Sharing

### Test 7: Alpha writes a resource to share

In **Session 1** (Alpha):

**Prompt OpenClaw:**

> Write a Turtle resource to Alpha's shared folder at /shared/findings.ttl with content:
> ```
> @prefix schema: <http://schema.org/>.
> <#finding-1> a schema:Dataset;
>   schema:name "Research Results";
>   schema:description "Analysis of agent communication patterns".
> ```

**Expected:** OpenClaw uses `get-token.sh` + curl PUT to write the resource. HTTP 201 or 205.

### Test 8: Beta cannot read Alpha's resource (no permission yet)

In **Session 2** (Beta):

**Prompt OpenClaw:**

> Using Beta's credentials, try to read the resource at {alpha-podUrl}shared/findings.ttl

(Substitute Alpha's actual podUrl.)

**Expected:** HTTP 401 or 403 — access denied.

### Test 9: Alpha shares resource with Beta

In **Session 1** (Alpha):

**Prompt OpenClaw:**

> Share the resource at {alpha-podUrl}shared/findings.ttl with "Beta Agent". Grant Read access.

**Expected:** OpenClaw runs `scripts/share.sh --agent alpha --resource {url} --with "Beta Agent" --modes Read` and reports:
```json
{
  "status": "ok",
  "granted": true,
  "notified": true,
  "notificationUrl": "..."
}
```

**What to verify:**
- `granted: true` — ACL was set
- `notified: true` — notification was sent to Beta's inbox
- `notificationUrl` — URL of the notification in Beta's inbox

**If `notified: false`:** The notification failed but the ACL grant still stands. Check the error message. Common cause: inbox container doesn't exist (agent was provisioned before Phase 4).

---

## Part E — Inbox & Access

### Test 10: Beta checks inbox

In **Session 2** (Beta):

**Prompt OpenClaw:**

> Check Beta's inbox for notifications.

**Expected:** OpenClaw runs `scripts/inbox.sh --agent beta` and shows:
```json
{
  "status": "ok",
  "agent": "beta",
  "notifications": [
    {
      "id": "http://localhost:3000/beta/inbox/notification-...",
      "actor": "http://localhost:3000/alpha/profile/card#me",
      "target": "http://localhost:3000/beta/profile/card#me",
      "resourceUrl": "http://localhost:3000/alpha/shared/findings.ttl",
      "modes": ["Read"],
      "published": "2026-...",
      "summary": "Resource shared: ..."
    }
  ]
}
```

**What to verify:**
- `actor` is Alpha's WebID
- `resourceUrl` points to the shared resource
- `modes` includes "Read"

### Test 11: Beta accesses the shared resource

In **Session 2** (Beta):

**Prompt OpenClaw:**

> Using Beta's credentials, read the resource at {alpha-podUrl}shared/findings.ttl

**Expected:** HTTP 200. Content includes "Research Results" and "Analysis of agent communication patterns".

### Test 12: Beta deletes processed notification

In **Session 2** (Beta):

**Prompt OpenClaw:**

> Delete the notification at {notificationUrl} from Beta's inbox.

(Use the notification URL from Test 10.)

**Expected:** OpenClaw runs `scripts/inbox.sh --agent beta --delete {url}` and reports success.

**Verify cleanup:**

> Check Beta's inbox again.

**Expected:** Empty notifications array.

---

## Part F — Revocation

### Test 13: Alpha revokes Beta's access

In **Session 1** (Alpha):

**Prompt OpenClaw:**

> Revoke Beta Agent's access to {alpha-podUrl}shared/findings.ttl. Beta's WebID is {beta-webId}.

**Expected:** OpenClaw uses curl to PUT an updated ACL that removes Beta's rule.

### Test 14: Beta can no longer read the resource

In **Session 2** (Beta):

**Prompt OpenClaw:**

> Using Beta's credentials, try to read {alpha-podUrl}shared/findings.ttl again.

**Expected:** HTTP 401 or 403 — access denied.

---

## Part G — Reverse Direction

Repeat the sharing flow in the other direction to verify it works both ways.

### Test 15: Beta shares with Alpha

In **Session 2** (Beta):

**Prompt OpenClaw:**

> Write "Hello from Beta" as plain text to Beta's shared folder at /shared/greeting.txt. Then share it with "Alpha Agent" with Read access.

**Expected:**
- Write succeeds (201/205)
- Share succeeds (granted: true, notified: true)

### Test 16: Alpha checks inbox and reads

In **Session 1** (Alpha):

**Prompt OpenClaw:**

> Check Alpha's inbox, then read the shared resource mentioned in any notification.

**Expected:**
- Inbox shows notification from Beta
- Alpha can read the greeting content

---

## Part H — Cleanup

### Test 17: Deprovision both agents

In **Session 1:**

> Deprovision the agent called "alpha".

In **Session 2:**

> Deprovision the agent called "beta".

**Expected:** Both succeed with `"accountDeleted": true, "credentialsDeleted": true`.

### Test 18: Directory reflects removal

**Note:** Deprovisioning does NOT remove agents from the directory (the directory is append-only via SPARQL INSERT). This is a known limitation. After deprovision, the directory may still list the agents, but their Pods and WebIDs no longer resolve.

> List all agents in the directory.

**Expected:** Agents may still appear, but their Pod URLs return 404. This is acceptable for Phase 4. Directory cleanup is a future enhancement.

---

## Results Summary

| Test | Description | Pass/Fail | Notes |
|------|-------------|-----------|-------|
| 1 | Provision Alpha | | |
| 2 | Provision Beta | | |
| 3 | Both in directory | | |
| 4 | Find by name | | |
| 5 | Find by capability | | |
| 6 | Non-existent agent | | |
| 7 | Alpha writes resource | | |
| 8 | Beta denied (no access) | | |
| 9 | Alpha shares with Beta | | |
| 10 | Beta checks inbox | | |
| 11 | Beta reads shared resource | | |
| 12 | Beta deletes notification | | |
| 13 | Alpha revokes access | | |
| 14 | Beta denied again | | |
| 15 | Beta shares with Alpha | | |
| 16 | Alpha checks inbox + reads | | |
| 17 | Deprovision both | | |
| 18 | Directory after deprovision | | |
