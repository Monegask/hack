import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Account,JsonRpcProvider,KeyPair,baseEncode} from 'near-api-js';
import {verifyMessage} from 'near-api-js/nep413';
import {root} from './config.mjs';
import {durableSend,PendingChain} from './durable.mjs';
import {callRpc} from './rpc.mjs';
const METHODS=['create_lobby','bind_opponent','update_stake','record_activity','start_match','submit_result','heartbeat'];
export {PendingChain};
export class Chain{
 constructor(cfg,store){this.cfg=cfg;this.store=store;this.provider=new JsonRpcProvider({url:cfg.rpc});this.tail=Promise.resolve();}
 rpc(method,params){return callRpc(this.cfg.rpc,method,params);}
 async view(account,method,args={}){const r=await this.rpc('query',{request_type:'call_function',account_id:account,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),finality:'final'});return JSON.parse(Buffer.from(r.result).toString());}
 match(id){return this.view(this.cfg.escrow,'get_match',{match_id:String(id)});}
 async preflight({loadSigner=true}={}){
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
  if(typeof signed.accountId!=='string'||!/^([a-z0-9._-]+\.testnet|[a-f0-9]{64})$/.test(signed.accountId))throw Error('Use a Testnet account');
  await verifyMessage({signerAccountId:signed.accountId,signerPublicKey:signed.publicKey,signature:Buffer.from(signed.signature,'base64'),payload,provider:this.provider});
  // Authentication requires an actual full-access wallet key, not a delegated app key.
  const a=await this.rpc('query',{request_type:'view_access_key',account_id:signed.accountId,public_key:signed.publicKey,finality:'final'});if(a.permission!=='FullAccess')throw Error('Sign with your wallet owner key');return signed.accountId;
 }
 async execute(id,method,args){const task=()=>this.executeSerial(id,method,args);const p=this.tail.then(task,task);this.tail=p.catch(()=>{});return p;}
 async executeSerial(id,method,args){
  if(!METHODS.includes(method))throw Error('Server method not allowed');
  return durableSend({store:this.store,id,method,args,receiverId:this.cfg.escrow,accountId:this.cfg.server,account:this.account,rpc:this.rpc.bind(this)});
 }
 async balance(account){
  if(!this.bounds||this.bounds.until<Date.now()){
   const cached={until:Date.now()+60000};cached.promise=this.view(this.cfg.token,'storage_balance_bounds').catch(error=>{if(this.bounds===cached)this.bounds=null;throw error;});this.bounds=cached;
  }
  const [balance,storage,bounds]=await Promise.all([this.view(this.cfg.token,'ft_balance_of',{account_id:account}),this.view(this.cfg.token,'storage_balance_of',{account_id:account}),this.bounds.promise]);return {balance,registered:!!storage,storageMinimum:bounds.min};
 }
 async chainTime(){const r=await this.rpc('block',{finality:'final'});return BigInt(r.header.timestamp_nanosec);}
}
