const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),E=require('../dist/engine.js'),Scene=require('../dist/map-scene.js');
function renderer(){
 const context=vm.createContext({Logistics:E,MapScene:Scene,document:{body:{dataset:{}},getElementById:()=>({})},localStorage:{getItem:()=>null}});
 const app=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
 vm.runInContext(app.slice(0,app.indexOf('function drawMap()')),context);
 vm.runInContext("const mapModels=Scene.models,cityModels=Scene.cityModels;function mapSite(id){return Scene.site(state,id,selected)}",context);
 return script=>vm.runInContext(script,context);
}
test('Unbuilt and unfinished sites show a construction plot; completed sites show their model',()=>{
 const run=renderer();
 for(const id of ['iron','copper','gravel','asphalt','oil2']){
  assert(!run(`mapSite('${id}',E.positions.${id})`).includes('<image'));
  run(`state.sites.${id}.construction={left:1}`);
  assert(!run(`mapSite('${id}',E.positions.${id})`).includes('<image'));
  run(`state.sites.${id}.active=true`);
  const rendered=run(`mapSite('${id}',E.positions.${id})`);
  assert(id==='oil2'?rendered.includes('data-pump="oil2"'):rendered.includes('<image'));assert(rendered.includes('data-built="true"'));
 }
 assert(run("mapSite('iron',E.positions.iron)").includes('assets/map-ore-mine.png'));
 assert(run("mapSite('copper',E.positions.copper)").includes('assets/map-ore-mine.png'));
});
test('Map includes existing city factories and starting pumpjack; models survive a paused reload',()=>{
 const run=renderer();
 const initial=run('terrain()');
 for(const asset of ['refinery','metalworks','assembly'])assert(initial.includes('assets/map-'+asset+'.png'));
 assert(initial.includes('data-pump="oil"'));
 run("state.sites.gravel.active=true;state=E.upgrade(JSON.parse(JSON.stringify(state)));state.paused=true");
 assert(run('terrain()').includes('assets/map-gravel-quarry.png'));
 const sources=[...run("Object.values(mapModels).map(m=>m.src).filter(Boolean).concat(cityModels.map(m=>m[1]))")];
 for(const src of sources)assert(fs.existsSync(path.join(__dirname,'../dist',src)));
});
test('Offline game embeds every map model and leaves no external asset paths',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../logistics-race-offline.html'),'utf8');
 assert(!html.includes('assets/'));
 assert(html.includes('data:image/png;base64,'));
});
