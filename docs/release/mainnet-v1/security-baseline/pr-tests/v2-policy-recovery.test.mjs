// Immutable-candidate audit: real HTTP/adapter/reconciler, synthetic local receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
if(!process.env.AUDIT_PVP_ROOT)throw Error('Set AUDIT_PVP_ROOT to the reviewed local candidate');
const root=process.env.AUDIT_PVP_ROOT,url=name=>pathToFileURL(path.join(root,name)).href;
const {fixture}=await import(url('tests/fixture.mjs'));
const {EscrowV2Adapter}=await import(url('server/adapters/escrow-v2.mjs'));
const {createApp}=await import(url('server/http.mjs'));
const finance=await import(url('client/finance.mjs'));
async function setup(t){
 const f=fixture();t.after(()=>f.store.close());f.cfg.expectedFeeReceiver='admin.testnet';f.chain.cfg=f.cfg;
 const a=await f.game.create('alice.testnet','5','audit-v2-host');await f.game.join(a.code,'bob.testnet');
 const m=f.chain.matches.get(a.chainId);
 Object.assign(m,{created_at_ns:'1',joined_at_ns:'2',activity_confirmed:true,winner:null,game_deadline_ns:null,payouts:[{receiver:'alice.testnet',amount:'0',state:'Paid',attempt:'0'},{receiver:'admin.testnet',amount:'0',state:'Paid',attempt:'0'}]});
 const control={...f.chain.chainConfig,state_version:2,paused:false,server_frozen:false,pending_admin:null,pending_fee:null,last_heartbeat_ns:String(BigInt(f.now())*1000000n)};
 f.chain.adapter=new EscrowV2Adapter(f.cfg);f.chain.control=async()=>control;f.chain.chainConfig=control;f.chain.assertNetwork=async()=>{};
 f.chain.balance=async()=>({registered:true,balance:'20000000',hasGas:true,nearAvailable:'999999999999999999999999',storageMinimum:'1',gasReserve:'1'});
 f.chain.requireRegistered=async()=>{};
 const reads=[];f.chain.view=async(_receiver,method,_args,block)=>{reads.push({method,block});return method==='get_match'?structuredClone(m):{total:'1',available:'1'};};
 const app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{app.closeAllConnections();app.close(r);}));f.cfg.origin=`http://127.0.0.1:${app.address().port}`;
 f.store.put('session',createHash('sha256').update('v2-audit').digest('hex'),{account:'alice.testnet',scope:f.cfg.scope,csrf:'audit',expires:Date.now()+60000});
 const post=(route,body)=>fetch(f.cfg.origin+'/api/'+route,{method:'POST',headers:{origin:f.cfg.origin,cookie:'sl_session=v2-audit','x-csrf-token':'audit','content-type':'application/json'},body:JSON.stringify(body)});
 const request=async(kind,id='audit-payment-1')=>{const r=await post('escrow/matches/'+m.id+'/transaction',{id,kind,terms:{stake:m.stake,revision:m.revision,feeBps:m.fee_bps,opponent:m.opponent}});return {status:r.status,body:await r.json()};};
 return {f,m,control,reads,post,request};
}

test('POLICY: unapproved match fee or beneficiary cannot produce a deposit intent',async t=>{
 for(const mutation of [{fee_bps:400},{fee_receiver:'other.testnet'}]){
  const x=await setup(t);Object.assign(x.m,mutation);const r=await x.request('deposit');
  assert.equal(r.status,400);assert.match(r.body.error,/Unapproved/);assert.equal(x.f.store.all('payment').length,0);
 }
});

