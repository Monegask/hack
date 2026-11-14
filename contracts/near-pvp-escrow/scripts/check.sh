#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo fmt --all --check
cargo fmt --manifest-path tests/sandbox/Cargo.toml --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test -p near-pvp-escrow --lib --locked
bash scripts/build.sh
cargo clippy --manifest-path tests/sandbox/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path tests/sandbox/Cargo.toml --locked -- --test-threads=1
npm ci --ignore-scripts
npm run check
npm test
