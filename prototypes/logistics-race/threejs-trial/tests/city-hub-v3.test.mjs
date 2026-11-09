import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const folder=new URL('../../../../output/models/city-hub-v3/',import.meta.url),buffer=fs.readFileSync(new URL('city-hub.glb',folder));
const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),''),root=gltf.scene,meta=root.children[0].userData.procedural;
root.updateMatrixWorld(true);
const ray=new T.Raycaster(),heightAt=(x,z)=>{ray.set(new T.Vector3(x,8,z),new T.Vector3(0,-1,0));return ray.intersectObject(root,true)[0]?.point.y;};

test('Miniature has grounded square bounds, a varied skyline and self-contained standard materials',()=>{
 const json=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());assert.equal(json.asset.version,'2.0');assert(!json.extensionsRequired?.length);assert(!json.buffers.some(b=>b.uri));assert(!json.images?.length);
 const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3());assert(Math.abs(bounds.min.y)<1e-6);assert(Math.abs(bounds.min.x+bounds.max.x)<1e-6);assert(Math.abs(bounds.min.z+bounds.max.z)<1e-6);assert(Math.abs(size.x-12.8)<1e-5);assert(Math.abs(size.z-11.8)<1e-5);assert(size.y>4&&size.y<5.1);
 assert.equal(meta.version,3);assert.equal(meta.buildingCount,14);assert(new Set(meta.buildings.map(b=>b.floors)).size>=5);
 let triangles=0,meshes=0;root.traverse(o=>{if(o.isMesh){meshes++;assert(o.material.isMeshStandardMaterial);assert(o.material.roughness>.4);for(const n of o.geometry.attributes.position.array)assert(Number.isFinite(n));triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});assert(meshes<=10);assert(triangles<35000);
});

test('Every urban building has a continuous roof, closed solid body, and footing on the city base',()=>{
 for(const b of meta.buildings){assert.equal(b.bottom,meta.parameters.baseTop);assert(b.bodyBottom>b.bottom);for(const xx of [-.40,0,.40])for(const zz of [-.40,0,.40]){const y=heightAt(b.x+b.width*xx,b.z+b.depth*zz);assert(y>=b.top+.064,b.id+' roof has a hole');assert(y<b.top+1.60);}}
 // Inspect the low exterior wall from the side; it must extend down to its footing.
 for(const b of meta.buildings){ray.set(new T.Vector3(b.x,meta.parameters.baseTop+.025,b.z+b.depth/2+.3),new T.Vector3(0,0,-1));const hit=ray.intersectObject(root,true)[0];assert(hit&&hit.distance<.33,b.id+' floating foundation');}
});

test('Buildings and industrial plots have separated footprints and remain inside the miniature',()=>{
 const plots=[...meta.buildings,...meta.industries];for(const [i,a] of plots.entries()){
  assert(Math.abs(a.x)+a.width/2<5.2);assert(Math.abs(a.z)+a.depth/2<4.7);
  for(const b of plots.slice(i+1))assert(Math.abs(a.x-b.x)>(a.width+b.width)/2+.10||Math.abs(a.z-b.z)>(a.depth+b.depth)/2+.10,a.id+' overlaps '+b.id);
 }
});

test('Refinery, metalworks and assembly remain visible, grounded, and decorative city components',()=>{
 assert.deepEqual(meta.industries.map(i=>i.id).sort(),['assembly','metalworks','refinery']);assert.equal(meta.interactiveChildren,false);
 for(const i of meta.industries){assert.equal(i.interactive,false);assert(Math.abs(i.bounds.min[1]-meta.parameters.baseTop)<1e-6);let exposed=0;for(const dx of [-.35,0,.35])for(const dz of [-.35,0,.35]){const y=heightAt(i.x+dx,i.z+dz);assert(y<=i.bounds.max[1]+.001);if(y>.65)exposed++;}assert(exposed>=2,i.id+' lacks visible production geometry');}
 root.traverse(o=>{assert.equal(o.userData.node,undefined);assert.equal(o.userData.truckId,undefined);});
});

test('Eight numbered truck bays fit trucks, do not overlap and leave an open aisle to the street',()=>{
 const {slots,drive,surfaceY}=meta.parking,center=(drive.minX+drive.maxX)/2;assert.equal(slots.length,8);assert.deepEqual(slots.map(s=>s.id).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
 for(const [i,s] of slots.entries()){
  assert(s.width>1.24&&s.depth>.56);assert(s.x+s.width/2<drive.minX||s.x-s.width/2>drive.maxX);
  for(const t of slots.slice(i+1))assert(Math.abs(s.x-t.x)>=(s.width+t.width)/2||Math.abs(s.z-t.z)>=(s.depth+t.depth)/2);
 }
 for(let z=drive.minZ;z<=drive.maxZ;z+=.1)for(const dx of [-.40,0,.40])assert(heightAt(center+dx,z)<surfaceY+.025,'blocked parking aisle at '+z);
});

test('Street centerlines stay clear of architecture and curbs, including crossings',()=>{
 for(const road of meta.roads){const alongX=road.width>road.depth,length=alongX?road.width:road.depth;for(let t=-length/2+.1;t<length/2-.1;t+=.2){const x=road.x+(alongX?t:0),z=road.z+(alongX?0:t);assert(heightAt(x,z)<.23,road.id+' blocked at '+x+','+z);}}
});

test('Official validator accepts the model and it can be reused at uniform map scales',()=>{
 const report=JSON.parse(fs.readFileSync(new URL('validation.json',folder),'utf8'));assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);
 const original=new T.Box3().setFromObject(root).getSize(new T.Vector3());for(const width of [5,4.1]){const clone=root.clone(true);clone.scale.setScalar(width/original.x);clone.updateMatrixWorld(true);const b=new T.Box3().setFromObject(clone),s=b.getSize(new T.Vector3());assert(Math.abs(s.x-width)<1e-6);assert(Math.abs(s.x/s.y-original.x/original.y)<1e-6);assert(Math.abs(b.min.y)<1e-6);}
});
