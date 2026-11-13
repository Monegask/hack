// Concurrent real HTTP admission and deposit-template race; no wallet broadcasts.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {GameService} from '../server/service.mjs';
import {createApp} from '../server/http.mjs';
import {FakeChain} from '../tests/fixture.mjs';
const count=50,data=fs.mkdtempSync(path.join(os.tmpdir(),'supply-line-admission-')),store=new Store(data),chain=new FakeChain(()=>Date.now()),cfg={...chain.cfg,origin:'http://localhost',maxActive:count,players:[]},game=new GameService(cfg,store,chain),server=createApp(cfg,store,chain,game);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;cfg.origin=origin;
const times=[],sessions=[];let requests=0;
for(let i=0;i<count*3;i++){const token='admission-'+i,account='admission-'+i+'.testnet';sessions.push({token,account});store.put('session',createHash('sha256').update(token).digest('hex'),{account,csrf:token,expires:Date.now()+3600000});}
async function post(i,url,body){const s=sessions[i],t=performance.now(),r=await fetch(origin+'/api/'+url,{method:'POST',headers:{origin,'content-type':'application/json',cookie:'sl_session='+s.token,'x-csrf-token':s.token},body:JSON.stringify(body)});times.push(performance.now()-t);requests++;return {status:r.status,value:await r.json()};}
try{
 await Promise.all(Array.from({length:count},async(_,i)=>{const body={amount:'5',id:'admission-create-'+i};const [a,b]=await Promise.all([post(i*3,'matches',body),post(i*3,'matches',body)]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.value.code,b.value.code);}));
 assert.equal(game.matches.size,count);assert.equal(chain.matches.size,count);
 const matches=[...game.matches.values()];
 await Promise.all(matches.map(async(m,i)=>{const replies=await Promise.all([post(i*3+1,'matches/'+m.code+'/join',{}),post(i*3+2,'matches/'+m.code+'/join',{})]);assert.equal(replies.filter(r=>r.status===200).length,1);assert.equal(replies.filter(r=>r.status===400).length,1);}));
 let templates=0;
 await Promise.all(matches.map(async(m,i)=>{const host=sessions.findIndex(s=>s.account===m.players[0]),guest=sessions.findIndex(s=>s.account===m.players[1]);for(const player of [host,guest]){
  const terms={stake:m.stake,revision:m.chain.revision,feeBps:300,opponent:m.players[player===host?1:0]};
  const replies=await Promise.all([post(player,'matches/'+m.code+'/transaction',{kind:'deposit',terms}),post(player,'matches/'+m.code+'/transaction',{kind:'deposit',terms})]);
  for(const r of replies){assert.equal(r.status,200,JSON.stringify(r.value));assert.equal(r.value.transaction.actions[0].params.args.amount,m.stake);templates++;}
 }}));
 assert.equal(chain.results.length,0);assert.equal([...chain.matches.values()].filter(m=>m.deposited.some(Boolean)).length,0);
 const result={matches:count,requests,p95Ms:times.sort((a,b)=>a-b)[Math.floor(times.length*.95)],duplicateCreates:count,seatRaces:count,expectedSeatRejections:count,depositTemplates:templates,serverDepositBroadcasts:0,unexpectedErrors:0,scope:'real local HTTP/disk SQLite; mock chain, repeated templates are not token transfers'};
 fs.mkdirSync(new URL('./results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./results/admission.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
