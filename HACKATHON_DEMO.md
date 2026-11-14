# Supply Line — judge's demo

[Play Now](https://supply-line-game.vercel.app/) · [Direct PvP](https://pvp-testnet-testnet.up.railway.app/pvp/) · [Rust contracts](contracts/README.md) · [Verification report](docs/REPOSITORY_VERIFICATION.md)

## The 2–3 minute review

1. Open the main site. Choose **Play tutorial** or **Race the bot** for immediate gameplay without a wallet.
2. Open **Play online** and connect a Testnet wallet to access **Public Lobbies**, **Create Lobby**, **Private Invite** and **My Matches**. Discovery and participation require authentication.
3. Inspect [Testnet settlement for match #2](https://testnet.nearblocks.io/txns/8s6v7dfg8YqQYVSR6tiZfYNmgAZW5ArWT3GeYH2G2rE6): 9.7 mock tokens to the winner, 0.3 fee. Compare [final contract state](docs/verification/testnet-match-2.json).
4. Open [Rust source and tests](contracts/README.md). The deployed public game uses v1; the v2 Mainnet candidate is not deployed.

A complete PvP match takes longer than this repository tour. Arrange two funded players before the presentation. Screenshots: [public landing page](docs/media/public-menu.png), [rebuilt solo bot race](docs/media/bot-race.png). These are real browser captures, not a live PvP payment recording. No submission video has been supplied yet.

## Prepare two wallets

Use two separate NEAR **Testnet** accounts, ideally on two devices or isolated browser profiles. Choose a compatible Testnet wallet from **Connect Testnet wallet**; Meteor is the previously tested option. Keep recovery phrases and private keys in the wallets.

Each account needs two different things:

| Asset | How to prepare it |
| --- | --- |
| Native test NEAR for transactions/storage | Use the built-in faucet on [NEAR's official Token Faucet page](https://docs.near.org/getting-started/faucet): enter the Testnet account ID and click **Request**. Availability/rate limits may vary. |
| Supply Line mock FT for the stake | Obtain the exact token `dev-20261105124714-71962479239708.testnet` from the project operator or an existing funded holder. Ordinary NEAR faucets and Circle's faucet do **not** supply this project-specific token. |

**There is no automatic in-game mock-FT faucet.** The verified preparation route is an existing holder's wallet transfer after recipient FT registration. A holder funded a new player with 10 mock tokens on 14 November; the ensuing match #2 and settlement are independently visible on-chain. This does not imply an unlimited public distribution service.

For a presenter coordinating a new demo:

1. Ask both players for public Testnet account IDs only.
2. Have each connect to the game and choose **Register test token** if offered. Confirm the token's `storage_deposit` in their Testnet wallet, then wait for registration confirmation.
3. Ask an existing holder to send enough of that exact mock FT for the agreed stake. If the wallet requires a custom token, use the full token account ID above. The underlying call is `ft_transfer({receiver_id, amount})` on that token with 1 yoctoNEAR attached; 5 tokens = `5000000` atomic units. The holder confirms in their wallet.
4. Refresh both game balances and verify sufficient test NEAR. A faucet's token named USDC is not interchangeable with this contract's mock token.
5. If no holder can fund the accounts, the live deposit demo is **blocked**. Use tutorial/bot and existing settlement evidence; do not promise automatic funding.

An [operator-only mint helper](https://github.com/Monegask/hack/blob/f221951cf0bb280f2faae8c5f11b2a3795d75232/prototypes/logistics-race/pvp/server/fund-players.mjs) also exists. It needs the original external token-owner key, is not a public faucet and is not required for the verified holder-transfer route. Its live execution has not been independently verified in this preparation. The game's restricted server signer cannot mint tokens.

## Player 1 — host

1. Open [Supply Line](https://supply-line-game.vercel.app/) and select **Play online**.
2. Select **Connect Testnet wallet**, choose the prepared first account and approve the login message.
3. In **Create Lobby**, choose a test-token amount per player; 1 token is sufficient for a small demo, while 5 illustrates the 10 / 9.7 / 0.3 split.
4. Set visibility to **Public** and select **Create lobby**. Lobby creation is submitted by the server; do not expect a player stake transaction at this step.
5. Keep the lobby open and wait for Player 2.

## Player 2 — join

1. Open the main site, select **Play online** and connect a **different** Testnet wallet.
2. Open **Public Lobbies**. Refresh if necessary; automatic discovery refreshes about every six seconds.
3. Find Player 1's lobby, verify the stake and select **Join**. A seat can disappear if another player joins or the lobby expires.

For a private demonstration, Player 1 selects **Private** and sends the displayed invitation link/code. Player 2 uses **Private Invite**. Private lobbies do not appear in discovery; an invitation is not an account allowlist.

## Both players — deposit and race

1. Check the opponent, equal stake, configured mock token and 3% fee shown in the game.
2. Each selects **Deposit** and approves their own exact Testnet transaction. The token call is `ft_transfer_call` with escrow as receiver; no real USDC should appear.
3. Wait for both deposits to be accepted on-chain. The server starts the shared countdown and opens the match.
4. Build production, dispatch trucks, manage fuel/roads/pipelines and deliver **12 iron, 6 copper and 8 asphalt** to the hub before the opponent. The server runs at 1×; there is no personal PvP pause.
5. Keep both pages open until completion. Save the numeric **Escrow match #** and wallet transaction hashes for verification.

## Verify the result and finances

The browser win screen and the contract's financial outcome are separate observations.

1. In **My Matches**, inspect the recorded winner and prize/fee states.
2. Open [the Testnet escrow explorer](https://testnet.nearblocks.io/address/dev-20261105124711-29870979355191.testnet) and find that match's `submit_result` transaction. Inspect its arguments and complete receipts, including token transfers and callbacks.
3. With a repository clone and Node.js 24, run `node scripts/verify-testnet.mjs MATCH_ID`, replacing `MATCH_ID` with the numeric escrow ID, not an invitation code. It reads public final state without signing anything.
4. Confirm both deposits, the winner, payout receivers/amounts and each payout's `Paid` state. `Ready` means claimable/retryable; `InFlight` means unresolved, not paid. Root transaction success alone is insufficient.

**Independently checked example:** match #2, `monegask.testnet` vs `widelibrary4002.testnet`, 5 mock tokens each. Final reads at block 277674870 show `Completed`, winner `widelibrary4002.testnet`, prize `9700000` and fee `300000`, both `Paid`. [Settlement transaction](https://testnet.nearblocks.io/txns/8s6v7dfg8YqQYVSR6tiZfYNmgAZW5ArWT3GeYH2G2rE6) shows both FT transfers. [Raw snapshot](docs/verification/testnet-match-2.json). This proves a particular Testnet settlement, not future payout reliability or Mainnet safety.

## If something interrupts the demo

- Insufficient mock FT: arrange a holder transfer before creating another lobby. No automatic faucet exists.
- RPC error or unknown deposit result: check the original wallet transaction and final contract state before another payment. Never clear data to retry a financial operation.
- Private lobby missing: use its invitation; it will not appear in Public Lobbies.
- Expired/occupied lobby: refresh and review existing match/deposit state before creating a new one.
- One player disconnects for more than 120 seconds: the current server can submit a win for the connected opponent.
- Both disconnect or simultaneous finish stops play: use mutual cancellation, or emergency refund after 30 minutes without a match heartbeat. It is not an instant automatic refund.
- Stuck payout: inspect `Ready`/`InFlight`, recipient FT registration and receipts. Do not claim success or force a reset.

All of this demo is Testnet-only. Do not deploy Mainnet contracts, fund real USDC, change signers or alter the running service/database to prepare a presentation.
