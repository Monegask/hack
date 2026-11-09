const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js');
const cell=p=>p.join(',');
function fresh(){const s=E.create();s.paused=false;s.enabled.oil=false;s.enabled.refinery=false;s.enabled.metal=false;s.enabled.asphalt=false;return s;}
function advance(s,seconds){for(let n=0;n<seconds*10;n++)E.tick(s,.1);}
function pavedDetour(s){s.roads=E.path(s,E.positions.city,E.positions.iron).map(cell);}
test('A connected asphalt detour takes priority over a faster cross-country shortcut',()=>{
 const s=fresh(),a=[12,0],b=[14,0],dirt=E.path(s,a,b);
 s.roads=[[12,0],[12,1],[12,2],[13,3],[14,2],[14,1],[14,0]].map(cell);const paved=E.path(s,a,b);
 const distance=points=>points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
 assert(distance(paved)*2>distance(dirt)*4,'fixture must expose a tempting dirt shortcut');
 assert(paved.every(p=>E.onRoad(s,p)));assert.deepEqual(paved[0],a);assert.deepEqual(paved.at(-1),b);
 for(let i=1;i<paved.length;i++)assert(E.canStep(paved[i-1],paved[i]));
});
test('An unfinished/disconnected road retains a legal mixed route and four-unit capacity',()=>{
 const s=fresh();pavedDetour(s);s.roads=s.roads.filter(p=>p!=='1,7');
 const r=E.routeInfo(s,'iron');assert.equal(r.capacity,4);assert.deepEqual(r.points.at(-1),E.positions.iron);
 for(let i=1;i<r.points.length;i++)assert(E.canStep(r.points[i-1],r.points[i]));
});
test('Paid paved mission survives save reload and returns over its reserved route',()=>{
 let s=fresh();pavedDetour(s);assert(E.start(s,1,'materials','iron'));const route=structuredClone(s.trucks[0].job.route),paidFuel=s.fuel;
 advance(s,1);s=E.upgrade(JSON.parse(JSON.stringify(s)));assert.equal(s.fuel,paidFuel);
 // A new shortcut must not teleport an already paid journey or create extra trips.
 s.roads.push('2,7');const t=s.trucks[0];
 for(let n=0;n<1000&&t.leg?.kind!=='back';n++)E.tick(s,.1);
 assert.deepEqual(t.position,E.positions.iron);assert.deepEqual(t.leg.points,[...route].reverse());
 assert.deepEqual(s.sites.iron.received,{iron:5,copper:1});assert.equal(s.stats.trips,1);
 advance(s,90);assert.equal(t.job,null);assert.deepEqual(t.position,E.positions.city);assert.equal(s.stats.trips,1);
});
test('All enterprise and hub routes terminate exactly once at their logical loading point',()=>{
 const s=fresh();for(const id of Object.keys(E.positions)){
  const r=E.routeInfo(s,id),cells=r.points.map(cell);assert.equal(cells[0],cell(E.positions.city));assert.equal(cells.at(-1),cell(E.positions[id]));
  assert.equal(new Set(cells).size,cells.length,'no route loops for '+id);
  for(let i=1;i<r.points.length;i++)assert(E.canStep(r.points[i-1],r.points[i]));
 }
});
test('Diagonal asphalt edges obey the same mountain-corner restriction as construction',()=>{
 const s=fresh();s.roads=['8,5','9,6'];assert(!E.canStep([8,5],[9,6]));
 const r=E.path(s,[8,5],[9,6]);for(let i=1;i<r.length;i++)assert(E.canStep(r[i-1],r[i]));
 assert(r.length>2);
});
