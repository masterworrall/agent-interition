#!/bin/sh
set -e

PORT="${SAP_PORT:-3000}"
DATA_DIR="${SAP_DATA_DIR:-/data}"

echo "[entrypoint] Starting Community Solid Server on port ${PORT}..."

# Start CSS in the background
npx community-solid-server \
  -c @css:config/file.json \
  -f "${DATA_DIR}" \
  --seedConfig css-config/seed.json \
  -p "${PORT}" &

CSS_PID=$!

# Wait for CSS to be ready (using Node since slim image has no curl)
echo "[entrypoint] Waiting for CSS to be ready..."
i=0
while [ "$i" -lt 30 ]; do
  if node -e "fetch('http://localhost:${PORT}/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
    echo "[entrypoint] CSS is ready!"
    break
  fi
  i=$((i + 1))
  if [ "$i" -eq 30 ]; then
    echo "[entrypoint] ERROR: CSS failed to start within 30 seconds"
    exit 1
  fi
  sleep 1
done

# Bootstrap agents if BOOTSTRAP_AGENTS is set (comma-separated names)
if [ -n "${BOOTSTRAP_AGENTS}" ]; then
  echo "[entrypoint] Bootstrapping agents: ${BOOTSTRAP_AGENTS}"
  OLD_IFS="$IFS"
  IFS=','
  for AGENT in ${BOOTSTRAP_AGENTS}; do
    AGENT=$(echo "$AGENT" | xargs)
    echo "[entrypoint] Provisioning agent: ${AGENT}"
    node dist/bootstrap/cli.js --name "${AGENT}" --displayName "Agent ${AGENT}" --serverUrl "http://localhost:${PORT}" || true
  done
  IFS="$OLD_IFS"
fi

echo "[entrypoint] Solid Agent Pods running. CSS PID: ${CSS_PID}"

# Keep container running
wait $CSS_PID
