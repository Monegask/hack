# Strict migration boundary: v1 Testnet backend -> v2 candidate

No runtime migration is performed by this PR. Do not merge/deploy this branch automatically to Railway or replace its pinned WASM. The target branch is a review base, not authorization to redeploy. No Mainnet signer or keys are needed for review/testing.

## Preserved wire model

All seven runtime method names and arguments remain unchanged: `create_lobby`, `bind_opponent`, `update_stake`, `record_activity`, `start_match`, `submit_result`, `heartbeat`. Deposit message remains `{match_id,revision,stake,fee_bps}`; the exact lobby fee/stake/revision must be read from final state. MatchState, payout states, payout indices, integer encodings, existing views, player cancellation/forfeit/claim methods, and event envelope remain compatible. New view fields are additive at the JSON level; Borsh is not compatible.

## Intentional behavior changes

| Surface | v1 | v2 |
|---|---|---|
| `new({admin,server,token})` | Any distinct FT, unpaused | Production only Circle native Mainnet USDC; self-call; initially paused |
| `get_config` | state_version 1 | state_version 2, adds server_frozen and pending_fee |
| `get_match` | Heartbeat alone limits lifetime | Adds game_deadline_ns; absolute six-hour refund deadline |
| `set_fee({fee_bps})` | Immediate, up to 10000 | Schedule after 48h, up to 500; adds apply_fee and cancel_fee_change |
| Runtime authority | Continues on ordinary pause | Same on ordinary pause; all methods rejected when freeze_server is active |
| Emergency refund | Stale heartbeat | Also absolute deadline or server_frozen |
| `set_server` | Pause and drain | Same, also clears freeze after full drain |
| `migrate` | Same-layout v1 | Same-layout v2 only; no v1 deserialization |

## Required integration changes in a future authorized task

1. Keep the existing Testnet service, SQLite data and signer untouched. A new chain uses a new escrow account, database namespace, public origin, wallet configuration and deployment. Never repoint a Testnet DB containing match IDs/outbox rows at another escrow.
2. The present `pvp/server/config.mjs` explicitly prohibits Mainnet; `chain.mjs` checks chain_id=testnet, six decimals and a pinned historical WASM. Authentication accepts Testnet IDs and frontend wallet selection uses Testnet. Changing only TOKEN_ID is insufficient. A separate Mainnet integration must intentionally review each guard, domain and wallet network, and pin the reviewed production WASM hash. These guards remain intact here.
3. Preflight must enforce network, native token identity, decimals=6, contract state_version=2, non-frozen server, unpaused status when admitting players, exact access-key receiver/seven-method allowlist/funded allowance, FT registrations and operational NEAR. Unknown code hash, unavailable RPC or mismatched config fails closed. Compare final-height views; do not accept metadata symbol alone as token identity.
4. Respect additive fields. Worker must reconcile absolute deadline and frozen state, stop gameplay admissions, and expose direct wallet refunds/claims even when backend unavailable. Update UI to distinguish Cancelled with pending refund, SettlementPending, InFlight unknown, and Paid. A log or transaction submission is not payment confirmation.
5. Fee admin UI must show scheduled versus effective fee and activation time. New lobbies use effective fee; existing lobbies retain old fee/receiver. Snapshot checks remain necessary after first deposit. Six-hour and 5%/48h proposed policies require product/security approval before release.
6. Create and initialize the fresh escrow atomically using self account actions, while paused. Review source/artifact hashes, permissions and admin multisig. Register escrow, both players and fee receiver on USDC. This document intentionally supplies no deployment command and authorizes no transactions.
7. Do not invoke v2 `upgrade`/`migrate` on v1 state. If a future same-network migration is approved: pause admissions on old escrow, complete/cancel old matches, verify every payout Paid and locked=owed=in_flight=live_matches=0, independently reconcile actual FT balance including unexplained transfers, archive final state/events, then direct **new** matches to fresh v2. Never transplant active funds or reuse match IDs across namespaces. Rollback routes new traffic to an explicitly reviewed configuration and leaves old claims available; it does not roll back already finalized financial transactions.

## RPC/outbox contract

Operation IDs identify immutable method/account/arguments. Persist signed bytes and tx hash before broadcast, query the original hash after transport errors and rebroadcast identical bytes only. An unknown/expired transaction requires explicit chain reconciliation; a new payment must never be inferred from an RPC exception. `tests/recovery.test.mjs`, `rpc.test.mjs`, and `durable.mjs` in the existing backend contain this behavior and mock transport checks. They are not live financial-party evidence.
