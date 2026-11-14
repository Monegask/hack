// Executes the actual JS backend/adapter against PR #1 Rust WASM in a local Sandbox.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {Chain} from '../../server/chain.mjs';
import {Store} from '../../server/store.mjs';
import {GameService} from '../../server/service.mjs';
import {createApp} from '../../server/http.mjs';
import {SERVER_METHODS,CONTRACT_REVISION} from '../../server/adapters/escrow-v2.mjs';
import {prepareIntent,reconcileIntent} from '../../server/recovery-v2.mjs';
const f=JSON.parse(fs.readFileSync(process.env.SANDBOX_FIXTURE,'utf8'));
if(!['localhost','127.0.0.1'].includes(new URL(f.rpc).hostname))throw Error('Sandbox fixture must be local');
const provider=new JsonRpcProvider({url:f.rpc}),wallet={};for(const who of ['admin','server','alice','bob','carol'])wallet[who]=new Account(f[who].id,provider,f[who].key);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'supply-backend-v2-')),report={contract:CONTRACT_REVISION,realRustSandbox:true,checks:[]};
let store=new Store(directory),cfg={rpc:f.rpc,network:(await provider.sendJsonRpc('status',[])).chain_id,adapterVersion:'escrow-v2',token:f.token,escrow:f.escrow,server:f.server.id,gasReserve:'10000000000000000000000',expectedFeeReceiver:f.admin.id,maxActive:10,players:[],scope:'sandbox-v2:'+f.escrow},chain=new Chain(cfg,store);
cfg.escrowCodeHash=(await chain.rpc('query',{request_type:'view_account',account_id:f.escrow,finality:'final'})).code_hash;
const restricted=KeyPair.fromRandom('ed25519');const grant=await wallet.server.signAndSendTransaction({receiverId:f.server.id,actions:[actions.addFunctionCallAccessKey(restricted.getPublicKey(),f.escrow,[...SERVER_METHODS],500000000000000000000000n)],waitUntil:'FINAL'});assert(Object.hasOwn(grant.status,'SuccessValue'));
const runtime=new Account(f.server.id,provider,restricted.toString());chain.account=runtime;
const hash=s=>createHash('sha256').update(s).digest('hex');
let app,game,origin,request=0;
async function raw(who,receiver,method,args={},deposit='0',gas='250000000000000'){
 return wallet[who].signAndSendTransaction({receiverId:receiver,actions:[actions.functionCall(method,args,BigInt(gas),BigInt(deposit))],waitUntil:'FINAL',throwOnFailure:false});
}
async function send(who,tx){return raw(who,tx.receiverId,tx.actions[0].params.methodName,tx.actions[0].params.args,tx.actions[0].params.deposit,tx.actions[0].params.gas);}
async function post(who,route,body){const r=await fetch(origin+route,{method:'POST',headers:{origin,cookie:'sl_session='+who,'content-type':'application/json','x-csrf-token':'csrf'},body:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}
async function waitMatch(id,predicate){for(let i=0;i<100;i++){const m=await chain.match(id);if(predicate(m))return m;await delay(100);}throw Error('Escrow state timeout: '+JSON.stringify(await chain.match(id)));}
async function open(){game=new GameService(cfg,store,chain);app=createApp(cfg,store,chain,game);await new Promise(r=>app.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+app.address().port;cfg.origin=origin;for(const who of ['alice','bob','admin','carol'])store.put('session',hash(who),{account:f[who].id,scope:cfg.scope,csrf:'csrf',expires:Date.now()+3600000});}
async function close(){if(app){await new Promise(r=>app.close(r));app=null;}store.close();}
async function prepare(who,m,kind,extra={}){const terms={stake:m.stake,revision:m.revision,feeBps:m.fee_bps,opponent:who==='alice'?f.bob.id:f.alice.id};return post(who,'/api/escrow/matches/'+m.id+'/transaction',{id:'sandbox-wallet-'+(++request),kind,terms,...extra});}
async function pay(who,m,kind,extra={}){const req=await prepare(who,m,kind,extra),tx=await send(who,req.transaction),status=await post(who,'/api/payment-status',{id:req.intentId,hash:tx.transaction.hash});return {req,tx,status};}
async function match(){await game.sync();const created=await post('alice','/api/matches',{amount:'5',id:'sandbox-create-'+(++request)});assert.equal(created.phase,'lobby');await post('bob','/api/matches/'+created.code+'/join',{});return game.matches.get(created.code);}
async function funded(){const m=await match();let c=await chain.match(m.chainId);assert.equal((await pay('alice',c,'deposit')).status.state,'accepted');c=await chain.match(m.chainId);assert.equal((await pay('bob',c,'deposit')).status.state,'accepted');return m;}
async function start(m){await delay(3600);await game.reconcile(m);assert.equal(m.phase,'playing',JSON.stringify(m));}
async function denied(promise,pattern){await assert.rejects(promise,error=>{const detail=String(error)+' '+JSON.stringify(error);return pattern.test(detail);});}
async function balance(who){return BigInt(await chain.view(f.token,'ft_balance_of',{account_id:f[who].id}));}
try{
 await chain.preflight();const permission=await chain.rpc('query',{request_type:'view_access_key',account_id:f.server.id,public_key:String(restricted.getPublicKey()),finality:'final'});console.log('Sandbox runtime permission (public):',JSON.stringify(permission.permission));await chain.checkRuntimeKey(String(restricted.getPublicKey()));
 await denied(runtime.signAndSendTransaction({receiverId:f.token,actions:[actions.functionCall('ft_transfer',{receiver_id:f.alice.id,amount:'1'},10000000000000n,0n)]}),/ReceiverMismatch|receiver.*match|InvalidAccessKeyError/i);
 await denied(runtime.signAndSendTransaction({receiverId:f.escrow,actions:[actions.transfer(1n)]}),/RequiresFullAccess|full.access|InvalidAccessKeyError/i);
 await denied(runtime.signAndSendTransaction({receiverId:f.escrow,actions:[actions.functionCall('upgrade',{},10000000000000n,0n)]}),/MethodNameMismatch|method.*(match|permit|allow)|InvalidAccessKeyError/i);
 report.checks.push('restricted runtime key: exact receiver/methods/allowance; FT/native transfers and upgrade rejected on chain');
 // Lose the response after a real broadcast; restart the SQLite owner and query the original hash.
 const realRpc=chain.rpc.bind(chain);let broadcasts=0;chain.rpc=async(method,params)=>{if(method==='send_tx'){broadcasts++;try{await realRpc(method,params);}catch(e){console.log('Sandbox original broadcast failed:',e.message,JSON.stringify(e.rpc));throw e;}throw Error('Injected lost response after real broadcast');}return realRpc(method,params);};
 await assert.rejects(chain.execute('lost-create','create_lobby',{creator:f.alice.id,stake:'5000000'}),e=>e.pending);const signed=store.get('outbox','lost-create');assert.equal(signed.status,'signed');store.close();
 store=new Store(directory);chain=new Chain(cfg,store);chain.account=runtime;const beforeRecoveryRpc=chain.rpc.bind(chain);chain.rpc=async(method,params)=>{try{return await beforeRecoveryRpc(method,params);}catch(e){if(method==='send_tx'){console.log('Sandbox rebroadcast failed:',e.message,JSON.stringify(e.rpc));const response=await fetch(cfg.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'sandbox-diagnostic',method,params})});const body=await response.json();console.log('Sandbox RPC rejection:',JSON.stringify({cause:body.error?.cause,data:body.error?.data,message:body.error?.message}));}throw e;}};const recovered=await chain.execute('lost-create','create_lobby',{creator:f.alice.id,stake:'5000000'});assert.equal(recovered.hash,signed.hash);assert.equal(broadcasts,1);assert.equal(store.get('outbox','lost-create').status,'done');
 assert.equal((await raw('alice',f.escrow,'cancel_unstarted_match',{match_id:String(recovered.value)},'1')).status.SuccessValue,'');
 report.checks.push('real broadcast ambiguity + SQLite restart: original signed bytes/hash, no new payment');
 await open();
 const registration=await post('carol','/api/register',{id:'carol-register',account_id:f.alice.id});assert.deepEqual(registration.transaction.actions[0].params.args,{account_id:f.carol.id,registration_only:true});const registrationTx=await send('carol',registration.transaction);assert.equal((await post('carol','/api/payment-status',{id:registration.intentId,hash:registrationTx.transaction.hash})).state,'registered');assert.equal((await post('carol','/api/register',{id:'carol-register'})).alreadyResolved,true);assert.equal((await post('carol','/api/register',{id:'carol-register-again'})).alreadyRegistered,true);report.checks.push('real FT minimum self-registration, request replay and no repeated storage payment');
 // Normal lifecycle through HTTP, with duplicate deposit resolver and exact ledger.
 let m=await match(),c=await chain.match(m.chainId),a0=await balance('alice'),b0=await balance('bob'),fee0=await balance('admin');
 const req=await prepare('alice',c,'deposit'),intent=store.get('payment',JSON.stringify([cfg.scope,f.alice.id,req.intentId]));
 let tx=await send('alice',req.transaction);assert.equal((await post('alice','/api/payment-status',{id:req.intentId,hash:tx.transaction.hash})).state,'accepted');const replay=await prepare('alice',c,'deposit',{id:req.intentId});assert.equal(replay.alreadyResolved,true);
 const duplicate=prepareIntent(store,cfg,{id:'duplicate-original',account:f.alice.id,code:null,kind:'deposit',match:c,transaction:req.transaction});tx=await send('alice',req.transaction);const duplicateResult=await reconcileIntent(chain,store,duplicate,tx.transaction.hash);assert.equal(duplicateResult.state,'refunded-by-resolver');
 c=await chain.match(m.chainId);await pay('bob',c,'deposit');await start(m);game.finish(m,0,'sandbox-server-result');await game.reconcile(m);await waitMatch(m.chainId,c=>c.state==='Completed');
 assert.equal(await balance('alice'),a0+4700000n);assert.equal(await balance('bob'),b0-5000000n);assert.equal(await balance('admin'),fee0+300000n);
 const resultHash=store.get('outbox',m.code+':result').result.hash;await game.reconcile(m);assert.equal(store.get('outbox',m.code+':result').result.hash,resultHash);
 report.checks.push('HTTP create/bind/deposit/3s countdown/start/result; duplicate FT resolver refund; exact 9.7 prize/0.3 fee, result idempotency');
 // Failed fee receipt -> Ready; async winner payment is not repeated by fee retry.
 await raw('admin',f.token,'set_blocked',{account_id:f.admin.id,blocked:true});m=await funded();await start(m);const winnerBefore=await balance('alice');game.finish(m,0,'sandbox-failed-fee');await game.reconcile(m);
 c=await waitMatch(m.chainId,c=>c.payouts[0].state==='Paid'&&c.payouts[1].state==='Ready');assert.equal(c.state,'SettlementPending');assert.equal(await balance('alice'),winnerBefore+9700000n);
 await close();store=new Store(directory);chain=new Chain(cfg,store);chain.account=runtime;await chain.preflight();await open();m=game.matches.get(m.code);await game.reconcile(m);assert.equal(m.phase,'settling');
 await raw('admin',f.token,'set_blocked',{account_id:f.admin.id,blocked:false});const feeClaim=await pay('admin',await chain.match(m.chainId),'claim');assert(['paid','in-flight'].includes(feeClaim.status.state));c=await waitMatch(m.chainId,c=>c.state==='Completed');assert.equal(c.payouts[0].attempt,'1');assert.equal(c.payouts[1].attempt,'2');assert.equal(await balance('alice'),winnerBefore+9700000n);
 report.checks.push('failed FT callback restores Ready; persistent restart; fixed fee beneficiary retry, no repeated winner payout');
 // Only one accepted deposit: prestart cancellation refunds precisely that depositor.
 m=await match();c=await chain.match(m.chainId);const beforeRefund=await balance('alice');await pay('alice',c,'deposit');await pay('alice',await chain.match(m.chainId),'cancel');c=await waitMatch(m.chainId,c=>c.state==='Cancelled'&&c.payouts.every(p=>p.state==='Paid'));assert.equal(await balance('alice'),beforeRefund);assert.equal(c.payouts[1].amount,'0');await game.reconcile(m);
 report.checks.push('one-sided prestart cancellation: full original-depositor refund, zero opponent obligation');
 // Private callback spoof cannot forge Paid or reset attempts.
 const callback=await raw('alice',f.escrow,'on_payout',{match_id:m.chainId,index:0,attempt:'1'});assert(callback.status.Failure);assert.equal((await chain.match(m.chainId)).payouts[0].state,'Paid');
 report.checks.push('private payout callback forgery fails in actual Rust receipt');
 // Mutual cancellation validates changing nonces and returns both original stakes without a fee.
 m=await funded();await start(m);const refundFeeBefore=await balance('admin');await pay('alice',await chain.match(m.chainId),'mutual');const staleNonce=(await chain.match(m.chainId)).cancel_nonce;await pay('bob',await chain.match(m.chainId),'reject');const stale=await raw('bob',f.escrow,'confirm_mutual_cancel',{match_id:m.chainId,nonce:staleNonce},'1');assert(stale.status.Failure);await pay('alice',await chain.match(m.chainId),'mutual');await pay('bob',await chain.match(m.chainId),'mutual');await waitMatch(m.chainId,c=>c.state==='Cancelled'&&c.payouts.every(p=>p.state==='Paid'));assert.equal(await balance('admin'),refundFeeBefore);await game.reconcile(m);report.checks.push('mutual request/reject/re-request/confirm, stale nonce rejected, full refunds with zero fee');
 // Emergency revoke allows immediate refunds; backend must stop before sending a winner.
 m=await funded();await start(m);await raw('admin',f.escrow,'freeze_server');await game.reconcile(m);assert.equal(m.phase,'refund');assert.match(m.error,/frozen/i);await assert.rejects(chain.execute('frozen-result','submit_result',{match_id:m.chainId,winner:f.alice.id}),/frozen/);
 await pay('bob',await chain.match(m.chainId),'emergency');c=await waitMatch(m.chainId,c=>c.state==='Cancelled'&&c.payouts.every(p=>p.state==='Paid'));assert.equal(c.payouts[0].amount,'5000000');assert.equal(c.payouts[1].amount,'5000000');
 const ledger=await chain.view(f.escrow,'get_accounting');assert.equal(ledger.locked,'0');assert.equal(ledger.owed,'0');assert.equal(ledger.in_flight,'0');assert.equal(ledger.accepted,ledger.paid);
 report.checks.push('server_frozen stops worker/result and enables immediate player full refunds; final accounting drains exactly');
 report.accounting=ledger;report.escrowFtBalance=await chain.view(f.token,'ft_balance_of',{account_id:f.escrow});assert.equal(report.escrowFtBalance,'0');assert.equal((await balance('alice'))+(await balance('bob'))+(await balance('admin'))+(await balance('carol')),400000000n);
 report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{
 if(process.env.SANDBOX_REPORT)fs.writeFileSync(process.env.SANDBOX_REPORT,JSON.stringify(report,null,2));await close();
}
