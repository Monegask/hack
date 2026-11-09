const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Base=require('../dist/engine.js'),World=require('../dist/race-world.js');
const source=fs.readFileSync(path.join(__dirname,'../dist/race-world.js'),'utf8');
function browser(training){const math=Object.create(Math);math.random=()=>.25;const ctx=vm.createContext({Logistics:Base,Math:math,Date:{now:()=>123456},document:{body:{dataset:training?{training:'true',practice:'true'}:{race:'true',practice:'true'}}}});vm.runInContext(source,ctx);return ctx;}
const plain=value=>JSON.parse(JSON.stringify(value));
test('Tutorial bootstraps the current race world with exactly the canonical ridge, peaks, gates and coordinates',()=>{
 const ctx=browser(true),actual=ctx.globalRaceWorldEngines,expected=World.create(42);assert.equal(ctx.Logistics,actual.player);assert.equal(actual.layout.seed,42);
 for(const field of ['width','height','mountains','mountainPeaks','positions','worldBounds'])assert.deepEqual(plain(actual.player[field]),plain(expected.player[field]),field);
 assert(actual.player.width>Base.width);assert(actual.player.mountainPeaks.length>0,'The old solo world must never select its fallback mountain material');
 assert.equal(actual.player.routeInfo(actual.player.create(),'center').seconds,expected.player.routeInfo(expected.player.create(),'center').seconds);
});
test('The fixed teaching draw leaves normal race seeding and the standalone solo engine intact',()=>{
 const a=browser(true),b=browser(true),race=browser(false);assert.deepEqual(plain(a.globalRaceWorldEngines.layout),plain(b.globalRaceWorldEngines.layout));assert.notEqual(race.globalRaceWorldEngines.layout.seed,42);assert.equal(Base.width,16);assert.equal(Base.mountains.length,9);assert.equal(Base.mountainPeaks,undefined);
});
test('Both tutorial artifacts initialize race-world immediately after the base engine, while practice remains solo',()=>{
 const root=path.join(__dirname,'..'),web=fs.readFileSync(path.join(root,'dist/game-3d-tutorial.html'),'utf8'),offline=fs.readFileSync(path.join(root,'logistics-race-tutorial.html'),'utf8'),practice=fs.readFileSync(path.join(root,'dist/game-3d-practice.html'),'utf8');
 const scripts=[...web.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]);assert.deepEqual(scripts.slice(0,3),['engine.js','race-world.js','map-scene.js']);assert(web.includes('data-training="true"'));assert(web.includes('data-practice="true"'));assert(!practice.includes('src="race-world.js"'));
 const inline=[...offline.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert(inline[0].includes('function createForWorld'));assert(inline[1].includes('root.globalRaceWorldEngines=engines'));assert.equal(inline.filter(s=>s.includes('root.globalRaceWorldEngines=engines')).length,1);assert(!/<script[^>]+src=/.test(offline));
});
