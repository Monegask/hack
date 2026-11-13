import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..'),out=path.join(here,'../.baseline-server'),ref=process.argv[2]||'0e13688';
const read=file=>execFileSync('git',['show',ref+':prototypes/logistics-race/'+file],{cwd:repo,encoding:'utf8',maxBuffer:5e6});
fs.mkdirSync(out,{recursive:true});
for(const file of ['service','store','game','http','config','chain','durable','rpc']){
 let source=read('pvp/server/'+file+'.mjs');if(file==='game')source=source.replace("require('../../dist/race-world.js')","require('./race-world.cjs')");fs.writeFileSync(path.join(out,file+'.mjs'),source);
}
fs.writeFileSync(path.join(out,'engine.cjs'),read('dist/engine.js'));
fs.writeFileSync(path.join(out,'race-world.cjs'),read('dist/race-world.js').replace("require('./engine.js')","require('./engine.cjs')"));
console.log('Exported isolated baseline '+ref+' into '+out);
