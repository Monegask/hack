// An isolated browser and local API fixture; never creates a production session.
import {chromium} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root} from '../server/config.mjs';
let balanceCalls=0;
const server=http.createServer((req,res)=>{
 const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 if(req.url==='/api/config')return send({network:'testnet',token:'token.testnet',escrow:'escrow.testnet',symbol:'TEST',feeBps:300});
 if(req.url==='/api/auth/session')return send({account:'fixture.testnet',csrf:'fixture'});
 if(req.url==='/api/balance')return ++balanceCalls===1?send({error:'NEAR RPC is unavailable'},503):send({balance:'20000000',registered:true});
 if(req.url==='/api/matches')return send([]);
 const files={'/':'index.html','/pvp/app.js':'app.js','/pvp/style.css':'style.css'},file=files[req.url];
 if(!file)return send({error:'Not found'},404);
 res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});fs.createReadStream(path.join(root,'public',file)).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>document.getElementById('message').textContent.includes('Connection interrupted'));
 assert.equal(await page.locator('#wallet').isEnabled(),true);
 await page.waitForFunction(()=>document.getElementById('account').textContent.includes('20 test TEST'),{},{timeout:10000});
 assert.equal(await page.locator('#message').innerText(),'');assert.equal(await page.locator('#wallet').innerText(),'Sign out');
 await page.waitForTimeout(4500);assert.equal(balanceCalls,2);assert.deepEqual(errors,[]);
 console.log('Initial RPC failure recovers automatically, clears its warning, preserves session and avoids repeated idle balance requests.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
