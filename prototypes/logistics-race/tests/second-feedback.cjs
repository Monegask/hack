const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js');
function run(s,n){for(let i=0;i<n*10;i++)E.tick(s,.1);}
test('Dirt routes use diagonals with physical distance costs and still carry only four',()=>{
 const s=E.create(),r=E.routeInfo(s,'iron');assert.equal(r.points.length,3);assert.equal(r.capacity,4);
 assert(Math.abs(r.seconds-4*(1+Math.SQRT2))<1e-8);
 assert(Math.abs(r.fuel-2*(1+Math.SQRT2)*1.1/12)<1e-8);
 for(const id of Object.keys(E.positions)){const route=E.routeInfo(s,id);for(let i=1;i<route.points.length;i++)assert(E.canStep(route.points[i-1],route.points[i]));}
});
test('Builders may leave after all cargo is dispatched, wait for actual arrival, then return',()=>{
 const s=E.create();s.paused=false;assert(E.buyTruck(s));run(s,13);
 assert(E.start(s,1,'materials','iron'));
 assert(!E.start(s,3,'crew','iron')); // only four of six units in transit
 assert(E.start(s,2,'materials','iron'));
 s.city.asphalt=4;assert(E.buildRoad(s,[2,7]));assert(E.buildRoad(s,[1,7]));
 assert(E.start(s,3,'crew','iron'));run(s,6);
 assert.equal(s.trucks[2].status,'Ожидает материалы');assert(!s.sites.iron.active);
 assert.equal(s.sites.iron.construction.left,2);
 const restored=E.upgrade(JSON.parse(JSON.stringify(s)));run(restored,5);
 assert(!restored.sites.iron.active);run(restored,2);assert(restored.sites.iron.active);
 run(restored,6);assert.equal(restored.builder,null);assert.equal(restored.trucks[2].job,null);
});
test('Refining consumes the new per-batch costs and no idle fuel',()=>{
 const s=E.create();s.paused=false;s.enabled.oil=false;
 run(s,5);assert.equal(s.fuel,12);
 s.city.oil=2;s.city.ironOre=2;s.city.gravel=2;s.sites.asphalt.active=true;
 run(s,.1);assert(Math.abs(s.fuel-(12-.11-.11-2/15*1.1))<1e-8);
 run(s,5);assert.equal(s.city.asphalt,2);assert.equal(s.city.iron,16);
 const fuel=s.fuel;run(s,20);assert.equal(s.fuel,fuel);
});
