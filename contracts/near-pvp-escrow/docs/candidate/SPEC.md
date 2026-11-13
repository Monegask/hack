# Supply Line escrow v2 — audit candidate, 13 November 2026

Status: source candidate, not audited or deployed. The user requested native Circle USDC, two equal stakes of at least 1 USDC, 3% of the combined pot, safe refunds, restricted server authority and backend compatibility. No Mainnet deployment or real-money test is authorized by this work.

## Source provenance and boundary

Rust was found at the local project's `contracts/near-pvp-escrow/contract/src`, not recovered from WASM. All 53 original files matched the 5 November import registry: see `source-provenance.json`. The public base `0e13688f559b0807b334c7e963b938d0107d0959` contained only the escrow WASM, SHA-256 `8d581487374ce5f59935deb3710c952cfdda07ef9f9c9a8cd366716fb8f74d77`. Import hashes prove identity with that preserved project; they are not by themselves proof of the live deployment's build provenance.

This PR preserves that tracked Testnet WASM and all runtime/backend files. Version 2 changes Borsh layout. It is a **new-account candidate**, not an in-place update of the Testnet account. Historical documents/reports shipped with the import describe version 1 and are not fresh verification. This directory and the root API.md take precedence for v2.

## Asset, arithmetic and configuration

Production initialization accepts only `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`. Token is immutable. Production starts paused and requires self initialization. The `sandbox` feature permits a mock FT and starts unpaused, and is never appropriate for Mainnet.

Amounts are integer micro-USDC, six decimals. Minimum stake is 1,000,000; maximum is `u128::MAX / 2`. Both participants pay precisely the stored stake. Fee defaults to 300 basis points. `fee = floor(2 * stake * fee_bps / 10000)` with overflow-safe decomposition; winner receives the exact remainder. For 10+10 USDC: winner 19.4, platform 0.6. Refunds return every accepted micro-unit to the original depositor and charge no fee. NEAR gas and storage are separate and are not reimbursed by USDC refunds.

**Proposed hardening parameters, implemented for audit, not user-approved tariff changes:** cap future fees at 500 bps, 48-hour delay, absolute game deadline of six hours. Review these before acceptance. `set_fee` schedules; permissionless `apply_fee` applies only at/after activation; rescheduling resets the delay; admin can cancel. Every lobby snapshots fee and receiver at creation, so configuration/admin changes cannot change an existing offer. The admin account is the platform fee receiver for future lobbies. No token/beneficiary redirection or generic withdrawal method exists.

## Lifecycle and invariants

`LobbyOpen -> AwaitingDeposits -> ReadyToStart -> InProgress -> SettlementPending -> Completed`.
Prestart or InProgress may instead become `Cancelled` with indexed refund obligations. A cancelled record may still owe refunds: consult each payout, not just the match state.

- Only the configured, unfrozen server creates/binds lobbies; participants must differ and each may have one active match. Stake raises are allowed only before any accepted deposit. Each raise increments revision. Creator/opponent cannot be rebound after accepting funds.
- `ft_transfer_call` credits atomically in `ft_on_transfer`, using token predecessor and FT-provided sender, not the transaction signer. Validate match, participant, exact amount, revision, stake and fee, deadline and pause. Return zero on acceptance, the entire amount on rejection. No outgoing promise in the receiver. Duplicate, late, foreign or malformed deposits cannot enter accounting.
- Start requires two accepted deposits, three seconds since second deposit, original lobby deadline not reached and a fresh server heartbeat. The backend must inspect final on-chain state before beginning gameplay.
- Lobby lifetime is 600 seconds from creation. Joined idle lobbies expire after 90 seconds unless activity or a deposit occurred. These timers never extend the original deadline.
- InProgress requires per-match heartbeat under 1800 seconds. Heartbeats do not revive a stale match. Version 2 also fixes `game_deadline_ns = start + 6h`; continued heartbeats cannot extend it. Exact deadline is refund-only.
- A valid server result names one of the two participants. Player forfeit names the other participant. Mutual cancellation requires the opponent and current nonce. Full refunds are available for prestart player cancel, expired lobby, mutually confirmed cancel, admin cancel, stale match, absolute deadline, or frozen server.
- Emergency `freeze_server` atomically pauses admissions and revokes **all seven** runtime methods including result and heartbeat. Existing InProgress players can immediately request full refunds without waiting for the admin. Prestart players retain normal cancel. An old result already finalized before freeze cannot be reversed. Replacement server requires complete drain while paused. `unpause` cannot bypass freeze.
- Ordinary pause blocks new lobbies, binding, raises, deposits and start. It permits existing valid results, heartbeats, claims and refunds. Use freeze, not ordinary pause, for runtime-key compromise.
- Per accepted balance: `accepted = locked + owed + paid`. `owed` includes InFlight amounts. Settlement/refund allocates a pot once, releases participants, and cannot be changed afterward. IDs and payout attempt counters are monotonic and never reused, even after pruning.
- Payouts: `Ready -> InFlight -> Paid` on success, `InFlight -> Ready` only on a confirmed failed FT receipt. State and attempt are persisted before scheduling transfer. Only the fixed beneficiary can retry Ready with 1 yoctoNEAR. Claims for InFlight/Paid are no-ops. Private callbacks require self predecessor, exactly one promise result, and matching index/attempt; stale/duplicate callbacks do nothing. Oversized successful return data remains success.
- Insufficient execution gas or operational NEAR leaves payouts Ready. Insufficient FT balance, unregistered recipient or token transfer restrictions produce failed FT receipts and retryable obligations, not a false payment confirmation. Native `fund` restores operating balance without creating USDC credit. `prune_match` rejects unpaid obligations. Upgrade requires pause and zero live matches/locked/owed/in-flight; only same-v2-layout migration is implemented.

## Asynchrony and unavoidable limits

An RPC timeout is not a chain failure and never authorizes a new deposit or payout. Reconcile the original transaction hash and final receipt tree, then views/accounting. The existing backend durable outbox persists signed bytes/hash before sending and resubmits those bytes; this PR does not alter it. A successful result transaction can coexist with failed child FT transfers; show payout states separately.

A callback itself can fail after a successful FT transfer (for example, out of gas). In that case InFlight stays locked for reconciliation; there is deliberately no timer/admin reset that could pay twice. The contract cannot authenticate historical receipt proofs with its current API. External reconciliation alone cannot safely change contract storage. A proof-based repair or reviewed drained/new-contract incident migration remains an audit design question. Do not claim eventual automatic recovery from every possible callback failure.

Circle can pause/blocklist token operations. Its published source checks those restrictions in **ft_resolve_transfer as well as ft_transfer**. A rejected transfer_call whose resolver fails after the FT transfer may leave unaccounted tokens at the escrow. There is no safe generic admin sweep in this candidate; unexplained excess is quarantined and must not be attributed using an aggregate balance alone. Full-refund obligations are preserved for accepted deposits, but delivery cannot be guaranteed while the issuer prohibits transfers or the chain is unavailable. See RISKS.md. This is a real external limitation, not solved by mock tests.

## Official sources reviewed

- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses): native Mainnet account above; distinct Circle Testnet account.
- [NEP-141](https://github.com/near/NEPs/blob/master/neps/nep-0141.md): transfer/receiver/resolver and unused amount semantics.
- [Circle NEAR source, pinned 80e2760](https://github.com/circlefin/stablecoin-near/blob/80e2760c0d00c3853bcb8b33f914720f54351bf7/src/fiat_token.rs): pause, blocklist, storage and resolver checks. This is published issuer source, not a proven match to the current Mainnet code hash.
