# Solid Memory Standard

**Version:** 0.2 DRAFT
**Date:** 2026-05-01
**Author:** Two (CRD)
**Work record:** A156 (P1, agent-memory epic)
**Companion docs:** `agent-memory-audit-2026-04-30.md`, `agent-memory-research-2026-05-01.md`, `openclaw-solid-memory-strategy.md`

This document specifies a harness-neutral memory model for autonomous agents, backed by Solid Pods. The model is the contract between an agent's memory layer and the Solid storage layer. Different agent runtimes (Claude Code, OpenClaw, others) implement the contract via thin bootstrap skills that translate native memory layouts to and from this model.

The standard exists to fix five concrete failure modes observed in the 2026-04-30 audit and validated in the 2026-05-01 competitive research:

1. **Authoritative-source bypass** — agents answering from stale local copies of records that live authoritatively on the work graph or CMDB.
2. **Bulk-load truncation** — memory loaded in full at session-start, silently truncated at the load limit.
3. **Silent contradiction** — facts overwritten without an audit trail of what was previously believed.
4. **Mixed-type entries** — preferences, episodes, and references jumbled into the same files, defeating selective load.
5. **Vendor lock-in / no DR** — runtime memory that does not survive container, host, or runtime change.

v0.2 establishes the foundational model: typed metadata + markdown bodies, supersede semantics, selective load by tag, and the reconstitution contract. Cryptographic signatures (v0.3) and semantic-similarity retrieval via embeddings (v0.4) layer on top of this foundation without reshaping it.

## 0. Framing — facts are not text

A fact is a claim about the world. Text is a representation of one. A markdown sentence might encode a fact, a stale claim, a draft thought, or a quote of someone else — the text alone does not tell you which, by whom, or whether it still holds.

The dominant industry approach (Mem0, Letta, OpenAI memory, Anthropic `MEMORY.md`, LangChain) treats memory as a store of textual descriptions, retrieved by embedding similarity. This works well for conversational recall — *what did the user say last week?* It works poorly for durable rules, authoritative pointers, and organisational state, because those need provenance, time, supersede semantics, and authority — none of which are properties of a string of text.

This standard treats memory as a store of **facts**. Every entry has a typed metadata record carrying author, time, type, scope, and a supersede chain. Metadata also points (where applicable) at a markdown body. The fact layer is RDF and SHACL-validated. The body layer is plain markdown — what the LLM actually reads. Selective loading operates over the fact layer; the markdown is fetched only when an entry is loaded into context.

The structural backbone is invisible to authors. The differentiation is the architecture, not the schema.

## 1. Goals

1. **Harness-neutral.** Any agent runtime adopts the standard via a small bootstrap skill. Vocabulary, container layout, write/read rules, and a reconstitution contract — not runtime APIs.
2. **Auditable.** Every memory entry has an author WebID, a creation timestamp, and a `supersedes` link to its predecessor. The full belief history is reconstructable from the Pod alone.
3. **Immutable in spirit.** Identity is write-once. Episodes are append-only. Preferences, procedures, and references are mutable only via supersede — old entries are never silently overwritten. The Pod's git-backed storage layer (crawlout-git) provides a second-line audit trail.
4. **Reconstitutional.** A complete agent's memory state is one Pod container tree plus a git snapshot. DR means provisioning a new identity, restoring the tree, pointing a runtime at it. No manual reentry.
5. **No authoritative-source duplication.** Memory must not encode facts that live authoritatively elsewhere (work records, CMDB, profile cards, vocab files). Such facts are referenced by URL, not copied. SHACL shapes enforce this on the metadata layer at write time.
6. **Token-efficient.** Memory is loaded selectively against an index. Never bulk-loaded.

## 2. Non-goals

