import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {Store} from '../server/store.mjs';
import {fixture,playing} from './fixture.mjs';
import {GameService} from '../server/service.mjs';
import {PendingChain} from '../server/chain.mjs';
test('unknown create/join receipt returns a resumable lobby instead of losing the UI handle',async t=>{
 const f=fixture();t.after(()=>f.store.close());const execute=f.chain.execute.bind(f.chain);let loseCreate=true,loseBind=true;
 f.chain.execute=async(id,method,args)=>{const result=await execute(id,method,args);if(method==='create_lobby'&&loseCreate){loseCreate=false;throw new PendingChain();}if(method==='bind_opponent'&&loseBind){loseBind=false;throw new PendingChain();}return result;};
 const a=await f.game.create('alice.testnet','5','request-001');assert.equal(a.phase,'creating');assert.ok(a.code);const m=f.game.matches.get(a.code);await f.game.reconcile(m);assert.equal(m.phase,'lobby');
 const b=await f.game.join(m.code,'bob.testnet');assert.equal(b.phase,'binding');assert.equal(b.code,a.code);await f.game.reconcile(m);assert.equal(m.phase,'funding');assert.equal(f.chain.matches.size,1);assert.deepEqual(m.players,['alice.testnet','bob.testnet']);
});
test('SQLite single-owner lease, online backup and exact restore preserve match and outbox together',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'supply-line-pvp-')),copy=path.join(directory,'backup.sqlite');let store;
 try{
  store=new Store(directory);store.transaction(()=>{store.put('match','game',{states:[{time:12.3}],chainId:'17'});store.put('outbox','result',{status:'signed',hash:'transaction-id'});});
  assert.throws(()=>new Store(directory),/Another PvP process/);
  await backup(store.db,copy);const restored=new DatabaseSync(copy);assert.equal(JSON.parse(restored.prepare("SELECT value FROM records WHERE kind='match'").get().value).chainId,'17');assert.equal(JSON.parse(restored.prepare("SELECT value FROM records WHERE kind='outbox'").get().value).hash,'transaction-id');restored.close();
  store.close();store=new Store(directory);assert.equal(store.get('match','game').states[0].time,12.3);
 }finally{store?.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('crash after confirmed start restores the initial snapshot and requires both players to reconnect',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f);m.phase='countdown';f.game.save(m);const recovered=new GameService(f.cfg,f.store,f.chain,f.now),n=recovered.matches.get(m.code);await recovered.reconcile(n);assert.equal(n.phase,'playing');assert.equal(n.recovering,true);assert.equal(n.states[0].time,0);
});
test('expired heartbeat never submits a winner or renews the expired match',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f);f.chain.matches.get(m.chainId).last_heartbeat_ns=String(BigInt(f.now()-1800001)*1000000n);m.phase='settling';m.result={winner:'alice.testnet'};await f.game.sync();assert.equal(m.phase,'refund');assert.equal(f.chain.results.length,0);assert.ok(f.chain.heartbeats.every(ids=>!ids.includes(m.chainId)));
});
test('a failed fee transfer keeps settlement pending without repeating the winner payment',async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f),c=f.chain.matches.get(m.chainId);c.state='SettlementPending';c.winner='alice.testnet';c.payouts=[{receiver:'alice.testnet',amount:'9700000',state:'Paid'},{receiver:'admin.testnet',amount:'300000',state:'Ready'}];await f.game.reconcile(m);assert.equal(m.phase,'settling');assert.equal(m.chain.payouts[0].state,'Paid');assert.equal(f.chain.results.length,0);c.payouts[1].state='Paid';c.state='Completed';await f.game.reconcile(m);assert.equal(m.phase,'finished');assert.equal(f.chain.results.length,0);
});
