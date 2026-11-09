// Presentation-only dimensions. Engine cells and saved routes are unchanged.
export const HUB={scale:1.15,width:12.8,depth:11.8,parkingX:2.83,offsetZ:7.9,baseY:.042,parkingY:.215,roadY:.202,laneX:2.7075};
export const HUB_SLOTS=Array.from({length:8},(_,i)=>({id:i+1,x:HUB.parkingX+(i%2?1:-1)*1.55,z:1.65+Math.floor(i/2)*.87,yaw:i%2?Math.PI:0}));
export function placeHub(gate,mirror=false){return {x:gate.x-(mirror?-1:1)*HUB.parkingX*HUB.scale,z:gate.z+(mirror==='rotate'?-1:1)*HUB.offsetZ,width:HUB.width*HUB.scale,depth:HUB.depth*HUB.scale};}
export function hubPoint(gate,x,z,surface=HUB.roadY,mirror=false){const p=placeHub(gate,mirror);return {x:p.x+(mirror?-1:1)*x*HUB.scale,z:p.z+(mirror==='rotate'?-1:1)*z*HUB.scale,y:HUB.baseY+surface*HUB.scale+.008};}
export function hubStall(gate,id,mirror=false){const sign=mirror?-1:1,zsign=mirror==='rotate'?-1:1,s=HUB_SLOTS[id-1];if(s)return {...hubPoint(gate,s.x,s.z,HUB.parkingY,mirror),yaw:mirror==='rotate'?Math.PI+s.yaw:mirror?Math.PI-s.yaw:s.yaw};
 // Additional trucks get a separate nearby apron; eight is not a gameplay cap.
 const n=Math.max(0,id-9),p=placeHub(gate,mirror);return {x:p.x+sign*(p.width/2+1.2+Math.floor(n/4)*1.6),z:p.z+zsign*(1.55+(n%4)*1.12),y:.071,yaw:mirror?0:Math.PI};
}
export function hubApproach(gate,id,mirror=false){
 const sign=mirror?-1:1,zsign=mirror==='rotate'?-1:1,slot=hubStall(gate,id,mirror),p=placeHub(gate,mirror),point=(x,z,surface=HUB.roadY)=>hubPoint(gate,x,z,surface,mirror),exit=point(HUB.laneX,-5.18);
 if(id>8)return [slot,{x:slot.x-.8*sign,z:slot.z,y:.071},{x:slot.x-.8*sign,z:gate.z+1.94*zsign,y:.071},{x:gate.x+.95*sign,z:gate.z+.10*zsign,y:.071},{...gate,y:.071}];
 return [slot,point(HUB.parkingX,(slot.z-p.z)/(HUB.scale*zsign),HUB.parkingY),point(HUB.parkingX,.65),point(HUB.laneX,.65),exit,{...gate,y:.071}];
}

// Rounded path sampling keeps the vehicle on the access lane through each bend.
export function pathPose(points,u){
 const clean=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)>1e-6),samples=[clean[0]];
 for(let i=1;i<clean.length-1;i++){
  const a=clean[i-1],b=clean[i],c=clean[i+1],ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),cut=Math.min(.25,ab*.2,bc*.2),mix=(p,q,t)=>({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t,y:(p.y??.071)+((q.y??.071)-(p.y??.071))*t}),start=mix(b,a,cut/ab),end=mix(b,c,cut/bc);samples.push(start);
  for(let j=1;j<=8;j++){const t=j/8;samples.push(mix(mix(start,b,t),mix(b,end,t),t));}
 }
 samples.push(clean.at(-1));const lengths=samples.slice(1).map((p,i)=>Math.hypot(p.x-samples[i].x,p.z-samples[i].z)),total=lengths.reduce((a,b)=>a+b,0);let d=Math.max(0,Math.min(1,u))*total;
 for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1){const a=samples[i],b=samples[i+1],t=lengths[i]?d/lengths[i]:0;return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:(a.y??.071)+((b.y??.071)-(a.y??.071))*t,yaw:-Math.atan2(b.z-a.z,b.x-a.x)};}d-=lengths[i];}
}
