# Supply Line native Circle USDC escrow — audit candidate

Version 2 source candidate in `feat/mainnet-escrow`, based on `testnet-pvp-server`. **No deployment, real funds or private keys.** Existing Testnet WASM and backend are unchanged. Rust sources were found locally and all 53 original import hashes verified; see [provenance](docs/candidate/source-provenance.json).

- [Candidate specification and invariants](docs/candidate/SPEC.md)
- [Public API](API.md)
- [Strict backend/API migration boundary](docs/candidate/MIGRATION.md)
- [Risks, centralized server trust and mitigations](docs/candidate/RISKS.md)
- [Verification and reproducible builds](docs/candidate/VERIFICATION.md)

## Build and test (Linux x86_64)

Install system build dependencies (`build-essential`, `pkg-config`, `libssl-dev`, `python3`, `nodejs` 24+) and rustup. The committed `rust-toolchain.toml` pins Rust 1.99.1 and wasm32 target; both Cargo.lock files are committed. No wallet or network credentials are needed. Sandbox starts its own local chain, using generated throwaway test accounts only. Dependency downloads require network access.

```sh
cd contracts/near-pvp-escrow
rustup show
bash scripts/check.sh
```

`build-candidate.sh` builds production twice in distinct target directories and compares bytes, then builds mock-token-enabled Sandbox WASM. Outputs are under `artifacts/candidate/`:

- `mainnet-escrow.wasm`: production token pinning, starts paused; candidate only.
- `SANDBOX-ONLY-escrow.wasm` and `SANDBOX-ONLY-token.wasm`: test artifacts, never deploy to Mainnet.
- SHA256SUMS, toolchain and dependency reports.

**The tracked `artifacts/near_pvp_escrow.wasm` remains the historical Testnet binary.** Do not overwrite it or switch the running backend to a candidate artifact. Build scripts deliberately use a separate output directory. This task contains no Mainnet deployment command. Legacy Testnet deployment helpers are not a supported v2 deployment path.

## Historical import

ARCHITECTURE.md, DEPLOYMENT.md, INTEGRATION.md, SECURITY.md, TESTING.md, docs/DESIGN.md, docs/REQUIREMENTS.md and docs/reports describe the preserved v1 project and old test runs. They do not supersede the v2 candidate specification or establish fresh verification. In particular v1 immediate 0..100% fee, unrestricted token initializer and unlimited heartbeated lifetime are no longer v2 behavior.
