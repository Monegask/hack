import {setTimeout as delay} from 'node:timers/promises';
let lastWarning=0;
// Only reads are retried here. Signed writes remain owned by the durable outbox.
export async function callRpc(url,method,params,{fetcher=fetch,wait=delay}={}){
 const read=['status','query','block','tx','EXPERIMENTAL_protocol_config'].includes(method);
 for(let attempt=0;;attempt++){
  let retryable=false;
  try{
   let response;
   try{response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'supply-line',method,params}),signal:AbortSignal.timeout(10000)});}
   catch{retryable=true;const error=Error('NEAR RPC connection unavailable');error.rpc={kind:'transport'};throw error;}
   if(!response.ok){retryable=response.status===429||response.status===408||response.status>=500;const error=Error('NEAR RPC unavailable');error.rpc={kind:'http',status:response.status};throw error;}
   let body;try{body=await response.json();}catch{retryable=true;const error=Error('Invalid NEAR RPC response');error.rpc={kind:'response'};throw error;}
   if(body.error){const error=Error('NEAR RPC rejected request');error.rpc={kind:'rpc',code:body.error.code};throw error;}
   if(!Object.hasOwn(body,'result')){const error=Error('Missing NEAR RPC result');error.rpc={kind:'response'};throw error;}
   return body.result;
  }catch(error){
   if(read&&retryable&&attempt===0){await wait(400);continue;}
   if(Date.now()-lastWarning>30000){lastWarning=Date.now();console.warn('NEAR RPC request failed:',method,JSON.stringify(error.rpc));}
   throw error;
  }
 }
}
