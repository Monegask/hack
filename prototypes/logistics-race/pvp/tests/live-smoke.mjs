// Real local backend, no authentication bypass and no transactions.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root} from '../server/config.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const r=await page.goto('http://localhost:4190/pvp/');assert.equal(r.status(),200);await page.locator('#connect').waitFor();await page.locator('#wallet').click();
 await page.getByText('Meteor Wallet',{exact:true}).waitFor({timeout:20000});
 const out=path.resolve(root,'../../../output/screenshots/pvp-testnet');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'live-wallet-selector.png')});
 assert.deepEqual(errors,[]);console.log('Real Testnet backend and Testnet-compatible Meteor wallet selector loaded. No login or payment was performed.');await context.close();
}finally{await browser.close();}
