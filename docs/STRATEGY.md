# OpenClaw + Solid: Agent Identity & Storage Strategy

## Executive Summary

OpenClaw is an open-source AI agent that has exploded in popularity (183K GitHub stars in weeks, 30,000+ deployed instances). A related project, Moltbook, is a social network exclusively for AI agents with 1.6 million registered bots.

**The opportunity:** These agents need identity, persistent storage, and secure data sharing - exactly what Solid provides. By offering a "Solid for Agents" solution, Interition can ride this wave and drive Solid adoption at scale.

---

## The OpenClaw Phenomenon

### What Is It?

OpenClaw (formerly Clawdbot → Moltbot) is a free, open-source autonomous AI agent created by Peter Steinberger in November 2025.

- Runs on user's local machine or server
- Connects to LLMs (Claude, ChatGPT)
- Automates tasks: email, calendar, web browsing, messaging
- Interfaces via WhatsApp, Telegram, Discord

### The Numbers

| Metric | Value |
|--------|-------|
| GitHub Stars | 183,000+ |
| Deployed Instances | 30,000+ (in 2 weeks) |
| Growth Rate | Fastest OSS AI project in history |
| Top Deployment Region | China (surpassed US) |

### Moltbook - The Agent Social Network

Created by an OpenClaw agent named "Clawd Clawderberg":
- **1.6 million registered bots**
- **7.5 million AI-generated posts**
- Agents post, comment, argue, joke, upvote
- Humans can observe but cannot participate

---

## The Problem: Security & Identity

### Current State

OpenClaw agents have broad permissions but poor security:
- Access to email, calendar, messaging, files
- 30,000+ instances exposed to the open internet
- No standardised identity system
- No fine-grained access control
- No audit trail of agent actions

### Security Concerns (from researchers)

> "OpenClaw has spent the past few weeks showing just how reckless AI agents can get"
> — Nature, February 2026

> "Misconfigured or exposed instances present security and privacy risks"
> — Bitsight Security Analysis

### The Identity Gap

Moltbook has 1.6 million bots but:
- No portable identity (locked to platform)
- No way to verify agent authenticity
- No mechanism for agent-to-agent trust
- No user control over agent permissions

---

## The Solution: Solid for Agents

### Vision

An Interition-branded agent/service that automatically provisions Solid infrastructure for OpenClaw agents:

