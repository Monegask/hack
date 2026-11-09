import * as T from 'three';

// Partition only the existing sheave, between the two fixed headframe bearings.
// Exact coordinates belong to ore-mine ks70x8qyykd3xq7xvbwe4ptr6n8hk1dm.
export const ORE_WHEEL={x:-.0107422,y:.3466797,z:.0029297,radius:.152344,halfDepth:.036,speed:1.6};
export function articulateOreMine(asset){
 const imported=[];asset.traverse(o=>{if(o.isMesh)imported.push(o);});if(imported.length!==1)throw Error('Ore mine animation expects original single mesh');
 const mesh=imported[0],g=mesh.geometry,p=g.getAttribute('position'),index=g.index;if(index.count!==14034)throw Error('Ore mine geometry changed; update wheel bounds');
 const names=Object.keys(g.attributes),data=[{},{}];for(const part of data)for(const name of names)part[name]=[];let selected=0;
 for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],wheel=ids.every(id=>Math.hypot(p.getX(id)-ORE_WHEEL.x,p.getY(id)-ORE_WHEEL.y)<=ORE_WHEEL.radius+.004&&Math.abs(p.getZ(id)-ORE_WHEEL.z)<=ORE_WHEEL.halfDepth&&p.getY(id)>.19),part=data[wheel?1:0];if(wheel)selected++;
  for(const id of ids)for(const name of names){const a=g.getAttribute(name),read=['getX','getY','getZ','getW'];for(let k=0;k<a.itemSize;k++)part[name].push(a[read[k]](id));}
 }
 if(selected<60)throw Error('Ore mine wheel segmentation empty');
 const make=i=>{const geometry=new T.BufferGeometry();for(const name of names)geometry.setAttribute(name,new T.Float32BufferAttribute(data[i][name],g.getAttribute(name).itemSize));geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;};
 mesh.geometry=make(0);mesh.name='Fixed mine headframe and machinery';const wheel=new T.Group();wheel.name='Animated original mine hoist wheel';wheel.position.set(ORE_WHEEL.x,ORE_WHEEL.y,ORE_WHEEL.z);const geometry=make(1);geometry.translate(-ORE_WHEEL.x,-ORE_WHEEL.y,-ORE_WHEEL.z);wheel.add(new T.Mesh(geometry,mesh.material));mesh.parent.add(wheel);
 const update=time=>{wheel.rotation.z=-time*ORE_WHEEL.speed;};update(0);return {asset,wheel,stationary:mesh,selectedTriangles:selected,update};
}
