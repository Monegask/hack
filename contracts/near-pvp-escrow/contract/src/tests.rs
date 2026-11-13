use super::*;
use near_sdk::{
    PromiseResult,
    test_utils::{VMContextBuilder, get_created_receipts, get_logs},
    testing_env,
};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}
fn context(who: &str, ns: u64, deposit: u128) -> VMContextBuilder {
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(account("escrow.test.near"))
        .predecessor_account_id(account(who))
        .signer_account_id(account(who))
        .block_timestamp(ns)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100))
        .prepaid_gas(Gas::from_tgas(300));
    ctx
}
fn call(who: &str, sec: u64) {
    testing_env!(context(who, sec * SECOND, 0).build());
}
fn player(who: &str, sec: u64) {
    testing_env!(context(who, sec * SECOND, 1).build());
}
fn fresh() -> Contract {
    near_sdk::mock::with_mocked_blockchain(|b| {
        b.take_storage();
    });
    call("admin.near", 0);
    Contract::new(
        account("admin.near"),
        account("server.near"),
        account("usdc.near"),
    )
}
fn lobby(c: &mut Contract, stake: u128) -> U64 {
    call("server.near", 0);
    let id = c.create_lobby(account("alice.near"), U128(stake));
    c.bind_opponent(id, account("bob.near"));
    id
}
fn message(c: &Contract, id: U64) -> String {
    let m = c.get_match(id).unwrap();
    serde_json::to_string(&DepositMessage {
        match_id: id,
        revision: m.revision,
        stake: m.stake,
        fee_bps: m.fee_bps,
    })
    .unwrap()
}
fn deposit(c: &mut Contract, id: U64, who: &str, sec: u64) -> U128 {
    call("usdc.near", sec);
    let amount = c.get_match(id).unwrap().stake;
    c.ft_on_transfer(account(who), amount, message(c, id))
}
fn ready(c: &mut Contract, stake: u128) -> U64 {
    let id = lobby(c, stake);
    assert_eq!(deposit(c, id, "alice.near", 1), U128(0));
    assert_eq!(deposit(c, id, "bob.near", 2), U128(0));
    id
}
fn game(c: &mut Contract, stake: u128) -> U64 {
    let id = ready(c, stake);
    call("server.near", 5);
    c.start_match(id);
    id
}
fn reject(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}
fn invariant(c: &Contract) {
    assert_eq!(c.accepted, c.locked + c.owed + c.paid);
}
fn resolve(c: &mut Contract, id: U64, index: u8, attempt: u64, ok: bool) -> bool {
    let result = if ok {
        PromiseResult::Successful(vec![])
    } else {
        PromiseResult::Failed
    };
    testing_env!(
        context("escrow.test.near", 10 * SECOND, 0).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
    let success = c.on_payout(id, index, U64(attempt));
    invariant(c);
    success
}

#[test]
fn normal_match_real_transfer_receipts_and_callbacks() {
    let mut c = fresh();
    let id = game(&mut c, 10_000_000);
    call("server.near", 6);
    c.submit_result(id, account("alice.near"));
    let m = c.get_match(id).unwrap();
    assert_eq!(m.state, MatchState::SettlementPending);
    assert_eq!(m.payouts[0].amount.0, 19_400_000);
    assert_eq!(m.payouts[1].amount.0, 600_000);
    assert_eq!(c.locked, 0);
    assert_eq!(c.owed, 20_000_000);
    assert_eq!(c.in_flight, 2);
    assert_eq!(get_created_receipts().len(), 4); // two transfers, two callbacks
    assert!(resolve(&mut c, id, 0, 1, true));
    assert!(resolve(&mut c, id, 1, 1, true));
    assert_eq!(c.get_match(id).unwrap().state, MatchState::Completed);
    assert_eq!(c.owed, 0);
    assert_eq!(c.paid, 20_000_000);
    assert!(get_logs().iter().any(|x| x.starts_with("EVENT_JSON:")));
}

#[test]
fn fee_edges_and_safe_u128_rounding() {
    for fee in [0, 300, MAX_FEE_BPS] {
        let mut c = fresh();
        c.set_fee(fee);
        call("keeper.near", FEE_DELAY_NS / SECOND);
        c.apply_fee();
        let id = game(&mut c, 1_000_001);
        call("server.near", 6);
        c.submit_result(id, account("bob.near"));
        let m = c.get_match(id).unwrap();
        assert_eq!(m.payouts[0].amount.0 + m.payouts[1].amount.0, 2_000_002);
        assert_eq!(m.payouts[1].amount.0, fee_for(2_000_002, fee));
        assert_eq!(c.in_flight, if fee == 0 { 1 } else { 2 });
        invariant(&c);
    }
    assert_eq!(fee_for(u128::MAX, 10_000), u128::MAX);
    assert_eq!(
        fee_for(u128::MAX, 300),
        u128::MAX / 100 * 3 + (u128::MAX % 100 * 3) / 100
    );
}

#[test]
fn accepted_raise_changes_revision_rejected_raise_never_reaches_chain() {
    let mut c = fresh();
    let id = lobby(&mut c, 10_000_000);
    let old = message(&c, id);
    c.update_stake(id, U128(25_000_000));
    assert_eq!(c.get_match(id).unwrap().revision.0, 1);
    call("usdc.near", 1);
    assert_eq!(
        c.ft_on_transfer(account("alice.near"), U128(10_000_000), old),
        U128(10_000_000)
    );
    assert_eq!(deposit(&mut c, id, "alice.near", 2), U128(0));
    call("server.near", 3);
    reject(|| c.update_stake(id, U128(30_000_000)));
    assert_eq!(c.get_match(id).unwrap().stake.0, 25_000_000);
    invariant(&c);
}

#[test]
fn wrong_token_amount_user_revision_fee_message_and_duplicate_refund() {
    let mut c = fresh();
    let id = lobby(&mut c, MIN_STAKE);
    let msg = message(&c, id);
    call("fake-token.near", 1);
    assert_eq!(
        c.ft_on_transfer(account("alice.near"), U128(MIN_STAKE), msg.clone()),
        U128(MIN_STAKE)
    );
    call("usdc.near", 1);
    for (who, amount, msg) in [
        ("alice.near", MIN_STAKE - 1, msg.clone()),
        ("mallory.near", MIN_STAKE, msg.clone()),
        ("alice.near", MIN_STAKE, "{}".into()),
        (
            "alice.near",
            MIN_STAKE,
            r#"{"match_id":"0","revision":"99","stake":"1000000","fee_bps":300}"#.into(),
        ),
        (
            "alice.near",
            MIN_STAKE,
            r#"{"match_id":"0","revision":"0","stake":"1000000","fee_bps":0}"#.into(),
        ),
        (
            "alice.near",
            MIN_STAKE,
            r#"{"match_id":"999","revision":"0","stake":"1000000","fee_bps":300}"#.into(),
        ),
    ] {
        assert_eq!(
            c.ft_on_transfer(account(who), U128(amount), msg),
            U128(amount)
        );
    }
    assert_eq!(c.accepted, 0);
    assert_eq!(deposit(&mut c, id, "alice.near", 1), U128(0));
    assert_eq!(deposit(&mut c, id, "alice.near", 2), U128(MIN_STAKE));
    invariant(&c);
}

#[test]
fn deposits_bound_to_match_not_signer_or_other_match() {
    let mut c = fresh();
    let id = lobby(&mut c, MIN_STAKE);
    let id2 = c.create_lobby(account("carol.near"), U128(MIN_STAKE));
    c.bind_opponent(id2, account("dave.near"));
    call("usdc.near", 1);
    assert_eq!(
        c.ft_on_transfer(account("alice.near"), U128(MIN_STAKE), message(&c, id2)),
        U128(MIN_STAKE)
    );
    assert_eq!(deposit(&mut c, id, "alice.near", 1), U128(0));
    invariant(&c);
}

#[test]
fn one_active_match_and_no_self_opponent() {
    let mut c = fresh();
    call("server.near", 0);
    let id = c.create_lobby(account("alice.near"), U128(MIN_STAKE));
    reject(|| {
        c.create_lobby(account("alice.near"), U128(MIN_STAKE));
    });
    reject(|| c.bind_opponent(id, account("alice.near")));
    c.bind_opponent(id, account("bob.near"));
    reject(|| {
        c.create_lobby(account("bob.near"), U128(MIN_STAKE));
    });
}

#[test]
fn cancel_zero_one_or_two_deposits() {
    for count in 0..=2 {
        let mut c = fresh();
        let id = lobby(&mut c, MIN_STAKE);
        if count >= 1 {
            deposit(&mut c, id, "alice.near", 1);
        }
        if count == 2 {
            deposit(&mut c, id, "bob.near", 2);
        }
        player("alice.near", 3);
        c.cancel_unstarted_match(id);
        assert_eq!(c.get_match(id).unwrap().state, MatchState::Cancelled);
        assert_eq!(c.owed, count * MIN_STAKE);
        assert_eq!(c.locked, 0);
        assert_eq!(c.get_active_match(account("alice.near")), None);
        assert_eq!(c.get_active_match(account("bob.near")), None);
        reject(|| c.cancel_unstarted_match(id));
        assert_eq!(deposit(&mut c, id, "alice.near", 4), U128(MIN_STAKE));
        invariant(&c);
    }
}

#[test]
fn exact_600_second_deadline_rejects_deposit_and_start() {
    let mut c = fresh();
    let id = ready(&mut c, MIN_STAKE);
    call("server.near", 600);
    reject(|| c.start_match(id));
    c.cancel_expired_lobby(id);
    assert_eq!(c.locked, 0);
    invariant(&c);
    let mut c = fresh();
    let id = lobby(&mut c, MIN_STAKE);
    call("server.near", 50);
    c.record_activity(id);
    assert_eq!(deposit(&mut c, id, "alice.near", 600), U128(MIN_STAKE));
    c.cancel_expired_lobby(id);
    invariant(&c);
}

#[test]
fn countdown_nanosecond_boundary() {
    let mut c = fresh();
    let id = ready(&mut c, MIN_STAKE);
    testing_env!(context("server.near", 5 * SECOND - 1, 0).build());
    reject(|| c.start_match(id));
    call("server.near", 5);
    c.start_match(id);
    assert_eq!(c.get_match(id).unwrap().state, MatchState::InProgress);
}

#[test]
fn inactivity_expires_at_90_seconds_but_activity_or_either_deposit_disables_it() {
    let mut c = fresh();
    let id = lobby(&mut c, MIN_STAKE);
    call("keeper.near", 89);
    reject(|| c.cancel_expired_lobby(id));
    call("keeper.near", 90);
    c.cancel_expired_lobby(id);
    for action in [0, 1, 2] {
        let mut c = fresh();
        let id = lobby(&mut c, MIN_STAKE);
        match action {
            0 => {
                call("server.near", 10);
                c.record_activity(id);
            }
            1 => {
                deposit(&mut c, id, "alice.near", 10);
            }
            _ => {
                deposit(&mut c, id, "bob.near", 10);
            }
        }
        call("keeper.near", 100);
        reject(|| c.cancel_expired_lobby(id));
        call("keeper.near", 600);
        c.cancel_expired_lobby(id);
        invariant(&c);
    }
}

#[test]
fn activity_raise_deposits_do_not_extend_original_deadline() {
    let mut c = fresh();
    let id = lobby(&mut c, MIN_STAKE);
    call("server.near", 80);
    c.update_stake(id, U128(2 * MIN_STAKE));
    deposit(&mut c, id, "alice.near", 500);
    deposit(&mut c, id, "bob.near", 599);
    call("server.near", 600);
    reject(|| c.start_match(id));
    assert_eq!(c.get_match(id).unwrap().deadline_ns.0, 600 * SECOND);
}

#[test]
fn cancel_start_race_both_transaction_orders() {
    let mut c = fresh();
    let id = ready(&mut c, MIN_STAKE);
    player("bob.near", 5);
    c.cancel_unstarted_match(id);
    call("server.near", 5);
    reject(|| c.start_match(id));
    invariant(&c);
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    player("bob.near", 5);
    reject(|| c.cancel_unstarted_match(id));
    invariant(&c);
}

#[test]
fn absolute_deadline_prevents_indefinite_lock_by_compromised_server() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    for sec in (1000..21_000).step_by(1000) {
        call("server.near", sec);
        c.heartbeat(vec![id]);
    }
    call("server.near", 21_605);
    c.heartbeat(vec![id]);
    reject(|| c.submit_result(id, account("alice.near")));
    player("alice.near", 21_605);
    c.request_emergency_refund(id);
    invariant(&c);
}

