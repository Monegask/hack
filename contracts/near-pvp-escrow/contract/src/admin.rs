use crate::*;

#[near]
impl Contract {
    pub fn pause(&mut self) {
        self.assert_admin();
        self.cfg.paused = true;
        emit("paused", json!({}));
    }
    pub fn unpause(&mut self) {
        self.assert_admin();
        require!(!self.cfg.server_frozen, "Replace frozen server after draining");
        self.cfg.paused = false;
        emit("unpaused", json!({}));
    }
    pub fn set_fee(&mut self, fee_bps: u16) {
        self.assert_admin();
        require!(fee_bps <= MAX_FEE_BPS, "Fee exceeds safety cap");
        let at = env::block_timestamp().checked_add(FEE_DELAY_NS).expect("Time overflow");
        self.cfg.pending_fee = Some(PendingFee { fee_bps, activate_at_ns: U64(at) });
        emit("fee_scheduled", json!({"fee_bps": fee_bps, "activate_at_ns": U64(at)}));
    }

    pub fn apply_fee(&mut self) {
        let pending = self.cfg.pending_fee.clone().expect("No pending fee");
        require!(env::block_timestamp() >= pending.activate_at_ns.0, "Fee timelock");
        self.cfg.fee_bps = pending.fee_bps;
        self.cfg.pending_fee = None;
        emit("fee_changed", json!({"fee_bps": self.cfg.fee_bps}));
    }

    pub fn cancel_fee_change(&mut self) {
        self.assert_admin();
        self.cfg.pending_fee = None;
        emit("fee_schedule_cancelled", json!({}));
    }

    /// Stops a compromised runtime account immediately; never redirects USDC.
    pub fn freeze_server(&mut self) {
        self.assert_admin();
        self.cfg.server_frozen = true;
        self.cfg.paused = true;
        emit("server_frozen", json!({}));
    }
    pub fn propose_admin(&mut self, admin: AccountId) {
        self.assert_admin();
        require!(
            admin != self.cfg.server
                && admin != self.cfg.token
                && admin != env::current_account_id(),
            "Invalid admin"
        );
        self.cfg.pending_admin = Some(admin.clone());
        emit("admin_proposed", json!({"admin": admin}));
    }
    pub fn accept_admin(&mut self) {
        require!(
            self.cfg.pending_admin.as_ref() == Some(&env::predecessor_account_id()),
            "Pending admin only"
        );
        self.cfg.admin = self.cfg.pending_admin.take().unwrap();
        emit("admin_changed", json!({"admin": self.cfg.admin}));
    }
    pub fn set_server(&mut self, server: AccountId) {
        self.assert_admin();
        require!(self.can_upgrade(), "Pause and drain before rotating server");
        require!(
            server != self.cfg.admin
                && self.cfg.pending_admin.as_ref() != Some(&server)
                && server != self.cfg.token
                && server != env::current_account_id(),
            "Invalid server"
        );
        self.cfg.server = server;
        self.cfg.server_frozen = false;
        self.cfg.last_heartbeat_ns = U64(env::block_timestamp());
        emit("server_changed", json!({"server": self.cfg.server}));
    }
    pub fn cancel_match_admin(&mut self, match_id: U64) {
        self.assert_admin();
        let m = self.load(match_id.0);
        require!(
            m.prestart() || m.state == MatchState::InProgress,
            "Already settled"
        );
        self.refund(m, "admin_cancel");
    }

    /// Same-layout upgrade only. Future layout changes require a reviewed migration.
    pub fn upgrade(&mut self, code: Base64VecU8) -> Promise {
        self.assert_admin();
        require!(self.can_upgrade(), "Pause and drain before upgrade");
        require!(!code.0.is_empty(), "Empty WASM");
        emit(
            "upgrade_requested",
            json!({"sha256": near_sdk::base64::Engine::encode(&near_sdk::base64::engine::general_purpose::STANDARD, env::sha256(&code.0))}),
        );
        Promise::new(env::current_account_id())
            .deploy_contract(code.0)
            .function_call(
                "migrate",
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(30),
            )
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Private migration"
        );
        let state: Self = env::state_read().expect("Missing state");
        require!(
            state.cfg.state_version == 2 && state.can_upgrade(),
            "Invalid migration state"
        );
        state
    }
}
