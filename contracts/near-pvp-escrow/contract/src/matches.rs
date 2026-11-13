use crate::*;

#[near]
impl Contract {
    pub fn create_lobby(&mut self, creator: AccountId, stake: U128) -> U64 {
        self.assert_server();
        self.assert_running();
        require!(
            creator != env::current_account_id() && creator != self.cfg.token,
            "Invalid player"
        );
        require!(
            stake.0 >= MIN_STAKE && stake.0 <= u128::MAX / 2,
            "Invalid stake"
        );
        require!(self.active.get(&creator).is_none(), "Player already active");
        require!(
            self.stored_matches < MAX_STORED
                && self.storage_available(STORAGE_MARGIN * (u128::from(self.stored_matches) + 1)),
            "Fund NEAR storage or prune history"
        );
        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1).expect("Match IDs exhausted");
        let now = env::block_timestamp();
        let m = Match {
            id: U64(id),
            creator: creator.clone(),
            opponent: None,
            stake,
            revision: U64(0),
            fee_bps: self.cfg.fee_bps,
            fee_receiver: self.cfg.admin.clone(),
            created_at_ns: U64(now),
            deadline_ns: U64(now.checked_add(LOBBY_NS).expect("Time overflow")),
            joined_at_ns: None,
            activity_confirmed: false,
            deposited: [false; 2],
            ready_at_ns: None,
            last_heartbeat_ns: None,
            game_deadline_ns: None,
            state: MatchState::LobbyOpen,
            winner: None,
            cancel_requester: None,
            cancel_nonce: U64(0),
            payouts: [
                Payout::new(creator.clone(), 0),
                Payout::new(self.cfg.admin.clone(), 0),
            ],
        };
        self.active.insert(&creator, &id);
        self.live_matches += 1;
        self.stored_matches += 1;
        self.save(&m);
        emit("lobby_created", json!({"match": m}));
        U64(id)
    }

    pub fn bind_opponent(&mut self, match_id: U64, opponent: AccountId) {
        self.assert_server();
        self.assert_running();
        let mut m = self.load(match_id.0);
        require!(
            m.state == MatchState::LobbyOpen && !m.expired(env::block_timestamp()),
            "Lobby closed"
        );
        require!(
            opponent != m.creator
                && opponent != env::current_account_id()
                && opponent != self.cfg.token,
            "Invalid opponent"
        );
        require!(
            self.active.get(&opponent).is_none(),
            "Player already active"
        );
        self.active.insert(&opponent, &match_id.0);
        m.opponent = Some(opponent);
        m.joined_at_ns = Some(U64(env::block_timestamp()));
        m.state = MatchState::AwaitingDeposits;
        self.save(&m);
        emit(
            "opponent_bound",
            json!({"match_id": m.id, "opponent": m.opponent, "joined_at_ns": m.joined_at_ns}),
        );
    }

    /// Called only for an accepted Raise. Rejected proposals do not change chain state.
    pub fn update_stake(&mut self, match_id: U64, stake: U128) {
        self.assert_server();
        self.assert_running();
        let mut m = self.load(match_id.0);
        require!(
            m.state == MatchState::AwaitingDeposits && !m.expired(env::block_timestamp()),
            "Lobby closed"
        );
        require!(m.deposited == [false; 2], "Stake frozen");
        require!(
            stake.0 > m.stake.0 && stake.0 <= u128::MAX / 2,
            "Raise must increase stake"
        );
        m.stake = stake;
        m.revision.0 = m.revision.0.checked_add(1).expect("Revision exhausted");
        m.activity_confirmed = true;
        self.save(&m);
        emit(
            "stake_updated",
            json!({"match_id": m.id, "revision": m.revision, "stake": m.stake}),
        );
    }

    /// The server attests to the joined player's off-chain meaningful action.
    pub fn record_activity(&mut self, match_id: U64) {
        self.assert_server();
        let mut m = self.load(match_id.0);
        require!(
            m.state == MatchState::AwaitingDeposits && !m.expired(env::block_timestamp()),
            "Lobby closed"
        );
        m.activity_confirmed = true;
        self.save(&m);
        emit("activity_confirmed", json!({"match_id": m.id}));
    }

    pub fn start_match(&mut self, match_id: U64) {
        self.assert_server();
        self.assert_running();
        let mut m = self.load(match_id.0);
        let now = env::block_timestamp();
        require!(
            m.state == MatchState::ReadyToStart && !m.expired(now),
            "Match not ready or expired"
        );
        require!(
            now >= m
                .ready_at_ns
                .expect("Missing ready time")
                .0
                .checked_add(COUNTDOWN_NS)
                .expect("Time overflow"),
            "Countdown not elapsed"
        );
        require!(
            now < self.cfg.last_heartbeat_ns.0.saturating_add(HEARTBEAT_NS),
            "Server heartbeat expired"
        );
        m.state = MatchState::InProgress;
        m.last_heartbeat_ns = Some(U64(now));
        m.game_deadline_ns = Some(U64(now.checked_add(MAX_GAME_NS).expect("Time overflow")));
        self.save(&m);
        emit(
            "match_started",
            json!({"match_id": m.id, "started_at_ns": U64(now)}),
        );
    }

    pub fn heartbeat(&mut self, match_ids: Vec<U64>) {
        self.assert_server();
        require!(match_ids.len() <= 32, "At most 32 matches per heartbeat");
        let now = env::block_timestamp();
        self.cfg.last_heartbeat_ns = U64(now);
        let mut updated = Vec::new();
        for id in match_ids {
            if let Some(mut m) = self.matches.get(&id.0)
                && m.state == MatchState::InProgress
                && !m.stale(now)
            {
                m.last_heartbeat_ns = Some(U64(now));
                self.save(&m);
                updated.push(id);
            }
        }
        emit("heartbeat", json!({"at_ns": U64(now), "updated": updated}));
    }

    #[payable]
    pub fn cancel_unstarted_match(&mut self, match_id: U64) {
        assert_one_yocto();
        let m = self.load(match_id.0);
        self.assert_player(&m);
        require!(m.prestart(), "Already started or settled");
        self.refund(m, "player_cancel");
    }

    pub fn cancel_expired_lobby(&mut self, match_id: U64) {
        let m = self.load(match_id.0);
        require!(
            m.prestart() && m.expired(env::block_timestamp()),
            "Lobby not expired"
        );
        self.refund(m, "lobby_timeout");
    }

    #[payable]
    pub fn request_mutual_cancel(&mut self, match_id: U64) -> U64 {
        assert_one_yocto();
        let mut m = self.load(match_id.0);
        self.assert_player(&m);
        self.assert_live_game(&m);
        require!(
            m.cancel_requester.is_none(),
            "Cancellation already requested"
        );
        m.cancel_nonce.0 = m.cancel_nonce.0.checked_add(1).expect("Nonce exhausted");
        m.cancel_requester = Some(env::predecessor_account_id());
        self.save(&m);
        emit(
            "cancel_requested",
            json!({"match_id": m.id, "requester": m.cancel_requester, "nonce": m.cancel_nonce}),
        );
        m.cancel_nonce
    }

    #[payable]
    pub fn confirm_mutual_cancel(&mut self, match_id: U64, nonce: U64) {
        assert_one_yocto();
        let m = self.load(match_id.0);
        self.assert_player(&m);
        require!(m.state == MatchState::InProgress, "Match not in progress");
        require!(
            m.cancel_nonce == nonce
                && m.cancel_requester
                    .as_ref()
                    .is_some_and(|p| p != &env::predecessor_account_id()),
            "No matching opponent request"
        );
        self.refund(m, "mutual_cancel");
    }

    #[payable]
    pub fn reject_mutual_cancel(&mut self, match_id: U64, nonce: U64) {
        assert_one_yocto();
        let mut m = self.load(match_id.0);
        self.assert_player(&m);
        require!(m.state == MatchState::InProgress, "Match not in progress");
        require!(
            m.cancel_nonce == nonce
                && m.cancel_requester
                    .as_ref()
                    .is_some_and(|p| p != &env::predecessor_account_id()),
            "No matching opponent request"
        );
        m.cancel_requester = None;
        self.save(&m);
        emit("cancel_rejected", json!({"match_id": m.id, "nonce": nonce}));
    }

    #[payable]
    pub fn forfeit_match(&mut self, match_id: U64) {
        assert_one_yocto();
        let m = self.load(match_id.0);
        let index = self.assert_player(&m);
        self.assert_live_game(&m);
        let winner = if index == 0 {
            m.opponent.clone().expect("Missing opponent")
        } else {
            m.creator.clone()
        };
        self.settle(m, winner, "forfeit");
    }

    #[payable]
    pub fn request_emergency_refund(&mut self, match_id: U64) {
        assert_one_yocto();
        let m = self.load(match_id.0);
        self.assert_player(&m);
        require!(
            m.state == MatchState::InProgress
                && (self.cfg.server_frozen || m.stale(env::block_timestamp())),
            "Emergency refund unavailable"
        );
        self.refund(m, "heartbeat_timeout");
    }

    pub fn prune_match(&mut self, match_id: U64) {
        let m = self.load(match_id.0);
        require!(
            matches!(m.state, MatchState::Completed | MatchState::Cancelled) && m.all_paid(),
            "Unsettled obligations"
        );
        self.matches.remove(&match_id.0);
        self.stored_matches -= 1;
        emit("match_pruned", json!({"match_id": match_id}));
    }
}
