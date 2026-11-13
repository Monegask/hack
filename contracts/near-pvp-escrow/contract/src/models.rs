use near_sdk::{
    AccountId,
    json_types::{U64, U128},
    near,
};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MatchState {
    LobbyOpen,
    AwaitingDeposits,
    ReadyToStart,
    InProgress,
    SettlementPending,
    Completed,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PayoutState {
    Ready,
    InFlight,
    Paid,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Payout {
    pub receiver: AccountId,
    pub amount: U128,
    pub state: PayoutState,
    pub attempt: U64,
}

impl Payout {
    pub fn new(receiver: AccountId, amount: u128) -> Self {
        Self {
            receiver,
            amount: U128(amount),
            state: if amount == 0 {
                PayoutState::Paid
            } else {
                PayoutState::Ready
            },
            attempt: U64(0),
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Match {
    pub id: U64,
    pub creator: AccountId,
    pub opponent: Option<AccountId>,
    pub stake: U128,
    pub revision: U64,
    pub fee_bps: u16,
    pub fee_receiver: AccountId,
    pub created_at_ns: U64,
    pub deadline_ns: U64,
    pub joined_at_ns: Option<U64>,
    pub activity_confirmed: bool,
    pub deposited: [bool; 2],
    pub ready_at_ns: Option<U64>,
    pub last_heartbeat_ns: Option<U64>,
    pub game_deadline_ns: Option<U64>,
    pub state: MatchState,
    pub winner: Option<AccountId>,
    pub cancel_requester: Option<AccountId>,
    pub cancel_nonce: U64,
    pub payouts: [Payout; 2],
}

impl Match {
    pub fn participant(&self, account: &AccountId) -> Option<usize> {
        if &self.creator == account {
            Some(0)
        } else if self.opponent.as_ref() == Some(account) {
            Some(1)
        } else {
            None
        }
    }
    pub fn prestart(&self) -> bool {
        matches!(
            self.state,
            MatchState::LobbyOpen | MatchState::AwaitingDeposits | MatchState::ReadyToStart
        )
    }
    pub fn expired(&self, now: u64) -> bool {
        now >= self.deadline_ns.0
            || (!self.activity_confirmed
                && !self.deposited.iter().any(|x| *x)
                && self
                    .joined_at_ns
                    .is_some_and(|t| now >= t.0.saturating_add(crate::IDLE_NS)))
    }
    pub fn stale(&self, now: u64) -> bool {
        self.game_deadline_ns.is_some_and(|t| now >= t.0)
            || self.last_heartbeat_ns
            .is_some_and(|t| now >= t.0.saturating_add(crate::HEARTBEAT_NS))
    }
    pub fn all_paid(&self) -> bool {
        self.payouts.iter().all(|p| p.state == PayoutState::Paid)
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    pub admin: AccountId,
    pub pending_admin: Option<AccountId>,
    pub server: AccountId,
    pub token: AccountId,
    pub fee_bps: u16,
    pub paused: bool,
    pub server_frozen: bool,
    pub pending_fee: Option<PendingFee>,
    pub last_heartbeat_ns: U64,
    pub state_version: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct PendingFee {
    pub fee_bps: u16,
    pub activate_at_ns: U64,
}

#[near(serializers = [json])]
#[derive(Debug)]
#[serde(deny_unknown_fields)]
pub struct DepositMessage {
    pub match_id: U64,
    pub revision: U64,
    pub stake: U128,
    pub fee_bps: u16,
}

#[near(serializers = [json])]
pub struct Accounting {
    pub accepted: U128,
    pub locked: U128,
    pub owed: U128,
    pub paid: U128,
    pub in_flight: U64,
    pub live_matches: U64,
    pub stored_matches: U64,
}

#[near(serializers = [json])]
pub struct ClaimableBalance {
    pub ready: U128,
    pub in_flight: U128,
}