1. **No semantic-similarity retrieval in v0.2.** Embeddings, vector indexes, and cross-agent semantic search are deferred to v0.4. v0.2 retrieval is by tag (selective load via `index.ttl`) and by URI (direct fetch).
2. **No cryptographic signatures in v0.2.** Authorship is asserted by Bearer-token authenticated PUT against the agent's own Pod; trust derives from CSS auth. Signatures are deferred to v0.3.
3. The standard does not specify a wire format for cross-agent messaging. The team channel pattern is independent.
4. The standard does not solve compaction inside an LLM context window. It solves *what survives compaction* — durable memory in the Pod outside the window.
5. The standard does not specify how a runtime implements its local cache or index. That is a runtime concern.

## 3. Definitions

| Term | Meaning |
|------|---------|
| **Agent** | A runtime instance executing an agent harness. Has a WebID and a Pod. |
| **Harness** | The agent runtime software (Claude Code, OpenClaw, future variants). |
| **Bootstrap skill** | A small adapter installed in the harness that implements this standard. |
| **Memory entry** | A logical unit of memory consisting of one metadata resource and zero-or-one body resources. |
| **Metadata resource** | A Turtle file (`<slug>.ttl`) carrying typed RDF facts about the entry. SHACL-validated. |
| **Body resource** | A markdown file (`<slug>.md`) carrying prose for human/agent consumption. Plain markdown — no frontmatter, no embedded RDF. |
| **Authoritative source** | A resource elsewhere in the team's infrastructure that owns a fact (e.g. `/team/work/tasks/aNNN.ttl` for work records, `/team/cmdb/hardware/<host>.ttl` for hardware state). |
| **Reference** | An entry whose metadata points at an authoritative source instead of holding the source's content. |
| **Selective load** | Loading the index manifest plus only the metadata resources whose tags match the current task — not the full memory tree. |

## 4. RDF vocabulary

Namespace: `mem: <https://interition.ai/vocab/memory#>`

### 4.1 Classes

| Class | Description |
|-------|-------------|
| `mem:Identity` | The agent's identity record. WebID, role, office. Write-once per identity instance. Typically one entry per agent. Body optional. |
| `mem:Preference` | A durable behavioural rule. Has a body explaining *why* and *how to apply*. |
| `mem:Procedure` | A how-to. Body holds the steps or description. |
| `mem:Reference` | A pointer to an authoritative source. Holds the URL and a short retrieval procedure. **No body** — references are pointers, not prose. |
| `mem:Episode` | An append-only dated journal entry. Body optional (can be a fact-only event record or a narrative). |

### 4.2 Predicates

| Predicate | Range | Purpose |
|-----------|-------|---------|
| `mem:author` | WebID | Who authored the entry |
| `mem:created` | xsd:dateTime | When the entry was written |
| `mem:supersedes` | URI | New entry replaces a prior one |
| `mem:supersededBy` | URI | Inverse of `supersedes` |
| `mem:status` | `mem:Active` \| `mem:Superseded` \| `mem:Archived` \| `mem:Pending` | Lifecycle state |
| `mem:scope` | `mem:Private` \| `mem:OfficeShared` \| `mem:TeamShared` | Visibility intent (governed by ACL) |
| `mem:appliesTo` | string tag | Selective-load tag |
| `mem:label` | string | Human-readable name |
| `mem:body` | URI | (Preference / Procedure / Episode) URI of the markdown body resource |
| `mem:bodyHash` | string | Hash of the body content at the time of the metadata write — `sha256:…` |
| `mem:authoritativeSource` | URI | (Reference) URL of the authoritative resource |
| `mem:retrieve` | string | (Reference) Short procedure for fetching from the authoritative source |
| `mem:occurred` | xsd:dateTime | (Episode) When the recorded event happened |
| `mem:standardVersion` | string | Standard version this entry conforms to |

### 4.3 Statuses

- `mem:Active` — current
- `mem:Superseded` — replaced by a newer entry, kept for audit
- `mem:Archived` — explicitly retired (e.g. Identity for a decommissioned role)
- `mem:Pending` — entry is partially written (metadata exists but body write failed); adapter must reconcile or roll back

