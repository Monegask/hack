import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,playing} from './fixture.mjs';
import {Chain} from '../server/chain.mjs';
import {createApp} from '../server/http.mjs';
import {createHash} from 'node:crypto';

test('fixed-step backlog is retained and caught up without changing either player time',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f),before=m.states[0].time;
 f.step(1700);assert.ok(f.game.metrics.backlogMs>=1100);assert.ok(m.states[0].time-before<.6);
 for(let i=0;i<4;i++)f.game.advance();assert.ok(f.game.metrics.backlogMs<101);assert.ok(m.states[0].time-before>1.59);assert.equal(m.states[0].time,m.states[1].time);
});
test('grouped command commit preserves ordering, retries and rolls every world back on failed outer commit',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f),req={id:'command-batch-001',sequence:1,command:{type:'buyTruck'}};
 const [a,b]=await Promise.all([f.game.enqueueCommand(m.code,m.players[0],req),f.game.enqueueCommand(m.code,m.players[0],req)]);assert.deepEqual(a,b);assert.equal(m.sequences[0],1);
 const before=structuredClone(m),transaction=f.store.transaction.bind(f.store);let fail=true;
 f.store.transaction=fn=>{const outer=!f.store.depth;return transaction(()=>{const value=fn();if(fail&&outer){fail=false;throw Error('injected commit failure');}return value;});};
 await assert.rejects(f.game.enqueueCommand(m.code,m.players[0],{...req,id:'command-batch-002',sequence:2}),/injected/);
 assert.deepEqual(m.states,before.states);assert.deepEqual(m.sequences,before.sequences);assert.equal(m.revision,before.revision);
 assert.equal(f.store.command(m.code,m.players[0],'command-batch-002'),null);
 assert.equal((await f.game.enqueueCommand(m.code,m.players[0],{...req,id:'command-batch-002',sequence:2})).sequence,2);
});
test('dirty checkpoints use one commit and skip unchanged snapshots',async t=>{
 const f=fixture();t.after(()=>f.store.close());await playing(f);f.step(100);const n=f.store.metrics.transactions;f.game.checkpoint();assert.equal(f.store.metrics.transactions,n+1);f.game.checkpoint();assert.equal(f.store.metrics.transactions,n+1);
});
test('50 concurrent lobbies reserve the global cap and seat before awaiting chain work',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=50;
 const created=await Promise.allSettled(Array.from({length:100},(_,i)=>f.game.create('host-'+i+'.testnet','5','mass-create-'+i)));
 assert.equal(created.filter(r=>r.status==='fulfilled').length,50);assert.equal(f.chain.matches.size,50);
 await Promise.all([...f.game.matches.values()].map(async(m,i)=>{
  const joined=await Promise.allSettled([f.game.join(m.code,'guest-'+i+'.testnet'),f.game.join(m.code,'other-'+i+'.testnet')]);assert.equal(joined.filter(r=>r.status==='fulfilled').length,1);
  // Repeated finalized deposit observation cannot create two starts.
  f.chain.deposit(m.chainId);f.chain.deposit(m.chainId);f.chain.matches.get(m.chainId).ready_at_ns=String(BigInt(f.now()-3100)*1000000n);await Promise.all([f.game.reconcile(m),f.game.reconcile(m)]);assert.equal(m.phase,'playing');
 }));
 assert.equal([...f.chain.operations.keys()].filter(k=>k.endsWith(':start')).length,50);
});
test('RPC match reads share only in-flight work; chain time shares a final block and evicts failure',async()=>{
 const chain=new Chain({rpc:'http://invalid',escrow:'escrow.testnet'},null);let reads=0,blocks=0;
 chain.view=async()=>{reads++;await new Promise(r=>setTimeout(r,1));return {state:'AwaitingDeposits'};};chain.rpc=async()=>{blocks++;return {header:{timestamp_nanosec:'1800000000000000000'}};};
 await Promise.all([chain.match('1'),chain.match('1')]);assert.equal(reads,1);await chain.match('1');assert.equal(reads,2);
 await Promise.all([chain.chainTime(),chain.chainTime()]);assert.equal(blocks,1);chain.blockTime.at=0;chain.rpc=async()=>{throw Error('unavailable');};await assert.rejects(chain.chainTime());assert.equal(chain.blockTime,null);
});
test('metadata, gzip and conditional polling preserve auth and reconnect touch behind a shared IP',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f),server=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;f.cfg.origin=origin;
 for(let i=0;i<2;i++)f.store.put('session',createHash('sha256').update('load-'+i).digest('hex'),{account:m.players[i],expires:Date.now()+60000});
 const headers={cookie:'sl_session=load-0','accept-encoding':'gzip'},url=origin+'/api/matches/'+m.code;
 const full=await fetch(url,{headers});assert.equal(full.headers.get('content-encoding'),'gzip');const snap=await full.json();assert.ok(snap.states);const etag=full.headers.get('etag');
 const compact=await fetch(url+'?view=metadata',{headers});const meta=await compact.json();assert.equal(meta.hasStates,true);assert.equal(meta.states,undefined);
 f.step(1);assert.equal((await fetch(url,{headers:{...headers,'if-none-match':etag}})).status,304);assert.equal(m.seen[0],f.now());assert.equal((await fetch(url,{headers:{'if-none-match':etag}})).status,401);
 // 30 requests each share a NAT address but retain independent authenticated budgets.
 for(let i=0;i<60;i++){const r=await fetch(url,{headers:{cookie:'sl_session=load-'+i%2}});assert.equal(r.status,200);}
});

test('failed heartbeat batch cannot starve expired-match reconciliation',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f),execute=f.chain.execute.bind(f.chain);
 f.chain.matches.get(m.chainId).last_heartbeat_ns=String(BigInt(f.now()-1800001)*1000000n);
 f.chain.execute=async(id,method,args)=>{if(method==='heartbeat'&&args.match_ids.length)throw Error('expired batch');return execute(id,method,args);};
 await assert.rejects(f.game.sync(),/expired batch/);assert.equal(m.phase,'refund');await f.game.sync();assert.equal(f.chain.results.length,0);
});
test('broadcast checks durable ownership immediately before sending signed bytes',()=>{
 const chain=new Chain({rpc:'http://invalid'},{assertLease(){throw Error('lease lost');}});
 assert.throws(()=>chain.rpc('send_tx',{}),/lease lost/);
});
