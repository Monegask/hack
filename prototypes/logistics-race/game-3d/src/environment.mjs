import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLowPolyBush,createLowPolyRock} from '../../../../tools/skills/generate-low-poly-model/scripts/procedural-low-poly-models.js';
import {CELL,world} from './state.mjs';
import {LAND,createTerrainPlan} from './terrain-layout.mjs';
import {createMountainMaterial} from './mountain-surface.mjs';
import {THEME} from './theme.mjs';
import {createSpruce} from './spruce-model.mjs';
import {clearanceSegments,clearanceKey,treeIsClear} from './forest-clearance.mjs';

export function createEnvironment(E,models){
 const plan=createTerrainPlan(E,models),land=plan.land,cx=land.centerX,rx=land.width/2-2,rz=land.depth/2-2,group=new T.Group();group.name='LivingLandscape';
 const material=color=>new T.MeshStandardMaterial({color,roughness:.96,flatShading:true});
 const outline=[];for(let i=0;i<64;i++){const a=i*Math.PI/32,c=Math.cos(a),s=Math.sin(a);outline.push(new T.Vector2(cx+Math.sign(c)*Math.abs(c)**(1/3)*rx,Math.sign(s)*Math.abs(s)**(1/3)*rz));}
 const shape=new T.Shape(outline),soil=new T.ExtrudeGeometry(shape,{depth:.825,bevelEnabled:false}).rotateX(-Math.PI/2).translate(0,-.8,0),base=new T.Mesh(soil,material(THEME.soil));base.receiveShadow=true;group.add(base);
 const surface=new T.Mesh(new T.ShapeGeometry(shape).rotateX(-Math.PI/2).translate(0,LAND.groundY,0),material(THEME.ground));surface.receiveShadow=true;group.add(surface);
 const patches=new Map();for(const p of plan.patches){const points=[];for(let i=0;i<12;i++){const a=i*Math.PI/6,r=1+.14*Math.sin(i*3+p.x),x=p.x+Math.cos(a)*p.rx*r,z=p.z+Math.sin(a)*p.rz*r;if((Math.abs(x-cx)/(rx-.5))**6+(Math.abs(z)/(rz-.5))**6>1)continue;points.push(new T.Vector2(x,-z));}if(points.length<3)continue;const g=new T.ShapeGeometry(new T.Shape(points)).rotateX(-Math.PI/2).translate(0,.026,0);if(!patches.has(p.color))patches.set(p.color,[]);patches.get(p.color).push(g);}
 for(const [i,list] of patches){const m=new T.Mesh(mergeGeometries(list),material(THEME.grass[i]));m.receiveShadow=true;group.add(m);for(const g of list)g.dispose();}
 const knolls=[];for(const h of plan.hills){const vertices=[],indices=[];for(let ring=0;ring<=4;ring++)for(let j=0;j<16;j++){const a=j*Math.PI/8,r=h.r*ring/4,x=h.x+Math.cos(a)*r,z=h.z+Math.sin(a)*r;vertices.push(x,plan.heightAt(x,z)+.008,z);}for(let ring=0;ring<4;ring++)for(let j=0;j<16;j++){const a=ring*16+j,b=ring*16+(j+1)%16,c=a+16,d=b+16;indices.push(a,b,c,b,d,c);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();knolls.push(g.toNonIndexed());g.dispose();}if(knolls.length){const m=new T.Mesh(mergeGeometries(knolls),material(0x405448));m.receiveShadow=true;group.add(m);knolls.forEach(g=>g.dispose());}
 // Continuous faceted mountains share every grid-edge sample with their neighbours.
 const positions=[],colors=[],masks=[],darkStone=Boolean(E.mountainPeaks),stone=(darkStone?[0x3d464b,0x465258,0x566168,0x68747a]:[0xa5a18d,0xb9b39f,0xd0c7b1,0xe4d9c2]).map(x=>new T.Color(x));
 function triangle(points,mountain){const high=Math.max(...points.map(p=>p.y)),low=Math.min(...points.map(p=>p.y)),c=mountain?stone[Math.min(3,Math.floor(high/(darkStone?5:1.75)))].clone():new T.Color(THEME.ground);c.multiplyScalar(1-(high-low)*.018);for(const p of points){positions.push(p.x,p.y,p.z);colors.push(c.r,c.g,c.b);masks.push(mountain?1:0);}}
 function cellQuad(x,z,step,mountain){const p=[[x,z],[x+step,z],[x,z+step],[x+step,z+step]].map(([x,z])=>({x,z,y:mountain?plan.heightAt(x,z):plan.edgeHeightAt(x,z)}));triangle([p[0],p[2],p[1]],mountain);triangle([p[1],p[2],p[3]],mountain);}
 for(const p of E.mountains){const center=world(p),samples=darkStone?12:6,step=CELL/samples;for(let i=0;i<samples;i++)for(let j=0;j<samples;j++)cellQuad(center.x-CELL/2+i*step,center.z-CELL/2+j*step,step,true);}
 for(let x=cx-rx+1;x<cx+rx-1;x+=1)for(let z=-39;z<39;z+=1){if(Math.abs(x-cx)<land.width/2-10&&Math.abs(z)<33)continue;if((Math.abs(x+.5-cx)/(rx-.5))**6+(Math.abs(z+.5)/(rz-.5))**6>.97)continue;cellQuad(x,z,1,false);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('mountainMask',new T.Float32BufferAttribute(masks,1));g.computeVertexNormals();const relief=new T.Mesh(g,darkStone?createMountainMaterial():new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));relief.name='MountainRelief';relief.castShadow=true;relief.receiveShadow=true;group.add(relief);

 const forestBatches=[];
 function instanceFactory(items,factory,params,forest=false){if(!items.length)return;const prototype=factory(T,params);prototype.updateMatrixWorld(true);const batches=new Map();prototype.traverse(o=>{if(!o.isMesh)return;const key=o.material.color.getHex(),geom=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);if(!batches.has(key))batches.set(key,[]);batches.get(key).push(geom);});
  const meshes=[];for(const [color,list] of batches){const geometry=mergeGeometries(list),mesh=new T.InstancedMesh(geometry,material(color),items.length),transform=new T.Object3D();for(const [i,p] of items.entries()){transform.position.set(p.x,p.y,p.z);transform.rotation.set(0,p.yaw,0);if(p.height)transform.scale.set(p.radius,p.height,p.radius);else transform.scale.setScalar(p.scale);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);}mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);for(const g of list)g.dispose();}if(forest)forestBatches.push({items,meshes});prototype.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
 }
 instanceFactory(plan.trees.filter(t=>t.type==='pine'),createSpruce,{},true);
 instanceFactory(plan.rocks,createLowPolyRock,{size:1,color:0x687270});
 instanceFactory(plan.shrubs,createLowPolyBush,{radius:1,color:0x3c5946});
 group.userData.environment={seed:LAND.seed,trees:plan.trees.length,rocks:plan.rocks.length,shrubs:plan.shrubs.length,mountainCells:E.mountains.length,reliefTriangles:positions.length/9};
 let lastKey='';const transform=new T.Object3D();
 function updateClearance(territories){const key=clearanceKey(territories);if(key===lastKey)return;lastKey=key;const segments=clearanceSegments(territories,models);let visible=0;
  for(const {items,meshes} of forestBatches){for(const [i,p] of items.entries()){const show=treeIsClear(p,segments);if(show)visible++;transform.position.set(p.x,p.y,p.z);transform.rotation.set(0,p.yaw,0);transform.scale.set(show?p.radius:0,show?p.height:0,show?p.radius:0);transform.updateMatrix();for(const mesh of meshes)mesh.setMatrixAt(i,transform.matrix);}for(const mesh of meshes){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}}
  group.userData.environment.visibleTrees=visible;
 }
 return {group,plan,updateClearance};
}
