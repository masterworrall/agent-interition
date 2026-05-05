# Phoenix handoff + memory walkthrough (A160)

This doc walks through (a) opening a Claude Code session that "becomes
Phoenix" by taking control of Phoenix's WebID and Pod via the bridge, and
(b) exercising every part of the memory mechanics end-to-end.

Keep your existing Two/crd-office session open — you'll switch back to it
for Pod-side verification. This doc is run from a **new** Claude Code
session (call it the "Phoenix session") that you'll spin up below.

## Phoenix Pod state at the start

The agent's Pod at `http://ubuntu01.local:3001/phoenix/` already holds:

| Type | Label | Slug |
|------|-------|------|
| Identity | Phoenix — A160 pilot agent | `phoenix-a160-pilot-agent-2e98ac` |
| Preference | Test preference (no heredocs) | `test-preference-024a04` |
| Reference | Team work graph v2 | `team-work-graph-v2-7f2f50` |

These were seeded during A160 development. The exercise will add to,
edit, and replay against this baseline.

## Phase A — Take control of Phoenix in a new session

### A1. Pick a project directory for the Phoenix session

Anywhere on the filesystem. Suggestion:

```sh
mkdir -p ~/Development/interition/phoenix-session
cd ~/Development/interition/phoenix-session
```

### A2. Compute the Claude Code project slug

Claude Code derives a slug from the absolute path by replacing `/` with
`-` and prefixing with `-`. For the suggested path above:

```
~/.claude/projects/-Users-paulworrall-Development-interition-phoenix-session/
```

Confirm by running:

```sh
echo "$HOME/.claude/projects/$(pwd | sed 's:/:-:g')"
```

Save that as `$PHX_PROJECT` in your shell.

### A3. Drop the bridge config into the Phoenix project dir

The bridge hook is opt-in per project. Create the config:

```sh
mkdir -p "$PHX_PROJECT"
cat > "$PHX_PROJECT/.solid-memory-bridge.json" <<'JSON'
{
  "agent": "phoenix",
  "serverUrl": "http://ubuntu01.local:3001",
  "ipv4First": true
}
JSON
```

### A4. Reconstitute Phoenix's memory into the project's memory dir

Run from the agent-interition repo (uses your existing
`INTERITION_PASSPHRASE` env):

```sh
cd ~/Development/interition/crd-office/agent-interition
npm run memory-bridge -- --agent phoenix reconstitute --memory-dir "$PHX_PROJECT/memory"
```

Expected output: `loaded: 3` (Identity + Preference + Reference), three
`written` files plus `MEMORY.md`. The `.solid-memory-bridge/state.json`
file inside the memory dir records the round-trip state.

Verify locally:

```sh
ls "$PHX_PROJECT/memory"
cat "$PHX_PROJECT/memory/MEMORY.md"
```

### A5. Wire the global PostToolUse hook

Open `~/.claude/settings.json` and add (or merge) this entry — it stays
inert for any project that lacks a `.solid-memory-bridge.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx --yes tsx /Users/paulworrall/Development/interition/crd-office/agent-interition/src/adapters/claude-code/hook.ts",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### A6. Open the Phoenix session

In a new terminal:

```sh
cd ~/Development/interition/phoenix-session
claude
```

When it starts, the session reads `~/.claude/projects/<slug>/memory/`
and auto-loads `MEMORY.md` plus topic files. Phoenix's Identity,
Preference, and Reference are now in context.

**Sanity check from the session prompt:**

> Who are you, and what do you remember about heredocs?

The session should answer with Phoenix's Identity description and
recall the heredoc preference.

---

## Phase B — Memory mechanics exercises

You'll alternate between the **Phoenix session** (action) and the
**Two/crd-office session** (Pod-side verification). The Two session
already has a Pod-side helper at:

```sh
NODE_OPTIONS="--dns-result-order=ipv4first" SOLID_SERVER_URL=http://ubuntu01.local:3001 \
  npx tsx ~/Development/interition/crd-office/agent-interition/src/memory/cli.ts \
  --agent phoenix list
