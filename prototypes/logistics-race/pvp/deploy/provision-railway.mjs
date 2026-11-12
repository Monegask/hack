import fs from 'node:fs';
import {KeyPair} from 'near-api-js';
const key=JSON.parse(fs.readFileSync(process.env.SERVER_KEY_FILE,'utf8'));
const pair=KeyPair.fromString(key.private_key||key.secret_key);
if(key.account_id!=='dev-20261105124701-22790623478956.testnet')throw Error('Unexpected runtime account');
if(process.argv.includes('--public-key')){
 const spki=Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(pair.getPublicKey().data)]);
 console.log(spki.toString('base64'));
}else{
 const url=new URL(process.argv[2]);
 if(url.origin!=='https://pvp-testnet-testnet.up.railway.app')throw Error('Unexpected destination');
 const bytes=Buffer.from(JSON.stringify(key));
 const response=await fetch(new URL('/provision-runtime-key',url),{method:'POST',headers:{'content-type':'application/json','x-provision-signature':Buffer.from(pair.sign(bytes).signature).toString('base64')},body:bytes,redirect:'error',signal:AbortSignal.timeout(20000)});
 if(response.status!==201)throw Error('Runtime provisioning rejected: HTTP '+response.status);
 console.log('Runtime signer provisioned over HTTPS; credential was not printed.');
}
