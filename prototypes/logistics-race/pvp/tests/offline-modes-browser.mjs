// Fresh browser contexts: never opens or resets a user's saved game.
import {chromium} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const file=new URL('../../../../exports/supply-line.html',import.meta.url);
const server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{
 for(const mode of ['training','race']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/#'+mode);
  const frame=page.frameLocator('#playableFrame');await frame.locator('#map[aria-busy="false"]').waitFor({timeout:60000});
  assert.equal(await frame.locator('body').getAttribute('data-training'),mode==='training'?'true':null);
  assert.equal(await frame.locator('#map').isVisible(),true);assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('PASS: rebuilt offline portal launches real tutorial and bot race in fresh isolated contexts; no page errors or user-save changes.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
