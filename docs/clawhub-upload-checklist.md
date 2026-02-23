# ClawHub Upload Checklist

Use this checklist every time you upload or re-upload the Solid Agent Storage Skill to ClawHub via the web form. The web form has separate fields that must match `SKILL.md` frontmatter — they are **not** auto-populated.

## Pre-Upload

- [ ] Run `npm run skill:build` to rebuild the skill package
- [ ] Verify `skill/solid-agent-storage/SKILL.md` frontmatter matches the values below
- [ ] Confirm version in `clawhub-push.sh` matches `SKILL.md` version

## Web Form Fields

Fill these fields in the ClawHub web upload form to match `SKILL.md` frontmatter:

| Web Form Field | Value |
|----------------|-------|
| Required binaries | `node`, `curl`, `jq` |
| Required env vars | `INTERITION_PASSPHRASE` |
| Optional env vars | `SOLID_SERVER_URL` |
| Package type | Executable (not instruction-only) |
| Categories | storage, identity, data |

## Post-Upload

- [ ] Verify the registry page shows required binaries: `node`, `curl`, `jq`
- [ ] Verify the registry page shows required env var: `INTERITION_PASSPHRASE`
- [ ] Verify the registry page shows optional env var: `SOLID_SERVER_URL`
- [ ] Verify the package type is listed as executable
- [ ] Request a fresh security assessment to confirm no metadata mismatches
