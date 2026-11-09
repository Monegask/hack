import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../threejs-trial/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../threejs-trial/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import E from '../../dist/engine.js';
import {SITE_LAYOUT} from '../src/site-layout.mjs';
import Scene from '../../dist/map-scene.js';
import {CELL,world,cell,visualCell,parkingSlot,hiddenByEnterprise,truckPose,approachSpan} from '../src/state.mjs';
import {HUB,HUB_SLOTS,placeHub,hubPoint,hubApproach,pathPose} from '../src/hub-layout.mjs';
const b=fs.readFileSync(new URL('../../dist/assets/city-hub.glb',import.meta.url)),gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),''),meta=gltf.scene.children[0].userData.procedural;

test('Integrated asset retains the approved city, with a clear geometric freight lane and embedded numbered stalls',()=>{
 assert(meta.parameters.serviceLane);assert.equal(meta.buildingCount,14);assert.equal(meta.industrialModels,3);assert.equal(meta.interactiveChildren,false);assert.equal(meta.parameters.width,HUB.width);assert.equal(meta.parameters.depth,HUB.depth);
 for(const slot of HUB_SLOTS){const real=meta.parking.slots.find(s=>s.id===slot.id);assert.equal(real.x,slot.x);assert.equal(real.z,slot.z);assert.equal(real.yaw,slot.yaw);}
 gltf.scene.updateMatrixWorld(true);const ray=new T.Raycaster();for(let z=-5.15;z<.66;z+=.1)for(const dx of [-.23,0,.23]){ray.set(new T.Vector3(HUB.laneX+dx,8,z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(gltf.scene,true)[0];assert(hit&&hit.point.y<.23,'lane blocked by a tree, curb or wall at '+z);}
});

test('Expanded grid round-trips saved cells and provides separated model footprints within the terrain',()=>{
 assert.equal(CELL,6);for(let x=0;x<16;x++)for(let y=0;y<11;y++)assert.deepEqual(cell(world([x,y]).x,world([x,y]).z),[x,y]);
 const plots=Object.entries(E.positions).map(([id,gate])=>{const p=world(visualCell(id,E,Scene.models)),hub=id==='city'||id==='center';return {id,x:p.x,z:p.z,w:SITE_LAYOUT[id].width,d:SITE_LAYOUT[id].depth};});
 for(const [i,a] of plots.entries()){assert(Math.abs(a.x)+a.w/2<(16*CELL+3)/2);assert(Math.abs(a.z)+a.d/2<(11*CELL+4)/2);for(const c of plots.slice(i+1))assert(Math.abs(a.x-c.x)>(a.w+c.w)/2+.5||Math.abs(a.z-c.z)>(a.d+c.d)/2+.5,a.id+' overlaps '+c.id);}
});

test('Actual truck stalls and both hub access paths remain outside every building footprint',()=>{
 for(const id of ['city','center']){const gate=world(E.positions[id]),at=placeHub(gate),bounds=[...meta.buildings,...meta.industries].map(b=>({min:{x:at.x+(b.x-b.width/2-.025)*HUB.scale,z:at.z+(b.z-b.depth/2-.025)*HUB.scale},max:{x:at.x+(b.x+b.width/2+.025)*HUB.scale,z:at.z+(b.z+b.depth/2+.025)*HUB.scale}}));
  for(let n=1;n<=8;n++){const path=hubApproach(gate,n),slot=path[0];if(id==='city')assert.deepEqual(parkingSlot(n),slot);assert(Math.abs(slot.y-(HUB.baseY+meta.parking.surfaceY*HUB.scale+.008))<1e-8);
   for(let i=0;i<=500;i++){const pose=pathPose(path,i/500);assert(!hiddenByEnterprise(pose,bounds),id+' truck '+n+' meets a building at '+i);assert(Number.isFinite(pose.y));}
  }
 }
});

test('Existing routes with roads, pipes and a mid-trip truck retain times, cargo and pause semantics',()=>{
 const s=E.create();s.paused=false;s.roads=['4,8','5,8'];s.pipeCells=['4,8','5,8'];assert(E.start(s,1,'materials','iron'));E.tick(s,2.7);const saved=JSON.stringify(s),restored=E.upgrade(JSON.parse(saved));
 for(const t of restored.trucks){const pose=truckPose(restored,t);assert([pose.x,pose.y,pose.z,pose.yaw].every(Number.isFinite));}assert.equal(JSON.stringify(restored),saved);const before=JSON.stringify(s);for(let i=0;i<100;i++)truckPose(s,s.trucks[0],i/100);assert.equal(JSON.stringify(s),before);
 s.paused=true;assert.deepEqual(truckPose(s,s.trucks[0],20),truckPose(s,s.trucks[0],0));
});

test('Logistics-center arrivals end on their assigned stall and departures connect continuously to the saved route',()=>{
 const s=E.create();s.paused=false;for(let id=1;id<=8;id++)for(const kind of ['out','back']){const leg={kind,points:kind==='out'?[[10,4],[11,4]]:[[11,4],[10,4]],costs:[4],elapsed:kind==='out'?4:0},t={id,job:{},leg},p=truckPose(s,t),slot=hubApproach(world(E.positions.center),id)[0];assert(Math.hypot(p.x-slot.x,p.z-slot.z)<1e-6);const join=kind==='out'?4-approachSpan(4):approachSpan(4);leg.elapsed=join-1e-7;const a=truckPose(s,t);leg.elapsed=join+1e-7;const c=truckPose(s,t);assert(Math.hypot(a.x-c.x,a.z-c.z)<1e-4);}
});
