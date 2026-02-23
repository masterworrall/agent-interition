#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="./skill/solid-agent-storage"
VERSION=$(grep '^version:' "$SKILL_DIR/SKILL.md" | head -1 | awk '{print $2}')

if [ -z "$VERSION" ]; then
  echo "Error: could not read version from $SKILL_DIR/SKILL.md" >&2
  exit 1
fi

CHANGELOG="${1:-No changelog provided}"

echo "Publishing solid-agent-storage v${VERSION}..."
clawhub publish "$SKILL_DIR" \
  --slug solid-agent-storage \
  --name "Solid Agent Storage" \
  --version "$VERSION" \
  --changelog "$CHANGELOG" \
  --tags latest
