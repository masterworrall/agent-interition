#!/usr/bin/env bash
#
# Start/stop Ten (COO) on ubuntu01
#
# Usage:
#   ./start-ten.sh              Start Ten (detached)
#   ./start-ten.sh up           Start Ten (detached)
#   ./start-ten.sh down         Stop Ten
#   ./start-ten.sh reset        Stop Ten and remove all volumes (full reset)
#   ./start-ten.sh logs         Tail Ten's logs
#   ./start-ten.sh pair         List and approve pending device pairing requests
#   ./start-ten.sh auth         OpenAI OAuth login (headless — manual paste)
#   ./start-ten.sh model        Set default model (e.g. openai/gpt-4o)
#   ./start-ten.sh cron         Add the health-report cron job
#   ./start-ten.sh setup        First-time setup: pair + auth + cron
#   ./start-ten.sh help         Show this help
#
# Secrets are in .env.ten (never committed — see .env.ten.example)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.ten.yml"
ENV_FILE="$SCRIPT_DIR/.env.ten"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found."
  echo "Copy .env.ten.example to .env.ten and fill in your values."
  exit 1
fi

COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

usage() {
  echo "Usage: $0 [command]"
  echo ""
  echo "Commands:"
  echo "  up        Start Ten (detached) [default]"
  echo "  down      Stop Ten"
  echo "  reset     Stop Ten and remove all volumes (full reset)"
  echo "  logs      Tail Ten's logs"
  echo "  pair      List and approve pending device pairing requests"
  echo "  auth      OpenAI OAuth login (headless — manual paste of callback URL)"
  echo "  model     Set default model (e.g. $0 model openai/gpt-4o)"
  echo "  cron      Add the health-report cron job (run once after first start)"
  echo "  setup     First-time setup: pair + auth + cron (interactive)"
  echo "  help      Show this help"
  exit 0
}

do_pair() {
  echo "Pending device pairing requests:"
  docker exec ten node /app/openclaw.mjs devices list
  echo ""
  read -rp "Enter request ID to approve (or press Enter to skip): " request_id
  if [[ -n "$request_id" ]]; then
    docker exec ten node /app/openclaw.mjs devices approve "$request_id"
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
  docker exec -it ten node /app/openclaw.mjs models auth login --provider openai-codex
  echo ""
  echo "Setting default model to openai-codex/gpt-5.4..."
  docker exec -it ten node /app/openclaw.mjs config set agents.defaults.model "openai-codex/gpt-5.4"
  echo ""
  echo "Restart the container to apply: docker restart ten"
  echo "OpenAI auth complete. Tokens and model config stored in container volume."
}

do_model() {
  local model="${1:-openai/gpt-4o}"
  echo "Setting default model to: $model"
  docker exec -it ten node /app/openclaw.mjs config set agents.defaults.model "$model"
  echo "Model set. Verify:"
  docker exec ten node /app/openclaw.mjs config get agents.defaults.model
}

do_cron() {
  echo "Adding health-report cron job (every 4 hours)..."
  docker exec -it ten node /app/openclaw.mjs cron add \
    --name "health-report" \
    --cron "0 */4 * * *" \
    --session isolated \
    --message "Check the crawlout.io health endpoint at https://crawlout.io/monitor/health/status.ttl using your Solid Agent Storage skill credentials. Post a summary report to the team channel at https://crawlout.io/team/chat/ as a Turtle message. Include: HTTP status, server health, error count, disk usage, pod count."
  echo ""
  echo "Verifying:"
  docker exec -it ten node /app/openclaw.mjs cron list
}

cmd="${1:-up}"

case "$cmd" in
  up)
    echo "Starting Ten..."
    $COMPOSE up -d
    echo ""
    echo "Ten is running on port 18800."
    echo "Telegram: message your bot to talk to Ten."
    echo "Browser:  ./tunnel.sh ten → http://localhost:18800"
    echo ""
    echo "First time? Run: $0 setup"
    ;;
  down)
    echo "Stopping Ten..."
    $COMPOSE down
    ;;
  reset)
    echo "Stopping Ten and removing volumes..."
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
  cron)
    do_cron
    ;;
  setup)
    echo "=== Ten first-time setup ==="
    echo ""
    echo "Step 1/3: Device pairing"
    echo "Open http://localhost:18800 in your browser first, then:"
    do_pair
    echo ""
    echo "Step 2/3: OpenAI OAuth"
    do_auth
    echo ""
    echo "Step 3/3: Health monitoring cron"
    do_cron
    echo ""
    echo "=== Setup complete ==="
    echo "Telegram allowlist was configured at startup from .env.ten."
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
