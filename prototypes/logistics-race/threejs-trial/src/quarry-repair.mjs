import * as T from 'three';
import {QUARRY_TONES} from './quarry-tones.mjs';
import {mat} from './world.mjs';
import {gravelMaterial} from './gravel-material.mjs';

export const QUARRY_COLORS={rock:0xb08b57,ledge:0xc4a169,deepRock:0x997750,gravel:0x858a82,machine:0x527f86,cream:0xe7d5b5,frame:0x303d40,red:0xb95339,base:0xbfa981};
export const CONVEYOR={a:new T.Vector3(-.340,-.055,.160),b:new T.Vector3(-.365,.075,-.050),radius:.012,width:.057,thickness:.003};
export function conveyorFrame(){const tangent=CONVEYOR.b.clone().sub(CONVEYOR.a).normalize(),right=new T.Vector3(0,1,0).cross(tangent).normalize(),normal=tangent.clone().cross(right).normalize();return {tangent,right,normal};}
export function conveyorGeometry(){
 const {tangent,right,normal}=conveyorFrame(),{a,b,radius:r,width,thickness}=CONVEYOR,samples=[];
 // A closed capsule: upper working run, end roller, lower return, start roller.
 samples.push({p:a.clone().addScaledVector(normal,r),n:normal.clone()},{p:b.clone().addScaledVector(normal,r),n:normal.clone()});
 for(let i=1;i<=24;i++){const u=i/24*Math.PI,n=normal.clone().multiplyScalar(Math.cos(u)).addScaledVector(tangent,Math.sin(u));samples.push({p:b.clone().addScaledVector(n,r),n});}
 samples.push({p:a.clone().addScaledVector(normal,-r),n:normal.clone().negate()});
 for(let i=1;i<24;i++){const u=i/24*Math.PI,n=normal.clone().multiplyScalar(-Math.cos(u)).addScaledVector(tangent,-Math.sin(u));samples.push({p:a.clone().addScaledVector(n,r),n});}
 const positions=[],indices=[];for(const {p,n} of samples)for(const [side,depth] of [[1,1],[-1,1],[-1,-1],[1,-1]])positions.push(...p.clone().addScaledVector(right,side*width/2).addScaledVector(n,depth*thickness/2).toArray());
 for(let i=0;i<samples.length;i++)for(let k=0;k<4;k++){const a=i*4+k,b=i*4+(k+1)%4,c=((i+1)%samples.length)*4+k,d=((i+1)%samples.length)*4+(k+1)%4;indices.push(a,b,c,b,d,c);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function colorFor(center,tone,normal){const [x,y,z]=center;
 if(y<-.135)return QUARRY_COLORS.base;
 if(x>-.205&&z<.210&&y>-.132){if(normal.y>.6)return QUARRY_COLORS.ledge;return y>.045?QUARRY_COLORS.rock:y>-.04?QUARRY_COLORS.deepRock:QUARRY_COLORS.rock;}
 if((x<-.24&&z<-.055)||(x>-.095&&z>.25&&y<-.075)){return QUARRY_COLORS.gravel;}
 // Small irregular stones on the screen sit inside its two side rails.
 if(x>-.115&&x<.105&&z>.293&&z<.359&&y>-.065&&y<-.009)return QUARRY_COLORS.gravel;
 if(tone==='r')return QUARRY_COLORS.red;
 if(tone==='d')return QUARRY_COLORS.frame;
 if((x<-.12&&z>.18)||(x>-.12&&z>.20&&y>-.1))return QUARRY_COLORS.machine;
 return QUARRY_COLORS.cream;
}
export function repairQuarry(asset){
 const meshes=[];asset.traverse(o=>{if(o.isMesh)meshes.push(o);});if(meshes.length!==1)throw Error('Quarry repair expects the original Mint asset');
 const mesh=meshes[0],source=mesh.geometry,index=source.index,p=source.getAttribute('position'),bounds=new T.Box3().setFromBufferAttribute(p);
 if(index.count/3!==QUARRY_TONES.length||Math.abs(bounds.max.y-.1298828274)>.001)throw Error('Quarry source changed: regenerate surface annotations and conveyor alignment');
 const positions=[],colors=[],uvs=[],groups=[],v=[new T.Vector3(),new T.Vector3(),new T.Vector3()],normal=new T.Vector3(),cross=new T.Vector3();let removed=0;
 for(let i=0;i<index.count;i+=3){const ids=[0,1,2].map(k=>index.getX(i+k));ids.forEach((id,k)=>v[k].fromBufferAttribute(p,id));const center=[0,1,2].map(k=>(v[0].getComponent(k)+v[1].getComponent(k)+v[2].getComponent(k))/3),tone=QUARRY_TONES[i/3];
  // Replace just the old open belt sheet; retain the generated supports/plant.
  if(tone==='d'&&center[0]<-.305&&center[2]<.185&&center[2]>-.08&&center[1]>-.075){removed++;continue;}
  normal.subVectors(v[1],v[0]).cross(cross.subVectors(v[2],v[0])).normalize();const colorId=colorFor(center,tone,normal),color=new T.Color(colorId),materialIndex=colorId===QUARRY_COLORS.gravel?1:0,start=positions.length/3;
  // One surface per face, no coplanar overlay. Metric UVs avoid the stretched
  // baked GLB atlas; project on the dominant plane for steep pile sidewalls.
  const axis=Math.abs(normal.y)>.45?'y':Math.abs(normal.x)>Math.abs(normal.z)?'x':'z';
  for(const point of v){positions.push(point.x,point.y,point.z);colors.push(color.r,color.g,color.b);uvs.push((axis==='x'?point.z:point.x)*10,(axis==='y'?point.z:point.y)*10);}
  const last=groups.at(-1);if(last&&last.materialIndex===materialIndex)last.count+=3;else groups.push({start,count:3,materialIndex});
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
 // User-requested recoloring: homogeneous materials remove blurry baked shading.
 geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
 // Batch the retained faces into two draw groups without duplicating surfaces.
 const order=[];for(let materialIndex=0;materialIndex<2;materialIndex++){const start=order.length;for(const g of groups)if(g.materialIndex===materialIndex)for(let i=g.start;i<g.start+g.count;i++)order.push(i);geometry.addGroup(start,order.length-start,materialIndex);}geometry.setIndex(order);
 mesh.material=[new T.MeshStandardMaterial({vertexColors:true,roughness:.88,side:T.DoubleSide}),gravelMaterial()];mesh.name='Colored quarry, gravel and processing plant';
 const conveyor=new T.Group();conveyor.name='Closed conveyor belt and rollers';asset.add(conveyor);const belt=new T.Mesh(conveyorGeometry(),mat(QUARRY_COLORS.frame));belt.name='Continuous upper and lower belt';conveyor.add(belt);
 const rollers=[];const {right,normal:up}=conveyorFrame();for(const [i,center] of [CONVEYOR.a,CONVEYOR.b].entries()){
  const roller=new T.Mesh(new T.CylinderGeometry(CONVEYOR.radius-CONVEYOR.thickness/2,CONVEYOR.radius-CONVEYOR.thickness/2,CONVEYOR.width+.008,24),mat(QUARRY_COLORS.cream));roller.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),right);roller.position.copy(center);roller.name=`Conveyor roller ${i+1}`;conveyor.add(roller);
  rollers.push(roller);
  for(const side of [-1,1]){const cap=new T.Mesh(new T.CylinderGeometry(.005,.005,.005,10),mat(QUARRY_COLORS.red));cap.quaternion.copy(roller.quaternion);cap.position.copy(center).addScaledVector(right,side*(CONVEYOR.width/2+.006));conveyor.add(cap);}
 }
 // Side rails and bearing blocks bind both drums to the same chassis instead
 // of leaving the new loop floating above unrelated imported supports.
 const bar=(name,a,b,w,d,color)=>{const delta=b.clone().sub(a),o=new T.Mesh(new T.BoxGeometry(w,delta.length(),d),mat(color));o.name=name;o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());conveyor.add(o);return o;};
 const connections=[];
 for(const side of [-1,1]){const offset=right.clone().multiplyScalar(side*(CONVEYOR.width/2+.008));bar('Conveyor chassis rail',CONVEYOR.a.clone().add(offset),CONVEYOR.b.clone().add(offset),.009,.012,QUARRY_COLORS.frame);
  for(const endpoint of [CONVEYOR.a,CONVEYOR.b]){const top=endpoint.clone().add(offset),bottom=top.clone();bottom.y=-.132;bar('Conveyor support',bottom,top,.009,.009,QUARRY_COLORS.cream);}
 }
 // Feed lip overlaps the crusher outlet; discharge chute reaches the existing
 // heap. Contact anchors are snapped to the actual retained triangle surface.
 const surfacePoint=target=>{let best=Infinity,result=null;const tri=new T.Triangle(),q=new T.Vector3(),p=geometry.getAttribute('position');for(let i=0;i<p.count;i+=3){tri.setFromAttributeAndIndices(p,i,i+1,i+2);tri.closestPointToPoint(target,q);const d=q.distanceToSquared(target);if(d<best){best=d;result=q.clone();}}return result;};
 for(const [name,end,target] of [['Crusher feed lip',CONVEYOR.a,new T.Vector3(-.34,-.047,.205)]]){
  const anchor=surfacePoint(target),tip=end.clone().addScaledVector(up,CONVEYOR.radius+CONVEYOR.thickness/2),direction=anchor.clone().sub(tip).normalize();
  const part=bar(name,tip.clone().addScaledVector(direction,-.004),anchor.clone().addScaledVector(direction,.004),.047,.004,QUARRY_COLORS.cream);connections.push({part,anchor,tip});
 }
 return {asset,mesh,belt,conveyor,rollers,removed,connections};
}
