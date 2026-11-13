// Conservative reconciliation of the original wallet transaction and final receipt tree.
// No timeout, aggregate token balance or client assertion can clear an unknown payment.
import {uint} from './adapters/escrow-v2.mjs';
export function prepareIntent(store,cfg,{id,account,code,kind,match,transaction,terms=null}){
 if(!/^[a-zA-Z0-9-]{8,80}$/.test(id||''))throw Error('Payment request ID required');
 const key=JSON.stringify([cfg.scope,account,id]),prior=store.get('payment',key);
 const value={id,key,scope:cfg.scope,account,code,kind,matchId:match?.id??null,terms,transaction,before:match?.payouts??null};
 if(prior){if(JSON.stringify({...prior,hash:undefined,result:undefined})!==JSON.stringify(value))throw Error('Payment ID reused with different terms');return prior;}
 if(store.all('payment').some(p=>p.scope===cfg.scope&&p.account===account&&!p.result?.resolved))throw Error('Previous payment is unresolved; reconcile it first');
 store.put('payment',key,value);return value;
}
function transactionMatches(tx,intent){
 if(tx.signer_id!==intent.account||tx.receiver_id!==intent.transaction.receiverId||!Array.isArray(tx.actions)||tx.actions.length!==1)throw Error('Payment transaction identity mismatch');
 const f=tx.actions[0].FunctionCall,p=intent.transaction.actions[0].params;
 if(!f||f.method_name!==p.methodName||String(f.deposit)!==p.deposit||JSON.stringify(JSON.parse(Buffer.from(f.args,'base64').toString()))!==JSON.stringify(p.args))throw Error('Payment transaction arguments mismatch');
}
export async function reconcileIntent(chain,store,intent,hash){
 if(intent.scope!==chain.cfg.scope)throw Error('Payment deployment mismatch');
 if(!hash)return {state:'unknown',retrySafe:false};
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hash))throw Error('Invalid transaction hash');
 if(intent.hash&&intent.hash!==hash)throw Error('Payment hash cannot be replaced');
 await chain.assertNetwork();if(chain.control)await chain.control();
 const tx=await chain.rpc('tx',{tx_hash:hash,sender_account_id:intent.account,wait_until:'FINAL'});
 if(tx.transaction?.hash!==hash)throw Error('Payment hash mismatch');transactionMatches(tx.transaction,intent);
 intent.hash=hash;store.put('payment',intent.key,intent);
 if(tx.final_execution_status!=='FINAL')return {state:'pending',retrySafe:false};
 const outcomes=tx.receipts_outcome;if(!Array.isArray(outcomes)||!outcomes.length)return {state:'unknown',retrySafe:false};
 // Read the escrow only at a finalized block at least as new as every receipt.
 const receiptBlocks=await Promise.all([...new Set(outcomes.map(r=>r.block_hash))].map(block_id=>chain.rpc('block',{block_id})));
 const block=await chain.rpc('block',{finality:'final'});if(receiptBlocks.some(b=>b.header.height>block.header.height))return {state:'pending',retrySafe:false};
 const m=intent.matchId===null?null:chain.adapter.match(await chain.view(chain.cfg.escrow,'get_match',{match_id:intent.matchId},block.header.hash));
 if(m&&![m.creator,m.opponent,...m.payouts.map(p=>p.receiver)].includes(intent.account))throw Error('Payment participant mismatch');
 let result={state:'unknown',retrySafe:false};
 const rootId=tx.transaction_outcome?.outcome?.receipt_ids?.[0],root=outcomes.find(r=>r.id===rootId);
 const initialFailure=root?.outcome?.executor_id===intent.transaction.receiverId&&!!root.outcome.status?.Failure;
 if(intent.kind==='deposit'){
  const p=intent.transaction.actions[0].params,terms=JSON.parse(p.args.msg);
  const accepted=outcomes.some(r=>r.outcome.executor_id===chain.cfg.escrow&&!r.outcome.status?.Failure&&(r.outcome.logs||[]).some(log=>{
   if(!log.startsWith('EVENT_JSON:'))return false;try{const e=JSON.parse(log.slice(11));return e.standard==='near_pvp_escrow'&&e.version==='1.0.0'&&e.event==='deposit_accepted'&&e.data.some(d=>d.match_id===intent.matchId&&d.sender===intent.account&&d.amount===p.args.amount&&d.revision===terms.revision);}catch{return false;}
  }));
  if(accepted&&m?.deposited[[m.creator,m.opponent].indexOf(intent.account)])result={state:'accepted',retrySafe:false,resolved:true};
  else if(initialFailure)result={state:'failed-before-transfer',retrySafe:true,resolved:true};
  else if(Object.hasOwn(tx.status||{},'SuccessValue')){
   let used;try{used=JSON.parse(Buffer.from(tx.status.SuccessValue,'base64').toString());uint(used,128);}catch{used=null;}
   if(used==='0'&&!accepted)result={state:'refunded-by-resolver',retrySafe:true,resolved:true};
  }
  // A failed resolver after successful transfer may leave unaccounted funds. Never retry.
 }else if(initialFailure)result={state:'failed',retrySafe:true,resolved:true};
 else if(intent.kind==='register'){
  const registered=await chain.view(chain.cfg.token,'storage_balance_of',{account_id:intent.account},block.header.hash);if(registered)result={state:'registered',retrySafe:false,resolved:true};
 }else if(m){
  if(intent.kind==='claim'){
   const index=intent.transaction.actions[0].params.args.index,p=m.payouts[index],before=intent.before[index];
   if(p.receiver!==before.receiver||p.amount!==before.amount||BigInt(p.attempt)<BigInt(before.attempt))throw Error('Payout changed');
   if(p.state==='Paid')result={state:'paid',retrySafe:false,resolved:true};
   else if(p.state==='Ready')result={state:'ready-to-retry',retrySafe:true,resolved:true};
   else result={state:'in-flight',retrySafe:false};
  }else if(['Cancelled','SettlementPending','Completed'].includes(m.state))result={state:m.state==='Cancelled'?'refund-obligations-created':'result-recorded',retrySafe:false,resolved:true,payouts:m.payouts};
  else if(intent.kind==='mutual'&&m.cancel_requester===intent.account)result={state:'cancellation-requested',retrySafe:false,resolved:true};
  else if(intent.kind==='reject'&&m.cancel_requester===null)result={state:'cancellation-rejected',retrySafe:false,resolved:true};
 }
 intent.result=result;store.put('payment',intent.key,intent);return result;
}

export function replayIntent(store,cfg,{id,account,code,kind,terms=null,matchId}){if(!id)return null;const prior=store.get('payment',JSON.stringify([cfg.scope,account,id]));if(!prior)return null;if((matchId!==undefined&&prior.matchId!==matchId)||prior.code!==code||prior.kind!==kind||JSON.stringify(prior.terms??null)!==JSON.stringify(terms))throw Error('Payment ID reused with different terms');return prior.result?.resolved?{network:cfg.network,intentId:id,alreadyResolved:true,result:prior.result}:{network:cfg.network,intentId:id,replay:true,transaction:prior.transaction};}
