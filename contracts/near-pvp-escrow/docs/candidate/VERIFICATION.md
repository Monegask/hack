# Verification record

## Completed first run

[GitHub Actions run 43431414548](https://github.com/Monegask/hack/actions/runs/43431414548) passed on commit `2cee8bcb255a6b18fe612da3e6f51f4198a29212`: pinned Rust 1.99.1, Clippy with warnings denied, 38 unit tests, 7 real NEAR Sandbox scenarios, two byte-identical production WASM builds, TypeScript check and 3 client tests. The initial workflow formatted sources during the run; the subsequent candidate commits format sources locally and enforce format checks.

Later changes add self-only production initialization and further issuer-failure Sandbox coverage. Their final CI evidence will be recorded here; the first run alone does not validate those changes.

## Scope

Sandbox uses throwaway generated accounts and the local mock token, not real USDC. Tests execute WASM receipts, transfers, resolver and callbacks. Timer integration tests patch only a fixture timestamp with `sandbox_patch_state`, then run actual contract receipts; unit tests cover exact nanosecond boundaries. Sandbox block advancement is not assumed to equal wall-clock seconds.

The historical Testnet WASM remains unchanged. `verify-origin.sh` reverses the documented source delta inside an isolated target directory, verifies preserved production-source import hashes, builds v1 and records whether bytes equal the tracked Testnet WASM. This compares source/binary locally; it does not independently authenticate current deployed account code.

Production artifacts and mock-token-enabled artifacts are distinct. `scripts/build-candidate.sh` compares independent target directories and records SHA256SUMS, rustc version and dependency tree. The production artifact has no Sandbox feature and accepts only Circle's pinned Mainnet token address; its initialization behavior is tested in Sandbox without touching that token account.

Required before deployment: independent audit, policy decisions described in SPEC.md, current issuer code/metadata/registration verification, account-key governance review and separately authorized integration. There are no Mainnet deployment or real-money tests in this task.
