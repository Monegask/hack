// Real UI clicks and server commands in isolated sessions; the chain is a fixture.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixture,playing} from './fixture.mjs';
import {createApp} from '../server/http.mjs';
import {root} from '../server/config.mjs';
const f=fixture(),m=await playing(f),app=createApp(f.cfg,f.store,f.chain,f.game);
for(const s of m.states){s.sites.iron.active=true;s.sites.iron.stock=40;}
await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;
const out=path.resolve(root,'../../../output/screenshots/pvp-controls');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}),contexts=[],pages=[],errors=[],report={chain:'fixture',checks:[],metrics:[]};
const timer=setInterval(()=>f.step(100),100);
try{
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(context);const token='controls-'+i;
  f.store.put('session',createHash('sha256').update(token).digest('hex'),{account:m.players[i],csrf:'controls-csrf-'+i,expires:Date.now()+3600000});
  await context.addCookies([{name:'sl_session',value:token,url:origin,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/pvp/game?match='+m.code);
  await page.locator('#pvpStatus').filter({hasText:'Connected'}).waitFor();await page.locator('#map[aria-busy="false"]').waitFor({timeout:60000});pages.push(page);
 }
 for(let i=0;i<2;i++){
  const page=pages[i],before=m.sequences?.[i]||0;
  await page.locator('[data-site="iron"]').click();await page.locator('#details [data-action="haul"]').click();
  await page.waitForTimeout(1600);
  const pending=await page.evaluate(()=>({mode:cardUI.getMode(),pending:cardUI.getPending(),jobs:state.trucks.map(t=>t.job),sequence:pvpSequence}));
  report.metrics.push({side:i,afterAssignment:pending,serverSequence:m.sequences?.[i]||0});
  assert.equal(m.sequences?.[i]||0,before,'Showing eligibility must never send commands');
  assert.equal(pending.pending?.type,'haul','Network snapshots must preserve the truck chooser');
  await page.locator('#fleet [data-truck="2"]').click();
  await page.waitForFunction(()=>state.trucks[1].job?.type==='haul');
  assert.equal(m.sequences[i],before+1);assert.equal(m.states[i].trucks[0].job,null);assert.equal(m.states[i].trucks[1].job.type,'haul');
  await page.bringToFront();
  await page.waitForTimeout(700);
  const motion=await page.evaluate(()=>new Promise(resolve=>{
   const samples=[],start=performance.now();function frame(now){const p=map3d.trucks.get(2)?.group.position;samples.push({t:now,x:p?.x,z:p?.z});if(now-start<2000)requestAnimationFrame(frame);else resolve({samples,renderer:JSON.parse(document.getElementById('map').dataset.renderInfo||'{}')});}requestAnimationFrame(frame);
  }));
  let moved=0,maxFreeze=0,lastMove=motion.samples[0].t,maxStep=0;
  for(let j=1;j<motion.samples.length;j++){const a=motion.samples[j-1],b=motion.samples[j],d=Math.hypot(b.x-a.x,b.z-a.z);if(d>1e-5){moved++;maxFreeze=Math.max(maxFreeze,b.t-lastMove);lastMove=b.t;}maxStep=Math.max(maxStep,d);}
  const metrics={side:i,frames:motion.samples.length,movingFraction:moved/(motion.samples.length-1),maxFreezeMs:maxFreeze,maxStep,renderer:motion.renderer};report.metrics.push(metrics);
  assert(metrics.movingFraction>.65,'Truck position must advance on most rendered frames');assert(maxFreeze<500,'Truck must not wait for network snapshots to move');
  await page.locator('#fleet [data-truck="2"]').click();await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(()=>cardUI.getMode()),'truck');assert.equal(await page.locator('#details h2').innerText(),'Truck 2');
  await page.locator('#details [data-action="stop"]').click();
  await page.waitForFunction(()=>state.trucks[1].stop||!state.trucks[1].job);
  assert.equal(m.sequences[i],before+2);
  report.checks.push('Side '+i+': choose truck 2 only, truck card survives snapshots, recall through real UI');
  await page.screenshot({path:path.join(out,'controls-'+i+'.png')});
 }
 assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;console.log(JSON.stringify(report));
}catch(e){report.error=e.message;report.errors=errors;throw e;}
finally{fs.writeFileSync(path.join(out,process.argv.includes('--baseline')?'baseline.json':'qa.json'),JSON.stringify(report,null,2));clearInterval(timer);for(const c of contexts)await c.close();await browser.close();await new Promise(r=>app.close(r));f.store.close();}
