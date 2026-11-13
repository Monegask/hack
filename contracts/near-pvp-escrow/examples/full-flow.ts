import { EscrowClient, depositTransaction, parseUsdc } from "./client.ts";
import type { Wallet, Match, Config } from "./client.ts";

/**
 * Integration sequence, called by the game after authenticated matchmaking.
 * Wallets are supplied by the existing application. Raise UI and consent belong
 * to authenticated backend sessions. This module never stores a private key.
 */
export async function fullFlow(input: {
  client: EscrowClient; server: Wallet; alice: Wallet; bob: Wallet;
  /** Must launch the actual game and return once the game process is ready. */
  launchGame: (id: string) => Promise<void>;
  stopGame: (id: string) => Promise<void>;
  /** Game server determines the winner; calls heartbeat at least every 60s. */
  play: (id: string, heartbeat: () => Promise<void>) => Promise<string>;
}): Promise<Match> {
  const { client, server, alice, bob } = input;
  const config = await client.view<Config>(client.escrow, "get_config");
  if (config.server !== server.accountId || alice.accountId === bob.accountId) throw new Error("Invalid accounts");

  // 1. Backend creates and commits a lobby immediately, so its 600s clock starts here.
  const created = await client.serverCall(server, "create_lobby", { creator: alice.accountId, stake: parseUsdc("10") });
  const status = created.status as { SuccessValue: string };
  const id = JSON.parse(atob(status.SuccessValue)) as string;
  await client.serverCall(server, "bind_opponent", { match_id: id, opponent: bob.accountId });

  // 2. Example: an authenticated proposal of 25 USDC was accepted by the opponent.
  // A rejected proposal produces no update_stake call. Persist agreements in your DB.
  await client.serverCall(server, "record_activity", { match_id: id });
  await client.serverCall(server, "update_stake", { match_id: id, stake: parseUsdc("25") });
  const agreed = await client.getMatch(id);
  if (!agreed) throw new Error("Missing match");
  // In the real UI these values come from the accepted Raise, then compare to get_match.
  const expected = { stake: parseUsdc("25"), revision: "1", feeBps: config.fee_bps };
  if (agreed.stake !== expected.stake || agreed.revision !== expected.revision || agreed.fee_bps !== expected.feeBps) throw new Error("Agreement changed");

  // 3-4. Exactly one Ready transaction per player. Rejection of the wallet prompt throws.
  // Register escrow + both players + fee_receiver with token storage_deposit beforehand.
  await client.send(alice, depositTransaction(client.escrow, config.token, alice.accountId, agreed, { ...expected, opponent: bob.accountId }));
  const first = await client.getMatch(id);
  if (!first?.deposited[0]) throw new Error("First deposit not confirmed");
  // Revision is now frozen. Backend may no longer submit Raise updates.
  await client.send(bob, depositTransaction(client.escrow, config.token, bob.accountId, first, { ...expected, opponent: alice.accountId }));

  // 5-6. Final state, on-chain countdown, actual launch, authorized start confirmation.
  await client.serverCall(server, "heartbeat", { match_ids: [] });
  await client.waitCountdown(id);
  await input.launchGame(id);
  try { await client.serverCall(server, "start_match", { match_id: id }); }
  catch (error) { await input.stopGame(id); throw error; }
  // Only release gameplay to clients after final InProgress confirmation.
  const running = await client.getMatch(id);
  if (running?.state !== "InProgress") { await input.stopGame(id); throw new Error("Start not confirmed"); }

  // 7. The game invokes this heartbeat for THIS match. Shard batches at <=32 IDs.
  const heartbeat = async () => { await client.serverCall(server, "heartbeat", { match_ids: [id] }); };
  const winner = await input.play(id, heartbeat);
  if (![alice.accountId, bob.accountId].includes(winner)) throw new Error("Invalid game result");
  await client.serverCall(server, "submit_result", { match_id: id, winner });

  // 8. Real FT transfers run asynchronously. No second distribution is submitted.
  const settled = await client.getMatch(id);
  if (!settled || !["SettlementPending", "Completed"].includes(settled.state)) throw new Error("Result not confirmed");
  // Ready means the beneficiary must fix registration, then claim_payout(id,index).
  // InFlight means wait for on_payout, never retry by timeout.
  return settled;
}