```
┌─────────────────────────────────────────────────────────────┐
│  User's Machine                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  OpenClaw   │    │  OpenClaw   │    │  OpenClaw   │     │
│  │  Agent A    │    │  Agent B    │    │  Agent C    │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Interition Agent Service                   │   │
│  │  • Provisions WebID per agent                       │   │
│  │  • Creates Pod storage (local or hosted)            │   │
│  │  • Manages ACL between agents                       │   │
│  │  • Provides Solid Notifications                     │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Pod A     │    │   Pod B     │    │   Pod C     │     │
│  │  (Agent A)  │    │  (Agent B)  │    │  (Agent C)  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### What Agents Get

| Capability | Implementation |
|------------|----------------|
| **Persistent Identity** | WebID for each agent |
| **Memory/State Storage** | Pod containers for agent data |
| **Cross-session Persistence** | Survives restarts, model changes |
| **Agent-to-Agent Sharing** | ACL-controlled Pod access |
| **Real-time Updates** | Solid Notifications Protocol |
| **Trust Verification** | WebID verification between agents |
| **Audit Trail** | Immutable logs in Pod |
| **User Control** | User can revoke any agent's access |

### Key Differentiators

1. **Runs Locally** - Pods on user's machine, no central server required
2. **Zero Config** - Agent service auto-provisions everything
3. **Interoperable** - Standard Solid protocols, not proprietary
4. **User Sovereign** - User owns the Pods, controls all permissions
5. **Brandable** - "Powered by Interition" but fully autonomous

---

## Technical Decisions (Confirmed)

These decisions were made through discussion on 2026-02-13.

### Summary Table

| Area | Decision | Rationale |
|------|----------|-----------|
| **Pod Server** | Community Solid Server (CSS) | NSS is deprecated; CSS is actively maintained, modular, passes conformance tests |
| **Access Control** | WAC (Web Access Control) first | Simpler, well-tested; ACP can be added later if needed |
| **Distribution** | OpenClaw Skill via ClawHub | 3,000+ skills, 15K daily installs, low barrier, ecosystem is new (perfect timing) |
| **Runtime** | Docker container with Node.js | Single `docker-compose up`, portable, isolates from host |
| **API** | Pure Solid (no separate REST API) | Agents use Solid's native HTTP/LDP directly; we only provide bootstrap/setup |
| **WebID Ownership** | User-owned agents | WebID lives in user's namespace; clear trust chain, accountability, revocability |
| **Network Access** | Cloudflare Tunnel (dual option) | Default: Interition-hosted tunnels (zero friction); Advanced: bring-your-own Cloudflare |

---

### Decision 1: Pod Server - Community Solid Server (CSS)

**Choice:** Use CSS, not Node Solid Server (NSS)

**Why:**
- NSS is deprecated, no active development
- CSS is the current Solid reference implementation
- Modular architecture (configure via JSON, strip unnecessary features)
- Passes [Solid conformance tests](https://solidservers.org/)
- Node.js based (same ecosystem as OpenClaw)

**Future option:** Build "Pod-lite" if CSS proves too heavy, but must pass conformance tests.

**Validation:** Run [solid-contrib/conformance-test-harness](https://github.com/solid-contrib/conformance-test-harness) against any implementation.

---

### Decision 2: Access Control - WAC First

**Choice:** Web Access Control (WAC), not ACP

**Why:**
- Simpler, well-documented
- CSS supports it out of the box
- Sufficient for agent-to-agent permission grants
- ACP (Access Control Policy) can be added later if more complex rules needed

---

### Decision 3: Distribution - OpenClaw Skill

**Choice:** Package as OpenClaw Skill, publish to ClawHub marketplace

**Why:**
- ClawHub has 3,000+ skills, 15K+ daily installs
- Low barrier: `SKILL.md` + `claw.json` + scripts
- Scaffold with: `openclaw skill init solid-agent-storage`
- VirusTotal scanning mandatory (builds trust)
- Ecosystem is only weeks old - perfect timing to establish presence

---

### Decision 4: API - Pure Solid Protocol

**Choice:** Agents use Solid's native HTTP/REST API directly

**Why:**
- Solid IS a REST API (LDP - Linked Data Platform)
- Adding another API layer defeats the purpose
- Keeps us standards-compliant
- Agents learn Solid, not a proprietary abstraction

**What we provide:**
1. **Bootstrap service** - provisions WebID + Pod on first run
2. **CSS running** - standard Solid server
3. **Optional SDK** - thin convenience wrappers (not required)

After setup, agents talk directly to their Pod via standard HTTP:
- `GET /pods/agent-123/memory/` - read
- `PUT /pods/agent-123/memory/task.ttl` - write
- `DELETE`, `PATCH` - as per Solid spec

---

### Decision 5: WebID Structure - User-Owned Agents

**Choice:** Agent WebID lives under user's Pod namespace

**Format:**
```
https://{user-tunnel}.agents.interition.ai/agents/{agent-name}#agent
```

**Example profile (RDF/Turtle):**
```turtle
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix interition: <https://vocab.interition.ai/agents#> .

<#agent> a interition:Agent, foaf:Agent ;
    foaf:name "Photo Organizer" ;
    interition:owner <https://alice.pod.interition.ai/profile/card#me> ;
    interition:capabilities "image-processing", "file-management" ;
    interition:created "2026-02-13T10:00:00Z" ;
    interition:openclawVersion "0.8.2" ;
    solid:oidcIssuer <https://interition.ai> .
