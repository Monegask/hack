# Testnet public matchmaking deployment — 14 November 2026

Result: published at https://pvp-testnet-testnet.up.railway.app/pvp/ via Play Online on https://supply-line-game.vercel.app/ .

## Source and deployment

- Deployed commit: `f221951cf0bb280f2faae8c5f11b2a3795d75232`, branch `release/testnet-matchmaking`, isolated worktree `publishing/testnet-matchmaking`.
- Exact ancestry: original Testnet base `0e13688` → PR #2 `079c2cb` → browser reconnect fixture update `f221951`. No PR #3/#5/Mainnet or escrow-v2 code was imported. PR #2 remains open; its implementation is deployed through the pinned release branch, without merging other branches.
- Railway project `cec89410-18d1-421d-9149-2d643df61ce1`, environment `ec90c5f8-7b54-4588-891b-d245d1e5fab6`, service `e4fe9aaf-1e7c-44d6-a59d-ce959a21d369`.
- Deployment `3788718b-11d3-4463-92c0-095ae0d0dc0b`: SUCCESS, startup 2026-11-14 13:23:09 UTC / 16:23:09 Moscow. Previous runtime `7c3a519`.
- Existing `pvp-data` volume `cf488357-f8ee-4d89-a11d-d00a21d90063` retained at `/data`, 500 MB. One replica, overlapSeconds=0, drainingSeconds=10, existing SQLite single-owner lease. Existing external restricted signer retained at `/data/secrets/server-runtime.json`; it was not printed, downloaded or copied to staging. Successful normal startup includes existing signer/code/token/access-key preflight.
- Escrow `dev-20261105124711-29870979355191.testnet`, token `dev-20261105124714-71962479239708.testnet`, 300 bps, existing wallet/deposit/countdown/outbox logic unchanged. No contract deployment, real USDC, Mainnet or VPS operations.

## Isolated acceptance before switching

- 27 backend tests PASS, including discovery privacy/pagination/filtering/restart, concurrent joins across RPC awaits, durable seat reservation and disappearance during binding, HTTP visibility validation and read coalescing.
- 169 game regressions PASS. Offline build (including build-offline.cjs), game and PvP bundles PASS.
- matchmaking-browser.mjs PASS with three isolated browser sessions: public creation, automatic discovery, sorting, Join without invite, occupied removal at a third client, private invitation preview and mobile overflow.
- reconnect-browser.mjs PASS after its mock server was updated to answer the newly introduced /api/lobbies endpoint. Runtime code was not changed for this fix.
- browser-qa.mjs and gameplay-browser.mjs PASS: both game sides, auth/commands, tamper overwrite, reload/mobile, truck 2 selection, card preservation, recall/return/reassignment. All financial transitions in these local tests use a mock chain, not live payouts.
- Separate remote Railway read-only staging service `923c3c5e-1559-4f28-ad91-0ff81b3a5a96`, deployment `38971770-a13a-46ce-a281-b45ca52616ca`, same source/image and real Testnet metadata/code checks. It used in-memory data, preflight(loadSigner:false), no signer/worker/volume, and a rejecting transaction executor. Remote browser verified new sections, config/auth boundary and Meteor selector. It did not create real on-chain lobbies. The staging deployment was stopped after acceptance.

## Financial gate and backups

The final gate at 13:22:30 UTC, final block 277662438, found accounting accepted=paid=60000000 and locked=owed=in_flight=live_matches=0. SQLite contained one finished/Completed match (chain match 1), both payouts Paid, and 49 outbox entries, all done. No active match or unknown operation was found. No game/result/refund transaction was sent by deployment checks.

SQLite's online backup API produced a consistent snapshot and a separate outbox export, both chmod 0600, under `/data/backups/matchmaking-20261114/`. Both files were downloaded outside Git to `C:/Users/Павел/Documents/SupplyLine-private-backups/2026-11-14/`. They contain private server data and must not be published.

- `pvp.sqlite`: 77824 bytes, SHA-256 `c55b949024f389da978c049fe66f9b996c0a5c16b782603c4042ed54b4bfb14f`.
- `outbox.json`: 20483 bytes, SHA-256 `abf09f869ea4ab783759cf9dfa66ff9361f23704496b60c18f4af09cabcf30ee`.
- Remote/local hashes matched; integrity_check=ok. Signer was excluded.

The user explicitly authorized a temporary SSH key after automatic review requested separate authorization. The task-specific Railway key was revoked and its local private/public files deleted after the checks. No SSH keys remained registered according to Railway CLI. A temporary approval-review usage-limit failure blocked one gate command before execution; the user asked to continue, and the fresh gate passed before deployment.

## Public verification and remaining manual acceptance

Public Vercel → Play Online → updated Railway, four new sections, Public/Private options, four sort options, authenticated catalogue boundary (401/no-store), Testnet Meteor wallet selector and no page errors: PASS. Standard public smoke also checked Origin protection, closed provisioning, mobile layout and preservation of isolated sentinel saves.

Post-deployment read-only verification: deployment ID matched; SQLite integrity_check=ok; session=2, match=1, outbox=49; previous match remained finished/Completed; all outbox entries remained done. Deployed GameService returned an empty public catalogue (no open public lobbies existed), and TESTNET_PLAYERS was not restricting public sign-in. This validation instantiated only a read-only service projection, without signer, worker or simulation loop.

Manual testing with two real Testnet wallets can begin: both need test NEAR and existing mock FT. The first wallet creates Public, the second joins from Public Lobbies; a third observer can verify automatic removal. Private remains invitation-only/unlisted. No new wallet signature, live lobby create/join, deposit or payout was performed by public smoke; end-to-end acceptance with those user wallets is still manual. The UI catalogue refreshes about every six seconds; server-side exclusion and rejection of a stale Join happen immediately on reservation.
