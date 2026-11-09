import {test} from 'node:test';import assert from 'node:assert/strict';
import {initialTransport,advanceTransport,lanePose,ROAD_WIDTH,TRUCK_WIDTH,LANE_OFFSET} from '../src/motion.mjs';
import {createRoute,buildTruck,ribbon,mat,C} from '../src/world.mjs';
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('Six wheels are independent and grounded on the road plane',()=>{
 const truck=buildTruck();assert.equal(truck.wheels.length,6);assert.equal(truck.steering.length,2);
 for(const wheel of truck.wheels)near(wheel.parent.position.y,.18);
 assert(TRUCK_WIDTH/2+LANE_OFFSET<ROAD_WIDTH/2);
});
test('Heading and lane stay aligned on every sampled straight and curved road section',()=>{
 const route=createRoute();for(let i=0;i<200;i++){const t=i/200,point=route.getPointAt(t),dir=route.getTangentAt(t),pose=lanePose(point,dir);
  near(Math.hypot(pose.x-point.x,pose.z-point.z),LANE_OFFSET);
  near(Math.cos(pose.yaw),dir.x/Math.hypot(dir.x,dir.z));near(-Math.sin(pose.yaw),dir.z/Math.hypot(dir.x,dir.z));
 }
 const start=route.getPointAt(0),end=route.getPointAt(1);near(start.distanceTo(end),0);
 const road=ribbon(route,ROAD_WIDTH,.08,mat(C.ink));for(const value of road.geometry.attributes.position.array)assert(Number.isFinite(value));
});
test('Loading, travel, pause and factory shutdown use one deterministic time state',()=>{
 const initial=initialTransport(),length=40;
 assert.deepEqual(advanceTransport(initial,0,{length}),initial);
 assert.deepEqual(advanceTransport(initial,9,{length,working:false}),initial);
 const departing=advanceTransport(initial,3,{length,speed:2});near(departing.distance,2);near(departing.waiting,0);
 const lap=advanceTransport(initial,22,{length,speed:2});assert.equal(lap.laps,1);near(lap.distance,0);near(lap.waiting,2);
 const halted=advanceTransport(lap,40,{length,working:false});assert.deepEqual(halted,lap);
 const untouched=JSON.stringify(initial);advanceTransport(initial,10,{length});assert.equal(JSON.stringify(initial),untouched);
});
test('Large and small time steps agree across loading and multiple laps',()=>{
 const options={length:createRoute().getLength(),speed:1.45},total=110;
 const one=advanceTransport(initialTransport(),total,options);let steps=initialTransport();for(let i=0;i<total*100;i++)steps=advanceTransport(steps,.01,options);
 near(one.distance,steps.distance);near(one.waiting,steps.waiting);near(one.travelled,steps.travelled);assert.equal(one.laps,steps.laps);
});
test('Every tyre stays on the actual curved road surface, including the rear overhang',()=>{
 const route=createRoute(),samples=Array.from({length:2401},(_,i)=>route.getPointAt(i/2400)),truck=buildTruck();
 for(let i=0;i<400;i++){
  const pose=lanePose(route.getPointAt(i/400),route.getTangentAt(i/400));truck.group.position.set(pose.x,0,pose.z);truck.group.rotation.y=pose.yaw;truck.group.updateMatrixWorld(true);
  for(const wheel of truck.wheels)for(const edge of [-.075,.075]){
   const contact=wheel.parent.position.clone();contact.z+=edge;truck.group.localToWorld(contact);
   let closest=Infinity;for(const p of samples)closest=Math.min(closest,Math.hypot(contact.x-p.x,contact.z-p.z));
   assert(closest<=ROAD_WIDTH/2,`Tyre exceeds asphalt at route fraction ${i/400}: ${closest}`);
  }
 }
});
