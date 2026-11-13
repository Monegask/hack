# Verification record

## Completed first run

[GitHub Actions run 43431414548](https://github.com/Monegask/hack/actions/runs/43431414548) passed on commit `2cee8bcb255a6b18fe612da3e6f51f4198a29212`: pinned Rust 1.99.1, Clippy with warnings denied, 38 unit tests, 7 real NEAR Sandbox scenarios, two byte-identical production WASM builds, TypeScript check and 3 client tests. The initial workflow formatted sources during the run; the subsequent candidate commits format sources locally and enforce format checks.

[Extended run 43432969319](https://github.com/Monegask/hack/actions/runs/43432969319) passed on `fa99661f9c6bc0359f65052ca5ffb533fd07bb21`: format checks, Clippy, 38 unit tests, 9 Sandbox scenarios, two identical production builds, TypeScript and 3 client tests. This includes self-only production initialization and issuer-failure coverage. Its unnormalized production SHA-256 was `ea4ac663d1941e1bc5dc1edf8bbf821ba3a9920b1c34a68a70c2eab15fb1b2fc`. Final canonical-path artifact evidence is recorded below after the build-normalization run.

## Scope

Sandbox uses throwaway generated accounts and the local mock token, not real USDC. Tests execute WASM receipts, transfers, resolver and callbacks. Timer integration tests patch only a fixture timestamp with `sandbox_patch_state`, then run actual contract receipts; unit tests cover exact nanosecond boundaries. Sandbox block advancement is not assumed to equal wall-clock seconds.

The historical Testnet WASM remains unchanged. `verify-origin.sh` reverses the documented source delta inside an isolated target directory, verifies preserved production-source import hashes, builds v1 and records whether bytes equal the tracked Testnet WASM. The fresh Testnet read-only account observation in testnet-code-read-only.json confirms that the tracked WASM hash equals deployed code hash `AWkPGc7xMZtCm8ShbpWXFQWctsf2w1tYnvaBQCeCzYzz` at height 277515871. The initial unnormalized Linux v1 build did not byte-match the Mac binary (embedded Cargo paths differ); that mismatch is not treated as restored-source proof. The canonical origin check separately remaps dependency paths to the historical Mac prefix and reports the actual result.

Production artifacts and mock-token-enabled artifacts are distinct. `scripts/build-candidate.sh` compares independent target directories and records SHA256SUMS, rustc version and dependency tree. The production artifact has no Sandbox feature and accepts only Circle's pinned Mainnet token address; its initialization behavior is tested in Sandbox without touching that token account.

Required before deployment: independent audit, policy decisions described in SPEC.md, current issuer code/metadata/registration verification, account-key governance review and separately authorized integration. There are no Mainnet deployment or real-money tests in this task.

## Test coverage map

| Requirement | Executed check |
|---|---|
| Winner and 3% combined-pot fee | Unit normal_match; Sandbox actual_nep141_resolver_transfers_private_callback_and_drained_upgrade |
| Zero/one/two-deposit cancellation; no repeated refund | Unit cancel_zero_one_or_two_deposits; Sandbox cancelled_zero_one_two_deposits_refund_exactly_once |
| Mutual cancel nonce and forfeit | Unit mutual_cancel_nonce_and_forfeit |
| Lobby 600s / idle 90s / countdown 3s boundaries | Unit exact deadlines and nanosecond boundary; Sandbox lobby timeout and actual start receipts |
| Per-match heartbeat expiry / no revival / absolute game deadline | Unit exact 1800s and continuous-heartbeat adversary; Sandbox emergency_refund and deadlines_pause |
| Duplicate deposits, results, claims and callback replay | Unit replay/concurrent claims; Sandbox duplicate deposit/result/refund and private callback checks |
| Insufficient wallet token balance / wrong token / first-deposit stake freeze | Sandbox insufficient_balance_wrong_token_and_frozen_stake |
| Insufficient escrow FT / issuer pause | Sandbox issuer_pause_and_insufficient_escrow_ft_restore_ready_obligations (test-only fault injection) |
| Blocklisted refund recipient | Sandbox blocklisted_refund_is_retryable_without_platform_fee |
| Winner/fee recipient registration failure / independent retry | Sandbox failed_ft_fee_transfer and unregistered_winner_retry; unit refund_failure |
| Bad callback context / missing callback / oversized success | Sandbox self callback without promise result and external callback attack; unit missing_callback and oversized_successful_ft_return |
| Operational NEAR and low gas | Unit low_near_blocks_storage_and_defers_payouts; low_gas_defers_transfers |
| Admin/server abuse, freeze and restricted beneficiaries | Unit role/claim/admin cancellation tests; Sandbox admin result attack and freeze result/heartbeat rejection |
| Safe fee configuration, rounding and overflow | Unit fee timelock/cap/snapshot, fee extrema and integer_limits |
| Pause, upgrade/drain/prune | Unit pause/upgrade/prune; Sandbox real same-v2-layout WASM upgrade |
| Production token identity and paused initialization | Sandbox production_initializer_pins_circle_and_starts_paused deploys production WASM locally |
| RPC ambiguity, process restart and identical signed rebroadcast | 10 existing backend tests locally; details and source hashes in backend-recovery-verification.json |

The backend tests initially could not resolve near-api-js in the new worktree. After installing the existing lockfile dependencies locally, all 10 passed. A simulated send_tx HTTP 503 log is intentional fault injection. No signer file was read.

## Final canonical-path validation

[Run 43434529302](https://github.com/Monegask/hack/actions/runs/43434529302), commit `0c1eae32ce996af2420bf8f56c195df0ce9a2f5f`: **passed**. Format, Clippy (`-D warnings`), 38 unit tests, 9 real Sandbox scenarios, TypeScript and 3 client tests all passed. Production was built in two target directories and bytes compared equal. Separate local backend RPC/recovery checks passed 10/10 with mock transport.

Production SHA-256: `a6ebecd0b7f78dad11167b63cffd2fe9c646f307f73ac95dbc62c683ca0d9e91`.
[Build artifact](https://github.com/Monegask/hack/actions/runs/43434529302/artifacts/14043102017) includes production, Sandbox-only escrow/token, rebuilt historical source comparison, toolchain, dependencies, compiler flags and SHA256SUMS. ZIP digest: `c6b5fcad4d6aee98fad9866039e010b03e023570188ce733e9bea2d1f2a722d0`. Downloaded ZIP and production WASM were independently SHA-256 checked locally.

**Unresolved historical-build gap:** preserved v1 production sources pass import-hash checks, and the tracked historical WASM matches the live Testnet code hash. However, the rebuilt v1 WASM is `62795eacd3a59fd2981c0a7c10262e46da2d47a5a436cd0016394adc8e9ca33f`, not historical `8d581487374ce5f59935deb3710c952cfdda07ef9f9c9a8cd366716fb8f74d77`. Remapping dependency paths to the Mac prefix did not close the difference. Build-context and/or dependency-feature differences remain to be investigated; their cause is not proven. `origin-build.json` records equal=false. The origin comparison is informational, explicitly separate from the passing candidate tests; CI success does not mean v1 byte equivalence. No Rust was reconstructed from WASM. Treat v2 as independently testable source derived from the preserved project, not as cryptographically proven deployed v1 source.

Static WASM export comparison (`wasm-exports.json`) confirms no historical exported function was removed; v2 adds apply_fee, cancel_fee_change and freeze_server. This is limited ABI evidence; the migration document specifies semantic/layout differences.

Later documentation-only commits preserve the tested Rust/build/test files. CI path filters exclude documentation-only updates; the validation/artifact commit above is the precise reproducible reference. No Mainnet deployment, no live financial transaction and no key-file read occurred.
