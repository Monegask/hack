use anyhow::{Context, Result};
use base64::Engine;
use near_workspaces::{Account, Contract, Worker, network::Sandbox, types::NearToken};
use serde_json::{Value, json};

struct Fixture {
    worker: Worker<Sandbox>,
    escrow: Contract,
    ft: Contract,
    admin: Account,
    server: Account,
    alice: Account,
    bob: Account,
}

impl Fixture {
    async fn new() -> Result<Self> {
        let worker = near_workspaces::sandbox().await?;
        let admin = worker.dev_create_account().await?;
        let server = worker.dev_create_account().await?;
        let alice = worker.dev_create_account().await?;
        let bob = worker.dev_create_account().await?;
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let escrow = worker
            .dev_deploy(&std::fs::read(root.join(
                "target/wasm32-unknown-unknown/release/near_pvp_escrow.wasm",
            ))?)
            .await?;
        let ft = worker
            .dev_deploy(&std::fs::read(
                root.join("target/wasm32-unknown-unknown/release/test_usdc.wasm"),
            )?)
            .await?;
        ft.call("new")
            .args_json(json!({"owner": admin.id()}))
            .transact()
            .await?
            .into_result()?;
        escrow
            .call("new")
            .args_json(json!({"admin": admin.id(), "server": server.id(), "token": ft.id()}))
            .transact()
            .await?
            .into_result()?;
        let f = Self {
            worker,
            escrow,
            ft,
            admin,
            server,
            alice,
            bob,
        };
        for id in [f.escrow.id(), f.alice.id(), f.bob.id(), f.admin.id()] {
            f.admin
                .call(f.ft.id(), "storage_deposit")
                .args_json(json!({"account_id": id, "registration_only": true}))
                .deposit(NearToken::from_millinear(10))
                .transact()
                .await?
                .into_result()?;
        }
        for user in [&f.alice, &f.bob] {
            f.admin
                .call(f.ft.id(), "mint")
                .args_json(json!({"account_id": user.id(), "amount": "20000000"}))
                .transact()
                .await?
                .into_result()?;
        }
        Ok(f)
    }

    async fn lobby(&self) -> Result<String> {
        let id: String = self
            .server
            .call(self.escrow.id(), "create_lobby")
            .args_json(json!({"creator": self.alice.id(), "stake": "10000000"}))
            .max_gas()
            .transact()
            .await?
            .json()?;
        self.server
            .call(self.escrow.id(), "bind_opponent")
            .args_json(json!({"match_id": id, "opponent": self.bob.id()}))
            .transact()
            .await?
            .into_result()?;
        Ok(id)
    }

    async fn deposit(&self, id: &str, who: &Account, amount: &str) -> Result<String> {
        let msg = json!({"match_id": id, "revision": "0", "stake": "10000000", "fee_bps": 300})
            .to_string();
        Ok(who
            .call(self.ft.id(), "ft_transfer_call")
            .args_json(json!({"receiver_id": self.escrow.id(), "amount": amount, "msg": msg}))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?
            .json()?)
    }

    async fn state(&self, id: &str) -> Result<Value> {
        Ok(self
            .escrow
            .view("get_match")
            .args_json(json!({"match_id": id}))
            .await?
            .json()?)
    }
    async fn balance(&self, user: &near_workspaces::AccountId) -> Result<u128> {
        let balance: String = self
            .ft
            .view("ft_balance_of")
            .args_json(json!({"account_id": user}))
            .await?
            .json()?;
        Ok(balance.parse()?)
    }
    async fn start(&self, id: &str) -> Result<()> {
        self.worker.fast_forward(10).await?;
        self.server
            .call(self.escrow.id(), "start_match")
            .args_json(json!({"match_id": id}))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }
    async fn result(&self, id: &str, winner: &Account) -> Result<()> {
        // Child FT failures are allowed: the callbacks must restore Ready obligations.
        self.server
            .call(self.escrow.id(), "submit_result")
            .args_json(json!({"match_id": id, "winner": winner.id()}))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }
    async fn ledger(&self) -> Result<Value> {
        let a: Value = self.escrow.view("get_accounting").await?.json()?;
        let n = |key: &str| a[key].as_str().unwrap().parse::<u128>().unwrap();
        assert_eq!(n("accepted"), n("locked") + n("owed") + n("paid"));
        Ok(a)
    }

