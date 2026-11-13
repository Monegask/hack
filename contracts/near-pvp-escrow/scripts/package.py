#!/usr/bin/env python3
"""Create a portable source + prebuilt WASM package, without dependencies or credentials."""
from pathlib import Path
import re,zipfile
root=Path(__file__).resolve().parent.parent
out=root/'dist'/'near-pvp-escrow.zip'
out.parent.mkdir(exist_ok=True)
roots={'contract','tests','examples','scripts','docs','.github','artifacts'}
root_files={'README.md','ARCHITECTURE.md','API.md','INTEGRATION.md','SECURITY.md','DEPLOYMENT.md','TESTING.md','LICENSE','Cargo.toml','Cargo.lock','rust-toolchain.toml','package.json','package-lock.json','tsconfig.json','.gitignore'}
files=[]
for p in root.rglob('*'):
    r=p.relative_to(root)
    if not p.is_file() or p.is_symlink() or set(r.parts)&{'target','node_modules','.git','__pycache__'}:continue
    if r.parts[0] not in roots and str(r) not in root_files:continue
    if p.name.startswith('.env') or p.suffix in {'.pem','.key'}:continue
    data=p.read_bytes()
    if re.search(rb'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}',data):raise SystemExit(f'Refusing to package a possible private key: {r}')
    files.append((p,r))
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p,r in sorted(files):z.write(p,Path('near-pvp-escrow')/r)
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
print(f'{out}: {len(files)} files, {out.stat().st_size} bytes; CRC verified')
