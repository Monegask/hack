import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import E from '../../dist/engine.js';
import Scene from '../../dist/map-scene.js';
import {CELL,ROAD_WIDTH,LANE,TRUCK_SCALE,world,cell,visualCell,truckPose,roadEdges,advanceClocks,active,parkingSlot,hiddenByEnterprise,approachSpan} from '../src/state.mjs';
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('Numbered parking stays stable on reload and gives 24 trucks non-overlapping spaces',()=>{
 const s=E.create(),slots=Array.from({length:24},(_,i)=>parkingSlot(i+1));
 assert(slots[0].z-.54>world([3,8]).z+.78+.10,'parking pavement and vehicles clear the city pipeline');
 for(const [i,a] of slots.entries()){const t={id:i+1,position:[3,8],job:null},p=truckPose(s,t);near(p.x,a.x);near(p.z,a.z);assert.deepEqual(parkingSlot(t.id),parkingSlot(JSON.parse(JSON.stringify(t)).id));for(const b of slots.slice(i+1))assert(Math.abs(a.x-b.x)>=1.24||Math.abs(a.z-b.z)>=.56);}
});
test('Departures and returns meet their own stall and road continuously without altering paid route or pause',()=>{
 const s=E.create();s.paused=false;
 for(const id of [1,2,3,9])for(const kind of ['out','back']){const leg={kind,points:kind==='out'?[[3,8],[4,8],[5,8]]:[[5,8],[4,8],[3,8]],costs:[4,4],elapsed:kind==='out'?0:8},t={id,job:{},leg},before=JSON.stringify(t),slot=parkingSlot(id),p=truckPose(s,t);near(p.x,slot.x);near(p.z,slot.z);near(Math.atan2(Math.sin(p.yaw-slot.yaw),Math.cos(p.yaw-slot.yaw)),0);assert.equal(JSON.stringify(t),before);
  const join=kind==='out'?approachSpan(8):8-approachSpan(8);leg.elapsed=join-1e-6;const a=truckPose(s,t);leg.elapsed=join+1e-6;const b=truckPose(s,t);assert(Math.hypot(a.x-b.x,a.z-b.z)<1e-4);assert(Math.abs(a.yaw-b.yaw)<1e-4);
  s.paused=true;assert.deepEqual(truckPose(s,t,10),truckPose(s,t));s.paused=false;
 }
});
test('Vehicle body disappears before a building intersection, in both orientations, and reappears clear',()=>{
 const bounds=[{min:{x:0,z:0},max:{x:3,z:3}}];
 assert(hiddenByEnterprise({x:-.6,z:1,yaw:0},bounds));assert(!hiddenByEnterprise({x:-.63,z:1,yaw:0},bounds));assert(hiddenByEnterprise({x:1,z:-.6,yaw:Math.PI/2},bounds));assert(!hiddenByEnterprise({x:4,z:1,yaw:0},bounds));assert(!hiddenByEnterprise({x:1,z:1,yaw:0},[]));
});

