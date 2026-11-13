import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './fixture.mjs';
import {GameService} from '../server/service.mjs';
import {createApp} from '../server/http.mjs';
const create=(f,name,amount='5',visibility='public')=>f.game.create(name+'.testnet',amount,'request-'+name,visibility);
test('discovery is private by default, minimal, paginated, sorted and filtered; visibility survives restart',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await create(f,'alice','7'),b=await create(f,'bob','2');f.step(1000);const c=await create(f,'charlie','9');
 const secret=await create(f,'secret','5','private'),legacy=await create(f,'legacy','5','private');delete f.game.matches.get(legacy.code).visibility;f.game.save(f.game.matches.get(legacy.code));
 assert.equal((await f.game.lobbies()).total,3);
 const page=await f.game.lobbies({sort:'stake',order:'asc',limit:'1',offset:'1'});assert.equal(page.items[0].id,a.code);assert.equal(page.hasMore,true);assert.deepEqual(Object.keys(page.items[0]).sort(),['created','creator','id','stake','state']);
 assert.equal((await f.game.lobbies({sort:'created'})).items[0].id,c.code);
 assert.deepEqual((await f.game.lobbies({minStake:'8000000'})).items.map(m=>m.id),[c.code]);
 for(const query of [{limit:'0'},{limit:'51'},{offset:'-1'},{sort:'seed'},{minStake:'2.5'},{minStake:'10',maxStake:'1'}])await assert.rejects(()=>f.game.lobbies(query));
 await assert.rejects(()=>f.game.create('alice.testnet','7','request-alice','private'),/different terms/);
 const restored=new GameService(f.cfg,f.store,f.chain,f.now);assert.equal((await restored.lobbies()).total,3);assert.equal(restored.snapshot(secret.code,'secret.testnet').visibility,'private');assert.equal(restored.snapshot(legacy.code,'legacy.testnet').visibility,'private');
 await assert.rejects(()=>f.game.join(secret.code,'friend.testnet',{publicOnly:true}));await f.game.join(secret.code,'friend.testnet');assert.equal(f.game.matches.get(secret.code).players[1],'friend.testnet');
});
test('discovery refresh excludes cancelled, expired, occupied, started and failed chain reads',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await create(f,'cancelled'),b=await create(f,'expired'),c=await create(f,'started'),d=await create(f,'occupied');
 f.chain.matches.get(a.chainId).state='Cancelled';f.chain.matches.get(b.chainId).deadline_ns=String(BigInt(f.now())*1000000n);await f.game.join(d.code,'friend.testnet');
 const m=f.game.matches.get(c.code);m.phase='playing';f.game.save(m);
 assert.deepEqual((await f.game.lobbies()).items,[]);await assert.rejects(()=>f.game.join(b.code,'late.testnet'));
 const e=await create(f,'error');f.chain.match=async()=>{throw Error('RPC offline');};assert.deepEqual((await f.game.lobbies()).items,[]);await assert.rejects(()=>f.game.join(e.code,'reader.testnet'));
});
test('HTTP concurrent joins reserve one seat durably and remove it before chain binding completes',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await create(f,'alice'),secret=await create(f,'secret','5','private');
 const app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;
 for(const name of ['bob','charlie','observer'])f.store.put('session',createHash('sha256').update(name).digest('hex'),{account:name+'.testnet',csrf:name,expires:Date.now()+60000});
 const request=(path,name='observer',body)=>fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{cookie:'sl_session='+name,origin,'content-type':'application/json','x-csrf-token':name},...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.equal((await fetch(origin+'/api/lobbies')).status,401);
 assert.equal((await request('lobbies?visibility=private')).status,400);assert.equal((await request('lobbies?sort=stake&sort=created')).status,400);
 const before=await(await request('lobbies')).json();assert.equal(before.total,1);assert.equal(JSON.stringify(before).includes(secret.code),false);
 assert.equal((await request('lobbies/'+secret.code+'/join','bob',{})).status,400);
 let entered,release;const binding=new Promise(r=>entered=r),gate=new Promise(r=>release=r),execute=f.chain.execute.bind(f.chain);
 f.chain.execute=async(...args)=>{if(args[1]==='bind_opponent'){entered();await gate;}return execute(...args);};
 const first=request('lobbies/'+a.code+'/join','bob',{});await binding;
 try{
  assert.equal(f.store.get('match',a.code).players[1],'bob.testnet');
  assert.equal((await(await request('lobbies')).json()).total,0);
  const loser=await request('lobbies/'+a.code+'/join','charlie',{available:true});assert.equal(loser.status,400);
 }finally{release();}
 assert.equal((await first).status,200);assert.equal((await(await request('lobbies')).json()).total,0);
 assert.equal(f.game.matches.get(a.code).players[1],'bob.testnet');assert.equal((await request('matches/'+a.code)).status,400);
});
test('two joins racing across chain availability reads admit exactly one; one account cannot occupy two lobbies',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await create(f,'alice'),b=await create(f,'host');
 const results=await Promise.allSettled([f.game.join(a.code,'bob.testnet'),f.game.join(a.code,'charlie.testnet')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const winner=f.game.matches.get(a.code).players[1];await assert.rejects(()=>f.game.join(b.code,winner));
 const c=await create(f,'other');const same=await Promise.allSettled([f.game.join(b.code,'new.testnet'),f.game.join(c.code,'new.testnet')]);assert.equal(same.filter(r=>r.status==='fulfilled').length,1);
});
test('HTTP creation persists visibility and discovery coalesces simultaneous reads without chain writes',async t=>{
 const f=fixture();t.after(()=>f.store.close());const app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;
 f.store.put('session',createHash('sha256').update('host').digest('hex'),{account:'host.testnet',csrf:'csrf',expires:Date.now()+60000});
 const post=body=>fetch(origin+'/api/matches',{method:'POST',headers:{origin,cookie:'sl_session=host','content-type':'application/json','x-csrf-token':'csrf'},body:JSON.stringify(body)});
 assert.equal((await post({amount:'5',id:'request-invalid',visibility:'secret'})).status,400);
 const created=await(await post({amount:'5',id:'request-valid',visibility:'public'})).json();assert.equal(created.visibility,'public');assert.equal(f.store.get('match',created.code).visibility,'public');
 let release;const gate=new Promise(r=>release=r),read=f.chain.match.bind(f.chain);let reads=0;f.chain.match=async id=>{reads++;await gate;return read(id);};const operations=f.chain.operations.size;
 const a=f.game.lobbies(),b=f.game.lobbies();release();assert.equal((await a).total,1);assert.equal((await b).total,1);assert.equal(reads,1);assert.equal(f.chain.operations.size,operations);
});