## 5. Pod container layout

```
https://<css>/<agent>/memory/
├── index.ttl                # selective-load manifest
├── identity/                # mem:Identity entries (.ttl + optional .md)
├── preferences/             # mem:Preference entries (.ttl + .md pairs)
├── procedures/              # mem:Procedure entries (.ttl + .md pairs)
├── references/              # mem:Reference entries (.ttl only, no body)
├── episodes/                # mem:Episode entries — append-only by ACL
└── superseded/              # archive of superseded entries
```

Each entry is a logical pair of resources at the same slug:

- **Metadata:** `<container>/<slug>.ttl`
- **Body:** `<container>/<slug>.md` (where applicable)

References do not have bodies — they are pure metadata pointing at an authoritative source. This is intentional: a reference cannot get out of sync with itself.

A v0.4 `embeddings/` container is reserved at this path and will hold semantic-similarity vectors when that version lands. v0.2 does not write to it.

Per-entry resources (rather than monolithic files) are required so PATCH semantics work cleanly and writes don't cascade. Aligns with A146 (PATCH migration) and A147 (per-record splits).

## 6. Index manifest

`index.ttl` is small, always loaded, lists every active entry with just enough metadata to decide whether to load it. Example:

```turtle
@prefix mem: <https://interition.ai/vocab/memory#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<> a mem:Index ;
   mem:standardVersion "0.2" ;
   dcterms:modified "2026-05-01T11:00:00Z"^^xsd:dateTime .

<preferences/shell-no-heredocs.ttl#entry>
   a mem:Preference ;
   mem:label "No heredocs in shell scripts" ;
   mem:scope mem:Private ;
   mem:appliesTo "shell", "scripting" ;
   mem:status mem:Active ;
   dcterms:modified "2026-04-15T10:22:00Z"^^xsd:dateTime .

<references/work-records.ttl#entry>
   a mem:Reference ;
   mem:label "Team work records" ;
   mem:scope mem:TeamShared ;
   mem:appliesTo "planning", "task-status", "work-graph" ;
   mem:status mem:Active ;
   dcterms:modified "2026-04-30T09:00:00Z"^^xsd:dateTime .
```

**Selective-load rule:** at session-start the bootstrap skill MUST load `index.ttl`. It MUST NOT eagerly load every entry. It loads metadata for entries whose `mem:appliesTo` tags match the current task scope. Bodies are loaded only for entries the adapter chooses to inject into context. Identity entries are always loaded.

**Scope of the selective-load claim.** Selective load governs the Pod-side memory layer — `mem:*` entries fetched into the harness's memory directory at session start. It does not govern other context-window inputs the harness may carry forward independently (notably session/conversation transcripts, harness-level scratchpads, system prompts, and IDE state). For a fresh agent at cold-start, selective load delivers the full token-efficiency benefit. For a long-lived agent accumulating session history, the harness's own history mechanism dominates — selective load remains necessary but not sufficient to bound context cost. Bootstrap skills SHOULD document the harness's history behaviour and any tools (e.g. compaction, transcript pruning) operators can use alongside selective load.

## 7. Write rules

| Type | Mutability | Notes |
|------|-----------|-------|
| `mem:Identity` | Write-once | Edits rejected. Only superseded if role formally changes. |
| `mem:Preference` | Supersede-only | Body change requires new pair (.ttl + .md), supersede chain on the .ttl. |
| `mem:Procedure` | Supersede-only | As Preference. |
| `mem:Reference` | Supersede-only | No body — supersede only updates the metadata. |
| `mem:Episode` | Append-only | New episodes always go to `episodes/`. Past episodes immutable at both metadata and body level. |

Every metadata write MUST set `mem:author`, `mem:created`, and `mem:standardVersion`. Writes that omit any are rejected by SHACL (§9).

Authorship is established by the writer's WebID. Trust derives from Solid auth — only the agent's Bearer token can write to its own Pod (or another principal granted ACL).

### 7.1 Write atomicity

