import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function config(env=process.env){
 const network=env.NEAR_NETWORK||'testnet';
 if(network!=='testnet')throw Error('This release only supports Testnet. Mainnet is disabled.');
 const origin=new URL(env.PUBLIC_ORIGIN||'http://localhost:4190');
 if(origin.origin!==origin.href.replace(/\/$/,''))throw Error('PUBLIC_ORIGIN must be an origin without a path');
 if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw Error('Public access requires HTTPS');
 const c={network,origin:origin.origin,host:env.HOST||'127.0.0.1',port:Number(env.PORT||4190),rpc:env.NEAR_RPC_URL||'https://rpc.testnet.near.org',escrow:env.ESCROW_ID||'dev-20261105124711-29870979355191.testnet',token:env.TOKEN_ID||'dev-20261105124714-71962479239708.testnet',server:env.SERVER_ACCOUNT||'dev-20261105124701-22790623478956.testnet',keyFile:env.SERVER_KEY_FILE,dataDir:path.resolve(root,env.DATA_DIR||'data'),maxActive:Number(env.MAX_ACTIVE_MATCHES||10),players:(env.TESTNET_PLAYERS||'').split(',').map(x=>x.trim()).filter(Boolean)};
 for(const id of [c.escrow,c.token,c.server])if(!/^[a-z0-9._-]+\.testnet$/.test(id))throw Error('All role and token accounts must be Testnet accounts');
 if(!Number.isInteger(c.maxActive)||c.maxActive<1||c.maxActive>100)throw Error('MAX_ACTIVE_MATCHES must be 1–100');
 return c;
}
