#!/usr/bin/env bash
set -euo pipefail

NODE_BIN_DEFAULT="/home/yuval/.nvm/versions/node/v22.15.0/bin/node"
NODE_BIN="${NODE_BIN:-$NODE_BIN_DEFAULT}"
NPM_BIN="$(dirname "$NODE_BIN")/npm"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Node binary not found at: $NODE_BIN"
  echo "Set NODE_BIN to your node path and rerun."
  exit 1
fi

if [[ ! -x "$NPM_BIN" ]]; then
  echo "npm not found next to node: $NPM_BIN"
  exit 1
fi

if [[ ! -f .clasp.json ]]; then
  cp .clasp.json.example .clasp.json
  echo "Created .clasp.json from template. Set scriptId before pushing."
fi

"$NPM_BIN" install
"$NPM_BIN" run build:apps-script

echo "Initialization complete."
echo "Next steps:"
echo "  1) Edit .clasp.json and set your scriptId"
echo "  2) Run: $(dirname "$NODE_BIN")/npx clasp login"
echo "  3) Run: $(dirname "$NODE_BIN")/npx clasp push --force"
