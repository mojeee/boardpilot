#!/usr/bin/env bash
# Builds the BoardPilot diagnostic agent (firmware/agent) with arduino-cli for every board that has
# a board file (boards/*.json), or only for the board ids given as arguments, and writes
# resources/agent/<boardId>/ (images + manifest.json) and resources/agent/index.json.
#
#   npm run build:agent                         all boards
#   npm run build:agent -- rpi-pico arduino-uno-r3
#   npm run build:agent -- --install-cores      also install missing arduino-cli cores
#
# The work is done by scripts/build-agent.mjs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v arduino-cli >/dev/null 2>&1; then
  cat >&2 <<EOF
arduino-cli is not installed, so the agent firmware cannot be built.

Install it, then run this script again with --install-cores to add the board cores:

  brew install arduino-cli
  npm run build:agent -- --install-cores

End users do not need this: the app ships the prebuilt agent in resources/agent/.
EOF
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed to run scripts/build-agent.mjs." >&2
  exit 1
fi

exec node "$ROOT/scripts/build-agent.mjs" "$@"
