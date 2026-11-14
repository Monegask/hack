import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {Account,KeyPair} from 'near-api-js';
import {signMessage} from 'near-api-js/nep413';
import {config,CIRCLE_USDC,accountOnNetwork,bindStore} from '../server/config.mjs';
import {Chain} from '../server/chain.mjs';
import {Store} from '../server/store.mjs';
import {createApp} from '../server/http.mjs';
import {fixture} from './fixture.mjs';
import {formatUnits,paymentObserved,pendingKey} from '../client/finance.mjs';
const main={NEAR_NETWORK:'mainnet',ESCROW_API_VERSION:'2',FEE_RECEIVER_ID:'admin.near',PUBLIC_ORIGIN:'https://supply.example',NEAR_RPC_URL:'https://rpc.mainnet.near.org',TOKEN_ID:CIRCLE_USDC,ESCROW_ID:'escrow-reviewed.near',SERVER_ACCOUNT:'runtime.near',ESCROW_CODE_HASH:'1'.repeat(32),DATA_DIR:path.join(os.tmpdir(),'supply-line-isolated-mainnet')};
const hash=s=>createHash('sha256').update(s).digest('hex');

test('configuration preserves Testnet defaults and requires every explicit Mainnet deployment value',()=>{
 assert.equal(config({}).network,'testnet');assert.equal(config({}).paymentsEnabled,true);
 assert.equal(config(main).paymentsEnabled,false);
 for(const key of Object.keys(main)){if(key==='NEAR_NETWORK')continue;const env={...main};delete env[key];assert.throws(()=>config(env),key);}
 for(const patch of [{NEAR_NETWORK:'other'},{ESCROW_API_VERSION:'1'},{TOKEN_ID:'usdc.bridge.near'},{TOKEN_ID:'usdc.fakes.near'},{ESCROW_ID:'escrow.testnet'},{NEAR_RPC_URL:'https://rpc.testnet.near.org'},{NEAR_RPC_URL:'http://rpc.mainnet.near.org'},{SERVER_KEY_FILE:'C:/never-read.json'},{PUBLIC_ORIGIN:'http://localhost:4191'},{ESCROW_CODE_HASH:'REQUIRED'},{DATA_DIR:'./data'}])assert.throws(()=>config({...main,...patch}),JSON.stringify(patch));
 assert.equal(config({...main,MAINNET_PAYMENTS_ENABLED:'true',AUDIT_APPROVED:'true'}).paymentsEnabled,false);
});
test('account syntax and network rules reject alternate-network wallets',()=>{
 assert(accountOnNetwork('alice.near','mainnet'));assert(accountOnNetwork('a'.repeat(64),'mainnet'));assert(accountOnNetwork('alice.testnet','testnet'));
 for(const id of ['alice.testnet','alice..near','ALICE.near','a_near','evil.near.testnet'])assert(!accountOnNetwork(id,'mainnet'));
 assert(!accountOnNetwork('alice.near','testnet'));
});
test('SQLite scope prevents reusing Testnet state on Mainnet without deleting user records',t=>{
 const store=new Store('',{memory:true});t.after(()=>store.close());bindStore(config({}),store);store.put('session','saved',{account:'alice.testnet'});
 assert.throws(()=>bindStore(config(main),store),/different network/);assert.equal(store.get('session','saved').account,'alice.testnet');
 const old=new Store('',{memory:true});t.after(()=>old.close());old.put('match','old',{stake:'5'});assert.throws(()=>bindStore(config(main),old),/empty/);
});
function mainChain(){const cfg=config(main),chain=new Chain(cfg,null);chain.rpc=async(method)=>method==='status'?{chain_id:'mainnet'}:method==='block'?{header:{hash:'final',height:1}}:{code_hash:cfg.escrowCodeHash};chain.view=async(_id,method)=>method==='ft_metadata'?{symbol:'USDC',decimals:6}:method==='get_config'?{state_version:2,admin:'admin.near',server:cfg.server,token:cfg.token,paused:true,server_frozen:false,pending_fee:null,pending_admin:null,fee_bps:300,last_heartbeat_ns:'1'}:method==='get_match'?null:{total:'1'};return chain;}
test('Mainnet preflight checks real network/token metadata/hash/registration without loading a signer and validates the actual v2 ABI',async()=>{
 const chain=mainChain();const info=await chain.preflight();assert.equal(info.paymentsEnabled,false);assert.equal(info.signerChecked,false);assert.equal(chain.account,undefined);assert.equal(chain.chainConfig.state_version,2);
 await assert.rejects(chain.execute('x','create_lobby',{}),/Mainnet payments disabled/);assert.equal(await chain.match('1'),null);
 for(const failure of ['network','metadata','hash','registration']){
  const c=mainChain();if(failure==='network')c.rpc=async()=>({chain_id:'testnet'});
  if(failure==='metadata')c.view=async()=>({symbol:'USDC.e',decimals:6});
  if(failure==='hash')c.rpc=async(method)=>method==='status'?{chain_id:'mainnet'}:{code_hash:'wrong'};
  if(failure==='registration')c.view=async(_id,method)=>method==='ft_metadata'?{symbol:'USDC',decimals:6}:null;
  await assert.rejects(c.preflight(),undefined,failure);
 }
});
test('NEP413 Mainnet login verifies the selected provider, owner key and network-bound payload',async()=>{
 const chain=mainChain(),key=KeyPair.fromRandom('ed25519'),account=new Account('alice.near',{},key.toString());
 const payload={message:'Supply Line mainnet escrow-reviewed.near',recipient:'https://supply.example',nonce:Buffer.alloc(32,7)};
 const signed=await signMessage({signerAccount:account,payload});const wallet={accountId:signed.accountId,publicKey:String(signed.publicKey),signature:Buffer.from(signed.signature).toString('base64')};
 chain.provider={viewAccessKey:async()=>({permission:'FullAccess'})};chain.rpc=async(method)=>method==='status'?{chain_id:'mainnet'}:{permission:'FullAccess'};
 assert.equal(await chain.authenticate(wallet,payload),'alice.near');
 await assert.rejects(chain.authenticate(wallet,{...payload,message:'Supply Line testnet'}));
 await assert.rejects(chain.authenticate({...wallet,accountId:'alice.testnet'},payload),/selected network/);
 chain.rpc=async(method)=>method==='status'?{chain_id:'mainnet'}:{permission:{FunctionCall:{}}};await assert.rejects(chain.authenticate(wallet,payload),/owner key/);
 chain.rpc=async()=>({chain_id:'testnet'});await assert.rejects(chain.authenticate(wallet,payload),/chain_id/);
});
test('balance checks use live FT balance and liquid NEAR after storage reserve, and propagate RPC failures',async()=>{
 const chain=mainChain();chain.cfg.gasReserve='50';chain.view=async(_id,m)=>m==='ft_balance_of'?'5000000':m==='storage_balance_bounds'?{min:'100'}:null;
 chain.rpc=async(method)=>method==='status'?{chain_id:'mainnet'}:method==='query'?{amount:'1000',storage_usage:96}:{runtime_config:{storage_amount_per_byte:'10'}};
 const b=await chain.balance('alice.near');assert.equal(b.nearAvailable,'40');assert.equal(b.hasGas,false);assert.equal(b.registered,false);assert.equal(b.balance,'5000000');
 chain.rpc=async()=>{throw Error('offline');};await assert.rejects(chain.balance('alice.near'),/offline/);
});
async function server(t,f){const app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;f.store.put('session',hash('session'),{account:f.cfg.network==='mainnet'?'alice.near':'alice.testnet',scope:f.cfg.scope,csrf:'csrf',expires:Date.now()+60000});return {get:route=>fetch(origin+route,{headers:{cookie:'sl_session=session'}}),post:(route,body={})=>fetch(origin+route,{method:'POST',headers:{origin,cookie:'sl_session=session','x-csrf-token':'csrf','content-type':'application/json'},body:JSON.stringify(body)})};}
test('Mainnet HTTP rejects all financial/game mutations even if an env or client requests them',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg={...config(main),origin:f.cfg.origin};f.chain.chainConfig={};const h=await server(t,f);
 const c=await(await h.get('/api/config')).json();assert.equal(c.network,'mainnet');assert.equal(c.feeBps,null);assert.equal(c.paymentsEnabled,false);
 for(const route of ['/api/register','/api/matches','/api/matches/012345abcdef/join','/api/matches/012345abcdef/transaction']){const r=await h.post(route,{kind:'deposit'});assert.equal(r.status,400);assert.match((await r.json()).error,/Mainnet payments disabled/);}
 assert.equal((await h.get('/pvp/game')).status,400);assert.equal(f.chain.operations.size,0);
 // A session copied from another deployment cannot be resumed.
 f.store.put('session',hash('session'),{account:'alice.near',scope:'testnet',csrf:'csrf',expires:Date.now()+60000});assert.equal((await h.get('/api/auth/session')).status,401);
});
test('registration is self-only, exact-minimum, idempotent and requires gas plus storage funding',async t=>{
 const f=fixture();t.after(()=>f.store.close());const h=await server(t,f);
 assert.deepEqual(await(await h.post('/api/register')).json(),{alreadyRegistered:true});
 f.chain.balance=async()=>({registered:false,nearAvailable:'1000',gasReserve:'10',storageMinimum:'100'});
 const r=await(await h.post('/api/register',{account_id:'evil.testnet',amount:'999'})).json(),a=r.transaction.actions[0].params;
 assert.equal(a.methodName,'storage_deposit');assert.equal(a.deposit,'100');assert.deepEqual(a.args,{account_id:'alice.testnet',registration_only:true});
 f.chain.balance=async()=>({registered:false,nearAvailable:'100',gasReserve:'10',storageMinimum:'100'});assert.equal((await h.post('/api/register')).status,400);
});
test('deposit rejects insufficient FT, unregistered FT and insufficient gas before producing a wallet request',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await f.game.create('alice.testnet','5','request-deposit');await f.game.join(m.code,'bob.testnet');const h=await server(t,f),route='/api/matches/'+m.code+'/transaction',body={kind:'deposit',terms:{stake:'5000000',revision:'0',feeBps:300,opponent:'bob.testnet'}};
 for(const bad of [{balance:'4999999',registered:true,hasGas:true},{balance:'5000000',registered:false,hasGas:true},{balance:'5000000',registered:true,hasGas:false}]){f.chain.balance=async()=>bad;assert.equal((await h.post(route,body)).status,400);}
});
test('transaction reconciliation only recognizes final failure of the exact signed account/hash',async t=>{
 const f=fixture();t.after(()=>f.store.close());const h=await server(t,f),txHash='1'.repeat(32);f.chain.assertNetwork=async()=>{};
 let final=false;f.chain.rpc=async()=>({transaction:{signer_id:'alice.testnet',hash:txHash},final_execution_status:final?'FINAL':'EXECUTED',status:{Failure:{}}});
 assert.deepEqual(await(await h.post('/api/payment-status',{hash:txHash})).json(),{final:false,failed:false});final=true;
 assert.deepEqual(await(await h.post('/api/payment-status',{hash:txHash})).json(),{final:true,failed:true});
 f.chain.rpc=async()=>({transaction:{signer_id:'bob.testnet',hash:txHash},final_execution_status:'FINAL',status:{Failure:{}}});assert.equal((await h.post('/api/payment-status',{hash:txHash})).status,400);
});
test('financial display preserves micro-USDC at large amounts and pending actions require specific chain evidence',()=>{
 assert.equal(formatUnits('9007199254740993'),'9,007,199,254.740993');assert.equal(formatUnits('1'),'0.000001');assert.equal(formatUnits('10000000000000000000000',24),'0.01');
 const c={code:'match',side:0,chain:{deposited:[false,true],state:'AwaitingDeposits'}},pending={kind:'deposit',code:'match',account:'alice.near'};
 assert.equal(paymentObserved(pending,c),false);c.chain.deposited[0]=true;assert.equal(paymentObserved(pending,c),true);assert.equal(paymentObserved({...pending,code:'other'},c),false);
 assert.notEqual(pendingKey('mainnet','a.near'),pendingKey('testnet','a.near'));assert.equal(paymentObserved({kind:'register'},null,{registered:false}),false);
 assert.equal(paymentObserved({...pending,kind:'claim'},{...c,chain:{payouts:[{receiver:'alice.near',amount:'5',state:'Ready'}]}}),false);
});

test('a challenge issued for one network/deployment cannot mint a session after configuration changes',async t=>{
 const f=fixture();t.after(()=>f.store.close());const h=await server(t,f),response=await h.post('/api/auth/challenge'),challenge=await response.json(),cookie=response.headers.getSetCookie().find(x=>x.startsWith('sl_challenge')).split(';')[0];
 f.cfg.scope='new-mainnet-deployment';f.cfg.network='mainnet';
 const appOrigin=f.cfg.origin;
 const result=await fetch(appOrigin+'/api/auth/verify',{method:'POST',headers:{origin:appOrigin,cookie,'content-type':'application/json'},body:JSON.stringify({challengeId:challenge.id,signed:{}})});
 assert.equal(result.status,401);
});

test('read-only runtime public-key verification never claims private signer possession',async()=>{const chain=mainChain();chain.cfg.runtimePublicKey=String(KeyPair.fromRandom('ed25519').getPublicKey());let checked=false;chain.checkRuntimeKey=async()=>{checked=true;};const info=await chain.preflight();assert.equal(checked,true);assert.equal(info.runtimeKeyChecked,true);assert.equal(info.signerChecked,false);assert.equal(chain.account,undefined);});
