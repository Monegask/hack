import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {verify,createPublicKey} from 'node:crypto';

// Temporary first-boot listener. Only an Ed25519 signature from the pinned
// runtime signer can provision it. The listener closes before gameplay starts.
export function bootstrapSigner({file,publicKey,account,onReady,host='0.0.0.0',port=4190}){
 const key=createPublicKey({key:Buffer.from(publicKey,'base64'),format:'der',type:'spki'});
 if(key.asymmetricKeyType!=='ed25519'||!account.endsWith('.testnet'))throw Error('Invalid Testnet provisioning configuration');
 let busy=false;const expires=Date.now()+15*60*1000;
 const server=http.createServer(async(req,res)=>{
  const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(req.method==='GET'&&req.url==='/healthz')return reply(200,{ok:false,network:'testnet',provisioning:true});
  if(req.method!=='POST'||req.url!=='/provision-runtime-key')return reply(404,{error:'Not found'});
  if(busy||Date.now()>expires||fs.existsSync(file))return reply(409,{error:'Provisioning unavailable'});
  busy=true;
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>4096){reply(413,{error:'Payload too large'});return;}chunks.push(chunk);}
   const bytes=Buffer.concat(chunks),signature=Buffer.from(req.headers['x-provision-signature']||'','base64');
   if(!verify(null,bytes,key,signature))return reply(403,{error:'Invalid signature'});
   const credential=JSON.parse(bytes.toString());
   if(credential.account_id!==account||!(credential.private_key||credential.secret_key))return reply(400,{error:'Invalid credential'});
   fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
   fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
   reply(201,{ok:true});server.close(()=>onReady());server.closeIdleConnections();
  }catch{reply(400,{error:'Provisioning failed'});}finally{busy=false;}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 server.listen(port,host);return server;
}
