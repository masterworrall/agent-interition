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