#[test]
fn result_requires_server_participant_and_unique_settlement() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    for attacker in ["alice.near", "bob.near", "mallory.near", "admin.near"] {
        call(attacker, 6);
        reject(|| c.submit_result(id, account("alice.near")));
    }
    call("server.near", 6);
    reject(|| c.submit_result(id, account("mallory.near")));
    c.submit_result(id, account("alice.near"));
    reject(|| c.submit_result(id, account("bob.near")));
    call("admin.near", 6);
    reject(|| c.cancel_match_admin(id));
    invariant(&c);
}

#[test]
fn failed_winner_transfer_retries_without_repaying_fee() {
    let mut c = fresh();
    let id = game(&mut c, 10_000_000);
    call("server.near", 6);
    c.submit_result(id, account("alice.near"));
    assert!(!resolve(&mut c, id, 0, 1, false));
    resolve(&mut c, id, 1, 1, true);
    assert_eq!(c.owed, 19_400_000);
    let b = c.get_claimable_balance(account("alice.near"), id);
    assert_eq!(b.ready.0, 19_400_000);
    player("mallory.near", 11);
    reject(|| {
        c.claim_payout(id, 0);
    });
    player("alice.near", 11);
    assert!(c.claim_payout(id, 0));
    assert!(!c.claim_payout(id, 0));
    assert!(!resolve(&mut c, id, 0, 1, true)); // stale callback from first attempt
    assert_eq!(c.owed, 19_400_000);
    resolve(&mut c, id, 0, 2, true);
    player("alice.near", 12);
    assert!(!c.claim_payout(id, 0));
    assert_eq!(c.paid, 20_000_000);
}

