#!/bin/sh
set -x

# ── Fill in your credentials here ──────────────────────────────
export ANTHROPIC_API_KEY=your-key-here
export INTERITION_PASSPHRASE=your-passphrase-here
export OPENCLAW_ALPHA_TOKEN=your-alpha-token-here
export OPENCLAW_BETA_TOKEN=your-beta-token-here
# ────────────────────────────────────────────────────────────────

COMPOSE_FILE=docker/docker-compose.exercise.yml

if [ "$1" = "down" ]; then
  docker compose -f "$COMPOSE_FILE" down
  exit $?
fi

docker compose -f "$COMPOSE_FILE" up
