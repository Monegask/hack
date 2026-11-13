import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Account,JsonRpcProvider,KeyPair,baseEncode} from 'near-api-js';
import {verifyMessage} from 'near-api-js/nep413';
import {EscrowV2Adapter,SERVER_METHODS,validateRuntimeAccess} from './adapters/escrow-v2.mjs';
import {root,accountOnNetwork,requirePayments,CIRCLE_USDC} from './config.mjs';
import {durableSend,PendingChain} from './durable.mjs';
import {callRpc} from './rpc.mjs';
const METHODS=SERVER_METHODS;
export {PendingChain};
export class Chain{
 constructor(cfg,store){this.cfg=cfg;this.store=store;this.provider=new JsonRpcProvider({url:cfg.rpc});this.tail=Promise.resolve();this.adapter=(cfg.network==='mainnet'||cfg.adapterVersion==='escrow-v2')?new EscrowV2Adapter(cfg):null;}
 rpc(method,params){if(method==='send_tx')this.store.assertLease();return callRpc(this.cfg.rpc,method,params);}
 async view(account,method,args={},blockId=null){const r=await this.rpc('query',{request_type:'call_function',account_id:account,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),...(blockId?{block_id:blockId}:{finality:'final'})});return JSON.parse(Buffer.from(r.result).toString());}
 async match(id){const m=await this.view(this.cfg.escrow,'get_match',{match_id:String(id)});return this.adapter?this.adapter.match(m):m;}
 async preflight({loadSigner=true}={}){
  if(this.adapter)return this.v2Preflight();
  const [status,cfg,token,account]=await Promise.all([this.rpc('status',[]),this.view(this.cfg.escrow,'get_config'),this.view(this.cfg.token,'ft_metadata'),this.rpc('query',{request_type:'view_account',account_id:this.cfg.escrow,finality:'final'})]);
  if(status.chain_id!=='testnet'||cfg.token!==this.cfg.token||cfg.server!==this.cfg.server||token.decimals!==6||cfg.paused)throw Error('Testnet escrow configuration mismatch or paused');
  const wasm=fs.readFileSync(path.resolve(root,'../../../contracts/near-pvp-escrow/artifacts/near_pvp_escrow.wasm'));
  if(account.code_hash!==baseEncode(createHash('sha256').update(wasm).digest()))throw Error('Escrow code differs from the reviewed WASM');
  const registered=await this.view(this.cfg.token,'storage_balance_of',{account_id:this.cfg.escrow});if(!registered)throw Error('Escrow is not registered with FT');
  if(loadSigner){
   if(!this.cfg.keyFile||!path.isAbsolute(this.cfg.keyFile))throw Error('SERVER_KEY_FILE must be an absolute external file path');
   const keyPath=fs.realpathSync(this.cfg.keyFile),project=fs.realpathSync(path.resolve(root,'../../..'));
   const relative=path.relative(project,keyPath);if(!relative.startsWith('..')&&!path.isAbsolute(relative))throw Error('Signer must be outside the project');
   let key,pair;try{key=JSON.parse(fs.readFileSync(keyPath,'utf8'));pair=KeyPair.fromString(key.private_key||key.secret_key);}catch{throw Error('Signer credential is unreadable or malformed');}
   if(key.account_id!==this.cfg.server)throw Error('Signer account mismatch');const publicKey=pair.getPublicKey().toString();
   const access=await this.rpc('query',{request_type:'view_access_key',account_id:this.cfg.server,public_key:publicKey,finality:'final'});const p=access.permission?.FunctionCall;
   if(!p||p.receiver_id!==this.cfg.escrow||p.method_names.length!==METHODS.length||!METHODS.every(x=>p.method_names.includes(x))||p.allowance===null||BigInt(p.allowance)<10000000000000000000000n)throw Error('Runtime key must have exactly seven restricted escrow methods and funded allowance');
   this.account=new Account(this.cfg.server,this.provider,pair.toString());
  }
  this.chainConfig=cfg;return {network:'testnet',escrow:this.cfg.escrow,token:this.cfg.token,feeBps:cfg.fee_bps,symbol:token.symbol,signerChecked:loadSigner};
 }
 async authenticate(signed,payload){
  if(!signed||!accountOnNetwork(signed.accountId,this.cfg.network||'testnet'))throw Error('Use an account on the selected network');
  await this.assertNetwork();
  await verifyMessage({signerAccountId:signed.accountId,signerPublicKey:signed.publicKey,signature:Buffer.from(signed.signature,'base64'),payload,provider:this.provider});
  // Authentication requires an actual full-access wallet key, not a delegated app key.
  const a=await this.rpc('query',{request_type:'view_access_key',account_id:signed.accountId,public_key:signed.publicKey,finality:'final'});if(a.permission!=='FullAccess')throw Error('Sign with your wallet owner key');return signed.accountId;
 }
 async execute(id,method,args){const task=()=>this.executeSerial(id,method,args);const p=this.tail.then(task,task);this.tail=p.catch(()=>{});return p;}
 async executeSerial(id,method,args){
  requirePayments(this.cfg);
  if(!METHODS.includes(method))throw Error('Server method not allowed');
  await this.assertNetwork();
  if(this.adapter){this.adapter.serverCall(method,args);const c=await this.control();if(c.server_frozen)throw Error('Server frozen');if(['create_lobby','bind_opponent','update_stake','start_match'].includes(method)&&c.paused)throw Error('Escrow paused');if(method==='create_lobby')await this.requireRegistered([this.cfg.escrow,c.admin]);}
  return durableSend({store:this.store,id,method,args,receiverId:this.cfg.escrow,accountId:this.cfg.server,account:this.account,rpc:this.rpc.bind(this)});
 }
 async balance(account){
  await this.assertNetwork();
  if(!this.bounds||this.bounds.until<Date.now()){
   const cached={until:Date.now()+60000};cached.promise=this.view(this.cfg.token,'storage_balance_bounds').catch(error=>{if(this.bounds===cached)this.bounds=null;throw error;});this.bounds=cached;
  }
  const [balance,storage,bounds,native,protocol]=await Promise.all([this.view(this.cfg.token,'ft_balance_of',{account_id:account}),this.view(this.cfg.token,'storage_balance_of',{account_id:account}),this.bounds.promise,this.rpc('query',{request_type:'view_account',account_id:account,finality:'final'}),this.rpc('EXPERIMENTAL_protocol_config',{finality:'final'})]);
  const locked=BigInt(native.storage_usage)*BigInt(protocol.storage_amount_per_byte),available=BigInt(native.amount)>locked?BigInt(native.amount)-locked:0n;
  return {balance,registered:!!storage,storageMinimum:bounds.min,nearAvailable:String(available),gasReserve:this.cfg.gasReserve,hasGas:available>=BigInt(this.cfg.gasReserve)};
 }
 async assertNetwork(){const status=await this.rpc('status',[]);if(status.chain_id!==(this.cfg.network||'testnet'))throw Error('RPC chain_id does not match selected network');}
 async control(){
  if(!this.adapter)return this.chainConfig;
  const block=await this.rpc('block',{finality:'final'});
  const [c,code]=await Promise.all([this.view(this.cfg.escrow,'get_config',{},block.header.hash),this.rpc('query',{request_type:'view_account',account_id:this.cfg.escrow,block_id:block.header.hash})]);
  if(code.code_hash!==this.cfg.escrowCodeHash)throw Error('Escrow code hash mismatch');
  this.chainConfig=this.adapter.config(c);return this.chainConfig;
 }
 async requireRegistered(accounts){for(const id of new Set(accounts))if(!await this.view(this.cfg.token,'storage_balance_of',{account_id:id}))throw Error('FT recipient not registered: '+id);}
 async v2Preflight(){
  await this.assertNetwork();const c=await this.control();
  const token=await this.view(this.cfg.token,'ft_metadata');
  if(token.decimals!==6||(this.cfg.network==='mainnet'&&token.symbol!=='USDC'))throw Error('USDC metadata mismatch');
  await this.requireRegistered([this.cfg.escrow,c.admin]);
  return {network:this.cfg.network,escrow:this.cfg.escrow,token:this.cfg.token,symbol:token.symbol,feeBps:c.fee_bps,pendingFee:c.pending_fee,paused:c.paused,serverFrozen:c.server_frozen,signerChecked:false,paymentsEnabled:false,escrowApi:'escrow-v2'};
 }
 async checkRuntimeKey(publicKey){const access=await this.rpc('query',{request_type:'view_access_key',account_id:this.cfg.server,public_key:publicKey,finality:'final'});validateRuntimeAccess(access,this.cfg);return true;}

 async chainTime(){if(!this.timeCache||this.timeCache.until<Date.now()){const cached={until:Date.now()+250};cached.promise=this.rpc('block',{finality:'final'}).then(r=>BigInt(r.header.timestamp_nanosec)).catch(e=>{if(this.timeCache===cached)this.timeCache=null;throw e;});this.timeCache=cached;}return this.timeCache.promise;}
}
