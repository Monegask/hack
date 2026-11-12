const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname;
const script=code=>'<script>\n'+code.replace(/<\/script/gi,'<\\/script')+'\n</script>';
function assemble({gameHtml=null,pvpUrl=null}={}){
if(pvpUrl&&pvpUrl!=='/pvp/')throw Error('Public PvP must use the configured /pvp/ route');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const href of ['../dist/card-ui.css','../game-3d/dark-theme.css','prototype.css']){
 let css=fs.readFileSync(path.join(root,href),'utf8');
 if(href==='prototype.css')css=css.replaceAll("url('assets/map.png')",`url('data:image/png;base64,${fs.readFileSync(path.join(root,'assets/map.png')).toString('base64')}')`);
 html=html.replace(`<link rel="stylesheet" href="${href}">`,`<style>\n${css}\n</style>`);
}
for(const file of ['menu-icons.js','prototype.js'])html=html.replace(`<script src="${file}"></script>`,()=>script(fs.readFileSync(path.join(root,file),'utf8')));
if(gameHtml){
 html=html.replace('<title>Supply Line · Interface prototype</title>','<title>Supply Line · Play</title>').replace('<body class="three-game prototype">','<body class="three-game prototype" data-game-available="true" data-release="en-menu-v2">');
 html=html.replace("connect-src 'none'","connect-src 'self' data: blob:; frame-src 'self' blob:; worker-src blob:").replace("img-src 'self' data:","img-src 'self' data: blob:");
 html=html.replace('<strong>INTERACTIVE DEMO</strong><span>Fictional accounts, balances & transactions. No real funds.</span><span class="version">UI review · v1</span>','<strong>ONLINE · DEMO</strong><span>Online wallets and payments are simulated. Tutorial and bot race are playable.</span><span class="version">Supply Line</span>');
 html=html.replace('UI prototype only · NEAR / USDC and fees are illustrative','Tutorial & bot race · Playable. Online · Demo only.');
 if(pvpUrl){
  html=html.replace('data-release="en-menu-v2"','data-release="testnet-pvp" data-testnet-pvp="true"');
  html=html.replace('<strong>ONLINE · DEMO</strong><span>Online wallets and payments are simulated. Tutorial and bot race are playable.</span>','<strong>NEAR TESTNET</strong><span>Online 1v1 with test tokens. No real money. Tutorial and bot race are playable.</span>');
  html=html.replace('Tutorial & bot race · Playable. Online · Demo only.','Online 1v1 · NEAR Testnet · Test tokens only.');
  html=html.replace('<button data-action="lab">Prototype controls <span aria-hidden="true">↗</span></button>','');
 }
 const data='<script type="application/json" id="playableGame">'+JSON.stringify(gameHtml).replaceAll('<','\\u003c')+'</script>';
 html=html.replace('</body>',()=>data+script(fs.readFileSync(path.join(root,'integration.js'),'utf8'))+'</body>');
}
return html;
}
function buildDemo(){const html=assemble(),out=path.resolve(root,'../../../exports/supply-line-interface-demo.html');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html);console.log(JSON.stringify({file:out,bytes:Buffer.byteLength(html),sha256:crypto.createHash('sha256').update(html).digest('hex')}));}
module.exports={assemble};if(require.main===module)buildDemo();
