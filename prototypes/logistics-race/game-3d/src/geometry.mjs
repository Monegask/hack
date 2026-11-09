import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CELL,world,ROAD_WIDTH,key,roadCells,roadEdges,dirtEdges,parkingSlot,networkPoint,visualCell} from './state.mjs';
import {HUB,hubPoint,hubApproach} from './hub-layout.mjs';
const colors=new Map();
export function material(color){if(!colors.has(color))colors.set(color,new T.MeshStandardMaterial({color,roughness:.88}));return colors.get(color);}
export class Batch{
 constructor(){this.groups=new Map();}
 add(g,color){if(!this.groups.has(color))this.groups.set(color,[]);this.groups.get(color).push(g);}
 box(w,h,d,x,y,z,color){this.add(new T.BoxGeometry(w,h,d).translate(x,y,z),color);}
 strip(a,b,width,y,color,height=.014){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(!len)return;this.add(new T.BoxGeometry(len,height,width).rotateY(-Math.atan2(dz,dx)).translate((a.x+b.x)/2,y,(a.z+b.z)/2),color);}
 disc(p,r,y,color){this.add(new T.CylinderGeometry(r,r,.014,16).translate(p.x,y,p.z),color);}
 build(){const group=new T.Group();for(const [color,list] of this.groups){const g=mergeGeometries(list);for(const old of list)old.dispose();const mesh=new T.Mesh(g,material(color));mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);}return group;}
}
export function replace(parent,name,group){const old=parent.getObjectByName(name);if(old){old.traverse(o=>{if(o.isMesh||o.isLine)o.geometry.dispose();if(o.isLine)o.material.dispose();});old.removeFromParent();}group.name=name;parent.add(group);}
export function roads(s,E,models){
 const point=p=>networkPoint(p,E,models);
 const b=new Batch(),edges=roadEdges(s,E);for(const p of roadCells(s,E)){const w=point(p);b.disc(w,ROAD_WIDTH/2+.12,.041,0xc4bdab);b.disc(w,ROAD_WIDTH/2,.061,0x343c37);}
 for(const [aa,bb] of edges){const a=point(aa),c=point(bb);b.strip(a,c,ROAD_WIDTH+.24,.044,0xc4bdab);b.strip(a,c,ROAD_WIDTH,.063,0x343c37);const d=new T.Vector3(c.x-a.x,0,c.z-a.z),len=d.length();d.normalize();for(let at=.25;at<len-.1;at+=.65){b.strip({x:a.x+d.x*at,z:a.z+d.z*at},{x:a.x+d.x*(at+.30),z:a.z+d.z*(at+.30)},.026,.077,0xeee5d3);}}
 // Connected sites get a coherent paved yard. Its centre is the loading point;
 // the old gate-to-model spur no longer protrudes past the building.
 if(E.travelNodes)for(const node of E.travelNodes){if(!node.hub&&s.roads.includes(key(node.position)))b.box(3.6,.025,3.0,node.point.x,.052,node.point.z,0x343c37);}
 else for(const [id,p] of Object.entries(E.positions))if(id!=='city'&&id!=='center'&&s.roads.includes(key(p))){const at=world(visualCell(id,E,models||{}));b.box(3.6,.025,3.0,at.x,.052,at.z,0x343c37);}
 return b.build();
}
export function dirt(s,E){const b=new Batch();for(const [aa,bb] of dirtEdges(s,E)){const a=world(aa),c=world(bb);b.strip(a,c,ROAD_WIDTH,.027,0xd0c2a7,.009);b.strip(a,c,ROAD_WIDTH*.54,.034,0xe0d2b7,.006);}return b.build();}
export function pipes(s,E,anchors={}){const b=new Batch();
 for(const [a,c] of E.pipeEdges(s)){const p=world(a),q=world(c),v=new T.Vector3(q.x-p.x,0,q.z-p.z),len=v.length(),g=new T.CylinderGeometry(.075,.075,len,8);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));g.translate((p.x+q.x)/2,.20,(p.z+q.z)/2+.78);b.add(g,0x767669);for(const u of [.17,.83])b.box(.13,.15,.14,p.x+(q.x-p.x)*u,.08,p.z+(q.z-p.z)*u+.78,0xa99f8b);}
 // Service connections meet the fixed black skid at its actual world height.
 for(const id of ['oil','oil2'])if(anchors[id]&&(id==='oil'||s.sites.oil2.active&&s.pipeCells.includes(key(E.positions.oil2)))){
  const a=anchors[id],q=world(E.positions[id]);q.z+=.78;q.y=.20;const v=new T.Vector3(q.x-a.x,q.y-a.y,q.z-a.z),len=v.length();if(len>.01){const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()),g=new T.CylinderGeometry(.075,.075,len,8);g.applyQuaternion(rotation);g.translate((a.x+q.x)/2,(a.y+q.y)/2,(a.z+q.z)/2);b.add(g,0x767669);b.add(new T.CylinderGeometry(.1,.1,.08,8).applyQuaternion(rotation).translate(a.x,a.y,a.z),0x55594f);}
 }
 return b.build();
}
export function parking(trucks,E){
 const b=new Batch(),segments=[[-1,-1,1,-1],[1,-1,1,0],[1,0,1,1],[-1,1,1,1],[-1,0,-1,1],[-1,-1,-1,0],[-1,0,1,0]],digits=['012345','12','01643','01236','1256','02536','023456','012','0123456','012356'];
 for(const t of trucks.filter(t=>t.id>8)){if(E)for(const id of ['city','center']){const path=hubApproach(world(E.positions[id]),t.id,E.hubMirrors?.[id]);for(let i=1;i<path.length;i++)b.strip(path[i-1],path[i],ROAD_WIDTH,.060,0x343c37);}const p=parkingSlot(t.id,E);b.box(1.56,.016,1.08,p.x,.055,p.z,0xaaa995);for(const z of [-.52,.52])b.strip({x:p.x-.77,z:p.z+z},{x:p.x+.77,z:p.z+z},.025,.069,0xf3ead5);b.strip({x:p.x+.76,z:p.z-.52},{x:p.x+.76,z:p.z+.52},.025,.069,0xf3ead5);
  const chars=String(t.id);for(let i=0;i<chars.length;i++)for(const segment of digits[Number(chars[i])]){const [x,z,xx,zz]=segments[Number(segment)],center=p.x+(i-(chars.length-1)/2)*.17;b.strip({x:center+x*.052,z:p.z+.38+z*.085},{x:center+xx*.052,z:p.z+.38+zz*.085},.018,.073,0xf9f1db);}
 }
 return b.build();
}
export function hubConnectors(E,ids=['city','center']){const b=new Batch();for(const id of ids){
 const gate=world(E.positions[id]),a=hubPoint(gate,HUB.laneX,-5.18,HUB.roadY,E.hubMirrors?.[id]),delta=new T.Vector3(gate.x-a.x,.071-a.y,gate.z-a.z),len=delta.length(),g=new T.BoxGeometry(len,.018,ROAD_WIDTH);
 g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),delta.normalize()));g.translate((a.x+gate.x)/2,(a.y+.071)/2-.017,(a.z+gate.z)/2);b.add(g,0x343c37);
 }return b.build();}
