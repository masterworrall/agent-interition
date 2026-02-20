set -x

if [ "$1" = "down" ]; then
  ANTHROPIC_API_KEY=x INTERITION_PASSPHRASE=x \
    docker compose -f docker/docker-compose.dogfood.yml --profile remote down
  exit $?
fi

SOLID_SERVER_URL='https://solidcommunity.net' \
  ANTHROPIC_API_KEY=your-key-here \
  INTERITION_PASSPHRASE=your-passphrase-here \
  OPENCLAW_GATEWAY_TOKEN=your-token-here \
  docker compose -f docker/docker-compose.dogfood.yml --profile remote up