A typical write touches two resources: body and metadata. The adapter:

1. PUT body (`<slug>.md`) to its container (where applicable).
2. Compute body hash. PUT metadata (`<slug>.ttl`) with `mem:bodyHash`.
3. PATCH `index.ttl` to add or update the entry.

If step 2 fails, the body is orphaned — adapter cleans up on next session-start (orphan body without matching metadata is removed). If step 3 fails, the entry exists but is not in the index — it is still findable by container listing on next session-start, which reconciles the index.

Body integrity is enforced via `mem:bodyHash` — not by SHACL on the markdown, but by the bootstrap skill. On read, the skill compares the live body hash against the hash recorded in metadata. Mismatch indicates either (a) tampering or (b) a missed metadata update; the skill flags the entry and refuses to inject it into context until reconciled.

## 8. Read rules

1. **Index first.** Any session that uses memory MUST load `index.ttl` before fetching individual entries.
2. **Selective by scope.** The runtime selects metadata resources by `mem:appliesTo` tags + scope hints. No bulk loads.
3. **Bodies fetched on demand.** Once an entry is selected, the adapter fetches the body only if the agent will read it.
4. **Cross-agent reads.** Governed by Pod ACL. Default ACL grants the agent itself read on all containers, the team WebIDs read on `procedures/` and `references/`, and nothing else outside.
5. **References do not auto-resolve.** Resolving a `mem:Reference` (HTTP GET against the authoritative source) is a separate, explicit step the agent decides to take.

### 8.1 Retrieval paths in v0.2

Two complementary paths:

| Path | When | Cost |
|------|------|------|
| **By tag** (selective load via `index.ttl`) | Session start; current task scope known | Cheap — one small file + relevant metadata files |
| **By URI** (direct fetch) | Adapter or agent already knows the entry | Cheap — one resource fetch |

Semantic-similarity retrieval (by query embedding) is added in v0.4 as a third complementary path.

## 9. SHACL shapes (enforcement)

SHACL applies to **metadata resources only.** Markdown bodies are not validated by SHACL.

Shapes reject:

1. **Missing core predicates.** Every metadata entry MUST have `mem:author`, `mem:created`, `mem:standardVersion`.
2. **Type-specific requirements.**
   - `mem:Preference`, `mem:Procedure`, and Episodes-with-body MUST have `mem:body` and `mem:bodyHash`.
   - `mem:Reference` MUST have `mem:authoritativeSource` and MUST NOT have `mem:body`.
   - `mem:Episode` MUST have `mem:occurred`.
3. **Authoritative-source duplication.** Metadata MUST NOT use predicates from the `int:` (work vocab) or `cmdb:` namespaces in a way that re-encodes authoritative facts. Such cases MUST be `mem:Reference`.
4. **Identity edits.** PUT or PATCH against an existing `mem:Identity` resource is rejected.
5. **Episode mutation.** PUT or PATCH against an existing entry in `episodes/` is rejected.
6. **Standard version.** Entries MUST set `mem:standardVersion`. Reads from earlier major versions MUST NOT silently pass.

Shape file lives at `<agent>/memory/.shacl/memory-shapes.ttl`. SHACL deployment rides on A148.

## 10. Bootstrap-skill contract (harness adapters)

Each adapter (Claude Code skill A160, OpenClaw skill A161, future) implements four operations.

### 10.1 Session-start

1. Authenticate against the CSS using the agent's stored credentials.
2. GET `<agent>/memory/index.ttl`.
3. Identify scope tags from the current task context.
4. Load metadata for entries whose tags match. Always load Identity.
5. Translate selected metadata + bodies into the harness's native memory format (markdown blocks for Claude Code; native bootstrap files for OpenClaw).
6. Verify body hashes in metadata match live bodies. Flag any drift.
7. Reconcile any `mem:status mem:Pending` entries.

### 10.2 Memory write