    async fn age(&self, id: &str, field: &str) -> Result<()> {
        let m = self.state(id).await?;
        let old = m[field]
            .as_str()
            .context("timestamp")?
            .parse::<u64>()?
            .to_le_bytes();
        let now = self.worker.view_block().await?.timestamp();
        let aged = (now - 1_000_000_000).to_le_bytes();
        let key = [b"m".as_slice(), &id.parse::<u64>()?.to_le_bytes()].concat();
        let values = self.worker.view_state(self.escrow.id()).await?;
        let mut value = values.get(&key).context("match entry")?.clone();
        let positions: Vec<usize> = value
            .windows(8)
            .enumerate()
            .filter_map(|(i, b)| (b == old).then_some(i))
            .collect();
        assert_eq!(positions.len(), 1, "unique fixture timestamp");
        value[positions[0]..positions[0] + 8].copy_from_slice(&aged);
        self.worker
            .patch_state(self.escrow.id(), &key, &value)
            .await?;
        Ok(())
    }
}

#[tokio::test]
async fn production_initializer_pins_circle_and_starts_paused() -> Result<()> {
    let f = Fixture::new().await?;
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let prod = f
        .worker
        .dev_deploy(&std::fs::read(
            root.join("artifacts/candidate/mainnet-escrow.wasm"),
        )?)
        .await?;
    let bad = prod
        .call("new")
        .args_json(json!({"admin": f.admin.id(), "server": f.server.id(), "token": f.ft.id()}))
        .transact()
        .await?;
    assert!(bad.is_failure());
    let token = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
    prod.call("new")
        .args_json(json!({"admin": f.admin.id(), "server": f.server.id(), "token": token}))
        .transact()
        .await?
        .into_result()?;
    let cfg: Value = prod.view("get_config").await?.json()?;
    assert_eq!(cfg["token"], token);
    assert_eq!(cfg["paused"], true);
    assert_eq!(cfg["fee_bps"], 300);
    Ok(())
}

#[tokio::test]
async fn cancelled_zero_one_two_deposits_refund_exactly_once() -> Result<()> {
    for count in 0..=2 {
        let f = Fixture::new().await?;
        let id = f.lobby().await?;
        if count >= 1 {
            f.deposit(&id, &f.alice, "10000000").await?;
        }
        if count == 2 {
            f.deposit(&id, &f.bob, "10000000").await?;
        }
        f.alice
            .call(f.escrow.id(), "cancel_unstarted_match")
            .args_json(json!({"match_id": id}))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
        assert_eq!(f.balance(f.alice.id()).await?, 20_000_000);
        assert_eq!(f.balance(f.bob.id()).await?, 20_000_000);
        assert_eq!(f.balance(f.admin.id()).await?, 0);
        let repeat = f
            .bob
            .call(f.escrow.id(), "cancel_unstarted_match")
            .args_json(json!({"match_id": id}))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?;
        assert!(repeat.is_failure());
        let paid = f
            .alice
            .call(f.escrow.id(), "claim_payout")
            .args_json(json!({"match_id": id, "index": 0}))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?;
        assert!(!paid.json::<bool>()?);
        assert_eq!(f.deposit(&id, &f.alice, "10000000").await?, "0");
        assert_eq!(f.balance(f.alice.id()).await?, 20_000_000);
        assert_eq!(f.ledger().await?["owed"], "0");
    }
    Ok(())
}

