const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js');
function fresh(){const s=E.create();s.paused=false;s.enabled.oil=false;s.enabled.refinery=false;s.enabled.metal=false;s.enabled.asphalt=false;return s;}
const key=p=>p.join(',');
test('Copper missions avoid every unrelated enterprise, including the unbuilt asphalt plot',()=>{
 for(const active of [false,true]){const s=fresh();for(const site of Object.values(s.sites))site.active=active;
  const r=E.routeInfo(s,'copper'),foreign=new Set(Object.entries(E.positions).filter(([id])=>!['city','copper'].includes(id)).map(([,p])=>key(p)));
  assert(!r.points.some(p=>foreign.has(key(p))));assert(r.points.length<=8,'copper must use a local bypass rather than circle the entire mountain range');
  for(let n=1;n<r.points.length;n++)assert(E.canTravelStep(r.points[n-1],r.points[n],E.positions.city,E.positions.copper));
  assert(!E.canTravelStep([3,8],[4,7],E.positions.city,E.positions.copper),'no corner cut through the asphalt plot');
 }
});
test('Asphalt across an unrelated yard does not form a usable full-road shortcut',()=>{
 const s=fresh();s.roads=['4,8','5,8','6,8','7,8'];const r=E.routeInfo(s,'copper');
 assert.equal(r.capacity,4);assert(!r.points.some(p=>key(p)==='4,8'));
});
test('Mixed route accelerates its asphalt edge while retaining four-unit capacity',()=>{
 const s=fresh(),dirt=E.routeInfo(s,'iron');s.roads=['2,7'];const mixed=E.routeInfo(s,'iron');
 assert.equal(mixed.capacity,4);assert(mixed.seconds<dirt.seconds);assert(E.start(s,1,'materials','iron'));
 const leg=s.trucks[0].leg;assert(leg.costs.some((cost,i)=>Math.abs(cost-2*Math.hypot(leg.points[i+1][0]-leg.points[i][0],leg.points[i+1][1]-leg.points[i][1]))<1e-8));
 assert(leg.costs.some((cost,i)=>Math.abs(cost-4*Math.hypot(leg.points[i+1][0]-leg.points[i][0],leg.points[i+1][1]-leg.points[i][1]))<1e-8));
 assert.equal(Object.values(s.trucks[0].cargo).reduce((a,b)=>a+b,0),4);
});
test('Asphalt exhaustion reports the cause and cannot charge or add another cell',()=>{
 const s=fresh();s.city.asphalt=2;assert(E.buildRoad(s,[3,9]));assert.equal(s.city.asphalt,0);const roads=[...s.roads];
 assert(!E.buildRoad(s,[4,9]));assert.match(s.notice,/Недостаточно асфальта/);assert.equal(s.city.asphalt,0);assert.deepEqual(s.roads,roads);
});
test('Previously paid route through a plot reloads unchanged and completes without replanning',()=>{
 const s=fresh(),route=[[3,8],[4,8],[5,8],[6,8],[7,8]];s.sites.copper.enabled=false;
 // A genuine v21 paid leg: two copper units were already removed from the city.
 s.city.copper-=2;s.sites.copper.incoming.copper=2;
 Object.assign(s.trucks[0],{job:{type:'materials',target:'copper',route,capacity:4,reserved:0},cargo:{copper:2},at:null,position:[3.5,8],leg:{kind:'out',points:route,costs:[4,4,4,4],elapsed:2}});
 const restored=E.upgrade(JSON.parse(JSON.stringify(s))),paid=JSON.stringify(restored.trucks[0].leg);assert.equal(paid,JSON.stringify(s.trucks[0].leg));
 assert(!E.routeInfo(restored,'copper').points.some(p=>key(p)==='4,8'));
 for(let i=0;i<150;i++)E.tick(restored,.1);
 assert.equal(restored.sites.copper.received.copper,2);assert.deepEqual(restored.trucks[0].leg.points,[...route].reverse());
});

test('Center road approaches its external gate without passing through either hub yard',()=>{
 const s=fresh(),r=E.routeInfo(s,'center'),portal=E.travelPoint(E.positions.center),before=E.travelPoint(r.points.at(-2));
 assert(before.z<portal.z,'last road edge approaches the north-facing freight gate');
 for(let i=1;i<r.points.length;i++){const a=E.travelPoint(r.points[i-1]),b=E.travelPoint(r.points[i]);
  for(let n=0;n<=20;n++){const p={x:a.x+(b.x-a.x)*n/20,z:a.z+(b.z-a.z)*n/20};for(const rect of E.travelFootprints.filter(r=>['city','center'].includes(r.id)))assert(!(p.x>rect.min.x&&p.x<rect.max.x&&p.z>rect.min.z&&p.z<rect.max.z),'road must not cross a city block');}
 }
 s.roads=r.points.map(key);assert.equal(E.routeInfo(s,'center').capacity,8);
});
