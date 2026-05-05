#!/bin/sh
# Drops a .solid-memory-bridge.json config into the matching ~/.claude/projects
# slug for a given project directory. Idempotent — overwrites if present.
set -eu

usage() {
  echo "Usage: init-project.sh --project-dir <abs-path> --agent <name> --server-url <url>"
  echo "  Optional: --ipv4-first false   (default: true)"
  exit 1
}

PROJECT_DIR=""
AGENT=""
SERVER_URL=""
IPV4FIRST="true"

while [ $# -gt 0 ]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --server-url) SERVER_URL="$2"; shift 2 ;;
    --ipv4-first) IPV4FIRST="$2"; shift 2 ;;
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

printf '{"status":"ok","configPath":"%s","slug":"%s","agent":"%s"}\n' \
  "$CONFIG_PATH" "$SLUG" "$AGENT"
