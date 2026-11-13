import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture,playing} from './fixture.mjs';
import {createApp} from '../server/http.mjs';
import {GameService} from '../server/service.mjs';
import {Account,KeyPair} from 'near-api-js';
import {signMessage} from 'near-api-js/nep413';

test('release: two distinct NEP413 wallets discover and join one public lobby over HTTP',async t=>{
 const f=fixture();t.after(()=>f.store.close());const app=createApp(f.cfg,f.store,f.chain,f.game);
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;
 async function login(id){
  const pair=KeyPair.fromRandom('ed25519'),wallet=new Account(id,{},pair.toString());f.chain.keys.set(id,pair.getPublicKey().toString());
  const post=(route,body,cookie='',csrf='')=>fetch(origin+'/api/'+route,{method:'POST',headers:{origin,'content-type':'application/json',cookie,'x-csrf-token':csrf},body:JSON.stringify(body)});
  const response=await post('auth/challenge',{}),challenge=await response.json(),cookie=response.headers.getSetCookie()[0].split(';')[0];
  const signed=await signMessage({signerAccount:wallet,payload:{message:challenge.message,recipient:challenge.recipient,nonce:Buffer.from(challenge.nonce,'base64')}});
  const verified=await post('auth/verify',{challengeId:challenge.id,signed:{accountId:id,publicKey:signed.publicKey.toString(),signature:Buffer.from(signed.signature).toString('base64')}},cookie);
  assert.equal(verified.status,200);const session=await verified.json(),sessionCookie=verified.headers.getSetCookie().find(c=>c.startsWith('sl_session')).split(';')[0];
  return {get:route=>fetch(origin+'/api/'+route,{headers:{cookie:sessionCookie}}),post:(route,body)=>post(route,body,sessionCookie,session.csrf)};
 }
 const [host,guest]=await Promise.all([login('release-host.testnet'),login('release-guest.testnet')]);
 const created=await host.post('matches',{amount:'5',id:'two-wallet-release',visibility:'public'});assert.equal(created.status,200);const lobby=await created.json();
 const publicList=await(await guest.get('lobbies')).json();assert.equal(publicList.items[0].id,lobby.code);
 const joined=await guest.post('lobbies/'+lobby.code+'/join',{});assert.equal(joined.status,200);
 assert.deepEqual((await joined.json()).players,['release-host.testnet','release-guest.testnet']);
 assert.equal((await(await guest.get('lobbies')).json()).total,0);
});

test('release: one deposit never starts a game; both deposits enforce the full three-second countdown',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await f.game.create('alice.testnet','5','release-countdown');
 await f.game.join(a.code,'bob.testnet');const m=f.game.matches.get(a.code),c=f.chain.matches.get(m.chainId);
 c.deposited[0]=true;await f.game.reconcile(m);assert.equal(m.phase,'funding');assert.equal(m.states,null);
 f.chain.deposit(m.chainId);await f.game.reconcile(m);assert.equal(m.phase,'countdown');
 f.step(2999);await f.game.reconcile(m);assert.equal(m.phase,'countdown');assert.equal(m.states,null);
 f.step(1);await f.game.reconcile(m);assert.equal(m.phase,'playing');assert.equal(m.states[0].time,0);assert.equal(m.states[1].time,0);
});

test('release: public discovery supports fractional monotonic clocks and bounds RPC amplification',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=20;
 for(let i=0;i<12;i++)await f.game.create(`host${i}.testnet`,'5',`release-host-${i}`,'public');
 const game=new GameService(f.cfg,f.store,f.chain,()=>f.now()+.375);
 const original=f.chain.match.bind(f.chain);let calls=0,inFlight=0,peak=0;
 f.chain.match=async id=>{calls++;peak=Math.max(peak,++inFlight);try{await new Promise(r=>setTimeout(r,2));return await original(id);}finally{inFlight--;}};
 const pages=await Promise.all(Array.from({length:30},()=>game.lobbies()));
 assert.ok(pages.every(p=>p.total===12));assert.equal(calls,12);assert.ok(peak<=4);
 await game.lobbies();assert.equal(calls,12);
 await game.join(pages[0].items[0].id,'guest.testnet',{publicOnly:true});
 assert.equal((await game.lobbies()).total,11);
});

