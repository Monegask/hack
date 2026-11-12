const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {assemble}=require('../interface-prototype/build.cjs');
const root=path.resolve(__dirname,'../../..'),game=fs.readFileSync(path.join(root,'exports/logistics-game.html'),'utf8');
if(!game.includes('window.__supplyLineMode'))throw Error('Rebuild the playable game with the embedded-mode bridge first.');
const pvpUrl=process.env.SUPPLY_LINE_PVP_URL||null;
const html=assemble({gameHtml:game,pvpUrl});
for(const name of ['supply-line.html','logistics-game-en.html'])fs.writeFileSync(path.join(root,'exports',name),html);
console.log(JSON.stringify({file:path.join(root,'exports/supply-line.html'),bytes:Buffer.byteLength(html),sha256:crypto.createHash('sha256').update(html).digest('hex'),playable:['tutorial','bot'],online:pvpUrl?'NEAR Testnet PvP':'demonstration only'}));