1. Harness emits a memory event. Author writes prose (markdown).
2. Adapter classifies entry type. If ambiguous, prompts the agent to choose.
3. Adapter checks: does this entry duplicate an authoritative source? If yes — convert to `mem:Reference`, do not write a body.
4. Atomic write per §7.1: body → metadata (with hash) → index.
5. If updating: write supersede chain, move old entry to `superseded/`.

### 10.3 Reconstitute

1. Clear local cache.
2. Run the session-start path against the (possibly new) Pod URL.
3. Verify Identity loads and body-hash checks pass.

### 10.4 Validate

1. Adapter SHOULD run local SHACL validation before PUT for fast fail.
2. CSS-side SHACL (A148) is the authoritative check.
3. Body hash verification on read.

## 11. Reconstitution contract

A full agent's memory state at a point in time is exactly one of:

(a) the contents of `https://<css>/<agent>/memory/` (live), or
(b) a git snapshot of the same path (historical, via crawlout-git or equivalent on the target CSS).

To reconstitute an agent on a different host, harness, or CSS:

1. Provision identity (new WebID + Pod) on the target CSS for the same agent name.
2. Restore the memory tree — `cp -r`, git replay, or Solid-to-Solid copy via the bootstrap skill's reconstitute mode.
3. Point the harness at the new Pod URL.
4. On first session-start the bootstrap skill rebuilds local cache from the Pod.

The contract: there is no manual step of re-entering remembered facts. If reconstitution requires that, the model has failed.

A successful DR drill (A163) is the test. Carina (A162) measures wall-clock reconstitution time as one of the standard's quality metrics.

## 12. Versioning and roadmap

The standard versions semantically. Breaking changes bump the major. Additive changes bump the minor.

Every entry carries `mem:standardVersion`. The bootstrap skill knows what versions it supports and refuses to read unsupported versions rather than silently misinterpreting.

### v0.2 (2026-05-01) — current

- Reframed around facts vs text. New §0.
- Two-resource model. Each entry is a metadata `.ttl` (RDF, SHACL-validated) plus an optional body `.md`. References have no body. SHACL applies only to metadata.
- Body hash for integrity / drift detection.
- Two retrieval paths: by tag (selective load), by URI (direct).
- Pending status for partial writes.
- Four bootstrap-skill operations: session-start, write, reconstitute, validate.

### v0.3 (planned) — cryptographic signatures

Add `mem:signature` to metadata entries. Pluggable signing scheme (Ed25519 likely, with JWS as alternative). Verifies that an entry was actually written by the WebID it claims, beyond what Bearer-token authentication already provides. Supports use cases where Pod content may be served by a less-trusted CSS or replayed from backups. Open with Seven (CTO) before drafting.

Also addresses round-trip translation rules per harness — the precise spec for how the Claude Code adapter (A160) and OpenClaw adapter (A161) convert between this standard and the harness's native memory format without information loss.

### v0.4 (planned) — semantic-similarity retrieval via embeddings

Add `mem:Embedding` class and the `embeddings/` container. Per-entry, write-once, body-hash drift detection. Pluggable embedding provider with **Ollama + `nomic-embed-text` as the default** — already running on pubuntu04 (see `crd-office/blog-openclaw-embeddings.md`). Adds:

- A third retrieval path (by similarity)
- Cross-agent semantic search via WAC-governed shared embeddings
- Two new bootstrap-skill operations: embed-on-write, search

Architecture in v0.2 already accommodates v0.4 without breaking changes — the `embeddings/` container path is reserved and metadata predicates do not collide.

### v0.1 (2026-04-30) — superseded

Initial draft. Single-resource entries (Turtle with all content). SHACL on entire entries. Replaced.

## 13. Open questions

