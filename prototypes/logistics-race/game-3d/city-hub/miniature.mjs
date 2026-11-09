import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLowPolyOakTree} from '../../../../tools/skills/generate-low-poly-model/scripts/procedural-low-poly-models.js';

export const PALETTE={cream:0xeee5d3,light:0xf5eedd,stone:0xb9ae99,ink:0x343c37,red:0xbe6048,green:0x8c9276,glass:0x394b49,paving:0xd6ceba,water:0x7b9187,steel:0x93988f};
export const CITY_PARAMETERS={width:12.8,depth:11.8,baseTop:.18,floorHeight:.36,seed:6112026,serviceLane:false};

function roundedSlab(w,d,r,bottom,h){
 const s=new T.Shape(),x=-w/2,z=-d/2;
 s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);
 s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);
 s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);
 s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);s.closePath();
 return new T.ExtrudeGeometry(s,{depth:h,bevelEnabled:false,curveSegments:6}).rotateX(-Math.PI/2).translate(0,bottom,0);
}

export function createCityHub(params={}){
 const p={...CITY_PARAMETERS,...params},root=new T.Group(),materials=new Map();root.name='MiniatureCityDiorama';
 const mat=key=>{if(!materials.has(key)){const m=new T.MeshStandardMaterial({color:PALETTE[key],roughness:key==='glass'?.48:.88,metalness:key==='steel'?.22:0,flatShading:true});m.name=key;materials.set(key,m);}return materials.get(key);};
 function add(name,g,color,parent=root){const m=new T.Mesh(g,mat(color));m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function box(name,w,h,d,x,y,z,color,parent=root){return add(name,new T.BoxGeometry(w,h,d).translate(x,y,z),color,parent);}
 function cylinder(name,r,h,x,y,z,color,parent=root,segments=16){return add(name,new T.CylinderGeometry(r,r,h,segments).translate(x,y,z),color,parent);}
 add('Foundation.RoundedStone',roundedSlab(p.width,p.depth,.42,0,.13),'stone');
 add('Foundation.Coping',roundedSlab(p.width-.07,p.depth-.07,.40,.13,.05),'light');
 add('Sidewalk.Continuous',roundedSlab(p.width-.25,p.depth-.25,.36,.18,.018),'paving');

 // Streets remain flat, with geometry markings and curbs rather than image textures.
 const roadY=.202,roads=[];
 function road(id,x,z,w,d){box(id,w,.012,d,x,roadY-.006,z,'ink');roads.push({id,x,z,width:w,depth:d,surfaceY:roadY});}
 road('Street.West',-5.67,0,.66,10.62);road('Street.East',5.67,0,.66,10.62);
 road('Street.North',0,-5.18,11.95,.66);road('Street.South',0,5.18,11.95,.66);
 road('Street.Main',0,.65,11.35,.66);road('Street.Civic',.35,-2.1,.64,6.15);
 road('Street.RearLane',-2.65,-2.18,5.4,.48);road('Street.EastLane',3.0,-2.18,4.7,.48);
 if(p.serviceLane)road('Street.FreightAccess',2.7075,-2.265,.61,5.83);
 for(const z of [-4.65,-3.9,-3.15,-1.5,-.75,1.55,2.3,3.05,3.8,4.55])for(const x of [-5.67,5.67])box('Street.LaneDash',.018,.006,.24,x,.207,z,'light');
 for(const z of [-5.18,.65,5.18])for(let x=-4.8;x<=4.9;x+=.8){if(z===.65&&Math.abs(x-.35)<.5)continue;box('Street.LaneDash',.26,.006,.018,x,.207,z,'light');}
 for(let z=-4.5;z<.4;z+=.75)box('Street.LaneDash',.018,.006,.24,.35,.207,z,'light');
 for(const z of [-4.73,.16]){box('Street.Curb',5.21,.045,.045,-2.695,.225,z,'light');if(p.serviceLane){box('Street.Curb',1.5575,.045,.045,1.56875,.225,z,'light');box('Street.Curb',2.2325,.045,.045,4.18375,.225,z,'light');}else box('Street.Curb',4.51,.045,.045,3.045,.225,z,'light');}
 for(const z of [1.14,4.73]){box('Street.Curb',7.4,.045,.045,-1.6,.225,z,'light');box('Street.Curb',1.70,.045,.045,4.45,.225,z,'light');}
 for(const x of [-5.22,5.22])for(const [z,d] of [[-3.575,2.25],[-.88,2.08],[1.99,1.70],[4.105,1.19]])box('Street.Curb',.045,.045,d,x,.225,z,'light');
 for(const cx of [-4.85,4.84])for(let i=0;i<5;i++)box('Crosswalk',.065,.006,.48,cx+(i-2)*.13,.209,.65,'light');
 for(const z of [-4.50,-.05])for(let i=0;i<5;i++)box('Crosswalk',.47,.006,.065,.35,.209,z+(i-2)*.13,'light');

 const buildings=[],ground=.23;
 function building(id,x,z,w,d,floors,style='classic',color='cream'){
  const h=floors*p.floorHeight,top=ground+h;
  buildings.push({id,x,z,width:w,depth:d,bottom:p.baseTop,bodyBottom:ground,top,floors,style});
  box(id+'.Footing',w+.10,ground-p.baseTop,d+.10,x,(ground+p.baseTop)/2,z,'stone');
  box(id+'.Body',w,h,d,x,ground+h/2,z,color);
  for(let f=0;f<floors;f++){
   const y=ground+f*p.floorHeight+.19;
   if(style!=='office'||f%2===0)box(id+'.FloorBelt',w+.025,.025,d+.025,x,ground+f*p.floorHeight+.018,z,'light');
   for(const side of [-1,1]){
    const cols=Math.max(3,Math.floor(w/.25)),rows=Math.max(3,Math.floor(d/.29));
    for(let c=0;c<cols;c++){
     const xx=x+(c-(cols-1)/2)*(w/(cols+.3)),ww=w/(cols+.3)*.57;
     box(id+'.FrontWindow',ww,.195,.016,xx,y,z+side*(d/2+.009),'glass');
     if(style==='classic')box(id+'.WindowSill',ww+.028,.021,.045,xx,y-.107,z+side*(d/2+.018),'light');
    }
    for(let c=0;c<rows;c++){
     const zz=z+(c-(rows-1)/2)*(d/(rows+.3)),dd=d/(rows+.3)*.57;
     box(id+'.SideWindow',.016,.195,dd,x+side*(w/2+.009),y,zz,'glass');
     if(style==='classic')box(id+'.SideSill',.045,.021,dd+.028,x+side*(w/2+.018),y-.107,zz,'light');
    }
   }
   if(style==='office')box(id+'.OfficeBand',w+.035,.038,d+.035,x,ground+(f+1)*p.floorHeight-.006,z,'steel');
  }
  if(style==='classic')for(const dx of [-w/2+.035,w/2-.035])box(id+'.CornerPier',.075,h,.035,x+dx,ground+h/2,z+d/2+.024,'light');
  box(id+'.RoofSealed',w+.09,.065,d+.09,x,top+.0325,z,'ink');
  for(const side of [-1,1]){
   box(id+'.RoofFrontCoping',w+.11,.085,.045,x,top+.10,z+side*(d/2+.025),'light');
   box(id+'.RoofSideCoping',.045,.085,d+.025,x+side*(w/2+.025),top+.10,z,'light');
  }
  box(id+'.RoofService',w*.34,.14,d*.30,x+w*.16,top+.135,z-d*.12,'stone');
  box(id+'.RoofServiceLid',w*.36,.025,d*.32,x+w*.16,top+.2175,z-d*.12,'light');
  box(id+'.Entry',.22,.28,.025,x,ground+.14,z+d/2+.015,'glass');
  box(id+'.EntryCanopy',.40,.035,.19,x,ground+.31,z+d/2+.09,style==='office'?'steel':'red');
  if(style==='stepped'){
   // Successive closed setbacks form a generic city landmark.
   for(let tier=0;tier<3;tier++){
    const tw=w*(.66-tier*.15),td=d*(.66-tier*.15),th=.30;
    box(id+'.Setback',tw,th,td,x,top+.065+tier*.335+.15,z,'cream');
    box(id+'.SetbackCap',tw+.06,.035,td+.06,x,top+.065+tier*.335+th+.0175,z,'light');
    for(const s of [-1,1])box(id+'.SetbackWindow',tw*.7,.17,.014,x,top+.065+tier*.335+.16,z+s*(td/2+.008),'glass');
   }
   cylinder(id+'.Spire',.025,.44,x,top+1.29,z,'steel',root,8);
  }
 }
 building('West.Corner',-4.35,-3.54,1.42,1.70,5,'classic');
 building('West.Tower',-2.45,-3.54,1.44,1.70,7,'stepped');
 building('Civic.Library',-.90,-3.66,.98,1.38,3,'classic');
 building('East.Skyline',1.65,-3.54,1.50,1.78,9,'stepped');
 building('East.Office',3.88,-3.54,1.73,1.70,7,'office');
 building('West.Mansion',-4.35,-.84,1.50,1.48,4,'classic','red');
 building('West.Townhouse',-2.45,-.84,1.40,1.48,3,'classic');
 building('East.Midrise',1.65,-.84,1.48,1.48,5,'office');
 building('East.Terracotta',3.88,-.84,1.73,1.48,4,'classic','red');
 building('South.Corner',-4.32,4.05,1.50,1.02,3,'classic');
 building('South.Civic',-2.10,4.05,1.72,1.02,2,'classic','red');

 const industries=[];
 for(const [id,x] of [['refinery',-4.35],['metalworks',-2.55],['assembly',-.75]]){
  const g=new T.Group();g.name='District.'+id;g.position.set(x,p.baseTop,2.07);root.add(g);
  const b=(name,w,h,d,x,y,z,color)=>box(id+'.'+name,w,h,d,x,y,z,color,g);
  const cylinder=(name,r,h,x,y,z,color)=>add(id+'.'+name,new T.CylinderGeometry(r,r,h,12).translate(x,y,z),color,g);
  const pipe=(name,aa,bb,r=.028)=>{const start=new T.Vector3(...aa),end=new T.Vector3(...bb),delta=end.clone().sub(start);return add(id+'.'+name,new T.CylinderGeometry(r,r,delta.length(),8).applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize())).translate(...start.add(end).multiplyScalar(.5).toArray()),'steel',g);};
  b('Foundation',1.38,.05,1.37,0,.025,0,'stone');
  if(id==='refinery'){
   b('ServiceHouse',.52,.52,.47,-.31,.31,-.39,'cream');b('FlatRoof',.58,.055,.53,-.31,.5975,-.39,'ink');
   for(const x of [-.34,.16]){const h=x<0?.87:1.20;cylinder('ProcessColumn',.14,h,x,.05+h/2,.16,'steel');cylinder('ColumnCap',.16,.055,x,.05+h+.0275,.16,'ink');for(const y of [.25,.55])cylinder('ColumnBand',.151,.045,x,y,.16,'cream');}
   cylinder('StorageTank',.23,.47,.39,.285,-.40,'cream');cylinder('StorageTankRim',.24,.045,.39,.5425,-.40,'steel');
   for(const x of [-.34,.16]){pipe('HorizontalFeed',[x,.40,.17],[x,.40,.52]);pipe('DropFeed',[x,.40,.52],[x,.085,.52]);}
   pipe('Header',[-.43,.085,.52],[.44,.085,.52],.035);pipe('TankFeed',[.39,.12,-.4],[.39,.12,.52]);
   b('ServiceWindow',.22,.14,.018,-.31,.39,-.146,'glass');
  }else if(id==='metalworks'){
   b('FoundryHall',1.02,.53,.64,0,.315,-.22,'cream');b('FoundryRoof',1.1,.055,.72,0,.6075,-.22,'ink');
   b('RoofTrim',1.1,.035,.73,0,.563,-.22,'red');
   for(const x of [-.30,0,.30]){b('Clerestory',.18,.11,.019,x,.45,.11,'glass');b('LoadingBay',.20,.23,.019,x,.165,.11,'ink');}
   b('ChimneyFoot',.27,.15,.27,-.37,.71,-.37,'stone');b('Chimney',.15,.95,.15,-.37,1.26,-.37,'steel');b('ChimneyLip',.205,.05,.205,-.37,1.76,-.37,'ink');
   for(const x of [-.42,-.23,-.04])add('metalworks.Roller',new T.CylinderGeometry(.065,.065,.15,12).rotateZ(Math.PI/2).translate(x,.12,.43),'steel',g);
   // Small ingot stockpile on a grounded loading apron.
   for(let row=0;row<2;row++)for(let col=0;col<3-row;col++)b('Ingot',.16,.075,.19,.20+col*.18+row*.09,.088+row*.075,.43,'steel');
  }else{
   b('AssemblyHall',1.14,.56,.93,0,.33,-.06,'cream');b('AssemblyRoof',1.22,.065,1.01,0,.6425,-.06,'ink');
   for(const x of [-.30,.30]){b('GarageDoor',.37,.35,.022,x,.255,.415,'ink');b('GarageLintel',.45,.047,.045,x,.455,.43,'red');for(let k=0;k<5;k++)b('DoorSlat',.33,.012,.009,x,.13+k*.058,.431,'steel');}
   for(const x of [-.33,0,.33])b('Skylight',.18,.035,.31,x,.693,-.10,'glass');
   b('LoadingApron',1.20,.02,.25,0,.06,.54,'paving');
  }
  root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(g);
  industries.push({id,x,z:2.07,width:1.38,depth:1.37,interactive:false,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}});
 }
 road('Street.Service',-2.48,3.08,5.50,.40);
 for(let x=-4.8;x<.1;x+=.6)box('Service.LaneDash',.18,.006,.015,x,.207,3.08,'light');


 // Freight bays are part of the same square diorama, not a separate attached tile.
 const pcx=2.83,pcz=3.0,parking={slots:[],surfaceY:.215,drive:{minX:pcx-.66,maxX:pcx+.66,minZ:1.12,maxZ:5.18},capacity:8};
 box('Parking.Apron',5.0,.017,3.76,pcx,.2065,pcz,'ink');
 box('Parking.Entry',1.30,.017,.45,pcx,.2065,4.95,'ink');
 for(const side of [-1,1])box('Parking.Curb',.045,.045,3.76,pcx+side*2.5,.24,pcz,'light');
 const digits=['012345','12','01643','01236','1256','02536','023456','012','0123456'],segments=[[-1,-1,1,-1],[1,-1,1,0],[1,0,1,1],[-1,1,1,1],[-1,0,-1,1],[-1,-1,-1,0],[-1,0,1,0]];
 for(let row=0;row<4;row++)for(const side of [-1,1]){
  const id=row*2+(side<0?1:2),x=pcx+side*1.55,z=1.65+row*.87,yaw=side<0?0:Math.PI;
  parking.slots.push({id,x,z,yaw,width:1.62,depth:.79});
  for(const dz of [-.395,.395])box('Parking.Bay.Line',1.67,.006,.021,x,.220,z+dz,'light');
  box('Parking.Bay.Stop',.055,.045,.46,pcx+side*2.22,.242,z,'stone');
  for(const seg of digits[id]){const [xx,zz,xxx,zzz]=segments[+seg],a={x:pcx+side*.86+xx*.055,z:z+zz*.10},bb={x:pcx+side*.86+xxx*.055,z:z+zzz*.10},dx=bb.x-a.x,dz=bb.z-a.z;const m=add('Parking.Number',new T.BoxGeometry(Math.hypot(dx,dz),.006,.019),'light');m.rotation.y=-Math.atan2(dz,dx);m.position.set((a.x+bb.x)/2,.221,(a.z+bb.z)/2);}
 }
 for(const z of [1.65,2.5,3.35,4.2])box('Parking.Centerline',.025,.006,.26,pcx,.221,z,'light');

 // A small pocket park leaves breathing room between the urban blocks.
 box('Park.Green',1.47,.024,1.53,-.87,.210,-.85,'green');
 box('Park.Path',.22,.012,1.55,-.87,.229,-.85,'light');
 cylinder('Park.Fountain.Base',.23,.065,-.87,.255,-.85,'stone',root,24);
 cylinder('Park.Fountain.Water',.195,.012,-.87,.2935,-.85,'water',root,24);
 cylinder('Park.Fountain.Center',.04,.11,-.87,.347,-.85,'light');
 const trees=[[-1.40,-1.30],[-.40,-1.30],[-1.40,-.35],[-.40,-.35],[-5.05,-4.5],[-3.40,-4.5],[-1.40,-4.5],[.82,-4.5],[2.7,-4.5],[4.9,-4.5],[-5.0,.05],[-3.35,.05],[-1.7,.05],[.85,.05],[2.7,.05],[4.9,.05],[-5.0,4.55],[-3.25,4.55],[-.85,4.1],[-.2,4.55],[5.04,-1.35],[5.04,-.4]];
 for(const [i,[x,z]] of trees.entries()){
  if(p.serviceLane&&Math.abs(x-2.7075)<.3)continue;
  const tree=createLowPolyOakTree(T,{name:'Street.Tree',height:1.35,crownRadius:.48,trunkColor:PALETTE.stone,leafColor:i%4===0?PALETTE.water:PALETTE.green,scale:i<4?.43:.50});tree.position.set(x,.232,z);root.add(tree);
  box('Tree.Planter',.29,.04,.29,x,.222,z,'stone');
 }
 for(const x of [-1.32,-.42]){box('Park.Bench',.11,.045,.31,x,.32,-.84,'red');for(const dz of [-.10,.10])box('Park.BenchLeg',.08,.08,.035,x,.275,-.84+dz,'ink');}
 for(const [x,z] of [[-5.12,-2.7],[5.12,-2.7],[-5.12,2.8],[5.12,2.8],[.84,-2.6],[-.12,.05]]){
  cylinder('Lamp.Post',.014,.56,x,.5,z,'ink',root,8);box('Lamp.Head',.12,.035,.075,x,.7975,z,'light');
 }
 root.userData.procedural={kind:'city-hub',version:3,layout:'miniature urban diorama',method:'Three.js procedural via generate-low-poly-model skill',parameters:p,buildings,buildingCount:buildings.length+industries.length,industrialModels:industries.length,industries,roads,parking,interactiveChildren:false};
 root.updateMatrixWorld(true);
 // Batch static geometry by material while preserving the generation metadata.
 const batches=new Map();root.traverse(o=>{if(!o.isMesh)return;const key=o.material.color.getHex(),name=Object.keys(PALETTE).find(k=>PALETTE[k]===key)||'green';const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);if(!batches.has(name))batches.set(name,[]);batches.get(name).push(g);});
 root.clear();for(const [name,geometries] of batches){const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();add('City.'+name,geometry,name);}
 return root;
}
