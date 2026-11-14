import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,playing} from './fixture.mjs';
import {Chain} from '../server/chain.mjs';
import {EscrowV2Adapter} from '../server/adapters/escrow-v2.mjs';
import {Account,KeyPair,Transaction,actions,baseEncode} from 'near-api-js';
import {createHash} from 'node:crypto';

test('R08: 360 slow historical lobbies cannot starve a connected v2 live heartbeat',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=200;const history=new Set();
 for(let i=0;i<360;i++){if(i===200)f.step(601000);const m=await f.game.create(`history${i}.testnet`,'1',`history-create-${i}`);history.add(m.chainId);}
 f.step(601000);const live=await playing(f),c=f.chain.matches.get(live.chainId);c.game_deadline_ns=String(BigInt(f.now()+21600000)*1000000n);
 f.chain.adapter=new EscrowV2Adapter(f.cfg);f.chain.control=async()=>({...f.chain.chainConfig,server_frozen:false,paused:false});
 const read=f.chain.match.bind(f.chain),execute=f.chain.execute.bind(f.chain),pending=[],heartbeats=[],visited=new Set();
 f.chain.match=id=>history.has(id)?new Promise(resolve=>{visited.add(id);pending.push(()=>resolve(read(id)));}):read(id);
 f.chain.execute=async(id,method,args)=>{if(method==='heartbeat'&&args.match_ids.includes(live.chainId))heartbeats.push(f.now());return execute(id,method,args);};
 for(let batch=0;batch<90;batch++){
  const syncing=f.game.sync();await new Promise(r=>setImmediate(r));
  assert.ok(pending.length>0&&pending.length<=4);assert.ok(heartbeats.length>0,'heartbeat precedes historical reads');
  for(let second=0;second<20;second++){for(const account of live.players)f.game.snapshot(live.code,account,{touch:true});f.step(1000);}
  pending.splice(0).forEach(release=>release());await syncing;
  assert.equal(live.phase,'playing');assert.equal(live.result,null);
 }
 assert.ok(visited.size>=200,'round-robin history still progresses');assert.ok(heartbeats.length>=40);
 assert.ok(heartbeats.slice(1).every((at,i)=>at-heartbeats[i]<=60000));
});

test('v2 priority reads recheck freeze and immutable deadline before renewing a match',async t=>{
 for(const reason of ['freeze-after-read','deadline']){
  const f=fixture();t.after(()=>f.store.close());const m=await playing(f),c=f.chain.matches.get(m.chainId);c.game_deadline_ns=String(BigInt(f.now()+(reason==='deadline'?-1:21600000))*1000000n);
  f.chain.adapter=new EscrowV2Adapter(f.cfg);let controls=0;
  f.chain.control=async()=>({...f.chain.chainConfig,paused:false,server_frozen:reason==='freeze-after-read'&&++controls>=2});
  const before=f.chain.heartbeats.length;await f.game.sync();assert.equal(m.phase,'refund');
  assert.ok(f.chain.heartbeats.slice(before).every(ids=>!ids.includes(m.chainId)));assert.equal(f.chain.results.length,0);
 }
});

test('v2 dispatcher gives queued heartbeat priority while preserving a single nonce owner',async t=>{
 const f=fixture();t.after(()=>f.store.close());const chain=new Chain({...f.cfg,rpc:'http://unused',adapterVersion:'escrow-v2'},f.store);
 let release;const gate=new Promise(r=>release=r),order=[];let active=0,peak=0;
 chain.executeSerial=async id=>{peak=Math.max(peak,++active);order.push(id);try{if(id==='first')await gate;return id;}finally{active--;}};
 const first=chain.execute('first','create_lobby',{}),second=chain.execute('second','create_lobby',{}),heartbeat=chain.execute('priority','heartbeat',{match_ids:[]}),third=chain.execute('third','bind_opponent',{});
 release();assert.deepEqual(await Promise.all([first,second,heartbeat,third]),['first','second','priority','third']);
 assert.deepEqual(order,['first','priority','second','third']);assert.equal(peak,1);
});