#[test]
fn failed_fee_transfer_does_not_block_winner_and_is_claimable() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("server.near", 6);
    c.submit_result(id, account("bob.near"));
    resolve(&mut c, id, 0, 1, true);
    resolve(&mut c, id, 1, 1, false);
    assert_eq!(c.paid, 1_940_000);
    assert_eq!(c.owed, 60_000);
    player("admin.near", 11);
    assert!(c.claim_payout(id, 1));
    resolve(&mut c, id, 1, 2, true);
    assert_eq!(c.owed, 0);
}

#[test]
fn refund_failure_uses_same_safe_retry() {
    let mut c = fresh();
    let id = ready(&mut c, MIN_STAKE);
    player("alice.near", 3);
    c.cancel_unstarted_match(id);
    resolve(&mut c, id, 0, 1, false);
    resolve(&mut c, id, 1, 1, true);
    player("alice.near", 11);
    assert!(c.claim_payout(id, 0));
    resolve(&mut c, id, 0, 2, true);
    assert_eq!(c.get_match(id).unwrap().state, MatchState::Cancelled);
    assert_eq!(c.owed, 0);
}

#[test]
fn forged_callback_and_duplicate_callback_cannot_spend_money() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("server.near", 6);
    c.submit_result(id, account("bob.near"));
    call("mallory.near", 7);
    reject(|| {
        c.on_payout(id, 0, U64(1));
    });
    assert!(resolve(&mut c, id, 0, 1, true));
    let paid = c.paid;
    assert!(!resolve(&mut c, id, 0, 1, true));
    assert_eq!(c.paid, paid);
}

