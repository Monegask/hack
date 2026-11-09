import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {articulatePumpjack,pumpPose,PUMP,PUMP_BASE_PORT} from '../src/pumpjack.mjs';
const near=(a,b,epsilon=1e-6)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
test('Pipeline port meets the fixed black skid surface instead of the moving rod',()=>{
 const rig=articulatePumpjack(source()),port=new T.Vector3(PUMP_BASE_PORT.x,PUMP_BASE_PORT.y,PUMP_BASE_PORT.z),g=rig.stationary.geometry,p=g.getAttribute('position'),triangle=new T.Triangle(),q=new T.Vector3();let distance=Infinity;
 for(let i=0;i<p.count;i+=3){triangle.setFromAttributeAndIndices(p,i,i+1,i+2);triangle.closestPointToPoint(port,q);distance=Math.min(distance,q.distanceTo(port));}
 assert(distance<1e-6,'port on real fixed skid triangles');assert(Math.abs(port.x-PUMP.rodX)>.5);
 for(const time of [0,1,2,3]){rig.update(time);rig.asset.updateMatrixWorld(true);near(rig.asset.localToWorld(port.clone()).distanceTo(port),0);}
});
function source(){const bytes=fs.readFileSync(new URL('../../dist/assets/mint/oil-pumpjack/original_glb.glb',import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length),p=json.meshes[0].primitives[0],g=new T.BufferGeometry();function read(id,size){const a=json.accessors[id],v=json.bufferViews[a.bufferView],width=a.componentType===5126?4:2,values=[];for(let i=0;i<a.count;i++)for(let k=0;k<size;k++){const at=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*width)+k*width;values.push(width===4?bin.readFloatLE(at):bin.readUInt16LE(at));}return width===4?new T.Float32BufferAttribute(values,size):new T.Uint16BufferAttribute(values,size);}for(const [name,key,size] of [['position','POSITION',3],['normal','NORMAL',3],['uv','TEXCOORD_0',2]])g.setAttribute(name,read(p.attributes[key],size));g.setIndex(read(p.indices,1));const group=new T.Group();group.add(new T.Mesh(g,new T.MeshStandardMaterial()));return group;}
test('Pump linkage closes for a full crank turn with constant rigid link lengths',()=>{
 const angles=[],heights=[];
 for(let i=0;i<=360;i++){const p=pumpPose(i/360*PUMP.period);near(Math.hypot(p.beamPin.x-PUMP.pivot.x,p.beamPin.y-PUMP.pivot.y),PUMP.arm);near(Math.hypot(p.beamPin.x-p.crankPin.x,p.beamPin.y-p.crankPin.y),PUMP.link);near(Math.hypot(p.crankPin.x-PUMP.crank.x,p.crankPin.y-PUMP.crank.y),PUMP.radius);assert(Number.isFinite(p.angle));assert(Math.abs(p.angle)<.4);angles.push(p.angle);heights.push(p.rodTop);}
 assert(Math.max(...angles)-Math.min(...angles)>.3);assert(Math.max(...heights)-Math.min(...heights)>.12);
 near(pumpPose(0).angle,0);near(pumpPose(PUMP.period).rodTop,pumpPose(0).rodTop);
});
test('Actual Mint pumpjack has a fixed A-frame, separate moving beam and a solid well rod',()=>{
 const asset=source(),original=asset.children[0].geometry,rig=articulatePumpjack(asset),fixed=rig.stationary.geometry.getAttribute('position').array.slice();assert.notEqual(original,rig.stationary.geometry);assert(rig.stationary.geometry.getAttribute('position').count>500);assert(rig.beam.children[0].geometry.getAttribute('position').count>100);
 const states=[];
 for(const time of [0,.5,1,1.5,2,2.5,3,3.5,4]){rig.update(time);asset.updateMatrixWorld(true);states.push(rig.beam.rotation.z);assert.deepEqual(rig.stationary.geometry.getAttribute('position').array,fixed);near(rig.stationary.rotation.z,0);const top=new T.Vector3(0,.5,0).applyMatrix4(rig.polished.matrixWorld),bottom=new T.Vector3(0,-.5,0).applyMatrix4(rig.polished.matrixWorld);near(top.z,bottom.z);for(const link of rig.pitmans)near(link.mesh.scale.y,PUMP.link);}
 assert(Math.max(...states)-Math.min(...states)>.3);
 rig.update(.7);asset.updateMatrixWorld(true);const before=asset.toJSON();rig.update(.7);asset.updateMatrixWorld(true);assert.deepEqual(asset.toJSON(),before,'same paused clock must produce identical transforms');
 for(const group of [rig.stationary,rig.beam.children[0]])for(const attribute of Object.values(group.geometry.attributes))for(const value of attribute.array)assert(Number.isFinite(value));
});
test('One solid rod reaches the wellhead with no cable; pitmans clear counterweights for the full cycle',()=>{
 const rig=articulatePumpjack(source());assert.equal(rig.bridles.length,0);assert.equal(rig.guides.length,0);near(rig.polished.geometry.parameters.radiusTop,PUMP.rodRadius);
 for(let i=0;i<=360;i++){rig.update(i/360*PUMP.period);rig.asset.updateMatrixWorld(true);
 const ends=[-.5,.5].map(y=>new T.Vector3(0,y,0).applyMatrix4(rig.polished.matrixWorld)).sort((a,b)=>a.y-b.y);near(ends[0].y,-.35);near(ends[0].x,PUMP.rodX);const contact=rig.rodContact.getWorldPosition(new T.Vector3()),direction=ends[1].clone().sub(ends[0]).normalize();near(ends[1].distanceTo(contact),PUMP.headInsertion);assert(ends[1].clone().sub(contact).dot(direction)>0,'solid rod penetrates head instead of ending at a gap');
 for(const link of rig.pitmans){const r=new T.Box3().setFromObject(link.mesh);for(const weight of rig.counterweights){const w=new T.Box3().setFromObject(weight);assert(!r.intersectsBox(w),'pitman must clear rotating counterweight');}}
 }
});

