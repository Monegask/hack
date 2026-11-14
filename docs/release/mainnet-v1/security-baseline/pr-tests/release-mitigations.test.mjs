// Positive retests of the attacks against 4149986. No signer or public RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.env.AUDIT_PVP_ROOT)throw Error('Set AUDIT_PVP_ROOT to the immutable reviewed local candidate');
const url=name=>pathToFileURL(path.join(process.env.AUDIT_PVP_ROOT,name)).href;
const {fixture,playing}=await import(url('tests/fixture.mjs'));
const {Chain}=await import(url('server/chain.mjs'));
const {GameService}=await import(url('server/service.mjs'));
const {createApp}=await import(url('server/http.mjs'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('MITIGATION R01: failed reads retain negative TTL instead of five full sequential refreshes',async t=>{
 const f=fixture();t.after(()=>f.store.close());
 for(let i=0;i<8;i++)await f.game.create(`host${i}.testnet`,'1',`negative-ttl-host-${i}`,'public');
 const original=f.chain.match.bind(f.chain);let calls=0;
 f.chain.match=async id=>{calls++;if(id==='1')throw Error('RPC unavailable for one match');return original(id);};
 for(let i=0;i<5;i++)assert.equal((await f.game.lobbies({limit:'1'})).total,7);
 assert.equal(calls,8);f.step(2001);assert.equal((await f.game.lobbies()).total,7);assert.equal(calls,16);
});

test('MITIGATION R01: a changed catalogue shares the pending generation and never starts eight reads',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=20;
 for(let i=0;i<8;i++)await f.game.create(`host${i}.testnet`,'1',`single-generation-${i}`,'public');
 const gate=deferred(),started=deferred();let active=0,peak=0,held=0,earlyReads=0;
 const real=new Chain({...f.cfg,rpc:'https://unused.invalid'},f.store);
 real.view=async(_receiver,_method,args)=>{
  const id=Number(args.match_id);active++;peak=Math.max(peak,active);
  try{if(id<=4)earlyReads++;if(id>=5&&id<=8){if(++held===4)started.resolve();await gate.promise;}return structuredClone(f.chain.matches.get(String(id)));}
  finally{active--;}
 };
 f.chain.match=real.match.bind(real);const first=f.game.lobbies();await started.promise;
 await f.game.create('newhost.testnet','1','single-generation-new','public');const second=f.game.lobbies();
 // Allow async continuations to run. Pending generation must stay shared even
 // when key changes. A final refresh must eventually include the new lobby.
 await new Promise(r=>setImmediate(r));
 assert.equal(earlyReads,4);assert.equal(active,4);assert.ok(peak<=5); // create's independent chain read adds at most one.
 gate.resolve();const pages=await Promise.all([first,second]);assert.ok(pages.every(p=>p.total===8));
 assert.equal((await f.game.lobbies()).total,9);assert.equal(earlyReads,8);
});

test('MITIGATION A04: 45 shared account requests across two sessions block the 46th without blocking another wallet',async t=>{
 const f=fixture();t.after(()=>f.store.close());const server=createApp(f.cfg,f.store,f.chain,f.game);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 f.cfg.origin=`http://127.0.0.1:${server.address().port}`;
 const realNow=Date.now,at=realNow();Date.now=()=>at;t.after(()=>{Date.now=realNow;});
 for(const [token,account] of [['first','same.testnet'],['second','same.testnet'],['other','other.testnet']])f.store.put('session',createHash('sha256').update(token).digest('hex'),{account,scope:f.cfg.scope,expires:at+60000});
 const request=token=>fetch(f.cfg.origin+'/api/auth/session',{headers:{cookie:'sl_session='+token}});
 for(let i=0;i<45;i++)assert.equal((await request(i%2?'first':'second')).status,200);
 assert.equal((await request('second')).status,429);assert.equal((await request('other')).status,200);
});

test('MITIGATION P4-01: separately resumed real matches do not share recovery time, while earlier-resumed game catches up',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await playing(f);
 const other=await f.game.create('charlie.testnet','5','resume-second-game');await f.game.join(other.code,'dave.testnet');
 const b=f.game.matches.get(other.code);f.chain.deposit(b.chainId);f.step(3100);await f.game.reconcile(b);f.game.checkpoint();
 const restored=new GameService(f.cfg,f.store,f.chain,f.now),late=restored.matches.get(a.code),early=restored.matches.get(b.code);
 for(const player of early.players)restored.snapshot(early.code,player,{touch:true});f.step(100);restored.advance();
 assert.equal(early.recovering,false);assert.equal(late.recovering,true);
 const beforeLate=late.states[0].time,beforeEarly=early.states[0].time;
 f.step(30000);for(const m of [late,early])for(const player of m.players)restored.snapshot(m.code,player,{touch:true});
 for(let i=0;i<61;i++)restored.advance();
 assert.equal(late.recovering,false);assert.equal(late.states[0].time,beforeLate);assert.ok(early.states[0].time-beforeEarly>29);
 f.step(200);restored.advance();assert.ok(late.states[0].time>beforeLate);assert.ok(late.states[0].time-beforeLate<=.21);
});
