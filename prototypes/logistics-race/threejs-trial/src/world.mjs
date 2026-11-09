import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {ROAD_WIDTH} from './motion.mjs';
export const C={cream:0xeee5d3,light:0xf5eedd,stone:0xb9ae99,ink:0x343c37,red:0xbe6048,green:0x8c9276,glass:0x394b49};
export const SITE_PAD={y:.045,height:.035};
export const SITE_SURFACE_Y=SITE_PAD.y+SITE_PAD.height/2;
const materials=new Map();
export function mat(color){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.85}));return materials.get(color);}
const cube=new T.BoxGeometry(1,1,1);
export function box(parent,w,h,d,x,y,z,color,rounded=false){
 const mesh=new T.Mesh(rounded?new RoundedBoxGeometry(w,h,d,2,Math.min(.035,w/8,h/8,d/8)):cube,mat(color));
 if(!rounded)mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function createRoute(){
 const route=new T.CurvePath(),v=(x,z)=>new T.Vector3(x,.08,z),line=(ax,az,bx,bz)=>route.add(new T.LineCurve3(v(ax,az),v(bx,bz))),bend=(ax,az,cx,cz,bx,bz)=>route.add(new T.QuadraticBezierCurve3(v(ax,az),v(cx,cz),v(bx,bz)));
 line(-2.8,3.5,4.7,3.5);bend(4.7,3.5,6,3.5,6,2.2);line(6,2.2,6,-2.2);bend(6,-2.2,6,-3.5,4.7,-3.5);line(4.7,-3.5,-4.7,-3.5);bend(-4.7,-3.5,-6,-3.5,-6,-2.2);line(-6,-2.2,-6,2.2);bend(-6,2.2,-6,3.5,-4.7,3.5);line(-4.7,3.5,-2.8,3.5);
 return route;
}
export function ribbon(curve,width,y,material){
 const vertices=[],indices=[],segments=480;
 for(let i=0;i<=segments;i++){const t=i/segments,p=curve.getPointAt(t),dir=curve.getTangentAt(t),n=new T.Vector3(-dir.z,0,dir.x).normalize().multiplyScalar(width/2);vertices.push(p.x+n.x,y,p.z+n.z,p.x-n.x,y,p.z-n.z);if(i<segments){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new T.Mesh(geometry,material);mesh.receiveShadow=true;return mesh;
}
export function buildGround(scene,route){
 box(scene,16.5,.35,11.5,0,-.2,0,0xcac1aa,true);box(scene,16.4,.10,11.4,0,-.025,0,0xe8e0cb,true);
 // Flat parcels, raised road shoulders, asphalt and centre markings share one curve.
 box(scene,6,SITE_PAD.height,5.1,-1.7,SITE_PAD.y,0,0xd5d2bd,true);
 scene.add(ribbon(route,ROAD_WIDTH+.30,.055,mat(C.light)),ribbon(route,ROAD_WIDTH+.10,.067,mat(C.stone)),ribbon(route,ROAD_WIDTH,.08,mat(C.ink)));
 const length=route.getLength();for(let distance=0;distance<length;distance+=1.0){const t=distance/length,p=route.getPointAt(t),d=route.getTangentAt(t),stripe=box(scene,.46,.008,.035,p.x,.089,p.z,C.light);stripe.rotation.y=-Math.atan2(d.z,d.x);}
 // Shared paved loading apron joins the factory to the road without a floating icon base.
 box(scene,5.4,.025,1.4,-1.7,.06,2.24,0xc1bfac,true);
 for(const x of [-3.4,-1.6,.2])box(scene,.035,.008,1.24,x,.082,2.24,0xf0e5cc);
 for(const x of [-4.35,.85]){box(scene,.12,.48,.12,x,.29,1.75,C.ink);box(scene,.13,.12,.13,x,.47,1.75,C.red);}
 const siteProps=new T.Group();scene.add(siteProps);for(let i=0;i<5;i++){const x=.7+(i%2)*.55,z=-.7-Math.floor(i/2)*.6;box(siteProps,.48,.45,.48,x,.30,z,C.cream,true);box(siteProps,.50,.065,.50,x,.31,z,C.ink);}
 // A few low-poly support props establish the block-built language of the map.
 for(const [x,z,h] of [[-7.1,-4.6,1],[-7.2,.5,.7],[7.3,4.7,.7],[3.2,-4.7,.9]]){box(scene,.13,.4,.13,x,.2,z,0x8a7d68);box(scene,.7,h,.7,x,.4+h/2,z,C.green,true);}
 // Separate flat service parcel for the imported pumpjack, clear of the traffic lane.
 box(scene,2.15,.035,3.8,3,.045,-.2,0xd5d2bd,true);
 return siteProps;
}
export function buildTruck(){
 const truck=new T.Group(),wheels=[],steering=[];
 box(truck,1.63,.12,.57,0,.28,0,C.ink);box(truck,1.04,.57,.64,-.3,.63,0,C.cream,true);box(truck,.55,.48,.62,.56,.56,0,C.cream,true);
 for(const side of [-1,1]){
  box(truck,1.02,.055,.012,-.30,.74,side*.326,C.red);box(truck,.31,.22,.012,.58,.64,side*.316,C.glass,true);
  box(truck,.22,.045,.07,.60,.31,side*.34,C.ink);box(truck,.08,.025,.018,.35,.55,side*.323,C.ink);
 }
 box(truck,.015,.20,.51,.845,.65,0,C.glass);box(truck,.05,.12,.40,.86,.39,0,C.ink);box(truck,.075,.05,.68,.88,.31,0,C.stone);
 for(const side of [-1,1])box(truck,.02,.05,.10,.89,.44,side*.22,C.light);
 for(const x of [-.65,-.05,.60])for(const side of [-1,1]){
  const hub=new T.Group();hub.position.set(x,.18,side*.31);truck.add(hub);if(x>0)steering.push(hub);
  const wheel=new T.Group(),tire=new T.Mesh(new T.CylinderGeometry(.18,.18,.15,12),mat(C.ink));tire.rotation.x=Math.PI/2;wheel.add(tire);
  const cap=new T.Mesh(new T.CylinderGeometry(.095,.095,.16,10),mat(C.stone));cap.rotation.x=Math.PI/2;wheel.add(cap);
  for(let i=0;i<3;i++){const spoke=box(wheel,.15,.025,.165,0,0,0,C.cream);spoke.rotation.z=i*Math.PI/3;}
  wheel.traverse(o=>{if(o.isMesh)o.castShadow=true;});hub.add(wheel);wheels.push(wheel);
 }
 const rear=box(truck,.02,.36,.53,-.83,.6,0,C.stone);for(const side of [-1,1])box(truck,.025,.04,.1,-.85,.37,side*.23,C.red);
 return {group:truck,wheels,steering};
}
