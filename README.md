# Solid Agent Pods

> Give AI agents portable identity and personal data storage

**Solid Agent Pods** provides [Solid Protocol](https://solidproject.org/) infrastructure for AI agents. Starting with [OpenClaw](https://github.com/steinbergpeter/OpenClaw) integration, we enable agents to have:

- **Persistent Identity** - WebID for each agent
- **Personal Storage** - Pod containers for agent data
- **Cross-Agent Sharing** - ACL-controlled data access
- **User Sovereignty** - Users own and control their agents' data

## Why?

OpenClaw has 183K GitHub stars and 30K+ deployed instances. Moltbook (agent social network) has 1.6M registered bots. These agents face common problems:

| Problem | Solution |
|---------|----------|
| No persistent memory | Pod storage survives restarts |
| No identity standard | WebID provides verifiable identity |
| No secure sharing | Solid ACL controls access |
| Platform lock-in | Data is portable, user-owned |

## Quick Start

```bash
# Coming soon
docker-compose up
```

One command provisions:
- Community Solid Server
- WebID for your agent
- Personal Pod storage
- Optional internet access via Cloudflare Tunnel

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your Machine                                                │
│                                                              │
│  ┌─────────────┐                                            │
│  │  OpenClaw   │──────────────────────┐                     │
│  │  Agent      │                      │                     │
│  └─────────────┘                      ▼                     │
│                            ┌─────────────────────┐          │
│                            │  Community Solid    │          │
│                            │  Server             │          │
│                            │                     │          │
│                            │  /agents/{name}/    │          │
│                            │    /memory/         │          │
│                            │    /shared/         │          │
│                            └─────────────────────┘          │
│                                      │                      │
│                                      ▼                      │
│                            ┌─────────────────────┐          │
│                            │  Cloudflare Tunnel  │          │
│                            │  (optional)         │          │
│                            └─────────────────────┘          │
└──────────────────────────────┼──────────────────────────────┘
                               │
                               ▼
              https://{agent-id}.agents.interition.ai
```

## OpenClaw Skill

Install via ClawHub:

```
# Coming soon
claw install solid-agent-storage
```

## Documentation

- [Strategy & Architecture](docs/STRATEGY.md) - Full technical decisions and roadmap
- [WebID Setup](docs/WEBID.md) - How agent identity works (coming soon)
- [Sharing Data](docs/SHARING.md) - Agent-to-agent data access (coming soon)

## Status

**Phase 1: Proof of Concept** - In development

- [ ] Basic CSS running in Docker
- [ ] WebID generation for agents
- [ ] Pod provisioning
- [ ] Demo: Two agents sharing data

## Contributing

This is an open source project. Security is critical in the agent ecosystem - we welcome reviews, audits, and contributions.

## License

MIT

## Links

- [Interition](https://interition.ai) - The team behind this
- [Solid Project](https://solidproject.org/) - The protocol
- [OpenClaw](https://github.com/steinbergpeter/OpenClaw) - The agent framework
- [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) - The server implementation
