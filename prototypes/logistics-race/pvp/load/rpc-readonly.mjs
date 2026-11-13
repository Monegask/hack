// Explicit public Testnet reads only. No env file, signer, writes, or account key access.
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import {callRpc} from '../server/rpc.mjs';
const url=process.argv[2]||'https://rpc.testnet.near.org',results=[];
if(!['https://rpc.testnet.near.org','https://test.rpc.fastnear.com'].includes(url))throw Error('Only explicit public Testnet endpoints are allowed');
for(let i=0;i<12;i++){
 const method=i%2?'block':'status',t=performance.now();
 try{await callRpc(url,method,method==='block'?{finality:'final'}:[]);results.push({method,ms:performance.now()-t,ok:true});}
 catch(e){results.push({method,ms:performance.now()-t,ok:false,error:e.rpc||e.message});}
}
fs.mkdirSync(new URL('./results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL(url.includes('fastnear')?'./results/rpc-readonly-fastnear.json':'./results/rpc-readonly.json',import.meta.url),JSON.stringify({url,date:new Date().toISOString(),concurrency:1,results},null,2));console.log(JSON.stringify(results));
