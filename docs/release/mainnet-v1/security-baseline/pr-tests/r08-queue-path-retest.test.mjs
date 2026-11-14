// Safe local retests: no real credentials and no public network access.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
if(!process.env.AUDIT_PVP_ROOT)throw Error('Set AUDIT_PVP_ROOT to the immutable candidate');
const root=process.env.AUDIT_PVP_ROOT,url=name=>pathToFileURL(path.join(root,name)).href;
const require=createRequire(path.join(root,'package.json'));
const {Account,KeyPair,Transaction,SignedTransaction,actions,baseEncode}=require('near-api-js');
const {fixture,playing}=await import(url('tests/fixture.mjs'));
const {Chain}=await import(url('server/chain.mjs'));
const {EscrowV2Adapter}=await import(url('server/adapters/escrow-v2.mjs'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('R08 CLOSED: connected live game retains heartbeat through 90 slow-history cycles, with bounded history progress',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=200;const history=new Set();
 for(let i=0;i<360;i++){if(i===200)f.step(601000);const m=await f.game.create(`old${i}.testnet`,'1',`r08-old-request-${i}`);history.add(m.chainId);}
 f.step(601000);const live=await playing(f);f.chain.matches.get(live.chainId).game_deadline_ns=String(BigInt(f.now()+21600000)*1000000n);
 f.chain.adapter=new EscrowV2Adapter(f.cfg);f.chain.control=async()=>({...f.chain.chainConfig,paused:false,server_frozen:false});
 const read=f.chain.match.bind(f.chain),execute=f.chain.execute.bind(f.chain),pending=[],visited=new Set(),heartbeats=[];
 f.chain.match=id=>history.has(id)?new Promise(resolve=>{visited.add(id);pending.push(()=>resolve(read(id)));}):read(id);
 f.chain.execute=async(id,method,args)=>{if(method==='heartbeat'&&args.match_ids.includes(live.chainId))heartbeats.push(f.now());return execute(id,method,args);};
 for(let cycle=0;cycle<90;cycle++){
  const syncing=f.game.sync();await new Promise(r=>setImmediate(r));
  assert.ok(pending.length>0&&pending.length<=4);assert.ok(heartbeats.length>0);
  for(let second=0;second<20;second++){for(const player of live.players)f.game.snapshot(live.code,player,{touch:true});f.step(1000);}
  pending.splice(0).forEach(release=>release());await syncing;assert.equal(live.phase,'playing');assert.equal(live.result,null);
 }
 assert.ok(heartbeats.length>=40);assert.ok(heartbeats.slice(1).every((at,i)=>at-heartbeats[i]<=60000));
 assert.ok(visited.size>=200);assert.ok(f.game.metrics.v2SyncCycles>=90);
});

test('R08 FAIRNESS: 65 live matches including a slow first read receive bounded batches with no forgotten tail',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=70;const live=[];
 for(let i=0;i<65;i++){
  const a=await f.game.create(`fair${i}-a.testnet`,'1',`fair-live-create-${i}`);await f.game.join(a.code,`fair${i}-b.testnet`);
  const m=f.game.matches.get(a.code);f.chain.deposit(m.chainId);f.chain.matches.get(m.chainId).ready_at_ns=String(BigInt(f.now()-3100)*1000000n);await f.game.reconcile(m);
  f.chain.matches.get(m.chainId).game_deadline_ns=String(BigInt(f.now()+21600000)*1000000n);live.push(m);
 }
 f.chain.adapter=new EscrowV2Adapter(f.cfg);f.chain.control=async()=>({...f.chain.chainConfig,paused:false,server_frozen:false});
 const gate=deferred(),entered=deferred(),read=f.chain.match.bind(f.chain);let held=false;
 f.chain.match=async id=>{if(id===live[0].chainId&&!held){held=true;entered.resolve();await gate.promise;}return read(id);};
 const before=f.chain.heartbeats.length,first=f.game.sync();await entered.promise;
 for(let second=0;second<20;second++){for(const m of live)for(const player of m.players)f.game.snapshot(m.code,player,{touch:true});f.step(1000);}
 gate.resolve();await first;await f.game.sync();await f.game.sync();
 const batches=f.chain.heartbeats.slice(before);assert.ok(batches.every(ids=>ids.length<=32));assert.equal(new Set(batches.flat()).size,65);assert.ok(live.every(m=>m.phase==='playing'));
});

