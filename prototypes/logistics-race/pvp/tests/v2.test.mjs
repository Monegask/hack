import test from 'node:test';
import assert from 'node:assert/strict';
import {EscrowV2Adapter,validateConfig,validateMatch,validateRuntimeAccess,SERVER_METHODS,CIRCLE_USDC} from '../server/adapters/escrow-v2.mjs';
import {prepareIntent,reconcileIntent} from '../server/recovery-v2.mjs';
import {Store} from '../server/store.mjs';
import {fixture,playing} from './fixture.mjs';
const cfg={network:'mainnet',token:CIRCLE_USDC,server:'server.near',escrow:'escrow.near',scope:'unit-v2'};
const config=()=>({state_version:2,admin:'fee.near',pending_admin:null,server:cfg.server,token:cfg.token,paused:false,server_frozen:false,pending_fee:null,last_heartbeat_ns:'100000000000',fee_bps:300});
const match=()=>({id:'0',creator:'alice.near',opponent:'bob.near',stake:'5000000',revision:'0',fee_bps:300,fee_receiver:'fee.near',created_at_ns:'1',deadline_ns:'600000000001',joined_at_ns:'2',activity_confirmed:true,deposited:[false,false],ready_at_ns:null,last_heartbeat_ns:null,game_deadline_ns:null,state:'AwaitingDeposits',winner:null,cancel_requester:null,cancel_nonce:'0',payouts:[{receiver:'alice.near',amount:'0',state:'Paid',attempt:'0'},{receiver:'fee.near',amount:'0',state:'Paid',attempt:'0'}]});
const adapter=new EscrowV2Adapter(cfg);
test('v2 validates schema, immutable roles, deadline fields and exact financial allocations',()=>{
 assert.equal(validateConfig(config(),cfg).state_version,2);assert.equal(validateMatch(match()).id,'0');
 for(const patch of [{state_version:1},{server_frozen:'false'},{token:'usdc.bridge.near'},{fee_bps:501},{pending_fee:{fee_bps:300,activate_at_ns:1}}])assert.throws(()=>validateConfig({...config(),...patch},cfg));
 for(const patch of [{state:'FutureState'},{revision:0},{game_deadline_ns:'-1'},{stake:'170141183460469231731687303715884105728'},{deposited:[true]}])assert.throws(()=>validateMatch({...match(),...patch}));
 const m={...match(),state:'Completed',deposited:[true,true],winner:'alice.near',last_heartbeat_ns:'100',game_deadline_ns:'1000000',payouts:[{receiver:'alice.near',amount:'9700000',state:'Paid',attempt:'1'},{receiver:'fee.near',amount:'300000',state:'Paid',attempt:'1'}]};assert.equal(validateMatch(m).state,'Completed');assert.throws(()=>validateMatch({...m,payouts:[{...m.payouts[0],receiver:'evil.near'},m.payouts[1]]}));
});
test('v2 server adapter rejects arbitrary methods, recipients, extra args and invalid numeric encodings',()=>{
 assert.equal(adapter.serverCall('create_lobby',{creator:'alice.near',stake:'1000000'}).deposit,'0');
 for(const [method,args] of [['ft_transfer',{receiver_id:'evil.near',amount:'5'}],['upgrade',{}],['create_lobby',{creator:'alice.near',stake:'1000000',receiver_id:'evil.near'}],['heartbeat',{match_ids:Array(33).fill('0')}],['submit_result',{match_id:0,winner:'alice.near'}]])assert.throws(()=>adapter.serverCall(method,args));
});
test('runtime permission validation rejects FullAccess, wildcard methods, extra methods and unbounded allowance',()=>{
 const access=()=>({permission:{FunctionCall:{receiver_id:cfg.escrow,method_names:[...SERVER_METHODS],allowance:'500000000000000000000000'}}});assert(validateRuntimeAccess(access(),cfg));
 assert.throws(()=>validateRuntimeAccess({permission:'FullAccess'},cfg));
 for(const p of [{receiver_id:cfg.token},{method_names:[]},{method_names:[...SERVER_METHODS,'claim_payout']},{allowance:null},{allowance:'2000000000000000000000000'}]){const a=access();Object.assign(a.permission.FunctionCall,p);assert.throws(()=>validateRuntimeAccess(a,cfg));}
});
test('v2 player calls bind terms, reject foreign players and permit only fixed fee beneficiary claims',()=>{
 const m=match(),request={kind:'deposit',match:m,account:'alice.near',terms:{stake:m.stake,revision:m.revision,feeBps:m.fee_bps,opponent:m.opponent},now:100n,config:config()};const tx=adapter.playerTransaction(request);assert.equal(tx.receiverId,CIRCLE_USDC);assert.equal(tx.actions[0].params.deposit,'1');
 assert.throws(()=>adapter.playerTransaction({...request,account:'evil.near'}));assert.throws(()=>adapter.playerTransaction({...request,terms:{...request.terms,feeBps:0}}));assert.throws(()=>adapter.playerTransaction({...request,config:{...config(),paused:true}}));
 const settled={...m,state:'SettlementPending',deposited:[true,true],winner:'alice.near',last_heartbeat_ns:'100',game_deadline_ns:'1000000',payouts:[{receiver:'alice.near',amount:'9700000',state:'Paid',attempt:'1'},{receiver:'fee.near',amount:'300000',state:'Ready',attempt:'1'}]};
 const claim=adapter.playerTransaction({kind:'claim',match:settled,account:'fee.near',now:101n,config:config()});assert.equal(claim.actions[0].params.args.index,1);assert.equal(claim.actions[0].params.gas,'250000000000000');assert.throws(()=>adapter.playerTransaction({kind:'claim',match:settled,account:'alice.near',now:101n,config:config()}));
});
test('worker detects v2 absolute deadline and frozen state before winner/result/heartbeat',async t=>{
 for(const reason of ['deadline','frozen']){const f=fixture();t.after(()=>f.store.close());const m=await playing(f),c=f.chain.matches.get(m.chainId);c.game_deadline_ns=String(BigInt(f.now())*1000000n+(reason==='deadline'?-1n:9999999999999n));f.chain.adapter={refundReason:adapter.refundReason.bind(adapter)};f.chain.control=async()=>({...config(),server_frozen:reason==='frozen'});const heartbeats=f.chain.heartbeats.length;m.result={winner:m.players[0]};m.phase='settling';await f.game.reconcile(m);assert.equal(m.phase,'refund');assert.equal(f.chain.results.length,0);await f.game.sync();assert.equal(f.chain.heartbeats.length,heartbeats);}
});
function recoveryFixture(t,kind='deposit'){
 const store=new Store('',{memory:true});t.after(()=>store.close());const m=match(),transaction=adapter.playerTransaction({kind:'deposit',match:m,account:'alice.near',terms:{stake:m.stake,revision:m.revision,feeBps:300,opponent:m.opponent},now:100n,config:config()});
 const intent=prepareIntent(store,cfg,{id:'request-0001',account:'alice.near',code:null,kind,match:m,transaction}),hash='1'.repeat(32),params=transaction.actions[0].params;
 const tx={transaction:{hash,signer_id:'alice.near',receiver_id:cfg.token,actions:[{FunctionCall:{method_name:params.methodName,deposit:'1',args:Buffer.from(JSON.stringify(params.args)).toString('base64')}}]},transaction_outcome:{outcome:{receipt_ids:['root']}},final_execution_status:'FINAL',status:{SuccessValue:Buffer.from('"0"').toString('base64')},receipts_outcome:[{id:'root',block_hash:'b',outcome:{executor_id:cfg.token,status:{SuccessReceiptId:'resolver'},logs:[]}}]};
 const chain={cfg,adapter,assertNetwork:async()=>{},rpc:async(method)=>method==='tx'?tx:{header:{height:10,hash:'final'}},view:async()=>m};return {store,m,tx,chain,intent,hash,transaction};
}
test('payment request IDs are immutable and unresolved payments block a second device/request',t=>{
 const f=recoveryFixture(t);assert.throws(()=>prepareIntent(f.store,cfg,{id:'request-0002',account:'alice.near',code:null,kind:'deposit',match:f.m,transaction:f.transaction}),/unresolved/);
 assert.throws(()=>prepareIntent(f.store,cfg,{id:'request-0001',account:'alice.near',code:null,kind:'claim',match:f.m,transaction:f.transaction}),/reused/);
});
test('recovery never unlocks a failed resolver after token transfer, unknown tx or non-final receipts',async t=>{
 const f=recoveryFixture(t);f.tx.status={Failure:{message:'resolver blocked'}};assert.equal((await reconcileIntent(f.chain,f.store,f.intent,f.hash)).retrySafe,false);
 f.tx.final_execution_status='EXECUTED';assert.equal((await reconcileIntent(f.chain,f.store,f.intent,f.hash)).state,'pending');f.chain.rpc=async()=>{throw Error('unknown transaction');};await assert.rejects(reconcileIntent(f.chain,f.store,f.intent,f.hash),/unknown transaction/);
});
test('recovery distinguishes confirmed full resolver refund and atomic pre-transfer failure',async t=>{
 const f=recoveryFixture(t);assert.equal((await reconcileIntent(f.chain,f.store,f.intent,f.hash)).state,'refunded-by-resolver');
 f.tx.status={Failure:{}};f.tx.receipts_outcome[0].outcome.status={Failure:{}};assert.equal((await reconcileIntent(f.chain,f.store,f.intent,f.hash)).state,'failed-before-transfer');
});
test('recovery requires exact signer/receiver/arguments and receipt-linked accepted deposit',async t=>{
 const f=recoveryFixture(t);f.tx.transaction.receiver_id='evil.near';await assert.rejects(reconcileIntent(f.chain,f.store,f.intent,f.hash),/identity/);f.tx.transaction.receiver_id=cfg.token;
 f.m.deposited[0]=true;f.tx.status={SuccessValue:Buffer.from('"5000000"').toString('base64')};assert.equal((await reconcileIntent(f.chain,f.store,f.intent,f.hash)).state,'unknown');
 f.tx.receipts_outcome.push({id:'accept',block_hash:'b',outcome:{executor_id:cfg.escrow,status:{SuccessValue:'MA=='},logs:['EVENT_JSON:'+JSON.stringify({standard:'near_pvp_escrow',event:'deposit_accepted',data:[{match_id:'0',sender:'alice.near',amount:'5000000',revision:'0'}]})]}});assert.equal((await reconcileIntent(f.chain,f.store,f.intent,f.hash)).state,'accepted');
});