test('Expanded 3D projection preserves saved engine gates and spaces hub models behind their access gates',()=>{
 for(const [id,p] of Object.entries(E.positions)){
  assert.deepEqual(cell(world(p).x,world(p).z),p);
  const v=visualCell(id,E,Scene.models),old=Scene.models[id]?.at||(id==='city'?[222,564]:[Scene.xy(p)[0],Scene.xy(p)[1]-(id==='center'?32:0)]);
  if(id!=='city'&&id!=='center'){near(v[0]*56+54,old[0]);near(v[1]*54+44,old[1]);}else {assert(v[1]>p[1]);assert(v[0]<p[0]);}
 }
});
test('3D truck heading and lane follow each real route edge in both directions without changing state',()=>{
 const s=E.create();s.paused=false;
 for(const [dx,dz] of E.directions){const a=[3,8],b=[3+dx,8+dz],t={id:1,job:{},position:a,leg:{points:[a,b],costs:[4],elapsed:2}};
  const before=JSON.stringify([s,t]),p=truckPose(s,t),angle=-Math.atan2(dz,dx),mid=world([(a[0]+b[0])/2,(a[1]+b[1])/2]);near(p.yaw,angle);near(Math.hypot(p.x-mid.x,p.z-mid.z),LANE);assert(LANE+.385*TRUCK_SCALE<ROAD_WIDTH/2,'outer tyre stays on surface');assert.equal(JSON.stringify([s,t]),before);
  s.paused=true;assert.deepEqual(truckPose(s,t,20),truckPose(s,t,0));s.paused=false;
 }
 const turn={id:1,job:{},leg:{points:[[3,8],[4,8],[4,7]],costs:[4,4],elapsed:4.1}};near(truckPose(s,turn).yaw,Math.PI/2);assert(CELL>0);
});
test('Only paid connected engine road edges are rendered, including legal diagonals',()=>{
 const s=E.create();assert.equal(roadEdges(s,E).length,0);s.paused=false;s.city.asphalt=6;
 assert(E.buildRoad(s,[4,8]));assert(E.buildRoad(s,[5,9]));const edges=roadEdges(s,E);assert(edges.some(([a,b])=>Math.hypot(a[0]-b[0],a[1]-b[1])>1));for(const [a,b] of edges)assert(E.canStep(a,b));
});
test('Animation clocks follow paid production, pause, idle and restart; models appear only after active',()=>{
 const s=E.create(),clock={};s.paused=false;s.enabled.oil=false;advanceClocks(s,clock);E.tick(s,1);advanceClocks(s,clock);near(clock.values.oil,0);
 s.enabled.oil=true;E.tick(s,.1);advanceClocks(s,clock);const before=clock.values.oil;E.tick(s,1);advanceClocks(s,clock);assert(clock.values.oil>before);
 s.paused=true;const paused=clock.values.oil;E.tick(s,5);advanceClocks(s,clock,10);near(clock.values.oil,paused);
 assert(!active(s,'gravel'));s.sites.gravel.construction={left:.1};assert(!active(s,'gravel'));s.sites.gravel.active=true;assert(active(s,'gravel'));assert(active(s,'city'));
 const fresh=E.create();advanceClocks(fresh,clock);near(clock.values.oil,0);
});
test('A full real-resource victory is observable through the 3D adapter without mutating simulation',()=>{
 const s=E.create();s.paused=false;const clock={},seen=new Set();
 const step=()=>{E.tick(s,.1);const before=JSON.stringify(s);advanceClocks(s,clock);for(const [id] of Object.entries(E.positions))if(active(s,id))seen.add(id);for(const t of s.trucks){const p=truckPose(s,t);assert([p.x,p.z,p.yaw].every(Number.isFinite));}assert.equal(JSON.stringify(s),before);};
 const wait=condition=>{for(let i=0;!condition()&&i<18000;i++)step();assert(condition(),'Timed out');},idle=()=>s.trucks.every(t=>!t.job);
 const build=id=>{while(!Object.entries(E.costs[id]).every(([k,n])=>s.sites[id].received[k]>=n)){for(const t of s.trucks)E.start(s,t.id,'materials',id);wait(idle);}assert(E.start(s,1,'crew',id));wait(idle);};
 const harvest=(id,amount)=>{const site=s.sites[id];for(const t of s.trucks)assert(E.start(s,t.id,'haul',id));const total=()=>site.stock+(s.city[id+'Ore']||0)+(s.city[id]||0)+s.trucks.reduce((n,t)=>n+(t.cargo[id+'Ore']||t.cargo[id]||0),0)+(id==='gravel'?s.city.asphalt+(s.production.asphalt?2:0):s.production.metal?.kind===id?2:0);wait(()=>total()>=amount);site.enabled=false;for(const t of s.trucks)E.stopTruck(s,t.id);wait(idle);};
 build('iron');harvest('iron',24);build('copper');harvest('copper',12);build('gravel');build('asphalt');harvest('gravel',8);wait(()=>s.city.asphalt>=8);while(!s.won){for(const t of s.trucks)if(!t.job)E.start(s,t.id,'goal','center');wait(()=>s.won||idle());}
 assert.deepEqual(s.delivered,s.goal);for(const id of ['iron','copper','gravel','asphalt'])assert(seen.has(id));assert(s.fuel>=0);
});
test('Full 3D offline artifact embeds model files and retains economic UI and isolated practice mode',()=>{
 const html=fs.readFileSync(new URL('../../logistics-race-game-3d.html',import.meta.url),'utf8'),practice=fs.readFileSync(new URL('../../dist/game-3d-practice.html',import.meta.url),'utf8');
 assert(html.includes('data:model/gltf-binary;base64,'));assert(!html.includes('<script src='));assert(!html.includes('href="style.css"'));assert(html.includes('data-action="materials"'));assert(practice.includes('data-practice="true"'));assert(html.includes('logistics-race-v1'));
});
