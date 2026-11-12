// Operator-only, one-time Testnet provisioning. Never imported by the game server.
import fs from 'node:fs';
import path from 'node:path';
import {Account,KeyPair} from 'near-api-js';
import {config,root} from './config.mjs';
import {Store} from './store.mjs';
import {Chain} from './chain.mjs';
import {durableSend} from './durable.mjs';
const players=process.argv.slice(2);if(players.length!==2||new Set(players).size!==2||players.some(id=>!/^([a-z0-9._-]+\.testnet|[a-f0-9]{64})$/.test(id)))throw Error('Pass two distinct Testnet player account IDs');
const keyFile=process.env.FT_OWNER_KEY_FILE;if(!keyFile||!path.isAbsolute(keyFile))throw Error('Set FT_OWNER_KEY_FILE to an external owner credential. Do not use the restricted server key.');
const real=fs.realpathSync(keyFile),project=fs.realpathSync(path.resolve(root,'../../..')),relative=path.relative(project,real);if(!relative.startsWith('..')&&!path.isAbsolute(relative))throw Error('Owner credential must stay outside the project');
const cfg=config(),store=new Store(path.join(cfg.dataDir,'funding'));
try{
 const chain=new Chain(cfg,store);await chain.preflight({loadSigner:false});
 let key,pair;try{key=JSON.parse(fs.readFileSync(real,'utf8'));pair=KeyPair.fromString(key.private_key||key.secret_key);}catch{throw Error('Owner credential is unreadable or malformed');}
 if(key.account_id!==chain.chainConfig.admin)throw Error('This provisioning helper requires the original Testnet token owner / admin account');
 const access=await chain.rpc('query',{request_type:'view_access_key',account_id:key.account_id,public_key:pair.getPublicKey().toString(),finality:'final'});if(access.permission!=='FullAccess')throw Error('Owner wallet key required');
 const account=new Account(key.account_id,chain.provider,pair.toString());
 for(const player of players){
  await chain.rpc('query',{request_type:'view_account',account_id:player,finality:'final'});
  const balance=await chain.balance(player);
  const send=(id,method,args,deposit=0n)=>durableSend({store,id,method,args,deposit,receiverId:cfg.token,accountId:key.account_id,account,rpc:chain.rpc.bind(chain)});
  if(!balance.registered)await send('register:'+player,'storage_deposit',{account_id:player,registration_only:true},BigInt(balance.storageMinimum));
  if(BigInt(balance.balance)<20000000n){
   // Freeze the exact initial amount before signing. Re-running after an ambiguous reply uses the same intent.
   let plan=store.get('fund-plan',player);if(!plan){plan={amount:String(20000000n-BigInt(balance.balance))};store.put('fund-plan',player,plan);}
   await send('initial-mint:'+player,'mint',{account_id:player,amount:plan.amount});
  }
  console.log(player+': '+(await chain.balance(player)).balance+' test-token base units');
 }
}catch(e){console.error('Testnet provisioning stopped:',e.message);process.exitCode=1;}finally{store.close();}