async function signerFixture(t){
 const f=fixture();t.after(()=>f.store.close());const cfg={...f.cfg,rpc:'https://unused.invalid',adapterVersion:'escrow-v2',expectedFeeReceiver:'admin.testnet'};
 const chain=new Chain(cfg,f.store),pair=KeyPair.fromRandom('ed25519'),signer=new Account(cfg.server,{},pair.toString()).getSigner();
 const signed=async(nonce,method='heartbeat',args={match_ids:[]})=>(await signer.signTransaction(new Transaction({signerId:cfg.server,publicKey:pair.getPublicKey(),receiverId:cfg.escrow,nonce,actions:[actions.functionCall(method,args,250000000000000n,0n)],blockHash:new Uint8Array(32)}))).signedTransaction;
 const old=[];for(const nonce of [8n,7n]){const tx=await signed(nonce),id='old-nonce-'+nonce,op={id,method:'heartbeat',args:{match_ids:[]},receiverId:cfg.escrow,accountId:cfg.server,deposit:'0',created:Number(nonce),status:'signed',bytes:Buffer.from(tx.encode()).toString('base64'),hash:baseEncode(createHash('sha256').update(tx.transaction.encode()).digest())};f.store.put('outbox',id,op);old.push(op);}
 chain.assertNetwork=async()=>{};chain.control=async()=>({server_frozen:false,paused:false,fee_bps:300,admin:'admin.testnet'});chain.requireRegistered=async()=>{};chain.controlBlock={hash:'mock-final'};
 const signs=[];let next=9n;chain.account={createSignedTransaction:async({actions:as})=>{const call=as[0].functionCall,method=call.methodName,args=JSON.parse(Buffer.from(call.args).toString());signs.push({nonce:next,method});return signed(next++,method,args);}};
 return {f,cfg,chain,signed,old,signs};
}

test('QUEUE: two persisted nonces reconcile ascending before unsigned heartbeat priority, with one dispatcher owner',async t=>{
 const x=await signerFixture(t),gate=deferred(),queries=[],sends=[];let entered=false,active=0,peak=0;
 x.chain.assertNetwork=async()=>{if(!entered){entered=true;await gate.promise;}};
 x.chain.rpc=async(method,params)=>{active++;peak=Math.max(peak,active);try{
  if(method==='tx'){const op=x.old.find(op=>op.hash===params.tx_hash);queries.push(op.id);return {final_execution_status:'FINAL',status:{SuccessValue:''}};}
  const tx=SignedTransaction.decode(Buffer.from(params.signed_tx_base64,'base64'));sends.push({nonce:tx.transaction.nonce,method:tx.transaction.actions[0].functionCall.methodName});return {final_execution_status:'FINAL',status:{SuccessValue:''}};
 }finally{active--;}};
 const first=x.chain.execute('first-ordinary','record_activity',{match_id:'1'}),second=x.chain.execute('second-ordinary','record_activity',{match_id:'2'}),heartbeat=x.chain.execute('urgent-heartbeat','heartbeat',{match_ids:['1']});
 gate.resolve();await Promise.all([first,second,heartbeat]);
 assert.deepEqual(queries,['old-nonce-7','old-nonce-8']);assert.deepEqual(sends.map(x=>x.nonce),[9n,10n,11n]);assert.deepEqual(sends.map(x=>x.method),['record_activity','heartbeat','record_activity']);assert.equal(peak,1);
 assert.equal(x.f.store.pendingOutbox().length,0);
});

test('QUEUE: unknown lowest nonce prevents both queued heartbeat and ordinary new signatures',async t=>{
 const x=await signerFixture(t),sent=[];
 x.chain.rpc=async(method,params)=>{if(method==='tx')throw Error('Unknown receipt');sent.push(params.signed_tx_base64);throw Error('Ambiguous broadcast');};
 const results=await Promise.allSettled([x.chain.execute('new-ordinary','record_activity',{match_id:'1'}),x.chain.execute('new-hb','heartbeat',{match_ids:['1']})]);
 assert.ok(results.every(r=>r.status==='rejected'&&r.reason.pending));assert.equal(x.signs.length,0);
 assert.ok(sent.length>0&&sent.every(bytes=>bytes===x.old.find(op=>op.id==='old-nonce-7').bytes));
 assert.equal(x.f.store.get('outbox','new-ordinary'),null);assert.equal(x.f.store.get('outbox','new-hb'),null);assert.equal(x.f.store.pendingOutbox().length,2);
});

test('K1: dot-dot-prefixed child is rejected as internal; an external empty fixture fails credential parsing',async t=>{
 const f=fixture();t.after(()=>f.store.close());const project=fs.realpathSync(path.resolve(root,'../../..'));
 const inside=fs.mkdtempSync(path.join(project,'..signer-audit-')),outside=fs.mkdtempSync(path.join(path.dirname(project),'external-empty-audit-'));
 const insideFile=path.join(inside,'fixture.json'),outsideFile=path.join(outside,'fixture.json');fs.writeFileSync(insideFile,'');fs.writeFileSync(outsideFile,'');
 t.after(()=>{for(const [directory,file] of [[inside,insideFile],[outside,outsideFile]]){assert.equal(path.dirname(file),directory);fs.rmSync(file);fs.rmdirSync(directory);}});
 const wasm=fs.readFileSync(path.join(project,'contracts/near-pvp-escrow/artifacts/near_pvp_escrow.wasm'));
 const make=keyFile=>{const cfg={...f.cfg,rpc:'https://unused.invalid',keyFile},chain=new Chain(cfg,f.store);chain.rpc=async method=>method==='status'?{chain_id:'testnet'}:{code_hash:baseEncode(createHash('sha256').update(wasm).digest())};chain.view=async(_receiver,method)=>method==='get_config'?{token:cfg.token,server:cfg.server,paused:false}:method==='ft_metadata'?{decimals:6,symbol:'TEST'}:{total:'1'};return chain;};
 await assert.rejects(make(insideFile).preflight(),/Signer must be outside the project/);
 await assert.rejects(make(outsideFile).preflight(),/credential is unreadable or malformed/);
});
