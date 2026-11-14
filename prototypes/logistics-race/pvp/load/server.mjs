// Isolated benchmark child: real HTTP, engine and disk WAL; no credentials or network RPC.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {FakeChain} from '../tests/fixture.mjs';
import {EscrowV2Adapter} from '../server/adapters/escrow-v2.mjs';
const dir=process.env.LOAD_SERVER_DIR||new URL('../server/',import.meta.url).pathname;
const load=name=>import(pathToFileURL(path.resolve(dir,name+'.mjs')));
const [{Store},{GameService},{createApp}]=await Promise.all(['store','service','http'].map(load));
const sourceSha256=Object.fromEntries(['service.mjs','store.mjs','game.mjs','http.mjs','chain.mjs','config.mjs','durable.mjs','rpc.mjs','recovery-v2.mjs','adapters/escrow-v2.mjs'].filter(name=>fs.existsSync(path.resolve(dir,name))).map(name=>[name,createHash('sha256').update(fs.readFileSync(path.resolve(dir,name))).digest('hex')]));
sourceSha256.engine=createHash('sha256').update(fs.readFileSync(fs.existsSync(path.resolve(dir,'engine.cjs'))?path.resolve(dir,'engine.cjs'):new URL('../../dist/engine.js',import.meta.url))).digest('hex');
const n=Number(process.env.LOAD_MATCHES),store=new Store(process.env.LOAD_DATA_DIR);
const chain=new FakeChain(()=>Date.now()),rpc={reads:0,writes:0,maxInFlight:0,inFlight:0};
const v2=process.env.LOAD_ADAPTER_VERSION==='v2';
if(v2){
 chain.cfg.network='testnet';chain.cfg.expectedFeeReceiver=chain.chainConfig.admin;chain.adapter=new EscrowV2Adapter(chain.cfg);
 const execute=chain.execute.bind(chain),read=chain.match.bind(chain);
 chain.execute=async(...args)=>{const result=await execute(...args);for(const m of chain.matches.values()){
  m.winner??=null;m.created_at_ns??=String(BigInt(Date.now())*1000000n);m.joined_at_ns??=m.opponent?m.created_at_ns:null;m.activity_confirmed=!!m.opponent;
  m.game_deadline_ns??=m.state==='InProgress'||m.state==='Completed'||m.state==='SettlementPending'?String(BigInt(Date.now()+21600000)*1000000n):null;
  if(!m.payouts.length)m.payouts=[{receiver:m.creator,amount:'0',state:'Paid',attempt:'0'},{receiver:m.fee_receiver,amount:'0',state:'Paid',attempt:'0'}];
 }return result;};
 chain.match=async id=>chain.adapter.match(await read(id));
 chain.control=async()=>chain.adapter.config({...chain.chainConfig,state_version:2,paused:false,server_frozen:false,pending_admin:null,pending_fee:null,last_heartbeat_ns:String(BigInt(Date.now())*1000000n)});
}
for(const key of ['match','chainTime','execute',...(v2?['control']:[])]){const original=chain[key].bind(chain);chain[key]=async(...args)=>{rpc[key==='execute'?'writes':'reads']++;rpc.maxInFlight=Math.max(rpc.maxInFlight,++rpc.inFlight);try{await new Promise(r=>setTimeout(r,Number(process.env.LOAD_RPC_MS||5)));return await original(...args);}finally{rpc.inFlight--;}};}
const cfg={...chain.cfg,origin:'http://localhost',network:'testnet',maxActive:n,players:[]};
const game=new GameService(cfg,store,chain),clients=[];
const server=createApp(cfg,store,chain,game);await new Promise(r=>server.listen({port:0,host:'127.0.0.1',backlog:2048},r));cfg.origin='http://localhost:'+server.address().port;
for(let i=0;i<2*n;i++){
 const token='load-session-'+i,account='load-'+i+'.testnet',csrf='load-csrf-'+i;
 store.put('session',createHash('sha256').update(token).digest('hex'),{account,csrf,expires:Date.now()+3600000});clients.push({token,account,csrf});
}
const setupAt=performance.now(),setup=[];
await Promise.all(Array.from({length:n},async(_,i)=>{
 const a=clients[i*2],b=clients[i*2+1],t=performance.now();const snap=await game.create(a.account,'5','load-create-'+i);await game.join(snap.code,b.account);
 a.code=b.code=snap.code;const m=game.matches.get(snap.code);chain.deposit(m.chainId);chain.matches.get(m.chainId).ready_at_ns=String(BigInt(Date.now()-3100)*1000000n);await game.reconcile(m);setup.push(performance.now()-t);
}));
// Start every clock together; startup work must not count as playing lag.
game.lastPump=Date.now();game.acc=0;
const delay=monitorEventLoopDelay({resolution:10});delay.enable();const cpu=process.cpuUsage(),start=performance.now(),ticks=[],checkpoints=[];
let peakRss=process.memoryUsage().rss,syncing=false,syncCycles=0;
const tick=setInterval(()=>{const t=performance.now();store.assertLease();game.advance();ticks.push(performance.now()-t);peakRss=Math.max(peakRss,process.memoryUsage().rss);},100);
const checkpoint=setInterval(()=>{const t=performance.now();game.checkpoint();checkpoints.push(performance.now()-t);},1000);
const sync=setInterval(async()=>{if(syncing)return;syncing=true;try{await game.sync();syncCycles++;}finally{syncing=false;}},2000);
const times=()=>[...game.matches.values()].map(m=>m.states[0].time);
const setupRpc={...rpc};rpc.reads=rpc.writes=rpc.maxInFlight=0;
const initial=times();process.send({ready:true,port:server.address().port,clients,setup,setupMs:performance.now()-setupAt});
process.on('message',async msg=>{
 if(msg!=='stop')return;const stoppedAt=performance.now();clearInterval(tick);clearInterval(checkpoint);clearInterval(sync);
 while(syncing)await new Promise(r=>setTimeout(r,10));
 const elapsed=stoppedAt-start,usage=process.cpuUsage(cpu),last=times();delay.disable();game.checkpoint();
 const report={adapterVersion:v2?'escrow-v2':'escrow-v1',loadFixtureSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),sourceSha256,setupRpc,elapsedMs:elapsed,cpuMs:(usage.user+usage.system)/1000,peakRss,heap:process.memoryUsage().heapUsed,eventLoopP95Ms:delay.percentile(95)/1e6,eventLoopMaxMs:delay.max/1e6,ticks,checkpoints,rpc,syncCycles,simulationLagMs:Math.max(...last.map((v,i)=>elapsed-(v-initial[i])*1000)),commands:[...game.matches.values()].reduce((s,m)=>s+(m.sequences?.[0]||0)+(m.sequences?.[1]||0),0),sqliteMetrics:store.metrics||null,simulationMetrics:game.metrics||null};
 server.closeAllConnections();await new Promise(r=>server.close(r));store.close();report.databaseBytes=fs.statSync(path.join(process.env.LOAD_DATA_DIR,'pvp.sqlite')).size;process.send({report});process.disconnect();
});
