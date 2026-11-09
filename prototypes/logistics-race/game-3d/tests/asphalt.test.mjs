import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../threejs-trial/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../threejs-trial/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {articulateAsphalt} from '../src/asphalt-motion.mjs';
import {advanceClocks,active,working} from '../src/state.mjs';
import E from '../../dist/engine.js';
const bytes=fs.readFileSync(new URL('../../dist/assets/asphalt-plant.glb',import.meta.url)),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),root=gltf.scene,rig=articulateAsphalt(root);
const poses=()=>{const out=[];root.traverse(o=>{if(o.userData.motionId)out.push([o.userData.motionId,...o.position.toArray(),...o.rotation.toArray(),o.visible]);});return out;};
test('Real exported plant reimports with every stable motion ID and runs for a full production cycle',()=>{
 assert.equal(rig.meta.kind,'asphalt-plant');const bounds=new T.Box3().setFromObject(root);assert(Math.abs(bounds.min.y)<1e-6);assert(bounds.max.y>4);rig.update(0);const a=poses();rig.update(3);assert.notDeepEqual(poses(),a);rig.update(0);assert.deepEqual(poses(),a);
 for(let t=0;t<=40;t+=.1){rig.update(t);root.traverse(o=>{assert(o.position.toArray().every(Number.isFinite));assert(o.quaternion.toArray().every(Number.isFinite));});}
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert(!json.extensionsRequired?.length);assert(!json.buffers.some(b=>b.uri));assert(!json.images?.length);
});
test('Closed conveyor loop joins both end arcs and the bottom return run continuously',()=>{
 const {a,b,radius:r}=rig.meta.belt,len=Math.hypot(...b.map((v,i)=>v-a[i])),total=2*len+2*Math.PI*r;
 for(const d of [0,len,len+Math.PI*r,2*len+Math.PI*r,total]){const p=rig.beltPose(d-1e-6).p,q=rig.beltPose(d+1e-6).p;assert(p.distanceTo(q)<1e-4);}assert(rig.beltPose(len+Math.PI*r+len/2).p.y<rig.beltPose(len/2).p.y);
});
test('Asphalt animation and plume use paid production clocks, freeze when paused, and do not expose unbuilt assets',()=>{
 const s=E.create(),clock={};s.paused=false;assert(!active(s,'asphalt'));advanceClocks(s,clock);rig.update(clock.values.asphalt);const idle=poses();s.sites.asphalt.active=true;s.production.asphalt={left:4};assert(working(s,'asphalt'));s.time=1;advanceClocks(s,clock);rig.update(clock.values.asphalt);assert.notDeepEqual(poses(),idle);s.paused=true;s.time=3;advanceClocks(s,clock);const frozen=clock.values.asphalt;rig.update(frozen);const a=poses();advanceClocks(s,clock,10);rig.update(clock.values.asphalt);assert.deepEqual(poses(),a);s.paused=false;s.production.asphalt=null;s.time=4;advanceClocks(s,clock);assert.equal(clock.values.asphalt,frozen);assert(!working(s,'asphalt'));
});
