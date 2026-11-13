import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function config(env=process.env){
 const network=env.NEAR_NETWORK||'testnet';
 if(!['testnet','mainnet'].includes(network))throw Error('NEAR_NETWORK must be testnet or mainnet');
 const mainnet=network==='mainnet';
 if(mainnet)for(const key of ['PUBLIC_ORIGIN','NEAR_RPC_URL','ESCROW_ID','SERVER_ACCOUNT','TOKEN_ID','ESCROW_CODE_HASH','DATA_DIR','ESCROW_API_VERSION','FEE_RECEIVER_ID'])if(!env[key])throw Error('Mainnet requires explicit '+key);
 if(mainnet&&env.SERVER_KEY_FILE)throw Error('Mainnet signer loading is disabled independent verification, audit and competition approval');
 const origin=new URL(env.PUBLIC_ORIGIN||'http://localhost:4190');
 if(origin.origin!==origin.href.replace(/\/$/,''))throw Error('PUBLIC_ORIGIN must be an origin without a path');
 if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw Error('Public access requires HTTPS');
 const c={network,origin:origin.origin,host:env.HOST||'127.0.0.1',port:Number(env.PORT||4190),rpc:env.NEAR_RPC_URL||'https://rpc.testnet.near.org',escrow:env.ESCROW_ID||'dev-20261105124711-29870979355191.testnet',token:env.TOKEN_ID||'dev-20261105124714-71962479239708.testnet',server:env.SERVER_ACCOUNT||'dev-20261105124701-22790623478956.testnet',keyFile:env.SERVER_KEY_FILE,dataDir:path.resolve(root,env.DATA_DIR||'data'),maxActive:Number(env.MAX_ACTIVE_MATCHES||10),players:(env.TESTNET_PLAYERS||'').split(',').map(x=>x.trim()).filter(Boolean)};
 for(const id of [c.escrow,c.token,c.server])if(!accountOnNetwork(id,network))throw Error('Account does not belong to selected network');
 if(env.ESCROW_API_VERSION&&env.ESCROW_API_VERSION!==(mainnet?'2':'1'))throw Error('Escrow API version does not match selected network');
 c.adapterVersion=mainnet?'escrow-v2':'escrow-v1';
 c.expectedFeeReceiver=env.FEE_RECEIVER_ID||null;
 if(c.expectedFeeReceiver&&!accountOnNetwork(c.expectedFeeReceiver,network))throw Error('Fee receiver network mismatch');
 c.runtimePublicKey=env.SERVER_RUNTIME_PUBLIC_KEY||null;
 if(c.runtimePublicKey&&!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c.runtimePublicKey))throw Error('Invalid runtime public key');
 c.paymentsEnabled=!mainnet;
 c.scope=JSON.stringify(mainnet?[network,c.escrow,c.token,c.adapterVersion]:[network,c.escrow,c.token]);
 c.gasReserve='10000000000000000000000'; // 0.01 NEAR policy reserve, not a gas quote.
 if(mainnet){
  if(c.token!==CIRCLE_USDC)throw Error('Only native Circle USDC is allowed; USDC.e is rejected');
  if(origin.protocol!=='https:')throw Error('Mainnet requires HTTPS');
  if(!path.isAbsolute(env.DATA_DIR))throw Error('Mainnet DATA_DIR must be an explicit separate absolute directory');
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(env.ESCROW_CODE_HASH))throw Error('Invalid ESCROW_CODE_HASH');
  c.escrowCodeHash=env.ESCROW_CODE_HASH;
 }
 const rpcUrl=new URL(c.rpc);if(rpcUrl.protocol!=='https:')throw Error('RPC requires HTTPS');
 if((mainnet&&rpcUrl.hostname.includes('testnet'))||(!mainnet&&rpcUrl.hostname.includes('mainnet')))throw Error('RPC URL network mismatch');
 if(!Number.isInteger(c.maxActive)||c.maxActive<1||c.maxActive>100)throw Error('MAX_ACTIVE_MATCHES must be 1–100');
 return c;
}

export const CIRCLE_USDC='17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
export function accountOnNetwork(id,network){
 if(typeof id!=='string'||id.length<2||id.length>64||!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id))return false;
 if(/^[a-f0-9]{64}$/.test(id))return true;
 return network==='testnet'?id.endsWith('.testnet'):network==='mainnet'&&(id==='near'||id.endsWith('.near'));
}
export function bindStore(cfg,store){
 const prior=store.get('deployment','scope');
 if(prior&&prior.scope!==cfg.scope)throw Error('DATA_DIR belongs to a different network or deployment');
 if(!prior&&cfg.network==='mainnet'&&['match','session','outbox','challenge'].some(k=>store.all(k).length))throw Error('Mainnet requires an empty or correctly scoped DATA_DIR');
 store.put('deployment','scope',{scope:cfg.scope});
}
export function requirePayments(cfg){if(cfg.network==='mainnet')throw Error('Mainnet payments disabled: independent verification, audit and competition approval are required');}
