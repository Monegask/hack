import {config} from './config.mjs';
import {Store} from './store.mjs';
import {Chain} from './chain.mjs';
const cfg=config(),store=new Store(cfg.dataDir);
try{const c=new Chain(cfg,store);console.log(JSON.stringify(await c.preflight(),null,2));}catch(e){console.error('Preflight failed:',e.message);process.exitCode=1;}finally{store.close();}
