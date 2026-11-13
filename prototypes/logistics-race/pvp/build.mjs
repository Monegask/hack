import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.dirname(fileURLToPath(import.meta.url)),game=path.resolve(root,'..'),out=path.join(root,'public');
fs.mkdirSync(out,{recursive:true});
await build({entryPoints:[path.join(root,'client/app.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:path.join(out,'app.js'),logLevel:'warning'});
for(const name of ['index.html','style.css'])fs.copyFileSync(path.join(root,'client',name),path.join(out,name));
let html=fs.readFileSync(path.join(game,'logistics-race-bot.html'),'utf8');
const script=s=>'<script>'+s.replaceAll('</script','<\\/script')+'</script>';
for(const file of ['bot.js','bot-race.js','tutorial-coach.js']){
 const source=fs.readFileSync(path.join(game,'dist',file),'utf8'),marker='<script>'+source+'</script>';
 if(!html.includes(marker))throw Error('Rebuild the offline game: missing '+file);html=html.replace(marker,'');
}
const oldWorld="const engines=create(root.document?.body?.dataset?.training==='true'?42:undefined);root.globalRaceWorldEngines=engines;root.Logistics=engines.player;";
const world="const engines=create(root.__supplyLinePvp.seed);if(root.__supplyLinePvp.side===1){const first=engines.player;engines.player=engines.rival;engines.rival=first;}root.globalRaceWorldEngines=engines;root.Logistics=engines.player;";
if(!html.includes(oldWorld))throw Error('World bootstrap changed; refusing an unseeded PvP build');html=html.replace(oldWorld,world);
const performBinding='refresh:()=>render(),perform,confirmRoad:';
if(!html.includes(performBinding))throw Error('Card action binding changed; review the PvP command adapter');
html=html.replace(performBinding,'refresh:()=>render(),perform:(...args)=>perform(...args),confirmRoad:');
html=html.replace('</head>',script('window.__supplyLinePvp=__PVP_CONFIG__;')+'</head>').replace('</body>',script(fs.readFileSync(path.join(root,'client/presentation.cjs'),'utf8'))+script(fs.readFileSync(path.join(root,'client/game-adapter.js'),'utf8'))+'</body>');
fs.writeFileSync(path.join(out,'game.html'),html.replace(/^[ \t]+$/gm,''));console.log('Built Testnet PvP client and authoritative-game view ('+Buffer.byteLength(html)+' bytes).');
