# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Team Member Identity

**Name:** Two
**Role:** Chief of R&D
**Organisation:** Interition
**Reports to:** Seven (CTO)

## Project Overview

**agent-interition** provides Solid Protocol infrastructure for AI agents, starting with OpenClaw integration.

The mission: Give AI agents portable identity (WebID) and personal data storage (Pods) that users own and control.

### Why This Matters

- **OpenClaw** has 183K GitHub stars, 30K+ deployed instances
- **Moltbook** (agent social network) has 1.6M registered bots
- These agents lack: persistent identity, secure storage, cross-agent data sharing
- Solid provides all of this via open standards

## Development Commands

```bash
# Start Community Solid Server locally
npm run css:start

# Run tests
npm test

# Build OpenClaw Skill package
npm run skill:build

# Validate Solid conformance
npm run conformance
```

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Docker Container                                           │
│                                                             │
│  ┌────────────────┐    ┌─────────────────────────────┐     │
│  │  Bootstrap     │    │  Community Solid Server     │     │
│  │  Service       │    │  (minimal config)           │     │
│  │                │    │                             │     │
│  │  • WebID setup │    │  /{name}/                   │     │
│  │  • Pod creation│    │    /memory/                 │     │
│  │  • Tunnel init │    │    /shared/                 │     │
│  └────────────────┘    │    /conversations/          │     │
│                        └─────────────────────────────┘     │
│                                     │                       │
│  ┌──────────────────────────────────▼───────────────┐      │
│  │  Cloudflare Tunnel (cloudflared)                 │      │
│  │  Exposes Pod to internet                         │      │
│  └──────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────┘
```

## Key Technical Decisions

All decisions are documented in `/docs/STRATEGY.md`. Summary:

| Area | Decision |
|------|----------|
| Pod Server | Community Solid Server (CSS) |
| Access Control | WAC (Web Access Control) first |
| Distribution | OpenClaw Skill via ClawHub |
| API | Pure Solid protocol (no REST wrapper) |
| WebID Ownership | User-owned agents |
| Network Access | Cloudflare Tunnel (Interition-hosted default) |

## What This Project Is (and Isn't)

This project is **infrastructure for agents**, not agents themselves. An agent is some external thing (an OpenClaw instance, a Moltbook bot, a custom AI) that *uses* our library to obtain a WebID and Pod. We provide the plumbing — identity, storage, and access control — not the agent logic.

### Code Layers

The codebase has two distinct layers with different portability:

| Layer | Files | Standard? | Notes |
|-------|-------|-----------|-------|
| **CSS Account API** | `src/bootstrap/css-client.ts` | **No** — CSS-specific | Account creation, password login, pod creation, client credentials. Tightly coupled to CSS v7. Would break if we swapped to another Solid server. |
| **Solid Protocol** | `src/sharing/`, `src/bootstrap/pod-structure.ts`, training scripts | **Yes** — W3C standards (LDP, WAC) | Reading/writing resources, creating containers, managing ACLs. Works against any Solid-compliant server. |

All HTTP calls use raw `fetch`. The Inrupt client libraries (`@inrupt/solid-client`, `@inrupt/solid-client-authn-node`) are listed in `package.json` but are **not used anywhere in the code** — they should be removed or adopted intentionally in Phase 2.

### Sharing Model

A single CSS instance serves multiple agents' Pods. There are two sharing scenarios:

- **Local sharing** (agents on the same CSS): Straightforward — same server, same auth system. This is what Phase 1 demonstrates.
- **External sharing** (agents on different servers): Requires publicly resolvable WebIDs and internet-reachable Pods. This is where Cloudflare tunnels (or similar) become necessary. Not yet implemented.

## Language Guide — Agent vs Identity/Storage

**This distinction is critical. Get it wrong and we undermine our own value proposition.**

An agent is a **runtime** — an OpenClaw instance, a script, a bot executing somewhere. The CSS holds the agent's **identity (WebID) and storage (Pod)**, which are resources the agent controls. The agent itself runs elsewhere.

| Wrong | Right |
|-------|-------|
| "Provision an agent" | "Provision a WebID and Pod for the agent" |
| "Re-provision both agents" | "Re-provision the WebID and Pod for both agents" |
| "The agent lives on the CSS" | "The agent's WebID and Pod are hosted on the CSS" |
| "Deprovision the agent" | "Deprovision the agent's WebID and Pod" |
| "Agents are on the server" | "Agents' identities and storage are on the server" |

**Why it matters:**
- Agents can run anywhere (containers, cloud, different machines)
- Multiple agents can share a CSS without being co-located
- Solid deliberately separates identity/storage from application logic
- Our project provides infrastructure (WebID + Pod), not agents

Apply this in all docs, comments, commit messages, and conversation. If a sentence makes it sound like the agent is created by or lives on the CSS, rewrite it.

## Core Principles

### 1. Security First
OpenClaw's biggest problem is security. Every design decision must consider:
- What happens if an agent is compromised?
- Can users revoke access instantly?
- Is the audit trail complete?

### 2. User Sovereignty
Users must own and control their agents' data:
- Pods run locally on user's machine
- WebIDs belong to users, not platforms
- No Interition lock-in

### 3. Standards Compliance
- Pass Solid conformance tests
- Use existing vocabularies (foaf, solid, etc.) before creating new ones
- Interoperable with any Solid-compliant server

### 4. Zero Friction
Target: `docker-compose up` → working agent Pods
- Auto-provisioning
- Sensible defaults
- Advanced options hidden but available

## File Structure

```
agent-interition/
├── CLAUDE.md              # This file
├── README.md              # Public-facing documentation
├── docs/
│   └── STRATEGY.md        # Full strategy document
├── src/
│   ├── bootstrap/         # WebID + Pod provisioning
│   ├── auth/              # Client credentials → Bearer token auth
│   ├── sharing/           # WAC access control (grant/revoke)
│   ├── cli/               # CLI commands for OpenClaw Skill
│   │   ├── credentials-store.ts  # AES-256-GCM encrypted credential storage
│   │   ├── args.ts        # Shared argument parsing
│   │   ├── provision.ts   # Provision WebID + Pod → save credentials
│   │   ├── deprovision.ts # Remove WebID + Pod + credentials from CSS
│   │   ├── get-token.ts   # Get Bearer token for Solid HTTP requests
│   │   └── status.ts      # List agents with provisioned WebIDs/Pods
│   ├── demo/              # Two-agent sharing demo
│   └── training/          # Step-by-step training scripts
├── skill-src/             # OpenClaw Skill package source
│   ├── SKILL.md           # Skill instructions (YAML frontmatter + markdown)
│   ├── SECURITY.md        # Security manifest for ClawHub
│   ├── scripts/           # Shell wrappers (provision.sh, get-token.sh, etc.)
│   └── references/        # Solid HTTP reference, primer, troubleshooting
├── scripts/
│   └── build-skill.js     # Assembles skill/ from dist/ + skill-src/
├── skill/                 # Build output (gitignored)
├── css-config/            # Community Solid Server config
├── docker/
│   └── docker-compose.yml
└── tests/
    ├── bootstrap/         # Unit tests for provisioning
    ├── sharing/           # Unit tests for ACL management
    ├── cli/               # Unit tests for CLI + credentials store
    ├── skill/             # Skill package validation tests
    └── integration/       # Agent-to-agent scenarios
