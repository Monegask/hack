// Isolated QA server. Never imported by production; no test-login HTTP route exists.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixture,playing} from './fixture.mjs';
import {createApp} from '../server/http.mjs';
import {root} from '../server/config.mjs';
const f=fixture(),m=await playing(f),app=createApp(f.cfg,f.store,f.chain,f.game);
await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port;f.cfg.origin=origin;
const output=path.resolve(root,'../../../output/screenshots/pvp-testnet');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errors=[],contexts=[];let timer=setInterval(()=>f.step(100),100);
try{
 const pages=[];
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(context);const token='qa-session-'+i,csrf='csrf-'+i;
  f.store.put('session',createHash('sha256').update(token).digest('hex'),{account:m.players[i],csrf,expires:Date.now()+3600000});
  await context.addCookies([{name:'sl_session',value:token,url:origin,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  // This browser run validates the game/UI; the actual connector bundle is used, but external wallet traffic is not required.
  await page.goto(origin+'/pvp/');await page.getByRole('button',{name:'Open',exact:true}).click();await page.locator('#gameStage').waitFor({state:'visible'});
  const frame=page.frameLocator('#game');await frame.locator('#pvpStatus').filter({hasText:'Connected'}).waitFor();
  const actual=await page.locator('#game').evaluate(el=>el.contentWindow.eval('({side:window.__supplyLinePvp.side,city:E.positions.city,time:state.time,practice:practiceMode,coach:!!coach})'));
  assert.equal(actual.side,i);assert.deepEqual(actual.city,i===0?[1,4]:[33,6]);assert.equal(actual.practice,true);assert.equal(actual.coach,false);
  assert.equal(await frame.locator('#pause').isDisabled(),true);assert.equal(await frame.locator('#speed').isVisible(),false);
  await page.screenshot({path:path.join(output,'player-'+i+'.png')});pages.push(page);
 }
 // Exercise a real card action in each browser, through HTTP and server command validation.
 for(let i=0;i<2;i++){
  const page=pages[i];await page.locator('#game').evaluate(el=>el.contentWindow.eval("choose('iron');"));
  const result=await page.locator('#game').evaluate(el=>el.contentWindow.eval("E.start(state,1,'materials','iron')"));assert.equal(result,true);
 }
 await pages[0].waitForTimeout(1800);assert.equal(m.sequences[0],1);assert.equal(m.sequences[1],1);assert.ok(m.states.every(s=>s.trucks[0].job));
 // Make the already-tested construction outcome visible for this UI-only control check.
 m.states[0].sites.iron.active=true;await pages[0].waitForTimeout(1200);
 await pages[0].frameLocator('#game').locator('#details [data-action="toggle-site"]').click();await pages[0].waitForTimeout(1200);
 assert.equal(m.states[0].sites.iron.enabled,false);assert.equal(m.sequences[0],2);
 const before=m.states[0].city.iron;await pages[0].locator('#game').evaluate(el=>el.contentWindow.eval('state.city.iron=999999;state.won=true;'));
 await pages[0].waitForTimeout(1400);const restored=await pages[0].locator('#game').evaluate(el=>el.contentWindow.eval('({iron:state.city.iron,won:state.won})'));assert.equal(restored.iron,before);assert.equal(restored.won,false);assert.equal(m.result,null);
 await pages[0].reload();await pages[0].frameLocator('#game').locator('#pvpStatus').filter({hasText:'Connected'}).waitFor();assert.equal(m.sequences[0],2);
 await pages[0].frameLocator('#game').getByRole('button',{name:'Match & payouts'}).click();await pages[0].locator('#gameStage').waitFor({state:'hidden'});await pages[0].waitForTimeout(1800);assert.equal(await pages[0].locator('#gameStage').isVisible(),false);
 await pages[0].setViewportSize({width:390,height:844});await pages[0].screenshot({path:path.join(output,'mobile-lobby.png')});assert.equal(await pages[0].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await pages[0].locator('#openGame').click();await pages[0].frameLocator('#game').locator('#pvpStatus').filter({hasText:'Connected'}).waitFor();
 assert.equal(await pages[0].locator('#game').evaluate(el=>el.contentDocument.documentElement.scrollWidth>el.clientWidth),false);await pages[0].screenshot({path:path.join(output,'mobile-game.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'qa.json'),JSON.stringify({passed:true,players:2,actualHttpCommands:m.sequences,authoritativeOverwrite:true,cardToggle:true,reload:true,mobileNoOverflow:true,pageErrors:errors,chain:'in-memory fixture, not live payments'},null,2));
 console.log('Browser QA passed: two isolated clients, mirrored roles, commands, reload, tamper recovery, mobile lobby, no page errors.');
}finally{clearInterval(timer);for(const c of contexts)await c.close();await browser.close();await new Promise(r=>app.close(r));f.store.close();}

