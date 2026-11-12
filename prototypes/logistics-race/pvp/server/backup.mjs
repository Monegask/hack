import {DatabaseSync,backup} from 'node:sqlite';
import path from 'node:path';
import {config} from './config.mjs';
const destination=process.argv[2];if(!destination||!path.isAbsolute(destination))throw Error('Pass an absolute path outside the live data directory for the backup');
const cfg=config(),db=new DatabaseSync(path.join(cfg.dataDir,'pvp.sqlite'));
try{await backup(db,destination);console.log('SQLite online backup completed. Store this file outside the game server.');}finally{db.close();}