test('v2 heartbeat scheduling fairly covers more than 32 live IDs despite a slow read',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=60;const matches=[];
 for(let i=0;i<50;i++){
  const a=await f.game.create(`live${i}-a.testnet`,'1',`live-request-${i}`);await f.game.join(a.code,`live${i}-b.testnet`);
  const m=f.game.matches.get(a.code);f.chain.deposit(m.chainId);f.chain.matches.get(m.chainId).ready_at_ns=String(BigInt(f.now()-3100)*1000000n);await f.game.reconcile(m);
  f.chain.matches.get(m.chainId).game_deadline_ns=String(BigInt(f.now()+21600000)*1000000n);matches.push(m);
 }
 f.chain.adapter=new EscrowV2Adapter(f.cfg);f.chain.control=async()=>({...f.chain.chainConfig,paused:false,server_frozen:false});
 let release,held=false;const gate=new Promise(r=>release=r),read=f.chain.match.bind(f.chain);
 f.chain.match=async id=>{if(id===matches[0].chainId&&!held){held=true;await gate;}return read(id);};
 const before=f.chain.heartbeats.length,first=f.game.sync();await new Promise(r=>setImmediate(r));
 for(let second=0;second<20;second++){for(const m of matches)for(const player of m.players)f.game.snapshot(m.code,player,{touch:true});f.step(1000);}
 release();await first;await f.game.sync();const batches=f.chain.heartbeats.slice(before);
 assert.ok(batches.every(ids=>ids.length<=32));assert.equal(new Set(batches.flat()).size,50);assert.ok(matches.every(m=>m.phase==='playing'));
});

test('v2 priority never signs past an unknown signed predecessor and later reconciles its original bytes',async t=>{
 const f=fixture();t.after(()=>f.store.close());const cfg={...f.cfg,rpc:'http://unused',adapterVersion:'escrow-v2'},chain=new Chain(cfg,f.store);
 const key=KeyPair.fromRandom('ed25519'),signer=new Account(cfg.server,{},key.toString()).getSigner();
 const signed=async nonce=>(await signer.signTransaction(new Transaction({signerId:cfg.server,publicKey:key.getPublicKey(),receiverId:cfg.escrow,nonce,actions:[actions.functionCall('heartbeat',{match_ids:[]},250000000000000n,0n)],blockHash:new Uint8Array(32)}))).signedTransaction;
 const old=await signed(1n),bytes=Buffer.from(old.encode()).toString('base64');
 f.store.put('outbox','old-signed',{id:'old-signed',method:'heartbeat',args:{match_ids:[]},receiverId:cfg.escrow,accountId:cfg.server,deposit:'0',created:1,status:'signed',bytes,hash:baseEncode(createHash('sha256').update(old.transaction.encode()).digest())});
 chain.assertNetwork=async()=>{};chain.control=async()=>({server_frozen:false,paused:false});let signatures=0,known=false;const broadcasts=[];
 chain.account={createSignedTransaction:async()=>{signatures++;return signed(2n);}};
 chain.rpc=async(method,params)=>{if(method==='tx'){if(!known)throw Error('Unknown');return {final_execution_status:'FINAL',status:{SuccessValue:''}};}broadcasts.push(params.signed_tx_base64);if(!known)throw Error('RPC unavailable');return {final_execution_status:'FINAL',status:{SuccessValue:''}};};
 await assert.rejects(chain.execute('new-heartbeat','heartbeat',{match_ids:[]}),e=>e.pending);
 assert.equal(signatures,0);assert.deepEqual(broadcasts,[bytes]);assert.equal(f.store.get('outbox','old-signed').bytes,bytes);assert.equal(f.store.get('outbox','new-heartbeat'),null);
 known=true;await chain.execute('new-heartbeat','heartbeat',{match_ids:[]});assert.equal(signatures,1);assert.equal(f.store.get('outbox','old-signed').status,'done');assert.equal(f.store.get('outbox','new-heartbeat').status,'done');
});

test('v2 queued unsigned work rechecks revocation before any signature',async t=>{
 const f=fixture();t.after(()=>f.store.close());const chain=new Chain({...f.cfg,rpc:'http://unused',adapterVersion:'escrow-v2'},f.store);
 let release,frozen=false,signatures=0;const gate=new Promise(r=>release=r);chain.assertNetwork=async()=>{};
 chain.control=async()=>{await gate;return {server_frozen:frozen,paused:frozen};};chain.account={createSignedTransaction:async()=>{signatures++;throw Error('Unexpected signing');}};
 const first=chain.execute('queued-first','heartbeat',{match_ids:[]}),second=chain.execute('queued-second','heartbeat',{match_ids:[]});
 const results=Promise.allSettled([first,second]);frozen=true;release();assert.ok((await results).every(r=>r.status==='rejected'&&/frozen/.test(r.reason.message)));assert.equal(signatures,0);assert.equal(f.store.all('outbox').length,0);
});
