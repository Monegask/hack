import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bootstrapSigner} from '../deploy/bootstrap-signer.mjs';
test('one-time provisioning rejects unsigned/wrong-account credentials, stores privately and removes listener',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvp-bootstrap-')),file=path.join(dir,'secrets','runtime.json');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');let ready=false;
 const server=bootstrapSigner({file,publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64'),account:'server.testnet',host:'127.0.0.1',port:0,onReady:()=>{ready=true;}});
 await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 const send=async(value,signed=true)=>{const bytes=Buffer.from(JSON.stringify(value));return fetch(url+'/provision-runtime-key',{method:'POST',headers:{'x-provision-signature':signed?sign(null,bytes,privateKey).toString('base64'):''},body:bytes});};
 try{
  assert.equal((await (await fetch(url+'/healthz')).json()).ok,false);
  assert.equal((await send({account_id:'server.testnet',private_key:'fixture'},false)).status,403);assert.equal(fs.existsSync(file),false);
  assert.equal((await send({account_id:'other.testnet',private_key:'fixture'})).status,400);assert.equal(fs.existsSync(file),false);
  assert.equal((await send({account_id:'server.testnet',private_key:'fixture'})).status,201);
  await new Promise(r=>setTimeout(r,30));assert.equal(ready,true);assert.equal(server.listening,false);
  assert.equal(JSON.parse(fs.readFileSync(file)).account_id,'server.testnet');
  if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
 }finally{server.closeAllConnections();server.close();fs.rmSync(dir,{recursive:true,force:true});}
});
