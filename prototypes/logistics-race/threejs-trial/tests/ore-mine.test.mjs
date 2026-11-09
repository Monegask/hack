import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {quarrySource} from './helpers/quarry-source.mjs';
import {articulateOreMine,ORE_WHEEL} from '../src/ore-mine-motion.mjs';
test('Original mine wheel rotates around fixed bearings without moving the tower or changing its source',()=>{
 const asset=quarrySource('ore-mine'),original=asset.children[0].geometry,source=original.getAttribute('position').array.slice(),rig=articulateOreMine(asset),fixed=rig.stationary.geometry.getAttribute('position').array.slice();assert(rig.selectedTriangles>200);assert(rig.wheel.children[0].geometry.getAttribute('position').count>600);
 const p=rig.wheel.children[0].geometry.getAttribute('position'),point=new T.Vector3().fromBufferAttribute(p,0),distance=point.length();rig.update(1);asset.updateMatrixWorld(true);const world=point.clone().applyMatrix4(rig.wheel.matrixWorld);assert(Math.abs(world.distanceTo(rig.wheel.position)-distance)<1e-7);assert.equal(rig.wheel.rotation.z,-ORE_WHEEL.speed);const frozen=rig.wheel.quaternion.clone();rig.update(1);assert(rig.wheel.quaternion.equals(frozen));assert.deepEqual(rig.stationary.geometry.getAttribute('position').array,fixed);assert.deepEqual(original.getAttribute('position').array,source);assert.equal(rig.stationary.position.length(),0);
});
test('Interleaved GLB position/normal/UV accessors are copied with their actual strides',()=>{
 const asset=quarrySource('ore-mine'),g=asset.children[0].geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),packed=new Float32Array(p.count*8);for(let i=0;i<p.count;i++)packed.set([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),i/p.count,.5],i*8);
 const data=new T.InterleavedBuffer(packed,8);g.setAttribute('position',new T.InterleavedBufferAttribute(data,3,0));g.setAttribute('normal',new T.InterleavedBufferAttribute(data,3,3));g.setAttribute('uv',new T.InterleavedBufferAttribute(data,2,6));const originalBounds=new T.Box3().setFromBufferAttribute(g.getAttribute('position')),count=g.index.count,rig=articulateOreMine(asset);asset.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(asset);assert(bounds.min.distanceTo(originalBounds.min)<1e-7);assert(bounds.max.distanceTo(originalBounds.max)<1e-7);assert.equal(rig.stationary.geometry.getAttribute('position').count+rig.wheel.children[0].geometry.getAttribute('position').count,count);
});
