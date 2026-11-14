# Release blockers

Status: **NO-GO for real funds**. Test success does not waive these gates.

Concrete R06 integration, R05 full-resolver-refund recovery, R07 frozen/deadline paths, R08 history starvation and K1 signer-path reproductions are closed on the documented tested slices. Broader incident/issuer/governance and operational issues below remain open.

| ID | Required before real-money release | Current boundary |
|---|---|---|
| A01 | Approve trusted server winner model, exposure limits, independent result evidence and dispute policy | Server remains the outcome authority; compromise can forge an authorized result |
| A02/A08 | Exact release freeze drill and governance/access-key inventory | Source includes freeze; no Mainnet accounts, deployment or keys inspected |
| A03 | On-chain cleanup/admission and Sybil controls | Local expired-unpaid capacity mitigation implemented; host still needs on-chain cancellation; seven-method runtime key cannot run permissionless keeper methods |
| A04/R01 | Trusted ingress, account/session/IP quotas and direct-origin protection | Per-account budget across sessions and bounded catalogue RPC exist; real proxy and Sybil resistance unverified |
| A05 | Durable command/history/session retention and disk-pressure response | Terminal engine cache released; durable financial evidence intentionally retained; quotas/archival policy incomplete |
| A06 | Proof-based classification/recovery for expired/unknown signed transactions | Same signed bytes retained and retried; no blind re-signing; unresolved operations need operator handling |
| A07 | Approved outage/restart/disconnect policy | Normal 120s disconnect and conservative restart recovery tested; policy acceptance pending |
| R05 | Refunded/rejected successful FT payment journal recovery | Exact transaction/receipt binding and full resolver refund are tested upstream; failed resolver/unaccounted remainder and absent hash remain unresolved C2/C3 |
| A09 | Source-to-WASM provenance for exact deployment | v2 reproducible candidate distinct from historical v1; historical v1 rebuild mismatch unresolved |
| Callback | Success-transfer plus failed callback / stuck InFlight recovery | No unsafe reset or duplicate payout; proof-based liveness recovery unresolved |
| Legal | Country/state eligibility, age, AML/KYC applicability, ToS and enforcement | No legal approval; checklist is not legal advice or authorization |
| Audit | Independent professional audit/retest | Original and repeated integrated AI review obtained through exact runtime `616e870`, including R08/K1 closure; it does not substitute for professional audit |
| A10 | CSP/provider-origin policy and actual wallet redirects/mobile | Isolated Edge tests pass; real wallet-app flows and residual policy acceptance remain unverified |
| Wallet E2E | Two actual user wallets with final chain receipts through the whole game | Ephemeral cryptographic identities and browser fixtures tested; no user wallet funds spent |
| VPS | Linux Node 24/cgroup load, backup restore, proxy, monitoring and failure drills | Windows measurements cannot establish production VPS capacity |

Never remove a payment/signing gate to make an E2E test pass. Sandbox/mock FT tests are the safe financial environment. Do not point Sandbox artifacts or mock FT at Mainnet, upgrade the historical v1 in place, clear the database, delete financial outbox evidence, or change production branches to validate this candidate.
