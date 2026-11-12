import fs from 'node:fs';
import {bootstrapSigner} from './bootstrap-signer.mjs';
const file='/data/secrets/server-runtime.json';
// Railway mounts fresh volumes as root. Drop privileges before listening.
if(process.getuid?.()===0){
 for(const dir of ['/data/game','/data/secrets']){fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chownSync(dir,1000,1000);}
 process.setgid(1000);process.setuid(1000);
}
process.env.SERVER_KEY_FILE=file;process.env.DATA_DIR='/data/game';
const start=()=>import('../server/main.mjs').catch(()=>{console.error('Testnet server startup failed');process.exit(1);});
if(fs.existsSync(file))await start();
else if(process.env.BOOTSTRAP_PUBLIC_KEY){
 bootstrapSigner({file,publicKey:process.env.BOOTSTRAP_PUBLIC_KEY,account:process.env.SERVER_ACCOUNT,port:Number(process.env.PORT||4190),onReady:start});
 console.log('Waiting for signed one-time runtime provisioning; gameplay is not ready.');
}else throw Error('Missing external Testnet runtime signer');