test('release: Mainnet financial gates cover public lobby APIs even with override flags',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.network='mainnet';f.cfg.scope='isolated-mainnet';f.cfg.paymentsEnabled=true;
 const app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>app.close(r)));const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;
 f.store.put('session',createHash('sha256').update('release-mainnet').digest('hex'),{scope:f.cfg.scope,account:'alice.near',csrf:'release',expires:Date.now()+60000});
 for(const [route,method] of [['lobbies','GET'],['lobbies/abcdef012345/join','POST'],['matches','POST'],['register','POST']]){
  const response=await fetch(origin+'/api/'+route,{method,headers:{cookie:'sl_session=release-mainnet',origin,'x-csrf-token':'release','content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
  assert.equal(response.status,400);assert.match((await response.json()).error,/Mainnet payments disabled/);
 }
 assert.equal(f.chain.operations.size,0);
 // A Testnet session is never accepted by this deployment.
 f.store.put('session',createHash('sha256').update('wrong-network').digest('hex'),{scope:'testnet',account:'alice.testnet',expires:Date.now()+60000});
 assert.equal((await fetch(origin+'/api/auth/session',{headers:{cookie:'sl_session=wrong-network'}})).status,401);
});


test('release A03: expired unpaid lobbies release local capacity; funded obligations and host stay reserved',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=3;
 const lobbies=[];for(let i=0;i<3;i++)lobbies.push(await f.game.create(`expired${i}.testnet`,'1',`expired-request-${i}`));
 f.chain.matches.get(lobbies[0].chainId).deposited[0]=true;
 f.step(601000);await f.game.sync();
 assert.equal([...f.game.matches.values()].filter(m=>f.game.holdsSlot(m)).length,1);
 const honest=await f.game.create('honest.testnet','1','honest-request-1');assert.equal(honest.phase,'lobby');
 await assert.rejects(f.game.create('expired1.testnet','1','host-repeat-request'),/current match/);
 assert.equal(f.chain.matches.get(lobbies[0].chainId).deposited[0],true);
 assert.equal(f.chain.operations.has(lobbies[0].code+':result'),false);
});

test('release R01: catalogue changes and failed RPC cannot multiply discovery workers',async t=>{
 const f=fixture();t.after(()=>f.store.close());
 const first=await f.game.create('one.testnet','1','catalogue-one','public');
 let release;const gate=new Promise(r=>release=r),read=f.chain.match.bind(f.chain);let calls=0;
 f.chain.match=async id=>{calls++;await gate;throw Error('RPC offline');};
 const pending=f.game.lobbies();
 // Model local admission changing the candidate set during a slow discovery read.
 const m=structuredClone(f.game.matches.get(first.code));m.code='abcdef123456';m.players[0]='two.testnet';m.chain.creator='two.testnet';f.game.matches.set(m.code,m);
 const during=f.game.lobbies();assert.equal(calls,1);release();
 assert.equal((await pending).total,0);assert.equal((await during).total,0);
 await f.game.lobbies();assert.equal(calls,3); // Changed set gets one new snapshot.
 await Promise.all(Array.from({length:30},()=>f.game.lobbies()));assert.equal(calls,3);
 f.chain.match=read;f.step(2001);assert.equal((await f.game.lobbies()).total,1);
});

test('release A04: multiple sessions for one wallet share a budget, other wallets stay independent',async t=>{
 const f=fixture();t.after(()=>f.store.close());const app=createApp(f.cfg,f.store,f.chain,f.game);
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;
 for(const [token,account] of [['first','alice.testnet'],['second','alice.testnet'],['third','bob.testnet']])f.store.put('session',createHash('sha256').update(token).digest('hex'),{account,scope:f.cfg.scope,expires:Date.now()+60000});
 const realNow=Date.now,at=realNow();Date.now=()=>at;t.after(()=>{Date.now=realNow;});
 const request=token=>fetch(origin+'/api/auth/session',{headers:{cookie:'sl_session='+token}});
 for(let i=0;i<45;i++)assert.equal((await request('first')).status,200);
 assert.equal((await request('second')).status,429);assert.equal((await request('third')).status,200);
});

test('release P4-01: recovery drops only pre-resume match time while other matches retain backlog',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f);f.game.checkpoint();
 const game=new GameService(f.cfg,f.store,f.chain,f.now),recovered=game.matches.get(m.code);
 const ongoing=structuredClone(recovered);ongoing.code='abcdef654321';ongoing.recovering=false;ongoing.players=['other.testnet','fourth.testnet'];game.matches.set(ongoing.code,ongoing);
 const initial=recovered.states[0].time;f.step(30000);
 for(const match of [recovered,ongoing])for(const player of match.players)game.snapshot(match.code,player,{touch:true});
 for(let i=0;i<61;i++)game.advance();
 assert.equal(recovered.recovering,false);assert.equal(recovered.states[0].time,initial);
 assert.ok(ongoing.states[0].time-initial>29);
 f.step(200);game.advance();assert.ok(recovered.states[0].time>initial);assert.ok(recovered.states[0].time-initial<=.21);
});