#[test]
fn parallel_claims_while_inflight_create_no_transfer() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("server.near", 6);
    c.submit_result(id, account("bob.near"));
    player("bob.near", 7);
    for _ in 0..10 {
        assert!(!c.claim_payout(id, 0));
    }
    assert!(get_created_receipts().is_empty());
    assert_eq!(c.in_flight, 2);
    invariant(&c);
}

#[test]
fn emergency_refund_exact_30_minutes_and_no_revival_by_global_heartbeat() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    player("alice.near", 1804);
    reject(|| c.request_emergency_refund(id));
    call("server.near", 1805);
    c.heartbeat(vec![id]);
    assert_eq!(
        c.get_match(id).unwrap().last_heartbeat_ns.unwrap().0,
        5 * SECOND
    );
    reject(|| c.submit_result(id, account("alice.near")));
    player("alice.near", 1805);
    c.request_emergency_refund(id);
    reject(|| c.request_emergency_refund(id));
    assert_eq!(c.get_match(id).unwrap().payouts[0].amount.0, MIN_STAKE);
    invariant(&c);
}

#[test]
fn heartbeat_for_other_matches_does_not_protect_stuck_match() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    for sec in [500, 1000, 1500, 1805] {
        call("server.near", sec);
        c.heartbeat(vec![]);
    }
    player("bob.near", 1805);
    c.request_emergency_refund(id);
    invariant(&c);
}

