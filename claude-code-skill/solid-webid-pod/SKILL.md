---
name: solid-webid-pod
description: Provision and manage a Solid WebID and Pod for this agent. Provides authenticated read/write to Solid resources via Bearer tokens. Use when the agent needs persistent identity and personal data storage on the open web.
version: 0.1.0
allowed-tools:
  - Bash(${CLAUDE_SKILL_DIR}/scripts/*)
  - Bash(curl *)
  - Bash(jq *)
---

# Solid WebID and Pod

This skill gives this agent its own **WebID** (identity on the web) and a **Solid Pod** (personal data store), backed by a Community Solid Server (CSS). With it the agent can read, write, and selectively share resources on the open web while keeping data under its (and its user's) control.

## When to use this skill

- The agent needs persistent identity that other agents and services can verify
- The agent needs to store data outside its session memory (across sessions, hosts, harnesses)
- The agent needs to share or receive specific resources from another agent under access control
- The agent needs to dereference an authoritative source on Solid that requires authentication

## Setup before first use

Before any command runs, two pieces of environment must be in place. The agent should fail fast and ask the user if either is missing — do not invent or default these.

| Variable | Purpose | How to set |
|----------|---------|-----------|
| `INTERITION_PASSPHRASE` | Encrypts local credentials at rest | Export in shell profile or set in Claude Code settings.json `env` |
| `SOLID_SERVER_URL` | Which CSS this agent talks to | Same; default `https://crawlout.io` if unset |

Encrypted credentials live at `~/.interition/agents/<agent-name>/<server-key>/credentials.enc`. The passphrase never leaves the device; the server never sees it.

## Operations

All scripts are at `${CLAUDE_SKILL_DIR}/scripts/`. Each script reads the encrypted credentials, derives a Bearer token where needed, makes the HTTP call, and emits JSON on stdout. Errors go to stderr with a non-zero exit code.

### Provision identity and storage

Creates a WebID and Pod for an agent. Run once per unique agent name on a given server.

```bash
${CLAUDE_SKILL_DIR}/scripts/provision.sh --name <agent-name> [--displayName "<display name>"]
```

**Output:** `{"status":"ok","agent":"<n>","webId":"<url>","podUrl":"<url>"}`

### Get a Bearer token (for any authenticated Solid operation)

```bash
${CLAUDE_SKILL_DIR}/scripts/get-token.sh --agent <agent-name>
```

**Output:** `{"token":"eyJ...","expiresIn":600,"serverUrl":"<url>","podUrl":"<url>","webId":"<url>"}`

Tokens last 600s. Re-fetch if older than ~8 minutes.

### Read a Solid resource (authenticated)

Standard W3C Solid HTTP — done with `curl` and the Bearer token. The skill does not wrap this in a proprietary script; the agent constructs the request from the spec.

```bash
TOKEN=$(${CLAUDE_SKILL_DIR}/scripts/get-token.sh --agent <agent-name> | jq -r '.token')
curl -s -H "Authorization: Bearer $TOKEN" "<resource-url>"
```

For PUT, PATCH, DELETE, ACL grant/revoke, and other operations, see `${CLAUDE_SKILL_DIR}/references/solid-http-reference.md`.

### List provisioned agents on this device

```bash
${CLAUDE_SKILL_DIR}/scripts/status.sh
```

### Copy an agent's browser-login password to the clipboard

Each provisioned agent has a synthetic CSS account (`<name>@agents.interition.local`) with a generated password, both stored in the encrypted credentials blob. This sub-command decrypts the blob, prints the email + login URL to stdout, and copies the password to the macOS clipboard via `pbcopy` (never to stdout). Use it when a human needs to login to the CSS web UI as the agent — e.g. to inspect the agent's own Pod via a Solid app.

```bash
${CLAUDE_SKILL_DIR}/scripts/copy-login.sh --agent <agent-name>
```

**Output (stdout):** `{ "status": "ok", "agent": "<n>", "email": "...", "webId": "...", "podUrl": "...", "loginUrl": "...", "message": "..." }` — no password field.

**Requires macOS** (depends on `pbcopy`). Exits with code 2 on non-macOS or if `pbcopy` is not on PATH. Cross-platform clipboard support is a follow-up; for now, run from your Mac terminal.

**Security note:** the password lives on the system clipboard until something else overwrites it. Clear it (e.g. `pbcopy < /dev/null`) when done.

### Re-sync a changed account password into the local store

Use this after the agent's CSS account password has been changed directly on the server (e.g. via the web UI). It updates the `password` field in the local encrypted credentials blob so a later `copy-login` hands out the current password.

The new password is read from **stdin**, never from an argument — so it never appears in this command's own `ps` entry. The remaining risk is **shell history**: anything you type on the command line is logged in cleartext, so the password must reach stdin from a source that is *not* a literal on the line.

**Preferred — interactive hidden prompt** (nothing sensitive is typed on the command line at all):

```bash
${CLAUDE_SKILL_DIR}/scripts/set-password.sh --agent <agent-name> --serverUrl <url>
# prompts:  New password:  (input hidden, not echoed)
```

**Non-interactive — feed stdin from a non-literal source** (the secret value never appears in the typed line):

```bash
op read "op://vault/<agent-name>/password" | ${CLAUDE_SKILL_DIR}/scripts/set-password.sh --agent <agent-name> --serverUrl <url>   # password manager
pbpaste | ${CLAUDE_SKILL_DIR}/scripts/set-password.sh --agent <agent-name> --serverUrl <url>                                       # clipboard
${CLAUDE_SKILL_DIR}/scripts/set-password.sh --agent <agent-name> --serverUrl <url> < ./secret.txt                                  # file
```

**Do NOT** inline the literal password — both of these write it to your shell history in cleartext:

```bash
printf '%s' 'the-password' | ... set-password.sh ...   # WRONG — password lands in ~/.zsh_history
... set-password.sh ... <<< 'the-password'             # WRONG — same leak
```

**Output (stdout):** `{ "status": "ok", "agent": "...", "serverUrl": "...", "email": "...", "webId": "...", "changed": true|false, "scope": "local-store-only", "message": "..." }`

**Scope:** this changes only the local store. It does **not** change the password on the CSS server, and it does not affect runtime auth (which uses the client id/secret, not the password). `changed` is `false` when the supplied password already matched (idempotent).

### Deprovision identity and storage

Tears down a WebID + Pod completely. Requires confirmation (the script will prompt) before destructive action.

```bash
${CLAUDE_SKILL_DIR}/scripts/deprovision.sh --name <agent-name>
```

## Pod structure (after provision)

```
<podUrl>/
├── profile/card           — public WebID profile (foaf:Agent + solid:oidcIssuer)
├── memory/                — agent's private memory (default ACL: owner only)
├── shared/                — for resources the agent will share with named WebIDs
└── inbox/                 — incoming notifications (W3C ActivityStreams)
```

The container layout is opinionated for agent use. The agent can create additional containers/resources as needed — Solid is open.

## Error handling

| Error | Likely cause | Fix |
|-------|--------------|-----|
| `No credentials found for agent X on server Y. Run provision first.` | First-run, or server-keyed creds missing | Run `provision.sh --name X` (and confirm `SOLID_SERVER_URL` is set to Y) |
| `401 Unauthorized` | Token expired, or token from wrong server | Get a fresh token; verify `SOLID_SERVER_URL` matches the resource |
| `403 Forbidden` | Authenticated, but ACL denies access | Resource owner needs to grant access to this agent's WebID |
| `INTERITION_PASSPHRASE not set` | Env var missing | Export it before invoking any command |

## Security caveats

- Credentials encrypted at rest with AES-256-GCM, file mode `0600`. Loss of the passphrase means re-provisioning.
- Tokens are NOT persisted; they're fetched fresh on demand and live in process memory only.
- The skill never sends `INTERITION_PASSPHRASE` over the wire.

See `${CLAUDE_SKILL_DIR}/references/security.md` for the full threat model.

## Distribution

Currently distributed as a directory copy. To install on another machine:

```bash
cp -r solid-webid-pod ~/.claude/skills/
```

Future: published via the Claude Code skill registry when one is available.
