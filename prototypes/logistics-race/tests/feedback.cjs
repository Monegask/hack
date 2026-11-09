const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js');
function run(s,n){for(let i=0;i<n*10;i++)E.tick(s,.1);}
test('Diagonal road affects time, capacity and fuel; cannot cut a blocked corner',()=>{
 const s=E.create();s.paused=false;s.city.asphalt=4;
 assert(E.buildRoad(s,[2,7]));assert(E.buildRoad(s,[1,7]));
 const r=E.routeInfo(s,'iron');assert.equal(r.capacity,8);
 assert(Math.abs(r.seconds-2*(1+Math.SQRT2))<1e-8);
 assert(Math.abs(r.fuel-(1+Math.SQRT2)*1.1/6)<1e-8);
 assert(!E.canStep([4,4],[5,3]));assert(!E.buildRoad(s,[5,4]));
 assert(E.start(s,1,'materials','iron'));run(s,5);assert.equal(s.sites.iron.received.iron,5);
});
test('Pause status completes the paid cycle then shows stopped, resume starts production',()=>{
 const s=E.create();s.paused=false;s.sites.iron.active=true;run(s,.1);
 s.sites.iron.enabled=false;assert.equal(E.siteStatus(s,'iron'),'ЗАВЕРШАЕТ ЦИКЛ');run(s,6);
 assert.equal(E.siteStatus(s,'iron'),'ПРИОСТАНОВЛЕНО');assert.equal(s.sites.iron.stock,1);
 s.sites.iron.enabled=true;run(s,.1);assert.equal(E.siteStatus(s,'iron'),'РАБОТАЕТ');
 s.enabled.oil=false;run(s,11);assert.equal(E.siteStatus(s,'oil'),'ПРИОСТАНОВЛЕНО');
});
test('Existing saves gain the new deposit without resetting inventory or journeys',()=>{
 const s=E.create();s.paused=false;E.start(s,1,'materials','iron');run(s,2);
 delete s.sites.oil2;delete s.oilPipe;const before=JSON.stringify(s.trucks),fuel=s.fuel;
 E.upgrade(s);assert(s.sites.oil2);assert.equal(s.fuel,fuel);assert.equal(JSON.stringify(s.trucks),before);
 const restored=E.upgrade(JSON.parse(JSON.stringify(s)));assert.equal(restored.oilPipe,null);
});
