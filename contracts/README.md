# Smart contracts: deployed v1 and future v2

[Back to Supply Line](../README.md) · [Demo & verification](../HACKATHON_DEMO.md)

## Public Testnet v1

Escrow: [`dev-20261105124711-29870979355191.testnet`](https://testnet.nearblocks.io/address/dev-20261105124711-29870979355191.testnet). Token: [`dev-20261105124714-71962479239708.testnet`](https://testnet.nearblocks.io/address/dev-20261105124714-71962479239708.testnet), a project-owned six-decimal mock named Test USDC. It is not Circle USDC.

Read-only RPC on 14 November 2026 confirms `state_version: 1`, `paused: false`, fee 300 bps and deployed code hash `AWkPGc7xMZtCm8ShbpWXFQWctsf2w1tYnvaBQCeCzYzz`. [Snapshot](../docs/verification/testnet-match-2.json).

| Evidence / interface | Immutable public source |
| --- | --- |
| Historical deployed WASM used by server preflight | [v1 WASM](https://github.com/Monegask/hack/blob/f221951cf0bb280f2faae8c5f11b2a3795d75232/contracts/near-pvp-escrow/artifacts/near_pvp_escrow.wasm) |
| Actual v1 client calls and transaction builders | [chain.mjs](https://github.com/Monegask/hack/blob/f221951cf0bb280f2faae8c5f11b2a3795d75232/prototypes/logistics-race/pvp/server/chain.mjs) |
| Preserved source inventory and hashes | [source-provenance.json](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/docs/candidate/source-provenance.json) |
| Recover preserved v1 source from documented v1→v2 delta | [verify-origin.sh](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/scripts/verify-origin.sh) and [reverse patch](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/docs/candidate/import-to-candidate.patch) |
| Historical-build mismatch and candidate validation | [VERIFICATION.md](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/docs/candidate/VERIFICATION.md) |

**Source provenance boundary:** preserved production-source hashes verify, and the tracked v1 WASM matches the deployed code hash. Rebuilding preserved v1 Rust did not reproduce that WASM, even after normalizing Cargo paths. The cause is unresolved. Do not call v2 the verified source of deployed v1, or claim a reproducible v1 deployment. The reverse patch recovers preserved source; it does not decompile WASM.

## Future Mainnet escrow v2 — source candidate only

All links below pin PR #1 source at `6b6cd1c`; they do not import it into the public game's runtime.

| What to inspect | Link |
| --- | --- |
| Rust entry point | [contract/src/lib.rs](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/contract/src/lib.rs) |
| Deposits, lifecycle, callbacks and models | [contract/src/](https://github.com/Monegask/hack/tree/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/contract/src) |
| Rust unit tests | [tests.rs](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/contract/src/tests.rs) |
| Real local NEAR Sandbox receipt tests | [receipts.rs](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/tests/sandbox/tests/receipts.rs) |
| ABI: arguments, permissions and state | [API.md](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/API.md) |
| TypeScript call examples and tests | [examples/](https://github.com/Monegask/hack/tree/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/examples) |
| Toolchain, lockfiles and build procedure | [package root](https://github.com/Monegask/hack/tree/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow) and [TESTING.md](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/TESTING.md) |
| Storage/API migration | [MIGRATION.md](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/docs/candidate/MIGRATION.md) |
| Security and financial limits | [RISKS.md](https://github.com/Monegask/hack/blob/6b6cd1c2f71dead588bbd41e400da9403bc599f8/contracts/near-pvp-escrow/docs/candidate/RISKS.md) |

The production candidate pins native Circle USDC and starts paused. Mock-token support belongs to a distinct Sandbox build. Equal stakes, fixed beneficiaries, asynchronous payouts/refunds and restricted server methods are complemented by proposed fee-change delay/cap, server revocation and an absolute game deadline. These policies and v2 storage semantics require review; this is not an in-place upgrade approval.

**Not deployed on Mainnet. No Mainnet escrow address is published.** Deployment is deferred pending independent professional audit, unresolved recovery/governance work, operational acceptance and a separately authorized launch. Circle USDC is only part of the prepared architecture; the public game accepts its configured Testnet mock FT only.

## Integrated candidate and tests

PR #5 combines contract, wallet adapter, matchmaking and performance work separately. Inspect [the pinned integrated source](https://github.com/Monegask/hack/tree/0803b553ca29300815d87abc95e4d48ab94e8ebe), [readiness](https://github.com/Monegask/hack/blob/0803b553ca29300815d87abc95e4d48ab94e8ebe/docs/release/mainnet-v1/READINESS.md) and [blockers](https://github.com/Monegask/hack/blob/0803b553ca29300815d87abc95e4d48ab94e8ebe/docs/release/mainnet-v1/BLOCKERS.md). Do not merge that whole branch merely to expose documentation.

The passing [contract CI](https://github.com/Monegask/hack/actions/runs/43578830808) covers 38 Rust tests, 9 Sandbox scenarios, client checks and two identical v2 production builds. [Integrated Sandbox CI](https://github.com/Monegask/hack/actions/runs/43578830813) exercises the backend, game engine and actual local Rust receipts with a mock FT. Neither is a Circle/Mainnet end-to-end test or professional audit.

## Inspect public state without a wallet

From the default-branch clone with Node.js 24:

```sh
node scripts/verify-testnet.mjs 2
```

This issues only public read-only RPC queries. Change `2` to the numeric **escrow match ID** shown in the game. Read `winner`, `deposited`, `payouts` and `get_accounting`; do not infer a transfer from a game win or transaction root status alone. Compare the complete explorer receipt tree and FT events, including both prize and fee.
