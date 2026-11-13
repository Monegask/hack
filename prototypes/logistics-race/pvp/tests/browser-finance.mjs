// Isolated UI fixtures. No wallets, RPC, credentials or real confirmations.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {root} from '../server/config.mjs';
let network='testnet',deposited=false,signs=0,matchReads=0,offline=false,scopeChange=false,version='escrow-v1',intent=null;
const code='012345abcdef',account=()=>network==='testnet'?'alice.testnet':'alice.near',scope=()=>JSON.stringify([network,'escrow.'+(network==='testnet'?'testnet':'near'),'token']);
const cfg=()=>({network,scope:scope(),paymentsEnabled:network==='testnet',escrowApi:version,symbol:'USDC',feeBps:network==='testnet'?300:null});
const snapshot=()=>({code,side:0,players:['alice.testnet','bob.testnet'],stake:'5000000',phase:'funding',chain:{id:'1',state:'AwaitingDeposits',deposited:[deposited,false],stake:'5000000',fee_bps:300,revision:'0',payouts:[]}});
const app=fs.readFileSync(root+'/client/app.mjs','utf8').replace("import {NearConnector} from '@hot-labs/near-connect';","import {NearConnector} from '/test-wallet.mjs';");
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(offline&&url.pathname.startsWith('/api/')){res.destroy();return;}
 if(url.pathname==='/test-wallet.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(`export class NearConnector{constructor(options){window.walletOptions=options;}on(){}async wallet(){return {getAccounts:async()=>[{accountId:window.walletAccount||'alice.testnet'}],signAndSendTransaction:async tx=>{await fetch('/test/sign',{method:'POST',body:JSON.stringify(tx)});throw Error('Connection lost after broadcast');}}}async disconnect(){}}`);}
 if(url.pathname==='/test/sign'){signs++;res.end('{}');return;}
 if(url.pathname==='/pvp/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(app);}
 if(url.pathname==='/pvp/finance.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(root+'/client/finance.mjs'));}
 if(url.pathname==='/pvp/'){res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(root+'/client/index.html'));}
 if(url.pathname==='/pvp/style.css'){res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync(root+'/client/style.css'));}
 res.setHeader('Content-Type','application/json');res.setHeader('X-Supply-Line-Scope',scopeChange?'other deployment':scope());
 const send=value=>res.end(JSON.stringify(value));
 if(url.pathname==='/api/payments')return send(intent&&!intent.resolved?[{intentId:intent.id,code,kind:'deposit',matchId:'1',hash:null}]:[]);
 if(url.pathname==='/api/payment-status'){let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);if(request.hash==='1'.repeat(32)){intent.resolved=true;deposited=true;return send({state:'accepted',resolved:true,retrySafe:false});}return send({state:'unknown',retrySafe:false});}
 if(url.pathname==='/api/config')return send(cfg());
 if(url.pathname==='/api/auth/session')return send({account:account(),csrf:'fixture'});
 if(url.pathname==='/api/balance')return send({balance:'20000000',registered:true,nearAvailable:'1000000000000000000000000',hasGas:true});
 if(url.pathname==='/api/matches'){matchReads++;return send([{code,phase:'funding',stake:'5000000'}]);}
 if(url.pathname==='/api/matches/'+code)return send(snapshot());
 if(url.pathname.endsWith('/transaction')){if(version==='escrow-v2')intent={id:'fixture-intent',resolved:false};return send({network,...(intent?{intentId:intent.id}:{}),transaction:{receiverId:'token.testnet',actions:[]}});}
 res.statusCode=404;send({error:'fixture route unavailable'});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext();const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(origin+'/pvp/');await page.locator('[data-resume]').click();await page.locator('[data-payment="deposit"]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('pending'));
 assert.equal(signs,1);assert.equal(await page.locator('[data-payment="deposit"]').isDisabled(),true);
 await page.reload();await page.waitForSelector('[data-payment="deposit"]');assert.equal(await page.locator('[data-payment="deposit"]').isDisabled(),true);assert.equal(signs,1);
 const tab=await context.newPage();await tab.goto(origin+'/pvp/');await tab.locator('[data-resume]').click();assert.equal(await tab.locator('[data-payment="deposit"]').isDisabled(),true);await tab.close();
 offline=true;await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Connection interrupted'));offline=false;deposited=true;
 await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.startsWith('sl-pvp-payment:')),{timeout:20000});assert.equal(signs,1);
 await page.evaluate(()=>window.walletAccount='bob.testnet');await page.locator('[data-payment="cancel"]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Wallet account changed'));assert.equal(signs,1);
 scopeChange=true;await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('deployment changed'));scopeChange=false;
 assert.deepEqual(errors,[]);await context.close();
 version='escrow-v2';deposited=false;const v2Context=await browser.newContext(),v2Page=await v2Context.newPage();v2Page.on('dialog',d=>d.type()==='prompt'?d.accept('1'.repeat(32)):d.accept());await v2Page.goto(origin+'/pvp/');await v2Page.locator('[data-resume]').click();await v2Page.locator('[data-payment="deposit"]').click();await v2Page.waitForFunction(()=>document.querySelector('#message').textContent.includes('unknown'));assert.equal(signs,2);await v2Page.evaluate(()=>localStorage.clear());await v2Page.reload();await v2Page.waitForSelector('#recoverPayment');assert.equal(await v2Page.locator('[data-payment="deposit"]').isDisabled(),true);await v2Page.locator('#recoverPayment').click();await v2Page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.startsWith('sl-pvp-payment:')));assert.equal(signs,2);await v2Context.close();
 network='mainnet';const mainContext=await browser.newContext(),mainPage=await mainContext.newPage();const reads=matchReads;await mainPage.goto(origin+'/pvp/');await mainPage.waitForSelector('#account:not([hidden])');assert.match(await mainPage.locator('.banner').innerText(),/NEAR MAINNET.*Payments disabled/);assert.equal(await mainPage.locator('#lobbies').isHidden(),true);assert.equal(await mainPage.locator('[data-payment]').count(),0);assert.equal(matchReads,reads);assert.equal(await mainPage.evaluate(()=>window.walletOptions.network),'mainnet');assert.equal(signs,2);await mainContext.close();
 console.log('PASS: ambiguous payment, reload, second tab, reconnect, chain recovery, wallet change, deployment change, server journal recovery after cleared browser storage, manual original-hash reconciliation, Mainnet read-only UI; no real transactions.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
