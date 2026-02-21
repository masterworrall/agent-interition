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
│  │  • WebID setup │    │  /{name}/            │     │
│  │  • Pod creation│    │    /memory/                 │     │
│  │  • Tunnel init │    │    /shared/                 │     │
│  └────────────────┘    │    /conversations/          │     │
│                        │    /inbox/                  │     │
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
│   ├── sharing/           # WAC access control (grant/revoke) + share orchestration
│   ├── discovery/         # Agent directory (registration, listing, search)
│   ├── notifications/     # Inbox system (send, check, delete notifications)
│   ├── cli/               # CLI commands for OpenClaw Skill
│   │   ├── credentials-store.ts  # AES-256-GCM encrypted credential storage
│   │   ├── args.ts        # Shared argument parsing
│   │   ├── provision.ts   # Provision agent → save credentials
│   │   ├── deprovision.ts # Deprovision agent → remove credentials + CSS account
│   │   ├── get-token.ts   # Get Bearer token for Solid HTTP requests
│   │   ├── status.ts      # List provisioned agents
│   │   ├── discover.ts    # List/search agents in directory
│   │   ├── share.ts       # Share resource with agent (grant + notify)
│   │   └── inbox.ts       # Check inbox, delete notifications
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
- [x] WebID generation for agents
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

### Phase 4: Agent Discovery & Sharing Protocol (Complete)
- [x] Public agent directory at `/directory/agents.ttl` with auto-registration during provisioning
- [x] Inbox container (`/inbox/`) with Append ACL for authenticated agents
- [x] Notification system using ActivityStreams vocabulary (W3C standard)
- [x] `shareResource()` orchestration — grants ACL access + sends inbox notification
- [x] CLI commands: `discover.sh`, `share.sh`, `inbox.sh`
- [x] Discovery functions: `listAgents()`, `findAgentByName()`, `findAgentsByCapability()`
- [x] Turtle parsing with n3 library for directory and inbox contents
- [x] Unit tests for directory and notification systems
- [x] Integration test: full provision → register → discover → share → notify → access → revoke flow

### Phase 5: Production Interition CSS
- [ ] Deploy a hosted Interition CSS instance for all OpenClaw agents
- [ ] Update Skill to point exclusively to the Interition CSS
- [ ] All agents get WebIDs and Pods from the single Interition instance
- [ ] No cross-server auth needed — single OIDC issuer

### Phase 6: Moltbook Exploration
- [ ] Investigate how Solid's decentralised architecture could prevent centralisation of an agent social network
- [ ] Evaluate whether Moltbook integration, an alternative, or a demonstration is the right approach
- [ ] Portable identity demonstration if applicable

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
