import * as T from 'three';
import {mergeGeometries,toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {METAL_MOTION} from './metalworks-motion.mjs';

// Local component repair on the immutable Mint metalworks. Retain the furnace,
// rolling equipment, pipework and stock layout; replace rejected hall/base only.
export const METAL_REPAIR={floor:-.282,bottom:-.3427734673,hall:{minX:-.095,maxX:.32,minZ:-.49,maxZ:-.095,top:-.085}};
function clip(poly,axis,bound,sign){
 const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p.getComponent(axis)-bound)*sign,db=(b.p.getComponent(axis)-bound)*sign;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),c:a.c.clone().lerp(b.c,t)});}}return out;
}
function outside(poly,planes){
 const out=[];let inside=poly;
 for(const [axis,bound,sign] of planes){if(inside.length<3)break;const part=clip(inside,axis,bound,-sign);if(part.length>=3)out.push(part);inside=clip(inside,axis,bound,sign);}return out;
}
function retainedGeometry(source){
 const p=source.getAttribute('position'),c=source.getAttribute('color'),positions=[],colors=[],h=METAL_REPAIR.hall,hallPlanes=[[0,h.minX,1],[0,h.maxX,-1],[2,h.minZ,1],[2,h.maxZ,-1]],stockPlanes=[[0,-.10,1],[2,.08,1],[1,-.20,-1]],rollPlanes=[[0,.292,1],[0,.422,-1],[2,-.222,1],[2,.035,-1],[1,-.281,1],[1,-.19,-1]];
 for(let i=0;i<p.count;i+=3){const tri=[0,1,2].map(k=>({p:new T.Vector3().fromBufferAttribute(p,i+k),c:new T.Vector3().fromBufferAttribute(c,i+k)}));
  let pieces=[clip(tri,1,METAL_REPAIR.floor,1)];
  const leftSupport=[[0,.20,1],[0,.324,-1],[2,-.225,1],[2,.10,-1],[1,-.145,-1]],frontCurb=[[0,-.10,-1],[2,.23,1],[1,-.225,-1]],curbEnd=[[0,-.43,-1],[2,.20,1],[1,-.225,-1]];
  for(const region of [hallPlanes,stockPlanes,rollPlanes,leftSupport,frontCurb,curbEnd])pieces=pieces.flatMap(poly=>outside(poly,region));
  for(const poly of pieces)for(let k=1;k<poly.length-1;k++){
   const t=[poly[0],poly[k],poly[k+1]];if(t[1].p.clone().sub(t[0].p).cross(t[2].p.clone().sub(t[0].p)).lengthSq()<1e-19)continue;
   for(const v of t){positions.push(...v.p.toArray());colors.push(...v.c.toArray());}
  }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));return toCreasedNormals(g,Math.PI/6);
}
export function repairMetalworks(asset){
 const imported=asset.children.find(o=>o.isMesh);if(!imported)throw Error('Missing painted metalworks shell');
 imported.geometry=retainedGeometry(imported.geometry);imported.name='Retained Mint furnace, equipment and stock';
 imported.material.side=T.FrontSide;
 const parts=new T.Group();parts.name='Metalworks repaired hall and grounded foundation';asset.add(parts);
 const batches=new Map(),cube=new T.BoxGeometry(1,1,1),P={wall:0xeee5d3,roof:0x343c3b,steel:0x899994,teal:0x527f86,glass:0x2c494b,red:0xbe6048,base:0x777b72,concrete:0xb9b6a4};
 function box(name,w,h,d,x,y,z,color){
  const geometry=cube.clone().scale(w,h,d).translate(x,y,z);if(!batches.has(color))batches.set(color,[]);batches.get(color).push(geometry);
  parts.userData.components??=[];parts.userData.components.push({name,min:[x-w/2,y-h/2,z-d/2],max:[x+w/2,y+h/2,z+d/2]});
 }
 const f=METAL_REPAIR.floor,b=METAL_REPAIR.bottom,h=METAL_REPAIR.hall;
 box('Continuous ground-contact foundation',1.01,f-b,.98,0,(f+b)/2,0,P.base);
 // Solid walls and slab replace the warped hall/canopy, rather than cover it.
 const x=.1125,z=-.2925,width=.415,depth=.395,top=h.top;
 box('Closed aligned hall shell',width,top-f,depth,x,(f+top)/2,z,P.wall);
 box('Hall continuous plinth',width+.006,.018,depth+.006,x,f+.009,z,P.concrete);
 box('Solid closed roof',width+.024,.021,depth+.024,x,top+.0105,z,P.roof);
 box('Roof straight red fascia',width+.026,.008,depth+.026,x,top-.003,z,P.red);
 // Longitudinal standing seams are geometry, with no blurred bitmap overlay.
 for(let i=0;i<9;i++)box('Roof standing seam',.0025,.003,depth+.016,x-width/2+.017+i*.0475,top+.0225,z,P.steel);
 for(const rx of [.025,.19]){
  box('Roof ventilator curb',.067,.013,.082,rx,top+.029,z,P.steel);
  box('Roof ventilator cap',.075,.011,.09,rx,top+.041,z,P.roof);
  for(let i=0;i<4;i++)box('Ventilation louvre',.058,.002,.004,rx,top+.047,z-.028+i*.018,P.steel);
 }
 // Wall strips, framed clerestory windows, roller shutter and personnel door.
 for(let i=0;i<6;i++){
  const px=h.minX+.014+i*.077;
  box('Front vertical panel joint',.002,.17,.0015,px,f+.094,h.maxZ+.00075,P.concrete);
  box('Rear vertical panel joint',.002,.17,.0015,px,f+.094,h.minZ-.00075,P.concrete);
 }
 for(let i=0;i<4;i++){
  const pz=h.minZ+.048+i*.095;
  for(const side of [-1,1]){const px=side<0?h.minX:h.maxX;
   box('Side window frame',.004,.041,.069,px+side*.002,top-.041,pz,P.steel);
   box('Side window glazing',.001,.031,.057,px+side*.0045,top-.041,pz,P.glass);
   box('Side window mullion',.002,.033,.002,px+side*.005,top-.041,pz,P.steel);
  }
 }
 const doorX=.115,doorZ=h.maxZ;
 box('Loading door surround',.137,.145,.007,doorX,f+.0725,doorZ+.0035,P.roof);
 box('Loading shutter',.12,.134,.004,doorX,f+.067,doorZ+.009,P.teal);
 for(let i=1;i<10;i++)box('Shutter horizontal seam',.116,.0015,.001,doorX,f+i*.013,doorZ+.0115,P.steel);
 box('Personnel door frame',.05,.104,.006,.267,f+.052,doorZ+.003,P.roof);
 box('Personnel door leaf',.041,.095,.003,.267,f+.0475,doorZ+.0075,P.teal);
 box('Personnel door handle',.009,.002,.002,.278,f+.048,doorZ+.010,P.steel);
 box('Loading lintel',.152,.011,.018,doorX,f+.151,doorZ+.008,P.red);
 // Stable masonry support joins the retained furnace's base into the slab.
 box('Furnace footing',.225,.021,.225,-.355,f+.0105,-.074,P.concrete);
 // Gray bearing stands meet the left ends of the existing moving rolls.
 const bearingX=.320,gray=0x999d9b;
 for(const [y,z] of METAL_MOTION.rolls){
  const top=y-.004;box('Aligned gray roll bearing stand',.008,top-f,.020,bearingX,(f+top)/2,z,gray);
  const bearing=new T.CylinderGeometry(.009,.009,.008,16).rotateZ(Math.PI/2).translate(bearingX,y,z);
  if(!batches.has(gray))batches.set(gray,[]);batches.get(gray).push(bearing);
 }
 // Classic tapered ingots, stacked 3/2/1 across two rows on supported racks.
 for(const [sx,color] of [[.065,P.steel],[.305,0xb97c54]]){
  for(const dx of [-.07,.07])box('Stock rack bearer',.018,.018,.145,sx+dx,f+.009,.335,P.roof);
  for(let layer=0;layer<3;layer++)for(let col=0;col<3-layer;col++)for(const dz of [-.030,.030]){
   const geometry=ingotGeometry().translate(sx+(col-(2-layer)/2)*.068,f+.018+layer*.022,.335+dz);if(!batches.has(color))batches.set(color,[]);batches.get(color).push(geometry);
  }
 }
 for(const [color,geometries] of batches){const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();const material=new T.MeshStandardMaterial({color,roughness:color===P.steel?.57:.88,metalness:color===P.steel?.25:0});const mesh=new T.Mesh(geometry,material);mesh.name='Hall and foundation material '+color.toString(16);parts.add(mesh);}
 cube.dispose();asset.userData.metalworksRepair={...METAL_REPAIR};return {asset,parts,sourceMesh:imported};
}
export function ingotGeometry(){
 const vertices=[[-.033,0,-.025],[.033,0,-.025],[.033,0,.025],[-.033,0,.025],[-.026,.022,-.020],[.026,.022,-.020],[.026,.022,.020],[-.026,.022,.020]];
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));g.setIndex([0,1,2,0,2,3,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);const flat=g.toNonIndexed();flat.computeVertexNormals();flat.setIndex(Array.from({length:flat.getAttribute('position').count},(_,i)=>i));flat.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(flat.getAttribute('position').count*2),2));g.dispose();return flat;
}
