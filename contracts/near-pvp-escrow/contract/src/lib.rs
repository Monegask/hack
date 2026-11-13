//! Native-USDC escrow; gameplay and winner determination belong to the server.
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, assert_one_yocto,
    collections::LookupMap,
    env,
    json_types::{Base64VecU8, U64, U128},
    near, require,
    serde_json::{self, json},
};

mod admin;
mod deposits;
mod events;
mod matches;
mod models;
mod settlement;
use events::emit;
pub use models::*;

pub const SECOND: u64 = 1_000_000_000;
pub const LOBBY_NS: u64 = 600 * SECOND;
pub const IDLE_NS: u64 = 90 * SECOND;
pub const COUNTDOWN_NS: u64 = 3 * SECOND;
pub const HEARTBEAT_NS: u64 = 1800 * SECOND;
pub const MIN_STAKE: u128 = 1_000_000;
pub const CIRCLE_USDC: &str = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
pub const MAX_FEE_BPS: u16 = 500;
pub const FEE_DELAY_NS: u64 = 48 * 3600 * SECOND;
pub const MAX_GAME_NS: u64 = 6 * 3600 * SECOND;
const MAX_STORED: u64 = 10_000;
const STORAGE_MARGIN: u128 = 4096;
const OPERATING_RESERVE: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    cfg: Config,
    matches: LookupMap<u64, Match>,
    active: LookupMap<AccountId, u64>,
    next_id: u64,
    accepted: u128,
    locked: u128,
    owed: u128,
    paid: u128,
    in_flight: u64,
    live_matches: u64,
    stored_matches: u64,
}

#[near]
impl Contract {
    #[init]
    pub fn new(admin: AccountId, server: AccountId, token: AccountId) -> Self {
        #[cfg(not(any(test, feature = "sandbox")))]
        require!(token.as_str() == CIRCLE_USDC, "Circle native USDC only");
        require!(
            admin != server
                && admin != env::current_account_id()
                && server != env::current_account_id(),
            "Distinct role accounts required"
        );
        require!(
            token != env::current_account_id() && token != admin && token != server,
            "Invalid token account"
        );
        Self {
            cfg: Config {
                admin,
                pending_admin: None,
                server,
                token,
                fee_bps: 300,
                paused: !cfg!(any(test, feature = "sandbox")),
                server_frozen: false,
                pending_fee: None,
                last_heartbeat_ns: U64(env::block_timestamp()),
                state_version: 2,
            },
            matches: LookupMap::new(b"m"),
            active: LookupMap::new(b"a"),
            next_id: 0,
            accepted: 0,
            locked: 0,
            owed: 0,
            paid: 0,
            in_flight: 0,
            live_matches: 0,
            stored_matches: 0,
        }
    }

    pub fn get_config(&self) -> Config {
        self.cfg.clone()
    }
    pub fn get_match(&self, match_id: U64) -> Option<Match> {
        self.matches.get(&match_id.0)
    }
    pub fn get_active_match(&self, account_id: AccountId) -> Option<U64> {
        self.active.get(&account_id).map(U64)
    }
    pub fn get_accounting(&self) -> Accounting {
        Accounting {
            accepted: U128(self.accepted),
            locked: U128(self.locked),
            owed: U128(self.owed),
            paid: U128(self.paid),
            in_flight: U64(self.in_flight),
            live_matches: U64(self.live_matches),
            stored_matches: U64(self.stored_matches),
        }
    }
    pub fn get_claimable_balance(&self, account_id: AccountId, match_id: U64) -> ClaimableBalance {
        let mut out = ClaimableBalance {
            ready: U128(0),
            in_flight: U128(0),
        };
        if let Some(m) = self.matches.get(&match_id.0) {
            for p in &m.payouts {
                if p.receiver == account_id {
                    match p.state {
                        PayoutState::Ready => out.ready.0 = add(out.ready.0, p.amount.0),
                        PayoutState::InFlight => out.in_flight.0 = add(out.in_flight.0, p.amount.0),
                        PayoutState::Paid => (),
                    }
                }
            }
        }
        out
    }
    pub fn can_upgrade(&self) -> bool {
        self.cfg.paused
            && self.live_matches == 0
            && self.locked == 0
            && self.owed == 0
            && self.in_flight == 0
    }

    /// Operational NEAR only; this never credits a USDC account.
    #[payable]
    pub fn fund(&mut self) {}
}

impl Contract {
    fn assert_server(&self) {
        require!(!self.cfg.server_frozen, "Server frozen");
        require!(
            env::predecessor_account_id() == self.cfg.server,
            "Server only"
        );
    }
    fn assert_admin(&self) {
        require!(
            env::predecessor_account_id() == self.cfg.admin,
            "Admin only"
        );
    }
    fn assert_running(&self) {
        require!(!self.cfg.paused, "Paused");
    }
    fn load(&self, id: u64) -> Match {
        self.matches.get(&id).expect("Unknown match")
    }
    fn save(&mut self, m: &Match) {
        self.matches.insert(&m.id.0, m);
    }
    fn assert_player(&self, m: &Match) -> usize {
        m.participant(&env::predecessor_account_id())
            .expect("Participant only")
    }
    fn assert_live_game(&self, m: &Match) {
        require!(m.state == MatchState::InProgress, "Match not in progress");
        require!(
            !m.stale(env::block_timestamp()),
            "Match heartbeat expired; refund only"
        );
    }
    fn release_players(&mut self, m: &Match) {
        if self.active.get(&m.creator) == Some(m.id.0) {
            self.active.remove(&m.creator);
        }
        if let Some(opponent) = &m.opponent
            && self.active.get(opponent) == Some(m.id.0)
        {
            self.active.remove(opponent);
        }
        self.live_matches = self
            .live_matches
            .checked_sub(1)
            .expect("Live count underflow");
    }
    fn storage_available(&self, extra_bytes: u128) -> bool {
        let required = add(
            (env::storage_usage() as u128 + extra_bytes)
                .checked_mul(env::storage_byte_cost().as_yoctonear())
                .expect("Storage overflow"),
            OPERATING_RESERVE,
        );
        env::account_balance().as_yoctonear() > required
    }
}

fn add(a: u128, b: u128) -> u128 {
    a.checked_add(b).expect("Amount overflow")
}
fn fee_for(pot: u128, bps: u16) -> u128 {
    (pot / 10_000) * u128::from(bps) + (pot % 10_000) * u128::from(bps) / 10_000
}

#[cfg(test)]
mod tests;
