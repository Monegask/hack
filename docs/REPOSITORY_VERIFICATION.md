# Hackathon repository verification

Checked **14 November 2026**. Scope: all eight public remote branch tips and their tracked files/history, PRs #1–5, current Actions runs, build/dependency configuration, frontend/server/contract source and test entry points, and read-only public deployment/chain observations. This is a repository readiness review, not a professional security audit or an exhaustive proof of program correctness.

## Which code is actually public and running?

Default branch is `main`; repository visibility is public. Ref names below are a dated inventory, not instructions to deploy them.

| Branch | Tip at review | Role / deployment |
| --- | --- | --- |
| `main` | `0051c22e7b6fab56cdc3d37ade02e374662f0ae7` | Vercel portal, tutorial and bot; Play online redirects to Railway |
| `testnet-pvp-server` | `0e13688f559b0807b334c7e963b938d0107d0959` | Original public Testnet backend base; not the latest deployed matchmaking runtime |
| `release/testnet-matchmaking` | `2b52daecac1b9a64a13a3333c19edb6b4b907b6c` | Deployment report added after runtime `f221951cf0bb280f2faae8c5f11b2a3795d75232` |
| `feat/public-matchmaking` | `079c2cb9013da1cd08c9dde992904e778c79807a` | PR #2 implementation included in the pinned Testnet release |
| `feat/mainnet-escrow` | `6b6cd1c2f71dead588bbd41e400da9403bc599f8` | PR #1 Rust v2 candidate; not deployed on Mainnet |
| `feat/mainnet-integration` | `e66161f1645e89c462b55f9ac50c23129618619c` | PR #3 v2 adapter and financial recovery; not public runtime |
| `perf/pvp-scalability` | `0a9db397f2cd4ede8ba51d7296823c2eb3aef186` | PR #4 benchmark/performance candidate; not public runtime |
| `release/mainnet-v1` | `0803b553ca29300815d87abc95e4d48ab94e8ebe` | PR #5 combines #1–4 plus follow-up tests/reviews; not public runtime |

All five existing PRs were open at review and target `testnet-pvp-server`; their changes are not merged into default `main`. PR #2's code is nonetheless deployed through a separate pinned release. PR status alone does not identify production.

