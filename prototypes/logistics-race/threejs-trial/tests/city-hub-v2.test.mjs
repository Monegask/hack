import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const path=new URL('../../../../output/models/city-hub-v2/city-hub.glb',import.meta.url),buffer=fs.readFileSync(path),bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),gltf=await new GLTFLoader().parseAsync(bytes,''),root=gltf.scene,meta=root.children[0].userData.procedural;
root.updateMatrixWorld(true);
test('Vault city services are visible geometric parts within the city and have no independent interaction nodes',()=>{
 assert.deepEqual(meta.industries.map(x=>x.id).sort(),['assembly','metalworks','refinery']);assert.equal(meta.interactiveChildren,false);
 for(const service of meta.industries){assert.equal(service.interactive,false);const b=service.bounds;for(const [x,,z] of service.footprint)assert(Math.hypot(x,z)<4.36);assert(Math.abs(b.min[1]-meta.parameters.baseTop)<1e-6);
  // At least one substantial industrial part is exposed from above in its own plot.
  const ray=new T.Raycaster();let visible=false;for(let i=1;i<5;i++)for(let j=1;j<5;j++){const x=b.min[0]+(b.max[0]-b.min[0])*i/5,z=b.min[2]+(b.max[2]-b.min[2])*j/5;ray.set(new T.Vector3(x,4,z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(root,true)[0];if(hit&&hit.point.y>.45&&hit.point.y<=b.max[1]+.001)visible=true;}assert(visible,service.id+' has no exposed industrial geometry');
 }
 root.traverse(o=>{assert.equal(o.userData.node,undefined);assert.equal(o.userData.truckId,undefined);});
});
test('Eight individual freight bays fit the existing truck and leave a clear connected center aisle',()=>{
 const {slots,drive,surfaceY}=meta.parking;assert.equal(slots.length,8);assert.deepEqual(slots.map(x=>x.id).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
 for(const [i,s] of slots.entries()){assert(s.width>1.24&&s.depth>.56);assert(Math.abs(s.x)-s.width/2>drive.maxX);for(const t of slots.slice(i+1))assert(Math.abs(s.x-t.x)>=(s.width+t.width)/2||Math.abs(s.z-t.z)>=(s.depth+t.depth)/2);}
 const ray=new T.Raycaster();for(let z=drive.minZ;z<drive.maxZ;z+=.2){ray.set(new T.Vector3(0,4,z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(root,true)[0];assert(hit&&hit.point.y<surfaceY+.04,'center aisle blocked at '+z);}
 // Actual truck geometry is deliberately not baked into the reusable city GLB.
 assert.equal(root.children[0].userData.procedural.bakedTruckCount,undefined);
});
test('Exported city is self-contained, grounded, finite, and reimports with the intended limited palette',()=>{
 const json=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());assert.equal(json.asset.version,'2.0');assert(!json.extensionsRequired?.length);assert(!json.buffers.some(b=>b.uri));assert(!json.images?.length);assert.equal(meta.buildingCount,12);assert.equal(meta.industrialModels,3);
 const bounds=new T.Box3().setFromObject(root);assert(Math.abs(bounds.min.y)<1e-6);assert(Math.abs(bounds.min.x+bounds.max.x)<1e-6);assert(bounds.max.y<2.2);
 let triangles=0;root.traverse(o=>{if(o.isMesh){assert(o.material.isMeshStandardMaterial);assert(o.material.roughness>.4);for(const v of o.geometry.getAttribute('position').array)assert(Number.isFinite(v));triangles+=(o.geometry.index?.count||o.geometry.getAttribute('position').count)/3;}});assert(triangles<30000);
});
test('Every curved quarter has a continuous closed roof throughout its interior',()=>{
 const ray=new T.Raycaster();
 for(const q of meta.quarters)for(const r of [q.inner+.10,(q.inner+q.outer)/2,q.outer-.10])for(const t of [-.35,0,.35]){
  const a=q.angle+q.span*t;ray.set(new T.Vector3(r*Math.cos(a),4,r*Math.sin(a)),new T.Vector3(0,-1,0));const hit=ray.intersectObject(root,true)[0];assert(hit,`roof missing at ${a}`);assert(hit.point.y>=q.top+.054&&hit.point.y<q.top+.30,`unexpected roof height ${hit.point.y}`);
 }
});
test('Quarters do not overlap, the main entrance stays open, and plinths meet the foundation',()=>{
 const q=meta.quarters,ray=new T.Raycaster();for(let i=0;i<q.length;i++){assert(Math.abs(q[i].bottom-.035-meta.parameters.baseTop)<1e-8);for(let j=i+1;j<q.length;j++){const delta=Math.abs(Math.atan2(Math.sin(q[i].angle-q[j].angle),Math.cos(q[i].angle-q[j].angle)));assert(delta>(q[i].span+q[j].span)/2+.05);}}
 for(const z of [2.45,2.9,3.4,3.9]){ray.set(new T.Vector3(0,4,z),new T.Vector3(0,-1,0));assert(ray.intersectObject(root,true)[0].point.y<.2,'building blocks main entrance');}
});
test('The exact same asset can be uniformly scaled for city and center without distorting geometry',()=>{
 const original=new T.Box3().setFromObject(root).getSize(new T.Vector3());
 for(const width of [5,4.1]){const clone=root.clone(true);clone.scale.setScalar(width/original.x);clone.updateMatrixWorld(true);const b=new T.Box3().setFromObject(clone),s=b.getSize(new T.Vector3());assert(Math.abs(s.x-width)<1e-6);assert(Math.abs(s.x/s.y-original.x/original.y)<1e-6);assert(Math.abs(b.min.y)<1e-6);}
});
test('Khronos validator accepts the exported binary without errors or warnings',()=>{
 const result=JSON.parse(fs.readFileSync(new URL('../../../../output/models/city-hub-v2/validation.json',import.meta.url),'utf8'));assert.equal(result.issues.numErrors,0);assert.equal(result.issues.numWarnings,0);
});
