#!/bin/sh
set -e

echo "[entrypoint] Starting Community Solid Server on port ${CSS_PORT}..."

# Start CSS in the background
npx community-solid-server \
  -c @css:config/file.json \
  -f "${CSS_DATA_DIR}" \
  --seedConfig css-config/seed.json \
  -p "${CSS_PORT}" &

CSS_PID=$!

# Wait for CSS to be ready
echo "[entrypoint] Waiting for CSS to be ready..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${CSS_PORT}/" > /dev/null 2>&1; then
    echo "[entrypoint] CSS is ready!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[entrypoint] ERROR: CSS failed to start within 30 seconds"
    exit 1
  fi
  sleep 1
done

# Bootstrap agents if BOOTSTRAP_AGENTS is set (comma-separated names)
if [ -n "${BOOTSTRAP_AGENTS}" ]; then
  echo "[entrypoint] Bootstrapping agents: ${BOOTSTRAP_AGENTS}"
  IFS=',' read -r -a AGENTS <<< "${BOOTSTRAP_AGENTS}"
  for AGENT in "${AGENTS[@]}"; do
    AGENT=$(echo "$AGENT" | xargs)  # trim whitespace
    echo "[entrypoint] Provisioning agent: ${AGENT}"
    node dist/bootstrap/cli.js --name "${AGENT}" --displayName "Agent ${AGENT}" --serverUrl "http://localhost:${CSS_PORT}" || true
  done
fi

echo "[entrypoint] Solid Agent Pods running. CSS PID: ${CSS_PID}"

# Keep container running
wait $CSS_PID
