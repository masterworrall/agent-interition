# Claude Code ↔ Solid Memory bridge — setup

The bridge mirrors a Claude Code project's memory directory to the agent's
Solid Pod, in both directions.

## One-time per project

Create `~/.claude/projects/<project-slug>/.solid-memory-bridge.json`:

```json
{
  "agent": "phoenix",
  "serverUrl": "http://ubuntu01.local:3001",
  "ipv4First": true
}
```

`ipv4First` defaults to `true`. Set it to `false` if you do not need the
`--dns-result-order=ipv4first` Node DNS workaround for Cloudflare-fronted
Pods.

The agent must already be provisioned (WebID + Pod + encrypted credentials in
the local store via `npm run provision`).

## One-time per Claude Code installation

Add the PostToolUse hook to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx --yes tsx /absolute/path/to/agent-interition/src/adapters/claude-code/hook.ts",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

The hook silently no-ops for tool calls that don't touch a memory file or
projects without a `.solid-memory-bridge.json`. It runs `push` for each
matching write — the bridge state file deduplicates against unchanged
content, so pushes for unrelated edits are cheap.

## Manual one-shot use

For testing or backfill without a hook, run the CLI directly:

```sh
INTERITION_PASSPHRASE=… NODE_OPTIONS=--dns-result-order=ipv4first \
  SOLID_SERVER_URL=http://ubuntu01.local:3001 \
  npm run memory-bridge -- --agent phoenix pull
```

```sh
INTERITION_PASSPHRASE=… NODE_OPTIONS=--dns-result-order=ipv4first \
  SOLID_SERVER_URL=http://ubuntu01.local:3001 \
  npm run memory-bridge -- --agent phoenix push --dry-run
```

`--memory-dir <path>` overrides the default `~/.claude/projects/<cwd>/memory/`.
`--tags t1,t2` on `pull` restricts the load to entries matching those tags.
`--regenerate-index` on `pull` rewrites `MEMORY.md` from the loaded entries.

## Token efficiency notes

Selective `pull --tags …` controls **only** the memory layer — the contents
of `~/.claude/projects/<slug>/memory/`. It does NOT control:

- **Session transcripts** at `~/.claude/projects/<slug>/*.jsonl`. Claude
  Code preserves prior conversation history across restarts and replays
  it into context at session start. Memory content quoted in earlier
  conversations (e.g. via `Read` tool calls or model paraphrase) bleeds
  forward through this mechanism regardless of how the bridge filters
  the memory layer.
- **The system prompt and any IDE/CLAUDE.md context.**

Practical implications:

- For a **fresh agent** in a fresh project dir, `pull --tags …` gives the
  full token-efficiency benefit the standard claims.
- For a **long-lived agent**, JSONL accumulation will dominate context
  cost regardless of selective load. Use `claude /compact` periodically
  to compress conversation history, or start a fresh project dir for
  high-stakes runs that need a clean cold start.
- The bridge does not currently prune JSONL files. If this becomes a
  recurring cost, raise it as a follow-up — see notes on optional
  enhancements in the standard's roadmap discussion.
