// Local-only attack/guard suite for the first integrated immutable candidate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.env.AUDIT_PVP_ROOT)throw Error('Set AUDIT_PVP_ROOT to a disposable reviewed candidate checkout');
const url=name=>pathToFileURL(path.join(process.env.AUDIT_PVP_ROOT,name)).href;
const {fixture,playing}=await import(url('tests/fixture.mjs'));
const {Chain}=await import(url('server/chain.mjs'));
const {createApp}=await import(url('server/http.mjs'));
const {GameService}=await import(url('server/service.mjs'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('GUARD A03: expired unpaid lobbies free global capacity but keep original participants reserved',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=2;
 await f.game.create('alice.testnet','1','unpaid-alice-request');await f.game.create('bob.testnet','1','unpaid-bob-request');
 f.step(601000);await f.game.sync();
 assert.equal([...f.game.matches.values()].filter(m=>f.game.holdsSlot(m)).length,0);
 assert.equal((await f.game.create('honest.testnet','1','unpaid-honest-request')).phase,'lobby');
 await assert.rejects(f.game.create('alice.testnet','1','unpaid-recreate-request'),/current match/);
});

test('EXPOSURE A03: one-sided funded expired lobbies still exhaust global capacity',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=2;
 for(let i=0;i<2;i++){
  const a=await f.game.create(`host${i}.testnet`,'1',`funded-host-request-${i}`);
  await f.game.join(a.code,`guest${i}.testnet`);
  f.chain.matches.get(a.chainId).deposited[0]=true;
 }
 f.step(601000);await f.game.sync();
 assert.equal([...f.game.matches.values()].filter(m=>f.game.holdsSlot(m)).length,2);
 await assert.rejects(f.game.create('honest.testnet','1','funded-honest-request'),/full/);
 assert.equal(f.chain.results.length,0);
});

test('EXPOSURE A03: stale unpaid cache is not a proof of absence of final deposits',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=1;
 const a=await f.game.create('host.testnet','1','stale-host-request');await f.game.join(a.code,'guest.testnet');
 // Incoming deposit is already final on the chain fixture, but the polling worker
 // has not observed it. No chain state is changed by this capacity decision.
 f.chain.matches.get(a.chainId).deposited[0]=true;f.step(601000);
 assert.equal(f.game.holdsSlot(f.game.matches.get(a.code)),false);
 assert.equal((await f.game.create('honest.testnet','1','stale-honest-request')).phase,'lobby');
 assert.equal(f.chain.matches.get(a.chainId).deposited[0],true);
});

test('EXPOSURE R01: one failed catalog read discards TTL and permits repeated full refreshes',async t=>{
 const f=fixture();t.after(()=>f.store.close());
 for(let i=0;i<8;i++)await f.game.create(`host${i}.testnet`,'1',`failed-cache-host-${i}`,'public');
 const original=f.chain.match.bind(f.chain);let reads=0;
 f.chain.match=async id=>{reads++;if(id==='1')throw Error('isolated RPC failure');return original(id);};
 for(let i=0;i<5;i++)assert.equal((await f.game.lobbies({limit:'1'})).total,7);
 assert.equal(reads,40);
});

test('EXPOSURE R01: cache generations exceed four RPCs even with real Chain in-flight deduplication',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=20;
 for(let i=0;i<8;i++)await f.game.create(`host${i}.testnet`,'1',`generation-host-${i}`,'public');
 const oldGate=deferred(),newGate=deferred(),oldStarted=deferred(),newStarted=deferred();
 let phase='first',active=0,peak=0,oldCount=0,newCount=0;
 const real=new Chain({...f.cfg,rpc:'https://unused.invalid'},f.store);
 real.view=async(_receiver,_method,args)=>{
  const id=Number(args.match_id);active++;peak=Math.max(peak,active);
  try{
   if(phase==='first'&&id>=5&&id<=8){if(++oldCount===4)oldStarted.resolve();await oldGate.promise;}
   else if(phase==='second'&&id<=4){if(++newCount===4)newStarted.resolve();await newGate.promise;}
   return structuredClone(f.chain.matches.get(String(id)));
  }finally{active--;}
 };
 f.chain.match=real.match.bind(real);
 const first=f.game.lobbies();await oldStarted.promise;
 // A real create changes the candidate-list cache key while old reads are pending.
 await f.game.create('newhost.testnet','1','generation-new-host','public');phase='second';
 const second=f.game.lobbies();
 try{await newStarted.promise;assert.equal(active,8);assert.ok(peak>=8);}
 finally{oldGate.resolve();newGate.resolve();await Promise.all([first,second]);}
});

test('EXPOSURE A04: two valid sessions for the same account receive independent 45-request budgets',async t=>{
 const f=fixture();t.after(()=>f.store.close());const server=createApp(f.cfg,f.store,f.chain,f.game);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 f.cfg.origin=`http://127.0.0.1:${server.address().port}`;
 const realNow=Date.now,at=realNow();Date.now=()=>at;t.after(()=>{Date.now=realNow;});
 for(const token of ['session-a','session-b'])f.store.put('session',createHash('sha256').update(token).digest('hex'),{account:'same-wallet.testnet',scope:f.cfg.scope,expires:at+60000});
 for(const token of ['session-a','session-b'])for(let i=0;i<45;i++)assert.equal((await fetch(f.cfg.origin+'/api/auth/session',{headers:{cookie:'sl_session='+token}})).status,200);
});

test('GUARD PR4: failed outer group commit rolls back both matches and all durable command IDs',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await playing(f);
 const b=await f.game.create('charlie.testnet','5','batch-other-match');await f.game.join(b.code,'dave.testnet');
 const n=f.game.matches.get(b.code);f.chain.deposit(n.chainId);f.step(3100);await f.game.reconcile(n);
 const before=[a,n].map(m=>structuredClone({states:m.states,revision:m.revision,sequences:m.sequences,seen:m.seen}));
 const transaction=f.store.transaction.bind(f.store);let fail=true;
 f.store.transaction=fn=>{const outer=!f.store.depth;return transaction(()=>{const result=fn();if(outer&&fail){fail=false;throw Error('audit disk commit failure');}return result;});};
 const requests=[a,n].map((m,i)=>f.game.enqueueCommand(m.code,m.players[0],{id:`audit-group-${i}`,sequence:1,command:{type:'plant',plant:'oil',enabled:false}}));
 const results=await Promise.allSettled(requests);assert.ok(results.every(r=>r.status==='rejected'));
 [a,n].forEach((m,i)=>{assert.deepEqual({states:m.states,revision:m.revision,sequences:m.sequences,seen:m.seen},before[i]);assert.equal(f.store.command(m.code,m.players[0],`audit-group-${i}`),null);});
});

test('EXPOSURE P4-01: elapsed pre-pump recovery time is replayed after both players reconnect',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f);f.game.checkpoint();
 const restored=new GameService(f.cfg,f.store,f.chain,f.now),n=restored.matches.get(m.code),before=n.states[0].time;
 // Represents elapsed startup/warmup or a pump stall before the recovered game
 // is first advanced. No new gameplay time should accrue while recovering.
 f.step(30000);restored.snapshot(n.code,'alice.testnet',{touch:true});restored.snapshot(n.code,'bob.testnet',{touch:true});
 for(let i=0;i<60;i++)restored.advance();
 assert.equal(n.recovering,false);assert.ok(n.states[0].time-before>29);
 assert.equal(n.states[0].time,n.states[1].time);
});