#[test]
fn result_and_emergency_refund_race() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("server.near", 1804);
    c.submit_result(id, account("bob.near"));
    player("alice.near", 1805);
    reject(|| c.request_emergency_refund(id));
    invariant(&c);
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    player("alice.near", 1805);
    c.request_emergency_refund(id);
    call("server.near", 1805);
    reject(|| c.submit_result(id, account("bob.near")));
    invariant(&c);
}

#[test]
fn mutual_cancel_nonce_and_forfeit() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    player("alice.near", 6);
    let nonce = c.request_mutual_cancel(id);
    reject(|| c.confirm_mutual_cancel(id, nonce));
    player("bob.near", 7);
    c.reject_mutual_cancel(id, nonce);
    player("alice.near", 8);
    let next = c.request_mutual_cancel(id);
    assert_ne!(next, nonce);
    player("bob.near", 9);
    reject(|| c.confirm_mutual_cancel(id, nonce));
    c.confirm_mutual_cancel(id, next);
    assert_eq!(c.get_match(id).unwrap().winner, None);
    invariant(&c);
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    player("alice.near", 6);
    c.forfeit_match(id);
    assert_eq!(c.get_match(id).unwrap().winner, Some(account("bob.near")));
    invariant(&c);
}

#[test]
fn pause_blocks_activation_and_deposits_but_not_refunds_results_or_claims() {
    let mut c = fresh();
    let id = ready(&mut c, MIN_STAKE);
    call("admin.near", 3);
    c.pause();
    call("server.near", 5);
    reject(|| c.start_match(id));
    reject(|| {
        c.create_lobby(account("other.near"), U128(MIN_STAKE));
    });
    assert_eq!(deposit(&mut c, id, "bob.near", 5), U128(MIN_STAKE));
    player("alice.near", 6);
    c.cancel_unstarted_match(id);
    resolve(&mut c, id, 0, 1, false);
    player("alice.near", 10);
    assert!(c.claim_payout(id, 0));
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("admin.near", 6);
    c.pause();
    call("server.near", 7);
    c.submit_result(id, account("alice.near"));
    invariant(&c);
}

#[test]
fn commission_and_recipient_snapshot_and_two_step_admin() {
    let mut c = fresh();
    let id = lobby(&mut c, MIN_STAKE);
    call("admin.near", 0);
    c.set_fee(MAX_FEE_BPS);
    call("keeper.near", FEE_DELAY_NS / SECOND);
    c.apply_fee();
    call("admin.near", FEE_DELAY_NS / SECOND);
    c.propose_admin(account("next.near"));
    call("mallory.near", 0);
    reject(|| c.accept_admin());
    call("next.near", 0);
    c.accept_admin();
    let m = c.get_match(id).unwrap();
    assert_eq!(m.fee_bps, 300);
    assert_eq!(m.fee_receiver, account("admin.near"));
    call("server.near", 1);
    let id2 = c.create_lobby(account("carol.near"), U128(MIN_STAKE));
    assert_eq!(c.get_match(id2).unwrap().fee_bps, MAX_FEE_BPS);
    assert_eq!(c.get_match(id2).unwrap().fee_receiver, account("next.near"));
}

#[test]
fn admin_cancel_only_full_refunds_never_redirects() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("admin.near", 6);
    c.cancel_match_admin(id);
    let m = c.get_match(id).unwrap();
    assert_eq!(m.payouts[0].receiver, account("alice.near"));
    assert_eq!(m.payouts[1].receiver, account("bob.near"));
    assert_eq!(m.payouts[0].amount, U128(MIN_STAKE));
    assert_eq!(m.payouts[1].amount, U128(MIN_STAKE));
    player("admin.near", 6);
    reject(|| {
        c.claim_payout(id, 0);
    });
    invariant(&c);
}

