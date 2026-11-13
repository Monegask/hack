#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --workspace --locked --release --target wasm32-unknown-unknown
mkdir -p artifacts
cp target/wasm32-unknown-unknown/release/near_pvp_escrow.wasm artifacts/
cp target/wasm32-unknown-unknown/release/test_usdc.wasm artifacts/
python3 - <<'PY'
import hashlib,json,pathlib
p=pathlib.Path('artifacts')
manifest={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in p.glob('*.wasm')}
(p/'SHA256SUMS.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
PY
