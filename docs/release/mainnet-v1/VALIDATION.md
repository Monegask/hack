# Integrated validation

13–14 November 2026. Local host: Windows, Node 26.13.0. All credentials ephemeral or mocked. No real USDC, production updates, user-save resets, or public financial endpoints.

## Completed on the integrated tree

- 169/169 game regression tests after a full local rebuild: solo economics, tutorial, bot and 3D presentation.
- Combined backend suite: 70/70 on source through `124f61c`, including eleven release integration tests and v2 adapter/recovery tests. Tests cover two distinct NEP-413 wallets over real local HTTP, discovery with fractional monotonic clock, bounded catalogue reads, Mainnet public-route gates, cross-network sessions and expired-unpaid capacity.
- Actual local Edge: public/private creation, discovery without link, sorting, joining, occupied removal, private invite, mobile overflow; isolated contexts with fixture chain.
- Actual local Edge financial UI: ambiguous broadcast, reload, second tab, reconnect, final state observation, wallet/deployment change, Mainnet read-only UI. Fixture transactions are not on-chain transfers. Server-journal recovery after browser-storage loss and manual binding of the original transaction hash also pass.
- Actual local Edge rebuilt offline portal: real tutorial and bot launch in fresh profiles, no page errors.
- Actual local Edge game QA: two mirrored roles, server commands, reload, tamper recovery, mobile lobby, no page errors. Sessions are isolated from user browser data.
- Actual truck UI for both sides: select truck 2 only, recall, return and assign a different mission; [evidence](controls-browser.json).
- 1,920 route comparisons over 20 seeds, both sides and three road sets match the original engine exactly; [evidence](routes.json).
- 50 completed engine replay matches: 940.3 simulated seconds, 91 commands each, identical state hash and winner to base `0e13688`; 50 unique mock settlements, no duplicates. [Evidence](determinism.json).
- 50 concurrent admission scenarios: 400 HTTP requests, 50 idempotent duplicate creates, 50 expected losing-seat rejections, 200 deposit templates and zero unexpected errors. Templates are not transfers. [Evidence](admission.json).
- Fresh 60s/50-match smoke: API p95 26.9ms, command p95 35.1ms, zero errors, 100 successful reconnects, acknowledged sequences match server records. New 300s integrated run: 50 matches/100 clients, API p95 31.1ms, command p95 41.1ms, 144,726 HTTP requests, zero errors, 14,500 unique commands plus 14,500 identical retries, all 100 reconnects; maximum backlog below 100ms. [Evidence](load-50.json). This records pre-adapter code hashes and is not attributed to the final adapter.
- New v2 integrated 300s run: 50 matches/100 clients, API p95 28.5ms, command p95 37.3ms, zero errors, 14,794 unique commands and 100 reconnects. [Evidence](load-50-v2.json). Its recorded hashes precede the final RPC/replay corrections.
- Exact final server run: 50 matches/100 clients for 60s, 29,477 requests, API p95 28.8ms, command p95 35.4ms, zero errors, 3,000 unique commands plus 3,000 identical retries, all 100 reconnects. [Evidence](load-50-final.json). Every recorded server/engine hash was compared with the current integrated source after `124f61c` and matched.

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
- The release-specific strengthened run on `124f61c` replaces the normal forced-result test with 91 legal commands through the authoritative engine, a full 940.3s simulated game and computed delivery winner before Rust settlement. Its local engine rehearsal matches state hash `56171d893e7ed6758a6e6dea743b15f44d994f6ff443b3e904bf47a153b80759`. Actual receipt-run status is recorded after CI completes; it is not yet counted as passed here.
- A further harness scenario tests exact in-progress state across SQLite restart, both reconnecting, and a server disconnect win after grace followed by real Rust payouts. It uses an accelerated isolated server test clock; public runtime clocks are unchanged.
