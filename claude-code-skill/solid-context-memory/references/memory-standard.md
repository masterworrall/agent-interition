# Solid Memory Standard — adapter-relevant summary

This skill implements the v0.2 Solid Memory Standard's bootstrap-skill contract for Claude Code (§10 of the standard). The full standard document lives at `agent-interition`'s home repository under `solid-memory-standard.md`; this is a focused summary of the parts that affect the adapter's behaviour.

## The five entry types

| Type | Mutability | Body | Purpose |
|------|-----------|------|---------|
| `mem:Identity` | Write-once | optional | the agent's own self-concept (write-once per identity) |
| `mem:Preference` | Supersede-only | required | a durable behavioural rule or fact about the user |
| `mem:Procedure` | Supersede-only | required | a how-to / routine the agent should follow |
| `mem:Reference` | Supersede-only | **forbidden** | a pointer to an authoritative source held elsewhere |
| `mem:Episode` | Append-only | optional | a timestamped event or state snapshot |

## What this enforces structurally

- **No duplication of authoritative state in metadata.** A `mem:Reference` carries a URL and a retrieval recipe; agents must dereference rather than answer from cached content. This is enforced at write time by the validator (rejects Reference + body, rejects Reference without authoritativeSource).
- **Write-once Identity, append-only Episodes.** The validator rejects edits to an existing Identity entry and PATCH/PUT against an existing Episode.
- **Supersede chains.** Mutable types (Preference / Procedure / Reference) update via supersede, never silent overwrite. Old entries move to `superseded/` with `mem:supersededBy` link; new entries carry `mem:supersedes` pointing at the moved old one. Audit trail intact.

## What this does NOT enforce

- **Prose-level duplication of authoritative facts.** A `mem:Preference` body is markdown — the validator can't see whether its prose paraphrases state held authoritatively elsewhere. The standard relies on the `mem:Reference` type as a *clean alternative*, not on validation. Agents should be explicitly trained or instructed to prefer References for authoritative state.

## Selective-load rule (§6 of the standard)

`MEMORY.md` is the index — small, always loaded. Topic files are loaded on demand. Pull's `--tags` argument restricts which entries make it into the local memory directory at all, controlling the always-paid floor of memory token cost. See SKILL.md "Token efficiency notes" for what this does and does not cover.

## Reconstitution contract (§11 of the standard)

A complete agent's memory state at a point in time is exactly:
1. The contents of `<pod>/memory/` (live), or
2. A git snapshot of the same path (historical, where the CSS supports it)

To reconstitute on a new host or harness: provision identity, restore the tree, run `reconstitute.sh`. There must be no manual step of re-entering remembered facts.
