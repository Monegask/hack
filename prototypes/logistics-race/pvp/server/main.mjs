import {config} from './config.mjs';
import {Store} from './store.mjs';
import {Chain} from './chain.mjs';
import {GameService} from './service.mjs';
import {createApp} from './http.mjs';
import {setTimeout as delay} from 'node:timers/promises';
const cfg=config();let store;
for(let attempt=0;attempt<6;attempt++){
 try{store=new Store(cfg.dataDir);break;}catch(e){if(attempt===5||!e.message.includes('Another PvP process'))throw e;await delay(3000);}
}
const chain=new Chain(cfg,store);
try{chain.info=await chain.preflight();}catch(e){console.error('Startup preflight failed:',e.message);store.close();process.exit(1);}
const game=new GameService(cfg,store,chain);await game.prepareRecoveredWorlds();const server=createApp(cfg,store,chain,game);
let syncing=false;const tick=setInterval(()=>{try{store.assertLease();game.advance();}catch{console.error('Simulation failed; stopping safely');shutdown(1);}},100);
const checkpoint=setInterval(()=>{try{game.checkpoint();}catch{console.error('Checkpoint failed; stopping safely');shutdown(1);}},1000);
const sync=setInterval(async()=>{if(syncing)return;syncing=true;try{await game.sync();}catch{console.error('Chain worker retry pending');}finally{syncing=false;}},2000);
server.listen(cfg.port,cfg.host,()=>console.log('Supply Line TESTNET PvP: '+cfg.origin+'/pvp/'));
let stopping=false;function shutdown(code=0){if(stopping)return;stopping=true;clearInterval(tick);clearInterval(checkpoint);clearInterval(sync);try{game.checkpoint();}catch{code=1;}server.close(()=>{store.close();process.exit(code);});setTimeout(()=>process.exit(code),10000).unref();}
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