Sources: [PR #1](https://github.com/Monegask/hack/pull/1), [#2](https://github.com/Monegask/hack/pull/2), [#3](https://github.com/Monegask/hack/pull/3), [#4](https://github.com/Monegask/hack/pull/4), [#5](https://github.com/Monegask/hack/pull/5). Backend [deployment report](https://github.com/Monegask/hack/blob/2b52daecac1b9a64a13a3333c19edb6b4b907b6c/docs/deployments/testnet-matchmaking-2026-11-14.md). No release branch was merged by this preparation.

## Deployment and architecture checks

- Public Vercel portal and Railway PvP both returned HTTP 200, in English, explicitly Testnet-only. The portal exposes tutorial, bot and Play online; PvP provides public/private creation, discovery, invitations and matches after wallet authentication.
- Railway's read-only deployment API independently confirmed successful deployment `3788718b-11d3-4463-92c0-095ae0d0dc0b`, source `f221951`, branch `release/testnet-matchmaking`. No config, variables, volume, signer or service state was changed.
- [Health](https://pvp-testnet-testnet.up.railway.app/healthz) returned `ok: true, network: testnet`. [Config](https://pvp-testnet-testnet.up.railway.app/api/config) identified the expected v1 escrow/mock FT and 300 bps.
- [`vercel.json`](../vercel.json) installs the locked Three.js build dependencies, builds `public/`, and redirects `/pvp` paths to Railway. It does not run the PvP authority.
- The pinned [Railway Dockerfile](https://github.com/Monegask/hack/blob/f221951cf0bb280f2faae8c5f11b2a3795d75232/prototypes/logistics-race/pvp/deploy/Dockerfile.railway) uses Node 24 and locked production dependencies. Its [entry point](https://github.com/Monegask/hack/blob/f221951cf0bb280f2faae8c5f11b2a3795d75232/prototypes/logistics-race/pvp/deploy/railway-entry.mjs) uses persistent data and an external restricted signer, then drops root privileges before serving.
- Published backend configuration prohibits Mainnet. v2 code and Circle integration are separate candidates; public v1 does not depend on their unfinished work.

Older specialized PvP README sections still contain dated “not deployed”, “no public matchmaking” and “payout untested” statements. These are historical and disagree with current deployment/user/chain evidence. The new root README and this dated inventory explicitly supersede those status claims without rewriting old branch history. Those operator documents are not a judge's entry point.

## Contract and payout verification

See [contract index](../contracts/README.md) for pinned Rust source, ABI, unit tests, Sandbox tests and source-provenance limitations.

Direct final RPC reads confirm the deployed escrow's `state_version=1`, expected token, unpaused state and code hash `AWkPGc7xMZtCm8ShbpWXFQWctsf2w1tYnvaBQCeCzYzz`. Recorded evidence:

- [Match #1](verification/testnet-match-1.json): completed, winner payout 9.7 and fee 0.3 mock tokens, both `Paid`.
- [Match #2](verification/testnet-match-2.json), final block 277674870: both deposits accepted, `Completed`, winner `widelibrary4002.testnet`, both payouts `Paid`.
- [Match #2 final receipt evidence](verification/testnet-settlement-2.json): `FINAL`, decoded call binds match 2/winner, successful NEP-141 transfers of `9700000` and `300000`, successful `payout_resolved` callbacks for indices 0 and 1. [Explorer transaction](https://testnet.nearblocks.io/txns/8s6v7dfg8YqQYVSR6tiZfYNmgAZW5ArWT3GeYH2G2rE6).
- Accounting at that observation: accepted=paid=`70000000`, locked=owed=in_flight=live_matches=0. This is a dated snapshot, not a promise about later state.

The user separately reports successful two-wallet create/join, stakes and gameplay. That report does not itself prove a payout. The public receipt tree and state above are the independent payout evidence. This review did not sign a wallet message, create a lobby, deposit, submit a result or claim a payout. It does not independently replay the human gameplay video or establish the exact UI path used in that reported match.

## Builds, dependencies and tests

| Check | Result and scope |
| --- | --- |
| Fresh static dependency installation | Lockfile-based `npm ci`, successful in the isolated submission worktree |
| Vercel-equivalent build | `npm run build` passed, including `build-offline.cjs`, tutorial/bot/portal and lazy payload |
| Game regressions | **169/169 passed** locally after rebuild |
| Exact deployed PvP checkout | Separate detached worktree at `f221951`; fresh locked dependencies, static and PvP builds passed |
| Deployed backend suite | **27/27 passed** locally; actual engine/HTTP/SQLite tests, mocked chain transport |
| New submission tests | Local serving of lazy payload, public PvP redirect, file-exposure boundaries and relative documentation links |
| Isolated Edge browser smoke | Tutorial/bot launch and return, save sentinel preserved, public Vercel→Railway→Meteor selector; no wallet login or payment. [Evidence](verification/browser-smoke.json) |
| Production build equivalence | Rebuilt `public/index.html` and `public/playable-game.json` byte-match the current Vercel responses; hashes in the browser evidence above |
| Rust/Sandbox local rerun | Not performed on this Windows host; Cargo is not installed. Existing successful hosted runs checked separately below |

Local execution uses Node 26.13.0; Node 24 is the documented runtime and the new PR CI target. Initial restricted-host build attempts failed because esbuild could not read ancestor paths; repeating with local build access succeeded. Tests run before that rebuild had missing generated artifacts and are not counted as a passing result.

Dependencies are pinned by npm lockfiles; candidate Rust uses a pinned toolchain and Cargo locks. Fresh npm installation reported zero known vulnerabilities for the installed build/backend packages at check time; that is not a comprehensive security assessment. No dependency updates were introduced.

### Existing GitHub Actions

GitHub's API reported all three latest PR #5 runs at exact head `0803b553...` completed successfully:

| Workflow | Checked run | Scope |
| --- | --- | --- |
| Release integration checks | [43578830790](https://github.com/Monegask/hack/actions/runs/43578830790) | Node 24/Linux, full builds, 169 game tests, 79 backend tests and 50-match original-engine replay |
| Mainnet escrow candidate | [43578830808](https://github.com/Monegask/hack/actions/runs/43578830808) | Format/lints, 38 Rust tests, 9 real Sandbox scenarios, 3 client tests, identical v2 builds |
| Escrow v2 backend integration | [43578830813](https://github.com/Monegask/hack/actions/runs/43578830813) | Actual local Rust receipts and integrated backend/engine financial lifecycle with mock FT |

Earlier failing experimental runs remain visible in Actions history. The scoped passing runs above do not certify every branch or production. Existing workflows target PRs to `testnet-pvp-server`; **main had no workflow**. This PR adds [Submission build and checks](../.github/workflows/submission.yml) for `main` push/PR events with no secrets/deployment step. Its current result is visible in the submission PR checks.

The dated GitHub API summary is [saved here](verification/actions-before-submission.json). Screenshot evidence: [public menu](media/public-menu.png) and [local rebuilt bot race](media/bot-race.png). An initial browser assertion incorrectly expected authenticated lobby headings to be visible before login; correcting the test to inspect their presence and the public wallet selector passed. No login bypass was used.

## Secrets and publication checks

Fetched public remote history was inspected using high-confidence PEM/private-key, NEAR credential-literal, GitHub token, AWS access-ID, seed-phrase and service-token assignment patterns. **630 text blobs / 1,231 reachable objects** yielded no matches. Filename checks flagged only `.env.testnet.example` and `.env.mainnet.example`; inspection showed public IDs, external paths and required-value placeholders, not credential values. Code necessarily references secret-loading fields; references and public keys are not private keys.

No private signer, player seed, live SQLite file, outbox export or private backup was copied into this branch. New chain snapshots contain public account/transaction data only. This is a scoped heuristic scan, not a formal secret-scanning service: it cannot rule out unrecognized credentials, unreachable/deleted remote objects or secrets outside Git. Secret contents were not read from their external Windows location.

[Machine-readable scan scope/results](verification/secret-scan.json).

## Fixed by this submission

1. Replaced the false main README claim that wallets, on-chain stakes and human PvP are unimplemented.
2. Corrected Russian-interface instructions and explained the actual public/private lobby flow.
3. Exposed backend, Rust source, ABI and tests through pinned links from default-branch documentation.
4. Separated deployed Testnet v1, undeployed Mainnet v2, mock USDC, native Circle architecture and test scopes.
5. Added a funded-two-wallet demo script, real funding limitations and independent settlement evidence.
6. Disclosed v1 source/WASM mismatch, server trust, recovery gaps, licensing and missing demo media.
7. Fixed local preview: it previously returned 404 for `playable-game.json` and `/pvp/`, breaking the documented tutorial/bot and online entry. Production build/config is unchanged.
8. Added main-targeted CI and targeted serving/documentation checks.

## Remaining limits before submission / before Mainnet

- The new README becomes the repository landing page **after this PR is merged**. This task prepares a reviewable PR; it does not automatically merge it or other work.
- Prepare and confirm mock-FT funding for both live presenters; no self-service project-token faucet exists. No dedicated demo video is supplied.
- v1 historical source-to-deployed-WASM reproducibility remains unresolved. v2 is an independently tested candidate, not proven deployed-v1 source.
- Actual Railway capacity, sustained live RPC/signing throughput, full production disaster-recovery acceptance and horizontal scale are not established by mock-chain load tests.
- v2 lost-callback InFlight recovery, failed FT resolver attribution, unknown/hashless/expired transaction recovery, governance and infrastructure blockers remain documented in [the candidate blockers](https://github.com/Monegask/hack/blob/0803b553ca29300815d87abc95e4d48ab94e8ebe/docs/release/mainnet-v1/BLOCKERS.md).
- No professional independent audit, Mainnet deployment, native Circle end-to-end payment or legal eligibility approval is claimed.

**Readiness:** suitable to present as a working NEAR Testnet hackathon prototype once this documentation PR is merged and demo wallets are funded. **Not ready for real-money/Mainnet launch.**
