<!-- BEGIN solid-context-memory orientation -->
## Pod and Memory

Two Claude Code skills are installed at `~/.claude/skills/` and active in this project:

- **`solid-context-memory`** — mirrors local memory writes to the agent's Pod (typed RDF, References, reconstitution).
- **`solid-webid-pod`** — agent identity + authenticated Pod access.

Load-bearing facts an agent needs to narrate this correctly:

1. **Memory writes auto-mirror** to `<server-url>/<agent>/memory/` via a PostToolUse hook. The local memory dir is a cache; **the Pod is the canonical store**.
2. **Memory is per-agent, not per-project.** Other Claude Code projects that run `init-project.sh` + `reconstitute.sh` for the same agent pull the same memory back. Projects do not have isolated memory stores under this skill.
3. **Audit trail** = git history under the `crawlout-git` plugin on the Pod's data volume. Query via `git log` on the server.
4. **References** (`type: reference` with `authoritativeSource: <URL>` in frontmatter, body empty) are typed pointers at canonical content elsewhere — work-graph entries, team docs, vocab terms, Pod resources. Use them whenever a fact has a canonical source; never inline-duplicate.

Canonical operational reference: each skill's `SKILL.md` under `~/.claude/skills/`. Read when authoring memory or doing Pod ops you have not done before.
<!-- END solid-context-memory orientation -->
