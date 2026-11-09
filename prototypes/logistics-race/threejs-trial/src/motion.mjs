// Metres, seconds; local +X is the vehicle's nose, world Y is up.
export const ROAD_WIDTH=2.1,LANE_OFFSET=.45,TRUCK_WIDTH=.77,WHEEL_RADIUS=.18;
export function initialTransport(){return {distance:0,waiting:2,laps:0,travelled:0};}
export function advanceTransport(state,seconds,{length,speed=1.45,working=true}={}){
 if(!(length>0)||!Number.isFinite(seconds)||seconds<0||speed<=0)throw Error('Invalid transport time or route');
 const next={...state};let remaining=seconds;
 while(remaining>1e-9){
  if(next.waiting>0){if(!working)break;const step=Math.min(remaining,next.waiting);next.waiting-=step;remaining-=step;continue;}
  const travel=Math.min(speed*remaining,length-next.distance);next.distance+=travel;next.travelled+=travel;remaining-=travel/speed;
  if(next.distance>=length-1e-9){next.distance=0;next.waiting=2;next.laps++;}
 }
 return next;
}
export function lanePose(point,tangent,offset=LANE_OFFSET){
 const length=Math.hypot(tangent.x,tangent.z);if(length===0)throw Error('Zero route tangent');
 const x=tangent.x/length,z=tangent.z/length;
 return {x:point.x-z*offset,z:point.z+x*offset,yaw:-Math.atan2(z,x)};
}
