import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {quarrySource} from './helpers/quarry-source.mjs';
import {paintMetalworks,finishMetalworks} from '../src/metalworks.mjs';
import {METAL_REPAIR} from '../src/metalworks-repair.mjs';
import {animateMetalworks} from '../src/metalworks-motion.mjs';

function surfaceArea(g){
 const p=g.getAttribute('position'),index=g.index,a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();let area=0;
 for(let i=0;i<(index?.count||p.count);i+=3){a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);area+=b.sub(a).cross(c.sub(a)).length()/2;}return area;
}
test('Metalworks paint boundaries retain delivered surface area, bounds and valid normals',()=>{
 const asset=quarrySource('metalworks'),original=asset.children[0].geometry,positions=original.getAttribute('position').array.slice();original.computeBoundingBox();const area=surfaceArea(original);
 paintMetalworks(asset);const g=asset.children[0].geometry;
 assert.deepEqual(original.getAttribute('position').array,positions,'source geometry retained');
 assert(Math.abs(surfaceArea(g)-area)/area<1e-6,'clipping neither removes nor overlaps surfaces');
 for(const edge of ['min','max'])assert(g.boundingBox[edge].distanceTo(original.boundingBox[edge])<1e-6);
 for(const name of ['position','normal','color'])assert([...g.getAttribute(name).array].every(Number.isFinite));
 const n=g.getAttribute('normal'),v=new T.Vector3();for(let i=0;i<n.count;i++)assert(Math.abs(v.fromBufferAttribute(n,i).length()-1)<1e-5);
 const colors=new Set();const c=g.getAttribute('color');for(let i=0;i<c.count;i++)colors.add([c.getX(i),c.getY(i),c.getZ(i)].join(','));assert(colors.size>=6,'palette has distinct equipment, furnace and ground colors');
});

test('Steel rolls move around fixed axes and chimney smoke follows the frozen production clock',()=>{
 const asset=finishMetalworks(quarrySource('metalworks')),fixed=asset.children[0].geometry.getAttribute('position').array.slice(),rig=animateMetalworks(asset),centers=rig.rollers.map(r=>r.position.clone());
 const positions=rig.puffs.map(p=>p.position.clone());rig.update(.4,true);
 assert(rig.rollers.length===6);assert(rig.rollers.every((r,i)=>r.position.equals(centers[i])&&Math.abs(r.rotation.x)>1));
 assert(rig.puffs.some((p,i)=>p.position.distanceTo(positions[i])>.001));assert(rig.origin.y>.3427&&rig.origin.x<-.2,'emitter at original furnace chimney, not hall roof');
 assert(rig.puffs.every(p=>p.position.y>=rig.origin.y));assert.deepEqual(asset.children[0].geometry.getAttribute('position').array,fixed);
 const poses=rig.rollers.map(r=>r.quaternion.toArray()),smoke=rig.puffs.map(p=>p.position.toArray());rig.update(.4,true);assert.deepEqual(rig.rollers.map(r=>r.quaternion.toArray()),poses);assert.deepEqual(rig.puffs.map(p=>p.position.toArray()),smoke);
 rig.update(.4,false);assert.equal(rig.smoke.visible,false);assert.deepEqual(rig.rollers.map(r=>r.quaternion.toArray()),poses,'stopped production freezes rolls while hiding emissions');
 for(const roll of rig.rollers)roll.traverse(o=>{if(o.isMesh)assert.equal(o.material.color.getHex(),0x999d9b);});
});

test('Repaired hall has no old overlapping shell and foundation contacts ground across its footprint',()=>{
 const asset=finishMetalworks(quarrySource('metalworks')),source=asset.children[0],p=source.geometry.getAttribute('position'),h=METAL_REPAIR.hall;
 for(let i=0;i<p.count;i+=3){const center=new T.Vector3();for(let k=0;k<3;k++)center.add(new T.Vector3().fromBufferAttribute(p,i+k));center.multiplyScalar(1/3);assert(center.y>=METAL_REPAIR.floor-1e-7);assert(!(center.x>h.minX+1e-7&&center.x<h.maxX-1e-7&&center.z>h.minZ+1e-7&&center.z<h.maxZ-1e-7),'old hall surfaces were removed');}
 source.geometry.computeBoundingBox();assert(Math.abs(source.geometry.boundingBox.max.y-.3427734077)<1e-6,'original furnace retained');
 const bounds=new T.Box3().setFromObject(asset);asset.position.y=-bounds.min.y;asset.updateMatrixWorld(true);
 const ray=new T.Raycaster();for(const x of [-.49,-.25,0,.25,.49])for(const z of [-.47,-.24,0,.24,.47]){ray.set(new T.Vector3(x,-.2,z),new T.Vector3(0,1,0));const hits=ray.intersectObject(asset,true);assert(hits.length,'foundation exists under every side');assert(Math.abs(hits[0].point.y)<1e-6,'bottom plane contacts ground without a floating edge');}
 for(const mesh of asset.children.flatMap(o=>o.isMesh?[o]:o.children)){const g=mesh.geometry;for(const name of ['position','normal'])assert([...g.getAttribute(name).array].every(Number.isFinite));}
 assert(asset.children[1].children.length<=10,'hall details merged into shared material batches');
});
