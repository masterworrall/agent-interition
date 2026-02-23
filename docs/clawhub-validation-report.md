# ClawHub Validation Report

**Skill:** solid-agent-storage v0.1.0
**Submitted:** 2026-02-16
**Publisher:** @masterworrall

## Summary

ClawHub's automated validation flagged several issues on initial submission:

> "The skill's code and runtime instructions largely match its stated Solid Pod provisioning purpose, but there are multiple inconsistencies between registry metadata, SKILL.md, and the included files (and a few security claims don't match the implementation), so you should review the mismatches and the server target before installing."

## Issues and Responses

### 1. Registry metadata vs SKILL.md requirements

**What ClawHub said:** The registry claims no required binaries or env vars, but SKILL.md and the included scripts need `node` and `docker`, plus `SOLID_SERVER_URL` and `INTERITION_PASSPHRASE`.

**Root cause:** The web upload form did not pick up the `requires` block from the SKILL.md YAML frontmatter. The frontmatter correctly declares `bins: ["node", "docker"]` and `env: ["SOLID_SERVER_URL", "INTERITION_PASSPHRASE"]`, but the registry-level metadata was empty.

**Action:** Ensure the registry metadata matches the SKILL.md frontmatter on re-upload. The form may have separate fields for declaring required binaries and environment variables that need to be filled manually.

**Status:** To be fixed on re-upload.

---

### 2. "Local only" network claim vs configurable SOLID_SERVER_URL

**What ClawHub said:** SECURITY.md claims "local only" network usage, but the implementation accepts an arbitrary `SOLID_SERVER_URL`. If a user points the Skill at a remote server, credentials and tokens will be exchanged with that server.

**Root cause:** SECURITY.md was written assuming the default localhost configuration, without acknowledging that `SOLID_SERVER_URL` makes the target configurable.

**Action:** Updated SECURITY.md to accurately describe the network behaviour:
- Default target is `http://localhost:3000` (local CSS)
- The Skill contacts whatever server is set in `SOLID_SERVER_URL`
- Added explicit warning: "Only use a server you control and trust"
- Retained the accurate claims: no analytics, no telemetry, no third-party API calls

**Status:** Fixed in SECURITY.md (v0.1.1).

---

### 3. docker-compose reference not included in package

**What ClawHub said:** SKILL.md references running `docker-compose up` in an "agent-interition" directory that is not included in the package.

**Root cause:** The SKILL.md setup section assumed the user had cloned the full source repository. The Skill package is a subset — it contains the CLI and scripts but not the Docker configuration.

**Action:** Updated SKILL.md setup section to:
- Clarify that a Community Solid Server is a prerequisite, not bundled
- Link to the source repository for Docker setup instructions
- Remove the assumption that users have the full repo

**Status:** Fixed in SKILL.md (v0.1.1).

---

### 4. Install mechanism mismatch

**What ClawHub said:** The registry marks the package as "instruction-only", yet it contains compiled JavaScript CLI files and shell scripts meant to be executed. The registry should advertise the binaries/requirements it needs.

**Root cause:** The web upload form defaulted to "instruction-only" classification. The package does contain executable code (compiled JS + shell wrappers).

**Action:** On re-upload, ensure the registry classification reflects that the package contains executable scripts, not just instructions. The SKILL.md frontmatter already declares the required binaries (`node`, `docker`).

**Status:** To be fixed on re-upload.

---

### 5. Credentials handling (passed with notes)

**What ClawHub said:** Credentials handling is proportionate. Encrypted storage under `~/.interition/agents/`, passphrase-protected, `0600` file permissions, session-only key in memory. Noted the same `SOLID_SERVER_URL` trust issue.

**Action:** No code changes needed. The `SOLID_SERVER_URL` trust warning added to SECURITY.md and SKILL.md addresses the noted concern.

**Status:** No action required (covered by fix #2).

---

### 6. Persistence & Privilege (passed)

**What ClawHub said:** The Skill stores encrypted credentials locally, does not request permanent inclusion, does not modify other skills or system config.

**Action:** None required. Validated as expected.

**Status:** Passed.

## Changes Made (v0.1.1)

| File | Change |
|------|--------|
| `SECURITY.md` | Replaced "Local only" with accurate description of configurable `SOLID_SERVER_URL`. Added trust warning. |
| `SKILL.md` | Clarified CSS is a prerequisite (not bundled). Added link to source repo. Added `SOLID_SERVER_URL` trust warning. Bumped version to 0.1.1. |

## Changes Made (v0.3.3)

| File | Change |
|------|--------|
| `SKILL.md` | Restructured frontmatter to `metadata.openclaw` format. Added `jq` to required bins, `primaryEnv`, brew install spec. Rewrote Setup to recommend self-hosted CSS. Added "How Credentials Work" section. Bumped version to 0.3.3. |
| `clawhub-push.sh` | Updated version and changelog. |
| `CLAUDE.md` | Updated crawlout.io status to live. |
| `docs/clawhub-upload-checklist.md` | New file — checklist for ClawHub publish workflow. |

**Registry metadata fix:** Frontmatter restructured from `metadata.requires` to `metadata.openclaw.requires` to match the ClawHub spec. The `jq` binary was also missing from the `bins` declaration despite being used in Quick Reference examples. Added "How Credentials Work" section to clarify the standard trust model for authenticated remote services.

## Re-upload Checklist

- [x] Fix SECURITY.md network claims
- [x] Fix SKILL.md setup prerequisites
- [x] Bump version to 0.1.1
- [x] Re-upload to ClawHub with correct registry metadata (bins, env vars)
- [x] Verify registry classification reflects executable package (not instruction-only)
- [ ] Confirm validation passes clean
