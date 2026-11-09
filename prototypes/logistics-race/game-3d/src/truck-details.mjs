import * as T from 'three';

// Game-only visibility details; the accepted standalone truck stays unchanged.
const orange=new T.MeshStandardMaterial({name:'truck-safety-orange',color:0xf1a553,emissive:0x6f310c,emissiveIntensity:.12,roughness:.58});
const reflector=new T.MeshStandardMaterial({name:'truck-reflective-cream',color:0xe4dbc1,emissive:0xb99a63,emissiveIntensity:.2,roughness:.45});
// Bounded visual compensation; parked trucks keep their existing spacing.
export function truckVisibilityScale(zoom,moving=false){
 const far=Math.max(0,Math.min(1,(1.8-zoom)/1.25));
 return 1+far*(moving?1.2:.18);
}
const cube=new T.BoxGeometry(1,1,1);
export function addTruckAccents(group){
 const part=(w,h,d,x,y,z,mat)=>{const mesh=new T.Mesh(cube,mat);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);};
 for(const side of [-1,1]){part(1.00,.115,.016,-.30,.70,side*.329,orange);part(.37,.065,.016,.56,.49,side*.322,orange);part(.91,.027,.018,-.30,.84,side*.330,reflector);}
 part(.43,.025,.52,.56,.81,0,orange);part(.022,.14,.47,-.845,.65,0,orange);
 part(.028,.035,.50,-.86,.43,0,reflector);
 // Broad top surfaces and raised edges preserve the box/cab silhouette at overview scale.
 part(1.02,.024,.63,-.30,.927,0,reflector);
 part(.54,.024,.61,.56,.812,0,reflector);
 for(const side of [-1,1]){
  part(1.04,.055,.024,-.30,.89,side*.329,reflector);
  part(.028,.50,.024,-.805,.65,side*.329,orange);
 }
 group.userData.visibilityAccents=true;
}

