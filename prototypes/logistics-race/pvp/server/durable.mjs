import {createHash} from 'node:crypto';
import {actions,baseEncode} from 'near-api-js';
export class PendingChain extends Error{constructor(){super('Transaction confirmation pending. Checking the same transaction; no duplicate payment.');this.pending=true;}}
export async function durableSend({store,id,method,args,receiverId,accountId,account,rpc,deposit=0n}){
 let op=store.get('outbox',id),fresh=false;
 if(op&&(op.method!==method||op.receiverId!==receiverId||op.accountId!==accountId||op.deposit!==String(deposit)||JSON.stringify(op.args)!==JSON.stringify(args)))throw Error('Operation ID reused with different arguments');
 if(op?.status==='done')return op.result;
 if(op?.status==='failed')throw Error('Confirmed chain failure; operator reconciliation required');
 if(!op){
  if(!account)throw Error('Signer preflight required');const tx=await account.createSignedTransaction({receiverId,actions:[actions.functionCall(method,args,250000000000000n,deposit)]});
  op={id,method,args,receiverId,accountId,deposit:String(deposit),hash:baseEncode(createHash('sha256').update(tx.transaction.encode()).digest()),bytes:Buffer.from(tx.encode()).toString('base64'),status:'signed',created:Date.now()};
  store.put('outbox',id,op);fresh=true;
 }
 // A fresh durable signature has never been broadcast; querying its hash can only delay/expire it.
 let result;if(!fresh)try{result=await rpc('tx',{tx_hash:op.hash,sender_account_id:accountId,wait_until:'FINAL'});}catch{}
 if(!result){try{result=await rpc('send_tx',{signed_tx_base64:op.bytes,wait_until:'FINAL'});}catch{throw new PendingChain();}}
 if(result.final_execution_status!=='FINAL')throw new PendingChain();
 if(!result.status||!Object.hasOwn(result.status,'SuccessValue')){op.status='failed';op.failure=result.status;store.put('outbox',id,op);throw Error('Confirmed escrow transaction failure');}
 const value=result.status.SuccessValue;op.status='done';op.result={hash:op.hash,value:value?JSON.parse(Buffer.from(value,'base64').toString()):null};delete op.bytes;store.put('outbox',id,op);return op.result;
}
