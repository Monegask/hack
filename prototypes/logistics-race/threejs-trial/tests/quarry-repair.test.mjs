import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {repairQuarry,conveyorGeometry,conveyorFrame,CONVEYOR} from '../src/quarry-repair.mjs';
function source(){const b=fs.readFileSync(new URL('../../dist/assets/mint/gravel-quarry/original_glb.glb',import.meta.url)),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n).toString()),bin=b.subarray(28+n),p=j.meshes[0].primitives[0],g=new T.BufferGeometry();for(const [name,id,size] of [['position',p.attributes.POSITION,3],['index',p.indices,1]]){const a=j.accessors[id],v=j.bufferViews[a.bufferView],width=a.componentType===5126?4:2,values=[];for(let i=0;i<a.count;i++)for(let k=0;k<size;k++){const at=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||width*size)+k*width;values.push(width===4?bin.readFloatLE(at):bin.readUInt16LE(at));}if(name==='index')g.setIndex(values);else g.setAttribute(name,new T.Float32BufferAttribute(values,3));}const asset=new T.Group();asset.add(new T.Mesh(g,new T.MeshStandardMaterial()));return asset;}
test('Conveyor is a closed solid loop with outward working and return surfaces',()=>{
 const g=conveyorGeometry(),p=g.getAttribute('position'),edges=new Map(),{normal,tangent}=conveyorFrame(),vertex=i=>new T.Vector3().fromBufferAttribute(p,i),key=i=>vertex(i).toArray().map(x=>x.toFixed(7)).join(',');
 for(let i=0;i<g.index.count;i+=3){const ids=[0,1,2].map(k=>g.index.getX(i+k));for(let k=0;k<3;k++){const edge=[key(ids[k]),key(ids[(k+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}}
 for(const count of edges.values())assert.equal(count,2,'no open belt edge');
 const a=vertex(0),b=vertex(1),c=vertex(4),out=b.sub(a).cross(c.sub(a)).normalize();assert(out.dot(normal)>.99,'working surface faces outward');
 let low=Infinity,high=-Infinity;const middle=CONVEYOR.a.clone().lerp(CONVEYOR.b,.5);
 for(let i=0;i<p.count;i++){const d=vertex(i).sub(middle),offset=d.dot(normal);low=Math.min(low,offset);high=Math.max(high,offset);assert(Number.isFinite(d.dot(tangent)));}
 assert(high>CONVEYOR.radius&&low<-CONVEYOR.radius,'upper and lower belt runs both exist');
});
test('Real quarry retains its authored terrain and equipment with distinct crisp colors',()=>{
 const asset=source(),old=asset.children[0].geometry,{mesh,belt,removed}=repairQuarry(asset);assert.notEqual(mesh.geometry,old);assert(removed>=10&&removed<50);assert(mesh.geometry.getAttribute('position').count>13000);
 assert.equal(mesh.material[0].map,null);assert.equal(mesh.material[0].normalMap,null);const colors=mesh.geometry.getAttribute('color'),unique=new Set();for(let i=0;i<colors.count;i++){unique.add([colors.getX(i),colors.getY(i),colors.getZ(i)].map(v=>v.toFixed(3)).join(','));}assert(unique.size>=7);assert(belt.geometry.getAttribute('position').count>100);
});

test('Gravel PBR maps, UVs and preserved vertices are finite, detailed and confined to heap faces',()=>{
 const asset=source(),original=asset.children[0].geometry.getAttribute('position'),keys=new Set();for(let i=0;i<original.count;i++)keys.add([original.getX(i),original.getY(i),original.getZ(i)].join(','));
 const {mesh}=repairQuarry(asset),g=mesh.geometry,mat=mesh.material[1];assert(mat.normalMap&&mat.roughnessMap);assert.equal(mat.normalMap.colorSpace,T.NoColorSpace);assert.equal(mat.roughnessMap.colorSpace,T.NoColorSpace);
 for(const map of [mat.normalMap,mat.roughnessMap]){assert(map.generateMipmaps);assert.equal(map.wrapS,T.RepeatWrapping);assert(new Set(map.image.data).size>20);}
 for(const x of g.getAttribute('uv').array)assert(Number.isFinite(x));
 const p=g.getAttribute('position');for(let i=0;i<p.count;i++)assert(keys.has([p.getX(i),p.getY(i),p.getZ(i)].join(',')),'heap outline and original retained vertices unchanged');
 assert(g.groups.some(x=>x.materialIndex===1));assert.equal(g.groups.reduce((n,x)=>n+x.count,0),p.count,'exactly one material per face');
});
test('Conveyor transfer anchors touch retained equipment and heap, with solid overlapping joints',()=>{
 const {mesh,connections}=repairQuarry(source());mesh.updateMatrixWorld(true);const p=mesh.geometry.getAttribute('position'),triangle=new T.Triangle(),q=new T.Vector3();
 for(const c of connections){let distance=Infinity;for(let i=0;i<p.count;i+=3){triangle.setFromAttributeAndIndices(p,i,i+1,i+2);triangle.closestPointToPoint(c.anchor,q);distance=Math.min(distance,c.anchor.distanceTo(q));}assert(distance<1e-7);c.part.updateMatrixWorld(true);const local=c.part.worldToLocal(c.anchor.clone());assert(new T.Box3().setFromBufferAttribute(c.part.geometry.getAttribute('position')).containsPoint(local));assert(c.tip.distanceTo(c.anchor)<.20,JSON.stringify({name:c.part.name,tip:c.tip.toArray(),anchor:c.anchor.toArray()}));}
});

