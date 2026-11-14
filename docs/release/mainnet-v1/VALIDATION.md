# Integrated validation

13–14 November 2026. Local host: Windows, Node 26.13.0. All credentials ephemeral or mocked. No real USDC, production updates, user-save resets, or public financial endpoints.

## Completed on the integrated tree

- 169/169 game regression tests after a full local rebuild: solo economics, tutorial, bot and 3D presentation.
- Combined backend suite: 79/79 after R08/K1 fixes, including release integration and v2 scheduling tests and v2 adapter/recovery tests. Tests cover two distinct NEP-413 wallets over real local HTTP, discovery with fractional monotonic clock, bounded catalogue reads, Mainnet public-route gates, cross-network sessions and expired-unpaid capacity.
- Actual local Edge: public/private creation, discovery without link, sorting, joining, occupied removal, private invite, mobile overflow; isolated contexts with fixture chain.
- Actual local Edge financial UI: ambiguous broadcast, reload, second tab, reconnect, final state observation, wallet/deployment change, Mainnet read-only UI. Fixture transactions are not on-chain transfers. Server-journal recovery after browser-storage loss and manual binding of the original transaction hash also pass.
- Actual local Edge rebuilt offline portal: real tutorial and bot launch in fresh profiles, no page errors.
- Actual local Edge game QA: two mirrored roles, server commands, reload, tamper recovery, mobile lobby, no page errors. Sessions are isolated from user browser data.
- Actual truck UI for both sides: select truck 2 only, recall, return and assign a different mission; [evidence](controls-browser.json).
- 1,920 route comparisons over 20 seeds, both sides and three road sets match the original engine exactly; [evidence](routes.json).
- 50 completed engine replay matches: 940.3 simulated seconds, 91 commands each, identical state hash and winner to base `0e13688`; 50 unique mock settlements, no duplicates. [Evidence](determinism.json).
- 50 concurrent admission scenarios: 400 HTTP requests, 50 idempotent duplicate creates, 50 expected losing-seat rejections, 200 deposit templates and zero unexpected errors. Templates are not transfers. [Evidence](admission.json).
- Fresh 60s/50-match smoke: API p95 26.9ms, command p95 35.1ms, zero errors, 100 successful reconnects, acknowledged sequences match server records. New 300s integrated run: 50 matches/100 clients, API p95 31.1ms, command p95 41.1ms, 144,726 HTTP requests, zero errors, 14,500 unique commands plus 14,500 identical retries, all 100 reconnects; maximum backlog below 100ms. [Evidence](load-50.json). This records pre-adapter code hashes and is not attributed to the final adapter.
- Historical 300s run from a tree containing v2 source (legacy Testnet fixture branch, not v2 scheduling): 50 matches/100 clients, API p95 28.5ms, command p95 37.3ms, zero errors, 14,794 unique commands and 100 reconnects. [Evidence](load-50-v2.json). Its recorded hashes precede the final RPC/replay corrections.
- Historical exact-source pre-R08 runs are retained as [1bf3fd7](load-50-1bf3fd7.json) and [80d09e0](load-50-80d09e0.json), both using the legacy Testnet fixture branch.
- Final explicit **v2** run on current runtime: 50 matches/100 clients for 300s, 145,974 requests, API p95 32.8ms, command p95 42.4ms, zero errors, 14,600 unique commands plus 14,600 identical retries, 100 reconnects. `v2BranchExercised=true`, 149 v2 scheduler cycles. [Evidence](load-50-v2-priority.json).
- Independent final **v1/Testnet** run on the same runtime: 50 matches/100 clients for 60s, 29,398 requests, API p95 33.9ms, command p95 45.2ms, zero errors, 3,000 unique commands plus 3,000 retries, 100 reconnects. [Evidence](load-50-final.json).
- All recorded server/engine and load-fixture fingerprints in the final v1/v2 reports were checked against runtime `616e870` (and unchanged by subsequent documentation merges) and match. Both modes use mock RPC/FT; only the explicit v2 result establishes v2 scheduler execution.


The full build includes `game-3d/build.mjs`, `build-offline.cjs`, bot, share portal and PvP bundle. Some initial restricted Windows runs failed due to build-tool access; the necessary rebuild/regression runs were repeated successfully with local access. Tests were never run by deleting a user save.

## Not established by these tests

Mainnet readiness, actual user-wallet payment flow, native Circle transfers, live RPC/signer throughput, production Linux capacity, late-game soak, independent security approval or legal eligibility. Fresh contract-only CI on the integration branch has passed independently (below). A separate actual backend/Rust receipt workflow is required for the combined financial flow; upstream evidence is kept distinct from release evidence.

Reproduction from repository root:

```text
npm ci --prefix prototypes/logistics-race/threejs-trial
npm ci --prefix prototypes/logistics-race/pvp
npm run build
npm run build --prefix prototypes/logistics-race/pvp
npm test
npm test --prefix prototypes/logistics-race/pvp
node prototypes/logistics-race/pvp/load/export-baseline.mjs
node prototypes/logistics-race/pvp/load/determinism.mjs 50
node prototypes/logistics-race/pvp/load/admission.mjs
node prototypes/logistics-race/pvp/load/run.mjs --matches=50 --seconds=300 --reconnect=true --out=docs/release/mainnet-v1/load-50.json
```