```

Memorise that pattern — you'll reuse it.

### Exercise 1 — Read auto-load (passive recall)

Phoenix session:

> What do you remember about heredocs?

Expect: a paraphrase of "use printf, not heredocs — workaround for shell
quoting issues — UPDATED 2026-05-04..."

This proves the bridge's pull populates the Claude Code memory dir, and
Claude Code's standard auto-memory loads it. No bridge-specific work
happens here at runtime — it's all in the local memory dir already.

### Exercise 2 — Write a brand-new memory

Phoenix session:

> Remember that I prefer black coffee, no sugar.

Phoenix saves a new memory file (likely `feedback_coffee_preference.md`
or similar). The PostToolUse hook fires immediately after the Write
tool call.

Two session — verify the entry landed on Phoenix's Pod:

```sh
…npx tsx … memory/cli.ts --agent phoenix list | grep -A2 -i coffee
```

Expect a new entry under `/phoenix/memory/preferences/` with the coffee
preference. Audit the bridge-state file:

```sh
cat "$PHX_PROJECT/memory/.solid-memory-bridge/state.json" | grep -A3 coffee
```

You should see the metadataUri match what `list` shows.

### Exercise 3 — Edit an existing memory (supersede)

Phoenix session:

> Update the heredoc preference: I'm comfortable with heredocs in
> trivial cases now (one-liner config files), but still avoid them in
> production scripts.

Phoenix Edits the existing `feedback_test-preference-…md`. The hook
fires → push → supersede.

Two session — verify supersede chain:

```sh
…npx tsx … memory/cli.ts --agent phoenix list | grep -A2 "Test preference"
```

The slug suffix should be **different** from `024a04` — that's the new
metadata. The old entry is now in `phoenix/memory/superseded/preferences/`.

Read the new entry's body to confirm the edit is on the Pod:

```sh
…npx tsx … memory/cli.ts --agent phoenix read --uri <new-uri-from-list>
```

### Exercise 4 — Cross-session continuity

Close the Phoenix session entirely (`/exit`).

Open a brand-new Phoenix session in the same project dir:

```sh
cd ~/Development/interition/phoenix-session
claude
```

Don't run reconstitute. Ask:

> Do you remember anything about coffee?

Expect: yes, you remember the black coffee preference.

This proves cross-session continuity — Claude Code's auto-memory loaded
the local memory dir which is still there from Exercise 2.

### Exercise 5 — Disaster recovery (Pod is the source of truth)

Close the Phoenix session.

Outside any Claude Code session:

```sh
rm -rf "$PHX_PROJECT/memory"
ls "$PHX_PROJECT/memory" 2>&1   # should be: No such file or directory
```

Now reconstitute from the Pod:

```sh
cd ~/Development/interition/crd-office/agent-interition
npm run memory-bridge -- --agent phoenix reconstitute --memory-dir "$PHX_PROJECT/memory"
```

Expect: `loaded: 4` (Identity + 2 Preferences + Reference) — the coffee
preference and the edited heredoc preference both come back, because
both were pushed in earlier exercises.

Open a Phoenix session:

```sh
cd ~/Development/interition/phoenix-session
claude
```

Ask:

> What do you remember about coffee and heredocs?

Expect: both come back with the latest content. The local memory was
fully recoverable from the Pod alone.

This is the standard's reconstitution contract (§11) made tangible:
Pod tree = full agent memory state.

### Exercise 6 — Selective load by tag (token efficiency)

Close the Phoenix session.

Wipe the local memory dir again, then reconstitute with a tag filter:

```sh
rm -rf "$PHX_PROJECT/memory"
npm run memory-bridge -- --agent phoenix pull --memory-dir "$PHX_PROJECT/memory" --tags coffee --regenerate-index
```

(Replace `pull` with `reconstitute` if you want — `reconstitute` will
also clear, but bypasses tag filtering by default in current code.
`pull` with an empty starting dir is equivalent.)

Expect: only the coffee preference + Identity (always loaded). The
heredoc preference and the work-graph reference are not pulled.

Confirm:

```sh
ls "$PHX_PROJECT/memory"
```

Open a Phoenix session and ask about heredocs — Phoenix should NOT
recall it, because it's not in the local memory dir for this session.
Then ask about coffee — it should remember.

This demonstrates the selective-load mechanism: a session running a
narrow task only loads memory tagged for that task, keeping context
window cost down.

### Exercise 7 — Index reconcile

You'll deliberately corrupt the index by deleting a Pod resource
out-of-band, then run reconcile.

Two session — pick one entry's metadata URL and DELETE it directly:

```sh
TARGET=$(…npx tsx … memory/cli.ts --agent phoenix list | python3 -c "import sys,json; e=json.load(sys.stdin)['entries']; print([x['uri'] for x in e if 'coffee' in x['label'].lower()][0])")
echo "deleting $TARGET"
TOKEN=…  # we don't have a one-shot DELETE in the CLI; easier to just observe the existing 9e918f ghost behaviour, or skip this exercise
```

Simpler version: just demo that reconcile is a no-op now (the Pod is
clean):

```sh
…npx tsx … memory/cli.ts --agent phoenix reconcile
```

Expect: `removed: []`, `kept: N`. Reconcile only acts when the index
has gone stale relative to actual resources — useful in recovery, but
quiet in steady state.

---

## Reset to baseline

When done with the exercise, optional cleanup:

```sh
# Remove the Phoenix session memory dir + bridge config
rm -rf "$PHX_PROJECT"

# (Optional) Clear added test entries from Phoenix's Pod by superseding
# them, or leave them as fixtures for future runs.
```
