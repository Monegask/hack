//! Test-only owner-mintable NEP-141 token. Never use for real funds.
use near_contract_standards::{
    fungible_token::{
        FungibleToken,
        core::FungibleTokenCore,
        metadata::{FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider},
        resolver::FungibleTokenResolver,
    },
    storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement},
};
use near_sdk::{AccountId, NearToken, PanicOnDefault, PromiseOrValue, env, json_types::U128, near};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestUsdc {
    token: FungibleToken,
    owner: AccountId,
    paused: bool,
    blocked: near_sdk::collections::LookupSet<AccountId>,
}

#[near]
impl TestUsdc {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            token: FungibleToken::new(b"t"),
            owner,
            paused: false,
            blocked: near_sdk::collections::LookupSet::new(b"b"),
        }
    }
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner);
        self.token.internal_deposit(&account_id, amount.0);
    }
    pub fn set_paused(&mut self, paused: bool) {
        assert_eq!(env::predecessor_account_id(), self.owner);
        self.paused = paused;
    }
    pub fn set_blocked(&mut self, account_id: AccountId, blocked: bool) {
        assert_eq!(env::predecessor_account_id(), self.owner);
        if blocked {
            self.blocked.insert(&account_id);
        } else {
            self.blocked.remove(&account_id);
        }
    }
    /// Fault injection only: simulate FT insolvency, never part of production escrow.
    pub fn burn_for_test(&mut self, account_id: AccountId, amount: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner);
        self.token.internal_withdraw(&account_id, amount.0);
    }
}
impl TestUsdc {
    fn allowed(&self, from: &AccountId, to: &AccountId) {
        assert!(!self.paused, "Test issuer paused");
        assert!(
            !self.blocked.contains(from) && !self.blocked.contains(to),
            "Test issuer blocked"
        );
    }
}
#[near]
impl FungibleTokenCore for TestUsdc {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.allowed(&env::predecessor_account_id(), &receiver_id);
        self.token.ft_transfer(receiver_id, amount, memo)
    }
    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.allowed(&env::predecessor_account_id(), &receiver_id);
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }
    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }
    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}
#[near]
impl FungibleTokenResolver for TestUsdc {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        self.allowed(&sender_id, &receiver_id);
        self.token
            .internal_ft_resolve_transfer(&sender_id, receiver_id, amount)
            .0
            .into()
    }
}
#[near]
impl StorageManagement for TestUsdc {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }
    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.storage_unregister(force)
    }
    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}
#[near]
impl FungibleTokenMetadataProvider for TestUsdc {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.into(),
            name: "Test USDC".into(),
            symbol: "USDC".into(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}