#[tokio::test]
async fn insufficient_balance_wrong_token_and_frozen_stake() -> Result<()> {
    let f = Fixture::new().await?;
    let id = f.lobby().await?;
    assert!(f.deposit(&id, &f.alice, "30000000").await.is_err());
    assert_eq!(f.state(&id).await?["deposited"], json!([false, false]));
    let start = f
        .server
        .call(f.escrow.id(), "start_match")
        .args_json(json!({"match_id": id}))
        .transact()
        .await?;
    assert!(start.is_failure());
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let fake = f
        .worker
        .dev_deploy(&std::fs::read(
            root.join("target/wasm32-unknown-unknown/release/test_usdc.wasm"),
        )?)
        .await?;
    fake.call("new")
        .args_json(json!({"owner": f.admin.id()}))
        .transact()
        .await?
        .into_result()?;
    for account in [f.alice.id(), f.escrow.id()] {
        f.admin
            .call(fake.id(), "storage_deposit")
            .args_json(json!({"account_id": account}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?
            .into_result()?;
    }
    f.admin
        .call(fake.id(), "mint")
        .args_json(json!({"account_id": f.alice.id(), "amount": "10000000"}))
        .transact()
        .await?
        .into_result()?;
    let wrong: String = f.alice.call(fake.id(), "ft_transfer_call").args_json(json!({"receiver_id": f.escrow.id(), "amount": "10000000",
        "msg": json!({"match_id": id, "revision":"0", "stake":"10000000", "fee_bps":300}).to_string()}))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?.json()?;
    assert_eq!(wrong, "0");
    assert_eq!(f.ledger().await?["accepted"], "0");
    f.deposit(&id, &f.alice, "10000000").await?;
    let raise = f
        .server
        .call(f.escrow.id(), "update_stake")
        .args_json(json!({"match_id":id,"stake":"11000000"}))
        .transact()
        .await?;
    assert!(raise.is_failure());
    assert_eq!(f.state(&id).await?["stake"], "10000000");
    Ok(())
}

#[tokio::test]
async fn deadlines_pause_and_server_compromise_circuit_breaker() -> Result<()> {
    let f = Fixture::new().await?;
    let id = f.lobby().await?;
    f.deposit(&id, &f.alice, "10000000").await?;
    f.age(&id, "deadline_ns").await?;
    assert_eq!(f.deposit(&id, &f.bob, "10000000").await?, "0");
    f.bob
        .call(f.escrow.id(), "cancel_expired_lobby")
        .args_json(json!({"match_id":id}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.balance(f.alice.id()).await?, 20_000_000);
    let id = f.lobby().await?;
    f.admin
        .call(f.escrow.id(), "pause")
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.deposit(&id, &f.alice, "10000000").await?, "0");
    f.admin
        .call(f.escrow.id(), "unpause")
        .transact()
        .await?
        .into_result()?;
    f.deposit(&id, &f.alice, "10000000").await?;
    f.deposit(&id, &f.bob, "10000000").await?;
    f.start(&id).await?;
    f.age(&id, "game_deadline_ns").await?;
    f.server
        .call(f.escrow.id(), "heartbeat")
        .args_json(json!({"match_ids":[id]}))
        .transact()
        .await?
        .into_result()?;
    assert!(f.result(&id, &f.bob).await.is_err());
    f.alice
        .call(f.escrow.id(), "request_emergency_refund")
        .args_json(json!({"match_id":id}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let id = f.lobby().await?;
    f.deposit(&id, &f.alice, "10000000").await?;
    f.deposit(&id, &f.bob, "10000000").await?;
    f.start(&id).await?;
    f.admin
        .call(f.escrow.id(), "freeze_server")
        .transact()
        .await?
        .into_result()?;
    assert!(f.result(&id, &f.bob).await.is_err());
    let hb = f
        .server
        .call(f.escrow.id(), "heartbeat")
        .args_json(json!({"match_ids":[id]}))
        .transact()
        .await?;
    assert!(hb.is_failure());
    f.bob
        .call(f.escrow.id(), "request_emergency_refund")
        .args_json(json!({"match_id":id}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.balance(f.alice.id()).await?, 20_000_000);
    assert_eq!(f.balance(f.bob.id()).await?, 20_000_000);
    assert_eq!(f.ledger().await?["owed"], "0");
    Ok(())
}

#[tokio::test]
async fn issuer_pause_and_insufficient_escrow_ft_restore_ready_obligations() -> Result<()> {
    for insolvency in [false, true] {
        let f = Fixture::new().await?;
        let id = f.lobby().await?;
        f.deposit(&id, &f.alice, "10000000").await?;
        f.deposit(&id, &f.bob, "10000000").await?;
        f.start(&id).await?;
        if insolvency {
            f.admin
                .call(f.ft.id(), "burn_for_test")
                .args_json(json!({"account_id":f.escrow.id(), "amount":"20000000"}))
                .transact()
                .await?
                .into_result()?;
        } else {
            f.admin
                .call(f.ft.id(), "set_paused")
                .args_json(json!({"paused":true}))
                .transact()
                .await?
                .into_result()?;
        }
        f.result(&id, &f.alice).await?;
        let m = f.state(&id).await?;
        assert_eq!(m["payouts"][0]["state"], "Ready");
        assert_eq!(m["payouts"][1]["state"], "Ready");
        assert_eq!(f.ledger().await?["paid"], "0");
        assert_eq!(f.ledger().await?["owed"], "20000000");
        if insolvency {
            f.admin
                .call(f.ft.id(), "mint")
                .args_json(json!({"account_id":f.escrow.id(), "amount":"20000000"}))
                .transact()
                .await?
                .into_result()?;
        } else {
            f.admin
                .call(f.ft.id(), "set_paused")
                .args_json(json!({"paused":false}))
                .transact()
                .await?
                .into_result()?;
        }
        for (index, who) in [(0, &f.alice), (1, &f.admin)] {
            who.call(f.escrow.id(), "claim_payout")
                .args_json(json!({"match_id":id,"index":index}))
                .deposit(NearToken::from_yoctonear(1))
                .max_gas()
                .transact()
                .await?
                .into_result()?;
        }
        assert_eq!(f.state(&id).await?["state"], "Completed");
        assert_eq!(f.balance(f.alice.id()).await?, 29_400_000);
        assert_eq!(f.balance(f.admin.id()).await?, 600_000);
        assert_eq!(f.ledger().await?["owed"], "0");
        // A self callback without a dependency result fails before touching accounting.
        let bad = f
            .escrow
            .call("on_payout")
            .args_json(json!({"match_id":id,"index":0,"attempt":"2"}))
            .transact()
            .await?;
        assert!(bad.is_failure());
        assert_eq!(f.ledger().await?["paid"], "20000000");
    }
    Ok(())
}

#[tokio::test]
async fn blocklisted_refund_is_retryable_without_platform_fee() -> Result<()> {
    let f = Fixture::new().await?;
    let id = f.lobby().await?;
    f.deposit(&id, &f.alice, "10000000").await?;
    f.deposit(&id, &f.bob, "10000000").await?;
    f.admin
        .call(f.ft.id(), "set_blocked")
        .args_json(json!({"account_id":f.alice.id(),"blocked":true}))
        .transact()
        .await?
        .into_result()?;
    f.admin
        .call(f.escrow.id(), "cancel_match_admin")
        .args_json(json!({"match_id":id}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.balance(f.bob.id()).await?, 20_000_000);
    assert_eq!(f.balance(f.admin.id()).await?, 0);
    assert_eq!(f.state(&id).await?["payouts"][0]["state"], "Ready");
    assert_eq!(f.ledger().await?["owed"], "10000000");
    f.admin
        .call(f.ft.id(), "set_blocked")
        .args_json(json!({"account_id":f.alice.id(),"blocked":false}))
        .transact()
        .await?
        .into_result()?;
    f.alice
        .call(f.escrow.id(), "claim_payout")
        .args_json(json!({"match_id":id,"index":0}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.balance(f.alice.id()).await?, 20_000_000);
    assert_eq!(f.ledger().await?["owed"], "0");
    Ok(())
}

#[tokio::test]
async fn actual_nep141_resolver_transfers_private_callback_and_drained_upgrade() -> Result<()> {
    let f = Fixture::new().await?;
    let id = f.lobby().await?;
    assert_eq!(f.deposit(&id, &f.alice, "9999999").await?, "0");
    assert_eq!(f.balance(f.alice.id()).await?, 20_000_000);
    assert_eq!(f.deposit(&id, &f.alice, "10000000").await?, "10000000");
    assert_eq!(f.deposit(&id, &f.alice, "10000000").await?, "0");
    assert_eq!(f.deposit(&id, &f.bob, "10000000").await?, "10000000");
    let attack = f
        .alice
        .call(f.escrow.id(), "on_payout")
        .args_json(json!({"match_id": id, "index": 0, "attempt": "1"}))
        .transact()
        .await?;
    assert!(attack.is_failure());
    f.start(&id).await?;
    let attack = f
        .admin
        .call(f.escrow.id(), "submit_result")
        .args_json(json!({"match_id": id, "winner": f.admin.id()}))
        .transact()
        .await?;
    assert!(attack.is_failure());
    f.result(&id, &f.alice).await?;
    assert_eq!(f.state(&id).await?["state"], "Completed");
    assert_eq!(f.balance(f.alice.id()).await?, 29_400_000);
    assert_eq!(f.balance(f.admin.id()).await?, 600_000);
    assert_eq!(f.balance(f.escrow.id()).await?, 0);
    assert_eq!(f.ledger().await?["owed"], "0");
    let result = f
        .server
        .call(f.escrow.id(), "submit_result")
        .args_json(json!({"match_id": id, "winner": f.bob.id()}))
        .transact()
        .await?;
    assert!(result.is_failure());
    f.admin
        .call(f.escrow.id(), "pause")
        .transact()
        .await?
        .into_result()?;
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    // Borsh state migration, deployment and follow-up views execute in actual receipts.
    let bytes =
        std::fs::read(root.join("target/wasm32-unknown-unknown/release/near_pvp_escrow.wasm"))?;
    let code = base64::engine::general_purpose::STANDARD.encode(bytes);
    f.admin
        .call(f.escrow.id(), "upgrade")
        .args_json(json!({"code": code}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.state(&id).await?["state"], "Completed");
    assert_eq!(f.ledger().await?["paid"], "20000000");
    Ok(())
}

#[tokio::test]
async fn failed_ft_fee_transfer_and_claim_execute_real_callbacks() -> Result<()> {
    let f = Fixture::new().await?;
    f.admin
        .call(f.ft.id(), "storage_unregister")
        .args_json(json!({"force": false}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    let id = f.lobby().await?;
    f.deposit(&id, &f.alice, "10000000").await?;
    f.deposit(&id, &f.bob, "10000000").await?;
    f.start(&id).await?;
    f.result(&id, &f.bob).await?;
    assert_eq!(f.balance(f.bob.id()).await?, 29_400_000);
    let m = f.state(&id).await?;
    assert_eq!(m["state"], "SettlementPending");
    assert_eq!(m["payouts"][1]["state"], "Ready");
    assert_eq!(f.ledger().await?["owed"], "600000");
    f.admin
        .call(f.ft.id(), "storage_deposit")
        .args_json(json!({"account_id": f.admin.id()}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;
    f.admin
        .call(f.escrow.id(), "claim_payout")
        .args_json(json!({"match_id": id, "index": 1}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.balance(f.admin.id()).await?, 600_000);
    assert_eq!(f.state(&id).await?["state"], "Completed");
    assert_eq!(f.ledger().await?["owed"], "0");
    Ok(())
}

#[tokio::test]
async fn emergency_refund_and_unregistered_winner_retry() -> Result<()> {
    let f = Fixture::new().await?;
    let id = f.lobby().await?;
    f.deposit(&id, &f.alice, "10000000").await?;
    f.deposit(&id, &f.bob, "10000000").await?;
    f.start(&id).await?;
    f.alice
        .call(f.ft.id(), "storage_unregister")
        .args_json(json!({"force": true}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    f.result(&id, &f.alice).await?;
    assert_eq!(f.state(&id).await?["payouts"][0]["state"], "Ready");
    assert_eq!(f.balance(f.admin.id()).await?, 600_000);
    f.alice
        .call(f.ft.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;
    f.alice
        .call(f.escrow.id(), "claim_payout")
        .args_json(json!({"match_id": id, "index": 0}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.balance(f.alice.id()).await?, 19_400_000);
    assert_eq!(f.state(&id).await?["state"], "Completed");
    // A separate game demonstrates global activity cannot revive a stale match.
    let id2 = f.lobby().await?;
    f.deposit(&id2, &f.alice, "10000000").await?;
    f.deposit(&id2, &f.bob, "10000000").await?;
    f.start(&id2).await?;
    // Sandbox height advancement is not a reliable 1 block = 1 second clock.
    // Age ONLY this fixture's heartbeat via sandbox_patch_state, then execute
    // heartbeat/refund and both FT transfers as real WASM receipts.
    let before = f.state(&id2).await?;
    let old = before["last_heartbeat_ns"]
        .as_str()
        .unwrap()
        .parse::<u64>()?
        .to_le_bytes();
    let now = f.worker.view_block().await?.timestamp();
    let aged = (now - 1801 * 1_000_000_000).to_le_bytes();
    let key = [b"m".as_slice(), &id2.parse::<u64>()?.to_le_bytes()].concat();
    let values = f.worker.view_state(f.escrow.id()).await?;
    let mut value = values.get(&key).context("match storage entry")?.clone();
    let positions: Vec<usize> = value
        .windows(8)
        .enumerate()
        .filter_map(|(i, bytes)| (bytes == old).then_some(i))
        .collect();
    assert_eq!(
        positions.len(),
        1,
        "exactly one heartbeat timestamp in fixture"
    );
    value[positions[0]..positions[0] + 8].copy_from_slice(&aged);
    f.worker.patch_state(f.escrow.id(), &key, &value).await?;
    f.server
        .call(f.escrow.id(), "heartbeat")
        .args_json(json!({"match_ids": [id2]}))
        .transact()
        .await?
        .into_result()?;
    f.bob
        .call(f.escrow.id(), "request_emergency_refund")
        .args_json(json!({"match_id": id2}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(f.state(&id2).await?["state"], "Cancelled");
    assert_eq!(f.balance(f.bob.id()).await?, 10_000_000);
    assert_eq!(f.ledger().await?["owed"], "0");
    Ok(())
}
