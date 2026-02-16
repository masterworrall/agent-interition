set -x

ANTHROPIC_API_KEY=your-key-here \
  INTERITION_PASSPHRASE=your-passphrase-here \
  OPENCLAW_GATEWAY_TOKEN=your-token-here \
  docker compose -f docker/docker-compose.dogfood.yml --profile local up
