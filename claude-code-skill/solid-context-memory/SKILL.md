---
name: solid-context-memory
description: Mirror this Claude Code session's context memory to a Solid Pod under typed RDF metadata. Provides selective load by tag, supersede chains, and full reconstitution from the Pod alone. Use when the agent's memory needs to be durable, auditable, ACL-governable, or shareable across sessions/agents.
version: 0.1.0
allowed-tools:
  - Bash(${CLAUDE_SKILL_DIR}/scripts/*)
---

# Solid Context Memory Management

Bridges this agent's Claude Code memory directory (`~/.claude/projects/<project>/memory/`) to a typed RDF memory layer on a Solid Pod, per the [Solid Memory Standard v0.2](references/memory-standard.md).

**Depends on the `solid-webid-pod` skill** (provides identity + authenticated access). Install that first; this skill assumes the agent already has provisioned WebID + Pod credentials.

## When to use this skill

- The agent's memory needs to **outlive the session** — durably stored on a Pod, recoverable via reconstitute
- Memory needs to be **auditable** — every change leaves a supersede chain; old entries preserved
- Memory needs to be **shareable** with other agents under WAC ACLs
- The agent is dereferencing prose-paraphrasing of authoritative sources and you want to **prevent stale-cache bypass** by structurally moving such facts to `mem:Reference`

## One-time per project

Each Claude Code project that wants its memory mirrored to a Pod opts in by dropping a config file:

```bash
${CLAUDE_SKILL_DIR}/scripts/init-project.sh \
  --project-dir <absolute-path-to-project> \
  --agent <agent-name> \
  --server-url <css-url>
```

This writes `~/.claude/projects/<project-slug>/.solid-memory-bridge.json`. The hook (see below) becomes active for that project on the next session.

## One-time per Claude Code installation

Install the PostToolUse hook into `~/.claude/settings.json`. The hook is what drives push — every Write/Edit on a memory file triggers a sync to the configured Pod. The script merges idempotently into existing settings; safe to re-run.

```bash
${CLAUDE_SKILL_DIR}/scripts/install-hook.sh
```

To remove later:

```bash
${CLAUDE_SKILL_DIR}/scripts/uninstall-hook.sh
```

## Operations

### Pull (Pod → local memory dir)

Loads the agent's memory entries from its Pod into the Claude Code project's memory directory. Optionally tag-filtered for selective load.

```bash
${CLAUDE_SKILL_DIR}/scripts/pull.sh --agent <name> [--tags t1,t2] [--memory-dir <path>] [--regenerate-index]
```

`--memory-dir` defaults to `~/.claude/projects/<cwd-slug>/memory/`.
`--tags` filters by `mem:appliesTo`. Identity entries always loaded.
`--regenerate-index` rewrites `MEMORY.md` from loaded entries (with body-derived hooks for keyword search).

### Push (local memory dir → Pod)

Mirrors local memory writes to the Pod. Usually invoked automatically by the PostToolUse hook; this command is a manual override or backfill.

```bash
${CLAUDE_SKILL_DIR}/scripts/push.sh --agent <name> [--memory-dir <path>] [--dry-run]
```

### Reconstitute (Pod is the source of truth)

Wipes the local memory dir and re-pulls from the Pod. The standard's §10.3 reconstitution path. Use after host change, harness change, or local corruption.

```bash
${CLAUDE_SKILL_DIR}/scripts/reconstitute.sh --agent <name> [--memory-dir <path>]
```

## Type mapping (Claude Code ↔ standard)

This skill writes Claude Code's four memory types into the standard's five:

| Claude Code | Solid Memory Standard | Notes |
|-------------|----------------------|-------|
| `user` | `mem:Preference` | facts about the human user |
| `feedback` | `mem:Preference` | guidance to the agent |
| `project` | `mem:Episode` | timestamped state, append-only |
| `reference` | `mem:Reference` if `authoritativeSource` parseable, else `mem:Procedure` | |

A bridge state file at `<memory-dir>/.solid-memory-bridge/state.json` preserves the precise standard type per entry so subsequent pushes don't reclassify.

## Token efficiency notes

Selective `pull --tags …` controls **only** the memory layer. It does NOT control:

- **Session transcripts** at `~/.claude/projects/<slug>/*.jsonl` — Claude Code preserves prior conversation history independently
- **System prompts and IDE context**

For long-lived sessions: use `claude /compact` periodically. For high-stakes runs that need clean cold-start: open a fresh project dir.

## Error handling

| Error | Likely cause | Fix |
|-------|--------------|-----|
| `No credentials found for agent X` | `solid-webid-pod` not installed, or agent not provisioned | Install `solid-webid-pod`; run `provision.sh --name X` |
| `mem:Reference cannot carry prose` | User edited the rendered body of a Reference's local `.md` | The Reference forbids bodies — edit the authoritative source on the Pod, or convert to mem:Procedure |
| `cannot push a new Reference without an authoritativeSource` | Local `reference_*.md` has no Pod-side state and no source URL available | Use `solid-webid-pod`'s manual write path with `--type Reference --source <url>` |

## Distribution

Currently distributed as a directory copy. Future: published via the Claude Code skill registry when one is available.
