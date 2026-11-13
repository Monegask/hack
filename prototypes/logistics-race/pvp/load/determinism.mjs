// Complete one real bot match, then replay its legal command tape into N concurrent worlds.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {fixture} from '../tests/fixture.mjs';
import {GameService as OriginalService} from '../.baseline-server/service.mjs';
const require=createRequire(import.meta.url),Bot=require('../../dist/bot.js'),count=Number(process.argv[2]||50);
async function prepare(f,i){
 const a=await f.game.create('player-'+i+'-a.testnet','5','replay-create-'+i);await f.game.join(a.code,'player-'+i+'-b.testnet');const m=f.game.matches.get(a.code);m.seed=42;
 f.chain.deposit(m.chainId);f.chain.matches.get(m.chainId).ready_at_ns=String(BigInt(f.now()-3100)*1000000n);await f.game.reconcile(m);return m;
}
const f=fixture(),stepClock=f.step;f.game=new OriginalService(f.cfg,f.store,f.chain,f.now);f.step=ms=>{stepClock(ms);f.game.advance();};f.cfg.maxActive=count;const m=await prepare(f,0),engines=f.game.getEngines(m),seq=[0,0];let commands=0,step=0;const tape=[];
const original=f.game.command.bind(f.game);f.game.command=(code,account,request)=>{const result=original(code,account,request);tape.push({step,side:m.players.indexOf(account),request:structuredClone(request),result});return result;};
 const bots=engines.map((E,i)=>{
  const remote=(s,name,args,command)=>{const r=f.game.command(m.code,m.players[i],{id:'bot-command-'+i+'-'+(++commands),sequence:++seq[i],command});const local=E[name](s,...args);assert.equal(!!local,r.accepted);return local;};
  const wrapper={...E,tick:()=>{},start:(s,...a)=>remote(s,'start',a,{type:'start',truck:a[0],kind:a[1],target:a[2]}),stopTruck:(s,...a)=>remote(s,'stopTruck',a,{type:'stopTruck',truck:a[0]}),buyTruck:s=>remote(s,'buyTruck',[],{type:'buyTruck'}),roadToCenter:s=>remote(s,'roadToCenter',[],{type:'roadToCenter'})};
  const B=Bot.withEngine(wrapper);return {B,b:B.create(i?8742:42)};
 });
 for(let n=0;n<22000&&m.phase==='playing';n++){
  step=n;for(let i=0;i<2;i++){
   f.game.snapshot(m.code,m.players[i],{touch:true});const {B,b}=bots[i];b.state=structuredClone(m.states[i]);b.state.paused=false;const before={...b.state.enabled},beforeSites=Object.fromEntries(Object.entries(b.state.sites).map(([id,s])=>[id,s.enabled]));B.tick(b,.1);
   for(const [plant,enabled] of Object.entries(before))if(b.state.enabled[plant]!==enabled)f.game.command(m.code,m.players[i],{id:'bot-command-'+i+'-'+(++commands),sequence:++seq[i],command:{type:'plant',plant,enabled:b.state.enabled[plant]}});
   for(const [site,enabled] of Object.entries(beforeSites))if(b.state.sites[site].enabled!==enabled)f.game.command(m.code,m.players[i],{id:'bot-command-'+i+'-'+(++commands),sequence:++seq[i],command:{type:'site',site,enabled:b.state.sites[site].enabled}});
  }f.step(100);if(n%200===0)await f.game.sync();
 }

assert.ok(['settling','finished'].includes(m.phase),'reference must finish');
const expected=createHash('sha256').update(JSON.stringify(m.states)).digest('hex'),winner=m.players.indexOf(m.result.winner),f2=fixture();f2.cfg.maxActive=count;
const games=[];for(let i=0;i<count;i++)games.push(await prepare(f2,i));f2.game.lastPump=f2.now();f2.game.acc=0;
let cursor=0;
for(let n=0;n<=step;n++){
 while(cursor<tape.length&&tape[cursor].step===n){const action=tape[cursor++];for(const game of games)assert.deepEqual(f2.game.command(game.code,game.players[action.side],action.request),action.result);}
 for(const game of games)for(const player of game.players)f2.game.snapshot(game.code,player,{touch:true});f2.step(100);
}
for(const game of games){assert.equal(createHash('sha256').update(JSON.stringify(game.states)).digest('hex'),expected);assert.equal(game.players.indexOf(game.result.winner),winner);await f2.game.reconcile(game);await f2.game.reconcile(game);assert.equal(game.phase,'finished');}
assert.equal(f2.chain.results.length,count);
const result={reference:'0e13688 original engine and service',matches:count,seed:42,simulationSeconds:m.states[0].time,commandsPerMatch:tape.length,stateSha256:expected,winnerSide:winner,settlements:f2.chain.results.length,deterministic:true,doubleSettlements:0,chain:'mock only; no signed transactions'};
fs.mkdirSync(new URL('./results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./results/determinism.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));f.store.close();f2.store.close();
