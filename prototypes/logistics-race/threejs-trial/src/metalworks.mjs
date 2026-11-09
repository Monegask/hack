import * as T from 'three';
import {repairMetalworks} from './metalworks-repair.mjs';
// The returned GLB's albedo is grayscale despite its colored generation preview.
// Apply the game's established color/material regions, preserving every vertex.
export function paintMetalworks(asset){
 const meshes=[];asset.traverse(o=>{if(o.isMesh)meshes.push(o);});if(meshes.length!==1)throw Error('Unexpected metalworks source');
 const mesh=meshes[0],source=mesh.geometry,index=source.index,p=source.getAttribute('position');if(index.count!==13605)throw Error('Metalworks palette needs updated regions for this source');
 const positions=[],colors=[],normals=[],v=[new T.Vector3(),new T.Vector3(),new T.Vector3()],normal=new T.Vector3(),sourceNormals=source.getAttribute('normal');
 const planes=[[-.425,-.405,-.36,-.288,-.205,-.17,-.1,-.085,.18,.29,.315],[-.305,-.30,-.268,-.265,-.255,-.25,-.245,-.24,-.23,-.205,-.20,-.18,-.174,-.134,-.106,-.078,-.012,.016,.02,.081,.109,.172],[-.425,-.235,-.18,-.16,-.09,.006,.052,.06,.065,.17,.20,.22]];
 function clip(poly,axis,bound,sign){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p.getComponent(axis)-bound)*sign,db=(b.p.getComponent(axis)-bound)*sign;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t)});}}return out;}
 function paint(x,y,z,n){
  if(y<-.305)return 0x777b72;
  // Rear curb cap shares the ivory curb material; retain teal pipework above it.
  if(y<-.23&&x<-.08&&z<-.18&&(x<-.425||z<-.425))return 0xe9ddc2;
  // Grey steel and copper billets in the foreground stock area.
  if(z>.20&&y<-.245&&x>-.10)return x>.18?0xb97c54:0x919fa0;
  // Open furnace mouth and casting tray.
  if(x>-.405&&x<-.288&&z>.006&&z<.065&&y>-.265&&y<-.174)return 0xef8e33;
  if(x>-.36&&x<-.17&&z>.06&&z<.22&&y<-.25)return 0xc76734;
  // Furnace body with dark refractory bands and chimney.
  if(x<-.205&&z>-.235&&z<.052){if(y>.172||y<-.268||Math.abs(y+.12)<.018||Math.abs(y-.002)<.014||Math.abs(y-.095)<.014)return 0x343c3b;return 0xe9ddc2;}
  // Hall: closed graphite roof, ivory shell, teal loading openings.
  if(x>-.085&&x<.315&&z<-.09){if(y>-.078)return 0x343c3b;if(z>-.16&&y<-.18)return 0x527f86;return 0xeee5d3;}
  // Rolling line, pipe support and service equipment.
  if(x>.29&&z<.17&&y>-.30)return 0x999d9b;
  if(x<-.08&&z<-.18&&y>-.24)return y>.02?0x343c3b:0x527f86;
  if(y<-.255&&Math.abs(n.y)>.7)return 0x777b72;
  return y<-.20?0xe9ddc2:0x343c3b;
 }
 for(let i=0;i<index.count;i+=3){const ids=[0,1,2].map(k=>index.getX(i+k));ids.forEach((id,k)=>v[k].fromBufferAttribute(p,id));normal.subVectors(v[1],v[0]).cross(v[2].clone().sub(v[0])).normalize();let pieces=[ids.map((id,k)=>({p:v[k].clone(),n:new T.Vector3().fromBufferAttribute(sourceNormals,id)}))];
  // Split at material boundaries; do not color a whole long triangle by its center.
  for(let axis=0;axis<3;axis++)for(const bound of planes[axis]){const next=[];for(const poly of pieces){let low=Infinity,high=-Infinity;for(const a of poly){const x=a.p.getComponent(axis);low=Math.min(low,x);high=Math.max(high,x);}if(low>=bound-1e-8||high<=bound+1e-8){next.push(poly);continue;}for(const sign of [-1,1]){const part=clip(poly,axis,bound,sign);if(part.length>=3)next.push(part);}}pieces=next;}
  for(const poly of pieces)for(let k=1;k+1<poly.length;k++){const tri=[poly[0],poly[k],poly[k+1]],center=tri[0].p.clone().add(tri[1].p).add(tri[2].p).multiplyScalar(1/3),color=new T.Color(paint(center.x,center.y,center.z,normal));if(tri[1].p.clone().sub(tri[0].p).cross(tri[2].p.clone().sub(tri[0].p)).lengthSq()<1e-19)continue;for(const a of tri){positions.push(...a.p.toArray());normals.push(...a.n.clone().normalize().toArray());colors.push(color.r,color.g,color.b);}}
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;mesh.material=new T.MeshStandardMaterial({vertexColors:true,roughness:.86,side:T.DoubleSide});mesh.name='Metalworks in ivory, graphite, teal and copper';return asset;
}
export function finishMetalworks(asset){paintMetalworks(asset);repairMetalworks(asset);return asset;}
