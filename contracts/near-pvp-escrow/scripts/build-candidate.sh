#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p artifacts/candidate
# Canonical dependency paths: panic locations must not depend on the build host.
export RUSTFLAGS="--remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo"
printf '%s\n' "$RUSTFLAGS" > artifacts/candidate/rustflags.txt
# Production: no mock-token bypass. Two fresh target directories prove equality.
for build in a b; do
  CARGO_TARGET_DIR="target/repro-$build" cargo build -p near-pvp-escrow --locked --release --target wasm32-unknown-unknown --no-default-features
done
cmp target/repro-a/wasm32-unknown-unknown/release/near_pvp_escrow.wasm target/repro-b/wasm32-unknown-unknown/release/near_pvp_escrow.wasm
cp target/repro-a/wasm32-unknown-unknown/release/near_pvp_escrow.wasm artifacts/candidate/mainnet-escrow.wasm
cargo build --workspace --locked --release --target wasm32-unknown-unknown --features near-pvp-escrow/sandbox
cp target/wasm32-unknown-unknown/release/near_pvp_escrow.wasm artifacts/candidate/SANDBOX-ONLY-escrow.wasm
cp target/wasm32-unknown-unknown/release/test_usdc.wasm artifacts/candidate/SANDBOX-ONLY-token.wasm
sha256sum artifacts/candidate/*.wasm | tee artifacts/candidate/SHA256SUMS
rustc -Vv > artifacts/candidate/toolchain.txt
cargo tree --locked > artifacts/candidate/dependencies.txt
