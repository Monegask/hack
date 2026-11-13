#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 4 ]]; then
  echo 'Usage: scripts/deploy-testnet.sh /absolute/escrow-key.json admin.testnet server.testnet token_id' >&2
  exit 2
fi
bash scripts/build.sh
cargo run --manifest-path tests/sandbox/Cargo.toml --locked --bin testnet -- deploy "$@"
