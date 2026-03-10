#!/usr/bin/env bash
#
# Start/stop Thirteen (Social Media) on ubuntu01
#
# Usage:
#   ./start-thirteen.sh              Start Thirteen (detached)
#   ./start-thirteen.sh up           Start Thirteen (detached)
#   ./start-thirteen.sh down         Stop Thirteen
#   ./start-thirteen.sh reset        Stop Thirteen and remove all volumes (full reset)
#   ./start-thirteen.sh logs         Tail Thirteen's logs
#   ./start-thirteen.sh pair         List and approve pending device pairing requests
#   ./start-thirteen.sh auth         OpenAI OAuth login (headless — manual paste)
#   ./start-thirteen.sh model        Set default model (e.g. openai/gpt-4o)
#   ./start-thirteen.sh setup        First-time setup: pair + auth
#   ./start-thirteen.sh help         Show this help
#
# Secrets are in .env.thirteen (never committed — see .env.thirteen.example)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.thirteen.yml"
ENV_FILE="$SCRIPT_DIR/.env.thirteen"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found."
  echo "Copy .env.thirteen.example to .env.thirteen and fill in your values."
  exit 1
fi

COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

usage() {
  echo "Usage: $0 [command]"
  echo ""
  echo "Commands:"
  echo "  up        Start Thirteen (detached) [default]"
  echo "  down      Stop Thirteen"
  echo "  reset     Stop Thirteen and remove all volumes (full reset)"
  echo "  logs      Tail Thirteen's logs"
  echo "  pair      List and approve pending device pairing requests"
  echo "  auth      OpenAI OAuth login (headless — manual paste of callback URL)"
  echo "  model     Set default model (e.g. $0 model openai/gpt-4o)"
  echo "  setup     First-time setup: pair + auth (interactive)"
  echo "  help      Show this help"
  exit 0
}

do_pair() {
  echo "Pending device pairing requests:"
  docker exec thirteen node /app/openclaw.mjs devices list
  echo ""
  read -rp "Enter request ID to approve (or press Enter to skip): " request_id
  if [[ -n "$request_id" ]]; then
    docker exec thirteen node /app/openclaw.mjs devices approve "$request_id"
    echo "Device approved."
  fi
}

do_auth() {
  echo "OpenAI OAuth login (headless mode)"
  echo ""
  echo "This will start the OAuth flow. OpenClaw will print a URL."
  echo "1. Copy the URL and open it in your browser"
  echo "2. Log in to OpenAI and authorise"
  echo "3. Your browser will redirect to http://127.0.0.1:1455/auth/callback?..."
  echo "4. That page will fail to load (port not exposed) — this is expected"
  echo "5. Copy the FULL URL from your browser address bar"
  echo "6. Paste it back here when prompted"
  echo ""
  docker exec -it thirteen node /app/openclaw.mjs models auth login --provider openai-codex
  echo ""
  echo "Setting default model to openai-codex/gpt-5.4..."
  docker exec -it thirteen node /app/openclaw.mjs config set agents.defaults.model "openai-codex/gpt-5.4"
  echo ""
  echo "Restart the container to apply: docker restart thirteen"
  echo "OpenAI auth complete. Tokens and model config stored in container volume."
}

do_model() {
  local model="${1:-openai/gpt-4o}"
  echo "Setting default model to: $model"
  docker exec -it thirteen node /app/openclaw.mjs config set agents.defaults.model "$model"
  echo "Model set. Verify:"
  docker exec thirteen node /app/openclaw.mjs config get agents.defaults.model
}

cmd="${1:-up}"

case "$cmd" in
  up)
    echo "Starting Thirteen..."
    $COMPOSE up -d
    echo ""
    echo "Thirteen is running on port 18801."
    echo "Telegram: message your bot to talk to Thirteen."
    echo "Browser:  ./tunnel.sh thirteen → http://localhost:18801"
    echo ""
    echo "First time? Run: $0 setup"
    ;;
  down)
    echo "Stopping Thirteen..."
    $COMPOSE down
    ;;
  reset)
    echo "Stopping Thirteen and removing volumes..."
    $COMPOSE down -v
    echo "Reset complete. Run '$0 up' then '$0 setup' to start fresh."
    ;;
  logs)
    shift || true
    $COMPOSE logs -f "${@:---tail=50}"
    ;;
  pair)
    do_pair
    ;;
  auth)
    do_auth
    ;;
  model)
    shift || true
    do_model "${1:-openai/gpt-4o}"
    ;;
  setup)
    echo "=== Thirteen first-time setup ==="
    echo ""
    echo "Step 1/3: Device pairing"
    echo "Open http://localhost:18801 in your browser first, then:"
    do_pair
    echo ""
    echo "Step 2/3: OpenAI OAuth"
    do_auth
    echo ""
    echo "Step 3/3: Set default model"
    do_model "openai/gpt-4o"
    echo ""
    echo "=== Setup complete ==="
    echo "Message your Telegram bot to verify."
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Unknown command: $cmd"
    usage
    ;;
esac