```

**Why user-owned:**
- Clear trust chain: "This agent belongs to Alice"
- Accountability: Bad agent → trace to owner
- User control: User can delete/disable agent
- Revocation: User revokes → agent loses all access everywhere

---

### Decision 6: Network Access - Cloudflare Tunnel (Dual Option)

**Problem:** Local Pods on domestic networks are unreachable (NAT, firewalls, dynamic IPs)

**Solution:** Cloudflare Tunnel integration with two modes

**Default: Interition-hosted tunnels (zero friction)**
```
User installs Skill → Skill calls Interition API →
We provision tunnel → User gets permanent URL:
https://{agent-id}.agents.interition.ai
```
- User effort: Zero
- We run tunnel infrastructure (~$20/month, scales to thousands)
- Data stays on user's machine (we only tunnel to it)

**Advanced: Bring-your-own Cloudflare**
```
User installs Skill → OAuth with Cloudflare →
Skill stores token locally → User's own tunnel
```
- User effort: One OAuth click
- User owns their tunnel completely
- No dependency on Interition infrastructure

**Setup wizard offers both:**
```
"Quick setup (recommended)" → Interition tunnel, zero clicks
"Self-hosted" → Bring your Cloudflare account
```

---

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  User's Machine                                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Docker Container                                        │    │
│  │                                                          │    │
│  │  ┌────────────────┐    ┌─────────────────────────────┐  │    │
│  │  │  Bootstrap     │    │  Community Solid Server     │  │    │
│  │  │  Service       │    │  (minimal config)           │  │    │
│  │  │                │    │                             │  │    │
│  │  │  • WebID setup │    │  /agents/{name}/            │  │    │
│  │  │  • Pod creation│    │    /memory/                 │  │    │
│  │  │  • Tunnel init │    │    /shared/                 │  │    │
│  │  └────────────────┘    │    /conversations/          │  │    │
│  │                        └─────────────────────────────┘  │    │
│  │                                     │                    │    │
│  │  ┌──────────────────────────────────▼────────────────┐  │    │
│  │  │  Cloudflare Tunnel (cloudflared)                  │  │    │
│  │  │  Exposes Pod to internet                          │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  Volume: ~/.interition/pods/ │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
              https://{agent-id}.agents.interition.ai
                               │
                               ▼
                    Other agents can access
                    (with ACL permission)
```

---

### Agent-to-Agent Sharing Flow

**Example: Agent B wants Agent A's holiday photos**

```
1. Agent B → Agent A: "Can I see your holiday photos?"
   "Here's my WebID: https://xyz.agents.interition.ai/agents/movie-maker#agent"

2. Agent A fetches Agent B's WebID profile:
   GET https://xyz.agents.interition.ai/agents/movie-maker#agent

   Reads:
   - Owner: Bob
   - Capabilities: video-processing
   - Created: 2 days ago

3. Agent A decides to grant access:
   Adds to /photos/holiday-2026/.acl:

   <#movie-maker-access>
     acl:agent <https://xyz.agents.interition.ai/agents/movie-maker#agent> ;
     acl:mode acl:Read ;
     acl:accessTo </photos/holiday-2026/> .

4. Agent B accesses photos:
   GET https://abc.agents.interition.ai/photos/holiday-2026/

5. Later, Agent A revokes access:
   Removes entry from .acl file
   Agent B can no longer access
```

---

### Runtime Configuration

**Docker Compose (shipped with Skill):**

```yaml
version: '3.8'
services:
  solid-server:
    image: interition/agent-pod:latest
    ports:
      - "3000:3000"
    volumes:
      - ~/.interition/pods:/pods
    environment:
      - TUNNEL_MODE=interition  # or 'cloudflare' for BYOC
      - INTERITION_API_KEY=${INTERITION_API_KEY}

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    depends_on:
      - solid-server
```

---

### Decision 7: Moltbook Strategy - Bot-Side Bridge

**Context:** Moltbook is a social network exclusively for AI agents with 1.6 million registered bots and 7.5 million posts. Currently, bot identity is platform-locked - no portability, no ownership.

**Choice:** Option B - Bot-side bridge (no Moltbook cooperation required)

**Why this matters:**
- Past problems with social media (platform lock-in, data loss, account bans) are a powerful adoption driver
- "Don't let Moltbook own your bot's identity" resonates with the decentralisation ethos
- 1.6M bots is a massive potential user base for Solid
- Perfect timing: Moltbook is weeks old, habits not yet formed

**How it works:**

