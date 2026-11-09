import * as T from 'three';
import {box,C,mat} from './world.mjs';

// Articulation edits the existing Mint pumpjack; the authored skid, A-frame,
// beam, horsehead, motor and their UVs remain the imported asset.
export const PUMP={pivot:{x:-.075,y:.225},crank:{x:.23,y:-.075},arm:.305,radius:.070,link:Math.hypot(.07,.30),period:4,rodX:-.475,headRadius:.4,rodRadius:.0065,headInsertion:.018};
// Fixed service connection on the side of the original black skid, not the rod.
export const PUMP_BASE_PORT={x:.125,y:-.37109375,z:.1337890625};
function clip(poly,axis,bound,sign){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p[axis]-bound)*sign,db=(b.p[axis]-bound)*sign;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({p:a.p.map((x,k)=>x+(b.p[k]-x)*t),n:a.n.map((x,k)=>x+(b.n[k]-x)*t),uv:a.uv.map((x,k)=>x+(b.uv[k]-x)*t)});}}return out;}
function carve(poly,planes){let inside=poly;const outside=[];for(const [axis,bound,sign] of planes){const piece=clip(inside,axis,bound,-sign);if(piece.length>=3)outside.push(piece);inside=clip(inside,axis,bound,sign);if(inside.length<3)return {inside:[],outside};}return {inside,outside};}
function geometry(polys,offset={x:0,y:0,z:0}){const p=[],n=[],uv=[];for(const poly of polys)for(let i=1;i+1<poly.length;i++){const tri=[poly[0],poly[i],poly[i+1]],a=new T.Vector3(...tri[0].p),b=new T.Vector3(...tri[1].p),c=new T.Vector3(...tri[2].p);if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)continue;for(const v of tri){p.push(v.p[0]-offset.x,v.p[1]-offset.y,v.p[2]-(offset.z||0));const nn=new T.Vector3(...v.n).normalize();n.push(nn.x,nn.y,nn.z);uv.push(...v.uv);}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeBoundingBox();g.computeBoundingSphere();return g;}

export function pumpPose(time){
 const phase=(time/PUMP.period%1)*Math.PI*2,c={x:PUMP.crank.x+PUMP.radius*Math.cos(phase),y:PUMP.crank.y+PUMP.radius*Math.sin(phase)},dx=c.x-PUMP.pivot.x,dy=c.y-PUMP.pivot.y,d=Math.hypot(dx,dy);
 const along=(PUMP.arm**2-PUMP.link**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,PUMP.arm**2-along**2)),ux=dx/d,uy=dy/d;
 const joint={x:PUMP.pivot.x+along*ux-h*uy,y:PUMP.pivot.y+along*uy+h*ux},angle=Math.atan2(joint.y-PUMP.pivot.y,joint.x-PUMP.pivot.x);
 return {phase,angle,crankPin:c,beamPin:joint,rodTop:.025-PUMP.headRadius*angle};
}
function rod(parent,name,radius,color){const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,1,8),mat(color));mesh.name=name;parent.add(mesh);return mesh;}
function connect(mesh,a,b){mesh.position.copy(a).add(b).multiplyScalar(.5);const delta=b.clone().sub(a);mesh.scale.y=delta.length();mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());}

