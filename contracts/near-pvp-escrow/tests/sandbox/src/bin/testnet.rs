//! Testnet-only deployment and complete demo. Credentials are never stored in this repo.
use anyhow::{Context, Result, bail, ensure};
use near_workspaces::{
    Account, Worker,
    network::Testnet,
    operations::Function,
    types::{AccessKey, KeyType, NearToken, SecretKey},
};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

const SERVER_METHODS: &[&str] = &[
    "create_lobby",
    "bind_opponent",
    "update_stake",
    "record_activity",
    "start_match",
    "submit_result",
    "heartbeat",
];
fn wasm(name: &str) -> Result<Vec<u8>> {
    Ok(std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join(
        format!("../../target/wasm32-unknown-unknown/release/{name}.wasm"),
    ))?)
}
fn secure_dir(path: &Path) -> Result<()> {
    ensure!(path.is_absolute(), "Credentials directory must be absolute");
    std::fs::create_dir_all(path)?;
    let repo = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    ensure!(
        !path.canonicalize()?.starts_with(repo),
        "Credentials must be OUTSIDE the repository"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
async fn save(account: &Account, dir: &Path) -> Result<()> {
    account.store_credentials(dir).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(
            dir.join(format!("{}.json", account.id())),
            std::fs::Permissions::from_mode(0o600),
        )?;
    }
    Ok(())
}
async fn create(worker: &Worker<Testnet>, dir: &Path, role: &str) -> Result<Account> {
    eprintln!("Creating Testnet account for {role}");
    let a = worker.dev_create_account().await.context("Testnet helper could not create an account; use your funded Testnet account with deploy mode")?;
    save(&a, dir).await?;
    eprintln!("{role}: {}", a.id());
    Ok(a)
}
async fn deploy(
    worker: &Worker<Testnet>,
    account: &Account,
    admin: &str,
    server: &str,
    token: &str,
) -> Result<()> {
    ensure!(
        account.view_account().await?.contract_state == Default::default(),
        "Account already has contract code; use reviewed upgrade flow"
    );
    let token_id = token.parse()?;
    let metadata: Value = worker.view(&token_id, "ft_metadata").await?.json()?;
    ensure!(
        metadata["decimals"] == 6 && metadata["spec"] == "ft-1.0.0",
        "Token must implement 6-decimal NEP-141"
    );
    account
        .batch(account.id())
        .deploy(&wasm("near_pvp_escrow")?)
        .call(
            Function::new("new")
                .args_json(json!({"admin": admin, "server": server, "token": token})),
        )
        .transact()
        .await?
        .into_result()?;
    let bounds: Value = worker
        .view(&token_id, "storage_balance_bounds")
        .await?
        .json()?;
    let min = bounds["min"].as_str().context("Storage min")?.parse()?;
    account
        .call(&token_id, "storage_deposit")
        .args_json(json!({"account_id": account.id(), "registration_only": true}))
        .deposit(NearToken::from_yoctonear(min))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}
async fn call(
    account: &Account,
    escrow: &near_workspaces::AccountId,
    method: &str,
    args: Value,
) -> Result<Value> {
    let out = account
        .call(escrow, method)
        .args_json(args)
        .max_gas()
        .transact()
        .await?;
    let hash = out.outcome().transaction_hash.to_string();
    let receipt_logs: Vec<_> = out.logs().iter().map(|x| x.to_string()).collect();
    let result = out.into_result()?;
    eprintln!("{method}: {hash}");
    let value = result.json::<Value>().unwrap_or(Value::Null);
    Ok(json!({"method": method, "tx_hash": hash, "result": value, "logs": receipt_logs}))
}
#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
    ensure!(
        args.len() >= 2,
        "Usage: testnet demo|resume-demo /absolute/credentials-dir | deploy /absolute/escrow-key.json admin.testnet server.testnet token_id"
    );
    let worker = near_workspaces::testnet().await?; // Fixed Testnet endpoint; no Mainnet option.
    if args[1] == "deploy" {
        ensure!(
            args.len() == 6,
            "deploy requires credential path, admin, server, token"
        );
        let account = Account::from_file(&args[2], &worker)?;
        deploy(&worker, &account, &args[3], &args[4], &args[5]).await?;
        println!(
            "{}",
            json!({"network": "testnet", "escrow": account.id(), "admin": args[3], "server": args[4], "token": args[5]})
        );
        return Ok(());
    }
    if !["demo", "resume-demo"].contains(&args[1].as_str()) || args.len() != 3 {
        bail!("Unknown mode or invalid arguments");
    }
    let dir = PathBuf::from(&args[2]);
    secure_dir(&dir)?;
    let (admin, mut server, alice, bob, escrow, token) = if args[1] == "demo" {
        let admin = create(&worker, &dir, "admin").await?;
        let server = create(&worker, &dir, "server-full-access-offline").await?;
        let alice = create(&worker, &dir, "alice").await?;
        let bob = create(&worker, &dir, "bob").await?;
        let escrow = create(&worker, &dir, "escrow-deployment").await?;
        let token = create(&worker, &dir, "demo-ft").await?;
        let roles = json!({"admin": admin.id(), "server": server.id(), "alice": alice.id(), "bob": bob.id(), "escrow": escrow.id(), "token": token.id()});
        std::fs::write(
            dir.join("demo-accounts.json"),
            serde_json::to_vec_pretty(&roles)?,
        )?;
        token
            .batch(token.id())
            .deploy(&wasm("test_usdc")?)
            .call(Function::new("new").args_json(json!({"owner": admin.id()})))
            .transact()
            .await?
            .into_result()?;
        deploy(
            &worker,
            &escrow,
            admin.id().as_str(),
            server.id().as_str(),
            token.id().as_str(),
        )
        .await?;
        for a in [&alice, &bob, &admin] {
            a.call(token.id(), "storage_deposit")
                .args_json(json!({"account_id": a.id(), "registration_only": true}))
                .deposit(NearToken::from_millinear(10))
                .transact()
                .await?
                .into_result()?;
        }
        for a in [&alice, &bob] {
            admin
                .call(token.id(), "mint")
                .args_json(json!({"account_id": a.id(), "amount": "25000000"}))
                .transact()
                .await?
                .into_result()?;
        }
        (admin, server, alice, bob, escrow, token)
    } else {
        let roles: Value = serde_json::from_slice(&std::fs::read(dir.join("demo-accounts.json"))?)?;
        let load = |role: &str| -> Result<Account> {
            let id = roles[role].as_str().context("Missing account role")?;
            Ok(Account::from_file(dir.join(format!("{id}.json")), &worker)?)
        };
        (
            load("admin")?,
            load("server")?,
            load("alice")?,
            load("bob")?,
            load("escrow")?,
            load("token")?,
        )
    };
    // Resume is deliberately limited to a fully configured demo before first lobby.
    let active: Value = worker
        .view(escrow.id(), "get_active_match")
        .args_json(json!({"account_id": alice.id()}))
        .await?
        .json()?;
    ensure!(
        active.is_null(),
        "An existing active match needs inspection; do not replay the demo"
    );
    for a in [&alice, &bob] {
        let balance: String = worker
            .view(token.id(), "ft_balance_of")
            .args_json(json!({"account_id": a.id()}))
            .await?
            .json()?;
        ensure!(
            balance == "25000000",
            "Resume requires original unused demo balances"
        );
    }
    // Retain the server's full access key offline; use only this restricted key for game calls.
    let sk = SecretKey::from_random(KeyType::ED25519);
    let restricted_dir = dir.join("server-runtime");
    let old_key_file = restricted_dir.join(format!("{}.json", server.id()));
    let mut key_tx = server.batch(server.id());
    if old_key_file.exists() {
        let old = Account::from_file(&old_key_file, &worker)?;
        key_tx = key_tx.delete_key(old.secret_key().public_key());
    }
    key_tx
        .add_key(
            sk.public_key(),
            AccessKey::function_call_access(
                escrow.id(),
                SERVER_METHODS,
                Some(NearToken::from_near(5)),
            ),
        )
        .transact()
        .await?
        .into_result()?;
    server.set_secret_key(sk);
    secure_dir(&restricted_dir)?;
    save(&server, &restricted_dir).await?;
    eprintln!("Restricted server key configured; running lobby and payouts");
    let mut txs = Vec::new();
    let creation = call(
        &server,
        escrow.id(),
        "create_lobby",
        json!({"creator": alice.id(), "stake": "10000000"}),
    )
    .await?;
    let id = creation["result"]
        .as_str()
        .context("Created match ID")?
        .to_string();
    txs.push(creation);
    txs.push(
        call(
            &server,
            escrow.id(),
            "bind_opponent",
            json!({"match_id": id, "opponent": bob.id()}),
        )
        .await?,
    );
    txs.push(
        call(
            &server,
            escrow.id(),
            "update_stake",
            json!({"match_id": id, "stake": "25000000"}),
        )
        .await?,
    );
    for a in [&alice, &bob] {
        let msg = json!({"match_id": id, "revision": "1", "stake": "25000000", "fee_bps": 300})
            .to_string();
        let out = a
            .call(token.id(), "ft_transfer_call")
            .args_json(json!({"receiver_id": escrow.id(), "amount": "25000000", "msg": msg}))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?;
        let hash = out.outcome().transaction_hash.to_string();
        ensure!(out.json::<String>()? == "25000000", "Deposit was refunded");
        txs.push(json!({"method": "ft_transfer_call", "signer": a.id(), "tx_hash": hash}));
    }
    loop {
        let m: Value = worker
            .view(escrow.id(), "get_match")
            .args_json(json!({"match_id": id}))
            .await?
            .json()?;
        let now = worker.view_block().await?.timestamp();
        let ready: u64 = m["ready_at_ns"]
            .as_str()
            .context("Ready timestamp")?
            .parse()?;
        ensure!(
            now < m["deadline_ns"].as_str().unwrap().parse::<u64>()?,
            "Deadline reached"
        );
        if now >= ready + 3_000_000_000 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    txs.push(call(&server, escrow.id(), "heartbeat", json!({"match_ids": []})).await?);
    txs.push(call(&server, escrow.id(), "start_match", json!({"match_id": id})).await?);
    txs.push(
        call(
            &server,
            escrow.id(),
            "submit_result",
            json!({"match_id": id, "winner": alice.id()}),
        )
        .await?,
    );
    let m: Value = worker
        .view(escrow.id(), "get_match")
        .args_json(json!({"match_id": id}))
        .await?
        .json()?;
    ensure!(
        m["state"] == "Completed",
        "Payouts not completed; inspect saved credentials and retry claims"
    );
    let mut balances = serde_json::Map::new();
    for a in [&alice, &bob, &admin, &escrow] {
        let b: String = worker
            .view(token.id(), "ft_balance_of")
            .args_json(json!({"account_id": a.id()}))
            .await?
            .json()?;
        balances.insert(a.id().to_string(), json!(b));
    }
    ensure!(
        balances[alice.id().as_str()] == "48500000"
            && balances[admin.id().as_str()] == "1500000"
            && balances[escrow.id().as_str()] == "0",
        "Unexpected FT balances"
    );
    let report = json!({"network": "testnet", "token_kind": "project-owned test-only NEP-141 mock, not Circle USDC", "escrow": escrow.id(), "token": token.id(), "admin": admin.id(), "server": server.id(), "alice": alice.id(), "bob": bob.id(), "match": m, "balances": balances, "transactions": txs});
    std::fs::write(dir.join("report.json"), serde_json::to_vec_pretty(&report)?)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