for(const reason of ['freeze','deadline'])test(`R07: HTTP v2 ${reason} permits immediate emergency refund with a fresh heartbeat`,async t=>{
 const x=await setup(t),now=BigInt(x.f.now())*1000000n;
 Object.assign(x.m,{state:'InProgress',deposited:[true,true],last_heartbeat_ns:String(now),game_deadline_ns:String(now+(reason==='deadline'?-1n:999999999999n))});
 x.control.server_frozen=reason==='freeze';x.control.paused=reason==='freeze';
 const r=await x.request('emergency');assert.equal(r.status,200);assert.equal(r.body.transaction.receiverId,x.f.cfg.escrow);
 assert.equal(r.body.transaction.actions[0].params.methodName,'request_emergency_refund');
 assert.deepEqual(r.body.transaction.actions[0].params.args,{match_id:x.m.id});
});

test('EXIT: changed admission policy does not prevent refund of an existing obligation',async t=>{
 const x=await setup(t);x.m.fee_bps=400;x.m.fee_receiver='previous-owner.testnet';
 x.control.fee_bps=500;x.control.paused=true;
 const r=await x.request('cancel');assert.equal(r.status,200);assert.equal(r.body.transaction.actions[0].params.methodName,'cancel_unstarted_match');
});

async function refundTransaction(x){
 const req=await x.request('deposit');assert.equal(req.status,200);const p=req.body.transaction.actions[0].params,hash='1'.repeat(32);
 const value=Buffer.from('"0"').toString('base64');
 const tx={transaction:{hash,signer_id:'alice.testnet',receiver_id:x.f.cfg.token,actions:[{FunctionCall:{method_name:p.methodName,deposit:p.deposit,args:Buffer.from(JSON.stringify(p.args)).toString('base64')}}]},transaction_outcome:{outcome:{receipt_ids:['root']}},final_execution_status:'FINAL',status:{SuccessValue:value},receipts_outcome:[
  {id:'root',block_hash:'receipt-block',outcome:{executor_id:x.f.cfg.token,receipt_ids:['receiver'],status:{SuccessReceiptId:'receiver'},logs:[]}},
  {id:'receiver',block_hash:'receipt-block',outcome:{executor_id:x.f.cfg.escrow,receipt_ids:['resolver'],status:{SuccessValue:Buffer.from('"5000000"').toString('base64')},logs:[]}},
  {id:'resolver',block_hash:'receipt-block',outcome:{executor_id:x.f.cfg.token,receipt_ids:[],status:{SuccessValue:value},logs:[]}}
 ]};
 x.f.chain.rpc=async(method,params)=>method==='tx'?tx:{header:{height:10,hash:params.block_id||'final-after-receipts'}};
 return {req,tx,hash};
}

test('R05: canonical successful resolver refund clears actual v2 client journal through HTTP',async t=>{
 const x=await setup(t),{req,hash}=await refundTransaction(x),records=new Map(),element={textContent:''};
 let source=fs.readFileSync(path.join(root,'client/app.mjs'),'utf8').replace(/^import .+;\r?$/gm,'');source=source.slice(0,source.lastIndexOf('init().catch'));
 source+='\nglobalThis.audit={setup(c,s){cfg=c;session=s;current=null;},reconcilePayment,pending};';
 const key=finance.pendingKey(x.f.cfg.scope,'alice.testnet');records.set(key,JSON.stringify({intentId:req.body.intentId,kind:'deposit',account:'alice.testnet',hash}));
 const context=vm.createContext({...finance,console,AbortSignal,Date,document:{getElementById:()=>element},localStorage:{getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)},fetch:async(_route,options)=>x.post('payment-status',JSON.parse(options.body))});
 vm.runInContext(source,context);context.audit.setup({scope:x.f.cfg.scope,escrowApi:'escrow-v2'},{account:'alice.testnet',csrf:'audit'});
 await context.audit.reconcilePayment();assert.equal(context.audit.pending(),null);assert.match(element.textContent,/refunded-by-resolver/);
 assert.ok(x.reads.some(r=>r.method==='get_match'&&r.block==='final-after-receipts'));
});