test('Solid rod crosses the actual head surface and both pitman pins stay connected for 720 phases',()=>{
 const rig=articulatePumpjack(source()),q=new T.Vector3(),triangle=new T.Triangle();
 function surfaceDistance(mesh,point){const local=mesh.worldToLocal(point.clone()),g=mesh.geometry,p=g.getAttribute('position'),idx=g.index;let best=Infinity;for(let i=0;i<(idx?.count||p.count);i+=3){const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k);triangle.setFromAttributeAndIndices(p,...ids);triangle.closestPointToPoint(local,q);best=Math.min(best,local.distanceTo(q));}return best;}
 for(let i=0;i<=720;i++){const pose=rig.update(i/720*PUMP.period);rig.asset.updateMatrixWorld(true);
  const upper=rig.rodAnchor.getWorldPosition(new T.Vector3()),bottom=new T.Vector3(PUMP.rodX,-.35,0),direction=upper.clone().sub(bottom).normalize();
  assert(surfaceDistance(rig.horsehead,rig.rodContact.getWorldPosition(new T.Vector3()))<1e-6,'solid rod crosses actual orange head triangles');
  const end=new T.Vector3(0,-.5,0).applyMatrix4(rig.polished.matrixWorld),contact=rig.rodContact.getWorldPosition(new T.Vector3());assert(end.clone().sub(contact).dot(direction)>.017,'upper end remains inserted through all phases');

  const beamPin=new T.Vector3(PUMP.arm,0,0).applyMatrix4(rig.beam.matrixWorld);near(beamPin.x,pose.beamPin.x);near(beamPin.y,pose.beamPin.y);
  for(const {mesh,z} of rig.pitmans){const endpoints=[-.5,.5].map(y=>new T.Vector3(0,y,0).applyMatrix4(mesh.matrixWorld));assert(endpoints.some(p=>p.distanceTo(new T.Vector3(pose.beamPin.x,pose.beamPin.y,z))<1e-6));assert(endpoints.some(p=>p.distanceTo(new T.Vector3(pose.crankPin.x,pose.crankPin.y,z))<1e-6));}
 }
});