export function articulatePumpjack(asset){
 const imported=[];asset.traverse(o=>{if(o.isMesh)imported.push(o);});if(imported.length!==1)throw Error('Pump rig expects the original single-mesh Mint asset');
 const source=imported[0],g=source.geometry,pos=g.getAttribute('position'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv'),index=g.index,bounds=new T.Box3().setFromBufferAttribute(pos);
 if(Math.abs(bounds.max.y-.3974609375)>.001||Math.abs(bounds.max.x-.4990234375)>.001)throw Error('Pumpjack source changed: update articulation');
 const stationary=[],moving=[];
 const regions=[
  // Remove the original fused black rod before partitioning the horsehead.
  {target:null,planes:[[0,-.445,-1],[1,-.285,1],[1,.125,-1]]},
  {target:null,planes:[[0,-.470,-1],[1,-.285,1],[1,.270,-1]]},
  {target:moving,planes:[[1,.242,1]]},
  // Beam underside/braces outside the narrow A-frame bearing belong to the
  // moving assembly too; leaving these strips fixed made them cross the beam.
  {target:moving,planes:[[0,.02,1],[1,.19,1]]},
  {target:moving,planes:[[0,-.15,-1],[1,.19,1]]},
  {target:moving,planes:[[0,-.370,-1],[1,.095,1]]},
  {target:moving,planes:[[0,.166,1],[1,.175,1]]},
  // Remove fused polished rod, pitmans and crank. Replace only these joints/links.
  {target:null,planes:[[0,-.445,-1],[1,-.285,1],[1,.125,-1]]},
  {target:null,planes:[[0,.110,1],[0,.395,-1],[1,-.205,1],[1,.175,-1]]}
 ];
 for(let i=0;i<(index?.count||pos.count);i+=3){const tri=Array.from({length:3},(_,k)=>{const j=index?index.getX(i+k):i+k;return {p:[pos.getX(j),pos.getY(j),pos.getZ(j)],n:[normal.getX(j),normal.getY(j),normal.getZ(j)],uv:[uv.getX(j),uv.getY(j)]};});let remainder=[tri];for(const region of regions){const next=[];for(const poly of remainder){const {inside,outside}=carve(poly,region.planes);if(inside.length>=3&&region.target)region.target.push(inside);next.push(...outside);}remainder=next;}stationary.push(...remainder);}
 source.geometry=geometry(stationary);source.name='Stationary pump skid, A-frame and motor';
 const beam=new T.Group();beam.name='Walking beam pivot';beam.position.set(PUMP.pivot.x,PUMP.pivot.y,0);asset.add(beam);
 // Remove the old head including its fused thin cable/groove. Repair only that
 // component as a closed solid; keep the imported walking beam and frame.
 const beamShell=moving.map(poly=>clip(poly,0,-.370,1)).filter(poly=>poly.length>=3);
 const importedBeam=new T.Mesh(geometry(beamShell,PUMP.pivot),source.material);importedBeam.name='Imported walking beam';beam.add(importedBeam);
 const profile=new T.Shape(),x=v=>v-PUMP.pivot.x,y=v=>v-PUMP.pivot.y;
 profile.moveTo(x(-.397),y(.392));
 profile.bezierCurveTo(x(-.435),y(.414),x(-.484),y(.347),x(-.492),y(.273));
 profile.bezierCurveTo(x(-.507),y(.204),x(-.486),y(.128),x(-.455),y(.102));
 profile.lineTo(x(-.416),y(.102));
 profile.bezierCurveTo(x(-.381),y(.168),x(-.362),y(.303),x(-.397),y(.392));profile.closePath();
 const headGeometry=new T.ExtrudeGeometry(profile,{depth:.064,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:2,curveSegments:16});headGeometry.translate(0,0,-.032);
 const horsehead=new T.Mesh(headGeometry,new T.MeshStandardMaterial({color:0xb4492f,roughness:.8}));horsehead.name='Solid orange horsehead without cable stub';beam.add(horsehead);
 const drive=new T.Group();drive.name='Crankshaft and counterweights';drive.position.set(PUMP.crank.x,PUMP.crank.y,0);asset.add(drive);
 // Both pitmans pivot on one physical through-pin carried by the beam.
 const beamAxle=rod(beam,'Beam through-pin',.014,C.ink);connect(beamAxle,new T.Vector3(PUMP.arm,0,-.14),new T.Vector3(PUMP.arm,0,.14));
 box(beam,.05,.045,.12,PUMP.arm,.012,0,C.cream,true);
 const pivotAxle=rod(asset,'Walking beam bearing',.022,C.ink);connect(pivotAxle,new T.Vector3(PUMP.pivot.x,PUMP.pivot.y,-.10),new T.Vector3(PUMP.pivot.x,PUMP.pivot.y,.10));
 const guides=[];
 const rodAnchor=new T.Object3D();rodAnchor.name='Solid rod anchor inside horsehead';rodAnchor.position.set(-.365,.025,0);beam.add(rodAnchor);
 // Compact shaft housing conceals the original welded connection surfaces.
 box(asset,.17,.08,.15,.23,-.225,0,C.ink,true);
 box(asset,.075,.15,.085,.23,-.15,0,C.ink,true);
 const axle=rod(asset,'Fixed crankshaft',.025,C.ink);connect(axle,new T.Vector3(.23,-.075,-.12),new T.Vector3(.23,-.075,.12));
 const pitmans=[],bridles=[],counterweights=[];
 for(const side of [-1,1]){
  counterweights.push(box(drive,.10,.085,.026,-.023,0,side*.09,C.red,true));
  const arm=box(drive,.105,.023,.023,.035,0,side*.09,C.red,true);
  const pin=new T.Mesh(new T.CylinderGeometry(.012,.012,.09,10),mat(C.ink));pin.rotation.x=Math.PI/2;pin.position.set(.07,0,side*.09);drive.add(pin);
  pitmans.push({mesh:rod(asset,'Articulated pitman',.005,C.ink),z:side*.125});

 }
 const rodContact=new T.Object3D();rodContact.name='Rod contact on orange head';asset.add(rodContact);
 const headTriangles=[],hp=horsehead.geometry.getAttribute('position');for(let i=0;i<hp.count;i+=3)headTriangles.push(new T.Triangle().setFromAttributeAndIndices(hp,i,i+1,i+2));
 // One solid shaft reaches the orange head directly; no short cable or adapter.
 const polished=rod(asset,'Continuous solid well rod',PUMP.rodRadius,0x000000);
 const update=time=>{const pose=pumpPose(time);beam.rotation.z=pose.angle;drive.rotation.z=pose.phase;for(const link of pitmans)connect(link.mesh,new T.Vector3(pose.crankPin.x,pose.crankPin.y,link.z),new T.Vector3(pose.beamPin.x,pose.beamPin.y,link.z));
  // Find contact on the actual moving head, then insert the same shaft into it.
  beam.updateMatrix();const top=rodAnchor.position.clone().applyMatrix4(beam.matrix);
  const bottom=new T.Vector3(PUMP.rodX,-.35,0),inverse=beam.matrix.clone().invert(),localBottom=bottom.clone().applyMatrix4(inverse),localTop=rodAnchor.position.clone(),ray=new T.Ray(localBottom,localTop.clone().sub(localBottom).normalize()),hit=new T.Vector3();let nearest=Infinity;
  for(const tri of headTriangles)if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,hit)){const distance=hit.distanceToSquared(localBottom);if(distance<nearest){nearest=distance;top.copy(hit).applyMatrix4(beam.matrix);}}
  rodContact.position.copy(top);top.addScaledVector(top.clone().sub(bottom).normalize(),PUMP.headInsertion);connect(polished,top,bottom);


  return pose;
 };
 update(0);return {asset,beam,horsehead,drive,stationary:source,polished,bridles,pitmans,counterweights,guides,rodAnchor,rodContact,beamAxle,pivotAxle,update};
}


