# Separate VPS deployment checklist

This is a preparation checklist, not authorization to deploy. Keep the running Railway and Vercel untouched. Mainnet payment/signing gates stay closed until security and legal release gates are satisfied.

## Candidate validation environment

- [ ] Pin immutable reviewed Git SHA, image digest, Node 24 and lockfiles. Rebuild offline/tutorial/bot/PvP assets before image packaging.
- [ ] Run the complete backend, game and exact source Rust/Sandbox suites on Linux. Keep production and Sandbox-only WASM in distinct locations and compare hashes.
- [ ] Repeat at least 50 simultaneous matches in an actual resource-limited Linux environment; measure command/API p95, simulation backlog, memory, disk, signer and provider throughput. Do not import the Windows result as a capacity promise.
- [ ] One authority process per database and signer nonce. Do not start multiple SQLite owners or independent signers sharing the same key.
- [ ] Use the existing `prototypes/logistics-race/pvp/deploy/` Testnet Docker/Caddy recipe only as a starting point; it is not a Mainnet compose configuration.

## Network and secret separation

- [ ] Separate hostnames/origins, ports or networks, database directories/volumes, cookies/deployment identity, backups, server accounts and signer files for each network. Verify mismatch startup and cross-network cookie rejection.
- [ ] Explicit Mainnet native Circle USDC account, six decimals, reviewed escrow code hash/configuration, role recipients and FT storage registration. Reject mock FT/USDC.e even if symbol is USDC.
- [ ] Runtime key external to source/image, read-only secret mount, restrictive ownership, restricted receiver/seven methods, funded limited allowance. Owner/admin/player keys never enter the application server.
- [ ] Do not set a Mainnet signer or enable financial routes in this candidate. Read-only preparation must start without signing capability.

## Ingress and operational acceptance

- [ ] TLS and firewall; only ingress publicly reachable. Close direct-origin bypass. Test trusted-proxy behavior and account/session/IP quotas behind the actual proxy.
- [ ] Non-root read-only app filesystem, writable database volume only, resource/pid/disk limits, restart policy and graceful shutdown.
- [ ] Expired lobby cleanup, Sybil admission, command/history retention, session expiry and disk watermarks implemented and tested before real-money service.
- [ ] Monitor simulation backlog, command failures, RPC errors, heartbeat age, outbox pending/failure, lease loss, FT accounting and Ready/InFlight payouts. Logs contain no credentials.
- [ ] Consistent SQLite backup with WAL and financial outbox; encrypted off-host backup; restore drill in an isolated network. Reconcile final chain state before restarting authority. Never roll back obligations blindly.
- [ ] Test RPC outage, ambiguous broadcast, crash before/after signed outbox, restart during funding/countdown/game/result, partial payout and disconnect recovery.

## Financial release gates

- [ ] Independent professional audit and retest of exact source/WASM/backend composition; integrated AI review is supplementary.
- [ ] Approve trusted-result/governance/exposure limits, outage/dispute rules and callback recovery. Inventory deployment/admin/runtime public keys on final block after separately authorized deployment.
- [ ] Legal approval for each access jurisdiction, age and applicable AML/KYC/ToS; implement admission restrictions.
- [ ] Publish independently hosted participant exit instructions: cancel, mutual cancellation, emergency/frozen/deadline refund and beneficiary claim, including Ready/InFlight/Paid and gas requirements.
- [ ] Complete two-wallet financial E2E with a safe test token in Sandbox/Testnet, final receipts and accounting. No real USDC is required for this integration task.
- [ ] Obtain separate human authorization for any later deployment or real-money acceptance. Merge/release is never automatic from this checklist.
