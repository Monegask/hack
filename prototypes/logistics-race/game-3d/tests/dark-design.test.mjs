import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../threejs-trial/node_modules/esbuild/lib/main.js';
import {fileURLToPath} from 'node:url';
import RaceWorld from '../../dist/race-world.js';
import Scene from '../../dist/map-scene.js';
import {createTerrainPlan} from '../src/terrain-layout.mjs';
import {clearanceSegments,treeIsClear} from '../src/forest-clearance.mjs';

const bundled=await build({stdin:{contents:"import * as T from 'three'; export {T};export * from './theme.mjs';export * from './active-route.mjs';export * from './spruce-model.mjs';",resolveDir:fileURLToPath(new URL('../src',import.meta.url))},nodePaths:[fileURLToPath(new URL('../../threejs-trial/node_modules',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64')),T=api.T;

test('Roads and actual trips clear dense forest for both territories without changing state or route cost',()=>{
 const w=RaceWorld.create(42),a=w.player.create(),b=w.rival.create(),territories=[{state:a,engine:w.player},{state:b,engine:w.rival}],plan=createTerrainPlan(w.player,Scene.models);
 for(const {state:s,engine:E} of territories){s.paused=false;assert(E.start(s,1,'materials','iron'));for(const p of s.trucks[0].leg.points)s.roads.push(p.join(','));}
 const before=JSON.stringify([a,b]),segments=clearanceSegments(territories,Scene.models),hidden=plan.trees.filter(t=>!treeIsClear(t,segments));assert(hidden.length>0);assert(hidden.some(t=>t.x<57));assert(hidden.some(t=>t.x>57));
 for(const [p,q,width] of segments){const middle={x:(p.x+q.x)/2,z:(p.z+q.z)/2,radius:.7};assert.equal(treeIsClear(middle,segments),false);assert(width>0);}
 assert.equal(JSON.stringify([a,b]),before);
});

test('Material derivatives preserve original assets, distinct accents and animation hierarchy',()=>{
 const source=new T.MeshStandardMaterial({name:'cream',color:0xeee5d3}),accent=new T.MeshStandardMaterial({name:'red',color:0xbe6048}),glass=new T.MeshStandardMaterial({name:'glass',color:0x394b49}),root=new T.Group();
 for(const mat of [source,accent,glass])root.add(new T.Mesh(new T.BoxGeometry(),mat));const clone=root.clone(true),old=source.color.getHex();api.applyIndustrialPalette(clone);
 assert.equal(source.color.getHex(),old);assert.equal(root.children[0].material,source);assert.notEqual(clone.children[0].material,source);assert.equal(clone.children.length,3);assert.equal(clone.children[1].material.color.getHex(),0xd58b4c);assert(clone.children[2].material.emissiveIntensity>.5);
 const again=clone.children[0].material;api.applyIndustrialPalette(clone);assert.equal(clone.children[0].material,again);
});

test('Vertex-coloured quarry keeps its coloured parts and does not tint the canonical geometry',()=>{
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));const cream=new T.Color(0xe7d5b5),orange=new T.Color(0xb95339);g.setAttribute('color',new T.Float32BufferAttribute([...cream.toArray(),...orange.toArray(),...cream.toArray()],3));
 const mesh=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true})),copy=mesh.clone();api.applyIndustrialPalette(copy);assert.notEqual(copy.geometry,g);assert.equal(g.attributes.color.getX(0),Math.fround(cream.r));assert(copy.geometry.attributes.color.getX(0)<cream.r/2);assert(copy.geometry.attributes.color.getX(1)>copy.geometry.attributes.color.getY(1));assert.equal(copy.material.color.getHex(),0xffffff);
});

test('Raw gravel DataTexture is recoloured through its pixel data without calling canvas drawImage',()=>{
 const previous=globalThis.document;globalThis.document={createElement(){throw Error('Raw pixel maps are not CanvasImageSource');}};
 try{const bytes=new Uint8Array([230,219,190,255]),map=new T.DataTexture(bytes,1,1),root=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial({map}));api.applyIndustrialPalette(root);assert.notEqual(root.material.map,map);assert.equal(bytes[0],230);assert(root.material.map.image.data[0]<100);assert.equal(root.material.map.image.data[3],255);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('Selected route follows the paid leg, stays on pause and disappears while drawing or idle',()=>{
 const w=RaceWorld.create(42),E=w.player,s=E.create();s.paused=false;assert(E.start(s,1,'materials','iron'));const before=JSON.stringify(s),p=api.selectedRoutePoints(s,1,E,Scene.models);assert.equal(p.length,s.trucks[0].leg.points.length);for(let i=0;i<p.length;i++){const real=E.travelPoint(s.trucks[0].leg.points[i]);assert.equal(p[i].x,real.x);assert.equal(p[i].z,real.z);}s.paused=true;assert.deepEqual(api.selectedRoutePoints(s,1,E,Scene.models),p);s.paused=false;assert.equal(JSON.stringify(s),before);assert.deepEqual(api.selectedRoutePoints(s,1,E,Scene.models,true),[]);assert.deepEqual(api.selectedRoutePoints(s,2,E,Scene.models),[]);assert.equal(api.activeRoute(p).children[0].geometry.attributes.lineDistance.count,p.length);
});

test('Blender spruce has multiple materials, a grounded trunk and a unit-height instancing derivative',()=>{
 const root=api.createSpruce(T),box=new T.Box3().setFromObject(root);assert.equal(root.children.length,4);assert(Math.abs(box.min.y)<1e-5);assert(Math.abs(box.max.y-1)<1e-5);assert(root.children.every(m=>m.geometry.attributes.normal.count===m.geometry.attributes.position.count));
});
