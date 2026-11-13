# Security and server trust assessment

Independent audit input, not an audit. No real funds or Mainnet transactions have been used. The Sandbox token models NEP-141 and selected issuer restrictions; it is not Circle's deployed contract or evidence of Mainnet end-to-end compatibility.

## Server determines the winner

The contract checks lifecycle, stake deposits, participant identity and payout arithmetic. It **does not verify gameplay**. A compromised server can choose a losing participant as winner, collude with an attacker participant, submit an early result, create nuisance lobbies/active locks or stop service. The seven-method function-call allowlist prevents calling admin methods, attaching funds and targeting other contracts; it does not make `submit_result` honest. Runtime allowance limits gas expenditure, not the USDC value at risk.

Implemented controls: deposits require player FT authorization and exact offer snapshot; winner must be a participant; settlement is unique; runtime cannot redirect fees, change fee configuration, issue arbitrary refunds to itself, upgrade, rotate admin, claim other beneficiaries' payouts or move native NEAR. Admin `freeze_server` immediately revokes results/heartbeat and enables participant refunds. Six-hour absolute deadline prevents indefinite locking by malicious heartbeat even without admin response. These controls cannot undo theft finalized before detection.

Operational requirements before any real-money launch: separate admin multisig from runtime signer; hardware/offline custody for administrative authority; receiver + exact seven-method key restrictions; short-lived/revocable operational credentials; separate result-signing process from public HTTP server; independent monitoring of results, liability reconciliation and freeze alerts; exposure/admission limits and stake limits; immutable engine/rules version and deterministic replay archive; dual review of key replacement; incident drills. These are recommendations and deployment requirements, not all implemented software in this PR. No keys are requested.

Stronger alternatives requiring an explicit design/API revision:

| Option | Protection | Remaining assumption/cost |
|---|---|---|
| Independent threshold result signers, each replays authenticated game commands | One compromised online key cannot pick a winner | Independent operators, quorum availability, replay agreement; current submit_result has no signature quorum |
| Player-signed result agreement | Server alone cannot settle against an honest player | Loser can withhold; requires timeout/dispute rules, chain/domain/match/revision replay protection |
| Proposed result + challenge window + independent adjudicator | Time to freeze/challenge before payment | An adjudicator is still trusted; evidence availability and griefing/bonds must be designed |
| On-chain deterministic replay or validity proof | Cryptographic result verification | Major engineering/gas/prover costs; existing game has no such proof system |

Recommended next security design for meaningful stakes: independently replayed threshold results plus bounded challenge period and a tested refund/dispute policy. A single runtime key is a deliberate centralized oracle in this candidate and must be disclosed to players. Do not market it as trustless PvP.

## Admin, account keys and upgrades

There is no general FT transfer, native withdrawal, payout redirection or generic call method. Admin cancellation only refunds original depositors in full. Fees/recipients snapshot at lobby creation; fee increases have a 48-hour delay and 5% cap. Admin can deny service, cancel a legitimate running game, rotate future fee receiver through admin transfer, or change future code after pause/drain. These are trust powers even without a withdrawal method.

`upgrade` is gated on no live matches, no locked/owed obligations and no in-flight payout. This protects recorded current liabilities. It does not certify replacement code, detect unaccounted direct FT transfers or prevent future malicious admissions after an upgrade. A deployment-account FullAccess key bypasses contract gates entirely. Before launch either remove deployment keys and audit the gated upgrade/governance path, or choose an audited immutable-code deployment. Audit must review account permissions as well as Rust. This task does not change live keys or governance.

## Asynchronous transfer safety versus liveness

Each transfer is fixed token/receiver/amount; its unique index and attempt guard callback replay. Persist InFlight before scheduling. Confirmed FT failure restores Ready, allowing beneficiary retry. RPC errors cannot update on-chain state and must not trigger replacement payment. Native balance/gas checks defer rather than discard obligations. There is no admin timeout reset of InFlight.

A successful transfer followed by a failed/lost callback can leave InFlight indefinitely. Retrying would risk double payment; leaving it quarantined preserves safety but sacrifices liveness. Audit must assess callback gas budget (20 Tgas), long account names/history, storage reserve and worst-case execution. No generic proof-based reconciliation is implemented. This remains an explicit incident-design gap before production; external proof plus a governance decision is not itself a safe on-chain recovery API. Never change Ready/InFlight manually because an RPC query timed out.

## Circle, insolvency and refunds

[Circle's published NEAR implementation](https://github.com/circlefin/stablecoin-near/blob/80e2760c0d00c3853bcb8b33f914720f54351bf7/src/fiat_token.rs) checks pause/blocklist in transfers and resolver. It can prevent payments/refunds, while registration can also be blocked. An issuer restriction is not solved by adding more retries. Keep obligations and retry only when a final failed FT receipt makes that safe and the external restriction is removed. Do not change refund beneficiary to bypass issuer restrictions.

Rejected deposits normally return through NEP-141 resolver. A resolver failure after incoming transfer is an unaccounted-balance incident. The candidate does not guess ownership of excess tokens or give admin a sweep. Direct `ft_transfer` instead of transfer_call likewise creates no credit and may strand tokens. Client must expose only the supported deposit route; reconciliation must compare actual FT balance to locked+owed and classify any surplus/deficit at a final block. Paid excludes completed transfers even when historical accounting grows; FT balance during asynchronous operations must be reconciled with receipt status, not a naive snapshot across blocks.

The test-only burn operation simulates insufficient escrow FT balance. The escrow correctly records Ready rather than Paid. It cannot manufacture missing USDC; recapitalization in the test uses mock mint and demonstrates state recovery only. Real insolvency needs a separate incident resolution.

## Historical source-to-binary gap

The v1 source bundle matches its preserved import registry; its historical WASM matches the current Testnet code hash. The fresh Linux v1 build still differs from that binary after historical dependency-path remapping. The precise cause is unresolved. Do not infer deployed-code equivalence from matching API exports, import hashes or passing candidate tests. Independently audit v2 source and reproducibly build its own artifact; treat historic deployment provenance as a separate open issue.

## Additional audit targets

- Verify the official token address, current code hash, metadata decimals, registration semantics and gas against current Mainnet read-only state; published source is not verified deployed-code identity.
- Check arithmetic extrema, fee floor rounding, cumulative counter overflow rejection, timers at exact nanosecond boundaries and all settlement/cancel interleavings.
- Review callback result handling, receipt gas allocation and insufficient-NEAR behavior; no upgrade/prune while obligations remain.
- Assess storage griefing and server-created lobbies: 10,000 stored-record cap, funded storage reservations and permissionless paid-record pruning reduce exposure; lifecycle/monitoring still matters.
- Review pinned Rust/dependency lockfiles, CI permissions/actions and reproducible artifacts. No dependency-security audit is claimed.
- Existing backend is Testnet-only and has not been enabled for Mainnet. Its application security, NEP-413 sessions, economic gameplay fairness, availability and infrastructure are separate audit scopes.

## Acceptance boundary

Tests and reproducible builds can establish a reviewable candidate. They do not remove centralized result trust, issuer powers, account-key risk or callback-liveness gaps. Independent security audit, policy choices, account/governance review, Circle-contract compatibility evidence and separately authorized staged integration are required before deployment. No instruction in these files authorizes Mainnet deployment or spending real funds.
