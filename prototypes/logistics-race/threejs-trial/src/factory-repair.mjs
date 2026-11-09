import * as T from 'three';

// Surgical edit of the user-rejected roof/facade on the imported Mint v2 asset.
// Coordinates belong to that immutable GLB, before presentation normalization.
export const FACTORY_REPAIR={roofCut:-.085,frontCut:.30,base:-.3603515923,roofTop:-.025};
const palette={wall:0xeee5d3,roof:0x343c37,door:0x303731,trim:0xbe6048};
function clip(poly,axis,bound,sign){
 const out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p[axis]-bound)*sign,db=(b.p[axis]-bound)*sign;
  if(da>=0)out.push(a);
  if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({p:a.p.map((x,k)=>x+(b.p[k]-x)*t),n:a.n.map((x,k)=>x+(b.n[k]-x)*t),uv:a.uv.map((x,k)=>x+(b.uv[k]-x)*t)});}
 }
 return out;
}
function croppedGeometry(source){
 const pos=source.getAttribute('position'),normal=source.getAttribute('normal'),uv=source.getAttribute('uv'),index=source.index;
 if(!normal||!uv)throw Error('Factory v2 repair expects authored normals and UVs');
 const surfaces=[{p:[],n:[],uv:[]},{p:[],n:[],uv:[]}];
 function emit(poly,material=0){const data=surfaces[material];for(let k=1;k+1<poly.length;k++){
  const tri=[poly[0],poly[k],poly[k+1]],a=new T.Vector3(...tri[0].p),b=new T.Vector3(...tri[1].p),c=new T.Vector3(...tri[2].p);
  if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)continue;
  for(const v of tri){data.p.push(...v.p);const n=new T.Vector3(...v.n).normalize();data.n.push(n.x,n.y,n.z);data.uv.push(...v.uv);}
 }}
 const count=index?.count||pos.count;
 for(let i=0;i<count;i+=3){
  const tri=Array.from({length:3},(_,k)=>{const j=index?index.getX(i+k):i+k;return {p:[pos.getX(j),pos.getY(j),pos.getZ(j)],n:[normal.getX(j),normal.getY(j),normal.getZ(j)],uv:[uv.getX(j),uv.getY(j)]};});
  // Preserve side/back walls and their textures, cutting only the rejected roof/front.
  emit(clip(clip(tri,1,FACTORY_REPAIR.roofCut,-1),2,FACTORY_REPAIR.frontCut,-1));
  // Preserve the chimney above the new flat roof. Its XZ bounds are specific to v2.
  // Only the shaft reaches > .30. Reject roof triangles crossing its XZ footprint.
  let chimney=tri.some(v=>v.p[1]>.30)?clip(tri,1,FACTORY_REPAIR.roofCut,1):[];
  for(const [axis,bound,sign] of [[0,.410,1],[0,.502,-1],[2,-.203,1],[2,-.120,-1]])chimney=clip(chimney,axis,bound,sign);
  // Clean the exposed shaft side: the old texture contains painted sawtooth contacts.
  emit(chimney,Math.abs(tri.reduce((sum,v)=>sum+v.n[1],0)/3)<.7?1:0);
 }
 const geometry=new T.BufferGeometry(),data={p:surfaces.flatMap(s=>s.p),n:surfaces.flatMap(s=>s.n),uv:surfaces.flatMap(s=>s.uv)};geometry.setAttribute('position',new T.Float32BufferAttribute(data.p,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(data.n,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));let start=0;for(const [i,surface] of surfaces.entries()){geometry.addGroup(start,surface.p.length/3,i);start+=surface.p.length/3;}geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
export function repairFactory(asset){
 const imports=[];asset.traverse(o=>{if(o.isMesh)imports.push(o);});
 if(imports.length!==1)throw Error('Factory repair is bound to the single-mesh Mint v2 asset');
 const original=imports[0],bounds=new T.Box3().setFromBufferAttribute(original.geometry.getAttribute('position'));
 if(Math.abs(bounds.max.y-.3603515923)>.001||Math.abs(bounds.min.x+.4990234375)>.001)throw Error('Factory source changed: update repair coordinates before applying');
 original.geometry=croppedGeometry(original.geometry);
 original.material=[original.material,new T.MeshStandardMaterial({color:palette.wall,roughness:.85,side:T.DoubleSide})];
 const group=new T.Group();group.name='Factory roof and aligned loading doors';asset.add(group);
 const materials=new Map();
 function box(name,w,h,d,x,y,z,color){
  if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.85}));
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),materials.get(color));mesh.name=name;mesh.position.set(x,y,z);group.add(mesh);return mesh;
 }
 // A solid closed slab overlaps the clipped shell; no open sawtooth folds remain.
 box('Solid flat roof',1.00,.055,.80,-.003,-.0525,0,palette.roof);
 box('Straight continuous red fascia',1.005,.025,.805,-.003,-.0875,0,palette.trim);
 box('Chimney roof flashing',.11,.01,.103,.456,-.022,-.161,palette.roof);
 // A planar facade replaces the old bowed door reveals; side/back materials remain.
 const base=FACTORY_REPAIR.base,top=-.10;
 box('Planar ivory front wall',.94,top-base,.067,-.012,(base+top)/2,.330,palette.wall);
 for(const [i,x] of [-.245,.185].entries()){
  const width=.338,height=.232,centerY=base+height/2;
  box(`Door ${i+1} solid backing`,width+.022,height+.008,.014,x,centerY+.004,.371,palette.roof);
  box(`Door ${i+1} aligned leaf`,width,height,.012,x,centerY,.383,palette.door);
  box(`Door ${i+1} left jamb`,.012,height+.01,.021,x-width/2-.006,centerY+.005,.387,palette.roof);
  box(`Door ${i+1} right jamb`,.012,height+.01,.021,x+width/2+.006,centerY+.005,.387,palette.roof);
  box(`Door ${i+1} straight lintel`,width+.052,.026,.035,x,base+height+.013,.391,palette.roof);
  box(`Door ${i+1} centre seam`,.002,height-.003,.001,x,centerY,.3895,palette.roof);
 }
 return {asset,parts:group,sourceMesh:original};
}
