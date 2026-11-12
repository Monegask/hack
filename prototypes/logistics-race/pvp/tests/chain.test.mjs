import test from 'node:test';
import assert from 'node:assert/strict';
import {Account,KeyPair,SignedTransaction,Transaction,baseDecode,baseEncode,actions} from 'near-api-js';
import {createHash} from 'node:crypto';
import {Chain} from '../server/chain.mjs';
import {Store} from '../server/store.mjs';
test('durable signed outbox rebroadcasts the identical transaction after ambiguous RPC and restart',async t=>{
 const store=new Store('',{memory:true});t.after(()=>store.close());const cfg={rpc:'http://unused',server:'server.testnet',escrow:'escrow.testnet'},key=KeyPair.fromRandom('ed25519');let signatures=0,broadcasts=[],confirm=false;
 const a=new Chain(cfg,store);a.account={async createSignedTransaction({receiverId,actions}){signatures++;return (await new Account('server.testnet',{},key.toString()).getSigner().signTransaction(new Transaction({signerId:'server.testnet',publicKey:key.getPublicKey(),receiverId,nonce:1n,actions,blockHash:new Uint8Array(32)}))).signedTransaction;}};
 const rpc=async(method,params)=>{if(method==='tx')throw Error('Unknown transaction');broadcasts.push(params.signed_tx_base64);const decoded=SignedTransaction.decode(Buffer.from(params.signed_tx_base64,'base64'));assert.equal(decoded.transaction.receiverId,'escrow.testnet');if(!confirm)throw Error('Connection lost after broadcast');return {final_execution_status:'FINAL',status:{SuccessValue:Buffer.from('"17"').toString('base64')}};};a.rpc=rpc;
 await assert.rejects(a.execute('create-1','create_lobby',{creator:'alice.testnet',stake:'5000000'}),e=>e.pending);assert.equal(signatures,1);assert.equal(store.get('outbox','create-1').status,'signed');
 const b=new Chain(cfg,store);b.rpc=rpc;confirm=true;const result=await b.execute('create-1','create_lobby',{creator:'alice.testnet',stake:'5000000'});assert.equal(result.value,'17');assert.equal(signatures,1);assert.equal(new Set(broadcasts).size,1);assert.equal(store.get('outbox','create-1').status,'done');
 assert.deepEqual(await b.execute('create-1','create_lobby',{creator:'alice.testnet',stake:'5000000'}),result);assert.equal(broadcasts.length,2);
 await assert.rejects(b.execute('create-1','create_lobby',{creator:'bob.testnet',stake:'5000000'}));await assert.rejects(b.execute('bad','deploy_contract',{}));
});
