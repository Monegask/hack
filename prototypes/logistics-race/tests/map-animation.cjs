const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js'),Scene=require('../dist/map-scene.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);
test('Articulated pump follows paid work, freezes on pause/idle, and runs in game time',()=>{
 const s=E.create(),clock={};s.paused=false;s.enabled.refinery=false;s.enabled.oil=false;
 Scene.updateClocks(s,clock);E.tick(s,1);Scene.updateClocks(s,clock);near(clock.oil,0);
 s.enabled.oil=true;E.tick(s,.1);Scene.updateClocks(s,clock);const first=clock.oil;
 E.tick(s,1);Scene.updateClocks(s,clock);near(clock.oil-first,2.3);
 const moving=Scene.pumpPose(clock.oil);assert(moving.angle!==0);assert(moving.rod[1]!==-57);
 s.paused=true;const frozen=clock.oil;E.tick(s,5);Scene.updateClocks(s,clock,3);near(clock.oil,frozen);
 s.paused=false;s.enabled.oil=false; // An already paid cycle must still animate.
 E.tick(s,.1);Scene.updateClocks(s,clock);assert(clock.oil>frozen);
 E.tick(s,10);Scene.updateClocks(s,clock);const stopped=clock.oil;E.tick(s,1);Scene.updateClocks(s,clock);near(clock.oil,stopped);
});
test('Truck is tangent to each actual route edge, returns facing the opposite direction and stays in its lane',()=>{
 const s=E.create();s.paused=false;
 for(const [a,b] of [[[2,8],[3,8]],[[3,8],[2,8]],[[3,8],[3,7]],[[3,7],[3,8]],[[3,8],[4,7]],[[4,7],[3,8]],[[3,7],[4,8]],[[4,8],[3,7]]]){
  const t={id:1,job:{},leg:{points:[a,b],costs:[4],elapsed:2},position:a};
  const pose=Scene.truckPose(s,t),pa=Scene.xy(a),pb=Scene.xy(b),v=[pb[0]-pa[0],pb[1]-pa[1]],len=Math.hypot(...v),mid=pa.map((x,i)=>(x+pb[i])/2);
  near(Math.cos(pose.angle),v[0]/len);near(Math.sin(pose.angle),v[1]/len);
  near(Math.hypot(pose.x-mid[0],pose.y-mid[1]),5.5);
  // Width incl. tyres is 11, road width 22: a tyre never exceeds the curb.
  assert(5.5+5.5<=22/2);
 }
});
test('Truck interpolation follows simulation pause, the turn, and the actual mission position',()=>{
 const s=E.create();s.paused=false;assert(E.start(s,1,'materials','iron'));E.tick(s,1);
 const t=s.trucks[0],pose=Scene.truckPose(s,t),smooth=Scene.truckPose(s,t,.05);
 assert(Math.hypot(pose.x-smooth.x,pose.y-smooth.y)>0);
 s.paused=true;assert.deepEqual(Scene.truckPose(s,t,10),Scene.truckPose(s,t,0));
 const turn={id:2,job:{},leg:{points:[[3,8],[4,8],[4,7]],costs:[4,4],elapsed:4.1}};
 s.paused=false;near(Scene.truckPose(s,turn).angle,-Math.PI/2);
 const stateBefore=JSON.stringify(s);Scene.terrain(s);Scene.truckPose(s,t);assert.equal(JSON.stringify(s),stateBefore);
});
test('Road artwork only covers paid connected edges; no prebuilt network is baked into the map',()=>{
 const s=E.create();assert(!Scene.terrain(s).includes('class="paved-road"'));
 s.paused=false;s.city.asphalt=4;assert(E.buildRoad(s,[4,8]));
 assert(Scene.terrain(s).includes('class="paved-road"'));
 assert(Scene.terrain(s,{roadMode:true}).includes('class="road-cell"'));
 assert(!Scene.terrain(s).includes('class="road-cell"'));
});
test('Animation demo is a separate scene with real trips and never reads or writes normal saves',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),app=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
 const context=vm.createContext({Logistics:E,MapScene:Scene,document:{body:{dataset:{demo:'true'}},getElementById:()=>({})},localStorage:{getItem:()=>{throw Error('Read user save');},setItem:()=>{throw Error('Write user save');}}});
 vm.runInContext(app.slice(0,app.indexOf('function drawMap()')),context);
 assert.equal(vm.runInContext('storageAvailable',context),true);vm.runInContext('save()',context);
 assert(vm.runInContext('state.trucks.every(t=>t.leg)&&state.roads.length>0&&state.paused',context));
 const normal=E.create();assert.equal(normal.roads.length,0);assert.equal(normal.fuel,12);assert.equal(normal.sites.gravel.active,false);
});
