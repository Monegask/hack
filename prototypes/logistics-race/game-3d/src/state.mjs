// Engine coordinates remain authoritative. X/Z is the ground, +Y is up.
// Each saved engine cell now spans six world units; vehicle forward is local +X.
import {HUB,placeHub,hubStall,hubApproach,pathPose} from './hub-layout.mjs';
export const CELL=6,ROAD_WIDTH=1.44,LANE=.28,TRUCK_SCALE=.7062;
export const key=p=>p.join(',');
export const world=p=>({x:(p[0]-7.5)*CELL,z:(p[1]-5)*CELL});
export const cell=(x,z)=>[Math.round(x/CELL+7.5),Math.round(z/CELL+5)];
export function visualCell(id,E,models){
 if(id==='city'||id==='center'){const p=placeHub(world(E.positions[id]),E.hubMirrors?.[id]);return [p.x/CELL+7.5,p.z/CELL+5];}
 const gate=E.positions[id],pixel=E.travelAnchors?.[id]||models[id]?.at||(id==='city'?[222,564]:[54+gate[0]*56,44+gate[1]*54-(id==='center'?32:0)]);
 return [(pixel[0]-54)/56,(pixel[1]-44)/54];
}
// Every road and vehicle uses this same projection. A loading point is inside
// the visible site, including before construction; saved engine cells stay intact.
export function networkPoint(p,E,models){return E&&models&&E.travelPoint?E.travelPoint(p):world(p);}
export function connectionCell(point,E,models,layouts){
 for(const [id,at] of Object.entries(E.positions)){const center=world(visualCell(id,E,models)),layout=layouts[id];if(Math.abs(point.x-center.x)<=layout.width/2&&Math.abs(point.z-center.z)<=layout.depth/2)return [...at];}
 let nearest=null,distance=Infinity;for(let z=0;z<(E.height||11);z++)for(let x=0;x<(E.width||16);x++){const w=networkPoint([x,z],E,models),d=Math.hypot(point.x-w.x,point.z-w.z);if(d<distance){distance=d;nearest=[x,z];}}return nearest;
}
// OrbitControls consumes these buttons; the paint handler exclusively owns left.
export function cameraButtons(drawing){return drawing?{LEFT:null,MIDDLE:2,RIGHT:0}:{LEFT:0,MIDDLE:1,RIGHT:2};}
export function canPaintPointer(event,drawing){return drawing&&event.button===0;}
export function hubPortal(id,E){return {...world(E.positions[id]),id};}
export function active(s,id){return !s.sites[id]||s.sites[id].active;}
export function working(s,id){return Boolean(id==='oil'?s.production.oil:id==='asphalt'?s.production.asphalt:s.sites[id]?.active&&s.sites[id].mining);}
export function advanceClocks(s,cache,extra=0){
 const now=s.time+(s.paused||s.won?0:extra);
 if(cache.time===undefined||now<cache.time){cache.time=now;cache.values={};}
 const dt=Math.max(0,now-cache.time);cache.time=now;
 for(const id of ['oil','oil2','gravel','iron','copper','asphalt']){cache.values[id]??=0;if(working(s,id)&&!s.paused&&!s.won)cache.values[id]+=dt;}
 return cache.values;
}
// Stable numbered stalls use physical truck dimensions rather than engine cells.
export function parkingSlot(id,E){return hubStall(world(E?.positions.city||[3,8]),id,E?.hubMirrors?.city);}
export const approachSpan=total=>Math.min(6,total*.32);
function routePose(leg,elapsed,E,models){
 let i=0,distance=0;
 while(i<leg.costs.length-1&&elapsed>=leg.costs[i]){elapsed-=leg.costs[i];distance+=Math.hypot(leg.points[i+1][0]-leg.points[i][0],leg.points[i+1][1]-leg.points[i][1]);i++;}
 const a=networkPoint(leg.points[i],E,models),b=networkPoint(leg.points[i+1],E,models),u=Math.max(0,Math.min(1,elapsed/leg.costs[i])),length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
 return {x:a.x+(b.x-a.x)*u-dz*LANE,z:a.z+(b.z-a.z)*u+dx*LANE,yaw:-Math.atan2(dz,dx),distance:distance*CELL+length*u};
}
export function truckPose(s,t,extra=0,lastYaw=0,E,models){
 const pose=(leg,time)=>routePose(leg,time,E,models);
 const samples=(leg,start,end)=>{const times=[start];let time=0;for(const cost of leg.costs){time+=cost;if(time>start&&time<end)times.push(Math.max(start,time-.001),time,Math.min(end,time+.001));}times.push(end);return times.map(time=>({...pose(leg,time),y:.071}));};
 const hubs=E?.positions||{city:[3,8],center:[11,4]},hubGate=p=>{if(!p)return null;const id=['city','center'].find(id=>key(hubs[id])===key(p));return id?{...world(p),mirror:E?.hubMirrors?.[id]||false}:null;};
 if(t.leg){
  const leg=t.leg,total=leg.costs.reduce((n,v)=>n+v,0),elapsed=Math.min(total,leg.elapsed+(s.paused||s.won?0:extra)),span=approachSpan(total),outSpan=Math.min(span,leg.costs[0]*.6),inSpan=Math.min(span,leg.costs.at(-1)*.6),out={...pose(leg,elapsed),y:.071},source=hubGate(leg.points[0]),destination=hubGate(leg.points.at(-1));
  if(source&&elapsed<outSpan){const path=[...hubApproach(source,t.id,source.mirror),...samples(leg,0,Math.max(0,outSpan-.01)),{...pose(leg,outSpan),y:.071}];Object.assign(out,pathPose(path,elapsed/outSpan));}
  if(destination&&elapsed>total-inSpan){const path=[{...pose(leg,total-inSpan),y:.071},...samples(leg,total-inSpan+.01,total),...hubApproach(destination,t.id,destination.mirror).reverse()];Object.assign(out,pathPose(path,(elapsed-total+inSpan)/inSpan));const slot=hubStall(destination,t.id,destination.mirror);if(Math.hypot(out.x-slot.x,out.z-slot.z)<.65){out.yaw=slot.yaw;out.reverse=true;}}
  return {...out,moving:!s.paused&&!s.won};
 }
 if(!t.job)return {...parkingSlot(t.id,E),moving:false,distance:0};
 const gate=hubGate(t.position);if(gate)return {...hubStall(gate,t.id,gate.mirror),moving:false,distance:0};
 return {...networkPoint(t.position||E?.positions.city||[3,8],E,models),y:.071,yaw:lastYaw,moving:false,distance:0};
}
// Hide the whole vehicle before its oriented footprint enters an active site.
// This is presentation only: the authoritative route and paid travel do not change.
export function hiddenByEnterprise(p,bounds){
 const c=Math.abs(Math.cos(p.yaw)),s=Math.abs(Math.sin(p.yaw)),growth=TRUCK_SCALE/.66,x=(c*.62+s*.28)*growth,z=(s*.62+c*.28)*growth;
 return bounds.some(b=>p.x+x>b.min.x&&p.x-x<b.max.x&&p.z+z>b.min.z&&p.z-z<b.max.z);
}
export function roadCells(s,E){const all=[...(E.initialRoadCells||[E.positions.city]).map(p=>typeof p==='string'?p.split(',').map(Number):p),...s.roads.map(k=>k.split(',').map(Number))];return [...new Map(all.map(p=>[key(p),p])).values()];}
export function roadEdges(s,E){
 const cells=roadCells(s,E),set=new Set(cells.map(key)),out=[];
 for(const a of cells)for(const [dx,dy] of E.directions){const b=[a[0]+dx,a[1]+dy];if(set.has(key(b))&&key(a)<key(b)&&(E.canTravelStep?E.canTravelStep(a,b,a,b):E.canStep(a,b)))out.push([a,b]);}return out;
}
// Off-road travel has no permanent or temporary painted track.
export function dirtEdges(){return [];}