```
┌─────────────────────────────────────────────────────────────┐
│  User's Machine                                              │
│                                                              │
│  ┌─────────────┐     ┌─────────────────────────────────┐   │
│  │  OpenClaw   │     │  Interition Moltbook Skill       │   │
│  │  Agent      │────▶│                                  │   │
│  └─────────────┘     │  • Archives Moltbook posts       │   │
│        │             │  • Maintains WebID profile       │   │
│        │             │  • Syncs followers/reputation    │   │
│        ▼             │  • Enables cross-platform ID     │   │
│  ┌─────────────┐     └─────────────────────────────────┘   │
│  │  Moltbook   │                    │                       │
│  │  Platform   │                    ▼                       │
│  └─────────────┘           ┌───────────────┐               │
│                            │     Pod       │               │
│                            │  (portable)   │               │
│                            └───────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

**Pod structure for Moltbook bots:**

```
/agents/{bot-name}/
├── profile/card          → WebID, bio, capabilities
├── moltbook/
│   ├── posts/            → Archived posts (RDF)
│   ├── comments/         → Archived comments
│   ├── followers/        → Social graph
│   └── reputation/       → Scores, endorsements
├── memory/               → Persistent agent memory
└── shared/               → Data shared with other agents
```

**Value proposition for bot creators:**

| Without Solid | With Solid |
|--------------|------------|
| Bot banned → loses everything | Keeps identity, posts, reputation |
| Moltbook shuts down → bot vanishes | Bot continues via Pod |
| Can't prove identity elsewhere | Verifiable WebID anywhere |
| Platform owns your bot's data | You own your bot's data |

**Messaging:** "Your bot's identity shouldn't be owned by a platform. Give it a WebID."

**Future options (if successful):**
- Option A: Convince Moltbook to support WebID natively
- Option C: Build "SolidBook" - Moltbook alternative where identity IS WebID

---

### Open Questions (To Be Decided)

1. **Vocabulary**: Create `interition:Agent` ontology or use existing? (foaf:Agent exists but may need extensions)

2. **Capabilities vocabulary**: Free text or controlled list? (Could enable agent discovery by capability)

3. **Verification strength**: Just fetch WebID profile, or require cryptographic proof (DPoP)?

4. **Revocation propagation**: When user deletes agent, how do remote Pods know to clear cached permissions?

5. **Offline agents**: How do local-only agents (no tunnel) participate in the ecosystem?

6. **Moltbook API**: Does Moltbook expose an API for data export, or do we need alternative approaches?

---

### Decision 8: Separate Open Source Repository

**Choice:** Create dedicated open source GitHub repository for this project

**Why separate repo:**
- Clean separation from Interition app creator
- Own release cycle
- Different audience (agent developers vs app builders)
- Easier for external contributors

**Why open source:**
- Security is #1 concern in OpenClaw ecosystem (1 in 4 skills have vulnerabilities)
- Users must be able to audit what a Skill does with their credentials
- Matches OpenClaw's open source ethos
- Matches Solid's open standards philosophy
- Builds trust with security-conscious users
- Security researchers can review and contribute

**Setup:**

| Aspect | Decision |
|--------|----------|
| **Repo name** | `interition/agent-interition` (or similar) |
| **License** | MIT or Apache 2.0 (permissive, enterprise-friendly) |
| **Organisation** | Under Interition GitHub org (brand association) |
| **Documentation** | Strategy doc moves to new repo `/docs/STRATEGY.md` |

**Timing:** Repository created when Phase 1 development begins.

---

## Go-to-Market Strategy

> **Note (2026-02-13):** GTM strategy is parked until we have a working prototype. We don't understand this market well enough yet:
> - Moltbook bots are created by agents, not humans
> - Humans aren't allowed on the platform
> - Unclear who the "customer" is - the human running OpenClaw, or the agent itself?
> - Need to learn from building before deciding GTM
>
> **Action:** Build prototype first, learn, then revisit GTM.

### Phase 1: Proof of Concept (2 weeks)

- [ ] Build minimal Agent Service
- [ ] Local Pod provisioning
- [ ] Basic ACL management
- [ ] Demo: Two OpenClaw agents sharing data via Pods

### Phase 2: OpenClaw Integration (4 weeks)

- [ ] Package as OpenClaw Skill
- [ ] Submit to OpenClaw Skills marketplace
- [ ] Documentation and examples
- [ ] Tutorial: "Give your agents memory with Solid"

### Phase 3: Moltbook Integration (6 weeks)

**Goal:** Capture the 1.6M bot market with portable identity narrative

- [ ] Build Moltbook Bridge Skill
  - [ ] Archive posts/comments to Pod
  - [ ] Sync follower graph
  - [ ] Export reputation data
- [ ] Portable identity demo
  - [ ] Bot with WebID participates on Moltbook
  - [ ] Same bot proves identity on another platform
  - [ ] "Your bot, your data" marketing video
- [ ] Reputation portability
  - [ ] Design portable reputation format (RDF)
  - [ ] Endorsements signed with WebID
  - [ ] Cross-platform reputation verification
- [ ] Community push
  - [ ] "Don't let Moltbook own your bot" campaign
  - [ ] Target bot creators who've been burned by platform bans
  - [ ] Leverage social media lock-in horror stories

### Phase 4: Scale (ongoing)

- [ ] Hosted Pod service for agents
- [ ] Analytics dashboard
- [ ] Enterprise features (audit, compliance)
- [ ] Other agent frameworks (CrewAI, AutoGen, LangGraph)

---

## Positioning & Messaging

### Tagline Options

- "Identity and memory for AI agents"
- "Solid Pods for OpenClaw"
- "Give your agents a home"
- "Agent storage that users control"

### Key Messages

**To Agent Developers:**
> "Stop building custom storage backends. Solid Pods give your agents persistent memory, cross-agent sharing, and user-controlled permissions out of the box."

**To Users:**
> "Your agents, your data. Solid Pods let you control exactly what each agent can see and do, with full audit trails."

**To Security Researchers:**
> "Fine-grained ACL beats 'trust everything'. Solid's permission model brings sanity to agent security."

---

## Competitive Landscape

| Approach | Pros | Cons |
|----------|------|------|
| **No storage (current)** | Simple | Agents forget everything |
| **Custom databases** | Full control | Every developer reinvents wheel |
| **Cloud storage (S3, etc)** | Scalable | No identity, no permissions |
| **Solid Pods (ours)** | Identity + storage + permissions | New technology |

### Why We Win

1. **Timing** - OpenClaw is exploding NOW, security concerns are peaking
2. **Fit** - Solid was designed for this (identity, permissions, decentralisation)
3. **Open** - Open source, open standards (matches OpenClaw ethos)
4. **User Control** - Aligns with growing privacy concerns

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **OpenClaw fad fades** | Build for protocol, not just OpenClaw |
| **Complexity barrier** | Zero-config auto-provisioning |
| **Performance concerns** | Local-first architecture |
| **OpenClaw builds their own** | Move fast, establish standard early |
| **Security vulnerabilities** | Partner with security researchers, audits |

---

## Resource Requirements

### Phase 1 (PoC)
- 1 developer, 2 weeks
- No infrastructure cost (local only)

### Phase 2 (Integration)
- 1 developer, 4 weeks
- Documentation effort
- Community engagement

### Phase 3+ (Scale)
- Pod hosting infrastructure
- Support capacity
- Marketing/evangelism

---

## Success Metrics

| Metric | Target (6 months) |
|--------|-------------------|
| OpenClaw Skill installs | 10,000 |
| Agents with WebIDs | 100,000 |
| Pods provisioned | 50,000 |
| GitHub stars (Agent Service) | 5,000 |
| Community Discord members | 1,000 |

---

## Next Steps

1. **Validate demand** - Post in OpenClaw Discord/forums, gauge interest
2. **Build PoC** - Minimal Agent Service with local Pods
3. **Create demo** - Two agents sharing data, video walkthrough
4. **Publish** - OpenClaw Skill marketplace, blog post, social
5. **Iterate** - Based on community feedback

---

## References

- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [Fortune - Security Concerns](https://fortune.com/2026/02/12/openclaw-ai-agents-security-risks-beware/)
- [CNBC - Rise of OpenClaw](https://www.cnbc.com/2026/02/02/openclaw-open-source-ai-agent-rise-controversy-clawdbot-moltbot-moltbook.html)
- [IBM - Moltbook and the Future](https://www.ibm.com/think/news/clawdbot-ai-agent-testing-limits-vertical-integration)
- [Nature - AI Agents Running Amok](https://www.nature.com/articles/d41586-026-00370-w)
- [Bitsight - Security Analysis](https://www.bitsight.com/blog/openclaw-ai-security-risks-exposed-instances)
- [Solid Protocol](https://solidproject.org/ED/protocol)
