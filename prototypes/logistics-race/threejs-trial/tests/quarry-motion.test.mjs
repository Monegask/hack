import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {quarrySource} from './helpers/quarry-source.mjs';
import {repairQuarry,CONVEYOR,conveyorFrame} from '../src/quarry-repair.mjs';
import {animateQuarry,beltPose,gravelPose,BELT_LENGTH,QUARRY_MOTION} from '../src/quarry-motion.mjs';
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('Belt motion follows upper, wrapped and lower runs continuously on a closed loop',()=>{
 const {normal}=conveyorFrame();let up=0,down=0;
 for(let i=0;i<=720;i++){const a=beltPose(i/720*BELT_LENGTH),b=beltPose((i+1)/720*BELT_LENGTH);near(a.normal.length(),1);near(a.tangent.length(),1);near(a.normal.dot(a.tangent),0);assert(a.position.distanceTo(b.position)<BELT_LENGTH/720*1.01);if(a.normal.dot(normal)>.99)up++;if(a.normal.dot(normal)<-.99)down++;}
 assert(up>100&&down>100);near(beltPose(0).position.distanceTo(beltPose(BELT_LENGTH).position),0);
 const carry=CONVEYOR.a.distanceTo(CONVEYOR.b)/QUARRY_MOTION.beltSpeed;assert(gravelPose(carry).distanceTo(gravelPose(carry+1e-7))<1e-6);assert(gravelPose(carry+.5).y<gravelPose(carry).y,'stone falls into heap');
});
test('Real quarry animates wheels, crushing core, screen and carried gravel while terrain stays fixed',()=>{
 const repaired=repairQuarry(quarrySource()),rig=animateQuarry(repaired),fixed=repaired.mesh.geometry.getAttribute('position').array.slice();
 assert(rig.wheels.every(w=>w.geometry.getAttribute('position').count>100),'both imported flywheels extracted');assert(rig.screen.geometry.getAttribute('position').count>30);
 rig.update(0);rig.asset.updateMatrixWorld(true);const wheelStart=rig.wheels[0].quaternion.clone(),stoneStart=new T.Matrix4();rig.stones.getMatrixAt(0,stoneStart);const markerStart=rig.markers[0].position.clone();
 rig.update(.5);rig.asset.updateMatrixWorld(true);const stoneNext=new T.Matrix4();rig.stones.getMatrixAt(0,stoneNext);assert(rig.wheels[0].quaternion.angleTo(wheelStart)>.5);assert(rig.markers[0].position.distanceTo(markerStart)>.02);assert(new T.Vector3().setFromMatrixPosition(stoneNext).distanceTo(new T.Vector3().setFromMatrixPosition(stoneStart))>.02);
 assert.deepEqual(repaired.mesh.geometry.getAttribute('position').array,fixed);near(repaired.mesh.position.length(),0);near(repaired.mesh.rotation.z,0);
 const state=rig.asset.toJSON();rig.update(.5);rig.asset.updateMatrixWorld(true);assert.deepEqual(rig.asset.toJSON(),state,'frozen quarry clock freezes all moving parts');
 for(let i=0;i<36;i++){const m=new T.Matrix4();rig.stones.getMatrixAt(i,m);for(const x of m.elements)assert(Number.isFinite(x));}
});
