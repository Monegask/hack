// Copied into the pinned contract checkout by CI; ephemeral local accounts only.
use anyhow::{ensure, Result};
use near_workspaces::{types::NearToken, Account};
use serde_json::json;
use std::{fs, process::Command};
fn credential(a: &Account) -> serde_json::Value { json!({"id":a.id(),"key":a.secret_key().to_string()}) }
#[tokio::main]
async fn main() -> Result<()> {
 let worker=near_workspaces::sandbox().await?;
 let admin=worker.dev_create_account().await?;
 let server=worker.dev_create_account().await?;
 let alice=worker.dev_create_account().await?;
 let bob=worker.dev_create_account().await?;
 let carol=worker.dev_create_account().await?;
 let escrow=worker.dev_deploy(&fs::read("target/wasm32-unknown-unknown/release/near_pvp_escrow.wasm")?).await?;
 let ft=worker.dev_deploy(&fs::read("target/wasm32-unknown-unknown/release/test_usdc.wasm")?).await?;
 ft.call("new").args_json(json!({"owner":admin.id()})).transact().await?.into_result()?;
 escrow.call("new").args_json(json!({"admin":admin.id(),"server":server.id(),"token":ft.id()})).transact().await?.into_result()?;
 for id in [escrow.id(),alice.id(),bob.id(),admin.id()] {
  admin.call(ft.id(),"storage_deposit").args_json(json!({"account_id":id,"registration_only":true})).deposit(NearToken::from_millinear(10)).transact().await?.into_result()?;
 }
 for user in [&alice,&bob] {
  admin.call(ft.id(),"mint").args_json(json!({"account_id":user.id(),"amount":"200000000"})).transact().await?.into_result()?;
 }
 let file=std::env::temp_dir().join(format!("supply-line-sandbox-{}.json",std::process::id()));
 fs::write(&file,serde_json::to_vec(&json!({"rpc":worker.rpc_addr(),"escrow":escrow.id(),"token":ft.id(),"admin":credential(&admin),"server":credential(&server),"alice":credential(&alice),"bob":credential(&bob),"carol":credential(&carol)}))?)?;
 #[cfg(unix)] {use std::os::unix::fs::PermissionsExt;fs::set_permissions(&file,fs::Permissions::from_mode(0o600))?;}
 let status=Command::new("node").arg(std::env::var("FRONTEND_SANDBOX_TEST")?).env("SANDBOX_FIXTURE",&file).status();
 fs::remove_file(&file)?;
 ensure!(status?.success(),"Backend/frontend Sandbox integration failed");
 Ok(())
}
