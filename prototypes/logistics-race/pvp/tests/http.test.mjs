import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Account,KeyPair} from 'near-api-js';
import {signMessage} from 'near-api-js/nep413';
import {fixture,playing} from './fixture.mjs';
import {createApp} from '../server/http.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
async function serve(t,f){const app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));return 'http://127.0.0.1:'+app.address().port;}
test('HTTP authentication uses a real NEP413 signature, single-use challenge and origin/cookie binding',async t=>{
 const f=fixture();t.after(()=>f.store.close());const origin=await serve(t,f);f.cfg.origin=origin;
 const key=KeyPair.fromRandom('ed25519'),account=new Account('alice.testnet',{},key.toString());f.chain.keys.set('alice.testnet',key.getPublicKey().toString());
 const post=(url,body,cookie='',extra={})=>fetch(origin+url,{method:'POST',headers:{origin,'content-type':'application/json',cookie,...extra},body:JSON.stringify(body)});
 const bad=await post('/api/auth/challenge',{},'',{origin:'https://evil.example'});assert.equal(bad.status,403);
 const ch=await post('/api/auth/challenge',{}),challenge=await ch.json(),chCookie=ch.headers.getSetCookie()[0].split(';')[0];
 const signed=await signMessage({signerAccount:account,payload:{message:challenge.message,recipient:challenge.recipient,nonce:Buffer.from(challenge.nonce,'base64')}});
 const body={challengeId:challenge.id,signed:{accountId:signed.accountId,publicKey:signed.publicKey.toString(),signature:Buffer.from(signed.signature).toString('base64')}};assert.equal((await post('/api/auth/verify',body)).status,401);
 const good=await post('/api/auth/verify',body,chCookie);assert.equal(good.status,200,await good.clone().text());assert.ok(good.headers.getSetCookie().some(c=>c.includes('HttpOnly')&&c.includes('SameSite=Strict')));
 const session=await good.json(),sessionCookie=good.headers.getSetCookie().find(x=>x.startsWith('sl_session')).split(';')[0];assert.equal(session.account,'alice.testnet');assert.equal((await post('/api/auth/verify',body,chCookie)).status,401);
 assert.equal((await post('/api/matches',{amount:'5',id:'request-001'},sessionCookie)).status,403);
 const created=await post('/api/matches',{amount:'5',id:'request-001'},sessionCookie,{'x-csrf-token':session.csrf});assert.equal(created.status,200);assert.equal((await created.json()).players[0],'alice.testnet');
});
test('HTTP player transactions bind exact accepted terms, use yocto deposits, and claim a fixed payout index',async t=>{
 const f=fixture();t.after(()=>f.store.close());const origin=await serve(t,f);f.cfg.origin=origin;
 const a=await f.game.create('alice.testnet','5','request-001');await f.game.join(a.code,'bob.testnet');const m=f.game.matches.get(a.code);
 f.store.put('session',hash('alice-session'),{account:'alice.testnet',csrf:'test-csrf',expires:Date.now()+60000});
 const post=async body=>{const r=await fetch(origin+'/api/matches/'+m.code+'/transaction',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'sl_session=alice-session','x-csrf-token':'test-csrf'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const terms={stake:m.stake,revision:'0',feeBps:300,opponent:'bob.testnet'};
 assert.equal((await post({kind:'deposit',terms:{...terms,stake:'1000000'}})).status,400);
 const deposit=await post({kind:'deposit',terms});assert.equal(deposit.status,200);assert.equal(deposit.body.transaction.receiverId,'token.testnet');const call=deposit.body.transaction.actions[0].params;assert.equal(call.deposit,'1');assert.equal(call.args.amount,'5000000');assert.equal(JSON.parse(call.args.msg).match_id,m.chainId);
 const chain=f.chain.matches.get(m.chainId);chain.state='Completed';chain.payouts=[{receiver:'alice.testnet',amount:'9700000',state:'InFlight'},{receiver:'admin.testnet',amount:'300000',state:'Paid'}];
 assert.equal((await post({kind:'claim'})).status,400);chain.payouts[0].state='Ready';const claim=await post({kind:'claim'});assert.equal(claim.status,200);assert.deepEqual(claim.body.transaction.actions[0].params.args,{match_id:m.chainId,index:0});
 assert.equal((await fetch(origin+'/api/matches/'+m.code)).status,401);
});
