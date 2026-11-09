import data from './spruce-data.mjs';
// Authored in the user's Blender; this normalized mesh is the synchronous
// instancing derivative of output/models/dark-spruce-v30/dark-spruce.glb.
export function createSpruce(T){
 const root=new T.Group();
 for(const part of data.groups){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(part.positions,3));g.computeVertexNormals();const color=new T.Color().setRGB(...part.color);root.add(new T.Mesh(g,new T.MeshStandardMaterial({color,roughness:.97,flatShading:true})));}
 return root;
}