#[test]
fn upgrade_gate_requires_pause_no_matches_no_obligations() {
    let mut c = fresh();
    let id = ready(&mut c, MIN_STAKE);
    call("admin.near", 3);
    c.pause();
    assert!(!c.can_upgrade());
    reject(|| {
        c.upgrade(Base64VecU8(vec![1])).detach();
    });
    reject(|| c.set_server(account("newserver.near")));
    c.cancel_match_admin(id);
    assert!(!c.can_upgrade());
    resolve(&mut c, id, 0, 1, true);
    resolve(&mut c, id, 1, 1, true);
    call("admin.near", 11);
    assert!(c.can_upgrade());
    c.set_server(account("newserver.near"));
    c.upgrade(Base64VecU8(vec![0, 97, 115, 109])).detach();
    assert_eq!(get_created_receipts().len(), 1);
    env::state_write(&c);
    call("escrow.test.near", 11);
    let migrated = Contract::migrate();
    assert!(migrated.can_upgrade());
    invariant(&migrated);
}

#[test]
fn prune_only_paid_records_and_never_reuse_ids_or_clear_new_active_match() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("server.near", 6);
    c.submit_result(id, account("alice.near"));
    reject(|| c.prune_match(id));
    let id2 = c.create_lobby(account("alice.near"), U128(MIN_STAKE));
    assert!(id2.0 > id.0);
    resolve(&mut c, id, 0, 1, true);
    resolve(&mut c, id, 1, 1, true);
    call("keeper.near", 11);
    c.prune_match(id);
    assert!(c.get_match(id).is_none());
    assert_eq!(c.get_active_match(account("alice.near")), Some(id2));
    call("usdc.near", 11);
    assert_eq!(
        c.ft_on_transfer(
            account("alice.near"),
            U128(MIN_STAKE),
            r#"{"match_id":"0","revision":"0","stake":"1000000","fee_bps":300}"#.into()
        ),
        U128(MIN_STAKE)
    );
    invariant(&c);
}

#[test]
fn low_gas_defers_transfers_without_losing_obligations() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    let mut ctx = context("server.near", 6 * SECOND, 0);
    ctx.prepaid_gas(Gas::from_tgas(40));
    testing_env!(ctx.build());
    c.submit_result(id, account("alice.near"));
    assert_eq!(c.in_flight, 0);
    assert_eq!(c.owed, 2 * MIN_STAKE);
    assert_eq!(
        c.get_match(id).unwrap().payouts[0].state,
        PayoutState::Ready
    );
    player("alice.near", 7);
    assert!(c.claim_payout(id, 0));
    invariant(&c);
}

#[test]
fn low_near_blocks_storage_and_defers_payouts() {
    let mut c = fresh();
    let mut ctx = context("server.near", 0, 0);
    ctx.account_balance(NearToken::from_yoctonear(1));
    testing_env!(ctx.build());
    reject(|| {
        c.create_lobby(account("alice.near"), U128(MIN_STAKE));
    });
    let id = game(&mut c, MIN_STAKE);
    let mut ctx = context("server.near", 6 * SECOND, 0);
    ctx.account_balance(NearToken::from_yoctonear(1));
    testing_env!(ctx.build());
    c.submit_result(id, account("alice.near"));
    assert_eq!(c.in_flight, 0);
    assert_eq!(c.owed, 2 * MIN_STAKE);
    invariant(&c);
}

#[test]
fn integer_limits_reject_without_corrupting_ledger() {
    let mut c = fresh();
    call("server.near", 0);
    reject(|| {
        c.create_lobby(account("alice.near"), U128(MIN_STAKE - 1));
    });
    reject(|| {
        c.create_lobby(account("alice.near"), U128(u128::MAX));
    });
    let id = lobby(&mut c, u128::MAX / 2);
    deposit(&mut c, id, "alice.near", 1);
    deposit(&mut c, id, "bob.near", 2);
    call("server.near", 5);
    c.start_match(id);
    c.submit_result(id, account("alice.near"));
    invariant(&c);
    let mut c = fresh();
    let id = lobby(&mut c, MIN_STAKE);
    c.accepted = u128::MAX;
    c.paid = u128::MAX;
    assert_eq!(deposit(&mut c, id, "alice.near", 1), U128(MIN_STAKE));
    invariant(&c);
}

#[test]
fn roles_and_native_deposit_protection() {
    let mut c = fresh();
    call("mallory.near", 0);
    reject(|| c.pause());
    reject(|| c.set_fee(0));
    reject(|| c.heartbeat(vec![]));
    call("admin.near", 0);
    reject(|| c.set_fee(10_001));
    let id = ready(&mut c, MIN_STAKE);
    call("alice.near", 3);
    reject(|| c.cancel_unstarted_match(id));
    player("mallory.near", 3);
    reject(|| c.cancel_unstarted_match(id));
}

