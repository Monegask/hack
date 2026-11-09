const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const World=require('../dist/race-world.js'),Base=require('../dist/engine.js');
const resources=['iron','copper','gravel','oil2'],key=p=>p.join(',');
const distance=route=>route.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-route[i][0],p[1]-route[i][1]),0);

test('Seed reproduces a complete match; both fixed bases and the solo engine survive new layouts',()=>{
 const solo=JSON.stringify(Base.create()),a=World.create(42),b=World.create(42);
 assert.deepEqual(a.layout,b.layout);assert.deepEqual(a.player.create(),b.player.create());
 assert.equal(a.layout.seed,42);assert.equal(World.create(0).layout.seed,0);
 assert.deepEqual(a.player.positions.oil,[1,8]);assert.deepEqual(a.player.positions.asphalt,[2,8]);
 assert.equal(JSON.stringify(Base.create()),solo);assert.equal(Base.width,16);assert.equal(Base.mountains.length,9);
});

test('48 map seeds keep every resource reachable, spaced, behind its ridge and equal in actual time/fuel',()=>{
 const layouts=new Set(),observations=[],ranges=Object.fromEntries([...resources,'center'].map(id=>[id,{min:Infinity,max:0}]));
 for(let seed=0;seed<48;seed++){
  const {player:p,rival:r,layout}=World.create(seed),ps=p.create(),rs=r.create(),sample={};
  layouts.add(JSON.stringify(p.positions));assert.equal(p.travelNodes.length,15);assert.equal(p.mountains.length,76);
  for(const e of [p,r])for(const id of resources){const pos=e.positions[id];assert(e===p?pos[0]<11:pos[0]>23);assert(!e.mountains.some(q=>key(q)===key(pos)));}
  for(let i=0;i<p.travelFootprints.length;i++)for(const b of p.travelFootprints.slice(i+1)){
   const a=p.travelFootprints[i];assert(a.max.x+.8<=b.min.x||b.max.x+.8<=a.min.x||a.max.z+.8<=b.min.z||b.max.z+.8<=a.min.z,seed+': overlapping yards '+a.id+'/'+b.id);
  }
  for(const id of Object.keys(p.positions)){
   const a=p.routeInfo(ps,id),b=r.routeInfo(rs,id);assert(a.points&&b.points,seed+': unreachable '+id);
   assert(Math.abs(a.seconds-b.seconds)<1e-8,seed+': unequal time '+id);assert(Math.abs(a.fuel-b.fuel)<1e-8,seed+': unequal fuel '+id);assert.equal(a.capacity,b.capacity);
   if(id!=='center')assert.deepEqual(r.positions[id],[34-p.positions[id][0],10-p.positions[id][1]]);
   for(const e of [p,r]){const route=e===p?a.points:b.points;for(let i=1;i<route.length;i++)assert(e.canTravelStep(route[i-1],route[i],e.positions.city,e.positions[id]),seed+': illegal route '+id);}
   if(ranges[id]){ranges[id].min=Math.min(ranges[id].min,a.seconds);ranges[id].max=Math.max(ranges[id].max,a.seconds);sample[id]=a.seconds;}
  }
  // Starting an ordinary legal shipment exercises route fuel accounting too.
  ps.paused=false;const fuel=ps.fuel,expected=p.routeInfo(ps,'iron').fuel;assert(p.start(ps,1,'materials','iron'));assert(Math.abs(ps.fuel-(fuel-expected))<1e-8);
  observations.push(sample);
 }
 assert(layouts.size>=35,'The seed must change actual gameplay positions');
 for(const id of resources)assert(ranges[id].max>ranges[id].min+8,'No useful variation for '+id);
 assert(observations.some(a=>observations.some(b=>a.iron<b.iron&&a.oil2>b.oil2)),'Some layouts must exchange shorter iron access for longer oil access');
 assert(ranges.iron.max<44,'The first mine must not require an extreme opening detour');
 console.log('48 seeds:',layouts.size,'distinct layouts; one-way dirt seconds:',JSON.stringify(ranges));
});

test('Bowed ridges force the right-hand passage and neither road nor pipe can cut through',()=>{
 const {player:p,rival:r}=World.create(42);
 for(const e of [p,r]){
  const s=e.create(),route=e.routeInfo(s,'center').points,a=e.positions.city,b=e.positions.center,dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]),direct=Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);
  assert(distance(route)>direct*1.2,'Ridge must materially change the trip');
  const shoulderX=e===p?9:25;
  for(const z of e===p?[9,10]:[0,1])assert(e.path(s,e.positions.city,[shoulderX,z]),'Missing own-right passage '+z);
  assert(route.some(q=>e===p?q[1]>=9:q[1]<=1),'The route must go around its own right shoulder');
  const leftHeights=e.mountains.filter(q=>e===p?q[0]<17:q[0]>17).map(q=>q[0]);
  assert(new Set(leftHeights).size>=6,'Ridge must bow along the field rather than form a straight wall');
  s.paused=false;s.city.asphalt=100;s.city.iron=100;const before=JSON.stringify(s);
  for(const q of e.mountains){assert.equal(e.buildRoad(s,q),false);assert.equal(e.buildPipeCell(s,q),false);assert.equal(e.canStep([q[0]-1,q[1]],q),false);}
  assert.equal(JSON.stringify(s),before,'Rejected cells cannot consume resources or alter the match');
 }
});

test('Browser initialization draws a seed once before both match states and never rerolls under live trucks',()=>{
 const files=['engine.js','race-world.js'],source=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
 const c=vm.createContext({console,Date,Math});for(const file of files)vm.runInContext(source(file),c);
 const first=vm.runInContext('JSON.stringify(globalRaceWorldEngines.layout)',c);
 vm.runInContext('Logistics.create();globalRaceWorldEngines.rival.create();Logistics.create()',c);
 assert.equal(vm.runInContext('JSON.stringify(globalRaceWorldEngines.layout)',c),first,'State creation must never reroll the map under live trucks');
 assert(!/localStorage|sessionStorage/.test(source('race-world.js')+source('bot-race.js')));
});
