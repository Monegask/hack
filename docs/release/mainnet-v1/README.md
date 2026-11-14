# Supply Line integration candidate

Status: **NO-GO for real USDC / Mainnet deployment**. This branch is for technical review; its name does not authorize a release. No Railway/Vercel production changes, real deposits or credentials were used.

## Source and integration order

Base: `testnet-pvp-server`, `0e13688f559b0807b334c7e963b938d0107d0959`.
Dedicated worktree: `publishing/release-mainnet-v1`; branch: `release/mainnet-v1`.

| PR | Integrated head | Purpose |
|---|---|---|
| #1 | `6b6cd1c2f71dead588bbd41e400da9403bc599f8` | Independently built Rust escrow v2 candidate |
| #2 | `079c2cb9013da1cd08c9dde992904e778c79807a` | Public/private discovery and atomic seat reservation |
| #3 | `fa7a91e051cab067b3122990fa76b2aab4b20ec2` | Network isolation and wallet payment journal; follow-up adapter integrated separately |
| #4 | `0a9db397f2cd4ede8ba51d7296823c2eb3aef186` | Durable command batching, route cache and load tools |

Merged in this order. Semantic conflict resolutions preserve network/CSRF/session checks, public visibility and private invitations, scoped browser storage, metadata polling, grouped durable commands, monotonic simulation time, RPC read coalescing and lease checks immediately before signed broadcast. Generated files are rebuilt from source. Vercel auto-deployment is disabled for this integration branch in `vercel.json`.

Follow-up PR #3 source through `04c9be1` is integrated: versioned v2 ABI validation, final-receipt recovery, persistent server payment intents and freeze/deadline-aware worker. Upstream actual backend/Rust Sandbox scenarios have passed; strengthened release-specific full-game receipt checks are recorded separately in VALIDATION. No Mainnet readiness is inferred from source integration.

## Additional integration fixes

- Public discovery/join routes use the same hard Mainnet payment gate as private matches. Setting a payment flag does not bypass it.
- Discovery converts fractional monotonic milliseconds to integer nanoseconds safely; it coalesces reads for two seconds, with at most four concurrent RPC reads across catalogue changes; failed reads also retain a short negative cache. Join always checks live chain state and reserves the seat durably.
- Authenticated rate limits apply per account across sessions; other wallets behind the same NAT retain independent budgets. Real ingress/IP/Sybil policy remains a release gate.
- Expired **unpaid** prestart lobbies release local global capacity. Their original host remains reserved until explicit on-chain cancellation. Funded obligations are retained. This is partial A03 mitigation, not an on-chain cleanup keeper or Sybil solution.
- Recovery freezes each match at its own resume time; pre-recovery global backlog continues for other live matches without advancing the restored match.
- Browser match/create/payment state remains deployment-scoped; lobby sorting and automatic refresh remain available with a selected match.
- Test fixtures now provide the same deployment identity as production configuration. Browser tests await completed catalogue refresh rather than testing a stale DOM.

## Evidence and remaining gates

See [VALIDATION.md](VALIDATION.md), [BLOCKERS.md](BLOCKERS.md), and the separate [VPS checklist](VPS-CHECKLIST.md). Numerical performance evidence under this directory is newly measured on the integrated tree; PR #4 measurements remain historical evidence in their original location.

Native Mainnet Circle USDC is pinned to `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`. Symbol alone never authorizes a token. Mainnet signer loading, matches, deposits, registration and payouts remain disabled in the public runtime. Testnet keeps its historical WASM and mock FT independently.

Original security review obtained from `audit/mainnet-readiness` commit `638c7d5`: `security/mainnet-readiness/{REPORT,PR-REVIEW,FIXES,LEGAL-CHECKLIST}.md`. It covers earlier individual PR heads, not approval of this final composition. A repeated review of the immutable integrated commit is required, followed by an independent professional audit and legal approval before any real-money release.

R08 correction: v2 live safety checks/heartbeat are scheduled before bounded round-robin history work. V2 dispatcher priority applies to unsigned work; persisted signed predecessors fence new signing until original-hash reconciliation. Legacy Testnet scheduling remains separate. See the explicit `--adapter=v2` load and targeted security retest rather than inferring v2 coverage from file hashes alone.
