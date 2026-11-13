import test from "node:test";
import assert from "node:assert/strict";
import { parseUsdc, depositTransaction } from "./client.ts";
import type { Match } from "./client.ts";

test("USDC input preserves six-decimal precision without Number", () => {
  assert.equal(parseUsdc("25.000001"), "25000001");
  assert.equal(parseUsdc("9007199254740993.123456"), "9007199254740993123456");
  for (const bad of ["0.999999", "1.0000001", "1e6", "-2", "NaN", "01", "1,2", " 1"]) assert.throws(() => parseUsdc(bad));
});

const match = { id: "7", creator: "alice.testnet", opponent: "bob.testnet", state: "AwaitingDeposits", deposited: [false, false], stake: "25000000", revision: "2", fee_bps: 300 } as Match;
const expected = { stake: "25000000", revision: "2", feeBps: 300, opponent: "bob.testnet" };
test("Ready signs an exact NEP-141 deposit and freezes expected revision", () => {
  const tx = depositTransaction("escrow.testnet", "usdc.testnet", "alice.testnet", match, expected);
  assert.equal(tx.receiverId, "usdc.testnet");
  assert.equal(tx.actions[0].params.deposit, "1");
  assert.deepEqual(JSON.parse(tx.actions[0].params.args.msg as string), { match_id: "7", revision: "2", stake: "25000000", fee_bps: 300 });
});
test("client rejects participant, fee, stake, revision, opponent and replay changes", () => {
  for (const altered of [{ ...match, fee_bps: 1000 }, { ...match, stake: "26000000" }, { ...match, revision: "3" }, { ...match, opponent: "mallory.testnet" }, { ...match, deposited: [true, false] as [boolean, boolean] }]) {
    assert.throws(() => depositTransaction("escrow.testnet", "usdc.testnet", "alice.testnet", altered, expected));
  }
  assert.throws(() => depositTransaction("escrow.testnet", "usdc.testnet", "mallory.testnet", match, expected));
});
