#!/bin/sh
# Optional post-build install: copy the bundled solid-ops.js to a
# stable team-shared location specified by SOLID_OPS_DEPLOY_DIR.
#
# This step is OFF BY DEFAULT. Operators who want it enable it by
# setting SOLID_OPS_DEPLOY_DIR (typically in a gitignored .env.local
# file at the repo root). External consumers see no internal paths.
#
# Idempotent — safe to re-run after every build.
set -eu

# Source local env if present; .env.local takes precedence over .env.
if [ -f .env.local ]; then . ./.env.local; fi
if [ -z "${SOLID_OPS_DEPLOY_DIR:-}" ] && [ -f .env ]; then . ./.env; fi

if [ -z "${SOLID_OPS_DEPLOY_DIR:-}" ]; then
  cat <<'HINT'
SOLID_OPS_DEPLOY_DIR not set — skipping team-tools install.

To enable: copy .env.local.example to .env.local and set the path,
e.g.

  cp .env.local.example .env.local
  # then edit .env.local:
  #   SOLID_OPS_DEPLOY_DIR=$HOME/Development/interition/team-tools/solid-ops

Then re-run:  npm run install:team-tools
HINT
  exit 0
fi

# Tilde expansion: $SOLID_OPS_DEPLOY_DIR may contain ~ or $HOME literally
# depending on how the operator wrote it.
DEST=$(eval echo "$SOLID_OPS_DEPLOY_DIR")

if [ ! -f src/cli/solid-ops.ts ]; then
  echo "ERROR: src/cli/solid-ops.ts not found. Wrong working directory?" >&2
  exit 1
fi

mkdir -p "$DEST"

# Bundle solid-ops.ts into a single self-contained ESM file via esbuild.
# Same pattern the Claude Code skills use for their bundled binaries —
# avoids the dist/cli/*.js relative-import resolution that breaks when
# the file is copied out of the package.
npx esbuild src/cli/solid-ops.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile="$DEST/solid-ops.js"

printf '#!/bin/sh\nexec node "$(dirname "$0")/solid-ops.js" "$@"\n' > "$DEST/solid-ops"
chmod +x "$DEST/solid-ops"

echo "Installed bundled solid-ops to $DEST/solid-ops"
