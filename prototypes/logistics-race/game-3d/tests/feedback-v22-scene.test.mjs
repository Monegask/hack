import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import E from '../../dist/engine.js';
import Scene from '../../dist/map-scene.js';
import {networkPoint,connectionCell,world,truckPose,cameraButtons,canPaintPointer,hubPortal} from '../src/state.mjs';
import {SITE_LAYOUT} from '../src/site-layout.mjs';
const models=Scene.models,near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('Copper and center routes physically avoid every foreign enterprise, even when no enterprise is built',()=>{
 for(const paved of [false,true])for(const target of ['copper','center']){
  const s=E.create();s.paused=false;if(paved)for(let x=0;x<16;x++)for(let y=0;y<11;y++)s.roads.push([x,y].join(','));
  const route=E.path(s,E.positions.city,E.positions[target]);assert(route.length>1);
  for(let i=1;i<route.length;i++){
   assert(E.canTravelStep(route[i-1],route[i],route[0],route.at(-1)));
   for(const rect of E.travelFootprints.filter(r=>r.id!=='city'&&r.id!==target))assert(!E.crossesTravelFootprint(networkPoint(route[i-1],E,models),networkPoint(route[i],E,models),rect));
  }
  const costs=route.slice(1).map((p,i)=>Math.hypot(p[0]-route[i][0],p[1]-route[i][1])*(paved?2:4)),total=costs.reduce((a,b)=>a+b,0),leg={points:route,costs,elapsed:0},t={id:1,job:{target},leg};
  // Check the complete animated path, not just the logical route-cell guard.
  for(let time=0;time<total;time+=.03){leg.elapsed=time;const p=truckPose(s,t,0,0,E,models);for(const rect of E.travelFootprints.filter(r=>r.id!=='city'&&r.id!==target))assert(!(p.x>rect.min.x-.3&&p.x<rect.max.x+.3&&p.z>rect.min.z-.3&&p.z<rect.max.z+.3),`${target} crosses ${rect.id}`);}
 }
});

test('Center yard, its visible loading portal and its road network all snap to the same capacity-eight endpoint',()=>{
 const s=E.create();s.paused=false;s.city.asphalt=100;
 const route=E.path(s,E.positions.city,E.positions.center);for(const p of route){assert.deepEqual(connectionCell(networkPoint(p,E,models),E,models,SITE_LAYOUT),p,'road painting must not skip a logical cell at the hub yard');E.buildRoad(s,p);}
 const portal=hubPortal('center',E);assert.deepEqual(connectionCell(portal,E,models,SITE_LAYOUT),E.positions.center);
 for(const rect of E.travelFootprints.filter(r=>r.id==='center')){const yard={x:(rect.min.x+rect.max.x)/2,z:(rect.min.z+rect.max.z)/2};assert.deepEqual(connectionCell(yard,E,models,SITE_LAYOUT),E.positions.center);}
 assert.equal(E.routeInfo(s,'center').capacity,8);
 for(let i=1;i<route.length;i++)for(const rect of E.travelFootprints.filter(r=>r.id==='city'||r.id==='center'))assert(!E.crossesTravelFootprint(networkPoint(route[i-1],E,models),networkPoint(route[i],E,models),rect),'street route enters a hub away from its portal');
});

test('Road edge timing visibly doubles speed on asphalt, including the initial hub approach',()=>{
 const s=E.create();s.paused=false;const route=E.path(s,E.positions.city,E.positions.copper),base=route.slice(1).map((p,i)=>Math.hypot(p[0]-route[i][0],p[1]-route[i][1])*4),total=base.reduce((a,b)=>a+b,0);
 for(let time=0;time<total;time+=.11){const t={id:1,job:{target:'copper'},leg:{points:route,costs:base,elapsed:time}},fast={...t,leg:{points:route,costs:base.map(n=>n/2),elapsed:time/2}},a=truckPose(s,t,0,0,E,models),b=truckPose(s,fast,0,0,E,models);near(a.x,b.x);near(a.z,b.z);}
});

test('Drawing keeps wheel zoom and reserves separate mouse buttons for paint and camera',()=>{
 assert.deepEqual(cameraButtons(true),{LEFT:null,MIDDLE:2,RIGHT:0});assert.equal(canPaintPointer({button:0},true),true);assert.equal(canPaintPointer({button:2},true),false);assert.equal(canPaintPointer({button:0},false),false);
 const source=fs.readFileSync(new URL('../src/view.mjs',import.meta.url),'utf8');assert(source.includes('this.controls.enabled=true'));assert(source.includes('this.controls.enableZoom=true'));assert(source.includes('cameraButtons(drawing)'));assert(source.includes('if(hit?.id)return [...this.E.positions[hit.id]]'));assert(source.includes("if(!this.options.roadMode&&!this.options.pipeMode&&this.pointerStart"));
});

test('Pipe mesh is generated from authoritative diagonal topology at the same endpoints',async()=>{
 let source=fs.readFileSync(new URL('../src/geometry.mjs',import.meta.url),'utf8');
 for(const [from,to] of [["'three'",new URL('../../threejs-trial/node_modules/three/build/three.module.js',import.meta.url)],["'three/addons/utils/BufferGeometryUtils.js'",new URL('../../threejs-trial/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js',import.meta.url)],["'./state.mjs'",new URL('../src/state.mjs',import.meta.url)],["'./hub-layout.mjs'",new URL('../src/hub-layout.mjs',import.meta.url)]])source=source.replace(from,JSON.stringify(to.href));
 const {pipes}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const a=[4,8],b=[5,9],s=E.create();let calls=0;const group=pipes(s,{...E,pipeEdges:()=>{calls++;return [[a,b]];}});assert.equal(calls,1);
 const mesh=group.children.find(o=>o.material.color.getHex()===0x767669);assert(mesh);mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox,p=world(a),q=world(b);assert(Math.abs(bounds.min.x-p.x)<.1);assert(Math.abs(bounds.max.x-q.x)<.1);assert(Math.abs(bounds.min.z-(p.z+.78))<.1);assert(Math.abs(bounds.max.z-(q.z+.78))<.1);
});
