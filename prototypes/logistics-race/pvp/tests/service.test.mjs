import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture,playing} from './fixture.mjs';
import {GameService} from '../server/service.mjs';
import {config} from '../server/config.mjs';
const require=createRequire(import.meta.url),Bot=require('../../dist/bot.js');
test('mainnet and unsafe public HTTP configurations fail closed',()=>{assert.throws(()=>config({NEAR_NETWORK:'mainnet'}));assert.throws(()=>config({PUBLIC_ORIGIN:'http://example.com'}));assert.throws(()=>config({TOKEN_ID:'token.near'}));});
test('create is idempotent; self-join and concurrent opponents cannot take extra seats',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await f.game.create('alice.testnet','5','request-001');const b=await f.game.create('alice.testnet','5','request-001');assert.equal(a.code,b.code);assert.equal(f.chain.matches.size,1);
 await f.game.join(a.code,'alice.testnet');assert.equal(f.game.matches.get(a.code).players[1],null);
 const results=await Promise.allSettled([f.game.join(a.code,'bob.testnet'),f.game.join(a.code,'charlie.testnet')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.chain.matches.size,1);
});
test('only both confirmed deposits plus chain countdown start a persisted game',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=await f.game.create('alice.testnet','5','request-001');await f.game.join(a.code,'bob.testnet');const m=f.game.matches.get(a.code);
 await f.game.reconcile(m);assert.equal(m.states,null);assert.throws(()=>f.game.command(m.code,'alice.testnet',{id:'cmd-00001',sequence:1,command:{type:'buyTruck'}}));
 f.chain.deposit(m.chainId);await f.game.reconcile(m);assert.equal(m.phase,'countdown');f.step(3100);await f.game.reconcile(m);assert.equal(m.phase,'playing');assert.ok(f.store.get('match',m.code).states);assert.equal(m.states[0].time,m.states[1].time);
});
test('commands are authorized, ordered and idempotent; client won/resources/tick claims cannot mutate game',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f),command={id:'cmd-00001',sequence:1,command:{type:'start',truck:1,kind:'materials',target:'iron'}};
 assert.throws(()=>f.game.command(m.code,'outsider.testnet',command));assert.throws(()=>f.game.command(m.code,'alice.testnet',{...command,sequence:2}));
 const a=f.game.command(m.code,'alice.testnet',command),b=f.game.command(m.code,'alice.testnet',command);assert.deepEqual(a,b);assert.equal(m.sequences[0],1);
 assert.throws(()=>f.game.command(m.code,'alice.testnet',{id:'cmd-00002',sequence:2,command:{type:'won',winner:'alice.testnet',resources:999999}}));
 assert.equal(m.phase,'playing');assert.equal(m.result,null);assert.throws(()=>f.game.command(m.code,'alice.testnet',{id:'cmd-00003',sequence:2,command:{type:'road',cell:[33,6]}}));
 assert.throws(()=>f.game.command(m.code,'alice.testnet',{...command,command:{type:'buyTruck'}}));
});
test('restart restores the exact state and waits for both players, without advancing offline time',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f);f.step(500);f.game.checkpoint();const saved=structuredClone(m.states);
 const restored=new GameService(f.cfg,f.store,f.chain,f.now),other=restored.matches.get(m.code);assert.deepEqual(other.states,saved);assert.equal(other.recovering,true);
 restored.snapshot(m.code,'alice.testnet',{touch:true});restored.advance();assert.equal(other.recovering,true);restored.snapshot(m.code,'bob.testnet',{touch:true});restored.advance();
 f.step(100);restored.advance();assert.equal(other.recovering,false);assert.ok(other.states[0].time<saved[0].time+1);
});
test('one disconnected player loses only after grace; both disconnected stop heartbeat and require refund',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f);for(let i=0;i<1200;i++){f.step(100);f.game.snapshot(m.code,'alice.testnet',{touch:true});}assert.equal(m.phase,'settling');assert.equal(m.result.winner,'alice.testnet');
 await f.game.reconcile(m);assert.equal(m.phase,'finished');assert.equal(f.chain.results.length,1);await f.game.reconcile(m);assert.equal(f.chain.results.length,1);
 const g=fixture();t.after(()=>g.store.close());const n=await playing(g);for(let i=0;i<1200;i++)g.step(100);assert.equal(n.phase,'refund');await g.game.sync();assert.equal(g.chain.results.length,0);assert.ok(g.chain.heartbeats.every(ids=>!ids.includes(n.chainId)));
});
test('actual economics and legal server commands run a complete two-sided match and settle once',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f),engines=f.game.getEngines(m),seq=[0,0];let commands=0;
 const bots=engines.map((E,i)=>{
  const remote=(s,name,args,command)=>{const r=f.game.command(m.code,m.players[i],{id:'bot-command-'+i+'-'+(++commands),sequence:++seq[i],command});const local=E[name](s,...args);assert.equal(!!local,r.accepted);return local;};
  const wrapper={...E,tick:()=>{},start:(s,...a)=>remote(s,'start',a,{type:'start',truck:a[0],kind:a[1],target:a[2]}),stopTruck:(s,...a)=>remote(s,'stopTruck',a,{type:'stopTruck',truck:a[0]}),buyTruck:s=>remote(s,'buyTruck',[],{type:'buyTruck'}),roadToCenter:s=>remote(s,'roadToCenter',[],{type:'roadToCenter'})};
  const B=Bot.withEngine(wrapper);return {B,b:B.create(i?8742:42)};
 });
 for(let n=0;n<22000&&m.phase==='playing';n++){
  for(let i=0;i<2;i++){
   f.game.snapshot(m.code,m.players[i],{touch:true});const {B,b}=bots[i];b.state=structuredClone(m.states[i]);b.state.paused=false;const before={...b.state.enabled},beforeSites=Object.fromEntries(Object.entries(b.state.sites).map(([id,s])=>[id,s.enabled]));B.tick(b,.1);
   for(const [plant,enabled] of Object.entries(before))if(b.state.enabled[plant]!==enabled)f.game.command(m.code,m.players[i],{id:'bot-command-'+i+'-'+(++commands),sequence:++seq[i],command:{type:'plant',plant,enabled:b.state.enabled[plant]}});
   for(const [site,enabled] of Object.entries(beforeSites))if(b.state.sites[site].enabled!==enabled)f.game.command(m.code,m.players[i],{id:'bot-command-'+i+'-'+(++commands),sequence:++seq[i],command:{type:'site',site,enabled:b.state.sites[site].enabled}});
  }f.step(100);if(n%200===0)await f.game.sync();
 }
 assert.ok(commands>30);assert.ok(['settling','finished'].includes(m.phase),JSON.stringify({phase:m.phase,progress:m.states.map(s=>s.delivered)}));await f.game.reconcile(m);assert.equal(m.phase,'finished');assert.equal(f.chain.results.length,1);assert.equal(m.chain.payouts.reduce((a,p)=>a+BigInt(p.amount),0n),10000000n);assert.equal(m.chain.payouts[1].amount,'300000');
});
