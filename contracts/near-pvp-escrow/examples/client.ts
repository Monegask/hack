/** Wallet adapter compatible with a Wallet Selector FunctionCall transaction.
 * The backend implements this interface using its restricted server signer.
 * No private keys or signer implementation belong in browser code.
 */
export interface Wallet {
  accountId: string;
  signAndSendTransaction(tx: Transaction): Promise<{ transaction: { hash: string } }>;
}
export interface Transaction {
  receiverId: string;
  actions: Array<{ type: "FunctionCall"; params: {
    methodName: string; args: Record<string, unknown>; gas: string; deposit: string;
  } }>;
}
export interface Payout {
  receiver: string; amount: string; state: "Ready" | "InFlight" | "Paid"; attempt: string;
}
export interface Match {
  id: string; creator: string; opponent: string | null; stake: string; revision: string;
  fee_bps: number; fee_receiver: string; deposited: [boolean, boolean];
  created_at_ns: string; deadline_ns: string; ready_at_ns: string | null;
  last_heartbeat_ns: string | null; winner: string | null;
  state: "LobbyOpen" | "AwaitingDeposits" | "ReadyToStart" | "InProgress" | "SettlementPending" | "Completed" | "Cancelled";
  payouts: [Payout, Payout];
}
export interface Config { token: string; server: string; admin: string; fee_bps: number; paused: boolean }

const MAX_STAKE = ((1n << 128n) - 1n) / 2n;
export function parseUsdc(input: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(input)) throw new Error("USDC requires a plain decimal with at most 6 places");
  const [whole, fractional = ""] = input.split(".");
  const value = BigInt(whole) * 1_000_000n + BigInt(fractional.padEnd(6, "0"));
  if (value < 1_000_000n || value > MAX_STAKE) throw new Error("Stake outside contract range");
  return value.toString();
}

export function callTransaction(receiverId: string, methodName: string, args: Record<string, unknown>, deposit = "0", gas = "250000000000000"): Transaction {
  return { receiverId, actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }] };
}

/** expectedTerms must come from the terms the USER accepted in the game UI. */
export function depositTransaction(escrow: string, token: string, player: string, match: Match,
  expectedTerms: { stake: string; revision: string; feeBps: number; opponent: string }): Transaction {
  if (match.state !== "AwaitingDeposits" || ![match.creator, match.opponent].includes(player)) throw new Error("Not an eligible player");
  const index = match.creator === player ? 0 : 1;
  const other = index === 0 ? match.opponent : match.creator;
  if (match.deposited[index] || other !== expectedTerms.opponent || match.stake !== expectedTerms.stake || match.revision !== expectedTerms.revision || match.fee_bps !== expectedTerms.feeBps) throw new Error("Terms changed or deposit already accepted");
  return callTransaction(token, "ft_transfer_call", {
    receiver_id: escrow, amount: match.stake,
    msg: JSON.stringify({ match_id: match.id, revision: match.revision, stake: match.stake, fee_bps: match.fee_bps })
  }, "1", "150000000000000");
}

export class EscrowClient {
  rpcUrl: string;
  escrow: string;
  constructor(rpcUrl: string, escrow: string) { this.rpcUrl = rpcUrl; this.escrow = escrow; }

  async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.rpcUrl, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "escrow", method, params }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const value = await response.json() as { result?: T; error?: unknown };
    if (value.error || value.result === undefined) throw new Error(`RPC error: ${JSON.stringify(value.error)}`);
    return value.result;
  }

  async view<T>(contract: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
    const argsBytes = new TextEncoder().encode(JSON.stringify(args));
    const result = await this.rpc<{ result: number[] }>("query", { request_type: "call_function", account_id: contract,
      method_name: method, args_base64: btoa(String.fromCharCode(...argsBytes)), finality: "final" });
    return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T;
  }
  getMatch(id: string): Promise<Match | null> { return this.view(this.escrow, "get_match", { match_id: id }); }

  async finalTransaction(hash: string, signer: string): Promise<Record<string, unknown>> {
    const result = await this.rpc<Record<string, unknown>>("tx", { tx_hash: hash, sender_account_id: signer, wait_until: "FINAL" });
    const status = result.status as Record<string, unknown> | undefined;
    if (!status || !("SuccessValue" in status || "SuccessReceiptId" in status)) throw new Error(`Transaction failed: ${JSON.stringify(status)}`);
    return result;
  }

  async send(wallet: Wallet, tx: Transaction): Promise<Record<string, unknown>> {
    const outcome = await wallet.signAndSendTransaction(tx);
    return this.finalTransaction(outcome.transaction.hash, wallet.accountId);
  }

  async serverCall(server: Wallet, method: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.send(server, callTransaction(this.escrow, method, args));
  }

  async chainTimeNs(): Promise<bigint> {
    const block = await this.rpc<{ header: { timestamp_nanosec: string } }>("block", { finality: "final" });
    return BigInt(block.header.timestamp_nanosec);
  }

  async waitCountdown(id: string): Promise<void> {
    for (;;) {
      const m = await this.getMatch(id);
      if (!m || m.state !== "ReadyToStart" || !m.ready_at_ns) throw new Error("Match no longer ready");
      const now = await this.chainTimeNs();
      if (now >= BigInt(m.deadline_ns)) throw new Error("Lobby deadline reached; cancel and refund");
      if (now >= BigInt(m.ready_at_ns) + 3_000_000_000n) return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
