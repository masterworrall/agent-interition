#!/bin/sh
# Drops a .solid-memory-bridge.json config into the matching ~/.claude/projects
# slug for a given project directory, AND patches the project's CLAUDE.md with
# an orientation block so the agent knows the bridge is installed and how to
# narrate Pod-resident memory correctly. Idempotent — re-running replaces the
# CLAUDE.md block in place between markers.
set -eu

usage() {
  echo "Usage: init-project.sh --project-dir <abs-path> --agent <name> --server-url <url>"
  echo "  Optional: --ipv4-first false   (default: true)"
  echo "  Optional: --no-claude-md       (skip CLAUDE.md patch)"
  exit 1
}

PROJECT_DIR=""
AGENT=""
SERVER_URL=""
IPV4FIRST="true"
PATCH_CLAUDE_MD="true"

while [ $# -gt 0 ]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --server-url) SERVER_URL="$2"; shift 2 ;;
    --ipv4-first) IPV4FIRST="$2"; shift 2 ;;
    --no-claude-md) PATCH_CLAUDE_MD="false"; shift ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

[ -n "$PROJECT_DIR" ] || usage
[ -n "$AGENT" ] || usage
[ -n "$SERVER_URL" ] || usage

# Compute the Claude Code slug: replace / with - in the absolute path
SLUG=$(printf '%s' "$PROJECT_DIR" | sed 's:/:-:g')
TARGET_DIR="$HOME/.claude/projects/$SLUG"
mkdir -p "$TARGET_DIR"

CONFIG_PATH="$TARGET_DIR/.solid-memory-bridge.json"
printf '{\n  "agent": "%s",\n  "serverUrl": "%s",\n  "ipv4First": %s\n}\n' \
  "$AGENT" "$SERVER_URL" "$IPV4FIRST" > "$CONFIG_PATH"

CLAUDE_MD_STATUS="skipped"
if [ "$PATCH_CLAUDE_MD" = "true" ]; then
  CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"
  SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
  SNIPPET_PATH="$SCRIPT_DIR/../references/claude-md-orientation.md"
  BEGIN_MARKER="<!-- BEGIN solid-context-memory orientation -->"
  END_MARKER="<!-- END solid-context-memory orientation -->"

  if [ ! -f "$SNIPPET_PATH" ]; then
    CLAUDE_MD_STATUS="snippet-missing"
  else
    if [ ! -f "$CLAUDE_MD" ]; then
      cat "$SNIPPET_PATH" > "$CLAUDE_MD"
      CLAUDE_MD_STATUS="created"
    else
      # Strip any existing block between the markers (inclusive), then append fresh.
      if grep -qF "$BEGIN_MARKER" "$CLAUDE_MD"; then
        TMP=$(mktemp)
        awk -v begin="$BEGIN_MARKER" -v endm="$END_MARKER" '
          $0 == begin { strip = 1; next }
          $0 == endm  { strip = 0; next }
          !strip      { print }
        ' "$CLAUDE_MD" > "$TMP"
        mv "$TMP" "$CLAUDE_MD"
        CLAUDE_MD_STATUS="updated"
      else
        CLAUDE_MD_STATUS="appended"
      fi
      # Ensure trailing blank line before append, then append the snippet.
      tail -c 1 "$CLAUDE_MD" | od -An -c | grep -q '\\n' || printf '\n' >> "$CLAUDE_MD"
      printf '\n' >> "$CLAUDE_MD"
      cat "$SNIPPET_PATH" >> "$CLAUDE_MD"
    fi
  fi
fi

printf '{"status":"ok","configPath":"%s","slug":"%s","agent":"%s","claudeMd":"%s"}\n' \
  "$CONFIG_PATH" "$SLUG" "$AGENT" "$CLAUDE_MD_STATUS"
