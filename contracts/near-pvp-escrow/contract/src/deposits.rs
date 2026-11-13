use crate::*;

#[near]
impl Contract {
    /// NEP-141 receiver: return the entire amount on ANY rejected deposit.
    /// No cross-contract promises here: accepting a deposit and returning zero is atomic.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        if env::predecessor_account_id() != self.cfg.token || self.cfg.paused || msg.len() > 512 {
            return amount;
        }
        let Ok(terms) = serde_json::from_str::<DepositMessage>(&msg) else {
            return amount;
        };
        let Some(mut m) = self.matches.get(&terms.match_id.0) else {
            return amount;
        };
        let Some(index) = m.participant(&sender_id) else {
            return amount;
        };
        if m.state != MatchState::AwaitingDeposits
            || m.expired(env::block_timestamp())
            || m.deposited[index]
            || terms.revision != m.revision
            || terms.stake != m.stake
            || terms.fee_bps != m.fee_bps
            || amount != m.stake
        {
            return amount;
        }
        let Some(accepted) = self.accepted.checked_add(amount.0) else {
            return amount;
        };
        let Some(locked) = self.locked.checked_add(amount.0) else {
            return amount;
        };
        self.accepted = accepted;
        self.locked = locked;
        m.deposited[index] = true;
        m.activity_confirmed = true;
        if m.deposited == [true, true] {
            m.state = MatchState::ReadyToStart;
            m.ready_at_ns = Some(U64(env::block_timestamp()));
        }
        self.save(&m);
        emit(
            "deposit_accepted",
            json!({"match_id": m.id, "sender": sender_id, "amount": amount, "revision": m.revision, "state": m.state, "ready_at_ns": m.ready_at_ns}),
        );
        U128(0)
    }
}
