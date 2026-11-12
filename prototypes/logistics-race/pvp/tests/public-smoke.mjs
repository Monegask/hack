// Isolated browser contexts only. No wallet login or financial transactions.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {root} from '../server/config.mjs';
const remote='https://pvp-testnet-testnet.up.railway.app';
const out=path.resolve(root,'../../../output/screenshots/pvp-public');fs.mkdirSync(out,{recursive:true});
let server,target=process.argv[2];
if(!target){
 const file=path.resolve(root,'../../../publishing/hack/public/index.html');
 server=http.createServer((req,res)=>{
  if(req.url.startsWith('/pvp')){res.writeHead(307,{Location:remote+'/pvp/'});return res.end();}
  res.writeHead(200,{'Content-Type':'text/html'});fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));target='http://127.0.0.1:'+server.address().port+'/';
}
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={target,checks:[],errors:[]};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await context.addInitScript(()=>{
  if(location.hostname.endsWith('railway.app'))return;
  localStorage.setItem('logistics-race-v1','isolated-public-game-sentinel');
  localStorage.setItem('supply-line-interface-demo-v1',JSON.stringify({schema:1,page:'create',wallet:'fixture.demo.near'}));
 });
 assert.equal((await page.goto(target,{timeout:60000})).status(),200);
 assert.equal(await page.locator('body').getAttribute('data-release'),'testnet-pvp');
 assert((await page.locator('.demo-banner').innerText()).includes('NEAR TESTNET'));
 assert.equal(await page.locator('.home-menu svg').count(),3);
 assert.equal(await page.locator('[data-action="lab"]').count(),0);
 assert.equal(await page.locator('#walletButton').innerText(),'Connect wallet');
 await page.screenshot({path:path.join(out,'menu-desktop.png')});
 for(const mode of ['tutorial','bot']){
  await page.locator('.home-menu [data-action="'+mode+'"]').click();
  const f=await(await page.locator('#playableFrame').elementHandle()).contentFrame();
  await f.waitForSelector('#map[aria-busy="false"]',{timeout:45000});
  assert.equal(await f.locator('body').getAttribute(mode==='tutorial'?'data-training':'data-race'),'true');
  await f.locator('#shareHome').click();await page.locator('.home-menu').waitFor({state:'visible'});
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('logistics-race-v1')),'isolated-public-game-sentinel');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('supply-line-interface-demo-v1')).wallet),'fixture.demo.near');
 report.checks.push('Public menu, tutorial and bot work; isolated game/demo saves preserved');
 await page.setViewportSize({width:390,height:844});assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=391);
 await page.screenshot({path:path.join(out,'menu-mobile.png'),fullPage:true});
 await page.locator('.home-menu [data-action="online"]').click();
 await page.waitForURL(remote+'/pvp/');await page.locator('#connect').waitFor();
 assert((await page.locator('.banner').innerText()).includes('NEAR TESTNET'));
 assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=391);
 await page.screenshot({path:path.join(out,'lobby-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:900});await page.locator('#wallet').click();
 await page.getByText('Meteor Wallet',{exact:true}).waitFor({timeout:30000});
 await page.screenshot({path:path.join(out,'public-wallet-selector.png')});
 report.checks.push('Play online reaches public Railway server; mobile lobby and Testnet Meteor selector work');
 const api=await context.request.get(remote+'/api/matches');assert.equal(api.status(),401);
 assert.equal((await context.request.post(remote+'/api/auth/challenge',{data:{},headers:{Origin:'https://untrusted.invalid'}})).status(),403);
 const health=await(await context.request.get(remote+'/healthz')).json();assert.deepEqual(health,{ok:true,network:'testnet'});
 assert.equal((await context.request.post(remote+'/provision-runtime-key',{data:{}})).status(),404);
 report.checks.push('Live health/config, authenticated API boundary, Origin protection and closed provisioning endpoint');
 assert.deepEqual(report.errors,[]);await context.close();console.log(JSON.stringify(report));
}finally{fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify(report,null,2));await browser.close();if(server)await new Promise(r=>server.close(r));}
