import * as T from 'three';
import {CONVEYOR,conveyorFrame,QUARRY_COLORS as C} from './quarry-repair.mjs';
import {mat} from './world.mjs';
export const QUARRY_MOTION={beltSpeed:.075,shaftSpeed:4.6,wheelX:-.24414,wheelY:-.05078,wheelZ:[.189,.356]};
const frame=conveyorFrame(),length=CONVEYOR.a.distanceTo(CONVEYOR.b),arc=Math.PI*CONVEYOR.radius;
export const BELT_LENGTH=2*length+2*arc;
export function beltPose(distance){
 let d=((distance%BELT_LENGTH)+BELT_LENGTH)%BELT_LENGTH;const {a,b,radius:r}=CONVEYOR,{tangent:t,right,normal:n}=frame;let p,normal,tangent;
 if(d<length){p=a.clone().addScaledVector(t,d).addScaledVector(n,r);normal=n.clone();tangent=t.clone();}
 else if((d-=length)<arc){const u=d/r;normal=n.clone().multiplyScalar(Math.cos(u)).addScaledVector(t,Math.sin(u));tangent=t.clone().multiplyScalar(Math.cos(u)).addScaledVector(n,-Math.sin(u));p=b.clone().addScaledVector(normal,r);}
 else if((d-=arc)<length){p=b.clone().addScaledVector(t,-d).addScaledVector(n,-r);normal=n.clone().negate();tangent=t.clone().negate();}
 else{d-=length;const u=d/r;normal=n.clone().multiplyScalar(-Math.cos(u)).addScaledVector(t,-Math.sin(u));tangent=t.clone().multiplyScalar(-Math.cos(u)).addScaledVector(n,Math.sin(u));p=a.clone().addScaledVector(normal,r);}
 return {position:p,normal,tangent,right};
}
export function gravelPose(time,offset=0,lane=0){
 const carry=length/QUARRY_MOTION.beltSpeed,fall=.62,total=carry+fall,age=((time+offset)%total+total)%total;
 const start=CONVEYOR.a.clone().addScaledVector(frame.normal,CONVEYOR.radius+.006).addScaledVector(frame.right,lane);
 if(age<=carry)return start.addScaledVector(frame.tangent,age*QUARRY_MOTION.beltSpeed);
 const u=(age-carry)/fall,end=start.addScaledVector(frame.tangent,length),heap=new T.Vector3(-.36,-.106,-.127).addScaledVector(frame.right,lane*.5);
 return end.lerp(heap,u).addScaledVector(new T.Vector3(0,1,0),.045*4*u*(1-u));
}
function partition(mesh){
 const g=mesh.geometry,p=g.getAttribute('position'),index=g.index,attributes=['position','normal','color','uv'],buckets=Array.from({length:4},()=>[[],[]]);
 for(const group of g.groups)for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),c=[0,1,2].map(k=>ids.reduce((sum,id)=>sum+p.getComponent(id,k)/3,0));let bucket=0;
  const radial=Math.hypot(c[0]-QUARRY_MOTION.wheelX,c[1]-QUARRY_MOTION.wheelY);
  if(group.materialIndex===0&&radial<.055&&c[2]>.171&&c[2]<.211)bucket=1;
  else if(group.materialIndex===0&&radial<.055&&c[2]>.336&&c[2]<.380)bucket=2;
  else if(group.materialIndex===1&&c[0]>-.115&&c[0]<.105&&c[2]>.293&&c[2]<.359&&c[1]>-.065&&c[1]<-.009)bucket=3;
  // Remove only the old fused crushing core, which is replaced by its moving roll.
  else if(c[0]>-.285&&c[0]<-.215&&c[2]>.215&&c[2]<.336&&c[1]>-.09)continue;
  buckets[bucket][group.materialIndex].push(...ids);
 }
 function make(bucket,pivot=new T.Vector3()){
  const geometry=new T.BufferGeometry(),values=Object.fromEntries(attributes.map(name=>[name,[]]));let count=0;
  for(let material=0;material<2;material++){const start=count;for(const id of buckets[bucket][material]){for(const name of attributes){const a=g.getAttribute(name);for(let k=0;k<a.itemSize;k++)values[name].push(a.getComponent(id,k)-(name==='position'?pivot.getComponent(k):0));}count++;}if(count>start)geometry.addGroup(start,count-start,material);}
  for(const name of attributes)geometry.setAttribute(name,new T.Float32BufferAttribute(values[name],g.getAttribute(name).itemSize));geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
 }
 mesh.geometry=make(0);
 const wheels=QUARRY_MOTION.wheelZ.map((z,i)=>{const pivot=new T.Vector3(QUARRY_MOTION.wheelX,QUARRY_MOTION.wheelY,z),wheel=new T.Mesh(make(i+1,pivot),mesh.material);wheel.name='Imported crusher flywheel '+(i+1);wheel.position.copy(pivot);mesh.parent.add(wheel);return wheel;});
 const screen=new T.Mesh(make(3),mesh.material);screen.name='Vibrating screen gravel';mesh.parent.add(screen);return {wheels,screen};
}
export function animateQuarry(repaired){
 const {asset,conveyor,rollers}=repaired,{wheels,screen}=partition(repaired.mesh),moving=new T.Group();moving.name='Working quarry mechanisms';asset.add(moving);
 const markers=Array.from({length:20},()=>{const m=new T.Mesh(new T.BoxGeometry(CONVEYOR.width*.94,.0015,.004),mat(0x82908b));m.name='Moving belt joint';conveyor.add(m);return m;});
 const rollerBases=rollers.map(r=>r.quaternion.clone());for(const roller of rollers){const stripe=new T.Mesh(new T.BoxGeometry(.014,.002,.002),mat(C.red));stripe.position.y=(CONVEYOR.width+.008)/2+.001;roller.add(stripe);}
 const rotor=new T.Group();rotor.name='Toothed crushing roll';rotor.position.set(QUARRY_MOTION.wheelX,QUARRY_MOTION.wheelY,.275);moving.add(rotor);
 const drum=new T.Mesh(new T.CylinderGeometry(.036,.036,.129,16),mat(C.frame));drum.rotation.x=Math.PI/2;rotor.add(drum);
 for(let i=0;i<10;i++){const tooth=new T.Mesh(new T.BoxGeometry(.011,.007,.123),mat(0xb8baa5));const angle=i*Math.PI/5;tooth.position.set(-Math.sin(angle)*.036,Math.cos(angle)*.036,0);tooth.rotation.z=angle;rotor.add(tooth);}
 const jaw=new T.Mesh(new T.BoxGeometry(.012,.070,.113),mat(C.machine));jaw.name='Reciprocating crusher jaw';jaw.position.set(-.290,-.05,.275);moving.add(jaw);
 const stones=new T.InstancedMesh(new T.IcosahedronGeometry(.0045,0),new T.MeshStandardMaterial({color:0x969b8d,roughness:.95}),36);stones.name='Gravel moving on belt and falling to heap';stones.instanceMatrix.setUsage(T.DynamicDrawUsage);stones.frustumCulled=false;moving.add(stones);
 const matrix=new T.Matrix4(),q=new T.Quaternion(),scale=new T.Vector3(),basis=new T.Matrix4(),turn=new T.Quaternion();
 function update(time){const travel=time*QUARRY_MOTION.beltSpeed,shaft=-time*QUARRY_MOTION.shaftSpeed;
  for(const [i,m] of markers.entries()){const pose=beltPose(travel+i/markers.length*BELT_LENGTH);m.position.copy(pose.position).addScaledVector(pose.normal,CONVEYOR.thickness/2+.0008);basis.makeBasis(pose.right,pose.normal,pose.tangent);m.quaternion.setFromRotationMatrix(basis);}
  for(let i=0;i<rollers.length;i++){turn.setFromAxisAngle(new T.Vector3(0,1,0),-travel/(CONVEYOR.radius-CONVEYOR.thickness/2));rollers[i].quaternion.copy(rollerBases[i]).multiply(turn);}
  for(const wheel of wheels)wheel.rotation.z=shaft;rotor.rotation.z=shaft;jaw.position.x=-.290+.0035*Math.sin(-shaft);screen.position.y=.0013*Math.sin(time*33);screen.position.x=.0005*Math.cos(time*33);
  for(let i=0;i<stones.count;i++){const point=gravelPose(time,i*.107,(i%3-1)*.015);q.setFromEuler(new T.Euler(i*.8+time*.5,i*1.3,0));scale.setScalar(.72+(i%5)*.14);matrix.compose(point,q,scale);stones.setMatrixAt(i,matrix);}stones.instanceMatrix.needsUpdate=true;
 }
 update(0);return {asset,wheels,screen,rotor,jaw,markers,stones,rollers,update};
}