test('RECOVERY: failed resolver after incoming transfer never permits another payment',async t=>{
 const x=await setup(t),{req,tx,hash}=await refundTransaction(x);tx.status={Failure:{error_message:'resolver blocked'}};tx.receipts_outcome[2].outcome.status={Failure:{}};
 const r=await x.post('payment-status',{id:req.body.intentId,hash}),body=await r.json();assert.equal(r.status,200);assert.equal(body.state,'unknown');assert.equal(body.retrySafe,false);
 const next=await x.request('deposit','audit-payment-2');assert.equal(next.status,400);assert.match(next.body.error,/unresolved/);
});

test('RECOVERY: final head older than a receipt cannot resolve or unlock payment',async t=>{
 const x=await setup(t),{req,tx,hash}=await refundTransaction(x);
 x.f.chain.rpc=async(method,params)=>method==='tx'?tx:{header:{height:params.block_id?11:10,hash:'block'}};
 const r=await x.post('payment-status',{id:req.body.intentId,hash}),body=await r.json();assert.equal(body.state,'pending');assert.equal(body.retrySafe,false);assert.equal(body.resolved,undefined);
});

test('REPLAY: original intent survives changed chain state and cannot be reused for another match or action',async t=>{
 const x=await setup(t),first=await x.request('deposit');assert.equal(first.status,200);
 x.m.deposited[0]=true;
 const replay=await x.request('deposit');assert.equal(replay.status,200);assert.equal(replay.body.replay,true);assert.deepEqual(replay.body.transaction,first.body.transaction);
 const terms={stake:x.m.stake,revision:x.m.revision,feeBps:x.m.fee_bps,opponent:x.m.opponent};
 const wrong=await x.post('escrow/matches/2/transaction',{id:first.body.intentId,kind:'deposit',terms});assert.equal(wrong.status,400);assert.match((await wrong.json()).error,/reused/);
 const changed=await x.request('cancel');assert.equal(changed.status,400);assert.match(changed.body.error,/reused/);
 assert.equal(x.f.store.all('payment').length,1);
 const intent=x.f.store.all('payment')[0];intent.result={resolved:true,state:'accepted'};x.f.store.put('payment',intent.key,intent);
 const resolved=await x.request('deposit');assert.equal(resolved.status,200);assert.equal(resolved.body.alreadyResolved,true);assert.equal(resolved.body.transaction,undefined);
});

test('EXPOSURE R08: bounded slow historical reads before v2 heartbeat force a connected live game to refund',async t=>{
 const {playing}=await import(url('tests/fixture.mjs'));
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=200;
 const history=new Set();
 for(let i=0;i<360;i++){
  if(i===200)f.step(601000);
  const m=await f.game.create(`history${i}.testnet`,'1',`history-create-${i}`);history.add(m.chainId);
 }
 f.step(601000);const live=await playing(f),chainLive=f.chain.matches.get(live.chainId);
 chainLive.game_deadline_ns=String(BigInt(f.now()+21600000)*1000000n);
 f.chain.adapter=new EscrowV2Adapter(f.cfg);
 f.chain.control=async()=>({...f.chain.chainConfig,server_frozen:false,paused:false});
 const original=f.chain.match.bind(f.chain),pending=[];
 f.chain.match=id=>history.has(id)?new Promise(resolve=>pending.push(()=>resolve(original(id)))):original(id);
 const syncing=f.game.sync();
 const keepConnected=()=>{for(const account of live.players)f.game.snapshot(live.code,account,{touch:true});};
 // Each concurrent group completes within a simulated 20s read/retry budget.
 // Ninety groups consume 30 minutes, with authenticated liveness refreshed
 // continuously. No one query needs to hang for the entire interval.
 for(let batch=0;batch<90;batch++){
  await new Promise(r=>setImmediate(r));assert.equal(pending.length,4);
  for(let second=0;second<20;second++){keepConnected();f.step(1000);}
  pending.splice(0,4).forEach(release=>release());
 }
 await syncing;
 assert.equal(live.result,null);assert.equal(live.phase,'refund');assert.match(live.error,/Heartbeat expired/);
 assert.ok(f.chain.heartbeats.every(ids=>!ids.includes(live.chainId)));
});
