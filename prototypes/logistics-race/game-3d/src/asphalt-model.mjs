import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const PALETTE={cream:0xeee5d3,light:0xf5eedd,stone:0xb9ae99,ink:0x343c37,red:0xbe6048,steel:0x93988f,glass:0x394b49,gravel:0xa6a18f};
export function createAsphaltPlant(){
 const root=new T.Group();root.name='AsphaltMixingPlant';const staticRoot=new T.Group();staticRoot.name='Plant.Structure';root.add(staticRoot);const mats=new Map();
 const mat=color=>{if(!mats.has(color)){const m=new T.MeshStandardMaterial({color:PALETTE[color],roughness:.88,metalness:color==='steel'?.24:0,flatShading:true});m.name=color;mats.set(color,m);}return mats.get(color);};
 const add=(name,g,color,parent=staticRoot)=>{const mesh=new T.Mesh(g,mat(color));mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 const box=(name,w,h,d,x,y,z,color,parent)=>add(name,new T.BoxGeometry(w,h,d).translate(x,y,z),color,parent);
 const cylinder=(name,r,h,x,y,z,color,parent)=>add(name,new T.CylinderGeometry(r,r,h,16).translate(x,y,z),color,parent);
 const beam=(name,a,b,r,color='steel',parent)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),v=end.clone().sub(start);return add(name,new T.CylinderGeometry(r,r,v.length(),8).applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize())).translate(...start.add(end).multiplyScalar(.5).toArray()),color,parent);};
 box('Foundation',9,.12,5.8,0,.06,0,'stone');box('Apron',8.85,.025,5.65,0,.1325,0,'light');
 for(const x of [-3.75,-2.65,-1.55]){
  // Closed tapered hoppers with distinct rims and actual aggregate heaps.
  add('Feed.Hopper',new T.CylinderGeometry(.65,.24,.70,4,1,false).rotateY(Math.PI/4).scale(1,1,.82).translate(x,.99,1.72),'cream');
  box('Feed.Rim',.97,.055,.83,x,1.3675,1.72,'red');box('Feed.AggregateSurface',.85,.025,.71,x,1.405,1.72,'gravel');
  add('Feed.AggregateHeap',new T.ConeGeometry(.35,.21,7).scale(1,1,.78).translate(x,1.515,1.72),'gravel');
  for(const dx of [-.31,.31])box('Feed.Leg',.07,.52,.07,x+dx,.40,1.72,'ink');
  box('Feed.Gate',.30,.18,.30,x,.54,1.72,'steel');
 }
 box('Feed.HorizontalBelt',3.50,.10,.42,-2.65,.45,1.72,'ink');for(const x of [-4,-3,-2,-1.2])box('Feed.BeltSupport',.08,.30,.43,x,.285,1.72,'steel');

 // The dryer has its own axial pivot. Longitudinal ribs make rotation legible.
 const drum=new T.Group();drum.name='Motion.Drum';drum.position.set(-1.05,1.14,-.05);root.add(drum);
 add('Dryer.Shell',new T.CylinderGeometry(.54,.54,3.15,24).rotateZ(Math.PI/2),'ink',drum);
 for(const x of [-1.28,1.28])add('Dryer.Band',new T.CylinderGeometry(.59,.59,.13,24).rotateZ(Math.PI/2).translate(x,0,0),'steel',drum);
 for(let i=0;i<8;i++){const a=i*Math.PI/4,m=box('Dryer.Rib',2.55,.035,.035,0,.55*Math.cos(a),.55*Math.sin(a),'steel',drum);}
 for(const x of [-2.33,.23]){box('Dryer.Foot',.46,.22,1.10,x,.255,-.05,'cream');for(const z of [-.41,.31])add('Dryer.SupportRoller',new T.CylinderGeometry(.15,.15,.20,12).rotateZ(Math.PI/2).translate(x,.53,z),'steel');}
 add('Burner.Casing',new T.CylinderGeometry(.23,.31,.45,16).rotateZ(Math.PI/2).translate(-2.83,1.14,-.05),'red');
 add('Dryer.Output',new T.CylinderGeometry(.37,.37,.28,16).rotateZ(Math.PI/2).translate(.64,1.14,-.05),'cream');

 const belt={a:[-2.7,.58,1.68],b:[-2.7,1.23,.30],radius:.10,width:.46},a=new T.Vector3(...belt.a),b=new T.Vector3(...belt.b),direction=b.clone().sub(a).normalize(),normal=new T.Vector3(0,-direction.z,direction.y),length=a.distanceTo(b),middle=a.clone().add(b).multiplyScalar(.5);
 for(const s of [-1,1]){const p=middle.clone().addScaledVector(normal,s*belt.radius);add('Conveyor.ContinuousRun',new T.BoxGeometry(belt.width,.018,length).rotateX(-Math.atan2(direction.y,direction.z)).translate(...p.toArray()),'ink');}
 for(const p of [a,b]){add('Conveyor.EndBelt',new T.CylinderGeometry(.10,.10,.46,16).rotateZ(Math.PI/2).translate(...p.toArray()),'ink');add('Conveyor.EndAxle',new T.CylinderGeometry(.06,.06,.53,12).rotateZ(Math.PI/2).translate(...p.toArray()),'steel');for(const dx of [-.29,.29])box('Conveyor.Frame',.045,.09,.22,p.x+dx,p.y-.02,p.z,'steel');}
 for(let i=0;i<20;i++)box('Motion.Cleat.'+i,.43,.028,.045,0,0,0,'steel',root);
 for(let i=0;i<9;i++)add('Motion.Gravel.'+i,new T.IcosahedronGeometry(.05,0).scale(1,.65,.85),'gravel',root);
 beam('Conveyor.Support',[-2.7,.145,.73],[-2.7,.80,.73],.055);

 // Filter house and exhaust stack; the visible plume is driven by paid production.
 box('Baghouse.Body',2.15,1.13,.87,-1.05,1.0,-1.68,'cream');box('Baghouse.FlatRoof',2.27,.08,.99,-1.05,1.605,-1.68,'ink');
 for(let i=0;i<7;i++)box('Baghouse.Rib',.045,1.05,.035,-2.0+i*.31,1.0,-1.225,'steel');
 for(const x of [-1.75,-.35])box('Baghouse.Leg',.10,.30,.50,x,.29,-1.68,'ink');
 beam('Exhaust.Riser',[.35,1.14,-.05],[.35,1.72,-.05],.16,'cream');beam('Exhaust.Duct',[.35,1.72,-.05],[.35,1.72,-1.68],.16,'cream');beam('Exhaust.Header',[.35,1.72,-1.68],[-1.05,1.72,-1.68],.16,'cream');
 cylinder('Stack.Foot',.34,.16,-3.50,.225,-1.72,'stone');cylinder('Stack',.18,3.90,-3.50,2.255,-1.72,'cream');cylinder('Stack.Cap',.215,.095,-3.50,4.2525,-1.72,'ink');
 for(const y of [.65,2.20,3.70])cylinder('Stack.Band',.19,.08,-3.50,y,-1.72,'red');
 beam('Stack.Duct',[-2.13,1.0,-1.72],[-3.5,1.0,-1.72],.13,'steel');
 const fan=new T.Group();fan.name='Motion.Fan';fan.position.set(-.62,1.03,-1.18);root.add(fan);add('Fan.Hub',new T.CylinderGeometry(.075,.075,.07,12).rotateX(Math.PI/2),'steel',fan);
 for(let i=0;i<4;i++){const blade=box('Fan.Blade',.12,.30,.035,0,.16,0,'steel',fan);blade.geometry.rotateZ(i*Math.PI/2);}
 for(const x of [-.9,-.34])box('Fan.Guard',.025,.60,.025,x,1.03,-1.13,'ink');

 // Bucket elevator, elevated batch mixer, service platform and loading silo.
 box('Elevator.Case',.48,3.62,.43,1.10,1.955,-.40,'cream');box('Elevator.Channel',.20,3.30,.022,1.10,1.94,-.172,'ink');box('Elevator.Head',.62,.28,.56,1.10,3.905,-.40,'red');
 for(let i=0;i<9;i++)box('Motion.Bucket.'+i,.14,.12,.08,1.10,0,-.14,'steel',root);
 beam('Elevator.Feed',[.72,.82,-.05],[1.10,.82,-.40],.15,'steel');
 for(const x of [1.65,2.85])for(const z of [-1.0,.20])box('Mixer.Support',.10,2.05,.10,x,1.17,z,'steel');
 box('Mixer.Platform',1.88,.12,1.78,2.25,2.255,-.40,'steel');box('Mixer.Body',1.52,1.45,1.36,2.25,3.04,-.40,'cream');box('Mixer.SealedRoof',1.67,.10,1.51,2.25,3.815,-.40,'ink');box('Mixer.Trim',1.60,.08,1.43,2.25,3.65,-.40,'red');
 for(const x of [1.83,2.25,2.67])box('Mixer.Window',.27,.30,.022,x,3.28,.292,'glass');
 add('Mixer.DischargeHopper',new T.CylinderGeometry(.56,.16,.55,4).rotateY(Math.PI/4).translate(2.25,1.92,-.40),'ink');
 for(const side of [-1,1]){beam('Platform.Railing',[1.34,2.68,-.40+side*.84],[3.16,2.68,-.40+side*.84],.023);for(const x of [1.34,2.25,3.16])beam('Platform.Post',[x,2.32,-.40+side*.84],[x,2.68,-.40+side*.84],.02);}
 for(const x of [1.38,1.64])beam('Ladder.Rail',[x,.145,.63],[x,3.75,.63],.018);for(let i=0;i<16;i++)beam('Ladder.Rung',[1.38,.25+i*.22,.63],[1.64,.25+i*.22,.63],.017);
 beam('Product.DragConveyor',[2.25,2.0,-.40],[3.62,3.20,1.45],.12,'ink');
 for(const dx of [-.42,.42])for(const dz of [-.42,.42])box('Silo.Leg',.09,1.67,.09,3.58+dx,.98,1.38+dz,'steel');
 cylinder('Silo.Body',.56,1.45,3.58,2.75,1.38,'cream');add('Silo.ClosedCone',new T.CylinderGeometry(.56,.13,.58,16).translate(3.58,1.735,1.38),'steel');cylinder('Silo.Roof',.59,.08,3.58,3.515,1.38,'ink');
 for(const y of [2.15,3.35])cylinder('Silo.Band',.575,.07,3.58,y,1.38,'red');cylinder('Silo.LoadingGate',.13,.25,3.58,1.315,1.38,'ink');
 add('Bitumen.Tank',new T.CylinderGeometry(.35,.35,1.75,16).rotateZ(Math.PI/2).translate(3.28,.65,-2.18),'steel');for(const x of [2.72,3.84]){box('Bitumen.Saddle',.20,.20,.74,x,.245,-2.18,'ink');add('Bitumen.Band',new T.CylinderGeometry(.36,.36,.065,16).rotateZ(Math.PI/2).translate(x,.65,-2.18),'cream');}
 cylinder('Bitumen.Hatch',.14,.10,3.28,1.045,-2.18,'ink');
 box('Control.Room',1.14,.85,.85,-3.70,.57,-.20,'cream');box('Control.FlatRoof',1.23,.065,.94,-3.70,1.0275,-.20,'ink');box('Control.Window',.82,.30,.023,-3.70,.76,.238,'glass');box('Control.Door',.022,.56,.29,-3.117,.435,-.28,'ink');

 function batch(group){group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),batches=new Map();group.traverse(o=>{if(!o.isMesh)return;const geometry=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(inverse.clone().multiply(o.matrixWorld));const key=o.material.name;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(geometry);});group.clear();for(const [color,list] of batches){add('Batch.'+color,mergeGeometries(list),color,group);for(const g of list)g.dispose();}}
 batch(staticRoot);batch(drum);batch(fan);
 root.traverse(o=>{if(o.name.startsWith('Motion.'))o.userData.motionId=o.name;});
 root.userData.procedural={kind:'asphalt-plant',version:1,method:'local procedural geometry',belt,smokeOrigin:[-3.50,4.30,-1.72],namedPivots:['Motion.Drum','Motion.Fan'],motion:['closed conveyor cleats','aggregate feed','bucket elevator','dryer','filter fan'],referencePending:true};
 return root;
}
