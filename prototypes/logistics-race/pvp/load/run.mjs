import {fork,spawnSync} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
const here=path.dirname(fileURLToPath(import.meta.url)),args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const duration=Number(args.seconds||30),tiers=(args.matches||'20,50,100,200').split(',').map(Number),results=[];
const percentile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]:null;
for(const matches of tiers){
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'supply-line-load-'));
 const child=fork(path.join(here,'server.mjs'),{env:{...process.env,LOAD_ADAPTER_VERSION:args.adapter||'v1',LOAD_MATCHES:String(matches),LOAD_DATA_DIR:data,LOAD_RPC_MS:args['rpc-ms']||'5',LOAD_SERVER_DIR:args['server-dir']||path.join(here,'../server')},execArgv:['--max-old-space-size=6144',...(args.profile?['--cpu-prof','--cpu-prof-dir='+path.resolve(args.profile)]:[])]});
 if(args.affinity){if(process.platform!=='win32'||!/^[0-9]+$/.test(args.affinity))throw Error('affinity requires a Windows numeric mask');const set=spawnSync('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${child.pid}; $p.ProcessorAffinity=${Number(args.affinity)}; $p.ProcessorAffinity`],{encoding:'utf8'});if(set.status!==0)throw Error(set.stderr);console.log('Child affinity mask: '+set.stdout.trim());}
 const ready=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('exit',code=>reject(Error('Load child exited '+code)));});
 const etags=new Map(),latencies=[],commandLatency=[],errors={},errorSamples=[],agents=[],seq=ready.clients.map(()=>0);let bytes=0,requests=0,commands=0,duplicates=0,unchanged=0,reconnections=0;
 // Unique loopback source per simulated user exercises the production IP guard without bypassing it.
 for(let i=0;i<ready.clients.length;i++)agents.push(new http.Agent({keepAlive:true,localAddress:`127.${1+Math.floor(i/60000)}.${Math.floor(i/250)%240}.${1+i%250}`,maxSockets:2}));
 async function request(i,command=false,retryBody=null){
  const c=ready.clients[i],body=command?(retryBody||{id:`load-command-${i}-${seq[i]+1}`,sequence:seq[i]+1,command:{type:'start',truck:1,kind:'materials',target:'iron'}}):null,t=performance.now();
  return new Promise(resolve=>{const req=http.request({host:'127.0.0.1',port:ready.port,path:'/api/matches/'+c.code+(command?'/command':(args.metadata?'?view=metadata':'')),method:command?'POST':'GET',agent:agents[i],headers:{'accept-encoding':'gzip',...(etags.has(i)?{'if-none-match':etags.get(i)}:{}),cookie:'sl_session='+c.token,origin:'http://localhost:'+ready.port,'content-type':'application/json','x-csrf-token':c.csrf}},res=>{let data='';res.on('data',b=>{bytes+=b.length;data+=b;});res.on('end',()=>{if(!command&&res.headers.etag)etags.set(i,res.headers.etag);const dt=performance.now()-t;requests++;latencies.push(dt);if(command)commandLatency.push(dt);if(res.statusCode>=400){errors[res.statusCode]=(errors[res.statusCode]||0)+1;if(errorSamples.length<10)errorSamples.push(data.slice(0,400));}else if(command){if(retryBody)duplicates++;else{commands++;seq[i]=body.sequence;}}if(res.statusCode===304)unchanged++;resolve({body,status:res.statusCode});});});req.setTimeout(10000,()=>req.destroy(Error('timeout')));req.on('error',e=>{if(errorSamples.length<10)errorSamples.push(String(e));errors[e.code||e.message]=(errors[e.code||e.message]||0)+1;resolve({body,status:0});});req.end(body?JSON.stringify(body):undefined);});
 }
 const deadline=performance.now()+duration*1000;
 await Promise.all(ready.clients.map(async(_,i)=>{
  await new Promise(r=>setTimeout(r,i*200/ready.clients.length));let nextCommand=0,reconnected=false;
  while(performance.now()<deadline){const t=performance.now();if(args.reconnect&&!reconnected&&t>deadline-duration*500){const options={...agents[i].options};agents[i].destroy();agents[i]=new http.Agent(options);reconnected=true;reconnections++;}await request(i);if(t>=nextCommand){const r=await request(i,true);if(r.status===200)await request(i,true,r.body);nextCommand=t+2000;}
   await new Promise(r=>setTimeout(r,Math.max(0,250-(performance.now()-t))));
  }
 }));
 const reportPromise=new Promise(resolve=>child.once('message',resolve));child.send('stop');const {report}=await reportPromise;await new Promise(r=>child.once('exit',r));agents.forEach(a=>a.destroy());
 const result={matches,players:matches*2,duration,requests,bytes,bytesPerSecond:bytes/duration,errors,errorSamples,apiP95Ms:percentile(latencies,.95),apiMaxMs:latencies.reduce((max,value)=>Math.max(max,value),0),commandP95Ms:percentile(commandLatency,.95),commands,duplicates,unchanged,reconnections,setupP95Ms:percentile(ready.setup,.95),...report,tickP95Ms:percentile(report.ticks,.95),checkpointP95Ms:percentile(report.checkpoints,.95)};delete result.ticks;delete result.checkpoints;result.commandCountMatches=result.commands===commands;result.v2BranchExercised=args.adapter==='v2'?(result.adapterVersion==='escrow-v2'&&result.simulationMetrics?.v2SyncCycles>0):null;result.passed=(args.adapter!=='v2'||result.v2BranchExercised)&&Object.keys(errors).length===0&&result.commandCountMatches&&result.apiP95Ms<500&&result.commandP95Ms<500&&result.simulationLagMs<250&&(result.simulationMetrics?Math.max(result.simulationMetrics.maxBacklogMs,result.simulationMetrics.maxPumpDelayMs)<250:result.eventLoopMaxMs<250);results.push(result);console.log(JSON.stringify(result));
}
const output={timestamp:new Date().toISOString(),label:args.label||'candidate',host:{platform:os.platform(),node:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemory:os.totalmem()},settings:args,results};
fs.mkdirSync(path.dirname(path.resolve(args.out||'load-results.json')),{recursive:true});fs.writeFileSync(args.out||'load-results.json',JSON.stringify(output,null,2));

if(results.some(r=>!r.passed))process.exitCode=1;
