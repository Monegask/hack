import * as T from 'three';

// Game-only visibility details; the accepted standalone truck stays unchanged.
const orange=new T.MeshStandardMaterial({name:'truck-safety-orange',color:0xf1a553,emissive:0x6f310c,emissiveIntensity:.12,roughness:.58});
const reflector=new T.MeshStandardMaterial({name:'truck-reflective-cream',color:0xe4dbc1,emissive:0xb99a63,emissiveIntensity:.2,roughness:.45});
const cube=new T.BoxGeometry(1,1,1);
export function addTruckAccents(group){
 const part=(w,h,d,x,y,z,mat)=>{const mesh=new T.Mesh(cube,mat);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);};
 for(const side of [-1,1]){part(1.00,.115,.016,-.30,.70,side*.329,orange);part(.37,.065,.016,.56,.49,side*.322,orange);part(.91,.027,.018,-.30,.84,side*.330,reflector);}
 part(.43,.025,.52,.56,.81,0,orange);part(.022,.14,.47,-.845,.65,0,orange);
 part(.028,.035,.50,-.86,.43,0,reflector);
 group.userData.visibilityAccents=true;
}
