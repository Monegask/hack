import {CELL,ROAD_WIDTH,world,visualCell,networkPoint} from './state.mjs';
import {HUB,hubApproach,placeHub} from './hub-layout.mjs';
import {SITE_LAYOUT} from './site-layout.mjs';
export const LAND={width:116,depth:84,seed:6110619,groundY:.025};
export function terrainBounds(E){return E.worldBounds||{width:116,depth:84,centerX:0,centerZ:0,minX:-58,maxX:58,minZ:-42,maxZ:42};}
export function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);}
export function createTerrainPlan(E,models){
 const land=terrainBounds(E),cx=land.centerX,rx=land.width/2-2,rz=land.depth/2-2,innerX=land.width/2-10,innerZ=land.depth/2-9,scale=land.width/LAND.width;
 let seed=LAND.seed;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const nodes=E.travelNodes||Object.keys(E.positions).map(id=>({id,position:E.positions[id],point:world(visualCell(id,E,models)),size:[SITE_LAYOUT[id].width,SITE_LAYOUT[id].depth],hub:id==='city'||id==='center',mirror:E.hubMirrors?.[id]}));
 const sites=nodes.map(n=>({...n.point,id:n.id,width:n.size[0],depth:n.size[1]})),mountainCells=new Set(E.mountains.map(p=>p.join(','))),edges=[],pipeEdges=[],access=[],boundary=[];
 for(let x=0;x<(E.width||16);x++)for(let z=0;z<(E.height||11);z++)for(const [dx,dz] of [[1,0],[0,1],[1,1],[1,-1]])if(E.canStep([x,z],[x+dx,z+dz])){edges.push([networkPoint([x,z],E,models),networkPoint([x+dx,z+dz],E,models)]);pipeEdges.push([world([x,z]),world([x+dx,z+dz])]);}
 for(const node of nodes.filter(n=>n.hub))for(let n=1;n<=24;n++){const path=hubApproach(world(node.position),n,node.mirror);for(let i=1;i<path.length;i++)access.push([path[i-1],path[i]]);}
 for(const [x,z] of E.mountains){const p=world([x,z]);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!mountainCells.has([x+dx,z+dz].join(','))){const a={x:p.x+dx*CELL/2-dz*CELL/2,z:p.z+dz*CELL/2+dx*CELL/2},b={x:p.x+dx*CELL/2+dz*CELL/2,z:p.z+dz*CELL/2-dx*CELL/2};boundary.push([a,b]);}}
 const insideMountain=(x,z)=>mountainCells.has([Math.round(x/CELL+7.5),Math.round(z/CELL+5)].join(','));
 const peaks=E.mountainPeaks||E.mountains.map(([x,z],i)=>({...world([x,z]),height:4.3+(i*17%7)*.48,rx:5.6,rz:6.9}));
 const peakShapes=peaks.map(p=>({...p,cos:Math.cos(p.height*.37),sin:Math.sin(p.height*.37)}));
 const heightSamples=new Map();
 function edgeHeightAt(x,z){const edge=Math.max(0,Math.min(1,Math.max((Math.abs(x-cx)-innerX)/8,(Math.abs(z)-innerZ)/7)));return LAND.groundY+edge*edge*(1.15+.80*Math.sin(x*.17+z*.11));}
 function heightAt(x,z){const k=x+','+z;if(!heightSamples.has(k))heightSamples.set(k,sampleHeight(x,z));return heightSamples.get(k);}
 function sampleHeight(x,z){
  if(!insideMountain(x,z)){const knoll=hills.reduce((v,h)=>{const d=Math.hypot(x-h.x,z-h.z)/h.r;return v+(d<1?h.height*(.5+.5*Math.cos(d*Math.PI)):0);},0);return edgeHeightAt(x,z)+knoll;}
  const p={x,z},distance=Math.min(...boundary.map(([a,b])=>pointSegmentDistance(p,a,b)));let h=0;
  for(const peak of peakShapes){
   const spread=E.mountainPeaks&&!peak.foot?1.06:1,dx=(x-peak.x)/(peak.rx*spread),dz=(z-peak.z)/(peak.rz*spread),a=dx*peak.cos-dz*peak.sin,b=dx*peak.sin+dz*peak.cos;
   // Unequal, rotated rock faces replace circular cones and rounded shoulders.
   const r=E.mountainPeaks?Math.max(Math.abs(a),Math.abs(a*.5+b*.8660254),Math.abs(a*.5-b*.8660254))*(1+.045*Math.cos(Math.atan2(b,a)*8+peak.height)):Math.hypot(dx,dz);
   const shoulder=Math.max(0,1-r),u=Math.min(1,distance/(E.mountainPeaks?(peak.foot?1.8:7):2)),fade=E.mountainPeaks?u*u*(3-2*u):u;
   h=Math.max(h,peak.height*(E.mountainPeaks?shoulder**(peak.foot?1.12:1.03):shoulder)*fade);
  }
  return LAND.groundY+Math.max(0,h);
 }
 function allowsTree(p,r){
  if(Math.abs(p.x-cx)>land.width/2-2||Math.abs(p.z)>land.depth/2-2)return false;
  if((Math.abs(p.x-cx)/rx)**6+(Math.abs(p.z)/rz)**6>.90)return false;
  // Leave the entire faceted massif clear, including a crown-width margin.
  if(E.mountains.some(q=>{const m=world(q);return Math.abs(p.x-m.x)<CELL/2+r+.4&&Math.abs(p.z-m.z)<CELL/2+r+.4;}))return false;
  if(sites.some(s=>Math.abs(p.x-s.x)<s.width/2+r+1.1&&Math.abs(p.z-s.z)<s.depth/2+r+1.1))return false;
  if(access.some(([a,b])=>pointSegmentDistance(p,a,b)<r+.80))return false;
  return true;
 }
 function allows(p,r){
  if(!allowsTree(p,r))return false;
  // Reserve all legal future edges, not only the roads already built in this save.
  if(edges.some(([a,b])=>pointSegmentDistance(p,a,b)<r+ROAD_WIDTH/2+.10))return false;
  // The pipe can be drawn along any orthogonal grid edge; its offset is +.78 Z.
  if(pipeEdges.some(([a,b])=>pointSegmentDistance(p,{x:a.x,z:a.z+.78},{x:b.x,z:b.z+.78})<r+.20))return false;
  return true;
 }
 const trees=[],rocks=[],shrubs=[],patches=[],hills=[];
 const clusters=Array.from({length:Math.round(15*scale)},()=>({x:cx+(random()-.5)*(land.width-14),z:(random()-.5)*68,r:5+random()*9}));
 // Continuous random sampling creates groves with irregular clearings, without
 // the former rows of tiny trees between every possible future road direction.
 const buckets=new Map(),spacing=1.02,bucketKey=(x,z)=>Math.floor(x/spacing)+','+Math.floor(z/spacing);
 for(let i=0;i<14000*scale;i++){
  const p={x:cx+(random()-.5)*(land.width-5),z:(random()-.5)*78},radius=.56+random()*.35;
  const density=Math.max(...clusters.map(c=>Math.exp(-((p.x-c.x)**2+(p.z-c.z)**2)/(c.r*c.r))))*(.68+.32*Math.sin(p.x*.27+p.z*.13)**2);
  if(random()>density*.72+.025||!allowsTree(p,radius))continue;
  const bx=Math.floor(p.x/spacing),bz=Math.floor(p.z/spacing);let near=false;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const t of buckets.get((bx+dx)+','+(bz+dz))||[])if(Math.hypot(t.x-p.x,t.z-p.z)<spacing)near=true;
  if(near)continue;
  const tree={...p,y:heightAt(p.x,p.z),radius,height:2.7+random()*1.75,type:random()<.93?'pine':'oak',yaw:random()*Math.PI*2};
  trees.push(tree);const key=bucketKey(p.x,p.z);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(tree);
 }
 for(let i=0;i<520*scale;i++){const p={x:cx+(random()-.5)*(land.width-8),z:(random()-.5)*76};if(!allows(p,.13))continue;const y=heightAt(p.x,p.z);if(y>4.4)continue;const a={...p,y,scale:.18+random()*.24,yaw:random()*6.28};if(random()<.32)rocks.push(a);else shrubs.push(a);}
 for(let i=0;i<46*scale;i++)patches.push({x:cx+(random()-.5)*(land.width-11),z:(random()-.5)*74,rx:3+random()*6,rz:2+random()*5,rotation:random()*6.28,color:i%4});
 // Decorative knolls occupy quiet pockets; all legal road and pipe corridors
 // stay on the original plane. These hills have no collision or economy cost.
 for(let i=0;i<1600*scale&&hills.length<18*scale;i++){const p={x:cx+(random()-.5)*(land.width-9),z:(random()-.5)*75},r=.7+random()*2.5;if(allows(p,r)&&hills.every(h=>Math.hypot(h.x-p.x,h.z-p.z)>r+h.r))hills.push({...p,r,height:.25+random()*.65});}
 heightSamples.clear();for(const p of [...trees,...rocks,...shrubs])p.y=heightAt(p.x,p.z);
 return {land,sites,trees,rocks,shrubs,patches,hills,clusters,edges,access,boundary,peaks,heightAt,edgeHeightAt,allows,allowsTree,insideMountain};
}
