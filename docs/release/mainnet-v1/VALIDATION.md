# Integrated validation

13 November 2026. Local host: Windows, Node 26.13.0. All credentials ephemeral or mocked. No real USDC, production updates, user-save resets, or public financial endpoints.

## Completed on the integrated tree

- 169/169 game regression tests after a full local rebuild: solo economics, tutorial, bot and 3D presentation.
- Initial combined backend suite: 47/47; additional integration tests cover two distinct NEP-413 wallets over real local HTTP, discovery with fractional monotonic clock, bounded catalogue reads, Mainnet public-route gates, cross-network sessions and expired-unpaid capacity.
- Actual local Edge: public/private creation, discovery without link, sorting, joining, occupied removal, private invite, mobile overflow; isolated contexts with fixture chain.
- Actual local Edge financial UI: ambiguous broadcast, reload, second tab, reconnect, final state observation, wallet/deployment change, Mainnet read-only UI. Fixture transactions are not on-chain transfers.
- Actual local Edge game QA: two mirrored roles, server commands, reload, tamper recovery, mobile lobby, no page errors. Sessions are isolated from user browser data.
- 50 completed engine replay matches: 940.3 simulated seconds, 91 commands each, identical state hash and winner to base `0e13688`; 50 unique mock settlements, no duplicates. [Evidence](determinism.json).
- 50 concurrent admission scenarios: 400 HTTP requests, 50 idempotent duplicate creates, 50 expected losing-seat rejections, 200 deposit templates and zero unexpected errors. Templates are not transfers. [Evidence](admission.json).
- Fresh 60s/50-match smoke: API p95 26.9ms, command p95 35.1ms, zero errors, 100 successful reconnects, acknowledged sequences match server records. A longer current run is recorded separately.

The full build includes `game-3d/build.mjs`, `build-offline.cjs`, bot, share portal and PvP bundle. Some initial restricted Windows runs failed due to build-tool access; the necessary rebuild/regression runs were repeated successfully with local access. Tests were never run by deleting a user save.

## Not established by these tests

Mainnet readiness, actual user-wallet payment flow, native Circle transfers, live RPC/signer throughput, production Linux capacity, late-game soak, independent security approval or legal eligibility. Rust/Sandbox results from PR #1 are upstream evidence until repeated on the integrated source. Follow-up v2 adapter validation is recorded when its exact commit is integrated.

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
