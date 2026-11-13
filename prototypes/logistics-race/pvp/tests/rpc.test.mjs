import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {callRpc} from '../server/rpc.mjs';
import {Chain} from '../server/chain.mjs';
import {createApp} from '../server/http.mjs';
import {fixture} from './fixture.mjs';
test('RPC read retries a temporary rejection; signed writes are never retried by the transport',async()=>{
 let reads=0,waits=0;
 const result=await callRpc('https://unused.test','query',{}, {fetcher:async()=>++reads===1?new Response('',{status:429}):Response.json({result:{ok:true}}),wait:async()=>waits++});
 assert.deepEqual(result,{ok:true});assert.equal(reads,2);assert.equal(waits,1);
 let writes=0;await assert.rejects(callRpc('https://unused.test','send_tx',{}, {fetcher:async()=>{writes++;return new Response('',{status:503});},wait:async()=>assert.fail('Writes must use the outbox')}),e=>e.rpc.status===503);assert.equal(writes,1);
});
test('RPC deterministic errors are not retried and transport failures carry an availability marker',async()=>{
 let calls=0;await assert.rejects(callRpc('https://unused.test','query',{}, {fetcher:async()=>{calls++;return Response.json({error:{code:-32000,message:'Unknown account'}});}}),e=>e.rpc.code===-32000);assert.equal(calls,1);
 calls=0;await assert.rejects(callRpc('https://unused.test','query',{}, {fetcher:async()=>{calls++;throw Error('network');},wait:async()=>{}}),e=>e.rpc.kind==='transport');assert.equal(calls,2);
});
test('token storage bounds are shared but balances remain live for each wallet',async()=>{
 const chain=new Chain({rpc:'https://unused.test',token:'token.testnet',gasReserve:'10'},null);let bounds=0,balances=0;
 chain.rpc=async(method)=>method==='status'?{chain_id:'testnet'}:method==='query'?{amount:'1000',storage_usage:2}:{runtime_config:{storage_amount_per_byte:'10'}};
 chain.view=async(_account,method,args)=>{if(method==='storage_balance_bounds'){bounds++;return {min:'125'};}if(method==='storage_balance_of')return {total:'125'};balances++;return args.account_id==='a.testnet'?'20':'15';};
 const [a,b]=await Promise.all([chain.balance('a.testnet'),chain.balance('b.testnet')]);assert.equal(bounds,1);assert.equal(balances,2);assert.equal(a.balance,'20');assert.equal(b.balance,'15');
});
test('concurrent balance requests share RPC work; failed entries return 503 and recover',async t=>{
 const f=fixture();t.after(()=>f.store.close());const app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const url='http://127.0.0.1:'+app.address().port;
 f.store.put('session',createHash('sha256').update('rpc-test-session').digest('hex'),{account:'alice.testnet',csrf:'fixture',expires:Date.now()+60000});
 let calls=0,fail=true;f.chain.balance=async()=>{calls++;await new Promise(r=>setTimeout(r,25));if(fail){const e=Error('temporary');e.rpc={status:429};throw e;}return {balance:'20',registered:true,storageMinimum:'1'};};
 const get=()=>fetch(url+'/api/balance',{headers:{cookie:'sl_session=rpc-test-session'}});
 const errors=await Promise.all([get(),get()]);assert(errors.every(r=>r.status===503));assert.equal(calls,1);
 fail=false;const successes=await Promise.all([get(),get(),get()]);assert(successes.every(r=>r.status===200));assert.equal(calls,2);assert.equal((await successes[0].json()).balance,'20');
});

test('balance refuses a malformed protocol config rather than inventing a storage cost',async()=>{const chain=new Chain({rpc:'https://unused.test',token:'token.testnet',gasReserve:'10'},null);chain.rpc=async method=>method==='status'?{chain_id:'testnet'}:method==='query'?{amount:'1000',storage_usage:2}:{storage_amount_per_byte:'10'};chain.view=async(_id,method)=>method==='ft_balance_of'?'20':method==='storage_balance_bounds'?{min:'125'}:{total:'125'};await assert.rejects(chain.balance('a.testnet'),/storage cost/);});