export function outline(width,depth,color){const g=new T.Group(),b=new Batch(),w=width/2,d=depth/2;b.strip({x:-w,z:-d},{x:w,z:-d},.035,.05,color);b.strip({x:w,z:-d},{x:w,z:d},.035,.05,color);b.strip({x:w,z:d},{x:-w,z:d},.035,.05,color);b.strip({x:-w,z:d},{x:-w,z:-d},.035,.05,color);g.add(b.build());return g;}
export function plot(width,depth){const b=new Batch();b.box(width,.04,depth,0,.020,0,0x39464c);for(const x of [-1,1])for(const z of [-1,1])b.box(.11,.25,.11,x*(width/2-.1),.15,z*(depth/2-.1),0xd58b4c);const g=b.build();g.add(outline(width,depth,0x778584));return g;}
export function asphaltProxy(){const b=new Batch();b.box(3.3,.12,2.4,0,.06,0,0xaaa796);b.box(1.7,1.05,1.4,-.55,.65,0,0xeee5d3);b.box(1.85,.12,1.55,-.55,1.22,0,0x343c37);b.box(1.85,.065,1.55,-.55,1.13,0,0xbe6048);b.box(.75,.68,.025,-.55,.47,.715,0x4c5550);for(const x of [.65,1.15]){b.add(new T.CylinderGeometry(.24,.24,1.65,12).translate(x,.94,-.35),0xc6c4b6);b.add(new T.CylinderGeometry(.27,.27,.10,12).translate(x,1.80,-.35),0x343c37);}b.box(.18,1.6,.18,-1.03,1.91,-.4,0xb9b6a4);return b.build();}
export function depot(){const b=new Batch();b.box(4.1,.10,2.5,0,.05,0,0xc6c3af);b.box(3.6,1.4,1.9,0,.82,0,0xeee5d3);b.box(3.8,.12,2.05,0,1.56,0,0x343c37);b.box(3.8,.08,2.05,0,1.46,0,0xbe6048);for(const x of [-.95,.95])b.box(1.1,1.05,.025,x,.63,.96,0x343c37);return b.build();}