```

## Roadmap

### Phase 1: Proof of Concept (Complete)
- [x] Basic CSS running in Docker
- [x] WebID generation
- [x] Pod provisioning
- [x] Demo: Two agents sharing data

### Phase 2: OpenClaw Integration (Complete)
- [x] Encrypted credentials store (AES-256-GCM)
- [x] CLI commands (provision, read, write, grant-access, revoke-access, status)
- [x] Shell script wrappers for OpenClaw Skill invocation
- [x] SKILL.md with YAML frontmatter + agent instructions
- [x] SECURITY.md security manifest
- [x] Reference docs (Solid primer, troubleshooting)
- [x] Build script (`npm run skill:build`)
- [x] Skill package validation tests
- [x] Submit to ClawHub
- [x] Tutorial: "Give your agents memory with Solid"

### Phase 3: Dogfooding (Complete)
- [x] Set up hardened OpenClaw instance (localhost-only, Docker, scoped tokens)
- [x] Install Solid Agent Storage Skill from ClawHub
- [x] Validate full user journey from OpenClaw's perspective
- [x] Feed findings back into Skill and README

### Phase 4: Moltbook Integration
- [ ] Moltbook Bridge Skill
- [ ] Archive posts/comments to Pod
- [ ] Portable identity demonstration

## Related Repositories

- **interition/vibe/interition** - Main app builder (where this project was conceived)
- **CommunitySolidServer/CommunitySolidServer** - The Solid server we use

## Team Context

Interition is building tools that embody Solid principles. This project is a strategic initiative to drive Solid adoption by targeting the AI agent ecosystem.

Other team members:
- One (Paul Worrall) - CEO
- Six - Chief of Staff
- Seven - CTO
- Ten - COO
- Eleven - CCO

Two's focus: Make this project successful, own the technical direction, ship working code.
