const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js');
function fresh(){const s=E.create();s.paused=false;return s;}
function advance(s,seconds){for(let i=0;i<seconds*10;i++)E.tick(s,.1);}
test('Materials arrive physically; construction crew travels separately and returns',()=>{
 const s=fresh();assert(E.start(s,1,'materials','iron'));assert(E.start(s,2,'materials','iron'));
 assert.equal(s.city.iron,9);assert.equal(s.city.copper,5);assert.deepEqual(s.sites.iron.received,{iron:0,copper:0});
 assert(!E.start(s,1,'crew','iron'));advance(s,13);assert.deepEqual(s.sites.iron.received,{iron:5,copper:1});
 advance(s,13);assert(E.start(s,1,'crew','iron'));advance(s,15);assert(s.sites.iron.active);assert.equal(s.builder,1);
 advance(s,13);assert.equal(s.builder,null);assert.equal(s.trucks[0].job,null);
});
test('Insufficient fuel does not spend construction materials',()=>{
 const s=fresh();s.fuel=0;const city=structuredClone(s.city);assert(!E.start(s,1,'materials','iron'));assert.deepEqual(s.city,city);
 assert(!E.buyTruck(s));assert.deepEqual(s.city,city);
});
test('Third truck costs resources once and appears after assembly',()=>{
 const s=fresh();assert(E.buyTruck(s));assert(!E.buyTruck(s));assert.equal(s.city.iron,11);assert.equal(s.city.copper,5);
 advance(s,11);assert.equal(s.trucks.length,2);advance(s,2);assert.equal(s.trucks.length,3);
});
test('Road is immediate, connected, cannot cross mountains and improves whole-route capacity',()=>{
 const s=fresh();s.city.asphalt=50;assert(!E.buildRoad(s,[11,4]));assert(!E.buildRoad(s,E.mountains[0]));
 const before=E.routeInfo(s,'center');assert.equal(before.capacity,4);const newCells=before.points.filter(p=>!E.onRoad(s,p)).length;assert(newCells>0);
 assert(E.roadToCenter(s));assert.equal(s.city.asphalt,50-newCells*2);assert.equal(E.routeInfo(s,'center').capacity,8);assert(Math.abs(E.routeInfo(s,'center').seconds-before.seconds/2)<1e-8);
 assert(!E.buildRoad(s,E.positions.center));assert.equal(s.city.asphalt,50-newCells*2);
});
test('Pause freezes travel and production; save reload preserves a paid journey',()=>{
 const s=fresh();E.start(s,1,'materials','iron');advance(s,3);s.paused=true;const copy=JSON.stringify(s);advance(s,20);assert.equal(JSON.stringify(s),copy);
 const restored=JSON.parse(copy);restored.paused=false;advance(restored,25);assert.equal(restored.trucks[0].job,null);assert.equal(restored.sites.iron.received.iron,4);
});
test('A route can return a partial load, freeing its truck and claim',()=>{
 const s=fresh();s.sites.iron.active=true;s.sites.iron.enabled=false;s.sites.iron.stock=2;
 assert(E.start(s,1,'haul','iron'));advance(s,13);assert.equal(s.trucks[0].status,'Waiting for cargo');
 E.stopTruck(s,1);advance(s,13);assert.equal(s.trucks[0].job,null);assert.equal(s.sites.iron.claimed,0);
 assert(s.city.ironOre>0||s.production.metal||s.city.iron>14);
});
test('Goal cannot be double-booked and is counted only on arrival',()=>{
 const s=fresh();s.city={...s.city,iron:12,copper:6,asphalt:8};s.fuel=100;
 for(let round=0;round<4&&!s.won;round++){
  for(const t of s.trucks)if(!t.job)E.start(s,t.id,'goal','center');
  if(round===0)assert.equal(s.delivered.iron,0);advance(s,E.routeInfo(s,'center').seconds*2+2);
 }
 assert(s.won);assert.deepEqual(s.delivered,s.goal);assert(!E.start(s,1,'goal','center'));
});
test('Cold start cannot produce free fuel',()=>{const s=fresh();s.fuel=0;advance(s,60);assert.equal(s.fuel,0);assert.equal(s.city.oil,0);});