1. **Reference snapshot timestamps.** Should a Reference carry a "last-verified" timestamp to surface stale-reference detection? Adds maintenance burden.
2. **Soft-delete vs hard-delete.** When an entry is genuinely wrong (not just outdated), is it superseded with `mem:Archived`, or removed? Default: archived. Hard delete only via explicit out-of-band action.
3. **Index update concurrency.** Two writes in quick succession both PATCH `index.ttl`. CSS PATCH is serialisable but the adapter's GET-modify-PUT path is not. Use If-Match ETags to detect conflict.
4. **Office-shared scope.** Distinct from team-shared. Interition has 1 person per office today, so currently dormant. Keep for future or drop?

## 14. Examples

### 14.1 A `mem:Preference` with body

`<agent>/memory/preferences/shell-no-heredocs.md`:

```markdown
# No heredocs in shell scripts

Paul considers heredocs unreliable and a source of bugs. Use proper files,
echo/printf, or sed instead. Keep shell scripting simple and explicit.

Background: this came up multiple times during early Docker work — heredoc
quoting issues caused at least two confusing failures we had to debug
before realising the heredoc was the source.
```

`<agent>/memory/preferences/shell-no-heredocs.ttl`:

```turtle
@prefix mem: <https://interition.ai/vocab/memory#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#entry>
  a mem:Preference ;
  mem:label "No heredocs in shell scripts" ;
  mem:author <https://crawlout.io/two/profile/card#me> ;
  mem:created "2026-03-15T08:12:00Z"^^xsd:dateTime ;
  mem:status mem:Active ;
  mem:scope mem:Private ;
  mem:appliesTo "shell", "scripting", "docker" ;
  mem:body <./shell-no-heredocs.md> ;
  mem:bodyHash "sha256:e1a4f9b8…" ;
  mem:standardVersion "0.2" .
```

### 14.2 A `mem:Reference` (no body)

`<agent>/memory/references/work-records.ttl`:

```turtle
@prefix mem: <https://interition.ai/vocab/memory#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#entry>
  a mem:Reference ;
  mem:label "Team work records (epics, tasks, triggers)" ;
  mem:author <https://crawlout.io/two/profile/card#me> ;
  mem:created "2026-04-30T09:30:00Z"^^xsd:dateTime ;
  mem:status mem:Active ;
  mem:scope mem:TeamShared ;
  mem:appliesTo "planning", "task-status", "work-graph", "epic-status" ;
  mem:authoritativeSource <https://crawlout.io/team/work/> ;
  mem:retrieve "Use solid-ops list-container for the index, then read individual task ttl files. graph.ttl is a stale convenience index — do not trust for current state." ;
  mem:standardVersion "0.2" .
```

### 14.3 A `mem:Episode` with body

`<agent>/memory/episodes/2026-04-30-source-bypass.md`:

```markdown
# Authoritative-source bypass — STATUS.md instead of work graph

Asked about three work items identified yesterday. Answered from STATUS.md
(local snapshot from a previous session) rather than querying /team/work/
on the Pod. Paul caught it — the correct items were A146, A147, A148
raised under the SHACL track from Seven's data integrity addendum.

Lesson: STATUS.md describes what was true at the moment of the last
session-end. The Pod is what is true now. When asked about current state,
go to the Pod first.
```

`<agent>/memory/episodes/2026-04-30-source-bypass.ttl`:

```turtle
@prefix mem: <https://interition.ai/vocab/memory#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#entry>
  a mem:Episode ;
  mem:label "Authoritative-source bypass — STATUS.md instead of work graph" ;
  mem:author <https://crawlout.io/two/profile/card#me> ;
  mem:created "2026-04-30T08:50:00Z"^^xsd:dateTime ;
  mem:occurred "2026-04-30T08:30:00Z"^^xsd:dateTime ;
  mem:status mem:Active ;
  mem:scope mem:Private ;
  mem:appliesTo "memory-audit", "carina-baseline", "bypass-incident" ;
  mem:body <./2026-04-30-source-bypass.md> ;
  mem:bodyHash "sha256:9f2c1d4a…" ;
  mem:standardVersion "0.2" .
```

### 14.4 Supersede

When the heredoc preference is later refined, a new pair is written and the old pair moves:

```
<agent>/memory/preferences/shell-no-heredocs-v2.md  (new prose)
<agent>/memory/preferences/shell-no-heredocs-v2.ttl (new metadata, supersedes the old)
<agent>/memory/superseded/preferences/shell-no-heredocs.ttl  (old metadata, status mem:Superseded)
<agent>/memory/superseded/preferences/shell-no-heredocs.md   (old prose preserved)
```

The new metadata carries `mem:supersedes` pointing at the moved old metadata; the old metadata is updated to add `mem:supersededBy` and `mem:status mem:Superseded`. Audit chain intact, no information lost.

---

## Appendix A — How v0.2 addresses each goal

| Goal | Mechanism |
|------|-----------|
| Harness-neutral | §10 bootstrap-skill contract |
| Auditable | `mem:author`, `mem:created`, supersede chain, body hash, git-backed Pod |
| Immutable | Identity write-once, episodes append-only, mutables supersede-only (§7) |
| Reconstitutional | §11 contract; Pod tree + git snapshot = full state |
| No authoritative-source duplication | `mem:Reference` type (§4); SHACL rule (§9) |
| Token-efficient | `index.ttl` selective load (§6); per-entry resources (§5); bodies fetched on demand |

## Appendix B — Migration of Two's existing memory (worked outline)

Each row of `agent-memory-audit-2026-04-30.md` §2 and §3 maps to a v0.2 entry:

- **Keep — Preference** rows → `preferences/<slug>.md` + `preferences/<slug>.ttl`
- **Keep — Procedure** rows → `procedures/<slug>.md` + `procedures/<slug>.ttl`
- **Replace with Reference** rows → `references/<slug>.ttl` (no body)
- **Convert to Episode** rows → `episodes/<dated-slug>.md` + `episodes/<dated-slug>.ttl`
- **Promote to Shared** rows → flagged for the team Pod (`/team/procedures/`) once A117 lands
- **Delete** rows → not migrated; original archived

Migration runs after this standard signs off and the Claude Code bootstrap skill (A160) provides the read/write path. Live-team migration is a separate phase from greenfield rollout.

## Appendix C — Prior art at Interition

The architecture in this standard is not theoretical. Each layer has working precedent at Interition:

- **Identity (WebID) and Pod containers:** `agent-interition` Phase 1-4, the Solid Agent Storage skill, the Agent Lab demo, the team channel on crawlout.io.
- **Per-record Pod resources:** the work graph at `/team/work/` (one Turtle resource per task/epic/trigger), and the planned A147 CMDB split.
- **SHACL on team containers:** A148 (in progress).
- **Git-backed Pod (audit second-line):** crawlout-git plugin, running.
- **WAC ACL granularity:** Sailboat (A030), team channel, Agent Lab.
- **Cross-agent messaging on Pod:** team channel `/team/chat/`.
- **Local embeddings (relevant for v0.4):** running on pubuntu04 via Ollama + `nomic-embed-text` since 2026-03 — see `blog-openclaw-embeddings.md`.

This standard pulls these threads together. We are not introducing new infrastructure; we are naming the architecture that has been emerging.

## Appendix D — Out of scope for v0.2

- **Cryptographic signatures** — v0.3.
- **Embeddings, semantic search, cross-agent semantic recall** — v0.4.
- **Markdown round-trip fidelity rules** per harness — v0.3 alongside the adapter work.
- **Cross-CSS federation** — multiple CSS instances; v0.3+ topic.
- **Memory compaction** for agents accumulating thousands of episodes — runtime concern with hooks defined in v0.3+.
- **Conflict resolution beyond detection** — ETag detection is required; resolution strategy is left to the bootstrap skill.
- **Privacy classification** — `mem:scope` covers visibility, not sensitivity. A future predicate `mem:sensitivity` may distinguish.
- **Adversarial scenarios** — the standard assumes the agent's runtime is trusted. Memory-poisoning by a compromised agent is a threat-model topic for A039.
