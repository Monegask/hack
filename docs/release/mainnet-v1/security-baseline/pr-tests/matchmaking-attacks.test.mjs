import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
// Point at a local, disposable checkout of the reviewed PR composition.
if(!process.env.AUDIT_PVP_ROOT)throw Error('Set AUDIT_PVP_ROOT to the reviewed local pvp directory');
const {fixture}=await import(pathToFileURL(path.join(process.env.AUDIT_PVP_ROOT,'tests/fixture.mjs')).href);

test('EXPOSURE R01: each sequential catalog request reads all open lobbies before pagination',async t=>{
 const f=fixture();t.after(()=>f.store.close());
 for(let i=0;i<8;i++)await f.game.create(`host${i}.testnet`,'1',`catalog-host-${i}`,'public');
 const original=f.chain.match.bind(f.chain);let reads=0;f.chain.match=async id=>{reads++;return original(id);};
 for(let i=0;i<5;i++)assert.equal((await f.game.lobbies({limit:'1'})).items.length,1);
 assert.equal(reads,40); // limit=1 bounds response rows, not upstream RPC work.
});

test('EXPOSURE A03 persists in PR2: hidden expired lobbies still occupy capacity',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.cfg.maxActive=2;
 for(let i=0;i<2;i++)await f.game.create(`sybil${i}.testnet`,'1',`catalog-sybil-${i}`,'public');
 f.step(601000);await f.game.sync();assert.equal((await f.game.lobbies()).total,0);
 await assert.rejects(f.game.create('honest.testnet','1','honest-catalog-request','public'),/full/);
});

test('GUARD: invalid catalog queries do not fan out RPC and private IDs cannot use public join',async t=>{
 const f=fixture();t.after(()=>f.store.close());const secret=await f.game.create('alice.testnet','1','private-catalog-request','private');
 let reads=0;f.chain.match=async()=>{reads++;throw Error('Should not read');};
 await assert.rejects(f.game.lobbies({limit:'1000000'}));
 await assert.rejects(f.game.join(secret.code,'mallory.testnet',{publicOnly:true}));
 assert.equal(reads,0);
});
