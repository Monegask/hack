import * as T from 'three';

export const METAL_MOTION={speed:3.2,rolls:[[-.262,-.003,.018],[-.262,-.05,.018],[-.262,-.125,.018],[-.262,-.19,.018],[-.218,-.062,.022],[-.239,-.19,.021]]};
export function animateMetalworks(asset){
 const mechanics=new T.Group();mechanics.name='Working steel rolling mechanisms';asset.add(mechanics);
 const steel=new T.MeshStandardMaterial({color:0x999d9b,roughness:.47,metalness:.45}),rollers=[];
 for(const [y,z,radius] of METAL_MOTION.rolls){
  const roll=new T.Group();roll.name='Rotating steel roll';roll.position.set(.373,y,z);mechanics.add(roll);rollers.push(roll);
  const drum=new T.Mesh(new T.CylinderGeometry(radius,radius,.098,24),steel);drum.rotation.z=Math.PI/2;roll.add(drum);
  for(let i=0;i<4;i++){const angle=i*Math.PI/2,rib=new T.Mesh(new T.BoxGeometry(.094,.0013,.0013),steel);rib.position.set(0,Math.cos(angle)*radius,Math.sin(angle)*radius);rib.rotation.x=angle;roll.add(rib);}
  // End hubs and restrained witness spokes make axial rotation readable.
  const hub=new T.Mesh(new T.CylinderGeometry(radius*.43,radius*.43,.007,12),steel);hub.rotation.z=Math.PI/2;hub.position.x=.052;roll.add(hub);
  const spoke=new T.Mesh(new T.BoxGeometry(.002,radius*1.3,.0025),steel);spoke.position.x=.056;roll.add(spoke);
 }
 const shell=asset.children.find(o=>o.isMesh),p=shell.geometry.getAttribute('position');let top=-Infinity;for(let i=0;i<p.count;i++)top=Math.max(top,p.getY(i));const origin=new T.Vector3();let count=0;for(let i=0;i<p.count;i++)if(p.getY(i)>top-.005){origin.add(new T.Vector3().fromBufferAttribute(p,i));count++;}origin.divideScalar(count);origin.y=top+.003;
 const smoke=new T.Group();smoke.name='Smoke from metallurgical furnace chimney';asset.add(smoke);
 const puffGeometry=new T.IcosahedronGeometry(.022,1),puffs=Array.from({length:9},()=>{const m=new T.Mesh(puffGeometry,new T.MeshStandardMaterial({color:0xaaa99e,roughness:1,transparent:true,opacity:.35,depthWrite:false}));smoke.add(m);return m;});
 mechanics.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 function update(time,working=true){
  for(const [i,roller] of rollers.entries())roller.rotation.x=time*METAL_MOTION.speed*(i>=4?-1:1);
  smoke.visible=working;
  for(const [i,puff] of puffs.entries()){const u=(time*.18+i/puffs.length)%1;puff.position.copy(origin).add(new T.Vector3(u*.11,u*.30,Math.sin(i*1.7+u*3)*u*.025));puff.scale.setScalar(.50+u*1.6);puff.material.opacity=Math.sin(Math.PI*u)*.42;}
 }
 update(0);return {rollers,mechanics,smoke,puffs,origin,update};
}
