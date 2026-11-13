use crate::*;

#[near]
impl Contract {
    pub fn submit_result(&mut self, match_id: U64, winner: AccountId) {
        self.assert_server();
        let m = self.load(match_id.0);
        self.assert_live_game(&m);
        require!(
            m.participant(&winner).is_some(),
            "Winner must be a participant"
        );
        self.settle(m, winner, "server_result");
    }

    /// Only the fixed beneficiary may retry; a concurrent or repeated claim is a no-op.
    #[payable]
    pub fn claim_payout(&mut self, match_id: U64, index: u8) -> bool {
        assert_one_yocto();
        require!(index < 2, "Invalid payout index");
        let m = self.load(match_id.0);
        require!(
            env::predecessor_account_id() == m.payouts[index as usize].receiver,
            "Beneficiary only"
        );
        self.dispatch(match_id.0, index as usize)
    }

    #[private]
    pub fn on_payout(&mut self, match_id: U64, index: u8, attempt: U64) -> bool {
        // Explicit checks also protect direct Rust callers; #[private] protects the ABI.
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Private callback"
        );
        require!(
            env::promise_results_count() == 1,
            "Expected one promise result"
        );
        require!(index < 2, "Invalid payout index");
        let Some(mut m) = self.matches.get(&match_id.0) else {
            return false;
        };
        let p = &mut m.payouts[index as usize];
        if p.state != PayoutState::InFlight || p.attempt != attempt {
            return false;
        }
        let success = !matches!(
            env::promise_result_checked(0, 64),
            Err(near_sdk::PromiseError::Failed)
        );
        self.in_flight = self
            .in_flight
            .checked_sub(1)
            .expect("Flight count underflow");
        if success {
            p.state = PayoutState::Paid;
            self.owed = self.owed.checked_sub(p.amount.0).expect("Owed underflow");
            self.paid = add(self.paid, p.amount.0);
        } else {
            p.state = PayoutState::Ready;
        }
        if m.state == MatchState::SettlementPending && m.all_paid() {
            m.state = MatchState::Completed;
        }
        self.save(&m);
        emit(
            "payout_resolved",
            json!({"match_id": match_id, "index": index, "attempt": attempt, "success": success, "state": m.state}),
        );
        success
    }
}

impl Contract {
    pub(crate) fn settle(&mut self, mut m: Match, winner: AccountId, reason: &str) {
        require!(
            m.state == MatchState::InProgress && m.deposited == [true; 2],
            "Invalid settlement"
        );
        let pot = m.stake.0.checked_mul(2).expect("Pot overflow");
        let fee = fee_for(pot, m.fee_bps);
        m.payouts = [
            Payout::new(winner.clone(), pot - fee),
            Payout::new(m.fee_receiver.clone(), fee),
        ];
        m.state = MatchState::SettlementPending;
        m.winner = Some(winner);
        m.cancel_requester = None;
        self.allocate(&m, pot);
        emit(
            "result_recorded",
            json!({"match_id": m.id, "winner": m.winner, "reason": reason, "payouts": m.payouts}),
        );
        self.dispatch_both(m.id.0);
    }

    pub(crate) fn refund(&mut self, mut m: Match, reason: &str) {
        require!(
            m.prestart() || m.state == MatchState::InProgress,
            "Already settled"
        );
        let a = if m.deposited[0] { m.stake.0 } else { 0 };
        let b = if m.deposited[1] { m.stake.0 } else { 0 };
        m.payouts = [
            Payout::new(m.creator.clone(), a),
            Payout::new(m.opponent.clone().unwrap_or_else(|| m.creator.clone()), b),
        ];
        m.state = MatchState::Cancelled;
        m.cancel_requester = None;
        self.allocate(&m, add(a, b));
        emit(
            "match_cancelled",
            json!({"match_id": m.id, "reason": reason, "payouts": m.payouts}),
        );
        self.dispatch_both(m.id.0);
    }

    fn allocate(&mut self, m: &Match, amount: u128) {
        self.locked = self.locked.checked_sub(amount).expect("Locked underflow");
        self.owed = add(self.owed, amount);
        self.release_players(m);
        self.save(m);
    }

    fn dispatch_both(&mut self, id: u64) {
        self.dispatch(id, 0);
        self.dispatch(id, 1);
    }

    fn dispatch(&mut self, id: u64, index: usize) -> bool {
        let mut m = self.load(id);
        if !matches!(
            m.state,
            MatchState::SettlementPending | MatchState::Cancelled
        ) {
            return false;
        }
        let p = &mut m.payouts[index];
        if p.state != PayoutState::Ready {
            return false;
        }
        // Preserve Ready obligations if the caller supplied insufficient execution resources.
        let remaining = env::prepaid_gas()
            .as_gas()
            .saturating_sub(env::used_gas().as_gas());
        if remaining < Gas::from_tgas(65).as_gas() || !self.storage_available(0) {
            emit("payout_deferred", json!({"match_id": m.id, "index": index}));
            return false;
        }
        p.attempt.0 = p.attempt.0.checked_add(1).expect("Attempt exhausted");
        p.state = PayoutState::InFlight;
        let receiver = p.receiver.clone();
        let amount = p.amount;
        let attempt = p.attempt;
        self.in_flight += 1;
        self.save(&m); // State-before-promise; callbacks can never double allocate.
        let transfer = Promise::new(self.cfg.token.clone()).function_call(
            "ft_transfer", serde_json::to_vec(&json!({"receiver_id": receiver, "amount": amount, "memo": format!("escrow:{id}:{index}")})).unwrap(),
            NearToken::from_yoctonear(1), Gas::from_tgas(25));
        transfer
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_payout",
                    serde_json::to_vec(
                        &json!({"match_id": U64(id), "index": index as u8, "attempt": attempt}),
                    )
                    .unwrap(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(20),
                ),
            )
            .detach();
        emit(
            "payout_dispatched",
            json!({"match_id": m.id, "index": index, "attempt": attempt, "receiver": receiver, "amount": amount}),
        );
        true
    }
}
