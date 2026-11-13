#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p target/original-source artifacts/candidate
cp Cargo.toml Cargo.lock rust-toolchain.toml target/original-source/
cp -R contract tests target/original-source/
patch -d target/original-source -p1 -R < docs/candidate/import-to-candidate.patch
# Verify every reconstructed production source against the preserved import hash.
python3 - <<'PY'
import hashlib,json,pathlib
root=pathlib.Path('target/original-source')
registry=json.loads(pathlib.Path('docs/candidate/source-provenance.json').read_text())
for entry in registry['files']:
    name=entry['path']
    if name in ('Cargo.toml','Cargo.lock','rust-toolchain.toml','contract/Cargo.toml') or (name.startswith('contract/src/') and name != 'contract/src/tests.rs'):
        # The preserved Windows import mixes LF/CRLF; check both exact encodings.
        raw=(root/name).read_bytes().replace(b'\r\n',b'\n')
        variants=[raw,raw.replace(b'\n',b'\r\n')]
        assert any(hashlib.sha256(v).hexdigest()==entry['expected_sha256'] for v in variants), name
print('Original production-source import hashes verified')
PY
CARGO_TARGET_DIR="$PWD/target/repro-a" cargo build --manifest-path target/original-source/Cargo.toml -p near-pvp-escrow --locked --release --target wasm32-unknown-unknown
cp target/repro-a/wasm32-unknown-unknown/release/near_pvp_escrow.wasm artifacts/candidate/rebuilt-v1-Testnet.wasm
python3 - <<'PY'
import hashlib,json,pathlib
paths=['artifacts/near_pvp_escrow.wasm','artifacts/candidate/rebuilt-v1-Testnet.wasm']
hashes={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in paths}
result={'sha256':hashes,'equal':len(set(hashes.values()))==1}
pathlib.Path('artifacts/candidate/origin-build.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
# Mismatch is evidence to report, never grounds to call a WASM decompiled source.
PY
