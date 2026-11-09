import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {repairFactory,FACTORY_REPAIR} from '../src/factory-repair.mjs';

function sourceFactory(){
 const bytes=fs.readFileSync(new URL('../../dist/assets/mint/trial-factory/original_glb.glb',import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length),primitive=json.meshes[0].primitives[0];
 const geometry=new T.BufferGeometry();
 function attribute(id,components){const a=json.accessors[id],view=json.bufferViews[a.bufferView],stride=view.byteStride||components*(a.componentType===5126?4:2),array=[];for(let i=0;i<a.count;i++)for(let k=0;k<components;k++){const offset=(view.byteOffset||0)+(a.byteOffset||0)+i*stride+k*(a.componentType===5126?4:2);array.push(a.componentType===5126?bin.readFloatLE(offset):bin.readUInt16LE(offset));}return a.componentType===5126?new T.Float32BufferAttribute(array,components):new T.Uint16BufferAttribute(array,components);}
 for(const [name,key,size] of [['position','POSITION',3],['normal','NORMAL',3],['uv','TEXCOORD_0',2]])geometry.setAttribute(name,attribute(primitive.attributes[key],size));
 geometry.setIndex(attribute(primitive.indices,1));
 const asset=new T.Group();asset.add(new T.Mesh(geometry,new T.MeshStandardMaterial()));return asset;
}
test('Real factory loses all folded roof surfaces while retaining chimney, walls and finite UVs',()=>{
 const asset=sourceFactory(),original=asset.children[0].geometry,originalCount=original.index.count,{sourceMesh}=repairFactory(asset),geometry=sourceMesh.geometry,p=geometry.getAttribute('position');
 assert.equal(original.index.count,originalCount,'immutable imported geometry must remain intact');
 assert(p.count>1000,'retain authored side/back shell');
 let chimney=0,wall=0;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  if(y>FACTORY_REPAIR.roofCut+1e-6){assert(x>=.410-1e-6&&x<=.502+1e-6&&z>=-.203-1e-6&&z<=-.120+1e-6);chimney++;}else{assert(z<=FACTORY_REPAIR.frontCut+1e-6);wall++;}
 }
 assert(chimney>10&&wall>1000);
 for(const attribute of Object.values(geometry.attributes))for(const value of attribute.array)assert(Number.isFinite(value));
});
test('Replacement roof is a closed solid; loading doors are aligned, backed and vertical',()=>{
 const {parts}=repairFactory(sourceFactory()),roof=parts.getObjectByName('Solid flat roof'),geometry=roof.geometry,position=geometry.getAttribute('position'),edges=new Map();
 function point(i){return [position.getX(i),position.getY(i),position.getZ(i)].map(x=>x.toFixed(6)).join(',');}
 for(let i=0;i<geometry.index.count;i+=3){const ids=[0,1,2].map(k=>geometry.index.getX(i+k));for(let k=0;k<3;k++){const key=[point(ids[k]),point(ids[(k+1)%3])].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}}
 for(const incidence of edges.values())assert.equal(incidence,2,'roof must have no open boundary edges');
 const a=parts.getObjectByName('Door 1 aligned leaf'),b=parts.getObjectByName('Door 2 aligned leaf');
 assert.equal(a.position.y,b.position.y);assert.equal(a.position.z,b.position.z);
 for(const door of [a,b]){assert.deepEqual(door.rotation.toArray().slice(0,3),[0,0,0]);const box=new T.Box3().setFromObject(door);assert(Math.abs(box.min.y-FACTORY_REPAIR.base)<1e-6);}
 for(const i of [1,2]){const backing=new T.Box3().setFromObject(parts.getObjectByName(`Door ${i} solid backing`)),leaf=new T.Box3().setFromObject(parts.getObjectByName(`Door ${i} aligned leaf`));assert(backing.min.x<leaf.min.x&&backing.max.x>leaf.max.x&&backing.min.y<=leaf.min.y+1e-6&&backing.max.y>leaf.max.y);}
});