#[test]
fn oversized_successful_ft_return_is_success_not_a_retry() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("server.near", 6);
    c.submit_result(id, account("alice.near"));
    testing_env!(
        context("escrow.test.near", 10 * SECOND, 0).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![1; 1024])]
    );
    assert!(c.on_payout(id, 0, U64(1)));
    assert_eq!(c.get_match(id).unwrap().payouts[0].state, PayoutState::Paid);
    invariant(&c);
}

#[test]
fn storage_margin_covers_max_length_participants_and_payout_growth() {
    let mut c = fresh();
    call("server.near", 0);
    let before = env::storage_usage();
    let alice = account(&"a".repeat(64));
    let bob = account(&"b".repeat(64));
    let id = c.create_lobby(alice.clone(), U128(MIN_STAKE));
    c.bind_opponent(id, bob.clone());
    call("usdc.near", 1);
    c.ft_on_transfer(alice, U128(MIN_STAKE), message(&c, id));
    c.ft_on_transfer(bob.clone(), U128(MIN_STAKE), message(&c, id));
    call("server.near", 5);
    c.start_match(id);
    c.submit_result(id, bob);
    assert!(u128::from(env::storage_usage().saturating_sub(before)) < STORAGE_MARGIN);
    invariant(&c);
}

#[test]
fn storage_reservations_cover_future_growth_of_all_retained_matches() {
    let c = fresh();
    // Enough for one record's margin but not for a second retained record.
    let mut ctx = context("server.near", 0, 0);
    let current = env::storage_usage() as u128;
    let budget = (current + 7000) * env::storage_byte_cost().as_yoctonear() + OPERATING_RESERVE;
    ctx.account_balance(NearToken::from_yoctonear(budget));
    testing_env!(ctx.build());
    let mut c = c;
    c.create_lobby(account("alice.near"), U128(MIN_STAKE));
    reject(|| {
        c.create_lobby(account("carol.near"), U128(MIN_STAKE));
    });
    assert_eq!(c.stored_matches, 1);
}

#[test]
fn fee_timelock_cap_and_existing_terms_are_immutable() {
    let mut c = fresh();
    let id = lobby(&mut c, MIN_STAKE);
    deposit(&mut c, id, "alice.near", 1);
    call("admin.near", 2);
    reject(|| c.set_fee(MAX_FEE_BPS + 1));
    c.set_fee(400);
    call("keeper.near", 2 + FEE_DELAY_NS / SECOND - 1);
    reject(|| c.apply_fee());
    call("keeper.near", 2 + FEE_DELAY_NS / SECOND);
    c.apply_fee();
    assert_eq!(c.get_config().fee_bps, 400);
    assert_eq!(c.get_match(id).unwrap().fee_bps, 300);
    reject(|| c.apply_fee());
    call("admin.near", 200_000);
    c.set_fee(0);
    c.cancel_fee_change();
    reject(|| c.apply_fee());
}

#[test]
fn freeze_revokes_all_server_authority_and_enables_immediate_refund() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("server.near", 6);
    reject(|| c.freeze_server());
    call("admin.near", 6);
    c.freeze_server();
    reject(|| c.unpause());
    call("server.near", 7);
    reject(|| c.submit_result(id, account("bob.near")));
    reject(|| c.heartbeat(vec![id]));
    player("alice.near", 7);
    c.request_emergency_refund(id);
    resolve(&mut c, id, 0, 1, true);
    resolve(&mut c, id, 1, 1, true);
    call("admin.near", 11);
    c.set_server(account("replacement.near"));
    c.unpause();
    call("server.near", 12);
    reject(|| c.heartbeat(vec![]));
    call("replacement.near", 12);
    c.heartbeat(vec![]);
    invariant(&c);
}

#[test]
fn missing_callback_never_authorizes_automatic_repayment() {
    let mut c = fresh();
    let id = game(&mut c, MIN_STAKE);
    call("server.near", 6);
    c.submit_result(id, account("alice.near"));
    player("alice.near", 1_000_000);
    assert!(!c.claim_payout(id, 0));
    assert!(get_created_receipts().is_empty());
    assert_eq!(
        c.get_match(id).unwrap().payouts[0].state,
        PayoutState::InFlight
    );
    invariant(&c);
}
