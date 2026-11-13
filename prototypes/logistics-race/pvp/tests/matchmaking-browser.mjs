// Isolated sessions and mock chain only. Run after npm run build.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './fixture.mjs';
import {createApp} from '../server/http.mjs';
const f=fixture(),app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
try{
 const pages=[];
 for(const name of ['host','guest','observer']){
  const context=await browser.newContext();f.store.put('session',createHash('sha256').update(name).digest('hex'),{account:name+'.testnet',csrf:name,expires:Date.now()+60000});await context.addCookies([{name:'sl_session',value:name,url:origin,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/pvp/');await page.locator('#publicList').filter({hasText:'No open public lobbies'}).waitFor();pages.push(page);
 }
 const [host,guest,observer]=pages;
 await host.locator('#visibility').selectOption('public');await host.locator('#create button').click();await host.locator('#match').filter({hasText:'Waiting for an opponent'}).waitFor();
 await guest.locator('#publicList [data-lobby]').waitFor();assert.match(await guest.locator('#publicList').innerText(),/host.testnet/);assert.match(await guest.locator('#publicList').innerText(),/5 test USDC/);
 await guest.locator('#lobbySort').selectOption('stake:asc');await guest.locator('#publicList [data-lobby]').click();await guest.locator('#match').filter({hasText:'Both players must deposit'}).waitFor();
 await observer.locator('#publicList').filter({hasText:'No open public lobbies'}).waitFor();assert.equal(f.game.matches.values().next().value.players[1],'guest.testnet');
 // A private lobby is never discovered, but the invitation still works.
 await observer.locator('#create button').click();await observer.locator('#copyInvite').waitFor();const code=[...f.game.matches.values()].find(m=>m.players[0]==='observer.testnet').code;
 await host.locator('#refreshLobbies').click();assert.equal(await host.locator('#publicList [data-lobby]').count(),0);
 await host.locator('#code').fill(code);await host.locator('#join button').click();await host.locator('#acceptInvite').waitFor();
 await observer.setViewportSize({width:390,height:844});assert.equal(await observer.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await observer.screenshot({path:process.env.MATCHMAKING_SCREENSHOT||'matchmaking-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: public creation, automatic discovery, sorting, Join, automatic removal, private invite, mobile layout; mock chain, no payments.');
}finally{await browser.close();await new Promise(r=>app.close(r));f.store.close();}