Browser scripts are under `prototypes/logistics-race/pvp/tests/` and use Edge isolated profiles. Live/production smoke scripts were not invoked.

## CI on earlier immutable integration slices

- `4149986`: [contract CI](https://github.com/Monegask/hack/actions/runs/43492940143) passed 38 Rust tests, 9 actual Sandbox receipt scenarios, 3 client tests, lint/format and two identical production builds. WASM SHA-256 `a6ebecd0b7f78dad11167b63cffd2fe9c646f307f73ac95dbc62c683ca0d9e91`. This is a fresh integration PR run; later backend changes require their own checks.
- `724b13f`: [Linux Node 24 integration CI](https://github.com/Monegask/hack/actions/runs/43493989503) passed full builds, game/backend regressions and exact 50-match replay.
- Follow-up source through PR #3 `e8cac6b` is now merged; its backend/Rust Sandbox workflow builds the contract from this same integrated checkout, rather than a separate PR checkout. Success is not claimed until the workflow finishes.

## Backend/Rust Sandbox evidence

- Upstream PR #3 `04c9be1`: [actual Sandbox](https://github.com/Monegask/hack/actions/runs/43575384930) passed restricted-key denials, lost broadcast response and SQLite restart, real self-registration, exact deposits and duplicate resolver refunds, 3s start, 9.7 prize/0.3 fee, partial fee failure/retry without repeating winner payout, one-sided refunds, callback spoof rejection, mutual cancellation/nonces and frozen-server immediate refunds. These are genuine local Rust receipts using a mock FT, not real USDC.
- The release-specific strengthened run on `124f61c` replaces the normal forced-result test with 91 legal commands through the authoritative engine, a full 940.3s simulated game and computed delivery winner before Rust settlement. Its local engine rehearsal matches state hash `56171d893e7ed6758a6e6dea743b15f44d994f6ff443b3e904bf47a153b80759`. [That integrated receipt run passed](https://github.com/Monegask/hack/actions/runs/43575626974); [machine-readable evidence](sandbox-124f61c.json).
- A further harness scenario tests exact in-progress state across SQLite restart, both reconnecting, and a server disconnect win after grace followed by real Rust payouts. It uses an accelerated isolated server test clock; public runtime clocks are unchanged.

## R08/K1 correction and new execution boundary

Audit identified that full history reconciliation before v2 heartbeat could force connected matches into refund. The candidate now gives bounded fresh live checks and heartbeat priority, limits history work to four per cycle with round-robin progress, and prioritizes unsigned heartbeat requests in the v2 dispatcher. Already signed nonces are reconciled first using original bytes; an unknown predecessor fences new signatures. The pending-outbox lookup uses a partial SQLite index. Freeze/deadline are rechecked after live reads; the frozen control also pauses simulation.

Positive tests cover 360 historical reads with bounded 20s responses over 30 simulated minutes; 50 live IDs with a slow read; freeze-after-read/deadline; single nonce ownership; unknown signed predecessor; and queued revocation. K1 closes a separator-boundary bug where a child directory beginning with `..` could pass the external-signer check; its empty-credential test proves rejection before reading a secret.

A new 50-match v2-specific load uses validated v2 view fixtures and requires `v2BranchExercised=true` plus a positive v2 scheduler cycle count. Previous load reports do not satisfy that condition and remain historical evidence only. Results and the independent targeted retest are recorded after completion. Neither fixture mode measures real RPC or signer throughput.

## Latest fully verified runtime slice: 616e870

- [Linux/Node 24 full builds, 169 game regressions, 79 backend tests and 50-match original-engine replay](https://github.com/Monegask/hack/actions/runs/43577158967): **PASS**.
- [Contract format/lint, 38 Rust tests, two identical production builds, 9 Sandbox receipt scenarios and 3 client tests](https://github.com/Monegask/hack/actions/runs/43577158957): **PASS**.
- [Actual integrated backend/engine/Rust financial cycle](https://github.com/Monegask/hack/actions/runs/43577158948): **PASS**, including full delivery win, exact state restart and reconnect, disconnect winner and real mock-FT payout, all prior cancellation/recovery/freeze scenarios. [Report](sandbox-616e870.json): accepted=paid=55000000, locked=owed=in_flight=0, escrow FT balance=0.
- Independent AI reviewer retested 79 backend tests, five additional scheduling/key-boundary checks and twelve prior positive cases; closed concrete R08 starvation and K1 path bypass on this exact SHA. [Retest](security-baseline/RELEASE-616e870-RETEST.md). It is not professional audit or Mainnet authorization.

The final augmented harness also verifies real public discovery and public Join without an invitation before the engine/financial lifecycle. Its own final CI link is recorded after completion; the already-passed runtime evidence above is not re-attributed to a different tree.
